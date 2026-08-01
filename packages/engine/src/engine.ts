import { CREW, ENDINGS as ENDING_CONTENT, MODULES, ROUTES, STORY_EVENTS } from './data/content.ts';
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
  RouteDefinition,
  RouteOffer,
  SerializedGameEnvelope,
  StoryEventDefinition,
  TransitionResult,
} from './types.ts';

const MAX_INTEGRITY = 12;
const MAX_STRAIN = 6;
const DEVELOPMENT_SHIFTS = new Set([2, 4]);
const STARTER_MODULES: readonly ModuleId[] = ['heart_engine', 'deep_drill', 'ward_array'];
const CREW_IDS: readonly CrewId[] = ['mara', 'tamsin', 'orin', 'sable'];

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
      ? rng.pick(['A false echo obscures the true depth.', 'The stone is under singing pressure.', 'Something below is moving in time with Orison.'])
      : null,
    revealed: false,
  }));
  state.rngState = rng.state;
  return offers;
}

function applyRelic(state: GameState, relicId: string | undefined): void {
  if (!relicId) return;
  state.storyFlags.push(`relic:${relicId}`);
  if (relicId === 'brass-seed') state.resources.alloy += 2;
  if (relicId === 'quiet-bell') state.resources.lumen += 1;
  if (relicId === 'pilgrim-thread') state.resources.provisions += 2;
  if (relicId === 'heart_splinter') {
    state.resources.alloy += 2;
    state.crew.find((crew) => crew.id === 'tamsin')!.strain += 1;
  }
  if (relicId === 'vesper_tuning_fork') {
    state.heartNotes += 1;
    state.resources.lumen = Math.max(0, state.resources.lumen - 1);
  }
  if (relicId === 'oathkeepers_latch') {
    state.integrity += 2;
    state.resources.alloy = Math.max(0, state.resources.alloy - 1);
  }
}

function maximumIntegrity(state: GameState): number {
  return state.storyFlags.includes('relic:oathkeepers_latch') ? MAX_INTEGRITY + 2 : MAX_INTEGRITY;
}

export function createRun(options: CreateRunOptions | string): GameState {
  const normalized = typeof options === 'string' ? { seed: options } : options;
  if (normalized.seed.trim().length === 0) throw new Error('A non-empty seed is required.');
  const state: GameState = {
    version: 1,
    seed: normalized.seed,
    rngState: 0,
    shift: 1,
    phase: 'planning',
    status: 'playing',
    resources: { provisions: 8, alloy: 5, lumen: 2 },
    integrity: MAX_INTEGRITY,
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
  appendLog(state, 'system', 'Orison wakes beneath the singing crust. Choose a route and crew the citadel.');
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
    for (const crew of state.crew) {
      if (!crewAvailable(state, crew.id)) continue;
      if (state.modules.some((module) => module.assignedCrew === crew.id)) {
        commands.push({ type: 'unassign_crew', crewId: crew.id });
      }
      for (const module of state.modules) commands.push({ type: 'assign_crew', crewId: crew.id, slot: module.slot });
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
  if (state.phase === 'development') return developmentCommands(state);
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
    emit(state, events, 'damage', `${name} breaks beneath the moon-song.`, 'negative');
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
    const definition = effectiveCrew().find((candidate) => candidate.id === crewId);
    emit(state, events, 'progress', `${definition?.name ?? crewId} fulfills a personal vow.`, 'mystic');
  }
}

interface RoomResolution {
  ward: number;
  repair: number;
}

function resolveRooms(state: GameState, events: EngineEvent[]): RoomResolution {
  let ward = 0;
  let repair = 0;
  for (const module of state.modules) {
    const crewId = module.assignedCrew;
    if (!crewId) continue;
    const crew = state.crew.find((candidate) => candidate.id === crewId)!;
    const heartAdjacency = module.id !== 'heart_engine' && hasAdjacentModule(state, module, 'heart_engine') ? 1 : 0;
    const orinBonus = crewId === 'orin' && crew.signatureUnlocked ? 1 : 0;
    const strength = module.level + heartAdjacency + orinBonus;
    if (module.id === 'heart_engine') {
      addResource(state, 'lumen', strength);
      if (crewId !== 'sable') adjustStrain(state, crewId, -1, events);
      emit(state, events, 'room', `The Heart Engine draws ${strength} lumen.`, 'positive');
    } else if (module.id === 'deep_drill') {
      const penalty = crewId === 'orin' ? 1 : 0;
      const bonus = crewId === 'tamsin' ? (crew.signatureUnlocked ? 2 : 1) : 0;
      const output = Math.max(1, strength * 2 - penalty + bonus);
      addResource(state, 'alloy', output);
      adjustStrain(state, crewId, 1, events);
      emit(state, events, 'room', `The Deep Drill returns ${output} alloy.`, 'positive');
    } else if (module.id === 'ward_array') {
      ward += strength;
      repair += Math.ceil(module.level / 2) + (crewId === 'orin' ? 1 : 0);
      emit(state, events, 'room', `The Ward Array raises ${strength} layers of protection.`);
    } else if (module.id === 'foundry') {
      const drillBonus = hasAdjacentModule(state, module, 'deep_drill') ? 1 : 0;
      const output = strength + drillBonus;
      addResource(state, 'alloy', output);
      emit(state, events, 'room', `The Foundry refines ${output} alloy.`, 'positive');
    } else if (module.id === 'infirmary') {
      for (const target of state.crew) adjustStrain(state, target.id, -module.level, events);
      emit(state, events, 'room', 'The Infirmary lowers the crew’s strain.', 'positive');
    } else if (module.id === 'resonance_chamber') {
      addResource(state, 'lumen', strength);
      if (module.level >= 2) state.heartNotes += 1;
      emit(state, events, 'room', `The Resonance Chamber clarifies ${strength} lumen.`, 'mystic');
    }
    increaseLoyalty(state, crewId, 1, events);
  }
  if (repair > 0) state.integrity = Math.min(maximumIntegrity(state), state.integrity + repair);
  return { ward, repair };
}

function resolveRoute(state: GameState, room: RoomResolution, events: EngineEvent[]): void {
  const offer = state.routeOffers.find((candidate) => candidate.instanceId === state.selectedRoute)!;
  const route = routeDefinition(offer.routeId);
  for (const [id, amount] of Object.entries(route.baseRewards) as [ResourceId, number][]) addResource(state, id, amount);
  let noteProgress = route.noteProgress;
  const sable = state.crew.find((candidate) => candidate.id === 'sable')!;
  if (sable.signatureUnlocked && offer.revealed && route.kind === 'rift') noteProgress += 1;
  state.heartNotes += noteProgress;

  const maraInWard = state.modules.some((module) => module.id === 'ward_array' && module.assignedCrew === 'mara');
  const mara = state.crew.find((candidate) => candidate.id === 'mara')!;
  const mitigation = room.ward + (maraInWard && mara.signatureUnlocked ? 1 : 0);
  const damage = Math.max(0, route.hazard - mitigation);
  state.integrity = Math.max(0, state.integrity - damage);
  if (state.resources.provisions > 0) state.resources.provisions -= 1;
  else state.integrity = Math.max(0, state.integrity - 1);

  for (const module of state.modules) {
    if (!module.assignedCrew) continue;
    const routeStrain = route.hazard >= 4 ? 2 : route.hazard >= 2 ? 1 : 0;
    const scarPenalty = state.crew.find((crew) => crew.id === module.assignedCrew)?.scar ? 1 : 0;
    const tamsinPenalty = module.assignedCrew === 'tamsin' && route.hazard >= 3 ? 1 : 0;
    adjustStrain(state, module.assignedCrew, routeStrain + scarPenalty + tamsinPenalty, events);
  }
  const assigned = new Set(state.modules.map((module) => module.assignedCrew));
  for (const crew of state.crew) {
    if (!assigned.has(crew.id) && crewAvailable(state, crew.id)) adjustStrain(state, crew.id, -2, events);
  }
  if (state.modules.some((module) => module.assignedCrew === 'tamsin')) {
    addResource(state, 'alloy', route.hazard >= 3 ? 2 : 1);
  }

  if (damage === 0) progressVow(state, 'mara', events);
  if (route.hazard >= 3 && state.modules.some((module) => module.assignedCrew === 'tamsin')) progressVow(state, 'tamsin', events);
  if (room.repair > 0 || state.modules.some((module) => module.id === 'resonance_chamber' && module.assignedCrew === 'orin')) progressVow(state, 'orin', events);
  if (offer.revealed) progressVow(state, 'sable', events);

  state.storyFlags.push(`route:${route.id}`);
  if (!state.storyFlags.includes(`tag:${route.storyTag}`)) state.storyFlags.push(`tag:${route.storyTag}`);
  appendLog(state, 'route', `${route.title}: ${route.rewardText}${damage > 0 ? ` The citadel loses ${damage} integrity.` : ' The wards hold.'}`);
  emit(state, events, 'route', `${route.title} yields its secret.`, noteProgress > 0 ? 'mystic' : 'positive');
  if (damage > 0) emit(state, events, 'damage', `The citadel loses ${damage} integrity.`, 'negative');
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
  const choices = new Set<ModuleId>();
  for (const command of developmentCommands(state)) {
    if (command.type === 'build_module') choices.add(command.moduleId);
    if (command.type === 'upgrade_module') {
      const module = state.modules.find((candidate) => candidate.slot === command.slot);
      if (module) choices.add(module.id);
    }
  }
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
  state.shift += 1;
  state.phase = 'planning';
  state.developmentChoices = [];
  state.selectedRoute = null;
  state.activeEvent = null;
  for (const module of state.modules) module.assignedCrew = null;
  const rng = rngFromState(state.rngState);
  state.routeOffers = rollOffers(state, rng);
  appendLog(state, 'system', `Shift ${state.shift} begins. The moon’s song changes key.`);
}

function resolveShift(state: GameState, events: EngineEvent[]): void {
  const room = resolveRooms(state, events);
  resolveRoute(state, room, events);
  for (const module of state.modules) module.assignedCrew = null;

  if (state.integrity <= 0) {
    state.status = 'lost';
    state.phase = 'complete';
    state.endingText = 'Orison folds inward as the moon closes its hand.';
    emit(state, events, 'ending', state.endingText, 'negative');
    return;
  }
  if (allCrewIncapacitated(state)) {
    state.status = 'lost';
    state.phase = 'complete';
    state.endingText = 'No one remains awake to answer the citadel.';
    emit(state, events, 'ending', state.endingText, 'negative');
    return;
  }
  if (state.shift >= 7) {
    if (state.heartNotes >= 3) {
      state.phase = 'finale';
      emit(state, events, 'progress', 'The Heart-Lode opens beneath Orison.', 'mystic');
    } else {
      state.status = 'lost';
      state.phase = 'complete';
      state.endingText = 'Seven shifts pass. Without the three Notes, the Heart-Lode seals forever.';
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
  if (choice.noteDelta) state.heartNotes += choice.noteDelta;
  if (choice.crewId && choice.loyaltyDelta) increaseLoyalty(state, choice.crewId, choice.loyaltyDelta, events);
  if (choice.crewId && choice.strainDelta) adjustStrain(state, choice.crewId, choice.strainDelta, events);
  appendLog(state, 'story', `${choice.label}: ${choice.consequence}`);
  emit(state, events, 'story', choice.consequence, choice.noteDelta ? 'mystic' : undefined);
}

function upgradeCost(module: ModuleState): number {
  return moduleDefinition(module.id).buildCost + module.level;
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
    state.selectedRoute = command.instanceId;
    const route = routeDefinition(state.routeOffers.find((offer) => offer.instanceId === command.instanceId)!.routeId);
    appendLog(state, 'route', `Course set for ${route.title}.`);
  } else if (command.type === 'assign_crew') {
    for (const module of state.modules) if (module.assignedCrew === command.crewId) module.assignedCrew = null;
    const target = state.modules.find((module) => module.slot === command.slot)!;
    target.assignedCrew = command.crewId;
    if (command.crewId === 'sable') {
      for (const offer of state.routeOffers) offer.revealed = true;
    }
  } else if (command.type === 'unassign_crew') {
    const target = state.modules.find((module) => module.assignedCrew === command.crewId)!;
    target.assignedCrew = null;
  } else if (command.type === 'resolve_shift') {
    resolveShift(state, events);
  } else if (command.type === 'choose_event') {
    const definition = storyEventDefinition(state.activeEvent!);
    applyChoice(state, definition.choices[command.choiceIndex]!, events);
    if (state.integrity <= 0) {
      state.status = 'lost';
      state.phase = 'complete';
      state.endingText = 'A choice made in the moon’s shadow leaves Orison without a heartbeat.';
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
    appendLog(state, 'system', `${definition.name} joins the citadel.`);
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
  } else if (command.type === 'choose_ending') {
    state.ending = command.endingId;
    state.endingText = endingText(state, command.endingId);
    state.status = 'won';
    state.phase = 'complete';
    appendLog(state, 'story', state.endingText);
    emit(state, events, 'ending', state.endingText, 'mystic');
  }

  state.commandTrace.push(structuredClone(command));
  return { state, events };
}

export function selectGameView(state: GameState): GameView {
  return {
    state,
    crew: state.crew.map((crew) => ({ ...effectiveCrew().find((definition) => definition.id === crew.id)!, ...crew })),
    modules: state.modules.map((module) => ({ ...moduleDefinition(module.id), ...module })),
    routes: state.routeOffers.map((offer) => ({ ...offer, definition: routeDefinition(offer.routeId) })),
    activeStoryEvent: state.activeEvent ? storyEventDefinition(state.activeEvent) : null,
    canResolveShift: state.phase === 'planning' && Boolean(state.selectedRoute) && assignedCount(state) === requiredAssignments(state),
    objective: state.heartNotes >= 3
      ? 'Survive until the seventh shift and answer the Heart-Lode.'
      : `Find ${3 - state.heartNotes} more Heart Note${3 - state.heartNotes === 1 ? '' : 's'} before shift seven.`,
  };
}

function assertGameState(value: unknown): asserts value is GameState {
  if (!value || typeof value !== 'object') throw new Error('Save does not contain an object.');
  const state = value as Partial<GameState>;
  if (state.version !== 1 || typeof state.seed !== 'string' || !Array.isArray(state.crew) || !Array.isArray(state.modules)) {
    throw new Error('Save is not a supported Lode Choir game state.');
  }
  if (!Array.isArray(state.commandTrace) || !Array.isArray(state.routeOffers) || !state.resources) {
    throw new Error('Save is incomplete.');
  }
}

export function serialize(state: GameState): string {
  const envelope: SerializedGameEnvelope = { game: 'lode-choir', version: 1, state };
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
    candidate = migrated;
  }
  assertGameState(candidate);
  return cloneState(candidate);
}

export function replay(seed: string | CreateRunOptions, commands: readonly Command[]): GameState {
  let state = createRun(seed);
  for (const command of commands) state = applyCommand(state, command).state;
  return state;
}
