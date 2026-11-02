import React, { useEffect, useRef, useState } from 'react';
import type { AuthoritativeRoomState } from '../../types/room';
import type { FlappySpideyState, SpideyObstacle } from '../../engine/flappySpideyEngine';
import { GameLoop } from '../../engine/core/GameLoop';
import { CanvasManager } from '../../engine/core/CanvasManager';
import { JuiceEngine } from '../../engine/core/JuiceEngine';
import { soundService } from '../../services/sound';
import { Zap, Trophy, Play, RotateCcw, Shield, Sparkles } from 'lucide-react';

interface FlappySpideyViewProps {
  room: AuthoritativeRoomState<FlappySpideyState>;
  playerUid: string;
  onDispatchAction: (type: string, payload: any) => void;
}

export const FlappySpideyView: React.FC<FlappySpideyViewProps> = ({
  room,
  playerUid
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [gameStatePhase, setGameStatePhase] = useState<'ready' | 'playing' | 'gameover'>('ready');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    return typeof window !== 'undefined'
      ? parseInt(localStorage.getItem('duelverse_spidey_high') || '0', 10)
      : 0;
  });

  // Action callback ref for keyboard & touch
  const handleFlapRef = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasMgr = new CanvasManager(canvas);
    const juice = new JuiceEngine(250);

    const W = 460;
    const H = 600;
    const SPIDEY_X = 100;
    const SPIDEY_RADIUS = 16;
    const HITBOX_RADIUS = 9; // Forgiving collision core (prevents cheap deaths)
    const GRAVITY = 0.24; // Smooth gentle floatiness (reduced from harsh 0.44)
    const FLAP_FORCE = -5.4; // Controlled, smooth web impulse (reduced from 7.4)
    const OBSTACLE_SPEED = 1.85; // Relaxed arcade scrolling speed (reduced from fast 2.8)
    const OBSTACLE_GAP = 205; // Generous clear passage (expanded from 145)

    // Simulation State
    let phase: 'ready' | 'playing' | 'gameover' = 'ready';
    let spideyY = 280;
    let spideyVy = 0;
    let spideyAngle = 0;
    let webAnchor: { x: number; y: number; life: number } | null = null;
    let currentScore = 0;

    let obstacles: SpideyObstacle[] = [];
    let skylineOffset = 0;
    let timeElapsed = 0;

    const spawnObstacle = (xPos: number) => {
      const minTop = 60;
      const maxTop = H - OBSTACLE_GAP - 90;
      const topHeight = Math.floor(minTop + Math.random() * (maxTop - minTop));
      const hasReactor = Math.random() < 0.6; // High chance of Stark Reactor bonuses
      const reactorY = topHeight + OBSTACLE_GAP / 2;

      obstacles.push({
        id: Math.random().toString(),
        x: xPos,
        width: 58,
        topHeight,
        gap: OBSTACLE_GAP,
        passed: false,
        hasReactor,
        reactorY,
        reactorCollected: false
      });
    };

    const resetGame = () => {
      phase = 'playing';
      spideyY = 280;
      spideyVy = 0;
      spideyAngle = 0;
      webAnchor = null;
      currentScore = 0;
      setScore(0);
      obstacles = [];
      setGameStatePhase('playing');
      // Generous obstacle spacing (320px apart)
      spawnObstacle(520);
      spawnObstacle(840);
      spawnObstacle(1160);
      soundService.playCountdown(0);
    };

    const triggerFlap = () => {
      if (phase === 'ready') {
        resetGame();
        return;
      }
      if (phase === 'gameover') {
        resetGame();
        return;
      }

      // Flap & web sling!
      spideyVy = FLAP_FORCE;
      spideyAngle = -0.48;
      webAnchor = {
        x: SPIDEY_X + 65,
        y: Math.max(0, spideyY - 180),
        life: 0.18
      };

      juice.playSound('spark');
      juice.emitSparks(SPIDEY_X, spideyY, 6, '#38bdf8', '#06b6d4', 2.5);
      if (navigator.vibrate) navigator.vibrate(18);
    };

    handleFlapRef.current = triggerFlap;

    const update = (dt: number) => {
      juice.update(dt);
      timeElapsed += dt;
      skylineOffset += 0.8;

      if (phase === 'ready') {
        // Gentle hovering idle motion
        spideyY = 280 + Math.sin(timeElapsed * 4) * 8;
        spideyAngle = Math.sin(timeElapsed * 4) * 0.08;
        return;
      }

      if (phase === 'playing') {
        // Spidey gravity and angle
        spideyVy += GRAVITY;
        spideyY += spideyVy;
        spideyAngle = Math.min(1.2, spideyAngle + 0.038);

        // Web line decay
        if (webAnchor) {
          webAnchor.x -= OBSTACLE_SPEED;
          webAnchor.life -= dt;
          if (webAnchor.life <= 0) webAnchor = null;
        }

        // Ceiling and floor bounds
        if (spideyY < SPIDEY_RADIUS) {
          spideyY = SPIDEY_RADIUS;
          spideyVy = 0;
        }
        if (spideyY > H - SPIDEY_RADIUS - 16) {
          // Crash on floor
          handleCrash();
          return;
        }

        // Move and process obstacles
        for (const obs of obstacles) {
          obs.x -= OBSTACLE_SPEED;

          // Check score pass
          if (!obs.passed && obs.x + obs.width < SPIDEY_X) {
            obs.passed = true;
            currentScore += 1;
            setScore(currentScore);
            juice.playSound('clack');
            juice.addTrauma(0.12);

            if (currentScore > highScore) {
              setHighScore(currentScore);
              localStorage.setItem('duelverse_spidey_high', currentScore.toString());
            }
          }

          // Check Stark Arc Reactor collection (Generous magnet range)
          if (obs.hasReactor && !obs.reactorCollected && obs.reactorY) {
            const rx = obs.x + obs.width / 2;
            const ry = obs.reactorY;
            const dist = Math.hypot(SPIDEY_X - rx, spideyY - ry);
            if (dist < SPIDEY_RADIUS + 22) {
              obs.reactorCollected = true;
              currentScore += 3;
              setScore(currentScore);
              juice.playSound('goal');
              juice.addTrauma(0.18);
              juice.emitSparks(rx, ry, 16, '#facc15', '#fbbf24', 4.5);
            }
          }

          // Collision detection with electro towers using forgiving HITBOX_RADIUS
          const inXWindow = SPIDEY_X + HITBOX_RADIUS > obs.x && SPIDEY_X - HITBOX_RADIUS < obs.x + obs.width;
          if (inXWindow) {
            const hitTop = spideyY - HITBOX_RADIUS < obs.topHeight;
            const hitBottom = spideyY + HITBOX_RADIUS > obs.topHeight + obs.gap;
            if (hitTop || hitBottom) {
              handleCrash();
              return;
            }
          }
        }

        // Clean up off-screen obstacles and spawn next (Spaced out by 320px)
        obstacles = obstacles.filter((obs) => obs.x + obs.width > -50);
        const lastObs = obstacles[obstacles.length - 1];
        if (lastObs && lastObs.x < W - 260) {
          spawnObstacle(W + 60);
        }
      }
    };

    const handleCrash = () => {
      phase = 'gameover';
      setGameStatePhase('gameover');
      juice.addTrauma(0.65);
      juice.playSound('thud');
      juice.emitSparks(SPIDEY_X, spideyY, 26, '#ef4444', '#f59e0b', 6.0);
      soundService.playFalseStart();
      if (navigator.vibrate) navigator.vibrate([60, 30, 80]);
    };

    const render = () => {
      const ctx = canvasMgr.ctx;
      ctx.clearRect(0, 0, canvasMgr.width, canvasMgr.height);

      ctx.save();
      ctx.translate(juice.offsetX, juice.offsetY);

      const scaleX = canvasMgr.width / W;
      const scaleY = canvasMgr.height / H;
      ctx.scale(scaleX, scaleY);

      // 1. Deep Cyber City Sky Gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
      skyGrad.addColorStop(0, '#040612');
      skyGrad.addColorStop(0.5, '#0b112c');
      skyGrad.addColorStop(1, '#1e113a');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, W, H);

      // Glowing Cyber Moon
      ctx.fillStyle = 'rgba(244, 244, 245, 0.9)';
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 24;
      ctx.beginPath();
      ctx.arc(W - 70, 75, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // 2. Parallax Cyber Skyscrapers (Distant Layer)
      ctx.fillStyle = '#0a0f24';
      for (let i = 0; i < 9; i++) {
        const bx = ((i * 68 - (skylineOffset * 0.4)) % (W + 120)) - 50;
        const bh = 140 + ((i * 37) % 180);
        ctx.fillRect(bx, H - bh - 24, 52, bh);
        // Neon windows
        ctx.fillStyle = i % 2 === 0 ? 'rgba(56, 189, 248, 0.25)' : 'rgba(236, 72, 153, 0.25)';
        for (let wy = H - bh + 10; wy < H - 40; wy += 22) {
          ctx.fillRect(bx + 10, wy, 8, 10);
          ctx.fillRect(bx + 26, wy, 8, 10);
        }
        ctx.fillStyle = '#0a0f24';
      }

      // Midground Dark Towers
      ctx.fillStyle = '#060919';
      for (let i = 0; i < 7; i++) {
        const bx = ((i * 92 - skylineOffset) % (W + 140)) - 60;
        const bh = 90 + ((i * 47) % 130);
        ctx.fillRect(bx, H - bh - 24, 70, bh);
      }

      // 3. Electro Laser Towers (Obstacles)
      for (const obs of obstacles) {
        // Top Conduit Pillar
        const topGrad = ctx.createLinearGradient(obs.x, 0, obs.x + obs.width, 0);
        topGrad.addColorStop(0, '#0f172a');
        topGrad.addColorStop(0.5, '#1e293b');
        topGrad.addColorStop(1, '#0f172a');
        ctx.fillStyle = topGrad;
        ctx.fillRect(obs.x, 0, obs.width, obs.topHeight);

        // Top Conduit Emitter Cap
        ctx.fillStyle = '#38bdf8';
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 12;
        ctx.fillRect(obs.x - 3, obs.topHeight - 12, obs.width + 6, 12);

        // Bottom Conduit Pillar
        const botY = obs.topHeight + obs.gap;
        ctx.fillStyle = topGrad;
        ctx.fillRect(obs.x, botY, obs.width, H - botY);

        // Bottom Conduit Emitter Cap
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(obs.x - 3, botY, obs.width + 6, 12);
        ctx.shadowBlur = 0;

        // Animated High-Voltage Electric Beam between Emitters
        const beamGlow = Math.sin(timeElapsed * 18 + obs.topHeight) * 0.25 + 0.35;
        ctx.strokeStyle = `rgba(56, 189, 248, ${beamGlow})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(obs.x + obs.width / 2, obs.topHeight);
        ctx.lineTo(obs.x + obs.width / 2, botY);
        ctx.stroke();

        // Collectible Stark Arc Reactor
        if (obs.hasReactor && !obs.reactorCollected && obs.reactorY) {
          const rx = obs.x + obs.width / 2;
          const ry = obs.reactorY;
          ctx.save();
          ctx.translate(rx, ry);
          ctx.rotate(timeElapsed * 3);

          // Glowing Outer Reactor Ring
          ctx.strokeStyle = '#facc15';
          ctx.shadowColor = '#facc15';
          ctx.shadowBlur = 16;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(0, 0, 13, 0, Math.PI * 2);
          ctx.stroke();

          // Reactor Core
          ctx.fillStyle = '#38bdf8';
          ctx.beginPath();
          ctx.arc(0, 0, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.restore();
        }
      }

      // 4. Dynamic Web String (When Flapping)
      if (webAnchor) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 12;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(SPIDEY_X + 4, spideyY - 6);
        ctx.lineTo(webAnchor.x, webAnchor.y);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // 5. Spider-Sense Warning Aura
      // Check if Spidey is close to any obstacle
      let isThreatNear = false;
      for (const obs of obstacles) {
        if (obs.x - SPIDEY_X < 110 && obs.x + obs.width > SPIDEY_X - 20) {
          const closeTop = spideyY - obs.topHeight < 55;
          const closeBottom = (obs.topHeight + obs.gap) - spideyY < 55;
          if (closeTop || closeBottom) isThreatNear = true;
        }
      }

      if (isThreatNear && phase === 'playing') {
        ctx.save();
        ctx.translate(SPIDEY_X, spideyY);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.85)';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 14;
        for (let a = -0.8; a <= 0.8; a += 0.4) {
          ctx.beginPath();
          ctx.arc(0, -18, 22, -Math.PI / 2 + a - 0.15, -Math.PI / 2 + a + 0.15);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
        ctx.restore();
      }

      // 6. Avenger Nano-Spidey Character Rendering
      ctx.save();
      ctx.translate(SPIDEY_X, spideyY);
      ctx.rotate(spideyAngle);

      // Spider Legs / Nano Web Pack (Backpack)
      ctx.fillStyle = '#d97706';
      ctx.fillRect(-10, -8, 5, 16);

      // Torso (Red & Blue Avenger Armor)
      ctx.fillStyle = '#dc2626'; // Vibrant Spidey Crimson
      ctx.shadowColor = '#dc2626';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.ellipse(0, 0, 16, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Blue Flank Plates
      ctx.fillStyle = '#2563eb';
      ctx.beginPath();
      ctx.arc(0, 5, 9, 0, Math.PI);
      ctx.fill();

      // Golden Spider Chest Icon
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(0, -1, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Mask Eyes (White Glowing Slanted Lenses)
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.ellipse(6, -4, 4.5, 3, 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.restore();

      // 7. Ground / Highway Floor
      ctx.fillStyle = '#050711';
      ctx.fillRect(0, H - 24, W, 24);
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, H - 24);
      ctx.lineTo(W, H - 24);
      ctx.stroke();

      // 8. Juice Particles
      juice.renderParticles(ctx, 1.0);

      ctx.restore();
    };

    const loop = new GameLoop({ update, render });
    loop.start();

    return () => loop.stop();
  }, []);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === ' ' || e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') {
        e.preventDefault();
        handleFlapRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div ref={containerRef} className="w-full max-w-xl mx-auto flex flex-col items-center select-none gap-2.5 px-2">
      {/* Top Arcade HUD */}
      <div className="w-full flex items-center justify-between px-4 py-2.5 rounded-2xl bg-slate-900/90 border border-slate-700/60 text-xs font-black font-mono shadow-md backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="text-rose-400 font-bold flex items-center gap-1.5">
            <span className="text-base">🕷️</span>
            <span>AVENGER SPIDEY</span>
          </span>
          <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 text-[10px] font-mono border border-rose-500/30">
            SOLO ARCADE
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-amber-400">
            <Trophy className="w-4 h-4 fill-current" />
            <span className="text-sm font-['Outfit'] font-black tabular-nums">{highScore}</span>
          </div>
          <div className="flex items-center gap-1.5 text-cyan-400">
            <span className="text-xs text-slate-400">SCORE</span>
            <span className="text-xl font-['Outfit'] font-black tabular-nums text-white">{score}</span>
          </div>
        </div>
      </div>

      {/* Main Flappy Spidey Canvas Stage */}
      <div
        onClick={() => handleFlapRef.current()}
        onTouchStart={(e) => {
          e.preventDefault();
          handleFlapRef.current();
        }}
        className="w-full aspect-[3/4] h-[60vh] min-h-[440px] max-h-[620px] rounded-3xl overflow-hidden shadow-2xl border-4 border-rose-500/40 cursor-pointer touch-none select-none relative bg-slate-950"
        style={{
          boxShadow: '0 0 50px rgba(225, 29, 72, 0.25), 0 25px 70px rgba(0, 0, 0, 0.8)'
        }}
      >
        <canvas ref={canvasRef} className="w-full h-full block" />

        {/* Ready Overlay */}
        {gameStatePhase === 'ready' && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex flex-col items-center justify-center p-6 text-center pointer-events-none">
            <span className="text-6xl animate-bounce mb-2">🕷️</span>
            <h2 className="text-3xl sm:text-4xl font-black font-['Outfit'] text-white drop-shadow-lg">
              FLAPPY SPIDEY
            </h2>
            <p className="text-xs text-cyan-300 font-mono mt-1 max-w-xs">
              Tap to sling webs between towers • Gather Stark Arc Reactors for bonus points!
            </p>
            <div className="mt-5 px-6 py-2.5 rounded-full bg-rose-600 text-white font-black font-['Outfit'] text-sm tracking-wider shadow-lg shadow-rose-600/40 animate-pulse">
              TAP OR SPACE TO SWING!
            </div>
          </div>
        )}

        {/* Game Over Overlay */}
        {gameStatePhase === 'gameover' && (
          <div className="absolute inset-0 bg-black/75 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center animate-pop-in">
            <span className="text-5xl mb-1">💥</span>
            <h3 className="text-3xl font-black font-['Outfit'] text-rose-400 tracking-tight">
              SPIDEY CRASHED!
            </h3>

            <div className="flex items-center gap-6 my-4 p-4 rounded-2xl bg-slate-900/90 border border-white/10 shadow-xl">
              <div className="text-center">
                <div className="text-[10px] text-slate-400 font-mono font-bold">SCORE</div>
                <div className="text-3xl font-black font-['Outfit'] text-white tabular-nums">{score}</div>
              </div>
              <div className="h-8 w-px bg-white/10" />
              <div className="text-center">
                <div className="text-[10px] text-amber-400 font-mono font-bold flex items-center gap-1">
                  <Trophy className="w-3 h-3 fill-current" />
                  <span>BEST</span>
                </div>
                <div className="text-3xl font-black font-['Outfit'] text-amber-300 tabular-nums">{highScore}</div>
              </div>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                handleFlapRef.current();
              }}
              onTouchStart={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleFlapRef.current();
              }}
              className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-rose-500 to-amber-500 text-slate-950 font-black font-['Outfit'] text-lg flex items-center gap-2 shadow-2xl active:scale-95 transition touch-none select-none"
            >
              <RotateCcw className="w-5 h-5 stroke-[2.5]" />
              <span>SWING AGAIN</span>
            </button>
          </div>
        )}
      </div>

      {/* Massive Tactile Mobile Action Pad */}
      <div className="w-full max-w-md pt-1">
        <button
          onClick={() => handleFlapRef.current()}
          onTouchStart={(e) => {
            e.preventDefault();
            handleFlapRef.current();
          }}
          className="w-full h-16 rounded-2xl bg-gradient-to-r from-rose-600 via-red-500 to-amber-500 border-2 border-rose-300 text-white font-black font-['Outfit'] text-xl active:scale-95 shadow-2xl shadow-rose-600/30 flex items-center justify-center gap-2 touch-none select-none"
        >
          <Sparkles className="w-6 h-6 fill-current text-amber-300" />
          <span>THWIP! SWING WEB</span>
        </button>
      </div>

      <p className="text-xs text-slate-400 font-mono text-center">
        ⌨️ Desktop: Spacebar / W / Up Arrow • Mobile: Tap Pad or Screen
      </p>
    </div>
  );
};
