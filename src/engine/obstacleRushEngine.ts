import type { ObstacleRushState, ObstaclePlayer, MovingHazard } from '../types/game';

export const COURSE_LENGTH = 2400; // total course length in pixels

export function createObstacleRushInitialState(playerUids: string[]): ObstacleRushState {
  const players: Record<string, ObstaclePlayer> = {};

  playerUids.forEach((uid, index) => {
    players[uid] = {
      uid,
      x: 150 + index * 100, // separate initial lanes
      y: 50,                // starting line
      vx: 0,
      vy: 0,
      checkpoint: 0,
      isGrounded: true,
      isStunned: false,
      stunUntil: 0,
      finishTime: null
    };
  });

  const hazards: MovingHazard[] = [
    { id: 'rot_1', type: 'rotator', trackY: 350, periodMs: 2400, width: 220, height: 24 },
    { id: 'rot_2', type: 'rotator', trackY: 550, periodMs: 2000, width: 240, height: 24 },
    { id: 'osc_1', type: 'oscillator', trackY: 850, periodMs: 1800, width: 140, height: 40 },
    { id: 'rot_3', type: 'rotator', trackY: 1200, periodMs: 2200, width: 260, height: 24 },
    { id: 'osc_2', type: 'oscillator', trackY: 1550, periodMs: 1600, width: 160, height: 40 },
    { id: 'rot_4', type: 'rotator', trackY: 1850, periodMs: 1900, width: 260, height: 24 },
  ];

  return {
    courseSeed: Math.floor(Math.random() * 1000000),
    startTime: Date.now(),
    players,
    hazards,
    finishOrder: []
  };
}

export function updateObstaclePlayerPosition(
  state: ObstacleRushState,
  playerUid: string,
  x: number,
  y: number,
  vx: number,
  vy: number
): {
  newState: ObstacleRushState;
  finished: boolean;
  winnerUid: string | null;
} {
  const player = state.players[playerUid];
  if (!player || player.finishTime !== null) {
    return { newState: state, finished: false, winnerUid: state.finishOrder[0] || null };
  }

  // Check checkpoint updates
  let checkpoint = player.checkpoint;
  if (y >= 700 && checkpoint < 1) checkpoint = 1;
  if (y >= 1400 && checkpoint < 2) checkpoint = 2;

  // Check finish line!
  let finishTime: number | null = player.finishTime;
  let nextFinishOrder = [...state.finishOrder];

  if (y >= COURSE_LENGTH && finishTime === null) {
    finishTime = Date.now();
    if (!nextFinishOrder.includes(playerUid)) {
      nextFinishOrder.push(playerUid);
    }
  }

  const updatedPlayer: ObstaclePlayer = {
    ...player,
    x,
    y,
    vx,
    vy,
    checkpoint,
    finishTime
  };

  const newState: ObstacleRushState = {
    ...state,
    players: {
      ...state.players,
      [playerUid]: updatedPlayer
    },
    finishOrder: nextFinishOrder
  };

  return {
    newState,
    finished: finishTime !== null,
    winnerUid: nextFinishOrder[0] || null
  };
}

export function triggerObstacleRespawn(state: ObstacleRushState, playerUid: string): ObstacleRushState {
  const player = state.players[playerUid];
  if (!player) return state;

  let respawnY = 50;
  if (player.checkpoint === 1) respawnY = 750;
  else if (player.checkpoint === 2) respawnY = 1450;

  return {
    ...state,
    players: {
      ...state.players,
      [playerUid]: {
        ...player,
        x: 200,
        y: respawnY,
        vx: 0,
        vy: 0,
        isStunned: false
      }
    }
  };
}
