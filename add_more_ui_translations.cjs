const fs = require('fs');

const uiJsPath = 'c:/Users/Admin/Documents/application/treeExplorer-main/src/ui.js';
let content = fs.readFileSync(uiJsPath, 'utf8');

const moreTranslations = `
      '⚡ High-Scale Testing Suite': '⚡ جناح اختبار النطاق العالي',
      'Push the Windows Family Tree Engine to its absolute limits.': 'دفع محرك شجرة عائلة ويندوز إلى أقصى حدوده المطلقة.',
      '🌳 Load 2,000+ Mock Tree': '🌳 تحميل 2000+ شجرة وهمية',
      '🚀 Load 100,000 Mock Tree': '🚀 تحميل 100,000 شجرة وهمية',
`;

if (!content.includes("'⚡ High-Scale Testing Suite':")) {
  content = content.replace(/get i18nDictionary\(\) {\s*return {/, "get i18nDictionary() {\\n    return {" + moreTranslations);
}

fs.writeFileSync(uiJsPath, content, 'utf8');
console.log("Updated ui.js with more translations");
