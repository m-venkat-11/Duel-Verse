import React, { useEffect, useRef, useState } from 'react';
import type { ObstacleRushState, ObstaclePlayer } from '../../types/game';
import type { AuthoritativeRoomState } from '../../types/room';
import { COURSE_LENGTH } from '../../engine/obstacleRushEngine';
import { soundService } from '../../services/sound';
import { ArrowUp, ArrowLeft, ArrowRight, Flag, Zap } from 'lucide-react';

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
      const speed = 5.2;

      if (inputState.left) vx -= speed;
      if (inputState.right) vx += speed;
      if (inputState.forward) vy += speed * 1.35;

      // Passive runner forward velocity
      vy += 2.2;

      let nextX = Math.max(55, Math.min(345, myPlayer.x + vx));
      let nextY = myPlayer.y + vy;

      // Check collision with deterministic rotating hazards
      const elapsed = Date.now() - gameState.startTime;
      for (const hazard of gameState.hazards) {
        if (Math.abs(nextY - hazard.trackY) < 28) {
          const angle = ((elapsed % hazard.periodMs) / hazard.periodMs) * Math.PI * 2;
          const hazardTipX = 200 + Math.cos(angle) * (hazard.width / 2);
          if (Math.abs(nextX - hazardTipX) < 32) {
            // Hit by obstacle! Respawn at checkpoint
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

  // Canvas 2D Course Rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Camera tracks myPlayer.y
    const cameraY = myPlayer.y - height * 0.72;

    ctx.clearRect(0, 0, width, height);

    // Deep Cyber Track Background
    ctx.fillStyle = '#080c16';
    ctx.fillRect(0, 0, width, height);

    // Track platform
    ctx.fillStyle = '#111827';
    ctx.fillRect(45, -cameraY, 310, COURSE_LENGTH + 200);

    // Glowing track boundaries
    ctx.strokeStyle = '#06B6D4';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#06B6D4';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(45, -cameraY);
    ctx.lineTo(45, COURSE_LENGTH + 200 - cameraY);
    ctx.moveTo(355, -cameraY);
    ctx.lineTo(355, COURSE_LENGTH + 200 - cameraY);
    ctx.stroke();
    ctx.shadowBlur = 0; // reset shadow

    // Track Lane Dividers
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.setLineDash([12, 12]);
    ctx.beginPath();
    ctx.moveTo(148, -cameraY);
    ctx.lineTo(148, COURSE_LENGTH + 200 - cameraY);
    ctx.moveTo(252, -cameraY);
    ctx.lineTo(252, COURSE_LENGTH + 200 - cameraY);
    ctx.stroke();
    ctx.setLineDash([]); // reset dash

    // Checkpoint 1 Line (Y=700)
    const cp1Y = 700 - cameraY;
    if (cp1Y > -20 && cp1Y < height + 20) {
      ctx.fillStyle = '#38BDF8';
      ctx.fillRect(45, cp1Y, 310, 8);
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('CHECKPOINT 1', 200, cp1Y - 6);
    }

    // Checkpoint 2 Line (Y=1400)
    const cp2Y = 1400 - cameraY;
    if (cp2Y > -20 && cp2Y < height + 20) {
      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(45, cp2Y, 310, 8);
      ctx.fillStyle = '#FFF';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('CHECKPOINT 2', 200, cp2Y - 6);
    }

    // Checkered Finish Line (Y=COURSE_LENGTH)
    const finishY = COURSE_LENGTH - cameraY;
    if (finishY > -30 && finishY < height + 30) {
      ctx.fillStyle = '#10B981';
      ctx.fillRect(45, finishY, 310, 24);
      ctx.fillStyle = '#FFFFFF';
      for (let c = 0; c < 15; c++) {
        if (c % 2 === 0) {
          ctx.fillRect(45 + c * 20.6, finishY, 20.6, 12);
          ctx.fillRect(45 + (c + 1) * 20.6, finishY + 12, 20.6, 12);
        }
      }
      ctx.font = '900 13px Outfit, sans-serif';
      ctx.fillStyle = '#FFF';
      ctx.textAlign = 'center';
      ctx.fillText('🏁 FINISH ARCH 🏁', 200, finishY - 8);
    }

    // Moving Hazards (Rotating Hammer Blades)
    const elapsed = Date.now() - gameState.startTime;
    gameState.hazards.forEach((hazard) => {
      const hazardScreenY = hazard.trackY - cameraY;
      if (hazardScreenY > -60 && hazardScreenY < height + 60) {
        const angle = ((elapsed % hazard.periodMs) / hazard.periodMs) * Math.PI * 2;
        ctx.save();
        ctx.translate(200, hazardScreenY);
        ctx.rotate(angle);

        // Rotating Hammer Shaft
        ctx.fillStyle = '#DC2626';
        ctx.fillRect(-hazard.width / 2, -hazard.height / 2, hazard.width, hazard.height);

        // Hammer Heads on tips
        ctx.fillStyle = '#EF4444';
        ctx.beginPath();
        ctx.arc(-hazard.width / 2 + 10, 0, 16, 0, Math.PI * 2);
        ctx.arc(hazard.width / 2 - 10, 0, 16, 0, Math.PI * 2);
        ctx.fill();

        // Center Pivot
        ctx.fillStyle = '#FFF';
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
    });

    // Draw Players
    Object.values(gameState.players).forEach((p: ObstaclePlayer) => {
      const pScreenY = p.y - cameraY;
      const isMe = p.uid === playerUid;

      ctx.save();
      // Player sphere
      ctx.fillStyle = isMe ? '#F59E0B' : '#F43F5E';
      ctx.shadowColor = isMe ? '#F59E0B' : '#F43F5E';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(p.x, pScreenY, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Inner highlight
      ctx.fillStyle = '#FFF';
      ctx.beginPath();
      ctx.arc(p.x - 4, pScreenY - 4, 4, 0, Math.PI * 2);
      ctx.fill();

      // Border
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, pScreenY, 15, 0, Math.PI * 2);
      ctx.stroke();

      // Nickname & Icon Tag
      const name = room.players[p.uid]?.nickname || 'Player';
      const avatar = room.players[p.uid]?.avatarId || '👤';
      ctx.font = 'bold 11px Outfit, sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(`${avatar} ${name}`, p.x, pScreenY - 20);

      ctx.restore();
    });
  }, [myPlayer.y, gameState, playerUid, room.players]);

  const progressPercent = Math.min(100, Math.round((myPlayer.y / COURSE_LENGTH) * 100));

  return (
    <div className="w-full max-w-lg mx-auto flex flex-col items-center select-none">
      {/* Progress Bar & Distance Counter */}
      <div className="w-full bg-slate-900/90 rounded-2xl p-3 border border-slate-700/80 mb-3 shadow-lg">
        <div className="flex items-center justify-between text-xs font-bold text-slate-300 mb-1.5 font-['Outfit']">
          <span className="flex items-center gap-1.5 text-amber-400">
            <Flag className="w-4 h-4" /> <span>COURSE DISTANCE</span>
          </span>
          <span className="font-mono text-cyan-400 text-sm">{progressPercent}% COMPLETED</span>
        </div>
        <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800">
          <div
            className="h-full bg-gradient-to-r from-violet-500 via-orange-500 to-emerald-400 rounded-full transition-all duration-150 shadow-sm"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* 2D Perspective Course Arena */}
      <div className="w-full aspect-[4/5] bg-slate-950 rounded-3xl border-2 border-violet-500/40 relative overflow-hidden shadow-2xl">
        <canvas ref={canvasRef} width={400} height={500} className="w-full h-full block" />
      </div>

      {/* Ergonomic Mobile Touch Controls */}
      <div className="grid grid-cols-3 gap-3 w-full mt-3">
        <button
          onPointerDown={() => setInputState((s) => ({ ...s, left: true }))}
          onPointerUp={() => setInputState((s) => ({ ...s, left: false }))}
          className="btn-secondary h-16 flex flex-col items-center justify-center gap-0.5 active:scale-95 touch-none rounded-2xl border-slate-700"
          aria-label="Steer Left"
        >
          <ArrowLeft className="w-6 h-6 text-slate-200" />
          <span className="text-[10px] font-bold text-slate-400 font-mono">LEFT</span>
        </button>

        <button
          onPointerDown={() => setInputState((s) => ({ ...s, forward: true }))}
          onPointerUp={() => setInputState((s) => ({ ...s, forward: false }))}
          className="btn-primary h-16 flex flex-col items-center justify-center gap-0.5 active:scale-95 touch-none rounded-2xl bg-gradient-to-tr from-cyan-600 to-blue-600 border-cyan-400/40 shadow-cyan-500/30"
          aria-label="Turbo Boost"
        >
          <Zap className="w-6 h-6 fill-current text-white" />
          <span className="text-[10px] font-black text-white font-mono">BOOST</span>
        </button>

        <button
          onPointerDown={() => setInputState((s) => ({ ...s, right: true }))}
          onPointerUp={() => setInputState((s) => ({ ...s, right: false }))}
          className="btn-secondary h-16 flex flex-col items-center justify-center gap-0.5 active:scale-95 touch-none rounded-2xl border-slate-700"
          aria-label="Steer Right"
        >
          <ArrowRight className="w-6 h-6 text-slate-200" />
          <span className="text-[10px] font-bold text-slate-400 font-mono">RIGHT</span>
        </button>
      </div>

      {/* Desktop Keyboard Tip */}
      <p className="text-[11px] text-slate-400 mt-2 font-medium hidden sm:block">
        Controls: <kbd className="px-1.5 py-0.5 bg-slate-800 rounded font-mono text-slate-300">A / D</kbd> or <kbd className="px-1.5 py-0.5 bg-slate-800 rounded font-mono text-slate-300">← / →</kbd> to steer • <kbd className="px-1.5 py-0.5 bg-slate-800 rounded font-mono text-slate-300">W / ↑ / Space</kbd> for Turbo Boost
      </p>
    </div>
  );
};
