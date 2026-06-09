const fs = require('fs');
const uiJsPath = 'c:/Users/Admin/Documents/application/treeExplorer-main/src/ui.js';
let content = fs.readFileSync(uiJsPath, 'utf8');

const targetStr = `this._translateNodes(document.body, dict, 'ar-to-en');\r
    }\r
    this.updateLangModalIndicator();`;

const replacementStr = `this._translateNodes(document.body, dict, 'ar-to-en');\r
    }\r
    this.updateLangModalIndicator();\r
\r
    if (typeof window.triggerGoogleTranslate === 'function') {\r
      window.triggerGoogleTranslate(lang);\r
    }\r
    document.documentElement.dir = (lang === 'ar') ? 'rtl' : 'ltr';`;

if (content.includes(targetStr)) {
    content = content.replace(targetStr, replacementStr);
    fs.writeFileSync(uiJsPath, content, 'utf8');
    console.log("Updated applyLanguage successfully!");
} else {
    // Try \n instead of \r\n
    const targetStr2 = `this._translateNodes(document.body, dict, 'ar-to-en');\n    }\n    this.updateLangModalIndicator();`;
    const replacementStr2 = `this._translateNodes(document.body, dict, 'ar-to-en');\n    }\n    this.updateLangModalIndicator();\n\n    if (typeof window.triggerGoogleTranslate === 'function') {\n      window.triggerGoogleTranslate(lang);\n    }\n    document.documentElement.dir = (lang === 'ar') ? 'rtl' : 'ltr';`;
    
    if (content.includes(targetStr2)) {
        content = content.replace(targetStr2, replacementStr2);
        fs.writeFileSync(uiJsPath, content, 'utf8');
        console.log("Updated applyLanguage successfully with \\n!");
    } else {
        console.log("Could not find applyLanguage target string.");
    }
}
