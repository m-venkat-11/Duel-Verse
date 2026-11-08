import React, { useEffect, useRef, useState } from 'react';
import type { AuthoritativeRoomState } from '../../types/room';
import { GameLoop } from '../../engine/core/GameLoop';
import { CanvasManager } from '../../engine/core/CanvasManager';
import { JuiceEngine } from '../../engine/core/JuiceEngine';
import { soundService } from '../../services/sound';
import { Zap, ChevronLeft, ChevronRight, ArrowUp, Trophy } from 'lucide-react';

interface ObstacleRushViewProps {
  room: AuthoritativeRoomState<any>;
  playerUid: string;
  onDispatchAction: (type: string, payload: any) => void;
}

export const ObstacleRushView: React.FC<ObstacleRushViewProps> = ({ room, playerUid, onDispatchAction }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const players = Object.keys(room.players);
  const p1Uid = players[0] || playerUid;
  const p2Uid = players[1] || (p1Uid === 'bot_rival' ? 'player' : 'bot_rival');
  const isHost = room.hostUid === playerUid;
  const isBotPlaying = Boolean(room.players['bot_rival'] || p2Uid === 'bot_rival');

  const p1Nickname = room.players[p1Uid]?.nickname || 'Player 1';
  const p2Nickname = room.players[p2Uid]?.nickname || 'CyberBot';

  // React state ONLY for the Match Conclusion Modal (never called per frame!)
  const [raceWinner, setRaceWinner] = useState<string | null>(null);
  const finishDispatched = useRef<boolean>(false);

  // Dash availability ref & cooldown tracker
  const dashCooldownRef = useRef<number>(0);
  const onDispatchActionRef = useRef(onDispatchAction);
  useEffect(() => {
    onDispatchActionRef.current = onDispatchAction;
  }, [onDispatchAction]);

  // Track Dimensions
  const W = 460;
  const H = 640;
  const TRACK_LEFT = 35;
  const TRACK_RIGHT = 425;
  const TRACK_WIDTH = TRACK_RIGHT - TRACK_LEFT;

  // Track coordinates: Runners start at START_Y = 1750 and sprint UPWARDS to FINISH_Y = 140
  const START_Y = 1750;
  const FINISH_Y = 140;
  const TOTAL_DISTANCE = START_Y - FINISH_Y;

  // Runners state
  const runners = useRef<{
    [uid: string]: {
      x: number;
      y: number;
      z: number; // 3D Jump Height
      targetX: number; // For silky smooth 1-to-1 touch/pointer tracking
      vx: number;
      vy: number;
      knockbackVx: number;
      knockbackVy: number;
      bankAngle: number; // Dynamic physics lean into turns
      jumpTimer: number;
      isJumping: boolean;
      dashTimer: number;
      invulnTimer: number; // Invulnerability flicker after collision (NEVER locks input!)
      boostTimer: number;
      animPhase: number;
      facing: number;
    };
  }>({});

  const remoteRunners = useRef<{
    [uid: string]: { x: number; y: number; z: number; isJumping: boolean; animPhase: number; bankAngle: number };
  }>({});

  const keysDown = useRef<{ [key: string]: boolean }>({});
  const mobileInput = useRef({ left: false, right: false, forward: false, backward: false });
  const lastNetworkDispatch = useRef<number>(0);

  // Keyboard navigation (Supports WASD, Arrow keys, Space, Shift)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keysDown.current[k] = true;
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) {
        e.preventDefault();
      }
      if (k === ' ' || k === 'arrowup' || k === 'w') {
        triggerJump();
      }
      if (k === 'shift' || k === 'e' || k === 'arrowdown' || k === 's') {
        triggerDash();
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

  // Sync remote runners in 2P online multiplayer
  useEffect(() => {
    if (!isBotPlaying && room.gameState?.runners) {
      const oppUid = p1Uid === playerUid ? p2Uid : p1Uid;
      const remote = room.gameState.runners[oppUid];
      if (remote) {
        remoteRunners.current[oppUid] = remote;
      }
    }
  }, [room.gameState?.runners, isBotPlaying, p1Uid, p2Uid, playerUid]);

  // Reset race state on round change
  const resetRace = () => {
    runners.current = {
      [p1Uid]: {
        x: 170,
        y: START_Y,
        z: 0,
        targetX: 170,
        vx: 0,
        vy: 0,
        knockbackVx: 0,
        knockbackVy: 0,
        bankAngle: 0,
        jumpTimer: 0,
        isJumping: false,
        dashTimer: 0,
        invulnTimer: 0,
        boostTimer: 0,
        animPhase: 0,
        facing: 0
      },
      [p2Uid]: {
        x: 290,
        y: START_Y,
        z: 0,
        targetX: 290,
        vx: 0,
        vy: 0,
        knockbackVx: 0,
        knockbackVy: 0,
        bankAngle: 0,
        jumpTimer: 0,
        isJumping: false,
        dashTimer: 0,
        invulnTimer: 0,
        boostTimer: 0,
        animPhase: 0,
        facing: 0
      }
    };
    finishDispatched.current = false;
    dashCooldownRef.current = 0;
    setRaceWinner(null);
  };

  useEffect(() => {
    resetRace();
  }, [room.currentRound, room.status, p1Uid, p2Uid]);

  const triggerJump = () => {
    const me = runners.current[playerUid];
    if (!me || me.isJumping || finishDispatched.current) return;

    me.isJumping = true;
    me.jumpTimer = 0.54;
    soundService.playCountdown(1);
    if (navigator.vibrate) navigator.vibrate(22);
  };

  const triggerDash = () => {
    if (dashCooldownRef.current > 0 || finishDispatched.current) return;
    const me = runners.current[playerUid];
    if (!me) return;

    dashCooldownRef.current = 2.2; // 2.2s cooldown
    me.dashTimer = 0.45;
    soundService.playScore();
    if (navigator.vibrate) navigator.vibrate(35);
  };

  // Main 60 FPS Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasMgr = new CanvasManager(canvas);
    const juice = new JuiceEngine(400);

    // Modern Play Store 2.5D Course Hazards Configuration
    const turboPads = [
      { x: 130, y: 1560, w: 80, h: 50 },
      { x: 260, y: 1040, w: 80, h: 50 },
      { x: 190, y: 480, w: 80, h: 50 }
    ];

    const springPads = [
      { x: 230, y: 1330, r: 26 },
      { x: 230, y: 740, r: 26 }
    ];

    const rotatingSweepers = [
      { y: 1440, x: 230, radius: 110, angle: 0, speed: 2.2 },
      { y: 880, x: 230, radius: 115, angle: Math.PI / 4, speed: -2.5 },
      { y: 340, x: 230, radius: 110, angle: Math.PI / 2, speed: 2.4 }
    ];

    const laserJumpGates = [
      { y: 1180, w: TRACK_WIDTH, h: 14 },
      { y: 620, w: TRACK_WIDTH, h: 14 }
    ];

    const mudZones = [
      { x: 60, y: 1300, w: 340, h: 80 },
      { x: 60, y: 710, w: 340, h: 80 }
    ];

    const slidingBumpers = [
      { y: 1020, w: 140, h: 32, x: 80, minX: 45, maxX: 275, dir: 1, speed: 180 },
      { y: 460, w: 140, h: 32, x: 235, minX: 45, maxX: 275, dir: -1, speed: 195 }
    ];

    // High-Responsiveness Touch Dragging Steering (1-to-1 finger tracking like Pong!)
    let isTouching = false;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;

    const handlePointerDown = (e: PointerEvent) => {
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch {}
      const rect = canvas.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * W;
      const py = ((e.clientY - rect.top) / rect.height) * H;

      isTouching = true;
      touchStartX = px;
      touchStartY = py;
      touchStartTime = Date.now();

      // Guide runner targetX immediately to finger position!
      const me = runners.current[playerUid];
      if (me) {
        me.targetX = Math.max(TRACK_LEFT + 22, Math.min(TRACK_RIGHT - 22, px));
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isTouching) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * W;

      const me = runners.current[playerUid];
      if (me) {
        me.targetX = Math.max(TRACK_LEFT + 22, Math.min(TRACK_RIGHT - 22, px));
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!isTouching) return;
      isTouching = false;
      const rect = canvas.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * W;
      const py = ((e.clientY - rect.top) / rect.height) * H;
      const deltaY = py - touchStartY;
      const deltaX = px - touchStartX;
      const elapsed = Date.now() - touchStartTime;

      // Quick upward swipe -> JUMP!
      if (deltaY < -28 && Math.abs(deltaY) > Math.abs(deltaX) && elapsed < 400) {
        triggerJump();
      }
      // Quick downward swipe -> DASH!
      else if (deltaY > 28 && Math.abs(deltaY) > Math.abs(deltaX) && elapsed < 400) {
        triggerDash();
      }
      // Quick stationary tap -> JUMP!
      else if (Math.hypot(deltaX, deltaY) < 18 && elapsed < 260) {
        triggerJump();
      }
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);

    const update = (dt: number) => {
      // Delta time clamp prevents leaps if browser tab is throttled
      const clampedDt = Math.min(0.04, dt);
      juice.update(clampedDt);
      const now = Date.now();

      // Update Dash Cooldown
      if (dashCooldownRef.current > 0) {
        dashCooldownRef.current = Math.max(0, dashCooldownRef.current - clampedDt);
      }

      // Update Course Hazards
      rotatingSweepers.forEach((h) => {
        h.angle += h.speed * clampedDt;
      });

      slidingBumpers.forEach((b) => {
        b.x += b.dir * b.speed * clampedDt;
        if (b.x >= b.maxX) {
          b.x = b.maxX;
          b.dir = -1;
        } else if (b.x <= b.minX) {
          b.x = b.minX;
          b.dir = 1;
        }
      });

      // Update Player Runner
      const me = runners.current[playerUid];
      if (me) {
        // Jump Arc (Parabolic vertical ascent & descent)
        if (me.isJumping) {
          me.jumpTimer -= clampedDt;
          if (me.jumpTimer <= 0) {
            me.isJumping = false;
            me.jumpTimer = 0;
            me.z = 0;
            // Landing dust puff
            juice.emitSparks(me.x, me.y + 12, 10, '#cbd5e1', '#94a3b8', 2.8);
          } else {
            const progress = (0.54 - me.jumpTimer) / 0.54;
            me.z = Math.sin(progress * Math.PI) * 44; // 44px high buoyant jump!
          }
        }

        // Decay invulnerability
        if (me.invulnTimer > 0) {
          me.invulnTimer -= clampedDt;
        }

        // Decay knockback impulses smoothly
        me.knockbackVx *= Math.max(0, 1 - 9 * clampedDt);
        me.knockbackVy *= Math.max(0, 1 - 9 * clampedDt);

        // Keyboard & Mobile Button movement offsets
        const isLeft = keysDown.current['arrowleft'] || keysDown.current['a'] || mobileInput.current.left;
        const isRight = keysDown.current['arrowright'] || keysDown.current['d'] || mobileInput.current.right;
        const keyMoveSpeed = 360 * clampedDt;

        if (isLeft) me.targetX = Math.max(TRACK_LEFT + 22, me.targetX - keyMoveSpeed);
        if (isRight) me.targetX = Math.min(TRACK_RIGHT - 22, me.targetX + keyMoveSpeed);

        // Smooth target tracking (1-to-1 finger responsiveness, zero lag!)
        const targetDiff = me.targetX - me.x;
        const prevX = me.x;
        me.x += targetDiff * Math.min(1, 24 * clampedDt) + me.knockbackVx * clampedDt;
        me.x = Math.max(TRACK_LEFT + 20, Math.min(TRACK_RIGHT - 20, me.x));
        me.vx = (me.x - prevX) / clampedDt;

        // Dynamic physics bank/lean into turns
        const targetBank = Math.max(-0.28, Math.min(0.28, me.vx * 0.0011));
        me.bankAngle += (targetBank - me.bankAngle) * Math.min(1, 14 * clampedDt);

        // Forward running velocity (negative vy = running UPWARDS)
        let forwardSpeed = 230;

        if (me.dashTimer > 0) {
          me.dashTimer -= clampedDt;
          forwardSpeed = 430; // Supersonic Dash!
          juice.emitSparks(me.x, me.y + 14, 2, '#10b981', '#34d399', 3);
        }
        if (me.boostTimer > 0) {
          me.boostTimer -= clampedDt;
          forwardSpeed = 380; // Turbo pad!
          juice.emitSparks(me.x, me.y + 14, 2, '#38bdf8', '#06b6d4', 3);
        }

        // Check Toxic Slime (only slows if grounded; jumping sails over with ZERO slowdown!)
        if (!me.isJumping) {
          for (const m of mudZones) {
            if (me.x >= m.x && me.x <= m.x + m.w && me.y >= m.y && me.y <= m.y + m.h) {
              forwardSpeed *= 0.45;
              if (Math.random() < 0.25) {
                juice.emitSparks(me.x, me.y + 10, 2, '#c084fc', '#a855f7', 1.5);
              }
              break;
            }
          }
        }

        me.vy = -forwardSpeed + me.knockbackVy;
        me.y += me.vy * clampedDt;
        me.animPhase += clampedDt * (forwardSpeed / 16);

        // Check Spring Jump Pads (Super Launch!)
        for (const sp of springPads) {
          if (Math.hypot(me.x - sp.x, me.y - sp.y) < sp.r + 14 && !me.isJumping) {
            me.isJumping = true;
            me.jumpTimer = 0.72; // Extra high catapult bounce!
            soundService.playScore();
            juice.addTrauma(0.25);
            juice.emitSparks(me.x, me.y, 18, '#f59e0b', '#fbbf24', 4.5);
          }
        }

        // Check Turbo Boost Slingshots (low altitude)
        if (me.z < 16) {
          for (const tp of turboPads) {
            if (
              me.x >= tp.x - 12 &&
              me.x <= tp.x + tp.w + 12 &&
              me.y >= tp.y - 12 &&
              me.y <= tp.y + tp.h + 12
            ) {
              if (me.boostTimer <= 0) {
                me.boostTimer = 0.95;
                soundService.playScore();
                juice.addTrauma(0.18);
                juice.emitSparks(me.x, me.y, 16, '#10b981', '#34d399', 4.5);
              }
            }
          }
        }

        // Check Laser Jump Gates (jumping clears gate completely!)
        if (me.z < 22 && me.invulnTimer <= 0) {
          for (const lg of laserJumpGates) {
            if (Math.abs(me.y - lg.y) < 16) {
              me.invulnTimer = 0.75; // Invulnerable recoil, NO control lockout!
              me.knockbackVy = 260; // Push back slightly
              soundService.playImpact(1.3);
              juice.addTrauma(0.38);
              juice.emitExplosion(me.x, me.y, 22);
              break;
            }
          }
        }

        // Check Rotating Spiked Sweepers (jumping clears sweeper arm!)
        if (me.z < 26 && me.invulnTimer <= 0) {
          for (const rh of rotatingSweepers) {
            for (let a = 0; a < 4; a++) {
              const armAngle = rh.angle + (a * Math.PI) / 2;
              const hx = rh.x + Math.cos(armAngle) * rh.radius * 0.72;
              const hy = rh.y + Math.sin(armAngle) * rh.radius * 0.72;
              const dist = Math.hypot(me.x - hx, me.y - hy);

              if (dist < 26) {
                me.invulnTimer = 0.75;
                const bounceDirX = me.x > hx ? 1 : -1;
                me.knockbackVx = bounceDirX * 280;
                me.knockbackVy = 220;
                soundService.playImpact(1.4);
                juice.addTrauma(0.42);
                juice.emitExplosion(me.x, me.y, 25);
                break;
              }
            }
          }
        }

        // Check Sliding Bumpers (jumping clears bumper!)
        if (me.z < 22 && me.invulnTimer <= 0) {
          for (const sb of slidingBumpers) {
            if (
              me.x >= sb.x - 14 &&
              me.x <= sb.x + sb.w + 14 &&
              me.y >= sb.y - 14 &&
              me.y <= sb.y + sb.h + 14
            ) {
              me.invulnTimer = 0.75;
              me.knockbackVx = sb.dir * 300;
              me.knockbackVy = 200;
              soundService.playImpact(1.2);
              juice.addTrauma(0.35);
              juice.emitSparks(me.x, me.y, 16, '#f43f5e', '#fb7185', 4);
            }
          }
        }

        // Broadcast runner position strictly in 2P network mode (NEVER in bot mode to prevent React state churn!)
        if (!isBotPlaying && now - lastNetworkDispatch.current > 66) {
          lastNetworkDispatch.current = now;
          onDispatchActionRef.current('RUNNER_POS', {
            x: Math.round(me.x),
            y: Math.round(me.y),
            z: Math.round(me.z),
            isJumping: me.isJumping,
            animPhase: Math.round(me.animPhase * 10) / 10,
            bankAngle: Math.round(me.bankAngle * 100) / 100
          });
        }
      }

      // CyberBot AI Runner: Competes naturally, jumps hazards, seeks turbo pads!
      const bot = runners.current[p2Uid];
      if (bot && isBotPlaying) {
        if (bot.isJumping) {
          bot.jumpTimer -= clampedDt;
          if (bot.jumpTimer <= 0) {
            bot.isJumping = false;
            bot.jumpTimer = 0;
            bot.z = 0;
          } else {
            const progress = (0.54 - bot.jumpTimer) / 0.54;
            bot.z = Math.sin(progress * Math.PI) * 44;
          }
        }

        if (bot.invulnTimer > 0) {
          bot.invulnTimer -= clampedDt;
        }

        bot.knockbackVx *= Math.max(0, 1 - 9 * clampedDt);
        bot.knockbackVy *= Math.max(0, 1 - 9 * clampedDt);

        let botSpeed = 225;

        if (bot.boostTimer > 0) {
          bot.boostTimer -= clampedDt;
          botSpeed = 380;
        }

        // Bot target: seek upcoming turbo pads
        let targetX = 230;
        const nextPad = turboPads.find((tp) => tp.y < bot.y && tp.y > bot.y - 260);
        if (nextPad) targetX = nextPad.x + nextPad.w / 2;

        // Bot jumps over mud zones & laser gates
        const upcomingMud = mudZones.find((m) => bot.y <= m.y + m.h + 30 && bot.y >= m.y);
        const upcomingLaser = laserJumpGates.find((lg) => bot.y <= lg.y + 45 && bot.y >= lg.y - 10);
        if ((upcomingMud || upcomingLaser) && !bot.isJumping && Math.random() < 0.85) {
          bot.isJumping = true;
          bot.jumpTimer = 0.54;
        }

        // Bot avoids rotating sweepers
        const nearSweeper = rotatingSweepers.find((rh) => Math.abs(rh.y - bot.y) < 110);
        if (nearSweeper) {
          targetX = bot.x > 230 ? TRACK_RIGHT - 36 : TRACK_LEFT + 36;
        }

        const prevBotX = bot.x;
        bot.x += (targetX - bot.x) * Math.min(1, 10 * clampedDt) + bot.knockbackVx * clampedDt;
        bot.x = Math.max(TRACK_LEFT + 20, Math.min(TRACK_RIGHT - 20, bot.x));
        bot.vx = (bot.x - prevBotX) / clampedDt;
        bot.bankAngle += (Math.max(-0.28, Math.min(0.28, bot.vx * 0.0011)) - bot.bankAngle) * Math.min(1, 14 * clampedDt);

        bot.vy = -botSpeed + bot.knockbackVy;
        bot.y += bot.vy * clampedDt;
        bot.animPhase += clampedDt * (botSpeed / 16);

        // Check Turbo Pads for Bot
        for (const tp of turboPads) {
          if (
            bot.x >= tp.x - 12 &&
            bot.x <= tp.x + tp.w + 12 &&
            bot.y >= tp.y - 12 &&
            bot.y <= tp.y + tp.h + 12
          ) {
            bot.boostTimer = 0.95;
          }
        }
      } else if (!isBotPlaying) {
        // Interpolate remote opponent in 2P network match
        const oppUid = p1Uid === playerUid ? p2Uid : p1Uid;
        const remote = remoteRunners.current[oppUid];
        if (remote && runners.current[oppUid]) {
          const r = runners.current[oppUid];
          r.x += (remote.x - r.x) * 0.35;
          r.y += (remote.y - r.y) * 0.35;
          r.z = remote.z;
          r.isJumping = remote.isJumping;
          r.animPhase = remote.animPhase;
          r.bankAngle = remote.bankAngle || 0;
        }
      }

      // Finish Line Cross Check (Y <= FINISH_Y)
      for (const [uid, runner] of Object.entries(runners.current)) {
        if (runner.y <= FINISH_Y && !finishDispatched.current) {
          finishDispatched.current = true;
          const victor = uid === p1Uid ? p1Nickname : p2Nickname;
          setRaceWinner(victor);
          soundService.playVictory();
          juice.addTrauma(0.65);
          juice.emitExplosion(W / 2, FINISH_Y, 60);

          onDispatchActionRef.current('RUNNER_FINISH', { winnerUid: uid, actingUid: playerUid });
          break;
        }
      }
    };

    const render = () => {
      const ctx = canvasMgr.ctx;
      ctx.clearRect(0, 0, canvasMgr.width, canvasMgr.height);
      ctx.save();
      ctx.translate(juice.offsetX, juice.offsetY);

      const scaleX = canvasMgr.width / W;
      const scaleY = canvasMgr.height / H;
      ctx.scale(scaleX, scaleY);

      // Camera smoothly tracks player Y forward with dynamic lookahead
      const me = runners.current[playerUid] || { x: 230, y: START_Y };
      const camY = Math.max(0, Math.min(START_Y - H + 120, me.y - H * 0.72));

      ctx.save();
      ctx.translate(0, -camY);

      // 1. Deep Space Cyber Stadium Arena Floor
      const floorGrad = ctx.createLinearGradient(0, 0, 0, START_Y + 250);
      floorGrad.addColorStop(0, '#030712');
      floorGrad.addColorStop(0.5, '#0b0f19');
      floorGrad.addColorStop(1, '#03050a');
      ctx.fillStyle = floorGrad;
      ctx.fillRect(0, 0, W, START_Y + 250);

      // Cyber Grid Pattern
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.08)';
      ctx.lineWidth = 1;
      for (let x = 30; x < W; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, START_Y + 200);
        ctx.stroke();
      }
      for (let y = 30; y < START_Y + 200; y += 30) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      // Asphalt Track Platform
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(TRACK_LEFT, 50, TRACK_WIDTH, START_Y + 100);

      // Track Inner Surface Texture
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(TRACK_LEFT + 8, 50, TRACK_WIDTH - 16, START_Y + 100);

      // Neon Guardrails with Cyber Glow
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(TRACK_LEFT, 50);
      ctx.lineTo(TRACK_LEFT, START_Y + 150);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(TRACK_RIGHT, 50);
      ctx.lineTo(TRACK_RIGHT, START_Y + 150);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Hazard Warning Curbs (Alternating Black and Neon Yellow/Cyan)
      for (let y = 50; y < START_Y + 150; y += 24) {
        ctx.fillStyle = Math.floor(y / 24) % 2 === 0 ? '#020617' : '#06b6d4';
        ctx.fillRect(TRACK_LEFT - 4, y, 4, 24);
        ctx.fillRect(TRACK_RIGHT, y, 4, 24);
      }

      // Center Sprint Chevron Markings (Indicating racing UPWARDS ▲▲▲)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      for (let y = 100; y < START_Y + 100; y += 70) {
        ctx.beginPath();
        ctx.moveTo(W / 2, y);
        ctx.lineTo(W / 2 + 10, y + 14);
        ctx.lineTo(W / 2 + 6, y + 14);
        ctx.lineTo(W / 2, y + 5);
        ctx.lineTo(W / 2 - 6, y + 14);
        ctx.lineTo(W / 2 - 10, y + 14);
        ctx.closePath();
        ctx.fill();
      }

      // Start Line Chequered Mat (Y = START_Y)
      for (let c = 0; c < 10; c++) {
        for (let r = 0; r < 2; r++) {
          ctx.fillStyle = (c + r) % 2 === 0 ? '#ffffff' : '#020617';
          ctx.fillRect(TRACK_LEFT + c * (TRACK_WIDTH / 10), START_Y + 25 + r * 10, TRACK_WIDTH / 10, 10);
        }
      }
      ctx.fillStyle = '#38bdf8';
      ctx.font = '900 12px "Outfit", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⚡ SPRINT UPWARDS ⚡', W / 2, START_Y + 62);

      // 2. Toxic Acid Slime Pools
      for (const m of mudZones) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(m.x, m.y + 4, m.w, m.h);

        const acidGrad = ctx.createLinearGradient(0, m.y, 0, m.y + m.h);
        acidGrad.addColorStop(0, 'rgba(126, 34, 206, 0.9)');
        acidGrad.addColorStop(1, 'rgba(88, 28, 135, 0.9)');
        ctx.fillStyle = acidGrad;
        ctx.beginPath();
        ctx.roundRect(m.x, m.y, m.w, m.h, 12);
        ctx.fill();

        ctx.strokeStyle = '#c084fc';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#f3e8ff';
        ctx.font = '900 11px "Outfit", sans-serif';
        ctx.fillText('⚠️ ACID SLIME (JUMP TO CLEAR!)', W / 2, m.y + m.h / 2 + 4);
      }

      // 3. Super Spring Jump Launchers
      for (const sp of springPads) {
        ctx.fillStyle = '#b45309';
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sp.r - 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.fillStyle = '#000000';
        ctx.font = '900 11px "Outfit", sans-serif';
        ctx.fillText('⬆ JUMP', sp.x, sp.y + 4);
      }

      // 4. Turbo Boost Arrow Pads (Slingshots)
      for (const tp of turboPads) {
        ctx.fillStyle = 'rgba(16, 185, 129, 0.25)';
        ctx.beginPath();
        ctx.roundRect(tp.x, tp.y, tp.w, tp.h, 8);
        ctx.fill();

        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.fillStyle = '#34d399';
        ctx.beginPath();
        ctx.moveTo(tp.x + tp.w / 2, tp.y + 8);
        ctx.lineTo(tp.x + tp.w - 14, tp.y + tp.h - 10);
        ctx.lineTo(tp.x + 14, tp.y + tp.h - 10);
        ctx.closePath();
        ctx.fill();
      }

      // 5. Laser Jump Gates (Crackling High-Voltage Barrier)
      for (const lg of laserJumpGates) {
        // Left & Right Pylons
        ctx.fillStyle = '#eab308';
        ctx.fillRect(TRACK_LEFT - 6, lg.y - 12, 12, 24);
        ctx.fillRect(TRACK_RIGHT - 6, lg.y - 12, 12, 24);

        // Crackling Beam
        ctx.strokeStyle = '#facc15';
        ctx.shadowColor = '#facc15';
        ctx.shadowBlur = 10;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(TRACK_LEFT, lg.y);
        ctx.lineTo(TRACK_RIGHT, lg.y);
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#fef08a';
        ctx.font = '900 10px "Outfit", sans-serif';
        ctx.fillText('⚡ LASER GATE (JUMP OVER) ⚡', W / 2, lg.y - 6);
      }

      // 6. Sliding Hydraulic Bumpers
      for (const sb of slidingBumpers) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.beginPath();
        ctx.roundRect(sb.x, sb.y + 4, sb.w, sb.h, 6);
        ctx.fill();

        ctx.fillStyle = '#e11d48';
        ctx.beginPath();
        ctx.roundRect(sb.x, sb.y, sb.w, sb.h, 6);
        ctx.fill();

        // Hazard Chevron Stripes
        ctx.fillStyle = '#fbbf24';
        for (let s = 0; s < sb.w; s += 22) {
          ctx.beginPath();
          ctx.moveTo(sb.x + s, sb.y);
          ctx.lineTo(sb.x + s + 10, sb.y);
          ctx.lineTo(sb.x + s + 4, sb.y + sb.h);
          ctx.lineTo(sb.x + s - 6, sb.y + sb.h);
          ctx.closePath();
          ctx.fill();
        }

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // 7. Rotating Plasma Sweepers
      for (const rh of rotatingSweepers) {
        // Base Turret
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.beginPath();
        ctx.arc(rh.x, rh.y + 6, 22, 0, Math.PI * 2);
        ctx.fill();

        // 4 Sweeping Arms
        for (let a = 0; a < 4; a++) {
          const armAngle = rh.angle + (a * Math.PI) / 2;
          const hx = rh.x + Math.cos(armAngle) * rh.radius * 0.72;
          const hy = rh.y + Math.sin(armAngle) * rh.radius * 0.72;

          ctx.strokeStyle = '#475569';
          ctx.lineWidth = 8;
          ctx.beginPath();
          ctx.moveTo(rh.x, rh.y);
          ctx.lineTo(hx, hy);
          ctx.stroke();

          // Spiked Energy Tip
          ctx.fillStyle = '#f59e0b';
          ctx.beginPath();
          ctx.arc(hx, hy, 15, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.stroke();

          const tipX = hx + Math.cos(armAngle) * 11;
          const tipY = hy + Math.sin(armAngle) * 11;
          ctx.fillStyle = '#dc2626';
          ctx.beginPath();
          ctx.arc(tipX, tipY, 4.5, 0, Math.PI * 2);
          ctx.fill();
        }

        // Center Turret Core
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(rh.x, rh.y, 18, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      // 8. Monumental Checkered Finish Archway (Y = FINISH_Y)
      for (let c = 0; c < 12; c++) {
        for (let r = 0; r < 3; r++) {
          ctx.fillStyle = (c + r) % 2 === 0 ? '#ffffff' : '#000000';
          ctx.fillRect(TRACK_LEFT + c * (TRACK_WIDTH / 12), FINISH_Y + r * 10, TRACK_WIDTH / 12, 10);
        }
      }

      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(TRACK_LEFT - 12, FINISH_Y - 30, 16, 70);
      ctx.fillRect(TRACK_RIGHT - 4, FINISH_Y - 30, 16, 70);

      ctx.fillStyle = '#fbbf24';
      ctx.font = '900 17px "Outfit", sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 18;
      ctx.fillText('🏁 FINISH ARCH 🏁', W / 2, FINISH_Y - 14);
      ctx.shadowBlur = 0;

      // 9. Render Stylized 3D Brawler Runners
      for (const [uid, runner] of Object.entries(runners.current)) {
        const isMe = uid === playerUid;
        const mainColor = isMe ? '#f59e0b' : '#06b6d4';
        const visorColor = isMe ? '#fbbf24' : '#22d3ee';
        const z = runner.z || 0;

        ctx.save();
        ctx.translate(runner.x, runner.y);

        // Ground Drop Shadow (Contracts & softens as runner leaps)
        ctx.fillStyle = `rgba(0, 0, 0, ${Math.max(0.12, 0.45 - z * 0.007)})`;
        ctx.beginPath();
        ctx.ellipse(0, 10, Math.max(6, 18 - z * 0.25), Math.max(3, 9 - z * 0.15), 0, 0, Math.PI * 2);
        ctx.fill();

        // Invulnerability flicker
        if (runner.invulnTimer > 0 && Math.floor(Date.now() / 60) % 2 === 0) {
          ctx.globalAlpha = 0.4;
        }

        // Lift runner by vertical jump height z
        ctx.translate(0, -z);

        // Dynamic Physics Bank/Lean into swerves!
        ctx.rotate(runner.bankAngle || 0);

        // Turbo Speed Exhaust Cones
        if (runner.boostTimer > 0 || runner.dashTimer > 0) {
          ctx.fillStyle = runner.dashTimer > 0 ? 'rgba(16, 185, 129, 0.85)' : 'rgba(56, 189, 248, 0.85)';
          ctx.beginPath();
          ctx.moveTo(-10, 10);
          ctx.lineTo(0, 24);
          ctx.lineTo(10, 10);
          ctx.closePath();
          ctx.fill();
        }

        // Animated Running Shoes
        if (z < 6) {
          const footSwing = Math.sin(runner.animPhase) * 8;
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.roundRect(-10, 8 + footSwing, 7, 10, 3);
          ctx.roundRect(3, 8 - footSwing, 7, 10, 3);
          ctx.fill();
        } else {
          // Tucked legs during jump
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.roundRect(-9, 4, 6, 8, 3);
          ctx.roundRect(3, 4, 6, 8, 3);
          ctx.fill();
        }

        // 3D Spherical Capsule Brawler Body
        const bodyGrad = ctx.createRadialGradient(-3, -4, 2, 0, 0, 18);
        bodyGrad.addColorStop(0, '#ffffff');
        bodyGrad.addColorStop(0.35, mainColor);
        bodyGrad.addColorStop(1, isMe ? '#b45309' : '#0e7490');
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.roundRect(-14, -14, 28, 26, 12);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Expressive Cyber Visor
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.roundRect(-9, -10, 18, 9, 4);
        ctx.fill();

        ctx.fillStyle = visorColor;
        ctx.shadowColor = visorColor;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(-3, -6, 2.5, 0, Math.PI * 2);
        ctx.arc(3, -6, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Player Name Tag
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 10px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(isMe ? 'YOU' : uid === p1Uid ? p1Nickname.substring(0, 8) : p2Nickname.substring(0, 8), 0, -22);

        ctx.restore();
      }

      ctx.restore(); // Exit camera translate

      // 10. In-Canvas Live Race Progress HUD (Always 60 FPS, Zero React Stutter!)
      const meRunner = runners.current[playerUid];
      const oppRunnerObj = runners.current[p1Uid === playerUid ? p2Uid : p1Uid];
      const p1Pct = meRunner ? Math.max(0, Math.min(100, Math.round(((START_Y - meRunner.y) / TOTAL_DISTANCE) * 100))) : 0;
      const p2Pct = oppRunnerObj ? Math.max(0, Math.min(100, Math.round(((START_Y - oppRunnerObj.y) / TOTAL_DISTANCE) * 100))) : 0;

      // HUD Background Capsule
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.beginPath();
      ctx.roundRect(14, 12, W - 28, 42, 14);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Mini Progress Track
      const trackX = 75;
      const trackW = W - 150;
      const trackY = 32;

      ctx.fillStyle = '#020617';
      ctx.beginPath();
      ctx.roundRect(trackX, trackY - 4, trackW, 8, 4);
      ctx.fill();

      // P1 Runner Dot (Amber)
      const p1DotX = trackX + (p1Pct / 100) * trackW;
      ctx.fillStyle = '#f59e0b';
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(p1DotX, trackY, 6, 0, Math.PI * 2);
      ctx.fill();

      // P2 Runner Dot (Cyan)
      const p2DotX = trackX + (p2Pct / 100) * trackW;
      ctx.fillStyle = '#06b6d4';
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(p2DotX, trackY, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Leading Crown Icon
      if (p1Pct > p2Pct) {
        ctx.fillStyle = '#fbbf24';
        ctx.font = '10px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('👑', p1DotX, trackY - 9);
      } else if (p2Pct > p1Pct) {
        ctx.fillStyle = '#fbbf24';
        ctx.font = '10px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('👑', p2DotX, trackY - 9);
      }

      // P1 Pct Text
      ctx.fillStyle = '#f59e0b';
      ctx.font = '900 12px "Outfit", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${p1Pct}%`, 24, 36);

      // Finish Flag
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 13px "Outfit", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('🏁 100%', W - 24, 36);

      ctx.restore(); // Exit canvas scaling
      juice.renderParticles(canvasMgr.ctx, canvasMgr.width / W);
    };

    const loop = new GameLoop({ update, render });
    loop.start();

    return () => {
      loop.stop();
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [p1Uid, p2Uid, isBotPlaying, isHost, p1Nickname, p2Nickname]);

  return (
    <div className="w-full max-w-md mx-auto flex flex-col items-center select-none gap-2 px-1">
      {/* Canvas Gauntlet Stage - Running UPWARDS with Zero-Lag Architecture */}
      <div className="w-full h-[54vh] min-h-[350px] max-h-[510px] aspect-[460/640] rounded-3xl overflow-hidden shadow-2xl border-4 border-slate-800 relative bg-[#030712] cursor-pointer">
        <canvas
          ref={canvasRef}
          style={{ touchAction: 'none' }}
          className="w-full h-full block select-none"
        />

        {/* Victory Celebration Banner */}
        {raceWinner && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center animate-fade-in p-4 text-center z-20">
            <Trophy className="w-16 h-16 text-amber-400 mb-2 animate-bounce" />
            <h2 className="text-3xl font-black font-['Outfit'] text-amber-300">
              {raceWinner.toUpperCase()} WINS!
            </h2>
            <p className="text-xs font-mono text-slate-300 mt-1">Crossed the Finish Arch First!</p>
          </div>
        )}
      </div>

      {/* Modern Tactical Mobile Controls */}
      <div className="w-full grid grid-cols-4 gap-2 max-w-sm pt-0.5">
        <button
          onPointerDown={(e) => { e.preventDefault(); mobileInput.current.left = true; }}
          onPointerUp={() => { mobileInput.current.left = false; }}
          onPointerLeave={() => { mobileInput.current.left = false; }}
          onPointerCancel={() => { mobileInput.current.left = false; }}
          className="h-12 rounded-xl bg-slate-900 border-2 border-slate-700 active:bg-cyan-600/30 active:scale-95 text-xs font-black font-mono text-slate-300 flex items-center justify-center gap-1 shadow-md touch-manipulation cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4 text-cyan-400" />
          <span>LEFT</span>
        </button>

        <button
          onClick={triggerDash}
          className="h-12 rounded-xl bg-emerald-600/30 border-2 border-emerald-500/60 active:bg-emerald-600/60 active:scale-95 text-xs font-black font-mono text-emerald-300 flex items-center justify-center gap-1 shadow-md touch-manipulation cursor-pointer"
        >
          <Zap className="w-4 h-4 text-emerald-400 fill-current" />
          <span>DASH</span>
        </button>

        <button
          onClick={triggerJump}
          className="h-12 rounded-xl bg-gradient-to-r from-amber-600 to-yellow-500 border-2 border-amber-400 active:scale-95 text-xs font-black font-mono text-slate-950 flex items-center justify-center gap-1 shadow-lg touch-manipulation cursor-pointer"
        >
          <ArrowUp className="w-4 h-4 stroke-[3]" />
          <span>JUMP</span>
        </button>

        <button
          onPointerDown={(e) => { e.preventDefault(); mobileInput.current.right = true; }}
          onPointerUp={() => { mobileInput.current.right = false; }}
          onPointerLeave={() => { mobileInput.current.right = false; }}
          onPointerCancel={() => { mobileInput.current.right = false; }}
          className="h-12 rounded-xl bg-slate-900 border-2 border-slate-700 active:bg-cyan-600/30 active:scale-95 text-xs font-black font-mono text-slate-300 flex items-center justify-center gap-1 shadow-md touch-manipulation cursor-pointer"
        >
          <span>RIGHT</span>
          <ChevronRight className="w-4 h-4 text-cyan-400" />
        </button>
      </div>

      <p className="text-[10px] text-slate-400 font-mono text-center">
        🕹️ Drag anywhere to steer • ⬆ JUMP clears mud & spikes • ⚡ DASH for speed burst!
      </p>
    </div>
  );
};
