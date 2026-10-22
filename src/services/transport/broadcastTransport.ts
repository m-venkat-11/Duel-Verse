import type { AuthoritativeRoomState, PlayerSession, RoomAction } from '../../types/room';
import type { IRoomTransport } from './types';
import { initializeGameState } from '../../engine';
import { processTicTacToeMove } from '../../engine/tictactoeEngine';
import { commitRPSChoice, resetRPSNextRound } from '../../engine/rpsEngine';
import { dropDisc } from '../../engine/connectFourEngine';
import { registerReactionTap, resetReactionNextRound } from '../../engine/reactionRushEngine';
import { updatePongPaddle, stepPongPhysics, resetPongServe } from '../../engine/pongEngine';
import { flipMemoryCard, clearPlayerFlips } from '../../engine/memoryMatchEngine';
import { submitBlitzAnswer } from '../../engine/numberBlitzEngine';
import { tapTarget } from '../../engine/tapFrenzyEngine';
import { updateObstaclePlayerPosition, triggerObstacleRespawn } from '../../engine/obstacleRushEngine';

function generateRoomCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `DV-${code}`;
}

export class BroadcastTransport implements IRoomTransport {
  private channels: Map<string, BroadcastChannel> = new Map();
  private listeners: Map<string, Set<(room: AuthoritativeRoomState) => void>> = new Map();
  private storagePrefix = 'duelverse_room_';

  private getChannel(roomId: string): BroadcastChannel {
    if (!this.channels.has(roomId)) {
      const channel = new BroadcastChannel(`duelverse_channel_${roomId}`);
      channel.onmessage = (event) => {
        const { type, room } = event.data;
        if (type === 'ROOM_UPDATE' && room) {
          this.notifyListeners(roomId, room);
        }
      };
      this.channels.set(roomId, channel);
    }
    return this.channels.get(roomId)!;
  }

  private getStoredRoom(roomId: string): AuthoritativeRoomState | null {
    try {
      const data = localStorage.getItem(`${this.storagePrefix}${roomId}`);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  private saveAndBroadcast(room: AuthoritativeRoomState) {
    room.updatedAt = Date.now();
    room.stateVersion += 1;
    try {
      localStorage.setItem(`${this.storagePrefix}${room.roomId}`, JSON.stringify(room));
    } catch {
      // Storage quota or policy fallback
    }

    const channel = this.getChannel(room.roomId);
    channel.postMessage({ type: 'ROOM_UPDATE', room });
    this.notifyListeners(room.roomId, room);
  }

  private notifyListeners(roomId: string, room: AuthoritativeRoomState) {
    const subs = this.listeners.get(roomId);
    if (subs) {
      subs.forEach((cb) => cb(room));
    }
  }

  public async createRoom(
    hostPlayer: PlayerSession,
    initialGameId: string,
    maxRounds: number = 3
  ): Promise<string> {
    const roomId = generateRoomCode();
    const now = Date.now();

    hostPlayer.role = 'host';
    hostPlayer.isReady = true;
    hostPlayer.isConnected = true;
    hostPlayer.lastPing = now;

    const initialGameState = initializeGameState(initialGameId, [hostPlayer.uid]);

    const room: AuthoritativeRoomState = {
      roomId,
      createdAt: now,
      updatedAt: now,
      expiresAt: now + 60 * 60 * 1000,
      status: 'waiting',
      maxPlayers: 2,
      selectedGameId: initialGameId,
      currentRound: 1,
      maxRounds,
      stateVersion: 1,
      hostUid: hostPlayer.uid,
      players: {
        [hostPlayer.uid]: hostPlayer
      },
      scores: {
        [hostPlayer.uid]: 0
      },
      rematchVotes: {},
      gameConfig: {
        difficulty: 'medium',
        roundDurationSec: 60
      },
      gameState: initialGameState
    };

    this.saveAndBroadcast(room);
    return roomId;
  }

  public async joinRoom(
    roomId: string,
    player: PlayerSession
  ): Promise<{ success: boolean; error?: string }> {
    const formattedId = roomId.toUpperCase().trim();
    const room = this.getStoredRoom(formattedId);

    if (!room) {
      return { success: false, error: 'Room not found. Check the room code and try again.' };
    }

    const now = Date.now();
    const existingPlayer = room.players[player.uid];

    if (!existingPlayer && Object.keys(room.players).length >= room.maxPlayers) {
      return { success: false, error: 'Room is already full.' };
    }

    if (existingPlayer) {
      // Reconnection of existing player
      existingPlayer.isConnected = true;
      existingPlayer.lastPing = now;
      existingPlayer.nickname = player.nickname;
      existingPlayer.avatarId = player.avatarId;
    } else {
      // New guest joining
      player.role = 'guest';
      player.isReady = false;
      player.isConnected = true;
      player.lastPing = now;
      room.players[player.uid] = player;
      room.scores[player.uid] = 0;
    }

    // Reinitialize game state for both players
    const playerUids = Object.keys(room.players);
    room.gameState = initializeGameState(room.selectedGameId, playerUids);

    this.saveAndBroadcast(room);
    return { success: true };
  }

  public async leaveRoom(roomId: string, playerUid: string): Promise<void> {
    const room = this.getStoredRoom(roomId);
    if (!room) return;

    delete room.players[playerUid];
    delete room.scores[playerUid];
    delete room.rematchVotes[playerUid];

    const remainingUids = Object.keys(room.players);
    if (remainingUids.length === 0) {
      // Clean up empty room
      localStorage.removeItem(`${this.storagePrefix}${roomId}`);
      return;
    }

    // Host migration if host left
    if (room.hostUid === playerUid && remainingUids.length > 0) {
      room.hostUid = remainingUids[0];
      room.players[remainingUids[0]].role = 'host';
    }

    room.status = 'waiting';
    this.saveAndBroadcast(room);
  }

  public subscribe(roomId: string, onUpdate: (room: AuthoritativeRoomState) => void): () => void {
    if (!this.listeners.has(roomId)) {
      this.listeners.set(roomId, new Set());
    }
    this.listeners.get(roomId)!.add(onUpdate);

    // Initial delivery if state already exists
    const room = this.getStoredRoom(roomId);
    if (room) {
      onUpdate(room);
    }

    // Ensure channel is listening
    this.getChannel(roomId);

    return () => {
      const subs = this.listeners.get(roomId);
      if (subs) {
        subs.delete(onUpdate);
        if (subs.size === 0) {
          this.listeners.delete(roomId);
          const ch = this.channels.get(roomId);
          if (ch) {
            ch.close();
            this.channels.delete(roomId);
          }
        }
      }
    };
  }

  public async toggleReady(roomId: string, playerUid: string): Promise<void> {
    const room = this.getStoredRoom(roomId);
    if (!room || !room.players[playerUid]) return;

    room.players[playerUid].isReady = !room.players[playerUid].isReady;

    const allReady = Object.values(room.players).every((p) => p.isReady);
    const hasEnoughPlayers = Object.keys(room.players).length >= 2;

    if (allReady && hasEnoughPlayers && room.status === 'waiting') {
      room.status = 'ready';
    } else if (!allReady && room.status === 'ready') {
      room.status = 'waiting';
    }

    this.saveAndBroadcast(room);
  }

  public async startGame(roomId: string): Promise<void> {
    const room = this.getStoredRoom(roomId);
    if (!room) return;

    const playerUids = Object.keys(room.players);
    room.gameState = initializeGameState(room.selectedGameId, playerUids);
    room.status = 'playing';
    room.currentRound = 1;
    room.roundWinnerUid = null;
    room.matchWinnerUid = null;
    room.rematchVotes = {};

    this.saveAndBroadcast(room);
  }

  public async sendHeartbeat(roomId: string, playerUid: string): Promise<void> {
    const room = this.getStoredRoom(roomId);
    if (!room || !room.players[playerUid]) return;

    const now = Date.now();
    room.players[playerUid].lastPing = now;
    room.players[playerUid].isConnected = true;

    // Check opponent connection status (grace period: 7s without ping)
    Object.values(room.players).forEach((p) => {
      if (p.uid !== playerUid && now - p.lastPing > 7000) {
        p.isConnected = false;
      }
    });

    this.saveAndBroadcast(room);
  }

  public async voteRematch(roomId: string, playerUid: string): Promise<void> {
    const room = this.getStoredRoom(roomId);
    if (!room) return;

    room.rematchVotes[playerUid] = true;

    const playerUids = Object.keys(room.players);
    const bothVoted = playerUids.length >= 2 && playerUids.every((uid) => room.rematchVotes[uid]);

    if (bothVoted) {
      // Reset match completely
      playerUids.forEach((uid) => {
        room.scores[uid] = 0;
        room.players[uid].isReady = true;
      });
      room.rematchVotes = {};
      room.currentRound = 1;
      room.roundWinnerUid = null;
      room.matchWinnerUid = null;
      room.gameState = initializeGameState(room.selectedGameId, playerUids);
      room.status = 'playing';
    }

    this.saveAndBroadcast(room);
  }

  public async switchGame(roomId: string, newGameId: string): Promise<void> {
    const room = this.getStoredRoom(roomId);
    if (!room) return;

    const playerUids = Object.keys(room.players);
    playerUids.forEach((uid) => {
      room.scores[uid] = 0;
      room.players[uid].isReady = true;
    });

    room.selectedGameId = newGameId;
    room.rematchVotes = {};
    room.currentRound = 1;
    room.roundWinnerUid = null;
    room.matchWinnerUid = null;
    room.gameState = initializeGameState(newGameId, playerUids);
    room.status = 'playing';

    this.saveAndBroadcast(room);
  }

  public async resetRoomToLobby(roomId: string): Promise<void> {
    const room = this.getStoredRoom(roomId);
    if (!room) return;

    const playerUids = Object.keys(room.players);
    playerUids.forEach((uid) => {
      room.scores[uid] = 0;
      room.players[uid].isReady = false;
    });
    room.status = 'waiting';
    room.rematchVotes = {};
    room.roundWinnerUid = null;
    room.matchWinnerUid = null;

    this.saveAndBroadcast(room);
  }

  public async dispatchAction(action: RoomAction): Promise<void> {
    const room = this.getStoredRoom(action.roomId);
    if (!room) return;

    const playerUids = Object.keys(room.players);
    const { type, playerUid, payload } = action;

    // Authoritative Action Reducers
    switch (type) {
      // --- Tic-Tac-Toe Move ---
      case 'TICTACTOE_MOVE': {
        const { cellIndex } = payload;
        const res = processTicTacToeMove(room.gameState, cellIndex, playerUid, playerUids);
        room.gameState = res.newState;

        if (res.roundOver) {
          if (res.winnerUid) {
            room.scores[res.winnerUid] = (room.scores[res.winnerUid] || 0) + 1;
            room.roundWinnerUid = res.winnerUid;
            if (room.scores[res.winnerUid] >= Math.ceil(room.maxRounds / 2)) {
              room.status = 'match_end';
              room.matchWinnerUid = res.winnerUid;
            } else {
              room.status = 'round_end';
            }
          } else if (res.isDraw) {
            room.roundWinnerUid = 'draw';
            room.status = 'round_end';
          }
        }
        break;
      }

      // --- Rock Paper Scissors Choice ---
      case 'RPS_CHOOSE': {
        const { choice } = payload;
        const res = commitRPSChoice(room.gameState, playerUid, choice, playerUids);
        room.gameState = res.newState;

        if (res.matchOver && res.matchWinnerUid) {
          room.scores[res.matchWinnerUid] = (room.scores[res.matchWinnerUid] || 0) + 1;
          room.roundWinnerUid = res.matchWinnerUid;
          room.status = 'match_end';
          room.matchWinnerUid = res.matchWinnerUid;
        } else if (res.roundOver) {
          room.roundWinnerUid = res.roundWinnerUid;
          // Auto advance to next RPS round in 2 seconds
          setTimeout(() => {
            const currentRoom = this.getStoredRoom(action.roomId);
            if (currentRoom && currentRoom.status === 'playing') {
              currentRoom.gameState = resetRPSNextRound(currentRoom.gameState);
              this.saveAndBroadcast(currentRoom);
            }
          }, 2000);
        }
        break;
      }

      // --- Connect Four Drop ---
      case 'CONNECTFOUR_DROP': {
        const { col } = payload;
        const res = dropDisc(room.gameState, col, playerUid, playerUids);
        room.gameState = res.newState;

        if (res.roundOver) {
          if (res.winnerUid) {
            room.scores[res.winnerUid] = (room.scores[res.winnerUid] || 0) + 1;
            room.roundWinnerUid = res.winnerUid;
            if (room.scores[res.winnerUid] >= Math.ceil(room.maxRounds / 2)) {
              room.status = 'match_end';
              room.matchWinnerUid = res.winnerUid;
            } else {
              room.status = 'round_end';
            }
          } else if (res.isDraw) {
            room.roundWinnerUid = 'draw';
            room.status = 'round_end';
          }
        }
        break;
      }

      // --- Reaction Rush Tap ---
      case 'REACTION_TAP': {
        const { tapTimestamp } = payload;
        const res = registerReactionTap(room.gameState, playerUid, tapTimestamp, playerUids);
        room.gameState = res.newState;

        if (res.matchOver && res.matchWinnerUid) {
          room.scores[res.matchWinnerUid] = (room.scores[res.matchWinnerUid] || 0) + 1;
          room.matchWinnerUid = res.matchWinnerUid;
          room.status = 'match_end';
        } else if (res.roundOver) {
          room.roundWinnerUid = res.roundWinnerUid;
          // Next round after 2.5s
          setTimeout(() => {
            const currentRoom = this.getStoredRoom(action.roomId);
            if (currentRoom && currentRoom.status === 'playing') {
              currentRoom.gameState = resetReactionNextRound(currentRoom.gameState);
              this.saveAndBroadcast(currentRoom);
            }
          }, 2500);
        }
        break;
      }

      // --- Pong Paddle Move ---
      case 'PONG_PADDLE': {
        const { xPos } = payload;
        room.gameState = updatePongPaddle(room.gameState, playerUid, xPos);
        break;
      }

      // --- Pong Step Physics (Host dispatches) ---
      case 'PONG_STEP': {
        const res = stepPongPhysics(room.gameState, playerUids, room.scores);
        room.gameState = res.newState;

        if (res.scored && res.scorerUid) {
          room.scores[res.scorerUid] = (room.scores[res.scorerUid] || 0) + 1;
          if (res.matchOver) {
            room.status = 'match_end';
            room.matchWinnerUid = res.winnerUid;
          } else {
            // Serve reset after 1.5s
            setTimeout(() => {
              const currentRoom = this.getStoredRoom(action.roomId);
              if (currentRoom && currentRoom.status === 'playing') {
                currentRoom.gameState = resetPongServe(currentRoom.gameState);
                this.saveAndBroadcast(currentRoom);
              }
            }, 1500);
          }
        }
        break;
      }

      // --- Memory Match Flip ---
      case 'MEMORY_FLIP': {
        const { cardIndex } = payload;
        const res = flipMemoryCard(room.gameState, playerUid, cardIndex);
        room.gameState = res.newState;

        if (res.mismatched) {
          // Re-flip back after 800ms
          setTimeout(() => {
            const currentRoom = this.getStoredRoom(action.roomId);
            if (currentRoom) {
              currentRoom.gameState = clearPlayerFlips(currentRoom.gameState, playerUid);
              this.saveAndBroadcast(currentRoom);
            }
          }, 800);
        }

        if (res.gameComplete) {
          if (res.winnerUid && res.winnerUid !== 'draw') {
            room.scores[res.winnerUid] = (room.scores[res.winnerUid] || 0) + 1;
            room.matchWinnerUid = res.winnerUid;
          }
          room.status = 'match_end';
        }
        break;
      }

      // --- Number Blitz Answer ---
      case 'BLITZ_ANSWER': {
        const { chosenIndex } = payload;
        const res = submitBlitzAnswer(room.gameState, playerUid, chosenIndex);
        room.gameState = res.newState;
        break;
      }

      // --- Tap Frenzy Click ---
      case 'FRENZY_TAP': {
        const { targetId } = payload;
        const res = tapTarget(room.gameState, playerUid, targetId);
        room.gameState = res.newState;
        break;
      }

      // --- Obstacle Rush Move ---
      case 'OBSTACLE_MOVE': {
        const { x, y, vx, vy } = payload;
        const res = updateObstaclePlayerPosition(room.gameState, playerUid, x, y, vx, vy);
        room.gameState = res.newState;

        if (res.finished && res.winnerUid) {
          room.scores[res.winnerUid] = (room.scores[res.winnerUid] || 0) + 1;
          room.matchWinnerUid = res.winnerUid;
          room.status = 'match_end';
        }
        break;
      }

      case 'OBSTACLE_RESPAWN': {
        room.gameState = triggerObstacleRespawn(room.gameState, playerUid);
        break;
      }

      // --- Advance to next round ---
      case 'NEXT_ROUND': {
        room.currentRound += 1;
        room.status = 'playing';
        room.roundWinnerUid = null;
        room.gameState = initializeGameState(room.selectedGameId, playerUids);
        break;
      }

      default:
        break;
    }

    room.lastAction = {
      playerId: playerUid,
      actionType: type,
      payload,
      timestamp: Date.now()
    };

    this.saveAndBroadcast(room);
  }
}
