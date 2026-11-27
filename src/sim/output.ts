// What a house makes and what it knows, measured from what it actually holds, so that building moves the
// Numarade's table. Houses we do not see whole are estimated from their profile (see rankings.ts).
//
// Industry: the goods its forges, mines, refineries and works turn out each Phase (at the Exchange's base
// prices; farms are not industry), its shipyards, and the ground it has built on.
// Learning: computing, the schools, archives and academies it keeps, the Great Archive, and the minds of
// its sharpest people.
import { BASE_PRICE, GOODS, QUARTER_ECONOMY, type Good } from '../data/economy';
import { computingOf, phaseLedger } from './economy';
import { modulesOf } from './holdings';
import { hasWork } from './treasury';
import type { World } from './types';

/** Quarter kinds that are places of learning. */
const LEARNED = new Set(['Education', 'Training', 'Archive', 'Computing', 'Research', 'Monastery', 'Library']);
const MADE: Good[] = GOODS.filter((g) => g !== 'provisions');

export interface OutputPart { label: string; amount: number }

export function industryParts(w: World, id: string): OutputPart[] {
  const goods = phaseLedger(w, id).filter((l) => l.amount > 0 && (MADE as string[]).includes(l.resource));
  const byGood = MADE.map((g) => ({ label: `${g} made`, amount: goods.filter((l) => l.resource === g).reduce((n, l) => n + l.amount * BASE_PRICE[g], 0) })).filter((x) => x.amount > 0);
  const yards = modulesOf(w, id, 'shipyard').reduce((n, m) => n + m.level, 0);
  const built = Object.values(w.planets).filter((p) => p.houseId === id).flatMap((p) => p.sectors).reduce((n, s) => n + s.roomUsed, 0);
  return [...byGood, { label: 'Shipyards', amount: yards * 150 }, { label: 'Ground built on', amount: built * 20 }].filter((x) => x.amount > 0);
}

/** A Phase's worth of what the house makes, in othes. */
export const industryOf = (w: World, id: string): number => Math.round(industryParts(w, id).reduce((n, x) => n + x.amount, 0));

export function learningParts(w: World, id: string): OutputPart[] {
  const quarters = Object.values(w.planets).filter((p) => p.houseId === id).flatMap((p) => p.sectors).flatMap((s) => s.quarters ?? [])
    .filter((q) => LEARNED.has(q.kind) || QUARTER_ECONOMY[q.name]?.computing);
  const academies = modulesOf(w, id, 'academy').reduce((n, m) => n + m.level, 0);
  const minds = Object.values(w.characters).filter((c) => c.alive && c.houseId === id && c.tier === 'full')
    .map((c) => c.stats.intellect ?? 0).sort((a, b) => b - a).slice(0, 5).reduce((n, v) => n + v, 0);
  return [
    { label: 'Computing', amount: computingOf(w, id).total },
    { label: 'Schools, archives and halls', amount: quarters.length * 120 },
    { label: 'Academies', amount: academies * 150 },
    { label: 'The Great Archive', amount: id === w.playerHouseId && hasWork(w, 'archive') ? 400 : 0 },
    { label: 'Its sharpest minds', amount: minds * 10 },
  ].filter((x) => x.amount > 0);
}

export const learningOf = (w: World, id: string): number => Math.round(learningParts(w, id).reduce((n, x) => n + x.amount, 0));
