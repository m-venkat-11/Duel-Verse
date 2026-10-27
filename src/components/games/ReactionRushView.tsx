import React, { useEffect, useState, useRef } from 'react';
import type { ReactionRushState } from '../../types/game';
import type { AuthoritativeRoomState } from '../../types/room';
import { soundService } from '../../services/sound';

interface ReactionRushViewProps {
  room: AuthoritativeRoomState<ReactionRushState>;
  playerUid: string;
  onDispatchAction: (type: string, payload: any) => void;
}

export const ReactionRushView: React.FC<ReactionRushViewProps> = ({
  room,
  playerUid,
  onDispatchAction
}) => {
  const gameState = room.gameState;
  const [isSignalActive, setIsSignalActive] = useState(false);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const signalTimeRef = useRef<number | null>(null);

  const opponent = Object.values(room.players).find(p => p.uid !== playerUid);

  useEffect(() => {
    if (gameState.phase === 'countdown') {
      const remainingMs = gameState.signalScheduledAt - Date.now();
      if (remainingMs <= 0) {
        setIsSignalActive(true);
        signalTimeRef.current = Date.now() - (0 - remainingMs);
        soundService.playSignalAlert?.();
      } else {
        setIsSignalActive(false);
        signalTimeRef.current = null;
        const timer = setTimeout(() => {
          setIsSignalActive(true);
          signalTimeRef.current = Date.now();
          soundService.playSignalAlert?.();
        }, remainingMs);
        return () => clearTimeout(timer);
      }
    } else {
      setIsSignalActive(false);
      signalTimeRef.current = null;
    }
  }, [gameState.phase, gameState.signalScheduledAt]);

  // Live elapsed timer when signal is active
  useEffect(() => {
    if (isSignalActive && gameState.phase === 'countdown') {
      tickRef.current = setInterval(() => {
        if (signalTimeRef.current) {
          setElapsedMs(Date.now() - signalTimeRef.current);
        }
      }, 50);
    } else {
      if (tickRef.current) clearInterval(tickRef.current);
      setElapsedMs(null);
    }
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [isSignalActive, gameState.phase]);

  const handleTap = () => {
    if (gameState.phase === 'round_result') return;
    soundService.playClick();
    onDispatchAction('REACTION_TAP', { tapTimestamp: Date.now() });
  };

  const myReactionMs = gameState.reactionTimes?.[playerUid];
  const myFalseStart = gameState.falseStarts?.[playerUid];
  const isRoundWinner = gameState.roundWinner === playerUid;

  const getReactionTier = (ms: number) => {
    if (ms < 150) return { label: '⚡ GODLIKE!', color: 'text-violet-400' };
    if (ms < 220) return { label: '🔥 LIGHTNING!', color: 'text-amber-400' };
    if (ms < 320) return { label: '👍 SHARP!', color: 'text-emerald-400' };
    if (ms < 450) return { label: '😐 AVERAGE', color: 'text-cyan-400' };
    return { label: '🐢 TOO SLOW', color: 'text-rose-400' };
  };

  // Win strips
  const myWins = gameState.roundWins?.[playerUid] || 0;
  const opWins = gameState.roundWins?.[opponent?.uid || ''] || 0;
  const target = gameState.targetWins || 3;

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col items-center select-none gap-3 px-2">
      {/* Win strips at top */}
      <div className="flex items-center justify-between w-full text-xs font-black font-mono">
        <div className="flex items-center gap-1.5">
          <span className="text-amber-400">YOU</span>
          <div className="flex gap-1">
            {Array.from({ length: target }).map((_, i) => (
              <div key={i} className={`w-5 h-5 rounded-md border ${i < myWins ? 'bg-amber-400 border-amber-300' : 'bg-slate-800 border-slate-700'}`} />
            ))}
          </div>
        </div>
        <span className="text-slate-500 text-[11px]">ROUND {gameState.round || 1}</span>
        <div className="flex items-center gap-1.5">
          <div className="flex gap-1">
            {Array.from({ length: target }).map((_, i) => (
              <div key={i} className={`w-5 h-5 rounded-md border ${i < opWins ? 'bg-cyan-400 border-cyan-300' : 'bg-slate-800 border-slate-700'}`} />
            ))}
          </div>
          <span className="text-cyan-400">{opponent?.nickname?.split(' ')[0] || 'RIVAL'}</span>
        </div>
      </div>

      {/* Reflex Pad — the main interactive element */}
      <button
        onClick={handleTap}
        className={`w-full rounded-3xl flex flex-col items-center justify-center p-8 text-center cursor-pointer shadow-2xl transition-all duration-75 border-4 active:scale-95 select-none touch-manipulation
          ${gameState.phase === 'round_result'
            ? myFalseStart
              ? 'bg-rose-950 border-rose-500 shadow-rose-500/20'
              : isRoundWinner
              ? 'bg-emerald-950 border-emerald-400 shadow-emerald-500/20'
              : 'bg-slate-900 border-slate-700'
            : isSignalActive
            ? 'bg-emerald-500 border-white shadow-[0_0_60px_rgba(16,185,129,0.6)] scale-[1.02]'
            : 'bg-slate-900 border-rose-500/60 shadow-rose-900/20'
          }
        `}
        style={{ minHeight: '340px' }}
      >
        {gameState.phase === 'round_result' ? (
          <div className="flex flex-col items-center gap-3 animate-pop-in">
            {myFalseStart ? (
              <>
                <span className="text-6xl">⛔</span>
                <h3 className="text-3xl font-black font-mono text-rose-400 tracking-tight">FALSE START!</h3>
                <p className="text-xs text-rose-300 font-medium">You tapped before the green signal!</p>
              </>
            ) : isRoundWinner ? (
              <>
                <span className="text-6xl">🏆</span>
                <h3 className="text-2xl font-black font-mono text-emerald-300 tracking-tight">ROUND WIN!</h3>
                {myReactionMs && (
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-5xl font-black font-mono text-white tabular-nums">{myReactionMs}<span className="text-2xl text-emerald-400">ms</span></span>
                    <span className={`text-sm font-black font-mono ${getReactionTier(myReactionMs).color}`}>
                      {getReactionTier(myReactionMs).label}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <>
                <span className="text-6xl">💨</span>
                <h3 className="text-2xl font-black font-mono text-slate-300">RIVAL WAS QUICKER</h3>
                <p className="text-xs text-slate-400 font-medium">Next round starting soon...</p>
              </>
            )}
          </div>
        ) : isSignalActive ? (
          <div className="flex flex-col items-center gap-2 animate-pop-in">
            <span className="text-7xl font-black font-mono text-slate-950">⚡</span>
            <h2 className="text-6xl font-black font-mono text-slate-950 tracking-tighter drop-shadow">TAP!</h2>
            {elapsedMs !== null && (
              <span className="text-2xl font-black font-mono text-slate-800 tabular-nums">{elapsedMs}ms</span>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-full border-4 border-rose-400/60 border-t-rose-400 animate-spin" />
            <h3 className="text-3xl font-black font-mono text-rose-400 tracking-tight">WAIT...</h3>
            <p className="text-xs text-rose-400/60 font-medium">Tap when it turns GREEN! Don't false start.</p>
          </div>
        )}
      </button>

      <p className="text-[11px] text-slate-500 font-medium text-center">
        Tap the pad ONLY when it flashes green ⚡ to win the round
      </p>
    </div>
  );
};
