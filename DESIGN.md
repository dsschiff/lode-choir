# Lode Choir Design System

## Visual thesis

A reliquary cutaway of a living moon-citadel: black volcanic stone, bone parchment,
luminous cyan mineral veins, and worn brass. The interface should feel excavated and
ceremonial, never like a generic dashboard.

## Color tokens

- `--ink-950: #07090c` — outer void
- `--ink-900: #0d1216` — primary surface
- `--stone-800: #182027` — raised machinery
- `--bone-100: #eee6d2` — primary text
- `--bone-300: #b8ad96` — secondary text
- `--vein-400: #58e1dc` — sole brand accent and active state
- `--brass-400: #c89b55` — earned/progression state
- `--danger-400: #e56f66` — semantic danger only

## Typography

- Titles: Georgia, `Times New Roman`, serif.
- Instruments and controls: `Cascadia Mono`, `Segoe UI Mono`, monospace.
- Two families maximum. Do not use Inter, Roboto, or a default system-ui stack.

## Spacing and shape

- Scale: 4, 8, 12, 16, 24, 32px.
- Borders: 1px quiet lines; 2px active vein lines.
- Corners: 2-8px. Avoid pill-shaped containers except compact status chips.
- Cards are justified only for routes, modules, and events as physical game objects.

## Layout

- Phone: one-row resource rail, citadel as the dominant center, route/action sheet
  below, contextual event overlay. No permanently tall header.
- Desktop: citadel left; route, crew, and event context right.
- The title screen uses a full-bleed visual anchor with minimal copy.

## Interaction thesis

Use only three motion families: room activation, route resolution, and Heart-Lode or
collapse feedback. Every motion has a reduced-motion still-state equivalent.

## Accessibility

Minimum 44px touch targets, visible focus, semantic buttons, tap alternative to drag,
high-contrast theme, mute, reduced motion, and no color-only state communication.

