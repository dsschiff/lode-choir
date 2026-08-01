import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

const outputRoot = resolve('out');

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  }));
  return nested.flat();
}

const files = (await listFiles(outputRoot))
  .filter((path) => !path.endsWith(`${sep}sw.js`))
  .sort();
const paths = files.map((path) => relative(outputRoot, path).split(sep).join('/'));
const digest = createHash('sha256');
for (let index = 0; index < files.length; index += 1) {
  digest.update(paths[index]);
  digest.update(await readFile(files[index]));
}
const cacheName = `lode-choir-shell-${digest.digest('hex').slice(0, 12)}`;
const precache = ['./', ...paths.filter((path) => path !== 'index.html').map((path) => `./${path}`)];

const serviceWorker = `// Generated from the complete static export by finalize-export.mjs.\n` +
`const BASE = new URL('./', self.location.href);\n` +
`const CACHE_PREFIX = 'lode-choir-shell-';\n` +
`const CACHE_NAME = ${JSON.stringify(cacheName)};\n` +
`const PRECACHE = ${JSON.stringify(precache, null, 2)}.map((path) => new URL(path, BASE).toString());\n` +
`self.addEventListener('install', (event) => {\n` +
`  event.waitUntil(caches.open(CACHE_NAME).then((cache) => Promise.all(PRECACHE.map((url) => cache.add(new Request(url, { cache: 'reload' }))))));\n` +
`  self.skipWaiting();\n` +
`});\n` +
`self.addEventListener('activate', (event) => {\n` +
`  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));\n` +
`});\n` +
`self.addEventListener('fetch', (event) => {\n` +
`  const request = event.request;\n` +
`  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;\n` +
`  if (request.mode === 'navigate') {\n` +
`    event.respondWith(fetch(request).then((response) => { const copy = response.clone(); caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)); return response; }).catch(() => caches.match(request).then((cached) => cached || caches.match(new URL('./', BASE).toString()))));\n` +
`    return;\n` +
`  }\n` +
`  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => { if (response.ok) { const copy = response.clone(); caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)); } return response; })));\n` +
`});\n`;

await writeFile(resolve(outputRoot, 'sw.js'), serviceWorker, 'utf8');
console.log(`Offline shell ${cacheName}: ${precache.length} precached files.`);
