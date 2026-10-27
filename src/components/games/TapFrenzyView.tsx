import React, { useState, useRef } from 'react';
import type { TapFrenzyState } from '../../types/game';
import type { AuthoritativeRoomState } from '../../types/room';
import { soundService } from '../../services/sound';

interface TapFrenzyViewProps {
  room: AuthoritativeRoomState<TapFrenzyState>;
  playerUid: string;
  onDispatchAction: (type: string, payload: any) => void;
}

interface FloatingScore {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
}

export const TapFrenzyView: React.FC<TapFrenzyViewProps> = ({
  room,
  playerUid,
  onDispatchAction
}) => {
  const gameState = room.gameState;
  const myScore = gameState.scores?.[playerUid] || 0;
  const isFrozen = gameState.frozenUntil?.[playerUid] && Date.now() < gameState.frozenUntil[playerUid];
  const [floatingScores, setFloatingScores] = useState<FloatingScore[]>([]);
  const arenaRef = useRef<HTMLDivElement>(null);

  const opponent = Object.values(room.players).find(p => p.uid !== playerUid);
  const opScore = gameState.scores?.[opponent?.uid || ''] || 0;

  const handleTapTarget = (targetId: string, type: string, x: number, y: number) => {
    if (isFrozen) return;

    const floatId = Math.random().toString(36).substr(2, 9);
    let text = '+100';
    let color = '#f59e0b';
    if (type === 'spark') { text = '+250'; color = '#22d3ee'; soundService.playScore?.(); }
    else if (type === 'bomb') { text = '-150'; color = '#f43f5e'; soundService.playFalseStart?.(); }
    else { soundService.playScore?.(); }

    setFloatingScores(prev => [...prev, { id: floatId, x, y, text, color }]);
    setTimeout(() => setFloatingScores(prev => prev.filter(f => f.id !== floatId)), 800);

    onDispatchAction('FRENZY_TAP', { targetId });
  };

  const getTargetStyle = (type: string) => {
    if (type === 'coin') return {
      bg: 'radial-gradient(circle at 35% 35%, #fbbf24, #b45309)',
      border: '2px solid #fcd34d',
      shadow: '0 0 20px rgba(245,158,11,0.6)',
      icon: '🪙',
    };
    if (type === 'spark') return {
      bg: 'radial-gradient(circle at 35% 35%, #22d3ee, #0e7490)',
      border: '2px solid #67e8f9',
      shadow: '0 0 24px rgba(6,182,212,0.7)',
      icon: '💎',
    };
    return {
      bg: 'radial-gradient(circle at 35% 35%, #f43f5e, #9f1239)',
      border: '2px solid #fda4af',
      shadow: '0 0 20px rgba(244,63,94,0.6)',
      icon: '💣',
    };
  };

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col items-center select-none gap-2">
      {/* Score Race Bar */}
      <div className="w-full flex items-center gap-2 px-3 py-2 rounded-2xl bg-slate-900/90 border border-slate-700/60">
        <div className="flex-1 text-center">
          <div className="text-xl font-black font-mono text-amber-400">{myScore}</div>
          <div className="text-[10px] text-amber-300 font-bold">YOU</div>
        </div>
        <div className="flex-1 h-3 bg-slate-800 rounded-full overflow-hidden relative">
          <div
            className="h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-200 rounded-full"
            style={{ width: `${Math.min(100, (myScore / Math.max(myScore + opScore, 1)) * 100)}%` }}
          />
        </div>
        <div className="flex-1 text-center">
          <div className="text-xl font-black font-mono text-cyan-400">{opScore}</div>
          <div className="text-[10px] text-cyan-300 font-bold">{opponent?.nickname?.split(' ')[0] || 'RIVAL'}</div>
        </div>
      </div>

      {/* Tap Arena */}
      <div
        ref={arenaRef}
        className="w-full relative overflow-hidden touch-none select-none rounded-3xl border-2 shadow-2xl"
        style={{
          aspectRatio: '1 / 1',
          background: 'radial-gradient(ellipse at center, #0a1628 0%, #030810 100%)',
          border: '2px solid rgba(245,158,11,0.3)',
          boxShadow: '0 0 40px rgba(245,158,11,0.08), 0 20px 60px rgba(0,0,0,0.6)',
        }}
      >
        {/* Subtle grid */}
        <div className="absolute inset-0 opacity-5 pointer-events-none"
          style={{ backgroundImage: 'linear-gradient(rgba(245,158,11,1) 1px, transparent 1px), linear-gradient(90deg, rgba(245,158,11,1) 1px, transparent 1px)', backgroundSize: '32px 32px' }}
        />

        {/* Frozen overlay */}
        {isFrozen && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center rounded-3xl animate-pulse"
            style={{ background: 'rgba(6,182,212,0.15)', backdropFilter: 'blur(4px)' }}
          >
            <span className="text-6xl mb-1">❄️</span>
            <span className="text-2xl font-black font-mono text-cyan-300 tracking-wider">STUNNED!</span>
            <span className="text-xs text-cyan-200 mt-1">1 second freeze</span>
          </div>
        )}

        {/* Dynamic Targets */}
        {gameState.targets?.map((target) => {
          const style = getTargetStyle(target.type);
          return (
            <button
              key={target.id}
              onClick={() => handleTapTarget(target.id, target.type, target.x, target.y)}
              style={{
                position: 'absolute',
                left: `${target.x}%`,
                top: `${target.y}%`,
                transform: 'translate(-50%, -50%)',
                width: '60px',
                height: '60px',
                borderRadius: '18px',
                background: style.bg,
                border: style.border,
                boxShadow: style.shadow,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '30px',
                cursor: 'pointer',
                transition: 'transform 0.1s',
                animation: 'popIn 0.2s ease-out forwards',
              }}
              className="active:scale-75 touch-manipulation"
            >
              {style.icon}
            </button>
          );
        })}

        {/* Floating score animations */}
        {floatingScores.map(f => (
          <div
            key={f.id}
            className="absolute pointer-events-none font-black text-2xl font-mono select-none"
            style={{
              left: `${f.x}%`,
              top: `${f.y}%`,
              transform: 'translate(-50%, -200%)',
              color: f.color,
              textShadow: `0 0 10px ${f.color}`,
              animation: 'floatUp 0.8s ease-out forwards',
            }}
          >
            {f.text}
          </div>
        ))}
      </div>

      <p className="text-[11px] text-slate-500 font-medium">
        🪙 Coins +100 · 💎 Gems +250 · 💣 Bombs -150 (avoid!)
      </p>
    </div>
  );
};
