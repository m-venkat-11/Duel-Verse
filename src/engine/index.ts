import { createTicTacToeInitialState } from './tictactoeEngine';
import { createRPSInitialState } from './rpsEngine';
import { createConnectFourInitialState } from './connectFourEngine';
import { createReactionRushInitialState } from './reactionRushEngine';
import { createPongInitialState } from './pongEngine';
import { createObstacleRushInitialState } from './obstacleRushEngine';
import { createMemoryMatchInitialState } from './memoryMatchEngine';
import { createNumberBlitzInitialState } from './numberBlitzEngine';
import { createTapFrenzyInitialState } from './tapFrenzyEngine';
import { createTankDuelInitialState } from './tankDuelEngine';
import { createSlapDuelInitialState } from './slapDuelEngine';
import { createKnifeMasterInitialState } from './knifeMasterEngine';
import { createSumoSpinInitialState } from './sumoSpinEngine';

export function initializeGameState(gameId: string, playerUids: string[], targetScore: number = 3): any {
  switch (gameId) {
    case 'tictactoe':
      return createTicTacToeInitialState(playerUids);
    case 'rps':
      return createRPSInitialState(playerUids, targetScore);
    case 'connectfour':
      return createConnectFourInitialState(playerUids);
    case 'reactionrush':
      return createReactionRushInitialState(playerUids, targetScore);
    case 'pong':
      return createPongInitialState(playerUids, targetScore);
    case 'obstaclerush':
      return createObstacleRushInitialState(playerUids, targetScore);
    case 'memorymatch':
      return createMemoryMatchInitialState(playerUids);
    case 'numberblitz':
      return createNumberBlitzInitialState(playerUids, 45);
    case 'tapfrenzy':
      return createTapFrenzyInitialState(playerUids, targetScore);
    case 'tankduel':
      return createTankDuelInitialState(playerUids, targetScore);
    case 'slapduel':
      return createSlapDuelInitialState(playerUids, targetScore);
    case 'knifemaster':
      return createKnifeMasterInitialState(playerUids, targetScore);
    case 'sumospin':
      return createSumoSpinInitialState(playerUids, targetScore);
    default:
      return createTicTacToeInitialState(playerUids);
  }
}

export * from './tictactoeEngine';
export * from './rpsEngine';
export * from './connectFourEngine';
export * from './reactionRushEngine';
export * from './pongEngine';
export * from './obstacleRushEngine';
export * from './memoryMatchEngine';
export * from './numberBlitzEngine';
export * from './tapFrenzyEngine';
export * from './tankDuelEngine';
export * from './slapDuelEngine';
export * from './knifeMasterEngine';
export * from './sumoSpinEngine';
