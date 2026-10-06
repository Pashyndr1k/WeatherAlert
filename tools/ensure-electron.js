// Make sure the Electron binary is present before starting from source.
// `npm install` downloads it in electron's postinstall step; that step is skipped when npm runs with
// ignore-scripts, when ELECTRON_SKIP_BINARY_DOWNLOAD is set, or when the download fails behind a proxy —
// the symptom is "Electron failed to install correctly, please delete node_modules/electron and try again".
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const dir = path.join(__dirname, '..', 'node_modules', 'electron');
if (!fs.existsSync(path.join(dir, 'package.json'))) {
  console.error('node_modules/electron is missing — run "npm install" first.');
  process.exit(1);
}
const marker = path.join(dir, 'path.txt');
const binary = () => {
  try { return path.join(dir, 'dist', fs.readFileSync(marker, 'utf8').trim()); } catch { return null; }
};
if (binary() && fs.existsSync(binary())) process.exit(0);

console.log('Electron binary not found — downloading it now (one time)...');
delete process.env.ELECTRON_SKIP_BINARY_DOWNLOAD;
try {
  execFileSync(process.execPath, [path.join(dir, 'install.js')], { cwd: dir, stdio: 'inherit', env: process.env });
} catch (e) {
  console.error('\nThe Electron download failed. Check the internet connection (or a proxy: set HTTPS_PROXY), then run:');
  console.error('  node node_modules/electron/install.js');
  process.exit(1);
}
if (!(binary() && fs.existsSync(binary()))) { console.error('Electron is still missing after the download.'); process.exit(1); }
console.log('Electron is ready.');
