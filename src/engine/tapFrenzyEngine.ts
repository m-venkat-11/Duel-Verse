import type { TapFrenzyState, FrenzyTarget } from '../types/game';

function generateTarget(existingIds: Set<string>): FrenzyTarget {
  const rand = Math.random();
  let type: 'coin' | 'spark' | 'bomb' = 'coin';
  let points = 10;
  let lifespan = 2800;

  if (rand < 0.25) {
    type = 'bomb';
    points = -25;
    lifespan = 3200;
  } else if (rand < 0.45) {
    type = 'spark';
    points = 30;
    lifespan = 2200;
  }

  let id = `t_${Math.floor(Math.random() * 100000)}`;
  while (existingIds.has(id)) {
    id = `t_${Math.floor(Math.random() * 100000)}`;
  }

  return {
    id,
    type,
    x: Math.floor(10 + Math.random() * 80),
    y: Math.floor(15 + Math.random() * 70),
    points,
    expiresAt: Date.now() + lifespan
  };
}

export function createTapFrenzyInitialState(playerUids: string[], durationSec: number = 30): TapFrenzyState {
  const scores: Record<string, number> = {};
  const frozenUntil: Record<string, number> = {};

  playerUids.forEach((uid) => {
    scores[uid] = 0;
    frozenUntil[uid] = 0;
  });

  const existingIds = new Set<string>();
  const targets: FrenzyTarget[] = [];
  for (let i = 0; i < 5; i++) {
    const t = generateTarget(existingIds);
    existingIds.add(t.id);
    targets.push(t);
  }

  return {
    endTime: Date.now() + durationSec * 1000,
    targets,
    scores,
    frozenUntil
  };
}

export function tapTarget(
  state: TapFrenzyState,
  playerUid: string,
  targetId: string
): {
  newState: TapFrenzyState;
  hitTarget: FrenzyTarget | null;
} {
  const now = Date.now();
  if (state.frozenUntil[playerUid] && now < state.frozenUntil[playerUid]) {
    // Player is currently frozen by bomb
    return { newState: state, hitTarget: null };
  }

  const target = state.targets.find((t) => t.id === targetId);
  if (!target) {
    return { newState: state, hitTarget: null };
  }

  const nextTargets = state.targets.filter((t) => t.id !== targetId);

  // Spawn replacement target
  const existingIds = new Set(nextTargets.map((t) => t.id));
  nextTargets.push(generateTarget(existingIds));

  let frozenTime = state.frozenUntil[playerUid] || 0;
  if (target.type === 'bomb') {
    frozenTime = now + 1200; // 1.2s freeze
  }

  const nextScores = {
    ...state.scores,
    [playerUid]: Math.max(0, (state.scores[playerUid] || 0) + target.points)
  };

  return {
    newState: {
      ...state,
      targets: nextTargets,
      scores: nextScores,
      frozenUntil: {
        ...state.frozenUntil,
        [playerUid]: frozenTime
      }
    },
    hitTarget: target
  };
}

export function pruneExpiredTargets(state: TapFrenzyState): TapFrenzyState {
  const now = Date.now();
  const valid = state.targets.filter((t) => t.expiresAt > now);
  const existingIds = new Set(valid.map((t) => t.id));

  while (valid.length < 5) {
    const t = generateTarget(existingIds);
    existingIds.add(t.id);
    valid.push(t);
  }

  return {
    ...state,
    targets: valid
  };
}
