// Dynamic lanes: everything the houses make, buy, sell and are granted actually travels. The Numarade's
// Navisium leaves the Reserve each Orbit for every capital; surpluses go out to the Exchange and
// shortfalls come back from it; free traders run ore out of the Outer Reach. Every run crosses a lane,
// and every lane has its dangers: corsair companies, storms, the customs posts of whoever's port it ends
// at. What is taken is really lost, and the market feels it.
//
// The player keeps a customs post (strict, fair or a blind eye), can buy passage from a corsair company,
// put a bounty on one, or give one letters against a rival. Our losses come through the Steward; other
// houses' through the Spymaster's people.
import { Rng } from './rng';
import { econ, quotaFor, record } from './economy';
import { logRecord } from './records';
import { relation, shiftRelation } from './relations';
import { seatHolder } from './query';
import { powerOf, type CapitalShip } from './fleet';
import { competence } from './reports';
import { advanceHunts, chronicle, isHostile, leaderFor, replenish, reveal, seedMembers, type CompanyLine, type Hunt, type Member } from './companies';
import { tally } from './careers';
import { absoluteCycle, addCycles, CYCLES_PER_ORBIT, CYCLES_PER_PHASE, CYCLES_PER_YEAR } from './time';
import { GOODS, RESOURCE_LABEL, type Good } from '../data/economy';
import type { World } from './types';
import type { GameDate } from './time';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const H = (w: World, id: string) => (id === 'free' ? 'a free trader' : `House ${w.houses[id]?.name ?? id}`);

// ---------------------------------------------------------------- geography

/** Places off the house worlds that the lanes still run to. */
export const OFFMAP: Record<string, { name: string; note: string }> = {
  reserve: { name: 'the Numarade Reserve', note: 'Where the Numarade keeps the Navisium it rations, and ships each house its quota under its own escort.' },
  exchange: { name: 'the Exchange Docks', note: 'The Imperial Exchange\'s yards: every sale and purchase is loaded or unloaded here.' },
  reach: { name: 'the Outer Reach', note: 'Ore claims, salvage and corsair ports past the charted lanes. Free traders run its ore inward.' },
};

export interface Lane { id: string; a: string; b: string; cycles: number; /** 0..1: how far from anyone's patrols. */ wild: number }

const CAPS = ['alerion-prime', 'serath-reach', 'shaaliin-lyreth', 'torvann-ashfall'];
const L = (a: string, b: string, cycles: number, wild: number): Lane => ({ id: [a, b].sort().join('~'), a, b, cycles, wild });
export const LANES: Lane[] = [
  L('alerion-prime', 'serath-reach', 6, 0.15),
  L('alerion-prime', 'shaaliin-lyreth', 8, 0.3),
  L('alerion-prime', 'torvann-ashfall', 10, 0.35),
  L('serath-reach', 'shaaliin-lyreth', 8, 0.3),
  L('serath-reach', 'torvann-ashfall', 10, 0.4),
  L('shaaliin-lyreth', 'torvann-ashfall', 10, 0.45),
  ...CAPS.map((c, i) => L(c, 'exchange', [6, 6, 8, 8][i]!, 0.15)),
  ...CAPS.map((c, i) => L(c, 'reserve', [6, 8, 8, 10][i]!, 0.1)),
  L('reach', 'torvann-ashfall', 10, 0.85),
  L('reach', 'shaaliin-lyreth', 12, 0.75),
  L('reach', 'exchange', 12, 0.8),
];
export const LANE_BY_ID: Record<string, Lane> = Object.fromEntries(LANES.map((l) => [l.id, l]));
export function laneBetween(a: string, b: string): Lane | undefined { return LANE_BY_ID[[a, b].sort().join('~')]; }

export function placeName(world: World, id: string): string {
  return OFFMAP[id]?.name ?? world.planets[id]?.name ?? id;
}
export function laneName(world: World, l: Lane): string {
  const n = (id: string) => (OFFMAP[id] ? OFFMAP[id]!.name.replace(/^the /, '') : world.planets[id]?.name ?? id);
  return `${n(l.a)}–${n(l.b)}`;
}

// ---------------------------------------------------------------- the companies

export type Temper = 'cruel' | 'ransom' | 'trader';
export interface Faction {
  id: string;
  name: string;
  temper: Temper;
  /** 10..95. */
  strength: number;
  /** How the company regards each house, -100..100. */
  rel: Record<string, number>;
  haunts: string[];
  /** Value taken, all told. */
  hauls: number;
  members: Member[];
  /** Every dealing we know of, newest first. */
  log: CompanyLine[];
  /** Houses that have declared them enemies. */
  hostile: string[];
}
export const TEMPER_NOTE: Record<Temper, string> = {
  cruel: 'Takes everything and leaves no one. Will not bargain for crews.',
  ransom: 'Takes the cargo and holds the crew for ransom.',
  trader: 'Takes the cargo, sets the crew adrift, and sells what it took through any port that will look away.',
};

export type Customs = 'strict' | 'fair' | 'blind';
export const CUSTOMS_LABEL: Record<Customs, string> = { strict: 'Strict', fair: 'Fair', blind: 'Blind eye' };
export const CUSTOMS_NOTE: Record<Customs, string> = {
  strict: 'Every hold opened. Contraband seized, corsair fences turned away. The companies hate it; the Numarade approves.',
  fair: 'The usual searches. Some contraband slips through.',
  blind: 'Our docks look away. The companies sell through us and pay a cut, and think better of us; if it gets out, our honour suffers.',
};

export type DealKind = 'passage' | 'marque' | 'bounty';
export interface Deal { id: string; faction: string; house: string; kind: DealKind; target?: string; since: GameDate }
export const PASSAGE = (f: Faction) => Math.round(200 + f.strength * 8);
export const MARQUE_COST = 2500;
export const BOUNTY_COST = 1000;

export interface Convoy {
  id: string;
  owner: string;
  kind: 'quota' | 'export' | 'import' | 'ore' | 'compact';
  /** For a run between houses: who bought it (the owner is the seller). */
  buyer?: string;
  good: Good;
  qty: number;
  value: number;
  from: string;
  to: string;
  lane: string;
  left: GameDate;
  arrives: GameDate;
  crew: number;
  escort?: string;
  contraband?: boolean;
  delayed?: boolean;
  fate?: 'arrived' | 'taken' | 'seized' | 'lost' | 'saved';
  by?: string;
  note?: string;
}

export interface CrewHold { id: string; faction: string; owner: string; crew: number; ransom: number; expires: GameDate; what: string }

export interface LanesState {
  convoys: Record<string, Convoy>;
  /** The last finished runs, newest first. */
  done: Convoy[];
  factions: Record<string, Faction>;
  customs: Record<string, Customs>;
  deals: Deal[];
  held: CrewHold[];
  /** Runs and losses per lane, decaying. */
  tally: Record<string, { runs: number; losses: number }>;
  /** Losses by house to each company in the last year: [factionId, absCycle]. */
  scars: Record<string, [string, number][]>;
  /** Trades made this turn, waiting to be loaded and shipped. */
  loading: Manifest[];
  /** Standing trade compacts between pairs of houses. */
  compacts: Compact[];
  /** Compacts another house has offered us. */
  offers: CompactOffer[];
  hunts: Hunt[];
}

export interface Manifest { owner: string; good: Good; qty: number; value: number; /** A sale to a compact partner: they bought it. */ buyer?: string }
export interface Compact { id: string; a: string; b: string; since: GameDate; /** Value traded, all told. */ traded: number; /** This Orbit, by house: what it sold and bought under the compact, in othes. */ orbit: Record<string, { sold: number; bought: number }> }
export interface CompactOffer { id: string; from: string; expires: GameDate }

const FACTIONS: Omit<Faction, 'rel' | 'members' | 'log' | 'hostile'>[] = [
  { id: 'tithe', name: 'the Red Tithe', temper: 'cruel', strength: 45, haunts: ['reach~torvann-ashfall', 'exchange~reach', 'reach~shaaliin-lyreth', 'shaaliin-lyreth~torvann-ashfall', 'serath-reach~torvann-ashfall'], hauls: 0 },
  { id: 'hollow', name: 'the Hollow Fleet', temper: 'ransom', strength: 50, haunts: ['serath-reach~shaaliin-lyreth', 'exchange~shaaliin-lyreth', 'alerion-prime~shaaliin-lyreth', 'reach~shaaliin-lyreth', 'alerion-prime~torvann-ashfall'], hauls: 0 },
  { id: 'ninefold', name: 'the Ninefold Company', temper: 'trader', strength: 40, haunts: ['alerion-prime~exchange', 'exchange~serath-reach', 'exchange~reach', 'alerion-prime~serath-reach', 'exchange~torvann-ashfall'], hauls: 0 },
];

function aiCustoms(world: World, houseId: string): Customs {
  const p = world.houses[houseId]!.personality;
  return p.honour > 0.6 ? 'strict' : p.greed > 0.6 ? 'blind' : 'fair';
}

export function ensureLanes(world: World): void {
  world.lanes ??= { convoys: {}, done: [], factions: {}, customs: {}, deals: [], held: [], tally: {}, scars: {}, loading: [], compacts: [], offers: [], hunts: [] };
  const s = world.lanes;
  s.convoys ??= {}; s.done ??= []; s.factions ??= {}; s.customs ??= {}; s.deals ??= []; s.held ??= []; s.tally ??= {}; s.scars ??= {};
  s.loading ??= []; s.compacts ??= []; s.offers ??= []; s.hunts ??= [];
  for (const f of FACTIONS) s.factions[f.id] ??= { ...f, haunts: [...f.haunts], rel: {}, members: [], log: [], hostile: [] };
  for (const f of Object.values(s.factions)) { f.log ??= []; f.hostile ??= []; f.members ??= []; seedMembers(world, f); }
  for (const id of Object.keys(world.houses)) {
    s.customs[id] ??= id === world.playerHouseId ? 'fair' : aiCustoms(world, id);
    for (const f of Object.values(s.factions)) f.rel[id] ??= s.customs[id] === 'blind' ? 15 : s.customs[id] === 'strict' ? -15 : 0;
  }
}

const dealOf = (world: World, f: string, house: string, kind: DealKind) => world.lanes.deals.find((d) => d.faction === f && d.house === house && d.kind === kind);
const marquesAgainst = (world: World, f: string, target: string) => world.lanes.deals.filter((d) => d.faction === f && d.kind === 'marque' && d.target === target);

// ---------------------------------------------------------------- risk

function patrolsOn(world: World, lane: Lane): number {
  const planets = new Set([lane.a, lane.b]);
  return Object.values(world.fleet?.ships ?? {}).filter((s) => !s.lost && !s.arrives && !s.ready && s.duty === 'patrol' && [...planets].some((p) => world.planets[p]?.sectors.some((x) => x.id === s.sectorId))).length;
}

/** The chance a company strikes one run of this house's on this lane. */
export function factionOdds(world: World, f: Faction, lane: Lane, owner: string, quota = false, escorted = false): number {
  let p = (0.014 + lane.wild * 0.08) * (f.strength / 50) * (f.haunts.includes(lane.id) ? 1 : 0.25);
  if (owner !== 'free') {
    if (dealOf(world, f.id, owner, 'passage')) p *= 0.15;
    if (marquesAgainst(world, f.id, owner).length) p *= 2.5;
    if (dealOf(world, f.id, owner, 'bounty')) p *= 1.4;
    const r = f.rel[owner] ?? 0;
    p *= r <= -40 ? 1.4 : r >= 40 ? 0.7 : 1;
    if (isHostile(world, f, owner)) p *= 1.15;
  }
  p *= Math.pow(0.7, Math.min(3, patrolsOn(world, lane)));
  if (quota) p *= 0.5;
  if (escorted) p *= 0.5;
  return p;
}

/** All companies together, for one unescorted run of ours. */
export function laneRisk(world: World, lane: Lane, owner = world.playerHouseId): number {
  return 1 - Object.values(world.lanes?.factions ?? {}).reduce((q, f) => q * (1 - factionOdds(world, f, lane, owner)), 1);
}

// ---------------------------------------------------------------- traffic

function escortFor(world: World, owner: string): CapitalShip | undefined {
  if (owner === 'free') return undefined;
  const busy = new Map<string, number>();
  for (const c of Object.values(world.lanes.convoys)) if (c.escort) busy.set(c.escort, (busy.get(c.escort) ?? 0) + 1);
  return Object.values(world.fleet?.ships ?? {})
    .filter((s) => s.houseId === owner && s.duty === 'escort' && !s.lost && !s.arrives && !s.ready && !s.crucible && (busy.get(s.id) ?? 0) < 2)
    .sort((a, b) => (busy.get(a.id) ?? 0) - (busy.get(b.id) ?? 0))[0];
}

function launch(world: World, rng: Rng, c: Omit<Convoy, 'id' | 'lane' | 'left' | 'arrives' | 'value' | 'escort'> & { value?: number }): Convoy | undefined {
  const lane = laneBetween(c.from, c.to);
  if (!lane || c.qty <= 0) return undefined;
  const price = world.economy?.market[c.good]?.price ?? 10;
  const cv: Convoy = { ...c, id: `cv${world.nextId++}`, lane: lane.id, left: world.date, arrives: addCycles(world.date, lane.cycles + rng.int(0, 2) * 2), value: Math.round(c.value ?? c.qty * price) };
  const esc = escortFor(world, c.owner);
  if (esc) cv.escort = esc.id;
  world.lanes.convoys[cv.id] = cv;
  return cv;
}

/**
 * Every trade at the Exchange is a shipment: a sale is loaded and sent to the Exchange Docks, a purchase
 * is sent back from them. Trades made in the same turn by the same house in the same good go together.
 */
function ship(world: World, rng: Rng) {
  const groups = new Map<string, Manifest>();
  for (const m of world.lanes.loading) {
    const k = `${m.owner}|${m.good}|${Math.sign(m.qty)}|${m.buyer ?? ''}`;
    const g = groups.get(k);
    if (g) { g.qty += m.qty; g.value += m.value; } else groups.set(k, { ...m });
  }
  world.lanes.loading = [];
  for (const m of groups.values()) {
    const h = world.houses[m.owner];
    if (!h || !m.qty) continue;
    if (m.buyer) {
      launch(world, rng, { owner: m.owner, buyer: m.buyer, kind: 'compact', good: m.good, qty: Math.abs(m.qty), value: m.value, from: h.capitalPlanetId, to: world.houses[m.buyer]!.capitalPlanetId, crew: rng.int(10, 26) });
      continue;
    }
    const sell = m.qty < 0;
    launch(world, rng, {
      owner: m.owner, kind: sell ? 'export' : 'import', good: m.good, qty: Math.abs(m.qty), value: m.value,
      from: sell ? h.capitalPlanetId : 'exchange', to: sell ? 'exchange' : h.capitalPlanetId, crew: rng.int(10, 30),
      contraband: rng.chance(0.04 * (1 + h.personality.greed)),
    });
  }
}

/** The free traders' runs, each Phase. */
function generate(world: World, rng: Rng) {
  // Free traders: ore and salvage out of the Reach, goods back and forth through the Exchange.
  const runs = rng.int(1, 3);
  for (let i = 0; i < runs; i++) {
    const fromReach = rng.chance(0.5);
    const g: Good = fromReach ? rng.pick(['metals', 'metals', 'components', 'fuel'] as const) : rng.pick(GOODS);
    const to = fromReach ? rng.pick(['torvann-ashfall', 'shaaliin-lyreth', 'exchange']) : rng.pick(CAPS);
    const value = rng.int(1500, 6000);
    const price = world.economy?.market[g]?.price ?? 10;
    launch(world, rng, { owner: 'free', kind: 'ore', good: g, qty: Math.max(1, Math.round(value / price)), from: fromReach ? 'reach' : 'exchange', to, crew: rng.int(8, 20), contraband: rng.chance(0.15) });
  }
}

function shipQuotas(world: World, rng: Rng) {
  for (const h of Object.values(world.houses)) {
    const q = quotaFor(world, h.id);
    econ(world, h.id).quota = q;
    launch(world, rng, { owner: h.id, kind: 'quota', good: 'navisium', qty: q, from: 'reserve', to: h.capitalPlanetId, crew: 40 });
  }
}

export function convoyLabel(world: World, c: Convoy): string {
  const g = RESOURCE_LABEL[c.good].toLowerCase();
  if (c.kind === 'compact') {
    const nm = (h: string) => (h === world.playerHouseId ? 'our' : `the ${world.houses[h]?.name ?? ''}`);
    return c.buyer === world.playerHouseId ? `the ${world.houses[c.owner]?.name} ${g} bound for us` : c.owner === world.playerHouseId ? `our ${g} bound for ${world.houses[c.buyer!]?.name}` : `${nm(c.owner)} ${g} bound for ${world.houses[c.buyer!]?.name}`;
  }
  if (c.owner === world.playerHouseId) return c.kind === 'quota' ? 'our Navisium quota' : `our ${g} convoy`;
  if (c.kind === 'quota') return `the Navisium quota for ${H(world, c.owner)}`;
  if (c.owner === 'free') return `a free trader's ${g} run`;
  const n = world.houses[c.owner]?.name ?? '';
  return `${/^[AEIOU]/.test(n) ? 'an' : 'a'} ${n} ${g} convoy`;
}

// ---------------------------------------------------------------- what happens on the way

function finish(world: World, c: Convoy, fate: NonNullable<Convoy['fate']>, by?: string, note?: string) {
  c.fate = fate; c.by = by; c.note = note;
  delete world.lanes.convoys[c.id];
  world.lanes.done.unshift(c);
  world.lanes.done = world.lanes.done.slice(0, 60);
  const t = (world.lanes.tally[c.lane] ??= { runs: 0, losses: 0 });
  t.runs++;
  if (fate === 'taken' || fate === 'lost' || fate === 'seized') t.losses++;
}

/** The owner loses what was aboard: an export's goods or an import's purchase, Navisium from the quota. */
function lose(world: World, c: Convoy, label: string) {
  if (c.owner === 'free') return;
  if (c.kind === 'export') {
    record(world, c.owner, { resource: 'othes', amount: -Math.min(Math.max(0, econ(world, c.owner).stock.othes), c.value), label: `${label}: the sale never paid`, kind: 'raid' });
  } else if (c.kind === 'compact' && c.buyer) {
    const take = Math.min(Math.max(0, econ(world, c.buyer).stock[c.good]), c.qty);
    record(world, c.buyer, { resource: c.good, amount: -take, label, kind: 'raid' });
  } else if (c.kind === 'import') {
    const take = Math.min(Math.max(0, econ(world, c.owner).stock[c.good]), c.qty);
    record(world, c.owner, { resource: c.good, amount: -take, label, kind: 'raid' });
  }
  // A lost quota simply never arrives.
  const m = world.economy?.market[c.good];
  if (m) m.pressure += c.qty * 0.6;
}

function deliver(world: World, c: Convoy) {
  if (c.kind === 'quota') record(world, c.owner, { resource: 'navisium', amount: c.qty, label: 'Numarade quota, landed', kind: 'quota' });
  finish(world, c, 'arrived');
}

function steward(world: World) { return seatHolder(world, world.playerHouseId, 'steward'); }

function pirates(world: World, rng: Rng, c: Convoy, f: Faction, lane: Lane) {
  const P = world.playerHouseId;
  const victim = c.buyer ?? c.owner;
  const ours = c.owner === P || c.buyer === P;
  const where = laneName(world, lane);
  const ship = c.escort ? world.fleet?.ships[c.escort] : undefined;
  const boss = leaderFor(f, rng);
  // Someone aboard knew the face: we learn who led it, now and then.
  const named = (why: string) => {
    if (!ours || !boss) return '';
    if (!boss.known && rng.chance(0.3 + competence(world, 'spymaster') * 0.015)) { reveal(boss, why); chronicle(world, f, `We learned the name of ${boss.name}, ${boss.role} of ${f.name}${boss.ship ? `, who sails the ${boss.ship}` : ''}.`); }
    return boss.known ? `, led by ${boss.name}${boss.ship ? ` of the ${boss.ship}` : ''}` : '';
  };
  if (ship && !ship.lost) {
    const force = f.strength * 0.5 + (boss ? (boss.skill - 12) * 0.8 : 0) + rng.gauss() * 8;
    const ours2 = powerOf(world, ship) * (isHostile(world, f, ship.houseId) ? 1.25 : 1) + rng.gauss() * 6;
    ship.condition = clamp(ship.condition - rng.int(4, 14), 5, 100);
    if (ours2 >= force) {
      f.strength = clamp(f.strength - 3, 10, 95);
      f.rel[c.owner] = clamp((f.rel[c.owner] ?? 0) - 4, -100, 100);
      const cap = ship.captainId ? world.characters[ship.captainId] : undefined;
      if (ours) {
        const by = named(`Beat off by the ${ship.name} on the ${where} lane.`);
        if (cap) tally(world, cap.id, 'raidsRepelled');
        if (isHostile(world, f, P) && rng.chance(0.3)) world.houses[P]!.standing.respect = clamp(world.houses[P]!.standing.respect + 1, 0, 100);
        chronicle(world, f, `The ${ship.name} drove them off our ${RESOURCE_LABEL[c.good].toLowerCase()} convoy on the ${where} lane${by}.`);
        logRecord(world, { kind: 'world', type: 'raid', severity: 1, seat: 'grandMaster', houseIds: [P], text: `The ${ship.name} drove ${f.name}${by} off our ${RESOURCE_LABEL[c.good].toLowerCase()} convoy on the ${where} lane.`, who: cap ? [{ id: cap.id, part: 'commanded the escort' }] : [], effects: ['Cargo saved'] });
      }
      finish(world, c, 'saved', f.id, `escort ${ship.name} drove off ${f.name}`);
      return;
    }
    ship.condition = clamp(ship.condition - rng.int(10, 20), 5, 100);
    ship.crewMood = clamp(ship.crewMood - 8, 0, 100);
  }
  // Taken.
  if (boss) boss.takes++;
  f.hauls += c.value;
  f.strength = clamp(f.strength + 1 + c.value / 6000, 10, 95);
  const label = `Taken by ${f.name} on the ${where} lane`;
  lose(world, c, label);
  if (victim !== 'free') (world.lanes.scars[victim] ??= []).push([f.id, absoluteCycle(world.date)]);
  let crewFate = '';
  let held: CrewHold | undefined;
  if (f.temper === 'cruel') crewFate = c.crew > 0 ? `everyone aboard killed (${c.crew})` : 'the ship burned';
  else if (f.temper === 'trader') crewFate = 'the crew set adrift in the boats';
  else {
    crewFate = 'the crew held for ransom';
    if (victim !== 'free') {
      held = { id: `ch${world.nextId++}`, faction: f.id, owner: victim, crew: c.crew, ransom: Math.round(c.crew * 50 + c.value * 0.08), expires: addCycles(world.date, CYCLES_PER_PHASE * 2), what: convoyLabel(world, c) };
      world.lanes.held.push(held);
    }
  }
  // Fenced through a blind-eyed port, and privateers' shares.
  for (const [h, cu] of Object.entries(world.lanes.customs)) {
    if (h === c.owner || h === victim || cu !== 'blind' || isHostile(world, f, h) || (f.temper !== 'trader' && (f.rel[h] ?? 0) < 30)) continue;
    const cut = Math.round(c.value * 0.1);
    record(world, h, { resource: 'othes', amount: cut, label: `Fencing fees: ${f.name}`, kind: 'port' });
    break;
  }
  for (const d of marquesAgainst(world, f.id, victim)) {
    const share = Math.round(c.value * 0.25);
    record(world, d.house, { resource: 'othes', amount: share, label: `Privateers' share: ${f.name}`, kind: 'raid' });
    if (d.house === P) logRecord(world, { kind: 'world', type: 'intrigue', severity: 1, seat: 'spymaster', houseIds: [P, c.owner], text: `Under our letters, ${f.name} took ${convoyLabel(world, c)} on the ${where} lane. Our fourth has come in by a quiet hand.`, effects: [`+${fmt(share)} othes`] });
    chronicle(world, f, `Under our letters they took ${convoyLabel(world, c)} on the ${where} lane.`);
    exposure(world, rng, d, victim);
  }
  // Who hears of it.
  const what = convoyLabel(world, c);
  const val = `${fmt(c.qty)} ${RESOURCE_LABEL[c.good].toLowerCase()}, about ${fmt(c.value)} othes`;
  if (ours) {
    const st = steward(world);
    const by = named(`Led the taking of ${what} on the ${where} lane.`);
    chronicle(world, f, `They took ${what} on the ${where} lane${by}: ${crewFate}.`);
    logRecord(world, { kind: 'world', type: 'raid', severity: 2, seat: 'steward', houseIds: [P], placeId: undefined,
      text: `${what[0]!.toUpperCase() + what.slice(1)} was taken by ${f.name}${by} on the ${where} lane: ${crewFate}.`,
      effects: [`Lost ${val}`], detail: held ? `They will give the crew back for ${fmt(held.ransom)} othes.` : ship ? `The ${ship.name} could not hold them off.` : 'It sailed without an escort.',
      quote: st ? { from: st.id, text: c.kind === 'quota' ? 'The whole quota, my lord. The Numarade will not grant it twice.' : ship ? 'Even with an escort. They are getting bolder.' : 'An escort costs less than this. I have said so before.' } : undefined,
      who: st ? [{ id: st.id, part: 'brought the news' }] : [] });
  } else if (victim !== 'free' && !marquesAgainst(world, f.id, victim).some((d) => d.house === P)) {
    const grave = f.temper === 'cruel' && c.crew > 0;
    chronicle(world, f, `Took ${what} on the ${where} lane: ${crewFate}.`, false);
    logRecord(world, { kind: 'world', type: 'raid', severity: grave && c.value >= 4000 ? 2 : 1, seat: 'spymaster', houseIds: [c.owner],
      text: `${what[0]!.toUpperCase() + what.slice(1)} was ${grave ? 'taken whole' : 'taken'} on the ${where} lane by ${f.name}: ${crewFate}.`,
      effects: [`${H(world, victim)} lost ${val}`], source: 'our agents on the docks' });
  } else if (rng.chance(0.25)) {
    logRecord(world, { kind: 'world', type: 'raid', severity: 1, seat: 'spymaster', text: `A free trader's ${RESOURCE_LABEL[c.good].toLowerCase()} run was taken on the ${where} lane by ${f.name}.`, source: 'dockside talk' });
  }
  finish(world, c, 'taken', f.id, crewFate);
}

/** A privateer's letters can be traced back to the house that wrote them. */
function exposure(world: World, rng: Rng, d: Deal, victim: string) {
  const P = world.playerHouseId;
  const sharp = victim === P ? competence(world, 'spymaster') : 10;
  if (!rng.chance(0.06 + sharp * 0.006)) return;
  const st = world.houses[d.house]!.standing;
  st.honour = clamp(st.honour - 4, 0, 100);
  st.respect = clamp(st.respect - 2, 0, 100);
  shiftRelation(world, victim, d.house, -25);
  for (const o of Object.keys(world.houses)) if (o !== victim && o !== d.house) shiftRelation(world, o, d.house, -4);
  const f = world.lanes.factions[d.faction]!;
  logRecord(world, { kind: 'world', type: 'politics', severity: 2, seat: victim === P ? 'spymaster' : d.house === P ? 'envoy' : 'spymaster', houseIds: [d.house, victim],
    text: victim === P ? `${H(world, d.house)} gave ${f.name} letters against us. Our agents have the proof.` : d.house === P ? `It is out: ${H(world, victim)} knows we gave ${f.name} letters against them.` : `${H(world, d.house)} has been paying ${f.name} to hunt ${H(world, victim)}'s convoys, and it is out.`,
    effects: [`${H(world, d.house)}: honour −4, respect −2`, `${H(world, victim)} regard −25`] });
}

function customsAt(world: World, rng: Rng, c: Convoy): boolean {
  const H2 = world.planets[c.to]?.houseId;
  if (!H2 || H2 === c.owner || c.kind === 'compact') return false;
  const P = world.playerHouseId;
  const cu = world.lanes.customs[H2] ?? 'fair';
  const catchP = c.contraband ? (cu === 'strict' ? 0.7 : cu === 'fair' ? 0.35 : 0.05) : 0;
  const dispute = c.owner !== 'free' && relation(world, H2, c.owner) < -30 && rng.chance(cu === 'strict' ? 0.15 : cu === 'fair' ? 0.06 : 0);
  if (!(catchP && rng.chance(catchP)) && !dispute) return false;
  const smuggled = !dispute;
  const take = Math.round(c.qty * (smuggled ? 0.5 : 1));
  record(world, H2, { resource: c.good, amount: take, label: `Seized by our customs`, kind: 'port' });
  if (c.owner !== 'free') {
    lose(world, { ...c, qty: take, value: Math.round(c.value * take / c.qty) }, `Seized by ${H(world, H2)}'s customs`);
    shiftRelation(world, c.owner, H2, -6);
    if (smuggled) world.houses[c.owner]!.standing.honour = clamp(world.houses[c.owner]!.standing.honour - 1, 0, 100);
  }
  const g = RESOURCE_LABEL[c.good].toLowerCase();
  const port = world.planets[c.to]!.name;
  if (H2 === P && (c.owner !== 'free' || rng.chance(0.3))) {
    logRecord(world, { kind: 'world', type: 'economy', severity: 1, seat: 'steward', houseIds: [P, ...(c.owner !== 'free' ? [c.owner] : [])],
      text: `Our customs at ${port} seized ${fmt(take)} ${g} from ${convoyLabel(world, c)}${smuggled ? ': there was contraband under the manifest' : ' over unpaid duties'}.`,
      effects: [`+${fmt(take)} ${g}`, ...(c.owner !== 'free' ? [`${H(world, c.owner)} regard −6`] : [])] });
  } else if (c.owner === P) {
    logRecord(world, { kind: 'world', type: 'economy', severity: 2, seat: 'steward', houseIds: [P, H2],
      text: `${H(world, H2)}'s customs at ${port} seized ${fmt(take)} ${g} from our convoy${smuggled ? ': someone aboard was carrying contraband' : ', over duties they say we owe'}.`,
      effects: [`−${fmt(take)} ${g}`, ...(smuggled ? ['Honour −1'] : [])] });
  }
  finish(world, c, 'seized', H2, smuggled ? 'contraband found' : 'duties dispute');
  return true;
}

function arrive(world: World, rng: Rng, c: Convoy) {
  const lane = LANE_BY_ID[c.lane]!;
  const P = world.playerHouseId;
  // Weather and wear.
  if (!c.delayed && rng.chance(0.03 + lane.wild * 0.02)) {
    c.delayed = true;
    c.arrives = addCycles(world.date, rng.int(2, 5) * 2);
    if (c.owner === P && c.kind === 'quota') logRecord(world, { kind: 'world', type: 'economy', severity: 0, seat: 'steward', houseIds: [P], text: `The quota convoy is held up on the ${laneName(world, lane)} lane: drive trouble. It will be late.` });
    return;
  }
  if (rng.chance(0.004 * (1 + lane.wild * 2))) {
    lose(world, c, `Lost without trace on the ${laneName(world, lane)} lane`);
    if (c.owner === P) logRecord(world, { kind: 'world', type: 'raid', severity: 2, seat: 'steward', houseIds: [P], text: `${convoyLabel(world, c)[0]!.toUpperCase() + convoyLabel(world, c).slice(1)} never arrived. No wreck, no word: lost on the ${laneName(world, lane)} lane with ${c.crew} aboard.`, effects: [`Lost about ${fmt(c.value)} othes`] });
    finish(world, c, 'lost', undefined, 'no word');
    return;
  }
  // Corsairs.
  const factions = Object.values(world.lanes.factions);
  const odds = factions.map((f) => [f, factionOdds(world, f, lane, c.owner, c.kind === 'quota', !!c.escort)] as const);
  const any = 1 - odds.reduce((q, [, p]) => q * (1 - p), 1);
  if (rng.chance(any)) {
    const f = rng.weighted(odds.map(([f, p]) => [f, p] as const));
    pirates(world, rng, c, f, lane);
    return;
  }
  if (customsAt(world, rng, c)) return;
  deliver(world, c);
}

// ---------------------------------------------------------------- house to house

export const compactOf = (world: World, a: string, b: string) => world.lanes?.compacts.find((c) => (c.a === a && c.b === b) || (c.a === b && c.b === a));
export const partnersOf = (world: World, h: string) => (world.lanes?.compacts ?? []).filter((c) => c.a === h || c.b === h).map((c) => (c.a === h ? c.b : c.a));

function signCompact(world: World, a: string, b: string, how: string) {
  if (compactOf(world, a, b)) return;
  world.lanes.compacts.push({ id: `tc${world.nextId++}`, a, b, since: world.date, traded: 0, orbit: {} });
  world.lanes.offers = world.lanes.offers.filter((o) => !((o.from === a && b === world.playerHouseId) || (o.from === b && a === world.playerHouseId)));
  const P = world.playerHouseId;
  logRecord(world, { kind: 'world', type: 'politics', severity: 1, seat: a === P || b === P ? 'envoy' : undefined, houseIds: [a, b], text: a === P || b === P ? `We have a trade compact with ${H(world, a === P ? b : a)}: ${how}` : `${H(world, a)} and ${H(world, b)} have signed a trade compact.` });
}

/** Each Orbit: compacts are made and broken, and our Steward says what ours came to. */
function compactsOrbit(world: World, rng: Rng) {
  const P = world.playerHouseId;
  const s = world.lanes;
  for (const cp of [...s.compacts]) {
    const other = cp.a === P ? cp.b : cp.b === P ? cp.a : undefined;
    if (other) {
      const o = cp.orbit[P];
      if (o && (o.sold || o.bought)) logRecord(world, { kind: 'world', type: 'economy', severity: 1, seat: 'steward', houseIds: [P, other], text: `Under the compact with ${H(world, other)} this Orbit we ${[o.sold ? `sold them ${fmt(o.sold)} othes of goods` : '', o.bought ? `bought ${fmt(o.bought)} othes of theirs` : ''].filter(Boolean).join(' and ')}.` });
    }
    cp.orbit = {};
    if (relation(world, cp.a, cp.b) < -10 || relation(world, cp.b, cp.a) < -10) {
      s.compacts = s.compacts.filter((x) => x !== cp);
      logRecord(world, { kind: 'world', type: 'politics', severity: 1, seat: other ? 'envoy' : undefined, houseIds: [cp.a, cp.b], text: other ? `${H(world, other)} has ended our trade compact. There is too much bad blood.` : `The trade compact between ${H(world, cp.a)} and ${H(world, cp.b)} is broken.` });
    }
  }
  const hs = Object.keys(world.houses);
  for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) {
    const a = hs[i]!, b = hs[j]!;
    if (a === P || b === P || compactOf(world, a, b)) continue;
    if (relation(world, a, b) >= 20 && relation(world, b, a) >= 20 && rng.chance(0.15)) signCompact(world, a, b, '');
  }
  // Someone who thinks well of us may offer.
  s.offers = s.offers.filter((o) => absoluteCycle(o.expires) > absoluteCycle(world.date));
  for (const h of hs) {
    if (h === P || compactOf(world, h, P) || s.offers.some((o) => o.from === h)) continue;
    if (relation(world, h, P) >= 25 && rng.chance(0.12)) {
      s.offers.push({ id: `to${world.nextId++}`, from: h, expires: addCycles(world.date, CYCLES_PER_PHASE * 3) });
      logRecord(world, { kind: 'world', type: 'politics', severity: 1, seat: 'envoy', houseIds: [P, h], text: `${H(world, h)} offers us a trade compact: each side sells the other its surplus at the Exchange price, without the Exchange's cut.` });
    }
  }
}

export function cannotPropose(world: World, h: string): string | null {
  const P = world.playerHouseId;
  if (!world.houses[h] || h === P) return 'Choose a house.';
  if (compactOf(world, P, h)) return 'We already have one.';
  const r = relation(world, h, P);
  if (r < 10) return `They will not: their regard for us is too low (${Math.round(r)}; they want 10).`;
  return null;
}

export function proposeCompact(input: World, h: string): World {
  if (cannotPropose(input, h)) return input;
  return act(input, (w) => signCompact(w, w.playerHouseId, h, 'each side sells the other its surplus at the Exchange price.'));
}

export function answerOffer(input: World, offerId: string, yes: boolean): World {
  return act(input, (w) => {
    const o = w.lanes.offers.find((x) => x.id === offerId);
    if (!o) return;
    w.lanes.offers = w.lanes.offers.filter((x) => x !== o);
    if (yes) signCompact(w, o.from, w.playerHouseId, 'we accepted their offer.');
    else shiftRelation(w, o.from, w.playerHouseId, -3);
  });
}

export function endCompact(input: World, h: string): World {
  return act(input, (w) => {
    const P = w.playerHouseId;
    const cp = compactOf(w, P, h);
    if (!cp) return;
    w.lanes.compacts = w.lanes.compacts.filter((x) => x !== cp);
    shiftRelation(w, h, P, -5);
    logRecord(w, { kind: 'council', type: 'decision', severity: 1, houseIds: [P, h], text: `We ended our trade compact with ${H(w, h)}.`, effects: [`${H(w, h)} regard −5`] });
  });
}

// ---------------------------------------------------------------- each turn

function orbitly(world: World, rng: Rng) {
  const s = world.lanes;
  const P = world.playerHouseId;
  const now = absoluteCycle(world.date);
  for (const t of Object.values(s.tally)) { t.runs *= 0.8; t.losses *= 0.8; }
  for (const k of Object.keys(s.scars)) s.scars[k] = s.scars[k]!.filter(([, at]) => at > now - CYCLES_PER_YEAR);
  for (const f of Object.values(s.factions)) {
    f.strength = clamp(f.strength + (45 - f.strength) * 0.05, 10, 95);
    for (const h of Object.keys(world.houses)) {
      const cu = s.customs[h];
      f.rel[h] = clamp((f.rel[h] ?? 0) + (cu === 'blind' ? (f.temper === 'trader' ? 2 : 1.5) : cu === 'strict' ? -2 : 0) + ((f.rel[h] ?? 0) > 0 ? -0.5 : 0.5) - (isHostile(world, f, h) ? 3 : 0), -100, 100);
    }
    // Hostility is a standing fight: patrols chase them off our lanes, and it wears on both sides.
    if (isHostile(world, f, P) && Object.values(world.fleet?.ships ?? {}).some((x) => x.houseId === P && !x.lost && (x.duty === 'patrol' || x.duty === 'escort'))) f.strength = clamp(f.strength - 1, 10, 95);
  }
  // Deals are paid each Orbit, or they end.
  for (const d of [...s.deals]) {
    const f = s.factions[d.faction]!;
    if (d.kind === 'passage' || d.kind === 'bounty') {
      const cost = d.kind === 'passage' ? PASSAGE(f) : BOUNTY_COST;
      const e = econ(world, d.house);
      if (e.stock.othes < cost) {
        s.deals = s.deals.filter((x) => x !== d);
        if (d.house === P) logRecord(world, { kind: 'world', type: 'economy', severity: 2, seat: 'steward', houseIds: [P], text: `We could not pay ${f.name} for ${d.kind === 'passage' ? 'safe passage' : 'the bounty'} this Orbit. It is ended.` });
        continue;
      }
      record(world, d.house, { resource: 'othes', amount: -cost, label: d.kind === 'passage' ? `Passage money: ${f.name}` : `Bounty on ${f.name}`, kind: 'raid' });
      if (d.kind === 'passage') f.rel[d.house] = clamp((f.rel[d.house] ?? 0) + 4, -100, 100);
      else {
        f.strength = clamp(f.strength - 4, 10, 95);
        f.rel[d.house] = clamp((f.rel[d.house] ?? 0) - 10, -100, 100);
        const st = world.houses[d.house]!.standing;
        if (rng.chance(0.3)) st.respect = clamp(st.respect + 1, 0, 100);
      }
    } else if (d.kind === 'marque') {
      f.rel[d.house] = clamp((f.rel[d.house] ?? 0) + 3, -100, 100);
      if (absoluteCycle(d.since) < now - CYCLES_PER_YEAR) {
        s.deals = s.deals.filter((x) => x !== d);
        if (d.house === P) logRecord(world, { kind: 'world', type: 'intrigue', severity: 1, seat: 'spymaster', houseIds: [P], text: `Our letters to ${f.name} against ${H(world, d.target!)} have run their year.` });
      }
    }
  }
  // Blind eyes are seen, sooner or later.
  for (const [h, cu] of Object.entries(s.customs)) {
    if (cu === 'blind' && rng.chance(0.06)) {
      const st = world.houses[h]!.standing;
      st.honour = clamp(st.honour - 2, 0, 100);
      if (h === P) logRecord(world, { kind: 'world', type: 'politics', severity: 1, seat: 'envoy', houseIds: [P], text: 'Talk in the Numarade: corsair cargo is being sold on our docks. They are not wrong.', effects: ['Honour −2'] });
    }
    if (cu === 'strict' && rng.chance(0.08)) world.houses[h]!.standing.honour = clamp(world.houses[h]!.standing.honour + 1, 0, 100);
  }
  aiLanes(world, rng);
  companyWord(world, rng);
}

/** The other houses answer their losses: buy passage, put up a bounty, or turn the companies on their enemies. */
function aiLanes(world: World, rng: Rng) {
  const s = world.lanes;
  const P = world.playerHouseId;
  for (const h of Object.values(world.houses)) {
    if (h.id === P) continue;
    const scars = s.scars[h.id] ?? [];
    const e = econ(world, h.id);
    for (const f of Object.values(s.factions)) {
      const hurt = scars.filter(([id]) => id === f.id).length;
      if (hurt >= 2 && !s.deals.some((d) => d.house === h.id && d.faction === f.id && d.kind !== 'marque') && e.stock.othes > 8000 && rng.chance(0.3)) {
        const kind: DealKind = h.personality.aggression > 0.6 || f.temper === 'cruel' ? 'bounty' : 'passage';
        s.deals.push({ id: `dl${world.nextId++}`, faction: f.id, house: h.id, kind, since: world.date });
        if (kind === 'bounty') logRecord(world, { kind: 'world', type: 'raid', severity: 1, houseIds: [h.id], text: `${H(world, h.id)} has put a bounty on ${f.name}.`, source: 'the docks' });
      }
    }
    // Letters against an enemy, now and then.
    const enemies = Object.keys(world.houses).filter((o) => o !== h.id && relation(world, h.id, o) < -50);
    if (enemies.length && h.personality.aggression + h.personality.intrigue > 1 && e.stock.othes > MARQUE_COST * 3 && rng.chance(0.04)) {
      const target = rng.pick(enemies);
      const f = Object.values(s.factions).filter((x) => (x.rel[h.id] ?? 0) > -20).sort((a, b) => b.strength - a.strength)[0];
      if (f && !s.deals.some((d) => d.kind === 'marque' && d.house === h.id && d.target === target)) {
        e.stock.othes -= MARQUE_COST;
        s.deals.push({ id: `dl${world.nextId++}`, faction: f.id, house: h.id, kind: 'marque', target, since: world.date });
        if (target === P && rng.chance(0.25 + competence(world, 'spymaster') * 0.03)) {
          logRecord(world, { kind: 'world', type: 'intrigue', severity: 2, seat: 'spymaster', houseIds: [P, h.id], text: `Our agents say ${H(world, h.id)} has given ${f.name} letters against us. Expect our convoys to be hunted.`, source: 'an agent in their port' });
        }
      }
    }
  }
}

/** A company that likes us passes word through the Spymaster's people. */
function companyWord(world: World, rng: Rng) {
  const P = world.playerHouseId;
  const friends = Object.values(world.lanes.factions).filter((f) => (f.rel[P] ?? 0) >= 30);
  if (!friends.length || !rng.chance(0.3)) return;
  for (const f of [rng.pick(friends)]) {
    const hunted = world.lanes.deals.find((d) => d.kind === 'marque' && d.target === P);
    const rival = Object.keys(world.houses).filter((h) => h !== P).sort((a, b) => relation(world, P, a) - relation(world, P, b))[0]!;
    // Friends let names slip.
    const unknown = f.members.filter((m) => !m.known && !m.fate);
    const slip = unknown.length && rng.chance(0.35) ? rng.pick(unknown) : undefined;
    if (slip) {
      reveal(slip, `Named to us by ${f.name}'s own people.`);
      chronicle(world, f, `They let slip the name of ${slip.name}, ${slip.role}${slip.ship ? ` of the ${slip.ship}` : ''}.`);
    }
    const text = slip ? `${cap(f.name)} let a name slip over drinks: ${slip.name}, ${slip.role === 'fixer' ? 'their fixer in the ports' : `${slip.role} of the ${slip.ship}`}.` : hunted && hunted.faction !== f.id
      ? `${f.name[0]!.toUpperCase() + f.name.slice(1)} send word: ${H(world, hunted.house)} is paying ${world.lanes.factions[hunted.faction]!.name} to hunt our convoys.`
      : rng.pick([
        `${f.name[0]!.toUpperCase() + f.name.slice(1)} send word: ${H(world, rival)}'s convoys run light on the ${laneName(world, laneBetween(world.houses[rival]!.capitalPlanetId, 'exchange')!)} lane. For the right letters, they would see to them.`,
        `${f.name[0]!.toUpperCase() + f.name.slice(1)} send their regards, and a list of who has been paying whom for passage. ${dealsKnown(world)}`,
        `A man from ${f.name} drank at our docks and paid for it in news: ${f.strength >= 50 ? 'the company is strong this year, and hungry' : 'the company is thin this year, and careful'}.`,
      ]);
    logRecord(world, { kind: 'world', type: 'intrigue', severity: 1, seat: 'spymaster', houseIds: [P], text, source: f.name });
  }
}

function dealsKnown(world: World): string {
  const ds = world.lanes.deals.filter((d) => d.house !== world.playerHouseId);
  if (!ds.length) return 'Nobody, as it happens.';
  return ds.slice(0, 3).map((d) => `${H(world, d.house)} ${d.kind === 'passage' ? 'pays' : d.kind === 'bounty' ? 'hunts' : 'has given letters to'} ${world.lanes.factions[d.faction]!.name}${d.kind === 'marque' ? ` against ${H(world, d.target!)}` : ''}`).join('; ') + '.';
}

function lapseHolds(world: World) {
  const now = absoluteCycle(world.date);
  const P = world.playerHouseId;
  for (const h of [...world.lanes.held]) {
    if (absoluteCycle(h.expires) > now) continue;
    // The other houses decide for themselves.
    world.lanes.held = world.lanes.held.filter((x) => x !== h);
    const f = world.lanes.factions[h.faction]!;
    if (h.owner === P) {
      f.rel[P] = clamp((f.rel[P] ?? 0) - 5, -100, 100);
      logRecord(world, { kind: 'world', type: 'raid', severity: 2, seat: 'steward', houseIds: [P], text: `No ransom went to ${f.name}. The ${h.crew} crew of ${h.what} have been sold on to the deep mines.` });
    }
  }
}

function aiRansoms(world: World, rng: Rng) {
  const P = world.playerHouseId;
  for (const h of [...world.lanes.held]) {
    if (h.owner === P) continue;
    const e = econ(world, h.owner);
    const pays = e.stock.othes > h.ransom * 3 && rng.chance(0.7);
    if (pays) { record(world, h.owner, { resource: 'othes', amount: -h.ransom, label: `Ransom to ${world.lanes.factions[h.faction]!.name}`, kind: 'ransom' }); world.lanes.factions[h.faction]!.hauls += h.ransom; }
    world.lanes.held = world.lanes.held.filter((x) => x !== h);
  }
}

export function advanceLanes(world: World, rng: Rng, phaseTurned: boolean, orbitTurned: boolean): void {
  ensureLanes(world);
  const now = absoluteCycle(world.date);
  for (const c of Object.values(world.lanes.convoys)) if (absoluteCycle(c.arrives) <= now) arrive(world, rng, c);
  if (orbitTurned) { shipQuotas(world, rng); orbitly(world, rng); compactsOrbit(world, rng); for (const f of Object.values(world.lanes.factions)) replenish(world, rng, f); }
  if (phaseTurned) { generate(world, rng); aiRansoms(world, rng); }
  ship(world, rng);
  advanceHunts(world, rng);
  lapseHolds(world);
}

/** How the companies' mood toward us changes the corsair raids on our ports. */
export function raidOdds(world: World): number {
  const P = world.playerHouseId;
  const fs = Object.values(world.lanes?.factions ?? {});
  if (!fs.length) return 1;
  const avg = fs.reduce((n, f) => n + (f.rel[P] ?? 0), 0) / fs.length;
  return avg >= 40 ? 0.6 : avg >= 15 ? 0.85 : avg <= -40 ? 1.4 : avg <= -15 ? 1.15 : 1;
}

// ---------------------------------------------------------------- the Highroy's hand

function act(input: World, fn: (w: World, rng: Rng) => void): World {
  const w = structuredClone(input);
  ensureLanes(w);
  const rng = new Rng(w.rng);
  fn(w, rng);
  w.rng = rng.state;
  return w;
}

export function setCustoms(input: World, cu: Customs): World {
  return act(input, (w) => { w.lanes.customs[w.playerHouseId] = cu; });
}

export function cannotDeal(world: World, factionId: string, kind: DealKind, target?: string): string | null {
  const P = world.playerHouseId;
  const f = world.lanes?.factions[factionId];
  if (!f) return 'No such company.';
  const othes = econ(world, P).stock.othes;
  const cost = kind === 'passage' ? PASSAGE(f) : kind === 'bounty' ? BOUNTY_COST : MARQUE_COST;
  if (othes < cost) return `Needs ${fmt(cost)} othes.`;
  if (kind !== 'marque' && dealOf(world, factionId, P, kind)) return 'Already in place.';
  if (kind === 'passage' && dealOf(world, factionId, P, 'bounty')) return 'Not while we have a bounty on them.';
  if (kind === 'passage' && f.temper === 'cruel' && (f.rel[P] ?? 0) < 0) return 'They do not sell passage to a house they do not know.';
  if (kind === 'bounty' && dealOf(world, factionId, P, 'passage')) return 'Not while we pay them for passage.';
  if (kind === 'marque') {
    if (!target || !world.houses[target] || target === P) return 'Choose a house.';
    if ((f.rel[P] ?? 0) < 10) return 'They will not take letters from a house they do not trust.';
    if (dealOf(world, factionId, P, 'bounty')) return 'Not while we have a bounty on them.';
    if (world.lanes.deals.some((d) => d.kind === 'marque' && d.house === P && d.faction === factionId && d.target === target)) return 'They already have our letters.';
  }
  return null;
}

export function makeDeal(input: World, factionId: string, kind: DealKind, target?: string): World {
  if (cannotDeal(input, factionId, kind, target)) return input;
  return act(input, (w) => {
    const P = w.playerHouseId;
    const f = w.lanes.factions[factionId]!;
    const cost = kind === 'passage' ? PASSAGE(f) : kind === 'bounty' ? BOUNTY_COST : MARQUE_COST;
    record(w, P, { resource: 'othes', amount: -cost, label: kind === 'passage' ? `Passage money: ${f.name}` : kind === 'bounty' ? `Bounty on ${f.name}` : `Letters to ${f.name}`, kind: 'raid' });
    w.lanes.deals.push({ id: `dl${w.nextId++}`, faction: factionId, house: P, kind, target, since: w.date });
    f.rel[P] = clamp((f.rel[P] ?? 0) + (kind === 'passage' ? 5 : kind === 'marque' ? 8 : -20), -100, 100);
    const sp = seatHolder(w, P, kind === 'marque' ? 'spymaster' : 'steward');
    logRecord(w, { kind: 'council', type: 'decision', severity: 1, houseIds: [P], text: kind === 'passage' ? `We pay ${f.name} for safe passage: ${fmt(cost)} othes an Orbit.` : kind === 'bounty' ? `We put a bounty on ${f.name}: ${fmt(cost)} othes an Orbit while it stands.` : `We gave ${f.name} letters against ${H(w, target!)} for a year. They keep three parts of what they take; we get the fourth.`, who: sp ? [{ id: sp.id, part: 'arranged it' }] : [] });
    chronicle(w, f, kind === 'passage' ? `We began paying them for safe passage, ${fmt(cost)} an Orbit.` : kind === 'bounty' ? `We put a bounty on them.` : `We gave them letters of marque against ${H(w, target!)}.`);
  });
}

export function endDeal(input: World, dealId: string): World {
  return act(input, (w) => {
    const d = w.lanes.deals.find((x) => x.id === dealId && x.house === w.playerHouseId);
    if (!d) return;
    w.lanes.deals = w.lanes.deals.filter((x) => x !== d);
    const f = w.lanes.factions[d.faction]!;
    if (d.kind === 'passage') f.rel[d.house] = clamp((f.rel[d.house] ?? 0) - 6, -100, 100);
    chronicle(w, f, d.kind === 'passage' ? 'We stopped paying them for passage.' : d.kind === 'bounty' ? 'We took down our bounty.' : 'We called back our letters.');
  });
}

export function answerCrew(input: World, holdId: string, pay: boolean): World {
  return act(input, (w, rng) => {
    const P = w.playerHouseId;
    const h = w.lanes.held.find((x) => x.id === holdId && x.owner === P);
    if (!h) return;
    const f = w.lanes.factions[h.faction]!;
    if (pay) {
      if (econ(w, P).stock.othes < h.ransom) return;
      record(w, P, { resource: 'othes', amount: -h.ransom, label: `Ransom to ${f.name}`, kind: 'ransom' });
      f.hauls += h.ransom;
      f.rel[P] = clamp((f.rel[P] ?? 0) + 3, -100, 100);
      logRecord(w, { kind: 'council', type: 'decision', severity: 1, houseIds: [P], text: `We paid ${f.name} ${fmt(h.ransom)} othes. The ${h.crew} crew of ${h.what} are coming home.` });
      const talk = f.members.filter((m) => !m.known && !m.fate);
      const named = talk.length && rng.chance(0.5) ? rng.pick(talk) : undefined;
      if (named) reveal(named, `The ransomed crew of ${h.what} saw their face.`);
      chronicle(w, f, `We paid ${fmt(h.ransom)} for the crew of ${h.what}.${named ? ` They came home knowing the name ${named.name}.` : ''}`);
    } else {
      f.rel[P] = clamp((f.rel[P] ?? 0) - 5, -100, 100);
      logRecord(w, { kind: 'council', type: 'decision', severity: 1, houseIds: [P], text: `We would not pay ${f.name}. The crew of ${h.what} are sold on to the deep mines.` });
      chronicle(w, f, `We would not ransom the crew of ${h.what}; they were sold to the deep mines.`);
    }
    w.lanes.held = w.lanes.held.filter((x) => x !== h);
  });
}

// ---------------------------------------------------------------- reading

export function ourConvoys(world: World): Convoy[] {
  return Object.values(world.lanes?.convoys ?? {}).filter((c) => c.owner === world.playerHouseId || c.buyer === world.playerHouseId).sort((a, b) => absoluteCycle(a.arrives) - absoluteCycle(b.arrives));
}
export function dealsOf(world: World, house = world.playerHouseId): Deal[] { return (world.lanes?.deals ?? []).filter((d) => d.house === house); }
export function relWord(r: number): string { return r >= 60 ? 'friends' : r >= 30 ? 'well disposed' : r >= 10 ? 'tolerant' : r > -10 ? 'indifferent' : r > -40 ? 'wary' : r > -70 ? 'hostile' : 'sworn enemies'; }
export const LANE_ORBIT = CYCLES_PER_ORBIT;
