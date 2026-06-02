/* ==========================================================================
   APPLICATION ENTRY POINT BOOTSTRAPPER
   ========================================================================== */

import './style.css';
import { FamilyTreeEngine } from './engine.js';
import { FamilyTreeUI } from './ui.js';

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Instantiate Core Engine
  const engine = new FamilyTreeEngine();
  
  // Load data from SQLite
  if (engine.loadFromDB) {
    await engine.loadFromDB();
  }

  // 2. Instantiate View Controller UI
  const ui = new FamilyTreeUI(engine);

  // 3. Attach globally for debugging/fast console tweaks if needed
  window.App = {
    engine,
    ui
  };

  // 4. Initial UI repaint (loads elements and statistics charts)
  ui.refreshAllUI();

  // 5. Tell the main process to close the splash screen now that data is loaded
  // Add a minimum aesthetic delay so the user can enjoy the splash screen branding
  setTimeout(() => {
    if (window.api && window.api.appReady) {
      window.api.appReady();
    }
  }, 1500);
});
