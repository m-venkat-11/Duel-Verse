import React, { useState } from 'react';
import { Volume2, VolumeX, Flag, Bot, Sparkles, Zap, Shield, Trophy, Flame } from 'lucide-react';
import type { AuthoritativeRoomState } from '../types/room';
import type { BotDifficulty } from '../engine/cyberBotAi';
import { getCyberBotSpeech } from '../engine/cyberBotAi';
import { getGameMetadata } from '../config/games';
import { soundService } from '../services/sound';

interface ArenaStageProps {
  room: AuthoritativeRoomState;
  playerUid: string;
  botDifficulty: BotDifficulty;
  onSetBotDifficulty: (diff: BotDifficulty) => void;
  onLeaveRoom: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  children: React.ReactNode;
}

export const ArenaStage: React.FC<ArenaStageProps> = ({
  room,
  playerUid,
  botDifficulty,
  onSetBotDifficulty,
  onLeaveRoom,
  isMuted,
  onToggleMute,
  children
}) => {
  const players = Object.values(room.players);
  const p1 = players[0];
  const p2 = players[1];

  const isBotPlaying = Boolean(room.players['bot_rival'] || p2?.uid === 'bot_rival');
  const game = getGameMetadata(room.selectedGameId);

  const p1Score = p1 ? room.scores[p1.uid] || 0 : 0;
  const p2Score = p2 ? room.scores[p2.uid] || 0 : 0;

  // Bot speech commentary
  const botSpeech = getCyberBotSpeech(
    room.selectedGameId,
    p2Score > p1Score ? 'win_round' : p1Score > p2Score ? 'lose_round' : 'turn',
    p2Score > p1Score
  );

  const [activeTaunt, setActiveTaunt] = useState<string | null>(null);

  const handleSendEmote = (emoji: string) => {
    soundService.playClick();
    setActiveTaunt(emoji);
    setTimeout(() => setActiveTaunt(null), 2000);
  };

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col items-center px-2 sm:px-4 lg:px-6">
      {/* ======================================================== */}
      {/* 1. TOP ARCADE MATCH HEADER                               */}
      {/* ======================================================== */}
      <div className="w-full mb-3 rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border border-white/10 p-2 sm:p-3 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          
          {/* Player 1 Quick Pill */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <div className="relative shrink-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center text-xl sm:text-2xl shadow-lg shadow-amber-500/20">
                {p1?.avatarId || '👤'}
              </div>
              {p1Score > p2Score && (
                <div className="absolute -top-1.5 -left-1 p-0.5 rounded-full bg-amber-400 text-slate-950 shadow-md">
                  <Trophy className="w-3 h-3 fill-current" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs sm:text-sm font-black text-white truncate font-['Outfit']">
                  {p1?.nickname || 'Player 1'}
                </span>
                {p1?.uid === playerUid && (
                  <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-amber-500/20 text-amber-300 font-bold font-mono border border-amber-500/30">
                    YOU
                  </span>
                )}
              </div>
              <div className="text-[10px] text-amber-400/80 font-mono font-bold tracking-wider">
                {p1Score > p2Score ? 'LEADING (+1)' : p1Score === p2Score ? 'TIED' : 'TRAILING'}
              </div>
            </div>
            <div className="px-3 py-1 rounded-xl bg-slate-950 border border-amber-500/40 text-2xl sm:text-3xl font-black font-['Outfit'] text-amber-400 tabular-nums shadow-inner">
              {p1Score}
            </div>
          </div>

          {/* Match Stage & Round Info */}
          <div className="flex flex-col items-center px-2 shrink-0">
            <div className="px-2.5 py-0.5 rounded-full bg-violet-500/25 border border-violet-400/40 text-[10px] font-black text-violet-300 font-mono tracking-widest uppercase mb-0.5 flex items-center gap-1">
              <Zap className="w-2.5 h-2.5 text-violet-400 animate-pulse" />
              <span>ROUND {room.currentRound} / {room.maxRounds}</span>
            </div>
            <span className="text-xs sm:text-sm font-black text-slate-400 font-['Outfit'] tracking-wider">
              {game.title}
            </span>
          </div>

          {/* Player 2 / CyberBot Quick Pill */}
          <div className="flex items-center justify-end gap-2 sm:gap-3 min-w-0 flex-1 text-right">
            <div className="px-3 py-1 rounded-xl bg-slate-950 border border-cyan-500/40 text-2xl sm:text-3xl font-black font-['Outfit'] text-cyan-400 tabular-nums shadow-inner">
              {p2Score}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-end gap-1.5">
                {p2?.uid === playerUid && (
                  <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-cyan-500/20 text-cyan-300 font-bold font-mono border border-cyan-500/30">
                    YOU
                  </span>
                )}
                <span className="text-xs sm:text-sm font-black text-white truncate font-['Outfit']">
                  {p2?.nickname || 'CyberBot AI'}
                </span>
              </div>
              <div className="text-[10px] text-cyan-400/80 font-mono font-bold tracking-wider">
                {isBotPlaying ? `AI • ${botDifficulty.toUpperCase()}` : 'RIVAL'}
              </div>
            </div>
            <div className="relative shrink-0">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-cyan-500/20 border-2 border-cyan-400 flex items-center justify-center text-xl sm:text-2xl shadow-lg shadow-cyan-500/20">
                {p2?.avatarId || '🤖'}
              </div>
              {p2Score > p1Score && (
                <div className="absolute -top-1.5 -right-1 p-0.5 rounded-full bg-cyan-400 text-slate-950 shadow-md">
                  <Trophy className="w-3 h-3 fill-current" />
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. MAIN COMBAT STAGE (3-Column Desktop / Full-Width Mobile) */}
      {/* ======================================================== */}
      <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        
        {/* LEFT FLANK: Player Command Station (Hidden on small screens) */}
        <div className="hidden lg:flex lg:col-span-3 flex-col gap-3 shrink-0">
          {/* Player Battle Card */}
          <div className="rounded-3xl bg-slate-950/80 border border-white/10 p-4 shadow-xl backdrop-blur-md">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center text-3xl shadow-lg shadow-amber-500/20">
                {p1?.avatarId || '👤'}
              </div>
              <div>
                <div className="text-base font-black text-white font-['Outfit'] truncate">
                  {p1?.nickname || 'Fighter 1'}
                </div>
                <div className="text-xs text-amber-400 font-mono font-bold flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 fill-current" />
                  <span>STREAK: 3 WINS</span>
                </div>
              </div>
            </div>

            {/* Live Stats */}
            <div className="grid grid-cols-2 gap-2 text-center text-xs font-mono mb-3">
              <div className="p-2 rounded-xl bg-slate-900 border border-white/5">
                <div className="text-slate-400 text-[10px]">CURRENT LEAD</div>
                <div className="text-amber-400 font-black text-sm">
                  {p1Score >= p2Score ? `+${p1Score - p2Score}` : `-${p2Score - p1Score}`}
                </div>
              </div>
              <div className="p-2 rounded-xl bg-slate-900 border border-white/5">
                <div className="text-slate-400 text-[10px]">WIN RATE</div>
                <div className="text-emerald-400 font-black text-sm">74%</div>
              </div>
            </div>

            {/* Quick Emote Reactions */}
            <div className="pt-2 border-t border-white/10">
              <div className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">
                Send Reaction
              </div>
              <div className="flex items-center justify-between gap-1">
                {['🔥', '😎', '⚡', '👏', '💥'].map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleSendEmote(emoji)}
                    className="w-9 h-9 rounded-xl bg-slate-900 hover:bg-slate-800 border border-white/10 flex items-center justify-center text-lg hover:scale-110 active:scale-95 transition shadow"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              {activeTaunt && (
                <div className="mt-2 text-center py-1 rounded-lg bg-amber-500/20 text-amber-300 text-xs font-bold animate-bounce">
                  Reaction sent: {activeTaunt}
                </div>
              )}
            </div>
          </div>

          {/* Quick Match Controls */}
          <div className="rounded-3xl bg-slate-950/80 border border-white/10 p-3 shadow-xl backdrop-blur-md flex items-center justify-between">
            <button
              onClick={onToggleMute}
              className={`p-2.5 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition ${
                isMuted
                  ? 'bg-rose-500/20 border-rose-500/50 text-rose-300'
                  : 'bg-slate-900 border-white/10 text-slate-300 hover:text-white'
              }`}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              <span>{isMuted ? 'Muted' : 'Sound ON'}</span>
            </button>

            <button
              onClick={onLeaveRoom}
              className="p-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center gap-1.5 transition active:scale-95"
            >
              <Flag className="w-4 h-4" />
              <span>Surrender</span>
            </button>
          </div>
        </div>

        {/* CENTER COLUMN: The Active Game Stage (Expanded & Tactile) */}
        <div className="lg:col-span-6 w-full flex flex-col items-center justify-center min-h-[480px]">
          <div className="w-full flex flex-col items-center">
            {children}
          </div>

          {/* MOBILE COMBAT COMMAND DECK (<lg only) */}
          <div className="flex lg:hidden w-full max-w-xl flex-col gap-3 mt-5 px-1">
            {/* Emote Reaction Bar */}
            <div className="p-3 rounded-2xl bg-slate-950/80 border border-white/10 flex items-center justify-between gap-1 shadow-lg backdrop-blur-md">
              <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider pl-1">
                React:
              </span>
              <div className="flex items-center gap-1.5">
                {['🔥', '😎', '⚡', '👏', '💥'].map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleSendEmote(emoji)}
                    className="w-10 h-10 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-center text-xl hover:scale-110 active:scale-95 transition shadow-sm"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
            {activeTaunt && (
              <div className="text-center py-1.5 rounded-xl bg-amber-500/20 text-amber-300 text-xs font-bold animate-bounce border border-amber-500/30">
                Reaction Sent: {activeTaunt}
              </div>
            )}

            {/* CyberBot Speech & Difficulty Bar (if playing vs Bot) */}
            {isBotPlaying && (
              <div className="p-3 rounded-2xl bg-slate-950/80 border border-cyan-500/30 shadow-lg backdrop-blur-md">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-mono font-bold text-cyan-400 flex items-center gap-1">
                    <Bot className="w-3.5 h-3.5" />
                    <span>CYBERBOT v2.4</span>
                  </span>
                  <div className="flex gap-1">
                    {(['casual', 'pro', 'master'] as BotDifficulty[]).map((diff) => (
                      <button
                        key={diff}
                        onClick={() => onSetBotDifficulty(diff)}
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold uppercase transition ${
                          botDifficulty === diff
                            ? 'bg-cyan-500 text-slate-950 font-black shadow-sm'
                            : 'bg-slate-900 text-slate-400 border border-white/5'
                        }`}
                      >
                        {diff}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-slate-300 italic">"{botSpeech.text}"</p>
              </div>
            )}

            {/* Mobile Surrender & Sound Actions */}
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={onToggleMute}
                className={`flex-1 py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold font-mono transition ${
                  isMuted
                    ? 'bg-rose-500/20 border-rose-500/50 text-rose-300'
                    : 'bg-slate-900 border-white/10 text-slate-300'
                }`}
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                <span>{isMuted ? 'Muted' : 'Sound ON'}</span>
              </button>

              <button
                onClick={onLeaveRoom}
                className="flex-1 py-2.5 px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 text-xs font-bold font-mono flex items-center justify-center gap-2 transition active:scale-95"
              >
                <Flag className="w-4 h-4" />
                <span>Surrender</span>
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT FLANK: CyberBot AI Core / Opponent Station (Hidden on small screens) */}
        <div className="hidden lg:flex lg:col-span-3 flex-col gap-3 shrink-0">
          <div className="rounded-3xl bg-slate-950/80 border border-cyan-500/20 p-4 shadow-xl backdrop-blur-md relative overflow-hidden">
            {/* Ambient cyber glow */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />

            <div className="flex items-center gap-3 mb-3">
              <div className="relative">
                <div className="w-14 h-14 rounded-2xl bg-cyan-500/20 border-2 border-cyan-400 flex items-center justify-center text-3xl shadow-lg shadow-cyan-500/30">
                  {p2?.avatarId || '🤖'}
                </div>
                <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-400 border-2 border-slate-950 animate-ping" />
                <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-400 border-2 border-slate-950" />
              </div>
              <div>
                <div className="text-base font-black text-white font-['Outfit'] truncate">
                  {p2?.nickname || 'CyberBot AI'}
                </div>
                <div className="text-xs text-cyan-400 font-mono font-bold flex items-center gap-1">
                  <Bot className="w-3.5 h-3.5" />
                  <span>NEURAL CORE v2.4</span>
                </div>
              </div>
            </div>

            {/* CyberBot Speech Bubble */}
            <div className="p-3 rounded-2xl bg-slate-900/90 border border-cyan-500/30 shadow-inner mb-3 relative">
              <div className="text-[10px] font-mono font-bold text-cyan-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-cyan-300" />
                <span>AI Live Feed</span>
              </div>
              <p className="text-xs text-slate-200 font-medium italic">
                "{botSpeech.text}"
              </p>
            </div>

            {/* AI Difficulty Selector (If playing vs Bot) */}
            {isBotPlaying && (
              <div className="pt-2 border-t border-white/10">
                <div className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                  <span>AI Difficulty</span>
                  <span className="text-cyan-400 font-bold uppercase">{botDifficulty}</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['casual', 'pro', 'master'] as BotDifficulty[]).map((diff) => (
                    <button
                      key={diff}
                      onClick={() => onSetBotDifficulty(diff)}
                      className={`py-1.5 px-2 rounded-xl text-[11px] font-black uppercase font-mono tracking-wider transition ${
                        botDifficulty === diff
                          ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30 font-extrabold'
                          : 'bg-slate-900 text-slate-400 hover:text-white border border-white/5'
                      }`}
                    >
                      {diff}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Connection Ping */}
            <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-slate-400 pt-2 border-t border-white/5">
              <span>Sync Protocol</span>
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <Shield className="w-3 h-3" />
                WebRTC 60Hz
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
