import React, { useEffect, useState } from 'react';
import type { TapFrenzyState } from '../../types/game';
import type { AuthoritativeRoomState } from '../../types/room';
import { soundService } from '../../services/sound';
import { Crosshair, AlertTriangle } from 'lucide-react';

interface TapFrenzyViewProps {
  room: AuthoritativeRoomState<TapFrenzyState>;
  playerUid: string;
  onDispatchAction: (type: string, payload: any) => void;
}

export const TapFrenzyView: React.FC<TapFrenzyViewProps> = ({
  room,
  playerUid,
  onDispatchAction
}) => {
  const gameState = room.gameState;
  const isHost = room.hostUid === playerUid;
  const myScore = gameState.scores[playerUid] || 0;
  const isFrozen = gameState.frozenUntil[playerUid] && Date.now() < gameState.frozenUntil[playerUid];

  const handleTapTarget = (targetId: string, type: string) => {
    if (isFrozen) return;

    if (type === 'bomb') {
      soundService.playFalseStart();
    } else {
      soundService.playScore();
    }
    onDispatchAction('FRENZY_TAP', { targetId });
  };

  return (
    <div className="w-full max-w-sm mx-auto flex flex-col items-center">
      {/* Score Header */}
      <div className="mb-3 flex items-center justify-between w-full px-4 py-2 rounded-xl bg-slate-900/80 border border-slate-700/80 text-xs font-bold font-['Outfit']">
        <div className="flex items-center gap-1.5 text-yellow-400">
          <Crosshair className="w-4 h-4" />
          <span>TAP TARGETS!</span>
        </div>
        <div className="font-mono text-white text-sm">
          {myScore} PTS
        </div>
      </div>

      {/* Target Arena */}
      <div className="w-full aspect-square bg-slate-950/90 rounded-2xl border-2 border-yellow-500/30 relative overflow-hidden shadow-2xl p-4 select-none">
        {/* Frozen Overlay */}
        {isFrozen && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-red-950/70 backdrop-blur-sm animate-pulse">
            <AlertTriangle className="w-12 h-12 text-red-400 mb-1" />
            <span className="text-xl font-black font-['Outfit'] text-red-300">
              FROZEN BY BOMB!
            </span>
          </div>
        )}

        {/* Dynamic Targets */}
        {gameState.targets.map((target) => (
          <button
            key={target.id}
            onClick={() => handleTapTarget(target.id, target.type)}
            style={{ left: `${target.x}%`, top: `${target.y}%` }}
            className={`absolute -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-2xl flex items-center justify-center text-2xl transition-transform active:scale-75 shadow-lg border-2 cursor-pointer ${
              target.type === 'coin'
                ? 'bg-amber-500/30 border-amber-400 shadow-amber-500/40'
                : target.type === 'spark'
                ? 'bg-cyan-500/30 border-cyan-400 shadow-cyan-500/40'
                : 'bg-rose-600/30 border-rose-500 shadow-rose-600/40 animate-pulse'
            }`}
          >
            {target.type === 'coin' ? '🪙' : target.type === 'spark' ? '💎' : '💣'}
          </button>
        ))}
      </div>
    </div>
  );
};
