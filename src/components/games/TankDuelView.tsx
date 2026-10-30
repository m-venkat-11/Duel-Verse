import React, { useEffect, useRef, useState } from 'react';
import type { AuthoritativeRoomState } from '../../types/room';
import type { TankDuelState } from '../../engine/tankDuelEngine';
import { GameLoop } from '../../engine/core/GameLoop';
import { CanvasManager } from '../../engine/core/CanvasManager';
import { JuiceEngine } from '../../engine/core/JuiceEngine';
import { soundService } from '../../services/sound';
import { RotateCcw, ArrowUp, RotateCw, Flame, Sparkles } from 'lucide-react';

interface TankDuelViewProps {
  room: AuthoritativeRoomState<TankDuelState>;
  playerUid: string;
  onDispatchAction: (type: string, payload: any) => void;
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  bounces: number;
  ownerUid: string;
  alive: boolean;
  trail: Array<{ x: number; y: number; alpha: number }>;
}

interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface TreadMark {
  x: number;
  y: number;
  angle: number;
  alpha: number;
}

export const TankDuelView: React.FC<TankDuelViewProps> = ({
  room,
  playerUid,
  onDispatchAction
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const players = Object.keys(room.players);
  const p1Uid = players[0] || 'p1';
  const p2Uid = players[1] || 'p2';
  const isP1 = playerUid === p1Uid;
  const isHost = room.hostUid === playerUid;
  const isBotPlaying = Boolean(room.players['bot_rival'] || p2Uid === 'bot_rival');

  const p1Nickname = room.players[p1Uid]?.nickname || 'Player 1';
  const p2Nickname = room.players[p2Uid]?.nickname || 'CyberBot';

  const [roundWinnerName, setRoundWinnerName] = useState<string | null>(null);
  const [controlMode, setControlMode] = useState<'classic' | 'onebutton'>('classic');

  // Input state
  const keysDown = useRef<{ [key: string]: boolean }>({});
  const mobileControls = useRef({ left: false, right: false, forward: false, fire: false, oneButtonDown: false });

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysDown.current[e.key.toLowerCase()] = true;
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysDown.current[e.key.toLowerCase()] = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const canvasMgr = new CanvasManager(canvas);
    const juice = new JuiceEngine(400);

    const W = 640;
    const H = 480;

    // Obstacles in arena (Symmetric tactical layout)
    const obstacles: Obstacle[] = [
      { x: 130, y: 90, w: 35, h: 110 },
      { x: 130, y: 280, w: 35, h: 110 },
      { x: 475, y: 90, w: 35, h: 110 },
      { x: 475, y: 280, w: 35, h: 110 },
      { x: 285, y: 190, w: 70, h: 100 },
      { x: 270, y: 60, w: 100, h: 25 },
      { x: 270, y: 395, w: 100, h: 25 }
    ];

    // Tread marks on floor
    const treadMarks: TreadMark[] = [];

    // Tanks
    const TANK_RADIUS = 20;
    const MOVE_SPEED = 2.6;
    const ROT_SPEED = 0.058;
    const BULLET_SPEED = 5.8;

    const tanks = {
      [p1Uid]: {
        x: 75,
        y: 240,
        angle: 0,
        color: '#f59e0b',
        turretColor: '#fbbf24',
        reload: 0,
        alive: true,
        recoil: 0,
        trackAnim: 0
      },
      [p2Uid]: {
        x: 565,
        y: 240,
        angle: Math.PI,
        color: '#06b6d4',
        turretColor: '#22d3ee',
        reload: 0,
        alive: true,
        recoil: 0,
        trackAnim: 0
      }
    };

    const bullets: Bullet[] = [];
    let roundPauseTimer = 0;
    let isRoundOver = false;

    // Track driving states for auto-spin/hold-to-drive/release-to-fire
    const tankDriving = {
      [p1Uid]: false,
      [p2Uid]: false
    };

    const resolveTankWallSlide = (px: number, py: number, radius: number): { x: number; y: number } => {
      let cx = px;
      let cy = py;
      for (const obs of obstacles) {
        const nearestX = Math.max(obs.x, Math.min(cx, obs.x + obs.w));
        const nearestY = Math.max(obs.y, Math.min(cy, obs.y + obs.h));
        const dx = cx - nearestX;
        const dy = cy - nearestY;
        const dist = Math.hypot(dx, dy);
        if (dist < radius && dist > 0.0001) {
          const overlap = radius - dist;
          const nx = dx / dist;
          const ny = dy / dist;
          cx += nx * overlap;
          cy += ny * overlap;
        }
      }
      cx = Math.max(radius + 12, Math.min(W - radius - 12, cx));
      cy = Math.max(radius + 12, Math.min(H - radius - 12, cy));
      return { x: cx, y: cy };
    };

    const fireBullet = (ownerUid: string) => {
      const t = tanks[ownerUid];
      if (!t || !t.alive || t.reload > 0) return;
      t.reload = 0.28;
      t.recoil = 10;

      const tipX = t.x + Math.cos(t.angle) * (TANK_RADIUS + 10);
      const tipY = t.y + Math.sin(t.angle) * (TANK_RADIUS + 10);

      bullets.push({
        x: tipX,
        y: tipY,
        vx: Math.cos(t.angle) * BULLET_SPEED,
        vy: Math.sin(t.angle) * BULLET_SPEED,
        bounces: 0,
        ownerUid,
        alive: true,
        trail: []
      });

      juice.addTrauma(0.3);
      juice.playSound('shoot');
      juice.emitSparks(tipX, tipY, 14, ownerUid === p1Uid ? '#fbbf24' : '#22d3ee', '#ffffff', 4);
    };

    const update = (dt: number) => {
      juice.update(dt);

      // Tread mark decay
      for (let i = treadMarks.length - 1; i >= 0; i--) {
        treadMarks[i].alpha -= dt * 0.08;
        if (treadMarks[i].alpha <= 0) {
          treadMarks.splice(i, 1);
        }
      }

      if (isRoundOver) {
        roundPauseTimer -= dt;
        if (roundPauseTimer <= 0) {
          isRoundOver = false;
          setRoundWinnerName(null);
          tanks[p1Uid].x = 75;
          tanks[p1Uid].y = 240;
          tanks[p1Uid].angle = 0;
          tanks[p1Uid].alive = true;
          tanks[p1Uid].recoil = 0;
          tankDriving[p1Uid] = false;

          tanks[p2Uid].x = 565;
          tanks[p2Uid].y = 240;
          tanks[p2Uid].angle = Math.PI;
          tanks[p2Uid].alive = true;
          tanks[p2Uid].recoil = 0;
          tankDriving[p2Uid] = false;

          bullets.length = 0;
        }
        return;
      }

      // 1. Controls for My Tank (P1)
      const myTank = tanks[playerUid];
      if (myTank && myTank.alive) {
        myTank.reload = Math.max(0, myTank.reload - dt);
        myTank.recoil = Math.max(0, myTank.recoil - dt * 25);

        if (controlMode === 'onebutton') {
          // JINDOBLU 1-BUTTON AUTO-SPIN MECHANIC:
          // Held = Drive straight smoothly with wall sliding
          // Released = Fire cannon shell & resume 360° rotational scan!
          const isHolding = mobileControls.current.oneButtonDown || keysDown.current[' '] || keysDown.current['w'] || keysDown.current['arrowup'] || keysDown.current['enter'];

          if (isHolding) {
            tankDriving[playerUid] = true;
            const nextX = myTank.x + Math.cos(myTank.angle) * MOVE_SPEED;
            const nextY = myTank.y + Math.sin(myTank.angle) * MOVE_SPEED;
            const resolved = resolveTankWallSlide(nextX, nextY, TANK_RADIUS);
            myTank.x = resolved.x;
            myTank.y = resolved.y;

            myTank.trackAnim += dt * 16;
            if (Math.random() < 0.28) {
              treadMarks.push({ x: myTank.x, y: myTank.y, angle: myTank.angle, alpha: 0.5 });
            }
          } else {
            // Check if player just released the button -> FIRE!
            if (tankDriving[playerUid]) {
              fireBullet(playerUid);
              tankDriving[playerUid] = false;
            }
            // Rotate in place scanning
            myTank.angle += ROT_SPEED * 1.15;
          }
        } else {
          // Classic D-Pad / Keyboard Controls
          const isLeft = keysDown.current['a'] || keysDown.current['arrowleft'] || mobileControls.current.left;
          const isRight = keysDown.current['d'] || keysDown.current['arrowright'] || mobileControls.current.right;
          const isFwd = keysDown.current['w'] || keysDown.current['arrowup'] || mobileControls.current.forward;
          const isFire = keysDown.current[' '] || keysDown.current['enter'] || mobileControls.current.fire;

          if (isLeft) myTank.angle -= ROT_SPEED;
          if (isRight) myTank.angle += ROT_SPEED;

          if (isFwd) {
            const nextX = myTank.x + Math.cos(myTank.angle) * MOVE_SPEED;
            const nextY = myTank.y + Math.sin(myTank.angle) * MOVE_SPEED;
            const resolved = resolveTankWallSlide(nextX, nextY, TANK_RADIUS);
            myTank.x = resolved.x;
            myTank.y = resolved.y;

            myTank.trackAnim += dt * 16;
            if (Math.random() < 0.28) {
              treadMarks.push({ x: myTank.x, y: myTank.y, angle: myTank.angle, alpha: 0.5 });
            }
          }

          if (isFire && myTank.reload === 0) {
            fireBullet(playerUid);
            mobileControls.current.fire = false;
          }
        }
      }

      // 2. CyberBot AI (Smart JindoBlu Auto-Spin Rival AI)
      if (isHost && isBotPlaying) {
        const botTank = tanks[p2Uid];
        const humanTank = tanks[p1Uid];

        if (botTank && botTank.alive && humanTank && humanTank.alive) {
          botTank.reload = Math.max(0, botTank.reload - dt);
          botTank.recoil = Math.max(0, botTank.recoil - dt * 25);

          const dx = humanTank.x - botTank.x;
          const dy = humanTank.y - botTank.y;
          const dist = Math.hypot(dx, dy);

          const targetAngle = Math.atan2(dy, dx);
          let angleDiff = targetAngle - botTank.angle;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

          if (controlMode === 'onebutton') {
            // Bot 1-button behavior:
            // Aligned within ±16° of player -> drive towards or flank
            const isAligned = Math.abs(angleDiff) < 0.28;

            if (isAligned && dist > 120 && !tankDriving[p2Uid]) {
              tankDriving[p2Uid] = true;
            } else if (tankDriving[p2Uid]) {
              // Bot is driving forward
              const nextX = botTank.x + Math.cos(botTank.angle) * MOVE_SPEED * 0.95;
              const nextY = botTank.y + Math.sin(botTank.angle) * MOVE_SPEED * 0.95;
              const resolved = resolveTankWallSlide(nextX, nextY, TANK_RADIUS);
              botTank.x = resolved.x;
              botTank.y = resolved.y;
              botTank.trackAnim += dt * 15;

              // If close or aligned with target line, release to FIRE!
              if (dist < 220 || Math.abs(angleDiff) < 0.12 || Math.random() < 0.02) {
                fireBullet(p2Uid);
                tankDriving[p2Uid] = false;
              }
            } else {
              // Scanning rotation
              botTank.angle += ROT_SPEED * 1.1;
              if (Math.abs(angleDiff) < 0.15 && botTank.reload === 0) {
                fireBullet(p2Uid);
              }
            }
          } else {
            // Classic D-pad steering for Bot
            if (Math.abs(angleDiff) > 0.05) {
              botTank.angle += Math.sign(angleDiff) * ROT_SPEED * 1.15;
            }

            let moveDir = dist < 140 ? -0.5 : 1.0;
            const nextX = botTank.x + Math.cos(botTank.angle) * MOVE_SPEED * 0.9 * moveDir;
            const nextY = botTank.y + Math.sin(botTank.angle) * MOVE_SPEED * 0.9 * moveDir;
            const resolved = resolveTankWallSlide(nextX, nextY, TANK_RADIUS);
            botTank.x = resolved.x;
            botTank.y = resolved.y;
            botTank.trackAnim += dt * 15;

            if (Math.abs(angleDiff) < 0.20 && botTank.reload === 0) {
              fireBullet(p2Uid);
            }
          }
        }
      }

      // 3. Bullets Physics, Trails & Ricochets
      for (const b of bullets) {
        if (!b.alive) continue;

        b.trail.push({ x: b.x, y: b.y, alpha: 0.8 });
        if (b.trail.length > 8) b.trail.shift();

        b.x += b.vx;
        b.y += b.vy;

        // Arena boundary ricochets
        if (b.x <= 10 || b.x >= W - 10) {
          b.vx = -b.vx;
          b.bounces++;
          juice.emitSparks(b.x, b.y, 8, '#22d3ee', '#fbbf24', 3);
          soundService.playImpact(0.8);
        }
        if (b.y <= 10 || b.y >= H - 10) {
          b.vy = -b.vy;
          b.bounces++;
          juice.emitSparks(b.x, b.y, 8, '#22d3ee', '#fbbf24', 3);
          soundService.playImpact(0.8);
        }

        // Obstacle ricochets
        for (const obs of obstacles) {
          if (b.x >= obs.x && b.x <= obs.x + obs.w && b.y >= obs.y && b.y <= obs.y + obs.h) {
            // Determine collision edge
            const fromLeft = Math.abs(b.x - obs.x);
            const fromRight = Math.abs(b.x - (obs.x + obs.w));
            const fromTop = Math.abs(b.y - obs.y);
            const fromBottom = Math.abs(b.y - (obs.y + obs.h));
            const minEdge = Math.min(fromLeft, fromRight, fromTop, fromBottom);

            if (minEdge === fromLeft || minEdge === fromRight) {
              b.vx = -b.vx;
            } else {
              b.vy = -b.vy;
            }

            b.bounces++;
            juice.emitSparks(b.x, b.y, 8, '#f59e0b', '#fbbf24', 3);
            soundService.playImpact(0.8);
            break;
          }
        }

        if (b.bounces > 4) {
          b.alive = false;
          continue;
        }

        // Tank Hit Detection
        for (const [uid, tank] of Object.entries(tanks)) {
          if (!tank.alive) continue;
          const hitDist = Math.hypot(b.x - tank.x, b.y - tank.y);
          if (hitDist <= TANK_RADIUS + 2) {
            b.alive = false;
            tank.alive = false;
            isRoundOver = true;
            roundPauseTimer = 1.8;

            const victorUid = uid === p1Uid ? p2Uid : p1Uid;
            const victorName = victorUid === p1Uid ? p1Nickname : p2Nickname;
            setRoundWinnerName(victorName);

            juice.addTrauma(0.8);
            juice.emitExplosion(tank.x, tank.y, 70);
            soundService.playGoal();

            if (isHost) {
              onDispatchAction('TANK_KILL', {
                killerUid: victorUid,
                victimUid: uid,
                playerUid: victorUid,
                actingUid: victorUid
              });
            }
            break;
          }
        }
      }
    };

    const render = () => {
      const ctx = canvasMgr.ctx;
      ctx.clearRect(0, 0, canvasMgr.width, canvasMgr.height);

      ctx.save();
      ctx.translate(juice.offsetX, juice.offsetY);

      // Scale to internal resolution (640x480)
      const scaleX = canvasMgr.width / W;
      const scaleY = canvasMgr.height / H;
      ctx.scale(scaleX, scaleY);

      // 1. Asphalt Arena Floor
      const floorGrad = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.7);
      floorGrad.addColorStop(0, '#0f172a');
      floorGrad.addColorStop(0.7, '#090d16');
      floorGrad.addColorStop(1, '#03050a');
      ctx.fillStyle = floorGrad;
      ctx.fillRect(0, 0, W, H);

      // Grid Pattern
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.05)';
      ctx.lineWidth = 1;
      for (let x = 32; x < W; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = 32; y < H; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      // Tread Marks
      for (const tm of treadMarks) {
        ctx.save();
        ctx.translate(tm.x, tm.y);
        ctx.rotate(tm.angle);
        ctx.fillStyle = `rgba(0, 0, 0, ${tm.alpha * 0.4})`;
        ctx.fillRect(-12, -TANK_RADIUS, 6, 4);
        ctx.fillRect(-12, TANK_RADIUS - 4, 6, 4);
        ctx.restore();
      }

      // Outer Neon Boundary Rails
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.7)';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 15;
      ctx.strokeRect(6, 6, W - 12, H - 12);
      ctx.shadowBlur = 0;

      // Obstacles (Metallic Beveled Blocks)
      for (const obs of obstacles) {
        // Block Body
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(obs.x, obs.y, obs.w, obs.h);

        // Highlight Bevel
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);

        // Hazard Stripes
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.2)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(obs.x + 4, obs.y + 4);
        ctx.lineTo(obs.x + obs.w - 4, obs.y + obs.h - 4);
        ctx.stroke();
      }

      // Bullets & Particle Trails
      for (const b of bullets) {
        if (!b.alive) continue;

        // Trail
        for (let i = 0; i < b.trail.length; i++) {
          const pt = b.trail[i];
          ctx.fillStyle = b.ownerUid === p1Uid ? `rgba(245, 158, 11, ${(i / b.trail.length) * 0.6})` : `rgba(6, 182, 212, ${(i / b.trail.length) * 0.6})`;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
          ctx.fill();
        }

        // Bullet Core
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = b.ownerUid === p1Uid ? '#fbbf24' : '#22d3ee';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Tanks Rendering
      for (const [uid, tank] of Object.entries(tanks)) {
        if (!tank.alive) continue;

        ctx.save();
        ctx.translate(tank.x, tank.y);
        ctx.rotate(tank.angle);

        // Recoil pushback
        const recoilOffset = -tank.recoil;

        // 1. Tank Rubber Treads
        ctx.fillStyle = '#020617';
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1;
        // Left tread
        ctx.fillRect(-TANK_RADIUS - 3 + recoilOffset, -TANK_RADIUS, TANK_RADIUS * 2 + 6, 7);
        ctx.strokeRect(-TANK_RADIUS - 3 + recoilOffset, -TANK_RADIUS, TANK_RADIUS * 2 + 6, 7);
        // Right tread
        ctx.fillRect(-TANK_RADIUS - 3 + recoilOffset, TANK_RADIUS - 7, TANK_RADIUS * 2 + 6, 7);
        ctx.strokeRect(-TANK_RADIUS - 3 + recoilOffset, TANK_RADIUS - 7, TANK_RADIUS * 2 + 6, 7);

        // Tread teeth animation
        ctx.fillStyle = '#475569';
        for (let i = -TANK_RADIUS; i < TANK_RADIUS; i += 7) {
          const animI = (i + (tank.trackAnim % 7));
          ctx.fillRect(animI + recoilOffset, -TANK_RADIUS, 2, 7);
          ctx.fillRect(animI + recoilOffset, TANK_RADIUS - 7, 2, 7);
        }

        // 2. Armored Hull
        ctx.fillStyle = tank.color;
        ctx.shadowColor = tank.color;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.roundRect(-TANK_RADIUS + 2 + recoilOffset, -TANK_RADIUS + 6, TANK_RADIUS * 2 - 4, TANK_RADIUS * 2 - 12, 5);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Hull Metallic Edge
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // 3. Turret Cannon Barrel
        ctx.fillStyle = tank.turretColor;
        ctx.fillRect(0 + recoilOffset, -3.5, TANK_RADIUS + 10, 7);
        // Muzzle brake
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(TANK_RADIUS + 7 + recoilOffset, -5, 4, 10);

        // 4. Turret Dome
        ctx.fillStyle = tank.turretColor;
        ctx.shadowColor = tank.turretColor;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(0 + recoilOffset, 0, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Turret Center Hatch
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(0 + recoilOffset, 0, 4, 0, Math.PI * 2);
        ctx.fill();

        // Laser Aim Guide for Player
        if (uid === playerUid) {
          ctx.strokeStyle = 'rgba(251, 191, 36, 0.25)';
          ctx.setLineDash([4, 6]);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(TANK_RADIUS + 12, 0);
          ctx.lineTo(TANK_RADIUS + 80, 0);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        ctx.restore();
      }

      // Juice Particles (Explosions, Sparks, Smoke)
      juice.renderParticles(ctx, 1.0);

      // Round Winner Overlay
      if (roundWinnerName) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fbbf24';
        ctx.font = '900 34px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 20;
        ctx.fillText(`💥 ${roundWinnerName.toUpperCase()} SCORED!`, W / 2, H / 2);
        ctx.shadowBlur = 0;
      }

      ctx.restore();
    };

    const loop = new GameLoop({ update, render });
    loop.start();

    return () => {
      loop.stop();
    };
  }, [p1Uid, p2Uid, isHost, isBotPlaying, controlMode]);

  return (
    <div ref={containerRef} className="w-full max-w-2xl mx-auto flex flex-col items-center select-none gap-2.5 px-2">
      {/* Control Mode Toggle Pill */}
      <div className="flex items-center justify-between w-full px-4 py-1.5 rounded-2xl bg-slate-900/80 border border-slate-700/60 text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className="text-amber-400 font-bold">{p1Nickname}</span>
          <span className="text-slate-500">vs</span>
          <span className="text-cyan-400 font-bold">{p2Nickname}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400 text-[11px] hidden sm:inline">Mobile Mode:</span>
          <button
            onClick={() => setControlMode(controlMode === 'classic' ? 'onebutton' : 'classic')}
            className="px-2.5 py-1 rounded-xl bg-violet-600/30 hover:bg-violet-600/50 border border-violet-400/40 text-violet-300 font-bold text-[11px] transition"
          >
            {controlMode === 'onebutton' ? '⚡ 1-Button Steer' : '🎮 D-Pad Controls'}
          </button>
        </div>
      </div>

      {/* Tank Duel Canvas Container */}
      <div className="w-full aspect-[4/3] rounded-3xl overflow-hidden shadow-2xl border-2 border-cyan-500/40 relative bg-slate-950">
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>

      {/* Tactile Mobile Controls */}
      {controlMode === 'onebutton' ? (
        <div className="w-full max-w-md pt-2">
          {/* Master 1-Button Touch Pad: Hold = Drive • Release = Fire */}
          <button
            onPointerDown={() => { mobileControls.current.oneButtonDown = true; }}
            onPointerUp={() => { mobileControls.current.oneButtonDown = false; }}
            onPointerLeave={() => { mobileControls.current.oneButtonDown = false; }}
            onPointerCancel={() => { mobileControls.current.oneButtonDown = false; }}
            className="w-full h-24 rounded-3xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 p-1 shadow-2xl active:scale-[0.98] transition-transform select-none touch-none"
          >
            <div className="w-full h-full rounded-[22px] bg-slate-950 flex flex-col items-center justify-center p-3 text-center">
              <span className="text-base sm:text-lg font-black font-['Outfit'] text-white tracking-wider flex items-center gap-2">
                <Flame className="w-5 h-5 text-amber-400 animate-pulse" />
                <span>HOLD TO DRIVE • RELEASE TO FIRE!</span>
                <Sparkles className="w-5 h-5 text-rose-400" />
              </span>
              <span className="text-xs text-amber-300/80 font-mono mt-1">
                Auto-rotates when idle • Swept wall slide • 4-bounce plasma shell
              </span>
            </div>
          </button>
        </div>
      ) : (
        <div className="w-full grid grid-cols-2 gap-3 max-w-md pt-1">
          {/* Direction Steering */}
          <div className="flex items-center justify-center gap-2">
            <button
              onPointerDown={() => { mobileControls.current.left = true; }}
              onPointerUp={() => { mobileControls.current.left = false; }}
              onPointerLeave={() => { mobileControls.current.left = false; }}
              className="w-14 h-14 rounded-2xl bg-slate-900 border-2 border-slate-700 hover:border-cyan-400 active:scale-90 flex items-center justify-center text-xl font-bold shadow-lg"
              title="Turn Left"
            >
              <RotateCcw className="w-6 h-6 text-slate-300" />
            </button>
            <button
              onPointerDown={() => { mobileControls.current.forward = true; }}
              onPointerUp={() => { mobileControls.current.forward = false; }}
              onPointerLeave={() => { mobileControls.current.forward = false; }}
              className="w-14 h-14 rounded-2xl bg-emerald-500/20 border-2 border-emerald-400 hover:bg-emerald-500/30 active:scale-90 flex items-center justify-center text-xl font-bold text-emerald-300 shadow-lg shadow-emerald-500/20"
              title="Drive Forward"
            >
              <ArrowUp className="w-7 h-7 stroke-[3]" />
            </button>
            <button
              onPointerDown={() => { mobileControls.current.right = true; }}
              onPointerUp={() => { mobileControls.current.right = false; }}
              onPointerLeave={() => { mobileControls.current.right = false; }}
              className="w-14 h-14 rounded-2xl bg-slate-900 border-2 border-slate-700 hover:border-cyan-400 active:scale-90 flex items-center justify-center text-xl font-bold shadow-lg"
              title="Turn Right"
            >
              <RotateCw className="w-6 h-6 text-slate-300" />
            </button>
          </div>

          {/* Fire Trigger */}
          <div className="flex items-center justify-center">
            <button
              onClick={() => { mobileControls.current.fire = true; }}
              className="w-full h-14 rounded-2xl bg-gradient-to-r from-amber-500 to-rose-500 border-2 border-amber-300 active:scale-95 flex items-center justify-center gap-2 text-base font-black text-slate-950 shadow-xl shadow-amber-500/30 font-['Outfit']"
            >
              <Sparkles className="w-5 h-5 text-slate-950 fill-current" />
              <span>FIRE CANNON</span>
            </button>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-400 font-mono text-center">
        ⌨️ Desktop: WASD / Arrow Keys to Move • Space to Fire
      </p>
    </div>
  );
};
