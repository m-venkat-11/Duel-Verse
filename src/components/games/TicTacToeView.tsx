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
  const [lastTapped, setLastTapped] = useState<number | null>(null);

  const players = Object.values(room.players);
  const opponent = players.find(p => p.uid !== playerUid);
  const mySymbol = gameState.symbols?.[playerUid] || 'X';
  const opSymbol = mySymbol === 'X' ? 'O' : 'X';

  const handleCellClick = (index: number) => {
    if (!isMyTurn || gameState.board[index] !== null || gameState.winningLine !== null) {
      soundService.playFalseStart();
      setShakingCell(index);
      setTimeout(() => setShakingCell(null), 350);
      return;
    }
    soundService.playMove();
    setLastTapped(index);
    onDispatchAction('TICTACTOE_MOVE', { cellIndex: index });
  };

  const getCellOwner = (val: string | null) => {
    if (!val) return null;
    return gameState.symbols?.[val] || 'X';
  };

  const isWinner = gameState.winningLine !== null && gameState.board[gameState.winningLine[0]] === playerUid;

  // Status message
  let statusMsg = '';
  let statusClass = 'text-slate-400 border-slate-700 bg-slate-900/80';
  if (gameState.winningLine !== null) {
    statusMsg = isWinner ? '🎉 YOU WIN THIS ROUND!' : '💥 RIVAL WINS!';
    statusClass = isWinner ? 'text-emerald-300 border-emerald-500 bg-emerald-950/80' : 'text-rose-300 border-rose-500 bg-rose-950/80';
  } else if (gameState.isDraw) {
    statusMsg = '🤝 IT\'S A DRAW!';
    statusClass = 'text-amber-300 border-amber-500 bg-amber-950/80';
  } else if (isMyTurn) {
    statusMsg = `YOUR TURN — TAP A TILE (${mySymbol})`;
    statusClass = 'text-amber-300 border-amber-500/60 bg-amber-950/60 animate-pulse';
  } else {
    statusMsg = `RIVAL'S TURN (${opSymbol})...`;
    statusClass = 'text-slate-400 border-slate-700 bg-slate-900/80';
  }

  return (
    <div className="w-full max-w-lg mx-auto flex flex-col items-center select-none gap-3 px-2">
      {/* Status Pill */}
      <div className={`w-full px-5 py-3 rounded-2xl border-2 flex items-center justify-center gap-2 text-sm font-black font-mono tracking-wider shadow-xl transition-all duration-200 ${statusClass}`}>
        {isMyTurn && !gameState.winningLine && !gameState.isDraw && (
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping shrink-0" />
        )}
        <span className="text-center">{statusMsg}</span>
      </div>

      {/* Player Legend */}
      <div className="flex items-center gap-6 text-xs font-bold font-mono">
        <div className="flex items-center gap-2">
          <span className="text-amber-400 text-2xl font-black">✕</span>
          <span className="text-slate-300">You ({mySymbol === 'X' ? 'X' : 'O'})</span>
        </div>
        <span className="text-slate-600 font-black">VS</span>
        <div className="flex items-center gap-2">
          <span className="text-cyan-400 text-2xl font-black">○</span>
          <span className="text-slate-300">{opponent?.nickname || 'CyberBot AI'}</span>
        </div>
      </div>

      {/* 3×3 Grid */}
      <div className="w-full aspect-square p-4 sm:p-5 rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border-2 border-violet-500/40 shadow-2xl grid grid-cols-3 gap-3 sm:gap-4"
        style={{ boxShadow: '0 0 50px rgba(139,92,246,0.18), 0 25px 70px rgba(0,0,0,0.6)' }}
      >
        {gameState.board.map((cellValue, idx) => {
          const owner = getCellOwner(cellValue);
          const isWinningCell = gameState.winningLine?.includes(idx);
          const isShaking = shakingCell === idx;
          const justPlaced = lastTapped === idx;

          return (
            <button
              key={idx}
              onClick={() => handleCellClick(idx)}
              disabled={cellValue !== null || !isMyTurn || gameState.winningLine !== null}
              className={`rounded-2xl sm:rounded-3xl flex items-center justify-center relative transition-all duration-150 select-none shadow-lg
                ${isShaking ? 'animate-shake' : ''}
                ${isWinningCell
                  ? 'bg-emerald-500/30 border-2 border-emerald-400 shadow-xl shadow-emerald-500/50 scale-105 z-10'
                  : cellValue !== null
                  ? 'bg-slate-800/95 border border-slate-700/80'
                  : isMyTurn
                  ? 'bg-slate-800/70 hover:bg-violet-900/50 border-2 border-slate-700 hover:border-violet-400 active:scale-95 cursor-pointer shadow-inner'
                  : 'bg-slate-900/60 border border-slate-800/60 cursor-not-allowed'
                }
              `}
            >
              {owner === 'X' ? (
                <svg
                  className={`w-16 h-16 sm:w-20 sm:h-20 text-amber-400 drop-shadow-[0_0_18px_rgba(245,158,11,0.9)] ${justPlaced ? 'animate-pop-in' : ''}`}
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              ) : owner === 'O' ? (
                <svg
                  className={`w-16 h-16 sm:w-20 sm:h-20 text-cyan-400 drop-shadow-[0_0_18px_rgba(6,182,212,0.9)] ${justPlaced ? 'animate-pop-in' : ''}`}
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2"
                >
                  <circle cx="12" cy="12" r="8" />
                </svg>
              ) : (
                <div className={`w-8 h-8 rounded-full border-2 transition-all ${isMyTurn ? 'border-slate-700 hover:border-violet-500 opacity-40' : 'opacity-0'}`} />
              )}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-slate-400 font-medium font-mono">
        {mySymbol === 'X' ? '✕' : '○'} Get 3 in a line to claim victory
      </p>
    </div>
  );
};
