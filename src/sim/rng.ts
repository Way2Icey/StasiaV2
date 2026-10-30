// Seeded random numbers. Every random choice in the simulation goes through
// an Rng so the same seed always produces the same world, and a saved game
// continues exactly as it would have.

export type RngState = [number, number, number, number];

/** Hash any string into four 32-bit words (cyrb128). */
export function hashString(str: string): RngState {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** sfc32: small, fast, good-quality generator with a 128-bit state. */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(state: RngState) {
    [this.a, this.b, this.c, this.d] = state;
  }

  /** A generator for a named stream, e.g. `${worldSeed}:character:42`. */
  static fromSeed(seed: string): Rng {
    const rng = new Rng(hashString(seed));
    for (let i = 0; i < 12; i++) rng.next(); // warm up
    return rng;
  }

  get state(): RngState {
    return [this.a, this.b, this.c, this.d];
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.a >>>= 0; this.b >>>= 0; this.c >>>= 0; this.d >>>= 0;
    let t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    t = (t + this.d) | 0;
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  /** Integer in [min, max], both inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick from empty list');
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /** Pick by weight; weights need not sum to 1. */
  weighted<T>(items: readonly (readonly [T, number])[]): T {
    const total = items.reduce((sum, [, w]) => sum + Math.max(0, w), 0);
    if (total <= 0) throw new Error('weighted pick with no positive weights');
    let roll = this.next() * total;
    for (const [item, w] of items) {
      roll -= Math.max(0, w);
      if (roll < 0) return item;
    }
    return items[items.length - 1]![0];
  }

  /** Approximately normal value (sum of three uniforms), mean 0, sd ~1. */
  gauss(): number {
    return (this.next() + this.next() + this.next() - 1.5) * 2;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  }
}
