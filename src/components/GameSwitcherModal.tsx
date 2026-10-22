import React from 'react';
import { X, Play, Clock, Sparkles } from 'lucide-react';
import { GAMES_CATALOG } from '../config/games';
import { soundService } from '../services/sound';

interface GameSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentGameId: string;
  onSelectGame: (gameId: string) => void;
}

export const GameSwitcherModal: React.FC<GameSwitcherModalProps> = ({
  isOpen,
  onClose,
  currentGameId,
  onSelectGame
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="glass-panel max-w-2xl w-full p-6 relative border border-violet-500/40 shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h3 className="text-xl font-bold font-['Outfit'] text-white">
              Arcade Game Selector
            </h3>
            <p className="text-xs text-slate-400">Choose a title to duel your friend</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-slate-800/80 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Game Cards List */}
        <div className="overflow-y-auto py-4 space-y-3 flex-1 pr-1">
          {GAMES_CATALOG.map((game) => {
            const isSelected = game.id === currentGameId;

            return (
              <div
                key={game.id}
                onClick={() => {
                  soundService.playClick();
                  onSelectGame(game.id);
                  onClose();
                }}
                className={`p-4 rounded-xl border cursor-pointer transition flex items-center justify-between gap-4 ${
                  isSelected
                    ? 'bg-violet-950/40 border-violet-500/80 shadow-lg shadow-violet-500/20'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-bold shrink-0 border"
                    style={{
                      backgroundColor: `${game.accentColor}20`,
                      borderColor: `${game.accentColor}60`,
                      color: game.accentColor
                    }}
                  >
                    {game.id === 'tictactoe'
                      ? '❌'
                      : game.id === 'rps'
                      ? '✊'
                      : game.id === 'connectfour'
                      ? '🔴'
                      : game.id === 'reactionrush'
                      ? '⚡'
                      : game.id === 'pong'
                      ? '🏓'
                      : game.id === 'obstaclerush'
                      ? '🏃'
                      : game.id === 'memorymatch'
                      ? '🧠'
                      : game.id === 'numberblitz'
                      ? '🔢'
                      : '🎯'}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-base font-bold text-white font-['Outfit'] truncate">
                        {game.title}
                      </h4>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-slate-800 text-slate-300">
                        {game.category}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 truncate mt-0.5">{game.description}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-cyan-400" />
                        <span>~{game.estDurationSec}s</span>
                      </span>
                      <span>•</span>
                      <span>{game.playersRange}</span>
                    </div>
                  </div>
                </div>

                <div className="shrink-0">
                  <button
                    className={`px-3.5 py-2 rounded-lg text-xs font-bold font-['Outfit'] flex items-center gap-1.5 transition ${
                      isSelected
                        ? 'bg-violet-600 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-violet-600 hover:text-white'
                    }`}
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>{isSelected ? 'Active' : 'Select'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
