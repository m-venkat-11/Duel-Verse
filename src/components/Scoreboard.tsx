import React from 'react';
import { Crown, AlertTriangle } from 'lucide-react';
import type { AuthoritativeRoomState, PlayerSession } from '../types/room';
import { getGameMetadata } from '../config/games';

interface ScoreboardProps {
  room: AuthoritativeRoomState;
  playerUid: string;
}

export const Scoreboard: React.FC<ScoreboardProps> = ({ room, playerUid }) => {
  const players = Object.values(room.players) as PlayerSession[];
  const p1 = players[0];
  const p2 = players[1];

  const p1Score = p1 ? room.scores[p1.uid] || 0 : 0;
  const p2Score = p2 ? room.scores[p2.uid] || 0 : 0;

  const opponent = players.find((p) => p.uid !== playerUid);
  const isOpponentDisconnected =
    opponent &&
    !opponent.isConnected &&
    opponent.uid !== 'bot_rival' &&
    !opponent.nickname?.includes('Bot');
  const game = getGameMetadata(room.selectedGameId);

  return (
    <div className="w-full max-w-2xl mx-auto px-2 sm:px-4 mb-3 shrink-0">
      {/* Grace period banner if disconnected */}
      {isOpponentDisconnected && (
        <div className="mb-2 px-3 py-1.5 rounded-xl bg-amber-950/90 border border-amber-500/60 text-amber-300 flex items-center justify-between gap-2 text-xs font-semibold animate-pulse shadow-lg">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Rival reconnecting (15s grace window)...</span>
          </div>
          <span className="font-mono text-amber-400 text-[11px] font-bold">GAME PAUSED</span>
        </div>
      )}

      {/* Modern 2-Player Game Arena HUD */}
      <div className="relative rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-white/15 p-2 sm:p-2.5 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between gap-2 relative z-10">
          
          {/* Player 1 (Amber / Gold Fighter) */}
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            <div className="relative shrink-0">
              <div
                className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center text-2xl sm:text-3xl border-2 transition-all shadow-md ${
                  p1Score > p2Score
                    ? 'border-amber-400 bg-amber-500/25 shadow-amber-500/30 scale-105'
                    : 'border-amber-500/40 bg-slate-800/80'
                }`}
              >
                {p1 ? p1.avatarId : '👤'}
              </div>
              {p1Score > p2Score && (
                <div className="absolute -top-2 -left-1 p-0.5 rounded-full bg-amber-400 text-slate-950 shadow-md">
                  <Crown className="w-3 h-3 fill-current" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs sm:text-sm font-extrabold text-white truncate font-['Outfit']">
                  {p1 ? p1.nickname : 'Waiting...'}
                </span>
                {p1?.uid === playerUid && (
                  <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-amber-500/20 text-amber-300 font-bold font-mono border border-amber-500/30">
                    YOU
                  </span>
                )}
              </div>
              <div className="text-[10px] text-amber-400/90 font-mono font-bold tracking-wider">
                PLAYER 1
              </div>
            </div>

            {/* P1 Score Digit */}
            <div className="px-2.5 py-1 rounded-xl bg-slate-950/80 border border-amber-500/30 shadow-inner">
              <span className="text-2xl sm:text-3xl font-black font-['Outfit'] text-amber-400 tabular-nums">
                {p1Score}
              </span>
            </div>
          </div>

          {/* Center VS & Round Indicator */}
          <div className="flex flex-col items-center px-2 shrink-0">
            <div className="px-2 py-0.5 rounded-full bg-violet-500/20 border border-violet-400/30 text-[10px] font-black text-violet-300 font-mono tracking-widest uppercase mb-0.5">
              R{room.currentRound}/{room.maxRounds}
            </div>
            <div className="text-xs font-black font-['Outfit'] tracking-widest text-slate-400">
              VS
            </div>
            <div className="text-[9px] text-slate-400 font-medium truncate max-w-[90px] text-center hidden sm:block">
              {game.title}
            </div>
          </div>

          {/* Player 2 (Cyan / Sky Fighter) */}
          <div className="flex items-center justify-end gap-2 sm:gap-3 flex-1 min-w-0 text-right">
            {/* P2 Score Digit */}
            <div className="px-2.5 py-1 rounded-xl bg-slate-950/80 border border-cyan-500/30 shadow-inner">
              <span className="text-2xl sm:text-3xl font-black font-['Outfit'] text-cyan-400 tabular-nums">
                {p2Score}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-end gap-1.5">
                {p2?.uid === playerUid && (
                  <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-cyan-500/20 text-cyan-300 font-bold font-mono border border-cyan-500/30">
                    YOU
                  </span>
                )}
                <span className="text-xs sm:text-sm font-extrabold text-white truncate font-['Outfit']">
                  {p2 ? p2.nickname : 'Waiting...'}
                </span>
              </div>
              <div className="text-[10px] text-cyan-400/90 font-mono font-bold tracking-wider">
                PLAYER 2
              </div>
            </div>

            <div className="relative shrink-0">
              <div
                className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center text-2xl sm:text-3xl border-2 transition-all shadow-md ${
                  p2Score > p1Score
                    ? 'border-cyan-400 bg-cyan-500/25 shadow-cyan-500/30 scale-105'
                    : 'border-cyan-500/40 bg-slate-800/80'
                }`}
              >
                {p2 ? p2.avatarId : '⏳'}
              </div>
              {p2Score > p1Score && (
                <div className="absolute -top-2 -right-1 p-0.5 rounded-full bg-cyan-400 text-slate-950 shadow-md">
                  <Crown className="w-3 h-3 fill-current" />
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
