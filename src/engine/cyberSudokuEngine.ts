export type SudokuDifficulty = 'casual' | 'tactical' | 'hacker' | 'master';
export type SudokuVariant = 'classic' | 'mini6x6' | 'diagonalX';

export interface SudokuCell {
  row: number;
  col: number;
  value: number; // 0 = empty, 1..size
  solution: number;
  initial: boolean;
  notes: number[];
  error?: boolean;
  isDiagonal?: boolean;
}

export interface CyberSudokuState {
  grid: SudokuCell[][]; // 9x9 or 6x6
  size: number; // 9 or 6
  boxRows: number; // 3 or 2
  boxCols: number; // 3
  difficulty: SudokuDifficulty;
  variant: SudokuVariant;
  mistakes: number;
  maxMistakes: number;
  timeSeconds: number;
  completed: boolean;
  canUndo: boolean;
  history: { row: number; col: number; prevValue: number; prevNotes: number[] }[];
}

// Generate valid completed board using backtracking
function generateSolution(variant: SudokuVariant): { board: number[][]; size: number; boxRows: number; boxCols: number } {
  const is6x6 = variant === 'mini6x6';
  const size = is6x6 ? 6 : 9;
  const boxRows = is6x6 ? 2 : 3;
  const boxCols = 3;

  const board: number[][] = Array(size).fill(0).map(() => Array(size).fill(0));

  const isValid = (r: number, c: number, num: number): boolean => {
    // Check row and column
    for (let i = 0; i < size; i++) {
      if (board[r][i] === num || board[i][c] === num) return false;
    }
    // Check box
    const boxR = Math.floor(r / boxRows) * boxRows;
    const boxC = Math.floor(c / boxCols) * boxCols;
    for (let i = 0; i < boxRows; i++) {
      for (let j = 0; j < boxCols; j++) {
        if (board[boxR + i][boxC + j] === num) return false;
      }
    }
    // Diagonal X check
    if (variant === 'diagonalX') {
      if (r === c) {
        for (let i = 0; i < 9; i++) {
          if (board[i][i] === num) return false;
        }
      }
      if (r + c === 8) {
        for (let i = 0; i < 9; i++) {
          if (board[i][8 - i] === num) return false;
        }
      }
    }
    return true;
  };

  const solve = (): boolean => {
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (board[r][c] === 0) {
          const numbers = Array.from({ length: size }, (_, i) => i + 1).sort(() => Math.random() - 0.5);
          for (const num of numbers) {
            if (isValid(r, c, num)) {
              board[r][c] = num;
              if (solve()) return true;
              board[r][c] = 0;
            }
          }
          return false;
        }
      }
    }
    return true;
  };

  solve();
  return { board, size, boxRows, boxCols };
}

export function createCyberSudokuInitialState(
  difficulty: SudokuDifficulty = 'casual',
  variant: SudokuVariant = 'classic'
): CyberSudokuState {
  const { board: solution, size, boxRows, boxCols } = generateSolution(variant);

  // Clues calculation
  let clues: number;
  if (size === 6) {
    // 36 total cells
    const clues6Map: Record<SudokuDifficulty, number> = {
      casual: 20,
      tactical: 16,
      hacker: 13,
      master: 11
    };
    clues = clues6Map[difficulty];
  } else {
    // 81 total cells
    const clues9Map: Record<SudokuDifficulty, number> = {
      casual: 38,
      tactical: 30,
      hacker: 25,
      master: 21
    };
    clues = clues9Map[difficulty];
  }

  // Remove cells to create puzzle
  const puzzle = solution.map((row) => [...row]);
  const totalCells = size * size;
  const removed = totalCells - clues;

  const positions: [number, number][] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      positions.push([r, c]);
    }
  }
  positions.sort(() => Math.random() - 0.5);

  for (let i = 0; i < removed && i < positions.length; i++) {
    const [r, c] = positions[i];
    puzzle[r][c] = 0;
  }

  const grid: SudokuCell[][] = [];
  for (let r = 0; r < size; r++) {
    const row: SudokuCell[] = [];
    for (let c = 0; c < size; c++) {
      const isInitial = puzzle[r][c] !== 0;
      const isDiagonal = variant === 'diagonalX' && (r === c || r + c === size - 1);
      row.push({
        row: r,
        col: c,
        value: puzzle[r][c],
        solution: solution[r][c],
        initial: isInitial,
        notes: [],
        error: false,
        isDiagonal
      });
    }
    grid.push(row);
  }

  return {
    grid,
    size,
    boxRows,
    boxCols,
    difficulty,
    variant,
    mistakes: 0,
    maxMistakes: 3,
    timeSeconds: 0,
    completed: false,
    canUndo: false,
    history: []
  };
}

export function placeSudokuNumber(
  state: CyberSudokuState,
  row: number,
  col: number,
  value: number,
  isNoteMode: boolean = false
): {
  newState: CyberSudokuState;
  correct: boolean;
  gameCompleted: boolean;
} {
  const cell = state.grid[row][col];
  if (cell.initial) return { newState: state, correct: true, gameCompleted: false };

  const nextGrid = state.grid.map((r) => r.map((c) => ({ ...c, notes: [...c.notes] })));
  const target = nextGrid[row][col];

  // Note mode toggle
  if (isNoteMode) {
    if (value === 0) {
      target.notes = [];
    } else {
      if (target.notes.includes(value)) {
        target.notes = target.notes.filter((n) => n !== value);
      } else {
        target.notes = [...target.notes, value].sort();
      }
    }
    return {
      newState: {
        ...state,
        grid: nextGrid,
        canUndo: true,
        history: [...state.history, { row, col, prevValue: cell.value, prevNotes: cell.notes }]
      },
      correct: true,
      gameCompleted: false
    };
  }

  // Clear value
  if (value === 0) {
    target.value = 0;
    target.error = false;
    return {
      newState: {
        ...state,
        grid: nextGrid,
        canUndo: true,
        history: [...state.history, { row, col, prevValue: cell.value, prevNotes: cell.notes }]
      },
      correct: true,
      gameCompleted: false
    };
  }

  // Value placement
  const isCorrect = value === target.solution;
  target.value = value;
  target.notes = [];
  target.error = !isCorrect;

  const nextMistakes = !isCorrect ? state.mistakes + 1 : state.mistakes;

  // Check completion
  let allFilledAndCorrect = true;
  for (let r = 0; r < state.size; r++) {
    for (let c = 0; c < state.size; c++) {
      if (nextGrid[r][c].value !== nextGrid[r][c].solution) {
        allFilledAndCorrect = false;
        break;
      }
    }
    if (!allFilledAndCorrect) break;
  }

  return {
    newState: {
      ...state,
      grid: nextGrid,
      mistakes: nextMistakes,
      completed: allFilledAndCorrect,
      canUndo: true,
      history: [...state.history, { row, col, prevValue: cell.value, prevNotes: cell.notes }]
    },
    correct: isCorrect,
    gameCompleted: allFilledAndCorrect
  };
}

export function undoSudoku(state: CyberSudokuState): CyberSudokuState {
  if (state.history.length === 0) return state;

  const nextHistory = [...state.history];
  const lastAction = nextHistory.pop()!;

  const nextGrid = state.grid.map((r) => r.map((c) => ({ ...c, notes: [...c.notes] })));
  const cell = nextGrid[lastAction.row][lastAction.col];
  cell.value = lastAction.prevValue;
  cell.notes = lastAction.prevNotes;
  cell.error = cell.value !== 0 && cell.value !== cell.solution;

  return {
    ...state,
    grid: nextGrid,
    history: nextHistory,
    canUndo: nextHistory.length > 0
  };
}

export function revealHint(state: CyberSudokuState): CyberSudokuState {
  const emptyCells: { r: number; c: number }[] = [];
  for (let r = 0; r < state.size; r++) {
    for (let c = 0; c < state.size; c++) {
      if (state.grid[r][c].value !== state.grid[r][c].solution) {
        emptyCells.push({ r, c });
      }
    }
  }

  if (emptyCells.length === 0) return state;

  const chosen = emptyCells[Math.floor(Math.random() * emptyCells.length)];
  const nextGrid = state.grid.map((r) => r.map((c) => ({ ...c, notes: [...c.notes] })));
  const cell = nextGrid[chosen.r][chosen.c];
  cell.value = cell.solution;
  cell.notes = [];
  cell.error = false;
  cell.initial = true; // Lock hint cell

  return {
    ...state,
    grid: nextGrid
  };
}
