/* ==========================================================================
   FAMILY TREE RECURSIVE ENGINE & DATA STORE
   ========================================================================== */

export class FamilyTreeEngine {
  constructor() {
    this.people = new Map(); // id -> person object
    this.relationships = []; // array of relationship edge objects
    this.nameToIds = new Map(); // lowercase name -> array of ids (for fuzzy lookup)
    this.tokenToIds = new Map(); // token -> Set of ids (for high-performance search)
    try {
      this.ignoredSuggestions = new Set(JSON.parse(localStorage.getItem('ignoredSuggestions') || '[]'));
    } catch (e) {
      this.ignoredSuggestions = new Set();
    }
  }

  ignoreSuggestion(signature) {
    this.ignoredSuggestions.add(signature);
    localStorage.setItem('ignoredSuggestions', JSON.stringify(Array.from(this.ignoredSuggestions)));
  }

  restoreSuggestion(signature) {
    this.ignoredSuggestions.delete(signature);
    if (signature.startsWith('Spouse_') || signature.startsWith('Sibling_')) {
      const parts = signature.split('_');
      if (parts.length === 3) {
        this.ignoredSuggestions.delete(`${parts[0]}_${parts[2]}_${parts[1]}`);
      }
    }
    localStorage.setItem('ignoredSuggestions', JSON.stringify(Array.from(this.ignoredSuggestions)));
  }

  clear(skipSave = false) {
    this.people.clear();
    this.relationships = [];
    this.nameToIds.clear();
    this.tokenToIds.clear();
    if (!skipSave && window.api && window.api.db) {
      window.api.db.exec('DELETE FROM people; DELETE FROM relationships').catch(e => console.error(e));
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
        const relRows = await window.api.db.all('SELECT * FROM relationships');
        
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
            firstName: row.firstName,
            familyName: row.familyName || '',
            gender: row.gender,
            spouses: [],
            fatherId: '',
            fatherName: '',
            motherId: '',
            motherName: '',
            grandfatherName: '',
            photo: row.photo || '',
            notes: notesText,
            birthYear: birthYear,
            deathYear: deathYear,
            children: [],
            siblings: [],
            customRelations: {}
          };
          
          // Fallback property getter for backwards-compatible UI name reading
          Object.defineProperty(person, 'name', {
            get: function() { return (this.firstName + (this.familyName ? ' ' + this.familyName : '')).trim(); },
            set: function(val) {
              const parts = val.trim().split(' ');
              if (parts.length > 1) {
                this.familyName = parts.pop();
                this.firstName = parts.join(' ');
              } else {
                this.firstName = val;
                this.familyName = '';
              }
            }
          });
          
          this.people.set(person.id, person);
          this.indexName(person.name, person.id);
        }
        
        // Apply relationships from Universal Relationship Manager
        for (const rel of relRows) {
          this.relationships.push(rel);
          const p1 = this.people.get(rel.person1Id);
          const p2 = this.people.get(rel.person2Id);
          
          if (rel.type === 'parent-child') {
            if (p2 && p1) {
              if (p1.gender === 'M') {
                 p2.fatherId = p1.id;
                 p2.fatherName = p1.name;
              } else if (p1.gender === 'F') {
                 p2.motherId = p1.id;
                 p2.motherName = p1.name;
              }
              if (!p1.children.includes(p2.id)) p1.children.push(p2.id);
            }
          } else if (rel.type === 'spouse') {
             if (p1 && p2) {
               if (!p1.spouses.includes(p2.name)) p1.spouses.push(p2.name);
               if (!p2.spouses.includes(p1.name)) p2.spouses.push(p1.name);
             }
          } else if (rel.type === 'sibling') {
             if (p1 && p2) {
               if (!p1.siblings.includes(p2.id)) p1.siblings.push(p2.id);
               if (!p2.siblings.includes(p1.id)) p2.siblings.push(p1.id);
             }
          } else if (rel.type === 'custom') {
             if (p1 && p2) {
                let meta = {};
                try { meta = JSON.parse(rel.metadata); } catch(e){}
                p1.customRelations[p2.id] = meta.subtype || 'custom';
             }
          }
        }
        
        // Update grandfather names based on constructed father relations
        this.people.forEach((person) => {
          if (person.fatherId) {
             const fNode = this.people.get(person.fatherId);
             if (fNode && fNode.fatherId) {
               const gfNode = this.people.get(fNode.fatherId);
               if (gfNode) person.grandfatherName = gfNode.name;
             }
          }
        });

      } catch (err) {
        console.error("Failed to load from SQLite:", err);
      }
    }
  }

  // Save all current data to SQLite Database (Background)
  saveToDB() {
    if (typeof window !== 'undefined' && window.api && window.api.db) {
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
            firstName: p.firstName,
            familyName: p.familyName,
            gender: p.gender,
            photo: p.photo,
            notes: JSON.stringify(notesObj)
          };
        });

        const relationships = [];
        const addedRels = new Set();
        const generateId = () => Math.random().toString(36).substring(2, 11);
        
        const addRel = (p1, p2, type, meta) => {
          if(!p1 || !p2) return;
          const key = p1 < p2 ? `${p1}-${p2}-${type}` : `${p2}-${p1}-${type}`;
          if (type === 'parent-child') {
            const dirKey = `${p1}-${p2}-${type}`;
            if (!addedRels.has(dirKey)) {
              relationships.push({ id: generateId(), person1Id: p1, person2Id: p2, type, metadata: meta || {} });
              addedRels.add(dirKey);
            }
          } else {
            if (!addedRels.has(key)) {
              const min = p1 < p2 ? p1 : p2;
              const max = p1 < p2 ? p2 : p1;
              relationships.push({ id: generateId(), person1Id: min, person2Id: max, type, metadata: meta || {} });
              addedRels.add(key);
            }
          }
        };

        this.people.forEach(p => {
          if (p.fatherId) addRel(p.fatherId, p.id, 'parent-child');
          if (p.motherId) addRel(p.motherId, p.id, 'parent-child');
          if (p.spouses) {
            p.spouses.forEach(spName => {
               const oppGender = p.gender === 'M' ? 'F' : 'M';
               let matchingIds = this.nameToIds.get(spName.toLowerCase()) || [];
               let sNode = matchingIds.map(id => this.people.get(id)).find(node => node.gender === oppGender);
               if (sNode) addRel(p.id, sNode.id, 'spouse');
            });
          }
          if (p.siblings) {
            p.siblings.forEach(sId => addRel(p.id, sId, 'sibling'));
          }
          if (p.customRelations) {
            Object.entries(p.customRelations).forEach(([rid, subtype]) => {
               addRel(p.id, rid, 'custom', { subtype });
            });
          }
        });
        
        this.relationships = relationships;
        window.api.db.batch({ persons, relationships }).catch(err => console.error("SQLite Batch Save Error:", err));
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

  _applyRelativeData(person, relativesData) {
    if (!relativesData) return;
    
    if (relativesData.father && person.fatherId) {
       const node = this.people.get(person.fatherId);
       if (node) {
          const rd = relativesData.father;
          if (rd.birthYear) node.birthYear = parseInt(rd.birthYear);
          if (rd.deathYear) node.deathYear = parseInt(rd.deathYear);
          if (rd.photo) node.photo = rd.photo;
       }
    }
    
    if (relativesData.grandfather && person.fatherId) {
       const fNode = this.people.get(person.fatherId);
       if (fNode && fNode.fatherId) {
          const gfNode = this.people.get(fNode.fatherId);
          if (gfNode) {
             const rd = relativesData.grandfather;
             if (rd.birthYear) gfNode.birthYear = parseInt(rd.birthYear);
             if (rd.deathYear) gfNode.deathYear = parseInt(rd.deathYear);
             if (rd.photo) gfNode.photo = rd.photo;
          }
       }
    }

    if (relativesData.mother && person.motherId) {
       const node = this.people.get(person.motherId);
       if (node) {
          const rd = relativesData.mother;
          if (rd.birthYear) node.birthYear = parseInt(rd.birthYear);
          if (rd.deathYear) node.deathYear = parseInt(rd.deathYear);
          if (rd.photo) node.photo = rd.photo;
       }
    }

    if (relativesData.spouse && person.spouses && person.spouses.length > 0) {
       person.spouses.forEach((spouseName, index) => {
          const spouseIds = this.nameToIds.get(spouseName.toLowerCase()) || [];
          if (spouseIds.length > 0) {
             const sNode = this.people.get(spouseIds[0]);
             if (sNode && relativesData.spouse[index]) {
                const rd = relativesData.spouse[index];
                if (rd.birthYear) sNode.birthYear = parseInt(rd.birthYear);
                if (rd.deathYear) sNode.deathYear = parseInt(rd.deathYear);
                if (rd.photo) sNode.photo = rd.photo;
             }
          }
       });
    }

    if (relativesData.siblings && person.siblings && person.siblings.length > 0) {
       person.siblings.forEach((siblingId, index) => {
          const sNode = this.people.get(siblingId);
          if (sNode && relativesData.siblings[index]) {
             const rd = relativesData.siblings[index];
             if (rd.birthYear) sNode.birthYear = parseInt(rd.birthYear);
             if (rd.deathYear) sNode.deathYear = parseInt(rd.deathYear);
             if (rd.photo) sNode.photo = rd.photo;
          }
       });
    }
  }

  // Add or update person
  addPerson(data) {
    let { id, name, firstName, familyName, fatherName, grandfatherName, gender, spouse, motherName, fatherId, grandfatherId, motherId, spouseId, photo, birthYear, deathYear, notes, siblings, relativesData } = data;
    
    if (relativesData) {
      if (relativesData.father && relativesData.father.id) fatherId = relativesData.father.id;
      if (relativesData.mother && relativesData.mother.id) motherId = relativesData.mother.id;
      if (relativesData.grandfather && relativesData.grandfather.id) grandfatherId = relativesData.grandfather.id;
    }
    
    if (name && !firstName) {
      const parts = name.trim().split(' ');
      if (parts.length > 1) {
        familyName = parts.pop();
        firstName = parts.join(' ');
      } else {
        firstName = name.trim();
        familyName = '';
      }
    } else if (firstName) {
      name = (firstName.trim() + ' ' + (familyName || '').trim()).trim();
    }
    
    if (!name) return null;
    name = name.trim();
    firstName = firstName ? firstName.trim() : '';
    familyName = familyName ? familyName.trim() : '';

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
    
    // Support siblings parameter
    let siblingList = [];
    if (siblings) {
      siblingList = siblings.split(',').map(s => s.trim()).filter(Boolean);
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
        person.firstName = firstName;
        person.familyName = familyName;
        person.name = name; // legacy property update if needed
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
        firstName,
        familyName,
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
        children: [],
        siblings: [],
        customRelations: {}
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
      person.spouses.forEach((spName, index) => {
        const spouseKey = spName.toLowerCase();
        
        const rd = relativesData && relativesData.spouse && relativesData.spouse[index] ? relativesData.spouse[index] : null;
        const currentSpouseId = (rd && rd.id) ? rd.id : (index === 0 ? spouseId : null);
        
        let exactSpouse = currentSpouseId ? this.people.get(currentSpouseId) : null;
        if (!exactSpouse && !currentSpouseId) {
          const matchingIds = this.nameToIds.get(spouseKey) || [];
          const oppositeGender = person.gender === 'M' ? 'F' : 'M';
          exactSpouse = matchingIds.map(sid => this.people.get(sid)).find(sp => sp.gender === oppositeGender);
        }
        
        if (!exactSpouse) {
          // Create a placeholder spouse node
          const sId = currentSpouseId || this.generateId();
          const oppositeGender = person.gender === 'M' ? 'F' : 'M';
          exactSpouse = {
            id: sId,
            name: spName,
            gender: (rd && rd.gender) ? rd.gender : oppositeGender,
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

    // Link Siblings bidirectionally and sync parents
    if (siblingList && siblingList.length > 0) {
      siblingList.forEach((sibName, index) => {
        const sibKey = sibName.toLowerCase();
        const rd = relativesData && relativesData.siblings && relativesData.siblings[index] ? relativesData.siblings[index] : null;
        const currentSiblingId = (rd && rd.id) ? rd.id : null;
        
        let exactSibling = currentSiblingId ? this.people.get(currentSiblingId) : this.findPatriarchNode(sibKey);
        
        if (!exactSibling) {
          // Create placeholder sibling
          const sId = currentSiblingId || this.generateId();
          exactSibling = {
            id: sId,
            name: sibName,
            gender: (rd && rd.gender) ? rd.gender : 'M', // default placeholder gender
            spouses: [],
            fatherId: person.fatherId,
            fatherName: person.fatherName,
            motherId: person.motherId,
            motherName: person.motherName,
            grandfatherName: person.grandfatherName,
            children: [],
            siblings: [person.id],
            customRelations: {}
          };
          this.people.set(sId, exactSibling);
          this.indexName(sibName, sId);
        } else {
          if (!exactSibling.siblings) exactSibling.siblings = [];
          if (!exactSibling.siblings.includes(person.id)) {
            exactSibling.siblings.push(person.id);
          }
          // Sync parents if missing
          if (!exactSibling.fatherId && person.fatherId) {
             exactSibling.fatherId = person.fatherId;
             exactSibling.fatherName = person.fatherName;
             exactSibling.grandfatherName = person.grandfatherName;
             const fatherNode = this.people.get(person.fatherId);
             if (fatherNode && !fatherNode.children.includes(exactSibling.id)) fatherNode.children.push(exactSibling.id);
          }
          if (!exactSibling.motherId && person.motherId) {
             exactSibling.motherId = person.motherId;
             exactSibling.motherName = person.motherName;
             const motherNode = this.people.get(person.motherId);
             if (motherNode && !motherNode.children.includes(exactSibling.id)) motherNode.children.push(exactSibling.id);
          }
        }
        
        if (!person.siblings) person.siblings = [];
        if (!person.siblings.includes(exactSibling.id)) {
          person.siblings.push(exactSibling.id);
        }
      });
    }

    this._applyRelativeData(person, data.relativesData);
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

    // Remove sibling links
    if (person.siblings && person.siblings.length > 0) {
      person.siblings.forEach(sibId => {
        const sib = this.people.get(sibId);
        if (sib && sib.siblings) {
          sib.siblings = sib.siblings.filter(sid => sid !== id);
        }
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
      let birthYear = undefined;
      let deathYear = undefined;

      const lifespanMatch = line.match(/\b(\d{4})\s*-\s*(\d{4}|present|p)\b/i);
      if (lifespanMatch) {
        birthYear = parseInt(lifespanMatch[1]);
        const endPart = lifespanMatch[2].toLowerCase();
        if (endPart !== 'present' && endPart !== 'p') {
          deathYear = parseInt(lifespanMatch[2]);
        }
      }
      
      // Strip all lifespans from the line so they don't pollute names
      line = line.replace(/\b(\d{4})\s*-\s*(\d{4}|present|p)\b/gi, '').trim();

      let ancestors = [];
      
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
          ancestors = normalized.slice(1);
          
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
            let subGenderIdx = subParts.findIndex(p => isGender(p));
            
            name = subParts[0];
            if (subGenderIdx > 0) {
              ancestors = subParts.slice(1, subGenderIdx);
              gender = subParts[subGenderIdx];
              spouse = subParts[subGenderIdx + 1] || '';
            } else {
              ancestors = subParts.slice(1);
              gender = 'M';
              spouse = '';
            }
          } else {
            // CSV without ID
            let genderIdx = parts.findIndex(p => isGender(p));
            
            name = parts[0];
            if (genderIdx > 0) {
              ancestors = parts.slice(1, genderIdx);
              gender = parts[genderIdx];
              spouse = parts[genderIdx + 1] || '';
            } else {
              ancestors = parts.slice(1);
              gender = 'M';
              spouse = '';
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
        ancestors = normalized.slice(1);
      }

      fatherName = ancestors[0] || '';
      grandfatherName = ancestors[1] || '';

      // Extract optional ID prefixes from all names
      const nameParsed = this.extractIdAndName(name);
      const spouseParsed = this.extractIdAndName(spouse);
      const motherParsed = this.extractIdAndName(motherName);

      id = id || nameParsed.id;
      name = nameParsed.name;
      spouse = spouseParsed.name;
      motherName = motherParsed.name;

      if (name) {
        // Build extended lineage chain for all ancestors beyond grandfather
        for (let i = ancestors.length - 3; i >= 0; i--) {
          const ancName = ancestors[i];
          const ancFather = ancestors[i+1] || '';
          const ancGF = ancestors[i+2] || '';
          
          if (ancName) {
            const ancParsed = this.extractIdAndName(ancName);
            const ancFatherParsed = this.extractIdAndName(ancFather);
            const ancGFParsed = this.extractIdAndName(ancGF);
            
            this.addPerson({
              id: ancParsed.id,
              name: ancParsed.name,
              fatherName: ancFatherParsed.name,
              grandfatherName: ancGFParsed.name,
              fatherId: ancFatherParsed.id,
              grandfatherId: ancGFParsed.id,
              gender: 'M'
            });
          }
        }

        // Add main person
        const fatherParsed = this.extractIdAndName(fatherName);
        const gfParsed = this.extractIdAndName(grandfatherName);
        
        const p = this.addPerson({
          id,
          name,
          fatherName: fatherParsed.name,
          grandfatherName: gfParsed.name,
          gender,
          spouse,
          motherName,
          fatherId: fatherParsed.id,
          grandfatherId: gfParsed.id,
          motherId: motherParsed.id,
          spouseId: spouseParsed.id,
          birthYear,
          deathYear
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
    if (!person) return [];
    
    const siblingIds = new Set();
    
    // Add explicitly defined lateral siblings
    if (person.siblings) {
      person.siblings.forEach(sid => siblingIds.add(sid));
    }
    
    // Add siblings from father
    if (person.fatherId) {
      const father = this.getPerson(person.fatherId);
      if (father && father.children) {
        father.children.forEach(cid => {
          if (cid !== id) siblingIds.add(cid);
        });
      }
    }
    
    // Add siblings from mother
    if (person.motherId) {
      const mother = this.getPerson(person.motherId);
      if (mother && mother.children) {
        mother.children.forEach(cid => {
          if (cid !== id) siblingIds.add(cid);
        });
      }
    }
    
    return Array.from(siblingIds).map(cid => this.getPerson(cid)).filter(Boolean);
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

  modifyPerson(id, data) {
    if (!this.people.has(id)) return null;
    const person = this.people.get(id);

    let { name, firstName, familyName, gender, spouses, siblings, fatherName, motherName, grandfatherName, photo, birthYear, deathYear, notes, relativesData } = data;
    
    if (firstName) {
      name = (firstName.trim() + ' ' + (familyName || '').trim()).trim();
    } else {
      firstName = person.firstName;
      familyName = person.familyName;
    }
    name = name ? name.trim() : person.name;

    // 1. Update Name & Indexing
    if (person.name !== name) {
      this.unindexName(person.name, person.id);
      
      const oldName = person.name;
      
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
      this.getAllPeople().forEach(p => {
        if (p.spouses && p.spouses.includes(oldName)) {
          p.spouses = p.spouses.map(sn => sn === oldName ? name : sn);
        }
      });

      person.firstName = firstName;
      person.familyName = familyName;
      person.name = name;
      this.indexName(name, person.id);
    } else {
      person.firstName = firstName;
      person.familyName = familyName;
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
    spouseList.forEach((spName, index) => {
      const spObj = this.findPatriarchNode(spName);
      if (spObj) {
        if (!spObj.spouses) spObj.spouses = [];
        if (!spObj.spouses.includes(person.name)) {
          spObj.spouses.push(person.name);
        }
      } else {
        // Create placeholder spouse
        const rd = relativesData && relativesData.spouse && relativesData.spouse[index] ? relativesData.spouse[index] : null;
        const currentSpouseId = (rd && rd.id) ? rd.id : null;
        const oppositeGender = person.gender === 'M' ? 'F' : 'M';
        const sId = currentSpouseId || this.generateId();
        const placeholderSp = {
          id: sId,
          name: spName,
          gender: (rd && rd.gender) ? rd.gender : oppositeGender,
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

    // 3.5 Update Siblings
    const siblingList = siblings ? siblings.split(',').map(s => s.trim()).filter(Boolean) : [];
    
    // Remove old sibling bidirectionals
    if (person.siblings) {
      person.siblings.forEach(sibId => {
        const sibObj = this.people.get(sibId);
        if (sibObj && sibObj.siblings && !siblingList.includes(sibObj.name)) {
          sibObj.siblings = sibObj.siblings.filter(sid => sid !== person.id);
        }
      });
    }
    
    // Add new sibling bidirectionals
    person.siblings = [];
    siblingList.forEach((sibName, index) => {
      const sibKey = sibName.toLowerCase();
      let sibObj = this.findPatriarchNode(sibKey);
      
      if (!sibObj) {
        const rd = relativesData && relativesData.siblings && relativesData.siblings[index] ? relativesData.siblings[index] : null;
        const currentSiblingId = (rd && rd.id) ? rd.id : null;
        const sId = currentSiblingId || this.generateId();
        sibObj = {
          id: sId,
          name: sibName,
          gender: (rd && rd.gender) ? rd.gender : 'M',
          spouses: [],
          fatherId: person.fatherId,
          fatherName: person.fatherName,
          motherId: person.motherId,
          motherName: person.motherName,
          grandfatherName: person.grandfatherName,
          children: [],
          siblings: [person.id],
          customRelations: {}
        };
        this.people.set(sId, sibObj);
        this.indexName(sibName, sId);
      } else {
        if (!sibObj.siblings) sibObj.siblings = [];
        if (!sibObj.siblings.includes(person.id)) {
          sibObj.siblings.push(person.id);
        }
      }
      person.siblings.push(sibObj.id);
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

    this._applyRelativeData(person, data.relativesData);
    this.saveToDB();
    return person;
  }

  analyzeSmartSuggestions() {
    const suggestions = [];
    const ignoredList = [];
    const peopleArray = Array.from(this.people.values());
    
    // Hash map for quick lookup
    const childrenMap = new Map(); // personId -> Set of child IDs
    peopleArray.forEach(p => {
      childrenMap.set(p.id, new Set(p.children || []));
    });

    peopleArray.forEach(p1 => {
      // 1. Missing Spouses: if p1 and p2 share a child but are not spouses
      if (p1.children && p1.children.length > 0) {
        peopleArray.forEach(p2 => {
          if (p1.id !== p2.id && p1.gender !== p2.gender) { // assume different gender for auto-spouse infer
            const p1c = childrenMap.get(p1.id);
            const p2c = childrenMap.get(p2.id);
            const sharedChildren = [...p1c].filter(x => p2c.has(x));
            if (sharedChildren.length > 0) {
              const areSpouses = (p1.spouses && p1.spouses.includes(p2.name));
              if (!areSpouses) {
                // Ensure we haven't already added this pair
                const exists = suggestions.find(s => s.type === 'Missing Spouse' && ((s.p1Id === p1.id && s.p2Id === p2.id) || (s.p1Id === p2.id && s.p2Id === p1.id)));
                if (!exists) {
                  const childNames = sharedChildren.map(cid => this.people.get(cid)?.firstName || 'a child').join(', ');
                  const signature = `Spouse_${p1.id}_${p2.id}`;
                  const signatureReverse = `Spouse_${p2.id}_${p1.id}`;
                  const suggObj = {
                    signature: signature,
                    type: 'Missing Spouse',
                    p1Id: p1.id,
                    p1Name: p1.name || 'Unknown Member',
                    p2Id: p2.id,
                    p2Name: p2.name || 'Unknown Member',
                    relation: 'Spouse of',
                    reason: `Because they share children (${childNames}).`
                  };
                  if (!this.ignoredSuggestions.has(signature) && !this.ignoredSuggestions.has(signatureReverse)) {
                    suggestions.push(suggObj);
                  } else {
                    const existsIgnored = ignoredList.find(s => s.type === 'Missing Spouse' && ((s.p1Id === p1.id && s.p2Id === p2.id) || (s.p1Id === p2.id && s.p2Id === p1.id)));
                    if (!existsIgnored) ignoredList.push(suggObj);
                  }
                }
              }
            }
          }
        });
      }

      // 2. Missing Parents: if p1 is spouse of p2, and p2 has child C, but p1 doesn't have child C
      if (p1.spouses && p1.spouses.length > 0) {
        p1.spouses.forEach(spouseName => {
          const spouseIds = this.nameToIds.get(spouseName.toLowerCase()) || [];
          spouseIds.forEach(spouseId => {
            const p2 = this.people.get(spouseId);
            if (p2 && p2.children && p2.children.length > 0) {
              p2.children.forEach(cid => {
                const child = this.people.get(cid);
                if (child) {
                  if (!p1.children || !p1.children.includes(cid)) {
                    // Check if child already has a parent of p1's gender
                    let canBeParent = true;
                    if (p1.gender === 'M' && child.fatherId && child.fatherId !== p1.id) canBeParent = false;
                    if (p1.gender === 'F' && child.motherId && child.motherId !== p1.id) canBeParent = false;
                    
                    if (canBeParent) {
                      const relation = p1.gender === 'M' ? 'Father of' : 'Mother of';
                      // Prevent duplicates
                      const exists = suggestions.find(s => s.type === 'Missing Parent' && s.p1Id === p1.id && s.p2Id === child.id);
                      if (!exists) {
                        const signature = `Parent_${p1.id}_${child.id}`;
                        const suggObj = {
                          signature: signature,
                          type: 'Missing Parent',
                          p1Id: p1.id,
                          p1Name: p1.name || 'Unknown Member',
                          p2Id: child.id,
                          p2Name: child.name || 'Unknown Member',
                          relation: relation,
                          reason: `Because ${p1.name || 'Unknown Member'} is the spouse of ${p2.name || 'Unknown Member'}, who is a parent of ${child.firstName || 'Unknown Member'}.`
                        };
                        if (!this.ignoredSuggestions.has(signature)) {
                          suggestions.push(suggObj);
                        } else {
                          ignoredList.push(suggObj);
                        }
                      }
                    }
                  }
                }
              });
            }
          });
        });
      }

      // 3. Missing Siblings: if p1 and p2 have matching parents but aren't siblings
      peopleArray.forEach(p2 => {
        if (p1.id !== p2.id) {
          const areSiblings = (p1.siblings && p1.siblings.includes(p2.id));
          if (!areSiblings) {
            let isSibling = false;
            let reason = '';
            
            // Advanced checking logic
            if (p1.fatherId && p2.fatherId && p1.fatherId === p2.fatherId) {
               isSibling = true;
               reason = `Because they share the same father (${this.people.get(p1.fatherId)?.name}).`;
               if (p1.motherId && p2.motherId && p1.motherId === p2.motherId) {
                 reason = `Because they share the same parents (${this.people.get(p1.fatherId)?.name} and ${this.people.get(p1.motherId)?.name}).`;
               }
            } else if (p1.motherId && p2.motherId && p1.motherId === p2.motherId) {
               isSibling = true;
               reason = `Because they share the same mother (${this.people.get(p1.motherId)?.name}).`;
            } else if (p1.fatherName && p2.fatherName && p1.fatherName.toLowerCase() === p2.fatherName.toLowerCase()) {
               isSibling = true;
               reason = `Because they share the same father name (${p1.fatherName}).`;
            } else if (p1.motherName && p2.motherName && p1.motherName.toLowerCase() === p2.motherName.toLowerCase()) {
               isSibling = true;
               reason = `Because they share the same mother name (${p1.motherName}).`;
            }

            if (isSibling) {
              const exists = suggestions.find(s => s.type === 'Missing Sibling' && ((s.p1Id === p1.id && s.p2Id === p2.id) || (s.p1Id === p2.id && s.p2Id === p1.id)));
              if (!exists) {
                const signature = `Sibling_${p1.id}_${p2.id}`;
                const signatureReverse = `Sibling_${p2.id}_${p1.id}`;
                const relation = p1.gender === 'M' ? 'Brother of' : 'Sister of';
                const suggObj = {
                  signature: signature,
                  type: 'Missing Sibling',
                  p1Id: p1.id,
                  p1Name: p1.name || 'Unknown Member',
                  p2Id: p2.id,
                  p2Name: p2.name || 'Unknown Member',
                  relation: relation,
                  reason: reason
                };
                if (!this.ignoredSuggestions.has(signature) && !this.ignoredSuggestions.has(signatureReverse)) {
                  suggestions.push(suggObj);
                } else {
                  ignoredList.push(suggObj);
                }
              }
            }
          }
        }
      });
      
      // 4. Missing Grandparents
      if (p1.children && p1.children.length > 0) {
        p1.children.forEach(cid => {
           const child = this.people.get(cid);
           if (child && child.children && child.children.length > 0) {
             child.children.forEach(gcid => {
               const grandchild = this.people.get(gcid);
               if (grandchild) {
                 const relation = p1.gender === 'M' ? 'Grandfather of' : 'Grandmother of';
                 const exists = suggestions.find(s => s.type === 'Missing Grandparent' && s.p1Id === p1.id && s.p2Id === grandchild.id);
                 if (!exists) {
                   const signature = `Grandparent_${p1.id}_${grandchild.id}`;
                   if (!this.ignoredSuggestions.has(signature)) {
                     const alreadyHas = p1.customRelations && p1.customRelations[grandchild.id];
                     if (!alreadyHas) {
                       const suggObj = {
                         signature: signature,
                         type: 'Missing Grandparent',
                         p1Id: p1.id,
                         p1Name: p1.name || 'Unknown Member',
                         p2Id: grandchild.id,
                         p2Name: grandchild.name || 'Unknown Member',
                         relation: relation,
                         reason: `Because ${p1.name || 'Unknown Member'} is the parent of ${child.firstName || 'Unknown Member'}, who is the parent of ${grandchild.firstName || 'Unknown Member'}.`
                       };
                       if (!this.ignoredSuggestions.has(signature)) {
                         suggestions.push(suggObj);
                       } else {
                         ignoredList.push(suggObj);
                       }
                     }
                   }
                 }
               }
             });
           }
        });
      }
    });

    return { active: suggestions, ignored: ignoredList };
  }

  // Universal Linker for Universal Relationship Manager
  linkProfiles(id1, id2, relationType) {
    if (!this.people.has(id1) || !this.people.has(id2)) return false;
    const p1 = this.people.get(id1);
    const p2 = this.people.get(id2);
    
    if (id1 === id2) return false;

    if (relationType === 'Brother of' || relationType === 'Sister of' || relationType === 'Sibling of') {
      if (!p1.siblings) p1.siblings = [];
      if (!p2.siblings) p2.siblings = [];
      if (!p1.siblings.includes(id2)) p1.siblings.push(id2);
      if (!p2.siblings.includes(id1)) p2.siblings.push(id1);
      
      // Sync parents
      if (p1.fatherId && !p2.fatherId) {
        p2.fatherId = p1.fatherId;
        p2.fatherName = p1.fatherName;
        p2.grandfatherName = p1.grandfatherName;
        const f = this.people.get(p1.fatherId);
        if (f && !f.children.includes(id2)) f.children.push(id2);
      } else if (p2.fatherId && !p1.fatherId) {
        p1.fatherId = p2.fatherId;
        p1.fatherName = p2.fatherName;
        p1.grandfatherName = p2.grandfatherName;
        const f = this.people.get(p2.fatherId);
        if (f && !f.children.includes(id1)) f.children.push(id1);
      }
      
      if (p1.motherId && !p2.motherId) {
        p2.motherId = p1.motherId;
        p2.motherName = p1.motherName;
        const m = this.people.get(p1.motherId);
        if (m && !m.children.includes(id2)) m.children.push(id2);
      } else if (p2.motherId && !p1.motherId) {
        p1.motherId = p2.motherId;
        p1.motherName = p2.motherName;
        const m = this.people.get(p2.motherId);
        if (m && !m.children.includes(id1)) m.children.push(id1);
      }
      
    } else if (relationType === 'Father of' || relationType === 'Mother of') {
       if (this.wouldCreateCycle(id2, id1)) return false; 
       
       if (relationType === 'Father of') {
         p2.fatherId = id1;
         p2.fatherName = p1.name;
         p2.grandfatherName = p1.fatherName;
         if (!p1.children.includes(id2)) p1.children.push(id2);
       } else {
         p2.motherId = id1;
         p2.motherName = p1.name;
         if (!p1.children.includes(id2)) p1.children.push(id2);
       }
    } else if (relationType === 'Son of' || relationType === 'Daughter of' || relationType === 'Child of') {
       if (this.wouldCreateCycle(id1, id2)) return false; 
       
       if (p2.gender === 'M') {
         p1.fatherId = id2;
         p1.fatherName = p2.name;
         p1.grandfatherName = p2.fatherName;
         if (!p2.children.includes(id1)) p2.children.push(id1);
       } else {
         p1.motherId = id2;
         p1.motherName = p2.name;
         if (!p2.children.includes(id1)) p2.children.push(id1);
       }
    } else if (relationType === 'Spouse of') {
       if (!p1.spouses) p1.spouses = [];
       if (!p2.spouses) p2.spouses = [];
       if (!p1.spouses.includes(p2.name)) p1.spouses.push(p2.name);
       if (!p2.spouses.includes(p1.name)) p2.spouses.push(p1.name);
    } else {
       // Custom Relationship
       if (!p1.customRelations) p1.customRelations = {};
       p1.customRelations[id2] = relationType;
       if (!p2.customRelations) p2.customRelations = {};
       p2.customRelations[id1] = `Linked to ${p1.name} (${relationType})`;
    }
    
    this.saveToDB();
    return true;
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
        children: Array.isArray(p.children) ? p.children : [],
        siblings: Array.isArray(p.siblings) ? p.siblings : [],
        customRelations: p.customRelations || {}
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

        // Merge siblings
        const sibs = Array.isArray(p.siblings) ? p.siblings : [];
        sibs.forEach(s => {
          if (!existing.siblings) existing.siblings = [];
          if (!existing.siblings.includes(s)) existing.siblings.push(s);
        });
        
        // Merge customRelations
        if (p.customRelations) {
          if (!existing.customRelations) existing.customRelations = {};
          Object.assign(existing.customRelations, p.customRelations);
        }
        
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
