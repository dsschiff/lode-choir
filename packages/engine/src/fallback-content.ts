import type {
  CrewDefinition,
  ModuleDefinition,
  RouteDefinition,
  StoryEventDefinition,
} from './types.ts';

export const FALLBACK_CREW: readonly CrewDefinition[] = [
  { id: 'mara', name: 'Mara Vey', role: 'Captain', epithet: 'rescue captain', talent: 'Yields food, runs the Drill safely, or braces the Ward.', drawback: 'Gains strain when a refuge is abandoned.', vow: 'Bring everyone home.', vowAction: 'Advance by completing a mission without hull damage.', signature: 'Holdfast', color: '#dca86b' },
  { id: 'tamsin', name: 'Tamsin Rook', role: 'Delver', epithet: 'deep-vein miner', talent: 'Rests in the Heart or pushes rooms for alloy.', drawback: 'Takes 1 extra strain on severe missions.', vow: 'Recover her first crew\'s tags.', vowAction: 'Advance when Tamsin works or leads a dangerous mission.', signature: 'Redline', color: '#ef715f' },
  { id: 'orin', name: 'Orin Vale', role: 'Citadel Engineer', epithet: 'systems lead', talent: 'Repairs Orison from any starter room.', drawback: 'Produces less alloy on the Drill.', vow: 'Teach Orison a new signal.', vowAction: 'Advance when Orin leads, repairs hull, or operates Resonance.', signature: 'Counterhymn', color: '#70cbb9' },
  { id: 'sable', name: 'Sable-9', role: 'Survey Synthetic', epithet: 'ninth memory build', talent: 'Records lumen in the Heart or Drill. Reveals faults from the Ward, leadership, or Resonance.', drawback: 'Cannot recover strain in the Heart Engine.', vow: 'Recover Sable-8\'s deleted minute.', vowAction: 'Advance by revealing the selected mission fault.', signature: 'Second Sight', color: '#8ebcf4' },
];

export const FALLBACK_MODULES: readonly ModuleDefinition[] = [
  { id: 'heart_engine', name: 'Heart Engine', description: 'Cultivates food.', assignmentHint: 'Mara yields more; Tamsin rests; Orin repairs; Sable records lumen.', buildCost: 0 },
  { id: 'deep_drill', name: 'Deep Drill', description: 'Cuts ore.', assignmentHint: 'Mara works safely; Tamsin pushes output; Orin repairs; Sable records lumen.', buildCost: 0 },
  { id: 'ward_array', name: 'Ward Array', description: 'Braces the hull.', assignmentHint: 'Mara braces; Tamsin salvages; Orin repairs; Sable reads the mission.', buildCost: 0 },
  { id: 'foundry', name: 'Foundry', description: 'Makes hull plates.', assignmentHint: 'Spends alloy to repair hull.', buildCost: 4 },
  { id: 'infirmary', name: 'Infirmary', description: 'Treats pressure injuries.', assignmentHint: 'Reduces all crew strain.', buildCost: 4 },
  { id: 'resonance_chamber', name: 'Resonance Chamber', description: 'Processes Heart-Lode signals.', assignmentHint: 'Produces lumen and can decode a Heart Note.', buildCost: 5 },
];

export const FALLBACK_ROUTES: readonly RouteDefinition[] = [
  { id: 'glass-vein', title: 'The Glass Vein', kind: 'vein', description: 'A brittle ore seam vibrates under the drill.', storyLead: 'The vibration matches Orison\'s internal signal.', rewardText: '3 alloy and 1 Heart Note.', hazardText: 'Sharp fragments damage the hull.', baseRewards: { alloy: 3 }, hazard: 2, noteProgress: 1, storyTag: 'vein' },
  { id: 'choir-well', title: 'Choir Well', kind: 'rift', description: 'A deep bore repeats crew radio calls.', storyLead: 'The calls use voices the crew has not recorded yet.', rewardText: '3 lumen and 1 Heart Note.', hazardText: 'The signal increases strain.', baseRewards: { lumen: 3 }, hazard: 3, noteProgress: 1, storyTag: 'song' },
  { id: 'pilgrim-cache', title: 'Pilgrim Cache', kind: 'refuge', description: 'An old shelter still contains supplies.', storyLead: 'Mara found a current crew name in its old rescue ledger.', rewardText: '3 provisions and 1 alloy.', hazardText: 'Its pressure seals are unstable.', baseRewards: { provisions: 3, alloy: 1 }, hazard: 1, noteProgress: 0, storyTag: 'pilgrim' },
  { id: 'iron-orchard', title: 'Iron Orchard', kind: 'vein', description: 'Branching ore fills a vacuum chamber.', storyLead: 'The branches are growing toward Orison rather than away from the drill.', rewardText: '4 alloy.', hazardText: 'Cut branches move under pressure.', baseRewards: { alloy: 4 }, hazard: 3, noteProgress: 0, storyTag: 'vein' },
  { id: 'saint-engine', title: 'Engine of Saint Varo', kind: 'ruin', description: 'An abandoned engine still has power.', storyLead: 'Orin thinks its control record explains why Orison woke the crew.', rewardText: '2 alloy, 2 lumen, and 1 Heart Note.', hazardText: 'Its flywheel starts without warning.', baseRewards: { alloy: 2, lumen: 2 }, hazard: 2, noteProgress: 1, storyTag: 'ruin' },
  { id: 'blue-quiet', title: 'The Blue Quiet', kind: 'refuge', description: 'A sheltered cavern blocks the moon signal.', storyLead: 'It is the only place where Sable cannot hear the deleted minute repeating.', rewardText: '4 provisions.', hazardText: 'No immediate hazard.', baseRewards: { provisions: 4 }, hazard: 0, noteProgress: 0, storyTag: 'quiet' },
  { id: 'split-canticle', title: 'Split Canticle', kind: 'rift', description: 'Two Heart-Lode signals share one fault.', storyLead: 'One signal names the crew; the other names the dead.', rewardText: '2 lumen and 1 Heart Note.', hazardText: 'The wrong signal overloads Orison.', baseRewards: { lumen: 2 }, hazard: 4, noteProgress: 1, storyTag: 'song' },
  { id: 'buried-market', title: 'Buried Market', kind: 'ruin', description: 'A sealed market contains mixed supplies.', storyLead: 'Its last transaction records the first company selling Orison as equipment.', rewardText: '2 provisions, 2 alloy, and 1 lumen.', hazardText: 'Automated defenses remain active.', baseRewards: { provisions: 2, alloy: 2, lumen: 1 }, hazard: 2, noteProgress: 0, storyTag: 'ruin' },
  { id: 'heartward-fault', title: 'Heartward Fault', kind: 'rift', description: 'A collapsing shaft leads toward the Heart-Lode.', storyLead: 'The signal below has stopped calling Orison a machine.', rewardText: '2 alloy, 2 lumen, and 2 Heart Notes.', hazardText: 'Structural collapse is likely.', baseRewards: { alloy: 2, lumen: 2 }, hazard: 5, noteProgress: 2, storyTag: 'heart' },
];

export const FALLBACK_EVENTS: readonly StoryEventDefinition[] = [
  { id: 'echo-at-supper', title: 'Fifth Voice on the Intercom', body: 'An unknown voice joins the crew channel during dinner.', speaker: 'mara', tags: ['any'], choices: [
    { label: 'Answer together', consequence: 'Mara gains 1 loyalty and removes 1 strain.', crewId: 'mara', loyaltyDelta: 1, strainDelta: -1 },
    { label: 'Record the signal', consequence: 'Sable gains 1 loyalty and the expedition gains 1 Heart Note.', crewId: 'sable', loyaltyDelta: 1, noteDelta: 1 },
  ] },
  { id: 'drill-blood', title: 'Red Fluid on the Drill', body: 'The drill returns coated in warm red fluid.', speaker: 'tamsin', tags: ['vein', 'heart'], choices: [
    { label: 'Keep drilling', consequence: 'Gain 2 alloy. Tamsin gains 1 loyalty and 2 strain.', resourceDelta: { alloy: 2 }, crewId: 'tamsin', loyaltyDelta: 1, strainDelta: 2 },
    { label: 'Clean and isolate it', consequence: 'Spend 1 lumen, repair 1 hull, and give Orin 1 loyalty.', resourceDelta: { lumen: -1 }, crewId: 'orin', loyaltyDelta: 1, integrityDelta: 1 },
  ] },
  { id: 'future-letter', title: 'Warning Dated Tomorrow', body: 'Sable prints a warning in Mara\'s handwriting with tomorrow\'s date.', speaker: 'sable', tags: ['song', 'rift', 'any'], choices: [
    { label: 'Read it aloud', consequence: 'Sable gains 1 loyalty and removes 1 strain.', crewId: 'sable', loyaltyDelta: 1, strainDelta: -1 },
    { label: 'Destroy it', consequence: 'Gain 1 lumen and give Mara 1 loyalty.', resourceDelta: { lumen: 1 }, crewId: 'mara', loyaltyDelta: 1 },
  ] },
  { id: 'old-vow', title: 'Abandoned Pressure Suit', body: 'A sealed pressure suit is kneeling beside a removed door.', speaker: 'orin', tags: ['pilgrim', 'ruin'], choices: [
    { label: 'Complete the vigil', consequence: 'Orin gains 1 loyalty and the expedition gains 1 Heart Note.', crewId: 'orin', loyaltyDelta: 1, noteDelta: 1 },
    { label: 'Salvage the suit', consequence: 'Gain 2 alloy. Mara loses 1 loyalty.', resourceDelta: { alloy: 2 }, crewId: 'mara', loyaltyDelta: -1 },
  ] },
  { id: 'cracked-ward', title: 'Crack in the Ward', body: 'A pressure surge cracks one Ward Array brace.', speaker: 'orin', tags: ['any'], choices: [
    { label: 'Brace it now', consequence: 'Spend 1 alloy, repair 2 hull, and give Orin 1 loyalty.', resourceDelta: { alloy: -1 }, integrityDelta: 2, crewId: 'orin', loyaltyDelta: 1 },
    { label: 'Let Mara hold it', consequence: 'Mara gains 1 loyalty and 2 strain.', crewId: 'mara', loyaltyDelta: 1, strainDelta: 2 },
  ] },
  { id: 'shared-dream', title: 'Shared Door Dream', body: 'All four crew report the same dream about a brass key and a sealed door.', speaker: 'orison', tags: ['heart', 'song', 'any'], choices: [
    { label: 'Use the key', consequence: 'Gain 1 Heart Note and lose 1 hull.', noteDelta: 1, integrityDelta: -1 },
    { label: 'End the experiment', consequence: 'Mara gains 1 loyalty and removes 2 strain.', crewId: 'mara', strainDelta: -2, loyaltyDelta: 1 },
  ] },
];
