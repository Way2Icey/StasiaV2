// Where a house's soldiers stand. Every soldier is somewhere: in the garrison of a sector of one of its
// worlds, on one of its stations or outposts, in the knights' company, or in the field legion.
//
// A sector's garrison is the figure its Military quarter gives where it has one (the Citadel Garrison, the
// Holdfast's household troops), and otherwise a watch in proportion to its people: a docks city keeps more
// under arms than a farm valley. Stations and outposts keep the garrison set on them.
//
// A house's standing army comes from its people and how many of them it keeps under arms (data/profiles.ts:
// the canon's own figures where it gives them); the field legion is whatever of it the garrisons and the
// company do not hold. Our own garrisons are counted post by post; another house's we know only as a share.
import type { World } from './types';
import { garrisonShare, standingArmy } from '../data/profiles';

/** Soldiers kept per head of population, by the kind of place a sector is. */
const WATCH: [RegExp, number][] = [
  [/dock|port|trade/i, 0.008],
  [/citadel|fortress|garrison|base|post/i, 0.012],
  [/foundry|industr|works|refin/i, 0.006],
  [/mining|mine|quarr/i, 0.006],
  [/city|capital/i, 0.006],
  [/farm|field|agri/i, 0.003],
  [/universit|scholar|academ|temple|monaster/i, 0.003],
  [/wild|frontier|ruin/i, 0.025],
];

/** A house's soldiers, all told (garrisons, company and legion together). */
export const armyOf = (id: string): number => standingArmy(id);

export interface Post { id: string; name: string; where: string; kind: 'sector' | 'station' | 'outpost'; troops: number; note: string }

const round50 = (v: number) => Math.max(50, Math.round(v / 50) * 50);

/** Every garrison a house keeps, biggest first. */
export function garrisonsOf(world: World, houseId: string): Post[] {
  const out: Post[] = [];
  for (const p of Object.values(world.planets)) {
    if (p.houseId !== houseId) continue;
    for (const s of p.sectors) {
      const q = (s.quarters ?? []).find((x) => x.kind === 'Military' && /[\d,]+\s/.test(x.gives ?? ''));
      if (q) {
        const n = Number(/([\d,]+)\s/.exec(q.gives)![1]!.replace(/,/g, ''));
        out.push({ id: s.id, name: q.name, where: `${s.name}, ${p.name}`, kind: 'sector', troops: n, note: q.gives });
        continue;
      }
      const rate = WATCH.find(([re]) => re.test(`${s.designation} ${s.name}`))?.[1] ?? 0.004;
      if (!s.population) continue;
      out.push({ id: s.id, name: `${s.name} watch`, where: `${s.name}, ${p.name}`, kind: 'sector', troops: round50(s.population * rate), note: `a watch for ${Math.round(s.population / 1000)}k people` });
    }
  }
  for (const site of Object.values(world.places?.sites ?? {})) {
    if (site.holder !== houseId || !site.holdable || !site.garrison) continue;
    out.push({ id: site.id, name: site.name, where: site.region, kind: site.kind === 'outpost' ? 'outpost' : 'station', troops: site.garrison, note: site.kind });
  }
  return out.sort((a, b) => b.troops - a.troops);
}

/** All the soldiers a house keeps in garrisons: ours counted post by post, another's as the share its worlds need. */
export function garrisonTotal(world: World, houseId: string): number {
  if (houseId === world.playerHouseId) return garrisonsOf(world, houseId).reduce((n, g) => n + g.troops, 0);
  const worlds = world.archon?.houses[houseId]?.worlds ?? 1;
  return Math.round((standingArmy(houseId) * garrisonShare(worlds)) / 100) * 100;
}
