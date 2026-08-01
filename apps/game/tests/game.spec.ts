import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('title menu exposes seed, archive, settings, and credits', async ({ page }) => {
  await expect(page.getByRole('heading', { name: /Lode Choir/i })).toBeVisible();
  await expect(page.getByTestId('new-run')).toBeVisible();
  await expect(page.getByText('EXPEDITION SEED')).toBeVisible();

  await page.getByRole('button', { name: 'Manual' }).click();
  await expect(page.getByRole('heading', { name: 'How to descend' })).toBeVisible();
  await page.getByRole('button', { name: /RETURN/ }).click();

  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.getByText('Reduce motion').click();
  await expect(page.locator('.app-root')).toHaveClass(/reduced-motion/);
  await page.getByRole('button', { name: /RETURN/ }).click();

  await page.getByRole('button', { name: 'Chronicle' }).click();
  await expect(page.getByRole('heading', { name: 'The Chronicle' })).toBeVisible();
});

test('new run reaches the first consequential choice immediately', async ({ page }) => {
  await beginRun(page);
  await expect(page.getByTestId('citadel-grid')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Choose a descent' })).toBeVisible();
  await expect(page.locator('[data-testid^="route-"]')).toHaveCount(3);
  await expect(page.locator('.route-forecast')).toHaveCount(3);
  await expect(page.locator('.route-forecast').first()).toContainText('RATION −1');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.locator('.game-header')).toBeInViewport();
  const routeBox = await page.locator('.route-panel').boundingBox();
  const crewBox = await page.locator('.crew-roster').boundingBox();
  expect(routeBox?.y).toBeLessThan(crewBox?.y ?? Number.POSITIVE_INFINITY);
});

test('tap assignment, route selection, and shift resolution work on phone', async ({ page }) => {
  await beginRun(page);
  await page.getByTestId('route-0').click();

  const availableRooms = page.locator('[data-testid^="room-"]:not(.empty-room)');
  for (const [crew, roomIndex] of [['mara', 0], ['tamsin', 1], ['orin', 2]] as const) {
    await page.getByTestId(`crew-${crew}`).click();
    await availableRooms.nth(roomIndex).click();
  }
  await page.getByTestId('crew-sable').click();
  await page.getByRole('button', { name: 'APPOINT' }).click();
  await expect(page.getByTestId('leader-post')).toContainText('Sable-9');
  await expect(page.locator('.route-card.is-selected')).toContainText('Foreseen:');
  await expect(page.locator('.route-card.is-selected .route-forecast')).toContainText('RATION −2');
  await page.getByRole('button', { name: /Recall Sable-9/i }).click();
  await expect(page.locator('.route-card.is-selected')).not.toContainText('Foreseen:');
  await page.getByTestId('crew-sable').click();
  await page.getByRole('button', { name: 'APPOINT' }).click();

  await expect(page.getByTestId('resolve-shift')).toBeEnabled();
  await page.getByTestId('resolve-shift').click();
  await expect(page.getByTestId('event-panel').or(page.getByTestId('development-panel')).or(page.getByTestId('finale-panel')).or(page.getByRole('heading', { name: 'Choose a descent' }))).toBeVisible();
});

test('autosave can resume and corrupted saves fail safely', async ({ page }) => {
  await beginRun(page);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('lode_choir_autosave_v1'))).not.toBeNull();
  await page.getByRole('button', { name: 'Return to title menu' }).click();
  await expect(page.getByTestId('continue-run')).toBeVisible();
  await expect(page.getByTestId('continue-run')).toContainText('SHIFT 1/7');
  await page.reload();
  await page.getByTestId('continue-run').click();
  await expect(page.getByTestId('citadel-grid')).toBeVisible();

  await page.evaluate(() => localStorage.setItem('lode_choir_autosave_v1', '{broken'));
  await page.reload();
  await page.getByTestId('continue-run').click();
  await expect(page.getByText(/saved signal was damaged/i)).toBeVisible();
  await expect(page.getByTestId('continue-run')).toHaveCount(0);
});

test('deterministic hook can resolve a finale and begin the next inherited descent', async ({ page }) => {
  await beginRun(page);
  await page.evaluate(() => {
    const state = window.__LODE_CHOIR__?.getState();
    if (!state) throw new Error('Test hook unavailable.');
    state.phase = 'finale';
    state.shift = 7;
    state.heartNotes = 3;
    window.__LODE_CHOIR__?.command({ type: 'choose_ending', endingId: 'harmonize' });
  });
  await expect(page.getByTestId('completion-panel')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Join the Choir' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Join the Choir' })).toBeFocused();
  await expect(page.locator('.feedback-stack .feedback')).toHaveCount(0);
  await page.getByRole('button', { name: 'Begin another descent' }).click();
  await expect(page.getByRole('heading', { name: 'Choose what returns' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /Vesper Tuning Fork/i })).toBeEnabled();
});

test('story choices expose unaffordable costs before the player commits', async ({ page }) => {
  await beginRun(page);
  await page.evaluate(() => {
    const state = window.__LODE_CHOIR__?.getState();
    if (!state) throw new Error('Test hook unavailable.');
    state.phase = 'event';
    state.activeEvent = 'glass_bell';
    state.resources = { provisions: 0, alloy: 0, lumen: 0 };
    window.__LODE_CHOIR__?.refresh();
  });
  await expect(page.getByRole('heading', { name: 'The Glass Bell' })).toBeVisible();
  await expect(page.getByTestId('event-choice-0')).toBeEnabled();
  await expect(page.getByTestId('event-choice-1')).toBeDisabled();
  await expect(page.getByTestId('event-choice-2')).toBeDisabled();
  await expect(page.getByText('REQUIRES RESOURCES YOU DO NOT HAVE')).toHaveCount(2);
  const scan = await new AxeBuilder({ page }).analyze();
  expect(scan.violations, JSON.stringify(scan.violations, null, 2)).toEqual([]);
  await page.getByTestId('event-choice-0').click();
  await expect(page.getByRole('heading', { name: 'Choose a descent' })).toBeVisible();
});

test('damaged Orison can spend alloy on emergency plating at development', async ({ page }) => {
  await beginRun(page);
  await page.evaluate(() => {
    const state = window.__LODE_CHOIR__?.getState();
    if (!state) throw new Error('Test hook unavailable.');
    state.phase = 'event';
    state.shift = 2;
    state.activeEvent = 'glass_bell';
    state.integrity = 8;
    state.resources.alloy = 4;
    window.__LODE_CHOIR__?.command({ type: 'choose_event', choiceIndex: 0 });
  });
  await expect(page.getByTestId('development-panel')).toBeVisible();
  await expect(page.getByTestId('repair-citadel')).toBeEnabled();
  await page.getByTestId('repair-citadel').click();
  const state = await page.evaluate(() => window.__LODE_CHOIR__?.getState());
  expect(state?.integrity).toBe(10);
  expect(state?.resources.alloy).toBe(4);
  expect(state?.shift).toBe(3);
});

test('charted routes hold, swap, refund, survive reload, and return next shift', async ({ page }) => {
  await beginRun(page);
  await page.getByTestId('route-0').click();
  await expect(page.getByTestId('route-chart')).toBeVisible();
  const chartScan = await new AxeBuilder({ page }).analyze();
  expect(chartScan.violations, JSON.stringify(chartScan.violations, null, 2)).toEqual([]);
  const initialLumen = (await page.evaluate(() => window.__LODE_CHOIR__?.getState()?.resources.lumen))!;

  const first = page.locator('.route-chart-action').first();
  await first.click();
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await expect(first).toBeFocused();
  expect(await page.evaluate(() => window.__LODE_CHOIR__?.getState()?.resources.lumen)).toBe(initialLumen - 1);

  await page.reload();
  await page.getByTestId('continue-run').click();
  await expect(page.locator('.route-chart-action.is-held')).toHaveCount(1);
  await page.locator('.route-chart-action:not(.is-held)').first().click();
  expect(await page.evaluate(() => window.__LODE_CHOIR__?.getState()?.resources.lumen)).toBe(initialLumen - 1);

  const heldIndex = await page.evaluate(() => {
    const state = window.__LODE_CHOIR__?.getState();
    return state?.routeOffers.findIndex((offer) => offer.instanceId === state.reservedRoute) ?? -1;
  });
  await page.getByTestId(`route-${heldIndex}`).click();
  expect(await page.evaluate(() => window.__LODE_CHOIR__?.getState()?.reservedRoute)).toBeNull();
  expect(await page.evaluate(() => window.__LODE_CHOIR__?.getState()?.resources.lumen)).toBe(initialLumen);

  await page.locator('.route-chart-action').first().click();
  await page.locator('.route-chart-action.is-held').click();
  expect(await page.evaluate(() => window.__LODE_CHOIR__?.getState()?.resources.lumen)).toBe(initialLumen);
  await page.locator('.route-chart-action').first().click();
  const carriedRouteId = await page.evaluate(() => {
    const state = window.__LODE_CHOIR__?.getState();
    return state?.routeOffers.find((offer) => offer.instanceId === state.reservedRoute)?.routeId;
  });
  await page.evaluate(() => {
    const resources = window.__LODE_CHOIR__?.getState()?.resources;
    if (resources) {
      resources.provisions = 20;
      resources.alloy = 20;
      resources.lumen = 20;
    }
  });

  const rooms = page.locator('[data-testid^="room-"]:not(.empty-room)');
  for (const [crew, roomIndex] of [['mara', 0], ['tamsin', 1], ['orin', 2]] as const) {
    await page.getByTestId(`crew-${crew}`).click();
    await rooms.nth(roomIndex).click();
  }
  await page.getByTestId('resolve-shift').click();
  await page.getByTestId('event-choice-0').click();
  await expect(page.getByText('CHARTED LAST SHIFT')).toBeVisible();
  const carriedCount = await page.evaluate((routeId) => window.__LODE_CHOIR__?.getState()?.routeOffers.filter((offer) => offer.routeId === routeId && offer.carried).length, carriedRouteId);
  expect(carriedCount).toBe(1);

  await page.evaluate(() => {
    const state = window.__LODE_CHOIR__?.getState();
    if (!state) return;
    state.resources.lumen = 0;
    window.__LODE_CHOIR__?.command({ type: 'select_route', instanceId: state.routeOffers[0]!.instanceId });
  });
  await expect(page.locator('.route-chart-action:not(.is-held):disabled')).toHaveCount(2);
});

async function beginRun(page: Page) {
  await page.getByTestId('new-run').click();
  await expect(page.getByRole('heading', { name: 'Choose what returns' })).toBeVisible();
  await expect(page.locator('.relic-card.is-locked input')).toHaveCount(3);
  await expect(page.locator('.relic-card.is-locked input:not(:disabled)')).toHaveCount(0);
  await page.getByTestId('begin-descent').click();
}

test('title, manual, and planning surfaces have no detectable accessibility violations', async ({ page }) => {
  const titleScan = await new AxeBuilder({ page }).analyze();
  expect(titleScan.violations, JSON.stringify(titleScan.violations, null, 2)).toEqual([]);

  await page.getByRole('button', { name: 'Manual' }).click();
  const manualScan = await new AxeBuilder({ page }).analyze();
  expect(manualScan.violations, JSON.stringify(manualScan.violations, null, 2)).toEqual([]);
  await page.getByRole('button', { name: /RETURN/ }).click();

  await page.getByTestId('new-run').click();
  const loadoutScan = await new AxeBuilder({ page }).analyze();
  expect(loadoutScan.violations, JSON.stringify(loadoutScan.violations, null, 2)).toEqual([]);
  await page.getByTestId('begin-descent').click();
  const planningScan = await new AxeBuilder({ page }).analyze();
  expect(planningScan.violations, JSON.stringify(planningScan.violations, null, 2)).toEqual([]);
});

test('unlocked Chronicle relics apply canonical starting effects', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('lode_choir_legacy_v1', JSON.stringify({
    game: 'lode-choir-legacy',
    version: 2,
    legacy: {
      version: 2,
      runsCompleted: 3,
      echoShards: 9,
      endings: ['harvest', 'harmonize', 'seal'],
      lore: ['orison_manifest'],
      relics: ['heart_splinter', 'vesper_tuning_fork', 'oathkeepers_latch'],
    },
  })));
  await page.reload();
  await page.getByRole('button', { name: 'Chronicle' }).click();
  await expect(page.getByText('Heart Splinter', { exact: true })).toBeVisible();
  await expect(page.getByText('Orison Launch Manifest')).toBeVisible();
  await page.getByRole('button', { name: /RETURN/ }).click();

  const beginWith = async (name: string) => {
    await page.getByTestId('new-run').click();
    await page.getByRole('radio', { name: new RegExp(name, 'i') }).check();
    await page.getByTestId('begin-descent').click();
  };
  const returnForAnother = async () => page.getByRole('button', { name: 'Return to title menu' }).click();

  await beginWith('Heart Splinter');
  let state = await page.evaluate(() => window.__LODE_CHOIR__?.getState());
  expect(state?.startingRelic).toBe('heart_splinter');
  expect(state?.resources.alloy).toBe(7);
  expect(state?.crew.find((crew) => crew.id === 'tamsin')?.strain).toBe(1);
  await expect(page.getByText('RELIC // Heart Splinter')).toBeVisible();

  await returnForAnother();
  await page.getByTestId('continue-run').click();
  state = await page.evaluate(() => window.__LODE_CHOIR__?.getState());
  expect(state?.startingRelic).toBe('heart_splinter');

  await returnForAnother();
  await beginWith('Vesper Tuning Fork');
  state = await page.evaluate(() => window.__LODE_CHOIR__?.getState());
  expect(state?.startingRelic).toBe('vesper_tuning_fork');
  expect(state?.heartNotes).toBe(1);
  expect(state?.resources.lumen).toBe(1);

  await returnForAnother();
  await beginWith("Oathkeeper's Latch");
  state = await page.evaluate(() => window.__LODE_CHOIR__?.getState());
  expect(state?.startingRelic).toBe('oathkeepers_latch');
  expect(state?.integrity).toBe(13);
  expect(state?.resources.alloy).toBe(4);
  await expect(page.locator('.resource-rail')).toContainText('13/13');
});
