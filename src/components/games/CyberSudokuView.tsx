import React, { useState, useEffect } from 'react';
import type { AuthoritativeRoomState } from '../../types/room';
import {
  type CyberSudokuState,
  type SudokuDifficulty,
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
  Check
} from 'lucide-react';

interface CyberSudokuViewProps {
  room: AuthoritativeRoomState<any>;
  playerUid: string;
  onDispatchAction: (type: string, payload: any) => void;
}

export const CyberSudokuView: React.FC<CyberSudokuViewProps> = () => {
  const [gameState, setGameState] = useState<CyberSudokuState>(() => createCyberSudokuInitialState('casual'));
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

  const handleDifficultyChange = (diff: SudokuDifficulty) => {
    soundService.playClick();
    setGameState(createCyberSudokuInitialState(diff));
    setSeconds(0);
    setSelectedCell({ r: 4, c: 4 });
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

      if (e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        handleInputNumber(parseInt(e.key, 10));
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        handleInputNumber(0);
      } else if (e.key === 'ArrowUp' && r > 0) {
        e.preventDefault();
        setSelectedCell({ r: r - 1, c });
      } else if (e.key === 'ArrowDown' && r < 8) {
        e.preventDefault();
        setSelectedCell({ r: r + 1, c });
      } else if (e.key === 'ArrowLeft' && c > 0) {
        e.preventDefault();
        setSelectedCell({ r, c: c - 1 });
      } else if (e.key === 'ArrowRight' && c < 8) {
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

  // Count remaining numbers (1..9)
  const numberCounts: Record<number, number> = {};
  for (let n = 1; n <= 9; n++) numberCounts[n] = 0;
  gameState.grid.forEach((row) => {
    row.forEach((cell) => {
      if (cell.value >= 1 && cell.value <= 9 && !cell.error) {
        numberCounts[cell.value] = (numberCounts[cell.value] || 0) + 1;
      }
    });
  });

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col items-center select-none gap-2.5 px-2">
      {/* Top Header & Difficulty Selector */}
      <div className="w-full flex items-center justify-between px-4 py-2 rounded-2xl bg-slate-900/90 border border-slate-700/60 text-xs font-mono shadow-md backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="text-xl">🧩</span>
          <div>
            <div className="text-sm font-['Outfit'] font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-indigo-300">
              CYBER SUDOKU
            </div>
            <div className="text-[10px] text-cyan-400 font-bold uppercase">{gameState.difficulty}</div>
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

      {/* Status Bar: Mistakes + Timer */}
      <div className="w-full flex items-center justify-between px-3 text-xs font-mono">
        <div className="flex items-center gap-1.5 text-slate-300">
          <AlertCircle className="w-4 h-4 text-rose-400" />
          <span>Mistakes:</span>
          <span className={`font-black ${gameState.mistakes > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
            {gameState.mistakes} / {gameState.maxMistakes}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-cyan-400 font-bold tabular-nums">
          <Timer className="w-4 h-4" />
          <span>{formatTime(seconds)}</span>
        </div>
      </div>

      {/* 9×9 Matrix Grid */}
      <div
        className="w-full aspect-square max-w-[440px] p-2 sm:p-2.5 rounded-3xl bg-slate-950 border-2 border-cyan-500/40 shadow-2xl grid grid-cols-9 grid-rows-9 gap-[2px] relative overflow-hidden"
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
            const inSameSector =
              Math.floor(selectedCell.r / 3) === Math.floor(r / 3) &&
              Math.floor(selectedCell.c / 3) === Math.floor(c / 3);

            // Sector border styling (Thick border every 3 cells)
            const borderR = c % 3 === 2 && c !== 8 ? 'border-r-2 border-r-cyan-400/50' : '';
            const borderB = r % 3 === 2 && r !== 8 ? 'border-b-2 border-b-cyan-400/50' : '';

            return (
              <button
                key={`${r}-${c}`}
                onClick={() => setSelectedCell({ r, c })}
                className={`relative flex items-center justify-center font-['Outfit'] font-black transition-all duration-75 select-none rounded-[4px] ${borderR} ${borderB} ${
                  isSelected
                    ? 'bg-cyan-500 text-slate-950 font-black shadow-[0_0_15px_#06b6d4] scale-105 z-10'
                    : cell.error
                    ? 'bg-rose-950/80 text-rose-300 border border-rose-500/60'
                    : isMatchingNum
                    ? 'bg-cyan-950/80 text-cyan-200 border border-cyan-400/50'
                    : inSameRow || inSameCol || inSameSector
                    ? 'bg-slate-900/90 text-slate-200'
                    : 'bg-slate-900/50 text-slate-300 hover:bg-slate-800/80'
                } ${cell.initial ? 'font-black' : 'font-bold text-cyan-400'}`}
              >
                {cell.value !== 0 ? (
                  <span className="text-base sm:text-lg">{cell.value}</span>
                ) : cell.notes.length > 0 ? (
                  <div className="grid grid-cols-3 grid-rows-3 w-full h-full p-0.5 text-[7px] sm:text-[8px] font-mono leading-none text-slate-400 pointer-events-none">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                      <span key={n} className="flex items-center justify-center">
                        {cell.notes.includes(n) ? n : ''}
                      </span>
                    ))}
                  </div>
                ) : null}
              </button>
            );
          })
        )}

        {/* Completed Win Modal */}
        {gameState.completed && (
          <div className="absolute inset-0 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-pop-in z-20">
            <span className="text-5xl animate-bounce mb-2">🏆</span>
            <h3 className="text-3xl font-black font-['Outfit'] text-cyan-300 drop-shadow-lg">
              MATRIX HACKED!
            </h3>
            <p className="text-xs text-slate-300 mt-1 max-w-xs font-mono">
              Time: {formatTime(seconds)} • Difficulty: {gameState.difficulty.toUpperCase()}
            </p>
            <button
              onClick={() => handleDifficultyChange(gameState.difficulty)}
              className="mt-5 px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 text-slate-950 font-black font-['Outfit'] text-sm shadow-xl active:scale-95 transition"
            >
              PLAY NEXT MATRIX
            </button>
          </div>
        )}

        {/* Game Over Modal (3 Mistakes) */}
        {gameState.mistakes >= gameState.maxMistakes && (
          <div className="absolute inset-0 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-pop-in z-20">
            <span className="text-5xl mb-2">❌</span>
            <h3 className="text-3xl font-black font-['Outfit'] text-rose-400 tracking-tight">
              3 MISTAKES! FAILED
            </h3>
            <p className="text-xs text-slate-400 mt-1 font-mono">
              Too many syntax errors in neural logic
            </p>
            <button
              onClick={() => handleDifficultyChange(gameState.difficulty)}
              className="mt-5 px-6 py-2.5 rounded-xl bg-rose-600 text-white font-black font-['Outfit'] text-sm shadow-xl active:scale-95 transition flex items-center gap-1.5"
            >
              <RotateCcw className="w-4 h-4" />
              <span>RESTART PUZZLE</span>
            </button>
          </div>
        )}
      </div>

      {/* Action Toolbar: Undo, Erase, Notes Mode, Hint */}
      <div className="w-full max-w-[440px] grid grid-cols-4 gap-2 pt-1 font-mono text-xs">
        <button
          onClick={handleUndo}
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
          className="py-2 px-3 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white flex flex-col items-center justify-center gap-1 transition active:scale-95 shadow-sm"
        >
          <Eraser className="w-4 h-4" />
          <span className="text-[10px]">Erase</span>
        </button>

        <button
          onClick={() => setIsNoteMode((prev) => !prev)}
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
          className="py-2 px-3 rounded-xl bg-slate-900 border border-amber-500/40 hover:border-amber-400 text-amber-300 flex flex-col items-center justify-center gap-1 transition active:scale-95 shadow-sm"
        >
          <Lightbulb className="w-4 h-4" />
          <span className="text-[10px]">Hint</span>
        </button>
      </div>

      {/* Tactile Keypad (Numbers 1 through 9) */}
      <div className="w-full max-w-[440px] grid grid-cols-9 gap-1.5 pt-1">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => {
          const isCompleted = (numberCounts[num] || 0) >= 9;
          return (
            <button
              key={num}
              onClick={() => handleInputNumber(num)}
              disabled={isCompleted}
              className={`h-12 rounded-xl flex flex-col items-center justify-center font-['Outfit'] font-black text-lg transition active:scale-90 border ${
                isCompleted
                  ? 'bg-slate-950 border-slate-900 text-slate-700 cursor-not-allowed opacity-40'
                  : 'bg-slate-900 hover:bg-slate-800 border-slate-700 hover:border-cyan-400 text-white shadow-md'
              }`}
            >
              <span>{num}</span>
              <span className="text-[8px] font-mono text-cyan-400/80 -mt-1">
                {isCompleted ? <Check className="w-2.5 h-2.5" /> : 9 - (numberCounts[num] || 0)}
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-slate-400 font-mono text-center">
        ⌨️ Desktop: 1-9 to Enter • N for Notes • Arrow keys to navigate
      </p>
    </div>
  );
};
