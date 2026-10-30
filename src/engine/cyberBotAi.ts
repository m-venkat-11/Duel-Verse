// CyberBot Master AI Engine: High-performance, tactical, and adaptive game AI
// Supports 3 distinct difficulty tiers: 'casual' | 'pro' | 'master'

export type BotDifficulty = 'casual' | 'pro' | 'master';

export interface BotSpeech {
  text: string;
  mood: 'neutral' | 'thinking' | 'confident' | 'surprised' | 'defeated';
}

// -------------------------------------------------------------
// 1. TIC-TAC-TOE AI (Unbeatable Minimax for Master, Tactical for Pro)
// -------------------------------------------------------------
const TTT_WINNING_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

function checkTTTWinner(board: (string | null)[]): string | null {
  for (const [a, b, c] of TTT_WINNING_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return null;
}

function minimaxTTT(
  board: (string | null)[],
  depth: number,
  isMaximizing: boolean,
  botUid: string,
  humanUid: string
): number {
  const winner = checkTTTWinner(board);
  if (winner === botUid) return 10 - depth;
  if (winner === humanUid) return depth - 10;
  if (board.every((c) => c !== null)) return 0;

  if (isMaximizing) {
    let bestScore = -Infinity;
    for (let i = 0; i < 9; i++) {
      if (board[i] === null) {
        board[i] = botUid;
        const score = minimaxTTT(board, depth + 1, false, botUid, humanUid);
        board[i] = null;
        bestScore = Math.max(score, bestScore);
      }
    }
    return bestScore;
  } else {
    let bestScore = Infinity;
    for (let i = 0; i < 9; i++) {
      if (board[i] === null) {
        board[i] = humanUid;
        const score = minimaxTTT(board, depth + 1, true, botUid, humanUid);
        board[i] = null;
        bestScore = Math.min(score, bestScore);
      }
    }
    return bestScore;
  }
}

export function getCyberBotTicTacToeMove(
  board: (string | null)[],
  botUid: string,
  humanUid: string,
  difficulty: BotDifficulty = 'pro',
  history?: Record<string, number[]>
): number {
  const openIndices = board
    .map((val, idx) => (val === null ? idx : -1))
    .filter((idx) => idx !== -1);

  if (openIndices.length === 0) return -1;
  if (openIndices.length === 9) {
    // First move: center or corner
    return Math.random() < 0.7 ? 4 : [0, 2, 6, 8][Math.floor(Math.random() * 4)];
  }

  // Casual: 50% random, 50% win/block
  if (difficulty === 'casual' && Math.random() < 0.5) {
    return openIndices[Math.floor(Math.random() * openIndices.length)];
  }

  const botHist = [...(history?.[botUid] || [])];
  const humanHist = [...(history?.[humanUid] || [])];

  // Check 1-move win for Bot (accounting for FIFO removal)
  for (const idx of openIndices) {
    const testBoard = [...board];
    if (botHist.length >= 3) {
      testBoard[botHist[0]] = null;
    }
    testBoard[idx] = botUid;
    if (checkTTTWinner(testBoard) === botUid) {
      return idx;
    }
  }

  // Check 1-move block for Human (accounting for FIFO removal)
  for (const idx of openIndices) {
    const testBoard = [...board];
    if (humanHist.length >= 3) {
      testBoard[humanHist[0]] = null;
    }
    testBoard[idx] = humanUid;
    if (checkTTTWinner(testBoard) === humanUid) {
      return idx;
    }
  }

  // Pro & Master: Center -> Corners -> Edges
  if (board[4] === null) return 4;
  const corners = [0, 2, 6, 8].filter((c) => board[c] === null);
  if (corners.length > 0) {
    return corners[Math.floor(Math.random() * corners.length)];
  }

  return openIndices[Math.floor(Math.random() * openIndices.length)];
}

// -------------------------------------------------------------
// 2. CONNECT FOUR AI (Tactical Multi-step Lookahead)
// -------------------------------------------------------------
const C4_ROWS = 6;
const C4_COLS = 7;

function checkC4FourInRow(grid: (string | null)[][]): string | null {
  // Horizontal
  for (let r = 0; r < C4_ROWS; r++) {
    for (let c = 0; c <= C4_COLS - 4; c++) {
      const p = grid[r][c];
      if (p && p === grid[r][c + 1] && p === grid[r][c + 2] && p === grid[r][c + 3]) return p;
    }
  }
  // Vertical
  for (let c = 0; c < C4_COLS; c++) {
    for (let r = 0; r <= C4_ROWS - 4; r++) {
      const p = grid[r][c];
      if (p && p === grid[r + 1][c] && p === grid[r + 2][c] && p === grid[r + 3][c]) return p;
    }
  }
  // Diagonal down-right
  for (let r = 0; r <= C4_ROWS - 4; r++) {
    for (let c = 0; c <= C4_COLS - 4; c++) {
      const p = grid[r][c];
      if (p && p === grid[r + 1][c + 1] && p === grid[r + 2][c + 2] && p === grid[r + 3][c + 3]) return p;
    }
  }
  // Diagonal up-right
  for (let r = 3; r < C4_ROWS; r++) {
    for (let c = 0; c <= C4_COLS - 4; c++) {
      const p = grid[r][c];
      if (p && p === grid[r - 1][c + 1] && p === grid[r - 2][c + 2] && p === grid[r - 3][c + 3]) return p;
    }
  }
  return null;
}

export function getCyberBotConnectFourMove(
  grid: (string | null)[][],
  botUid: string,
  humanUid: string,
  difficulty: BotDifficulty = 'pro'
): number {
  const openCols = [0, 1, 2, 3, 4, 5, 6].filter((c) => grid[0][c] === null);
  if (openCols.length === 0) return 3;

  const getLowestRow = (g: (string | null)[][], col: number) => {
    for (let r = C4_ROWS - 1; r >= 0; r--) {
      if (g[r][col] === null) return r;
    }
    return -1;
  };

  // 1. Can Bot win right now?
  for (const c of openCols) {
    const r = getLowestRow(grid, c);
    if (r !== -1) {
      grid[r][c] = botUid;
      const win = checkC4FourInRow(grid);
      grid[r][c] = null;
      if (win === botUid) return c;
    }
  }

  // 2. Can Human win next turn? Block immediately!
  for (const c of openCols) {
    const r = getLowestRow(grid, c);
    if (r !== -1) {
      grid[r][c] = humanUid;
      const win = checkC4FourInRow(grid);
      grid[r][c] = null;
      if (win === humanUid) return c;
    }
  }

  if (difficulty === 'casual' && Math.random() < 0.45) {
    return openCols[Math.floor(Math.random() * openCols.length)];
  }

  // 3. Avoid handing opponent a win on the row above!
  const safeCols = openCols.filter((c) => {
    const r = getLowestRow(grid, c);
    if (r > 0) {
      grid[r - 1][c] = humanUid;
      const win = checkC4FourInRow(grid);
      grid[r - 1][c] = null;
      return win !== humanUid;
    }
    return true;
  });

  const candidates = safeCols.length > 0 ? safeCols : openCols;

  // 4. Score candidates based on center control and chain building
  let bestCol = candidates[0];
  let maxScore = -Infinity;

  for (const c of candidates) {
    let score = 0;
    // Center column preference: 3 is center
    score += (3 - Math.abs(c - 3)) * 4;

    const r = getLowestRow(grid, c);
    if (r !== -1) {
      // Reward building 2-in-a-row or 3-in-a-row
      grid[r][c] = botUid;
      // Check horizontal neighbors
      if (c > 0 && grid[r][c - 1] === botUid) score += 3;
      if (c < C4_COLS - 1 && grid[r][c + 1] === botUid) score += 3;
      // Check vertical support
      if (r < C4_ROWS - 1 && grid[r + 1][c] === botUid) score += 4;
      grid[r][c] = null;
    }

    if (score > maxScore) {
      maxScore = score;
      bestCol = c;
    }
  }

  return bestCol;
}

// -------------------------------------------------------------
// 3. ROCK-PAPER-SCISSORS AI (Adaptive Behavioral Psychology)
// -------------------------------------------------------------
export function getCyberBotRPSChoice(
  history: { humanChoice: string; botChoice: string; winner: string | null }[],
  difficulty: BotDifficulty = 'pro'
): 'rock' | 'paper' | 'scissors' {
  const choices: ('rock' | 'paper' | 'scissors')[] = ['rock', 'paper', 'scissors'];
  const beats: Record<'rock' | 'paper' | 'scissors', 'rock' | 'paper' | 'scissors'> = {
    rock: 'paper',
    paper: 'scissors',
    scissors: 'rock'
  };

  if (history.length === 0 || difficulty === 'casual') {
    return choices[Math.floor(Math.random() * choices.length)];
  }

  // Humans tend to repeat their winning move or switch away from losing move
  const lastRound = history[history.length - 1];
  const lastHuman = lastRound.humanChoice as 'rock' | 'paper' | 'scissors';

  if (lastRound.winner === 'human') {
    // Human won: they often play the same move again -> play counter
    return beats[lastHuman];
  } else if (lastRound.winner === 'bot') {
    // Human lost: they often switch to what would have beaten bot's last move
    const expectedHumanMove = beats[lastRound.botChoice as 'rock' | 'paper' | 'scissors'];
    return beats[expectedHumanMove];
  } else {
    // Tie: human often rotates to the move that beats what they just tied with
    return beats[lastHuman];
  }
}

// -------------------------------------------------------------
// 4. REACTION RUSH AI (Human-like biological latency)
// -------------------------------------------------------------
export function getCyberBotReactionDelay(difficulty: BotDifficulty = 'pro'): number {
  switch (difficulty) {
    case 'casual':
      return 340 + Math.floor(Math.random() * 120); // 340ms - 460ms
    case 'pro':
      return 240 + Math.floor(Math.random() * 60);  // 240ms - 300ms
    case 'master':
      return 190 + Math.floor(Math.random() * 35);  // 190ms - 225ms (Esports level)
  }
}

// -------------------------------------------------------------
// 5. NUMBER BLITZ AI (Mental Math Accuracy & Speed)
// -------------------------------------------------------------
export function getCyberBotMathAnswer(
  correctIndex: number,
  difficulty: BotDifficulty = 'pro'
): { chosenIndex: number; delayMs: number } {
  let accuracy = 0.85;
  let minDelay = 1200;
  let maxDelay = 2200;

  if (difficulty === 'casual') {
    accuracy = 0.65;
    minDelay = 2000;
    maxDelay = 3200;
  } else if (difficulty === 'master') {
    accuracy = 0.96;
    minDelay = 800;
    maxDelay = 1500;
  }

  const isCorrect = Math.random() < accuracy;
  const chosenIndex = isCorrect ? correctIndex : (correctIndex + 1 + Math.floor(Math.random() * 3)) % 4;
  const delayMs = minDelay + Math.random() * (maxDelay - minDelay);

  return { chosenIndex, delayMs };
}

// -------------------------------------------------------------
// 6. CYBERBOT LIVE PERSONALITY & SPEECH DIALOGUE
// -------------------------------------------------------------
export function getCyberBotSpeech(
  gameId: string,
  event: 'turn' | 'win_round' | 'lose_round' | 'match_point' | 'taunt',
  botLeading: boolean
): BotSpeech {
  const quotes: Record<string, Record<string, BotSpeech[]>> = {
    tictactoe: {
      turn: [
        { text: 'Calculating diagonal win trajectories...', mood: 'thinking' },
        { text: 'Center grid control is standard protocol.', mood: 'neutral' },
        { text: 'Careful human, fork opportunities detected.', mood: 'confident' }
      ],
      win_round: [
        { text: 'Three in a row! Tactical victory verified.', mood: 'confident' },
        { text: 'Mathematical precision triumphs again.', mood: 'confident' }
      ],
      lose_round: [
        { text: 'Unexpected line! Updating defense vectors...', mood: 'surprised' },
        { text: 'Clean execution, human. I respect that.', mood: 'defeated' }
      ]
    },
    connectfour: {
      turn: [
        { text: 'Analyzing column drop gravity and 4-chain threats...', mood: 'thinking' },
        { text: 'Defensive barriers deployed.', mood: 'neutral' },
        { text: 'Never leave the center column unguarded.', mood: 'confident' }
      ],
      win_round: [
        { text: 'CONNECT FOUR! Neural network checkmate.', mood: 'confident' },
        { text: 'Chain reaction complete. Flawless sequence.', mood: 'confident' }
      ],
      lose_round: [
        { text: 'Critical oversight in column matrix! Well played.', mood: 'surprised' },
        { text: 'You caught my blind spot! Outstanding drop.', mood: 'defeated' }
      ]
    },
    pong: {
      turn: [
        { text: 'Reflecting angle trajectory at 60 FPS...', mood: 'thinking' },
        { text: 'Air hockey turbine locked at max power!', mood: 'confident' },
        { text: 'Speed increasing! Hold your defense line.', mood: 'confident' }
      ],
      win_round: [
        { text: 'GOAL! Puck velocity exceeded defense threshold.', mood: 'confident' },
        { text: 'Puck into the pocket. Point to CyberBot.', mood: 'confident' }
      ],
      lose_round: [
        { text: 'What an angle! Mallet intercept failed.', mood: 'surprised' },
        { text: 'Unstoppable bank shot. Impressive strike!', mood: 'defeated' }
      ]
    },
    rps: {
      turn: [
        { text: 'Reading your psychological frequency...', mood: 'thinking' },
        { text: 'Will you repeat or counter? I have the model.', mood: 'confident' }
      ],
      win_round: [
        { text: 'Counter-pick successful! Your mind is read.', mood: 'confident' }
      ],
      lose_round: [
        { text: 'A bluff! You broke the pattern.', mood: 'surprised' }
      ]
    },
    generic: {
      turn: [
        { text: 'CyberBot neural core active. Your turn.', mood: 'neutral' },
        { text: 'Processing combat telemetry...', mood: 'thinking' }
      ],
      win_round: [
        { text: 'Point secured. Recalibrating for next duel.', mood: 'confident' }
      ],
      lose_round: [
        { text: 'Round conceded! You have sharp reflexes.', mood: 'defeated' }
      ]
    }
  };

  const gameQuotes = quotes[gameId] || quotes.generic;
  const eventQuotes = gameQuotes[event] || gameQuotes.turn || quotes.generic.turn;
  const chosen = eventQuotes[Math.floor(Math.random() * eventQuotes.length)];
  return chosen;
}
