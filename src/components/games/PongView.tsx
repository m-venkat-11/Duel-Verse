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

  // Paddles in court pixels: W = 460, H = 640
  const W = 460;
  const H = 640;
  const PADDLE_W = 100;
  const PADDLE_H = 18;
  const BALL_R = 10;

  const myPaddleX = useRef<number>(W / 2);
  const oppPaddleX = useRef<number>(W / 2);
  const myPaddlePrevX = useRef<number>(W / 2);

  // Ball physics
  const ball = useRef({
    x: W / 2,
    y: H / 2,
    vx: (Math.random() > 0.5 ? 1 : -1) * 3.2,
    vy: 4.8,
    speed: 1.0
  });

  const goalCooldown = useRef(0);
  const lastNetworkDispatch = useRef(0);
  const keysDown = useRef<{ [key: string]: boolean }>({});
  const mobileButtons = useRef({ left: false, right: false });

  // Keyboard navigation
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
        oppPaddleX.current = (remote / 100) * W;
      } else if (remote && typeof remote.x === 'number') {
        oppPaddleX.current = (remote.x / 100) * W;
      }
    }
  }, [room.gameState?.paddles, isBotPlaying, bottomUid, topUid, playerUid]);

  // Main 60 FPS Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasMgr = new CanvasManager(canvas);
    const juice = new JuiceEngine(300);

    const PADDLE_BOTTOM_Y = H - 65;
    const PADDLE_TOP_Y = 65;

    const serve = (toBottom: boolean) => {
      ball.current.x = W / 2;
      ball.current.y = H / 2;
      ball.current.vx = (Math.random() > 0.5 ? 1 : -1) * (2.8 + Math.random() * 1.5);
      ball.current.vy = toBottom ? 4.8 : -4.8;
      ball.current.speed = 1.0;
      soundService.playCountdown(0);
    };

    // Instant 1-to-1 finger drag tracking
    const updatePointer = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const px = ((clientX - rect.left) / rect.width) * W;
      const py = ((clientY - rect.top) / rect.height) * H;

      // Local 2-Player support on same device:
      // If user touches top half (py < H / 2) in local practice, control top paddle!
      if (!isBotPlaying && !room.gameState?.paddles && py < H * 0.45) {
        oppPaddleX.current = Math.max(PADDLE_W / 2, Math.min(W - PADDLE_W / 2, px));
      } else {
        myPaddleX.current = Math.max(PADDLE_W / 2, Math.min(W - PADDLE_W / 2, px));
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      e.preventDefault();
      updatePointer(e.clientX, e.clientY);
    };

    const handlePointerDown = (e: PointerEvent) => {
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch {}
      updatePointer(e.clientX, e.clientY);
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);

    const update = (dt: number) => {
      juice.update(dt);
      const now = Date.now();

      // Keyboard & Mobile Button movement
      const isLeft = keysDown.current['arrowleft'] || keysDown.current['a'] || mobileButtons.current.left;
      const isRight = keysDown.current['arrowright'] || keysDown.current['d'] || mobileButtons.current.right;
      const keySpeed = 380 * dt;

      if (isLeft) myPaddleX.current = Math.max(PADDLE_W / 2, myPaddleX.current - keySpeed);
      if (isRight) myPaddleX.current = Math.min(W - PADDLE_W / 2, myPaddleX.current + keySpeed);

      const paddleVx = myPaddleX.current - myPaddlePrevX.current;
      myPaddlePrevX.current = myPaddleX.current;

      // Throttled network broadcast (20 Hz)
      if (now - lastNetworkDispatch.current > 48) {
        lastNetworkDispatch.current = now;
        onDispatchAction('PONG_PADDLE', {
          xPos: Math.round((myPaddleX.current / W) * 100)
        });
      }

      // Goal Cooldown Pause
      if (goalCooldown.current > 0) {
        goalCooldown.current -= dt;
        if (goalCooldown.current <= 0) {
          scorerBannerRef.current = null;
          setScorerBanner(null);
        }
        return;
      }

      // CyberBot AI: Competitive, natural, humanly beatable
      if (isBotPlaying) {
        const b = ball.current;
        if (b.vy < 0) {
          // Ball moving towards bot: smoothly track ball with human-like lag
          const botSpeed = 340 * dt;
          const targetX = b.x;
          if (oppPaddleX.current < targetX - 6) {
            oppPaddleX.current = Math.min(W - PADDLE_W / 2, oppPaddleX.current + botSpeed);
          } else if (oppPaddleX.current > targetX + 6) {
            oppPaddleX.current = Math.max(PADDLE_W / 2, oppPaddleX.current - botSpeed);
          }
        } else {
          // Ball moving away: gently return to center table
          const centerSpeed = 120 * dt;
          if (oppPaddleX.current < W / 2 - 10) oppPaddleX.current += centerSpeed;
          else if (oppPaddleX.current > W / 2 + 10) oppPaddleX.current -= centerSpeed;
        }
      }

      // Ball Physics
      const b = ball.current;
      const prevY = b.y;
      const spd = b.speed;
      b.x += b.vx * spd * dt * 60;
      b.y += b.vy * spd * dt * 60;

      // Side Table Rubber Rails Bounce
      if (b.x <= BALL_R + 8) {
        b.x = BALL_R + 8;
        b.vx = Math.abs(b.vx);
        soundService.playImpact(0.8);
        juice.emitSparks(b.x, b.y, 6, '#38bdf8', '#0ea5e9', 2);
      } else if (b.x >= W - BALL_R - 8) {
        b.x = W - BALL_R - 8;
        b.vx = -Math.abs(b.vx);
        soundService.playImpact(0.8);
        juice.emitSparks(b.x, b.y, 6, '#38bdf8', '#0ea5e9', 2);
      }

      // Continuous Bottom Paddle Collision Check (YOU)
      if (prevY <= PADDLE_BOTTOM_Y && b.y >= PADDLE_BOTTOM_Y && b.vy > 0) {
        const halfW = PADDLE_W / 2 + BALL_R;
        if (Math.abs(b.x - myPaddleX.current) <= halfW) {
          b.y = PADDLE_BOTTOM_Y - 1;
          b.vy = -Math.abs(b.vy);

          // Angle deflection based on hit location (-1 on left edge, +1 on right edge)
          const offset = (b.x - myPaddleX.current) / (PADDLE_W / 2);
          b.vx = offset * 5.2 + (paddleVx * 0.25);
          b.speed = Math.min(1.9, b.speed * 1.04);

          soundService.playImpact(1.2);
          juice.addTrauma(0.2);
          juice.emitSparks(b.x, PADDLE_BOTTOM_Y, 12, '#38bdf8', '#0284c7', 3.5);
          if (navigator.vibrate) navigator.vibrate(15);
        }
      }

      // Continuous Top Paddle Collision Check (OPPONENT / BOT)
      if (prevY >= PADDLE_TOP_Y && b.y <= PADDLE_TOP_Y && b.vy < 0) {
        const halfW = PADDLE_W / 2 + BALL_R;
        if (Math.abs(b.x - oppPaddleX.current) <= halfW) {
          b.y = PADDLE_TOP_Y + 1;
          b.vy = Math.abs(b.vy);

          const offset = (b.x - oppPaddleX.current) / (PADDLE_W / 2);
          b.vx = offset * 5.2;
          b.speed = Math.min(1.9, b.speed * 1.04);

          soundService.playImpact(1.2);
          juice.addTrauma(0.2);
          juice.emitSparks(b.x, PADDLE_TOP_Y, 12, '#f43f5e', '#be123c', 3.5);
        }
      }

      // Goal Scored Detection
      // Top Goal: YOU (Bottom) Scored!
      if (b.y < -5) {
        goalCooldown.current = 1.0;
        const banner = { name: p1Nickname, isP1: true };
        scorerBannerRef.current = banner;
        setScorerBanner(banner);
        soundService.playGoal();
        juice.addTrauma(0.5);
        juice.emitExplosion(b.x, 20, 35);

        onDispatchAction('PONG_GOAL', { scorerUid: bottomUid, actingUid: playerUid });
        serve(false);
      }

      // Bottom Goal: OPPONENT (Top) Scored!
      if (b.y > H + 5) {
        goalCooldown.current = 1.0;
        const banner = { name: p2Nickname, isP1: false };
        scorerBannerRef.current = banner;
        setScorerBanner(banner);
        soundService.playGoal();
        juice.addTrauma(0.5);
        juice.emitExplosion(b.x, H - 20, 35);

        onDispatchAction('PONG_GOAL', { scorerUid: topUid, actingUid: playerUid });
        serve(true);
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

      // 1. Classic Dark Green Tournament Table Tennis Surface
      const tableGrad = ctx.createLinearGradient(0, 0, 0, H);
      tableGrad.addColorStop(0, '#064e3b');
      tableGrad.addColorStop(0.5, '#047857');
      tableGrad.addColorStop(1, '#064e3b');
      ctx.fillStyle = tableGrad;
      ctx.fillRect(0, 0, W, H);

      // Dark Outer Bevel
      ctx.strokeStyle = '#022c22';
      ctx.lineWidth = 14;
      ctx.strokeRect(7, 7, W - 14, H - 14);

      // White Tournament Border Lines
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.strokeRect(16, 16, W - 32, H - 32);

      // Center Longitudinal Line
      ctx.beginPath();
      ctx.moveTo(W / 2, 16);
      ctx.lineTo(W / 2, H - 16);
      ctx.stroke();

      // Center 3D Net with Realistic Drop Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.fillRect(8, H / 2 + 3, W - 16, 5);

      // White Net mesh line
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(10, H / 2 - 2, W - 20, 4);

      // Metal net posts
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(6, H / 2 - 8, 8, 16);
      ctx.fillRect(W - 14, H / 2 - 8, 8, 16);

      // 2. Giant Floor Scores (Painted on table felt)
      const p1Score = room.scores[bottomUid] || 0;
      const p2Score = room.scores[topUid] || 0;
      ctx.font = '900 84px "Outfit", sans-serif';
      ctx.textAlign = 'center';

      // Top Score
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.fillText(String(p2Score), W / 2, H / 2 - 60);

      // Bottom Score
      ctx.fillText(String(p1Score), W / 2, H / 2 + 120);

      // 3. Render 3D White Table Tennis Ball
      const bx = ball.current.x;
      const by = ball.current.y;

      // Ball shadow directly beneath
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.ellipse(bx, by + 5, BALL_R * 1.1, BALL_R * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();

      // White 3D Sphere
      const ballShade = ctx.createRadialGradient(bx - 3, by - 3, 2, bx, by, BALL_R);
      ballShade.addColorStop(0, '#ffffff');
      ballShade.addColorStop(0.75, '#f8fafc');
      ballShade.addColorStop(1, '#cbd5e1');
      ctx.fillStyle = ballShade;
      ctx.beginPath();
      ctx.arc(bx, by, BALL_R, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1;
      ctx.stroke();

      // 4. Render Paddles
      // Top Paddle (Opponent / Crimson Red Rubber)
      const tx = oppPaddleX.current;
      const ty = PADDLE_TOP_Y;

      // Drop shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.roundRect(tx - PADDLE_W / 2, ty - PADDLE_H / 2 + 4, PADDLE_W, PADDLE_H, 8);
      ctx.fill();

      // Wood handle
      ctx.fillStyle = '#b45309';
      ctx.fillRect(tx - 6, ty - PADDLE_H / 2 - 12, 12, 12);

      // Red rubber body
      const gradTop = ctx.createLinearGradient(tx, ty - PADDLE_H / 2, tx, ty + PADDLE_H / 2);
      gradTop.addColorStop(0, '#f43f5e');
      gradTop.addColorStop(1, '#be123c');
      ctx.fillStyle = gradTop;
      ctx.beginPath();
      ctx.roundRect(tx - PADDLE_W / 2, ty - PADDLE_H / 2, PADDLE_W, PADDLE_H, 8);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 11px "Outfit", sans-serif';
      ctx.fillText(p2Nickname.substring(0, 10).toUpperCase(), tx, ty - PADDLE_H / 2 - 16);

      // Bottom Paddle (YOU / Royal Blue & Cyan Rubber)
      const mx = myPaddleX.current;
      const my = PADDLE_BOTTOM_Y;

      // Drop shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.roundRect(mx - PADDLE_W / 2, my - PADDLE_H / 2 + 4, PADDLE_W, PADDLE_H, 8);
      ctx.fill();

      // Wood handle
      ctx.fillStyle = '#b45309';
      ctx.fillRect(mx - 6, my + PADDLE_H / 2, 12, 12);

      // Blue rubber body
      const gradBot = ctx.createLinearGradient(mx, my - PADDLE_H / 2, mx, my + PADDLE_H / 2);
      gradBot.addColorStop(0, '#38bdf8');
      gradBot.addColorStop(1, '#0284c7');
      ctx.fillStyle = gradBot;
      ctx.beginPath();
      ctx.roundRect(mx - PADDLE_W / 2, my - PADDLE_H / 2, PADDLE_W, PADDLE_H, 8);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 11px "Outfit", sans-serif';
      ctx.fillText('▼ YOU', mx, my + PADDLE_H / 2 + 24);

      // 5. Goal Celebration Overlay
      const banner = scorerBannerRef.current || scorerBanner;
      if (goalCooldown.current > 0 && banner) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = banner.isP1 ? '#38bdf8' : '#f43f5e';
        ctx.shadowColor = banner.isP1 ? '#0284c7' : '#be123c';
        ctx.shadowBlur = 18;
        ctx.font = '900 48px "Outfit", sans-serif';
        ctx.fillText('POINT!', W / 2, H / 2 - 10);
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#ffffff';
        ctx.font = '700 18px "Outfit", sans-serif';
        ctx.fillText(`${banner.name.toUpperCase()} +1`, W / 2, H / 2 + 26);
      }

      ctx.restore();
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

      {/* Tournament Table Tennis Court - 1:1 Direct Tracking */}
      <div className="w-full h-[52vh] min-h-[340px] max-h-[500px] aspect-[460/640] rounded-3xl overflow-hidden shadow-2xl border-4 border-slate-800 relative bg-[#064e3b] cursor-pointer">
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
        👆 Drag finger anywhere on court to glide paddle • Deflect with angles to score!
      </p>
    </div>
  );
};
