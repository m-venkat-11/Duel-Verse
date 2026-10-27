export interface StuckBlade {
  angle: number; // Angle on target wheel (0 to 2*PI)
  ownerUid: string;
}

export interface KnifeMasterState {
  wheelAngle: number;
  rotationSpeed: number;
  stuckBlades: StuckBlade[];
  p1KnivesLeft: number;
  p2KnivesLeft: number;
  scores: Record<string, number>;
  targetScore: number;
  roundWinner: string | null;
  roundNumber: number;
}

export function createKnifeMasterInitialState(playerUids: string[], targetScore: number = 3): KnifeMasterState {
  const p1 = playerUids[0] || 'p1';
  const p2 = playerUids[1] || 'p2';

  const scores: Record<string, number> = { [p1]: 0, [p2]: 0 };

  return {
    wheelAngle: 0,
    rotationSpeed: 0.035,
    stuckBlades: [
      { angle: 0, ownerUid: 'obstacle' },
      { angle: Math.PI, ownerUid: 'obstacle' }
    ],
    p1KnivesLeft: 7,
    p2KnivesLeft: 7,
    scores,
    targetScore,
    roundWinner: null,
    roundNumber: 1
  };
}

export function registerKnifeThrow(
  state: KnifeMasterState,
  playerUid: string,
  wheelAngleAtImpact: number
): {
  newState: KnifeMasterState;
  success: boolean;
  roundOver: boolean;
  roundWinnerUid: string | null;
  matchOver: boolean;
  matchWinnerUid: string | null;
} {
  const p1Uid = Object.keys(state.scores)[0];
  const isP1 = playerUid === p1Uid;
  const p2Uid = Object.keys(state.scores)[1] || 'p2';

  // Knife strikes target at bottom edge (PI / 2) relative to wheel
  const hitAngle = ((Math.PI / 2) - wheelAngleAtImpact) % (Math.PI * 2);
  const normalizedHitAngle = hitAngle < 0 ? hitAngle + Math.PI * 2 : hitAngle;

  // Collision tolerance ~ 0.28 radians (~16 degrees)
  const TOLERANCE = 0.28;
  let clashed = false;
  for (const blade of state.stuckBlades) {
    let diff = Math.abs(blade.angle - normalizedHitAngle);
    while (diff > Math.PI) diff = Math.abs(diff - Math.PI * 2);
    if (diff < TOLERANCE) {
      clashed = true;
      break;
    }
  }

  if (clashed) {
    // Round lost! Opponent scores round
    const victorUid = isP1 ? p2Uid : p1Uid;
    const nextScores = {
      ...state.scores,
      [victorUid]: (state.scores[victorUid] || 0) + 1
    };
    const matchOver = nextScores[victorUid] >= state.targetScore;

    return {
      newState: {
        ...state,
        scores: nextScores,
        roundWinner: victorUid
      },
      success: false,
      roundOver: true,
      roundWinnerUid: victorUid,
      matchOver,
      matchWinnerUid: matchOver ? victorUid : null
    };
  } else {
    // Knife sticks!
    const nextStuck = [...state.stuckBlades, { angle: normalizedHitAngle, ownerUid: playerUid }];
    const nextP1Left = isP1 ? Math.max(0, state.p1KnivesLeft - 1) : state.p1KnivesLeft;
    const nextP2Left = !isP1 ? Math.max(0, state.p2KnivesLeft - 1) : state.p2KnivesLeft;

    let roundOver = false;
    let roundWinnerUid: string | null = null;
    let matchOver = false;
    let matchWinnerUid: string | null = null;
    let nextScores = { ...state.scores };

    // If player depleted all knives without hitting another knife -> win round!
    if ((isP1 && nextP1Left === 0) || (!isP1 && nextP2Left === 0)) {
      roundOver = true;
      roundWinnerUid = playerUid;
      nextScores[playerUid] = (nextScores[playerUid] || 0) + 1;
      if (nextScores[playerUid] >= state.targetScore) {
        matchOver = true;
        matchWinnerUid = playerUid;
      }
    }

    return {
      newState: {
        ...state,
        stuckBlades: nextStuck,
        p1KnivesLeft: nextP1Left,
        p2KnivesLeft: nextP2Left,
        scores: nextScores,
        roundWinner: roundWinnerUid
      },
      success: true,
      roundOver,
      roundWinnerUid,
      matchOver,
      matchWinnerUid
    };
  }
}
