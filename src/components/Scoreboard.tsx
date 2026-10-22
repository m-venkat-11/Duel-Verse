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
    <div className="w-full max-w-2xl mx-auto px-4 mb-4">
      {/* Grace period non-blocking banner if opponent disconnected */}
      {isOpponentDisconnected && (
        <div className="mb-3 px-3.5 py-2 rounded-xl bg-amber-950/60 border border-amber-500/40 text-amber-300 flex items-center justify-between gap-2 text-xs font-semibold animate-pulse shadow-lg">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Opponent reconnecting... (15s grace period active)</span>
          </div>
          <span className="font-mono text-amber-400">PAUSED</span>
        </div>
      )}

      {/* Main Scoreboard Bar */}
      <div className="glass-panel p-3 sm:p-4 border border-[var(--border-subtle)] shadow-xl relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 via-transparent to-rose-500/5 pointer-events-none" />

        <div className="flex items-center justify-between gap-2 relative z-10">
          {/* Player 1 Card */}
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="relative shrink-0">
              <div
                className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-2xl border-2 transition ${
                  p1Score > p2Score
                    ? 'border-amber-400 bg-amber-500/20 shadow-lg shadow-amber-500/20'
                    : 'border-slate-700 bg-slate-800/80'
                }`}
              >
                {p1 ? p1.avatarId : '👤'}
              </div>
              {p1Score > p2Score && (
                <div className="absolute -top-2 -left-1 p-0.5 rounded-full bg-amber-400 text-slate-950 shadow-md">
                  <Crown className="w-3.5 h-3.5" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs sm:text-sm font-bold text-white truncate font-['Outfit']">
                  {p1 ? p1.nickname : 'Waiting...'}
                </span>
                {p1?.uid === playerUid && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-violet-500/30 text-violet-300 font-bold">
                    YOU
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 text-[11px] text-slate-400">
                <span className="font-mono text-amber-400 font-semibold">P1</span>
                <span>•</span>
                <span className="truncate">{p1?.role === 'host' ? 'Host' : 'Challenger'}</span>
              </div>
            </div>
          </div>

          {/* Center Match & Round Indicator */}
          <div className="flex flex-col items-center px-2 shrink-0">
            <div className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-0.5 font-mono">
              ROUND {room.currentRound} / {room.maxRounds}
            </div>
            <div className="flex items-center gap-2 bg-slate-900/90 px-3 py-1 rounded-xl border border-slate-700/80">
              <span className="text-2xl sm:text-3xl font-black font-mono text-amber-400 tabular-nums">
                {p1Score}
              </span>
              <span className="text-slate-500 font-bold text-sm">:</span>
              <span className="text-2xl sm:text-3xl font-black font-mono text-rose-400 tabular-nums">
                {p2Score}
              </span>
            </div>
            <div className="text-[10px] text-slate-500 font-medium mt-0.5">
              Best of {room.maxRounds}
            </div>
          </div>

          {/* Player 2 Card */}
          <div className="flex items-center justify-end gap-2.5 flex-1 min-w-0 text-right">
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-end gap-1.5">
                {p2?.uid === playerUid && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-violet-500/30 text-violet-300 font-bold">
                    YOU
                  </span>
                )}
                <span className="text-xs sm:text-sm font-bold text-white truncate font-['Outfit']">
                  {p2 ? p2.nickname : 'Waiting...'}
                </span>
              </div>
              <div className="flex items-center justify-end gap-1 text-[11px] text-slate-400">
                <span className="truncate">{p2 ? (p2.role === 'host' ? 'Host' : 'Guest') : 'Empty'}</span>
                <span>•</span>
                <span className="font-mono text-rose-400 font-semibold">P2</span>
              </div>
            </div>

            <div className="relative shrink-0">
              <div
                className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-2xl border-2 transition ${
                  p2Score > p1Score
                    ? 'border-rose-400 bg-rose-500/20 shadow-lg shadow-rose-500/20'
                    : 'border-slate-700 bg-slate-800/80'
                }`}
              >
                {p2 ? p2.avatarId : '⏳'}
              </div>
              {p2Score > p1Score && (
                <div className="absolute -top-2 -right-1 p-0.5 rounded-full bg-rose-400 text-slate-950 shadow-md">
                  <Crown className="w-3.5 h-3.5" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
