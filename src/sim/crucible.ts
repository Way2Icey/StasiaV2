// The Crucible: the houses' warlike answer to having no war. Each year five to eight houses are drawn
// to a battle world for a mock war. Every house fields the same weight of force: one champion, and five
// hundred men's worth of troops, where a knight counts as fifty men. A Marshal directs them from orbit.
// The houses fight over the battle world's locations and the prizes in them. The battles are real:
// men die, knights are wounded and some do not come home. It costs money, supplies, a ship and people,
// and it is one avenue among many: a house is not drawn every year.
import { lastingWound, seasoned } from './ladder';
import { Rng } from './rng';
import { displayName, shortName } from './names';
import { ageOf } from './characters';
import { SPECIES } from '../data/species';
import { buyPrice, econ, record, tradeInPlace } from './economy';
import { logRecord } from './records';
import { isAway } from './court';
import { shiftMood } from './mood';
import { shiftRelation } from './relations';
import { shiftBoth, shiftOpinion } from './relationships';
import { kill } from './death';
import { addGlory } from './ambitions';
import { award, tally } from './careers';
import { storeInVault } from './holdings';
import { addCycles, dateParts } from './time';
import type { Character, World } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export const BATTLE_WORLD = 'the Crucible of Vael';
/** Every house fields this much: men, with each knight counting as fifty. */
export const FORCE = 500;
export const KNIGHT_WEIGHT = 50;
export const MAX_KNIGHTS = FORCE / KNIGHT_WEIGHT;
/** What it costs to field a contingent. */
export const COST_PER_MAN = 3;
export const COST_PROVISIONS = 60;
export const COST_FUEL = 40;
export const CHARTER_COST = 3000;

// The year's calendar, by Orbit (1–10).
export const DRAW_ORBIT = 4;
export const CLOSES = 5;
export const ROUND_ORBITS = [6, 7, 8, 9];
const FIGHT_PHASE = 3;

export type Stance = 'bold' | 'measured' | 'cunning';
export const STANCE_LABEL: Record<Stance, string> = { bold: 'Bold', measured: 'Measured', cunning: 'Cunning' };
export const STANCE_NOTE: Record<Stance, string> = {
  bold: 'Strike first and hard. Overwhelms a cunning foe; breaks on a measured one.',
  measured: 'Hold and wait. Breaks a bold charge; is outwitted by cunning.',
  cunning: 'Feints and flanks. Outwits the measured; is run down by the bold.',
};
const BEATS: Record<Stance, Stance> = { bold: 'cunning', measured: 'bold', cunning: 'measured' };

/**
 * Houses of Archon outside our corner of the Reaches: they come to the Crucible but are not
 * simulated in full. Names other than Lumen are placeholders until the canon list is in.
 */
export const GUEST_HOUSES: { id: string; name: string; might: number }[] = [
  { id: 'g-lumen', name: 'Lumen', might: 1.25 },
  { id: 'g-veyr', name: 'Veyr', might: 1.0 },
  { id: 'g-ostrava', name: 'Ostrava', might: 1.05 },
  { id: 'g-caldrenne', name: 'Caldrenne', might: 0.95 },
  { id: 'g-mhoro', name: 'Mhoro', might: 0.9 },
  { id: 'g-ilthane', name: 'Ilthane', might: 1.1 },
];

// ---------------------------------------------------------------- doctrines

/** How a house tends to fight its Crucible. A Marshal who knows it can counter it. */
export type Aim = 'riches' | 'hold' | 'bleed';
export const AIM_LABEL: Record<Aim, string> = { riches: 'Seize the riches', hold: 'Hold what we take', bleed: 'Bleed a rival' };
export const AIM_NOTE: Record<Aim, string> = {
  riches: 'Go where the prizes are richest, whoever holds them.',
  hold: 'Take a few sites and refuse to give them up.',
  bleed: 'Hunt one house\'s force wherever it goes.',
};
export interface Doctrine {
  name: string;
  text: string;
  /** How often they choose each stance. */
  stance: Record<Stance, number>;
  /** How many knights they tend to field. */
  knights: [number, number];
  aim: Aim;
  /** What they do best. */
  edge?: 'duel' | 'defend' | 'raid';
}
export const DOCTRINES: Record<string, Doctrine> = {
  alerion: { name: 'The Long Line', text: 'Discipline and patience: a measured line that gives ground slowly and takes it back.', stance: { bold: 2, measured: 5, cunning: 3 }, knights: [3, 6], aim: 'hold', edge: 'defend' },
  torvann: { name: 'The Iron Tide', text: 'Everything forward at once, knights at the front. Their champions want the duel more than the site.', stance: { bold: 6, measured: 2, cunning: 2 }, knights: [6, 10], aim: 'bleed', edge: 'duel' },
  serath: { name: 'The Wolf Run', text: 'Fast and everywhere: they take what is left unguarded and are gone before the line forms.', stance: { bold: 2, measured: 1, cunning: 6 }, knights: [1, 4], aim: 'riches', edge: 'raid' },
  shaaliin: { name: 'The Choir', text: 'They choose a ground and sing it closed. Hard to move once they are dug in.', stance: { bold: 1, measured: 6, cunning: 3 }, knights: [2, 5], aim: 'hold', edge: 'defend' },
  'g-lumen': { name: 'The Bright Hand', text: 'Old money and the best-drilled host in the Archon: rich, confident, and usually first to the treasury.', stance: { bold: 4, measured: 4, cunning: 2 }, knights: [4, 8], aim: 'riches', edge: 'duel' },
  'g-veyr': { name: 'The Knife Wind', text: 'Feints, false retreats and night marches.', stance: { bold: 2, measured: 2, cunning: 6 }, knights: [2, 5], aim: 'bleed', edge: 'raid' },
  'g-ostrava': { name: 'The Anvil', text: 'Slow, heavy and hard to kill.', stance: { bold: 2, measured: 6, cunning: 2 }, knights: [5, 9], aim: 'hold', edge: 'defend' },
  'g-caldrenne': { name: 'The Gilded Charge', text: 'One great blow, led by the champion, and damn the cost.', stance: { bold: 6, measured: 1, cunning: 3 }, knights: [5, 10], aim: 'riches', edge: 'duel' },
  'g-mhoro': { name: 'The Tidewatch', text: 'They wait for others to bleed each other, then take the remains.', stance: { bold: 1, measured: 4, cunning: 5 }, knights: [1, 4], aim: 'riches', edge: 'raid' },
  'g-ilthane': { name: 'The Glass Wall', text: 'Precise, cold and patient; they rarely lose a site they mean to keep.', stance: { bold: 2, measured: 5, cunning: 3 }, knights: [3, 7], aim: 'hold', edge: 'defend' },
};
const FALLBACK: Doctrine = { name: 'No set doctrine', text: 'They fight as the day takes them.', stance: { bold: 1, measured: 1, cunning: 1 }, knights: [0, MAX_KNIGHTS], aim: 'riches' };
export function doctrineOf(houseId: string): Doctrine { return DOCTRINES[houseId] ?? FALLBACK; }
export function likelyStance(d: Doctrine): Stance { return (Object.entries(d.stance) as [Stance, number][]).sort((a, b) => b[1] - a[1])[0]![0]; }
/** The stance that beats this one. */
export function counterTo(s: Stance): Stance { return (Object.keys(BEATS) as Stance[]).find((k) => BEATS[k] === s)!; }

const GIVEN = ['Aster', 'Corven', 'Ysolde', 'Marrek', 'Tavin', 'Oriel', 'Daska', 'Bren', 'Lio', 'Hesk', 'Sabine', 'Torvald', 'Ilse', 'Cassian', 'Mireth', 'Doran', 'Quell', 'Varra', 'Ennis', 'Halvard', 'Senna', 'Rook', 'Thessaly', 'Garret', 'Wynn', 'Odile', 'Petra', 'Caius', 'Livia', 'Brannoc'];

export type PrizeKind = 'othes' | 'navisium' | 'components' | 'metals' | 'provisions' | 'caige' | 'relic';
/** A guest house's people, kept from year to year so they can be known, feared and met again. */
export interface Named { key: string; name: string; skill: number; duels: number; won: number; kills: number; since: number }
export interface Roster { marshal: Named; champion: Named; knight: number; checked?: number }

/** Someone who beat, wounded or killed one of ours: a score to settle. */
export interface Nemesis { victimId: string; foeKey: string; foeName: string; foeHouse: string; year: number; what: 'beat' | 'wounded' | 'killed'; settled?: boolean }

/** What the Marshal is told to do. */
export interface Plan { aim: Aim; counter?: string }

export interface Location { id: string; name: string; prize: PrizeKind; amount: number; holder?: string; glyph: string; x: number; y: number }

export interface Contingent {
  houseId: string;
  marshalId: string | null;
  championId: string | null;
  knights: string[];
  men: number;
  /** The Marshal's ship in orbit: one of ours, or a chartered transport. */
  shipId?: string;
  /** Guests: names only. */
  names?: { marshal: string; champion: string; knights: number };
  skill?: { marshal: number; champion: number; knight: number };
  /** Where the force stands now. */
  at?: string;
  out?: boolean;
  menLost: number;
}

export interface Battle {
  locationId: string;
  sides: string[];
  winner: string;
  losses: Record<string, number>;
  duel?: { a: string; b: string; winner: string; rematch?: boolean; avenged?: string };
  fallen: string[];
  wounded: string[];
  mvp?: string;
}

export interface Round { orbit: number; moves: Record<string, string>; stance: Record<string, Stance | undefined>; battles: Battle[]; taken: Record<string, string>; done: boolean }

export interface Standing { held: number; won: number; lost: number; menLost: number }

export interface CrucibleState {
  year: number;
  stage: 'quiet' | 'drawn' | 'campaign' | 'done';
  entrants: string[];
  contingents: Record<string, Contingent>;
  locations: Location[];
  rounds: Round[];
  table: Record<string, Standing>;
  history: { year: number; champion: string; runnerUp: string; heroId?: string; heroName?: string; drawn: string[] }[];
  /** Men each real house has lost and not yet replaced. */
  depleted: Record<string, number>;
  /** Whether the player was drawn this year. */
  drawnUs?: boolean;
  /** Guest houses' marshals and champions, year to year. */
  rosters?: Record<string, Roster>;
  nemeses?: Nemesis[];
  /** Our orders to the Marshal, set before sailing. */
  plan?: Plan;
  /** Houses our agents watched this year. */
  agents?: string[];
}

export function ensureCrucible(world: World): void {
  const old = world.crucible as unknown as { entrants?: string[]; depleted?: Record<string, number> } | undefined;
  if (old && old.entrants && old.depleted) { const c = world.crucible; c.rosters ??= {}; c.nemeses ??= []; c.agents ??= []; return; }
  world.crucible = { year: dateParts(world.date).year, stage: 'quiet', entrants: [], contingents: {}, locations: [], rounds: [], table: {}, history: [], depleted: {}, rosters: {}, nemeses: [], agents: [] };
}

export function houseLabel(world: World, id: string): string {
  return `House ${world.houses[id]?.name ?? GUEST_HOUSES.find((g) => g.id === id)?.name ?? id}`;
}

export function shortHouse(world: World, id: string): string {
  return world.houses[id]?.name ?? GUEST_HOUSES.find((g) => g.id === id)?.name ?? id;
}

/** Troops a house can raise: its garrisons, less what it has lost and not replaced. */
export function troopsOf(world: World, houseId: string): number {
  let base = 0;
  for (const p of Object.values(world.planets)) {
    if (p.houseId !== houseId) continue;
    for (const s of p.sectors) for (const q of s.quarters ?? []) {
      if (q.kind !== 'Military') continue;
      const m = /([\d,]+)\s/.exec(q.gives ?? '');
      base += m ? Number(m[1]!.replace(/,/g, '')) : 300;
    }
  }
  base = Math.max(base, 1200);
  return Math.max(0, base - (world.crucible?.depleted[houseId] ?? 0));
}

export function contingentPeople(c: Contingent | undefined): string[] {
  if (!c) return [];
  return [c.marshalId, c.championId, ...c.knights].filter((x): x is string => !!x);
}

export function eligible(world: World, houseId: string): Character[] {
  return Object.values(world.characters).filter((c) => c.alive && c.houseId === houseId && c.tier === 'full' && c.seat !== 'highroy'
    && ageOf(c, world.date) >= SPECIES[c.species].adulthood * 0.9 && !isAway(world, c.id));
}

export function marshalScore(c: Character): number { return (c.stats.tactics + c.stats.logistics + c.stats.siegecraft + c.stats.leadership) / 4; }
export function championScore(c: Character): number { return (c.stats.duelling + c.stats.reflexes + c.stats.valor + c.stats.agility) / 4; }
export function knightScore(c: Character): number { return (c.stats.duelling + c.stats.discipline + c.stats.strength) / 3; }

export function contingentCost(c: Pick<Contingent, 'men' | 'shipId'>): { othes: number; provisions: number; fuel: number } {
  return { othes: c.men * COST_PER_MAN + (c.shipId ? 0 : CHARTER_COST), provisions: COST_PROVISIONS, fuel: COST_FUEL };
}

export function cannotEnter(world: World, c: Contingent): string | null {
  const cr = world.crucible;
  const P = world.playerHouseId;
  if (cr.stage !== 'drawn' || !cr.entrants.includes(P)) return 'We are not drawn this year';
  if (cr.contingents[P]) return 'Our contingent has already sailed';
  if (!c.marshalId) return 'Name a Marshal';
  if (!c.championId) return 'Name a champion';
  if (c.knights.length > MAX_KNIGHTS) return `At most ${MAX_KNIGHTS} knights`;
  const ids = contingentPeople(c);
  if (new Set(ids).size !== ids.length) return 'Someone is named twice';
  const ok = new Set(eligible(world, P).map((x) => x.id));
  if (ids.some((id) => !ok.has(id))) return 'Someone named cannot go';
  if (c.men > troopsOf(world, P)) return `We can only raise ${fmt(troopsOf(world, P))} men`;
  const cost = contingentCost(c);
  const e = econ(world, P);
  const short = shortfallCost(world, P, cost);
  if (e.stock.othes < cost.othes + short) return `Needs ${fmt(cost.othes + short)} othes`;
  if (c.shipId) { const s = world.fleet?.ships[c.shipId]; if (!s || s.houseId !== P || s.lost || s.ready || s.arrives) return 'That ship cannot go'; }
  return null;
}

/** Othes to buy whatever provisions and fuel we lack, at the Exchange. */
export function shortfallCost(world: World, houseId: string, cost: { provisions: number; fuel: number }): number {
  const e = econ(world, houseId);
  const lackP = Math.max(0, cost.provisions - e.stock.provisions);
  const lackF = Math.max(0, cost.fuel - e.stock.fuel);
  return Math.round(lackP * buyPrice(world, houseId, 'provisions') + lackF * buyPrice(world, houseId, 'fuel'));
}

/** Men follow from knights: five hundred, less fifty for each knight. */
export function menFor(knights: number): number { return FORCE - knights * KNIGHT_WEIGHT; }

function pay(w: World, houseId: string, c: Contingent) {
  const cost = contingentCost(c);
  if (w.houses[houseId]) {
    // Buy what we lack first.
    const e = econ(w, houseId);
    if (e.stock.provisions < cost.provisions) tradeInPlace(w, houseId, 'provisions', Math.ceil(cost.provisions - e.stock.provisions));
    if (e.stock.fuel < cost.fuel) tradeInPlace(w, houseId, 'fuel', Math.ceil(cost.fuel - e.stock.fuel));
    record(w, houseId, { resource: 'othes', amount: -cost.othes, label: `The Crucible: ${c.men} men${c.shipId ? '' : ' and a chartered transport'}`, kind: 'mission' });
    record(w, houseId, { resource: 'provisions', amount: -cost.provisions, label: 'The Crucible: supplies', kind: 'mission' });
    record(w, houseId, { resource: 'fuel', amount: -cost.fuel, label: 'The Crucible: passage', kind: 'mission' });
  }
}

function commit(w: World, c: Contingent) {
  for (const id of contingentPeople(c)) {
    const p = w.characters[id];
    if (!p?.alive) continue;
    p.flags = p.flags.filter((f) => f.id !== 'crucible');
    p.flags.push({ id: 'crucible', since: w.date, detail: `fighting in ${BATTLE_WORLD}` });
  }
  const s = c.shipId ? w.fleet?.ships[c.shipId] : undefined;
  if (s) s.crucible = true;
}

export function enterCrucible(input: World, c: Contingent): World {
  const w = structuredClone(input);
  ensureCrucible(w);
  const P = w.playerHouseId;
  const why = cannotEnter(w, { ...c, men: menFor(c.knights.length) });
  if (why) throw new Error(why);
  const k: Contingent = { ...c, houseId: P, men: menFor(c.knights.length), menLost: 0 };
  pay(w, P, k);
  w.crucible.contingents[P] = k;
  commit(w, k);
  const m = w.characters[k.marshalId!]!;
  logRecord(w, {
    kind: 'world', type: 'politics', severity: 2,
    text: `Our contingent sails for ${BATTLE_WORLD}: ${shortName(w.characters[k.championId!]!.name)} as champion, ${k.knights.length} knights and ${k.men} men, with ${displayName(m.name)} as Marshal in orbit.`,
    who: contingentPeople(k).map((id) => ({ id, part: id === k.marshalId ? 'Marshal' : id === k.championId ? 'champion' : 'knight' })),
    effects: [`−${fmt(contingentCost(k).othes)} othes`, `−${COST_PROVISIONS} provisions`, `−${COST_FUEL} fuel`, 'Away until the Crucible ends'],
  });
  return w;
}

export function setStance(input: World, stance: Stance): World {
  const w = structuredClone(input);
  const r = currentRound(w);
  if (r) r.stance[w.playerHouseId] = stance;
  return w;
}

export function currentRound(world: World): Round | undefined {
  return world.crucible?.rounds.find((r) => !r.done);
}

// ---------------------------------------------------------------- the year

const SITES: [string, PrizeKind, string][] = [
  ['the Iron Foundry', 'components', 'F'], ['the Deep Wells', 'provisions', 'W'], ['the Navisium Seam', 'navisium', 'N'], ['the Old Treasury', 'othes', '$'],
  ['the Ore Terraces', 'metals', 'O'], ['the Sunken Vault', 'caige', 'C'], ['the Broken Spire', 'relic', 'R'], ['the Signal Tower', 'othes', 'T'],
  ['the Glass Basilica', 'relic', 'B'], ['the Fuel Depots', 'components', 'D'],
];

function draw(w: World, rng: Rng) {
  const year = dateParts(w.date).year;
  const P = w.playerHouseId;
  const real = Object.keys(w.houses).filter((h) => rng.chance(h === P ? 0.7 : 0.75));
  const n = 5 + Math.floor(rng.next() * 4);
  const guests = rng.shuffle([...GUEST_HOUSES]).slice(0, Math.max(0, n - real.length)).map((g) => g.id);
  const entrants = [...real, ...guests].slice(0, 8);
  const depleted = w.crucible.depleted;
  w.crucible = { ...w.crucible, year, stage: 'drawn', entrants, contingents: {}, locations: [], rounds: [], table: {}, drawnUs: entrants.includes(P), depleted, plan: undefined, agents: [] };
  for (const g of entrants) if (GUEST_HOUSES.some((x) => x.id === g)) rosterOf(w, rng, g);
  // The battle world's sites: two more than there are houses.
  const sites = rng.shuffle([...SITES]).slice(0, Math.min(SITES.length, entrants.length + 2));
  w.crucible.locations = sites.map(([name, prize, glyph], i) => ({
    id: `loc${i}`, name, prize, glyph,
    amount: prize === 'othes' ? 4000 + Math.round(rng.next() * 6000) : prize === 'caige' || prize === 'relic' ? 1 : 150 + Math.round(rng.next() * 250),
    x: 6 + (i % 5) * 14 + Math.round(rng.next() * 4), y: 2 + Math.floor(i / 5) * 6 + Math.round(rng.next() * 2),
  }));
  logRecord(w, {
    kind: 'world', type: 'politics', severity: entrants.includes(P) ? 2 : 1,
    text: `The draw for the Crucible of ${year}: ${entrants.map((h) => shortHouse(w, h)).join(', ')}.${entrants.includes(P) ? ` We are drawn. Our contingent must sail by Orbit ${CLOSES}.` : ' We are not drawn this year.'}`,
    detail: `Each house fields one champion and ${FORCE} men's worth of troops (a knight counts as ${KNIGHT_WEIGHT}), directed by a Marshal in orbit. They will fight over ${sites.length} sites on ${BATTLE_WORLD}.`,
    houseIds: entrants.filter((h) => w.houses[h]), source: 'the Numarade',
  });
  if (entrants.includes(P) && w.ports) w.ports.alerts += 1;
  // Old scores: whoever hurt one of ours, drawn again.
  if (entrants.includes(P)) for (const n of openNemeses(w)) {
    if (!entrants.includes(n.foeHouse) || !foeActive(w, n)) continue;
    const v = w.characters[n.victimId];
    logRecord(w, {
      kind: 'world', type: 'fight', severity: 2,
      text: `A rematch, perhaps: ${n.foeName} of ${shortHouse(w, n.foeHouse)}, who ${n.what === 'killed' ? 'killed' : n.what === 'wounded' ? 'wounded' : 'beat'} ${v ? displayName(v.name) : 'one of ours'} in ${n.year}, is drawn again.`,
      who: v ? [{ id: v.id, part: n.what === 'killed' ? 'fallen' : 'has a score to settle' }] : [], source: 'the Numarade',
    });
  }
}

// ---------------------------------------------------------------- rosters and old scores

const nk = (gid: string, name: string) => `g:${gid}:${name}`;

/** A guest house's people: the same faces year on year, until they retire or fall. */
export function rosterOf(w: World, rng: Rng, gid: string): Roster {
  const cr = w.crucible;
  cr.rosters ??= {};
  const guest = GUEST_HOUSES.find((g) => g.id === gid)!;
  const year = dateParts(w.date).year;
  const used = new Set(Object.values(cr.rosters).flatMap((r) => [r.marshal.name, r.champion.name]));
  const fresh = (base: number, spread: number): Named => {
    let name = '';
    for (let i = 0; i < 20 && (!name || used.has(name)); i++) name = displayName({ given: rng.pick(GIVEN), family: guest.name } as never);
    used.add(name);
    return { key: nk(gid, name), name, skill: (base + rng.next() * spread) * guest.might, duels: 0, won: 0, kills: 0, since: year };
  };
  let r = cr.rosters[gid];
  if (!r) { r = { marshal: fresh(9, 6), champion: fresh(9, 7), knight: (9 + rng.next() * 5) * guest.might, checked: year }; cr.rosters[gid] = r; return r; }
  if (r.checked === year) return r;
  r.checked = year;
  if (r.champion.since < 0) r.champion = fresh(9, 7); // fell last year
  else if (r.champion.since < year) {
    // A champion past their best steps aside; the young ones improve.
    const years = year - r.champion.since;
    if (years >= 4 && rng.chance(0.15 * (years - 3))) {
      logRecord(w, { kind: 'world', type: 'world', severity: 0, text: `${r.champion.name}, champion of House ${guest.name}, steps aside after ${years} years (${r.champion.won}–${r.champion.duels - r.champion.won} in Crucible duels).`, source: 'the Numarade' });
      r.champion = fresh(9, 7);
    } else r.champion.skill = Math.min(20 * guest.might, r.champion.skill + (years <= 2 ? 0.4 : -0.1));
  }
  return r;
}

export function openNemeses(world: World): Nemesis[] {
  return (world.crucible?.nemeses ?? []).filter((n) => !n.settled);
}

/** Whether the foe is still out there to be met. */
export function foeActive(world: World, n: Nemesis): boolean {
  if (!n.foeKey.startsWith('g:')) return !!world.characters[n.foeKey]?.alive;
  const r = world.crucible.rosters?.[n.foeHouse];
  return !!r && (r.champion.key === n.foeKey || r.marshal.key === n.foeKey);
}

function markNemesis(w: World, victimId: string, foeKey: string, foeName: string, foeHouse: string, what: Nemesis['what']) {
  const cr = w.crucible;
  cr.nemeses ??= [];
  const old = cr.nemeses.find((n) => !n.settled && n.victimId === victimId && n.foeKey === foeKey);
  const rank = { beat: 0, wounded: 1, killed: 2 };
  if (old) { if (rank[what] > rank[old.what]) { old.what = what; old.year = cr.year; } return; }
  cr.nemeses.push({ victimId, foeKey, foeName, foeHouse, year: cr.year, what });
  if (w.characters[foeKey] && w.characters[victimId]?.alive) shiftOpinion(w, victimId, foeKey, -15, `${what} them on ${BATTLE_WORLD}`);
}

// ---------------------------------------------------------------- preparing: reports and the plan

/** How well we know a drawn house: 0 (nothing) to 3 (their habits, their people, their numbers). */
export function intelOn(world: World, h: string): number {
  const P = world.playerHouseId;
  if (h === P) return 3;
  const spy = Object.values(world.characters).find((c) => c.alive && c.houseId === P && c.seat === 'spymaster');
  let n = spy ? (spy.stats.intrigue + spy.stats.insight) / 2 / 7 : 0.4;
  if (world.houses[h] && Object.values(world.embassies ?? {}).some((e) => e.host === h && e.guest === P && e.ambassadorId && world.characters[e.ambassadorId]?.alive)) n += 1;
  if ((world.crucible?.history ?? []).some((x) => x.drawn.includes(P) && x.drawn.includes(h))) n += 1;
  if (world.crucible?.agents?.includes(h)) n += 1;
  return clamp(Math.floor(n), 0, 3);
}

export const AGENTS_COST = 400;
export function cannotSendAgents(world: World, h: string): string | null {
  const cr = world.crucible;
  if (cr.stage !== 'drawn' || !cr.entrants.includes(world.playerHouseId)) return 'Only before we sail';
  if (cr.agents?.includes(h)) return 'Already watched';
  if (intelOn(world, h) >= 3) return 'We know all we can';
  if (econ(world, world.playerHouseId).stock.othes < AGENTS_COST) return 'Not enough othes';
  return null;
}

export function sendAgents(input: World, h: string): World {
  const w = structuredClone(input);
  ensureCrucible(w);
  const why = cannotSendAgents(w, h);
  if (why) throw new Error(why);
  record(w, w.playerHouseId, { resource: 'othes', amount: -AGENTS_COST, label: `Agents to watch ${houseLabel(w, h)} before the Crucible`, kind: 'court' });
  (w.crucible.agents ??= []).push(h);
  return w;
}

export function setPlan(input: World, plan: Plan): World {
  const w = structuredClone(input);
  ensureCrucible(w);
  w.crucible.plan = plan;
  return w;
}

/** Who a real house will likely send, judged as their own Marshal would. */
function projected(world: World, h: string): { marshal?: Character; champion?: Character; knights: number } {
  const pool = eligible(world, h);
  const marshal = [...pool].sort((a, b) => marshalScore(b) - marshalScore(a))[0];
  const champion = pool.filter((c) => c !== marshal).sort((a, b) => championScore(b) - championScore(a))[0];
  const d = doctrineOf(h);
  return { marshal, champion, knights: Math.min(pool.length - 2, Math.round((d.knights[0] + d.knights[1]) / 2)) };
}

export interface Report {
  houseId: string;
  level: number;
  doctrine?: Doctrine;
  marshal?: { id?: string; name: string; read: string };
  champion?: { id?: string; name: string; read: string; record: string };
  knights?: string;
  leaning?: string;
  /** Old scores with them. */
  scores: Nemesis[];
}

const band = (v: number) => (v >= 16 ? 'formidable' : v >= 13 ? 'strong' : v >= 10 ? 'able' : 'middling');

/** What our people can tell us about a drawn house before we sail. */
export function reportOn(world: World, h: string): Report {
  const level = intelOn(world, h);
  const d = doctrineOf(h);
  const scores = openNemeses(world).filter((n) => n.foeHouse === h && foeActive(world, n));
  const r: Report = { houseId: h, level, scores };
  if (level >= 1) r.doctrine = d;
  if (level >= 2) {
    const g = world.crucible.rosters?.[h];
    if (g) {
      r.marshal = { name: g.marshal.name, read: band(g.marshal.skill) };
      r.champion = { name: g.champion.name, read: band(g.champion.skill), record: g.champion.duels ? `${g.champion.won}–${g.champion.duels - g.champion.won} in Crucible duels${g.champion.kills ? `, ${g.champion.kills} killed` : ''}` : 'new to the Crucible' };
    } else {
      const p = projected(world, h);
      if (p.marshal) r.marshal = { id: p.marshal.id, name: displayName(p.marshal.name), read: band(marshalScore(p.marshal)) };
      if (p.champion) {
        const t = Object.values(world.careers?.of[p.champion.id] ?? {}).reduce((a, s) => ({ d: a.d + (s.cDuels ?? 0), w: a.w + (s.cDuelsWon ?? 0) }), { d: 0, w: 0 });
        r.champion = { id: p.champion.id, name: displayName(p.champion.name), read: band(championScore(p.champion)), record: t.d ? `${t.w}–${t.d - t.w} in Crucible duels` : 'new to the Crucible' };
      }
    }
    r.knights = `${d.knights[0]}–${d.knights[1]} knights, the rest in men`;
  }
  if (level >= 3) {
    const tot = d.stance.bold + d.stance.measured + d.stance.cunning;
    r.leaning = (Object.entries(d.stance) as [Stance, number][]).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${STANCE_LABEL[k]} ${Math.round((v / tot) * 100)}%`).join(' · ');
  }
  return r;
}

/** Our Marshal's stance against a house, from what we know of it: the better we know them, the surer the counter. */
function plannedStance(w: World, rng: Rng, foe: string | undefined): Stance {
  if (!foe) return 'measured';
  const lv = intelOn(w, foe);
  const sure = [0.3, 0.55, 0.75, 0.92][lv]!;
  return rng.chance(sure) ? counterTo(likelyStance(doctrineOf(foe))) : rng.pick(['bold', 'measured', 'cunning'] as Stance[]);
}

function aiContingent(w: World, rng: Rng, houseId: string): Contingent {
  const guest = GUEST_HOUSES.find((g) => g.id === houseId);
  const d = doctrineOf(houseId);
  const want = d.knights[0] + Math.floor(rng.next() * (d.knights[1] - d.knights[0] + 1));
  if (guest) {
    const r = rosterOf(w, rng, houseId);
    return {
      houseId, marshalId: null, championId: null, knights: [], men: menFor(want), menLost: 0,
      names: { marshal: r.marshal.name, champion: r.champion.name, knights: want },
      skill: { marshal: r.marshal.skill, champion: r.champion.skill, knight: r.knight },
    };
  }
  const pool = eligible(w, houseId);
  const taken = new Set<string>();
  const pick = (score: (c: Character) => number) => { const c = pool.filter((x) => !taken.has(x.id)).sort((a, b) => score(b) - score(a))[0]; if (c) taken.add(c.id); return c; };
  const marshal = pick(marshalScore);
  const champion = pick(championScore);
  const knights: Character[] = [];
  for (let i = 0; i < want; i++) { const k = pick(knightScore); if (k) knights.push(k); }
  const ship = Object.values(w.fleet?.ships ?? {}).find((s) => s.houseId === houseId && !s.lost && !s.ready && s.duty === 'harbour' && !s.arrives);
  const c: Contingent = { houseId, marshalId: marshal?.id ?? null, championId: champion?.id ?? null, knights: knights.map((k) => k.id), men: menFor(knights.length), shipId: ship?.id, menLost: 0 };
  const e = econ(w, houseId);
  const cost = contingentCost(c);
  e.stock.othes = Math.max(0, e.stock.othes - cost.othes);
  e.stock.provisions = Math.max(0, e.stock.provisions - cost.provisions);
  e.stock.fuel = Math.max(0, e.stock.fuel - cost.fuel);
  return c;
}

function land(w: World, rng: Rng) {
  const P = w.playerHouseId;
  const cr = w.crucible;
  if (cr.entrants.includes(P) && !cr.contingents[P]) {
    cr.entrants = cr.entrants.filter((h) => h !== P);
    const st = w.houses[P]!.standing;
    st.respect = clamp(st.respect - 4, 0, 100);
    st.honour = clamp(st.honour - 2, 0, 100);
    logRecord(w, { kind: 'world', type: 'politics', severity: 2, text: `We were drawn for the Crucible and sent no one. The houses will remember it.`, effects: ['Respect −4', 'Honour −2'] });
  }
  for (const h of cr.entrants) if (!cr.contingents[h]) { cr.contingents[h] = aiContingent(w, rng, h); commit(w, cr.contingents[h]!); }
  for (const h of cr.entrants) cr.table[h] = { held: 0, won: 0, lost: 0, menLost: 0 };
  cr.rounds = ROUND_ORBITS.map((orbit) => ({ orbit, moves: {}, stance: {}, battles: [], taken: {}, done: false }));
  cr.stage = 'campaign';
  logRecord(w, { kind: 'world', type: 'politics', severity: 1, text: `The contingents make landfall on ${BATTLE_WORLD}: ${cr.entrants.map((h) => shortHouse(w, h)).join(', ')}. The first battles are fought in Orbit ${ROUND_ORBITS[0]}.`, houseIds: cr.entrants.filter((h) => w.houses[h]) });
}

// ---------------------------------------------------------------- battle

function alive(w: World, ids: string[]): Character[] {
  return ids.map((id) => w.characters[id]).filter((c): c is Character => !!c?.alive && !c.flags.some((f) => f.id === 'wounded'));
}

function marshalOf(w: World, c: Contingent): number {
  if (c.skill) return c.skill.marshal;
  const m = c.marshalId ? w.characters[c.marshalId] : undefined;
  return m?.alive ? marshalScore(m) : 5;
}

function championOf(w: World, c: Contingent): { score: number; id?: string; name: string } | undefined {
  if (c.skill) return { score: c.skill.champion, name: c.names!.champion };
  const ch = c.championId ? w.characters[c.championId] : undefined;
  if (!ch?.alive || ch.flags.some((f) => f.id === 'wounded')) return undefined;
  return { score: championScore(ch), id: ch.id, name: displayName(ch.name) };
}

/** Fighting strength now. */
export function strengthOf(w: World, c: Contingent): number {
  const men = Math.max(0, c.men - c.menLost);
  const kn = c.skill ? (c.names?.knights ?? 0) * KNIGHT_WEIGHT * (c.skill.knight / 12) : alive(w, c.knights).reduce((n, k) => n + KNIGHT_WEIGHT * (knightScore(k) / 12), 0);
  return men + kn;
}

/** The Marshal's choice of where to strike. */
function chooseTarget(w: World, rng: Rng, h: string): string | undefined {
  const cr = w.crucible;
  const c = cr.contingents[h]!;
  const mine = cr.locations.filter((l) => l.holder === h);
  const value = (l: { prize: PrizeKind; amount: number }) => (l.prize === 'caige' ? 3 : l.prize === 'relic' ? 2.5 : l.prize === 'othes' ? l.amount / 3000 : l.amount / 150);
  const P = w.playerHouseId;
  const plan: Plan = h === P ? (cr.plan ?? { aim: 'hold' }) : { aim: doctrineOf(h).aim };
  const edge = h === P ? undefined : doctrineOf(h).edge;
  const options = cr.locations.map((l) => {
    const holder = l.holder ? cr.contingents[l.holder] : undefined;
    const risk = holder && l.holder !== h ? strengthOf(w, holder) / Math.max(1, strengthOf(w, c)) : 0.2;
    let keep = l.holder === h ? (mine.length <= 2 ? 1.5 : 0.6) : 1;
    let worth = value(l) + 1;
    if (plan.aim === 'riches') worth *= 1.6;
    if (plan.aim === 'hold' && l.holder === h) keep *= 1.8;
    if (plan.aim === 'bleed') {
      const prey = plan.counter ?? Object.keys(cr.table).filter((x) => x !== h).sort((a, b) => (cr.table[b]?.held ?? 0) - (cr.table[a]?.held ?? 0))[0];
      if (l.holder && l.holder === prey) worth *= 2.5;
    }
    if (edge === 'raid' && !l.holder) worth *= 1.5;
    return [l.id, Math.max(0.05, worth * keep / (0.5 + (edge === 'raid' ? risk * 1.5 : risk)))] as [string, number];
  });
  return options.length ? rng.weighted(options) : undefined;
}

function fightAt(w: World, rng: Rng, r: Round, loc: Location, sides: string[]): Battle {
  const cr = w.crucible;
  const P = w.playerHouseId;
  const score: Record<string, number> = {};
  const fallen: string[] = []; const wounded: string[] = [];
  // The champions meet first: the two strongest present.
  const champs = sides.map((h) => ({ h, c: championOf(w, cr.contingents[h]!) })).filter((x) => x.c)
    .map((x) => ({ ...x, c: { ...x.c!, score: x.c!.score + (x.h !== P && doctrineOf(x.h).edge === 'duel' ? 1.5 : 0) } }))
    .sort((a, b) => b.c!.score - a.c!.score);
  let duel: Battle['duel'];
  let duelWinner: string | undefined;
  if (champs.length >= 2) {
    const [x, y] = champs as [{ h: string; c: { score: number; id?: string; name: string } }, { h: string; c: { score: number; id?: string; name: string } }];
    const rx = x.c.score + rng.gauss() * 3;
    const ry = y.c.score + rng.gauss() * 3;
    const win = rx >= ry ? x : y;
    const lose = win === x ? y : x;
    duelWinner = win.h;
    duel = { a: x.c.id ?? x.c.name, b: y.c.id ?? y.c.name, winner: win.c.id ?? win.c.name };
    if (x.c.id) tally(w, x.c.id, 'cDuels');
    if (y.c.id) tally(w, y.c.id, 'cDuels');
    if (win.c.id) { tally(w, win.c.id, 'cDuelsWon'); addGlory(w, win.c.id, 1); seasoned(w, rng, win.c.id, true); }
    if (lose.c.id) seasoned(w, rng, lose.c.id, false);
    if (win.c.id && lose.c.id) shiftOpinion(w, lose.c.id, win.c.id, -10, `beat them on ${BATTLE_WORLD}`);
    const keyOf = (s: typeof x) => s.c.id ?? nk(s.h, s.c.name);
    let what: Nemesis['what'] = 'beat';
    if (lose.c.id) {
      const p = w.characters[lose.c.id]!;
      const roll = rng.next();
      if (roll < 0.02) { kill(w, p, w.date, `killed by ${win.c.name} on ${BATTLE_WORLD}`); fallen.push(p.id); what = 'killed'; }
      else if (roll < 0.25) { p.flags.push({ id: 'wounded', since: w.date, until: addCycles(w.date, 48) }); wounded.push(p.id); what = 'wounded'; lastingWound(w, rng, p.id, `in a champions' duel on ${BATTLE_WORLD}`); }
    } else if (rng.chance(0.02)) {
      // A guest champion can fall too; their house will find another.
      what = 'killed';
      const g = cr.rosters?.[lose.h];
      if (g && g.champion.name === lose.c.name) g.champion.since = -1;
    }
    // Guests keep their records.
    for (const s of [x, y]) {
      const g = cr.rosters?.[s.h];
      if (g && g.champion.name === s.c.name) { g.champion.duels++; if (s === win) { g.champion.won++; if (what === 'killed') g.champion.kills++; } }
    }
    // Old scores: settled, or new ones made.
    for (const n of openNemeses(w)) {
      const victimHere = [x, y].find((s) => s.c.id === n.victimId);
      const foeHere = [x, y].find((s) => keyOf(s) === n.foeKey);
      if (foeHere && victimHere) {
        duel.rematch = true;
        if (win === victimHere) { n.settled = true; duel.avenged = n.victimId; addGlory(w, n.victimId, 2); }
      } else if (foeHere && lose === foeHere && win.h === P && n.what === 'killed') {
        n.settled = true; duel.avenged = n.victimId; if (win.c.id) addGlory(w, win.c.id, 2);
      }
    }
    if (lose.h === P && lose.c.id) markNemesis(w, lose.c.id, keyOf(win), win.c.name, win.h, what);
  }
  // Stances: each side against the strongest of the others.
  for (const h of sides) {
    const c = cr.contingents[h]!;
    const st = r.stance[h]!;
    const foes = sides.filter((x) => x !== h);
    const main = foes.sort((a, b) => strengthOf(w, cr.contingents[b]!) - strengthOf(w, cr.contingents[a]!))[0]!;
    const edge = BEATS[st] === r.stance[main] ? 1.15 : BEATS[r.stance[main]!] === st ? 0.88 : 1;
    const defending = loc.holder === h ? (h !== P && doctrineOf(h).edge === 'defend' ? 1.2 : h === P && cr.plan?.aim === 'hold' ? 1.16 : 1.1) : 1;
    const studied = h === P && cr.plan?.counter && foes.includes(cr.plan.counter) ? 1.06 : 1;
    score[h] = (strengthOf(w, c) * (0.75 + marshalOf(w, c) / 40) * edge * defending * studied * (duelWinner === h ? 1.12 : 1)) * (0.85 + rng.next() * 0.3);
  }
  const order = [...sides].sort((a, b) => score[b]! - score[a]!);
  const winner = order[0]!;
  const losses: Record<string, number> = {};
  for (const h of sides) {
    const c = cr.contingents[h]!;
    const men = Math.max(0, c.men - c.menLost);
    const lost = Math.round(men * (h === winner ? 0.06 + rng.next() * 0.1 : 0.18 + rng.next() * 0.2));
    c.menLost += lost;
    losses[h] = lost;
    cr.table[h]!.menLost += lost;
    if (w.houses[h]) cr.depleted[h] = (cr.depleted[h] ?? 0) + lost;
    // Knights in the line: wounded about one in sixteen, killed rarely.
    for (const p of alive(w, c.knights)) {
      const id = p.id;
      tally(w, id, 'crucible');
      if (h === winner) { tally(w, id, 'crucibleWon'); addGlory(w, id, 1); }
      const roll = rng.next();
      if (roll < 0.006) { kill(w, p, w.date, `fell at ${loc.name} on ${BATTLE_WORLD}`); fallen.push(id); }
      else if (roll < 0.065) { p.flags.push({ id: 'wounded', since: w.date, until: addCycles(w.date, 48) }); wounded.push(id); lastingWound(w, rng, id, `at ${loc.name} on ${BATTLE_WORLD}`); }
      if (!fallen.includes(id)) seasoned(w, rng, id, h === winner);
    }
    if (c.championId) { tally(w, c.championId, 'crucible'); if (h === winner) tally(w, c.championId, 'crucibleWon'); }
    if (c.marshalId) { tally(w, c.marshalId, 'crucible'); if (h === winner) { tally(w, c.marshalId, 'crucibleWon'); addGlory(w, c.marshalId, 1); } }
    if (h === winner) cr.table[h]!.won++; else cr.table[h]!.lost++;
    // A force that cannot fight any more goes home.
    if (strengthOf(w, c) < 120 && !c.out) {
      c.out = true;
      if (h === P || w.houses[h]) logRecord(w, { kind: 'world', type: 'fight', severity: h === P ? 2 : 1, text: `${houseLabel(w, h)}'s contingent is broken at ${loc.name} and withdraws from ${BATTLE_WORLD}.`, houseIds: w.houses[h] ? [h] : [] });
    }
  }
  // Who stood out: the duel's victor if ours, else the winning side's best knight.
  const winC = cr.contingents[winner]!;
  const mvp = duelWinner === winner && winC.championId ? winC.championId : alive(w, winC.knights).sort((a, b) => knightScore(b) - knightScore(a))[0]?.id ?? winC.championId ?? undefined;
  if (mvp) { tally(w, mvp, 'cMvp'); addGlory(w, mvp, 2); }
  const winners = contingentPeople(winC);
  for (let i = 0; i < winners.length; i++) for (let j = i + 1; j < winners.length; j++) shiftBoth(w, winners[i]!, winners[j]!, 3, `fought together on ${BATTLE_WORLD}`);
  for (const h of sides) if (h !== winner && w.houses[h] && w.houses[winner]) shiftRelation(w, h, winner, -2);
  loc.holder = winner;
  return { locationId: loc.id, sides, winner, losses, duel, fallen, wounded, mvp };
}

function playRound(w: World, rng: Rng, r: Round) {
  const cr = w.crucible;
  const P = w.playerHouseId;
  const active = cr.entrants.filter((h) => cr.contingents[h] && !cr.contingents[h]!.out);
  for (const h of active) {
    const t = chooseTarget(w, rng, h);
    if (t) { r.moves[h] = t; cr.contingents[h]!.at = t; }
    if (h !== P) r.stance[h] ??= rng.weighted(Object.entries(doctrineOf(h).stance) as [Stance, number][]);
  }
  // Our Marshal, unless told otherwise, sets the stance against whoever holds the ground we go for.
  if (active.includes(P) && !r.stance[P]) {
    const target = cr.locations.find((l) => l.id === r.moves[P]);
    const foe = target?.holder && target.holder !== P ? target.holder : cr.plan?.counter;
    r.stance[P] = plannedStance(w, rng, foe);
  }
  for (const loc of cr.locations) {
    const here = active.filter((h) => r.moves[h] === loc.id);
    if (!here.length) continue;
    if (here.length === 1) {
      const h = here[0]!;
      if (loc.holder && loc.holder !== h && cr.contingents[loc.holder] && !cr.contingents[loc.holder]!.out) {
        // An absent holder's rearguard: taken, with a few losses.
        const c = cr.contingents[h]!;
        c.menLost += Math.round((c.men - c.menLost) * 0.04);
      }
      if (loc.holder !== h) r.taken[loc.id] = h;
      loc.holder = h;
      continue;
    }
    r.battles.push(fightAt(w, rng, r, loc, here));
  }
  for (const h of cr.entrants) cr.table[h]!.held = cr.locations.filter((l) => l.holder === h).length;
  r.done = true;
  // The house hears.
  for (const b of r.battles) {
    const ours = b.sides.includes(P);
    const loc = cr.locations.find((l) => l.id === b.locationId)!;
    const nameOf = (x: string) => (w.characters[x] ? displayName(w.characters[x]!.name) : x);
    logRecord(w, {
      kind: 'world', type: 'fight', severity: ours ? 2 : b.sides.some((h) => w.houses[h]) ? 1 : 0,
      text: `The Crucible, Orbit ${r.orbit}: ${houseLabel(w, b.winner)} took ${loc.name} from ${b.sides.filter((h) => h !== b.winner).map((h) => shortHouse(w, h)).join(' and ')}.${b.duel ? ` ${nameOf(b.duel.winner)} won the champions' duel${b.duel.rematch ? ', a rematch' : ''}.` : ''}${b.duel?.avenged && w.characters[b.duel.avenged] ? (b.duel.winner === b.duel.avenged ? ` ${shortName(w.characters[b.duel.avenged]!.name)} settles the score.` : ` ${displayName(w.characters[b.duel.avenged]!.name)} is avenged.`) : ''}`,
      detail: b.sides.map((h) => `${shortHouse(w, h)}: ${STANCE_LABEL[r.stance[h]!]}, lost ${b.losses[h]} men`).join('\n') + (b.fallen.length ? `\nFallen: ${b.fallen.map(nameOf).join(', ')}.` : '') + (b.wounded.length ? `\nWounded: ${b.wounded.map(nameOf).join(', ')}.` : ''),
      who: [...(b.mvp && w.characters[b.mvp] ? [{ id: b.mvp, part: 'best of the field' }] : []), ...b.fallen.map((id) => ({ id, part: 'fell' })), ...b.wounded.map((id) => ({ id, part: 'wounded' }))],
      houseIds: b.sides.filter((h) => w.houses[h]), source: BATTLE_WORLD,
    });
    // House fever.
    for (const c of Object.values(w.characters)) {
      if (!c.alive || c.tier !== 'full') continue;
      if (c.houseId === b.winner) shiftMood(c, 2);
      else if (b.sides.includes(c.houseId)) shiftMood(c, -1);
    }
  }
  const ourTake = Object.entries(r.taken).filter(([, h]) => h === P).map(([id]) => cr.locations.find((l) => l.id === id)!.name);
  if (ourTake.length) logRecord(w, { kind: 'world', type: 'fight', severity: 1, text: `The Crucible, Orbit ${r.orbit}: our contingent takes ${ourTake.join(' and ')} unopposed.` });
  if (active.includes(P) && w.ports) w.ports.alerts += 1;
}

function prizeText(l: Location): string {
  return l.prize === 'caige' ? 'a Caige' : l.prize === 'relic' ? 'a relic of the old wars' : `${fmt(l.amount)} ${l.prize}`;
}

function finish(w: World, rng: Rng) {
  const cr = w.crucible;
  const P = w.playerHouseId;
  const order = [...cr.entrants].sort((a, b) => cr.table[b]!.held - cr.table[a]!.held || cr.table[b]!.won - cr.table[a]!.won || cr.table[a]!.menLost - cr.table[b]!.menLost);
  const champ = order[0]!;
  const runner = order[1] ?? champ;
  // Prizes go to whoever holds each site at the end.
  for (const l of cr.locations) {
    const h = l.holder;
    if (!h || !w.houses[h]) continue;
    if (l.prize === 'caige') {
      const id = `cg${w.nextId++}`;
      w.armoury[id] = { id, name: `${rng.pick(['Vael', 'Ember', 'Sable', 'Hollow', 'Ash'])} ${rng.pick(['Psalm', 'Warden', 'Thorn', 'Choir', 'Lantern'])}`, type: rng.pick(['magnetic', 'gravitic', 'kinetic'] as never[]), band: rng.pick(['frostpoint', 'bluewake'] as never[]), houseId: h, found: w.date, foundAt: { planetId: 'crucible', sectorId: l.id }, stability: 70 } as never;
      storeInVault(w, w.armoury[id]!);
    } else if (l.prize === 'relic') {
      const st = w.houses[h]!.standing;
      st.respect = clamp(st.respect + 2, 0, 100);
    } else {
      record(w, h, { resource: l.prize as 'othes', amount: l.amount, label: `Prize of ${l.name}, ${BATTLE_WORLD}`, kind: 'mission' });
    }
  }
  const ours = cr.locations.filter((l) => l.holder === P);
  if (ours.length) logRecord(w, { kind: 'world', type: 'economy', severity: 2, text: `We come home from ${BATTLE_WORLD} holding ${ours.map((l) => l.name).join(', ')}.`, effects: ours.map((l) => `${l.name}: ${prizeText(l)}`) });
  // The victors.
  if (w.houses[champ]) {
    const st = w.houses[champ]!.standing;
    st.respect = clamp(st.respect + 6, 0, 100);
    st.dread = clamp(st.dread + 3, 0, 100);
    st.honour = clamp(st.honour + 2, 0, 100);
    for (const c of Object.values(w.characters)) if (c.alive && c.houseId === champ && c.tier === 'full') shiftMood(c, 8);
  }
  const winC = cr.contingents[champ];
  const year = cr.year;
  let heroId: string | undefined;
  let heroName: string | undefined;
  if (winC && !winC.skill) {
    for (const id of contingentPeople(winC)) if (w.characters[id]?.alive) award(w, id, `Victor of the Crucible, ${year}`);
    heroId = contingentPeople(winC).filter((id) => w.characters[id]?.alive).sort((a, b) => {
      const sa = w.careers?.of[a]?.[year]; const sb = w.careers?.of[b]?.[year];
      return ((sb?.cMvp ?? 0) * 3 + (sb?.cDuelsWon ?? 0)) - ((sa?.cMvp ?? 0) * 3 + (sa?.cDuelsWon ?? 0));
    })[0];
    if (heroId) award(w, heroId, `Hero of the Crucible, ${year}`);
  } else if (winC?.names) heroName = winC.names.champion;
  cr.history.push({ year, champion: champ, runnerUp: runner, heroId, heroName, drawn: [...cr.entrants] });
  logRecord(w, {
    kind: 'world', type: 'politics', severity: champ === P || cr.entrants.includes(P) ? 3 : 1,
    text: `${houseLabel(w, champ)} wins the Crucible of ${year}, holding ${cr.table[champ]!.held} of ${cr.locations.length} sites.${heroId ? ` ${displayName(w.characters[heroId]!.name)} is named Hero of the Crucible.` : heroName ? ` ${heroName} is named Hero of the Crucible.` : ''}`,
    detail: order.map((h, i) => `${i + 1}. ${shortHouse(w, h)}: ${cr.table[h]!.held} held, ${cr.table[h]!.won}–${cr.table[h]!.lost}, ${cr.table[h]!.menLost} men lost`).join('\n'),
    houseIds: cr.entrants.filter((h) => w.houses[h]), who: heroId ? [{ id: heroId, part: 'Hero of the Crucible' }] : [],
  });
  // Everyone comes home.
  for (const h of cr.entrants) {
    const c = cr.contingents[h];
    for (const id of contingentPeople(c)) { const p = w.characters[id]; if (p) p.flags = p.flags.filter((f) => f.id !== 'crucible'); }
    const s = c?.shipId ? w.fleet?.ships[c.shipId] : undefined;
    if (s) { delete s.crucible; s.condition = Math.max(30, s.condition - 10); }
  }
  cr.stage = 'done';
}

export function advanceCrucible(world: World, rng: Rng, phaseTurned: boolean): void {
  ensureCrucible(world);
  const cr = world.crucible;
  if (!phaseTurned) return;
  const d = dateParts(world.date);
  // Lost men are slowly replaced.
  if (d.phase === 1) for (const h of Object.keys(cr.depleted)) cr.depleted[h] = Math.max(0, Math.round(cr.depleted[h]! * 0.85) - 20);
  if (d.orbit === DRAW_ORBIT && d.phase === 1 && (cr.stage === 'quiet' || cr.stage === 'done' || cr.year !== d.year)) draw(world, rng);
  if (cr.stage === 'drawn' && d.orbit >= CLOSES) land(world, rng);
  if (cr.stage === 'campaign') {
    for (const r of cr.rounds) if (!r.done && r.orbit === d.orbit && d.phase === FIGHT_PHASE) playRound(world, rng, r);
    if (cr.rounds.every((r) => r.done) || cr.entrants.filter((h) => !cr.contingents[h]?.out).length <= 1) finish(world, rng);
  }
}

export function standings(world: World): string[] {
  const T = world.crucible.table;
  return Object.keys(T).sort((a, b) => T[b]!.held - T[a]!.held || T[b]!.won - T[a]!.won || T[a]!.menLost - T[b]!.menLost);
}
