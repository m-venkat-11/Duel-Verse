import React from 'react';
import type { MemoryMatchState } from '../../types/game';
import type { AuthoritativeRoomState } from '../../types/room';
import { soundService } from '../../services/sound';
import { Brain } from 'lucide-react';

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
  const myFlips = gameState.playerFlips[playerUid] || [];

  const handleCardClick = (index: number) => {
    const card = gameState.cards[index];
    if (card.isMatched || myFlips.includes(index) || myFlips.length >= 2) return;

    soundService.playMove();
    onDispatchAction('MEMORY_FLIP', { cardIndex: index });
  };

  return (
    <div className="w-full max-w-sm mx-auto flex flex-col items-center">
      {/* Score Tracker */}
      <div className="mb-3 flex items-center justify-between w-full px-4 py-2 rounded-xl bg-slate-900/80 border border-slate-700/80 text-xs font-bold font-['Outfit']">
        <div className="flex items-center gap-1.5 text-purple-400">
          <Brain className="w-4 h-4" />
          <span>SIMULTANEOUS PAIR RUSH</span>
        </div>
        <div className="font-mono text-cyan-300">
          MATCHES: {Object.entries(gameState.scores).map(([uid, s]) => `${uid === playerUid ? 'YOU' : 'RIVAL'}: ${s}`).join(' | ')}
        </div>
      </div>

      {/* 4x4 Cards Grid */}
      <div className="grid grid-cols-4 gap-2.5 p-3 bg-slate-900/90 rounded-2xl border-2 border-purple-500/30 shadow-2xl w-full aspect-square">
        {gameState.cards.map((card, idx) => {
          const isFlippedByMe = myFlips.includes(idx);
          const isMatched = card.isMatched;
          const isMatchedByMe = card.matchedBy === playerUid;

          return (
            <button
              key={card.id}
              onClick={() => handleCardClick(idx)}
              disabled={isMatched || isFlippedByMe || myFlips.length >= 2}
              className={`rounded-xl text-3xl sm:text-4xl flex items-center justify-center transition-all duration-200 select-none ${
                isMatched
                  ? isMatchedByMe
                    ? 'bg-amber-500/20 border-2 border-amber-400 text-amber-300 shadow-md'
                    : 'bg-rose-500/20 border-2 border-rose-400 text-rose-300 opacity-60'
                  : isFlippedByMe
                  ? 'bg-purple-600/40 border-2 border-purple-400 text-white scale-105 shadow-lg'
                  : 'bg-slate-800/80 hover:bg-slate-700/90 border border-slate-700 active:scale-95 cursor-pointer'
              }`}
            >
              {isMatched || isFlippedByMe ? card.icon : '❓'}
            </button>
          );
        })}
      </div>
    </div>
  );
};
