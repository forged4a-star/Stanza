// Final touches on an exported web build in $1: give the offline worker its file list and a version
// name, and add the two files GitHub Pages needs (404.html, .nojekyll).
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve(process.argv[2] ?? 'dist-pages');
const build = process.env.BUILD_ID || String(Date.now());

const files = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else files.push(path.relative(dir, p).split(path.sep).join('/'));
  }
};
walk(dir);
// the worker itself and files nobody loads need no copy
const precache = files.filter((f) => !['sw.js', 'metadata.json', '404.html'].includes(f) && !f.endsWith('.map'));

const swPath = path.join(dir, 'sw.js');
let sw = fs.readFileSync(swPath, 'utf8');
if (!sw.includes('__BUILD__') || !sw.includes('__PRECACHE__')) throw new Error('sw.js is missing its placeholders');
sw = sw.replace('__BUILD__', build).replace('__PRECACHE__', JSON.stringify(precache).replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
fs.writeFileSync(swPath, sw);

// Pages shows 404.html for addresses it does not know; the app handles them, so it is the app
fs.copyFileSync(path.join(dir, 'index.html'), path.join(dir, '404.html'));
// without this file Pages ignores folders that start with an underscore (_expo)
fs.writeFileSync(path.join(dir, '.nojekyll'), '');
console.log(`web build ready: ${precache.length} files kept for offline use (version ${build})`);
