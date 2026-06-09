# System Architecture and Structure

## Core Components
- `index.html`: Main entry point containing Fluent UI DOM structure, modals, and settings.
- `src/main.js`: Electron app initialization and window management.
- `src/preload.js`: IPC bridge for secure communication between renderer and main process.
- `src/engine.js`: Tree logic, relational graph database, and traversal algorithms.
- `src/canvas.js`: Core rendering engine (`LineageCanvas`) using HTML5 Canvas for drawing graph nodes, layouts, and connections.
- `src/ui.js`: UI controller managing interactions, events, modals, settings, and bridging `engine.js` with `canvas.js`.

## Data Flow
User interactions in UI trigger data requests to Engine -> Engine processes relational graph -> Canvas redraws based on updated engine state.
