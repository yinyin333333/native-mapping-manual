/** A loopback-only preview server. Production is ordinary static GitHub Pages. */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.toml': 'text/plain; charset=utf-8' };

export function createPreviewServer() {
  return http.createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }); response.end('Method not allowed'); return;
    }
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
    catch { response.writeHead(400); response.end('Invalid URL'); return; }
    if (pathname === '/native-mapping-manual') {
      response.writeHead(301, { Location: '/native-mapping-manual/' }); response.end(); return;
    }
    pathname = pathname.replace(/^\/native-mapping-manual\//, '/');
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const filename = path.resolve(siteRoot, relative);
    const isPublic = relative === 'index.html' || /^guides\/[a-z0-9-]+\.html$/.test(relative) || /^(assets|examples)\/[a-zA-Z0-9._/-]+$/.test(relative);
    if (!isPublic || !filename.startsWith(siteRoot + path.sep) || relative.split('/').includes('..')) {
      response.writeHead(404); response.end('Not found'); return;
    }
    try {
      const information = await stat(filename);
      if (!information.isFile()) throw new Error('Not a file');
      const content = await readFile(filename);
      response.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Content-Length': content.length });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end('Not found');
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be 1..65535.');
  const server = createPreviewServer();
  server.on('error', error => { console.error(`Preview server: ${error.message}`); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Native Mapping manual: http://127.0.0.1:${port}/native-mapping-manual/`);
    console.log('Static files only. Press Ctrl+C to stop.');
  });
  process.on('SIGINT', () => server.close(() => process.exit(0)));
}
