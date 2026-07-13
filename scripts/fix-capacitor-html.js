import fs from 'fs';
import path from 'path';

const indexPath = path.join(process.cwd(), 'dist', 'index.html');
const swPath = path.join(process.cwd(), 'dist', 'sw.js');
const packagePath = path.join(process.cwd(), 'package.json');

// Lê a versão do package.json
let version = '0.0.0';
try {
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
  version = pkg.version || version;
} catch (e) {
  console.warn('[post-build] Could not read package.json version');
}

// Fix crossorigin em index.html (para Capacitor)
if (fs.existsSync(indexPath)) {
  let html = fs.readFileSync(indexPath, 'utf-8');
  html = html.replace(/<script type="module" crossorigin src="\.\//g, '<script type="module" src="./');
  html = html.replace(/<link rel="stylesheet" crossorigin href="\.\//g, '<link rel="stylesheet" href="./');
  fs.writeFileSync(indexPath, html, 'utf-8');
  console.log('[post-build] Removed crossorigin from local assets in dist/index.html');
} else {
  console.log('[post-build] dist/index.html not found, skipping html fix');
}

// Injeta a versão no service worker (invalida cache a cada release)
if (fs.existsSync(swPath)) {
  let sw = fs.readFileSync(swPath, 'utf-8');
  const original = sw;
  sw = sw.replace(/__APP_VERSION__/g, version);
  if (sw !== original) {
    fs.writeFileSync(swPath, sw, 'utf-8');
    console.log(`[post-build] Injected version ${version} into dist/sw.js (cache name: caule-${version})`);
  } else {
    console.log('[post-build] No __APP_VERSION__ placeholder found in dist/sw.js');
  }
} else {
  console.log('[post-build] dist/sw.js not found, skipping sw version injection');
}
