// Tiny static server for the Playwright harness (module scripts and fonts need http://, not file://).
//   /harness/*  -> packages/webview/test/harness/
//   /dist/*     -> packages/extension/dist/webview/   (the built bundle)
// Listens on 127.0.0.1 only. Usage: node test/harness/serve.mjs [port]
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const roots = {
  '/harness/': resolve(here),
  '/dist/': resolve(here, '../../../extension/dist/webview'),
};
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};
const port = Number(process.argv[2] ?? 41739);

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (url.pathname === '/') {
    res.writeHead(302, { location: '/harness/index.html' }).end();
    return;
  }
  const prefix = Object.keys(roots).find((p) => url.pathname.startsWith(p));
  if (!prefix) {
    res.writeHead(404).end('not found');
    return;
  }
  const base = roots[prefix];
  const file = resolve(base, `.${decodeURIComponent(url.pathname.slice(prefix.length - 1))}`);
  if (!file.startsWith(base + sep)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

server.listen(port, '127.0.0.1', () => console.log(`telelean harness: http://127.0.0.1:${port}/harness/index.html`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
