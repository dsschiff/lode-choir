import { CREW, ENDINGS as ENDING_CONTENT, MODULES, RELICS, ROUTES, STORY_EVENTS } from './data/content.ts';
import {
  FALLBACK_CREW,
  FALLBACK_EVENTS,
  FALLBACK_MODULES,
  FALLBACK_ROUTES,
} from './fallback-content.ts';
import { makeRng, rngFromState, type Rng } from './rng.ts';
import type {
  Command,
  CreateRunOptions,
  CrewDefinition,
  CrewId,
  EndingId,
  EngineEvent,
  EventChoice,
  GameState,
  GameView,
  LogEntry,
  ModuleDefinition,
  ModuleId,
  ModuleState,
  ResourceId,
  RelicId,
  RoomAssignmentForecast,
  RouteDefinition,
  RouteForecast,
  RouteOffer,
  SerializedGameEnvelope,
  StoryEventDefinition,
  TransitionResult,
} from './types.ts';

const STANDARD_MAX_INTEGRITY = 12;
const BLACK_DESCENT_MAX_INTEGRITY = 11;
const MAX_STRAIN = 6;
const ROUTE_RESERVATION_COST = 1;
const DEVELOPMENT_SHIFTS = new Set([2, 4]);
const STARTER_MODULES: readonly ModuleId[] = ['heart_engine', 'deep_drill', 'ward_array'];
const CREW_IDS: readonly CrewId[] = ['mara', 'tamsin', 'orin', 'sable'];
const RELIC_ALIASES: Readonly<Record<string, RelicId>> = {
  heart_splinter: 'heart_splinter',
  'Cantor Blade': 'heart_splinter',
  'brass-seed': 'heart_splinter',
  vesper_tuning_fork: 'vesper_tuning_fork',
  'Concordant Lens': 'vesper_tuning_fork',
  'quiet-bell': 'vesper_tuning_fork',
  oathkeepers_latch: 'oathkeepers_latch',
  'Quiet Bell': 'oathkeepers_latch',
  'pilgrim-thread': 'oathkeepers_latch',
};

function canonicalRelicId(value: unknown): RelicId | null {
  return typeof value === 'string' ? RELIC_ALIASES[value] ?? null : null;
}

function effectiveCrew(): readonly CrewDefinition[] {
  return CREW.length >= CREW_IDS.length ? CREW : FALLBACK_CREW;
}

function effectiveModules(): readonly ModuleDefinition[] {
  return MODULES.length >= STARTER_MODULES.length ? MODULES : FALLBACK_MODULES;
}

function effectiveRoutes(): readonly RouteDefinition[] {
  return ROUTES.length >= 3 ? ROUTES : FALLBACK_ROUTES;
}

function effectiveEvents(): readonly StoryEventDefinition[] {
  return STORY_EVENTS.length > 0 ? STORY_EVENTS : FALLBACK_EVENTS;
}

function moduleDefinition(id: ModuleId): ModuleDefinition {
  const definition = effectiveModules().find((candidate) => candidate.id === id);
  if (!definition) throw new Error(`Missing module definition: ${id}`);
  return definition;
}

function routeDefinition(id: string): RouteDefinition {
  const definition = effectiveRoutes().find((candidate) => candidate.id === id);
  if (!definition) throw new Error(`Missing route definition: ${id}`);
  return definition;
}

function storyEventDefinition(id: string): StoryEventDefinition {
  const definition = effectiveEvents().find((candidate) => candidate.id === id);
  if (!definition) throw new Error(`Missing story event definition: ${id}`);
  return definition;
}

function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

function appendLog(state: GameState, kind: LogEntry['kind'], text: string): void {
  state.logSeq += 1;
  state.log.push({ seq: state.logSeq, shift: state.shift, kind, text });
  if (state.log.length > 80) state.log.splice(0, state.log.length - 80);
}

function emit(
  state: GameState,
  events: EngineEvent[],
  kind: EngineEvent['kind'],
  text: string,
  emphasis?: EngineEvent['emphasis'],
): void {
  state.logSeq += 1;
  const event: EngineEvent = { id: state.logSeq, kind, text };
  if (emphasis !== undefined) event.emphasis = emphasis;
  events.push(event);
}

function rollOffers(state: GameState, rng: Rng): RouteOffer[] {
  const routes = effectiveRoutes();
  const selected = rng.shuffle(routes).slice(0, Math.min(3, routes.length));
  const offers = selected.map((route, index) => ({
    instanceId: `${state.shift}-${index}-${route.id}`,
    routeId: route.id,
    hiddenComplication: route.hazard > 0
      ? rng.pick(['Depth readings are false.', 'The rock is under unstable pressure.', 'A large object is moving below the route.'])
      : null,
    revealed: false,
    carried: false,
    chartedRevealed: false,
  }));
  state.rngState = rng.state;
  return offers;
}

function applyRelic(state: GameState, relicId: RelicId | undefined): void {
  if (!relicId) return;
  if (!RELICS.some((relic) => relic.id === relicId)) throw new Error(`Unknown relic: ${relicId}`);
  state.storyFlags.push(`relic:${relicId}`);
  if (relicId === 'heart_splinter') {
    state.resources.alloy += 2;
    state.crew.find((crew) => crew.id === 'tamsin')!.strain += 1;
  }
  if (relicId === 'vesper_tuning_fork') {
    state.heartNotes += 1;
    state.resources.lumen = Math.max(0, state.resources.lumen - 1);
  }
  if (relicId === 'oathkeepers_latch') {
    state.integrity += 1;
    state.resources.alloy = Math.max(0, state.resources.alloy - 1);
  }
}

function maximumIntegrity(state: GameState): number {
  const base = state.runMode === 'black_descent' ? BLACK_DESCENT_MAX_INTEGRITY : STANDARD_MAX_INTEGRITY;
  return state.startingRelic === 'oathkeepers_latch' ? base + 1 : base;
}

function emergencyPlatingCost(state: GameState): number {
  return state.runMode === 'black_descent' ? 3 : 2;
}

export function createRun(options: CreateRunOptions | string): GameState {
  const normalized = typeof options === 'string' ? { seed: options } : options;
  if (normalized.seed.trim().length === 0) throw new Error('A non-empty seed is required.');
  if (normalized.runMode !== undefined && !['standard', 'black_descent'].includes(normalized.runMode)) {
    throw new Error(`Unknown run mode: ${String(normalized.runMode)}`);
  }
  const state: GameState = {
    version: 5,
    seed: normalized.seed,
    runMode: normalized.runMode ?? 'standard',
    startingRelic: normalized.relicId ?? null,
    rngState: 0,
    shift: 1,
    phase: 'planning',
    status: 'playing',
    resources: normalized.runMode === 'black_descent'
      ? { provisions: 3, alloy: 4, lumen: 1 }
      : { provisions: 4, alloy: 5, lumen: 2 },
    integrity: normalized.runMode === 'black_descent' ? BLACK_DESCENT_MAX_INTEGRITY : STANDARD_MAX_INTEGRITY,
    heartNotes: 0,
    crew: CREW_IDS.map((id) => ({
      id,
      strain: 0,
      loyalty: 0,
      scar: null,
      incapacitatedUntil: 0,
      vowProgress: 0,
      signatureUnlocked: false,
    })),
    modules: STARTER_MODULES.map((id, slot) => ({ id, slot, level: 1, assignedCrew: null })),
    routeOffers: [],
    selectedRoute: null,
    reservedRoute: null,
    reservedRouteRevealed: false,
    routeLeader: null,
    activeEvent: null,
    developmentChoices: [],
    ending: null,
    endingText: null,
    storyFlags: [],
    commandTrace: [],
    log: [],
    logSeq: 0,
  };
  const rng = makeRng(normalized.seed);
  state.routeOffers = rollOffers(state, rng);
  applyRelic(state, normalized.relicId);
  appendLog(state, 'system', 'Expedition started. Choose a mission and staff three rooms.');
  if (state.startingRelic) {
    const relic = RELICS.find((candidate) => candidate.id === state.startingRelic)!;
    appendLog(state, 'story', `${relic.name} equipped. ${relic.startingEffect}`);
  }
  if (state.runMode === 'black_descent') {
    appendLog(state, 'warning', 'Black Descent: lower starting resources, double hidden high-risk fault damage, and 3-alloy hull repair.');
  }
  return state;
}

function crewAvailable(state: GameState, crewId: CrewId): boolean {
  const crew = state.crew.find((candidate) => candidate.id === crewId);
  return Boolean(crew && crew.incapacitatedUntil <= state.shift);
}

function requiredAssignments(state: GameState): number {
  return Math.min(3, state.crew.filter((crew) => crewAvailable(state, crew.id)).length, state.modules.length);
}

function assignedCount(state: GameState): number {
  return state.modules.filter((module) => module.assignedCrew !== null).length;
}

function crewAssigned(state: GameState, crewId: CrewId): boolean {
  return state.routeLeader === crewId || state.modules.some((module) => module.assignedCrew === crewId);
}

function refreshRevelations(state: GameState): void {
  for (const offer of state.routeOffers) offer.revealed = offer.chartedRevealed;
  const sableInResonance = state.modules.some((module) => module.id === 'resonance_chamber' && module.assignedCrew === 'sable');
  if (sableInResonance) for (const offer of state.routeOffers) offer.revealed = true;
  const sableInWard = state.modules.some((module) => module.id === 'ward_array' && module.assignedCrew === 'sable');
  if ((sableInWard || state.routeLeader === 'sable') && state.selectedRoute) {
    const selected = state.routeOffers.find((offer) => offer.instanceId === state.selectedRoute);
    if (selected) selected.revealed = true;
  }
}

function developmentCommands(state: GameState): Command[] {
  const commands: Command[] = [];
  const occupied = new Set(state.modules.map((module) => module.slot));
  const built = new Set(state.modules.map((module) => module.id));
  const emptySlots = Array.from({ length: 9 }, (_, slot) => slot).filter((slot) => !occupied.has(slot));
  for (const definition of effectiveModules()) {
    if (built.has(definition.id) || definition.buildCost > state.resources.alloy) continue;
    for (const slot of emptySlots) commands.push({ type: 'build_module', moduleId: definition.id, slot });
  }
  for (const module of state.modules) {
    const cost = upgradeCost(module);
    if (module.level < 3 && cost <= state.resources.alloy) commands.push({ type: 'upgrade_module', slot: module.slot });
  }
  return commands;
}

export function legalCommands(state: GameState): Command[] {
  if (state.status !== 'playing') return [];
  if (state.phase === 'planning') {
    const commands: Command[] = state.routeOffers.map((offer) => ({ type: 'select_route', instanceId: offer.instanceId }));
    if (state.selectedRoute && state.shift < 7) {
      for (const offer of state.routeOffers) {
        if (offer.instanceId === state.selectedRoute || offer.instanceId === state.reservedRoute) continue;
        if (state.reservedRoute || state.resources.lumen >= ROUTE_RESERVATION_COST) commands.push({ type: 'reserve_route', instanceId: offer.instanceId });
      }
      if (state.reservedRoute) commands.push({ type: 'clear_route_reservation' });
    }
    const availableCrew = state.crew.filter((candidate) => crewAvailable(state, candidate.id));
    const canAppointLeader = Boolean(state.selectedRoute)
      && availableCrew.length === 4
      && assignedCount(state) === requiredAssignments(state)
      && state.resources.provisions >= 2;
    for (const crew of state.crew) {
      if (!crewAvailable(state, crew.id)) continue;
      const alreadyAssigned = crewAssigned(state, crew.id);
      if (alreadyAssigned) {
        commands.push({ type: 'unassign_crew', crewId: crew.id });
      }
      for (const module of state.modules) {
        if (alreadyAssigned || assignedCount(state) < requiredAssignments(state) || module.assignedCrew !== null) {
          commands.push({ type: 'assign_crew', crewId: crew.id, slot: module.slot });
        }
      }
      if (canAppointLeader && !alreadyAssigned) {
        commands.push({ type: 'assign_route_leader', crewId: crew.id });
      }
    }
    if (state.selectedRoute && assignedCount(state) === requiredAssignments(state)) commands.push({ type: 'resolve_shift' });
    return commands;
  }
  if (state.phase === 'event' && state.activeEvent) {
    return storyEventDefinition(state.activeEvent).choices
      .map((choice, choiceIndex) => ({ choice, choiceIndex }))
      .filter(({ choice }) => choiceAffordable(state, choice))
      .map(({ choiceIndex }) => ({ type: 'choose_event' as const, choiceIndex }));
  }
  if (state.phase === 'development') {
    const commands = developmentCommands(state);
    if (state.resources.alloy >= emergencyPlatingCost(state) && state.integrity < maximumIntegrity(state)) commands.push({ type: 'repair_citadel' });
    return [...commands, { type: 'skip_development' }];
  }
  if (state.phase === 'finale') return ENDING_CONTENT.map(({ id: endingId }) => ({ type: 'choose_ending' as const, endingId }));
  return [];
}

function choiceAffordable(state: GameState, choice: EventChoice): boolean {
  if (!choice.resourceDelta) return true;
  return (Object.entries(choice.resourceDelta) as [ResourceId, number][]).every(
    ([id, delta]) => delta >= 0 || state.resources[id] >= -delta,
  );
}

function commandEquals(left: Command, right: Command): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertLegal(state: GameState, command: Command): void {
  if (!legalCommands(state).some((candidate) => commandEquals(candidate, command))) {
    throw new Error(`Illegal command ${JSON.stringify(command)} during ${state.phase}.`);
  }
}

function adjacent(left: number, right: number): boolean {
  const leftRow = Math.floor(left / 3);
  const rightRow = Math.floor(right / 3);
  return Math.abs(leftRow - rightRow) + Math.abs((left % 3) - (right % 3)) === 1;
}

function hasAdjacentModule(state: GameState, module: ModuleState, id: ModuleId): boolean {
  return state.modules.some((candidate) => candidate.id === id && adjacent(candidate.slot, module.slot));
}

function addResource(state: GameState, id: ResourceId, amount: number): void {
  state.resources[id] = Math.max(0, state.resources[id] + amount);
}

function adjustStrain(state: GameState, crewId: CrewId, delta: number, events: EngineEvent[]): void {
  const crew = state.crew.find((candidate) => candidate.id === crewId);
  if (!crew) return;
  const previous = crew.strain;
  crew.strain = Math.max(0, Math.min(MAX_STRAIN, crew.strain + delta));
  if (crew.strain >= MAX_STRAIN && previous < MAX_STRAIN) {
    crew.incapacitatedUntil = state.shift + 2;
    if (!crew.scar) crew.scar = `${crew.id}-moon-scar`;
    const name = effectiveCrew().find((candidate) => candidate.id === crewId)?.name ?? crewId;
    appendLog(state, 'warning', `${name} is incapacitated for the next shift and carries a new scar.`);
    emit(state, events, 'damage', `${name} reaches 6 strain and is unavailable next shift.`, 'negative');
  }
}

function increaseLoyalty(state: GameState, crewId: CrewId, amount: number, events: EngineEvent[]): void {
  const crew = state.crew.find((candidate) => candidate.id === crewId);
  if (!crew) return;
  crew.loyalty = Math.max(-2, Math.min(5, crew.loyalty + amount));
  if (!crew.signatureUnlocked && crew.loyalty >= 3) {
    crew.signatureUnlocked = true;
    const definition = effectiveCrew().find((candidate) => candidate.id === crewId);
    emit(state, events, 'progress', `${definition?.name ?? crewId} unlocks ${definition?.signature ?? 'a signature ability'}.`, 'positive');
  }
}

function progressVow(state: GameState, crewId: CrewId, events: EngineEvent[]): void {
  const crew = state.crew.find((candidate) => candidate.id === crewId);
  if (!crew || crew.vowProgress >= 3) return;
  crew.vowProgress += 1;
  if (crew.vowProgress === 2) increaseLoyalty(state, crewId, 1, events);
  if (crew.vowProgress === 3) {
    increaseLoyalty(state, crewId, 1, events);
    const definition = effectiveCrew().find((candidate) => candidate.id === crewId);
    emit(state, events, 'progress', `${definition?.name ?? crewId} fulfills a personal vow.`, 'mystic');
  }
}

interface RoomResolution {
  ward: number;
  repair: number;
}

function roomStrength(state: GameState, module: ModuleState, crewId: CrewId): number {
  const crew = state.crew.find((candidate) => candidate.id === crewId)!;
  const heartAdjacency = module.id !== 'heart_engine' && hasAdjacentModule(state, module, 'heart_engine') ? 1 : 0;
  const orinBonus = crewId === 'orin' && crew.signatureUnlocked ? 1 : 0;
  return module.level + heartAdjacency + orinBonus;
}

export function forecastRoomAssignment(state: GameState, slot: number, crewId: CrewId): RoomAssignmentForecast {
  const module = state.modules.find((candidate) => candidate.slot === slot);
  if (!module) throw new Error(`No chamber exists in slot ${slot}.`);
  const crew = state.crew.find((candidate) => candidate.id === crewId);
  if (!crew) throw new Error(`Unknown crew member: ${crewId}.`);

  const strength = roomStrength(state, module, crewId);
  const forecast: RoomAssignmentForecast = {
    resources: {},
    integrityRepair: 0,
    protection: 0,
    crewStrain: 0,
    allCrewStrain: 0,
    heartNotes: 0,
    alloyCost: 0,
    conditions: [],
  };

  if (module.id === 'heart_engine') {
    forecast.resources.provisions = strength + (crewId === 'mara' ? 1 : 0);
    if (crewId === 'sable') forecast.resources.lumen = 1;
    forecast.integrityRepair = crewId === 'orin' ? 1 : 0;
    forecast.crewStrain = crewId === 'tamsin' ? -2 : crewId === 'sable' ? 0 : -1;
    if (crewId === 'mara') forecast.conditions = ['Mara stretches the ration yield.'];
    if (crewId === 'tamsin') forecast.conditions = ['Tamsin takes the quiet shift and recovers more strain.'];
    if (crewId === 'orin') forecast.conditions = ['Orin repairs 1 hull while the Heart runs.'];
    if (crewId === 'sable') forecast.conditions = ['Produces 1 lumen; Sable cannot rest here.'];
  } else if (module.id === 'deep_drill') {
    const orinPenalty = crewId === 'orin' ? 1 : 0;
    const tamsinBonus = crewId === 'tamsin' ? (crew.signatureUnlocked ? 2 : 1) : 0;
    forecast.resources.alloy = Math.max(1, strength * 2 - orinPenalty + tamsinBonus);
    if (crewId === 'sable') forecast.resources.lumen = 1;
    forecast.integrityRepair = crewId === 'orin' ? 1 : 0;
    forecast.crewStrain = crewId === 'mara' ? 0 : crewId === 'tamsin' ? 2 : 1;
    if (crewId === 'mara') forecast.conditions = ['Mara runs a safe cut: no drill strain.'];
    if (crewId === 'tamsin') forecast.conditions = ['Redline yields extra alloy but adds 2 drill strain.'];
    if (crewId === 'orin') forecast.conditions = ['Orin trades 1 alloy for 1 hull repair.'];
    if (crewId === 'sable') forecast.conditions = ['Maps the mission signal for 1 lumen.'];
  } else if (module.id === 'ward_array') {
    const maraBonus = crewId === 'mara' ? (crew.signatureUnlocked ? 2 : 1) : 0;
    forecast.protection = strength + maraBonus;
    forecast.integrityRepair = Math.ceil(module.level / 2) + (crewId === 'orin' ? 1 : 0);
    if (crewId === 'tamsin') {
      forecast.resources.alloy = module.level + 1;
      forecast.crewStrain = 1;
      forecast.conditions = ['Tamsin strips stressed braces for alloy.'];
    }
    if (crewId === 'mara') forecast.conditions = ['Mara adds extra mission protection.'];
    if (crewId === 'orin') forecast.conditions = ['Orin adds 1 hull repair.'];
    if (crewId === 'sable') forecast.conditions = ['Reveals the chosen mission fault.'];
  } else if (module.id === 'foundry') {
    forecast.alloyCost = 1;
    forecast.integrityRepair = state.resources.alloy > 0
      ? strength + (hasAdjacentModule(state, module, 'deep_drill') ? 1 : 0)
      : 0;
    if (state.resources.alloy === 0) forecast.conditions = ['Needs 1 alloy to operate.'];
  } else if (module.id === 'infirmary') {
    forecast.allCrewStrain = -strength;
  } else if (module.id === 'resonance_chamber') {
    forecast.resources.lumen = strength;
    const canDecode = module.level >= 2
      && !state.storyFlags.includes('resonance:heart-note')
      && state.resources.lumen + strength >= 3;
    if (canDecode) {
      forecast.resources.lumen -= 3;
      forecast.heartNotes = 1;
      forecast.conditions = ['First level-2 activation spends 3 lumen for 1 Heart Note.'];
    }
  }

  return forecast;
}

function resolveRooms(state: GameState, events: EngineEvent[]): RoomResolution {
  let ward = 0;
  let repair = 0;
  for (const module of state.modules) {
    const crewId = module.assignedCrew;
    if (!crewId) continue;
    const crew = state.crew.find((candidate) => candidate.id === crewId)!;
    const strength = roomStrength(state, module, crewId);
    if (module.id === 'heart_engine') {
      const provisions = strength + (crewId === 'mara' ? 1 : 0);
      addResource(state, 'provisions', provisions);
      if (crewId === 'sable') addResource(state, 'lumen', 1);
      if (crewId === 'orin') repair += 1;
      if (crewId !== 'sable') adjustStrain(state, crewId, crewId === 'tamsin' ? -2 : -1, events);
      emit(state, events, 'room', `Heart Engine: +${provisions} provisions${crewId === 'sable' ? ', +1 lumen' : ''}${crewId === 'orin' ? ', +1 hull' : ''}.`, 'positive');
    } else if (module.id === 'deep_drill') {
      const penalty = crewId === 'orin' ? 1 : 0;
      const bonus = crewId === 'tamsin' ? (crew.signatureUnlocked ? 2 : 1) : 0;
      const output = Math.max(1, strength * 2 - penalty + bonus);
      addResource(state, 'alloy', output);
      if (crewId === 'sable') addResource(state, 'lumen', 1);
      if (crewId === 'orin') repair += 1;
      adjustStrain(state, crewId, crewId === 'mara' ? 0 : crewId === 'tamsin' ? 2 : 1, events);
      emit(state, events, 'room', `Deep Drill: +${output} alloy${crewId === 'sable' ? ', +1 lumen' : ''}${crewId === 'orin' ? ', +1 hull' : ''}.`, 'positive');
    } else if (module.id === 'ward_array') {
      const maraBonus = crewId === 'mara' ? (crew.signatureUnlocked ? 2 : 1) : 0;
      const protection = strength + maraBonus;
      ward += protection;
      repair += Math.ceil(module.level / 2) + (crewId === 'orin' ? 1 : 0);
      if (crewId === 'tamsin') {
        const salvage = module.level + 1;
        addResource(state, 'alloy', salvage);
        adjustStrain(state, crewId, 1, events);
        emit(state, events, 'room', `Ward Array: ${protection} protection, +${salvage} alloy.`, 'positive');
      } else {
        emit(state, events, 'room', `Ward Array: ${protection} protection.`);
      }
    } else if (module.id === 'foundry') {
      const drillBonus = hasAdjacentModule(state, module, 'deep_drill') ? 1 : 0;
      const restored = strength + drillBonus;
      if (state.resources.alloy > 0) {
        addResource(state, 'alloy', -1);
        repair += restored;
        emit(state, events, 'room', `Cinder Foundry: −1 alloy, +${restored} hull.`, 'positive');
      } else {
        emit(state, events, 'room', 'Cinder Foundry: no output because no alloy was available.', 'negative');
      }
    } else if (module.id === 'infirmary') {
      for (const target of state.crew) adjustStrain(state, target.id, -strength, events);
      emit(state, events, 'room', `Mercy Berth: all crew −${strength} strain.`, 'positive');
    } else if (module.id === 'resonance_chamber') {
      addResource(state, 'lumen', strength);
      if (module.level >= 2 && !state.storyFlags.includes('resonance:heart-note') && state.resources.lumen >= 3) {
        addResource(state, 'lumen', -3);
        state.heartNotes = Math.min(3, state.heartNotes + 1);
        state.storyFlags.push('resonance:heart-note');
        emit(state, events, 'progress', 'Resonance Chamber: −3 lumen, +1 Heart Note.', 'mystic');
      }
      emit(state, events, 'room', `Resonance Chamber: +${strength} lumen before automatic decoding.`, 'mystic');
    }
  }
  if (repair > 0) state.integrity = Math.min(maximumIntegrity(state), state.integrity + repair);
  return { ward, repair };
}

interface RouteResolution {
  damage: number;
  provisionCost: number;
}

function projectedWard(state: GameState): number {
  return state.modules.reduce((total, module) => {
    if (module.id !== 'ward_array' || !module.assignedCrew) return total;
    return total + forecastRoomAssignment(state, module.slot, module.assignedCrew).protection;
  }, 0);
}

function projectedRepair(state: GameState): number {
  let repair = 0;
  let alloy = state.resources.alloy;
  for (const module of state.modules) {
    const crewId = module.assignedCrew;
    if (!crewId) continue;
    const crew = state.crew.find((candidate) => candidate.id === crewId)!;
    const strength = roomStrength(state, module, crewId);
    if (module.id === 'heart_engine' && crewId === 'orin') repair += 1;
    if (module.id === 'deep_drill') {
      const penalty = crewId === 'orin' ? 1 : 0;
      const bonus = crewId === 'tamsin' ? (crew.signatureUnlocked ? 2 : 1) : 0;
      alloy += Math.max(1, strength * 2 - penalty + bonus);
      if (crewId === 'orin') repair += 1;
    }
    if (module.id === 'ward_array') repair += Math.ceil(module.level / 2) + (crewId === 'orin' ? 1 : 0);
    if (module.id === 'foundry' && alloy > 0) {
      alloy -= 1;
      repair += strength + (hasAdjacentModule(state, module, 'deep_drill') ? 1 : 0);
    }
  }
  return repair;
}

function projectedDamage(state: GameState, offer: RouteOffer, leader: CrewId | null, revealed: boolean): number {
  const route = routeDefinition(offer.routeId);
  const leaderProtection = leader === 'mara' ? 1 : 0;
  const hiddenHazard = offer.hiddenComplication && !revealed
    ? state.runMode === 'black_descent' && route.hazard >= 3 ? 2 : 1
    : 0;
  return Math.max(0, route.hazard + hiddenHazard - projectedWard(state) - leaderProtection);
}

function projectedNetStrain(state: GameState, offer: RouteOffer, leader: CrewId | null, revealed: boolean): number {
  const route = routeDefinition(offer.routeId);
  const strain = new Map(state.crew.map((crew) => [crew.id, crew.strain]));
  const adjust = (crewId: CrewId, amount: number) => strain.set(crewId, Math.max(0, Math.min(MAX_STRAIN, strain.get(crewId)! + amount)));
  for (const module of state.modules) {
    const crewId = module.assignedCrew;
    if (!crewId) continue;
    const forecast = forecastRoomAssignment(state, module.slot, crewId);
    if (forecast.crewStrain) adjust(crewId, forecast.crewStrain);
    if (forecast.allCrewStrain) for (const crew of state.crew) adjust(crew.id, forecast.allCrewStrain);
  }
  const baseRouteStrain = route.hazard >= 4 ? 2 : route.hazard >= 2 ? 1 : 0;
  for (const module of state.modules) {
    if (!module.assignedCrew) continue;
    const crew = state.crew.find((candidate) => candidate.id === module.assignedCrew)!;
    const tamsinPenalty = crew.id === 'tamsin' && route.hazard >= 3 ? 1 : 0;
    adjust(crew.id, baseRouteStrain + (crew.scar ? 1 : 0) + tamsinPenalty);
  }
  if (leader === 'orin') {
    for (const module of state.modules) if (module.assignedCrew) adjust(module.assignedCrew, -1);
  }
  if (leader) {
    const crew = state.crew.find((candidate) => candidate.id === leader)!;
    const tamsinPenalty = leader === 'tamsin' && route.hazard >= 3 ? 1 : 0;
    adjust(leader, 1 + baseRouteStrain + (crew.scar ? 1 : 0) + tamsinPenalty);
  }
  const working = new Set(state.modules.map((module) => module.assignedCrew));
  if (leader) working.add(leader);
  for (const crew of state.crew) if (!working.has(crew.id) && crewAvailable(state, crew.id)) adjust(crew.id, -2);
  if (route.kind !== 'refuge' && state.routeOffers.some((candidate) => routeDefinition(candidate.routeId).kind === 'refuge')) adjust('mara', 1);
  const projectedIntegrity = Math.min(maximumIntegrity(state), state.integrity + projectedRepair(state))
    - projectedDamage(state, offer, leader, revealed);
  if (projectedIntegrity < maximumIntegrity(state) / 2) adjust('orin', 1);
  const before = state.crew.reduce((total, crew) => total + crew.strain, 0);
  const after = [...strain.values()].reduce((total, value) => total + value, 0);
  return after - before;
}

function resolveRoute(state: GameState, room: RoomResolution, events: EngineEvent[]): RouteResolution {
  const offer = state.routeOffers.find((candidate) => candidate.instanceId === state.selectedRoute)!;
  const route = routeDefinition(offer.routeId);
  const leader = state.routeLeader;
  for (const [id, amount] of Object.entries(projectedRouteRewards(state, offer, leader)) as [ResourceId, number][]) addResource(state, id, amount);
  const noteProgress = projectedRouteHeartNotes(state, offer);
  state.heartNotes = Math.min(3, state.heartNotes + noteProgress);

  const damage = projectedDamage(state, offer, leader, offer.revealed);
  state.integrity = Math.max(0, state.integrity - damage);
  if (leader === 'mara') emit(state, events, 'crew', 'Mara leads: 1 mission hazard prevented.', 'positive');
  if (leader === 'tamsin') {
    const salvage = Math.ceil(route.hazard / 2);
    emit(state, events, 'crew', `Tamsin leads: +${salvage} alloy.`, 'positive');
  }
  if (leader === 'sable') emit(state, events, 'crew', 'Sable leads: mission fault revealed.', 'mystic');
  if (state.resources.provisions > 0) state.resources.provisions -= 1;
  else state.integrity = Math.max(0, state.integrity - 1);
  if (leader) state.resources.provisions = Math.max(0, state.resources.provisions - 1);

  for (const module of state.modules) {
    if (!module.assignedCrew) continue;
    const routeStrain = route.hazard >= 4 ? 2 : route.hazard >= 2 ? 1 : 0;
    const scarPenalty = state.crew.find((crew) => crew.id === module.assignedCrew)?.scar ? 1 : 0;
    const tamsinPenalty = module.assignedCrew === 'tamsin' && route.hazard >= 3 ? 1 : 0;
    adjustStrain(state, module.assignedCrew, routeStrain + scarPenalty + tamsinPenalty, events);
  }
  if (leader === 'orin') {
    for (const module of state.modules) {
      if (module.assignedCrew) adjustStrain(state, module.assignedCrew, -1, events);
    }
    emit(state, events, 'crew', 'Orin leads: room crews −1 strain.', 'positive');
  }
  if (leader) {
    const routeStrain = route.hazard >= 4 ? 2 : route.hazard >= 2 ? 1 : 0;
    const scarPenalty = state.crew.find((crew) => crew.id === leader)?.scar ? 1 : 0;
    const tamsinPenalty = leader === 'tamsin' && route.hazard >= 3 ? 1 : 0;
    adjustStrain(state, leader, 1 + routeStrain + scarPenalty + tamsinPenalty, events);
  }
  const assigned = new Set(state.modules.map((module) => module.assignedCrew));
  if (leader) assigned.add(leader);
  for (const crew of state.crew) {
    if (!assigned.has(crew.id) && crewAvailable(state, crew.id)) adjustStrain(state, crew.id, -2, events);
  }
  if (route.kind !== 'refuge' && state.routeOffers.some((candidate) => routeDefinition(candidate.routeId).kind === 'refuge')) {
    adjustStrain(state, 'mara', 1, events);
  }
  if (state.integrity < maximumIntegrity(state) / 2) adjustStrain(state, 'orin', 1, events);

  if (damage === 0) progressVow(state, 'mara', events);
  if (route.hazard >= 3 && (leader === 'tamsin' || state.modules.some((module) => module.assignedCrew === 'tamsin'))) progressVow(state, 'tamsin', events);
  if (leader === 'orin' || room.repair > 0 || state.modules.some((module) => module.id === 'resonance_chamber' && module.assignedCrew === 'orin')) progressVow(state, 'orin', events);
  if (offer.revealed) progressVow(state, 'sable', events);

  state.storyFlags.push(`route:${route.id}`);
  if (!state.storyFlags.includes(`tag:${route.storyTag}`)) state.storyFlags.push(`tag:${route.storyTag}`);
  appendLog(state, 'route', `${route.title}: ${route.rewardText}${damage > 0 ? ` Orison loses ${damage} hull.` : ' No hull damage.'}`);
  emit(state, events, 'route', `${route.title} mission complete.`, noteProgress > 0 ? 'mystic' : 'positive');
  if (damage > 0) emit(state, events, 'damage', `Orison loses ${damage} hull.`, 'negative');
  return { damage, provisionCost: leader ? 2 : 1 };
}

function projectedRouteRewards(state: GameState, offer: RouteOffer, leader: CrewId | null): Partial<Record<ResourceId, number>> {
  const route = routeDefinition(offer.routeId);
  const rewards = { ...route.baseRewards };
  if (leader === 'tamsin') rewards.alloy = (rewards.alloy ?? 0) + Math.ceil(route.hazard / 2);
  return rewards;
}

function projectedRouteHeartNotes(state: GameState, offer: RouteOffer): number {
  const route = routeDefinition(offer.routeId);
  const sable = state.crew.find((candidate) => candidate.id === 'sable')!;
  return route.noteProgress + (sable.signatureUnlocked && offer.revealed && route.kind === 'rift' ? 1 : 0);
}

function forecastRoute(state: GameState, offer: RouteOffer): RouteForecast {
  const leader = state.selectedRoute === offer.instanceId ? state.routeLeader : null;
  const certainlyRevealed = offer.revealed || (state.selectedRoute === offer.instanceId && state.routeLeader === 'sable');
  const knownDamage = projectedDamage(state, offer, leader, true);
  const hiddenDamage = offer.hiddenComplication && !certainlyRevealed
    ? projectedDamage(state, offer, leader, false)
    : knownDamage;
  return {
    rewards: projectedRouteRewards(state, offer, leader),
    heartNotes: projectedRouteHeartNotes(state, offer),
    hullDamageMin: Math.min(knownDamage, hiddenDamage),
    hullDamageMax: Math.max(knownDamage, hiddenDamage),
    provisionCost: leader ? 2 : 1,
    netCrewStrain: projectedNetStrain(state, offer, leader, certainlyRevealed || !offer.hiddenComplication),
  };
}

function allCrewIncapacitated(state: GameState): boolean {
  return state.crew.every((crew) => crew.incapacitatedUntil > state.shift + 1);
}

function selectNextEvent(state: GameState, events: EngineEvent[]): void {
  const selectedOffer = state.routeOffers.find((offer) => offer.instanceId === state.selectedRoute);
  const tag = selectedOffer ? routeDefinition(selectedOffer.routeId).storyTag : 'any';
  const unused = effectiveEvents().filter((event) => !state.storyFlags.includes(`event:${event.id}`));
  const matching = unused.filter((event) => event.tags.includes(tag) || event.tags.includes('any'));
  const candidates = matching.length > 0 ? matching : unused;
  if (candidates.length === 0) {
    finishPostShift(state);
    return;
  }
  const rng = rngFromState(state.rngState);
  const definition = rng.pick(candidates);
  state.rngState = rng.state;
  state.activeEvent = definition.id;
  state.storyFlags.push(`event:${definition.id}`);
  for (const eventTag of definition.tags) {
    if (!state.storyFlags.includes(`tag:${eventTag}`)) state.storyFlags.push(`tag:${eventTag}`);
  }
  state.phase = 'event';
  emit(state, events, 'story', definition.title, 'mystic');
}

function availableDevelopmentChoices(state: GameState): ModuleId[] {
  const built = new Set(state.modules.map((module) => module.id));
  const choices = new Set<ModuleId>(effectiveModules().filter((module) => !built.has(module.id)).map((module) => module.id));
  for (const module of state.modules) if (module.level < 3) choices.add(module.id);
  return [...choices];
}

function finishPostShift(state: GameState): void {
  state.activeEvent = null;
  if (DEVELOPMENT_SHIFTS.has(state.shift)) {
    state.phase = 'development';
    state.developmentChoices = availableDevelopmentChoices(state);
    if (state.developmentChoices.length > 0) return;
  }
  beginNextShift(state);
}

function beginNextShift(state: GameState): void {
  const reserved = state.reservedRoute
    ? state.routeOffers.find((offer) => offer.instanceId === state.reservedRoute)
    : null;
  const reservedRevealed = state.reservedRouteRevealed;
  state.shift += 1;
  state.phase = 'planning';
  state.developmentChoices = [];
  state.selectedRoute = null;
  state.routeLeader = null;
  state.activeEvent = null;
  for (const module of state.modules) module.assignedCrew = null;
  const rng = rngFromState(state.rngState);
  state.routeOffers = rollOffers(state, rng);
  if (reserved) {
    let carried = state.routeOffers.find((offer) => offer.routeId === reserved.routeId);
    if (!carried) {
      const replacementIndex = state.routeOffers.length - 1;
      carried = {
        instanceId: `${state.shift}-${replacementIndex}-${reserved.routeId}`,
        routeId: reserved.routeId,
        hiddenComplication: reserved.hiddenComplication,
        revealed: reservedRevealed,
        carried: true,
        chartedRevealed: reservedRevealed,
      };
      state.routeOffers[replacementIndex] = carried;
    } else {
      carried.hiddenComplication = reserved.hiddenComplication;
      carried.revealed = reservedRevealed;
      carried.carried = true;
      carried.chartedRevealed = reservedRevealed;
    }
    appendLog(state, 'route', `${routeDefinition(reserved.routeId).title} returns on the expedition chart.`);
  }
  state.reservedRoute = null;
  state.reservedRouteRevealed = false;
  appendLog(state, 'system', `Shift ${state.shift} begins. New missions are available.`);
}

function resolveShift(state: GameState, events: EngineEvent[]): void {
  const room = resolveRooms(state, events);
  resolveRoute(state, room, events);
  for (const module of state.modules) module.assignedCrew = null;
  state.routeLeader = null;

  if (state.integrity <= 0) {
    state.status = 'lost';
    state.phase = 'complete';
    state.endingText = 'Orison reaches zero hull and collapses.';
    emit(state, events, 'ending', state.endingText, 'negative');
    return;
  }
  if (allCrewIncapacitated(state)) {
    state.status = 'lost';
    state.phase = 'complete';
    state.endingText = 'No crew member is available to operate Orison.';
    emit(state, events, 'ending', state.endingText, 'negative');
    return;
  }
  if (state.shift >= 7) {
    if (state.heartNotes >= 3) {
      state.phase = 'finale';
      emit(state, events, 'progress', 'The Heart-Lode is open. Choose a final order.', 'mystic');
    } else {
      state.status = 'lost';
      state.phase = 'complete';
      state.endingText = 'Shift seven ends with fewer than 3 Heart Notes. The Heart-Lode closes.';
      emit(state, events, 'ending', state.endingText, 'negative');
    }
    return;
  }
  selectNextEvent(state, events);
}

function applyChoice(state: GameState, choice: EventChoice, events: EngineEvent[]): void {
  if (choice.resourceDelta) {
    for (const [id, amount] of Object.entries(choice.resourceDelta) as [ResourceId, number][]) addResource(state, id, amount);
  }
  if (choice.integrityDelta) state.integrity = Math.max(0, Math.min(maximumIntegrity(state), state.integrity + choice.integrityDelta));
  if (choice.noteDelta) state.heartNotes = Math.min(3, state.heartNotes + choice.noteDelta);
  if (choice.crewId && choice.loyaltyDelta) increaseLoyalty(state, choice.crewId, choice.loyaltyDelta, events);
  if (choice.crewId && choice.strainDelta) adjustStrain(state, choice.crewId, choice.strainDelta, events);
  appendLog(state, 'story', `${choice.label}: ${choice.consequence}`);
  emit(state, events, 'story', choice.consequence, choice.noteDelta ? 'mystic' : undefined);
}

function upgradeCost(module: ModuleState): number {
  const base = Math.max(4, moduleDefinition(module.id).buildCost);
  return base + module.level * 2;
}

function endingText(state: GameState, endingId: EndingId): string {
  const fulfilled = state.crew.filter((crew) => crew.vowProgress >= 3).length;
  const scarred = state.crew.filter((crew) => crew.scar).length;
  const coda = fulfilled > 0 ? `${fulfilled} vow${fulfilled === 1 ? '' : 's'} ring true in the final chord.` : 'Their unfinished vows remain in the stone.';
  const scars = scarred > 0 ? ` The moon keeps ${scarred} scar${scarred === 1 ? '' : 's'} as proof.` : '';
  const authored = ENDING_CONTENT.find((ending) => ending.id === endingId)?.epilogue;
  const crew = (id: CrewId) => state.crew.find((member) => member.id === id)!;
  const proven = (id: CrewId) => crew(id).vowProgress >= 3 || crew(id).loyalty >= 2;
  const personal = endingId === 'harvest'
    ? [
        proven('mara') ? 'Mara writes every living name above the cargo tally.' : 'Mara signs the extraction manifest and leaves the word rescue blank.',
        crew('tamsin').scar ? 'Tamsin’s scar keeps time with the jars in the hold.' : 'Tamsin never again calls a quiet seam harmless.',
        proven('orin') ? 'Orin scores the separated voices so none can be mistaken for silence.' : 'Orin locks his unfinished hymn where the drills cannot reach it.',
        proven('sable') ? 'Sable records the harvested minds as persons, not yield.' : 'Sable labels the voices evidence and does not play them aloud.',
      ]
    : endingId === 'harmonize'
      ? [
          proven('mara') ? 'Mara adds Vesper to the roll call and waits for its answer.' : 'Mara keeps one hand near the evacuation bell even while the moon sings her name.',
          crew('tamsin').scar ? 'Tamsin’s scar answers first when the lost delvers join the chord.' : 'Tamsin finally hears her old crew finish roll call.',
          proven('orin') ? 'Orin leaves the fifth line of his hymn open, and Vesper fills it.' : 'Orin listens without conducting for the first time in his life.',
          proven('sable') ? 'Sable revises memory is not proof to memory is a promise.' : 'Sable keeps one partition closed, not from fear but choice.',
        ]
      : [
          proven('mara') ? 'Mara seals the last gate only after every name answers.' : 'Mara carries the unanswered names in the margin of her oathbook.',
          crew('tamsin').scar ? 'Tamsin’s scar steadies when the final charge makes the deep quiet.' : 'Tamsin fires the charges and does not look away.',
          proven('orin') ? 'Orin writes a rest seven shifts long into the unfinished hymn.' : 'Orin hears the absent interval long after the moon falls quiet.',
          proven('sable') ? 'Sable deletes the makers’ commandment and keeps the memory of refusing it.' : 'Sable archives the sealed coordinates under a name no instrument can query.',
        ];
  return `${authored ?? 'The Heart-Lode answers, and the crew carry that answer into the dark.'} ${personal.join(' ')} ${coda}${scars}`;
}

export function applyCommand(input: GameState, command: Command): TransitionResult {
  assertLegal(input, command);
  const state = cloneState(input);
  const events: EngineEvent[] = [];

  if (command.type === 'select_route') {
    state.routeLeader = null;
    if (state.reservedRoute === command.instanceId) {
      state.resources.lumen += ROUTE_RESERVATION_COST;
      state.reservedRoute = null;
      state.reservedRouteRevealed = false;
      emit(state, events, 'progress', 'Chart released. One lumen restored.', 'positive');
    }
    state.selectedRoute = command.instanceId;
    const route = routeDefinition(state.routeOffers.find((offer) => offer.instanceId === command.instanceId)!.routeId);
    appendLog(state, 'route', `Course set for ${route.title}.`);
  } else if (command.type === 'reserve_route') {
    const replacing = state.reservedRoute !== null;
    if (!replacing) state.resources.lumen -= ROUTE_RESERVATION_COST;
    state.reservedRoute = command.instanceId;
    state.reservedRouteRevealed = state.routeOffers.find((offer) => offer.instanceId === command.instanceId)!.revealed;
    emit(state, events, 'progress', replacing ? 'Chart updated.' : 'Route charted for the next forecast.', 'mystic');
  } else if (command.type === 'clear_route_reservation') {
    state.resources.lumen += ROUTE_RESERVATION_COST;
    state.reservedRoute = null;
    state.reservedRouteRevealed = false;
    emit(state, events, 'progress', 'Chart released. One lumen restored.', 'positive');
  } else if (command.type === 'assign_crew') {
    state.routeLeader = null;
    for (const module of state.modules) if (module.assignedCrew === command.crewId) module.assignedCrew = null;
    const target = state.modules.find((module) => module.slot === command.slot)!;
    target.assignedCrew = command.crewId;
  } else if (command.type === 'assign_route_leader') {
    for (const module of state.modules) if (module.assignedCrew === command.crewId) module.assignedCrew = null;
    state.routeLeader = command.crewId;
  } else if (command.type === 'unassign_crew') {
    if (state.routeLeader === command.crewId) state.routeLeader = null;
    else {
      state.routeLeader = null;
      state.modules.find((module) => module.assignedCrew === command.crewId)!.assignedCrew = null;
    }
  } else if (command.type === 'resolve_shift') {
    resolveShift(state, events);
  } else if (command.type === 'choose_event') {
    const definition = storyEventDefinition(state.activeEvent!);
    applyChoice(state, definition.choices[command.choiceIndex]!, events);
    if (state.integrity <= 0) {
      state.status = 'lost';
      state.phase = 'complete';
      state.endingText = 'The event reduces Orison to zero hull.';
      emit(state, events, 'ending', state.endingText, 'negative');
    } else if (allCrewIncapacitated(state)) {
      state.status = 'lost';
      state.phase = 'complete';
      state.endingText = 'No crew member remains available after the event.';
      emit(state, events, 'ending', state.endingText, 'negative');
    } else {
      finishPostShift(state);
    }
  } else if (command.type === 'build_module') {
    const definition = moduleDefinition(command.moduleId);
    state.resources.alloy -= definition.buildCost;
    state.modules.push({ id: command.moduleId, slot: command.slot, level: 1, assignedCrew: null });
    state.modules.sort((left, right) => left.slot - right.slot);
    if (command.moduleId === 'resonance_chamber') progressVow(state, 'orin', events);
    appendLog(state, 'system', `${definition.name} built in room ${command.slot + 1}.`);
    emit(state, events, 'progress', `${definition.name} is built.`, 'positive');
    beginNextShift(state);
  } else if (command.type === 'upgrade_module') {
    const module = state.modules.find((candidate) => candidate.slot === command.slot)!;
    const cost = upgradeCost(module);
    state.resources.alloy -= cost;
    module.level += 1;
    if (module.id === 'resonance_chamber') progressVow(state, 'orin', events);
    appendLog(state, 'system', `${moduleDefinition(module.id).name} reaches level ${module.level}.`);
    emit(state, events, 'progress', `${moduleDefinition(module.id).name} is upgraded.`, 'positive');
    beginNextShift(state);
  } else if (command.type === 'repair_citadel') {
    const cost = emergencyPlatingCost(state);
    state.resources.alloy -= cost;
    const restored = Math.min(2, maximumIntegrity(state) - state.integrity);
    state.integrity += restored;
    appendLog(state, 'system', `Hull repair: −${cost} alloy, +${restored} hull.`);
    emit(state, events, 'progress', `Hull repaired by ${restored}.`, 'positive');
    beginNextShift(state);
  } else if (command.type === 'skip_development') {
    appendLog(state, 'system', 'Workshop skipped. No alloy spent.');
    emit(state, events, 'progress', 'Alloy saved.');
    beginNextShift(state);
  } else if (command.type === 'choose_ending') {
    state.ending = command.endingId;
    state.endingText = endingText(state, command.endingId);
    state.status = 'won';
    state.phase = 'complete';
    const ending = ENDING_CONTENT.find((candidate) => candidate.id === command.endingId);
    appendLog(state, 'story', `The expedition resolves: ${ending?.title ?? command.endingId}.`);
    emit(state, events, 'ending', state.endingText, 'mystic');
  }

  refreshRevelations(state);
  state.commandTrace.push(structuredClone(command));
  return { state, events };
}

export function selectGameView(state: GameState): GameView {
  return {
    state,
    crew: state.crew.map((crew) => ({ ...effectiveCrew().find((definition) => definition.id === crew.id)!, ...crew })),
    modules: state.modules.map((module) => ({
      ...moduleDefinition(module.id),
      ...module,
      forecast: module.assignedCrew ? forecastRoomAssignment(state, module.slot, module.assignedCrew) : null,
      upgradeCost: module.level < 3 ? upgradeCost(module) : null,
    })),
    routes: state.routeOffers.map((offer) => ({
      ...offer,
      definition: routeDefinition(offer.routeId),
      forecast: forecastRoute(state, offer),
    })),
    activeStoryEvent: state.activeEvent ? storyEventDefinition(state.activeEvent) : null,
    canResolveShift: state.phase === 'planning' && Boolean(state.selectedRoute) && assignedCount(state) === requiredAssignments(state),
    maxIntegrity: maximumIntegrity(state),
    repairCost: emergencyPlatingCost(state),
    scoreMultiplier: state.runMode === 'black_descent' ? 1.25 : 1,
    routeReservationCost: ROUTE_RESERVATION_COST,
    objective: state.heartNotes >= 3
      ? 'Survive until the seventh shift and answer the Heart-Lode.'
      : `Find ${3 - state.heartNotes} more Heart Note${3 - state.heartNotes === 1 ? '' : 's'} before shift seven.`,
  };
}

function assertGameState(value: unknown): asserts value is GameState {
  if (!value || typeof value !== 'object') throw new Error('Save does not contain an object.');
  const state = value as Partial<GameState>;
  if (state.version !== 5 || typeof state.seed !== 'string'
    || !['standard', 'black_descent'].includes(String(state.runMode))
    || !Array.isArray(state.crew) || !Array.isArray(state.modules)) {
    throw new Error('Save is not a supported Lode Choir game state.');
  }
  if (!Array.isArray(state.commandTrace) || !Array.isArray(state.routeOffers) || !state.resources) {
    throw new Error('Save is incomplete.');
  }
  if (state.startingRelic !== null && !RELICS.some((relic) => relic.id === state.startingRelic)) {
    throw new Error('Save contains an unknown starting relic.');
  }
  if (state.reservedRoute !== null && !state.routeOffers.some((offer) => offer.instanceId === state.reservedRoute)) {
    throw new Error('Save contains a stale route reservation.');
  }
}

export function serialize(state: GameState): string {
  const envelope: SerializedGameEnvelope = { game: 'lode-choir', version: 5, state };
  return JSON.stringify(envelope);
}

export function deserialize(serialized: string): GameState {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new Error('Save is not valid JSON.');
  }
  let candidate = value && typeof value === 'object' && 'game' in value
    ? (value as Partial<SerializedGameEnvelope>).state
    : value;
  if (candidate && typeof candidate === 'object' && (candidate as { version?: unknown }).version === 0) {
    const old = candidate as Record<string, unknown>;
    if (typeof old.seed !== 'string') throw new Error('Legacy save has no seed.');
    const migrated = createRun({ seed: old.seed });
    const compatibleKeys: readonly (keyof GameState)[] = [
      'rngState', 'shift', 'phase', 'status', 'resources', 'integrity', 'heartNotes', 'crew', 'modules',
      'routeOffers', 'selectedRoute', 'activeEvent', 'ending', 'endingText', 'storyFlags', 'commandTrace', 'log', 'logSeq',
    ];
    for (const key of compatibleKeys) {
      if (old[key] !== undefined) (migrated as unknown as Record<string, unknown>)[key] = old[key];
    }
    migrated.developmentChoices = Array.isArray(old.developmentChoices) ? old.developmentChoices as ModuleId[] : [];
    const relicFlag = migrated.storyFlags.find((flag) => flag.startsWith('relic:'))?.slice(6);
    migrated.startingRelic = canonicalRelicId(relicFlag);
    migrated.storyFlags = migrated.storyFlags.flatMap((flag) => {
      if (!flag.startsWith('relic:')) return [flag];
      const relicId = canonicalRelicId(flag.slice(6));
      return relicId ? [`relic:${relicId}`] : [];
    });
    candidate = migrated;
  }
  if (candidate && typeof candidate === 'object' && [1, 2, 3, 4].includes(Number((candidate as { version?: unknown }).version))) {
    const old = candidate as Record<string, unknown>;
    const flags = Array.isArray(old.storyFlags) ? old.storyFlags.filter((flag): flag is string => typeof flag === 'string') : [];
    const relicFlag = flags.find((flag) => flag.startsWith('relic:'))?.slice(6);
    const relicId = canonicalRelicId(old.startingRelic) ?? canonicalRelicId(relicFlag);
    old.version = 5;
    old.runMode = 'standard';
    old.routeLeader ??= null;
    old.reservedRoute ??= null;
    old.reservedRouteRevealed ??= false;
    old.startingRelic = relicId;
    old.storyFlags = flags.flatMap((flag) => {
      if (!flag.startsWith('relic:')) return [flag];
      const canonical = canonicalRelicId(flag.slice(6));
      return canonical ? [`relic:${canonical}`] : [];
    });
  }
  if (candidate && typeof candidate === 'object') {
    const record = candidate as Partial<GameState>;
    if (Array.isArray(record.routeOffers) && Array.isArray(record.modules)) {
      record.routeOffers = record.routeOffers.map((offer) => ({
        ...offer,
        carried: typeof offer.carried === 'boolean' ? offer.carried : false,
        chartedRevealed: typeof offer.chartedRevealed === 'boolean' ? offer.chartedRevealed : false,
      }));
      record.reservedRoute ??= null;
      record.reservedRouteRevealed ??= false;
      refreshRevelations(candidate as GameState);
    }
  }
  assertGameState(candidate);
  return cloneState(candidate);
}

export function replay(seed: string | CreateRunOptions, commands: readonly Command[]): GameState {
  let state = createRun(seed);
  for (const command of commands) state = applyCommand(state, command).state;
  return state;
}
