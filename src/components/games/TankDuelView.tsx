import React, { useEffect, useRef, useState } from 'react';
import type { AuthoritativeRoomState } from '../../types/room';
import type { TankDuelState } from '../../engine/tankDuelEngine';
import { GameLoop } from '../../engine/core/GameLoop';
import { CanvasManager } from '../../engine/core/CanvasManager';
import { JuiceEngine } from '../../engine/core/JuiceEngine';
import { soundService } from '../../services/sound';
import { Flame, Sparkles, Crosshair, Shield, Zap } from 'lucide-react';

interface TankDuelViewProps {
  room: AuthoritativeRoomState<TankDuelState>;
  playerUid: string;
  onDispatchAction: (type: string, payload: any) => void;
}

interface Bullet {
  id: string;
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
  destructible?: boolean;
  hp?: number;
  maxHp?: number;
}

interface PowerUp {
  id: number;
  x: number;
  y: number;
  type: 'rapid' | 'shield' | 'triple' | 'turbo';
  pulse: number;
}

interface TreadMark {
  x: number;
  y: number;
  angle: number;
  alpha: number;
}

interface ScorchMark {
  x: number;
  y: number;
  r: number;
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

interface TankEntity {
  x: number;
  y: number;
  angle: number;
  turretAngle: number;
  color: string;
  turretColor: string;
  hp: number;
  maxHp: number;
  reload: number;
  alive: boolean;
  recoil: number;
  hitFlash: number;
  muzzleFlash: number;
  trackAnim: number;
  shieldTimer: number;
  rapidTimer: number;
  turboTimer: number;
  tripleShots: number;
  armorShield: boolean;
}

const W = 640;
const H = 480;
const TANK_RADIUS = 19;

const buildMapObstacles = (roundNum: number): Obstacle[] => {
  const mapIdx = (Math.max(1, roundNum) - 1) % 3;
  if (mapIdx === 0) {
    // Map 0: Cyber Fortress
    return [
      { x: 132, y: 86, w: 34, h: 108, flash: 0 },
      { x: 132, y: 286, w: 34, h: 108, flash: 0 },
      { x: 474, y: 86, w: 34, h: 108, flash: 0 },
      { x: 474, y: 286, w: 34, h: 108, flash: 0 },
      { x: 286, y: 194, w: 68, h: 92, flash: 0 },
      { x: 274, y: 54, w: 92, h: 24, flash: 0 },
      { x: 274, y: 402, w: 92, h: 24, flash: 0 },
      // Destructible crates
      { x: 222, y: 128, w: 30, h: 30, flash: 0, destructible: true, hp: 2, maxHp: 2 },
      { x: 388, y: 322, w: 30, h: 30, flash: 0, destructible: true, hp: 2, maxHp: 2 },
    ];
  }
  if (mapIdx === 1) {
    // Map 1: Reactor Cross
    return [
      { x: 190, y: 120, w: 96, h: 28, flash: 0 },
      { x: 354, y: 120, w: 96, h: 28, flash: 0 },
      { x: 190, y: 332, w: 96, h: 28, flash: 0 },
      { x: 354, y: 332, w: 96, h: 28, flash: 0 },
      { x: 126, y: 196, w: 28, h: 88, flash: 0 },
      { x: 486, y: 196, w: 28, h: 88, flash: 0 },
      { x: 305, y: 225, w: 30, h: 30, flash: 0, destructible: true, hp: 2, maxHp: 2 },
      { x: 230, y: 225, w: 28, h: 28, flash: 0, destructible: true, hp: 2, maxHp: 2 },
      { x: 382, y: 225, w: 28, h: 28, flash: 0, destructible: true, hp: 2, maxHp: 2 },
    ];
  }
  // Map 2: Twin Bunkers
  return [
    { x: 145, y: 145, w: 68, h: 32, flash: 0 },
    { x: 145, y: 303, w: 68, h: 32, flash: 0 },
    { x: 427, y: 145, w: 68, h: 32, flash: 0 },
    { x: 427, y: 303, w: 68, h: 32, flash: 0 },
    { x: 304, y: 92, w: 32, h: 86, flash: 0 },
    { x: 304, y: 302, w: 32, h: 86, flash: 0 },
    { x: 304, y: 222, w: 32, h: 36, flash: 0, destructible: true, hp: 2, maxHp: 2 },
    { x: 170, y: 224, w: 28, h: 28, flash: 0, destructible: true, hp: 2, maxHp: 2 },
    { x: 442, y: 224, w: 28, h: 28, flash: 0, destructible: true, hp: 2, maxHp: 2 },
  ];
};

const wrapAngle = (a: number): number => {
  let diff = a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
};

export const TankDuelView: React.FC<TankDuelViewProps> = ({ room, playerUid, onDispatchAction }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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

  const roundWinnerNameRef = useRef<string | null>(null);
  const [controlMode, setControlMode] = useState<'arcade' | 'onebutton'>('arcade');
  const controlModeRef = useRef(controlMode);
  controlModeRef.current = controlMode;

  const [myHpUi, setMyHpUi] = useState(3);
  const [oppHpUi, setOppHpUi] = useState(3);
  const [activeBuffUi, setActiveBuffUi] = useState<string | null>(null);

  const onDispatchActionRef = useRef(onDispatchAction);
  onDispatchActionRef.current = onDispatchAction;
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;
  const roomRef = useRef(room);
  roomRef.current = room;
  const botDifficultyRef = useRef(room.gameConfig?.difficulty || 'medium');
  botDifficultyRef.current = room.gameConfig?.difficulty || 'medium';

  const keysDown = useRef<Record<string, boolean>>({});
  const mobileControls = useRef({
    up: false,
    down: false,
    left: false,
    right: false,
    fire: false,
    oneButtonDown: false,
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
    const juice = new JuiceEngine(480);

    const MOVE_SPEED = 175;
    const ROT_SPEED = 6.2;
    const TURRET_ROT_SPEED = 9.0;
    const BULLET_SPEED = 390;

    let obstacles: Obstacle[] = buildMapObstacles(roomRef.current.currentRound || 1);
    const treadMarks: TreadMark[] = [];
    const scorchMarks: ScorchMark[] = [];
    const rings: ShockRing[] = [];
    const bullets: Bullet[] = [];
    const powerUps: PowerUp[] = [];
    let powerUpIdSeq = 1;
    let powerUpTimer = 3.5;
    let smokeTimer = 0;
    let syncTimer = 0;
    let hudTimer = 0;
    let lastProcessedShotId = '';

    const createTank = (x: number, y: number, angle: number, color: string, turretColor: string): TankEntity => ({
      x,
      y,
      angle,
      turretAngle: angle,
      color,
      turretColor,
      hp: 3,
      maxHp: 3,
      reload: 0,
      alive: true,
      recoil: 0,
      hitFlash: 0,
      muzzleFlash: 0,
      trackAnim: 0,
      shieldTimer: 0.9,
      rapidTimer: 0,
      turboTimer: 0,
      tripleShots: 0,
      armorShield: false,
    });

    const tanks: Record<string, TankEntity> = {
      [p1Uid]: createTank(72, 240, 0, '#f59e0b', '#fbbf24'),
      [p2Uid]: createTank(568, 240, Math.PI, '#06b6d4', '#22d3ee'),
    };

    const tankDriving = { [p1Uid]: false, [p2Uid]: false };
    let roundPauseTimer = 0;
    let isRoundOver = false;
    let knownRound = roomRef.current.currentRound || 1;
    let botDecisionTimer = 0;
    let botStrafeSign = 1;

    // Mouse reticle & touch drag stick
    const mouseState = { active: false, x: W / 2, y: H / 2 };
    const touchDrag = { active: false, pointerType: 'mouse', startX: 0, startY: 0, currX: 0, currY: 0 };
    let cachedRect = canvas.getBoundingClientRect();
    const refreshRect = () => {
      cachedRect = canvas.getBoundingClientRect();
    };
    window.addEventListener('resize', refreshRect, { passive: true });

    const toArena = (clientX: number, clientY: number) => ({
      x: ((clientX - cachedRect.left) / Math.max(1, cachedRect.width)) * W,
      y: ((clientY - cachedRect.top) / Math.max(1, cachedRect.height)) * H,
    });

    const onPointerDown = (e: PointerEvent) => {
      refreshRect();
      const pt = toArena(e.clientX, e.clientY);
      if (e.pointerType === 'mouse') {
        mouseState.active = true;
        mouseState.x = pt.x;
        mouseState.y = pt.y;
        if (controlModeRef.current === 'onebutton') {
          mobileControls.current.oneButtonDown = true;
        } else {
          mobileControls.current.fire = true;
        }
      } else {
        canvas.setPointerCapture(e.pointerId);
        touchDrag.active = true;
        touchDrag.pointerType = e.pointerType;
        touchDrag.startX = pt.x;
        touchDrag.startY = pt.y;
        touchDrag.currX = pt.x;
        touchDrag.currY = pt.y;
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      refreshRect();
      const pt = toArena(e.clientX, e.clientY);
      if (e.pointerType === 'mouse') {
        mouseState.active = true;
        mouseState.x = pt.x;
        mouseState.y = pt.y;
      } else if (touchDrag.active) {
        touchDrag.currX = pt.x;
        touchDrag.currY = pt.y;
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') {
        mobileControls.current.oneButtonDown = false;
      } else {
        touchDrag.active = false;
      }
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
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      for (let d = 8; d <= maxDist; d += 6) {
        if (pointBlocked(sx + cos * d, sy + sin * d, 3)) return d;
      }
      return maxDist;
    };

    // Bot helper: trace up to 1 bounce to see if angle can hit target!
    const traceShotHitsTarget = (sx: number, sy: number, ang: number, tx: number, ty: number): boolean => {
      let x = sx + Math.cos(ang) * (TANK_RADIUS + 8);
      let y = sy + Math.sin(ang) * (TANK_RADIUS + 8);
      let vx = Math.cos(ang);
      let vy = Math.sin(ang);
      let bounces = 0;

      for (let d = 0; d < 460; d += 7) {
        x += vx * 7;
        y += vy * 7;
        if (Math.hypot(x - tx, y - ty) < TANK_RADIUS + 6) return true;

        if (x <= 12 || x >= W - 12) {
          vx = -vx;
          x = Math.max(13, Math.min(W - 13, x));
          bounces++;
        } else if (y <= 12 || y >= H - 12) {
          vy = -vy;
          y = Math.max(13, Math.min(H - 13, y));
          bounces++;
        } else {
          for (const obs of obstacles) {
            if (x >= obs.x && x <= obs.x + obs.w && y >= obs.y && y <= obs.y + obs.h) {
              const dl = Math.abs(x - obs.x);
              const dr = Math.abs(x - (obs.x + obs.w));
              const dt = Math.abs(y - obs.y);
              const db = Math.abs(y - (obs.y + obs.h));
              if (Math.min(dl, dr) < Math.min(dt, db)) vx = -vx;
              else vy = -vy;
              bounces++;
              break;
            }
          }
        }
        if (bounces > 1) return false;
      }
      return false;
    };

    const spawnBulletAngle = (ownerUid: string, t: TankEntity, fireAng: number, broadcastShot: boolean) => {
      let spawnDist = TANK_RADIUS + 11;
      while (spawnDist > 6 && pointBlocked(t.x + Math.cos(fireAng) * spawnDist, t.y + Math.sin(fireAng) * spawnDist, 2)) {
        spawnDist -= 4;
      }
      const tipX = t.x + Math.cos(fireAng) * spawnDist;
      const tipY = t.y + Math.sin(fireAng) * spawnDist;
      const bId = `${ownerUid}_${Math.random().toString(36).slice(2, 8)}`;
      const vx = Math.cos(fireAng) * BULLET_SPEED;
      const vy = Math.sin(fireAng) * BULLET_SPEED;

      bullets.push({
        id: bId,
        x: tipX,
        y: tipY,
        vx,
        vy,
        bounces: 0,
        age: 0,
        ownerUid,
        alive: true,
        trail: [],
      });

      if (broadcastShot && !isBotPlaying && ownerUid === playerUid) {
        onDispatchActionRef.current('TANK_FIRE', { id: bId, x: tipX, y: tipY, vx, vy });
      }

      const col = ownerUid === p1Uid ? '#fbbf24' : '#22d3ee';
      juice.emitSparks(tipX, tipY, 10, col, '#ffffff', 4);
      rings.push({ x: tipX, y: tipY, r: 4, maxR: 24, color: col, alpha: 0.85 });
    };

    const fireBullet = (ownerUid: string) => {
      const t = tanks[ownerUid];
      if (!t || !t.alive || t.reload > 0) return;

      const cap = t.tripleShots > 0 ? 7 : t.rapidTimer > 0 ? 5 : 4;
      const activeOwn = bullets.filter((b) => b.alive && b.ownerUid === ownerUid).length;
      if (activeOwn >= cap) return;

      t.reload = t.rapidTimer > 0 ? 0.16 : 0.34;
      t.recoil = 10;
      t.muzzleFlash = 1.0;

      if (t.tripleShots > 0) {
        t.tripleShots -= 1;
        [-0.2, 0, 0.2].forEach((offset) => spawnBulletAngle(ownerUid, t, t.turretAngle + offset, true));
      } else {
        spawnBulletAngle(ownerUid, t, t.turretAngle, true);
      }

      juice.addTrauma(0.22);
      juice.playSound('shoot');
    };

    const resetRound = (nextRoundNum?: number) => {
      isRoundOver = false;
      roundWinnerNameRef.current = null;
      obstacles = buildMapObstacles(nextRoundNum ?? (roomRef.current.currentRound || 1));

      tanks[p1Uid] = createTank(72, 240, 0, '#f59e0b', '#fbbf24');
      tanks[p2Uid] = createTank(568, 240, Math.PI, '#06b6d4', '#22d3ee');

      tankDriving[p1Uid] = false;
      tankDriving[p2Uid] = false;
      bullets.length = 0;
      powerUps.length = 0;
      scorchMarks.length = 0;
      treadMarks.length = 0;
      powerUpTimer = 3.2;
      setMyHpUi(3);
      setOppHpUi(3);
      setActiveBuffUi(null);
    };

    const update = (dt: number) => {
      const cdt = Math.min(0.04, dt);
      juice.update(cdt);

      // Sync round resets from authoritative room
      if ((roomRef.current.currentRound || 1) !== knownRound && !gameStateRef.current?.roundWinner) {
        knownRound = roomRef.current.currentRound || 1;
        resetRound(knownRound);
      }

      for (const obs of obstacles) {
        obs.flash = Math.max(0, obs.flash - cdt * 3.5);
      }

      for (let i = treadMarks.length - 1; i >= 0; i--) {
        treadMarks[i].alpha -= cdt * 0.11;
        if (treadMarks[i].alpha <= 0) treadMarks.splice(i, 1);
      }

      for (let i = rings.length - 1; i >= 0; i--) {
        const ring = rings[i];
        ring.r += cdt * 125;
        ring.alpha -= cdt * 2.5;
        if (ring.alpha <= 0 || ring.r >= ring.maxR) rings.splice(i, 1);
      }

      if (isRoundOver) {
        roundPauseTimer -= cdt;
        if (roundPauseTimer <= 0 && !gameStateRef.current?.roundWinner) {
          resetRound();
        }
        return;
      }

      if (roomRef.current.status !== 'playing') return;

      // Power-Up Spawner (Max 2 active on field)
      powerUpTimer -= cdt;
      if (powerUpTimer <= 0 && powerUps.length < 2) {
        powerUpTimer = 5.5 + Math.random() * 2.5;
        for (let attempt = 0; attempt < 15; attempt++) {
          const px = 120 + Math.random() * (W - 240);
          const py = 70 + Math.random() * (H - 140);
          if (!pointBlocked(px, py, 24)) {
            const types: PowerUp['type'][] = ['rapid', 'shield', 'triple', 'turbo'];
            const type = types[Math.floor(Math.random() * types.length)];
            powerUps.push({ id: powerUpIdSeq++, x: px, y: py, type, pulse: 0 });
            rings.push({ x: px, y: py, r: 4, maxR: 32, color: '#a855f7', alpha: 0.7 });
            break;
          }
        }
      }

      for (const pu of powerUps) {
        pu.pulse += cdt * 5;
      }

      // Tick tank buffs & low-HP engine smoke
      smokeTimer += cdt;
      for (const tank of Object.values(tanks)) {
        if (!tank.alive) continue;
        tank.reload = Math.max(0, tank.reload - cdt);
        tank.recoil = Math.max(0, tank.recoil - cdt * 32);
        tank.muzzleFlash = Math.max(0, tank.muzzleFlash - cdt * 10);
        tank.hitFlash = Math.max(0, tank.hitFlash - cdt * 6);
        tank.shieldTimer = Math.max(0, tank.shieldTimer - cdt);
        tank.rapidTimer = Math.max(0, tank.rapidTimer - cdt);
        tank.turboTimer = Math.max(0, tank.turboTimer - cdt);

        if (tank.hp === 1 && smokeTimer > 0.1) {
          juice.emitSparks(tank.x - Math.cos(tank.angle) * 12, tank.y - Math.sin(tank.angle) * 12, 1, '#f97316', '#94a3b8', 1.2);
        }
      }
      if (smokeTimer > 0.1) smokeTimer = 0;

      // 1. Local Player Tank Controls
      const myTank = tanks[playerUid];
      const oppUid = playerUid === p1Uid ? p2Uid : p1Uid;
      const oppTank = tanks[oppUid];

      if (myTank && myTank.alive) {
        const curSpeed = MOVE_SPEED * (myTank.turboTimer > 0 ? 1.42 : 1.0);

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
              myTank.x + Math.cos(myTank.angle) * curSpeed * cdt,
              myTank.y + Math.sin(myTank.angle) * curSpeed * cdt,
              TANK_RADIUS
            );
            myTank.x = resolved.x;
            myTank.y = resolved.y;
            myTank.turretAngle = myTank.angle;
            myTank.trackAnim += cdt * 16;
            if (Math.random() < 0.35) treadMarks.push({ x: myTank.x, y: myTank.y, angle: myTank.angle, alpha: 0.45 });
          } else {
            if (tankDriving[playerUid]) {
              fireBullet(playerUid);
              tankDriving[playerUid] = false;
            }
            myTank.angle += ROT_SPEED * 0.65 * cdt;
            myTank.turretAngle = myTank.angle;
          }
        } else {
          // 8-Way Directional Arcade Drive (WASD / Arrows / Touch Joystick / D-pad)
          let moveX = 0;
          let moveY = 0;
          if (keysDown.current['a'] || keysDown.current['arrowleft'] || mobileControls.current.left) moveX -= 1;
          if (keysDown.current['d'] || keysDown.current['arrowright'] || mobileControls.current.right) moveX += 1;
          if (keysDown.current['w'] || keysDown.current['arrowup'] || mobileControls.current.up) moveY -= 1;
          if (keysDown.current['s'] || keysDown.current['arrowdown'] || mobileControls.current.down) moveY += 1;

          if (moveX === 0 && moveY === 0 && touchDrag.active) {
            const tdx = touchDrag.currX - touchDrag.startX;
            const tdy = touchDrag.currY - touchDrag.startY;
            const tdist = Math.hypot(tdx, tdy);
            if (tdist > 8) {
              const mag = Math.min(1, tdist / 36);
              moveX = (tdx / tdist) * mag;
              moveY = (tdy / tdist) * mag;
            }
          }

          const moveMag = Math.hypot(moveX, moveY);
          if (moveMag > 0.05) {
            const desiredHull = Math.atan2(moveY, moveX);
            const hullDiff = wrapAngle(desiredHull - myTank.angle);
            const maxTurn = ROT_SPEED * cdt;
            myTank.angle += Math.abs(hullDiff) <= maxTurn ? hullDiff : Math.sign(hullDiff) * maxTurn;

            const clampMag = Math.min(1, moveMag);
            const nx = moveX / (moveMag || 1);
            const ny = moveY / (moveMag || 1);
            const resolved = resolveTankWallSlide(
              myTank.x + nx * curSpeed * clampMag * cdt,
              myTank.y + ny * curSpeed * clampMag * cdt,
              TANK_RADIUS
            );
            myTank.x = resolved.x;
            myTank.y = resolved.y;
            myTank.trackAnim += cdt * 18 * clampMag;
            if (Math.random() < 0.35) treadMarks.push({ x: myTank.x, y: myTank.y, angle: myTank.angle, alpha: 0.45 });
          }

          // Turret Aiming: Mouse reticle if active, else soft-track hull/opponent cleanly
          let desiredTurret = myTank.angle;
          if (mouseState.active) {
            desiredTurret = Math.atan2(mouseState.y - myTank.y, mouseState.x - myTank.x);
          } else if (oppTank && oppTank.alive && moveMag < 0.1) {
            desiredTurret = Math.atan2(oppTank.y - myTank.y, oppTank.x - myTank.x);
          }
          const tDiff = wrapAngle(desiredTurret - myTank.turretAngle);
          const maxTurretTurn = TURRET_ROT_SPEED * cdt;
          myTank.turretAngle += Math.abs(tDiff) <= maxTurretTurn ? tDiff : Math.sign(tDiff) * maxTurretTurn;

          const isFire = keysDown.current[' '] || keysDown.current['enter'] || mobileControls.current.fire;
          if (isFire && myTank.reload === 0) {
            fireBullet(playerUid);
            mobileControls.current.fire = false;
          }
        }
      }

      // 2. Remote Peer Tank Sync (When 2 human players play in separate tabs/devices)
      if (!isBotPlaying) {
        syncTimer += cdt;
        if (syncTimer >= 0.05 && myTank) {
          syncTimer = 0;
          onDispatchActionRef.current('TANK_SYNC', {
            x: myTank.x,
            y: myTank.y,
            angle: myTank.angle,
            turretAngle: myTank.turretAngle,
            hp: myTank.hp,
            alive: myTank.alive,
          });
        }

        const remoteSync = gameStateRef.current?.tanks?.[oppUid];
        if (remoteSync && oppTank && oppTank.alive) {
          oppTank.x += (remoteSync.x - oppTank.x) * 0.45;
          oppTank.y += (remoteSync.y - oppTank.y) * 0.45;
          oppTank.angle = remoteSync.angle;
          oppTank.turretAngle = remoteSync.turretAngle ?? remoteSync.angle;
          oppTank.hp = remoteSync.hp ?? oppTank.hp;
        }

        const shot = (gameStateRef.current as any)?.lastShot;
        if (shot && shot.ownerUid === oppUid && shot.id !== lastProcessedShotId) {
          lastProcessedShotId = shot.id;
          bullets.push({
            id: shot.id,
            x: shot.x,
            y: shot.y,
            vx: shot.vx,
            vy: shot.vy,
            bounces: 0,
            age: 0,
            ownerUid: shot.ownerUid,
            alive: true,
            trail: [],
          });
          if (oppTank) {
            oppTank.recoil = 10;
            oppTank.muzzleFlash = 1.0;
          }
          soundService.playClick();
        }
      }

      // 3. Tactical CyberBot AI (Runs on host when vs CyberBot)
      if (isHost && isBotPlaying) {
        const botTank = tanks[p2Uid];
        const humanTank = tanks[p1Uid];

        if (botTank && botTank.alive && humanTank && humanTank.alive) {
          const diff = botDifficultyRef.current;
          const botSpeed = MOVE_SPEED * (diff === 'hard' ? 0.98 : diff === 'medium' ? 0.84 : 0.68) * (botTank.turboTimer > 0 ? 1.4 : 1.0);

          botDecisionTimer -= cdt;
          if (botDecisionTimer <= 0) {
            botDecisionTimer = 0.8 + Math.random() * 0.7;
            botStrafeSign = Math.random() < 0.5 ? 1 : -1;
          }

          const dx = humanTank.x - botTank.x;
          const dy = humanTank.y - botTank.y;
          const distToHuman = Math.hypot(dx, dy);
          const angleToHuman = Math.atan2(dy, dx);

          // Bullet Threat Evasion
          let dodgeX = 0;
          let dodgeY = 0;
          if (diff !== 'easy') {
            for (const b of bullets) {
              if (!b.alive || b.ownerUid === p2Uid) continue;
              const bd = Math.hypot(b.x - botTank.x, b.y - botTank.y);
              if (bd < 140) {
                const dot = (botTank.x - b.x) * b.vx + (botTank.y - b.y) * b.vy;
                if (dot > 0) {
                  // Move perpendicular to incoming shell!
                  dodgeX += -b.vy;
                  dodgeY += b.vx;
                }
              }
            }
          }

          let desiredAngle = angleToHuman;
          // Seek nearby powerup if available
          let nearestPu: PowerUp | null = null;
          let minPuDist = 200;
          for (const pu of powerUps) {
            const d = Math.hypot(pu.x - botTank.x, pu.y - botTank.y);
            if (d < minPuDist) {
              minPuDist = d;
              nearestPu = pu;
            }
          }

          if (Math.hypot(dodgeX, dodgeY) > 1) {
            desiredAngle = Math.atan2(dodgeY, dodgeX);
          } else if (nearestPu) {
            desiredAngle = Math.atan2(nearestPu.y - botTank.y, nearestPu.x - botTank.x);
          } else if (distToHuman < 145) {
            // Strafe around target instead of jamming straight in
            desiredAngle = angleToHuman + (Math.PI * 0.55) * botStrafeSign;
          }

          // Whisker obstacle avoidance
          const frontClear = raycastDistance(botTank.x, botTank.y, desiredAngle, 65);
          if (frontClear < 44) {
            const leftClear = raycastDistance(botTank.x, botTank.y, desiredAngle - 0.85, 70);
            const rightClear = raycastDistance(botTank.x, botTank.y, desiredAngle + 0.85, 70);
            desiredAngle = leftClear > rightClear ? desiredAngle - 1.15 : desiredAngle + 1.15;
          }

          const hullDiff = wrapAngle(desiredAngle - botTank.angle);
          const maxTurn = ROT_SPEED * 0.85 * cdt;
          botTank.angle += Math.abs(hullDiff) <= maxTurn ? hullDiff : Math.sign(hullDiff) * maxTurn;

          const resolved = resolveTankWallSlide(
            botTank.x + Math.cos(botTank.angle) * botSpeed * cdt,
            botTank.y + Math.sin(botTank.angle) * botSpeed * cdt,
            TANK_RADIUS
          );
          botTank.x = resolved.x;
          botTank.y = resolved.y;
          botTank.trackAnim += cdt * 15;
          if (Math.random() < 0.28) treadMarks.push({ x: botTank.x, y: botTank.y, angle: botTank.angle, alpha: 0.4 });

          // Smart Turret Bank-Shot / Direct Aiming
          let targetAim = angleToHuman;
          let hasShot = traceShotHitsTarget(botTank.x, botTank.y, angleToHuman, humanTank.x, humanTank.y);
          if (!hasShot && diff !== 'easy') {
            for (const offset of [-0.45, 0.45, -0.85, 0.85, -1.25, 1.25]) {
              const cand = angleToHuman + offset;
              if (traceShotHitsTarget(botTank.x, botTank.y, cand, humanTank.x, humanTank.y)) {
                targetAim = cand;
                hasShot = true;
                break;
              }
            }
          }

          const aimErr = diff === 'easy' ? 0.25 : diff === 'medium' ? 0.08 : 0.02;
          const turretDiff = wrapAngle(targetAim - botTank.turretAngle);
          const maxTurret = TURRET_ROT_SPEED * (diff === 'hard' ? 1.0 : diff === 'medium' ? 0.78 : 0.55) * cdt;
          botTank.turretAngle += Math.abs(turretDiff) <= maxTurret ? turretDiff : Math.sign(turretDiff) * maxTurret;

          if (hasShot && Math.abs(turretDiff) <= 0.18 + aimErr && botTank.reload === 0) {
            fireBullet(p2Uid);
          }
        }
      }

      // 4. Tank-to-Tank Elastic Collision Separation
      const t1 = tanks[p1Uid];
      const t2 = tanks[p2Uid];
      if (t1 && t2 && t1.alive && t2.alive) {
        const dx = t2.x - t1.x;
        const dy = t2.y - t1.y;
        const dist = Math.hypot(dx, dy);
        const minSep = TANK_RADIUS * 2;
        if (dist < minSep && dist > 0.01) {
          const nx = dx / dist;
          const ny = dy / dist;
          const push = (minSep - dist) * 0.5;
          const r1 = resolveTankWallSlide(t1.x - nx * push, t1.y - ny * push, TANK_RADIUS);
          const r2 = resolveTankWallSlide(t2.x + nx * push, t2.y + ny * push, TANK_RADIUS);
          t1.x = r1.x;
          t1.y = r1.y;
          t2.x = r2.x;
          t2.y = r2.y;
        }
      }

      // 5. Power-Up Pickups
      for (let pi = powerUps.length - 1; pi >= 0; pi--) {
        const pu = powerUps[pi];
        for (const [uid, tank] of Object.entries(tanks)) {
          if (!tank.alive) continue;
          if (Math.hypot(pu.x - tank.x, pu.y - tank.y) < TANK_RADIUS + 15) {
            if (pu.type === 'rapid') tank.rapidTimer = 5.5;
            else if (pu.type === 'shield') tank.armorShield = true;
            else if (pu.type === 'triple') tank.tripleShots += 4;
            else if (pu.type === 'turbo') tank.turboTimer = 5.5;

            powerUps.splice(pi, 1);
            juice.emitSparks(pu.x, pu.y, 14, '#a855f7', '#ffffff', 4);
            rings.push({ x: pu.x, y: pu.y, r: 5, maxR: 38, color: '#a855f7', alpha: 0.9 });
            if (uid === playerUid) soundService.playScore();
            else soundService.playClick();
            break;
          }
        }
      }

      // 6. Bullet Physics, Destructible Crates, Mid-Air Shell Clash & Armor Hit Detection
      for (const b of bullets) {
        if (!b.alive) continue;
        b.age += cdt;

        b.trail.push({ x: b.x, y: b.y });
        if (b.trail.length > 12) b.trail.shift();

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

          // Obstacles & Destructible Crates
          for (let oi = obstacles.length - 1; oi >= 0; oi--) {
            const obs = obstacles[oi];
            if (b.x >= obs.x && b.x <= obs.x + obs.w && b.y >= obs.y && b.y <= obs.y + obs.h) {
              if (obs.destructible && obs.hp !== undefined) {
                obs.hp -= 1;
                obs.flash = 1.0;
                b.alive = false;
                juice.emitSparks(b.x, b.y, 12, '#f97316', '#fde047', 4);
                soundService.playImpact(0.9);
                if (obs.hp <= 0) {
                  scorchMarks.push({ x: obs.x + obs.w / 2, y: obs.y + obs.h / 2, r: 22, alpha: 0.7 });
                  juice.emitSparks(obs.x + obs.w / 2, obs.y + obs.h / 2, 22, '#fb923c', '#ffffff', 5);
                  obstacles.splice(oi, 1);
                }
                break;
              }

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

          if (!b.alive) break;
          if (b.bounces > 4) {
            b.alive = false;
            juice.emitSparks(b.x, b.y, 6, '#94a3b8', '#ffffff', 2);
            break;
          }

          // Tank Armor Damage / Elimination
          for (const [uid, tank] of Object.entries(tanks)) {
            if (!tank.alive || tank.shieldTimer > 0) continue;
            if (b.ownerUid === uid && b.age < 0.16) continue;

            const hitDist = Math.hypot(b.x - tank.x, b.y - tank.y);
            if (hitDist <= TANK_RADIUS + 4) {
              b.alive = false;

              if (tank.armorShield) {
                tank.armorShield = false;
                tank.hitFlash = 1;
                rings.push({ x: tank.x, y: tank.y, r: TANK_RADIUS, maxR: 52, color: '#38bdf8', alpha: 0.9 });
                juice.emitSparks(b.x, b.y, 16, '#38bdf8', '#ffffff', 4);
                soundService.playClick();
                break;
              }

              tank.hp -= 1;
              tank.hitFlash = 1.0;
              // Impact knockback impulse
              const spd = Math.hypot(b.vx, b.vy) || 1;
              const pushed = resolveTankWallSlide(
                tank.x + (b.vx / spd) * 14,
                tank.y + (b.vy / spd) * 14,
                TANK_RADIUS
              );
              tank.x = pushed.x;
              tank.y = pushed.y;

              if (tank.hp > 0) {
                scorchMarks.push({ x: tank.x, y: tank.y, r: 16, alpha: 0.55 });
                rings.push({ x: b.x, y: b.y, r: 6, maxR: 42, color: '#fb7185', alpha: 0.9 });
                juice.addTrauma(0.38);
                juice.triggerHitStop(28);
                juice.emitSparks(b.x, b.y, 20, '#f97316', '#fef08a', 5);
                soundService.playImpact(1.0);
              } else {
                tank.alive = false;
                isRoundOver = true;
                roundPauseTimer = 1.9;

                const victorUid = uid === p1Uid ? p2Uid : p1Uid;
                const victorName = victorUid === p1Uid ? p1Nickname : p2Nickname;
                roundWinnerNameRef.current = victorName;

                scorchMarks.push({ x: tank.x, y: tank.y, r: 34, alpha: 0.9 });
                juice.addTrauma(0.9);
                juice.triggerHitStop(68);
                juice.emitExplosion(tank.x, tank.y, 90);
                rings.push({ x: tank.x, y: tank.y, r: 10, maxR: 110, color: '#fbbf24', alpha: 1.0 });
                soundService.playGoal();

                if (isHost) {
                  onDispatchActionRef.current('TANK_KILL', {
                    killerUid: victorUid,
                    victimUid: uid,
                    playerUid: victorUid,
                    actingUid: victorUid,
                  });
                }
              }
              break;
            }
          }
        }
      }

      // Bullet-vs-Bullet Mid-Air Clash Interception
      for (let i = 0; i < bullets.length; i++) {
        const bi = bullets[i];
        if (!bi.alive) continue;
        for (let j = i + 1; j < bullets.length; j++) {
          const bj = bullets[j];
          if (!bj.alive || bi.ownerUid === bj.ownerUid) continue;
          if (Math.hypot(bi.x - bj.x, bi.y - bj.y) < 10) {
            bi.alive = false;
            bj.alive = false;
            const mx = (bi.x + bj.x) / 2;
            const my = (bi.y + bj.y) / 2;
            rings.push({ x: mx, y: my, r: 4, maxR: 28, color: '#ffffff', alpha: 0.95 });
            juice.emitSparks(mx, my, 16, '#fde047', '#ffffff', 4);
            soundService.playClick();
          }
        }
      }

      for (let i = bullets.length - 1; i >= 0; i--) {
        if (!bullets[i].alive) bullets.splice(i, 1);
      }

      // Throttled HUD sync (~10Hz)
      hudTimer += cdt;
      if (hudTimer >= 0.1) {
        hudTimer = 0;
        const mine = tanks[playerUid];
        const opp = tanks[oppUid];
        if (mine) {
          setMyHpUi(mine.hp);
          if (mine.armorShield) setActiveBuffUi('🛡️ SHIELD ACTIVE');
          else if (mine.tripleShots > 0) setActiveBuffUi(`🔱 TRIPLE x${mine.tripleShots}`);
          else if (mine.rapidTimer > 0) setActiveBuffUi('⚡ RAPID FIRE');
          else if (mine.turboTimer > 0) setActiveBuffUi('💨 TURBO DRIVE');
          else setActiveBuffUi(null);
        }
        if (opp) setOppHpUi(opp.hp);
      }
    };

    const drawLaserSight = (ctx: CanvasRenderingContext2D, tank: TankEntity) => {
      let x = tank.x + Math.cos(tank.turretAngle) * (TANK_RADIUS + 13);
      let y = tank.y + Math.sin(tank.turretAngle) * (TANK_RADIUS + 13);
      let vx = Math.cos(tank.turretAngle);
      let vy = Math.sin(tank.turretAngle);

      ctx.save();
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.36)';
      ctx.setLineDash([4, 6]);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x, y);

      let bounces = 0;
      for (let d = 0; d < 220; d += 5) {
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

      // 1. Cyber-Steel Floor Plate Backdrop
      const floorGrad = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.72);
      floorGrad.addColorStop(0, '#121c33');
      floorGrad.addColorStop(0.6, '#090f1d');
      floorGrad.addColorStop(1, '#04060d');
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

      // Blast Scorch Craters & Treads
      for (const sm of scorchMarks) {
        const g = ctx.createRadialGradient(sm.x, sm.y, 2, sm.x, sm.y, sm.r);
        g.addColorStop(0, `rgba(15, 23, 42, ${sm.alpha})`);
        g.addColorStop(0.6, `rgba(124, 45, 18, ${sm.alpha * 0.45})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(sm.x, sm.y, sm.r, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const tm of treadMarks) {
        ctx.save();
        ctx.translate(tm.x, tm.y);
        ctx.rotate(tm.angle);
        ctx.fillStyle = `rgba(0, 0, 0, ${tm.alpha * 0.55})`;
        ctx.fillRect(-10, -TANK_RADIUS, 6, 4);
        ctx.fillRect(-10, TANK_RADIUS - 4, 6, 4);
        ctx.restore();
      }

      // Arena Neon Perimeter
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.85)';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 16;
      ctx.strokeRect(6, 6, W - 12, H - 12);
      ctx.shadowBlur = 0;

      // 2. Obstacles & Destructible Crates
      for (const obs of obstacles) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(obs.x + 5, obs.y + 6, obs.w, obs.h);

        if (obs.destructible) {
          ctx.fillStyle = obs.hp === 1 ? '#7c2d12' : '#9a3412';
          ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
          ctx.strokeStyle = obs.flash > 0.1 ? '#ffffff' : '#fb923c';
          ctx.lineWidth = 2;
          ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
          // Crate cross brace
          ctx.beginPath();
          ctx.moveTo(obs.x + 3, obs.y + 3);
          ctx.lineTo(obs.x + obs.w - 3, obs.y + obs.h - 3);
          ctx.moveTo(obs.x + obs.w - 3, obs.y + 3);
          ctx.lineTo(obs.x + 3, obs.y + obs.h - 3);
          ctx.stroke();
        } else {
          const obsGrad = ctx.createLinearGradient(obs.x, obs.y, obs.x + obs.w, obs.y + obs.h);
          obsGrad.addColorStop(0, '#334155');
          obsGrad.addColorStop(1, '#0f172a');
          ctx.fillStyle = obsGrad;
          ctx.fillRect(obs.x, obs.y, obs.w, obs.h);

          ctx.fillStyle = '#1e293b';
          ctx.fillRect(obs.x + 4, obs.y + 4, obs.w - 8, obs.h - 8);

          ctx.strokeStyle = obs.flash > 0.1 ? `rgba(251, 191, 36, ${0.5 + obs.flash * 0.5})` : '#38bdf8';
          ctx.lineWidth = obs.flash > 0.1 ? 3 : 2;
          ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
        }
      }

      // 3. Power-Ups
      for (const pu of powerUps) {
        const s = 1 + Math.sin(pu.pulse) * 0.12;
        const colMap = { rapid: '#f59e0b', shield: '#38bdf8', triple: '#f43f5e', turbo: '#10b981' };
        const iconMap = { rapid: '⚡', shield: '🛡️', triple: '🔱', turbo: '💨' };
        const col = colMap[pu.type];
        ctx.save();
        ctx.translate(pu.x, pu.y);
        ctx.scale(s, s);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.strokeStyle = col;
        ctx.shadowColor = col;
        ctx.shadowBlur = 14;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(iconMap[pu.type], 0, 1);
        ctx.restore();
      }

      // Laser sight preview for human tank
      const myTank = tanks[playerUid];
      if (myTank && myTank.alive) drawLaserSight(ctx, myTank);

      // Shockwaves
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
        ctx.arc(b.x, b.y, 4.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // 5. Armored Tanks (Chassis + Independent Rotating Turret + HP Bar)
      for (const [uid, tank] of Object.entries(tanks)) {
        if (!tank.alive) continue;

        ctx.save();
        ctx.translate(tank.x, tank.y);

        // Armor Shield / Spawn Shield Aura
        if (tank.shieldTimer > 0 || tank.armorShield) {
          ctx.strokeStyle = tank.armorShield ? 'rgba(56, 189, 248, 0.9)' : 'rgba(255, 255, 255, 0.75)';
          ctx.lineWidth = tank.armorShield ? 2.8 : 2;
          ctx.setLineDash([5, 4]);
          ctx.beginPath();
          ctx.arc(0, 0, TANK_RADIUS + 8, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Hull Chassis Rotation
        ctx.save();
        ctx.rotate(tank.angle);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.beginPath();
        ctx.roundRect(-TANK_RADIUS + 2, -TANK_RADIUS + 3, TANK_RADIUS * 2, TANK_RADIUS * 2, 6);
        ctx.fill();

        // Heavy Treads
        ctx.fillStyle = '#020617';
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1;
        ctx.fillRect(-TANK_RADIUS - 3, -TANK_RADIUS, TANK_RADIUS * 2 + 6, 7);
        ctx.strokeRect(-TANK_RADIUS - 3, -TANK_RADIUS, TANK_RADIUS * 2 + 6, 7);
        ctx.fillRect(-TANK_RADIUS - 3, TANK_RADIUS - 7, TANK_RADIUS * 2 + 6, 7);
        ctx.strokeRect(-TANK_RADIUS - 3, TANK_RADIUS - 7, TANK_RADIUS * 2 + 6, 7);

        ctx.fillStyle = '#64748b';
        for (let i = -TANK_RADIUS; i < TANK_RADIUS; i += 7) {
          const offset = ((i + tank.trackAnim) % 7 + 7) % 7;
          ctx.fillRect(-TANK_RADIUS + offset, -TANK_RADIUS, 2, 7);
          ctx.fillRect(-TANK_RADIUS + offset, TANK_RADIUS - 7, 2, 7);
        }

        // Armored Hull
        ctx.fillStyle = tank.hitFlash > 0.2 ? '#ffffff' : tank.color;
        ctx.shadowColor = tank.color;
        ctx.shadowBlur = tank.turboTimer > 0 ? 22 : 12;
        ctx.beginPath();
        ctx.roundRect(-TANK_RADIUS + 2, -TANK_RADIUS + 6, TANK_RADIUS * 2 - 4, TANK_RADIUS * 2 - 12, 5);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();

        // Independent Rotating Cannon Turret
        ctx.save();
        ctx.rotate(tank.turretAngle);
        const rec = -tank.recoil;

        // Heavy Cannon Barrel & Muzzle Brake
        ctx.fillStyle = tank.turretColor;
        ctx.fillRect(rec, -3.5, TANK_RADIUS + 12, 7);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(TANK_RADIUS + 8 + rec, -5, 5, 10);

        if (tank.muzzleFlash > 0) {
          ctx.fillStyle = `rgba(255, 255, 255, ${tank.muzzleFlash})`;
          ctx.beginPath();
          ctx.moveTo(TANK_RADIUS + 13, 0);
          ctx.lineTo(TANK_RADIUS + 34, -9);
          ctx.lineTo(TANK_RADIUS + 34, 9);
          ctx.closePath();
          ctx.fill();
        }

        // Turret Cupola
        ctx.fillStyle = tank.hitFlash > 0.2 ? '#ffffff' : tank.turretColor;
        ctx.shadowColor = tank.turretColor;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(rec * 0.4, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(rec * 0.4, 0, 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.restore();

        // Floating Segmented 3-HP Armor Bar + Nameplate
        const barW = 36;
        const barX = tank.x - barW / 2;
        const barY = tank.y - TANK_RADIUS - 14;
        for (let seg = 0; seg < tank.maxHp; seg++) {
          ctx.fillStyle = seg < tank.hp ? (tank.hp === 1 ? '#ef4444' : '#22c55e') : 'rgba(15,23,42,0.85)';
          ctx.fillRect(barX + seg * 12.5, barY, 10.5, 4);
          ctx.strokeStyle = 'rgba(255,255,255,0.25)';
          ctx.lineWidth = 0.8;
          ctx.strokeRect(barX + seg * 12.5, barY, 10.5, 4);
        }

        ctx.fillStyle = uid === playerUid ? '#ffffff' : tank.turretColor;
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(uid === playerUid ? 'YOU' : uid === p1Uid ? p1Nickname.slice(0, 8) : p2Nickname.slice(0, 8), tank.x, barY - 4);
      }

      // Desktop Mouse Crosshair Reticle
      if (mouseState.active && controlModeRef.current === 'arcade') {
        ctx.save();
        ctx.translate(mouseState.x, mouseState.y);
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.8)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.moveTo(-14, 0);
        ctx.lineTo(-6, 0);
        ctx.moveTo(6, 0);
        ctx.lineTo(14, 0);
        ctx.moveTo(0, -14);
        ctx.lineTo(0, -6);
        ctx.moveTo(0, 6);
        ctx.lineTo(0, 14);
        ctx.stroke();
        ctx.restore();
      }

      // Touch Analog Stick Overlay
      if (touchDrag.active && controlModeRef.current === 'arcade') {
        ctx.save();
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.45)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(touchDrag.startX, touchDrag.startY, 32, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(251, 191, 36, 0.75)';
        ctx.beginPath();
        ctx.arc(touchDrag.currX, touchDrag.currY, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      juice.renderParticles(ctx, 1.0);

      const curWinner = roundWinnerNameRef.current;
      if (curWinner) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fbbf24';
        ctx.font = '900 28px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 18;
        ctx.fillText(`💥 ${curWinner.toUpperCase()} WINS THE ROUND!`, W / 2, H / 2 + 8);
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
    <div className="w-full max-w-2xl mx-auto flex flex-col items-center select-none gap-2.5 px-2">
      {/* Top Broadcast HUD */}
      <div className="flex items-center justify-between w-full px-3.5 py-2 rounded-2xl bg-slate-900/90 border border-slate-700/60 text-xs font-mono shadow-md">
        <div className="flex items-center gap-2">
          <span className="text-amber-400 font-black">{p1Nickname}</span>
          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-black">{p1Score}</span>
          <span className="text-[10px] text-emerald-400 font-bold hidden sm:inline">
            {'❤️'.repeat(Math.max(0, playerUid === p1Uid ? myHpUi : oppHpUi))}
          </span>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-600/20 border border-violet-500/40 text-violet-300 text-[10px] font-bold">
          <Crosshair className="w-3 h-3 text-cyan-400" />
          <span>{activeBuffUi || `ROUND ${room.currentRound || 1} • FIRST TO ${room.maxRounds || gameState.targetScore || 3}`}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-emerald-400 font-bold hidden sm:inline">
            {'❤️'.repeat(Math.max(0, playerUid === p2Uid ? myHpUi : oppHpUi))}
          </span>
          <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-black">{p2Score}</span>
          <span className="text-cyan-400 font-black">{p2Nickname}</span>
          <button
            type="button"
            onClick={() => setControlMode(controlMode === 'arcade' ? 'onebutton' : 'arcade')}
            className="ml-1 px-2 py-1 rounded-xl bg-violet-600/30 hover:bg-violet-600/50 border border-violet-400/40 text-violet-200 font-bold text-[10px] transition cursor-pointer"
          >
            {controlMode === 'onebutton' ? '⚡ 1-Btn' : '🎯 Arcade'}
          </button>
        </div>
      </div>

      {/* Tank Duel Arena Canvas */}
      <div className="w-full aspect-[4/3] rounded-3xl overflow-hidden shadow-2xl border-2 border-cyan-500/40 relative bg-slate-950">
        <canvas ref={canvasRef} className="w-full h-full block touch-none cursor-crosshair" />
      </div>

      {/* Mobile / Arcade Action Bar */}
      {controlMode === 'onebutton' ? (
        <div className="w-full max-w-md pt-1">
          <button
            type="button"
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
            className="w-full h-20 rounded-3xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 p-1 shadow-2xl active:scale-[0.98] transition-transform select-none touch-none cursor-pointer"
          >
            <div className="w-full h-full rounded-[20px] bg-slate-950 flex flex-col items-center justify-center p-2 text-center">
              <span className="text-sm sm:text-base font-black font-['Outfit'] text-white tracking-wider flex items-center gap-2">
                <Flame className="w-5 h-5 text-amber-400 animate-pulse" />
                <span>HOLD TO DRIVE • RELEASE TO FIRE!</span>
                <Sparkles className="w-5 h-5 text-rose-400" />
              </span>
              <span className="text-[11px] text-amber-300/80 font-mono">3-HP Armor • Power-Ups • Destructible Crates</span>
            </div>
          </button>
        </div>
      ) : (
        <div className="w-full flex items-center justify-between gap-3 max-w-md pt-1">
          {/* 8-Way D-Pad for Mobile / Touch */}
          <div className="grid grid-cols-3 gap-1 w-36">
            <div />
            <button
              type="button"
              onPointerDown={() => (mobileControls.current.up = true)}
              onPointerUp={() => (mobileControls.current.up = false)}
              onPointerLeave={() => (mobileControls.current.up = false)}
              onPointerCancel={() => (mobileControls.current.up = false)}
              className="h-10 rounded-xl bg-slate-900 border border-slate-700 active:border-cyan-400 text-slate-200 font-black text-sm touch-manipulation cursor-pointer"
            >
              ▲
            </button>
            <div />
            <button
              type="button"
              onPointerDown={() => (mobileControls.current.left = true)}
              onPointerUp={() => (mobileControls.current.left = false)}
              onPointerLeave={() => (mobileControls.current.left = false)}
              onPointerCancel={() => (mobileControls.current.left = false)}
              className="h-10 rounded-xl bg-slate-900 border border-slate-700 active:border-cyan-400 text-slate-200 font-black text-sm touch-manipulation cursor-pointer"
            >
              ◀
            </button>
            <button
              type="button"
              onPointerDown={() => (mobileControls.current.down = true)}
              onPointerUp={() => (mobileControls.current.down = false)}
              onPointerLeave={() => (mobileControls.current.down = false)}
              onPointerCancel={() => (mobileControls.current.down = false)}
              className="h-10 rounded-xl bg-slate-900 border border-slate-700 active:border-cyan-400 text-slate-200 font-black text-sm touch-manipulation cursor-pointer"
            >
              ▼
            </button>
            <button
              type="button"
              onPointerDown={() => (mobileControls.current.right = true)}
              onPointerUp={() => (mobileControls.current.right = false)}
              onPointerLeave={() => (mobileControls.current.right = false)}
              onPointerCancel={() => (mobileControls.current.right = false)}
              className="h-10 rounded-xl bg-slate-900 border border-slate-700 active:border-cyan-400 text-slate-200 font-black text-sm touch-manipulation cursor-pointer"
            >
              ▶
            </button>
          </div>

          {/* Big Fire Trigger */}
          <button
            type="button"
            onPointerDown={() => {
              mobileControls.current.fire = true;
            }}
            className="flex-1 h-16 rounded-2xl bg-gradient-to-r from-amber-500 to-rose-500 border-2 border-amber-300 active:scale-95 flex items-center justify-center gap-2 text-base font-black text-slate-950 shadow-xl shadow-amber-500/30 font-['Outfit'] touch-manipulation cursor-pointer"
          >
            <Zap className="w-5 h-5 text-slate-950 fill-current" />
            <span>FIRE CANNON</span>
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] text-slate-400 font-mono">
        <span>⌨️ WASD / Arrows Move • Mouse Aim • Click / Space Fire</span>
        <span className="inline-flex items-center gap-1 text-cyan-400">
          <Shield className="w-3 h-3" /> 3 Armor HP + Powerups
        </span>
      </div>
    </div>
  );
};
