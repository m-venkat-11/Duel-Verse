import React, { useEffect, useRef } from 'react';
import type { PongState } from '../../types/game';
import type { AuthoritativeRoomState } from '../../types/room';
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
  const gameState = room.gameState;
  const isHost = room.hostUid === playerUid;
  const courtRef = useRef<HTMLDivElement | null>(null);

  const players = Object.keys(room.players);
  const isBottomPlayer = players[0] === playerUid;
  const bottomUid = players[0] || 'p1';
  const topUid = players[1] || 'p2';

  // Host runs authoritative physics tick loop
  useEffect(() => {
    if (!isHost || room.status !== 'playing') return;

    const interval = setInterval(() => {
      onDispatchAction('PONG_STEP', {});
    }, 1000 / 60);

    return () => clearInterval(interval);
  }, [isHost, room.status, onDispatchAction]);

  // Touch & Pointer Drag paddle control
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!courtRef.current) return;
    const rect = courtRef.current.getBoundingClientRect();
    const xPos = ((e.clientX - rect.left) / rect.width) * 100;
    onDispatchAction('PONG_PADDLE', { xPos });
  };

  const bottomPaddleX = gameState.paddles[bottomUid] ?? 50;
  const topPaddleX = gameState.paddles[topUid] ?? 50;

  return (
    <div className="w-full max-w-sm mx-auto flex flex-col items-center">
      {/* Target score status */}
      <div className="mb-2 text-xs font-bold font-mono text-cyan-400">
        TARGET: FIRST TO {gameState.targetScore} GOALS
      </div>

      {/* Pong Court */}
      <div
        ref={courtRef}
        onPointerMove={handlePointerMove}
        className="w-full aspect-[3/4] bg-slate-950/95 border-2 border-cyan-500/40 rounded-2xl relative overflow-hidden shadow-2xl cursor-crosshair select-none touch-none"
      >
        {/* Center Net Line */}
        <div className="absolute top-1/2 left-0 right-0 h-0.5 border-b border-dashed border-cyan-500/30" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border border-cyan-500/20" />

        {/* Top Paddle (Player 2) */}
        <div
          style={{ left: `${topPaddleX}%` }}
          className="absolute top-2 -translate-x-1/2 w-20 h-3 rounded-full bg-rose-500 border border-rose-300 shadow-lg shadow-rose-500/50 transition-all duration-75"
        />

        {/* Bottom Paddle (Player 1) */}
        <div
          style={{ left: `${bottomPaddleX}%` }}
          className="absolute bottom-2 -translate-x-1/2 w-20 h-3 rounded-full bg-amber-400 border border-amber-200 shadow-lg shadow-amber-400/50 transition-all duration-75"
        />

        {/* Ball */}
        <div
          style={{ left: `${gameState.ballX}%`, top: `${gameState.ballY}%` }}
          className="absolute -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-cyan-300 shadow-lg shadow-cyan-400/80 border border-white"
        />

        {/* Scored Notification Overlay */}
        {gameState.roundState === 'scored' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <span className="text-2xl font-black font-['Outfit'] text-amber-400 animate-bounce">
              GOAL!
            </span>
          </div>
        )}
      </div>

      {/* Touch Control Helper */}
      <p className="text-[11px] text-slate-400 mt-2 font-medium">
        {isBottomPlayer ? 'Drag thumb horizontally to slide bottom paddle' : 'Drag thumb horizontally to slide top paddle'}
      </p>
    </div>
  );
};
