export type RoomStatus = 'waiting' | 'ready' | 'playing' | 'round_end' | 'match_end' | 'abandoned';
export type PlayerRole = 'host' | 'guest';

export interface PlayerSession {
  uid: string;
  nickname: string;
  avatarId: string;
  role: PlayerRole;
  isReady: boolean;
  isConnected: boolean;
  lastPing: number; // Server/epoch timestamp
  clientVersion: string;
  stats: {
    wins: number;
    losses: number;
    draws: number;
  };
}

export interface GameMetadata {
  id: string;
  title: string;
  tagline: string;
  category: 'foundational' | 'physics' | 'reflex' | 'brain';
  playersRange: string;
  estDurationSec: number;
  iconName: string;
  accentColor: string;
  description: string;
}

export interface AuthoritativeRoomState<TGameSpecificState = any> {
  roomId: string;             // 6-character alphanumeric code (e.g., 'DV-7892')
  createdAt: number;          // Epoch milliseconds
  updatedAt: number;          // Epoch milliseconds
  expiresAt: number;          // Epoch milliseconds (auto-cleanup after 60 min of inactivity)
  status: RoomStatus;
  maxPlayers: number;         // 2 (head-to-head) or up to 8
  selectedGameId: string;     // e.g., 'tictactoe', 'rps', 'connectfour', etc.
  currentRound: number;       // 1-indexed
  maxRounds: number;          // e.g., best of 3 or best of 5
  stateVersion: number;       // Monotonically increasing sequence number for conflict resolution
  hostUid: string;
  players: Record<string, PlayerSession>; // Keyed by UID
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
  roundWinnerUid?: string | 'draw' | null;
  matchWinnerUid?: string | 'draw' | null;
}

export interface RoomAction<TPayload = any> {
  type: string;
  roomId: string;
  playerUid: string;
  payload: TPayload;
  timestamp: number;
  expectedVersion?: number;
}
