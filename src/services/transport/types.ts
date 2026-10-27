import type { AuthoritativeRoomState, PlayerSession, RoomAction } from '../../types/room';

export interface IRoomTransport {
  createRoom(hostPlayer: PlayerSession, initialGameId: string, maxRounds?: number): Promise<string>;
  joinRoom(roomId: string, player: PlayerSession): Promise<{ success: boolean; error?: string }>;
  leaveRoom(roomId: string, playerUid: string): Promise<void>;
  subscribe(roomId: string, onUpdate: (room: AuthoritativeRoomState) => void): () => void;
  dispatchAction(action: RoomAction): Promise<void>;
  sendHeartbeat(roomId: string, playerUid: string): Promise<void>;
  toggleReady(roomId: string, playerUid: string): Promise<void>;
  startGame(roomId: string): Promise<void>;
  voteRematch(roomId: string, playerUid: string): Promise<void>;
  switchGame(roomId: string, newGameId: string): Promise<void>;
  resetRoomToLobby(roomId: string): Promise<void>;
  updateMatchConfig(roomId: string, maxRounds: number, difficulty?: string): Promise<void>;
}
