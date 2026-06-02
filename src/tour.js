/* ==========================================================================
   INTERACTIVE SPOTLIGHT ONBOARDING TOUR DRIVER
   ========================================================================== */

export class FamilyTreeTour {
  constructor(ui) {
    this.ui = ui;
    this.currentStepIndex = -1;
    this.backdrop = null;
    this.tooltip = null;
    this.highlightedElement = null;
    
    this.activeTourType = 'masterclass';
    this.steps = [];
    this.elevatedParents = [];
    
    // Defined steps for the guided user masterclass (narrating the 5-member preset)
    this.masterclassSteps = [
      {
        elementId: 'app-titlebar',
        placement: 'bottom',
        title: 'Miller Family Masterclass! (Version 4.0)',
        text: 'Welcome! I have instantly loaded a perfect family tree preset. In Version 4.0, we support sub-2ms prefix token searching, 8-generation pedigree layouts, smooth camera panning, and Dark Mode theme switching. Let\'s explore!',
        trigger: 'next'
      },
      {
        elementId: 'btn-nav-explorer',
        placement: 'right',
        title: 'Step 1: Visual Tree Explorer',
        text: 'Let\'s visualize their connections. <strong>Click the "Tree Explorer" tab</strong> in the sidebar to proceed.',
        trigger: 'click',
        tabName: 'explorer'
      },
      {
        elementId: 'pedigree-focus',
        placement: 'bottom',
        title: 'Step 2: 8-Generation Pedigree Focus & Eased Cameras',
        text: 'Meet <strong>John Miller</strong> at the center! In V4, the visual layout tracks up to 8 generations (4 up, 4 down) with matching relationship badges. Click any node to watch the viewport camera smoothly pan and zoom to center on them! Click **Next**.',
        trigger: 'next'
      },
      {
        elementId: 'lineage-canvas-wrapper',
        placement: 'left',
        title: 'Step 3: Curved Connections & Spousal Pink Lines',
        text: 'Look at the Canvas! Curved splines connect Grandfather <strong>William</strong> to his son <strong>Robert</strong>, and Robert to <strong>John</strong> & <strong>Sarah</strong>. The pink dashed line represents the marriage link between <strong>Robert & Mary</strong>! Click **Next**.',
        trigger: 'next'
      },
      {
        elementId: 'btn-nav-members',
        placement: 'right',
        title: 'Step 4: Central Paged Registry Grid',
        text: 'Let\'s see how the registry manages them. <strong>Click the "All Members" tab</strong> in the sidebar.',
        trigger: 'click',
        tabName: 'members'
      },
      {
        elementId: 'grid-view-btn-P-105',
        placement: 'left',
        title: 'Step 5: Lineage Diagnostics Modal',
        text: 'Here is the family database! It lists names, fathers, grandfathers, genders, and generations. <strong>Click this View button</strong> on John Miller\'s row to open his analytics!',
        trigger: 'click'
      },
      {
        elementId: 'modal-member-detail',
        placement: 'left',
        title: 'Step 6: Paternal & Maternal Lineage Analytics',
        text: 'Behold the beauty! The engine calculates John\'s direct grandfather as **William**, lists his siblings, spouses, children, and descendants. Click **Next** to check out the parser guidelines.',
        trigger: 'next'
      },
      {
        elementId: 'btn-nav-import',
        placement: 'right',
        title: 'Step 7: Smart Add & Import Engine',
        text: 'Want to add members? <strong>Click the "Add / Import" tab</strong> in the sidebar to view our natural language parsing guide.',
        trigger: 'click',
        tabName: 'import'
      },
      {
        elementId: 'textarea-bulk',
        placement: 'left',
        title: 'Step 8: Custom ID Formats (Linear & CSV)',
        text: 'To avoid duplicate name collisions, specify custom IDs! <br><br>• <strong>Linear Chains:</strong> Wrap the ID in parentheses or brackets: <code>(dd5ssd) john son of ahmad</code> or <code>[jm-1] john son of ahmad</code>.<br>• <strong>CSV Format:</strong> Put the ID in the first column: <code>55df, john</code>, <code>1, john</code>, or <code>aaaaa-aaa-a1, john</code>.<br><br>The engine links these recursively! Click **Next**.',
        trigger: 'next'
      },
      {
        elementId: 'btn-titlebar-settings',
        placement: 'bottom',
        title: 'Step 9: Personalization & Themes',
        text: 'In Version 4.0, you can personalize the application theme! <strong>Click the Settings button</strong> in the titlebar next to the database button to open the settings pane.',
        trigger: 'click',
        tabName: 'settings'
      },
      {
        elementId: 'theme-opt-dark',
        placement: 'left',
        title: 'Step 10: Dark Mode & Completion',
        text: 'Switch between Light and Dark mode instantly inside this full settings menu! The canvas, registry tables, panels, and dropdowns adapt live. Click **Finish** to complete the masterclass.',
        trigger: 'finish'
      }
    ];

    // Defined steps for the Smart Lineage Text Parser Tour (Interactive Validation & Exporting)
    this.parserSteps = [
      {
        elementId: 'textarea-bulk',
        placement: 'bottom',
        title: '1. Linear Lineage Chain with Parentheses ID',
        text: 'Type the first lineage manually in the text area:<br><br><code class="tuto-code-inline" style="background:var(--win-accent-light); padding:4px 8px; border-radius:4px; font-weight:600; display:block; font-family:monospace; font-size:11px; margin-bottom:8px; border:1px solid rgba(0,120,212,0.2);">(jm-1) John Miller son of (rm-1) Robert Miller son of (wm-1) William Miller</code>Let\'s see if you can write it correctly! Type it in the textarea, then click <strong>Check & Next ✔</strong>.',
        trigger: 'validate',
        pasteText: '(jm-1) John Miller son of (rm-1) Robert Miller son of (wm-1) William Miller',
        validateFn: (val) => {
          const v = val.trim().toLowerCase();
          return v.includes('john miller') && v.includes('robert miller') && v.includes('william miller') && v.includes('(jm-1)') && v.includes('(rm-1)') && v.includes('(wm-1)');
        },
        successMessage: '<strong>Heuristic Analysis Result</strong>:<br>The engine scans the line, parses delimiters, and maps parenthesized IDs recursively in memory:<br><span style="color:var(--win-accent); font-weight:600;">(wm-1) William Miller ➔ (rm-1) Robert Miller ➔ (jm-1) John Miller</span><br><br>Using parenthesized IDs like <code>(jm-1)</code> prevents duplicate name mergers! Click below to proceed.'
      },
      {
        elementId: 'textarea-bulk',
        placement: 'bottom',
        title: '2. Adding Sibling with Brackets ID',
        text: 'Now let\'s add John\'s sister Sarah! Press <strong>Enter</strong> in the textarea for a new line, then type manually:<br><br><code class="tuto-code-inline" style="background:var(--win-accent-light); padding:4px 8px; border-radius:4px; font-weight:600; display:block; font-family:monospace; font-size:11px; margin-bottom:8px; border:1px solid rgba(0,120,212,0.2);">[sm-1] Sarah Miller daughter of (rm-1) Robert Miller son of (wm-1) William Miller</code>When done, click <strong>Check & Next ✔</strong>.',
        trigger: 'validate',
        pasteText: '[sm-1] Sarah Miller daughter of (rm-1) Robert Miller son of (wm-1) William Miller',
        validateFn: (val) => {
          const v = val.trim().toLowerCase();
          return v.includes('sarah miller') && (v.includes('daughter of') || v.includes('d/o') || v.includes('bint')) && v.includes('[sm-1]');
        },
        successMessage: '<strong>Heuristic Analysis Result</strong>:<br>The engine detects the bracketed ID <code>[sm-1]</code>, flags Sarah as Female, maps her father as Robert Miller via ID <code>rm-1</code>, and auto-links her as John\'s sibling!'
      },
      {
        elementId: 'textarea-bulk',
        placement: 'bottom',
        title: '3. CSV ID Mapping',
        text: 'Let\'s map a grandmother! Press <strong>Enter</strong> for a new line, then type this CSV sequence using grandfather\'s unique ID:<br><br><code class="tuto-code-inline" style="background:var(--win-accent-light); padding:4px 8px; border-radius:4px; font-weight:600; display:block; font-family:monospace; font-size:11px; margin-bottom:8px; border:1px solid rgba(0,120,212,0.2);">wm-1, William Miller, , , M, Jane Miller</code>When done, click <strong>Check & Next ✔</strong>.',
        trigger: 'validate',
        pasteText: 'wm-1, William Miller, , , M, Jane Miller',
        validateFn: (val) => {
          const v = val.trim().toLowerCase();
          return v.includes('jane miller') && v.includes('m') && v.includes('wm-1');
        },
        successMessage: '<strong>Heuristic Analysis Result</strong>:<br>The engine parses grandfather\'s ID <code>wm-1</code> from the first column, updates his profile details, and links grandmother <strong>Jane Miller</strong> as his spouse!'
      },
      {
        elementId: 'btn-submit-bulk',
        placement: 'bottom',
        title: 'Step 4: Parse & Compile',
        text: 'Excellent! You have successfully typed all three lines step-by-step. Now, click <strong>Parse & Link Text</strong> to compile this family forest into memory!',
        trigger: 'click'
      },
      {
        elementId: 'btn-nav-explorer',
        placement: 'right',
        title: 'Step 5: Switch to Tree Explorer',
        text: 'Success! The relationship engine resolved all links instantly. Now, <strong>click the "Tree Explorer" tab</strong> in the sidebar to visualize the family!',
        trigger: 'click',
        tabName: 'explorer'
      },
      {
        elementId: 'pedigree-focus',
        placement: 'bottom',
        title: 'Step 6: Real-Time Pedigree Mapping',
        text: 'Behold the parsed tree rendered live! <strong>John Miller</strong> is centered at the focal core, recursively linked to his father <strong>Robert</strong>, grandfather <strong>William</strong>, grandmother <strong>Jane</strong>, and sister <strong>Sarah</strong>. Click <strong>Next</strong> to view the export features!',
        trigger: 'next'
      },
      {
        elementId: 'btn-explorer-export',
        placement: 'left',
        title: 'Step 7: Real-Time Data Exporting',
        text: 'To conclude our masterclass, let\'s export the tree! <strong>Click the "Export JSON" button</strong>. This downloads the complete parsed database directly to your system! This JSON file links seamlessly into our Windows 11 exe packaging process. Click <strong>Finish</strong>!',
        trigger: 'click'
      }
    ];

    this.createElements();
  }

  // Create floating backdrop & tooltip card overlays
  createElements() {
    // Spotlight dark backdrop
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'tour-backdrop hidden';
    document.body.appendChild(this.backdrop);

    // Floating callout bubble card
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'tour-tooltip hidden';
    document.body.appendChild(this.tooltip);

    // Click handler for backdrop to safely exit the tour
    this.backdrop.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.end();
    });
  }

  backupDatabase() {
    const people = this.ui.engine.getAllPeople();
    this.dbBackup = people.length > 0 ? JSON.parse(JSON.stringify(people)) : null;
    this.focusBackup = this.ui.focusPersonId;
  }

  restoreDatabase() {
    if (this.dbBackup) {
      this.ui.engine.importDatabase(this.dbBackup);
      if (this.focusBackup && this.ui.engine.getPerson(this.focusBackup)) {
        this.ui.setFocusPerson(this.focusBackup);
      } else {
        const roots = this.ui.engine.getRoots();
        if (roots.length > 0) {
          this.ui.setFocusPerson(roots[0].id);
        } else {
          this.ui.setFocusPerson(null);
        }
      }
      this.ui.refreshAllUI();
      this.dbBackup = null;
      this.focusBackup = null;
    } else if (this.tourActive) {
      // If the tour was active but we had no pre-existing database, return to empty state
      this.ui.engine.clear();
      this.ui.setFocusPerson(null);
      this.ui.refreshAllUI();
    }
  }

  // Launch the guided tour (Masterclass)
  start() {
    this.tourActive = true;
    this.backupDatabase();
    this.activeTourType = 'masterclass';
    this.steps = this.masterclassSteps;

    // Generate the complete integrated 5-member family tree preset
    const focusId = this.ui.engine.generateFiveMemberTree();
    this.ui.setFocusPerson(focusId);
    this.ui.clearGridFilters();
    this.ui.refreshAllUI();
    
    this.ui.switchTab('dashboard'); // start at dashboard
    this.currentStepIndex = 0;
    this.showStep();
  }

  // Launch the Parser Tour
  startParserTour() {
    this.tourActive = true;
    this.backupDatabase();
    this.ui.clearGridFilters();
    this.ui.engine.clear();
    this.ui.refreshAllUI();

    this.activeTourType = 'parser';
    this.steps = this.parserSteps;
    this.ui.switchTab('import'); // start at import tab
    this.currentStepIndex = 0;
    this.showStep();
  }

  // Stop tour and cleanup highlight classes
  end() {
    if (!this.tourActive) return;
    this.tourActive = false;

    this.backdrop.classList.add('hidden');
    this.tooltip.classList.add('hidden');
    this.removeCurrentHighlight();
    this.currentStepIndex = -1;
    this.restoreDatabase();
  }

  removeCurrentHighlight() {
    if (this.highlightedElement) {
      this.highlightedElement.classList.remove('tour-highlighted');
      
      // Remove temporary click listeners
      if (this.highlightedElement._tourClick) {
        this.highlightedElement.removeEventListener('click', this.highlightedElement._tourClick);
        delete this.highlightedElement._tourClick;
      }
      this.highlightedElement = null;
    }

    // Restore elevated parents stacking contexts
    if (this.elevatedParents) {
      this.elevatedParents.forEach(parent => {
        parent.classList.remove('tour-parent-elevated');
      });
      this.elevatedParents = [];
    }
  }

  // Render a specific spotlight step
  showStep() {
    this.removeCurrentHighlight();

    if (this.currentStepIndex < 0 || this.currentStepIndex >= this.steps.length) {
      this.end();
      return;
    }

    const step = this.steps[this.currentStepIndex];

    // Close modal if active tour is masterclass and we are navigating to Step 7
    if (this.activeTourType === 'masterclass' && this.currentStepIndex === 7) {
      const modal = document.getElementById('modal-member-detail');
      if (modal) modal.classList.add('hidden');
    }

    // User types manually; no automatic text overwrite in showStep()

    // Programmatic focus person override for parser tour final visualization
    if (this.activeTourType === 'parser' && this.currentStepIndex === 5) {
      const matches = this.ui.engine.nameToIds.get('john miller');
      if (matches && matches.length > 0) {
        this.ui.setFocusPerson(matches[0]);
      }
    }

    const element = document.getElementById(step.elementId);

    if (!element) {
      // If target element is not loaded or visible, skip to next step
      console.warn(`Tour target element #${step.elementId} not found, skipping.`);
      this.next();
      return;
    }

    // Highlight target
    this.highlightedElement = element;
    this.highlightedElement.classList.add('tour-highlighted');

    // Elevate all parent stacking contexts above the backdrop overlay
    this.elevatedParents = [];
    let pNode = element.parentElement;
    while (pNode && pNode !== document.body && pNode !== document.documentElement) {
      pNode.classList.add('tour-parent-elevated');
      this.elevatedParents.push(pNode);
      pNode = pNode.parentElement;
    }

    this.backdrop.classList.remove('hidden');

    // Build Tooltip DOM
    let btnHtml = '';
    if (step.trigger === 'next') {
      btnHtml = `<button class="fluent-btn btn-solid btn-tuto-next">Next ➔</button>`;
    } else if (step.trigger === 'finish') {
      btnHtml = `<button class="fluent-btn btn-solid btn-tuto-finish">Finish 🎉</button>`;
    } else if (step.trigger === 'click') {
      btnHtml = `<span class="tuto-wait-badge">Waiting for Click...</span>`;
    } else if (step.trigger === 'validate') {
      btnHtml = `
        <button class="fluent-btn btn-secondary btn-tuto-paste" style="margin-right:8px; font-size:11px; padding:4px 8px;" type="button">Paste 📋</button>
        <button class="fluent-btn btn-solid btn-tuto-validate" style="font-size:11px; padding:4px 8px;" type="button">Check & Next ✔</button>
      `;
    }

    this.tooltip.innerHTML = `
      <div class="tour-tooltip-header">
        <h3 class="tour-tooltip-title">${step.title}</h3>
        <button class="tour-tooltip-close">&times;</button>
      </div>
      <div class="tour-tooltip-body">
        <p>${step.text}</p>
      </div>
      <div class="tour-tooltip-footer">
        <button class="fluent-btn btn-link btn-tuto-skip">Skip Tour</button>
        ${btnHtml}
      </div>
    `;

    // Position tooltip next to highlighted node
    this.tooltip.classList.remove('hidden');
    this.positionTooltip(element, step.placement);

    // Bind Button Event Listeners
    this.tooltip.querySelector('.tour-tooltip-close').onclick = () => this.end();
    this.tooltip.querySelector('.btn-tuto-skip').onclick = () => this.end();
    
    const nextBtn = this.tooltip.querySelector('.btn-tuto-next');
    if (nextBtn) {
      nextBtn.onclick = () => this.next();
    }

    const validateBtn = this.tooltip.querySelector('.btn-tuto-validate');
    if (validateBtn) {
      validateBtn.onclick = () => {
        const textarea = document.getElementById('textarea-bulk');
        const textVal = textarea ? textarea.value : '';
        if (step.validateFn && step.validateFn(textVal)) {
          // Success! Show what it renders in the tooltip body
          const body = this.tooltip.querySelector('.tour-tooltip-body');
          const footer = this.tooltip.querySelector('.tour-tooltip-footer');
          
          body.innerHTML = `
            <div style="background:#e6f4ea; color:#137333; padding:10px; border-radius:6px; margin-bottom:10px; font-size:12px; border:1px solid #c6edd2; font-weight:500;">
              ✓ Syntax Validated Successfully!
            </div>
            <p>${step.successMessage}</p>
          `;
          
          footer.innerHTML = `
            <button class="fluent-btn btn-solid btn-tuto-success-continue" style="width:100%;">Continue to Next Step ➔</button>
          `;
          
          footer.querySelector('.btn-tuto-success-continue').onclick = () => {
            this.next();
          };
        } else {
          // Error! Update tooltip body with a temporary warning
          const warningBox = document.createElement('div');
          warningBox.style.cssText = 'background:#fce8e6; color:#c5221f; padding:8px; border-radius:4px; margin-top:8px; font-size:11px; border:1px solid #fad2cf; font-weight:500;';
          warningBox.className = 'tour-warning-box';
          warningBox.innerHTML = `⚠️ Syntax Error: Please type the line exactly as shown: <code>${step.pasteText}</code>`;
          
          // Remove old warning box if exists
          const oldWarn = this.tooltip.querySelector('.tour-warning-box');
          if (oldWarn) oldWarn.remove();
          
          this.tooltip.querySelector('.tour-tooltip-body').appendChild(warningBox);
        }
      };
    }

    const pasteBtn = this.tooltip.querySelector('.btn-tuto-paste');
    if (pasteBtn) {
      pasteBtn.onclick = () => {
        const textarea = document.getElementById('textarea-bulk');
        if (textarea) {
          if (this.currentStepIndex === 0) {
            textarea.value = step.pasteText;
          } else if (this.currentStepIndex === 1) {
            textarea.value = `(jm-1) John Miller son of (rm-1) Robert Miller son of (wm-1) William Miller\n\n${step.pasteText}`;
          } else if (this.currentStepIndex === 2) {
            textarea.value = `(jm-1) John Miller son of (rm-1) Robert Miller son of (wm-1) William Miller\n\n[sm-1] Sarah Miller daughter of (rm-1) Robert Miller son of (wm-1) William Miller\n\n${step.pasteText}`;
          }
        }
        // Auto validate for ease!
        if (validateBtn) validateBtn.click();
      };
    }

    const finishBtn = this.tooltip.querySelector('.btn-tuto-finish');
    if (finishBtn) {
      finishBtn.onclick = () => {
        this.end();
        this.ui.showNotification("Masterclass completed! You are now a Family Tree Engine Expert. Start creating!", "success");
      };
    }

    // Control User Actions: Bind active click trigger if required
    if (step.trigger === 'click') {
      const clickHandler = () => {
        // Remove listener to prevent duplicate triggers
        element.removeEventListener('click', clickHandler);
        delete element._tourClick;

        // Auto transition to next step after action resolves
        setTimeout(() => this.next(), 250);
      };
      
      element.addEventListener('click', clickHandler);
      element._tourClick = clickHandler;
    }
  }

  // Position tooltip relative to target rect
  positionTooltip(element, placement) {
    const rect = element.getBoundingClientRect();
    const tooltipRect = this.tooltip.getBoundingClientRect();
    const tooltipWidth = tooltipRect.width || 290;
    const tooltipHeight = tooltipRect.height || 180;
    const margin = 12;

    let left = 0;
    let top = 0;

    switch (placement) {
      case 'bottom':
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
        top = rect.bottom + margin;
        break;
      case 'top':
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
        top = rect.top - tooltipHeight - margin;
        break;
      case 'right':
        left = rect.right + margin;
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        break;
      case 'left':
        left = rect.left - tooltipWidth - margin;
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        break;
    }

    // Boundary corrections to stay on screen
    left = Math.max(16, Math.min(left, window.innerWidth - tooltipWidth - 16));
    top = Math.max(16, Math.min(top, window.innerHeight - tooltipHeight - 16));

    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${top}px`;
  }

  next() {
    this.currentStepIndex++;
    this.showStep();
  }
}
