
import electron from 'electron';
const { app, BrowserWindow, ipcMain } = electron;
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import fs from 'fs';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize SQLite database
const dbPath = path.join(app.getPath('userData'), 'family_tree.db');
const db = new Database(dbPath);

// Create the tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS people (
    id TEXT PRIMARY KEY,
    firstName TEXT NOT NULL,
    familyName TEXT,
    gender TEXT,
    photo TEXT,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS relationships (
    id TEXT PRIMARY KEY,
    person1Id TEXT NOT NULL,
    person2Id TEXT NOT NULL,
    type TEXT NOT NULL,
    metadata TEXT
  );
`);

try {
  db.exec('ALTER TABLE people ADD COLUMN photo TEXT;');
} catch (e) {}

try {
  db.exec('ALTER TABLE people ADD COLUMN notes TEXT;');
} catch (e) {}

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

ipcMain.handle('db-batch', (event, { persons, relationships }) => {
  const stmtPerson = db.prepare(`INSERT OR REPLACE INTO people (id, firstName, familyName, gender, photo, notes) VALUES (?, ?, ?, ?, ?, ?)`);
  const stmtRel = db.prepare(`INSERT OR REPLACE INTO relationships (id, person1Id, person2Id, type, metadata) VALUES (?, ?, ?, ?, ?)`);
  
  const insertMany = db.transaction((data) => {
    for (const p of data.persons) {
      stmtPerson.run(p.id, p.firstName || '', p.familyName || '', p.gender || '', p.photo || '', p.notes || '');
    }
    
    // Clear old relationships so we don't accumulate endless duplicates
    db.prepare('DELETE FROM relationships').run();
    
    for (const r of data.relationships) {
      stmtRel.run(r.id, r.person1Id, r.person2Id, r.type, JSON.stringify(r.metadata || {}));
    }
  });
  insertMany({ persons, relationships });
});

ipcMain.handle('db-exec', (event, sql) => {
  return db.exec(sql);
});

ipcMain.handle('download-jspdf', () => {
  return new Promise((resolve, reject) => {
    const filePath = path.join(process.cwd(), 'jspdf.umd.min.js');
    const distPath = path.join(process.cwd(), 'dist', 'jspdf.umd.min.js');

    if (fs.existsSync(filePath)) {
      if (fs.existsSync(path.join(process.cwd(), 'dist')) && !fs.existsSync(distPath)) {
        try {
          fs.copyFileSync(filePath, distPath);
        } catch (e) {
          console.error("Failed to copy to dist", e);
        }
      }
      return resolve({ success: true, message: 'Already exists locally.' });
    }

    const file = fs.createWriteStream(filePath);
    const url = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: Status Code ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          if (fs.existsSync(path.join(process.cwd(), 'dist'))) {
            try {
              fs.copyFileSync(filePath, distPath);
            } catch (e) {
              console.error("Failed to copy to dist after download", e);
            }
          }
          resolve({ success: true, message: 'Downloaded successfully.' });
        });
      });
    }).on('error', (err) => {
      fs.unlink(filePath, () => {});
      reject(err);
    });
  });
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
    icon: path.join(__dirname, 'build', 'icon.png'),
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
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false,
    title: "The Arabic Area",
    backgroundColor: '#f3f3f3',
    frame: false,
    titleBarStyle: 'hidden',
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
    ipcMain.on('window-close', () => { if(mainWindow) mainWindow.close(); });
    ipcMain.on('window-minimize', () => { if(mainWindow) mainWindow.minimize(); });
    ipcMain.on('window-maximize', () => { 
      if(mainWindow) {
        if(mainWindow.isMaximized()) mainWindow.unmaximize();
        else mainWindow.maximize();
      }
    });
    ipcMain.handle('translate-batch', async (event, texts, targetLang) => {
      try {
        const { translate } = await import('google-translate-api-browser');
        const results = [];
        for (let i = 0; i < texts.length; i += 20) {
          const chunk = texts.slice(i, i + 20);
          const combined = chunk.join('\n~~~\n');
          const res = await translate(combined, { to: targetLang });
          const translatedArray = res.text.split(/~~~/).map(s => s.trim());
          results.push(...translatedArray);
        }
        return results;
      } catch (e) {
        console.error("Translation error:", e);
        return null;
      }
    });
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
