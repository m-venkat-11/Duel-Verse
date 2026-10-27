import React, { useState, useEffect, useRef } from 'react';
import type { AuthoritativeRoomState } from '../../types/room';
import type { SlapDuelState } from '../../engine/slapDuelEngine';
import { soundService } from '../../services/sound';
import { Swords, Shield, Zap, Flame, Sparkles } from 'lucide-react';

interface SlapDuelViewProps {
  room: AuthoritativeRoomState<SlapDuelState>;
  playerUid: string;
  onDispatchAction: (type: string, payload: any) => void;
}

export const SlapDuelView: React.FC<SlapDuelViewProps> = ({
  room,
  playerUid,
  onDispatchAction
}) => {
  const gameState = room.gameState;
  const players = Object.keys(room.players);
  const p1Uid = players[0] || 'p1';
  const p2Uid = players[1] || 'p2';
  const isP1 = playerUid === p1Uid;
  const isHost = room.hostUid === playerUid;
  const isBotPlaying = Boolean(room.players['bot_rival'] || p2Uid === 'bot_rival');

  const p1Nickname = room.players[p1Uid]?.nickname || 'Player 1';
  const p2Nickname = room.players[p2Uid]?.nickname || 'CyberBot';

  const isAttacker = gameState.attackerUid === playerUid;

  const [handAnim, setHandAnim] = useState<'idle' | 'slap' | 'dodge' | 'hit'>('idle');
  const [opHandAnim, setOpHandAnim] = useState<'idle' | 'slap' | 'dodge' | 'hit'>('idle');
  const [screenFlash, setScreenFlash] = useState<boolean>(false);
  const [roundMessage, setRoundMessage] = useState<string | null>(null);

  const isDodgingRef = useRef(false);

  const handleAttackerSlap = () => {
    if (!isAttacker || handAnim !== 'idle') return;

    setHandAnim('slap');
    soundService.playImpact(1.4);

    // Check if opponent is dodging
    const dodged = isDodgingRef.current;

    setTimeout(() => {
      if (dodged) {
        soundService.playFalseStart();
        setRoundMessage('💨 MISSED! DEFENDER DODGED!');
        setHandAnim('idle');
        setOpHandAnim('idle');
        onDispatchAction('SLAP_STRIKE', { attackerUid: playerUid, isDodging: true });
      } else {
        // Landed!
        soundService.playGoal();
        setScreenFlash(true);
        setOpHandAnim('hit');
        setRoundMessage('💥 SLAP LANDED! +1 POINT!');
        setTimeout(() => setScreenFlash(false), 200);

        setTimeout(() => {
          setHandAnim('idle');
          setOpHandAnim('idle');
          setRoundMessage(null);
        }, 800);

        onDispatchAction('SLAP_STRIKE', { attackerUid: playerUid, isDodging: false });
      }
    }, 180);
  };

  const handleDefenderDodge = () => {
    if (isAttacker || handAnim !== 'idle') return;

    isDodgingRef.current = true;
    setHandAnim('dodge');
    soundService.playMove();

    // Dodge lasts 400ms window
    setTimeout(() => {
      isDodgingRef.current = false;
      setHandAnim('idle');
    }, 450);
  };

  const handleFeint = () => {
    if (!isAttacker || handAnim !== 'idle') return;

    setHandAnim('slap');
    soundService.playClick();
    setTimeout(() => setHandAnim('idle'), 100);
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (isAttacker) handleAttackerSlap();
        else handleDefenderDodge();
      } else if (e.key.toLowerCase() === 'f' && isAttacker) {
        handleFeint();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAttacker, handAnim]);

  // CyberBot AI
  useEffect(() => {
    if (!isHost || !isBotPlaying) return;

    const botIsAttacker = gameState.attackerUid === p2Uid;

    if (botIsAttacker) {
      // Bot attacks after random suspense delay (1.2s - 2.8s)
      const timer = setTimeout(() => {
        setOpHandAnim('slap');
        soundService.playImpact(1.4);

        setTimeout(() => {
          const humanDodged = isDodgingRef.current;
          if (humanDodged) {
            soundService.playFalseStart();
            setRoundMessage('💨 YOU DODGED! ROLES SWAP!');
            setOpHandAnim('idle');
            setHandAnim('idle');
            onDispatchAction('SLAP_STRIKE', { attackerUid: p2Uid, actingUid: p2Uid, isDodging: true });
          } else {
            soundService.playGoal();
            setScreenFlash(true);
            setHandAnim('hit');
            setRoundMessage('💥 BOT SLAPPED YOU!');
            setTimeout(() => setScreenFlash(false), 200);

            setTimeout(() => {
              setOpHandAnim('idle');
              setHandAnim('idle');
              setRoundMessage(null);
            }, 800);

            onDispatchAction('SLAP_STRIKE', { attackerUid: p2Uid, actingUid: p2Uid, isDodging: false });
          }
        }, 180);
      }, 1400 + Math.random() * 1200);

      return () => clearTimeout(timer);
    } else {
      // Bot is defending: 70% chance to dodge if player slaps
      if (handAnim === 'slap') {
        const willDodge = Math.random() < 0.65;
        if (willDodge) {
          isDodgingRef.current = true;
          setOpHandAnim('dodge');
          setTimeout(() => {
            isDodgingRef.current = false;
            setOpHandAnim('idle');
          }, 450);
        }
      }
    }
  }, [isHost, isBotPlaying, gameState.attackerUid, handAnim, onDispatchAction]);

  const p1Score = gameState.scores?.[p1Uid] || 0;
  const p2Score = gameState.scores?.[p2Uid] || 0;
  const targetScore = room.maxRounds || gameState.targetScore || 5;

  return (
    <div className={`w-full max-w-lg mx-auto flex flex-col items-center select-none gap-3 px-2 transition-colors duration-100 ${
      screenFlash ? 'bg-rose-950/40' : ''
    }`}>
      {/* Top HUD Score Header */}
      <div className="w-full flex items-center justify-between px-4 py-2.5 rounded-2xl bg-slate-900/90 border border-slate-700/60 text-xs font-black font-mono shadow-md backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="text-amber-400 font-bold">{p1Nickname}</span>
          <div className="flex gap-1">
            {Array.from({ length: targetScore }).map((_, i) => (
              <div
                key={i}
                className={`w-3.5 h-3.5 rounded-full border transition-all ${
                  i < p1Score
                    ? 'bg-amber-400 border-amber-300 shadow-[0_0_8px_#f59e0b]'
                    : 'bg-slate-800 border-slate-700'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="px-3 py-1 rounded-full bg-violet-600/20 text-violet-300 border border-violet-500/40 text-[11px] font-mono">
          FIRST TO {targetScore} SLAPS
        </div>

        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {Array.from({ length: targetScore }).map((_, i) => (
              <div
                key={i}
                className={`w-3.5 h-3.5 rounded-full border transition-all ${
                  i < p2Score
                    ? 'bg-cyan-400 border-cyan-300 shadow-[0_0_8px_#06b6d4]'
                    : 'bg-slate-800 border-slate-700'
                }`}
              />
            ))}
          </div>
          <span className="text-cyan-400 font-bold">{p2Nickname}</span>
        </div>
      </div>

      {/* Role Banner */}
      <div className={`w-full py-2.5 px-4 rounded-2xl text-center font-black font-['Outfit'] text-sm sm:text-base border-2 shadow-lg flex items-center justify-center gap-2 ${
        isAttacker
          ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-amber-500/20 animate-pulse'
          : 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-cyan-500/20'
      }`}>
        {isAttacker ? (
          <>
            <Swords className="w-5 h-5" />
            <span>YOU ARE ATTACKING — SLAP OR FEINT!</span>
          </>
        ) : (
          <>
            <Shield className="w-5 h-5" />
            <span>YOU ARE DEFENDING — WATCH AND DODGE!</span>
          </>
        )}
      </div>

      {/* 3D Slap Battle Arena */}
      <div
        className="w-full aspect-[4/5] rounded-3xl p-6 border-2 border-violet-500/30 relative overflow-hidden flex flex-col justify-between items-center shadow-2xl"
        style={{
          background: 'radial-gradient(ellipse at center, #111827 0%, #030712 100%)',
          boxShadow: '0 0 50px rgba(139, 92, 246, 0.15), inset 0 2px 6px rgba(255, 255, 255, 0.1)'
        }}
      >
        {/* Table Felt Center Line */}
        <div className="absolute inset-x-8 top-1/2 h-0.5 border-t border-dashed border-white/10 pointer-events-none" />

        {/* OPPONENT HAND (Top) */}
        <div className="w-full flex flex-col items-center relative transition-transform duration-150">
          <span className="text-[11px] font-mono text-cyan-400 font-bold mb-2">
            {isAttacker ? '🛡️ DEFENDER' : '⚔️ ATTACKER'}
          </span>
          <div
            className={`w-36 h-36 sm:w-44 sm:h-44 rounded-3xl flex items-center justify-center text-7xl sm:text-8xl transition-all duration-150 select-none ${
              opHandAnim === 'slap'
                ? 'translate-y-24 scale-125 rotate-6 text-rose-400 drop-shadow-[0_0_30px_#f43f5e]'
                : opHandAnim === 'dodge'
                ? '-translate-y-12 scale-90 opacity-60'
                : opHandAnim === 'hit'
                ? 'scale-110 text-rose-500 animate-wiggle drop-shadow-[0_0_35px_#f43f5e]'
                : 'translate-y-0 text-cyan-300'
            }`}
          >
            {opHandAnim === 'hit' ? '💥' : '🖐️'}
          </div>
        </div>

        {/* Round Notification Banner */}
        {roundMessage && (
          <div className="z-20 px-4 py-2 rounded-xl bg-slate-900/90 border-2 border-white/20 text-white font-mono font-bold text-sm text-center shadow-2xl animate-bounce">
            {roundMessage}
          </div>
        )}

        {/* PLAYER HAND (Bottom) */}
        <div className="w-full flex flex-col items-center relative transition-transform duration-150">
          <div
            className={`w-36 h-36 sm:w-44 sm:h-44 rounded-3xl flex items-center justify-center text-7xl sm:text-8xl transition-all duration-150 select-none ${
              handAnim === 'slap'
                ? '-translate-y-24 scale-125 -rotate-6 text-amber-400 drop-shadow-[0_0_30px_#f59e0b]'
                : handAnim === 'dodge'
                ? 'translate-y-12 scale-90 opacity-60'
                : handAnim === 'hit'
                ? 'scale-110 text-rose-500 animate-wiggle drop-shadow-[0_0_35px_#f43f5e]'
                : 'translate-y-0 text-amber-400'
            }`}
          >
            {handAnim === 'hit' ? '💥' : '🖐️'}
          </div>
          <span className="text-[11px] font-mono text-amber-400 font-bold mt-2">
            {isAttacker ? '⚔️ ATTACKER (YOU)' : '🛡️ DEFENDER (YOU)'}
          </span>
        </div>
      </div>

      {/* Massive Tactile Mobile Action Buttons */}
      <div className="w-full max-w-md pt-1">
        {isAttacker ? (
          <div className="grid grid-cols-3 gap-2.5">
            <button
              onClick={handleFeint}
              className="h-16 rounded-2xl bg-slate-900 border-2 border-amber-500/40 text-amber-300 font-black font-['Outfit'] active:scale-95 shadow-md flex items-center justify-center gap-1 text-sm"
            >
              <span>🎭 FEINT</span>
            </button>
            <button
              onClick={handleAttackerSlap}
              className="col-span-2 h-16 rounded-2xl bg-gradient-to-r from-amber-500 to-rose-500 border-2 border-amber-300 text-slate-950 font-black font-['Outfit'] text-xl active:scale-95 shadow-2xl shadow-amber-500/30 flex items-center justify-center gap-2"
            >
              <Swords className="w-6 h-6 fill-current" />
              <span>SLAP!</span>
            </button>
          </div>
        ) : (
          <button
            onClick={handleDefenderDodge}
            className="w-full h-16 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 border-2 border-cyan-300 text-slate-950 font-black font-['Outfit'] text-xl active:scale-95 shadow-2xl shadow-cyan-500/30 flex items-center justify-center gap-2"
          >
            <Shield className="w-6 h-6 fill-current" />
            <span>DODGE / RETREAT!</span>
          </button>
        )}
      </div>

      <p className="text-xs text-slate-400 font-mono text-center">
        ⌨️ Desktop: Spacebar to Slap / Dodge • 'F' key to Feint!
      </p>
    </div>
  );
};
