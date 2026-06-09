const fs = require('fs');
const path = require('path');
const asar = require('./node_modules/@electron/asar');

// Helper to copy directory recursively
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (let entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function run() {
  const rootDir = __dirname;
  const distElectronDir = path.join(rootDir, 'dist-electron');
  const winUnpackedDir = path.join(distElectronDir, 'win-unpacked');
  const targetAppDir = path.join(distElectronDir, 'Windows Family Tree Explorer-win32-x64');
  const tempPackDir = path.join(rootDir, 'temp-pack');

  console.log('Starting manual packaging...');

  // 1. Check if win-unpacked exists
  if (!fs.existsSync(winUnpackedDir)) {
    console.error('Error: win-unpacked directory not found in dist-electron! Cannot clone resources.');
    process.exit(1);
  }

  // 2. Recreate target app directory
  if (fs.existsSync(targetAppDir)) {
    console.log('Cleaning existing target directory...');
    fs.rmSync(targetAppDir, { recursive: true, force: true });
  }
  fs.mkdirSync(targetAppDir, { recursive: true });

  // 3. Copy all files from win-unpacked to target app directory (excluding resources/app.asar)
  console.log('Copying prebuilt Electron binaries...');
  const entries = fs.readdirSync(winUnpackedDir, { withFileTypes: true });
  for (let entry of entries) {
    const srcPath = path.join(winUnpackedDir, entry.name);
    const destPath = path.join(targetAppDir, entry.name);

    if (entry.name === 'resources') {
      // Handle resources directory specially to exclude old app.asar
      fs.mkdirSync(destPath, { recursive: true });
      const resEntries = fs.readdirSync(srcPath, { withFileTypes: true });
      for (let resEntry of resEntries) {
        if (resEntry.name !== 'app.asar') {
          const resSrcPath = path.join(srcPath, resEntry.name);
          const resDestPath = path.join(destPath, resEntry.name);
          if (resEntry.isDirectory()) {
            copyDirSync(resSrcPath, resDestPath);
          } else {
            fs.copyFileSync(resSrcPath, resDestPath);
          }
        }
      }
    } else {
      if (entry.isDirectory()) {
        copyDirSync(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  // 4. Create temp-pack directory for ASAR payload
  console.log('Structuring ASAR payload...');
  if (fs.existsSync(tempPackDir)) {
    fs.rmSync(tempPackDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempPackDir, { recursive: true });

  // Copy dist
  copyDirSync(path.join(rootDir, 'dist'), path.join(tempPackDir, 'dist'));
  // Copy main.js
  fs.copyFileSync(path.join(rootDir, 'main.js'), path.join(tempPackDir, 'main.js'));
  // Copy package.json
  fs.copyFileSync(path.join(rootDir, 'package.json'), path.join(tempPackDir, 'package.json'));

  // 5. Pack asar
  const asarDest = path.join(targetAppDir, 'resources', 'app.asar');
  console.log('Packaging app.asar to:', asarDest);
  
  await asar.createPackage(tempPackDir, asarDest);
  console.log('ASAR packaging complete.');

  // 6. Clean up temp-pack
  console.log('Cleaning up temporary files...');
  fs.rmSync(tempPackDir, { recursive: true, force: true });

  console.log('Manual build complete! Executable is ready at:');
  console.log(path.join(targetAppDir, 'Windows Family Tree Explorer.exe'));
}

run().catch(err => {
  console.error('Build script failed:', err);
  process.exit(1);
});
