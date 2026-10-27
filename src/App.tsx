import React, { useEffect, useState, useCallback, useRef } from 'react';
import { getOrCreatePlayerProfile, updatePlayerStats, type LocalPlayerProfile } from './services/player';
import { soundService } from './services/sound';
import { activeTransport } from './services/transport';
import type { AuthoritativeRoomState } from './types/room';

import { Header } from './components/Header';
import { HomeView } from './components/HomeView';
import { LobbyView } from './components/LobbyView';
import { Scoreboard } from './components/Scoreboard';
import { ArenaStage } from './components/ArenaStage';
import { CountdownOverlay } from './components/CountdownOverlay';
import { RematchModal } from './components/RematchModal';
import { QRCodeModal } from './components/QRCodeModal';
import { ProfileModal } from './components/ProfileModal';
import { GameSwitcherModal } from './components/GameSwitcherModal';
import { ToastContainer, type ToastMessage } from './components/Toast';
import { IntroScreen } from './components/IntroScreen';

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
import { TankDuelView } from './components/games/TankDuelView';
import { SlapDuelView } from './components/games/SlapDuelView';
import { KnifeMasterView } from './components/games/KnifeMasterView';
import { SumoSpinView } from './components/games/SumoSpinView';
import {
  getCyberBotTicTacToeMove,
  getCyberBotConnectFourMove,
  getCyberBotRPSChoice,
  getCyberBotReactionDelay,
  getCyberBotMathAnswer,
  type BotDifficulty
} from './engine/cyberBotAi';

export function App() {
  const [profile, setProfile] = useState<LocalPlayerProfile>(getOrCreatePlayerProfile);
  const [room, setRoom] = useState<AuthoritativeRoomState | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(soundService.getMuted());
  const [showCountdown, setShowCountdown] = useState<boolean>(false);
  const [showIntro, setShowIntro] = useState<boolean>(() => {
    // If user opened with direct room invite link, bypass intro directly into room
    const hasRoomParam = typeof window !== 'undefined' && Boolean(new URLSearchParams(window.location.search).get('room'));
    if (hasRoomParam) return false;
    return true;
  });
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('master');
  const rpsHistoryRef = useRef<Array<{ humanChoice: string; botChoice: string; winner: string | null }>>([]);
  const cardMemoryRef = useRef<Map<number, string>>(new Map());

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

  const roomRef = React.useRef<AuthoritativeRoomState | null>(room);
  roomRef.current = room;

  // Room Subscription & Heartbeat listener
  useEffect(() => {
    if (!room) return;

    // Heartbeat every 3s using live ref to avoid stale closures
    const heartbeatTimer = setInterval(() => {
      const live = roomRef.current;
      if (!live) return;
      activeTransport.sendHeartbeat(live.roomId, profile.uid);
      if (live.players['bot_rival']) {
        activeTransport.sendHeartbeat(live.roomId, 'bot_rival');
      }
    }, 3000);

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

  // AI Practice Rival Move Dispatcher (Master-tier competitive AI for ALL games)
  useEffect(() => {
    if (!room || room.status !== 'playing' || !room.players['bot_rival'] || !room.gameState) return;
    const botUid = 'bot_rival';
    const gs = room.gameState;

    // 1. Tic-Tac-Toe (Unbeatable Minimax on Master)
    if (room.selectedGameId === 'tictactoe' && gs.currentTurn === botUid && !gs.winningLine && !gs.isDraw) {
      const choice = getCyberBotTicTacToeMove(gs.board, botUid, profile.uid, botDifficulty);
      if (choice !== -1) {
        const timer = setTimeout(() => {
          activeTransport.dispatchAction({
            type: 'TICTACTOE_MOVE',
            roomId: room.roomId,
            playerUid: botUid,
            payload: { cellIndex: choice },
            timestamp: Date.now()
          });
        }, 420);
        return () => clearTimeout(timer);
      }
    }

    // 2. Connect Four (Tactical Multi-step Lookahead)
    if (room.selectedGameId === 'connectfour' && gs.currentTurn === botUid && !gs.winningCoords) {
      const choice = getCyberBotConnectFourMove(gs.grid, botUid, profile.uid, botDifficulty);
      if (choice !== -1) {
        const timer = setTimeout(() => {
          activeTransport.dispatchAction({
            type: 'CONNECTFOUR_DROP',
            roomId: room.roomId,
            playerUid: botUid,
            payload: { col: choice },
            timestamp: Date.now()
          });
        }, 480);
        return () => clearTimeout(timer);
      }
    }

    // 3. Rock Paper Scissors (Adaptive Psychological Markov Prediction)
    if (room.selectedGameId === 'rps') {
      if (gs.phase === 'revealed' && gs.choices[profile.uid] && gs.choices[botUid]) {
        // Track round history
        const lastEntry = rpsHistoryRef.current[rpsHistoryRef.current.length - 1];
        if (!lastEntry || lastEntry.humanChoice !== gs.choices[profile.uid]) {
          rpsHistoryRef.current.push({
            humanChoice: gs.choices[profile.uid],
            botChoice: gs.choices[botUid],
            winner: gs.roundWinner === profile.uid ? 'human' : gs.roundWinner === botUid ? 'bot' : null
          });
        }
      } else if (gs.phase === 'choosing' && !gs.commits[botUid]) {
        const choice = getCyberBotRPSChoice(rpsHistoryRef.current, botDifficulty);
        const timer = setTimeout(() => {
          activeTransport.dispatchAction({
            type: 'RPS_CHOOSE',
            roomId: room.roomId,
            playerUid: botUid,
            payload: { choice },
            timestamp: Date.now()
          });
        }, 450);
        return () => clearTimeout(timer);
      }
    }

    // 4. Reaction Rush (Superhuman sub-210ms reflex on Master)
    if (room.selectedGameId === 'reactionrush' && gs.phase === 'countdown' && !gs.reactionTimes?.[botUid]) {
      const delayUntilSignal = Math.max(0, gs.signalScheduledAt - Date.now());
      const botReactionMs = getCyberBotReactionDelay(botDifficulty);
      const timer = setTimeout(() => {
        activeTransport.dispatchAction({
          type: 'REACTION_TAP',
          roomId: room.roomId,
          playerUid: botUid,
          payload: { tapTimestamp: Date.now() },
          timestamp: Date.now()
        });
      }, delayUntilSignal + botReactionMs);
      return () => clearTimeout(timer);
    }

    // 5. Number Blitz (Lightning mental math with 96% accuracy on Master)
    if (room.selectedGameId === 'numberblitz') {
      const botQIdx = gs.playerQuestionIndex?.[botUid] || 0;
      const q = gs.questions?.[botQIdx];
      if (q) {
        const { chosenIndex, delayMs } = getCyberBotMathAnswer(q.correctIndex, botDifficulty);
        const timer = setTimeout(() => {
          activeTransport.dispatchAction({
            type: 'BLITZ_ANSWER',
            roomId: room.roomId,
            playerUid: botUid,
            payload: { chosenIndex },
            timestamp: Date.now()
          });
        }, delayMs);
        return () => clearTimeout(timer);
      }
    }

    // 6. Memory Match (Photographic Neural Memory Tracking)
    if (room.selectedGameId === 'memorymatch') {
      // Remember any cards currently revealed or flipped by either player
      gs.cards?.forEach((c: any, idx: number) => {
        const isFlippedByHuman = gs.playerFlips?.[profile.uid]?.includes(idx);
        const isFlippedByBot = gs.playerFlips?.[botUid]?.includes(idx);
        if (isFlippedByHuman || isFlippedByBot || c.isMatched) {
          cardMemoryRef.current.set(idx, c.pairId);
        }
      });

      const flips = gs.playerFlips?.[botUid] || [];
      if (flips.length < 2) {
        let chosenCardIndex = -1;
        const unmatched = gs.cards
          ?.map((c: any, idx: number) => (!c.isMatched && !flips.includes(idx) ? idx : -1))
          .filter((idx: number) => idx !== -1);

        if (unmatched && unmatched.length > 0) {
          if (flips.length === 1) {
            // Card 1 is already flipped: does Bot remember where its twin is?
            const card1 = gs.cards[flips[0]];
            if (card1) {
              for (const [knownIdx, pairId] of cardMemoryRef.current.entries()) {
                if (knownIdx !== flips[0] && pairId === card1.pairId && !gs.cards[knownIdx]?.isMatched) {
                  chosenCardIndex = knownIdx;
                  break;
                }
              }
            }
          } else if (flips.length === 0) {
            // Check if Bot already knows any pair in memory
            const pairMap: Record<string, number[]> = {};
            for (const [knownIdx, pairId] of cardMemoryRef.current.entries()) {
              if (!gs.cards[knownIdx]?.isMatched) {
                if (!pairMap[pairId]) pairMap[pairId] = [];
                pairMap[pairId].push(knownIdx);
              }
            }
            for (const indices of Object.values(pairMap)) {
              if (indices.length >= 2) {
                chosenCardIndex = indices[0];
                break;
              }
            }
          }

          if (chosenCardIndex === -1) {
            // Pick unvisited card if possible, else random unmatched
            const unvisited = unmatched.filter((idx: number) => !cardMemoryRef.current.has(idx));
            chosenCardIndex = unvisited.length > 0
              ? unvisited[Math.floor(Math.random() * unvisited.length)]
              : unmatched[Math.floor(Math.random() * unmatched.length)];
          }

          const timer = setTimeout(() => {
            activeTransport.dispatchAction({
              type: 'MEMORY_FLIP',
              roomId: room.roomId,
              playerUid: botUid,
              payload: { cardIndex: chosenCardIndex },
              timestamp: Date.now()
            });
          }, 450);
          return () => clearTimeout(timer);
        }
      }
    }

    // Note: Real-time physics/reflex games (tankduel, tapfrenzy, obstaclerush, slapduel, knifemaster, sumospin, pong)
    // execute their sub-millisecond AI combat loops directly within their respective component GameLoops.
  }, [room?.status, room?.gameState, room?.selectedGameId, room?.roomId, room?.players, botDifficulty]);

  // Create Room Flow (Supports withBot for instant practice launch)
  const handleCreateRoom = async (gameId: string, maxRounds: number = 3, withBot: boolean = false) => {
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
      const newUrl = `${window.location.pathname}?room=${newRoomId}`;
      window.history.pushState({ room: newRoomId }, '', newUrl);

      if (withBot) {
        const botPlayer = {
          uid: 'bot_rival',
          nickname: 'CyberBot ⚡',
          avatarId: '🤖',
          role: 'guest' as const,
          isReady: true,
          isConnected: true,
          lastPing: Date.now(),
          clientVersion: '1.0.0',
          stats: { wins: 0, losses: 0, draws: 0 }
        };
        await activeTransport.joinRoom(newRoomId, botPlayer);
        await activeTransport.startGame(newRoomId);
      }

      // Subscribe and set
      activeTransport.subscribe(newRoomId, (r) => setRoom(r));
    } catch (e) {
      console.error('Failed to create room:', e);
    }
  };

  // Join Room Flow with Automatic Code Normalization
  const handleJoinRoom = async (roomId: string) => {
    try {
      const clean = roomId.trim().toUpperCase();
      const normalizedRoomId = clean.startsWith('DV-') ? clean : `DV-${clean}`;
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

      const res = await activeTransport.joinRoom(normalizedRoomId, playerSession);
      if (res.success) {
        const newUrl = `${window.location.pathname}?room=${normalizedRoomId}`;
        window.history.pushState({ room: normalizedRoomId }, '', newUrl);
        activeTransport.subscribe(normalizedRoomId, (r) => setRoom(r));
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
      case 'tankduel':
        return (
          <TankDuelView
            room={room}
            playerUid={profile.uid}
            onDispatchAction={handleDispatchAction}
          />
        );
      case 'slapduel':
        return (
          <SlapDuelView
            room={room}
            playerUid={profile.uid}
            onDispatchAction={handleDispatchAction}
          />
        );
      case 'knifemaster':
        return (
          <KnifeMasterView
            room={room}
            playerUid={profile.uid}
            onDispatchAction={handleDispatchAction}
          />
        );
      case 'sumospin':
        return (
          <SumoSpinView
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
      {/* Cinematic Intro Title Animation Screen */}
      {showIntro && (
        <IntroScreen onEnter={() => setShowIntro(false)} />
      )}

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
        onShowIntro={() => setShowIntro(true)}
        playerAvatar={profile.avatarId}
        playerNickname={profile.nickname}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center w-full p-2 sm:p-4">
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
            onLeaveRoom={handleLeaveRoom}
            onNotifyToast={addToast}
          />
        ) : (
          // Active Gameplay View with Full Arena Framing
          <ArenaStage
            room={room}
            playerUid={profile.uid}
            botDifficulty={botDifficulty}
            onSetBotDifficulty={(d) => setBotDifficulty(d)}
            onLeaveRoom={handleLeaveRoom}
            isMuted={isMuted}
            onToggleMute={handleToggleMute}
          >
            {renderGameView()}
          </ArenaStage>
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
