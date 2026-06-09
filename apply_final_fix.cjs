const fs = require('fs');

// 1. Fix ui.js applyLanguage
const uiJsPath = 'c:/Users/Admin/Documents/application/treeExplorer-main/src/ui.js';
let uiContent = fs.readFileSync(uiJsPath, 'utf8');

const targetStrUI = `  applyLanguage(lang) {
    localStorage.setItem('app-language', lang);
    const dict = this.i18nDictionary;
    if (lang === 'ar') {
      this._translateNodes(document.body, dict, 'en-to-ar');
    } else {
      this._translateNodes(document.body, dict, 'ar-to-en');
    }
    this.updateLangModalIndicator();`;

const replacementStrUI = `  applyLanguage(lang) {
    localStorage.setItem('app-language', lang);
    this.updateLangModalIndicator();
    
    // Trigger Google Translate without internal overrides
    if (typeof window.triggerGoogleTranslate === 'function') {
      window.triggerGoogleTranslate(lang);
    }
    // (Removed direction changes as requested)`;

if (uiContent.includes(targetStrUI)) {
    uiContent = uiContent.replace(targetStrUI, replacementStrUI);
    fs.writeFileSync(uiJsPath, uiContent, 'utf8');
    console.log("Updated applyLanguage in ui.js");
} else {
    console.log("Could not find applyLanguage target string in ui.js");
}

// 2. Fix index.html triggerGoogleTranslate
const indexPath = 'c:/Users/Admin/Documents/application/treeExplorer-main/index.html';
let indexContent = fs.readFileSync(indexPath, 'utf8');

const targetStrIndex = `          selectEl.dispatchEvent(new Event('change'));`;
const replacementStrIndex = `          selectEl.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));`;

if (indexContent.includes(targetStrIndex)) {
    indexContent = indexContent.replace(targetStrIndex, replacementStrIndex);
    fs.writeFileSync(indexPath, indexContent, 'utf8');
    console.log("Updated trigger in index.html");
} else {
    console.log("Could not find trigger in index.html");
}
