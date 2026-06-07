import { translate } from 'google-translate-api-browser';

async function test() {
  try {
    const texts = ["First Name", "Last Name", "Birth Year", "Welcome to the App"];
    const combined = texts.join('\n~~~\n');
    const res = await translate(combined, { to: "ar" });
    const translatedArray = res.text.split(/~~~/).map(s => s.trim());
    console.log(translatedArray);
  } catch(e) {
    console.error(e);
  }
}
test();
