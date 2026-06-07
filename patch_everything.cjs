const fs = require('fs');
const path = require('path');

const basePath = 'c:/Users/Admin/Documents/application/treeExplorer-main';

// 1. main.js - hide frame and add window control IPCs
let mainJsPath = path.join(basePath, 'main.js');
let mainContent = fs.readFileSync(mainJsPath, 'utf8');

if (!mainContent.includes('frame: false')) {
  mainContent = mainContent.replace(/title: "The Arabic Area",\s*backgroundColor: '#f3f3f3',/g, 
  `title: "The Arabic Area",
    backgroundColor: '#f3f3f3',
    frame: false,`);
}

if (!mainContent.includes("ipcMain.on('window-close'")) {
  const targetAppReady = `  app.whenReady().then(() => {`;
  const replacementAppReady = `  app.whenReady().then(() => {
    ipcMain.on('window-close', () => { if(mainWindow) mainWindow.close(); });
    ipcMain.on('window-minimize', () => { if(mainWindow) mainWindow.minimize(); });
    ipcMain.on('window-maximize', () => { 
      if(mainWindow) {
        if(mainWindow.isMaximized()) mainWindow.unmaximize();
        else mainWindow.maximize();
      }
    });`;
  mainContent = mainContent.replace(targetAppReady, replacementAppReady);
}
fs.writeFileSync(mainJsPath, mainContent, 'utf8');
console.log("Patched main.js");

// 2. preload.js - add window controls
let preloadPath = path.join(basePath, 'preload.js');
let preloadContent = fs.readFileSync(preloadPath, 'utf8');

if (!preloadContent.includes('windowClose')) {
  const targetPreload = `translateBatch: (texts, targetLang) => ipcRenderer.invoke('translate-batch', texts, targetLang),`;
  const replacementPreload = `translateBatch: (texts, targetLang) => ipcRenderer.invoke('translate-batch', texts, targetLang),
  windowClose: () => ipcRenderer.send('window-close'),
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),`;
  preloadContent = preloadContent.replace(targetPreload, replacementPreload);
  fs.writeFileSync(preloadPath, preloadContent, 'utf8');
  console.log("Patched preload.js");
}

// 3. index.html - wire custom title bar
let indexPath = path.join(basePath, 'index.html');
let indexContent = fs.readFileSync(indexPath, 'utf8');

if (!indexContent.includes('window.api.windowClose')) {
  const targetScript = `<script type="module" src="/src/index.js"></script>`;
  const replacementScript = `<script>
    document.addEventListener('DOMContentLoaded', () => {
      const closeBtn = document.querySelector('.titlebar-btn.close');
      const minBtn = document.querySelector('.titlebar-btn.minimize');
      const maxBtn = document.querySelector('.titlebar-btn.maximize');
      
      if(closeBtn && window.api) closeBtn.addEventListener('click', () => window.api.windowClose());
      if(minBtn && window.api) minBtn.addEventListener('click', () => window.api.windowMinimize());
      if(maxBtn && window.api) maxBtn.addEventListener('click', () => window.api.windowMaximize());
    });
  </script>
  <script type="module" src="/src/index.js"></script>`;
  indexContent = indexContent.replace(targetScript, replacementScript);
  fs.writeFileSync(indexPath, indexContent, 'utf8');
  console.log("Patched index.html");
}

// 4. splash.html - translation
let splashPath = path.join(basePath, 'splash.html');
let splashContent = fs.readFileSync(splashPath, 'utf8');

if (!splashContent.includes('app-language')) {
  const targetSplashTheme = `document.documentElement.classList.add('theme-dark');
    }`;
  const replacementSplashTheme = `document.documentElement.classList.add('theme-dark');
    }
    window.addEventListener('DOMContentLoaded', () => {
      const lang = localStorage.getItem('app-language');
      const cache = JSON.parse(localStorage.getItem('ar-translation-cache') || '{}');
      if (lang === 'ar') {
        document.querySelector('.app-title').innerText = 'المنطقة العربية';
        const subtitle = document.querySelector('.app-subtitle');
        if (Object.keys(cache).length < 50) {
            subtitle.innerText = 'إعداد لأول مرة: جاري تنزيل الترجمة العربية... يرجى الانتظار (قد يستغرق بعض الوقت)';
        } else {
            subtitle.innerText = 'جاري تحميل التطبيق... يرجى الانتظار قليلاً';
        }
        subtitle.style.fontSize = '15px';
        subtitle.style.fontWeight = 'bold';
      }
    });`;
  splashContent = splashContent.replace(targetSplashTheme, replacementSplashTheme);
  fs.writeFileSync(splashPath, splashContent, 'utf8');
  console.log("Patched splash.html");
}

// 5. ui.js - MutationObserver for dynamic content
let uiJsPath = path.join(basePath, 'src/ui.js');
let uiContent = fs.readFileSync(uiJsPath, 'utf8');

if (!uiContent.includes('MutationObserver')) {
  const targetObserver = `async applyLanguage(lang) {
    localStorage.setItem('app-language', lang);`;
    
  const replacementObserver = `
  _setupDynamicTranslation() {
    if (this._langObserver) this._langObserver.disconnect();
    this._langObserver = new MutationObserver(async (mutations) => {
      if (localStorage.getItem('app-language') !== 'ar') return;
      
      const newTexts = [];
      const nodes = [];
      const elementsWithAttrs = [];
      
      mutations.forEach(m => {
        if (m.type === 'childList') {
          m.addedNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
               nodes.push(node);
            } else if (node.nodeType === Node.ELEMENT_NODE) {
               const walk = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null, false);
               let n;
               while (n = walk.nextNode()) nodes.push(n);
               
               if (node.hasAttribute && (node.hasAttribute('placeholder') || node.hasAttribute('title'))) {
                   elementsWithAttrs.push(node);
               }
               const attrEls = node.querySelectorAll ? Array.from(node.querySelectorAll('[placeholder], [title]')) : [];
               elementsWithAttrs.push(...attrEls);
            }
          });
        }
      });
      
      const cache = JSON.parse(localStorage.getItem('ar-translation-cache') || '{}');
      const toTranslate = [];
      const translateTargets = [];
      
      nodes.forEach(node => {
        const text = node.nodeValue.trim();
        if (text && /[A-Za-z]/.test(text)) {
           if (node.parentElement && ['SCRIPT', 'STYLE', 'CODE'].includes(node.parentElement.tagName)) return;
           if (cache[text]) {
             node.nodeValue = node.nodeValue.replace(text, cache[text]);
           } else {
             toTranslate.push(text);
             translateTargets.push({ type: 'text', ref: node, trimmed: text, orig: node.nodeValue });
           }
        }
      });
      
      elementsWithAttrs.forEach(el => {
        if (el.placeholder && /[A-Za-z]/.test(el.placeholder)) {
          if (cache[el.placeholder]) el.placeholder = cache[el.placeholder];
          else {
            toTranslate.push(el.placeholder);
            translateTargets.push({ type: 'placeholder', ref: el, trimmed: el.placeholder });
          }
        }
        if (el.title && /[A-Za-z]/.test(el.title)) {
          if (cache[el.title]) el.title = cache[el.title];
          else {
            toTranslate.push(el.title);
            translateTargets.push({ type: 'title', ref: el, trimmed: el.title });
          }
        }
      });
      
      if (toTranslate.length > 0 && window.api && window.api.translateBatch) {
        try {
          const trans = await window.api.translateBatch(toTranslate, 'ar');
          if (trans && trans.length === toTranslate.length) {
            for (let i = 0; i < toTranslate.length; i++) {
              const item = translateTargets[i];
              const translated = trans[i];
              cache[item.trimmed] = translated;
              
              if (item.type === 'text') item.ref.nodeValue = item.orig.replace(item.trimmed, translated);
              else if (item.type === 'placeholder') item.ref.placeholder = translated;
              else if (item.type === 'title') item.ref.title = translated;
            }
            localStorage.setItem('ar-translation-cache', JSON.stringify(cache));
          }
        } catch(e) {}
      }
    });
    
    this._langObserver.observe(document.body, { childList: true, subtree: true });
  }

  async applyLanguage(lang) {
    if(!this._langObserverInit) {
       this._setupDynamicTranslation();
       this._langObserverInit = true;
    }
    localStorage.setItem('app-language', lang);`;
    
  uiContent = uiContent.replace(targetObserver, replacementObserver);
  fs.writeFileSync(uiJsPath, uiContent, 'utf8');
  console.log("Patched ui.js with MutationObserver");
}
