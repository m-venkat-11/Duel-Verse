import React, { useState } from 'react';
import { QrCode, Share2, Check, Users, Play, Grid, Crown, Smartphone, Bot } from 'lucide-react';
import { getGameMetadata } from '../config/games';
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
}

export const LobbyView: React.FC<LobbyViewProps> = ({
  room,
  playerUid,
  onToggleReady,
  onStartGame,
  onOpenGameSwitcher,
  onOpenQR,
  onOpenTestWindow,
  onAddBotRival
}) => {
  const [copied, setCopied] = useState(false);
  const game = getGameMetadata(room.selectedGameId);

  const players = Object.values(room.players) as PlayerSession[];
  const p1 = players[0]; // Host
  const p2 = players[1]; // Guest

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
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full max-w-xl mx-auto px-4 py-4 flex flex-col items-center">
      {/* Room Invitation Banner */}
      <div className="w-full glass-panel p-5 border border-violet-500/30 mb-5 relative overflow-hidden text-center shadow-xl">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-500/20 text-violet-300 text-xs font-semibold mb-2">
          <Smartphone className="w-3.5 h-3.5" />
          <span>Private Battle Room</span>
        </div>

        <h2 className="text-3xl font-black font-['Outfit'] text-white tracking-wider font-mono">
          {room.roomId}
        </h2>

        <p className="text-xs text-slate-400 mt-1 mb-4">
          Invite a friend to join via link, room code, or QR code
        </p>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            id="btn-copy-link"
            onClick={handleCopyLink}
            className="btn-secondary py-2 px-3 text-xs flex items-center gap-1.5"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Link Copied!</span>
              </>
            ) : (
              <>
                <Share2 className="w-4 h-4 text-violet-400" />
                <span>Copy Shareable Link</span>
              </>
            )}
          </button>

          <button
            id="btn-show-qr"
            onClick={onOpenQR}
            className="btn-secondary py-2 px-3 text-xs flex items-center gap-1.5"
          >
            <QrCode className="w-4 h-4 text-cyan-400" />
            <span>Show QR Code</span>
          </button>

          <button
            id="btn-simulate-player2"
            onClick={onOpenTestWindow}
            className="btn-secondary py-2 px-3 text-xs flex items-center gap-1.5 border-cyan-500/30 bg-cyan-950/30 text-cyan-300 hover:bg-cyan-900/40"
            title="Opens a second browser tab joined as Player 2 for easy local testing"
          >
            <Users className="w-4 h-4 text-cyan-400" />
            <span>Simulate 2nd Player</span>
          </button>

          {onAddBotRival && players.length < 2 && (
            <button
              id="btn-add-bot-rival"
              onClick={onAddBotRival}
              className="btn-secondary py-2 px-3 text-xs flex items-center gap-1.5 border-amber-500/30 bg-amber-950/30 text-amber-300 hover:bg-amber-900/40"
            >
              <Bot className="w-4 h-4 text-amber-400" />
              <span>Add AI Rival</span>
            </button>
          )}
        </div>
      </div>

      {/* 2-Player Ready Slots */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full mb-5">
        {/* Slot 1: Host */}
        <div className="glass-card p-4 border border-amber-500/30 flex items-center gap-3 relative">
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
              <span className="font-bold text-white font-['Outfit'] truncate">
                {p1 ? p1.nickname : 'Waiting...'}
              </span>
              {p1?.uid === playerUid && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-violet-500/30 text-violet-300 font-bold">
                  YOU
                </span>
              )}
            </div>
            <div className="text-xs text-slate-400">Host • Player 1</div>
          </div>

          <div
            className={`px-3 py-1 rounded-full text-xs font-bold font-['Outfit'] ${
              p1?.isReady
                ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/40'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {p1?.isReady ? 'READY' : 'NOT READY'}
          </div>
        </div>

        {/* Slot 2: Guest */}
        <div
          className={`glass-card p-4 border flex items-center gap-3 relative ${
            p2 ? 'border-rose-500/30' : 'border-dashed border-slate-700 bg-slate-900/40'
          }`}
        >
          <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border-2 border-slate-700 flex items-center justify-center text-3xl shrink-0">
            {p2 ? p2.avatarId : '⏳'}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-white font-['Outfit'] truncate">
                {p2 ? p2.nickname : 'Waiting for Challenger...'}
              </span>
              {p2?.uid === playerUid && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-violet-500/30 text-violet-300 font-bold">
                  YOU
                </span>
              )}
            </div>
            <div className="text-xs text-slate-400">
              {p2 ? 'Challenger • Player 2' : 'Scan QR or copy link to join'}
            </div>
          </div>

          {p2 ? (
            <div
              className={`px-3 py-1 rounded-full text-xs font-bold font-['Outfit'] ${
                p2.isReady
                  ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/40'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {p2.isReady ? 'READY' : 'NOT READY'}
            </div>
          ) : (
            <div className="text-[10px] uppercase font-bold text-slate-500 animate-pulse">
              OPEN SLOT
            </div>
          )}
        </div>
      </div>

      {/* Selected Game Showcase Card */}
      <div className="glass-panel p-4 border border-violet-500/30 w-full mb-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-bold shrink-0 border"
            style={{
              backgroundColor: `${game.accentColor}20`,
              borderColor: `${game.accentColor}60`,
              color: game.accentColor
            }}
          >
            {game.id === 'tictactoe'
              ? '❌'
              : game.id === 'rps'
              ? '✊'
              : game.id === 'connectfour'
              ? '🔴'
              : game.id === 'reactionrush'
              ? '⚡'
              : game.id === 'pong'
              ? '🏓'
              : game.id === 'obstaclerush'
              ? '🏃'
              : game.id === 'memorymatch'
              ? '🧠'
              : game.id === 'numberblitz'
              ? '🔢'
              : '🎯'}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-white font-['Outfit'] text-base truncate">
                {game.title}
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-violet-500/20 text-violet-300">
                {game.category}
              </span>
            </div>
            <p className="text-xs text-slate-400 truncate mt-0.5">{game.tagline}</p>
          </div>
        </div>

        <button
          id="btn-change-game"
          onClick={onOpenGameSwitcher}
          className="btn-secondary py-2 px-3 text-xs flex items-center gap-1.5 shrink-0"
        >
          <Grid className="w-3.5 h-3.5 text-violet-400" />
          <span>Change Game</span>
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
          className={`flex-1 py-3.5 px-4 rounded-xl font-bold font-['Outfit'] flex items-center justify-center gap-2 transition text-base ${
            isMyReady
              ? 'bg-emerald-950/80 border-2 border-emerald-400 text-emerald-300 shadow-lg shadow-emerald-500/20'
              : 'bg-slate-800 border-2 border-slate-700 text-white hover:border-slate-500'
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
            className={`flex-1 btn-primary py-3.5 text-base flex items-center justify-center gap-2 ${
              bothReady ? 'animate-pulse' : ''
            }`}
          >
            <Play className="w-5 h-5 fill-current" />
            <span>START DUEL!</span>
          </button>
        ) : (
          <div className="flex-1 py-3.5 px-4 rounded-xl bg-slate-900/60 border border-slate-800 text-center text-xs font-semibold text-slate-400 flex items-center justify-center">
            Waiting for Host to launch duel...
          </div>
        )}
      </div>
    </div>
  );
};
