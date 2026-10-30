import React, { useEffect, useRef, useState } from 'react';
import type { AuthoritativeRoomState } from '../../types/room';
import type { ObstacleRushState, RunnerHazard } from '../../engine/obstacleRushEngine';
import { GameLoop } from '../../engine/core/GameLoop';
import { CanvasManager } from '../../engine/core/CanvasManager';
import { JuiceEngine } from '../../engine/core/JuiceEngine';
import { soundService } from '../../services/sound';
import { Zap, ChevronLeft, ChevronRight, Flag, Flame, Sparkles } from 'lucide-react';

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
  const p2Nickname = room.players[p2Uid]?.nickname || 'CyberBot AI';

  const [winnerName, setWinnerName] = useState<string | null>(null);
  const [nitroAvailable, setNitroAvailable] = useState<boolean>(true);

  // Local simulated positions (interpolated at 60 FPS)
  const simDistances = useRef<{ [uid: string]: number }>({
    [p1Uid]: 0,
    [p2Uid]: 0
  });
  const simSpeeds = useRef<{ [uid: string]: number }>({
    [p1Uid]: 22,
    [p2Uid]: 22
  });
  const simLanes = useRef<{ [uid: string]: number }>({
    [p1Uid]: 1,
    [p2Uid]: 1
  });
  const visualLanes = useRef<{ [uid: string]: number }>({
    [p1Uid]: 1,
    [p2Uid]: 1
  });

  const handleSwitchLane = (delta: number) => {
    const currentLane = simLanes.current[playerUid] || 1;
    const nextLane = Math.max(0, Math.min(3, currentLane + delta));
    if (nextLane !== currentLane) {
      simLanes.current[playerUid] = nextLane;
      soundService.playMove();
      onDispatchAction('RUNNER_LANE', { targetLane: nextLane });
    }
  };

  const handleNitro = () => {
    if (!nitroAvailable) return;
    setNitroAvailable(false);
    simSpeeds.current[playerUid] = 42; // Nitro boost
    soundService.playSignalAlert?.();
    setTimeout(() => {
      simSpeeds.current[playerUid] = 24;
    }, 1400);
    setTimeout(() => {
      setNitroAvailable(true);
    }, 3800);
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') {
        handleSwitchLane(-1);
      } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') {
        handleSwitchLane(1);
      } else if (e.key === ' ' || e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') {
        handleNitro();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nitroAvailable]);

  // Main 60 FPS Simulation & Rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasMgr = new CanvasManager(canvas);
    const juice = new JuiceEngine(300);

    const W = 520;
    const H = 640;
    const COURSE_MAX = 1000;

    let finishReported = false;

    // Direct touch swipe on canvas
    let touchStartX = 0;
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches[0]) touchStartX = e.touches[0].clientX;
    };
    const handleTouchEnd = (e: TouchEvent) => {
      if (!e.changedTouches[0]) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (dx < -30) handleSwitchLane(-1);
      else if (dx > 30) handleSwitchLane(1);
    };

    canvas.addEventListener('touchstart', handleTouchStart);
    canvas.addEventListener('touchend', handleTouchEnd);

    const update = (dt: number) => {
      juice.update(dt);

      const d1 = simDistances.current[p1Uid] || 0;
      const d2 = simDistances.current[p2Uid] || 0;
      const l1 = simLanes.current[p1Uid] ?? 1;
      const l2 = simLanes.current[p2Uid] ?? 2;

      // Smooth visual lane interpolation
      for (const uid of [p1Uid, p2Uid]) {
        const target = simLanes.current[uid] ?? 1;
        visualLanes.current[uid] += (target - visualLanes.current[uid]) * 0.28;

        // Base advancement
        let speed = simSpeeds.current[uid] ?? 24;

        // Check Slipstream Drafting (car directly behind rival gets +25% boost!)
        const otherUid = uid === p1Uid ? p2Uid : p1Uid;
        const myDist = simDistances.current[uid];
        const otherDist = simDistances.current[otherUid];
        if (simLanes.current[uid] === simLanes.current[otherUid] && otherDist > myDist && (otherDist - myDist) < 55) {
          speed *= 1.25; // Aerodynamic suction!
          juice.emitSparks(W / 2, H * 0.7, 4, '#38bdf8', '#ffffff', 2);
        }

        simDistances.current[uid] += speed * dt;

        // Check hazard collisions
        const dist = simDistances.current[uid];
        for (const h of gameState.hazards) {
          if (Math.abs(dist - h.distance) < 8) {
            const currentLane = simLanes.current[uid];
            if (currentLane === h.lane) {
              if (h.type === 'boost') {
                simSpeeds.current[uid] = 40;
                juice.emitSparks(W / 2, H / 2, 14, '#10b981', '#34d399', 4);
                juice.playSound('goal');
                setTimeout(() => { simSpeeds.current[uid] = 24; }, 1000);
              } else {
                // Stumble on barrier
                simSpeeds.current[uid] = 12;
                juice.addTrauma(0.35);
                juice.playSound('thud');
                setTimeout(() => { simSpeeds.current[uid] = 24; }, 800);
              }
            }
          }
        }

        // Check course finish
        if (simDistances.current[uid] >= COURSE_MAX && !finishReported) {
          finishReported = true;
          const winnerUid = uid;
          setWinnerName(winnerUid === p1Uid ? p1Nickname : p2Nickname);
          soundService.playVictory();
          if (isHost) {
            onDispatchAction('RUNNER_FINISH', { winnerUid, actingUid: winnerUid });
          }
        }
      }

      // Check Car-on-Car Bump Shove Physics
      if (Math.abs(d1 - d2) < 18) {
        if (Math.abs(l1 - l2) <= 1 && l1 !== l2) {
          // Bumping adjacent lanes!
          juice.addTrauma(0.25);
          juice.playSound('clack');
          juice.emitSparks(W / 2, H * 0.7, 8, '#fbbf24', '#06b6d4', 3);
        }
      }

      // CyberBot AI Lane Dodging & Drafting
      if (isHost && isBotPlaying) {
        const botDist = simDistances.current[p2Uid];
        const upcomingHazard = gameState.hazards.find(
          (h) => h.distance > botDist + 15 && h.distance < botDist + 75
        );
        if (upcomingHazard) {
          if (upcomingHazard.type === 'boost') {
            simLanes.current[p2Uid] = upcomingHazard.lane;
          } else if (upcomingHazard.lane === simLanes.current[p2Uid]) {
            // Dodge into safe lane
            simLanes.current[p2Uid] = (upcomingHazard.lane + 1) % 4;
          }
        } else if (Math.random() < 0.02) {
          // Tactical drafting behind human
          if (d1 > d2 && Math.random() < 0.6) {
            simLanes.current[p2Uid] = l1;
          }
        }
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

      // 1. Asphalt Cyber Highway (Vertical 4 Lanes)
      const surfGrad = ctx.createLinearGradient(0, 0, W, 0);
      surfGrad.addColorStop(0, '#060a14');
      surfGrad.addColorStop(0.1, '#0f172a');
      surfGrad.addColorStop(0.5, '#1e293b');
      surfGrad.addColorStop(0.9, '#0f172a');
      surfGrad.addColorStop(1, '#060a14');
      ctx.fillStyle = surfGrad;
      ctx.fillRect(0, 0, W, H);

      // Track Neon Rail Guard Borders
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 4;
      ctx.strokeRect(30, 0, W - 60, H);

      // 4 Vertical Lanes (3 dashed center lines)
      const laneW = (W - 80) / 4;
      const playerDist = simDistances.current[playerUid] || 0;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.setLineDash([20, 24]);
      ctx.lineDashOffset = -(playerDist * 8) % 44;

      for (let l = 1; l < 4; l++) {
        ctx.beginPath();
        ctx.moveTo(40 + l * laneW, 0);
        ctx.lineTo(40 + l * laneW, H);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // 2. Render Road Hazards on Unified Highway
      for (const h of gameState.hazards) {
        const relDist = h.distance - playerDist;
        // Visible distance window: -20m to 140m ahead
        if (relDist >= -20 && relDist <= 140) {
          const hx = 40 + h.lane * laneW + laneW / 2;
          const hy = H * 0.75 - (relDist / 140) * (H * 0.7);

          if (h.type === 'boost') {
            ctx.fillStyle = '#10b981';
            ctx.shadowColor = '#10b981';
            ctx.shadowBlur = 15;
            ctx.beginPath();
            ctx.roundRect(hx - 22, hy - 14, 44, 28, 6);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 16px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('⚡ BOOST', hx, hy + 5);
          } else {
            ctx.fillStyle = '#f43f5e';
            ctx.shadowColor = '#f43f5e';
            ctx.shadowBlur = 15;
            ctx.beginPath();
            ctx.roundRect(hx - 22, hy - 14, 44, 28, 6);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 16px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('⚠️ WALL', hx, hy + 5);
          }
        }
      }

      // 3. Render Both Cyber Racer Vehicles (Side-by-side vertical perspective)
      const racers = [
        { uid: p1Uid, name: p1Nickname, color: '#f59e0b', glow: '#fbbf24' },
        { uid: p2Uid, name: p2Nickname, color: '#06b6d4', glow: '#22d3ee' }
      ];

      racers.forEach((r) => {
        const rDist = simDistances.current[r.uid] || 0;
        const vLane = visualLanes.current[r.uid] || 1;
        const rx = 40 + vLane * laneW + laneW / 2;
        // Y position based on relative distance to local player
        const relY = H * 0.75 - ((rDist - playerDist) / 140) * (H * 0.7);

        ctx.save();
        ctx.translate(rx, relY);

        // Rocket exhaust plume
        ctx.fillStyle = r.glow;
        ctx.shadowColor = r.glow;
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.moveTo(-10, 22);
        ctx.lineTo(0, 36 + Math.random() * 8);
        ctx.lineTo(10, 22);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;

        // Vehicle Chassis
        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = r.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(-16, -24, 32, 48, 8);
        ctx.fill();
        ctx.stroke();

        // Cockpit glass
        ctx.fillStyle = r.color;
        ctx.beginPath();
        ctx.roundRect(-8, -12, 16, 20, 4);
        ctx.fill();

        // Player Tag Indicator
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px font-mono';
        ctx.textAlign = 'center';
        ctx.fillText(r.name.substring(0, 8), 0, -30);

        ctx.restore();
      });

      // Finish Arch / Winner Celebration
      if (winnerName) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fbbf24';
        ctx.font = '900 36px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 20;
        ctx.fillText(`🏆 ${winnerName.toUpperCase()} WON!`, W / 2, H / 2);
        ctx.shadowBlur = 0;
      }

      ctx.restore();
    };

    const loop = new GameLoop({ update, render });
    loop.start();

    return () => loop.stop();
  }, [p1Uid, p2Uid, isHost, isBotPlaying, p1Nickname, p2Nickname, onDispatchAction]);

  const p1Dist = simDistances.current[p1Uid] || 0;
  const p2Dist = simDistances.current[p2Uid] || 0;

  return (
    <div ref={containerRef} className="w-full max-w-2xl mx-auto flex flex-col items-center select-none gap-2.5 px-2">
      {/* Match Score & Target Banner */}
      <div className="w-full flex items-center justify-between px-4 py-2 rounded-2xl bg-slate-900/90 border border-slate-700/60 text-xs font-mono font-bold shadow-md">
        <div className="flex items-center gap-2 text-amber-400">
          <span>{p1Nickname}:</span>
          <span className="text-white text-base font-black">{room.scores[p1Uid] || 0}</span>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-orange-950/60 border border-orange-500/30 text-[11px] text-orange-300">
          <span>🏆 TARGET:</span>
          <span className="text-white font-black">FIRST TO {room.maxRounds || gameState.targetWins || 3}</span>
        </div>
        <div className="flex items-center gap-2 text-cyan-400">
          <span>{p2Nickname}:</span>
          <span className="text-white text-base font-black">{room.scores[p2Uid] || 0}</span>
        </div>
      </div>

      {/* Race Progress Bar */}
      <div className="w-full p-3 rounded-2xl bg-slate-900/90 border border-slate-700/60 shadow-md">
        <div className="flex items-center justify-between text-xs font-mono font-bold mb-1.5">
          <span className="text-amber-400">P1: {Math.min(1000, Math.round(p1Dist))}m</span>
          <span className="text-slate-400 font-mono">🏁 1000m FINISH ARCH</span>
          <span className="text-cyan-400">P2: {Math.min(1000, Math.round(p2Dist))}m</span>
        </div>
        <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden flex relative">
          <div
            className="h-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-75"
            style={{ width: `${Math.min(100, (p1Dist / 1000) * 100)}%` }}
          />
        </div>
      </div>

      {/* Cyber Sprint Canvas */}
      <div className="w-full aspect-[4/3] rounded-3xl overflow-hidden shadow-2xl border-2 border-orange-500/40 relative bg-slate-950">
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>

      {/* Mobile Lane Switch Touch Pads & Nitro */}
      <div className="w-full grid grid-cols-3 gap-3 max-w-md pt-1">
        <button
          onClick={() => handleSwitchLane(-1)}
          className="h-14 rounded-2xl bg-slate-900 border-2 border-slate-700 active:scale-95 flex items-center justify-center gap-1 text-sm font-black font-mono text-slate-200 hover:border-cyan-400 shadow-lg"
        >
          <ChevronLeft className="w-5 h-5" />
          <span>LANE LEFT</span>
        </button>

        <button
          onClick={handleNitro}
          disabled={!nitroAvailable}
          className={`h-14 rounded-2xl border-2 flex items-center justify-center gap-1.5 text-xs font-black font-mono shadow-xl active:scale-95 transition ${
            nitroAvailable
              ? 'bg-gradient-to-r from-emerald-500 to-teal-400 border-emerald-300 text-slate-950'
              : 'bg-slate-800 border-slate-700 text-slate-500 opacity-60'
          }`}
        >
          <Zap className="w-4 h-4 fill-current" />
          <span>{nitroAvailable ? 'NITRO!' : 'RECHARGE'}</span>
        </button>

        <button
          onClick={() => handleSwitchLane(1)}
          className="h-14 rounded-2xl bg-slate-900 border-2 border-slate-700 active:scale-95 flex items-center justify-center gap-1 text-sm font-black font-mono text-slate-200 hover:border-cyan-400 shadow-lg"
        >
          <span>LANE RIGHT</span>
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <p className="text-xs text-slate-400 font-mono text-center">
        ⌨️ Desktop: A/D or Arrow Keys to switch lanes • Space for Nitro Boost!
      </p>
    </div>
  );
};
