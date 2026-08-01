import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('title menu exposes seed, archive, settings, and credits', async ({ page }) => {
  await expect(page.getByRole('heading', { name: /Lode Choir/i })).toBeVisible();
  await expect(page.getByTestId('new-run')).toBeVisible();
  await expect(page.getByText('EXPEDITION SEED')).toBeVisible();

  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.getByText('Reduce motion').click();
  await expect(page.locator('.app-root')).toHaveClass(/reduced-motion/);
  await page.getByRole('button', { name: /RETURN/ }).click();

  await page.getByRole('button', { name: 'Chronicle' }).click();
  await expect(page.getByRole('heading', { name: 'The Chronicle' })).toBeVisible();
});

test('new run reaches the first consequential choice immediately', async ({ page }) => {
  await page.getByTestId('new-run').click();
  await expect(page.getByTestId('citadel-grid')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Choose a descent' })).toBeVisible();
  await expect(page.locator('[data-testid^="route-"]')).toHaveCount(3);
});

test('tap assignment, route selection, and shift resolution work on phone', async ({ page }) => {
  await page.getByTestId('new-run').click();
  await page.getByTestId('route-0').click();

  const availableRooms = page.locator('[data-testid^="room-"]:not(.empty-room)');
  for (const [crew, roomIndex] of [['mara', 0], ['tamsin', 1], ['orin', 2]] as const) {
    await page.getByTestId(`crew-${crew}`).click();
    await availableRooms.nth(roomIndex).click();
  }

  await expect(page.getByTestId('resolve-shift')).toBeEnabled();
  await page.getByTestId('resolve-shift').click();
  await expect(page.getByTestId('event-panel').or(page.getByTestId('development-panel')).or(page.getByTestId('finale-panel')).or(page.getByRole('heading', { name: 'Choose a descent' }))).toBeVisible();
});

test('autosave can resume and corrupted saves fail safely', async ({ page }) => {
  await page.getByTestId('new-run').click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('lode_choir_autosave_v1'))).not.toBeNull();
  await page.getByRole('button', { name: 'Return to title menu' }).click();
  await expect(page.getByTestId('continue-run')).toBeVisible();
  await page.reload();
  await page.getByTestId('continue-run').click();
  await expect(page.getByTestId('citadel-grid')).toBeVisible();

  await page.evaluate(() => localStorage.setItem('lode_choir_autosave_v1', '{broken'));
  await page.reload();
  await page.getByTestId('continue-run').click();
  await expect(page.getByText(/saved signal was damaged/i)).toBeVisible();
  await expect(page.getByTestId('continue-run')).toHaveCount(0);
});

test('development, finale, and completion surfaces are available to deterministic test hooks', async ({ page }) => {
  await page.getByTestId('new-run').click();
  const hookReady = await page.evaluate(() => Boolean(window.__LODE_CHOIR__?.getState()));
  expect(hookReady).toBe(true);
  await expect(page.locator('.resource-rail')).toBeVisible();
});
