import { describe, it, expect } from 'vitest';
import {
  createTicTacToeInitialState,
  processTicTacToeMove
} from '../tictactoeEngine';
import {
  createRPSInitialState,
  commitRPSChoice,
  evaluateRPSWinner
} from '../rpsEngine';
import {
  createConnectFourInitialState,
  dropDisc
} from '../connectFourEngine';
import {
  createReactionRushInitialState,
  registerReactionTap
} from '../reactionRushEngine';

describe('Authoritative Game Engines', () => {
  // 1. Tic-Tac-Toe Tests
  describe('Tic-Tac-Toe Duel', () => {
    const p1 = 'player_1';
    const p2 = 'player_2';

    it('initializes with empty 9-cell board and player 1 turn', () => {
      const state = createTicTacToeInitialState([p1, p2]);
      expect(state.board).toHaveLength(9);
      expect(state.board.every((c) => c === null)).toBe(true);
      expect(state.currentTurn).toBe(p1);
      expect(state.symbols[p1]).toBe('X');
      expect(state.symbols[p2]).toBe('O');
    });

    it('rejects moves when it is not the active player turn', () => {
      const state = createTicTacToeInitialState([p1, p2]);
      const res = processTicTacToeMove(state, 0, p2, [p1, p2]);
      expect(res.newState.board[0]).toBe(null);
      expect(res.roundOver).toBe(false);
    });

    it('detects horizontal win for Player 1', () => {
      let state = createTicTacToeInitialState([p1, p2]);
      // P1: 0, P2: 3, P1: 1, P2: 4, P1: 2 (P1 wins top row 0, 1, 2)
      let res = processTicTacToeMove(state, 0, p1, [p1, p2]);
      res = processTicTacToeMove(res.newState, 3, p2, [p1, p2]);
      res = processTicTacToeMove(res.newState, 1, p1, [p1, p2]);
      res = processTicTacToeMove(res.newState, 4, p2, [p1, p2]);
      res = processTicTacToeMove(res.newState, 2, p1, [p1, p2]);

      expect(res.roundOver).toBe(true);
      expect(res.winnerUid).toBe(p1);
      expect(res.newState.winningLine).toEqual([0, 1, 2]);
    });

    it('detects a draw when board is full and no winner', () => {
      let state = createTicTacToeInitialState([p1, p2]);
      // Pattern:
      // X O X
      // X O O
      // O X X
      const moves = [
        [0, p1], [1, p2],
        [2, p1], [4, p2],
        [3, p1], [5, p2],
        [7, p1], [6, p2],
        [8, p1]
      ] as const;

      let lastRes: { newState: typeof state; roundOver: boolean; winnerUid: string | null; isDraw: boolean } = {
        newState: state,
        roundOver: false,
        winnerUid: null,
        isDraw: false
      };
      for (const [cell, player] of moves) {
        lastRes = processTicTacToeMove(lastRes.newState, cell, player, [p1, p2]);
      }

      expect(lastRes.roundOver).toBe(true);
      expect(lastRes.isDraw).toBe(true);
      expect(lastRes.winnerUid).toBe(null);
    });
  });

  // 2. Rock Paper Scissors Tests
  describe('Rock Paper Scissors (Two-Phase Commit)', () => {
    const p1 = 'alice';
    const p2 = 'bob';

    it('evaluates choices correctly', () => {
      expect(evaluateRPSWinner('rock', 'scissors', p1, p2)).toBe(p1);
      expect(evaluateRPSWinner('scissors', 'paper', p1, p2)).toBe(p1);
      expect(evaluateRPSWinner('paper', 'rock', p1, p2)).toBe(p1);
      expect(evaluateRPSWinner('rock', 'paper', p1, p2)).toBe(p2);
      expect(evaluateRPSWinner('paper', 'paper', p1, p2)).toBe('draw');
    });

    it('masks choices until both players commit', () => {
      const state = createRPSInitialState([p1, p2], 3);
      // P1 commits
      const res1 = commitRPSChoice(state, p1, 'rock', [p1, p2]);
      expect(res1.newState.commits[p1]).toBe('COMMITTED');
      expect(res1.roundOver).toBe(false);

      // P2 commits -> reveals and evaluates!
      const res2 = commitRPSChoice(res1.newState, p2, 'scissors', [p1, p2]);
      expect(res2.roundOver).toBe(true);
      expect(res2.roundWinnerUid).toBe(p1);
      expect(res2.newState.roundScores[p1]).toBe(1);
    });
  });

  // 3. Connect Four Tests
  describe('Connect Four', () => {
    const p1 = 'player_crimson';
    const p2 = 'player_amber';

    it('drops disc to the lowest row in column (gravity physics)', () => {
      const state = createConnectFourInitialState([p1, p2]);
      // Drop column 3 -> should land on row 5 (bottom)
      const res1 = dropDisc(state, 3, p1, [p1, p2]);
      expect(res1.newState.grid[5][3]).toBe(p1);
      expect(res1.newState.currentTurn).toBe(p2);

      // Drop column 3 again -> should land on row 4
      const res2 = dropDisc(res1.newState, 3, p2, [p1, p2]);
      expect(res2.newState.grid[4][3]).toBe(p2);
    });

    it('detects vertical 4-in-a-row victory', () => {
      let state = createConnectFourInitialState([p1, p2]);
      // P1 drops col 0, P2 drops col 1, four times
      let res = dropDisc(state, 0, p1, [p1, p2]);
      res = dropDisc(res.newState, 1, p2, [p1, p2]);
      res = dropDisc(res.newState, 0, p1, [p1, p2]);
      res = dropDisc(res.newState, 1, p2, [p1, p2]);
      res = dropDisc(res.newState, 0, p1, [p1, p2]);
      res = dropDisc(res.newState, 1, p2, [p1, p2]);
      res = dropDisc(res.newState, 0, p1, [p1, p2]); // 4th in column 0!

      expect(res.roundOver).toBe(true);
      expect(res.winnerUid).toBe(p1);
      expect(res.newState.winningCoords).toHaveLength(4);
    });
  });

  // 4. Reaction Rush Tests
  describe('Reaction Rush', () => {
    const p1 = 'flash';
    const p2 = 'sonic';

    it('penalizes false starts prior to signal', () => {
      const state = createReactionRushInitialState([p1, p2], 3);
      const tapEarly = state.signalScheduledAt - 500; // 500ms before signal
      const res = registerReactionTap(state, p1, tapEarly, [p1, p2]);

      expect(res.roundOver).toBe(true);
      expect(res.roundWinnerUid).toBe(p2); // opponent automatically awarded win
      expect(res.newState.falseStarts[p1]).toBe(true);
    });

    it('records valid millisecond reaction delta', () => {
      const state = createReactionRushInitialState([p1, p2], 3);
      const tapLegal = state.signalScheduledAt + 240; // 240ms reaction time
      const res = registerReactionTap(state, p1, tapLegal, [p1, p2]);

      expect(res.roundOver).toBe(true);
      expect(res.roundWinnerUid).toBe(p1);
      expect(res.newState.reactionTimes[p1]).toBe(240);
    });
  });
});
