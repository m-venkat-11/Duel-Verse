import React from 'react';
import { Crown, AlertTriangle, Wifi, WifiOff } from 'lucide-react';
import type { AuthoritativeRoomState, PlayerSession } from '../types/room';

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
  const isOpponentDisconnected = opponent && !opponent.isConnected;

  return (
    <div className="w-full max-w-xl mx-auto px-2 sm:px-4 mb-3 shrink-0">
      {/* Grace period banner if disconnected */}
      {isOpponentDisconnected && (
        <div className="mb-2 px-3 py-1.5 rounded-xl bg-amber-950/80 border border-amber-500/50 text-amber-300 flex items-center justify-between gap-2 text-xs font-semibold animate-pulse shadow-lg">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Opponent reconnecting (15s grace period)...</span>
          </div>
          <span className="font-mono text-amber-400 text-[11px]">PAUSED</span>
        </div>
      )}

      {/* Compact Scoreboard Bar */}
      <div className="glass-panel py-2 px-3 sm:px-4 border border-white/10 shadow-lg relative overflow-hidden rounded-xl">
        <div className="flex items-center justify-between gap-2 relative z-10">
          {/* Player 1 Card (Left) */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="relative shrink-0">
              <div
                className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-xl sm:text-2xl border-2 transition ${
                  p1Score > p2Score
                    ? 'border-amber-400 bg-amber-500/20 shadow-md shadow-amber-500/20'
                    : 'border-slate-700 bg-slate-800/80'
                }`}
              >
                {p1 ? p1.avatarId : '👤'}
              </div>
              {p1Score > p2Score && (
                <div className="absolute -top-1.5 -left-1 p-0.5 rounded-full bg-amber-400 text-slate-950 shadow">
                  <Crown className="w-2.5 h-2.5" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <span className="text-xs sm:text-sm font-bold text-white truncate font-['Outfit']">
                  {p1 ? p1.nickname : 'Waiting...'}
                </span>
                {p1?.uid === playerUid && (
                  <span className="text-[9px] px-1 py-0.2 rounded bg-violet-500/30 text-violet-300 font-bold font-mono">
                    YOU
                  </span>
                )}
              </div>
              <div className="text-[10px] text-amber-400 font-mono font-bold leading-none">
                P1 (Host)
              </div>
            </div>
          </div>

          {/* Center Scores & Round Pill */}
          <div className="flex flex-col items-center px-2 shrink-0">
            <div className="text-[9px] uppercase font-bold tracking-wider text-slate-400 font-mono mb-0.5">
              R{room.currentRound}/{room.maxRounds}
            </div>
            <div className="flex items-center gap-2 bg-slate-900/95 px-3 py-0.5 rounded-lg border border-slate-700">
              <span className="text-xl sm:text-2xl font-black font-mono text-amber-400 tabular-nums">
                {p1Score}
              </span>
              <span className="text-slate-500 font-bold text-xs">:</span>
              <span className="text-xl sm:text-2xl font-black font-mono text-rose-400 tabular-nums">
                {p2Score}
              </span>
            </div>
          </div>

          {/* Player 2 Card (Right) */}
          <div className="flex items-center justify-end gap-2 flex-1 min-w-0 text-right">
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-end gap-1">
                {p2?.uid === playerUid && (
                  <span className="text-[9px] px-1 py-0.2 rounded bg-violet-500/30 text-violet-300 font-bold font-mono">
                    YOU
                  </span>
                )}
                <span className="text-xs sm:text-sm font-bold text-white truncate font-['Outfit']">
                  {p2 ? p2.nickname : 'Waiting...'}
                </span>
              </div>
              <div className="text-[10px] text-rose-400 font-mono font-bold leading-none">
                P2 (Rival)
              </div>
            </div>

            <div className="relative shrink-0">
              <div
                className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-xl sm:text-2xl border-2 transition ${
                  p2Score > p1Score
                    ? 'border-rose-400 bg-rose-500/20 shadow-md shadow-rose-500/20'
                    : 'border-slate-700 bg-slate-800/80'
                }`}
              >
                {p2 ? p2.avatarId : '⏳'}
              </div>
              {p2Score > p1Score && (
                <div className="absolute -top-1.5 -right-1 p-0.5 rounded-full bg-rose-400 text-slate-950 shadow">
                  <Crown className="w-2.5 h-2.5" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
