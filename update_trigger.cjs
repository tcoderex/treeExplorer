const fs = require('fs');
const indexPath = 'c:/Users/Admin/Documents/application/treeExplorer-main/index.html';
let content = fs.readFileSync(indexPath, 'utf8');

const targetStr = `    function triggerGoogleTranslate(langCode) {
      const selectEl = document.querySelector('.goog-te-combo');
      if (selectEl) {
        selectEl.value = langCode;
        selectEl.dispatchEvent(new Event('change'));
      }
    }`;

const replacementStr = `    function triggerGoogleTranslate(langCode) {
      const tryTrigger = () => {
        const selectEl = document.querySelector('.goog-te-combo');
        if (selectEl) {
          selectEl.value = langCode;
          selectEl.dispatchEvent(new Event('change'));
        } else {
          setTimeout(tryTrigger, 100);
        }
      };
      tryTrigger();
    }`;

if (content.includes(targetStr)) {
    content = content.replace(targetStr, replacementStr);
    fs.writeFileSync(indexPath, content, 'utf8');
    console.log("Updated index.html Google Translate trigger successfully!");
} else {
    console.log("Could not find triggerGoogleTranslate in index.html.");
}
