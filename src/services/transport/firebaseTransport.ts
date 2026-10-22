import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously, type Auth } from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  type Firestore,
  type Unsubscribe
} from 'firebase/firestore';
import type { AuthoritativeRoomState, PlayerSession, RoomAction } from '../../types/room';
import type { IRoomTransport } from './types';
import { BroadcastTransport } from './broadcastTransport';

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
}

export class FirebaseTransport implements IRoomTransport {
  private app: FirebaseApp | null = null;
  private auth: Auth | null = null;
  private db: Firestore | null = null;
  private fallback: BroadcastTransport = new BroadcastTransport();
  private isConfigured: boolean = false;

  constructor() {
    this.initFirebase();
  }

  private initFirebase() {
    // Check environment variables or local storage for user config
    const envConfig = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID
    };

    let activeConfig: FirebaseConfig | null = null;

    if (envConfig.apiKey && envConfig.projectId) {
      activeConfig = envConfig as FirebaseConfig;
    } else {
      try {
        const stored = localStorage.getItem('duelverse_firebase_config');
        if (stored) {
          activeConfig = JSON.parse(stored);
        }
      } catch {
        // Fallback
      }
    }

    if (activeConfig && activeConfig.apiKey && activeConfig.projectId) {
      try {
        this.app = initializeApp(activeConfig);
        this.auth = getAuth(this.app);
        this.db = getFirestore(this.app);
        this.isConfigured = true;

        signInAnonymously(this.auth).catch((err) => {
          console.warn('[Firebase Auth] Anonymous sign-in notice:', err);
        });
      } catch (e) {
        console.warn('[Firebase] Initialization error, falling back to BroadcastTransport:', e);
        this.isConfigured = false;
      }
    }
  }

  public getIsConfigured(): boolean {
    return this.isConfigured;
  }

  public setCustomConfig(config: FirebaseConfig) {
    try {
      localStorage.setItem('duelverse_firebase_config', JSON.stringify(config));
      this.initFirebase();
    } catch {
      // Storage error
    }
  }

  public async createRoom(
    hostPlayer: PlayerSession,
    initialGameId: string,
    maxRounds: number = 3
  ): Promise<string> {
    if (!this.isConfigured || !this.db) {
      return this.fallback.createRoom(hostPlayer, initialGameId, maxRounds);
    }

    const roomId = 'DV-' + Math.random().toString(36).substring(2, 6).toUpperCase();
    const now = Date.now();

    hostPlayer.role = 'host';
    hostPlayer.isReady = true;
    hostPlayer.isConnected = true;
    hostPlayer.lastPing = now;

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
      players: { [hostPlayer.uid]: hostPlayer },
      scores: { [hostPlayer.uid]: 0 },
      rematchVotes: {},
      gameConfig: { difficulty: 'medium', roundDurationSec: 60 },
      gameState: null
    };

    const roomRef = doc(this.db, 'rooms', roomId);
    await setDoc(roomRef, room);
    return roomId;
  }

  public async joinRoom(
    roomId: string,
    player: PlayerSession
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.isConfigured || !this.db) {
      return this.fallback.joinRoom(roomId, player);
    }

    const formattedId = roomId.toUpperCase().trim();
    const roomRef = doc(this.db, 'rooms', formattedId);
    const snap = await getDoc(roomRef);

    if (!snap.exists()) {
      return { success: false, error: 'Room not found in cloud database.' };
    }

    const room = snap.data() as AuthoritativeRoomState;
    const now = Date.now();

    if (!room.players[player.uid] && Object.keys(room.players).length >= room.maxPlayers) {
      return { success: false, error: 'Room is already full.' };
    }

    player.role = 'guest';
    player.isConnected = true;
    player.lastPing = now;

    await updateDoc(roomRef, {
      [`players.${player.uid}`]: player,
      [`scores.${player.uid}`]: room.scores[player.uid] || 0,
      updatedAt: now,
      stateVersion: room.stateVersion + 1
    });

    return { success: true };
  }

  public async leaveRoom(roomId: string, playerUid: string): Promise<void> {
    if (!this.isConfigured || !this.db) {
      return this.fallback.leaveRoom(roomId, playerUid);
    }
  }

  public subscribe(roomId: string, onUpdate: (room: AuthoritativeRoomState) => void): () => void {
    if (!this.isConfigured || !this.db) {
      return this.fallback.subscribe(roomId, onUpdate);
    }

    const roomRef = doc(this.db, 'rooms', roomId);
    const unsub: Unsubscribe = onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        onUpdate(snapshot.data() as AuthoritativeRoomState);
      }
    });

    return () => unsub();
  }

  public async dispatchAction(action: RoomAction): Promise<void> {
    return this.fallback.dispatchAction(action);
  }

  public async sendHeartbeat(roomId: string, playerUid: string): Promise<void> {
    return this.fallback.sendHeartbeat(roomId, playerUid);
  }

  public async toggleReady(roomId: string, playerUid: string): Promise<void> {
    return this.fallback.toggleReady(roomId, playerUid);
  }

  public async startGame(roomId: string): Promise<void> {
    return this.fallback.startGame(roomId);
  }

  public async voteRematch(roomId: string, playerUid: string): Promise<void> {
    return this.fallback.voteRematch(roomId, playerUid);
  }

  public async switchGame(roomId: string, newGameId: string): Promise<void> {
    return this.fallback.switchGame(roomId, newGameId);
  }

  public async resetRoomToLobby(roomId: string): Promise<void> {
    return this.fallback.resetRoomToLobby(roomId);
  }
}
