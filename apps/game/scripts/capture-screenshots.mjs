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
const finalizeExport = resolve(appRoot, 'scripts', 'finalize-export.mjs');

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
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const screenshot = async (surface) => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: resolve(outputRoot, `${surface}-${name}.jpg`), fullPage: true, type: 'jpeg', quality: 84 });
  };
  await page.goto('http://127.0.0.1:3321/?seed=QA-ORISON&no-sw=1');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState('networkidle');
  await screenshot('title');

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'CREATE BACKUP' }).click();
  await screenshot('settings');
  await page.getByRole('button', { name: /RETURN/ }).click();

  await page.getByTestId('new-run').click();
  await screenshot('loadout');
  await page.locator('.descent-mode-options label.is-black').click();
  await screenshot('loadout-black');
  await page.locator('.descent-mode-options label').first().click();
  await page.getByTestId('begin-descent').click();
  await screenshot('prologue');

  await page.evaluate(() => window.__LODE_CHOIR__?.newRun('QA-ORISON'));
  await page.getByTestId('route-0').click();
  const rooms = page.locator('[data-testid^="room-"]:not(.empty-room)');
  for (const [crew, room] of [['mara', 0], ['tamsin', 1], ['orin', 2]]) {
    await page.getByTestId(`crew-${crew}`).click();
    await rooms.nth(room).click();
  }
  await page.locator('.leader-options').getByRole('button', { name: /Sable-9/ }).click();
  await screenshot('planning');
  await page.locator('.header-actions').getByRole('button', { name: 'Open expedition log and menu' }).click();
  await screenshot('journal');
  await page.getByRole('button', { name: /RESUME EXPEDITION/ }).click();

  await page.evaluate(() => {
    const state = window.__LODE_CHOIR__?.getState();
    if (!state) return;
    state.phase = 'event';
    state.activeEvent = 'glass_bell';
    state.resources = { provisions: 0, alloy: 0, lumen: 0 };
    window.__LODE_CHOIR__?.refresh();
  });
  await screenshot('event');

  await page.evaluate(() => {
    const state = window.__LODE_CHOIR__?.getState();
    if (!state) return;
    state.phase = 'development';
    state.activeEvent = null;
    state.shift = 2;
    state.integrity = 8;
    state.resources.alloy = 10;
    state.developmentChoices = ['foundry', 'infirmary', 'resonance_chamber'];
    window.__LODE_CHOIR__?.refresh();
  });
  await screenshot('development');

  await page.evaluate(() => {
    const state = window.__LODE_CHOIR__?.getState();
    if (!state) return;
    state.phase = 'finale';
    state.shift = 7;
    state.heartNotes = 3;
    window.__LODE_CHOIR__?.refresh();
  });
  await screenshot('finale');
  await page.evaluate(() => window.__LODE_CHOIR__?.command({ type: 'choose_ending', endingId: 'harmonize' }));
  await page.getByTestId('completion-panel').waitFor();
  await screenshot('completion');
  await page.getByRole('button', { name: 'Open Chronicle' }).click();
  await screenshot('chronicle');
  await page.close();
}

if (await portIsListening()) throw new Error('Port 3321 is already in use; refusing to capture an unknown build.');
mkdirSync(outputRoot, { recursive: true });
await run(process.execPath, [nextCli, 'build']);
await run(process.execPath, [finalizeExport]);
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
