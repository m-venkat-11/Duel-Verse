import Peer, { type DataConnection } from 'peerjs';
import type { AuthoritativeRoomState, PlayerSession, RoomAction } from '../../types/room';
import type { IRoomTransport, TransportConnectionStatus } from './types';
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
    | 'MATCH_CONFIG'
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

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  { urls: 'stun:openrelay.metered.ca:80' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

export class WebRTCTransport implements IRoomTransport {
  private broadcast: BroadcastTransport = new BroadcastTransport();
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private hostConnection: DataConnection | null = null;
  private activeRoomId: string | null = null;
  private isHost: boolean = false;
  private localPlayer: PlayerSession | null = null;
  private listeners: Map<string, Set<(room: AuthoritativeRoomState) => void>> = new Map();
  private statusListeners: Set<(status: TransportConnectionStatus) => void> = new Set();
  private connectionStatus: TransportConnectionStatus = 'idle';
  private latestRemoteRoom: AuthoritativeRoomState | null = null;
  private outboundQueue: WebRTCMessage[] = [];
  private isReconnectingGuest: boolean = false;
  private lifecycleAttached: boolean = false;

  constructor() {
    this.attachBrowserLifecycle();
  }

  private setStatus(status: TransportConnectionStatus) {
    if (this.connectionStatus === status) return;
    this.connectionStatus = status;
    this.statusListeners.forEach((cb) => cb(status));
  }

  public subscribeStatus(cb: (status: TransportConnectionStatus) => void): () => void {
    this.statusListeners.add(cb);
    cb(this.connectionStatus);
    return () => {
      this.statusListeners.delete(cb);
    };
  }

  public getRoomSnapshot(roomId: string): AuthoritativeRoomState | null {
    const formattedId = roomId.toUpperCase().trim();
    if (!this.isHost && this.latestRemoteRoom?.roomId === formattedId) {
      return this.latestRemoteRoom;
    }
    return this.broadcast.getStoredRoomDirect(formattedId);
  }

  private attachBrowserLifecycle() {
    if (this.lifecycleAttached || typeof window === 'undefined') return;
    this.lifecycleAttached = true;

    const resumeConnection = () => {
      if (!this.activeRoomId) return;

      // Mobile Safari / Chrome background suspend recovery when user switches apps (e.g. WhatsApp share)
      if (this.peer && !this.peer.destroyed && this.peer.disconnected) {
        try {
          this.peer.reconnect();
        } catch {
          // Will re-init below if needed
        }
      }

      if (this.isHost && (!this.peer || this.peer.destroyed)) {
        this.bindHostPeer(this.activeRoomId);
      } else if (!this.isHost && this.localPlayer && (!this.hostConnection || !this.hostConnection.open)) {
        this.attemptGuestReconnect();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          resumeConnection();
        }
      });
    }
    window.addEventListener('online', resumeConnection);
  }

  private createPeerInstance(customId?: string): Promise<Peer> {
    return new Promise((resolve, reject) => {
      const options = {
        config: {
          iceServers: DEFAULT_ICE_SERVERS,
          iceCandidatePoolSize: 4,
        },
        pingInterval: 5000,
      };

      const peer = customId ? new Peer(customId, options) : new Peer(options);
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          if (peer.open) {
            this.peer = peer;
            resolve(peer);
          } else {
            resolve(peer);
          }
        }
      }, 5000);

      peer.on('open', () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          this.peer = peer;
          resolve(peer);
        }
      });

      peer.on('disconnected', () => {
        // Keep signaling channel alive if a room is open
        if (this.activeRoomId && !peer.destroyed) {
          this.setStatus('reconnecting');
          setTimeout(() => {
            if (this.activeRoomId && !peer.destroyed && peer.disconnected) {
              try {
                peer.reconnect();
              } catch {
                // ignore
              }
            }
          }, 900);
        }
      });

      peer.on('error', (err: any) => {
        console.warn('WebRTC PeerJS Notice:', err?.type || err?.message || err);
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          if (err?.type === 'unavailable-id') {
            reject(err);
          } else {
            this.peer = peer;
            resolve(peer);
          }
        }
      });
    });
  }

  private async initPeer(customId?: string): Promise<Peer> {
    if (this.peer && !this.peer.destroyed) {
      if (this.peer.disconnected) {
        try {
          this.peer.reconnect();
        } catch {
          // recreate below if reconnect throws
        }
      }
      if (!customId || this.peer.id === customId) {
        return this.peer;
      }
      this.peer.destroy();
      this.peer = null;
    }
    return this.createPeerInstance(customId);
  }

  private async bindHostPeer(roomId: string) {
    const cleanId = cleanRoomCode(roomId);
    const hostPeerId = getHostPeerId(cleanId);

    try {
      if (this.peer) {
        this.peer.destroy();
        this.peer = null;
      }
      const peer = await this.createPeerInstance(hostPeerId);
      peer.on('connection', (conn) => {
        this.setupHostConnection(conn, roomId);
      });
      this.setStatus(this.connections.size > 0 ? 'connected_p2p' : 'hosting');
    } catch (e) {
      console.warn('Could not bind WebRTC host peer ID, continuing locally:', e);
      this.setStatus('hosting');
    }
  }

  public async createRoom(
    hostPlayer: PlayerSession,
    initialGameId: string,
    maxRounds: number = 3
  ): Promise<string> {
    this.isHost = true;
    this.localPlayer = hostPlayer;
    this.latestRemoteRoom = null;
    this.connections.clear();
    this.setStatus('connecting');

    const roomId = await this.broadcast.createRoom(hostPlayer, initialGameId, maxRounds);
    this.activeRoomId = roomId;

    await this.bindHostPeer(roomId);
    return roomId;
  }

  private setupHostConnection(conn: DataConnection, roomId: string) {
    conn.on('open', () => {
      this.connections.set(conn.peer, conn);
      this.setStatus('connected_p2p');

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
            // Ensure Host React listener is updated even before subscribe() settles
            this.notifyLocalListeners(roomId, current);
            this.broadcastToGuests({ type: 'ROOM_UPDATE', payload: current });
          }
          break;
        }

        case 'ACTION': {
          await this.broadcast.dispatchAction(msg.payload.action);
          break;
        }

        case 'READY': {
          await this.broadcast.toggleReady(roomId, msg.payload.playerUid);
          break;
        }

        case 'START': {
          await this.broadcast.startGame(roomId);
          break;
        }

        case 'REMATCH': {
          await this.broadcast.voteRematch(roomId, msg.payload.playerUid);
          break;
        }

        case 'SWITCH_GAME': {
          await this.broadcast.switchGame(roomId, msg.payload.newGameId);
          break;
        }

        case 'RESET_LOBBY': {
          await this.broadcast.resetRoomToLobby(roomId);
          break;
        }

        case 'MATCH_CONFIG': {
          await this.broadcast.updateMatchConfig(roomId, msg.payload.maxRounds, msg.payload.difficulty);
          break;
        }

        case 'HEARTBEAT': {
          await this.broadcast.sendHeartbeat(roomId, msg.payload.playerUid);
          break;
        }

        case 'LEAVE': {
          await this.broadcast.leaveRoom(roomId, msg.payload.playerUid);
          this.connections.delete(conn.peer);
          if (this.connections.size === 0) this.setStatus('hosting');
          break;
        }
      }
    });

    conn.on('close', () => {
      this.connections.delete(conn.peer);
      if (this.connections.size === 0 && this.activeRoomId) {
        this.setStatus('hosting');
      }
    });
  }

  private broadcastToGuests(msg: WebRTCMessage) {
    this.connections.forEach((conn) => {
      if (conn.open) {
        try {
          conn.send(msg);
        } catch {
          // ignore transient channel send error
        }
      }
    });
  }

  private connectToHostOnce(formattedId: string, player: PlayerSession, timeoutMs: number): Promise<{ success: boolean; error?: string }> {
    const cleanId = cleanRoomCode(formattedId);
    const hostPeerId = getHostPeerId(cleanId);

    return new Promise(async (resolve) => {
      try {
        const peer = await this.initPeer();
        if (peer.destroyed) {
          this.peer = null;
          await this.initPeer();
        }
      } catch {
        resolve({ success: false, error: 'Unable to initialize P2P connection.' });
        return;
      }

      if (!this.peer || this.peer.destroyed) {
        resolve({ success: false, error: 'PeerJS signaling unavailable.' });
        return;
      }

      let settled = false;
      const done = (res: { success: boolean; error?: string }) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          resolve(res);
        }
      };

      const timeout = setTimeout(() => {
        try {
          conn?.close();
        } catch {}
        done({
          success: false,
          error: `Could not reach Host "${formattedId}". Make sure your friend keeps the DuelVerse room open!`,
        });
      }, timeoutMs);

      const conn = this.peer.connect(hostPeerId, { reliable: true });
      this.hostConnection = conn;

      conn.on('open', () => {
        this.setStatus('connected_p2p');
        conn.send({ type: 'JOIN', payload: { player } });
        this.flushOutboundQueue();
      });

      conn.on('data', (raw: any) => {
        const msg = raw as WebRTCMessage;
        if (!msg) return;

        if (msg.type === 'JOIN_ACK') {
          if (msg.payload.success) {
            if (msg.payload.room) {
              this.latestRemoteRoom = msg.payload.room;
              this.notifyLocalListeners(formattedId, msg.payload.room);
            }
            done({ success: true });
          } else {
            done({ success: false, error: msg.payload.error || 'Failed to join room' });
          }
        } else if (msg.type === 'ROOM_UPDATE' && msg.payload) {
          this.latestRemoteRoom = msg.payload;
          this.notifyLocalListeners(formattedId, msg.payload);
        }
      });

      conn.on('close', () => {
        if (this.activeRoomId === formattedId && !this.isHost) {
          this.setStatus('reconnecting');
          this.attemptGuestReconnect();
        }
      });

      conn.on('error', (err: any) => {
        done({ success: false, error: 'Connection failed: ' + (err?.message || 'Host unreachable') });
      });
    });
  }

  private async attemptGuestReconnect() {
    if (this.isHost || this.isReconnectingGuest || !this.activeRoomId || !this.localPlayer) return;
    this.isReconnectingGuest = true;
    const roomId = this.activeRoomId;
    const player = this.localPlayer;

    for (let i = 0; i < 3; i++) {
      if (this.hostConnection?.open || !this.activeRoomId || this.activeRoomId !== roomId) break;
      const res = await this.connectToHostOnce(roomId, player, 4000);
      if (res.success) break;
      await new Promise((r) => setTimeout(r, 900));
    }

    this.isReconnectingGuest = false;
  }

  private flushOutboundQueue() {
    if (!this.hostConnection || !this.hostConnection.open) return;
    while (this.outboundQueue.length > 0) {
      const msg = this.outboundQueue.shift();
      if (msg) {
        try {
          this.hostConnection.send(msg);
        } catch {
          break;
        }
      }
    }
  }

  private sendToHostOrQueue(msg: WebRTCMessage) {
    if (this.hostConnection && this.hostConnection.open) {
      this.hostConnection.send(msg);
      return true;
    }
    if (!this.isHost && this.activeRoomId && this.localPlayer) {
      if (this.outboundQueue.length < 15) {
        this.outboundQueue.push(msg);
      }
      this.attemptGuestReconnect();
      return true;
    }
    return false;
  }

  public async joinRoom(
    roomId: string,
    player: PlayerSession
  ): Promise<{ success: boolean; error?: string }> {
    const formattedId = roomId.toUpperCase().trim();
    this.activeRoomId = formattedId;

    const isBot = player.uid === 'bot_rival' || player.uid.startsWith('bot_');
    if (!isBot) {
      this.localPlayer = player;
    }

    // 1. Try same-browser local room first (single device 2-tab test or adding CyberBot)
    const localRes = await this.broadcast.joinRoom(formattedId, player);
    if (localRes.success) {
      if (!isBot && !this.isHost) {
        this.isHost = false;
      }
      this.setStatus(this.isHost ? (this.connections.size > 0 ? 'connected_p2p' : 'hosting') : 'connected_p2p');
      return localRes;
    }

    // 2. Remote mobile/PC over WebRTC PeerJS with auto-retry (handles Host app-switch wakeups!)
    if (!isBot) {
      this.isHost = false;
    }
    this.setStatus('connecting');

    let lastErr = `Room "${formattedId}" not found. Make sure the host has the room open!`;
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await this.connectToHostOnce(formattedId, player, 4200);
      if (res.success) {
        this.setStatus('connected_p2p');
        return res;
      }
      if (res.error) lastErr = res.error;
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 700));
      }
    }

    this.setStatus('idle');
    this.activeRoomId = null;
    return { success: false, error: lastErr };
  }

  public async leaveRoom(roomId: string, playerUid: string): Promise<void> {
    this.activeRoomId = null;
    this.outboundQueue = [];
    this.latestRemoteRoom = null;

    if (this.isHost) {
      await this.broadcast.leaveRoom(roomId, playerUid);
      this.broadcastToGuests({ type: 'LEAVE', payload: { playerUid } });
      this.connections.forEach((c) => {
        try { c.close(); } catch {}
      });
      this.connections.clear();
    } else if (this.hostConnection) {
      if (this.hostConnection.open) {
        try {
          this.hostConnection.send({ type: 'LEAVE', payload: { playerUid } });
        } catch {}
      }
      try {
        this.hostConnection.close();
      } catch {}
      this.hostConnection = null;
    }

    this.setStatus('idle');
  }

  public subscribe(roomId: string, onUpdate: (room: AuthoritativeRoomState) => void): () => void {
    if (!this.listeners.has(roomId)) {
      this.listeners.set(roomId, new Set());
    }
    this.listeners.get(roomId)!.add(onUpdate);

    if (this.latestRemoteRoom && this.latestRemoteRoom.roomId === roomId) {
      onUpdate(this.latestRemoteRoom);
    }

    const unsubBroadcast = this.broadcast.subscribe(roomId, (room) => {
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
      return;
    }
    if (!this.sendToHostOrQueue({ type: 'ACTION', payload: { action } })) {
      await this.broadcast.dispatchAction(action);
    }
  }

  public async sendHeartbeat(roomId: string, playerUid: string): Promise<void> {
    if (this.isHost) {
      await this.broadcast.sendHeartbeat(roomId, playerUid);
      return;
    }
    if (this.hostConnection && this.hostConnection.open) {
      this.hostConnection.send({ type: 'HEARTBEAT', payload: { playerUid } });
    } else if (!this.latestRemoteRoom) {
      await this.broadcast.sendHeartbeat(roomId, playerUid);
    }
  }

  public async toggleReady(roomId: string, playerUid: string): Promise<void> {
    if (this.isHost) {
      await this.broadcast.toggleReady(roomId, playerUid);
      return;
    }
    if (!this.sendToHostOrQueue({ type: 'READY', payload: { playerUid } })) {
      await this.broadcast.toggleReady(roomId, playerUid);
    }
  }

  public async startGame(roomId: string): Promise<void> {
    if (this.isHost) {
      await this.broadcast.startGame(roomId);
      return;
    }
    if (!this.sendToHostOrQueue({ type: 'START', payload: {} })) {
      await this.broadcast.startGame(roomId);
    }
  }

  public async voteRematch(roomId: string, playerUid: string): Promise<void> {
    if (this.isHost) {
      await this.broadcast.voteRematch(roomId, playerUid);
      return;
    }
    if (!this.sendToHostOrQueue({ type: 'REMATCH', payload: { playerUid } })) {
      await this.broadcast.voteRematch(roomId, playerUid);
    }
  }

  public async switchGame(roomId: string, newGameId: string): Promise<void> {
    if (this.isHost) {
      await this.broadcast.switchGame(roomId, newGameId);
      return;
    }
    if (!this.sendToHostOrQueue({ type: 'SWITCH_GAME', payload: { newGameId } })) {
      await this.broadcast.switchGame(roomId, newGameId);
    }
  }

  public async resetRoomToLobby(roomId: string): Promise<void> {
    if (this.isHost) {
      await this.broadcast.resetRoomToLobby(roomId);
      return;
    }
    if (!this.sendToHostOrQueue({ type: 'RESET_LOBBY', payload: {} })) {
      await this.broadcast.resetRoomToLobby(roomId);
    }
  }

  public async updateMatchConfig(roomId: string, maxRounds: number, difficulty?: string): Promise<void> {
    if (this.isHost) {
      await this.broadcast.updateMatchConfig(roomId, maxRounds, difficulty);
      return;
    }
    if (!this.sendToHostOrQueue({ type: 'MATCH_CONFIG', payload: { maxRounds, difficulty } })) {
      await this.broadcast.updateMatchConfig(roomId, maxRounds, difficulty);
    }
  }
}
