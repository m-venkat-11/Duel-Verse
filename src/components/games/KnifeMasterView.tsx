import React, { useEffect, useRef, useState } from 'react';
import type { AuthoritativeRoomState } from '../../types/room';
import { type KnifeMasterState, type StuckBlade, normalizeAngle, angleDiff } from '../../engine/knifeMasterEngine';
import { soundService } from '../../services/sound';
import { GameLoop } from '../../engine/core/GameLoop';
import { CanvasManager } from '../../engine/core/CanvasManager';
import { JuiceEngine } from '../../engine/core/JuiceEngine';

interface KnifeMasterViewProps {
  room: AuthoritativeRoomState;
  playerUid: string;
  onDispatchAction: (type: string, payload?: any) => void;
}

interface FlyingKnife {
  x: number;
  y: number;
  vy: number;
  ownerUid: string;
  isP1: boolean;
}

interface RicochetKnife {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  vAngle: number;
  isP1: boolean;
  alpha: number;
}

const WHEEL_R = 68;
const KNIFE_COLLISION_TOLERANCE = 0.24;
const THROW_COOLDOWN_MS = 220;

export const KnifeMasterView: React.FC<KnifeMasterViewProps> = ({ room, playerUid, onDispatchAction }) => {
  const gameState = room.gameState as KnifeMasterState;
  const players = Object.keys(room.players);
  const p1Uid = players[0] || playerUid;
  const p2Uid = players[1] || (p1Uid === 'bot_rival' ? 'player' : 'bot_rival');

  const isHost = playerUid === p1Uid;
  const isP1Local = playerUid === p1Uid;
  const isBotPlaying = Boolean(room.players['bot_rival'] || p2Uid === 'bot_rival' || p2Uid.startsWith('bot_') || players.length < 2);

  const p1Nickname = room.players[p1Uid]?.nickname || 'Player 1';
  const p2Nickname = room.players[p2Uid]?.nickname || (isBotPlaying ? 'CyberBot' : 'Player 2');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const juiceRef = useRef(new JuiceEngine());
  const wheelAngleRef = useRef(0);
  const wheelHitPulseRef = useRef(0);
  const flyingKnivesRef = useRef<FlyingKnife[]>([]);
  const ricochetsRef = useRef<RicochetKnife[]>([]);
  const localLastThrowRef = useRef(0);
  const lastProcessedClashRef = useRef(0);
  const prevBladeCountRef = useRef(0);
  const prevRoundRef = useRef(room.currentRound);

  // Ref mirrors to prevent GameLoop/AI restarts on stateVersion changes
  const onDispatchActionRef = useRef(onDispatchAction);
  onDispatchActionRef.current = onDispatchAction;
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;
  const roomStatusRef = useRef(room.status);
  roomStatusRef.current = room.status;
  const botDifficultyRef = useRef(room.gameConfig?.difficulty || 'medium');
  botDifficultyRef.current = room.gameConfig?.difficulty || 'medium';

  const [throwCooldownActive, setThrowCooldownActive] = useState(false);

  // Sync visual feedback on blade count / clash / round reset
  useEffect(() => {
    const blades = gameState?.stuckBlades || [];
    if (room.currentRound !== prevRoundRef.current) {
      prevRoundRef.current = room.currentRound;
      flyingKnivesRef.current = [];
      ricochetsRef.current = [];
      wheelHitPulseRef.current = 0;
    }

    if (blades.length > prevBladeCountRef.current) {
      const added = blades[blades.length - 1];
      wheelHitPulseRef.current = 1;
      const isP1Blade = added?.ownerUid === p1Uid;
      juiceRef.current.addTrauma(0.18);
      juiceRef.current.emitSparks(
        220,
        isP1Blade ? 235 + WHEEL_R : 235 - WHEEL_R,
        10,
        isP1Blade ? '#fbbf24' : '#38bdf8'
      );
    }
    prevBladeCountRef.current = blades.length;

    const clash = gameState?.lastClash;
    if (clash && clash.timestamp > lastProcessedClashRef.current) {
      lastProcessedClashRef.current = clash.timestamp;
      const isP1Clash = clash.playerUid === p1Uid;
      const hitY = isP1Clash ? 235 + WHEEL_R + 18 : 235 - WHEEL_R - 18;
      ricochetsRef.current.push({
        x: 220,
        y: hitY,
        vx: (Math.random() > 0.5 ? 1 : -1) * (240 + Math.random() * 140),
        vy: isP1Clash ? 320 : -320,
        angle: isP1Clash ? 0 : Math.PI,
        vAngle: (Math.random() > 0.5 ? 1 : -1) * 14,
        isP1: isP1Clash,
        alpha: 1,
      });
      juiceRef.current.addTrauma(0.55);
      juiceRef.current.triggerHitStop(70);
      juiceRef.current.emitSparks(220, hitY, 18, '#ef4444', '#fca5a5', 5);
      soundService.playFalseStart();
    }
  }, [gameState?.stuckBlades?.length, gameState?.lastClash?.timestamp, room.currentRound, p1Uid]);

  // Ref-stabilized 60 FPS Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cm = new CanvasManager(canvas);
    const W = 440;
    const H = 470;
    const CX = W / 2;
    const CY = H / 2;

    const drawCyberDagger = (
      ctx: CanvasRenderingContext2D,
      bladeColor: string,
      glowColor: string,
      handleColor: string,
      embeddedDepth = 0
    ) => {
      ctx.save();
      // Dagger drawn pointing UP (-Y) from base, or tip at -embeddedDepth
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 10;

      // Laser-etched tapered blade
      const bladeGrad = ctx.createLinearGradient(-4, -18 + embeddedDepth, 4, 24);
      bladeGrad.addColorStop(0, '#f8fafc');
      bladeGrad.addColorStop(0.55, bladeColor);
      bladeGrad.addColorStop(1, '#334155');
      ctx.fillStyle = bladeGrad;
      ctx.beginPath();
      ctx.moveTo(0, -14 + embeddedDepth);
      ctx.lineTo(5, 16);
      ctx.lineTo(2, 24);
      ctx.lineTo(-2, 24);
      ctx.lineTo(-5, 16);
      ctx.closePath();
      ctx.fill();

      // Center fuller line
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -4 + embeddedDepth);
      ctx.lineTo(0, 18);
      ctx.stroke();

      // Crossguard
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = glowColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-10, 23, 20, 5, 2);
      ctx.fill();
      ctx.stroke();

      // Ergonomic grip
      ctx.fillStyle = handleColor;
      ctx.beginPath();
      ctx.roundRect(-3.5, 28, 7, 20, 2);
      ctx.fill();

      // Pommel core
      ctx.fillStyle = glowColor;
      ctx.beginPath();
      ctx.arc(0, 49, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const loop = new GameLoop({
      update: (dt) => {
        const gs = gameStateRef.current;
        const juice = juiceRef.current;
        juice.update(dt);

        if (wheelHitPulseRef.current > 0) {
          wheelHitPulseRef.current = Math.max(0, wheelHitPulseRef.current - dt * 6);
        }

        if (roomStatusRef.current === 'playing' && gs && !gs.roundWinner) {
          const baseSpeed = gs.rotationSpeed || 2.3;
          // Dynamic arcade cadence: subtly oscillates speed every round >= 2 for extra skill depth
          const roundBoost = 1 + Math.min(0.45, ((gs.roundNumber || 1) - 1) * 0.14);
          const wave = (gs.roundNumber || 1) >= 2 ? Math.sin(performance.now() * 0.0018) * 0.35 : 0;
          wheelAngleRef.current += (baseSpeed * roundBoost + wave) * dt;
        }

        // Advance flying knives with dt scaling (1550 px/sec)
        for (let i = flyingKnivesRef.current.length - 1; i >= 0; i--) {
          const fk = flyingKnivesRef.current[i];
          fk.y += fk.vy * dt;

          const hitBottom = fk.isP1 && fk.y <= CY + WHEEL_R + 12;
          const hitTop = !fk.isP1 && fk.y >= CY - WHEEL_R - 12;

          if (hitBottom || hitTop) {
            flyingKnivesRef.current.splice(i, 1);

            const contactAngle = normalizeAngle((fk.isP1 ? 0 : Math.PI) - wheelAngleRef.current);
            const blades = gs?.stuckBlades || [];
            const clash = blades.some((b) => angleDiff(contactAngle, b.angle) < KNIFE_COLLISION_TOLERANCE);

            if (clash) {
              const hitY = fk.isP1 ? CY + WHEEL_R + 14 : CY - WHEEL_R - 14;
              ricochetsRef.current.push({
                x: fk.x,
                y: hitY,
                vx: (Math.random() > 0.5 ? 1 : -1) * (250 + Math.random() * 140),
                vy: fk.isP1 ? 300 : -300,
                angle: fk.isP1 ? 0 : Math.PI,
                vAngle: (Math.random() > 0.5 ? 1 : -1) * 15,
                isP1: fk.isP1,
                alpha: 1,
              });
              juice.addTrauma(0.5);
              juice.triggerHitStop(60);
              juice.emitSparks(fk.x, hitY, 18, '#ef4444', '#fca5a5', 5);
              soundService.playFalseStart();
            } else {
              wheelHitPulseRef.current = 1;
              juice.addTrauma(0.2);
              juice.emitSparks(fk.x, fk.isP1 ? CY + WHEEL_R : CY - WHEEL_R, 12, fk.isP1 ? '#fbbf24' : '#38bdf8');
              soundService.playImpact();
            }

            if (isHost || fk.ownerUid === playerUid) {
              onDispatchActionRef.current('KNIFE_THROW', {
                playerUid: fk.ownerUid,
                actingUid: fk.ownerUid,
                wheelAngle: wheelAngleRef.current,
              });
            }
          }
        }

        // Update ricochet debris
        for (let i = ricochetsRef.current.length - 1; i >= 0; i--) {
          const r = ricochetsRef.current[i];
          r.x += r.vx * dt;
          r.y += r.vy * dt;
          r.vy += (r.isP1 ? 420 : -420) * dt;
          r.angle += r.vAngle * dt;
          r.alpha -= dt * 1.4;
          if (r.alpha <= 0) ricochetsRef.current.splice(i, 1);
        }
      },
      render: () => {
        const gs = gameStateRef.current;
        const ctx = cm.ctx;
        const scale = cm.width / W;
        const juice = juiceRef.current;

        ctx.save();
        ctx.scale(scale, scale);

        // Forge / Dojo dark arena backdrop
        const bgGrad = ctx.createRadialGradient(CX, CY, 30, CX, CY, 340);
        bgGrad.addColorStop(0, '#131d33');
        bgGrad.addColorStop(0.55, '#090e1a');
        bgGrad.addColorStop(1, '#04060d');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);

        // Tactical targeting grid & vertical trajectory rails
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.05)';
        ctx.lineWidth = 1;
        for (let x = 20; x < W; x += 40) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, H);
          ctx.stroke();
        }
        for (let y = 25; y < H; y += 40) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(W, y);
          ctx.stroke();
        }

        // Center Throw Aim Laser Guide
        ctx.save();
        ctx.setLineDash([4, 6]);
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.18)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(CX, CY + WHEEL_R + 10);
        ctx.lineTo(CX, H - 54);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.18)';
        ctx.beginPath();
        ctx.moveTo(CX, 54);
        ctx.lineTo(CX, CY - WHEEL_R - 10);
        ctx.stroke();
        ctx.restore();

        // Screen shake transform
        ctx.translate(juice.offsetX, juice.offsetY);

        // Subtle aura rings behind the wheel
        ctx.save();
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(CX, CY, WHEEL_R + 54, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([8, 10]);
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.15)';
        ctx.beginPath();
        ctx.arc(CX, CY, WHEEL_R + 30, wheelAngleRef.current * 0.5, wheelAngleRef.current * 0.5 + Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        const pulseScale = 1 + wheelHitPulseRef.current * 0.045;

        // Rotating Wheel & Embedded Knives
        ctx.save();
        ctx.translate(CX, CY);
        ctx.scale(pulseScale, pulseScale);
        ctx.rotate(wheelAngleRef.current);

        // Draw stuck blades BEHIND the rim bevel so they look deeply embedded
        (gs?.stuckBlades || []).forEach((blade: StuckBlade) => {
          ctx.save();
          ctx.rotate(blade.angle);
          ctx.translate(0, WHEEL_R);
          const isObstacle = blade.ownerUid === 'obstacle';
          const isP1 = blade.ownerUid === p1Uid;
          if (isObstacle) {
            drawCyberDagger(ctx, '#94a3b8', '#e2e8f0', '#475569', 8);
          } else if (isP1) {
            drawCyberDagger(ctx, '#fde68a', '#fbbf24', '#92400e', 6);
          } else {
            drawCyberDagger(ctx, '#bae6fd', '#38bdf8', '#075985', 6);
          }
          ctx.restore();
        });

        // Outer Armored Wheel Shadow & Rim
        ctx.save();
        ctx.shadowColor = wheelHitPulseRef.current > 0.2 ? 'rgba(251,191,36,0.55)' : 'rgba(15,23,42,0.9)';
        ctx.shadowBlur = wheelHitPulseRef.current > 0.2 ? 26 : 20;
        const rimGrad = ctx.createRadialGradient(-16, -16, 10, 0, 0, WHEEL_R);
        rimGrad.addColorStop(0, '#475569');
        rimGrad.addColorStop(0.55, '#1e293b');
        rimGrad.addColorStop(0.88, '#0f172a');
        rimGrad.addColorStop(1, '#334155');
        ctx.fillStyle = rimGrad;
        ctx.beginPath();
        ctx.arc(0, 0, WHEEL_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Neon Rim Bevel
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, WHEEL_R - 2, 0, Math.PI * 2);
        ctx.stroke();

        // Inner Wood-Alloy Target Core
        const coreGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, WHEEL_R - 14);
        coreGrad.addColorStop(0, '#78350f');
        coreGrad.addColorStop(0.55, '#451a03');
        coreGrad.addColorStop(1, '#1e293b');
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(0, 0, WHEEL_R - 14, 0, Math.PI * 2);
        ctx.fill();

        // Concentric Cyber Rings + Crosshair Spokes
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, WHEEL_R - 24, 0, Math.PI * 2);
        ctx.stroke();

        for (let k = 0; k < 6; k++) {
          const a = (k * Math.PI) / 3;
          ctx.strokeStyle = k % 2 === 0 ? 'rgba(251,191,36,0.28)' : 'rgba(56,189,248,0.28)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * 14, Math.sin(a) * 14);
          ctx.lineTo(Math.cos(a) * (WHEEL_R - 8), Math.sin(a) * (WHEEL_R - 8));
          ctx.stroke();
        }

        // Hub Center Reactor
        const hubGrad = ctx.createRadialGradient(-3, -3, 1, 0, 0, 16);
        hubGrad.addColorStop(0, '#fef08a');
        hubGrad.addColorStop(0.5, '#f59e0b');
        hubGrad.addColorStop(1, '#78350f');
        ctx.fillStyle = hubGrad;
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();

        // Flying Knives in Motion
        flyingKnivesRef.current.forEach((fk) => {
          ctx.save();
          ctx.translate(fk.x, fk.y);
          if (!fk.isP1) ctx.rotate(Math.PI);
          // Speed trail
          ctx.fillStyle = fk.isP1 ? 'rgba(251,191,36,0.25)' : 'rgba(56,189,248,0.25)';
          ctx.fillRect(-2.5, 18, 5, 42);
          drawCyberDagger(
            ctx,
            fk.isP1 ? '#fde68a' : '#bae6fd',
            fk.isP1 ? '#fbbf24' : '#38bdf8',
            fk.isP1 ? '#92400e' : '#075985',
            0
          );
          ctx.restore();
        });

        // Ricocheting Clashed Knives
        ricochetsRef.current.forEach((r) => {
          ctx.save();
          ctx.globalAlpha = Math.max(0, r.alpha);
          ctx.translate(r.x, r.y);
          ctx.rotate(r.angle);
          drawCyberDagger(ctx, '#fca5a5', '#ef4444', '#7f1d1d', 0);
          ctx.restore();
        });

        // Ready Docked Dagger Preview at Bottom (P1) & Top (P2)
        if (roomStatusRef.current === 'playing' && gs && !gs.roundWinner) {
          if (gs.p1KnivesLeft > 0) {
            ctx.save();
            ctx.translate(CX, H - 50);
            ctx.globalAlpha = isP1Local ? 1 : 0.72;
            drawCyberDagger(ctx, '#fde68a', '#fbbf24', '#92400e', 0);
            ctx.restore();
          }
          if (gs.p2KnivesLeft > 0) {
            ctx.save();
            ctx.translate(CX, 50);
            ctx.rotate(Math.PI);
            ctx.globalAlpha = !isP1Local ? 1 : 0.72;
            drawCyberDagger(ctx, '#bae6fd', '#38bdf8', '#075985', 0);
            ctx.restore();
          }
        }

        // Particles
        juice.renderParticles(ctx, 1);

        // Player Side Labels inside Canvas
        ctx.font = '800 10px Inter, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(56, 189, 248, 0.85)';
        ctx.fillText(`TOP: ${p2Nickname.toUpperCase()} (${gs?.p2KnivesLeft ?? 0} LEFT)`, 14, 22);
        ctx.fillStyle = 'rgba(251, 191, 36, 0.85)';
        ctx.fillText(`BOT: ${p1Nickname.toUpperCase()} (${gs?.p1KnivesLeft ?? 0} LEFT)`, 14, H - 14);

        ctx.restore();
      },
    });

    loop.start();
    return () => loop.stop();
  }, [p1Uid, p2Uid, isHost, isP1Local, playerUid, p1Nickname, p2Nickname]);

  // Gap-Finding CyberBot AI
  useEffect(() => {
    if (!isBotPlaying || !isHost) return;

    const timer = window.setInterval(() => {
      const gs = gameStateRef.current;
      if (roomStatusRef.current !== 'playing' || !gs || gs.roundWinner) return;
      if (gs.p2KnivesLeft <= 0) return;

      // Prevent overlapping bot throws in flight
      if (flyingKnivesRef.current.some((f) => !f.isP1)) return;

      const diff = botDifficultyRef.current;
      const estimatedFlightTime = 0.085;
      const predictedWheel = wheelAngleRef.current + (gs.rotationSpeed || 2.3) * estimatedFlightTime;
      const predictedContact = normalizeAngle(Math.PI - predictedWheel);

      const minGap = (gs.stuckBlades || []).reduce(
        (min, b) => Math.min(min, angleDiff(predictedContact, b.angle)),
        Math.PI
      );

      const safeThreshold = diff === 'hard' ? 0.36 : diff === 'medium' ? 0.42 : 0.30;
      if (minGap < safeThreshold) {
        // Hard/medium waits for a clean sector; easy sometimes slips
        if (diff !== 'easy' || Math.random() > 0.35) return;
      }

      const fireChance = diff === 'hard' ? 0.88 : diff === 'medium' ? 0.65 : 0.48;
      if (Math.random() < fireChance) {
        flyingKnivesRef.current.push({
          x: 220,
          y: 52,
          vy: 1550,
          ownerUid: p2Uid,
          isP1: false,
        });
        soundService.playClick();
      }
    }, 180);

    return () => window.clearInterval(timer);
  }, [isBotPlaying, isHost, p2Uid]);

  const handleThrow = () => {
    const gs = gameStateRef.current;
    if (roomStatusRef.current !== 'playing' || !gs || gs.roundWinner) return;
    const now = performance.now();
    if (now - localLastThrowRef.current < THROW_COOLDOWN_MS) return;

    const myKnivesLeft = isP1Local ? gs.p1KnivesLeft : gs.p2KnivesLeft;
    if (myKnivesLeft <= 0) return;
    if (flyingKnivesRef.current.some((f) => f.ownerUid === playerUid)) return;

    localLastThrowRef.current = now;
    setThrowCooldownActive(true);
    window.setTimeout(() => setThrowCooldownActive(false), THROW_COOLDOWN_MS);

    flyingKnivesRef.current.push({
      x: 220,
      y: isP1Local ? 418 : 52,
      vy: isP1Local ? -1550 : 1550,
      ownerUid: playerUid,
      isP1: isP1Local,
    });
    soundService.playClick();
  };

  // Keyboard support (Space / ArrowUp / Enter)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        handleThrow();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const p1Score = room.scores[p1Uid] ?? gameState?.scores?.[p1Uid] ?? 0;
  const p2Score = room.scores[p2Uid] ?? gameState?.scores?.[p2Uid] ?? 0;
  const myKnives = isP1Local ? gameState?.p1KnivesLeft ?? 0 : gameState?.p2KnivesLeft ?? 0;
  const oppKnives = isP1Local ? gameState?.p2KnivesLeft ?? 0 : gameState?.p1KnivesLeft ?? 0;

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-3 sm:p-4 select-none relative">
      {/* Top Broadcast HUD */}
      <div className="w-full max-w-[440px] flex items-center justify-between bg-slate-900/90 border border-white/10 rounded-2xl px-4 py-2 mb-2.5 shadow-xl">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/50 flex items-center justify-center font-black text-amber-400 text-lg">
            {p1Score}
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] font-black text-amber-300 tracking-wider uppercase truncate max-w-[100px]">
              {p1Nickname}
            </span>
            <div className="flex items-center gap-0.5 mt-0.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <span
                  key={i}
                  className={`w-1.5 h-3 rounded-sm transition-all ${
                    i < (gameState?.p1KnivesLeft ?? 0) ? 'bg-amber-400 shadow-[0_0_6px_#fbbf24]' : 'bg-slate-800'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center">
          <span className="text-[9px] font-black tracking-[0.22em] text-slate-400 uppercase">
            Round {room.currentRound} • First to {room.maxRounds}
          </span>
          <span className="text-xs font-black text-white uppercase tracking-wider mt-0.5">
            {gameState?.roundWinner
              ? gameState.roundWinner === playerUid
                ? 'BLADE MASTER!'
                : 'RIVAL CLEARED!'
              : 'Precision Strike'}
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex flex-col items-end">
            <span className="text-[11px] font-black text-sky-300 tracking-wider uppercase truncate max-w-[100px]">
              {p2Nickname}
            </span>
            <div className="flex items-center gap-0.5 mt-0.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <span
                  key={i}
                  className={`w-1.5 h-3 rounded-sm transition-all ${
                    i < (gameState?.p2KnivesLeft ?? 0) ? 'bg-sky-400 shadow-[0_0_6px_#38bdf8]' : 'bg-slate-800'
                  }`}
                />
              ))}
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-400/50 flex items-center justify-center font-black text-sky-400 text-lg">
            {p2Score}
          </div>
        </div>
      </div>

      {/* Main Arena Canvas */}
      <div
        onPointerDown={handleThrow}
        className="relative w-full max-w-[440px] aspect-[440/470] bg-slate-950 rounded-3xl overflow-hidden border-2 border-white/10 shadow-[0_0_50px_rgba(15,23,42,0.9)] cursor-pointer active:scale-[0.99] transition-transform touch-none"
      >
        <canvas ref={canvasRef} className="w-full h-full block" />

        {gameState?.roundWinner && (
          <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in duration-200 pointer-events-none">
            <div className="px-6 py-3 rounded-2xl bg-slate-900 border border-white/15 shadow-2xl text-center">
              <div className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-400">
                Round {room.currentRound} Winner
              </div>
              <div className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight mt-1">
                {gameState.roundWinner === p1Uid ? p1Nickname : p2Nickname}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tactile Throw Trigger */}
      <button
        type="button"
        onClick={handleThrow}
        disabled={Boolean(gameState?.roundWinner) || myKnives <= 0 || throwCooldownActive}
        className={`w-full max-w-[440px] mt-3 py-3.5 rounded-2xl font-black uppercase tracking-widest text-sm transition-all flex items-center justify-between px-5 border ${
          gameState?.roundWinner || myKnives <= 0
            ? 'bg-slate-800/70 text-slate-500 border-white/5 cursor-not-allowed'
            : throwCooldownActive
            ? 'bg-amber-600/80 text-white border-amber-300/40 scale-[0.98]'
            : 'bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:brightness-110 active:scale-[0.97] text-slate-950 border-amber-300/60 shadow-[0_8px_30px_rgba(245,158,11,0.35)]'
        }`}
      >
        <span>🗡️ Throw Cyber-Blade (Space / Tap)</span>
        <span className="px-2.5 py-0.5 rounded-lg bg-slate-950/30 text-white text-xs">
          {myKnives} Left • Opp {oppKnives}
        </span>
      </button>
    </div>
  );
};
