const fs = require('fs');

// 1. main.js
const mainJsPath = 'c:/Users/Admin/Documents/application/treeExplorer-main/main.js';
let mainContent = fs.readFileSync(mainJsPath, 'utf8');

const targetMain = `app.whenReady().then(() => {
  createWindow();`;

const replacementMain = `app.whenReady().then(() => {
  ipcMain.handle('translate-batch', async (event, texts, targetLang) => {
    try {
      const { translate } = await import('google-translate-api-browser');
      const results = [];
      for (let i = 0; i < texts.length; i += 20) {
        const chunk = texts.slice(i, i + 20);
        const combined = chunk.join('\\n~~~\\n');
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

  createWindow();`;

if (mainContent.includes(targetMain)) {
    mainContent = mainContent.replace(targetMain, replacementMain);
    fs.writeFileSync(mainJsPath, mainContent, 'utf8');
    console.log("Updated main.js");
} else {
    console.log("Could not find app.whenReady in main.js");
}

// 2. preload.js
const preloadPath = 'c:/Users/Admin/Documents/application/treeExplorer-main/preload.js';
let preloadContent = fs.readFileSync(preloadPath, 'utf8');

const targetPreload = `contextBridge.exposeInMainWorld('electronAPI', {`;
const replacementPreload = `contextBridge.exposeInMainWorld('electronAPI', {
  translateBatch: (texts, targetLang) => ipcRenderer.invoke('translate-batch', texts, targetLang),`;

if (preloadContent.includes(targetPreload)) {
    if (!preloadContent.includes('translateBatch:')) {
        preloadContent = preloadContent.replace(targetPreload, replacementPreload);
        fs.writeFileSync(preloadPath, preloadContent, 'utf8');
        console.log("Updated preload.js");
    } else {
        console.log("preload.js already updated");
    }
}

// 3. ui.js applyLanguage
const uiJsPath = 'c:/Users/Admin/Documents/application/treeExplorer-main/src/ui.js';
let uiContent = fs.readFileSync(uiJsPath, 'utf8');

const targetUI = `  applyLanguage(lang) {
    localStorage.setItem('app-language', lang);
    this.updateLangModalIndicator();

    if (typeof window.triggerGoogleTranslate === 'function') {
      window.triggerGoogleTranslate(lang);
    }`;

const replacementUI = `  async applyLanguage(lang) {
    localStorage.setItem('app-language', lang);
    this.updateLangModalIndicator();

    if (lang === 'ar') {
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
      let node;
      const textNodes = [];
      const texts = [];
      while (node = walk.nextNode()) {
        const text = node.nodeValue.trim();
        if (text && /[A-Za-z]/.test(text)) {
          // ignore font-awesome or icons
          if (node.parentElement && ['SCRIPT', 'STYLE', 'CODE'].includes(node.parentElement.tagName)) continue;
          textNodes.push(node);
          texts.push(node.nodeValue);
        }
      }
      
      if (texts.length > 0 && window.electronAPI && window.electronAPI.translateBatch) {
        try {
          const trans = await window.electronAPI.translateBatch(texts, 'ar');
          if (trans && trans.length === textNodes.length) {
            for (let i = 0; i < textNodes.length; i++) {
              textNodes[i].nodeValue = trans[i];
            }
          }
        } catch(err) {
           console.error("Batch translation failed:", err);
        }
      }
    } else if (lang === 'en') {
      // Refresh to restore original English text
      if (document.body.innerText.match(/[\\u0600-\\u06FF]/)) {
        window.location.reload();
      }
    }`;

if (uiContent.includes(targetUI)) {
    uiContent = uiContent.replace(targetUI, replacementUI);
    fs.writeFileSync(uiJsPath, uiContent, 'utf8');
    console.log("Updated applyLanguage in ui.js");
} else {
    console.log("Could not find applyLanguage target in ui.js");
}
