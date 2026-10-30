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
    isDraw: false,
    history: {
      [p1]: [],
      [p2]: []
    }
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
  if (state.winningLine !== null) {
    return { newState: state, roundOver: true, winnerUid: null, isDraw: false };
  }
  if (state.currentTurn !== playerUid) {
    return { newState: state, roundOver: false, winnerUid: null, isDraw: false };
  }
  if (cellIndex < 0 || cellIndex > 8 || state.board[cellIndex] !== null) {
    return { newState: state, roundOver: false, winnerUid: null, isDraw: false };
  }

  const nextBoard = [...state.board];
  const pHistory = [...(state.history?.[playerUid] || [])];

  // Infinite 3-Piece FIFO: If player already has 3 pieces, remove oldest mark!
  if (pHistory.length >= 3) {
    const oldestCell = pHistory.shift()!;
    nextBoard[oldestCell] = null;
  }

  // Place new piece
  pHistory.push(cellIndex);
  nextBoard[cellIndex] = playerUid;

  const nextHistory = {
    ...(state.history || {}),
    [playerUid]: pHistory
  };

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
      isDraw: false,
      history: nextHistory
    };
    return { newState, roundOver: true, winnerUid: playerUid, isDraw: false };
  }

  // Switch turn to other player
  const nextTurn = playerUids.find((id) => id !== playerUid) || playerUid;
  const newState: TicTacToeState = {
    ...state,
    board: nextBoard,
    currentTurn: nextTurn,
    winningLine: null,
    isDraw: false,
    history: nextHistory
  };

  return { newState, roundOver: false, winnerUid: null, isDraw: false };
}

export function getBestTicTacToeMove(
  board: (string | null)[],
  botUid: string,
  humanUid: string,
  history?: Record<string, number[]>
): number {
  const currentBoard = [...board];
  const botHist = [...(history?.[botUid] || [])];
  const humanHist = [...(history?.[humanUid] || [])];

  const openIndices = currentBoard
    .map((val, idx) => (val === null ? idx : -1))
    .filter((idx) => idx !== -1);

  if (openIndices.length === 0) return 0;

  // Check 1-move win for Bot simulating FIFO
  for (const idx of openIndices) {
    const testBoard = [...currentBoard];
    if (botHist.length >= 3) {
      testBoard[botHist[0]] = null;
    }
    testBoard[idx] = botUid;

    for (const [a, b, c] of WINNING_LINES) {
      if (testBoard[a] === botUid && testBoard[b] === botUid && testBoard[c] === botUid) {
        return idx;
      }
    }
  }

  // Check 1-move block for Human simulating FIFO
  for (const idx of openIndices) {
    const testBoard = [...currentBoard];
    if (humanHist.length >= 3) {
      testBoard[humanHist[0]] = null;
    }
    testBoard[idx] = humanUid;

    for (const [a, b, c] of WINNING_LINES) {
      if (testBoard[a] === humanUid && testBoard[b] === humanUid && testBoard[c] === humanUid) {
        return idx;
      }
    }
  }

  // Center preference
  if (currentBoard[4] === null) return 4;

  // Corners
  const corners = [0, 2, 6, 8].filter((c) => currentBoard[c] === null);
  if (corners.length > 0) {
    return corners[Math.floor(Math.random() * corners.length)];
  }

  return openIndices[Math.floor(Math.random() * openIndices.length)];
}
