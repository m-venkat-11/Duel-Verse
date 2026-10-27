/**
 * CanvasManager.ts
 * Manages high-DPI scaling (Retina / mobile displays), letterbox aspect ratios,
 * and offscreen canvas caching for static court surfaces.
 */

export class CanvasManager {
  public canvas: HTMLCanvasElement;
  public ctx: CanvasRenderingContext2D;
  public dpr: number = 1;
  public width: number = 0;
  public height: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('Canvas 2D context could not be acquired');
    }
    this.ctx = ctx;
    this.resize();
  }

  /**
   * Resizes internal buffer to match container while multiplying by devicePixelRatio.
   * Keeps visual CSS size identical while giving ultra-crisp Retina rendering.
   */
  public resize(customWidth?: number, customHeight?: number): { width: number; height: number } {
    this.dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;

    const rect = this.canvas.getBoundingClientRect();
    const cssWidth = customWidth ?? Math.max(100, Math.floor(rect.width));
    const cssHeight = customHeight ?? Math.max(100, Math.floor(rect.height));

    this.width = cssWidth;
    this.height = cssHeight;

    const internalW = Math.floor(cssWidth * this.dpr);
    const internalH = Math.floor(cssHeight * this.dpr);

    if (this.canvas.width !== internalW || this.canvas.height !== internalH) {
      this.canvas.width = internalW;
      this.canvas.height = internalH;
    }

    // Reset transform and scale to devicePixelRatio
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(this.dpr, this.dpr);

    return { width: this.width, height: this.height };
  }

  /**
   * Create an offscreen canvas pre-rendered with static backgrounds or markings.
   * Drastically cuts down draw calls in the per-frame render loop.
   */
  public createStaticSurface(
    width: number,
    height: number,
    drawFn: (offCtx: CanvasRenderingContext2D) => void
  ): HTMLCanvasElement {
    const offCanvas = document.createElement('canvas');
    offCanvas.width = Math.floor(width * this.dpr);
    offCanvas.height = Math.floor(height * this.dpr);

    const offCtx = offCanvas.getContext('2d');
    if (offCtx) {
      offCtx.scale(this.dpr, this.dpr);
      drawFn(offCtx);
    }
    return offCanvas;
  }
}
