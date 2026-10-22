import React, { useState } from 'react';
import type { ConnectFourState } from '../../types/game';
import type { AuthoritativeRoomState } from '../../types/room';
import { soundService } from '../../services/sound';
import { ChevronDown } from 'lucide-react';
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

  const handleDrop = (col: number) => {
    if (!isMyTurn || gameState.winningCoords !== null) return;
    // Check if column is already full (row 0 has disc)
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

  return (
    <div className="w-full max-w-md mx-auto flex flex-col items-center">
      {/* Turn Status */}
      <div className="mb-3 px-4 py-1.5 rounded-xl bg-slate-900/80 border border-slate-700/80 flex items-center gap-2 text-xs font-bold font-['Outfit']">
        <span
          className={`w-2 h-2 rounded-full ${
            isMyTurn ? 'bg-amber-400 animate-ping' : 'bg-slate-500'
          }`}
        />
        <span className={isMyTurn ? 'text-amber-400' : 'text-slate-400'}>
          {gameState.winningCoords !== null
            ? 'Connect Four! Game Over'
            : isMyTurn
            ? 'YOUR TURN — TAP A COLUMN TO DROP DISC'
            : "WAITING FOR OPPONENT'S DROP..."}
        </span>
      </div>

      {/* Column Drop Indicator Arrows */}
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2 w-full px-2 mb-1">
        {Array.from({ length: COLS }).map((_, c) => {
          const isFull = gameState.grid[0][c] !== null;

          return (
            <button
              key={c}
              onClick={() => handleDrop(c)}
              onMouseEnter={() => setHoveredCol(c)}
              onMouseLeave={() => setHoveredCol(null)}
              disabled={!isMyTurn || isFull || gameState.winningCoords !== null}
              className={`h-8 rounded-lg flex items-center justify-center transition ${
                isMyTurn && !isFull && (hoveredCol === c || true)
                  ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/40 cursor-pointer active:scale-95'
                  : 'text-transparent cursor-not-allowed opacity-30'
              }`}
            >
              <ChevronDown className="w-5 h-5 animate-bounce" />
            </button>
          );
        })}
      </div>

      {/* Connect Four 6x7 Grid Board */}
      <div className="bg-blue-900/90 border-4 border-blue-700/80 p-2 sm:p-3 rounded-2xl shadow-2xl w-full">
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {gameState.grid.map((row, rIdx) =>
            row.map((cellUid, cIdx) => {
              const isWin = isWinningDisc(rIdx, cIdx);
              const color = cellUid ? gameState.colors[cellUid] : null;

              return (
                <div
                  key={`${rIdx}-${cIdx}`}
                  onClick={() => handleDrop(cIdx)}
                  className={`aspect-square rounded-full flex items-center justify-center relative cursor-pointer overflow-hidden ${
                    cellUid === null
                      ? 'bg-slate-950/80 shadow-inner'
                      : isWin
                      ? 'bg-emerald-400 shadow-lg shadow-emerald-400/80 scale-105 border-2 border-white animate-pulse'
                      : color === 'crimson'
                      ? 'bg-gradient-to-tr from-rose-700 to-rose-500 border border-rose-400 shadow-md animate-drop-bounce'
                      : 'bg-gradient-to-tr from-amber-600 to-amber-400 border border-amber-300 shadow-md animate-drop-bounce'
                  }`}
                >
                  {cellUid !== null && (
                    <div className="w-3/4 h-3/4 rounded-full border border-white/20" />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
