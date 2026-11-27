// What a decision would do to where we stand: each option is played out on a copy of the world and our
// scores in the Numarade's five rankings are measured before and after. Nothing on the table moves until the
// Numarade next publishes; this is the pressure the choice puts on it.
//
// The option is played twice, on dice of its own, and the two are averaged: the hint shows which way a
// choice leans, not how a check will fall.
import { Rng } from './rng';
import { settle } from './events';
import { rawScores, RANK_KEYS, type RankKey } from './rankings';
import type { World } from './types';

export type Pressure = Partial<Record<RankKey, number>>;

const RUNS = 2;

/** For each option of a waiting decision: how much it would move our score in each ranking (0-100 scale). */
export function rankPressure(world: World, eventId: string, options: number): Pressure[] {
  const P = world.playerHouseId;
  if (!world.archon || !world.events.pending.some((p) => p.id === eventId)) return [];
  const before = rawScores(world)[P];
  if (!before) return [];
  const out: Pressure[] = [];
  for (let i = 0; i < options; i++) {
    const sum: Record<RankKey, number> = { power: 0, economy: 0, influence: 0, legacy: 0, knights: 0 };
    let runs = 0;
    for (let r = 0; r < RUNS; r++) {
      try {
        const w = structuredClone(world);
        const rng = Rng.fromSeed(`${w.seed}/preview/${eventId}/${i}/${r}`);
        settle(w, rng, eventId, i);
        const after = rawScores(w)[P];
        if (!after) continue;
        for (const k of RANK_KEYS) sum[k] += after[k] - before[k];
        runs++;
      } catch { /* a broken option shows no hint */ }
    }
    const p: Pressure = {};
    if (runs) for (const k of RANK_KEYS) { const d = sum[k] / runs; if (Math.abs(d) >= 0.2) p[k] = Math.round(d * 10) / 10; }
    out.push(p);
  }
  return out;
}
