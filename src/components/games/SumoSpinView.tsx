import React, { useEffect, useRef, useState } from 'react';
import type { AuthoritativeRoomState } from '../../types/room';
import type { SumoSpinState, SumoSpinner } from '../../engine/sumoSpinEngine';
import { soundService } from '../../services/sound';
import { GameLoop } from '../../engine/core/GameLoop';
import { CanvasManager } from '../../engine/core/CanvasManager';
import { JuiceEngine } from '../../engine/core/JuiceEngine';

interface SumoSpinViewProps {
  room: AuthoritativeRoomState;
  playerUid: string;
  onDispatchAction: (type: string, payload?: any) => void;
}

interface Shockwave {
  x: number;
  y: number;
  r: number;
  maxR: number;
  alpha: number;
  color: string;
}

interface FallAnim {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  scale: number;
  alpha: number;
  color: string;
}

const ARENA_CX = 240;
const ARENA_CY = 240;
const ARENA_R = 175;
const SPINNER_R = 27;

const createFreshSpinners = (p1Uid: string, p2Uid: string): Record<string, SumoSpinner> => ({
  [p1Uid]: {
    x: ARENA_CX - 90,
    y: ARENA_CY,
    vx: 0,
    vy: 0,
    angle: 0,
    spinRpm: 1650,
    alive: true,
    boostCooldown: 0,
  },
  [p2Uid]: {
    x: ARENA_CX + 90,
    y: ARENA_CY,
    vx: 0,
    vy: 0,
    angle: Math.PI,
    spinRpm: 1650,
    alive: true,
    boostCooldown: 0,
  },
});

export const SumoSpinView: React.FC<SumoSpinViewProps> = ({ room, playerUid, onDispatchAction }) => {
  const gameState = room.gameState as SumoSpinState;
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
  const keysRef = useRef<Record<string, boolean>>({});
  const pointerStickRef = useRef<{ active: boolean; dx: number; dy: number; originX: number; originY: number; curX: number; curY: number }>({
    active: false,
    dx: 0,
    dy: 0,
    originX: 0,
    originY: 0,
    curX: 0,
    curY: 0,
  });

  const spinnersRef = useRef<Record<string, SumoSpinner>>(createFreshSpinners(p1Uid, p2Uid));
  const dashTimerRef = useRef<Record<string, number>>({ [p1Uid]: 0, [p2Uid]: 0 });
  const shockwavesRef = useRef<Shockwave[]>([]);
  const fallsRef = useRef<FallAnim[]>([]);
  const roundResolvedRef = useRef(false);
  const prevRoundRef = useRef(room.currentRound);

  // Ref mirrors so GameLoop never restarts on state updates
  const onDispatchActionRef = useRef(onDispatchAction);
  onDispatchActionRef.current = onDispatchAction;
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;
  const roomStatusRef = useRef(room.status);
  roomStatusRef.current = room.status;
  const botDifficultyRef = useRef(room.gameConfig?.difficulty || 'medium');
  botDifficultyRef.current = room.gameConfig?.difficulty || 'medium';

  const [boostCdPct, setBoostCdPct] = useState(0);
  const [p1RpmUi, setP1RpmUi] = useState(1650);
  const [p2RpmUi, setP2RpmUi] = useState(1650);

  // Reset positions cleanly on round transition
  useEffect(() => {
    if (room.currentRound !== prevRoundRef.current || (!gameState?.roundWinner && roundResolvedRef.current)) {
      prevRoundRef.current = room.currentRound;
      roundResolvedRef.current = false;
      spinnersRef.current = createFreshSpinners(p1Uid, p2Uid);
      dashTimerRef.current = { [p1Uid]: 0, [p2Uid]: 0 };
      fallsRef.current = [];
      shockwavesRef.current = [];
    }
  }, [room.currentRound, gameState?.roundWinner, p1Uid, p2Uid]);

  // Keyboard bindings
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      keysRef.current[e.code] = true;
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        triggerDash(playerUid);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  });

  const triggerDash = (uid: string) => {
    const gs = gameStateRef.current;
    if (roomStatusRef.current !== 'playing' || roundResolvedRef.current || gs?.roundWinner) return;

    const s = spinnersRef.current[uid];
    if (!s || !s.alive || s.boostCooldown > 0) return;

    const oppUid = uid === p1Uid ? p2Uid : p1Uid;
    const opp = spinnersRef.current[oppUid];

    let dx = 0;
    let dy = 0;

    if (uid === playerUid) {
      if (keysRef.current['ArrowUp'] || keysRef.current['KeyW']) dy -= 1;
      if (keysRef.current['ArrowDown'] || keysRef.current['KeyS']) dy += 1;
      if (keysRef.current['ArrowLeft'] || keysRef.current['KeyA']) dx -= 1;
      if (keysRef.current['ArrowRight'] || keysRef.current['KeyD']) dx += 1;

      if (dx === 0 && dy === 0 && pointerStickRef.current.active) {
        dx = pointerStickRef.current.dx;
        dy = pointerStickRef.current.dy;
      }
    }

    // If stationary or bot, lock directly onto opponent spinner so Slam Dash always attacks!
    const inputMag = Math.hypot(dx, dy);
    if (inputMag < 0.08 && opp && opp.alive) {
      dx = opp.x - s.x;
      dy = opp.y - s.y;
    }

    const len = Math.hypot(dx, dy) || 1;
    s.vx += (dx / len) * 12.5;
    s.vy += (dy / len) * 12.5;
    s.boostCooldown = 2.6;
    s.spinRpm = Math.min(2600, s.spinRpm + 240);
    dashTimerRef.current[uid] = 0.25;

    juiceRef.current.emitSparks(s.x, s.y, 14, uid === p1Uid ? '#fbbf24' : '#38bdf8');
    shockwavesRef.current.push({
      x: s.x,
      y: s.y,
      r: SPINNER_R * 0.7,
      maxR: SPINNER_R * 2.4,
      alpha: 0.75,
      color: uid === p1Uid ? '#fbbf24' : '#38bdf8',
    });
    soundService.playClick();
  };

  // Ref-stabilized 60 FPS Physics & Stadium Renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cm = new CanvasManager(canvas);
    const W = 480;
    const H = 480;
    let hudTick = 0;

    const drawTopSpinner = (
      ctx: CanvasRenderingContext2D,
      s: SumoSpinner,
      primary: string,
      glow: string,
      core: string,
      isDashing: boolean
    ) => {
      if (!s.alive) return;
      ctx.save();
      ctx.translate(s.x, s.y);

      const speedMag = Math.hypot(s.vx, s.vy);
      const rpmRatio = Math.min(1.4, Math.max(0.4, s.spinRpm / 1650));

      // Ground Drop Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.48)';
      ctx.beginPath();
      ctx.ellipse(4, 7, SPINNER_R * 0.96, SPINNER_R * 0.96, 0, 0, Math.PI * 2);
      ctx.fill();

      // High-RPM Energy Aura Ring
      ctx.save();
      ctx.strokeStyle = glow;
      ctx.globalAlpha = isDashing ? 0.9 : 0.28 * rpmRatio;
      ctx.lineWidth = isDashing ? 4 : 2;
      ctx.setLineDash([10, 6]);
      ctx.rotate(-s.angle * 0.6);
      ctx.beginPath();
      ctx.arc(0, 0, SPINNER_R + (isDashing ? 8 : 5), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Rotating Multi-Blade Attack Chassis
      ctx.save();
      ctx.rotate(s.angle);

      // 4 Curved Attack Fins
      ctx.shadowColor = glow;
      ctx.shadowBlur = isDashing ? 18 : 10;
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = primary;
      ctx.lineWidth = 2;
      for (let k = 0; k < 4; k++) {
        ctx.save();
        ctx.rotate((k * Math.PI) / 2);
        ctx.beginPath();
        ctx.moveTo(8, -SPINNER_R + 4);
        ctx.quadraticCurveTo(SPINNER_R + 3, -6, SPINNER_R - 3, 12);
        ctx.lineTo(10, 6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // Outer Armored Weight Disk
      const diskGrad = ctx.createRadialGradient(-5, -5, 4, 0, 0, SPINNER_R - 4);
      diskGrad.addColorStop(0, '#94a3b8');
      diskGrad.addColorStop(0.55, '#334155');
      diskGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = diskGrad;
      ctx.beginPath();
      ctx.arc(0, 0, SPINNER_R - 4, 0, Math.PI * 2);
      ctx.fill();

      // Inner Glow Bit-Chip
      ctx.strokeStyle = primary;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, SPINNER_R - 10, 0, Math.PI * 2);
      ctx.stroke();

      // Center Turbo Core
      const coreGrad = ctx.createRadialGradient(-2, -2, 1, 0, 0, 10);
      coreGrad.addColorStop(0, '#ffffff');
      coreGrad.addColorStop(0.4, core);
      coreGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(0, 0, 9.5, 0, Math.PI * 2);
      ctx.fill();

      // Spinning Direction Crosshair
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-6, 0);
      ctx.lineTo(6, 0);
      ctx.moveTo(0, -6);
      ctx.lineTo(0, 6);
      ctx.stroke();

      ctx.restore();

      // Dash motion blur crescent
      if (speedMag > 4 || isDashing) {
        const moveAng = Math.atan2(s.vy, s.vx);
        ctx.save();
        ctx.rotate(moveAng);
        ctx.strokeStyle = primary;
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, SPINNER_R + 3, Math.PI * 0.65, Math.PI * 1.35);
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();
    };

    const loop = new GameLoop({
      update: (dt) => {
        const gs = gameStateRef.current;
        const juice = juiceRef.current;
        juice.update(dt);

        const step = Math.min(dt * 60, 2.5);
        const s1 = spinnersRef.current[p1Uid];
        const s2 = spinnersRef.current[p2Uid];

        // Update Shockwaves
        for (let i = shockwavesRef.current.length - 1; i >= 0; i--) {
          const sw = shockwavesRef.current[i];
          sw.r += (sw.maxR - sw.r) * Math.min(1, dt * 12);
          sw.alpha -= dt * 2.4;
          if (sw.alpha <= 0) shockwavesRef.current.splice(i, 1);
        }

        // Update Ring-Out Fall Spiral Animations
        for (let i = fallsRef.current.length - 1; i >= 0; i--) {
          const f = fallsRef.current[i];
          f.x += f.vx * step * 0.65;
          f.y += f.vy * step * 0.65;
          f.angle += dt * 18;
          f.scale = Math.max(0, f.scale - dt * 1.45);
          f.alpha = Math.max(0, f.alpha - dt * 1.3);
          if (f.alpha <= 0) fallsRef.current.splice(i, 1);
        }

        if (roomStatusRef.current !== 'playing' || !gs || gs.roundWinner || roundResolvedRef.current) {
          return;
        }
        if (!s1 || !s2) return;

        // Tick cooldowns & visual spin angles
        [p1Uid, p2Uid].forEach((uid) => {
          const sp = spinnersRef.current[uid];
          if (!sp) return;
          if (sp.boostCooldown > 0) sp.boostCooldown = Math.max(0, sp.boostCooldown - dt);
          if (dashTimerRef.current[uid] > 0) dashTimerRef.current[uid] = Math.max(0, dashTimerRef.current[uid] - dt);
          sp.angle += (sp.spinRpm / 110) * dt;
          // Slight natural RPM decay recovered by collisions/dashes
          sp.spinRpm = Math.max(850, sp.spinRpm - dt * 18);
        });

        // Apply Local Player Input (Keyboard + Canvas Analog Joystick)
        const localSpinner = spinnersRef.current[playerUid];
        if (localSpinner && localSpinner.alive) {
          let ax = 0;
          let ay = 0;
          if (keysRef.current['ArrowUp'] || keysRef.current['KeyW']) ay -= 1;
          if (keysRef.current['ArrowDown'] || keysRef.current['KeyS']) ay += 1;
          if (keysRef.current['ArrowLeft'] || keysRef.current['KeyA']) ax -= 1;
          if (keysRef.current['ArrowRight'] || keysRef.current['KeyD']) ax += 1;

          if (ax === 0 && ay === 0 && pointerStickRef.current.active) {
            ax = pointerStickRef.current.dx;
            ay = pointerStickRef.current.dy;
          }

          const mag = Math.hypot(ax, ay);
          if (mag > 0.05) {
            const norm = Math.min(1, mag);
            localSpinner.vx += (ax / mag) * 0.56 * norm * step;
            localSpinner.vy += (ay / mag) * 0.56 * norm * step;
          }
        }

        // CyberBot AI (Runs on host)
        if (isBotPlaying && isHost && s2.alive) {
          const diff = botDifficultyRef.current;
          const accel = diff === 'hard' ? 0.52 : diff === 'medium' ? 0.43 : 0.34;
          const distFromCenter = Math.hypot(s2.x - ARENA_CX, s2.y - ARENA_CY);

          let tx = s1.x;
          let ty = s1.y;
          // Edge survival reflex: pull back toward center if dangerously close to hazard lip
          if (distFromCenter > ARENA_R - 52) {
            tx = ARENA_CX;
            ty = ARENA_CY;
          }

          const dx = tx - s2.x;
          const dy = ty - s2.y;
          const dist = Math.hypot(dx, dy) || 1;
          s2.vx += (dx / dist) * accel * step;
          s2.vy += (dy / dist) * accel * step;

          // Aggressive Slam Dash when aligned near opponent & safely inside ring
          const distToPlayer = Math.hypot(s1.x - s2.x, s1.y - s2.y);
          if (s2.boostCooldown <= 0 && distFromCenter < ARENA_R - 55 && distToPlayer < 130) {
            const dashProb = diff === 'hard' ? 0.045 : diff === 'medium' ? 0.025 : 0.012;
            if (Math.random() < dashProb) {
              triggerDash(p2Uid);
            }
          }
        }

        // Integrate Movement, Concave Stadium Pull, and Friction (dt-normalized)
        [s1, s2].forEach((sp) => {
          if (!sp.alive) return;

          // Subtle parabolic stadium bowl pull toward center (keeps action thrilling in the middle)
          const dxC = ARENA_CX - sp.x;
          const dyC = ARENA_CY - sp.y;
          const distC = Math.hypot(dxC, dyC);
          if (distC > 12) {
            sp.vx += (dxC / distC) * 0.055 * step;
            sp.vy += (dyC / distC) * 0.055 * step;
          }

          const friction = Math.pow(0.976, step);
          sp.vx *= friction;
          sp.vy *= friction;
          sp.x += sp.vx * step;
          sp.y += sp.vy * step;
        });

        // Elastic Blade-on-Blade Collision Impulse (Properly balanced momentum equation)
        if (s1.alive && s2.alive) {
          const cdx = s2.x - s1.x;
          const cdy = s2.y - s1.y;
          const cdist = Math.hypot(cdx, cdy);
          const minDist = SPINNER_R * 2;

          if (cdist < minDist && cdist > 0.001) {
            const nx = cdx / cdist;
            const ny = cdy / cdist;

            // Relative velocity of s2 vs s1 projected onto collision normal
            const rvx = s2.vx - s1.vx;
            const rvy = s2.vy - s1.vy;
            const velAlongNormal = rvx * nx + rvy * ny;

            if (velAlongNormal < 0) {
              const e = 0.96; // Crisp high-energy metal clash restitution
              const j = (-(1 + e) * velAlongNormal) / 2;

              s1.vx -= j * nx;
              s1.vy -= j * ny;
              s2.vx += j * nx;
              s2.vy += j * ny;

              // Dash supremacy bonus knockback
              if (dashTimerRef.current[p1Uid] > 0) {
                s2.vx += nx * 4.5;
                s2.vy += ny * 4.5;
              }
              if (dashTimerRef.current[p2Uid] > 0) {
                s1.vx -= nx * 4.5;
                s1.vy -= ny * 4.5;
              }

              // Small extra rotational rip repulsion
              const impactPower = Math.min(18, Math.abs(velAlongNormal));
              const midX = (s1.x + s2.x) / 2;
              const midY = (s1.y + s2.y) / 2;

              s1.spinRpm = Math.max(950, s1.spinRpm - 35);
              s2.spinRpm = Math.max(950, s2.spinRpm - 35);

              juice.addTrauma(Math.min(0.65, 0.22 + impactPower * 0.03));
              if (impactPower > 7) juice.triggerHitStop(36);
              juice.emitSparks(midX, midY, 18, '#fef08a');
              shockwavesRef.current.push({
                x: midX,
                y: midY,
                r: 8,
                maxR: 48 + impactPower * 2.5,
                alpha: 0.9,
                color: '#fef08a',
              });
              soundService.playImpact();
            }

            // Positional Overlap Separation
            const overlap = minDist - cdist + 0.5;
            s1.x -= nx * (overlap * 0.5);
            s1.y -= ny * (overlap * 0.5);
            s2.x += nx * (overlap * 0.5);
            s2.y += ny * (overlap * 0.5);
          }
        }

        // Ring-Out Check (Edge falls off at ARENA_R - 8)
        const ringLimit = ARENA_R - 6;
        [p1Uid, p2Uid].forEach((uid) => {
          const sp = spinnersRef.current[uid];
          if (!sp || !sp.alive || roundResolvedRef.current) return;
          const d = Math.hypot(sp.x - ARENA_CX, sp.y - ARENA_CY);
          if (d > ringLimit) {
            sp.alive = false;
            roundResolvedRef.current = true;
            fallsRef.current.push({
              x: sp.x,
              y: sp.y,
              vx: sp.vx,
              vy: sp.vy,
              angle: sp.angle,
              scale: 1,
              alpha: 1,
              color: uid === p1Uid ? '#fbbf24' : '#38bdf8',
            });
            juice.addTrauma(0.75);
            juice.triggerHitStop(75);
            juice.emitExplosion(sp.x, sp.y, 24);
            soundService.playGoal();

            const victorUid = uid === p1Uid ? p2Uid : p1Uid;
            if (isHost || victorUid === playerUid) {
              onDispatchActionRef.current('SUMO_RING_OUT', {
                fallenUid: uid,
                playerUid: victorUid,
                actingUid: victorUid,
              });
            }
          }
        });

        // Throttled HUD updates (~12Hz)
        hudTick += dt;
        if (hudTick >= 0.08) {
          hudTick = 0;
          const mine = spinnersRef.current[playerUid];
          if (mine) setBoostCdPct(Math.round((mine.boostCooldown / 2.6) * 100));
          setP1RpmUi(Math.round(s1.spinRpm));
          setP2RpmUi(Math.round(s2.spinRpm));
        }
      },
      render: () => {
        const ctx = cm.ctx;
        const scale = cm.width / W;
        const juice = juiceRef.current;

        ctx.save();
        ctx.scale(scale, scale);

        // Deep Abyss Background Outside Ring
        const voidGrad = ctx.createRadialGradient(ARENA_CX, ARENA_CY, ARENA_R * 0.7, ARENA_CX, ARENA_CY, 300);
        voidGrad.addColorStop(0, '#0f172a');
        voidGrad.addColorStop(0.75, '#050814');
        voidGrad.addColorStop(1, '#02040a');
        ctx.fillStyle = voidGrad;
        ctx.fillRect(0, 0, W, H);

        ctx.translate(juice.offsetX, juice.offsetY);

        // Ring-out Fall Spiral Animations (drawn beneath rim lip)
        fallsRef.current.forEach((f) => {
          ctx.save();
          ctx.globalAlpha = f.alpha;
          ctx.translate(f.x, f.y);
          ctx.scale(f.scale, f.scale);
          ctx.rotate(f.angle);
          ctx.fillStyle = f.color;
          ctx.beginPath();
          ctx.arc(0, 0, SPINNER_R, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        });

        // Outer Elevated Stadium Rim & Drop Shadow
        ctx.save();
        ctx.shadowColor = 'rgba(239, 68, 68, 0.25)';
        ctx.shadowBlur = 28;
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(ARENA_CX, ARENA_CY, ARENA_R + 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Hazard Chevron Outer Zone
        ctx.save();
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.55)';
        ctx.lineWidth = 10;
        ctx.setLineDash([12, 10]);
        ctx.beginPath();
        ctx.arc(ARENA_CX, ARENA_CY, ARENA_R + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Concave Stadium Bowl Surface
        const dishGrad = ctx.createRadialGradient(ARENA_CX - 28, ARENA_CY - 28, 18, ARENA_CX, ARENA_CY, ARENA_R);
        dishGrad.addColorStop(0, '#1e293b');
        dishGrad.addColorStop(0.55, '#0f172a');
        dishGrad.addColorStop(0.92, '#1e1b4b');
        dishGrad.addColorStop(1, '#312e81');
        ctx.fillStyle = dishGrad;
        ctx.beginPath();
        ctx.arc(ARENA_CX, ARENA_CY, ARENA_R, 0, Math.PI * 2);
        ctx.fill();

        // Metallic Bowl Rim Highlight
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(ARENA_CX, ARENA_CY, ARENA_R, 0, Math.PI * 2);
        ctx.stroke();

        // Concentric Stadium Rings + 8 Radial Grid Lines
        ctx.save();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
        ctx.lineWidth = 1.2;
        [45, 95, ARENA_R - 22].forEach((r, idx) => {
          ctx.strokeStyle = idx === 2 ? 'rgba(239, 68, 68, 0.35)' : 'rgba(56, 189, 248, 0.14)';
          ctx.beginPath();
          ctx.arc(ARENA_CX, ARENA_CY, r, 0, Math.PI * 2);
          ctx.stroke();
        });
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        for (let k = 0; k < 8; k++) {
          const a = (k * Math.PI) / 4;
          ctx.beginPath();
          ctx.moveTo(ARENA_CX, ARENA_CY);
          ctx.lineTo(ARENA_CX + Math.cos(a) * ARENA_R, ARENA_CY + Math.sin(a) * ARENA_R);
          ctx.stroke();
        }
        ctx.restore();

        // Center Dojo Emblem
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.25)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ARENA_CX, ARENA_CY, 16, 0, Math.PI * 2);
        ctx.stroke();

        // Draw Spinners
        const s1 = spinnersRef.current[p1Uid];
        const s2 = spinnersRef.current[p2Uid];
        if (s1) drawTopSpinner(ctx, s1, '#fbbf24', 'rgba(251,191,36,0.9)', '#fde047', dashTimerRef.current[p1Uid] > 0);
        if (s2) drawTopSpinner(ctx, s2, '#38bdf8', 'rgba(56,189,248,0.9)', '#7dd3fc', dashTimerRef.current[p2Uid] > 0);

        // Clash Shockwaves
        shockwavesRef.current.forEach((sw) => {
          ctx.save();
          ctx.globalAlpha = Math.max(0, sw.alpha);
          ctx.strokeStyle = sw.color;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        });

        // Analog Pointer Drag Reticle Overlay
        if (pointerStickRef.current.active) {
          const st = pointerStickRef.current;
          ctx.save();
          ctx.strokeStyle = 'rgba(255,255,255,0.28)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(st.originX, st.originY, 34, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = isP1Local ? 'rgba(251,191,36,0.75)' : 'rgba(56,189,248,0.75)';
          ctx.beginPath();
          ctx.arc(st.curX, st.curY, 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // Particles
        juice.renderParticles(ctx, 1);

        ctx.restore();
      },
    });

    loop.start();
    return () => loop.stop();
  }, [p1Uid, p2Uid, isHost, isBotPlaying, playerUid, isP1Local]);

  // Canvas Analog Joystick Pointer Handlers
  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 480,
      y: ((e.clientY - rect.top) / rect.height) * 480,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = getCanvasCoords(e);
    pointerStickRef.current = {
      active: true,
      dx: 0,
      dy: 0,
      originX: x,
      originY: y,
      curX: x,
      curY: y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointerStickRef.current.active) return;
    const { x, y } = getCanvasCoords(e);
    const rawDx = x - pointerStickRef.current.originX;
    const rawDy = y - pointerStickRef.current.originY;
    const dist = Math.hypot(rawDx, rawDy);
    const maxRadius = 38;
    const clamped = Math.min(dist, maxRadius);
    const nx = dist > 0.5 ? rawDx / dist : 0;
    const ny = dist > 0.5 ? rawDy / dist : 0;

    pointerStickRef.current.dx = nx * (clamped / maxRadius);
    pointerStickRef.current.dy = ny * (clamped / maxRadius);
    pointerStickRef.current.curX = pointerStickRef.current.originX + nx * clamped;
    pointerStickRef.current.curY = pointerStickRef.current.originY + ny * clamped;
  };

  const handlePointerUp = () => {
    pointerStickRef.current.active = false;
    pointerStickRef.current.dx = 0;
    pointerStickRef.current.dy = 0;
  };

  const p1Score = room.scores[p1Uid] ?? gameState?.scores?.[p1Uid] ?? 0;
  const p2Score = room.scores[p2Uid] ?? gameState?.scores?.[p2Uid] ?? 0;

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-3 sm:p-4 select-none relative">
      {/* Top Broadcast HUD */}
      <div className="w-full max-w-[480px] flex items-center justify-between bg-slate-900/90 border border-white/10 rounded-2xl px-4 py-2 mb-2.5 shadow-xl">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/50 flex items-center justify-center font-black text-amber-400 text-lg">
            {p1Score}
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] font-black text-amber-300 uppercase tracking-wider truncate max-w-[105px]">
              {p1Nickname}
            </span>
            <span className="text-[10px] font-bold text-amber-200/70">{p1RpmUi} RPM</span>
          </div>
        </div>

        <div className="flex flex-col items-center">
          <span className="text-[9px] font-black tracking-[0.22em] text-slate-400 uppercase">
            Round {room.currentRound} • First to {room.maxRounds}
          </span>
          <span className="text-xs font-black text-white uppercase tracking-wider mt-0.5">
            {gameState?.roundWinner ? 'RING OUT!' : 'Bey-Stadium Clash'}
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex flex-col items-end">
            <span className="text-[11px] font-black text-sky-300 uppercase tracking-wider truncate max-w-[105px]">
              {p2Nickname}
            </span>
            <span className="text-[10px] font-bold text-sky-200/70">{p2RpmUi} RPM</span>
          </div>
          <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-400/50 flex items-center justify-center font-black text-sky-400 text-lg">
            {p2Score}
          </div>
        </div>
      </div>

      {/* Main Concave Stadium Canvas */}
      <div className="relative w-full max-w-[480px] aspect-square bg-slate-950 rounded-3xl overflow-hidden border-2 border-white/10 shadow-[0_0_55px_rgba(15,23,42,0.95)] touch-none">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="w-full h-full block cursor-grab active:cursor-grabbing"
        />

        {gameState?.roundWinner && (
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in duration-200 pointer-events-none">
            <div className="px-6 py-3 rounded-2xl bg-slate-900 border border-white/15 shadow-2xl text-center">
              <div className="text-[10px] font-black uppercase tracking-[0.25em] text-rose-400">
                KO • Ring Out
              </div>
              <div className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight mt-1">
                {gameState.roundWinner === p1Uid ? p1Nickname : p2Nickname} Wins!
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Controls Row: Tip + Slam Dash Trigger */}
      <div className="w-full max-w-[480px] mt-3 flex items-center gap-3">
        <div className="hidden sm:flex flex-col px-3.5 py-2 rounded-2xl bg-slate-900/80 border border-white/10 text-[10px] text-slate-300 font-bold uppercase tracking-wider">
          <span>Move: Drag / WASD</span>
          <span className="text-slate-400">Dash: Spacebar</span>
        </div>

        <button
          type="button"
          onClick={() => triggerDash(playerUid)}
          disabled={boostCdPct > 0 || Boolean(gameState?.roundWinner)}
          className={`relative flex-1 overflow-hidden py-3.5 px-5 rounded-2xl font-black uppercase tracking-widest text-sm transition-all border ${
            boostCdPct > 0 || gameState?.roundWinner
              ? 'bg-slate-800/80 text-slate-400 border-white/5 cursor-not-allowed'
              : 'bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:brightness-110 active:scale-[0.97] text-slate-950 border-amber-300/60 shadow-[0_8px_28px_rgba(245,158,11,0.35)]'
          }`}
        >
          {boostCdPct > 0 && (
            <div
              className="absolute inset-y-0 left-0 bg-amber-400/20 transition-all duration-75"
              style={{ width: `${100 - boostCdPct}%` }}
            />
          )}
          <span className="relative z-10 flex items-center justify-between">
            <span>⚡ Slam Dash (Auto-Lock)</span>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-950/30 text-white">
              {boostCdPct > 0 ? 'RECHARGING' : 'READY'}
            </span>
          </span>
        </button>
      </div>
    </div>
  );
};
