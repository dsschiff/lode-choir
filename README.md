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
builds to a static export. Each shift combines a route choice, three chamber
assignments, and an optional expedition leader, followed by story consequences and
citadel development. Distinct endings unlock canonical Chronicle relics that can be
carried—one at a time—into later seeded expeditions.

See `docs/VALIDATION.md` for the current balance, browser, accessibility, visual,
and dependency-audit evidence.

Current review captures: [desktop title](docs/screenshots/title-desktop.jpg),
[phone title](docs/screenshots/title-phone.jpg),
[desktop planning](docs/screenshots/planning-desktop.jpg), and
[phone planning](docs/screenshots/planning-phone.jpg).
