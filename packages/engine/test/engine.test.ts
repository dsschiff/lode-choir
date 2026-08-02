import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCommand,
  baseScoreRun,
  createLegacyState,
  createRun,
  deserialize,
  deserializeLegacy,
  forecastRoomAssignment,
  legalCommands,
  recordLegacyRun,
  replay,
  scoreBreakdown,
  scoreRun,
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
  const view = selectGameView(left);
  for (const route of view.routes) {
    assert.ok(route.forecast.hullDamageMin >= 0);
    assert.ok(route.forecast.hullDamageMax >= route.forecast.hullDamageMin);
    assert.equal(route.forecast.provisionCost, 1);
  }
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
  state = applyCommand(state, { type: 'select_route', instanceId: state.routeOffers[0]!.instanceId }).state;
  state = applyCommand(state, { type: 'assign_crew', crewId: 'sable', slot: 0 }).state;
  assert.ok(state.routeOffers.every((offer) => !offer.revealed));
  state = applyCommand(state, { type: 'assign_crew', crewId: 'sable', slot: 2 }).state;
  assert.equal(state.routeOffers[0]!.revealed, true);
  assert.equal(state.routeOffers.slice(1).every((offer) => !offer.revealed), true);
  state = applyCommand(state, { type: 'assign_crew', crewId: 'mara', slot: 2 }).state;
  state = applyCommand(state, { type: 'assign_crew', crewId: 'mara', slot: 1 }).state;
  assert.equal(state.modules.find((module) => module.slot === 2)!.assignedCrew, null);
  assert.equal(state.modules.find((module) => module.slot === 1)!.assignedCrew, 'mara');
  state.modules.push({ id: 'resonance_chamber', slot: 3, level: 1, assignedCrew: null });
  state = applyCommand(state, { type: 'assign_crew', crewId: 'sable', slot: 3 }).state;
  assert.ok(state.routeOffers.every((offer) => offer.revealed));
  state = applyCommand(state, { type: 'assign_crew', crewId: 'sable', slot: 0 }).state;
  assert.ok(state.routeOffers.every((offer) => !offer.revealed));
});

test('room forecasts expose exact specialist output without mutating the run', () => {
  const state = createRun({ seed: 'room-forecast' });
  const before = structuredClone(state);

  assert.deepEqual(forecastRoomAssignment(state, 0, 'orin'), {
    resources: { provisions: 1 },
    integrityRepair: 1,
    protection: 0,
    crewStrain: -1,
    allCrewStrain: 0,
    heartNotes: 0,
    alloyCost: 0,
    conditions: ['Orin repairs 1 hull while the Heart runs.'],
  });
  assert.equal(forecastRoomAssignment(state, 1, 'tamsin').resources.alloy, 5);
  assert.equal(forecastRoomAssignment(state, 2, 'mara').protection, 2);
  assert.deepEqual(state, before);

  const assigned = applyCommand(state, { type: 'assign_crew', crewId: 'orin', slot: 0 }).state;
  assert.deepEqual(selectGameView(assigned).modules[0]!.forecast, forecastRoomAssignment(assigned, 0, 'orin'));
});

test('starter rooms present tradeoffs instead of a strictly dominant crew assignment', () => {
  const state = createRun({ seed: 'room-tradeoffs' });
  const revealsMission = (forecast: ReturnType<typeof forecastRoomAssignment>) => forecast.conditions.some((condition) => condition.includes('Reveals')) ? 1 : 0;
  const utilityVector = (forecast: ReturnType<typeof forecastRoomAssignment>) => [
    forecast.resources.provisions ?? 0,
    forecast.resources.alloy ?? 0,
    forecast.resources.lumen ?? 0,
    forecast.integrityRepair,
    forecast.protection,
    -forecast.crewStrain,
    -forecast.allCrewStrain,
    revealsMission(forecast),
  ];
  const crewIds = ['mara', 'tamsin', 'orin', 'sable'] as const;
  for (const slot of [0, 1, 2]) {
    const vectors = crewIds.map((crewId) => ({ crewId, values: utilityVector(forecastRoomAssignment(state, slot, crewId)) }));
    for (const candidate of vectors) {
      for (const alternative of vectors) {
        if (candidate.crewId === alternative.crewId) continue;
        const weaklyBetter = candidate.values.every((value, index) => value >= alternative.values[index]!);
        const strictlyBetter = candidate.values.some((value, index) => value > alternative.values[index]!);
        assert.equal(weaklyBetter && strictlyBetter, false, `${candidate.crewId} strictly dominates ${alternative.crewId} in starter room ${slot}`);
      }
    }
  }
});

test('combined room and mission forecasts match the resolved resource and hull totals', () => {
  let state = createRun({ seed: 'forecast-resolution' });
  state = applyCommand(state, { type: 'select_route', instanceId: state.routeOffers[0]!.instanceId }).state;
  state = applyCommand(state, { type: 'assign_crew', crewId: 'orin', slot: 0 }).state;
  state = applyCommand(state, { type: 'assign_crew', crewId: 'tamsin', slot: 1 }).state;
  state = applyCommand(state, { type: 'assign_crew', crewId: 'mara', slot: 2 }).state;

  const view = selectGameView(state);
  const selected = view.routes.find((route) => route.instanceId === state.selectedRoute)!;
  const roomForecasts = view.modules.map((module) => module.forecast!);
  const roomResource = (resource: 'provisions' | 'alloy' | 'lumen') => roomForecasts.reduce(
    (total, forecast) => total + (forecast.resources[resource] ?? 0) - (resource === 'alloy' ? forecast.alloyCost : 0),
    0,
  );
  const roomRepair = roomForecasts.reduce((total, forecast) => total + forecast.integrityRepair, 0);
  const resolved = applyCommand(state, { type: 'resolve_shift' }).state;

  for (const resource of ['provisions', 'alloy', 'lumen'] as const) {
    const missionReward = selected.forecast.rewards[resource] ?? 0;
    const missionCost = resource === 'provisions' ? selected.forecast.provisionCost : 0;
    assert.equal(resolved.resources[resource], state.resources[resource] + roomResource(resource) + missionReward - missionCost);
  }
  assert.equal(
    resolved.integrity,
    Math.max(0, Math.min(view.maxIntegrity, state.integrity + roomRepair) - selected.forecast.hullDamageMax),
  );
});

test('a personal mission advances its focus vow exactly once', () => {
  let state: GameState | null = null;
  let instanceId = '';
  for (let index = 0; index < 200 && !state; index += 1) {
    const candidate = createRun({ seed: `personal-route-${index}` });
    const route = selectGameView(candidate).routes.find((offer) => offer.definition.focusCrew === 'mara' && offer.definition.hazard <= 1);
    if (route) { state = candidate; instanceId = route.instanceId; }
  }
  assert.ok(state, 'expected a low-risk Mara mission within bounded seeds');
  state = applyCommand(state, { type: 'select_route', instanceId }).state;
  state = applyCommand(state, { type: 'assign_crew', crewId: 'tamsin', slot: 0 }).state;
  state = applyCommand(state, { type: 'assign_crew', crewId: 'orin', slot: 1 }).state;
  state = applyCommand(state, { type: 'assign_crew', crewId: 'mara', slot: 2 }).state;
  const result = applyCommand(state, { type: 'resolve_shift' });
  assert.equal(result.state.crew.find((crew) => crew.id === 'mara')!.vowProgress, 1);
  assert.equal(result.events.filter((event) => event.text === 'Mara Vey advances a vow to 1/3.').length, 1);
});

test('every starter-room crew permutation resolves to its displayed forecast', () => {
  const crewIds = ['mara', 'tamsin', 'orin', 'sable'] as const;
  for (const first of crewIds) for (const second of crewIds) for (const third of crewIds) {
    if (new Set([first, second, third]).size !== 3) continue;
    let state = createRun({ seed: `matrix-${first}-${second}-${third}` });
    state = applyCommand(state, { type: 'select_route', instanceId: state.routeOffers[0]!.instanceId }).state;
    state = applyCommand(state, { type: 'assign_crew', crewId: first, slot: 0 }).state;
    state = applyCommand(state, { type: 'assign_crew', crewId: second, slot: 1 }).state;
    state = applyCommand(state, { type: 'assign_crew', crewId: third, slot: 2 }).state;
    const view = selectGameView(state);
    const mission = view.routes.find((route) => route.instanceId === state.selectedRoute)!.forecast;
    const rooms = view.modules.map((module) => module.forecast!);
    const totalRoomResource = (resource: 'provisions' | 'alloy' | 'lumen') => rooms.reduce(
      (total, room) => total + (room.resources[resource] ?? 0) - (resource === 'alloy' ? room.alloyCost : 0),
      0,
    );
    const repair = rooms.reduce((total, room) => total + room.integrityRepair, 0);
    const strainBefore = state.crew.reduce((total, crew) => total + crew.strain, 0);
    const resolved = applyCommand(state, { type: 'resolve_shift' }).state;
    for (const resource of ['provisions', 'alloy', 'lumen'] as const) {
      const cost = resource === 'provisions' ? mission.provisionCost : 0;
      assert.equal(
        resolved.resources[resource],
        state.resources[resource] + totalRoomResource(resource) + (mission.rewards[resource] ?? 0) - cost,
        `${first}/${second}/${third} ${resource}`,
      );
    }
    assert.equal(resolved.integrity, Math.max(0, Math.min(view.maxIntegrity, state.integrity + repair) - mission.hullDamageMax));
    assert.equal(resolved.crew.reduce((total, crew) => total + crew.strain, 0) - strainBefore, mission.netCrewStrain);
  }
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

test('the fourth available crew member can lead the route without displacing chamber staff', () => {
  let state = createRun({ seed: 'route-leader' });
  state = applyCommand(state, { type: 'select_route', instanceId: state.routeOffers[0]!.instanceId }).state;
  state = applyCommand(state, { type: 'assign_crew', crewId: 'mara', slot: 0 }).state;
  state = applyCommand(state, { type: 'assign_crew', crewId: 'tamsin', slot: 1 }).state;
  state = applyCommand(state, { type: 'assign_crew', crewId: 'orin', slot: 2 }).state;
  assert.ok(legalCommands(state).some((command) => command.type === 'assign_route_leader' && command.crewId === 'sable'));
  state = applyCommand(state, { type: 'assign_route_leader', crewId: 'sable' }).state;
  assert.equal(state.routeLeader, 'sable');
  assert.equal(state.modules.filter((module) => module.assignedCrew).length, 3);
  const selected = state.routeOffers.find((offer) => offer.instanceId === state.selectedRoute)!;
  assert.equal(selected.revealed, true);
  state = applyCommand(state, { type: 'unassign_crew', crewId: 'sable' }).state;
  assert.ok(state.routeOffers.every((offer) => !offer.revealed));
  state = applyCommand(state, { type: 'assign_route_leader', crewId: 'sable' }).state;
  const ledForecast = selectGameView(state).routes.find((route) => route.instanceId === state.selectedRoute)!.forecast;
  assert.equal(ledForecast.provisionCost, 2);
  assert.equal(ledForecast.hullDamageMin, ledForecast.hullDamageMax);
  const alternate = state.routeOffers.find((offer) => offer.instanceId !== state.selectedRoute)!;
  state = applyCommand(state, { type: 'select_route', instanceId: alternate.instanceId }).state;
  assert.equal(state.routeLeader, null);
  state = applyCommand(state, { type: 'assign_route_leader', crewId: 'sable' }).state;
  const selectedView = selectGameView(state).routes.find((candidate) => candidate.instanceId === state.selectedRoute)!;
  const route = selectedView.definition;
  const forecast = selectedView.forecast;
  const integrityBefore = state.integrity;
  const strainBefore = state.crew.reduce((total, crew) => total + crew.strain, 0);
  state = applyCommand(state, { type: 'resolve_shift' }).state;
  assert.equal(state.routeLeader, null);
  assert.equal(integrityBefore - state.integrity, forecast.hullDamageMax);
  assert.equal(state.crew.reduce((total, crew) => total + crew.strain, 0) - strainBefore, forecast.netCrewStrain);
  assert.equal(state.resources.provisions, 4 + (route.baseRewards.provisions ?? 0));
  assert.equal(state.crew.find((crew) => crew.id === 'sable')!.strain, 1 + (route.hazard >= 4 ? 2 : route.hazard >= 2 ? 1 : 0));
});

test('route leadership stays optional when only three crew are available', () => {
  let state = createRun({ seed: 'short-handed' });
  state.crew.find((crew) => crew.id === 'sable')!.incapacitatedUntil = 2;
  state = applyCommand(state, { type: 'select_route', instanceId: state.routeOffers[0]!.instanceId }).state;
  assert.equal(legalCommands(state).some((command) => command.type === 'assign_route_leader'), false);
});

test('expedition leadership requires the extra ration', () => {
  let state = createRun({ seed: 'leader-ration' });
  state = applyCommand(state, { type: 'select_route', instanceId: state.routeOffers[0]!.instanceId }).state;
  state = applyCommand(state, { type: 'assign_crew', crewId: 'mara', slot: 0 }).state;
  state = applyCommand(state, { type: 'assign_crew', crewId: 'tamsin', slot: 1 }).state;
  state = applyCommand(state, { type: 'assign_crew', crewId: 'orin', slot: 2 }).state;
  state.resources.provisions = 1;
  assert.equal(legalCommands(state).some((command) => command.type === 'assign_route_leader'), false);
});

test('charted routes escrow lumen, swap freely, and return without RNG drift', () => {
  let economy = createRun({ seed: 'chart-economy' });
  economy = applyCommand(economy, { type: 'select_route', instanceId: economy.routeOffers[0]!.instanceId }).state;
  const first = economy.routeOffers[1]!.instanceId;
  const second = economy.routeOffers[2]!.instanceId;
  economy = applyCommand(economy, { type: 'reserve_route', instanceId: first }).state;
  assert.equal(economy.resources.lumen, 1);
  assert.equal(economy.reservedRoute, first);
  economy = applyCommand(economy, { type: 'reserve_route', instanceId: second }).state;
  assert.equal(economy.resources.lumen, 1);
  assert.equal(economy.reservedRoute, second);
  economy = applyCommand(economy, { type: 'clear_route_reservation' }).state;
  assert.equal(economy.resources.lumen, 2);
  economy = applyCommand(economy, { type: 'reserve_route', instanceId: first }).state;
  economy = applyCommand(economy, { type: 'select_route', instanceId: first }).state;
  assert.equal(economy.resources.lumen, 2);
  assert.equal(economy.reservedRoute, null);
  economy.resources.lumen = 0;
  assert.equal(legalCommands(economy).some((command) => command.type === 'reserve_route'), false);
  economy.shift = 7;
  economy.resources.lumen = 2;
  assert.equal(legalCommands(economy).some((command) => command.type === 'reserve_route'), false);

  let baseline = readyFirstShift('chart-carry');
  const chartedRoute = baseline.routeOffers.find((offer) => offer.instanceId !== baseline.selectedRoute)!;
  assert.equal(chartedRoute.revealed, false);
  let charted = applyCommand(baseline, { type: 'reserve_route', instanceId: chartedRoute.instanceId }).state;
  charted = applyCommand(charted, { type: 'resolve_shift' }).state;
  baseline = applyCommand(baseline, { type: 'resolve_shift' }).state;
  assert.equal(charted.reservedRoute, chartedRoute.instanceId);
  assert.deepEqual(deserialize(serialize(charted)), charted);
  assert.equal(charted.rngState, baseline.rngState);
  charted = applyCommand(charted, legalCommands(charted)[0]!).state;
  baseline = applyCommand(baseline, legalCommands(baseline)[0]!).state;
  assert.equal(charted.rngState, baseline.rngState);
  assert.equal(charted.reservedRoute, null);
  const returned = charted.routeOffers.filter((offer) => offer.routeId === chartedRoute.routeId);
  assert.equal(returned.length, 1);
  assert.equal(returned[0]!.carried, true);
  assert.equal(returned[0]!.hiddenComplication, chartedRoute.hiddenComplication);
  assert.equal(returned[0]!.revealed, false);
  assert.deepEqual(replay(charted.seed, charted.commandTrace), charted);

  let scouted = readyFirstShift('charted-knowledge');
  const scoutedRoute = scouted.routeOffers.find((offer) => offer.instanceId !== scouted.selectedRoute)!;
  scoutedRoute.revealed = true;
  scouted = applyCommand(scouted, { type: 'reserve_route', instanceId: scoutedRoute.instanceId }).state;
  assert.equal(scouted.reservedRouteRevealed, true);
  scouted = applyCommand(scouted, { type: 'resolve_shift' }).state;
  scouted = applyCommand(scouted, legalCommands(scouted)[0]!).state;
  const remembered = scouted.routeOffers.find((offer) => offer.routeId === scoutedRoute.routeId)!;
  assert.equal(remembered.chartedRevealed, true);
  assert.equal(remembered.revealed, true);
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
  assert.ok(state.developmentChoices.includes('foundry'));
  assert.ok(state.developmentChoices.includes('infirmary'));
  assert.ok(state.developmentChoices.includes('resonance_chamber'));
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

test('development can spend alloy on bounded emergency hull repair', () => {
  let state = createRun({ seed: 'emergency-plating' });
  state.phase = 'development';
  state.integrity = 9;
  state.resources.alloy = 2;
  assert.ok(legalCommands(state).some((command) => command.type === 'repair_citadel'));
  state = applyCommand(state, { type: 'repair_citadel' }).state;
  assert.equal(state.integrity, 11);
  assert.equal(state.resources.alloy, 0);
  assert.equal(state.phase, 'planning');
  assert.equal(state.shift, 2);

  state.phase = 'development';
  state.integrity = selectGameView(state).maxIntegrity;
  state.resources.alloy = 10;
  assert.equal(legalCommands(state).some((command) => command.type === 'repair_citadel'), false);
});

test('Black Descent composes deterministic shortages, harsher unknown faults, relics, and plating', () => {
  const standard = createRun({ seed: 'black-contract' });
  let black = createRun({ seed: 'black-contract', runMode: 'black_descent' });
  assert.equal(black.runMode, 'black_descent');
  assert.equal(black.integrity, 11);
  assert.deepEqual(black.resources, { provisions: 3, alloy: 4, lumen: 1 });
  assert.equal(selectGameView(black).maxIntegrity, 11);
  assert.equal(selectGameView(black).repairCost, 3);
  assert.equal(selectGameView(black).scoreMultiplier, 1.25);

  const standardForecast = new Map(selectGameView(standard).routes.map((route) => [route.routeId, route.forecast]));
  for (const route of selectGameView(black).routes) {
    const baseline = standardForecast.get(route.routeId)!;
    assert.equal(route.forecast.hullDamageMin, baseline.hullDamageMin);
    assert.equal(route.forecast.hullDamageMax, baseline.hullDamageMax + (route.hiddenComplication && route.definition.hazard >= 3 ? 1 : 0));
  }
  black.routeOffers[0]!.revealed = true;
  const revealed = selectGameView(black).routes[0]!;
  assert.equal(revealed.forecast.hullDamageMin, revealed.forecast.hullDamageMax);

  black.phase = 'development';
  black.integrity = 9;
  black.resources.alloy = 2;
  assert.equal(legalCommands(black).some((command) => command.type === 'repair_citadel'), false);
  black.resources.alloy = 3;
  black = applyCommand(black, { type: 'repair_citadel' }).state;
  assert.equal(black.integrity, 11);
  assert.equal(black.resources.alloy, 0);

  const heart = createRun({ seed: 'black-heart', runMode: 'black_descent', relicId: 'heart_splinter' });
  assert.equal(heart.resources.alloy, 6);
  assert.equal(heart.crew.find((crew) => crew.id === 'tamsin')!.strain, 1);
  const fork = createRun({ seed: 'black-fork', runMode: 'black_descent', relicId: 'vesper_tuning_fork' });
  assert.equal(fork.resources.lumen, 0);
  assert.equal(fork.heartNotes, 1);
  const latch = createRun({ seed: 'black-latch', runMode: 'black_descent', relicId: 'oathkeepers_latch' });
  assert.equal(latch.integrity, 12);
  assert.equal(latch.resources.alloy, 3);
  assert.equal(selectGameView(latch).maxIntegrity, 12);
  assert.deepEqual(deserialize(serialize(heart)), heart);
  assert.deepEqual(replay({ seed: heart.seed, runMode: 'black_descent', relicId: 'heart_splinter' }, heart.commandTrace), heart);
  assert.throws(() => createRun({ seed: 'unknown-mode', runMode: 'counterfeit' as never }), /Unknown run mode/);
});

test('Black Descent score multiplication is explicit and no completed loss can outrank a win', () => {
  const standardWin = createRun({ seed: 'score-standard' });
  standardWin.status = 'won';
  standardWin.phase = 'complete';
  standardWin.shift = 7;
  standardWin.heartNotes = 3;
  standardWin.integrity = 0;
  for (const crew of standardWin.crew) {
    crew.scar = `${crew.id}-scar`;
    crew.loyalty = -2;
    crew.vowProgress = 0;
  }
  const blackLoss = createRun({ seed: 'score-black-loss', runMode: 'black_descent', relicId: 'oathkeepers_latch' });
  blackLoss.status = 'lost';
  blackLoss.phase = 'complete';
  blackLoss.shift = 7;
  blackLoss.heartNotes = 3;
  blackLoss.integrity = 12;
  for (const crew of blackLoss.crew) {
    crew.scar = null;
    crew.loyalty = 5;
    crew.vowProgress = 3;
  }
  assert.equal(scoreRun(standardWin), 2500);
  assert.deepEqual(scoreBreakdown(standardWin), {
    completion: 2000,
    shifts: 350,
    heartNotes: 450,
    integrity: 0,
    fulfilledVows: 0,
    loyalty: 0,
    scars: -300,
    base: 2500,
    multiplier: 1,
    total: 2500,
  });
  assert.equal(baseScoreRun(blackLoss), 1900);
  assert.equal(scoreRun(blackLoss), 2375);
  assert.deepEqual(scoreBreakdown(blackLoss), {
    completion: 0,
    shifts: 350,
    heartNotes: 450,
    integrity: 300,
    fulfilledVows: 400,
    loyalty: 400,
    scars: 0,
    base: 1900,
    multiplier: 1.25,
    total: 2375,
  });
  assert.ok(scoreRun(standardWin) > scoreRun(blackLoss));

  const blackWin = structuredClone(standardWin);
  blackWin.runMode = 'black_descent';
  assert.equal(scoreRun(blackWin), Math.round(baseScoreRun(blackWin) * 1.25));
});

test('save round trips exactly, corrupted saves fail safely, and replay is exact', () => {
  const state = readyFirstShift('save-replay');
  assert.deepEqual(deserialize(serialize(state)), state);
  assert.throws(() => deserialize('{broken'), /valid JSON/);
  assert.throws(() => deserialize('{}'), /supported/);
  assert.deepEqual(replay(state.seed, state.commandTrace), state);
  const relicRun = createRun({ seed: 'relic-replay', relicId: 'heart_splinter' });
  assert.equal(relicRun.startingRelic, 'heart_splinter');
  assert.equal(relicRun.resources.alloy, 7);
  assert.equal(relicRun.crew.find((crew) => crew.id === 'tamsin')!.strain, 1);
  assert.match(relicRun.log.at(-1)!.text, /Heart Splinter equipped/);
  assert.deepEqual(replay({ seed: relicRun.seed, relicId: 'heart_splinter' }, relicRun.commandTrace), relicRun);
  const latchRun = createRun({ seed: 'latch-view', relicId: 'oathkeepers_latch' });
  assert.equal(latchRun.integrity, 13);
  assert.equal(selectGameView(latchRun).maxIntegrity, 13);
  assert.equal(createRun({ seed: 'no-relic' }).startingRelic, null);
  assert.throws(() => createRun({ seed: 'unknown-relic', relicId: 'counterfeit' as never }), /Unknown relic/);
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

test('legacy saves migrate missing trace-era and expedition fields', () => {
  const current = createRun({ seed: 'migration' });
  const old = { ...current, version: 0 } as Record<string, unknown>;
  delete old.developmentChoices;
  delete old.routeLeader;
  const migrated = deserialize(JSON.stringify(old));
  assert.equal(migrated.version, 5);
  assert.equal(migrated.runMode, 'standard');
  assert.equal(migrated.seed, 'migration');
  assert.deepEqual(migrated.developmentChoices, []);
  assert.deepEqual(migrated.routeOffers, current.routeOffers);

  const versionOne = { ...current, version: 1 } as Record<string, unknown>;
  delete versionOne.routeLeader;
  delete versionOne.startingRelic;
  const migratedVersionOne = deserialize(JSON.stringify(versionOne));
  assert.equal(migratedVersionOne.version, 5);
  assert.equal(migratedVersionOne.runMode, 'standard');
  assert.equal(migratedVersionOne.routeLeader, null);
  assert.equal(migratedVersionOne.startingRelic, null);

  const versionTwo = { ...current, version: 2, storyFlags: ['relic:quiet-bell'] } as Record<string, unknown>;
  delete versionTwo.startingRelic;
  const migratedVersionTwo = deserialize(JSON.stringify(versionTwo));
  assert.equal(migratedVersionTwo.version, 5);
  assert.equal(migratedVersionTwo.startingRelic, 'vesper_tuning_fork');
  assert.ok(migratedVersionTwo.storyFlags.includes('relic:vesper_tuning_fork'));
  assert.equal(migratedVersionTwo.reservedRoute, null);
  assert.ok(migratedVersionTwo.routeOffers.every((offer) => !offer.carried && !offer.chartedRevealed));

  const versionThree = { ...current, version: 3 } as Record<string, unknown>;
  delete versionThree.reservedRoute;
  delete versionThree.reservedRouteRevealed;
  versionThree.routeOffers = current.routeOffers.map(({ carried: _carried, chartedRevealed: _charted, ...offer }) => offer);
  const migratedVersionThree = deserialize(JSON.stringify(versionThree));
  assert.equal(migratedVersionThree.version, 5);
  assert.equal(migratedVersionThree.reservedRoute, null);
  assert.ok(migratedVersionThree.routeOffers.every((offer) => !offer.carried && !offer.chartedRevealed));

  const versionFour = { ...current, version: 4 } as Record<string, unknown>;
  delete versionFour.runMode;
  const migratedVersionFour = deserialize(JSON.stringify(versionFour));
  assert.equal(migratedVersionFour.version, 5);
  assert.equal(migratedVersionFour.runMode, 'standard');

  const staleReservation = { ...current, reservedRoute: 'missing-route' };
  assert.throws(() => deserialize(JSON.stringify(staleReservation)), /stale route reservation/);

  const unknownRelic = { ...current, version: 2, storyFlags: ['relic:counterfeit', 'story:kept'] } as Record<string, unknown>;
  delete unknownRelic.startingRelic;
  const migratedUnknown = deserialize(JSON.stringify(unknownRelic));
  assert.equal(migratedUnknown.startingRelic, null);
  assert.deepEqual(migratedUnknown.storyFlags, ['story:kept']);
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
  assert.equal(updated.records.length, 1);
  assert.equal(updated.records[0]!.seed, run.seed);
  assert.equal(updated.records[0]!.score, scoreRun(run));
  assert.equal(updated.records[0]!.baseScore, baseScoreRun(run));
  assert.equal(updated.records[0]!.scoreVersion, 2);
  assert.equal(updated.records[0]!.scoreMultiplier, 1);
  assert.equal(updated.records[0]!.runMode, 'standard');
  assert.equal(updated.records[0]!.outcome, 'won');
  assert.deepEqual(deserializeLegacy(serializeLegacy(updated)), updated);

  const lost = createRun({ seed: 'legacy-loss' });
  lost.status = 'lost';
  lost.phase = 'complete';
  lost.heartNotes = 1;
  const afterLoss = recordLegacyRun(createLegacyState(), lost);
  assert.equal(afterLoss.runsCompleted, 1);
  assert.equal(afterLoss.echoShards, 1);
  assert.deepEqual(afterLoss.endings, []);
  assert.deepEqual(afterLoss.relics, []);
  assert.equal(afterLoss.records[0]!.outcome, 'lost');
  assert.ok(afterLoss.records[0]!.score >= 0);

  const blackWin = structuredClone(run);
  blackWin.seed = 'black-archive';
  blackWin.runMode = 'black_descent';
  const afterBlack = recordLegacyRun(createLegacyState(), blackWin);
  assert.equal(afterBlack.records[0]!.runMode, 'black_descent');
  assert.equal(afterBlack.records[0]!.scoreMultiplier, 1.25);
  assert.equal(afterBlack.records[0]!.score, Math.round(afterBlack.records[0]!.baseScore * 1.25));

  const migratedLegacy = deserializeLegacy(JSON.stringify({
    version: 1,
    runsCompleted: 2,
    echoShards: 4,
    endings: ['harvest', 'bogus'],
    lore: ['tag:lost_crew', 'event:eighth_memory', 'unknown'],
    relics: ['Cantor Blade', 'brass-seed', 'Concordant Lens', 'quiet-bell', 'Quiet Bell', 'pilgrim-thread'],
  }));
  assert.equal(migratedLegacy.version, 4);
  assert.deepEqual([...migratedLegacy.relics].sort(), ['heart_splinter', 'oathkeepers_latch', 'vesper_tuning_fork']);
  assert.deepEqual(migratedLegacy.endings, ['harvest']);
  assert.ok(migratedLegacy.lore.includes('orison_manifest'));
  assert.ok(migratedLegacy.lore.includes('rook_roll_call'));
  assert.ok(migratedLegacy.lore.includes('sable_eight_last_log'));
  assert.deepEqual(migratedLegacy.records, []);

  const migratedRecord = deserializeLegacy(JSON.stringify({
    version: 3,
    runsCompleted: 1,
    echoShards: 2,
    endings: [],
    lore: [],
    relics: [],
    records: [{ seed: 'old-score', outcome: 'lost', ending: null, shift: 4, heartNotes: 2, integrity: 5, startingRelic: null, score: 725, scars: 1, fulfilledVows: 0 }],
  }));
  assert.equal(migratedRecord.records[0]!.runMode, 'standard');
  assert.equal(migratedRecord.records[0]!.scoreVersion, 1);
  assert.equal(migratedRecord.records[0]!.baseScore, 725);
  assert.equal(migratedRecord.records[0]!.scoreMultiplier, 1);

  let history = createLegacyState();
  for (let index = 0; index < 15; index += 1) {
    const archived = createRun({ seed: `archive-${index}` });
    archived.status = 'lost';
    archived.phase = 'complete';
    history = recordLegacyRun(history, archived);
  }
  assert.equal(history.records.length, 12);
  assert.equal(history.records[0]!.seed, 'archive-14');
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
  assert.match(result.endingText!, /zero hull/);
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
  assert.match(deadline.endingText!, /Shift seven/);
});
