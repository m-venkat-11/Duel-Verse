import React, { useEffect, useState } from 'react';
import type { NumberBlitzState } from '../../types/game';
import type { AuthoritativeRoomState } from '../../types/room';
import { soundService } from '../../services/sound';
import { Hash, Flame, Clock } from 'lucide-react';

interface NumberBlitzViewProps {
  room: AuthoritativeRoomState<NumberBlitzState>;
  playerUid: string;
  onDispatchAction: (type: string, payload: any) => void;
}

export const NumberBlitzView: React.FC<NumberBlitzViewProps> = ({
  room,
  playerUid,
  onDispatchAction
}) => {
  const gameState = room.gameState;
  const currentIdx = gameState.playerQuestionIndex[playerUid] || 0;
  const question = gameState.questions[currentIdx];
  const myScore = gameState.playerScores[playerUid] || 0;
  const myStreak = gameState.streaks[playerUid] || 0;

  const [timeLeft, setTimeLeft] = useState(30);

  useEffect(() => {
    const updateTime = () => {
      const remaining = Math.max(0, Math.ceil((gameState.endTime - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0 && room.status === 'playing' && room.hostUid === playerUid) {
        // Evaluate winner on time expiry
        const p1 = Object.keys(room.players)[0];
        const p2 = Object.keys(room.players)[1];
        const s1 = gameState.playerScores[p1] || 0;
        const s2 = gameState.playerScores[p2] || 0;
        const winner = s1 > s2 ? p1 : s2 > s1 ? p2 : 'draw';
        // Round concluded
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [gameState.endTime, room.status, room.hostUid, playerUid, gameState.playerScores, room.players]);

  const handleSelectOption = (index: number) => {
    soundService.playClick();
    onDispatchAction('BLITZ_ANSWER', { chosenIndex: index });
  };

  if (!question) {
    return (
      <div className="text-center p-6 text-white font-bold">
        Sprint Finished! Waiting for results...
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm mx-auto flex flex-col items-center">
      {/* Timer & Streak Bar */}
      <div className="mb-3 flex items-center justify-between w-full px-4 py-2 rounded-xl bg-slate-900/80 border border-slate-700/80 text-xs font-bold font-['Outfit']">
        <div className="flex items-center gap-1.5 text-cyan-400">
          <Clock className="w-4 h-4" />
          <span className="font-mono text-sm">{timeLeft}s</span>
        </div>
        <div className="flex items-center gap-1.5 text-amber-400 font-mono">
          <Flame className="w-4 h-4" />
          <span>STREAK: {myStreak}x</span>
        </div>
        <div className="text-white font-mono text-sm">
          {myScore} PTS
        </div>
      </div>

      {/* Arithmetic Expression Display */}
      <div className="w-full bg-slate-900/90 rounded-2xl border-2 border-blue-500/40 p-6 mb-4 text-center shadow-2xl">
        <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400 font-mono mb-1 block">
          QUESTION {currentIdx + 1}
        </span>
        <div className="text-4xl sm:text-5xl font-black font-['Outfit'] text-white tracking-tight">
          {question.expression} = ?
        </div>
      </div>

      {/* 4 Quadrant Option Buttons */}
      <div className="grid grid-cols-2 gap-3 w-full">
        {question.options.map((opt, i) => (
          <button
            key={i}
            onClick={() => handleSelectOption(i)}
            className="h-16 rounded-xl bg-slate-800/90 border-2 border-slate-700 hover:border-blue-500/60 hover:bg-slate-700/80 text-2xl font-black font-['Outfit'] text-white active:scale-95 transition shadow-lg flex items-center justify-center cursor-pointer"
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
};
