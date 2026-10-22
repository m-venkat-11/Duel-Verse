import type { TicTacToeState } from '../types/game';

const WINNING_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
  [0, 4, 8], [2, 4, 6]             // Diagonals
];

export function createTicTacToeInitialState(playerUids: string[]): TicTacToeState {
  const p1 = playerUids[0] || 'p1';
  const p2 = playerUids[1] || 'p2';

  return {
    board: Array(9).fill(null),
    currentTurn: p1,
    symbols: {
      [p1]: 'X',
      [p2]: 'O'
    },
    winningLine: null,
    isDraw: false
  };
}

export function processTicTacToeMove(
  state: TicTacToeState,
  cellIndex: number,
  playerUid: string,
  playerUids: string[]
): {
  newState: TicTacToeState;
  roundOver: boolean;
  winnerUid: string | null;
  isDraw: boolean;
} {
  // Authoritative validation
  if (state.winningLine !== null || state.isDraw) {
    return { newState: state, roundOver: true, winnerUid: null, isDraw: state.isDraw };
  }
  if (state.currentTurn !== playerUid) {
    return { newState: state, roundOver: false, winnerUid: null, isDraw: false };
  }
  if (cellIndex < 0 || cellIndex > 8 || state.board[cellIndex] !== null) {
    return { newState: state, roundOver: false, winnerUid: null, isDraw: false };
  }

  const nextBoard = [...state.board];
  nextBoard[cellIndex] = playerUid;

  // Check winning lines
  let winningLine: number[] | null = null;
  for (const line of WINNING_LINES) {
    const [a, b, c] = line;
    if (nextBoard[a] && nextBoard[a] === nextBoard[b] && nextBoard[a] === nextBoard[c]) {
      winningLine = line;
      break;
    }
  }

  if (winningLine) {
    const newState: TicTacToeState = {
      ...state,
      board: nextBoard,
      winningLine,
      isDraw: false
    };
    return { newState, roundOver: true, winnerUid: playerUid, isDraw: false };
  }

  // Check draw (all cells filled)
  const isDraw = nextBoard.every((c) => c !== null);
  if (isDraw) {
    const newState: TicTacToeState = {
      ...state,
      board: nextBoard,
      winningLine: null,
      isDraw: true
    };
    return { newState, roundOver: true, winnerUid: null, isDraw: true };
  }

  // Switch turn to other player
  const nextTurn = playerUids.find((id) => id !== playerUid) || playerUid;
  const newState: TicTacToeState = {
    ...state,
    board: nextBoard,
    currentTurn: nextTurn,
    winningLine: null,
    isDraw: false
  };

  return { newState, roundOver: false, winnerUid: null, isDraw: false };
}
