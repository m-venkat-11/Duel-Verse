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
    const nextLane = Math.max(0, Math.min(2, currentLane + delta));
    if (nextLane !== currentLane) {
      simLanes.current[playerUid] = nextLane;
      soundService.playMove();
      onDispatchAction('RUNNER_LANE', { targetLane: nextLane });
    }
  };

  const handleNitro = () => {
    if (!nitroAvailable) return;
    setNitroAvailable(false);
    simSpeeds.current[playerUid] = 38; // boost
    soundService.playSignalAlert?.();
    setTimeout(() => {
      simSpeeds.current[playerUid] = 22;
    }, 1200);
    setTimeout(() => {
      setNitroAvailable(true);
    }, 4000);
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

    const W = 640;
    const H = 480;
    const COURSE_MAX = 1000;

    let finishReported = false;

    const update = (dt: number) => {
      juice.update(dt);

      // Smooth lane visual interpolation
      for (const uid of [p1Uid, p2Uid]) {
        const target = simLanes.current[uid] ?? 1;
        visualLanes.current[uid] += (target - visualLanes.current[uid]) * 0.25;

        // Advance distance
        const speed = simSpeeds.current[uid] ?? 22;
        simDistances.current[uid] += speed * dt;

        // Check hazard collisions for each player
        const dist = simDistances.current[uid];
        for (const h of gameState.hazards) {
          if (Math.abs(dist - h.distance) < 8) {
            const currentLane = simLanes.current[uid];
            if (currentLane === h.lane) {
              if (h.type === 'boost') {
                simSpeeds.current[uid] = 36;
                juice.emitSparks(W / 2, H / 2, 10, '#10b981', '#34d399', 3);
                soundService.playScore();
                setTimeout(() => { simSpeeds.current[uid] = 22; }, 1000);
              } else {
                // Stumble on barrier or EMP
                simSpeeds.current[uid] = 10;
                juice.addTrauma(0.25);
                soundService.playFalseStart();
                setTimeout(() => { simSpeeds.current[uid] = 22; }, 800);
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

      // CyberBot AI Lane Dodging
      if (isHost && isBotPlaying) {
        const botDist = simDistances.current[p2Uid];
        // Look ahead 40-70m for hazards
        const upcomingHazard = gameState.hazards.find(
          (h) => h.distance > botDist + 15 && h.distance < botDist + 65
        );
        if (upcomingHazard) {
          if (upcomingHazard.type === 'boost') {
            // Seek boost pad
            simLanes.current[p2Uid] = upcomingHazard.lane;
          } else if (upcomingHazard.lane === simLanes.current[p2Uid]) {
            // Dodge obstacle into alternate lane
            simLanes.current[p2Uid] = (upcomingHazard.lane + 1) % 3;
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

      // Deep cyber background
      ctx.fillStyle = '#060913';
      ctx.fillRect(0, 0, W, H);

      // Render 2 Dual Split Tracks (Top Track = P1, Bottom Track = P2)
      const trackH = 210;
      const tracks = [
        { uid: p1Uid, name: p1Nickname, topY: 20, color: '#f59e0b', trackLabel: 'PLAYER 1 TRACK' },
        { uid: p2Uid, name: p2Nickname, topY: 250, color: '#06b6d4', trackLabel: 'PLAYER 2 TRACK' }
      ];

      tracks.forEach((track, tIdx) => {
        const myDist = simDistances.current[track.uid] || 0;
        const vLane = visualLanes.current[track.uid] || 1;

        // Track surface with perspective gradient
        const surfGrad = ctx.createLinearGradient(0, track.topY, W, track.topY);
        surfGrad.addColorStop(0, '#0f172a');
        surfGrad.addColorStop(0.5, '#1e293b');
        surfGrad.addColorStop(1, '#0f172a');
        ctx.fillStyle = surfGrad;
        ctx.fillRect(20, track.topY, W - 40, trackH);

        // Neon border
        ctx.strokeStyle = track.color;
        ctx.lineWidth = 2;
        ctx.strokeRect(20, track.topY, W - 40, trackH);

        // 3 Highway Lanes (Lane 0 = top, Lane 1 = mid, Lane 2 = bottom)
        const laneHeight = trackH / 3;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.setLineDash([16, 20]);
        // Fast horizontal scrolling effect
        ctx.lineDashOffset = -(myDist * 6) % 36;
        for (let l = 1; l < 3; l++) {
          ctx.beginPath();
          ctx.moveTo(20, track.topY + l * laneHeight);
          ctx.lineTo(W - 20, track.topY + l * laneHeight);
          ctx.stroke();
        }
        ctx.setLineDash([]);

        // Render Hazards on this Track
        for (const h of gameState.hazards) {
          const relDist = h.distance - myDist;
          // Visible window ahead: 0 to 180m
          if (relDist >= -20 && relDist <= 180) {
            const hx = 90 + (relDist / 180) * (W - 140);
            const hy = track.topY + h.lane * laneHeight + laneHeight / 2;

            if (h.type === 'boost') {
              // Green Turbo Pad
              ctx.fillStyle = '#10b981';
              ctx.shadowColor = '#10b981';
              ctx.shadowBlur = 12;
              ctx.beginPath();
              ctx.roundRect(hx - 14, hy - 16, 28, 32, 6);
              ctx.fill();
              ctx.shadowBlur = 0;
              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 16px sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText('⚡', hx, hy + 5);
            } else {
              // Red Laser Barrier or EMP
              ctx.fillStyle = '#f43f5e';
              ctx.shadowColor = '#f43f5e';
              ctx.shadowBlur = 14;
              ctx.beginPath();
              ctx.roundRect(hx - 12, hy - 20, 24, 40, 6);
              ctx.fill();
              ctx.shadowBlur = 0;
              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 16px sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText('⚠️', hx, hy + 5);
            }
          }
        }

        // Render Cyber Racer Vehicle
        const racerX = 90;
        const racerY = track.topY + vLane * laneHeight + laneHeight / 2;

        ctx.save();
        ctx.translate(racerX, racerY);

        // Thruster flame exhaust
        ctx.fillStyle = track.color;
        ctx.shadowColor = track.color;
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.moveTo(-16, -6);
        ctx.lineTo(-30 - Math.random() * 8, 0);
        ctx.lineTo(-16, 6);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;

        // Armored Racer Chassis
        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = track.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-16, -14, 34, 28, 8);
        ctx.fill();
        ctx.stroke();

        // Cockpit Neon Glass
        ctx.fillStyle = track.color;
        ctx.beginPath();
        ctx.roundRect(0, -7, 12, 14, 4);
        ctx.fill();

        ctx.restore();

        // Track Name & Speed HUD
        ctx.fillStyle = track.color;
        ctx.font = 'bold 12px "Outfit", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${track.name.toUpperCase()} • ${Math.round(myDist)}m / 1000m`, 30, track.topY + 18);
      });

      // Finish Arch / Winner Celebration
      if (winnerName) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fbbf24';
        ctx.font = '900 36px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 20;
        ctx.fillText(`🏆 ${winnerName.toUpperCase()} WON THE RACE!`, W / 2, H / 2);
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
