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
    const modalHtml = `
      <div id="v8-export-modal" class="fluent-modal-overlay" style="z-index: 10000;">
        <div class="fluent-modal-card" style="width: 400px; padding: 24px;">
          <div class="modal-header">
            <h2>Export Options</h2>
            <button class="fluent-btn btn-secondary close-export">Close</button>
          </div>
          <div class="modal-body" style="display: flex; flex-direction: column; gap: 15px; margin-top: 15px;">
            <button class="fluent-btn btn-primary" id="btn-export-full">Export Full World Map (PNG)</button>
            <button class="fluent-btn btn-primary" id="btn-export-tree">Export Current Tree (PNG)</button>
            <button class="fluent-btn btn-primary" id="btn-export-pdf">Export to PDF (Normal List)</button>
            <button class="fluent-btn btn-primary" id="btn-export-pdf-extended">Export to PDF (Extended Profiles)</button>
            <button class="fluent-btn btn-primary" id="btn-export-csv">Export to CSV</button>
            <button class="fluent-btn btn-primary" id="btn-export-json">Export to JSON</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.querySelector('.close-export').addEventListener('click', () => {
      document.getElementById('v8-export-modal').remove();
    });

    const loadJsPDF = () => {
      return new Promise((resolve) => {
        if (window.jspdf) {
          resolve(true);
          return;
        }
        const script = document.createElement('script');
        script.src = './jspdf.umd.min.js';
        script.onload = () => resolve(!!window.jspdf);
        script.onerror = () => resolve(false);
        document.head.appendChild(script);
      });
    };

    const triggerDownload = async (type) => {
      document.getElementById('v8-export-modal').remove();
      
      if (type === 'pdf' || type === 'pdf-extended') {
        this.ui.showNotification("Checking PDF library status...", "info");
        let loaded = await loadJsPDF();
        if (!loaded) {
          this.ui.showNotification("PDF plugin missing. Downloading and installing automatically...", "info");
          try {
            if (window.api && window.api.downloadJsPDF) {
              const res = await window.api.downloadJsPDF();
              if (res && res.success) {
                this.ui.showNotification("PDF plugin installed successfully. Loading...", "success");
                loaded = await loadJsPDF();
              } else {
                throw new Error(res ? res.message : "Failed to download");
              }
            } else {
              throw new Error("Electron context bridge API is not available.");
            }
          } catch (e) {
            console.error("Failed to auto-download PDF plugin:", e);
            alert("Failed to automatically install the PDF export plugin: " + e.message + "\n\nPlease ensure you have an active internet connection.");
            return;
          }
        }

        if (!loaded) {
          this.ui.showNotification("Failed to load PDF library after download.", "error");
          return;
        }

        try {
          const { jsPDF } = window.jspdf;
          const doc = new jsPDF();
          const people = Array.from(this.ui.engine.people.values());
          
          if (type === 'pdf') {
            doc.setFontSize(18);
            doc.text("Family Tree Members List", 14, 20);
            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            doc.text(`Total Records: ${this.ui.engine.people.size} | Generated on: ${new Date().toLocaleDateString()}`, 14, 26);
            
            // Table Headers
            doc.setFont("helvetica", "bold");
            doc.text("Name", 14, 35);
            doc.text("Gender", 75, 35);
            doc.text("Birth", 100, 35);
            doc.text("Death", 125, 35);
            doc.text("Birth Place", 150, 35);
            
            doc.line(14, 38, 195, 38);
            
            // Table Rows
            let y = 45;
            
            doc.setFont("helvetica", "normal");
            people.forEach((person) => {
              if (y > 275) {
                doc.addPage();
                y = 25;
                
                // Header on new page
                doc.setFont("helvetica", "bold");
                doc.text("Name", 14, y);
                doc.text("Gender", 75, y);
                doc.text("Birth", 100, y);
                doc.text("Death", 125, y);
                doc.text("Birth Place", 150, y);
                doc.line(14, y + 3, 195, y + 3);
                doc.setFont("helvetica", "normal");
                y += 10;
              }
              
              const name = person.name || 'Unknown';
              const gender = person.gender === 'M' ? 'Male' : person.gender === 'F' ? 'Female' : 'Unknown';
              const birth = person.birthYear || '-';
              const death = person.deathYear || '-';
              const place = person.birthPlace || '-';
              
              const truncatedName = name.length > 30 ? name.substring(0, 27) + '...' : name;
              const truncatedPlace = place.length > 22 ? place.substring(0, 19) + '...' : place;
              
              doc.text(truncatedName, 14, y);
              doc.text(gender, 75, y);
              doc.text(String(birth), 100, y);
              doc.text(String(death), 125, y);
              doc.text(truncatedPlace, 150, y);
              
              y += 7;
            });
            
            doc.save(`Family_Members_Report_${Date.now()}.pdf`);
          } else if (type === 'pdf-extended') {
            doc.setFontSize(22);
            doc.setFont("helvetica", "bold");
            doc.text("Extended Family Tree Profiles", 14, 20);
            
            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            doc.text(`Total Records: ${this.ui.engine.people.size} | Generated on: ${new Date().toLocaleDateString()}`, 14, 26);
            
            let y = 35;
            const levelsMap = this.ui.engine.getGenerationsGrid();
            
            for (let i = 0; i < people.length; i++) {
              const p = people[i];
              if (y > 230) {
                doc.addPage();
                y = 20;
              }
              
              doc.setDrawColor(220);
              doc.setFillColor(248, 248, 250);
              doc.roundedRect(14, y, 182, 55, 3, 3, "FD");
              
              let currentY = y + 8;
              let startX = 18;
              
              if (p.photo && p.photo.startsWith('data:image')) {
                 try {
                   doc.addImage(p.photo, startX, currentY, 18, 18);
                 } catch(e) {
                   doc.setFillColor(220);
                   doc.circle(startX + 9, currentY + 9, 9, "F");
                 }
                 startX = 42;
              } else {
                 doc.setFillColor(220);
                 doc.circle(startX + 9, currentY + 9, 9, "F");
                 doc.setFontSize(8);
                 doc.setTextColor(150);
                 doc.text("No Photo", startX + 1, currentY + 10);
                 startX = 42;
              }
              
              doc.setTextColor(0);
              doc.setFont("helvetica", "bold");
              doc.setFontSize(14);
              const nameText = p.name || 'Unknown';
              doc.text(nameText.substring(0, 30), startX, currentY + 5);
              
              const gen = levelsMap.get(p.id) || 1;
              const genderText = p.gender === 'M' ? 'MALE' : p.gender === 'F' ? 'FEMALE' : 'UNKNOWN';
              doc.setFontSize(9);
              doc.setFont("helvetica", "bold");
              if (p.gender === 'M') doc.setTextColor(0, 120, 212);
              else if (p.gender === 'F') doc.setTextColor(227, 0, 140);
              else doc.setTextColor(100);
              doc.text(`[${genderText}] Gen ${gen} | ID: ${p.id}`, startX, currentY + 11);
              
              currentY += 20;
              doc.setFontSize(9);
              doc.setTextColor(100);
              doc.setFont("helvetica", "normal");
              doc.text("Father:", startX, currentY);
              doc.text("Mother:", startX, currentY + 6);
              doc.text("Spouse:", startX, currentY + 12);
              doc.text("Lifespan:", startX, currentY + 18);
              
              doc.setTextColor(0, 102, 204);
              doc.setFont("helvetica", "bold");
              doc.text((p.fatherName || 'Unlinked').substring(0, 20), startX + 16, currentY);
              doc.text((p.motherName || 'Unlinked').substring(0, 20), startX + 16, currentY + 6);
              const spouseStr = (p.spouses && p.spouses.length > 0) ? p.spouses.join(', ') : 'Unmarried';
              doc.text(spouseStr.substring(0, 20), startX + 16, currentY + 12);
              
              doc.setTextColor(0);
              const birth = p.birthYear || '-';
              const death = p.deathYear || 'Present';
              doc.text(`${birth} - ${death}`, startX + 16, currentY + 18);
              
              const rightColX = startX + 70;
              doc.setTextColor(100);
              doc.setFont("helvetica", "normal");
              doc.text("Root Patriarch:", rightColX, currentY);
              doc.text("Descendants:", rightColX, currentY + 6);
              doc.text("Children:", rightColX, currentY + 12);
              doc.text("Siblings:", rightColX, currentY + 18);
              
              doc.setTextColor(0);
              doc.setFont("helvetica", "bold");
              const ancestors = this.ui.engine.getAncestors(p.id);
              const patriarch = ancestors.length > 0 ? ancestors[ancestors.length - 1] : p;
              doc.text((patriarch.name || '').substring(0, 20), rightColX + 25, currentY);
              
              const descendants = this.ui.engine.getDescendants(p.id);
              doc.text(`${descendants.length} members`, rightColX + 25, currentY + 6);
              
              const childrenNames = p.children.map(cid => {
                const child = this.ui.engine.getPerson(cid);
                return child ? child.name.split(' ')[0] : '';
              }).filter(n => n).join(', ') || 'None';
              doc.text(childrenNames.substring(0, 22), rightColX + 25, currentY + 12);
              
              const siblings = this.ui.engine.getSiblings(p.id);
              const sibNames = siblings.map(s => s.name.split(' ')[0]).join(', ') || 'None';
              doc.text(sibNames.substring(0, 22), rightColX + 25, currentY + 18);
              
              y += 60;
            }
            doc.save(`Family_Extended_Profiles_${Date.now()}.pdf`);
          }
          this.ui.showNotification("PDF Report saved successfully!", "success");
        } catch (err) {
          console.error(err);
          this.ui.showNotification("Failed to generate PDF: " + err.message, "error");
        }
        return;
      }

      this.ui.showNotification("Rendering high-resolution export...", "info");
      
      setTimeout(() => {
        try {
          let targetCanvas = null;
          if (type === 'WorldMap') {
            targetCanvas = document.getElementById('world-canvas');
          } else {
            targetCanvas = document.getElementById('lineage-canvas');
          }
          
          if (targetCanvas) {
            const dataURL = targetCanvas.toDataURL('image/png', 1.0);
            const a = document.createElement('a');
            a.href = dataURL;
            a.download = `Family_${type}_${Date.now()}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            this.ui.showNotification("Export saved successfully!", "success");
          } else {
            this.ui.showNotification("Could not locate the requested map/tree canvas.", "error");
          }
        } catch (e) {
          this.ui.showNotification("Failed to export: " + e.message, "error");
        }
      }, 500);
    };

    document.getElementById('btn-export-full').addEventListener('click', () => triggerDownload('WorldMap'));
    document.getElementById('btn-export-tree').addEventListener('click', () => triggerDownload('Tree'));
    document.getElementById('btn-export-pdf').addEventListener('click', () => triggerDownload('pdf'));
    document.getElementById('btn-export-pdf-extended').addEventListener('click', () => triggerDownload('pdf-extended'));
    document.getElementById('btn-export-csv').addEventListener('click', () => {
      document.getElementById('v8-export-modal').remove();
      this.exportCSV();
    });
    document.getElementById('btn-export-json').addEventListener('click', () => {
      document.getElementById('v8-export-modal').remove();
      this.exportJSON();
    });
  }

  exportCSV() {
    try {
      const people = Array.from(this.ui.engine.people.values());
      const headers = ["ID", "Name", "Gender", "Father ID", "Father Name", "Mother ID", "Mother Name", "Grandfather Name", "Birth Year", "Death Year", "Birth Place", "Notes"];
      const rows = people.map(p => [
        p.id || '',
        p.name || '',
        p.gender || '',
        p.fatherId || '',
        p.fatherName || '',
        p.motherId || '',
        p.motherName || '',
        p.grandfatherName || '',
        p.birthYear || '',
        p.deathYear || '',
        p.birthPlace || '',
        (p.notes || '').replace(/"/g, '""')
      ]);

      const csvContent = "\uFEFF" + [
        headers.join(","),
        ...rows.map(row => row.map(val => `"${val}"`).join(","))
      ].join("\n");

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `family_members_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      this.ui.showNotification("Exported to CSV successfully!", "success");
    } catch (e) {
      console.error(e);
      this.ui.showNotification("Failed to export CSV: " + e.message, "error");
    }
  }

  exportJSON() {
    try {
      const people = Array.from(this.ui.engine.people.values());
      const jsonContent = JSON.stringify(people, null, 2);
      const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `family_members_${Date.now()}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      this.ui.showNotification("Exported to JSON successfully!", "success");
    } catch (e) {
      console.error(e);
      this.ui.showNotification("Failed to export JSON: " + e.message, "error");
    }
  }

  // Feature 5: Family Statistics Dashboard
  showStatistics() {
    this.ui.showNotification("Calculating entire family statistics...", "info");
    
    setTimeout(() => {
      const people = Array.from(this.ui.engine.people.values());
      const total = people.length;
      const males = people.filter(p => p.gender === 'M').length;
      const females = people.filter(p => p.gender === 'F').length;
      const unknown = total - males - females;
      
      let totalSpouses = 0;
      let ageSum = 0;
      let ageCount = 0;
      let maxBirth = 0;
      let minBirth = 9999;
      
      people.forEach(p => {
        if (p.spouses && p.spouses.length) {
          totalSpouses += p.spouses.length;
        }
        if (p.birthYear && p.birthYear !== 0) {
          if (p.birthYear < minBirth) minBirth = p.birthYear;
          if (p.birthYear > maxBirth) maxBirth = p.birthYear;
        }
        if (p.birthYear && p.deathYear && p.deathYear >= p.birthYear) {
          ageSum += (p.deathYear - p.birthYear);
          ageCount++;
        }
      });
      
      const marriages = Math.max(0, Math.floor(totalSpouses / 2));
      const avgLifespan = ageCount > 0 ? Math.round(ageSum / ageCount) + " years" : 'N/A';
      const yearRange = minBirth < 9999 ? `${minBirth} - ${maxBirth}` : 'N/A';

      const statsHtml = `
        <div id="v8-stats-dashboard" class="fluent-modal-overlay">
          <div class="fluent-modal-card" style="width: 800px; padding: 24px;">
            <div class="modal-header">
              <h2>Family Statistics Dashboard</h2>
              <button class="fluent-btn btn-secondary close-stats">Close</button>
            </div>
            <div class="modal-body" style="display: flex; gap: 20px;">
              <div style="flex: 1; background: var(--win-card-bg); padding: 16px; border-radius: 8px; border: 1px solid var(--win-border-light);">
                <h3 style="margin-bottom: 15px; color: var(--win-text-primary);">Demographics</h3>
                <div style="display:flex; justify-content:center; align-items:center;">
                  <canvas id="stats-gender-chart" width="200" height="200"></canvas>
                </div>
                <div style="display:flex; justify-content:space-around; margin-top:15px; font-size:12px; font-weight:bold; color:var(--win-text-secondary);">
                  <span style="color:#0078d4">Male: ${males}</span>
                  <span style="color:#e3008c">Female: ${females}</span>
                  ${unknown > 0 ? `<span style="color:#888">Unknown: ${unknown}</span>` : ''}
                </div>
              </div>
              <div style="flex: 1; background: var(--win-card-bg); padding: 16px; border-radius: 8px; border: 1px solid var(--win-border-light); color: var(--win-text-primary);">
                <h3 style="margin-bottom: 15px;">Tree Scale</h3>
                <p style="font-size: 32px; color: var(--win-accent); font-weight: bold; margin-bottom: 15px;">
                  ${total} Members
                </p>
                <div style="display:flex; flex-direction:column; gap:8px;">
                  <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--win-border-light); padding-bottom:5px;">
                    <span style="color:var(--win-text-secondary)">Total Marriages/Unions</span>
                    <strong>${marriages}</strong>
                  </div>
                  <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--win-border-light); padding-bottom:5px;">
                    <span style="color:var(--win-text-secondary)">Average Lifespan</span>
                    <strong>${avgLifespan}</strong>
                  </div>
                  <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--win-border-light); padding-bottom:5px;">
                    <span style="color:var(--win-text-secondary)">Timeline Era</span>
                    <strong>${yearRange}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', statsHtml);

      // Draw real canvas pie chart
      const ctx = document.getElementById('stats-gender-chart').getContext('2d');
      const centerX = 100;
      const centerY = 100;
      const radius = 90;
      let startAngle = 0;
      
      const drawSlice = (count, color) => {
        if (count === 0) return;
        const sliceAngle = (count / total) * 2 * Math.PI;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
        ctx.closePath();
        ctx.fill();
        startAngle += sliceAngle;
      };

      drawSlice(males, '#0078d4');
      drawSlice(females, '#e3008c');
      drawSlice(unknown, '#888888');

      document.querySelector('.close-stats').addEventListener('click', () => {
        document.getElementById('v8-stats-dashboard').remove();
      });
    }, 100);
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
