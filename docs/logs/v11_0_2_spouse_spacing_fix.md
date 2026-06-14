# Spouse Spacing & Pedigree Connections Milestone Summary (v11.0.2)

This milestone introduces spacing adjustments and connector line optimizations in the canvas layout generator. These changes address overlapping cards at identical generation layers and clean up horizontal spouse relationship lines in genealogy/pedigree mode.

> [!NOTE]
> All coordinates are recalculated dynamically. The [applySmartSpacing](file:///c:/Users/Admin/Applications/treeExplorer-main/src/canvas.js#L666-L724) method enforces collision boundaries on the active layout axis before centering nodes back around the focused center.

---

## 📂 Modified Files

*   [src/canvas.js](file:///c:/Users/Admin/Applications/treeExplorer-main/src/canvas.js)
    *   Added [applySmartSpacing](file:///c:/Users/Admin/Applications/treeExplorer-main/src/canvas.js#L666-L724) to resolve node overlaps on the same generation layers.
    *   Modified [drawConnections](file:///c:/Users/Admin/Applications/treeExplorer-main/src/canvas.js#L1288-L1315) to dynamically differentiate between stacked vertical spouse brackets and lateral horizontal spouse lines in genealogy mode.
    *   Enhanced [drawSpouseLine](file:///c:/Users/Admin/Applications/treeExplorer-main/src/canvas.js#L1509-L1564) with a dedicated branch for genealogy layout directions, drawing clean horizontal dashed connections from the right edge of the left node to the left edge of the right node.

---

## 📋 Completed Milestone Checklist

- [x] **Overlap Prevention via `applySmartSpacing`**:
  - [x] Group active layout nodes dynamically by their generation layer (`layerIdx`).
  - [x] Determine layout axis dynamically based on `layoutDirection` (vertical or horizontal).
  - [x] Sort layer nodes along the layout axis (X-axis for vertical layout, Y-axis for horizontal layout).
  - [x] Loop through sorted nodes and push overlapping cards out of bounding collisions using `nodeWidth + spacing` or `nodeHeight + spacing` as minimal separation distances.
  - [x] Center each layer's bounds back to maintain layout symmetry.
- [x] **Pedigree Spouse Connector Routing**:
  - [x] Identify spatial coordinate alignment in `drawConnections` by checking `Math.abs(node.x - spouseNode.x) < 10`.
  - [x] Route stacked spouses to `drawGenealogySpouseLine` (renders vertical brackets).
  - [x] Route horizontally separated spouses to `drawSpouseLine`.
- [x] **Clean Lateral Connectors**:
  - [x] Calculate left and right spouse nodes dynamically based on X coordinates.
  - [x] Position connection start point at the right edge of the left node (`leftNode.x + nodeWidth`) and center-right vertically.
  - [x] Position connection end point at the left edge of the right node (`rightNode.x`) and center-left vertically.
  - [x] Render horizontal spouse lines as dashed theme-compliant lines (`[4, 4]` dash pattern) to ensure layout legibility.

---

## 🛠️ Verification Logs

### Vite Compilation Output (npm run build)

```bash
> extra-c@11.0.2 build
> vite build

vite v5.4.21 building for production...
transforming...
✓ 10 modules transformed.
rendering chunks...
computing gzip size...
dist/assets/worker-CV-knkQx.js   42.06 kB
dist/index.html                 123.75 kB │ gzip: 21.85 kB
dist/assets/index-74erT07P.css   81.71 kB │ gzip: 14.14 kB
dist/assets/engine-RSkrd1Pj.js   41.67 kB │ gzip: 11.42 kB
dist/assets/canvas-BXnaF18b.js   42.64 kB │ gzip: 10.59 kB
dist/assets/index-H7q1Su7k.js   156.64 kB │ gzip: 41.48 kB
✓ built in 459ms
```
