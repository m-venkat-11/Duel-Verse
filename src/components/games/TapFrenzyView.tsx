import React, { useState, useEffect, useRef } from 'react';
import type { AuthoritativeRoomState } from '../../types/room';
import type { TapFrenzyState } from '../../engine/tapFrenzyEngine';
import { GameLoop } from '../../engine/core/GameLoop';
import { CanvasManager } from '../../engine/core/CanvasManager';
import { JuiceEngine } from '../../engine/core/JuiceEngine';
import { soundService } from '../../services/sound';
import { Zap, Flame, Sparkles, Clock } from 'lucide-react';

interface TapFrenzyViewProps {
  room: AuthoritativeRoomState<TapFrenzyState>;
  playerUid: string;
  onDispatchAction: (type: string, payload: any) => void;
}

interface Ripple {
  id: number;
  x: number;
  y: number;
}

interface ShockRing {
  x: number;
  y: number;
  r: number;
  maxR: number;
  color: string;
  alpha: number;
}

export const TapFrenzyView: React.FC<TapFrenzyViewProps> = ({ room, playerUid, onDispatchAction }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameState = room.gameState;
  const players = Object.keys(room.players);
  const p1Uid = players[0] || 'p1';
  const p2Uid = players[1] || (p1Uid === 'bot_rival' ? 'player' : 'bot_rival');
  const isP1 = playerUid === p1Uid;
  const isHost = room.hostUid === playerUid;
  const isBotPlaying = Boolean(room.players['bot_rival'] || p2Uid === 'bot_rival' || p2Uid.startsWith('bot_') || players.length < 2);

  const p1Nickname = room.players[p1Uid]?.nickname || 'Player 1';
  const p2Nickname = room.players[p2Uid]?.nickname || 'CyberBot';

  // Refs to prevent stale closures & effect restarts
  const onDispatchActionRef = useRef(onDispatchAction);
  onDispatchActionRef.current = onDispatchAction;
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  const [ripples, setRipples] = useState<Ripple[]>([]);
  const [tapScale, setTapScale] = useState(false);
  const [myCps, setMyCps] = useState(0);
  const [isFrenzy, setIsFrenzy] = useState(false);
  const [timeLeft, setTimeLeft] = useState(25);
  const [goldenBubble, setGoldenBubble] = useState<{ id: number; x: number; y: number } | null>(null);

  const tapTimestampsRef = useRef<number[]>([]);
  const rippleCounterRef = useRef(0);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const goldenRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const goldenIdRef = useRef(0);

  // Canvas animation refs
  const visualTugRef = useRef(0);
  const p1RecoilRef = useRef(0);
  const p2RecoilRef = useRef(0);
  const myFrenzyRef = useRef(false);
  const ringsRef = useRef<ShockRing[]>([]);
  const juiceRef = useRef<JuiceEngine | null>(null);

  const pos = gameState.tugPosition ?? 0;
  const p1Percent = Math.max(0, Math.min(100, 50 - pos / 2));
  const p2Percent = 100 - p1Percent;

  // Detect pushes to spawn canvas impact FX for both P1 and P2
  const prevTapsRef = useRef({ p1: gameState.p1Taps || 0, p2: gameState.p2Taps || 0 });
  useEffect(() => {
    const p1T = gameState.p1Taps || 0;
    const p2T = gameState.p2Taps || 0;
    const orbX = 300 + (visualTugRef.current / 100) * 190;

    if (p1T > prevTapsRef.current.p1) {
      p1RecoilRef.current = 1.0;
      ringsRef.current.push({ x: orbX, y: 125, r: 10, maxR: 55, color: '#fbbf24', alpha: 0.9 });
      juiceRef.current?.emitSparks(orbX, 125, 6, '#fbbf24', '#ffffff', 4);
      juiceRef.current?.addTrauma(0.08);
    }
    if (p2T > prevTapsRef.current.p2) {
      p2RecoilRef.current = 1.0;
      ringsRef.current.push({ x: orbX, y: 125, r: 10, maxR: 55, color: '#22d3ee', alpha: 0.9 });
      juiceRef.current?.emitSparks(orbX, 125, 6, '#22d3ee', '#ffffff', 4);
      juiceRef.current?.addTrauma(0.06);
    }
    prevTapsRef.current = { p1: p1T, p2: p2T };
  }, [gameState.p1Taps, gameState.p2Taps]);

  // Round timer countdown + authoritative timeout resolution
  const timeoutSentRef = useRef<number>(0);
  useEffect(() => {
    if (gameState.roundWinner !== null) return;
    const roundDuration = gameState.roundDuration ?? 25;
    const startedAt = gameState.roundStartedAt ?? Date.now();

    const tick = () => {
      const left = Math.max(0, Math.ceil(roundDuration - (Date.now() - startedAt) / 1000));
      setTimeLeft(left);

      if (left === 0 && isHost && Math.abs(gameStateRef.current.tugPosition) >= 0.01) {
        const rn = gameStateRef.current.roundNumber || 1;
        if (timeoutSentRef.current !== rn) {
          timeoutSentRef.current = rn;
          onDispatchActionRef.current('TAP_WAR_TIMEOUT', { actingUid: playerUid });
        }
      }
    };

    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [gameState.roundWinner, gameState.roundStartedAt, gameState.roundNumber, isHost, playerUid]);

  // Decay CPS display when player stops tapping
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      tapTimestampsRef.current = tapTimestampsRef.current.filter((t) => now - t <= 1000);
      const cps = tapTimestampsRef.current.length;
      setMyCps(cps);
      const frenzy = cps >= 6;
      setIsFrenzy(frenzy);
      myFrenzyRef.current = frenzy;
    }, 150);
    return () => clearInterval(id);
  }, []);

  // Golden 3X Surge Orb spawner
  useEffect(() => {
    if (gameState.roundWinner !== null) {
      goldenRef.current = null;
      setGoldenBubble(null);
      return;
    }
    const id = setInterval(() => {
      if (!goldenRef.current && Math.random() < 0.7) {
        const bubble = {
          id: ++goldenIdRef.current,
          x: 15 + Math.random() * 68,
          y: 18 + Math.random() * 52
        };
        goldenRef.current = bubble;
        setGoldenBubble(bubble);
        setTimeout(() => {
          if (goldenRef.current?.id === bubble.id) {
            goldenRef.current = null;
            setGoldenBubble(null);
          }
        }, 2100);
      }
    }, 3000);
    return () => clearInterval(id);
  }, [gameState.roundWinner]);

  // 60 FPS Plasma Beam Clash Arena Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasMgr = new CanvasManager(canvas);
    const juice = new JuiceEngine(280);
    juiceRef.current = juice;

    const W = 600;
    const H = 250;
    let animTime = 0;

    const update = (dt: number) => {
      const cdt = Math.min(0.05, dt);
      animTime += cdt;
      juice.update(cdt);

      const targetTug = gameStateRef.current.tugPosition ?? 0;
      visualTugRef.current += (targetTug - visualTugRef.current) * Math.min(1, 18 * cdt);

      p1RecoilRef.current = Math.max(0, p1RecoilRef.current - cdt * 5);
      p2RecoilRef.current = Math.max(0, p2RecoilRef.current - cdt * 5);

      for (let i = ringsRef.current.length - 1; i >= 0; i--) {
        const ring = ringsRef.current[i];
        ring.r += cdt * 150;
        ring.alpha -= cdt * 2.2;
        if (ring.alpha <= 0 || ring.r >= ring.maxR) {
          ringsRef.current.splice(i, 1);
        }
      }
    };

    const drawMechStriker = (
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      facingRight: boolean,
      primary: string,
      glow: string,
      recoil: number,
      overdrive: boolean
    ) => {
      ctx.save();
      const recX = (facingRight ? -1 : 1) * recoil * 8;
      const hoverY = Math.sin(animTime * 6 + (facingRight ? 0 : 2)) * 3;
      ctx.translate(x + recX, y + hoverY);
      if (!facingRight) ctx.scale(-1, 1);

      // Overdrive aura
      if (overdrive) {
        ctx.strokeStyle = glow;
        ctx.lineWidth = 2.5;
        ctx.globalAlpha = 0.55 + Math.sin(animTime * 20) * 0.25;
        ctx.beginPath();
        ctx.arc(0, 0, 42 + Math.sin(animTime * 18) * 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Thruster back flame
      const flameLen = 14 + Math.random() * 10 + recoil * 8;
      const flameGrad = ctx.createLinearGradient(-22, 0, -22 - flameLen, 0);
      flameGrad.addColorStop(0, '#ffffff');
      flameGrad.addColorStop(0.4, glow);
      flameGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = flameGrad;
      ctx.beginPath();
      ctx.moveTo(-22, -8);
      ctx.lineTo(-22 - flameLen, 0);
      ctx.lineTo(-22, 8);
      ctx.closePath();
      ctx.fill();

      // Armored Mech Body
      ctx.shadowColor = primary;
      ctx.shadowBlur = 16;
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = primary;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-22, -22);
      ctx.lineTo(14, -26);
      ctx.lineTo(28, -10);
      ctx.lineTo(28, 10);
      ctx.lineTo(14, 26);
      ctx.lineTo(-22, 22);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Energy Cannon Barrel
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = glow;
      ctx.lineWidth = 2;
      ctx.fillRect(14, -9, 26, 18);
      ctx.strokeRect(14, -9, 26, 18);

      // Glowing Core Visor
      ctx.fillStyle = glow;
      ctx.shadowColor = glow;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(2, -2, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.restore();
    };

    const render = () => {
      const ctx = canvasMgr.ctx;
      ctx.clearRect(0, 0, canvasMgr.width, canvasMgr.height);
      ctx.save();
      ctx.translate(juice.offsetX, juice.offsetY);

      const scaleX = canvasMgr.width / W;
      const scaleY = canvasMgr.height / H;
      ctx.scale(scaleX, scaleY);

      // 1. Cyber Reactor Stage Background
      const bg = ctx.createLinearGradient(0, 0, W, 0);
      bg.addColorStop(0, '#1e1003');
      bg.addColorStop(0.5, '#070b18');
      bg.addColorStop(1, '#041c2c');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Floor perspective grid
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
      ctx.lineWidth = 1;
      for (let gx = 0; gx <= W; gx += 30) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, H);
        ctx.stroke();
      }
      for (let gy = 25; gy < H; gy += 30) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(W, gy);
        ctx.stroke();
      }

      // Goal Threshold Zones (Left = P2 pushes P1 out? Wait: P1 pushes tugPosition NEGATIVE toward left, OR P1 wins at -100!)
      // Remember gauge: P1 fills LEFT side (width = 50 - pos/2). When pos = -100, P1 bar is 100% reaching RIGHT!
      // Visually: orb moves RIGHT toward P2's reactor when P1 dominates, and moves LEFT toward P1's reactor when P2 dominates!
      const orbX = 300 + (-visualTugRef.current / 100) * 185;
      const beamY = 125;

      // Danger Zone glow behind losing reactor
      if (visualTugRef.current < -35) {
        ctx.fillStyle = `rgba(245, 158, 11, ${Math.min(0.28, (-visualTugRef.current - 35) / 250)})`;
        ctx.fillRect(460, 0, 140, H);
      } else if (visualTugRef.current > 35) {
        ctx.fillStyle = `rgba(6, 182, 212, ${Math.min(0.28, (visualTugRef.current - 35) / 250)})`;
        ctx.fillRect(0, 0, 140, H);
      }

      // Goal lines on track
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(115, 25);
      ctx.lineTo(115, H - 25);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(6, 182, 212, 0.35)';
      ctx.beginPath();
      ctx.moveTo(485, 25);
      ctx.lineTo(485, H - 25);
      ctx.stroke();

      // Center equilibrium line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.beginPath();
      ctx.moveTo(300, 35);
      ctx.lineTo(300, H - 35);
      ctx.stroke();
      ctx.setLineDash([]);

      // 2. Colliding Plasma Beams!
      const p1Thick = 16 + p1RecoilRef.current * 10 + (myFrenzyRef.current && isP1 ? 6 : 0);
      const p2Thick = 16 + p2RecoilRef.current * 10 + (myFrenzyRef.current && !isP1 ? 6 : 0);

      // P1 Amber Beam (x=90 -> orbX)
      ctx.save();
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 22;
      ctx.fillStyle = 'rgba(245, 158, 11, 0.45)';
      ctx.fillRect(88, beamY - p1Thick, Math.max(4, orbX - 88), p1Thick * 2);
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(88, beamY - p1Thick * 0.42, Math.max(4, orbX - 88), p1Thick * 0.84);
      ctx.restore();

      // P2 Cyan Beam (orbX -> x=512)
      ctx.save();
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 22;
      ctx.fillStyle = 'rgba(6, 182, 212, 0.45)';
      ctx.fillRect(orbX, beamY - p2Thick, Math.max(4, 512 - orbX), p2Thick * 2);
      ctx.fillStyle = '#cffafe';
      ctx.fillRect(orbX, beamY - p2Thick * 0.42, Math.max(4, 512 - orbX), p2Thick * 0.84);
      ctx.restore();

      // Crackling lightning arcs along beams
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.6;
      ctx.globalAlpha = 0.7;
      for (let b = 0; b < 2; b++) {
        ctx.beginPath();
        const startX = b === 0 ? 92 : orbX;
        const endX = b === 0 ? orbX : 508;
        ctx.moveTo(startX, beamY);
        const steps = 6;
        for (let s = 1; s < steps; s++) {
          const sx = startX + ((endX - startX) * s) / steps;
          const sy = beamY + (Math.random() - 0.5) * 26;
          ctx.lineTo(sx, sy);
        }
        ctx.lineTo(endX, beamY);
        ctx.stroke();
      }
      ctx.restore();

      // 3. Shockwave Rings at Clash Orb
      for (const ring of ringsRef.current) {
        ctx.save();
        ctx.strokeStyle = ring.color;
        ctx.globalAlpha = ring.alpha;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // 4. Volatile Clash Core Orb
      const orbRadius = 24 + Math.sin(animTime * 28) * 3 + (p1RecoilRef.current + p2RecoilRef.current) * 4;
      const orbGrad = ctx.createRadialGradient(orbX, beamY, 2, orbX, beamY, orbRadius * 1.4);
      orbGrad.addColorStop(0, '#ffffff');
      orbGrad.addColorStop(0.45, visualTugRef.current <= 0 ? '#fbbf24' : '#22d3ee');
      orbGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = orbGrad;
      ctx.beginPath();
      ctx.arc(orbX, beamY, orbRadius * 1.4, 0, Math.PI * 2);
      ctx.fill();

      // 5. Cyber-Mech Strikers on Left & Right
      drawMechStriker(ctx, 56, beamY, true, '#f59e0b', '#fbbf24', p1RecoilRef.current, isP1 && myFrenzyRef.current);
      drawMechStriker(ctx, 544, beamY, false, '#06b6d4', '#22d3ee', p2RecoilRef.current, !isP1 && myFrenzyRef.current);

      // 6. Power Percentage & Arena Labels
      ctx.fillStyle = '#fbbf24';
      ctx.font = '900 12px "Outfit", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`🔥 ${p1Nickname.slice(0, 10).toUpperCase()}`, 14, 24);

      ctx.fillStyle = '#22d3ee';
      ctx.textAlign = 'right';
      ctx.fillText(`${p2Nickname.slice(0, 10).toUpperCase()} ⚡`, W - 14, 24);

      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('PUSH ORB PAST ENEMY GOAL LINE!', W / 2, H - 12);

      juice.renderParticles(ctx, 1.0);

      // Round Winner Overlay
      if (gameStateRef.current.roundWinner) {
        const wUid = gameStateRef.current.roundWinner;
        const wName = wUid === p1Uid ? p1Nickname : p2Nickname;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = wUid === p1Uid ? '#fbbf24' : '#22d3ee';
        ctx.font = '900 30px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 18;
        ctx.fillText(`⚡ ${wName.toUpperCase()} OVERPOWERED!`, W / 2, H / 2 + 8);
        ctx.shadowBlur = 0;
      }

      ctx.restore();
    };

    const loop = new GameLoop({ update, render });
    loop.start();

    return () => {
      loop.stop();
    };
  }, [p1Uid, p1Nickname, p2Nickname, isP1]);

  const handleTap = (e?: React.PointerEvent<HTMLButtonElement>) => {
    if (gameStateRef.current.roundWinner !== null) return;

    const now = Date.now();
    tapTimestampsRef.current.push(now);
    tapTimestampsRef.current = tapTimestampsRef.current.filter((t) => now - t <= 1000);
    const cps = tapTimestampsRef.current.length;
    setMyCps(cps);
    const frenzy = cps >= 6;
    setIsFrenzy(frenzy);
    myFrenzyRef.current = frenzy;

    if (e && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const rx = ((e.clientX - rect.left) / rect.width) * 100;
      const ry = ((e.clientY - rect.top) / rect.height) * 100;
      const rid = ++rippleCounterRef.current;
      setRipples((prev) => [...prev.slice(-5), { id: rid, x: rx, y: ry }]);
      setTimeout(() => setRipples((prev) => prev.filter((r) => r.id !== rid)), 420);
    }

    setTapScale(true);
    setTimeout(() => setTapScale(false), 75);

    soundService.playImpact(frenzy ? 1.15 : 0.85);
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(10);
      } catch {}
    }

    const multiplier = frenzy ? 1.5 : 1.0;
    onDispatchActionRef.current('TAP_WAR_MASH', {
      playerUid,
      actingUid: playerUid,
      p1Uid,
      multiplier
    });
  };

  const handlePopGolden = (e: React.PointerEvent | React.MouseEvent) => {
    e.stopPropagation();
    if (!goldenRef.current || gameStateRef.current.roundWinner !== null) return;
    goldenRef.current = null;
    setGoldenBubble(null);
    soundService.playGoal();
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(45);
      } catch {}
    }
    onDispatchActionRef.current('TAP_WAR_MASH', {
      playerUid,
      actingUid: playerUid,
      p1Uid,
      multiplier: 3.2
    });
  };

  // Keyboard controls
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
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
  }, [isP1]);

  // CyberBot AI balanced mashing (~4.5 CPS, never restarts interval on tap!)
  useEffect(() => {
    if (!isHost || !isBotPlaying || gameState.roundWinner !== null) return;
    const id = setInterval(() => {
      if (gameStateRef.current.roundWinner !== null) return;
      if (Math.random() < 0.7) {
        onDispatchActionRef.current('TAP_WAR_MASH', {
          playerUid: p2Uid,
          actingUid: p2Uid,
          p1Uid,
          multiplier: 1.0
        });
      }
    }, 155);
    return () => clearInterval(id);
  }, [isHost, isBotPlaying, p1Uid, p2Uid, gameState.roundWinner]);

  const p1Wins = room.scores[p1Uid] ?? gameState.scores?.[p1Uid] ?? 0;
  const p2Wins = room.scores[p2Uid] ?? gameState.scores?.[p2Uid] ?? 0;
  const targetWins = room.maxRounds || gameState.targetWins || 3;

  const cpsMax = 12;
  const cpsBars = Math.min(cpsMax, myCps);
  const isOvertime = timeLeft === 0 && gameState.roundWinner === null;
  const isLastSeconds = timeLeft <= 5 && timeLeft > 0 && gameState.roundWinner === null;

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col items-center select-none gap-2.5 px-2">
      {/* Top Match & Timer Header */}
      <div className="w-full flex items-center justify-between px-3.5 py-2 rounded-2xl bg-slate-900/90 border border-slate-700/60 text-xs font-black font-mono shadow-md backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="text-amber-400 truncate max-w-[75px]">{p1Nickname}</span>
          <div className="flex gap-1">
            {Array.from({ length: targetWins }).map((_, i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full border transition-all ${
                  i < p1Wins
                    ? 'bg-amber-400 border-amber-300 shadow-[0_0_6px_#f59e0b]'
                    : 'bg-slate-800 border-slate-700'
                }`}
              />
            ))}
          </div>
        </div>

        <div
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full border font-mono text-[11px] ${
            isOvertime
              ? 'border-rose-500 bg-rose-500/20 text-rose-300 animate-pulse'
              : isLastSeconds
              ? 'border-amber-500 bg-amber-500/20 text-amber-300 animate-pulse'
              : 'border-violet-500/40 bg-violet-600/20 text-violet-300'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>{isOvertime ? 'SUDDEN DEATH!' : `${timeLeft}s • R${gameState.roundNumber || 1}`}</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {Array.from({ length: targetWins }).map((_, i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full border transition-all ${
                  i < p2Wins
                    ? 'bg-cyan-400 border-cyan-300 shadow-[0_0_6px_#06b6d4]'
                    : 'bg-slate-800 border-slate-700'
                }`}
              />
            ))}
          </div>
          <span className="text-cyan-400 truncate max-w-[75px]">{p2Nickname}</span>
        </div>
      </div>

      {/* 60 FPS Plasma Beam Clash Canvas */}
      <div className="w-full aspect-[600/250] rounded-3xl overflow-hidden shadow-2xl border-2 border-violet-500/40 relative bg-[#070b18]">
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>

      {/* Beam Dominance Bar + CPS Overdrive Meter */}
      <div className="w-full p-2.5 rounded-2xl bg-slate-950/90 border border-slate-800 flex flex-col gap-2">
        <div className="flex items-center justify-between text-[11px] font-mono font-bold">
          <span className="text-amber-400 flex items-center gap-1">
            <Flame className="w-3.5 h-3.5" /> {Math.round(p1Percent)}%
          </span>
          <span className="text-slate-400 text-[10px]">BEAM DOMINANCE</span>
          <span className="text-cyan-400 flex items-center gap-1">
            {Math.round(p2Percent)}% <Sparkles className="w-3.5 h-3.5" />
          </span>
        </div>
        <div className="w-full h-3.5 bg-slate-900 rounded-full overflow-hidden border border-slate-700 flex">
          <div
            className="h-full bg-gradient-to-r from-amber-600 to-yellow-300 transition-all duration-75"
            style={{ width: `${p1Percent}%` }}
          />
          <div
            className="h-full bg-gradient-to-r from-cyan-300 to-blue-600 transition-all duration-75"
            style={{ width: `${p2Percent}%` }}
          />
        </div>

        {/* CPS Meter */}
        <div className="flex items-center gap-2.5 pt-0.5">
          <span className="text-[10px] font-black font-mono text-slate-400">SPEED</span>
          <div className="flex gap-0.5 flex-1">
            {Array.from({ length: cpsMax }).map((_, i) => (
              <div
                key={i}
                className={`flex-1 h-3 rounded-sm transition-all duration-75 ${
                  i < cpsBars
                    ? i < 4
                      ? 'bg-emerald-500'
                      : i < 8
                      ? 'bg-amber-400'
                      : 'bg-rose-500 animate-pulse'
                    : 'bg-slate-800'
                }`}
              />
            ))}
          </div>
          <span
            className={`text-[11px] font-black font-mono w-16 text-right ${
              isFrenzy ? 'text-amber-400 animate-pulse' : 'text-slate-300'
            }`}
          >
            {myCps} CPS{isFrenzy ? ' ⚡' : ''}
          </span>
        </div>
      </div>

      {/* Giant Reactor Mash Pad */}
      <div className="w-full flex flex-col items-center">
        <button
          ref={btnRef}
          onPointerDown={handleTap}
          disabled={gameState.roundWinner !== null}
          className={`w-full h-36 sm:h-40 rounded-3xl relative overflow-hidden transition-all duration-75 shadow-2xl border-4 select-none touch-manipulation cursor-pointer ${
            isP1
              ? 'bg-gradient-to-b from-amber-500 via-orange-500 to-amber-700 border-amber-300 shadow-amber-500/40'
              : 'bg-gradient-to-b from-cyan-400 via-sky-500 to-blue-700 border-cyan-200 shadow-cyan-500/40'
          } ${tapScale ? 'scale-[0.97] brightness-125' : 'scale-100'} ${
            isFrenzy ? 'shadow-[0_0_50px_rgba(245,158,11,0.7)]' : ''
          }`}
        >
          <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent pointer-events-none" />

          {/* Golden 3X Surge Orb */}
          {goldenBubble && (
            <div
              onPointerDown={handlePopGolden}
              className="absolute z-30 w-16 h-16 rounded-full bg-gradient-to-tr from-amber-400 via-yellow-200 to-white border-2 border-white shadow-[0_0_30px_#fbbf24] flex flex-col items-center justify-center font-black font-['Outfit'] text-slate-950 text-xs animate-bounce cursor-pointer active:scale-125 transition-transform"
              style={{ left: `${goldenBubble.x}%`, top: `${goldenBubble.y}%` }}
            >
              <span className="text-[9px] text-rose-700 font-extrabold">SURGE</span>
              <span className="text-sm font-black leading-none">3X!</span>
            </div>
          )}

          {/* Pointer Ripples */}
          {ripples.map((rip) => (
            <span
              key={rip.id}
              className="absolute w-24 h-24 rounded-full bg-white/40 pointer-events-none animate-ping -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${rip.x}%`, top: `${rip.y}%` }}
            />
          ))}

          <div className="relative z-10 flex flex-col items-center justify-center h-full gap-1">
            <div className="flex items-center gap-2">
              <Zap className="w-8 h-8 text-white drop-shadow-lg fill-current" />
              <span className="text-2xl sm:text-3xl font-black font-['Outfit'] tracking-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]">
                {gameState.roundWinner ? 'ROUND OVER' : 'TAP TO OVERPOWER!'}
              </span>
            </div>
            {!gameState.roundWinner && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-black font-mono px-3 py-0.5 rounded-full bg-black/40 text-white border border-white/20">
                  {myCps} CPS
                </span>
                {isFrenzy && (
                  <span className="text-xs font-black font-mono px-2.5 py-0.5 rounded-full bg-amber-300 text-slate-950 animate-pulse font-extrabold">
                    ⚡ 1.5× BEAM FRENZY!
                  </span>
                )}
              </div>
            )}
          </div>
        </button>

        <p className="text-[11px] text-slate-400 font-mono mt-1.5 text-center">
          📱 Tap rapidly • Catch glowing 3X orbs • ⌨️ Desktop: Space or W/Enter
        </p>
      </div>
    </div>
  );
};
