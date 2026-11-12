export interface StuckBlade {
  angle: number; // Angle in wheel local coordinates: 0 = bottom (+Y) when wheelAngle = 0, PI = top (-Y)
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
  lastClash?: {
    playerUid: string;
    timestamp: number;
  } | null;
}

export function createKnifeMasterInitialState(
  playerUids: string[],
  targetScore: number = 3
): KnifeMasterState {
  const p1 = playerUids[0] || 'p1';
  const p2 = playerUids[1] || 'p2';

  const scores: Record<string, number> = { [p1]: 0, [p2]: 0 };

  return {
    wheelAngle: 0,
    rotationSpeed: 0.035,
    stuckBlades: [
      { angle: Math.PI / 2, ownerUid: 'obstacle' },
      { angle: (3 * Math.PI) / 2, ownerUid: 'obstacle' }
    ],
    p1KnivesLeft: 7,
    p2KnivesLeft: 7,
    scores,
    targetScore,
    roundWinner: null,
    roundNumber: 1,
    lastClash: null
  };
}

export function resetKnifeMasterRound(
  state: KnifeMasterState,
  playerUids: string[]
): KnifeMasterState {
  const p1 = playerUids[0] || Object.keys(state.scores)[0] || 'p1';
  const p2 = playerUids[1] || Object.keys(state.scores)[1] || 'p2';
  const scores = { ...state.scores };
  if (scores[p1] === undefined) scores[p1] = 0;
  if (scores[p2] === undefined) scores[p2] = 0;

  // Alternate obstacle angles each round for variety
  const roundNum = (state.roundNumber || 1) + 1;
  const baseOffset = (roundNum % 3) * (Math.PI / 6);

  return {
    ...state,
    wheelAngle: 0,
    rotationSpeed: 0.035,
    stuckBlades: [
      { angle: Math.PI / 2 + baseOffset, ownerUid: 'obstacle' },
      { angle: (3 * Math.PI) / 2 + baseOffset, ownerUid: 'obstacle' }
    ],
    p1KnivesLeft: 7,
    p2KnivesLeft: 7,
    scores,
    roundWinner: null,
    roundNumber: roundNum,
    lastClash: null
  };
}

export function normalizeAngle(a: number): number {
  let res = a % (Math.PI * 2);
  if (res < 0) res += Math.PI * 2;
  return res;
}

export function angleDiff(a: number, b: number): number {
  let diff = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  if (diff > Math.PI) diff = Math.PI * 2 - diff;
  return diff;
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
  if (state.roundWinner !== null) {
    return {
      newState: state,
      success: false,
      roundOver: false,
      roundWinnerUid: null,
      matchOver: false,
      matchWinnerUid: null
    };
  }

  const uids = Object.keys(state.scores);
  const p1Uid = uids[0];
  const p2Uid = uids[1] || 'p2';
  const isP1 = playerUid === p1Uid;

  // In Canvas local wheel coordinates, blade.angle = 0 draws vertically DOWN (+Y = bottom of wheel)
  // and blade.angle = Math.PI draws vertically UP (-Y = top of wheel).
  // P1 throws UP from bottom hitting local wheel angle (0 - wheelAngleAtImpact).
  // P2 throws DOWN from top hitting local wheel angle (Math.PI - wheelAngleAtImpact).
  const contactAngle = isP1 ? 0 : Math.PI;
  const normalizedHitAngle = normalizeAngle(contactAngle - wheelAngleAtImpact);

  // Collision tolerance ~ 0.24 radians (~13.7 degrees) matching visual blade + guard width
  const TOLERANCE = 0.24;
  let clashed = false;
  for (const blade of state.stuckBlades) {
    if (angleDiff(blade.angle, normalizedHitAngle) < TOLERANCE) {
      clashed = true;
      break;
    }
  }

  if (clashed) {
    // Blade clashed! Opponent wins the round
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
        roundWinner: victorUid,
        lastClash: { playerUid, timestamp: Date.now() }
      },
      success: false,
      roundOver: true,
      roundWinnerUid: victorUid,
      matchOver,
      matchWinnerUid: matchOver ? victorUid : null
    };
  } else {
    // Blade sticks cleanly into the cyber wheel!
    const nextStuck = [...state.stuckBlades, { angle: normalizedHitAngle, ownerUid: playerUid }];
    const nextP1Left = isP1 ? Math.max(0, state.p1KnivesLeft - 1) : state.p1KnivesLeft;
    const nextP2Left = !isP1 ? Math.max(0, state.p2KnivesLeft - 1) : state.p2KnivesLeft;

    let roundOver = false;
    let roundWinnerUid: string | null = null;
    let matchOver = false;
    let matchWinnerUid: string | null = null;
    const nextScores = { ...state.scores };

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
