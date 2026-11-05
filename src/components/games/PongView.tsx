import React, { useEffect, useRef, useState } from 'react';
import type { AuthoritativeRoomState } from '../../types/room';
import { GameLoop } from '../../engine/core/GameLoop';
import { CanvasManager } from '../../engine/core/CanvasManager';
import { JuiceEngine } from '../../engine/core/JuiceEngine';
import { soundService } from '../../services/sound';
import { ChevronLeft, ChevronRight, Trophy } from 'lucide-react';

interface PongViewProps {
  room: AuthoritativeRoomState<any>;
  playerUid: string;
  onDispatchAction: (type: string, payload: any) => void;
}

export const PongView: React.FC<PongViewProps> = ({ room, playerUid, onDispatchAction }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const players = Object.keys(room.players);
  const bottomUid = players[0] || playerUid;
  const topUid = players[1] || (bottomUid === 'bot_rival' ? 'player' : 'bot_rival');
  const isHost = room.hostUid === playerUid;
  const isBotPlaying = Boolean(room.players['bot_rival'] || topUid === 'bot_rival');

  const p1Nickname = room.players[bottomUid]?.nickname || 'Player 1';
  const p2Nickname = room.players[topUid]?.nickname || 'CyberBot AI';

  const [scorerName, setScorerName] = useState<string | null>(null);
  const scorerNameRef = useRef<string | null>(null);

  // Responsive paddle position states
  const paddleX = useRef<number>(50); // Local player paddle X (0 to 100)
  const oppPaddleX = useRef<number>(50); // Remote/Bot paddle X (0 to 100)

  // Simulation physics state
  const ballPos = useRef({ x: 50, y: 50 });
  const ballVel = useRef({
    vx: (Math.random() > 0.5 ? 1 : -1) * 0.45,
    vy: 0.48
  });
  const ballSpeed = useRef(1.0);
  const goalCooldown = useRef(0);
  const lastPaddleDispatch = useRef(0);

  // Input states
  const keysDown = useRef<{ [key: string]: boolean }>({});
  const mobileSteer = useRef<{ left: boolean; right: boolean }>({ left: false, right: false });

  // Keyboard controls
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keysDown.current[e.key.toLowerCase()] = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysDown.current[e.key.toLowerCase()] = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Sync remote opponent paddle in 2P network rooms
  useEffect(() => {
    if (!isBotPlaying && room.gameState?.paddles) {
      const oppUid = bottomUid === playerUid ? topUid : bottomUid;
      const remoteX = room.gameState.paddles[oppUid];
      if (typeof remoteX === 'number') {
        oppPaddleX.current = remoteX;
      }
    }
  }, [room.gameState?.paddles, isBotPlaying, bottomUid, topUid, playerUid]);

  // Main 60 FPS Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasMgr = new CanvasManager(canvas);
    const juice = new JuiceEngine(350);

    const W = 520;
    const H = 680;
    const PADDLE_W = 24; // % of court width (wide and forgiving)
    const PADDLE_HALF = PADDLE_W / 2;

    // Reset ball to center for serve
    const serveBall = (toBottom: boolean) => {
      ballPos.current = { x: 50, y: 50 };
      ballVel.current = {
        vx: (Math.random() > 0.5 ? 1 : -1) * (0.35 + Math.random() * 0.2),
        vy: toBottom ? 0.48 : -0.48
      };
      ballSpeed.current = 1.0;
      soundService.playCountdown(0);
    };

    // Pre-allocated trail
    const TRAIL_MAX = 12;
    const trail: Array<{ x: number; y: number; alpha: number }> = [];
    for (let i = 0; i < TRAIL_MAX; i++) trail.push({ x: 50, y: 50, alpha: 0 });

    // Touch and drag tracking directly on canvas
    const handlePointerMove = (e: PointerEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const clickX = ((e.clientX - rect.left) / rect.width) * 100;
      paddleX.current = Math.max(PADDLE_HALF, Math.min(100 - PADDLE_HALF, clickX));
    };

    const handlePointerDown = (e: PointerEvent) => {
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch {}
      handlePointerMove(e);
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);

    const update = (dt: number) => {
      juice.update(dt);

      // 1. Move Player Paddle via Keyboard / Mobile Steer Buttons
      const isLeft = keysDown.current['arrowleft'] || keysDown.current['a'] || mobileSteer.current.left;
      const isRight = keysDown.current['arrowright'] || keysDown.current['d'] || mobileSteer.current.right;

      if (isLeft) {
        paddleX.current = Math.max(PADDLE_HALF, paddleX.current - 58 * dt);
      }
      if (isRight) {
        paddleX.current = Math.min(100 - PADDLE_HALF, paddleX.current + 58 * dt);
      }

      // Throttled network dispatch (20 Hz)
      const now = Date.now();
      if (now - lastPaddleDispatch.current > 45) {
        lastPaddleDispatch.current = now;
        onDispatchAction('PONG_PADDLE', { xPos: Math.round(paddleX.current) });
      }

      // 2. Goal Cooldown Pause
      if (goalCooldown.current > 0) {
        goalCooldown.current -= dt;
        if (goalCooldown.current <= 0) {
          scorerNameRef.current = null;
          setScorerName(null);
        }
        return;
      }

      // 3. CyberBot AI Steering
      if (isBotPlaying) {
        const ball = ballPos.current;
        const vel = ballVel.current;

        if (vel.vy < 0) {
          // Ball moving towards bot: track ball X with natural speed & slight human imperfection
          const trackingTarget = ball.x + (Math.sin(now * 0.003) * 4);
          oppPaddleX.current += (trackingTarget - oppPaddleX.current) * 0.11;
        } else {
          // Ball moving away: smoothly return towards center court
          oppPaddleX.current += (50 - oppPaddleX.current) * 0.04;
        }
        oppPaddleX.current = Math.max(PADDLE_HALF, Math.min(100 - PADDLE_HALF, oppPaddleX.current));
      }

      // 4. Ball Physics Simulation
      const speedMult = ballSpeed.current;
      ballPos.current.x += ballVel.current.vx * speedMult * dt * 60 * 0.9;
      ballPos.current.y += ballVel.current.vy * speedMult * dt * 60 * 0.9;

      // Side Wall Bounces (Left & Right)
      if (ballPos.current.x <= 3.5) {
        ballPos.current.x = 3.5;
        ballVel.current.vx = Math.abs(ballVel.current.vx);
        juice.playSound('ricochet');
        juice.addTrauma(0.1);
        juice.emitSparks((ballPos.current.x / 100) * W, (ballPos.current.y / 100) * H, 8, '#06b6d4', '#38bdf8', 3);
      } else if (ballPos.current.x >= 96.5) {
        ballPos.current.x = 96.5;
        ballVel.current.vx = -Math.abs(ballVel.current.vx);
        juice.playSound('ricochet');
        juice.addTrauma(0.1);
        juice.emitSparks((ballPos.current.x / 100) * W, (ballPos.current.y / 100) * H, 8, '#06b6d4', '#38bdf8', 3);
      }

      // 5. Paddle Collisions
      // Bottom Paddle (Local Player) Collision at Y ~ 88%
      if (ballPos.current.y >= 86 && ballPos.current.y <= 92 && ballVel.current.vy > 0) {
        const diffX = ballPos.current.x - paddleX.current;
        if (Math.abs(diffX) <= PADDLE_HALF + 3) {
          ballPos.current.y = 86;
          ballVel.current.vy = -Math.abs(ballVel.current.vy);
          // Angle deflection: hitting the corners shoots sharper angles!
          const normDiff = diffX / PADDLE_HALF;
          ballVel.current.vx = normDiff * 0.72;
          ballSpeed.current = Math.min(2.3, ballSpeed.current * 1.05);

          juice.playSound('clack');
          juice.addTrauma(0.25);
          juice.emitSparks((ballPos.current.x / 100) * W, (ballPos.current.y / 100) * H, 14, '#f59e0b', '#fbbf24', 4);
        }
      }

      // Top Paddle (Opponent / Bot) Collision at Y ~ 12%
      if (ballPos.current.y <= 14 && ballPos.current.y >= 8 && ballVel.current.vy < 0) {
        const diffX = ballPos.current.x - oppPaddleX.current;
        if (Math.abs(diffX) <= PADDLE_HALF + 3) {
          ballPos.current.y = 14;
          ballVel.current.vy = Math.abs(ballVel.current.vy);
          const normDiff = diffX / PADDLE_HALF;
          ballVel.current.vx = normDiff * 0.72;
          ballSpeed.current = Math.min(2.3, ballSpeed.current * 1.05);

          juice.playSound('clack');
          juice.addTrauma(0.25);
          juice.emitSparks((ballPos.current.x / 100) * W, (ballPos.current.y / 100) * H, 14, '#f43f5e', '#fb7185', 4);
        }
      }

      // 6. Goal Scoring Checks
      // Ball passed Top Goal -> Bottom Player (YOU) Scores!
      if (ballPos.current.y <= 1.5) {
        goalCooldown.current = 1.6;
        scorerNameRef.current = p1Nickname;
        setScorerName(p1Nickname);
        soundService.playGoal();
        juice.addTrauma(0.6);
        juice.emitExplosion((ballPos.current.x / 100) * W, 20, 50);

        if (isHost) {
          onDispatchAction('PONG_GOAL', { scorerUid: bottomUid, actingUid: bottomUid });
        }
        serveBall(false); // Serve towards the opponent who was scored on
      }

      // Ball passed Bottom Goal -> Top Player (BOT / OPPONENT) Scores!
      if (ballPos.current.y >= 98.5) {
        goalCooldown.current = 1.6;
        scorerNameRef.current = p2Nickname;
        setScorerName(p2Nickname);
        soundService.playGoal();
        juice.addTrauma(0.6);
        juice.emitExplosion((ballPos.current.x / 100) * W, H - 20, 50);

        if (isHost) {
          onDispatchAction('PONG_GOAL', { scorerUid: topUid, actingUid: topUid });
        }
        serveBall(true); // Serve towards the player who was scored on
      }

      // 7. Update Puck Trail
      trail.unshift({ x: ballPos.current.x, y: ballPos.current.y, alpha: 1.0 });
      if (trail.length > TRAIL_MAX) trail.pop();
      for (const t of trail) t.alpha *= 0.85;
    };

    const render = () => {
      const ctx = canvasMgr.ctx;
      ctx.clearRect(0, 0, canvasMgr.width, canvasMgr.height);
      ctx.save();
      ctx.translate(juice.offsetX, juice.offsetY);

      const scaleX = canvasMgr.width / W;
      const scaleY = canvasMgr.height / H;
      ctx.scale(scaleX, scaleY);

      // 1. Deep Air Hockey Court Table
      const tableGrad = ctx.createLinearGradient(0, 0, 0, H);
      tableGrad.addColorStop(0, '#070c1b');
      tableGrad.addColorStop(0.5, '#0b132b');
      tableGrad.addColorStop(1, '#070c1b');
      ctx.fillStyle = tableGrad;
      ctx.fillRect(0, 0, W, H);

      // Neon Air Surface Grid Dots
      ctx.fillStyle = 'rgba(6, 182, 212, 0.05)';
      for (let x = 20; x < W; x += 28) {
        for (let y = 20; y < H; y += 28) {
          ctx.beginPath();
          ctx.arc(x, y, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Center Divider & Faceoff Ring
      ctx.setLineDash([12, 8]);
      ctx.strokeStyle = 'rgba(139, 92, 246, 0.4)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(10, H / 2);
      ctx.lineTo(W - 10, H / 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = 'rgba(6, 182, 212, 0.35)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 60, 0, Math.PI * 2);
      ctx.stroke();

      // Top Defense Arc
      ctx.strokeStyle = 'rgba(244, 63, 94, 0.35)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(W / 2, 0, W * 0.36, 0, Math.PI);
      ctx.stroke();

      // Bottom Defense Arc
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(W / 2, H, W * 0.36, Math.PI, Math.PI * 2);
      ctx.stroke();

      // Side Guardrails
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(4, 0);
      ctx.lineTo(4, H);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(W - 4, 0);
      ctx.lineTo(W - 4, H);
      ctx.stroke();

      // 2. Giant Neon Score Watermark
      const p1Score = room.scores[bottomUid] || 0;
      const p2Score = room.scores[topUid] || 0;
      ctx.font = '900 80px "Outfit", sans-serif';
      ctx.textAlign = 'center';

      // Top Score (Opponent)
      ctx.fillStyle = 'rgba(244, 63, 94, 0.18)';
      ctx.fillText(String(p2Score), W / 2, H / 2 - 32);

      // Bottom Score (Player)
      ctx.fillStyle = 'rgba(245, 158, 11, 0.18)';
      ctx.fillText(String(p1Score), W / 2, H / 2 + 85);

      // 3. Render Puck Trail
      for (const pt of trail) {
        if (pt.alpha > 0.05) {
          ctx.fillStyle = `rgba(34, 211, 238, ${pt.alpha * 0.4})`;
          ctx.beginPath();
          ctx.arc((pt.x / 100) * W, (pt.y / 100) * H, 12 * pt.alpha, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 4. Render 3D High-Velocity Puck
      const px = (ballPos.current.x / 100) * W;
      const py = (ballPos.current.y / 100) * H;
      const puckRadius = 14;

      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(px, py, puckRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Puck Core Inner Ring
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.stroke();

      // 5. Render Top Paddle (Opponent / Crimson)
      const topX = (oppPaddleX.current / 100) * W;
      const topY = (12 / 100) * H;
      const padW = (PADDLE_W / 100) * W;
      const padH = 18;

      ctx.fillStyle = '#e11d48';
      ctx.shadowColor = '#f43f5e';
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.roundRect(topX - padW / 2, topY - padH / 2, padW, padH, 9);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 11px "Outfit", sans-serif';
      ctx.fillText(p2Nickname.substring(0, 10).toUpperCase(), topX, topY - 14);

      // 6. Render Bottom Paddle (Local Player / Gold)
      const botX = (paddleX.current / 100) * W;
      const botY = (88 / 100) * H;

      ctx.fillStyle = '#f59e0b';
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.roundRect(botX - padW / 2, botY - padH / 2, padW, padH, 9);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 11px "Outfit", sans-serif';
      ctx.fillText('▼ YOU', botX, botY + 24);

      // 7. Goal Celebration Banner
      const activeScorer = scorerNameRef.current || scorerName;
      if (goalCooldown.current > 0 && activeScorer) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, W, H);

        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 35;
        ctx.fillStyle = '#fbbf24';
        ctx.font = '900 54px "Outfit", sans-serif';
        ctx.fillText('⚡ GOAL!', W / 2, H / 2 - 15);
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#ffffff';
        ctx.font = '700 18px "Outfit", sans-serif';
        ctx.fillText(`${activeScorer.toUpperCase()} SCORED!`, W / 2, H / 2 + 28);
      }

      ctx.restore();

      // Particle rendering
      juice.renderParticles(canvasMgr.ctx, canvasMgr.width / W);
    };

    const loop = new GameLoop({ update, render });
    loop.start();

    return () => {
      loop.stop();
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
    };
  }, [bottomUid, topUid, isBotPlaying, isHost, p1Nickname, p2Nickname, onDispatchAction]);

  const p1Score = room.scores[bottomUid] || 0;
  const p2Score = room.scores[topUid] || 0;
  const targetWins = room.maxRounds || room.gameState?.targetScore || 5;

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col items-center select-none gap-2 px-2">
      {/* Top Player (Opponent) Score HUD */}
      <div className="w-full flex items-center justify-between px-4 py-2 rounded-2xl bg-slate-900/90 border border-rose-500/40 text-xs font-mono font-bold shadow-md">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-rose-500 shadow-[0_0_8px_#f43f5e] animate-pulse" />
          <span className="text-rose-300 font-['Outfit'] font-black text-sm">{p2Nickname}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400">SCORE</span>
          <span className="text-2xl font-black text-rose-400 font-['Outfit']">{p2Score}</span>
        </div>
      </div>

      {/* Target Points Banner */}
      <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-[11px] font-mono text-cyan-300 font-bold">
        <Trophy className="w-3.5 h-3.5 text-amber-400" />
        <span>FIRST TO {targetWins} WINS THE MATCH</span>
      </div>

      {/* Interactive Air Hockey Canvas */}
      <div className="w-full aspect-[3/4] h-[55vh] min-h-[420px] max-h-[600px] rounded-3xl overflow-hidden shadow-2xl border-2 border-cyan-500/50 relative bg-slate-950 cursor-ew-resize">
        <canvas
          ref={canvasRef}
          style={{ touchAction: 'none' }}
          className="w-full h-full block select-none"
        />
      </div>

      {/* Mobile Glide Buttons (Touch-friendly alternative to dragging) */}
      <div className="w-full grid grid-cols-2 gap-3 max-w-md pt-1">
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            mobileSteer.current.left = true;
          }}
          onPointerUp={() => { mobileSteer.current.left = false; }}
          onPointerLeave={() => { mobileSteer.current.left = false; }}
          onPointerCancel={() => { mobileSteer.current.left = false; }}
          className="h-14 rounded-2xl bg-slate-900 border-2 border-cyan-500/40 active:bg-cyan-600/30 active:scale-95 text-xs font-black font-mono text-cyan-300 flex items-center justify-center gap-2 shadow-lg touch-manipulation cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5 text-cyan-400" />
          <span>SLIDE LEFT</span>
        </button>

        <button
          onPointerDown={(e) => {
            e.preventDefault();
            mobileSteer.current.right = true;
          }}
          onPointerUp={() => { mobileSteer.current.right = false; }}
          onPointerLeave={() => { mobileSteer.current.right = false; }}
          onPointerCancel={() => { mobileSteer.current.right = false; }}
          className="h-14 rounded-2xl bg-slate-900 border-2 border-cyan-500/40 active:bg-cyan-600/30 active:scale-95 text-xs font-black font-mono text-cyan-300 flex items-center justify-center gap-2 shadow-lg touch-manipulation cursor-pointer"
        >
          <span>SLIDE RIGHT</span>
          <ChevronRight className="w-5 h-5 text-cyan-400" />
        </button>
      </div>

      {/* Bottom Player (You) Score HUD */}
      <div className="w-full flex items-center justify-between px-4 py-2 rounded-2xl bg-slate-900/90 border border-amber-500/40 text-xs font-mono font-bold shadow-md">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-amber-400 shadow-[0_0_8px_#f59e0b] animate-pulse" />
          <span className="text-amber-300 font-['Outfit'] font-black text-sm">{p1Nickname} (YOU)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400">SCORE</span>
          <span className="text-2xl font-black text-amber-400 font-['Outfit']">{p1Score}</span>
        </div>
      </div>

      <p className="text-[11px] text-cyan-400 font-mono text-center">
        👆 Touch & drag anywhere on table to glide paddle • Or use Left/Right buttons & A/D keys!
      </p>
    </div>
  );
};
