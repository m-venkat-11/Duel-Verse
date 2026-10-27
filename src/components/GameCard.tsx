import React from 'react';
import { Play, Clock, Users } from 'lucide-react';
import type { GameMetadata } from '../config/games';
import { GameArtwork } from './artwork/GameArtwork';
import { soundService } from '../services/sound';

interface GameCardProps {
  game: GameMetadata;
  isSelected?: boolean;
  onSelect: (gameId: string) => void;
  onPlayVsAi?: (gameId: string) => void;
  compact?: boolean;
}

export const GameCard: React.FC<GameCardProps> = ({
  game,
  isSelected = false,
  onSelect,
  onPlayVsAi,
  compact = false
}) => {
  const getDifficultyBadge = () => {
    switch (game.difficulty) {
      case 'Intense':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      case 'Reflex':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'Tactical':
        return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
      default:
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    }
  };

  return (
    <div
      className={`group relative rounded-2xl border transition-all duration-200 flex flex-col justify-between overflow-hidden bg-gradient-to-b from-slate-900/95 to-slate-950/95 shadow-xl ${
        isSelected
          ? 'border-violet-400 ring-2 ring-violet-400/50 shadow-violet-500/30 -translate-y-1'
          : 'border-white/10 hover:border-violet-400/60 hover:shadow-violet-950/40 hover:-translate-y-1.5'
      }`}
    >
      {/* Specular top border shimmer */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent pointer-events-none" />

      {/* Capsule Artwork */}
      <div
        className="p-2 sm:p-2.5 pb-0 cursor-pointer"
        onClick={() => {
          soundService.playClick();
          onSelect(game.id);
        }}
      >
        <GameArtwork gameId={game.id} size={compact ? 'sm' : 'md'} />
      </div>

      {/* Capsule Content */}
      <div className="p-3 sm:p-3.5 flex-1 flex flex-col justify-between">
        <div>
          {/* Category & Difficulty Row */}
          <div className="flex items-center justify-between gap-1.5 mb-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30 font-mono">
              {game.category}
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border font-mono ${getDifficultyBadge()}`}>
              {game.difficulty}
            </span>
          </div>

          {/* Title */}
          <h3 className="font-['Outfit'] font-black text-base sm:text-lg text-white group-hover:text-cyan-300 transition-colors tracking-tight line-clamp-1">
            {game.title}
          </h3>

          {/* Tagline */}
          <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">
            {game.tagline}
          </p>
        </div>

        {/* Footer Meta & Dual Action Row */}
        <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between gap-2">
          {onPlayVsAi && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                soundService.playClick();
                onPlayVsAi(game.id);
              }}
              className="flex-1 py-2.5 px-3 min-h-[40px] rounded-xl bg-cyan-500/15 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 hover:text-white font-mono font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 shadow-sm"
            >
              <span>🤖 VS BOT</span>
            </button>
          )}

          <button
            onClick={() => {
              soundService.playClick();
              onSelect(game.id);
            }}
            className="flex-1 py-2.5 px-3 min-h-[40px] rounded-xl bg-violet-600/30 hover:bg-violet-600/50 border border-violet-400/50 text-white font-mono font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 shadow-md shadow-violet-500/20"
          >
            <span>⚔️ 2P ROOM</span>
            <Play className="w-3 h-3 fill-current" />
          </button>
        </div>
      </div>
    </div>
  );
};
