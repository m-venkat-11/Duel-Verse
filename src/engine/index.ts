import { createTicTacToeInitialState } from './tictactoeEngine';
import { createRPSInitialState } from './rpsEngine';
import { createConnectFourInitialState } from './connectFourEngine';
import { createReactionRushInitialState } from './reactionRushEngine';
import { createPongInitialState } from './pongEngine';
import { createObstacleRushInitialState } from './obstacleRushEngine';
import { createMemoryMatchInitialState } from './memoryMatchEngine';
import { createNumberBlitzInitialState } from './numberBlitzEngine';
import { createTapFrenzyInitialState } from './tapFrenzyEngine';

export function initializeGameState(gameId: string, playerUids: string[]): any {
  switch (gameId) {
    case 'tictactoe':
      return createTicTacToeInitialState(playerUids);
    case 'rps':
      return createRPSInitialState(playerUids, 3);
    case 'connectfour':
      return createConnectFourInitialState(playerUids);
    case 'reactionrush':
      return createReactionRushInitialState(playerUids, 3);
    case 'pong':
      return createPongInitialState(playerUids, 5);
    case 'obstaclerush':
      return createObstacleRushInitialState(playerUids);
    case 'memorymatch':
      return createMemoryMatchInitialState(playerUids);
    case 'numberblitz':
      return createNumberBlitzInitialState(playerUids, 45);
    case 'tapfrenzy':
      return createTapFrenzyInitialState(playerUids, 30);
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
