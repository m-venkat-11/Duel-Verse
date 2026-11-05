import React, { useState, useEffect, useRef } from 'react';
import type { AuthoritativeRoomState } from '../../types/room';
import {
  type Cyber2048State,
  createCyber2048InitialState,
  move2048,
  undo2048Move
} from '../../engine/cyber2048Engine';
import { soundService } from '../../services/sound';
import {
  Trophy,
  RotateCcw,
  Undo2,
  Sparkles,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Zap
} from 'lucide-react';

interface Cyber2048ViewProps {
  room: AuthoritativeRoomState<any>;
  playerUid: string;
  onDispatchAction: (type: string, payload: any) => void;
}

const TILE_STYLES: Record<number, { bg: string; text: string; glow: string; border: string }> = {
  2: { bg: 'from-cyan-900/60 to-blue-900/60', text: 'text-cyan-200', glow: 'rgba(6, 182, 212, 0.4)', border: 'border-cyan-400/50' },
  4: { bg: 'from-blue-800/70 to-indigo-900/70', text: 'text-blue-100', glow: 'rgba(59, 130, 246, 0.5)', border: 'border-blue-400/60' },
  8: { bg: 'from-violet-800/80 to-purple-900/80', text: 'text-violet-100', glow: 'rgba(139, 92, 246, 0.6)', border: 'border-violet-400/70' },
  16: { bg: 'from-purple-700/85 to-fuchsia-900/85', text: 'text-purple-100', glow: 'rgba(168, 85, 247, 0.7)', border: 'border-purple-300' },
  32: { bg: 'from-pink-600/90 to-rose-800/90', text: 'text-white', glow: 'rgba(236, 72, 153, 0.8)', border: 'border-pink-300 shadow-[0_0_15px_#ec4899]' },
  64: { bg: 'from-rose-600 to-red-700', text: 'text-white', glow: 'rgba(244, 63, 94, 0.9)', border: 'border-rose-300 shadow-[0_0_20px_#f43f5e]' },
  128: { bg: 'from-amber-600 to-orange-700', text: 'text-white', glow: 'rgba(245, 158, 11, 0.9)', border: 'border-amber-300 shadow-[0_0_25px_#f59e0b]' },
  256: { bg: 'from-yellow-500 to-amber-600', text: 'text-slate-950 font-black', glow: 'rgba(234, 179, 8, 1)', border: 'border-yellow-200 shadow-[0_0_30px_#eab308]' },
  512: { bg: 'from-emerald-500 to-teal-600', text: 'text-slate-950 font-black', glow: 'rgba(16, 185, 129, 1)', border: 'border-emerald-200 shadow-[0_0_35px_#10b981]' },
  1024: { bg: 'from-cyan-400 to-blue-500', text: 'text-slate-950 font-black', glow: 'rgba(6, 182, 212, 1)', border: 'border-cyan-100 shadow-[0_0_40px_#06b6d4]' },
  2048: { bg: 'from-amber-300 via-rose-400 to-violet-500', text: 'text-slate-950 font-black', glow: 'rgba(250, 204, 21, 1)', border: 'border-white shadow-[0_0_50px_#facc15]' },
  4096: { bg: 'from-violet-400 via-pink-400 to-cyan-300', text: 'text-slate-950 font-black', glow: 'rgba(255, 255, 255, 1)', border: 'border-white shadow-[0_0_60px_#fff]' }
};

export const Cyber2048View: React.FC<Cyber2048ViewProps> = ({ onDispatchAction }) => {
  const [gameState, setGameState] = useState<Cyber2048State>(() => createCyber2048InitialState());
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const executeMove = (direction: 'left' | 'right' | 'up' | 'down') => {
    if (gameState.gameOver && !gameState.keepPlaying) return;

    const res = move2048(gameState, direction);
    if (res.moved) {
      setGameState(res.newState);
      soundService.playMove();

      // Audio chord chime on merges
      if (res.mergedValues.length > 0) {
        soundService.playScore();
        if (navigator.vibrate) navigator.vibrate(25);
      }

      if (res.newState.won && !gameState.won) {
        soundService.playGoal();
        if (navigator.vibrate) navigator.vibrate([40, 30, 80]);
      }
    }
  };

  const handleRestart = () => {
    soundService.playClick();
    setGameState(createCyber2048InitialState());
  };

  const handleUndo = () => {
    if (!gameState.canUndo) return;
    soundService.playClick();
    setGameState(undo2048Move(gameState));
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          executeMove('left');
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          executeMove('right');
          break;
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault();
          executeMove('up');
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          executeMove('down');
          break;
        case 'z':
        case 'Z':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleUndo();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState]);

  // Touch Swipe navigation
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (Math.max(absDx, absDy) < 25) return; // Threshold for swipe

    if (absDx > absDy) {
      if (dx > 0) executeMove('right');
      else executeMove('left');
    } else {
      if (dy > 0) executeMove('down');
      else executeMove('up');
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col items-center select-none gap-3 px-2">
      {/* Top Header & Score Billboard */}
      <div className="w-full flex items-center justify-between px-3 py-2 sm:px-4 sm:py-2.5 rounded-2xl bg-slate-900/90 border border-slate-700/60 text-xs font-black font-mono shadow-md backdrop-blur-md">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onDispatchAction('leave', {})}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-violet-600/30 hover:bg-violet-600/50 border border-violet-400/50 text-white font-mono text-[11px] font-bold active:scale-95 transition shrink-0 shadow"
            title="Return to Arcade Library"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-violet-300 stroke-[3]" />
            <span>Arcade</span>
          </button>
          <span className="text-xl">🔢</span>
          <div>
            <div className="text-sm font-['Outfit'] font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-violet-400">
              CYBER 2048
            </div>
            <div className="text-[10px] text-slate-400 font-mono hidden xs:block">NEON FUSION</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Score Box */}
          <div className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-950 border border-cyan-500/40 text-center min-w-[65px] sm:min-w-[75px]">
            <div className="text-[9px] text-cyan-400 font-bold uppercase">SCORE</div>
            <div className="text-sm sm:text-base font-black font-['Outfit'] text-white tabular-nums">
              {gameState.score}
            </div>
          </div>

          {/* Best Score Box */}
          <div className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-950 border border-amber-500/40 text-center min-w-[65px] sm:min-w-[75px]">
            <div className="text-[9px] text-amber-400 font-bold uppercase flex items-center justify-center gap-1">
              <Trophy className="w-2.5 h-2.5 fill-current" />
              <span>BEST</span>
            </div>
            <div className="text-sm sm:text-base font-black font-['Outfit'] text-amber-300 tabular-nums">
              {gameState.bestScore}
            </div>
          </div>
        </div>
      </div>

      {/* Control Buttons (Undo + Restart) */}
      <div className="w-full flex items-center justify-between px-2 text-xs font-mono">
        <div className="text-slate-400 font-medium">
          Slide tiles to reach <span className="text-amber-400 font-bold">2048</span>!
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleUndo}
            disabled={!gameState.canUndo}
            className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 font-bold transition ${
              gameState.canUndo
                ? 'bg-slate-800 hover:bg-slate-700 border-slate-600 text-slate-200'
                : 'bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed'
            }`}
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>Undo</span>
          </button>
          <button
            onClick={handleRestart}
            className="px-3 py-1.5 rounded-xl bg-violet-600/30 hover:bg-violet-600/50 border border-violet-400/40 text-violet-300 flex items-center gap-1.5 font-bold transition active:scale-95 shadow-sm"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* 4×4 Matrix Grid Board */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={(e) => e.preventDefault()}
        onTouchEnd={handleTouchEnd}
        className="w-full aspect-square max-w-[420px] p-2.5 sm:p-4 rounded-3xl bg-slate-950 border-2 border-violet-500/40 shadow-2xl grid grid-cols-4 grid-rows-4 gap-2 sm:gap-3 relative overflow-hidden touch-none select-none"
        style={{
          boxShadow: '0 0 50px rgba(139, 92, 246, 0.25), inset 0 2px 6px rgba(255, 255, 255, 0.08)'
        }}
      >
        {gameState.grid.map((row, r) =>
          row.map((val, c) => {
            const style = TILE_STYLES[val] || (val > 4096 ? TILE_STYLES[4096] : null);
            return (
              <div
                key={`${r}-${c}`}
                className={`rounded-2xl flex items-center justify-center font-['Outfit'] font-black text-2xl sm:text-3xl transition-all duration-150 select-none border ${
                  val === 0
                    ? 'bg-slate-900/60 border-slate-800/80 shadow-inner'
                    : `bg-gradient-to-br ${style?.bg} ${style?.text} ${style?.border} shadow-lg animate-pop-in`
                }`}
                style={val !== 0 && style ? { boxShadow: `0 0 20px ${style.glow}` } : undefined}
              >
                {val !== 0 ? (
                  <span className={val >= 1024 ? 'text-xl sm:text-2xl' : val >= 128 ? 'text-2xl sm:text-3xl' : ''}>
                    {val}
                  </span>
                ) : null}
              </div>
            );
          })
        )}

        {/* Win Modal Overlay */}
        {gameState.won && !gameState.keepPlaying && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-pop-in z-20">
            <span className="text-5xl animate-bounce mb-2">🎉</span>
            <h3 className="text-3xl font-black font-['Outfit'] text-amber-300 drop-shadow-lg">
              YOU REACHED 2048!
            </h3>
            <p className="text-xs text-slate-300 mt-1 max-w-xs font-mono">
              Quantum matrix completed! Keep pushing to 4096 and beyond!
            </p>
            <div className="flex items-center gap-3 mt-5">
              <button
                onClick={() => setGameState({ ...gameState, keepPlaying: true })}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black font-['Outfit'] text-sm shadow-xl active:scale-95 transition"
              >
                KEEP PLAYING
              </button>
              <button
                onClick={handleRestart}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold font-mono text-xs border border-white/10 active:scale-95 transition"
              >
                NEW GAME
              </button>
            </div>
          </div>
        )}

        {/* Game Over Overlay */}
        {gameState.gameOver && (
          <div className="absolute inset-0 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-pop-in z-20">
            <span className="text-5xl mb-2">🔒</span>
            <h3 className="text-3xl font-black font-['Outfit'] text-rose-400 tracking-tight">
              MATRIX LOCKED!
            </h3>
            <p className="text-xs text-slate-400 mt-1 font-mono">
              No moves left • Score: {gameState.score}
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-3 mt-5">
              {gameState.canUndo && (
                <button
                  onClick={handleUndo}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold font-mono text-xs border border-white/20 active:scale-95 transition flex items-center gap-1.5"
                >
                  <Undo2 className="w-4 h-4" />
                  <span>UNDO MOVE</span>
                </button>
              )}
              <button
                onClick={handleRestart}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white font-black font-['Outfit'] text-sm shadow-xl active:scale-95 transition flex items-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4" />
                <span>TRY AGAIN</span>
              </button>
              <button
                onClick={() => onDispatchAction('leave', {})}
                className="px-5 py-2.5 rounded-xl bg-slate-900 border border-white/20 text-white font-mono text-xs font-bold active:scale-95 transition"
              >
                EXIT TO ARCADE
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tactile On-Screen D-Pad for Mobile Swipe Alternative */}
      <div className="flex sm:hidden flex-col items-center gap-1.5 pt-1 touch-none select-none">
        <button
          onClick={() => executeMove('up')}
          onTouchStart={(e) => {
            e.preventDefault();
            executeMove('up');
          }}
          className="w-16 h-12 rounded-2xl bg-slate-900 border border-violet-500/30 active:scale-90 flex items-center justify-center text-cyan-300 shadow-md active:bg-violet-600/30"
        >
          <ArrowUp className="w-6 h-6 stroke-[3]" />
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={() => executeMove('left')}
            onTouchStart={(e) => {
              e.preventDefault();
              executeMove('left');
            }}
            className="w-16 h-12 rounded-2xl bg-slate-900 border border-violet-500/30 active:scale-90 flex items-center justify-center text-cyan-300 shadow-md active:bg-violet-600/30"
          >
            <ArrowLeft className="w-6 h-6 stroke-[3]" />
          </button>
          <button
            onClick={() => executeMove('down')}
            onTouchStart={(e) => {
              e.preventDefault();
              executeMove('down');
            }}
            className="w-16 h-12 rounded-2xl bg-slate-900 border border-violet-500/30 active:scale-90 flex items-center justify-center text-cyan-300 shadow-md active:bg-violet-600/30"
          >
            <ArrowDown className="w-6 h-6 stroke-[3]" />
          </button>
          <button
            onClick={() => executeMove('right')}
            onTouchStart={(e) => {
              e.preventDefault();
              executeMove('right');
            }}
            className="w-16 h-12 rounded-2xl bg-slate-900 border border-violet-500/30 active:scale-90 flex items-center justify-center text-cyan-300 shadow-md active:bg-violet-600/30"
          >
            <ArrowRight className="w-6 h-6 stroke-[3]" />
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-400 font-mono text-center">
        ⌨️ Desktop: Arrow Keys / WASD • Mobile: Swipe anywhere or use Pad
      </p>
    </div>
  );
};
