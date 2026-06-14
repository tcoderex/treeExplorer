---
name: start-electron-app
description: Compiles the frontend assets and boots up the active desktop Electron application window for manual validation testing. Use this when the user wants to see the app running or verify UI changes.
---

# Skill: Start Electron App

## Core Objective
Ensure the application compiles natively and launches the visual UI container without crashing.

## Procedural Steps
1. Open the project root directory in the local terminal shell tool.
2. Execute the build engine script: `npm run build`
3. If the compilation completes successfully, launch the application shell: `npm run electron:start`
4. Monitor the runtime process logs for unexpected errors or exceptions.

## Troubleshooting & Native Rebuilds
- **Dev Server Mode**: For rapid UI tweaking and testing in the browser, run `npm run dev` to launch the Vite development server.
- **Native Modules (SQLite)**: If the app crashes on startup complaining about `better-sqlite3` bindings, run `npm rebuild` or `npx electron-rebuild` to rebuild the native SQLite modules matched to your local Electron/Node headers.
- **Dependency Installation**: If packages are missing, run `npm install` first. Ensure all external client scripts like `jsPDF` reside in `public/` to prevent Vite asset path resolving errors.

## GitHub Push Constraints
> [!IMPORTANT]
> Never push code changes to GitHub until the user explicitly instructs you to do so. When the user tells you to push, always alert them first and wait for their confirmation before executing the push command.
