import React, { useEffect, useRef, useState } from 'react';
import type { AuthoritativeRoomState } from '../../types/room';
import type { ObstacleRushState } from '../../engine/obstacleRushEngine';
import { GameLoop } from '../../engine/core/GameLoop';
import { CanvasManager } from '../../engine/core/CanvasManager';
import { JuiceEngine } from '../../engine/core/JuiceEngine';
import { soundService } from '../../services/sound';
import { ChevronLeft, ChevronRight, Zap } from 'lucide-react';

interface ObstacleRushViewProps {
  room: AuthoritativeRoomState<ObstacleRushState>;
  playerUid: string;
  onDispatchAction: (type: string, payload: any) => void;
}

export const ObstacleRushView: React.FC<ObstacleRushViewProps> = ({ room, playerUid, onDispatchAction }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const gameState = room.gameState;
  const players = Object.keys(room.players);
  const p1Uid = players[0] || 'p1';
  const p2Uid = players[1] || 'p2';
  const isP1 = playerUid === p1Uid;
  const isHost = room.hostUid === playerUid;
  const isBotPlaying = Boolean(room.players['bot_rival'] || p2Uid === 'bot_rival');

  const p1Nickname = room.players[p1Uid]?.nickname || 'Player 1';
  const p2Nickname = room.players[p2Uid]?.nickname || 'CyberBot AI';

  const [winnerName, setWinnerName]   = useState<string | null>(null);
  const winnerNameRef                 = useRef<string | null>(null);
  const [nitroReady, setNitroReady]   = useState(true);
  const [nitroCool, setNitroCool]     = useState(0); // 0–100 for ring display

  const simDistances = useRef<{ [uid: string]: number }>({ [p1Uid]: 0, [p2Uid]: 0 });
  const simSpeeds    = useRef<{ [uid: string]: number }>({ [p1Uid]: 20, [p2Uid]: 20 });
  const simLanes     = useRef<{ [uid: string]: number }>({ [p1Uid]: 1, [p2Uid]: 2 });
  const visualLanes  = useRef<{ [uid: string]: number }>({ [p1Uid]: 1, [p2Uid]: 2 });
  const nitroCoolRef = useRef(0);

  const handleSwitchLane = (delta: number) => {
    const cur  = simLanes.current[playerUid] ?? 1;
    const next = Math.max(0, Math.min(3, cur + delta));
    if (next !== cur) {
      simLanes.current[playerUid] = next;
      soundService.playMove();
      onDispatchAction('RUNNER_LANE', { targetLane: next });
    }
  };

  const handleNitro = () => {
    if (!nitroReady) return;
    setNitroReady(false);
    nitroCoolRef.current = 100;
    setNitroCool(100);
    simSpeeds.current[playerUid] = 44;
    soundService.playSignalAlert?.();

    // Nitro boosts 1.5s, then recharge over 3.5s
    setTimeout(() => { simSpeeds.current[playerUid] = 22; }, 1500);

    const RECHARGE_MS = 3500;
    const step = 50;
    const decrement = (100 / (RECHARGE_MS / step));
    const id = setInterval(() => {
      nitroCoolRef.current = Math.max(0, nitroCoolRef.current - decrement);
      setNitroCool(Math.round(nitroCoolRef.current));
      if (nitroCoolRef.current <= 0) {
        clearInterval(id);
        setNitroReady(true);
        setNitroCool(0);
      }
    }, step);
  };

  // Keyboard controls
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a')   handleSwitchLane(-1);
      else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') handleSwitchLane(1);
      else if (e.key === ' ' || e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') {
        e.preventDefault(); handleNitro();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nitroReady]);

  // 60 FPS game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasMgr = new CanvasManager(canvas);
    const juice = new JuiceEngine(300);

    const W = 520;
    const H = 640;
    const LANES = 4;
    const COURSE_MAX = 1000;
    const LANE_W = (W - 80) / LANES; // each lane width
    const LANE_LEFT = 40; // left border start

    let finishReported = false;

    // Touch swipe
    let touchStartX = 0;
    const onTouchStart = (e: TouchEvent) => { if (e.touches[0]) touchStartX = e.touches[0].clientX; };
    const onTouchEnd   = (e: TouchEvent) => {
      if (!e.changedTouches[0]) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (dx < -28) handleSwitchLane(-1);
      else if (dx > 28) handleSwitchLane(1);
    };
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchend',   onTouchEnd,   { passive: true });

    // Horizon vanishing point
    const VP_Y = H * 0.28; // vertical horizon position
    const VP_X = W / 2;

    function laneXAtY(lane: number, y: number): number {
      // Map lane (0-3) to x at given y, with perspective convergence to VP
      const t = (y - VP_Y) / (H - VP_Y); // 0 at horizon, 1 at bottom
      const totalW = W - 80;
      const startX = 40 + lane * LANE_W + LANE_W / 2;
      return VP_X + (startX - VP_X) * t;
    }

    function drawCar(ctx: CanvasRenderingContext2D, laneVis: number, yPos: number, color: string, glow: string, isPlayer: boolean, name: string) {
      const cx = laneXAtY(laneVis, yPos);
      const scale = Math.max(0.2, (yPos - VP_Y) / (H - VP_Y));
      const cw = 38 * scale;
      const ch = 60 * scale;

      ctx.save();
      ctx.translate(cx, yPos);

      // Glow
      ctx.shadowColor = glow;
      ctx.shadowBlur = 20 * scale;

      // Exhaust flame
      const flameH = (10 + Math.random() * 8) * scale;
      const flameGrad = ctx.createLinearGradient(0, ch * 0.4, 0, ch * 0.4 + flameH);
      flameGrad.addColorStop(0, glow);
      flameGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = flameGrad;
      ctx.beginPath();
      ctx.ellipse(0, ch * 0.4, cw * 0.3, flameH, 0, 0, Math.PI * 2);
      ctx.fill();

      // Car body
      ctx.fillStyle = '#0d1b2e';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2 * scale;
      ctx.beginPath();
      const bodyPath = [
        [-cw * 0.5, ch * 0.4],
        [-cw * 0.5, -ch * 0.1],
        [-cw * 0.35, -ch * 0.42],
        [cw * 0.35,  -ch * 0.42],
        [cw * 0.5,  -ch * 0.1],
        [cw * 0.5,   ch * 0.4],
      ];
      ctx.moveTo(bodyPath[0][0], bodyPath[0][1]);
      for (let i = 1; i < bodyPath.length; i++) ctx.lineTo(bodyPath[i][0], bodyPath[i][1]);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Cockpit
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.roundRect(-cw * 0.3, -ch * 0.38, cw * 0.6, ch * 0.3, 4 * scale);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Headlights
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = color;
      ctx.shadowBlur = 8 * scale;
      ctx.beginPath(); ctx.ellipse(-cw * 0.3, -ch * 0.42, cw * 0.09, cw * 0.06, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse( cw * 0.3, -ch * 0.42, cw * 0.09, cw * 0.06, 0, 0, Math.PI * 2); ctx.fill();

      // Wheels (4 corners)
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1 * scale;
      const wheels = [[-cw*0.5, -ch*0.12],[cw*0.5,-ch*0.12],[-cw*0.5,ch*0.3],[cw*0.5,ch*0.3]];
      wheels.forEach(([wx, wy]) => {
        ctx.beginPath();
        ctx.ellipse(wx, wy, cw*0.14, cw*0.1, 0, 0, Math.PI*2);
        ctx.fill(); ctx.stroke();
      });

      ctx.shadowBlur = 0;

      // Name label
      if (isPlayer) {
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.max(9, 11 * scale)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('▼ YOU', 0, -ch * 0.52);
      } else {
        ctx.fillStyle = color;
        ctx.font = `bold ${Math.max(8, 9 * scale)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(name.substring(0, 8), 0, -ch * 0.52);
      }

      ctx.restore();
    }

    const update = (dt: number) => {
      juice.update(dt);
      const d1 = simDistances.current[p1Uid] || 0;
      const d2 = simDistances.current[p2Uid] || 0;
      const l1 = simLanes.current[p1Uid] ?? 1;
      const l2 = simLanes.current[p2Uid] ?? 2;

      for (const uid of [p1Uid, p2Uid]) {
        const target = simLanes.current[uid] ?? 1;
        visualLanes.current[uid] += (target - visualLanes.current[uid]) * 0.22;

        let speed = simSpeeds.current[uid] ?? 22;
        const otherUid = uid === p1Uid ? p2Uid : p1Uid;
        const myDist = simDistances.current[uid];
        const otherDist = simDistances.current[otherUid];

        // Slipstream
        if (simLanes.current[uid] === simLanes.current[otherUid] && otherDist > myDist && (otherDist - myDist) < 55) {
          speed *= 1.22;
        }

        simDistances.current[uid] += speed * dt;

        // Hazard collisions
        const dist = simDistances.current[uid];
        for (const h of gameState.hazards) {
          if (Math.abs(dist - h.distance) < 10 && simLanes.current[uid] === h.lane) {
            if (h.type === 'boost') {
              simSpeeds.current[uid] = Math.max(simSpeeds.current[uid], 42);
              juice.emitSparks(W/2, H*0.6, 12, '#10b981', '#34d399', 4);
              setTimeout(() => { if (simSpeeds.current[uid] > 24) simSpeeds.current[uid] = 24; }, 900);
            } else {
              simSpeeds.current[uid] = 10;
              juice.addTrauma(0.4);
              setTimeout(() => { simSpeeds.current[uid] = 22; }, 850);
            }
          }
        }

        if (simDistances.current[uid] >= COURSE_MAX && !finishReported) {
          finishReported = true;
          const name = uid === p1Uid ? p1Nickname : p2Nickname;
          winnerNameRef.current = name;
          setWinnerName(name);
          soundService.playVictory();
          if (isHost) onDispatchAction('RUNNER_FINISH', { winnerUid: uid, actingUid: uid });
        }
      }

      // Bot AI
      if (isHost && isBotPlaying) {
        const botDist = simDistances.current[p2Uid];
        const botLane = simLanes.current[p2Uid];
        const ahead = gameState.hazards.find(h => h.distance > botDist + 10 && h.distance < botDist + 70);
        if (ahead) {
          if (ahead.type === 'boost') simLanes.current[p2Uid] = ahead.lane;
          else if (ahead.lane === botLane) simLanes.current[p2Uid] = (ahead.lane + 1) % 4;
        } else if (Math.random() < 0.018) {
          if (d1 > d2 && Math.random() < 0.5) simLanes.current[p2Uid] = l1;
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

      // === SKY / BACKGROUND ===
      const skyGrad = ctx.createLinearGradient(0, 0, 0, VP_Y);
      skyGrad.addColorStop(0, '#060a18');
      skyGrad.addColorStop(1, '#0f1c3f');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, W, VP_Y + 2);

      // Neon city silhouette
      ctx.fillStyle = '#0d1428';
      const buildings = [
        [30,VP_Y-45,50,45],[90,VP_Y-70,40,70],[140,VP_Y-30,30,30],
        [340,VP_Y-55,45,55],[400,VP_Y-80,50,80],[460,VP_Y-35,40,35],
      ];
      buildings.forEach(([bx,by,bw,bh]) => {
        ctx.fillRect(bx,by,bw,bh);
        // Windows
        ctx.fillStyle = `rgba(6,182,212,${0.3+Math.random()*0.3})`;
        for(let r=0;r<3;r++) for(let c=0;c<3;c++) {
          if(Math.random()>0.4) ctx.fillRect(bx+6+c*12, by+8+r*14, 7,9);
        }
        ctx.fillStyle = '#0d1428';
      });

      // === ROAD SURFACE (perspective) ===
      const roadGrad = ctx.createLinearGradient(0, VP_Y, 0, H);
      roadGrad.addColorStop(0, '#0c1322');
      roadGrad.addColorStop(0.5, '#111827');
      roadGrad.addColorStop(1, '#0a0f1e');
      ctx.fillStyle = roadGrad;
      ctx.beginPath();
      ctx.moveTo(LANE_LEFT, VP_Y);
      ctx.lineTo(W - LANE_LEFT, VP_Y);
      ctx.lineTo(W - LANE_LEFT, H);
      ctx.lineTo(LANE_LEFT, H);
      ctx.closePath();
      ctx.fill();

      // Road border neon rails
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#06b6d4'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.moveTo(LANE_LEFT, VP_Y); ctx.lineTo(LANE_LEFT, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W - LANE_LEFT, VP_Y); ctx.lineTo(W - LANE_LEFT, H); ctx.stroke();
      ctx.shadowBlur = 0;

      // Lane dividers (perspective dashes)
      const playerDist = simDistances.current[playerUid] || 0;
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 2;
      for (let l = 1; l < LANES; l++) {
        // Draw dash lines converging to VP
        const NUM_DASHES = 12;
        for (let d = 0; d < NUM_DASHES; d++) {
          const t0 = d / NUM_DASHES;
          const t1 = (d + 0.45) / NUM_DASHES;
          const y0 = VP_Y + (H - VP_Y) * t0;
          const y1 = VP_Y + (H - VP_Y) * t1;
          const x0 = VP_X + ((LANE_LEFT + l * LANE_W) - VP_X) * t0;
          const x1 = VP_X + ((LANE_LEFT + l * LANE_W) - VP_X) * t1;
          // Scroll offset
          const scroll = (playerDist * 0.3) % (H / NUM_DASHES / (H - VP_Y) * H);
          if ((d + Math.floor(scroll)) % 2 === 0) {
            ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
          }
        }
      }

      // === HAZARDS ===
      for (const h of gameState.hazards) {
        const relDist = h.distance - playerDist;
        if (relDist >= -15 && relDist <= 160) {
          const t = Math.max(0, Math.min(1, 1 - (relDist - 15) / 145));
          const hY = VP_Y + (H - VP_Y) * t;
          const hX = laneXAtY(h.lane + 0.5, hY);
          const hScale = t;
          const hw = 46 * hScale;
          const hh = 24 * hScale;

          if (h.type === 'boost') {
            ctx.fillStyle = '#10b981';
            ctx.shadowColor = '#10b981'; ctx.shadowBlur = 14;
            ctx.beginPath(); ctx.roundRect(hX - hw/2, hY - hh/2, hw, hh, 5*hScale); ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#ffffff';
            ctx.font = `bold ${Math.max(8,13*hScale)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText('⚡ BOOST', hX, hY + 4*hScale);
          } else {
            // Barrier: orange cones
            ctx.shadowColor = '#f97316'; ctx.shadowBlur = 12;
            for (let ci = -1; ci <= 1; ci++) {
              const conex = hX + ci * hw * 0.38;
              ctx.fillStyle = ci % 2 === 0 ? '#f97316' : '#fbbf24';
              ctx.beginPath();
              ctx.moveTo(conex, hY - hh * 0.9);
              ctx.lineTo(conex - 8*hScale, hY + hh * 0.5);
              ctx.lineTo(conex + 8*hScale, hY + hh * 0.5);
              ctx.closePath();
              ctx.fill();
            }
            ctx.shadowBlur = 0;
          }
        }
      }

      // Finish line checker
      const finishRelDist = COURSE_MAX - playerDist;
      if (finishRelDist >= 0 && finishRelDist <= 160) {
        const t = Math.max(0, 1 - (finishRelDist - 15) / 145);
        const fY = VP_Y + (H - VP_Y) * t;
        const fH = 18 * t;
        const cols = 10;
        const checkW = (W - 80) / cols;
        for (let c = 0; c < cols; c++) {
          for (let r = 0; r < 2; r++) {
            const isBlack = (c + r) % 2 === 0;
            ctx.fillStyle = isBlack ? '#000000' : '#ffffff';
            ctx.fillRect(LANE_LEFT + c * checkW, fY - fH/2 + r * fH/2, checkW, fH/2);
          }
        }
      }

      // === CARS ===
      // Sort by distance (further away = render first)
      const racers = [
        { uid: p1Uid, name: p1Nickname, color: '#f59e0b', glow: '#fbbf24', isPlayer: playerUid === p1Uid },
        { uid: p2Uid, name: p2Nickname, color: '#06b6d4', glow: '#22d3ee', isPlayer: playerUid === p2Uid },
      ];
      racers.sort((a, b) => (simDistances.current[b.uid] || 0) - (simDistances.current[a.uid] || 0));

      racers.forEach((r) => {
        const rDist = simDistances.current[r.uid] || 0;
        const relDist = rDist - playerDist;
        // Map relative distance to y: 0=at player pos (bottom), positive ahead = higher up
        const t = Math.max(0.05, Math.min(0.98, 0.72 - (relDist / 180) * 0.65));
        const yPos = VP_Y + (H - VP_Y) * t;
        const vLane = visualLanes.current[r.uid] || 1;
        drawCar(canvasMgr.ctx, vLane, yPos, r.color, r.glow, r.isPlayer, r.name);
      });

      // === WIN OVERLAY ===
      const activeWinner = winnerNameRef.current || winnerName;
      if (activeWinner) {
        ctx.fillStyle = 'rgba(0,0,0,0.82)';
        ctx.fillRect(0, 0, W, H);
        ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 30;
        ctx.fillStyle = '#fbbf24';
        ctx.font = '900 38px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`🏆 ${activeWinner.toUpperCase()} WON!`, W/2, H/2 - 20);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#94a3b8';
        ctx.font = '600 16px sans-serif';
        ctx.fillText('RACE COMPLETE', W/2, H/2 + 20);
      }

      ctx.restore();

      // Juice particles on top
      canvasMgr.ctx.save();
      const scaleForParticles = canvasMgr.width / W;
      juice.renderParticles(canvasMgr.ctx, scaleForParticles);
      canvasMgr.ctx.restore();
    };

    const loop = new GameLoop({ update, render });
    loop.start();

    return () => {
      loop.stop();
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchend', onTouchEnd);
    };
  }, [p1Uid, p2Uid, isHost, isBotPlaying, p1Nickname, p2Nickname, onDispatchAction]);

  const p1Dist = simDistances.current[p1Uid] || 0;
  const p2Dist = simDistances.current[p2Uid] || 0;

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col items-center select-none gap-2.5 px-2">

      {/* Score bar */}
      <div className="w-full flex items-center justify-between px-4 py-2 rounded-2xl bg-slate-900/90 border border-slate-700/60 text-xs font-mono font-bold shadow-md">
        <span className="text-amber-400">{p1Nickname}: <span className="text-white text-sm">{room.scores[p1Uid] || 0}</span></span>
        <span className="text-slate-400 text-[11px]">🏆 FIRST TO {room.maxRounds || gameState.targetWins || 3}</span>
        <span className="text-cyan-400">{p2Nickname}: <span className="text-white text-sm">{room.scores[p2Uid] || 0}</span></span>
      </div>

      {/* Race progress */}
      <div className="w-full p-3 rounded-2xl bg-slate-900/90 border border-slate-700/50 shadow-md">
        <div className="flex items-center justify-between text-xs font-mono font-bold mb-1.5">
          <span className="text-amber-400 flex items-center gap-1">
            🚗 {Math.min(1000, Math.round(p1Dist))}m
          </span>
          <span className="text-slate-400">🏁 1000m</span>
          <span className="text-cyan-400 flex items-center gap-1">
            🚗 {Math.min(1000, Math.round(p2Dist))}m
          </span>
        </div>
        {/* Dual progress bars */}
        <div className="relative w-full h-3 bg-slate-800 rounded-full overflow-hidden">
          <div className="absolute left-0 top-0 h-full bg-gradient-to-r from-amber-600 to-amber-300 transition-all duration-75 shadow-[0_0_8px_#f59e0b]" style={{ width: `${(p1Dist/1000)*100}%` }} />
        </div>
        <div className="relative w-full h-3 bg-slate-800 rounded-full overflow-hidden mt-1">
          <div className="absolute left-0 top-0 h-full bg-gradient-to-r from-cyan-600 to-cyan-300 transition-all duration-75 shadow-[0_0_8px_#06b6d4]" style={{ width: `${(p2Dist/1000)*100}%` }} />
        </div>
        <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-0.5">
          <span className="text-amber-400/70">{p1Nickname}</span>
          <span className="text-cyan-400/70">{p2Nickname}</span>
        </div>
      </div>

      {/* Canvas */}
      <div className="w-full aspect-[4/3] rounded-3xl overflow-hidden shadow-2xl border-2 border-orange-500/40 relative bg-slate-950">
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>

      {/* Controls: Lane Left | NITRO (with ring) | Lane Right */}
      <div className="w-full grid grid-cols-3 gap-3 max-w-md pt-1">
        <button
          onClick={() => handleSwitchLane(-1)}
          onTouchEnd={(e) => { e.preventDefault(); handleSwitchLane(-1); }}
          className="h-16 rounded-2xl bg-slate-900 border-2 border-slate-700 active:scale-95 flex items-center justify-center gap-1.5 text-sm font-black font-mono text-slate-200 hover:border-cyan-400 shadow-lg touch-manipulation"
        >
          <ChevronLeft className="w-6 h-6" />
          <span className="text-sm">LEFT</span>
        </button>

        {/* Nitro button with circular progress ring */}
        <button
          onClick={handleNitro}
          disabled={!nitroReady}
          className={`h-16 rounded-2xl border-2 flex flex-col items-center justify-center gap-0.5 text-xs font-black font-mono shadow-xl active:scale-95 transition touch-manipulation relative overflow-hidden ${
            nitroReady
              ? 'bg-gradient-to-r from-emerald-500 to-teal-400 border-emerald-300 text-slate-950 shadow-emerald-500/40'
              : 'bg-slate-800 border-slate-700 text-slate-500'
          }`}
        >
          {!nitroReady && (
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="w-14 h-14 -rotate-90" viewBox="0 0 48 48">
                <circle cx="24" cy="24" r="20" fill="none" stroke="#334155" strokeWidth="4" />
                <circle
                  cx="24" cy="24" r="20" fill="none"
                  stroke="#06b6d4" strokeWidth="4"
                  strokeDasharray={`${(1 - nitroCool / 100) * 125.6} 125.6`}
                  strokeLinecap="round"
                />
              </svg>
            </div>
          )}
          <Zap className={`w-5 h-5 relative z-10 ${nitroReady ? 'fill-current' : 'text-slate-600'}`} />
          <span className="relative z-10 text-[10px]">{nitroReady ? 'NITRO!' : 'RECHARGING'}</span>
        </button>

        <button
          onClick={() => handleSwitchLane(1)}
          onTouchEnd={(e) => { e.preventDefault(); handleSwitchLane(1); }}
          className="h-16 rounded-2xl bg-slate-900 border-2 border-slate-700 active:scale-95 flex items-center justify-center gap-1.5 text-sm font-black font-mono text-slate-200 hover:border-cyan-400 shadow-lg touch-manipulation"
        >
          <span className="text-sm">RIGHT</span>
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>

      <p className="text-xs text-slate-400 font-mono text-center">
        ⌨️ A/D or ← → to switch lanes • Space / W for Nitro Boost!
      </p>
    </div>
  );
};
