import React, { useEffect, useRef, useState } from 'react';
import type { AuthoritativeRoomState } from '../../types/room';
import { GameLoop } from '../../engine/core/GameLoop';
import { CanvasManager } from '../../engine/core/CanvasManager';
import { JuiceEngine } from '../../engine/core/JuiceEngine';
import { soundService } from '../../services/sound';
import { Trophy, ChevronLeft, ChevronRight, Zap } from 'lucide-react';

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

  // Arena Dimensions
  const W = 460;
  const H = 640;
  const PADDLE_R = 34; // Circular tactile mallet radius
  const BALL_R = 11;

  // Full 2D Mallet Positions (Not locked to 1D horizontal line!)
  const myPaddle = useRef({
    x: W / 2,
    y: H - 90,
    vx: 0,
    vy: 0,
    targetX: W / 2,
    targetY: H - 90
  });

  const oppPaddle = useRef({
    x: W / 2,
    y: 90,
    vx: 0,
    vy: 0,
    targetX: W / 2,
    targetY: 90
  });

  // Ball Physics
  const ball = useRef({
    x: W / 2,
    y: H / 2,
    vx: (Math.random() > 0.5 ? 1 : -1) * 3.5,
    vy: 5.2,
    speed: 1.0
  });

  const goalCooldown = useRef(0);
  const lastNetworkDispatch = useRef(0);
  const keysDown = useRef<{ [key: string]: boolean }>({});
  const mobileButtons = useRef({ left: false, right: false, smash: false });

  // Keyboard navigation
  useEffect(() => {
    const handleDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keysDown.current[k] = true;
      if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's', ' '].includes(k)) {
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

  // Sync opponent paddle in 2P network rooms (supports 2D X and Y!)
  useEffect(() => {
    if (!isBotPlaying && room.gameState?.paddles) {
      const oppUid = bottomUid === playerUid ? topUid : bottomUid;
      const remote = room.gameState.paddles[oppUid];
      if (typeof remote === 'number') {
        oppPaddle.current.targetX = (remote / 100) * W;
      } else if (remote && typeof remote.x === 'number') {
        oppPaddle.current.targetX = (remote.x / 100) * W;
        if (typeof remote.y === 'number') {
          oppPaddle.current.targetY = (remote.y / 100) * H;
        }
      }
    }
  }, [room.gameState?.paddles, isBotPlaying, bottomUid, topUid, playerUid]);

  // Main 60 FPS Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasMgr = new CanvasManager(canvas);
    const juice = new JuiceEngine(350);

    const serve = (toBottom: boolean) => {
      ball.current.x = W / 2;
      ball.current.y = H / 2;
      ball.current.vx = (Math.random() > 0.5 ? 1 : -1) * (2.8 + Math.random() * 1.8);
      ball.current.vy = toBottom ? 5.2 : -5.2;
      ball.current.speed = 1.0;
      soundService.playCountdown(0);
    };

    // Full 2D Touch Drag: Follows finger anywhere in player's half of the court!
    const updatePointer = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const px = ((clientX - rect.left) / rect.width) * W;
      const py = ((clientY - rect.top) / rect.height) * H;

      // Local 2-Player on same device:
      // Touching top half controls top mallet!
      if (!isBotPlaying && !room.gameState?.paddles && py < H * 0.45) {
        oppPaddle.current.targetX = Math.max(PADDLE_R + 10, Math.min(W - PADDLE_R - 10, px));
        oppPaddle.current.targetY = Math.max(PADDLE_R + 10, Math.min(H / 2 - 30, py));
      } else {
        // Bottom player: full 2D movement in bottom half!
        myPaddle.current.targetX = Math.max(PADDLE_R + 10, Math.min(W - PADDLE_R - 10, px));
        myPaddle.current.targetY = Math.max(H / 2 + 30, Math.min(H - PADDLE_R - 10, py));
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

      // Keyboard & Mobile Button movement (2D Controls)
      const isLeft = keysDown.current['arrowleft'] || keysDown.current['a'] || mobileButtons.current.left;
      const isRight = keysDown.current['arrowright'] || keysDown.current['d'] || mobileButtons.current.right;
      const isUp = keysDown.current['arrowup'] || keysDown.current['w'] || mobileButtons.current.smash;
      const isDown = keysDown.current['arrowdown'] || keysDown.current['s'];
      const keySpeed = 440 * dt;

      if (isLeft) myPaddle.current.targetX = Math.max(PADDLE_R + 10, myPaddle.current.targetX - keySpeed);
      if (isRight) myPaddle.current.targetX = Math.min(W - PADDLE_R - 10, myPaddle.current.targetX + keySpeed);
      if (isUp) myPaddle.current.targetY = Math.max(H / 2 + 30, myPaddle.current.targetY - keySpeed);
      if (isDown) myPaddle.current.targetY = Math.min(H - PADDLE_R - 10, myPaddle.current.targetY + keySpeed);

      // Instantaneous 2D tracking with velocity computation
      const prevMyX = myPaddle.current.x;
      const prevMyY = myPaddle.current.y;
      myPaddle.current.x = myPaddle.current.targetX;
      myPaddle.current.y = myPaddle.current.targetY;
      myPaddle.current.vx = (myPaddle.current.x - prevMyX);
      myPaddle.current.vy = (myPaddle.current.y - prevMyY);

      // Throttled network broadcast (20 Hz)
      if (now - lastNetworkDispatch.current > 48) {
        lastNetworkDispatch.current = now;
        onDispatchAction('PONG_PADDLE', {
          xPos: Math.round((myPaddle.current.x / W) * 100),
          yPos: Math.round((myPaddle.current.y / H) * 100)
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

      // CyberBot AI: Competitive 2D movement (Defends & Smashes forward!)
      if (isBotPlaying) {
        const b = ball.current;
        const prevOppX = oppPaddle.current.x;
        const prevOppY = oppPaddle.current.y;

        if (b.vy < 0) {
          // Ball moving towards bot: bot advances forward in 2D to strike!
          const botSpeedX = 360 * dt;
          const targetX = b.x;
          if (oppPaddle.current.x < targetX - 5) oppPaddle.current.x = Math.min(W - PADDLE_R - 10, oppPaddle.current.x + botSpeedX);
          else if (oppPaddle.current.x > targetX + 5) oppPaddle.current.x = Math.max(PADDLE_R + 10, oppPaddle.current.x - botSpeedX);

          // Advance forward toward ball to smash!
          const targetY = Math.min(H / 2 - 40, Math.max(PADDLE_R + 15, b.y - 10));
          oppPaddle.current.y += (targetY - oppPaddle.current.y) * 0.15;
        } else {
          // Ball moving away: bot retreats to baseline defense
          const targetX = W / 2;
          const targetY = 85;
          oppPaddle.current.x += (targetX - oppPaddle.current.x) * 0.08;
          oppPaddle.current.y += (targetY - oppPaddle.current.y) * 0.08;
        }

        oppPaddle.current.vx = oppPaddle.current.x - prevOppX;
        oppPaddle.current.vy = oppPaddle.current.y - prevOppY;
      } else if (!room.gameState?.paddles) {
        // Local 2-Player
        const prevOppX = oppPaddle.current.x;
        const prevOppY = oppPaddle.current.y;
        oppPaddle.current.x = oppPaddle.current.targetX;
        oppPaddle.current.y = oppPaddle.current.targetY;
        oppPaddle.current.vx = oppPaddle.current.x - prevOppX;
        oppPaddle.current.vy = oppPaddle.current.y - prevOppY;
      }

      // Ball Physics
      const b = ball.current;
      b.x += b.vx * dt * 60;
      b.y += b.vy * dt * 60;

      // Side Table Bounce Rails
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

      // 2D Circular Mallet Collision Engine: Bottom Mallet (YOU)
      const myPad = myPaddle.current;
      const distMy = Math.hypot(b.x - myPad.x, b.y - myPad.y);
      const minHitDist = PADDLE_R + BALL_R;

      if (distMy <= minHitDist && b.vy > 0) {
        // Circle collision normal vector
        const nx = (b.x - myPad.x) / (distMy || 1);
        const ny = (b.y - myPad.y) / (distMy || 1);

        // Separate bodies
        b.x = myPad.x + nx * (minHitDist + 1);
        b.y = myPad.y + ny * (minHitDist + 1);

        // Elastic momentum transfer: striking with mallet adds massive smash speed!
        const smashBonus = Math.max(0, -myPad.vy * 0.55);
        b.vx = nx * (5.5 + smashBonus) + (myPad.vx * 0.4);
        b.vy = -Math.abs(ny * (5.8 + smashBonus));

        // Speed limit
        const spd = Math.hypot(b.vx, b.vy);
        if (spd > 18) {
          b.vx = (b.vx / spd) * 18;
          b.vy = (b.vy / spd) * 18;
        }

        soundService.playImpact(1.3);
        juice.addTrauma(0.25);
        juice.emitSparks(b.x, b.y, 14, '#38bdf8', '#0284c7', 4);
        if (navigator.vibrate) navigator.vibrate(20);
      }

      // 2D Circular Mallet Collision Engine: Top Mallet (OPPONENT / BOT)
      const opPad = oppPaddle.current;
      const distOp = Math.hypot(b.x - opPad.x, b.y - opPad.y);

      if (distOp <= minHitDist && b.vy < 0) {
        const nx = (b.x - opPad.x) / (distOp || 1);
        const ny = (b.y - opPad.y) / (distOp || 1);

        b.x = opPad.x + nx * (minHitDist + 1);
        b.y = opPad.y + ny * (minHitDist + 1);

        const smashBonus = Math.max(0, opPad.vy * 0.55);
        b.vx = nx * (5.5 + smashBonus) + (opPad.vx * 0.4);
        b.vy = Math.abs(ny * (5.8 + smashBonus));

        const spd = Math.hypot(b.vx, b.vy);
        if (spd > 18) {
          b.vx = (b.vx / spd) * 18;
          b.vy = (b.vy / spd) * 18;
        }

        soundService.playImpact(1.3);
        juice.addTrauma(0.25);
        juice.emitSparks(b.x, b.y, 14, '#f43f5e', '#be123c', 4);
      }

      // Goal Scored Detection
      // Top Goal: YOU (Bottom) Scored!
      if (b.y < -8) {
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
      if (b.y > H + 8) {
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

      // 1. High-Tech Cyber Table Tennis Surface (Modern Emerald Felt)
      const tableGrad = ctx.createLinearGradient(0, 0, 0, H);
      tableGrad.addColorStop(0, '#042f2e');
      tableGrad.addColorStop(0.5, '#064e3b');
      tableGrad.addColorStop(1, '#042f2e');
      ctx.fillStyle = tableGrad;
      ctx.fillRect(0, 0, W, H);

      // Dark Bevel Outer Frame
      ctx.strokeStyle = '#022c22';
      ctx.lineWidth = 14;
      ctx.strokeRect(7, 7, W - 14, H - 14);

      // White Boundary Lines
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.strokeRect(16, 16, W - 32, H - 32);

      // Longitudinal Center Service Line
      ctx.beginPath();
      ctx.moveTo(W / 2, 16);
      ctx.lineTo(W / 2, H - 16);
      ctx.stroke();

      // Goal Pocket Markings
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.fillRect(W / 2 - 80, 16, 160, 20);
      ctx.fillRect(W / 2 - 80, H - 36, 160, 20);

      // Center 3D Net with Realistic Drop Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(8, H / 2 + 3, W - 16, 6);

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(10, H / 2 - 2, W - 20, 4);

      // Net edge posts
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(6, H / 2 - 8, 8, 16);
      ctx.fillRect(W - 14, H / 2 - 8, 8, 16);

      // 2. Large Minimalist Floor Scores (Painted on table felt)
      const p1Score = room.scores[bottomUid] || 0;
      const p2Score = room.scores[topUid] || 0;
      ctx.font = '900 88px "Outfit", sans-serif';
      ctx.textAlign = 'center';

      // Top Score
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.fillText(String(p2Score), W / 2, H / 2 - 60);

      // Bottom Score
      ctx.fillText(String(p1Score), W / 2, H / 2 + 120);

      // 3. Render 3D Table Tennis Ball
      const bx = ball.current.x;
      const by = ball.current.y;

      // Ball shadow directly beneath
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.ellipse(bx, by + 5, BALL_R * 1.15, BALL_R * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();

      // Pure White 3D Sphere with Specular Highlight
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

      // 4. Render Modern 2D Mallets (Move freely in 2D anywhere in court!)
      // Top Mallet (Opponent / Crimson)
      const op = oppPaddle.current;
      // Drop shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.arc(op.x, op.y + 6, PADDLE_R, 0, Math.PI * 2);
      ctx.fill();

      // Outer Crimson Ring
      ctx.fillStyle = '#be123c';
      ctx.beginPath();
      ctx.arc(op.x, op.y, PADDLE_R, 0, Math.PI * 2);
      ctx.fill();

      // Inner Core
      ctx.fillStyle = '#f43f5e';
      ctx.beginPath();
      ctx.arc(op.x, op.y, PADDLE_R - 7, 0, Math.PI * 2);
      ctx.fill();

      // Center Grip Handle Knob
      ctx.fillStyle = '#881337';
      ctx.beginPath();
      ctx.arc(op.x, op.y, 11, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Top Name
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 11px "Outfit", sans-serif';
      ctx.fillText(p2Nickname.substring(0, 10).toUpperCase(), op.x, op.y - PADDLE_R - 8);

      // Bottom Mallet (YOU / Electric Cyan & Royal Blue)
      const my = myPaddle.current;
      // Drop shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.arc(my.x, my.y + 6, PADDLE_R, 0, Math.PI * 2);
      ctx.fill();

      // Outer Royal Blue Ring
      ctx.fillStyle = '#0284c7';
      ctx.beginPath();
      ctx.arc(my.x, my.y, PADDLE_R, 0, Math.PI * 2);
      ctx.fill();

      // Inner Cyan Core
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(my.x, my.y, PADDLE_R - 7, 0, Math.PI * 2);
      ctx.fill();

      // Center Grip Handle Knob
      ctx.fillStyle = '#0369a1';
      ctx.beginPath();
      ctx.arc(my.x, my.y, 11, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // "YOU" Label
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 11px "Outfit", sans-serif';
      ctx.fillText('▼ YOU', my.x, my.y + PADDLE_R + 18);

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

      {/* 2D Free Movement Air Mallet Court */}
      <div className="w-full h-[52vh] min-h-[340px] max-h-[500px] aspect-[460/640] rounded-3xl overflow-hidden shadow-2xl border-4 border-slate-800 relative bg-[#042f2e] cursor-pointer">
        <canvas
          ref={canvasRef}
          style={{ touchAction: 'none' }}
          className="w-full h-full block select-none"
        />
      </div>

      {/* Quick Mobile Controls (Left / Right / Smash Forward) */}
      <div className="w-full grid grid-cols-3 gap-2 max-w-sm pt-0.5">
        <button
          onPointerDown={(e) => { e.preventDefault(); mobileButtons.current.left = true; }}
          onPointerUp={() => { mobileButtons.current.left = false; }}
          onPointerLeave={() => { mobileButtons.current.left = false; }}
          onPointerCancel={() => { mobileButtons.current.left = false; }}
          className="h-11 rounded-xl bg-slate-900 border-2 border-cyan-500/40 active:bg-cyan-600/30 active:scale-95 text-xs font-black font-mono text-cyan-300 flex items-center justify-center gap-1 shadow-md touch-manipulation cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4 text-cyan-400" />
          <span>LEFT</span>
        </button>

        <button
          onPointerDown={(e) => { e.preventDefault(); mobileButtons.current.smash = true; }}
          onPointerUp={() => { mobileButtons.current.smash = false; }}
          onPointerLeave={() => { mobileButtons.current.smash = false; }}
          onPointerCancel={() => { mobileButtons.current.smash = false; }}
          className="h-11 rounded-xl bg-gradient-to-r from-amber-600 to-yellow-500 border border-amber-400 active:scale-95 text-xs font-black font-mono text-slate-950 flex items-center justify-center gap-1 shadow-md touch-manipulation cursor-pointer"
        >
          <Zap className="w-3.5 h-3.5 fill-current" />
          <span>SMASH</span>
        </button>

        <button
          onPointerDown={(e) => { e.preventDefault(); mobileButtons.current.right = true; }}
          onPointerUp={() => { mobileButtons.current.right = false; }}
          onPointerLeave={() => { mobileButtons.current.right = false; }}
          onPointerCancel={() => { mobileButtons.current.right = false; }}
          className="h-11 rounded-xl bg-slate-900 border-2 border-cyan-500/40 active:bg-cyan-600/30 active:scale-95 text-xs font-black font-mono text-cyan-300 flex items-center justify-center gap-1 shadow-md touch-manipulation cursor-pointer"
        >
          <span>RIGHT</span>
          <ChevronRight className="w-4 h-4 text-cyan-400" />
        </button>
      </div>

      <p className="text-[10px] text-slate-400 font-mono text-center">
        ⚡ Move mallet anywhere in 2D • Push forward toward the net to SMASH!
      </p>
    </div>
  );
};
