'use client';

import {
  ENDINGS as ENDING_CONTENT,
  LORE,
  MODULES,
  RELICS,
  applyCommand,
  createLegacyState,
  createRun,
  deserialize,
  deserializeLegacy,
  legalCommands,
  recordLegacyRun,
  scoreRun,
  selectGameView,
  serialize,
  serializeLegacy,
  type Command,
  type CrewId,
  type EndingId,
  type EngineEvent,
  type GameState,
  type GameView,
  type LegacyState,
  type ModuleId,
  type RelicId,
  type RunMode,
  type RunRecord,
} from '@lode-choir/engine';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { choirAudio } from './audio';

const AUTOSAVE_KEY = 'lode_choir_autosave_v1';
const LEGACY_KEY = 'lode_choir_legacy_v1';
const SETTINGS_KEY = 'lode_choir_settings_v1';

type Surface = 'title' | 'loadout' | 'game' | 'manual' | 'chronicle' | 'settings' | 'credits';
type Settings = { muted: boolean; highContrast: boolean; reducedMotion: boolean };
type SavePreview = { seed: string; shift: number; relicName: string | null; runMode: RunMode };
type ProgressBackup = { game: 'lode-choir-backup'; version: 1; autosave: string | null; legacy: string; settings: Settings };

const DEFAULT_SETTINGS: Settings = { muted: false, highContrast: false, reducedMotion: false };

const ENDING_DETAILS: Record<EndingId, { description: string; cost: string }> = {
  harvest: {
    description: 'Cut the impossible chord from the moon and carry its power home.',
    cost: 'The choir falls silent.',
  },
  harmonize: {
    description: 'Tune Orison to the Heart-Lode and let both living machines answer.',
    cost: 'No one returns unchanged.',
  },
  seal: {
    description: 'Close the wound, abandon the claim, and leave the song beneath stone.',
    cost: 'The expedition returns empty-handed.',
  },
};

const ENDINGS = Object.fromEntries(ENDING_CONTENT.map((ending) => [ending.id, {
  title: ending.title,
  ...ENDING_DETAILS[ending.id],
}])) as Record<EndingId, { title: string; description: string; cost: string }>;

const RELIC_BY_ENDING = Object.fromEntries(ENDING_CONTENT.map((ending) => [
  ending.id,
  ending.unlockRelicId,
])) as Record<EndingId, RelicId>;

const MODULE_MARKS: Record<ModuleId, string> = {
  heart_engine: 'HE',
  deep_drill: 'DD',
  ward_array: 'WA',
  foundry: 'FO',
  infirmary: 'IN',
  resonance_chamber: 'RC',
};

const LEADER_EFFECTS: Record<CrewId, string> = {
  mara: 'Spend 1 provision. Turn aside one route hazard.',
  tamsin: 'Spend 1 provision. Salvage alloy equal to half the route risk.',
  orin: 'Spend 1 provision. Ease one strain from every chamber crew.',
  sable: 'Spend 1 provision. Reveal the chosen route complication.',
};

declare global {
  interface Window {
    __LODE_CHOIR__?: {
      getState: () => GameState | null;
      command: (command: Command) => void;
      newRun: (seed: string, relicId?: RelicId, runMode?: RunMode) => void;
      refresh: () => void;
    };
  }
}

function makeSeed() {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const values = new Uint32Array(2);
    crypto.getRandomValues(values);
    return `CHOIR-${values[0].toString(36).slice(-4)}-${values[1].toString(36).slice(-4)}`.toUpperCase();
  }
  return 'CHOIR-ORISON';
}

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function ToneMark({ active = false }: { active?: boolean }) {
  return (
    <svg className={`tone-mark ${active ? 'is-active' : ''}`} viewBox="0 0 96 28" aria-hidden="true">
      <path d="M2 14h12l5-9 8 18 8-13 7 8 8-16 8 23 8-15 7 8h21" />
    </svg>
  );
}

function ResourceRail({ view }: { view: GameView }) {
  const state = view.state;
  const items = [
    ['PRO', state.resources.provisions],
    ['ALY', state.resources.alloy],
    ['LUM', state.resources.lumen],
    ['HULL', `${state.integrity}/${view.maxIntegrity}`],
    ['NOTE', `${state.heartNotes}/3`],
  ];
  return (
    <section className="resource-rail" aria-label="Expedition resources">
      {items.map(([label, value]) => (
        <div className={label === 'HULL' && Number(state.integrity) <= 3 ? 'resource is-danger' : 'resource'} key={label}>
          <span>{label}</span><strong>{value}</strong>
        </div>
      ))}
    </section>
  );
}

function CrewCard({ crew, selected, assigned, shift, onSelect, onUnassign }: {
  crew: GameView['crew'][number];
  selected: boolean;
  assigned: boolean;
  shift: number;
  onSelect: () => void;
  onUnassign: () => void;
}) {
  const unavailable = crew.incapacitatedUntil > shift;
  return (
    <article className={`crew-card ${selected ? 'is-selected' : ''} ${unavailable ? 'is-incapacitated' : ''}`}>
      <button
        type="button"
        className="crew-select"
        onClick={assigned ? onUnassign : onSelect}
        disabled={unavailable}
        aria-pressed={selected}
        data-testid={`crew-${crew.id}`}
      >
        <span className="crew-portrait" style={{ '--crew-color': crew.color } as React.CSSProperties}>
          <img
            src={`/art/crew-${crew.id}.webp`}
            width="720"
            height="720"
            loading="lazy"
            decoding="async"
            alt=""
          />
        </span>
        <span className="crew-identity">
          <strong>{crew.name}</strong>
          <small>{unavailable ? `Incapacitated until shift ${crew.incapacitatedUntil + 1}` : assigned ? 'Assigned · tap to recall' : crew.role}</small>
        </span>
        <span className="crew-readout"><b>{crew.strain}</b>/6 STR</span>
      </button>
      <div
        className="crew-meter"
        role="progressbar"
        aria-label={`${crew.name} strain`}
        aria-valuemin={0}
        aria-valuemax={6}
        aria-valuenow={crew.strain}
      >
        <i style={{ width: `${Math.min(100, (crew.strain / 6) * 100)}%` }} />
      </div>
      <details>
        <summary>Vow · {crew.vowProgress}/3 <span>{crew.loyalty} loyalty</span></summary>
        <p>{crew.vow}</p>
        <p><em>{crew.signatureUnlocked ? `Awakened: ${crew.signature}` : `Talent: ${crew.talent}`}</em></p>
        {crew.scar && <p className="scar">Scar: {crew.scar}</p>}
      </details>
    </article>
  );
}

function Citadel({ view, selectedCrew, selectedBuildSlot, onRoom, onEmpty }: {
  view: GameView;
  selectedCrew: CrewId | null;
  selectedBuildSlot: number | null;
  onRoom: (slot: number) => void;
  onEmpty: (slot: number) => void;
}) {
  const modulesBySlot = new Map(view.modules.map((module) => [module.slot, module]));
  return (
    <section className="citadel-panel" aria-labelledby="citadel-title">
      <div className="section-heading">
        <div><span className="kicker">LIVING CITADEL</span><h2 id="citadel-title">Orison</h2></div>
        <span className="shift-seal">SHIFT <b>{view.state.shift}</b>/7</span>
      </div>
      <div className="citadel" data-testid="citadel-grid">
        <div className="citadel-veins" aria-hidden="true" />
        {Array.from({ length: 9 }, (_, slot) => {
          const module = modulesBySlot.get(slot);
          if (!module) {
            return (
              <button
                type="button"
                key={slot}
                className={`room empty-room ${selectedBuildSlot === slot ? 'is-selected' : ''}`}
                onClick={() => onEmpty(slot)}
                disabled={view.state.phase !== 'development'}
                data-testid={`room-${slot}`}
                aria-label={`Empty chamber ${slot + 1}`}
              >
                <span>+</span><small>SEALED</small>
              </button>
            );
          }
          const assigned = view.crew.find((crew) => crew.id === module.assignedCrew);
          return (
            <button
              type="button"
              key={slot}
              className={`room ${module.assignedCrew ? 'is-powered' : ''} ${selectedCrew ? 'can-assign' : ''}`}
              onClick={() => onRoom(slot)}
              data-testid={`room-${slot}`}
              aria-label={`${module.name}${assigned ? `, assigned to ${assigned.name}` : ', unstaffed'}`}
            >
              <span className="room-level">{String(module.level).padStart(2, '0')}</span>
              <b className="room-mark">{MODULE_MARKS[module.id]}</b>
              <strong>{module.name}</strong>
              <small>{assigned ? assigned.name : selectedCrew ? 'Tap to assign' : module.assignmentHint}</small>
            </button>
          );
        })}
      </div>
      <div className="citadel-caption">
        <ToneMark active={Boolean(selectedCrew)} />
        <span>{selectedCrew ? 'Choose a chamber for the selected crew member.' : 'Tap a crew member, then a chamber. Adjoining rooms resonate.'}</span>
      </div>
    </section>
  );
}

function RouteChartStrip({ view, status, onReserve, onClear }: {
  view: GameView;
  status: string | null;
  onReserve: (instanceId: string) => void;
  onClear: () => void;
}) {
  if (!view.state.selectedRoute || view.state.shift >= 7) return null;
  const legal = legalCommands(view.state as GameState);
  const canClear = legal.some((command) => command.type === 'clear_route_reservation');
  const held = view.state.reservedRoute;
  const candidates = view.routes.filter((route) => route.instanceId !== view.state.selectedRoute);
  const helper = held
    ? `One route is held. Switch free, or release it to restore ${view.routeReservationCost} lumen.`
    : view.state.resources.lumen < view.routeReservationCost
      ? `${view.routeReservationCost} lumen required to chart a route.`
      : `Spend ${view.routeReservationCost} lumen to carry one unchosen route into the next forecast.`;
  return (
    <section className="route-chart" data-testid="route-chart" aria-labelledby="route-chart-title" aria-describedby="route-chart-help">
      <div><strong id="route-chart-title">CHART A RETURN // {view.routeReservationCost} LUMEN</strong><small id="route-chart-help">{helper}</small></div>
      <div className="route-chart-actions">
        {candidates.map((route) => {
          const isHeld = held === route.instanceId;
          const canReserve = legal.some((command) => command.type === 'reserve_route' && command.instanceId === route.instanceId);
          return (
            <button
              type="button"
              className={`route-chart-action ${isHeld ? 'is-held' : ''}`}
              key={route.instanceId}
              data-testid={`chart-route-${route.instanceId}`}
              data-route-instance={route.instanceId}
              aria-pressed={isHeld}
              aria-label={isHeld ? `${route.definition.title} held for next shift — release` : `Hold ${route.definition.title} for next shift`}
              disabled={isHeld ? !canClear : !canReserve}
              onClick={() => isHeld ? onClear() : onReserve(route.instanceId)}
            >
              <span>{isHeld ? 'HELD FOR NEXT SHIFT — RELEASE' : 'HOLD'}</span><strong>{route.definition.title}</strong>
            </button>
          );
        })}
      </div>
      <span className="route-chart-status" role="status" aria-live="polite">{status}</span>
    </section>
  );
}

function parseProgressBackup(serialized: string): { run: GameState | null; legacy: LegacyState; settings: Settings } {
  if (serialized.length > 1_000_000) throw new Error('Backup exceeds the one-megabyte safety limit.');
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new Error('Backup is not valid JSON.');
  }
  if (!value || typeof value !== 'object') throw new Error('Backup does not contain an object.');
  const backup = value as Partial<ProgressBackup>;
  if (backup.game !== 'lode-choir-backup' || backup.version !== 1 || typeof backup.legacy !== 'string') {
    throw new Error('Backup is not a supported Lode Choir progress file.');
  }
  const candidateSettings = backup.settings;
  if (!candidateSettings || typeof candidateSettings.muted !== 'boolean'
    || typeof candidateSettings.highContrast !== 'boolean' || typeof candidateSettings.reducedMotion !== 'boolean') {
    throw new Error('Backup settings are incomplete.');
  }
  if (backup.autosave !== null && typeof backup.autosave !== 'string') throw new Error('Backup run data is incomplete.');
  const run = backup.autosave ? deserialize(backup.autosave) : null;
  if (run && (run.status !== 'playing' || run.phase === 'complete')) throw new Error('Backup autosave is already complete.');
  return {
    run,
    legacy: deserializeLegacy(backup.legacy),
    settings: candidateSettings,
  };
}

function RoutePanel({ view, selectedCrew, chartStatus, onSelect, onReserve, onClearReservation, onLeader, onUnassignLeader, onResolve }: {
  view: GameView;
  selectedCrew: CrewId | null;
  chartStatus: string | null;
  onSelect: (instanceId: string) => void;
  onReserve: (instanceId: string) => void;
  onClearReservation: () => void;
  onLeader: (crewId: CrewId) => void;
  onUnassignLeader: (crewId: CrewId) => void;
  onResolve: () => void;
}) {
  const leader = view.crew.find((crew) => crew.id === view.state.routeLeader);
  const candidate = view.crew.find((crew) => crew.id === selectedCrew);
  const canAppoint = Boolean(selectedCrew && legalCommands(view.state as GameState).some(
    (command) => command.type === 'assign_route_leader' && command.crewId === selectedCrew,
  ));
  const carriedRelic = view.state.startingRelic ? RELICS.find((relic) => relic.id === view.state.startingRelic) : null;
  return (
    <section className="route-panel" aria-labelledby="route-title">
      <div className="section-heading compact">
        <div><span className="kicker">FORECAST ARRAY</span><h2 id="route-title">Choose a descent</h2></div>
        <span className="phase-tag">PLANNING</span>
      </div>
      <p className="objective">{view.objective}</p>
      {carriedRelic && <details className="run-relic"><summary>RELIC // {carriedRelic.name}</summary><p>{carriedRelic.startingEffect}</p></details>}
      <div className="route-list">
        {view.routes.map((route, index) => {
          const selected = view.state.selectedRoute === route.instanceId;
          return (
            <button
              type="button"
              className={`route-card kind-${route.definition.kind} ${selected ? 'is-selected' : ''}`}
              key={route.instanceId}
              onClick={() => onSelect(route.instanceId)}
              aria-pressed={selected}
              data-testid={`route-${index}`}
            >
              <span className="route-index">0{index + 1}</span>
              <span className="route-copy">
                <span className="route-meta"><span className="route-kind">{route.definition.kind}</span>{route.carried && <span className="route-carried-badge">CHARTED LAST SHIFT</span>}</span>
                <strong>{route.definition.title}</strong>
                <small>{route.definition.description}</small>
                {route.revealed && route.hiddenComplication && <em>Foreseen: {route.hiddenComplication}</em>}
              </span>
              <span className="route-risk"><b>{route.definition.hazard}</b><small>RISK</small></span>
              <span className="route-reward">{route.definition.rewardText}</span>
              <span className="route-forecast" aria-label="Projected expedition cost">
                <small>FORECAST</small>
                <b>HULL −{route.forecast.hullDamageMin}{route.forecast.hullDamageMax !== route.forecast.hullDamageMin ? `–${route.forecast.hullDamageMax}` : ''}</b>
                <b>RATION −{route.forecast.provisionCost}</b>
                <b>TEAM STR {route.forecast.netCrewStrain >= 0 ? '+' : '−'}{Math.abs(route.forecast.netCrewStrain)}</b>
              </span>
            </button>
          );
        })}
      </div>
      <RouteChartStrip view={view} status={chartStatus} onReserve={onReserve} onClear={onClearReservation} />
      <div className={`leader-post ${leader ? 'is-staffed' : ''}`} data-testid="leader-post">
        <span className="leader-mark">IV</span>
        <span className="leader-copy">
          <small>OPTIONAL // EXPEDITION LEADER</small>
          <strong>{leader?.name ?? candidate?.name ?? 'The fourth voice can lead'}</strong>
          <em>{leader ? LEADER_EFFECTS[leader.id] : candidate ? LEADER_EFFECTS[candidate.id] : 'Rest is automatic. After staffing three chambers, select the fourth voice to lead.'}</em>
        </span>
        {leader
          ? <button type="button" onClick={() => onUnassignLeader(leader.id)} aria-label={`Recall ${leader.name} from expedition leadership`}>RECALL</button>
          : <button type="button" onClick={() => selectedCrew && onLeader(selectedCrew)} disabled={!canAppoint}>APPOINT</button>}
      </div>
      <button type="button" className="primary-action" onClick={onResolve} disabled={!view.canResolveShift} data-testid="resolve-shift">
        <span>{view.canResolveShift ? 'Commit expedition' : 'Select route and assign three crew'}</span>
        <b>DESCEND</b>
      </button>
    </section>
  );
}

function EventPanel({ view, onChoose }: { view: GameView; onChoose: (choiceIndex: number) => void }) {
  const event = view.activeStoryEvent;
  if (!event) return <p className="empty-message">The choir is searching for a clear signal…</p>;
  const speaker = view.crew.find((crew) => crew.id === event.speaker);
  const legalChoices = new Set(legalCommands(view.state as GameState)
    .filter((command) => command.type === 'choose_event')
    .map((command) => command.choiceIndex));
  return (
    <section className="event-panel" aria-labelledby="event-title" data-testid="event-panel">
      <span className="kicker">INTERCEPTED // {speaker?.name ?? 'ORISON'}</span>
      <ToneMark active />
      <h2 id="event-title">{event.title}</h2>
      <p className="event-body">{event.body}</p>
      <div className="choice-list">
        {event.choices.map((choice, index) => (
          <button type="button" key={choice.label} onClick={() => onChoose(index)} disabled={!legalChoices.has(index)} data-testid={`event-choice-${index}`}>
            <strong>{choice.label}</strong><span>{choice.consequence}</span>{!legalChoices.has(index) && <em>REQUIRES RESOURCES YOU DO NOT HAVE</em>}
          </button>
        ))}
      </div>
    </section>
  );
}

function DevelopmentPanel({ view, slot, onSlot, onBuild, onUpgrade, onRepair, onSkip }: {
  view: GameView;
  slot: number | null;
  onSlot: (slot: number) => void;
  onBuild: (moduleId: ModuleId, slot: number) => void;
  onUpgrade: (slot: number) => void;
  onRepair: () => void;
  onSkip: () => void;
}) {
  const choiceDefinitions = MODULES.filter((module) => view.state.developmentChoices.includes(module.id));
  const emptySlots = Array.from({ length: 9 }, (_, index) => index).filter((index) => !view.modules.some((module) => module.slot === index));
  const legal = legalCommands(view.state);
  const canBuild = (moduleId: ModuleId, targetSlot: number | null) => targetSlot !== null && legal.some((command) => command.type === 'build_module' && command.moduleId === moduleId && command.slot === targetSlot);
  const canUpgrade = (targetSlot: number) => legal.some((command) => command.type === 'upgrade_module' && command.slot === targetSlot);
  const canRepair = legal.some((command) => command.type === 'repair_citadel');
  const repairAmount = Math.min(2, view.maxIntegrity - view.state.integrity);
  return (
    <section className="development-panel" aria-labelledby="development-title" data-testid="development-panel">
      <span className="kicker">CITADEL GROWTH</span>
      <h2 id="development-title">Wake a new chamber</h2>
      <p>Spend alloy to deepen Orison. Select a sealed chamber on the grid or below.</p>
      <div className="slot-picker" aria-label="Empty chamber selection">
        {emptySlots.map((emptySlot) => (
          <button type="button" key={emptySlot} onClick={() => onSlot(emptySlot)} className={slot === emptySlot ? 'is-selected' : ''}>
            {emptySlot + 1}
          </button>
        ))}
      </div>
      <div className="module-choices">
        {choiceDefinitions.map((module) => (
          <article className="module-choice" key={module.id}>
            <span className="module-sigil">{MODULE_MARKS[module.id]}</span>
            <div><strong>{module.name}</strong><p>{module.description}</p><small>{module.buildCost} ALLOY</small></div>
            <button type="button" onClick={() => slot !== null && onBuild(module.id, slot)} disabled={!canBuild(module.id, slot)}>
              BUILD
            </button>
          </article>
        ))}
      </div>
      <div className="upgrade-row">
        <span>Or reinforce an existing chamber</span>
        <div>{view.modules.map((module) => <button key={module.slot} type="button" disabled={!canUpgrade(module.slot)} onClick={() => onUpgrade(module.slot)}>{module.name} · LV{module.level}</button>)}</div>
      </div>
      <div className="repair-row">
        <span><strong>Plate the living hull</strong><small>{repairAmount > 0 ? `Restore ${repairAmount} integrity and end development.` : 'Orison is already at full integrity.'}</small></span>
        <button type="button" onClick={onRepair} disabled={!canRepair} data-testid="repair-citadel">REPAIR · {view.repairCost} ALLOY</button>
      </div>
      <button className="text-button" type="button" onClick={onSkip}>Conserve alloy and continue</button>
    </section>
  );
}

function FinalePanel({ view, onChoose }: { view: GameView; onChoose: (ending: EndingId) => void }) {
  return (
    <section className="finale-panel" aria-labelledby="finale-title" data-testid="finale-panel">
      <span className="kicker">THE HEART-LODE // CONTACT</span>
      <div className="heart-glyph" aria-hidden="true"><i /><i /><i /></div>
      <h2 id="finale-title">The moon awaits your answer.</h2>
      <p>Every chamber in Orison sings back. The crew look to you—not for orders, but for meaning.</p>
      <div className="ending-choices">
        {(Object.entries(ENDINGS) as [EndingId, (typeof ENDINGS)[EndingId]][]).map(([id, ending]) => (
          <button type="button" key={id} onClick={() => onChoose(id)} data-testid={`ending-${id}`}>
            <strong>{ending.title}</strong><span>{ending.description}</span><em>{ending.cost}</em>
          </button>
        ))}
      </div>
    </section>
  );
}

function CompletionPanel({ view, onNewRun, onChronicle }: { view: GameView; onNewRun: () => void; onChronicle: () => void }) {
  const won = view.state.status === 'won';
  const modeLabel = view.state.runMode === 'black_descent' ? 'BLACK DESCENT · 1.25×' : 'STANDARD DESCENT · 1×';
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return (
    <section className={`completion-panel ${won ? 'is-victory' : 'is-loss'}`} data-testid="completion-panel">
      <span className="kicker">RUN // {won ? 'CONCORDANT' : 'SILENCED'} // {modeLabel}</span>
      <ToneMark active={won} />
      <h2 ref={heading} tabIndex={-1}>{won ? ENDINGS[view.state.ending ?? 'harmonize'].title : 'Orison goes dark.'}</h2>
      <p>{view.state.endingText ?? (won ? 'The expedition leaves a mark in the moon—and the moon leaves one in them.' : 'The deep keeps what the surface could not protect.')}</p>
      <div className="completion-stats">
        <span><b>{scoreRun(view.state as GameState)}</b> echo score</span><span><b>{view.state.shift}</b> shifts</span><span><b>{view.state.heartNotes}</b> Heart Notes</span><span><b>{view.state.integrity}</b> integrity</span>
      </div>
      <div className="completion-actions">
        <button className="primary-action" type="button" onClick={onNewRun}>Begin another descent</button>
        <button className="text-button" type="button" onClick={onChronicle}>Open Chronicle</button>
      </div>
    </section>
  );
}

function Chronicle({ legacy, onRetry, onBack }: { legacy: LegacyState; onRetry: (record: RunRecord) => void; onBack: () => void }) {
  const standardScores = legacy.records.filter((record) => record.runMode === 'standard' && record.scoreVersion === 2).map((record) => record.score);
  const blackScores = legacy.records.filter((record) => record.runMode === 'black_descent' && record.scoreVersion === 2).map((record) => record.score);
  return (
    <MenuPage eyebrow="ARCHIVE // PERSISTENT MEMORY" title="The Chronicle" onBack={onBack}>
      <div className="chronicle-summary">
        <span><b>{legacy.runsCompleted}</b> descents</span>
        <span><b>{standardScores.length ? Math.max(...standardScores) : '—'}</b> best standard</span>
        <span><b>{blackScores.length ? Math.max(...blackScores) : '—'}</b> best Black Descent</span>
      </div>
      <h2>Recent descents</h2>
      {legacy.records.length ? <ol className="run-history">{legacy.records.map((record, index) => {
        const relic = record.startingRelic ? RELICS.find((candidate) => candidate.id === record.startingRelic) : null;
        const outcome = record.outcome === 'won' && record.ending ? ENDINGS[record.ending].title : 'Orison went dark';
        return <li key={`${record.seed}-${index}`}>
          <span className={record.outcome === 'won' ? 'is-win' : 'is-loss'}>{record.outcome === 'won' ? 'CONCORDANT' : 'SILENCED'} · {record.runMode === 'black_descent' ? 'BLACK DESCENT' : 'STANDARD'}</span>
          <strong>{outcome}</strong><b>{record.score}</b>
          <small>{record.seed} · SHIFT {record.shift}/7 · {record.heartNotes} NOTES · {record.scars} SCARS{relic ? ` · ${relic.name}` : ''}{record.scoreVersion === 1 ? ' · ARCHIVED FORMULA' : record.runMode === 'black_descent' ? ` · BASE ${record.baseScore} × ${record.scoreMultiplier}` : ''}</small>
          <button type="button" onClick={() => onRetry(record)}>PREPARE SAME SIGNAL</button>
        </li>;
      })}</ol> : <p className="empty-message">No expedition has yet returned to the archive.</p>}
      <h2>Resolved chords</h2>
      <div className="archive-grid">
        {(Object.keys(ENDINGS) as EndingId[]).map((id) => (
          <article className={legacy.endings.includes(id) ? 'is-found' : ''} key={id}>
            <span>{legacy.endings.includes(id) ? 'RECORDED' : 'UNKNOWN'}</span>
            <strong>{legacy.endings.includes(id) ? ENDINGS[id].title : '•••••• ••• ••••'}</strong>
            <small>{legacy.endings.includes(id) ? `Relic: ${RELICS.find((relic) => relic.id === RELIC_BY_ENDING[id])!.name}` : 'Reach the Heart-Lode to reveal.'}</small>
          </article>
        ))}
      </div>
      <h2>Recovered heirlooms</h2>
      <div className="loadout-grid chronicle-relics">
        {RELICS.map((relic) => {
          const found = legacy.relics.includes(relic.id);
          return (
            <article className={`relic-card is-readonly ${found ? 'is-found' : 'is-locked'}`} key={relic.id}>
              <span>{found ? 'AVAILABLE' : 'UNRECOVERED'}</span>
              <strong>{found ? relic.name : 'Unknown heirloom'}</strong>
              <p>{found ? relic.description : 'Another answer waits at the Heart-Lode.'}</p>
              <small>{found ? relic.startingEffect : 'Effect unavailable.'}</small>
            </article>
          );
        })}
      </div>
      <h2>Lore fragments</h2>
      {legacy.lore.length ? <ul className="lore-list">{legacy.lore.map((loreId) => {
        const lore = LORE.find((candidate) => candidate.id === loreId);
        return lore ? <li key={lore.id}><strong>{lore.title}</strong><span>{lore.text}</span></li> : null;
      })}</ul> : <p className="empty-message">The archive is quiet. Descend to recover its first memory.</p>}
    </MenuPage>
  );
}

function MenuPage({ eyebrow, title, onBack, children }: { eyebrow: string; title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <main className="menu-page">
      <button className="back-button" type="button" onClick={onBack}>← RETURN</button>
      <div className="menu-page-content"><span className="kicker">{eyebrow}</span><h1>{title}</h1>{children}</div>
    </main>
  );
}

function SettingsPage({ settings, onChange, onCreateBackup, onRestoreBackup, onBack }: {
  settings: Settings;
  onChange: (settings: Settings) => void;
  onCreateBackup: () => string;
  onRestoreBackup: (serialized: string) => string;
  onBack: () => void;
}) {
  const [backupText, setBackupText] = useState('');
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const settingRows: { key: keyof Settings; title: string; body: string }[] = [
    { key: 'muted', title: 'Mute the choir', body: 'Disable music and procedural interface tones.' },
    { key: 'highContrast', title: 'High contrast', body: 'Brighten text and strengthen structural lines.' },
    { key: 'reducedMotion', title: 'Reduce motion', body: 'Replace chamber, descent, and finale movement with still feedback.' },
  ];
  const createBackup = () => {
    setBackupText(onCreateBackup());
    setBackupStatus('Backup ready. Copy this text somewhere safe.');
  };
  const copyBackup = async () => {
    if (!backupText) { setBackupStatus('Create a backup before copying it.'); return; }
    try {
      await navigator.clipboard.writeText(backupText);
      setBackupStatus('Backup copied to the clipboard.');
    } catch {
      setBackupStatus('Clipboard access was unavailable. Select and copy the backup text manually.');
    }
  };
  const restoreBackup = () => {
    try {
      setBackupStatus(onRestoreBackup(backupText));
    } catch (error) {
      setBackupStatus(error instanceof Error ? error.message : 'Backup could not be restored.');
    }
  };
  return (
    <MenuPage eyebrow="ORISON // INSTRUMENT PANEL" title="Settings" onBack={onBack}>
      <div className="settings-list">
        {settingRows.map((row) => (
          <label key={row.key}>
            <span><strong>{row.title}</strong><small>{row.body}</small></span>
            <input type="checkbox" checked={settings[row.key]} onChange={(event) => onChange({ ...settings, [row.key]: event.target.checked })} />
            <i aria-hidden="true" />
          </label>
        ))}
      </div>
      <section className="progress-backup" aria-labelledby="progress-backup-title">
        <span className="kicker">LOCAL DATA // PORTABLE RECORD</span>
        <h2 id="progress-backup-title">Back up this expedition</h2>
        <p>Create a portable text record of the active autosave, Chronicle, and settings. Restoring replaces those local records only after the entire backup validates.</p>
        <textarea aria-label="Progress backup text" value={backupText} onChange={(event) => { setBackupText(event.target.value); setBackupStatus(null); }} placeholder="Create a backup, or paste one here to validate and restore." spellCheck={false} />
        <div className="backup-actions">
          <button type="button" onClick={createBackup}>CREATE BACKUP</button>
          <button type="button" onClick={copyBackup} disabled={!backupText}>COPY BACKUP</button>
          <button type="button" className="restore-backup" onClick={restoreBackup} disabled={!backupText}>VALIDATE &amp; RESTORE</button>
        </div>
        <span className="backup-status" role="status" aria-live="polite">{backupStatus}</span>
      </section>
    </MenuPage>
  );
}

function loadLegacy(value: string | null): LegacyState {
  if (!value) return createLegacyState();
  try {
    return deserializeLegacy(value);
  } catch {
    return createLegacyState();
  }
}

function resetDocumentScroll(): void {
  window.requestAnimationFrame(() => window.scrollTo(0, 0));
}

function ManualPage({ onBack }: { onBack: () => void }) {
  return (
    <MenuPage eyebrow="ORISON // FIELD MANUAL" title="How to descend" onBack={onBack}>
      <div className="manual-grid">
        <article><span>01 // FORECAST</span><h2>Choose or chart</h2><p>Risk damages Orison unless the Ward Array and Mara absorb it. Spend one lumen to carry an unchosen route into the next forecast; switching is free and releasing refunds it.</p></article>
        <article><span>02 // CHAMBERS</span><h2>Staff three rooms</h2><p>Tap a crew portrait, then a chamber. Its level, specialist, and neighboring Heart Engine determine what it produces, repairs, or prevents.</p></article>
        <article><span>03 // FOURTH VOICE</span><h2>Rest or lead</h2><p>The fourth available crew member rests for two strain by default. After all rooms are staffed, they may lead for a unique benefit, one ration, and expedition strain.</p></article>
        <article><span>04 // DESCENT</span><h2>Carry the cost</h2><p>Every route consumes a ration. High strain creates a lasting scar and removes that person from the following shift. Vows and story choices build loyalty.</p></article>
        <article><span>05 // CITADEL</span><h2>Wake or mend</h2><p>After shifts two and four, spend alloy to build or improve Orison, plate two points of damaged hull, or conserve it. Every option ends development.</p></article>
        <article><span>06 // HEART-LODE</span><h2>Find three Notes</h2><p>Reach shift seven with three Heart Notes and a living citadel. Then choose what the crew does with the moon-song; each answer leaves a different legacy.</p></article>
        <article><span>07 // CHRONICLE</span><h2>Leave a record</h2><p>Every ending unlocks an heirloom for later expeditions. The Chronicle keeps twelve deterministic scores and can prepare any recorded seed, mode, and recovered relic for a rematch.</p></article>
        <article><span>08 // BLACK DESCENT</span><h2>Travel light</h2><p>Choose this optional contract at loadout for 1.25× score: 11 hull, three provisions, four alloy, one lumen, dearer plating, and twice the hidden fault on high-risk routes.</p></article>
      </div>
    </MenuPage>
  );
}

function LoadoutPage({ seed, unlocked, selected, runMode, onSelect, onMode, onBegin, onBack }: {
  seed: string;
  unlocked: readonly RelicId[];
  selected: RelicId | null;
  runMode: RunMode;
  onSelect: (relicId: RelicId | null) => void;
  onMode: (runMode: RunMode) => void;
  onBegin: () => void;
  onBack: () => void;
}) {
  const preview = createRun({ seed, runMode, ...(selected ? { relicId: selected } : {}) });
  const previewParts = [
    `${preview.integrity} HULL`,
    `${preview.resources.provisions} PRO`,
    `${preview.resources.alloy} ALY`,
    `${preview.resources.lumen} LUM`,
  ];
  if (preview.heartNotes > 0) previewParts.push(`${preview.heartNotes} NOTE`);
  const tamsinStrain = preview.crew.find((crew) => crew.id === 'tamsin')?.strain ?? 0;
  if (tamsinStrain > 0) previewParts.push(`TAMSIN +${tamsinStrain} STR`);
  return (
    <MenuPage eyebrow="CHRONICLE // EXPEDITION LOADOUT" title="Choose what returns" onBack={onBack}>
      <div className="loadout-setup">
        <p className="loadout-intro">One heirloom may cross the threshold. Every gift arrives with a cost; carrying nothing remains a valid choice.</p>
        <fieldset className="descent-mode" data-testid="descent-mode">
          <legend>DESCENT CONDITIONS</legend>
          <div className="descent-mode-options">
            <label className={runMode === 'standard' ? 'is-selected' : ''}>
              <input type="radio" name="descent-mode" value="standard" checked={runMode === 'standard'} aria-describedby="descent-mode-description" onChange={() => onMode('standard')} />
              <span>STANDARD DESCENT</span><strong>Standard</strong>
            </label>
            <label className={runMode === 'black_descent' ? 'is-selected is-black' : 'is-black'}>
              <input type="radio" name="descent-mode" value="black_descent" checked={runMode === 'black_descent'} aria-describedby="descent-mode-description" onChange={() => onMode('black_descent')} />
              <span>{runMode === 'black_descent' ? 'SELECTED // BLACK' : 'BLACK DESCENT // 1.25×'}</span><strong>Black Descent</strong>
            </label>
          </div>
          <p id="descent-mode-description" aria-live="polite">
            {runMode === 'black_descent'
              ? 'Orison descends light: 11 hull, 3 provisions, 4 alloy, 1 lumen. Unread high-risk faults strike twice as hard. Plating costs 3 alloy.'
              : 'The intended expedition balance: 12 hull, 4 provisions, 5 alloy, 2 lumen; standard faults, plating, and score.'}
          </p>
          <output className="loadout-preview" aria-label="Starting condition preview">{previewParts.join(' · ')}</output>
        </fieldset>
      </div>
      <div className="loadout-grid" role="radiogroup" aria-label="Starting relic">
        <label className={`relic-card none-card ${selected === null ? 'is-selected' : ''}`}>
          <input type="radio" name="relic" checked={selected === null} onChange={() => onSelect(null)} />
          <span>UNBURDENED</span><strong>No relic</strong><p>Begin without an inherited modifier; the chosen descent conditions set Orison’s stores.</p><small>No inherited advantage or cost.</small>
        </label>
        {RELICS.map((relic) => {
          const unlockedRelic = unlocked.includes(relic.id);
          return (
            <label className={`relic-card ${selected === relic.id ? 'is-selected' : ''} ${unlockedRelic ? '' : 'is-locked'}`} key={relic.id}>
              <input type="radio" name="relic" value={relic.id} checked={selected === relic.id} disabled={!unlockedRelic} onChange={() => onSelect(relic.id)} />
              <span>{unlockedRelic ? 'RECOVERED' : 'LOCKED'}</span><strong>{unlockedRelic ? relic.name : 'Unknown heirloom'}</strong>
              <p>{unlockedRelic ? relic.description : 'Resolve another chord at the Heart-Lode to reveal this relic.'}</p>
              <small>{unlockedRelic ? relic.startingEffect : 'Effect unavailable.'}</small>
            </label>
          );
        })}
      </div>
      <div className="loadout-footer"><span>SEED // {seed}</span><button className="primary-action" type="button" onClick={onBegin} data-testid="begin-descent"><span>{runMode === 'black_descent' ? 'Commit relic and Black Descent conditions' : 'Commit this inheritance'}</span><b>{runMode === 'black_descent' ? 'BEGIN BLACK DESCENT' : 'BEGIN DESCENT'}</b></button></div>
    </MenuPage>
  );
}

function TitleScreen({ seed, hasSave, savePreview, notice, onSeed, onNew, onContinue, onNavigate }: {
  seed: string;
  hasSave: boolean;
  savePreview: SavePreview | null;
  notice: string | null;
  onSeed: (seed: string) => void;
  onNew: () => void;
  onContinue: () => void;
  onNavigate: (surface: Surface) => void;
}) {
  const [copied, setCopied] = useState(false);
  const copySeed = async () => {
    try { await navigator.clipboard.writeText(seed); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch { setCopied(false); }
  };
  return (
    <main className="title-screen" data-testid="title-screen">
      <div className="title-art">
        <img
          src="/art/orison-title.webp"
          width="1536"
          height="1024"
          fetchPriority="high"
          alt="The six-legged living citadel Orison crossing a moon cavern lit by cyan mineral veins."
        />
        <div className="moon-veins" aria-hidden="true"><i /><i /><i /></div>
        <span aria-hidden="true">ORISON</span>
      </div>
      <section className="title-copy">
        <span className="kicker">A ROGUELITE OF STONE &amp; SONG</span>
        <h1>Lode<br /><em>Choir</em></h1>
        <p>The moon is singing beneath us.<br />Choose who must answer.</p>
        {notice && <div className="notice" role="status">{notice}</div>}
        <div className="title-actions">
          {hasSave && <button className="primary-action" type="button" onClick={onContinue} data-testid="continue-run"><span>{savePreview ? `SHIFT ${savePreview.shift}/7 · ${savePreview.seed}${savePreview.runMode === 'black_descent' ? ' · BLACK DESCENT' : ''}${savePreview.relicName ? ` · ${savePreview.relicName}` : ''}` : 'Return to Orison'}</span><b>CONTINUE</b></button>}
          <button className={hasSave ? 'secondary-action' : 'primary-action'} type="button" onClick={onNew} data-testid="new-run">
            <span>{hasSave ? 'Abandon the current signal' : 'Wake the living citadel'}</span><b>NEW RUN</b>
          </button>
        </div>
        <div className="seed-console">
          <span>EXPEDITION SEED</span><b>{seed}</b>
          <button type="button" onClick={() => onSeed(makeSeed())} aria-label="Reroll seed">↻</button>
          <button type="button" onClick={copySeed} aria-label="Copy seed">{copied ? '✓' : '⧉'}</button>
        </div>
        <nav aria-label="Main menu">
          <button type="button" onClick={() => onNavigate('manual')}>Manual</button>
          <button type="button" onClick={() => onNavigate('chronicle')}>Chronicle</button>
          <button type="button" onClick={() => onNavigate('settings')}>Settings</button>
          <button type="button" onClick={() => onNavigate('credits')}>Credits</button>
        </nav>
      </section>
      <span className="build-stamp">ORISON BUILD // 0.2</span>
    </main>
  );
}

export function GameApp() {
  const [surface, setSurface] = useState<Surface>('title');
  const [returnSurface, setReturnSurface] = useState<Surface>('title');
  const [seed, setSeed] = useState('CHOIR-ORISON');
  const [view, setView] = useState<GameView | null>(null);
  const [selectedCrew, setSelectedCrew] = useState<CrewId | null>(null);
  const [selectedBuildSlot, setSelectedBuildSlot] = useState<number | null>(null);
  const [selectedRelic, setSelectedRelic] = useState<RelicId | null>(null);
  const [selectedRunMode, setSelectedRunMode] = useState<RunMode>('standard');
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [legacy, setLegacy] = useState<LegacyState>(() => createLegacyState());
  const [hasSave, setHasSave] = useState(false);
  const [savePreview, setSavePreview] = useState<SavePreview | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<EngineEvent[]>([]);
  const [chartStatus, setChartStatus] = useState<string | null>(null);
  const stateRef = useRef<GameState | null>(null);
  const recordedCompletion = useRef<string | null>(null);

  useEffect(() => {
    const sharedSeed = new URLSearchParams(window.location.search).get('seed')?.trim();
    setSeed(sharedSeed && sharedSeed.length <= 64 ? sharedSeed : makeSeed());
    const autosave = localStorage.getItem(AUTOSAVE_KEY);
    setHasSave(Boolean(autosave));
    if (autosave) {
      try {
        const saved = deserialize(autosave);
        setSavePreview({ seed: saved.seed, shift: saved.shift, runMode: saved.runMode, relicName: saved.startingRelic ? RELICS.find((relic) => relic.id === saved.startingRelic)?.name ?? null : null });
      } catch {
        setSavePreview(null);
      }
    }
    const loadedSettings = safeParse(localStorage.getItem(SETTINGS_KEY), DEFAULT_SETTINGS);
    setSettings(loadedSettings);
    choirAudio.setEnabled(!loadedSettings.muted);
    const loadedLegacy = loadLegacy(localStorage.getItem(LEGACY_KEY));
    setLegacy(loadedLegacy);
    localStorage.setItem(LEGACY_KEY, serializeLegacy(loadedLegacy));
  }, []);

  useEffect(() => {
    choirAudio.setEnabled(!settings.muted);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  const ambienceActive = surface === 'game' && view?.state.status === 'playing' && !settings.muted;
  useEffect(() => {
    choirAudio.setAmbience(ambienceActive);
    return () => choirAudio.setAmbience(false);
  }, [ambienceActive]);

  useEffect(() => {
    if (selectedRelic && !legacy.relics.includes(selectedRelic)) setSelectedRelic(null);
  }, [legacy, selectedRelic]);

  useEffect(() => {
    stateRef.current = view?.state as GameState | null;
    if (!view) return;
    if (view.state.phase !== 'complete') {
      localStorage.setItem(AUTOSAVE_KEY, serialize(view.state as GameState));
      setHasSave(true);
      setSavePreview({ seed: view.state.seed, shift: view.state.shift, runMode: view.state.runMode, relicName: view.state.startingRelic ? RELICS.find((relic) => relic.id === view.state.startingRelic)?.name ?? null : null });
      return;
    }

    localStorage.removeItem(AUTOSAVE_KEY);
    setHasSave(false);
    setSavePreview(null);
    const completionKey = `${view.state.seed}:${view.state.ending ?? 'lost'}`;
    if (recordedCompletion.current === completionKey) return;
    recordedCompletion.current = completionKey;
    const next = recordLegacyRun(legacy, view.state as GameState);
    setLegacy(next);
    localStorage.setItem(LEGACY_KEY, serializeLegacy(next));
  }, [view]); // The completion guard deliberately keeps this tied to state transitions.

  const startRun = useCallback((runSeed = seed, relicId: RelicId | null = selectedRelic, runMode: RunMode = selectedRunMode) => {
    const state = createRun({ seed: runSeed, runMode, ...(relicId ? { relicId } : {}) });
    setSeed(runSeed);
    setView(selectGameView(state));
    setSelectedCrew(null);
    setSelectedBuildSlot(null);
    setFeedback([]);
    setChartStatus(null);
    setNotice(null);
    recordedCompletion.current = null;
    setSurface('game');
    resetDocumentScroll();
    void choirAudio.wake();
  }, [seed, selectedRelic, selectedRunMode]);

  useEffect(() => {
    if (feedback.length === 0) return;
    const timeout = window.setTimeout(() => setFeedback([]), 4200);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  const continueRun = () => {
    const payload = localStorage.getItem(AUTOSAVE_KEY);
    if (!payload) { setHasSave(false); setNotice('No recoverable signal was found.'); return; }
    try {
      const state = deserialize(payload);
      setView(selectGameView(state));
      setSurface('game');
      setNotice(null);
      setChartStatus(null);
      setSavePreview({ seed: state.seed, shift: state.shift, runMode: state.runMode, relicName: state.startingRelic ? RELICS.find((relic) => relic.id === state.startingRelic)?.name ?? null : null });
      resetDocumentScroll();
      void choirAudio.wake();
    } catch {
      localStorage.removeItem(AUTOSAVE_KEY);
      setHasSave(false);
      setSavePreview(null);
      setNotice('The saved signal was damaged and has been safely cleared. Start a new descent.');
    }
  };

  const dispatch = useCallback((command: Command) => {
    const current = stateRef.current;
    if (!current) return;
    try {
      const result = applyCommand(current, command);
      setView(selectGameView(result.state));
      const releasedBySelection = command.type === 'select_route' && current.reservedRoute === command.instanceId;
      const chartCommand = command.type === 'reserve_route' || command.type === 'clear_route_reservation' || releasedBySelection;
      if (command.type === 'reserve_route') setChartStatus(current.reservedRoute ? 'Chart updated.' : 'Route charted for the next forecast.');
      else if (command.type === 'clear_route_reservation' || releasedBySelection) setChartStatus('Chart released. One lumen restored.');
      else setChartStatus(null);
      setFeedback(chartCommand ? [] : result.events.filter((event) => event.kind !== 'ending').slice(-3));
      result.events.slice(-2).forEach((event) => choirAudio.play(event));
      if (command.type === 'assign_crew' || command.type === 'assign_route_leader' || command.type === 'unassign_crew') setSelectedCrew(null);
      if (command.type === 'build_module') setSelectedBuildSlot(null);
      setNotice(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Orison rejected that command.');
    }
  }, []);

  useEffect(() => {
    window.__LODE_CHOIR__ = { getState: () => stateRef.current, command: dispatch, newRun: startRun, refresh: () => stateRef.current && setView(selectGameView(stateRef.current)) };
    return () => { delete window.__LODE_CHOIR__; };
  }, [dispatch, startRun]);

  const assignedCrew = useMemo(() => {
    const assigned = new Set(view?.modules.map((module) => module.assignedCrew).filter(Boolean) ?? []);
    if (view?.state.routeLeader) assigned.add(view.state.routeLeader);
    return assigned;
  }, [view]);
  const openMenuPage = (next: Surface) => { setReturnSurface(surface); setSurface(next); resetDocumentScroll(); };
  const goBack = () => setSurface(returnSurface === 'game' && !view ? 'title' : returnSurface);
  const prepareLoadout = (runSeed = seed) => {
    setSeed(runSeed);
    setSelectedRunMode('standard');
    setReturnSurface(surface);
    setSurface('loadout');
    resetDocumentScroll();
  };
  const prepareArchivedRun = (record: RunRecord) => {
    setSeed(record.seed);
    setSelectedRunMode(record.runMode);
    setSelectedRelic(record.startingRelic && legacy.relics.includes(record.startingRelic) ? record.startingRelic : null);
    setSurface('loadout');
    resetDocumentScroll();
  };

  const createProgressBackup = () => JSON.stringify({
    game: 'lode-choir-backup',
    version: 1,
    autosave: localStorage.getItem(AUTOSAVE_KEY),
    legacy: serializeLegacy(legacy),
    settings,
  } satisfies ProgressBackup);

  const restoreProgressBackup = (serialized: string) => {
    const restored = parseProgressBackup(serialized.trim());
    localStorage.setItem(LEGACY_KEY, serializeLegacy(restored.legacy));
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(restored.settings));
    setLegacy(restored.legacy);
    setSettings(restored.settings);
    setFeedback([]);
    setChartStatus(null);
    setSelectedCrew(null);
    setSelectedBuildSlot(null);
    recordedCompletion.current = null;
    if (restored.run) {
      localStorage.setItem(AUTOSAVE_KEY, serialize(restored.run));
      stateRef.current = restored.run;
      setView(selectGameView(restored.run));
      setSeed(restored.run.seed);
      setHasSave(true);
      setSavePreview({ seed: restored.run.seed, shift: restored.run.shift, runMode: restored.run.runMode, relicName: restored.run.startingRelic ? RELICS.find((relic) => relic.id === restored.run!.startingRelic)?.name ?? null : null });
    } else {
      localStorage.removeItem(AUTOSAVE_KEY);
      stateRef.current = null;
      setView(null);
      setHasSave(false);
      setSavePreview(null);
    }
    return `Backup restored: ${restored.legacy.runsCompleted} Chronicle descent${restored.legacy.runsCompleted === 1 ? '' : 's'}${restored.run ? ` and ${restored.run.seed} at shift ${restored.run.shift}` : ''}.`;
  };

  const shellClasses = ['app-root', settings.highContrast ? 'high-contrast' : '', settings.reducedMotion ? 'reduced-motion' : ''].filter(Boolean).join(' ');
  if (surface === 'title') return <div className={shellClasses}><TitleScreen seed={seed} hasSave={hasSave} savePreview={savePreview} notice={notice} onSeed={setSeed} onNew={() => prepareLoadout()} onContinue={continueRun} onNavigate={openMenuPage} /></div>;
  if (surface === 'loadout') return <div className={shellClasses}><LoadoutPage seed={seed} unlocked={legacy.relics} selected={selectedRelic} runMode={selectedRunMode} onSelect={setSelectedRelic} onMode={setSelectedRunMode} onBegin={() => startRun(seed, selectedRelic, selectedRunMode)} onBack={goBack} /></div>;
  if (surface === 'manual') return <div className={shellClasses}><ManualPage onBack={goBack} /></div>;
  if (surface === 'chronicle') return <div className={shellClasses}><Chronicle legacy={legacy} onRetry={prepareArchivedRun} onBack={goBack} /></div>;
  if (surface === 'settings') return <div className={shellClasses}><SettingsPage settings={settings} onChange={setSettings} onCreateBackup={createProgressBackup} onRestoreBackup={restoreProgressBackup} onBack={goBack} /></div>;
  if (surface === 'credits') return <div className={shellClasses}><MenuPage eyebrow="TRANSMISSION // AUTHORS" title="Credits" onBack={goBack}><div className="credits-copy"><p>Designed and built as an original game about care, extraction, and the cost of listening.</p><p>Rules, words, interface, vector marks, event tones, and the procedural moon-drone created for <em>Lode Choir</em>.</p><ToneMark active /></div></MenuPage></div>;
  if (!view) return null;

  const onRoom = (slot: number) => {
    if (view.state.phase === 'development') { setSelectedBuildSlot(slot); return; }
    if (selectedCrew) dispatch({ type: 'assign_crew', crewId: selectedCrew, slot });
  };

  return (
    <div className={`${shellClasses} phase-${view.state.phase}`}>
      <header className="game-header">
        <button type="button" className="brand-button" onClick={() => { setReturnSurface('game'); setSurface('title'); }} aria-label="Return to title menu">
          <span className="brand-glyph">LC</span><span><b>LODE CHOIR</b><small>{view.state.seed}</small><em className={view.state.runMode === 'black_descent' ? 'run-mode-badge is-black' : 'run-mode-badge'}>{view.state.runMode === 'black_descent' ? 'BLACK DESCENT · 1.25×' : 'STANDARD DESCENT · 1×'}</em></span>
        </button>
        <ResourceRail view={view} />
        <div className="header-actions">
          <button type="button" onClick={() => openMenuPage('settings')} aria-label="Open settings">⚙</button>
          <button type="button" onClick={() => setSurface('title')}>MENU</button>
        </div>
        <div className={view.state.runMode === 'black_descent' ? 'run-mode-mobile is-black' : 'run-mode-mobile'}>{view.state.runMode === 'black_descent' ? 'BLACK DESCENT · 1.25× SCORE' : 'STANDARD DESCENT · 1× SCORE'}</div>
      </header>
      {notice && <div className="game-notice" role="status">{notice}<button onClick={() => setNotice(null)} aria-label="Dismiss">×</button></div>}
      {feedback.length > 0 && <div className="feedback-stack" aria-live="polite">{feedback.map((event) => <span className={`feedback ${event.emphasis ?? ''}`} key={event.id}>{event.text}</span>)}</div>}
      <main className="game-shell">
        <h1 className="sr-only">Lode Choir expedition</h1>
        <Citadel view={view} selectedCrew={selectedCrew} selectedBuildSlot={selectedBuildSlot} onRoom={onRoom} onEmpty={setSelectedBuildSlot} />
        <aside className="command-deck">
          {view.state.phase === 'planning' && <RoutePanel view={view} selectedCrew={selectedCrew} chartStatus={chartStatus} onSelect={(instanceId) => dispatch({ type: 'select_route', instanceId })} onReserve={(instanceId) => dispatch({ type: 'reserve_route', instanceId })} onClearReservation={() => dispatch({ type: 'clear_route_reservation' })} onLeader={(crewId) => dispatch({ type: 'assign_route_leader', crewId })} onUnassignLeader={(crewId) => dispatch({ type: 'unassign_crew', crewId })} onResolve={() => dispatch({ type: 'resolve_shift' })} />}
          {view.state.phase === 'event' && <EventPanel view={view} onChoose={(choiceIndex) => dispatch({ type: 'choose_event', choiceIndex })} />}
          {view.state.phase === 'development' && <DevelopmentPanel view={view} slot={selectedBuildSlot} onSlot={setSelectedBuildSlot} onBuild={(moduleId, slot) => dispatch({ type: 'build_module', moduleId, slot })} onUpgrade={(slot) => dispatch({ type: 'upgrade_module', slot })} onRepair={() => dispatch({ type: 'repair_citadel' })} onSkip={() => dispatch({ type: 'skip_development' })} />}
          {view.state.phase === 'finale' && <FinalePanel view={view} onChoose={(endingId) => dispatch({ type: 'choose_ending', endingId })} />}
          {view.state.phase === 'complete' && <CompletionPanel view={view} onNewRun={() => prepareLoadout(makeSeed())} onChronicle={() => openMenuPage('chronicle')} />}
        </aside>
        <section className="crew-roster" aria-labelledby="crew-title">
          <div className="roster-heading"><span className="kicker">CREW // FOUR VOICES</span><h2 id="crew-title">Whom do you risk?</h2></div>
          <div className="crew-list">
            {view.crew.map((crew) => (
              <CrewCard
                key={crew.id}
                crew={crew}
                shift={view.state.shift}
                selected={selectedCrew === crew.id}
                assigned={assignedCrew.has(crew.id)}
                onSelect={() => setSelectedCrew(selectedCrew === crew.id ? null : crew.id)}
                onUnassign={() => dispatch({ type: 'unassign_crew', crewId: crew.id })}
              />
            ))}
          </div>
        </section>
        <section className="signal-log" aria-labelledby="log-title">
          <div><span className="kicker">ORISON // MEMORY</span><h2 id="log-title">Signal log</h2></div>
          <ol>{view.state.log.slice(-6).reverse().map((entry) => <li className={`log-${entry.kind}`} key={entry.seq}><span>{String(entry.shift).padStart(2, '0')}.{String(entry.seq).padStart(2, '0')}</span>{entry.text}</li>)}</ol>
        </section>
      </main>
    </div>
  );
}
