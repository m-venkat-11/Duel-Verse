import React, { useState, useEffect, useRef } from 'react';
import type { AuthoritativeRoomState } from '../../types/room';
import type { SlapDuelState } from '../../engine/slapDuelEngine';
import { GameLoop } from '../../engine/core/GameLoop';
import { CanvasManager } from '../../engine/core/CanvasManager';
import { JuiceEngine } from '../../engine/core/JuiceEngine';
import { soundService } from '../../services/sound';
import { Swords, Shield, Lock } from 'lucide-react';

interface SlapDuelViewProps {
  room: AuthoritativeRoomState<SlapDuelState>;
  playerUid: string;
  onDispatchAction: (type: string, payload: any) => void;
}

type HandPose = 'idle' | 'windup' | 'slap' | 'feint' | 'dodge' | 'hit';

interface HandAnimState {
  pose: HandPose;
  timer: number;
  offsetY: number;
  scale: number;
  rot: number;
}

export const SlapDuelView: React.FC<SlapDuelViewProps> = ({ room, playerUid, onDispatchAction }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameState = room.gameState;
  const players = Object.keys(room.players);
  const p1Uid = players[0] || 'p1';
  const p2Uid = players[1] || (p1Uid === 'bot_rival' ? 'player' : 'bot_rival');
  const isP1 = playerUid === p1Uid;
  const oppUid = isP1 ? p2Uid : p1Uid;
  const isHost = room.hostUid === playerUid;
  const isBotPlaying = Boolean(
    room.players['bot_rival'] || p2Uid === 'bot_rival' || p2Uid.startsWith('bot_') || players.length < 2
  );

  const p1Nickname = room.players[p1Uid]?.nickname || 'Player 1';
  const p2Nickname = room.players[p2Uid]?.nickname || 'CyberBot';

  const onDispatchActionRef = useRef(onDispatchAction);
  onDispatchActionRef.current = onDispatchAction;
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  const isAttacker = gameState.attackerUid === playerUid;
  const isAttackerRef = useRef(isAttacker);
  isAttackerRef.current = isAttacker;

  const [nowTs, setNowTs] = useState(() => Date.now());
  const [roundMessage, setRoundMessage] = useState<string | null>(null);
  const roundMsgRef = useRef<string | null>(null);
  const setStatusMsg = (msg: string | null, duration = 950) => {
    roundMsgRef.current = msg;
    setRoundMessage(msg);
    if (msg && duration > 0) {
      setTimeout(() => {
        if (roundMsgRef.current === msg) {
          roundMsgRef.current = null;
          setRoundMessage(null);
        }
      }, duration);
    }
  };

  // Live frozen ticker so UI unfreezes automatically when 2.4s expires
  const myFrozenUntil = gameState.frozenUntil?.[playerUid] || 0;
  const opFrozenUntil = gameState.frozenUntil?.[oppUid] || 0;
  const myFrozen = myFrozenUntil > nowTs;
  const opFrozen = opFrozenUntil > nowTs;

  useEffect(() => {
    if (myFrozenUntil <= Date.now() && opFrozenUntil <= Date.now()) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNowTs(t);
      if (t >= myFrozenUntil && t >= opFrozenUntil) clearInterval(id);
    }, 80);
    return () => clearInterval(id);
  }, [myFrozenUntil, opFrozenUntil]);

  // Separate animation & active-window refs (never share ref between attacker and defender!)
  const myHandRef = useRef<HandAnimState>({ pose: 'idle', timer: 0, offsetY: 0, scale: 1, rot: 0 });
  const opHandRef = useRef<HandAnimState>({ pose: 'idle', timer: 0, offsetY: 0, scale: 1, rot: 0 });
  const myDodgingWindowUntilRef = useRef<number>(0);
  const opDodgingWindowUntilRef = useRef<number>(0);
  const activeAttackBusyRef = useRef<boolean>(false);
  const juiceRef = useRef<JuiceEngine | null>(null);
  const flashAlphaRef = useRef<number>(0);
  const ringEffectRef = useRef<{ x: number; y: number; r: number; alpha: number; color: string } | null>(null);

  const showBannerEvent = (ev?: SlapDuelState['lastEvent']) => {
    if (!ev) return;
    if (ev.type === 'slap_hit') {
      flashAlphaRef.current = 0.65;
      juiceRef.current?.addTrauma(0.55);
      juiceRef.current?.emitExplosion(240, isAttackerRef.current ? 160 : 320, 32);
    }
  };

  // Sync remote 2P events if playing PvP across phones/tabs
  const lastEventTsRef = useRef<number>(0);
  useEffect(() => {
    const ev = gameState.lastEvent;
    if (!ev || ev.timestamp <= lastEventTsRef.current) return;
    lastEventTsRef.current = ev.timestamp;
    if (ev.actorUid !== playerUid) {
      if (ev.type === 'telegraph') {
        opHandRef.current = { pose: 'windup', timer: 0.34, offsetY: 0, scale: 1, rot: 0 };
        soundService.playClick();
      } else if (ev.type === 'feint') {
        opHandRef.current = { pose: 'feint', timer: 0.25, offsetY: 0, scale: 1, rot: 0 };
        soundService.playClick();
        ringEffectRef.current = { x: 240, y: 185, r: 12, alpha: 0.75, color: '#22d3ee' };
      } else if (ev.type === 'slap_hit') {
        opHandRef.current = { pose: 'slap', timer: 0.35, offsetY: 0, scale: 1, rot: 0 };
        myHandRef.current = { pose: 'hit', timer: 0.45, offsetY: 0, scale: 1, rot: 0 };
        setStatusMsg('💥 YOU GOT SLAPPED!', 900);
        soundService.playImpact(1.2);
        showBannerEvent(ev);
      } else if (ev.type === 'dodged') {
        opHandRef.current = { pose: 'dodge', timer: 0.42, offsetY: 0, scale: 1, rot: 0 };
        setStatusMsg('💨 RIVAL DODGED!', 900);
      } else if (ev.type === 'frozen') {
        setStatusMsg('❄️ RIVAL FROZEN!', 900);
      }
    }
  }, [gameState.lastEvent, playerUid]);

  // Trigger slap (Human Attacker)
  const handleAttackerSlap = () => {
    if (!isAttackerRef.current || activeAttackBusyRef.current) return;
    activeAttackBusyRef.current = true;

    if (!isBotPlaying) {
      // Broadcast wind-up telegraph to opponent's phone so defender can react in real time!
      myHandRef.current = { pose: 'windup', timer: 0.28, offsetY: 0, scale: 1, rot: 0 };
      onDispatchActionRef.current('SLAP_TELEGRAPH', { attackerUid: playerUid, actingUid: playerUid });
    } else {
      myHandRef.current = { pose: 'slap', timer: 0.38, offsetY: 0, scale: 1, rot: 0 };
      soundService.playImpact(1.2);
      const botFrozenNow = (gameStateRef.current.frozenUntil?.[p2Uid] || 0) > Date.now();
      if (!botFrozenNow && Math.random() < 0.58) {
        opDodgingWindowUntilRef.current = Date.now() + 420;
        opHandRef.current = { pose: 'dodge', timer: 0.42, offsetY: 0, scale: 1, rot: 0 };
      }
    }

    const resolveDelay = isBotPlaying ? 170 : 340;
    setTimeout(() => {
      if (!isBotPlaying) {
        myHandRef.current = { pose: 'slap', timer: 0.36, offsetY: 0, scale: 1, rot: 0 };
        soundService.playImpact(1.2);
      }
      activeAttackBusyRef.current = false;
      const gs = gameStateRef.current;
      const opFrozenNow = (gs.frozenUntil?.[oppUid] || 0) > Date.now();
      const dodged =
        !opFrozenNow &&
        (isBotPlaying ? opDodgingWindowUntilRef.current > Date.now() : (gs.defenderDodgeUntil || 0) > Date.now());

      if (dodged) {
        soundService.playFalseStart();
        setStatusMsg('💨 MISSED! ROLES SWAP!', 1000);
        ringEffectRef.current = { x: 240, y: 155, r: 15, alpha: 0.9, color: '#22d3ee' };
        onDispatchActionRef.current('SLAP_STRIKE', {
          attackerUid: playerUid,
          actingUid: playerUid,
          isDodging: true
        });
      } else {
        soundService.playGoal();
        if (navigator.vibrate) try { navigator.vibrate([40, 20, 60]); } catch {}
        flashAlphaRef.current = 0.7;
        opHandRef.current = { pose: 'hit', timer: 0.5, offsetY: 0, scale: 1, rot: 0 };
        ringEffectRef.current = { x: 240, y: 170, r: 20, alpha: 1.0, color: '#fbbf24' };
        juiceRef.current?.addTrauma(0.65);
        juiceRef.current?.emitExplosion(240, 165, 36);
        setStatusMsg('💥 CLEAN SLAP! +1 POINT!', 900);
        onDispatchActionRef.current('SLAP_STRIKE', {
          attackerUid: playerUid,
          actingUid: playerUid,
          isDodging: false
        });
      }
    }, 170);
  };

  // Trigger feint (Human Attacker)
  const handleFeint = () => {
    if (!isAttackerRef.current || activeAttackBusyRef.current) return;
    myHandRef.current = { pose: 'feint', timer: 0.25, offsetY: 0, scale: 1, rot: 0 };
    soundService.playClick();
    ringEffectRef.current = { x: 240, y: 290, r: 12, alpha: 0.75, color: '#f59e0b' };

    if (!isBotPlaying) {
      onDispatchActionRef.current('SLAP_FEINT', { attackerUid: playerUid, actingUid: playerUid });
      return;
    }

    // Bot might flinch on a feint!
    const botFrozenNow = (gameStateRef.current.frozenUntil?.[p2Uid] || 0) > Date.now();
    if (isBotPlaying && !botFrozenNow && Math.random() < 0.42) {
      opHandRef.current = { pose: 'dodge', timer: 0.38, offsetY: 0, scale: 1, rot: 0 };
      setTimeout(() => {
        soundService.playFalseStart();
        setStatusMsg('🎭 BOT FLINCHED! FALSE DODGE!', 900);
        onDispatchActionRef.current('SLAP_FALSE_DODGE', {
          defenderUid: p2Uid,
          actingUid: p2Uid
        });
      }, 100);
    }
  };

  // Trigger dodge (Human Defender)
  const handleDefenderDodge = () => {
    if (isAttackerRef.current) return;
    const myFrozenNow = (gameStateRef.current.frozenUntil?.[playerUid] || 0) > Date.now();
    if (myFrozenNow) {
      soundService.playFalseStart();
      setStatusMsg('🔒 STUNNED! CANNOT DODGE!', 800);
      return;
    }
    if (myHandRef.current.pose === 'dodge') return;

    myHandRef.current = { pose: 'dodge', timer: 0.38, offsetY: 0, scale: 1, rot: 0 };
    soundService.playMove();

    if (!isBotPlaying) {
      onDispatchActionRef.current('SLAP_DODGE', { defenderUid: playerUid, actingUid: playerUid });
      return;
    }

    if (activeAttackBusyRef.current) {
      // Timed right during attacker's swing!
      myDodgingWindowUntilRef.current = Date.now() + 360;
    } else {
      // Flinched too early!
      soundService.playFalseStart();
      setStatusMsg('⚠️ FALSE DODGE STRIKE!', 900);
      onDispatchActionRef.current('SLAP_FALSE_DODGE', {
        defenderUid: playerUid,
        actingUid: playerUid
      });
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (isAttackerRef.current) handleAttackerSlap();
        else handleDefenderDodge();
      } else if (e.key.toLowerCase() === 'f' && isAttackerRef.current) {
        handleFeint();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Rock-solid CyberBot Attacker AI (NEVER cancelled by player dodges/re-renders!)
  useEffect(() => {
    if (!isHost || !isBotPlaying) return;

    let cancelled = false;
    let actionTimeout: ReturnType<typeof setTimeout> | null = null;

    const scheduleBotTurn = () => {
      if (cancelled) return;
      const gs = gameStateRef.current;
      if (gs.attackerUid !== p2Uid || room.status !== 'playing') return;

      const waitMs = 950 + Math.random() * 1350;
      actionTimeout = setTimeout(() => {
        if (cancelled || gameStateRef.current.attackerUid !== p2Uid) return;

        // 35% chance to feint first, then strike
        if (Math.random() < 0.35) {
          opHandRef.current = { pose: 'feint', timer: 0.24, offsetY: 0, scale: 1, rot: 0 };
          soundService.playClick();
          ringEffectRef.current = { x: 240, y: 185, r: 12, alpha: 0.75, color: '#22d3ee' };

          actionTimeout = setTimeout(() => {
            if (!cancelled && gameStateRef.current.attackerUid === p2Uid) {
              executeBotSlap();
            }
          }, 420 + Math.random() * 480);
        } else {
          executeBotSlap();
        }
      }, waitMs);
    };

    const executeBotSlap = () => {
      if (cancelled) return;
      activeAttackBusyRef.current = true;
      opHandRef.current = { pose: 'slap', timer: 0.38, offsetY: 0, scale: 1, rot: 0 };
      soundService.playImpact(1.2);

      // Give human a fair 210ms reflex reaction window during windup/swing
      setTimeout(() => {
        activeAttackBusyRef.current = false;
        if (cancelled) return;
        const gs = gameStateRef.current;
        const humanFrozenNow = (gs.frozenUntil?.[playerUid] || 0) > Date.now();
        const dodged = myDodgingWindowUntilRef.current > Date.now() && !humanFrozenNow;

        if (dodged) {
          soundService.playFalseStart();
          ringEffectRef.current = { x: 240, y: 315, r: 15, alpha: 0.9, color: '#fbbf24' };
          setStatusMsg('💨 NICE DODGE! YOUR TURN TO SLAP!', 1000);
          onDispatchActionRef.current('SLAP_STRIKE', {
            attackerUid: p2Uid,
            actingUid: p2Uid,
            isDodging: true
          });
        } else {
          soundService.playGoal();
          if (navigator.vibrate) try { navigator.vibrate([50, 30, 80]); } catch {}
          flashAlphaRef.current = 0.7;
          myHandRef.current = { pose: 'hit', timer: 0.5, offsetY: 0, scale: 1, rot: 0 };
          ringEffectRef.current = { x: 240, y: 310, r: 20, alpha: 1.0, color: '#f43f5e' };
          juiceRef.current?.addTrauma(0.65);
          juiceRef.current?.emitExplosion(240, 315, 36);
          setStatusMsg('💥 BOT SLAPPED YOU!', 900);
          onDispatchActionRef.current('SLAP_STRIKE', {
            attackerUid: p2Uid,
            actingUid: p2Uid,
            isDodging: false
          });
          // Schedule next bot attack if still attacker and match continues
          setTimeout(() => {
            if (!cancelled && gameStateRef.current.attackerUid === p2Uid) {
              scheduleBotTurn();
            }
          }, 950);
        }
      }, 215);
    };

    if (gameState.attackerUid === p2Uid) {
      scheduleBotTurn();
    }

    return () => {
      cancelled = true;
      if (actionTimeout) clearTimeout(actionTimeout);
    };
  }, [isHost, isBotPlaying, gameState.attackerUid, p2Uid, playerUid, room.status]);

  // 60 FPS Articulated Cyber-Hand Duel Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasMgr = new CanvasManager(canvas);
    const juice = new JuiceEngine(300);
    juiceRef.current = juice;

    const W = 480;
    const H = 460;
    let timeAcc = 0;

    const stepHand = (h: HandAnimState, isBottom: boolean, dt: number) => {
      h.timer = Math.max(0, h.timer - dt);
      if (h.timer === 0 && h.pose !== 'idle') h.pose = 'idle';

      const dir = isBottom ? -1 : 1;
      let targetY = 0;
      let targetScale = 1.0;
      let targetRot = 0;

      if (h.pose === 'slap') {
        targetY = dir * 105;
        targetScale = 1.18;
        targetRot = dir * 0.14;
      } else if (h.pose === 'feint') {
        targetY = dir * 34;
        targetScale = 1.06;
        targetRot = dir * 0.08;
      } else if (h.pose === 'dodge') {
        targetY = -dir * 52;
        targetScale = 0.88;
        targetRot = -dir * 0.1;
      } else if (h.pose === 'hit') {
        targetY = -dir * 12;
        targetScale = 1.05;
        targetRot = Math.sin(timeAcc * 50) * 0.22;
      } else {
        targetY = Math.sin(timeAcc * 4 + (isBottom ? 0 : 1.5)) * 3;
      }

      const k = Math.min(1, 24 * dt);
      h.offsetY += (targetY - h.offsetY) * k;
      h.scale += (targetScale - h.scale) * k;
      h.rot += (targetRot - h.rot) * k;
    };

    const drawCyberHand = (
      ctx: CanvasRenderingContext2D,
      cx: number,
      cy: number,
      isBottom: boolean,
      anim: HandAnimState,
      primary: string,
      glow: string,
      isFrozen: boolean,
      frozenFrac: number,
      isAtk: boolean
    ) => {
      ctx.save();
      ctx.translate(cx, cy + anim.offsetY);
      if (!isBottom) ctx.scale(1, -1); // Top hand points down toward center
      ctx.rotate(anim.rot);
      ctx.scale(anim.scale, anim.scale);

      // Dynamic shadow beneath raised hand
      const heightShadow = anim.pose === 'slap' ? 14 : 6;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.ellipse(0, heightShadow, 46, 52, 0, 0, Math.PI * 2);
      ctx.fill();

      // Speed wind streaks during slap or dodge
      if (anim.pose === 'slap' || anim.pose === 'dodge') {
        ctx.strokeStyle = glow;
        ctx.lineWidth = 2.5;
        ctx.globalAlpha = 0.6;
        for (let sx = -32; sx <= 32; sx += 16) {
          ctx.beginPath();
          ctx.moveTo(sx, 20);
          ctx.lineTo(sx, 70);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // Wrist Cuff / Forearm
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = primary;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(-28, 32, 56, 36, 10);
      ctx.fill();
      ctx.stroke();

      // Palm Gauntlet Base
      const palmGrad = ctx.createLinearGradient(-35, -20, 35, 35);
      palmGrad.addColorStop(0, anim.pose === 'hit' ? '#ef4444' : primary);
      palmGrad.addColorStop(1, '#1e293b');
      ctx.fillStyle = palmGrad;
      ctx.shadowColor = anim.pose === 'hit' ? '#ef4444' : glow;
      ctx.shadowBlur = isAtk ? 18 : 10;
      ctx.beginPath();
      ctx.roundRect(-36, -24, 72, 62, 18);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 4 Fingers (Index, Middle, Ring, Pinky)
      const fingerSpecs = [
        { x: -25, w: 13, h: 42 },
        { x: -8, w: 14, h: 50 },
        { x: 9, w: 14, h: 46 },
        { x: 25, w: 12, h: 36 }
      ];
      for (const f of fingerSpecs) {
        ctx.fillStyle = anim.pose === 'hit' ? '#f87171' : glow;
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(f.x - f.w / 2, -22 - f.h, f.w, f.h + 6, f.w / 2);
        ctx.fill();
        ctx.stroke();
      }

      // Thumb
      ctx.save();
      ctx.translate(-34, 6);
      ctx.rotate(-0.55);
      ctx.fillStyle = anim.pose === 'hit' ? '#f87171' : glow;
      ctx.beginPath();
      ctx.roundRect(-7, -30, 14, 34, 7);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Glowing Cyber Core Emblem on Palm
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(0, 8, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = anim.pose === 'hit' ? '#ef4444' : glow;
      ctx.beginPath();
      ctx.arc(0, 8, 7, 0, Math.PI * 2);
      ctx.fill();

      // Frozen Lock Overlay
      if (isFrozen) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, -10, 56, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frozenFrac);
        ctx.stroke();

        ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
        ctx.beginPath();
        ctx.arc(0, -10, 52, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    };

    const update = (dt: number) => {
      const cdt = Math.min(0.04, dt);
      timeAcc += cdt;
      juice.update(cdt);

      stepHand(myHandRef.current, true, cdt);
      stepHand(opHandRef.current, false, cdt);

      flashAlphaRef.current = Math.max(0, flashAlphaRef.current - cdt * 2.5);
      if (ringEffectRef.current) {
        ringEffectRef.current.r += cdt * 220;
        ringEffectRef.current.alpha -= cdt * 2.5;
        if (ringEffectRef.current.alpha <= 0) ringEffectRef.current = null;
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

      // 1. Arcade Duel Table Surface
      const bg = ctx.createRadialGradient(W / 2, H / 2, 30, W / 2, H / 2, 320);
      bg.addColorStop(0, '#1e1b4b');
      bg.addColorStop(0.6, '#0f172a');
      bg.addColorStop(1, '#020617');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Neon Center Duel Circle & Strike Line
      ctx.strokeStyle = 'rgba(139, 92, 246, 0.35)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 110, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.setLineDash([8, 8]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(30, H / 2);
      ctx.lineTo(W - 30, H / 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Defender Target Spotlight Ring
      const gs = gameStateRef.current;
      const atkIsMe = gs.attackerUid === playerUid;
      const spotY = atkIsMe ? 135 : 325;
      const spotCol = atkIsMe ? 'rgba(6, 182, 212, 0.18)' : 'rgba(245, 158, 11, 0.18)';
      ctx.fillStyle = spotCol;
      ctx.beginPath();
      ctx.arc(W / 2, spotY, 72 + Math.sin(timeAcc * 6) * 4, 0, Math.PI * 2);
      ctx.fill();

      // Shockwave ring
      if (ringEffectRef.current) {
        const rg = ringEffectRef.current;
        ctx.save();
        ctx.strokeStyle = rg.color;
        ctx.globalAlpha = rg.alpha;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(rg.x, rg.y, rg.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Draw Hands (Opponent Top, Player Bottom)
      const now = Date.now();
      const opFreezeFrac = Math.max(0, ((gs.frozenUntil?.[oppUid] || 0) - now) / 2400);
      const myFreezeFrac = Math.max(0, ((gs.frozenUntil?.[playerUid] || 0) - now) / 2400);

      drawCyberHand(
        ctx,
        W / 2,
        135,
        false,
        opHandRef.current,
        '#0891b2',
        '#22d3ee',
        opFreezeFrac > 0,
        opFreezeFrac,
        !atkIsMe
      );

      drawCyberHand(
        ctx,
        W / 2,
        325,
        true,
        myHandRef.current,
        '#d97706',
        '#fbbf24',
        myFreezeFrac > 0,
        myFreezeFrac,
        atkIsMe
      );

      // Slap flash
      if (flashAlphaRef.current > 0) {
        ctx.fillStyle = `rgba(244, 63, 94, ${flashAlphaRef.current * 0.45})`;
        ctx.fillRect(0, 0, W, H);
      }

      // Role indicators directly on table
      ctx.font = '900 11px "Outfit", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#22d3ee';
      ctx.fillText(
        `${p2Nickname.slice(0, 12).toUpperCase()} • ${atkIsMe ? '🛡️ DEFENDING' : '⚔️ ATTACKING'}`,
        W / 2,
        24
      );
      ctx.fillStyle = '#fbbf24';
      ctx.fillText(
        `${isP1 ? p1Nickname : p2Nickname} (YOU) • ${atkIsMe ? '⚔️ ATTACKING' : '🛡️ DEFENDING'}`,
        W / 2,
        H - 14
      );

      juice.renderParticles(ctx, 1.0);
      ctx.restore();
    };

    const loop = new GameLoop({ update, render });
    loop.start();

    return () => loop.stop();
  }, [playerUid, oppUid, p1Nickname, p2Nickname, isP1]);

  const p1Score = room.scores[p1Uid] ?? gameState.scores?.[p1Uid] ?? 0;
  const p2Score = room.scores[p2Uid] ?? gameState.scores?.[p2Uid] ?? 0;
  const targetScore = room.maxRounds || gameState.targetScore || 3;
  const myStrikes = gameState.falseDodges?.[playerUid] || 0;

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col items-center select-none gap-2.5 px-2">
      {/* Top Score Header */}
      <div className="w-full flex items-center justify-between px-3.5 py-2 rounded-2xl bg-slate-900/90 border border-slate-700/60 text-xs font-black font-mono shadow-md">
        <div className="flex items-center gap-2">
          <span className="text-amber-400 font-bold truncate max-w-[75px]">{p1Nickname}</span>
          <div className="flex gap-1">
            {Array.from({ length: targetScore }).map((_, i) => (
              <div
                key={i}
                className={`w-3.5 h-3.5 rounded-full border transition-all ${
                  i < p1Score
                    ? 'bg-amber-400 border-amber-300 shadow-[0_0_8px_#f59e0b]'
                    : 'bg-slate-800 border-slate-700'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="px-3 py-1 rounded-full bg-violet-600/20 text-violet-300 border border-violet-500/40 text-[11px]">
          FIRST TO {targetScore} SLAPS
        </div>

        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {Array.from({ length: targetScore }).map((_, i) => (
              <div
                key={i}
                className={`w-3.5 h-3.5 rounded-full border transition-all ${
                  i < p2Score
                    ? 'bg-cyan-400 border-cyan-300 shadow-[0_0_8px_#06b6d4]'
                    : 'bg-slate-800 border-slate-700'
                }`}
              />
            ))}
          </div>
          <span className="text-cyan-400 font-bold truncate max-w-[75px]">{p2Nickname}</span>
        </div>
      </div>

      {/* Role + Strikes Banner */}
      <div className="w-full flex flex-col gap-1.5">
        <div
          className={`w-full py-2 px-4 rounded-2xl text-center font-black font-['Outfit'] text-sm border-2 shadow-lg flex items-center justify-center gap-2 ${
            isAttacker
              ? 'bg-amber-500/20 border-amber-400 text-amber-300'
              : 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
          }`}
        >
          {isAttacker ? (
            <>
              <Swords className="w-5 h-5" />
              <span>YOUR ATTACK — SLAP OR FEINT TO TRICK RIVAL!</span>
            </>
          ) : (
            <>
              <Shield className="w-5 h-5" />
              <span>YOU DEFEND — DODGE ONLY ON REAL SLAP!</span>
            </>
          )}
        </div>

        {!isAttacker && (
          <div className="w-full flex items-center justify-between px-3 py-1 rounded-xl bg-slate-900/80 border border-slate-800 text-[11px] font-mono">
            <span className="text-slate-400">FALSE DODGE STRIKES (3 = STUN):</span>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3].map((s) => (
                <span
                  key={s}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    s <= myStrikes ? 'bg-rose-500 text-white shadow-[0_0_8px_#f43f5e]' : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  X{s}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 60 FPS Red-Hands Duel Canvas */}
      <div className="w-full aspect-[480/420] max-h-[380px] rounded-3xl overflow-hidden shadow-2xl border-2 border-violet-500/40 relative bg-[#020617]">
        <canvas ref={canvasRef} className="w-full h-full block" />
        {roundMessage && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 px-4 py-2 rounded-2xl bg-slate-950/95 border-2 border-amber-400/70 text-white font-mono font-black text-xs sm:text-sm text-center shadow-2xl pointer-events-none whitespace-nowrap">
            {roundMessage}
          </div>
        )}
      </div>

      {/* Action Triggers */}
      <div className="w-full max-w-md pt-0.5">
        {isAttacker ? (
          <div className="grid grid-cols-3 gap-2.5">
            <button
              onPointerDown={handleFeint}
              className="h-15 rounded-2xl bg-slate-900 border-2 border-amber-500/50 hover:border-amber-400 text-amber-300 font-black font-['Outfit'] active:scale-95 shadow-md flex items-center justify-center gap-1 text-sm cursor-pointer"
            >
              <span>🎭 FEINT</span>
            </button>
            <button
              onPointerDown={handleAttackerSlap}
              className="col-span-2 h-15 rounded-2xl bg-gradient-to-r from-amber-500 to-rose-500 border-2 border-amber-300 text-slate-950 font-black font-['Outfit'] text-xl active:scale-95 shadow-2xl shadow-amber-500/30 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Swords className="w-6 h-6 fill-current" />
              <span>SLAP NOW!</span>
            </button>
          </div>
        ) : (
          <button
            onPointerDown={handleDefenderDodge}
            disabled={myFrozen}
            className={`w-full h-15 rounded-2xl border-2 font-black font-['Outfit'] text-xl active:scale-95 shadow-2xl flex items-center justify-center gap-2 transition cursor-pointer ${
              myFrozen
                ? 'bg-slate-800 border-rose-500/50 text-rose-300 cursor-not-allowed opacity-80'
                : 'bg-gradient-to-r from-cyan-500 to-blue-600 border-cyan-300 text-slate-950 shadow-cyan-500/30'
            }`}
          >
            {myFrozen ? (
              <>
                <Lock className="w-5 h-5 animate-pulse" />
                <span>FROZEN! ({Math.max(0, ((myFrozenUntil - nowTs) / 1000)).toFixed(1)}s)</span>
              </>
            ) : (
              <>
                <Shield className="w-6 h-6 fill-current" />
                <span>DODGE / PULL BACK!</span>
              </>
            )}
          </button>
        )}
      </div>

      <p className="text-[11px] text-slate-400 font-mono text-center">
        ⌨️ Desktop: Spacebar to Slap/Dodge • 'F' to Feint
      </p>
    </div>
  );
};
