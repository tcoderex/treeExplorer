const fs = require('fs');

const uiJsPath = 'c:/Users/Admin/Documents/application/treeExplorer-main/src/ui.js';
let content = fs.readFileSync(uiJsPath, 'utf8');

// The mojibake is: Ã°Å¸â€”â€˜Ã¯Â¸Â
content = content.replace(/Ã°Å¸â€”â€˜Ã¯Â¸Â/g, '🗑️');

fs.writeFileSync(uiJsPath, content, 'utf8');
console.log('Fixed button emoji mojibake in ui.js');
