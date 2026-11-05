import React, { useEffect, useRef, useState } from 'react';
import type { AuthoritativeRoomState } from '../../types/room';
import type { SumoSpinState, SumoSpinner } from '../../engine/sumoSpinEngine';
import { GameLoop } from '../../engine/core/GameLoop';
import { CanvasManager } from '../../engine/core/CanvasManager';
import { JuiceEngine } from '../../engine/core/JuiceEngine';
import { soundService } from '../../services/sound';
import { Zap, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Shield } from 'lucide-react';

interface SumoSpinViewProps {
  room: AuthoritativeRoomState<SumoSpinState>;
  playerUid: string;
  onDispatchAction: (type: string, payload: any) => void;
}

export const SumoSpinView: React.FC<SumoSpinViewProps> = ({
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
  const roundWinnerNameRef = useRef<string | null>(null);
  const [boostReady, setBoostReady] = useState<boolean>(true);

  // Input states
  const keysDown = useRef<{ [key: string]: boolean }>({});
  const mobileInput = useRef({ up: false, down: false, left: false, right: false, boost: false });

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysDown.current[e.key.toLowerCase()] = true;
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysDown.current[e.key.toLowerCase()] = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasMgr = new CanvasManager(canvas);
    const juice = new JuiceEngine(350);

    const W = 600;
    const H = 480;
    const ARENA_CX = W / 2;
    const ARENA_CY = H / 2;
    const ARENA_R = 175;
    const SPINNER_R = 22;

    const spinners: Record<string, SumoSpinner> = {
      [p1Uid]: {
        x: ARENA_CX - 90,
        y: ARENA_CY,
        vx: 0,
        vy: 0,
        angle: 0,
        spinRpm: 18,
        alive: true,
        boostCooldown: 0
      },
      [p2Uid]: {
        x: ARENA_CX + 90,
        y: ARENA_CY,
        vx: 0,
        vy: 0,
        angle: 0,
        spinRpm: -18,
        alive: true,
        boostCooldown: 0
      }
    };

    let isRoundOver = false;
    let roundPauseTimer = 0;

    const resetRoundState = () => {
      isRoundOver = false;
      roundWinnerNameRef.current = null;
      setRoundWinnerName(null);
      spinners[p1Uid].x = ARENA_CX - 90;
      spinners[p1Uid].y = ARENA_CY;
      spinners[p1Uid].vx = 0;
      spinners[p1Uid].vy = 0;
      spinners[p1Uid].alive = true;

      spinners[p2Uid].x = ARENA_CX + 90;
      spinners[p2Uid].y = ARENA_CY;
      spinners[p2Uid].vx = 0;
      spinners[p2Uid].vy = 0;
      spinners[p2Uid].alive = true;
    };

    const touchDrag = { active: false, startX: 0, startY: 0, currX: 0, currY: 0 };

    const handleCanvasPointerDown = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = W / rect.width;
      const scaleY = H / rect.height;
      const px = (e.clientX - rect.left) * scaleX;
      const py = (e.clientY - rect.top) * scaleY;

      touchDrag.active = true;
      touchDrag.startX = px;
      touchDrag.startY = py;
      touchDrag.currX = px;
      touchDrag.currY = py;
    };

    const handleCanvasPointerMove = (e: PointerEvent) => {
      if (!touchDrag.active) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = W / rect.width;
      const scaleY = H / rect.height;
      touchDrag.currX = (e.clientX - rect.left) * scaleX;
      touchDrag.currY = (e.clientY - rect.top) * scaleY;
    };

    const handleCanvasPointerUp = () => {
      touchDrag.active = false;
    };

    canvas.addEventListener('pointerdown', handleCanvasPointerDown);
    window.addEventListener('pointermove', handleCanvasPointerMove);
    window.addEventListener('pointerup', handleCanvasPointerUp);
    window.addEventListener('pointercancel', handleCanvasPointerUp);

    const update = (dt: number) => {
      juice.update(dt);

      if (isRoundOver) {
        roundPauseTimer -= dt;
        if (roundPauseTimer <= 0) {
          resetRoundState();
        }
        return;
      }

      // 1. My Spinner Steering Controls (Direct 1-Finger Touch Drag + Keyboard)
      const mySpin = spinners[playerUid];
      if (mySpin && mySpin.alive) {
        mySpin.boostCooldown = Math.max(0, mySpin.boostCooldown - dt);
        setBoostReady(mySpin.boostCooldown === 0);

        let steerX = 0;
        let steerY = 0;

        // Touch drag vector
        if (touchDrag.active) {
          const tdx = touchDrag.currX - touchDrag.startX;
          const tdy = touchDrag.currY - touchDrag.startY;
          const tdist = Math.hypot(tdx, tdy);
          if (tdist > 8) {
            const maxDrag = 65;
            const factor = Math.min(1.0, tdist / maxDrag);
            steerX = (tdx / tdist) * 5.2 * factor;
            steerY = (tdy / tdist) * 5.2 * factor;
          }
        }

        // Keyboard and Mobile Steering D-Pad
        const speed = 4.8;
        if (keysDown.current['a'] || keysDown.current['arrowleft'] || mobileInput.current.left) steerX -= speed;
        if (keysDown.current['d'] || keysDown.current['arrowright'] || mobileInput.current.right) steerX += speed;
        if (keysDown.current['w'] || keysDown.current['arrowup'] || mobileInput.current.up) steerY -= speed;
        if (keysDown.current['s'] || keysDown.current['arrowdown'] || mobileInput.current.down) steerY += speed;

        // Boost trigger
        const isBoost = (keysDown.current[' '] || mobileInput.current.boost) && mySpin.boostCooldown === 0;
        if (isBoost) {
          mySpin.boostCooldown = 2.0;
          mobileInput.current.boost = false;
          // Apply instant heavy forward dash
          const dashMag = Math.hypot(steerX, steerY) || 1;
          mySpin.vx += (steerX / dashMag) * 14;
          mySpin.vy += (steerY / dashMag) * 14;
          juice.addTrauma(0.35);
          juice.playSound('shoot');
          juice.emitSparks(mySpin.x, mySpin.y, 16, '#f59e0b', '#fbbf24', 5);
        } else {
          mySpin.vx += steerX * 0.35;
          mySpin.vy += steerY * 0.35;
        }

        // Low ice friction for spinning drift
        mySpin.vx *= 0.94;
        mySpin.vy *= 0.94;

        mySpin.x += mySpin.vx;
        mySpin.y += mySpin.vy;
        mySpin.angle += mySpin.spinRpm * dt;
      }

      // 2. CyberBot AI Steering (Aggressive Pursuer with Edge Awareness)
      if (isHost && isBotPlaying) {
        const botSpin = spinners[p2Uid];
        const humanSpin = spinners[p1Uid];

        if (botSpin && botSpin.alive && humanSpin && humanSpin.alive) {
          botSpin.boostCooldown = Math.max(0, botSpin.boostCooldown - dt);

          const dx = humanSpin.x - botSpin.x;
          const dy = humanSpin.y - botSpin.y;
          const dist = Math.hypot(dx, dy);

          const distFromCenter = Math.hypot(botSpin.x - ARENA_CX, botSpin.y - ARENA_CY);

          let steerX = (dx / (dist || 1)) * 4.4;
          let steerY = (dy / (dist || 1)) * 4.4;

          // If close to edge, steer back toward center!
          if (distFromCenter > ARENA_R - 35) {
            steerX = ((ARENA_CX - botSpin.x) / distFromCenter) * 5.0;
            steerY = ((ARENA_CY - botSpin.y) / distFromCenter) * 5.0;
          }

          // Bot boost attack if lined up with human
          if (dist < 130 && botSpin.boostCooldown === 0 && Math.random() < 0.25) {
            botSpin.boostCooldown = 2.0;
            botSpin.vx += (dx / (dist || 1)) * 13;
            botSpin.vy += (dy / (dist || 1)) * 13;
            juice.playSound('shoot');
          } else {
            botSpin.vx += steerX * 0.32;
            botSpin.vy += steerY * 0.32;
          }

          botSpin.vx *= 0.94;
          botSpin.vy *= 0.94;

          botSpin.x += botSpin.vx;
          botSpin.y += botSpin.vy;
          botSpin.angle += botSpin.spinRpm * dt;
        }
      }

      // 3. Rigid Body Impulse Clash (Restitution e = 0.90 + Tangential Sparks)
      const s1 = spinners[p1Uid];
      const s2 = spinners[p2Uid];

      if (s1 && s2 && s1.alive && s2.alive) {
        const cdx = s2.x - s1.x;
        const cdy = s2.y - s1.y;
        const cdist = Math.hypot(cdx, cdy);
        const minDist = SPINNER_R * 2;

        if (cdist < minDist && cdist > 0.001) {
          const nx = cdx / cdist;
          const ny = cdy / cdist;

          const kx = s1.vx - s2.vx;
          const ky = s1.vy - s2.vy;
          const m1 = 1.0;
          const m2 = 1.0;
          const p = (2 * (nx * kx + ny * ky)) / (m1 + m2);
          const e = 0.90; // High elastic bounce

          s1.vx -= p * m2 * nx * (1 + e);
          s1.vy -= p * m2 * ny * (1 + e);
          s2.vx += p * m1 * nx * (1 + e);
          s2.vy += p * m1 * ny * (1 + e);

          // Resolve overlap
          const overlap = 0.5 * (minDist - cdist);
          s1.x -= nx * overlap;
          s1.y -= ny * overlap;
          s2.x += nx * overlap;
          s2.y += ny * overlap;

          // Exchange rotational RPM
          const tempRpm = s1.spinRpm;
          s1.spinRpm = -s2.spinRpm * 0.95;
          s2.spinRpm = -tempRpm * 0.95;

          const impactSpeed = Math.hypot(kx, ky);
          juice.addTrauma(Math.min(0.55, 0.2 + impactSpeed * 0.04));
          juice.triggerHitStop(40);
          juice.playSound('spark');
          juice.emitSparks((s1.x + s2.x) / 2, (s1.y + s2.y) / 2, 22, '#fbbf24', '#06b6d4', 6);
        }
      }

      // 4. Ring-Out Void Detection
      for (const [uid, spin] of Object.entries(spinners)) {
        if (!spin.alive) continue;
        const distCenter = Math.hypot(spin.x - ARENA_CX, spin.y - ARENA_CY);

        if (distCenter > ARENA_R + 10) {
          // Ring out!
          spin.alive = false;
          isRoundOver = true;
          roundPauseTimer = 1.8;

          const victorUid = uid === p1Uid ? p2Uid : p1Uid;
          const victorName = victorUid === p1Uid ? p1Nickname : p2Nickname;
          roundWinnerNameRef.current = victorName;
          setRoundWinnerName(victorName);

          juice.addTrauma(0.6);
          juice.emitExplosion(spin.x, spin.y, 60);
          soundService.playGoal();

          if (isHost) {
            onDispatchAction('SUMO_RING_OUT', { fallenUid: uid, playerUid: victorUid, actingUid: victorUid });
          }
          break;
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

      // Deep cyber background void
      ctx.fillStyle = '#03050a';
      ctx.fillRect(0, 0, W, H);

      // Arena Radial Glow
      const ringGlow = ctx.createRadialGradient(ARENA_CX, ARENA_CY, 40, ARENA_CX, ARENA_CY, ARENA_R * 1.3);
      ringGlow.addColorStop(0, '#0f172a');
      ringGlow.addColorStop(0.7, '#1e1b4b');
      ringGlow.addColorStop(1, '#03050a');
      ctx.fillStyle = ringGlow;
      ctx.beginPath();
      ctx.arc(ARENA_CX, ARENA_CY, ARENA_R, 0, Math.PI * 2);
      ctx.fill();

      // Dojo Arena Outer Neon Ring
      ctx.strokeStyle = '#8b5cf6';
      ctx.lineWidth = 6;
      ctx.shadowColor = '#8b5cf6';
      ctx.shadowBlur = 25;
      ctx.beginPath();
      ctx.arc(ARENA_CX, ARENA_CY, ARENA_R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Inner danger warning circle
      ctx.strokeStyle = 'rgba(244, 63, 94, 0.4)';
      ctx.setLineDash([8, 12]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ARENA_CX, ARENA_CY, ARENA_R - 35, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Center Yin-Yang Dojo emblem
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(ARENA_CX, ARENA_CY, 40, 0, Math.PI * 2);
      ctx.stroke();

      // Render Spinners
      for (const [uid, spin] of Object.entries(spinners)) {
        if (!spin.alive) continue;

        ctx.save();
        ctx.translate(spin.x, spin.y);

        const isP1Spin = uid === p1Uid;
        const color = isP1Spin ? '#f59e0b' : '#06b6d4';
        const bladeColor = isP1Spin ? '#fbbf24' : '#38bdf8';
        const speed = Math.hypot(spin.vx, spin.vy);

        // Velocity trail
        ctx.rotate(spin.angle);
        const trailLen = Math.min(50, speed * 8);
        if (trailLen > 2) {
          const trailGrad = ctx.createLinearGradient(0, 0, 0, trailLen);
          trailGrad.addColorStop(0, `${color}80`);
          trailGrad.addColorStop(1, 'transparent');
          ctx.fillStyle = trailGrad;
          ctx.beginPath();
          ctx.ellipse(0, trailLen * 0.5, SPINNER_R * 0.5, trailLen * 0.5, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        ctx.save();
        ctx.translate(spin.x, spin.y);
        ctx.rotate(spin.angle);

        // Outer ring
        ctx.strokeStyle = bladeColor;
        ctx.lineWidth = 3;
        ctx.shadowColor = color;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(0, 0, SPINNER_R, 0, Math.PI * 2);
        ctx.stroke();

        // 6 blades (hexagonal beyblade style)
        ctx.fillStyle = bladeColor;
        for (let i = 0; i < 6; i++) {
          ctx.rotate((Math.PI * 2) / 6);
          ctx.beginPath();
          ctx.moveTo(-SPINNER_R + 7, -5);
          ctx.lineTo(-SPINNER_R - 10, 0);
          ctx.lineTo(-SPINNER_R + 7, 5);
          ctx.closePath();
          ctx.fill();
        }
        ctx.shadowBlur = 0;

        // Hexagonal center core pattern
        ctx.fillStyle = color;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2;
          const hx = Math.cos(ang) * (SPINNER_R - 8);
          const hy = Math.sin(ang) * (SPINNER_R - 8);
          if (i === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.fill();

        // Inner dark disc
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(0, 0, 11, 0, Math.PI * 2);
        ctx.fill();

        // Central gem
        ctx.fillStyle = uid === playerUid ? '#ffffff' : '#94a3b8';
        ctx.shadowColor = uid === playerUid ? '#ffffff' : color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.restore();

        // "YOU" / name label above spinner
        ctx.save();
        ctx.font = `bold 11px sans-serif`;
        ctx.textAlign = 'center';
        if (uid === playerUid) {
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = color;
          ctx.shadowBlur = 8;
          ctx.fillText('▼ YOU', spin.x, spin.y - SPINNER_R - 8);
        } else {
          ctx.fillStyle = color;
          ctx.fillText(uid === p1Uid ? p1Nickname.substring(0, 8) : p2Nickname.substring(0, 8), spin.x, spin.y - SPINNER_R - 8);
        }
        ctx.shadowBlur = 0;
        ctx.restore();
      }

      // Interactive Touch-Drag Joystick Visual Guide
      if (touchDrag.active) {
        ctx.save();
        ctx.strokeStyle = 'rgba(139, 92, 246, 0.4)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(touchDrag.startX, touchDrag.startY, 36, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(6, 182, 212, 0.6)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(touchDrag.startX, touchDrag.startY);
        ctx.lineTo(touchDrag.currX, touchDrag.currY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#06b6d4';
        ctx.shadowColor = '#06b6d4';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(touchDrag.currX, touchDrag.currY, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();
      }

      // Particles
      juice.renderParticles(ctx, 1.0);

      // Round Winner Overlay
      const curWinner = roundWinnerNameRef.current || roundWinnerName;
      if (curWinner) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fbbf24';
        ctx.font = '900 36px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 20;
        ctx.fillText(`💥 ${curWinner.toUpperCase()} SCORED!`, W / 2, H / 2);
        ctx.shadowBlur = 0;
      }

      ctx.restore();
    };

    const loop = new GameLoop({ update, render });
    loop.start();

    return () => loop.stop();
  }, [p1Uid, p2Uid, isHost, isBotPlaying, p1Nickname, p2Nickname, onDispatchAction]);

  const p1Score = gameState.scores?.[p1Uid] || 0;
  const p2Score = gameState.scores?.[p2Uid] || 0;

  return (
    <div ref={containerRef} className="w-full max-w-2xl mx-auto flex flex-col items-center select-none gap-2.5 px-2">
      {/* Top Score HUD */}
      <div className="w-full flex items-center justify-between px-4 py-2.5 rounded-2xl bg-slate-900/90 border border-slate-700/60 text-xs font-black font-mono shadow-md backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="text-amber-400 font-bold">{p1Nickname}</span>
          <span className="text-sm font-black text-amber-300 font-['Outfit']">W: {p1Score}</span>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-600/20 text-violet-300 border border-violet-500/40 text-[11px] font-mono">
          <Shield className="w-3.5 h-3.5 text-violet-400" />
          <span>FIRST TO {room.maxRounds || gameState.targetScore || 3} RING-OUTS</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-black text-cyan-300 font-['Outfit']">W: {p2Score}</span>
          <span className="text-cyan-400 font-bold">{p2Nickname}</span>
        </div>
      </div>

      {/* Sumo Spinners Arena Canvas */}
      <div className="w-full aspect-[4/3] rounded-3xl overflow-hidden shadow-2xl border-2 border-violet-500/40 relative bg-slate-950">
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>

      {/* Mobile Touch D-Pad & Slam Boost */}
      <div className="w-full flex items-center justify-between gap-3 max-w-md pt-1">
        {/* Compact Directional D-Pad */}
        <div className="grid grid-cols-3 gap-1.5 p-1.5 bg-slate-900/90 rounded-2xl border border-slate-700/60 shadow-lg select-none">
          <div />
          <button
            onPointerDown={() => { mobileInput.current.up = true; }}
            onPointerUp={() => { mobileInput.current.up = false; }}
            onPointerLeave={() => { mobileInput.current.up = false; }}
            className="w-11 h-11 rounded-xl bg-slate-800 active:bg-violet-600 border border-slate-700 flex items-center justify-center text-slate-200 active:text-white shadow active:scale-95 touch-manipulation"
          >
            <ArrowUp className="w-5 h-5" />
          </button>
          <div />

          <button
            onPointerDown={() => { mobileInput.current.left = true; }}
            onPointerUp={() => { mobileInput.current.left = false; }}
            onPointerLeave={() => { mobileInput.current.left = false; }}
            className="w-11 h-11 rounded-xl bg-slate-800 active:bg-violet-600 border border-slate-700 flex items-center justify-center text-slate-200 active:text-white shadow active:scale-95 touch-manipulation"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <button
            onPointerDown={() => { mobileInput.current.down = true; }}
            onPointerUp={() => { mobileInput.current.down = false; }}
            onPointerLeave={() => { mobileInput.current.down = false; }}
            className="w-11 h-11 rounded-xl bg-slate-800 active:bg-violet-600 border border-slate-700 flex items-center justify-center text-slate-200 active:text-white shadow active:scale-95 touch-manipulation"
          >
            <ArrowDown className="w-5 h-5" />
          </button>
          <button
            onPointerDown={() => { mobileInput.current.right = true; }}
            onPointerUp={() => { mobileInput.current.right = false; }}
            onPointerLeave={() => { mobileInput.current.right = false; }}
            className="w-11 h-11 rounded-xl bg-slate-800 active:bg-violet-600 border border-slate-700 flex items-center justify-center text-slate-200 active:text-white shadow active:scale-95 touch-manipulation"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>

        {/* Slam Boost Trigger */}
        <div className="flex-1 flex flex-col items-stretch h-full">
          <button
            onClick={() => { mobileInput.current.boost = true; }}
            disabled={!boostReady}
            className={`w-full h-[100px] rounded-2xl font-black font-['Outfit'] text-base flex flex-col items-center justify-center gap-1.5 shadow-2xl active:scale-95 transition border-2 touch-manipulation ${
              boostReady
                ? 'bg-gradient-to-r from-amber-500 to-rose-500 border-amber-300 text-slate-950 shadow-amber-500/30'
                : 'bg-slate-800 border-slate-700 text-slate-500 opacity-60'
            }`}
          >
            <Zap className="w-6 h-6 fill-current animate-pulse" />
            <span className="text-sm font-extrabold">{boostReady ? 'SLAM DASH!' : 'CHARGING'}</span>
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-400 font-mono text-center">
        ⚡ Touch & drag on canvas to steer • Spacebar / Tap for Slam Dash!
      </p>
    </div>
  );
};
