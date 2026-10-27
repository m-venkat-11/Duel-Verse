import type { PongState } from '../types/game';

export function createPongInitialState(playerUids: string[], targetScore: number = 5): PongState {
  const p1 = playerUids[0] || 'p1';
  const p2 = playerUids[1] || 'p2';

  return {
    ballX: 50,
    ballY: 50,
    vx: (Math.random() > 0.5 ? 1 : -1) * 0.45,
    vy: (Math.random() > 0.5 ? 1 : -1) * 0.45,
    speed: 1.0,
    paddles: {
      [p1]: 50,
      [p2]: 50
    },
    targetScore,
    lastHitBy: null,
    roundState: 'rally',
    scorerUid: null
  };
}

export function updatePongPaddle(state: PongState, playerUid: string, xPos: number): PongState {
  const clamped = Math.max(10, Math.min(90, xPos));
  return {
    ...state,
    paddles: {
      ...state.paddles,
      [playerUid]: clamped
    }
  };
}

export function stepPongPhysics(
  state: PongState,
  playerUids: string[],
  scores: Record<string, number>
): {
  newState: PongState;
  scored: boolean;
  scorerUid: string | null;
  matchOver: boolean;
  winnerUid: string | null;
} {
  if (state.roundState === 'scored') {
    return { newState: state, scored: false, scorerUid: null, matchOver: false, winnerUid: null };
  }

  const [bottomUid, topUid] = playerUids;
  let nextX = state.ballX + state.vx * state.speed * 1.6;
  let nextY = state.ballY + state.vy * state.speed * 1.6;
  let nextVx = state.vx;
  let nextVy = state.vy;
  let nextSpeed = state.speed;
  let nextHitBy = state.lastHitBy;

  // Wall bounce (left and right edges: 0 and 100)
  if (nextX <= 2) {
    nextX = 2;
    nextVx = Math.abs(nextVx);
  } else if (nextX >= 98) {
    nextX = 98;
    nextVx = -Math.abs(nextVx);
  }

  const paddleWidth = 24; // % width of paddle
  const bottomPaddleX = state.paddles[bottomUid] ?? 50;
  const topPaddleX = state.paddles[topUid] ?? 50;

  // Bottom paddle collision (near Y=92)
  if (nextY >= 90 && state.ballY < 90 && nextVy > 0) {
    if (Math.abs(nextX - bottomPaddleX) <= paddleWidth / 2 + 3) {
      nextVy = -Math.abs(nextVy);
      // Angle deflection based on hit position
      const offset = (nextX - bottomPaddleX) / (paddleWidth / 2);
      nextVx = offset * 0.6;
      nextSpeed = Math.min(2.5, nextSpeed * 1.04);
      nextHitBy = bottomUid;
    }
  }

  // Top paddle collision (near Y=8)
  if (nextY <= 10 && state.ballY > 10 && nextVy < 0) {
    if (Math.abs(nextX - topPaddleX) <= paddleWidth / 2 + 3) {
      nextVy = Math.abs(nextVy);
      const offset = (nextX - topPaddleX) / (paddleWidth / 2);
      nextVx = offset * 0.6;
      nextSpeed = Math.min(2.5, nextSpeed * 1.04);
      nextHitBy = topUid;
    }
  }

  // Goal check (Bottom missed -> Top scores; Top missed -> Bottom scores)
  if (nextY >= 100) {
    // Top player scores!
    const updatedScores = { ...scores, [topUid]: (scores[topUid] || 0) + 1 };
    const matchOver = (updatedScores[topUid] || 0) >= state.targetScore;

    return {
      newState: {
        ...state,
        ballX: 50,
        ballY: 50,
        vx: (Math.random() > 0.5 ? 1 : -1) * 0.45,
        vy: -0.45, // serve towards top
        speed: 1.0,
        roundState: 'scored',
        scorerUid: topUid
      },
      scored: true,
      scorerUid: topUid,
      matchOver,
      winnerUid: matchOver ? topUid : null
    };
  }

  if (nextY <= 0) {
    // Bottom player scores!
    const updatedScores = { ...scores, [bottomUid]: (scores[bottomUid] || 0) + 1 };
    const matchOver = (updatedScores[bottomUid] || 0) >= state.targetScore;

    return {
      newState: {
        ...state,
        ballX: 50,
        ballY: 50,
        vx: (Math.random() > 0.5 ? 1 : -1) * 0.45,
        vy: 0.45, // serve towards bottom
        speed: 1.0,
        roundState: 'scored',
        scorerUid: bottomUid
      },
      scored: true,
      scorerUid: bottomUid,
      matchOver,
      winnerUid: matchOver ? bottomUid : null
    };
  }

  return {
    newState: {
      ...state,
      ballX: nextX,
      ballY: nextY,
      vx: nextVx,
      vy: nextVy,
      speed: nextSpeed,
      lastHitBy: nextHitBy
    },
    scored: false,
    scorerUid: null,
    matchOver: false,
    winnerUid: null
  };
}

export function resetPongServe(state: PongState): PongState {
  return {
    ...state,
    ballX: 50,
    ballY: 50,
    vx: (Math.random() > 0.5 ? 1 : -1) * 0.45,
    vy: (Math.random() > 0.5 ? 1 : -1) * 0.45,
    speed: 1.0,
    roundState: 'rally',
    scorerUid: null
  };
}
