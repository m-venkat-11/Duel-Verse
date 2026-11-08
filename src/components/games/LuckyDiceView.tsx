import React, { useState, useEffect, useRef } from 'react';
import type { LuckyDiceState } from '../../types/game';
import type { AuthoritativeRoomState } from '../../types/room';
import { GameLoop } from '../../engine/core/GameLoop';
import { CanvasManager } from '../../engine/core/CanvasManager';
import { JuiceEngine } from '../../engine/core/JuiceEngine';
import { soundService } from '../../services/sound';
import { Trophy, Dices, RefreshCw, CheckCircle2, Coins } from 'lucide-react';

interface LuckyDiceViewProps {
  room: AuthoritativeRoomState<LuckyDiceState>;
  playerUid: string;
  onDispatchAction: (type: string, payload: any) => void;
}

// 3D Physical Casino Die Object
interface PhysicalCasinoDie {
  id: number;
  x: number;
  y: number;
  z: number; // Vertical altitude above felt table
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
  colorType: 'ruby' | 'sapphire' | 'amber';
  targetValue: number;
  isSettled: boolean;
  settleTimer: number;
}

// -------------------------------------------------------------
// STANDARD 3x3 MATRIX LINEAR ALGEBRA (Zero Shearing, Zero Distortion)
// -------------------------------------------------------------
type Mat3 = [
  number, number, number,
  number, number, number,
  number, number, number
];

function mat3Multiply(a: Mat3, b: Mat3): Mat3 {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],

    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],

    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8]
  ];
}

function mat3FromEuler(rx: number, ry: number, rz: number): Mat3 {
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);

  // R = Rz * Ry * Rx
  return [
    cy * cz, sx * sy * cz - cx * sz, cx * sy * cz + sx * sz,
    cy * sz, sx * sy * sz + cx * cz, cx * sy * sz - sx * cz,
    -sy,     sx * cy,                cx * cy
  ];
}

function mat3Transform(m: Mat3, x: number, y: number, z: number): [number, number, number] {
  return [
    m[0] * x + m[1] * y + m[2] * z,
    m[3] * x + m[4] * y + m[5] * z,
    m[6] * x + m[7] * y + m[8] * z
  ];
}

// Fixed Isometric Camera Angles (35° elevation, 45° azimuth)
// Always shows Top Face, Front-Left Face, and Front-Right Face in perfect 3D depth!
const CAM_PITCH = 0.62;
const CAM_YAW = 0.785;
const CAM_MATRIX = mat3FromEuler(CAM_PITCH, CAM_YAW, 0);

// Local Euler rotations to place face `N` (1 to 6) squarely on top pointing toward player
const FACE_ALIGNMENTS: Record<number, [number, number, number]> = {
  1: [0, 0, 0],                  // Face 1 (+Y is Top)
  6: [Math.PI, 0, 0],            // Face 6 (-Y is Top)
  2: [-Math.PI / 2, 0, 0],       // Face 2 (+Z is Top)
  5: [Math.PI / 2, 0, 0],        // Face 5 (-Z is Top)
  3: [0, 0, Math.PI / 2],        // Face 3 (+X is Top)
  4: [0, 0, -Math.PI / 2]        // Face 4 (-X is Top)
};

export const LuckyDiceView: React.FC<LuckyDiceViewProps> = ({ room, playerUid, onDispatchAction }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameState = room.gameState;

  const players = Object.keys(room.players);
  const p1Uid = players[0] || playerUid;
  const p2Uid = players[1] || (p1Uid === 'bot_rival' ? 'player' : 'bot_rival');
  const isBotPlaying = Boolean(room.players['bot_rival'] || p2Uid === 'bot_rival' || players.length < 2);

  const p1Nickname = room.players[p1Uid]?.nickname || 'Player 1';
  const p2Nickname = room.players[p2Uid]?.nickname || 'CyberBot';

  const diceCount = gameState?.diceCount || 3;
  const onDispatchActionRef = useRef(onDispatchAction);
  useEffect(() => {
    onDispatchActionRef.current = onDispatchAction;
  }, [onDispatchAction]);

  // Dice simulation state
  const diceRef = useRef<PhysicalCasinoDie[]>([]);
  const isRollingRef = useRef<boolean>(false);
  const lastRollAnnouncement = useRef<string | null>(null);

  const W = 460;
  const H = 380;
  const TABLE_LEFT = 40;
  const TABLE_RIGHT = 420;
  const TABLE_TOP = 40;
  const TABLE_BOTTOM = 340;

  // Initialize 3D Casino Dice (Spaced evenly across table)
  const initDice = (count: number, values: number[]) => {
    const colors: Array<'ruby' | 'sapphire' | 'amber'> = ['ruby', 'sapphire', 'amber'];
    const newList: PhysicalCasinoDie[] = [];
    const spacing = (TABLE_RIGHT - TABLE_LEFT) / (count + 1);

    for (let i = 0; i < count; i++) {
      const val = values[i] || Math.floor(Math.random() * 6) + 1;
      const angles = FACE_ALIGNMENTS[val] || [0, 0, 0];

      newList.push({
        id: i,
        x: TABLE_LEFT + spacing * (i + 1),
        y: (TABLE_TOP + TABLE_BOTTOM) / 2 + 10,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        rotX: angles[0],
        rotY: angles[1],
        rotZ: angles[2],
        vrotX: 0,
        vrotY: 0,
        vrotZ: 0,
        size: count <= 3 ? 52 : 44,
        colorType: colors[i % colors.length],
        targetValue: val,
        isSettled: true,
        settleTimer: 0
      });
    }
    diceRef.current = newList;
  };

  useEffect(() => {
    if (gameState?.currentRoll) {
      initDice(diceCount, gameState.currentRoll);
    }
  }, [diceCount]);

  // Launch explosive 3D Craps Toss against the diamond rubber back wall
  const trigger3DCrapsToss = (targetRoll: number[]) => {
    isRollingRef.current = true;
    soundService.playCountdown(1);

    diceRef.current.forEach((die, idx) => {
      die.targetValue = targetRoll[idx] || Math.floor(Math.random() * 6) + 1;
      die.isSettled = false;
      die.settleTimer = 1.0 + idx * 0.16;

      // Vertical launch & shoot forward toward back wall
      die.vz = 420 + Math.random() * 140;
      die.vx = (Math.random() - 0.5) * 360;
      die.vy = -180 + (Math.random() - 0.5) * 180;

      // Wild 3D angular spin
      die.vrotX = (Math.random() - 0.5) * 24;
      die.vrotY = (Math.random() - 0.5) * 24;
      die.vrotZ = (Math.random() - 0.5) * 24;
    });
  };

  // Listen to roll updates from authoritative room state
  const prevRollCount = useRef<number>(gameState?.rollCount || 0);
  useEffect(() => {
    if (gameState?.rollCount && gameState.rollCount > prevRollCount.current) {
      prevRollCount.current = gameState.rollCount;
      if (gameState.currentRoll) {
        trigger3DCrapsToss(gameState.currentRoll);
        const roller = gameState.lastRolledBy === playerUid ? 'YOU' : p2Nickname;
        lastRollAnnouncement.current = `${roller} ROLLED: [ ${gameState.currentRoll.join(' - ')} ]`;
      }
    }
  }, [gameState?.rollCount, gameState?.currentRoll, gameState?.lastRolledBy, playerUid, p2Nickname]);

  // Automated CyberBot roll trigger (Guarantees bot ALWAYS takes turn without stalling!)
  useEffect(() => {
    if (
      gameState?.phase === 'rolling' &&
      gameState.currentTurn === p2Uid &&
      isBotPlaying &&
      !gameState.roundWinnerUid &&
      !isRollingRef.current
    ) {
      const timer = setTimeout(() => {
        onDispatchActionRef.current('LUCKY_DICE_ROLL', { actingUid: p2Uid });
      }, 850);
      return () => clearTimeout(timer);
    }
  }, [gameState?.phase, gameState?.currentTurn, p2Uid, isBotPlaying, gameState?.roundWinnerUid]);

  // Victory Sound FX
  useEffect(() => {
    if (gameState?.roundWinnerUid) {
      soundService.playVictory();
    }
  }, [gameState?.roundWinnerUid]);

  // 60 FPS GameLoop for 3D Physics & Matrix-Projected Isometric Rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasMgr = new CanvasManager(canvas);
    const juice = new JuiceEngine(300);

    const update = (dt: number) => {
      const clampedDt = Math.min(0.04, dt);
      juice.update(clampedDt);

      let allSettled = true;

      diceRef.current.forEach((die) => {
        if (!die.isSettled) {
          allSettled = false;
          die.settleTimer -= clampedDt;

          // 3D Gravity & Velocity
          die.vz -= 1200 * clampedDt;
          die.x += die.vx * clampedDt;
          die.y += die.vy * clampedDt;
          die.z += die.vz * clampedDt;

          // Spin
          die.rotX += die.vrotX * clampedDt;
          die.rotY += die.vrotY * clampedDt;
          die.rotZ += die.vrotZ * clampedDt;

          // Sparks while airborne
          if (die.z > 25 && Math.random() < 0.3) {
            juice.emitSparks(die.x, die.y - die.z * 0.4, 2, '#fbbf24', '#ffffff', 1.8);
          }

          // Table Floor Collision (z <= 0)
          if (die.z <= 0) {
            die.z = 0;
            if (die.settleTimer > 0) {
              // Elastic bounce on felt
              die.vz = -die.vz * 0.52;
              die.vx *= 0.82;
              die.vy *= 0.82;
              die.vrotX *= 0.72;
              die.vrotY *= 0.72;
              die.vrotZ *= 0.72;

              soundService.playImpact(0.85);
              juice.addTrauma(0.12);
              juice.emitSparks(die.x, die.y, 6, '#f59e0b', '#ffffff', 2.2);
            } else {
              // Settling: Smooth magnetic snap to target face orientation
              const targetEuler = FACE_ALIGNMENTS[die.targetValue] || [0, 0, 0];
              die.rotX += (targetEuler[0] - die.rotX) * Math.min(1, 16 * clampedDt);
              die.rotY += (targetEuler[1] - die.rotY) * Math.min(1, 16 * clampedDt);
              die.rotZ += (targetEuler[2] - die.rotZ) * Math.min(1, 16 * clampedDt);

              die.vx *= 0.55;
              die.vy *= 0.55;
              die.vz = 0;

              if (Math.abs(die.vx) < 5 && Math.abs(die.vy) < 5) {
                die.isSettled = true;
                die.rotX = targetEuler[0];
                die.rotY = targetEuler[1];
                die.rotZ = targetEuler[2];
                die.vx = 0;
                die.vy = 0;

                soundService.playScore();
                juice.addTrauma(0.18);
                juice.emitExplosion(die.x, die.y, 16);
              }
            }
          }

          // Diamond Rubber Craps Wall Collisions (Rebound!)
          const half = die.size / 2;
          if (die.x - half <= TABLE_LEFT) {
            die.x = TABLE_LEFT + half;
            die.vx = Math.abs(die.vx) * 0.78;
            soundService.playImpact(0.7);
          } else if (die.x + half >= TABLE_RIGHT) {
            die.x = TABLE_RIGHT - half;
            die.vx = -Math.abs(die.vx) * 0.78;
            soundService.playImpact(0.7);
          }

          if (die.y - half <= TABLE_TOP) {
            die.y = TABLE_TOP + half;
            die.vy = Math.abs(die.vy) * 0.82;
            soundService.playImpact(0.8);
            juice.emitSparks(die.x, die.y, 8, '#f59e0b', '#ef4444', 2.5);
          } else if (die.y + half >= TABLE_BOTTOM) {
            die.y = TABLE_BOTTOM - half;
            die.vy = -Math.abs(die.vy) * 0.78;
            soundService.playImpact(0.7);
          }
        }
      });

      if (allSettled && isRollingRef.current) {
        isRollingRef.current = false;
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

      // 1. Luxury Vegas VIP Casino Felt Table
      const feltGrad = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, 260);
      feltGrad.addColorStop(0, '#043b27');
      feltGrad.addColorStop(0.65, '#022417');
      feltGrad.addColorStop(1, '#01120b');
      ctx.fillStyle = feltGrad;
      ctx.fillRect(0, 0, W, H);

      // Casino Mahogany Table Rim with Brass Inlay
      ctx.fillStyle = '#1e0c05';
      ctx.fillRect(0, 0, W, TABLE_TOP - 12);
      ctx.fillRect(0, TABLE_BOTTOM + 12, W, H - (TABLE_BOTTOM + 12));
      ctx.fillRect(0, 0, TABLE_LEFT - 10, H);
      ctx.fillRect(TABLE_RIGHT + 10, 0, W - (TABLE_RIGHT + 10), H);

      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(TABLE_LEFT - 10, TABLE_TOP - 12, TABLE_RIGHT - TABLE_LEFT + 20, TABLE_BOTTOM - TABLE_TOP + 24);

      // Craps Diamond Rubber Pyramid Bumpers on Back Wall
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(TABLE_LEFT - 8, TABLE_TOP - 12, TABLE_RIGHT - TABLE_LEFT + 16, 12);

      ctx.fillStyle = '#dc2626';
      const pyrW = 12;
      for (let px = TABLE_LEFT - 8; px < TABLE_RIGHT + 8; px += pyrW) {
        ctx.beginPath();
        ctx.moveTo(px, TABLE_TOP - 12);
        ctx.lineTo(px + pyrW / 2, TABLE_TOP);
        ctx.lineTo(px + pyrW, TABLE_TOP - 12);
        ctx.closePath();
        ctx.fill();
      }

      // Craps Table Markings (Gold Silkscreen Lines)
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.16)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(TABLE_LEFT + 16, TABLE_TOP + 18, TABLE_RIGHT - TABLE_LEFT - 32, TABLE_BOTTOM - TABLE_TOP - 36);

      ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
      ctx.font = '900 12px "Outfit", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('★ DUELVERSE HIGH ROLLER CRAPS ★', W / 2, TABLE_TOP + 36);

      // Center Dice Ring
      ctx.beginPath();
      ctx.arc(W / 2, (TABLE_TOP + TABLE_BOTTOM) / 2 + 10, 65, 0, Math.PI * 2);
      ctx.stroke();

      // 2. Render TRUE 3D Isometric Acrylic Casino Dice (Zero Distortion Matrix)
      const sortedDice = [...diceRef.current].sort((a, b) => a.y - b.y);

      sortedDice.forEach((die) => {
        const s = die.size / 2;
        const zAlt = Math.max(0, die.z);

        // A. Dynamic Ground Shadow on Felt
        ctx.save();
        const shadowScale = Math.max(0.4, 1 - zAlt / 350);
        const shadowAlpha = Math.max(0.12, 0.58 * shadowScale);
        ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
        ctx.beginPath();
        ctx.ellipse(
          die.x,
          die.y + 16 + zAlt * 0.08,
          die.size * 0.72 * shadowScale,
          die.size * 0.38 * shadowScale,
          0,
          0,
          Math.PI * 2
        );
        ctx.fill();
        ctx.restore();

        // B. Matrix-Based True 3D Isometric Projection
        // Combined transformation matrix: totalMat = CAM_MATRIX * dieMatrix
        const dieMat = mat3FromEuler(die.rotX, die.rotY, die.rotZ);
        const totalMat = mat3Multiply(CAM_MATRIX, dieMat);

        // 8 Local Cube Vertices
        const localVerts = [
          [-s, s, -s],  // 0: top-front-left
          [s, s, -s],   // 1: top-front-right
          [s, s, s],    // 2: top-back-right
          [-s, s, s],   // 3: top-back-left
          [-s, -s, -s], // 4: bot-front-left
          [s, -s, -s],  // 5: bot-front-right
          [s, -s, s],   // 6: bot-back-right
          [-s, -s, s]   // 7: bot-back-left
        ];

        // Transform vertices to camera view space
        const projVerts = localVerts.map((v) => {
          const [cx, cy, cz] = mat3Transform(totalMat, v[0], v[1], v[2]);
          return {
            x: die.x + cx,
            y: die.y - zAlt * 0.65 + cy,
            z: cz
          };
        });

        // 6 Cube Faces (Local normals)
        const faces = [
          { value: 1, indices: [0, 1, 2, 3], normal: [0, 1, 0] },   // Top (+Y)
          { value: 6, indices: [7, 6, 5, 4], normal: [0, -1, 0] },  // Bottom (-Y)
          { value: 2, indices: [4, 5, 1, 0], normal: [0, 0, -1] },  // Front (-Z)
          { value: 5, indices: [3, 2, 6, 7], normal: [0, 0, 1] },   // Back (+Z)
          { value: 3, indices: [1, 5, 6, 2], normal: [1, 0, 0] },   // Right (+X)
          { value: 4, indices: [4, 0, 3, 7], normal: [-1, 0, 0] }   // Left (-X)
        ];

        // Transform normals to camera view space & cull back faces
        const visibleFaces = faces
          .map((f) => {
            const [nx, ny, nz] = mat3Transform(totalMat, f.normal[0], f.normal[1], f.normal[2]);
            const avgZ = (projVerts[f.indices[0]].z + projVerts[f.indices[1]].z + projVerts[f.indices[2]].z + projVerts[f.indices[3]].z) / 4;
            return {
              ...f,
              camNorm: [nx, ny, nz],
              avgZ,
              isVisible: nz > 0.05 // facing camera
            };
          })
          .filter((f) => f.isVisible)
          .sort((a, b) => a.avgZ - b.avgZ);

        // Render each visible 3D face with rich specular shading
        visibleFaces.forEach((f) => {
          const v0 = projVerts[f.indices[0]];
          const v1 = projVerts[f.indices[1]];
          const v2 = projVerts[f.indices[2]];
          const v3 = projVerts[f.indices[3]];

          // Directional Lighting
          const lightDir = [-0.3, -0.6, 0.7];
          const dot = f.camNorm[0] * lightDir[0] + f.camNorm[1] * lightDir[1] + f.camNorm[2] * lightDir[2];
          const brightness = Math.max(0.45, Math.min(1.0, 0.72 + dot * 0.45));

          // Jewel Acrylic Colors
          let faceHex = '#dc2626'; // Vegas Ruby Red
          if (die.colorType === 'sapphire') faceHex = '#2563eb';
          else if (die.colorType === 'amber') faceHex = '#d97706';

          ctx.save();
          ctx.beginPath();
          ctx.moveTo(v0.x, v0.y);
          ctx.lineTo(v1.x, v1.y);
          ctx.lineTo(v2.x, v2.y);
          ctx.lineTo(v3.x, v3.y);
          ctx.closePath();

          ctx.fillStyle = faceHex;
          ctx.globalAlpha = brightness;
          ctx.fill();

          // Beveled Silver Edge Rim
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
          ctx.lineWidth = 1.6;
          ctx.stroke();

          // Specular Glare on Top Face
          if (f.camNorm[1] < -0.35) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
            ctx.fill();
          }
          ctx.restore();

          // Inset White Casino Pips (Drawn in 3D perspective!)
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
            const px = center.x + vecU.x * pu * 1.45 + vecV.x * pv * 1.45;
            const py = center.y + vecU.y * pu * 1.45 + vecV.y * pv * 1.45;
            const pipR = Math.max(2.2, (die.size / 13) * brightness);

            ctx.beginPath();
            ctx.arc(px, py, pipR, 0, Math.PI * 2);
            ctx.fillStyle = val === 1 && die.colorType === 'ruby' ? '#fbbf24' : '#ffffff';
            ctx.fill();

            ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
            ctx.lineWidth = 0.8;
            ctx.stroke();
          });
          ctx.restore();
        });

        // Die ID Badge label
        ctx.fillStyle = '#fbbf24';
        ctx.font = '900 11px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`DIE #${die.id + 1}`, die.x, die.y + die.size * 0.65 + 16);
      });

      ctx.restore();
      juice.renderParticles(canvasMgr.ctx, canvasMgr.width / W);
    };

    const loop = new GameLoop({ update, render });
    loop.start();

    return () => {
      loop.stop();
    };
  }, []);

  // Handlers
  const handleCycleBet = (dieIndex: number) => {
    soundService.playImpact(0.8);
    const existing = myGuesses ? myGuesses[dieIndex] : (dieIndex * 2 + 1) % 6 + 1;
    const nextBet = (existing % 6) + 1; // Cycles 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 1

    onDispatchActionRef.current('LUCKY_DICE_CHANGE_BET', { dieIndex, newBet: nextBet });

    // Preview rotation on 3D die
    const die = diceRef.current[dieIndex];
    if (die) {
      die.targetValue = nextBet;
      const targetAngle = FACE_ALIGNMENTS[nextBet] || [0, 0, 0];
      die.rotX = targetAngle[0];
      die.rotY = targetAngle[1];
      die.rotZ = targetAngle[2];
    }
  };

  const handleRandomizeAllBets = () => {
    soundService.playCountdown(1);
    for (let i = 0; i < diceCount; i++) {
      const rand = Math.floor(Math.random() * 6) + 1;
      onDispatchActionRef.current('LUCKY_DICE_CHANGE_BET', { dieIndex: i, newBet: rand });

      const die = diceRef.current[i];
      if (die) {
        die.targetValue = rand;
        const targetAngle = FACE_ALIGNMENTS[rand] || [0, 0, 0];
        die.rotX = targetAngle[0];
        die.rotY = targetAngle[1];
        die.rotZ = targetAngle[2];
      }
    }
  };

  const handleRollDice = () => {
    if (isRollingRef.current || gameState?.phase !== 'rolling' || gameState.currentTurn !== playerUid) return;
    onDispatchActionRef.current('LUCKY_DICE_ROLL', { actingUid: playerUid });
  };

  const myGuesses = gameState?.guesses?.[playerUid] || Array.from({ length: diceCount }, (_, i) => ((i * 2 + 1) % 6) + 1);
  const myCleared = gameState?.cleared?.[playerUid] || new Array(diceCount).fill(false);
  const oppUid = p1Uid === playerUid ? p2Uid : p1Uid;
  const oppGuesses = gameState?.guesses?.[oppUid] || Array.from({ length: diceCount }, (_, i) => ((i * 2 + 2) % 6) + 1);
  const oppCleared = gameState?.cleared?.[oppUid] || new Array(diceCount).fill(false);

  const isMyTurn = gameState?.currentTurn === playerUid;
  const p1Score = room.scores[p1Uid] || gameState?.roundScores?.[p1Uid] || 0;
  const p2Score = room.scores[p2Uid] || gameState?.roundScores?.[p2Uid] || 0;

  return (
    <div className="w-full max-w-md mx-auto flex flex-col items-center select-none gap-2 px-1">
      {/* 1. Sleek Casino Duel Scoreboard Header */}
      <div className="w-full flex items-center justify-between bg-slate-900/90 border-2 border-amber-500/30 rounded-2xl px-3 py-1.5 shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center font-black font-['Outfit'] text-amber-300 text-sm">
            {p1Score}
          </div>
          <span className="text-xs font-black font-['Outfit'] text-amber-400">
            {p1Uid === playerUid ? 'YOU' : p1Nickname}
          </span>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-slate-950 border border-slate-800 text-[11px] font-mono font-bold text-slate-300">
          <Coins className="w-3.5 h-3.5 text-yellow-400" />
          <span>BEST OF {room.maxRounds || 3}</span>
        </div>

        <div className="flex items-center gap-2 flex-row-reverse text-right">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border-2 border-cyan-400 flex items-center justify-center font-black font-['Outfit'] text-cyan-300 text-sm">
            {p2Score}
          </div>
          <span className="text-xs font-black font-['Outfit'] text-cyan-400">
            {p2Uid === playerUid ? 'YOU' : p2Nickname}
          </span>
        </div>
      </div>

      {/* 2. Unmistakable Turn Announcement Spotlight Bar */}
      <div
        className={`w-full py-2 px-3 rounded-2xl border-2 flex items-center justify-between shadow-xl transition-all ${
          isMyTurn
            ? 'bg-gradient-to-r from-amber-500/20 via-yellow-500/20 to-amber-500/20 border-amber-400 text-amber-300 shadow-amber-500/20 animate-pulse'
            : 'bg-gradient-to-r from-cyan-950/40 via-cyan-900/30 to-cyan-950/40 border-cyan-500/50 text-cyan-300'
        }`}
      >
        <div className="flex items-center gap-2 font-black font-['Outfit'] text-sm tracking-wide">
          <Dices className={`w-5 h-5 ${isMyTurn ? 'text-amber-400 animate-spin-slow' : 'text-cyan-400'}`} />
          <span>{isMyTurn ? '⭐ YOUR TURN TO SHOOT! ⭐' : `🤖 ${p2Nickname.toUpperCase()} IS SHOOTING...`}</span>
        </div>

        <span className="text-[10px] font-mono text-slate-400 font-bold">
          {myCleared.filter(Boolean).length}/{diceCount} vs {oppCleared.filter(Boolean).length}/{diceCount} Cleared
        </span>
      </div>

      {/* 3. CyberBot / Opponent Prediction Chips (Above Table) */}
      <div className="w-full bg-slate-950/90 border border-slate-800/80 rounded-xl px-2.5 py-1.5 flex items-center justify-between shadow-md">
        <span className="text-[11px] font-mono font-bold text-cyan-400">
          {oppUid === playerUid ? 'YOU' : p2Nickname}:
        </span>
        <div className="flex items-center gap-2">
          {Array.from({ length: diceCount }).map((_, idx) => (
            <div
              key={idx}
              className={`px-2.5 py-1 rounded-xl border flex items-center gap-1.5 font-mono transition-all ${
                oppCleared[idx]
                  ? 'bg-emerald-950 border-emerald-400 text-emerald-300 shadow-md shadow-emerald-500/30'
                  : 'bg-slate-900 border-slate-800 text-slate-300'
              }`}
            >
              <span className="text-[10px] text-slate-500">#{idx + 1}</span>
              <span className="text-sm font-black text-cyan-300">{oppGuesses[idx]}</span>
              {oppCleared[idx] && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />}
            </div>
          ))}
        </div>
      </div>

      {/* 4. Spacious 3D Vegas Craps Table Canvas (Permanent 60 FPS) */}
      <div className="w-full h-[38vh] min-h-[260px] max-h-[360px] aspect-[460/380] rounded-3xl overflow-hidden shadow-2xl border-4 border-amber-900/60 relative bg-[#01120b]">
        <canvas ref={canvasRef} className="w-full h-full block select-none" />

        {/* Live Roll Callout Banner on Table */}
        {lastRollAnnouncement.current && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-slate-950/95 border border-amber-500/40 px-3 py-1 rounded-full text-[10px] font-mono text-amber-300 font-bold shadow-xl pointer-events-none whitespace-nowrap">
            {lastRollAnnouncement.current}
          </div>
        )}
      </div>

      {/* 5. Player's Prediction Chips (Spacious & Interactive) */}
      <div className="w-full bg-slate-950/90 border-2 border-amber-500/30 rounded-2xl p-2.5 flex items-center justify-between shadow-lg">
        <div className="flex flex-col">
          <span className="text-[11px] font-mono font-black text-amber-400">YOUR TARGETS:</span>
          <span className="text-[9px] font-mono text-slate-400">Tap chip to change (1–6)</span>
        </div>

        <div className="flex items-center gap-2">
          {Array.from({ length: diceCount }).map((_, idx) => (
            <button
              key={idx}
              onClick={() => handleCycleBet(idx)}
              className={`px-3 py-1.5 rounded-xl border-2 flex items-center gap-1.5 font-mono active:scale-95 transition-all cursor-pointer ${
                myCleared[idx]
                  ? 'bg-emerald-950 border-emerald-400 text-emerald-300 shadow-md shadow-emerald-500/40'
                  : 'bg-slate-900 border-amber-400/60 text-white hover:border-amber-400'
              }`}
              title="Click to cycle lucky number"
            >
              <span className="text-[10px] text-amber-400/80">#{idx + 1}</span>
              <span className="text-base font-black text-amber-300">{myGuesses[idx]}</span>
              {myCleared[idx] ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 stroke-[3]" />
              ) : (
                <span className="text-[9px] text-slate-400">✎</span>
              )}
            </button>
          ))}

          {/* Quick Randomize Button */}
          <button
            onClick={handleRandomizeAllBets}
            className="p-2 rounded-xl bg-slate-900 border border-slate-700 hover:border-amber-400 text-slate-300 hover:text-white active:scale-95 transition"
            title="Randomize all lucky targets"
          >
            <RefreshCw className="w-4 h-4 text-cyan-400" />
          </button>
        </div>
      </div>

      {/* 6. Giant Tactile Arcade Spin / Roll Button */}
      <div className="w-full pt-0.5">
        {isMyTurn ? (
          <button
            onClick={handleRollDice}
            className="w-full h-14 rounded-2xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 hover:brightness-110 active:scale-95 text-slate-950 font-black font-['Outfit'] text-lg flex items-center justify-center gap-2.5 shadow-xl shadow-amber-500/40 transition-all cursor-pointer"
          >
            <Dices className="w-6 h-6 animate-bounce" />
            <span>🎲 SHOOT THE CRAPS DICE! (YOUR TURN)</span>
          </button>
        ) : (
          <div className="w-full h-14 rounded-2xl bg-slate-900/90 border-2 border-slate-700 flex items-center justify-center gap-2 text-cyan-300 font-mono text-sm font-bold shadow-md">
            <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
            <span>{isBotPlaying ? 'CyberBot is shooting the dice...' : 'Waiting for opponent to shoot...'}</span>
          </div>
        )}
      </div>

      {/* 7. Round Over Celebration Banner */}
      {gameState?.phase === 'round_end' && gameState.roundWinnerUid && (
        <div className="w-full p-3.5 rounded-2xl bg-gradient-to-r from-amber-600 via-yellow-500 to-amber-600 border-2 border-amber-300 text-slate-950 flex flex-col items-center justify-center gap-1 shadow-2xl animate-fade-in text-center">
          <Trophy className="w-8 h-8 text-slate-950 animate-bounce" />
          <h3 className="text-xl font-black font-['Outfit']">
            {gameState.roundWinnerUid === playerUid
              ? '🎉 JACKPOT! YOU WON THE ROUND!'
              : `👑 ${room.players[gameState.roundWinnerUid]?.nickname || 'OPPONENT'} WINS!`}
          </h3>
          <p className="text-[11px] font-mono font-bold text-slate-900">
            All targets cleared! Next round begins in 2 seconds...
          </p>
        </div>
      )}
    </div>
  );
};
