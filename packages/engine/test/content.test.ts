import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { CREW, ENDINGS, LORE, MODULES, RELICS, ROUTES, STORY_EVENTS } from '../src/index.ts';

function assertUniqueIds(records: ReadonlyArray<{ id: string }>, label: string): void {
  const ids = records.map((record) => record.id);
  assert.equal(new Set(ids).size, ids.length, `${label} IDs must be unique`);
}

test('content tables meet the vertical-slice inventory', () => {
  assert.equal(CREW.length, 4);
  assert.equal(MODULES.length, 6);
  assert.ok(ROUTES.length >= 12);
  assert.ok(STORY_EVENTS.length >= 10);
  assert.equal(ENDINGS.length, 3);
  assert.equal(RELICS.length, 3);
  assert.ok(LORE.length >= 12);
});

test('all content IDs are unique within their tables', () => {
  assertUniqueIds(CREW, 'crew');
  assertUniqueIds(MODULES, 'module');
  assertUniqueIds(ROUTES, 'route');
  assertUniqueIds(STORY_EVENTS, 'event');
  assertUniqueIds(ENDINGS, 'ending');
  assertUniqueIds(RELICS, 'relic');
  assertUniqueIds(LORE, 'lore');
});

test('routes cover every kind with distinct risk and reward profiles', () => {
  assert.ok(ROUTES.every((route) => route.storyLead.trim().length >= 30), 'every route needs a concrete story lead');
  for (const kind of ['vein', 'ruin', 'refuge', 'rift'] as const) {
    const routes = ROUTES.filter((route) => route.kind === kind);
    assert.ok(routes.length >= 3, `${kind} needs at least three routes`);
    assert.ok(new Set(routes.map((route) => route.hazard)).size >= 2, `${kind} hazards must vary`);
    assert.ok(
      new Set(routes.map((route) => JSON.stringify([route.baseRewards, route.noteProgress]))).size >= 3,
      `${kind} rewards must create opportunity costs`,
    );
  }
});

test('story events offer tagged, state-changing choices', () => {
  for (const event of STORY_EVENTS) {
    assert.ok(event.tags.length > 0, `${event.id} needs a route or story tag`);
    assert.ok(event.choices.length >= 2 && event.choices.length <= 3, `${event.id} needs two or three choices`);

    for (const choice of event.choices) {
      const changesState =
        choice.resourceDelta !== undefined ||
        choice.integrityDelta !== undefined ||
        choice.loyaltyDelta !== undefined ||
        choice.strainDelta !== undefined ||
        choice.noteDelta !== undefined;
      assert.ok(changesState, `${event.id}/${choice.label} needs a mechanical consequence`);
      assert.ok(choice.consequence.length > 0, `${event.id}/${choice.label} needs consequence copy`);
    }
  }
});

test('crew vows explain the action that advances them', () => {
  for (const crew of CREW) {
    assert.ok(crew.vow.length >= 12, `${crew.id} needs a concrete vow`);
    assert.match(crew.vowAction, /^Advance /, `${crew.id} needs an actionable vow rule`);
  }
});

test('every story decision carries a concrete aftermath into the next phase', () => {
  for (const event of STORY_EVENTS) for (const choice of event.choices) {
    assert.ok(choice.aftermath && choice.aftermath.length >= 45, `${event.id}/${choice.label} needs authored aftermath`);
  }
});

test('every route can surface authored story and every lore key is reachable', () => {
  const routeTags = new Set(ROUTES.map((route) => route.storyTag));
  const eventTags = new Set(STORY_EVENTS.flatMap((event) => event.tags));
  for (const route of ROUTES) {
    assert.ok(eventTags.has(route.storyTag), `${route.id} needs an event keyed to ${route.storyTag}`);
  }
  for (const lore of LORE) {
    assert.ok(lore.unlockTag === 'first_run' || routeTags.has(lore.unlockTag), `${lore.id} has unreachable lore tag ${lore.unlockTag}`);
  }
});

test('every ending unlocks a defined relic', () => {
  const relicIds = new Set(RELICS.map((relic) => relic.id));
  for (const ending of ENDINGS) {
    assert.ok(relicIds.has(ending.unlockRelicId), `${ending.id} must unlock a real relic`);
  }
});

test('editorial changes do not alter content IDs, unlocks, or mechanical values', () => {
  const mechanicalContent = {
    crew: CREW.map(({ id }) => id),
    modules: MODULES.map(({ id, buildCost }) => ({ id, buildCost })),
    routes: ROUTES.map(({ id, kind, baseRewards, hazard, noteProgress, storyTag }) => ({ id, kind, baseRewards, hazard, noteProgress, storyTag })),
    events: STORY_EVENTS.map(({ id, tags, choices }) => ({
      id,
      tags,
      choices: choices.map(({ resourceDelta, integrityDelta, crewId, loyaltyDelta, strainDelta, noteDelta }) => ({
        resourceDelta,
        integrityDelta,
        crewId,
        loyaltyDelta,
        strainDelta,
        noteDelta,
      })),
    })),
    endings: ENDINGS.map(({ id, unlockRelicId }) => ({ id, unlockRelicId })),
    relics: RELICS.map(({ id }) => id),
    lore: LORE.map(({ id, unlockTag }) => ({ id, unlockTag })),
  };
  const digest = createHash('sha256').update(JSON.stringify(mechanicalContent)).digest('hex');
  assert.equal(digest, '43961b63fab53e74eedf934202e71f91c8bd9d3460431a16a2326d0c2128fd32');
});
