import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';

const port = Number(process.argv[2] ?? 3321);
const watchParent = process.argv.includes('--watch-parent');
const root = resolve('out');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

const server = createServer((request, response) => {
  const pathname = decodeURIComponent((request.url ?? '/').split('?')[0] ?? '/');
  if (watchParent && request.method === 'POST' && pathname === '/__lode_test_shutdown__') {
    response.writeHead(204);
    response.end();
    server.close(() => process.exit(0));
    return;
  }
  let file = join(root, pathname === '/' ? 'index.html' : pathname);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file) && existsSync(`${file}.html`)) file = `${file}.html`;
  if (!existsSync(file)) { response.writeHead(404); response.end('Not found'); return; }
  response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(response);
});

server.listen(port, '127.0.0.1', () => console.log(`Lode Choir at http://127.0.0.1:${port}`));

if (watchParent) {
  const parentPid = process.ppid;
  setInterval(() => {
    try {
      process.kill(parentPid, 0);
    } catch {
      server.close(() => process.exit(0));
    }
  }, 500).unref();
}
