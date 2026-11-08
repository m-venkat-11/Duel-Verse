import React, { useState, useEffect, useRef } from 'react';
import type { LuckyDiceState } from '../../types/game';
import type { AuthoritativeRoomState } from '../../types/room';
import { GameLoop } from '../../engine/core/GameLoop';
import { CanvasManager } from '../../engine/core/CanvasManager';
import { JuiceEngine } from '../../engine/core/JuiceEngine';
import { soundService } from '../../services/sound';
import { Trophy, Dices, Sparkles, Lock, RefreshCw, CheckCircle2, Crown, Zap, Flame } from 'lucide-react';

interface LuckyDiceViewProps {
  room: AuthoritativeRoomState<LuckyDiceState>;
  playerUid: string;
  onDispatchAction: (type: string, payload: any) => void;
}

// 3D Physical Die Object in Canvas World
interface Physical3DDie {
  id: number;
  x: number;
  y: number;
  z: number; // Altitude above table surface
  vx: number;
  vy: number;
  vz: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  vrotX: number;
  vrotY: number;
  vrotZ: number;
  size: number;
  theme: 'amber' | 'cyan' | 'emerald' | 'magenta' | 'gold';
  targetValue: number; // Final settled face (1..6)
  isSettled: boolean;
  settleTimer: number;
  bounceCount: number;
}

// 3D Rotation Math Utility
function rotate3D(
  x: number,
  y: number,
  z: number,
  rx: number,
  ry: number,
  rz: number
): [number, number, number] {
  // Rotate around X
  const cosX = Math.cos(rx);
  const sinX = Math.sin(rx);
  const y1 = y * cosX - z * sinX;
  const z1 = y * sinX + z * cosX;

  // Rotate around Y
  const cosY = Math.cos(ry);
  const sinY = Math.sin(ry);
  const x2 = x * cosY + z1 * sinY;
  const z2 = -x * sinY + z1 * cosY;

  // Rotate around Z
  const cosZ = Math.cos(rz);
  const sinZ = Math.sin(rz);
  const x3 = x2 * cosZ - y1 * sinZ;
  const y3 = x2 * sinZ + y1 * cosZ;

  return [x3, y3, z2];
}

// Target 3D Euler Angles for each face to face UP toward camera
const FACE_ANGLES: Record<number, [number, number, number]> = {
  1: [0, 0, 0],                            // Front face (+Z)
  6: [Math.PI, 0, 0],                      // Back face (-Z)
  2: [Math.PI / 2, 0, 0],                  // Top face (-Y)
  5: [-Math.PI / 2, 0, 0],                 // Bottom face (+Y)
  3: [0, -Math.PI / 2, 0],                 // Right face (+X)
  4: [0, Math.PI / 2, 0]                   // Left face (-X)
};

export const LuckyDiceView: React.FC<LuckyDiceViewProps> = ({ room, playerUid, onDispatchAction }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameState = room.gameState;

  const players = Object.keys(room.players);
  const p1Uid = players[0] || playerUid;
  const p2Uid = players[1] || (p1Uid === 'bot_rival' ? 'player' : 'bot_rival');
  const isHost = room.hostUid === playerUid;
  const isBotPlaying = Boolean(room.players['bot_rival'] || p2Uid === 'bot_rival');

  const p1Nickname = room.players[p1Uid]?.nickname || 'Player 1';
  const p2Nickname = room.players[p2Uid]?.nickname || 'CyberBot';

  const diceCount = gameState?.diceCount || 3;
  const onDispatchActionRef = useRef(onDispatchAction);
  useEffect(() => {
    onDispatchActionRef.current = onDispatchAction;
  }, [onDispatchAction]);

  // Prediction setup state
  const [selectedGuesses, setSelectedGuesses] = useState<number[]>(() =>
    Array.from({ length: diceCount }, () => Math.floor(Math.random() * 6) + 1)
  );

  // Sync guess length when dice count changes
  useEffect(() => {
    setSelectedGuesses((prev) => {
      const copy = [...prev];
      while (copy.length < diceCount) copy.push(Math.floor(Math.random() * 6) + 1);
      return copy.slice(0, diceCount);
    });
  }, [diceCount]);

  // Physical 3D Dice Simulation State
  const diceList = useRef<Physical3DDie[]>([]);
  const isRollingRef = useRef<boolean>(false);
  const laserBeamsRef = useRef<Array<{ startX: number; startY: number; endX: number; endY: number; alpha: number; color: string }>>([]);

  const W = 460;
  const H = 480;
  const TABLE_LEFT = 40;
  const TABLE_RIGHT = 420;
  const TABLE_TOP = 40;
  const TABLE_BOTTOM = 440;

  // Initialize dice objects
  const initPhysicalDice = (count: number, values: number[]) => {
    const themes: Array<'amber' | 'cyan' | 'emerald' | 'magenta' | 'gold'> = ['amber', 'cyan', 'emerald', 'magenta', 'gold'];
    const newList: Physical3DDie[] = [];
    const spacing = (TABLE_RIGHT - TABLE_LEFT) / (count + 1);

    for (let i = 0; i < count; i++) {
      const targetVal = values[i] || Math.floor(Math.random() * 6) + 1;
      const targetAngle = FACE_ANGLES[targetVal] || [0, 0, 0];

      newList.push({
        id: i,
        x: TABLE_LEFT + spacing * (i + 1),
        y: (TABLE_TOP + TABLE_BOTTOM) / 2,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        rotX: targetAngle[0],
        rotY: targetAngle[1],
        rotZ: targetAngle[2],
        vrotX: 0,
        vrotY: 0,
        vrotZ: 0,
        size: count <= 3 ? 54 : 46,
        theme: themes[i % themes.length],
        targetValue: targetVal,
        isSettled: true,
        settleTimer: 0,
        bounceCount: 0
      });
    }
    diceList.current = newList;
  };

  useEffect(() => {
    if (gameState?.currentRoll) {
      initPhysicalDice(diceCount, gameState.currentRoll);
    }
  }, [diceCount]);

  // Trigger high-velocity 3D tumbling launch
  const launchPhysicalRoll = (targetRoll: number[]) => {
    isRollingRef.current = true;
    soundService.playCountdown(1);

    diceList.current.forEach((die, idx) => {
      die.targetValue = targetRoll[idx] || Math.floor(Math.random() * 6) + 1;
      die.isSettled = false;
      die.settleTimer = 1.0 + idx * 0.18; // Staggered settling
      die.bounceCount = 0;

      // Explosive 3D Launch velocities!
      die.vz = 420 + Math.random() * 140; // High vertical toss into the air!
      die.vx = (Math.random() - 0.5) * 360;
      die.vy = (Math.random() - 0.5) * 280;

      // Wild 3D angular spin!
      die.vrotX = (Math.random() - 0.5) * 26;
      die.vrotY = (Math.random() - 0.5) * 26;
      die.vrotZ = (Math.random() - 0.5) * 26;
    });
  };

  // Listen to roll events from server/transport
  const prevRollCount = useRef<number>(gameState?.rollCount || 0);
  useEffect(() => {
    if (gameState?.rollCount && gameState.rollCount > prevRollCount.current) {
      prevRollCount.current = gameState.rollCount;
      if (gameState.currentRoll) {
        launchPhysicalRoll(gameState.currentRoll);
      }
    }
  }, [gameState?.rollCount, gameState?.currentRoll]);

  // Play Victory FX on round win
  useEffect(() => {
    if (gameState?.roundWinnerUid) {
      soundService.playVictory();
    }
  }, [gameState?.roundWinnerUid]);

  // 60 FPS Game Loop for 3D Physics Simulation & Canvas Rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasMgr = new CanvasManager(canvas);
    const juice = new JuiceEngine(300);

    const update = (dt: number) => {
      const clampedDt = Math.min(0.04, dt);
      juice.update(clampedDt);

      let allSettled = true;

      diceList.current.forEach((die) => {
        if (!die.isSettled) {
          allSettled = false;
          die.settleTimer -= clampedDt;

          // 3D Gravity & Velocity
          die.vz -= 1150 * clampedDt;
          die.x += die.vx * clampedDt;
          die.y += die.vy * clampedDt;
          die.z += die.vz * clampedDt;

          // Angular spin
          die.rotX += die.vrotX * clampedDt;
          die.rotY += die.vrotY * clampedDt;
          die.rotZ += die.vrotZ * clampedDt;

          // Emit tumbling sparks in the air
          if (die.z > 20 && Math.random() < 0.3) {
            const sparkColor = die.theme === 'amber' ? '#f59e0b' : '#06b6d4';
            juice.emitSparks(die.x, die.y - die.z * 0.4, 2, sparkColor, '#ffffff', 1.5);
          }

          // Table Floor Collision (z <= 0)
          if (die.z <= 0) {
            die.z = 0;
            if (die.settleTimer > 0) {
              // Elastic bounce
              die.vz = -die.vz * 0.52;
              die.vx *= 0.82;
              die.vy *= 0.82;
              die.vrotX *= 0.75;
              die.vrotY *= 0.75;
              die.vrotZ *= 0.75;
              die.bounceCount++;

              soundService.playImpact(0.9);
              juice.addTrauma(0.12);
              juice.emitSparks(die.x, die.y, 6, '#fbbf24', '#ffffff', 2.2);
            } else {
              // Settle Phase: Smoothly align to target face orientation!
              const targetEuler = FACE_ANGLES[die.targetValue] || [0, 0, 0];
              die.rotX += (targetEuler[0] - die.rotX) * Math.min(1, 14 * clampedDt);
              die.rotY += (targetEuler[1] - die.rotY) * Math.min(1, 14 * clampedDt);
              die.rotZ += (targetEuler[2] - die.rotZ) * Math.min(1, 14 * clampedDt);

              die.vx *= 0.6;
              die.vy *= 0.6;
              die.vz = 0;

              if (Math.abs(die.vx) < 5 && Math.abs(die.vy) < 5) {
                die.isSettled = true;
                die.rotX = targetEuler[0];
                die.rotY = targetEuler[1];
                die.rotZ = targetEuler[2];
                die.vx = 0;
                die.vy = 0;

                soundService.playScore();
                juice.addTrauma(0.2);
                juice.emitExplosion(die.x, die.y, 14);
              }
            }
          }

          // Table Bumper Rails Collision
          const half = die.size / 2;
          if (die.x - half <= TABLE_LEFT) {
            die.x = TABLE_LEFT + half;
            die.vx = Math.abs(die.vx) * 0.75;
            soundService.playImpact(0.7);
          } else if (die.x + half >= TABLE_RIGHT) {
            die.x = TABLE_RIGHT - half;
            die.vx = -Math.abs(die.vx) * 0.75;
            soundService.playImpact(0.7);
          }

          if (die.y - half <= TABLE_TOP) {
            die.y = TABLE_TOP + half;
            die.vy = Math.abs(die.vy) * 0.75;
            soundService.playImpact(0.7);
          } else if (die.y + half >= TABLE_BOTTOM) {
            die.y = TABLE_BOTTOM - half;
            die.vy = -Math.abs(die.vy) * 0.75;
            soundService.playImpact(0.7);
          }
        }
      });

      if (allSettled && isRollingRef.current) {
        isRollingRef.current = false;
      }

      // Fade laser beams
      laserBeamsRef.current = laserBeamsRef.current.filter((b) => {
        b.alpha -= clampedDt * 2;
        return b.alpha > 0;
      });
    };

    const render = () => {
      const ctx = canvasMgr.ctx;
      ctx.clearRect(0, 0, canvasMgr.width, canvasMgr.height);
      ctx.save();
      ctx.translate(juice.offsetX, juice.offsetY);

      const scaleX = canvasMgr.width / W;
      const scaleY = canvasMgr.height / H;
      ctx.scale(scaleX, scaleY);

      // 1. Luxury Cyber-Casino Felt Tabletop
      const feltGrad = ctx.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, 280);
      feltGrad.addColorStop(0, '#062d1f');
      feltGrad.addColorStop(0.65, '#031a12');
      feltGrad.addColorStop(1, '#010c08');
      ctx.fillStyle = feltGrad;
      ctx.fillRect(0, 0, W, H);

      // Gold Laser Hex Grid on Felt
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.08)';
      ctx.lineWidth = 1;
      const hexR = 28;
      for (let x = 20; x < W + 30; x += hexR * 1.73) {
        for (let y = 20; y < H + 30; y += hexR * 1.5) {
          ctx.beginPath();
          for (let a = 0; a < 6; a++) {
            const angle = (a * Math.PI) / 3;
            const hx = x + Math.cos(angle) * (hexR - 4);
            const hy = y + Math.sin(angle) * (hexR - 4);
            if (a === 0) ctx.moveTo(hx, hy);
            else ctx.lineTo(hx, hy);
          }
          ctx.closePath();
          ctx.stroke();
        }
      }

      // Metallic Table Bumper Rail with Neon LED Strip
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 14;
      ctx.strokeRect(TABLE_LEFT - 10, TABLE_TOP - 10, TABLE_RIGHT - TABLE_LEFT + 20, TABLE_BOTTOM - TABLE_TOP + 20);

      ctx.strokeStyle = '#f59e0b';
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 12;
      ctx.lineWidth = 3;
      ctx.strokeRect(TABLE_LEFT - 10, TABLE_TOP - 10, TABLE_RIGHT - TABLE_LEFT + 20, TABLE_BOTTOM - TABLE_TOP + 20);
      ctx.shadowBlur = 0;

      // Center Embossed Gold Star Emblem
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.18)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 65, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a1 = (i * Math.PI) / 4;
        const a2 = a1 + Math.PI / 8;
        ctx.lineTo(Math.cos(a1) * 55, Math.sin(a1) * 55);
        ctx.lineTo(Math.cos(a2) * 25, Math.sin(a2) * 25);
      }
      ctx.closePath();
      ctx.stroke();

      ctx.fillStyle = 'rgba(245, 158, 11, 0.18)';
      ctx.font = '900 12px "Outfit", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('LUCKY DICE DUEL', 0, 4);
      ctx.restore();

      // 2. Render 3D Tumbling Dice
      // Sort dice by altitude z (highest rendered last)
      const sortedDice = [...diceList.current].sort((a, b) => a.y - b.y);

      sortedDice.forEach((die) => {
        const s = die.size / 2;
        const zAlt = Math.max(0, die.z);

        // A. Dynamic Ground Shadow on Table Felt (shrinks and softens as die ascends)
        ctx.save();
        ctx.fillStyle = `rgba(0, 0, 0, ${Math.max(0.12, 0.55 - zAlt * 0.002)})`;
        ctx.beginPath();
        ctx.ellipse(
          die.x,
          die.y + 12 + zAlt * 0.1,
          Math.max(10, die.size * 0.65 * (1 - zAlt * 0.001)),
          Math.max(5, die.size * 0.35 * (1 - zAlt * 0.001)),
          0,
          0,
          Math.PI * 2
        );
        ctx.fill();
        ctx.restore();

        // B. Render True 3D Cube Geometry
        // 8 local 3D cube vertices
        const rawVerts = [
          [-s, -s, -s],
          [s, -s, -s],
          [s, s, -s],
          [-s, s, -s],
          [-s, -s, s],
          [s, -s, s],
          [s, s, s],
          [-s, s, s]
        ];

        // Rotate vertices in 3D
        const rotVerts = rawVerts.map((v) => rotate3D(v[0], v[1], v[2], die.rotX, die.rotY, die.rotZ));

        // Projected 2D screen positions (raised by altitude z)
        const projVerts = rotVerts.map((v) => ({
          x: die.x + v[0],
          y: die.y - zAlt + v[1],
          z: v[2]
        }));

        // 6 Cube Faces with Standard Opposite Sum = 7
        const faces = [
          { value: 1, indices: [4, 5, 6, 7], normal: [0, 0, 1] }, // Front (+Z)
          { value: 6, indices: [1, 0, 3, 2], normal: [0, 0, -1] }, // Back (-Z)
          { value: 3, indices: [5, 1, 2, 6], normal: [1, 0, 0] }, // Right (+X)
          { value: 4, indices: [0, 4, 7, 3], normal: [-1, 0, 0] }, // Left (-X)
          { value: 2, indices: [0, 1, 5, 4], normal: [0, -1, 0] }, // Top (-Y)
          { value: 5, indices: [7, 6, 2, 3], normal: [0, 1, 0] } // Bottom (+Y)
        ];

        // Rotate face normals & calculate camera visibility (back-face culling)
        const visibleFaces = faces
          .map((f) => {
            const rotNorm = rotate3D(f.normal[0], f.normal[1], f.normal[2], die.rotX, die.rotY, die.rotZ);
            const avgZ = f.indices.reduce((sum, idx) => sum + projVerts[idx].z, 0) / 4;
            return {
              ...f,
              rotNorm,
              avgZ,
              isVisible: rotNorm[2] > -0.05 // facing camera
            };
          })
          .filter((f) => f.isVisible)
          .sort((a, b) => a.avgZ - b.avgZ);

        // Draw each visible 3D face with diffuse shading
        visibleFaces.forEach((f) => {
          const v0 = projVerts[f.indices[0]];
          const v1 = projVerts[f.indices[1]];
          const v2 = projVerts[f.indices[2]];
          const v3 = projVerts[f.indices[3]];

          // Directional Lighting calculation
          const lightDir = [-0.4, -0.6, 0.7];
          const dot = f.rotNorm[0] * lightDir[0] + f.rotNorm[1] * lightDir[1] + f.rotNorm[2] * lightDir[2];
          const brightness = Math.max(0.4, Math.min(1.0, 0.65 + dot * 0.45));

          // Base theme color
          let baseHex = '#f59e0b';
          if (die.theme === 'cyan') baseHex = '#06b6d4';
          else if (die.theme === 'emerald') baseHex = '#10b981';
          else if (die.theme === 'magenta') baseHex = '#ec4899';

          ctx.save();
          ctx.beginPath();
          ctx.moveTo(v0.x, v0.y);
          ctx.lineTo(v1.x, v1.y);
          ctx.lineTo(v2.x, v2.y);
          ctx.lineTo(v3.x, v3.y);
          ctx.closePath();

          ctx.fillStyle = baseHex;
          ctx.globalAlpha = brightness;
          ctx.fill();

          // Beveled Edge Stroke
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
          ctx.lineWidth = 1.8;
          ctx.stroke();
          ctx.restore();

          // Draw Pip Dots on this 3D face in perspective!
          const center = {
            x: (v0.x + v1.x + v2.x + v3.x) / 4,
            y: (v0.y + v1.y + v2.y + v3.y) / 4
          };
          const vecU = {
            x: (v1.x - v0.x + (v2.x - v3.x)) / 4,
            y: (v1.y - v0.y + (v2.y - v3.y)) / 4
          };
          const vecV = {
            x: (v3.x - v0.x + (v2.x - v1.x)) / 4,
            y: (v3.y - v0.y + (v2.y - v1.y)) / 4
          };

          const pipPositions: Array<[number, number]> = [];
          const val = f.value;

          if (val === 1) pipPositions.push([0, 0]);
          else if (val === 2) pipPositions.push([-0.5, -0.5], [0.5, 0.5]);
          else if (val === 3) pipPositions.push([-0.5, -0.5], [0, 0], [0.5, 0.5]);
          else if (val === 4) pipPositions.push([-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]);
          else if (val === 5) pipPositions.push([-0.5, -0.5], [0.5, -0.5], [0, 0], [-0.5, 0.5], [0.5, 0.5]);
          else if (val === 6)
            pipPositions.push(
              [-0.55, -0.55],
              [0.55, -0.55],
              [-0.55, 0],
              [0.55, 0],
              [-0.55, 0.55],
              [0.55, 0.55]
            );

          ctx.save();
          pipPositions.forEach(([pu, pv]) => {
            const px = center.x + vecU.x * pu * 1.5 + vecV.x * pv * 1.5;
            const py = center.y + vecU.y * pu * 1.5 + vecV.y * pv * 1.5;
            const pipR = Math.max(2, (die.size / 14) * brightness);

            ctx.beginPath();
            ctx.arc(px, py, pipR, 0, Math.PI * 2);
            ctx.fillStyle = val === 1 && die.theme === 'amber' ? '#dc2626' : '#020617';
            ctx.fill();

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 0.8;
            ctx.stroke();
          });
          ctx.restore();
        });

        // Die ID Badge label
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 11px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`Die #${die.id + 1}`, die.x, die.y + die.size * 0.75 + 14);
      });

      ctx.restore(); // Exit canvas scaling
      juice.renderParticles(canvasMgr.ctx, canvasMgr.width / W);
    };

    const loop = new GameLoop({ update, render });
    loop.start();

    return () => {
      loop.stop();
    };
  }, []);

  // Handlers
  const handleSelectNumber = (index: number, num: number) => {
    soundService.playCountdown(2);
    setSelectedGuesses((prev) => {
      const copy = [...prev];
      copy[index] = num;
      return copy;
    });
  };

  const handleRandomizeAll = () => {
    soundService.playCountdown(1);
    setSelectedGuesses(Array.from({ length: diceCount }, () => Math.floor(Math.random() * 6) + 1));
  };

  const handleSetDiceCount = (count: number) => {
    soundService.playImpact(0.8);
    onDispatchActionRef.current('LUCKY_DICE_SET_COUNT', { diceCount: count });
  };

  const handleLockPredictions = () => {
    soundService.playScore();
    onDispatchActionRef.current('LUCKY_DICE_SUBMIT_GUESS', { guesses: selectedGuesses });
  };

  const handleRollDice = () => {
    if (isRollingRef.current || gameState.phase !== 'rolling' || gameState.currentTurn !== playerUid) return;
    onDispatchActionRef.current('LUCKY_DICE_ROLL', { actingUid: playerUid });
  };

  const myGuesses = gameState?.guesses?.[playerUid];
  const myCleared = gameState?.cleared?.[playerUid] || new Array(diceCount).fill(false);
  const oppUid = p1Uid === playerUid ? p2Uid : p1Uid;
  const oppGuesses = gameState?.guesses?.[oppUid];
  const oppCleared = gameState?.cleared?.[oppUid] || new Array(diceCount).fill(false);

  const isMyTurn = gameState?.currentTurn === playerUid;
  const p1Score = room.scores[p1Uid] || gameState?.roundScores?.[p1Uid] || 0;
  const p2Score = room.scores[p2Uid] || gameState?.roundScores?.[p2Uid] || 0;

  return (
    <div className="w-full max-w-md mx-auto flex flex-col items-center select-none gap-2 px-1">
      {/* 1. High-Roller Stadium Header */}
      <div className="w-full flex items-center justify-between bg-slate-900/90 border-2 border-slate-800 rounded-2xl px-3 py-2 shadow-xl backdrop-blur-md">
        {/* P1 Pill */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center font-black font-['Outfit'] text-amber-300 text-sm">
            {p1Score}
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-black font-['Outfit'] text-amber-400 truncate max-w-[85px]">
              {p1Uid === playerUid ? 'YOU' : p1Nickname}
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              {myCleared.filter(Boolean).length}/{diceCount} Cleared
            </span>
          </div>
        </div>

        {/* Center Target Badge */}
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-1 text-slate-300 font-mono text-xs font-black">
            <Dices className="w-4 h-4 text-amber-400 animate-spin-slow" />
            <span>RACE TO {room.maxRounds || 3}</span>
          </div>
          <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-wider">
            {diceCount} 3D DICE DUEL
          </span>
        </div>

        {/* P2 Pill */}
        <div className="flex items-center gap-2 flex-row-reverse text-right">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border-2 border-cyan-400 flex items-center justify-center font-black font-['Outfit'] text-cyan-300 text-sm">
            {p2Score}
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-black font-['Outfit'] text-cyan-400 truncate max-w-[85px]">
              {p2Uid === playerUid ? 'YOU' : p2Nickname}
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              {oppCleared.filter(Boolean).length}/{diceCount} Cleared
            </span>
          </div>
        </div>
      </div>

      {/* 2. Top: Opponent's Holographic Prediction Cards */}
      <div className="w-full bg-slate-950/80 border-2 border-slate-800 rounded-2xl p-2 flex items-center justify-between shadow-lg">
        <span className="text-xs font-mono font-bold text-cyan-400 pl-1">
          {oppUid === playerUid ? 'YOU' : p2Nickname}:
        </span>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: diceCount }).map((_, idx) => (
            <div
              key={idx}
              className={`px-2.5 py-1 rounded-xl border flex items-center gap-1.5 transition-all ${
                oppCleared[idx]
                  ? 'bg-emerald-950/70 border-emerald-400 shadow-md shadow-emerald-500/30'
                  : 'bg-slate-900 border-slate-800 text-slate-300'
              }`}
            >
              <span className="text-[10px] font-mono text-slate-400">#{idx + 1}</span>
              <span className="text-sm font-black font-['Outfit'] text-cyan-300">
                {oppGuesses ? oppGuesses[idx] : '?'}
              </span>
              {oppCleared[idx] && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />}
            </div>
          ))}
        </div>
      </div>

      {/* 3. Main Stage: 3D Canvas Arena Tray OR Holographic Prediction Pedestals */}
      {gameState.phase === 'guessing' && !myGuesses ? (
        /* --- PHASE 1: PREDICTION SETUP DECK --- */
        <div className="w-full bg-gradient-to-b from-slate-900 to-slate-950 border-4 border-slate-800 rounded-3xl p-4 shadow-2xl flex flex-col items-center gap-3">
          {/* Dice Count Selector Pills */}
          <div className="w-full flex flex-col items-center gap-1 pb-1">
            <span className="text-[11px] font-mono uppercase tracking-wider text-amber-400 font-bold flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Select Dice Quantity (1 to 5)</span>
            </span>
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
              {[1, 2, 3, 4, 5].map((cnt) => (
                <button
                  key={cnt}
                  onClick={() => handleSetDiceCount(cnt)}
                  className={`px-3 py-1 rounded-lg text-xs font-black font-mono transition-all ${
                    diceCount === cnt
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-md scale-105'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {cnt} {cnt === 1 ? 'Die' : 'Dice'}
                  {cnt === 3 && ' ⭐'}
                </button>
              ))}
            </div>
          </div>

          {/* Holographic Dice Cards Selection */}
          <div className="w-full flex flex-col items-center gap-2 max-h-[46vh] overflow-y-auto px-1">
            <span className="text-xs font-['Outfit'] font-black text-slate-200">
              Choose your target numbers (1 to 6) for each die:
            </span>

            <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-2">
              {Array.from({ length: diceCount }).map((_, idx) => (
                <div
                  key={idx}
                  className="bg-slate-950 border-2 border-slate-800 rounded-2xl p-2.5 flex flex-col items-center gap-2 shadow-inner"
                >
                  <span className="text-[11px] font-mono text-amber-400 font-bold">
                    Die #{idx + 1} Target
                  </span>

                  {/* Number Badge */}
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 via-orange-500 to-amber-600 border-2 border-amber-300 flex items-center justify-center shadow-lg shadow-amber-500/30">
                    <span className="text-2xl font-black font-['Outfit'] text-slate-950">
                      {selectedGuesses[idx] || 1}
                    </span>
                  </div>

                  {/* 1-6 Tap Selector */}
                  <div className="grid grid-cols-6 gap-1 w-full pt-1">
                    {[1, 2, 3, 4, 5, 6].map((num) => (
                      <button
                        key={num}
                        onClick={() => handleSelectNumber(idx, num)}
                        className={`h-7 rounded-lg text-xs font-black font-mono flex items-center justify-center transition-all ${
                          selectedGuesses[idx] === num
                            ? 'bg-amber-400 text-slate-950 scale-110 shadow-md border border-white'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom Actions */}
          <div className="w-full flex items-center gap-2 pt-1">
            <button
              onClick={handleRandomizeAll}
              className="flex-1 h-12 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 text-xs font-black font-mono text-slate-200 flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
            >
              <RefreshCw className="w-4 h-4 text-cyan-400" />
              <span>RANDOMIZE</span>
            </button>

            <button
              onClick={handleLockPredictions}
              className="flex-[2] h-12 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:brightness-110 active:scale-95 text-xs font-black font-mono text-slate-950 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/30 cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              <span>LOCK PREDICTIONS ({diceCount} DICE)</span>
            </button>
          </div>
        </div>
      ) : (
        /* --- PHASE 2: 3D TUMBLING DICE CANVAS STADIUM --- */
        <div className="w-full flex flex-col items-center gap-2">
          {/* Canvas Stadium Stage */}
          <div className="w-full h-[46vh] min-h-[320px] max-h-[440px] aspect-[460/480] rounded-3xl overflow-hidden shadow-2xl border-4 border-slate-800 relative bg-[#010c08]">
            <canvas ref={canvasRef} className="w-full h-full block select-none" />

            {/* Turn Status Overlay Pill on top of felt */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-slate-950/90 border border-slate-700 px-3 py-1 rounded-full text-[10px] font-mono text-slate-300 flex items-center gap-1.5 shadow-md pointer-events-none">
              <span className={`w-2 h-2 rounded-full ${isMyTurn ? 'bg-amber-400 animate-ping' : 'bg-cyan-400'}`} />
              <span>{isMyTurn ? 'YOUR TURN TO ROLL' : `${p2Nickname.toUpperCase()}'S TURN`}</span>
            </div>
          </div>

          {/* 4. Bottom: Player's Own Target Prediction Cards */}
          <div className="w-full bg-slate-950/80 border-2 border-slate-800 rounded-2xl p-2 flex items-center justify-between shadow-lg">
            <span className="text-xs font-mono font-bold text-amber-400 pl-1">
              YOUR TARGETS:
            </span>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: diceCount }).map((_, idx) => (
                <div
                  key={idx}
                  className={`px-2.5 py-1 rounded-xl border flex items-center gap-1.5 transition-all ${
                    myCleared[idx]
                      ? 'bg-emerald-950/70 border-emerald-400 shadow-md shadow-emerald-500/30'
                      : 'bg-slate-900 border-slate-800 text-slate-300'
                  }`}
                >
                  <span className="text-[10px] font-mono text-slate-400">#{idx + 1}</span>
                  <span className="text-sm font-black font-['Outfit'] text-amber-300">
                    {myGuesses ? myGuesses[idx] : selectedGuesses[idx]}
                  </span>
                  {myCleared[idx] && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />}
                </div>
              ))}
            </div>
          </div>

          {/* 5. Giant Tactile Arcade Spin / Roll Button */}
          {gameState.phase === 'rolling' && (
            <div className="w-full pt-0.5">
              {isMyTurn ? (
                <button
                  onClick={handleRollDice}
                  className="w-full h-14 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-400 hover:brightness-110 active:scale-95 text-slate-950 font-black font-['Outfit'] text-lg flex items-center justify-center gap-2.5 shadow-xl shadow-amber-500/40 transition-all cursor-pointer"
                >
                  <Dices className="w-6 h-6 animate-bounce" />
                  <span>🎲 SPIN & LAUNCH DICE!</span>
                </button>
              ) : (
                <div className="w-full h-14 rounded-2xl bg-slate-900/90 border-2 border-slate-700 flex items-center justify-center gap-2 text-cyan-300 font-mono text-sm font-bold shadow-md">
                  <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                  <span>{isBotPlaying ? 'CyberBot is launching the dice...' : 'Waiting for opponent to roll...'}</span>
                </div>
              )}
            </div>
          )}

          {/* Round Over Victory Banner */}
          {gameState.phase === 'round_end' && gameState.roundWinnerUid && (
            <div className="w-full p-3.5 rounded-2xl bg-gradient-to-r from-amber-600 via-yellow-500 to-amber-600 border-2 border-amber-300 text-slate-950 flex flex-col items-center justify-center gap-1 shadow-2xl animate-fade-in text-center">
              <Trophy className="w-8 h-8 text-slate-950 animate-bounce" />
              <h3 className="text-xl font-black font-['Outfit']">
                {gameState.roundWinnerUid === playerUid
                  ? '🎉 YOU WIN THE ROUND!'
                  : `👑 ${room.players[gameState.roundWinnerUid]?.nickname || 'OPPONENT'} WINS!`}
              </h3>
              <p className="text-[11px] font-mono font-bold text-slate-900">
                All {diceCount} dice cleared! Next round launching shortly...
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tip footer */}
      <p className="text-[10px] text-slate-400 font-mono text-center">
        🎯 Realistic 3D tumbling physics • Match your secret predictions to clear all dice!
      </p>
    </div>
  );
};
