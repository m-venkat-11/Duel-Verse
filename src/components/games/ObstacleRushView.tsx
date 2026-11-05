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
  const p2Uid = players[1] || (p1Uid === 'bot_rival' ? 'p1' : 'bot_rival');
  const isHost = room.hostUid === playerUid;
  const isBotPlaying = Boolean(room.players['bot_rival'] || p2Uid === 'bot_rival');

  const p1Nickname = room.players[p1Uid]?.nickname || 'Player 1';
  const p2Nickname = room.players[p2Uid]?.nickname || 'CyberBot AI';

  const [winnerName, setWinnerName]     = useState<string | null>(null);
  const winnerNameRef                   = useRef<string | null>(null);
  const finishReportedRef               = useRef<boolean>(false);
  const [nitroReady, setNitroReady]     = useState<boolean>(true);
  const [nitroCooldown, setNitroCooldown] = useState<number>(0);

  // Persistent simulation state across frames
  const simDistances = useRef<{ [uid: string]: number }>({});
  const simSpeeds    = useRef<{ [uid: string]: number }>({});
  const simLanes     = useRef<{ [uid: string]: number }>({});
  const visualLanes  = useRef<{ [uid: string]: number }>({});
  const hitHazards   = useRef<Set<number>>(new Set());

  // Safe accessors that NEVER return NaN
  const getDist = (uid: string) => simDistances.current[uid] ?? 0;
  const getLane = (uid: string, fallback: number = 1) => simLanes.current[uid] ?? fallback;
  const getSpeed = (uid: string) => simSpeeds.current[uid] ?? 33;
  const getVisLane = (uid: string, fallback: number = 1) => visualLanes.current[uid] ?? fallback;

  // Initialize and reset local race simulation on new round
  const resetRace = () => {
    simDistances.current[p1Uid] = 0;
    simDistances.current[p2Uid] = 0;
    simSpeeds.current[p1Uid] = 33;
    simSpeeds.current[p2Uid] = 33;
    // Human starts in center lane (lane 1), opponent in lane 2
    simLanes.current[p1Uid] = 1;
    simLanes.current[p2Uid] = 2;
    visualLanes.current[p1Uid] = 1;
    visualLanes.current[p2Uid] = 2;
    hitHazards.current.clear();
    winnerNameRef.current = null;
    finishReportedRef.current = false;
    setWinnerName(null);
  };

  useEffect(() => {
    resetRace();
  }, [room.currentRound, room.status, p1Uid, p2Uid]);

  // Sync opponent lane from authoritative network state in 2P matches
  useEffect(() => {
    const oppUid = p1Uid === playerUid ? p2Uid : p1Uid;
    const oppLane = gameState?.players?.[oppUid]?.lane;
    if (typeof oppLane === 'number' && !isBotPlaying) {
      simLanes.current[oppUid] = oppLane;
    }
  }, [gameState?.players, p1Uid, p2Uid, playerUid, isBotPlaying]);

  const handleSwitchLane = (delta: number) => {
    if (finishReportedRef.current) return;
    const cur = getLane(playerUid, 1);
    const next = Math.max(0, Math.min(2, cur + delta));
    if (next !== cur) {
      simLanes.current[playerUid] = next;
      soundService.playMove();
      onDispatchAction('RUNNER_LANE', { targetLane: next });
    }
  };

  const handleNitro = () => {
    if (!nitroReady || finishReportedRef.current) return;
    setNitroReady(false);
    setNitroCooldown(100);
    simSpeeds.current[playerUid] = 58;
    soundService.playSignalAlert?.();

    // 1.2s boost duration, then returns to 33 m/s
    setTimeout(() => {
      if (simSpeeds.current[playerUid] > 33) {
        simSpeeds.current[playerUid] = 33;
      }
    }, 1200);

    // 3.5s cooldown
    const DURATION = 3500;
    const intervalMs = 100;
    const step = 100 / (DURATION / intervalMs);
    let rem = 100;

    const timer = setInterval(() => {
      rem -= step;
      if (rem <= 0) {
        clearInterval(timer);
        setNitroReady(true);
        setNitroCooldown(0);
      } else {
        setNitroCooldown(Math.round(rem));
      }
    }, intervalMs);
  };

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === 'arrowleft' || key === 'a') {
        e.preventDefault();
        handleSwitchLane(-1);
      } else if (key === 'arrowright' || key === 'd') {
        e.preventDefault();
        handleSwitchLane(1);
      } else if (key === ' ' || key === 'arrowup' || key === 'w') {
        e.preventDefault();
        handleNitro();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nitroReady]);

  // Main 60 FPS Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasMgr = new CanvasManager(canvas);
    const juice = new JuiceEngine(300);

    const W = 520;
    const H = 640;
    const LANES = 3;
    const COURSE_MAX = 500;
    const LANE_W = (W - 80) / LANES;
    const LANE_LEFT = 40;
    const VP_Y = H * 0.28;
    const VP_X = W / 2;

    let flamePhase = 0;

    // Direct touch steering: tap left half -> move left, tap right half -> move right
    let pointerStartX = 0;
    let pointerStartY = 0;

    const handlePointerDown = (e: PointerEvent) => {
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch {}
      pointerStartX = e.clientX;
      pointerStartY = e.clientY;
    };

    const handlePointerUp = (e: PointerEvent) => {
      e.preventDefault();
      const dx = e.clientX - pointerStartX;
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;

      if (Math.abs(dx) > 30) {
        // Horizontal swipe gesture
        if (dx < 0) handleSwitchLane(-1);
        else handleSwitchLane(1);
      } else {
        // Direct tap on screen: left half vs right half
        if (clickX < rect.width * 0.45) {
          handleSwitchLane(-1);
        } else if (clickX > rect.width * 0.55) {
          handleSwitchLane(1);
        } else {
          // Center tap: trigger Nitro!
          handleNitro();
        }
      }
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointerup', handlePointerUp);

    // Coordinate projection from 3D road to screen
    function laneXAtY(lane: number, y: number): number {
      const t = Math.max(0, (y - VP_Y) / (H - VP_Y));
      const startX = LANE_LEFT + lane * LANE_W + LANE_W / 2;
      return VP_X + (startX - VP_X) * t;
    }

    // Pre-baked Sky Canvas (Static horizon skyline)
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = W;
    skyCanvas.height = Math.ceil(VP_Y + 4);
    const skyCtx = skyCanvas.getContext('2d')!;
    {
      const sg = skyCtx.createLinearGradient(0, 0, 0, VP_Y);
      sg.addColorStop(0, '#050814');
      sg.addColorStop(1, '#0c1533');
      skyCtx.fillStyle = sg;
      skyCtx.fillRect(0, 0, W, VP_Y + 4);

      // Neon Moon
      skyCtx.fillStyle = '#f8fafc';
      skyCtx.shadowColor = '#38bdf8';
      skyCtx.shadowBlur = 18;
      skyCtx.beginPath();
      skyCtx.arc(W - 75, 55, 22, 0, Math.PI * 2);
      skyCtx.fill();
      skyCtx.shadowBlur = 0;

      // Skyline buildings
      const towers = [
        [20, VP_Y - 45, 45, 45],
        [75, VP_Y - 75, 40, 75],
        [125, VP_Y - 35, 35, 35],
        [340, VP_Y - 55, 42, 55],
        [395, VP_Y - 85, 48, 85],
        [455, VP_Y - 40, 42, 40]
      ];
      towers.forEach(([bx, by, bw, bh]) => {
        skyCtx.fillStyle = '#0a1024';
        skyCtx.fillRect(bx, by, bw, bh);
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 3; c++) {
            skyCtx.fillStyle = 'rgba(6, 182, 212, 0.45)';
            skyCtx.fillRect(bx + 6 + c * 11, by + 8 + r * 14, 6, 8);
          }
        }
      });
    }

    // Pre-baked Road Canvas
    const roadCanvas = document.createElement('canvas');
    roadCanvas.width = W;
    roadCanvas.height = H;
    const roadCtx = roadCanvas.getContext('2d')!;
    {
      const rg = roadCtx.createLinearGradient(0, VP_Y, 0, H);
      rg.addColorStop(0, '#0c1322');
      rg.addColorStop(0.5, '#111827');
      rg.addColorStop(1, '#090d1a');
      roadCtx.fillStyle = rg;
      roadCtx.beginPath();
      roadCtx.moveTo(LANE_LEFT, VP_Y);
      roadCtx.lineTo(W - LANE_LEFT, VP_Y);
      roadCtx.lineTo(W - LANE_LEFT, H);
      roadCtx.lineTo(LANE_LEFT, H);
      roadCtx.closePath();
      roadCtx.fill();

      // Cyber Edge Guardrails
      roadCtx.strokeStyle = '#06b6d4';
      roadCtx.lineWidth = 4;
      roadCtx.beginPath();
      roadCtx.moveTo(LANE_LEFT, VP_Y);
      roadCtx.lineTo(LANE_LEFT, H);
      roadCtx.stroke();
      roadCtx.beginPath();
      roadCtx.moveTo(W - LANE_LEFT, VP_Y);
      roadCtx.lineTo(W - LANE_LEFT, H);
      roadCtx.stroke();
    }

    // Vehicle renderer
    function drawCar(
      ctx: CanvasRenderingContext2D,
      laneVis: number,
      yPos: number,
      color: string,
      glow: string,
      isPlayer: boolean,
      name: string
    ) {
      const cx = laneXAtY(laneVis, yPos);
      const scale = Math.max(0.25, (yPos - VP_Y) / (H - VP_Y));
      const cw = 44 * scale;
      const ch = 68 * scale;

      ctx.save();
      ctx.translate(cx, yPos);

      // Exhaust Thruster Flame
      const flameH = (12 + Math.sin(flamePhase + cx * 0.1) * 5) * scale;
      ctx.shadowColor = glow;
      ctx.shadowBlur = 16 * scale;
      ctx.fillStyle = glow;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.ellipse(0, ch * 0.42, cw * 0.28, flameH, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      // Car Body Shell
      ctx.fillStyle = '#0d1b2e';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5 * scale;
      ctx.beginPath();
      ctx.moveTo(-cw * 0.5, ch * 0.4);
      ctx.lineTo(-cw * 0.5, -ch * 0.12);
      ctx.lineTo(-cw * 0.35, -ch * 0.44);
      ctx.lineTo(cw * 0.35, -ch * 0.44);
      ctx.lineTo(cw * 0.5, -ch * 0.12);
      ctx.lineTo(cw * 0.5, ch * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Cockpit Windshield
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.88;
      ctx.beginPath();
      ctx.roundRect(-cw * 0.3, -ch * 0.4, cw * 0.6, ch * 0.32, 4 * scale);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Twin Headlights
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = color;
      ctx.shadowBlur = 10 * scale;
      ctx.beginPath();
      ctx.ellipse(-cw * 0.3, -ch * 0.44, cw * 0.1, cw * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cw * 0.3, -ch * 0.44, cw * 0.1, cw * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // 4 Heavy Rubber Wheels
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1 * scale;
      const wheels = [
        [-cw * 0.52, -ch * 0.12],
        [cw * 0.52, -ch * 0.12],
        [-cw * 0.52, ch * 0.3],
        [cw * 0.52, ch * 0.3]
      ];
      wheels.forEach(([wx, wy]) => {
        ctx.beginPath();
        ctx.ellipse(wx, wy, cw * 0.14, cw * 0.11, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });

      // Name Label Tag
      ctx.font = `900 ${Math.max(10, 12 * scale)}px "Outfit", sans-serif`;
      ctx.textAlign = 'center';
      if (isPlayer) {
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#06b6d4';
        ctx.shadowBlur = 8;
        ctx.fillText('▼ YOU', 0, -ch * 0.54);
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = color;
        ctx.fillText(name.substring(0, 10), 0, -ch * 0.54);
      }

      ctx.restore();
    }

    const update = (dt: number) => {
      juice.update(dt);
      flamePhase += dt * 8;

      const activeUids = [p1Uid, p2Uid];
      const hazards = gameState?.hazards || [];

      for (const uid of activeUids) {
        // Visual lane interpolation
        const targetLane = getLane(uid, uid === p1Uid ? 1 : 2);
        const curVis = getVisLane(uid, targetLane);
        visualLanes.current[uid] = curVis + (targetLane - curVis) * 0.22;

        let curSpeed = getSpeed(uid);
        const otherUid = uid === p1Uid ? p2Uid : p1Uid;
        const myDist = getDist(uid);
        const otherDist = getDist(otherUid);

        // Slipstream drafting bonus
        if (
          getLane(uid, 1) === getLane(otherUid, 2) &&
          otherDist > myDist &&
          otherDist - myDist < 55
        ) {
          curSpeed *= 1.25;
        }

        // Advance distance
        const newDist = myDist + curSpeed * dt;
        simDistances.current[uid] = newDist;

        // Hazard Collision Detection (hits once cleanly)
        for (const h of hazards) {
          if (!hitHazards.current.has(h.id) && Math.abs(newDist - h.distance) < 8) {
            if (getLane(uid, 1) === h.lane) {
              hitHazards.current.add(h.id);

              if (h.type === 'boost') {
                simSpeeds.current[uid] = 54;
                juice.emitSparks(W / 2, H * 0.6, 12, '#10b981', '#34d399', 4);
                soundService.playScore();
                setTimeout(() => {
                  if (simSpeeds.current[uid] > 33) simSpeeds.current[uid] = 33;
                }, 1000);
              } else {
                simSpeeds.current[uid] = 17;
                juice.addTrauma(0.4);
                soundService.playImpact(1.2);
                setTimeout(() => {
                  if (simSpeeds.current[uid] < 33) simSpeeds.current[uid] = 33;
                }, 850);
              }
            }
          }
        }

        // Finish Line Check
        if (newDist >= COURSE_MAX && !finishReportedRef.current) {
          finishReportedRef.current = true;
          const victorName = uid === p1Uid ? p1Nickname : p2Nickname;
          winnerNameRef.current = victorName;
          setWinnerName(victorName);
          soundService.playVictory();
          onDispatchAction('RUNNER_FINISH', { winnerUid: uid, actingUid: uid });
        }
      }

      // CyberBot AI Driving Logic
      if (isHost && isBotPlaying && !finishReportedRef.current) {
        const botDist = getDist(p2Uid);
        const botLane = getLane(p2Uid, 2);

        // Look for hazards ahead in bot's path (15m to 65m ahead)
        const imminent = hazards.find(
          (h) => h.distance > botDist + 15 && h.distance < botDist + 65
        );

        if (imminent) {
          if (imminent.type === 'boost') {
            // Steer towards boost pad
            simLanes.current[p2Uid] = imminent.lane;
          } else if (imminent.lane === botLane) {
            // Steer away from barrier into safe adjacent lane
            const safeLane = botLane === 0 ? 1 : botLane === 2 ? 1 : Math.random() > 0.5 ? 0 : 2;
            simLanes.current[p2Uid] = safeLane;
          }
        } else if (Math.random() < 0.015) {
          // Occasional strategic overtakes
          const p1Dist = getDist(p1Uid);
          const p1Lane = getLane(p1Uid, 1);
          if (p1Dist > botDist && Math.random() < 0.4) {
            simLanes.current[p2Uid] = p1Lane; // Attempt to slipstream
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

      // 1. Draw Pre-baked Sky & Road
      ctx.drawImage(skyCanvas, 0, 0, W, VP_Y + 4);
      ctx.drawImage(roadCanvas, 0, 0, W, H);

      const playerDist = getDist(playerUid);

      // 2. Perspective Lane Dashes (Scroll seamlessly)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = 2.5;
      for (let l = 1; l < LANES; l++) {
        const DASH_COUNT = 9;
        for (let d = 0; d < DASH_COUNT; d++) {
          const scroll = playerDist * 0.003;
          const offset = ((d + scroll) % 1 + 1) % 1;
          const offset2 = Math.min(1, offset + 0.35);
          if (offset2 <= offset) continue;

          const y0 = VP_Y + (H - VP_Y) * offset;
          const y1 = VP_Y + (H - VP_Y) * offset2;
          const x0 = VP_X + (LANE_LEFT + l * LANE_W - VP_X) * offset;
          const x1 = VP_X + (LANE_LEFT + l * LANE_W - VP_X) * offset2;

          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
        }
      }

      // 3. Render Hazards
      const hazards = gameState?.hazards || [];
      for (const h of hazards) {
        const relDist = h.distance - playerDist;
        if (relDist >= -25 && relDist <= 130) {
          const t = Math.max(0.02, Math.min(0.98, 0.75 - (relDist / 120) * 0.75));
          const hY = VP_Y + (H - VP_Y) * t;
          const hX = laneXAtY(h.lane, hY);
          const hScale = Math.max(0.25, t);
          const hw = 48 * hScale;
          const hh = 26 * hScale;

          if (h.type === 'boost') {
            ctx.fillStyle = '#10b981';
            ctx.shadowColor = '#10b981';
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.roundRect(hX - hw / 2, hY - hh / 2, hw, hh, 6 * hScale);
            ctx.fill();
            ctx.shadowBlur = 0;

            ctx.fillStyle = '#ffffff';
            ctx.font = `900 ${Math.max(8, 11 * hScale)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText('⚡ NITRO', hX, hY + 4 * hScale);
          } else {
            // Hazard Barrier Cones
            ctx.shadowColor = '#f97316';
            ctx.shadowBlur = 10;
            for (let ci = -1; ci <= 1; ci++) {
              const conex = hX + ci * hw * 0.38;
              ctx.fillStyle = ci % 2 === 0 ? '#f97316' : '#fbbf24';
              ctx.beginPath();
              ctx.moveTo(conex, hY - hh * 0.9);
              ctx.lineTo(conex - 8 * hScale, hY + hh * 0.5);
              ctx.lineTo(conex + 8 * hScale, hY + hh * 0.5);
              ctx.closePath();
              ctx.fill();
            }
            ctx.shadowBlur = 0;
          }
        }
      }

      // 4. Finish Arch & Checkered Banner
      const finishRelDist = COURSE_MAX - playerDist;
      if (finishRelDist >= -25 && finishRelDist <= 130) {
        const t = Math.max(0.02, Math.min(0.98, 0.75 - (finishRelDist / 120) * 0.75));
        const fY = VP_Y + (H - VP_Y) * t;
        const fH = 22 * t;
        const cols = 10;
        const checkW = (W - 80) / cols;

        for (let c = 0; c < cols; c++) {
          for (let r = 0; r < 2; r++) {
            ctx.fillStyle = (c + r) % 2 === 0 ? '#000000' : '#ffffff';
            ctx.fillRect(LANE_LEFT + c * checkW, fY - fH / 2 + (r * fH) / 2, checkW, fH / 2);
          }
        }

        // Finish text
        ctx.fillStyle = '#facc15';
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 14;
        ctx.font = `900 ${Math.max(9, 14 * t)}px "Outfit", sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('🏁 FINISH 500M 🏁', W / 2, fY - fH * 0.8);
        ctx.shadowBlur = 0;
      }

      // 5. Draw Racers
      const racers = [
        {
          uid: p1Uid,
          name: p1Nickname,
          color: '#f59e0b',
          glow: '#fbbf24',
          isPlayer: playerUid === p1Uid
        },
        {
          uid: p2Uid,
          name: p2Nickname,
          color: '#06b6d4',
          glow: '#22d3ee',
          isPlayer: playerUid === p2Uid
        }
      ];

      // Sort so trailing cars draw behind leading cars
      racers.sort((a, b) => getDist(a.uid) - getDist(b.uid));

      racers.forEach((r) => {
        const rDist = getDist(r.uid);
        const relDist = rDist - playerDist;
        const t = Math.max(0.08, Math.min(0.96, 0.75 - (relDist / 120) * 0.75));
        const yPos = VP_Y + (H - VP_Y) * t;
        drawCar(ctx, getVisLane(r.uid, 1), yPos, r.color, r.glow, r.isPlayer, r.name);
      });

      // 6. Winner Announcement Overlay
      const activeWinner = winnerNameRef.current || winnerName;
      if (activeWinner) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(0, 0, W, H);

        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 32;
        ctx.fillStyle = '#fbbf24';
        ctx.font = '900 42px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`🏆 ${activeWinner.toUpperCase()} WON!`, W / 2, H / 2 - 20);
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#38bdf8';
        ctx.font = '700 16px "Outfit", sans-serif';
        ctx.fillText('NEXT ROUND STARTING...', W / 2, H / 2 + 25);
      }

      ctx.restore();

      // Particle system overlay
      juice.renderParticles(canvasMgr.ctx, canvasMgr.width / W);
    };

    const loop = new GameLoop({ update, render });
    loop.start();

    return () => {
      loop.stop();
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointerup', handlePointerUp);
    };
  }, [p1Uid, p2Uid, isHost, isBotPlaying, p1Nickname, p2Nickname, onDispatchAction]);

  const p1Dist = getDist(p1Uid);
  const p2Dist = getDist(p2Uid);

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col items-center select-none gap-2.5 px-2">
      {/* Top Scores Bar */}
      <div className="w-full flex items-center justify-between px-4 py-2 rounded-2xl bg-slate-900/90 border border-slate-700/60 text-xs font-mono font-bold shadow-md">
        <span className="text-amber-400">
          {p1Nickname}: <span className="text-white text-sm font-black">{room.scores[p1Uid] || 0}</span>
        </span>
        <span className="text-slate-400 text-[11px] font-black">
          🏆 FIRST TO {room.maxRounds || gameState?.targetWins || 3}
        </span>
        <span className="text-cyan-400">
          {p2Nickname}: <span className="text-white text-sm font-black">{room.scores[p2Uid] || 0}</span>
        </span>
      </div>

      {/* Dual Race Progress Track */}
      <div className="w-full p-3 rounded-2xl bg-slate-900/90 border border-slate-700/50 shadow-md">
        <div className="flex items-center justify-between text-xs font-mono font-bold mb-1.5">
          <span className="text-amber-400 flex items-center gap-1">
            🚗 {Math.min(500, Math.round(p1Dist))}m
          </span>
          <span className="text-slate-400">🏁 500m SPRINT</span>
          <span className="text-cyan-400 flex items-center gap-1">
            🚗 {Math.min(500, Math.round(p2Dist))}m
          </span>
        </div>
        <div className="relative w-full h-3 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="absolute left-0 top-0 h-full bg-gradient-to-r from-amber-600 to-amber-300 transition-all duration-75 shadow-[0_0_8px_#f59e0b]"
            style={{ width: `${Math.min(100, (p1Dist / 500) * 100)}%` }}
          />
        </div>
        <div className="relative w-full h-3 bg-slate-800 rounded-full overflow-hidden mt-1">
          <div
            className="absolute left-0 top-0 h-full bg-gradient-to-r from-cyan-600 to-cyan-300 transition-all duration-75 shadow-[0_0_8px_#06b6d4]"
            style={{ width: `${Math.min(100, (p2Dist / 500) * 100)}%` }}
          />
        </div>
      </div>

      {/* Canvas Stage */}
      <div className="w-full aspect-[4/3] rounded-3xl overflow-hidden shadow-2xl border-2 border-orange-500/40 relative bg-slate-950">
        <canvas
          ref={canvasRef}
          style={{ touchAction: 'none' }}
          className="w-full h-full block cursor-pointer select-none"
        />
      </div>

      {/* Touch Controls: Steer Left | NITRO Surge | Steer Right */}
      <div className="w-full grid grid-cols-3 gap-3 max-w-md pt-1">
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            handleSwitchLane(-1);
          }}
          className="h-16 rounded-2xl bg-slate-900 border-2 border-slate-700 active:bg-cyan-600/30 active:border-cyan-400 active:scale-95 flex items-center justify-center gap-1.5 text-sm font-black font-mono text-slate-200 shadow-lg touch-manipulation cursor-pointer"
        >
          <ChevronLeft className="w-6 h-6 text-cyan-400" />
          <span className="text-sm">LEFT</span>
        </button>

        <button
          onPointerDown={(e) => {
            e.preventDefault();
            handleNitro();
          }}
          disabled={!nitroReady}
          className={`h-16 rounded-2xl border-2 flex flex-col items-center justify-center gap-0.5 text-xs font-black font-mono shadow-xl active:scale-95 transition touch-manipulation cursor-pointer relative overflow-hidden ${
            nitroReady
              ? 'bg-gradient-to-r from-emerald-500 to-teal-400 border-emerald-300 text-slate-950 shadow-emerald-500/40'
              : 'bg-slate-800 border-slate-700 text-slate-500'
          }`}
        >
          <Zap className={`w-5 h-5 relative z-10 ${nitroReady ? 'fill-current' : 'text-slate-600'}`} />
          <span className="relative z-10 text-[10px]">
            {nitroReady ? 'NITRO!' : `RELOAD ${nitroCooldown}%`}
          </span>
        </button>

        <button
          onPointerDown={(e) => {
            e.preventDefault();
            handleSwitchLane(1);
          }}
          className="h-16 rounded-2xl bg-slate-900 border-2 border-slate-700 active:bg-cyan-600/30 active:border-cyan-400 active:scale-95 flex items-center justify-center gap-1.5 text-sm font-black font-mono text-slate-200 shadow-lg touch-manipulation cursor-pointer"
        >
          <span className="text-sm">RIGHT</span>
          <ChevronRight className="w-6 h-6 text-cyan-400" />
        </button>
      </div>

      <p className="text-xs text-slate-400 font-mono text-center">
        👆 Tap left/right side of screen or buttons to steer • Center tap or space for NITRO!
      </p>
    </div>
  );
};
