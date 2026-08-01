import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, createRun, replay, type CrewId, type RelicId, type RunStatus } from '../src/index.ts';
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
  console.info('leadership-audit', JSON.stringify({ totals: Object.fromEntries(totals), baselineWins: Object.fromEntries(baselineWins) }));
  assert.deepEqual([...leaderCrew].sort(), ['mara', 'orin', 'sable', 'tamsin']);
});

test('500 seeds keep all four relic loadouts bounded under every policy', () => {
  const policies: readonly PolicyName[] = ['conservative', 'balanced', 'aggressive'];
  const loadouts: readonly (RelicId | null)[] = [null, 'heart_splinter', 'vesper_tuning_fork', 'oathkeepers_latch'];

  for (const policy of policies) {
    const results = new Map<string, { wins: number; integrity: number; notes: number; scars: number; repairs: number }>();
    for (const relicId of loadouts) results.set(relicId ?? 'none', { wins: 0, integrity: 0, notes: 0, scars: 0, repairs: 0 });

    for (let seedIndex = 0; seedIndex < 500; seedIndex += 1) {
      const seed = `relic-simulation-${seedIndex}`;
      for (const relicId of loadouts) {
        const options = { seed, ...(relicId ? { relicId } : {}) };
        const run = playRun(createRun(options), policy);
        const totals = results.get(relicId ?? 'none')!;
        if (run.status === 'won') totals.wins += 1;
        totals.integrity += run.integrity;
        totals.notes += run.heartNotes;
        totals.scars += run.crew.filter((crew) => crew.scar).length;
        totals.repairs += run.commandTrace.filter((command) => command.type === 'repair_citadel').length;
        assert.notEqual(run.status, 'playing');
        assert.deepEqual(replay(options, run.commandTrace), run);
      }
    }

    const summary = Object.fromEntries([...results].map(([id, result]) => [id, {
      wins: result.wins,
      meanIntegrity: result.integrity / 500,
      meanNotes: result.notes / 500,
      meanScars: result.scars / 500,
      meanRepairs: result.repairs / 500,
    }]));
    console.info(`relic-audit:${policy}`, JSON.stringify(summary));
    const wins = [...results.values()].map((result) => result.wins);
    const noRelicWins = results.get('none')!.wins;
    assert.ok(Math.max(...wins) - Math.min(...wins) <= 100, `Relic spread exceeded twenty points for ${policy}: ${JSON.stringify(summary)}`);
    for (const [relicId, result] of results) {
      assert.ok(result.wins - noRelicWins <= 125, `${relicId} exceeded the no-relic run by twenty-five points for ${policy}: ${JSON.stringify(summary)}`);
    }
  }
});

test('500 seeds keep route charting optional, deterministic, and strategically used', () => {
  const policies: readonly PolicyName[] = ['conservative', 'balanced', 'aggressive'];
  for (const policy of policies) {
    let baselineWins = 0;
    let chartedWins = 0;
    let reservations = 0;
    let carriedSelections = 0;
    for (let seedIndex = 0; seedIndex < 500; seedIndex += 1) {
      const seed = `chart-simulation-${seedIndex}`;
      const baseline = playRun(createRun({ seed }), policy, true, false);
      const charted = playRun(createRun({ seed }), policy, true, true);
      if (baseline.status === 'won') baselineWins += 1;
      if (charted.status === 'won') chartedWins += 1;
      let replayState = createRun({ seed });
      for (const command of charted.commandTrace) {
        if (command.type === 'reserve_route') reservations += 1;
        if (command.type === 'select_route' && replayState.routeOffers.find((offer) => offer.instanceId === command.instanceId)?.carried) {
          carriedSelections += 1;
        }
        replayState = applyCommand(replayState, command).state;
      }
      assert.deepEqual(replayState, charted);
    }
    console.info(`chart-audit:${policy}`, JSON.stringify({ baselineWins, chartedWins, reservations, carriedSelections }));
    assert.ok(reservations >= 250, `Expected charting to recur for ${policy}.`);
    assert.ok(carriedSelections >= reservations * 0.15, `Expected ${policy} to choose at least fifteen percent of carried routes.`);
    assert.ok(Math.abs(chartedWins - baselineWins) <= 75, `Charting changed ${policy} by more than fifteen points.`);
  }
});

test('500 matched seeds keep Black Descent harder, viable, replayable, and relic-bounded', () => {
  const policies: readonly PolicyName[] = ['conservative', 'balanced', 'aggressive'];
  const relics: readonly (RelicId | null)[] = [null, 'heart_splinter', 'vesper_tuning_fork', 'oathkeepers_latch'];
  const modes = ['standard', 'black_descent'] as const;
  type Cell = { wins: number; reservations: number; carriedSelections: number; repairs: number };
  const results = new Map<string, Cell>();
  const cellKey = (mode: typeof modes[number], policy: PolicyName, chart: boolean, relicId: RelicId | null) =>
    `${mode}:${policy}:${chart ? 'chart' : 'base'}:${relicId ?? 'none'}`;
  for (const mode of modes) for (const policy of policies) for (const chart of [false, true]) {
    for (const relicId of relics) results.set(cellKey(mode, policy, chart, relicId), { wins: 0, reservations: 0, carriedSelections: 0, repairs: 0 });
  }

  for (let seedIndex = 0; seedIndex < 500; seedIndex += 1) {
    const seed = `black-matrix-${seedIndex}`;
    for (const mode of modes) for (const policy of policies) for (const chart of [false, true]) for (const relicId of relics) {
      const options = { seed, runMode: mode, ...(relicId ? { relicId } : {}) };
      const run = playRun(createRun(options), policy, true, chart);
      const cell = results.get(cellKey(mode, policy, chart, relicId))!;
      if (run.status === 'won') cell.wins += 1;
      cell.reservations += run.commandTrace.filter((command) => command.type === 'reserve_route').length;
      cell.repairs += run.commandTrace.filter((command) => command.type === 'repair_citadel').length;
      let replayState = createRun(options);
      for (const command of run.commandTrace) {
        if (command.type === 'select_route' && replayState.routeOffers.find((offer) => offer.instanceId === command.instanceId)?.carried) {
          cell.carriedSelections += 1;
        }
        replayState = applyCommand(replayState, command).state;
      }
      assert.deepEqual(replayState, run);
    }
  }

  const summary = Object.fromEntries(results);
  console.info('black-descent-audit', JSON.stringify(summary));
  const totalWins = (mode: typeof modes[number]) => [...results]
    .filter(([key]) => key.startsWith(`${mode}:`))
    .reduce((sum, [, cell]) => sum + cell.wins, 0);
  const standardWins = totalWins('standard');
  const blackWins = totalWins('black_descent');
  assert.ok(standardWins - blackWins >= 360, `Black Descent was less than three points harder: ${standardWins}/${blackWins}`);
  assert.ok(standardWins - blackWins <= 1800, `Black Descent was more than fifteen points harder: ${standardWins}/${blackWins}`);

  for (const policy of policies) for (const chart of [false, true]) {
    const hardCells = relics.map((relicId) => results.get(cellKey('black_descent', policy, chart, relicId))!);
    const hardWins = hardCells.map((cell) => cell.wins);
    assert.ok(Math.max(...hardWins) - Math.min(...hardWins) <= 50, `Black Descent relic spread exceeded ten points for ${policy}/${chart}.`);
    for (const relicId of relics) {
      const standard = results.get(cellKey('standard', policy, chart, relicId))!;
      const hard = results.get(cellKey('black_descent', policy, chart, relicId))!;
      assert.ok(hard.wins <= standard.wins + 10, `Hard mode beat standard by over two points for ${policy}/${chart}/${relicId}.`);
    }
  }

  for (const chart of [false, true]) {
    const conservative = results.get(cellKey('black_descent', 'conservative', chart, null))!;
    assert.ok(conservative.wins >= 250 && conservative.wins <= 450, `Black conservative viability missed its gate: ${JSON.stringify(conservative)}`);
  }
  for (const relicId of relics) {
    const balanced = results.get(cellKey('black_descent', 'balanced', true, relicId))!;
    assert.ok(balanced.wins >= 50 && balanced.wins <= 200, `Black chart-aware balanced viability missed its gate for ${relicId}: ${JSON.stringify(balanced)}`);
    assert.ok(balanced.repairs >= 100 && balanced.repairs < 800, `Black balanced plating did not recur without dominating for ${relicId}: ${JSON.stringify(balanced)}`);
  }
  const aggressiveHard = [...results]
    .filter(([key]) => key.startsWith('black_descent:aggressive:'))
    .map(([, cell]) => cell.wins);
  assert.ok(aggressiveHard.reduce((sum, wins) => sum + wins, 0) > 0, 'Expected at least one aggressive Black Descent win.');
  assert.ok(aggressiveHard.every((wins) => wins <= 50), `Aggressive Black Descent exceeded ten points: ${aggressiveHard}`);

  for (const policy of policies) for (const relicId of relics) {
    const base = results.get(cellKey('black_descent', policy, false, relicId))!;
    const chart = results.get(cellKey('black_descent', policy, true, relicId))!;
    assert.ok(Math.abs(chart.wins - base.wins) <= 75, `Black charting changed wins by over fifteen points for ${policy}/${relicId}.`);
    assert.ok(chart.reservations >= 100, `Black charting did not recur for ${policy}/${relicId}.`);
  }
  for (const policy of policies) {
    const chartCells = relics.map((relicId) => results.get(cellKey('black_descent', policy, true, relicId))!);
    const reservations = chartCells.reduce((sum, cell) => sum + cell.reservations, 0);
    const carriedSelections = chartCells.reduce((sum, cell) => sum + cell.carriedSelections, 0);
    assert.ok(carriedSelections >= reservations * 0.1, `Black carried routes were rarely chosen for ${policy}: ${carriedSelections}/${reservations}.`);
  }
});
