import { ENDINGS, LORE } from './data/content.ts';
import type { GameState, LegacyState } from './types.ts';

export function createLegacyState(): LegacyState {
  return { version: 1, runsCompleted: 0, echoShards: 0, endings: [], lore: [], relics: [] };
}

export function recordLegacyRun(legacy: LegacyState, run: GameState): LegacyState {
  const next = structuredClone(legacy);
  if (run.status !== 'won' || !run.ending) return next;
  next.runsCompleted += 1;
  next.echoShards += Math.max(1, run.heartNotes + run.crew.filter((crew) => crew.vowProgress >= 3).length);
  if (!next.endings.includes(run.ending)) next.endings.push(run.ending);
  const relic = ENDINGS.find((ending) => ending.id === run.ending)?.unlockRelicId;
  if (relic && !next.relics.includes(relic)) next.relics.push(relic);
  const unlockTags = new Set(['first_run', ...run.storyFlags.filter((flag) => flag.startsWith('tag:')).map((flag) => flag.slice(4))]);
  for (const lore of LORE) {
    if (unlockTags.has(lore.unlockTag) && !next.lore.includes(lore.id)) next.lore.push(lore.id);
  }
  return next;
}

export function serializeLegacy(legacy: LegacyState): string {
  return JSON.stringify({ game: 'lode-choir-legacy', version: 1, legacy });
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
  const legacy = candidate as Partial<LegacyState>;
  if (legacy.version !== 1 || !Array.isArray(legacy.endings) || !Array.isArray(legacy.lore) || !Array.isArray(legacy.relics)) {
    throw new Error('Legacy save version is unsupported.');
  }
  if (typeof legacy.runsCompleted !== 'number' || typeof legacy.echoShards !== 'number') throw new Error('Legacy save is incomplete.');
  return structuredClone(legacy as LegacyState);
}
