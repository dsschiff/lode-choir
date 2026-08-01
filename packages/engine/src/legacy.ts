import { ENDINGS, LORE, ROUTES, STORY_EVENTS } from './data/content.ts';
import type { EndingId, GameState, LegacyState, RelicId } from './types.ts';

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
  return { version: 2, runsCompleted: 0, echoShards: 0, endings: [], lore: [], relics: [] };
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
  return next;
}

export function serializeLegacy(legacy: LegacyState): string {
  return JSON.stringify({ game: 'lode-choir-legacy', version: 2, legacy });
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
  if (![1, 2].includes(Number(legacy.version)) || !Array.isArray(legacy.endings) || !Array.isArray(legacy.lore) || !Array.isArray(legacy.relics)) {
    throw new Error('Legacy save version is unsupported.');
  }
  if (typeof legacy.runsCompleted !== 'number' || typeof legacy.echoShards !== 'number') throw new Error('Legacy save is incomplete.');
  const validEndings = new Set(ENDINGS.map((ending) => ending.id));
  return {
    version: 2,
    runsCompleted: Math.max(0, legacy.runsCompleted),
    echoShards: Math.max(0, legacy.echoShards),
    endings: [...new Set(legacy.endings.filter((ending): ending is EndingId => typeof ending === 'string' && validEndings.has(ending as EndingId)))],
    lore: normalizeLore(legacy.lore, legacy.runsCompleted),
    relics: [...new Set(legacy.relics
      .map((relic) => typeof relic === 'string' ? RELIC_ALIASES[relic] : undefined)
      .filter((relic): relic is RelicId => Boolean(relic)))],
  };
}
