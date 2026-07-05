import fs from 'fs';
import path from 'path';

const indexPath = path.join(process.cwd(), 'dist', 'index.html');

if (!fs.existsSync(indexPath)) {
  console.log('dist/index.html not found, skipping fix');
  process.exit(0);
}

let html = fs.readFileSync(indexPath, 'utf-8');

// Remove crossorigin attribute from script and link tags (local assets only)
html = html.replace(/<script type="module" crossorigin src="\.\//g, '<script type="module" src="./');
html = html.replace(/<link rel="stylesheet" crossorigin href="\.\//g, '<link rel="stylesheet" href="./');

fs.writeFileSync(indexPath, html, 'utf-8');
console.log('[fix-capacitor-html] Removed crossorigin from local assets in dist/index.html');
