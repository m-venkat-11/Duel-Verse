export type SudokuDifficulty = 'casual' | 'tactical' | 'hacker' | 'master';

export interface SudokuCell {
  row: number;
  col: number;
  value: number; // 0 = empty, 1..9
  solution: number;
  initial: boolean;
  notes: number[];
  error?: boolean;
}

export interface CyberSudokuState {
  grid: SudokuCell[][]; // 9x9
  difficulty: SudokuDifficulty;
  mistakes: number;
  maxMistakes: number;
  timeSeconds: number;
  completed: boolean;
  canUndo: boolean;
  history: { row: number; col: number; prevValue: number; prevNotes: number[] }[];
}

// Generate valid completed 9x9 board using backtracking
function generateSolution(): number[][] {
  const board: number[][] = Array(9).fill(0).map(() => Array(9).fill(0));

  const isValid = (r: number, c: number, num: number): boolean => {
    for (let i = 0; i < 9; i++) {
      if (board[r][i] === num || board[i][c] === num) return false;
    }
    const boxR = Math.floor(r / 3) * 3;
    const boxC = Math.floor(c / 3) * 3;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (board[boxR + i][boxC + j] === num) return false;
      }
    }
    return true;
  };

  const solve = (): boolean => {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] === 0) {
          const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => Math.random() - 0.5);
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
  return board;
}

export function createCyberSudokuInitialState(difficulty: SudokuDifficulty = 'casual'): CyberSudokuState {
  const solution = generateSolution();

  // Number of clues based on difficulty
  const cluesMap: Record<SudokuDifficulty, number> = {
    casual: 38,
    tactical: 30,
    hacker: 25,
    master: 21
  };
  const clues = cluesMap[difficulty];

  // Remove cells to create puzzle
  const puzzle = solution.map((row) => [...row]);
  let removed = 81 - clues;

  const positions: [number, number][] = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      positions.push([r, c]);
    }
  }
  positions.sort(() => Math.random() - 0.5);

  for (let i = 0; i < removed && i < positions.length; i++) {
    const [r, c] = positions[i];
    puzzle[r][c] = 0;
  }

  const grid: SudokuCell[][] = [];
  for (let r = 0; r < 9; r++) {
    const row: SudokuCell[] = [];
    for (let c = 0; c < 9; c++) {
      const isInitial = puzzle[r][c] !== 0;
      row.push({
        row: r,
        col: c,
        value: puzzle[r][c],
        solution: solution[r][c],
        initial: isInitial,
        notes: [],
        error: false
      });
    }
    grid.push(row);
  }

  return {
    grid,
    difficulty,
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
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (nextGrid[r][c].value !== nextGrid[r][c].solution) {
        allFilledAndCorrect = false;
        break;
      }
    }
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
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
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
