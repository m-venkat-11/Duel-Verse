import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Trophy, RefreshCw, Grid, Home, Sparkles, Frown } from 'lucide-react';
import { soundService } from '../services/sound';
import type { AuthoritativeRoomState } from '../types/room';

interface RematchModalProps {
  room: AuthoritativeRoomState;
  playerUid: string;
  onVoteRematch: () => void;
  onSwitchGame: () => void;
  onReturnToLobby: () => void;
}

export const RematchModal: React.FC<RematchModalProps> = ({
  room,
  playerUid,
  onVoteRematch,
  onSwitchGame,
  onReturnToLobby
}) => {
  const isMatchEnd = room.status === 'match_end';
  const isRoundEnd = room.status === 'round_end';

  if (!isMatchEnd && !isRoundEnd) return null;

  const winnerUid = isMatchEnd ? room.matchWinnerUid : room.roundWinnerUid;
  const isDraw = winnerUid === 'draw';
  const isWinner = winnerUid === playerUid;
  const winnerPlayer = winnerUid && winnerUid !== 'draw' ? room.players[winnerUid] : null;

  const hasVotedRematch = Boolean(room.rematchVotes[playerUid]);
  const totalRematchVotes = Object.values(room.rematchVotes).filter(Boolean).length;

  useEffect(() => {
    if (isMatchEnd) {
      if (isWinner) {
        soundService.playVictory();
        confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.6 }
        });
      } else if (isDraw) {
        soundService.playDraw();
      } else {
        soundService.playDefeat();
      }
    } else if (isRoundEnd) {
      if (isWinner) {
        soundService.playScore();
      } else if (isDraw) {
        soundService.playDraw();
      }
    }
  }, [isMatchEnd, isRoundEnd, isWinner, isDraw]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="glass-panel max-w-md w-full p-6 text-center relative border border-violet-500/40 shadow-2xl overflow-hidden">
        {/* Glow backdrop */}
        <div
          className={`absolute -top-24 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full blur-3xl pointer-events-none ${
            isWinner ? 'bg-amber-500/30' : isDraw ? 'bg-cyan-500/20' : 'bg-rose-500/20'
          }`}
        />

        {/* Outcome Header Icon */}
        <div className="relative inline-block mb-3">
          <div
            className={`w-20 h-20 rounded-2xl flex items-center justify-center text-4xl border-2 shadow-xl mx-auto ${
              isWinner
                ? 'bg-amber-500/20 border-amber-400 text-amber-400 shadow-amber-500/30'
                : isDraw
                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-cyan-500/20'
                : 'bg-slate-800/80 border-slate-700 text-slate-300'
            }`}
          >
            {isWinner ? '🏆' : isDraw ? '🤝' : '⚔️'}
          </div>
        </div>

        {/* Title */}
        <h2 className="text-2xl sm:text-3xl font-black font-['Outfit'] text-white tracking-tight">
          {isMatchEnd ? (
            isWinner ? (
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-yellow-500">
                VICTORY IS YOURS!
              </span>
            ) : isDraw ? (
              <span className="text-cyan-300">HONORABLE DRAW!</span>
            ) : (
              <span className="text-slate-200">
                {winnerPlayer?.nickname || 'OPPONENT'} WINS!
              </span>
            )
          ) : isWinner ? (
            <span className="text-amber-400">ROUND WON!</span>
          ) : isDraw ? (
            <span className="text-cyan-300">ROUND DRAW!</span>
          ) : (
            <span className="text-rose-400">ROUND LOST!</span>
          )}
        </h2>

        <p className="text-xs text-slate-400 mt-1 mb-5">
          {isMatchEnd
            ? `Final Match Score: ${Object.values(room.scores).join(' - ')}`
            : `Scores: ${Object.values(room.scores).join(' - ')}`}
        </p>

        {/* Rematch Actions */}
        <div className="space-y-2.5">
          {/* Vote Rematch Button */}
          <button
            onClick={() => {
              soundService.playClick();
              onVoteRematch();
            }}
            disabled={hasVotedRematch}
            className={`w-full py-3.5 px-4 rounded-xl font-bold font-['Outfit'] flex items-center justify-center gap-2 transition text-base ${
              hasVotedRematch
                ? 'bg-emerald-950/60 border border-emerald-500/50 text-emerald-300 cursor-default'
                : 'btn-primary'
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${hasVotedRematch ? 'animate-spin' : ''}`} />
            <span>
              {hasVotedRematch
                ? `Rematch Voted (${totalRematchVotes}/2)`
                : `Vote Rematch (${totalRematchVotes}/2)`}
            </span>
          </button>

          {/* Switch Game Button */}
          <button
            onClick={() => {
              soundService.playClick();
              onSwitchGame();
            }}
            className="w-full py-3 px-4 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-200 font-bold font-['Outfit'] hover:border-violet-500/50 hover:bg-slate-800 transition flex items-center justify-center gap-2 text-sm"
          >
            <Grid className="w-4 h-4 text-violet-400" />
            <span>Switch Game (Keep Room)</span>
          </button>

          {/* Return to Lobby */}
          <button
            onClick={() => {
              soundService.playClick();
              onReturnToLobby();
            }}
            className="w-full py-2.5 px-4 text-slate-400 hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Back to Room Lobby</span>
          </button>
        </div>
      </div>
    </div>
  );
};
