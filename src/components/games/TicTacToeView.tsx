import React, { useState } from 'react';
import type { TicTacToeState } from '../../types/game';
import type { AuthoritativeRoomState } from '../../types/room';
import { soundService } from '../../services/sound';

interface TicTacToeViewProps {
  room: AuthoritativeRoomState<TicTacToeState>;
  playerUid: string;
  onDispatchAction: (type: string, payload: any) => void;
}

export const TicTacToeView: React.FC<TicTacToeViewProps> = ({
  room,
  playerUid,
  onDispatchAction
}) => {
  const gameState = room.gameState;
  const isMyTurn = gameState.currentTurn === playerUid;
  const [shakingCell, setShakingCell] = useState<number | null>(null);

  const handleCellClick = (index: number) => {
    // If not my turn or cell already filled or game over
    if (!isMyTurn || gameState.board[index] !== null || gameState.winningLine !== null) {
      soundService.playFalseStart();
      setShakingCell(index);
      setTimeout(() => setShakingCell(null), 400);
      return;
    }

    soundService.playMove();
    onDispatchAction('TICTACTOE_MOVE', { cellIndex: index });
  };

  const getCellSymbol = (val: string | null) => {
    if (!val) return null;
    return gameState.symbols[val] || 'X';
  };

  return (
    <div className="w-full max-w-sm mx-auto flex flex-col items-center">
      {/* Turn Banner */}
      <div className="mb-4 px-4 py-2 rounded-xl bg-slate-900/80 border border-slate-700/80 flex items-center gap-2 text-xs font-bold font-['Outfit']">
        <span
          className={`w-2 h-2 rounded-full ${
            isMyTurn ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'
          }`}
        />
        <span className={isMyTurn ? 'text-emerald-400' : 'text-slate-400'}>
          {gameState.winningLine !== null
            ? 'Round Concluded'
            : gameState.isDraw
            ? 'Match Tied'
            : isMyTurn
            ? 'YOUR TURN — TAP A SQUARE'
            : "WAITING FOR OPPONENT'S MOVE..."}
        </span>
      </div>

      {/* 3x3 Grid */}
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3 p-3 bg-slate-900/90 rounded-2xl border-2 border-violet-500/30 shadow-2xl w-full aspect-square">
        {gameState.board.map((cellValue, idx) => {
          const symbol = getCellSymbol(cellValue);
          const isWinningCell = gameState.winningLine?.includes(idx);
          const isShaking = shakingCell === idx;

          return (
            <button
              key={idx}
              onClick={() => handleCellClick(idx)}
              disabled={cellValue !== null || !isMyTurn || gameState.winningLine !== null}
              className={`rounded-xl font-black text-4xl sm:text-5xl font-['Outfit'] flex items-center justify-center transition-all duration-150 select-none ${
                isShaking ? 'animate-shake' : ''
              } ${
                isWinningCell
                  ? 'bg-emerald-500/30 border-2 border-emerald-400 text-emerald-300 shadow-lg shadow-emerald-500/40 scale-105'
                  : cellValue !== null
                  ? symbol === 'X'
                    ? 'bg-amber-950/40 border border-amber-500/40 text-amber-400'
                    : 'bg-rose-950/40 border border-rose-500/40 text-rose-400'
                  : isMyTurn
                  ? 'bg-slate-800/80 hover:bg-slate-700/90 border border-slate-700 hover:border-violet-400/80 active:scale-95 cursor-pointer'
                  : 'bg-slate-800/40 border border-slate-800/80 cursor-not-allowed opacity-75'
              }`}
            >
              {symbol}
            </button>
          );
        })}
      </div>
    </div>
  );
};
