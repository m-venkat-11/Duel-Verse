export type SlapRole = 'attacker' | 'defender';

export interface SlapDuelState {
  attackerUid: string;
  defenderUid: string;
  p1HandState: 'idle' | 'slapping' | 'dodging' | 'slapped' | 'feinting';
  p2HandState: 'idle' | 'slapping' | 'dodging' | 'slapped' | 'feinting';
  falseDodges: Record<string, number>;
  frozenUntil: Record<string, number>;
  scores: Record<string, number>;
  targetScore: number; // 5
  roundWinner: string | null;
  lastActionTimestamp: number;
}

export function createSlapDuelInitialState(playerUids: string[], targetScore: number = 5): SlapDuelState {
  const p1 = playerUids[0] || 'p1';
  const p2 = playerUids[1] || 'p2';

  const scores: Record<string, number> = { [p1]: 0, [p2]: 0 };
  const falseDodges: Record<string, number> = { [p1]: 0, [p2]: 0 };
  const frozenUntil: Record<string, number> = { [p1]: 0, [p2]: 0 };

  return {
    attackerUid: p1,
    defenderUid: p2,
    p1HandState: 'idle',
    p2HandState: 'idle',
    falseDodges,
    frozenUntil,
    scores,
    targetScore,
    roundWinner: null,
    lastActionTimestamp: Date.now()
  };
}

export function registerFalseDodge(
  state: SlapDuelState,
  defenderUid: string
): {
  newState: SlapDuelState;
  frozen: boolean;
  strikes: number;
} {
  const currentStrikes = (state.falseDodges[defenderUid] || 0) + 1;
  const isFrozen = currentStrikes >= 3;
  const nextFrozenUntil = isFrozen ? Date.now() + 2000 : (state.frozenUntil[defenderUid] || 0);

  return {
    newState: {
      ...state,
      falseDodges: {
        ...state.falseDodges,
        [defenderUid]: isFrozen ? 0 : currentStrikes
      },
      frozenUntil: {
        ...state.frozenUntil,
        [defenderUid]: nextFrozenUntil
      },
      lastActionTimestamp: Date.now()
    },
    frozen: isFrozen,
    strikes: isFrozen ? 3 : currentStrikes
  };
}

export function registerSlapStrike(
  state: SlapDuelState,
  attackerUid: string,
  isDodging: boolean
): {
  newState: SlapDuelState;
  landed: boolean;
  matchOver: boolean;
  matchWinnerUid: string | null;
} {
  const p1Uid = Object.keys(state.scores)[0];
  const isP1Attacker = attackerUid === p1Uid;
  const defenderUid = isP1Attacker ? Object.keys(state.scores)[1] : p1Uid;

  const isDefenderFrozen = (state.frozenUntil[defenderUid] || 0) > Date.now();
  const effectiveDodged = isDodging && !isDefenderFrozen;

  if (effectiveDodged) {
    // Defender successfully dodged! Roles swap!
    return {
      newState: {
        ...state,
        attackerUid: defenderUid,
        defenderUid: attackerUid,
        p1HandState: 'idle',
        p2HandState: 'idle',
        falseDodges: { [p1Uid]: 0, [defenderUid]: 0 },
        lastActionTimestamp: Date.now()
      },
      landed: false,
      matchOver: false,
      matchWinnerUid: null
    };
  } else {
    // Slap landed! Attacker scores!
    const nextScores = {
      ...state.scores,
      [attackerUid]: (state.scores[attackerUid] || 0) + 1
    };

    const matchOver = nextScores[attackerUid] >= state.targetScore;

    return {
      newState: {
        ...state,
        scores: nextScores,
        p1HandState: isP1Attacker ? 'slapping' : 'slapped',
        p2HandState: isP1Attacker ? 'slapped' : 'slapping',
        lastActionTimestamp: Date.now()
      },
      landed: true,
      matchOver,
      matchWinnerUid: matchOver ? attackerUid : null
    };
  }
}
