
import electron from 'electron';
const { app, BrowserWindow, ipcMain } = electron;
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize SQLite database
const dbPath = path.join(app.getPath('userData'), 'family_tree.db');
const db = new Database(dbPath);

// Create the tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS people (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    gender TEXT,
    spouses TEXT,
    fatherId TEXT,
    fatherName TEXT,
    motherId TEXT,
    motherName TEXT,
    grandfatherName TEXT,
    photo TEXT,
    notes TEXT
  )
`);

try {
  db.exec(`ALTER TABLE people ADD COLUMN photo TEXT DEFAULT ''`);
} catch (e) {
  // Column likely already exists
}

// Setup IPC handlers for the database
ipcMain.handle('db-run', (event, sql, params = []) => {
  const stmt = db.prepare(sql);
  return stmt.run(params);
});

ipcMain.handle('db-get', (event, sql, params = []) => {
  const stmt = db.prepare(sql);
  return stmt.get(params);
});

ipcMain.handle('db-all', (event, sql, params = []) => {
  const stmt = db.prepare(sql);
  return stmt.all(params);
});

ipcMain.handle('db-batch', (event, persons) => {
  const stmt = db.prepare(`INSERT OR REPLACE INTO people (id, name, gender, spouses, fatherId, fatherName, motherId, motherName, grandfatherName, photo, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '')`);
  const insertMany = db.transaction((personsList) => {
    for (const p of personsList) {
      stmt.run(p.id, p.name, p.gender, JSON.stringify(p.spouses || []), p.fatherId || '', p.fatherName || '', p.motherId || '', p.motherName || '', p.grandfatherName || '', p.photo || '');
    }
  });
  insertMany(persons);
});

ipcMain.handle('db-exec', (event, sql) => {
  return db.exec(sql);
});

let mainWindow;
let splashWindow;

function createWindow() {
  // Create Splash Window
  splashWindow = new BrowserWindow({
    width: 400,
    height: 500,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.once('ready-to-show', () => {
    splashWindow.show();
  });

  // Create Main Window
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false,
    title: "Windows Family Tree Explorer",
    backgroundColor: '#f3f3f3',
  });

  const isDev = process.env.VITE_DEV_SERVER === 'true';

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  // Optimize load by showing main window only when the renderer says it's ready
  ipcMain.once('app-ready', () => {
    // Artificial 2500ms delay to give the splash screen time to animate
    setTimeout(() => {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
        splashWindow = null;
      }
      mainWindow.show();
    }, 2500);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// In case single instance is locked
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
