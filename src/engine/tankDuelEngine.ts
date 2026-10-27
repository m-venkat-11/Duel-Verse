export interface TankDuelState {
  scores: Record<string, number>;
  targetScore: number;
  roundWinner: string | null;
}

export function createTankDuelInitialState(playerUids: string[], targetScore: number = 3): TankDuelState {
  const scores: Record<string, number> = {};
  playerUids.forEach((uid) => {
    scores[uid] = 0;
  });
  return {
    scores,
    targetScore,
    roundWinner: null
  };
}
