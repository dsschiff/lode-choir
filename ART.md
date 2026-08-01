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
