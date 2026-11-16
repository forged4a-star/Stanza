// Serves a folder the way GitHub Pages does: under /<prefix>/, unknown addresses answer with 404.html,
// and none of the special headers the dev server adds.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? 'dist-pages');
const port = Number(process.argv[3] ?? 8082);
const prefix = process.argv[4] ?? '/Stanza';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.css': 'text/css' };

http
  .createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (url !== prefix && !url.startsWith(prefix + '/')) {
      res.statusCode = 404;
      return res.end('Not found');
    }
    let rel = url.slice(prefix.length) || '/';
    let file = path.join(root, rel);
    let status = 200;
    if (file.endsWith(path.sep) || (fs.existsSync(file) && fs.statSync(file).isDirectory())) file = path.join(file, 'index.html');
    if (!file.startsWith(root) || !fs.existsSync(file)) {
      file = path.join(root, '404.html');
      status = 404;
    }
    res.statusCode = status;
    res.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, () => console.log(`serving ${root} on http://localhost:${port}${prefix}/`));
