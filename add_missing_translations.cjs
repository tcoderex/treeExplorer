const fs = require('fs');

const uiJsPath = 'c:/Users/Admin/Documents/application/treeExplorer-main/src/ui.js';
let content = fs.readFileSync(uiJsPath, 'utf8');

// 1. Add missing translations to i18nDictionary
const newTranslations = `
      'Tree Explorer': 'مستكشف الشجرة',
      'World Forest': 'غابة العالم',
      'All Members': 'جميع الأعضاء',
      'Add / Import': 'إضافة / استيراد',
      'My Family Tree': 'شجرة عائلتي',
      '0 Members Loaded': 'تم تحميل 0 عضو',
      '🌐 Languages': '🌐 اللغات',
      'Workspace theme changed to Light Mode.': 'تم تغيير سمة مساحة العمل إلى الوضع الفاتح.',
      'Workspace theme changed to Dark Mode.': 'تم تغيير سمة مساحة العمل إلى الوضع الداكن.',
`;

if (!content.includes("'Tree Explorer':")) {
  content = content.replace(/get i18nDictionary\(\) {\s*return {/, `get i18nDictionary() {\n    return {${newTranslations}`);
}

// 2. Fix dynamic "Members Loaded"
const dynamicLoadedOriginal = "document.getElementById('sidebar-status-text').innerText = `${totalCount.toLocaleString()} Members Loaded`;";
const dynamicLoadedReplacement = `    const lang = localStorage.getItem('app-language') || 'en';
    const loadedText = lang === 'ar' ? 'عضو محمل' : 'Members Loaded';
    document.getElementById('sidebar-status-text').innerText = \`\${totalCount.toLocaleString()} \${loadedText}\`;`;

if (content.includes(dynamicLoadedOriginal)) {
  content = content.replace(dynamicLoadedOriginal, dynamicLoadedReplacement);
}

fs.writeFileSync(uiJsPath, content, 'utf8');
console.log("Updated ui.js with missing translations");
