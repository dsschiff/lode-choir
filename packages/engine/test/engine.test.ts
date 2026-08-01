import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCommand,
  createLegacyState,
  createRun,
  deserialize,
  deserializeLegacy,
  legalCommands,
  recordLegacyRun,
  replay,
  selectGameView,
  serialize,
  serializeLegacy,
  type GameState,
} from '../src/index.ts';
import { playRun } from './helpers.ts';

function readyFirstShift(seed = 'ready'): GameState {
  let state = createRun({ seed });
  state = applyCommand(state, { type: 'select_route', instanceId: state.routeOffers[0]!.instanceId }).state;
  state = applyCommand(state, { type: 'assign_crew', crewId: 'mara', slot: 2 }).state;
  state = applyCommand(state, { type: 'assign_crew', crewId: 'tamsin', slot: 1 }).state;
  state = applyCommand(state, { type: 'assign_crew', crewId: 'sable', slot: 0 }).state;
  return state;
}

test('createRun is deterministic and seeds three distinct route offers', () => {
  const left = createRun({ seed: 'the-same-song' });
  const right = createRun({ seed: 'the-same-song' });
  assert.deepEqual(left, right);
  assert.equal(left.shift, 1);
  assert.equal(left.phase, 'planning');
  assert.equal(new Set(left.routeOffers.map((offer) => offer.routeId)).size, 3);
  assert.equal(left.modules.length, 3);
  assert.equal(left.crew.length, 4);
});

test('commands are immutable transitions and reject illegal actions', () => {
  const initial = createRun({ seed: 'immutability' });
  const before = structuredClone(initial);
  const selected = applyCommand(initial, { type: 'select_route', instanceId: initial.routeOffers[0]!.instanceId }).state;
  assert.deepEqual(initial, before);
  assert.equal(selected.commandTrace.length, 1);
  assert.throws(() => applyCommand(initial, { type: 'resolve_shift' }), /Illegal command/);
  assert.throws(() => applyCommand(initial, { type: 'assign_crew', crewId: 'mara', slot: 8 }), /Illegal command/);
});

test('assignments move crew, displace occupants, and Sable reveals complications', () => {
  let state = createRun({ seed: 'assignment' });
  state = applyCommand(state, { type: 'assign_crew', crewId: 'mara', slot: 0 }).state;
  state = applyCommand(state, { type: 'assign_crew', crewId: 'mara', slot: 1 }).state;
  assert.equal(state.modules.find((module) => module.slot === 0)!.assignedCrew, null);
  assert.equal(state.modules.find((module) => module.slot === 1)!.assignedCrew, 'mara');
  state.modules.push({ id: 'resonance_chamber', slot: 3, level: 1, assignedCrew: null });
  state = applyCommand(state, { type: 'assign_crew', crewId: 'sable', slot: 3 }).state;
  assert.ok(state.routeOffers.every((offer) => offer.revealed));
});

test('a fourth crew member can replace an assignment but cannot overstaff the citadel', () => {
  let state = readyFirstShift('three-voices');
  assert.equal(selectGameView(state).canResolveShift, true);
  assert.equal(legalCommands(state).some((command) => command.type === 'assign_crew' && command.crewId === 'orin' && command.slot === 3), false);
  state = applyCommand(state, { type: 'assign_crew', crewId: 'orin', slot: 0 }).state;
  assert.equal(state.modules.filter((module) => module.assignedCrew).length, 3);
  assert.equal(state.modules.find((module) => module.slot === 0)!.assignedCrew, 'orin');
  assert.equal(selectGameView(state).canResolveShift, true);
});

test('a resolved shift produces resources, route progress, story, and a clean next planning phase', () => {
  const ready = readyFirstShift('resolution');
  assert.equal(selectGameView(ready).canResolveShift, true);
  const result = applyCommand(ready, { type: 'resolve_shift' });
  assert.ok(result.events.some((event) => event.kind === 'room'));
  assert.ok(result.events.some((event) => event.kind === 'route'));
  assert.equal(result.state.phase, 'event');
  assert.ok(result.state.activeEvent);
  const advanced = applyCommand(result.state, { type: 'choose_event', choiceIndex: 0 }).state;
  assert.equal(advanced.shift, 2);
  assert.equal(advanced.phase, 'planning');
  assert.equal(advanced.modules.every((module) => module.assignedCrew === null), true);
  assert.equal(advanced.routeOffers.length, 3);
});

test('development breaks offer legal builds or upgrades and consume alloy', () => {
  let state = readyFirstShift('development');
  state = applyCommand(state, { type: 'resolve_shift' }).state;
  state = applyCommand(state, { type: 'choose_event', choiceIndex: 0 }).state;
  state = applyCommand(state, { type: 'select_route', instanceId: state.routeOffers[0]!.instanceId }).state;
  state = applyCommand(state, { type: 'assign_crew', crewId: 'mara', slot: 2 }).state;
  state = applyCommand(state, { type: 'assign_crew', crewId: 'tamsin', slot: 1 }).state;
  state = applyCommand(state, { type: 'assign_crew', crewId: 'orin', slot: 0 }).state;
  state = applyCommand(state, { type: 'resolve_shift' }).state;
  state = applyCommand(state, { type: 'choose_event', choiceIndex: 0 }).state;
  assert.equal(state.phase, 'development');
  const commands = legalCommands(state);
  assert.ok(commands.some((command) => command.type === 'build_module' || command.type === 'upgrade_module'));
  assert.ok(commands.some((command) => command.type === 'skip_development'));
  const alloy = state.resources.alloy;
  const development = commands.find((command) => command.type === 'build_module' || command.type === 'upgrade_module')!;
  state = applyCommand(state, development).state;
  assert.equal(state.phase, 'planning');
  assert.equal(state.shift, 3);
  assert.ok(state.resources.alloy < alloy);
});

test('development may be deferred without spending alloy', () => {
  let state = readyFirstShift('defer-development');
  for (let shift = 1; shift <= 2; shift += 1) {
    state = applyCommand(state, { type: 'resolve_shift' }).state;
    if (state.phase === 'event') state = applyCommand(state, legalCommands(state)[0]!).state;
    if (shift === 1) {
      state = applyCommand(state, { type: 'select_route', instanceId: state.routeOffers[0]!.instanceId }).state;
      state = applyCommand(state, { type: 'assign_crew', crewId: 'mara', slot: 2 }).state;
      state = applyCommand(state, { type: 'assign_crew', crewId: 'tamsin', slot: 1 }).state;
      state = applyCommand(state, { type: 'assign_crew', crewId: 'orin', slot: 0 }).state;
    }
  }
  assert.equal(state.phase, 'development');
  const alloy = state.resources.alloy;
  state = applyCommand(state, { type: 'skip_development' }).state;
  assert.equal(state.resources.alloy, alloy);
  assert.equal(state.shift, 3);
});

test('save round trips exactly, corrupted saves fail safely, and replay is exact', () => {
  const state = readyFirstShift('save-replay');
  assert.deepEqual(deserialize(serialize(state)), state);
  assert.throws(() => deserialize('{broken'), /valid JSON/);
  assert.throws(() => deserialize('{}'), /supported/);
  assert.deepEqual(replay(state.seed, state.commandTrace), state);
  const relicRun = createRun({ seed: 'relic-replay', relicId: 'heart_splinter' });
  assert.equal(relicRun.resources.alloy, 7);
  assert.equal(relicRun.crew.find((crew) => crew.id === 'tamsin')!.strain, 1);
  assert.deepEqual(replay({ seed: relicRun.seed, relicId: 'heart_splinter' }, relicRun.commandTrace), relicRun);
});

test('event choices cannot spend resources the run does not have', () => {
  let state = readyFirstShift('choice-cost');
  state = applyCommand(state, { type: 'resolve_shift' }).state;
  const event = selectGameView(state).activeStoryEvent!;
  const costlyIndex = event.choices.findIndex((choice) =>
    Object.values(choice.resourceDelta ?? {}).some((delta) => (delta ?? 0) < 0));
  if (costlyIndex < 0) return;
  state.resources.alloy = 0;
  state.resources.lumen = 0;
  state.resources.provisions = 0;
  assert.equal(
    legalCommands(state).some((command) => command.type === 'choose_event' && command.choiceIndex === costlyIndex),
    false,
  );
  assert.throws(() => applyCommand(state, { type: 'choose_event', choiceIndex: costlyIndex }), /Illegal command/);
});

test('version-zero raw saves migrate missing trace-era fields', () => {
  const current = createRun({ seed: 'migration' });
  const old = { ...current, version: 0 } as Record<string, unknown>;
  delete old.developmentChoices;
  const migrated = deserialize(JSON.stringify(old));
  assert.equal(migrated.version, 1);
  assert.equal(migrated.seed, 'migration');
  assert.deepEqual(migrated.developmentChoices, []);
  assert.deepEqual(migrated.routeOffers, current.routeOffers);
});

test('full runs terminate and winning runs update legacy without mutating it', () => {
  const run = playRun(createRun({ seed: 'win-4' }), 'balanced');
  assert.equal(run.phase, 'complete');
  assert.equal(run.status, 'won');
  const legacy = createLegacyState();
  const updated = recordLegacyRun(legacy, run);
  assert.deepEqual(legacy, createLegacyState());
  assert.equal(updated.runsCompleted, 1);
  assert.equal(updated.endings.length, 1);
  assert.equal(updated.relics.length, 1);
  assert.ok(['heart_splinter', 'vesper_tuning_fork', 'oathkeepers_latch'].includes(updated.relics[0]!));
  assert.ok(updated.lore.includes('orison_manifest'));
  assert.deepEqual(deserializeLegacy(serializeLegacy(updated)), updated);
});

test('integrity collapse is an explicit terminal loss', () => {
  let state = createRun({ seed: 'collapse' });
  const riskiest = [...selectGameView(state).routes].sort((left, right) => right.definition.hazard - left.definition.hazard)[0]!;
  state = applyCommand(state, { type: 'select_route', instanceId: riskiest.instanceId }).state;
  state = applyCommand(state, { type: 'assign_crew', crewId: 'mara', slot: 2 }).state;
  state = applyCommand(state, { type: 'assign_crew', crewId: 'tamsin', slot: 1 }).state;
  state = applyCommand(state, { type: 'assign_crew', crewId: 'sable', slot: 0 }).state;
  state.integrity = 1;
  state.modules.find((module) => module.id === 'ward_array')!.level = 0;
  const result = applyCommand(state, { type: 'resolve_shift' }).state;
  assert.equal(result.status, 'lost');
  assert.equal(result.phase, 'complete');
  assert.match(result.endingText!, /folds inward/);
  assert.deepEqual(legalCommands(result), []);
});

test('strain creates a scar and vow-driven loyalty unlocks signatures', () => {
  let state = createRun({ seed: 'scar-and-signature' });
  const safest = [...selectGameView(state).routes].sort((left, right) => left.definition.hazard - right.definition.hazard)[0]!;
  state = applyCommand(state, { type: 'select_route', instanceId: safest.instanceId }).state;
  state.crew.find((crew) => crew.id === 'tamsin')!.strain = 5;
  state.crew.find((crew) => crew.id === 'mara')!.loyalty = 2;
  state.crew.find((crew) => crew.id === 'mara')!.vowProgress = 1;
  state = applyCommand(state, { type: 'assign_crew', crewId: 'mara', slot: 2 }).state;
  state = applyCommand(state, { type: 'assign_crew', crewId: 'tamsin', slot: 1 }).state;
  state = applyCommand(state, { type: 'assign_crew', crewId: 'sable', slot: 0 }).state;
  state = applyCommand(state, { type: 'resolve_shift' }).state;
  assert.equal(state.crew.find((crew) => crew.id === 'mara')!.signatureUnlocked, true);
  const tamsin = state.crew.find((crew) => crew.id === 'tamsin')!;
  assert.equal(tamsin.strain, 6);
  assert.ok(tamsin.scar);
  assert.equal(tamsin.incapacitatedUntil, 3);
});

test('shift seven opens all three endings with enough Notes and otherwise loses', () => {
  const prepare = (heartNotes: number) => {
    let state = readyFirstShift(`finale-${heartNotes}`);
    state.shift = 7;
    state.heartNotes = heartNotes;
    state.modules.find((module) => module.id === 'ward_array')!.level = 99;
    return applyCommand(state, { type: 'resolve_shift' }).state;
  };
  const finale = prepare(3);
  assert.equal(finale.phase, 'finale');
  assert.equal(legalCommands(finale).filter((command) => command.type === 'choose_ending').length, 3);
  for (const endingId of ['harvest', 'harmonize', 'seal'] as const) {
    const ended = applyCommand(finale, { type: 'choose_ending', endingId }).state;
    assert.equal(ended.status, 'won');
    assert.equal(ended.ending, endingId);
    assert.ok(ended.endingText);
    assert.match(ended.endingText, /Mara/);
    assert.match(ended.endingText, /Tamsin/);
    assert.match(ended.endingText, /Orin/);
    assert.match(ended.endingText, /Sable/);
  }
  const deadline = prepare(0);
  assert.equal(deadline.status, 'lost');
  assert.match(deadline.endingText!, /Seven shifts/);
});
