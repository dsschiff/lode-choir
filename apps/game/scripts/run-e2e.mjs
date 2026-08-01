import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = resolve(appRoot, '..', '..');
const nextCli = resolve(workspaceRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
const playwrightCli = resolve(workspaceRoot, 'node_modules', '@playwright', 'test', 'cli.js');

function run(command, args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { cwd: appRoot, stdio: 'inherit', ...options });
    child.once('error', rejectRun);
    child.once('exit', (code) => code === 0 ? resolveRun() : rejectRun(new Error(`${args[0] ?? command} exited with code ${code}`)));
  });
}

async function waitForServer() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch('http://127.0.0.1:3321');
      if (response.ok) return;
    } catch {
      // The bounded startup check retries until the server accepts a request.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error('Static test server did not start within 10 seconds.');
}

await run(process.execPath, [nextCli, 'build']);
const server = spawn(process.execPath, ['scripts/serve-out.mjs', '3321'], { cwd: appRoot, stdio: 'inherit' });

try {
  await waitForServer();
  await run(process.execPath, [playwrightCli, 'test'], {
    env: { ...process.env, LODE_CHOIR_EXTERNAL_SERVER: '1' },
  });
} finally {
  if (server.exitCode === null) server.kill();
  await Promise.race([
    new Promise((resolveExit) => server.once('exit', resolveExit)),
    new Promise((resolveWait) => setTimeout(resolveWait, 2_000)),
  ]);
}
