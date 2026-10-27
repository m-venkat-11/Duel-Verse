import Peer, { type DataConnection } from 'peerjs';
import type { AuthoritativeRoomState, PlayerSession, RoomAction } from '../../types/room';
import type { IRoomTransport } from './types';
import { BroadcastTransport } from './broadcastTransport';

interface WebRTCMessage {
  type:
    | 'JOIN'
    | 'JOIN_ACK'
    | 'ROOM_UPDATE'
    | 'ACTION'
    | 'READY'
    | 'START'
    | 'REMATCH'
    | 'SWITCH_GAME'
    | 'RESET_LOBBY'
    | 'HEARTBEAT'
    | 'LEAVE';
  payload?: any;
}

function cleanRoomCode(roomId: string): string {
  return roomId.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getHostPeerId(cleanId: string): string {
  return `dv_host_${cleanId}`;
}

export class WebRTCTransport implements IRoomTransport {
  private broadcast: BroadcastTransport = new BroadcastTransport();
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private hostConnection: DataConnection | null = null;
  private activeRoomId: string | null = null;
  private isHost: boolean = false;
  private localPlayerUid: string | null = null;
  private listeners: Map<string, Set<(room: AuthoritativeRoomState) => void>> = new Map();
  private latestRemoteRoom: AuthoritativeRoomState | null = null;

  private initPeer(customId?: string): Promise<Peer> {
    return new Promise((resolve) => {
      if (this.peer && !this.peer.destroyed) {
        resolve(this.peer);
        return;
      }

      const peer = customId
        ? new Peer(customId, {
            config: {
              iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:global.stun.twilio.com:3478' }
              ]
            }
          })
        : new Peer({
            config: {
              iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:global.stun.twilio.com:3478' }
              ]
            }
          });

      peer.on('open', () => {
        this.peer = peer;
        resolve(peer);
      });

      peer.on('error', (err) => {
        console.warn('WebRTC PeerJS Notice:', err.message || err);
        // If ID taken or error, still resolve to avoid hanging
        resolve(peer);
      });

      // Timeout fallback
      setTimeout(() => {
        resolve(peer);
      }, 4000);
    });
  }

  public async createRoom(
    hostPlayer: PlayerSession,
    initialGameId: string,
    maxRounds: number = 3
  ): Promise<string> {
    this.isHost = true;
    this.localPlayerUid = hostPlayer.uid;

    // 1. Authoritative local room created via broadcast engine
    const roomId = await this.broadcast.createRoom(hostPlayer, initialGameId, maxRounds);
    this.activeRoomId = roomId;

    // 2. Open PeerJS Host listener so external phones/PCs can join
    const cleanId = cleanRoomCode(roomId);
    const hostPeerId = getHostPeerId(cleanId);

    try {
      if (this.peer) {
        this.peer.destroy();
        this.peer = null;
      }
      const peer = await this.initPeer(hostPeerId);

      peer.on('connection', (conn) => {
        this.setupHostConnection(conn, roomId);
      });
    } catch (e) {
      console.warn('Could not bind WebRTC host peer ID, continuing with local sync:', e);
    }

    return roomId;
  }

  private setupHostConnection(conn: DataConnection, roomId: string) {
    conn.on('open', () => {
      this.connections.set(conn.peer, conn);

      // Send immediate current room state to guest
      const current = this.broadcast.getStoredRoomDirect(roomId);
      if (current) {
        conn.send({ type: 'ROOM_UPDATE', payload: current });
      }
    });

    conn.on('data', async (raw: any) => {
      const msg = raw as WebRTCMessage;
      if (!msg || !msg.type) return;

      switch (msg.type) {
        case 'JOIN': {
          const res = await this.broadcast.joinRoom(roomId, msg.payload.player);
          const current = this.broadcast.getStoredRoomDirect(roomId);
          conn.send({ type: 'JOIN_ACK', payload: { success: res.success, error: res.error, room: current } });
          if (current) {
            this.broadcastToGuests({ type: 'ROOM_UPDATE', payload: current });
          }
          break;
        }

        case 'ACTION': {
          await this.broadcast.dispatchAction(msg.payload.action);
          const current = this.broadcast.getStoredRoomDirect(roomId);
          if (current) {
            this.broadcastToGuests({ type: 'ROOM_UPDATE', payload: current });
          }
          break;
        }

        case 'READY': {
          await this.broadcast.toggleReady(roomId, msg.payload.playerUid);
          const current = this.broadcast.getStoredRoomDirect(roomId);
          if (current) {
            this.broadcastToGuests({ type: 'ROOM_UPDATE', payload: current });
          }
          break;
        }

        case 'START': {
          await this.broadcast.startGame(roomId);
          const current = this.broadcast.getStoredRoomDirect(roomId);
          if (current) {
            this.broadcastToGuests({ type: 'ROOM_UPDATE', payload: current });
          }
          break;
        }

        case 'REMATCH': {
          await this.broadcast.voteRematch(roomId, msg.payload.playerUid);
          const current = this.broadcast.getStoredRoomDirect(roomId);
          if (current) {
            this.broadcastToGuests({ type: 'ROOM_UPDATE', payload: current });
          }
          break;
        }

        case 'SWITCH_GAME': {
          await this.broadcast.switchGame(roomId, msg.payload.newGameId);
          const current = this.broadcast.getStoredRoomDirect(roomId);
          if (current) {
            this.broadcastToGuests({ type: 'ROOM_UPDATE', payload: current });
          }
          break;
        }

        case 'RESET_LOBBY': {
          await this.broadcast.resetRoomToLobby(roomId);
          const current = this.broadcast.getStoredRoomDirect(roomId);
          if (current) {
            this.broadcastToGuests({ type: 'ROOM_UPDATE', payload: current });
          }
          break;
        }

        case 'HEARTBEAT': {
          await this.broadcast.sendHeartbeat(roomId, msg.payload.playerUid);
          break;
        }

        case 'LEAVE': {
          await this.broadcast.leaveRoom(roomId, msg.payload.playerUid);
          this.connections.delete(conn.peer);
          const current = this.broadcast.getStoredRoomDirect(roomId);
          if (current) {
            this.broadcastToGuests({ type: 'ROOM_UPDATE', payload: current });
          }
          break;
        }
      }
    });

    conn.on('close', () => {
      this.connections.delete(conn.peer);
    });
  }

  private broadcastToGuests(msg: WebRTCMessage) {
    this.connections.forEach((conn) => {
      if (conn.open) {
        conn.send(msg);
      }
    });
  }

  public async joinRoom(
    roomId: string,
    player: PlayerSession
  ): Promise<{ success: boolean; error?: string }> {
    const formattedId = roomId.toUpperCase().trim();
    this.activeRoomId = formattedId;

    const isBot = player.uid === 'bot_rival' || player.uid.startsWith('bot_');
    if (!isBot) {
      this.localPlayerUid = player.uid;
    }

    // 1. Try local room first (same computer multi-tab or host adding bot)
    const localRes = await this.broadcast.joinRoom(formattedId, player);
    if (localRes.success) {
      if (!isBot && !this.isHost) {
        this.isHost = false;
      }
      return localRes;
    }

    // 2. If not local, connect via WebRTC to the Host's Peer
    if (!isBot) {
      this.isHost = false;
    }
    const cleanId = cleanRoomCode(formattedId);
    const hostPeerId = getHostPeerId(cleanId);

    try {
      const peer = await this.initPeer();

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          resolve({
            success: false,
            error: `Room "${formattedId}" not found. Verify the room code or make sure the host has the room open!`
          });
        }, 8000);

        const conn = peer.connect(hostPeerId, { reliable: true });
        this.hostConnection = conn;

        conn.on('open', () => {
          conn.send({ type: 'JOIN', payload: { player } });
        });

        conn.on('data', (raw: any) => {
          const msg = raw as WebRTCMessage;
          if (!msg) return;

          if (msg.type === 'JOIN_ACK') {
            clearTimeout(timeout);
            if (msg.payload.success) {
              if (msg.payload.room) {
                this.latestRemoteRoom = msg.payload.room;
                this.notifyLocalListeners(formattedId, msg.payload.room);
              }
              resolve({ success: true });
            } else {
              resolve({ success: false, error: msg.payload.error || 'Failed to join room' });
            }
          } else if (msg.type === 'ROOM_UPDATE' && msg.payload) {
            this.latestRemoteRoom = msg.payload;
            this.notifyLocalListeners(formattedId, msg.payload);
          }
        });

        conn.on('error', (err) => {
          clearTimeout(timeout);
          resolve({ success: false, error: 'WebRTC Connection error: ' + (err.message || 'Host unreachable') });
        });
      });
    } catch (e: any) {
      return { success: false, error: e?.message || 'Unable to connect to host over WebRTC' };
    }
  }

  public async leaveRoom(roomId: string, playerUid: string): Promise<void> {
    if (this.isHost) {
      await this.broadcast.leaveRoom(roomId, playerUid);
      this.broadcastToGuests({ type: 'LEAVE', payload: { playerUid } });
    } else if (this.hostConnection && this.hostConnection.open) {
      this.hostConnection.send({ type: 'LEAVE', payload: { playerUid } });
      this.hostConnection.close();
      this.hostConnection = null;
    }
  }

  public subscribe(roomId: string, onUpdate: (room: AuthoritativeRoomState) => void): () => void {
    if (!this.listeners.has(roomId)) {
      this.listeners.set(roomId, new Set());
    }
    this.listeners.get(roomId)!.add(onUpdate);

    // Initial notify from local or remote
    if (this.latestRemoteRoom && this.latestRemoteRoom.roomId === roomId) {
      onUpdate(this.latestRemoteRoom);
    }

    // Subscribe to broadcast transport for host or local guest
    const unsubBroadcast = this.broadcast.subscribe(roomId, (room) => {
      // Whenever host updates authoritative state, mirror to guests
      if (this.isHost) {
        this.broadcastToGuests({ type: 'ROOM_UPDATE', payload: room });
      }
      onUpdate(room);
    });

    return () => {
      unsubBroadcast();
      const subs = this.listeners.get(roomId);
      if (subs) {
        subs.delete(onUpdate);
      }
    };
  }

  private notifyLocalListeners(roomId: string, room: AuthoritativeRoomState) {
    const subs = this.listeners.get(roomId);
    if (subs) {
      subs.forEach((cb) => cb(room));
    }
  }

  public async dispatchAction(action: RoomAction): Promise<void> {
    if (this.isHost) {
      await this.broadcast.dispatchAction(action);
      const current = this.broadcast.getStoredRoomDirect(action.roomId);
      if (current) {
        this.broadcastToGuests({ type: 'ROOM_UPDATE', payload: current });
      }
    } else if (this.hostConnection && this.hostConnection.open) {
      this.hostConnection.send({ type: 'ACTION', payload: { action } });
    } else {
      await this.broadcast.dispatchAction(action);
    }
  }

  public async sendHeartbeat(roomId: string, playerUid: string): Promise<void> {
    if (this.isHost) {
      await this.broadcast.sendHeartbeat(roomId, playerUid);
    } else if (this.hostConnection && this.hostConnection.open) {
      this.hostConnection.send({ type: 'HEARTBEAT', payload: { playerUid } });
    } else {
      await this.broadcast.sendHeartbeat(roomId, playerUid);
    }
  }

  public async toggleReady(roomId: string, playerUid: string): Promise<void> {
    if (this.isHost) {
      await this.broadcast.toggleReady(roomId, playerUid);
      const current = this.broadcast.getStoredRoomDirect(roomId);
      if (current) {
        this.broadcastToGuests({ type: 'ROOM_UPDATE', payload: current });
      }
    } else if (this.hostConnection && this.hostConnection.open) {
      this.hostConnection.send({ type: 'READY', payload: { playerUid } });
    } else {
      await this.broadcast.toggleReady(roomId, playerUid);
    }
  }

  public async startGame(roomId: string): Promise<void> {
    if (this.isHost) {
      await this.broadcast.startGame(roomId);
      const current = this.broadcast.getStoredRoomDirect(roomId);
      if (current) {
        this.broadcastToGuests({ type: 'ROOM_UPDATE', payload: current });
      }
    } else if (this.hostConnection && this.hostConnection.open) {
      this.hostConnection.send({ type: 'START', payload: {} });
    } else {
      await this.broadcast.startGame(roomId);
    }
  }

  public async voteRematch(roomId: string, playerUid: string): Promise<void> {
    if (this.isHost) {
      await this.broadcast.voteRematch(roomId, playerUid);
      const current = this.broadcast.getStoredRoomDirect(roomId);
      if (current) {
        this.broadcastToGuests({ type: 'ROOM_UPDATE', payload: current });
      }
    } else if (this.hostConnection && this.hostConnection.open) {
      this.hostConnection.send({ type: 'REMATCH', payload: { playerUid } });
    } else {
      await this.broadcast.voteRematch(roomId, playerUid);
    }
  }

  public async switchGame(roomId: string, newGameId: string): Promise<void> {
    if (this.isHost) {
      await this.broadcast.switchGame(roomId, newGameId);
      const current = this.broadcast.getStoredRoomDirect(roomId);
      if (current) {
        this.broadcastToGuests({ type: 'ROOM_UPDATE', payload: current });
      }
    } else if (this.hostConnection && this.hostConnection.open) {
      this.hostConnection.send({ type: 'SWITCH_GAME', payload: { newGameId } });
    } else {
      await this.broadcast.switchGame(roomId, newGameId);
    }
  }

  public async resetRoomToLobby(roomId: string): Promise<void> {
    if (this.isHost) {
      await this.broadcast.resetRoomToLobby(roomId);
      const current = this.broadcast.getStoredRoomDirect(roomId);
      if (current) {
        this.broadcastToGuests({ type: 'ROOM_UPDATE', payload: current });
      }
    } else if (this.hostConnection && this.hostConnection.open) {
      this.hostConnection.send({ type: 'RESET_LOBBY', payload: {} });
    } else {
      await this.broadcast.resetRoomToLobby(roomId);
    }
  }

  public async updateMatchConfig(roomId: string, maxRounds: number, difficulty?: string): Promise<void> {
    if (this.isHost) {
      await this.broadcast.updateMatchConfig(roomId, maxRounds, difficulty);
      const current = this.broadcast.getStoredRoomDirect(roomId);
      if (current) {
        this.broadcastToGuests({ type: 'ROOM_UPDATE', payload: current });
      }
    } else if (this.hostConnection && this.hostConnection.open) {
      this.hostConnection.send({ type: 'MATCH_CONFIG', payload: { maxRounds, difficulty } as any });
    } else {
      await this.broadcast.updateMatchConfig(roomId, maxRounds, difficulty);
    }
  }
}
