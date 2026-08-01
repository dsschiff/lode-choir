export type CrewId = 'mara' | 'tamsin' | 'orin' | 'sable';
export type ModuleId = 'heart_engine' | 'deep_drill' | 'ward_array' | 'foundry' | 'infirmary' | 'resonance_chamber';
export type ResourceId = 'provisions' | 'alloy' | 'lumen';
export type RouteKind = 'vein' | 'ruin' | 'refuge' | 'rift';
export type RunStatus = 'playing' | 'won' | 'lost';
export type RunPhase = 'planning' | 'event' | 'development' | 'finale' | 'complete';
export type EndingId = 'harvest' | 'harmonize' | 'seal';

export interface CrewDefinition {
  id: CrewId;
  name: string;
  role: string;
  epithet: string;
  talent: string;
  drawback: string;
  vow: string;
  signature: string;
  color: string;
}

export interface CrewState {
  id: CrewId;
  strain: number;
  loyalty: number;
  scar: string | null;
  incapacitatedUntil: number;
  vowProgress: number;
  signatureUnlocked: boolean;
}

export interface ModuleDefinition {
  id: ModuleId;
  name: string;
  description: string;
  assignmentHint: string;
  buildCost: number;
}

export interface ModuleState {
  id: ModuleId;
  slot: number;
  level: number;
  assignedCrew: CrewId | null;
}

export interface RouteDefinition {
  id: string;
  title: string;
  kind: RouteKind;
  description: string;
  rewardText: string;
  hazardText: string;
  baseRewards: Partial<Record<ResourceId, number>>;
  hazard: number;
  noteProgress: number;
  storyTag: string;
}

export interface RouteOffer {
  instanceId: string;
  routeId: string;
  hiddenComplication: string | null;
  revealed: boolean;
}

export interface EventChoice {
  label: string;
  consequence: string;
  resourceDelta?: Partial<Record<ResourceId, number>>;
  integrityDelta?: number;
  crewId?: CrewId;
  loyaltyDelta?: number;
  strainDelta?: number;
  noteDelta?: number;
}

export interface StoryEventDefinition {
  id: string;
  title: string;
  body: string;
  speaker: CrewId | 'orison';
  tags: readonly string[];
  choices: readonly EventChoice[];
}

export interface LogEntry {
  seq: number;
  shift: number;
  kind: 'system' | 'route' | 'crew' | 'story' | 'warning';
  text: string;
}

export interface GameState {
  version: 1;
  seed: string;
  rngState: number;
  shift: number;
  phase: RunPhase;
  status: RunStatus;
  resources: Record<ResourceId, number>;
  integrity: number;
  heartNotes: number;
  crew: CrewState[];
  modules: ModuleState[];
  routeOffers: RouteOffer[];
  selectedRoute: string | null;
  activeEvent: string | null;
  developmentChoices: ModuleId[];
  ending: EndingId | null;
  endingText: string | null;
  storyFlags: string[];
  commandTrace: Command[];
  log: LogEntry[];
  logSeq: number;
}

export interface CreateRunOptions {
  seed: string;
  relicId?: string;
}

export interface SerializedGameEnvelope {
  game: 'lode-choir';
  version: 1;
  state: GameState;
}

export interface LegacyState {
  version: 1;
  runsCompleted: number;
  echoShards: number;
  endings: EndingId[];
  lore: string[];
  relics: string[];
}

export type Command =
  | { type: 'select_route'; instanceId: string }
  | { type: 'assign_crew'; crewId: CrewId; slot: number }
  | { type: 'unassign_crew'; crewId: CrewId }
  | { type: 'resolve_shift' }
  | { type: 'choose_event'; choiceIndex: number }
  | { type: 'build_module'; moduleId: ModuleId; slot: number }
  | { type: 'upgrade_module'; slot: number }
  | { type: 'choose_ending'; endingId: EndingId };

export interface EngineEvent {
  id: number;
  kind: 'room' | 'route' | 'damage' | 'story' | 'progress' | 'ending';
  text: string;
  emphasis?: 'positive' | 'negative' | 'mystic';
}

export interface TransitionResult {
  state: GameState;
  events: EngineEvent[];
}

export interface GameView {
  state: Readonly<GameState>;
  crew: ReadonlyArray<CrewState & CrewDefinition>;
  modules: ReadonlyArray<ModuleState & ModuleDefinition>;
  routes: ReadonlyArray<RouteOffer & { definition: RouteDefinition }>;
  activeStoryEvent: StoryEventDefinition | null;
  canResolveShift: boolean;
  objective: string;
}

