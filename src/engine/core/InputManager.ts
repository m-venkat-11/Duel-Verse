/**
 * InputManager.ts
 * Precise polled input management for Keyboard and Pointer Events (Touch, Mouse, Pen).
 * Follows core principle: Handlers only record input state; update() polls state.
 * Prevents stuck keys on blur, supports touch-action: none, and provides drag vectors.
 */

export interface PointerState {
  isDown: boolean;
  justPressed: boolean;
  justReleased: boolean;
  x: number;
  y: number;
  startX: number;
  startY: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
}

export class InputManager {
  private element: HTMLElement | null = null;

  // Keyboard state
  private downKeys: Set<string> = new Set();
  private pressedKeys: Set<string> = new Set();
  private releasedKeys: Set<string> = new Set();

  // Pointer state (mouse / primary touch)
  public pointer: PointerState = {
    isDown: false,
    justPressed: false,
    justReleased: false,
    x: 0,
    y: 0,
    startX: 0,
    startY: 0,
    prevX: 0,
    prevY: 0,
    vx: 0,
    vy: 0
  };

  private rawPointerDown: boolean = false;
  private rawPointerJustPressed: boolean = false;
  private rawPointerJustReleased: boolean = false;
  private rawPointerX: number = 0;
  private rawPointerY: number = 0;

  constructor() {
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleBlur = this.handleBlur.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handlePointerCancel = this.handlePointerCancel.bind(this);
  }

  public attach(element: HTMLElement): void {
    this.element = element;
    element.style.touchAction = 'none'; // Critical for mobile touch without browser gestures

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);

    element.addEventListener('pointerdown', this.handlePointerDown);
    element.addEventListener('pointermove', this.handlePointerMove);
    element.addEventListener('pointerup', this.handlePointerUp);
    element.addEventListener('pointercancel', this.handlePointerCancel);
  }

  public detach(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);

    if (this.element) {
      this.element.removeEventListener('pointerdown', this.handlePointerDown);
      this.element.removeEventListener('pointermove', this.handlePointerMove);
      this.element.removeEventListener('pointerup', this.handlePointerUp);
      this.element.removeEventListener('pointercancel', this.handlePointerCancel);
      this.element = null;
    }

    this.downKeys.clear();
    this.pressedKeys.clear();
    this.releasedKeys.clear();
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (!e.repeat) {
      this.downKeys.add(e.code);
      this.pressedKeys.add(e.code);
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.downKeys.delete(e.code);
    this.releasedKeys.add(e.code);
  }

  private handleBlur(): void {
    // Prevent stuck keys or stuck touches when window loses focus
    this.downKeys.clear();
    this.pressedKeys.clear();
    this.releasedKeys.clear();
    this.rawPointerDown = false;
  }

  private updatePointerCoords(e: PointerEvent): void {
    if (!this.element) return;
    const rect = this.element.getBoundingClientRect();
    this.rawPointerX = e.clientX - rect.left;
    this.rawPointerY = e.clientY - rect.top;
  }

  private handlePointerDown(e: PointerEvent): void {
    this.element?.setPointerCapture(e.pointerId);
    this.updatePointerCoords(e);
    this.rawPointerDown = true;
    this.rawPointerJustPressed = true;
    this.pointer.startX = this.rawPointerX;
    this.pointer.startY = this.rawPointerY;
  }

  private handlePointerMove(e: PointerEvent): void {
    this.updatePointerCoords(e);
  }

  private handlePointerUp(e: PointerEvent): void {
    try {
      this.element?.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore pointer release if already lost
    }
    this.updatePointerCoords(e);
    this.rawPointerDown = false;
    this.rawPointerJustReleased = true;
  }

  private handlePointerCancel(e: PointerEvent): void {
    this.handlePointerUp(e);
  }

  /**
   * Called once per fixed logic update (e.g. at 60 Hz).
   * Transfers recorded input into readable state and calculates velocities.
   */
  public update(dt: number): void {
    this.pointer.prevX = this.pointer.x;
    this.pointer.prevY = this.pointer.y;
    this.pointer.x = this.rawPointerX;
    this.pointer.y = this.rawPointerY;

    this.pointer.vx = (this.pointer.x - this.pointer.prevX) / dt;
    this.pointer.vy = (this.pointer.y - this.pointer.prevY) / dt;

    this.pointer.isDown = this.rawPointerDown;
    this.pointer.justPressed = this.rawPointerJustPressed;
    this.pointer.justReleased = this.rawPointerJustReleased;

    // Reset single-frame pulse flags at end of tick
    this.rawPointerJustPressed = false;
    this.rawPointerJustReleased = false;
    this.pressedKeys.clear();
    this.releasedKeys.clear();
  }

  public isKeyDown(code: string): boolean {
    return this.downKeys.has(code);
  }

  public isKeyPressed(code: string): boolean {
    return this.pressedKeys.has(code);
  }

  public isKeyReleased(code: string): boolean {
    return this.releasedKeys.has(code);
  }
}
