export type SlapRole = 'attacker' | 'defender';

export interface SlapDuelState {
  attackerUid: string;
  defenderUid: string;
  p1HandState: 'idle' | 'slapping' | 'dodging' | 'slapped' | 'feinting';
  p2HandState: 'idle' | 'slapping' | 'dodging' | 'slapped' | 'feinting';
  falseDodges: Record<string, number>;
  frozenUntil: Record<string, number>;
  scores: Record<string, number>;
  targetScore: number;
  roundWinner: string | null;
  lastActionTimestamp: number;
  telegraphTimestamp?: number;
  defenderDodgeUntil?: number;
  lastEvent?: {
    type: 'slap_hit' | 'dodged' | 'feint' | 'false_dodge' | 'frozen' | 'telegraph';
    actorUid: string;
    timestamp: number;
  } | null;
}

export function createSlapDuelInitialState(playerUids: string[], targetScore: number = 3): SlapDuelState {
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
    lastActionTimestamp: Date.now(),
    lastEvent: null
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
  const nextFrozenUntil = isFrozen ? Date.now() + 2400 : (state.frozenUntil[defenderUid] || 0);

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
      lastActionTimestamp: Date.now(),
      lastEvent: {
        type: isFrozen ? 'frozen' : 'false_dodge',
        actorUid: defenderUid,
        timestamp: Date.now()
      }
    },
    frozen: isFrozen,
    strikes: isFrozen ? 3 : currentStrikes
  };
}

export function registerSlapStrike(
  state: SlapDuelState,
  attackerUid: string,
  isDodging: boolean,
  overrideTargetScore?: number
): {
  newState: SlapDuelState;
  landed: boolean;
  matchOver: boolean;
  matchWinnerUid: string | null;
} {
  const uids = Object.keys(state.scores);
  const p1Uid = uids[0];
  const p2Uid = uids[1] || 'p2';
  const isP1Attacker = attackerUid === p1Uid;
  const defenderUid = isP1Attacker ? p2Uid : p1Uid;

  const isDefenderFrozen = (state.frozenUntil[defenderUid] || 0) > Date.now();
  const effectiveDodged = isDodging && !isDefenderFrozen;

  if (effectiveDodged) {
    // Defender successfully dodged -> roles swap!
    return {
      newState: {
        ...state,
        attackerUid: defenderUid,
        defenderUid: attackerUid,
        p1HandState: 'idle',
        p2HandState: 'idle',
        falseDodges: { [p1Uid]: 0, [p2Uid]: 0 },
        lastActionTimestamp: Date.now(),
        lastEvent: {
          type: 'dodged',
          actorUid: defenderUid,
          timestamp: Date.now()
        }
      },
      landed: false,
      matchOver: false,
      matchWinnerUid: null
    };
  } else {
    // Slap landed! Attacker scores + clears defender freeze if any
    const nextScores = {
      ...state.scores,
      [attackerUid]: (state.scores[attackerUid] || 0) + 1
    };

    const goal = overrideTargetScore || state.targetScore || 3;
    const matchOver = nextScores[attackerUid] >= goal;

    return {
      newState: {
        ...state,
        scores: nextScores,
        frozenUntil: {
          ...state.frozenUntil,
          [defenderUid]: 0
        },
        p1HandState: isP1Attacker ? 'slapping' : 'slapped',
        p2HandState: isP1Attacker ? 'slapped' : 'slapping',
        lastActionTimestamp: Date.now(),
        lastEvent: {
          type: 'slap_hit',
          actorUid: attackerUid,
          timestamp: Date.now()
        }
      },
      landed: true,
      matchOver,
      matchWinnerUid: matchOver ? attackerUid : null
    };
  }
}
