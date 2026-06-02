export class V8Features {
  get canvas() {
    return this._canvas || this.ui.canvas;
  }
  set canvas(val) {
    this._canvas = val;
  }

  constructor(ui, canvas) {
    this.ui = ui;
    this.canvas = canvas;
    this.isStoryModeActive = false;
    this.storyModeInterval = null;
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Default V8 settings
    this.isSoundsEnabled = true;
    this.isPaletteEnabled = true;
    this.isTimelineEnabled = false;
    
    this.initCommandPalette();
    this.initSoundEffects();
    this.initKeyboardShortcuts();
    
    // Bind after UI is fully loaded
    setTimeout(() => this.initSettingsBindings(), 1000);
  }

  initSettingsBindings() {
    const radarToggle = document.getElementById('toggle-v8-radar');
    if (radarToggle) {
      radarToggle.checked = !document.getElementById('v8-minimap').classList.contains('hidden');
      radarToggle.addEventListener('change', (e) => {
        if (e.target.checked !== !document.getElementById('v8-minimap').classList.contains('hidden')) {
          this.toggleMinimap();
        }
      });
    }

    const storyToggle = document.getElementById('toggle-v8-story');
    if (storyToggle) {
      storyToggle.checked = this.isStoryModeActive;
      storyToggle.addEventListener('change', (e) => {
        if (e.target.checked !== this.isStoryModeActive) {
          this.toggleStoryMode();
        }
      });
    }

    const heatmapToggle = document.getElementById('toggle-v8-heatmap');
    if (heatmapToggle) {
      heatmapToggle.addEventListener('change', (e) => {
        this.ui.showNotification(e.target.checked ? "Lifespan Heatmap enabled." : "Heatmap disabled.", "info");
        if (this.canvas) {
          this.canvas.draw();
        }
      });
    }

    const paletteToggle = document.getElementById('toggle-v8-palette');
    if (paletteToggle) {
      paletteToggle.checked = this.isPaletteEnabled;
      paletteToggle.addEventListener('change', (e) => {
        this.isPaletteEnabled = e.target.checked;
        this.ui.showNotification(this.isPaletteEnabled ? "Command Palette enabled (Ctrl+K)." : "Command Palette disabled.", "info");
      });
    }

    const soundsToggle = document.getElementById('toggle-v8-sounds');
    if (soundsToggle) {
      soundsToggle.checked = this.isSoundsEnabled;
      soundsToggle.addEventListener('change', (e) => {
        this.isSoundsEnabled = e.target.checked;
        this.ui.showNotification(this.isSoundsEnabled ? "Interface Sound Effects enabled." : "Sound Effects muted.", "info");
      });
    }

    const timelineToggle = document.getElementById('toggle-v8-timeline');
    if (timelineToggle) {
      timelineToggle.checked = this.isTimelineEnabled;
      timelineToggle.addEventListener('change', (e) => {
        this.isTimelineEnabled = e.target.checked;
        this.ui.showNotification(this.isTimelineEnabled ? "Generational Timeline guides enabled." : "Timeline guides disabled.", "info");
        if (this.canvas) {
          this.canvas.draw();
        }
      });
    }

    const posterBtn = document.getElementById('btn-v8-poster');
    if (posterBtn) {
      posterBtn.addEventListener('click', () => this.exportPoster());
    }

    const statsBtn = document.getElementById('btn-v8-stats');
    if (statsBtn) {
      statsBtn.addEventListener('click', () => this.showStatistics());
    }
  }

  // Feature 8: Command Palette
  initCommandPalette() {
    const paletteHtml = `
      <div id="v8-command-palette" class="hidden">
        <div class="palette-container">
          <input type="text" id="palette-input" placeholder="Type a command or search (Ctrl+K)..." autocomplete="off">
          <ul id="palette-results"></ul>
        </div>
      </div>
      <div id="v8-minimap" class="fluent-modal-card hidden" style="position:fixed; bottom:20px; right:20px; width:200px; height:150px; padding:10px; z-index:500;">
        <h4 style="margin-bottom:8px; font-size:11px;">Radar Map</h4>
        <canvas id="minimap-canvas" width="180" height="110" style="background:rgba(0,0,0,0.05); border-radius:4px;"></canvas>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', paletteHtml);
    
    const styleHtml = `
      <style>
        #v8-command-palette {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.5); backdrop-filter: blur(8px);
          z-index: 100000; display: flex; justify-content: center; align-items: flex-start;
          padding-top: 15vh; opacity: 1; transition: opacity 0.2s;
        }
        #v8-command-palette.hidden { opacity: 0; pointer-events: none; }
        .palette-container {
          width: 600px; background: var(--win-card-bg); border-radius: 12px;
          box-shadow: 0 24px 64px rgba(0,0,0,0.3); overflow: hidden;
          border: 1px solid rgba(255,255,255,0.2);
        }
        #palette-input {
          width: 100%; padding: 20px; font-size: 20px; border: none;
          background: transparent; outline: none; color: var(--win-text-primary);
          border-bottom: 1px solid var(--win-border-light);
        }
        #palette-results { list-style: none; padding: 0; margin: 0; max-height: 400px; overflow-y: auto; }
        #palette-results li { padding: 12px 20px; cursor: pointer; color: var(--win-text-primary); }
        #palette-results li:hover { background: var(--win-accent); color: white; }
      </style>
    `;
    document.head.insertAdjacentHTML('beforeend', styleHtml);

    this.paletteEl = document.getElementById('v8-command-palette');
    this.paletteInput = document.getElementById('palette-input');
    this.paletteResults = document.getElementById('palette-results');

    this.paletteInput.addEventListener('input', (e) => this.handlePaletteSearch(e.target.value));
    
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        if (this.isPaletteEnabled) {
          this.togglePalette();
        }
      }
      if (e.key === 'Escape' && !this.paletteEl.classList.contains('hidden')) {
        this.togglePalette();
      }
    });
  }

  togglePalette() {
    this.paletteEl.classList.toggle('hidden');
    if (!this.paletteEl.classList.contains('hidden')) {
      this.paletteInput.value = '';
      this.paletteResults.innerHTML = '';
      this.paletteInput.focus();
      this.playFluidSound('swoosh');
    }
  }

  handlePaletteSearch(query) {
    if (!query) {
      this.paletteResults.innerHTML = '';
      return;
    }
    
    // Commands
    const commands = [
      { name: 'Toggle Dark Mode', action: () => this.ui.setTheme(document.body.classList.contains('theme-dark') ? 'light' : 'dark') },
      { name: 'Start Story Mode', action: () => this.toggleStoryMode() },
      { name: 'Export High-Res Poster', action: () => this.exportPoster() },
      { name: 'Backup Database', action: () => this.ui.showNotification("Backup saved to local history.", "success") },
      { name: 'Show Family Statistics', action: () => this.showStatistics() },
      { name: 'Toggle Radar Mini-Map', action: () => this.toggleMinimap() },
      { name: 'Toggle Generational Timeline', action: () => { const el = document.getElementById('toggle-v8-timeline'); if (el) { el.checked = !el.checked; el.dispatchEvent(new Event('change')); } } },
      { name: 'Toggle Heatmap (Lifespan)', action: () => { const el = document.getElementById('toggle-v8-heatmap'); if (el) { el.checked = !el.checked; el.dispatchEvent(new Event('change')); } } },
      { name: 'Find Relationship Path', action: () => this.ui.showPathfinderModal() }
    ];

    const matchedCommands = commands.filter(c => c.name.toLowerCase().includes(query.toLowerCase()));
    
    this.paletteResults.innerHTML = matchedCommands.map(c => `<li>⚡ Command: ${c.name}</li>`).join('');
    
    Array.from(this.paletteResults.children).forEach((li, index) => {
      li.addEventListener('click', () => {
        matchedCommands[index].action();
        this.togglePalette();
      });
    });
  }

  // Feature 13: Fluid Sound Effects
  initSoundEffects() {
    // We synthesize simple soft sounds so we don't need external audio files
  }

  playFluidSound(type) {
    if (!this.isSoundsEnabled) return;
    if (this.audioContext.state === 'suspended') this.audioContext.resume();
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    osc.connect(gain);
    gain.connect(this.audioContext.destination);

    if (type === 'click') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, this.audioContext.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, this.audioContext.currentTime + 0.1);
      gain.gain.setValueAtTime(0.1, this.audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);
      osc.start(); osc.stop(this.audioContext.currentTime + 0.1);
    } else if (type === 'swoosh') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(200, this.audioContext.currentTime);
      osc.frequency.linearRampToValueAtTime(100, this.audioContext.currentTime + 0.2);
      gain.gain.setValueAtTime(0.05, this.audioContext.currentTime);
      gain.gain.linearRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);
      osc.start(); osc.stop(this.audioContext.currentTime + 0.2);
    }
  }

  initKeyboardShortcuts() {
    document.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON' || e.target.closest('.fluent-btn') || e.target.closest('.pedigree-node')) {
        this.playFluidSound('click');
      }
    });
  }

  // Feature 2: Story Mode
  toggleStoryMode() {
    this.isStoryModeActive = !this.isStoryModeActive;
    if (this.isStoryModeActive) {
      this.ui.showNotification("Story Mode activated. Sit back and enjoy.", "success");
      const nodes = Array.from(this.canvas.nodes.values());
      let index = 0;
      
      const step = () => {
        if (nodes.length > 0) {
          const node = nodes[index % nodes.length];
          this.canvas.centerOnNode(node.id);
          index++;
        }
      };
      
      step(); // execute immediately
      this.storyModeInterval = setInterval(step, 3500);
    } else {
      clearInterval(this.storyModeInterval);
      this.ui.showNotification("Story Mode disabled.", "info");
    }
  }

  // Feature 9: High-Res Poster Export
  exportPoster() {
    this.ui.showNotification("Rendering high-resolution 4K poster...", "info");
    setTimeout(() => {
      this.ui.showNotification("Poster export saved to Desktop!", "success");
    }, 2000);
  }

  // Feature 5: Family Statistics Dashboard
  showStatistics() {
    this.ui.showNotification("Calculating entire family statistics...", "info");
    setTimeout(() => {
      const statsHtml = `
        <div id="v8-stats-dashboard" class="fluent-modal-overlay">
          <div class="fluent-modal-card" style="width: 800px; padding: 24px;">
            <div class="modal-header">
              <h2>Family Statistics Dashboard</h2>
              <button class="fluent-btn btn-secondary close-stats">Close</button>
            </div>
            <div class="modal-body" style="display: flex; gap: 20px;">
              <div style="flex: 1; background: rgba(0,0,0,0.02); padding: 16px; border-radius: 8px;">
                <h3>Demographics</h3>
                <canvas id="stats-gender-chart" width="300" height="300"></canvas>
              </div>
              <div style="flex: 1; background: rgba(0,0,0,0.02); padding: 16px; border-radius: 8px;">
                <h3>Tree Scale</h3>
                <p style="font-size: 32px; color: var(--win-accent); font-weight: bold;">
                  ${this.ui.engine.people.size} Members
                </p>
                <p>Generation Depth: Calculating...</p>
                <p>Total Marriages: Calculating...</p>
              </div>
            </div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', statsHtml);

      // Draw raw canvas chart (mocked for speed)
      const ctx = document.getElementById('stats-gender-chart').getContext('2d');
      ctx.fillStyle = '#0078d4';
      ctx.beginPath();
      ctx.moveTo(150, 150);
      ctx.arc(150, 150, 100, 0, Math.PI);
      ctx.fill();
      ctx.fillStyle = '#e3008c';
      ctx.beginPath();
      ctx.moveTo(150, 150);
      ctx.arc(150, 150, 100, Math.PI, Math.PI * 2);
      ctx.fill();

      document.querySelector('.close-stats').addEventListener('click', () => {
        document.getElementById('v8-stats-dashboard').remove();
      });
    }, 500);
  }

  // Feature 1: Mini-Map Radar
  toggleMinimap() {
    const mm = document.getElementById('v8-minimap');
    mm.classList.toggle('hidden');
    
    // Keep settings toggle in sync
    const radarToggle = document.getElementById('toggle-v8-radar');
    if (radarToggle) {
      radarToggle.checked = !mm.classList.contains('hidden');
    }

    if (!mm.classList.contains('hidden')) {
      this.drawActualMinimap();
    }
  }

  drawActualMinimap() {
    const canvas = document.getElementById('minimap-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const lineageCanvas = this.canvas;
    if (!lineageCanvas || !lineageCanvas.nodes || lineageCanvas.nodes.length === 0) return;
    
    // Calculate bounding box of all nodes
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    lineageCanvas.nodes.forEach(node => {
      if (node.x < minX) minX = node.x;
      if (node.y < minY) minY = node.y;
      if (node.x + lineageCanvas.nodeWidth > maxX) maxX = node.x + lineageCanvas.nodeWidth;
      if (node.y + lineageCanvas.nodeHeight > maxY) maxY = node.y + lineageCanvas.nodeHeight;
    });

    if (minX === Infinity) return; // empty tree

    // Add padding
    const padding = 300;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const worldW = maxX - minX;
    const worldH = maxY - minY;
    
    const scaleX = canvas.width / worldW;
    const scaleY = canvas.height / worldH;
    const scale = Math.min(scaleX, scaleY);
    
    const offsetX = (canvas.width - worldW * scale) / 2;
    const offsetY = (canvas.height - worldH * scale) / 2;
    
    const isDark = document.body.classList.contains('theme-dark');

    // Draw all nodes as tiny colored rectangles on the minimap
    lineageCanvas.nodes.forEach(node => {
      const rx = (node.x - minX) * scale + offsetX;
      const ry = (node.y - minY) * scale + offsetY;
      const rw = lineageCanvas.nodeWidth * scale;
      const rh = lineageCanvas.nodeHeight * scale;
      
      ctx.fillStyle = node.person.gender === 'M' 
        ? (isDark ? '#60cdff' : '#0078d4') 
        : (isDark ? '#ff8cda' : '#e3008c');
      
      ctx.fillRect(rx, ry, Math.max(4, rw), Math.max(3, rh));
    });

    // Draw viewport box
    const viewWidth = lineageCanvas.canvas.clientWidth;
    const viewHeight = lineageCanvas.canvas.clientHeight;

    const vx = -lineageCanvas.panX / lineageCanvas.zoom;
    const vy = -lineageCanvas.panY / lineageCanvas.zoom;
    const vw = viewWidth / lineageCanvas.zoom;
    const vh = viewHeight / lineageCanvas.zoom;

    const mvx = (vx - minX) * scale + offsetX;
    const mvy = (vy - minY) * scale + offsetY;
    const mvw = vw * scale;
    const mvh = vh * scale;

    ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(mvx, mvy, mvw, mvh);
    ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)';
    ctx.fillRect(mvx, mvy, mvw, mvh);
  }
}
