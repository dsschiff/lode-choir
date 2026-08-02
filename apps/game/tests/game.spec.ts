import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ROUTES } from '@lode-choir/engine';

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
  await expect(page.getByRole('heading', { name: 'How an expedition works' })).toBeVisible();
  await page.getByRole('button', { name: /RETURN/ }).click();

  await page.evaluate(() => {
    const promptEvent = new Event('beforeinstallprompt', { cancelable: true });
    Object.defineProperties(promptEvent, {
      prompt: { value: () => { localStorage.setItem('install-prompted', 'yes'); return Promise.resolve(); } },
      userChoice: { value: Promise.resolve({ outcome: 'accepted' }) },
    });
    window.dispatchEvent(promptEvent);
  });
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.getByRole('button', { name: 'INSTALL APP' }).click();
  await expect(page.getByRole('heading', { name: 'Installation accepted' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('install-prompted'))).toBe('yes');
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

async function openRunMenu(page: Page) {
  const currentLog = page.getByRole('heading', { name: 'Current descent' });
  if (await currentLog.count() === 0) await page.locator('.header-actions').getByRole('button', { name: 'Open expedition log and menu' }).click();
  await expect(currentLog).toBeVisible();
}

async function openRunSettings(page: Page) {
  await openRunMenu(page);
  await page.getByRole('button', { name: 'SETTINGS & BACKUP' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
}

async function resumeRun(page: Page) {
  await page.getByRole('button', { name: /RESUME EXPEDITION/ }).click();
  await expect(page.getByTestId('citadel-grid')).toBeVisible();
  await expect(page.locator('.citadel-caption')).toContainText('compare all four crew');
}

async function returnToTitle(page: Page) {
  await openRunMenu(page);
  await page.getByRole('button', { name: 'RETURN TO TITLE' }).click();
  await expect(page.getByTestId('title-screen')).toBeVisible();
}

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
  await expect(page.getByRole('heading', { name: 'Prepare this shift' })).toBeVisible();
  await expect(page.locator('[data-testid^="route-"]')).toHaveCount(3);
  await expect(page.locator('.route-forecast')).toHaveCount(3);
  await expect(page.locator('.route-forecast').first()).toContainText('RATION −1');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.locator('.game-header')).toBeInViewport();
  const routeBox = await page.locator('.route-panel').boundingBox();
  const crewBox = await page.locator('.crew-roster').boundingBox();
  expect(routeBox?.y).toBeLessThan(crewBox?.y ?? Number.POSITIVE_INFINITY);
});

test('in-run log menu preserves the descent and recaps crew and story on phone', async ({ page }) => {
  await beginRun(page);
  await page.getByTestId('route-0').click();
  const finalMission = await page.getByTestId('route-1').locator('.route-copy > strong').innerText();
  await page.getByTestId('route-1').click();
  const menu = page.locator('.header-actions').getByRole('button', { name: 'Open expedition log and menu' });
  await expect(menu).toBeVisible();
  await menu.click();
  await expect(page.getByRole('heading', { name: 'Current descent' })).toBeVisible();
  await expect(page.getByTestId('pause-summary')).toContainText('SHIFT');
  await expect(page.getByTestId('heart-note-register').locator('span')).toHaveCount(3);
  await expect(page.getByTestId('heart-note-register')).toContainText('UNRECOVERED');
  await expect(page.getByTestId('pause-crew').locator('article')).toHaveCount(4);
  await expect(page.getByTestId('expedition-journal')).toContainText('Course set for');
  await expect(page.getByTestId('expedition-journal')).toContainText(finalMission);
  await expect(page.getByTestId('expedition-journal').locator('li')).toHaveCount(1);
  await page.getByRole('button', { name: 'FIELD MANUAL' }).click();
  await expect(page.getByRole('heading', { name: 'How an expedition works' })).toBeVisible();
  await page.getByRole('button', { name: /RETURN/ }).click();
  await expect(page.getByRole('heading', { name: 'Current descent' })).toBeVisible();
  await page.getByRole('button', { name: 'RESUME EXPEDITION' }).click();
  await expect(page.getByTestId('citadel-grid')).toBeVisible();
  await expect(page.getByTestId('route-1')).toHaveAttribute('aria-pressed', 'true');
});

test('a new expedition explains Orison, Heart Notes, and every crew stake before planning', async ({ page }) => {
  await page.getByTestId('new-run').click();
  await page.getByTestId('begin-descent').click();
  await expect(page.getByTestId('prologue-screen')).toBeVisible();
  await expect(page.getByRole('heading', { name: /moon said your names/i })).toBeVisible();
  await expect(page.getByText(/walking mining citadel/i)).toBeVisible();
  await expect(page.locator('.contract-terms')).toContainText('Complete phrases recovered from the signal. Three Notes are enough to answer it.');
  for (const name of ['Mara Vey', 'Tamsin Rook', 'Orin Vale', 'Sable-9']) await expect(page.getByText(name, { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Prepare this shift' })).toHaveCount(0);
  await page.getByTestId('enter-orison').click();
  await expect(page.locator('.shift-brief')).toContainText('transmitted all four of their names');
  await expect(page.locator('.route-focus')).toHaveCount(3);
  await expect(page.locator('.route-focus').first()).toContainText('VOW · DUTY REQUIRED');
  await page.getByTestId('route-0').click();
  await expect(page.getByTestId('mission-story')).toContainText('WHY THIS MISSION MATTERS');
  await expect(page.getByTestId('mission-story')).toContainText('KNOWN HAZARD');
  await expect(page.getByTestId('mission-story').locator('.mission-counter')).toContainText('OBJECTION');
  await expect(page.getByTestId('mission-story').locator('.mission-counter')).not.toBeEmpty();
  await expect(page.getByTestId('mission-story').locator('.mission-focus')).toContainText('PERSONAL STAKE');
  await expect(page.getByTestId('mission-story').locator('.mission-focus')).toContainText('advance the vow');
  await expect(page.getByTestId('mission-story').locator('.mission-focus')).toContainText('Resting protects');
  await expect(page.locator('.staffing-crew-options .vow-duty')).toHaveCount(3);
  await expect(page.locator('.mission-checklist')).toContainText('VOW RESTING');
  await expect(page.getByTestId('tactical-read')).toContainText('HULL AFTER MISSION');
  await expect(page.getByTestId('tactical-read').locator('span').first().locator('b')).toHaveText(/\d+(?:–\d+)?\/12/);
  await expect(page.getByTestId('tactical-read')).toContainText('RATION AFTER ROOMS');
  const focusName = (await page.locator('.route-card.is-selected .route-focus').innerText()).split(' · ')[0]!.trim();
  const focusId = ({ 'MARA VEY': 'mara', 'TAMSIN ROOK': 'tamsin', 'ORIN VALE': 'orin', 'SABLE-9': 'sable' } as const)[focusName as 'MARA VEY' | 'TAMSIN ROOK' | 'ORIN VALE' | 'SABLE-9'];
  await page.getByTestId(`staff-0-${focusId}`).click();
  await expect(page.locator('.mission-checklist')).toContainText('VOW ON DUTY');
  await expect(page.getByTestId('tactical-read')).toContainText('This mission can advance');
});

test('guided planner explains missing steps and deploys with inline staffing', async ({ page }) => {
  await beginRun(page);
  const action = page.getByTestId('resolve-shift');
  await expect(action).toBeEnabled();
  await expect(action).toContainText('CHOOSE MISSION');
  await action.click();
  await expect(page.locator('.planner-status')).toHaveText('Choose one mission before deployment.');

  await page.getByTestId('route-0').click();
  await expect(action).toContainText('STAFF 3');
  await page.getByTestId('staff-0-mara').click();
  await expect(page.getByTestId('staff-room-0')).toContainText('provision +2');
  await page.getByTestId('staff-1-tamsin').click();
  await expect(page.getByTestId('staff-room-1')).toContainText('alloy +5');
  await page.getByTestId('staff-2-orin').click();
  await expect(page.locator('.mission-checklist')).toContainText('ROOMS 3/3');
  await expect(action).toContainText('DEPLOY MISSION');
  await action.click();
  await expect(page.getByTestId('event-panel')).toBeVisible();
  await expect(page.getByTestId('shift-report')).toContainText('What your plan did');
  await expect(page.getByTestId('shift-report')).toContainText('Heart Engine: +2 provisions.');
  await expect(page.getByTestId('shift-report')).toContainText('Deep Drill: +5 alloy.');
  await expect(page.getByTestId('shift-report')).toContainText('advances a vow to');
  const eventTitle = await page.getByTestId('event-panel').getByRole('heading').innerText();
  await page.locator('[data-testid^="event-choice-"]:enabled').first().click();
  await expect(page.getByTestId('decision-echo')).toContainText(eventTitle);
  await expect(page.getByTestId('decision-echo').locator('blockquote')).not.toBeEmpty();
  const aftermath = await page.getByTestId('decision-echo').locator('blockquote').innerText();
  await expect(page.getByRole('heading', { name: 'Prepare this shift' })).toBeVisible();
  await expect(page.locator('.planner-step-heading small')).toHaveCount(0);
  await openRunMenu(page);
  await expect(page.getByTestId('expedition-journal')).toContainText(eventTitle);
  await expect(page.getByTestId('expedition-journal')).toContainText(aftermath);
});

test('crew cards expose actionable vows, trust, pressure, and signatures', async ({ page }) => {
  await beginRun(page);
  await page.evaluate(() => {
    const state = window.__LODE_CHOIR__?.getState();
    if (!state) throw new Error('Test hook unavailable.');
    const mara = state.crew.find((crew) => crew.id === 'mara');
    if (!mara) throw new Error('Mara unavailable.');
    mara.vowProgress = 2;
    mara.loyalty = 3;
    mara.signatureUnlocked = true;
    mara.strain = 4;
    window.__LODE_CHOIR__?.refresh();
  });
  const card = page.getByTestId('crew-mara').locator('..');
  await expect(card.locator('.crew-arc')).toContainText('VOW');
  await expect(card.locator('.crew-arc')).toContainText('2/3');
  await expect(card.locator('.crew-arc')).toContainText('TRUST');
  await expect(card.locator('.crew-arc')).toContainText('SIGNATURE ACTIVE');
  await expect(card.locator('.crew-readout')).toContainText('PRESSURED · BONUS OFF');
  await card.getByText('Open dossier').click();
  await expect(card).toContainText('Advance by completing a mission without hull damage.');
  await expect(card).toContainText('Mara gains strain when the crew abandons a refuge.');
  await expect(card).toContainText('Holdfast: Mara adds 2 extra protection');
});

test('the tactical read warns when a selected mission can destroy Orison', async ({ page }) => {
  await beginRun(page);
  await page.evaluate(() => {
    const state = window.__LODE_CHOIR__?.getState();
    if (!state) throw new Error('Test hook unavailable.');
    state.integrity = 1;
    state.routeOffers[0]!.routeId = 'rift_red_quiet';
    window.__LODE_CHOIR__?.command({ type: 'select_route', instanceId: state.routeOffers[0]!.instanceId });
  });
  await expect(page.getByTestId('tactical-read').locator('span').first()).toHaveClass(/is-danger/);
  await expect(page.getByTestId('tactical-read').locator('span').first().locator('b')).toContainText('0/12');
  await expect(page.getByTestId('tactical-read')).toContainText('This plan can destroy Orison');
});

test('built rooms open a visual inspector with level-specific crew tradeoffs', async ({ page }) => {
  await beginRun(page);
  await page.getByTestId('room-0').click();
  const inspector = page.getByTestId('room-inspector');
  await expect(inspector).toBeVisible();
  await expect(inspector.getByRole('heading', { name: 'Heart Engine' })).toBeVisible();
  await expect(inspector.locator('.inspector-machine')).toBeVisible();
  await expect(inspector).toContainText('CHAMBER 01 // LEVEL 1');
  await expect(inspector).toContainText('6 alloy to reach level 2.');
  await expect(inspector.locator('.specialist-matrix article')).toHaveCount(4);
  await expect(inspector).toContainText('Mara stretches the ration yield.');
  await expect(inspector).toContainText('Sable cannot rest here.');
  const inspectorScan = await new AxeBuilder({ page }).include('[data-testid="room-inspector"]').analyze();
  expect(inspectorScan.violations, JSON.stringify(inspectorScan.violations, null, 2)).toEqual([]);
  await page.getByRole('button', { name: 'Close room inspection' }).click();
  await expect(inspector).toHaveCount(0);

  await page.evaluate(() => {
    const state = window.__LODE_CHOIR__?.getState();
    if (!state) throw new Error('Test hook unavailable.');
    state.phase = 'development';
    state.shift = 2;
    state.resources.alloy = 3;
    state.developmentChoices = ['heart_engine', 'deep_drill', 'ward_array', 'foundry', 'infirmary', 'resonance_chamber'];
    window.__LODE_CHOIR__?.refresh();
  });
  await expect(page.getByTestId('room-3')).toHaveClass(/is-selected/);
  await expect(page.locator('.citadel-caption')).toContainText('sealed chamber for new construction');
  await page.getByTestId('room-0').click();
  await expect(page.getByTestId('room-inspector')).toBeVisible();
  await page.getByRole('button', { name: 'Close room inspection' }).click();
  await expect(page.getByTestId('room-3')).toHaveClass(/is-selected/);
});

test('a pasted expedition seed starts the matching signal', async ({ page }) => {
  const seedInput = page.getByRole('textbox', { name: 'Expedition seed' });
  await seedInput.fill('  PASTED-CHALLENGE  ');
  await seedInput.blur();
  await expect(seedInput).toHaveValue('PASTED-CHALLENGE');
  await page.getByTestId('new-run').click();
  await expect(page.locator('.loadout-footer')).toContainText('PASTED-CHALLENGE');
  await page.getByTestId('begin-descent').click();
  expect(await page.evaluate(() => window.__LODE_CHOIR__?.getState()?.seed)).toBe('PASTED-CHALLENGE');
});

test('visible controls carry a complete expedition through all seven shifts', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Expedition seed' }).fill('UI-FULL-0');
  await beginRun(page);
  const crewOrder = ['mara', 'orin', 'sable', 'tamsin'];
  const moduleOrder = ['ward_array', 'infirmary', 'heart_engine', 'deep_drill', 'resonance_chamber', 'foundry'];

  for (let step = 0; step < 40; step += 1) {
    const state = await page.evaluate(() => window.__LODE_CHOIR__?.getState());
    if (!state) throw new Error('Test hook unavailable.');
    if (state.status !== 'playing') break;

    if (state.phase === 'planning') {
      const notesNeeded = Math.max(0, 3 - state.heartNotes);
      const urgent = state.shift >= 8 - notesNeeded;
      const ranked = state.routeOffers.map((offer, index) => {
        const route = ROUTES.find((candidate) => candidate.id === offer.routeId)!;
        const rewards = Object.values(route.baseRewards).reduce((sum, value) => sum + (value ?? 0), 0);
        return { index, score: (urgent ? route.noteProgress * 20 : route.noteProgress * 4) + rewards - route.hazard * 4 };
      }).sort((left, right) => right.score - left.score);
      await page.getByTestId(`route-${ranked[0]!.index}`).click();

      const activeCrew = state.crew
        .filter((crew) => crew.incapacitatedUntil <= state.shift)
        .sort((left, right) => crewOrder.indexOf(left.id) - crewOrder.indexOf(right.id));
      const modules = [...state.modules].sort((left, right) => moduleOrder.indexOf(left.id) - moduleOrder.indexOf(right.id));
      for (let index = 0; index < Math.min(3, activeCrew.length, modules.length); index += 1) {
        await page.getByTestId(`crew-${activeCrew[index]!.id}`).click();
        await page.getByTestId(`room-${modules[index]!.slot}`).click();
      }
      await page.getByTestId('resolve-shift').click();
    } else if (state.phase === 'event') {
      await page.locator('[data-testid^="event-choice-"]:enabled').first().click();
    } else if (state.phase === 'development') {
      await page.getByRole('button', { name: 'SAVE ALLOY AND CONTINUE' }).click();
    } else if (state.phase === 'finale') {
      await page.getByTestId('ending-seal').click();
    }
  }

  const completed = await page.evaluate(() => window.__LODE_CHOIR__?.getState());
  expect(completed?.status).toBe('won');
  expect(completed?.shift).toBe(7);
  expect(completed?.ending).toBe('seal');
  await expect(page.getByTestId('completion-panel')).toContainText('Seal the Deep');
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
  await page.locator('.leader-options').getByRole('button', { name: /Sable-9/ }).click();
  await expect(page.getByTestId('leader-post')).toContainText('Sable-9');
  await expect(page.locator('.route-card.is-selected')).toContainText('Foreseen:');
  await expect(page.locator('.route-card.is-selected .route-forecast')).toContainText('RATION −2');
  await page.getByRole('button', { name: /Recall Sable-9/i }).click();
  await expect(page.locator('.route-card.is-selected')).not.toContainText('Foreseen:');
  await page.getByTestId('crew-sable').click();
  await page.locator('.leader-options').getByRole('button', { name: /Sable-9/ }).click();

  await expect(page.getByTestId('resolve-shift')).toBeEnabled();
  await page.getByTestId('resolve-shift').click();
  await expect(page.getByTestId('event-panel').or(page.getByTestId('development-panel')).or(page.getByTestId('finale-panel')).or(page.getByRole('heading', { name: 'Prepare this shift' }))).toBeVisible();
});

test('autosave can resume and corrupted saves fail safely', async ({ page }) => {
  await beginRun(page);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('lode_choir_autosave_v1'))).not.toBeNull();
  await returnToTitle(page);
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
    const mara = state.crew.find((crew) => crew.id === 'mara')!;
    mara.vowProgress = 3;
    mara.loyalty = 3;
    mara.signatureUnlocked = true;
    mara.scar = 'The Heart-Lode answered in her own voice.';
    window.__LODE_CHOIR__?.refresh();
  });
  await expect(page.getByTestId('finale-signal').locator('span')).toHaveCount(3);
  await expect(page.getByTestId('finale-signal')).toContainText('ORISON, YOU CARRIED OUR DOOR WITH YOU');
  await page.getByTestId('ending-harmonize').click();
  await expect(page.getByTestId('completion-panel')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Join the Choir' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Join the Choir' })).toBeFocused();
  await expect(page.getByTestId('ending-story').locator('.ending-crew-codas article')).toHaveCount(4);
  await expect(page.getByTestId('ending-story').locator('article').filter({ hasText: 'Mara Vey' })).toContainText('VOW KEPT · TRUST 3');
  await expect(page.getByTestId('ending-story')).toContainText('Mara adds Vesper');
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
  await expect.poll(() => page.evaluate(() => localStorage.getItem('copied-expedition-report'))).toContain('mode=standard');
  await expect(page.locator('.feedback-stack .feedback')).toHaveCount(0);
  const completedSeed = await page.evaluate(() => window.__LODE_CHOIR__?.getState()?.seed);
  await page.getByRole('button', { name: 'Open Chronicle' }).click();
  await expect(page.getByRole('heading', { name: 'Recent expeditions' })).toBeVisible();
  await expect(page.locator('.chronicle-summary')).toContainText('1/3 recorded endings');
  await expect(page.locator('.chronicle-summary')).toContainText('1/12 lore fragments');
  await expect(page.getByTestId('chronicle-crew').locator('article')).toHaveCount(4);
  await expect(page.getByTestId('chronicle-crew').locator('article').filter({ hasText: 'Mara Vey' })).toContainText('1 vows kept · 1 signatures awakened · 1 scars carried · best trust 3');
  await expect(page.locator('.run-history').first()).toContainText(completedSeed!);
  await expect(page.locator('.run-history').first()).toContainText('CONCORDANT');
  await expect(page.locator('.run-history').first().locator('.run-crew-line > span')).toHaveCount(4);
  await expect(page.locator('.run-history').first().locator('.run-crew-line > span').filter({ hasText: 'Mara Vey' })).toContainText('VOW 3/3 · TRUST 3 · SIGNATURE · SCAR');
  await page.getByRole('button', { name: /RETURN/ }).click();
  await page.getByRole('button', { name: 'Start another expedition' }).click();
  await expect(page.getByRole('heading', { name: 'Choose starting equipment' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /Vesper Tuning Fork/i })).toBeEnabled();
});

test('a shared URL prepares the exact deterministic signal and contract', async ({ page }) => {
  await page.goto('/?seed=SHARED-SIGNAL&mode=black_descent&no-sw=1');
  await expect(page.getByRole('textbox', { name: 'Expedition seed' })).toHaveValue('SHARED-SIGNAL');
  await page.getByTestId('new-run').click();
  await expect(page.locator('.loadout-footer')).toContainText('SHARED-SIGNAL');
  await expect(page.getByRole('radio', { name: /Black Descent/i })).toBeChecked();
  await page.getByTestId('begin-descent').click();
  expect(await page.evaluate(() => window.__LODE_CHOIR__?.getState()?.seed)).toBe('SHARED-SIGNAL');
  expect(await page.evaluate(() => window.__LODE_CHOIR__?.getState()?.runMode)).toBe('black_descent');

  await page.goto('/?seed=SAFE-SIGNAL&mode=counterfeit&no-sw=1');
  await page.getByTestId('new-run').click();
  await expect(page.getByRole('radio', { name: /^STANDARD DESCENT Standard$/i })).toBeChecked();
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
    await expect(page.getByRole('textbox', { name: 'Expedition seed' })).toHaveValue('OFFLINE-CHOIR');
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

  await openRunSettings(page);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __AUDIO_METRICS__: { stopped: number } }).__AUDIO_METRICS__.stopped)).toBe(3);
  await page.getByRole('slider', { name: 'Choir volume' }).fill('0');
  await page.getByRole('button', { name: /RETURN/ }).click();
  await resumeRun(page);
  await page.waitForTimeout(50);
  expect(await page.evaluate(() => (window as unknown as { __AUDIO_METRICS__: { started: number } }).__AUDIO_METRICS__.started)).toBe(3);

  await openRunSettings(page);
  await page.getByRole('slider', { name: 'Choir volume' }).fill('0.7');
  await page.getByRole('button', { name: /RETURN/ }).click();
  await resumeRun(page);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __AUDIO_METRICS__: { started: number } }).__AUDIO_METRICS__.started)).toBe(6);

  await openRunSettings(page);
  await page.getByText('Mute the choir').click();
  await page.getByRole('button', { name: /RETURN/ }).click();
  await resumeRun(page);
  expect(await page.evaluate(() => (window as unknown as { __AUDIO_METRICS__: { started: number } }).__AUDIO_METRICS__.started)).toBe(6);

  await openRunSettings(page);
  await page.getByText('Mute the choir').click();
  await page.getByRole('button', { name: /RETURN/ }).click();
  await resumeRun(page);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __AUDIO_METRICS__: { started: number; resumed: number } }).__AUDIO_METRICS__)).toMatchObject({ started: 9, resumed: 1 });
  await page.evaluate(() => {
    const state = window.__LODE_CHOIR__?.getState();
    if (!state) throw new Error('Test hook unavailable.');
    state.phase = 'finale';
    state.shift = 7;
    state.heartNotes = 3;
    window.__LODE_CHOIR__?.command({ type: 'choose_ending', endingId: 'harmonize' });
  });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __AUDIO_METRICS__: { stopped: number } }).__AUDIO_METRICS__.stopped)).toBeGreaterThanOrEqual(9);
});

test('validated progress backups preserve the active signal, Chronicle, and settings', async ({ page }) => {
  await beginRun(page);
  await page.getByTestId('route-0').click();
  const expected = await page.evaluate(() => {
    const state = window.__LODE_CHOIR__?.getState();
    return state ? { seed: state.seed, selectedRoute: state.selectedRoute } : null;
  });
  await openRunSettings(page);
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
  await expect(page.getByTestId('begin-descent')).toContainText('START BLACK DESCENT');
  const loadoutScan = await new AxeBuilder({ page }).analyze();
  expect(loadoutScan.violations, JSON.stringify(loadoutScan.violations, null, 2)).toEqual([]);
  await page.getByTestId('begin-descent').click();
  await page.getByTestId('enter-orison').click();

  let state = await page.evaluate(() => window.__LODE_CHOIR__?.getState());
  expect(state?.runMode).toBe('black_descent');
  expect(state?.integrity).toBe(11);
  expect(state?.resources).toEqual({ provisions: 3, alloy: 4, lumen: 1 });
  const modeIndicator = page.viewportSize()!.width <= 920 ? page.locator('.run-mode-mobile') : page.locator('.run-mode-badge');
  await expect(modeIndicator).toBeVisible();
  await expect(modeIndicator).toContainText('BLACK DESCENT');

  await returnToTitle(page);
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
  await page.getByRole('button', { name: 'Start another expedition' }).click();
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
  await expect(page.getByRole('heading', { name: 'Prepare this shift' })).toBeVisible();
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

test('the workshop preselects an open chamber and explains build affordability', async ({ page }) => {
  await beginRun(page);
  await page.evaluate(() => {
    const state = window.__LODE_CHOIR__?.getState();
    if (!state) throw new Error('Test hook unavailable.');
    state.phase = 'development';
    state.shift = 2;
    state.resources.alloy = 3;
    state.developmentChoices = ['heart_engine', 'deep_drill', 'ward_array', 'foundry', 'infirmary', 'resonance_chamber'];
    window.__LODE_CHOIR__?.refresh();
  });
  await expect(page.getByTestId('development-panel')).toContainText('Chamber 4 selected for construction.');
  await expect(page.getByTestId('room-3')).toHaveClass(/is-selected/);
  await expect(page.getByTestId('build-foundry')).toBeDisabled();
  await expect(page.getByTestId('build-foundry')).toHaveText('NEED 1 MORE ALLOY');
  await expect(page.getByTestId('build-infirmary')).toBeEnabled();
  await expect(page.getByTestId('build-infirmary')).toHaveText('BUILD IN CHAMBER 4');
  await expect(page.getByTestId('placement-foundry')).toContainText('HEART LINK');
  await page.locator('.slot-picker button').nth(1).click();
  await expect(page.getByTestId('placement-foundry')).toContainText('DRILL LINK');
  await expect(page.getByTestId('placement-infirmary')).toContainText('NO LINK BONUS');
  await page.locator('.slot-picker button').first().click();
  await page.getByTestId('build-infirmary').click();
  const state = await page.evaluate(() => window.__LODE_CHOIR__?.getState());
  expect(state?.modules.some((module) => module.id === 'infirmary' && module.slot === 3)).toBe(true);
  await expect(page.getByTestId('decision-echo')).toContainText('ORISON CHANGED');
  await expect(page.getByTestId('decision-echo')).toContainText('Mercy Berth online');
  await expect(page.getByTestId('decision-echo')).not.toContainText('Additional growth trays');
  await expect(page.getByTestId('decision-echo')).toContainText('A second pressure berth opens');
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
  await expect(page.getByRole('heading', { name: 'Choose starting equipment' })).toBeVisible();
  await expect(page.locator('.relic-card.is-locked input')).toHaveCount(3);
  await expect(page.locator('.relic-card.is-locked input:not(:disabled)')).toHaveCount(0);
  await page.getByTestId('begin-descent').click();
  await page.getByTestId('enter-orison').click();
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
  const prologueScan = await new AxeBuilder({ page }).analyze();
  expect(prologueScan.violations, JSON.stringify(prologueScan.violations, null, 2)).toEqual([]);
  await page.getByTestId('enter-orison').click();
  const planningScan = await new AxeBuilder({ page }).analyze();
  expect(planningScan.violations, JSON.stringify(planningScan.violations, null, 2)).toEqual([]);
});

test('decision text remains visible without horizontal overflow at supported widths', async ({ page }) => {
  await beginRun(page);
  await page.getByTestId('route-0').click();
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: width < 800 ? 844 : 900 });
    const report = await page.evaluate(() => ({
      horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
      clipped: [...document.querySelectorAll<HTMLElement>('body *')].flatMap((element) => {
        const text = element.textContent?.trim();
        if (!text || element.children.length > 0 || element.classList.contains('sr-only') || element.getClientRects().length === 0) return [];
        const clipped = element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1;
        return clipped ? [{ tag: element.tagName, className: element.className, text: text.slice(0, 100) }] : [];
      }),
    }));
    expect(report.horizontalOverflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(0);
    expect(report.clipped, `clipped text at ${width}px: ${JSON.stringify(report.clipped)}`).toEqual([]);
  }
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
    await page.getByTestId('enter-orison').click();
  };
  const returnForAnother = async () => returnToTitle(page);

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
