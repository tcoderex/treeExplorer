const asar = require('./node_modules/@electron/asar');
const path = require('path');
const fs = require('fs');

const tempDir = path.join(__dirname, 'temp-asar');
const distDest = path.join(tempDir, 'dist');
const asarDest1 = path.join(__dirname, 'dist-electron', 'Windows Family Tree Explorer-win32-x64', 'resources', 'app.asar');
const asarDest2 = path.join(__dirname, 'dist-electron', 'win-unpacked', 'resources', 'app.asar');

// Helper to recursively copy directories
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  let entries = fs.readdirSync(src, { withFileTypes: true });

  for (let entry of entries) {
    let srcPath = path.join(src, entry.name);
    let destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function pack() {
  try {
    console.log('Preparing temporary ASAR structure...');
    // Clear temp dir if exists
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });

    // Copy package.json and main.js to root of temp-asar
    fs.copyFileSync(path.join(__dirname, 'package.json'), path.join(tempDir, 'package.json'));
    fs.copyFileSync(path.join(__dirname, 'main.js'), path.join(tempDir, 'main.js'));

    // Copy dist folder to temp-asar/dist
    copyDirSync(path.join(__dirname, 'dist'), distDest);

    // Package to asarDest1
    if (fs.existsSync(path.dirname(asarDest1))) {
      await asar.createPackage(tempDir, asarDest1);
      console.log('asar packaged successfully -> ' + asarDest1);
    }

    // Package to asarDest2
    if (fs.existsSync(path.dirname(asarDest2))) {
      await asar.createPackage(tempDir, asarDest2);
      console.log('asar packaged successfully -> ' + asarDest2);
    }

    // Clean up temp dir
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log('Cleaned up temporary ASAR folder.');
  } catch (e) {
    console.error('asar error:', e.message);
  }
}

pack();
