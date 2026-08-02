# Validation Record

Validated against the local `main` branch on 2026-08-01 with Node 24.14 and npm
11.9 on Windows.

## Rules and balance

- 42 deterministic engine, content, simulation, and evidence-integrity tests pass, including immutability, legal-command
  enforcement, save migration, exact replay, scars, loyalty, all endings, development
  deferral, sixteen route-specific crew objections, mode-aware emergency repair, Black Descent composition and scoring, route
  leadership, and short-handed runs.
- The simulation regression covers 500 seeds under conservative, balanced, and
  aggressive policies, both with adaptive leadership and with every fourth crew member
  resting, plus all four relic loadouts under every policy and matched chart/no-chart
  policies, plus a matched Standard/Black Descent matrix over policy, relic, and
  charting combinations: 36,000 full runs per test pass. Every run terminates, stays within resource
  bounds, and replays to an exactly
  equal state.
- A separate 500-seed matched audit (1,000 full runs per policy) produced the following
  win counts. Adaptive leadership is deliberately used only with at least four
  provisions and leader strain at most two.

| Policy | Adaptive leader | Always rest | Difference |
| --- | ---: | ---: | ---: |
| Conservative | 433 | 433 | 0.0 points |
| Balanced | 122 | 113 | +1.8 points |
| Aggressive | 31 | 34 | -0.6 points |

All four characters lead across every audited policy. The observed effect remains below
the locked ten-point limit, so leadership is useful but not a compulsory upgrade.

The 500-seed relic audit stayed inside its separate balance gates. Win counts were:

| Policy | None | Heart Splinter | Vesper Tuning Fork | Oathkeeper's Latch |
| --- | ---: | ---: | ---: | ---: |
| Conservative | 423 | 423 | 457 | 423 |
| Balanced | 100 | 108 | 100 | 127 |
| Aggressive | 25 | 30 | 25 | 31 |

No relic improved a policy by more than 5.4 percentage points over carrying nothing,
and the largest within-policy relic spread was 5.4 points. The one-integrity
Oathkeeper's Latch remains the strongest balanced survival option without dominating;
the Tuning Fork most helps conservative Note timing; the Heart Splinter's extra alloy
is offset by Tamsin's starting strain.

Balanced policies used emergency plating on most ordinary/Heart/Fork runs while it
remained optional for conservative and aggressive policies.

The matched Charted Routes audit produced:

| Policy | No chart | Chart-aware | Difference | Carried later chosen |
| --- | ---: | ---: | ---: | ---: |
| Conservative | 418 | 443 | +5.0 points | 27.1% |
| Balanced | 117 | 160 | +8.6 points | 20.2% |
| Aggressive | 24 | 43 | +3.8 points | 20.3% |

Each chart-aware policy stayed below the locked fifteen-point impact ceiling, used
reservations repeatedly, and still declined most returning routes. Baseline RNG states
remain identical because the normal three offers are rolled before deterministic
replacement.

The 24,000-run matched mode matrix validates the optional Black Descent contract. It
starts at 11 hull, three provisions, four alloy, and one lumen; unread complications on
risk-three-or-higher routes add two hazard rather than one; emergency plating costs
three alloy; and completed scores receive an explicit 1.25 multiplier. Aggregate wins
fell from 5,011/12,000 (41.8%) in Standard to 4,021/12,000 (33.5%), an 8.3-point drop
inside the locked 3–15 point target.

| Policy | Standard wins / 4,000 | Black Descent wins / 4,000 | Difference |
| --- | ---: | ---: | ---: |
| Conservative | 3,451 | 3,455 | +0.1 points |
| Balanced | 1,243 | 434 | −20.2 points |
| Aggressive | 317 | 132 | −4.6 points |

The mode deliberately concentrates pressure on balanced/risk-taking play while leaving
the conservative policy viable rather than guaranteeing failure. Within Black Descent,
balanced no-chart wins were 38, 36, 38, and 46/500 across none/Heart/Fork/Latch; charted
wins were 67, 68, 59, and 82. All chart-aware balanced relic cells remain above the
locked 10% viability floor, relic spread stays below six points, and chart impact stays
below nine points. Balanced chart cells used plating 346–374 times per 500 runs. Every
aggressive relic/chart family still found at least one win. Carried routes were later
chosen in 26.0%, 17.9%, and 16.5% of hard-mode reservations under conservative,
balanced, and aggressive policies respectively.

The score boundary was also hardened before enabling the multiplier: the completion
award is 2,000 points, making the weakest possible completed win (2,500) outrank the
maximal synthetic Black Descent loss (2,375). Run records persist base score,
multiplier, and final score rather than hiding the category adjustment.
Pre-v2 score records migrate as visibly marked archived-formula history and are excluded
from the current best-per-mode summaries because their missing crew components cannot be
recomputed honestly.
- The engine exposes the seven score components as a tested ledger; the UI shows the
  base and mode multiplier and copies a deterministic seed-linked expedition report.
- Heart Note recovery now emits and persists one of three numbered signal phrases;
  an engine regression verifies the first route-sourced decode and the in-run menu
  presents all three positions without revealing unrecovered text.
- Content validation now proves all sixteen routes can surface a keyed story event and
  all twelve Chronicle lore fragments have reachable unlock tags.

### Deep deterministic soak

The repeatable `npm run audit:deep -- --seeds=10000` audit completed 480,000 full runs:
10,000 seeds across two modes, three policies, charting on/off, and four relic states.
Every command trace was independently replayed to an exactly equal terminal state.
No run violated phase, shift, hull, Heart Note, non-negative integer resource, or crew
strain bounds; score components, multiplier, and total agreed in every terminal state.

Standard won 101,650/240,000 runs (42.35%) and Black Descent won 81,271/240,000
(33.86%), an 8.49-point overall difficulty gap. Policy-level results were:

| Policy | Standard wins / 80,000 | Black wins / 80,000 |
| --- | ---: | ---: |
| Conservative | 70,357 (87.95%) | 70,271 (87.84%) |
| Balanced | 24,640 (30.80%) | 8,589 (10.74%) |
| Aggressive | 6,653 (8.32%) | 2,411 (3.01%) |

The weakest observed win scored 2,665; the strongest observed loss scored 1,863.
The complete 48-cell machine-readable record, including repairs, reservations,
carried selections, mean score, and mean command length, is in `docs/deep-audit.json`.
A regression test validates its schema, run/replay totals, per-cell completeness, mode
aggregates, score boundary, rates, and physical ranges before the evidence can pass CI.

A disjoint no-write confirmation over 4,500 `confirmation-*` seeds then completed
216,000 additional runs and exact replays without replacing the canonical artifact.
Standard won 45,769/108,000; Black Descent won 36,722/108,000; its weakest win was
2,665 and strongest loss 1,863. Across the two deep passes, 696,000 full expeditions
and 696,000 reconstructed replays passed.

## Interface and persistence

- 50 Playwright checks pass in Pixel 5 and desktop Chromium projects. They cover title
  navigation, direct seed entry, settings migration, installation prompt handling and persistent volume, first choice, touch assignment, optional leadership, resolution,
  loadout locking and keyboard selection, all three relic effects, relic resume,
  exact route-cost forecasts, four-strain room-pressure penalties, chart hold/swap/refund/reload/return behavior,
  autosave previews/resume, unaffordable story-choice gating, corrupt-save recovery,
  scored Chronicle history with four persistent crew-arc records, Black Descent keyboard selection, exact preview,
  save/resume, completion, archive categorization and fresh-run reset, later phase
  surfaces, validated backup rejection/restore across run, Chronicle, and settings,
  exact event-effect labels, score-ledger disclosure, copied seed-and-mode reports,
  shared URL initialization with invalid-mode fallback, a mobile-accessible in-run
  journal/menu with crew, mission-discovery, and persistent choice-aftermath recap,
  on-duty personal-vow gating,
  live tactical-read updates with engine-derived post-repair hull ranges, structured
  four-crew ending codas, Chronicle progression counts,
  Chronicle rematch preparation, a complete seven-shift visible-control win, and test hooks.
  A stubbed Web Audio contract additionally verifies the ambient voices start with an
  active run, stop in menus, remain stopped while muted, resume after unmuting, and stop
  again at terminal completion in both viewport projects.
- The production finalizer generated a content-addressed service worker with 35
  precached export files. Browser checks validate the standalone portrait manifest,
  registrar, generated chunk/art coverage, active service-worker control, then force
  the context offline and reload the full title, fixed seed, CSS, JavaScript, and title
  art successfully in both viewport projects.
- Axe scans report no detectable violations on the title, manual, loadout, planning,
  expanded charting, room inspector, or resource-gated event surfaces in either browser project.
- Production static export passes. The bounded E2E runner builds, serves, tests, closes
  its exact child server, and returns in under 35 seconds on this host.
- Visual inspection at 1440x960 and 390x844 confirmed title composition, Standard and
  Black Descent loadouts, portrait crops,
  touch targets, sticky resource rail, citadel grid, engine-derived route forecasts,
  leader preview, mobile action-before-roster order, and long scrolling with no
  horizontal overflow.
- The 22-image review suite uses the fixed `QA-ORISON` URL seed and reduced-motion
  media. Two consecutive full captures produced identical SHA-256 hashes for every
  JPEG, so visual evidence no longer drifts with random title seeds or animation frames.

## Asset and dependency checks

- The production export currently contains 36 files and 1,381,757 uncompressed bytes.
  The directly referenced initial shell is 1,043,576 bytes; JavaScript totals 778,918
  bytes, imagery 489,093 bytes, and CSS 61,998 bytes. The largest individual file is a
  227,538-byte framework chunk. All remain below committed build-breaking budgets.
- The export audit found no remote runtime asset references, no missing shell files,
  and no emitted file omitted from the generated service-worker cache.
- The title art and all four 720px crew portraits were inspected after WebP conversion.
  Their combined transfer size is about 489 KB.
- The app uses generated WebP imagery, CSS/SVG structure, and procedural Web Audio for
  a two-voice low-frequency moon-drone plus event-kind tones. The drone is gesture-gated,
  pauses outside an active run, stops at completion, and shares the persisted mute and
  volume lifecycle; it
  has no runtime asset host or analytics dependency.
- The latest stable Next release still declares advisory-affected PostCSS and Sharp
  versions. Root overrides resolve PostCSS 8.5.25 and Sharp 0.35.3 instead; a fresh
  `npm ci`, production export, typecheck, and engine suite pass with that tree, and
  `npm audit --audit-level=high` reports zero vulnerabilities. Playwright Core is also
  pinned to 1.61.1 so Axe and Playwright Test share one reproducible type surface.
