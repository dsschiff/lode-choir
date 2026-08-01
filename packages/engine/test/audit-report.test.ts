import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

type AuditCell = {
  runs: number;
  wins: number;
  winRate: number;
  meanIntegrity: number;
  meanNotes: number;
  meanScars: number;
  meanScore: number;
  meanCommands: number;
  repairs: number;
  reservations: number;
  carriedSelections: number;
};

test('committed deep-audit evidence is complete and internally consistent', async () => {
  const serialized = await readFile(new URL('../../../docs/deep-audit.json', import.meta.url), 'utf8');
  const report = JSON.parse(serialized) as {
    schema: string;
    seedCount: number;
    totalRuns: number;
    exactReplays: number;
    scoreBoundary: { weakestWin: number; strongestLoss: number };
    modeWins: { standard: number; blackDescent: number };
    results: Record<string, AuditCell>;
  };
  const cells = Object.entries(report.results);

  assert.equal(report.schema, 'lode-choir-deep-audit-v1');
  assert.equal(report.seedCount, 10_000);
  assert.equal(report.totalRuns, 480_000);
  assert.equal(report.exactReplays, report.totalRuns);
  assert.equal(cells.length, 48);
  assert.equal(cells.reduce((total, [, cell]) => total + cell.runs, 0), report.totalRuns);
  assert.equal(cells.filter(([key]) => key.startsWith('standard:')).reduce((total, [, cell]) => total + cell.wins, 0), report.modeWins.standard);
  assert.equal(cells.filter(([key]) => key.startsWith('black_descent:')).reduce((total, [, cell]) => total + cell.wins, 0), report.modeWins.blackDescent);
  assert.ok(report.scoreBoundary.weakestWin > report.scoreBoundary.strongestLoss);

  for (const [key, cell] of cells) {
    assert.equal(cell.runs, report.seedCount, `${key} is incomplete.`);
    assert.equal(cell.winRate, Math.round((cell.wins / cell.runs) * 1_000) / 1_000, `${key} has a stale win rate.`);
    assert.ok(cell.wins >= 0 && cell.wins <= cell.runs, `${key} has impossible wins.`);
    assert.ok(cell.meanIntegrity >= 0 && cell.meanIntegrity <= 13, `${key} has impossible mean hull.`);
    assert.ok(cell.meanNotes >= 0 && cell.meanNotes <= 3, `${key} has impossible mean Notes.`);
    assert.ok(cell.meanScars >= 0 && cell.meanScars <= 4, `${key} has impossible mean scars.`);
    assert.ok(cell.meanScore >= 0 && cell.meanCommands > 0, `${key} has invalid means.`);
    assert.ok(cell.repairs >= 0 && cell.reservations >= 0 && cell.carriedSelections >= 0, `${key} has invalid action counts.`);
    assert.ok(cell.carriedSelections <= cell.reservations, `${key} selected more carried routes than it reserved.`);
  }
});
