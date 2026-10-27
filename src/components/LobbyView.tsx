import React, { useState } from 'react';
import { QrCode, Share2, Check, Copy, Users, Play, Grid, Crown, Smartphone, Bot, Sparkles, Swords, Zap } from 'lucide-react';
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

  const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const baseOrigin = isLocalhost ? 'http://172.17.188.91:5173' : (typeof window !== 'undefined' ? window.location.origin : 'https://duelverse.app');
  const joinUrl = `${baseOrigin}${typeof window !== 'undefined' ? window.location.pathname : ''}?room=${room.roomId}`;

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
          title: `DuelVerse: 1v1 Battle Room`,
          text: `Join my room ${room.roomId} on DuelVerse and duel me in ${game.title}!`,
          url: joinUrl
        });
      } catch {
        // User cancelled
      }
    } else {
      handleCopyLink();
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-3 sm:px-4 py-2 sm:py-4 flex flex-col items-center">
      {/* Top Room Banner */}
      <div className="w-full glass-panel p-4 sm:p-5 border border-violet-500/30 mb-4 text-center relative overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between mb-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-500/20 text-violet-300 text-xs font-black font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>ROOM ACTIVE</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyLink}
              className="p-2 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-300 hover:text-white hover:border-violet-400 transition"
              title="Copy Direct Link"
            >
              {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
            <button
              onClick={onOpenQR}
              className="p-2 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-300 hover:text-white hover:border-violet-400 transition"
              title="Show QR Code"
            >
              <QrCode className="w-4 h-4 text-cyan-400" />
            </button>
            <button
              onClick={handleNativeShare}
              className="p-2 rounded-xl bg-slate-800/80 border border-slate-700 text-cyan-300 hover:text-white hover:border-cyan-400 transition"
              title="Share Room"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button
              onClick={onOpenTestWindow}
              className="px-2.5 py-1.5 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-900/50 transition text-xs font-bold font-mono flex items-center gap-1"
              title="Open Player 2 in secondary window"
            >
              <Users className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">2P Test</span>
            </button>
          </div>
        </div>

        {/* Big Clickable Room Code */}
        <div className="flex flex-col items-center my-1">
          <div
            onClick={handleCopyCode}
            className="group cursor-pointer inline-flex items-center gap-3 px-5 py-2.5 rounded-2xl bg-slate-900/90 border-2 border-violet-500/40 hover:border-violet-400 transition shadow-lg shadow-violet-500/10 active:scale-95"
          >
            <span className="text-3xl sm:text-4xl font-black font-mono tracking-widest text-violet-300 group-hover:text-cyan-300 transition-colors">
              {room.roomId}
            </span>
            <div className="p-1 rounded-lg bg-slate-800 text-slate-300 group-hover:text-white">
              {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </div>
          </div>
          <span className="text-[11px] text-slate-400 mt-1 font-medium">
            Tap room code to copy or share
          </span>
        </div>
      </div>

      {/* 1v1 VERSUS ARENA CLASH */}
      <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4 relative">
        {/* Player 1 Card (Host / Amber) */}
        <div className="glass-card p-4 rounded-2xl border-2 border-amber-500/40 flex items-center justify-between gap-3 shadow-lg relative bg-gradient-to-br from-amber-950/20 via-slate-900/90 to-slate-950">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative shrink-0">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center text-3xl shadow-lg shadow-amber-500/20">
                {p1 ? p1.avatarId : '👤'}
              </div>
              <div className="absolute -top-2 -left-1 p-0.5 rounded-full bg-amber-400 text-slate-950 shadow-md">
                <Crown className="w-3.5 h-3.5 fill-current" />
              </div>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-black text-white font-['Outfit'] text-base truncate">
                  {p1 ? p1.nickname : 'Waiting...'}
                </span>
                {p1?.uid === playerUid && (
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold font-mono border border-amber-500/30">
                    YOU
                  </span>
                )}
              </div>
              <div className="text-xs text-amber-400 font-mono font-bold mt-0.5">PLAYER 1 • HOST</div>
            </div>
          </div>

          <div
            className={`px-3 py-1 rounded-xl text-xs font-black font-['Outfit'] tracking-wider shrink-0 ${
              p1?.isReady
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400 shadow-sm shadow-emerald-500/30'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            {p1?.isReady ? 'READY' : 'WAITING'}
          </div>
        </div>

        {/* Player 2 Card (Rival / Cyan) */}
        <div
          className={`glass-card p-4 rounded-2xl border-2 flex items-center justify-between gap-3 shadow-lg relative transition-all ${
            p2
              ? 'border-cyan-500/40 bg-gradient-to-br from-cyan-950/20 via-slate-900/90 to-slate-950'
              : 'border-dashed border-slate-700 bg-slate-900/50'
          }`}
        >
          {p2 ? (
            <>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-14 h-14 rounded-2xl bg-cyan-500/20 border-2 border-cyan-400 flex items-center justify-center text-3xl shadow-lg shadow-cyan-500/20 shrink-0">
                  {p2.avatarId}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-black text-white font-['Outfit'] text-base truncate">
                      {p2.nickname}
                    </span>
                    {p2.uid === playerUid && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-bold font-mono border border-cyan-500/30">
                        YOU
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-cyan-400 font-mono font-bold mt-0.5">PLAYER 2 • RIVAL</div>
                </div>
              </div>

              <div
                className={`px-3 py-1 rounded-xl text-xs font-black font-['Outfit'] tracking-wider shrink-0 ${
                  p2.isReady
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400 shadow-sm shadow-emerald-500/30'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}
              >
                {p2.isReady ? 'READY' : 'WAITING'}
              </div>
            </>
          ) : (
            <div className="w-full flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border-2 border-dashed border-slate-600 flex items-center justify-center text-2xl text-slate-500">
                  ⏳
                </div>
                <div>
                  <div className="font-extrabold text-slate-300 font-['Outfit'] text-sm">
                    Waiting for Rival...
                  </div>
                  <div className="text-[11px] text-slate-400">Share code or invite link</div>
                </div>
              </div>

              {onAddBotRival && (
                <button
                  onClick={onAddBotRival}
                  className="btn-arcade btn-arcade-cyan py-2 px-3 text-xs flex items-center gap-1.5 shrink-0"
                  title="Add simulated AI player for single player practice"
                >
                  <Bot className="w-4 h-4" />
                  <span>+ AI Bot</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Selected Game Showcase with Custom Artwork */}
      <div className="glass-panel p-3 sm:p-4 border border-violet-500/30 rounded-2xl w-full mb-4 flex items-center justify-between gap-3 shadow-xl">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-20 h-14 rounded-xl overflow-hidden shrink-0 border border-white/10 shadow-md">
            <GameArtwork gameId={game.id} size="sm" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-black text-white font-['Outfit'] text-base sm:text-lg truncate">
                {game.title}
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-violet-500/20 text-violet-300 border border-violet-500/30 font-mono hidden sm:inline">
                {game.category}
              </span>
            </div>
            <p className="text-xs text-slate-400 line-clamp-1">{game.tagline}</p>
          </div>
        </div>

        <button
          onClick={onOpenGameSwitcher}
          className="btn-secondary py-2 px-3 text-xs flex items-center justify-center gap-1.5 shrink-0"
        >
          <Grid className="w-3.5 h-3.5 text-violet-400" />
          <span>Change</span>
        </button>
      </div>

      {/* Primary Action Buttons */}
      <div className="w-full flex flex-col sm:flex-row gap-3">
        {/* Ready Toggle Button */}
        <button
          onClick={() => {
            soundService.playClick();
            onToggleReady();
          }}
          className={`flex-1 min-h-[52px] rounded-2xl font-black font-['Outfit'] flex items-center justify-center gap-2 text-base transition-all duration-150 border-2 active:scale-95 shadow-xl ${
            isMyReady
              ? 'bg-emerald-950/90 border-emerald-400 text-emerald-300 shadow-emerald-500/20'
              : 'bg-slate-800/90 border-slate-600 text-white hover:border-violet-400'
          }`}
        >
          <Check className={`w-5 h-5 stroke-[3] ${isMyReady ? 'text-emerald-400' : 'text-slate-500'}`} />
          <span>{isMyReady ? "YOU'RE READY!" : 'SET READY'}</span>
        </button>

        {/* Start Game Button (Host Only) */}
        {isHost ? (
          <button
            onClick={() => {
              soundService.playClick();
              onStartGame();
            }}
            className={`flex-1 btn-arcade btn-arcade-rose min-h-[52px] text-base flex items-center justify-center gap-2 ${
              bothReady ? 'animate-pulse' : ''
            }`}
          >
            <Play className="w-5 h-5 fill-current" />
            <span>START DUEL!</span>
          </button>
        ) : (
          <div className="flex-1 min-h-[52px] rounded-2xl bg-slate-900/70 border border-slate-800 text-center text-xs font-bold text-slate-400 flex items-center justify-center font-['Outfit']">
            Waiting for Host to start match...
          </div>
        )}
      </div>
    </div>
  );
};
