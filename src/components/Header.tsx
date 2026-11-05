import React from 'react';
import { Volume2, VolumeX, QrCode, Copy, Check, ExternalLink, LogOut, Sparkles, ArrowLeft } from 'lucide-react';
import { soundService } from '../services/sound';
import type { AuthoritativeRoomState } from '../types/room';
import { getGameMetadata } from '../config/games';

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

  const isSolo = room ? (
    room.selectedGameId === 'flappyspidey' ||
    room.selectedGameId === 'cyber2048' ||
    room.selectedGameId === 'cybersudoku' ||
    getGameMetadata(room.selectedGameId)?.category === 'solo'
  ) : false;

  const currentGame = room ? getGameMetadata(room.selectedGameId) : null;

  return (
    <header className="safe-top w-full border-b border-white/10 bg-[#0B0F19]/95 backdrop-blur-xl sticky top-0 z-40 px-2.5 sm:px-6 py-2 sm:py-2.5 shadow-md">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-1.5 sm:gap-4">
        
        {/* Left Section: Back Button (if in room) OR Brand Logo (if on Home) */}
        <div className="flex items-center gap-2 shrink-0">
          {room ? (
            <button
              onClick={() => {
                soundService.playClick();
                onLeaveRoom();
              }}
              className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-violet-600/30 hover:bg-violet-600/50 border border-violet-400/50 text-white transition active:scale-95 shadow-md shadow-violet-500/20 shrink-0"
              title={isSolo ? "Back to Arcade Library" : "Exit Match"}
            >
              <ArrowLeft className="w-4 h-4 text-violet-300 stroke-[2.5]" />
              <span className="font-['Outfit'] font-black text-xs sm:text-sm">
                {isSolo ? 'Arcade' : 'Exit'}
              </span>
            </button>
          ) : (
            <div
              className="flex items-center gap-2 cursor-pointer group shrink-0"
              onClick={() => {
                soundService.playClick();
                if (onShowIntro) onShowIntro();
                else onOpenProfile();
              }}
              title="Click to view Arcade Intro"
            >
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl overflow-hidden border border-cyan-400/50 shadow-lg shadow-cyan-500/20 group-hover:scale-105 transition-transform bg-slate-900 shrink-0">
                <img src="/assets/duelverse_logo.jpg" alt="DuelVerse Logo" className="w-full h-full object-cover" />
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <span className="font-extrabold text-base sm:text-xl tracking-tight text-white font-['Outfit'] group-hover:text-cyan-300 transition-colors">
                    DUEL<span className="text-[var(--brand-cyan)]">VERSE</span>
                  </span>
                  <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-violet-500/20 text-violet-300 font-mono font-bold">
                    v2.0
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Center Section: Game Pill (Solo) OR Multiplayer Room Indicator */}
        {room && (
          isSolo ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-900/90 border border-white/10 shrink-0">
              <span className="text-xs">🕹️</span>
              <span className="text-xs sm:text-sm font-black font-['Outfit'] text-white truncate max-w-[120px] sm:max-w-[200px]">
                {currentGame?.title || 'Solo Mode'}
              </span>
              <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-violet-500/20 text-violet-300 hidden sm:inline">
                SOLO
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                onClick={handleCopyCode}
                className="flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-xl bg-slate-800/80 border border-violet-500/40 text-white hover:border-violet-400 transition active:scale-95 shadow-sm"
                title="Click to copy room code"
              >
                <span className="text-[10px] text-slate-400 font-mono hidden md:inline">ROOM:</span>
                <span className="text-xs font-bold font-mono tracking-wider text-violet-300">
                  {room.roomId}
                </span>
                {copied ? (
                  <Check className="w-3 h-3 text-emerald-400 stroke-[3]" />
                ) : (
                  <Copy className="w-3 h-3 text-slate-400" />
                )}
              </button>

              {/* Opponent presence indicator */}
              <div
                className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border ${
                  opponent
                    ? isOpponentConnected
                      ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30'
                      : 'bg-amber-950/40 text-amber-400 border-amber-500/30 animate-pulse'
                    : 'bg-slate-800/80 text-slate-400 border-slate-700'
                }`}
                title={opponent ? (isOpponentConnected ? 'Rival online' : 'Rival reconnecting') : 'Waiting for player'}
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
                <span className="hidden lg:inline font-mono text-[10px]">
                  {opponent ? (isOpponentConnected ? 'Rival Ready' : 'Reconnecting') : '1/2 Players'}
                </span>
              </div>
            </div>
          )
        )}

        {/* Right Section: Controls (Sound, QR for 2P, Profile) */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Dual Window Test Button (Desktop Only) */}
          {room && onOpenTestWindow && !isSolo && (
            <button
              onClick={onOpenTestWindow}
              className="hidden lg:flex p-1.5 sm:p-2 rounded-xl bg-cyan-950/40 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-900/50 transition items-center gap-1.5 text-xs font-mono font-bold active:scale-95"
              title="Open Player 2 in secondary window"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Dual Test</span>
            </button>
          )}

          {/* QR Code Button (Multiplayer Only) */}
          {room && !isSolo && (
            <button
              onClick={onShowQR}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-slate-800/80 text-slate-200 border border-slate-700 hover:border-violet-400 transition flex items-center justify-center active:scale-95 shadow-sm"
              title="Show QR Code"
            >
              <QrCode className="w-4 h-4 text-violet-400" />
            </button>
          )}

          {/* Intro Replay (Desktop only on home) */}
          {!room && onShowIntro && (
            <button
              onClick={onShowIntro}
              className="hidden md:flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800/80 text-amber-300 border border-slate-700 hover:border-amber-400/50 hover:bg-slate-700 transition active:scale-95 shadow-sm"
              title="Replay Title Animation"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs font-mono font-bold">Intro</span>
            </button>
          )}

          {/* Mute Sound Toggle */}
          <button
            onClick={onToggleMute}
            className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl border transition flex items-center justify-center active:scale-95 shadow-sm shrink-0 ${
              isMuted
                ? 'bg-rose-950/40 border-rose-500/40 text-rose-400'
                : 'bg-slate-800/80 border-slate-700 text-slate-200 hover:border-slate-500'
            }`}
            title={isMuted ? 'Unmute Sound' : 'Mute Sound'}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {/* Player Profile Badge */}
          <button
            onClick={onOpenProfile}
            className="flex items-center gap-1.5 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-xl bg-slate-800/80 border border-slate-700 hover:border-violet-500/60 transition active:scale-95 shadow-sm shrink-0"
            title="Edit Duelist Profile"
          >
            <span className="text-base sm:text-lg leading-none">{playerAvatar}</span>
            <span className="text-xs font-bold text-slate-200 max-w-[80px] sm:max-w-[120px] truncate hidden sm:inline font-['Outfit']">
              {playerNickname}
            </span>
          </button>
        </div>

      </div>
    </header>
  );
};
