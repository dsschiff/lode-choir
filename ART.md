# Art Direction and Asset Log

Code-native CSS/SVG visuals are the baseline. Generated raster assets are added only
after the playable loop and design language are stable.

## Planned generation order

1. One landscape title image showing the Orison citadel crossing a luminous moon cave.
2. Four separate character portraits in one coherent painterly-reliquary style.

Every generated asset must be inspected for composition, costume continuity, unwanted
text, watermarks, and style drift. Final project assets belong under the game app's
`public/art/` directory, with their final prompts appended here.

## Locked title-art prompt

```text
Use case: stylized-concept
Asset type: landscape title-screen key art for a science-fantasy browser game
Primary request: The Orison, a compact living mining citadel carried on six ancient
stone-and-brass legs, crossing an immense black moon cavern while luminous cyan mineral
veins sing through the walls like frozen lightning. Four tiny warm-lit observation
windows imply a vulnerable named crew inside. The machine is part reliquary, part mining
rig: weathered, practical, sacred, and heavy rather than sleek.
Style/medium: painterly science-fantasy concept illustration with etched geological
detail, restrained graphic shapes, tactile stone and oxidized brass
Composition/framing: wide cinematic landscape; Orison low and left of center; the cavern
and a descending cyan vein create depth and leave dark negative space in the upper-right
for HTML title text
Lighting/mood: cyan subterranean glow against warm amber windows; lonely, dangerous,
reverent, with a trace of hope
Color palette: near-black basalt, bone-gray dust, luminous cyan, worn brass, sparse warm
amber; no rainbow palette
Constraints: no text, no logo, no watermark, no visible weapons, no humanoid foreground
figures, no glossy spaceship surfaces, no Earth skyline
```

Character portraits will be prompted separately from the accepted title asset so each
is a distinct deliverable, while repeating the final medium, palette, costume materials,
lighting, and portrait framing to maintain continuity.

## Accepted title asset

- Method: built-in image generation, then local Sharp resize/WebP optimization.
- Final asset: `apps/game/public/art/orison-title.webp` (1536x1024, 197 KB).
- Review: accepted. The Orison reads as a sacred heavy mining machine; the crew windows,
  cyan geology, restrained palette, and upper-right title space match the prompt. No
  generated text, watermark, weapons, foreground figure, or glossy spacecraft styling.

## Accepted crew portraits

- Method: four separate built-in image generations using the accepted title art as the
  shared style reference, followed by local Sharp resize/WebP optimization to 720px.
- Final assets: `crew-mara.webp` (59 KB), `crew-tamsin.webp` (81 KB),
  `crew-orin.webp` (88 KB), and `crew-sable.webp` (63 KB) under
  `apps/game/public/art/`.
- Shared prompt frame: square, chest-up, painterly science-fantasy portraits with etched
  geological texture; near-black basalt, bone-gray cloth, luminous cyan, worn brass,
  and sparse amber light; no text, logos, watermarks, weapons, glossy armor, or generic
  spacesuits.
- Mara Vey: Black woman in her early fifties, close-cropped silver hair, fine chin scar,
  weathered oathkeeper coat, and a battered ledger; composed, severe, and protective.
- Tamsin Rook: stocky South Asian woman in her late thirties, cropped dust-streaked hair,
  scarred hands, rugged delver harness, red hazard cord, and a defiant crooked grin.
- Orin Vale: East Asian man in his mid-thirties, loosely tied hair, careful hands,
  weathered engineer-chorister coat, and cyan resonance forks; meticulous and anxious.
- Sable-9: androgynous synthetic person with worn porcelain and obsidian face plates,
  repaired seams, a cyan memory filament, textile mantle, and a faceted memory shard.
- Review: accepted as a coherent set. Each identity, silhouette, prop, and emotional
  register remains legible at card size; no unwanted text, watermarks, weapons, or style
  drift were found. The optimized files were visually inspected after conversion.
