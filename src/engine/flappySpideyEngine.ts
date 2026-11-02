export interface SpideyObstacle {
  id: string;
  x: number;
  width: number;
  topHeight: number;
  gap: number;
  passed: boolean;
  hasReactor: boolean;
  reactorY?: number;
  reactorCollected?: boolean;
}

export interface FlappySpideyState {
  playerUid: string;
  phase: 'ready' | 'playing' | 'gameover';
  score: number;
  highScore: number;
  distance: number;
  scores: Record<string, number>;
  targetScore: number;
}

export function createFlappySpideyInitialState(playerUids: string[], targetScore: number = 3): FlappySpideyState {
  const p1 = playerUids[0] || 'p1';
  const savedHigh = typeof window !== 'undefined' ? parseInt(localStorage.getItem('duelverse_spidey_high') || '0', 10) : 0;

  return {
    playerUid: p1,
    phase: 'ready',
    score: 0,
    highScore: savedHigh,
    distance: 0,
    scores: { [p1]: 0 },
    targetScore
  };
}
