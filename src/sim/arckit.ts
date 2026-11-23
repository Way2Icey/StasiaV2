// Shared pieces for writing arcs: who is at court, how to cast, and how a stage goes to blades.
import { who, type Ctx } from './events';
import { displayName, shortName } from './names';
import { seatHolder, ruler, findSector } from './query';
import { isAway } from './court';
import { econ, heldSectors } from './economy';
import { createBattle, battleOf, outcomes, type FighterSpec, type Theatre } from './battle';
import { materialize } from './discovery';
import { takeIntoHouse } from './training';
import { openThreads, type ThreadKind, type Thread } from './storystate';
import { ageOf } from './characters';
import { SPECIES } from '../data/species';
import type { Caige, Character, CouncilSeat, ResonanceBand, ResonanceType, Sector } from './types';
import { bandFor } from './characters';
import { addCycles, CYCLES_PER_ORBIT, CYCLES_PER_PHASE } from './time';

export { who };
export const nm = (c?: Character) => (c ? shortName(c.name) : 'someone');
export const full = (c?: Character) => (c ? displayName(c.name) : 'someone');
export const seat = (c: Ctx, s: CouncilSeat) => seatHolder(c.world, c.house, s);
export const highroy = (c: Ctx) => ruler(c.world, c.house);
export const othes = (c: Ctx) => econ(c.world, c.house).stock.othes;
export const need = (n: number) => (c: Ctx) => (othes(c) >= n ? null : `Needs ${n.toLocaleString('en-US')} othes`);
export const H = (c: Ctx, id?: string) => (id ? c.world.houses[id]?.name ?? 'a house' : 'a house');
export const hasFlag = (x: Character, id: string) => x.flags.some((f) => f.id === id);
export const rivals = (c: Ctx) => Object.keys(c.world.houses).filter((h) => h !== c.house);
export const pickRival = (c: Ctx, not?: string) => { const r = rivals(c).filter((h) => h !== not); return r.length ? c.rng.pick(r) : undefined; };
export const days = (c: Ctx, lo: number, hi: number) => c.rng.int(lo, hi);
export const at = (c: Ctx, id?: string | number) => (id ? c.world.characters[String(id)] : undefined);
export const adult = (c: Ctx, x: Character) => ageOf(x, c.world.date) >= SPECIES[x.species].adulthood;
export const sectors = (c: Ctx): Sector[] => heldSectors(c.world, c.house);
export const sectorOf = (c: Ctx, id?: string) => (id ? findSector(c.world, id)?.sector : undefined);

/** Arc scratch space, carried stage to stage. */
export const data = (c: Ctx): Record<string, string | number> => (c.arc ? (c.arc.data ??= {}) : (c.memo as Record<string, string | number> | undefined) ?? (c.memo = {}));

/** Ours, at court, with a full sheet; not the Highroy unless asked. */
export function athome(c: Ctx, withHighroy = false): Character[] {
  return Object.values(c.world.characters).filter((x) => x.alive && x.houseId === c.house && x.tier === 'full' && !isAway(c.world, x.id) && (withHighroy || x.seat !== 'highroy'));
}
export const knights = (c: Ctx) => athome(c).filter((x) => x.role === 'Knight' || hasFlag(x, 'knighted'));
export const bonded = (c: Ctx) => athome(c).filter((x) => hasFlag(x, 'caigeBonded'));
export const fighters = (c: Ctx) => athome(c).filter((x) => adult(c, x) && (x.role === 'Knight' || hasFlag(x, 'knighted') || hasFlag(x, 'blooded') || x.stats.duelling >= 12));
export const best = (xs: Character[], score: (x: Character) => number) => [...xs].sort((a, b) => score(b) - score(a))[0];

/** Pick someone from a list, or fail the setup. */
export function cast(c: Ctx, xs: Character[]): Character | undefined { return xs.length ? c.rng.pick(xs) : undefined; }

/** Threads of a kind, on people of ours who are at home. */
export function threadsHome(c: Ctx, kind: ThreadKind): Thread[] {
  return openThreads(c.world, undefined, kind).filter((t) => { const p = c.world.characters[t.personId]; return !!p && p.houseId === c.house && !isAway(c.world, p.id); });
}

/** A stranger made real: a commoner of the given world's house, optionally taken into ours. */
export function stranger(c: Ctx, opts: { planetId?: string; sectorId?: string; join?: string; young?: boolean } = {}): Character {
  const planetId = opts.planetId ?? c.world.houses[c.house]!.capitalPlanetId;
  const planet = c.world.planets[planetId]!;
  const p = materialize(c.world, c.rng, planetId, opts.sectorId ?? planet.sectors[0]!.id);
  if (opts.young) { const ad = SPECIES[p.species].adulthood; p.birth = { year: c.world.date.year - Math.round(ad * 0.7), cycle: c.rng.int(0, 799) }; p.role = 'Youngling'; }
  if (opts.join) takeIntoHouse(c.world, p, opts.join);
  return p;
}

/** A stage that goes to blades: a live battle the clock stops for. The next stage reads how it went. */
export function toBattle(c: Ctx, spec: { title: string; theatre: Theatre; where: string; ours: Character[]; commander?: Character; mass?: number; foes: FighterSpec[]; foeName: string; foeCommander?: { id?: string; name?: string; skill?: number }; foeMass?: number; foeHouse?: string }): void {
  const ours = spec.ours.filter((x) => x.alive).slice(0, 6);
  const cmd = spec.commander ?? best(ours, (x) => x.stats.leadership + x.stats.tactics) ?? ours[0];
  const b = createBattle(c.world, {
    kind: 'arc', title: spec.title, theatre: spec.theatre, where: spec.where, ref: c.arc?.id,
    ours: { name: 'our people', houseId: c.house, commander: { id: cmd?.id }, mass: spec.mass ?? 30, fighters: ours.map((x, i) => ({ id: x.id, champion: i === 0 })) },
    theirs: { name: spec.foeName, houseId: spec.foeHouse, commander: spec.foeCommander ?? { name: spec.foes[0]?.name ?? 'their leader', skill: 10 }, mass: spec.foeMass ?? 30, fighters: spec.foes },
  });
  if (c.struggle) c.struggle.battle = b.id; else data(c).battle = b.id;
  c.fx.say(`${spec.title}: it comes to blades`);
}

/** How the stage's battle went, for the stage after it. */
export function fought(c: Ctx): { won: boolean; fell: Character[]; hurt: Character[]; brokeOff: boolean } | undefined {
  const id = c.arc?.data?.battle as string | undefined;
  const b = id ? battleOf(c.world, id) : undefined;
  if (!b?.result) return undefined;
  const outs = outcomes(b).filter((o) => o.side === 0 && o.id);
  return {
    won: b.result.winner === 0, brokeOff: !!b.result.brokeOff,
    fell: outs.filter((o) => o.fate === 'dead').map((o) => c.world.characters[o.id!]!).filter(Boolean),
    hurt: outs.filter((o) => o.fate === 'down').map((o) => c.world.characters[o.id!]!).filter(Boolean),
  };
}

/** Foes for a battle: a named leader and some hands, by strength. */
export function band(leader: string, power: number, hands: number, handPower = power - 4, label = 'a hand'): FighterSpec[] {
  return [{ name: leader, power, champion: true }, ...Array.from({ length: hands }, (_, i) => ({ key: `h${i}`, name: hands > 1 ? `${label} ${i + 1}` : label, power: handPower }))];
}

export const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

// ---------------------------------------------------------------- resonance and Caiges

const CAIGE_NAMES = ['Coldwake', 'the Ninth Oath', 'Briar Crown', 'Duskhorn', 'Ironpsalm', 'Sunken Bell', 'Harrowlight', 'the Long Hymn', 'Saltmother', 'Vael\'s Tooth', 'the Quiet Star', 'Emberglass'];
const BANDS: ResonanceBand[] = ['bluewake', 'ambercore', 'redline', 'whitebreak'];

/** A Caige comes into the house. */
export function newCaige(c: Ctx, opts: { band?: ResonanceBand; sectorId?: string; name?: string } = {}): Caige {
  const home = c.world.planets[c.world.houses[c.house]!.capitalPlanetId]!;
  const cg: Caige = {
    id: `cg${c.world.nextId++}`, name: opts.name ?? c.rng.pick(CAIGE_NAMES), type: c.rng.pick<ResonanceType>(['magnetic', 'gravitic', 'drift']),
    band: opts.band ?? c.rng.weighted<ResonanceBand>([['bluewake', 35], ['ambercore', 40], ['redline', 20], ['whitebreak', 5]]),
    houseId: c.house, found: c.world.date, foundAt: { planetId: home.id, sectorId: opts.sectorId ?? home.sectors[0]!.id }, stability: 70,
  };
  c.world.armoury[cg.id] = cg;
  c.fx.say(`${cg.name} (${cg.band}, ${cg.type}) comes into the armoury`);
  return cg;
}
void BANDS;

export const caigeOf = (c: Ctx, x?: Character) => (x ? Object.values(c.world.armoury).find((g) => g.bondedTo === x.id) : undefined);
export const freeCaiges = (c: Ctx) => Object.values(c.world.armoury).filter((g) => g.houseId === c.house && !g.bondedTo && !g.pledgedTo);

/** Bond someone to a Caige, whatever the house's rules: stories sometimes force it. */
export function bond(c: Ctx, x: Character | undefined, cg: Caige | undefined) {
  if (!x || !cg) return;
  const was = cg.bondedTo ? c.world.characters[cg.bondedTo] : undefined;
  if (was) was.flags = was.flags.filter((f) => f.id !== 'caigeBonded');
  cg.bondedTo = x.id;
  x.flags = x.flags.filter((f) => f.id !== 'caigeBonded');
  x.flags.push({ id: 'caigeBonded', since: c.world.date, detail: `"${cg.name}"` });
  c.fx.say(`${nm(x)} is bonded to ${cg.name}`);
}

export function unbondFrom(c: Ctx, x: Character | undefined) {
  if (!x) return;
  const cg = caigeOf(c, x);
  if (cg) delete cg.bondedTo;
  x.flags = x.flags.filter((f) => f.id !== 'caigeBonded');
  if (cg) c.fx.say(`${nm(x)} is parted from ${cg.name}`);
}

/** Raise (or lower) someone's resonance; the band follows. */
export function resonate(c: Ctx, x: Character | undefined, deg: number) {
  if (!x) return;
  x.resonance ??= { degrees: 0, band: 'frostpoint', type: c.rng.pick<ResonanceType>(['magnetic', 'gravitic', 'drift']) };
  const before = x.resonance.band;
  x.resonance.degrees = Math.max(0, x.resonance.degrees + deg);
  x.resonance.band = bandFor(x.resonance.degrees);
  c.fx.say(before !== x.resonance.band ? `${nm(x)}'s resonance climbs into ${x.resonance.band}` : `${nm(x)}'s resonance ${deg > 0 ? 'deepens' : 'fades'} (${x.resonance.degrees}°S)`);
}

export function away(c: Ctx, x: Character | undefined, cycles: number, detail: string) {
  if (!x) return;
  x.flags.push({ id: 'travelling', since: c.world.date, until: addCycles(c.world.date, cycles), detail });
}

/** Leave the house for a rival's. */
export function defect(c: Ctx, x: Character | undefined, to: string | undefined) {
  if (!x || !to) return;
  delete x.seat;
  unbondFrom(c, x);
  x.houseId = to;
  x.role = x.role === 'Knight' ? 'Knight' : 'Courtier';
  const cap = c.world.planets[c.world.houses[to]!.capitalPlanetId]!;
  x.location = { planetId: cap.id, sectorId: cap.sectors[0]!.id };
  c.fx.say(`${nm(x)} goes over to House ${H(c, to)}`);
}

export const CYCLES = { PHASE: CYCLES_PER_PHASE, ORBIT: CYCLES_PER_ORBIT };
