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
  lastPushBy?: string | null;
  roundStartedAt: number;
  roundDuration: number; // seconds
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
    lastTapTimestamp: Date.now(),
    lastPushBy: null,
    roundStartedAt: Date.now(),
    roundDuration: 25
  };
}

export function registerTugTap(
  state: TapFrenzyState,
  playerUid: string,
  p1Uid: string,
  multiplier: number = 1.0,
  allPlayerUids: string[] = []
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
  const pushDelta = (isP1 ? -5.5 : 5.5) * multiplier;
  const nextPos = Math.max(-100, Math.min(100, state.tugPosition + pushDelta));

  const nextP1Taps = isP1 ? state.p1Taps + 1 : state.p1Taps;
  const nextP2Taps = isP1 ? state.p2Taps : state.p2Taps + 1;

  let roundOver = false;
  let roundWinnerUid: string | null = null;
  let matchOver = false;
  let matchWinnerUid: string | null = null;

  const nextScores = { ...state.scores };
  allPlayerUids.forEach((uid) => {
    if (nextScores[uid] === undefined) nextScores[uid] = 0;
  });

  if (nextPos <= -100) {
    roundOver = true;
    roundWinnerUid = p1Uid;
    nextScores[p1Uid] = (nextScores[p1Uid] || 0) + 1;
    if (nextScores[p1Uid] >= state.targetWins) {
      matchOver = true;
      matchWinnerUid = p1Uid;
    }
  } else if (nextPos >= 100) {
    const p2Uid =
      allPlayerUids.find((uid) => uid !== p1Uid) ||
      Object.keys(nextScores).find((uid) => uid !== p1Uid) ||
      playerUid;
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
      lastTapTimestamp: Date.now(),
      lastPushBy: playerUid
    },
    roundOver,
    roundWinnerUid,
    matchOver,
    matchWinnerUid
  };
}

export function resolveTapWarTimeout(
  state: TapFrenzyState,
  p1Uid: string,
  p2Uid: string
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

  // If dead even at 0, stay in Sudden Death until next tap breaks the tie
  if (Math.abs(state.tugPosition) < 0.01) {
    return {
      newState: state,
      roundOver: false,
      roundWinnerUid: null,
      matchOver: false,
      matchWinnerUid: null
    };
  }

  const winnerUid = state.tugPosition < 0 ? p1Uid : p2Uid;
  const nextScores = {
    ...state.scores,
    [winnerUid]: (state.scores[winnerUid] || 0) + 1
  };
  const matchOver = nextScores[winnerUid] >= state.targetWins;

  return {
    newState: {
      ...state,
      roundWinner: winnerUid,
      scores: nextScores
    },
    roundOver: true,
    roundWinnerUid: winnerUid,
    matchOver,
    matchWinnerUid: matchOver ? winnerUid : null
  };
}

export function resetTapWarRound(state: TapFrenzyState): TapFrenzyState {
  return {
    ...state,
    tugPosition: 0,
    roundWinner: null,
    roundNumber: state.roundNumber + 1,
    lastPushBy: null,
    roundStartedAt: Date.now()
  };
}
