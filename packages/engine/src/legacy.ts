import { ENDINGS, LORE, ROUTES, STORY_EVENTS } from './data/content.ts';
import type { EndingId, GameState, LegacyState, RelicId, RunRecord } from './types.ts';

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

function normalizeLore(values: readonly unknown[], runsCompleted: number): string[] {
  const validIds = new Set<string>(LORE.map((lore) => lore.id));
  const found = new Set(values.filter((value): value is string => typeof value === 'string' && validIds.has(value)));
  const tags = new Set<string>(runsCompleted > 0 ? ['first_run'] : []);
  for (const value of values) {
    if (typeof value !== 'string') continue;
    if (value.startsWith('tag:')) tags.add(value.slice(4));
    if (value.startsWith('route:')) {
      const route = ROUTES.find((candidate) => candidate.id === value.slice(6));
      if (route) tags.add(route.storyTag);
    }
    if (value.startsWith('event:')) {
      const event = STORY_EVENTS.find((candidate) => candidate.id === value.slice(6));
      event?.tags.forEach((tag) => tags.add(tag));
    }
  }
  for (const lore of LORE) if (tags.has(lore.unlockTag)) found.add(lore.id);
  return [...found];
}

export function createLegacyState(): LegacyState {
  return { version: 4, runsCompleted: 0, echoShards: 0, endings: [], lore: [], relics: [], records: [] };
}

export interface ScoreBreakdown {
  completion: number;
  shifts: number;
  heartNotes: number;
  integrity: number;
  fulfilledVows: number;
  loyalty: number;
  scars: number;
  base: number;
  multiplier: number;
  total: number;
}

export function scoreBreakdown(run: GameState): ScoreBreakdown {
  const vows = run.crew.filter((crew) => crew.vowProgress >= 3).length;
  const scars = run.crew.filter((crew) => crew.scar).length;
  const loyalty = run.crew.reduce((total, crew) => total + Math.max(0, crew.loyalty), 0);
  const components = {
    completion: run.status === 'won' ? 2000 : 0,
    shifts: run.shift * 50,
    heartNotes: run.heartNotes * 150,
    integrity: run.integrity * 25,
    fulfilledVows: vows * 100,
    loyalty: loyalty * 20,
    scars: scars === 0 ? 0 : scars * -75,
  };
  const base = Math.max(0, Object.values(components).reduce((total, value) => total + value, 0));
  const multiplier = run.runMode === 'black_descent' ? 1.25 : 1;
  return { ...components, base, multiplier, total: Math.round(base * multiplier) };
}

export function baseScoreRun(run: GameState): number {
  return scoreBreakdown(run).base;
}

export function scoreRun(run: GameState): number {
  return scoreBreakdown(run).total;
}

export function recordLegacyRun(legacy: LegacyState, run: GameState): LegacyState {
  const next = structuredClone(legacy);
  if (run.status === 'playing') return next;
  next.runsCompleted += 1;
  next.echoShards += Math.max(1, run.heartNotes);
  if (run.ending && !next.endings.includes(run.ending)) next.endings.push(run.ending);
  const relic = ENDINGS.find((ending) => ending.id === run.ending)?.unlockRelicId;
  if (relic && !next.relics.includes(relic)) next.relics.push(relic);
  const unlockTags = new Set(['first_run', ...run.storyFlags.filter((flag) => flag.startsWith('tag:')).map((flag) => flag.slice(4))]);
  for (const lore of LORE) {
    if (unlockTags.has(lore.unlockTag) && !next.lore.includes(lore.id)) next.lore.push(lore.id);
  }
  next.records.unshift({
    seed: run.seed,
    runMode: run.runMode,
    outcome: run.status,
    ending: run.ending,
    shift: run.shift,
    heartNotes: run.heartNotes,
    integrity: run.integrity,
    startingRelic: run.startingRelic,
    scoreVersion: 2,
    baseScore: baseScoreRun(run),
    scoreMultiplier: run.runMode === 'black_descent' ? 1.25 : 1,
    score: scoreRun(run),
    scars: run.crew.filter((crew) => crew.scar).length,
    fulfilledVows: run.crew.filter((crew) => crew.vowProgress >= 3).length,
  });
  next.records = next.records.slice(0, 12);
  return next;
}

export function serializeLegacy(legacy: LegacyState): string {
  return JSON.stringify({ game: 'lode-choir-legacy', version: 4, legacy });
}

function normalizeRecords(values: readonly unknown[]): RunRecord[] {
  const validEndings = new Set(ENDINGS.map((ending) => ending.id));
  return values.flatMap((value) => {
    if (!value || typeof value !== 'object') return [];
    const record = value as Partial<RunRecord>;
    if (typeof record.seed !== 'string' || !['won', 'lost'].includes(String(record.outcome))
      || typeof record.shift !== 'number' || typeof record.heartNotes !== 'number'
      || typeof record.integrity !== 'number' || typeof record.score !== 'number') return [];
    const startingRelic = record.startingRelic === null ? null : RELIC_ALIASES[String(record.startingRelic)] ?? null;
    const runMode = record.runMode === 'black_descent' ? 'black_descent' as const : 'standard' as const;
    const scoreMultiplier = runMode === 'black_descent' ? 1.25 : 1;
    const scoreVersion = record.scoreVersion === 2 ? 2 as const : 1 as const;
    const ending = record.ending === null || record.ending === undefined
      ? null
      : validEndings.has(record.ending) ? record.ending : null;
    return [{
      seed: record.seed,
      runMode,
      outcome: record.outcome as 'won' | 'lost',
      ending,
      shift: Math.max(1, Math.min(7, record.shift)),
      heartNotes: Math.max(0, Math.min(3, record.heartNotes)),
      integrity: Math.max(0, record.integrity),
      startingRelic,
      scoreVersion,
      baseScore: Math.max(0, Math.round(record.baseScore ?? record.score / scoreMultiplier)),
      scoreMultiplier,
      score: Math.max(0, Math.round(record.score)),
      scars: Math.max(0, Math.round(record.scars ?? 0)),
      fulfilledVows: Math.max(0, Math.round(record.fulfilledVows ?? 0)),
    }];
  }).slice(0, 12);
}

export function deserializeLegacy(serialized: string): LegacyState {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new Error('Legacy save is not valid JSON.');
  }
  if (!value || typeof value !== 'object') throw new Error('Legacy save is invalid.');
  const record = value as { game?: unknown; version?: unknown; legacy?: unknown } & Partial<LegacyState>;
  const candidate = record.game === 'lode-choir-legacy' ? record.legacy : value;
  if (!candidate || typeof candidate !== 'object') throw new Error('Legacy save is invalid.');
  const legacy = candidate as Partial<LegacyState> & { version?: unknown };
  if (![1, 2, 3, 4].includes(Number(legacy.version)) || !Array.isArray(legacy.endings) || !Array.isArray(legacy.lore) || !Array.isArray(legacy.relics)) {
    throw new Error('Legacy save version is unsupported.');
  }
  if (typeof legacy.runsCompleted !== 'number' || typeof legacy.echoShards !== 'number') throw new Error('Legacy save is incomplete.');
  const validEndings = new Set(ENDINGS.map((ending) => ending.id));
  return {
    version: 4,
    runsCompleted: Math.max(0, legacy.runsCompleted),
    echoShards: Math.max(0, legacy.echoShards),
    endings: [...new Set(legacy.endings.filter((ending): ending is EndingId => typeof ending === 'string' && validEndings.has(ending as EndingId)))],
    lore: normalizeLore(legacy.lore, legacy.runsCompleted),
    relics: [...new Set(legacy.relics
      .map((relic) => typeof relic === 'string' ? RELIC_ALIASES[relic] : undefined)
      .filter((relic): relic is RelicId => Boolean(relic)))],
    records: normalizeRecords(Array.isArray(legacy.records) ? legacy.records : []),
  };
}
