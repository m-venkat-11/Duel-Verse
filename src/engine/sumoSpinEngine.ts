export interface SumoSpinner {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spinRpm: number;
  alive: boolean;
  boostCooldown: number;
}

export interface SumoSpinState {
  arenaRadius: number; // e.g. 170
  scores: Record<string, number>;
  targetScore: number;
  roundWinner: string | null;
  roundNumber: number;
}

export function createSumoSpinInitialState(playerUids: string[], targetScore: number = 3): SumoSpinState {
  const p1 = playerUids[0] || 'p1';
  const p2 = playerUids[1] || 'p2';

  const scores: Record<string, number> = { [p1]: 0, [p2]: 0 };

  return {
    arenaRadius: 175,
    scores,
    targetScore,
    roundWinner: null,
    roundNumber: 1
  };
}

export function registerSumoRingOut(
  state: SumoSpinState,
  fallenUid: string
): {
  newState: SumoSpinState;
  winnerUid: string;
  matchOver: boolean;
  matchWinnerUid: string | null;
} {
  const uids = Object.keys(state.scores);
  const victorUid = uids.find((uid) => uid !== fallenUid) || uids[0];

  const nextScores = {
    ...state.scores,
    [victorUid]: (state.scores[victorUid] || 0) + 1
  };

  const matchOver = nextScores[victorUid] >= state.targetScore;

  return {
    newState: {
      ...state,
      scores: nextScores,
      roundWinner: victorUid,
      roundNumber: state.roundNumber + 1
    },
    winnerUid: victorUid,
    matchOver,
    matchWinnerUid: matchOver ? victorUid : null
  };
}
