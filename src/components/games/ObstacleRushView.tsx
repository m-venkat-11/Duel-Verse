import React, { useEffect, useRef, useState } from 'react';
import type { AuthoritativeRoomState } from '../../types/room';
import { GameLoop } from '../../engine/core/GameLoop';
import { CanvasManager } from '../../engine/core/CanvasManager';
import { JuiceEngine } from '../../engine/core/JuiceEngine';
import { soundService } from '../../services/sound';
import { Zap, ChevronLeft, ChevronRight, ArrowUp, Trophy, Flag } from 'lucide-react';

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

  const [raceWinner, setRaceWinner] = useState<string | null>(null);
  const raceWinnerRef = useRef<string | null>(null);
  const finishDispatched = useRef<boolean>(false);

  // Jump State
  const [isJumpingState, setIsJumpingState] = useState<boolean>(false);

  // Runners in world coordinates (Track: X: 40 to 440, Y: 80 to 2000)
  const runners = useRef<{
    [uid: string]: {
      x: number;
      y: number;
      z: number; // Vertical jump height
      vx: number;
      vy: number;
      jumpTimer: number; // In air timer (0.5s duration)
      isJumping: boolean;
      stunTimer: number;
      boostTimer: number;
      animPhase: number;
    };
  }>({});

  const remoteRunners = useRef<{
    [uid: string]: { x: number; y: number; z: number; isJumping: boolean; animPhase: number };
  }>({});

  const keysDown = useRef<{ [key: string]: boolean }>({});
  const mobileInput = useRef({ left: false, right: false, up: false, jump: false });
  const touchJoystick = useRef<{ active: boolean; startX: number; startY: number; currX: number; currY: number }>({
    active: false,
    startX: 0,
    startY: 0,
    currX: 0,
    currY: 0
  });

  const lastNetworkDispatch = useRef<number>(0);
  const COURSE_LEN = 2000;
  const FINISH_Y = 1880;

  // Keyboard controls (WASD, Arrows, Space to Jump)
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

  // Listen for remote runner position updates in 2P multiplayer
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
      [p1Uid]: { x: 160, y: 120, z: 0, vx: 0, vy: 0, jumpTimer: 0, isJumping: false, stunTimer: 0, boostTimer: 0, animPhase: 0 },
      [p2Uid]: { x: 320, y: 120, z: 0, vx: 0, vy: 0, jumpTimer: 0, isJumping: false, stunTimer: 0, boostTimer: 0, animPhase: 0 }
    };
    finishDispatched.current = false;
    raceWinnerRef.current = null;
    setRaceWinner(null);
  };

  useEffect(() => {
    resetRace();
  }, [room.currentRound, room.status, p1Uid, p2Uid]);

  const triggerJump = () => {
    const me = runners.current[playerUid];
    if (!me || me.isJumping || me.stunTimer > 0 || finishDispatched.current) return;

    me.isJumping = true;
    me.jumpTimer = 0.52;
    setIsJumpingState(true);
    soundService.playCountdown(1);
    if (navigator.vibrate) navigator.vibrate(25);
  };

  // Main 60 FPS Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasMgr = new CanvasManager(canvas);
    const juice = new JuiceEngine(350);

    const W = 480;
    const H = 640;
    const TRACK_LEFT = 40;
    const TRACK_RIGHT = 440;
    const TRACK_WIDTH = TRACK_RIGHT - TRACK_LEFT;

    // Course Hazards Configuration
    const rotatingHammers = [
      { y: 460, x: 240, radius: 95, angle: 0, speed: 2.6 },
      { y: 1040, x: 240, radius: 105, angle: Math.PI / 4, speed: -2.8 },
      { y: 1580, x: 240, radius: 100, angle: Math.PI / 2, speed: 2.7 }
    ];

    const slidingBumpers = [
      { y: 740, w: 140, h: 26, x: 100, minX: 50, maxX: 290, dir: 1, speed: 175 },
      { y: 1320, w: 140, h: 26, x: 250, minX: 50, maxX: 290, dir: -1, speed: 185 }
    ];

    const turboPads = [
      { x: 140, y: 280, w: 70, h: 44 },
      { x: 330, y: 880, w: 70, h: 44 },
      { x: 205, y: 1420, w: 70, h: 44 }
    ];

    const mudZones = [
      { x: 80, y: 580, w: 320, h: 90 },
      { x: 80, y: 1180, w: 320, h: 90 }
    ];

    // Dynamic Touch Joystick on Left Screen Half
    const handlePointerDown = (e: PointerEvent) => {
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch {}
      const rect = canvas.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * W;
      const py = ((e.clientY - rect.top) / rect.height) * H;

      // Tap on right half triggers jump
      if (px > W * 0.65) {
        triggerJump();
        return;
      }

      touchJoystick.current = {
        active: true,
        startX: px,
        startY: py,
        currX: px,
        currY: py
      };
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!touchJoystick.current.active) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      touchJoystick.current.currX = ((e.clientX - rect.left) / rect.width) * W;
      touchJoystick.current.currY = ((e.clientY - rect.top) / rect.height) * H;
    };

    const handlePointerUp = () => {
      touchJoystick.current.active = false;
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);

    const update = (dt: number) => {
      juice.update(dt);
      const now = Date.now();

      // 1. Update Dynamic Course Hazards
      rotatingHammers.forEach((h) => {
        h.angle += h.speed * dt;
      });

      slidingBumpers.forEach((b) => {
        b.x += b.dir * b.speed * dt;
        if (b.x >= b.maxX) {
          b.x = b.maxX;
          b.dir = -1;
        } else if (b.x <= b.minX) {
          b.x = b.minX;
          b.dir = 1;
        }
      });

      // 2. Update Human Runner Movement
      const me = runners.current[playerUid];
      if (me) {
        // Handle Jump Arc
        if (me.isJumping) {
          me.jumpTimer -= dt;
          if (me.jumpTimer <= 0) {
            me.isJumping = false;
            me.jumpTimer = 0;
            me.z = 0;
            setIsJumpingState(false);
            // Landing dust
            juice.emitSparks(me.x, me.y, 6, '#cbd5e1', '#94a3b8', 2);
          } else {
            // Parabolic jump arc: peak height 36px
            const progress = (0.52 - me.jumpTimer) / 0.52;
            me.z = Math.sin(progress * Math.PI) * 36;
          }
        }

        if (me.stunTimer > 0) {
          me.stunTimer -= dt;
          me.vx *= 0.88;
          me.vy *= 0.88;
        } else {
          // Joystick vector
          let moveX = 0;
          let moveY = 0;

          if (touchJoystick.current.active) {
            const jx = touchJoystick.current.currX - touchJoystick.current.startX;
            const jy = touchJoystick.current.currY - touchJoystick.current.startY;
            const dist = Math.hypot(jx, jy);
            if (dist > 6) {
              const maxDist = 50;
              const factor = Math.min(1, dist / maxDist);
              moveX = (jx / dist) * factor;
              moveY = (jy / dist) * factor;
            }
          }

          // Keyboard / Button inputs
          const isLeft = keysDown.current['arrowleft'] || keysDown.current['a'] || mobileInput.current.left;
          const isRight = keysDown.current['arrowright'] || keysDown.current['d'] || mobileInput.current.right;
          const isUp = keysDown.current['arrowup'] || keysDown.current['w'] || mobileInput.current.up;
          const isDown = keysDown.current['arrowdown'] || keysDown.current['s'];

          if (isLeft) moveX = -1;
          if (isRight) moveX = 1;
          if (isUp) moveY = 1;
          if (isDown) moveY = -0.5;

          // Default auto-running pace along course
          let forwardSpeed = 205;

          if (me.boostTimer > 0) {
            me.boostTimer -= dt;
            forwardSpeed = 350; // Super turbo boost!
          }

          // Check Mud Zone: only slows down if on the ground (jumping avoids mud!)
          if (!me.isJumping) {
            for (const m of mudZones) {
              if (me.x >= m.x && me.x <= m.x + m.w && me.y >= m.y && me.y <= m.y + m.h) {
                forwardSpeed *= 0.45;
                break;
              }
            }
          }

          const lateralSpeed = 240;
          me.vx = moveX * lateralSpeed;
          me.vy = forwardSpeed + (moveY > 0 ? moveY * 55 : moveY * 70);

          if (forwardSpeed > 0) {
            me.animPhase += dt * 14;
          }
        }

        me.x = Math.max(TRACK_LEFT + 16, Math.min(TRACK_RIGHT - 16, me.x + me.vx * dt));
        me.y += me.vy * dt;

        // Check Turbo Pads (only if grounded or low)
        if (me.z < 12) {
          for (const tp of turboPads) {
            if (
              me.x >= tp.x - 10 &&
              me.x <= tp.x + tp.w + 10 &&
              me.y >= tp.y - 10 &&
              me.y <= tp.y + tp.h + 10
            ) {
              if (me.boostTimer <= 0) {
                me.boostTimer = 0.95;
                soundService.playScore();
                juice.addTrauma(0.15);
                juice.emitSparks(me.x, me.y, 16, '#10b981', '#34d399', 5);
              }
            }
          }
        }

        // Check Rotating Spiked Hammers (jump high enough can dodge)
        if (me.z < 24) {
          for (const rh of rotatingHammers) {
            for (let a = 0; a < 4; a++) {
              const armAngle = rh.angle + (a * Math.PI) / 2;
              const hx = rh.x + Math.cos(armAngle) * rh.radius * 0.72;
              const hy = rh.y + Math.sin(armAngle) * rh.radius * 0.72;
              const dist = Math.hypot(me.x - hx, me.y - hy);

              if (dist < 25 && me.stunTimer <= 0) {
                me.stunTimer = 0.55;
                me.vx = Math.cos(armAngle) * 260;
                me.vy = -180; // Knocks runner backwards!
                soundService.playImpact(1.3);
                juice.addTrauma(0.45);
                juice.emitExplosion(me.x, me.y, 22);
                break;
              }
            }
          }
        }

        // Check Sliding Bumpers (jumping clears bumper!)
        if (me.z < 18) {
          for (const sb of slidingBumpers) {
            if (
              me.x >= sb.x - 12 &&
              me.x <= sb.x + sb.w + 12 &&
              me.y >= sb.y - 12 &&
              me.y <= sb.y + sb.h + 12 &&
              me.stunTimer <= 0
            ) {
              me.stunTimer = 0.45;
              me.vx = sb.dir * 240;
              me.vy = -150;
              soundService.playImpact(1.2);
              juice.addTrauma(0.35);
              juice.emitSparks(me.x, me.y, 14, '#f43f5e', '#fb7185', 4);
            }
          }
        }

        // Broadcast runner position (20 Hz)
        if (now - lastNetworkDispatch.current > 48) {
          lastNetworkDispatch.current = now;
          onDispatchAction('RUNNER_POS', {
            x: Math.round(me.x),
            y: Math.round(me.y),
            z: Math.round(me.z),
            isJumping: me.isJumping,
            animPhase: Math.round(me.animPhase * 10) / 10
          });
        }
      }

      // 3. CyberBot AI Runner (Play Store Standard)
      const bot = runners.current[p2Uid];
      if (bot && isBotPlaying) {
        if (bot.isJumping) {
          bot.jumpTimer -= dt;
          if (bot.jumpTimer <= 0) {
            bot.isJumping = false;
            bot.jumpTimer = 0;
            bot.z = 0;
          } else {
            const progress = (0.52 - bot.jumpTimer) / 0.52;
            bot.z = Math.sin(progress * Math.PI) * 36;
          }
        }

        if (bot.stunTimer > 0) {
          bot.stunTimer -= dt;
          bot.vx *= 0.88;
          bot.vy *= 0.88;
        } else {
          let botSpeed = 208; // Competitive human-matched speed

          if (bot.boostTimer > 0) {
            bot.boostTimer -= dt;
            botSpeed = 350;
          }

          // Bot Target: aim for upcoming turbo pads
          let targetX = 240;
          const nextPad = turboPads.find((tp) => tp.y > bot.y && tp.y < bot.y + 240);
          if (nextPad) targetX = nextPad.x + nextPad.w / 2;

          // Bot Jump over mud
          const upcomingMud = mudZones.find((m) => bot.y >= m.y - 30 && bot.y <= m.y + 20);
          if (upcomingMud && !bot.isJumping && Math.random() < 0.8) {
            bot.isJumping = true;
            bot.jumpTimer = 0.52;
          }

          // Bot Avoid rotating hammers
          const nearHammer = rotatingHammers.find((rh) => Math.abs(rh.y - bot.y) < 100);
          if (nearHammer) {
            targetX = bot.x > 240 ? TRACK_RIGHT - 35 : TRACK_LEFT + 35;
          }

          bot.x += (targetX - bot.x) * 0.1;
          bot.x = Math.max(TRACK_LEFT + 16, Math.min(TRACK_RIGHT - 16, bot.x));
          bot.y += botSpeed * dt;
          bot.animPhase += dt * 14;

          // Check Turbo Pads for Bot
          for (const tp of turboPads) {
            if (
              bot.x >= tp.x - 10 &&
              bot.x <= tp.x + tp.w + 10 &&
              bot.y >= tp.y - 10 &&
              bot.y <= tp.y + tp.h + 10
            ) {
              bot.boostTimer = 0.95;
            }
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
        }
      }

      // 4. Finish Line Cross Check
      for (const [uid, runner] of Object.entries(runners.current)) {
        if (runner.y >= FINISH_Y && !finishDispatched.current) {
          finishDispatched.current = true;
          const victor = uid === p1Uid ? p1Nickname : p2Nickname;
          raceWinnerRef.current = victor;
          setRaceWinner(victor);
          soundService.playVictory();
          juice.addTrauma(0.6);
          juice.emitExplosion(W / 2, FINISH_Y, 50);

          onDispatchAction('RUNNER_FINISH', { winnerUid: uid, actingUid: playerUid });
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

      // Camera smoothly tracks player Y position forward
      const me = runners.current[playerUid] || { x: 240, y: 120 };
      const camY = Math.max(0, Math.min(COURSE_LEN - H + 60, me.y - H * 0.65));

      ctx.save();
      ctx.translate(0, -camY);

      // 1. Deep Cyber Platform Arena
      ctx.fillStyle = '#050914';
      ctx.fillRect(0, 0, W, COURSE_LEN + 300);

      // Asphalt Track Platform
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(TRACK_LEFT, 0, TRACK_WIDTH, COURSE_LEN + 200);

      // Neon Track Guardrails with Glow
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(TRACK_LEFT, 0);
      ctx.lineTo(TRACK_LEFT, COURSE_LEN + 200);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(TRACK_RIGHT, 0);
      ctx.lineTo(TRACK_RIGHT, COURSE_LEN + 200);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Center Dashed Lane Divider
      ctx.setLineDash([14, 10]);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(W / 2, 0);
      ctx.lineTo(W / 2, COURSE_LEN + 200);
      ctx.stroke();
      ctx.setLineDash([]);

      // Start Line Chequered Mat (Y = 100)
      for (let c = 0; c < 10; c++) {
        for (let r = 0; r < 2; r++) {
          ctx.fillStyle = (c + r) % 2 === 0 ? '#ffffff' : '#020617';
          ctx.fillRect(TRACK_LEFT + c * (TRACK_WIDTH / 10), 90 + r * 10, TRACK_WIDTH / 10, 10);
        }
      }
      ctx.fillStyle = '#38bdf8';
      ctx.font = '900 11px "Outfit", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⚡ START LINE ⚡', W / 2, 78);

      // 2. Render Mud Zones
      for (const m of mudZones) {
        ctx.fillStyle = 'rgba(88, 28, 135, 0.75)';
        ctx.fillRect(m.x, m.y, m.w, m.h);
        ctx.strokeStyle = '#c084fc';
        ctx.lineWidth = 2;
        ctx.strokeRect(m.x, m.y, m.w, m.h);

        // Toxic Slime bubbles
        ctx.fillStyle = '#e879f9';
        for (let b = 0; b < 6; b++) {
          ctx.beginPath();
          ctx.arc(m.x + 35 + b * 50, m.y + 45 + Math.sin(b * 2) * 20, 6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#f3e8ff';
        ctx.font = '900 10px "Outfit", sans-serif';
        ctx.fillText('⚠️ TOXIC SLIME (JUMP OVER!)', W / 2, m.y + m.h / 2 + 3);
      }

      // 3. Render Turbo Arrow Boost Pads
      for (const tp of turboPads) {
        ctx.fillStyle = 'rgba(16, 185, 129, 0.25)';
        ctx.fillRect(tp.x, tp.y, tp.w, tp.h);
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(tp.x, tp.y, tp.w, tp.h);

        // Glowing Chevron Arrows
        ctx.fillStyle = '#34d399';
        ctx.beginPath();
        ctx.moveTo(tp.x + tp.w / 2, tp.y + 8);
        ctx.lineTo(tp.x + tp.w - 14, tp.y + tp.h - 10);
        ctx.lineTo(tp.x + 14, tp.y + tp.h - 10);
        ctx.closePath();
        ctx.fill();
      }

      // 4. Render Sliding Bumpers
      for (const sb of slidingBumpers) {
        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(sb.x, sb.y + 4, sb.w, sb.h);

        // Bumper body with warning stripes
        ctx.fillStyle = '#e11d48';
        ctx.fillRect(sb.x, sb.y, sb.w, sb.h);

        // Warning diagonal hazard stripes
        ctx.fillStyle = '#fbbf24';
        for (let s = 0; s < sb.w; s += 24) {
          ctx.beginPath();
          ctx.moveTo(sb.x + s, sb.y);
          ctx.lineTo(sb.x + s + 12, sb.y);
          ctx.lineTo(sb.x + s + 6, sb.y + sb.h);
          ctx.lineTo(sb.x + s - 6, sb.y + sb.h);
          ctx.closePath();
          ctx.fill();
        }

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(sb.x, sb.y, sb.w, sb.h);
      }

      // 5. Render Rotating Spiked Hammers
      for (const rh of rotatingHammers) {
        // Center hub shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.beginPath();
        ctx.arc(rh.x, rh.y + 5, 18, 0, Math.PI * 2);
        ctx.fill();

        // 4 Rotating Arms with Spikes
        for (let a = 0; a < 4; a++) {
          const armAngle = rh.angle + (a * Math.PI) / 2;
          const hx = rh.x + Math.cos(armAngle) * rh.radius * 0.72;
          const hy = rh.y + Math.sin(armAngle) * rh.radius * 0.72;

          // Arm bar
          ctx.strokeStyle = '#475569';
          ctx.lineWidth = 7;
          ctx.beginPath();
          ctx.moveTo(rh.x, rh.y);
          ctx.lineTo(hx, hy);
          ctx.stroke();

          // Spiked Hammer head
          ctx.fillStyle = '#f59e0b';
          ctx.beginPath();
          ctx.arc(hx, hy, 14, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.stroke();

          // Spike tip
          const tipX = hx + Math.cos(armAngle) * 10;
          const tipY = hy + Math.sin(armAngle) * 10;
          ctx.fillStyle = '#dc2626';
          ctx.beginPath();
          ctx.arc(tipX, tipY, 4, 0, Math.PI * 2);
          ctx.fill();
        }

        // Center hub
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.arc(rh.x, rh.y, 16, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      // 6. Finish Line Archway (Y = 1880)
      for (let c = 0; c < 12; c++) {
        for (let r = 0; r < 3; r++) {
          ctx.fillStyle = (c + r) % 2 === 0 ? '#ffffff' : '#000000';
          ctx.fillRect(TRACK_LEFT + c * (TRACK_WIDTH / 12), FINISH_Y + r * 10, TRACK_WIDTH / 12, 10);
        }
      }

      // Finish Banner Pillars
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(TRACK_LEFT - 8, FINISH_Y - 20, 12, 60);
      ctx.fillRect(TRACK_RIGHT - 4, FINISH_Y - 20, 12, 60);

      ctx.fillStyle = '#fbbf24';
      ctx.font = '900 16px "Outfit", sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 16;
      ctx.fillText('🏁 FINISH LINE 🏁', W / 2, FINISH_Y - 10);
      ctx.shadowBlur = 0;

      // 7. Render Both 2.5D Stylized Humanoid Runners
      for (const [uid, runner] of Object.entries(runners.current)) {
        const isMe = uid === playerUid;
        const color = isMe ? '#06b6d4' : '#f43f5e';
        const visorColor = isMe ? '#38bdf8' : '#fb7185';
        const z = runner.z || 0; // jump height

        ctx.save();
        ctx.translate(runner.x, runner.y);

        // Ground Drop Shadow (Contracts as runner jumps)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.beginPath();
        ctx.ellipse(
          0,
          8,
          Math.max(6, 16 - z * 0.25),
          Math.max(3, 8 - z * 0.15),
          0,
          0,
          Math.PI * 2
        );
        ctx.fill();

        // Stun Stars if stunned
        if (runner.stunTimer > 0) {
          ctx.fillStyle = '#facc15';
          const animTime = Date.now();
          for (let s = 0; s < 3; s++) {
            const starAngle = animTime * 0.01 + (s * Math.PI * 2) / 3;
            ctx.fillText('⭐', Math.cos(starAngle) * 18, -30 + Math.sin(starAngle) * 8);
          }
        }

        // Lift runner by z height
        ctx.translate(0, -z);

        // Boost Fire Trail when sprinting
        if (runner.boostTimer > 0) {
          ctx.fillStyle = 'rgba(16, 185, 129, 0.8)';
          ctx.beginPath();
          ctx.arc(0, 18, 12, 0, Math.PI * 2);
          ctx.fill();
        }

        // Athletic Runner Body
        // Pumping legs animation
        const legSwing = Math.sin(runner.animPhase) * 7;
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(-8, 6 + legSwing, 5, 12);
        ctx.fillRect(3, 6 - legSwing, 5, 12);

        // Torso
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(-10, -10, 20, 18, 5);
        ctx.fill();

        // Runner Head
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.arc(0, -16, 10, 0, Math.PI * 2);
        ctx.fill();

        // Glowing Visor
        ctx.fillStyle = visorColor;
        ctx.beginPath();
        ctx.roundRect(-6, -19, 12, 5, 2);
        ctx.fill();

        // Name / "YOU" Label
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 10px "Outfit", sans-serif';
        ctx.fillText(isMe ? 'YOU' : uid === p1Uid ? p1Nickname.substring(0, 8) : p2Nickname.substring(0, 8), 0, -28);

        ctx.restore();
      }

      ctx.restore(); // Exit camera translate
      ctx.restore(); // Exit scaling

      // Particle system overlay
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
  }, [p1Uid, p2Uid, isBotPlaying, isHost, p1Nickname, p2Nickname, onDispatchAction]);

  const p1Score = room.scores[p1Uid] || 0;
  const p2Score = room.scores[p2Uid] || 0;
  const myRunner = runners.current[playerUid];
  const myPct = myRunner ? Math.min(100, Math.round((myRunner.y / FINISH_Y) * 100)) : 0;
  const oppRunner = runners.current[p1Uid === playerUid ? p2Uid : p1Uid];
  const oppPct = oppRunner ? Math.min(100, Math.round((oppRunner.y / FINISH_Y) * 100)) : 0;

  return (
    <div className="w-full max-w-md mx-auto flex flex-col items-center select-none gap-2 px-1">
      {/* Live Distance Race Tracker Bar */}
      <div className="w-full flex flex-col gap-1.5 px-3 py-2 rounded-2xl bg-slate-900/90 border border-white/10 shadow-md">
        <div className="flex items-center justify-between text-xs font-mono font-bold">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-cyan-300 font-['Outfit'] font-black">{p1Nickname} (YOU)</span>
            <span className="text-cyan-400 font-black">{myPct}%</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-rose-400 font-black">{oppPct}%</span>
            <span className="text-rose-300 font-['Outfit'] font-black">{p2Nickname}</span>
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
          </div>
        </div>

        {/* Live Race Distance Progress Bar with Runner Icons */}
        <div className="w-full h-3 rounded-full bg-slate-950 border border-slate-700 relative overflow-hidden flex items-center">
          <div
            className="absolute top-0 bottom-0 left-0 bg-cyan-500/30 rounded-full transition-all duration-75"
            style={{ width: `${myPct}%` }}
          />
          {/* My Runner Dot */}
          <div
            className="absolute w-3.5 h-3.5 rounded-full bg-cyan-400 border border-white shadow-[0_0_8px_#38bdf8] transition-all duration-75 -ml-1.5"
            style={{ left: `${myPct}%` }}
          />
          {/* Opponent Runner Dot */}
          <div
            className="absolute w-3.5 h-3.5 rounded-full bg-rose-500 border border-white shadow-[0_0_8px_#f43f5e] transition-all duration-75 -ml-1.5"
            style={{ left: `${oppPct}%` }}
          />
          <Flag className="w-3 h-3 text-amber-400 absolute right-1 pointer-events-none" />
        </div>
      </div>

      {/* Canvas Gauntlet Stage - Fits mobile viewport comfortably */}
      <div className="w-full h-[52vh] min-h-[340px] max-h-[500px] aspect-[480/640] rounded-3xl overflow-hidden shadow-2xl border-4 border-slate-800 relative bg-[#050914] cursor-pointer">
        <canvas
          ref={canvasRef}
          style={{ touchAction: 'none' }}
          className="w-full h-full block select-none"
        />

        {/* Victory Celebration Banner */}
        {raceWinner && (
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center animate-fade-in p-4 text-center">
            <Trophy className="w-14 h-14 text-amber-400 mb-2 animate-bounce" />
            <h2 className="text-3xl font-black font-['Outfit'] text-amber-300">
              {raceWinner.toUpperCase()} WINS!
            </h2>
            <p className="text-xs font-mono text-slate-300 mt-1">Crossed the Finish Arch First!</p>
          </div>
        )}
      </div>

      {/* Mobile Controls: Steering + Prominent JUMP Button */}
      <div className="w-full grid grid-cols-3 gap-2 max-w-sm pt-0.5">
        <button
          onPointerDown={(e) => { e.preventDefault(); mobileInput.current.left = true; }}
          onPointerUp={() => { mobileInput.current.left = false; }}
          onPointerLeave={() => { mobileInput.current.left = false; }}
          onPointerCancel={() => { mobileInput.current.left = false; }}
          className="h-12 rounded-xl bg-slate-900 border-2 border-cyan-500/40 active:bg-cyan-600/30 active:scale-95 text-xs font-black font-mono text-cyan-300 flex items-center justify-center gap-1 shadow-md touch-manipulation cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4 text-cyan-400" />
          <span>LEFT</span>
        </button>

        <button
          onPointerDown={(e) => { e.preventDefault(); mobileInput.current.right = true; }}
          onPointerUp={() => { mobileInput.current.right = false; }}
          onPointerLeave={() => { mobileInput.current.right = false; }}
          onPointerCancel={() => { mobileInput.current.right = false; }}
          className="h-12 rounded-xl bg-slate-900 border-2 border-cyan-500/40 active:bg-cyan-600/30 active:scale-95 text-xs font-black font-mono text-cyan-300 flex items-center justify-center gap-1 shadow-md touch-manipulation cursor-pointer"
        >
          <span>RIGHT</span>
          <ChevronRight className="w-4 h-4 text-cyan-400" />
        </button>

        {/* Large Prominent JUMP Button (Clears slime mud & low hazards!) */}
        <button
          onClick={triggerJump}
          className={`h-12 rounded-xl border-2 font-mono font-black text-xs flex items-center justify-center gap-1 shadow-lg active:scale-95 transition touch-manipulation cursor-pointer ${
            isJumpingState
              ? 'bg-amber-500/30 border-amber-400 text-amber-300'
              : 'bg-gradient-to-r from-amber-600 to-yellow-500 border-amber-400 text-slate-950 font-black'
          }`}
        >
          <ArrowUp className="w-4 h-4 stroke-[3]" />
          <span>JUMP</span>
        </button>
      </div>

      <p className="text-[10px] text-slate-400 font-mono text-center">
        🕹️ Drag left half to steer • Tap JUMP to clear toxic mud & hazards!
      </p>
    </div>
  );
};
