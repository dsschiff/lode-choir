# Validation Record

Validated against the local `main` branch on 2026-07-31 with Node 24.14 and npm
11.9 on Windows.

## Rules and balance

- 23 deterministic engine and content tests pass, including immutability, legal-command
  enforcement, save migration, exact replay, scars, loyalty, all endings, development
  deferral, route leadership, and short-handed runs.
- The simulation regression covers 500 seeds under conservative, balanced, and
  aggressive policies, both with adaptive leadership and with every fourth crew member
  resting: 3,000 full runs per test pass. Every run terminates, stays within resource
  bounds, and replays to an exactly equal state.
- A separate 1,000-seed audit produced the following win counts. Adaptive leadership is
  deliberately used only with at least four provisions and leader strain at most two.

| Policy | Adaptive leader | Always rest | Difference |
| --- | ---: | ---: | ---: |
| Conservative | 865 | 865 | 0.0 points |
| Balanced | 141 | 110 | +3.1 points |
| Aggressive | 7 | 13 | -0.6 points |

All four characters lead across every audited policy. The observed effect remains below
the locked ten-point limit, so leadership is useful but not a compulsory upgrade.

## Interface and persistence

- 12 Playwright checks pass in Pixel 5 and desktop Chromium projects. They cover title
  navigation, settings, first choice, touch assignment, optional leadership, resolution,
  autosave/resume, corrupt-save recovery, later phase surfaces, and test hooks.
- Axe scans report no detectable violations on the title and planning screens in either
  browser project.
- Production static export passes. The bounded E2E runner builds, serves, tests, closes
  its exact child server, and returns in roughly 19 seconds on this host.
- Visual inspection at 1440x960 and 390x844 confirmed title composition, portrait crops,
  touch targets, resource rail, citadel grid, route hierarchy, leader preview, and long
  mobile scrolling with no horizontal overflow.

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
