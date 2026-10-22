import React, { useEffect, useRef, useState } from 'react';
import type { ObstacleRushState, ObstaclePlayer } from '../../types/game';
import type { AuthoritativeRoomState } from '../../types/room';
import { COURSE_LENGTH } from '../../engine/obstacleRushEngine';
import { soundService } from '../../services/sound';
import { ArrowUp, ArrowLeft, ArrowRight, Flag } from 'lucide-react';

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
      if (e.key === 'ArrowLeft' || e.key === 'a') setInputState((s) => ({ ...s, left: true }));
      if (e.key === 'ArrowRight' || e.key === 'd') setInputState((s) => ({ ...s, right: true }));
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === ' ') setInputState((s) => ({ ...s, forward: true }));
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') setInputState((s) => ({ ...s, left: false }));
      if (e.key === 'ArrowRight' || e.key === 'd') setInputState((s) => ({ ...s, right: false }));
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === ' ') setInputState((s) => ({ ...s, forward: false }));
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
      const speed = 4.5;

      if (inputState.left) vx -= speed;
      if (inputState.right) vx += speed;
      if (inputState.forward) vy += speed * 1.2;

      // Passive forward momentum in runner
      vy += 1.8;

      let nextX = Math.max(50, Math.min(350, myPlayer.x + vx));
      let nextY = myPlayer.y + vy;

      // Check collision with deterministic rotating hazards
      const elapsed = Date.now() - gameState.startTime;
      for (const hazard of gameState.hazards) {
        if (Math.abs(nextY - hazard.trackY) < 25) {
          const angle = ((elapsed % hazard.periodMs) / hazard.periodMs) * Math.PI * 2;
          const hazardTipX = 200 + Math.cos(angle) * (hazard.width / 2);
          if (Math.abs(nextX - hazardTipX) < 30) {
            // Hit by hazard! Respawn at checkpoint
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
    const cameraY = myPlayer.y - height * 0.75;

    ctx.clearRect(0, 0, width, height);

    // Track surface background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    // Track borders
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 4;
    ctx.strokeRect(40, -cameraY, 320, COURSE_LENGTH);

    // Draw checkered finish line
    const finishScreenY = COURSE_LENGTH - cameraY;
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(40, finishScreenY, 320, 20);
    ctx.fillStyle = '#ffffff';
    for (let c = 0; c < 16; c++) {
      if (c % 2 === 0) {
        ctx.fillRect(40 + c * 20, finishScreenY, 20, 20);
      }
    }

    // Draw moving hazards
    const elapsed = Date.now() - gameState.startTime;
    gameState.hazards.forEach((hazard) => {
      const hazardScreenY = hazard.trackY - cameraY;
      if (hazardScreenY > -50 && hazardScreenY < height + 50) {
        const angle = ((elapsed % hazard.periodMs) / hazard.periodMs) * Math.PI * 2;
        ctx.save();
        ctx.translate(200, hazardScreenY);
        ctx.rotate(angle);

        // Hammer bar
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(-hazard.width / 2, -hazard.height / 2, hazard.width, hazard.height);
        // Hammer pivot
        ctx.fillStyle = '#f87171';
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
    });

    // Draw all players
    Object.values(gameState.players).forEach((p: ObstaclePlayer) => {
      const pScreenY = p.y - cameraY;
      const isMe = p.uid === playerUid;

      ctx.save();
      ctx.fillStyle = isMe ? '#f59e0b' : '#f43f5e';
      ctx.beginPath();
      ctx.arc(p.x, pScreenY, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Nickname label
      const name = room.players[p.uid]?.nickname || 'Player';
      ctx.font = 'bold 11px Outfit, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(name, p.x, pScreenY - 18);
      ctx.restore();
    });
  }, [myPlayer.y, gameState, playerUid, room.players]);

  const progressPercent = Math.min(100, Math.round((myPlayer.y / COURSE_LENGTH) * 100));

  return (
    <div className="w-full max-w-sm mx-auto flex flex-col items-center">
      {/* Progress Bar */}
      <div className="w-full bg-slate-900/80 rounded-xl p-2.5 border border-slate-700/80 mb-3">
        <div className="flex items-center justify-between text-xs font-bold text-slate-300 mb-1">
          <span className="flex items-center gap-1 text-amber-400">
            <Flag className="w-3.5 h-3.5" /> Course Progress
          </span>
          <span className="font-mono text-cyan-400">{progressPercent}%</span>
        </div>
        <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-cyan-400 rounded-full transition-all duration-150"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* 2D Canvas Arena */}
      <div className="w-full aspect-[4/5] bg-slate-950 rounded-2xl border-2 border-violet-500/40 relative overflow-hidden shadow-2xl">
        <canvas ref={canvasRef} width={400} height={500} className="w-full h-full block" />
      </div>

      {/* Mobile Touch Controls */}
      <div className="grid grid-cols-3 gap-3 w-full mt-3">
        <button
          onPointerDown={() => setInputState((s) => ({ ...s, left: true }))}
          onPointerUp={() => setInputState((s) => ({ ...s, left: false }))}
          className="btn-secondary h-14 flex items-center justify-center text-lg active:scale-95"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>

        <button
          onPointerDown={() => setInputState((s) => ({ ...s, forward: true }))}
          onPointerUp={() => setInputState((s) => ({ ...s, forward: false }))}
          className="btn-primary h-14 flex items-center justify-center text-lg active:scale-95 bg-gradient-to-tr from-cyan-600 to-blue-600"
        >
          <ArrowUp className="w-6 h-6" />
        </button>

        <button
          onPointerDown={() => setInputState((s) => ({ ...s, right: true }))}
          onPointerUp={() => setInputState((s) => ({ ...s, right: false }))}
          className="btn-secondary h-14 flex items-center justify-center text-lg active:scale-95"
        >
          <ArrowRight className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
};
