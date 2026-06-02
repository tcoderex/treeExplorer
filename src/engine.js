/* ==========================================================================
   FAMILY TREE RECURSIVE ENGINE & DATA STORE
   ========================================================================== */

export class FamilyTreeEngine {
  constructor() {
    this.people = new Map(); // id -> person object
    this.nameToIds = new Map(); // lowercase name -> array of ids (for fuzzy lookup)
    this.tokenToIds = new Map(); // token -> Set of ids (for high-performance search)
  }

  clear(skipSave = false) {
    this.people.clear();
    this.nameToIds.clear();
    this.tokenToIds.clear();
    if (!skipSave && window.api && window.api.db) {
      window.api.db.exec('DELETE FROM people').catch(e => console.error(e));
    }
  }

  // Generate unique ID
  generateId() {
    return 'P-' + Math.floor(100000 + Math.random() * 900000);
  }

  // Load from SQLite Database
  async loadFromDB() {
    if (window.api && window.api.db) {
      try {
        const rows = await window.api.db.all('SELECT * FROM people');
        this.clear(true); // clear without saving to DB
        for (const row of rows) {
          let birthYear = null;
          let deathYear = null;
          let notesText = '';
          if (row.notes) {
            try {
              const extra = JSON.parse(row.notes);
              if (extra && typeof extra === 'object') {
                birthYear = extra.birthYear !== undefined ? extra.birthYear : null;
                deathYear = extra.deathYear !== undefined ? extra.deathYear : null;
                notesText = extra.notesText || '';
              }
            } catch (e) {
              notesText = row.notes;
            }
          }
          const person = {
            id: row.id,
            name: row.name,
            gender: row.gender,
            spouses: row.spouses ? JSON.parse(row.spouses) : [],
            fatherId: row.fatherId,
            fatherName: row.fatherName,
            motherId: row.motherId,
            motherName: row.motherName,
            grandfatherName: row.grandfatherName,
            photo: row.photo || '',
            notes: notesText,
            birthYear: birthYear,
            deathYear: deathYear,
            children: []
          };
          this.people.set(person.id, person);
          this.indexName(person.name, person.id);
        }
        
        // Re-link children arrays based on parent IDs
        this.people.forEach((person, id) => {
          if (person.fatherId) {
            const fNode = this.people.get(person.fatherId);
            if (fNode && !fNode.children.includes(id)) fNode.children.push(id);
          }
          if (person.motherId) {
            const mNode = this.people.get(person.motherId);
            if (mNode && !mNode.children.includes(id)) mNode.children.push(id);
          }
        });
      } catch (err) {
        console.error("Failed to load from SQLite:", err);
      }
    }
  }

  // Save all current data to SQLite Database (Background)
  saveToDB() {
    if (window.api && window.api.db) {
      if (this.saveTimeout) clearTimeout(this.saveTimeout);
      this.saveTimeout = setTimeout(() => {
        const persons = Array.from(this.people.values()).map(p => {
          const notesObj = {
            birthYear: p.birthYear !== undefined ? p.birthYear : null,
            deathYear: p.deathYear !== undefined ? p.deathYear : null,
            notesText: p.notes || ''
          };
          return {
            id: p.id,
            name: p.name,
            gender: p.gender,
            spouses: p.spouses,
            fatherId: p.fatherId,
            fatherName: p.fatherName,
            motherId: p.motherId,
            motherName: p.motherName,
            grandfatherName: p.grandfatherName,
            photo: p.photo,
            notes: JSON.stringify(notesObj)
          };
        });
        window.api.db.batch(persons).catch(err => console.error("SQLite Batch Save Error:", err));
      }, 1000);
    }
  }

  // Register name index
  indexName(name, id) {
    if (!name) return;
    const key = name.trim().toLowerCase();
    if (!this.nameToIds.has(key)) {
      this.nameToIds.set(key, []);
    }
    const ids = this.nameToIds.get(key);
    if (!ids.includes(id)) {
      ids.push(id);
    }
    this.indexNameTokens(name, id);
  }

  // Remove name index
  unindexName(name, id) {
    if (!name) return;
    const key = name.trim().toLowerCase();
    if (this.nameToIds.has(key)) {
      const ids = this.nameToIds.get(key);
      const index = ids.indexOf(id);
      if (index > -1) {
        ids.splice(index, 1);
      }
      if (ids.length === 0) {
        this.nameToIds.delete(key);
      }
    }
    this.unindexNameTokens(name, id);
  }

  // Register name tokens and ID for high-performance searching
  indexNameTokens(name, id) {
    if (!name) return;
    // Index tokens from name
    const tokens = name.toLowerCase().split(/\s+/).filter(t => t.length >= 1);
    tokens.forEach(token => {
      if (!this.tokenToIds.has(token)) {
        this.tokenToIds.set(token, new Set());
      }
      this.tokenToIds.get(token).add(id);
    });
    // Also index the ID itself
    const idToken = id.toLowerCase();
    if (!this.tokenToIds.has(idToken)) {
      this.tokenToIds.set(idToken, new Set());
    }
    this.tokenToIds.get(idToken).add(id);
  }

  // Remove name tokens from index
  unindexNameTokens(name, id) {
    if (!name) return;
    const tokens = name.toLowerCase().split(/\s+/).filter(t => t.length >= 1);
    tokens.forEach(token => {
      if (this.tokenToIds.has(token)) {
        const set = this.tokenToIds.get(token);
        set.delete(id);
        if (set.size === 0) {
          this.tokenToIds.delete(token);
        }
      }
    });
    const idToken = id.toLowerCase();
    if (this.tokenToIds.has(idToken)) {
      const set = this.tokenToIds.get(idToken);
      set.delete(id);
      if (set.size === 0) {
        this.tokenToIds.delete(idToken);
      }
    }
  }

  // Rebuild token index from scratch (used after bulk loads)
  rebuildTokenIndex() {
    this.tokenToIds.clear();
    this.people.forEach((person, id) => {
      this.indexNameTokens(person.name, id);
    });
  }

  // Check if assigning parentId as father of childId would create a cycle
  wouldCreateCycle(childId, parentId) {
    if (!childId || !parentId) return false;
    if (childId === parentId) return true;
    
    let currentId = parentId;
    const visited = new Set();
    while (currentId) {
      if (currentId === childId) return true;
      if (visited.has(currentId)) return true; // cycle already exists
      visited.add(currentId);
      
      const node = this.people.get(currentId);
      currentId = node ? node.fatherId : '';
    }
    return false;
  }

  // Add or update person
  addPerson(data) {
    let { id, name, fatherName, grandfatherName, gender, spouse, motherName, fatherId, grandfatherId, motherId, spouseId, photo, birthYear, deathYear, notes } = data;
    
    if (!name) return null;
    name = name.trim();

    // Parent Gender Self-Healing Layer
    let checkFather = fatherName ? fatherName.trim() : '';
    let checkMother = motherName ? motherName.trim() : '';

    if (checkFather || checkMother) {
      let fNode = checkFather ? this.findPatriarchNode(checkFather) : null;
      let mNode = checkMother ? this.findPatriarchNode(checkMother) : null;

      // Case A: Swapped Mother and Father genders
      if (fNode && fNode.gender === 'F' && mNode && mNode.gender === 'M') {
        const temp = fatherName;
        fatherName = motherName;
        motherName = temp;
      }
      // Case B: Female node specified as Father, Mother is empty
      else if (fNode && fNode.gender === 'F' && !checkMother) {
        motherName = fatherName;
        fatherName = '';
        // Autofill father if mother has a spouse
        if (fNode.spouses && fNode.spouses.length > 0) {
          fatherName = fNode.spouses[0];
        }
      }
      // Case C: Male node specified as Mother, Father is empty
      else if (mNode && mNode.gender === 'M' && !checkFather) {
        fatherName = motherName;
        motherName = '';
        // Autofill mother if father has a spouse
        if (mNode.spouses && mNode.spouses.length > 0) {
          motherName = mNode.spouses[0];
        }
      }
    }
    
    // Normalize gender: case-insensitive, support m/M, f/F, male/female natively
    gender = (gender || 'M').toString().toUpperCase().trim();
    if (gender.startsWith('F')) {
      gender = 'F';
    } else {
      gender = 'M';
    }
    
    // Support spouse parameter as comma-separated or single string
    let spouseList = [];
    if (spouse) {
      spouseList = spouse.split(',').map(s => s.trim()).filter(Boolean);
    }
    
    // 1. Resolve ID or create new
    let isNew = false;
    let person = null;

    // Self-Healing Merger: If ID is not provided, check if a matching placeholder node already exists by name
    if (!id && name) {
      const key = name.trim().toLowerCase();
      const existingIds = this.nameToIds.get(key) || [];
      
      if (existingIds.length > 0) {
        // Resolve father node to check if candidate would cause a cycle
        let fNodeId = '';
        if (fatherName && fatherName.trim()) {
          const fName = fatherName.trim();
          const gfName = grandfatherName ? grandfatherName.trim() : '';
          const fatherNode = fatherId ? this.people.get(fatherId) : this.findFatherNode(fName, gfName);
          if (fatherNode) {
            fNodeId = fatherNode.id;
          }
        }

        // Find if any of the existing IDs can be safely merged without cycle
        let foundMergeId = '';
        for (const candidateId of existingIds) {
          if (!this.wouldCreateCycle(candidateId, fNodeId)) {
            foundMergeId = candidateId;
            break;
          }
        }
        
        if (foundMergeId) {
          id = foundMergeId;
        }
      }
    }

    if (id && this.people.has(id)) {
      person = this.people.get(id);
      // Unindex old name if it's changing
      if (person.name !== name) {
        this.unindexName(person.name, person.id);
        person.name = name;
        this.indexName(name, person.id);
      }
      person.gender = gender;
      if (photo !== undefined) person.photo = photo.trim();
      if (birthYear !== undefined) person.birthYear = birthYear !== null && birthYear !== '' ? parseInt(birthYear) : null;
      if (deathYear !== undefined) person.deathYear = deathYear !== null && deathYear !== '' ? parseInt(deathYear) : null;
      if (notes !== undefined) person.notes = notes;
      
      // Update spouses list
      spouseList.forEach(spName => {
        if (!person.spouses) person.spouses = [];
        if (!person.spouses.includes(spName)) {
          person.spouses.push(spName);
        }
      });
      if (motherName) {
        person.motherName = motherName.trim();
      }
    } else {
      isNew = true;
      id = id || this.generateId();
      // Double check collision
      while (this.people.has(id)) {
        id = this.generateId();
      }
      person = {
        id,
        name,
        gender,
        spouses: spouseList,
        fatherId: '',
        fatherName: fatherName ? fatherName.trim() : '',
        motherId: '',
        motherName: motherName ? motherName.trim() : '',
        grandfatherName: grandfatherName ? grandfatherName.trim() : '',
        photo: photo ? photo.trim() : '',
        birthYear: birthYear !== undefined && birthYear !== null && birthYear !== '' ? parseInt(birthYear) : null,
        deathYear: deathYear !== undefined && deathYear !== null && deathYear !== '' ? parseInt(deathYear) : null,
        notes: notes || '',
        children: []
      };
      this.people.set(id, person);
      this.indexName(name, id);
    }

    // 2. Resolve Father & Grandfather recursively
    let resolvedFatherId = '';

    if (fatherName && fatherName.trim()) {
      const fName = fatherName.trim();
      const gfName = grandfatherName ? grandfatherName.trim() : '';

      // Try to find if this father already exists
      let fatherNode = fatherId ? this.people.get(fatherId) : null;
      if (!fatherNode && !fatherId) {
        fatherNode = this.findFatherNode(fName, gfName);
      }

      // Cycle Prevention: If the father exists, verify it doesn't create a cycle with the child
      if (fatherNode && this.wouldCreateCycle(person.id, fatherNode.id)) {
        fatherNode = null;
      }

      if (!fatherNode) {
        // Create a new father placeholder
        const fId = fatherId || this.generateId();
        fatherNode = {
          id: fId,
          name: fName,
          gender: 'M',
          spouses: [],
          fatherId: '',
          fatherName: gfName,
          grandfatherName: '',
          children: []
        };
        this.people.set(fId, fatherNode);
        this.indexName(fName, fId);

        // Recursively link the new father to the grandfather if provided
        if (gfName) {
          let gfNode = grandfatherId ? this.people.get(grandfatherId) : null;
          if (!gfNode && !grandfatherId) {
            gfNode = this.findPatriarchNode(gfName);
          }
          if (!gfNode) {
            const gfId = grandfatherId || this.generateId();
            gfNode = {
              id: gfId,
              name: gfName,
              gender: 'M',
              spouses: [],
              fatherId: '',
              fatherName: '',
              grandfatherName: '',
              children: []
            };
            this.people.set(gfId, gfNode);
            this.indexName(gfName, gfId);
          }
          fatherNode.fatherId = gfNode.id;
          if (!gfNode.children.includes(fatherNode.id)) {
            gfNode.children.push(fatherNode.id);
          }
        }
      } else {
        // If father exists, make sure grandfather names align
        if (gfName && !fatherNode.fatherId) {
          let gfNode = grandfatherId ? this.people.get(grandfatherId) : null;
          if (!gfNode && !grandfatherId) {
            gfNode = this.findPatriarchNode(gfName);
          }
          if (!gfNode) {
            const gfId = grandfatherId || this.generateId();
            gfNode = {
              id: gfId,
              name: gfName,
              gender: 'M',
              spouses: [],
              fatherId: '',
              fatherName: '',
              grandfatherName: '',
              children: []
            };
            this.people.set(gfId, gfNode);
            this.indexName(gfName, gfId);
          }
          fatherNode.fatherId = gfNode.id;
          fatherNode.fatherName = gfName;
          if (!gfNode.children.includes(fatherNode.id)) {
            gfNode.children.push(fatherNode.id);
          }
        }
      }

      resolvedFatherId = fatherNode.id;
      person.fatherName = fatherNode.name;
      
      // Update grandfather name field based on resolved father structure
      if (fatherNode.fatherId) {
        const gfNode = this.people.get(fatherNode.fatherId);
        person.grandfatherName = gfNode.name;
      } else {
        person.grandfatherName = gfName;
      }
    }

    // Link father to this child
    if (resolvedFatherId) {
      // Remove child link from old father if changing
      if (person.fatherId && person.fatherId !== resolvedFatherId) {
        const oldFather = this.people.get(person.fatherId);
        if (oldFather) {
          oldFather.children = oldFather.children.filter(cid => cid !== person.id);
        }
      }

      person.fatherId = resolvedFatherId;
      const fatherNode = this.people.get(resolvedFatherId);
      if (fatherNode && !fatherNode.children.includes(person.id)) {
        fatherNode.children.push(person.id);
      }
    }

    // 3. Resolve Mother recursively
    let resolvedMotherId = '';

    if (motherName && motherName.trim()) {
      const mName = motherName.trim();
      
      // Try to find if this mother already exists
      let motherNode = motherId ? this.people.get(motherId) : null;
      if (!motherNode && !motherId) {
        motherNode = this.findPatriarchNode(mName);
      }

      if (motherNode && this.wouldCreateCycle(person.id, motherNode.id)) {
        motherNode = null;
      }

      if (!motherNode) {
        const mId = motherId || this.generateId();
        motherNode = {
          id: mId,
          name: mName,
          gender: 'F',
          spouses: fatherName ? [fatherName.trim()] : [],
          fatherId: '',
          fatherName: '',
          grandfatherName: '',
          children: []
        };
        this.people.set(mId, motherNode);
        this.indexName(mName, mId);
      } else {
        if (fatherName && fatherName.trim()) {
          const fName = fatherName.trim();
          if (!motherNode.spouses) motherNode.spouses = [];
          if (!motherNode.spouses.includes(fName)) {
            motherNode.spouses.push(fName);
          }
        }
      }

      resolvedMotherId = motherNode.id;
      person.motherName = motherNode.name;
    }

    // Link mother to this child
    if (resolvedMotherId) {
      if (person.motherId && person.motherId !== resolvedMotherId) {
        const oldMother = this.people.get(person.motherId);
        if (oldMother) {
          oldMother.children = oldMother.children.filter(cid => cid !== person.id);
        }
      }

      person.motherId = resolvedMotherId;
      const motherNode = this.people.get(resolvedMotherId);
      if (motherNode && !motherNode.children.includes(person.id)) {
        motherNode.children.push(person.id);
      }
    }

    // Link parents to each other bidirectionally as spouses
    if (resolvedFatherId && resolvedMotherId) {
      const fatherNode = this.people.get(resolvedFatherId);
      const motherNode = this.people.get(resolvedMotherId);
      if (fatherNode && motherNode) {
        if (!fatherNode.spouses) fatherNode.spouses = [];
        if (!fatherNode.spouses.includes(motherNode.name)) {
          fatherNode.spouses.push(motherNode.name);
        }
        if (!motherNode.spouses) motherNode.spouses = [];
        if (!motherNode.spouses.includes(fatherNode.name)) {
          motherNode.spouses.push(fatherNode.name);
        }
      }
    }

    // Link Spouses bidirectionally
    if (person.spouses && person.spouses.length > 0) {
      person.spouses.forEach(spName => {
        const spouseKey = spName.toLowerCase();
        
        let exactSpouse = spouseId ? this.people.get(spouseId) : null;
        if (!exactSpouse && !spouseId) {
          const matchingIds = this.nameToIds.get(spouseKey) || [];
          const oppositeGender = person.gender === 'M' ? 'F' : 'M';
          exactSpouse = matchingIds.map(sid => this.people.get(sid)).find(sp => sp.gender === oppositeGender);
        }
        
        if (!exactSpouse) {
          // Create a placeholder spouse node
          const sId = spouseId || this.generateId();
          const oppositeGender = person.gender === 'M' ? 'F' : 'M';
          exactSpouse = {
            id: sId,
            name: spName,
            gender: oppositeGender,
            spouses: [person.name],
            fatherId: '',
            fatherName: '',
            grandfatherName: '',
            children: []
          };
          this.people.set(sId, exactSpouse);
          this.indexName(spName, sId);
        } else {
          if (!exactSpouse.spouses) exactSpouse.spouses = [];
          if (!exactSpouse.spouses.includes(person.name)) {
            exactSpouse.spouses.push(person.name);
          }
        }
      });
    }
    this.saveToDB();
    return person;
  }

  // Delete person and clean up references
  deletePerson(id) {
    if (!this.people.has(id)) return false;
    const person = this.people.get(id);

    // Unindex name
    this.unindexName(person.name, id);

    // Remove from father's children list
    if (person.fatherId) {
      const father = this.people.get(person.fatherId);
      if (father) {
        father.children = father.children.filter(cid => cid !== id);
      }
    }

    // Remove from mother's children list
    if (person.motherId) {
      const mother = this.people.get(person.motherId);
      if (mother) {
        mother.children = mother.children.filter(cid => cid !== id);
      }
    }

    // Set children's fatherId/motherId references to empty
    person.children.forEach(cid => {
      const child = this.people.get(cid);
      if (child) {
        if (person.gender === 'M') {
          child.fatherId = '';
          child.fatherName = '';
        } else {
          child.motherId = '';
          child.motherName = '';
        }
      }
    });

    // Remove spouses link
    if (person.spouses && person.spouses.length > 0) {
      person.spouses.forEach(spName => {
        const spouseKey = spName.toLowerCase();
        const matches = this.nameToIds.get(spouseKey) || [];
        matches.forEach(sid => {
          const spouseObj = this.people.get(sid);
          if (spouseObj && spouseObj.spouses) {
            spouseObj.spouses = spouseObj.spouses.filter(name => name !== person.name);
          }
        });
      });
    }

    this.people.delete(id);
    
    if (window.api && window.api.db) {
      window.api.db.run('DELETE FROM people WHERE id = ?', [id]).catch(e => console.error(e));
    }
    this.saveToDB();
    return true;
  }

  // Find a father whose name matches, and who is linked to the specified grandfather
  findFatherNode(fatherName, grandfatherName) {
    const key = fatherName.toLowerCase();
    const ids = this.nameToIds.get(key) || [];
    
    if (ids.length === 0) return null;
    if (ids.length === 1) return this.people.get(ids[0]);

    // If multiple matching names, check their fathers
    if (grandfatherName) {
      const gfKey = grandfatherName.toLowerCase();
      for (const id of ids) {
        const p = this.people.get(id);
        if (p.fatherId) {
          const fatherOfP = this.people.get(p.fatherId);
          if (fatherOfP && fatherOfP.name.toLowerCase() === gfKey) {
            return p;
          }
        } else if (p.fatherName && p.fatherName.toLowerCase() === gfKey) {
          return p;
        }
      }
    }

    // Fallback: return the first one
    return this.people.get(ids[0]);
  }

  // Find any node matching name
  findPatriarchNode(name) {
    const key = name.toLowerCase();
    const ids = this.nameToIds.get(key) || [];
    if (ids.length === 0) return null;
    return this.people.get(ids[0]);
  }

  // Helper to extract optional bracketed/parenthesized ID prefix from name string
  extractIdAndName(str) {
    if (!str) return { id: undefined, name: '' };
    str = str.trim();
    
    const bracketMatch = str.match(/^\[([^\]]+)\]\s*(.+)$/);
    if (bracketMatch) {
      const idCandidate = bracketMatch[1].trim();
      if (/\d/.test(idCandidate)) {
        return { id: idCandidate, name: bracketMatch[2].trim() };
      }
    }
    
    const parenMatch = str.match(/^\(([^)]+)\)\s*(.+)$/);
    if (parenMatch) {
      const idCandidate = parenMatch[1].trim();
      if (/\d/.test(idCandidate)) {
        return { id: idCandidate, name: parenMatch[2].trim() };
      }
    }
    
    // Support numeric/alphanumeric prefix IDs without brackets/parentheses (e.g. '200 hamouda dorbez' or 'rm-1 Robert')
    const leadingIdMatch = str.match(/^([A-Za-z0-9-]+)\s+(.+)$/);
    if (leadingIdMatch) {
      const idCandidate = leadingIdMatch[1].trim();
      // Only extract if it looks like an ID (contains at least one digit and consists of safe characters)
      if (/^\d+$/.test(idCandidate) || (/\d/.test(idCandidate) && /^[A-Za-z0-9-]+$/.test(idCandidate) && idCandidate.length <= 15)) {
        return { id: idCandidate, name: leadingIdMatch[2].trim() };
      }
    }
    
    return { id: undefined, name: str };
  }

  // Smart Lineage Text Parser
  parseLineageText(text) {
    if (!text || !text.trim()) return { count: 0, firstId: null };
    
    const isGender = (str) => {
      if (!str) return false;
      const s = str.trim().toLowerCase();
      return s === 'm' || s === 'f' || s === 'male' || s === 'female';
    };

    const lines = text.split('\n');
    let importedCount = 0;
    let firstId = null;
    
    lines.forEach(line => {
      line = line.trim();
      if (!line || line.startsWith('#')) return; // ignore comments or empty

      let motherName = '';
      const motherMatch = line.match(/\bmother\s+([^,]+)/i);
      if (motherMatch) {
        motherName = motherMatch[1].trim();
        line = line.replace(/\bmother\s+([^,]+)/i, '').trim();
      }

      let id = undefined;
      let name = '';
      let fatherName = '';
      let grandfatherName = '';
      let gender = 'M';
      let spouse = '';

      if (line.includes(',')) {
        // Comma-separated parsing
        const parts = line.split(',').map(p => p.trim());
        
        // Let's check if the first part contains natural language delimiters!
        const firstPart = parts[0];
        const hasDelimiters = /\b(son of|daughter of|s\/o|d\/o|bin|bint|ibn)\b/i.test(firstPart);
        
        if (hasDelimiters) {
          // Mixed format: lineage chain before comma, gender/spouse after!
          let chainGender = 'M';
          if (/\b(daughter of|d\/o|bint)\b/i.test(firstPart)) {
            chainGender = 'F';
          }
          
          const normalized = firstPart
            .replace(/\b(son of|daughter of|s\/o|d\/o|bin|bint|ibn)\b/gi, 'of')
            .split(/\bof\b/i)
            .map(t => t.trim());

          if (normalized.length >= 1) name = normalized[0];
          if (normalized.length >= 2) fatherName = normalized[1];
          if (normalized.length >= 3) grandfatherName = normalized[2];
          
          // Smart gender/spouse identification
          if (parts.length >= 3) {
            if (isGender(parts[1])) {
              gender = parts[1];
              spouse = parts[2] || '';
            } else {
              gender = chainGender;
              spouse = parts[1] || '';
            }
          } else if (parts.length === 2) {
            if (isGender(parts[1])) {
              gender = parts[1];
              spouse = '';
            } else {
              gender = chainGender;
              spouse = parts[1];
            }
          } else {
            gender = chainGender;
            spouse = '';
          }
        } else {
          // Standard CSV formats
          const firstLooksLikeId = parts[0] && /^[A-Za-z0-9-]+$/.test(parts[0]) && parts[0].length <= 25 && parts[0].length >= 1 && /\d/.test(parts[0]);
          
          if (firstLooksLikeId) {
            // CSV with ID: parts[0] is the ID
            id = parts[0];
            const subParts = parts.slice(1);
            
            // Find gender index in subParts (starting at 1 to support ID, Name, Gender, Spouse)
            let subGenderIdx = -1;
            for (let i = 1; i < subParts.length; i++) {
              if (isGender(subParts[i])) {
                subGenderIdx = i;
                break;
              }
            }
            
            name = subParts[0];
            
            if (subGenderIdx === 1) {
              // ID, Name, Gender, Spouse
              fatherName = '';
              grandfatherName = '';
              gender = subParts[1];
              spouse = subParts[2] || '';
            } else if (subGenderIdx === 2) {
              // ID, Name, Father, Gender, Spouse
              fatherName = subParts[1] || '';
              grandfatherName = '';
              gender = subParts[2];
              spouse = subParts[3] || '';
            } else if (subGenderIdx === 3) {
              // ID, Name, Father, Grandfather, Gender, Spouse
              fatherName = subParts[1] || '';
              grandfatherName = subParts[2] || '';
              gender = subParts[3];
              spouse = subParts[4] || '';
            } else {
              // Fallback default
              fatherName = subParts[1] || '';
              grandfatherName = subParts[2] || '';
              gender = subParts[3] || 'M';
              spouse = subParts[4] || '';
            }
          } else {
            // CSV without ID
            let genderIdx = -1;
            for (let i = 1; i < parts.length; i++) {
              if (isGender(parts[i])) {
                genderIdx = i;
                break;
              }
            }
            
            name = parts[0];
            
            if (genderIdx === 1) {
              // Name, Gender, Spouse
              fatherName = '';
              grandfatherName = '';
              gender = parts[1];
              spouse = parts[2] || '';
            } else if (genderIdx === 2) {
              // Name, Father, Gender, Spouse
              fatherName = parts[1] || '';
              grandfatherName = '';
              gender = parts[2];
              spouse = parts[3] || '';
            } else if (genderIdx === 3) {
              // Name, Father, Grandfather, Gender, Spouse
              fatherName = parts[1] || '';
              grandfatherName = parts[2] || '';
              gender = parts[3];
              spouse = parts[4] || '';
            } else {
              // Fallback default
              fatherName = parts[1] || '';
              grandfatherName = parts[2] || '';
              gender = parts[3] || 'M';
              spouse = parts[4] || '';
            }
          }
        }
      } else {
        // Natural language parsing (recursive regex)
        if (/\b(daughter of|d\/o|bint)\b/i.test(line)) {
          gender = 'F';
        }

        // Standardize delimiters
        const normalized = line
          .replace(/\b(son of|daughter of|s\/o|d\/o|bin|bint|ibn)\b/gi, 'of')
          .split(/\bof\b/i)
          .map(t => t.trim());

        if (normalized.length >= 1) name = normalized[0];
        if (normalized.length >= 2) fatherName = normalized[1];
        if (normalized.length >= 3) grandfatherName = normalized[2];
      }

      // Extract optional ID prefixes from all names
      const nameParsed = this.extractIdAndName(name);
      const fatherParsed = this.extractIdAndName(fatherName);
      const gfParsed = this.extractIdAndName(grandfatherName);
      const spouseParsed = this.extractIdAndName(spouse);
      const motherParsed = this.extractIdAndName(motherName);

      id = id || nameParsed.id;
      name = nameParsed.name;
      fatherName = fatherParsed.name;
      grandfatherName = gfParsed.name;
      spouse = spouseParsed.name;
      motherName = motherParsed.name;

      if (name) {
        const p = this.addPerson({
          id,
          name,
          fatherName,
          grandfatherName,
          gender,
          spouse,
          motherName,
          fatherId: fatherParsed.id,
          grandfatherId: gfParsed.id,
          motherId: motherParsed.id,
          spouseId: spouseParsed.id
        });
        if (p && !firstId) {
          firstId = p.id;
        }
        importedCount++;
      }
    });

    return { count: importedCount, firstId };
  }

  // GETTERS & GRAPH METRICS
  
  getPerson(id) {
    return this.people.get(id);
  }

  getAllPeople() {
    return Array.from(this.people.values());
  }

  getRoots() {
    // Patriarchs / Matriarchs who have no recorded parents in the system
    return this.getAllPeople().filter(p => !p.fatherId && !p.motherId);
  }

  getSiblings(id) {
    const person = this.getPerson(id);
    if (!person || !person.fatherId) return [];
    const father = this.getPerson(person.fatherId);
    if (!father) return [];
    return father.children.filter(cid => cid !== id).map(cid => this.getPerson(cid));
  }

  // Get recursive ancestor line (Paternal lineage chain)
  getAncestors(id) {
    const ancestors = [];
    let current = this.getPerson(id);
    while (current && current.fatherId) {
      const father = this.getPerson(current.fatherId);
      if (!father || ancestors.includes(father)) break; // prevent cyclic loops
      ancestors.push(father);
      current = father;
    }
    return ancestors;
  }

  // Get recursive descendants
  getDescendants(id) {
    const descendants = [];
    const queue = [id];
    
    while (queue.length > 0) {
      const currentId = queue.shift();
      const person = this.getPerson(currentId);
      if (person && person.children.length > 0) {
        person.children.forEach(cid => {
          if (!descendants.some(d => d.id === cid)) {
            const child = this.getPerson(cid);
            if (child) {
              descendants.push(child);
              queue.push(cid);
            }
          }
        });
      }
    }
    return descendants;
  }

  // High-performance tokenized search
  searchPeopleByTokens(query) {
    const parts = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return [];

    let resultSet = null;

    for (const part of parts) {
      const partSet = new Set();
      
      // Exact match lookup
      if (this.tokenToIds.has(part)) {
        this.tokenToIds.get(part).forEach(id => partSet.add(id));
      }
      
      // Prefix search on token keys
      if (part.length >= 1) {
        this.tokenToIds.forEach((set, token) => {
          if (token.startsWith(part) && token !== part) {
            set.forEach(id => partSet.add(id));
          }
        });
      }

      if (resultSet === null) {
        resultSet = partSet;
      } else {
        // Intersect sets
        const newSet = new Set();
        partSet.forEach(id => {
          if (resultSet.has(id)) {
            newSet.add(id);
          }
        });
        resultSet = newSet;
      }

      if (resultSet.size === 0) break;
    }

    if (!resultSet || resultSet.size === 0) return [];
    return Array.from(resultSet).map(id => this.people.get(id)).filter(Boolean);
  }

  // Deep recursive generation tree-depth calculator
  getGenerationsHeight() {
    const roots = this.getRoots();
    if (roots.length === 0) return 0;

    const memo = new Map();

    const depth = (nodeId) => {
      if (memo.has(nodeId)) return memo.get(nodeId);
      const node = this.getPerson(nodeId);
      if (!node || node.children.length === 0) return 1;
      
      let maxChildDepth = 0;
      for (const cid of node.children) {
        maxChildDepth = Math.max(maxChildDepth, depth(cid));
      }
      const val = 1 + maxChildDepth;
      memo.set(nodeId, val);
      return val;
    };

    let maxDepth = 0;
    for (const r of roots) {
      maxDepth = Math.max(maxDepth, depth(r.id));
    }
    return maxDepth;
  }

  // Get generation nodes grouped by depth level
  getGenerationsGrid() {
    const roots = this.getRoots();
    const levels = new Map(); // id -> level

    const assignLevel = (nodeId, lvl) => {
      const currentLvl = levels.get(nodeId) || 0;
      if (lvl > currentLvl) {
        levels.set(nodeId, lvl);
        const node = this.getPerson(nodeId);
        if (node) {
          node.children.forEach(cid => assignLevel(cid, lvl + 1));
        }
      }
    };

    roots.forEach(r => assignLevel(r.id, 1));
    return levels;
  }

  // LARGE-SCALE MOCK DATABASE INJECTOR (1,000+ members)
  generateMockTree() {
    this.clear();

    const firstNamesMale = [
      'John', 'William', 'Robert', 'James', 'Charles', 'George', 'Edward', 'Thomas', 'Joseph', 'Henry',
      'Richard', 'David', 'Arthur', 'Albert', 'Frederick', 'Walter', 'Harry', 'Paul', 'Frank', 'Ernest',
      'Alfred', 'Harold', 'Samuel', 'Herbert', 'Louis', 'Clarence', 'Raymond', 'Ralph', 'Roy', 'Carl',
      'Edwin', 'Leonard', 'Francis', 'Michael', 'Daniel', 'Alexander', 'Peter', 'Lawrence', 'Stephen', 'Philip',
      'Oliver', 'Benjamin', 'Andrew', 'Patrick', 'Nicholas', 'Hugh', 'Donald', 'Alan', 'Douglas', 'Kenneth'
    ];

    const firstNamesFemale = [
      'Mary', 'Elizabeth', 'Sarah', 'Margaret', 'Jane', 'Alice', 'Emma', 'Annie', 'Florence', 'Dorothy',
      'Helen', 'Charlotte', 'Clara', 'Louise', 'Grace', 'Rose', 'Martha', 'Frances', 'Marie', 'Ada',
      'Lillian', 'Mabel', 'Edith', 'Evelyn', 'Mildred', 'Gertrude', 'Emily', 'Anna', 'Catherine', 'Gladys',
      'Beatrice', 'Agnes', 'Marion', 'Ida', 'Julia', 'Laura', 'Eleanor', 'Maud', 'Olive', 'Elsie',
      'Lucy', 'Viola', 'Amy', 'Victoria', 'Hilda', 'Ethel', 'Sylvia', 'Jessie', 'Audrey', 'Lydia'
    ];

    const lastNames = ['Smith', 'Miller', 'Davis', 'Wilson', 'Anderson', 'Taylor', 'Thomas', 'White', 'Harris', 'Martin'];

    // Create 3 large patriarch lineages
    const roots = [
      { name: 'William Smith', spouse: 'Mary Miller' },
      { name: 'Edward Anderson', spouse: 'Sarah Taylor' },
      { name: 'Charles White', spouse: 'Elizabeth Harris' }
    ];

    const allAdded = [];

    // Setup helper to pick random names
    const getMaleName = () => firstNamesMale[Math.floor(Math.random() * firstNamesMale.length)];
    const getFemaleName = () => firstNamesFemale[Math.floor(Math.random() * firstNamesFemale.length)];

    // Inject Roots
    const rootNodes = roots.map(r => {
      const birth = 1840 + Math.floor(Math.random() * 20); // 1840 - 1860
      const death = birth + 60 + Math.floor(Math.random() * 30); // lifespan 60-90
      const p = this.addPerson({
        name: r.name,
        gender: 'M',
        spouse: r.spouse,
        birthYear: birth,
        deathYear: death,
        photo: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23ccc"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>'
      });
      
      // Add the spouse to the tree as well!
      const spouseBirth = birth - 5 + Math.floor(Math.random() * 10);
      const spouseDeath = spouseBirth + 60 + Math.floor(Math.random() * 30);
      this.addPerson({
        name: r.spouse,
        gender: 'F',
        spouse: r.name,
        birthYear: spouseBirth,
        deathYear: spouseDeath,
        photo: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23ccc"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>'
      });

      return p;
    });

    let currentGeneration = [...rootNodes];
    let totalTarget = 2050;
    let currentTotal = this.people.size;
    let generationIndex = 1;

    // Loop through generation layers until we hit 1,000+ people
    // Limit to max 7 generations
    while (currentTotal < totalTarget && generationIndex < 7) {
      const nextGen = [];
      const branchFactor = generationIndex === 1 ? 4 : generationIndex === 2 ? 3 : 2; // high branching factors early to scale quickly

      for (const parent of currentGeneration) {
        if (parent.gender === 'F') continue; // parse lineages through father node mapping
        
        // Number of children this parent will have
        // Add random variance
        const numChildren = Math.floor(Math.random() * branchFactor) + (generationIndex < 4 ? 2 : 1);
        
        for (let i = 0; i < numChildren; i++) {
          const gender = Math.random() > 0.5 ? 'M' : 'F';
          const givenName = gender === 'M' ? getMaleName() : getFemaleName();
          
          // Construct full name (GivenName + Father's LastName)
          const lastName = parent.name.split(' ').pop();
          const fullName = `${givenName} ${lastName}`;
          
          // Generate a spouse name
          const sGender = gender === 'M' ? 'F' : 'M';
          const spouseGiven = sGender === 'M' ? getMaleName() : getFemaleName();
          const spouseLast = lastNames[Math.floor(Math.random() * lastNames.length)];
          const spouseName = `${spouseGiven} ${spouseLast}`;

          // Birth/death years for children
          const pBirth = parent.birthYear || 1850;
          const birth = pBirth + 25 + Math.floor(Math.random() * 8); 
          const lifespan = 55 + Math.floor(Math.random() * 38);
          const death = (birth + lifespan > 2026) ? null : (birth + lifespan);

          // Add child
          const childNode = this.addPerson({
            name: fullName,
            fatherName: parent.name,
            grandfatherName: parent.fatherName || '',
            gender: gender,
            spouse: spouseName,
            birthYear: birth,
            deathYear: death,
            photo: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23ccc"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>'
          });

          // Add Spouse as well
          const sBirth = birth - 3 + Math.floor(Math.random() * 6);
          const sLifespan = 55 + Math.floor(Math.random() * 38);
          const sDeath = (sBirth + sLifespan > 2026) ? null : (sBirth + sLifespan);
          this.addPerson({
            name: spouseName,
            gender: sGender,
            spouse: fullName,
            birthYear: sBirth,
            deathYear: sDeath,
            photo: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23ccc"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>'
          });

          nextGen.push(childNode);
        }
      }

      currentGeneration = nextGen;
      currentTotal = this.people.size;
      generationIndex++;

      // If we don't have enough children, break out to avoid infinite loops if parameters fail
      if (nextGen.length === 0) break;
    }

    return this.people.size;
  }

  // HIGH-SCALE MOCK DATABASE INJECTOR (100,000 members)
  generateGiantMockTree(totalSize = 100000) {
    this.clear();

    const maleFirstNames = [
      'John', 'William', 'Robert', 'James', 'Charles', 'George', 'Edward', 'Thomas', 'Joseph', 'Henry',
      'Richard', 'David', 'Arthur', 'Albert', 'Frederick', 'Walter', 'Harry', 'Paul', 'Frank', 'Ernest',
      'Alfred', 'Harold', 'Samuel', 'Herbert', 'Louis', 'Clarence', 'Raymond', 'Ralph', 'Roy', 'Carl'
    ];

    const femaleFirstNames = [
      'Mary', 'Elizabeth', 'Sarah', 'Margaret', 'Jane', 'Alice', 'Emma', 'Annie', 'Florence', 'Dorothy',
      'Helen', 'Charlotte', 'Clara', 'Louise', 'Grace', 'Rose', 'Martha', 'Frances', 'Marie', 'Ada',
      'Lillian', 'Mabel', 'Edith', 'Evelyn', 'Mildred', 'Gertrude', 'Emily', 'Anna', 'Catherine', 'Gladys'
    ];

    const lastNames = ['Smith', 'Miller', 'Davis', 'Wilson', 'Anderson', 'Taylor', 'Thomas', 'White', 'Harris', 'Martin'];

    let currentIdNum = 1;
    
    // Gen 1 Roots
    const rootCount = 50; 
    let activeGen = [];
    
    for (let i = 0; i < rootCount; i++) {
      const fId = `P-${currentIdNum++}`;
      const mId = `P-${currentIdNum++}`;
      
      const lastName = lastNames[i % lastNames.length];
      const fName = `${maleFirstNames[i % maleFirstNames.length]} ${lastName} ${currentIdNum}`;
      const mName = `${femaleFirstNames[i % femaleFirstNames.length]} ${lastName} ${currentIdNum + 1}`;

      const birth = 1800 + Math.floor(Math.random() * 20); // 1800-1820
      const death = birth + 55 + Math.floor(Math.random() * 35); // 55-90 lifespan
      const spouseBirth = birth - 5 + Math.floor(Math.random() * 10);
      const spouseDeath = spouseBirth + 55 + Math.floor(Math.random() * 35);

      const father = {
        id: fId,
        name: fName,
        gender: 'M',
        spouses: [mName],
        fatherId: '',
        fatherName: '',
        motherId: '',
        motherName: '',
        grandfatherName: '',
        birthYear: birth,
        deathYear: death,
        children: []
      };
      const mother = {
        id: mId,
        name: mName,
        gender: 'F',
        spouses: [fName],
        fatherId: '',
        fatherName: '',
        motherId: '',
        motherName: '',
        grandfatherName: '',
        birthYear: spouseBirth,
        deathYear: spouseDeath,
        children: []
      };
      
      this.people.set(fId, father);
      this.people.set(mId, mother);
      this.indexName(fName, fId);
      this.indexName(mName, mId);

      activeGen.push({ fatherId: fId, motherId: mId, lastName });
    }

    // Subsequent Generations
    while (currentIdNum < totalSize) {
      const nextGen = [];
      for (const couple of activeGen) {
        if (currentIdNum >= totalSize) break;
        
        // 2 to 3 children
        const numChildren = Math.floor(Math.random() * 2) + 2; 
        for (let c = 0; c < numChildren; c++) {
          if (currentIdNum >= totalSize) break;
          const gender = Math.random() > 0.5 ? 'M' : 'F';
          const childId = `P-${currentIdNum++}`;
          
          const childGiven = gender === 'M' 
            ? maleFirstNames[currentIdNum % maleFirstNames.length] 
            : femaleFirstNames[currentIdNum % femaleFirstNames.length];
          const childName = `${childGiven} ${couple.lastName} ${currentIdNum}`;
          
          const parentNode = this.people.get(couple.fatherId);
          const pBirth = parentNode ? (parentNode.birthYear || 1810) : 1810;
          const birth = pBirth + 25 + Math.floor(Math.random() * 8); 
          const lifespan = 55 + Math.floor(Math.random() * 35);
          const death = (birth + lifespan > 2026) ? null : (birth + lifespan);

          // Spouse
          if (currentIdNum >= totalSize) {
            // Add single child without spouse
            const childNode = {
              id: childId,
              name: childName,
              gender: gender,
              spouses: [],
              fatherId: couple.fatherId,
              fatherName: this.people.get(couple.fatherId).name,
              motherId: couple.motherId,
              motherName: this.people.get(couple.motherId).name,
              grandfatherName: this.people.get(couple.fatherId).fatherName || '',
              birthYear: birth,
              deathYear: death,
              children: []
            };
            this.people.set(childId, childNode);
            this.indexName(childName, childId);
            this.people.get(couple.fatherId).children.push(childId);
            this.people.get(couple.motherId).children.push(childId);
            break;
          }
          
          const spouseId = `P-${currentIdNum++}`;
          const spouseGender = gender === 'M' ? 'F' : 'M';
          const spouseGiven = spouseGender === 'M' 
            ? maleFirstNames[currentIdNum % maleFirstNames.length] 
            : femaleFirstNames[currentIdNum % femaleFirstNames.length];
          const spouseLastName = lastNames[Math.floor(currentIdNum / 7) % lastNames.length];
          const spouseName = `${spouseGiven} ${spouseLastName} ${currentIdNum}`;

          const spouseBirth = birth - 3 + Math.floor(Math.random() * 6);
          const spouseLifespan = 55 + Math.floor(Math.random() * 35);
          const spouseDeath = (spouseBirth + spouseLifespan > 2026) ? null : (spouseBirth + spouseLifespan);

          const childNode = {
            id: childId,
            name: childName,
            gender: gender,
            spouses: [spouseName],
            fatherId: couple.fatherId,
            fatherName: this.people.get(couple.fatherId).name,
            motherId: couple.motherId,
            motherName: this.people.get(couple.motherId).name,
            grandfatherName: this.people.get(couple.fatherId).fatherName || '',
            birthYear: birth,
            deathYear: death,
            children: []
          };

          const spouseNode = {
            id: spouseId,
            name: spouseName,
            gender: spouseGender,
            spouses: [childName],
            fatherId: '',
            fatherName: '',
            motherId: '',
            motherName: '',
            grandfatherName: '',
            birthYear: spouseBirth,
            deathYear: spouseDeath,
            children: []
          };

          this.people.set(childId, childNode);
          this.people.set(spouseId, spouseNode);
          this.indexName(childName, childId);
          this.indexName(spouseName, spouseId);

          this.people.get(couple.fatherId).children.push(childId);
          this.people.get(couple.motherId).children.push(childId);

          if (gender === 'M') {
            nextGen.push({ fatherId: childId, motherId: spouseId, lastName: couple.lastName });
          } else {
            nextGen.push({ fatherId: spouseId, motherId: childId, lastName: spouseLastName });
          }
        }
      }
      if (nextGen.length === 0) break;
      activeGen = nextGen;
    }

    // Rebuild token index
    this.rebuildTokenIndex();

    return this.people.size;
  }

  // Preset Complete 5-Member Family Tree (Grandfather, Father, Mother, Sibling Son & Daughter)
  generateFiveMemberTree() {
    this.clear();

    // 1. Grandfather (William Miller)
    this.addPerson({
      id: 'P-101',
      name: 'William Miller',
      gender: 'M',
      spouse: 'Jane Miller'
    });

    // Grandmother
    this.addPerson({
      id: 'P-102',
      name: 'Jane Miller',
      gender: 'F',
      spouse: 'William Miller'
    });

    // 2. Father (Robert Miller)
    this.addPerson({
      id: 'P-103',
      name: 'Robert Miller',
      fatherName: 'William Miller',
      grandfatherName: '',
      gender: 'M',
      spouse: 'Mary Miller'
    });

    // Mother
    this.addPerson({
      id: 'P-104',
      name: 'Mary Miller',
      gender: 'F',
      spouse: 'Robert Miller'
    });

    // 3. Focal Son (John Miller)
    const john = this.addPerson({
      id: 'P-105',
      name: 'John Miller',
      fatherName: 'Robert Miller',
      grandfatherName: 'William Miller',
      gender: 'M'
    });

    // 4. Sibling Daughter (Sarah Miller)
    this.addPerson({
      id: 'P-106',
      name: 'Sarah Miller',
      fatherName: 'Robert Miller',
      grandfatherName: 'William Miller',
      gender: 'F'
    });

    return 'P-105'; // Focus on John Miller
  }

  // Modify an existing person and cleanly resolve all parent-child, spouse, and name index changes
  modifyPerson(id, data) {
    if (!this.people.has(id)) return null;
    const person = this.people.get(id);

    let { name, gender, spouses, fatherName, motherName, grandfatherName, photo, birthYear, deathYear, notes } = data;
    name = name.trim();

    // 1. Update Name & Indexing
    if (person.name !== name) {
      this.unindexName(person.name, person.id);
      
      // Update all children's parentName references
      person.children.forEach(cid => {
        const child = this.people.get(cid);
        if (child) {
          if (person.gender === 'M') {
            child.fatherName = name;
          } else {
            child.motherName = name;
          }
        }
      });

      // Update spouses' spouse lists
      const oldName = person.name;
      this.getAllPeople().forEach(p => {
        if (p.spouses && p.spouses.includes(oldName)) {
          p.spouses = p.spouses.map(sn => sn === oldName ? name : sn);
        }
      });

      person.name = name;
      this.indexName(name, person.id);
    }

    // 2. Update Gender & Photo
    gender = (gender || 'M').toString().toUpperCase().trim();
    person.gender = gender === 'F' ? 'F' : 'M';
    if (photo !== undefined) person.photo = photo.trim();
    person.birthYear = birthYear !== undefined && birthYear !== null && birthYear !== '' ? parseInt(birthYear) : null;
    person.deathYear = deathYear !== undefined && deathYear !== null && deathYear !== '' ? parseInt(deathYear) : null;
    if (notes !== undefined) person.notes = notes;

    // 3. Update Spouses
    const spouseList = spouses ? spouses.split(',').map(s => s.trim()).filter(Boolean) : [];
    
    // Remove old spouse bidirectionals
    if (person.spouses) {
      person.spouses.forEach(spName => {
        if (!spouseList.includes(spName)) {
          const spObj = this.findPatriarchNode(spName);
          if (spObj && spObj.spouses) {
            spObj.spouses = spObj.spouses.filter(sn => sn !== person.name);
          }
        }
      });
    }
    person.spouses = spouseList;
    
    // Add new spouse bidirectionals
    spouseList.forEach(spName => {
      const spObj = this.findPatriarchNode(spName);
      if (spObj) {
        if (!spObj.spouses) spObj.spouses = [];
        if (!spObj.spouses.includes(person.name)) {
          spObj.spouses.push(person.name);
        }
      } else {
        // Create placeholder spouse
        const oppositeGender = person.gender === 'M' ? 'F' : 'M';
        const sId = this.generateId();
        const placeholderSp = {
          id: sId,
          name: spName,
          gender: oppositeGender,
          spouses: [person.name],
          fatherId: '',
          fatherName: '',
          grandfatherName: '',
          children: []
        };
        this.people.set(sId, placeholderSp);
        this.indexName(spName, sId);
      }
    });

    // 4. Update Father Link
    fatherName = fatherName ? fatherName.trim() : '';
    if (fatherName) {
      let fatherNode = this.findFatherNode(fatherName, grandfatherName);
      if (fatherNode && this.wouldCreateCycle(person.id, fatherNode.id)) {
        fatherNode = null; // Prevent cycle creation
      }

      if (!fatherNode) {
        const fId = this.generateId();
        fatherNode = {
          id: fId,
          name: fatherName,
          gender: 'M',
          spouses: [],
          fatherId: '',
          fatherName: grandfatherName,
          grandfatherName: '',
          children: []
        };
        this.people.set(fId, fatherNode);
        this.indexName(fatherName, fId);
        
        // Link to grandfather if provided
        if (grandfatherName) {
          let gfNode = this.findPatriarchNode(grandfatherName);
          if (!gfNode) {
            const gfId = this.generateId();
            gfNode = {
              id: gfId,
              name: grandfatherName,
              gender: 'M',
              spouses: [],
              fatherId: '',
              fatherName: '',
              grandfatherName: '',
              children: []
            };
            this.people.set(gfId, gfNode);
            this.indexName(grandfatherName, gfId);
          }
          fatherNode.fatherId = gfNode.id;
          if (!gfNode.children.includes(fatherNode.id)) {
            gfNode.children.push(fatherNode.id);
          }
        }
      }

      // Check if father changed
      if (person.fatherId !== fatherNode.id) {
        if (person.fatherId) {
          const oldF = this.people.get(person.fatherId);
          if (oldF) oldF.children = oldF.children.filter(cid => cid !== person.id);
        }
        person.fatherId = fatherNode.id;
        person.fatherName = fatherNode.name;
        if (!fatherNode.children.includes(person.id)) {
          fatherNode.children.push(person.id);
        }
      }
      
      // Update grandfather
      if (grandfatherName) {
        let gfNode = this.findPatriarchNode(grandfatherName);
        if (!gfNode) {
          const gfId = this.generateId();
          gfNode = {
            id: gfId,
            name: grandfatherName,
            gender: 'M',
            spouses: [],
            fatherId: '',
            fatherName: '',
            grandfatherName: '',
            children: []
          };
          this.people.set(gfId, gfNode);
          this.indexName(grandfatherName, gfId);
        }
        fatherNode.fatherId = gfNode.id;
        fatherNode.fatherName = gfNode.name;
        person.grandfatherName = gfNode.name;
        if (!gfNode.children.includes(fatherNode.id)) {
          gfNode.children.push(fatherNode.id);
        }
      } else {
        fatherNode.fatherId = '';
        fatherNode.fatherName = '';
        person.grandfatherName = '';
      }
    } else {
      // Unlink father
      if (person.fatherId) {
        const oldF = this.people.get(person.fatherId);
        if (oldF) oldF.children = oldF.children.filter(cid => cid !== person.id);
      }
      person.fatherId = '';
      person.fatherName = '';
      person.grandfatherName = '';
    }

    // 5. Update Mother Link
    motherName = motherName ? motherName.trim() : '';
    if (motherName) {
      let motherNode = this.findPatriarchNode(motherName);
      if (motherNode && this.wouldCreateCycle(person.id, motherNode.id)) {
        motherNode = null;
      }

      if (!motherNode) {
        const mId = this.generateId();
        motherNode = {
          id: mId,
          name: motherName,
          gender: 'F',
          spouses: fatherName ? [fatherName] : [],
          fatherId: '',
          fatherName: '',
          grandfatherName: '',
          children: []
        };
        this.people.set(mId, motherNode);
        this.indexName(motherName, mId);
      }

      // Check if mother changed
      if (person.motherId !== motherNode.id) {
        if (person.motherId) {
          const oldM = this.people.get(person.motherId);
          if (oldM) oldM.children = oldM.children.filter(cid => cid !== person.id);
        }
        person.motherId = motherNode.id;
        person.motherName = motherNode.name;
        if (!motherNode.children.includes(person.id)) {
          motherNode.children.push(person.id);
        }
      }
    } else {
      // Unlink mother
      if (person.motherId) {
        const oldM = this.people.get(person.motherId);
        if (oldM) oldM.children = oldM.children.filter(cid => cid !== person.id);
      }
      person.motherId = '';
      person.motherName = '';
    }

    // 6. Recalculate spouse lists on parents
    if (person.fatherId && person.motherId) {
      const fNode = this.people.get(person.fatherId);
      const mNode = this.people.get(person.motherId);
      if (fNode && mNode) {
        if (!fNode.spouses) fNode.spouses = [];
        if (!fNode.spouses.includes(mNode.name)) fNode.spouses.push(mNode.name);
        if (!mNode.spouses) mNode.spouses = [];
        if (!mNode.spouses.includes(fNode.name)) mNode.spouses.push(fNode.name);
      }
    }

    this.saveToDB();
    return person;
  }

  // Import local stored data
  importDatabase(data) {
    if (!Array.isArray(data)) return false;
    this.clear();
    data.forEach(p => {
      const spouses = Array.isArray(p.spouses) ? p.spouses : (p.spouse ? p.spouse.split(',').map(s=>s.trim()).filter(Boolean) : []);
      this.people.set(p.id, {
        id: p.id,
        name: p.name,
        gender: p.gender || 'M',
        spouses: spouses,
        fatherId: p.fatherId || '',
        fatherName: p.fatherName || '',
        motherId: p.motherId || '',
        motherName: p.motherName || '',
        grandfatherName: p.grandfatherName || '',
        children: Array.isArray(p.children) ? p.children : []
      });
      this.indexName(p.name, p.id);
    });
    return true;
  }

  // Rename a person's ID throughout the system
  renamePersonId(oldId, newId) {
    if (oldId === newId) return true;
    if (!this.people.has(oldId)) return false;
    if (this.people.has(newId)) return false; // ID collision

    const person = this.people.get(oldId);
    
    // 1. Swap map keys
    this.people.delete(oldId);
    person.id = newId;
    this.people.set(newId, person);

    // 2. Update relationship references in all people
    this.people.forEach(p => {
      if (p.fatherId === oldId) p.fatherId = newId;
      if (p.motherId === oldId) p.motherId = newId;
      if (p.children && p.children.includes(oldId)) {
        p.children = p.children.map(cid => cid === oldId ? newId : cid);
      }
    });

    // 3. Update nameToIds mapping
    const key = person.name.trim().toLowerCase();
    const ids = this.nameToIds.get(key);
    if (ids) {
      this.nameToIds.set(key, ids.map(cid => cid === oldId ? newId : cid));
    }

    // 4. Rebuild token index
    this.rebuildTokenIndex();

    return true;
  }

  // Import local stored data by merging and upgrading
  mergeDatabase(data) {
    if (!Array.isArray(data)) return false;
    data.forEach(p => {
      const spouses = Array.isArray(p.spouses) ? p.spouses : (p.spouse ? p.spouse.split(',').map(s=>s.trim()).filter(Boolean) : []);
      
      if (this.people.has(p.id)) {
        const existing = this.people.get(p.id);
        existing.name = p.name || existing.name;
        existing.gender = p.gender || existing.gender;
        
        // Merge spouses
        spouses.forEach(s => {
          if (!existing.spouses) existing.spouses = [];
          if (!existing.spouses.includes(s)) existing.spouses.push(s);
        });
        
        // Merge children
        const children = Array.isArray(p.children) ? p.children : [];
        children.forEach(c => {
          if (!existing.children) existing.children = [];
          if (!existing.children.includes(c)) existing.children.push(c);
        });

        if (p.fatherId) existing.fatherId = p.fatherId;
        if (p.fatherName) existing.fatherName = p.fatherName;
        if (p.motherId) existing.motherId = p.motherId;
        if (p.motherName) existing.motherName = p.motherName;
        if (p.grandfatherName) existing.grandfatherName = p.grandfatherName;

        this.indexName(existing.name, existing.id);
      } else {
        this.people.set(p.id, {
          id: p.id,
          name: p.name,
          gender: p.gender || 'M',
          spouses: spouses,
          fatherId: p.fatherId || '',
          fatherName: p.fatherName || '',
          motherId: p.motherId || '',
          motherName: p.motherName || '',
          grandfatherName: p.grandfatherName || '',
          children: Array.isArray(p.children) ? p.children : []
        });
        this.indexName(p.name, p.id);
      }
    });

    this.rebuildTokenIndex();
    return true;
  }

  // Feature 4: Relationship Path Finder
  findRelationshipPath(startId, endId) {
    if (!this.people.has(startId) || !this.people.has(endId)) return null;
    
    // Build adjacency list for undirected graph traversal
    const graph = new Map();
    const addEdge = (u, v) => {
      if (!u || !v) return;
      if (!graph.has(u)) graph.set(u, new Set());
      if (!graph.has(v)) graph.set(v, new Set());
      graph.get(u).add(v);
      graph.get(v).add(u);
    };

    for (const p of this.people.values()) {
      if (p.fatherId) addEdge(p.id, p.fatherId);
      if (p.motherId) addEdge(p.id, p.motherId);
      for (const sp of p.spouses || []) {
        if (sp) {
          const spouseNode = this.findPatriarchNode(sp);
          if (spouseNode) {
            addEdge(p.id, spouseNode.id);
          }
        }
      }
      for (const ch of p.children || []) {
        if (ch) addEdge(p.id, ch);
      }
    }

    // BFS
    const queue = [[startId]];
    const visited = new Set([startId]);

    while (queue.length > 0) {
      const path = queue.shift();
      const current = path[path.length - 1];

      if (current === endId) return path;

      const neighbors = graph.get(current) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push([...path, neighbor]);
        }
      }
    }

    return null; // No path found
  }
}
