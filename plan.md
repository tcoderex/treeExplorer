# Feature Development Plan

## Objective
Upgrade application to Version 9.6.0 and implement a true "Genealogy View" transformation based on user feedback.

## Steps
1. Revert previous incorrect "black line" changes to ensure clean state.
2. Upgrade version to 9.6.0 in `package.json`.
3. Add a new Transform button in the settings modal.
4. Create a new Popup Modal for view selection (Tree, World, Both).
5. Add state flags to `LineageCanvas` (e.g. `isGenealogyMode`).
6. Overhaul `drawNodes` and `drawConnections` in `canvas.js` when `isGenealogyMode` is active to render a completely distinct classic pedigree style chart instead of just patching lines.
7. Test the transformation on both Tree and World views.
