export interface RunnerHazard {
  id: number;
  distance: number; // in meters (0 to 1000)
  lane: number; // 0 (left), 1 (center), 2 (right)
  type: 'barrier' | 'emp' | 'boost';
}

export interface RunnerPlayer {
  uid: string;
  lane: number; // 0, 1, 2
  distance: number; // meters traveled (0 to 1000)
  speed: number;
  stumbledUntil: number;
  finished: boolean;
  finishTime: number | null;
}

export interface ObstacleRushState {
  courseLength: number; // 1000m
  players: Record<string, RunnerPlayer>;
  hazards: RunnerHazard[];
  startTime: number;
  winnerUid: string | null;
  targetWins: number;
  scores: Record<string, number>;
}

export function createObstacleRushInitialState(playerUids: string[], targetWins: number = 3): ObstacleRushState {
  const players: Record<string, RunnerPlayer> = {};
  const scores: Record<string, number> = {};

  playerUids.forEach((uid) => {
    players[uid] = {
      uid,
      lane: 1, // center
      distance: 0,
      speed: 18, // m/s
      stumbledUntil: 0,
      finished: false,
      finishTime: null
    };
    scores[uid] = 0;
  });

  // Generate deterministic course hazards from 50m to 950m
  const hazards: RunnerHazard[] = [];
  let hId = 1;
  for (let dist = 60; dist < 940; dist += 45) {
    const lane = (dist * 7 + 3) % 3;
    const isBoost = (dist % 90) === 0;
    hazards.push({
      id: hId++,
      distance: dist,
      lane,
      type: isBoost ? 'boost' : (dist % 120 === 0 ? 'emp' : 'barrier')
    });
  }

  return {
    courseLength: 1000,
    players,
    hazards,
    startTime: Date.now() + 1000,
    winnerUid: null,
    targetWins,
    scores
  };
}

export function switchRunnerLane(
  state: ObstacleRushState,
  playerUid: string,
  targetLane: number
): ObstacleRushState {
  const p = state.players[playerUid];
  if (!p || p.finished) return state;

  const validLane = Math.max(0, Math.min(2, targetLane));
  return {
    ...state,
    players: {
      ...state.players,
      [playerUid]: {
        ...p,
        lane: validLane
      }
    }
  };
}

export function registerRunnerFinish(
  state: ObstacleRushState,
  winnerUid: string
): {
  newState: ObstacleRushState;
  matchOver: boolean;
  matchWinnerUid: string | null;
} {
  const nextScores = {
    ...state.scores,
    [winnerUid]: (state.scores[winnerUid] || 0) + 1
  };
  const matchOver = nextScores[winnerUid] >= state.targetWins;

  return {
    newState: {
      ...state,
      winnerUid,
      scores: nextScores,
      players: {
        ...state.players,
        [winnerUid]: {
          ...state.players[winnerUid],
          finished: true,
          finishTime: Date.now()
        }
      }
    },
    matchOver,
    matchWinnerUid: matchOver ? winnerUid : null
  };
}
