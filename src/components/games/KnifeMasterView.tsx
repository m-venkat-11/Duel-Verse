import React, { useEffect, useRef, useState } from 'react';
import type { AuthoritativeRoomState } from '../../types/room';
import type { KnifeMasterState, StuckBlade } from '../../engine/knifeMasterEngine';
import { GameLoop } from '../../engine/core/GameLoop';
import { CanvasManager } from '../../engine/core/CanvasManager';
import { JuiceEngine } from '../../engine/core/JuiceEngine';
import { soundService } from '../../services/sound';
import { Swords, Sparkles, Target } from 'lucide-react';

interface KnifeMasterViewProps {
  room: AuthoritativeRoomState<KnifeMasterState>;
  playerUid: string;
  onDispatchAction: (type: string, payload: any) => void;
}

interface FlyingKnife {
  y: number;
  speed: number;
  ownerUid: string;
  active: boolean;
}

export const KnifeMasterView: React.FC<KnifeMasterViewProps> = ({
  room,
  playerUid,
  onDispatchAction
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const gameState = room.gameState;
  const players = Object.keys(room.players);
  const p1Uid = players[0] || 'p1';
  const p2Uid = players[1] || 'p2';
  const isP1 = playerUid === p1Uid;
  const isHost = room.hostUid === playerUid;
  const isBotPlaying = Boolean(room.players['bot_rival'] || p2Uid === 'bot_rival');

  const p1Nickname = room.players[p1Uid]?.nickname || 'Player 1';
  const p2Nickname = room.players[p2Uid]?.nickname || 'CyberBot';

  const [roundWinnerName, setRoundWinnerName] = useState<string | null>(null);

  // Wheel state
  const wheelAngleRef = useRef(0);
  const wheelSpeedRef = useRef(0.038);
  const flyingKnives = useRef<FlyingKnife[]>([]);

  // Player throw
  const handleThrow = () => {
    if (gameState.roundWinner !== null) return;
    const myLeft = isP1 ? gameState.p1KnivesLeft : gameState.p2KnivesLeft;
    if (myLeft <= 0) return;

    soundService.playClick();
    flyingKnives.current.push({
      y: 400,
      speed: 28,
      ownerUid: playerUid,
      active: true
    });
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        handleThrow();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState.p1KnivesLeft, gameState.p2KnivesLeft, gameState.roundWinner]);

  // CyberBot AI Thrower
  useEffect(() => {
    if (!isHost || !isBotPlaying || gameState.roundWinner !== null) return;

    // Bot throws every 800ms - 1500ms
    const interval = setInterval(() => {
      if (gameState.p2KnivesLeft > 0) {
        flyingKnives.current.push({
          y: 400,
          speed: 28,
          ownerUid: p2Uid,
          active: true
        });
      }
    }, 1100);

    return () => clearInterval(interval);
  }, [isHost, isBotPlaying, p2Uid, gameState.p2KnivesLeft, gameState.roundWinner]);

  // 60 FPS Canvas GameLoop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasMgr = new CanvasManager(canvas);
    const juice = new JuiceEngine(300);

    const W = 600;
    const H = 480;
    const WHEEL_CX = W / 2;
    const WHEEL_CY = 150;
    const WHEEL_R = 75;

    let timeAcc = 0;

    const update = (dt: number) => {
      juice.update(dt);
      timeAcc += dt;

      // Dynamic rotation with slight speed surges & reversals
      wheelAngleRef.current += wheelSpeedRef.current;
      if (Math.sin(timeAcc * 0.8) > 0.95) {
        wheelSpeedRef.current = -0.045; // brief reverse spin!
      } else if (Math.sin(timeAcc * 0.8) < -0.95) {
        wheelSpeedRef.current = 0.045;
      }

      // Flying Knives
      for (const fk of flyingKnives.current) {
        if (!fk.active) continue;
        fk.y -= fk.speed;

        // Hit target wheel perimeter
        if (fk.y <= WHEEL_CY + WHEEL_R + 8) {
          fk.active = false;
          soundService.playImpact(1.3);

          if (isHost) {
            onDispatchAction('KNIFE_THROW', {
              playerUid: fk.ownerUid,
              actingUid: fk.ownerUid,
              wheelAngle: wheelAngleRef.current
            });
          }
        }
      }

      // Remove inactive flying knives
      flyingKnives.current = flyingKnives.current.filter((k) => k.active);
    };

    const render = () => {
      const ctx = canvasMgr.ctx;
      ctx.clearRect(0, 0, canvasMgr.width, canvasMgr.height);

      ctx.save();
      ctx.translate(juice.offsetX, juice.offsetY);

      const scaleX = canvasMgr.width / W;
      const scaleY = canvasMgr.height / H;
      ctx.scale(scaleX, scaleY);

      // Deep cyber background
      ctx.fillStyle = '#060913';
      ctx.fillRect(0, 0, W, H);

      // Radial target glow
      const targetGlow = ctx.createRadialGradient(WHEEL_CX, WHEEL_CY, 20, WHEEL_CX, WHEEL_CY, 180);
      targetGlow.addColorStop(0, 'rgba(6, 182, 212, 0.25)');
      targetGlow.addColorStop(1, 'transparent');
      ctx.fillStyle = targetGlow;
      ctx.fillRect(0, 0, W, H);

      // 1. Rotating Cyber Target Wheel
      ctx.save();
      ctx.translate(WHEEL_CX, WHEEL_CY);
      ctx.rotate(wheelAngleRef.current);

      // Wheel Outer Rim
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(0, 0, WHEEL_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Wheel Mechanical Core Ring
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, WHEEL_R - 15, 0, Math.PI * 2);
      ctx.stroke();

      // Mechanical spokes
      for (let i = 0; i < 8; i++) {
        const ang = (i * Math.PI) / 4;
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.3)';
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * 15, Math.sin(ang) * 15);
        ctx.lineTo(Math.cos(ang) * (WHEEL_R - 15), Math.sin(ang) * (WHEEL_R - 15));
        ctx.stroke();
      }

      // Center glowing core
      ctx.fillStyle = '#38bdf8';
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Render Stuck Blades rotating with the wheel
      for (const blade of gameState.stuckBlades) {
        ctx.save();
        ctx.rotate(blade.angle);

        // Blade pointing outward from center
        const bladeColor = blade.ownerUid === p1Uid ? '#f59e0b' : blade.ownerUid === p2Uid ? '#06b6d4' : '#ef4444';

        ctx.fillStyle = bladeColor;
        ctx.shadowColor = bladeColor;
        ctx.shadowBlur = 10;
        // Blade hilt
        ctx.fillRect(-3, WHEEL_R, 6, 28);
        // Blade point
        ctx.beginPath();
        ctx.moveTo(-3, WHEEL_R + 28);
        ctx.lineTo(0, WHEEL_R + 36);
        ctx.lineTo(3, WHEEL_R + 28);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.restore();
      }

      ctx.restore(); // restore wheel transform

      // 2. Flying Knives
      for (const fk of flyingKnives.current) {
        const kColor = fk.ownerUid === p1Uid ? '#f59e0b' : '#06b6d4';
        ctx.save();
        ctx.translate(WHEEL_CX, fk.y);
        ctx.fillStyle = kColor;
        ctx.shadowColor = kColor;
        ctx.shadowBlur = 14;
        ctx.fillRect(-3, 0, 6, 32);
        ctx.beginPath();
        ctx.moveTo(-3, 0);
        ctx.lineTo(0, -10);
        ctx.lineTo(3, 0);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();
      }

      // 3. Ready Throw Position Knife (Bottom)
      const myLeft = isP1 ? gameState.p1KnivesLeft : gameState.p2KnivesLeft;
      if (myLeft > 0) {
        const myColor = isP1 ? '#f59e0b' : '#06b6d4';
        ctx.save();
        ctx.translate(WHEEL_CX, 410);
        ctx.fillStyle = myColor;
        ctx.shadowColor = myColor;
        ctx.shadowBlur = 12;
        ctx.fillRect(-3, 0, 6, 34);
        ctx.beginPath();
        ctx.moveTo(-3, 0);
        ctx.lineTo(0, -10);
        ctx.lineTo(3, 0);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();
      }

      // Particles
      juice.renderParticles(ctx, 1.0);

      // Round Winner Overlay
      if (gameState.roundWinner) {
        const winner = gameState.roundWinner === p1Uid ? p1Nickname : p2Nickname;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fbbf24';
        ctx.font = '900 36px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 20;
        ctx.fillText(`🏆 ${winner.toUpperCase()} SCORED ROUND!`, W / 2, H / 2);
        ctx.shadowBlur = 0;
      }

      ctx.restore();
    };

    const loop = new GameLoop({ update, render });
    loop.start();

    return () => loop.stop();
  }, [p1Uid, p2Uid, isHost, isBotPlaying, p1Nickname, p2Nickname, gameState.stuckBlades, gameState.roundWinner, onDispatchAction]);

  const p1Score = gameState.scores?.[p1Uid] || 0;
  const p2Score = gameState.scores?.[p2Uid] || 0;
  const myLeft = isP1 ? gameState.p1KnivesLeft : gameState.p2KnivesLeft;

  return (
    <div ref={containerRef} className="w-full max-w-xl mx-auto flex flex-col items-center select-none gap-2.5 px-2">
      {/* Top Score & Knives Quiver HUD */}
      <div className="w-full flex items-center justify-between px-4 py-2.5 rounded-2xl bg-slate-900/90 border border-slate-700/60 text-xs font-black font-mono shadow-md backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="text-amber-400">{p1Nickname}</span>
          <span className="text-sm font-black text-amber-300 font-['Outfit']">W: {p1Score}</span>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-600/20 text-violet-300 border border-violet-500/40 text-[11px] font-mono">
          <Target className="w-3.5 h-3.5 text-cyan-400" />
          <span>FIRST TO {room.maxRounds || gameState.targetScore || 3} WINS</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-black text-cyan-300 font-['Outfit']">W: {p2Score}</span>
          <span className="text-cyan-400">{p2Nickname}</span>
        </div>
      </div>

      {/* Knife Master Canvas */}
      <div className="w-full aspect-[4/3] rounded-3xl overflow-hidden shadow-2xl border-2 border-cyan-500/40 relative bg-slate-950">
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>

      {/* Quiver Remaining & Giant Throw Button */}
      <div className="w-full max-w-md flex flex-col items-center gap-2 pt-1">
        <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-slate-300">
          <span>KNIVES REMAINING:</span>
          <div className="flex gap-1">
            {Array.from({ length: 7 }).map((_, i) => (
              <span
                key={i}
                className={`text-sm ${
                  i < myLeft ? (isP1 ? 'text-amber-400' : 'text-cyan-400') : 'text-slate-700'
                }`}
              >
                🗡️
              </span>
            ))}
          </div>
        </div>

        <button
          onClick={handleThrow}
          disabled={myLeft <= 0 || gameState.roundWinner !== null}
          className={`w-full h-16 rounded-3xl font-black font-['Outfit'] text-xl flex items-center justify-center gap-2 shadow-2xl active:scale-95 transition border-2 ${
            myLeft > 0
              ? isP1
                ? 'bg-gradient-to-r from-amber-500 to-rose-500 border-amber-300 text-slate-950 shadow-amber-500/30'
                : 'bg-gradient-to-r from-cyan-400 to-blue-600 border-cyan-300 text-slate-950 shadow-cyan-500/30'
              : 'bg-slate-800 border-slate-700 text-slate-500 opacity-60'
          }`}
        >
          <Swords className="w-6 h-6 fill-current" />
          <span>THROW KNIFE!</span>
        </button>

        <p className="text-xs text-slate-400 font-mono text-center">
          ⌨️ Desktop: Spacebar to throw • Don't hit existing knives!
        </p>
      </div>
    </div>
  );
};
