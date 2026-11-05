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

  const [scorerBanner, setScorerBanner] = useState<{ name: string; isP1: boolean } | null>(null);
  const scorerBannerRef = useRef<{ name: string; isP1: boolean } | null>(null);

  // Paddles in court percentage (0 to 100)
  // Local Player is always at the bottom
  const myPaddle = useRef({ x: 50, y: 88, vx: 0, targetX: 50 });
  const oppPaddle = useRef({ x: 50, y: 12, vx: 0, targetX: 50 });

  // Ball physics state
  const ball = useRef({
    x: 50,
    y: 50,
    vx: (Math.random() > 0.5 ? 1 : -1) * 0.42,
    vy: 0.48,
    speed: 1.0,
    spin: 0,
    arcHeight: 0
  });

  const goalCooldown = useRef(0);
  const lastNetworkDispatch = useRef(0);
  const keysDown = useRef<{ [key: string]: boolean }>({});
  const mobileButtons = useRef({ left: false, right: false });

  // Keyboard navigation (WASD / Arrows)
  useEffect(() => {
    const handleDown = (e: KeyboardEvent) => {
      keysDown.current[e.key.toLowerCase()] = true;
      if (['arrowleft', 'arrowright', 'a', 'd'].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
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

  // Sync opponent paddle in 2P network rooms
  useEffect(() => {
    if (!isBotPlaying && room.gameState?.paddles) {
      const oppUid = bottomUid === playerUid ? topUid : bottomUid;
      const remote = room.gameState.paddles[oppUid];
      if (typeof remote === 'number') {
        oppPaddle.current.targetX = remote;
      } else if (remote && typeof remote.x === 'number') {
        oppPaddle.current.targetX = remote.x;
      }
    }
  }, [room.gameState?.paddles, isBotPlaying, bottomUid, topUid, playerUid]);

  // Main 60 FPS Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasMgr = new CanvasManager(canvas);
    const juice = new JuiceEngine(350);

    const W = 480;
    const H = 680;
    const PADDLE_W = 24; // % court width
    const PADDLE_H = 3.8; // % court height
    const PADDLE_HALF_W = PADDLE_W / 2;
    const PADDLE_HALF_H = PADDLE_H / 2;

    const serve = (toBottom: boolean) => {
      ball.current.x = 50;
      ball.current.y = 50;
      ball.current.vx = (Math.random() > 0.5 ? 1 : -1) * (0.34 + Math.random() * 0.16);
      ball.current.vy = toBottom ? 0.46 : -0.46;
      ball.current.speed = 1.0;
      ball.current.spin = 0;
      ball.current.arcHeight = 0;
      soundService.playCountdown(0);
    };

    // Pre-allocated particle trail
    const TRAIL_MAX = 12;
    const trail: Array<{ x: number; y: number; alpha: number }> = [];
    for (let i = 0; i < TRAIL_MAX; i++) trail.push({ x: 50, y: 50, alpha: 0 });

    // Direct 1-to-1 Touch drag tracking
    const handlePointerMove = (e: PointerEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / rect.width) * 100;
      myPaddle.current.targetX = Math.max(PADDLE_HALF_W, Math.min(100 - PADDLE_HALF_W, px));
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
      const now = Date.now();
      const prevMyX = myPaddle.current.x;

      // 1. Controls (Buttons / Keyboard)
      const isLeft = keysDown.current['arrowleft'] || keysDown.current['a'] || mobileButtons.current.left;
      const isRight = keysDown.current['arrowright'] || keysDown.current['d'] || mobileButtons.current.right;

      if (isLeft) {
        myPaddle.current.targetX = Math.max(PADDLE_HALF_W, myPaddle.current.targetX - 70 * dt);
      }
      if (isRight) {
        myPaddle.current.targetX = Math.min(100 - PADDLE_HALF_W, myPaddle.current.targetX + 70 * dt);
      }

      // Smooth interpolation for local paddle
      myPaddle.current.x += (myPaddle.current.targetX - myPaddle.current.x) * 0.45;
      myPaddle.current.vx = myPaddle.current.x - prevMyX;

      // Throttled network broadcast (20 Hz)
      if (now - lastNetworkDispatch.current > 48) {
        lastNetworkDispatch.current = now;
        onDispatchAction('PONG_PADDLE', {
          xPos: Math.round(myPaddle.current.x)
        });
      }

      // 2. Goal Cooldown Pause
      if (goalCooldown.current > 0) {
        goalCooldown.current -= dt;
        if (goalCooldown.current <= 0) {
          scorerBannerRef.current = null;
          setScorerBanner(null);
        }
        return;
      }

      // 3. CyberBot AI (Sleek Play Store Standard: humanly competitive and beatable)
      if (isBotPlaying) {
        const b = ball.current;
        const prevOppX = oppPaddle.current.x;

        if (b.vy < 0) {
          // Ball moving towards bot: anticipate with slight human reaction lag
          const reactionOffset = Math.sin(now * 0.004) * 4;
          const target = b.x + reactionOffset;
          oppPaddle.current.targetX += (target - oppPaddle.current.targetX) * 0.14;
        } else {
          // Ball moving away: return towards center table defense position
          oppPaddle.current.targetX += (50 - oppPaddle.current.targetX) * 0.06;
        }

        oppPaddle.current.targetX = Math.max(PADDLE_HALF_W, Math.min(100 - PADDLE_HALF_W, oppPaddle.current.targetX));
        oppPaddle.current.x += (oppPaddle.current.targetX - oppPaddle.current.x) * 0.35;
        oppPaddle.current.vx = oppPaddle.current.x - prevOppX;
      } else {
        // Network opponent smooth interpolation
        oppPaddle.current.x += (oppPaddle.current.targetX - oppPaddle.current.x) * 0.35;
      }

      // 4. Ball Physics with Spin and Table Arc
      const spd = ball.current.speed;
      ball.current.x += (ball.current.vx + ball.current.spin * 0.12) * spd * dt * 60;
      ball.current.y += ball.current.vy * spd * dt * 60;
      ball.current.spin *= 0.985;

      // Realistic 3D table bounce arc (ball simulates height off table)
      const distFromNet = Math.abs(ball.current.y - 50) / 50; // 0 at net, 1 at paddle
      ball.current.arcHeight = Math.sin(distFromNet * Math.PI) * 12;

      // Side Table Bounce Rails
      if (ball.current.x <= 3.8) {
        ball.current.x = 3.8;
        ball.current.vx = Math.abs(ball.current.vx);
        juice.playSound('ricochet');
        juice.addTrauma(0.12);
        juice.emitSparks((ball.current.x / 100) * W, (ball.current.y / 100) * H, 8, '#38bdf8', '#0ea5e9', 3);
      } else if (ball.current.x >= 96.2) {
        ball.current.x = 96.2;
        ball.current.vx = -Math.abs(ball.current.vx);
        juice.playSound('ricochet');
        juice.addTrauma(0.12);
        juice.emitSparks((ball.current.x / 100) * W, (ball.current.y / 100) * H, 8, '#38bdf8', '#0ea5e9', 3);
      }

      // 5. Paddle Collisions
      const myPad = myPaddle.current;
      const bY = ball.current.y;
      const bX = ball.current.x;

      // Bottom Paddle (YOU) Strike Check
      if (
        bY >= myPad.y - PADDLE_HALF_H - 1.2 &&
        bY <= myPad.y + PADDLE_HALF_H + 1.2 &&
        ball.current.vy > 0
      ) {
        const diffX = bX - myPad.x;
        if (Math.abs(diffX) <= PADDLE_HALF_W + 3) {
          ball.current.y = myPad.y - PADDLE_HALF_H - 1.2;
          ball.current.vy = -Math.abs(ball.current.vy);

          // Angle deflection based on hit location
          const normOffset = diffX / PADDLE_HALF_W;
          ball.current.vx = normOffset * 0.72 + myPad.vx * 0.18;
          ball.current.spin = myPad.vx * 0.35;
          ball.current.speed = Math.min(2.1, ball.current.speed * 1.05);

          soundService.playImpact(1.15);
          juice.addTrauma(0.22);
          juice.emitSparks((bX / 100) * W, (bY / 100) * H, 14, '#38bdf8', '#0284c7', 4);
        }
      }

      // Top Paddle (OPPONENT / BOT) Strike Check
      const opPad = oppPaddle.current;
      if (
        bY <= opPad.y + PADDLE_HALF_H + 1.2 &&
        bY >= opPad.y - PADDLE_HALF_H - 1.2 &&
        ball.current.vy < 0
      ) {
        const diffX = bX - opPad.x;
        if (Math.abs(diffX) <= PADDLE_HALF_W + 3) {
          ball.current.y = opPad.y + PADDLE_HALF_H + 1.2;
          ball.current.vy = Math.abs(ball.current.vy);

          const normOffset = diffX / PADDLE_HALF_W;
          ball.current.vx = normOffset * 0.72 + opPad.vx * 0.18;
          ball.current.spin = opPad.vx * 0.35;
          ball.current.speed = Math.min(2.1, ball.current.speed * 1.05);

          soundService.playImpact(1.15);
          juice.addTrauma(0.22);
          juice.emitSparks((bX / 100) * W, (bY / 100) * H, 14, '#f43f5e', '#be123c', 4);
        }
      }

      // 6. Goal Scoring Detection
      // Top Baseline Passed -> YOU (Bottom) Scores!
      if (ball.current.y <= 1.0) {
        goalCooldown.current = 1.4;
        const banner = { name: p1Nickname, isP1: true };
        scorerBannerRef.current = banner;
        setScorerBanner(banner);
        soundService.playGoal();
        juice.addTrauma(0.6);
        juice.emitExplosion((ball.current.x / 100) * W, 20, 40);

        onDispatchAction('PONG_GOAL', { scorerUid: bottomUid, actingUid: playerUid });
        serve(false);
      }

      // Bottom Baseline Passed -> OPPONENT (Top) Scores!
      if (ball.current.y >= 99.0) {
        goalCooldown.current = 1.4;
        const banner = { name: p2Nickname, isP1: false };
        scorerBannerRef.current = banner;
        setScorerBanner(banner);
        soundService.playGoal();
        juice.addTrauma(0.6);
        juice.emitExplosion((ball.current.x / 100) * W, H - 20, 40);

        onDispatchAction('PONG_GOAL', { scorerUid: topUid, actingUid: playerUid });
        serve(true);
      }

      // 7. Update Particle Trail
      trail.unshift({ x: ball.current.x, y: ball.current.y, alpha: 1.0 });
      if (trail.length > TRAIL_MAX) trail.pop();
      for (const t of trail) t.alpha *= 0.84;
    };

    const render = () => {
      const ctx = canvasMgr.ctx;
      ctx.clearRect(0, 0, canvasMgr.width, canvasMgr.height);
      ctx.save();
      ctx.translate(juice.offsetX, juice.offsetY);

      const scaleX = canvasMgr.width / W;
      const scaleY = canvasMgr.height / H;
      ctx.scale(scaleX, scaleY);

      // 1. Play Store Classic Emerald Tournament Table
      const tableGrad = ctx.createLinearGradient(0, 0, 0, H);
      tableGrad.addColorStop(0, '#064e3b');
      tableGrad.addColorStop(0.5, '#047857');
      tableGrad.addColorStop(1, '#064e3b');
      ctx.fillStyle = tableGrad;
      ctx.fillRect(0, 0, W, H);

      // Dark Wood Table Bevel Outer Frame
      ctx.strokeStyle = '#022c22';
      ctx.lineWidth = 12;
      ctx.strokeRect(6, 6, W - 12, H - 12);

      // White Tournament Border Lines
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.strokeRect(16, 16, W - 32, H - 32);

      // White Center Longitudinal Service Line
      ctx.beginPath();
      ctx.moveTo(W / 2, 16);
      ctx.lineTo(W / 2, H - 16);
      ctx.stroke();

      // Center 3D Net with Realistic Drop Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(4, H / 2 + 3, W - 8, 6);

      // Net body
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.fillRect(6, H / 2 - 2, W - 12, 4);

      // Net metal posts on table edges
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(2, H / 2 - 9, 8, 18);
      ctx.fillRect(W - 10, H / 2 - 9, 8, 18);

      // 2. Play Store Large Floor Score Numerals (Painted onto table)
      const p1Score = room.scores[bottomUid] || 0;
      const p2Score = room.scores[topUid] || 0;
      ctx.font = '900 88px "Outfit", sans-serif';
      ctx.textAlign = 'center';

      // Top Player Floor Score
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.fillText(String(p2Score), W / 2, H / 2 - 60);

      // Bottom Player Floor Score
      ctx.fillText(String(p1Score), W / 2, H / 2 + 120);

      // 3. Render 3D White Table Tennis Ball with Height Shadow
      const bx = (ball.current.x / 100) * W;
      const by = (ball.current.y / 100) * H;
      const ballRadius = 12;
      const arc = ball.current.arcHeight || 0;

      // Drop shadow on table (contracts and offsets as ball rises)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
      ctx.beginPath();
      ctx.ellipse(
        bx,
        by + 6 + arc * 0.4,
        Math.max(6, ballRadius * 1.05 - arc * 0.2),
        Math.max(3, ballRadius * 0.55 - arc * 0.1),
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();

      // Ball Trail
      for (const pt of trail) {
        if (pt.alpha > 0.05) {
          ctx.fillStyle = `rgba(255, 255, 255, ${pt.alpha * 0.32})`;
          ctx.beginPath();
          ctx.arc((pt.x / 100) * W, (pt.y / 100) * H - arc, ballRadius * pt.alpha * 0.75, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // White Sphere with Radial Specular Highlight
      const ballShade = ctx.createRadialGradient(bx - 3, by - 3 - arc, 2, bx, by - arc, ballRadius);
      ballShade.addColorStop(0, '#ffffff');
      ballShade.addColorStop(0.75, '#f1f5f9');
      ballShade.addColorStop(1, '#cbd5e1');
      ctx.fillStyle = ballShade;
      ctx.beginPath();
      ctx.arc(bx, by - arc, ballRadius, 0, Math.PI * 2);
      ctx.fill();

      // Subtle ball rim
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1;
      ctx.stroke();

      // 4. Render Paddles (Authentic Play Store Table Tennis Styling)
      const padW = (PADDLE_W / 100) * W;
      const padH = (PADDLE_H / 100) * H;

      // Top Paddle (Opponent / Crimson Red Rubber)
      const tx = (oppPaddle.current.x / 100) * W;
      const ty = (oppPaddle.current.y / 100) * H;

      // Drop shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.roundRect(tx - padW / 2, ty - padH / 2 + 5, padW, padH, 8);
      ctx.fill();

      // Paddle wood handle
      ctx.fillStyle = '#b45309';
      ctx.fillRect(tx - 6, ty - padH / 2 - 13, 12, 13);

      // Red rubber body
      const gradTop = ctx.createLinearGradient(tx, ty - padH / 2, tx, ty + padH / 2);
      gradTop.addColorStop(0, '#f43f5e');
      gradTop.addColorStop(1, '#be123c');
      ctx.fillStyle = gradTop;
      ctx.beginPath();
      ctx.roundRect(tx - padW / 2, ty - padH / 2, padW, padH, 8);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Top Paddle Label
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 11px "Outfit", sans-serif';
      ctx.fillText(p2Nickname.substring(0, 10).toUpperCase(), tx, ty - padH / 2 - 16);

      // Bottom Paddle (YOU / Royal Blue & Cyan Rubber)
      const mx = (myPaddle.current.x / 100) * W;
      const my = (myPaddle.current.y / 100) * H;

      // Drop shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.roundRect(mx - padW / 2, my - padH / 2 + 5, padW, padH, 8);
      ctx.fill();

      // Handle
      ctx.fillStyle = '#b45309';
      ctx.fillRect(mx - 6, my + padH / 2, 12, 13);

      // Blue rubber body
      const gradBot = ctx.createLinearGradient(mx, my - padH / 2, mx, my + padH / 2);
      gradBot.addColorStop(0, '#38bdf8');
      gradBot.addColorStop(1, '#0284c7');
      ctx.fillStyle = gradBot;
      ctx.beginPath();
      ctx.roundRect(mx - padW / 2, my - padH / 2, padW, padH, 8);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // "YOU" Label
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 12px "Outfit", sans-serif';
      ctx.fillText('▼ YOU', mx, my + padH / 2 + 25);

      // 5. Goal Celebration Overlay
      const banner = scorerBannerRef.current || scorerBanner;
      if (goalCooldown.current > 0 && banner) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = banner.isP1 ? '#38bdf8' : '#f43f5e';
        ctx.shadowColor = banner.isP1 ? '#0284c7' : '#be123c';
        ctx.shadowBlur = 20;
        ctx.font = '900 48px "Outfit", sans-serif';
        ctx.fillText('POINT!', W / 2, H / 2 - 12);
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#ffffff';
        ctx.font = '700 18px "Outfit", sans-serif';
        ctx.fillText(`${banner.name.toUpperCase()} +1`, W / 2, H / 2 + 26);
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
    };
  }, [bottomUid, topUid, isBotPlaying, isHost, p1Nickname, p2Nickname, onDispatchAction]);

  const p1Score = room.scores[bottomUid] || 0;
  const p2Score = room.scores[topUid] || 0;
  const targetWins = room.maxRounds || room.gameState?.targetScore || 5;

  return (
    <div className="w-full max-w-md mx-auto flex flex-col items-center select-none gap-2 px-1">
      {/* Sleek Match Bar */}
      <div className="w-full flex items-center justify-between px-3 py-1.5 rounded-2xl bg-slate-900/90 border border-white/10 text-xs font-mono font-bold shadow-md">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
          <span className="text-rose-300 font-['Outfit'] font-black truncate max-w-[100px]">{p2Nickname}</span>
          <span className="text-rose-400 font-black text-base">{p2Score}</span>
        </div>

        <div className="flex items-center gap-1 text-[11px] text-amber-400 font-bold px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30">
          <Trophy className="w-3 h-3" />
          <span>TO {targetWins}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-cyan-400 font-black text-base">{p1Score}</span>
          <span className="text-cyan-300 font-['Outfit'] font-black truncate max-w-[100px]">{p1Nickname} (YOU)</span>
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
        </div>
      </div>

      {/* Tournament Table Tennis Canvas - Fits screen perfectly without vertical scroll */}
      <div className="w-full h-[52vh] min-h-[340px] max-h-[500px] aspect-[480/680] rounded-3xl overflow-hidden shadow-2xl border-4 border-slate-800 relative bg-[#064e3b] cursor-pointer">
        <canvas
          ref={canvasRef}
          style={{ touchAction: 'none' }}
          className="w-full h-full block select-none"
        />
      </div>

      {/* Quick Mobile Slide Buttons */}
      <div className="w-full grid grid-cols-2 gap-2.5 max-w-sm pt-0.5">
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            mobileButtons.current.left = true;
          }}
          onPointerUp={() => { mobileButtons.current.left = false; }}
          onPointerLeave={() => { mobileButtons.current.left = false; }}
          onPointerCancel={() => { mobileButtons.current.left = false; }}
          className="h-11 rounded-xl bg-slate-900 border-2 border-cyan-500/40 active:bg-cyan-600/30 active:scale-95 text-xs font-black font-mono text-cyan-300 flex items-center justify-center gap-1.5 shadow-md touch-manipulation cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4 text-cyan-400" />
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
          className="h-11 rounded-xl bg-slate-900 border-2 border-cyan-500/40 active:bg-cyan-600/30 active:scale-95 text-xs font-black font-mono text-cyan-300 flex items-center justify-center gap-1.5 shadow-md touch-manipulation cursor-pointer"
        >
          <span>SLIDE RIGHT</span>
          <ChevronRight className="w-4 h-4 text-cyan-400" />
        </button>
      </div>

      <p className="text-[10px] text-slate-400 font-mono text-center">
        👆 Touch & drag paddle directly • Or tap buttons / Arrow keys!
      </p>
    </div>
  );
};
