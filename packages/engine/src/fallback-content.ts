import type {
  CrewDefinition,
  ModuleDefinition,
  RouteDefinition,
  StoryEventDefinition,
} from './types.ts';

export const FALLBACK_CREW: readonly CrewDefinition[] = [
  { id: 'mara', name: 'Mara Vey', role: 'Captain', epithet: 'The Last Bulwark', talent: 'Shields the crew from the worst hazards.', drawback: 'Carries every failure personally.', vow: 'Bring everyone home.', signature: 'Hold Fast', color: '#dca86b' },
  { id: 'tamsin', name: 'Tamsin Rook', role: 'Delver', epithet: 'The Bright Pick', talent: 'Draws extra alloy from dangerous routes.', drawback: 'Takes one extra strain in severe hazards.', vow: 'Touch the deepest vein.', signature: 'Redline', color: '#ef715f' },
  { id: 'orin', name: 'Orin Vale', role: 'Engineer-Chorister', epithet: 'The Tuning Hand', talent: 'Repairs the citadel while serving the Ward.', drawback: 'Produces less on the Deep Drill.', vow: 'Teach the citadel a new chord.', signature: 'Perfect Interval', color: '#70cbb9' },
  { id: 'sable', name: 'Sable-9', role: 'Synthetic Seer', epithet: 'The Unfinished Oracle', talent: 'Reveals route complications while assigned.', drawback: 'Cannot recover strain in the Heart Engine.', vow: 'Remember a future that never happened.', signature: 'Counterfactual', color: '#8ebcf4' },
];

export const FALLBACK_MODULES: readonly ModuleDefinition[] = [
  { id: 'heart_engine', name: 'Heart Engine', description: 'Coaxes lumen from the moon-song.', assignmentHint: 'Generates lumen and steadies its operator.', buildCost: 0 },
  { id: 'deep_drill', name: 'Deep Drill', description: 'Turns pressure into alloy.', assignmentHint: 'High output, but taxing.', buildCost: 0 },
  { id: 'ward_array', name: 'Ward Array', description: 'Deflects collapse and repairs damage.', assignmentHint: 'Reduces route damage.', buildCost: 0 },
  { id: 'foundry', name: 'Foundry', description: 'Refines scavenged metal.', assignmentHint: 'Generates alloy; stronger beside the Drill.', buildCost: 4 },
  { id: 'infirmary', name: 'Infirmary', description: 'A quiet room for impossible medicine.', assignmentHint: 'Relieves strain from the whole crew.', buildCost: 4 },
  { id: 'resonance_chamber', name: 'Resonance Chamber', description: 'Harmonizes fragments of the Heart-Lode.', assignmentHint: 'Generates lumen and Heart progress.', buildCost: 5 },
];

export const FALLBACK_ROUTES: readonly RouteDefinition[] = [
  { id: 'glass-vein', title: 'The Glass Vein', kind: 'vein', description: 'A bright seam rings under the drill.', rewardText: 'Rich alloy and a harmonic trace.', hazardText: 'Needle-shards punish haste.', baseRewards: { alloy: 3 }, hazard: 2, noteProgress: 1, storyTag: 'vein' },
  { id: 'choir-well', title: 'Choir Well', kind: 'rift', description: 'Voices climb from a lightless bore.', rewardText: 'Pure lumen and a Heart overtone.', hazardText: 'The song enters unguarded minds.', baseRewards: { lumen: 3 }, hazard: 3, noteProgress: 1, storyTag: 'song' },
  { id: 'pilgrim-cache', title: 'Pilgrim Cache', kind: 'refuge', description: 'Old pressure doors answer Orison.', rewardText: 'Provisions and workable metal.', hazardText: 'The seals remember betrayal.', baseRewards: { provisions: 3, alloy: 1 }, hazard: 1, noteProgress: 0, storyTag: 'pilgrim' },
  { id: 'iron-orchard', title: 'Iron Orchard', kind: 'vein', description: 'Metal branches bloom in vacuum.', rewardText: 'A broad alloy harvest.', hazardText: 'Each cut wakes the roots.', baseRewards: { alloy: 4 }, hazard: 3, noteProgress: 0, storyTag: 'vein' },
  { id: 'saint-engine', title: 'Engine of Saint Varo', kind: 'ruin', description: 'A dead engine still dreams of motion.', rewardText: 'Alloy, lumen, and an old memory.', hazardText: 'Its flywheel turns without warning.', baseRewards: { alloy: 2, lumen: 2 }, hazard: 2, noteProgress: 1, storyTag: 'ruin' },
  { id: 'blue-quiet', title: 'The Blue Quiet', kind: 'refuge', description: 'A sheltered cavern dampens the moon-song.', rewardText: 'Rest and provisions.', hazardText: 'Silence makes the crew careless.', baseRewards: { provisions: 4 }, hazard: 0, noteProgress: 0, storyTag: 'quiet' },
  { id: 'split-canticle', title: 'Split Canticle', kind: 'rift', description: 'Two incompatible notes share one fault.', rewardText: 'A clear Heart resonance.', hazardText: 'The citadel must choose which song is real.', baseRewards: { lumen: 2 }, hazard: 4, noteProgress: 1, storyTag: 'song' },
  { id: 'buried-market', title: 'Buried Market', kind: 'ruin', description: 'Empty stalls offer goods for memories.', rewardText: 'A varied salvage haul.', hazardText: 'Something insists on being paid.', baseRewards: { provisions: 2, alloy: 2, lumen: 1 }, hazard: 2, noteProgress: 0, storyTag: 'ruin' },
  { id: 'heartward-fault', title: 'Heartward Fault', kind: 'rift', description: 'The crust folds toward the hidden Heart.', rewardText: 'The strongest known overtone.', hazardText: 'Structural collapse is nearly certain.', baseRewards: { alloy: 2, lumen: 2 }, hazard: 5, noteProgress: 2, storyTag: 'heart' },
];

export const FALLBACK_EVENTS: readonly StoryEventDefinition[] = [
  { id: 'echo-at-supper', title: 'An Empty Place Sings', body: 'At supper, a fifth voice joins the table.', speaker: 'mara', tags: ['any'], choices: [
    { label: 'Answer it together', consequence: 'The crew names the fear.', crewId: 'mara', loyaltyDelta: 1, strainDelta: -1 },
    { label: 'Record it in silence', consequence: 'Sable preserves the impossible harmony.', crewId: 'sable', loyaltyDelta: 1, noteDelta: 1 },
  ] },
  { id: 'drill-blood', title: 'Red on the Teeth', body: 'The drill returns wet with something that is not oil.', speaker: 'tamsin', tags: ['vein', 'heart'], choices: [
    { label: 'Keep drilling', consequence: 'Tamsin follows the vein past good sense.', resourceDelta: { alloy: 2 }, crewId: 'tamsin', loyaltyDelta: 1, strainDelta: 2 },
    { label: 'Consecrate the drill', consequence: 'Orin spends lumen to quiet the mechanism.', resourceDelta: { lumen: -1 }, crewId: 'orin', loyaltyDelta: 1, integrityDelta: 1 },
  ] },
  { id: 'future-letter', title: 'Letter from Tomorrow', body: 'Sable prints a warning in Mara’s handwriting.', speaker: 'sable', tags: ['song', 'rift', 'any'], choices: [
    { label: 'Read it aloud', consequence: 'The warning becomes a shared burden.', crewId: 'sable', loyaltyDelta: 1, strainDelta: -1 },
    { label: 'Burn it unread', consequence: 'Heat, at least, is a certain thing.', resourceDelta: { lumen: 1 }, crewId: 'mara', loyaltyDelta: 1 },
  ] },
  { id: 'old-vow', title: 'The Pilgrim’s Vow', body: 'A pressure suit kneels before a door that no longer exists.', speaker: 'orin', tags: ['pilgrim', 'ruin'], choices: [
    { label: 'Complete the vigil', consequence: 'Orin adds the dead pilgrim’s note to the chord.', crewId: 'orin', loyaltyDelta: 1, noteDelta: 1 },
    { label: 'Salvage the suit', consequence: 'The practical choice weighs on Mara.', resourceDelta: { alloy: 2 }, crewId: 'mara', loyaltyDelta: -1 },
  ] },
  { id: 'cracked-ward', title: 'A Crack in the Ward', body: 'The moon-song pushes a hairline fracture through the brass.', speaker: 'orin', tags: ['any'], choices: [
    { label: 'Brace it now', consequence: 'Metal spent now prevents blood later.', resourceDelta: { alloy: -1 }, integrityDelta: 2, crewId: 'orin', loyaltyDelta: 1 },
    { label: 'Let Mara hold it', consequence: 'Mara stands in the breach.', crewId: 'mara', loyaltyDelta: 1, strainDelta: 2 },
  ] },
  { id: 'shared-dream', title: 'Four Dream the Same Door', body: 'Each crew member wakes with the same brass key in mind.', speaker: 'orison', tags: ['heart', 'song', 'any'], choices: [
    { label: 'Turn the key', consequence: 'The Heart answers with a lucid tone.', noteDelta: 1, integrityDelta: -1 },
    { label: 'Wake fully', consequence: 'The crew chooses one another over revelation.', crewId: 'mara', strainDelta: -2, loyaltyDelta: 1 },
  ] },
];
