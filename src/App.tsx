import React, { useEffect, useState, useCallback } from 'react';
import { getOrCreatePlayerProfile, updatePlayerStats, type LocalPlayerProfile } from './services/player';
import { soundService } from './services/sound';
import { activeTransport } from './services/transport';
import type { AuthoritativeRoomState } from './types/room';

import { Header } from './components/Header';
import { HomeView } from './components/HomeView';
import { LobbyView } from './components/LobbyView';
import { Scoreboard } from './components/Scoreboard';
import { CountdownOverlay } from './components/CountdownOverlay';
import { RematchModal } from './components/RematchModal';
import { QRCodeModal } from './components/QRCodeModal';
import { ProfileModal } from './components/ProfileModal';
import { GameSwitcherModal } from './components/GameSwitcherModal';
import { ToastContainer, type ToastMessage } from './components/Toast';

// Game View Components
import { TicTacToeView } from './components/games/TicTacToeView';
import { RPSView } from './components/games/RPSView';
import { ConnectFourView } from './components/games/ConnectFourView';
import { ReactionRushView } from './components/games/ReactionRushView';
import { PongView } from './components/games/PongView';
import { ObstacleRushView } from './components/games/ObstacleRushView';
import { MemoryMatchView } from './components/games/MemoryMatchView';
import { NumberBlitzView } from './components/games/NumberBlitzView';
import { TapFrenzyView } from './components/games/TapFrenzyView';

export function App() {
  const [profile, setProfile] = useState<LocalPlayerProfile>(getOrCreatePlayerProfile);
  const [room, setRoom] = useState<AuthoritativeRoomState | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(soundService.getMuted());
  const [showCountdown, setShowCountdown] = useState<boolean>(false);

  // Modals state
  const [showQRModal, setShowQRModal] = useState<boolean>(false);
  const [showProfileModal, setShowProfileModal] = useState<boolean>(false);
  const [showSwitcherModal, setShowSwitcherModal] = useState<boolean>(false);

  // Toast notifications state
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (type: ToastMessage['type'], title: string, message?: string) => {
    const id = 'toast_' + Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Toggle master sound
  const handleToggleMute = () => {
    const muted = soundService.toggleMute();
    setIsMuted(muted);
  };

  // Check URL query param for deep-link room join
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam && !room) {
      handleJoinRoom(roomParam.toUpperCase());
    }
  }, []);

  // Room Subscription & Heartbeat listener
  useEffect(() => {
    if (!room) return;

    // Heartbeat every 3.5s
    const heartbeatTimer = setInterval(() => {
      activeTransport.sendHeartbeat(room.roomId, profile.uid);
    }, 3500);

    // Subscribe to authoritative room updates
    const unsubscribe = activeTransport.subscribe(room.roomId, (updatedRoom) => {
      setRoom(updatedRoom);
    });

    return () => {
      clearInterval(heartbeatTimer);
      unsubscribe();
    };
  }, [room?.roomId, profile.uid]);

  // Handle Match Results Stats Update
  useEffect(() => {
    if (room && room.status === 'match_end') {
      if (room.matchWinnerUid === profile.uid) {
        updatePlayerStats('win');
        setProfile(getOrCreatePlayerProfile());
      } else if (room.matchWinnerUid === 'draw') {
        updatePlayerStats('draw');
        setProfile(getOrCreatePlayerProfile());
      } else if (room.matchWinnerUid && room.matchWinnerUid !== profile.uid) {
        updatePlayerStats('loss');
        setProfile(getOrCreatePlayerProfile());
      }
    }
  }, [room?.status, room?.matchWinnerUid, profile.uid]);

  // AI Practice Rival Move Dispatcher (for single-player testing)
  useEffect(() => {
    if (!room || room.status !== 'playing' || !room.players['bot_rival']) return;
    const botUid = 'bot_rival';

    // 1. Tic-Tac-Toe
    if (room.selectedGameId === 'tictactoe' && room.gameState?.currentTurn === botUid && !room.gameState.winningLine && !room.gameState.isDraw) {
      const openIndices = room.gameState.board
        .map((val: string | null, idx: number) => (val === null ? idx : -1))
        .filter((idx: number) => idx !== -1);
      if (openIndices.length > 0) {
        const choice = openIndices[Math.floor(Math.random() * openIndices.length)];
        const timer = setTimeout(() => {
          activeTransport.dispatchAction({
            type: 'TICTACTOE_MOVE',
            roomId: room.roomId,
            playerUid: botUid,
            payload: { cellIndex: choice },
            timestamp: Date.now()
          });
        }, 600);
        return () => clearTimeout(timer);
      }
    }

    // 2. Connect Four
    if (room.selectedGameId === 'connectfour' && room.gameState?.currentTurn === botUid && !room.gameState.winningCoords) {
      const openCols = [0, 1, 2, 3, 4, 5, 6].filter((c) => room.gameState.grid[0][c] === null);
      if (openCols.length > 0) {
        const choice = openCols[Math.floor(Math.random() * openCols.length)];
        const timer = setTimeout(() => {
          activeTransport.dispatchAction({
            type: 'CONNECTFOUR_DROP',
            roomId: room.roomId,
            playerUid: botUid,
            payload: { col: choice },
            timestamp: Date.now()
          });
        }, 700);
        return () => clearTimeout(timer);
      }
    }

    // 3. Rock Paper Scissors
    if (room.selectedGameId === 'rps' && room.gameState?.phase === 'choosing' && !room.gameState.commits[botUid]) {
      const choices = ['rock', 'paper', 'scissors'];
      const choice = choices[Math.floor(Math.random() * choices.length)];
      const timer = setTimeout(() => {
        activeTransport.dispatchAction({
          type: 'RPS_CHOOSE',
          roomId: room.roomId,
          playerUid: botUid,
          payload: { choice },
          timestamp: Date.now()
        });
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [room?.status, room?.gameState, room?.selectedGameId, room?.roomId, room?.players]);

  // Create Room Flow
  const handleCreateRoom = async (gameId: string, maxRounds: number) => {
    try {
      const playerSession = {
        uid: profile.uid,
        nickname: profile.nickname,
        avatarId: profile.avatarId,
        role: 'host' as const,
        isReady: true,
        isConnected: true,
        lastPing: Date.now(),
        clientVersion: '1.0.0',
        stats: profile.stats
      };

      const newRoomId = await activeTransport.createRoom(playerSession, gameId, maxRounds);
      // Update URL query without full reload
      const newUrl = `${window.location.pathname}?room=${newRoomId}`;
      window.history.pushState({ room: newRoomId }, '', newUrl);

      // Subscribe and set
      activeTransport.subscribe(newRoomId, (r) => setRoom(r));
    } catch (e) {
      console.error('Failed to create room:', e);
    }
  };

  // Join Room Flow
  const handleJoinRoom = async (roomId: string) => {
    try {
      const playerSession = {
        uid: profile.uid,
        nickname: profile.nickname,
        avatarId: profile.avatarId,
        role: 'guest' as const,
        isReady: false,
        isConnected: true,
        lastPing: Date.now(),
        clientVersion: '1.0.0',
        stats: profile.stats
      };

      const res = await activeTransport.joinRoom(roomId, playerSession);
      if (res.success) {
        const newUrl = `${window.location.pathname}?room=${roomId}`;
        window.history.pushState({ room: roomId }, '', newUrl);
        activeTransport.subscribe(roomId, (r) => setRoom(r));
      } else {
        alert(res.error || 'Failed to join room');
      }
    } catch (e) {
      console.error('Failed to join room:', e);
    }
  };

  // Leave Room Flow
  const handleLeaveRoom = async () => {
    if (!room) return;
    soundService.playClick();
    await activeTransport.leaveRoom(room.roomId, profile.uid);
    setRoom(null);
    window.history.pushState({}, '', window.location.pathname);
  };

  // Ready Toggle
  const handleToggleReady = async () => {
    if (!room) return;
    await activeTransport.toggleReady(room.roomId, profile.uid);
  };

  // Start Game with 3-2-1 Countdown
  const handleStartGame = () => {
    if (!room) return;
    setShowCountdown(true);
  };

  const handleCountdownComplete = async () => {
    setShowCountdown(false);
    if (!room) return;
    await activeTransport.startGame(room.roomId);
  };

  // Dispatch game action to authoritative engine
  const handleDispatchAction = useCallback(
    (actionType: string, payload: any) => {
      if (!room) return;
      activeTransport.dispatchAction({
        type: actionType,
        roomId: room.roomId,
        playerUid: profile.uid,
        payload,
        timestamp: Date.now(),
        expectedVersion: room.stateVersion
      });
    },
    [room?.roomId, room?.stateVersion, profile.uid]
  );

  // Rematch Vote
  const handleVoteRematch = async () => {
    if (!room) return;
    await activeTransport.voteRematch(room.roomId, profile.uid);
  };

  // Switch Game
  const handleSwitchGame = async (newGameId: string) => {
    if (!room) return;
    await activeTransport.switchGame(room.roomId, newGameId);
  };

  // Reset to Lobby
  const handleReturnToLobby = async () => {
    if (!room) return;
    await activeTransport.resetRoomToLobby(room.roomId);
  };

  // Test in second window (instant dual-player simulation)
  const handleOpenTestWindow = () => {
    if (!room) return;
    const testUrl = `${window.location.origin}${window.location.pathname}?room=${room.roomId}&simulate=1`;
    window.open(testUrl, '_blank', 'width=450,height=800');
  };

  // Add AI Practice Rival for single-screen testing
  const handleAddBotRival = async () => {
    if (!room) return;
    const botSession = {
      uid: 'bot_rival',
      nickname: 'CyberBot 🤖',
      avatarId: '🤖',
      role: 'guest' as const,
      isReady: true,
      isConnected: true,
      lastPing: Date.now(),
      clientVersion: '1.0.0',
      stats: { wins: 0, losses: 0, draws: 0 }
    };
    await activeTransport.joinRoom(room.roomId, botSession);
  };

  // Render appropriate game canvas
  const renderGameView = () => {
    if (!room || !room.gameState) return null;

    switch (room.selectedGameId) {
      case 'tictactoe':
        return (
          <TicTacToeView
            room={room}
            playerUid={profile.uid}
            onDispatchAction={handleDispatchAction}
          />
        );
      case 'rps':
        return (
          <RPSView
            room={room}
            playerUid={profile.uid}
            onDispatchAction={handleDispatchAction}
          />
        );
      case 'connectfour':
        return (
          <ConnectFourView
            room={room}
            playerUid={profile.uid}
            onDispatchAction={handleDispatchAction}
          />
        );
      case 'reactionrush':
        return (
          <ReactionRushView
            room={room}
            playerUid={profile.uid}
            onDispatchAction={handleDispatchAction}
          />
        );
      case 'pong':
        return (
          <PongView
            room={room}
            playerUid={profile.uid}
            onDispatchAction={handleDispatchAction}
          />
        );
      case 'obstaclerush':
        return (
          <ObstacleRushView
            room={room}
            playerUid={profile.uid}
            onDispatchAction={handleDispatchAction}
          />
        );
      case 'memorymatch':
        return (
          <MemoryMatchView
            room={room}
            playerUid={profile.uid}
            onDispatchAction={handleDispatchAction}
          />
        );
      case 'numberblitz':
        return (
          <NumberBlitzView
            room={room}
            playerUid={profile.uid}
            onDispatchAction={handleDispatchAction}
          />
        );
      case 'tapfrenzy':
        return (
          <TapFrenzyView
            room={room}
            playerUid={profile.uid}
            onDispatchAction={handleDispatchAction}
          />
        );
      default:
        return (
          <TicTacToeView
            room={room}
            playerUid={profile.uid}
            onDispatchAction={handleDispatchAction}
          />
        );
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-primary)] text-slate-100 selection:bg-violet-500 selection:text-white">
      {/* Header Bar */}
      <Header
        room={room}
        playerUid={profile.uid}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        onShowQR={() => setShowQRModal(true)}
        onOpenTestWindow={handleOpenTestWindow}
        onLeaveRoom={handleLeaveRoom}
        onOpenProfile={() => setShowProfileModal(true)}
        playerAvatar={profile.avatarId}
        playerNickname={profile.nickname}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center justify-center p-3 sm:p-6 w-full">
        {!room ? (
          // Landing & Home View
          <HomeView
            profile={profile}
            onCreateRoom={handleCreateRoom}
            onJoinRoom={handleJoinRoom}
            onOpenProfile={() => setShowProfileModal(true)}
          />
        ) : room.status === 'waiting' || room.status === 'ready' ? (
          // Lobby View
          <LobbyView
            room={room}
            playerUid={profile.uid}
            onToggleReady={handleToggleReady}
            onStartGame={handleStartGame}
            onOpenGameSwitcher={() => setShowSwitcherModal(true)}
            onOpenQR={() => setShowQRModal(true)}
            onOpenTestWindow={handleOpenTestWindow}
            onAddBotRival={handleAddBotRival}
            onNotifyToast={addToast}
          />
        ) : (
          // Active Gameplay View
          <div className="w-full flex flex-col items-center flex-1 justify-center">
            <Scoreboard room={room} playerUid={profile.uid} />
            {renderGameView()}
          </div>
        )}
      </main>

      {/* Synchronized 3-2-1 Countdown Overlay */}
      {showCountdown && (
        <CountdownOverlay onComplete={handleCountdownComplete} />
      )}

      {/* Universal Rematch & Match Results Modal */}
      {room && (room.status === 'match_end' || room.status === 'round_end') && (
        <RematchModal
          room={room}
          playerUid={profile.uid}
          onVoteRematch={handleVoteRematch}
          onSwitchGame={() => setShowSwitcherModal(true)}
          onReturnToLobby={handleReturnToLobby}
        />
      )}

      {/* QR Code Scanner Modal */}
      {room && (
        <QRCodeModal
          roomId={room.roomId}
          isOpen={showQRModal}
          onClose={() => setShowQRModal(false)}
        />
      )}

      {/* Player Profile Modal */}
      <ProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        profile={profile}
        onUpdateProfile={(updated) => setProfile(updated)}
      />

      {/* Game Switcher Modal */}
      {room && (
        <GameSwitcherModal
          isOpen={showSwitcherModal}
          onClose={() => setShowSwitcherModal(false)}
          currentGameId={room.selectedGameId}
          onSelectGame={handleSwitchGame}
        />
      )}

      {/* Instant Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default App;
