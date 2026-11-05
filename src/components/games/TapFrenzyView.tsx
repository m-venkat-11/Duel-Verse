import React, { useState, useEffect, useRef } from 'react';
import type { AuthoritativeRoomState } from '../../types/room';
import type { TapFrenzyState } from '../../engine/tapFrenzyEngine';
import { soundService } from '../../services/sound';
import { Zap, Flame, Sparkles } from 'lucide-react';

interface TapFrenzyViewProps {
  room: AuthoritativeRoomState<TapFrenzyState>;
  playerUid: string;
  onDispatchAction: (type: string, payload: any) => void;
}

interface Ripple { id: number; x: number; y: number; }

export const TapFrenzyView: React.FC<TapFrenzyViewProps> = ({ room, playerUid, onDispatchAction }) => {
  const gameState = room.gameState;
  const players = Object.keys(room.players);
  const p1Uid = players[0] || 'p1';
  const p2Uid = players[1] || 'p2';
  const isP1 = playerUid === p1Uid;
  const isHost = room.hostUid === playerUid;
  const isBotPlaying = Boolean(room.players['bot_rival'] || p2Uid === 'bot_rival');

  const p1Nickname = room.players[p1Uid]?.nickname || 'Player 1';
  const p2Nickname = room.players[p2Uid]?.nickname || 'CyberBot AI';

  const [ripples, setRipples]     = useState<Ripple[]>([]);
  const [tapScale, setTapScale]   = useState(false);
  const [myCps, setMyCps]         = useState(0);
  const [isFrenzy, setIsFrenzy]   = useState(false);
  const [timeLeft, setTimeLeft]   = useState(30);

  const tapTimestampsRef = useRef<number[]>([]);
  const rippleCounterRef = useRef(0);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const goldenRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const [goldenBubble, setGoldenBubble] = useState<{ id: number; x: number; y: number } | null>(null);
  const goldenIdRef = useRef(0);

  // --- Tug-of-war position ---
  const pos = gameState.tugPosition ?? 0;
  const p1Percent = Math.max(0, Math.min(100, 50 - pos / 2));
  const p2Percent = 100 - p1Percent;

  // --- Round timer countdown ---
  useEffect(() => {
    if (gameState.roundWinner !== null) return;
    const roundDuration: number = (gameState as any).roundDuration ?? 30;
    const startedAt: number = (gameState as any).roundStartedAt ?? Date.now();
    const computeLeft = () => Math.max(0, Math.round(roundDuration - (Date.now() - startedAt) / 1000));
    setTimeLeft(computeLeft());
    const id = setInterval(() => setTimeLeft(computeLeft()), 500);
    return () => clearInterval(id);
  }, [gameState.roundWinner, (gameState as any).roundStartedAt]);

  // --- Golden bubble spawner (using refs to avoid re-render loops) ---
  useEffect(() => {
    if (gameState.roundWinner !== null) return;
    const id = setInterval(() => {
      if (!goldenRef.current && Math.random() < 0.6) {
        const bubble = {
          id: ++goldenIdRef.current,
          x: 15 + Math.random() * 70,
          y: 20 + Math.random() * 55,
        };
        goldenRef.current = bubble;
        setGoldenBubble(bubble);
        setTimeout(() => { goldenRef.current = null; setGoldenBubble(null); }, 2200);
      }
    }, 3200);
    return () => clearInterval(id);
  }, [gameState.roundWinner]);

  const handleTap = (e?: React.PointerEvent<HTMLButtonElement>) => {
    if (gameState.roundWinner !== null) return;

    const now = Date.now();
    tapTimestampsRef.current.push(now);
    tapTimestampsRef.current = tapTimestampsRef.current.filter((t) => now - t <= 1000);
    const cps = tapTimestampsRef.current.length;
    setMyCps(cps);
    const frenzy = cps >= 6;
    setIsFrenzy(frenzy);

    // Accurate ripple coords via getBoundingClientRect
    if (e && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const rx = ((e.clientX - rect.left) / rect.width) * 100;
      const ry = ((e.clientY - rect.top) / rect.height) * 100;
      const rid = ++rippleCounterRef.current;
      setRipples((prev) => [...prev.slice(-5), { id: rid, x: rx, y: ry }]);
      setTimeout(() => setRipples((prev) => prev.filter((r) => r.id !== rid)), 480);
    }

    setTapScale(true);
    setTimeout(() => setTapScale(false), 85);

    soundService.playScore();
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(12); } catch {}
    }
    const multiplier = frenzy ? 1.5 : 1.0;
    onDispatchAction('TAP_WAR_MASH', { playerUid, actingUid: playerUid, p1Uid, multiplier });
  };

  const handlePopGolden = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!goldenRef.current || gameState.roundWinner !== null) return;
    goldenRef.current = null;
    setGoldenBubble(null);
    soundService.playGoal();
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(45); } catch {}
    }
    onDispatchAction('TAP_WAR_MASH', { playerUid, actingUid: playerUid, p1Uid, multiplier: 3.0 });
  };

  // Keyboard controls
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isP1 && (e.key === ' ' || e.key.toLowerCase() === 'w' || e.key.toLowerCase() === 'a')) {
        e.preventDefault();
        handleTap();
      } else if (!isP1 && (e.key === 'Enter' || e.key === 'ArrowUp' || e.key.toLowerCase() === 'l')) {
        e.preventDefault();
        handleTap();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isP1, gameState.roundWinner]);

  // CyberBot AI mashing
  useEffect(() => {
    if (!isHost || !isBotPlaying || gameState.roundWinner !== null) return;
    const id = setInterval(() => {
      if (Math.random() < 0.88)
        onDispatchAction('TAP_WAR_MASH', { playerUid: p2Uid, actingUid: p2Uid, p1Uid, multiplier: 1.0 });
    }, 108);
    return () => clearInterval(id);
  }, [isHost, isBotPlaying, p1Uid, p2Uid, gameState.roundWinner, onDispatchAction]);

  const p1Wins = gameState.scores?.[p1Uid] || 0;
  const p2Wins = gameState.scores?.[p2Uid] || 0;
  const targetWins = room.maxRounds || gameState.targetWins || 3;

  const cpsMax = 12;
  const cpsBars = Math.min(cpsMax, myCps);
  const isLastSeconds = timeLeft <= 5 && gameState.roundWinner === null;

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col items-center select-none gap-3 px-2">

      {/* Wins + Round Status Bar */}
      <div className="w-full flex items-center justify-between px-4 py-2 rounded-2xl bg-slate-900/90 border border-slate-700/60 text-xs font-black font-mono shadow-md backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="text-amber-400 truncate max-w-[70px]">{p1Nickname}</span>
          <div className="flex gap-1">
            {Array.from({ length: targetWins }).map((_, i) => (
              <div key={i} className={`w-3.5 h-3.5 rounded-full border transition-all ${i < p1Wins ? 'bg-amber-400 border-amber-300 shadow-[0_0_6px_#f59e0b]' : 'bg-slate-800 border-slate-700'}`} />
            ))}
          </div>
        </div>

        {/* Timer */}
        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border font-mono text-[11px] transition-all ${
          isLastSeconds ? 'bg-rose-600/30 text-rose-300 border-rose-500/60 animate-pulse' : 'bg-violet-600/20 text-violet-300 border-violet-500/40'
        }`}>
          <Zap className="w-3.5 h-3.5 animate-pulse" />
          <span>⏱ {gameState.roundWinner ? 'DONE' : `${timeLeft}s`}</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {Array.from({ length: targetWins }).map((_, i) => (
              <div key={i} className={`w-3.5 h-3.5 rounded-full border transition-all ${i < p2Wins ? 'bg-cyan-400 border-cyan-300 shadow-[0_0_6px_#06b6d4]' : 'bg-slate-800 border-slate-700'}`} />
            ))}
          </div>
          <span className="text-cyan-400 truncate max-w-[70px]">{p2Nickname}</span>
        </div>
      </div>

      {/* Tug-of-War Plasma Gauge */}
      <div className="w-full p-4 rounded-3xl bg-slate-950/90 border-2 border-violet-500/40 shadow-2xl relative overflow-hidden backdrop-blur-md">
        <div className="absolute inset-0 bg-gradient-to-r from-amber-500/8 via-transparent to-cyan-500/8 pointer-events-none" />

        <div className="flex items-center justify-between text-xs font-mono font-bold mb-2">
          <span className="text-amber-400 flex items-center gap-1">
            <Flame className="w-4 h-4 animate-pulse" />
            P1 ({Math.round(p1Percent)}%)
          </span>
          <span className="text-slate-500 text-[10px] uppercase tracking-widest">ENERGY TUG-OF-WAR</span>
          <span className="text-cyan-400 flex items-center gap-1">
            ({Math.round(p2Percent)}%) P2
            <Sparkles className="w-4 h-4 animate-pulse" />
          </span>
        </div>

        <div className="w-full h-9 bg-slate-900 rounded-2xl overflow-hidden border-2 border-slate-700 relative shadow-inner flex items-center">
          <div
            className="h-full bg-gradient-to-r from-amber-600 via-amber-400 to-yellow-300 rounded-l-xl transition-all duration-75 shadow-[0_0_20px_#f59e0b]"
            style={{ width: `${p1Percent}%` }}
          />
          <div
            className={`w-9 h-9 rounded-full bg-white border-2 border-slate-900 shadow-[0_0_28px_#ffffff] -ml-4 z-20 shrink-0 flex items-center justify-center transition-all duration-75 ${isFrenzy ? 'scale-125' : 'scale-100'}`}
          >
            <Zap className="w-4 h-4 text-slate-950 fill-current animate-bounce" />
          </div>
          <div
            className="h-full bg-gradient-to-r from-cyan-300 via-cyan-400 to-blue-600 rounded-r-xl transition-all duration-75 shadow-[0_0_20px_#06b6d4]"
            style={{ width: `${p2Percent}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-[10px] font-mono font-bold text-slate-500 mt-2 px-1">
          <span className="text-amber-400/80">◀ P1 WIN</span>
          <span className="text-slate-600">CENTER</span>
          <span className="text-cyan-400/80">P2 WIN ▶</span>
        </div>
      </div>

      {/* Round Over Banner */}
      {gameState.roundWinner && (
        <div className="w-full py-3 px-4 rounded-2xl bg-amber-500/20 border-2 border-amber-400 text-amber-300 text-center font-['Outfit'] font-black text-lg animate-bounce shadow-xl">
          🏆 {gameState.roundWinner === p1Uid ? p1Nickname : p2Nickname} WON THE ROUND!
        </div>
      )}

      {/* Last 5s countdown overlay warning */}
      {isLastSeconds && (
        <div className="w-full py-2 px-4 rounded-xl bg-rose-600/20 border border-rose-500/60 text-rose-300 text-center font-black font-mono text-sm animate-pulse">
          🔥 {timeLeft}s LEFT — MASH FASTER!
        </div>
      )}

      {/* CPS Speed Meter */}
      <div className="w-full flex items-center gap-3 px-4 py-2 rounded-2xl bg-slate-900/80 border border-slate-700/50">
        <span className="text-xs font-black font-mono text-slate-400 shrink-0">SPEED</span>
        <div className="flex gap-0.5 flex-1">
          {Array.from({ length: cpsMax }).map((_, i) => (
            <div
              key={i}
              className={`flex-1 h-4 rounded-sm transition-all duration-75 ${
                i < cpsBars
                  ? i < 4  ? 'bg-emerald-500 shadow-[0_0_6px_#10b981]'
                  : i < 8  ? 'bg-amber-400 shadow-[0_0_6px_#f59e0b]'
                           : 'bg-rose-500 shadow-[0_0_6px_#f43f5e] animate-pulse'
                  : 'bg-slate-800'
              }`}
            />
          ))}
        </div>
        <span className={`text-xs font-black font-mono w-14 text-right ${isFrenzy ? 'text-amber-400 animate-pulse' : 'text-slate-300'}`}>
          {myCps} CPS{isFrenzy ? ' ⚡' : ''}
        </span>
      </div>

      {/* Giant Smash Button */}
      <div className="w-full pt-1 flex flex-col items-center">
        <button
          ref={btnRef}
          onPointerDown={handleTap}
          disabled={gameState.roundWinner !== null}
          className={`w-full h-44 sm:h-52 rounded-3xl relative overflow-hidden transition-all duration-75 shadow-2xl active:scale-95 border-4 select-none ${
            isP1
              ? 'bg-gradient-to-b from-amber-500 via-orange-500 to-amber-700 border-amber-300 shadow-amber-500/40'
              : 'bg-gradient-to-b from-cyan-400 via-sky-500 to-blue-700 border-cyan-200 shadow-cyan-500/40'
          } ${tapScale ? 'scale-[0.97] brightness-150' : 'scale-100'}
          ${isFrenzy ? 'shadow-[0_0_60px_rgba(245,158,11,0.6)]' : ''}`}
        >
          {/* Specular highlight */}
          <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent pointer-events-none" />

          {/* Golden 3X Surge Bubble */}
          {goldenBubble && (
            <div
              onClick={handlePopGolden}
              className="absolute z-30 w-16 h-16 rounded-full bg-gradient-to-tr from-amber-400 via-yellow-300 to-white border-2 border-white shadow-[0_0_30px_#fbbf24] flex flex-col items-center justify-center font-black font-['Outfit'] text-slate-950 text-xs animate-bounce cursor-pointer active:scale-125 transition-transform"
              style={{ left: `${goldenBubble.x}%`, top: `${goldenBubble.y}%` }}
            >
              <span className="text-[9px] text-rose-700 font-extrabold">SURGE</span>
              <span className="text-sm font-black leading-none">3X!</span>
            </div>
          )}

          {/* Accurate ripples */}
          {ripples.map((rip) => (
            <span
              key={rip.id}
              className="absolute w-24 h-24 rounded-full bg-white/40 pointer-events-none animate-ping -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${rip.x}%`, top: `${rip.y}%` }}
            />
          ))}

          {/* Button Content */}
          <div className="relative z-10 flex flex-col items-center justify-center h-full gap-1">
            <span className="text-5xl sm:text-6xl drop-shadow-lg">{isP1 ? '🔥' : '⚡'}</span>
            <span className="text-2xl sm:text-3xl font-black font-['Outfit'] tracking-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]">
              {gameState.roundWinner ? 'ROUND OVER' : 'MASH TO PUSH!'}
            </span>
            {!gameState.roundWinner && (
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs font-black font-mono px-3 py-1 rounded-full bg-black/40 text-white backdrop-blur-md border border-white/20`}>
                  {myCps} CPS
                </span>
                {isFrenzy && (
                  <span className="text-xs font-black font-mono px-2.5 py-1 rounded-full bg-amber-400 text-slate-950 animate-pulse font-extrabold shadow-lg">
                    ⚡ 1.5× FRENZY!
                  </span>
                )}
              </div>
            )}
          </div>
        </button>

        <p className="text-xs text-slate-400 font-mono mt-2 text-center">
          📱 Mobile: Tap as fast as you can • ⌨️ Desktop: Space or Enter key
        </p>
      </div>
    </div>
  );
};
