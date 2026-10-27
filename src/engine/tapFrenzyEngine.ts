export interface TapFrenzyState {
  tugPosition: number; // -100 (P1 goal) to +100 (P2 goal), 0 = center
  targetPosition: number; // 100
  p1Taps: number;
  p2Taps: number;
  p1Cps?: number;
  p2Cps?: number;
  roundWinner: string | null;
  roundNumber: number;
  targetWins: number;
  scores: Record<string, number>;
  lastTapTimestamp: number;
}

export function createTapFrenzyInitialState(playerUids: string[], targetWins: number = 3): TapFrenzyState {
  const scores: Record<string, number> = {};
  playerUids.forEach((uid) => {
    scores[uid] = 0;
  });

  return {
    tugPosition: 0,
    targetPosition: 100,
    p1Taps: 0,
    p2Taps: 0,
    p1Cps: 0,
    p2Cps: 0,
    roundWinner: null,
    roundNumber: 1,
    targetWins,
    scores,
    lastTapTimestamp: Date.now()
  };
}

export function registerTugTap(
  state: TapFrenzyState,
  playerUid: string,
  p1Uid: string,
  multiplier: number = 1.0
): {
  newState: TapFrenzyState;
  roundOver: boolean;
  roundWinnerUid: string | null;
  matchOver: boolean;
  matchWinnerUid: string | null;
} {
  if (state.roundWinner !== null) {
    return {
      newState: state,
      roundOver: false,
      roundWinnerUid: null,
      matchOver: false,
      matchWinnerUid: null
    };
  }

  const isP1 = playerUid === p1Uid;
  const pushDelta = (isP1 ? -3.4 : 3.4) * multiplier;
  const nextPos = Math.max(-100, Math.min(100, state.tugPosition + pushDelta));

  const nextP1Taps = isP1 ? state.p1Taps + 1 : state.p1Taps;
  const nextP2Taps = isP1 ? state.p2Taps : state.p2Taps + 1;

  let roundOver = false;
  let roundWinnerUid: string | null = null;
  let matchOver = false;
  let matchWinnerUid: string | null = null;

  let nextScores = { ...state.scores };

  if (nextPos <= -100) {
    // P1 wins round
    roundOver = true;
    roundWinnerUid = p1Uid;
    nextScores[p1Uid] = (nextScores[p1Uid] || 0) + 1;
    if (nextScores[p1Uid] >= state.targetWins) {
      matchOver = true;
      matchWinnerUid = p1Uid;
    }
  } else if (nextPos >= 100) {
    // P2 wins round
    const p2Uid = Object.keys(state.scores).find((uid) => uid !== p1Uid) || 'p2';
    roundOver = true;
    roundWinnerUid = p2Uid;
    nextScores[p2Uid] = (nextScores[p2Uid] || 0) + 1;
    if (nextScores[p2Uid] >= state.targetWins) {
      matchOver = true;
      matchWinnerUid = p2Uid;
    }
  }

  return {
    newState: {
      ...state,
      tugPosition: nextPos,
      p1Taps: nextP1Taps,
      p2Taps: nextP2Taps,
      roundWinner: roundWinnerUid,
      scores: nextScores,
      lastTapTimestamp: Date.now()
    },
    roundOver,
    roundWinnerUid,
    matchOver,
    matchWinnerUid
  };
}

export function resetTapWarRound(state: TapFrenzyState): TapFrenzyState {
  return {
    ...state,
    tugPosition: 0,
    roundWinner: null,
    roundNumber: state.roundNumber + 1
  };
}
