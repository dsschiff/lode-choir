import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, replay, type RunStatus } from '../src/index.ts';
import { playRun, type PolicyName } from './helpers.ts';

test('500 seeds terminate under three policies with reproducible valid states', () => {
  const policies: readonly PolicyName[] = ['conservative', 'balanced', 'aggressive'];
  const totals = new Map<PolicyName, Record<RunStatus, number>>(
    policies.map((policy) => [policy, { playing: 0, won: 0, lost: 0 }]),
  );

  for (let seedIndex = 0; seedIndex < 500; seedIndex += 1) {
    const seed = `simulation-${seedIndex}`;
    for (const policy of policies) {
      const run = playRun(createRun({ seed }), policy);
      totals.get(policy)![run.status] += 1;
      assert.notEqual(run.status, 'playing');
      assert.equal(run.phase, 'complete');
      assert.ok(run.shift <= 7);
      assert.ok(run.integrity >= 0 && run.integrity <= 12);
      assert.ok(Object.values(run.resources).every((value) => value >= 0));
      assert.ok(run.crew.every((crew) => crew.strain >= 0 && crew.strain <= 6));
      assert.deepEqual(replay(seed, run.commandTrace), run);
    }
  }

  const winningPolicies = policies.filter((policy) => totals.get(policy)!.won > 0);
  assert.ok(winningPolicies.length >= 2, `Expected at least two winning policies, got ${JSON.stringify(Object.fromEntries(totals))}`);
});
