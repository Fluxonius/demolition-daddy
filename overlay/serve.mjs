// Fallback: serves the same pet page on localhost for Cursor's built-in Browser tab.
// The page polls GET /state.json; button clicks POST /action. No dependencies.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { petDir, readState, readMessages } = require('./lib/pet-dir.js');
const { recordAction } = require('./lib/actions.js');

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), 'web');
const PORT = Number(process.env.PORT) || 4517;
const HOST = process.env.HOST || '127.0.0.1';
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/state.json') {
    return send(res, 200, JSON.stringify(readState()));
  }
  if (url.pathname === '/messages.json') {
    return send(res, 200, JSON.stringify(readMessages()));
  }
  if (url.pathname === '/action' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c).length > 1e4 && req.destroy());
    req.on('end', () => {
      let msg;
      try { msg = JSON.parse(body); } catch { return send(res, 400, '{"ok":false}'); }
      send(res, 200, JSON.stringify({ ok: true, event: recordAction(msg) }));
    });
    return;
  }
  const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const file = path.join(WEB, rel);
  if (!file.startsWith(WEB + path.sep)) return send(res, 403, 'forbidden', 'text/plain');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'not found', 'text/plain');
    send(res, 200, data, TYPES[path.extname(file)] || 'application/octet-stream');
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Pet page: http://${HOST}:${PORT}/  (state dir: ${petDir()})`);
  console.log('Open it in Cursor: Agents Window > New Browser tab, or click the link above.');
});
