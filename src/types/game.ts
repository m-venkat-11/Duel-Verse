// Game Specific State Interfaces per PRD Specifications

// --- 1. Tic-Tac-Toe Duel ---
export interface TicTacToeState {
  board: (string | null)[]; // 9 cells: 0..8 (stores player UID)
  currentTurn: string;      // UID of active player
  symbols: Record<string, 'X' | 'O'>;
  winningLine: number[] | null; // e.g., [0, 1, 2]
  isDraw: boolean;
  history?: Record<string, number[]>; // player UID -> order of cell indices (FIFO max 3)
}

// --- 2. Rock Paper Scissors (Best of 5) ---
export type RPSChoice = 'rock' | 'paper' | 'scissors';
export interface RPSState {
  roundNumber: number;
  targetWins: number; // usually 3
  commits: Record<string, string | null>; // hashed or committed status
  choices: Record<string, RPSChoice | null>; // revealed after both commit
  roundWinner: string | 'draw' | null;
  phase: 'choosing' | 'revealed' | 'round_end';
  timerEnd: number; // epoch ms for round timeout
  roundScores: Record<string, number>;
}

// --- 3. Connect Four ---
export interface ConnectFourState {
  grid: (string | null)[][]; // 6 rows x 7 cols (grid[row][col] stores player UID)
  currentTurn: string;
  colors: Record<string, 'crimson' | 'amber'>;
  lastMove: { row: number; col: number } | null;
  winningCoords: [number, number][] | null;
  isDraw: boolean;
}

// --- 4. Reaction Rush ---
export interface ReactionRushState {
  round: number;
  phase: 'waiting_ready' | 'countdown' | 'signal_active' | 'round_result';
  signalScheduledAt: number; // Server epoch ms
  reactionTimes: Record<string, number | null>; // Milliseconds from signal
  falseStarts: Record<string, boolean>;
  roundWinner: string | null;
  targetWins: number;
  roundWins: Record<string, number>;
}

// --- 5. Pong Battle ---
export interface PongState {
  ballX: number; // 0..100 percentage
  ballY: number; // 0..100 percentage
  vx: number;
  vy: number;
  speed: number;
  paddles: Record<string, number>; // player UID -> X position (0..100)
  targetScore: number; // usually 5
  lastHitBy: string | null;
  roundState: 'serving' | 'rally' | 'scored';
  scorerUid: string | null;
}

// --- 6. Obstacle Rush ---
export interface ObstaclePlayer {
  uid: string;
  x: number;       // 0..1000
  y: number;       // track progress 0..3000
  vx: number;
  vy: number;
  checkpoint: number;
  isGrounded: boolean;
  isStunned: boolean;
  stunUntil: number;
  finishTime: number | null;
}

export interface MovingHazard {
  id: string;
  type: 'rotator' | 'oscillator' | 'moving_platform';
  trackY: number;
  periodMs: number;
  width: number;
  height: number;
}

export interface ObstacleRushState {
  courseSeed: number;
  startTime: number;
  players: Record<string, ObstaclePlayer>;
  hazards: MovingHazard[];
  finishOrder: string[];
}

// --- 7. Memory Match Duel ---
export interface MemoryCard {
  id: number;
  pairId: number;
  icon: string;
  isMatched: boolean;
  matchedBy: string | null;
}

export interface MemoryMatchState {
  cards: MemoryCard[]; // 16 cards (8 pairs)
  playerFlips: Record<string, number[]>; // Indices flipped by player
  scores: Record<string, number>;
}

// --- 8. Number Blitz ---
export interface MathQuestion {
  id: string;
  expression: string;
  options: number[];
  correctIndex: number;
}

export interface NumberBlitzState {
  timeRemaining: number;
  questions: MathQuestion[];
  playerQuestionIndex: Record<string, number>;
  playerScores: Record<string, number>;
  streaks: Record<string, number>;
  endTime: number;
}

// --- 9. Tap Frenzy ---
export interface FrenzyTarget {
  id: string;
  type: 'coin' | 'spark' | 'bomb';
  x: number; // percentage 5..95
  y: number; // percentage 10..90
  points: number;
  expiresAt: number;
}

export interface TapFrenzyState {
  endTime: number;
  targets: FrenzyTarget[];
  scores: Record<string, number>;
  frozenUntil: Record<string, number>;
}

// --- 14. Flappy Spidey Avenger ---
export interface SpideyObstacle {
  id: string;
  x: number;
  width: number;
  topHeight: number;
  gap: number;
  passed: boolean;
  hasReactor: boolean;
  reactorY?: number;
  reactorCollected?: boolean;
}

export interface FlappySpideyState {
  playerUid: string;
  phase: 'ready' | 'playing' | 'gameover';
  score: number;
  highScore: number;
  distance: number;
  scores: Record<string, number>;
  targetScore: number;
}

// --- 15. Cyber 2048 ---
export interface Cyber2048State {
  grid: number[][];
  score: number;
  bestScore: number;
  previousGrid?: number[][];
  previousScore?: number;
  canUndo: boolean;
  won: boolean;
  gameOver: boolean;
  keepPlaying: boolean;
}

// --- 16. Cyber Sudoku ---
export type SudokuDifficulty = 'casual' | 'tactical' | 'hacker' | 'master';
export type SudokuVariant = 'classic' | 'mini6x6' | 'diagonalX';

export interface SudokuCell {
  row: number;
  col: number;
  value: number;
  solution: number;
  initial: boolean;
  notes: number[];
  error?: boolean;
  isDiagonal?: boolean;
}

export interface CyberSudokuState {
  grid: SudokuCell[][];
  size: number;
  boxRows: number;
  boxCols: number;
  difficulty: SudokuDifficulty;
  variant: SudokuVariant;
  mistakes: number;
  maxMistakes: number;
  timeSeconds: number;
  completed: boolean;
  canUndo: boolean;
  history: { row: number; col: number; prevValue: number; prevNotes: number[] }[];
}
