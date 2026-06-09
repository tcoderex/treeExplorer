const fs = require('fs');

const uiJsPath = 'c:/Users/Admin/Documents/application/treeExplorer-main/src/ui.js';
let content = fs.readFileSync(uiJsPath, 'utf8');

// Find all mojibake in the dictionary values and convert them
// In this file, they are in the format 'Key': 'Mojibake'
// But some might have escaped quotes.
// Instead of regex, let's just do a blanket conversion of the whole file,
// but wait, is it safe to convert the whole file? Let's check if the file is completely valid utf8 but containing mojibake.
// Actually, `Buffer.from(content, 'latin1').toString('utf8')` might corrupt other normal strings if they contain non-ascii characters that are ALREADY valid UTF8!
// Let's only target the i18nDictionary.

const regex = /'([^']+)': '([^']+)'/g;

content = content.replace(regex, (match, key, value) => {
    // If value contains Ø or Ù, it's likely mojibake.
    if (value.includes('Ø') || value.includes('Ù')) {
        const decoded = Buffer.from(value, 'latin1').toString('utf8');
        return `'${key}': '${decoded}'`;
    }
    return match;
});

fs.writeFileSync(uiJsPath, content, 'utf8');
console.log("Converted src/ui.js");
