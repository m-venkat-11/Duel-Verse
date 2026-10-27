export interface TankDuelState {
  scores: Record<string, number>;
  targetScore: number;
  roundWinner: string | null;
  roundNumber: number;
  lastKillTimestamp: number;
  tanks?: Record<string, {
    x: number;
    y: number;
    angle: number;
    turretAngle: number;
    alive: boolean;
  }>;
}

export function createTankDuelInitialState(playerUids: string[], targetScore: number = 3): TankDuelState {
  const scores: Record<string, number> = {};
  playerUids.forEach((uid) => {
    scores[uid] = 0;
  });
  return {
    scores,
    targetScore,
    roundWinner: null,
    roundNumber: 1,
    lastKillTimestamp: 0
  };
}

export function registerTankKill(
  state: TankDuelState,
  killerUid: string,
  victimUid: string
): {
  newState: TankDuelState;
  matchOver: boolean;
  matchWinnerUid: string | null;
} {
  const nextScores = {
    ...state.scores,
    [killerUid]: (state.scores[killerUid] || 0) + 1
  };

  const matchOver = nextScores[killerUid] >= state.targetScore;

  return {
    newState: {
      ...state,
      scores: nextScores,
      roundWinner: killerUid,
      roundNumber: state.roundNumber + 1,
      lastKillTimestamp: Date.now()
    },
    matchOver,
    matchWinnerUid: matchOver ? killerUid : null
  };
}
