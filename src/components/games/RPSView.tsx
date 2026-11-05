import React, { useState, useEffect, useRef } from 'react';
import type { RPSState, RPSChoice } from '../../types/game';
import type { AuthoritativeRoomState } from '../../types/room';
import { soundService } from '../../services/sound';
import { JuiceEngine } from '../../engine/core/JuiceEngine';

interface RPSViewProps {
  room: AuthoritativeRoomState<RPSState>;
  playerUid: string;
  onDispatchAction: (type: string, payload: any) => void;
}

const CHOICES: { id: RPSChoice; icon: string; label: string; key: string; color: string; border: string; glow: string; beats: RPSChoice }[] = [
  { id: 'rock',     icon: '✊', label: 'Rock',     key: 'R', color: 'from-amber-600 to-yellow-500',   border: 'border-amber-400',  glow: 'shadow-amber-500/60',  beats: 'scissors' },
  { id: 'paper',    icon: '✋', label: 'Paper',    key: 'P', color: 'from-cyan-600 to-sky-400',       border: 'border-cyan-400',   glow: 'shadow-cyan-500/60',   beats: 'rock'     },
  { id: 'scissors', icon: '✌️', label: 'Scissors', key: 'S', color: 'from-rose-600 to-pink-500',      border: 'border-rose-400',   glow: 'shadow-rose-500/60',   beats: 'paper'    },
];

export const RPSView: React.FC<RPSViewProps> = ({ room, playerUid, onDispatchAction }) => {
  const gameState = room.gameState;
  const myCommit   = gameState.commits?.[playerUid];
  const myChoice   = gameState.choices?.[playerUid] as RPSChoice | null;
  const opponentUid    = Object.keys(room.players).find((uid) => uid !== playerUid) || 'bot_rival';
  const opponentCommit = opponentUid ? gameState.commits?.[opponentUid] : null;
  const opponentChoice = opponentUid ? (gameState.choices?.[opponentUid] as RPSChoice | null) : null;
  const opponent        = (opponentUid && room.players[opponentUid]) || { uid: 'bot_rival', nickname: 'CyberBot ⚡', avatarId: '🤖' };

  const juiceRef = useRef<JuiceEngine | null>(null);
  if (!juiceRef.current) juiceRef.current = new JuiceEngine(100);

  const [clashAnim, setClashAnim]       = useState(false);
  const [flashResult, setFlashResult]   = useState<'win' | 'lose' | 'draw' | null>(null);
  const [countdown, setCountdown]       = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isWinner = gameState.roundWinner === playerUid;
  const isLoser  = gameState.roundWinner && gameState.roundWinner !== playerUid && gameState.roundWinner !== 'draw';
  const isDraw   = gameState.roundWinner === 'draw';

  // Scores
  const p1Wins = room.scores[playerUid] ?? gameState.roundScores?.[playerUid] ?? 0;
  const p2Wins = opponentUid ? (room.scores[opponentUid] ?? gameState.roundScores?.[opponentUid] ?? 0) : 0;
  const targetWins = room.maxRounds || gameState.targetWins || 3;

  useEffect(() => {
    if (gameState.phase === 'revealed') {
      setClashAnim(true);
      setFlashResult(isWinner ? 'win' : isDraw ? 'draw' : 'lose');
      soundService.playImpact(1.3);
      juiceRef.current?.addTrauma(0.4);
      if (isWinner)      soundService.playVictory();
      else if (!isDraw)  soundService.playDefeat();
      else               soundService.playDraw();

      // Start next-round countdown
      let n = 3;
      setCountdown(n);
      if (countdownRef.current) clearInterval(countdownRef.current);
      countdownRef.current = setInterval(() => {
        n--;
        if (n <= 0) {
          setCountdown(null);
          if (countdownRef.current) clearInterval(countdownRef.current);
        } else {
          setCountdown(n);
        }
      }, 1000);

      const timer = setTimeout(() => { setClashAnim(false); setFlashResult(null); }, 700);
      return () => { clearTimeout(timer); };
    }
  }, [gameState.phase, gameState.roundWinner, playerUid]);

  // Keyboard shortcuts R / P / S
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (myCommit || gameState.phase !== 'choosing') return;
      const k = e.key.toUpperCase();
      if (k === 'R') handleSelectChoice('rock');
      else if (k === 'P') handleSelectChoice('paper');
      else if (k === 'S') handleSelectChoice('scissors');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [myCommit, gameState.phase]);

  const handleSelectChoice = (choice: RPSChoice) => {
    if (myCommit || gameState.phase !== 'choosing') return;
    soundService.playClick();
    onDispatchAction('RPS_CHOOSE', { choice });
  };

  const getIcon = (c: RPSChoice | null | undefined) => CHOICES.find((ch) => ch.id === c)?.icon || '❓';

  const resultBg =
    flashResult === 'win'  ? 'bg-emerald-950/95 border-emerald-400' :
    flashResult === 'lose' ? 'bg-rose-950/95 border-rose-400' :
    flashResult === 'draw' ? 'bg-amber-950/95 border-amber-400' :
    'bg-slate-950/80 border-violet-500/40';

  const resultText =
    flashResult === 'win'  ? '🎉 YOU WIN THIS ROUND!' :
    flashResult === 'lose' ? '💥 RIVAL TAKES ROUND!' :
    flashResult === 'draw' ? '🤝 TIE! NEXT ROUND...' :
    myCommit ? '🔒 Choice locked! Waiting for rival...' : 'Pick your weapon below ↓';

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col items-center select-none gap-3 px-2">

      {/* Score Row — pip-based */}
      <div className="w-full flex items-center justify-between px-4 py-2.5 rounded-2xl bg-slate-900/90 border border-slate-700/60 shadow-md">
        <div className="flex items-center gap-2">
          <span className="text-xs font-black font-mono text-amber-400 truncate max-w-[80px]">YOU</span>
          <div className="flex gap-1">
            {Array.from({ length: targetWins }).map((_, i) => (
              <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all ${i < p1Wins ? 'bg-amber-400 border-amber-300 shadow-[0_0_8px_#f59e0b]' : 'bg-slate-800 border-slate-700'}`} />
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center">
          <span className="text-[10px] font-black font-mono text-violet-400 tracking-widest">ROUND {gameState.roundNumber || 1}</span>
          <span className="text-[9px] font-mono text-slate-500">BEST OF {targetWins * 2 - 1}</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {Array.from({ length: targetWins }).map((_, i) => (
              <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all ${i < p2Wins ? 'bg-cyan-400 border-cyan-300 shadow-[0_0_8px_#06b6d4]' : 'bg-slate-800 border-slate-700'}`} />
            ))}
          </div>
          <span className="text-xs font-black font-mono text-cyan-400 truncate max-w-[80px]">{opponent?.nickname || 'RIVAL'}</span>
        </div>
      </div>

      {/* Main Clash Arena */}
      <div
        className={`w-full rounded-3xl border-2 overflow-hidden shadow-2xl relative transition-all duration-300 ${resultBg}`}
        style={{ background: 'linear-gradient(160deg, #0d081f 0%, #170d36 50%, #0a0518 100%)' }}
      >
        {/* VS / Clash Grid */}
        <div className="grid grid-cols-2 divide-x divide-violet-500/30 min-h-[200px] relative">

          {/* Player Side */}
          <div className="flex flex-col items-center justify-center p-5 gap-3">
            <span className="text-[11px] font-black font-mono text-amber-400 tracking-widest">YOU</span>
            <div
              className={`w-28 h-28 rounded-3xl flex items-center justify-center text-6xl border-2 transition-all duration-300 ${
                myChoice
                  ? `border-amber-400 bg-amber-500/20 shadow-xl shadow-amber-500/50 ${clashAnim ? 'scale-125 rotate-6' : 'scale-110'}`
                  : myCommit
                  ? 'border-amber-500/60 bg-amber-500/10 animate-pulse'
                  : 'border-slate-700 bg-slate-900/80'
              }`}
            >
              {myChoice ? getIcon(myChoice) : myCommit ? '🔒' : '❓'}
            </div>
            <span className="text-xs font-bold text-slate-300 capitalize font-mono">
              {myChoice ? myChoice : myCommit ? 'Locked In' : 'Choose below'}
            </span>
          </div>

          {/* Opponent Side */}
          <div className="flex flex-col items-center justify-center p-5 gap-3">
            <span className="text-[11px] font-black font-mono text-cyan-400 tracking-widest truncate max-w-[120px]">
              {opponent?.nickname || 'RIVAL'}
            </span>
            <div
              className={`w-28 h-28 rounded-3xl flex items-center justify-center text-6xl border-2 transition-all duration-300 ${
                opponentChoice
                  ? `border-cyan-400 bg-cyan-500/20 shadow-xl shadow-cyan-500/50 ${clashAnim ? 'scale-125 -rotate-6' : 'scale-110'}`
                  : opponentCommit
                  ? 'border-cyan-500/60 bg-cyan-500/10 animate-pulse'
                  : 'border-slate-700 bg-slate-900/80'
              }`}
            >
              {opponentChoice ? getIcon(opponentChoice) : opponentCommit ? '🔒' : '❓'}
            </div>
            <span className="text-xs font-bold text-slate-300 capitalize font-mono">
              {opponentChoice ? opponentChoice : opponentCommit ? 'Locked In' : 'Deciding...'}
            </span>
          </div>

          {/* Central VS orb */}
          <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-slate-950 border-2 flex items-center justify-center shadow-xl z-20 pointer-events-none transition-all duration-300 ${clashAnim ? 'border-white scale-125 shadow-white/40' : 'border-violet-400'}`}>
            <span className="text-xs font-black font-['Outfit'] text-violet-300">VS</span>
          </div>
        </div>

        {/* Result Banner */}
        <div className={`border-t border-white/10 px-5 py-3.5 text-center transition-all ${flashResult ? 'opacity-100' : 'opacity-90'}`}>
          {countdown !== null && (
            <span className="text-[11px] text-slate-500 font-mono block mb-1">Next round in {countdown}s...</span>
          )}
          <span className={`text-sm font-black font-mono tracking-wide block ${
            flashResult === 'win' ? 'text-emerald-300' :
            flashResult === 'lose' ? 'text-rose-300' :
            flashResult === 'draw' ? 'text-amber-300' :
            myCommit ? 'text-cyan-300 animate-pulse' : 'text-slate-400'
          }`}>
            {resultText}
          </span>
        </div>
      </div>

      {/* 3 Big Choice Cards */}
      <div className="grid grid-cols-3 gap-2.5 w-full">
        {CHOICES.map((card) => {
          const isSelected = myChoice === card.id || (myCommit && gameState.choices?.[playerUid] === card.id);
          const isDisabled = Boolean(myCommit) || gameState.phase !== 'choosing';
          return (
            <button
              key={card.id}
              onClick={() => handleSelectChoice(card.id)}
              disabled={isDisabled}
              className={`relative py-5 px-2 rounded-2xl flex flex-col items-center gap-2 border-2 transition-all duration-150 select-none overflow-hidden min-h-[88px] ${
                isSelected
                  ? `bg-gradient-to-b ${card.color} ${card.border} scale-105 shadow-2xl ${card.glow}`
                  : isDisabled
                  ? 'bg-slate-900/40 border-slate-800 opacity-25 cursor-not-allowed'
                  : `bg-slate-800/80 border-slate-700 hover:border-violet-400 hover:bg-slate-700/80 active:scale-95 cursor-pointer shadow-lg hover:shadow-violet-500/20`
              }`}
            >
              <span className="text-5xl filter drop-shadow-md leading-none">{card.icon}</span>
              <span className="text-xs font-black font-mono text-white tracking-wider">{card.label}</span>
              <span className="text-[9px] font-mono text-white/50 tracking-widest">[{card.key}]</span>
              {isSelected && <div className="absolute inset-0 bg-white/15 rounded-2xl animate-pulse pointer-events-none" />}
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-slate-500 font-mono text-center">
        ⌨️ Keyboard: [R] Rock • [P] Paper • [S] Scissors
      </p>
    </div>
  );
};
