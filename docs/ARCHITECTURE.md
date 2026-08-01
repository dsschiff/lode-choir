# Architecture

Lode Choir separates deterministic rules from presentation.

## State transition contract

The engine is a pure command machine:

```text
seed -> createRun -> GameState
GameState + Command -> applyCommand -> GameState + EngineEvent[]
seed + Command[] -> replay -> identical GameState
```

Only the returned state is authoritative. Engine events describe feedback the UI may
animate or sonify; they are not saved as presentation state. Content tables define
characters, modules, routes, and story choices, while systems interpret those records.

## Boundaries

- The engine owns legality, resources, risk, progression, outcomes, and save migration.
- The app owns selection affordances, animation, audio, local storage, and settings.
- The app renders engine selectors; it does not recreate rules to preview outcomes.
- Local legacy progression is separate from the current run save.

## Determinism

All randomness uses the persisted PRNG state. Commands contain intent, not outcomes.
Dates may appear only in app-level save metadata and never affect rules or replay.

## Content growth

New content must have a real mechanical effect, an opportunity cost, and bounded
frequency. A new definition should enrich an existing command before creating a new
subsystem.

