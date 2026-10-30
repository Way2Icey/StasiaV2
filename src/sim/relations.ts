import type { World } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** How house `from` regards house `to`, -100..100. */
export function relation(world: World, from: string, to: string): number {
  return world.relations?.[from]?.[to] ?? 0;
}

/** Move `from`'s regard for `to`. Gains stop at `cap` (they never push past it). Returns the change. */
export function shiftRelation(world: World, from: string, to: string, by: number, cap = 100): number {
  world.relations ??= {};
  const book = (world.relations[from] ??= {});
  const before = book[to] ?? 0;
  const after = by > 0 ? Math.min(Math.max(before, cap), before + by) : before + by;
  book[to] = Math.round(clamp(after, -100, 100));
  return book[to]! - before;
}

export function attitude(v: number): string {
  if (v <= -50) return 'Hostile';
  if (v <= -20) return 'Cold';
  if (v < 0) return 'Wary';
  if (v < 20) return 'Neutral';
  if (v < 40) return 'Cordial';
  if (v < 70) return 'Friendly';
  return 'Close';
}

export function attitudeColor(v: number): string {
  if (v <= -20) return 'var(--orange)';
  if (v < 0) return 'var(--amber)';
  if (v < 20) return 'var(--muted)';
  if (v < 40) return 'var(--blue)';
  return 'var(--green)';
}
