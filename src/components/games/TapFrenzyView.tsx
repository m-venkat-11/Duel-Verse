import React, { useState, useEffect, useRef } from 'react';
import type { AuthoritativeRoomState } from '../../types/room';
import type { TapFrenzyState } from '../../engine/tapFrenzyEngine';
import { soundService } from '../../services/sound';
import { Zap, Flame, Trophy, Sparkles } from 'lucide-react';

interface TapFrenzyViewProps {
  room: AuthoritativeRoomState<TapFrenzyState>;
  playerUid: string;
  onDispatchAction: (type: string, payload: any) => void;
}

interface TapRipple {
  id: string;
  x: number;
  y: number;
  color: string;
}

export const TapFrenzyView: React.FC<TapFrenzyViewProps> = ({
  room,
  playerUid,
  onDispatchAction
}) => {
  const gameState = room.gameState;
  const players = Object.keys(room.players);
  const p1Uid = players[0] || 'p1';
  const p2Uid = players[1] || 'p2';
  const isP1 = playerUid === p1Uid;
  const isHost = room.hostUid === playerUid;
  const isBotPlaying = Boolean(room.players['bot_rival'] || p2Uid === 'bot_rival');

  const p1Nickname = room.players[p1Uid]?.nickname || 'Player 1';
  const p2Nickname = room.players[p2Uid]?.nickname || 'CyberBot AI';

  const [ripples, setRipples] = useState<TapRipple[]>([]);
  const [tapScale, setTapScale] = useState<boolean>(false);
  const [myCps, setMyCps] = useState<number>(0);
  const [isFrenzy, setIsFrenzy] = useState<boolean>(false);

  // CPS tracker
  const tapTimestampsRef = useRef<number[]>([]);

  // Tug of war position: -100 (P1 win) to +100 (P2 win)
  const pos = gameState.tugPosition || 0;
  // Normalized 0 to 100% for progress bar (50% is center)
  // When pos = -100, p1Percent = 100%, p2Percent = 0%
  const p1Percent = Math.max(0, Math.min(100, 50 - (pos / 2)));
  const p2Percent = 100 - p1Percent;

  const handleTap = (e?: React.PointerEvent) => {
    if (gameState.roundWinner !== null) return;

    const now = Date.now();
    tapTimestampsRef.current.push(now);
    // Keep timestamps from last 1 second
    tapTimestampsRef.current = tapTimestampsRef.current.filter((t) => now - t <= 1000);
    const cps = tapTimestampsRef.current.length;
    setMyCps(cps);

    const frenzy = cps >= 6;
    setIsFrenzy(frenzy);

    // Visual ripple effect
    const rippleId = Math.random().toString(36).substring(2, 9);
    const rx = e ? e.nativeEvent.offsetX : 50;
    const ry = e ? e.nativeEvent.offsetY : 50;
    setRipples((prev) => [...prev.slice(-6), {
      id: rippleId,
      x: rx,
      y: ry,
      color: isP1 ? '#f59e0b' : '#06b6d4'
    }]);
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== rippleId));
    }, 450);

    setTapScale(true);
    setTimeout(() => setTapScale(false), 80);

    soundService.playScore();

    // Multiplier bonus if in Frenzy state
    const multiplier = frenzy ? 1.5 : 1.0;
    onDispatchAction('TAP_WAR_MASH', { playerUid, p1Uid, multiplier });
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isP1 && (e.key === ' ' || e.key.toLowerCase() === 'w' || e.key.toLowerCase() === 'a')) {
        e.preventDefault();
        handleTap();
      } else if (!isP1 && (e.key === 'Enter' || e.key === 'ArrowUp' || e.key.toLowerCase() === 'l')) {
        e.preventDefault();
        handleTap();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isP1, gameState.roundWinner]);

  // CyberBot AI Auto-Mashing
  useEffect(() => {
    if (!isHost || !isBotPlaying || gameState.roundWinner !== null) return;

    // Mash speed intervals (every 90ms to 140ms = 7-11 CPS)
    const interval = setInterval(() => {
      if (Math.random() < 0.88) {
        onDispatchAction('TAP_WAR_MASH', { playerUid: p2Uid, p1Uid, multiplier: 1.0 });
      }
    }, 110);

    return () => clearInterval(interval);
  }, [isHost, isBotPlaying, p1Uid, p2Uid, gameState.roundWinner, onDispatchAction]);

  const p1Wins = gameState.scores?.[p1Uid] || 0;
  const p2Wins = gameState.scores?.[p2Uid] || 0;
  const targetWins = gameState.targetWins || 3;

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col items-center select-none gap-3 px-2">
      {/* Target Wins & Round Status Bar */}
      <div className="w-full flex items-center justify-between px-4 py-2 rounded-2xl bg-slate-900/90 border border-slate-700/60 text-xs font-black font-mono shadow-md backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="text-amber-400">{p1Nickname}</span>
          <div className="flex gap-1">
            {Array.from({ length: targetWins }).map((_, i) => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full border transition-all ${
                  i < p1Wins
                    ? 'bg-amber-400 border-amber-300 shadow-[0_0_8px_#f59e0b]'
                    : 'bg-slate-800 border-slate-700'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-600/20 text-violet-300 border border-violet-500/40 font-mono text-[11px]">
          <Zap className="w-3.5 h-3.5 text-violet-400 animate-pulse" />
          <span>ROUND {gameState.roundNumber || 1} • FIRST TO {targetWins}</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {Array.from({ length: targetWins }).map((_, i) => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full border transition-all ${
                  i < p2Wins
                    ? 'bg-cyan-400 border-cyan-300 shadow-[0_0_8px_#06b6d4]'
                    : 'bg-slate-800 border-slate-700'
                }`}
              />
            ))}
          </div>
          <span className="text-cyan-400">{p2Nickname}</span>
        </div>
      </div>

      {/* Central Plasma Tug-of-War Gauge */}
      <div className="w-full p-4 rounded-3xl bg-slate-950/90 border-2 border-violet-500/40 shadow-2xl relative overflow-hidden backdrop-blur-md">
        {/* Glow ambient background */}
        <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 via-transparent to-cyan-500/10 pointer-events-none" />

        <div className="flex items-center justify-between text-xs font-mono font-bold mb-2">
          <span className="text-amber-400 flex items-center gap-1">
            <Flame className="w-4 h-4 text-amber-400 animate-pulse" />
            <span>P1 DOMAIN ({Math.round(p1Percent)}%)</span>
          </span>
          <span className="text-slate-500 text-[11px] uppercase tracking-wider">
            ENERGY TUG-OF-WAR
          </span>
          <span className="text-cyan-400 flex items-center gap-1">
            <span>({Math.round(p2Percent)}%) P2 DOMAIN</span>
            <Sparkles className="w-4 h-4 text-cyan-400 animate-pulse" />
          </span>
        </div>

        {/* Dynamic Dual Energy Beam Tube */}
        <div className="w-full h-8 bg-slate-900 rounded-2xl overflow-hidden p-1 border-2 border-slate-700 relative shadow-inner flex items-center">
          {/* P1 Energy Beam */}
          <div
            className="h-full bg-gradient-to-r from-amber-600 via-amber-400 to-yellow-300 rounded-l-xl transition-all duration-100 relative shadow-[0_0_20px_#f59e0b]"
            style={{ width: `${p1Percent}%` }}
          />

          {/* Central High-Voltage Core Orb */}
          <div
            className="w-8 h-8 rounded-full bg-white border-2 border-slate-900 shadow-[0_0_25px_#ffffff] -ml-4 z-20 shrink-0 flex items-center justify-center transition-all duration-100"
            style={{ transform: `scale(${isFrenzy ? 1.25 : 1.0})` }}
          >
            <Zap className="w-4 h-4 text-slate-950 fill-current animate-bounce" />
          </div>

          {/* P2 Energy Beam */}
          <div
            className="h-full bg-gradient-to-r from-cyan-300 via-cyan-400 to-blue-600 rounded-r-xl transition-all duration-100 relative shadow-[0_0_20px_#06b6d4]"
            style={{ width: `${p2Percent}%` }}
          />
        </div>

        {/* Win threshold indicators */}
        <div className="flex items-center justify-between text-[10px] font-mono font-bold text-slate-500 mt-2 px-1">
          <span className="text-amber-400/80">◀ P1 WIN GOAL</span>
          <span className="text-slate-600">CENTER</span>
          <span className="text-cyan-400/80">P2 WIN GOAL ▶</span>
        </div>
      </div>

      {/* Round Over Banner */}
      {gameState.roundWinner && (
        <div className="w-full py-3 px-4 rounded-2xl bg-amber-500/20 border-2 border-amber-400 text-amber-300 text-center font-['Outfit'] font-black text-lg animate-bounce shadow-xl">
          🏆 {gameState.roundWinner === p1Uid ? p1Nickname : p2Nickname} WON THE ROUND!
        </div>
      )}

      {/* Massive Tactile Arcade Smash Button */}
      <div className="w-full pt-1 flex flex-col items-center">
        <button
          onPointerDown={handleTap}
          disabled={gameState.roundWinner !== null}
          className={`w-full h-44 sm:h-52 rounded-3xl relative overflow-hidden transition-all duration-75 shadow-2xl active:scale-95 border-4 select-none ${
            isP1
              ? 'bg-gradient-to-b from-amber-500 via-orange-500 to-amber-700 border-amber-300 shadow-amber-500/40'
              : 'bg-gradient-to-b from-cyan-400 via-sky-500 to-blue-700 border-cyan-200 shadow-cyan-500/40'
          } ${tapScale ? 'scale-[0.98] brightness-125' : 'scale-100'}`}
        >
          {/* Specular gloss top light */}
          <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/35 to-transparent pointer-events-none" />

          {/* Ripples on tap */}
          {ripples.map((rip) => (
            <span
              key={rip.id}
              className="absolute w-28 h-28 rounded-full bg-white/40 pointer-events-none animate-ping -translate-x-1/2 -translate-y-1/2"
              style={{ left: rip.x, top: rip.y }}
            />
          ))}

          {/* Button Content */}
          <div className="relative z-10 flex flex-col items-center justify-center h-full gap-1">
            <span className="text-4xl sm:text-5xl drop-shadow-md">
              {isP1 ? '🔥' : '⚡'}
            </span>
            <span className="text-2xl sm:text-3xl font-black font-['Outfit'] tracking-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)]">
              MASH TO PUSH!
            </span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs font-black font-mono px-3 py-1 rounded-full bg-black/40 text-white backdrop-blur-md border border-white/20">
                SPEED: {myCps} CPS
              </span>
              {isFrenzy && (
                <span className="text-xs font-black font-mono px-2.5 py-1 rounded-full bg-amber-400 text-slate-950 animate-pulse font-extrabold shadow-lg">
                  ⚡ 1.5x FRENZY!
                </span>
              )}
            </div>
          </div>
        </button>

        <p className="text-xs text-slate-400 font-mono mt-2 text-center">
          📱 Mobile: Tap button as fast as you can • ⌨️ Desktop: Space or Enter key
        </p>
      </div>
    </div>
  );
};
