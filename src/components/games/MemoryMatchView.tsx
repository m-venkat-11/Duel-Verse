import React from 'react';
import type { MemoryMatchState } from '../../types/game';
import type { AuthoritativeRoomState } from '../../types/room';
import { soundService } from '../../services/sound';

interface MemoryMatchViewProps {
  room: AuthoritativeRoomState<MemoryMatchState>;
  playerUid: string;
  onDispatchAction: (type: string, payload: any) => void;
}

export const MemoryMatchView: React.FC<MemoryMatchViewProps> = ({
  room,
  playerUid,
  onDispatchAction
}) => {
  const gameState = room.gameState;
  const myFlips = gameState.playerFlips?.[playerUid] || [];
  const myScore = gameState.scores?.[playerUid] || 0;

  const opponent = Object.values(room.players).find(p => p.uid !== playerUid);
  const opScore = gameState.scores?.[opponent?.uid || ''] || 0;
  const totalPairs = Math.floor((gameState.cards?.length || 0) / 2);
  const totalMatched = gameState.cards?.filter(c => c.isMatched).length || 0;

  const handleCardClick = (index: number) => {
    const card = gameState.cards?.[index];
    if (!card) return;
    if (card.isMatched || myFlips.includes(index) || myFlips.length >= 2) return;
    soundService.playMove();
    onDispatchAction('MEMORY_FLIP', { cardIndex: index });
  };

  const matchedByMe = myScore;
  const matchedByOp = opScore;

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col items-center select-none gap-3">
      {/* Score HUD */}
      <div className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-slate-900/90 border border-slate-700/60 shadow-xl">
        <div className="flex-1 text-center">
          <div className="text-3xl font-black font-mono text-amber-400">{matchedByMe}</div>
          <div className="text-xs text-amber-300 font-bold">YOUR PAIRS</div>
        </div>

        <div className="flex flex-col items-center">
          <div className="text-xs font-black font-mono text-slate-400">
            {totalMatched / 2} / {totalPairs} PAIRS FOUND
          </div>
          <div className="w-32 h-2.5 mt-1 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-cyan-400 rounded-full transition-all"
              style={{ width: `${(totalMatched / (gameState.cards?.length || 1)) * 100}%` }}
            />
          </div>
        </div>

        <div className="flex-1 text-center">
          <div className="text-3xl font-black font-mono text-cyan-400">{matchedByOp}</div>
          <div className="text-xs text-cyan-300 font-bold">{opponent?.nickname?.split(' ')[0] || 'CYBERBOT'}</div>
        </div>
      </div>

      {/* 4×4 Card Grid */}
      <div
        className="w-full rounded-3xl p-4 sm:p-5 grid grid-cols-4 gap-2.5 sm:gap-3.5 shadow-2xl"
        style={{
          background: 'linear-gradient(160deg, #0f0a1e 0%, #1a1033 50%, #0d0818 100%)',
          border: '2px solid rgba(139,92,246,0.35)',
          boxShadow: '0 0 50px rgba(139,92,246,0.15), 0 25px 70px rgba(0,0,0,0.6)',
          aspectRatio: '1 / 1',
        }}
      >
        {gameState.cards?.map((card, idx) => {
          const isFlipped = myFlips.includes(idx);
          const isMatched = card.isMatched;
          const matchedByPlayer = card.matchedBy === playerUid;

          return (
            <button
              key={card.id || idx}
              onClick={() => handleCardClick(idx)}
              disabled={isMatched || isFlipped || myFlips.length >= 2}
              className={`
                rounded-2xl aspect-square flex items-center justify-center text-3xl sm:text-4xl select-none transition-all duration-200 relative overflow-hidden touch-manipulation shadow-md
                ${isMatched
                  ? matchedByPlayer
                    ? 'bg-amber-500/20 border-2 border-amber-400 shadow-md shadow-amber-500/20 scale-95'
                    : 'bg-rose-500/20 border-2 border-rose-400 opacity-50 scale-95'
                  : isFlipped
                  ? 'bg-gradient-to-br from-violet-600 to-indigo-800 border-2 border-cyan-400 shadow-xl shadow-violet-500/40 scale-105 z-10'
                  : 'bg-slate-800/90 hover:bg-slate-700/90 border-2 border-slate-700 active:scale-95 cursor-pointer shadow-inner'
                }
              `}
            >
              {isMatched || isFlipped ? (
                <span className={isMatched || isFlipped ? 'animate-pop-in' : ''}>{card.icon}</span>
              ) : (
                <span className="text-slate-600 text-2xl">🛡️</span>
              )}
              {/* Shine on flipped */}
              {isFlipped && !isMatched && (
                <div className="absolute top-0 left-0 w-full h-1/2 bg-white/15 rounded-t-xl" />
              )}
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-slate-500 font-medium text-center">
        Find matching pairs faster than your rival! Flip 2 cards at a time.
      </p>
    </div>
  );
};
