import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, replay, type CrewId, type RunStatus } from '../src/index.ts';
import { playRun, type PolicyName } from './helpers.ts';

test('500 seeds terminate under three policies with reproducible valid states', () => {
  const policies: readonly PolicyName[] = ['conservative', 'balanced', 'aggressive'];
  const totals = new Map<PolicyName, Record<RunStatus, number>>(
    policies.map((policy) => [policy, { playing: 0, won: 0, lost: 0 }]),
  );
  const baselineWins = new Map<PolicyName, number>(policies.map((policy) => [policy, 0]));
  const leaderCrew = new Set<CrewId>();

  for (let seedIndex = 0; seedIndex < 500; seedIndex += 1) {
    const seed = `simulation-${seedIndex}`;
    for (const policy of policies) {
      const run = playRun(createRun({ seed }), policy);
      const baseline = playRun(createRun({ seed }), policy, false);
      totals.get(policy)![run.status] += 1;
      if (baseline.status === 'won') baselineWins.set(policy, baselineWins.get(policy)! + 1);
      for (const command of run.commandTrace) {
        if (command.type === 'assign_route_leader') leaderCrew.add(command.crewId);
      }
      assert.notEqual(run.status, 'playing');
      assert.equal(run.phase, 'complete');
      assert.ok(run.shift <= 7);
      assert.ok(run.integrity >= 0 && run.integrity <= 12);
      assert.ok(run.heartNotes >= 0 && run.heartNotes <= 3);
      assert.ok(Object.values(run.resources).every((value) => value >= 0));
      assert.ok(run.crew.every((crew) => crew.strain >= 0 && crew.strain <= 6));
      assert.deepEqual(replay(seed, run.commandTrace), run);
    }
  }

  for (const policy of policies) {
    assert.ok(totals.get(policy)!.won > 0, `Expected ${policy} to find at least one win: ${JSON.stringify(Object.fromEntries(totals))}`);
    assert.ok(totals.get(policy)!.lost > 0, `Expected ${policy} to remain fallible: ${JSON.stringify(Object.fromEntries(totals))}`);
    assert.ok(
      Math.abs(totals.get(policy)!.won - baselineWins.get(policy)!) <= 50,
      `Adaptive leadership changed ${policy} by more than ten points: leaders=${totals.get(policy)!.won}, rest=${baselineWins.get(policy)}`,
    );
  }
  assert.deepEqual([...leaderCrew].sort(), ['mara', 'orin', 'sable', 'tamsin']);
});
