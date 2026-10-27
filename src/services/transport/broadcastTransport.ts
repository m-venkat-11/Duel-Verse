import type { AuthoritativeRoomState, PlayerSession, RoomAction } from '../../types/room';
import type { IRoomTransport } from './types';
import { initializeGameState } from '../../engine';
import { processTicTacToeMove, createTicTacToeInitialState } from '../../engine/tictactoeEngine';
import { commitRPSChoice, resetRPSNextRound } from '../../engine/rpsEngine';
import { dropDisc, createConnectFourInitialState } from '../../engine/connectFourEngine';
import { registerReactionTap, resetReactionNextRound } from '../../engine/reactionRushEngine';
import { updatePongPaddle, stepPongPhysics, resetPongServe } from '../../engine/pongEngine';
import { flipMemoryCard, clearPlayerFlips } from '../../engine/memoryMatchEngine';
import { submitBlitzAnswer } from '../../engine/numberBlitzEngine';
import { registerTugTap, resetTapWarRound } from '../../engine/tapFrenzyEngine';
import { switchRunnerLane, registerRunnerFinish } from '../../engine/obstacleRushEngine';
import { registerTankKill } from '../../engine/tankDuelEngine';
import { registerSlapStrike } from '../../engine/slapDuelEngine';
import { registerKnifeThrow, createKnifeMasterInitialState } from '../../engine/knifeMasterEngine';
import { registerSumoRingOut } from '../../engine/sumoSpinEngine';

function generateRoomCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 6; i++) {
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

  public getStoredRoomDirect(roomId: string): AuthoritativeRoomState | null {
    return this.getStoredRoom(roomId);
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

    const initialGameState = initializeGameState(initialGameId, [hostPlayer.uid], maxRounds);

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
    room.gameState = initializeGameState(room.selectedGameId, playerUids, room.maxRounds || 3);

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
    room.gameState = initializeGameState(room.selectedGameId, playerUids, room.maxRounds || 3);
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

    // Check opponent connection status (grace period: 25s without ping)
    Object.values(room.players).forEach((p) => {
      // Practice AI bots are locally simulated and never disconnect
      if (p.uid === 'bot_rival' || p.uid.startsWith('bot_') || p.nickname.includes('Bot')) {
        p.isConnected = true;
        p.lastPing = now;
        return;
      }
      if (p.uid !== playerUid && now - p.lastPing > 25000) {
        p.isConnected = false;
      }
    });

    this.saveAndBroadcast(room);
  }

  public async voteRematch(roomId: string, playerUid: string): Promise<void> {
    const room = this.getStoredRoom(roomId);
    if (!room) return;

    room.rematchVotes[playerUid] = true;
    if (room.players['bot_rival'] || Object.keys(room.players).some(uid => uid.startsWith('bot_'))) {
      room.rematchVotes['bot_rival'] = true;
    }

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
      room.gameState = initializeGameState(room.selectedGameId, playerUids, room.maxRounds || 3);
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
    room.gameState = initializeGameState(newGameId, playerUids, room.maxRounds || 3);
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
    room.gameState = initializeGameState(room.selectedGameId, playerUids, room.maxRounds || 3);

    this.saveAndBroadcast(room);
  }

  public async updateMatchConfig(roomId: string, maxRounds: number, difficulty?: string): Promise<void> {
    const formattedId = roomId.toUpperCase().trim();
    const room = this.getStoredRoom(formattedId);
    if (!room) return;

    room.maxRounds = maxRounds;
    if (difficulty) {
      room.gameConfig.difficulty = difficulty as any;
    }
    const playerUids = Object.keys(room.players);
    room.gameState = initializeGameState(room.selectedGameId, playerUids, maxRounds);
    room.updatedAt = Date.now();
    this.saveAndBroadcast(room);
  }

  public async dispatchAction(action: RoomAction): Promise<void> {
    const room = this.getStoredRoom(action.roomId);
    if (!room) return;

    const playerUids = Object.keys(room.players);
    const { type, payload } = action;
    const playerUid = payload?.actingUid || payload?.playerUid || action.playerUid;

    // Authoritative Action Reducers
    switch (type) {
      // --- Match Configuration Update ---
      case 'SET_MATCH_CONFIG': {
        const { maxRounds, difficulty } = payload;
        if (maxRounds) {
          room.maxRounds = maxRounds;
          room.gameState = initializeGameState(room.selectedGameId, playerUids, maxRounds);
        }
        if (difficulty) {
          room.gameConfig.difficulty = difficulty;
        }
        break;
      }
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
              // Smooth auto-advance to next round after 1.8 seconds
              setTimeout(() => {
                const currentRoom = this.getStoredRoom(action.roomId);
                if (currentRoom && currentRoom.status === 'playing') {
                  currentRoom.currentRound += 1;
                  currentRoom.roundWinnerUid = null;
                  currentRoom.gameState = createTicTacToeInitialState(playerUids);
                  this.saveAndBroadcast(currentRoom);
                }
              }, 1800);
            }
          } else if (res.isDraw) {
            room.roundWinnerUid = 'draw';
            setTimeout(() => {
              const currentRoom = this.getStoredRoom(action.roomId);
              if (currentRoom && currentRoom.status === 'playing') {
                currentRoom.currentRound += 1;
                currentRoom.roundWinnerUid = null;
                currentRoom.gameState = createTicTacToeInitialState(playerUids);
                this.saveAndBroadcast(currentRoom);
              }
            }, 1800);
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
              // Smooth auto-advance to next round after 1.8 seconds
              setTimeout(() => {
                const currentRoom = this.getStoredRoom(action.roomId);
                if (currentRoom && currentRoom.status === 'playing') {
                  currentRoom.currentRound += 1;
                  currentRoom.roundWinnerUid = null;
                  currentRoom.gameState = createConnectFourInitialState(playerUids);
                  this.saveAndBroadcast(currentRoom);
                }
              }, 1800);
            }
          } else if (res.isDraw) {
            room.roundWinnerUid = 'draw';
            setTimeout(() => {
              const currentRoom = this.getStoredRoom(action.roomId);
              if (currentRoom && currentRoom.status === 'playing') {
                currentRoom.currentRound += 1;
                currentRoom.roundWinnerUid = null;
                currentRoom.gameState = createConnectFourInitialState(playerUids);
                this.saveAndBroadcast(currentRoom);
              }
            }, 1800);
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

      // --- Tank Duel Kill ---
      case 'TANK_KILL':
      case 'TANK_HIT': {
        const { killerUid, victimUid } = payload;
        const res = registerTankKill(room.gameState, killerUid, victimUid);
        room.gameState = res.newState;
        if (killerUid && room.players[killerUid]) {
          room.scores[killerUid] = (room.scores[killerUid] || 0) + 1;
          if (res.matchOver) {
            room.status = 'match_end';
            room.matchWinnerUid = res.matchWinnerUid;
          }
        }
        break;
      }

      // --- Pong Goal (Authoritative) ---
      case 'PONG_GOAL': {
        const { scorerUid } = payload;
        if (scorerUid && room.players[scorerUid]) {
          room.scores[scorerUid] = (room.scores[scorerUid] || 0) + 1;
          const targetScore = room.maxRounds || room.gameState?.targetScore || 5;
          if (room.scores[scorerUid] >= targetScore) {
            room.status = 'match_end';
            room.matchWinnerUid = scorerUid;
          }
        }
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
      case 'BLITZ_ANSWER':
      case 'NUMBERBLITZ_ANSWER': {
        const { chosenIndex } = payload;
        const res = submitBlitzAnswer(room.gameState, playerUid, chosenIndex);
        room.gameState = res.newState;
        break;
      }

      // --- Tap War / Tap Frenzy Mash ---
      case 'TAP_WAR_MASH':
      case 'FRENZY_TAP':
      case 'TAPFRENZY_TAP': {
        const { p1Uid, multiplier } = payload;
        const res = registerTugTap(room.gameState, playerUid, p1Uid || playerUids[0], multiplier || 1.0);
        room.gameState = res.newState;

        if (res.roundOver && res.roundWinnerUid) {
          room.scores[res.roundWinnerUid] = (room.scores[res.roundWinnerUid] || 0) + 1;
          if (res.matchOver) {
            room.status = 'match_end';
            room.matchWinnerUid = res.matchWinnerUid;
          } else {
            // Auto-advance round after 1.6s
            setTimeout(() => {
              const currentRoom = this.getStoredRoom(action.roomId);
              if (currentRoom && currentRoom.status === 'playing') {
                currentRoom.gameState = resetTapWarRound(currentRoom.gameState);
                this.saveAndBroadcast(currentRoom);
              }
            }, 1600);
          }
        }
        break;
      }

      // --- Obstacle Rush Runner ---
      case 'RUNNER_LANE': {
        const { targetLane } = payload;
        room.gameState = switchRunnerLane(room.gameState, playerUid, targetLane);
        break;
      }

      case 'RUNNER_FINISH': {
        const { winnerUid } = payload;
        const res = registerRunnerFinish(room.gameState, winnerUid);
        room.gameState = res.newState;
        if (winnerUid && room.players[winnerUid]) {
          room.scores[winnerUid] = (room.scores[winnerUid] || 0) + 1;
          const targetWins = room.maxRounds || room.gameState?.targetWins || 3;
          if (res.matchOver || room.scores[winnerUid] >= targetWins) {
            room.status = 'match_end';
            room.matchWinnerUid = winnerUid;
          }
        }
        break;
      }

      // --- Slap Duel Strike ---
      case 'SLAP_STRIKE': {
        const { attackerUid, isDodging } = payload;
        const res = registerSlapStrike(room.gameState, attackerUid, isDodging);
        room.gameState = res.newState;

        if (res.landed && attackerUid && room.players[attackerUid]) {
          room.scores[attackerUid] = (room.scores[attackerUid] || 0) + 1;
          if (res.matchOver) {
            room.status = 'match_end';
            room.matchWinnerUid = res.matchWinnerUid;
          }
        }
        break;
      }

      // --- Knife Master Throw ---
      case 'KNIFE_THROW': {
        const { wheelAngle } = payload;
        const res = registerKnifeThrow(room.gameState, playerUid, wheelAngle);
        room.gameState = res.newState;

        if (res.roundOver && res.roundWinnerUid) {
          room.scores[res.roundWinnerUid] = (room.scores[res.roundWinnerUid] || 0) + 1;
          if (res.matchOver) {
            room.status = 'match_end';
            room.matchWinnerUid = res.matchWinnerUid;
          } else {
            // Reset blades for next round after 1.8s
            setTimeout(() => {
              const currentRoom = this.getStoredRoom(action.roomId);
              if (currentRoom && currentRoom.status === 'playing') {
                currentRoom.gameState = createKnifeMasterInitialState(playerUids, currentRoom.gameState.targetScore);
                this.saveAndBroadcast(currentRoom);
              }
            }, 1800);
          }
        }
        break;
      }

      // --- Sumo Spinners Ring Out ---
      case 'SUMO_RING_OUT': {
        const { fallenUid } = payload;
        const res = registerSumoRingOut(room.gameState, fallenUid);
        room.gameState = res.newState;

        if (res.winnerUid && room.players[res.winnerUid]) {
          room.scores[res.winnerUid] = (room.scores[res.winnerUid] || 0) + 1;
          if (res.matchOver) {
            room.status = 'match_end';
            room.matchWinnerUid = res.matchWinnerUid;
          }
        }
        break;
      }

      // --- Advance to next round ---
      case 'NEXT_ROUND': {
        room.currentRound += 1;
        room.status = 'playing';
        room.roundWinnerUid = null;
        room.gameState = initializeGameState(room.selectedGameId, playerUids, room.maxRounds || 3);
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
