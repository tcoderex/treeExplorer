const { app, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(() => {
  const iconPath = path.join(__dirname, 'build', 'icon.png');
  const img = nativeImage.createFromPath(iconPath);

  // NSIS Sidebar 164x314
  // We'll resize to fill the height, then crop the center
  const sideImg = img.resize({ height: 314 });
  const cropX = Math.max(0, (sideImg.getSize().width - 164) / 2);
  const sidebarPng = sideImg.crop({ x: cropX, y: 0, width: 164, height: 314 }).toPNG();
  fs.writeFileSync(path.join(__dirname, 'build', 'installerSidebar.png'), sidebarPng);
  console.log('Created installerSidebar.png');

  // NSIS Header 150x57
  const headImg = img.resize({ width: 150 });
  const cropY = Math.max(0, (headImg.getSize().height - 57) / 2);
  const headerPng = headImg.crop({ x: 0, y: cropY, width: 150, height: 57 }).toPNG();
  fs.writeFileSync(path.join(__dirname, 'build', 'installerHeader.png'), headerPng);
  console.log('Created installerHeader.png');

  app.quit();
});
