import React, { useEffect, useRef, useState } from 'react';
import type { AuthoritativeRoomState } from '../../types/room';
import type { SumoSpinState, SumoSpinner } from '../../engine/sumoSpinEngine';
import { soundService } from '../../services/sound';
import { GameLoop } from '../../engine/core/GameLoop';
import { CanvasManager } from '../../engine/core/CanvasManager';
import { JuiceEngine } from '../../engine/core/JuiceEngine';

interface SumoSpinViewProps {
  room: AuthoritativeRoomState<SumoSpinState>;
  playerUid: string;
  onDispatchAction: (type: string, payload: any) => void;
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

interface SpinOrb {
  x: number;
  y: number;
  type: 'rpm' | 'titan';
  pulse: number;
}

interface GhostTrail {
  x: number;
  y: number;
  angle: number;
  alpha: number;
  color: string;
}

const ARENA_CX = 240;
const ARENA_CY = 240;
const BASE_ARENA_R = 178;
const SPINNER_R = 26;

const KINETIC_POSTS = [
  { x: ARENA_CX, y: ARENA_CY - 82, r: 13, flash: 0 },
  { x: ARENA_CX, y: ARENA_CY + 82, r: 13, flash: 0 },
];

const createFreshSpinners = (p1Uid: string, p2Uid: string): Record<string, SumoSpinner> => ({
  [p1Uid]: {
    x: ARENA_CX - 96,
    y: ARENA_CY,
    vx: 0,
    vy: 0,
    angle: 0,
    spinRpm: 1800,
    alive: true,
    boostCooldown: 0,
  },
  [p2Uid]: {
    x: ARENA_CX + 96,
    y: ARENA_CY,
    vx: 0,
    vy: 0,
    angle: Math.PI,
    spinRpm: 1800,
    alive: true,
    boostCooldown: 0,
  },
});

export const SumoSpinView: React.FC<SumoSpinViewProps> = ({ room, playerUid, onDispatchAction }) => {
  const gameState = room.gameState;
  const players = Object.keys(room.players);
  const p1Uid = players[0] || playerUid;
  const p2Uid = players[1] || (p1Uid === 'bot_rival' ? 'player' : 'bot_rival');

  const isHost = room.hostUid === playerUid || playerUid === p1Uid;
  const isP1Local = playerUid === p1Uid;
  const isBotPlaying = Boolean(
    room.players['bot_rival'] || p2Uid === 'bot_rival' || p2Uid.startsWith('bot_') || players.length < 2
  );

  const p1Nickname = room.players[p1Uid]?.nickname || 'Player 1';
  const p2Nickname = room.players[p2Uid]?.nickname || (isBotPlaying ? 'CyberBot' : 'Player 2');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const juiceRef = useRef(new JuiceEngine(420));
  const keysRef = useRef<Record<string, boolean>>({});
  const pointerStickRef = useRef<{
    active: boolean;
    dx: number;
    dy: number;
    originX: number;
    originY: number;
    curX: number;
    curY: number;
  }>({
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
  const titanTimerRef = useRef<Record<string, number>>({ [p1Uid]: 0, [p2Uid]: 0 });
  const trailsRef = useRef<Record<string, Array<{ x: number; y: number }>>>({ [p1Uid]: [], [p2Uid]: [] });
  const ghostsRef = useRef<GhostTrail[]>([]);
  const orbsRef = useRef<SpinOrb[]>([]);
  const shockwavesRef = useRef<Shockwave[]>([]);
  const fallsRef = useRef<FallAnim[]>([]);
  const currentRadiusRef = useRef(BASE_ARENA_R);
  const elapsedRoundRef = useRef(0);
  const orbSpawnTimerRef = useRef(3.2);
  const roundResolvedRef = useRef(false);
  const prevRoundRef = useRef(room.currentRound);

  // Ref mirrors so GameLoop never restarts on stateVersion updates
  const onDispatchActionRef = useRef(onDispatchAction);
  onDispatchActionRef.current = onDispatchAction;
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;
  const roomStatusRef = useRef(room.status);
  roomStatusRef.current = room.status;
  const botDifficultyRef = useRef(room.gameConfig?.difficulty || 'medium');
  botDifficultyRef.current = room.gameConfig?.difficulty || 'medium';

  const [boostCdPct, setBoostCdPct] = useState(0);
  const [p1RpmUi, setP1RpmUi] = useState(1800);
  const [p2RpmUi, setP2RpmUi] = useState(1800);
  const [shrinkWarning, setShrinkWarning] = useState(false);

  // Reset positions cleanly on round transition
  useEffect(() => {
    if (room.currentRound !== prevRoundRef.current || (!gameState?.roundWinner && roundResolvedRef.current)) {
      prevRoundRef.current = room.currentRound;
      roundResolvedRef.current = false;
      spinnersRef.current = createFreshSpinners(p1Uid, p2Uid);
      dashTimerRef.current = { [p1Uid]: 0, [p2Uid]: 0 };
      titanTimerRef.current = { [p1Uid]: 0, [p2Uid]: 0 };
      trailsRef.current = { [p1Uid]: [], [p2Uid]: [] };
      ghostsRef.current = [];
      orbsRef.current = [];
      fallsRef.current = [];
      shockwavesRef.current = [];
      currentRadiusRef.current = BASE_ARENA_R;
      elapsedRoundRef.current = 0;
      orbSpawnTimerRef.current = 3.0;
      setShrinkWarning(false);
    }
  }, [room.currentRound, gameState?.roundWinner, p1Uid, p2Uid]);

  const computeAimVector = (uid: string): { x: number; y: number } => {
    const s = spinnersRef.current[uid];
    const oppUid = uid === p1Uid ? p2Uid : p1Uid;
    const opp = spinnersRef.current[oppUid];
    if (!s) return { x: 1, y: 0 };

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

    if (Math.hypot(dx, dy) < 0.08 && opp && opp.alive) {
      dx = opp.x - s.x;
      dy = opp.y - s.y;
    }

    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  };

  const triggerDash = (uid: string) => {
    const gs = gameStateRef.current;
    if (roomStatusRef.current !== 'playing' || roundResolvedRef.current || gs?.roundWinner) return;

    const s = spinnersRef.current[uid];
    if (!s || !s.alive || s.boostCooldown > 0) return;

    const dir = computeAimVector(uid);
    const dashSpeed = 14.2 + (titanTimerRef.current[uid] > 0 ? 2.2 : 0);
    s.vx += dir.x * dashSpeed;
    s.vy += dir.y * dashSpeed;
    s.boostCooldown = 2.1;
    s.spinRpm = Math.min(2800, s.spinRpm + 260);
    dashTimerRef.current[uid] = 0.28;

    const col = uid === p1Uid ? '#fbbf24' : '#38bdf8';
    juiceRef.current.addTrauma(0.16);
    juiceRef.current.emitSparks(s.x, s.y, 16, col, '#ffffff', 5);
    shockwavesRef.current.push({
      x: s.x,
      y: s.y,
      r: SPINNER_R * 0.7,
      maxR: SPINNER_R * 2.7,
      alpha: 0.85,
      color: col,
    });
    soundService.playClick();
  };

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

  // Ref-stabilized 60 FPS Stadium Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cm = new CanvasManager(canvas);
    const W = 480;
    const H = 480;
    let hudTick = 0;
    let syncTick = 0;

    const drawTopSpinner = (
      ctx: CanvasRenderingContext2D,
      uid: string,
      s: SumoSpinner,
      primary: string,
      glow: string,
      core: string,
      isDashing: boolean,
      isTitan: boolean
    ) => {
      if (!s.alive) return;

      // Speed Ribbon Trail
      const trail = trailsRef.current[uid] || [];
      if (trail.length > 1) {
        ctx.save();
        for (let i = 1; i < trail.length; i++) {
          ctx.strokeStyle = glow;
          ctx.globalAlpha = (i / trail.length) * (isDashing ? 0.55 : 0.25);
          ctx.lineWidth = (i / trail.length) * (isTitan ? 14 : 9);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
          ctx.lineTo(trail[i].x, trail[i].y);
          ctx.stroke();
        }
        ctx.restore();
      }

      const drawScale = isTitan ? 1.15 : 1.0;

      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.scale(drawScale, drawScale);

      const speedMag = Math.hypot(s.vx, s.vy);
      const rpmRatio = Math.min(1.5, Math.max(0.45, s.spinRpm / 1800));

      // Ground Drop Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.52)';
      ctx.beginPath();
      ctx.ellipse(4, 8, SPINNER_R * 0.96, SPINNER_R * 0.96, 0, 0, Math.PI * 2);
      ctx.fill();

      // Aim Chevron Indicator for Local Player when Dash Ready
      if (uid === playerUid && s.boostCooldown <= 0) {
        const aim = computeAimVector(uid);
        const aimAng = Math.atan2(aim.y, aim.x);
        ctx.save();
        ctx.rotate(aimAng);
        ctx.fillStyle = primary;
        ctx.globalAlpha = 0.72;
        ctx.beginPath();
        ctx.moveTo(SPINNER_R + 14, 0);
        ctx.lineTo(SPINNER_R + 4, -6);
        ctx.lineTo(SPINNER_R + 7, 0);
        ctx.lineTo(SPINNER_R + 4, 6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // High-RPM / Titan Plasma Ring
      ctx.save();
      ctx.strokeStyle = isTitan ? '#f43f5e' : glow;
      ctx.globalAlpha = isDashing || isTitan ? 0.9 : 0.35 * rpmRatio;
      ctx.lineWidth = isDashing || isTitan ? 4 : 2;
      ctx.setLineDash([9, 5]);
      ctx.rotate(-s.angle * 0.75);
      ctx.beginPath();
      ctx.arc(0, 0, SPINNER_R + (isDashing ? 8 : 5), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Rotating 6-Blade Razor Fusion Wheel
      ctx.save();
      ctx.rotate(s.angle);

      ctx.shadowColor = isTitan ? '#f43f5e' : glow;
      ctx.shadowBlur = isDashing || isTitan ? 20 : 12;
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = isTitan ? '#fb7185' : primary;
      ctx.lineWidth = 2;

      for (let k = 0; k < 6; k++) {
        ctx.save();
        ctx.rotate((k * Math.PI) / 3);
        ctx.beginPath();
        ctx.moveTo(7, -SPINNER_R + 2);
        ctx.quadraticCurveTo(SPINNER_R + 4, -4, SPINNER_R - 2, 10);
        ctx.lineTo(9, 5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // Heavy Forged Energy Ring
      const diskGrad = ctx.createRadialGradient(-5, -5, 3, 0, 0, SPINNER_R - 4);
      diskGrad.addColorStop(0, '#e2e8f0');
      diskGrad.addColorStop(0.5, '#334155');
      diskGrad.addColorStop(1, '#020617');
      ctx.fillStyle = diskGrad;
      ctx.beginPath();
      ctx.arc(0, 0, SPINNER_R - 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = primary;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, SPINNER_R - 10, 0, Math.PI * 2);
      ctx.stroke();

      // Bit-Beast Glowing Core
      const coreGrad = ctx.createRadialGradient(-2, -2, 1, 0, 0, 10);
      coreGrad.addColorStop(0, '#ffffff');
      coreGrad.addColorStop(0.45, core);
      coreGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(0, 0, 9.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-5.5, 0);
      ctx.lineTo(5.5, 0);
      ctx.moveTo(0, -5.5);
      ctx.lineTo(0, 5.5);
      ctx.stroke();

      ctx.restore();

      // High-Speed Impact Wake Crescent
      if (speedMag > 4 || isDashing) {
        const moveAng = Math.atan2(s.vy, s.vx);
        ctx.save();
        ctx.rotate(moveAng);
        ctx.strokeStyle = primary;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.arc(0, 0, SPINNER_R + 4, Math.PI * 0.65, Math.PI * 1.35);
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

        for (const post of KINETIC_POSTS) {
          post.flash = Math.max(0, post.flash - dt * 4);
        }

        for (let i = shockwavesRef.current.length - 1; i >= 0; i--) {
          const sw = shockwavesRef.current[i];
          sw.r += (sw.maxR - sw.r) * Math.min(1, dt * 12);
          sw.alpha -= dt * 2.5;
          if (sw.alpha <= 0) shockwavesRef.current.splice(i, 1);
        }

        for (let i = ghostsRef.current.length - 1; i >= 0; i--) {
          ghostsRef.current[i].alpha -= dt * 3.5;
          if (ghostsRef.current[i].alpha <= 0) ghostsRef.current.splice(i, 1);
        }

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

        // Track round duration -> trigger gradual shrinking hazard ring after 13s!
        elapsedRoundRef.current += dt;
        if (elapsedRoundRef.current > 13) {
          currentRadiusRef.current = Math.max(114, currentRadiusRef.current - dt * 6.5);
        }

        // Spawn Spin Cores & Titan Orbs
        orbSpawnTimerRef.current -= dt;
        if (orbSpawnTimerRef.current <= 0 && orbsRef.current.length < 2) {
          orbSpawnTimerRef.current = 4.2 + Math.random() * 2.2;
          const ang = Math.random() * Math.PI * 2;
          const rad = 28 + Math.random() * Math.max(25, currentRadiusRef.current - 95);
          orbsRef.current.push({
            x: ARENA_CX + Math.cos(ang) * rad,
            y: ARENA_CY + Math.sin(ang) * rad,
            type: Math.random() < 0.65 ? 'rpm' : 'titan',
            pulse: 0,
          });
        }
        orbsRef.current.forEach((o) => {
          o.pulse += dt * 6;
        });

        // Tick spinner timers, dash ghosts & speed trails
        [p1Uid, p2Uid].forEach((uid) => {
          const sp = spinnersRef.current[uid];
          if (!sp) return;
          if (sp.boostCooldown > 0) sp.boostCooldown = Math.max(0, sp.boostCooldown - dt);
          if (dashTimerRef.current[uid] > 0) {
            dashTimerRef.current[uid] = Math.max(0, dashTimerRef.current[uid] - dt);
            if (Math.random() < 0.55) {
              ghostsRef.current.push({
                x: sp.x,
                y: sp.y,
                angle: sp.angle,
                alpha: 0.45,
                color: uid === p1Uid ? '#fbbf24' : '#38bdf8',
              });
            }
          }
          if (titanTimerRef.current[uid] > 0) {
            titanTimerRef.current[uid] = Math.max(0, titanTimerRef.current[uid] - dt);
          }

          sp.angle += (sp.spinRpm / 95) * dt;
          sp.spinRpm = Math.max(900, sp.spinRpm - dt * 22);

          const trail = trailsRef.current[uid];
          if (trail) {
            trail.push({ x: sp.x, y: sp.y });
            if (trail.length > 10) trail.shift();
          }
        });

        // 1. Local Player Controls (Crisp high-torque response)
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
            const driveAccel = 0.88 * (0.82 + 0.18 * (localSpinner.spinRpm / 1800));
            localSpinner.vx += (ax / mag) * driveAccel * norm * step;
            localSpinner.vy += (ay / mag) * driveAccel * norm * step;
          }
        }

        // 2. Multiplayer Remote Sync (2-Human Mode)
        const oppUid = playerUid === p1Uid ? p2Uid : p1Uid;
        const oppSpinner = spinnersRef.current[oppUid];
        if (!isBotPlaying) {
          syncTick += dt;
          if (syncTick >= 0.05 && localSpinner) {
            syncTick = 0;
            onDispatchActionRef.current('SUMO_SYNC', {
              x: localSpinner.x,
              y: localSpinner.y,
              vx: localSpinner.vx,
              vy: localSpinner.vy,
              spinRpm: localSpinner.spinRpm,
              alive: localSpinner.alive,
            });
          }

          const remoteSync = (gs as any)?.spinners?.[oppUid];
          if (remoteSync && oppSpinner && oppSpinner.alive) {
            oppSpinner.x += (remoteSync.x - oppSpinner.x) * 0.45;
            oppSpinner.y += (remoteSync.y - oppSpinner.y) * 0.45;
            oppSpinner.vx = remoteSync.vx ?? oppSpinner.vx;
            oppSpinner.vy = remoteSync.vy ?? oppSpinner.vy;
            oppSpinner.spinRpm = remoteSync.spinRpm ?? oppSpinner.spinRpm;
          }
        }

        // 3. Tactical CyberBot AI
        if (isBotPlaying && isHost && s2.alive) {
          const diff = botDifficultyRef.current;
          const accel = diff === 'hard' ? 0.86 : diff === 'medium' ? 0.72 : 0.56;
          const distFromCenter = Math.hypot(s2.x - ARENA_CX, s2.y - ARENA_CY);
          const safeEdge = currentRadiusRef.current - 54;

          let tx = s1.x;
          let ty = s1.y;

          if (distFromCenter > safeEdge) {
            // Emergency edge recovery sprint back inside
            tx = ARENA_CX;
            ty = ARENA_CY;
          } else if (orbsRef.current.length > 0 && (s2.spinRpm < 1550 || orbsRef.current[0].type === 'titan')) {
            // Grab Spin/Titan Orb
            tx = orbsRef.current[0].x;
            ty = orbsRef.current[0].y;
          } else {
            // Angle slightly toward the inside of player so shoves push player outward!
            const pFromC_X = s1.x - ARENA_CX;
            const pFromC_Y = s1.y - ARENA_CY;
            const pMag = Math.hypot(pFromC_X, pFromC_Y) || 1;
            tx = s1.x - (pFromC_X / pMag) * 24;
            ty = s1.y - (pFromC_Y / pMag) * 24;
          }

          const dx = tx - s2.x;
          const dy = ty - s2.y;
          const dist = Math.hypot(dx, dy) || 1;
          s2.vx += (dx / dist) * accel * step;
          s2.vy += (dy / dist) * accel * step;

          // Smart Slam Dash: trigger when player is aligned toward perimeter & within strike range
          const pDist = Math.hypot(s1.x - s2.x, s1.y - s2.y);
          if (s2.boostCooldown <= 0 && distFromCenter < safeEdge && pDist < 135) {
            const pOutX = s1.x - ARENA_CX;
            const pOutY = s1.y - ARENA_CY;
            const attackX = s1.x - s2.x;
            const attackY = s1.y - s2.y;
            const align = (pOutX * attackX + pOutY * attackY) / ((Math.hypot(pOutX, pOutY) || 1) * (pDist || 1));
            if (align > 0.35 || pDist < 75) {
              const prob = diff === 'hard' ? 0.08 : diff === 'medium' ? 0.04 : 0.015;
              if (Math.random() < prob) {
                triggerDash(p2Uid);
              }
            }
          }
        }

        // 4. Integrate Movement, Concave Dish Gravity & Edge Teeter Sparks
        [p1Uid, p2Uid].forEach((uid) => {
          const sp = spinnersRef.current[uid];
          if (!sp || !sp.alive) return;

          const dxC = ARENA_CX - sp.x;
          const dyC = ARENA_CY - sp.y;
          const distC = Math.hypot(dxC, dyC);
          if (distC > 10) {
            sp.vx += (dxC / distC) * 0.085 * step;
            sp.vy += (dyC / distC) * 0.085 * step;
          }

          const friction = Math.pow(0.958, step);
          sp.vx *= friction;
          sp.vy *= friction;
          sp.x += sp.vx * step;
          sp.y += sp.vy * step;

          // Edge Teeter Warning Friction Sparks
          if (distC > currentRadiusRef.current - 26 && Math.random() < 0.45) {
            juice.emitSparks(sp.x, sp.y, 2, '#ef4444', '#fca5a5', 2.5);
          }

          // Kinetic Post Bumps
          for (const post of KINETIC_POSTS) {
            const pdx = sp.x - post.x;
            const pdy = sp.y - post.y;
            const pdist = Math.hypot(pdx, pdy);
            const minP = SPINNER_R + post.r;
            if (pdist < minP && pdist > 0.01) {
              const nx = pdx / pdist;
              const ny = pdy / pdist;
              sp.x = post.x + nx * (minP + 1);
              sp.y = post.y + ny * (minP + 1);
              const vn = sp.vx * nx + sp.vy * ny;
              if (vn < 0) {
                sp.vx -= 1.85 * vn * nx;
                sp.vy -= 1.85 * vn * ny;
              }
              sp.vx += nx * 2.2;
              sp.vy += ny * 2.2;
              post.flash = 1.0;
              juice.emitSparks(post.x + nx * post.r, post.y + ny * post.r, 10, '#38bdf8', '#ffffff', 4);
              soundService.playClick();
            }
          }
        });

        // 5. Orb Collection
        for (let oi = orbsRef.current.length - 1; oi >= 0; oi--) {
          const orb = orbsRef.current[oi];
          for (const uid of [p1Uid, p2Uid]) {
            const sp = spinnersRef.current[uid];
            if (!sp || !sp.alive) continue;
            if (Math.hypot(sp.x - orb.x, sp.y - orb.y) < SPINNER_R + 14) {
              if (orb.type === 'rpm') {
                sp.spinRpm = Math.min(2800, sp.spinRpm + 480);
                sp.boostCooldown = 0;
              } else {
                titanTimerRef.current[uid] = 5.0;
                sp.spinRpm = Math.min(2800, sp.spinRpm + 260);
              }
              juice.emitSparks(orb.x, orb.y, 16, orb.type === 'titan' ? '#f43f5e' : '#38bdf8', '#ffffff', 4);
              shockwavesRef.current.push({
                x: orb.x,
                y: orb.y,
                r: 6,
                maxR: 42,
                alpha: 0.9,
                color: orb.type === 'titan' ? '#f43f5e' : '#38bdf8',
              });
              orbsRef.current.splice(oi, 1);
              soundService.playScore();
              break;
            }
          }
        }

        // 6. Spinner-vs-Spinner Blade Clash Impulse (Mass + RPM Power Scaling)
        if (s1.alive && s2.alive) {
          const r1 = SPINNER_R * (titanTimerRef.current[p1Uid] > 0 ? 1.15 : 1.0);
          const r2 = SPINNER_R * (titanTimerRef.current[p2Uid] > 0 ? 1.15 : 1.0);
          const minDist = r1 + r2;
          const cdx = s2.x - s1.x;
          const cdy = s2.y - s1.y;
          const cdist = Math.hypot(cdx, cdy);

          if (cdist < minDist && cdist > 0.001) {
            const nx = cdx / cdist;
            const ny = cdy / cdist;

            const m1 = titanTimerRef.current[p1Uid] > 0 ? 1.45 : 1.0;
            const m2 = titanTimerRef.current[p2Uid] > 0 ? 1.45 : 1.0;

            const rvx = s2.vx - s1.vx;
            const rvy = s2.vy - s1.vy;
            const velAlongNormal = rvx * nx + rvy * ny;

            if (velAlongNormal < 0) {
              const e = 1.04;
              const j = (-(1 + e) * velAlongNormal) / (1 / m1 + 1 / m2);

              s1.vx -= (j / m1) * nx;
              s1.vy -= (j / m1) * ny;
              s2.vx += (j / m2) * nx;
              s2.vy += (j / m2) * ny;

              // Dash + Spin-RPM advantage bonus knockback
              const rpmEdge = ((s1.spinRpm - s2.spinRpm) / 1000) * 1.6;
              s1.vx -= (dashTimerRef.current[p2Uid] > 0 ? 5.8 : 0) * nx - Math.min(0, rpmEdge) * nx;
              s1.vy -= (dashTimerRef.current[p2Uid] > 0 ? 5.8 : 0) * ny - Math.min(0, rpmEdge) * ny;
              s2.vx += (dashTimerRef.current[p1Uid] > 0 ? 5.8 : 0) * nx + Math.max(0, rpmEdge) * nx;
              s2.vy += (dashTimerRef.current[p1Uid] > 0 ? 5.8 : 0) * ny + Math.max(0, rpmEdge) * ny;

              const impactPower = Math.min(20, Math.abs(velAlongNormal));
              const midX = (s1.x + s2.x) / 2;
              const midY = (s1.y + s2.y) / 2;

              s1.spinRpm = Math.max(900, s1.spinRpm - 45);
              s2.spinRpm = Math.max(900, s2.spinRpm - 45);

              const isCrit = dashTimerRef.current[p1Uid] > 0 || dashTimerRef.current[p2Uid] > 0 || impactPower > 9;
              juice.addTrauma(isCrit ? 0.65 : 0.25);
              if (isCrit) juice.triggerHitStop(42);
              juice.emitSparks(midX, midY, isCrit ? 24 : 14, '#fef08a', '#ffffff', 5);
              shockwavesRef.current.push({
                x: midX,
                y: midY,
                r: 10,
                maxR: isCrit ? 76 : 48,
                alpha: 0.95,
                color: isCrit ? '#fb7185' : '#fef08a',
              });
              soundService.playImpact();
            }

            const overlap = minDist - cdist + 0.8;
            s1.x -= nx * (overlap * 0.5);
            s1.y -= ny * (overlap * 0.5);
            s2.x += nx * (overlap * 0.5);
            s2.y += ny * (overlap * 0.5);
          }
        }

        // 7. Ring-Out Detection Against Current Hazard Radius
        const ringLimit = currentRadiusRef.current - 5;
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
            juice.addTrauma(0.8);
            juice.triggerHitStop(78);
            juice.emitExplosion(sp.x, sp.y, 45);
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
          if (mine) setBoostCdPct(Math.round((mine.boostCooldown / 2.1) * 100));
          setP1RpmUi(Math.round(s1.spinRpm));
          setP2RpmUi(Math.round(s2.spinRpm));
          setShrinkWarning(elapsedRoundRef.current > 13);
        }
      },
      render: () => {
        const ctx = cm.ctx;
        const scale = cm.width / W;
        const juice = juiceRef.current;
        const curR = currentRadiusRef.current;

        ctx.save();
        ctx.scale(scale, scale);

        // Deep Abyss Void Backdrop
        const voidGrad = ctx.createRadialGradient(ARENA_CX, ARENA_CY, curR * 0.65, ARENA_CX, ARENA_CY, 305);
        voidGrad.addColorStop(0, '#0f172a');
        voidGrad.addColorStop(0.7, '#060916');
        voidGrad.addColorStop(1, '#02040a');
        ctx.fillStyle = voidGrad;
        ctx.fillRect(0, 0, W, H);

        ctx.translate(juice.offsetX, juice.offsetY);

        // Ring-out Fall Spiral Animations (drawn beneath stadium edge)
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

        // Outer Structural Platform Lip
        ctx.save();
        ctx.shadowColor = elapsedRoundRef.current > 13 ? 'rgba(239, 68, 68, 0.55)' : 'rgba(56, 189, 248, 0.25)';
        ctx.shadowBlur = 28;
        ctx.fillStyle = '#090d16';
        ctx.beginPath();
        ctx.arc(ARENA_CX, ARENA_CY, BASE_ARENA_R + 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Dark Collapsed Void Ring when Sudden Death Shrinks
        if (curR < BASE_ARENA_R - 2) {
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.25)';
          ctx.lineWidth = BASE_ARENA_R - curR;
          ctx.beginPath();
          ctx.arc(ARENA_CX, ARENA_CY, (BASE_ARENA_R + curR) / 2, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Active Concave Dohyo Dish Surface
        const dishGrad = ctx.createRadialGradient(ARENA_CX - 26, ARENA_CY - 26, 16, ARENA_CX, ARENA_CY, curR);
        dishGrad.addColorStop(0, '#1e293b');
        dishGrad.addColorStop(0.55, '#0f172a');
        dishGrad.addColorStop(0.88, '#1e1b4b');
        dishGrad.addColorStop(1, '#312e81');
        ctx.fillStyle = dishGrad;
        ctx.beginPath();
        ctx.arc(ARENA_CX, ARENA_CY, curR, 0, Math.PI * 2);
        ctx.fill();

        // Animated Crimson Hazard Chevron Perimeter at Active Radius
        ctx.save();
        ctx.strokeStyle = elapsedRoundRef.current > 13 ? '#ef4444' : 'rgba(239, 68, 68, 0.65)';
        ctx.lineWidth = 6;
        ctx.setLineDash([12, 10]);
        ctx.lineDashOffset = -performance.now() * 0.025;
        ctx.beginPath();
        ctx.arc(ARENA_CX, ARENA_CY, curR - 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Stadium Rings & Radial Energy Grid
        ctx.save();
        [44, 96].forEach((r) => {
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.16)';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(ARENA_CX, ARENA_CY, r, 0, Math.PI * 2);
          ctx.stroke();
        });
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        for (let k = 0; k < 8; k++) {
          const a = (k * Math.PI) / 4;
          ctx.beginPath();
          ctx.moveTo(ARENA_CX, ARENA_CY);
          ctx.lineTo(ARENA_CX + Math.cos(a) * curR, ARENA_CY + Math.sin(a) * curR);
          ctx.stroke();
        }
        ctx.restore();

        // Kinetic Bounce Posts
        for (const post of KINETIC_POSTS) {
          ctx.save();
          ctx.translate(post.x, post.y);
          ctx.fillStyle = post.flash > 0.1 ? '#ffffff' : '#0f172a';
          ctx.strokeStyle = post.flash > 0.1 ? '#fde047' : '#38bdf8';
          ctx.shadowColor = '#38bdf8';
          ctx.shadowBlur = post.flash > 0.1 ? 18 : 10;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(0, 0, post.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#38bdf8';
          ctx.beginPath();
          ctx.arc(0, 0, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // Spin & Titan Orbs
        for (const orb of orbsRef.current) {
          const s = 1 + Math.sin(orb.pulse) * 0.14;
          const isTitan = orb.type === 'titan';
          const col = isTitan ? '#f43f5e' : '#22d3ee';
          ctx.save();
          ctx.translate(orb.x, orb.y);
          ctx.scale(s, s);
          ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
          ctx.strokeStyle = col;
          ctx.shadowColor = col;
          ctx.shadowBlur = 16;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(0, 0, 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.font = '12px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(isTitan ? '🛡️' : '⚡', 0, 1);
          ctx.restore();
        }

        // Dash Afterimage Ghosts
        ghostsRef.current.forEach((g) => {
          ctx.save();
          ctx.globalAlpha = g.alpha;
          ctx.translate(g.x, g.y);
          ctx.fillStyle = g.color;
          ctx.beginPath();
          ctx.arc(0, 0, SPINNER_R * 0.85, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        });

        // Draw Spinners
        const s1 = spinnersRef.current[p1Uid];
        const s2 = spinnersRef.current[p2Uid];
        if (s1) {
          drawTopSpinner(
            ctx,
            p1Uid,
            s1,
            '#fbbf24',
            'rgba(251,191,36,0.9)',
            '#fde047',
            dashTimerRef.current[p1Uid] > 0,
            titanTimerRef.current[p1Uid] > 0
          );
        }
        if (s2) {
          drawTopSpinner(
            ctx,
            p2Uid,
            s2,
            '#38bdf8',
            'rgba(56,189,248,0.9)',
            '#7dd3fc',
            dashTimerRef.current[p2Uid] > 0,
            titanTimerRef.current[p2Uid] > 0
          );
        }

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
          ctx.strokeStyle = 'rgba(255,255,255,0.3)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(st.originX, st.originY, 34, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = isP1Local ? 'rgba(251,191,36,0.8)' : 'rgba(56,189,248,0.8)';
          ctx.beginPath();
          ctx.arc(st.curX, st.curY, 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

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
          <span
            className={`text-xs font-black uppercase tracking-wider mt-0.5 ${
              shrinkWarning ? 'text-rose-400 animate-pulse' : 'text-white'
            }`}
          >
            {gameState?.roundWinner ? 'RING OUT!' : shrinkWarning ? 'RING SHRINKING!' : 'Orb Clash Arena'}
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
              <div className="text-[10px] font-black uppercase tracking-[0.25em] text-rose-400">KO • Ring Out</div>
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
          <span className="text-cyan-300">Grab ⚡RPM & 🛡️Titan Orbs</span>
        </div>

        <button
          type="button"
          onClick={() => triggerDash(playerUid)}
          disabled={boostCdPct > 0 || Boolean(gameState?.roundWinner)}
          className={`relative flex-1 overflow-hidden py-3.5 px-5 rounded-2xl font-black uppercase tracking-widest text-sm transition-all border ${
            boostCdPct > 0 || gameState?.roundWinner
              ? 'bg-slate-800/80 text-slate-400 border-white/5 cursor-not-allowed'
              : 'bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:brightness-110 active:scale-[0.97] text-slate-950 border-amber-300/60 shadow-[0_8px_28px_rgba(245,158,11,0.35)] cursor-pointer'
          }`}
        >
          {boostCdPct > 0 && (
            <div
              className="absolute inset-y-0 left-0 bg-amber-400/20 transition-all duration-75"
              style={{ width: `${100 - boostCdPct}%` }}
            />
          )}
          <span className="relative z-10 flex items-center justify-between">
            <span>⚡ Slam Dash (Space)</span>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-950/30 text-white">
              {boostCdPct > 0 ? 'RECHARGING' : 'READY'}
            </span>
          </span>
        </button>
      </div>
    </div>
  );
};
