/**
 * JuiceEngine.ts
 * Game feel ("juice") management:
 * - Trauma-based decaying screen shake (trauma^2 power falloff)
 * - Hit-stop / impact freeze frame (40-80ms pause on critical hits/goals)
 * - Zero-allocation pooled particle emissions (sparks, dust, shockwaves, glow trails)
 */

import { ObjectPool, type Particle, createParticleFactory, resetParticle } from './ObjectPool';

export class JuiceEngine {
  // Screen shake variables
  private trauma: number = 0; // 0 to 1
  public offsetX: number = 0;
  public offsetY: number = 0;
  public angle: number = 0;
  private readonly maxOffset: number = 18; // Max pixels of shake
  private readonly maxAngle: number = 0.05; // Max radians of rotation
  private readonly traumaDecay: number = 1.8; // Per second decay rate

  // Hit-stop variables
  private hitStopRemainingMs: number = 0;

  // Particle System Pool
  private particlePool: ObjectPool<Particle>;

  // Web Audio Procedural Synthesizer
  private audioCtx: AudioContext | null = null;

  constructor(maxParticles: number = 250) {
    this.particlePool = new ObjectPool<Particle>(createParticleFactory(), resetParticle, maxParticles);
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.audioCtx = new AudioCtx();
      }
    } catch {
      this.audioCtx = null;
    }
  }

  /**
   * Add camera trauma (clamped 0 to 1).
   * Shaking intensity is non-linear (trauma * trauma).
   */
  public addTrauma(amount: number): void {
    this.trauma = Math.min(1.0, this.trauma + amount);
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(Math.floor(amount * 45));
      } catch {}
    }
  }

  /**
   * Play procedural sound effect with 0 network asset lag
   */
  public playSound(type: 'shoot' | 'thud' | 'spark' | 'clack' | 'goal' | 'click' | 'ricochet'): void {
    if (!this.audioCtx) return;
    try {
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      switch (type) {
        case 'shoot':
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(420, now);
          osc.frequency.exponentialRampToValueAtTime(110, now + 0.12);
          gain.gain.setValueAtTime(0.35, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
          osc.start(now);
          osc.stop(now + 0.12);
          break;
        case 'thud':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(160, now);
          osc.frequency.exponentialRampToValueAtTime(35, now + 0.18);
          gain.gain.setValueAtTime(0.5, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
          osc.start(now);
          osc.stop(now + 0.18);
          break;
        case 'spark':
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(900 + Math.random() * 300, now);
          osc.frequency.linearRampToValueAtTime(1400, now + 0.05);
          gain.gain.setValueAtTime(0.2, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
          osc.start(now);
          osc.stop(now + 0.05);
          break;
        case 'clack':
          osc.type = 'square';
          osc.frequency.setValueAtTime(580, now);
          osc.frequency.exponentialRampToValueAtTime(180, now + 0.04);
          gain.gain.setValueAtTime(0.25, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.04);
          osc.start(now);
          osc.stop(now + 0.04);
          break;
        case 'ricochet':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(1200 + Math.random() * 400, now);
          osc.frequency.exponentialRampToValueAtTime(400, now + 0.08);
          gain.gain.setValueAtTime(0.22, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
          osc.start(now);
          osc.stop(now + 0.08);
          break;
        case 'goal':
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(220, now);
          osc.frequency.linearRampToValueAtTime(880, now + 0.35);
          gain.gain.setValueAtTime(0.4, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
          osc.start(now);
          osc.stop(now + 0.35);
          break;
        case 'click':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(800, now);
          gain.gain.setValueAtTime(0.15, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.03);
          osc.start(now);
          osc.stop(now + 0.03);
          break;
      }
    } catch {}
  }

  /**
   * Trigger a micro hit-stop freeze (e.g. 50ms on heavy puck smash or goal)
   */
  public triggerHitStop(durationMs: number = 50): void {
    this.hitStopRemainingMs = durationMs;
  }

  public isHitStopped(): boolean {
    return this.hitStopRemainingMs > 0;
  }

  /**
   * Update screen shake and active particles on fixed timestep
   */
  public update(dt: number): void {
    // 1. Process hit-stop
    if (this.hitStopRemainingMs > 0) {
      this.hitStopRemainingMs = Math.max(0, this.hitStopRemainingMs - dt * 1000);
      return; // Freeze visual simulation during hit-stop
    }

    // 2. Decay trauma & compute non-linear camera displacement
    if (this.trauma > 0) {
      const shakePower = this.trauma * this.trauma;
      this.offsetX = (Math.random() * 2 - 1) * this.maxOffset * shakePower;
      this.offsetY = (Math.random() * 2 - 1) * this.maxOffset * shakePower;
      this.angle = (Math.random() * 2 - 1) * this.maxAngle * shakePower;
      this.trauma = Math.max(0, this.trauma - this.traumaDecay * dt);
    } else {
      this.offsetX = 0;
      this.offsetY = 0;
      this.angle = 0;
    }

    // 3. Update pooled particles
    const particles = this.particlePool.getActiveItems();
    const count = this.particlePool.getActiveCount();

    for (let i = count - 1; i >= 0; i--) {
      const p = particles[i];
      p.prevX = p.x;
      p.prevY = p.y;
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;
      p.vx *= p.friction;
      p.vy *= p.friction;
      p.vy += p.gravity * dt * 60;
      p.alpha = Math.max(0, p.alpha - p.decay);

      p.life += dt;
      if (p.alpha <= 0 || p.life >= p.maxLife) {
        this.particlePool.releaseAt(i);
      }
    }
  }

  /**
   * Render all active particles to canvas context with alpha interpolation
   */
  public renderParticles(ctx: CanvasRenderingContext2D, alpha: number): void {
    const particles = this.particlePool.getActiveItems();
    const count = this.particlePool.getActiveCount();
    if (count === 0) return;

    ctx.save();
    for (let i = 0; i < count; i++) {
      const p = particles[i];
      // Interpolate position between prev and current
      const renderX = p.prevX + (p.x - p.prevX) * alpha;
      const renderY = p.prevY + (p.y - p.prevY) * alpha;

      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.glowColor;
      ctx.shadowBlur = p.size * 2;

      ctx.beginPath();
      ctx.arc(renderX, renderY, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Spawn a burst of directional or omni-directional sparks
   */
  public emitSparks(
    x: number,
    y: number,
    count: number,
    baseColor: string = '#06b6d4',
    glowColor: string = '#22d3ee',
    spreadSpeed: number = 4
  ): void {
    for (let i = 0; i < count; i++) {
      const p = this.particlePool.acquire();
      p.active = true;
      p.x = x;
      p.y = y;
      p.prevX = x;
      p.prevY = y;

      const angle = Math.random() * Math.PI * 2;
      const speed = (0.5 + Math.random() * 1.5) * spreadSpeed;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;

      p.size = 1.5 + Math.random() * 2.5;
      p.color = baseColor;
      p.glowColor = glowColor;
      p.alpha = 1.0;
      p.decay = 0.03 + Math.random() * 0.03;
      p.maxLife = 0.8;
      p.gravity = 0.05;
      p.friction = 0.94;
    }
  }

  /**
   * Spawn a celebratory fireworks explosion (e.g. for goals / connect four win)
   */
  public emitExplosion(x: number, y: number, count: number = 45): void {
    const colors = ['#f59e0b', '#06b6d4', '#8b5cf6', '#10b981', '#fb7185', '#ffffff'];
    for (let i = 0; i < count; i++) {
      const p = this.particlePool.acquire();
      p.active = true;
      p.x = x;
      p.y = y;
      p.prevX = x;
      p.prevY = y;

      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 6;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;

      const col = colors[Math.floor(Math.random() * colors.length)];
      p.size = 2 + Math.random() * 3;
      p.color = col;
      p.glowColor = col;
      p.alpha = 1.0;
      p.decay = 0.015 + Math.random() * 0.02;
      p.maxLife = 1.2;
      p.gravity = 0.12;
      p.friction = 0.96;
    }
  }

  public reset(): void {
    this.trauma = 0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.angle = 0;
    this.hitStopRemainingMs = 0;
    this.particlePool.clear();
  }
}
