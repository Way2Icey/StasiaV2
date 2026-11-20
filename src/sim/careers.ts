// Careers: every deed counted, season by season; potential as diamonds; prospects worth finding young.
import { Rng } from './rng';
import { displayName, shortName } from './names';
import { ageOf } from './characters';
import { SPECIES } from '../data/species';
import { addLead, materialize } from './discovery';
import { knowledgeOf } from './knowledge';
import { logRecord } from './records';
import { seatHolder } from './query';
import { dateParts, type GameDate } from './time';
import type { Character, World } from './types';

export type Stat =
  | 'missions' | 'triumphs' | 'disasters'
  | 'bouts' | 'boutsWon' | 'duels' | 'duelsWon'
  | 'raidsRepelled' | 'standoffsWon' | 'rescues' | 'heists'
  | 'crucible' | 'crucibleWon' | 'cDuels' | 'cDuelsWon' | 'cMvp'
  | 'taught' | 'titles';

export const STAT_LABEL: Record<Stat, string> = {
  missions: 'Missions', triumphs: 'Triumphs', disasters: 'Disasters', bouts: 'Pit bouts', boutsWon: 'Bouts won', duels: 'Duels', duelsWon: 'Duels won',
  raidsRepelled: 'Raids repelled', standoffsWon: 'Standoffs won', rescues: 'Rescues', heists: 'Heists', crucible: 'Crucible engagements', crucibleWon: 'Engagements won',
  cDuels: 'Crucible duels', cDuelsWon: 'Crucible duels won', cMvp: 'Best of the field', taught: 'Pupils taught', titles: 'Titles',
};

/** One season's line: a year of deeds. */
export type Season = Partial<Record<Stat, number>>;

export interface CareersState {
  /** characterId → year → season. */
  of: Record<string, Record<number, Season>>;
  /** Characters the Highroy follows closely. */
  pinned: string[];
  /** Earned titles: characterId → titles, newest last. */
  titles: Record<string, { title: string; year: number }[]>;
}

export function ensureCareers(world: World): void {
  world.careers ??= { of: {}, pinned: [], titles: {} };
  world.careers.pinned ??= [];
  world.careers.titles ??= {};
}

/** Count a deed for this year's season. */
export function tally(world: World, id: string | undefined | null, stat: Stat, n = 1): void {
  if (!id || !world.characters[id]) return;
  ensureCareers(world);
  const year = dateParts(world.date).year;
  const c = (world.careers.of[id] ??= {});
  const s = (c[year] ??= {});
  s[stat] = (s[stat] ?? 0) + n;
}

export function seasonsOf(world: World, id: string): [number, Season][] {
  return Object.entries(world.careers?.of[id] ?? {}).map(([y, s]) => [Number(y), s] as [number, Season]).sort((a, b) => a[0] - b[0]);
}

export function totals(world: World, id: string): Season {
  const t: Season = {};
  for (const [, s] of seasonsOf(world, id)) for (const [k, v] of Object.entries(s)) t[k as Stat] = (t[k as Stat] ?? 0) + (v ?? 0);
  return t;
}

/** A record in a line, FM-style. */
export function seasonLine(s: Season): string {
  const bits: string[] = [];
  if (s.missions) bits.push(`${s.missions} missions${s.triumphs ? `, ${s.triumphs} triumphs` : ''}`);
  if (s.bouts) bits.push(`${s.boutsWon ?? 0}–${(s.bouts ?? 0) - (s.boutsWon ?? 0)} in the pits`);
  if (s.duels) bits.push(`${s.duelsWon ?? 0}–${(s.duels ?? 0) - (s.duelsWon ?? 0)} in duels`);
  if (s.crucible) bits.push(`Crucible ${s.crucibleWon ?? 0}–${(s.crucible ?? 0) - (s.crucibleWon ?? 0)}${s.cDuels ? `, ${s.cDuelsWon ?? 0}/${s.cDuels} duels` : ''}${s.cMvp ? `, best of the field ×${s.cMvp}` : ''}`);
  if (s.raidsRepelled) bits.push(`${s.raidsRepelled} raids repelled`);
  if (s.standoffsWon) bits.push(`${s.standoffsWon} standoffs won`);
  if (s.rescues) bits.push(`${s.rescues} rescues`);
  if (s.heists) bits.push(`${s.heists} heists`);
  if (s.taught) bits.push(`${s.taught} pupils taught`);
  return bits.join(' · ') || 'nothing of note yet';
}

export function award(world: World, id: string, title: string): void {
  ensureCareers(world);
  const year = dateParts(world.date).year;
  (world.careers.titles[id] ??= []).push({ title, year });
  tally(world, id, 'titles');
}

export function titlesOf(world: World, id: string): { title: string; year: number }[] {
  return world.careers?.titles[id] ?? [];
}

// ---------------------------------------------------------------- potential, as diamonds

/** 1–3 diamonds from hidden potential. */
export function diamondsOf(c: Character): number {
  const p = c.hidden.potential;
  return p >= 15 ? 3 : p >= 10 ? 2 : 1;
}

/**
 * What our house can tell of someone's potential: exact once someone has taught or
 * watched them closely (or they are an adult of ours), otherwise a range that narrows
 * with what we know and with the Spymaster's eye.
 */
export function diamondRead(world: World, c: Character): { lo: number; hi: number } {
  const real = diamondsOf(c);
  const P = world.playerHouseId;
  const taught = Object.values(world.training?.enrolments ?? {}).some((e) => e.studentId === c.id) || (world.careers?.of[c.id] && Object.keys(world.careers.of[c.id]!).length > 0);
  const adult = ageOf(c, world.date) >= SPECIES[c.species].adulthood;
  if (c.houseId === P && (taught || adult)) return { lo: real, hi: real };
  const depth = knowledgeOf(world, P, c.id).depth;
  const spy = seatHolder(world, P, 'spymaster');
  const eye = depth + (spy ? (spy.stats.insight + spy.stats.perception) : 10);
  if (eye >= 75) return { lo: real, hi: real };
  // A blur of one either side, kept consistent per person.
  const tilt = (c.id.charCodeAt(c.id.length - 1) % 2) === 0;
  if (eye >= 45) return tilt ? { lo: Math.max(1, real - 1), hi: real } : { lo: real, hi: Math.min(3, real + 1) };
  return { lo: Math.max(1, real - 1), hi: Math.min(3, real + 1) };
}

/** ◆◆◇ for an exact read; ◆◇? for a range. */
export function diamondText(read: { lo: number; hi: number }): string {
  const solid = '◆'.repeat(read.lo);
  const maybe = '◈'.repeat(read.hi - read.lo);
  const empty = '◇'.repeat(3 - read.hi);
  return solid + maybe + empty;
}

// ---------------------------------------------------------------- prospects

/** Children and younglings of real promise turn up across the Reaches; whoever hears of them first can offer them a place. */
export function advanceProspects(world: World, rng: Rng, orbitTurned: boolean): void {
  ensureCareers(world);
  if (!orbitTurned) return;
  const P = world.playerHouseId;
  if (!rng.chance(0.55)) return;
  const planets = Object.values(world.planets);
  const planet = rng.chance(0.55) ? planets.find((p) => p.houseId === P) ?? rng.pick(planets) : rng.pick(planets);
  const sector = rng.pick(planet.sectors);
  const c = materialize(world, rng, planet.id, sector.id);
  // Young: twelve to sixteen-ish in their species' terms, with real promise.
  const ad = SPECIES[c.species].adulthood;
  const age = Math.round(ad * (0.6 + rng.next() * 0.3));
  c.birth = { year: world.date.year - age, cycle: Math.floor(rng.next() * 800) } as GameDate;
  c.hidden.potential = Math.min(20, Math.max(c.hidden.potential, 9 + Math.round(rng.next() * 10)));
  for (const k of Object.keys(c.stats) as (keyof typeof c.stats)[]) c.stats[k] = Math.max(1, Math.round(c.stats[k] * 0.7));
  c.role = 'Youngling';
  const read = diamondText(diamondRead(world, c));
  addLead(world, {
    houseId: P, kind: 'recruit', targetId: c.id, cost: 200, planetId: planet.id, sectorId: sector.id,
    title: `A prospect: ${displayName(c.name)}, ${age} · ${read}`,
    text: `Word of a ${age}-year-old in ${sector.name} on ${planet.name} with something about them. Potential ${read}. Others will hear of them too; whoever offers first gets them.${planet.houseId !== P ? ` Taking them from House ${world.houses[planet.houseId]!.name}'s world will be noticed.` : ''}`,
  });
  logRecord(world, { kind: 'world', type: 'world', severity: 1, text: `A prospect: ${shortName(c.name)}, ${age}, in ${sector.name} — potential ${read}.`, who: [{ id: c.id, part: 'prospect' }], placeId: sector.id, source: 'the house\'s eyes' });
}

/** Follow someone closely: they sit on the Hall and their news comes first. */
export function togglePin(input: World, id: string): World {
  const w = structuredClone(input);
  ensureCareers(w);
  w.careers.pinned = w.careers.pinned.includes(id) ? w.careers.pinned.filter((x) => x !== id) : [...w.careers.pinned, id].slice(-8);
  return w;
}
