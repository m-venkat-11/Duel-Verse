import React, { useState, useEffect, useRef } from 'react';
import type { ConnectFourState } from '../../types/game';
import type { AuthoritativeRoomState } from '../../types/room';
import { soundService } from '../../services/sound';
import { JuiceEngine } from '../../engine/core/JuiceEngine';
import { ROWS, COLS } from '../../engine/connectFourEngine';

interface ConnectFourViewProps {
  room: AuthoritativeRoomState<ConnectFourState>;
  playerUid: string;
  onDispatchAction: (type: string, payload: any) => void;
}

export const ConnectFourView: React.FC<ConnectFourViewProps> = ({
  room,
  playerUid,
  onDispatchAction
}) => {
  const gameState = room.gameState;
  const isMyTurn = gameState.currentTurn === playerUid;
  const [hoveredCol, setHoveredCol] = useState<number | null>(null);
  const [lastDropped, setLastDropped] = useState<{ r: number; c: number } | null>(null);

  const players = Object.values(room.players);
  const opponent = players.find((p) => p.uid !== playerUid);
  const isWinner =
    gameState.winningCoords !== null &&
    gameState.winningCoords.length > 0 &&
    gameState.grid[gameState.winningCoords[0][0]][gameState.winningCoords[0][1]] === playerUid;

  const juiceRef = useRef<JuiceEngine | null>(null);
  if (!juiceRef.current) {
    juiceRef.current = new JuiceEngine(150);
  }

  // Detect new drops to trigger physical impact sounds and shake
  const prevGridRef = useRef(gameState.grid);
  useEffect(() => {
    let foundDrop: { r: number; c: number } | null = null;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (prevGridRef.current[r][c] === null && gameState.grid[r][c] !== null) {
          foundDrop = { r, c };
          break;
        }
      }
      if (foundDrop) break;
    }
    prevGridRef.current = gameState.grid;

    if (foundDrop) {
      setLastDropped(foundDrop);
      soundService.playImpact(0.9);
      juiceRef.current?.addTrauma(0.15);
    }

    if (gameState.winningCoords && gameState.winningCoords.length > 0) {
      soundService.playGoal();
      juiceRef.current?.addTrauma(0.4);
    }
  }, [gameState.grid, gameState.winningCoords]);

  const handleDrop = (col: number) => {
    if (!isMyTurn || gameState.winningCoords !== null) return;
    if (gameState.grid[0][col] !== null) {
      soundService.playFalseStart();
      return;
    }
    soundService.playMove();
    onDispatchAction('CONNECTFOUR_DROP', { col });
  };

  const isWinningDisc = (r: number, c: number) => {
    if (!gameState.winningCoords) return false;
    return gameState.winningCoords.some(([row, col]) => row === r && col === c);
  };

  // Status
  let statusText = '';
  let statusClass = '';
  if (gameState.winningCoords !== null) {
    statusText = isWinner ? '🏆 CONNECT FOUR! VICTORY!' : '💥 RIVAL CONNECTED FOUR!';
    statusClass = isWinner
      ? 'text-emerald-300 bg-emerald-950/80 border-emerald-500 shadow-emerald-500/30'
      : 'text-rose-300 bg-rose-950/80 border-rose-500 shadow-rose-500/30';
  } else if (isMyTurn) {
    statusText = '👇 YOUR TURN — DROP DISC';
    statusClass = 'text-amber-300 bg-amber-950/70 border-amber-500/80 animate-pulse shadow-amber-500/20';
  } else {
    statusText = `⏳ ${opponent?.nickname || 'Rival'} is thinking...`;
    statusClass = 'text-slate-300 bg-slate-900/80 border-slate-700';
  }

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col items-center select-none gap-3 px-2">
      {/* Live Turn & Match Status */}
      <div
        className={`w-full px-5 py-3 rounded-2xl border-2 text-center text-sm font-black font-mono tracking-wider shadow-xl transition-all ${statusClass}`}
      >
        {statusText}
      </div>

      {/* Modern Player Legend */}
      <div className="flex items-center justify-between w-full px-5 py-2.5 rounded-2xl bg-slate-900/90 border border-white/10 text-xs font-bold font-mono shadow-md backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-300 border-2 border-amber-200 shadow-md ring-2 ring-amber-500/40" />
          <span className="text-amber-300 text-sm font-['Outfit'] font-black">You (Gold)</span>
        </div>
        <span className="text-slate-500 text-xs font-black tracking-widest">VS</span>
        <div className="flex items-center gap-3">
          <span className="text-rose-300 text-sm font-['Outfit'] font-black">{opponent?.nickname || 'CyberBot AI'}</span>
          <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-rose-600 to-rose-400 border-2 border-rose-300 shadow-md ring-2 ring-rose-500/40" />
        </div>
      </div>

      {/* Column Hover & Drop Guides */}
      <div className="grid grid-cols-7 gap-2 sm:gap-3 w-full px-3 pt-1">
        {Array.from({ length: COLS }).map((_, c) => {
          const isFull = gameState.grid[0][c] !== null;
          const isHov = hoveredCol === c && isMyTurn && !isFull;
          return (
            <button
              key={c}
              onClick={() => handleDrop(c)}
              onMouseEnter={() => setHoveredCol(c)}
              onMouseLeave={() => setHoveredCol(null)}
              disabled={!isMyTurn || isFull || gameState.winningCoords !== null}
              className={`h-12 sm:h-14 rounded-2xl flex items-center justify-center text-lg font-black transition-all duration-150 ${
                isMyTurn && !isFull
                  ? isHov
                    ? 'bg-amber-400 text-slate-950 scale-110 shadow-2xl shadow-amber-400/70 -translate-y-2'
                    : 'text-amber-400/90 hover:text-amber-300 hover:scale-105 bg-amber-500/20 border-2 border-amber-500/50 shadow-sm'
                  : 'opacity-20 cursor-not-allowed bg-slate-900/30'
              }`}
            >
              {isHov ? '▼' : '↓'}
            </button>
          );
        })}
      </div>

      {/* Physical 3D Arcade Cabinet */}
      <div
        className="w-full rounded-3xl p-3 border-4 border-blue-600/80 shadow-2xl relative overflow-hidden"
        style={{
          background: 'linear-gradient(175deg, #1e3a8a 0%, #172554 60%, #0f172a 100%)',
          boxShadow: '0 0 50px rgba(37, 99, 235, 0.4), inset 0 2px 6px rgba(255, 255, 255, 0.25)'
        }}
      >
        {/* Subtle grid mesh overlay */}
        <div className="grid grid-cols-7 gap-2 relative z-10">
          {gameState.grid.map((row, rIdx) =>
            row.map((cellUid, cIdx) => {
              const isWin = isWinningDisc(rIdx, cIdx);
              const color = cellUid ? gameState.colors?.[cellUid] : null;
              const isHovCell = hoveredCol === cIdx && isMyTurn && !gameState.winningCoords && cellUid === null;
              const isJustDropped = lastDropped?.r === rIdx && lastDropped?.c === cIdx;

              return (
                <div
                  key={`${rIdx}-${cIdx}`}
                  onClick={() => handleDrop(cIdx)}
                  className={`aspect-square rounded-full flex items-center justify-center relative cursor-pointer overflow-hidden transition-all duration-150 ${
                    cellUid === null
                      ? `bg-slate-950/90 shadow-[inset_0_5px_10px_rgba(0,0,0,0.9)] ${
                          isHovCell ? 'ring-2 ring-amber-400/60 bg-amber-950/20' : ''
                        }`
                      : isWin
                      ? 'scale-110 z-20 animate-pulse'
                      : isJustDropped
                      ? 'animate-drop-bounce z-10'
                      : 'z-10'
                  }`}
                  style={
                    cellUid !== null
                      ? {
                          background: isWin
                            ? 'linear-gradient(135deg, #10b981 0%, #6ee7b7 100%)'
                            : color === 'crimson'
                            ? 'linear-gradient(135deg, #be123c 0%, #fb7185 100%)'
                            : 'linear-gradient(135deg, #b45309 0%, #fbbf24 100%)',
                          boxShadow: isWin
                            ? '0 0 30px #10b981, inset 0 3px 6px rgba(255,255,255,0.6)'
                            : color === 'crimson'
                            ? '0 6px 14px rgba(0,0,0,0.6), inset 0 3px 5px rgba(255,255,255,0.4)'
                            : '0 6px 14px rgba(0,0,0,0.6), inset 0 3px 5px rgba(255,255,255,0.4)',
                          border: isWin ? '2px solid white' : '2px solid rgba(255,255,255,0.3)'
                        }
                      : undefined
                  }
                >
                  {/* Disc specular glossy reflection */}
                  {cellUid !== null && (
                    <div className="absolute top-[12%] left-[18%] w-[40%] h-[24%] rounded-full bg-white/35 pointer-events-none" />
                  )}

                  {/* Winning Star Ring */}
                  {isWin && (
                    <div className="w-3.5 h-3.5 rounded-full bg-white animate-ping opacity-75" />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <p className="text-[11px] text-slate-400 font-medium">
        🎯 Tap any column to drop a disc • Connect 4 horizontally, vertically, or diagonally
      </p>
    </div>
  );
};
