/* ==========================================================================
   INTERACTIVE HTML5 LINEAGE CANVAS GRAPH RENDERER
   ========================================================================== */

export class LineageCanvas {
  constructor(canvasElement, engine, onNodeSelect, isWorldMode = false) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.engine = engine;
    this.onNodeSelect = onNodeSelect;
    this.isWorldMode = isWorldMode;

    // Viewport Pan & Zoom State
    this.panX = 0;
    this.panY = 0;
    this.zoom = 1;
    this.maxZoom = 3;
    this.minZoom = 0.2;

    // Dimensions
    this.nodeWidth = 160;
    this.nodeHeight = 70;
    this.levelSpacingY = 120;
    this.nodeSpacingX = 40;

    // Mouse Interaction Tracking
    this.isDragging = false;
    this.startX = 0;
    this.startY = 0;
    this.hoverNode = null;
    this.nodes = []; // Current active drawn nodes with absolute screen coordinates
    this.mouseDownX = 0;
    this.mouseDownY = 0;
    this.clickedNode = null;

    // Animation & Centering Properties
    this.focusPersonId = null;
    this.layoutDirection = 'vertical'; // 'vertical' or 'horizontal'
    this.filterType = 'all'; // 'all', 'M', 'F', 'roots'
    this.searchQuery = '';
    this.isGenealogyMode = false;
    
    // Photo Image Cache
    this.imageCache = new Map();

    // Initialize Event Listeners
    this.initEvents();
    this.resizeCanvas();
  }

  // Adjust canvas resolution for sharp High-DPI screens
  resizeCanvas() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.ctx.scale(dpr, dpr);
    this.draw();
  }

  initEvents() {
    // Handle Window Resizing
    window.addEventListener('resize', () => this.resizeCanvas());

    // Mouse Down (Drag start or Select card candidate)
    this.canvas.addEventListener('mousedown', (e) => {
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
      const pos = this.getMousePos(e);
      this.mouseDownX = e.clientX;
      this.mouseDownY = e.clientY;
      this.clickedNode = this.getNodeAtPosition(pos.x, pos.y);

      // Start dragging canvas from anywhere
      this.isDragging = true;
      this.startX = e.clientX - this.panX;
      this.startY = e.clientY - this.panY;
      this.canvas.style.cursor = 'grabbing';
    });

    // Mouse Move (Dragging or Hover detection)
    this.canvas.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        this.panX = e.clientX - this.startX;
        this.panY = e.clientY - this.startY;
        this.draw();
      } else {
        const pos = this.getMousePos(e);
        const prevHover = this.hoverNode;
        this.hoverNode = this.getNodeAtPosition(pos.x, pos.y);
        
        const prevPhotoHover = this.hoverPhotoNode;
        this.hoverPhotoNode = null;

        if (this.hoverNode) {
          // Check if mouse is exactly over the photo circle (cx = x+24, cy = y+30, r = 14)
          // scaled by zoom and pan
          const cx = this.hoverNode.x * this.zoom + this.panX + 24 * this.zoom;
          const cy = this.hoverNode.y * this.zoom + this.panY + 30 * this.zoom;
          const r = 14 * this.zoom;
          
          const dx = pos.x - cx;
          const dy = pos.y - cy;
          
          if (dx * dx + dy * dy <= r * r) {
            this.hoverPhotoNode = this.hoverNode;
          }
        }

        if (prevHover !== this.hoverNode || prevPhotoHover !== this.hoverPhotoNode) {
          this.canvas.style.cursor = (this.hoverNode || this.hoverPhotoNode) ? 'pointer' : 'grab';
          this.draw();
        }
      }
    });

    // Mouse Up (Drag release and Click trigger)
    window.addEventListener('mouseup', (e) => {
      if (this.isDragging) {
        this.isDragging = false;
        
        // Calculate drag distance to differentiate click from drag
        const dx = e.clientX - this.mouseDownX;
        const dy = e.clientY - this.mouseDownY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const hoverNode = this.getNodeAtPosition(mouseX, mouseY);
        
        // Trigger select if drag is small or released on the same node
        if (this.clickedNode && (distance < 12 || (hoverNode && String(hoverNode.id) === String(this.clickedNode.id)))) {
          if (this.onNodeSelect) this.onNodeSelect(this.clickedNode.id);
        }
        
        this.clickedNode = null;
        
        // Restore cursor based on current hover status
        const hover = this.getNodeAtPosition(mouseX, mouseY);
        this.canvas.style.cursor = hover ? 'pointer' : 'grab';
      }
    });

    // Mouse Wheel (Zooming centered on mouse cursor)
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
      const zoomFactor = 1.1;
      const mousePos = this.getMousePos(e);

      // Translate mouse position back to canvas coordinate space
      const worldX = (mousePos.x - this.panX) / this.zoom;
      const worldY = (mousePos.y - this.panY) / this.zoom;

      if (e.deltaY < 0) {
        this.zoom = Math.min(this.maxZoom, this.zoom * zoomFactor);
      } else {
        this.zoom = Math.max(this.minZoom, this.zoom / zoomFactor);
      }

      // Update pan values so we zoom on mouse pivot point
      this.panX = mousePos.x - worldX * this.zoom;
      this.panY = mousePos.y - worldY * this.zoom;

      this.draw();
    }, { passive: false });
  }

  // Get mouse coordinates corrected for canvas bounding box
  getMousePos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  // Find node at specific X/Y viewport position
  getNodeAtPosition(x, y) {
    let bestNode = null;
    let bestDist = Infinity;

    for (const node of this.nodes) {
      if (this.isWorldMode && this.isGenealogyMode) {
        // Network Mode: Circular hit test
        const cx = node.screenX + (this.nodeWidth / 2) * this.zoom;
        const cy = node.screenY + (this.nodeHeight / 2) * this.zoom;
        const r = Math.max(32 * this.zoom, 24); // Forgiving clickable radius, min 24px
        const dx = x - cx;
        const dy = y - cy;
        const distSq = dx * dx + dy * dy;
        if (distSq <= r * r && distSq < bestDist) {
          bestNode = node;
          bestDist = distSq;
        }
      } else {
        // Standard Card Mode: Rectangular hit test (with padding if zoomed out)
        const hitPadding = this.zoom < 0.5 ? 24 : 0;
        if (
          x >= node.screenX - hitPadding &&
          x <= node.screenX + this.nodeWidth * this.zoom + hitPadding &&
          y >= node.screenY - hitPadding &&
          y <= node.screenY + this.nodeHeight * this.zoom + hitPadding
        ) {
          const cx = node.screenX + (this.nodeWidth / 2) * this.zoom;
          const cy = node.screenY + (this.nodeHeight / 2) * this.zoom;
          const distSq = (x - cx) * (x - cx) + (y - cy) * (y - cy);
          if (distSq < bestDist) {
            bestNode = node;
            bestDist = distSq;
          }
        }
      }
    }
    return bestNode;
  }

  // Set the focus person and compute layout
  setFocus(personId) {
    this.focusPersonId = personId;
    this.centerOnNode(personId);
  }

  // Toggle layout direction
  toggleDirection() {
    this.layoutDirection = this.layoutDirection === 'vertical' ? 'horizontal' : 'vertical';
    this.zoomFit();
  }

  // Clear zoom and fit the entire active subgraph in window
  zoomFit() {
    if (!this.isWorldMode && (!this.focusPersonId || !this.engine.getPerson(this.focusPersonId))) return;

    this.computeLayout();
    if (this.nodes.length === 0) return;

    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    // Calculate bounds of our node layout
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    this.nodes.forEach(n => {
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x + this.nodeWidth);
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y + this.nodeHeight);
    });

    const graphW = (maxX - minX) || this.nodeWidth;
    const graphH = (maxY - minY) || this.nodeHeight;

    // Zoom fits layout with a 15% margin
    const padding = 60;
    const scaleX = (width - padding * 2) / graphW;
    const scaleY = (height - padding * 2) / graphH;
    this.zoom = Math.max(this.minZoom, Math.min(1.2, Math.min(scaleX, scaleY)));

    // Center in screen
    const graphCenterX = minX + graphW / 2;
    const graphCenterY = minY + graphH / 2;
    this.panX = width / 2 - graphCenterX * this.zoom;
    this.panY = height / 2 - graphCenterY * this.zoom;

    this.draw();
  }

  animateTransition(targetPanX, targetPanY, targetZoom, duration = 600) {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    const startPanX = this.panX;
    const startPanY = this.panY;
    const startZoom = this.zoom;
    const startTime = performance.now();

    const animate = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // easeInOutCubic
      const ease = progress < 0.5 
        ? 4 * progress * progress * progress 
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      this.panX = startPanX + (targetPanX - startPanX) * ease;
      this.panY = startPanY + (targetPanY - startPanY) * ease;
      this.zoom = startZoom + (targetZoom - startZoom) * ease;

      this.draw();

      if (progress < 1) {
        this.animationFrameId = requestAnimationFrame(animate);
      } else {
        this.animationFrameId = null;
      }
    };

    this.animationFrameId = requestAnimationFrame(animate);
  }

  centerOnNode(personId) {
    // In Tree mode, focus changes require a new layout graph. In World mode, the graph is global and physics-based, so DO NOT reset it!
    if (!this.isWorldMode) {
      this.computeLayout();
    }
    const node = this.nodes.find(n => String(n.id) === String(personId));
    if (!node) return;

    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width > 0 ? rect.width : (window.innerWidth - 250);
    const height = rect.height > 0 ? rect.height : window.innerHeight;

    // Center on this node while keeping the current zoom level intact
    let targetZoom = this.zoom; 
    const targetPanX = width / 2 - (node.x + this.nodeWidth / 2) * targetZoom;
    const targetPanY = height / 2 - (node.y + this.nodeHeight / 2) * targetZoom;

    this.animateTransition(targetPanX, targetPanY, targetZoom, 600);
  }

  setFilter(filterType) {
    this.filterType = filterType;
    this.draw();
  }

  filterNodeMatches(p) {
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase().trim();
      if (q.length > 0) {
        const nameMatch = p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q);
        if (!nameMatch) return false;
      }
    }
    if (!this.filterType || this.filterType === 'all') return true;
    
    let g = (p.gender || 'M').toString().toUpperCase().trim();
    let isFemale = g.startsWith('F');
    let isMale = !isFemale;

    if (this.filterType === 'M') return isMale;
    if (this.filterType === 'F') return isFemale;
    if (this.filterType === 'roots') return !p.fatherId && !p.motherId;
    return true;
  }

  zoomIn() {
    this.zoom = Math.min(this.maxZoom, this.zoom * 1.25);
    this.draw();
  }

  zoomOut() {
    this.zoom = Math.max(this.minZoom, this.zoom / 1.25);
    this.draw();
  }

  /* ==========================================================================
     GRAPH COMPUTATION & LAYOUT ALGORITHM
     ========================================================================== */

  computeLayout() {
    if (this.isGenealogyMode) {
      if (this.isWorldMode) {
        this.computeGenealogyWorldLayout();
      } else {
        this.computeGenealogyTreeLayout();
      }
      return;
    }

    if (this.isWorldMode) {
      this.computeWorldLayout();
      return;
    }

    if (!this.focusPersonId) {
      this.nodes = [];
      return;
    }

    const focus = this.engine.getPerson(this.focusPersonId);
    if (!focus) {
      this.nodes = [];
      return;
    }

    // 1. Gather nodes in localized lineage tree (4 generations up, 4 down)
    const ancestors = this.engine.getAncestors(focus.id).slice(0, 4);
    const siblings = this.engine.getSiblings(focus.id);

    // Resolve Spouses if exists
    const spouseObjs = [];
    if (focus.spouses && focus.spouses.length > 0) {
      focus.spouses.forEach(spName => {
        const spObj = this.engine.findPatriarchNode(spName);
        if (spObj) spouseObjs.push(spObj);
      });
    }

    // Organize nodes by Layer indices
    const layers = {};
    const addToLayer = (layerIdx, person) => {
      if (!layers[layerIdx]) layers[layerIdx] = [];
      if (!layers[layerIdx].some(p => p.id === person.id)) {
        layers[layerIdx].push(person);
      }
    };

    // Focus & Spouses & Siblings
    addToLayer(0, focus);
    spouseObjs.forEach(sp => addToLayer(0, sp));
    siblings.forEach(s => addToLayer(0, s));

    // Ancestors
    if (ancestors.length >= 1) addToLayer(-1, ancestors[0]); // Father
    if (ancestors.length >= 2) addToLayer(-2, ancestors[1]); // Grandfather
    if (ancestors.length >= 3) addToLayer(-3, ancestors[2]); // Great-Grandfather
    if (ancestors.length >= 4) addToLayer(-4, ancestors[3]); // Great-Great-Grandfather

    // Descendants recursively up to 4 generations down
    const addDescendantsRecursive = (personId, currentLayer) => {
      if (currentLayer > 4) return;
      const person = this.engine.getPerson(personId);
      if (!person) return;

      person.children.forEach(cid => {
        const child = this.engine.getPerson(cid);
        if (child) {
          addToLayer(currentLayer, child);
          // Spouses of child
          if (child.spouses && child.spouses.length > 0) {
            child.spouses.forEach(spName => {
              const cs = this.engine.findPatriarchNode(spName);
              if (cs) addToLayer(currentLayer, cs);
            });
          }
          // Recurse to next generation
          addDescendantsRecursive(cid, currentLayer + 1);
        }
      });
    };

    addDescendantsRecursive(focus.id, 1);

    // 2. Lay out coordinates for nodes within each generation level
    const calculatedNodes = [];
    const activeLayerIndices = Object.keys(layers).map(Number).sort((a,b) => a - b);

    activeLayerIndices.forEach(layerIdx => {
      const members = layers[layerIdx];
      const count = members.length;
      
      // Calculate coordinates depending on layout direction
      members.forEach((person, idx) => {
        let x = 0;
        let y = 0;

        if (this.layoutDirection === 'vertical') {
          // Vertical Layout (Generations flow vertically, nodes split horizontally)
          y = layerIdx * this.levelSpacingY;
          x = (idx - (count - 1) / 2) * (this.nodeWidth + this.nodeSpacingX);
        } else {
          // Horizontal Layout (Generations flow horizontally, nodes split vertically)
          x = layerIdx * this.levelSpacingY;
          y = (idx - (count - 1) / 2) * (this.nodeHeight + this.nodeSpacingX);
        }

        calculatedNodes.push({
          id: person.id,
          person,
          x,
          y,
          layerIdx
        });
      });
    });

    this.nodes = calculatedNodes;
    this.applySmartSpacing();
  }

  // --- NEW GENEALOGY LAYOUTS ---
  
  // 1. Strict Left-To-Right Pedigree Ancestor Layout (including Siblings)
  computeGenealogyTreeLayout() {
    if (!this.focusPersonId) {
      this.nodes = [];
      return;
    }
    const focus = this.engine.getPerson(this.focusPersonId);
    if (!focus) {
      this.nodes = [];
      return;
    }

    const calculatedNodes = [];
    const horizontalSpacing = 280;
    const siblingSpacing = 100;

    // Get siblings
    const siblings = this.engine.getSiblings(focus.id) || [];
    
    // Get spouses
    const spouses = [];
    if (focus.spouses) {
      focus.spouses.forEach(spName => {
        const spObj = this.engine.getAllPeople().find(p => p.name === spName);
        if (spObj) spouses.push(spObj);
      });
    }

    // Stack focus + spouses + siblings at level 0 (x = 0)
    calculatedNodes.push({
      id: focus.id,
      person: focus,
      x: 0,
      y: 0,
      layerIdx: 0
    });

    let currentOffsetIndex = 1;

    spouses.forEach((spouse) => {
      const offset = currentOffsetIndex * siblingSpacing * (currentOffsetIndex % 2 === 0 ? 1 : -1);
      calculatedNodes.push({
        id: spouse.id,
        person: spouse,
        x: 0,
        y: offset,
        layerIdx: 0
      });
      currentOffsetIndex++;
    });

    siblings.forEach((sib) => {
      const offset = currentOffsetIndex * siblingSpacing * (currentOffsetIndex % 2 === 0 ? 1 : -1);
      calculatedNodes.push({
        id: sib.id,
        person: sib,
        x: 0,
        y: offset,
        layerIdx: 0
      });
      currentOffsetIndex++;
    });

    const placeAncestor = (personId, level, verticalOffset, verticalRange) => {
      const person = this.engine.getPerson(personId);
      if (!person) return;

      const x = level * horizontalSpacing;
      const y = verticalOffset + verticalRange / 2 - this.nodeHeight / 2;

      calculatedNodes.push({
        id: person.id,
        person,
        x,
        y,
        layerIdx: level
      });

      if (person.fatherId) placeAncestor(person.fatherId, level + 1, verticalOffset, verticalRange / 2);
      if (person.motherId) placeAncestor(person.motherId, level + 1, verticalOffset + verticalRange / 2, verticalRange / 2);
    };

    // Allocate 1600 pixels vertically for ancestors at level 1
    if (focus.fatherId) {
      placeAncestor(focus.fatherId, 1, -800, 800);
    }
    if (focus.motherId) {
      placeAncestor(focus.motherId, 1, 0, 800);
    }

    this.nodes = calculatedNodes;
  }

  // 2. Force-Directed Organic Network Map for World View
  computeGenealogyWorldLayout() {
    const allPeople = this.engine.getAllPeople();
    if (allPeople.length === 0) {
      this.nodes = [];
      return;
    }

    const calculatedNodes = [];
    const nodeCount = allPeople.length;

    // Place nodes in a grid to start (prevents spiral pileup)
    const cols = Math.ceil(Math.sqrt(nodeCount));
    const spacing = 200;

    allPeople.forEach((person, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      calculatedNodes.push({
        id: person.id,
        person,
        x: (col - cols / 2) * spacing,
        y: (row - cols / 2) * spacing,
        vx: 0,
        vy: 0,
        layerIdx: 0
      });
    });

    this.nodes = calculatedNodes;

    // Build an edge list for attraction
    const edges = [];
    this.nodes.forEach(node => {
      const p = node.person;
      if (p.fatherId) {
        const target = this.nodes.find(n => n.id === p.fatherId);
        if (target) edges.push([node, target]);
      }
      if (p.motherId) {
        const target = this.nodes.find(n => n.id === p.motherId);
        if (target) edges.push([node, target]);
      }
      if (p.spouses) {
        p.spouses.forEach(spName => {
          const target = this.nodes.find(n => n.person.name === spName);
          if (target && target.id > node.id) edges.push([node, target]);
        });
      }
    });

    // Run force simulation
    const repulsionStrength = 80000;
    const attractionStrength = 0.003;
    const damping = 0.82;
    const idealEdgeLen = 250;
    // Fewer iterations for large graphs to avoid slow perf
    const maxIter = nodeCount > 200 ? 40 : (nodeCount > 50 ? 60 : 80);

    for (let iter = 0; iter < maxIter; iter++) {
      // 1) Repulsion: every node pushes every other node away
      for (let i = 0; i < this.nodes.length; i++) {
        for (let j = i + 1; j < this.nodes.length; j++) {
          const a = this.nodes[i];
          const b = this.nodes[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = repulsionStrength / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          a.vx -= fx;
          a.vy -= fy;
          b.vx += fx;
          b.vy += fy;
        }
      }

      // 2) Attraction: edges pull connected nodes together
      edges.forEach(([a, b]) => {
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const displacement = dist - idealEdgeLen;
        const force = displacement * attractionStrength;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      });

      // 3) Apply velocities with damping
      this.nodes.forEach(n => {
        n.x += n.vx;
        n.y += n.vy;
        n.vx *= damping;
        n.vy *= damping;
      });
    }

    // Clean up temporary velocity
    this.nodes.forEach(n => { delete n.vx; delete n.vy; });
  }

  // Find center X/Y points of all nodes to frame viewthat layouts all family tree members side-by-side by generations
  computeWorldLayout() {
    const allPeople = this.engine.getAllPeople();
    if (allPeople.length === 0) {
      this.nodes = [];
      return;
    }

    // 1. Get generation level for each person
    const levelsMap = this.engine.getGenerationsGrid();
    
    // Group all people by level
    const layers = {};
    allPeople.forEach(person => {
      let lvl = levelsMap.get(person.id) || 1;
      if (!layers[lvl]) layers[lvl] = [];
      layers[lvl].push(person);
    });

    const activeLayerIndices = Object.keys(layers).map(Number).sort((a, b) => a - b);
    
    // 2. Sort members of each layer by parents to keep sibling clusters side-by-side
    activeLayerIndices.forEach(layerIdx => {
      const members = layers[layerIdx];
      if (layerIdx === 0 && !this.isWorldMode) {
         const siblings = [];
         const focusArr = [];
         const spouses = [];
         const focusPerson = this.engine.getPerson(this.focusPersonId);
         members.forEach(m => {
           if (String(m.id) === String(this.focusPersonId)) focusArr.push(m);
           else if (focusPerson && focusPerson.spouses && focusPerson.spouses.includes(m.name)) spouses.push(m);
           else siblings.push(m);
         });
         
         siblings.sort((a,b) => a.name.localeCompare(b.name));
         spouses.sort((a,b) => a.name.localeCompare(b.name));
         
         // Replace the members array contents with the sorted array
         members.length = 0;
         members.push(...siblings, ...focusArr, ...spouses);
      } else {
         members.sort((a, b) => {
           if (a.fatherId !== b.fatherId) {
             return (a.fatherId || '').localeCompare(b.fatherId || '');
           }
           if (a.motherId !== b.motherId) {
             return (a.motherId || '').localeCompare(b.motherId || '');
           }
           return a.name.localeCompare(b.name);
         });
      }
    });

    // 3. Loop levels and compute coordinates, placing siblings/nodes side-by-side
    const calculatedNodes = [];
    
    activeLayerIndices.forEach(layerIdx => {
      const members = layers[layerIdx];
      const count = members.length;
      
      members.forEach((person, idx) => {
        let x = 0;
        let y = 0;

        if (this.layoutDirection === 'vertical') {
          // Vertical Layout: layers flow vertically, members in layer spread horizontally
          y = (layerIdx - 1) * this.levelSpacingY; // layerIdx is 1-based in getGenerationsGrid, so subtract 1
          x = (idx - (count - 1) / 2) * (this.nodeWidth + this.nodeSpacingX);
        } else {
          // Horizontal Layout: layers flow horizontally, members in layer spread vertically
          x = (layerIdx - 1) * this.levelSpacingY;
          y = (idx - (count - 1) / 2) * (this.nodeHeight + this.nodeSpacingX);
        }

        calculatedNodes.push({
          id: person.id,
          person,
          x,
          y,
          layerIdx
        });
      });
    });

    this.nodes = calculatedNodes;
  }

  /* ==========================================================================
     CANVAS DRAW LOOP
     ========================================================================== */

  draw() {
    // Clean screen
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.save();

    // Apply pan & zoom shifts
    this.ctx.translate(this.panX, this.panY);
    this.ctx.scale(this.zoom, this.zoom);

    // Draw Generational Timeline background guides
    this.drawGenerationalTimeline();

    // Render connection paths
    this.drawConnections();

    // Render card nodes
    this.drawNodes();

    this.ctx.restore();

    // Update Radar Map if active
    if (window.App && window.App.v8) {
      const radarToggle = document.getElementById('toggle-v8-radar');
      if (radarToggle && radarToggle.checked) {
        window.App.v8.drawActualMinimap();
      }
    }
  }

  // Draw generational background timeline lines
  drawGenerationalTimeline() {
    const timelineToggle = document.getElementById('toggle-v8-timeline');
    if (!timelineToggle || !timelineToggle.checked) return;

    // Get all active layers from current nodes
    const activeLayers = [...new Set(this.nodes.map(n => n.layerIdx))].sort((a, b) => a - b);
    if (activeLayers.length === 0) return;

    const isDark = document.body.classList.contains('theme-dark');
    this.ctx.save();
    
    // Set dashed line style
    this.ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)';
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([6, 4]);

    // Label style
    this.ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.35)';
    this.ctx.font = 'bold 10px Outfit, sans-serif';

    // Find the world bounds of the screen to draw the lines across the entire viewport
    const viewWidth = this.canvas.clientWidth;
    const viewHeight = this.canvas.clientHeight;
    
    const wLeft = -this.panX / this.zoom;
    const wRight = (viewWidth - this.panX) / this.zoom;
    const wTop = -this.panY / this.zoom;
    const wBottom = (viewHeight - this.panY) / this.zoom;

    // Adapt settings for pedigree mode
    const isPedigreeMode = this.isGenealogyMode && !this.isWorldMode;
    const isVerticalFlow = isPedigreeMode ? false : (this.layoutDirection === 'vertical');
    const spacing = isPedigreeMode ? 280 : this.levelSpacingY;

    activeLayers.forEach(layerIdx => {
      let label = '';
      if (this.isWorldMode) {
        label = `Generation ${layerIdx}`;
      } else {
        if (layerIdx === 0) label = 'Focus Generation';
        else if (layerIdx === -1) label = 'Parents';
        else if (layerIdx === -2) label = 'Grandparents';
        else if (layerIdx === -3) label = 'Great-Grandparents';
        else if (layerIdx === -4) label = 'G-G-Grandparents';
        else if (layerIdx === 1) {
          label = isPedigreeMode ? 'Parents' : 'Children';
        } else if (layerIdx === 2) {
          label = isPedigreeMode ? 'Grandparents' : 'Grandchildren';
        } else if (layerIdx === 3) {
          label = isPedigreeMode ? 'Great-Grandparents' : 'Great-Grandchild';
        } else if (layerIdx === 4) {
          label = isPedigreeMode ? 'G-G-Grandparents' : 'G-G-Grandchildren';
        } else {
          label = isPedigreeMode ? `Ancestors Lvl ${layerIdx}` : `Generation ${layerIdx > 0 ? '+' : ''}${layerIdx}`;
        }
      }

      this.ctx.beginPath();
      if (isVerticalFlow) {
        const y = layerIdx * spacing + this.nodeHeight / 2;
        this.ctx.moveTo(wLeft, y);
        this.ctx.lineTo(wRight, y);
        this.ctx.stroke();

        // Draw label text slightly above the line
        this.ctx.fillText(label.toUpperCase(), wLeft + 20, y - 6);
      } else {
        const x = layerIdx * spacing + this.nodeWidth / 2;
        this.ctx.moveTo(x, wTop);
        this.ctx.lineTo(x, wBottom);
        this.ctx.stroke();

        // Draw label text rotated
        this.ctx.save();
        this.ctx.translate(x - 6, wTop + 20);
        this.ctx.rotate(-Math.PI / 2);
        this.ctx.fillText(label.toUpperCase(), 0, 0);
        this.ctx.restore();
      }
    });

    this.ctx.restore();
  }

  // Draw relationship connection curves
  drawConnections() {
    const isDark = document.body.classList.contains('theme-dark');
    const isGenealogyWorld = this.isGenealogyMode && this.isWorldMode;

    // In world network mode, use much thinner, subtler lines
    if (isGenealogyWorld) {
      this.ctx.lineWidth = 1;
      this.ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)';
    } else {
      this.ctx.lineWidth = 2;
      this.ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.12)';
    }

    this.nodes.forEach(node => {
      const person = node.person;

      // Draw connection lines to children
      person.children.forEach(cid => {
        const childNode = this.nodes.find(n => n.id === cid);
        if (childNode) {
          if (this.isGenealogyMode) {
            this.drawGenealogyConnection(node, childNode);
          } else {
            this.drawBezierCurve(node, childNode);
          }
        }
      });

      // In tree pedigree mode, clean up old links
      if (this.isGenealogyMode && !this.isWorldMode) {
        // Parents already draw modern orthogonal lines to children (including our siblings).
        // For spouses, we draw a clean bracket if they are stacked at the same X coordinate.
        if (person.spouses && person.spouses.length > 0) {
          person.spouses.forEach(spName => {
            const spouseNode = this.nodes.find(n => n.person.name === spName);
            if (spouseNode && spouseNode.id > node.id && Math.abs(node.x - spouseNode.x) < 10) {
              this.drawGenealogySpouseLine(node, spouseNode);
            }
          });
        }
        return; // Skip the old chaotic spiderweb connections
      }

      // Draw connections to Spouses
      if (person.spouses && person.spouses.length > 0) {
        person.spouses.forEach(spName => {
          const spouseNode = this.nodes.find(n => n.person.name === spName);
          if (spouseNode && spouseNode.id > node.id) {
            this.drawSpouseLine(node, spouseNode);
          }
        });
      }

      // Draw connections to lateral Siblings
      if (person.siblings && person.siblings.length > 0) {
        person.siblings.forEach(sid => {
          const siblingNode = this.nodes.find(n => n.id === sid);
          if (siblingNode && siblingNode.id > node.id) {
            this.drawSiblingLine(node, siblingNode);
          }
        });
      }
    });
  }

  // Beautiful curvy cubic spline lines
  drawBezierCurve(startNode, endNode) {
    this.ctx.save();
    if (this.filterType && this.filterType !== 'all') {
      const startMatches = this.filterNodeMatches(startNode.person);
      const endMatches = this.filterNodeMatches(endNode.person);
      if (!startMatches || !endMatches) {
        this.ctx.globalAlpha = 0.15;
      }
    }
    this.ctx.beginPath();
    
    let sx, sy, ex, ey, cp1x, cp1y, cp2x, cp2y;

    if (this.layoutDirection === 'vertical') {
      // Connect bottom center of parent to top center of child
      sx = startNode.x + this.nodeWidth / 2;
      sy = startNode.y + this.nodeHeight;
      ex = endNode.x + this.nodeWidth / 2;
      ey = endNode.y;
      
      cp1x = sx;
      cp1y = sy + this.levelSpacingY / 3;
      cp2x = ex;
      cp2y = ey - this.levelSpacingY / 3;
    } else {
      // Connect right center of parent to left center of child
      sx = startNode.x + this.nodeWidth;
      sy = startNode.y + this.nodeHeight / 2;
      ex = endNode.x;
      ey = endNode.y + this.nodeHeight / 2;

      cp1x = sx + this.levelSpacingY / 3;
      cp1y = sy;
      cp2x = ex - this.levelSpacingY / 3;
      cp2y = ey;
    }

    this.ctx.moveTo(sx, sy);
    this.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, ex, ey);
    this.ctx.stroke();
    this.ctx.restore();
  }

  // Classic Pedigree Orthogonal Lines (Genealogy Mode)
  drawGenealogyConnection(startNode, endNode) {
    this.ctx.save();
    if (this.filterType && this.filterType !== 'all') {
      const startMatches = this.filterNodeMatches(startNode.person);
      const endMatches = this.filterNodeMatches(endNode.person);
      if (!startMatches || !endMatches) {
        this.ctx.globalAlpha = 0.15;
      }
    }
    this.ctx.beginPath();
    
    const isFocusLine = this.focusPersonId && (String(startNode.id) === String(this.focusPersonId) || String(endNode.id) === String(this.focusPersonId));
    const isDark = document.body.classList.contains('theme-dark');
    this.ctx.lineWidth = isFocusLine ? 3 : 2;
    this.ctx.strokeStyle = isFocusLine 
      ? (isDark ? '#60cdff' : '#0078d4') 
      : (isDark ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.3)');

    let sx, sy, ex, ey;

    if (this.isWorldMode) {
       // In World Network mode, draw thin straight web lines
       this.ctx.lineWidth = 1;
       this.ctx.strokeStyle = isFocusLine 
         ? (isDark ? 'rgba(96, 205, 255, 0.6)' : 'rgba(0, 120, 212, 0.5)') 
         : (isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.06)');
       sx = startNode.x + this.nodeWidth / 2;
       sy = startNode.y + this.nodeHeight / 2;
       ex = endNode.x + this.nodeWidth / 2;
       ey = endNode.y + this.nodeHeight / 2;
       this.ctx.moveTo(sx, sy);
       this.ctx.lineTo(ex, ey);
    } else {
       // In Tree Pedigree mode, draw elegant Left-To-Right Orthogonal lines
       // Because pedigree traces backwards from child -> parents (child on left, parent on right)
       if (startNode.x > endNode.x) {
         // Parent is to the right of the child
         sx = startNode.x;
         sy = startNode.y + (this.isGenealogyMode ? (this.nodeHeight - 20) : this.nodeHeight) / 2;
         ex = endNode.x + this.nodeWidth;
         ey = endNode.y + (this.isGenealogyMode ? (this.nodeHeight - 20) : this.nodeHeight) / 2;
       } else {
         // Parent is to the left of the child
         sx = startNode.x + this.nodeWidth;
         sy = startNode.y + (this.isGenealogyMode ? (this.nodeHeight - 20) : this.nodeHeight) / 2;
         ex = endNode.x;
         ey = endNode.y + (this.isGenealogyMode ? (this.nodeHeight - 20) : this.nodeHeight) / 2;
       }

       const midX = sx + (ex - sx) / 2;
       this.ctx.moveTo(sx, sy);
       this.ctx.lineTo(midX, sy);
       this.ctx.lineTo(midX, ey);
       this.ctx.lineTo(ex, ey);
    }

    this.ctx.stroke();
    this.ctx.restore();
  }

  // Modern genealogy bracket for spouses
  drawGenealogySpouseLine(nodeA, nodeB) {
    this.ctx.save();
    this.ctx.beginPath();
    const isDark = document.body.classList.contains('theme-dark');
    this.ctx.strokeStyle = isDark ? '#ff8cda' : '#e3008c'; // Pink solid
    this.ctx.lineWidth = 2;
    
    // Connect the left edges with a neat bracket to indicate marriage
    const x = nodeA.x;
    const yA = nodeA.y + this.nodeHeight / 2;
    const yB = nodeB.y + this.nodeHeight / 2;
    
    this.ctx.moveTo(x, yA);
    this.ctx.lineTo(x - 20, yA);
    this.ctx.lineTo(x - 20, yB);
    this.ctx.lineTo(x, yB);
    
    this.ctx.stroke();
    this.ctx.restore();
  }

  // Draw dash line for spouse links
  drawSpouseLine(nodeA, nodeB) {
    this.ctx.save();
    if (this.filterType && this.filterType !== 'all') {
      const aMatches = this.filterNodeMatches(nodeA.person);
      const bMatches = this.filterNodeMatches(nodeB.person);
      if (!aMatches || !bMatches) {
        this.ctx.globalAlpha = 0.15;
      }
    }
    this.ctx.strokeStyle = '#e3008c'; // Spousal pinkish/red accent indicator
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([4, 4]);
    this.ctx.beginPath();

    let ax, ay, bx, by;

    if (this.isWorldMode) {
      ax = nodeA.x + this.nodeWidth / 2;
      ay = nodeA.y + this.nodeHeight / 2;
      bx = nodeB.x + this.nodeWidth / 2;
      by = nodeB.y + this.nodeHeight / 2;
      const isDark = document.body.classList.contains('theme-dark');
      this.ctx.strokeStyle = isDark ? 'rgba(255, 140, 218, 0.45)' : 'rgba(227, 0, 140, 0.35)'; // Beautiful semi-transparent pink
      this.ctx.lineWidth = 1.2;
    } else {
      if (this.layoutDirection === 'vertical') {
        ax = nodeA.x + this.nodeWidth;
        ay = nodeA.y + this.nodeHeight / 2;
        bx = nodeB.x;
        by = nodeB.y + this.nodeHeight / 2;
      } else {
        ax = nodeA.x + this.nodeWidth / 2;
        ay = nodeA.y + this.nodeHeight;
        bx = nodeB.x + this.nodeWidth / 2;
        by = nodeB.y;
      }
    }

    this.ctx.moveTo(ax, ay);
    this.ctx.lineTo(bx, by);
    this.ctx.stroke();
    this.ctx.restore();
  }

  // Draw dotted line for lateral sibling links
  drawSiblingLine(nodeA, nodeB) {
    this.ctx.save();
    if (this.filterType && this.filterType !== 'all') {
      const aMatches = this.filterNodeMatches(nodeA.person);
      const bMatches = this.filterNodeMatches(nodeB.person);
      if (!aMatches || !bMatches) {
        this.ctx.globalAlpha = 0.15;
      }
    }
    const isDark = document.body.classList.contains('theme-dark');
    this.ctx.strokeStyle = isDark ? '#b277ff' : '#8855cc'; // Purple-ish indicator for siblings
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([2, 3]); // Dotted line
    this.ctx.beginPath();

    let ax, ay, bx, by;

    if (this.isWorldMode) {
      ax = nodeA.x + this.nodeWidth / 2;
      ay = nodeA.y + this.nodeHeight / 2;
      bx = nodeB.x + this.nodeWidth / 2;
      by = nodeB.y + this.nodeHeight / 2;
      const isDark = document.body.classList.contains('theme-dark');
      this.ctx.strokeStyle = isDark ? 'rgba(178, 119, 255, 0.45)' : 'rgba(136, 85, 204, 0.35)'; // Beautiful semi-transparent purple
      this.ctx.lineWidth = 1.2;
    } else {
      if (this.layoutDirection === 'vertical') {
        ax = nodeA.x + this.nodeWidth;
        ay = nodeA.y + this.nodeHeight / 2 - 15;
        bx = nodeB.x;
        by = nodeB.y + this.nodeHeight / 2 - 15;
      } else {
        ax = nodeA.x + this.nodeWidth / 2 - 15;
        ay = nodeA.y + this.nodeHeight;
        bx = nodeB.x + this.nodeWidth / 2 - 15;
        by = nodeB.y;
      }
    }

    // Rather than just drawing a straight line, let's draw a nice curve if they're not on the same row/col,
    // though in lateral mode they usually are. For simplicity, straight line is fine.
    this.ctx.moveTo(ax, ay);
    this.ctx.lineTo(bx, by);
    this.ctx.stroke();
    this.ctx.restore();
  }

  // Render cards
  drawNodes() {
    this.nodes.forEach(node => {
      const p = node.person;
      const isFocus = String(node.id) === String(this.focusPersonId);
      const isHovered = this.hoverNode && this.hoverNode.id === node.id;
      const isPhotoHovered = this.hoverPhotoNode && this.hoverPhotoNode.id === node.id;
      const isDark = document.body.classList.contains('theme-dark');

      // Update screen coordinates for click collision lookups
      node.screenX = node.x * this.zoom + this.panX;
      node.screenY = node.y * this.zoom + this.panY;

      this.ctx.save();
      
      // Apply filter transparency
      if (this.filterType && this.filterType !== 'all') {
        if (!this.filterNodeMatches(p)) {
          this.ctx.globalAlpha = 0.15;
        }
      }

      // Card drop shadow
      this.ctx.shadowColor = isDark ? 'rgba(0, 0, 0, 0.45)' : 'rgba(0, 0, 0, 0.05)';
      this.ctx.shadowBlur = isFocus ? 12 : 5;
      this.ctx.shadowOffsetY = 2;

      // Accent border
      let strokeColor = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)';
      if (isFocus) {
        strokeColor = isDark ? '#60cdff' : '#0078d4'; // Fluent blue glow
      } else if (isHovered) {
        strokeColor = isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.2)';
      }

      // Card Fill
      let fillColor = isDark ? '#2d2d2d' : '#ffffff';
      const heatmapToggle = document.getElementById('toggle-v8-heatmap');
      const isHeatmapActive = heatmapToggle && heatmapToggle.checked;
      
      if (isHeatmapActive) {
        let lifespan = 75; // Default fallback lifespan
        
        if (p.birthYear && p.deathYear) {
          lifespan = p.deathYear - p.birthYear;
        } else if (p.birthYear) {
          // If alive, calculate up to current year
          const currentYear = new Date().getFullYear();
          lifespan = currentYear - p.birthYear;
        } else {
          // Deterministic fallback based on ID hash
          let hash = 0;
          const idStr = String(p.id);
          for (let i = 0; i < idStr.length; i++) {
            hash = idStr.charCodeAt(i) + ((hash << 5) - hash);
          }
          lifespan = 40 + Math.abs(hash % 50); // Fallback between 40 and 90 years
        }
        
        // Clamp lifespan between 0 and 100
        lifespan = Math.max(0, Math.min(100, lifespan));
        
        // Hue: 0 (coral/red) to 200 (teal/blue)
        const hue = (lifespan / 100) * 200;
        const sat = isDark ? '40%' : '75%';
        const light = isDark ? '25%' : '90%';
        fillColor = `hsl(${hue}, ${sat}, ${light})`;
        
        if (isHovered) {
          const hoverLight = isDark ? '32%' : '84%';
          fillColor = `hsl(${hue}, ${sat}, ${hoverLight})`;
        }
      } else {
        if (isFocus) {
          fillColor = isDark ? '#2d2d2d' : '#ffffff';
        } else if (isHovered) {
          fillColor = isDark ? '#383838' : '#fafafa';
        }
      }

      if (this.isGenealogyMode) {
        this.ctx.strokeStyle = strokeColor;
        this.ctx.lineWidth = isFocus ? 2.5 : 1;
        this.ctx.fillStyle = fillColor;

        if (this.isWorldMode) {
          // Network Node mode: Circular dots
          this.ctx.beginPath();
          this.ctx.arc(node.x + this.nodeWidth/2, node.y + this.nodeHeight/2, 24, 0, Math.PI * 2);
          this.ctx.fill();
          this.ctx.stroke();

          // Render circular image inside circle
          if (p.photo) {
            this.drawCircularAvatar(p.photo, node.x + this.nodeWidth/2, node.y + this.nodeHeight/2, 22);
          } else {
            // Colored circle with initials
            this.ctx.fillStyle = p.gender === 'M' ? (isDark ? '#60cdff' : '#0078d4') : (isDark ? '#ff8cda' : '#e3008c');
            this.ctx.beginPath();
            this.ctx.arc(node.x + this.nodeWidth/2, node.y + this.nodeHeight/2, 22, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Draw initials
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = 'bold 11px Outfit, sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            const initials = (p.firstName ? p.firstName[0] : '') + (p.familyName ? p.familyName[0] : '');
            this.ctx.fillText(initials.toUpperCase(), node.x + this.nodeWidth/2, node.y + this.nodeHeight/2);
          }

          // Draw name below circle
          this.ctx.fillStyle = isDark ? '#ffffff' : '#1f1f1f';
          this.ctx.font = 'bold 11px Outfit, sans-serif';
          this.ctx.textAlign = 'center';
          this.ctx.textBaseline = 'top';
          const firstName = p.firstName || (p.name ? p.name.split(' ')[0] : '') || '';
          const familyName = p.familyName || '';
          this.ctx.fillText(firstName, node.x + this.nodeWidth/2, node.y + this.nodeHeight/2 + 28);
          if (familyName) {
            this.ctx.font = 'Outfit, sans-serif';
            this.ctx.fillStyle = isDark ? '#aaaaaa' : '#555555';
            this.ctx.fillText(familyName, node.x + this.nodeWidth/2, node.y + this.nodeHeight/2 + 40);
          }
        } else {
          // Classic Genealogy pedigree style box
          this.ctx.shadowBlur = isFocus ? 8 : 2;
          const cardH = this.nodeHeight - 20; // 50
          
          this.ctx.beginPath();
          this.drawRoundedRect(node.x, node.y, this.nodeWidth, cardH, 6);
          this.ctx.fill();
          this.ctx.stroke();

          // Draw small photo on left
          const cx = node.x + 22;
          const cy = node.y + cardH / 2;
          const radius = 16;
          if (p.photo) {
            this.drawCircularAvatar(p.photo, cx, cy, radius);
          } else {
            // Draw colored placeholder circle
            this.ctx.fillStyle = p.gender === 'M' ? (isDark ? '#3b78ab' : '#b2d4f5') : (isDark ? '#ab3b82' : '#f5b2dc');
            this.ctx.beginPath();
            this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            this.ctx.fill();

            // Draw initials
            this.ctx.fillStyle = isDark ? '#ffffff' : '#333333';
            this.ctx.font = 'bold 9px Outfit, sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            const initials = (p.firstName ? p.firstName[0] : '') + (p.familyName ? p.familyName[0] : '');
            this.ctx.fillText(initials.toUpperCase(), cx, cy);
          }

          // Draw name next to photo
          this.ctx.fillStyle = isDark ? '#ffffff' : '#1f1f1f';
          this.ctx.font = 'bold 11px Outfit, sans-serif';
          this.ctx.textAlign = 'left';
          this.ctx.textBaseline = 'middle';
          const displayName = p.name.length > 18 ? p.name.substring(0, 16) + '..' : p.name;
          
          // Lifespan string
          const birth = p.birthYear || '?';
          const death = p.deathYear || (p.birthYear ? 'Alive' : '?');
          const lifespanStr = `${birth} - ${death}`;

          // Write name and lifespan
          this.ctx.fillText(displayName, node.x + 48, node.y + cardH / 2 - 7);
          this.ctx.font = '500 9px Outfit, sans-serif';
          this.ctx.fillStyle = isDark ? '#bbbbbb' : '#777777';
          this.ctx.fillText(lifespanStr, node.x + 48, node.y + cardH / 2 + 7);
        }

        this.ctx.restore();
        return;
      }

      // Modern rounded card
      this.ctx.strokeStyle = strokeColor;
      this.ctx.lineWidth = isFocus ? 2.5 : 1;
      this.ctx.fillStyle = fillColor;
      this.drawRoundedRect(node.x, node.y, this.nodeWidth, this.nodeHeight, 6);
      this.ctx.fill();
      this.ctx.stroke();

      // Draw gender left accent bar
      this.ctx.shadowBlur = 0; // reset shadow for text/decorations
      this.ctx.shadowOffsetY = 0;

      this.ctx.fillStyle = p.gender === 'M' ? (isDark ? '#60cdff' : '#0078d4') : (isDark ? '#ff8cda' : '#e3008c');
      this.drawRoundedRect(node.x + 1, node.y + 1, 4, this.nodeHeight - 2, { tl: 5, bl: 5, tr: 0, br: 0 });
      this.ctx.fill();

      // Draw Node Focus Ring
      if (isFocus) {
        this.ctx.strokeStyle = isDark ? 'rgba(96, 205, 255, 0.2)' : 'rgba(0, 120, 212, 0.15)';
        this.ctx.lineWidth = 5;
        this.drawRoundedRect(node.x - 2, node.y - 2, this.nodeWidth + 4, this.nodeHeight + 4, 8);
        this.ctx.stroke();
      }

      // Render Photo Avatar if exists
      const textOffsetX = p.photo ? 58 : 16;
      if (p.photo) {
        if (!this.imageCache.has(p.photo)) {
          const img = new Image();
          img.src = p.photo;
          img.onload = () => {
            this.imageCache.set(p.photo, img);
            this.draw(); // Trigger redraw when image loads
          };
          img.onerror = () => {
            this.imageCache.set(p.photo, 'error'); // Mark as error so we don't retry forever
          };
          this.imageCache.set(p.photo, 'loading');
        }

        const img = this.imageCache.get(p.photo);
        
        let zoom = 1.0;
        if (isPhotoHovered) {
          if (!node.photoZoom) node.photoZoom = 1.0;
          if (node.photoZoom < 3.0) {
            node.photoZoom += 0.15;
            requestAnimationFrame(() => this.draw());
          }
          zoom = node.photoZoom;
        } else {
          if (node.photoZoom && node.photoZoom > 1.0) {
            node.photoZoom -= 0.15;
            if (node.photoZoom < 1.0) node.photoZoom = 1.0;
            requestAnimationFrame(() => this.draw());
          }
          zoom = node.photoZoom || 1.0;
        }

        const radius = 20 * zoom;
        const dia = 40 * zoom;
        const cx = node.x + 30;
        const cy = node.y + this.nodeHeight / 2;

        if (img instanceof Image) {
          this.ctx.save();
          
          this.ctx.beginPath();
          this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          this.ctx.closePath();
          
          // Outer accent ring for hovered photo
          if (isPhotoHovered) {
            this.ctx.lineWidth = 2;
            this.ctx.strokeStyle = isDark ? '#60cdff' : '#0078d4';
            this.ctx.stroke();
          }

          this.ctx.clip();
          
          // Draw with object-fit: cover logic
          const imgAspect = img.width / img.height;
          let drawW = dia;
          let drawH = dia;
          if (imgAspect > 1) {
            drawW = dia * imgAspect;
          } else {
            drawH = dia / imgAspect;
          }
          this.ctx.drawImage(img, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
          this.ctx.restore();
        } else {
          // Placeholder circular skeleton while loading or on error
          this.ctx.fillStyle = isDark ? '#444' : '#e0e0e0';
          this.ctx.beginPath();
          this.ctx.arc(cx, cy, radius, 0, Math.PI * 2, true);
          this.ctx.fill();
        }
      }

      // TEXT DRAWING
      this.ctx.fillStyle = isDark ? '#ffffff' : '#1f1f1f';
      
      const truncateText = (text, maxWidth) => {
        let t = text;
        if (this.ctx.measureText(t).width > maxWidth) {
          while (this.ctx.measureText(t + '...').width > maxWidth && t.length > 0) {
            t = t.slice(0, -1);
          }
          t += '...';
        }
        return t;
      };

      if (p.firstName || p.familyName) {
        // Draw First Name
        this.ctx.font = 'bold 12px Outfit, sans-serif';
        const dispFirstName = truncateText(p.firstName || p.name.split(' ')[0] || '', this.nodeWidth - 24);
        if (!(this.isGenealogyMode && this.isWorldMode)) {
          this.ctx.fillText(dispFirstName, node.x + textOffsetX, node.y + (this.isGenealogyMode ? 16 : 20));
        }

        // Draw Family Name
        this.ctx.font = '800 12px Outfit, sans-serif';
        const dispFamilyName = truncateText(p.familyName || p.name.split(' ').slice(1).join(' ') || '', this.nodeWidth - 24);
        if (!(this.isGenealogyMode && this.isWorldMode)) {
          this.ctx.fillText(dispFamilyName, node.x + textOffsetX, node.y + (this.isGenealogyMode ? 30 : 34));
        }
      } else {
        // Fallback for full name
        this.ctx.font = 'bold 12px Outfit, sans-serif';
        const dispName = truncateText(p.name, this.nodeWidth - 24);
        if (!(this.isGenealogyMode && this.isWorldMode)) {
          this.ctx.fillText(dispName, node.x + textOffsetX, node.y + (this.isGenealogyMode ? 24 : 26));
        }
      }

      // Draw subtitle (Gender label / Spouse / Generation badge)
      this.ctx.font = '500 9px Outfit, sans-serif';
      this.ctx.fillStyle = isDark ? '#bbbbbb' : '#7a7a7a';
      
      let subtitle = p.gender === 'M' ? 'Male' : 'Female';
      if (p.spouses && p.spouses.length > 0) {
        if (p.spouses.length === 1) {
          subtitle += ` • Spouse: ${p.spouses[0].split(' ')[0]}`;
        } else {
          subtitle += ` • Spouses: ${p.spouses.length}`;
        }
      }
      this.ctx.fillText(subtitle, node.x + textOffsetX, node.y + 48);

      // Render mini badge indicating generation relationship to focus
      this.ctx.font = 'bold 7px Outfit, sans-serif';
      this.ctx.fillStyle = isFocus ? (isDark ? '#60cdff' : '#0078d4') : (isDark ? '#888888' : '#a0a0a0');
      
      let badgeLabel = '';
      if (this.isWorldMode) {
        badgeLabel = `GENERATION ${node.layerIdx}`;
      } else {
        if (node.layerIdx === 0) {
           if (isFocus) badgeLabel = 'FOCUS';
           else {
               const focusPerson = this.engine.getPerson(this.focusPersonId);
               if (focusPerson && focusPerson.spouses && focusPerson.spouses.includes(node.person.name)) {
                   badgeLabel = 'SPOUSE';
               } else {
                   badgeLabel = 'SIBLING';
               }
           }
        }
        else if (node.layerIdx === -1) badgeLabel = 'PARENT';
        else if (node.layerIdx === -2) badgeLabel = 'GRANDPARENT';
        else if (node.layerIdx === -3) badgeLabel = 'GREAT-GRANDPARENT';
        else if (node.layerIdx === -4) badgeLabel = 'GREAT-GREAT-GRANDPARENT';
        else if (node.layerIdx === 1) badgeLabel = 'CHILD';
        else if (node.layerIdx === 2) badgeLabel = 'GRANDCHILD';
        else if (node.layerIdx === 3) badgeLabel = 'GREAT-GRANDCHILD';
        else if (node.layerIdx === 4) badgeLabel = 'GREAT-GREAT-GRANDCHILD';
      }

      this.ctx.fillText(badgeLabel, node.x + textOffsetX, node.y + 59);

      this.ctx.restore();
    });
  }

  // Helper method to draw a rounded rectangle
  drawRoundedRect(x, y, width, height, radius) {
    let r = { tl: 0, tr: 0, br: 0, bl: 0 };
    if (typeof radius === 'number') {
      r = { tl: radius, tr: radius, br: radius, bl: radius };
    } else {
      r = { ...r, ...radius };
    }

    this.ctx.beginPath();
    this.ctx.moveTo(x + r.tl, y);
    this.ctx.lineTo(x + width - r.tr, y);
    this.ctx.quadraticCurveTo(x + width, y, x + width, y + r.tr);
    this.ctx.lineTo(x + width, y + height - r.br);
    this.ctx.quadraticCurveTo(x + width, y + height, x + width - r.br, y + height);
    this.ctx.lineTo(x + r.bl, y + height);
    this.ctx.quadraticCurveTo(x, y + height, x, y + height - r.bl);
    this.ctx.lineTo(x, y + r.tl);
    this.ctx.quadraticCurveTo(x, y, x + r.tl, y);
    this.ctx.closePath();
  }

  // Helper method to draw a circular image clip
  drawCircularAvatar(photoUrl, cx, cy, radius) {
    if (!this.imageCache.has(photoUrl)) {
      const img = new Image();
      img.src = photoUrl;
      img.onload = () => {
        this.imageCache.set(photoUrl, img);
        this.draw(); // Redraw once loaded
      };
      img.onerror = () => {
        this.imageCache.set(photoUrl, 'error');
      };
      this.imageCache.set(photoUrl, 'loading');
    }

    const img = this.imageCache.get(photoUrl);
    if (img instanceof Image) {
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      this.ctx.clip();
      
      const imgAspect = img.width / img.height;
      const dia = radius * 2;
      let drawW = dia;
      let drawH = dia;
      if (imgAspect > 1) {
        drawW = dia * imgAspect;
      } else {
        drawH = dia / imgAspect;
      }
      this.ctx.drawImage(img, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
      this.ctx.restore();
    } else {
      const isDark = document.body.classList.contains('theme-dark');
      this.ctx.fillStyle = isDark ? '#444' : '#e0e0e0';
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }
}
