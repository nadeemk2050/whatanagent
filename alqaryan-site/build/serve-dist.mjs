// Dev helper: serves dist/ on 127.0.0.1:8099 with CORS so the logged-in WordPress
// admin tab can pull content-manifest.json directly instead of copy-pasting pages.
// Usage: node build/serve-dist.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg'
};

http
  .createServer(function (req, res) {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'content-manifest.json';
    const file = path.resolve(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
      res.end('not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    });
    fs.createReadStream(file).pipe(res);
  })
  .listen(8099, '127.0.0.1', function () {
    console.log('Serving ' + ROOT + ' on http://127.0.0.1:8099');
  });
