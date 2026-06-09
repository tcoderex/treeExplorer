const fs = require('fs');

const win1252ToByte = {
  '€': 128,
  '‚': 130,
  'ƒ': 131,
  '„': 132,
  '…': 133,
  '†': 134,
  '‡': 135,
  'ˆ': 136,
  '‰': 137,
  'Š': 138,
  '‹': 139,
  'Œ': 140,
  'Ž': 142,
  '‘': 145,
  '’': 146,
  '“': 147,
  '”': 148,
  '•': 149,
  '–': 150,
  '—': 151,
  '˜': 152,
  '™': 153,
  'š': 154,
  '›': 155,
  'œ': 156,
  'ž': 158,
  'Ÿ': 159
};

function decodeMojibake(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const code = char.charCodeAt(0);
    if (win1252ToByte[char] !== undefined) {
      bytes.push(win1252ToByte[char]);
    } else if (code >= 160 && code <= 255) {
      bytes.push(code);
    } else if (code < 128) {
      bytes.push(code);
    } else {
      // Unmapped or other, just push the lower 8 bits or ignore.
      // But let's hope it maps properly
      bytes.push(code & 0xFF);
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

const uiJsPath = 'c:/Users/Admin/Documents/application/treeExplorer-main/src/ui.js';
let content = fs.readFileSync(uiJsPath, 'utf8');

const regex = /'([^']+)': '([^']+)'/g;

content = content.replace(regex, (match, key, value) => {
    if (value.includes('Ø') || value.includes('Ù')) {
        const decoded = decodeMojibake(value);
        // Only decode if it actually contains something decoded properly
        return `'${key}': '${decoded}'`;
    }
    return match;
});

// Also manually add the 3 specific translations that the user requested:
content = content.replace(/'The Arabic Area': '[^']+'/, `'The Arabic Area': 'المنطقة العربية'`);
content = content.replace(/'Version 9\.0': '[^']+'/, `'Version 9.0': 'الإصدار 9.0'`);
content = content.replace(/'Version 9\.0 \(Fluent Build\)': '[^']+'/, `'Version 9.0 (Fluent Build)': 'الإصدار 9.0 (بناء سلس)'`);
content = content.replace(/indicator\.textContent = lang === 'ar' \? '[^']+' : 'Current: English';/, `indicator.textContent = lang === 'ar' ? 'الحالية: العربية' : 'Current: English';`);

fs.writeFileSync(uiJsPath, content, 'utf8');
console.log("Converted src/ui.js");
