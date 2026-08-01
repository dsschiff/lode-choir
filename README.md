# Lode Choir

An original science-fantasy roguelite/base-builder about a named crew guiding the
living citadel Orison through a singing moon.

## Commands

```powershell
npm install
npm run dev
npm test
npm run test:sim
npm run typecheck
npm run build
npm run test:e2e
npm run verify
npm run screenshots --workspace @lode-choir/game
```

The engine is deterministic and renderer-independent. The web app is phone-first and
builds to an installable static export. Its generated service worker fingerprints and
precaches the complete export, so an installed or previously opened build remains
playable offline. Each shift combines a route choice, three chamber
assignments, and an optional expedition leader, followed by story consequences and
citadel development or emergency alloy plating. Distinct endings unlock canonical Chronicle relics that can be
carried—one at a time—into later seeded expeditions. One lumen can also chart a declined
route so it returns in the following shift, adding cross-shift planning without rerolls.
Completed runs leave deterministic echo scores and a bounded twelve-run history in the
Chronicle, alongside unlocked endings, relics, and lore. An optional Black Descent
contract composes with every relic: it starts Orison light, makes unread high-risk
faults and emergency plating more punishing, archives the mode separately, and awards
a transparent 1.25× score.
The Settings menu can create and validate a portable text backup containing the active
autosave, Chronicle progression, and accessibility/audio settings before restoring any
local data.
Append `?seed=SHARED-SIGNAL` to the local game URL to prepare the same deterministic
expedition for another player or later playtest.
Every Chronicle record can also reopen its exact seed and mode at loadout, carrying its
relic when that heirloom remains recovered.

See `docs/VALIDATION.md` for the current balance, browser, accessibility, visual,
and dependency-audit evidence.

Current review captures: [desktop title](docs/screenshots/title-desktop.jpg),
[phone title](docs/screenshots/title-phone.jpg),
[desktop planning](docs/screenshots/planning-desktop.jpg), and
[phone planning](docs/screenshots/planning-phone.jpg). The same folder also contains
reproducible Settings, Standard and Black Descent loadouts, event, development,
finale, completion, and Chronicle captures for both viewports.
