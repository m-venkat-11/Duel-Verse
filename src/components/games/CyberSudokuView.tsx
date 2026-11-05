import React, { useState, useEffect } from 'react';
import type { AuthoritativeRoomState } from '../../types/room';
import {
  type CyberSudokuState,
  type SudokuDifficulty,
  type SudokuVariant,
  createCyberSudokuInitialState,
  placeSudokuNumber,
  undoSudoku,
  revealHint
} from '../../engine/cyberSudokuEngine';
import { soundService } from '../../services/sound';
import {
  Pencil,
  Eraser,
  RotateCcw,
  Undo2,
  Lightbulb,
  Trophy,
  Timer,
  AlertCircle,
  Sparkles,
  Check,
  ArrowLeft,
  Zap,
  Grid
} from 'lucide-react';

interface CyberSudokuViewProps {
  room: AuthoritativeRoomState<any>;
  playerUid: string;
  onDispatchAction: (type: string, payload: any) => void;
}

export const CyberSudokuView: React.FC<CyberSudokuViewProps> = ({ onDispatchAction }) => {
  const [variant, setVariant] = useState<SudokuVariant>('classic');
  const [difficulty, setDifficulty] = useState<SudokuDifficulty>('casual');
  const [gameState, setGameState] = useState<CyberSudokuState>(() =>
    createCyberSudokuInitialState('casual', 'classic')
  );
  const [selectedCell, setSelectedCell] = useState<{ r: number; c: number }>({ r: 4, c: 4 });
  const [isNoteMode, setIsNoteMode] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [isActive, setIsActive] = useState(true);

  // Timer
  useEffect(() => {
    let interval: any = null;
    if (isActive && !gameState.completed && gameState.mistakes < gameState.maxMistakes) {
      interval = setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isActive, gameState.completed, gameState.mistakes, gameState.maxMistakes]);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
  };

  const selectedValue = gameState.grid[selectedCell.r]?.[selectedCell.c]?.value || 0;

  const handleInputNumber = (num: number) => {
    if (gameState.completed || gameState.mistakes >= gameState.maxMistakes) return;

    soundService.playClick();
    const res = placeSudokuNumber(gameState, selectedCell.r, selectedCell.c, num, isNoteMode);
    setGameState(res.newState);

    if (!res.correct && num !== 0 && !isNoteMode) {
      soundService.playFalseStart();
      if (navigator.vibrate) navigator.vibrate([40, 30, 40]);
    } else if (res.gameCompleted) {
      soundService.playGoal();
      if (navigator.vibrate) navigator.vibrate([40, 30, 80]);
    } else if (num !== 0 && !isNoteMode) {
      soundService.playMove();
    }
  };

  const handleVariantChange = (newVariant: SudokuVariant) => {
    soundService.playClick();
    setVariant(newVariant);
    const newState = createCyberSudokuInitialState(difficulty, newVariant);
    setGameState(newState);
    setSeconds(0);
    const mid = Math.floor(newState.size / 2);
    setSelectedCell({ r: mid, c: mid });
  };

  const handleDifficultyChange = (newDiff: SudokuDifficulty) => {
    soundService.playClick();
    setDifficulty(newDiff);
    const newState = createCyberSudokuInitialState(newDiff, variant);
    setGameState(newState);
    setSeconds(0);
    const mid = Math.floor(newState.size / 2);
    setSelectedCell({ r: mid, c: mid });
  };

  const handleUndo = () => {
    if (!gameState.canUndo) return;
    soundService.playClick();
    setGameState(undoSudoku(gameState));
  };

  const handleHint = () => {
    soundService.playClick();
    setGameState(revealHint(gameState));
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const { r, c } = selectedCell;
      const size = gameState.size;

      if (e.key >= '1' && e.key <= String(size)) {
        e.preventDefault();
        handleInputNumber(parseInt(e.key, 10));
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        handleInputNumber(0);
      } else if (e.key === 'ArrowUp' && r > 0) {
        e.preventDefault();
        setSelectedCell({ r: r - 1, c });
      } else if (e.key === 'ArrowDown' && r < size - 1) {
        e.preventDefault();
        setSelectedCell({ r: r + 1, c });
      } else if (e.key === 'ArrowLeft' && c > 0) {
        e.preventDefault();
        setSelectedCell({ r, c: c - 1 });
      } else if (e.key === 'ArrowRight' && c < size - 1) {
        e.preventDefault();
        setSelectedCell({ r, c: c + 1 });
      } else if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setIsNoteMode((prev) => !prev);
      } else if (e.key.toLowerCase() === 'h') {
        e.preventDefault();
        handleHint();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCell, isNoteMode, gameState]);

  // Count remaining numbers (1..size)
  const numberCounts: Record<number, number> = {};
  for (let n = 1; n <= gameState.size; n++) numberCounts[n] = 0;
  gameState.grid.forEach((row) => {
    row.forEach((cell) => {
      if (cell.value >= 1 && cell.value <= gameState.size && !cell.error) {
        numberCounts[cell.value] = (numberCounts[cell.value] || 0) + 1;
      }
    });
  });

  const numbersList = Array.from({ length: gameState.size }, (_, i) => i + 1);

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col items-center select-none gap-2 px-2">
      {/* Top Arcade HUD & Return Button */}
      <div className="w-full flex items-center justify-between px-3 py-2 sm:px-4 sm:py-2.5 rounded-2xl bg-slate-900/90 border border-slate-700/60 text-xs font-mono shadow-md backdrop-blur-md">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onDispatchAction('leave', {})}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-violet-600/30 hover:bg-violet-600/50 border border-violet-400/50 text-white font-mono text-[11px] font-bold active:scale-95 transition shrink-0 shadow"
            title="Return to Arcade Library"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-violet-300 stroke-[3]" />
            <span>Arcade</span>
          </button>
          <div>
            <div className="text-sm font-['Outfit'] font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-indigo-300">
              CYBER SUDOKU
            </div>
          </div>
        </div>

        {/* Difficulty Selector Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-xl border border-white/5">
          {(['casual', 'tactical', 'hacker', 'master'] as SudokuDifficulty[]).map((d) => (
            <button
              key={d}
              onClick={() => handleDifficultyChange(d)}
              className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold uppercase transition ${
                gameState.difficulty === d
                  ? 'bg-cyan-500 text-slate-950 font-black shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {d.slice(0, 4)}
            </button>
          ))}
        </div>
      </div>

      {/* Sudoku Varieties Selector Strip */}
      <div className="w-full flex items-center justify-between gap-1.5 p-1.5 bg-slate-950/80 rounded-2xl border border-cyan-500/30 shadow-inner">
        <button
          onClick={() => handleVariantChange('classic')}
          className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-['Outfit'] font-black flex items-center justify-center gap-1.5 transition ${
            gameState.variant === 'classic'
              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <span>🧩</span>
          <span>9×9 Classic</span>
        </button>

        <button
          onClick={() => handleVariantChange('mini6x6')}
          className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-['Outfit'] font-black flex items-center justify-center gap-1.5 transition ${
            gameState.variant === 'mini6x6'
              ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Zap className="w-3.5 h-3.5 fill-current" />
          <span>6×6 Rapid (Mobile)</span>
        </button>

        <button
          onClick={() => handleVariantChange('diagonalX')}
          className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-['Outfit'] font-black flex items-center justify-center gap-1.5 transition ${
            gameState.variant === 'diagonalX'
              ? 'bg-violet-500 text-white shadow-md shadow-violet-500/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <span>⚔️</span>
          <span>Diagonal Laser X</span>
        </button>
      </div>

      {/* Status Bar: Mistakes + Mode Description + Timer */}
      <div className="w-full flex items-center justify-between px-2 text-xs font-mono">
        <div className="flex items-center gap-1.5 text-slate-300">
          <AlertCircle className="w-4 h-4 text-rose-400" />
          <span>Mistakes:</span>
          <span className={`font-black ${gameState.mistakes > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
            {gameState.mistakes} / {gameState.maxMistakes}
          </span>
        </div>

        <div className="text-[11px] font-bold text-cyan-300 uppercase tracking-wider hidden sm:block">
          {gameState.variant === 'mini6x6'
            ? '⚡ 6×6 Rapid Matrix (2×3 Boxes)'
            : gameState.variant === 'diagonalX'
            ? '⚔️ Sudoku-X (Diagonal Laser Constraint)'
            : '🧩 9×9 Standard Cyber Matrix'}
        </div>

        <div className="flex items-center gap-1.5 text-cyan-400 font-bold tabular-nums">
          <Timer className="w-4 h-4" />
          <span>{formatTime(seconds)}</span>
        </div>
      </div>

      {/* Dynamic Sudoku Matrix Board */}
      <div
        className={`w-full aspect-square max-w-[440px] p-2 sm:p-2.5 rounded-3xl bg-slate-950 border-2 border-cyan-500/40 shadow-2xl grid ${
          gameState.size === 6 ? 'grid-cols-6 grid-rows-6' : 'grid-cols-9 grid-rows-9'
        } gap-[2px] relative overflow-hidden`}
        style={{
          boxShadow: '0 0 40px rgba(6, 182, 212, 0.2), inset 0 2px 6px rgba(255, 255, 255, 0.08)'
        }}
      >
        {gameState.grid.map((row, r) =>
          row.map((cell, c) => {
            const isSelected = selectedCell.r === r && selectedCell.c === c;
            const isMatchingNum = selectedValue !== 0 && cell.value === selectedValue;
            const inSameRow = selectedCell.r === r;
            const inSameCol = selectedCell.c === c;

            // Box / Sector check
            const inSameSector =
              Math.floor(selectedCell.r / gameState.boxRows) === Math.floor(r / gameState.boxRows) &&
              Math.floor(selectedCell.c / gameState.boxCols) === Math.floor(c / gameState.boxCols);

            // Diagonal X check
            const isDiagonalCell = gameState.variant === 'diagonalX' && (r === c || r + c === 8);

            // Sector border styling (Thick border between subgrids)
            const borderR =
              c % gameState.boxCols === gameState.boxCols - 1 && c !== gameState.size - 1
                ? 'border-r-2 border-r-cyan-400/50'
                : '';
            const borderB =
              r % gameState.boxRows === gameState.boxRows - 1 && r !== gameState.size - 1
                ? 'border-b-2 border-b-cyan-400/50'
                : '';

            return (
              <button
                key={`${r}-${c}`}
                onClick={() => setSelectedCell({ r, c })}
                onTouchStart={(e) => {
                  e.preventDefault();
                  setSelectedCell({ r, c });
                }}
                className={`relative flex items-center justify-center font-['Outfit'] font-black transition-all duration-75 select-none rounded-[5px] touch-none ${borderR} ${borderB} ${
                  isSelected
                    ? 'bg-cyan-500 text-slate-950 font-black shadow-[0_0_18px_#06b6d4] scale-105 z-10'
                    : cell.error
                    ? 'bg-rose-950/80 text-rose-300 border border-rose-500/60'
                    : isMatchingNum
                    ? 'bg-cyan-950/80 text-cyan-200 border border-cyan-400/50'
                    : inSameRow || inSameCol || inSameSector
                    ? 'bg-slate-900/90 text-slate-200'
                    : isDiagonalCell
                    ? 'bg-violet-950/60 text-violet-200 ring-1 ring-violet-500/30'
                    : 'bg-slate-900/50 text-slate-300 hover:bg-slate-800/80'
                } ${cell.initial ? 'font-black' : 'font-bold text-cyan-400'}`}
              >
                {cell.value !== 0 ? (
                  <span className={gameState.size === 6 ? 'text-xl sm:text-2xl' : 'text-base sm:text-lg'}>
                    {cell.value}
                  </span>
                ) : cell.notes.length > 0 ? (
                  <div
                    className={`grid ${
                      gameState.size === 6 ? 'grid-cols-3 grid-rows-2' : 'grid-cols-3 grid-rows-3'
                    } w-full h-full p-0.5 text-[7px] sm:text-[8px] font-mono leading-none text-slate-400 pointer-events-none`}
                  >
                    {numbersList.map((n) => (
                      <span key={n} className="flex items-center justify-center">
                        {cell.notes.includes(n) ? n : ''}
                      </span>
                    ))}
                  </div>
                ) : null}

                {/* Laser Diagonal Glow Indicator */}
                {isDiagonalCell && cell.value === 0 && (
                  <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-violet-500/10 to-transparent" />
                )}
              </button>
            );
          })
        )}

        {/* Completed Win Modal */}
        {gameState.completed && (
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-pop-in z-20">
            <span className="text-5xl animate-bounce mb-2">🏆</span>
            <h3 className="text-3xl font-black font-['Outfit'] text-cyan-300 drop-shadow-lg">
              MATRIX HACKED!
            </h3>
            <p className="text-xs text-slate-300 mt-1 max-w-xs font-mono">
              Variant: {gameState.variant.toUpperCase()} • Time: {formatTime(seconds)} • Mistakes: {gameState.mistakes}
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-3 mt-5">
              <button
                onClick={() => handleDifficultyChange(gameState.difficulty)}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 text-slate-950 font-black font-['Outfit'] text-sm shadow-xl active:scale-95 transition"
              >
                PLAY NEXT MATRIX
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

        {/* Game Over Modal (3 Mistakes) */}
        {gameState.mistakes >= gameState.maxMistakes && (
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-pop-in z-20">
            <span className="text-5xl mb-2">❌</span>
            <h3 className="text-3xl font-black font-['Outfit'] text-rose-400 tracking-tight">
              3 MISTAKES! FAILED
            </h3>
            <p className="text-xs text-slate-400 mt-1 font-mono">
              Syntax breach detected in logical matrix
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-3 mt-5">
              <button
                onClick={() => handleDifficultyChange(gameState.difficulty)}
                className="px-6 py-2.5 rounded-xl bg-rose-600 text-white font-black font-['Outfit'] text-sm shadow-xl active:scale-95 transition flex items-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4" />
                <span>RETRY PUZZLE</span>
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

      {/* Action Toolbar: Undo, Erase, Notes Mode, Hint */}
      <div className="w-full max-w-[440px] grid grid-cols-4 gap-2 pt-1 font-mono text-xs touch-none select-none">
        <button
          onClick={handleUndo}
          onTouchStart={(e) => {
            if (gameState.canUndo) {
              e.preventDefault();
              handleUndo();
            }
          }}
          disabled={!gameState.canUndo}
          className={`py-2 px-3 rounded-xl border flex flex-col items-center justify-center gap-1 transition ${
            gameState.canUndo
              ? 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
              : 'bg-slate-900/40 border-slate-800 text-slate-600 cursor-not-allowed'
          }`}
        >
          <Undo2 className="w-4 h-4" />
          <span className="text-[10px]">Undo</span>
        </button>

        <button
          onClick={() => handleInputNumber(0)}
          onTouchStart={(e) => {
            e.preventDefault();
            handleInputNumber(0);
          }}
          className="py-2 px-3 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white flex flex-col items-center justify-center gap-1 transition active:scale-95 shadow-sm"
        >
          <Eraser className="w-4 h-4" />
          <span className="text-[10px]">Erase</span>
        </button>

        <button
          onClick={() => setIsNoteMode((prev) => !prev)}
          onTouchStart={(e) => {
            e.preventDefault();
            setIsNoteMode((prev) => !prev);
          }}
          className={`py-2 px-3 rounded-xl border flex flex-col items-center justify-center gap-1 transition active:scale-95 shadow-sm ${
            isNoteMode
              ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold shadow-[0_0_10px_rgba(6,182,212,0.3)]'
              : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
          }`}
        >
          <Pencil className="w-4 h-4" />
          <span className="text-[10px]">{isNoteMode ? 'Notes ON' : 'Notes OFF'}</span>
        </button>

        <button
          onClick={handleHint}
          onTouchStart={(e) => {
            e.preventDefault();
            handleHint();
          }}
          className="py-2 px-3 rounded-xl bg-slate-900 border border-amber-500/40 hover:border-amber-400 text-amber-300 flex flex-col items-center justify-center gap-1 transition active:scale-95 shadow-sm"
        >
          <Lightbulb className="w-4 h-4" />
          <span className="text-[10px]">Hint</span>
        </button>
      </div>

      {/* Tactile Keypad (Numbers 1 through 6 or 9) */}
      <div
        className={`w-full max-w-[440px] grid ${
          gameState.size === 6 ? 'grid-cols-6 gap-2' : 'grid-cols-9 gap-1 sm:gap-1.5'
        } pt-1 touch-none select-none`}
      >
        {numbersList.map((num) => {
          const isCompleted = (numberCounts[num] || 0) >= gameState.size;
          return (
            <button
              key={num}
              onClick={() => handleInputNumber(num)}
              onTouchStart={(e) => {
                if (!isCompleted) {
                  e.preventDefault();
                  handleInputNumber(num);
                }
              }}
              disabled={isCompleted}
              className={`${
                gameState.size === 6 ? 'h-13 sm:h-14 text-xl' : 'h-11 sm:h-12 text-base sm:text-lg'
              } rounded-xl flex flex-col items-center justify-center font-['Outfit'] font-black transition active:scale-90 border ${
                isCompleted
                  ? 'bg-slate-950 border-slate-900 text-slate-700 cursor-not-allowed opacity-40'
                  : 'bg-slate-900 hover:bg-slate-800 border-slate-700 hover:border-cyan-400 text-white shadow-md'
              }`}
            >
              <span>{num}</span>
              <span className="text-[8px] font-mono text-cyan-400/80 -mt-1">
                {isCompleted ? <Check className="w-2.5 h-2.5" /> : gameState.size - (numberCounts[num] || 0)}
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-slate-400 font-mono text-center">
        ⌨️ Desktop: 1-{gameState.size} to Enter • N for Notes • Arrow keys to navigate
      </p>
    </div>
  );
};
