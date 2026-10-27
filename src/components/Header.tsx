import React from 'react';
import { Volume2, VolumeX, QrCode, Copy, Check, Users, ExternalLink, LogOut, Swords, Sparkles } from 'lucide-react';
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
  onShowIntro?: () => void;
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
  onShowIntro,
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
    <header className="safe-top w-full border-b border-white/10 bg-[#0B0F19]/90 backdrop-blur-xl sticky top-0 z-40 px-3 sm:px-6 py-2.5 sm:py-3 shadow-md">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
        {/* Brand Logo */}
        <div
          className="flex items-center gap-2 cursor-pointer group shrink-0"
          onClick={() => {
            soundService.playClick();
            if (onShowIntro) onShowIntro();
            else if (!room) onOpenProfile();
          }}
          title="Click to view Arcade Intro"
        >
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl overflow-hidden border border-cyan-400/50 shadow-lg shadow-cyan-500/20 group-hover:scale-105 transition-transform bg-slate-900">
            <img src="/assets/duelverse_logo.jpg" alt="DuelVerse Logo" className="w-full h-full object-cover" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-lg sm:text-xl tracking-tight text-white font-['Outfit'] group-hover:text-cyan-300 transition-colors">
                DUEL<span className="text-[var(--brand-cyan)]">VERSE</span>
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 font-mono font-bold">
                v2.0
              </span>
            </div>
            <p className="text-[10px] sm:text-[11px] text-slate-400 -mt-0.5 font-medium hidden sm:block">
              Instant Mobile 1v1 Arcade
            </p>
          </div>
        </div>

        {/* Room Status Pill (when inside a room) */}
        {room && (
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={handleCopyCode}
              className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-800/80 border border-violet-500/40 text-white hover:border-violet-400 transition active:scale-95 shadow-sm"
              title="Click to copy room code"
            >
              <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">ROOM:</span>
              <span className="text-xs sm:text-sm font-bold font-mono tracking-wider text-violet-300">
                {room.roomId}
              </span>
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-slate-400" />
              )}
            </button>

            {/* Opponent presence indicator */}
            <div
              className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-full text-xs font-medium border ${
                opponent
                  ? isOpponentConnected
                    ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30'
                    : 'bg-amber-950/40 text-amber-400 border-amber-500/30 animate-pulse'
                  : 'bg-slate-800/80 text-slate-400 border-slate-700'
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
              <span className="hidden md:inline font-mono text-[11px]">
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
        <div className="flex items-center gap-1 sm:gap-1.5">
          {/* Quick Dual-Window Simulator Button (hidden on phone screens) */}
          {room && onOpenTestWindow && (
            <button
              onClick={onOpenTestWindow}
              className="hidden md:flex p-2 rounded-xl bg-cyan-950/40 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-900/50 transition items-center gap-1.5 text-xs font-mono font-bold active:scale-95"
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
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-800/80 text-slate-200 border border-slate-700 hover:border-violet-400 transition flex items-center justify-center active:scale-95 shadow-sm"
              title="Show QR Code for Mobile"
            >
              <QrCode className="w-4 h-4 sm:w-5 sm:h-5 text-violet-400" />
            </button>
          )}

          {/* Intro Title Animation Replay Button (desktop/tablet) */}
          {onShowIntro && (
            <button
              onClick={onShowIntro}
              className="hidden sm:flex items-center gap-1 px-2.5 py-2 rounded-xl bg-slate-800/80 text-amber-300 border border-slate-700 hover:border-amber-400/50 hover:bg-slate-700 transition active:scale-95 shadow-sm"
              title="Watch Intro Title Animation"
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-mono font-bold hidden xl:inline">Intro</span>
            </button>
          )}

          {/* Mute Sound Toggle */}
          <button
            onClick={onToggleMute}
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl border transition flex items-center justify-center active:scale-95 shadow-sm ${
              isMuted
                ? 'bg-rose-950/40 border-rose-500/40 text-rose-400'
                : 'bg-slate-800/80 border-slate-700 text-slate-200 hover:border-slate-500'
            }`}
            title={isMuted ? 'Unmute Sound' : 'Mute Sound'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 sm:w-5 sm:h-5" /> : <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />}
          </button>

          {/* Player Profile Badge */}
          <button
            onClick={onOpenProfile}
            className="flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-slate-800/80 border border-slate-700 hover:border-violet-500/60 transition active:scale-95 shadow-sm min-h-[36px]"
            title="Edit Duelist Profile"
          >
            <span className="text-lg sm:text-xl leading-none">{playerAvatar}</span>
            <span className="text-xs font-black text-slate-200 max-w-[120px] truncate hidden sm:inline font-['Outfit']">
              {playerNickname}
            </span>
          </button>

          {/* Leave Room Button */}
          {room && (
            <button
              onClick={onLeaveRoom}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-rose-950/30 border border-rose-500/40 text-rose-400 hover:bg-rose-900/50 transition flex items-center justify-center active:scale-95 shadow-sm"
              title="Leave Room"
            >
              <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
