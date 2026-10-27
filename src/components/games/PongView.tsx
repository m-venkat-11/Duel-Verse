import React, { useEffect, useRef, useState } from 'react';
import type { PongState } from '../../types/game';
import type { AuthoritativeRoomState } from '../../types/room';
import { GameLoop } from '../../engine/core/GameLoop';
import { CanvasManager } from '../../engine/core/CanvasManager';
import { JuiceEngine } from '../../engine/core/JuiceEngine';
import { InputManager } from '../../engine/core/InputManager';
import { soundService } from '../../services/sound';

interface PongViewProps {
  room: AuthoritativeRoomState<PongState>;
  playerUid: string;
  onDispatchAction: (type: string, payload: any) => void;
}

export const PongView: React.FC<PongViewProps> = ({
  room,
  playerUid,
  onDispatchAction
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const gameState = room.gameState;
  const isHost = room.hostUid === playerUid;
  const players = Object.keys(room.players);
  const bottomUid = players[0] || 'p1';
  const topUid = players[1] || 'p2';
  const isBottomPlayer = bottomUid === playerUid;
  const isBotPlaying = Boolean(room.players['bot_rival']);

  const p1Nickname = room.players[bottomUid]?.nickname || 'Player 1';
  const p2Nickname = room.players[topUid]?.nickname || 'Player 2';
  const p1Score = room.scores[bottomUid] || 0;
  const p2Score = room.scores[topUid] || 0;

  const [lastScorerName, setLastScorerName] = useState<string | null>(null);

  // References for game loop state
  const stateRef = useRef(gameState);
  stateRef.current = gameState;
  const scoresRef = useRef({ p1Score, p2Score });
  scoresRef.current = { p1Score, p2Score };

  const pointerXPercentRef = useRef<number | null>(null);
  const keysDown = useRef<{ [key: string]: boolean }>({});
  const mobileSteer = useRef<{ left: boolean; right: boolean }>({ left: false, right: false });

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysDown.current[e.key.toLowerCase()] = true;
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
    const juice = new JuiceEngine(350);
    const input = new InputManager();
    input.attach(canvas);

    // Direct pointer tracking (no click-down required on desktop!)
    const handleDirectPointer = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const rawPercent = ((e.clientX - rect.left) / rect.width) * 100;
      pointerXPercentRef.current = Math.max(14, Math.min(86, rawPercent));
    };

    canvas.addEventListener('pointermove', handleDirectPointer);
    canvas.addEventListener('pointerdown', handleDirectPointer);

    // Pre-allocated circular puck trail
    const TRAIL_LENGTH = 14;
    const trail: Array<{ x: number; y: number; alpha: number }> = [];
    for (let i = 0; i < TRAIL_LENGTH; i++) {
      trail.push({ x: 50, y: 50, alpha: 0 });
    }
    let trailIdx = 0;

    // Local physics simulation state
    const sim = {
      puckX: 50,
      puckY: 50,
      prevPuckX: 50,
      prevPuckY: 50,
      vx: (Math.random() > 0.5 ? 1 : -1) * 0.45,
      vy: 0.45,
      speed: 1.0,
      paddles: {
        [bottomUid]: 50,
        [topUid]: 50
      },
      prevPaddles: {
        [bottomUid]: 50,
        [topUid]: 50
      },
      isGoalScored: false,
      goalPauseTimer: 0,
      lastPaddleDispatchTime: 0
    };

    let staticCourt: HTMLCanvasElement | null = null;
    const renderStaticCourt = () => {
      const W = canvasMgr.width;
      const H = canvasMgr.height;
      staticCourt = canvasMgr.createStaticSurface(W, H, (offCtx) => {
        // Deep air hockey table acrylic surface
        const bgGrad = offCtx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, Math.max(W, H) * 0.75);
        bgGrad.addColorStop(0, '#0c1630');
        bgGrad.addColorStop(0.7, '#080d1d');
        bgGrad.addColorStop(1, '#03060d');
        offCtx.fillStyle = bgGrad;
        offCtx.fillRect(0, 0, W, H);

        // Ambient cyber air hockey air holes pattern
        offCtx.fillStyle = 'rgba(6, 182, 212, 0.03)';
        for (let x = 16; x < W; x += 24) {
          for (let y = 16; y < H; y += 24) {
            offCtx.beginPath();
            offCtx.arc(x, y, 1.2, 0, Math.PI * 2);
            offCtx.fill();
          }
        }

        // Center line & face-off ring
        offCtx.setLineDash([12, 8]);
        offCtx.strokeStyle = 'rgba(139, 92, 246, 0.4)';
        offCtx.lineWidth = 3;
        offCtx.beginPath();
        offCtx.moveTo(0, H / 2);
        offCtx.lineTo(W, H / 2);
        offCtx.stroke();
        offCtx.setLineDash([]);

        // Center face-off circle
        offCtx.strokeStyle = 'rgba(6, 182, 212, 0.35)';
        offCtx.lineWidth = 3;
        offCtx.beginPath();
        offCtx.arc(W / 2, H / 2, 60, 0, Math.PI * 2);
        offCtx.stroke();

        // Center dot
        offCtx.fillStyle = '#06b6d4';
        offCtx.beginPath();
        offCtx.arc(W / 2, H / 2, 6, 0, Math.PI * 2);
        offCtx.fill();

        // Goal Defense Arc - Top
        offCtx.strokeStyle = 'rgba(244, 63, 94, 0.3)';
        offCtx.lineWidth = 2;
        offCtx.beginPath();
        offCtx.arc(W / 2, 0, W * 0.32, 0, Math.PI);
        offCtx.stroke();

        // Goal Defense Arc - Bottom
        offCtx.strokeStyle = 'rgba(245, 158, 11, 0.3)';
        offCtx.lineWidth = 2;
        offCtx.beginPath();
        offCtx.arc(W / 2, H, W * 0.32, Math.PI, Math.PI * 2);
        offCtx.stroke();

        // Table Rail Borders (Heavy Arcade Edge Rails)
        const railGradient = offCtx.createLinearGradient(0, 0, W, 0);
        railGradient.addColorStop(0, '#1e293b');
        railGradient.addColorStop(0.5, '#334155');
        railGradient.addColorStop(1, '#1e293b');
        offCtx.strokeStyle = railGradient;
        offCtx.lineWidth = 8;
        offCtx.strokeRect(4, 4, W - 8, H - 8);

        // Inner glowing neon rim
        offCtx.strokeStyle = 'rgba(139, 92, 246, 0.5)';
        offCtx.lineWidth = 2;
        offCtx.strokeRect(8, 8, W - 16, H - 16);

        // Recessed Goal Openings
        const goalW = W * 0.46;
        const goalLeft = (W - goalW) / 2;
        // Top Goal Opening
        offCtx.fillStyle = '#f43f5e';
        offCtx.shadowColor = '#f43f5e';
        offCtx.shadowBlur = 15;
        offCtx.fillRect(goalLeft, 0, goalW, 6);
        // Bottom Goal Opening
        offCtx.fillStyle = '#f59e0b';
        offCtx.shadowColor = '#f59e0b';
        offCtx.shadowBlur = 15;
        offCtx.fillRect(goalLeft, H - 6, goalW, 6);
        offCtx.shadowBlur = 0;
      });
    };

    renderStaticCourt();

    const handleResize = () => {
      canvasMgr.resize();
      renderStaticCourt();
    };
    window.addEventListener('resize', handleResize);

    // ==========================================
    // FIXED TIMESTEP UPDATE (60 Hz)
    // ==========================================
    const update = (dt: number) => {
      input.update(dt);
      juice.update(dt);

      const W = canvasMgr.width;
      const H = canvasMgr.height;

      // Save previous coordinates for visual interpolation
      sim.prevPuckX = sim.puckX;
      sim.prevPuckY = sim.puckY;
      sim.prevPaddles[bottomUid] = sim.paddles[bottomUid];
      sim.prevPaddles[topUid] = sim.paddles[topUid];

      // 1. Goal Pause Countdown
      if (sim.isGoalScored) {
        sim.goalPauseTimer -= dt;
        if (sim.goalPauseTimer <= 0) {
          sim.isGoalScored = false;
          setLastScorerName(null);
          // Serve towards the player who was scored against
          sim.vx = (Math.random() > 0.5 ? 1 : -1) * (0.35 + Math.random() * 0.2);
          sim.vy = Math.random() > 0.5 ? 0.45 : -0.45;
          sim.speed = 1.0;
          soundService.playCountdown(0);
        }
        return;
      }

      if (juice.isHitStopped()) return;

      // 2. Local Player Mallet Control (Instant Pointer Hover + Keyboard + Touch Steering)
      const myUid = isBottomPlayer ? bottomUid : topUid;
      let targetPercent = sim.paddles[myUid];

      if (pointerXPercentRef.current !== null) {
        targetPercent = pointerXPercentRef.current;
      }

      const isKeyLeft = keysDown.current['a'] || keysDown.current['arrowleft'] || mobileSteer.current.left;
      const isKeyRight = keysDown.current['d'] || keysDown.current['arrowright'] || mobileSteer.current.right;

      if (isKeyLeft) {
        targetPercent = Math.max(14, sim.paddles[myUid] - 4.5);
        pointerXPercentRef.current = targetPercent;
      } else if (isKeyRight) {
        targetPercent = Math.min(86, sim.paddles[myUid] + 4.5);
        pointerXPercentRef.current = targetPercent;
      }

      // Snappy, agile mallet movement
      sim.paddles[myUid] += (targetPercent - sim.paddles[myUid]) * 0.65;

      // Throttle network dispatch to 30ms
      const now = Date.now();
      if (now - sim.lastPaddleDispatchTime > 30) {
        sim.lastPaddleDispatchTime = now;
        onDispatchAction('PONG_PADDLE', { xPos: sim.paddles[myUid] });
      }

      // 3. CyberBot Air Hockey AI (Smart Defensive & Striking Behavior)
      if (isHost && isBotPlaying) {
        const botUid = topUid;
        const currentBotX = sim.paddles[botUid];
        let targetBotX = 50;

        // If puck is on bot's half, track puck aggressively with predictive angle aiming
        if (sim.puckY <= 58) {
          // Track puck trajectory with slight lead
          const lead = sim.vy < 0 ? sim.vx * 6 : 0;
          targetBotX = Math.max(14, Math.min(86, sim.puckX + lead));
        } else {
          // Puck is on player's side: bot holds strategic position favoring puck's x
          targetBotX = 50 + (sim.puckX - 50) * 0.35;
        }

        // Smooth high-tier agile tracking (responsive esports-tier AI)
        const diff = targetBotX - currentBotX;
        const maxStep = 2.8; // High-tier competitive speed
        sim.paddles[botUid] += Math.max(-maxStep, Math.min(maxStep, diff * 0.45));
        sim.paddles[botUid] = Math.max(14, Math.min(86, sim.paddles[botUid]));
      } else if (!isBottomPlayer && stateRef.current.paddles[bottomUid] !== undefined) {
        sim.paddles[bottomUid] += (stateRef.current.paddles[bottomUid] - sim.paddles[bottomUid]) * 0.4;
      } else if (isBottomPlayer && stateRef.current.paddles[topUid] !== undefined) {
        sim.paddles[topUid] += (stateRef.current.paddles[topUid] - sim.paddles[topUid]) * 0.4;
      }

      // 4. Host Physics Simulation with Continuous Swept Sub-stepping
      if (isHost) {
        const SUB_STEPS = 4;
        const subDt = dt / SUB_STEPS;
        const malletRadius = 11; // % of court width

        for (let s = 0; s < SUB_STEPS; s++) {
          sim.puckX += sim.vx * sim.speed * subDt * 60 * 1.5;
          sim.puckY += sim.vy * sim.speed * subDt * 60 * 1.5;

          // Side Wall Collisions (Left & Right)
          if (sim.puckX <= 4) {
            sim.puckX = 4;
            sim.vx = Math.abs(sim.vx);
            juice.addTrauma(0.12);
            juice.emitSparks((sim.puckX / 100) * W, (sim.puckY / 100) * H, 8, '#06b6d4', '#22d3ee', 3);
            soundService.playImpact(0.8);
          } else if (sim.puckX >= 96) {
            sim.puckX = 96;
            sim.vx = -Math.abs(sim.vx);
            juice.addTrauma(0.12);
            juice.emitSparks((sim.puckX / 100) * W, (sim.puckY / 100) * H, 8, '#06b6d4', '#22d3ee', 3);
            soundService.playImpact(0.8);
          }

          // Bottom Mallet Collision (near Y = 88)
          const botPaddleX = sim.paddles[bottomUid];
          const distBot = Math.hypot(sim.puckX - botPaddleX, sim.puckY - 88);
          if (distBot <= malletRadius && sim.vy > 0) {
            sim.vy = -Math.abs(sim.vy);
            const offset = (sim.puckX - botPaddleX) / malletRadius;
            sim.vx = offset * 0.8;
            sim.speed = Math.min(2.5, sim.speed * 1.06);

            juice.addTrauma(0.28);
            juice.triggerHitStop(40);
            juice.emitSparks((sim.puckX / 100) * W, (sim.puckY / 100) * H, 16, '#f59e0b', '#fbbf24', 5);
            soundService.playImpact(1.4);
          }

          // Top Mallet Collision (near Y = 12)
          const topPaddleX = sim.paddles[topUid];
          const distTop = Math.hypot(sim.puckX - topPaddleX, sim.puckY - 12);
          if (distTop <= malletRadius && sim.vy < 0) {
            sim.vy = Math.abs(sim.vy);
            const offset = (sim.puckX - topPaddleX) / malletRadius;
            sim.vx = offset * 0.8;
            sim.speed = Math.min(2.5, sim.speed * 1.06);

            juice.addTrauma(0.28);
            juice.triggerHitStop(40);
            juice.emitSparks((sim.puckX / 100) * W, (sim.puckY / 100) * H, 16, '#f43f5e', '#fb7185', 5);
            soundService.playImpact(1.4);
          }

          // Goal Check - Top Missed (Bottom Scores)
          if (sim.puckY <= 1) {
            sim.isGoalScored = true;
            sim.goalPauseTimer = 2.0;
            sim.puckX = 50;
            sim.puckY = 50;
            sim.vx = 0;
            sim.vy = 0;
            setLastScorerName(p1Nickname);

            juice.addTrauma(0.65);
            juice.emitExplosion((sim.puckX / 100) * W, 20, 50);
            soundService.playGoal();
            onDispatchAction('PONG_GOAL', { scorerUid: bottomUid });
            break;
          }

          // Goal Check - Bottom Missed (Top Scores)
          if (sim.puckY >= 99) {
            sim.isGoalScored = true;
            sim.goalPauseTimer = 2.0;
            sim.puckX = 50;
            sim.puckY = 50;
            sim.vx = 0;
            sim.vy = 0;
            setLastScorerName(p2Nickname);

            juice.addTrauma(0.65);
            juice.emitExplosion((sim.puckX / 100) * W, H - 20, 50);
            soundService.playGoal();
            onDispatchAction('PONG_GOAL', { scorerUid: topUid });
            break;
          }
        }
      }

      // Update Puck Trail
      trail[trailIdx] = {
        x: (sim.puckX / 100) * W,
        y: (sim.puckY / 100) * H,
        alpha: 0.95
      };
      trailIdx = (trailIdx + 1) % TRAIL_LENGTH;
      for (let i = 0; i < TRAIL_LENGTH; i++) {
        trail[i].alpha = Math.max(0, trail[i].alpha - 0.07);
      }
    };

    // ==========================================
    // VARIABLE RATE RENDER (Interpolated)
    // ==========================================
    const render = (alpha: number) => {
      const ctx = canvasMgr.ctx;
      const W = canvasMgr.width;
      const H = canvasMgr.height;

      // Apply screen shake
      ctx.save();
      ctx.translate(juice.offsetX, juice.offsetY);
      if (juice.angle !== 0) {
        ctx.translate(W / 2, H / 2);
        ctx.rotate(juice.angle);
        ctx.translate(-W / 2, -H / 2);
      }

      // 1. Draw static court
      if (staticCourt) {
        ctx.drawImage(staticCourt, 0, 0, W, H);
      }

      // 2. Integrated Digital Scoreboard on Acrylic Table
      const scores = scoresRef.current;
      ctx.font = `900 68px "Outfit", sans-serif`;
      ctx.textAlign = 'center';
      // P2 Score (Top Red)
      ctx.fillStyle = 'rgba(244, 63, 94, 0.22)';
      ctx.fillText(String(scores.p2Score), W / 2, H / 2 - 32);
      // P1 Score (Bottom Gold)
      ctx.fillStyle = 'rgba(245, 158, 11, 0.22)';
      ctx.fillText(String(scores.p1Score), W / 2, H / 2 + 78);

      // 3. Draw Puck Motion Trail
      for (let i = 0; i < TRAIL_LENGTH; i++) {
        const pt = trail[i];
        if (pt.alpha > 0.05) {
          ctx.fillStyle = `rgba(34, 211, 238, ${pt.alpha * 0.45})`;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 11 * pt.alpha, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 4. Render 3D Circular Mallets (Air Hockey Strikers)
      const botPX = (sim.prevPaddles[bottomUid] + (sim.paddles[bottomUid] - sim.prevPaddles[bottomUid]) * alpha) / 100 * W;
      const topPX = (sim.prevPaddles[topUid] + (sim.paddles[topUid] - sim.prevPaddles[topUid]) * alpha) / 100 * W;
      const malletRadiusPx = 28;

      // Draw Top Mallet (Crimson / CyberBot)
      const topPY = 0.12 * H;
      // Mallet Drop Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.beginPath();
      ctx.arc(topPX, topPY + 6, malletRadiusPx, 0, Math.PI * 2);
      ctx.fill();

      // Mallet Base Rim
      const gradTop = ctx.createRadialGradient(topPX, topPY, 4, topPX, topPY, malletRadiusPx);
      gradTop.addColorStop(0, '#f43f5e');
      gradTop.addColorStop(0.7, '#be123c');
      gradTop.addColorStop(1, '#881337');
      ctx.fillStyle = gradTop;
      ctx.shadowColor = '#f43f5e';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(topPX, topPY, malletRadiusPx, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Mallet Handle Knob
      ctx.fillStyle = '#fda4af';
      ctx.beginPath();
      ctx.arc(topPX, topPY, 10, 0, Math.PI * 2);
      ctx.fill();

      // Draw Bottom Mallet (Gold / Local Player)
      const botPY = 0.88 * H;
      // Mallet Drop Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.beginPath();
      ctx.arc(botPX, botPY + 6, malletRadiusPx, 0, Math.PI * 2);
      ctx.fill();

      // Mallet Base Rim
      const gradBot = ctx.createRadialGradient(botPX, botPY, 4, botPX, botPY, malletRadiusPx);
      gradBot.addColorStop(0, '#fbbf24');
      gradBot.addColorStop(0.7, '#d97706');
      gradBot.addColorStop(1, '#92400e');
      ctx.fillStyle = gradBot;
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(botPX, botPY, malletRadiusPx, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Mallet Handle Knob
      ctx.fillStyle = '#fde68a';
      ctx.beginPath();
      ctx.arc(botPX, botPY, 10, 0, Math.PI * 2);
      ctx.fill();

      // 5. Render 3D Air Hockey Puck
      const renderPuckX = ((sim.prevPuckX + (sim.puckX - sim.prevPuckX) * alpha) / 100) * W;
      const renderPuckY = ((sim.prevPuckY + (sim.puckY - sim.prevPuckY) * alpha) / 100) * H;
      const puckRadiusPx = 13;

      // Puck Drop Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.beginPath();
      ctx.arc(renderPuckX, renderPuckY + 4, puckRadiusPx, 0, Math.PI * 2);
      ctx.fill();

      // Puck Glowing Ring
      const puckGlow = ctx.createRadialGradient(renderPuckX, renderPuckY, 2, renderPuckX, renderPuckY, puckRadiusPx * 2.5);
      puckGlow.addColorStop(0, 'rgba(255, 255, 255, 1)');
      puckGlow.addColorStop(0.4, 'rgba(6, 182, 212, 0.7)');
      puckGlow.addColorStop(1, 'rgba(6, 182, 212, 0)');
      ctx.fillStyle = puckGlow;
      ctx.beginPath();
      ctx.arc(renderPuckX, renderPuckY, puckRadiusPx * 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Puck Body
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#22d3ee';
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(renderPuckX, renderPuckY, puckRadiusPx, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Puck Center Grooves
      ctx.strokeStyle = '#0891b2';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(renderPuckX, renderPuckY, 6, 0, Math.PI * 2);
      ctx.stroke();

      // 6. Render Particles
      juice.renderParticles(ctx, alpha);

      // 7. Goal Scored Celebration Overlay
      if (sim.isGoalScored && lastScorerName) {
        ctx.fillStyle = 'rgba(3, 6, 17, 0.65)';
        ctx.fillRect(0, 0, W, H);

        ctx.font = `900 52px "Outfit", sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fbbf24';
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 35;
        ctx.fillText('⚽ GOAL!', W / 2, H / 2 - 10);
        ctx.shadowBlur = 0;

        ctx.font = `700 18px "Outfit", sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`${lastScorerName} SCORED!`, W / 2, H / 2 + 32);

        ctx.font = `900 22px "JetBrains Mono", monospace`;
        ctx.fillStyle = '#06b6d4';
        ctx.fillText(`NEXT SERVE IN ${Math.max(1, Math.ceil(sim.goalPauseTimer))}...`, W / 2, H / 2 + 68);
      }

      ctx.restore();
    };

    const loop = new GameLoop({ update, render });
    loop.start();

    return () => {
      loop.stop();
      input.detach();
      juice.reset();
      canvas.removeEventListener('pointermove', handleDirectPointer);
      canvas.removeEventListener('pointerdown', handleDirectPointer);
      window.removeEventListener('resize', handleResize);
    };
  }, [isHost, bottomUid, topUid, isBottomPlayer, isBotPlaying, p1Nickname, p2Nickname, onDispatchAction]);

  return (
    <div className="w-full max-w-lg md:max-w-xl mx-auto flex flex-col items-center select-none gap-2 px-2">
      {/* Top Player (Opponent) HUD Bar */}
      <div className="w-full flex items-center justify-between px-4 py-2.5 rounded-2xl bg-slate-900/80 border border-rose-500/40 text-xs font-black font-mono shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <span className="w-3 h-3 rounded-full bg-rose-500 shadow-[0_0_10px_#f43f5e] animate-pulse" />
          <span className="text-rose-200 text-sm font-['Outfit'] font-black">
            {isBottomPlayer ? p2Nickname : p1Nickname}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-rose-400 font-mono tracking-wider">SCORE</span>
          <span className="text-rose-400 text-2xl tabular-nums font-['Outfit'] font-black">
            {isBottomPlayer ? p2Score : p1Score}
          </span>
        </div>
      </div>

      {/* Massive Responsive Air Hockey Arena Stadium */}
      <div
        ref={containerRef}
        className="w-full aspect-[3/4] h-[60vh] min-h-[440px] max-h-[620px] rounded-3xl overflow-hidden shadow-2xl border-4 border-cyan-500/40 cursor-ew-resize touch-none select-none relative"
        style={{
          boxShadow: '0 0 60px rgba(6, 182, 212, 0.25), 0 30px 80px rgba(0, 0, 0, 0.8)'
        }}
      >
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>

      {/* Bottom Player (You) HUD Bar */}
      <div className="w-full flex items-center justify-between px-4 py-2.5 rounded-2xl bg-slate-900/80 border border-amber-500/40 text-xs font-black font-mono shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <span className="w-3 h-3 rounded-full bg-amber-400 shadow-[0_0_10px_#f59e0b] animate-pulse" />
          <span className="text-amber-200 text-sm font-['Outfit'] font-black">
            {isBottomPlayer ? p1Nickname : p2Nickname}{' '}
            <span className="text-amber-400 text-[10px] bg-amber-500/20 px-2 py-0.5 rounded-md border border-amber-500/50">
              YOU
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-amber-400 font-mono tracking-wider">SCORE</span>
          <span className="text-amber-400 text-2xl tabular-nums font-['Outfit'] font-black">
            {isBottomPlayer ? p1Score : p2Score}
          </span>
        </div>
      </div>

      {/* Mobile Steering Touch Pads */}
      <div className="w-full flex items-center justify-between gap-3 max-w-sm pt-1">
        <button
          onPointerDown={() => { mobileSteer.current.left = true; }}
          onPointerUp={() => { mobileSteer.current.left = false; }}
          onPointerLeave={() => { mobileSteer.current.left = false; }}
          className="flex-1 h-12 rounded-2xl bg-slate-900/90 border-2 border-slate-700 active:scale-95 flex items-center justify-center text-xs font-black font-mono shadow-md hover:border-cyan-400 text-cyan-300"
        >
          ◀ SLIDE LEFT
        </button>
        <button
          onPointerDown={() => { mobileSteer.current.right = true; }}
          onPointerUp={() => { mobileSteer.current.right = false; }}
          onPointerLeave={() => { mobileSteer.current.right = false; }}
          className="flex-1 h-12 rounded-2xl bg-slate-900/90 border-2 border-slate-700 active:scale-95 flex items-center justify-center text-xs font-black font-mono shadow-md hover:border-cyan-400 text-cyan-300"
        >
          SLIDE RIGHT ▶
        </button>
      </div>

      <p className="text-xs text-slate-400 font-medium tracking-wide">
        ⚡ Move mouse or finger to strike the puck • A/D or Arrow keys supported!
      </p>
    </div>
  );
};
