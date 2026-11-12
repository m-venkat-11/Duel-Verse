import React, { useEffect, useRef, useState } from 'react';
import type { AuthoritativeRoomState } from '../../types/room';
import type { TankDuelState } from '../../engine/tankDuelEngine';
import { GameLoop } from '../../engine/core/GameLoop';
import { CanvasManager } from '../../engine/core/CanvasManager';
import { JuiceEngine } from '../../engine/core/JuiceEngine';
import { soundService } from '../../services/sound';
import { RotateCcw, ArrowUp, ArrowDown, RotateCw, Flame, Sparkles, Crosshair } from 'lucide-react';

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
  age: number;
  ownerUid: string;
  alive: boolean;
  trail: Array<{ x: number; y: number }>;
}

interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
  flash: number;
}

interface TreadMark {
  x: number;
  y: number;
  angle: number;
  alpha: number;
}

interface ShockRing {
  x: number;
  y: number;
  r: number;
  maxR: number;
  color: string;
  alpha: number;
}

export const TankDuelView: React.FC<TankDuelViewProps> = ({ room, playerUid, onDispatchAction }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const gameState = room.gameState;
  const players = Object.keys(room.players);
  const p1Uid = players[0] || 'p1';
  const p2Uid = players[1] || (p1Uid === 'bot_rival' ? 'player' : 'bot_rival');
  const isHost = room.hostUid === playerUid;
  const isBotPlaying = Boolean(
    room.players['bot_rival'] || p2Uid === 'bot_rival' || p2Uid.startsWith('bot_') || players.length < 2
  );

  const p1Nickname = room.players[p1Uid]?.nickname || 'Player 1';
  const p2Nickname = room.players[p2Uid]?.nickname || 'CyberBot';

  const [roundWinnerName, setRoundWinnerName] = useState<string | null>(null);
  const roundWinnerNameRef = useRef<string | null>(null);
  const [controlMode, setControlMode] = useState<'classic' | 'onebutton'>('classic');
  const controlModeRef = useRef(controlMode);
  controlModeRef.current = controlMode;

  const onDispatchActionRef = useRef(onDispatchAction);
  onDispatchActionRef.current = onDispatchAction;
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  const keysDown = useRef<{ [key: string]: boolean }>({});
  const mobileControls = useRef({
    left: false,
    right: false,
    forward: false,
    backward: false,
    fire: false,
    oneButtonDown: false
  });

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keysDown.current[k] = true;
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) {
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
    if (!canvas) return;

    const canvasMgr = new CanvasManager(canvas);
    const juice = new JuiceEngine(420);

    const W = 640;
    const H = 480;
    const TANK_RADIUS = 19;
    const MOVE_SPEED = 165; // px per second
    const ROT_SPEED = 3.4; // radians per second
    const BULLET_SPEED = 360; // px per second

    const obstacles: Obstacle[] = [
      { x: 132, y: 88, w: 34, h: 110, flash: 0 },
      { x: 132, y: 282, w: 34, h: 110, flash: 0 },
      { x: 474, y: 88, w: 34, h: 110, flash: 0 },
      { x: 474, y: 282, w: 34, h: 110, flash: 0 },
      { x: 286, y: 192, w: 68, h: 96, flash: 0 },
      { x: 270, y: 58, w: 100, h: 24, flash: 0 },
      { x: 270, y: 398, w: 100, h: 24, flash: 0 }
    ];

    const treadMarks: TreadMark[] = [];
    const rings: ShockRing[] = [];
    const bullets: Bullet[] = [];

    const tanks = {
      [p1Uid]: {
        x: 72,
        y: 240,
        angle: 0,
        color: '#f59e0b',
        turretColor: '#fbbf24',
        reload: 0,
        alive: true,
        recoil: 0,
        muzzleFlash: 0,
        trackAnim: 0,
        shieldTimer: 0.8
      },
      [p2Uid]: {
        x: 568,
        y: 240,
        angle: Math.PI,
        color: '#06b6d4',
        turretColor: '#22d3ee',
        reload: 0,
        alive: true,
        recoil: 0,
        muzzleFlash: 0,
        trackAnim: 0,
        shieldTimer: 0.8
      }
    };

    const tankDriving = { [p1Uid]: false, [p2Uid]: false };
    let roundPauseTimer = 0;
    let isRoundOver = false;
    let botDecisionTimer = 0;
    let botTurnBias = 1;

    // On-canvas analog touch steering
    const touchDrag = { active: false, startX: 0, startY: 0, currX: 0, currY: 0 };
    let cachedRect = canvas.getBoundingClientRect();
    const refreshRect = () => {
      cachedRect = canvas.getBoundingClientRect();
    };
    window.addEventListener('resize', refreshRect, { passive: true });

    const onPointerDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      refreshRect();
      const px = ((e.clientX - cachedRect.left) / Math.max(1, cachedRect.width)) * W;
      const py = ((e.clientY - cachedRect.top) / Math.max(1, cachedRect.height)) * H;
      touchDrag.active = true;
      touchDrag.startX = px;
      touchDrag.startY = py;
      touchDrag.currX = px;
      touchDrag.currY = py;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!touchDrag.active) return;
      touchDrag.currX = ((e.clientX - cachedRect.left) / Math.max(1, cachedRect.width)) * W;
      touchDrag.currY = ((e.clientY - cachedRect.top) / Math.max(1, cachedRect.height)) * H;
    };
    const onPointerUp = () => {
      touchDrag.active = false;
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);

    const pointBlocked = (px: number, py: number, pad = 2): boolean => {
      if (px <= 12 + pad || px >= W - 12 - pad || py <= 12 + pad || py >= H - 12 - pad) return true;
      for (const obs of obstacles) {
        if (px >= obs.x - pad && px <= obs.x + obs.w + pad && py >= obs.y - pad && py <= obs.y + obs.h + pad) {
          return true;
        }
      }
      return false;
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
          cx += (dx / dist) * overlap;
          cy += (dy / dist) * overlap;
        }
      }
      cx = Math.max(radius + 12, Math.min(W - radius - 12, cx));
      cy = Math.max(radius + 12, Math.min(H - radius - 12, cy));
      return { x: cx, y: cy };
    };

    const raycastDistance = (sx: number, sy: number, ang: number, maxDist: number): number => {
      const step = 6;
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      for (let d = 8; d <= maxDist; d += step) {
        if (pointBlocked(sx + cos * d, sy + sin * d, 3)) return d;
      }
      return maxDist;
    };

    const fireBullet = (ownerUid: string) => {
      const t = tanks[ownerUid];
      if (!t || !t.alive || t.reload > 0) return;

      // Active shell cap per tank (prevents bullet spam)
      const activeOwn = bullets.filter((b) => b.alive && b.ownerUid === ownerUid).length;
      if (activeOwn >= 3) return;

      t.reload = 0.34;
      t.recoil = 10;
      t.muzzleFlash = 1.0;

      // Safe muzzle spawn: find furthest unblocked point along barrel up to TANK_RADIUS + 10
      let spawnDist = TANK_RADIUS + 10;
      while (spawnDist > 6 && pointBlocked(t.x + Math.cos(t.angle) * spawnDist, t.y + Math.sin(t.angle) * spawnDist, 2)) {
        spawnDist -= 4;
      }

      const tipX = t.x + Math.cos(t.angle) * spawnDist;
      const tipY = t.y + Math.sin(t.angle) * spawnDist;

      bullets.push({
        x: tipX,
        y: tipY,
        vx: Math.cos(t.angle) * BULLET_SPEED,
        vy: Math.sin(t.angle) * BULLET_SPEED,
        bounces: 0,
        age: 0,
        ownerUid,
        alive: true,
        trail: []
      });

      juice.addTrauma(0.24);
      juice.playSound('shoot');
      const col = ownerUid === p1Uid ? '#fbbf24' : '#22d3ee';
      juice.emitSparks(tipX, tipY, 12, col, '#ffffff', 4);
      rings.push({ x: tipX, y: tipY, r: 4, maxR: 26, color: col, alpha: 0.85 });
    };

    const resetRound = () => {
      isRoundOver = false;
      roundWinnerNameRef.current = null;
      setRoundWinnerName(null);
      tanks[p1Uid].x = 72;
      tanks[p1Uid].y = 240;
      tanks[p1Uid].angle = 0;
      tanks[p1Uid].alive = true;
      tanks[p1Uid].recoil = 0;
      tanks[p1Uid].reload = 0;
      tanks[p1Uid].shieldTimer = 0.8;
      tankDriving[p1Uid] = false;

      tanks[p2Uid].x = 568;
      tanks[p2Uid].y = 240;
      tanks[p2Uid].angle = Math.PI;
      tanks[p2Uid].alive = true;
      tanks[p2Uid].recoil = 0;
      tanks[p2Uid].reload = 0;
      tanks[p2Uid].shieldTimer = 0.8;
      tankDriving[p2Uid] = false;

      bullets.length = 0;
    };

    const update = (dt: number) => {
      const cdt = Math.min(0.04, dt);
      juice.update(cdt);

      for (const obs of obstacles) {
        obs.flash = Math.max(0, obs.flash - cdt * 3.5);
      }

      for (let i = treadMarks.length - 1; i >= 0; i--) {
        treadMarks[i].alpha -= cdt * 0.14;
        if (treadMarks[i].alpha <= 0) treadMarks.splice(i, 1);
      }

      for (let i = rings.length - 1; i >= 0; i--) {
        const ring = rings[i];
        ring.r += cdt * 120;
        ring.alpha -= cdt * 2.5;
        if (ring.alpha <= 0 || ring.r >= ring.maxR) rings.splice(i, 1);
      }

      if (isRoundOver) {
        roundPauseTimer -= cdt;
        if (roundPauseTimer <= 0) {
          resetRound();
        }
        return;
      }

      // 1. Player Tank Controls
      const myTank = tanks[playerUid];
      if (myTank && myTank.alive) {
        myTank.reload = Math.max(0, myTank.reload - cdt);
        myTank.recoil = Math.max(0, myTank.recoil - cdt * 32);
        myTank.muzzleFlash = Math.max(0, myTank.muzzleFlash - cdt * 10);
        myTank.shieldTimer = Math.max(0, myTank.shieldTimer - cdt);

        if (controlModeRef.current === 'onebutton') {
          const isHolding =
            mobileControls.current.oneButtonDown ||
            keysDown.current[' '] ||
            keysDown.current['w'] ||
            keysDown.current['arrowup'] ||
            keysDown.current['enter'];

          if (isHolding) {
            tankDriving[playerUid] = true;
            const resolved = resolveTankWallSlide(
              myTank.x + Math.cos(myTank.angle) * MOVE_SPEED * cdt,
              myTank.y + Math.sin(myTank.angle) * MOVE_SPEED * cdt,
              TANK_RADIUS
            );
            myTank.x = resolved.x;
            myTank.y = resolved.y;
            myTank.trackAnim += cdt * 16;
            if (Math.random() < 0.3) treadMarks.push({ x: myTank.x, y: myTank.y, angle: myTank.angle, alpha: 0.45 });
          } else {
            if (tankDriving[playerUid]) {
              fireBullet(playerUid);
              tankDriving[playerUid] = false;
            }
            myTank.angle += ROT_SPEED * 1.15 * cdt;
          }
        } else {
          // Classic + Smooth Touch Analog Steering
          let moveMul = 0;

          if (touchDrag.active) {
            const tdx = touchDrag.currX - touchDrag.startX;
            const tdy = touchDrag.currY - touchDrag.startY;
            const tdist = Math.hypot(tdx, tdy);
            if (tdist > 10) {
              const targetAngle = Math.atan2(tdy, tdx);
              let diff = targetAngle - myTank.angle;
              while (diff > Math.PI) diff -= Math.PI * 2;
              while (diff < -Math.PI) diff += Math.PI * 2;
              const maxTurn = ROT_SPEED * 1.5 * cdt;
              myTank.angle += Math.abs(diff) <= maxTurn ? diff : Math.sign(diff) * maxTurn;
              moveMul = Math.min(1, tdist / 40);
            }
          }

          const isLeft = keysDown.current['a'] || keysDown.current['arrowleft'] || mobileControls.current.left;
          const isRight = keysDown.current['d'] || keysDown.current['arrowright'] || mobileControls.current.right;
          const isFwd = keysDown.current['w'] || keysDown.current['arrowup'] || mobileControls.current.forward;
          const isBack = keysDown.current['s'] || keysDown.current['arrowdown'] || mobileControls.current.backward;
          const isFire = keysDown.current[' '] || keysDown.current['enter'] || mobileControls.current.fire;

          if (isLeft) myTank.angle -= ROT_SPEED * cdt;
          if (isRight) myTank.angle += ROT_SPEED * cdt;

          if (isFwd) moveMul = 1;
          else if (isBack) moveMul = -0.7;

          if (Math.abs(moveMul) > 0.05) {
            const resolved = resolveTankWallSlide(
              myTank.x + Math.cos(myTank.angle) * MOVE_SPEED * moveMul * cdt,
              myTank.y + Math.sin(myTank.angle) * MOVE_SPEED * moveMul * cdt,
              TANK_RADIUS
            );
            myTank.x = resolved.x;
            myTank.y = resolved.y;
            myTank.trackAnim += cdt * 16 * Math.sign(moveMul);
            if (Math.random() < 0.3) treadMarks.push({ x: myTank.x, y: myTank.y, angle: myTank.angle, alpha: 0.45 });
          }

          if (isFire && myTank.reload === 0) {
            fireBullet(playerUid);
            mobileControls.current.fire = false;
          }
        }
      }

      // 2. Smart Whisker-Guided CyberBot AI
      if (isHost && isBotPlaying) {
        const botTank = tanks[p2Uid];
        const humanTank = tanks[p1Uid];

        if (botTank && botTank.alive && humanTank && humanTank.alive) {
          botTank.reload = Math.max(0, botTank.reload - cdt);
          botTank.recoil = Math.max(0, botTank.recoil - cdt * 32);
          botTank.muzzleFlash = Math.max(0, botTank.muzzleFlash - cdt * 10);
          botTank.shieldTimer = Math.max(0, botTank.shieldTimer - cdt);

          botDecisionTimer -= cdt;
          if (botDecisionTimer <= 0) {
            botDecisionTimer = 0.7 + Math.random() * 0.6;
            botTurnBias = Math.random() < 0.5 ? 1 : -1;
          }

          const dx = humanTank.x - botTank.x;
          const dy = humanTank.y - botTank.y;
          const distToHuman = Math.hypot(dx, dy);
          const angleToHuman = Math.atan2(dy, dx);

          // Whisker obstacle sensors
          const frontClear = raycastDistance(botTank.x, botTank.y, botTank.angle, 70);
          const leftClear = raycastDistance(botTank.x, botTank.y, botTank.angle - 0.7, 70);
          const rightClear = raycastDistance(botTank.x, botTank.y, botTank.angle + 0.7, 70);

          let desiredAngle = angleToHuman;
          let driveSpeed = 0.85;

          if (frontClear < 42) {
            // Avoid obstacle cleanly instead of pushing into wall!
            desiredAngle = leftClear > rightClear ? botTank.angle - 1.1 : botTank.angle + 1.1;
            if (leftClear < 35 && rightClear < 35) desiredAngle = botTank.angle + Math.PI * 0.7 * botTurnBias;
          } else if (distToHuman < 130) {
            // Keep tactical spacing
            driveSpeed = -0.45;
          }

          let angleDiff = desiredAngle - botTank.angle;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

          const turnStep = ROT_SPEED * 1.1 * cdt;
          botTank.angle += Math.abs(angleDiff) <= turnStep ? angleDiff : Math.sign(angleDiff) * turnStep;

          const resolved = resolveTankWallSlide(
            botTank.x + Math.cos(botTank.angle) * MOVE_SPEED * driveSpeed * cdt,
            botTank.y + Math.sin(botTank.angle) * MOVE_SPEED * driveSpeed * cdt,
            TANK_RADIUS
          );
          botTank.x = resolved.x;
          botTank.y = resolved.y;
          botTank.trackAnim += cdt * 15;
          if (Math.random() < 0.25) treadMarks.push({ x: botTank.x, y: botTank.y, angle: botTank.angle, alpha: 0.4 });

          // Fire only when roughly aimed toward player and clear of immediate obstacle
          let aimDiff = angleToHuman - botTank.angle;
          while (aimDiff > Math.PI) aimDiff -= Math.PI * 2;
          while (aimDiff < -Math.PI) aimDiff += Math.PI * 2;
          if (Math.abs(aimDiff) < 0.22 && frontClear > 32 && botTank.reload === 0) {
            fireBullet(p2Uid);
          }
        }
      }

      // 3. Bullets Physics, Ricochets & Hit Detection (Sub-stepped to prevent tunneling)
      for (const b of bullets) {
        if (!b.alive) continue;
        b.age += cdt;

        b.trail.push({ x: b.x, y: b.y });
        if (b.trail.length > 10) b.trail.shift();

        const steps = 2;
        const subDt = cdt / steps;

        for (let s = 0; s < steps; s++) {
          if (!b.alive) break;
          b.x += b.vx * subDt;
          b.y += b.vy * subDt;

          // Arena walls
          let bounced = false;
          if (b.x <= 10) {
            b.x = 10;
            b.vx = Math.abs(b.vx);
            bounced = true;
          } else if (b.x >= W - 10) {
            b.x = W - 10;
            b.vx = -Math.abs(b.vx);
            bounced = true;
          }
          if (b.y <= 10) {
            b.y = 10;
            b.vy = Math.abs(b.vy);
            bounced = true;
          } else if (b.y >= H - 10) {
            b.y = H - 10;
            b.vy = -Math.abs(b.vy);
            bounced = true;
          }

          if (bounced) {
            b.bounces++;
            juice.emitSparks(b.x, b.y, 7, '#22d3ee', '#ffffff', 3);
            soundService.playImpact(0.75);
          }

          // Obstacles
          for (const obs of obstacles) {
            if (b.x >= obs.x && b.x <= obs.x + obs.w && b.y >= obs.y && b.y <= obs.y + obs.h) {
              const fromLeft = Math.abs(b.x - obs.x);
              const fromRight = Math.abs(b.x - (obs.x + obs.w));
              const fromTop = Math.abs(b.y - obs.y);
              const fromBottom = Math.abs(b.y - (obs.y + obs.h));
              const minEdge = Math.min(fromLeft, fromRight, fromTop, fromBottom);

              if (minEdge === fromLeft) {
                b.x = obs.x - 1;
                b.vx = -Math.abs(b.vx);
              } else if (minEdge === fromRight) {
                b.x = obs.x + obs.w + 1;
                b.vx = Math.abs(b.vx);
              } else if (minEdge === fromTop) {
                b.y = obs.y - 1;
                b.vy = -Math.abs(b.vy);
              } else {
                b.y = obs.y + obs.h + 1;
                b.vy = Math.abs(b.vy);
              }

              obs.flash = 1.0;
              b.bounces++;
              juice.emitSparks(b.x, b.y, 8, '#f59e0b', '#ffffff', 3);
              soundService.playImpact(0.8);
              break;
            }
          }

          if (b.bounces > 4) {
            b.alive = false;
            juice.emitSparks(b.x, b.y, 6, '#94a3b8', '#ffffff', 2);
            break;
          }

          // Tank Hit Detection (with 0.16s own-muzzle immunity + spawn shield protection)
          for (const [uid, tank] of Object.entries(tanks)) {
            if (!tank.alive || tank.shieldTimer > 0) continue;
            if (b.ownerUid === uid && b.age < 0.16) continue;

            const hitDist = Math.hypot(b.x - tank.x, b.y - tank.y);
            if (hitDist <= TANK_RADIUS + 3) {
              b.alive = false;
              tank.alive = false;
              isRoundOver = true;
              roundPauseTimer = 1.8;

              const victorUid = uid === p1Uid ? p2Uid : p1Uid;
              const victorName = victorUid === p1Uid ? p1Nickname : p2Nickname;
              roundWinnerNameRef.current = victorName;
              setRoundWinnerName(victorName);

              juice.addTrauma(0.85);
              juice.triggerHitStop(60);
              juice.emitExplosion(tank.x, tank.y, 80);
              rings.push({ x: tank.x, y: tank.y, r: 8, maxR: 95, color: '#fbbf24', alpha: 1.0 });
              soundService.playGoal();

              if (isHost) {
                onDispatchActionRef.current('TANK_KILL', {
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
      }

      // Clean dead bullets
      for (let i = bullets.length - 1; i >= 0; i--) {
        if (!bullets[i].alive) bullets.splice(i, 1);
      }
    };

    const drawLaserSight = (ctx: CanvasRenderingContext2D, tank: typeof tanks[string]) => {
      let x = tank.x + Math.cos(tank.angle) * (TANK_RADIUS + 12);
      let y = tank.y + Math.sin(tank.angle) * (TANK_RADIUS + 12);
      let vx = Math.cos(tank.angle);
      let vy = Math.sin(tank.angle);

      ctx.save();
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.32)';
      ctx.setLineDash([4, 6]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);

      let bounces = 0;
      for (let d = 0; d < 180; d += 5) {
        x += vx * 5;
        y += vy * 5;
        let hit = false;
        if (x <= 10 || x >= W - 10) {
          vx = -vx;
          hit = true;
        } else if (y <= 10 || y >= H - 10) {
          vy = -vy;
          hit = true;
        } else {
          for (const obs of obstacles) {
            if (x >= obs.x && x <= obs.x + obs.w && y >= obs.y && y <= obs.y + obs.h) {
              const dl = Math.abs(x - obs.x);
              const dr = Math.abs(x - (obs.x + obs.w));
              const dt = Math.abs(y - obs.y);
              const db = Math.abs(y - (obs.y + obs.h));
              if (Math.min(dl, dr) < Math.min(dt, db)) vx = -vx;
              else vy = -vy;
              hit = true;
              break;
            }
          }
        }
        if (hit) {
          ctx.lineTo(x, y);
          bounces++;
          if (bounces > 1) break;
        }
      }
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.setLineDash([]);
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

      // 1. Tactical Cyber Floor
      const floorGrad = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.72);
      floorGrad.addColorStop(0, '#0f172a');
      floorGrad.addColorStop(0.65, '#070b14');
      floorGrad.addColorStop(1, '#02040a');
      ctx.fillStyle = floorGrad;
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.06)';
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

      // Tread tracks
      for (const tm of treadMarks) {
        ctx.save();
        ctx.translate(tm.x, tm.y);
        ctx.rotate(tm.angle);
        ctx.fillStyle = `rgba(0, 0, 0, ${tm.alpha * 0.5})`;
        ctx.fillRect(-10, -TANK_RADIUS, 5, 4);
        ctx.fillRect(-10, TANK_RADIUS - 4, 5, 4);
        ctx.restore();
      }

      // Arena Neon Walls
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.8)';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 16;
      ctx.strokeRect(6, 6, W - 12, H - 12);
      ctx.shadowBlur = 0;

      // 2. 3D Armored Obstacles
      for (const obs of obstacles) {
        // Drop shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(obs.x + 5, obs.y + 6, obs.w, obs.h);

        // Armor base
        const obsGrad = ctx.createLinearGradient(obs.x, obs.y, obs.x + obs.w, obs.y + obs.h);
        obsGrad.addColorStop(0, '#334155');
        obsGrad.addColorStop(1, '#0f172a');
        ctx.fillStyle = obsGrad;
        ctx.fillRect(obs.x, obs.y, obs.w, obs.h);

        // Inner recessed plate
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(obs.x + 4, obs.y + 4, obs.w - 8, obs.h - 8);

        // Border glow (flashes bright amber/white on shell ricochet)
        ctx.strokeStyle = obs.flash > 0.1 ? `rgba(251, 191, 36, ${0.5 + obs.flash * 0.5})` : '#38bdf8';
        ctx.lineWidth = obs.flash > 0.1 ? 3 : 2;
        ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
      }

      // Laser sight preview for human tank
      const myTank = tanks[playerUid];
      if (myTank && myTank.alive) drawLaserSight(ctx, myTank);

      // 3. Shockwaves
      for (const ring of rings) {
        ctx.save();
        ctx.strokeStyle = ring.color;
        ctx.globalAlpha = ring.alpha;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // 4. Plasma Shells
      for (const b of bullets) {
        if (!b.alive) continue;
        const bCol = b.ownerUid === p1Uid ? '#f59e0b' : '#06b6d4';

        for (let i = 0; i < b.trail.length; i++) {
          const pt = b.trail[i];
          ctx.fillStyle = bCol;
          ctx.globalAlpha = (i / b.trail.length) * 0.55;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 2 + (i / b.trail.length) * 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = bCol;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // 5. Armored Tanks
      for (const [uid, tank] of Object.entries(tanks)) {
        if (!tank.alive) continue;

        ctx.save();
        ctx.translate(tank.x, tank.y);

        // Spawn shield aura
        if (tank.shieldTimer > 0) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.arc(0, 0, TANK_RADIUS + 8, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        ctx.rotate(tank.angle);
        const rec = -tank.recoil;

        // Ground shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.beginPath();
        ctx.roundRect(-TANK_RADIUS + 2, -TANK_RADIUS + 3, TANK_RADIUS * 2, TANK_RADIUS * 2, 6);
        ctx.fill();

        // Heavy Treads
        ctx.fillStyle = '#020617';
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1;
        ctx.fillRect(-TANK_RADIUS - 3 + rec, -TANK_RADIUS, TANK_RADIUS * 2 + 6, 7);
        ctx.strokeRect(-TANK_RADIUS - 3 + rec, -TANK_RADIUS, TANK_RADIUS * 2 + 6, 7);
        ctx.fillRect(-TANK_RADIUS - 3 + rec, TANK_RADIUS - 7, TANK_RADIUS * 2 + 6, 7);
        ctx.strokeRect(-TANK_RADIUS - 3 + rec, TANK_RADIUS - 7, TANK_RADIUS * 2 + 6, 7);

        ctx.fillStyle = '#64748b';
        for (let i = -TANK_RADIUS; i < TANK_RADIUS; i += 7) {
          const offset = ((i + tank.trackAnim) % 7 + 7) % 7;
          ctx.fillRect(-TANK_RADIUS + offset + i * 0 + rec, -TANK_RADIUS, 2, 7);
        }

        // Hull armor plate
        ctx.fillStyle = tank.color;
        ctx.shadowColor = tank.color;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.roundRect(-TANK_RADIUS + 2 + rec, -TANK_RADIUS + 6, TANK_RADIUS * 2 - 4, TANK_RADIUS * 2 - 12, 5);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Cannon Barrel
        ctx.fillStyle = tank.turretColor;
        ctx.fillRect(0 + rec, -3.5, TANK_RADIUS + 11, 7);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(TANK_RADIUS + 8 + rec, -5, 4, 10);

        // Muzzle flash cone
        if (tank.muzzleFlash > 0) {
          ctx.fillStyle = `rgba(255, 255, 255, ${tank.muzzleFlash})`;
          ctx.beginPath();
          ctx.moveTo(TANK_RADIUS + 12, 0);
          ctx.lineTo(TANK_RADIUS + 32, -9);
          ctx.lineTo(TANK_RADIUS + 32, 9);
          ctx.closePath();
          ctx.fill();
        }

        // Turret Dome
        ctx.fillStyle = tank.turretColor;
        ctx.shadowColor = tank.turretColor;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(rec, 0, 9.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(rec, 0, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        // Player tag above tank
        ctx.fillStyle = uid === playerUid ? '#ffffff' : tank.turretColor;
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(uid === playerUid ? 'YOU' : uid === p1Uid ? p1Nickname.slice(0, 8) : p2Nickname.slice(0, 8), tank.x, tank.y - TANK_RADIUS - 8);
      }

      // Analog Joystick Overlay on touch
      if (touchDrag.active && controlModeRef.current === 'classic') {
        ctx.save();
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.45)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(touchDrag.startX, touchDrag.startY, 32, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(251, 191, 36, 0.7)';
        ctx.beginPath();
        ctx.arc(touchDrag.currX, touchDrag.currY, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      juice.renderParticles(ctx, 1.0);

      const curWinner = roundWinnerNameRef.current;
      if (curWinner) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fbbf24';
        ctx.font = '900 32px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 20;
        ctx.fillText(`💥 ${curWinner.toUpperCase()} DESTROYED RIVAL!`, W / 2, H / 2 + 8);
        ctx.shadowBlur = 0;
      }

      ctx.restore();
    };

    const loop = new GameLoop({ update, render });
    loop.start();

    return () => {
      loop.stop();
      window.removeEventListener('resize', refreshRect);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
    };
  }, [p1Uid, p2Uid, isHost, isBotPlaying, p1Nickname, p2Nickname, playerUid]);

  const p1Score = room.scores[p1Uid] ?? gameState.scores?.[p1Uid] ?? 0;
  const p2Score = room.scores[p2Uid] ?? gameState.scores?.[p2Uid] ?? 0;

  return (
    <div ref={containerRef} className="w-full max-w-2xl mx-auto flex flex-col items-center select-none gap-2.5 px-2">
      {/* Control Mode & Score Header */}
      <div className="flex items-center justify-between w-full px-3.5 py-2 rounded-2xl bg-slate-900/90 border border-slate-700/60 text-xs font-mono shadow-md">
        <div className="flex items-center gap-2">
          <span className="text-amber-400 font-black">{p1Nickname}</span>
          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-black">{p1Score}</span>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-600/20 border border-violet-500/40 text-violet-300 text-[10px] font-bold">
          <Crosshair className="w-3 h-3 text-cyan-400" />
          <span>FIRST TO {room.maxRounds || gameState.targetScore || 3}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-black">{p2Score}</span>
          <span className="text-cyan-400 font-black">{p2Nickname}</span>
          <button
            onClick={() => setControlMode(controlMode === 'classic' ? 'onebutton' : 'classic')}
            className="ml-1 px-2 py-1 rounded-xl bg-violet-600/30 hover:bg-violet-600/50 border border-violet-400/40 text-violet-200 font-bold text-[10px] transition cursor-pointer"
          >
            {controlMode === 'onebutton' ? '⚡ 1-Btn' : '🎮 Dual'}
          </button>
        </div>
      </div>

      {/* Tank Duel Canvas */}
      <div className="w-full aspect-[4/3] rounded-3xl overflow-hidden shadow-2xl border-2 border-cyan-500/40 relative bg-slate-950">
        <canvas ref={canvasRef} className="w-full h-full block touch-none" />
      </div>

      {/* Tactile Mobile & Desktop Controls */}
      {controlMode === 'onebutton' ? (
        <div className="w-full max-w-md pt-1">
          <button
            onPointerDown={() => {
              mobileControls.current.oneButtonDown = true;
            }}
            onPointerUp={() => {
              mobileControls.current.oneButtonDown = false;
            }}
            onPointerLeave={() => {
              mobileControls.current.oneButtonDown = false;
            }}
            onPointerCancel={() => {
              mobileControls.current.oneButtonDown = false;
            }}
            className="w-full h-22 rounded-3xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 p-1 shadow-2xl active:scale-[0.98] transition-transform select-none touch-none cursor-pointer"
          >
            <div className="w-full h-full rounded-[20px] bg-slate-950 flex flex-col items-center justify-center p-2.5 text-center">
              <span className="text-base font-black font-['Outfit'] text-white tracking-wider flex items-center gap-2">
                <Flame className="w-5 h-5 text-amber-400 animate-pulse" />
                <span>HOLD TO DRIVE • RELEASE TO FIRE!</span>
                <Sparkles className="w-5 h-5 text-rose-400" />
              </span>
              <span className="text-[11px] text-amber-300/80 font-mono mt-0.5">
                Auto-rotates turret when idle • 4-Bounce Plasma Shells
              </span>
            </div>
          </button>
        </div>
      ) : (
        <div className="w-full flex items-center justify-between gap-3 max-w-md pt-1">
          {/* Compact Steer + Drive/Reverse Cluster */}
          <div className="flex items-center gap-1.5">
            <button
              onPointerDown={() => {
                mobileControls.current.left = true;
              }}
              onPointerUp={() => {
                mobileControls.current.left = false;
              }}
              onPointerLeave={() => {
                mobileControls.current.left = false;
              }}
              onPointerCancel={() => {
                mobileControls.current.left = false;
              }}
              className="w-12 h-14 rounded-2xl bg-slate-900 border-2 border-slate-700 active:border-cyan-400 active:scale-90 flex items-center justify-center shadow-lg touch-manipulation cursor-pointer"
              title="Turn Left"
            >
              <RotateCcw className="w-5 h-5 text-slate-200" />
            </button>
            <div className="flex flex-col gap-1">
              <button
                onPointerDown={() => {
                  mobileControls.current.forward = true;
                }}
                onPointerUp={() => {
                  mobileControls.current.forward = false;
                }}
                onPointerLeave={() => {
                  mobileControls.current.forward = false;
                }}
                onPointerCancel={() => {
                  mobileControls.current.forward = false;
                }}
                className="w-14 h-9 rounded-xl bg-emerald-500/20 border-2 border-emerald-400 active:bg-emerald-500/40 flex items-center justify-center text-emerald-300 shadow touch-manipulation cursor-pointer"
                title="Forward"
              >
                <ArrowUp className="w-5 h-5 stroke-[3]" />
              </button>
              <button
                onPointerDown={() => {
                  mobileControls.current.backward = true;
                }}
                onPointerUp={() => {
                  mobileControls.current.backward = false;
                }}
                onPointerLeave={() => {
                  mobileControls.current.backward = false;
                }}
                onPointerCancel={() => {
                  mobileControls.current.backward = false;
                }}
                className="w-14 h-8 rounded-xl bg-slate-800 border border-slate-600 active:bg-slate-700 flex items-center justify-center text-slate-300 shadow touch-manipulation cursor-pointer"
                title="Reverse"
              >
                <ArrowDown className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
            <button
              onPointerDown={() => {
                mobileControls.current.right = true;
              }}
              onPointerUp={() => {
                mobileControls.current.right = false;
              }}
              onPointerLeave={() => {
                mobileControls.current.right = false;
              }}
              onPointerCancel={() => {
                mobileControls.current.right = false;
              }}
              className="w-12 h-14 rounded-2xl bg-slate-900 border-2 border-slate-700 active:border-cyan-400 active:scale-90 flex items-center justify-center shadow-lg touch-manipulation cursor-pointer"
              title="Turn Right"
            >
              <RotateCw className="w-5 h-5 text-slate-200" />
            </button>
          </div>

          {/* Big Fire Button */}
          <button
            onPointerDown={() => {
              mobileControls.current.fire = true;
            }}
            className="flex-1 h-16 rounded-2xl bg-gradient-to-r from-amber-500 to-rose-500 border-2 border-amber-300 active:scale-95 flex items-center justify-center gap-2 text-base font-black text-slate-950 shadow-xl shadow-amber-500/30 font-['Outfit'] touch-manipulation cursor-pointer"
          >
            <Sparkles className="w-5 h-5 text-slate-950 fill-current" />
            <span>FIRE!</span>
          </button>
        </div>
      )}

      <p className="text-[11px] text-slate-400 font-mono text-center">
        📱 Drag on arena or use buttons • ⌨️ WASD/Arrows + Space to Fire
      </p>
    </div>
  );
};
