// Renown: what people are known for. Every deed counts (titles, bouts and duels won, Crucible honours,
// missions, raids beaten off, captains hunted, pupils taught), recent years more than old ones, and a
// famous house lends its people a little of its name. Ranked within the house and across all the houses.
import { seasonsOf, type Season } from './careers';
import { logRecord } from './records';
import { displayName } from './names';
import { dateParts } from './time';
import type { Character, World } from './types';

export const RENOWN_TIERS: [number, string][] = [[150, 'Legend'], [90, 'Famed'], [50, 'Renowned'], [20, 'Noted'], [8, 'Known']];
export const renownTier = (v: number) => RENOWN_TIERS.find(([at]) => v >= at)?.[1] ?? 'Unknown';

const WEIGHT: Partial<Record<keyof Season, number>> = {
  triumphs: 3, missions: 1, boutsWon: 1, duelsWon: 3, raidsRepelled: 1.5, standoffsWon: 2, rescues: 3, heists: 2,
  crucibleWon: 1, cDuelsWon: 4, cMvp: 5, taught: 0.5, titles: 0,
};

export function renownOf(world: World, c: Character): number {
  const now = dateParts(world.date).year;
  let v = 0;
  for (const [y, s] of seasonsOf(world, c.id)) {
    const fade = Math.pow(0.85, Math.max(0, now - y));
    for (const [k, n] of Object.entries(s)) v += (WEIGHT[k as keyof Season] ?? 0) * (n ?? 0) * fade;
  }
  for (const t of world.careers?.titles[c.id] ?? []) v += 6 * Math.pow(0.9, Math.max(0, now - t.year));
  if (c.seat === 'champion') v += 10;
  else if (c.seat === 'grandMaster') v += 8;
  else if (c.seat === 'highroy') v += 12;
  if (c.flags.some((f) => f.id === 'knighted')) v += 4;
  v += (world.houses[c.houseId]?.standing.respect ?? 0) / 20;
  return Math.round(v * 10) / 10;
}

export interface RenownRow { id: string; renown: number; tier: string; rankHouse: number; rankAll: number }

/** Everyone worth ranking, best first. */
export function renownTable(world: World): RenownRow[] {
  const rows = Object.values(world.characters)
    .filter((c) => c.alive && c.tier === 'full' && world.houses[c.houseId])
    .map((c) => ({ c, v: renownOf(world, c) }))
    .filter((x) => x.v >= 3)
    .sort((a, b) => b.v - a.v);
  const inHouse: Record<string, number> = {};
  return rows.map((x, i) => {
    inHouse[x.c.houseId] = (inHouse[x.c.houseId] ?? 0) + 1;
    return { id: x.c.id, renown: x.v, tier: renownTier(x.v), rankHouse: inHouse[x.c.houseId]!, rankAll: i + 1 };
  });
}

export function renownRow(world: World, id: string): RenownRow | undefined {
  return renownTable(world).find((r) => r.id === id);
}

/** Each Orbit: those who cross into Renowned, Famed or Legend are talked about. */
export function advanceRenown(world: World, orbitTurned: boolean): void {
  if (!orbitTurned) return;
  world.renown ??= {};
  for (const r of renownTable(world)) {
    const was = world.renown[r.id];
    world.renown[r.id] = r.tier;
    if (!was || was === r.tier) continue;
    const order = RENOWN_TIERS.map(([, t]) => t);
    if (order.indexOf(r.tier) > order.indexOf(was) || order.indexOf(r.tier) < 0) continue; // only rises are news
    if (r.tier !== 'Renowned' && r.tier !== 'Famed' && r.tier !== 'Legend') continue;
    const c = world.characters[r.id]!;
    const ours = c.houseId === world.playerHouseId;
    logRecord(world, {
      kind: 'world', type: 'world', severity: r.tier === 'Renowned' ? 1 : 2, seat: ours ? 'champion' : 'heralds', houseIds: [c.houseId],
      text: r.tier === 'Legend' ? `${displayName(c.name)} is spoken of across every house now. A legend in their own time.` : r.tier === 'Famed' ? `${displayName(c.name)} of House ${world.houses[c.houseId]!.name} is famed across the houses.` : `${displayName(c.name)} has made a name: renowned in House ${world.houses[c.houseId]!.name} and beyond.`,
      who: [{ id: c.id, part: r.tier }],
    });
  }
}
