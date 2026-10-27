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

const CHOICES: { id: RPSChoice; icon: string; label: string; color: string; glow: string; beats: RPSChoice }[] = [
  { id: 'rock', icon: '✊', label: 'Rock', color: 'from-amber-600 to-yellow-500', glow: 'shadow-amber-500/50', beats: 'scissors' },
  { id: 'paper', icon: '✋', label: 'Paper', color: 'from-cyan-600 to-sky-400', glow: 'shadow-cyan-500/50', beats: 'rock' },
  { id: 'scissors', icon: '✌️', label: 'Scissors', color: 'from-rose-600 to-pink-500', glow: 'shadow-rose-500/50', beats: 'paper' },
];

export const RPSView: React.FC<RPSViewProps> = ({
  room,
  playerUid,
  onDispatchAction
}) => {
  const gameState = room.gameState;
  const myCommit = gameState.commits?.[playerUid];
  const myChoice = gameState.choices?.[playerUid] as RPSChoice | null;
  const opponentUid = Object.keys(room.players).find((uid) => uid !== playerUid);
  const opponentCommit = opponentUid ? gameState.commits?.[opponentUid] : null;
  const opponentChoice = opponentUid ? (gameState.choices?.[opponentUid] as RPSChoice | null) : null;
  const opponent = opponentUid ? room.players[opponentUid] : null;

  const juiceRef = useRef<JuiceEngine | null>(null);
  if (!juiceRef.current) {
    juiceRef.current = new JuiceEngine(100);
  }

  const [clashBounce, setClashBounce] = useState<boolean>(false);

  // Trigger impact shake and audio when both choices reveal
  useEffect(() => {
    if (gameState.phase === 'revealed') {
      setClashBounce(true);
      soundService.playImpact(1.3);
      juiceRef.current?.addTrauma(0.35);

      if (gameState.roundWinner === playerUid) {
        soundService.playVictory();
      } else if (gameState.roundWinner && gameState.roundWinner !== 'draw') {
        soundService.playDefeat();
      } else {
        soundService.playDraw();
      }

      const timer = setTimeout(() => setClashBounce(false), 600);
      return () => clearTimeout(timer);
    }
  }, [gameState.phase, gameState.roundWinner, playerUid]);

  const handleSelectChoice = (choice: RPSChoice) => {
    if (myCommit || gameState.phase !== 'choosing') return;
    soundService.playClick();
    onDispatchAction('RPS_CHOOSE', { choice });
  };

  const getChoiceIcon = (c: RPSChoice | null | undefined) => {
    if (!c) return '❓';
    return CHOICES.find((ch) => ch.id === c)?.icon || '❓';
  };

  const isWinner = gameState.roundWinner === playerUid;
  const isLoser = gameState.roundWinner && gameState.roundWinner !== playerUid && gameState.roundWinner !== 'draw';
  const isDraw = gameState.roundWinner === 'draw';

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col items-center select-none gap-3 px-2">
      {/* Round & Target Counter */}
      <div className="flex items-center gap-3 text-xs font-black font-mono text-slate-400 bg-slate-900/60 px-4 py-1.5 rounded-full border border-white/10 shadow-inner">
        <span className="text-violet-400">ROUND {gameState.roundNumber || 1}</span>
        <span className="text-slate-600">•</span>
        <span className="text-slate-300">FIRST TO {gameState.targetWins} WINS</span>
      </div>

      {/* Synchronized Clash Arena */}
      <div
        className="w-full rounded-3xl border-2 border-violet-500/40 overflow-hidden shadow-2xl relative"
        style={{
          background: 'linear-gradient(160deg, #0d081f 0%, #170d36 50%, #0a0518 100%)',
          boxShadow: '0 0 50px rgba(139, 92, 246, 0.25), inset 0 2px 6px rgba(255, 255, 255, 0.1)'
        }}
      >
        {/* VS Row with Hand Clash Animation */}
        <div className="grid grid-cols-2 divide-x divide-violet-500/25 min-h-[175px] relative">
          {/* Player Hand Side */}
          <div className="flex flex-col items-center justify-center p-4 gap-2 relative">
            <span className="text-[11px] font-black text-amber-400 font-mono tracking-widest">YOU</span>
            <div
              className={`w-24 h-24 rounded-3xl flex items-center justify-center text-5xl border-2 transition-all duration-300 ${
                myChoice
                  ? `border-amber-400 bg-amber-500/20 shadow-xl shadow-amber-500/40 ${
                      clashBounce ? 'scale-125 rotate-6' : 'scale-110'
                    }`
                  : myCommit
                  ? 'border-amber-500/60 bg-amber-500/10 animate-pulse'
                  : 'border-slate-800 bg-slate-900/80'
              }`}
            >
              {myChoice ? getChoiceIcon(myChoice) : myCommit ? '🔒' : '❓'}
            </div>
            <span className="text-xs font-bold text-slate-300 capitalize font-mono">
              {myChoice ? myChoice : myCommit ? 'Locked In' : 'Pick below'}
            </span>
          </div>

          {/* Opponent Hand Side */}
          <div className="flex flex-col items-center justify-center p-4 gap-2 relative">
            <span className="text-[11px] font-black text-cyan-400 font-mono tracking-widest truncate max-w-[120px]">
              {opponent?.nickname || 'CYBERBOT'}
            </span>
            <div
              className={`w-24 h-24 rounded-3xl flex items-center justify-center text-5xl border-2 transition-all duration-300 ${
                opponentChoice
                  ? `border-cyan-400 bg-cyan-500/20 shadow-xl shadow-cyan-500/40 ${
                      clashBounce ? 'scale-125 -rotate-6' : 'scale-110'
                    }`
                  : opponentCommit
                  ? 'border-cyan-500/60 bg-cyan-500/10 animate-pulse'
                  : 'border-slate-800 bg-slate-900/80'
              }`}
            >
              {opponentChoice ? getChoiceIcon(opponentChoice) : opponentCommit ? '🔒' : '❓'}
            </div>
            <span className="text-xs font-bold text-slate-300 capitalize font-mono">
              {opponentChoice ? opponentChoice : opponentCommit ? 'Locked In' : 'Deciding...'}
            </span>
          </div>

          {/* Central Clash Lightning Shockwave Icon */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-slate-950 border-2 border-violet-400 flex items-center justify-center shadow-lg z-20 pointer-events-none">
            <span className="text-xs font-black font-['Outfit'] text-violet-300">VS</span>
          </div>
        </div>

        {/* Dynamic Status / Round Outcome Banner */}
        <div
          className={`border-t border-white/10 px-5 py-3 text-center transition-all ${
            gameState.phase === 'revealed'
              ? isWinner
                ? 'bg-emerald-950/90 text-emerald-300'
                : isLoser
                ? 'bg-rose-950/90 text-rose-300'
                : 'bg-amber-950/90 text-amber-300'
              : 'bg-slate-950/70 text-slate-300'
          }`}
        >
          {gameState.phase === 'revealed' ? (
            <span className="text-sm font-black font-mono tracking-wide animate-pop-in block">
              {isWinner ? '🎉 YOU WIN THIS ROUND!' : isDraw ? '🤝 TIE! NEXT ROUND...' : '💥 RIVAL TAKES ROUND!'}
            </span>
          ) : myCommit ? (
            <span className="text-xs font-bold text-cyan-300 flex items-center justify-center gap-2 animate-pulse font-mono">
              <span>🔒</span> Choice locked! Waiting for rival...
            </span>
          ) : (
            <span className="text-xs text-slate-400 font-semibold font-mono">
              Choose your stance below to strike!
            </span>
          )}
        </div>
      </div>

      {/* 3 Interactive Tactile Choice Cards */}
      <div className="grid grid-cols-3 gap-2.5 w-full">
        {CHOICES.map((card) => {
          const isSelected = myChoice === card.id || (myCommit && gameState.choices?.[playerUid] === card.id);
          const isDisabled = Boolean(myCommit) || gameState.phase !== 'choosing';

          return (
            <button
              key={card.id}
              onClick={() => handleSelectChoice(card.id)}
              disabled={isDisabled}
              className={`relative py-4 px-2 rounded-2xl flex flex-col items-center gap-2 border-2 transition-all duration-150 select-none overflow-hidden ${
                isSelected
                  ? `bg-gradient-to-b ${card.color} border-white scale-105 shadow-xl ${card.glow}`
                  : isDisabled
                  ? 'bg-slate-900/50 border-slate-800 opacity-30 cursor-not-allowed'
                  : `bg-slate-800/80 border-slate-700 hover:border-violet-400 hover:bg-slate-700/80 active:scale-95 cursor-pointer shadow-lg hover:shadow-violet-500/20`
              }`}
            >
              <span className="text-4xl filter drop-shadow-md">{card.icon}</span>
              <span className="text-xs font-black font-mono text-white tracking-wide">{card.label}</span>
              {isSelected && (
                <div className="absolute inset-0 bg-white/15 rounded-2xl animate-pulse pointer-events-none" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
