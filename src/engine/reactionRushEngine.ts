import type { ReactionRushState } from '../types/game';

export function createReactionRushInitialState(playerUids: string[], targetWins: number = 3): ReactionRushState {
  const roundWins: Record<string, number> = {};
  playerUids.forEach((uid) => {
    roundWins[uid] = 0;
  });

  // Random delay between 2200ms and 5000ms from now
  const delay = Math.floor(2200 + Math.random() * 2800);
  const signalScheduledAt = Date.now() + delay;

  return {
    round: 1,
    phase: 'countdown',
    signalScheduledAt,
    reactionTimes: {},
    falseStarts: {},
    roundWinner: null,
    targetWins,
    roundWins
  };
}

export function registerReactionTap(
  state: ReactionRushState,
  playerUid: string,
  tapTimestamp: number,
  playerUids: string[]
): {
  newState: ReactionRushState;
  roundOver: boolean;
  roundWinnerUid: string | null;
  matchOver: boolean;
  matchWinnerUid: string | null;
} {
  if (state.phase === 'round_result') {
    return { newState: state, roundOver: true, roundWinnerUid: state.roundWinner, matchOver: false, matchWinnerUid: null };
  }

  const [p1, p2] = playerUids;
  const opponentUid = playerUids.find((id) => id !== playerUid) || 'opponent';

  // Check false start (tap before signal)
  if (tapTimestamp < state.signalScheduledAt) {
    const updatedRoundWins = { ...state.roundWins };
    updatedRoundWins[opponentUid] = (updatedRoundWins[opponentUid] || 0) + 1;

    const matchOver = (updatedRoundWins[opponentUid] || 0) >= state.targetWins;

    const newState: ReactionRushState = {
      ...state,
      phase: 'round_result',
      falseStarts: { ...state.falseStarts, [playerUid]: true },
      roundWinner: opponentUid,
      roundWins: updatedRoundWins
    };

    return {
      newState,
      roundOver: true,
      roundWinnerUid: opponentUid,
      matchOver,
      matchWinnerUid: matchOver ? opponentUid : null
    };
  }

  // Legal reaction tap after signal
  const deltaMs = Math.max(1, tapTimestamp - state.signalScheduledAt);
  const newReactionTimes = { ...state.reactionTimes, [playerUid]: deltaMs };

  // If this is the first legal tap, or if both have tapped
  const hasBothTapped = p1 && p2 && newReactionTimes[p1] !== undefined && newReactionTimes[p2] !== undefined;

  let roundWinnerUid: string | null = null;
  if (hasBothTapped) {
    roundWinnerUid = newReactionTimes[p1]! <= newReactionTimes[p2]! ? p1 : p2;
  } else {
    // Single tap after signal wins round if we award immediate fast tap
    roundWinnerUid = playerUid;
  }

  const updatedRoundWins = { ...state.roundWins };
  if (roundWinnerUid) {
    updatedRoundWins[roundWinnerUid] = (updatedRoundWins[roundWinnerUid] || 0) + 1;
  }

  const matchOver = Boolean(roundWinnerUid && (updatedRoundWins[roundWinnerUid] || 0) >= state.targetWins);

  const newState: ReactionRushState = {
    ...state,
    phase: 'round_result',
    reactionTimes: newReactionTimes,
    roundWinner: roundWinnerUid,
    roundWins: updatedRoundWins
  };

  return {
    newState,
    roundOver: true,
    roundWinnerUid,
    matchOver,
    matchWinnerUid: matchOver ? roundWinnerUid : null
  };
}

export function resetReactionNextRound(state: ReactionRushState): ReactionRushState {
  const delay = Math.floor(2200 + Math.random() * 2800);
  return {
    ...state,
    round: state.round + 1,
    phase: 'countdown',
    signalScheduledAt: Date.now() + delay,
    reactionTimes: {},
    falseStarts: {},
    roundWinner: null
  };
}
