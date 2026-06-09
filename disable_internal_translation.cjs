const fs = require('fs');
const uiJsPath = 'c:/Users/Admin/Documents/application/treeExplorer-main/src/ui.js';
let content = fs.readFileSync(uiJsPath, 'utf8');

const targetStr = `    const dict = this.i18nDictionary;
    if (lang === 'ar') {
      this._translateNodes(document.body, dict, 'en-to-ar');
    } else {
      this._translateNodes(document.body, dict, 'ar-to-en');
    }`;

if (content.includes(targetStr)) {
    content = content.replace(targetStr, `    // Disabled internal translation in favor of Google Translate`);
    fs.writeFileSync(uiJsPath, content, 'utf8');
    console.log("Removed _translateNodes calls successfully!");
} else {
    console.log("Could not find _translateNodes calls.");
}
