import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';

const port = Number(process.argv[2] ?? 3321);
const root = resolve('out');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

createServer((request, response) => {
  const pathname = decodeURIComponent((request.url ?? '/').split('?')[0] ?? '/');
  let file = join(root, pathname === '/' ? 'index.html' : pathname);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file) && existsSync(`${file}.html`)) file = `${file}.html`;
  if (!existsSync(file)) { response.writeHead(404); response.end('Not found'); return; }
  response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(response);
}).listen(port, '127.0.0.1', () => console.log(`Lode Choir at http://127.0.0.1:${port}`));

