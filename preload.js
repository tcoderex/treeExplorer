const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  db: {
    run: (sql, params) => ipcRenderer.invoke('db-run', sql, params),
    get: (sql, params) => ipcRenderer.invoke('db-get', sql, params),
    all: (sql, params) => ipcRenderer.invoke('db-all', sql, params),
    exec: (sql) => ipcRenderer.invoke('db-exec', sql),
    batch: (persons) => ipcRenderer.invoke('db-batch', persons),
  },
  appReady: () => ipcRenderer.send('app-ready'),
  downloadJsPDF: () => ipcRenderer.invoke('download-jspdf')
});
