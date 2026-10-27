import React, { useState } from 'react';
import {
  Users,
  Copy,
  Check,
  Play,
  QrCode,
  Share2,
  Grid,
  Bot,
  Crown,
  Sparkles,
  Smartphone,
  LogOut,
  Swords,
  Trophy,
  Minus,
  Plus,
  Sliders,
  Zap
} from 'lucide-react';
import { getGameMetadata } from '../config/games';
import { GameArtwork } from './artwork/GameArtwork';
import { soundService } from '../services/sound';
import type { AuthoritativeRoomState } from '../types/room';

interface LobbyViewProps {
  room: AuthoritativeRoomState;
  playerUid: string;
  onToggleReady: () => void;
  onStartGame: () => void;
  onOpenQR: () => void;
  onOpenGameSwitcher: () => void;
  onLeaveRoom: () => void;
  onOpenTestWindow?: () => void;
  onAddBotRival?: () => void;
  onUpdateMatchConfig?: (maxRounds: number, difficulty?: string) => void;
  botDifficulty?: 'casual' | 'pro' | 'master';
  onSelectBotDifficulty?: (diff: 'casual' | 'pro' | 'master') => void;
  onNotifyToast?: (type: 'success' | 'info' | 'warning', title: string, msg?: string) => void;
}

export const LobbyView: React.FC<LobbyViewProps> = ({
  room,
  playerUid,
  onToggleReady,
  onStartGame,
  onOpenQR,
  onOpenGameSwitcher,
  onLeaveRoom,
  onOpenTestWindow,
  onAddBotRival,
  onUpdateMatchConfig,
  botDifficulty,
  onSelectBotDifficulty,
  onNotifyToast
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const game = getGameMetadata(room.selectedGameId);
  const isHost = room.hostUid === playerUid;
  const players = Object.values(room.players);
  const p1 = players[0];
  const p2 = players[1];

  const mySession = room.players[playerUid];
  const isMyReady = Boolean(mySession?.isReady);
  const bothReady = players.length >= 2 && players.every((p) => p.isReady && p.isConnected);

  const detectedLanIp = '172.17.188.91:5173';
  const isLocalhost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  const baseOrigin = typeof window !== 'undefined'
    ? isLocalhost
      ? `http://${detectedLanIp}`
      : window.location.origin
    : '';

  const joinUrl = `${baseOrigin}${typeof window !== 'undefined' ? window.location.pathname : ''}?room=${room.roomId}`;

  const handleCopyLink = () => {
    soundService.playClick();
    navigator.clipboard.writeText(joinUrl);
    setCopiedLink(true);
    if (onNotifyToast) {
      onNotifyToast('success', 'Invite Link Copied!', 'Send it to your friend to join.');
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
    <div className="w-full max-w-4xl mx-auto min-h-[calc(100vh-120px)] px-3 sm:px-6 py-4 sm:py-6 flex flex-col justify-between">
      {/* 1. TOP ROOM COMMAND BAR */}
      <div className="w-full glass-panel p-4 sm:p-5 border border-violet-500/30 rounded-3xl mb-6 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Status & Player Count */}
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-mono font-black shadow-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <span>ROOM ACTIVE</span>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/90 border border-slate-700/80 text-xs font-mono font-bold text-slate-300">
              <Users className="w-3.5 h-3.5 text-cyan-400" />
              <span>{players.length} / 2 PLAYERS</span>
            </div>
          </div>

          {/* Centered Large Room Code Pill */}
          <div
            onClick={handleCopyCode}
            className="group cursor-pointer inline-flex items-center gap-3 px-6 py-2.5 rounded-2xl bg-slate-950/90 border-2 border-violet-500/50 hover:border-cyan-400 transition-all duration-200 shadow-xl shadow-violet-500/15 active:scale-95"
            title="Click to copy room code"
          >
            <span className="text-xs uppercase font-mono font-black text-slate-400 tracking-wider">
              CODE:
            </span>
            <span className="text-2xl sm:text-3xl font-black font-mono tracking-widest text-violet-300 group-hover:text-cyan-300 transition-colors">
              {room.roomId}
            </span>
            <div className="p-1.5 rounded-lg bg-slate-800 text-slate-300 group-hover:text-white transition">
              {copiedCode ? <Check className="w-4 h-4 text-emerald-400 stroke-[3]" /> : <Copy className="w-4 h-4" />}
            </div>
          </div>

          {/* Action Sharing Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyLink}
              className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-700 hover:border-violet-400 text-slate-300 hover:text-white transition shadow-md"
              title="Copy Direct Link"
            >
              {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>

            <button
              onClick={onOpenQR}
              className="px-3 py-2 rounded-xl bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/40 text-violet-300 hover:text-white transition shadow-md flex items-center gap-1.5 text-xs font-mono font-bold"
              title="Show QR Code for Phone Scan"
            >
              <QrCode className="w-4 h-4 text-cyan-400" />
              <span className="hidden sm:inline">Phone QR</span>
            </button>

            <button
              onClick={handleNativeShare}
              className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-700 hover:border-cyan-400 text-cyan-300 hover:text-white transition shadow-md"
              title="Share Room"
            >
              <Share2 className="w-4 h-4" />
            </button>

            {onOpenTestWindow && (
              <button
                onClick={onOpenTestWindow}
                className="px-3 py-2 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-900/50 transition text-xs font-mono font-bold flex items-center gap-1.5"
                title="Open secondary window for instant local 2-player testing"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">2P Window</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. CENTER 1v1 VERSUS ARENA CLASH */}
      <div className="w-full relative my-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 items-stretch relative">
          {/* PLAYER 1 CARD (Host) */}
          <div className="glass-card p-5 sm:p-6 rounded-3xl border-2 border-amber-500/40 shadow-2xl relative bg-gradient-to-br from-amber-950/20 via-slate-900/90 to-slate-950 flex flex-col justify-between">
            <div className="flex items-center gap-4">
              {/* Avatar with Crown */}
              <div className="relative shrink-0">
                <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-2xl bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center text-4xl sm:text-5xl shadow-xl shadow-amber-500/20">
                  {p1 ? p1.avatarId : '👤'}
                </div>
                <div className="absolute -top-2.5 -left-1.5 p-1 rounded-full bg-amber-400 text-slate-950 shadow-md">
                  <Crown className="w-4 h-4 fill-current" />
                </div>
              </div>

              {/* Player Details */}
              <div className="min-w-0 flex-1 text-left">
                <div className="flex items-center gap-2">
                  <span className="font-black text-white font-['Outfit'] text-xl sm:text-2xl truncate">
                    {p1 ? p1.nickname : 'Waiting for Host...'}
                  </span>
                  {p1?.uid === playerUid && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold font-mono border border-amber-500/30">
                      YOU
                    </span>
                  )}
                </div>

                <div className="text-xs text-amber-400 font-mono font-bold mt-1 tracking-wider uppercase">
                  PLAYER 1 • HOST DUELIST
                </div>

                <div className="flex items-center gap-2 mt-2 text-xs text-slate-400 font-mono">
                  <span>W: {p1?.stats?.wins || 0}</span>
                  <span>•</span>
                  <span>L: {p1?.stats?.losses || 0}</span>
                </div>
              </div>
            </div>

            {/* Ready Badge Status */}
            <div className="mt-4 pt-3 border-t border-amber-500/20 flex items-center justify-between">
              <span className="text-xs font-mono text-slate-400 font-bold uppercase">Duel Readiness:</span>
              <div
                className={`px-4 py-1.5 rounded-xl text-xs font-black font-['Outfit'] tracking-wider shadow-md ${
                  p1?.isReady
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400 shadow-emerald-500/30 animate-pulse'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}
              >
                {p1?.isReady ? '✓ READY FOR BATTLE' : '⏳ NOT READY'}
              </div>
            </div>
          </div>

          {/* Central Floating VS Emblem */}
          <div className="hidden md:flex absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none">
            <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-amber-500 via-rose-600 to-cyan-400 p-0.5 shadow-[0_0_35px_rgba(244,63,94,0.7)] animate-pulse">
              <div className="w-full h-full rounded-full bg-slate-950 flex items-center justify-center">
                <span className="text-2xl font-black font-['Outfit'] italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-cyan-300">
                  VS
                </span>
              </div>
            </div>
          </div>

          {/* Mobile VS Divider */}
          <div className="flex md:hidden items-center justify-center my-1">
            <div className="px-4 py-1 rounded-full bg-slate-900 border border-slate-700 text-sm font-black font-['Outfit'] text-cyan-300 shadow-md">
              ⚔️ VERSUS ⚔️
            </div>
          </div>

          {/* PLAYER 2 CARD (Rival or Waiting Slot) */}
          <div
            className={`glass-card p-5 sm:p-6 rounded-3xl border-2 shadow-2xl relative flex flex-col justify-between transition-all ${
              p2
                ? 'border-cyan-500/40 bg-gradient-to-br from-cyan-950/20 via-slate-900/90 to-slate-950'
                : 'border-dashed border-slate-700 bg-slate-900/60'
            }`}
          >
            {p2 ? (
              <>
                <div className="flex items-center gap-4">
                  {/* Avatar */}
                  <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-2xl bg-cyan-500/20 border-2 border-cyan-400 flex items-center justify-center text-4xl sm:text-5xl shadow-xl shadow-cyan-500/20 shrink-0">
                    {p2.avatarId}
                  </div>

                  {/* Player Details */}
                  <div className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-white font-['Outfit'] text-xl sm:text-2xl truncate">
                        {p2.nickname}
                      </span>
                      {p2.uid === playerUid && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-bold font-mono border border-cyan-500/30">
                          YOU
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-cyan-400 font-mono font-bold mt-1 tracking-wider uppercase">
                      PLAYER 2 • CHALLENGER
                    </div>

                    <div className="flex items-center gap-2 mt-2 text-xs text-slate-400 font-mono">
                      <span>W: {p2?.stats?.wins || 0}</span>
                      <span>•</span>
                      <span>L: {p2?.stats?.losses || 0}</span>
                    </div>
                  </div>
                </div>

                {/* Ready Badge Status */}
                <div className="mt-4 pt-3 border-t border-cyan-500/20 flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-400 font-bold uppercase">Duel Readiness:</span>
                  <div
                    className={`px-4 py-1.5 rounded-xl text-xs font-black font-['Outfit'] tracking-wider shadow-md ${
                      p2.isReady
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400 shadow-emerald-500/30 animate-pulse'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {p2.isReady ? '✓ READY FOR BATTLE' : '⏳ NOT READY'}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center text-center py-4 my-auto">
                <div className="w-16 h-16 rounded-2xl bg-slate-800/80 border-2 border-dashed border-slate-600 flex items-center justify-center text-3xl mb-3 shadow-inner text-slate-400">
                  ⏳
                </div>

                <h4 className="text-lg font-black font-['Outfit'] text-white">
                  Waiting for Rival Challenger...
                </h4>
                <p className="text-xs text-slate-400 mt-1 mb-5 max-w-xs font-medium">
                  Share your 6-character room code, scan the QR code with a phone, or challenge CyberBot!
                </p>

                <div className="flex flex-wrap items-center justify-center gap-2.5 w-full">
                  {onAddBotRival && (
                    <button
                      onClick={onAddBotRival}
                      className="btn-arcade btn-arcade-cyan py-3 px-5 text-sm font-black flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/25 active:scale-95 transition"
                      title="Add simulated Master CyberBot rival for instant practice"
                    >
                      <Bot className="w-4 h-4" />
                      <span>+ PLAY VS CYBERBOT</span>
                    </button>
                  )}

                  <button
                    onClick={onOpenQR}
                    className="px-4 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white text-xs font-bold font-mono transition flex items-center gap-1.5"
                  >
                    <QrCode className="w-4 h-4 text-cyan-400" />
                    <span>Show QR</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. SELECTED GAME SHOWCASE CAPSULE */}
      <div className="w-full glass-panel p-4 sm:p-5 border border-violet-500/30 rounded-3xl my-6 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0 w-full sm:w-auto">
            {/* 16:9 Artwork Container */}
            <div className="w-28 sm:w-36 aspect-[16/9] rounded-2xl overflow-hidden shrink-0 border border-white/20 shadow-xl">
              <GameArtwork gameId={game.id} size="sm" />
            </div>

            <div className="min-w-0 text-left">
              <div className="flex items-center gap-2">
                <h3 className="font-black text-white font-['Outfit'] text-xl sm:text-2xl truncate">
                  {game.title}
                </h3>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-violet-500/20 text-violet-300 border border-violet-500/30 font-mono">
                  {game.category}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 font-medium mt-1 line-clamp-1">{game.tagline}</p>
              <div className="flex items-center gap-3 mt-1.5 text-[11px] font-mono text-slate-400">
                <span>⏱️ {game.estDurationSec}s Match</span>
                <span>•</span>
                <span className="text-cyan-400">⚡ 60 FPS Physics</span>
              </div>
            </div>
          </div>

          <button
            onClick={onOpenGameSwitcher}
            className="w-full sm:w-auto btn-secondary py-3 px-6 text-sm font-black flex items-center justify-center gap-2 shrink-0 shadow-lg active:scale-95 transition"
          >
            <Grid className="w-4 h-4 text-violet-400" />
            <span>SWITCH GAME</span>
          </button>
        </div>
      </div>

      {/* 3.5. MATCH RULES & POINTS CUSTOMIZATION PANEL */}
      <div className="w-full glass-panel p-4 sm:p-5 border border-cyan-500/30 rounded-3xl mb-6 shadow-2xl relative overflow-hidden bg-slate-900/80">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              <span className="font-black text-white font-['Outfit'] text-base sm:text-lg">
                MATCH RULES & WIN CONDITION
              </span>
            </div>
            <div className="text-xs font-mono font-bold">
              {isHost ? (
                <span className="text-cyan-400">👑 Host can customize rules below</span>
              ) : (
                <span className="text-amber-400">👑 Set by Room Host</span>
              )}
            </div>
          </div>

          {/* Stepper + Presets */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-slate-400 uppercase font-bold">Target Score:</span>
              <div className="flex items-center gap-2">
                {isHost && (
                  <button
                    onClick={() => {
                      soundService.playClick();
                      const next = Math.max(1, (room.maxRounds || 3) - 1);
                      onUpdateMatchConfig?.(next);
                    }}
                    disabled={room.maxRounds <= 1}
                    className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white flex items-center justify-center font-black transition border border-slate-700 active:scale-95"
                    title="Decrease points to win"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                )}
                <div className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-400/50 text-amber-300 font-mono font-black text-sm sm:text-base shadow-inner">
                  FIRST TO {room.maxRounds || 3} {room.maxRounds === 1 ? 'POINT' : 'POINTS'}
                </div>
                {isHost && (
                  <button
                    onClick={() => {
                      soundService.playClick();
                      const next = Math.min(15, (room.maxRounds || 3) + 1);
                      onUpdateMatchConfig?.(next);
                    }}
                    disabled={room.maxRounds >= 15}
                    className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white flex items-center justify-center font-black transition border border-slate-700 active:scale-95"
                    title="Increase points to win"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap items-center gap-2">
              {[1, 3, 5, 7, 10].map((pts) => {
                const isActive = (room.maxRounds || 3) === pts;
                return (
                  <button
                    key={pts}
                    disabled={!isHost}
                    onClick={() => {
                      soundService.playClick();
                      onUpdateMatchConfig?.(pts);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black font-['Outfit'] transition-all ${
                      isActive
                        ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30 scale-105'
                        : isHost
                        ? 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700'
                        : 'bg-slate-900/60 text-slate-500 border border-slate-800 cursor-default'
                    }`}
                  >
                    {pts === 1 ? '⚡ 1 Pt (Sudden Death)' : `${pts} Pts`}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bot Difficulty Selector if Bot is in the room */}
          {(room.players['bot_rival'] || Boolean(p2 && p2.uid.includes('bot'))) && (
            <div className="pt-3 border-t border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-mono font-bold text-slate-300 uppercase">
                  CyberBot AI Skill Level:
                </span>
              </div>
              <div className="flex items-center gap-2">
                {(['casual', 'pro', 'master'] as const).map((diff) => {
                  const isSel = (botDifficulty || 'master') === diff;
                  return (
                    <button
                      key={diff}
                      disabled={!isHost}
                      onClick={() => {
                        soundService.playClick();
                        onSelectBotDifficulty?.(diff);
                        onUpdateMatchConfig?.(room.maxRounds || 3, diff);
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-mono font-black uppercase tracking-wider transition ${
                        isSel
                          ? diff === 'master'
                            ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30 scale-105'
                            : diff === 'pro'
                            ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30 scale-105'
                            : 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/30 scale-105'
                          : isHost
                          ? 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                          : 'bg-slate-900 text-slate-600 border border-slate-800 cursor-default'
                      }`}
                    >
                      {diff === 'casual' ? '🟢 Casual' : diff === 'pro' ? '🟡 Pro' : '🔴 Master'}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. BOTTOM ACTION CONTROL DECK */}
      <div className="w-full flex flex-col gap-3">
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {/* Ready Toggle Button */}
          <button
            onClick={() => {
              soundService.playClick();
              onToggleReady();
            }}
            className={`w-full min-h-[58px] rounded-2xl font-black font-['Outfit'] flex items-center justify-center gap-2.5 text-base sm:text-lg transition-all duration-200 border-2 active:scale-95 shadow-xl ${
              isMyReady
                ? 'bg-emerald-950/90 border-emerald-400 text-emerald-300 shadow-emerald-500/30'
                : 'bg-slate-800/90 border-slate-600 text-white hover:border-violet-400 hover:bg-slate-700/90'
            }`}
          >
            <Check className={`w-5 h-5 stroke-[3] ${isMyReady ? 'text-emerald-400' : 'text-slate-400'}`} />
            <span>{isMyReady ? "YOU'RE READY FOR DUEL!" : 'SET READY'}</span>
          </button>

          {/* Start Game Button (Host Only) */}
          {isHost ? (
            <button
              onClick={() => {
                soundService.playClick();
                onStartGame();
              }}
              className={`w-full btn-arcade btn-arcade-rose min-h-[58px] text-base sm:text-lg flex items-center justify-center gap-2.5 shadow-2xl ${
                bothReady ? 'animate-pulse shadow-rose-500/50' : 'opacity-90'
              }`}
            >
              <Play className="w-5 h-5 fill-current" />
              <span>START DUEL!</span>
            </button>
          ) : (
            <div className="w-full min-h-[58px] rounded-2xl bg-slate-900/80 border border-slate-800 text-center text-xs sm:text-sm font-bold text-slate-400 flex items-center justify-center font-['Outfit'] shadow-inner px-4">
              <span>⏳ Waiting for Host to start match...</span>
            </div>
          )}
        </div>

        {/* Leave Room Option */}
        <div className="flex items-center justify-center pt-1">
          <button
            onClick={onLeaveRoom}
            className="text-xs font-mono font-bold text-slate-400 hover:text-rose-400 transition flex items-center gap-1.5 py-1 px-3 rounded-lg hover:bg-slate-900"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Leave Lobby</span>
          </button>
        </div>
      </div>
    </div>
  );
};
