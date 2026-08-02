import { readdir, readFile } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const outputRoot = resolve('out');
const deploymentPrefix = process.env.GITHUB_PAGES === 'true' ? '/lode-choir' : '';
const limits = {
  total: 1_600_000,
  javascript: 800_000,
  gzipJavascript: 300_000,
  images: 550_000,
  css: 64_000,
  initialShell: 1_100_000,
  gzipInitialShell: 475_000,
  largestFile: 250_000,
};

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  }));
  return nested.flat();
}

const files = (await listFiles(outputRoot)).sort();
const compressible = new Set(['.css', '.html', '.js', '.json', '.svg', '.txt', '.webmanifest']);
const records = await Promise.all(files.map(async (path) => {
  const content = await readFile(path);
  const extension = extname(path);
  return {
    path,
    relativePath: relative(outputRoot, path).split(sep).join('/'),
    bytes: content.byteLength,
    gzipBytes: compressible.has(extension) ? gzipSync(content, { level: 9 }).byteLength : content.byteLength,
    extension,
  };
}));
const total = records.reduce((sum, record) => sum + record.bytes, 0);
const javascript = records.filter((record) => record.extension === '.js').reduce((sum, record) => sum + record.bytes, 0);
const gzipJavascript = records.filter((record) => record.extension === '.js').reduce((sum, record) => sum + record.gzipBytes, 0);
const images = records.filter((record) => ['.webp', '.png', '.svg'].includes(record.extension)).reduce((sum, record) => sum + record.bytes, 0);
const css = records.filter((record) => record.extension === '.css').reduce((sum, record) => sum + record.bytes, 0);
const largest = [...records].sort((left, right) => right.bytes - left.bytes)[0];

const index = await readFile(resolve(outputRoot, 'index.html'), 'utf8');
const referencedUrls = [...index.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
const remoteUrls = referencedUrls.filter((url) => /^https?:/i.test(url) || url.startsWith('//'));
if (remoteUrls.length > 0) throw new Error(`Exported shell references remote runtime assets: ${remoteUrls.join(', ')}`);
const referencedPaths = [...new Set(referencedUrls
  .filter((url) => url.startsWith('/'))
  .map((url) => {
    const path = url.split('?')[0];
    if (deploymentPrefix && path.startsWith(`${deploymentPrefix}/`)) return path.slice(deploymentPrefix.length + 1);
    return path.slice(1);
  }))];
const recordByPath = new Map(records.map((record) => [record.relativePath, record]));
const missingReferences = referencedPaths.filter((path) => !recordByPath.has(path));
if (missingReferences.length > 0) throw new Error(`Exported shell references missing local files: ${missingReferences.join(', ')}`);
const initialShell = (recordByPath.get('index.html')?.bytes ?? 0)
  + referencedPaths.reduce((sum, path) => sum + (recordByPath.get(path)?.bytes ?? 0), 0);
const gzipInitialShell = (recordByPath.get('index.html')?.gzipBytes ?? 0)
  + referencedPaths.reduce((sum, path) => sum + (recordByPath.get(path)?.gzipBytes ?? 0), 0);

const manifest = JSON.parse(await readFile(resolve(outputRoot, 'manifest.webmanifest'), 'utf8'));
if (manifest.display !== 'standalone' || manifest.start_url !== './' || manifest.scope !== './') {
  throw new Error('Manifest is not a root-relative standalone install contract.');
}
const worker = await readFile(resolve(outputRoot, 'sw.js'), 'utf8');
const uncached = records
  .filter((record) => !['sw.js', 'index.html'].includes(record.relativePath))
  .filter((record) => !worker.includes(JSON.stringify(`./${record.relativePath}`)))
  .map((record) => record.relativePath);
if (uncached.length > 0) throw new Error(`Offline shell omits exported files: ${uncached.join(', ')}`);

const checks = { total, javascript, gzipJavascript, images, css, initialShell, gzipInitialShell, largestFile: largest?.bytes ?? 0 };
for (const [id, value] of Object.entries(checks)) {
  if (value > limits[id]) throw new Error(`${id} budget exceeded: ${value} > ${limits[id]} bytes.`);
}

console.log('Export budget', JSON.stringify({ ...checks, files: records.length, largest: largest?.relativePath }));
