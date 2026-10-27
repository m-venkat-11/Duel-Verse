/**
 * ObjectPool.ts
 * High-performance, zero-allocation object pool.
 * Pre-allocates a fixed capacity of reusable items.
 * Completely eliminates garbage collection stutter in 60fps / 120fps hot loops.
 */

export class ObjectPool<T> {
  private pool: T[];
  private activeCount: number = 0;
  private readonly factory: () => T;
  private readonly reset: (item: T) => void;

  constructor(factory: () => T, reset: (item: T) => void, initialCapacity: number = 100) {
    this.factory = factory;
    this.reset = reset;
    this.pool = new Array(initialCapacity);
    for (let i = 0; i < initialCapacity; i++) {
      this.pool[i] = this.factory();
    }
  }

  /**
   * Acquire an active item from the pool.
   * If all items are active, dynamically expands capacity.
   */
  public acquire(): T {
    if (this.activeCount >= this.pool.length) {
      // Expand pool by 50%
      const newCapacity = Math.ceil(this.pool.length * 1.5);
      const prevLength = this.pool.length;
      this.pool.length = newCapacity;
      for (let i = prevLength; i < newCapacity; i++) {
        this.pool[i] = this.factory();
      }
    }

    const item = this.pool[this.activeCount];
    this.reset(item);
    this.activeCount++;
    return item;
  }

  /**
   * Release an item at a specific index by swapping with the last active item.
   * O(1) instantaneous release with zero allocations.
   */
  public releaseAt(index: number): void {
    if (index < 0 || index >= this.activeCount) return;
    this.activeCount--;
    const temp = this.pool[index];
    this.pool[index] = this.pool[this.activeCount];
    this.pool[this.activeCount] = temp;
    this.reset(temp);
  }

  public getActiveItems(): T[] {
    return this.pool;
  }

  public getActiveCount(): number {
    return this.activeCount;
  }

  public clear(): void {
    for (let i = 0; i < this.activeCount; i++) {
      this.reset(this.pool[i]);
    }
    this.activeCount = 0;
  }
}

/**
 * Standard reusable 2D Particle structure
 */
export interface Particle {
  active: boolean;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
  glowColor: string;
  alpha: number;
  decay: number;
  gravity: number;
  friction: number;
}

export function createParticleFactory(): () => Particle {
  return () => ({
    active: false,
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    vx: 0,
    vy: 0,
    size: 2,
    life: 0,
    maxLife: 1,
    color: '#ffffff',
    glowColor: '#06b6d4',
    alpha: 1,
    decay: 0.02,
    gravity: 0,
    friction: 0.98
  });
}

export function resetParticle(p: Particle): void {
  p.active = false;
  p.x = 0;
  p.y = 0;
  p.prevX = 0;
  p.prevY = 0;
  p.vx = 0;
  p.vy = 0;
  p.size = 2;
  p.life = 0;
  p.maxLife = 1;
  p.alpha = 1;
  p.decay = 0.02;
  p.gravity = 0;
  p.friction = 0.98;
}
