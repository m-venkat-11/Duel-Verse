import type { ConnectFourState } from '../types/game';

export const ROWS = 6;
export const COLS = 7;

export function createConnectFourInitialState(playerUids: string[]): ConnectFourState {
  const p1 = playerUids[0] || 'p1';
  const p2 = playerUids[1] || 'p2';

  // 6 rows x 7 cols initialized to null
  const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));

  return {
    grid,
    currentTurn: p1,
    colors: {
      [p1]: 'crimson',
      [p2]: 'amber'
    },
    lastMove: null,
    winningCoords: null,
    isDraw: false
  };
}

function checkFourInARow(grid: (string | null)[][]): {
  winnerUid: string | null;
  coords: [number, number][] | null;
} {
  // Check horizontal
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      const p = grid[r][c];
      if (p && p === grid[r][c + 1] && p === grid[r][c + 2] && p === grid[r][c + 3]) {
        return {
          winnerUid: p,
          coords: [[r, c], [r, c + 1], [r, c + 2], [r, c + 3]]
        };
      }
    }
  }

  // Check vertical
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r <= ROWS - 4; r++) {
      const p = grid[r][c];
      if (p && p === grid[r + 1][c] && p === grid[r + 2][c] && p === grid[r + 3][c]) {
        return {
          winnerUid: p,
          coords: [[r, c], [r + 1, c], [r + 2, c], [r + 3, c]]
        };
      }
    }
  }

  // Check diagonal down-right (\)
  for (let r = 0; r <= ROWS - 4; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      const p = grid[r][c];
      if (p && p === grid[r + 1][c + 1] && p === grid[r + 2][c + 2] && p === grid[r + 3][c + 3]) {
        return {
          winnerUid: p,
          coords: [[r, c], [r + 1, c + 1], [r + 2, c + 2], [r + 3, c + 3]]
        };
      }
    }
  }

  // Check diagonal up-right (/)
  for (let r = 3; r < ROWS; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      const p = grid[r][c];
      if (p && p === grid[r - 1][c + 1] && p === grid[r - 2][c + 2] && p === grid[r - 3][c + 3]) {
        return {
          winnerUid: p,
          coords: [[r, c], [r - 1, c + 1], [r - 2, c + 2], [r - 3, c + 3]]
        };
      }
    }
  }

  return { winnerUid: null, coords: null };
}

export function dropDisc(
  state: ConnectFourState,
  col: number,
  playerUid: string,
  playerUids: string[]
): {
  newState: ConnectFourState;
  roundOver: boolean;
  winnerUid: string | null;
  isDraw: boolean;
} {
  if (state.winningCoords !== null || state.isDraw) {
    return { newState: state, roundOver: true, winnerUid: null, isDraw: state.isDraw };
  }
  if (state.currentTurn !== playerUid) {
    return { newState: state, roundOver: false, winnerUid: null, isDraw: false };
  }
  if (col < 0 || col >= COLS) {
    return { newState: state, roundOver: false, winnerUid: null, isDraw: false };
  }

  // Find lowest unfilled row (starting from bottom row ROWS - 1)
  let targetRow = -1;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (state.grid[r][col] === null) {
      targetRow = r;
      break;
    }
  }

  if (targetRow === -1) {
    // Column full
    return { newState: state, roundOver: false, winnerUid: null, isDraw: false };
  }

  const nextGrid = state.grid.map((row) => [...row]);
  nextGrid[targetRow][col] = playerUid;

  const { winnerUid, coords } = checkFourInARow(nextGrid);
  if (winnerUid) {
    const newState: ConnectFourState = {
      ...state,
      grid: nextGrid,
      lastMove: { row: targetRow, col },
      winningCoords: coords,
      isDraw: false
    };
    return { newState, roundOver: true, winnerUid, isDraw: false };
  }

  // Check if grid is full
  const isFull = nextGrid[0].every((cell) => cell !== null);
  if (isFull) {
    const newState: ConnectFourState = {
      ...state,
      grid: nextGrid,
      lastMove: { row: targetRow, col },
      winningCoords: null,
      isDraw: true
    };
    return { newState, roundOver: true, winnerUid: null, isDraw: true };
  }

  // Next player's turn
  const nextTurn = playerUids.find((id) => id !== playerUid) || playerUid;
  const newState: ConnectFourState = {
    ...state,
    grid: nextGrid,
    currentTurn: nextTurn,
    lastMove: { row: targetRow, col },
    winningCoords: null,
    isDraw: false
  };

  return { newState, roundOver: false, winnerUid: null, isDraw: false };
}

export function getBestConnectFourMove(
  grid: (string | null)[][],
  botUid: string,
  opponentUid: string
): number {
  const openCols = [0, 1, 2, 3, 4, 5, 6].filter((c) => grid[0][c] === null);
  if (openCols.length === 0) return 3;

  const getRow = (g: (string | null)[][], c: number) => {
    for (let r = ROWS - 1; r >= 0; r--) {
      if (g[r][c] === null) return r;
    }
    return -1;
  };

  // 1. Can bot win in 1 move? Take the win!
  for (const c of openCols) {
    const r = getRow(grid, c);
    if (r !== -1) {
      grid[r][c] = botUid;
      const { winnerUid } = checkFourInARow(grid);
      grid[r][c] = null;
      if (winnerUid === botUid) return c;
    }
  }

  // 2. Can opponent win in 1 move? Block them!
  for (const c of openCols) {
    const r = getRow(grid, c);
    if (r !== -1) {
      grid[r][c] = opponentUid;
      const { winnerUid } = checkFourInARow(grid);
      grid[r][c] = null;
      if (winnerUid === opponentUid) return c;
    }
  }

  // 3. Avoid giving opponent an immediate win right above us
  const safeCols = openCols.filter((c) => {
    const r = getRow(grid, c);
    if (r > 0) {
      grid[r - 1][c] = opponentUid;
      const { winnerUid } = checkFourInARow(grid);
      grid[r - 1][c] = null;
      return winnerUid !== opponentUid;
    }
    return true;
  });

  const candidates = safeCols.length > 0 ? safeCols : openCols;
  // Center column strategic preference (column 3 is center)
  candidates.sort((a, b) => Math.abs(a - 3) - Math.abs(b - 3));
  return candidates[0];
}
