export interface Cyber2048State {
  grid: number[][]; // 4x4 grid (0 = empty)
  score: number;
  bestScore: number;
  previousGrid?: number[][];
  previousScore?: number;
  canUndo: boolean;
  won: boolean;
  gameOver: boolean;
  keepPlaying: boolean;
}

export function createCyber2048InitialState(): Cyber2048State {
  const savedBest = typeof window !== 'undefined'
    ? parseInt(localStorage.getItem('duelverse_2048_best') || '0', 10)
    : 0;

  let grid = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ];

  grid = spawnRandomTile(grid);
  grid = spawnRandomTile(grid);

  return {
    grid,
    score: 0,
    bestScore: savedBest,
    canUndo: false,
    won: false,
    gameOver: false,
    keepPlaying: false
  };
}

export function spawnRandomTile(grid: number[][]): number[][] {
  const emptyCells: { r: number; c: number }[] = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (grid[r][c] === 0) emptyCells.push({ r, c });
    }
  }

  if (emptyCells.length === 0) return grid;

  const chosen = emptyCells[Math.floor(Math.random() * emptyCells.length)];
  const val = Math.random() < 0.9 ? 2 : 4;

  const newGrid = grid.map((row) => [...row]);
  newGrid[chosen.r][chosen.c] = val;
  return newGrid;
}

export function move2048(
  state: Cyber2048State,
  direction: 'left' | 'right' | 'up' | 'down'
): {
  newState: Cyber2048State;
  moved: boolean;
  mergedValues: number[];
} {
  const currentGrid = state.grid.map((r) => [...r]);
  const mergedValues: number[] = [];
  let pointsAdded = 0;

  // Helper to slide and merge a single row of 4 numbers
  const slideRow = (row: number[]): number[] => {
    let filtered = row.filter((val) => val !== 0);
    for (let i = 0; i < filtered.length - 1; i++) {
      if (filtered[i] === filtered[i + 1]) {
        filtered[i] *= 2;
        pointsAdded += filtered[i];
        mergedValues.push(filtered[i]);
        filtered[i + 1] = 0;
        i++;
      }
    }
    filtered = filtered.filter((val) => val !== 0);
    while (filtered.length < 4) {
      filtered.push(0);
    }
    return filtered;
  };

  let nextGrid: number[][] = [];

  if (direction === 'left') {
    nextGrid = currentGrid.map((row) => slideRow(row));
  } else if (direction === 'right') {
    nextGrid = currentGrid.map((row) => slideRow([...row].reverse()).reverse());
  } else if (direction === 'up') {
    // Transpose, slide left, transpose back
    const transposed: number[][] = [[], [], [], []];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        transposed[c][r] = currentGrid[r][c];
      }
    }
    const slid = transposed.map((row) => slideRow(row));
    nextGrid = [[], [], [], []];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        nextGrid[c][r] = slid[r][c];
      }
    }
  } else if (direction === 'down') {
    const transposed: number[][] = [[], [], [], []];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        transposed[c][r] = currentGrid[r][c];
      }
    }
    const slid = transposed.map((row) => slideRow([...row].reverse()).reverse());
    nextGrid = [[], [], [], []];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        nextGrid[c][r] = slid[r][c];
      }
    }
  }

  // Check if grid actually moved
  let hasMoved = false;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (currentGrid[r][c] !== nextGrid[r][c]) {
        hasMoved = true;
        break;
      }
    }
  }

  if (!hasMoved) {
    return { newState: state, moved: false, mergedValues: [] };
  }

  // Spawn new random tile in open cell
  const gridWithSpawn = spawnRandomTile(nextGrid);
  const newScore = state.score + pointsAdded;
  const newBest = Math.max(state.bestScore, newScore);

  if (typeof window !== 'undefined' && newBest > state.bestScore) {
    localStorage.setItem('duelverse_2048_best', newBest.toString());
  }

  // Check 2048 win
  let won = state.won;
  if (!won && !state.keepPlaying) {
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (gridWithSpawn[r][c] >= 2048) won = true;
      }
    }
  }

  // Check gameover (no moves possible)
  const gameOver = isGameOver(gridWithSpawn);

  return {
    newState: {
      grid: gridWithSpawn,
      score: newScore,
      bestScore: newBest,
      previousGrid: currentGrid,
      previousScore: state.score,
      canUndo: true,
      won,
      gameOver,
      keepPlaying: state.keepPlaying
    },
    moved: true,
    mergedValues
  };
}

export function isGameOver(grid: number[][]): boolean {
  // Empty cell available
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (grid[r][c] === 0) return false;
    }
  }

  // Adjacent equal neighbors
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const val = grid[r][c];
      if (r < 3 && grid[r + 1][c] === val) return false;
      if (c < 3 && grid[r][c + 1] === val) return false;
    }
  }

  return true;
}

export function undo2048Move(state: Cyber2048State): Cyber2048State {
  if (!state.canUndo || !state.previousGrid) return state;

  return {
    ...state,
    grid: state.previousGrid,
    score: state.previousScore || 0,
    canUndo: false,
    gameOver: false
  };
}
