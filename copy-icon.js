import fs from 'fs';
import path from 'path';

const src = './src/assets/images/spk_logo_1782518538609.jpg';
const destDir = './public';
const dest = './public/icon.jpg';
const destNew = './public/app-logo.jpg';

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

if (fs.existsSync(src)) {
  fs.copyFileSync(src, dest);
  fs.copyFileSync(src, destNew);
  console.log('Icon successfully copied to public directory!');
} else {
  console.error('Source icon file not found at:', src);
}
