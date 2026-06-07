import { translate } from 'google-translate-api-browser';

async function test() {
  try {
    const res = await translate("Hello, this is a test.", { to: "ar" });
    console.log("Translation: ", res.text);
  } catch(e) {
    console.error("Error: ", e);
  }
}

test();
