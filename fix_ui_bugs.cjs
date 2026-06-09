const fs = require('fs');

const uiJsPath = 'c:/Users/Admin/Documents/application/treeExplorer-main/src/ui.js';
let content = fs.readFileSync(uiJsPath, 'utf8');

// 1. Fix encodings
const encodingFixes = {
    'Ã¢â€žÂ¹Ã¯Â¸Â ': 'ℹ️',
    'Ã¢Å“â€œ': '✅',
    'Ã¢Å¡Â Ã¯Â¸Â ': '⚠️',
    'Ã¢Å¡Â¡': '⚡',
    'Ã¢Å“Â¨': '✨',
    'Ã˜ÂªÃ™â€¦ Ã˜ÂªÃ˜ÂºÃ™Å Ã™Å Ã˜Â± Ã˜Â§Ã™â€žÃ™â€žÃ˜ÂºÃ˜Â© Ã˜Â¥Ã™â€žÃ™â€° Ã˜Â§Ã™â€žÃ˜Â¹Ã˜Â±Ã˜Â¨Ã™Å Ã˜Â©.': 'تم تغيير اللغة إلى العربية.',
    'Ã¢â€¡â€¦': '⇄',
    'Ã¢â€“Â²': '▲',
    'Ã¢â€“Â¼': '▼',
    'Ã¢Â Â³': '⏳',
    'Ã°Å¸â€”â€˜Ã¯Â¸Â ': '🗑️'
};

for (const [bad, good] of Object.entries(encodingFixes)) {
    content = content.split(bad).join(good);
}

// 2. Rewrite applyLanguage to include caching and attributes
const targetUI = `  async applyLanguage(lang) {
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
          if (node.parentElement && ['SCRIPT', 'STYLE', 'CODE'].includes(node.parentElement.tagName)) continue;
          textNodes.push(node);
          texts.push(node.nodeValue);
        }
      }
      
      if (texts.length > 0 && window.api && window.api.translateBatch) {
        try {
          // Disable UI during translation
          document.body.style.opacity = '0.7';
          document.body.style.pointerEvents = 'none';
          
          const trans = await window.api.translateBatch(texts, 'ar');
          if (trans && trans.length === textNodes.length) {
            for (let i = 0; i < textNodes.length; i++) {
              textNodes[i].nodeValue = trans[i];
            }
          }
        } catch(err) {
           console.error("Batch translation failed:", err);
        } finally {
          document.body.style.opacity = '1';
          document.body.style.pointerEvents = 'all';
        }
      }
    } else if (lang === 'en') {
      // Refresh to restore original English text
      if (document.body.innerText.match(/[\\u0600-\\u06FF]/)) {
        window.location.reload();
      }
    }
    const enCard = document.getElementById('lang-opt-en');`;

const replacementUI = `  async applyLanguage(lang) {
    localStorage.setItem('app-language', lang);
    this.updateLangModalIndicator();

    if (lang === 'ar') {
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
      let node;
      
      const elementsWithAttrs = Array.from(document.querySelectorAll('[placeholder], [title]'));
      
      const nodesToTranslate = [];
      const textsToTranslate = [];
      
      // Load Cache
      const cache = JSON.parse(localStorage.getItem('ar-translation-cache') || '{}');

      // 1. Collect Text Nodes
      while (node = walk.nextNode()) {
        const text = node.nodeValue.trim();
        if (text && /[A-Za-z]/.test(text)) {
          if (node.parentElement && ['SCRIPT', 'STYLE', 'CODE'].includes(node.parentElement.tagName)) continue;
          
          if (cache[text]) {
            node.nodeValue = node.nodeValue.replace(text, cache[text]);
          } else {
            nodesToTranslate.push({ type: 'text', ref: node, orig: node.nodeValue, trimmed: text });
            textsToTranslate.push(text);
          }
        }
      }
      
      // 2. Collect Attributes
      for (const el of elementsWithAttrs) {
        if (el.placeholder && /[A-Za-z]/.test(el.placeholder)) {
          if (cache[el.placeholder]) {
             el.placeholder = cache[el.placeholder];
          } else {
             nodesToTranslate.push({ type: 'placeholder', ref: el, orig: el.placeholder, trimmed: el.placeholder });
             textsToTranslate.push(el.placeholder);
          }
        }
        if (el.title && /[A-Za-z]/.test(el.title)) {
          if (cache[el.title]) {
             el.title = cache[el.title];
          } else {
             nodesToTranslate.push({ type: 'title', ref: el, orig: el.title, trimmed: el.title });
             textsToTranslate.push(el.title);
          }
        }
      }
      
      if (textsToTranslate.length > 0 && window.api && window.api.translateBatch) {
        try {
          document.body.style.opacity = '0.7';
          document.body.style.pointerEvents = 'none';
          
          const trans = await window.api.translateBatch(textsToTranslate, 'ar');
          if (trans && trans.length === textsToTranslate.length) {
            for (let i = 0; i < textsToTranslate.length; i++) {
              const item = nodesToTranslate[i];
              const translated = trans[i];
              
              // Save to cache
              cache[item.trimmed] = translated;
              
              // Apply translation
              if (item.type === 'text') {
                item.ref.nodeValue = item.orig.replace(item.trimmed, translated);
              } else if (item.type === 'placeholder') {
                item.ref.placeholder = translated;
              } else if (item.type === 'title') {
                item.ref.title = translated;
              }
            }
            // Save cache back to local storage
            localStorage.setItem('ar-translation-cache', JSON.stringify(cache));
          }
        } catch(err) {
           console.error("Batch translation failed:", err);
        } finally {
          document.body.style.opacity = '1';
          document.body.style.pointerEvents = 'all';
        }
      }
    } else if (lang === 'en') {
      if (document.body.innerText.match(/[\\u0600-\\u06FF]/)) {
        window.location.reload();
      }
    }
    const enCard = document.getElementById('lang-opt-en');`;

if (content.includes("  async applyLanguage(lang) {")) {
    // Only replace if target exists
    if (content.indexOf("const elementsWithAttrs") === -1) {
       content = content.replace(targetUI, replacementUI);
       console.log("Updated applyLanguage with caching and attributes.");
    } else {
       console.log("applyLanguage already has attributes/caching logic.");
    }
} else {
    console.log("Could not find applyLanguage block.");
}

fs.writeFileSync(uiJsPath, content, 'utf8');
console.log("ui.js fixed.");
