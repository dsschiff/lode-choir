# Architecture

Lode Choir separates deterministic rules from presentation.

## State transition contract

The engine is a pure command machine:

```text
seed + optional relic + run mode -> createRun -> GameState v5
GameState + Command -> applyCommand -> GameState + EngineEvent[]
creation options + Command[] -> replay -> identical GameState
```

Only the returned state is authoritative. Engine events describe feedback the UI may
animate or sonify; they are not saved as presentation state. Content tables define
characters, modules, routes, and story choices, while systems interpret those records.

## Boundaries

- The engine owns legality, resources, risk, progression, outcomes, and save migration.
- The app owns selection affordances, animation, audio, local storage, and settings.
- The app renders engine selectors; it does not recreate rules to preview outcomes.
- Local legacy progression is separate from the current run save.
- Portable backup v1 wraps the already serialized run and legacy envelopes plus the
  three boolean accessibility settings and bounded volume. Restore parses and validates every nested envelope before it
  replaces any local-storage key or live React state.
- `startingRelic` and `runMode` are explicit run state, while legacy v4 stores canonical
  relic/lore IDs and bounded deterministic run records with base score, multiplier, and
  final score. Records retain a score-formula version so migrated values remain visible
  but do not enter the current best-per-mode categories. Migration normalizes earlier display names,
  aliases, raw story flags, and pre-history legacy saves.
- Score calculation is a pure engine selector with explicit component, base, multiplier,
  and rounded-total fields. The completion UI and persistent history consume that same
  selector rather than rebuilding the formula.
- Black Descent modifies only engine-owned starting stores, maximum integrity, hidden
  high-risk fault damage, plating cost, and score multiplier. The UI reads its preview,
  repair price, maximum hull, and score category from engine state instead of recreating
  those rules.
- Route reservations escrow one lumen in run state. The engine rolls the normal next
  forecast before deterministically replacing one slot, preserving PRNG state and any
  charted Sable knowledge without reviving the free-reveal exploit.

## Determinism

All randomness uses the persisted PRNG state. Commands contain intent, not outcomes.
Dates may appear only in app-level save metadata and never affect rules or replay.
The optional `?seed=` URL parameter is app-level initialization only; it supplies the
same bounded seed string that `createRun` already consumes and does not alter PRNG rules.
The companion `mode=black_descent` query selects only the loadout contract; unknown mode
values fail closed to Standard. The same seed may also be pasted into the bounded title
input.

## Content growth

New content must have a real mechanical effect, an opportunity cost, and bounded
frequency. A new definition should enrich an existing command before creating a new
subsystem.

## Static export and offline shell

`finalize-export.mjs` runs after every production export. It inventories every emitted
HTML, React payload, hashed chunk, stylesheet, manifest, icon, and art file; hashes their
actual bytes into a cache version; and writes `out/sw.js` with that exact precache list.
The small deferred registrar derives its scope from the manifest. Navigation remains
network-first so a live host can advance to a fresh export, while the complete
fingerprinted shell is available as the offline fallback. Activation deletes only older
Lode Choir cache versions.
The Settings surface captures `beforeinstallprompt` when the host exposes it, confirms
the browser choice, observes `appinstalled`, and otherwise gives browser-menu guidance;
it never claims installation merely because the cache exists.
`audit-export.mjs` then rejects remote or missing shell references, incomplete service
worker coverage, a non-standalone manifest, or regressions beyond locked total,
JavaScript, image, CSS, initial-shell, and largest-file byte budgets.
