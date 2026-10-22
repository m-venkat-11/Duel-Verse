# DUELVERSE: Product Requirements Document (PRD) & Game Architecture Specification
**Authoritative System Architecture, Real-Time State Synchronization, and Game Design Document**
*Version 1.0.0 | Production Specification for Mobile-First Instant Multiplayer Gaming Arcade*

---

## 1. Executive Summary & Product Vision

### 1.1 The Core Proposition
**DuelVerse** is a zero-install, mobile-first, instant real-time multiplayer web gaming arcade. Designed for short breaks and spontaneous leisure sessions, it enables two friends to open a URL on separate mobile phones, join a shared private room in seconds via a 6-character room code, shareable link, or QR code, select a game, and compete in real time with authoritative state synchronization, live scoreboards, seamless rematch flows, and cross-game switching without leaving the room.

### 1.2 Non-Negotiable Engineering Principles
1. **Zero Illusion / Functional Correctness First**: No synthetic bots, no hardcoded match results, no fake online player counters, and no client-only score increments masquerading as multiplayer. Every action must be verified against an authoritative state machine.
2. **Deterministic Multiplayer State**: Clients are thin, responsive presentation layers with optimistic prediction where necessary; the authoritative server or shared state store dictates match outcome, legal moves, timers, and scoring.
3. **Mobile-First Ergonomics**: Native-feeling touch targets (minimum 48×48px), responsive viewport locking (preventing pinch-zoom and scroll-jacking during active gameplay), safe-area insets padding, and lightweight Web Audio API sound synthesis.
4. **Resilient Room Lifecycle**: Automatic session recovery across page refreshes, graceful handling of mobile browser backgrounding/sleep, connection heartbeat monitors, and host migration protocols.

---

## 2. Technical Architecture & State Synchronization Engine

### 2.1 Recommended Technology Stack
* **Frontend Core**: React 18, TypeScript (Strict Mode), Vite (ESBuild bundling for sub-millisecond HMR and minimal bundle footprint).
* **Styling & UI**: Tailwind CSS (JIT mode), Lucide Icons, Custom CSS variables for theme tokens.
* **Canvas / Game Physics**: Lightweight HTML5 2D Canvas engine with sub-pixel interpolation for high-frequency physics games; DOM/SVG for turn-based board games.
* **Backend & Realtime Transport**: 
  * Cloud Firestore / Realtime Database listeners with atomic transactions and state version numbers (`stateVersion`).
  * Server-Sent Events (SSE) or WebSockets fallback for sub-50ms tick-rate physics synchronization where high-frequency updates are needed.
* **Authentication**: Anonymous Firebase Authentication (providing persistent, secure guest UIDs across reloads without requiring phone, email, or social logins).
* **Audio Engine**: Synthesized Web Audio API (procedural square/sine/sawtooth chimes, clicks, alerts, and victory fanfares requiring zero external audio assets).
* **Testing Suite**: Vitest (Unit test suite for game logic and rule engines), React Testing Library (Component UI states), and Playwright (Multi-context, two-browser simulated multiplayer integration tests).

### 2.2 Authoritative Room State Schema

```typescript
export type RoomStatus = 'waiting' | 'ready' | 'playing' | 'round_end' | 'match_end' | 'abandoned';
export type PlayerRole = 'host' | 'guest';

export interface PlayerSession {
  uid: string;
  nickname: string;
  avatarId: string;
  role: PlayerRole;
  isReady: boolean;
  isConnected: boolean;
  lastPing: number; // Server timestamp
  clientVersion: string;
  stats: {
    wins: number;
    losses: number;
    draws: number;
  };
}

export interface AuthoritativeRoomState<TGameSpecificState = any> {
  roomId: string;             // 6-character alphanumeric code (e.g., 'DV-7892')
  createdAt: number;          // Epoch milliseconds
  updatedAt: number;          // Epoch milliseconds
  expiresAt: number;          // Epoch milliseconds (auto-cleanup after 60 min of inactivity)
  status: RoomStatus;
  maxPlayers: number;         // 2 (head-to-head) or up to 8 (party games)
  selectedGameId: string;     // e.g., 'obstacle_rush', 'tictactoe'
  currentRound: number;       // 1-indexed
  maxRounds: number;          // e.g., best of 3 or best of 5
  stateVersion: number;       // Monotonically increasing sequence number for conflict resolution
  hostUid: string;
  players: Record<string, PlayerSession>; // Keyed by Firebase Auth UID
  scores: Record<string, number>;        // Match score keyed by UID
  rematchVotes: Record<string, boolean>; // Keyed by UID
  gameConfig: {
    difficulty?: 'easy' | 'medium' | 'hard';
    roundDurationSec?: number;
    customSeed?: number;
  };
  gameState: TGameSpecificState;         // Authoritative payload for active game
  lastAction?: {
    playerId: string;
    actionType: string;
    payload: any;
    timestamp: number;
  };
}
```

### 2.3 Concurrency Control & Fair-Play Protocols
1. **Optimistic UI with Authoritative Rollback**: On user input, the local client optimistically renders immediate visual feedback. If the authoritative server or transaction rejects the move (e.g., race condition in Connect Four column drop), the client immediately rolls back to `gameState` matching the authoritative `stateVersion`.
2. **Cryptographic Commit-Reveal for Simultaneous Decision Games**:
   * In simultaneous choice games (Rock Paper Scissors, Battleship ship placement), players submit `hash = SHA256(choice + playerSalt + roundId)`.
   * Once both hashes are present in the room state, both clients publish their unmasked choices and salts. The authoritative state machine verifies `SHA256(choice + salt) == hash` before awarding points. This makes client-side memory sniffing impossible.
3. **Server Timestamp Synchronization & Reaction Delta**:
   * In Reaction Rush, the trigger signal timestamp is determined by the server (`triggerTimestamp = now + randomDelay`).
   * Taps received before `triggerTimestamp` are marked as illegal false starts (`tapTimestamp < triggerTimestamp`).

---

## 3. Room Lifecycle, Connection Resiliency & Reconnection

```
[Create Room] ──> [Room Document Created] ──> [Lobby Waiting: Host Ready]
                                                    │
                                            [Guest Joins via Link/QR]
                                                    │
                                            [Lobby: Both Players Present]
                                                    │
                                            [Both Click 'Ready']
                                                    │
                                            [Host Initiates Match Start]
                                                    │
                                            [3-2-1 Synchronized Countdown]
                                                    │
                                            [Active Authoritative Gameplay]
                                                    │
                         ┌──────────────────────────┴──────────────────────────┐
                         │                                                     │
                 [Round Finished]                                     [Player Disconnected]
                         │                                                     │
                 [Score Updated]                                      [15s Grace Period Started]
                         │                                                     │
           ┌─────────────┴─────────────┐                        ┌──────────────┴──────────────┐
           │                           │                        │                             │
    [More Rounds]               [Match Complete]         [Reconnected]                  [Timeout Expired]
           │                           │                        │                             │
  [New Round Initialized]      [Results & Rematch UI]   [State Resynced]              [Match Forfeited]
                                       │
                        ┌──────────────┴──────────────┐
                        │                             │
               [Both Vote Rematch]             [Switch Game]
                        │                             │
             [Clean State Reset]          [Preserve Room & Players,
                                           New Game Config Initialized]
```

### 3.1 Refresh & Network Recovery Protocol
* **Guest Authentication Storage**: Player guest credentials (`auth_uid`, `guest_token`, `nickname`, `avatarId`) are persisted in `localStorage`.
* **Deep-Link State Restoration**: On browser refresh or accidental tab closure, the URL `duelverse.app/room/DV-8491` reads the stored token. If the user UID is registered in `room.players[uid]`, the client reconnects without creating a duplicate slot.
* **Grace Period Window**: If a player's heartbeat stops (`now - lastPing > 5000ms`), the opponent's screen displays a subtle non-blocking banner: *"Opponent reconnecting... (15s grace period)"*. The game timer pauses. If the player returns within 15 seconds, gameplay resumes seamlessly. If the timer expires, the active player receives a win by forfeit.

---

## 4. UI/UX Design System & Mobile Ergonomics

### 4.1 Visual Identity & Design Tokens
* **Color Palette**:
  * Background Surface: Deep Slate `#0B0F19` and Navy Charcoal `#111827`.
  * Brand Primary: Electric Violet `#8B5CF6` (Hover: `#7C3AED`, Active: `#6D28D9`).
  * Brand Secondary: Neon Cyan `#06B6D4` (Accent & High-Tech Indicators).
  * Player 1 Accent: Electric Amber / Gold `#F59E0B`.
  * Player 2 Accent: Neon Rose / Pink `#F43F5E`.
  * Neutral Borders: Subtly translucent slate `rgba(255, 255, 255, 0.08)`.
* **Typography**: Modern geometric sans-serif (`Inter`, `Plus Jakarta Sans`, system fallbacks) with tabular numbers (`font-variant-numeric: tabular-nums`) to prevent layout shifts on score changes.
* **Tactile Feedback**:
  * Visual: 150ms spring transitions, subtle glow shadows (`box-shadow: 0 0 15px rgba(139, 92, 246, 0.3)`).
  * Haptic: Optional `navigator.vibrate([15])` on button presses, `navigator.vibrate([30, 50, 30])` on round win.
  * Audio: Web Audio API chimes with user-configurable master toggle (muted by default to respect mobile browser autoplay policies).

### 4.2 Mobile Screen Optimization
* **Viewport Lockdown**: Strict viewport meta tag preventing accidental double-tap zoom: `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">`.
* **Touch Safe Areas**: Full support for CSS `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` to accommodate mobile notches and home swipe bars.
* **Overscroll Prevention**: `overscroll-behavior: none` applied globally to prevent pull-to-refresh gestures from interrupting gameplay.

---

## 5. Comprehensive Game Design & Implementation Specifications

Below are the detailed specifications for all **24 games** across 4 categories plus the foundational suite.

```
========================================================================================
CATEGORY 0: FOUNDATIONAL COMPETITIVE GAMES
========================================================================================
```

### Game 1: Tic-Tac-Toe Duel
* **Genre**: Turn-based strategy (1v1).
* **Target Duration**: 30–60 seconds.
* **Game State Model**:
  ```typescript
  export interface TicTacToeState {
    board: (string | null)[]; // 9 cells: 0..8
    currentTurn: string;      // UID of active player
    symbols: Record<string, 'X' | 'O'>;
    winningLine: number[] | null; // e.g., [0, 1, 2]
    matchScore: Record<string, number>;
  }
  ```
* **Input & Interaction**: 3×3 responsive grid. Direct single tap on empty cell. Tapping on non-empty cells or during the opponent's turn produces a gentle shake animation without network transmission.
* **Synchronization Strategy**: Turn-based atomic document update. Action payload: `{ cellIndex: number, playerUid: string, stateVersion: number }`.
* **Win/Draw Conditions**: Standard 8 winning combinations (3 rows, 3 columns, 2 diagonals). If all 9 cells are filled with no winner, a draw is declared.
* **Anti-Cheat & Validation**: Authoritative validator checks: (1) `playerUid === room.gameState.currentTurn`, (2) `cellIndex >= 0 && cellIndex < 9`, (3) `board[cellIndex] === null`.

---

### Game 2: Rock Paper Scissors — Best of Five
* **Genre**: Simultaneous secret decision-making (1v1).
* **Target Duration**: 45–90 seconds.
* **Game State Model**:
  ```typescript
  export interface RPSState {
    roundNumber: number;
    targetWins: number; // 3 (Best of 5)
    commits: Record<string, string | null>; // SHA-256 hash or 'committed' flag
    choices: Record<string, 'rock' | 'paper' | 'scissors' | null>; // revealed after both commit
    roundWinner: string | 'tie' | null;
    phase: 'choosing' | 'revealed' | 'round_transition';
    timerEnd: number; // 10s countdown per round
  }
  ```
* **Input & Interaction**: 3 large ergonomic cards (Rock 🪨, Paper 📄, Scissors ✂️). Tapping locks choice; card highlights with subtle pulse. Choice remains masked to the opponent until both players lock in or the 10-second timer expires.
* **Synchronization Strategy**: Two-phase commit. When Player A chooses, state registers `{ commits: { [uidA]: 'LOCKED' } }`. Player B sees "Opponent has chosen!". When Player B commits, the authoritative state reveals choices simultaneously and computes round points.
* **Win Condition**: First player to reach 3 round victories wins the match.

---

### Game 3: Connect Four
* **Genre**: Gravity-based spatial strategy (1v1).
* **Target Duration**: 2–4 minutes.
* **Game State Model**:
  ```typescript
  export interface ConnectFourState {
    grid: (string | null)[][]; // 6 rows x 7 columns
    currentTurn: string;
    colors: Record<string, 'crimson' | 'amber'>;
    lastMove: { row: number; col: number } | null;
    winningCoords: [number, number][] | null;
  }
  ```
* **Input & Interaction**: 7-column touch tap targets with column indicator arrows. Tapping a column triggers a CSS keyframe drop animation where the disc drops to the lowest unfilled row.
* **Synchronization Strategy**: Atomic column drop. Server computes target row based on current grid state.
* **Win Detection**: Bitboard or 2D array scan checking horizontal, vertical, diagonal-up, and diagonal-down sequences of 4 identical tokens.
* **Edge Case**: Simultaneous taps on the same column are serialized by `stateVersion`. The second tap lands on the row above or is rejected if the column is full.

---

### Game 4: Reaction Rush
* **Genre**: Real-time millisecond reflex competition (1v1).
* **Target Duration**: 30–60 seconds (Best of 5 rounds).
* **Game State Model**:
  ```typescript
  export interface ReactionRushState {
    round: number;
    phase: 'waiting_ready' | 'countdown' | 'signal_active' | 'round_result';
    signalScheduledAt: number; // Server epoch ms
    reactionTimes: Record<string, number | null>; // Milliseconds from signal
    falseStarts: Record<string, boolean>;
    roundWinner: string | null;
  }
  ```
* **Input & Interaction**: Full-screen reaction pad. 
  * Red Screen: "Hold Ready..."
  * Random interval (2000ms – 5500ms).
  * Electric Green Screen + Web Audio Beep: "TAP NOW!"
* **Anti-Cheat & Latency Compensation**:
  * Taps registered prior to `signalScheduledAt` are instantly flagged as `falseStart: true` on the client and server. The opponent automatically takes the round point.
  * Reaction time calculated as `clientTapTimestamp - signalScheduledAt`. To prevent clock skew between devices, client computes delta against synchronized room clock established at room creation.

---

### Game 5: Memory Match Duel
* **Genre**: Spatial memory and rapid pair matching (1v1).
* **Target Duration**: 1–2 minutes.
* **Game State Model**:
  ```typescript
  export interface MemoryCard {
    id: number;
    iconKey: string;
    isMatched: boolean;
    matchedBy: string | null;
  }
  export interface MemoryMatchState {
    cards: MemoryCard[]; // 16 cards (8 pairs)
    playerFlips: Record<string, number[]>; // Array of card indices flipped by each player
    playerScores: Record<string, number>;
  }
  ```
* **Multiplayer Mechanic**: Competitive Simultaneous Rush mode. Both players interact with the identical card layout in real time. When Player A flips and successfully matches a pair, those cards lock as matched for both players and Player A gains +1 point. If an incorrect pair is flipped, the cards flip back after 800ms.
* **Input & Interaction**: 4×4 responsive card grid with 3D flip card CSS animation.

---

### Game 6: Number Blitz
* **Genre**: Mental arithmetic and speed competition (1v1).
* **Target Duration**: 60 seconds timed match.
* **Game State Model**:
  ```typescript
  export interface MathQuestion {
    id: string;
    expression: string; // e.g. "17 + 28" or "8 x 7 - 14"
    options: number[];   // 4 choices
    correctIndex: number;
  }
  export interface NumberBlitzState {
    timeRemaining: number;
    questions: MathQuestion[];
    currentQuestionIndex: Record<string, number>; // Individual progress
    playerScores: Record<string, number>;
    streaks: Record<string, number>;
  }
  ```
* **Input & Interaction**: Large arithmetic prompt with 4 quadrant touch buttons. 
* **Scoring Rules**: Correct answer = `+100` points + `(streak * 10)`. Incorrect answer = `-30` points and breaks streak. Both players race against the same shared 60-second synchronized timer.
* **Tie-Breaker**: If scores are equal at 0 seconds, highest accuracy percentage wins.

---

```
========================================================================================
CATEGORY 1: OBSTACLE COURSE AND SURVIVAL GAMES
========================================================================================
```

### Game 7: Obstacle Rush (Flagship Title)
* **Genre**: 2D/Pseudo-3D Stumble Guys-inspired Platform Course Race (2–8 players).
* **Target Duration**: 60–120 seconds.
* **Visual & Engine Specification**:
  * Rendered via high-performance HTML5 Canvas with hardware acceleration.
  * Orthographic / Top-down angled perspective giving a dynamic 2.5D party game aesthetic.
  * Map layout: Start platform ➔ Rotating hammer gauntlet ➔ Moving bumper bridges ➔ Checkpoint 1 ➔ Oscillating pendulum zone ➔ Disappearing floor blocks ➔ Checkpoint 2 ➔ Final sprint jump platforms ➔ Finish Arch.
* **Game State Model**:
  ```typescript
  export interface ObstaclePlayer {
    x: number;
    y: number;
    vx: number;
    vy: number;
    checkpoint: number;
    isGrounded: boolean;
    isStunned: boolean;
    finishTime: number | null;
  }
  export interface MovingHazard {
    id: string;
    type: 'rotator' | 'oscillator' | 'moving_platform';
    currentPos: { x: number; y: number };
    angle: number;
  }
  export interface ObstacleRushState {
    courseSeed: number;
    startTime: number;
    players: Record<string, ObstaclePlayer>;
    hazards: MovingHazard[];
    finishOrder: string[];
  }
  ```
* **Controls & Ergonomics**:
  * Virtual floating dynamic joystick on left screen half (360° directional motion).
  * Large "JUMP / DIVE" button on bottom right corner (single tap jump, double tap dive forward).
* **Physics & Collision Engine**:
  * Bounding box and circle collision detection for dynamic hazards.
  * Getting hit by a moving hammer applies a momentum impulse vector `(vx, vy)` throwing the avatar backward and triggering a 500ms stun state.
  * Falling off the edge triggers an instant cartoon poof particle effect and respawns the player at their last passed checkpoint with a 1-second invulnerability flash.
* **Network Synchronization**:
  * Deterministic hazards: Hazard movement is computed client-side based on `gameStartTime + serverElapsedMs`, ensuring 100% sync without sending hazard coordinates over the wire.
  * Player position streaming: Client broadcasts `{ x, y, vx, vy, state }` at 15–20Hz. Opponent positions are smoothly rendered using Hermite spline interpolation to eliminate jitter on cellular networks.

---

### Game 8: Last Player Standing
* **Genre**: Collapsing Hex Platform Survival (2–4 players).
* **Target Duration**: 45–90 seconds.
* **Core Mechanic**: Players navigate a honeycomb arena consisting of 3 layers of hexagonal tiles. Stepping on a tile causes it to shake, change color (Green ➔ Orange ➔ Red), and vanish after 600ms. Players must constantly keep moving to avoid dropping to lower layers or into the abyss.
* **Controls**: Responsive touch-drag or D-pad navigation.
* **Win Condition**: Last surviving player above the elimination zone wins.

---

### Game 9: Bomb Tag
* **Genre**: High-intensity Hot Potato Tag (2–4 players).
* **Target Duration**: 60 seconds.
* **Core Mechanic**: One player starts with a glowing, ticking bomb strapped to their avatar. Ticking tempo increases as the fuse burns down (30s round timer). Proximity contact (touching or bumping into the opponent) instantly transfers the bomb with a 1-second immunity window to prevent immediate re-tagging.
* **Arena Mechanics**: Speed boost pads, bounce bumpers, and corner portals encourage evasive maneuvers.
* **Elimination**: The player holding the bomb when the timer hits zero explodes in confetti and loses the round.

---

### Game 10: Sumo Knockout
* **Genre**: Physics Brawler / Ring-Out Arena (1v1).
* **Target Duration**: 30–60 seconds per round.
* **Core Mechanic**: Two sumo spheres face off on a circular elevated dohyo (ring) with slippery physics.
* **Controls**: Touch and pull back to aim a momentum dash vector (like an slingshot), release to launch.
* **Physics**: Elastic collision with mass transfer: `v1' = (m1 - m2)/(m1 + m2)*v1 + 2*m2/(m1+m2)*v2`. If a player is knocked off the perimeter of the circular arena, the opponent scores a point. Best of 3 rounds.

---

```
========================================================================================
CATEGORY 2: RACING AND MOVEMENT GAMES
========================================================================================
```

### Game 11: Mini Kart Race
* **Genre**: Top-Down Micro Arcade Racing (1v1).
* **Target Duration**: 60–90 seconds (3 laps).
* **Core Mechanic**: Top-down track with hairpins, oil slicks, turbo pads, and coin pickups.
* **Controls**: Steer left/right buttons, automatic throttle, and a Drift/Boost button. Drifting around corners fills a mini-turbo meter.
* **Synchronization**: Checkpoint verification gate (1..8 around the track). Players cannot skip ahead by driving backward; lap increments only after passing all checkpoints in sequence.

---

### Game 12: Platform Sprint
* **Genre**: Side-Scrolling Obstacle Runner (1v1).
* **Target Duration**: 45 seconds.
* **Core Mechanic**: Dual-lane endless/fixed course runner. Both players run across parallel tracks on screen. Obstacles include hurdles (require jump), low pipes (require slide/duck), and mud pits (slowdown).
* **Controls**: Up-arrow / Tap top half: Jump. Down-arrow / Tap bottom half: Slide.

---

### Game 13: Snake Arena
* **Genre**: Real-Time Competitive Snake (1v1).
* **Target Duration**: 1–2 minutes.
* **Core Mechanic**: Both snakes share an arena with glowing orbs. Eating orbs increases length and score. Slithering into the opponent's body or the arena perimeter wall causes an instant crash and round loss.
* **Controls**: 4-way swipe gestures or on-screen directional touch pad. Speed boost button available (costs 2 body segments per second of boost).

---

### Game 14: Mini Golf Duel
* **Genre**: Turn-based / Simultaneous Precision Shot (1v1).
* **Target Duration**: 2 minutes (3 holes).
* **Core Mechanic**: Isometric mini-golf holes featuring hills, windmills, sand traps, and water hazards.
* **Controls**: Pull-back slingshot aiming line displaying power percentage and trajectory arc. Lowest total strokes across 3 holes wins.

---

```
========================================================================================
CATEGORY 3: ARCADE AND REFLEX GAMES
========================================================================================
```

### Game 15: Air Hockey Duel
* **Genre**: Fast-Paced Touch Physics Arcade (1v1).
* **Target Duration**: First to 5 goals.
* **Physics Specification**:
  * Table split vertically: Player 1 controls bottom half, Player 2 controls top half.
  * Mallet follows player's finger touch within their half with zero latency.
  * Puck velocity calculations: `V_puck = V_puck_old * friction + (Mallet_velocity * collision_transfer)`.
  * Goal detection: Puck entering the 120px goal pocket triggers score increment, table celebration flash, and center reset.

---

### Game 16: Pong Battle
* **Genre**: Classic Modernized Paddle Duel (1v1).
* **Target Duration**: First to 7 points.
* **Core Mechanic**: Ball accelerates by 4% on every consecutive paddle return. Hitting the ball with the outer edge of the paddle deflects it at an acute angle, rewarding tactical positioning.
* **Controls**: Horizontal thumb slider at bottom/top edge of screen.

---

### Game 17: Draw & Guess
* **Genre**: Social Drawing and Guessing Party Game (2–4 players).
* **Target Duration**: 3 rounds of 60 seconds.
* **Core Mechanic**:
  * Active artist receives a private secret word (e.g., "Kangaroo", "Pizza", "Volcano").
  * Artist draws on a responsive HTML5 canvas. Vector stroke packets `{ x0, y0, x1, y1, color, size }` are delta-compressed and streamed to the guessing player.
  * Guessing player types into an instant guess bar. Fuzzy string matching (Levenshtein distance <= 1) detects near-misses ("You are so close!"). Exact match awards points based on time remaining.

---

### Game 18: Quiz Clash
* **Genre**: Live Trivia Battle (1v1 or party).
* **Target Duration**: 5 questions, 15 seconds per question.
* **Categories**: Pop Culture, Gaming & Tech, Science & Nature, Geography, Sports.
* **Core Mechanic**: Both players receive identical multiple-choice questions simultaneously. Score awarded = `1000 * (timeRemaining / 15s)`. Fast accurate answers maximize points.

---

### Game 19: Tap Frenzy
* **Genre**: Rapid Target Tap Reflex (1v1).
* **Target Duration**: 30 seconds.
* **Core Mechanic**: Targets spawn randomly across the screen.
  * Gold Coins: `+10 points`
  * Diamond Sparks: `+25 points`
  * Red Skulls / Bombs: `-20 points` & 1-second freeze penalty
* **Win Condition**: Highest point total when the clock expires.

---

### Game 20: Territory Takeover
* **Genre**: Turn-based Grid Dots & Boxes / Area Expansion (1v1).
* **Target Duration**: 2–3 minutes.
* **Core Mechanic**: 6×6 grid of dots. Players take turns drawing connecting lines between adjacent dots. Completing a 1×1 square captures that territory in the player's color and grants a bonus turn. Most captured boxes wins.

---

```
========================================================================================
CATEGORY 4: STRATEGY AND BRAIN GAMES
========================================================================================
```

### Game 21: Battleship Duel
* **Genre**: Hidden Grid Naval Combat (1v1).
* **Target Duration**: 3–5 minutes.
* **Core Mechanic**:
  * Phase 1: Each player secretly places 4 ships (Carrier: 4 cells, Cruiser: 3 cells, Destroyer: 2 cells, Submarine: 2 cells) on their private 8×8 grid.
  * Phase 2: Alternating salvo firing on opponent's grid coordinates. Server responds with "Hit", "Miss", or "Sunk!".
* **Anti-Cheat**: Ship coordinates remain strictly private in player-scoped sub-documents until hit, preventing inspection via client browser devtools.

---

### Game 22: Word Scramble Race
* **Genre**: Word Anagram Speed Duel (1v1).
* **Target Duration**: 60 seconds (5 rounds).
* **Core Mechanic**: Both players receive an identical scrambled 6-letter word (e.g., "G L I H T N" ➔ "LIGHTING" / "FLIGHT"). First player to tap the letters in correct sequence or submit the solved word wins the round.

---

### Game 23: Checkers Duel
* **Genre**: Turn-based Classic Strategy (1v1).
* **Target Duration**: 3–6 minutes.
* **Core Mechanic**: Standard 8×8 checkers board (12 pieces per player).
  * Validates diagonal moves, forward pawn advancement, compulsory multi-jump captures, and King crowning on reaching the opposite rank.
  * Real-time piece selection highlights valid destination squares.

---

### Game 24: Code Breaker
* **Genre**: Logic & Deduction (Mastermind style) (1v1).
* **Target Duration**: 2–4 minutes.
* **Core Mechanic**:
  * Player A sets a secret 4-color code from 6 available colors.
  * Player B has 8 attempts to deduce the code.
  * For each guess, the game returns black pegs (correct color & position) and white pegs (correct color, wrong position).
  * Roles reverse in Round 2. Fewest total guesses to crack the code wins.

---

## 6. Anti-Cheat, Security, and Concurrency Guardrails

### 6.1 Database Security Rules Architecture
```javascript
// Firestore Security Rules Conceptual Blueprint
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper functions
    function isAuthenticated() {
      return request.auth != null;
    }
    function isRoomMember(roomData) {
      return isAuthenticated() && request.auth.uid in roomData.players;
    }
    function isHost(roomData) {
      return isAuthenticated() && request.auth.uid == roomData.hostUid;
    }

    match /rooms/{roomId} {
      // Any authenticated user can read room state
      allow read: if isAuthenticated();
      
      // Creating a new room
      allow create: if isAuthenticated() 
        && request.resource.data.hostUid == request.auth.uid
        && request.resource.data.status == 'waiting';

      // Updates must be authorized and validated
      allow update: if isRoomMember(resource.data)
        // Ensure stateVersion is strictly incremented
        && request.resource.data.stateVersion == resource.data.stateVersion + 1
        // Prevent unauthorized host changes or score hijacking
        && (isHost(resource.data) || request.resource.data.hostUid == resource.data.hostUid);
    }

    // Private player states (hidden cards, hidden battleship coordinates, RPS commit hashes)
    match /rooms/{roomId}/private/{playerId} {
      allow read, write: if isAuthenticated() && request.auth.uid == playerId;
    }
  }
}
```

### 6.2 Preventing Score & Action Tampering
1. **No Client Score Manipulation**: Clients never send `scores: { player1: 5 }`. Clients only dispatch discrete, validated action intents: `{ type: 'SUBMIT_ANSWER', questionId: 4, choiceIndex: 2 }`.
2. **Deterministic Win State Calculations**: When a game terminates, the outcome is derived by a pure deterministic reducer function executed against the verified event history.
3. **Rate Limiting**: Input throttle limiting dispatches to a maximum of 30 actions per second per client, rejecting flood attempts that could lock the database or degrade room performance.

---

## 7. Strategic Analysis: Phased Delivery vs. Monolithic "Antigravity" Prompt

### 7.1 The Trap of the Monolithic / "Antigravity" Single Prompt
Attempting to generate, build, test, and deploy a 24-game real-time multiplayer arcade in a single monolithic prompt is an anti-pattern that consistently leads to catastrophic project failure:
* **Context Saturation & Shallow Stubs**: Attempting 24 games in one pass forces the generator to write skeleton stubs (e.g., `// TODO: Implement physics`, `// Simulated multiplayer for now`).
* **Hidden Networking Bugs**: Real-time multiplayer synchronization (handling dropped packets, out-of-order state updates, race conditions in room joins, and mobile browser tab sleep) requires meticulous, isolated testing between two independent execution contexts.
* **Fragile Monolith**: If room lifecycle code is intertwined with 24 incomplete game views, diagnosing why a state listener fails or a player cannot rematch becomes an unmaintainable debugging nightmare.

### 7.2 The Recommended Phased Implementation Strategy
The most robust, production-quality engineering methodology is a **disciplined 5-phase iterative rollout**, ensuring that at every single stage, the platform is 100% playable, tested, and reliable.

```
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: CORE MULTIPLAYER FOUNDATION & INFRASTRUCTURE                   │
│ - Anonymous Auth, Room Creation, 6-Char Code, QR Generator, Join Links │
│ - Real-Time Presence, Heartbeat, Reconnect Recovery, Host Migration    │
│ - Reusable Scoreboard, Universal Rematch Flow, Game Switcher           │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│ PHASE 2: INITIAL 5 FOUNDATIONAL PROVEN GAMES                           │
│ - Tic-Tac-Toe Duel (Turn-Based Validation)                            │
│ - Rock Paper Scissors: Best of 5 (Two-Phase Commit-Reveal)            │
│ - Connect Four (Gravity Grid & Drop Animations)                       │
│ - Reaction Rush (Server Timestamp Latency Sync)                       │
│ - Pong Battle (Paddle Velocity & Ball Mechanics)                      │
│ * Automated Test Gate: 2-Session Virtual Player Integration Suite      │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│ PHASE 3: FLAGSHIP OBSTACLE RUSH & REAL-TIME PHYSICS ARCADE             │
│ - Obstacle Rush (Stumble Guys-Style 2D Canvas Physics Engine)          │
│   * Moving hazards, rotating bars, checkpoints, respawn, finish line   │
│ - Snake Arena (Shared Arena, Speed Boost, Collision Detection)         │
│ - Tap Frenzy (High-Speed Reflex Targets)                               │
│ - Quiz Clash (Simultaneous Trivia Engine)                              │
│ - Memory Match Duel (Competitive Simultaneous Pair Matching)           │
│ - Platform Sprint (Side-scroller Dual Runner)                          │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│ PHASE 4: EXPANDED PARTY, REFLEX & BRAIN GAMES                          │
│ - Sumo Knockout & Bomb Tag (Brawler Physics & Proximity Triggers)      │
│ - Air Hockey Duel (High-Frequency Touch Mallet Elastic Physics)        │
│ - Number Blitz & Word Scramble Race (Mental Speed Competitions)        │
│ - Mini Kart Race & Mini Golf Duel (Arcade Driving & Slingshot Vector)  │
│ - Draw & Guess (Vector Canvas Stroke Streaming)                        │
│ - Territory Takeover (Grid Expansion Logic)                            │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│ PHASE 5: ADVANCED STRATEGY, HARDENING & PRODUCTION SHIP                │
│ - Battleship Duel (Private Fog-of-War Placement & Salvo Grid)          │
│ - Checkers Duel (Forced Jump Algorithms & King Promotions)             │
│ - Code Breaker (Mastermind Logic Deduction)                            │
│ - Last Player Standing (Collapsing Hexagon Layers)                     │
│ - Performance Audit: 60 FPS Mobile Profiling, Bundle Splitting         │
│ - Security Rules Verification & Production Deployment Pipeline         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Definition of Done & Quality Gates

Each milestone must satisfy the following strict quality gates:
1. **Dual Mobile Device Verification**: The game must run seamlessly in two independent mobile browser contexts (e.g., Chrome on Android and Safari on iOS) without desynchronization.
2. **Graceful Disconnect Test**: Simulating airplane mode or closing the browser tab for 10 seconds and reopening must restore the player directly back into the live match without corrupting room state.
3. **No Phantom Wins**: A match must never award victory or alter statistics based on client assertions alone.
4. **Sub-100ms UI Latency**: All touch inputs, card taps, and joystick movements must provide instantaneous local feedback (< 16ms render loop) with smooth server state reconciliation.
