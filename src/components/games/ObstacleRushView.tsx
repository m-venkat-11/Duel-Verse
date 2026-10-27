import React, { useEffect, useRef, useState } from 'react';
import type { ObstacleRushState, ObstaclePlayer } from '../../types/game';
import type { AuthoritativeRoomState } from '../../types/room';
import { COURSE_LENGTH } from '../../engine/obstacleRushEngine';
import { soundService } from '../../services/sound';
import { ArrowLeft, ArrowRight, Zap, Flag } from 'lucide-react';

interface ObstacleRushViewProps {
  room: AuthoritativeRoomState<ObstacleRushState>;
  playerUid: string;
  onDispatchAction: (type: string, payload: any) => void;
}

export const ObstacleRushView: React.FC<ObstacleRushViewProps> = ({
  room,
  playerUid,
  onDispatchAction
}) => {
  const gameState = room.gameState;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const myPlayer = gameState.players[playerUid] || {
    uid: playerUid,
    x: 200,
    y: 50,
    vx: 0,
    vy: 0,
    checkpoint: 0,
    isGrounded: true,
    isStunned: false,
    stunUntil: 0,
    finishTime: null
  };

  const [inputState, setInputState] = useState({ left: false, right: false, forward: false });

  // Keyboard controls listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') setInputState((s) => ({ ...s, left: true }));
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') setInputState((s) => ({ ...s, right: true }));
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === ' ') setInputState((s) => ({ ...s, forward: true }));
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') setInputState((s) => ({ ...s, left: false }));
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') setInputState((s) => ({ ...s, right: false }));
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === ' ') setInputState((s) => ({ ...s, forward: false }));
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Local movement loop dispatching updates
  useEffect(() => {
    if (room.status !== 'playing' || myPlayer.finishTime !== null) return;

    const interval = setInterval(() => {
      let vx = 0;
      let vy = 0;
      const speed = 5.5;

      if (inputState.left) vx -= speed;
      if (inputState.right) vx += speed;
      if (inputState.forward) vy += speed * 1.4;

      // Passive runner forward velocity
      vy += 2.5;

      let nextX = Math.max(65, Math.min(335, myPlayer.x + vx));
      let nextY = myPlayer.y + vy;

      // Check collision with deterministic rotating hazards
      const elapsed = Date.now() - gameState.startTime;
      for (const hazard of gameState.hazards) {
        if (Math.abs(nextY - hazard.trackY) < 30) {
          const angle = ((elapsed % hazard.periodMs) / hazard.periodMs) * Math.PI * 2;
          const hazardTipX = 200 + Math.cos(angle) * (hazard.width / 2);
          if (Math.abs(nextX - hazardTipX) < 34) {
            soundService.playFalseStart();
            onDispatchAction('OBSTACLE_RESPAWN', {});
            return;
          }
        }
      }

      onDispatchAction('OBSTACLE_MOVE', { x: nextX, y: nextY, vx, vy });
    }, 1000 / 30);

    return () => clearInterval(interval);
  }, [inputState, myPlayer, gameState.startTime, gameState.hazards, room.status, onDispatchAction]);

  // High-FPS Canvas Neon Runner Rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Camera keeps player positioned at 75% down the screen looking ahead
    const cameraY = myPlayer.y - height * 0.72;

    // Background deep cyber space
    ctx.fillStyle = '#060913';
    ctx.fillRect(0, 0, width, height);

    // Glowing vertical track
    const trackLeft = 50;
    const trackWidth = 300;
    const trackRight = trackLeft + trackWidth;

    // Track surface with subtle gradient
    const trackGrad = ctx.createLinearGradient(trackLeft, 0, trackRight, 0);
    trackGrad.addColorStop(0, '#0f172a');
    trackGrad.addColorStop(0.5, '#1e293b');
    trackGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = trackGrad;
    ctx.fillRect(trackLeft, 0, trackWidth, height);

    // Dynamic animated lane markers moving downward to convey speed
    const roadOffset = (myPlayer.y * 1.5) % 40;
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.setLineDash([16, 24]);
    ctx.lineDashOffset = -roadOffset;

    // Two dashed lane dividers
    ctx.beginPath();
    ctx.moveTo(150, 0);
    ctx.lineTo(150, height);
    ctx.moveTo(250, 0);
    ctx.lineTo(250, height);
    ctx.stroke();
    ctx.setLineDash([]); // reset dash

    // Neon glowing outer rails
    ctx.strokeStyle = '#06B6D4';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#06B6D4';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(trackLeft, 0);
    ctx.lineTo(trackLeft, height);
    ctx.moveTo(trackRight, 0);
    ctx.lineTo(trackRight, height);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Draw Checkpoint 1 (Y = 700)
    const cp1ScreenY = 700 - cameraY;
    if (cp1ScreenY > -30 && cp1ScreenY < height + 30) {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.3)';
      ctx.fillRect(trackLeft, cp1ScreenY - 10, trackWidth, 20);
      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 3;
      ctx.strokeRect(trackLeft, cp1ScreenY - 10, trackWidth, 20);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('⚡ CHECKPOINT 1 ⚡', 200, cp1ScreenY + 4);
    }

    // Draw Checkpoint 2 (Y = 1400)
    const cp2ScreenY = 1400 - cameraY;
    if (cp2ScreenY > -30 && cp2ScreenY < height + 30) {
      ctx.fillStyle = 'rgba(245, 158, 11, 0.3)';
      ctx.fillRect(trackLeft, cp2ScreenY - 10, trackWidth, 20);
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 3;
      ctx.strokeRect(trackLeft, cp2ScreenY - 10, trackWidth, 20);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('⚡ CHECKPOINT 2 ⚡', 200, cp2ScreenY + 4);
    }

    // Draw Finish Line Arch (Y = COURSE_LENGTH)
    const finishScreenY = COURSE_LENGTH - cameraY;
    if (finishScreenY > -40 && finishScreenY < height + 40) {
      ctx.fillStyle = '#10B981';
      ctx.fillRect(trackLeft, finishScreenY - 16, trackWidth, 32);
      ctx.fillStyle = '#FFFFFF';
      for (let c = 0; c < 12; c++) {
        if (c % 2 === 0) {
          ctx.fillRect(trackLeft + c * 25, finishScreenY - 16, 25, 16);
          ctx.fillRect(trackLeft + (c + 1) * 25, finishScreenY, 25, 16);
        }
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '900 14px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🏁 FINISH ARCH 🏁', 200, finishScreenY - 22);
    }

    // Hazards (Rotating Laser Blades)
    const elapsed = Date.now() - gameState.startTime;
    gameState.hazards.forEach((hazard) => {
      const hazardScreenY = hazard.trackY - cameraY;
      if (hazardScreenY > -70 && hazardScreenY < height + 70) {
        const angle = ((elapsed % hazard.periodMs) / hazard.periodMs) * Math.PI * 2;
        ctx.save();
        ctx.translate(200, hazardScreenY);
        ctx.rotate(angle);

        // Warning Danger Zone
        ctx.strokeStyle = '#EF4444';
        ctx.lineWidth = 6;
        ctx.shadowColor = '#EF4444';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(-hazard.width / 2, 0);
        ctx.lineTo(hazard.width / 2, 0);
        ctx.stroke();

        // Laser Blades Heads
        ctx.fillStyle = '#DC2626';
        ctx.beginPath();
        ctx.arc(-hazard.width / 2 + 10, 0, 15, 0, Math.PI * 2);
        ctx.arc(hazard.width / 2 - 10, 0, 15, 0, Math.PI * 2);
        ctx.fill();

        // Center Laser Hub
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    });

    // Draw All Players
    Object.values(gameState.players).forEach((p: ObstaclePlayer) => {
      const pScreenY = p.y - cameraY;
      const isMe = p.uid === playerUid;
      const playerColor = isMe ? '#F59E0B' : '#06B6D4';

      ctx.save();
      // Glowing aura
      ctx.fillStyle = playerColor;
      ctx.shadowColor = playerColor;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(p.x, pScreenY, 16, 0, Math.PI * 2);
      ctx.fill();

      // Core sphere
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(p.x - 3, pScreenY - 3, 5, 0, Math.PI * 2);
      ctx.fill();

      // Border ring
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(p.x, pScreenY, 16, 0, Math.PI * 2);
      ctx.stroke();

      // Gamer Tag Above Sphere
      const name = room.players[p.uid]?.nickname || 'Player';
      const avatar = room.players[p.uid]?.avatarId || '👤';
      ctx.font = 'bold 11px Outfit, sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 4;
      ctx.fillText(`${avatar} ${name}`, p.x, pScreenY - 22);

      ctx.restore();
    });
  }, [myPlayer.y, gameState, playerUid, room.players]);

  const progressPercent = Math.min(100, Math.round((myPlayer.y / COURSE_LENGTH) * 100));

  return (
    <div className="w-full max-w-md mx-auto flex flex-col items-center select-none">
      {/* Race Progress Bar */}
      <div className="w-full bg-slate-900/90 rounded-2xl p-2.5 border border-slate-700/80 mb-2.5 shadow-xl">
        <div className="flex items-center justify-between text-xs font-bold text-slate-300 mb-1 font-['Outfit']">
          <span className="flex items-center gap-1.5 text-amber-400">
            <Flag className="w-3.5 h-3.5" /> <span>RACE COURSE</span>
          </span>
          <span className="font-mono text-cyan-400 text-sm font-extrabold">{progressPercent}% FINISHED</span>
        </div>
        <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800">
          <div
            className="h-full bg-gradient-to-r from-violet-500 via-amber-500 to-emerald-400 rounded-full transition-all duration-100 shadow-md"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Cyber Track Canvas */}
      <div className="w-full aspect-[4/5] bg-slate-950 rounded-3xl border-2 border-cyan-500/50 relative overflow-hidden shadow-2xl">
        <canvas ref={canvasRef} width={400} height={500} className="w-full h-full block" />
      </div>

      {/* Modern 2-Player Touch Controls */}
      <div className="grid grid-cols-3 gap-2.5 w-full mt-2.5">
        <button
          onPointerDown={() => setInputState((s) => ({ ...s, left: true }))}
          onPointerUp={() => setInputState((s) => ({ ...s, left: false }))}
          className="btn-arcade h-16 flex flex-col items-center justify-center gap-0.5 active:scale-95 touch-none rounded-2xl bg-slate-800 border-slate-600"
          aria-label="Steer Left"
        >
          <ArrowLeft className="w-6 h-6 text-white" />
          <span className="text-[10px] font-black text-slate-300 font-mono">LEFT</span>
        </button>

        <button
          onPointerDown={() => setInputState((s) => ({ ...s, forward: true }))}
          onPointerUp={() => setInputState((s) => ({ ...s, forward: false }))}
          className="btn-arcade btn-arcade-cyan h-16 flex flex-col items-center justify-center gap-0.5 active:scale-95 touch-none rounded-2xl"
          aria-label="Turbo Boost"
        >
          <Zap className="w-6 h-6 fill-current text-white" />
          <span className="text-[10px] font-black text-white font-mono">BOOST</span>
        </button>

        <button
          onPointerDown={() => setInputState((s) => ({ ...s, right: true }))}
          onPointerUp={() => setInputState((s) => ({ ...s, right: false }))}
          className="btn-arcade h-16 flex flex-col items-center justify-center gap-0.5 active:scale-95 touch-none rounded-2xl bg-slate-800 border-slate-600"
          aria-label="Steer Right"
        >
          <ArrowRight className="w-6 h-6 text-white" />
          <span className="text-[10px] font-black text-slate-300 font-mono">RIGHT</span>
        </button>
      </div>

      <p className="text-[11px] text-slate-400 mt-2 font-medium hidden sm:block">
        Desktop: <kbd className="px-1.5 py-0.5 bg-slate-800 rounded font-mono text-slate-300">A / D</kbd> or <kbd className="px-1.5 py-0.5 bg-slate-800 rounded font-mono text-slate-300">← / →</kbd> to steer • <kbd className="px-1.5 py-0.5 bg-slate-800 rounded font-mono text-slate-300">Space</kbd> to boost
      </p>
    </div>
  );
};
