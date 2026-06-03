/* ==========================================================================
   FRONTEND UI BINDER & STATE CONTROLLER
   ========================================================================== */

import { LineageCanvas } from './canvas.js';
import { FamilyTreeTour } from './tour.js';

export class FamilyTreeUI {
  constructor(engine) {
    this.engine = engine;
    this.canvas = null;
    this.worldCanvas = null;
    
    // UI Navigation State
    this.currentTab = 'dashboard';
    this.focusPersonId = null;

    // Grid Page & Sort States
    this.gridPage = 1;
    this.gridLimit = 50; // virtualized paging size to handle 1000+ smoothly
    this.gridSortField = 'name';
    this.gridSortOrder = 'asc';
    this.gridFilteredList = [];
    this.activeSpouseFilter = 'all';
    this.selectedMemberIds = new Set();

    // Suggestions state
    this.searchFocusedIndex = -1;

    // Initialize DOM binding
    this.bindDOM();

    // Initialize Theme
    this.initTheme();

    // Initialize Spotlight Tour Driver
    this.tour = new FamilyTreeTour(this);

    // Initialize Web Worker for heavy lifting
    this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e) => this.handleWorkerMessage(e);
  }

  // Modern Windows 11 Fluent Toast Notification Manager
  showNotification(message, type = 'info') {
    let container = document.getElementById('fluent-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'fluent-toast-container';
      document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `fluent-toast toast-${type}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✓';
    else if (type === 'error') icon = '⚠️';
    else if (type === 'warning') icon = '⚡';
    
    toast.innerHTML = `
      <span class="toast-icon">${icon}</span>
      <span class="toast-message">${message}</span>
      <button class="toast-close">&times;</button>
    `;
    
    toast.querySelector('.toast-close').onclick = () => {
      toast.classList.add('toast-exit');
      setTimeout(() => toast.remove(), 200);
    };
    
    container.appendChild(toast);
    
    setTimeout(() => {
      if (toast.parentElement) {
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 200);
      }
    }, 4000);
  }

  // Modern Windows 11 Fluent Confirmation Dialog Helper
  showConfirm(title, message, onConfirm) {
    const confirmModal = document.getElementById('modal-fluent-confirm');
    document.getElementById('confirm-title').innerText = title;
    document.getElementById('confirm-message').innerText = message;
    
    const btnCancel = document.getElementById('btn-confirm-cancel');
    const btnOk = document.getElementById('btn-confirm-ok');
    
    // Clean up old listeners to prevent stacking
    const newBtnCancel = btnCancel.cloneNode(true);
    const newBtnOk = btnOk.cloneNode(true);
    
    btnCancel.parentNode.replaceChild(newBtnCancel, btnCancel);
    btnOk.parentNode.replaceChild(newBtnOk, btnOk);
    
    newBtnCancel.onclick = () => {
      confirmModal.classList.add('hidden');
    };
    
    newBtnOk.onclick = () => {
      confirmModal.classList.add('hidden');
      if (onConfirm) onConfirm();
    };
    
    confirmModal.classList.remove('hidden');
  }

  // Bind all click events, input events, and form handlers
  bindDOM() {
    // 1. Sidebar Tab Switching
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const tab = item.getAttribute('data-tab');
        
        // If a tour is active, check if this click was the expected tour step.
        // If the user manually navigated to a different tab, terminate the tour.
        if (this.tour && this.tour.currentStepIndex > -1) {
          const expectedStep = this.tour.steps[this.tour.currentStepIndex];
          if (!expectedStep || expectedStep.elementId !== item.id) {
            this.tour.end();
          }
        }
        
        this.switchTab(tab);
      });
    });

    // 2. Global Search Title Bar Suggestions & Key Event mappings
    const globalSearch = document.getElementById('global-search-input');
    const dropdown = document.getElementById('search-suggestions-dropdown');

    globalSearch.addEventListener('input', () => this.handleGlobalSearchInput());
    globalSearch.addEventListener('focus', () => {
      if (globalSearch.value.trim().length > 0) dropdown.classList.remove('hidden');
    });
    
    // Hide suggestions when clicking outside
    document.addEventListener('click', (e) => {
      if (!globalSearch.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
      }
      
      const expSearch = document.getElementById('explorer-search-input');
      const expDropdown = document.getElementById('explorer-search-suggestions');
      if (expSearch && expDropdown && !expSearch.contains(e.target) && !expDropdown.contains(e.target)) {
        expDropdown.classList.add('hidden');
      }

      const wrldSearch = document.getElementById('world-search-input');
      const wrldDropdown = document.getElementById('world-search-suggestions');
      if (wrldSearch && wrldDropdown && !wrldSearch.contains(e.target) && !wrldDropdown.contains(e.target)) {
        wrldDropdown.classList.add('hidden');
      }
    });

    // Keyboard navigation inside search recommendations
    globalSearch.addEventListener('keydown', (e) => {
      const items = dropdown.querySelectorAll('.suggestion-item');
      if (items.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.searchFocusedIndex = (this.searchFocusedIndex + 1) % items.length;
        this.highlightSuggestionItem(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.searchFocusedIndex = (this.searchFocusedIndex - 1 + items.length) % items.length;
        this.highlightSuggestionItem(items);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (this.searchFocusedIndex > -1 && items[this.searchFocusedIndex]) {
          items[this.searchFocusedIndex].click();
        } else if (items[0]) {
          items[0].click();
        }
      }
    });

    // Mock Window Action Buttons Click simulation (just for light mockup wow)
    document.querySelectorAll('.titlebar-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('close')) {
          if (confirm("Close Windows Family Tree Explorer?")) {
            window.close();
          }
        } else {
          // Future data backup functionality
        }
      });
    });

    // 3. Add Person manual form
    const formAdd = document.getElementById('form-add-person');
    formAdd.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const id = document.getElementById('input-person-id').value.trim();
      const name = document.getElementById('input-person-name').value;
      const gender = document.getElementById('input-person-gender').value;
      const spouses = document.getElementById('input-person-spouse').value;
      const fatherName = document.getElementById('input-father-name').value;
      const motherName = document.getElementById('input-mother-name').value;
      const grandfatherName = document.getElementById('input-grandfather-name').value;

      if (id && this.engine.people.has(id)) {
        const existingPerson = this.engine.people.get(id);
        document.getElementById('conflict-id-display').innerText = id;
        document.getElementById('conflict-name-display').innerText = existingPerson.name;
        
        this.pendingConflictAction = {
          type: 'add',
          newId: id,
          data: { name, gender, spouses, fatherName, motherName, grandfatherName }
        };
        
        document.getElementById('modal-id-conflict-choice').classList.remove('hidden');
        return;
      }

      this.handleManualAdd();
    });

    // 3.5 Photo Upload Bindings
    const handlePhotoBrowse = (btnId, fileId, inputId) => {
      document.getElementById(btnId).addEventListener('click', () => {
        document.getElementById(fileId).click();
      });
      document.getElementById(fileId).addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              const MAX_SIZE = 300;
              let width = img.width;
              let height = img.height;
              
              if (width > height) {
                if (width > MAX_SIZE) {
                  height *= MAX_SIZE / width;
                  width = MAX_SIZE;
                }
              } else {
                if (height > MAX_SIZE) {
                  width *= MAX_SIZE / height;
                  height = MAX_SIZE;
                }
              }
              
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, width, height);
              
              const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
              document.getElementById(inputId).value = compressedBase64;
            };
            img.src = ev.target.result;
          };
          reader.readAsDataURL(file);
        }
      });
    };
    handlePhotoBrowse('btn-browse-photo', 'file-person-photo', 'input-person-photo');
    handlePhotoBrowse('btn-edit-browse-photo', 'file-edit-person-photo', 'edit-person-photo');

    // 4. Bulk Parser Submission
    document.getElementById('btn-submit-bulk').addEventListener('click', () => this.handleBulkImport());
    document.getElementById('btn-clear-bulk').addEventListener('click', () => {
      document.getElementById('textarea-bulk').value = '';
    });

    // 5. Mock Database Generative Triggers
    document.getElementById('btn-dash-start-tour').addEventListener('click', () => {
      if (this.engine.getAllPeople().length > 0) {
        this.showConfirm(
          "Start Interactive Tour?",
          "Warning: Running this tour will clear your current family tree to load the demo dataset. Do you want to proceed?",
          () => this.tour.start()
        );
      } else {
        this.tour.start();
      }
    });
    document.getElementById('btn-start-parser-tour').addEventListener('click', () => {
      if (this.engine.getAllPeople().length > 0) {
        this.showConfirm(
          "Run Parser Tour?",
          "Warning: Running the parser tour will clear your current family tree to walk through the importer steps. Do you want to proceed?",
          () => this.tour.startParserTour()
        );
      } else {
        this.tour.startParserTour();
      }
    });
    document.getElementById('btn-dash-import-mock').addEventListener('click', () => this.triggerMockGeneration());
    document.getElementById('btn-banner-mock').addEventListener('click', () => this.triggerMockGeneration());
    document.getElementById('btn-import-mock-giant').addEventListener('click', () => this.triggerMockGeneration());
    document.getElementById('btn-import-mock-giant-100k').addEventListener('click', () => this.triggerGiantMockGeneration());
    document.getElementById('btn-banner-add').addEventListener('click', () => this.switchTab('import'));

    // 5.1. Personalization Settings Theme Option Clicks
    const lightCard = document.getElementById('theme-opt-light');
    const darkCard = document.getElementById('theme-opt-dark');
    if (lightCard) {
      lightCard.addEventListener('click', () => {
        this.setTheme('light');
        this.showNotification("Workspace theme changed to Light Mode.", "success");
      });
    }
    if (darkCard) {
      darkCard.addEventListener('click', () => {
        this.setTheme('dark');
        this.showNotification("Workspace theme changed to Dark Mode.", "success");
      });
    }

    // Titlebar Settings Button click trigger is now bound in section 8.2 (flyout settings menu)

    // Canvas search inputs
    const expSearchInput = document.getElementById('explorer-search-input');
    if (expSearchInput) {
      expSearchInput.addEventListener('input', () => {
        this.handleCanvasSearchInput('explorer-search-input', 'explorer-search-suggestions', (id) => {
          this.setFocusPerson(id);
          if (this.canvas) {
            this.canvas.centerOnNode(id);
          }
        });
      });
      expSearchInput.addEventListener('focus', () => {
        if (expSearchInput.value.trim().length > 0) {
          document.getElementById('explorer-search-suggestions').classList.remove('hidden');
        }
      });
    }

    const wrldSearchInput = document.getElementById('world-search-input');
    if (wrldSearchInput) {
      wrldSearchInput.addEventListener('input', () => {
        const query = wrldSearchInput.value.trim();
        if (this.worldCanvas) {
          this.worldCanvas.searchQuery = query;
          this.worldCanvas.draw();
        }
        this.handleCanvasSearchInput('world-search-input', 'world-search-suggestions', (id) => {
          this.setFocusPerson(id);
          setTimeout(() => {
            if (this.worldCanvas) {
              this.worldCanvas.centerOnNode(id);
            }
          }, 50);
        });
      });
      wrldSearchInput.addEventListener('focus', () => {
        if (wrldSearchInput.value.trim().length > 0) {
          document.getElementById('world-search-suggestions').classList.remove('hidden');
        }
      });
    }

    // World forest filter pill buttons
    document.querySelectorAll('.fluent-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const parent = btn.parentElement;
        parent.querySelectorAll('.fluent-filter-btn').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');
        const filterType = btn.getAttribute('data-filter');
        if (this.worldCanvas) {
          this.worldCanvas.setFilter(filterType);
        }
      });
    });

    // 6. Canvas Nav Controls
    document.getElementById('btn-explorer-export').addEventListener('click', () => this.handleExportJSON());
    document.getElementById('btn-canvas-zoom-in').addEventListener('click', () => this.canvas && this.canvas.zoomIn());
    document.getElementById('btn-canvas-zoom-out').addEventListener('click', () => this.canvas && this.canvas.zoomOut());
    document.getElementById('btn-canvas-zoom-fit').addEventListener('click', () => this.canvas && this.canvas.zoomFit());
    document.getElementById('btn-canvas-toggle-direction').addEventListener('click', () => this.canvas && this.canvas.toggleDirection());

    // 6b. World Canvas Nav Controls
    document.getElementById('btn-world-zoom-in').addEventListener('click', () => this.worldCanvas && this.worldCanvas.zoomIn());
    document.getElementById('btn-world-zoom-out').addEventListener('click', () => this.worldCanvas && this.worldCanvas.zoomOut());
    document.getElementById('btn-world-zoom-fit').addEventListener('click', () => this.worldCanvas && this.worldCanvas.zoomFit());
    document.getElementById('btn-world-toggle-direction').addEventListener('click', () => this.worldCanvas && this.worldCanvas.toggleDirection());

    // Sidebar collapse toggle click
    const sidebar = document.getElementById('app-sidebar');
    const toggleBtn = document.getElementById('btn-sidebar-toggle');
    if (toggleBtn && sidebar) {
      toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        
        // Trigger immediate resize
        if (this.canvas) this.canvas.resizeCanvas();
        if (this.worldCanvas) this.worldCanvas.resizeCanvas();
      });
      
      sidebar.addEventListener('transitionend', (e) => {
        if (e.propertyName === 'width') {
          if (this.canvas) this.canvas.resizeCanvas();
          if (this.worldCanvas) this.worldCanvas.resizeCanvas();
        }
      });
    }

    // 7. Grid Table Filters & Sorting bindings
    document.getElementById('grid-search').addEventListener('input', () => {
      this.gridPage = 1;
      this.updateGridData();
    });
    document.getElementById('grid-filter-gender').addEventListener('change', () => {
      this.gridPage = 1;
      this.updateGridData();
    });
    document.getElementById('grid-filter-generation').addEventListener('change', () => {
      this.gridPage = 1;
      this.updateGridData();
    });
    document.getElementById('grid-filter-status').addEventListener('change', () => {
      this.gridPage = 1;
      this.updateGridData();
    });
    document.getElementById('btn-grid-clear-filters').addEventListener('click', () => this.clearGridFilters());

    // Select All Checkbox next to Reset Filters
    const chkSelectAll = document.getElementById('chk-grid-select-all');
    const btnSelectAll = document.getElementById('btn-grid-select-all');
    if (chkSelectAll) {
      chkSelectAll.addEventListener('change', (e) => this.handleSelectAllChange(e.target.checked));
    }
    if (btnSelectAll) {
      btnSelectAll.addEventListener('click', (e) => {
        if (e.target !== chkSelectAll) {
          chkSelectAll.checked = !chkSelectAll.checked;
          chkSelectAll.dispatchEvent(new Event('change'));
        }
      });
    }

    // Select All Checkbox inside Table Header
    const chkSelectAllHeader = document.getElementById('chk-grid-select-all-header');
    if (chkSelectAllHeader) {
      chkSelectAllHeader.addEventListener('change', (e) => this.handleSelectAllChange(e.target.checked));
    }

    // Delete Selected Button click binding
    const btnDeleteSelected = document.getElementById('btn-grid-delete-selected');
    if (btnDeleteSelected) {
      btnDeleteSelected.addEventListener('click', () => this.handleDeleteSelected());
    }

    document.querySelectorAll('.fluent-data-table th').forEach(th => {
      const field = th.getAttribute('data-sort');
      if (field) {
        th.addEventListener('click', () => this.handleGridSort(field));
      }
    });

    document.getElementById('btn-grid-prev').addEventListener('click', () => {
      if (this.gridPage > 1) {
        this.gridPage--;
        this.renderTableRows();
      }
    });
    document.getElementById('btn-grid-next').addEventListener('click', () => {
      const maxPage = Math.ceil(this.gridFilteredList.length / this.gridLimit);
      if (this.gridPage < maxPage) {
        this.gridPage++;
        this.renderTableRows();
      }
    });

    document.getElementById('btn-goto-unlinked').addEventListener('click', () => {
      document.getElementById('grid-filter-status').value = 'orphans';
      this.switchTab('members');
      this.updateGridData();
    });

    // 8. Modal Detail Bindings
    document.getElementById('btn-close-modal').addEventListener('click', () => {
      document.getElementById('modal-member-detail').classList.add('hidden');
    });
    document.getElementById('modal-member-detail').addEventListener('click', (e) => {
      if (e.target.id === 'modal-member-detail') {
        document.getElementById('modal-member-detail').classList.add('hidden');
      }
    });
    document.getElementById('btn-modal-focus').addEventListener('click', () => {
      const id = document.getElementById('detail-id').innerText;
      if (id) {
        this.setFocusPerson(id);
        if (this.currentTab === 'world') {
          if (this.worldCanvas) {
            this.worldCanvas.focusPersonId = id;
            this.worldCanvas.draw();
            this.worldCanvas.centerOnNode(id);
          }
        } else {
          this.switchTab('explorer');
        }
        document.getElementById('modal-member-detail').classList.add('hidden');
      }
    });
    document.getElementById('btn-modal-delete').addEventListener('click', () => {
      const id = document.getElementById('detail-id').innerText;
      const name = document.getElementById('detail-full-name').innerText;
      if (id) {
        this.showConfirm(
          "Delete Family Member?",
          `Are you sure you want to permanently delete ${name}? This action cannot be undone.`,
          () => {
            this.engine.deletePerson(id);
            document.getElementById('modal-member-detail').classList.add('hidden');
            
            // Auto-refresh & Focus Shift
            if (this.focusPersonId === id) {
              const remaining = this.engine.getAllPeople();
              if (remaining.length > 0) {
                this.setFocusPerson(remaining[0].id);
              } else {
                this.focusPersonId = null;
                this.renderPedigreeDiagram();
                if (this.canvas) {
                  this.canvas.setFocus(null);
                }
              }
            } else {
              if (this.focusPersonId) {
                this.setFocusPerson(this.focusPersonId);
              }
            }
            
            if (this.canvas) {
              this.canvas.draw();
            }

            this.refreshAllUI();
            this.showNotification("Member successfully deleted.", "success");
          }
        );
      }
    });

    // 8.1. Modal Edit Bindings
    document.getElementById('btn-modal-edit').addEventListener('click', () => {
      const id = document.getElementById('detail-id').innerText;
      if (id) {
        const p = this.engine.getPerson(id);
        if (p) {
          // Prefill modify form fields
          document.getElementById('edit-person-id').value = p.id;
          document.getElementById('edit-person-new-id').value = p.id;
          document.getElementById('edit-person-name').value = p.name;
          document.getElementById('edit-person-gender').value = p.gender;
          document.getElementById('edit-person-spouse').value = p.spouses ? p.spouses.join(', ') : '';
          document.getElementById('edit-person-photo').value = p.photo || '';
          document.getElementById('edit-person-birth').value = p.birthYear !== undefined && p.birthYear !== null && p.birthYear !== 0 ? p.birthYear : '';
          document.getElementById('edit-person-death').value = p.deathYear !== undefined && p.deathYear !== null && p.deathYear !== 0 ? p.deathYear : '';
          document.getElementById('edit-father-name').value = p.fatherName || '';
          document.getElementById('edit-mother-name').value = p.motherName || '';
          document.getElementById('edit-grandfather-name').value = p.grandfatherName || '';

          // Open edit modal and close detail modal
          document.getElementById('modal-member-detail').classList.add('hidden');
          document.getElementById('modal-member-edit').classList.remove('hidden');
        }
      }
    });

    const closeEditModal = () => {
      document.getElementById('modal-member-edit').classList.add('hidden');
      document.getElementById('modal-member-detail').classList.remove('hidden');
    };

    document.getElementById('btn-close-edit-modal').addEventListener('click', closeEditModal);
    document.getElementById('btn-edit-cancel').addEventListener('click', closeEditModal);

    document.getElementById('form-edit-person').addEventListener('submit', (e) => {
      e.preventDefault();
      const id = document.getElementById('edit-person-id').value;
      const newId = document.getElementById('edit-person-new-id').value.trim();
      const name = document.getElementById('edit-person-name').value;
      const gender = document.getElementById('edit-person-gender').value;
      const spouses = document.getElementById('edit-person-spouse').value;
      const photo = document.getElementById('edit-person-photo').value;
      const birthYear = document.getElementById('edit-person-birth').value;
      const deathYear = document.getElementById('edit-person-death').value;
      const fatherName = document.getElementById('edit-father-name').value;
      const motherName = document.getElementById('edit-mother-name').value;
      const grandfatherName = document.getElementById('edit-grandfather-name').value;

      if (!newId) {
        this.showNotification("Member ID cannot be empty.", "error");
        return;
      }

      if (newId !== id && this.engine.people.has(newId)) {
        const existingPerson = this.engine.people.get(newId);
        document.getElementById('conflict-id-display').innerText = newId;
        document.getElementById('conflict-name-display').innerText = existingPerson.name;
        
        this.pendingConflictAction = {
          type: 'edit',
          oldId: id,
          newId: newId,
          data: { name, gender, spouses, photo, fatherName, motherName, grandfatherName, birthYear, deathYear }
        };
        
        document.getElementById('modal-id-conflict-choice').classList.remove('hidden');
        return;
      }

      // Rename ID first if it changed
      if (newId !== id) {
        this.engine.renamePersonId(id, newId);
      }

      const p = this.engine.modifyPerson(newId, { name, gender, spouses, photo, fatherName, motherName, grandfatherName, birthYear, deathYear });
      if (p) {
        document.getElementById('modal-member-edit').classList.add('hidden');
        
        // Refresh focused view if modified person is the active focus
        if (this.focusPersonId === id) {
          this.setFocusPerson(newId);
        } else if (this.focusPersonId) {
          this.setFocusPerson(this.focusPersonId);
        }
        
        this.refreshAllUI();
        this.showNotification(`Successfully updated ${p.name}'s lineage!`, "success");
      }
    });

    // 8.2. Titlebar Data Layer Menu & Flyout Bindings
    const dbBtn = document.getElementById('btn-titlebar-database');
    const dbFlyout = document.getElementById('flyout-data-layer');
    const importInput = document.getElementById('input-file-import');
    const setBtn = document.getElementById('btn-titlebar-settings');

    if (dbBtn && dbFlyout) {
      dbBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dbFlyout.classList.toggle('hidden');
      });

      document.addEventListener('click', (e) => {
        if (!dbBtn.contains(e.target) && !dbFlyout.contains(e.target)) {
          dbFlyout.classList.add('hidden');
        }
      });
    }

    if (setBtn) {
      setBtn.addEventListener('click', () => {
        if (this.tour && this.tour.currentStepIndex > -1) {
          this.tour.end();
        }
        this.switchTab('settings');
      });
    }

    document.getElementById('btn-flyout-export').addEventListener('click', () => {
      dbFlyout.classList.add('hidden');
      this.handleExportJSON();
    });

    document.getElementById('btn-flyout-import').addEventListener('click', () => {
      dbFlyout.classList.add('hidden');
      importInput.click();
    });

    let pendingImportData = null;
    const importChoiceModal = document.getElementById('modal-import-choice');

    importInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          pendingImportData = JSON.parse(event.target.result);
          if (Array.isArray(pendingImportData)) {
            // Show choice dialog
            importChoiceModal.classList.remove('hidden');
          } else {
            this.showNotification("Failed to parse database file. Invalid layout format.", "error");
          }
        } catch (err) {
          this.showNotification("Error loading backup: Invalid JSON file format.", "error");
        }
      };
      reader.readAsText(file);
      importInput.value = ''; // Reset file input
    });

    document.getElementById('btn-import-replace').addEventListener('click', () => {
      if (pendingImportData) {
        const success = this.engine.importDatabase(pendingImportData);
        if (success) {
          this.focusPersonId = null;
          const remaining = this.engine.getAllPeople();
          if (remaining.length > 0) {
            this.setFocusPerson(remaining[0].id);
          }
          this.refreshAllUI();
          this.showNotification(`Database replaced successfully! Loaded ${remaining.length} members.`, "success");
        } else {
          this.showNotification("Failed to parse database file. Invalid layout format.", "error");
        }
        pendingImportData = null;
        importChoiceModal.classList.add('hidden');
      }
    });

    document.getElementById('btn-import-merge').addEventListener('click', () => {
      if (pendingImportData) {
        const success = this.engine.mergeDatabase(pendingImportData);
        if (success) {
          const remaining = this.engine.getAllPeople();
          if (remaining.length > 0 && !this.focusPersonId) {
            this.setFocusPerson(remaining[0].id);
          }
          this.refreshAllUI();
          this.showNotification(`Database merged successfully! Active entries: ${remaining.length} members.`, "success");
        } else {
          this.showNotification("Failed to merge database file. Invalid layout format.", "error");
        }
        pendingImportData = null;
        importChoiceModal.classList.add('hidden');
      }
    });

    document.getElementById('btn-import-choice-cancel').addEventListener('click', () => {
      pendingImportData = null;
      importChoiceModal.classList.add('hidden');
    });

    importChoiceModal.addEventListener('click', (e) => {
      if (e.target.id === 'modal-import-choice') {
        pendingImportData = null;
        importChoiceModal.classList.add('hidden');
      }
    });

    document.getElementById('btn-flyout-reset').addEventListener('click', () => {
      dbFlyout.classList.add('hidden');
      this.showConfirm(
        "Reset Local Tree?",
        "Are you sure you want to completely clear the entire family tree database? This action cannot be undone.",
        () => {
          this.engine.clear();
          this.focusPersonId = null;
          this.renderPedigreeDiagram();
          if (this.canvas) this.canvas.setFocus(null);
          if (this.worldCanvas) this.worldCanvas.computeLayout();
          this.refreshAllUI();
          this.showNotification("Family tree database cleared.", "info");
        }
      );
    });

    // 9. Onboarding Tutorial Accordion Event listeners
    [1, 2, 3].forEach(num => {
      const btn = document.getElementById(`btn-tuto-${num}`);
      const content = document.getElementById(`tuto-content-${num}`);
      if (btn && content) {
        btn.addEventListener('click', () => {
          const isHidden = content.classList.contains('hidden');
          // Close all first for that clean single-accordion look
          [1, 2, 3].forEach(n => {
            document.getElementById(`tuto-content-${n}`).classList.add('hidden');
            document.getElementById(`btn-tuto-${n}`).parentElement.classList.remove('expanded');
          });
          
          if (isHidden) {
            content.classList.remove('hidden');
            btn.parentElement.classList.add('expanded');
          }
        });
      }
    });

    // 10. ID Conflict Choice Dialog Bindings
    const conflictModal = document.getElementById('modal-id-conflict-choice');
    if (conflictModal) {
      document.getElementById('btn-conflict-cancel').addEventListener('click', () => {
        conflictModal.classList.add('hidden');
        this.pendingConflictAction = null;
      });
      document.getElementById('btn-conflict-replace').addEventListener('click', () => {
        conflictModal.classList.add('hidden');
        this.executeConflictResolution('replace');
      });
      document.getElementById('btn-conflict-merge').addEventListener('click', () => {
        conflictModal.classList.add('hidden');
        this.executeConflictResolution('merge');
      });
      conflictModal.addEventListener('click', (e) => {
        if (e.target.id === 'modal-id-conflict-choice') {
          conflictModal.classList.add('hidden');
          this.pendingConflictAction = null;
        }
      });
    }

    // V8 Pathfinder Event Bindings
    const startInput = document.getElementById('path-start-input');
    const startSuggestions = document.getElementById('path-start-suggestions');
    if (startInput && startSuggestions) {
      startInput.addEventListener('input', () => {
        this.handleCanvasSearchInput('path-start-input', 'path-start-suggestions', (id) => {
          const p = this.engine.getPerson(id);
          if (p) {
            startInput.value = p.name;
            document.getElementById('path-start-id').value = p.id;
          }
        }, true);
      });
      startInput.addEventListener('focus', () => {
        if (startInput.value.trim().length > 0) {
          startSuggestions.classList.remove('hidden');
        }
      });
    }

    const endInput = document.getElementById('path-end-input');
    const endSuggestions = document.getElementById('path-end-suggestions');
    if (endInput && endSuggestions) {
      endInput.addEventListener('input', () => {
        this.handleCanvasSearchInput('path-end-input', 'path-end-suggestions', (id) => {
          const p = this.engine.getPerson(id);
          if (p) {
            endInput.value = p.name;
            document.getElementById('path-end-id').value = p.id;
          }
        }, true);
      });
      endInput.addEventListener('focus', () => {
        if (endInput.value.trim().length > 0) {
          endSuggestions.classList.remove('hidden');
        }
      });
    }

    // Hide path suggestions when clicking outside
    document.addEventListener('click', (e) => {
      if (startInput && startSuggestions && !startInput.contains(e.target) && !startSuggestions.contains(e.target)) {
        startSuggestions.classList.add('hidden');
      }
      if (endInput && endSuggestions && !endInput.contains(e.target) && !endSuggestions.contains(e.target)) {
        endSuggestions.classList.add('hidden');
      }
    });

    const pathfinderModal = document.getElementById('modal-v8-pathfinder');
    const btnClosePathfinder = document.getElementById('btn-close-pathfinder');
    if (btnClosePathfinder && pathfinderModal) {
      btnClosePathfinder.addEventListener('click', () => {
        pathfinderModal.classList.add('hidden');
      });
      pathfinderModal.addEventListener('click', (e) => {
        if (e.target.id === 'modal-v8-pathfinder') {
          pathfinderModal.classList.add('hidden');
        }
      });
    }

    const btnPathfinderClear = document.getElementById('btn-pathfinder-clear');
    if (btnPathfinderClear) {
      btnPathfinderClear.addEventListener('click', () => {
        if (startInput) startInput.value = '';
        if (endInput) endInput.value = '';
        const startIdEl = document.getElementById('path-start-id');
        if (startIdEl) startIdEl.value = '';
        const endIdEl = document.getElementById('path-end-id');
        if (endIdEl) endIdEl.value = '';
        const resContainer = document.getElementById('path-results-container');
        if (resContainer) resContainer.classList.add('hidden');
        const resList = document.getElementById('path-results-list');
        if (resList) resList.innerHTML = '';
      });
    }

    const btnPathfinderCalculate = document.getElementById('btn-pathfinder-calculate');
    if (btnPathfinderCalculate) {
      btnPathfinderCalculate.addEventListener('click', () => {
        this.calculateRelationshipPath();
      });
    }
  }

  // Initialize Canvas instance once Explorer tab becomes active
  initCanvas() {
    if (this.canvas) return;
    const canvasElem = document.getElementById('lineage-canvas');
    if (canvasElem) {
      this.canvas = new LineageCanvas(canvasElem, this.engine, (id) => this.showPersonDetail(id));
      if (this.focusPersonId) {
        this.canvas.setFocus(this.focusPersonId);
      }
    }
  }

  // Initialize World Canvas instance lazily
  initWorldCanvas() {
    if (this.worldCanvas) return;
    const canvasElem = document.getElementById('world-canvas');
    if (canvasElem) {
      this.worldCanvas = new LineageCanvas(canvasElem, this.engine, (id) => {
        this.setFocusPerson(id);
        this.showPersonDetail(id);
      }, true);
    }
  }

  // Theme Initialization and Management
  initTheme() {
    const savedTheme = localStorage.getItem('family-tree-theme');
    let useDark = false;
    if (savedTheme && savedTheme !== 'auto') {
      useDark = savedTheme === 'dark';
    } else {
      useDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    this.setTheme(useDark ? 'dark' : 'light');

    // Setup OS native theme listener for auto-sync
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        const currentSavedTheme = localStorage.getItem('family-tree-theme');
        if (!currentSavedTheme || currentSavedTheme === 'auto') {
          this.setTheme(e.matches ? 'dark' : 'light');
        }
      });
    }
  }

  setTheme(theme) {
    const isDark = theme === 'dark';
    if (isDark) {
      document.body.classList.add('theme-dark');
      localStorage.setItem('family-tree-theme', 'dark');
      
      const darkRadio = document.getElementById('radio-theme-dark');
      const lightRadio = document.getElementById('radio-theme-light');
      if (darkRadio) darkRadio.checked = true;
      if (lightRadio) lightRadio.checked = false;

      const darkCard = document.getElementById('theme-opt-dark');
      const lightCard = document.getElementById('theme-opt-light');
      if (darkCard) darkCard.classList.add('active');
      if (lightCard) lightCard.classList.remove('active');
    } else {
      document.body.classList.remove('theme-dark');
      localStorage.setItem('family-tree-theme', 'light');

      const darkRadio = document.getElementById('radio-theme-dark');
      const lightRadio = document.getElementById('radio-theme-light');
      if (darkRadio) darkRadio.checked = false;
      if (lightRadio) lightRadio.checked = true;

      const darkCard = document.getElementById('theme-opt-dark');
      const lightCard = document.getElementById('theme-opt-light');
      if (darkCard) darkCard.classList.remove('active');
      if (lightCard) lightCard.classList.add('active');
    }

    // Immediately repaint canvas views to update colors!
    if (this.canvas) {
      this.canvas.draw();
    }
    if (this.worldCanvas) {
      this.worldCanvas.draw();
    }
  }

  // Tab switching animations
  switchTab(tabName) {
    this.currentTab = tabName;
    
    // Toggle nav classes
    document.querySelectorAll('.nav-item').forEach(item => {
      if (item.getAttribute('data-tab') === tabName) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Hide all views, display active
    document.querySelectorAll('.content-tab-panel').forEach(panel => {
      if (panel.id === `tab-${tabName}`) {
        panel.classList.remove('hidden');
      } else {
        panel.classList.add('hidden');
      }
    });

    // Initialize Canvas lazily
    if (tabName === 'explorer') {
      setTimeout(() => {
        this.initCanvas();
        if (this.canvas) {
          this.canvas.resizeCanvas();
          if (this.focusPersonId) {
            this.canvas.setFocus(this.focusPersonId);
          }
        }
      }, 50);
    }

    // Initialize World Canvas lazily
    if (tabName === 'world') {
      setTimeout(() => {
        this.initWorldCanvas();
        if (this.worldCanvas) {
          this.worldCanvas.resizeCanvas();
          this.worldCanvas.zoomFit();
        }
      }, 50);
    }
  }

  // Reload entire views
  refreshAllUI() {
    const totalCount = this.engine.getAllPeople().length;
    
    // Sidebar Status
    document.getElementById('sidebar-status-text').innerText = `${totalCount.toLocaleString()} Members Loaded`;
    
    // Update Dashboard Metrics
    this.updateDashboardStats();

    // Populate Grid Generation filters
    this.populateGridGenerationOptions();

    // Update Datagrid Rows
    this.updateGridData();

    if (this.canvas) {
      this.canvas.computeLayout();
      this.canvas.draw();
    }
    if (this.worldCanvas) {
      this.worldCanvas.computeLayout();
      this.worldCanvas.draw();
    }
  }

  /* ==========================================================================
     DASHBOARD REPAINTING
     ========================================================================== */

  updateDashboardStats() {
    const people = this.engine.getAllPeople();
    const total = people.length;
    
    document.getElementById('stat-total-people').innerText = total.toLocaleString();

    // Generations
    const maxGen = this.engine.getGenerationsHeight();
    document.getElementById('stat-generations').innerText = maxGen;

    // Branches
    const branches = this.engine.getRoots().length;
    document.getElementById('stat-branches').innerText = branches;

    // Links rate
    const withParents = people.filter(p => p.fatherId).length;
    const rate = total > 0 ? Math.round((withParents / total) * 100) : 0;
    document.getElementById('stat-linkage-rate').innerText = `${rate}%`;

    // Gender breakdown
    const males = people.filter(p => p.gender === 'M').length;
    const females = total - males;
    
    document.getElementById('lbl-male-count').innerText = males.toLocaleString();
    document.getElementById('lbl-female-count').innerText = females.toLocaleString();

    const mPct = total > 0 ? (males / total) * 100 : 50;
    const fPct = total > 0 ? (females / total) * 100 : 50;
    document.getElementById('bar-male').style.width = `${mPct}%`;
    document.getElementById('bar-female').style.width = `${fPct}%`;

    // Diagnostics orphans count
    const unlinked = people.filter(p => !p.fatherId).length;
    document.getElementById('lbl-unlinked-count').innerText = `${unlinked} root patriarchs lack parents.`;
    
    const diagCard = document.getElementById('diag-orphans-card');
    if (unlinked > 0) {
      diagCard.className = 'diagnostic-item warning-item';
      diagCard.querySelector('.diag-bullet').innerText = '!';
    } else {
      diagCard.className = 'diagnostic-item success-item';
      diagCard.querySelector('.diag-bullet').innerText = '✓';
    }

    // Hide welcome banner if we have people loaded
    const banner = document.querySelector('.welcome-banner');
    if (total > 0) {
      banner.style.display = 'none';
    } else {
      banner.style.display = 'flex';
    }

    // Render Generation bars
    const genListContainer = document.getElementById('generation-bar-chart');
    genListContainer.innerHTML = '';

    if (total === 0) {
      genListContainer.innerHTML = `<div class="empty-state">No lineage data parsed yet. Load a mock tree or add members.</div>`;
      return;
    }

    // Map generations level count
    const levelsMap = this.engine.getGenerationsGrid();
    const counts = {};
    levelsMap.forEach((lvl) => {
      counts[lvl] = (counts[lvl] || 0) + 1;
    });

    const activeLevels = Object.keys(counts).map(Number).sort((a,b) => a - b);
    let maxGenCount = 0;
    activeLevels.forEach(lvl => {
      maxGenCount = Math.max(maxGenCount, counts[lvl]);
    });

    activeLevels.forEach(lvl => {
      const count = counts[lvl];
      const widthPct = maxGenCount > 0 ? (count / maxGenCount) * 100 : 0;
      
      const row = document.createElement('div');
      row.className = 'gen-chart-row';
      row.innerHTML = `
        <div class="gen-chart-label">Gen ${lvl}</div>
        <div class="gen-chart-bar-bg">
          <div class="gen-chart-bar-fill" style="width: ${widthPct}%"></div>
        </div>
        <div class="gen-chart-count">${count}</div>
      `;
      genListContainer.appendChild(row);
    });
  }

  /* ==========================================================================
     GLOBAL SEARCH AUTO-SUGGEST
     ========================================================================== */

  handleGlobalSearchInput() {
    const input = document.getElementById('global-search-input');
    const dropdown = document.getElementById('search-suggestions-dropdown');
    const query = input.value.trim().toLowerCase();
    
    this.searchFocusedIndex = -1;
    dropdown.innerHTML = '';

    if (query.length < 2) {
      dropdown.classList.add('hidden');
      return;
    }

    // High-performance tokenized search
    const matches = this.engine.searchPeopleByTokens(query).slice(0, 10);

    if (matches.length === 0) {
      dropdown.innerHTML = `<div style="padding: 10px; font-size: 12px; color: var(--win-text-secondary); text-align: center;">No matches found</div>`;
      dropdown.classList.remove('hidden');
      return;
    }

    matches.forEach((p, idx) => {
      const sItem = document.createElement('div');
      sItem.className = 'suggestion-item';
      sItem.setAttribute('data-id', p.id);
      
      let lineageText = p.gender === 'M' ? 'Son of ' : 'Daughter of ';
      lineageText += p.fatherName || 'Unknown';
      if (p.grandfatherName) {
        lineageText += ` son of ${p.grandfatherName}`;
      }

      sItem.innerHTML = `
        <div>
          <div class="suggestion-name">${p.name}</div>
          <div class="suggestion-lineage">${lineageText}</div>
        </div>
        <span class="suggestion-gender row-gender-badge badge-${p.gender}">${p.gender}</span>
      `;

      sItem.addEventListener('click', () => {
        this.showPersonDetail(p.id);
        input.value = '';
        dropdown.classList.add('hidden');
      });

      dropdown.appendChild(sItem);
    });

    dropdown.classList.remove('hidden');
  }

  handleCanvasSearchInput(inputId, dropdownId, onSelect, keepValue = false) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    if (!input || !dropdown) return;
    
    const query = input.value.trim().toLowerCase();
    dropdown.innerHTML = '';

    if (query.length < 1) {
      dropdown.classList.add('hidden');
      return;
    }

    // High performance token search
    const matches = this.engine.searchPeopleByTokens(query).slice(0, 8);

    if (matches.length === 0) {
      dropdown.innerHTML = `<div style="padding: 10px; font-size: 12px; color: var(--win-text-secondary); text-align: center;">No matches found</div>`;
      dropdown.classList.remove('hidden');
      return;
    }

    matches.forEach(p => {
      const sItem = document.createElement('div');
      sItem.className = 'suggestion-item';
      
      let lineageText = p.gender === 'M' ? 'Son of ' : 'Daughter of ';
      lineageText += p.fatherName || 'Unknown';
      if (p.grandfatherName) {
        lineageText += ` son of ${p.grandfatherName}`;
      }

      sItem.innerHTML = `
        <div>
          <div class="suggestion-name">${p.name}</div>
          <div class="suggestion-lineage">${lineageText}</div>
        </div>
        <span class="suggestion-gender row-gender-badge badge-${p.gender}">${p.gender}</span>
      `;

      sItem.addEventListener('click', () => {
        onSelect(p.id);
        if (!keepValue) input.value = '';
        dropdown.classList.add('hidden');
      });

      dropdown.appendChild(sItem);
    });

    dropdown.classList.remove('hidden');
  }

  highlightSuggestionItem(items) {
    items.forEach((item, idx) => {
      if (idx === this.searchFocusedIndex) {
        item.style.backgroundColor = 'var(--win-accent-light)';
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.style.backgroundColor = 'transparent';
      }
    });
  }

  /* ==========================================================================
     DATAGRID BINDING (1,000+ PAGED TABLE)
     ========================================================================== */

  populateGridGenerationOptions() {
    const select = document.getElementById('grid-filter-generation');
    select.innerHTML = '<option value="all">All Generations</option>';
    
    const maxGen = this.engine.getGenerationsHeight();
    for (let i = 1; i <= maxGen; i++) {
      const opt = document.createElement('option');
      opt.value = i;
      opt.innerText = `Generation ${i}`;
      select.appendChild(opt);
    }
  }

  clearGridFilters() {
    document.getElementById('grid-search').value = '';
    document.getElementById('grid-filter-gender').value = 'all';
    document.getElementById('grid-filter-generation').value = 'all';
    document.getElementById('grid-filter-status').value = 'all';
    this.gridPage = 1;
    this.updateGridData();
  }

  handleGridSort(field) {
    if (this.gridSortField === field) {
      this.gridSortOrder = this.gridSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      this.gridSortField = field;
      this.gridSortOrder = 'asc';
    }

    // Refresh headers arrows
    document.querySelectorAll('.fluent-data-table th').forEach(th => {
      const f = th.getAttribute('data-sort');
      if (f) {
        let label = th.innerText.replace(/[⇅▲▼]/g, '').trim();
        if (f === this.gridSortField) {
          label += this.gridSortOrder === 'asc' ? ' ▲' : ' ▼';
        } else {
          label += ' ⇅';
        }
        th.innerText = label;
      }
    });

    this.gridPage = 1;
    this.updateGridData();
  }

  // Filter and sort the complete list in memory first (ultra fast)
  updateGridData() {
    const people = this.engine.getAllPeople();
    const query = document.getElementById('grid-search').value.trim().toLowerCase();
    const gender = document.getElementById('grid-filter-gender').value;
    const generation = document.getElementById('grid-filter-generation').value;
    const status = document.getElementById('grid-filter-status').value;

    const levelsMap = this.engine.getGenerationsGrid();

    // Apply filters
    let list = people.filter(p => {
      // Search matches GivenName, Father, Grandfather, or ID
      if (query) {
        const match = p.name.toLowerCase().includes(query) ||
                      p.id.toLowerCase().includes(query) ||
                      (p.fatherName && p.fatherName.toLowerCase().includes(query)) ||
                      (p.grandfatherName && p.grandfatherName.toLowerCase().includes(query));
        if (!match) return false;
      }

      // Gender
      if (gender !== 'all' && p.gender !== gender) return false;

      // Generation level
      if (generation !== 'all') {
        const pGen = levelsMap.get(p.id) || 0;
        if (pGen !== Number(generation)) return false;
      }

      // Parent Link status
      if (status === 'orphans' && p.fatherId) return false;
      if (status === 'connected' && !p.fatherId) return false;

      return true;
    });

    // Apply Sorting
    list.sort((a, b) => {
      let valA = a[this.gridSortField] || '';
      let valB = b[this.gridSortField] || '';

      if (this.gridSortField === 'generation') {
        valA = levelsMap.get(a.id) || 999;
        valB = levelsMap.get(b.id) || 999;
      }

      // standard string/number sorting
      if (valA < valB) return this.gridSortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return this.gridSortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    this.gridFilteredList = list;
    
    // Page boundary correction
    const maxPage = Math.ceil(this.gridFilteredList.length / this.gridLimit) || 1;
    if (this.gridPage > maxPage) this.gridPage = maxPage;

    this.renderTableRows();
  }

  // Draw actual page segment in DOM table
  renderTableRows() {
    const tbody = document.getElementById('members-table-body');
    tbody.innerHTML = '';

    const totalFiltered = this.gridFilteredList.length;
    const startIdx = (this.gridPage - 1) * this.gridLimit;
    const endIdx = Math.min(startIdx + this.gridLimit, totalFiltered);

    // Update paging numbers
    document.getElementById('grid-rows-count').innerText = `${totalFiltered.toLocaleString()} Members matched`;
    document.getElementById('grid-pagination-info').innerText = `Showing ${startIdx + 1} - ${endIdx} of ${totalFiltered.toLocaleString()}`;

    // Update buttons
    const maxPage = Math.ceil(totalFiltered / this.gridLimit) || 1;
    document.getElementById('btn-grid-prev').disabled = this.gridPage === 1;
    document.getElementById('btn-grid-next').disabled = this.gridPage === maxPage;

    if (totalFiltered === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="loading-state">
            <div class="empty-state">No matching family records found. Try adjusting filters.</div>
          </td>
        </tr>
      `;
      return;
    }

    const levelsMap = this.engine.getGenerationsGrid();
    const slice = this.gridFilteredList.slice(startIdx, endIdx);

    slice.forEach(p => {
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', (e) => {
        // Prevent click trigger if button, input, or checkbox cell pressed
        if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT' && !e.target.closest('.checkbox-cell')) {
          this.showPersonDetail(p.id);
        }
      });

      const gen = levelsMap.get(p.id) || 1;
      const isSelected = this.selectedMemberIds.has(p.id);

      tr.innerHTML = `
        <td style="text-align: center;" class="checkbox-cell">
          <input type="checkbox" class="chk-grid-member" data-id="${p.id}" ${isSelected ? 'checked' : ''} style="height: 16px; width: 16px; margin: 0; cursor: pointer;">
        </td>
        <td style="font-weight:600; color:var(--win-accent);">${p.id}</td>
        <td style="font-weight:600;">${p.name}</td>
        <td>${p.fatherName || '<span style="color:var(--win-text-disabled)">None</span>'}</td>
        <td>${p.grandfatherName || '<span style="color:var(--win-text-disabled)">None</span>'}</td>
        <td><span class="row-gender-badge badge-${p.gender}">${p.gender === 'M' ? 'Male' : 'Female'}</span></td>
        <td><span class="row-gen-badge">Gen ${gen}</span></td>
        <td class="table-actions">
          <button class="fluent-btn btn-secondary px-8" style="height:24px; padding:0 8px; font-size:11px;" id="grid-view-btn-${p.id}">View</button>
        </td>
      `;

      tr.querySelector(`#grid-view-btn-${p.id}`).addEventListener('click', () => {
        this.showPersonDetail(p.id);
      });

      // Bind checkbox change listener
      const chk = tr.querySelector('.chk-grid-member');
      chk.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.selectedMemberIds.add(p.id);
        } else {
          this.selectedMemberIds.delete(p.id);
        }
        this.updateDeleteSelectedButtonState();
        this.updateSelectAllCheckboxState();
      });

      tbody.appendChild(tr);
    });

    // Update the visual select all states
    this.updateSelectAllCheckboxState();
    this.updateDeleteSelectedButtonState();
  }

  /* ==========================================================================
     MANUAL & BULK FORM PROCESSORS
     ========================================================================== */

  handleManualAdd() {
    const name = document.getElementById('input-person-name').value;
    const id = document.getElementById('input-person-id').value;
    const gender = document.getElementById('input-person-gender').value;
    const spouse = document.getElementById('input-person-spouse').value;
    const photo = document.getElementById('input-person-photo').value;
    const birthYear = document.getElementById('input-person-birth').value;
    const deathYear = document.getElementById('input-person-death').value;
    const father = document.getElementById('input-father-name').value;
    const mother = document.getElementById('input-mother-name').value;
    const grandfather = document.getElementById('input-grandfather-name').value;

    const p = this.engine.addPerson({
      id: id || undefined,
      name,
      fatherName: father,
      motherName: mother,
      grandfatherName: grandfather,
      gender,
      spouse,
      photo,
      birthYear,
      deathYear
    });

    if (p) {
      this.showNotification(`Successfully added ${p.name} to the family tree!`, "success");
      document.getElementById('form-add-person').reset();
      this.setFocusPerson(p.id);
      this.refreshAllUI();
      // Keep on the Add tab (no switchTab!) so the user can easily add the next family member
    }
  }

  handleBulkImport() {
    const textarea = document.getElementById('textarea-bulk');
    const text = textarea.value.trim();
    if (!text) {
      this.showNotification("Please paste some lineage strings before submitting.", "warning");
      return;
    }

    // Show loading UI
    const btn = document.getElementById('btn-submit-bulk');
    const originalText = btn.innerText;
    btn.innerText = '⏳ Parsing...';
    btn.disabled = true;

    // Send to Web Worker
    this.worker.postMessage({
      type: 'PARSE_TEXT',
      payload: { text }
    });
  }

  triggerMockGeneration() {
    this.showConfirm(
      "Generate Mock Tree?",
      "Generating 2,000+ members will wipe any manual entries. Proceed?",
      () => {
        // Fast loading visual feedback
        const btn = document.getElementById('btn-dash-import-mock');
        const prevText = btn.innerText;
        btn.innerText = '⚡ Processing Forest...';
        btn.disabled = true;

        setTimeout(() => {
          const size = this.engine.generateMockTree();
          btn.innerText = prevText;
          btn.disabled = false;
          
          // Focus on the root patriarch
          const roots = this.engine.getRoots();
          if (roots.length > 0) {
            this.setFocusPerson(roots[0].id);
          }

          this.refreshAllUI();
          this.showNotification(`Success! Family Tree Engine populated ${size.toLocaleString()} interconnected members across 7 generations.`, "success");
          this.switchTab('dashboard');
        }, 50);
      }
    );
  }

  triggerGiantMockGeneration() {
    this.showConfirm(
      "Generate 100,000 Mock Tree?",
      "Generating 100,000 members will clear any current data and load a massive family forest. Proceed?",
      () => {
        const overlay = document.getElementById('fluent-loading-overlay');
        if (overlay) overlay.classList.remove('hidden');

        this.mockStartTime = performance.now();
        this.worker.postMessage({
          type: 'GENERATE_MOCK_GIANT',
          payload: { size: 100000 }
        });
      }
    );
  }

  handleWorkerMessage(e) {
    const { type, result, count, firstId } = e.data;

    if (type === 'MOCK_GIANT_DONE') {
      const endTime = performance.now();
      console.log(`Worker generated 100,000 members in ${(endTime - this.mockStartTime).toFixed(1)}ms`);

      this.engine.clear();
      result.forEach(p => {
        this.engine.people.set(p.id, p);
        this.engine.indexName(p.name, p.id);
      });
      this.engine.saveToDB();

      const roots = this.engine.getRoots();
      if (roots.length > 0) {
        this.setFocusPerson(roots[0].id);
      }

      this.refreshAllUI();
      
      const overlay = document.getElementById('fluent-loading-overlay');
      if (overlay) overlay.classList.add('hidden');

      this.showNotification(`Success! Worker populated ${result.length.toLocaleString()} members in ${(endTime - this.mockStartTime).toFixed(0)}ms.`, "success");
      this.switchTab('dashboard');
    } 
    else if (type === 'PARSE_TEXT_DONE') {
      const btn = document.getElementById('btn-submit-bulk');
      btn.innerText = '⚡ Parse & Link Text';
      btn.disabled = false;

      if (count > 0) {
        this.engine.clear();
        result.forEach(p => {
          this.engine.people.set(p.id, p);
          this.engine.indexName(p.name, p.id);
        });
        this.engine.saveToDB();

        this.showNotification(`Success! Worker parsed and linked ${count} lineage strings.`, "success");
        document.getElementById('textarea-bulk').value = '';
        
        if (firstId) {
          this.setFocusPerson(firstId);
        } else {
          const list = this.engine.getAllPeople();
          if (list.length > 0) {
            this.setFocusPerson(list[list.length - 1].id);
          }
        }
        this.refreshAllUI();
      } else {
        this.showNotification("Failed to parse relationships. Check lineage formatting syntax.", "error");
      }
    }
  }

  handleExportJSON() {
    const people = this.engine.getAllPeople();
    if (people.length === 0) {
      this.showNotification("No family tree data to export. Build or import a family tree first!", "error");
      return;
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(people, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "family_tree_database.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  /* ==========================================================================
     PEDIGREE VIEW & EXPLORER DETAIL MODAL
     ========================================================================== */

  setFocusPerson(id) {
    this.focusPersonId = id;
    this.activeSpouseFilter = 'all';
    
    if (this.canvas) {
      this.canvas.setFocus(id);
    }
    if (this.worldCanvas) {
      this.worldCanvas.focusPersonId = id;
      this.worldCanvas.draw();
    }

    this.renderPedigreeDiagram();
  }

  // Redraw the 3-generation Pedigree Navigation layout
  renderPedigreeDiagram() {
    const focusNode = document.getElementById('pedigree-focus');
    const fatherNode = document.getElementById('pedigree-father');
    const motherNode = document.getElementById('pedigree-mother');
    const ffNode = document.getElementById('pedigree-ff');
    const fmNode = document.getElementById('pedigree-fm');
    const mfNode = document.getElementById('pedigree-mf');
    const mmNode = document.getElementById('pedigree-mm');
    const childrenContainer = document.getElementById('pedigree-children-container');
    const spouseFilterBar = document.getElementById('pedigree-spouse-filter-bar');

    childrenContainer.innerHTML = '';
    if (spouseFilterBar) {
      spouseFilterBar.innerHTML = '';
      spouseFilterBar.classList.add('hidden');
    }

    if (!this.focusPersonId) {
      focusNode.innerText = 'Select a Member';
      focusNode.className = 'pedigree-node focal-node empty-node';
      [fatherNode, motherNode, ffNode, fmNode, mfNode, mmNode].forEach(n => {
        n.innerText = 'No Record';
        n.className = 'pedigree-node empty-node';
      });
      return;
    }

    const p = this.engine.getPerson(this.focusPersonId);
    if (!p) return;

    // Render Focal Card
    focusNode.innerText = p.name;
    focusNode.className = `pedigree-node focal-node node-${p.gender}`;
    focusNode.onclick = () => this.showPersonDetail(p.id);

    // Father
    let father = null;
    if (p.fatherId) {
      father = this.engine.getPerson(p.fatherId);
    }
    this.populatePedigreeCard(fatherNode, father, 'M');

    // Mother (Direct Mother resolution)
    let mother = null;
    if (p.motherId) {
      mother = this.engine.getPerson(p.motherId);
    } else if (p.motherName) {
      mother = this.engine.findPatriarchNode(p.motherName);
    } else if (father && father.spouses && father.spouses.length > 0) {
      mother = this.engine.findPatriarchNode(father.spouses[0]);
    }
    this.populatePedigreeCard(motherNode, mother, 'F');

    // Father's Father
    let ff = null;
    if (father && father.fatherId) {
      ff = this.engine.getPerson(father.fatherId);
    }
    this.populatePedigreeCard(ffNode, ff, 'M');

    // Father's Mother
    let fm = null;
    if (father && father.motherId) {
      fm = this.engine.getPerson(father.motherId);
    } else if (ff && ff.spouses && ff.spouses.length > 0) {
      fm = this.engine.findPatriarchNode(ff.spouses[0]);
    }
    this.populatePedigreeCard(fmNode, fm, 'F');

    // Mother's Father
    let mf = null;
    if (mother && mother.fatherId) {
      mf = this.engine.getPerson(mother.fatherId);
    }
    this.populatePedigreeCard(mfNode, mf, 'M');

    // Mother's Mother
    let mm = null;
    if (mother && mother.motherId) {
      mm = this.engine.getPerson(mother.motherId);
    } else if (mf && mf.spouses && mf.spouses.length > 0) {
      mm = this.engine.findPatriarchNode(mf.spouses[0]);
    }
    this.populatePedigreeCard(mmNode, mm, 'F');

    // Render spousal filters if multiple spouses or just one exists
    if (spouseFilterBar && p.spouses && p.spouses.length > 0) {
      spouseFilterBar.classList.remove('hidden');

      // 1. "All Spouses" pill
      const allPill = document.createElement('div');
      allPill.className = `spouse-filter-pill ${this.activeSpouseFilter === 'all' ? 'active' : ''}`;
      allPill.innerText = 'All Children';
      allPill.onclick = () => {
        this.activeSpouseFilter = 'all';
        this.renderPedigreeChildren(p);
        // Refresh active pills styling
        spouseFilterBar.querySelectorAll('.spouse-filter-pill').forEach(el => el.classList.remove('active'));
        allPill.classList.add('active');
      };
      spouseFilterBar.appendChild(allPill);

      // 2. Spouse-specific pills
      p.spouses.forEach(spName => {
        const pill = document.createElement('div');
        pill.className = `spouse-filter-pill ${this.activeSpouseFilter === spName ? 'active' : ''}`;
        pill.innerText = `with ${spName.split(' ')[0]}`;
        pill.onclick = () => {
          this.activeSpouseFilter = spName;
          this.renderPedigreeChildren(p);
          spouseFilterBar.querySelectorAll('.spouse-filter-pill').forEach(el => el.classList.remove('active'));
          pill.classList.add('active');
        };
        spouseFilterBar.appendChild(pill);
      });
    }

    // Render children list based on active filter
    this.renderPedigreeChildren(p);
  }

  // Render children cards dynamically based on spousal filters
  renderPedigreeChildren(p) {
    const childrenContainer = document.getElementById('pedigree-children-container');
    childrenContainer.innerHTML = '';

    let filteredChildren = p.children || [];

    if (this.activeSpouseFilter !== 'all') {
      const selectedSpouseName = this.activeSpouseFilter;
      const spouseNode = this.engine.findPatriarchNode(selectedSpouseName);
      const spouseId = spouseNode ? spouseNode.id : null;

      filteredChildren = filteredChildren.filter(cid => {
        const child = this.engine.getPerson(cid);
        if (!child) return false;
        if (p.gender === 'M') {
          // Focus is father, spouse is mother
          if (spouseId && child.motherId === spouseId) return true;
          if (child.motherName && child.motherName.toLowerCase() === selectedSpouseName.toLowerCase()) return true;
          return false;
        } else {
          // Focus is mother, spouse is father
          if (spouseId && child.fatherId === spouseId) return true;
          if (child.fatherName && child.fatherName.toLowerCase() === selectedSpouseName.toLowerCase()) return true;
          return false;
        }
      });
    }

    if (filteredChildren.length === 0) {
      childrenContainer.innerHTML = '<div class="empty-text">No Children Recorded</div>';
    } else {
      filteredChildren.forEach(cid => {
        const child = this.engine.getPerson(cid);
        if (child) {
          const card = document.createElement('div');
          card.className = `pedigree-node node-${child.gender}`;
          card.innerText = child.name;
          card.onclick = () => this.setFocusPerson(child.id);
          childrenContainer.appendChild(card);
        }
      });
    }
  }

  populatePedigreeCard(element, person, defaultGender) {
    if (person) {
      element.innerText = person.name;
      element.className = `pedigree-node node-${person.gender}`;
      element.onclick = () => this.setFocusPerson(person.id);
    } else {
      element.innerText = 'No Record';
      element.className = 'pedigree-node empty-node';
      element.onclick = null;
    }
  }

  // Display fluent modal overlay detailing member lineage analytics
  showPersonDetail(id) {
    const p = this.engine.getPerson(id);
    if (!p) return;

    const modal = document.getElementById('modal-member-detail');
    const levelsMap = this.engine.getGenerationsGrid();
    const gen = levelsMap.get(id) || 1;

    // Badges
    const genderBadge = document.getElementById('detail-gender-badge');
    genderBadge.innerText = p.gender === 'M' ? 'Male' : 'Female';
    genderBadge.className = `gender-badge ${p.gender === 'M' ? 'male' : 'female'}`;
    
    document.getElementById('detail-gen-badge').innerText = `Gen ${gen}`;
    document.getElementById('detail-full-name').innerText = p.name;
    const lifespanStr = (p.birthYear !== undefined && p.birthYear !== null && p.birthYear !== 0) ? `${p.birthYear} - ${p.deathYear || 'Present'}` : 'Unknown';
    const lifespanEl = document.getElementById('detail-lifespan-val');
    if (lifespanEl) lifespanEl.innerText = lifespanStr;
    document.getElementById('detail-id').innerText = p.id;
    
    const photoEl = document.getElementById('detail-photo');
    if (p.photo) {
      photoEl.src = p.photo;
      photoEl.classList.remove('hidden');
    } else {
      photoEl.classList.add('hidden');
    }
    // Parent chains links
    const fatherVal = document.getElementById('detail-father-link');
    if (p.fatherId) {
      fatherVal.innerHTML = `<a href="#" style="color:var(--win-accent); font-weight:600; text-decoration:none;">${p.fatherName}</a>`;
      fatherVal.querySelector('a').onclick = (e) => {
        e.preventDefault();
        this.showPersonDetail(p.fatherId);
      };
    } else {
      fatherVal.innerHTML = `<span style="color:var(--win-text-disabled); font-weight:normal;">Unlinked Root</span>`;
    }

    // Mother link
    const motherVal = document.getElementById('detail-mother-link');
    if (motherVal) {
      if (p.motherId) {
        motherVal.innerHTML = `<a href="#" style="color:var(--win-accent); font-weight:600; text-decoration:none;">${p.motherName}</a>`;
        motherVal.querySelector('a').onclick = (e) => {
          e.preventDefault();
          this.showPersonDetail(p.motherId);
        };
      } else if (p.motherName) {
        const motherObj = this.engine.findPatriarchNode(p.motherName);
        if (motherObj) {
          motherVal.innerHTML = `<a href="#" style="color:var(--win-accent); font-weight:600; text-decoration:none;">${p.motherName}</a>`;
          motherVal.querySelector('a').onclick = (e) => {
            e.preventDefault();
            this.showPersonDetail(motherObj.id);
          };
        } else {
          motherVal.innerHTML = `<span style="font-weight:600;">${p.motherName}</span>`;
        }
      } else {
        motherVal.innerHTML = `<span style="color:var(--win-text-disabled); font-weight:normal;">Unlinked</span>`;
      }
    }

    const gfVal = document.getElementById('detail-grandfather-link');
    if (p.fatherId) {
      const fatherObj = this.engine.getPerson(p.fatherId);
      if (fatherObj && fatherObj.fatherId) {
        gfVal.innerHTML = `<a href="#" style="color:var(--win-accent); font-weight:600; text-decoration:none;">${fatherObj.fatherName}</a>`;
        gfVal.querySelector('a').onclick = (e) => {
          e.preventDefault();
          this.showPersonDetail(fatherObj.fatherId);
        };
      } else {
        gfVal.innerHTML = `<span style="font-weight:600;">${p.grandfatherName || 'Unknown'}</span>`;
      }
    } else {
      gfVal.innerHTML = `<span style="color:var(--win-text-disabled); font-weight:normal;">Unknown</span>`;
    }

    // Multi-spouse details list
    const spouseVal = document.getElementById('detail-spouse-val');
    if (p.spouses && p.spouses.length > 0) {
      spouseVal.innerHTML = p.spouses.map((spName, idx) => {
        const spouseNode = this.engine.findPatriarchNode(spName);
        if (spouseNode) {
          return `<a href="#" id="modal-spouse-link-${idx}" style="color:var(--win-accent); font-weight:600; text-decoration:none;">${spName}</a>`;
        } else {
          return `<span style="font-weight:600;">${spName}</span>`;
        }
      }).join(', ');

      p.spouses.forEach((spName, idx) => {
        const link = document.getElementById(`modal-spouse-link-${idx}`);
        if (link) {
          link.onclick = (e) => {
            e.preventDefault();
            const spouseNode = this.engine.findPatriarchNode(spName);
            if (spouseNode) {
              this.showPersonDetail(spouseNode.id);
            }
          };
        }
      });
    } else {
      spouseVal.innerHTML = `<span style="color:var(--win-text-disabled); font-weight:normal;">Unmarried</span>`;
    }

    // Siblings
    const sibContainer = document.getElementById('detail-siblings-list');
    sibContainer.innerHTML = '';
    const siblings = this.engine.getSiblings(p.id);
    if (siblings.length === 0) {
      sibContainer.innerHTML = '<span class="empty-subtext">No siblings registered.</span>';
    } else {
      siblings.forEach(s => {
        const bub = document.createElement('span');
        bub.className = 'mini-bubble';
        bub.innerText = s.name.split(' ')[0];
        bub.onclick = () => this.showPersonDetail(s.id);
        sibContainer.appendChild(bub);
      });
    }

    // Children
    document.getElementById('detail-children-count').innerText = p.children.length;
    const childContainer = document.getElementById('detail-children-list');
    childContainer.innerHTML = '';
    if (p.children.length === 0) {
      childContainer.innerHTML = '<span class="empty-subtext">No children registered.</span>';
    } else {
      p.children.forEach(cid => {
        const child = this.engine.getPerson(cid);
        if (child) {
          const bub = document.createElement('span');
          bub.className = 'mini-bubble';
          bub.innerText = child.name.split(' ')[0];
          bub.onclick = () => this.showPersonDetail(child.id);
          childContainer.appendChild(bub);
        }
      });
    }

    // Root Patriarch
    const ancestors = this.engine.getAncestors(p.id);
    const patriarch = ancestors.length > 0 ? ancestors[ancestors.length - 1] : p;
    document.getElementById('detail-patriarch-val').innerText = patriarch.name;

    // Descendants count
    const descendants = this.engine.getDescendants(p.id);
    document.getElementById('detail-descendants-count').innerText = `${descendants.length} members`;

    modal.classList.remove('hidden');
  }

  // Handle checking/unchecking all items in the filtered list
  handleSelectAllChange(checked) {
    if (checked) {
      this.gridFilteredList.forEach(p => this.selectedMemberIds.add(p.id));
    } else {
      this.gridFilteredList.forEach(p => this.selectedMemberIds.delete(p.id));
    }
    this.renderTableRows();
    this.updateSelectAllCheckboxState();
    this.updateDeleteSelectedButtonState();
  }

  // Update check state of the select all inputs
  updateSelectAllCheckboxState() {
    const chkHeader = document.getElementById('chk-grid-select-all-header');
    const chkFilters = document.getElementById('chk-grid-select-all');
    
    const totalFiltered = this.gridFilteredList.length;
    const allSelected = totalFiltered > 0 && this.gridFilteredList.every(p => this.selectedMemberIds.has(p.id));
    
    if (chkHeader) chkHeader.checked = allSelected;
    if (chkFilters) chkFilters.checked = allSelected;
  }

  // Update disabled state and count of the delete selected button
  updateDeleteSelectedButtonState() {
    const btnDelete = document.getElementById('btn-grid-delete-selected');
    if (btnDelete) {
      const count = this.selectedMemberIds.size;
      btnDelete.disabled = count === 0;
      btnDelete.innerText = count > 0 ? `🗑️ Delete Selected (${count})` : '🗑️ Delete Selected';
    }
  }

  // Confirm and perform bulk deletion of selected items
  handleDeleteSelected() {
    const count = this.selectedMemberIds.size;
    if (count === 0) return;

    this.showConfirm(
      "Delete Selected Members?",
      `Are you sure you want to permanently delete these ${count} selected family members? This action cannot be undone and will clean up all lineage references.`,
      () => {
        // We delete each selected member
        this.selectedMemberIds.forEach(id => {
          this.engine.deletePerson(id);
        });
        
        // Clear selection
        this.selectedMemberIds.clear();
        
        // Update focused person if they were deleted
        if (this.focusPersonId && !this.engine.getPerson(this.focusPersonId)) {
          const remaining = this.engine.getAllPeople();
          if (remaining.length > 0) {
            this.setFocusPerson(remaining[0].id);
          } else {
            this.focusPersonId = null;
            this.renderPedigreeDiagram();
            if (this.canvas) this.canvas.setFocus(null);
          }
        } else if (this.focusPersonId) {
          this.setFocusPerson(this.focusPersonId);
        }
        
        // Refresh UI
        this.refreshAllUI();
        this.showNotification(`Successfully deleted ${count} members.`, "success");
      }
    );
  }

  // Execute resolution of ID collision (Replace existing person or merge details)
  executeConflictResolution(mode) {
    const action = this.pendingConflictAction;
    if (!action) return;

    const { type, oldId, newId, data } = action;

    if (type === 'add') {
      if (mode === 'replace') {
        // Delete the existing member at newId first to clear all relationship references
        this.engine.deletePerson(newId);

        // Add as a fresh new person with that ID
        const p = this.engine.addPerson({
          id: newId,
          name: data.name,
          fatherName: data.fatherName,
          motherName: data.motherName,
          grandfatherName: data.grandfatherName,
          gender: data.gender,
          spouse: data.spouses
        });
        if (p) {
          this.showNotification(`Successfully replaced and added ${p.name}!`, "success");
          document.getElementById('form-add-person').reset();
          this.setFocusPerson(p.id);
        }
      } else {
        // Merge: combine details on top of existing person
        const existing = this.engine.people.get(newId);
        
        const newSpouses = data.spouses ? data.spouses.split(',').map(s => s.trim()).filter(Boolean) : [];
        const mergedSpouses = [...new Set([...(existing.spouses || []), ...newSpouses])].join(',');

        const mergedName = data.name.trim() || existing.name;
        const mergedGender = data.gender || existing.gender;
        const mergedFather = data.fatherName.trim() || existing.fatherName || '';
        const mergedMother = data.motherName.trim() || existing.motherName || '';
        const mergedGrandfather = data.grandfatherName.trim() || existing.grandfatherName || '';

        const p = this.engine.modifyPerson(newId, {
          name: mergedName,
          gender: mergedGender,
          spouses: mergedSpouses,
          fatherName: mergedFather,
          motherName: mergedMother,
          grandfatherName: mergedGrandfather
        });
        if (p) {
          this.showNotification(`Successfully merged details with existing member ${p.name}!`, "success");
          document.getElementById('form-add-person').reset();
          this.setFocusPerson(p.id);
        }
      }
    } else if (type === 'edit') {
      if (mode === 'replace') {
        // Replace existing newId with current edited oldId
        this.engine.deletePerson(newId);

        // Rename oldId to newId
        this.engine.renamePersonId(oldId, newId);

        // Apply new details
        const p = this.engine.modifyPerson(newId, {
          name: data.name,
          gender: data.gender,
          spouses: data.spouses,
          fatherName: data.fatherName,
          motherName: data.motherName,
          grandfatherName: data.grandfatherName
        });

        if (p) {
          this.showNotification("Successfully replaced member details!", "success");
          document.getElementById('modal-member-edit').classList.add('hidden');
          this.setFocusPerson(newId);
        }
      } else {
        // Merge oldId details and children into newId, then delete oldId
        const existing = this.engine.people.get(newId);

        const newSpouses = data.spouses ? data.spouses.split(',').map(s => s.trim()).filter(Boolean) : [];
        const mergedSpouses = [...new Set([...(existing.spouses || []), ...newSpouses])].join(',');

        const mergedName = data.name.trim() || existing.name;
        const mergedGender = data.gender || existing.gender;
        const mergedFather = data.fatherName.trim() || existing.fatherName || '';
        const mergedMother = data.motherName.trim() || existing.motherName || '';
        const mergedGrandfather = data.grandfatherName.trim() || existing.grandfatherName || '';

        const oldPerson = this.engine.people.get(oldId);
        if (oldPerson && oldPerson.children) {
          if (!existing.children) existing.children = [];
          oldPerson.children.forEach(cid => {
            if (!existing.children.includes(cid)) {
              existing.children.push(cid);
            }
            const child = this.engine.people.get(cid);
            if (child) {
              if (existing.gender === 'M') {
                child.fatherId = newId;
                child.fatherName = mergedName;
              } else {
                child.motherId = newId;
                child.motherName = mergedName;
              }
            }
          });
        }

        const p = this.engine.modifyPerson(newId, {
          name: mergedName,
          gender: mergedGender,
          spouses: mergedSpouses,
          fatherName: mergedFather,
          motherName: mergedMother,
          grandfatherName: mergedGrandfather
        });

        // Delete oldId as it has been merged
        this.engine.deletePerson(oldId);

        if (p) {
          this.showNotification("Successfully merged data from both records!", "success");
          document.getElementById('modal-member-edit').classList.add('hidden');
          this.setFocusPerson(newId);
        }
      }
    }

    this.refreshAllUI();
    this.pendingConflictAction = null;
  }

  showPathfinderModal() {
    // Reset path finder inputs
    const startInput = document.getElementById('path-start-input');
    const endInput = document.getElementById('path-end-input');
    if (startInput) startInput.value = '';
    if (endInput) endInput.value = '';
    const startIdEl = document.getElementById('path-start-id');
    if (startIdEl) startIdEl.value = '';
    const endIdEl = document.getElementById('path-end-id');
    if (endIdEl) endIdEl.value = '';
    const resContainer = document.getElementById('path-results-container');
    if (resContainer) resContainer.classList.add('hidden');
    const resList = document.getElementById('path-results-list');
    if (resList) resList.innerHTML = '';

    // Show modal
    const pathfinderModal = document.getElementById('modal-v8-pathfinder');
    if (pathfinderModal) {
      pathfinderModal.classList.remove('hidden');
    }
  }

  calculateRelationshipPath() {
    const startId = document.getElementById('path-start-id').value;
    const endId = document.getElementById('path-end-id').value;
    const startVal = document.getElementById('path-start-input').value.trim();
    const endVal = document.getElementById('path-end-input').value.trim();

    const resContainer = document.getElementById('path-results-container');
    const resList = document.getElementById('path-results-list');
    if (!resContainer || !resList) return;

    if (!startId || !endId || !startVal || !endVal) {
      this.showNotification("Please select both start and end members from suggestions.", "warning");
      return;
    }

    const path = this.engine.findRelationshipPath(startId, endId);

    resContainer.classList.remove('hidden');
    resList.innerHTML = '';

    if (!path || path.length === 0) {
      resList.innerHTML = `<div style="font-size:12px; color:var(--win-text-secondary); padding:5px 0; text-align:center;">No relationship connection path found between these members.</div>`;
      return;
    }

    // Render path list
    path.forEach((personId, index) => {
      const p = this.engine.getPerson(personId);
      if (!p) return;
      
      const item = document.createElement('div');
      item.style.display = 'flex';
      item.style.alignItems = 'center';
      item.style.justifyContent = 'space-between';
      item.style.padding = '8px 12px';
      item.style.borderRadius = '4px';
      item.style.background = 'var(--win-card-bg)';
      item.style.border = '1px solid var(--win-border-light)';
      
      let stepLabel = '';
      if (index === 0) {
        stepLabel = '<span style="font-size:9px; font-weight:bold; color:var(--win-accent); text-transform:uppercase;">Start</span>';
      } else if (index === path.length - 1) {
        stepLabel = '<span style="font-size:9px; font-weight:bold; color:var(--win-accent); text-transform:uppercase;">End</span>';
      } else {
        stepLabel = `<span style="font-size:9px; color:var(--win-text-secondary);">Step ${index}</span>`;
      }

      item.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:flex-start;">
          <span style="font-size:12.5px; font-weight:600; color:var(--win-text-primary);">${p.name}</span>
          <span style="font-size:10px; color:var(--win-text-secondary);">ID: ${p.id}</span>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          ${stepLabel}
          <span class="row-gender-badge badge-${p.gender}" style="font-size:9px; font-weight:bold; padding:2px 6px; border-radius:10px;">${p.gender}</span>
        </div>
      `;

      item.style.cursor = 'pointer';
      item.title = 'Make Focus in Explorer';
      item.addEventListener('click', () => {
        this.setFocusPerson(p.id);
        this.switchTab('explorer');
        document.getElementById('modal-v8-pathfinder').classList.add('hidden');
        if (this.canvas) {
          this.canvas.centerOnNode(p.id);
        }
      });

      resList.appendChild(item);

      // Add connection arrow between items
      if (index < path.length - 1) {
        const arrow = document.createElement('div');
        arrow.style.textAlign = 'center';
        arrow.style.color = 'var(--win-text-disabled)';
        arrow.style.fontSize = '12px';
        arrow.style.margin = '2px 0';
        arrow.innerHTML = '⇅';
        resList.appendChild(arrow);
      }
    });
  }
}
