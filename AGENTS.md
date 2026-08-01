# Lode Choir Agent Instructions

This repository contains an original science-fantasy roguelite/base-builder.

## Source of truth

- Rules live only in `packages/engine`. The app consumes the public engine API.
- Game state is plain JSON and deterministic. Never call `Math.random()`, wall-clock
  time, DOM, audio, or rendering APIs from the engine.
- Content definitions are declarative data. UI presentation state never enters saves.
- `DESIGN.md` is the visual source of truth. `PARKING_LOT.md` holds reversible
  decisions that must not interrupt an autonomous build.

## Quality bar

- A complete run and clear win/loss paths beat disconnected feature breadth.
- Every mechanic must change a recurring decision. Prefer deepening existing verbs.
- Phone-first at 390x844; all drag interactions require a tap alternative.
- Preserve mute, reduced-motion, high-contrast, exact save/resume, and seed replay.

## Verification

Run focused tests while iterating. Before a final handoff run `npm run verify` and
the core Playwright path. Keep commits small and leave the branch green.

## Design workflow

For `/design`, UI implementation, or UI review, follow the canonical workflow at
`C:/projects/active/agentic-workflow/guides/shared-workflows/design-workflow.md`
and apply this repository's `DESIGN.md`.

