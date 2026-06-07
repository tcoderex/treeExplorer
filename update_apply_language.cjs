const fs = require('fs');
const uiJsPath = 'c:/Users/Admin/Documents/application/treeExplorer-main/src/ui.js';
let content = fs.readFileSync(uiJsPath, 'utf8');

content = content.replace(
  "this.updateLangModalIndicator();",
  "this.updateLangModalIndicator();\n    if (typeof triggerGoogleTranslate === 'function') {\n      triggerGoogleTranslate(lang);\n    }\n    document.documentElement.dir = (lang === 'ar') ? 'rtl' : 'ltr';"
);

fs.writeFileSync(uiJsPath, content, 'utf8');
console.log("Updated applyLanguage successfully via node script.");
