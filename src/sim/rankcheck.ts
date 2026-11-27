// Reading the published rankings, with no imports of its own: the economy, the Exchange, the lanes and the
// boards consult it, and it must not pull the whole sim in behind it.
import type { World } from './types';

export type RankName = 'power' | 'economy' | 'influence' | 'legacy' | 'knights';

/** Is a house in the top three of a ranking, as last published? */
export function inTopThree(w: World, houseId: string, k: RankName): boolean {
  const r = w.rankings?.table.find((x) => x.id === houseId);
  return !!r && r.rank[k] <= 3;
}
/** Is a house among the four weakest in Power? */
export function weakestInPower(w: World, houseId: string): boolean {
  const r = w.rankings?.table.find((x) => x.id === houseId);
  return !!r && r.rank.power > w.rankings!.table.length - 4;
}
