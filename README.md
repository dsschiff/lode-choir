# Lode Choir

An original science-fantasy roguelite/base-builder about a named crew guiding the
living citadel Orison through a singing moon.

**Play online:** https://dsschiff.github.io/lode-choir/

**Current release:** Orison build 0.4

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
npm run audit:deep -- --seeds=10000
npm run audit:deep -- --seeds=1000 --prefix=confirmation --no-write
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
Chronicle, including each crewmember's final vow, trust, signature, and scar state,
alongside unlocked endings, relics, and lore. An optional Black Descent
contract composes with every relic: it starts Orison light, makes unread high-risk
faults and emergency plating more punishing, archives the mode separately, and awards
a transparent 1.25× score. The completion ledger exposes every score component and can
copy a seed-linked expedition report for playtest comparison.
Personal missions now require their named crewmember to staff a chamber or lead the
expedition: resting prevents strain but forfeits that vow step. The planner updates its
actual surviving-hull range, vow, and post-room ration forecast as assignments change,
including room repair and hidden-fault uncertainty. Victories close with a
structured four-character coda whose text responds to each crew arc instead of one
undifferentiated epilogue paragraph.
Each of the sixteen missions also presents one authored objection from a second crew
member, making the personal stake and the operational reason to refuse it visible together.
At four strain, pressure suppresses a crewmember's extra room-output bonus, so a rested
generalist can outperform the nominal specialist before the six-strain incapacitation
threshold. Every affected room preview calls out the penalty before deployment.
After the first player gesture, a lightweight Web Audio moon-drone underlays the run
and yields to procedural room, route, story, damage, and ending tones; it pauses in
menus, stops at completion, and obeys persistent mute and 0–100% volume settings without
audio files.
The Settings menu exposes browser installation guidance or an available native install
prompt, and can create and validate a portable text backup containing the active
autosave, Chronicle progression, and accessibility/audio settings before restoring any
local data.
The in-run Log / Menu is available on phone and desktop, pauses the procedural choir,
recaps the current objective, crew duties and vows, and the latest twelve story records,
then returns to the exact selected mission and staffing plan. Mission discoveries and
the full authored aftermath of each event choice are written into that save-backed
journal, so the expedition's story survives after its decision panel closes.
Each of the three Heart Notes now decodes a fixed line of the buried signal. The
in-run menu keeps recovered lines visible beside locked positions for the Notes still
missing, turning the victory requirement into an unfolding message rather than a key count.
Paste a seed directly on the title screen, or append
`?seed=SHARED-SIGNAL&mode=black_descent` to prepare the same deterministic expedition
and contract for another player or later playtest.
Every Chronicle record can also reopen its exact seed and mode at loadout, carrying its
relic when that heirloom remains recovered. Twelve unlockable lore fragments preserve
the moon and crew discoveries surfaced by route-tagged events.

See `docs/VALIDATION.md` for the current balance, browser, accessibility, visual,
and dependency-audit evidence.
`npm run verify` also enforces static-export budgets and full offline-cache coverage;
the current uncompressed initial shell is under 1.1 MB, its gzip estimate is capped at
475 KB, JavaScript gzip at 300 KB, and CSS at 64 KB.
`docs/deep-audit.json` records the latest 10,000-seed, 480,000-run/replay balance soak.

Current review captures: [desktop title](docs/screenshots/title-desktop.jpg),
[phone title](docs/screenshots/title-phone.jpg),
[desktop planning](docs/screenshots/planning-desktop.jpg), and
[phone planning](docs/screenshots/planning-phone.jpg), and
[phone expedition log](docs/screenshots/journal-phone.jpg). The same folder also contains
reproducible Settings, Standard and Black Descent loadouts, prologue, event,
development, loss, finale, completion, and Chronicle captures for both viewports.
