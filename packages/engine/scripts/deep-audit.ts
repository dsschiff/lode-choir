import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

import {
  applyCommand,
  createRun,
  scoreBreakdown,
  scoreRun,
  type RelicId,
  type RunMode,
} from '../src/index.ts';
import { playRun, type PolicyName } from '../test/helpers.ts';

const requestedSeeds = process.argv.find((argument) => argument.startsWith('--seeds='));
const seedCount = requestedSeeds ? Number(requestedSeeds.slice('--seeds='.length)) : 2_000;
if (!Number.isInteger(seedCount) || seedCount < 1 || seedCount > 10_000) throw new Error('Seed count must be an integer from 1 to 10,000.');
const requestedPrefix = process.argv.find((argument) => argument.startsWith('--prefix='));
const seedPrefix = requestedPrefix?.slice('--prefix='.length) || 'deep-audit';
const noWrite = process.argv.includes('--no-write');
if (!/^[a-z0-9-]{1,40}$/i.test(seedPrefix)) throw new Error('Seed prefix must use 1–40 letters, numbers, or hyphens.');
if (seedPrefix !== 'deep-audit' && !noWrite) throw new Error('A custom seed prefix requires --no-write so it cannot replace canonical evidence.');

const policies: readonly PolicyName[] = ['conservative', 'balanced', 'aggressive'];
const modes: readonly RunMode[] = ['standard', 'black_descent'];
const relics: readonly (RelicId | null)[] = [null, 'heart_splinter', 'vesper_tuning_fork', 'oathkeepers_latch'];
const charts = [false, true] as const;
type Cell = {
  runs: number;
  wins: number;
  integrity: number;
  notes: number;
  scars: number;
  score: number;
  repairs: number;
  reservations: number;
  carriedSelections: number;
  commands: number;
};

const keyFor = (mode: RunMode, policy: PolicyName, chart: boolean, relic: RelicId | null) =>
  `${mode}:${policy}:${chart ? 'chart' : 'base'}:${relic ?? 'none'}`;
const cells = new Map<string, Cell>();
for (const mode of modes) for (const policy of policies) for (const chart of charts) for (const relic of relics) {
  cells.set(keyFor(mode, policy, chart, relic), { runs: 0, wins: 0, integrity: 0, notes: 0, scars: 0, score: 0, repairs: 0, reservations: 0, carriedSelections: 0, commands: 0 });
}

let exactReplays = 0;
let weakestWin = Number.POSITIVE_INFINITY;
let strongestLoss = 0;
for (let seedIndex = 0; seedIndex < seedCount; seedIndex += 1) {
  const seed = `${seedPrefix}-${seedIndex}`;
  for (const mode of modes) for (const policy of policies) for (const chart of charts) for (const relicId of relics) {
    const options = { seed, runMode: mode, ...(relicId ? { relicId } : {}) };
    const run = playRun(createRun(options), policy, true, chart);
    assert.notEqual(run.status, 'playing');
    assert.equal(run.phase, 'complete');
    assert.ok(run.shift >= 1 && run.shift <= 7);
    assert.ok(run.integrity >= 0 && run.integrity <= 13);
    assert.ok(run.heartNotes >= 0 && run.heartNotes <= 3);
    assert.ok(Object.values(run.resources).every((value) => Number.isInteger(value) && value >= 0));
    assert.ok(run.crew.every((crew) => Number.isInteger(crew.strain) && crew.strain >= 0 && crew.strain <= 6));

    let replayed = createRun(options);
    let carriedSelections = 0;
    for (const command of run.commandTrace) {
      if (command.type === 'select_route' && replayed.routeOffers.find((offer) => offer.instanceId === command.instanceId)?.carried) carriedSelections += 1;
      replayed = applyCommand(replayed, command).state;
    }
    assert.deepEqual(replayed, run);
    exactReplays += 1;

    const breakdown = scoreBreakdown(run);
    assert.equal(breakdown.total, scoreRun(run));
    assert.equal(breakdown.total, Math.round(breakdown.base * breakdown.multiplier));
    if (run.status === 'won') weakestWin = Math.min(weakestWin, breakdown.total);
    else strongestLoss = Math.max(strongestLoss, breakdown.total);

    const cell = cells.get(keyFor(mode, policy, chart, relicId))!;
    cell.runs += 1;
    if (run.status === 'won') cell.wins += 1;
    cell.integrity += run.integrity;
    cell.notes += run.heartNotes;
    cell.scars += run.crew.filter((crew) => crew.scar).length;
    cell.score += breakdown.total;
    cell.repairs += run.commandTrace.filter((command) => command.type === 'repair_citadel').length;
    cell.reservations += run.commandTrace.filter((command) => command.type === 'reserve_route').length;
    cell.carriedSelections += carriedSelections;
    cell.commands += run.commandTrace.length;
  }
}

assert.ok(Number.isFinite(weakestWin), 'Deep audit found no winning run.');
assert.ok(weakestWin > strongestLoss, `A loss score ${strongestLoss} met or exceeded a win score ${weakestWin}.`);
const round = (value: number) => Math.round(value * 1_000) / 1_000;
const results = Object.fromEntries([...cells].map(([key, cell]) => [key, {
  runs: cell.runs,
  wins: cell.wins,
  winRate: round(cell.wins / cell.runs),
  meanIntegrity: round(cell.integrity / cell.runs),
  meanNotes: round(cell.notes / cell.runs),
  meanScars: round(cell.scars / cell.runs),
  meanScore: round(cell.score / cell.runs),
  meanCommands: round(cell.commands / cell.runs),
  repairs: cell.repairs,
  reservations: cell.reservations,
  carriedSelections: cell.carriedSelections,
}]));
const winsForMode = (mode: RunMode) => [...cells]
  .filter(([key]) => key.startsWith(`${mode}:`))
  .reduce((total, [, cell]) => total + cell.wins, 0);
const report = {
  schema: 'lode-choir-deep-audit-v1',
  seedCount,
  totalRuns: seedCount * modes.length * policies.length * charts.length * relics.length,
  exactReplays,
  scoreBoundary: { weakestWin, strongestLoss },
  modeWins: { standard: winsForMode('standard'), blackDescent: winsForMode('black_descent') },
  results,
};

const outputPath = new URL('../../../docs/deep-audit.json', import.meta.url);
if (!noWrite) await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.info(JSON.stringify({ output: noWrite ? null : outputPath.pathname, seedPrefix, ...report, results: `${Object.keys(results).length} cells` }, null, 2));
