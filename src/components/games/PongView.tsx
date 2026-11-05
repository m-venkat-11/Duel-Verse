import React, { useEffect, useRef, useState } from 'react';
import type { AuthoritativeRoomState } from '../../types/room';
import { GameLoop } from '../../engine/core/GameLoop';
import { CanvasManager } from '../../engine/core/CanvasManager';
import { JuiceEngine } from '../../engine/core/JuiceEngine';
import { soundService } from '../../services/sound';
import { Trophy, ChevronLeft, ChevronRight } from 'lucide-react';

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
  const p2Nickname = room.players[topUid]?.nickname || 'CyberBot';

  const [scorerName, setScorerName] = useState<string | null>(null);
  const scorerNameRef = useRef<string | null>(null);

  // Paddles in court percentage (0 to 100)
  // Local Player is always at the bottom
  const myPaddle = useRef({ x: 50, y: 88, vx: 0, vy: 0 });
  const oppPaddle = useRef({ x: 50, y: 12, vx: 0, vy: 0 });

  // Ball physics
  const ball = useRef({
    x: 50,
    y: 50,
    vx: (Math.random() > 0.5 ? 1 : -1) * 0.42,
    vy: 0.46,
    speed: 1.0,
    spin: 0
  });

  const goalCooldown = useRef(0);
  const lastNetworkDispatch = useRef(0);

  // Input states
  const keysDown = useRef<{ [key: string]: boolean }>({});
  const mobileButtons = useRef({ left: false, right: false });

  // Keyboard navigation
  useEffect(() => {
    const handleDown = (e: KeyboardEvent) => {
      keysDown.current[e.key.toLowerCase()] = true;
    };
    const handleUp = (e: KeyboardEvent) => {
      keysDown.current[e.key.toLowerCase()] = false;
    };
    window.addEventListener('keydown', handleDown);
    window.addEventListener('keyup', handleUp);
    return () => {
      window.removeEventListener('keydown', handleDown);
      window.removeEventListener('keyup', handleUp);
    };
  }, []);

  // Sync remote opponent paddle in 2P network rooms
  useEffect(() => {
    if (!isBotPlaying && room.gameState?.paddles) {
      const oppUid = bottomUid === playerUid ? topUid : bottomUid;
      const remote = room.gameState.paddles[oppUid];
      if (typeof remote === 'number') {
        oppPaddle.current.x = remote;
      } else if (remote && typeof remote.x === 'number') {
        oppPaddle.current.x = remote.x;
        if (typeof remote.y === 'number') oppPaddle.current.y = 100 - remote.y;
      }
    }
  }, [room.gameState?.paddles, isBotPlaying, bottomUid, topUid, playerUid]);

  // 60 FPS Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasMgr = new CanvasManager(canvas);
    const juice = new JuiceEngine(350);

    const W = 520;
    const H = 720;
    const PADDLE_W = 24; // % width
    const PADDLE_H = 4.2; // % height
    const PADDLE_HALF_W = PADDLE_W / 2;
    const PADDLE_HALF_H = PADDLE_H / 2;

    const serve = (toBottom: boolean) => {
      ball.current.x = 50;
      ball.current.y = 50;
      ball.current.vx = (Math.random() > 0.5 ? 1 : -1) * (0.32 + Math.random() * 0.18);
      ball.current.vy = toBottom ? 0.46 : -0.46;
      ball.current.speed = 1.0;
      ball.current.spin = 0;
      soundService.playCountdown(0);
    };

    // Pre-allocated trail
    const TRAIL_MAX = 14;
    const trail: Array<{ x: number; y: number; alpha: number }> = [];
    for (let i = 0; i < TRAIL_MAX; i++) trail.push({ x: 50, y: 50, alpha: 0 });

    // 1-to-1 Touch drag: paddle follows finger directly
    const handlePointer = (e: PointerEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * 100;
      const py = ((e.clientY - rect.top) / rect.height) * 100;

      // Allow full 2D movement within bottom player's half
      myPaddle.current.x = Math.max(PADDLE_HALF_W, Math.min(100 - PADDLE_HALF_W, px));
      myPaddle.current.y = Math.max(54, Math.min(94, py));
    };

    const handlePointerDown = (e: PointerEvent) => {
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch {}
      handlePointer(e);
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointer);

    const update = (dt: number) => {
      juice.update(dt);

      const now = Date.now();
      const prevMyX = myPaddle.current.x;
      const prevMyY = myPaddle.current.y;

      // 1. Mobile Buttons / Keyboard Controls
      const isLeft = keysDown.current['arrowleft'] || keysDown.current['a'] || mobileButtons.current.left;
      const isRight = keysDown.current['arrowright'] || keysDown.current['d'] || mobileButtons.current.right;
      const isUp = keysDown.current['arrowup'] || keysDown.current['w'];
      const isDown = keysDown.current['arrowdown'] || keysDown.current['s'];

      if (isLeft) myPaddle.current.x = Math.max(PADDLE_HALF_W, myPaddle.current.x - 62 * dt);
      if (isRight) myPaddle.current.x = Math.min(100 - PADDLE_HALF_W, myPaddle.current.x + 62 * dt);
      if (isUp) myPaddle.current.y = Math.max(54, myPaddle.current.y - 50 * dt);
      if (isDown) myPaddle.current.y = Math.min(94, myPaddle.current.y + 50 * dt);

      myPaddle.current.vx = myPaddle.current.x - prevMyX;
      myPaddle.current.vy = myPaddle.current.y - prevMyY;

      // Throttled network broadcast (20 Hz)
      if (now - lastNetworkDispatch.current > 48) {
        lastNetworkDispatch.current = now;
        onDispatchAction('PONG_PADDLE', {
          xPos: Math.round(myPaddle.current.x),
          yPos: Math.round(myPaddle.current.y)
        });
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

      // 3. CyberBot AI (Competitive, natural, humanly beatable)
      if (isBotPlaying) {
        const b = ball.current;
        const prevOppX = oppPaddle.current.x;

        if (b.vy < 0) {
          // Ball approaching bot: track ball with realistic lag & corner angle vulnerability
          const trackingTarget = b.x + Math.sin(now * 0.003) * 3;
          oppPaddle.current.x += (trackingTarget - oppPaddle.current.x) * 0.12;

          // Bot advances slightly to strike ball forward
          const targetY = b.y < 35 ? Math.max(10, b.y - 4) : 12;
          oppPaddle.current.y += (targetY - oppPaddle.current.y) * 0.08;
        } else {
          // Ball retreating: bot returns towards center court defense position
          oppPaddle.current.x += (50 - oppPaddle.current.x) * 0.05;
          oppPaddle.current.y += (12 - oppPaddle.current.y) * 0.06;
        }

        oppPaddle.current.x = Math.max(PADDLE_HALF_W, Math.min(100 - PADDLE_HALF_W, oppPaddle.current.x));
        oppPaddle.current.vx = oppPaddle.current.x - prevOppX;
      }

      // 4. Ball Physics with Spin and Table Bounce
      const spd = ball.current.speed;
      ball.current.x += (ball.current.vx + ball.current.spin * 0.15) * spd * dt * 60 * 0.95;
      ball.current.y += ball.current.vy * spd * dt * 60 * 0.95;
      ball.current.spin *= 0.98; // Spin dampening

      // Side Table Rubber Rails Bounce
      if (ball.current.x <= 3.5) {
        ball.current.x = 3.5;
        ball.current.vx = Math.abs(ball.current.vx);
        juice.playSound('ricochet');
        juice.addTrauma(0.1);
        juice.emitSparks((ball.current.x / 100) * W, (ball.current.y / 100) * H, 8, '#38bdf8', '#0ea5e9', 3);
      } else if (ball.current.x >= 96.5) {
        ball.current.x = 96.5;
        ball.current.vx = -Math.abs(ball.current.vx);
        juice.playSound('ricochet');
        juice.addTrauma(0.1);
        juice.emitSparks((ball.current.x / 100) * W, (ball.current.y / 100) * H, 8, '#38bdf8', '#0ea5e9', 3);
      }

      // 5. Paddle Hit Detection
      // Bottom Paddle (Local Player) Hit Check
      const myPad = myPaddle.current;
      const bY = ball.current.y;
      const bX = ball.current.x;

      if (
        bY >= myPad.y - PADDLE_HALF_H - 1.5 &&
        bY <= myPad.y + PADDLE_HALF_H + 1.5 &&
        ball.current.vy > 0
      ) {
        const diffX = bX - myPad.x;
        if (Math.abs(diffX) <= PADDLE_HALF_W + 3) {
          ball.current.y = myPad.y - PADDLE_HALF_H - 1.5;
          ball.current.vy = -Math.abs(ball.current.vy);

          // Angle deflection based on hit position
          const normOffset = diffX / PADDLE_HALF_W;
          ball.current.vx = normOffset * 0.75 + myPad.vx * 0.15;
          ball.current.spin = myPad.vx * 0.4;
          ball.current.speed = Math.min(2.2, ball.current.speed * 1.06);

          soundService.playImpact(1.1);
          juice.addTrauma(0.25);
          juice.emitSparks((bX / 100) * W, (bY / 100) * H, 14, '#f59e0b', '#fbbf24', 4);
        }
      }

      // Top Paddle (Opponent / Bot) Hit Check
      const opPad = oppPaddle.current;
      if (
        bY <= opPad.y + PADDLE_HALF_H + 1.5 &&
        bY >= opPad.y - PADDLE_HALF_H - 1.5 &&
        ball.current.vy < 0
      ) {
        const diffX = bX - opPad.x;
        if (Math.abs(diffX) <= PADDLE_HALF_W + 3) {
          ball.current.y = opPad.y + PADDLE_HALF_H + 1.5;
          ball.current.vy = Math.abs(ball.current.vy);

          const normOffset = diffX / PADDLE_HALF_W;
          ball.current.vx = normOffset * 0.75 + opPad.vx * 0.15;
          ball.current.spin = opPad.vx * 0.4;
          ball.current.speed = Math.min(2.2, ball.current.speed * 1.06);

          soundService.playImpact(1.1);
          juice.addTrauma(0.25);
          juice.emitSparks((bX / 100) * W, (bY / 100) * H, 14, '#f43f5e', '#fb7185', 4);
        }
      }

      // 6. Goal Scored Detection
      // Top Goal: Bottom Player (YOU) Scores!
      if (ball.current.y <= 1.2) {
        goalCooldown.current = 1.6;
        scorerNameRef.current = p1Nickname;
        setScorerName(p1Nickname);
        soundService.playGoal();
        juice.addTrauma(0.65);
        juice.emitExplosion((ball.current.x / 100) * W, 25, 45);

        if (isHost) {
          onDispatchAction('PONG_GOAL', { scorerUid: bottomUid, actingUid: bottomUid });
        }
        serve(false);
      }

      // Bottom Goal: Top Player (OPPONENT / BOT) Scores!
      if (ball.current.y >= 98.8) {
        goalCooldown.current = 1.6;
        scorerNameRef.current = p2Nickname;
        setScorerName(p2Nickname);
        soundService.playGoal();
        juice.addTrauma(0.65);
        juice.emitExplosion((ball.current.x / 100) * W, H - 25, 45);

        if (isHost) {
          onDispatchAction('PONG_GOAL', { scorerUid: topUid, actingUid: topUid });
        }
        serve(true);
      }

      // 7. Update Ball Trail
      trail.unshift({ x: ball.current.x, y: ball.current.y, alpha: 1.0 });
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

      // 1. Play Store "The Challenge" Tournament Table Tennis Court
      // Deep tournament emerald table surface
      const tableGrad = ctx.createLinearGradient(0, 0, 0, H);
      tableGrad.addColorStop(0, '#064e3b');
      tableGrad.addColorStop(0.5, '#047857');
      tableGrad.addColorStop(1, '#064e3b');
      ctx.fillStyle = tableGrad;
      ctx.fillRect(0, 0, W, H);

      // Table Bevel Outer Wooden / Dark Frame
      ctx.strokeStyle = '#022c22';
      ctx.lineWidth = 14;
      ctx.strokeRect(7, 7, W - 14, H - 14);

      // White Tournament Border Lines
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3.5;
      ctx.strokeRect(18, 18, W - 36, H - 36);

      // White Center Longitudinal Service Line
      ctx.beginPath();
      ctx.moveTo(W / 2, 18);
      ctx.lineTo(W / 2, H - 18);
      ctx.stroke();

      // White Tournament Center Net (Realistic table tennis mesh)
      // Net shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fillRect(6, H / 2 + 3, W - 12, 6);

      // Net body
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.fillRect(8, H / 2 - 2, W - 16, 4);

      // Net posts on edges
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(4, H / 2 - 8, 8, 16);
      ctx.fillRect(W - 12, H / 2 - 8, 8, 16);

      // 2. Play Store Minimalist Large Floor Scores
      const p1Score = room.scores[bottomUid] || 0;
      const p2Score = room.scores[topUid] || 0;
      ctx.font = '900 96px "Outfit", sans-serif';
      ctx.textAlign = 'center';

      // Top Player Floor Score
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.fillText(String(p2Score), W / 2, H / 2 - 60);

      // Bottom Player Floor Score
      ctx.fillText(String(p1Score), W / 2, H / 2 + 130);

      // 3. Render Ball Shadow on Court
      const bx = (ball.current.x / 100) * W;
      const by = (ball.current.y / 100) * H;
      const ballRadius = 13;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.ellipse(bx, by + 7, ballRadius * 1.1, ballRadius * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();

      // Ball Trail
      for (const pt of trail) {
        if (pt.alpha > 0.05) {
          ctx.fillStyle = `rgba(255, 255, 255, ${pt.alpha * 0.35})`;
          ctx.beginPath();
          ctx.arc((pt.x / 100) * W, (pt.y / 100) * H, ballRadius * pt.alpha * 0.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 4. Render 3D Tournament White Table Tennis Ball
      const ballShade = ctx.createRadialGradient(bx - 3, by - 3, 2, bx, by, ballRadius);
      ballShade.addColorStop(0, '#ffffff');
      ballShade.addColorStop(0.7, '#f8fafc');
      ballShade.addColorStop(1, '#cbd5e1');
      ctx.fillStyle = ballShade;
      ctx.beginPath();
      ctx.arc(bx, by, ballRadius, 0, Math.PI * 2);
      ctx.fill();

      // Subtle ball rim outline
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1;
      ctx.stroke();

      // 5. Render Paddles (Authentic Play Store Table Tennis Styling)
      const padW = (PADDLE_W / 100) * W;
      const padH = (PADDLE_H / 100) * H;

      // Top Paddle (Opponent / Crimson)
      const tx = (oppPaddle.current.x / 100) * W;
      const ty = (oppPaddle.current.y / 100) * H;

      // Paddle drop shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.roundRect(tx - padW / 2, ty - padH / 2 + 5, padW, padH, 10);
      ctx.fill();

      // Paddle handle
      ctx.fillStyle = '#b45309'; // Natural wood handle
      ctx.fillRect(tx - 6, ty - padH / 2 - 14, 12, 14);

      // Red rubber paddle body
      const gradTop = ctx.createLinearGradient(tx, ty - padH / 2, tx, ty + padH / 2);
      gradTop.addColorStop(0, '#f43f5e');
      gradTop.addColorStop(1, '#be123c');
      ctx.fillStyle = gradTop;
      ctx.beginPath();
      ctx.roundRect(tx - padW / 2, ty - padH / 2, padW, padH, 10);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Name label
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 11px "Outfit", sans-serif';
      ctx.fillText(p2Nickname.substring(0, 10).toUpperCase(), tx, ty - padH / 2 - 18);

      // Bottom Paddle (Local Player / Royal Blue Tournament Rubber)
      const mx = (myPaddle.current.x / 100) * W;
      const my = (myPaddle.current.y / 100) * H;

      // Drop shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.roundRect(mx - padW / 2, my - padH / 2 + 5, padW, padH, 10);
      ctx.fill();

      // Paddle handle
      ctx.fillStyle = '#b45309';
      ctx.fillRect(mx - 6, my + padH / 2, 12, 14);

      // Blue rubber paddle body
      const gradBot = ctx.createLinearGradient(mx, my - padH / 2, mx, my + padH / 2);
      gradBot.addColorStop(0, '#38bdf8');
      gradBot.addColorStop(1, '#0284c7');
      ctx.fillStyle = gradBot;
      ctx.beginPath();
      ctx.roundRect(mx - padW / 2, my - padH / 2, padW, padH, 10);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // "YOU" Label
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 12px "Outfit", sans-serif';
      ctx.fillText('▼ YOU', mx, my + padH / 2 + 28);

      // 6. Goal Banner
      const activeScorer = scorerNameRef.current || scorerName;
      if (goalCooldown.current > 0 && activeScorer) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = '#fbbf24';
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 24;
        ctx.font = '900 52px "Outfit", sans-serif';
        ctx.fillText('POINT!', W / 2, H / 2 - 15);
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#ffffff';
        ctx.font = '700 20px "Outfit", sans-serif';
        ctx.fillText(`${activeScorer.toUpperCase()} +1`, W / 2, H / 2 + 28);
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
      canvas.removeEventListener('pointermove', handlePointer);
    };
  }, [bottomUid, topUid, isBotPlaying, isHost, p1Nickname, p2Nickname, onDispatchAction]);

  const p1Score = room.scores[bottomUid] || 0;
  const p2Score = room.scores[topUid] || 0;
  const targetWins = room.maxRounds || room.gameState?.targetScore || 5;

  return (
    <div className="w-full max-w-lg mx-auto flex flex-col items-center select-none gap-2 px-2">
      {/* Top Player (Opponent) Score Header */}
      <div className="w-full flex items-center justify-between px-4 py-2 rounded-2xl bg-slate-900/90 border border-white/10 text-xs font-mono font-bold shadow-md">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-rose-500 shadow-[0_0_8px_#f43f5e] animate-pulse" />
          <span className="text-white font-['Outfit'] font-black text-sm">{p2Nickname}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400">SCORE</span>
          <span className="text-2xl font-black text-rose-400 font-['Outfit']">{p2Score}</span>
        </div>
      </div>

      {/* Target Points Goal Banner */}
      <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-[11px] font-mono text-emerald-300 font-bold">
        <Trophy className="w-3.5 h-3.5 text-amber-400" />
        <span>FIRST TO {targetWins} POINTS WINS</span>
      </div>

      {/* Tournament Table Canvas */}
      <div className="w-full aspect-[3/4] h-[55vh] min-h-[420px] max-h-[600px] rounded-3xl overflow-hidden shadow-2xl border-4 border-slate-800 relative bg-[#064e3b] cursor-pointer">
        <canvas
          ref={canvasRef}
          style={{ touchAction: 'none' }}
          className="w-full h-full block select-none"
        />
      </div>

      {/* Touch Buttons for Mobile Steer */}
      <div className="w-full grid grid-cols-2 gap-3 max-w-sm pt-1">
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            mobileButtons.current.left = true;
          }}
          onPointerUp={() => { mobileButtons.current.left = false; }}
          onPointerLeave={() => { mobileButtons.current.left = false; }}
          onPointerCancel={() => { mobileButtons.current.left = false; }}
          className="h-13 rounded-2xl bg-slate-900 border-2 border-cyan-500/40 active:bg-cyan-600/30 active:scale-95 text-xs font-black font-mono text-cyan-300 flex items-center justify-center gap-2 shadow-lg touch-manipulation cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5 text-cyan-400" />
          <span>SLIDE LEFT</span>
        </button>

        <button
          onPointerDown={(e) => {
            e.preventDefault();
            mobileButtons.current.right = true;
          }}
          onPointerUp={() => { mobileButtons.current.right = false; }}
          onPointerLeave={() => { mobileButtons.current.right = false; }}
          onPointerCancel={() => { mobileButtons.current.right = false; }}
          className="h-13 rounded-2xl bg-slate-900 border-2 border-cyan-500/40 active:bg-cyan-600/30 active:scale-95 text-xs font-black font-mono text-cyan-300 flex items-center justify-center gap-2 shadow-lg touch-manipulation cursor-pointer"
        >
          <span>SLIDE RIGHT</span>
          <ChevronRight className="w-5 h-5 text-cyan-400" />
        </button>
      </div>

      {/* Bottom Player (You) Score Footer */}
      <div className="w-full flex items-center justify-between px-4 py-2 rounded-2xl bg-slate-900/90 border border-white/10 text-xs font-mono font-bold shadow-md">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-cyan-400 shadow-[0_0_8px_#38bdf8] animate-pulse" />
          <span className="text-cyan-300 font-['Outfit'] font-black text-sm">{p1Nickname} (YOU)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400">SCORE</span>
          <span className="text-2xl font-black text-cyan-400 font-['Outfit']">{p1Score}</span>
        </div>
      </div>

      <p className="text-[11px] text-slate-400 font-mono text-center">
        👆 Touch & drag anywhere on your half to move paddle • Or use Arrow/WASD keys!
      </p>
    </div>
  );
};
