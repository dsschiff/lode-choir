import {
  ROUTES,
  STORY_EVENTS,
  applyCommand,
  legalCommands,
  type Command,
  type GameState,
  type RouteDefinition,
} from '../src/index.ts';

export type PolicyName = 'conservative' | 'balanced' | 'aggressive';

function transition(state: GameState, command: Command): GameState {
  return applyCommand(state, command).state;
}

function rewardValue(route: RouteDefinition): number {
  return Object.values(route.baseRewards).reduce((sum, value) => sum + (value ?? 0), 0);
}

function selectRoute(state: GameState, policy: PolicyName): GameState {
  const ranked = state.routeOffers.map((offer) => ({
    ...offer,
    definition: ROUTES.find((route) => route.id === offer.routeId)!,
  })).sort((left, right) => {
    const leftRoute = left.definition;
    const rightRoute = right.definition;
    if (policy === 'aggressive') {
      return (rightRoute.noteProgress * 20 + rewardValue(rightRoute) + rightRoute.hazard)
        - (leftRoute.noteProgress * 20 + rewardValue(leftRoute) + leftRoute.hazard);
    }
    if (policy === 'conservative') {
      const notesNeeded = Math.max(0, 3 - state.heartNotes);
      const urgency = state.shift >= 8 - notesNeeded;
      const leftScore = (urgency ? leftRoute.noteProgress * 20 : leftRoute.noteProgress * 4) + rewardValue(leftRoute) - leftRoute.hazard * 4;
      const rightScore = (urgency ? rightRoute.noteProgress * 20 : rightRoute.noteProgress * 4) + rewardValue(rightRoute) - rightRoute.hazard * 4;
      return rightScore - leftScore;
    }
    return (rightRoute.noteProgress * 10 + rewardValue(rightRoute) * 2 - rightRoute.hazard)
      - (leftRoute.noteProgress * 10 + rewardValue(leftRoute) * 2 - leftRoute.hazard);
  });
  return transition(state, { type: 'select_route', instanceId: ranked[0]!.instanceId });
}

function assignCrew(state: GameState, policy: PolicyName, useLeaders: boolean): GameState {
  const active = state.crew.filter((crew) => crew.incapacitatedUntil <= state.shift);
  const selectedOffer = state.routeOffers.find((route) => route.instanceId === state.selectedRoute);
  const routeKind = ROUTES.find((route) => route.id === selectedOffer?.routeId)?.kind;
  const leaderByRoute = { refuge: 'mara', vein: 'tamsin', ruin: 'orin', rift: 'sable' } as const;
  const desiredLeader = routeKind ? leaderByRoute[routeKind] : undefined;
  const leader = active.find((candidate) => candidate.id === desiredLeader);
  const reserveLeader = useLeaders && active.length === 4 && Boolean(leader && leader.strain <= 2 && state.resources.provisions >= 4);
  const preferences = policy === 'conservative'
    ? ['ward_array', 'infirmary', 'heart_engine', 'deep_drill', 'resonance_chamber', 'foundry']
    : policy === 'aggressive'
      ? ['deep_drill', 'resonance_chamber', 'ward_array', 'foundry', 'heart_engine', 'infirmary']
      : ['ward_array', 'deep_drill', 'heart_engine', 'resonance_chamber', 'infirmary', 'foundry'];
  const crewOrder = policy === 'conservative' ? ['mara', 'orin', 'sable', 'tamsin'] : ['tamsin', 'mara', 'sable', 'orin'];
  const crew = active
    .filter((candidate) => !reserveLeader || candidate.id !== desiredLeader)
    .sort((left, right) => crewOrder.indexOf(left.id) - crewOrder.indexOf(right.id));
  const modules = [...state.modules].sort((left, right) => preferences.indexOf(left.id) - preferences.indexOf(right.id));
  const count = Math.min(3, crew.length, modules.length);
  for (let index = 0; index < count; index += 1) {
    state = transition(state, { type: 'assign_crew', crewId: crew[index]!.id, slot: modules[index]!.slot });
  }
  if (reserveLeader && leader
    && legalCommands(state).some((command) => command.type === 'assign_route_leader' && command.crewId === leader.id)) {
    state = transition(state, { type: 'assign_route_leader', crewId: leader.id });
  }
  return state;
}

function chooseEvent(state: GameState, policy: PolicyName): GameState {
  const event = STORY_EVENTS.find((candidate) => candidate.id === state.activeEvent)!;
  const legalChoices = new Set(
    legalCommands(state)
      .filter((command) => command.type === 'choose_event')
      .map((command) => command.choiceIndex),
  );
  let bestIndex = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < event.choices.length; index += 1) {
    if (!legalChoices.has(index)) continue;
    const choice = event.choices[index]!;
    const resources = choice.resourceDelta ? rewardValue({ baseRewards: choice.resourceDelta } as RouteDefinition) : 0;
    const score = policy === 'aggressive'
      ? (choice.noteDelta ?? 0) * 15 + resources + (choice.loyaltyDelta ?? 0) - Math.max(0, -(choice.integrityDelta ?? 0))
      : policy === 'conservative'
        ? (choice.integrityDelta ?? 0) * 5 - (choice.strainDelta ?? 0) * 3 + resources - Math.max(0, -(choice.resourceDelta?.alloy ?? 0))
        : (choice.noteDelta ?? 0) * 10 + (choice.integrityDelta ?? 0) * 2 + resources + (choice.loyaltyDelta ?? 0) - Math.max(0, choice.strainDelta ?? 0);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  return transition(state, { type: 'choose_event', choiceIndex: bestIndex });
}

function develop(state: GameState, policy: PolicyName): GameState {
  const commands = legalCommands(state);
  const priorities = policy === 'conservative'
    ? ['infirmary', 'ward_array', 'resonance_chamber', 'heart_engine', 'deep_drill', 'foundry']
    : ['resonance_chamber', 'deep_drill', 'ward_array', 'foundry', 'heart_engine', 'infirmary'];
  const commandModuleId = (command: Command) => {
    if (command.type === 'build_module') return command.moduleId;
    if (command.type === 'upgrade_module') return state.modules.find((module) => module.slot === command.slot)?.id;
    return undefined;
  };
  const ranked = [...commands].sort((left, right) => {
    if (left.type === 'skip_development') return 1;
    if (right.type === 'skip_development') return -1;
    const leftId = commandModuleId(left);
    const rightId = commandModuleId(right);
    const typeBias = (command: Command) => command.type === 'build_module' ? -2 : 0;
    return priorities.indexOf(leftId!) - priorities.indexOf(rightId!) + typeBias(left) - typeBias(right);
  });
  return transition(state, ranked[0]!);
}

export function playRun(initial: GameState, policy: PolicyName, useLeaders = true): GameState {
  let state = initial;
  let steps = 0;
  while (state.status === 'playing') {
    steps += 1;
    if (steps > 100) throw new Error(`Policy ${policy} deadlocked on seed ${state.seed} in ${state.phase}.`);
    if (state.phase === 'planning') {
      state = selectRoute(state, policy);
      state = assignCrew(state, policy, useLeaders);
      const resolve = legalCommands(state).find((command) => command.type === 'resolve_shift');
      if (!resolve) throw new Error(`Policy ${policy} could not resolve shift ${state.shift} on ${state.seed}.`);
      state = transition(state, resolve);
    } else if (state.phase === 'event') {
      state = chooseEvent(state, policy);
    } else if (state.phase === 'development') {
      state = develop(state, policy);
    } else if (state.phase === 'finale') {
      state = transition(state, { type: 'choose_ending', endingId: policy === 'aggressive' ? 'harvest' : policy === 'conservative' ? 'seal' : 'harmonize' });
    } else {
      throw new Error(`Unexpected active phase ${state.phase}.`);
    }
  }
  return state;
}
