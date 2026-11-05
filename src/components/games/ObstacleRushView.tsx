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
  const p1Uid = players[0] || 'p1';
  const p2Uid = players[1] || (p1Uid === 'bot_rival' ? 'player' : 'bot_rival');
  const isHost = room.hostUid === playerUid;
  const isBotPlaying = Boolean(room.players['bot_rival'] || p2Uid === 'bot_rival');

  const p1Nickname = room.players[p1Uid]?.nickname || 'Player 1';
  const p2Nickname = room.players[p2Uid]?.nickname || 'CyberBot';

  const [winnerName, setWinnerName] = useState<string | null>(null);
  const winnerNameRef = useRef<string | null>(null);
  const finishDispatched = useRef<boolean>(false);

  const [dashReady, setDashReady] = useState<boolean>(true);
  const [dashCooldownPct, setDashCooldownPct] = useState<number>(0);

  // Runners in world coordinates (Track: X: 40 to 480, Y: 100 to 2200)
  const runners = useRef<{
    [uid: string]: {
      x: number;
      y: number;
      vx: number;
      vy: number;
      stunTimer: number;
      boostTimer: number;
      dashTimer: number;
      animPhase: number;
    };
  }>({});

  // Input states
  const keysDown = useRef<{ [key: string]: boolean }>({});
  const mobileInput = useRef({ left: false, right: false, up: false, dash: false });
  const touchJoystick = useRef<{ active: boolean; startX: number; startY: number; currX: number; currY: number }>({
    active: false,
    startX: 0,
    startY: 0,
    currX: 0,
    currY: 0
  });

  const COURSE_LEN = 2100; // Finish line at Y = 2000

  // Keyboard navigation
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

  // Reset race state on round change
  const resetRunners = () => {
    runners.current = {
      [p1Uid]: { x: 190, y: 120, vx: 0, vy: 0, stunTimer: 0, boostTimer: 0, dashTimer: 0, animPhase: 0 },
      [p2Uid]: { x: 330, y: 120, vx: 0, vy: 0, stunTimer: 0, boostTimer: 0, dashTimer: 0, animPhase: 0 }
    };
    finishDispatched.current = false;
    winnerNameRef.current = null;
    setWinnerName(null);
  };

  useEffect(() => {
    resetRunners();
  }, [room.currentRound, room.status, p1Uid, p2Uid]);

  const handleTriggerDash = () => {
    if (!dashReady || finishDispatched.current) return;
    const myRunner = runners.current[playerUid];
    if (!myRunner || myRunner.stunTimer > 0) return;

    setDashReady(false);
    setDashCooldownPct(100);
    myRunner.dashTimer = 0.45;
    soundService.playScore();

    // 2.2s cooldown
    const TOTAL_MS = 2200;
    const step = 80;
    let rem = 100;
    const timer = setInterval(() => {
      rem -= (step / TOTAL_MS) * 100;
      if (rem <= 0) {
        clearInterval(timer);
        setDashReady(true);
        setDashCooldownPct(0);
      } else {
        setDashCooldownPct(Math.round(rem));
      }
    }, step);
  };

  // 60 FPS Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasMgr = new CanvasManager(canvas);
    const juice = new JuiceEngine(350);

    const W = 520;
    const H = 640;
    const TRACK_LEFT = 50;
    const TRACK_RIGHT = 470;
    const TRACK_WIDTH = TRACK_RIGHT - TRACK_LEFT;

    // Course Hazards Configuration
    const rotatingHammers = [
      { y: 520, x: 260, radius: 105, angle: 0, speed: 2.4 },
      { y: 1180, x: 260, radius: 115, angle: Math.PI / 4, speed: -2.8 },
      { y: 1720, x: 260, radius: 110, angle: Math.PI / 2, speed: 2.6 }
    ];

    const slidingBumpers = [
      { y: 820, w: 150, h: 28, x: 120, minX: 60, maxX: 310, dir: 1, speed: 170 },
      { y: 1460, w: 150, h: 28, x: 280, minX: 60, maxX: 310, dir: -1, speed: 190 }
    ];

    const turboPads = [
      { x: 160, y: 340, w: 70, h: 48 },
      { x: 360, y: 980, w: 70, h: 48 },
      { x: 225, y: 1580, w: 70, h: 48 }
    ];

    const mudZones = [
      { x: 100, y: 680, w: 320, h: 90 },
      { x: 100, y: 1320, w: 320, h: 90 }
    ];

    // Touch joystick listeners
    const handlePointerDown = (e: PointerEvent) => {
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch {}
      const rect = canvas.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * W;
      const py = ((e.clientY - rect.top) / rect.height) * H;

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
        if (me.stunTimer > 0) {
          me.stunTimer -= dt;
          me.vx *= 0.88;
          me.vy *= 0.88;
        } else {
          // Check Joystick Vector
          let moveX = 0;
          let moveY = 0;

          if (touchJoystick.current.active) {
            const jx = touchJoystick.current.currX - touchJoystick.current.startX;
            const jy = touchJoystick.current.currY - touchJoystick.current.startY;
            const dist = Math.hypot(jx, jy);
            if (dist > 8) {
              const maxDist = 55;
              const factor = Math.min(1, dist / maxDist);
              moveX = (jx / dist) * factor;
              moveY = (jy / dist) * factor;
            }
          }

          // Keyboard / Buttons
          const isLeft = keysDown.current['arrowleft'] || keysDown.current['a'] || mobileInput.current.left;
          const isRight = keysDown.current['arrowright'] || keysDown.current['d'] || mobileInput.current.right;
          const isUp = keysDown.current['arrowup'] || keysDown.current['w'] || mobileInput.current.up;
          const isDown = keysDown.current['arrowdown'] || keysDown.current['s'];

          if (isLeft) moveX = -1;
          if (isRight) moveX = 1;
          if (isUp) moveY = 1;
          if (isDown) moveY = -0.5;

          // Default forward run speed (auto-advances along course)
          let forwardSpeed = 190;

          if (me.boostTimer > 0) {
            me.boostTimer -= dt;
            forwardSpeed = 330;
          }
          if (me.dashTimer > 0) {
            me.dashTimer -= dt;
            forwardSpeed = 360;
          }

          // Check Mud Zone slowdown
          for (const m of mudZones) {
            if (me.x >= m.x && me.x <= m.x + m.w && me.y >= m.y && me.y <= m.y + m.h) {
              forwardSpeed *= 0.55;
              break;
            }
          }

          // Apply velocity
          const lateralSpeed = 230;
          me.vx = moveX * lateralSpeed;
          me.vy = forwardSpeed + (moveY > 0 ? moveY * 60 : moveY * 80);

          if (moveX !== 0 || moveY !== 0 || forwardSpeed > 0) {
            me.animPhase += dt * 12;
          }
        }

        me.x = Math.max(TRACK_LEFT + 18, Math.min(TRACK_RIGHT - 18, me.x + me.vx * dt));
        me.y += me.vy * dt;

        // Check Turbo Pads
        for (const tp of turboPads) {
          if (
            me.x >= tp.x - 12 &&
            me.x <= tp.x + tp.w + 12 &&
            me.y >= tp.y - 12 &&
            me.y <= tp.y + tp.h + 12
          ) {
            if (me.boostTimer <= 0) {
              me.boostTimer = 0.9;
              soundService.playScore();
              juice.emitSparks(me.x, me.y, 16, '#10b981', '#34d399', 5);
            }
          }
        }

        // Check Rotating Hammer Hits
        for (const rh of rotatingHammers) {
          // Check collision with the 4 rotating arms
          for (let a = 0; a < 4; a++) {
            const armAngle = rh.angle + (a * Math.PI) / 2;
            const hx = rh.x + Math.cos(armAngle) * rh.radius * 0.75;
            const hy = rh.y + Math.sin(armAngle) * rh.radius * 0.75;
            const dist = Math.hypot(me.x - hx, me.y - hy);

            if (dist < 26 && me.stunTimer <= 0) {
              me.stunTimer = 0.55;
              me.vx = Math.cos(armAngle) * 260;
              me.vy = -180; // Knocked backward!
              soundService.playImpact(1.3);
              juice.addTrauma(0.5);
              juice.emitExplosion(me.x, me.y, 25);
              break;
            }
          }
        }

        // Check Sliding Bumper Hits
        for (const sb of slidingBumpers) {
          if (
            me.x >= sb.x - 15 &&
            me.x <= sb.x + sb.w + 15 &&
            me.y >= sb.y - 15 &&
            me.y <= sb.y + sb.h + 15 &&
            me.stunTimer <= 0
          ) {
            me.stunTimer = 0.45;
            me.vx = sb.dir * 220;
            me.vy = -160;
            soundService.playImpact(1.2);
            juice.addTrauma(0.4);
            juice.emitSparks(me.x, me.y, 14, '#f43f5e', '#fb7185', 4);
          }
        }
      }

      // 3. Update CyberBot AI Runner
      const bot = runners.current[p2Uid];
      if (bot && isBotPlaying) {
        if (bot.stunTimer > 0) {
          bot.stunTimer -= dt;
          bot.vx *= 0.88;
          bot.vy *= 0.88;
        } else {
          let botForwardSpeed = 195; // Competitive human-comparable pace

          if (bot.boostTimer > 0) {
            bot.boostTimer -= dt;
            botForwardSpeed = 330;
          }

          // Bot Pathfinding: target nearby turbo pads
          let targetX = 260;
          const nextPad = turboPads.find((tp) => tp.y > bot.y && tp.y < bot.y + 220);
          if (nextPad) {
            targetX = nextPad.x + nextPad.w / 2;
          }

          // Avoid imminent rotating hammers
          const nearHammer = rotatingHammers.find((rh) => Math.abs(rh.y - bot.y) < 110);
          if (nearHammer) {
            // Dodge to the outer track edge
            targetX = bot.x > 260 ? TRACK_RIGHT - 35 : TRACK_LEFT + 35;
          }

          bot.x += (targetX - bot.x) * 0.08;
          bot.x = Math.max(TRACK_LEFT + 18, Math.min(TRACK_RIGHT - 18, bot.x));
          bot.y += botForwardSpeed * dt;
          bot.animPhase += dt * 12;

          // Check Turbo Pads for Bot
          for (const tp of turboPads) {
            if (
              bot.x >= tp.x - 12 &&
              bot.x <= tp.x + tp.w + 12 &&
              bot.y >= tp.y - 12 &&
              bot.y <= tp.y + tp.h + 12
            ) {
              bot.boostTimer = 0.9;
            }
          }
        }
      }

      // 4. Finish Line Cross Check (at Y = 2000)
      const FINISH_Y = 2000;
      for (const [uid, runner] of Object.entries(runners.current)) {
        if (runner.y >= FINISH_Y && !finishDispatched.current) {
          finishDispatched.current = true;
          const victor = uid === p1Uid ? p1Nickname : p2Nickname;
          winnerNameRef.current = victor;
          setWinnerName(victor);
          soundService.playVictory();
          onDispatchAction('RUNNER_FINISH', { winnerUid: uid, actingUid: uid });
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

      // Camera smoothly tracks player Y position
      const me = runners.current[playerUid] || { x: 260, y: 120 };
      const camY = Math.max(0, Math.min(COURSE_LEN - H + 80, me.y - H * 0.65));

      ctx.save();
      ctx.translate(0, -camY);

      // 1. Deep Cyber Platform Background
      ctx.fillStyle = '#050914';
      ctx.fillRect(0, 0, W, COURSE_LEN + 300);

      // Track Asphalt Platform
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(TRACK_LEFT, 0, TRACK_WIDTH, COURSE_LEN + 200);

      // Track Side Neon Guardrails
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 5;
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(TRACK_LEFT, 0);
      ctx.lineTo(TRACK_LEFT, COURSE_LEN + 200);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(TRACK_RIGHT, 0);
      ctx.lineTo(TRACK_RIGHT, COURSE_LEN + 200);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Track Center Dashed Guideline
      ctx.setLineDash([16, 12]);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(W / 2, 0);
      ctx.lineTo(W / 2, COURSE_LEN + 200);
      ctx.stroke();
      ctx.setLineDash([]);

      // Start Line (Y = 100)
      for (let c = 0; c < 12; c++) {
        for (let r = 0; r < 2; r++) {
          ctx.fillStyle = (c + r) % 2 === 0 ? '#ffffff' : '#000000';
          ctx.fillRect(TRACK_LEFT + c * (TRACK_WIDTH / 12), 90 + r * 10, TRACK_WIDTH / 12, 10);
        }
      }
      ctx.fillStyle = '#38bdf8';
      ctx.font = '900 12px "Outfit", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⚡ START LINE ⚡', W / 2, 78);

      // Distance Markers every 400px
      for (let markY = 400; markY <= 1600; markY += 400) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.font = '900 42px "Outfit", sans-serif';
        ctx.fillText(`${markY}M`, W / 2, markY + 15);
      }

      // Mud / Sticky Zones
      mudZones.forEach((mz) => {
        ctx.fillStyle = 'rgba(168, 85, 247, 0.22)';
        ctx.fillRect(mz.x, mz.y, mz.w, mz.h);
        ctx.strokeStyle = '#c084fc';
        ctx.lineWidth = 2;
        ctx.strokeRect(mz.x, mz.y, mz.w, mz.h);

        ctx.fillStyle = '#e9d5ff';
        ctx.font = '900 11px font-mono';
        ctx.fillText('⚠ SLOW HAZARD ⚠', W / 2, mz.y + mz.h / 2 + 4);
      });

      // Turbo Boost Pads
      turboPads.forEach((tp) => {
        ctx.fillStyle = '#10b981';
        ctx.shadowColor = '#10b981';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.roundRect(tp.x, tp.y, tp.w, tp.h, 8);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#ffffff';
        ctx.font = '900 13px "Outfit", sans-serif';
        ctx.fillText('▲ BOOST ▲', tp.x + tp.w / 2, tp.y + tp.h / 2 + 5);
      });

      // Sliding Bumper Pistons
      slidingBumpers.forEach((sb) => {
        ctx.fillStyle = '#e11d48';
        ctx.shadowColor = '#f43f5e';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.roundRect(sb.x, sb.y, sb.w, sb.h, 6);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Bumper warning stripes
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 10px monospace';
        ctx.fillText('⚡ BUMPER ⚡', sb.x + sb.w / 2, sb.y + sb.h / 2 + 3);
      });

      // Rotating Windmill Hammers
      rotatingHammers.forEach((rh) => {
        // Center hub
        ctx.fillStyle = '#334155';
        ctx.beginPath();
        ctx.arc(rh.x, rh.y, 18, 0, Math.PI * 2);
        ctx.fill();

        // 4 Spinning arms
        for (let a = 0; a < 4; a++) {
          const armAngle = rh.angle + (a * Math.PI) / 2;
          const endX = rh.x + Math.cos(armAngle) * rh.radius;
          const endY = rh.y + Math.sin(armAngle) * rh.radius;

          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 10;
          ctx.beginPath();
          ctx.moveTo(rh.x, rh.y);
          ctx.lineTo(endX, endY);
          ctx.stroke();

          // Spiked hammer head
          ctx.fillStyle = '#dc2626';
          ctx.shadowColor = '#f43f5e';
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(endX, endY, 14, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      });

      // Grand Finish Arch at Y = 2000
      const FINISH_Y = 2000;
      for (let c = 0; c < 14; c++) {
        for (let r = 0; r < 3; r++) {
          ctx.fillStyle = (c + r) % 2 === 0 ? '#ffffff' : '#000000';
          ctx.fillRect(TRACK_LEFT + c * (TRACK_WIDTH / 14), FINISH_Y + r * 12, TRACK_WIDTH / 14, 12);
        }
      }
      ctx.fillStyle = '#fbbf24';
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 18;
      ctx.font = '900 24px "Outfit", sans-serif';
      ctx.fillText('🏁 FINISH ARCH 🏁', W / 2, FINISH_Y - 18);
      ctx.shadowBlur = 0;

      // 2. Render 2.5D Avatars (Play Store Stumble Challenge Style)
      const drawRunner = (
        r: { x: number; y: number; animPhase: number; stunTimer: number; boostTimer: number },
        color: string,
        glow: string,
        isPlayer: boolean,
        name: string
      ) => {
        ctx.save();
        ctx.translate(r.x, r.y);

        // Runner Drop Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.beginPath();
        ctx.ellipse(0, 10, 16, 7, 0, 0, Math.PI * 2);
        ctx.fill();

        // Stunned comic stars
        if (r.stunTimer > 0) {
          ctx.fillStyle = '#fbbf24';
          ctx.font = '14px sans-serif';
          ctx.fillText('⭐💫', -10, -28);
        }

        // Running Legs Animation (Alternating stride)
        const legSwing = Math.sin(r.animPhase) * 6;
        ctx.fillStyle = '#1e293b';
        // Left Foot
        ctx.beginPath();
        ctx.arc(-7, 8 + legSwing, 4.5, 0, Math.PI * 2);
        ctx.fill();
        // Right Foot
        ctx.beginPath();
        ctx.arc(7, 8 - legSwing, 4.5, 0, Math.PI * 2);
        ctx.fill();

        // Runner Body Torso
        ctx.fillStyle = color;
        ctx.shadowColor = glow;
        ctx.shadowBlur = r.boostTimer > 0 ? 18 : 8;
        ctx.beginPath();
        ctx.arc(0, 0, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Headband / Visor
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-10, -4, 20, 5);

        // Name Tag
        ctx.font = '900 11px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = isPlayer ? '#ffffff' : color;
        ctx.fillText(isPlayer ? '▼ YOU' : name.substring(0, 8), 0, -20);

        ctx.restore();
      };

      const p1R = runners.current[p1Uid];
      const p2R = runners.current[p2Uid];

      if (p1R) drawRunner(p1R, '#f59e0b', '#fbbf24', playerUid === p1Uid, p1Nickname);
      if (p2R) drawRunner(p2R, '#06b6d4', '#22d3ee', playerUid === p2Uid, p2Nickname);

      ctx.restore(); // Restore camera translation

      // 3. Render Virtual Touch Joystick on Screen
      if (touchJoystick.current.active) {
        const j = touchJoystick.current;
        // Base ring
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(j.startX, j.startY, 45, 0, Math.PI * 2);
        ctx.stroke();

        // Thumb stick
        const jx = j.currX - j.startX;
        const jy = j.currY - j.startY;
        const dist = Math.hypot(jx, jy);
        const stickX = dist > 45 ? j.startX + (jx / dist) * 45 : j.currX;
        const stickY = dist > 45 ? j.startY + (jy / dist) * 45 : j.currY;

        ctx.fillStyle = '#06b6d4';
        ctx.shadowColor = '#06b6d4';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(stickX, stickY, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // 4. Winner Celebration Banner
      const victor = winnerNameRef.current || winnerName;
      if (victor) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = '#fbbf24';
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 28;
        ctx.font = '900 46px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`🏆 ${victor.toUpperCase()}!`, W / 2, H / 2 - 20);
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#ffffff';
        ctx.font = '700 18px "Outfit", sans-serif';
        ctx.fillText('WINNER CROSSES FINISH LINE!', W / 2, H / 2 + 25);
      }

      ctx.restore();

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
  }, [p1Uid, p2Uid, isHost, isBotPlaying, p1Nickname, p2Nickname, onDispatchAction]);

  const p1Progress = Math.min(100, Math.round(((runners.current[p1Uid]?.y || 120) / 2000) * 100));
  const p2Progress = Math.min(100, Math.round(((runners.current[p2Uid]?.y || 120) / 2000) * 100));

  return (
    <div className="w-full max-w-lg mx-auto flex flex-col items-center select-none gap-2 px-2">
      {/* Top Scores Bar */}
      <div className="w-full flex items-center justify-between px-4 py-2 rounded-2xl bg-slate-900/90 border border-white/10 text-xs font-mono font-bold shadow-md">
        <span className="text-amber-400">
          {p1Nickname}: <span className="text-white text-sm font-black">{room.scores[p1Uid] || 0}</span>
        </span>
        <span className="text-slate-400 text-[11px] font-black flex items-center gap-1">
          <Trophy className="w-3.5 h-3.5 text-amber-400" />
          <span>FIRST TO {room.maxRounds || 3}</span>
        </span>
        <span className="text-cyan-400">
          {p2Nickname}: <span className="text-white text-sm font-black">{room.scores[p2Uid] || 0}</span>
        </span>
      </div>

      {/* Real-time Sprint Progress Tracker */}
      <div className="w-full p-2.5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-md">
        <div className="flex items-center justify-between text-xs font-mono font-bold mb-1">
          <span className="text-amber-400 font-black">{p1Nickname}: {p1Progress}%</span>
          <span className="text-slate-400">🏃 GAUNTLET RUN</span>
          <span className="text-cyan-400 font-black">{p2Nickname}: {p2Progress}%</span>
        </div>
        <div className="relative w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="absolute left-0 top-0 h-full bg-gradient-to-r from-amber-600 to-amber-300 transition-all duration-75"
            style={{ width: `${p1Progress}%` }}
          />
        </div>
        <div className="relative w-full h-2.5 bg-slate-800 rounded-full overflow-hidden mt-1">
          <div
            className="absolute left-0 top-0 h-full bg-gradient-to-r from-cyan-600 to-cyan-300 transition-all duration-75"
            style={{ width: `${p2Progress}%` }}
          />
        </div>
      </div>

      {/* Main 2.5D Obstacle Arena Canvas */}
      <div className="w-full aspect-[3/4] h-[52vh] min-h-[400px] max-h-[580px] rounded-3xl overflow-hidden shadow-2xl border-4 border-slate-800 relative bg-slate-950 cursor-pointer">
        <canvas
          ref={canvasRef}
          style={{ touchAction: 'none' }}
          className="w-full h-full block select-none"
        />
      </div>

      {/* Mobile Ergonomic Controls: Analog D-Pad & Dash */}
      <div className="w-full grid grid-cols-4 gap-2 max-w-sm pt-1">
        <button
          onPointerDown={(e) => { e.preventDefault(); mobileInput.current.left = true; }}
          onPointerUp={() => { mobileInput.current.left = false; }}
          onPointerLeave={() => { mobileInput.current.left = false; }}
          onPointerCancel={() => { mobileInput.current.left = false; }}
          className="h-13 rounded-2xl bg-slate-900 border-2 border-slate-700 active:bg-cyan-600/30 active:scale-95 text-slate-200 flex items-center justify-center shadow-lg touch-manipulation cursor-pointer"
        >
          <ChevronLeft className="w-6 h-6 text-cyan-400" />
        </button>

        <button
          onPointerDown={(e) => { e.preventDefault(); mobileInput.current.up = true; }}
          onPointerUp={() => { mobileInput.current.up = false; }}
          onPointerLeave={() => { mobileInput.current.up = false; }}
          onPointerCancel={() => { mobileInput.current.up = false; }}
          className="h-13 rounded-2xl bg-slate-900 border-2 border-slate-700 active:bg-cyan-600/30 active:scale-95 text-slate-200 flex items-center justify-center shadow-lg touch-manipulation cursor-pointer"
        >
          <ArrowUp className="w-6 h-6 text-cyan-400" />
        </button>

        <button
          onPointerDown={(e) => { e.preventDefault(); mobileInput.current.right = true; }}
          onPointerUp={() => { mobileInput.current.right = false; }}
          onPointerLeave={() => { mobileInput.current.right = false; }}
          onPointerCancel={() => { mobileInput.current.right = false; }}
          className="h-13 rounded-2xl bg-slate-900 border-2 border-slate-700 active:bg-cyan-600/30 active:scale-95 text-slate-200 flex items-center justify-center shadow-lg touch-manipulation cursor-pointer"
        >
          <ChevronRight className="w-6 h-6 text-cyan-400" />
        </button>

        {/* DASH BUTTON */}
        <button
          onPointerDown={(e) => { e.preventDefault(); handleTriggerDash(); }}
          disabled={!dashReady}
          className={`h-13 rounded-2xl border-2 flex items-center justify-center gap-1 font-mono font-black text-xs shadow-xl active:scale-95 transition touch-manipulation cursor-pointer ${
            dashReady
              ? 'bg-gradient-to-r from-amber-500 to-orange-500 border-amber-300 text-slate-950 shadow-amber-500/30'
              : 'bg-slate-800 border-slate-700 text-slate-500'
          }`}
        >
          <Zap className="w-4 h-4 fill-current" />
          <span>{dashReady ? 'DASH' : `${dashCooldownPct}%`}</span>
        </button>
      </div>

      <p className="text-[11px] text-slate-400 font-mono text-center">
        👆 Drag finger anywhere on screen to steer in 360° • Tap DASH or Spacebar to burst forward!
      </p>
    </div>
  );
};
