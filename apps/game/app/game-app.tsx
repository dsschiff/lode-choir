'use client';

import {
  CREW,
  ENDINGS as ENDING_CONTENT,
  LORE,
  MODULES,
  RELICS,
  applyCommand,
  createLegacyState,
  createRun,
  deserialize,
  deserializeLegacy,
  forecastRoomAssignment,
  legalCommands,
  recordLegacyRun,
  scoreBreakdown,
  scoreRun,
  selectGameView,
  serialize,
  serializeLegacy,
  type Command,
  type CrewId,
  type EndingId,
  type EngineEvent,
  type EventChoice,
  type GameState,
  type GameView,
  type LegacyState,
  type ModuleId,
  type RelicId,
  type RoomAssignmentForecast,
  type RunMode,
  type RunRecord,
} from '@lode-choir/engine';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { choirAudio } from './audio';

const AUTOSAVE_KEY = 'lode_choir_autosave_v1';
const LEGACY_KEY = 'lode_choir_legacy_v1';
const SETTINGS_KEY = 'lode_choir_settings_v1';
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

type Surface = 'title' | 'loadout' | 'prologue' | 'game' | 'pause' | 'manual' | 'chronicle' | 'settings' | 'credits';
type Settings = { muted: boolean; highContrast: boolean; reducedMotion: boolean; volume: number };
type SavePreview = { seed: string; shift: number; relicName: string | null; runMode: RunMode };
type ProgressBackup = { game: 'lode-choir-backup'; version: 1; autosave: string | null; legacy: string; settings: Settings };
type ShiftReport = { shift: number; events: EngineEvent[]; resources: GameState['resources']; integrity: number; heartNotes: number };
type DecisionReport = { shift: number; label?: string; title: string; speaker: CrewId | 'orison'; choice: string; consequence: string; aftermath?: string };
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};
type InstallStatus = 'browser' | 'ready' | 'accepted' | 'installed';

const DEFAULT_SETTINGS: Settings = { muted: false, highContrast: false, reducedMotion: false, volume: 0.7 };

const ENDING_DETAILS: Record<EndingId, { description: string; cost: string }> = {
  harvest: {
    description: 'Drill out the Heart-Lode and take the crystal home.',
    cost: 'The moon dies.',
  },
  harmonize: {
    description: 'Tune Orison to the Heart-Lode and open a two-way signal.',
    cost: 'Orison and its crew will change.',
  },
  seal: {
    description: 'Collapse the mine entrances and leave the Heart-Lode intact.',
    cost: 'You recover no Heart crystal.',
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

const RESOURCE_LABELS = { provisions: 'provision', alloy: 'alloy', lumen: 'lumen' } as const;

const MODULE_CHANGE_TEXT: Record<ModuleId, string> = {
  heart_engine: 'Additional growth trays unfold around the heated core.',
  deep_drill: 'A second cutting head locks to the main shaft.',
  ward_array: 'New braces extend from the room into Orison’s legs.',
  foundry: 'The crucible accepts a hotter smelting cycle.',
  infirmary: 'A second pressure berth opens beneath the treatment lamps.',
  resonance_chamber: 'The chamber separates another band of the Heart-Lode signal.',
};

const SHIFT_BRIEFINGS = [
  '',
  'Orison woke the crew after the rock below transmitted all four of their names.',
  'The first Heart Note was structured language. Orison changed course without an order.',
  'The abandoned company beacon requests ore totals. Orison refuses to answer it.',
  'Signals from below now use the call signs of miners buried in Vesper.',
  'Hairline cracks in Orison pulse in time with the Heart-Lode transmission.',
  'The signal has resolved into a question: what will the crew do when they reach it?',
  'The Heart-Lode is directly below Orison. This is the last mission before the answer.',
] as const;

const PROLOGUE_CREW: readonly { id: CrewId; stake: string }[] = [
  { id: 'mara', stake: 'A rescue captain who will break the contract rather than abandon another crew.' },
  { id: 'tamsin', stake: 'A miner whose dead first crew has started answering the drill radio.' },
  { id: 'orin', stake: 'Orison’s engineer. The citadel is producing signals he did not program.' },
  { id: 'sable', stake: 'The ninth body in a survey line. Sable-8 erased one minute before death.' },
];

function signed(value: number): string {
  return `${value >= 0 ? '+' : '−'}${Math.abs(value)}`;
}

function roomForecastLabels(forecast: RoomAssignmentForecast): string[] {
  const labels = Object.entries(forecast.resources).flatMap(([resource, value]) => {
    if (!value) return [];
    return [`${RESOURCE_LABELS[resource as keyof typeof RESOURCE_LABELS]} ${signed(value)}`];
  });
  if (forecast.alloyCost) labels.push(`alloy −${forecast.alloyCost}`);
  if (forecast.integrityRepair) labels.push(`hull +${forecast.integrityRepair}`);
  if (forecast.protection) labels.push(`protection ${forecast.protection}`);
  if (forecast.crewStrain) labels.push(`operator strain ${signed(forecast.crewStrain)}`);
  if (forecast.allCrewStrain) labels.push(`all crew strain ${signed(forecast.allCrewStrain)}`);
  if (forecast.heartNotes) labels.push(`Heart Note +${forecast.heartNotes}`);
  return labels;
}

function missionRewardLabels(rewards: Partial<Record<keyof typeof RESOURCE_LABELS, number>>, heartNotes: number): string[] {
  const labels = Object.entries(rewards).flatMap(([resource, value]) => {
    if (!value) return [];
    return [`${RESOURCE_LABELS[resource as keyof typeof RESOURCE_LABELS]} +${value}`];
  });
  if (heartNotes) labels.push(`Heart Note +${heartNotes}`);
  return labels;
}

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
    <article className={`crew-card ${selected ? 'is-selected' : ''} ${crew.strain >= 4 ? 'is-pressured' : ''} ${unavailable ? 'is-incapacitated' : ''}`}>
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
            src={`${BASE_PATH}/art/crew-${crew.id}.webp`}
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
        <span className="crew-readout"><span><b>{crew.strain}</b>/6 STR</span>{crew.strain >= 4 && !unavailable && <em>PRESSURED · BONUS OFF</em>}</span>
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
      <div className="crew-arc" aria-label={`${crew.name} personal progression`}>
        <span><b>VOW</b><i>{Array.from({ length: 3 }, (_, index) => <em key={index} className={index < crew.vowProgress ? 'is-filled' : ''} />)}</i><small>{crew.vowProgress}/3</small></span>
        <span><b>TRUST</b><i>{Array.from({ length: 3 }, (_, index) => <em key={index} className={index < Math.max(0, crew.loyalty) ? 'is-filled' : ''} />)}</i><small>{crew.loyalty}/3</small></span>
        <strong className={crew.signatureUnlocked ? 'is-awakened' : ''}>{crew.signatureUnlocked ? 'SIGNATURE ACTIVE' : 'SIGNATURE LOCKED'}</strong>
      </div>
      <details>
        <summary>Open dossier <span>{crew.epithet}</span></summary>
        <p><b>VOW</b> {crew.vow}</p>
        <p><b>ADVANCE</b> {crew.vowAction}</p>
        <p><b>TALENT</b> {crew.talent}</p>
        <p><b>PRESSURE</b> {crew.drawback}</p>
        <p><b>{crew.signatureUnlocked ? 'ACTIVE SIGNATURE' : 'UNLOCK AT 3 TRUST'}</b> {crew.signature}</p>
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
          const tileOutput = module.forecast ? roomForecastLabels(module.forecast)[0] : null;
          return (
            <button
              type="button"
              key={slot}
              className={`room ${module.assignedCrew ? 'is-powered' : ''} ${selectedCrew ? 'can-assign' : ''}`}
              data-module={module.id}
              onClick={() => onRoom(slot)}
              data-testid={`room-${slot}`}
              aria-label={`${module.name}${assigned ? `, assigned to ${assigned.name}` : ', unstaffed'}`}
            >
              <span className="room-level">{String(module.level).padStart(2, '0')}</span>
              <span className="room-machine" aria-hidden="true"><i /><i /><i /><b>{MODULE_MARKS[module.id]}</b></span>
              <strong>{module.name}</strong>
              <small>{assigned ? `${assigned.name} · ${tileOutput ?? 'staffed'}` : selectedCrew ? 'Tap to assign' : 'Needs crew'}</small>
            </button>
          );
        })}
      </div>
      <div className="citadel-caption">
        <ToneMark active={Boolean(selectedCrew)} />
        <span>{selectedCrew ? 'Choose a room for the selected crew member.' : 'Staff rooms in the mission planner below. Adjacent rooms may improve output.'}</span>
      </div>
    </section>
  );
}

function RoomInspector({ view, slot, onClose }: { view: GameView; slot: number; onClose: () => void }) {
  const module = view.modules.find((candidate) => candidate.slot === slot);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  if (!module) return null;
  const assigned = view.crew.find((crew) => crew.id === module.assignedCrew);
  const neighbors = view.modules.filter((candidate) => {
    const leftRow = Math.floor(slot / 3);
    const rightRow = Math.floor(candidate.slot / 3);
    return Math.abs(leftRow - rightRow) + Math.abs((slot % 3) - (candidate.slot % 3)) === 1;
  });
  return (
    <div className="room-inspector-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="room-inspector" role="dialog" aria-modal="true" aria-labelledby="room-inspector-title" data-testid="room-inspector">
        <button type="button" className="inspector-close" onClick={onClose} aria-label="Close room inspection">×</button>
        <div className="inspector-heading">
          <span className="room inspector-machine-wrap" data-module={module.id} aria-hidden="true"><span className="room-machine inspector-machine"><i /><i /><i /><b>{MODULE_MARKS[module.id]}</b></span></span>
          <span><small>CHAMBER {String(slot + 1).padStart(2, '0')} // LEVEL {module.level}</small><h2 id="room-inspector-title">{module.name}</h2><p>{module.description}</p></span>
        </div>
        <div className="inspector-status">
          <span><b>THIS SHIFT</b>{assigned ? `${assigned.name} is assigned.` : 'No operator assigned.'}</span>
          <span><b>ADJACENT</b>{neighbors.length > 0 ? neighbors.map((neighbor) => neighbor.name).join(' · ') : 'No working rooms.'}</span>
          <span><b>UPGRADE</b>{module.upgradeCost === null ? 'Maximum level reached.' : `${module.upgradeCost} alloy to reach level ${module.level + 1}.`}</span>
        </div>
        {module.forecast && <div className="inspector-output"><span>CURRENT OUTPUT</span>{roomForecastLabels(module.forecast).map((label) => <b key={label}>{label}</b>)}{module.forecast.conditions.map((condition) => <em key={condition}>{condition}</em>)}</div>}
        <div className="inspector-rule"><span>ROOM RULE</span><p>{module.assignmentHint}</p></div>
        <div className="specialist-matrix" aria-label={`${module.name} crew effects`}>
          <span>WHO SHOULD WORK HERE?</span>
          {view.crew.map((crew) => {
            const forecast = forecastRoomAssignment(view.state as GameState, slot, crew.id);
            const effects = [...roomForecastLabels(forecast), ...forecast.conditions];
            return <article key={crew.id}><img src={`${BASE_PATH}/art/crew-${crew.id}.webp`} width="720" height="720" alt="" /><span><strong>{crew.name}</strong><p>{effects.join(' · ') || 'No immediate output.'}</p></span></article>;
          })}
        </div>
        <button type="button" className="inspector-done" onClick={onClose}>RETURN TO ORISON</button>
      </section>
    </div>
  );
}

function RouteChartStrip({ view, status, onReserve, onClear }: {
  view: GameView;
  status: string | null;
  onReserve: (instanceId: string) => void;
  onClear: () => void;
}) {
  const held = view.state.reservedRoute;
  if (!view.state.selectedRoute || view.state.shift >= 7) return null;
  const legal = legalCommands(view.state as GameState);
  const canClear = legal.some((command) => command.type === 'clear_route_reservation');
  const candidates = view.routes.filter((route) => route.instanceId !== view.state.selectedRoute);
  const helper = held
    ? `One route is held. Switch free, or release it to restore ${view.routeReservationCost} lumen.`
    : view.state.resources.lumen < view.routeReservationCost
      ? `${view.routeReservationCost} lumen required to chart a route.`
      : `Spend ${view.routeReservationCost} lumen to carry one unchosen route into the next forecast.`;
  return (
    <section className="route-chart" data-testid="route-chart" aria-labelledby="route-chart-title">
      <div className="route-chart-summary"><strong id="route-chart-title">OPTIONAL // RESERVE A MISSION</strong><small>{view.routeReservationCost} LUMEN</small></div>
      <div className="route-chart-body"><p id="route-chart-help">{helper}</p>
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
      </div>
    </section>
  );
}

function normalizeSettings(value: unknown): Settings {
  if (!value || typeof value !== 'object') return DEFAULT_SETTINGS;
  const candidate = value as Partial<Settings>;
  const volume = typeof candidate.volume === 'number' && Number.isFinite(candidate.volume)
    ? Math.max(0, Math.min(1, candidate.volume))
    : DEFAULT_SETTINGS.volume;
  return {
    muted: typeof candidate.muted === 'boolean' ? candidate.muted : DEFAULT_SETTINGS.muted,
    highContrast: typeof candidate.highContrast === 'boolean' ? candidate.highContrast : DEFAULT_SETTINGS.highContrast,
    reducedMotion: typeof candidate.reducedMotion === 'boolean' ? candidate.reducedMotion : DEFAULT_SETTINGS.reducedMotion,
    volume,
  };
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
    settings: normalizeSettings(candidateSettings),
  };
}

function RoutePanel({ view, chartStatus, onSelect, onReserve, onClearReservation, onAssign, onUnassign, onLeader, onUnassignLeader, onResolve }: {
  view: GameView;
  chartStatus: string | null;
  onSelect: (instanceId: string) => void;
  onReserve: (instanceId: string) => void;
  onClearReservation: () => void;
  onAssign: (crewId: CrewId, slot: number) => void;
  onUnassign: (crewId: CrewId) => void;
  onLeader: (crewId: CrewId) => void;
  onUnassignLeader: (crewId: CrewId) => void;
  onResolve: () => void;
}) {
  const [plannerStatus, setPlannerStatus] = useState('');
  const legal = legalCommands(view.state as GameState);
  const leader = view.crew.find((crew) => crew.id === view.state.routeLeader);
  const availableCrew = view.crew.filter((crew) => crew.incapacitatedUntil <= view.state.shift);
  const requiredRooms = Math.min(3, availableCrew.length, view.modules.length);
  const staffedRooms = view.modules.filter((module) => module.assignedCrew).length;
  const missionReady = Boolean(view.state.selectedRoute);
  const selectedRoute = view.routes.find((route) => route.instanceId === view.state.selectedRoute);
  const focusCrewId = selectedRoute?.definition.focusCrew;
  const focusOnDuty = Boolean(focusCrewId && (view.state.routeLeader === focusCrewId || view.modules.some((module) => module.assignedCrew === focusCrewId)));
  const roomProvisions = view.modules.reduce((total, module) => total + (module.forecast?.resources.provisions ?? 0), 0);
  const projectedProvisions = selectedRoute ? view.state.resources.provisions + roomProvisions - selectedRoute.forecast.provisionCost : view.state.resources.provisions;
  const staffingReady = staffedRooms === requiredRooms;
  const firstUnstaffed = view.modules.find((module) => !module.assignedCrew);
  const carriedRelic = view.state.startingRelic ? RELICS.find((relic) => relic.id === view.state.startingRelic) : null;
  const handleMissionAction = () => {
    if (!missionReady) {
      document.getElementById('mission-options')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setPlannerStatus('Choose one mission before deployment.');
      return;
    }
    if (!staffingReady) {
      document.getElementById(`staff-room-${firstUnstaffed?.slot ?? 0}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setPlannerStatus(`Staff ${requiredRooms - staffedRooms} more room${requiredRooms - staffedRooms === 1 ? '' : 's'}.`);
      return;
    }
    setPlannerStatus('Mission deployed.');
    onResolve();
  };
  return (
    <section className="route-panel mission-planner" aria-labelledby="route-title">
      <div className="section-heading compact">
        <div><span className="kicker">MISSION PLANNER</span><h2 id="route-title">Prepare this shift</h2></div>
        <span className="phase-tag">PLANNING</span>
      </div>
      <p className="objective">{view.objective}</p>
      <p className="shift-brief"><span>WHAT IS HAPPENING</span>{SHIFT_BRIEFINGS[view.state.shift]}</p>
      {carriedRelic && <details className="run-relic"><summary>RELIC // {carriedRelic.name}</summary><p>{carriedRelic.startingEffect}</p></details>}
      <div className="planner-step-heading"><span>1</span><div><strong>Choose a mission</strong>{view.state.shift === 1 && <small>Compare the reward with the hull, ration, and strain forecast.</small>}</div><b>{missionReady ? 'SELECTED' : 'REQUIRED'}</b></div>
      <div className="route-list" id="mission-options">
        {view.routes.map((route, index) => {
          const selected = view.state.selectedRoute === route.instanceId;
          const focus = view.crew.find((crew) => crew.id === route.definition.focusCrew)!;
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
                <span className="route-focus"><img src={`${BASE_PATH}/art/crew-${focus.id}.webp`} width="720" height="720" alt="" />{focus.name.toUpperCase()} · VOW · DUTY REQUIRED</span>
                {route.revealed && route.hiddenComplication && <em>Foreseen: {route.hiddenComplication}</em>}
              </span>
              <span className="route-risk"><b>{route.definition.hazard}</b><small>RISK</small></span>
              <span className="route-reward">MISSION REWARD · {missionRewardLabels(route.forecast.rewards, route.forecast.heartNotes).join(' · ') || 'no resources'}</span>
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
      {selectedRoute && <aside className="mission-story" data-testid="mission-story">
        {(() => {
          const focus = view.crew.find((crew) => crew.id === selectedRoute.definition.focusCrew)!;
          return <div className="mission-focus"><img src={`${BASE_PATH}/art/crew-${focus.id}.webp`} width="720" height="720" alt="" /><span><b>{focus.name.toUpperCase()} // PERSONAL STAKE</b><small>Keep {focus.name.split(' ')[0]} in a room or appoint them leader to advance the vow. Resting protects them from strain but misses this step.</small></span></div>;
        })()}
        <span>WHY THIS MISSION MATTERS</span>
        <p>{selectedRoute.definition.storyLead}</p>
        {selectedRoute.definition.counterCrew && selectedRoute.definition.counterpoint && (() => {
          const counter = view.crew.find((crew) => crew.id === selectedRoute.definition.counterCrew)!;
          return <blockquote className="mission-counter"><img src={`${BASE_PATH}/art/crew-${counter.id}.webp`} width="720" height="720" alt="" /><span><b>{counter.name.toUpperCase()} // OBJECTION</b><p>“{selectedRoute.definition.counterpoint}”</p></span></blockquote>;
        })()}
        <small><b>KNOWN HAZARD</b> {selectedRoute.definition.hazardText}</small>
      </aside>}
      {selectedRoute && <aside className="tactical-read" data-testid="tactical-read">
        <span><small>HULL AFTER MISSION</small><b>{selectedRoute.forecast.hullDamageMax === 0 ? 'NO KNOWN LOSS' : `−${selectedRoute.forecast.hullDamageMin}${selectedRoute.forecast.hullDamageMax !== selectedRoute.forecast.hullDamageMin ? `–${selectedRoute.forecast.hullDamageMax}` : ''} HULL`}</b><em>{selectedRoute.forecast.hullDamageMax === 0 ? 'Current staffing covers the known hazard.' : 'Ward protection or Mara’s leadership can reduce this.'}</em></span>
        <span><small>PERSONAL VOW</small><b>{focusOnDuty ? 'ON DUTY' : 'RESTING'}</b><em>{focusOnDuty ? 'This mission can advance the selected crew arc.' : 'Rest lowers strain but forfeits this mission’s vow step.'}</em></span>
        <span><small>RATION AFTER ROOMS</small><b>{projectedProvisions}</b><em>{projectedProvisions < 1 ? 'The plan cannot pay the mission cost.' : projectedProvisions < 3 ? 'Little reserve remains for leadership or later shifts.' : 'Enough reserve remains for optional leadership.'}</em></span>
      </aside>}
      <RouteChartStrip view={view} status={chartStatus} onReserve={onReserve} onClear={onClearReservation} />
      <div className="planner-step-heading"><span>2</span><div><strong>Staff {requiredRooms} rooms</strong>{view.state.shift === 1 && <small>Each room lists its exact output. A crew member can staff only one room.</small>}</div><b>{staffedRooms}/{requiredRooms}</b></div>
      <div className="staffing-list" data-testid="staffing-list">
        {view.modules.map((module) => {
          const assigned = view.crew.find((crew) => crew.id === module.assignedCrew);
          const output = module.forecast ? roomForecastLabels(module.forecast) : [];
          return (
            <article className={`staffing-room ${assigned ? 'is-staffed' : ''}`} id={`staff-room-${module.slot}`} key={module.slot} data-testid={`staff-room-${module.slot}`}>
              <div className="staffing-room-heading">
                <span className="module-sigil">{MODULE_MARKS[module.id]}</span>
                <div><strong>{module.name}</strong><small>LEVEL {module.level} · {module.assignmentHint}</small></div>
                <b>{assigned?.name ?? 'OPEN'}</b>
              </div>
              <div className="staffing-crew-options" role="group" aria-label={`Crew for ${module.name}`}>
                {view.crew.map((crew) => {
                  const isCurrent = module.assignedCrew === crew.id;
                  const canAssign = legal.some((command) => command.type === 'assign_crew' && command.crewId === crew.id && command.slot === module.slot);
                  const forecast = forecastRoomAssignment(view.state as GameState, module.slot, crew.id);
                  const preview = [...roomForecastLabels(forecast), ...forecast.conditions].join(' · ') || 'no immediate output';
                  return (
                    <button
                      type="button"
                      className={isCurrent ? 'is-selected' : ''}
                      key={crew.id}
                      data-testid={`staff-${module.slot}-${crew.id}`}
                      aria-pressed={isCurrent}
                      disabled={!isCurrent && !canAssign}
                      onClick={() => isCurrent ? onUnassign(crew.id) : onAssign(crew.id, module.slot)}
                    >
                      <strong>{crew.name.split(' ')[0]}{selectedRoute?.definition.focusCrew === crew.id && <em className="vow-duty">VOW</em>}</strong><small>{crew.incapacitatedUntil > view.state.shift ? `back shift ${crew.incapacitatedUntil + 1}` : preview}</small>
                    </button>
                  );
                })}
              </div>
              <div className="staffing-output" aria-live="polite">
                {assigned
                  ? <><strong>This shift</strong>{output.map((label) => <span key={label}>{label}</span>)}{module.forecast?.conditions.map((condition) => <em key={condition}>{condition}</em>)}</>
                  : <span>Choose a crew member.</span>}
              </div>
            </article>
          );
        })}
      </div>
      <div className="planner-step-heading"><span>3</span><div><strong>Rest or lead</strong>{view.state.shift === 1 && <small>The unassigned crew member rests by default. Leading costs 1 extra provision.</small>}</div><b>OPTIONAL</b></div>
      <div className={`leader-post ${leader ? 'is-staffed' : ''}`} data-testid="leader-post">
        <span className="leader-mark">IV</span>
        <span className="leader-copy">
          <small>{leader ? 'MISSION LEADER' : 'DEFAULT // REST'}</small>
          <strong>{leader?.name ?? 'Unassigned crew rests'}</strong>
          <em>{leader ? LEADER_EFFECTS[leader.id] : 'Rest removes 2 strain and costs no provisions.'}</em>
        </span>
        {leader && <button type="button" onClick={() => onUnassignLeader(leader.id)} aria-label={`Recall ${leader.name} from expedition leadership`}>REST</button>}
      </div>
      {!leader && staffingReady && <div className="leader-options" role="group" aria-label="Optional mission leader">
        {view.crew.map((crew) => {
          const canLead = legal.some((command) => command.type === 'assign_route_leader' && command.crewId === crew.id);
          const alreadyWorking = view.modules.some((module) => module.assignedCrew === crew.id);
          return <button type="button" key={crew.id} disabled={!canLead} onClick={() => onLeader(crew.id)}><strong>{crew.name}{selectedRoute?.definition.focusCrew === crew.id && <em className="vow-duty">VOW</em>}</strong><small>{alreadyWorking ? 'Staffing a room' : canLead ? LEADER_EFFECTS[crew.id] : 'Needs 2 provisions available'}</small></button>;
        })}
      </div>}
      <div className="mission-action-bar">
        <div className="mission-checklist" aria-label="Deployment checklist"><span className={missionReady ? 'is-complete' : ''}>MISSION {missionReady ? '✓' : '○'}</span><span className={staffingReady ? 'is-complete' : ''}>ROOMS {staffedRooms}/{requiredRooms}</span>{focusCrewId && <span className={focusOnDuty ? 'is-complete' : 'is-warning'}>VOW {focusOnDuty ? 'ON DUTY' : 'RESTING'}</span>}</div>
        <button type="button" className="primary-action" onClick={handleMissionAction} data-testid="resolve-shift">
          <span>{view.canResolveShift ? 'All required crew and equipment are ready.' : !missionReady ? 'One mission must be selected.' : `${requiredRooms - staffedRooms} room${requiredRooms - staffedRooms === 1 ? '' : 's'} still need crew.`}</span>
          <b>{view.canResolveShift ? 'DEPLOY MISSION' : !missionReady ? 'CHOOSE MISSION' : `STAFF ${requiredRooms - staffedRooms}`}</b>
        </button>
        <span className="planner-status" role="status" aria-live="polite">{plannerStatus}</span>
      </div>
    </section>
  );
}

function EventPanel({ view, report, onChoose }: { view: GameView; report: ShiftReport | null; onChoose: (choiceIndex: number) => void }) {
  const event = view.activeStoryEvent;
  if (!event) return <p className="empty-message">No event signal was received.</p>;
  const speaker = view.crew.find((crew) => crew.id === event.speaker);
  const legalChoices = new Set(legalCommands(view.state as GameState)
    .filter((command) => command.type === 'choose_event')
    .map((command) => command.choiceIndex));
  const effectLabels = (choice: EventChoice) => {
    const labels: string[] = [];
    const resources = { provisions: 'PRO', alloy: 'ALY', lumen: 'LUM' } as const;
    for (const [resource, amount] of Object.entries(choice.resourceDelta ?? {}) as [keyof typeof resources, number][]) {
      labels.push(`${resources[resource]} ${amount >= 0 ? '+' : '−'}${Math.abs(amount)}`);
    }
    if (choice.integrityDelta) labels.push(`HULL ${choice.integrityDelta >= 0 ? '+' : '−'}${Math.abs(choice.integrityDelta)}`);
    if (choice.noteDelta) labels.push(`NOTE ${choice.noteDelta >= 0 ? '+' : '−'}${Math.abs(choice.noteDelta)}`);
    const crewName = choice.crewId ? view.crew.find((crew) => crew.id === choice.crewId)?.name.toUpperCase() : null;
    if (crewName && choice.loyaltyDelta) labels.push(`${crewName} LOY ${choice.loyaltyDelta >= 0 ? '+' : '−'}${Math.abs(choice.loyaltyDelta)}`);
    if (crewName && choice.strainDelta) labels.push(`${crewName} STR ${choice.strainDelta >= 0 ? '+' : '−'}${Math.abs(choice.strainDelta)}`);
    return labels;
  };
  return (
    <section className="event-panel" aria-labelledby="event-title" data-testid="event-panel">
      {report && <aside className="shift-report" data-testid="shift-report">
        <div><span>SHIFT {report.shift} // FIELD REPORT</span><strong>What your plan did</strong></div>
        <ul>{report.events.map((result) => <li key={result.id} data-kind={result.kind}><i />{result.text}</li>)}</ul>
        <footer><span>PRO <b>{report.resources.provisions}</b></span><span>ALY <b>{report.resources.alloy}</b></span><span>LUM <b>{report.resources.lumen}</b></span><span>HULL <b>{report.integrity}</b></span><span>NOTES <b>{report.heartNotes}/3</b></span></footer>
      </aside>}
      <div className="event-speaker">
        {speaker ? <span className="crew-portrait event-portrait" style={{ '--crew-color': speaker.color } as React.CSSProperties}><img src={`${BASE_PATH}/art/crew-${speaker.id}.webp`} width="720" height="720" alt="" /></span> : <ToneMark active />}
        <span><small className="kicker">MISSION EVENT // {speaker?.name ?? 'ORISON'}</small><strong>{speaker ? speaker.role : 'LIVING CITADEL'}</strong>{speaker && <em>VOW {speaker.vowProgress}/3 · TRUST {speaker.loyalty}/3</em>}</span>
      </div>
      <h2 id="event-title">{event.title}</h2>
      <p className="event-body">{event.body}</p>
      {speaker && <p className="event-vow"><b>{speaker.name.toUpperCase()} WANTS</b> {speaker.vow}</p>}
      <div className="choice-list">
        {event.choices.map((choice, index) => {
          const effects = effectLabels(choice);
          return <button type="button" key={choice.label} onClick={() => onChoose(index)} disabled={!legalChoices.has(index)} data-testid={`event-choice-${index}`}>
            <strong>{choice.label}</strong><span>{choice.consequence}</span>
            <small className="choice-effects" aria-label="Exact effects">{effects.map((effect) => <b key={effect}>{effect}</b>)}</small>
            {!legalChoices.has(index) && <em>REQUIRES RESOURCES YOU DO NOT HAVE</em>}
          </button>;
        })}
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
  const builtIds = new Set(view.modules.map((module) => module.id));
  const choiceDefinitions = MODULES.filter((module) => !builtIds.has(module.id));
  const emptySlots = Array.from({ length: 9 }, (_, index) => index).filter((index) => !view.modules.some((module) => module.slot === index));
  const legal = legalCommands(view.state);
  const canBuild = (moduleId: ModuleId, targetSlot: number | null) => targetSlot !== null && legal.some((command) => command.type === 'build_module' && command.moduleId === moduleId && command.slot === targetSlot);
  const canUpgrade = (targetSlot: number) => legal.some((command) => command.type === 'upgrade_module' && command.slot === targetSlot);
  const canRepair = legal.some((command) => command.type === 'repair_citadel');
  const repairAmount = Math.min(2, view.maxIntegrity - view.state.integrity);
  const placementEffect = (moduleId: ModuleId) => {
    if (slot === null) return 'Choose a chamber to preview its links.';
    const neighbors = view.modules.filter((candidate) => {
      const leftRow = Math.floor(slot / 3);
      const rightRow = Math.floor(candidate.slot / 3);
      return Math.abs(leftRow - rightRow) + Math.abs((slot % 3) - (candidate.slot % 3)) === 1;
    });
    const effects: string[] = [];
    if (moduleId !== 'heart_engine' && neighbors.some((neighbor) => neighbor.id === 'heart_engine')) effects.push('HEART LINK · operates 1 level stronger');
    if (moduleId === 'foundry' && neighbors.some((neighbor) => neighbor.id === 'deep_drill')) effects.push('DRILL LINK · repairs 1 extra hull');
    return effects.join(' · ') || 'NO LINK BONUS · another chamber may produce more';
  };
  return (
    <section className="development-panel" aria-labelledby="development-title" data-testid="development-panel">
      <span className="kicker">CITADEL WORKSHOP</span>
      <h2 id="development-title">Change Orison’s body</h2>
      <p>Orison carries a nine-chamber body. Build machinery in an open chamber, improve a working room, or plate the hull. One project can be completed before the next shift.</p>
      <div className="workshop-state"><span>AVAILABLE ALLOY</span><b>{view.state.resources.alloy}</b><small>{slot === null ? 'Choose an open chamber.' : `Chamber ${slot + 1} selected for construction.`}</small></div>
      <div className="slot-picker" aria-label="Empty chamber selection">
        {emptySlots.map((emptySlot) => (
          <button type="button" key={emptySlot} onClick={() => onSlot(emptySlot)} className={slot === emptySlot ? 'is-selected' : ''}>
            <span>CHAMBER</span><b>{String(emptySlot + 1).padStart(2, '0')}</b>
          </button>
        ))}
      </div>
      <div className="workshop-section-heading"><span>NEW CONSTRUCTION</span><b>Choose one room for chamber {slot === null ? '—' : slot + 1}</b></div>
      <div className="module-choices">
        {choiceDefinitions.map((module) => {
          const missingAlloy = Math.max(0, module.buildCost - view.state.resources.alloy);
          const legalBuild = canBuild(module.id, slot);
          const action = slot === null ? 'CHOOSE CHAMBER' : missingAlloy > 0 ? `NEED ${missingAlloy} MORE ALLOY` : `BUILD IN CHAMBER ${slot + 1}`;
          return <article className={`module-choice ${legalBuild ? 'is-affordable' : ''}`} key={module.id} data-module={module.id}>
            <span className="room module-blueprint" data-module={module.id} aria-hidden="true"><span className="room-machine"><i /><i /><i /><b>{MODULE_MARKS[module.id]}</b></span></span>
            <div><strong>{module.name}</strong><p>{module.description}</p><em>{module.assignmentHint}</em><span className="placement-effect" data-testid={`placement-${module.id}`}>{placementEffect(module.id)}</span><small>COST · {module.buildCost} ALLOY</small></div>
            <button type="button" onClick={() => slot !== null && onBuild(module.id, slot)} disabled={!legalBuild} data-testid={`build-${module.id}`}>
              {action}
            </button>
          </article>;
        })}
      </div>
      <div className="upgrade-row">
        <span><strong>Improve a working room</strong><small>Higher levels increase that room’s base output.</small></span>
        <div>{view.modules.map((module) => {
          const missingAlloy = module.upgradeCost === null ? 0 : Math.max(0, module.upgradeCost - view.state.resources.alloy);
          const label = module.upgradeCost === null ? 'MAX LEVEL' : missingAlloy > 0 ? `NEED ${missingAlloy} MORE ALLOY` : `UPGRADE · ${module.upgradeCost} ALLOY`;
          return <button key={module.slot} type="button" disabled={!canUpgrade(module.slot)} onClick={() => onUpgrade(module.slot)}><strong>{module.name} · LV{module.level}</strong><small>{label}</small></button>;
        })}</div>
      </div>
      <div className="repair-row">
        <span><strong>Repair the hull</strong><small>{repairAmount > 0 ? `Restore ${repairAmount} hull and end this workshop phase.` : 'Hull is already full.'}</small></span>
        <button type="button" onClick={onRepair} disabled={!canRepair} data-testid="repair-citadel">REPAIR · {view.repairCost} ALLOY</button>
      </div>
      <button className="text-button" type="button" onClick={onSkip}>SAVE ALLOY AND CONTINUE</button>
    </section>
  );
}

function FinalePanel({ view, onChoose }: { view: GameView; onChoose: (ending: EndingId) => void }) {
  return (
    <section className="finale-panel" aria-labelledby="finale-title" data-testid="finale-panel">
      <span className="kicker">HEART-LODE // FINAL DECISION</span>
      <div className="heart-glyph" aria-hidden="true"><i /><i /><i /></div>
      <h2 id="finale-title">Decide what happens to the Heart-Lode</h2>
      <p>The mine is open and the moon is responding. Choose the expedition's final order.</p>
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
  const score = scoreBreakdown(view.state as GameState);
  const [reportCopied, setReportCopied] = useState(false);
  const scoreLines = [
    ['Expedition completed', score.completion],
    [`${view.state.shift} shifts endured`, score.shifts],
    [`${view.state.heartNotes} Heart Notes`, score.heartNotes],
    [`${view.state.integrity} hull integrity`, score.integrity],
    ['Fulfilled vows', score.fulfilledVows],
    ['Crew loyalty', score.loyalty],
    ['Lasting scars', score.scars],
  ] as const;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const copyReport = async () => {
    const replayUrl = new URL(window.location.pathname, window.location.href);
    replayUrl.searchParams.set('seed', view.state.seed);
    replayUrl.searchParams.set('mode', view.state.runMode);
    const outcome = won ? ENDINGS[view.state.ending ?? 'harmonize'].title : 'Orison went dark';
    const report = [
      `LODE CHOIR // ${won ? 'CONCORDANT' : 'SILENCED'}`,
      `${outcome} · ${modeLabel}`,
      `Seed: ${view.state.seed}`,
      `Score: ${score.total} · Shift: ${view.state.shift}/7 · Notes: ${view.state.heartNotes}/3 · Hull: ${view.state.integrity}`,
      `Replay this signal: ${replayUrl.toString()}`,
    ].join('\n');
    let copied = false;
    try {
      await navigator.clipboard.writeText(report);
      copied = true;
    } catch {
      const field = document.createElement('textarea');
      field.value = report;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.append(field);
      field.select();
      copied = document.execCommand('copy');
      field.remove();
    }
    setReportCopied(copied);
    if (copied) window.setTimeout(() => setReportCopied(false), 1600);
  };
  return (
    <section className={`completion-panel ${won ? 'is-victory' : 'is-loss'}`} data-testid="completion-panel">
      <span className="kicker">RUN // {won ? 'CONCORDANT' : 'SILENCED'} // {modeLabel}</span>
      <ToneMark active={won} />
      <h2 ref={heading} tabIndex={-1}>{won ? ENDINGS[view.state.ending ?? 'harmonize'].title : 'Orison goes dark.'}</h2>
      {won && view.endingNarrative ? <div className="ending-story" data-testid="ending-story">
        <p>{view.endingNarrative.opening}</p>
        <div className="ending-crew-codas">
          {view.endingNarrative.crew.map((coda) => {
            const crew = view.crew.find((candidate) => candidate.id === coda.crewId)!;
            return <article key={coda.crewId} style={{ '--crew-color': crew.color } as React.CSSProperties}>
              <span className="crew-portrait"><img src={`${BASE_PATH}/art/crew-${crew.id}.webp`} width="720" height="720" alt="" /></span>
              <span><strong>{crew.name}</strong><small>{crew.vowProgress >= 3 ? 'VOW KEPT' : crew.signatureUnlocked ? 'SIGNATURE AWAKENED' : 'VOW UNFINISHED'} · TRUST {crew.loyalty}</small><p>{coda.text}</p></span>
            </article>;
          })}
        </div>
        <p className="ending-close">{view.endingNarrative.closing}</p>
      </div> : <p>{view.state.endingText ?? 'The Orison cannot continue.'}</p>}
      <div className="completion-stats">
        <span><b>{scoreRun(view.state as GameState)}</b> echo score</span><span><b>{view.state.shift}</b> shifts</span><span><b>{view.state.heartNotes}</b> Heart Notes</span><span><b>{view.state.integrity}</b> integrity</span>
      </div>
      <details className="score-breakdown">
        <summary>Inspect score ledger <span>{score.base} base{score.multiplier > 1 ? ` × ${score.multiplier}` : ''}</span></summary>
        <dl>
          {scoreLines.map(([label, value]) => <div key={label}><dt>{label}</dt><dd className={value < 0 ? 'is-penalty' : ''}>{value >= 0 ? '+' : '−'}{Math.abs(value)}</dd></div>)}
          <div className="score-total"><dt>Final echo score</dt><dd>{score.total}</dd></div>
        </dl>
      </details>
      <div className="completion-actions">
        <button className="primary-action" type="button" onClick={onNewRun}>Start another expedition</button>
        <button className="text-button" type="button" onClick={copyReport}>{reportCopied ? 'Report copied' : 'Copy expedition report'}</button>
        <button className="text-button" type="button" onClick={onChronicle}>Open Chronicle</button>
      </div>
    </section>
  );
}

function Chronicle({ legacy, onRetry, onBack }: { legacy: LegacyState; onRetry: (record: RunRecord) => void; onBack: () => void }) {
  const standardScores = legacy.records.filter((record) => record.runMode === 'standard' && record.scoreVersion === 2).map((record) => record.score);
  const blackScores = legacy.records.filter((record) => record.runMode === 'black_descent' && record.scoreVersion === 2).map((record) => record.score);
  const crewEchoes = CREW.map((definition) => {
    const records = legacy.records.flatMap((record) => record.crew).filter((crew) => crew.id === definition.id);
    return {
      definition,
      vows: records.filter((crew) => crew.vowProgress >= 3).length,
      signatures: records.filter((crew) => crew.signatureUnlocked).length,
      scars: records.filter((crew) => crew.scarred).length,
      trust: records.length > 0 ? Math.max(...records.map((crew) => crew.loyalty)) : 0,
    };
  });
  return (
    <MenuPage eyebrow="EXPEDITION ARCHIVE" title="The Chronicle" onBack={onBack}>
      <div className="chronicle-summary">
        <span><b>{legacy.runsCompleted}</b> expeditions</span>
        <span><b>{standardScores.length ? Math.max(...standardScores) : '—'}</b> best standard</span>
        <span><b>{blackScores.length ? Math.max(...blackScores) : '—'}</b> best Black Descent</span>
        <span><b>{legacy.endings.length}/3</b> recorded endings</span>
        <span><b>{legacy.lore.length}/{LORE.length}</b> lore fragments</span>
      </div>
      <h2>Crew echoes</h2>
      <div className="chronicle-crew" data-testid="chronicle-crew">
        {crewEchoes.map(({ definition, vows, signatures, scars, trust }) => <article key={definition.id}>
          <img src={`${BASE_PATH}/art/crew-${definition.id}.webp`} width="720" height="720" alt="" />
          <span><strong>{definition.name}</strong><small>{definition.role}</small><p>{vows} vows kept · {signatures} signatures awakened · {scars} scars carried · best trust {trust}</p></span>
        </article>)}
      </div>
      <h2>Recent expeditions</h2>
      {legacy.records.length ? <ol className="run-history">{legacy.records.map((record, index) => {
        const relic = record.startingRelic ? RELICS.find((candidate) => candidate.id === record.startingRelic) : null;
        const outcome = record.outcome === 'won' && record.ending ? ENDINGS[record.ending].title : 'Orison went dark';
        return <li key={`${record.seed}-${index}`}>
          <span className={record.outcome === 'won' ? 'is-win' : 'is-loss'}>{record.outcome === 'won' ? 'CONCORDANT' : 'SILENCED'} · {record.runMode === 'black_descent' ? 'BLACK DESCENT' : 'STANDARD'}</span>
          <strong>{outcome}</strong><b>{record.score}</b>
          <small>{record.seed} · SHIFT {record.shift}/7 · {record.heartNotes} NOTES · {record.scars} SCARS · {record.fulfilledVows} VOWS{relic ? ` · ${relic.name}` : ''}{record.scoreVersion === 1 ? ' · ARCHIVED FORMULA' : record.runMode === 'black_descent' ? ` · BASE ${record.baseScore} × ${record.scoreMultiplier}` : ''}</small>
          {record.crew.length > 0 && <div className="run-crew-line">{record.crew.map((crew) => {
            const definition = CREW.find((candidate) => candidate.id === crew.id)!;
            return <span key={crew.id}><img src={`${BASE_PATH}/art/crew-${crew.id}.webp`} width="720" height="720" alt="" /><b>{definition.name}</b><small>VOW {crew.vowProgress}/3 · TRUST {crew.loyalty}{crew.signatureUnlocked ? ' · SIGNATURE' : ''}{crew.scarred ? ' · SCAR' : ''}</small></span>;
          })}</div>}
          <button type="button" onClick={() => onRetry(record)}>PREPARE SAME SIGNAL</button>
        </li>;
      })}</ol> : <p className="empty-message">No completed expeditions yet.</p>}
      <h2>Recorded endings</h2>
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
              <p>{found ? relic.description : 'Complete the expedition with a different ending to unlock this relic.'}</p>
              <small>{found ? relic.startingEffect : 'Effect unavailable.'}</small>
            </article>
          );
        })}
      </div>
      <h2>Lore fragments</h2>
      {legacy.lore.length ? <ul className="lore-list">{legacy.lore.map((loreId) => {
        const lore = LORE.find((candidate) => candidate.id === loreId);
        return lore ? <li key={lore.id}><strong>{lore.title}</strong><span>{lore.text}</span></li> : null;
      })}</ul> : <p className="empty-message">Complete a mission to recover the first record.</p>}
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

function SettingsPage({ settings, installStatus, onChange, onInstall, onCreateBackup, onRestoreBackup, onBack }: {
  settings: Settings;
  installStatus: InstallStatus;
  onChange: (settings: Settings) => void;
  onInstall: () => void;
  onCreateBackup: () => string;
  onRestoreBackup: (serialized: string) => string;
  onBack: () => void;
}) {
  const [backupText, setBackupText] = useState('');
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const settingRows: { key: 'muted' | 'highContrast' | 'reducedMotion'; title: string; body: string }[] = [
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
        <label className="volume-setting">
          <span><strong>Choir volume</strong><small>Balance the moon-drone and interface tones.</small></span>
          <input type="range" min="0" max="1" step="0.05" value={settings.volume} aria-label="Choir volume" onChange={(event) => onChange({ ...settings, volume: Number(event.target.value) })} />
          <output>{Math.round(settings.volume * 100)}%</output>
        </label>
      </div>
      <section className="install-card" aria-labelledby="install-card-title">
        <span className="kicker">OFFLINE // FIELD KIT</span>
        <div>
          <h2 id="install-card-title">{installStatus === 'installed' ? 'Orison is installed' : installStatus === 'ready' ? 'Install Lode Choir' : installStatus === 'accepted' ? 'Installation accepted' : 'Keep Orison offline'}</h2>
          <p>{installStatus === 'installed'
            ? 'This build is running as a standalone installed expedition.'
            : installStatus === 'ready'
              ? 'Add the complete expedition to this device for a standalone, offline-ready launch.'
              : installStatus === 'accepted'
                ? 'The browser accepted the request. Follow its final system prompt if one appears.'
                : 'After one online visit, the complete expedition is cached. Use your browser’s Install app or Add to Home Screen command to keep it.'}</p>
        </div>
        {installStatus === 'ready' && <button type="button" onClick={onInstall}>INSTALL APP</button>}
      </section>
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

function DecisionEcho({ view, report }: { view: GameView; report: DecisionReport }) {
  const speaker = report.speaker === 'orison' ? null : view.crew.find((crew) => crew.id === report.speaker);
  return (
    <aside className="decision-echo" data-testid="decision-echo">
      <div className="decision-witness">
        {speaker ? <span className="crew-portrait" style={{ '--crew-color': speaker.color } as React.CSSProperties}><img src={`${BASE_PATH}/art/crew-${speaker.id}.webp`} width="720" height="720" alt="" /></span> : <span className="decision-orison" aria-hidden="true">LC</span>}
        <span><small>{report.label ?? 'LAST DECISION'} // SHIFT {report.shift}</small><strong>{report.title}</strong></span>
      </div>
      <p><b>{report.choice}</b> {report.consequence}</p>
      {report.aftermath && <blockquote>{report.aftermath}</blockquote>}
    </aside>
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

function ProloguePage({ view, onEnter, onAbort }: { view: GameView; onEnter: () => void; onAbort: () => void }) {
  return (
    <main className="prologue-screen" data-testid="prologue-screen">
      <section className="prologue-art" aria-label="Orison crossing the moon Vesper">
        <img src={`${BASE_PATH}/art/orison-title.webp`} width="1536" height="1024" alt="Orison, a six-legged mining citadel, walking through the black caverns of Vesper." />
        <div><span>VESPER // DESCENT CONTRACT</span><strong>Seven shifts remain</strong></div>
      </section>
      <section className="prologue-copy">
        <button type="button" className="back-button" onClick={onAbort}>← RETURN TO SETUP</button>
        <span className="kicker">BEFORE THE FIRST SHIFT</span>
        <h1>Orison woke you because the moon said your names.</h1>
        <p className="prologue-premise"><strong>Orison is a walking mining citadel.</strong> Its six legs carry nine working rooms through Vesper’s abandoned mine. Now a signal called the Heart-Lode is speaking through its walls.</p>
        <div className="contract-terms">
          <span><b>HEART NOTES</b> Complete phrases recovered from the signal. Three Notes are enough to answer it.</span>
          <span><b>THE CONTRACT</b> Recover three Notes in seven shifts, keep Orison walking, then decide what the Heart-Lode is.</span>
          <span><b>EACH SHIFT</b> Choose a site, assign three people to Orison’s rooms, and answer what the mission uncovers.</span>
        </div>
        <blockquote>“Nobody drills the Heart until we know whether it can feel the cut.”<cite>— Mara Vey, captain</cite></blockquote>
        <div className="prologue-crew" aria-label="Orison crew">
          {PROLOGUE_CREW.map(({ id, stake }) => {
            const crew = view.crew.find((candidate) => candidate.id === id)!;
            return <article key={id}><img src={`${BASE_PATH}/art/crew-${id}.webp`} alt="" /><span><strong>{crew.name}</strong><small>{crew.role}</small><p>{stake}</p></span></article>;
          })}
        </div>
        <button type="button" className="primary-action prologue-enter" onClick={onEnter} data-testid="enter-orison"><span>Seed {view.state.seed} · {view.state.runMode === 'black_descent' ? 'Black Descent' : 'Standard Descent'}</span><b>ENTER ORISON</b></button>
      </section>
    </main>
  );
}

function ManualPage({ onBack }: { onBack: () => void }) {
  return (
    <MenuPage eyebrow="ORISON // FIELD MANUAL" title="How an expedition works" onBack={onBack}>
      <div className="manual-grid">
        <article><span>01 // PREMISE</span><h2>Listen before you mine</h2><p>Orison is a walking citadel inside the moon Vesper. Heart Notes are complete phrases recovered from a signal below the abandoned mine.</p></article>
        <article><span>02 // MISSION</span><h2>Choose one destination</h2><p>Each mission card shows rewards, hull damage, ration cost, and total crew strain. Risk is already included in the forecast.</p></article>
        <article><span>03 // ROOMS</span><h2>Staff three rooms</h2><p>Choose one crew member for each room. The planner shows the exact output before you deploy.</p></article>
        <article><span>04 // FOURTH CREW</span><h2>Rest or lead</h2><p>The unassigned crew member rests and removes two strain. A leader provides a listed bonus but costs one extra provision.</p></article>
        <article><span>05 // COSTS</span><h2>Watch hull and strain</h2><p>Every mission costs one provision. At four strain, pressure suppresses that crew member’s extra room-output bonus. Six strain causes a scar and makes them unavailable for the next shift.</p></article>
        <article><span>06 // WORKSHOP</span><h2>Improve Orison</h2><p>After shifts two and four, spend alloy to build one room, upgrade one room, or repair two hull. You may also save the alloy.</p></article>
        <article><span>07 // CHRONICLE</span><h2>Keep the results</h2><p>Each ending unlocks one relic. The Chronicle stores your twelve most recent scores and can restart any recorded seed.</p></article>
        <article><span>08 // BLACK DESCENT</span><h2>Optional hard mode</h2><p>Start with 11 hull, 3 provisions, 4 alloy, and 1 lumen for a 1.25× score. Hidden high-risk faults deal twice their normal damage.</p></article>
      </div>
    </MenuPage>
  );
}

function ExpeditionMenu({ view, onNavigate, onTitle, onBack }: {
  view: GameView;
  onNavigate: (surface: Surface) => void;
  onTitle: () => void;
  onBack: () => void;
}) {
  const selectedRoute = view.routes.find((route) => route.instanceId === view.state.selectedRoute);
  const storyLog = view.state.log.filter((entry) => ['story', 'route', 'crew', 'warning'].includes(entry.kind)).slice(-12).reverse();
  const duty = (crewId: CrewId) => {
    if (view.state.routeLeader === crewId) return `Leading ${selectedRoute?.definition.title ?? 'the mission'}`;
    const module = view.modules.find((candidate) => candidate.assignedCrew === crewId);
    return module ? `Staffing ${module.name}` : 'Resting this shift';
  };
  return (
    <MenuPage eyebrow="ORISON // EXPEDITION LOG" title="Current descent" onBack={onBack}>
      <div className="pause-summary" data-testid="pause-summary">
        <span><small>SHIFT</small><b>{view.state.shift}/7</b></span><span><small>PHASE</small><b>{view.state.phase.toUpperCase()}</b></span><span><small>HEART NOTES</small><b>{view.state.heartNotes}/3</b></span><span><small>HULL</small><b>{view.state.integrity}/{view.maxIntegrity}</b></span>
      </div>
      <p className="pause-objective"><b>WHAT IS HAPPENING</b>{SHIFT_BRIEFINGS[view.state.shift]} <em>{view.objective}</em></p>
      <div className="pause-actions">
        <button className="primary-action" type="button" onClick={onBack}><span>Return to the exact point where Orison paused.</span><b>RESUME EXPEDITION</b></button>
        <button type="button" onClick={() => onNavigate('manual')}>FIELD MANUAL</button>
        <button type="button" onClick={() => onNavigate('settings')}>SETTINGS & BACKUP</button>
      </div>
      <h2>Crew arcs</h2>
      <div className="pause-crew" data-testid="pause-crew">
        {view.crew.map((crew) => <article key={crew.id} style={{ '--crew-color': crew.color } as React.CSSProperties}>
          <img src={`${BASE_PATH}/art/crew-${crew.id}.webp`} width="720" height="720" alt="" />
          <span><strong>{crew.name}</strong><small>{duty(crew.id)} · VOW {crew.vowProgress}/3 · TRUST {crew.loyalty} · STRAIN {crew.strain}/6</small><p>{crew.vow}</p></span>
        </article>)}
      </div>
      <h2>Story so far</h2>
      {storyLog.length > 0 ? <ol className="expedition-journal" data-testid="expedition-journal">{storyLog.map((entry) => <li key={entry.seq}><span>SHIFT {entry.shift} · {entry.kind.toUpperCase()}</span><p>{entry.text}</p></li>)}</ol> : <p className="empty-message">The first mission has not yet left a story record.</p>}
      <div className="pause-exit"><span>Your current descent is autosaved in this browser.</span><button type="button" onClick={onTitle}>RETURN TO TITLE</button></div>
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
    <MenuPage eyebrow="EXPEDITION SETUP" title="Choose starting equipment" onBack={onBack}>
      <div className="loadout-setup">
        <p className="loadout-intro">Choose a difficulty and up to one unlocked relic. The exact starting resources appear beside the options.</p>
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
              : 'Start with 12 hull, 4 provisions, 5 alloy, and 2 lumen. Hull repair costs 2 alloy.'}
          </p>
          <output className="loadout-preview" aria-label="Starting condition preview">{previewParts.join(' · ')}</output>
        </fieldset>
      </div>
      <div className="loadout-grid" role="radiogroup" aria-label="Starting relic">
        <label className={`relic-card none-card ${selected === null ? 'is-selected' : ''}`}>
          <input type="radio" name="relic" checked={selected === null} onChange={() => onSelect(null)} />
          <span>STANDARD LOADOUT</span><strong>No relic</strong><p>Use only the resources supplied by the selected difficulty.</p><small>No bonus and no penalty.</small>
        </label>
        {RELICS.map((relic) => {
          const unlockedRelic = unlocked.includes(relic.id);
          return (
            <label className={`relic-card ${selected === relic.id ? 'is-selected' : ''} ${unlockedRelic ? '' : 'is-locked'}`} key={relic.id}>
              <input type="radio" name="relic" value={relic.id} checked={selected === relic.id} disabled={!unlockedRelic} onChange={() => onSelect(relic.id)} />
              <span>{unlockedRelic ? 'RECOVERED' : 'LOCKED'}</span><strong>{unlockedRelic ? relic.name : 'Unknown heirloom'}</strong>
              <p>{unlockedRelic ? relic.description : 'Complete the expedition with another ending to unlock this relic.'}</p>
              <small>{unlockedRelic ? relic.startingEffect : 'Effect unavailable.'}</small>
            </label>
          );
        })}
      </div>
      <div className="loadout-footer"><span>SEED // {seed}</span><button className="primary-action" type="button" onClick={onBegin} data-testid="begin-descent"><span>{runMode === 'black_descent' ? 'Start with Black Descent resources and scoring.' : 'Start with the selected equipment.'}</span><b>{runMode === 'black_descent' ? 'START BLACK DESCENT' : 'START EXPEDITION'}</b></button></div>
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
          src={`${BASE_PATH}/art/orison-title.webp`}
          width="1536"
          height="1024"
          fetchPriority="high"
          alt="The six-legged living citadel Orison crossing a moon cavern lit by cyan mineral veins."
        />
        <div className="moon-veins" aria-hidden="true"><i /><i /><i /></div>
        <span aria-hidden="true">ORISON</span>
      </div>
      <section className="title-copy">
        <span className="kicker">A SEVEN-SHIFT MINING ROGUELITE</span>
        <h1>Lode<br /><em>Choir</em></h1>
        <p>Run seven missions inside a living moon. Staff Orison, manage damage and strain, and recover three Heart Notes.</p>
        {notice && <div className="notice" role="status">{notice}</div>}
        <div className="title-actions">
          {hasSave && <button className="primary-action" type="button" onClick={onContinue} data-testid="continue-run"><span>{savePreview ? `SHIFT ${savePreview.shift}/7 · ${savePreview.seed}${savePreview.runMode === 'black_descent' ? ' · BLACK DESCENT' : ''}${savePreview.relicName ? ` · ${savePreview.relicName}` : ''}` : 'Return to Orison'}</span><b>CONTINUE</b></button>}
          <button className={hasSave ? 'secondary-action' : 'primary-action'} type="button" onClick={onNew} data-testid="new-run">
            <span>{hasSave ? 'Replace the current autosave' : 'Choose difficulty and equipment'}</span><b>NEW EXPEDITION</b>
          </button>
        </div>
        <div className="seed-console">
          <span>EXPEDITION SEED</span>
          <input aria-label="Expedition seed" value={seed} maxLength={64} spellCheck={false} onChange={(event) => onSeed(event.target.value)} onBlur={(event) => onSeed(event.target.value.trim() || makeSeed())} />
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
      <span className="build-stamp">ORISON BUILD // 0.3</span>
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
  const [inspectedRoomSlot, setInspectedRoomSlot] = useState<number | null>(null);
  const [selectedRelic, setSelectedRelic] = useState<RelicId | null>(null);
  const [selectedRunMode, setSelectedRunMode] = useState<RunMode>('standard');
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [legacy, setLegacy] = useState<LegacyState>(() => createLegacyState());
  const [hasSave, setHasSave] = useState(false);
  const [savePreview, setSavePreview] = useState<SavePreview | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<EngineEvent[]>([]);
  const [shiftReport, setShiftReport] = useState<ShiftReport | null>(null);
  const [decisionReport, setDecisionReport] = useState<DecisionReport | null>(null);
  const [chartStatus, setChartStatus] = useState<string | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installStatus, setInstallStatus] = useState<InstallStatus>('browser');
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
    const loadedSettings = normalizeSettings(safeParse<unknown>(localStorage.getItem(SETTINGS_KEY), DEFAULT_SETTINGS));
    setSettings(loadedSettings);
    choirAudio.setEnabled(!loadedSettings.muted);
    const loadedLegacy = loadLegacy(localStorage.getItem(LEGACY_KEY));
    setLegacy(loadedLegacy);
    localStorage.setItem(LEGACY_KEY, serializeLegacy(loadedLegacy));
  }, []);

  useEffect(() => {
    choirAudio.setEnabled(!settings.muted);
    choirAudio.setVolume(settings.volume);
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

  const startRun = useCallback((runSeed = seed, relicId: RelicId | null = selectedRelic, runMode: RunMode = selectedRunMode, showPrologue = false) => {
    const state = createRun({ seed: runSeed, runMode, ...(relicId ? { relicId } : {}) });
    setSeed(runSeed);
    setView(selectGameView(state));
    setSelectedCrew(null);
    setSelectedBuildSlot(null);
    setInspectedRoomSlot(null);
    setFeedback([]);
    setShiftReport(null);
    setDecisionReport(null);
    setChartStatus(null);
    setNotice(null);
    recordedCompletion.current = null;
    setSurface(showPrologue ? 'prologue' : 'game');
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
      setShiftReport(null);
      setDecisionReport(null);
      setInspectedRoomSlot(null);
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
      let chosenDecision: DecisionReport | null = null;
      let orisonChange: DecisionReport | null = null;
      if (command.type === 'choose_event' && current.activeEvent) {
        const activeEvent = selectGameView(current).activeStoryEvent;
        const choice = activeEvent?.choices[command.choiceIndex];
        if (activeEvent && choice) {
          chosenDecision = {
            shift: current.shift,
            title: activeEvent.title,
            speaker: activeEvent.speaker,
            choice: choice.label,
            consequence: choice.consequence,
            ...(choice.aftermath ? { aftermath: choice.aftermath } : {}),
          };
        }
      }
      if (command.type === 'build_module') {
        const definition = MODULES.find((module) => module.id === command.moduleId);
        if (definition) orisonChange = {
          shift: current.shift,
          label: 'ORISON CHANGED',
          title: `${definition.name} online`,
          speaker: 'orison',
          choice: `Built in chamber ${command.slot + 1}.`,
          consequence: `${definition.buildCost} alloy became a permanent working room.`,
          aftermath: MODULE_CHANGE_TEXT[definition.id],
        };
      } else if (command.type === 'upgrade_module') {
        const module = current.modules.find((candidate) => candidate.slot === command.slot);
        const definition = module && MODULES.find((candidate) => candidate.id === module.id);
        if (module && definition) orisonChange = {
          shift: current.shift,
          label: 'ORISON CHANGED',
          title: `${definition.name} reaches level ${module.level + 1}`,
          speaker: 'orison',
          choice: `Upgraded chamber ${command.slot + 1}.`,
          consequence: 'Its base output increases on every later shift.',
          aftermath: MODULE_CHANGE_TEXT[definition.id],
        };
      } else if (command.type === 'repair_citadel') {
        const repair = Math.min(2, selectGameView(current).maxIntegrity - current.integrity);
        orisonChange = {
          shift: current.shift,
          label: 'ORISON CHANGED',
          title: 'Emergency plating complete',
          speaker: 'orison',
          choice: `Restored ${repair} hull.`,
          consequence: 'The workshop closed without building or upgrading a room.',
          aftermath: 'New plates cover the latest fractures. The repaired seams remain visible.',
        };
      }
      const result = applyCommand(current, command);
      setView(selectGameView(result.state));
      if (command.type === 'resolve_shift') {
        setDecisionReport(null);
        setShiftReport({
          shift: current.shift,
          events: result.events.filter((event) => event.kind !== 'story' && event.kind !== 'ending'),
          resources: { ...result.state.resources },
          integrity: result.state.integrity,
          heartNotes: result.state.heartNotes,
        });
      }
      if (chosenDecision) setDecisionReport(chosenDecision);
      if (orisonChange) setDecisionReport(orisonChange);
      const releasedBySelection = command.type === 'select_route' && current.reservedRoute === command.instanceId;
      const chartCommand = command.type === 'reserve_route' || command.type === 'clear_route_reservation' || releasedBySelection;
      if (command.type === 'reserve_route') setChartStatus(current.reservedRoute ? 'Chart updated.' : 'Route charted for the next forecast.');
      else if (command.type === 'clear_route_reservation' || releasedBySelection) setChartStatus('Chart released. One lumen restored.');
      else setChartStatus(null);
      setFeedback(chartCommand ? [] : result.events.filter((event) => event.kind !== 'ending').slice(-3));
      result.events.slice(-2).forEach((event) => choirAudio.play(event));
      if (command.type === 'select_route') choirAudio.playCue('select');
      if (command.type === 'assign_crew' || command.type === 'assign_route_leader' || command.type === 'unassign_crew') choirAudio.playCue('assign');
      if (command.type === 'assign_crew' || command.type === 'assign_route_leader' || command.type === 'unassign_crew') setSelectedCrew(null);
      if (command.type === 'build_module' || command.type === 'upgrade_module' || command.type === 'repair_citadel' || command.type === 'skip_development') setSelectedBuildSlot(null);
      setNotice(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Orison rejected that command.');
    }
  }, []);

  useEffect(() => {
    window.__LODE_CHOIR__ = { getState: () => stateRef.current, command: dispatch, newRun: startRun, refresh: () => stateRef.current && setView(selectGameView(stateRef.current)) };
    return () => { delete window.__LODE_CHOIR__; };
  }, [dispatch, startRun]);

  useEffect(() => {
    const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
    if (window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone) setInstallStatus('installed');
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
      setInstallStatus('ready');
    };
    const markInstalled = () => { setInstallPrompt(null); setInstallStatus('installed'); };
    window.addEventListener('beforeinstallprompt', capturePrompt);
    window.addEventListener('appinstalled', markInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', capturePrompt);
      window.removeEventListener('appinstalled', markInstalled);
    };
  }, []);

  const assignedCrew = useMemo(() => {
    const assigned = new Set(view?.modules.map((module) => module.assignedCrew).filter(Boolean) ?? []);
    if (view?.state.routeLeader) assigned.add(view.state.routeLeader);
    return assigned;
  }, [view]);
  useEffect(() => {
    if (view?.state.phase !== 'development') return;
    const emptySlots = Array.from({ length: 9 }, (_, slot) => slot).filter((slot) => !view.modules.some((module) => module.slot === slot));
    if (selectedBuildSlot === null || !emptySlots.includes(selectedBuildSlot)) setSelectedBuildSlot(emptySlots[0] ?? null);
  }, [selectedBuildSlot, view]);
  const openMenuPage = (next: Surface) => { setReturnSurface(surface); setSurface(next); resetDocumentScroll(); };
  const goBack = () => setSurface(returnSurface === 'game' && !view ? 'title' : returnSurface);
  const prepareLoadout = (runSeed = seed, runMode: RunMode = 'standard') => {
    setSeed(runSeed);
    setSelectedRunMode(runMode);
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
    setInspectedRoomSlot(null);
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

  const installApp = async () => {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallStatus(choice.outcome === 'accepted' ? 'accepted' : 'browser');
    } catch {
      setInstallStatus('browser');
    }
    setInstallPrompt(null);
  };

  const shellClasses = ['app-root', settings.highContrast ? 'high-contrast' : '', settings.reducedMotion ? 'reduced-motion' : ''].filter(Boolean).join(' ');
  if (surface === 'title') return <div className={shellClasses}><TitleScreen seed={seed} hasSave={hasSave} savePreview={savePreview} notice={notice} onSeed={setSeed} onNew={() => prepareLoadout(seed, new URLSearchParams(window.location.search).get('mode') === 'black_descent' ? 'black_descent' : 'standard')} onContinue={continueRun} onNavigate={openMenuPage} /></div>;
  if (surface === 'loadout') return <div className={shellClasses}><LoadoutPage seed={seed} unlocked={legacy.relics} selected={selectedRelic} runMode={selectedRunMode} onSelect={setSelectedRelic} onMode={setSelectedRunMode} onBegin={() => startRun(seed, selectedRelic, selectedRunMode, true)} onBack={goBack} /></div>;
  if (surface === 'prologue' && view) return <div className={shellClasses}><ProloguePage view={view} onEnter={() => { setSurface('game'); resetDocumentScroll(); void choirAudio.wake(); }} onAbort={() => { setSurface('loadout'); resetDocumentScroll(); }} /></div>;
  if (surface === 'pause' && view) return <div className={shellClasses}><ExpeditionMenu view={view} onNavigate={openMenuPage} onTitle={() => { setSurface('title'); resetDocumentScroll(); }} onBack={() => { setSurface('game'); resetDocumentScroll(); }} /></div>;
  if (surface === 'manual') return <div className={shellClasses}><ManualPage onBack={goBack} /></div>;
  if (surface === 'chronicle') return <div className={shellClasses}><Chronicle legacy={legacy} onRetry={prepareArchivedRun} onBack={goBack} /></div>;
  if (surface === 'settings') return <div className={shellClasses}><SettingsPage settings={settings} installStatus={installStatus} onChange={setSettings} onInstall={installApp} onCreateBackup={createProgressBackup} onRestoreBackup={restoreProgressBackup} onBack={goBack} /></div>;
  if (surface === 'credits') return <div className={shellClasses}><MenuPage eyebrow="CREDITS" title="Lode Choir" onBack={goBack}><div className="credits-copy"><p>An original mining roguelite about a four-person crew and the living moon beneath their claim.</p><p>Game design, writing, interface, artwork, sound, and deterministic engine were created for <em>Lode Choir</em>.</p><ToneMark active /></div></MenuPage></div>;
  if (!view) return null;

  const onRoom = (slot: number) => {
    if (selectedCrew && view.state.phase === 'planning') { dispatch({ type: 'assign_crew', crewId: selectedCrew, slot }); return; }
    choirAudio.playCue('inspect');
    setInspectedRoomSlot(slot);
  };

  return (
    <div className={`${shellClasses} phase-${view.state.phase}`}>
      <header className="game-header">
        <button type="button" className="brand-button" onClick={() => openMenuPage('pause')} aria-label="Open expedition log and menu">
          <span className="brand-glyph">LC</span><span><b>LODE CHOIR</b><small>{view.state.seed}</small><em className={view.state.runMode === 'black_descent' ? 'run-mode-badge is-black' : 'run-mode-badge'}>{view.state.runMode === 'black_descent' ? 'BLACK DESCENT · 1.25×' : 'STANDARD DESCENT · 1×'}</em></span>
        </button>
        <ResourceRail view={view} />
        <div className="header-actions">
          <button type="button" onClick={() => openMenuPage('settings')} aria-label="Open settings">⚙</button>
          <button type="button" onClick={() => openMenuPage('pause')} aria-label="Open expedition log and menu">LOG / MENU</button>
        </div>
        <div className={view.state.runMode === 'black_descent' ? 'run-mode-mobile is-black' : 'run-mode-mobile'}>{view.state.runMode === 'black_descent' ? 'BLACK DESCENT · 1.25× SCORE' : 'STANDARD DESCENT · 1× SCORE'}</div>
      </header>
      {notice && <div className="game-notice" role="status">{notice}<button onClick={() => setNotice(null)} aria-label="Dismiss">×</button></div>}
      {feedback.length > 0 && <div className="feedback-stack" aria-live="polite">{feedback.map((event) => <span className={`feedback ${event.emphasis ?? ''}`} key={event.id}>{event.text}</span>)}</div>}
      {inspectedRoomSlot !== null && <RoomInspector view={view} slot={inspectedRoomSlot} onClose={() => setInspectedRoomSlot(null)} />}
      <main className="game-shell">
        <h1 className="sr-only">Lode Choir expedition</h1>
        <Citadel view={view} selectedCrew={selectedCrew} selectedBuildSlot={selectedBuildSlot} onRoom={onRoom} onEmpty={setSelectedBuildSlot} />
        <aside className="command-deck">
          {decisionReport && view.state.phase !== 'event' && view.state.phase !== 'complete' && <DecisionEcho view={view} report={decisionReport} />}
          {view.state.phase === 'planning' && <RoutePanel view={view} chartStatus={chartStatus} onSelect={(instanceId) => dispatch({ type: 'select_route', instanceId })} onReserve={(instanceId) => dispatch({ type: 'reserve_route', instanceId })} onClearReservation={() => dispatch({ type: 'clear_route_reservation' })} onAssign={(crewId, slot) => dispatch({ type: 'assign_crew', crewId, slot })} onUnassign={(crewId) => dispatch({ type: 'unassign_crew', crewId })} onLeader={(crewId) => dispatch({ type: 'assign_route_leader', crewId })} onUnassignLeader={(crewId) => dispatch({ type: 'unassign_crew', crewId })} onResolve={() => dispatch({ type: 'resolve_shift' })} />}
          {view.state.phase === 'event' && <EventPanel view={view} report={shiftReport} onChoose={(choiceIndex) => dispatch({ type: 'choose_event', choiceIndex })} />}
          {view.state.phase === 'development' && <DevelopmentPanel view={view} slot={selectedBuildSlot} onSlot={setSelectedBuildSlot} onBuild={(moduleId, slot) => dispatch({ type: 'build_module', moduleId, slot })} onUpgrade={(slot) => dispatch({ type: 'upgrade_module', slot })} onRepair={() => dispatch({ type: 'repair_citadel' })} onSkip={() => dispatch({ type: 'skip_development' })} />}
          {view.state.phase === 'finale' && <FinalePanel view={view} onChoose={(endingId) => dispatch({ type: 'choose_ending', endingId })} />}
          {view.state.phase === 'complete' && <CompletionPanel view={view} onNewRun={() => prepareLoadout(makeSeed())} onChronicle={() => openMenuPage('chronicle')} />}
        </aside>
        <section className="crew-roster" aria-labelledby="crew-title">
          <div className="roster-heading"><span className="kicker">CREW STATUS</span><h2 id="crew-title">Records and strain</h2></div>
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
