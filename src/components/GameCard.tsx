import React from 'react';
import { Play, Clock, Users, Zap, Shield, Sparkles } from 'lucide-react';
import type { GameMetadata } from '../config/games';
import { GameArtwork } from './artwork/GameArtwork';
import { soundService } from '../services/sound';

interface GameCardProps {
  game: GameMetadata;
  isSelected?: boolean;
  onSelect: (gameId: string) => void;
  compact?: boolean;
}

export const GameCard: React.FC<GameCardProps> = ({
  game,
  isSelected = false,
  onSelect,
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
      onClick={() => {
        soundService.playClick();
        onSelect(game.id);
      }}
      className={`group relative rounded-2xl border transition-all duration-200 cursor-pointer flex flex-col justify-between overflow-hidden bg-gradient-to-b from-slate-900/90 to-[#0B0F19]/95 backdrop-blur-md shadow-xl ${
        isSelected
          ? 'border-violet-500 ring-2 ring-violet-500/50 shadow-violet-500/20 -translate-y-1'
          : 'border-white/10 hover:border-violet-500/50 hover:shadow-violet-950/30 hover:-translate-y-1'
      }`}
    >
      {/* Specular border glow */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />

      {/* Card Artwork */}
      <div className="p-2 sm:p-2.5">
        <GameArtwork gameId={game.id} size={compact ? 'sm' : 'md'} />
      </div>

      {/* Card Content */}
      <div className="p-3 sm:p-4 pt-1 flex-1 flex flex-col justify-between">
        <div>
          {/* Header row: category & difficulty */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30 font-mono">
              {game.category}
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border font-mono ${getDifficultyBadge()}`}>
              {game.difficulty}
            </span>
          </div>

          {/* Title */}
          <h3 className="font-['Outfit'] font-extrabold text-base sm:text-lg text-white group-hover:text-cyan-300 transition-colors tracking-tight line-clamp-1">
            {game.title}
          </h3>

          {/* Description */}
          <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
            {game.description}
          </p>
        </div>

        {/* Footer Meta Row */}
        <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between gap-2 text-[11px] text-slate-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 font-mono">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>~{game.estDurationSec}s</span>
            </span>
            <span className="text-slate-600">•</span>
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-amber-400" />
              <span>{game.playersRange}</span>
            </span>
          </div>

          {/* Action indicator */}
          <div className="flex items-center gap-1 font-bold text-violet-400 group-hover:text-cyan-300 transition-colors font-['Outfit']">
            <span>Play</span>
            <Play className="w-3 h-3 fill-current group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>
      </div>
    </div>
  );
};
