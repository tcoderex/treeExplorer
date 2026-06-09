const path = require('path');
const Jimp = require('jimp');

const iconPath = path.join(__dirname, 'build', 'icon.png');
const sidebarPath = path.join(__dirname, 'build', 'installerSidebar.bmp');
const headerPath = path.join(__dirname, 'build', 'installerHeader.bmp');

async function createImages() {
  try {
    const icon = await Jimp.read(iconPath);
    
    // Sidebar: 164x314
    const sidebar = icon.clone();
    sidebar.cover(164, 314);
    await sidebar.writeAsync(sidebarPath);
    console.log('Created installerSidebar.bmp (164x314)');

    // Header: 150x57
    const header = icon.clone();
    header.cover(150, 57);
    await header.writeAsync(headerPath);
    console.log('Created installerHeader.bmp (150x57)');
  } catch (err) {
    console.error('Error generating images:', err);
    process.exit(1);
  }
}

createImages();
