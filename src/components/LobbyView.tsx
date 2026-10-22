import React, { useState } from 'react';
import { QrCode, Share2, Check, Copy, Users, Play, Grid, Crown, Smartphone, Bot, AlertCircle } from 'lucide-react';
import { getGameMetadata } from '../config/games';
import { GameArtwork } from './artwork/GameArtwork';
import { soundService } from '../services/sound';
import type { AuthoritativeRoomState, PlayerSession } from '../types/room';

interface LobbyViewProps {
  room: AuthoritativeRoomState;
  playerUid: string;
  onToggleReady: () => void;
  onStartGame: () => void;
  onOpenGameSwitcher: () => void;
  onOpenQR: () => void;
  onOpenTestWindow: () => void;
  onAddBotRival?: () => void;
  onNotifyToast?: (type: 'success' | 'info' | 'warning' | 'error', title: string, message?: string) => void;
}

export const LobbyView: React.FC<LobbyViewProps> = ({
  room,
  playerUid,
  onToggleReady,
  onStartGame,
  onOpenGameSwitcher,
  onOpenQR,
  onOpenTestWindow,
  onAddBotRival,
  onNotifyToast
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const game = getGameMetadata(room.selectedGameId);

  const players = Object.values(room.players) as PlayerSession[];
  const p1 = players[0]; // Host
  const p2 = players[1]; // Challenger

  const isHost = room.hostUid === playerUid;
  const myPlayer = room.players[playerUid];
  const isMyReady = myPlayer ? myPlayer.isReady : false;
  const bothReady = players.length >= 2 && players.every((p) => p.isReady);

  const joinUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}?room=${room.roomId}`
    : `https://duelverse.app?room=${room.roomId}`;

  const handleCopyLink = () => {
    soundService.playClick();
    navigator.clipboard.writeText(joinUrl);
    setCopiedLink(true);
    if (onNotifyToast) {
      onNotifyToast('success', 'Invite Link Copied!', 'Send it to your friend to jump right into this room.');
    }
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyCode = () => {
    soundService.playClick();
    navigator.clipboard.writeText(room.roomId);
    setCopiedCode(true);
    if (onNotifyToast) {
      onNotifyToast('success', 'Room Code Copied!', `Code: ${room.roomId}`);
    }
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleNativeShare = async () => {
    soundService.playClick();
    if (navigator.share) {
      try {
        await navigator.share({
          title: `DuelVerse: Join my battle room!`,
          text: `Join my 1v1 room ${room.roomId} on DuelVerse and duel me in ${game.title}!`,
          url: joinUrl
        });
      } catch {
        // User cancelled share
      }
    } else {
      handleCopyLink();
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-4 flex flex-col items-center">
      {/* Prominent Room Invitation Card */}
      <div className="w-full glass-panel p-5 sm:p-6 border border-violet-500/40 mb-5 relative overflow-hidden text-center shadow-2xl">
        <div className="absolute top-0 right-0 w-48 h-48 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-500/20 text-violet-300 text-xs font-bold font-mono mb-2">
          <Smartphone className="w-3.5 h-3.5" />
          <span>ROOM READY • WAITING FOR DUEL</span>
        </div>

        {/* Big Clickable Room Code */}
        <div className="my-2 flex flex-col items-center">
          <div
            onClick={handleCopyCode}
            className="group cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-slate-900/90 border-2 border-violet-500/40 hover:border-violet-400 transition shadow-lg shadow-violet-500/10"
            title="Click to copy room code"
          >
            <span className="text-3xl sm:text-4xl font-black font-mono tracking-widest text-violet-300 group-hover:text-cyan-300 transition-colors">
              {room.roomId}
            </span>
            <div className="p-1.5 rounded-lg bg-slate-800 text-slate-300 group-hover:text-white transition">
              {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </div>
          </div>
          <span className="text-[11px] text-slate-400 mt-1 font-medium">
            Tap code to copy
          </span>
        </div>

        {/* Quick Action Buttons Row */}
        <div className="flex flex-wrap items-center justify-center gap-2 mt-4 pt-4 border-t border-white/5">
          <button
            id="btn-copy-link"
            onClick={handleCopyLink}
            className="btn-secondary py-2.5 px-3.5 text-xs flex items-center gap-1.5"
          >
            {copiedLink ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Link Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-violet-400" />
                <span>Copy Invite Link</span>
              </>
            )}
          </button>

          <button
            id="btn-share-native"
            onClick={handleNativeShare}
            className="btn-secondary py-2.5 px-3.5 text-xs flex items-center gap-1.5 text-cyan-300 border-cyan-500/30 hover:border-cyan-400"
          >
            <Share2 className="w-4 h-4 text-cyan-400" />
            <span>Share Room</span>
          </button>

          <button
            id="btn-show-qr"
            onClick={onOpenQR}
            className="btn-secondary py-2.5 px-3.5 text-xs flex items-center gap-1.5"
          >
            <QrCode className="w-4 h-4 text-purple-400" />
            <span>Show QR</span>
          </button>

          <button
            id="btn-simulate-player2"
            onClick={onOpenTestWindow}
            className="btn-secondary py-2.5 px-3.5 text-xs flex items-center gap-1.5 border-cyan-500/30 bg-cyan-950/30 text-cyan-300 hover:bg-cyan-900/40"
            title="Opens a second browser tab joined as Player 2 for instant local testing"
          >
            <Users className="w-4 h-4 text-cyan-400" />
            <span>Dual Test Window</span>
          </button>

          {onAddBotRival && players.length < 2 && (
            <button
              id="btn-add-bot-rival"
              onClick={onAddBotRival}
              className="btn-secondary py-2.5 px-3.5 text-xs flex items-center gap-1.5 border-amber-500/30 bg-amber-950/30 text-amber-300 hover:bg-amber-900/40"
              title="Add simulated AI opponent for solo practice"
            >
              <Bot className="w-4 h-4 text-amber-400" />
              <span>Practice with AI</span>
            </button>
          )}
        </div>
      </div>

      {/* 2-Player Ready Slots */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full mb-5">
        {/* Slot 1: Host */}
        <div className="glass-card p-4 border border-amber-500/30 rounded-2xl flex items-center gap-3.5 relative shadow-lg">
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border-2 border-amber-400/60 flex items-center justify-center text-3xl shadow-lg shadow-amber-500/20">
              {p1 ? p1.avatarId : '👤'}
            </div>
            <div className="absolute -top-2 -left-1 p-0.5 rounded-full bg-amber-400 text-slate-950 shadow-md">
              <Crown className="w-3.5 h-3.5" />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-white font-['Outfit'] text-base truncate">
                {p1 ? p1.nickname : 'Waiting...'}
              </span>
              {p1?.uid === playerUid && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-violet-500/30 text-violet-300 font-bold font-mono">
                  YOU
                </span>
              )}
            </div>
            <div className="text-xs text-slate-400 font-mono mt-0.5">Host • Player 1</div>
          </div>

          <div
            className={`px-3 py-1 rounded-full text-xs font-extrabold font-['Outfit'] tracking-wide ${
              p1?.isReady
                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-500/20'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {p1?.isReady ? 'READY' : 'NOT READY'}
          </div>
        </div>

        {/* Slot 2: Challenger */}
        <div
          className={`glass-card p-4 rounded-2xl border flex items-center gap-3.5 relative shadow-lg transition-all ${
            p2 ? 'border-rose-500/30' : 'border-dashed border-slate-700 bg-slate-900/40'
          }`}
        >
          <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border-2 border-slate-700 flex items-center justify-center text-3xl shrink-0">
            {p2 ? p2.avatarId : '⏳'}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-white font-['Outfit'] text-base truncate">
                {p2 ? p2.nickname : 'Waiting for Rival...'}
              </span>
              {p2?.uid === playerUid && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-violet-500/30 text-violet-300 font-bold font-mono">
                  YOU
                </span>
              )}
            </div>
            <div className="text-xs text-slate-400 font-mono mt-0.5">
              {p2 ? 'Challenger • Player 2' : 'Scan QR or share link'}
            </div>
          </div>

          {p2 ? (
            <div
              className={`px-3 py-1 rounded-full text-xs font-extrabold font-['Outfit'] tracking-wide ${
                p2.isReady
                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-500/20'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {p2.isReady ? 'READY' : 'NOT READY'}
            </div>
          ) : (
            <div className="text-[10px] uppercase font-bold text-slate-500 animate-pulse font-mono">
              OPEN SLOT
            </div>
          )}
        </div>
      </div>

      {/* Selected Game Showcase with Custom Artwork */}
      <div className="glass-panel p-4 sm:p-5 border border-violet-500/30 rounded-2xl w-full mb-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-4 w-full sm:w-auto">
          {/* Artwork thumbnail */}
          <div className="w-24 h-16 rounded-xl overflow-hidden shrink-0 border border-white/10 shadow-md">
            <GameArtwork gameId={game.id} size="sm" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-black text-white font-['Outfit'] text-lg truncate">
                {game.title}
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-violet-500/20 text-violet-300 border border-violet-500/30 font-mono">
                {game.category}
              </span>
            </div>
            <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">{game.tagline}</p>
          </div>
        </div>

        <button
          id="btn-change-game"
          onClick={onOpenGameSwitcher}
          className="btn-secondary py-2 px-3.5 text-xs flex items-center justify-center gap-1.5 shrink-0 w-full sm:w-auto"
        >
          <Grid className="w-3.5 h-3.5 text-violet-400" />
          <span>Switch Game</span>
        </button>
      </div>

      {/* Primary Action Buttons */}
      <div className="w-full flex flex-col sm:flex-row gap-3">
        {/* Ready Toggle */}
        <button
          id="btn-toggle-ready"
          onClick={() => {
            soundService.playClick();
            onToggleReady();
          }}
          className={`flex-1 py-4 px-4 rounded-xl font-bold font-['Outfit'] flex items-center justify-center gap-2 transition text-base shadow-lg ${
            isMyReady
              ? 'bg-emerald-950/80 border-2 border-emerald-400 text-emerald-300 shadow-emerald-500/20'
              : 'bg-slate-800/90 border-2 border-slate-700 text-white hover:border-slate-500 active:scale-95'
          }`}
        >
          <Check className={`w-5 h-5 ${isMyReady ? 'text-emerald-400' : 'text-slate-500'}`} />
          <span>{isMyReady ? "YOU'RE READY!" : 'CLICK WHEN READY'}</span>
        </button>

        {/* Start Game Button (Host Only) */}
        {isHost ? (
          <button
            id="btn-start-duel"
            onClick={() => {
              soundService.playClick();
              onStartGame();
            }}
            className={`flex-1 btn-primary py-4 text-base flex items-center justify-center gap-2 shadow-lg shadow-violet-500/30 ${
              bothReady ? 'animate-pulse' : ''
            }`}
          >
            <Play className="w-5 h-5 fill-current" />
            <span>START DUEL!</span>
          </button>
        ) : (
          <div className="flex-1 py-4 px-4 rounded-xl bg-slate-900/60 border border-slate-800 text-center text-xs font-semibold text-slate-400 flex items-center justify-center">
            Waiting for Host to launch duel...
          </div>
        )}
      </div>
    </div>
  );
};
