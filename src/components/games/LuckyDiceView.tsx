import React, { useState, useEffect, useRef } from 'react';
import type { LuckyDiceState } from '../../types/game';
import type { AuthoritativeRoomState } from '../../types/room';
import { soundService } from '../../services/sound';
import { JuiceEngine } from '../../engine/core/JuiceEngine';
import { Trophy, Dices, Sparkles, Lock, RefreshCw, CheckCircle2, ChevronRight, Crown } from 'lucide-react';

interface LuckyDiceViewProps {
  room: AuthoritativeRoomState<LuckyDiceState>;
  playerUid: string;
  onDispatchAction: (type: string, payload: any) => void;
}

// Visual Dice Face renderer with authentic pip dots
const DiceFace: React.FC<{
  value: number;
  size?: 'sm' | 'md' | 'lg';
  color?: 'amber' | 'cyan' | 'emerald' | 'rose' | 'slate';
  isRolling?: boolean;
  isCleared?: boolean;
}> = ({ value, size = 'md', color = 'amber', isRolling = false, isCleared = false }) => {
  const sizeClasses = {
    sm: 'w-10 h-10 rounded-xl text-xs',
    md: 'w-16 h-16 rounded-2xl text-sm',
    lg: 'w-24 h-24 rounded-3xl text-lg'
  };

  const pipSizes = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4.5 h-4.5'
  };

  const colorStyles = {
    amber: 'bg-gradient-to-br from-amber-400 via-orange-500 to-amber-600 text-slate-950 border-amber-300 shadow-amber-500/40',
    cyan: 'bg-gradient-to-br from-cyan-400 via-blue-500 to-indigo-600 text-white border-cyan-300 shadow-cyan-500/40',
    emerald: 'bg-gradient-to-br from-emerald-400 via-teal-500 to-emerald-600 text-slate-950 border-emerald-300 shadow-emerald-500/40',
    rose: 'bg-gradient-to-br from-rose-400 via-pink-500 to-red-600 text-white border-rose-300 shadow-rose-500/40',
    slate: 'bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 text-slate-300 border-slate-600 shadow-black/40'
  };

  // 3x3 grid positions for standard dice pips (1-6)
  const renderPips = (val: number) => {
    const hasPip = (row: number, col: number) => {
      if (val === 1) return row === 1 && col === 1;
      if (val === 2) return (row === 0 && col === 0) || (row === 2 && col === 2);
      if (val === 3) return (row === 0 && col === 0) || (row === 1 && col === 1) || (row === 2 && col === 2);
      if (val === 4) return (row === 0 && col === 0) || (row === 0 && col === 2) || (row === 2 && col === 0) || (row === 2 && col === 2);
      if (val === 5) return (row === 0 && col === 0) || (row === 0 && col === 2) || (row === 1 && col === 1) || (row === 2 && col === 0) || (row === 2 && col === 2);
      if (val === 6) return (row === 0 && col === 0) || (row === 0 && col === 2) || (row === 1 && col === 0) || (row === 1 && col === 2) || (row === 2 && col === 0) || (row === 2 && col === 2);
      return false;
    };

    return (
      <div className="grid grid-cols-3 grid-rows-3 w-full h-full p-2 gap-0.5">
        {[0, 1, 2].map((r) =>
          [0, 1, 2].map((c) => (
            <div key={`${r}-${c}`} className="flex items-center justify-center">
              {hasPip(r, c) && (
                <div
                  className={`${pipSizes[size]} rounded-full shadow-inner ${
                    color === 'slate'
                      ? 'bg-slate-400'
                      : color === 'amber'
                      ? 'bg-slate-950'
                      : 'bg-white'
                  }`}
                />
              )}
            </div>
          ))
        )}
      </div>
    );
  };

  return (
    <div
      className={`relative ${sizeClasses[size]} border-2 flex items-center justify-center select-none shadow-xl transition-all duration-300 ${
        colorStyles[color]
      } ${isRolling ? 'animate-bounce scale-105' : 'hover:scale-102'} ${
        isCleared ? 'ring-4 ring-emerald-400 shadow-emerald-500/80 scale-105' : ''
      }`}
      style={{
        transformStyle: 'preserve-3d',
        perspective: '600px'
      }}
    >
      {/* Specular 3D Reflection Highlight */}
      <div className="absolute inset-x-1 top-1 h-1/3 rounded-t-xl bg-gradient-to-b from-white/35 to-transparent pointer-events-none" />

      {/* Dice Pips */}
      {renderPips(value)}

      {/* Cleared Checkmark Badge */}
      {isCleared && (
        <div className="absolute -top-2 -right-2 bg-emerald-500 border-2 border-white text-slate-950 rounded-full p-0.5 shadow-lg animate-pulse">
          <CheckCircle2 className="w-4 h-4 stroke-[3]" />
        </div>
      )}
    </div>
  );
};

export const LuckyDiceView: React.FC<LuckyDiceViewProps> = ({ room, playerUid, onDispatchAction }) => {
  const gameState = room.gameState;
  const players = Object.keys(room.players);
  const p1Uid = players[0] || playerUid;
  const p2Uid = players[1] || (p1Uid === 'bot_rival' ? 'player' : 'bot_rival');
  const isHost = room.hostUid === playerUid;
  const isBotPlaying = Boolean(room.players['bot_rival'] || p2Uid === 'bot_rival');

  const p1Nickname = room.players[p1Uid]?.nickname || 'Player 1';
  const p2Nickname = room.players[p2Uid]?.nickname || 'CyberBot';

  const juiceRef = useRef<JuiceEngine | null>(null);
  if (!juiceRef.current) juiceRef.current = new JuiceEngine(100);

  // Local selection of predictions before locking in
  const diceCount = gameState?.diceCount || 3;
  const [selectedGuesses, setSelectedGuesses] = useState<number[]>(() =>
    Array.from({ length: diceCount }, () => Math.floor(Math.random() * 6) + 1)
  );

  // Rolling animation state
  const [isSpinning, setIsSpinning] = useState<boolean>(false);
  const [displayRoll, setDisplayRoll] = useState<number[]>(gameState?.currentRoll || [1, 2, 3]);

  // Sync selectedGuesses length when diceCount changes
  useEffect(() => {
    setSelectedGuesses((prev) => {
      const next = [...prev];
      while (next.length < diceCount) next.push(Math.floor(Math.random() * 6) + 1);
      return next.slice(0, diceCount);
    });
  }, [diceCount]);

  // Sync displayed roll with server state
  useEffect(() => {
    if (gameState?.currentRoll && !isSpinning) {
      setDisplayRoll(gameState.currentRoll);
    }
  }, [gameState?.currentRoll, isSpinning]);

  // Handle dice roll animation on rollCount increment
  const prevRollCount = useRef<number>(gameState?.rollCount || 0);
  useEffect(() => {
    if (gameState?.rollCount && gameState.rollCount > prevRollCount.current) {
      prevRollCount.current = gameState.rollCount;
      setIsSpinning(true);
      soundService.playCountdown(1);

      // Rapid randomized tumbling animation (1 second)
      const interval = setInterval(() => {
        setDisplayRoll(Array.from({ length: diceCount }, () => Math.floor(Math.random() * 6) + 1));
      }, 70);

      const timeout = setTimeout(() => {
        clearInterval(interval);
        setIsSpinning(false);
        if (gameState.currentRoll) {
          setDisplayRoll(gameState.currentRoll);
        }
        soundService.playImpact(1.2);
        juiceRef.current?.addTrauma(0.3);

        // Check if any dice cleared
        if (gameState.recentMatches && gameState.recentMatches.length > 0) {
          soundService.playScore();
          if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
        }
      }, 950);

      return () => {
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }
  }, [gameState?.rollCount, diceCount, gameState?.currentRoll, gameState?.recentMatches]);

  // Check Round Win Sound
  useEffect(() => {
    if (gameState?.roundWinnerUid) {
      soundService.playVictory();
      juiceRef.current?.addTrauma(0.6);
    }
  }, [gameState?.roundWinnerUid]);

  // Handlers
  const handleSelectNumber = (index: number, num: number) => {
    soundService.playCountdown(2);
    setSelectedGuesses((prev) => {
      const copy = [...prev];
      copy[index] = num;
      return copy;
    });
  };

  const handleRandomizeAll = () => {
    soundService.playCountdown(1);
    setSelectedGuesses(Array.from({ length: diceCount }, () => Math.floor(Math.random() * 6) + 1));
  };

  const handleSetDiceCount = (count: number) => {
    soundService.playImpact(0.8);
    onDispatchAction('LUCKY_DICE_SET_COUNT', { diceCount: count });
  };

  const handleLockPredictions = () => {
    soundService.playScore();
    onDispatchAction('LUCKY_DICE_SUBMIT_GUESS', { guesses: selectedGuesses });
  };

  const handleRollDice = () => {
    if (isSpinning || gameState.phase !== 'rolling' || gameState.currentTurn !== playerUid) return;
    onDispatchAction('LUCKY_DICE_ROLL', { actingUid: playerUid });
  };

  const myGuesses = gameState?.guesses?.[playerUid];
  const myCleared = gameState?.cleared?.[playerUid] || new Array(diceCount).fill(false);
  const oppUid = p1Uid === playerUid ? p2Uid : p1Uid;
  const oppGuesses = gameState?.guesses?.[oppUid];
  const oppCleared = gameState?.cleared?.[oppUid] || new Array(diceCount).fill(false);

  const isMyTurn = gameState?.currentTurn === playerUid;
  const p1Score = room.scores[p1Uid] || gameState?.roundScores?.[p1Uid] || 0;
  const p2Score = room.scores[p2Uid] || gameState?.roundScores?.[p2Uid] || 0;

  return (
    <div className="w-full max-w-lg mx-auto flex flex-col items-center select-none gap-3 px-2 py-1">
      {/* 1. Header: Live Scoreboard Capsule */}
      <div className="w-full flex items-center justify-between bg-slate-900/90 border-2 border-slate-800 rounded-2xl px-4 py-2.5 shadow-xl backdrop-blur-md">
        {/* Player 1 */}
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center font-black font-['Outfit'] text-amber-300">
            {p1Score}
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-black font-['Outfit'] text-amber-400 truncate max-w-[90px]">
              {p1Uid === playerUid ? 'YOU' : p1Nickname}
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              {myGuesses ? `${myCleared.filter(Boolean).length}/${diceCount} Cleared` : 'Predicting'}
            </span>
          </div>
        </div>

        {/* Center Target Indicator */}
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-1 text-slate-400 font-mono text-xs font-bold">
            <Dices className="w-4 h-4 text-amber-400 animate-spin-slow" />
            <span>FIRST TO {room.maxRounds || 3}</span>
          </div>
          <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest font-black">
            {diceCount} Dice Duel
          </span>
        </div>

        {/* Player 2 */}
        <div className="flex items-center gap-2 flex-row-reverse text-right">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border-2 border-cyan-400 flex items-center justify-center font-black font-['Outfit'] text-cyan-300">
            {p2Score}
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-black font-['Outfit'] text-cyan-400 truncate max-w-[90px]">
              {p2Uid === playerUid ? 'YOU' : p2Nickname}
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              {oppGuesses ? `${oppCleared.filter(Boolean).length}/${diceCount} Cleared` : 'Predicting'}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Main Stage: Phase Dependent (Guessing Setup OR 3D Rolling Arena) */}
      {gameState.phase === 'guessing' && !myGuesses ? (
        /* --- PHASE 1: PREDICTION SETUP --- */
        <div className="w-full bg-gradient-to-b from-slate-900 to-slate-950 border-2 border-slate-800 rounded-3xl p-4 shadow-2xl flex flex-col items-center gap-4">
          {/* Dice Count Selector */}
          <div className="w-full flex flex-col items-center gap-1.5 border-b border-slate-800 pb-3">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Choose Dice Quantity</span>
            </span>
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
              {[1, 2, 3, 4, 5].map((cnt) => (
                <button
                  key={cnt}
                  onClick={() => handleSetDiceCount(cnt)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black font-mono transition-all ${
                    diceCount === cnt
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-md scale-105'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {cnt} {cnt === 1 ? 'Die' : 'Dice'}
                  {cnt === 3 && ' ⭐'}
                </button>
              ))}
            </div>
          </div>

          {/* Dice Predictions Selection Grid */}
          <div className="w-full flex flex-col items-center gap-2">
            <span className="text-xs font-['Outfit'] font-black text-amber-300">
              Pick Your Lucky Number for Each Die (1 to 6)
            </span>

            <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-2.5 max-h-[46vh] overflow-y-auto px-1">
              {Array.from({ length: diceCount }).map((_, idx) => (
                <div
                  key={idx}
                  className="bg-slate-950/80 border-2 border-slate-800 rounded-2xl p-2.5 flex flex-col items-center gap-2 shadow-inner"
                >
                  <span className="text-[11px] font-mono text-slate-400 font-bold">
                    Die #{idx + 1} Target
                  </span>

                  {/* Active Selected Die Preview */}
                  <DiceFace
                    value={selectedGuesses[idx] || 1}
                    size="md"
                    color={idx % 2 === 0 ? 'amber' : 'cyan'}
                  />

                  {/* 1 to 6 Number Pick Buttons */}
                  <div className="grid grid-cols-6 gap-1 w-full pt-1">
                    {[1, 2, 3, 4, 5, 6].map((num) => (
                      <button
                        key={num}
                        onClick={() => handleSelectNumber(idx, num)}
                        className={`h-7 rounded-lg text-xs font-black font-mono flex items-center justify-center transition-all ${
                          selectedGuesses[idx] === num
                            ? 'bg-amber-400 text-slate-950 font-black scale-110 shadow-md border border-white'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons: Quick Random & Lock Picks */}
          <div className="w-full flex items-center gap-2 pt-1">
            <button
              onClick={handleRandomizeAll}
              className="flex-1 h-12 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 text-xs font-black font-mono text-slate-200 flex items-center justify-center gap-1.5 shadow-md transition-all cursor-pointer"
            >
              <RefreshCw className="w-4 h-4 text-cyan-400" />
              <span>RANDOMIZE</span>
            </button>

            <button
              onClick={handleLockPredictions}
              className="flex-[2] h-12 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:brightness-110 active:scale-95 text-xs font-black font-mono text-slate-950 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/30 transition-all cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              <span>LOCK PREDICTIONS ({diceCount} DICE)</span>
            </button>
          </div>
        </div>
      ) : (
        /* --- PHASE 2: 3D TUMBLING DICE ARENA --- */
        <div className="w-full bg-gradient-to-b from-slate-900 via-[#0a1612] to-slate-950 border-4 border-emerald-900/60 rounded-3xl p-3 shadow-2xl flex flex-col items-center gap-3 relative overflow-hidden">
          {/* Cyber Felt Table Surface Lighting & Grid */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.12)_0%,_transparent_75%)] pointer-events-none" />

          {/* Top: Opponent's Dice Predictions Bar */}
          <div className="w-full bg-slate-950/70 border border-slate-800/80 rounded-2xl p-2 flex flex-col gap-1 z-10">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 px-1">
              <span className="font-bold flex items-center gap-1 text-cyan-400">
                <span>{oppUid === playerUid ? 'YOU' : p2Nickname}</span>
                {oppCleared.every(Boolean) && <Crown className="w-3.5 h-3.5 text-amber-400" />}
              </span>
              <span>{oppCleared.filter(Boolean).length} / {diceCount} Cleared</span>
            </div>
            <div className="flex items-center justify-center gap-2 py-0.5">
              {Array.from({ length: diceCount }).map((_, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col items-center p-1.5 rounded-xl border transition-all ${
                    oppCleared[idx]
                      ? 'bg-emerald-950/60 border-emerald-500 shadow-md shadow-emerald-500/20'
                      : 'bg-slate-900 border-slate-800'
                  }`}
                >
                  <span className="text-[9px] font-mono text-slate-400">#{idx + 1}</span>
                  <span className="text-sm font-black font-['Outfit'] text-cyan-300">
                    {oppGuesses ? oppGuesses[idx] : '?'}
                  </span>
                  <span className="text-[8px] font-mono font-bold mt-0.5 text-slate-400">
                    {oppCleared[idx] ? '✓ DONE' : 'WAIT'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Center 3D Dice Tray Table */}
          <div className="w-full min-h-[170px] bg-slate-950/90 border-2 border-emerald-500/40 rounded-2xl p-4 flex flex-col items-center justify-center shadow-inner relative z-10">
            <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 font-bold mb-3">
              🎲 Live 3D Dice Tray 🎲
            </span>

            {/* Tumbling 3D Dice Display */}
            <div className="flex items-center justify-center gap-4 flex-wrap">
              {displayRoll.map((val, idx) => (
                <div key={idx} className="flex flex-col items-center gap-1">
                  <DiceFace
                    value={val}
                    size="lg"
                    color={idx % 2 === 0 ? 'amber' : 'cyan'}
                    isRolling={isSpinning}
                    isCleared={myCleared[idx] || oppCleared[idx]}
                  />
                  <span className="text-[10px] font-mono text-slate-400 font-bold">
                    Die #{idx + 1}
                  </span>
                </div>
              ))}
            </div>

            {/* Live Match Notification */}
            {gameState.recentMatches && gameState.recentMatches.length > 0 && !isSpinning && (
              <div className="mt-2 text-xs font-black font-['Outfit'] text-amber-300 flex items-center gap-1 animate-bounce">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>MATCH! Die #{gameState.recentMatches[0].dieIndex + 1} Cleared!</span>
              </div>
            )}
          </div>

          {/* Bottom: Player's Own Target Predictions Bar */}
          <div className="w-full bg-slate-950/70 border border-slate-800/80 rounded-2xl p-2 flex flex-col gap-1 z-10">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 px-1">
              <span className="font-bold flex items-center gap-1 text-amber-400">
                <span>{p1Uid === playerUid ? 'YOUR TARGETS' : p1Nickname}</span>
                {myCleared.every(Boolean) && <Crown className="w-3.5 h-3.5 text-amber-400" />}
              </span>
              <span>{myCleared.filter(Boolean).length} / {diceCount} Cleared</span>
            </div>
            <div className="flex items-center justify-center gap-2 py-0.5">
              {Array.from({ length: diceCount }).map((_, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col items-center p-1.5 rounded-xl border transition-all ${
                    myCleared[idx]
                      ? 'bg-emerald-950/60 border-emerald-500 shadow-md shadow-emerald-500/20'
                      : 'bg-slate-900 border-slate-800'
                  }`}
                >
                  <span className="text-[9px] font-mono text-slate-400">#{idx + 1}</span>
                  <span className="text-sm font-black font-['Outfit'] text-amber-300">
                    {myGuesses ? myGuesses[idx] : selectedGuesses[idx]}
                  </span>
                  <span className="text-[8px] font-mono font-bold mt-0.5 text-slate-400">
                    {myCleared[idx] ? '✓ DONE' : 'WAIT'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Active Turn Indicator & Big Tactile Roll Button */}
          <div className="w-full flex flex-col items-center gap-2 pt-1 z-10">
            {gameState.phase === 'rolling' && (
              <>
                {isMyTurn ? (
                  <button
                    onClick={handleRollDice}
                    disabled={isSpinning}
                    className="w-full h-14 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-400 hover:brightness-110 active:scale-95 text-slate-950 font-black font-['Outfit'] text-lg flex items-center justify-center gap-2.5 shadow-xl shadow-amber-500/30 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Dices className={`w-6 h-6 ${isSpinning ? 'animate-spin' : ''}`} />
                    <span>{isSpinning ? 'TUMBLING DICE...' : '🎲 SPIN / ROLL DICE!'}</span>
                  </button>
                ) : (
                  <div className="w-full h-14 rounded-2xl bg-slate-900/90 border-2 border-slate-700 flex items-center justify-center gap-2 text-cyan-300 font-mono text-sm font-bold shadow-md">
                    <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                    <span>{isBotPlaying ? 'CyberBot is shaking the dice...' : 'Waiting for opponent to roll...'}</span>
                  </div>
                )}
              </>
            )}

            {/* Round Over Victory Overlay Banner */}
            {gameState.phase === 'round_end' && gameState.roundWinnerUid && (
              <div className="w-full p-4 rounded-2xl bg-gradient-to-r from-amber-600/90 via-yellow-500/90 to-amber-600/90 border-2 border-amber-300 text-slate-950 flex flex-col items-center justify-center gap-1 shadow-2xl animate-fade-in text-center">
                <Trophy className="w-10 h-10 text-slate-950 animate-bounce" />
                <h3 className="text-2xl font-black font-['Outfit'] tracking-wide">
                  {gameState.roundWinnerUid === playerUid
                    ? '🎉 YOU WIN THE ROUND!'
                    : `👑 ${room.players[gameState.roundWinnerUid]?.nickname || 'OPPONENT'} WINS!`}
                </h3>
                <p className="text-xs font-mono font-bold text-slate-900">
                  All {diceCount} dice successfully cleared! Next round starts shortly...
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer Instructions Tip */}
      <p className="text-[10px] text-slate-400 font-mono text-center pt-0.5">
        🎯 Match your secret predicted numbers to clear each die • Clear all dice first to win!
      </p>
    </div>
  );
};
