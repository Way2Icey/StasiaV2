// Since: a snapshot of the house each Phase, kept for the last ten, so every page can say what changed
// over the last Orbit (five Phases ago) and draw a short trend.
import { econ } from './economy';
import { opinion } from './relationships';
import { regardOf } from './archon';
import { renownOf } from './renown';
import { troopsOf } from './crucible';
import type { GameDate } from './time';
import type { World } from './types';

export interface Snapshot {
  date: GameDate;
  othes: number;
  honour: number;
  respect: number;
  dread: number;
  /** Regard toward us, by house. */
  regard: Record<string, number>;
  /** What each of our people thinks of the Highroy. */
  toLord: Record<string, number>;
  /** Renown of our people. */
  renown: Record<string, number>;
  unrest: number;
  people: number;
  soldiers: number;
}

export const KEEP = 10;
/** How many Phases back "since last Orbit" looks. */
export const ORBIT_BACK = 5;

export function snapshot(w: World): Snapshot {
  const P = w.playerHouseId;
  const h = w.houses[P]!;
  const lord = h.rulerId;
  const ours = Object.values(w.characters).filter((c) => c.alive && c.houseId === P && c.tier === 'full');
  const sectors = Object.values(w.planets).filter((p) => p.houseId === P).flatMap((p) => p.sectors).filter((s) => s.controllerFamilyId);
  const regard: Record<string, number> = {};
  for (const id of Object.keys(w.archon?.houses ?? {})) if (id !== P) regard[id] = regardOf(w, id, P);
  return {
    date: w.date,
    othes: Math.round(econ(w, P)?.stock.othes ?? 0),
    honour: h.standing.honour, respect: h.standing.respect, dread: h.standing.dread,
    regard,
    toLord: Object.fromEntries(ours.filter((c) => lord && c.id !== lord).map((c) => [c.id, opinion(w, c.id, lord!)])),
    renown: Object.fromEntries(ours.map((c) => [c.id, renownOf(w, c)])),
    unrest: sectors.length ? Math.round(sectors.reduce((n, s) => n + s.unrest, 0) / sectors.length) : 0,
    people: sectors.reduce((n, s) => n + s.population, 0),
    soldiers: troopsOf(w, P),
  };
}

/** Each Phase: take the house's measure. */
export function advanceSince(w: World, phaseTurned: boolean): void {
  if (!phaseTurned && w.since?.length) return;
  const list = (w.since ??= []);
  list.push(snapshot(w));
  if (list.length > KEEP) list.splice(0, list.length - KEEP);
}

/** The snapshot about an Orbit ago (or the oldest we have). */
export function orbitAgo(w: World): Snapshot | undefined {
  const list = w.since ?? [];
  if (list.length < 2) return undefined;
  return list[Math.max(0, list.length - 1 - ORBIT_BACK)];
}

/** "+3" / "−2" / "" for a change, rounded. */
export function delta(now: number, was: number | undefined, digits = 0): string {
  if (was === undefined) return '';
  const d = Math.round((now - was) * 10 ** digits) / 10 ** digits;
  if (!d) return '';
  return `${d > 0 ? '+' : '−'}${Math.abs(d).toLocaleString('en-US')}`;
}
