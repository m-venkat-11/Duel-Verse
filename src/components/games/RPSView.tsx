import React from 'react';
import type { RPSState, RPSChoice } from '../../types/game';
import type { AuthoritativeRoomState } from '../../types/room';
import { soundService } from '../../services/sound';
import { Shield, Sparkles, Check, Lock } from 'lucide-react';

interface RPSViewProps {
  room: AuthoritativeRoomState<RPSState>;
  playerUid: string;
  onDispatchAction: (type: string, payload: any) => void;
}

const CARDS: { id: RPSChoice; label: string; icon: string; color: string }[] = [
  { id: 'rock', label: 'Rock', icon: '🪨', color: '#F59E0B' },
  { id: 'paper', label: 'Paper', icon: '📄', color: '#06B6D4' },
  { id: 'scissors', label: 'Scissors', icon: '✂️', color: '#EC4899' },
];

export const RPSView: React.FC<RPSViewProps> = ({
  room,
  playerUid,
  onDispatchAction
}) => {
  const gameState = room.gameState;
  const myCommit = gameState.commits[playerUid];
  const myChoice = gameState.choices[playerUid];

  const opponentUid = Object.keys(room.players).find((uid) => uid !== playerUid);
  const opponentCommit = opponentUid ? gameState.commits[opponentUid] : null;
  const opponentChoice = opponentUid ? gameState.choices[opponentUid] : null;

  const handleSelectChoice = (choice: RPSChoice) => {
    if (myCommit || gameState.phase !== 'choosing') return;
    soundService.playMove();
    onDispatchAction('RPS_CHOOSE', { choice });
  };

  const getEmojiForChoice = (c: RPSChoice | null | undefined) => {
    if (!c) return '❓';
    if (c === 'rock') return '🪨';
    if (c === 'paper') return '📄';
    return '✂️';
  };

  return (
    <div className="w-full max-w-md mx-auto flex flex-col items-center">
      {/* Round & Target Progress */}
      <div className="mb-4 flex items-center justify-between w-full px-4 py-2 rounded-xl bg-slate-900/80 border border-slate-700/80 text-xs font-bold font-['Outfit']">
        <div className="flex items-center gap-1.5 text-slate-300">
          <Shield className="w-4 h-4 text-violet-400" />
          <span>ROUND {gameState.roundNumber} (First to {gameState.targetWins})</span>
        </div>
        <div className="text-violet-400 font-mono">
          {Object.entries(gameState.roundScores)
            .map(([uid, score]) => `${uid === playerUid ? 'YOU' : 'RIVAL'}: ${score}`)
            .join(' | ')}
        </div>
      </div>

      {/* Duel Arena Reveal Stage */}
      <div className="w-full bg-slate-900/90 rounded-2xl border-2 border-violet-500/30 p-5 mb-5 shadow-2xl">
        <div className="grid grid-cols-2 gap-4 text-center">
          {/* Your Side */}
          <div className="flex flex-col items-center p-3 rounded-xl bg-slate-800/60 border border-slate-700/80">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 font-mono mb-2">
              YOU
            </span>
            <div className="w-20 h-20 rounded-2xl bg-amber-500/10 border-2 border-amber-500/40 flex items-center justify-center text-4xl shadow-lg">
              {myChoice ? getEmojiForChoice(myChoice) : myCommit ? '🔒' : '❓'}
            </div>
            <span className="text-xs font-bold text-slate-300 mt-2 capitalize font-['Outfit']">
              {myChoice ? myChoice : myCommit ? 'Choice Locked' : 'Select Choice'}
            </span>
          </div>

          {/* Opponent's Side */}
          <div className="flex flex-col items-center p-3 rounded-xl bg-slate-800/60 border border-slate-700/80">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-400 font-mono mb-2">
              RIVAL
            </span>
            <div className="w-20 h-20 rounded-2xl bg-rose-500/10 border-2 border-rose-500/40 flex items-center justify-center text-4xl shadow-lg">
              {opponentChoice
                ? getEmojiForChoice(opponentChoice)
                : opponentCommit
                ? '🔒'
                : '❓'}
            </div>
            <span className="text-xs font-bold text-slate-300 mt-2 capitalize font-['Outfit']">
              {opponentChoice
                ? opponentChoice
                : opponentCommit
                ? 'Opponent Locked'
                : 'Choosing...'}
            </span>
          </div>
        </div>

        {/* Phase Indicator */}
        <div className="mt-4 pt-3 border-t border-slate-800 text-center">
          {gameState.phase === 'revealed' ? (
            <div className="text-sm font-bold font-['Outfit'] text-emerald-400">
              {gameState.roundWinner === playerUid
                ? '🎉 You win this round!'
                : gameState.roundWinner === 'draw'
                ? '🤝 Round Tied! Next round incoming...'
                : '💥 Opponent takes this round!'}
            </div>
          ) : myCommit ? (
            <div className="text-xs font-semibold text-cyan-300 flex items-center justify-center gap-1.5 animate-pulse">
              <Lock className="w-3.5 h-3.5" />
              <span>Locked in! Waiting for opponent...</span>
            </div>
          ) : (
            <div className="text-xs font-semibold text-slate-400">
              Select Rock, Paper, or Scissors below to lock in!
            </div>
          )}
        </div>
      </div>

      {/* 3 Choice Cards */}
      <div className="grid grid-cols-3 gap-3 w-full">
        {CARDS.map((card) => {
          const isSelected = myChoice === card.id;

          return (
            <button
              key={card.id}
              onClick={() => handleSelectChoice(card.id)}
              disabled={Boolean(myCommit) || gameState.phase !== 'choosing'}
              className={`p-4 rounded-xl flex flex-col items-center gap-2 border-2 transition-all duration-150 ${
                isSelected
                  ? 'bg-violet-600/30 border-violet-400 scale-105 shadow-xl shadow-violet-500/30'
                  : myCommit
                  ? 'bg-slate-800/40 border-slate-800 opacity-60 cursor-not-allowed'
                  : 'bg-slate-800/80 border-slate-700 hover:border-violet-500/60 hover:bg-slate-700/80 active:scale-95 cursor-pointer shadow-lg'
              }`}
            >
              <span className="text-4xl select-none">{card.icon}</span>
              <span className="text-sm font-bold font-['Outfit'] text-white">
                {card.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
