# Validation Record

Validated against the local `main` branch on 2026-07-31 with Node 24.14 and npm
11.9 on Windows.

## Rules and balance

- 27 deterministic engine and content tests pass, including immutability, legal-command
  enforcement, save migration, exact replay, scars, loyalty, all endings, development
  deferral, emergency repair, route leadership, and short-handed runs.
- The simulation regression covers 500 seeds under conservative, balanced, and
  aggressive policies, both with adaptive leadership and with every fourth crew member
  resting, plus all four relic loadouts under every policy and matched chart/no-chart
  policies: 12,000 full runs per test pass. Every run terminates, stays within resource
  bounds, and replays to an exactly
  equal state.
- A separate 500-seed matched audit (1,000 full runs per policy) produced the following
  win counts. Adaptive leadership is deliberately used only with at least four
  provisions and leader strain at most two.

| Policy | Adaptive leader | Always rest | Difference |
| --- | ---: | ---: | ---: |
| Conservative | 433 | 433 | 0.0 points |
| Balanced | 117 | 110 | +1.4 points |
| Aggressive | 4 | 10 | -1.2 points |

All four characters lead across every audited policy. The observed effect remains below
the locked ten-point limit, so leadership is useful but not a compulsory upgrade.

The 500-seed relic audit stayed inside its separate balance gates. Win counts were:

| Policy | None | Heart Splinter | Vesper Tuning Fork | Oathkeeper's Latch |
| --- | ---: | ---: | ---: | ---: |
| Conservative | 423 | 423 | 457 | 423 |
| Balanced | 99 | 93 | 99 | 123 |
| Aggressive | 7 | 10 | 7 | 8 |

No relic improved a policy by more than 6.8 percentage points over carrying nothing,
and the largest within-policy relic spread was 6.8 points. The one-integrity
Oathkeeper's Latch remains the strongest balanced survival option without dominating;
the Tuning Fork most helps conservative Note timing; the Heart Splinter's extra alloy
is offset by Tamsin's starting strain.

Balanced policies used emergency plating on 95.8–96.2% of ordinary/Heart/Fork runs.
That new two-alloy sink raised no-relic balanced wins from 63 to 99 of 500 matched
seeds while remaining optional for conservative and aggressive policies.

The matched Charted Routes audit produced:

| Policy | No chart | Chart-aware | Difference | Carried later chosen |
| --- | ---: | ---: | ---: | ---: |
| Conservative | 418 | 436 | +3.6 points | 26.7% |
| Balanced | 110 | 170 | +12.0 points | 20.4% |
| Aggressive | 2 | 12 | +2.0 points | 19.4% |

Each chart-aware policy stayed below the locked fifteen-point impact ceiling, used
reservations repeatedly, and still declined most returning routes. Baseline RNG states
remain identical because the normal three offers are rolled before deterministic
replacement.

## Interface and persistence

- 20 Playwright checks pass in Pixel 5 and desktop Chromium projects. They cover title
  navigation, settings, first choice, touch assignment, optional leadership, resolution,
  loadout locking and keyboard selection, all three relic effects, relic resume,
  exact route-cost forecasts, chart hold/swap/refund/reload/return behavior,
  autosave previews/resume, unaffordable story-choice gating, corrupt-save recovery,
  later phase surfaces, and test hooks.
- Axe scans report no detectable violations on the title, manual, loadout, planning,
  expanded charting, or resource-gated event surfaces in either browser project.
- Production static export passes. The bounded E2E runner builds, serves, tests, closes
  its exact child server, and returns in under 35 seconds on this host.
- Visual inspection at 1440x960 and 390x844 confirmed title composition, portrait crops,
  touch targets, sticky resource rail, citadel grid, engine-derived route forecasts,
  leader preview, mobile action-before-roster order, and long scrolling with no
  horizontal overflow.

## Asset and dependency checks

- The title art and all four 720px crew portraits were inspected after WebP conversion.
  Their combined transfer size is about 489 KB.
- The app uses generated WebP imagery, CSS/SVG structure, and procedural Web Audio; it
  has no runtime asset host or analytics dependency.
- `npm audit` currently reports three high transitive advisories in the latest stable
  Next release's pinned PostCSS and Sharp packages. The affected packages process only
  trusted local source assets during this static build, not player-supplied CSS, source
  maps, or images. npm's offered automatic fix is a breaking downgrade to Next 9 and was
  intentionally rejected. Recheck when the next stable Next release updates those pins.
