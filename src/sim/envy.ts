// Envy: the will of the Archon against whoever stands highest. A house that leads the others in standing,
// in coin, or in the chair is resented by those beneath it, and the resentment is real: it costs votes,
// sours regard year by year, tables motions against it, and draws wars toward it. Friendship and pacts
// soften it; nothing removes it.
import type { World } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const prestige = (w: World, id: string) => w.archon?.houses[id]?.prestige ?? 40;
const live = (w: World) => Object.values(w.archon?.houses ?? {}).filter((h) => !h.ended);
const coin = (w: World, id: string) => w.economy?.houses[id]?.stock.othes ?? 0;

/** The house that stands highest in the Archon. */
export function topHouse(w: World): string | undefined {
  return live(w).sort((a, b) => b.prestige - a.prestige)[0]?.id;
}

/** 0..60: how much one house resents another for standing above it. */
export function envyOf(w: World, voter: string, target: string): number {
  if (voter === target || !w.archon) return 0;
  let e = Math.max(0, prestige(w, target) - prestige(w, voter)) * 0.45;
  if (topHouse(w) === target) e += 10;
  if (w.archon.numarade.exarchon?.houseId === target) e += 14;
  if (w.archon.houses[target]?.tier === 'great' && w.archon.houses[voter]?.tier === 'minor') e += 4;
  // Coin is seen: a house sitting on a fortune is resented by every house that is not.
  const theirs = coin(w, target);
  const mine = w.economy?.houses[voter] ? coin(w, voter) : 120000;
  if (theirs > 300000 && theirs > mine * 3) e += Math.min(10, theirs / 200000);
  // Friends and the sworn resent less.
  const regard = (w.archon.regard?.[voter]?.[target] ?? 0);
  if (w.war?.liege[voter] === target) e *= 0.3;
  if (w.archon.pacts.some((p) => (p.a === voter && p.b === target) || (p.b === voter && p.a === target))) e *= 0.5;
  if (regard > 50) e *= 0.6;
  return clamp(Math.round(e), 0, 60);
}

/** How much the Archon as a whole resents a house: the average over everyone else. */
export function envyAgainst(w: World, target: string): number {
  const hs = live(w).filter((h) => h.id !== target);
  if (!hs.length) return 0;
  return Math.round(hs.reduce((t, h) => t + envyOf(w, h.id, target), 0) / hs.length);
}

/** Once a year: resentment sours regard, a little at a time. */
export function envyYear(w: World, shift: (a: string, b: string, by: number) => void): void {
  const top = topHouse(w);
  const ex = w.archon?.numarade.exarchon?.houseId;
  for (const target of new Set([top, ex].filter((x): x is string => !!x))) {
    for (const h of live(w)) {
      if (h.id === target) continue;
      const e = envyOf(w, h.id, target);
      if (e >= 8) shift(h.id, target, -Math.round(e / 8));
    }
  }
}

export function envyWord(e: number): string {
  return e >= 40 ? 'bitter' : e >= 25 ? 'deep' : e >= 12 ? 'growing' : e >= 5 ? 'some' : 'little';
}
