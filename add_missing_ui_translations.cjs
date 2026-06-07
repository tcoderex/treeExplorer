const fs = require('fs');

const uiJsPath = 'c:/Users/Admin/Documents/application/treeExplorer-main/src/ui.js';
let content = fs.readFileSync(uiJsPath, 'utf8');

const newTranslations = `
      'Add / Import Core': 'إضافة / استيراد الأساسية',
      'Add single nodes, paste raw text lineages, or trigger the 1000+ mock database engine.': 'إضافة عقد فردية، لصق سلاسل نسب نصية، أو تشغيل محرك قاعدة البيانات الوهمية 1000+.',
      '＋ Add Individual': '＋ إضافة فرد',
      'Manually add an individual node into the engine.': 'إضافة عقدة فردية يدوياً إلى المحرك.',
      'First Name': 'الاسم الأول',
      'Family Name': 'اسم العائلة',
      'ID': 'المعرف',
      '(Optional)': '(اختياري)',
      'Auto-generated if empty': 'يتم إنشاؤه تلقائياً إذا كان فارغاً',
      'Gender': 'الجنس',
      'Spouse Details': 'تفاصيل الزوج/الزوجة',
      '+ Add another Spouse': '+ إضافة زوج/زوجة آخر',
      'Sibling Details': 'تفاصيل الأخ/الأخت',
      '+ Add another Sibling': '+ إضافة أخ/أخت آخر',
      'Birth Year': 'سنة الميلاد',
      'Death Year': 'سنة الوفاة',
      'Photo': 'الصورة',
      'Provide a URL or upload a local image to display an avatar on the lineage graph.': 'قدم رابطًا أو قم بتحميل صورة محلية لعرض صورة رمزية على مخطط النسب.',
      "Father's First": "الاسم الأول للأب",
      "(Opt)": "(اختياري)",
      "Father's Last": "اسم عائلة الأب",
      "Mother's First": "الاسم الأول للأم",
      "Mother's Maiden": "اسم عائلة الأم (قبل الزواج)",
      "If the father exists, we will link them; if not, the engine creates them.": "إذا كان الأب موجودًا، سنقوم بربطه؛ وإذا لم يكن كذلك، سيقوم المحرك بإنشائه.",
      "If the mother exists, we will link them; if not, the engine creates them.": "إذا كانت الأم موجودة، سنقوم بربطها؛ وإذا لم تكن كذلك، سيقوم المحرك بإنشائها.",
      "Grandfather's First": "الاسم الأول للجد",
      "Grandfather's Last": "اسم عائلة الجد",
      "Links father to grandfather automatically to maintain structure.": "يربط الأب بالجد تلقائيًا للحفاظ على الهيكل.",
      "Clear Fields": "مسح الحقول",
      "Save Member": "حفظ العضو",
      "📖 Smart Lineage Text Parser": "📖 محلل نص النسب الذكي",
      "Paste lists of lineages. One line per person. The engine parses relations.": "لصق قوائم الأنساب. سطر واحد لكل شخص. يقوم المحرك بتحليل العلاقات.",
      "🚀 Run Parser Tour": "🚀 بدء جولة المحلل",
`;

if (!content.includes("'Add / Import Core':")) {
  content = content.replace(/get i18nDictionary\(\) {\s*return {/, "get i18nDictionary() {\\n    return {" + newTranslations);
}

fs.writeFileSync(uiJsPath, content, 'utf8');
console.log("Updated ui.js with UI translations");
