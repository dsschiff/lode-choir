# Validation Record

Validated against the local `main` branch on 2026-07-31 with Node 24.14 and npm
11.9 on Windows.

## Rules and balance

- 30 deterministic engine, content, and simulation tests pass, including immutability, legal-command
  enforcement, save migration, exact replay, scars, loyalty, all endings, development
  deferral, mode-aware emergency repair, Black Descent composition and scoring, route
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

The 24,000-run matched mode matrix validates the optional Black Descent contract. It
starts at 11 hull, three provisions, four alloy, and one lumen; unread complications on
risk-three-or-higher routes add two hazard rather than one; emergency plating costs
three alloy; and completed scores receive an explicit 1.25 multiplier. Aggregate wins
fell from 4,697/12,000 (39.1%) in Standard to 3,851/12,000 (32.1%), a 7.1-point drop
inside the locked 3–15 point target.

| Policy | Standard wins / 4,000 | Black Descent wins / 4,000 | Difference |
| --- | ---: | ---: | ---: |
| Conservative | 3,441 | 3,435 | −0.2 points |
| Balanced | 1,205 | 397 | −20.2 points |
| Aggressive | 51 | 19 | −0.8 points |

The mode deliberately concentrates pressure on balanced/risk-taking play while leaving
the conservative policy viable rather than guaranteeing failure. Within Black Descent,
balanced no-chart wins were 33, 33, 33, and 39/500 across none/Heart/Fork/Latch; charted
wins were 64, 56, 55, and 84. All chart-aware balanced relic cells remain above the
locked 10% viability floor, relic spread stays below six points, and chart impact stays
below nine points. Balanced chart cells used plating 346–374 times per 500 runs. Every
aggressive relic/chart family still found at least one win. Carried routes were later
chosen in 26.3%, 17.2%, and 15.2% of hard-mode reservations under conservative,
balanced, and aggressive policies respectively.

The score boundary was also hardened before enabling the multiplier: the completion
award is 2,000 points, making the weakest possible completed win (2,500) outrank the
maximal synthetic Black Descent loss (2,375). Run records persist base score,
multiplier, and final score rather than hiding the category adjustment.
Pre-v2 score records migrate as visibly marked archived-formula history and are excluded
from the current best-per-mode summaries because their missing crew components cannot be
recomputed honestly.

## Interface and persistence

- 26 Playwright checks pass in Pixel 5 and desktop Chromium projects. They cover title
  navigation, settings, first choice, touch assignment, optional leadership, resolution,
  loadout locking and keyboard selection, all three relic effects, relic resume,
  exact route-cost forecasts, chart hold/swap/refund/reload/return behavior,
  autosave previews/resume, unaffordable story-choice gating, corrupt-save recovery,
  scored Chronicle history, Black Descent keyboard selection, exact preview,
  save/resume, completion, archive categorization and fresh-run reset, later phase
  surfaces, validated backup rejection/restore across run, Chronicle, and settings,
  shared-seed URL initialization, and test hooks.
- Axe scans report no detectable violations on the title, manual, loadout, planning,
  expanded charting, or resource-gated event surfaces in either browser project.
- Production static export passes. The bounded E2E runner builds, serves, tests, closes
  its exact child server, and returns in under 35 seconds on this host.
- Visual inspection at 1440x960 and 390x844 confirmed title composition, Standard and
  Black Descent loadouts, portrait crops,
  touch targets, sticky resource rail, citadel grid, engine-derived route forecasts,
  leader preview, mobile action-before-roster order, and long scrolling with no
  horizontal overflow.
- The 20-image review suite uses the fixed `QA-ORISON` URL seed and reduced-motion
  media. Two consecutive full captures produced identical SHA-256 hashes for every
  JPEG, so visual evidence no longer drifts with random title seeds or animation frames.

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
