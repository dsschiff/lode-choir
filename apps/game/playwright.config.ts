import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  globalTeardown: process.env.LODE_CHOIR_EXTERNAL_SERVER ? undefined : './tests/global-teardown.ts',
  use: {
    baseURL: 'http://127.0.0.1:3321',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 820 } } },
  ],
  webServer: process.env.LODE_CHOIR_EXTERNAL_SERVER ? undefined : {
    command: 'node scripts/serve-out.mjs 3321 --watch-parent',
    url: 'http://127.0.0.1:3321',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
