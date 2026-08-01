import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createConnection } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = resolve(appRoot, '..', '..');
const outputRoot = resolve(workspaceRoot, 'docs', 'screenshots');
const nextCli = resolve(workspaceRoot, 'node_modules', 'next', 'dist', 'bin', 'next');

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { cwd: appRoot, stdio: 'inherit' });
    child.once('error', rejectRun);
    child.once('exit', (code) => code === 0 ? resolveRun() : rejectRun(new Error(`${args[0] ?? command} exited with code ${code}`)));
  });
}

function portIsListening() {
  return new Promise((resolveCheck) => {
    const socket = createConnection({ host: '127.0.0.1', port: 3321 });
    socket.setTimeout(500);
    socket.once('connect', () => { socket.destroy(); resolveCheck(true); });
    socket.once('timeout', () => { socket.destroy(); resolveCheck(false); });
    socket.once('error', () => resolveCheck(false));
  });
}

async function waitForServer() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch('http://127.0.0.1:3321');
      if (response.ok) return;
    } catch {
      // Retry only within the bounded startup window.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error('Static screenshot server did not start within 10 seconds.');
}

async function capture(browser, name, viewport, mobile = false) {
  const page = await browser.newPage({ viewport, isMobile: mobile, hasTouch: mobile });
  await page.goto('http://127.0.0.1:3321');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: resolve(outputRoot, `title-${name}.jpg`), fullPage: true, type: 'jpeg', quality: 84 });

  await page.evaluate(() => window.__LODE_CHOIR__?.newRun('QA-ORISON'));
  await page.getByTestId('route-0').click();
  const rooms = page.locator('[data-testid^="room-"]:not(.empty-room)');
  for (const [crew, room] of [['mara', 0], ['tamsin', 1], ['orin', 2]]) {
    await page.getByTestId(`crew-${crew}`).click();
    await rooms.nth(room).click();
  }
  await page.getByTestId('crew-sable').click();
  await page.getByRole('button', { name: 'APPOINT' }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: resolve(outputRoot, `planning-${name}.jpg`), fullPage: true, type: 'jpeg', quality: 84 });
  await page.close();
}

if (await portIsListening()) throw new Error('Port 3321 is already in use; refusing to capture an unknown build.');
mkdirSync(outputRoot, { recursive: true });
await run(process.execPath, [nextCli, 'build']);
const server = spawn(process.execPath, ['scripts/serve-out.mjs', '3321'], { cwd: appRoot, stdio: 'inherit' });

try {
  await waitForServer();
  const browser = await chromium.launch({ headless: true });
  try {
    await capture(browser, 'desktop', { width: 1440, height: 960 });
    await capture(browser, 'phone', { width: 390, height: 844 }, true);
  } finally {
    await browser.close();
  }
} finally {
  if (server.exitCode === null) server.kill();
  await Promise.race([
    new Promise((resolveExit) => server.once('exit', resolveExit)),
    new Promise((resolveWait) => setTimeout(resolveWait, 2_000)),
  ]);
}
