import React from 'react';
import { Volume2, VolumeX, QrCode, Copy, Check, Users, ExternalLink, LogOut, Swords } from 'lucide-react';
import { soundService } from '../services/sound';
import type { AuthoritativeRoomState } from '../types/room';

interface HeaderProps {
  room: AuthoritativeRoomState | null;
  playerUid: string;
  isMuted: boolean;
  onToggleMute: () => void;
  onShowQR: () => void;
  onOpenTestWindow: () => void;
  onLeaveRoom: () => void;
  onOpenProfile: () => void;
  playerAvatar: string;
  playerNickname: string;
}

export const Header: React.FC<HeaderProps> = ({
  room,
  playerUid,
  isMuted,
  onToggleMute,
  onShowQR,
  onOpenTestWindow,
  onLeaveRoom,
  onOpenProfile,
  playerAvatar,
  playerNickname
}) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopyCode = () => {
    if (!room) return;
    soundService.playClick();
    navigator.clipboard.writeText(room.roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const opponent = room ? Object.values(room.players).find((p) => p.uid !== playerUid) : null;
  const isOpponentConnected = opponent ? opponent.isConnected : false;

  return (
    <header className="safe-top w-full border-b border-white/10 bg-[#0B0F19]/90 backdrop-blur-xl sticky top-0 z-40 px-3 sm:px-6 py-3 shadow-md">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
        {/* Brand Logo */}
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => !room && onOpenProfile()}>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Swords className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-xl tracking-tight text-white font-['Outfit']">
                DUEL<span className="text-[var(--brand-cyan)]">VERSE</span>
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 font-mono font-bold">
                v1.0
              </span>
            </div>
            <p className="text-[11px] text-slate-400 -mt-0.5 font-medium hidden sm:block">
              Instant Mobile 1v1 Arcade
            </p>
          </div>
        </div>

        {/* Room Status Pill (when inside a room) */}
        {room && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyCode}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-violet-500/30 text-white hover:border-violet-400 transition"
              title="Click to copy room code"
            >
              <span className="text-xs text-slate-400 font-mono">ROOM:</span>
              <span className="text-sm font-bold font-mono tracking-wider text-violet-300">
                {room.roomId}
              </span>
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-slate-400" />
              )}
            </button>

            {/* Opponent presence dot */}
            <div
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${
                opponent
                  ? isOpponentConnected
                    ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30'
                    : 'bg-amber-950/40 text-amber-400 border-amber-500/30 animate-pulse'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
              title={
                opponent
                  ? isOpponentConnected
                    ? 'Opponent online'
                    : 'Opponent reconnecting...'
                  : 'Waiting for player'
              }
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  opponent
                    ? isOpponentConnected
                      ? 'bg-emerald-400 animate-ping'
                      : 'bg-amber-400'
                    : 'bg-slate-500'
                }`}
              />
              <span className="hidden md:inline">
                {opponent
                  ? isOpponentConnected
                    ? 'Rival Ready'
                    : 'Reconnecting...'
                  : '1/2 Players'}
              </span>
            </div>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex items-center gap-1.5">
          {/* Quick Dual-Window Simulator Button (for testing) */}
          {room && (
            <button
              onClick={onOpenTestWindow}
              className="p-2 rounded-lg bg-cyan-950/40 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-900/50 transition flex items-center gap-1 text-xs font-semibold"
              title="Open Player 2 in secondary window for local testing"
            >
              <ExternalLink className="w-4 h-4" />
              <span className="hidden lg:inline">Dual Test</span>
            </button>
          )}

          {/* QR Code Button */}
          {room && (
            <button
              onClick={onShowQR}
              className="p-2 rounded-lg bg-slate-800/80 text-slate-200 border border-slate-700 hover:border-slate-500 transition"
              title="Show QR Code for Mobile"
            >
              <QrCode className="w-4 h-4 text-violet-400" />
            </button>
          )}

          {/* Mute Sound Toggle */}
          <button
            onClick={onToggleMute}
            className={`p-2 rounded-lg border transition ${
              isMuted
                ? 'bg-red-950/30 border-red-500/30 text-red-400'
                : 'bg-slate-800/80 border-slate-700 text-slate-200 hover:border-slate-500'
            }`}
            title={isMuted ? 'Unmute Sound' : 'Mute Sound'}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {/* Player Profile Badge */}
          <button
            onClick={onOpenProfile}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 hover:border-violet-500/50 transition"
            title="Edit Profile"
          >
            <span className="text-base leading-none">{playerAvatar}</span>
            <span className="text-xs font-bold text-slate-200 max-w-[80px] truncate hidden sm:inline">
              {playerNickname}
            </span>
          </button>

          {/* Leave Room Button */}
          {room && (
            <button
              onClick={onLeaveRoom}
              className="p-2 rounded-lg bg-red-950/30 border border-red-500/30 text-red-400 hover:bg-red-900/50 transition"
              title="Leave Room"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
