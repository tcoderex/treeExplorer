const fs = require('fs');
const uiJsPath = 'c:/Users/Admin/Documents/application/treeExplorer-main/src/ui.js';
let content = fs.readFileSync(uiJsPath, 'utf8');

const targetRegex = /if \(lang === 'ar'\) \{\s*this\._translateNodes\(document\.body, dict, 'en-to-ar'\);\s*\} else \{\s*this\._translateNodes\(document\.body, dict, 'ar-to-en'\);\s*\}/;

content = content.replace(targetRegex, `// Disabled internal manual dictionary translation to allow Google Translate to take full control`);

fs.writeFileSync(uiJsPath, content, 'utf8');
console.log("Disabled _translateNodes correctly!");
