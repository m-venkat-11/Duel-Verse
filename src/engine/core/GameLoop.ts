/**
 * GameLoop.ts
 * High-precision fixed-timestep game loop runner.
 * Follows industry-standard accumulator pattern:
 * - Fixed 60 Hz update tick (STEP = 1 / 60) for deterministic physics and logic.
 * - Variable render tick driven by requestAnimationFrame with state interpolation alpha.
 * - Delta time clamped to prevent spiral of death on tab switches or stutter.
 * - Automatic pause and resume on visibilitychange.
 */

export interface GameLoopCallbacks {
  update: (dt: number) => void;
  render: (alpha: number) => void;
}

export class GameLoop {
  private readonly STEP: number = 1 / 60; // 60 Hz fixed logic rate
  private lastTime: number = 0;
  private accumulator: number = 0;
  private animFrameId: number | null = null;
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private callbacks: GameLoopCallbacks;

  // Performance telemetry
  public fps: number = 60;
  public frameTimeMs: number = 0;
  private frameCount: number = 0;
  private lastFpsUpdate: number = 0;

  constructor(callbacks: GameLoopCallbacks) {
    this.callbacks = callbacks;
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.frame = this.frame.bind(this);
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isPaused = false;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.lastFpsUpdate = this.lastTime;
    this.frameCount = 0;

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }

    this.animFrameId = requestAnimationFrame(this.frame);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  private handleVisibilityChange(): void {
    if (document.hidden) {
      this.isPaused = true;
    } else {
      // Reset last timestamp on resume to prevent jump or spiral of death
      this.lastTime = performance.now();
      this.accumulator = 0;
      this.isPaused = false;
    }
  }

  private frame(now: number): void {
    if (!this.isRunning) return;

    if (this.isPaused) {
      this.animFrameId = requestAnimationFrame(this.frame);
      return;
    }

    const startPerf = performance.now();

    // Clamp dt: prevents "spiral of death" if a frame takes too long or after sleep
    const dt = Math.min((now - this.lastTime) / 1000, 0.25);
    this.lastTime = now;
    this.accumulator += dt;

    // Fixed timestep logic updates
    while (this.accumulator >= this.STEP) {
      this.callbacks.update(this.STEP);
      this.accumulator -= this.STEP;
    }

    // Render with interpolation alpha for butter-smooth visual motion
    const alpha = this.accumulator / this.STEP;
    this.callbacks.render(alpha);

    // Telemetry updates
    this.frameTimeMs = performance.now() - startPerf;
    this.frameCount++;
    if (now - this.lastFpsUpdate >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.lastFpsUpdate = now;
    }

    this.animFrameId = requestAnimationFrame(this.frame);
  }
}
