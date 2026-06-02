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
    notes TEXT
  )
`);

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
  const stmt = db.prepare(`INSERT OR REPLACE INTO people (id, name, gender, spouses, fatherId, fatherName, motherId, motherName, grandfatherName, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '')`);
  const insertMany = db.transaction((personsList) => {
    for (const p of personsList) {
      stmt.run(p.id, p.name, p.gender, JSON.stringify(p.spouses || []), p.fatherId || '', p.fatherName || '', p.motherId || '', p.motherName || '', p.grandfatherName || '');
    }
  });
  insertMany(persons);
});

ipcMain.handle('db-exec', (event, sql) => {
  return db.exec(sql);
});

let mainWindow;

function createWindow() {
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
    // Premium style
    backgroundColor: '#f3f3f3',
  });

  // Check if we are running in dev mode
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
    // Open DevTools in production to diagnose loading errors
    mainWindow.webContents.openDevTools();
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
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
