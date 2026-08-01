import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
  await page.goto('/?no-sw=1');
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
  const volume = page.getByRole('slider', { name: 'Choir volume' });
  await expect(volume).toHaveValue('0.7');
  await volume.fill('0.35');
  await expect(page.locator('.volume-setting output')).toHaveText('35%');
  await page.getByText('Reduce motion').click();
  await expect(page.locator('.app-root')).toHaveClass(/reduced-motion/);
  await page.getByRole('button', { name: /RETURN/ }).click();

  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('slider', { name: 'Choir volume' })).toHaveValue('0.35');
  await page.getByRole('button', { name: /RETURN/ }).click();

  await page.getByRole('button', { name: 'Chronicle' }).click();
  await expect(page.getByRole('heading', { name: 'The Chronicle' })).toBeVisible();
});

test('legacy accessibility settings migrate with the default choir volume', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('lode_choir_settings_v1', JSON.stringify({
    muted: false,
    highContrast: true,
    reducedMotion: false,
  })));
  await page.reload();
  await expect(page.locator('.app-root')).toHaveClass(/high-contrast/);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('slider', { name: 'Choir volume' })).toHaveValue('0.7');
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
  const complicatedRoute = await page.evaluate(() => window.__LODE_CHOIR__?.getState()?.routeOffers.findIndex((route) => Boolean(route.hiddenComplication)) ?? -1);
  expect(complicatedRoute).toBeGreaterThanOrEqual(0);
  await page.getByTestId(`route-${complicatedRoute}`).click();

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
  await expect(page.locator('.completion-stats')).toContainText('echo score');
  await page.getByText('Inspect score ledger').click();
  await expect(page.locator('.score-breakdown')).toContainText('Expedition completed');
  await expect(page.locator('.score-breakdown')).toContainText('Final echo score');
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: (text: string) => { localStorage.setItem('copied-expedition-report', text); return Promise.resolve(); } },
  }));
  await page.getByRole('button', { name: 'Copy expedition report' }).click();
  await expect(page.getByRole('button', { name: 'Report copied' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('copied-expedition-report'))).toContain('Replay this signal:');
  await expect(page.locator('.feedback-stack .feedback')).toHaveCount(0);
  const completedSeed = await page.evaluate(() => window.__LODE_CHOIR__?.getState()?.seed);
  await page.getByRole('button', { name: 'Open Chronicle' }).click();
  await expect(page.getByRole('heading', { name: 'Recent descents' })).toBeVisible();
  await expect(page.locator('.run-history').first()).toContainText(completedSeed!);
  await expect(page.locator('.run-history').first()).toContainText('CONCORDANT');
  await page.getByRole('button', { name: /RETURN/ }).click();
  await page.getByRole('button', { name: 'Begin another descent' }).click();
  await expect(page.getByRole('heading', { name: 'Choose what returns' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /Vesper Tuning Fork/i })).toBeEnabled();
});

test('a shared seed URL prepares the exact deterministic signal', async ({ page }) => {
  await page.goto('/?seed=SHARED-SIGNAL&no-sw=1');
  await expect(page.locator('.seed-console')).toContainText('SHARED-SIGNAL');
  await page.getByTestId('new-run').click();
  await expect(page.locator('.loadout-footer')).toContainText('SHARED-SIGNAL');
  await page.getByTestId('begin-descent').click();
  expect(await page.evaluate(() => window.__LODE_CHOIR__?.getState()?.seed)).toBe('SHARED-SIGNAL');
});

test('the complete static export installs and reopens from its generated offline shell', async ({ page, request, context }) => {
  const manifest = await request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBeTruthy();
  expect(manifest.headers()['content-type']).toContain('application/manifest+json');
  expect(await manifest.json()).toMatchObject({ display: 'standalone', orientation: 'portrait', start_url: './' });
  const registrar = await request.get('/register-sw.js');
  expect(registrar.ok()).toBeTruthy();
  expect(await registrar.text()).toContain('serviceWorker.register');
  const worker = await request.get('/sw.js');
  expect(worker.ok()).toBeTruthy();
  const workerText = await worker.text();
  expect(workerText).toContain('art/orison-title.webp');
  expect(workerText).toContain('art/crew-sable.webp');
  expect(workerText).toContain('_next/static');

  await page.goto('/?seed=OFFLINE-CHOIR');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Lode Choir/i })).toBeVisible();
    await expect(page.locator('.seed-console')).toContainText('OFFLINE-CHOIR');
    await expect.poll(() => page.locator('.title-art img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  } finally {
    await context.setOffline(false);
  }
});

test('procedural ambience follows run, menu, mute, resume, and completion lifecycle', async ({ page }) => {
  await page.addInitScript(() => {
    const metrics = { started: 0, stopped: 0, suspended: 0, resumed: 0 };
    class AudioParamStub {
      value = 0.01;
      setValueAtTime(value: number) { this.value = value; }
      exponentialRampToValueAtTime(value: number) { this.value = value; }
      cancelScheduledValues() {}
    }
    class NodeStub {
      connect<T>(target: T) { return target; }
    }
    class OscillatorStub extends NodeStub {
      frequency = new AudioParamStub();
      detune = new AudioParamStub();
      type = 'sine';
      start() { metrics.started += 1; }
      stop() { metrics.stopped += 1; }
    }
    class GainStub extends NodeStub { gain = new AudioParamStub(); }
    class AudioContextStub {
      state = 'running';
      currentTime = 0;
      destination = new NodeStub();
      createOscillator() { return new OscillatorStub(); }
      createGain() { return new GainStub(); }
      async suspend() { metrics.suspended += 1; this.state = 'suspended'; }
      async resume() { metrics.resumed += 1; this.state = 'running'; }
    }
    Object.defineProperty(window, 'AudioContext', { value: AudioContextStub, configurable: true });
    Object.defineProperty(window, '__AUDIO_METRICS__', { value: metrics, configurable: true });
  });
  await page.reload();
  await beginRun(page);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __AUDIO_METRICS__: { started: number } }).__AUDIO_METRICS__.started)).toBe(3);

  await page.getByRole('button', { name: 'Open settings' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __AUDIO_METRICS__: { stopped: number } }).__AUDIO_METRICS__.stopped)).toBe(3);
  await page.getByText('Mute the choir').click();
  await page.getByRole('button', { name: /RETURN/ }).click();
  expect(await page.evaluate(() => (window as unknown as { __AUDIO_METRICS__: { started: number } }).__AUDIO_METRICS__.started)).toBe(3);

  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByText('Mute the choir').click();
  await page.getByRole('button', { name: /RETURN/ }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __AUDIO_METRICS__: { started: number; resumed: number } }).__AUDIO_METRICS__)).toMatchObject({ started: 6, resumed: 1 });
  await page.evaluate(() => {
    const state = window.__LODE_CHOIR__?.getState();
    if (!state) throw new Error('Test hook unavailable.');
    state.phase = 'finale';
    state.shift = 7;
    state.heartNotes = 3;
    window.__LODE_CHOIR__?.command({ type: 'choose_ending', endingId: 'harmonize' });
  });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __AUDIO_METRICS__: { stopped: number } }).__AUDIO_METRICS__.stopped)).toBeGreaterThanOrEqual(6);
});

test('validated progress backups preserve the active signal, Chronicle, and settings', async ({ page }) => {
  await beginRun(page);
  await page.getByTestId('route-0').click();
  const expected = await page.evaluate(() => {
    const state = window.__LODE_CHOIR__?.getState();
    return state ? { seed: state.seed, selectedRoute: state.selectedRoute } : null;
  });
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByText('High contrast').click();
  await page.getByRole('slider', { name: 'Choir volume' }).fill('0.45');
  await expect(page.locator('.app-root')).toHaveClass(/high-contrast/);
  const scan = await new AxeBuilder({ page }).analyze();
  expect(scan.violations, JSON.stringify(scan.violations, null, 2)).toEqual([]);

  await page.getByRole('button', { name: 'CREATE BACKUP' }).click();
  const backup = await page.getByRole('textbox', { name: 'Progress backup text' }).inputValue();
  expect(backup).toContain('lode-choir-backup');
  expect(backup).toContain(expected!.seed);
  await page.getByText('High contrast').click();
  await page.getByRole('textbox', { name: 'Progress backup text' }).fill('{"game":"counterfeit"}');
  await page.getByRole('button', { name: /VALIDATE.*RESTORE/ }).click();
  await expect(page.locator('.backup-status')).toContainText('not a supported Lode Choir progress file');

  await page.getByRole('textbox', { name: 'Progress backup text' }).fill(backup);
  await page.getByRole('button', { name: /VALIDATE.*RESTORE/ }).click();
  await expect(page.locator('.backup-status')).toContainText(`and ${expected!.seed} at shift 1`);
  await expect(page.locator('.app-root')).toHaveClass(/high-contrast/);
  await expect(page.getByRole('slider', { name: 'Choir volume' })).toHaveValue('0.45');
  await page.getByRole('button', { name: /RETURN/ }).click();
  const restored = await page.evaluate(() => window.__LODE_CHOIR__?.getState());
  expect(restored?.seed).toBe(expected!.seed);
  expect(restored?.selectedRoute).toBe(expected!.selectedRoute);

  await page.reload();
  await page.getByTestId('continue-run').click();
  const resumed = await page.evaluate(() => window.__LODE_CHOIR__?.getState());
  expect(resumed?.seed).toBe(expected!.seed);
  expect(resumed?.selectedRoute).toBe(expected!.selectedRoute);
});

test('Black Descent previews exact conditions, resumes, scores, archives, and resets deliberately', async ({ page }) => {
  await page.getByTestId('new-run').click();
  const standard = page.getByRole('radio', { name: /^STANDARD DESCENT Standard$/i });
  const black = page.getByRole('radio', { name: /Black Descent/i });
  await expect(standard).toBeChecked();
  await standard.focus();
  await page.keyboard.press('ArrowRight');
  await expect(black).toBeChecked();
  await expect(page.locator('.loadout-preview')).toHaveText('11 HULL · 3 PRO · 4 ALY · 1 LUM');
  await expect(page.getByTestId('begin-descent')).toContainText('BEGIN BLACK DESCENT');
  const loadoutScan = await new AxeBuilder({ page }).analyze();
  expect(loadoutScan.violations, JSON.stringify(loadoutScan.violations, null, 2)).toEqual([]);
  await page.getByTestId('begin-descent').click();

  let state = await page.evaluate(() => window.__LODE_CHOIR__?.getState());
  expect(state?.runMode).toBe('black_descent');
  expect(state?.integrity).toBe(11);
  expect(state?.resources).toEqual({ provisions: 3, alloy: 4, lumen: 1 });
  const modeIndicator = page.viewportSize()!.width <= 920 ? page.locator('.run-mode-mobile') : page.locator('.run-mode-badge');
  await expect(modeIndicator).toBeVisible();
  await expect(modeIndicator).toContainText('BLACK DESCENT');

  await page.getByRole('button', { name: 'Return to title menu' }).click();
  await expect(page.getByTestId('continue-run')).toContainText('BLACK DESCENT');
  await page.reload();
  await page.getByTestId('continue-run').click();
  state = await page.evaluate(() => window.__LODE_CHOIR__?.getState());
  expect(state?.runMode).toBe('black_descent');
  const completedSeed = state!.seed;

  await page.evaluate(() => {
    const run = window.__LODE_CHOIR__?.getState();
    if (!run) throw new Error('Test hook unavailable.');
    run.phase = 'finale';
    run.shift = 7;
    run.heartNotes = 3;
    window.__LODE_CHOIR__?.command({ type: 'choose_ending', endingId: 'seal' });
  });
  await expect(page.getByTestId('completion-panel')).toContainText('BLACK DESCENT · 1.25×');
  await page.getByRole('button', { name: 'Open Chronicle' }).click();
  await expect(page.locator('.chronicle-summary')).toContainText('best Black Descent');
  await expect(page.locator('.run-history').first()).toContainText('CONCORDANT · BLACK DESCENT');
  await expect(page.locator('.run-history').first()).toContainText('BASE');
  await page.getByRole('button', { name: 'PREPARE SAME SIGNAL' }).click();
  await expect(page.locator('.loadout-footer')).toContainText(completedSeed);
  await expect(page.getByRole('radio', { name: /Black Descent/i })).toBeChecked();
  await page.getByRole('button', { name: /RETURN/ }).click();
  await page.getByRole('button', { name: 'Begin another descent' }).click();
  await expect(page.getByRole('radio', { name: /^STANDARD DESCENT Standard$/i })).toBeChecked();
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
  await expect(page.getByTestId('event-choice-0').locator('.choice-effects')).toHaveText('ALY +2TAMSIN ROOK STR +1');
  await expect(page.getByTestId('event-choice-1').locator('.choice-effects')).toHaveText('PRO −1MARA VEY LOY +1');
  await expect(page.getByTestId('event-choice-2').locator('.choice-effects')).toHaveText('LUM −2NOTE +1');
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
      records: [{ seed: 'OLD-CHOIR', outcome: 'won', ending: 'harvest', shift: 7, heartNotes: 3, integrity: 8, startingRelic: null, score: 2100, scars: 0, fulfilledVows: 1 }],
    },
  })));
  await page.reload();
  await page.getByRole('button', { name: 'Chronicle' }).click();
  await expect(page.getByText('Heart Splinter', { exact: true })).toBeVisible();
  await expect(page.getByText('Orison Launch Manifest')).toBeVisible();
  await expect(page.locator('.run-history')).toContainText('ARCHIVED FORMULA');
  await expect(page.locator('.chronicle-summary span').filter({ hasText: 'best standard' })).toContainText('—');
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
