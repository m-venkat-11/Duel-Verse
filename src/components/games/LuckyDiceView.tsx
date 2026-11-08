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

// -------------------------------------------------------------
// PHYSICAL 3D CASINO DIE OBJECT
// -------------------------------------------------------------
interface PhysicalCasinoDie {
  id: number;
  x: number;
  y: number;
  z: number; // Vertical height above green felt table (0 = resting on felt)

  // Designated landing pedestal coordinates
  homeX: number;
  homeY: number;

  // Cinematic toss trajectory & timing
  isSettled: boolean;
  tossTime: number; // 0.0 to 1.0
  tossDuration: number;
  startX: number;
  startY: number;
  wallX: number;
  wallY: number;

  // 3D Euler rotation angles
  rotX: number;
  rotY: number;
  rotZ: number;

  // Angular tumbling velocities during flight
  vrotX: number;
  vrotY: number;
  vrotZ: number;

  size: number;
  colorType: 'ruby' | 'sapphire' | 'amber' | 'emerald' | 'amethyst';
  targetValue: number;

  // Event triggers during flight
  wallHitTriggered: boolean;
  bounce1Triggered: boolean;
  bounce2Triggered: boolean;
}

// -------------------------------------------------------------
// STANDARD 3D ISOMETRIC PROJECTION & ROTATION LINEAR ALGEBRA
// -------------------------------------------------------------
const CAM_PITCH = Math.asin(Math.tan(Math.PI / 6)); // ~35.264° true isometric elevation
const COS45 = Math.SQRT1_2;
const SIN45 = Math.SQRT1_2;
const SIN_PITCH = Math.sin(CAM_PITCH);
const COS_PITCH = Math.cos(CAM_PITCH);

function projectIso(x: number, y: number, z: number): { sx: number; sy: number; sz: number } {
  const sx = (x - y) * COS45;
  const sy = (x + y) * SIN45 * SIN_PITCH - z * COS_PITCH;
  const sz = (x + y) * SIN45 * COS_PITCH + z * SIN_PITCH;
  return { sx, sy, sz };
}

type Mat3 = [
  number, number, number,
  number, number, number,
  number, number, number
];

function mat3FromEuler(rx: number, ry: number, rz: number): Mat3 {
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  return [
    cy * cz, -cy * sz, sy,
    sx * sy * cz + cx * sz, -sx * sy * sz + cx * cz, -sx * cy,
    -cx * sy * cz + sx * sz, cx * sy * sz + sx * cz, cx * cy
  ];
}

function mat3Transform(m: Mat3, x: number, y: number, z: number): [number, number, number] {
  return [
    m[0] * x + m[1] * y + m[2] * z,
    m[3] * x + m[4] * y + m[5] * z,
    m[6] * x + m[7] * y + m[8] * z
  ];
}

// Local Euler rotations guaranteed to place face value `N` squarely on top facing camera!
const FACE_ALIGNMENTS: Record<number, [number, number, number]> = {
  1: [0, 0, 0],
  6: [Math.PI, 0, 0],
  2: [Math.PI / 2, 0, 0],
  5: [-Math.PI / 2, 0, 0],
  3: [0, -Math.PI / 2, 0],
  4: [0, Math.PI / 2, 0]
};

function adjustBrightness(hex: string, factor: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, Math.round(((num >> 16) & 0xff) * factor)));
  const g = Math.min(255, Math.max(0, Math.round(((num >> 8) & 0xff) * factor)));
  const b = Math.min(255, Math.max(0, Math.round((num & 0xff) * factor)));
  return `rgb(${r}, ${g}, ${b})`;
}

function getPipCoords(val: number): Array<[number, number]> {
  if (val === 1) return [[0, 0]];
  if (val === 2) return [[-0.5, -0.5], [0.5, 0.5]];
  if (val === 3) return [[-0.5, -0.5], [0, 0], [0.5, 0.5]];
  if (val === 4) return [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]];
  if (val === 5) return [[-0.5, -0.5], [0.5, -0.5], [0, 0], [-0.5, 0.5], [0.5, 0.5]];
  return [
    [-0.5, -0.55], [0.5, -0.55],
    [-0.5, 0],     [0.5, 0],
    [-0.5, 0.55],  [0.5, 0.55]
  ];
}

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
  const TABLE_LEFT = 36;
  const TABLE_RIGHT = 424;
  const TABLE_TOP = 38;
  const TABLE_BOTTOM = 342;

  // Calculate clean, symmetrical landing pedestals aligned horizontally with the player's prediction chips
  const getHomePositions = (count: number): Array<{ x: number; y: number }> => {
    if (count === 1) return [{ x: 230, y: 195 }];
    if (count === 2) return [{ x: 165, y: 195 }, { x: 295, y: 195 }];
    if (count === 3) {
      // Symmetrical 3-slot Craps row: Slot 1 (Left), Slot 2 (Center), Slot 3 (Right)
      return [
        { x: 120, y: 195 },
        { x: 230, y: 195 },
        { x: 340, y: 195 }
      ];
    }
    if (count === 4) {
      return [
        { x: 95, y: 195 },
        { x: 185, y: 195 },
        { x: 275, y: 195 },
        { x: 365, y: 195 }
      ];
    }
    // 5 dice
    return [
      { x: 75, y: 195 },
      { x: 152, y: 195 },
      { x: 230, y: 195 },
      { x: 308, y: 195 },
      { x: 385, y: 195 }
    ];
  };

  // Initialize 3D Casino Dice (Seated squarely in designated pedestals)
  const initDice = (count: number, values: number[]) => {
    const colors: Array<'ruby' | 'sapphire' | 'amber' | 'emerald' | 'amethyst'> = [
      'ruby',
      'sapphire',
      'amber',
      'emerald',
      'amethyst'
    ];
    const homes = getHomePositions(count);
    const newList: PhysicalCasinoDie[] = [];

    for (let i = 0; i < count; i++) {
      const val = values[i] || Math.floor(Math.random() * 6) + 1;
      const angles = FACE_ALIGNMENTS[val] || [0, 0, 0];
      const home = homes[i] || { x: 230, y: 195 };

      newList.push({
        id: i,
        x: home.x,
        y: home.y,
        z: 0,
        homeX: home.x,
        homeY: home.y,
        isSettled: true,
        tossTime: 1.0,
        tossDuration: 1.0,
        startX: home.x,
        startY: TABLE_BOTTOM - 15,
        wallX: home.x,
        wallY: TABLE_TOP + 12,
        rotX: angles[0],
        rotY: angles[1],
        rotZ: angles[2],
        vrotX: 0,
        vrotY: 0,
        vrotZ: 0,
        size: count <= 3 ? 54 : 46,
        colorType: colors[i % colors.length],
        targetValue: val,
        wallHitTriggered: true,
        bounce1Triggered: true,
        bounce2Triggered: true
      });
    }
    diceRef.current = newList;
  };

  useEffect(() => {
    if (gameState?.currentRoll) {
      initDice(diceCount, gameState.currentRoll);
    }
  }, [diceCount]);

  // Launch explosive, cinematic 3D Craps Toss: Launches from player toward back wall, rebounds with sparks, and settles squarely into home pedestals!
  const trigger3DCrapsToss = (targetRoll: number[]) => {
    isRollingRef.current = true;
    soundService.playCountdown(1);

    const homes = getHomePositions(diceCount);

    diceRef.current.forEach((die, idx) => {
      die.targetValue = targetRoll[idx] || Math.floor(Math.random() * 6) + 1;
      die.isSettled = false;
      die.homeX = homes[idx]?.x || die.x;
      die.homeY = homes[idx]?.y || die.y;

      // Staggered duration creates thrilling sequential landing
      die.tossDuration = 1.05 + idx * 0.14;
      die.tossTime = 0.0;

      // Start toss spread across the bottom of table (shooter's hands)
      die.startX = W / 2 + (idx - (diceCount - 1) / 2) * 50;
      die.startY = TABLE_BOTTOM - 15;
      die.x = die.startX;
      die.y = die.startY;
      die.z = 0;

      // Wall hit coordinates along back rubber pyramid bumper
      const wallSpread = (TABLE_RIGHT - TABLE_LEFT - 80) / (diceCount + 1);
      die.wallX = TABLE_LEFT + 40 + wallSpread * (idx + 1) + (Math.random() - 0.5) * 16;
      die.wallY = TABLE_TOP + 12;

      // Wild 3D angular tumbling in the air
      die.vrotX = (Math.random() > 0.5 ? 1 : -1) * (18 + Math.random() * 10);
      die.vrotY = (Math.random() > 0.5 ? 1 : -1) * (18 + Math.random() * 10);
      die.vrotZ = (Math.random() > 0.5 ? 1 : -1) * (18 + Math.random() * 10);

      die.wallHitTriggered = false;
      die.bounce1Triggered = false;
      die.bounce2Triggered = false;
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
      }, 900);
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
          die.tossTime += clampedDt / die.tossDuration;

          const t = die.tossTime;

          if (t < 0.42) {
            // PHASE 1: Launch upward from player toward back rubber wall
            const p = t / 0.42;
            const cx = (die.startX + die.wallX) / 2 + Math.sin(p * Math.PI) * 14;
            const cy = Math.min(die.startY, die.wallY) - 26;

            die.x = (1 - p) * (1 - p) * die.startX + 2 * (1 - p) * p * cx + p * p * die.wallX;
            die.y = (1 - p) * (1 - p) * die.startY + 2 * (1 - p) * p * cy + p * p * die.wallY;
            die.z = Math.sin(p * Math.PI) * 125;

            // Fast 3D spin
            die.rotX += die.vrotX * clampedDt;
            die.rotY += die.vrotY * clampedDt;
            die.rotZ += die.vrotZ * clampedDt;

            // Golden flight spark trail
            if (Math.random() < 0.4) {
              juice.emitSparks(die.x, die.y - die.z * 0.45, 2, '#fbbf24', '#ffffff', 1.8);
            }
          } else {
            // BACK WALL RUBBER PYRAMID BUMPER IMPACT!
            if (!die.wallHitTriggered) {
              die.wallHitTriggered = true;
              soundService.playImpact(0.85);
              juice.addTrauma(0.12);
              juice.emitSparks(die.wallX, die.wallY, 12, '#ef4444', '#fbbf24', 2.8);
              die.vrotY *= -0.7; // Rebound reverse spin
            }

            if (t < 1.0) {
              // PHASE 2: Rebound off wall and roll into designated home pedestal!
              const p = (t - 0.42) / 0.58; // 0.0 to 1.0
              const ease = 1 - Math.pow(1 - p, 2.6); // Smooth cubic ease-out to pedestal

              die.x = die.wallX + (die.homeX - die.wallX) * ease;
              die.y = die.wallY + (die.homeY - die.wallY) * ease;

              // Felt bounces (2 diminishing half-sine bounces)
              const bouncePhase = p * Math.PI * 3;
              const bounceDecay = Math.max(0, 1 - p);
              die.z = Math.max(0, Math.sin(bouncePhase) * 42 * bounceDecay * bounceDecay);

              // Sound & sparks on felt bounces
              if (p >= 0.33 && !die.bounce1Triggered) {
                die.bounce1Triggered = true;
                soundService.playImpact(0.65);
                juice.emitSparks(die.x, die.y, 5, '#f59e0b', '#ffffff', 1.6);
              }
              if (p >= 0.66 && !die.bounce2Triggered) {
                die.bounce2Triggered = true;
                soundService.playImpact(0.5);
                juice.emitSparks(die.x, die.y, 4, '#f59e0b', '#ffffff', 1.3);
              }

              // Smoothly orient to target face as it settles into pedestal
              const targetEuler = FACE_ALIGNMENTS[die.targetValue] || [0, 0, 0];
              if (p > 0.45) {
                die.rotX += (targetEuler[0] - die.rotX) * Math.min(1, 14 * clampedDt);
                die.rotY += (targetEuler[1] - die.rotY) * Math.min(1, 14 * clampedDt);
                die.rotZ += (targetEuler[2] - die.rotZ) * Math.min(1, 14 * clampedDt);
              } else {
                die.rotX += die.vrotX * clampedDt * (1 - p);
                die.rotY += die.vrotY * clampedDt * (1 - p);
                die.rotZ += die.vrotZ * clampedDt * (1 - p);
              }
            } else {
              // PHASE 3: PERFECT PEDESTAL LANDING!
              die.isSettled = true;
              die.x = die.homeX;
              die.y = die.homeY;
              die.z = 0;
              const targetEuler = FACE_ALIGNMENTS[die.targetValue] || [0, 0, 0];
              die.rotX = targetEuler[0];
              die.rotY = targetEuler[1];
              die.rotZ = targetEuler[2];

              soundService.playScore();
              juice.addTrauma(0.14);
              juice.emitExplosion(die.homeX, die.homeY, 14);
            }
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
      const feltGrad = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, 270);
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

      // Real Craps Diamond Rubber Pyramid Bumpers on Back Wall
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

      ctx.fillStyle = 'rgba(245, 158, 11, 0.22)';
      ctx.font = '900 12px "Outfit", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('★ DUELVERSE HIGH ROLLER CRAPS ★', W / 2, TABLE_TOP + 36);

      // Dedicated Symmetrical Felt Landing Pedestals (Golden Rings on Table)
      const homes = getHomePositions(diceCount);
      const myTargets = gameState?.guesses?.[playerUid] || [];
      const oppTargets = gameState?.guesses?.[p2Uid] || [];

      homes.forEach((home, idx) => {
        ctx.save();
        const die = diceRef.current[idx];
        const isMatchedPlayer = die?.isSettled && myTargets[idx] === die.targetValue;
        const isMatchedBot = die?.isSettled && oppTargets[idx] === die.targetValue;

        // Glow ring if matched
        if (isMatchedPlayer) {
          ctx.strokeStyle = 'rgba(16, 185, 129, 0.6)';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(home.x, home.y + 12, 36, 0, Math.PI * 2);
          ctx.stroke();
        } else if (isMatchedBot) {
          ctx.strokeStyle = 'rgba(6, 182, 212, 0.6)';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(home.x, home.y + 12, 36, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.25)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.arc(home.x, home.y + 12, 34, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        ctx.fillStyle = isMatchedPlayer
          ? '#10b981'
          : isMatchedBot
          ? '#06b6d4'
          : 'rgba(245, 158, 11, 0.25)';
        ctx.font = '800 10px "Outfit", sans-serif';
        ctx.fillText(
          isMatchedPlayer ? '★ MATCH! ★' : isMatchedBot ? 'BOT MATCH' : `SLOT #${idx + 1}`,
          home.x,
          home.y + 38
        );
        ctx.restore();
      });

      // 2. Render TRUE 3D Isometric Acrylic Casino Dice
      // Sort dice by screen depth (Y) so foreground dice render cleanly in front of background dice
      const sortedDice = [...diceRef.current].sort((a, b) => a.y - b.y);

      sortedDice.forEach((die) => {
        const s = die.size / 2;
        const zAlt = Math.max(0, die.z);

        // A. Dynamic Ground Shadow on Felt
        ctx.save();
        const shadowScale = Math.max(0.35, 1 - zAlt / 280);
        const shadowAlpha = Math.max(0.12, 0.62 * shadowScale);
        ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
        ctx.beginPath();
        ctx.ellipse(
          die.x,
          die.y + 14 + zAlt * 0.05,
          die.size * 0.72 * shadowScale,
          die.size * 0.36 * shadowScale,
          0,
          0,
          Math.PI * 2
        );
        ctx.fill();
        ctx.restore();

        // B. 3D Isometric Faces
        const mat = mat3FromEuler(die.rotX, die.rotY, die.rotZ);

        // 6 Cube Faces (Local 3D vertices, normals, and pip axes)
        const cubeFaces = [
          {
            val: 1,
            norm: [0, 0, 1],
            u: [1, 0, 0],
            v: [0, 1, 0],
            verts: [[-s, -s, s], [s, -s, s], [s, s, s], [-s, s, s]]
          },
          {
            val: 6,
            norm: [0, 0, -1],
            u: [-1, 0, 0],
            v: [0, 1, 0],
            verts: [[s, -s, -s], [-s, -s, -s], [-s, s, -s], [s, s, -s]]
          },
          {
            val: 2,
            norm: [0, 1, 0],
            u: [1, 0, 0],
            v: [0, 0, -1],
            verts: [[-s, s, s], [s, s, s], [s, s, -s], [-s, s, -s]]
          },
          {
            val: 5,
            norm: [0, -1, 0],
            u: [-1, 0, 0],
            v: [0, 0, -1],
            verts: [[s, -s, s], [-s, -s, s], [-s, -s, -s], [s, -s, -s]]
          },
          {
            val: 3,
            norm: [1, 0, 0],
            u: [0, 1, 0],
            v: [0, 0, -1],
            verts: [[s, -s, s], [s, s, s], [s, s, -s], [s, -s, -s]]
          },
          {
            val: 4,
            norm: [-1, 0, 0],
            u: [0, -1, 0],
            v: [0, 0, -1],
            verts: [[-s, s, s], [-s, -s, s], [-s, -s, -s], [-s, s, -s]]
          }
        ];

        // Transform faces and filter visible (camera facing)
        const visibleFaces = cubeFaces
          .map((f) => {
            const wn = mat3Transform(mat, f.norm[0], f.norm[1], f.norm[2]);
            const cn = projectIso(wn[0], wn[1], wn[2]);

            // Transform 4 vertices
            const screenVerts = f.verts.map((v) => {
              const rotV = mat3Transform(mat, v[0], v[1], v[2]);
              const projV = projectIso(rotV[0], rotV[1], rotV[2]);
              return {
                x: die.x + projV.sx,
                y: die.y - zAlt + projV.sy,
                z: projV.sz
              };
            });

            const avgZ = (screenVerts[0].z + screenVerts[1].z + screenVerts[2].z + screenVerts[3].z) / 4;

            return {
              ...f,
              worldNorm: wn,
              camNorm: cn,
              screenVerts,
              avgZ,
              isVisible: cn.sz > 0.05
            };
          })
          .filter((f) => f.isVisible)
          .sort((a, b) => a.avgZ - b.avgZ);

        // Render each visible 3D acrylic face with authentic casino lighting
        visibleFaces.forEach((f) => {
          const v = f.screenVerts;

          // Directional lighting from top-left chandelier
          const lightDir = [-0.25, -0.45, 0.85];
          const dot = f.worldNorm[0] * lightDir[0] + f.worldNorm[1] * lightDir[1] + f.worldNorm[2] * lightDir[2];
          const shade = Math.max(0.48, Math.min(1.0, 0.74 + dot * 0.38));

          // Base acrylic gemstone color
          let baseHex = '#e11d48'; // High Roller Ruby
          if (die.colorType === 'sapphire') baseHex = '#2563eb';
          else if (die.colorType === 'amber') baseHex = '#d97706';
          else if (die.colorType === 'emerald') baseHex = '#059669';
          else if (die.colorType === 'amethyst') baseHex = '#9333ea';

          ctx.save();
          ctx.beginPath();
          ctx.moveTo(v[0].x, v[0].y);
          ctx.lineTo(v[1].x, v[1].y);
          ctx.lineTo(v[2].x, v[2].y);
          ctx.lineTo(v[3].x, v[3].y);
          ctx.closePath();

          // Acrylic gradient
          const faceGrad = ctx.createLinearGradient(v[0].x, v[0].y, v[2].x, v[2].y);
          faceGrad.addColorStop(0, adjustBrightness(baseHex, shade * 1.18));
          faceGrad.addColorStop(1, adjustBrightness(baseHex, shade * 0.85));
          ctx.fillStyle = faceGrad;
          ctx.fill();

          // Bevelled specular silver rim
          ctx.strokeStyle = `rgba(255, 255, 255, ${0.48 * shade})`;
          ctx.lineWidth = 1.8;
          ctx.lineJoin = 'round';
          ctx.stroke();

          // Specular Glare on top-facing surfaces
          if (f.worldNorm[2] > 0.5) {
            const glareGrad = ctx.createLinearGradient(v[0].x, v[0].y, v[1].x, v[3].y);
            glareGrad.addColorStop(0, 'rgba(255, 255, 255, 0.28)');
            glareGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.08)');
            glareGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = glareGrad;
            ctx.fill();
          }
          ctx.restore();

          // Inset Porcelain White & Gold Casino Pips
          const pips = getPipCoords(f.val);
          pips.forEach(([pu, pv]) => {
            const px = f.u[0] * (pu * s * 0.55) + f.v[0] * (pv * s * 0.55) + f.norm[0] * s * 1.02;
            const py = f.u[1] * (pu * s * 0.55) + f.v[1] * (pv * s * 0.55) + f.norm[1] * s * 1.02;
            const pz = f.u[2] * (pu * s * 0.55) + f.v[2] * (pv * s * 0.55) + f.norm[2] * s * 1.02;

            const rotP = mat3Transform(mat, px, py, pz);
            const projP = projectIso(rotP[0], rotP[1], rotP[2]);

            const pipX = die.x + projP.sx;
            const pipY = die.y - zAlt + projP.sy;
            const pipR = Math.max(2.4, (s / 7.2) * shade);

            ctx.save();
            // Dark inset shadow ring
            ctx.beginPath();
            ctx.arc(pipX, pipY, pipR + 0.6, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
            ctx.fill();

            // Pip body
            ctx.beginPath();
            ctx.arc(pipX, pipY, pipR, 0, Math.PI * 2);
            if (f.val === 1 && die.colorType === 'ruby') {
              ctx.fillStyle = '#fbbf24'; // Vegas Golden Ace pip!
            } else {
              ctx.fillStyle = '#ffffff';
            }
            ctx.fill();

            // Specular pip highlight
            ctx.beginPath();
            ctx.arc(pipX - pipR * 0.3, pipY - pipR * 0.3, pipR * 0.35, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
            ctx.fill();
            ctx.restore();
          });
        });

        // Die ID Badge label under settled die
        if (die.isSettled) {
          ctx.fillStyle = '#fbbf24';
          ctx.font = '900 11px "Outfit", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`DIE #${die.id + 1}`, die.x, die.y + 26);
        }
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
          <span className="text-[9px] font-mono text-slate-400">Tap chip to cycle (1–6)</span>
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
