import React, { useEffect, useRef, useState } from 'react';
import type { AuthoritativeRoomState } from '../../types/room';
import { GameLoop } from '../../engine/core/GameLoop';
import { CanvasManager } from '../../engine/core/CanvasManager';
import { JuiceEngine } from '../../engine/core/JuiceEngine';
import { soundService } from '../../services/sound';
import { Zap, ChevronLeft, ChevronRight, ArrowUp, Trophy, Flag, Sparkles } from 'lucide-react';

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

  // Jump and Dash States
  const [isJumpingState, setIsJumpingState] = useState<boolean>(false);
  const [dashReady, setDashReady] = useState<boolean>(true);

  // Track Dimensions
  const W = 460;
  const H = 640;
  const TRACK_LEFT = 35;
  const TRACK_RIGHT = 425;
  const TRACK_WIDTH = TRACK_RIGHT - TRACK_LEFT;

  // Track coordinates: Runners start at START_Y = 1750 and run UPWARDS to FINISH_Y = 140
  const START_Y = 1750;
  const FINISH_Y = 140;
  const TOTAL_DISTANCE = START_Y - FINISH_Y;

  // Runners state
  const runners = useRef<{
    [uid: string]: {
      x: number;
      y: number;
      z: number;
      vx: number;
      vy: number;
      jumpTimer: number;
      isJumping: boolean;
      dashTimer: number;
      stunTimer: number;
      boostTimer: number;
      animPhase: number;
    };
  }>({});

  const remoteRunners = useRef<{
    [uid: string]: { x: number; y: number; z: number; isJumping: boolean; animPhase: number };
  }>({});

  const keysDown = useRef<{ [key: string]: boolean }>({});
  const mobileInput = useRef({ left: false, right: false, up: false, down: false });
  const touchSteer = useRef<{ active: boolean; startX: number; currX: number; startY: number; currY: number }>({
    active: false,
    startX: 0,
    currX: 0,
    startY: 0,
    currY: 0
  });

  const lastNetworkDispatch = useRef<number>(0);

  // Keyboard controls
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
      if (k === 'shift' || k === 'e') {
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

  // Sync remote runners in 2P multiplayer
  useEffect(() => {
    if (!isBotPlaying && room.gameState?.runners) {
      const oppUid = p1Uid === playerUid ? p2Uid : p1Uid;
      const remote = room.gameState.runners[oppUid];
      if (remote) {
        remoteRunners.current[oppUid] = remote;
      }
    }
  }, [room.gameState?.runners, isBotPlaying, p1Uid, p2Uid, playerUid]);

  // Reset race on round change
  const resetRace = () => {
    runners.current = {
      [p1Uid]: { x: 160, y: START_Y, z: 0, vx: 0, vy: 0, jumpTimer: 0, isJumping: false, dashTimer: 0, stunTimer: 0, boostTimer: 0, animPhase: 0 },
      [p2Uid]: { x: 300, y: START_Y, z: 0, vx: 0, vy: 0, jumpTimer: 0, isJumping: false, dashTimer: 0, stunTimer: 0, boostTimer: 0, animPhase: 0 }
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
    me.jumpTimer = 0.55;
    setIsJumpingState(true);
    soundService.playCountdown(1);
    if (navigator.vibrate) navigator.vibrate(25);
  };

  const triggerDash = () => {
    if (!dashReady || finishDispatched.current) return;
    const me = runners.current[playerUid];
    if (!me || me.stunTimer > 0) return;

    setDashReady(false);
    me.dashTimer = 0.38;
    soundService.playScore();
    if (navigator.vibrate) navigator.vibrate(35);

    setTimeout(() => {
      setDashReady(true);
    }, 2000);
  };

  // Main 60 FPS Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasMgr = new CanvasManager(canvas);
    const juice = new JuiceEngine(400);

    // Course Hazards Configuration
    const turboPads = [
      { x: 130, y: 1530, w: 75, h: 48 },
      { x: 265, y: 940, w: 75, h: 48 },
      { x: 195, y: 450, w: 75, h: 48 }
    ];

    const rotatingHammers = [
      { y: 1370, x: 230, radius: 105, angle: 0, speed: 2.6 },
      { y: 810, x: 230, radius: 110, angle: Math.PI / 4, speed: -2.8 },
      { y: 360, x: 230, radius: 105, angle: Math.PI / 2, speed: 2.7 }
    ];

    const mudZones = [
      { x: 65, y: 1150, w: 330, h: 95 },
      { x: 65, y: 590, w: 330, h: 95 }
    ];

    const slidingBumpers = [
      { y: 990, w: 150, h: 28, x: 80, minX: 45, maxX: 265, dir: 1, speed: 180 },
      { y: 470, w: 150, h: 28, x: 235, minX: 45, maxX: 265, dir: -1, speed: 190 }
    ];

    // Dynamic Touch Dragging on canvas
    const handlePointerDown = (e: PointerEvent) => {
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch {}
      const rect = canvas.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * W;
      const py = ((e.clientY - rect.top) / rect.height) * H;

      // Bottom-right tap triggers Jump
      if (px > W * 0.72) {
        triggerJump();
        return;
      }

      touchSteer.current = {
        active: true,
        startX: px,
        currX: px,
        startY: py,
        currY: py
      };
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!touchSteer.current.active) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      touchSteer.current.currX = ((e.clientX - rect.left) / rect.width) * W;
      touchSteer.current.currY = ((e.clientY - rect.top) / rect.height) * H;
    };

    const handlePointerUp = () => {
      touchSteer.current.active = false;
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);

    const update = (dt: number) => {
      juice.update(dt);
      const now = Date.now();

      // Update Hazards
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

      // Update Player Runner Movement
      const me = runners.current[playerUid];
      if (me) {
        // Jump Arc Handling
        if (me.isJumping) {
          me.jumpTimer -= dt;
          if (me.jumpTimer <= 0) {
            me.isJumping = false;
            me.jumpTimer = 0;
            me.z = 0;
            setIsJumpingState(false);
            juice.emitSparks(me.x, me.y, 8, '#cbd5e1', '#94a3b8', 2.5);
          } else {
            const progress = (0.55 - me.jumpTimer) / 0.55;
            me.z = Math.sin(progress * Math.PI) * 38; // Jumps high in 3D!
          }
        }

        if (me.stunTimer > 0) {
          me.stunTimer -= dt;
          me.vx *= 0.88;
          me.vy *= 0.88;
        } else {
          // Steering input
          let steerX = 0;

          if (touchSteer.current.active) {
            const dx = touchSteer.current.currX - touchSteer.current.startX;
            if (Math.abs(dx) > 6) {
              steerX = Math.max(-1, Math.min(1, dx / 35));
            }
          }

          const isLeft = keysDown.current['arrowleft'] || keysDown.current['a'] || mobileInput.current.left;
          const isRight = keysDown.current['arrowright'] || keysDown.current['d'] || mobileInput.current.right;
          const isUp = keysDown.current['arrowup'] || keysDown.current['w'] || mobileInput.current.up;
          const isDown = keysDown.current['arrowdown'] || keysDown.current['s'] || mobileInput.current.down;

          if (isLeft) steerX = -1;
          if (isRight) steerX = 1;

          // Forward running speed (UPWARDS into screen: vy is negative!)
          let forwardSpeed = 185;
          if (isUp) forwardSpeed = 235;
          if (isDown) forwardSpeed = 100;

          if (me.dashTimer > 0) {
            me.dashTimer -= dt;
            forwardSpeed = 380; // Dash burst!
          }
          if (me.boostTimer > 0) {
            me.boostTimer -= dt;
            forwardSpeed = 350; // Turbo pad!
          }

          // Check Mud Zone (only slows if grounded; jumping flies OVER mud with zero slowdown!)
          if (!me.isJumping) {
            for (const m of mudZones) {
              if (me.x >= m.x && me.x <= m.x + m.w && me.y >= m.y && me.y <= m.y + m.h) {
                forwardSpeed *= 0.42;
                break;
              }
            }
          }

          me.vx = steerX * 250;
          me.vy = -forwardSpeed;

          if (forwardSpeed > 0) {
            me.animPhase += dt * 14;
          }
        }

        me.x = Math.max(TRACK_LEFT + 18, Math.min(TRACK_RIGHT - 18, me.x + me.vx * dt));
        me.y += me.vy * dt;

        // Check Turbo Boost Pads (low altitude)
        if (me.z < 15) {
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
                juice.addTrauma(0.18);
                juice.emitSparks(me.x, me.y, 16, '#10b981', '#34d399', 4.5);
              }
            }
          }
        }

        // Check Rotating Spiked Sweepers (jumping clears sweeper arm!)
        if (me.z < 26) {
          for (const rh of rotatingHammers) {
            for (let a = 0; a < 4; a++) {
              const armAngle = rh.angle + (a * Math.PI) / 2;
              const hx = rh.x + Math.cos(armAngle) * rh.radius * 0.72;
              const hy = rh.y + Math.sin(armAngle) * rh.radius * 0.72;
              const dist = Math.hypot(me.x - hx, me.y - hy);

              if (dist < 26 && me.stunTimer <= 0) {
                me.stunTimer = 0.55;
                me.vx = Math.cos(armAngle) * 250;
                me.vy = 180; // Knocks runner backwards!
                soundService.playImpact(1.3);
                juice.addTrauma(0.45);
                juice.emitExplosion(me.x, me.y, 25);
                break;
              }
            }
          }
        }

        // Check Sliding Bumpers (jumping clears bumper!)
        if (me.z < 20) {
          for (const sb of slidingBumpers) {
            if (
              me.x >= sb.x - 12 &&
              me.x <= sb.x + sb.w + 12 &&
              me.y >= sb.y - 12 &&
              me.y <= sb.y + sb.h + 12 &&
              me.stunTimer <= 0
            ) {
              me.stunTimer = 0.45;
              me.vx = sb.dir * 230;
              me.vy = 160;
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

      // CyberBot AI Runner: Competes naturally and runs UPWARDS
      const bot = runners.current[p2Uid];
      if (bot && isBotPlaying) {
        if (bot.isJumping) {
          bot.jumpTimer -= dt;
          if (bot.jumpTimer <= 0) {
            bot.isJumping = false;
            bot.jumpTimer = 0;
            bot.z = 0;
          } else {
            const progress = (0.55 - bot.jumpTimer) / 0.55;
            bot.z = Math.sin(progress * Math.PI) * 38;
          }
        }

        if (bot.stunTimer > 0) {
          bot.stunTimer -= dt;
          bot.vx *= 0.88;
          bot.vy *= 0.88;
        } else {
          let botSpeed = 186; // Competitive human-matched pace

          if (bot.boostTimer > 0) {
            bot.boostTimer -= dt;
            botSpeed = 350;
          }

          // Bot target: seek upcoming turbo pads
          let targetX = 230;
          const nextPad = turboPads.find((tp) => tp.y < bot.y && tp.y > bot.y - 240);
          if (nextPad) targetX = nextPad.x + nextPad.w / 2;

          // Bot jumps over mud
          const upcomingMud = mudZones.find((m) => bot.y <= m.y + m.h + 25 && bot.y >= m.y);
          if (upcomingMud && !bot.isJumping && Math.random() < 0.8) {
            bot.isJumping = true;
            bot.jumpTimer = 0.55;
          }

          // Bot avoids rotating hammers
          const nearHammer = rotatingHammers.find((rh) => Math.abs(rh.y - bot.y) < 100);
          if (nearHammer) {
            targetX = bot.x > 230 ? TRACK_RIGHT - 35 : TRACK_LEFT + 35;
          }

          bot.x += (targetX - bot.x) * 0.1;
          bot.x = Math.max(TRACK_LEFT + 18, Math.min(TRACK_RIGHT - 18, bot.x));
          bot.y -= botSpeed * dt;
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

      // Finish Line Cross Check (Y <= FINISH_Y)
      for (const [uid, runner] of Object.entries(runners.current)) {
        if (runner.y <= FINISH_Y && !finishDispatched.current) {
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

      // Camera smoothly tracks player Y position forward (looking UPWARDS ahead)
      const me = runners.current[playerUid] || { x: 230, y: START_Y };
      const camY = Math.max(0, Math.min(START_Y - H + 120, me.y - H * 0.7));

      ctx.save();
      ctx.translate(0, -camY);

      // 1. Deep Space Neon Arena Backdrop (Like Tank Duel)
      const floorGrad = ctx.createLinearGradient(0, 0, 0, START_Y + 250);
      floorGrad.addColorStop(0, '#020617');
      floorGrad.addColorStop(0.5, '#090d16');
      floorGrad.addColorStop(1, '#03050a');
      ctx.fillStyle = floorGrad;
      ctx.fillRect(0, 0, W, START_Y + 250);

      // Floating Neon Cyber Grid
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.08)';
      ctx.lineWidth = 1;
      for (let x = 32; x < W; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, START_Y + 200);
        ctx.stroke();
      }
      for (let y = 32; y < START_Y + 200; y += 32) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      // Asphalt Track Platform with Bevel
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(TRACK_LEFT, 50, TRACK_WIDTH, START_Y + 100);

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

      // Dashed Center Lane Divider
      ctx.setLineDash([16, 12]);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(W / 2, 50);
      ctx.lineTo(W / 2, START_Y + 150);
      ctx.stroke();
      ctx.setLineDash([]);

      // Start Line Chequered Platform (Y = START_Y)
      for (let c = 0; c < 10; c++) {
        for (let r = 0; r < 2; r++) {
          ctx.fillStyle = (c + r) % 2 === 0 ? '#ffffff' : '#020617';
          ctx.fillRect(TRACK_LEFT + c * (TRACK_WIDTH / 10), START_Y + 20 + r * 10, TRACK_WIDTH / 10, 10);
        }
      }
      ctx.fillStyle = '#38bdf8';
      ctx.font = '900 12px "Outfit", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⚡ START LINE (SPRINT UPWARDS) ⚡', W / 2, START_Y + 55);

      // 2. Mud Slime Zones
      for (const m of mudZones) {
        // Drop shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(m.x, m.y + 4, m.w, m.h);

        // Toxic purple sludge
        ctx.fillStyle = 'rgba(112, 26, 117, 0.85)';
        ctx.beginPath();
        ctx.roundRect(m.x, m.y, m.w, m.h, 12);
        ctx.fill();

        ctx.strokeStyle = '#e879f9';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#fae8ff';
        ctx.font = '900 11px "Outfit", sans-serif';
        ctx.fillText('⚠️ TOXIC SLIME (JUMP TO CLEAR!)', W / 2, m.y + m.h / 2 + 4);
      }

      // 3. Turbo Boost Arrow Pads (Pointing UPWARDS!)
      for (const tp of turboPads) {
        ctx.fillStyle = 'rgba(16, 185, 129, 0.25)';
        ctx.beginPath();
        ctx.roundRect(tp.x, tp.y, tp.w, tp.h, 8);
        ctx.fill();

        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Glowing Chevron Arrows pointing UP
        ctx.fillStyle = '#34d399';
        ctx.beginPath();
        ctx.moveTo(tp.x + tp.w / 2, tp.y + 8);
        ctx.lineTo(tp.x + tp.w - 14, tp.y + tp.h - 10);
        ctx.lineTo(tp.x + 14, tp.y + tp.h - 10);
        ctx.closePath();
        ctx.fill();
      }

      // 4. Sliding Bumpers (Metallic Piston Bars with Bevel)
      for (const sb of slidingBumpers) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.beginPath();
        ctx.roundRect(sb.x, sb.y + 4, sb.w, sb.h, 6);
        ctx.fill();

        ctx.fillStyle = '#e11d48';
        ctx.beginPath();
        ctx.roundRect(sb.x, sb.y, sb.w, sb.h, 6);
        ctx.fill();

        // Warning Stripes
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
        ctx.stroke();
      }

      // 5. Rotating Spiked Sweepers (High-Tech 4-Arm Sweeper)
      for (const rh of rotatingHammers) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.beginPath();
        ctx.arc(rh.x, rh.y + 6, 20, 0, Math.PI * 2);
        ctx.fill();

        for (let a = 0; a < 4; a++) {
          const armAngle = rh.angle + (a * Math.PI) / 2;
          const hx = rh.x + Math.cos(armAngle) * rh.radius * 0.72;
          const hy = rh.y + Math.sin(armAngle) * rh.radius * 0.72;

          // Metal arm
          ctx.strokeStyle = '#475569';
          ctx.lineWidth = 8;
          ctx.beginPath();
          ctx.moveTo(rh.x, rh.y);
          ctx.lineTo(hx, hy);
          ctx.stroke();

          // Spiked Head
          ctx.fillStyle = '#f59e0b';
          ctx.beginPath();
          ctx.arc(hx, hy, 15, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.stroke();

          // Neon Spike Tip
          const tipX = hx + Math.cos(armAngle) * 11;
          const tipY = hy + Math.sin(armAngle) * 11;
          ctx.fillStyle = '#dc2626';
          ctx.beginPath();
          ctx.arc(tipX, tipY, 4.5, 0, Math.PI * 2);
          ctx.fill();
        }

        // Center Rotating Hub
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(rh.x, rh.y, 18, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      // 6. Finish Archway (Y = FINISH_Y)
      for (let c = 0; c < 12; c++) {
        for (let r = 0; r < 3; r++) {
          ctx.fillStyle = (c + r) % 2 === 0 ? '#ffffff' : '#000000';
          ctx.fillRect(TRACK_LEFT + c * (TRACK_WIDTH / 12), FINISH_Y + r * 10, TRACK_WIDTH / 12, 10);
        }
      }

      // Finish Pillars
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(TRACK_LEFT - 10, FINISH_Y - 25, 14, 65);
      ctx.fillRect(TRACK_RIGHT - 4, FINISH_Y - 25, 14, 65);

      ctx.fillStyle = '#fbbf24';
      ctx.font = '900 16px "Outfit", sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 18;
      ctx.fillText('🏁 FINISH ARCH 🏁', W / 2, FINISH_Y - 12);
      ctx.shadowBlur = 0;

      // 7. Render Stylized 2.5D Brawler Runners (Like Fall Guys / Stumble Guys!)
      for (const [uid, runner] of Object.entries(runners.current)) {
        const isMe = uid === playerUid;
        // Amber Gold for Player 1, Cyber Cyan for Player 2/Bot (Matches Tank Duel!)
        const mainColor = isMe ? '#f59e0b' : '#06b6d4';
        const visorColor = isMe ? '#fbbf24' : '#22d3ee';
        const z = runner.z || 0;

        ctx.save();
        ctx.translate(runner.x, runner.y);

        // Dynamic Ground Drop Shadow (Contracts as runner leaps)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.beginPath();
        ctx.ellipse(0, 8, Math.max(6, 18 - z * 0.25), Math.max(3, 9 - z * 0.15), 0, 0, Math.PI * 2);
        ctx.fill();

        // Stun Stars if hit
        if (runner.stunTimer > 0) {
          ctx.fillStyle = '#facc15';
          const animTime = Date.now();
          for (let s = 0; s < 3; s++) {
            const starAngle = animTime * 0.01 + (s * Math.PI * 2) / 3;
            ctx.fillText('⭐', Math.cos(starAngle) * 20, -32 + Math.sin(starAngle) * 8);
          }
        }

        // Lift runner by vertical jump height z
        ctx.translate(0, -z);

        // Turbo Speed Streaks
        if (runner.boostTimer > 0 || runner.dashTimer > 0) {
          ctx.fillStyle = 'rgba(16, 185, 129, 0.85)';
          ctx.beginPath();
          ctx.arc(0, 20, 14, 0, Math.PI * 2);
          ctx.fill();
        }

        // Animated Running Feet (Juicy step animation)
        const footSwing = Math.sin(runner.animPhase) * 8;
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.roundRect(-10, 8 + footSwing, 7, 10, 3);
        ctx.roundRect(3, 8 - footSwing, 7, 10, 3);
        ctx.fill();

        // 3D Spherical Capsule Brawler Body
        const bodyGrad = ctx.createRadialGradient(-3, -4, 2, 0, 0, 18);
        bodyGrad.addColorStop(0, '#ffffff');
        bodyGrad.addColorStop(0.35, mainColor);
        bodyGrad.addColorStop(1, isMe ? '#b45309' : '#0e7490');
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.roundRect(-14, -14, 28, 26, 12);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
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

        // Player Name Label
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 10px "Outfit", sans-serif';
        ctx.fillText(isMe ? 'YOU' : uid === p1Uid ? p1Nickname.substring(0, 8) : p2Nickname.substring(0, 8), 0, -22);

        ctx.restore();
      }

      ctx.restore();
      ctx.restore();

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
  const myPct = myRunner ? Math.max(0, Math.min(100, Math.round(((START_Y - myRunner.y) / TOTAL_DISTANCE) * 100))) : 0;
  const oppRunner = runners.current[p1Uid === playerUid ? p2Uid : p1Uid];
  const oppPct = oppRunner ? Math.max(0, Math.min(100, Math.round(((START_Y - oppRunner.y) / TOTAL_DISTANCE) * 100))) : 0;

  return (
    <div className="w-full max-w-md mx-auto flex flex-col items-center select-none gap-2 px-1">
      {/* Live Distance Race Tracker Bar */}
      <div className="w-full flex flex-col gap-1.5 px-3 py-2 rounded-2xl bg-slate-900/90 border border-white/10 shadow-md">
        <div className="flex items-center justify-between text-xs font-mono font-bold">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-amber-300 font-['Outfit'] font-black">{p1Nickname} (YOU)</span>
            <span className="text-amber-400 font-black">{myPct}%</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-cyan-400 font-black">{oppPct}%</span>
            <span className="text-cyan-300 font-['Outfit'] font-black">{p2Nickname}</span>
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
          </div>
        </div>

        {/* Live Race Distance Progress Bar with Runner Icons */}
        <div className="w-full h-3 rounded-full bg-slate-950 border border-slate-700 relative overflow-hidden flex items-center">
          <div
            className="absolute top-0 bottom-0 left-0 bg-amber-500/30 rounded-full transition-all duration-75"
            style={{ width: `${myPct}%` }}
          />
          {/* My Runner Dot */}
          <div
            className="absolute w-3.5 h-3.5 rounded-full bg-amber-400 border border-white shadow-[0_0_8px_#f59e0b] transition-all duration-75 -ml-1.5"
            style={{ left: `${myPct}%` }}
          />
          {/* Opponent Runner Dot */}
          <div
            className="absolute w-3.5 h-3.5 rounded-full bg-cyan-400 border border-white shadow-[0_0_8px_#06b6d4] transition-all duration-75 -ml-1.5"
            style={{ left: `${oppPct}%` }}
          />
          <Flag className="w-3 h-3 text-amber-400 absolute right-1 pointer-events-none" />
        </div>
      </div>

      {/* Canvas Gauntlet Stage - Running UPWARDS toward Finish Arch */}
      <div className="w-full h-[52vh] min-h-[340px] max-h-[500px] aspect-[460/640] rounded-3xl overflow-hidden shadow-2xl border-4 border-slate-800 relative bg-[#020617] cursor-pointer">
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

      {/* Modern Tactical Controls: Steer + Dash + Jump */}
      <div className="w-full grid grid-cols-4 gap-2 max-w-sm pt-0.5">
        <button
          onPointerDown={(e) => { e.preventDefault(); mobileInput.current.left = true; }}
          onPointerUp={() => { mobileInput.current.left = false; }}
          onPointerLeave={() => { mobileInput.current.left = false; }}
          onPointerCancel={() => { mobileInput.current.left = false; }}
          className="h-11 rounded-xl bg-slate-900 border-2 border-slate-700 active:bg-cyan-600/30 active:scale-95 text-xs font-black font-mono text-slate-300 flex items-center justify-center gap-1 shadow-md touch-manipulation cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4 text-cyan-400" />
          <span>LEFT</span>
        </button>

        <button
          onClick={triggerDash}
          disabled={!dashReady}
          className={`h-11 rounded-xl border text-xs font-black font-mono flex items-center justify-center gap-1 shadow-md active:scale-95 transition touch-manipulation cursor-pointer ${
            dashReady
              ? 'bg-emerald-600/30 border-emerald-500/60 text-emerald-300 hover:bg-emerald-600/50'
              : 'bg-slate-900 border-slate-800 text-slate-500 opacity-50'
          }`}
        >
          <Zap className="w-3.5 h-3.5 text-emerald-400 fill-current" />
          <span>DASH</span>
        </button>

        <button
          onClick={triggerJump}
          className={`h-11 rounded-xl border-2 font-mono font-black text-xs flex items-center justify-center gap-1 shadow-lg active:scale-95 transition touch-manipulation cursor-pointer ${
            isJumpingState
              ? 'bg-amber-500/30 border-amber-400 text-amber-300'
              : 'bg-gradient-to-r from-amber-600 to-yellow-500 border-amber-400 text-slate-950 font-black'
          }`}
        >
          <ArrowUp className="w-4 h-4 stroke-[3]" />
          <span>JUMP</span>
        </button>

        <button
          onPointerDown={(e) => { e.preventDefault(); mobileInput.current.right = true; }}
          onPointerUp={() => { mobileInput.current.right = false; }}
          onPointerLeave={() => { mobileInput.current.right = false; }}
          onPointerCancel={() => { mobileInput.current.right = false; }}
          className="h-11 rounded-xl bg-slate-900 border-2 border-slate-700 active:bg-cyan-600/30 active:scale-95 text-xs font-black font-mono text-slate-300 flex items-center justify-center gap-1 shadow-md touch-manipulation cursor-pointer"
        >
          <span>RIGHT</span>
          <ChevronRight className="w-4 h-4 text-cyan-400" />
        </button>
      </div>

      <p className="text-[10px] text-slate-400 font-mono text-center">
        🕹️ Drag or tap to steer • ⬆ JUMP clears mud & spikes • ⚡ DASH for speed burst!
      </p>
    </div>
  );
};
