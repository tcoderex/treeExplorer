const fs = require('fs');
const uiJsPath = 'c:/Users/Admin/Documents/application/treeExplorer-main/src/ui.js';
let content = fs.readFileSync(uiJsPath, 'utf8');

// Revert the wrong replacement
content = content.replace(
  "this.updateLangModalIndicator();\n    if (typeof triggerGoogleTranslate === 'function') {\n      triggerGoogleTranslate(lang);\n    }\n    document.documentElement.dir = (lang === 'ar') ? 'rtl' : 'ltr';",
  "this.updateLangModalIndicator();"
);

// Inject correctly into applyLanguage
const targetStr = `  applyLanguage(lang) {
    localStorage.setItem('app-language', lang);
    const dict = this.i18nDictionary;
    if (lang === 'ar') {
      this._translateNodes(document.body, dict, 'en-to-ar');
    } else {
      this._translateNodes(document.body, dict, 'ar-to-en');
    }
    this.updateLangModalIndicator();`;

const replacementStr = `  applyLanguage(lang) {
    localStorage.setItem('app-language', lang);
    
    // Trigger Google Translate
    if (typeof triggerGoogleTranslate === 'function') {
      triggerGoogleTranslate(lang);
    }
    
    const dict = this.i18nDictionary;
    if (lang === 'ar') {
      this._translateNodes(document.body, dict, 'en-to-ar');
    } else {
      this._translateNodes(document.body, dict, 'ar-to-en');
    }
    this.updateLangModalIndicator();`;

if (content.includes(targetStr)) {
    content = content.replace(targetStr, replacementStr);
    fs.writeFileSync(uiJsPath, content, 'utf8');
    console.log("Updated applyLanguage successfully!");
} else {
    console.log("Could not find applyLanguage target string.");
}
