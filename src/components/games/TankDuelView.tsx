import React, { useEffect, useRef, useState } from 'react';
import type { AuthoritativeRoomState } from '../../types/room';
import { GameLoop } from '../../engine/core/GameLoop';
import { CanvasManager } from '../../engine/core/CanvasManager';
import { JuiceEngine } from '../../engine/core/JuiceEngine';
import { soundService } from '../../services/sound';

interface TankDuelViewProps {
  room: AuthoritativeRoomState<any>;
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
}

interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
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

  const [roundWinner, setRoundWinner] = useState<string | null>(null);

  // Local control state
  const keysDown = useRef<{ [key: string]: boolean }>({});
  const mobileControls = useRef({ left: false, right: false, forward: false, fire: false });

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
    const juice = new JuiceEngine(300);

    const W = 600;
    const H = 450;

    // Obstacles in arena (Barricades)
    const obstacles: Obstacle[] = [
      { x: 140, y: 110, w: 40, h: 90 },
      { x: 140, y: 250, w: 40, h: 90 },
      { x: 420, y: 110, w: 40, h: 90 },
      { x: 420, y: 250, w: 40, h: 90 },
      { x: 270, y: 185, w: 60, h: 80 }
    ];

    // Tank simulation state
    const tanks = {
      [p1Uid]: {
        x: 70,
        y: 225,
        angle: 0,
        color: '#f59e0b',
        turretColor: '#fbbf24',
        reload: 0,
        alive: true
      },
      [p2Uid]: {
        x: 530,
        y: 225,
        angle: Math.PI,
        color: '#06b6d4',
        turretColor: '#22d3ee',
        reload: 0,
        alive: true
      }
    };

    const bullets: Bullet[] = [];
    let roundPauseTimer = 0;
    let roundFinished = false;

    // Tank dimensions
    const TANK_RADIUS = 18;
    const MOVE_SPEED = 2.4;
    const ROT_SPEED = 0.055;
    const BULLET_SPEED = 5.2;

    const fireBullet = (ownerUid: string) => {
      const t = tanks[ownerUid];
      if (!t || !t.alive || t.reload > 0) return;
      t.reload = 0.45; // 450ms cooldown

      const tipX = t.x + Math.cos(t.angle) * (TANK_RADIUS + 6);
      const tipY = t.y + Math.sin(t.angle) * (TANK_RADIUS + 6);

      bullets.push({
        x: tipX,
        y: tipY,
        vx: Math.cos(t.angle) * BULLET_SPEED,
        vy: Math.sin(t.angle) * BULLET_SPEED,
        bounces: 0,
        ownerUid,
        alive: true
      });

      juice.addTrauma(0.12);
      juice.emitSparks(tipX, tipY, 8, '#fbbf24', '#f59e0b', 3);
      soundService.playImpact(1.6);
    };

    const update = (dt: number) => {
      juice.update(dt);

      if (roundFinished) {
        roundPauseTimer -= dt;
        if (roundPauseTimer <= 0) {
          // Reset round
          roundFinished = false;
          setRoundWinner(null);
          tanks[p1Uid].x = 70;
          tanks[p1Uid].y = 225;
          tanks[p1Uid].angle = 0;
          tanks[p1Uid].alive = true;
          tanks[p2Uid].x = 530;
          tanks[p2Uid].y = 225;
          tanks[p2Uid].angle = Math.PI;
          tanks[p2Uid].alive = true;
          bullets.length = 0;
        }
        return;
      }

      // 1. Local Player Controls
      const myTank = tanks[playerUid];
      if (myTank && myTank.alive) {
        myTank.reload = Math.max(0, myTank.reload - dt);

        const isLeft = keysDown.current['a'] || keysDown.current['arrowleft'] || mobileControls.current.left;
        const isRight = keysDown.current['d'] || keysDown.current['arrowright'] || mobileControls.current.right;
        const isFwd = keysDown.current['w'] || keysDown.current['arrowup'] || mobileControls.current.forward;
        const isFire = keysDown.current[' '] || keysDown.current['enter'] || mobileControls.current.fire;

        if (isLeft) myTank.angle -= ROT_SPEED;
        if (isRight) myTank.angle += ROT_SPEED;

        if (isFwd) {
          const nextX = myTank.x + Math.cos(myTank.angle) * MOVE_SPEED;
          const nextY = myTank.y + Math.sin(myTank.angle) * MOVE_SPEED;

          // Arena boundary check
          if (nextX >= TANK_RADIUS + 8 && nextX <= W - TANK_RADIUS - 8) myTank.x = nextX;
          if (nextY >= TANK_RADIUS + 8 && nextY <= H - TANK_RADIUS - 8) myTank.y = nextY;
        }

        if (isFire && myTank.reload === 0) {
          fireBullet(playerUid);
          mobileControls.current.fire = false;
        }
      }

      // 2. CyberBot AI Behavior (Master-tier competitive tank AI)
      if (isHost && isBotPlaying) {
        const botTank = tanks[p2Uid];
        const humanTank = tanks[p1Uid];

        if (botTank && botTank.alive && humanTank && humanTank.alive) {
          botTank.reload = Math.max(0, botTank.reload - dt);

          // Vector to human tank
          const dx = humanTank.x - botTank.x;
          const dy = humanTank.y - botTank.y;
          const dist = Math.hypot(dx, dy);

          // Lead aiming based on player's position
          const targetAngle = Math.atan2(dy, dx);

          // Responsive turning towards target
          let angleDiff = targetAngle - botTank.angle;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

          if (Math.abs(angleDiff) > 0.05) {
            botTank.angle += Math.sign(angleDiff) * ROT_SPEED * 1.25;
          }

          // Tactical maneuvering: keep 160-260 distance, strafe and advance
          let moveDir = 0;
          if (dist > 240) {
            moveDir = 1; // Advance
          } else if (dist < 130) {
            moveDir = -0.7; // Tactical retreat
          } else {
            // Circle strafe
            botTank.angle += 0.02;
            moveDir = 0.5;
          }

          const nextX = botTank.x + Math.cos(botTank.angle) * MOVE_SPEED * 0.85 * moveDir;
          const nextY = botTank.y + Math.sin(botTank.angle) * MOVE_SPEED * 0.85 * moveDir;

          // Arena boundary clamp
          if (nextX >= TANK_RADIUS + 12 && nextX <= W - TANK_RADIUS - 12) botTank.x = nextX;
          if (nextY >= TANK_RADIUS + 12 && nextY <= H - TANK_RADIUS - 12) botTank.y = nextY;

          // Fire when aimed accurately at player
          if (Math.abs(angleDiff) < 0.28 && botTank.reload === 0) {
            fireBullet(p2Uid);
          }
        }
      }

      // 3. Bullets Physics & Ricochets
      for (const b of bullets) {
        if (!b.alive) continue;

        b.x += b.vx;
        b.y += b.vy;

        // Arena Wall Bounces (Left, Right, Top, Bottom)
        if (b.x <= 8 || b.x >= W - 8) {
          b.vx = -b.vx;
          b.bounces++;
          juice.emitSparks(b.x, b.y, 6, '#22d3ee', '#38bdf8', 2);
          soundService.playImpact(0.7);
        }
        if (b.y <= 8 || b.y >= H - 8) {
          b.vy = -b.vy;
          b.bounces++;
          juice.emitSparks(b.x, b.y, 6, '#22d3ee', '#38bdf8', 2);
          soundService.playImpact(0.7);
        }

        // Obstacle Bounces
        for (const obs of obstacles) {
          if (b.x >= obs.x && b.x <= obs.x + obs.w && b.y >= obs.y && b.y <= obs.y + obs.h) {
            b.vx = -b.vx;
            b.vy = -b.vy;
            b.bounces++;
            juice.emitSparks(b.x, b.y, 6, '#f59e0b', '#fbbf24', 2);
            break;
          }
        }

        if (b.bounces > 2) {
          b.alive = false;
          continue;
        }

        // Tank Hit Detection
        for (const [uid, tank] of Object.entries(tanks)) {
          if (!tank.alive) continue;
          const hitDist = Math.hypot(b.x - tank.x, b.y - tank.y);
          if (hitDist <= TANK_RADIUS) {
            b.alive = false;
            tank.alive = false;
            roundFinished = true;
            roundPauseTimer = 2.0;

            const victorUid = uid === p1Uid ? p2Uid : p1Uid;
            setRoundWinner(victorUid === p1Uid ? p1Nickname : p2Nickname);

            juice.addTrauma(0.7);
            juice.emitExplosion(tank.x, tank.y, 60);
            soundService.playGoal();

            if (isHost) {
              onDispatchAction('PONG_GOAL', { scorerUid: victorUid });
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

      // Scale to internal coordinates (600x450)
      const scaleX = canvasMgr.width / W;
      const scaleY = canvasMgr.height / H;
      ctx.scale(scaleX, scaleY);

      // Arena Floor
      const floorGrad = ctx.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, W);
      floorGrad.addColorStop(0, '#0a1020');
      floorGrad.addColorStop(1, '#03060c');
      ctx.fillStyle = floorGrad;
      ctx.fillRect(0, 0, W, H);

      // Grid Lines
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.08)';
      ctx.lineWidth = 1;
      for (let x = 30; x < W; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = 30; y < H; y += 30) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      // Outer Arena Neon Border
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 4;
      ctx.strokeRect(4, 4, W - 8, H - 8);

      // Obstacles
      for (const obs of obstacles) {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
      }

      // Bullets
      for (const b of bullets) {
        if (!b.alive) continue;
        ctx.fillStyle = '#fbbf24';
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Tanks
      for (const [uid, tank] of Object.entries(tanks)) {
        if (!tank.alive) continue;

        ctx.save();
        ctx.translate(tank.x, tank.y);
        ctx.rotate(tank.angle);

        // Tank Treads
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(-TANK_RADIUS - 2, -TANK_RADIUS, TANK_RADIUS * 2 + 4, 6);
        ctx.fillRect(-TANK_RADIUS - 2, TANK_RADIUS - 6, TANK_RADIUS * 2 + 4, 6);

        // Tank Hull
        ctx.fillStyle = tank.color;
        ctx.shadowColor = tank.color;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.roundRect(-TANK_RADIUS + 2, -TANK_RADIUS + 5, TANK_RADIUS * 2 - 4, TANK_RADIUS * 2 - 10, 4);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Turret Barrel
        ctx.fillStyle = tank.turretColor;
        ctx.fillRect(0, -3, TANK_RADIUS + 8, 6);

        // Turret Dome
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }

      juice.renderParticles(ctx, 1.0);

      // Round Winner Overlay
      if (roundWinner) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 32px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`💥 ${roundWinner.toUpperCase()} SCORED!`, W / 2, H / 2);
      }

      ctx.restore();
    };

    const loop = new GameLoop({ update, render: () => render() });
    loop.start();

    return () => {
      loop.stop();
    };
  }, [p1Uid, p2Uid, isHost, isBotPlaying]);

  return (
    <div ref={containerRef} className="w-full max-w-2xl mx-auto flex flex-col items-center select-none gap-3 px-2">
      {/* Tank Duel Canvas Container */}
      <div className="w-full aspect-[4/3] rounded-3xl overflow-hidden shadow-2xl border-2 border-emerald-500/40 relative bg-slate-950">
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>

      {/* Tactile On-Screen Game Controls */}
      <div className="w-full grid grid-cols-2 gap-4 max-w-md pt-2">
        {/* Direction Steering */}
        <div className="flex items-center justify-center gap-2">
          <button
            onPointerDown={() => { mobileControls.current.left = true; }}
            onPointerUp={() => { mobileControls.current.left = false; }}
            className="w-14 h-14 rounded-2xl bg-slate-900 border-2 border-slate-700 hover:border-cyan-400 active:scale-90 flex items-center justify-center text-xl font-bold shadow-lg"
          >
            ↺
          </button>
          <button
            onPointerDown={() => { mobileControls.current.forward = true; }}
            onPointerUp={() => { mobileControls.current.forward = false; }}
            className="w-14 h-14 rounded-2xl bg-emerald-500/20 border-2 border-emerald-400 hover:bg-emerald-500/30 active:scale-90 flex items-center justify-center text-xl font-bold text-emerald-300 shadow-lg shadow-emerald-500/20"
          >
            ▲
          </button>
          <button
            onPointerDown={() => { mobileControls.current.right = true; }}
            onPointerUp={() => { mobileControls.current.right = false; }}
            className="w-14 h-14 rounded-2xl bg-slate-900 border-2 border-slate-700 hover:border-cyan-400 active:scale-90 flex items-center justify-center text-xl font-bold shadow-lg"
          >
            ↻
          </button>
        </div>

        {/* Fire Trigger */}
        <div className="flex items-center justify-center">
          <button
            onClick={() => { mobileControls.current.fire = true; }}
            className="w-full h-14 rounded-2xl bg-gradient-to-r from-amber-500 to-rose-500 border-2 border-amber-300 active:scale-95 flex items-center justify-center gap-2 text-base font-black text-slate-950 shadow-xl shadow-amber-500/30"
          >
            <span>💥 FIRE</span>
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-400 font-mono">
        Desktop: Arrow Keys / WASD + Space to Fire • Bullets ricochet off barricades!
      </p>
    </div>
  );
};
