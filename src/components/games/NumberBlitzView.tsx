import React, { useEffect, useState } from 'react';
import type { NumberBlitzState } from '../../types/game';
import type { AuthoritativeRoomState } from '../../types/room';
import { soundService } from '../../services/sound';

interface NumberBlitzViewProps {
  room: AuthoritativeRoomState<NumberBlitzState>;
  playerUid: string;
  onDispatchAction: (type: string, payload: any) => void;
}

const OPTION_THEMES = [
  { bg: 'from-violet-700 to-violet-900', border: 'border-violet-500', shadow: 'shadow-violet-500/30' },
  { bg: 'from-cyan-700 to-cyan-900', border: 'border-cyan-500', shadow: 'shadow-cyan-500/30' },
  { bg: 'from-amber-600 to-amber-800', border: 'border-amber-500', shadow: 'shadow-amber-500/30' },
  { bg: 'from-rose-700 to-rose-900', border: 'border-rose-500', shadow: 'shadow-rose-500/30' },
];

export const NumberBlitzView: React.FC<NumberBlitzViewProps> = ({
  room,
  playerUid,
  onDispatchAction
}) => {
  const gameState = room.gameState;
  const currentIdx = gameState.playerQuestionIndex?.[playerUid] || 0;
  const question = gameState.questions?.[currentIdx];
  const myScore = gameState.playerScores?.[playerUid] || 0;
  const myStreak = gameState.streaks?.[playerUid] || 0;

  const opponent = Object.values(room.players).find(p => p.uid !== playerUid);
  const opScore = gameState.playerScores?.[opponent?.uid || ''] || 0;

  const [timeLeft, setTimeLeft] = useState(30);
  const [lastAnswer, setLastAnswer] = useState<{ correct: boolean; idx: number } | null>(null);

  useEffect(() => {
    const updateTime = () => {
      const remaining = Math.max(0, Math.ceil((gameState.endTime - Date.now()) / 1000));
      setTimeLeft(remaining);
    };
    updateTime();
    const interval = setInterval(updateTime, 200);
    return () => clearInterval(interval);
  }, [gameState.endTime]);

  const handleSelectOption = (index: number) => {
    if (!question) return;
    const isCorrect = index === question.correctIndex;
    setLastAnswer({ correct: isCorrect, idx: index });
    setTimeout(() => setLastAnswer(null), 400);
    soundService.playClick();
    onDispatchAction('BLITZ_ANSWER', { chosenIndex: index });
  };

  const timerPercent = Math.max(0, (timeLeft / 30) * 100);
  const timerColor = timeLeft > 15 ? '#10b981' : timeLeft > 8 ? '#f59e0b' : '#ef4444';

  if (!question) {
    return (
      <div className="w-full max-w-xl mx-auto flex flex-col items-center gap-4 p-6">
        <span className="text-5xl">🎉</span>
        <h3 className="text-2xl font-black font-mono text-white">Finished!</h3>
        <p className="text-slate-400 font-medium text-center">Calculating results...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col items-center select-none gap-3">
      {/* HUD: timer + score + rival */}
      <div className="w-full flex items-center gap-2">
        {/* Timer ring */}
        <div className="relative w-14 h-14 shrink-0">
          <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
            <circle cx="28" cy="28" r="24" fill="none" stroke="#1e293b" strokeWidth="5" />
            <circle
              cx="28" cy="28" r="24" fill="none"
              stroke={timerColor} strokeWidth="5"
              strokeDasharray={`${2 * Math.PI * 24}`}
              strokeDashoffset={`${2 * Math.PI * 24 * (1 - timerPercent / 100)}`}
              className="transition-all duration-200"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-sm font-black font-mono text-white">{timeLeft}</span>
        </div>

        {/* Score vs rival */}
        <div className="flex-1 glass-card p-2 rounded-2xl flex items-center justify-between">
          <div className="text-center">
            <div className="text-lg font-black font-mono text-amber-400">{myScore}</div>
            <div className="text-[10px] text-amber-300 font-bold">YOU</div>
          </div>
          <div className="text-slate-600 font-black text-sm">VS</div>
          <div className="text-center">
            <div className="text-lg font-black font-mono text-cyan-400">{opScore}</div>
            <div className="text-[10px] text-cyan-300 font-bold">{opponent?.nickname?.split(' ')[0] || 'RIVAL'}</div>
          </div>
        </div>

        {/* Streak badge */}
        {myStreak >= 2 && (
          <div className="shrink-0 flex flex-col items-center px-2.5 py-1.5 rounded-xl bg-amber-950/80 border border-amber-500/50">
            <span className="text-lg">🔥</span>
            <span className="text-[10px] font-black font-mono text-amber-400">{myStreak}x</span>
          </div>
        )}
      </div>

      {/* Question Billboard */}
      <div className="w-full rounded-3xl border-2 border-cyan-500/30 p-6 text-center shadow-2xl relative overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #030d1a 0%, #051525 100%)', boxShadow: '0 0 30px rgba(6,182,212,0.1)' }}
      >
        {/* Question number */}
        <div className="text-[10px] font-black font-mono text-cyan-500/80 tracking-widest mb-2">
          Q{currentIdx + 1}
        </div>
        {/* Expression */}
        <div className="text-5xl font-black font-mono text-white tracking-tight">
          {question.expression} <span className="text-cyan-400">=?</span>
        </div>
        {/* Streak multiplier reminder */}
        {myStreak >= 2 && (
          <div className="mt-2 text-xs font-bold text-amber-400 font-mono">
            🔥 {myStreak}x streak bonus active!
          </div>
        )}
      </div>

      {/* 4 Answer Options */}
      <div className="grid grid-cols-2 gap-2.5 w-full">
        {question.options.map((opt, i) => {
          const theme = OPTION_THEMES[i % OPTION_THEMES.length];
          const wasJustChosen = lastAnswer?.idx === i;
          return (
            <button
              key={i}
              onClick={() => handleSelectOption(i)}
              className={`relative h-20 rounded-2xl border-2 flex items-center justify-center text-3xl font-black font-mono text-white
                active:scale-90 transition-all duration-100 overflow-hidden select-none touch-manipulation
                bg-gradient-to-b ${theme.bg} ${theme.border} shadow-lg ${theme.shadow}
                ${wasJustChosen ? 'scale-95 brightness-150' : 'hover:brightness-110 hover:scale-[1.03]'}
              `}
              style={{ boxShadow: wasJustChosen ? '0 0 30px rgba(255,255,255,0.4)' : undefined }}
            >
              {/* Shine overlay */}
              <div className="absolute top-0 left-0 right-0 h-1/2 bg-white/10 rounded-t-xl" />
              <span className="relative z-10">{opt}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
