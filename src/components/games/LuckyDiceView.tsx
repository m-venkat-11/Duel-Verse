import React, { useState, useEffect, useRef } from 'react';
import type { LuckyDiceState } from '../../types/game';
import type { AuthoritativeRoomState } from '../../types/room';
import { GameLoop } from '../../engine/core/GameLoop';
import { CanvasManager } from '../../engine/core/CanvasManager';
import { JuiceEngine } from '../../engine/core/JuiceEngine';
import { soundService } from '../../services/sound';
import { Trophy, Dices, Sparkles, Lock, RefreshCw, CheckCircle2, Crown, Zap, Flame, Coins } from 'lucide-react';

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
  z: number; // Altitude above felt table
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
  colorType: 'ruby' | 'sapphire' | 'amber' | 'emerald';
  targetValue: number;
  isSettled: boolean;
  settleTimer: number;
  matchedBy: string[]; // UIDs that matched this die
}

// 3D Rotation Utility
function rotate3D(
  x: number,
  y: number,
  z: number,
  rx: number,
  ry: number,
  rz: number
): [number, number, number] {
  const cosX = Math.cos(rx), sinX = Math.sin(rx);
  const y1 = y * cosX - z * sinX;
  const z1 = y * sinX + z * cosX;

  const cosY = Math.cos(ry), sinY = Math.sin(ry);
  const x2 = x * cosY + z1 * sinY;
  const z2 = -x * sinY + z1 * cosY;

  const cosZ = Math.cos(rz), sinZ = Math.sin(rz);
  const x3 = x2 * cosZ - y1 * sinZ;
  const y3 = x2 * sinZ + y1 * cosZ;

  return [x3, y3, z2];
}

// Target Euler angles so that face `N` faces UP towards the camera
const FACE_EULER: Record<number, [number, number, number]> = {
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
  const isBotPlaying = Boolean(room.players['bot_rival'] || p2Uid === 'bot_rival' || players.length < 2);

  const p1Nickname = room.players[p1Uid]?.nickname || 'Player 1';
  const p2Nickname = room.players[p2Uid]?.nickname || 'CyberBot';

  const diceCount = gameState?.diceCount || 3;
  const onDispatchActionRef = useRef(onDispatchAction);
  useEffect(() => {
    onDispatchActionRef.current = onDispatchAction;
  }, [onDispatchAction]);

  // Player Betting Predictions
  const [selectedBets, setSelectedBets] = useState<number[]>(() =>
    Array.from({ length: diceCount }, () => Math.floor(Math.random() * 6) + 1)
  );

  useEffect(() => {
    setSelectedBets((prev) => {
      const copy = [...prev];
      while (copy.length < diceCount) copy.push(Math.floor(Math.random() * 6) + 1);
      return copy.slice(0, diceCount);
    });
  }, [diceCount]);

  // Physical 3D Dice Array in Ref
  const diceRef = useRef<PhysicalCasinoDie[]>([]);
  const isRollingRef = useRef<boolean>(false);
  const laserBeamsRef = useRef<Array<{ x1: number; y1: number; x2: number; y2: number; alpha: number; color: string }>>([]);

  const W = 460;
  const H = 490;
  const TABLE_LEFT = 35;
  const TABLE_RIGHT = 425;
  const TABLE_TOP = 45;
  const TABLE_BOTTOM = 445;

  // Initialize 3D Casino Dice
  const initDice = (count: number, values: number[]) => {
    const colors: Array<'ruby' | 'sapphire' | 'amber' | 'emerald'> = ['ruby', 'sapphire', 'amber', 'emerald'];
    const newList: PhysicalCasinoDie[] = [];
    const spacing = (TABLE_RIGHT - TABLE_LEFT) / (count + 1);

    for (let i = 0; i < count; i++) {
      const val = values[i] || Math.floor(Math.random() * 6) + 1;
      const angles = FACE_EULER[val] || [0, 0, 0];

      newList.push({
        id: i,
        x: TABLE_LEFT + spacing * (i + 1),
        y: (TABLE_TOP + TABLE_BOTTOM) / 2 + 15,
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
        size: count <= 3 ? 56 : 48,
        colorType: colors[i % colors.length],
        targetValue: val,
        isSettled: true,
        settleTimer: 0,
        matchedBy: []
      });
    }
    diceRef.current = newList;
  };

  useEffect(() => {
    if (gameState?.currentRoll) {
      initDice(diceCount, gameState.currentRoll);
    }
  }, [diceCount]);

  // Launch explosive 3D Craps Toss against the diamond rubber bumpers
  const trigger3DCrapsToss = (targetRoll: number[]) => {
    isRollingRef.current = true;
    soundService.playCountdown(1);

    diceRef.current.forEach((die, idx) => {
      die.targetValue = targetRoll[idx] || Math.floor(Math.random() * 6) + 1;
      die.isSettled = false;
      die.settleTimer = 1.05 + idx * 0.16; // Staggered settling
      die.matchedBy = [];

      // Physical shoot trajectory towards the back wall
      die.vz = 440 + Math.random() * 150; // High vertical launch
      die.vx = (Math.random() - 0.5) * 380;
      die.vy = -180 + (Math.random() - 0.5) * 220; // Thrown forward towards bumper wall

      // Wild 3D angular spin
      die.vrotX = (Math.random() - 0.5) * 28;
      die.vrotY = (Math.random() - 0.5) * 28;
      die.vrotZ = (Math.random() - 0.5) * 28;
    });
  };

  // Listen to roll updates from authoritative state
  const prevRollCount = useRef<number>(gameState?.rollCount || 0);
  useEffect(() => {
    if (gameState?.rollCount && gameState.rollCount > prevRollCount.current) {
      prevRollCount.current = gameState.rollCount;
      if (gameState.currentRoll) {
        trigger3DCrapsToss(gameState.currentRoll);
      }
    }
  }, [gameState?.rollCount, gameState?.currentRoll]);

  // Automated CyberBot roll trigger (Guarantees bot ALWAYS takes turn without getting stuck!)
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

  // Play Victory FX on round win
  useEffect(() => {
    if (gameState?.roundWinnerUid) {
      soundService.playVictory();
    }
  }, [gameState?.roundWinnerUid]);

  // Permanent 60 FPS GameLoop (Never unmounted, always alive!)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasMgr = new CanvasManager(canvas);
    const juice = new JuiceEngine(350);

    const update = (dt: number) => {
      const clampedDt = Math.min(0.04, dt);
      juice.update(clampedDt);

      let allSettled = true;

      diceRef.current.forEach((die) => {
        if (!die.isSettled) {
          allSettled = false;
          die.settleTimer -= clampedDt;

          // Gravity & Velocity
          die.vz -= 1200 * clampedDt;
          die.x += die.vx * clampedDt;
          die.y += die.vy * clampedDt;
          die.z += die.vz * clampedDt;

          // Spin
          die.rotX += die.vrotX * clampedDt;
          die.rotY += die.vrotY * clampedDt;
          die.rotZ += die.vrotZ * clampedDt;

          // Sparks while airborne
          if (die.z > 25 && Math.random() < 0.35) {
            juice.emitSparks(die.x, die.y - die.z * 0.3, 2, '#fbbf24', '#ffffff', 1.8);
          }

          // Table Floor Collision (z <= 0)
          if (die.z <= 0) {
            die.z = 0;
            if (die.settleTimer > 0) {
              // Elastic bounce on velvet felt
              die.vz = -die.vz * 0.54;
              die.vx *= 0.82;
              die.vy *= 0.82;
              die.vrotX *= 0.72;
              die.vrotY *= 0.72;
              die.vrotZ *= 0.72;

              soundService.playImpact(0.85);
              juice.addTrauma(0.12);
              juice.emitSparks(die.x, die.y, 6, '#f59e0b', '#ffffff', 2.2);
            } else {
              // Settling: Magnetic snap to target face orientation!
              const targetEuler = FACE_EULER[die.targetValue] || [0, 0, 0];
              die.rotX += (targetEuler[0] - die.rotX) * Math.min(1, 15 * clampedDt);
              die.rotY += (targetEuler[1] - die.rotY) * Math.min(1, 15 * clampedDt);
              die.rotZ += (targetEuler[2] - die.rotZ) * Math.min(1, 15 * clampedDt);

              die.vx *= 0.55;
              die.vy *= 0.55;
              die.vz = 0;

              if (Math.abs(die.vx) < 6 && Math.abs(die.vy) < 6) {
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
            die.vy = Math.abs(die.vy) * 0.82; // Strong bounce off back wall pyramids!
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

      laserBeamsRef.current = laserBeamsRef.current.filter((b) => {
        b.alpha -= clampedDt * 2.2;
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

      // 1. Vegas VIP Casino Felt Table
      const feltGrad = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, 300);
      feltGrad.addColorStop(0, '#043b27');
      feltGrad.addColorStop(0.65, '#022417');
      feltGrad.addColorStop(1, '#01120b');
      ctx.fillStyle = feltGrad;
      ctx.fillRect(0, 0, W, H);

      // Casino Mahogany Table Rim with Brass Studs
      ctx.fillStyle = '#1e0c05';
      ctx.fillRect(0, 0, W, TABLE_TOP - 15);
      ctx.fillRect(0, TABLE_BOTTOM + 15, W, H - (TABLE_BOTTOM + 15));
      ctx.fillRect(0, 0, TABLE_LEFT - 12, H);
      ctx.fillRect(TABLE_RIGHT + 12, 0, W - (TABLE_RIGHT + 12), H);

      // Brass Inlay Trim
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(TABLE_LEFT - 12, TABLE_TOP - 15, TABLE_RIGHT - TABLE_LEFT + 24, TABLE_BOTTOM - TABLE_TOP + 30);

      // Real Craps Diamond Rubber Pyramid Bumpers on Back Wall (Where dice rebound!)
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(TABLE_LEFT - 10, TABLE_TOP - 14, TABLE_RIGHT - TABLE_LEFT + 20, 14);

      ctx.fillStyle = '#dc2626';
      const pyrW = 12;
      for (let px = TABLE_LEFT - 10; px < TABLE_RIGHT + 10; px += pyrW) {
        ctx.beginPath();
        ctx.moveTo(px, TABLE_TOP - 14);
        ctx.lineTo(px + pyrW / 2, TABLE_TOP);
        ctx.lineTo(px + pyrW, TABLE_TOP - 14);
        ctx.closePath();
        ctx.fill();
      }

      // Craps Silkscreen Table Markings (Gold Filigree)
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.16)';
      ctx.lineWidth = 1.5;

      // Center Field Bet Area
      ctx.strokeRect(TABLE_LEFT + 20, TABLE_TOP + 30, TABLE_RIGHT - TABLE_LEFT - 40, TABLE_BOTTOM - TABLE_TOP - 60);

      ctx.fillStyle = 'rgba(245, 158, 11, 0.22)';
      ctx.font = '900 13px "Outfit", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('★ DUELVERSE HIGH ROLLER CRAPS ★', W / 2, TABLE_TOP + 55);

      ctx.font = '700 9px "Outfit", sans-serif';
      ctx.fillStyle = 'rgba(245, 158, 11, 0.15)';
      ctx.fillText('PASS LINE • FIELD BETS • NATURAL JACKPOT', W / 2, TABLE_TOP + 72);

      // Center Circular Shooting Ring
      ctx.beginPath();
      ctx.arc(W / 2, (TABLE_TOP + TABLE_BOTTOM) / 2 + 15, 75, 0, Math.PI * 2);
      ctx.stroke();

      ctx.font = '900 10px "Outfit", sans-serif';
      ctx.fillStyle = 'rgba(245, 158, 11, 0.18)';
      ctx.fillText('🎲 LIVE SHOOT TRAY 🎲', W / 2, (TABLE_TOP + TABLE_BOTTOM) / 2 + 20);

      // 2. Render 3D Translucent Casino Acrylic Dice
      const sortedDice = [...diceRef.current].sort((a, b) => a.y - b.y);

      sortedDice.forEach((die) => {
        const s = die.size / 2;
        const zAlt = Math.max(0, die.z);

        // A. Dynamic Ground Shadow on Felt
        ctx.save();
        ctx.fillStyle = `rgba(0, 0, 0, ${Math.max(0.12, 0.58 - zAlt * 0.002)})`;
        ctx.beginPath();
        ctx.ellipse(
          die.x,
          die.y + 14 + zAlt * 0.08,
          Math.max(12, die.size * 0.7 * (1 - zAlt * 0.001)),
          Math.max(6, die.size * 0.38 * (1 - zAlt * 0.001)),
          0,
          0,
          Math.PI * 2
        );
        ctx.fill();
        ctx.restore();

        // B. 3D Cube Geometry with True Directional Shading
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

        const rotVerts = rawVerts.map((v) => rotate3D(v[0], v[1], v[2], die.rotX, die.rotY, die.rotZ));
        const projVerts = rotVerts.map((v) => ({
          x: die.x + v[0],
          y: die.y - zAlt + v[1],
          z: v[2]
        }));

        const faces = [
          { value: 1, indices: [4, 5, 6, 7], normal: [0, 0, 1] },
          { value: 6, indices: [1, 0, 3, 2], normal: [0, 0, -1] },
          { value: 3, indices: [5, 1, 2, 6], normal: [1, 0, 0] },
          { value: 4, indices: [0, 4, 7, 3], normal: [-1, 0, 0] },
          { value: 2, indices: [0, 1, 5, 4], normal: [0, -1, 0] },
          { value: 5, indices: [7, 6, 2, 3], normal: [0, 1, 0] }
        ];

        const visibleFaces = faces
          .map((f) => {
            const rotNorm = rotate3D(f.normal[0], f.normal[1], f.normal[2], die.rotX, die.rotY, die.rotZ);
            const avgZ = f.indices.reduce((sum, idx) => sum + projVerts[idx].z, 0) / 4;
            return {
              ...f,
              rotNorm,
              avgZ,
              isVisible: rotNorm[2] > -0.05
            };
          })
          .filter((f) => f.isVisible)
          .sort((a, b) => a.avgZ - b.avgZ);

        visibleFaces.forEach((f) => {
          const v0 = projVerts[f.indices[0]];
          const v1 = projVerts[f.indices[1]];
          const v2 = projVerts[f.indices[2]];
          const v3 = projVerts[f.indices[3]];

          const lightDir = [-0.4, -0.6, 0.7];
          const dot = f.rotNorm[0] * lightDir[0] + f.rotNorm[1] * lightDir[1] + f.rotNorm[2] * lightDir[2];
          const brightness = Math.max(0.45, Math.min(1.0, 0.7 + dot * 0.45));

          // Vegas Translucent Jewel Acrylic Colors
          let faceHex = '#dc2626'; // Vegas Ruby Red
          if (die.colorType === 'sapphire') faceHex = '#2563eb';
          else if (die.colorType === 'amber') faceHex = '#d97706';
          else if (die.colorType === 'emerald') faceHex = '#059669';

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

          // Beveled Silver / Acrylic Edge
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
          ctx.lineWidth = 1.8;
          ctx.stroke();

          // Specular Glare across top face
          if (f.rotNorm[2] > 0.6) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
            ctx.fill();
          }
          ctx.restore();

          // Draw Inset Casino Pips (Crisp white circular dots)
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
            const pipR = Math.max(2.5, (die.size / 13) * brightness);

            ctx.beginPath();
            ctx.arc(px, py, pipR, 0, Math.PI * 2);

            // In real casino dice, pips are filled with flush opaque white paint!
            ctx.fillStyle = val === 1 && die.colorType === 'ruby' ? '#fbbf24' : '#ffffff';
            ctx.fill();

            // Pip inner engraved shadow
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
        ctx.fillText(`DIE #${die.id + 1}`, die.x, die.y + die.size * 0.75 + 16);
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
  const handleSelectBet = (index: number, num: number) => {
    soundService.playImpact(0.8);
    setSelectedBets((prev) => {
      const copy = [...prev];
      copy[index] = num;
      return copy;
    });

    // Also preview rotate 3D die on table!
    const die = diceRef.current[index];
    if (die) {
      die.targetValue = num;
      const targetAngle = FACE_EULER[num] || [0, 0, 0];
      die.rotX = targetAngle[0];
      die.rotY = targetAngle[1];
      die.rotZ = targetAngle[2];
    }
  };

  const handleRandomizeBets = () => {
    soundService.playCountdown(1);
    const randomized = Array.from({ length: diceCount }, () => Math.floor(Math.random() * 6) + 1);
    setSelectedBets(randomized);

    randomized.forEach((num, idx) => {
      const die = diceRef.current[idx];
      if (die) {
        die.targetValue = num;
        const targetAngle = FACE_EULER[num] || [0, 0, 0];
        die.rotX = targetAngle[0];
        die.rotY = targetAngle[1];
        die.rotZ = targetAngle[2];
      }
    });
  };

  const handleSetDiceCount = (count: number) => {
    soundService.playImpact(0.8);
    onDispatchActionRef.current('LUCKY_DICE_SET_COUNT', { diceCount: count });
  };

  const handleLockBets = () => {
    soundService.playScore();
    onDispatchActionRef.current('LUCKY_DICE_SUBMIT_GUESS', { guesses: selectedBets });
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
      {/* 1. Vegas High Roller Header Scoreboard */}
      <div className="w-full flex items-center justify-between bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-2 border-amber-500/40 rounded-2xl px-3 py-2 shadow-2xl backdrop-blur-md">
        {/* P1 Chip Count */}
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center font-black font-['Outfit'] text-amber-300 text-sm shadow-inner">
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

        {/* Casino Stakes Badge */}
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-1 text-amber-300 font-mono text-xs font-black">
            <Coins className="w-4 h-4 text-yellow-400 animate-bounce" />
            <span>RACE TO {room.maxRounds || 3} WINS</span>
          </div>
          <span className="text-[9px] font-mono text-emerald-400 font-bold uppercase tracking-widest">
            VEGAS HIGH ROLLER CRAPS
          </span>
        </div>

        {/* P2 Chip Count */}
        <div className="flex items-center gap-2 flex-row-reverse text-right">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border-2 border-cyan-400 flex items-center justify-center font-black font-['Outfit'] text-cyan-300 text-sm shadow-inner">
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

      {/* 2. Opponent's Bet Line (House / Rival) */}
      <div className="w-full bg-slate-950/90 border border-slate-800 rounded-xl px-2.5 py-1.5 flex items-center justify-between shadow-md">
        <span className="text-[11px] font-mono font-bold text-cyan-400 flex items-center gap-1">
          <span>{oppUid === playerUid ? 'YOU' : p2Nickname}</span>
          <span className="text-slate-500">BETS:</span>
        </span>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: diceCount }).map((_, idx) => (
            <div
              key={idx}
              className={`px-2 py-0.5 rounded-lg border text-xs font-mono flex items-center gap-1 transition-all ${
                oppCleared[idx]
                  ? 'bg-emerald-950 border-emerald-400 text-emerald-300 shadow-sm shadow-emerald-500/30'
                  : 'bg-slate-900 border-slate-800 text-slate-300'
              }`}
            >
              <span className="text-[9px] text-slate-500">#{idx + 1}:</span>
              <span className="font-black text-cyan-300">{oppGuesses ? oppGuesses[idx] : '?'}</span>
              {oppCleared[idx] && <CheckCircle2 className="w-3 h-3 text-emerald-400 stroke-[3]" />}
            </div>
          ))}
        </div>
      </div>

      {/* 3. The Vegas Craps 3D Table Stadium (PERMANENT CANVAS, NEVER DISMOUNTED!) */}
      <div className="w-full h-[44vh] min-h-[300px] max-h-[420px] aspect-[460/490] rounded-3xl overflow-hidden shadow-2xl border-4 border-amber-900/60 relative bg-[#01120b]">
        <canvas ref={canvasRef} className="w-full h-full block select-none" />

        {/* Turn Status Pill Overlay */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-slate-950/90 border border-amber-500/40 px-3 py-1 rounded-full text-[10px] font-mono text-slate-200 flex items-center gap-1.5 shadow-lg pointer-events-none">
          <span className={`w-2 h-2 rounded-full ${isMyTurn ? 'bg-amber-400 animate-ping' : 'bg-cyan-400'}`} />
          <span>{isMyTurn ? '🎲 YOUR TURN TO SHOOT' : `⏳ ${p2Nickname.toUpperCase()}'S TURN TO SHOOT`}</span>
        </div>
      </div>

      {/* 4. Interactive Betting Chip Tray OR Live Rolling Controls */}
      {gameState.phase === 'guessing' && !myGuesses ? (
        /* --- PHASE 1: BETTING / SELECTION CONTROLS --- */
        <div className="w-full bg-slate-950/90 border-2 border-slate-800 rounded-2xl p-3 flex flex-col gap-2 shadow-xl">
          {/* Dice Count Selector */}
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <span className="text-[11px] font-mono text-amber-400 font-bold flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Dice Quantity:</span>
            </span>
            <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
              {[1, 2, 3, 4, 5].map((cnt) => (
                <button
                  key={cnt}
                  onClick={() => handleSetDiceCount(cnt)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-black font-mono transition-all ${
                    diceCount === cnt
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-md scale-105'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {cnt}
                  {cnt === 3 && '⭐'}
                </button>
              ))}
            </div>
          </div>

          {/* Place Chip Bets for each Die */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-mono text-slate-300 font-bold">
              Place your lucky chip on each die (1 to 6):
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {Array.from({ length: diceCount }).map((_, idx) => (
                <div key={idx} className="bg-slate-900 border border-slate-800 rounded-xl p-2 flex flex-col items-center gap-1.5">
                  <div className="flex items-center justify-between w-full text-[10px] font-mono text-slate-400 font-bold px-1">
                    <span>Die #{idx + 1}</span>
                    <span className="text-amber-400 font-black">Bet: {selectedBets[idx] || 1}</span>
                  </div>
                  <div className="grid grid-cols-6 gap-1 w-full">
                    {[1, 2, 3, 4, 5, 6].map((num) => (
                      <button
                        key={num}
                        onClick={() => handleSelectBet(idx, num)}
                        className={`h-7 rounded-lg text-xs font-black font-mono flex items-center justify-center transition-all ${
                          selectedBets[idx] === num
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

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleRandomizeBets}
              className="flex-1 h-11 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-95 border border-slate-700 text-xs font-black font-mono text-slate-200 flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
            >
              <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
              <span>RANDOMIZE</span>
            </button>
            <button
              onClick={handleLockBets}
              className="flex-[2] h-11 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:brightness-110 active:scale-95 text-xs font-black font-mono text-slate-950 flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-500/30"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>LOCK BETS & ENTER CASINO</span>
            </button>
          </div>
        </div>
      ) : (
        /* --- PHASE 2: CRAPS SHOOTING / ROLLING CONTROLS --- */
        <div className="w-full flex flex-col gap-2">
          {/* Player's Own Bet Line */}
          <div className="w-full bg-slate-950/90 border border-slate-800 rounded-xl px-2.5 py-1.5 flex items-center justify-between shadow-md">
            <span className="text-[11px] font-mono font-bold text-amber-400 flex items-center gap-1">
              <span>YOUR BETS:</span>
            </span>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: diceCount }).map((_, idx) => (
                <div
                  key={idx}
                  className={`px-2 py-0.5 rounded-lg border text-xs font-mono flex items-center gap-1 transition-all ${
                    myCleared[idx]
                      ? 'bg-emerald-950 border-emerald-400 text-emerald-300 shadow-sm shadow-emerald-500/30'
                      : 'bg-slate-900 border-slate-800 text-slate-300'
                  }`}
                >
                  <span className="text-[9px] text-slate-500">#{idx + 1}:</span>
                  <span className="font-black text-amber-300">{myGuesses ? myGuesses[idx] : selectedBets[idx]}</span>
                  {myCleared[idx] && <CheckCircle2 className="w-3 h-3 text-emerald-400 stroke-[3]" />}
                </div>
              ))}
            </div>
          </div>

          {/* Giant Craps Shoot Button */}
          {gameState.phase === 'rolling' && (
            <div className="w-full pt-0.5">
              {isMyTurn ? (
                <button
                  onClick={handleRollDice}
                  className="w-full h-14 rounded-2xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 hover:brightness-110 active:scale-95 text-slate-950 font-black font-['Outfit'] text-lg flex items-center justify-center gap-2.5 shadow-xl shadow-amber-500/40 transition-all cursor-pointer"
                >
                  <Dices className="w-6 h-6 animate-bounce" />
                  <span>🎲 SHOOT THE CRAPS DICE! (ROLL)</span>
                </button>
              ) : (
                <div className="w-full h-14 rounded-2xl bg-slate-900/90 border-2 border-slate-700 flex items-center justify-center gap-2 text-cyan-300 font-mono text-sm font-bold shadow-md">
                  <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                  <span>{isBotPlaying ? 'CyberBot is shooting the dice...' : 'Waiting for opponent to shoot...'}</span>
                </div>
              )}
            </div>
          )}

          {/* Round Over Victory Celebration */}
          {gameState.phase === 'round_end' && gameState.roundWinnerUid && (
            <div className="w-full p-3.5 rounded-2xl bg-gradient-to-r from-amber-600 via-yellow-500 to-amber-600 border-2 border-amber-300 text-slate-950 flex flex-col items-center justify-center gap-1 shadow-2xl animate-fade-in text-center">
              <Trophy className="w-8 h-8 text-slate-950 animate-bounce" />
              <h3 className="text-xl font-black font-['Outfit']">
                {gameState.roundWinnerUid === playerUid
                  ? '🎉 JACKPOT! YOU WON THE ROUND!'
                  : `👑 ${room.players[gameState.roundWinnerUid]?.nickname || 'OPPONENT'} WINS!`}
              </h3>
              <p className="text-[11px] font-mono font-bold text-slate-900">
                All bets cleared! Next round begins in 2 seconds...
              </p>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <p className="text-[10px] text-slate-400 font-mono text-center">
        🎰 Vegas High Roller Craps • 3D acrylic dice tumble against the diamond rubber bumpers!
      </p>
    </div>
  );
};
