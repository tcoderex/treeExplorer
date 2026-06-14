---
name: start-electron-app
description: Compiles the frontend assets and boots up the active desktop Electron application window for manual validation testing. Use this when the user wants to see the app running or verify UI changes.
---

# Skill: Start Electron App

## Core Objective
Ensure the application compiles natively and launches the visual UI container without crashing.

## Procedural Steps
0. **Read Rules First**: Before running, building, or modifying code, always consult `.agents/AGENTS.md` and this `SKILL.md` to ensure constraints and dependencies are fully loaded in memory.
1. Open the project root directory in the local terminal shell tool.
2. Execute the build engine script: `npm run build`
3. If the compilation completes successfully, launch the application shell: `npm run electron:start`
4. Monitor the runtime process logs for unexpected errors or exceptions.

## Troubleshooting & Native Rebuilds
- **Dev Server Mode**: For rapid UI tweaking and testing in the browser, run `npm run dev` to launch the Vite development server.
- **Native Modules (SQLite)**: If the app crashes on startup complaining about `better-sqlite3` bindings, run `npm rebuild` or `npx electron-rebuild` to rebuild the native SQLite modules matched to your local Electron/Node headers.
- **Dependency Installation**: If packages are missing, run `npm install` first. Ensure all external client scripts like `jsPDF` reside in `public/` to prevent Vite asset path resolving errors.

## Sandbox GUI Environment Constraints
> [!WARNING]
> Because the agent runs in a sandboxed command line shell, launching GUI desktop applications (like `npm run electron:start`) from the agent's background terminal runner may execute them inside a headless, non-interactive Windows session. This means the application process will start successfully in the background but **will not render visually** on the user's active desktop screen.
> 
> When testing or verifying UI changes:
> 1. Execute `npm run build` to confirm Vite compiles with zero errors.
> 2. Propose `npm run electron:start` to verify the process launches and does not crash on startup.
> 3. If it launches successfully but does not visually appear on the user's screen, clearly explain this session constraint to the user and suggest they run `npm run electron:start` directly in their own local host terminal.

## GitHub Push Constraints
> [!IMPORTANT]
> 1. **Never** proactively suggest, ask, or prompt the user to run a git push to GitHub. 
> 2. The push workflow should only trigger when the user explicitly instructs you to push to GitHub.
> 3. When requested by the user, you must alert them first and wait for their explicit final confirmation before executing `git push`.
