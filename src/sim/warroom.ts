// The War Room: every war fought on a theatre of places, with groups of soldiers and ships that are moved,
// given roles and duties, led by commanders on a leash, and judged on the ground they fight over.
//
// The theatre: each house's worlds (the ground and the orbit over it), a station off its approaches, the
// approaches themselves, and between the two houses the border lanes, a border relay and a longer dark lane.
// Troops fight on worlds and stations; ships fight in orbit and in the lanes. Troops in the void are in their
// transports, and a fleet that catches them unescorted kills them there.
//
// Judgement: when groups meet, each side's strength is its soldiers (or ships, weighted by kind) times their
// quality; the odds go with the square of the ratio, as they do in a real fight, then a stack of multipliers
// from position, walls, roles, surprise, supply, morale, the commanders and the doctrines is applied, and the
// stack is capped at ×0.25..×3.5. A small house that plays well can beat a host twice its size; one that does
// not, cannot. Every fight leaves an after-action report that says why it went the way it did.
//
// Big fights of ours stop the clock and are fought in the battle engine; the rest are settled here.
import { Rng } from './rng';
import { absoluteCycle } from './time';
import { houseName, personName, shiftRegard, type ArchonHouse } from './archon';
import { createBattle, battleOf, commandOf, fighterPower, runOut, applyFates, type FighterSpec, type Theatre as BattleTheatre } from './battle';
import { buildWord, shortName } from './names';
import { buyPrice, econ, PANIC_PRICE, stewardBuys } from './economy';
import { spend } from './bills';
import { BASE_PRICE, FUEL_PER_LANE, GREAT_FUEL_PER_LANE, TROOP_FUEL_PER_LANE, FIGHT_WEAR } from '../data/economy';
import { garrisonTotal } from './garrisons';
import { profileOf } from '../data/profiles';
import { mixFor, type HullType, HULL_TYPES } from './register';
import { lostShip, powerOf, shipLog, hasFit, type CapitalShip } from './fleet';
import { kill } from './death';
import { logRecord } from './records';
import {
  DEFAULT_INSTRUCTIONS, DOCTRINES, HOUSE_DOCTRINE, MAX_DOCTRINES, ROLE_DEF, rolesFor,
  type DoctrineId, type Domain, type Duty, type HouseDoctrine, type Instructions, type Leash, type Opp, type Role, type Style,
} from '../data/doctrine';
import type { Character, World } from './types';
import type { Formation, War } from './war';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const rnd = (v: number) => Math.round(v) + 0;
const fmt = (n: number) => rnd(n).toLocaleString('en-US');

export type WSide = 'attackers' | 'defenders';
const other = (s: WSide): WSide => (s === 'attackers' ? 'defenders' : 'attackers');

// ---------------------------------------------------------------- shapes

export type NodeKind = 'ground' | 'orbit' | 'station' | 'approach' | 'lane';
export interface WNode {
  id: string;
  kind: NodeKind;
  name: string;
  /** Whose it is by right, if anyone's. */
  house?: string;
  /** The side it belongs to by right. */
  owner?: WSide;
  /** Who holds it now. */
  holder: WSide | null;
  /** The world it is part of (ground and orbit). */
  world?: string;
  capital?: boolean;
  /** The world the war is about. */
  target?: boolean;
  /** Walls: 0..3. */
  fort: number;
  garrison: number;
  garrisonMax: number;
  /** 0 the attacker's worlds .. 4 the defender's. */
  depth: number;
  /** Order within its column, for drawing. */
  row: number;
  /** A long way round: groups on it are harder to see. */
  dark?: boolean;
  /** The last cycle a battle of ours was fought here in the battle engine. */
  fought?: number;
  /** The last landing on it by the other side, and who made it. */
  landed?: number;
  landedBy?: string;
}
export interface WEdge { a: string; b: string; cycles: number }

export interface Source { formationId: string; n: number }

export interface WGroup {
  id: string;
  name: string;
  house: string;
  side: WSide;
  domain: Domain;
  /** Soldiers (ground) or hulls (void). */
  n: number;
  from: Source[];
  hulls: Record<HullType, number>;
  /** Great ships with it. */
  great: string[];
  knights: string[];
  quality: number;
  commanderId?: string;
  commanderName?: string;
  commanderSkill?: number;
  at: string;
  prev?: string;
  /** Where it is going, and the way there. */
  to?: string;
  path: string[];
  /** The cycle it reaches path[0]. */
  arrive?: number;
  role: Role;
  duty: Duty;
  leash: Leash;
  /** Falls back when it is down to this share of what it started with. */
  fallback: number;
  morale: number;
  /** 0 fresh .. 1 spent. */
  fatigue: number;
  /** 0 starving .. 1 supplied. */
  supply: number;
  start: number;
  fought: number;
  won: number;
  /** In a fight that is not over. */
  engaged?: string;
  /** Held in place by an enemy that pinned it, until this cycle. */
  pinned?: number;
  /** It followed bait here. */
  lured?: number;
  /** The enemy group it was sent after. */
  chasing?: string;
  /** The cycle it arrived where it is. */
  since: number;
  /** Arrived at a fight a friend was already in, this turn. */
  joined?: boolean;
  /** The player has given it orders of their own. */
  ordered?: boolean;
  /** It is falling back. */
  falling?: boolean;
  /** Held where it is for want of fuel. */
  dry?: boolean;
  /** Waits where it is until this cycle before it moves (a timed order). */
  hold?: number;
}

export interface Plan extends Instructions { doctrines: DoctrineId[]; familiarity: number; against: Record<string, Opp> }

export interface Sight { level: 0 | 1 | 2 | 3; at: string; n: number; cycle: number; role?: Role }

/** A reason a fight leaned one way. `base` ones are already in the strengths (walls), not in the capped stack. */
export interface Mult { label: string; side: WSide; x: number; base?: boolean }
export interface Report {
  id: string;
  cycle: number;
  date: World['date'];
  where: string;
  title: string;
  domain: Domain;
  sides: Record<WSide, { groups: string[]; names: string[]; n: number; q: number; house: string }>;
  /** The ratio of strengths squared, before the multipliers: attackers' odds against defenders'. */
  base: number;
  mults: Mult[];
  /** The multipliers, as one ratio (capped). */
  rel: number;
  /** The attackers' chance. */
  p: number;
  winner: WSide;
  losses: Record<WSide, number>;
  encircled?: boolean;
  battle?: string;
  shout?: string;
  text: string;
  why: string[];
}

export interface Contact { id: string; node: string; domain: Domain; battle: string; judged: Judged; since: number }
interface Judged { attack: WSide; base: number; mults: Mult[]; rel: number; p: number; E: Record<WSide, number>; encircle: Record<WSide, boolean> }

export interface TLine { cycle: number; text: string; big?: boolean; side?: WSide }

export interface TheatreState {
  v: 1;
  nodes: Record<string, WNode>;
  edges: WEdge[];
  groups: Record<string, WGroup>;
  plans: Record<string, Plan>;
  sight: Record<WSide, Record<string, Sight>>;
  contacts: Contact[];
  reports: Report[];
  feed: TLine[];
  /** Probes the Spymaster has out: node id → until cycle. */
  probes: Record<string, number>;
  next: number;
  /** A forecast copy: nothing outside the war is touched, no battles open, no one dies. */
  sim?: boolean;
  /** Our plan for the Phase: committed for which Phase, asked about which, and whether it plays out on its own. */
  phase?: { committed?: number; asked?: number; handsOff?: boolean; last?: Record<string, GroupOrder> };
}

// ---------------------------------------------------------------- reading

export const theatreOf = (war: War): TheatreState | undefined => (war as War & { theatre?: TheatreState }).theatre;
const setTheatre = (war: War, t: TheatreState) => { (war as War & { theatre?: TheatreState }).theatre = t; };
export const groupsOf = (t: TheatreState, side?: WSide, house?: string) => Object.values(t.groups).filter((g) => (!side || g.side === side) && (!house || g.house === house));
export const groupsAt = (t: TheatreState, node: string, side?: WSide, domain?: Domain) => Object.values(t.groups).filter((g) => g.at === node && (!side || g.side === side) && (!domain || g.domain === domain));
export const neighbours = (t: TheatreState, id: string) => t.edges.filter((e) => e.a === id || e.b === id).map((e) => ({ id: e.a === id ? e.b : e.a, cycles: e.cycles }));
const edgeCycles = (t: TheatreState, a: string, b: string) => t.edges.find((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a))?.cycles ?? 2;
const isVoid = (k: NodeKind) => k !== 'ground';
const fightsHere = (d: Domain, k: NodeKind) => (d === 'ground' ? k === 'ground' || k === 'station' : k !== 'ground');
const sideOfHouse = (war: War, h: string): WSide | null => (war.attacker === h || war.attackers.includes(h) ? 'attackers' : war.defender === h || war.defenders.includes(h) ? 'defenders' : null);
const say = (t: TheatreState, w: World, text: string, big = false, side?: WSide) => { t.feed.push({ cycle: absoluteCycle(w.date), text, big, side }); if (t.feed.length > 120) t.feed.shift(); };
const has = (t: TheatreState, h: string, d: DoctrineId) => !!t.plans[h]?.doctrines.includes(d);
const planOf = (t: TheatreState, h: string): Plan => t.plans[h] ?? { ...DEFAULT_INSTRUCTIONS, doctrines: [], familiarity: 50, against: {} };

/** A group's fighting weight: soldiers and knights, or ships by kind. */
export function weightOf(w: World, g: WGroup): number {
  if (g.domain === 'ground') {
    const k = g.knights.map((id) => w.characters[id]).filter((c): c is Character => !!c?.alive).reduce((t, c) => t + fighterPower(c, 'surface') * 12, 0);
    return g.n + k * (g.role === 'lance' ? 2 : 1);
  }
  const great = g.great.map((id) => w.fleet?.ships[id]).filter((s): s is CapitalShip => !!s && !s.lost).reduce((t, s) => t + powerOf(w, s) / 2.5, 0);
  return g.hulls.cruiser * 6 + g.hulls.destroyer * 4 + g.hulls.gunship * 1.5 + g.hulls.fighter * 0.4 + great;
}

export { fieldSoldiers } from './economy';

/** Pay a war bill: for real, or, in a forecast, from the copied stores, buying what is short at today's price
 *  (as the Steward would) without touching the market. */
function payWar(w: World, t: TheatreState, h: string, bill: Partial<Record<'fuel' | 'components' | 'navisium' | 'provisions', number>>, label: string): number {
  if (!t.sim) return spend(w, h, bill, label, 'war');
  const e = w.economy?.houses[h];
  if (!e) return 1;
  let met = 1;
  for (const [g, v] of Object.entries(bill) as ['fuel' | 'components' | 'navisium' | 'provisions', number][]) {
    if (!v) continue;
    if (e.stock[g] < v && stewardBuys(w, h, g)) {
      const price = buyPrice(w, h, g);
      if (price <= BASE_PRICE[g] * PANIC_PRICE) {
        const n = Math.max(0, Math.min(v - Math.max(0, e.stock[g]), Math.floor(e.stock.othes / Math.max(0.01, price))));
        e.stock[g] += n; e.stock.othes -= n * price;
      }
    }
    const paid = Math.max(0, Math.min(v, e.stock[g]));
    e.stock[g] -= v;
    met = Math.min(met, paid / v);
  }
  return met;
}

/** Fuel for this group to cross one lane: its hulls and great ships, or the troopships that carry it. */
export function legFuel(w: World, g: WGroup): number {
  if (g.domain === 'ground') return (g.n / 1000) * TROOP_FUEL_PER_LANE;
  const great = g.great.map((id) => w.fleet?.ships[id]).filter((s): s is CapitalShip => !!s && !s.lost).reduce((t, s) => t + (GREAT_FUEL_PER_LANE[s.cls] ?? 3), 0);
  return g.hulls.cruiser * FUEL_PER_LANE.cruiser + g.hulls.destroyer * FUEL_PER_LANE.destroyer + g.hulls.gunship * FUEL_PER_LANE.gunship + g.hulls.fighter * FUEL_PER_LANE.fighter + great;
}

export function commanderOfGroup(w: World, g: WGroup): { name: string; skill: number; id?: string } {
  const c = g.commanderId ? w.characters[g.commanderId] : undefined;
  if (c?.alive) return { name: shortName(c.name), skill: commandOf(c, g.domain === 'void' ? 'space' : 'surface'), id: c.id };
  if (g.commanderName) return { name: g.commanderName, skill: g.commanderSkill ?? 10 };
  return { name: 'no one', skill: 6 };
}

// ---------------------------------------------------------------- building the theatre

const STATION_A = ['Brael', 'Kesh', 'Ember', 'Varo', 'Ostrin', 'Hale', 'Corvo', 'Tamsk', 'Iderin', 'Saul'];
const STATION_B = ['Relay', 'Station', 'Gate', 'Anchorage', 'Spindle', 'Hold'];

function worldsOfHouse(w: World, h: string): { name: string; capital: boolean }[] {
  if (w.houses[h]) {
    const cap = w.houses[h]!.capitalPlanetId;
    const ps = Object.values(w.planets).filter((p) => p.houseId === h).sort((a, b) => (a.id === cap ? -1 : b.id === cap ? 1 : 0));
    return ps.slice(0, 3).map((p) => ({ name: p.name, capital: p.id === cap }));
  }
  const a = w.archon?.houses[h] as ArchonHouse | undefined;
  const rng = Rng.fromSeed(`${w.seed}/worlds/${h}`);
  const n = clamp(a?.worlds ?? 1, 1, 3);
  const out = [{ name: a?.capital ?? `${houseName(w, h)} Prime`, capital: true }];
  for (let i = 1; i < n; i++) out.push({ name: buildWord(rng, { starts: ['Ka', 'Ve', 'Or', 'Tha', 'Sel', 'Mor', 'Dra', 'Cor', 'Bel', 'Hes'], mids: ['r', 'l', 'th', 'v'], ends: ['os', 'ara', 'eon', 'is', 'une', 'ath'], midChance: 0.4 }), capital: false });
  return out;
}

function buildNodes(w: World, war: War): { nodes: Record<string, WNode>; edges: WEdge[] } {
  const nodes: Record<string, WNode> = {};
  const edges: WEdge[] = [];
  const add = (n: Omit<WNode, 'holder' | 'fort' | 'garrison' | 'garrisonMax'> & Partial<WNode>) => { nodes[n.id] = { holder: n.owner ?? null, fort: 0, garrison: 0, garrisonMax: 0, ...n } as WNode; };
  const link = (a: string, b: string, cycles: number) => edges.push({ a, b, cycles });
  for (const side of ['attackers', 'defenders'] as const) {
    const h = side === 'attackers' ? war.attacker : war.defender;
    const near = side === 'attackers' ? 1 : 3, far = side === 'attackers' ? 0 : 4;
    const worlds = worldsOfHouse(w, h);
    const garrison = garrisonTotal(w, h);
    const rng = Rng.fromSeed(`${w.seed}/station/${h}`);
    const ap = `${h}:ap`;
    add({ id: ap, kind: 'approach', name: `the ${houseName(w, h)} approaches`, house: h, owner: side, depth: near, row: 1 });
    const st = `${h}:st`;
    const stName = `${rng.pick(STATION_A)} ${rng.pick(STATION_B)}`;
    add({ id: st, kind: 'station', name: stName, house: h, owner: side, depth: near, row: 0, fort: 2, garrison: rnd(garrison * 0.06 / 50) * 50, garrisonMax: rnd(garrison * 0.06 / 50) * 50 });
    link(st, ap, 1);
    worlds.forEach((wd, i) => {
      const g = `${h}:w${i}:g`, o = `${h}:w${i}:o`;
      const share = wd.capital ? 0.55 : 0.39 / Math.max(1, worlds.length - 1);
      const isTarget = side === 'defenders' && war.target === wd.name;
      add({ id: o, kind: 'orbit', name: `the space over ${wd.name}`, house: h, owner: side, world: wd.name, capital: wd.capital, target: isTarget, depth: far, row: i * 2 });
      add({ id: g, kind: 'ground', name: wd.name, house: h, owner: side, world: wd.name, capital: wd.capital, target: isTarget, depth: far, row: i * 2 + 1, fort: wd.capital ? 3 : 1, garrison: rnd(garrison * share / 100) * 100, garrisonMax: rnd(garrison * share / 100) * 100 });
      link(g, o, 1);
      link(o, ap, wd.capital ? 2 : 3);
      if (wd.capital) link(o, st, 2);
    });
  }
  // No named target (a limited war): the defender's capital is what an attacker would go for.
  if (!Object.values(nodes).some((n) => n.target)) for (const n of Object.values(nodes)) if (n.owner === 'defenders' && n.capital) n.target = true;
  add({ id: 'lanes', kind: 'lane', name: 'the border lanes', depth: 2, row: 1 });
  add({ id: 'relay', kind: 'station', name: 'the border relay', depth: 2, row: 0, fort: 1 });
  add({ id: 'dark', kind: 'lane', name: 'the dark lane', depth: 2, row: 2, dark: true });
  link('lanes', 'relay', 1);
  for (const h of [war.attacker, war.defender]) { link(`${h}:ap`, 'lanes', 2); link(`${h}:ap`, 'dark', 3); }
  return { nodes, edges };
}

const LEGION_WORDS = ['Host', 'Wall', 'Spear', 'Line', 'Hand', 'March'];
const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
const VOID_WORDS: Partial<Record<Role, string>> = { line: 'Battle line', guard: 'Guard', strike: 'Lance', fighters: 'Grey wing', wing: 'Strike wing', picket: 'Picket', blockade: 'Blockade', laneRaider: 'Raiders', escort: 'Escort', gunline: 'Gunline', decoy: 'Decoy', squadron: 'Reserve squadron', shadow: 'Shadow' };

function groupName(t: TheatreState, h: string, d: Domain, role: Role, base?: string): string {
  const used = new Set(Object.values(t.groups).filter((g) => g.house === h).map((g) => g.name));
  if (d === 'void') {
    const b = VOID_WORDS[role] ?? 'Squadron';
    for (const n of NUMERALS) { const s = `${b} ${n}`; if (!used.has(s)) return s; }
    return `${b} ${used.size}`;
  }
  const b = base ?? LEGION_WORDS[0]!;
  for (const n of NUMERALS) { const s = `${b} ${n}`; if (!used.has(s)) return s; }
  return `${b} ${used.size}`;
}

/** How much of a formation is not yet in a group. */
export function freeOf(_w: World, t: TheatreState, f: Formation): number {
  const taken = Object.values(t.groups).reduce((n, g) => n + g.from.filter((s) => s.formationId === f.id).reduce((m, s) => m + s.n, 0), 0);
  return Math.max(0, f.strength - taken);
}

/** How good a house's ship crews are: from its aptitude for the void. */
export const voidQuality = (h: string) => Math.round((0.75 + 0.4 * profileOf(h).fleet) * 100) / 100;

function newGroup(w: World, t: TheatreState, war: War, h: string, d: Domain, n: number, at: string, role: Role, sources: Source[], extra: Partial<WGroup> = {}): WGroup {
  const side = sideOfHouse(war, h)!;
  const fs = sources.map((s) => w.war!.formations[s.formationId]).filter((f): f is Formation => !!f);
  // Crews are as good as the house is at the void, not as good as its infantry.
  const q = d === 'void' ? voidQuality(h) : fs.length ? fs.reduce((a, f, i) => a + f.quality * sources[i]!.n, 0) / Math.max(1, sources.reduce((a, s) => a + s.n, 0)) : profileOf(h).quality;
  const morale = fs.length ? fs.reduce((a, f) => a + f.morale, 0) / fs.length : 70;
  const g: WGroup = {
    id: `wg${t.next++}`, name: '', house: h, side, domain: d, n, from: sources, hulls: d === 'void' ? mixFor(n) : { cruiser: 0, destroyer: 0, gunship: 0, fighter: 0 },
    great: [], knights: [], quality: Math.round(q * 100) / 100, at, path: [], role, duty: ROLE_DEF[role].duty, leash: 'normal', fallback: 0.45,
    morale, fatigue: 0, supply: 1, start: n, fought: 0, won: 0, since: 0, ...extra,
  };
  g.name ||= groupName(t, h, d, role, d === 'ground' ? fs[0]?.name.replace(/^the /, '').split(' ').pop() : undefined);
  t.groups[g.id] = g;
  return g;
}

/** Who should lead a new group: the house's own people not already leading. */
function pickCommander(w: World, t: TheatreState, h: string, d: Domain, rng: Rng): Partial<WGroup> {
  if (w.houses[h]) {
    const busy = new Set(Object.values(t.groups).map((g) => g.commanderId).filter(Boolean));
    const people = Object.values(w.characters).filter((c) => c.alive && c.houseId === h && c.tier === 'full' && c.seat !== 'highroy' && !busy.has(c.id) && w.date.year - c.birth.year >= 18);
    const best = people.sort((a, b) => commandOf(b, d === 'void' ? 'space' : 'surface') - commandOf(a, d === 'void' ? 'space' : 'surface'))[0];
    if (best) return { commanderId: best.id };
  }
  const a = w.archon?.houses[h];
  return { commanderName: personName(rng, a?.species ?? 'human', rng.pick(a?.families.length ? a.families : [houseName(w, h)])), commanderSkill: 8 + rng.next() * 7 * (a?.might ?? 1) };
}

export function doctrineOf(h: string, w?: World): HouseDoctrine {
  if (HOUSE_DOCTRINE[h]) return HOUSE_DOCTRINE[h]!;
  const p = w?.archon?.houses[h]?.personality;
  const style: Style = p && p.aggression > 0.6 ? 'assault' : p && p.intrigue > 0.6 ? 'raid' : 'balanced';
  return { style, cards: style === 'assault' ? ['shock', 'discipline'] : style === 'raid' ? ['silent', 'supply'] : ['concentration'], tell: 'Nothing on record about how they fight.' };
}

function aiPlan(w: World, h: string, side: WSide): Plan {
  const d = doctrineOf(h, w);
  const p = w.archon?.houses[h]?.personality;
  const aggressive = d.style === 'assault' || d.style === 'shock' || d.style === 'knights';
  return {
    tempo: aggressive ? 3 : d.style === 'attrition' ? 1 : 2, width: d.style === 'assault' ? 1 : d.style === 'raid' ? 4 : 2,
    risk: aggressive ? 3 : 2, pursuit: aggressive ? 3 : 2,
    line: side === 'attackers' ? 'forward' : d.style === 'attrition' ? 'home' : 'approaches',
    supply: d.style === 'void' ? 'void' : 'balanced', quarter: (p?.honour ?? 0.5) > 0.7 ? 'honourable' : (p?.greed ?? 0.5) > 0.6 ? 'ransom' : 'honourable',
    knights: d.style === 'knights' ? 'hunt' : 'lead', doctrines: d.cards.slice(0, MAX_DOCTRINES), familiarity: 85, against: {},
  };
}

/** Raise the groups a house brings: the AI's from its doctrine, ours as one host and one fleet to rearrange. */
function muster(w: World, t: TheatreState, war: War, h: string, rng: Rng): void {
  const side = sideOfHouse(war, h)!;
  const lead = side === 'attackers' ? war.attacker : war.defender;
  const home = t.nodes[`${h}:ap`] ? h : lead;
  const cap = Object.values(t.nodes).find((n) => n.house === home && n.kind === 'ground' && n.capital)?.id ?? `${home}:ap`;
  const ap = `${home}:ap`;
  const P = w.playerHouseId;
  const forms = Object.values(w.war!.formations).filter((f) => f.houseId === h && f.strength > 0);
  const legions = forms.filter((f) => f.kind === 'legion'), companies = forms.filter((f) => f.kind === 'company'), fleets = forms.filter((f) => f.kind === 'fleet');
  const knights = [...new Set(forms.flatMap((f) => f.knights))].filter((k) => w.characters[k]?.alive);
  const d = doctrineOf(h, w);
  const ground = legions.map((f) => ({ f, n: freeOf(w, t, f) })).concat(companies.map((f) => ({ f, n: freeOf(w, t, f) }))).filter((x) => x.n > 0);
  const soldiers = ground.reduce((n, x) => n + x.n, 0);
  const ships = fleets.reduce((n, f) => n + freeOf(w, t, f), 0);
  const great = fleets.length ? Object.values(w.fleet?.ships ?? {}).filter((s) => s.houseId === h && !s.lost && !s.ready && !s.watch && !s.crucible && (s.duty === 'harbour' || s.duty === 'patrol')).map((s) => s.id) : [];
  // A principal brings everything it can spare; an ally sends half.
  const principal = h === war.attacker || h === war.defender;
  const cut = principal ? 1 : 0.5;
  const take = (share: number): Source[] => ground.map((x) => ({ formationId: x.f.id, n: rnd(freeOf(w, t, x.f) * share * cut) })).filter((s) => s.n > 0);
  const takeFleet = (share: number): Source[] => fleets.map((f) => ({ formationId: f.id, n: Math.max(0, rnd(freeOf(w, t, f) * share * cut)) })).filter((s) => s.n > 0);
  const sum = (s: Source[]) => s.reduce((n, x) => n + x.n, 0);
  const mk = (dm: Domain, src: Source[], at: string, role: Role, extra: Partial<WGroup> = {}) => {
    const n = sum(src);
    if (n <= 0) return undefined;
    const g = newGroup(w, t, war, h, dm, n, at, role, src, { ...pickCommander(w, t, h, dm, rng), since: absoluteCycle(w.date), ...extra });
    return g;
  };
  if (h === P) {
    // Ours: one host and one fleet. The player shapes them from there.
    mk('ground', take(1), side === 'attackers' ? ap : cap, side === 'attackers' ? 'spearhead' : 'anvil', { knights });
    const fl = mk('void', takeFleet(1), ap, 'line', { great });
    if (fl) fl.hulls = mixFor(fl.n);
    t.plans[h] ??= { ...DEFAULT_INSTRUCTIONS, doctrines: [], familiarity: 40, against: {} };
    return;
  }
  t.plans[h] ??= aiPlan(w, h, side);
  // Hosts of about 45,000, at most four; the rest of the army stays in its garrisons.
  const hosts = clamp(Math.ceil(soldiers * cut / 45000), 1, 4);
  const attacking = side === 'attackers';
  const roles: Role[] = attacking
    ? (d.style === 'assault' ? ['spearhead', 'siege', 'spearhead', 'reserve'] : d.style === 'raid' ? ['spearhead', 'raider', 'reserve', 'raider'] : d.style === 'knights' ? ['lance', 'spearhead', 'reserve', 'siege'] : ['spearhead', 'siege', 'reserve', 'anvil'])
    : (d.style === 'raid' ? ['anchor', 'raider', 'reserve', 'anvil'] : ['anchor', 'anvil', 'reserve', 'anvil']);
  for (let i = 0; i < hosts; i++) {
    const role = roles[i] ?? 'reserve';
    const at = attacking ? ap : role === 'anchor' ? cap : i % 2 ? `${home}:st` : cap;
    mk('ground', take(1 / (hosts - i)), at, role, { knights: i === 0 ? knights : [] });
  }
  // The fleet: a battle line, and what the doctrine adds.
  const shares: [Role, number][] = d.style === 'raid' ? [['line', 0.6], ['laneRaider', 0.25], ['picket', 0.15]]
    : d.style === 'void' ? [['line', 0.6], ['strike', 0.25], ['escort', 0.15]]
    : d.style === 'attrition' ? [['line', 0.55], ['laneRaider', 0.25], ['escort', 0.2]]
    : attacking ? [['line', 0.75], ['escort', 0.15], ['picket', 0.1]] : [['line', 0.8], ['picket', 0.2]];
  const free0 = ships;
  shares.forEach(([role, share], i) => {
    const src = i === shares.length - 1 ? takeFleet(1) : takeFleet(share * free0 / Math.max(1, fleets.reduce((n, f) => n + freeOf(w, t, f), 0)));
    const g = mk('void', src, ap, role, i === 0 ? { great } : {});
    if (g) g.hulls = mixFor(g.n);
  });
}

/** Build the theatre for a war (or bring an old one's fronts into it). */
export function ensureTheatre(w: World, war: War): TheatreState {
  const have = theatreOf(war);
  if (have) return have;
  const { nodes, edges } = buildNodes(w, war);
  const t: TheatreState = { v: 1, nodes, edges, groups: {}, plans: {}, sight: { attackers: {}, defenders: {} }, contacts: [], reports: [], feed: [], probes: {}, next: 1 };
  setTheatre(war, t);
  const rng = Rng.fromSeed(`${w.seed}/theatre/${war.id}`);
  for (const h of [war.attacker, ...war.attackers, war.defender, ...war.defenders]) muster(w, t, war, h, rng);
  say(t, w, `The War Room opens on ${war.name}: ${Object.keys(nodes).length} places, ${Object.keys(t.groups).length} groups in the field.`, true);
  syncFormations(w, war, t);
  return t;
}

/** A house that comes into the war late brings its groups to its lead's approaches. */
export function joinTheatre(w: World, war: War, h: string): void {
  const t = theatreOf(war);
  if (!t || Object.values(t.groups).some((g) => g.house === h)) return;
  muster(w, t, war, h, Rng.fromSeed(`${w.seed}/theatre/${war.id}/${h}`));
}

// ---------------------------------------------------------------- where groups can go

/** Can this group stand at this place? */
export function cannotEnter(_w: World, war: War, t: TheatreState, g: WGroup, id: string): string | null {
  const n = t.nodes[id];
  if (!n) return 'No such place.';
  if (g.domain === 'void' && n.kind === 'ground') return 'Ships do not land.';
  if (war.rung === 'clashes' && n.owner && n.owner !== g.side && (n.kind === 'ground' || n.kind === 'orbit')) return 'A border war: their worlds are not in it.';
  if (g.domain === 'ground' && n.kind === 'ground' && n.owner !== g.side) {
    const orbit = `${n.id.slice(0, -2)}:o`;
    if (t.nodes[orbit]?.holder !== g.side) return `We do not hold the space over ${n.name}: no landing.`;
  }
  return null;
}

/** Places in the void where this side has seen enemy warships and has none of its own: troops die there in their transports. */
export function dangerFor(t: TheatreState, side: WSide): Set<string> {
  const out = new Set<string>();
  for (const [gid, s] of Object.entries(t.sight[side])) {
    const e = t.groups[gid];
    if (!e || e.domain !== 'void' || s.level < 1 || (e.duty === 'support' && e.role !== 'wing')) continue;
    const n = t.nodes[s.at];
    if (!n || n.kind === 'ground') continue;
    if (groupsAt(t, s.at, side, 'void').some((x) => x.role === 'escort' || x.duty !== 'support')) continue;
    out.add(s.at);
  }
  return out;
}

/** The quickest way, in cycles, by places this group may pass; troops go round places where enemy ships wait. */
export function routeFor(w: World, war: War, t: TheatreState, g: WGroup, to: string, strict = false): string[] | null {
  const danger = g.domain === 'ground' ? dangerFor(t, g.side) : new Set<string>();
  if (to === g.at) return [];
  const dist: Record<string, number> = { [g.at]: 0 };
  const prev: Record<string, string> = {};
  const open = new Set([g.at]);
  while (open.size) {
    let cur = '';
    for (const id of open) if (!cur || dist[id]! < dist[cur]!) cur = id;
    open.delete(cur);
    if (cur === to) break;
    for (const nb of neighbours(t, cur)) {
      if (nb.id !== to && t.nodes[nb.id]!.kind === 'ground') continue; // worlds are ends, not roads
      if (cannotEnter(w, war, t, g, nb.id)) continue;
      if (strict && danger.has(nb.id) && nb.id !== to) continue;
      const d = dist[cur]! + nb.cycles + (danger.has(nb.id) ? 8 : 0);
      if (dist[nb.id] === undefined || d < dist[nb.id]!) { dist[nb.id] = d; prev[nb.id] = cur; open.add(nb.id); }
    }
  }
  if (dist[to] === undefined) return null;
  const path: string[] = [];
  for (let c = to; c !== g.at; c = prev[c]!) path.unshift(c);
  return path;
}

/** Cycles to cross an edge, at the house's tempo. */
function stepCycles(t: TheatreState, g: WGroup, a: string, b: string): number {
  const tempo = planOf(t, g.house).tempo;
  const fast = (g.role === 'raider' || g.role === 'infiltrator' || g.role === 'laneRaider') && has(t, g.house, 'deepRaid') ? 0.67 : 1;
  return Math.max(1, Math.round(edgeCycles(t, a, b) * (1.3 - tempo * 0.12) * fast));
}

function sendTo(w: World, war: War, t: TheatreState, g: WGroup, to: string, strict = false): boolean {
  const path = routeFor(w, war, t, g, to, strict);
  if (!path) return false;
  g.to = to;
  g.path = path;
  g.arrive = path.length ? Math.max(absoluteCycle(w.date), g.hold ?? 0) + stepCycles(t, g, g.at, path[0]!) : undefined;
  return true;
}

// ---------------------------------------------------------------- the player's orders

const ours = (w: World, _war: War, g: WGroup) => g.house === w.playerHouseId;
function warFor(w: World, warId: string): War {
  const war = w.war?.wars.find((x) => x.id === warId && x.status === 'active');
  if (!war) throw new Error('No such war.');
  ensureTheatre(w, war);
  return war;
}
function ourGroup(w: World, warId: string, gid: string): { war: War; t: TheatreState; g: WGroup } {
  const war = warFor(w, warId);
  const t = theatreOf(war)!;
  const g = t.groups[gid];
  if (!g || !ours(w, war, g)) throw new Error('Not ours.');
  return { war, t, g };
}

export interface GroupOrder {
  to?: string | null; role?: Role; duty?: Duty; leash?: Leash; fallback?: number; commanderId?: string | null; name?: string;
  /** Leave this many cycles from now (0 = at once). */
  leave?: number;
}

export function cannotOrder(w: World, warId: string, gid: string, o: GroupOrder): string | null {
  try {
    const { war, t, g } = ourGroup(structuredClone(w), warId, gid);
    if (o.to) { if (g.engaged) return 'It is in a fight.'; const why = cannotEnter(w, war, t, g, o.to); if (why) return why; if (!routeFor(w, war, t, g, o.to)) return 'There is no way there.'; }
    if (o.role && !rolesFor(g.domain).includes(o.role)) return 'Not a role for it.';
    if (o.commanderId) { const c = w.characters[o.commanderId]; if (!c?.alive || c.houseId !== g.house) return 'They cannot lead it.'; }
    return null;
  } catch (e) { return (e as Error).message; }
}

export function orderGroup(input: World, warId: string, gid: string, o: GroupOrder): World {
  const why = cannotOrder(input, warId, gid, o);
  if (why) throw new Error(why);
  const w = structuredClone(input);
  const { war, t, g } = ourGroup(w, warId, gid);
  applyOrder(w, war, t, g, o);
  return w;
}

/** Give an order to a group in place (used by orders and by the forecast's what-ifs). */
export function applyOrder(w: World, war: War, t: TheatreState, g: WGroup, o: GroupOrder): void {
  if (o.leave !== undefined) g.hold = o.leave > 0 ? absoluteCycle(w.date) + o.leave : undefined;
  if (o.to !== undefined) { if (o.to === null) { g.to = undefined; g.path = []; g.arrive = undefined; } else sendTo(w, war, t, g, o.to); g.falling = false; }
  if (o.role) { g.role = o.role; g.duty = o.duty ?? ROLE_DEF[o.role].duty; }
  if (o.duty) g.duty = o.duty;
  if (o.leash) g.leash = o.leash;
  if (o.fallback !== undefined) g.fallback = clamp(o.fallback, 0, 0.9);
  if (o.name) g.name = o.name.slice(0, 32);
  if (o.commanderId !== undefined) {
    for (const x of Object.values(t.groups)) if (o.commanderId && x.commanderId === o.commanderId) x.commanderId = undefined;
    g.commanderId = o.commanderId ?? undefined;
    g.knights = g.knights.filter((k) => k !== o.commanderId);
  }
  g.ordered = true;
}

/** Several orders at once (a response from the brief). */
export function orderMany(input: World, warId: string, orders: Record<string, GroupOrder>): World {
  const w = structuredClone(input);
  const war = warFor(w, warId);
  const t = theatreOf(war)!;
  for (const [gid, o] of Object.entries(orders)) {
    const g = t.groups[gid];
    if (!g || g.house !== w.playerHouseId || g.engaged) continue;
    if (o.to && (cannotEnter(w, war, t, g, o.to) || !routeFor(w, war, t, g, o.to))) continue;
    applyOrder(w, war, t, g, o);
  }
  return w;
}

/** The Phase in which the clock now stands. */
export const phaseIndex = (w: World) => Math.floor(absoluteCycle(w.date) / 16);

/** Commit our plan for this Phase. Hands off: it plays out on its own, big fights settled by the staff, not opened. */
export function commitPhase(input: World, warId: string, handsOff: boolean): World {
  const w = structuredClone(input);
  const war = warFor(w, warId);
  const t = theatreOf(war)!;
  t.phase = { ...(t.phase ?? {}), committed: phaseIndex(w), handsOff };
  say(t, w, `The plan for this Phase is given${handsOff ? ': the staff will see it through' : ''}.`, true);
  return w;
}

/** Split part of a group off into a new one, where it stands. */
export function splitGroup(input: World, warId: string, gid: string, share: number, role?: Role): World {
  const w = structuredClone(input);
  const { war, t, g } = ourGroup(w, warId, gid);
  if (g.engaged) throw new Error('It is in a fight.');
  const n = rnd(g.n * clamp(share, 0.05, 0.95));
  if (n < 1 || g.n - n < 1) throw new Error('Too small to split.');
  const src = g.from.map((s) => ({ formationId: s.formationId, n: rnd(s.n * n / g.n) })).filter((s) => s.n > 0);
  const moved = src.reduce((a, s) => a + s.n, 0);
  for (const s of src) { const o = g.from.find((x) => x.formationId === s.formationId)!; o.n -= s.n; }
  g.from = g.from.filter((s) => s.n > 0);
  const r = role ?? (g.domain === 'ground' ? 'reserve' : 'squadron');
  const ng = newGroup(w, t, war, g.house, g.domain, moved, g.at, r, src, { morale: g.morale, fatigue: g.fatigue, supply: g.supply, quality: g.quality, since: g.since, prev: g.prev, ...pickCommander(w, t, g.house, g.domain, new Rng(w.rng)) });
  if (g.domain === 'void') { for (const k of HULL_TYPES) { const m = Math.min(g.hulls[k], rnd(g.hulls[k] * moved / g.n)); ng.hulls[k] = m; g.hulls[k] -= m; } fixHulls(ng); fixHulls(g); }
  g.n -= moved; g.start = Math.max(1, rnd(g.start * g.n / (g.n + moved))); ng.start = moved;
  ng.ordered = true;
  return w;
}

/** Join two of our groups that stand in the same place. */
export function mergeGroups(input: World, warId: string, into: string, gid: string): World {
  const w = structuredClone(input);
  const { t, g } = ourGroup(w, warId, gid);
  const a = t.groups[into];
  if (!a || a.house !== g.house || a.id === g.id) throw new Error('Not ours.');
  if (a.at !== g.at || a.domain !== g.domain) throw new Error('They must stand together.');
  if (a.engaged || g.engaged) throw new Error('One of them is in a fight.');
  const tot = a.n + g.n;
  a.quality = Math.round(((a.quality * a.n + g.quality * g.n) / tot) * 100) / 100;
  a.morale = (a.morale * a.n + g.morale * g.n) / tot; a.fatigue = (a.fatigue * a.n + g.fatigue * g.n) / tot; a.supply = (a.supply * a.n + g.supply * g.n) / tot;
  for (const s of g.from) { const o = a.from.find((x) => x.formationId === s.formationId); if (o) o.n += s.n; else a.from.push({ ...s }); }
  for (const k of HULL_TYPES) a.hulls[k] += g.hulls[k];
  a.great.push(...g.great); a.knights.push(...g.knights);
  a.n = tot; a.start += g.start;
  if (!a.commanderId && !a.commanderName && g.commanderId) a.commanderId = g.commanderId;
  delete t.groups[g.id];
  return w;
}

/** Raise a new group from what is still at home. */
export function raiseGroup(input: World, warId: string, domain: Domain, share: number): World {
  const w = structuredClone(input);
  const war = warFor(w, warId);
  const t = theatreOf(war)!;
  const P = w.playerHouseId;
  const forms = Object.values(w.war!.formations).filter((f) => f.houseId === P && (domain === 'void' ? f.kind === 'fleet' : f.kind !== 'fleet'));
  const src = forms.map((f) => ({ formationId: f.id, n: rnd(freeOf(w, t, f) * clamp(share, 0.05, 1)) })).filter((s) => s.n > 0);
  const n = src.reduce((a, s) => a + s.n, 0);
  if (!n) throw new Error('Nothing left at home to raise.');
  const side = sideOfHouse(war, P)!;
  const home = side === 'attackers' ? war.attacker : war.defender;
  const at = domain === 'void' ? `${home}:ap` : Object.values(t.nodes).find((x) => x.house === home && x.kind === 'ground' && x.capital)!.id;
  const g = newGroup(w, t, war, P, domain, n, at, domain === 'void' ? 'squadron' : 'reserve', src, { since: absoluteCycle(w.date), ...pickCommander(w, t, P, domain, new Rng(w.rng)) });
  g.ordered = true;
  return w;
}

/** Send a group home and out of the war. */
export function standDown(input: World, warId: string, gid: string): World {
  const w = structuredClone(input);
  const { war, t, g } = ourGroup(w, warId, gid);
  if (g.engaged) throw new Error('It is in a fight.');
  const n = t.nodes[g.at]!;
  if (n.owner !== g.side) throw new Error('It has to be on our own ground first.');
  delete t.groups[g.id];
  syncFormations(w, war, t);
  return w;
}

/** Give a knight of ours to a group (or take them back). */
export function setGroupKnight(input: World, warId: string, gid: string, knightId: string, on: boolean): World {
  const w = structuredClone(input);
  const { t, g } = ourGroup(w, warId, gid);
  for (const x of Object.values(t.groups)) x.knights = x.knights.filter((k) => k !== knightId);
  if (on) { const c = w.characters[knightId]; if (!c?.alive || c.houseId !== g.house) throw new Error('Not ours.'); if (g.domain !== 'ground') throw new Error('Knights go with the troops.'); g.knights.push(knightId); }
  return w;
}

function changePlan(input: World, warId: string, f: (p: Plan) => number): World {
  const w = structuredClone(input);
  const war = warFor(w, warId);
  const t = theatreOf(war)!;
  const P = w.playerHouseId;
  const p = t.plans[P] ??= { ...DEFAULT_INSTRUCTIONS, doctrines: [], familiarity: 40, against: {} };
  const cost = f(p);
  p.familiarity = clamp(p.familiarity - cost, 0, 100);
  return w;
}

export const setInstruction = <K extends keyof Instructions>(input: World, warId: string, key: K, value: Instructions[K]): World =>
  changePlan(input, warId, (p) => { if (p[key] === value) return 0; (p as Instructions)[key] = value; return 6; });

export function setDoctrines(input: World, warId: string, ids: DoctrineId[]): World {
  const clean = [...new Set(ids)].filter((d) => d in DOCTRINES).slice(0, MAX_DOCTRINES);
  return changePlan(input, warId, (p) => { const changed = clean.filter((d) => !p.doctrines.includes(d)).length + p.doctrines.filter((d) => !clean.includes(d)).length; p.doctrines = clean; return changed * 12; });
}

export const setAgainst = (input: World, warId: string, enemyGroup: string, o: Opp): World =>
  changePlan(input, warId, (p) => { if (o === 'none') delete p.against[enemyGroup]; else p.against[enemyGroup] = o; return 0; });

/** The Spymaster sends people to look at a place: costs othes, and shows what is there for a while. */
export function cannotProbe(w: World, warId: string, node: string): string | null {
  const war = w.war?.wars.find((x) => x.id === warId && x.status === 'active');
  if (!war) return 'No such war.';
  const t = theatreOf(war);
  if (!t?.nodes[node]) return 'No such place.';
  if ((t.probes[node] ?? 0) > absoluteCycle(w.date)) return 'Our people are already there.';
  if (econ(w, w.playerHouseId).stock.othes < PROBE_COST) return `A probe costs ${fmt(PROBE_COST)} othes.`;
  return null;
}
export const PROBE_COST = 400;
export function probe(input: World, warId: string, node: string): World {
  const why = cannotProbe(input, warId, node);
  if (why) throw new Error(why);
  const w = structuredClone(input);
  const war = warFor(w, warId);
  const t = theatreOf(war)!;
  econ(w, w.playerHouseId).stock.othes -= PROBE_COST;
  t.probes[node] = absoluteCycle(w.date) + 16;
  updateSight(w, war, t);
  say(t, w, `The Spymaster's people go to look at ${t.nodes[node]!.name}.`);
  return w;
}

// ---------------------------------------------------------------- sight

function spymasterEye(w: World, h: string): number {
  const s = Object.values(w.characters).find((c) => c.alive && c.houseId === h && c.seat === 'spymaster');
  return s ? s.stats.intrigue : w.houses[h] ? 6 : 10 * profileOf(h).influence;
}

/** How hard a group is to see: 0 plain .. 2 nearly invisible. */
function hiding(t: TheatreState, g: WGroup): number {
  let h = 0;
  if (ROLE_DEF[g.role].hidden && !g.engaged) h++;
  if (t.nodes[g.at]?.dark) h++;
  if (has(t, g.house, 'silent')) h++;
  // Our own screens hide what stands with them and next to them.
  if (Object.values(t.groups).some((x) => x.side === g.side && (x.role === 'screen' || x.role === 'fighters') && (x.at === g.at || neighbours(t, x.at).some((nb) => nb.id === g.at)))) h++;
  return clamp(h, 0, 2);
}

/** What each side sees of the other's groups. Last sightings are kept, going stale. */
export function updateSight(w: World, war: War, t: TheatreState): void {
  const now = absoluteCycle(w.date);
  for (const side of ['attackers', 'defenders'] as const) {
    const mine = groupsOf(t, side);
    const eyes: Record<string, number> = {};
    const see = (id: string, lv: number) => { eyes[id] = Math.max(eyes[id] ?? 0, lv); };
    for (const g of mine) {
      const r = g.role;
      see(g.at, r === 'shadow' || r === 'infiltrator' ? 4 : 3);
      const reach = r === 'picket' ? 2 : r === 'screen' || r === 'fighters' || r === 'shadow' || r === 'infiltrator' ? 1 : 1;
      const lv = r === 'picket' || r === 'shadow' || r === 'infiltrator' ? 3 : r === 'screen' || r === 'fighters' ? 2 : 1;
      const seen = new Set([g.at]);
      let ring = [g.at];
      for (let d = 1; d <= reach; d++) {
        const next: string[] = [];
        for (const id of ring) for (const nb of neighbours(t, id)) if (!seen.has(nb.id)) { seen.add(nb.id); next.push(nb.id); see(nb.id, d === 1 ? lv : lv - 1); }
        ring = next;
      }
    }
    for (const n of Object.values(t.nodes)) if (n.holder === side && (n.garrison > 0 || n.kind === 'station')) see(n.id, 2);
    for (const [id, until] of Object.entries(t.probes)) if (until > now && sideOfHouse(war, w.playerHouseId) === side) see(id, 3);
    const lead = side === 'attackers' ? war.attacker : war.defender;
    const eye = spymasterEye(w, lead);
    const whisper = has(t, lead, 'whispers') ? 1 : 0;
    const sight = t.sight[side];
    for (const g of groupsOf(t, other(side))) {
      let lv = (eyes[g.at] ?? (eye >= 14 && t.nodes[g.at]?.owner === g.side ? 1 : 0)) - hiding(t, g) + whisper;
      if (eyes[g.at] === 4) lv = 3;
      lv = clamp(lv, 0, 3);
      const n = g.role === 'decoy' ? g.n * 3 : g.n;
      if (lv > 0) sight[g.id] = { level: lv as Sight['level'], at: g.at, n, cycle: now, role: lv >= 3 ? g.role : sight[g.id]?.role };
      else if (sight[g.id]) sight[g.id]!.level = 0;
    }
    for (const id of Object.keys(sight)) if (!t.groups[id]) delete sight[id];
  }
}

/** What our side knows of an enemy group: exact at 3, a fair estimate at 2, a rumour at 1. */
export function estimate(t: TheatreState, side: WSide, gid: string): { n: number; spread: number; level: number; at: string; stale: number; role?: Role } | null {
  const s = t.sight[side][gid];
  if (!s) return null;
  const spread = s.level >= 3 ? 0 : s.level === 2 ? 0.1 : 0.4;
  return { n: s.n, spread: s.level === 0 ? 0.5 : spread, level: s.level, at: s.at, stale: s.cycle, role: s.role };
}

// ---------------------------------------------------------------- judgement

function roleX(g: WGroup, attacking: boolean, encircle: boolean, enemy: WGroup[]): number {
  const fighterScreen = enemy.some((e) => e.role === 'fighters');
  switch (g.role) {
    case 'spearhead': return attacking ? (enemy.some((e) => e.role === 'anvil') ? 1.0 : 1.15) : 1;
    case 'anvil': return attacking ? 0.95 : 1.2;
    case 'hammer': return g.joined || encircle ? 1.35 : 1.0;
    case 'rearguard': return attacking ? 0.95 : 1.15;
    case 'anchor': return attacking ? 0.9 : 1.1;
    case 'raider': return 0.85;
    case 'infiltrator': return 0.8;
    case 'siege': return 0.95;
    case 'reserve': case 'squadron': return 1.1;
    case 'bait': return 0.9;
    case 'lance': return 1.1;
    case 'line': return 1.1;
    case 'guard': return attacking ? 1 : 1.05;
    case 'strike': return attacking ? (fighterScreen ? 1.0 : 1.15) : 1;
    case 'wing': return fighterScreen ? 1.0 : 1.2;
    case 'picket': return 0.85;
    case 'blockade': return attacking ? 1 : 1.05;
    case 'laneRaider': return 0.85;
    case 'gunline': return 0.9;
    case 'decoy': return 0.7;
    case 'shadow': return 0.8;
    default: return 1;
  }
}

/** Weigh a fight at a place between the two sides' groups there. */
function judge(w: World, war: War, t: TheatreState, node: WNode, A: WGroup[], D: WGroup[], attack: WSide): Judged {
  const mults: Mult[] = [];
  const add = (label: string, side: WSide, x: number) => { if (Math.abs(x - 1) >= 0.005) mults.push({ label, side, x: Math.round(x * 100) / 100 }); };
  const sides: Record<WSide, WGroup[]> = attack === 'attackers' ? { attackers: A, defenders: D } : { attackers: D, defenders: A };
  const E0: Record<WSide, number> = { attackers: 0, defenders: 0 };
  const encircle: Record<WSide, boolean> = { attackers: false, defenders: false };
  const now = absoluteCycle(w.date);
  const domain: Domain = (A[0] ?? D[0])!.domain;
  for (const s of ['attackers', 'defenders'] as const) {
    const gs = sides[s];
    const foe = sides[other(s)];
    const attacking = s === attack;
    const lead = gs.slice().sort((a, b) => weightOf(w, b) - weightOf(w, a))[0];
    const h = lead?.house ?? (s === 'attackers' ? war.attacker : war.defender);
    const plan = planOf(t, h);
    const wt = gs.map((g) => weightOf(w, g) * g.quality);
    const tot = wt.reduce((a, b) => a + b, 0) || 1;
    E0[s] = tot;
    const avg = (f: (g: WGroup) => number) => gs.reduce((a, g, i) => a + f(g) * wt[i]!, 0) / tot;
    if (!gs.length) continue;
    // Who leads it.
    const cmd = Math.max(...gs.map((g) => commanderOfGroup(w, g).skill));
    add(`Command (${fmt(cmd)})`, s, 1 + (cmd - 10) / 40);
    const freeGood = gs.some((g) => g.leash === 'free' && commanderOfGroup(w, g).skill >= 14), freeBad = gs.some((g) => g.leash === 'free' && commanderOfGroup(w, g).skill < 10);
    if (freeGood) add('A free hand, well used', s, 1.08);
    if (freeBad) add('A free hand, badly used', s, 0.92);
    add('Morale', s, 0.72 + avg((g) => g.morale) / 250);
    const tired = avg((g) => g.fatigue);
    if (tired > 0.05) add('Tired', s, 1 - 0.35 * tired);
    const sup = avg((g) => g.supply);
    if (sup < 0.95) add('Supply', s, 0.6 + 0.4 * sup);
    add('Familiar with the plan', s, 0.9 + 0.2 * plan.familiarity / 100);
    // What each group was told to be.
    const enc = gs.some((g) => g.role === 'hammer' && (g.joined || foe.some((f) => f.pinned && f.pinned > now))) || new Set(gs.map((g) => g.prev).filter(Boolean)).size >= 2 && gs.length >= 2 && attacking;
    encircle[s] = enc;
    add('Roles', s, avg((g) => roleX(g, attacking, enc, foe)));
    add('Duties', s, avg((g) => (g.duty === 'attack' && attacking ? 1.05 : g.duty === 'defend' && !attacking ? 1.08 : g.duty === 'support' ? 0.95 : 1)));
    if (enc) add('Struck from two sides', s, 1.25);
    // Unseen until it struck.
    const unseen = gs.filter((g) => (t.sight[other(s)][g.id]?.level ?? 0) < 2);
    if (unseen.length) add('They did not see us coming', s, 1 + (has(t, h, 'silent') ? 0.3 : 0.2) * unseen.reduce((a, g) => a + weightOf(w, g) * g.quality, 0) / tot);
    // They walked into it.
    if (!attacking && foe.some((f) => f.lured && f.lured > now - 8) && gs.some((g) => g.role === 'anvil' || g.role === 'anchor')) add('The bait drew them in', s, 1.3);
    // Walls count in the strength itself, as a prepared defence does: a fortress wants three to one. Siege guns
    // take half of that back.
    if (node.fort && node.holder === s && domain === 'ground') {
      const sieged = foe.some((g) => g.role === 'siege');
      const eff = Math.max(0, node.fort - (sieged ? 1.5 : 0));
      if (eff > 0) { const x = 1 + 0.3 * eff; E0[s] *= x; mults.push({ label: `Walls (${Math.round(node.fort * 10) / 10}${sieged ? ', under their siege guns' : ''})`, side: s, x: Math.round(x * 100) / 100, base: true }); }
      if (has(t, h, 'fortress')) add('Fortress doctrine', s, 1.15);
    }
    // Coming down onto a defended world.
    if (attacking && domain === 'ground' && node.kind === 'ground' && node.owner !== s && gs.some((g) => g.since >= now - 2) && (sides[other(s)].length > 0)) add('Landing under fire', s, has(t, h, 'drop') ? 0.9 : 0.75);
    if (node.kind === 'station' && node.holder === s && domain === 'ground') add('Station decks', s, 1.1);
    // The sky above.
    if (domain === 'ground' && node.kind === 'ground') {
      const orbit = t.nodes[`${node.id.slice(0, -2)}:o`];
      if (orbit?.holder === s) {
        const guns = groupsAt(t, orbit.id, s, 'void').some((g) => g.role === 'gunline');
        add(guns ? 'Guns from orbit' : 'We hold the sky', s, guns ? 1.35 : 1.15);
        if (attacking && has(t, h, 'drop')) add('Orbital drop', s, 1.2);
      }
    }
    // Ships against ships: a house's own orbit has its defence platforms, a station its guns.
    if (domain === 'void' && node.holder === s && node.owner === s) {
      if (node.kind === 'orbit') { const ground = t.nodes[`${node.id.slice(0, -2)}:g`]; add('Orbital defences', s, 1 + 0.15 * (ground?.fort ?? 1)); }
      if (node.kind === 'station') add('Station guns', s, 1.15);
    }
    if (domain === 'void') {
      const guarded = gs.some((g) => g.role === 'guard');
      if (gs.some((g) => g.great.length) && guarded) add('Great ships guarded', s, 1.04);
      if (has(t, h, 'voidFirst')) add('Void first', s, 1.15);
    } else if (has(t, h, 'voidFirst')) {
      const target = Object.values(t.nodes).find((n) => n.kind === 'orbit' && n.target);
      if (target && target.holder !== s) add('Void first: troops wait', s, 0.95);
    }
    // Doctrine.
    if (has(t, h, 'shock')) add(gs.some((g) => g.fought === 0) ? 'Shock' : 'Shock, spent', s, gs.some((g) => g.fought === 0) ? 1.2 : 0.97);
    if (has(t, h, 'concentration') && gs.length >= 2) add('Concentration', s, 1.12);
    if (plan.width <= 1 && gs.length >= 2) add('A narrow front', s, 1.08);
    if (plan.width >= 3 && gs.length === 1) add('Spread thin', s, 0.95);
    if (has(t, h, 'attrition')) add('Attrition', s, 0.95);
    if (has(t, h, 'silent')) add('Silent Wire', s, 0.97);
    if (attacking && foe.length && has(t, foe[0]!.house, 'elastic') && foe.some((f) => f.won === 0 && f.fought > 0)) add('Following an elastic defence', s, 0.9);
    if (plan.risk >= 3) add('Boldness', s, 1 + 0.04 * (plan.risk - 2));
    if (plan.risk <= 1) add('Care', s, 0.97);
    // Knights.
    const kn = gs.reduce((a, g) => a + g.knights.length, 0);
    if (kn && plan.knights === 'lead') add('Knights at the front', s, Math.min(1.15, 1 + 0.03 * kn));
    if (kn && plan.knights === 'hunt' && foe.some((f) => f.knights.length)) add('Knights hunting knights', s, 1.06);
    if (has(t, h, 'whispers')) add('They read our plan badly', other(s), 0.97);
    // What the house is short of shows in the fight.
    const st = w.economy?.houses[h]?.stock;
    if (st && st.components <= 0) add('Arms wearing out: no components', s, 0.93);
    if (st && st.provisions <= 0) add('Hungry', s, 0.9);
    if (domain === 'void' && gs.some((g) => g.dry)) add('Short of fuel', s, 0.85);
  }
  const Ms = { attackers: 1, defenders: 1 } as Record<WSide, number>;
  for (const m of mults) if (!m.base) Ms[m.side] *= m.x;
  const rel = clamp(Ms.attackers / Ms.defenders, 0.25, 3.5);
  const base = (E0.attackers / Math.max(1e-6, E0.defenders)) ** 2;
  const R = base * rel;
  const p = R / (1 + R);
  // Effective strengths, for losses: the multipliers split between the sides.
  const E = { attackers: E0.attackers * Math.sqrt(rel), defenders: E0.defenders };
  return { attack, base, mults, rel, p, E, encircle };
}

const domainLabel = (d: Domain) => (d === 'ground' ? 'troops' : 'ships');

/** What a fight costs each side, as shares of what it brought. */
function lossShares(w: World, t: TheatreState, j: Judged, winner: WSide, groups: Record<WSide, WGroup[]>, node: WNode): Record<WSide, number> {
  const loser = other(winner);
  const ratio = j.E[winner] / Math.max(1e-6, j.E[loser]);
  const out = { attackers: 0, defenders: 0 } as Record<WSide, number>;
  out[winner] = clamp(0.035 / Math.sqrt(Math.max(0.1, ratio)), 0.01, 0.2);
  out[loser] = clamp(0.09 * Math.sqrt(Math.max(0.1, ratio)), 0.03, 0.45);
  for (const s of ['attackers', 'defenders'] as const) {
    const h = groups[s][0]?.house;
    if (!h) continue;
    const plan = planOf(t, h);
    if (has(t, h, 'attrition')) out[s] *= 0.85;
    out[s] *= 1 + 0.08 * (plan.risk - 2);
    const foe = groups[other(s)][0]?.house;
    if (foe && planOf(t, foe).quarter === 'none') out[s] *= 1.2;
  }
  const wh = groups[winner][0]?.house;
  if (wh) {
    const pursuit = planOf(t, wh).pursuit + (groups[winner].some((g) => g.role === 'pursuer') ? 2 : 0);
    out[loser] *= 1 + 0.12 * (pursuit - 2);
  }
  if (j.encircle[winner] && !escapeFor(t, groups[loser], node)) out[loser] *= 2;
  const lh = groups[loser][0]?.house;
  if (lh && has(t, lh, 'elastic') && !j.encircle[winner]) out[loser] *= 0.7;
  // A landing thrown back is cut down on the way back up to its ships.
  if (j.mults.some((m) => m.side === loser && m.label === 'Landing under fire')) out[loser] *= 1.5;
  // A rearguard at the place or on the way out.
  if (groups[loser].some((g) => g.role === 'rearguard') || (lh && Object.values(t.groups).some((g) => g.side === loser && g.role === 'rearguard' && neighbours(t, node.id).some((nb) => nb.id === g.at)))) out[loser] *= 0.6;
  out[loser] = clamp(out[loser], 0.02, 0.7);
  void w;
  return out;
}

/** Where beaten groups can go: back the way they came, or to any next place the enemy does not hold. */
function escapeFor(t: TheatreState, gs: WGroup[], node: WNode): string | undefined {
  const side = gs[0]?.side;
  if (!side) return undefined;
  const opts = neighbours(t, node.id).map((nb) => nb.id).filter((id) => {
    const n = t.nodes[id]!;
    if (gs[0]!.domain === 'void' && n.kind === 'ground') return false;
    if (n.kind === 'ground' && n.owner !== side) return false;
    return !groupsAt(t, id, other(side)).some((g) => g.duty !== 'support' || g.role === 'pursuer');
  });
  const back = gs.map((g) => g.prev).find((p) => p && opts.includes(p));
  if (back) return back;
  return opts.sort((a, b) => (t.nodes[a]!.owner === side ? -1 : 0) - (t.nodes[b]!.owner === side ? -1 : 0))[0];
}

/** Take losses from a group: soldiers or hulls, and from the formations they came from. */
function bleedGroup(w: World, war: War, g: WGroup, share: number, rng: Rng, why: string): number {
  const raw = g.n * share;
  const lost = Math.min(g.n, g.domain === 'void' ? Math.floor(raw) + (rng.chance(raw - Math.floor(raw)) ? 1 : 0) : rnd(raw));
  if (lost <= 0) return 0;
  if (g.domain === 'void') {
    let left = lost;
    for (const k of ['fighter', 'gunship', 'destroyer', 'cruiser'] as HullType[]) { const m = Math.min(g.hulls[k], Math.ceil(left * (k === 'fighter' ? 0.6 : k === 'gunship' ? 0.6 : 1))); g.hulls[k] -= m; left -= m; if (left <= 0) break; }
    fixHulls(g);
  }
  const tot = g.from.reduce((a, s) => a + s.n, 0) || 1;
  for (const s of g.from) {
    const m = Math.min(s.n, rnd(lost * s.n / tot));
    s.n -= m;
    const f = w.war!.formations[s.formationId];
    if (f) f.strength = Math.max(0, f.strength - m);
  }
  g.n = Math.max(0, g.n - lost);
  war.losses[g.house] = (war.losses[g.house] ?? 0) + (g.domain === 'void' ? lost * 300 : lost);
  // Great ships take harm when the fleet does (not in a forecast: the ships are the real ones).
  if (war.theatre?.sim) return lost;
  for (const id of g.great.slice()) {
    const sh = w.fleet?.ships[id];
    if (!sh || sh.lost) continue;
    if (!rng.chance(clamp(share * 2.2 * (g.role === 'guard' ? 0.5 : 1), 0, 0.8))) continue;
    sh.condition = Math.max(0, sh.condition - rng.int(8, 40) * (hasFit(sh, 'shields') ? 0.5 : 1));
    shipLog(w, sh, `Hurt in ${why}`, 2);
    if (sh.condition <= 0) {
      sh.lost = { date: w.date, how: `lost in ${why}` };
      lostShip(w, sh, `lost in ${why}`);
      g.great = g.great.filter((x) => x !== id);
      logRecord(w, { kind: 'world', type: 'fight', severity: sh.houseId === w.playerHouseId ? 3 : 1, text: `The great ship ${sh.name} of House ${houseName(w, sh.houseId)} is lost in ${why}.`, houseIds: [sh.houseId].filter((x) => !!w.houses[x]) });
    }
  }
  return lost;
}

function fixHulls(g: WGroup): void {
  const tot = HULL_TYPES.reduce((a, k) => a + g.hulls[k], 0);
  if (tot !== g.n) g.hulls.fighter = Math.max(0, g.hulls.fighter + g.n - tot);
  if (HULL_TYPES.reduce((a, k) => a + g.hulls[k], 0) !== g.n) g.hulls = mixFor(g.n);
}

/** Knights in a lost fight, or a won one at the front, may be hurt or killed. */
function knightsAtRisk(w: World, g: WGroup, won: boolean, t: TheatreState, rng: Rng, why: string, hunted: boolean): void {
  const plan = planOf(t, g.house);
  for (const id of g.knights.slice()) {
    const c = w.characters[id];
    if (!c?.alive) { g.knights = g.knights.filter((k) => k !== id); continue; }
    const risk = (won ? 0.01 : 0.035) * (plan.knights === 'lead' ? 1.5 : plan.knights === 'reserve' ? 0.4 : 1) * (g.role === 'lance' ? 1.6 : 1) * (hunted ? 2 : 1);
    if (rng.chance(risk)) { kill(w, c, w.date, `fell in ${why}`); g.knights = g.knights.filter((k) => k !== id); }
    else if (rng.chance(risk * 3) && !c.flags.some((f) => f.id === 'wounded')) c.flags.push({ id: 'wounded', since: w.date });
  }
}

// ---------------------------------------------------------------- a fight

/** Garrison troops as a group of their own, for the fight. */
function garrisonGroup(war: War, node: WNode): WGroup | null {
  if (!node.garrison || !node.holder || node.holder !== node.owner || !node.house) return null;
  return {
    id: `garrison:${node.id}`, name: `the garrison of ${node.name}`, house: node.house, side: node.holder, domain: 'ground', n: node.garrison, from: [], hulls: { cruiser: 0, destroyer: 0, gunship: 0, fighter: 0 },
    great: [], knights: [], quality: Math.round(profileOf(node.house).quality * 0.9 * 100) / 100, at: node.id, path: [], role: 'anchor', duty: 'defend', leash: 'tight', fallback: 0,
    morale: 70, fatigue: 0, supply: 1, start: node.garrisonMax, fought: 1, won: 0, since: 0, commanderName: 'the garrison commander', commanderSkill: 10,
  };
  void war;
}

/** Does a side want this fight? */
const wants = (gs: WGroup[], holds: boolean) => gs.some((g) => g.duty === 'attack') || (holds && gs.length > 0) || gs.some((g) => g.duty === 'defend' && g.role !== 'raider');

function contactsAt(w: World, war: War, t: TheatreState, rng: Rng): void {
  const P = w.playerHouseId;
  const now = absoluteCycle(w.date);
  const ourSide = sideOfHouse(war, P);
  for (const node of Object.values(t.nodes)) {
    for (const domain of ['ground', 'void'] as const) {
      if (!fightsHere(domain, node.kind)) continue;
      if (t.contacts.some((c) => c.node === node.id && c.domain === domain)) continue;
      const a = groupsAt(t, node.id, 'attackers', domain).filter((g) => g.n > 0 && !g.engaged);
      const d = groupsAt(t, node.id, 'defenders', domain).filter((g) => g.n > 0 && !g.engaged);
      if (domain === 'ground') { const gg = garrisonGroup(war, node); if (gg) (gg.side === 'attackers' ? a : d).push(gg); }
      if (!a.length || !d.length) continue;
      // Who wants it. Raiders slip past anything twice their size; support groups stay out of it unless attacked.
      const slip = (mine: WGroup[], theirs: WGroup[]) => {
        const big = theirs.reduce((s, g) => s + weightOf(w, g), 0);
        return mine.every((g) => (g.role === 'raider' || g.role === 'laneRaider' || g.role === 'shadow' || g.role === 'infiltrator') && weightOf(w, g) * 2 < big);
      };
      if (slip(a, d) || slip(d, a)) continue;
      const aw = wants(a, node.holder === 'attackers'), dw = wants(d, node.holder === 'defenders');
      if (!aw && !dw) continue;
      // Avoid orders: we do not start a fight with what we were told to avoid.
      const attack: WSide = node.holder === 'defenders' ? 'attackers' : node.holder === 'attackers' ? 'defenders' : (Math.max(...a.map((g) => g.since)) >= Math.max(...d.map((g) => g.since)) ? 'attackers' : 'defenders');
      const aggressor = attack === 'attackers' ? a : d;
      const target = attack === 'attackers' ? d : a;
      const aggrHouse = aggressor[0]!.house;
      if (!aggressor.some((g) => g.duty === 'attack') && !wants(target, true)) continue;
      if (aggressor.every(() => planOf(t, aggrHouse).against[target[0]!.id] === 'avoid') && !target.some((g) => g.duty === 'attack')) continue;
      fight(w, war, t, node, domain, a, d, attack, rng, ourSide, P, now);
    }
  }
}

function fight(w: World, war: War, t: TheatreState, node: WNode, domain: Domain, a: WGroup[], d: WGroup[], attack: WSide, rng: Rng, ourSide: WSide | null, P: string, now: number): void {
  const j = judge(w, war, t, node, attack === 'attackers' ? a : d, attack === 'attackers' ? d : a, attack);
  const groups = { attackers: a, defenders: d };
  const oursIn = ourSide && groups[ourSide].some((g) => g.house === P);
  const weigh = (gs: WGroup[]) => gs.reduce((s, g) => s + weightOf(w, g), 0);
  const big = oursIn && weigh(groups[other(ourSide)]) >= 0.15 * weigh(groups[ourSide]) && weigh(groups[ourSide]) >= 0.15 * weigh(groups[other(ourSide)])
    && (domain === 'ground' ? groups[ourSide].reduce((s, g) => s + g.n, 0) >= 3000 || groups[ourSide].some((g) => g.knights.length) : groups[ourSide].reduce((s, g) => s + g.n, 0) >= 6 || groups[ourSide].some((g) => g.great.length));
  const live = (w.battles?.list ?? []).some((b) => b.status !== 'over' && b.kind === 'war');
  // Pin: whoever we were told to pin cannot leave.
  for (const s of ['attackers', 'defenders'] as const) {
    const plan = planOf(t, groups[s][0]!.house);
    for (const e of groups[other(s)]) if (plan.against[e.id] === 'pin' || groups[s].some((g) => g.role === 'anvil')) e.pinned = now + 4;
  }
  // The first clash of an engagement is fought in the battle engine; the rounds after it are settled here.
  const fresh = node.fought === undefined || now - node.fought > 24;
  if (big && !live && ourSide && fresh && !t.sim && !t.phase?.handsOff) {
    node.fought = now;
    const id = openBattle(w, war, t, node, domain, groups, j, ourSide, rng);
    for (const g of [...a, ...d]) if (!g.id.startsWith('garrison:')) g.engaged = id;
    t.contacts.push({ id, node: node.id, domain, battle: id, judged: j, since: now });
    return;
  }
  const winner: WSide = rng.chance(j.p) ? 'attackers' : 'defenders';
  settle(w, war, t, node, domain, groups, j, winner, rng);
}

/** The battle engine, for a big fight of ours. Its mass follows the odds; the shout comes first. */
function openBattle(w: World, war: War, t: TheatreState, node: WNode, domain: Domain, groups: Record<WSide, WGroup[]>, j: Judged, ourSide: WSide, rng: Rng): string {
  const R = j.p / (1 - j.p);
  const oursR = ourSide === 'attackers' ? R : 1 / R;
  const theirSide = other(ourSide);
  const us = groups[ourSide], them = groups[theirSide];
  const th: BattleTheatre = domain === 'void' ? (node.kind === 'station' ? 'station' : 'space') : node.kind === 'station' ? 'station' : rng.chance(0.25) ? 'atmo' : 'surface';
  const people = (gs: WGroup[]) => [...new Set(gs.flatMap((g) => [g.commanderId, ...g.knights]).filter((x): x is string => !!x))].filter((id) => w.characters[id]?.alive);
  const mk = (gs: WGroup[], side: WSide): { spec: FighterSpec[]; name: string; house: string; cmd: { id?: string; name?: string; skill?: number } } => {
    const lead = gs.slice().sort((a, b) => weightOf(w, b) - weightOf(w, a))[0]!;
    const c = commanderOfGroup(w, lead);
    const ids = people(gs).slice(0, 5);
    const spec: FighterSpec[] = ids.map((id, i) => ({ id, champion: i === 0 && w.characters[id]!.flags.some((f) => f.id === 'knighted') }));
    const q = profileOf(lead.house).knights;
    while (spec.length < 3) spec.push({ key: `${side}-${lead.id}-${spec.length}-${w.nextId}`, name: `a ${domain === 'void' ? 'gun captain' : 'sergeant'} of ${lead.name}`, power: 8 + rng.next() * 3 + q * 2 });
    return { spec, name: `${lead.name} of House ${houseName(w, lead.house)}`, house: lead.house, cmd: { id: c.id, name: c.name, skill: c.skill } };
  };
  const o = mk(us, ourSide), x = mk(them, theirSide);
  const title = `${domain === 'void' ? 'Battle at' : node.kind === 'ground' ? 'The fight for' : 'The decks of'} ${node.name}`;
  const b = createBattle(w, {
    kind: 'war', title, theatre: th, where: node.name, ref: war.id,
    ours: { name: o.name, houseId: w.playerHouseId, commander: o.cmd, mass: clamp(rnd(55 * oursR ** 0.6), 10, 120), fighters: o.spec, morale: rnd(us.reduce((a, g) => a + g.morale, 0) / us.length) },
    theirs: { name: x.name, houseId: x.house, commander: x.cmd, mass: clamp(rnd(55 / oursR ** 0.6), 10, 120), fighters: x.spec, morale: rnd(them.reduce((a, g) => a + g.morale, 0) / them.length) },
  });
  // The shout: one word to the whole field before it begins.
  const near = (pred: (g: WGroup) => boolean) => Object.values(t.groups).find((g) => g.side === ourSide && g.house === w.playerHouseId && !g.engaged && pred(g) && (g.at === node.id || neighbours(t, node.id).some((nb) => nb.id === g.at)));
  const hammer = near((g) => g.role === 'hammer' && g.domain === domain);
  const reserve = near((g) => (g.role === 'reserve' || g.role === 'squadron') && g.domain === domain);
  const orbit = domain === 'ground' && node.kind === 'ground' ? groupsAt(t, `${node.id.slice(0, -2)}:o`, ourSide, 'void')[0] : undefined;
  const lean = oursR >= 1.15 ? 'leans ours' : oursR <= 0.87 ? 'leans theirs' : 'could go either way';
  const big = j.mults.filter((m) => Math.abs(m.x - 1) >= 0.08).sort((p, q) => Math.abs(Math.log(q.x)) - Math.abs(Math.log(p.x))).slice(0, 4);
  const helps = (m: Mult) => (m.side === ourSide) === (m.x > 1);
  const word = (m: Mult) => `${m.side === ourSide ? 'our' : 'their'} ${m.label.toLowerCase()} ×${m.x}`;
  const forUs = big.filter(helps).map(word), against = big.filter((m) => !helps(m)).map(word);
  const reasons = [forUs.length ? `for us: ${forUs.join(', ')}` : '', against.length ? `against us: ${against.join(', ')}` : ''].filter(Boolean);
  const ourBase = ourSide === 'attackers' ? j.base : 1 / Math.max(1e-6, j.base);
  reasons.push(ourBase < 1 ? `their numbers ×${Math.round(100 / Math.max(0.01, ourBase)) / 100}` : `our numbers ×${Math.round(ourBase * 100) / 100}`);
  const options: { key: string; label: string; hint?: string }[] = [{ key: 'hold', label: 'Hold firm', hint: 'steadier, fewer losses' }];
  const fx: Record<string, ShoutFx> = { hold: { morale: 6, momentum: 2, note: 'Hold firm.' } };
  if (hammer) { options.push({ key: 'hammer', label: `Spring ${hammer.name}`, hint: 'it strikes now, from the flank' }); fx.hammer = { momentum: 16, mass: 1.25, join: hammer.id, note: `${hammer.name} comes in from the flank.` }; }
  if (reserve) { options.push({ key: 'reserve', label: `Commit ${reserve.name}`, hint: `${fmt(reserve.n)} fresh ${domainLabel(reserve.domain)}` }); fx.reserve = { mass: 1 + Math.min(0.6, reserve.n / Math.max(1, us.reduce((a, g) => a + g.n, 0))), join: reserve.id, note: `${reserve.name} is committed.` }; }
  if (us.some((g) => g.knights.length)) { options.push({ key: 'knights', label: 'Knights forward', hint: 'they lead it; they are at risk' }); fx.knights = { momentum: 10, note: 'The knights go forward.' }; }
  if (orbit) { options.push({ key: 'void', label: `Call down ${orbit.name}`, hint: 'fire from orbit' }); fx.void = { momentum: 12, note: `${orbit.name} fires on them from orbit.` }; }
  options.push({ key: 'break', label: 'Break contact', hint: 'fall back before it starts' });
  fx.break = { breakoff: true, note: 'We break contact.' };
  b.moment = { kind: 'shout', text: `${title}. Staff read: ${lean}${reasons.length ? `. ${reasons.join('; ')}` : ''}. One word to the field before it starts.`, options };
  b.raised.push('shout');
  (b as typeof b & { shouts?: Record<string, ShoutFx> }).shouts = fx;
  say(t, w, `${title}: ${o.name} against ${x.name}. The clock stops.`, true, ourSide);
  return b.id;
}

export interface ShoutFx { momentum?: number; mass?: number; morale?: number; breakoff?: boolean; join?: string; note: string }

/** Settle a fight: losses, retreats, the place, and the report. */
function settle(w: World, war: War, t: TheatreState, node: WNode, domain: Domain, groups: Record<WSide, WGroup[]>, j: Judged, winner: WSide, rng: Rng, battle?: string, shout?: string): Report {
  const loser = other(winner);
  const now = absoluteCycle(w.date);
  const title = `${domain === 'void' ? 'The fight at' : node.kind === 'ground' ? 'The battle for' : 'The boarding of'} ${node.name}`;
  const shares = lossShares(w, t, j, winner, groups, node);
  const before = { attackers: groups.attackers.reduce((a, g) => a + g.n, 0), defenders: groups.defenders.reduce((a, g) => a + g.n, 0) };
  const losses = { attackers: 0, defenders: 0 } as Record<WSide, number>;
  const huntHouse = (s: WSide) => groups[other(s)][0] && has(t, groups[other(s)][0]!.house, 'knightHunt');
  for (const s of ['attackers', 'defenders'] as const) {
    for (const g of groups[s]) {
      if (g.id.startsWith('garrison:')) {
        const lost = Math.min(node.garrison, rnd(node.garrison * shares[s]));
        node.garrison -= lost; losses[s] += lost;
        war.losses[g.house] = (war.losses[g.house] ?? 0) + lost;
        continue;
      }
      losses[s] += bleedGroup(w, war, g, shares[s], rng, title);
      g.fought++;
      if (s === winner) g.won++;
      g.morale = clamp(g.morale + (s === winner ? 6 : -12), has(t, g.house, 'discipline') ? 40 : 5, 100);
      g.fatigue = clamp(g.fatigue + 0.12, 0, 1);
      g.engaged = undefined;
      g.joined = false;
      if (domain === 'ground' && !t.sim) knightsAtRisk(w, g, s === winner, t, rng, title, !!huntHouse(s));
    }
  }
  // Every fight wears arms and ships: components for the wear, a little navisium for the shard arms, and a lane's
  // fuel from every ship in it.
  const byHouse = new Map<string, { soldiers: number; hulls: number; fuel: number }>();
  for (const g of [...groups.attackers, ...groups.defenders]) {
    if (g.id.startsWith('garrison:')) continue;
    const b = byHouse.get(g.house) ?? { soldiers: 0, hulls: 0, fuel: 0 };
    if (g.domain === 'ground') b.soldiers += g.n; else { b.hulls += g.n + g.great.length; b.fuel += legFuel(w, g); }
    byHouse.set(g.house, b);
  }
  for (const [h, b] of byHouse) {
    const bill = {
      components: Math.round((b.soldiers / FIGHT_WEAR.soldiersPerComponent + b.hulls * FIGHT_WEAR.componentsPerHull) * 10) / 10,
      navisium: Math.round((b.soldiers / FIGHT_WEAR.soldiersPerNavisium + b.hulls / FIGHT_WEAR.hullsPerNavisium) * 10) / 10,
      fuel: Math.round(b.fuel * 10) / 10,
    };
    payWar(w, t, h, bill, title);
  }
  // The beaten go back, or are taken.
  const encircled = j.encircle[winner] && !escapeFor(t, groups[loser].filter((g) => !g.id.startsWith('garrison:')), node);
  const out = escapeFor(t, groups[loser].filter((g) => !g.id.startsWith('garrison:')), node);
  for (const g of groups[loser]) {
    if (g.id.startsWith('garrison:')) continue;
    // On their own world with nowhere to go, they fight on where they stand.
    if (!out && node.owner === loser && !encircled) { g.morale = clamp(g.morale - 5, 5, 100); continue; }
    if (encircled || !out) {
      // Cut off: what is left gives up.
      if (g.n < g.start * 0.35 || rng.chance(0.5)) { losses[loser] += g.n; war.losses[g.house] = (war.losses[g.house] ?? 0) + (g.domain === 'void' ? g.n * 300 : g.n); bleedGroup(w, war, g, 1, rng, title); say(t, w, `${g.name} of House ${houseName(w, g.house)} is cut off at ${node.name} and gives up.`, true, loser); continue; }
    }
    if (out) { g.prev = g.at; g.at = out; g.since = now; g.path = []; g.to = undefined; g.arrive = undefined; g.pinned = undefined; }
  }
  // A garrison left alone against a host three times its strength is overrun.
  if (domain === 'ground' && node.owner === loser && node.garrison > 0 && groups[loser].every((g) => g.id.startsWith('garrison:')) && j.E[winner] > 3 * j.E[loser]) {
    losses[loser] += node.garrison; node.garrison = 0;
  }
  // The winners hold the place.
  if (domain === 'ground' ? true : node.kind !== 'station') {
    const garrisonLeft = node.owner === loser ? node.garrison : 0;
    if (!(domain === 'ground' && garrisonLeft > node.garrisonMax * 0.1 && node.holder === loser)) node.holder = winner;
  }
  // Winners who were told to pursue follow.
  for (const g of groups[winner]) if (g.role === 'pursuer' && out && !g.id.startsWith('garrison:') && !cannotEnter(w, war, t, g, out)) { g.prev = g.at; g.at = out; g.since = now; }
  // What is left of a broken group scatters.
  for (const id of Object.keys(t.groups)) { const g = t.groups[id]!; if (g.n <= 0 || (g.domain === 'ground' && g.n < 150 && g.start >= 1500)) { if (g.n > 0) { losses[g.side] += g.n; bleedGroup(w, war, g, 1, rng, title); } delete t.groups[id]; } }
  // The score: a world's own defence counts double.
  const home = node.kind === 'ground' && node.owner ? 2 : 1;
  const weight = clamp((losses.attackers + losses.defenders) / (domain === 'ground' ? 6000 : 6), 0.5, 3) * home;
  war.score = clamp(war.score + (winner === 'attackers' ? 1 : -1) * (2.5 + 3 * weight), -100, 100);
  const quarter = planOf(t, groups[winner][0]?.house ?? '').quarter;
  if (!t.sim && quarter === 'none' && groups[winner][0]) { const h = groups[winner][0]!.house; if (w.houses[h]) w.houses[h]!.standing.honour = clamp(w.houses[h]!.standing.honour - 1, 0, 100); shiftRegard(w, groups[loser][0]?.house ?? '', h, -3); }
  if (!t.sim && quarter === 'ransom' && w.houses[groups[winner][0]?.house ?? ''] && domain === 'ground') econ(w, groups[winner][0]!.house).stock.othes += rnd(losses[loser] * 0.4);
  const names = (s: WSide) => groups[s].map((g) => g.name);
  const why = j.mults.filter((m) => m.side === winner ? m.x > 1.04 : m.x < 0.96).sort((p, q) => Math.abs(Math.log(q.x)) - Math.abs(Math.log(p.x))).slice(0, 4).map((m) => `${m.side === winner ? '' : 'their '}${m.label.toLowerCase()} ×${m.x}`);
  const wh = groups[winner][0]?.house ?? '', lh = groups[loser][0]?.house ?? '';
  const text = `${title}: House ${houseName(w, wh)} ${winner === j.attack ? 'takes it' : 'holds'}. ${fmt(losses[loser])} ${domainLabel(domain)} of House ${houseName(w, lh)} lost${encircled ? ', cut off' : ''}; ${fmt(losses[winner])} of House ${houseName(w, wh)}.`;
  const rep: Report = {
    id: `ar${t.next++}`, cycle: now, date: w.date, where: node.name, title, domain,
    sides: {
      attackers: { groups: groups.attackers.map((g) => g.id), names: names('attackers'), n: before.attackers, q: groups.attackers[0]?.quality ?? 1, house: groups.attackers[0]?.house ?? war.attacker },
      defenders: { groups: groups.defenders.map((g) => g.id), names: names('defenders'), n: before.defenders, q: groups.defenders[0]?.quality ?? 1, house: groups.defenders[0]?.house ?? war.defender },
    },
    base: Math.round(j.base * 100) / 100, mults: j.mults, rel: Math.round(j.rel * 100) / 100, p: Math.round(j.p * 100) / 100, winner, losses, encircled, battle, shout, text, why,
  };
  t.reports.unshift(rep);
  t.reports = t.reports.slice(0, 40);
  say(t, w, text, weight >= 1 || groups.attackers.concat(groups.defenders).some((g) => g.house === w.playerHouseId), winner);
  return rep;
}

// ---------------------------------------------------------------- movement, supply, control

/** Transports caught in the void without ships of their own side. */
function caughtInTransit(w: World, war: War, t: TheatreState, rng: Rng): void {
  for (const g of Object.values(t.groups)) {
    if (g.domain !== 'ground') continue;
    const n = t.nodes[g.at]!;
    if (!isVoid(n.kind) || n.kind === 'station') continue;
    const foes = groupsAt(t, g.at, other(g.side), 'void').filter((x) => x.duty !== 'support' || x.role === 'wing');
    if (!foes.length) continue;
    if (groupsAt(t, g.at, g.side, 'void').some((x) => x.role === 'escort' || x.duty !== 'support')) continue;
    const share = foes.some((x) => x.role === 'wing') ? 0.08 : 0.04;
    const lost = bleedGroup(w, war, g, share, rng, `the ambush at ${n.name}`);
    g.morale = clamp(g.morale - 8, 5, 100);
    say(t, w, `${g.name} of House ${houseName(w, g.house)} is caught in its transports at ${n.name}: ${fmt(lost)} lost.`, g.house === w.playerHouseId, other(g.side));
    if (g.prev && !groupsAt(t, g.prev, other(g.side), 'void').length) { const p = g.prev; g.prev = g.at; g.at = p; g.path = []; g.to = undefined; g.arrive = undefined; }
  }
}

function move(w: World, war: War, t: TheatreState): void {
  const now = absoluteCycle(w.date);
  for (const g of Object.values(t.groups)) {
    if (g.engaged) continue;
    if (g.pinned && g.pinned > now && groupsAt(t, g.at, other(g.side)).length) continue;
    if (!g.path.length || g.arrive === undefined || (g.hold && g.hold > now)) { g.fatigue = clamp(g.fatigue - 0.04, 0, 1); continue; }
    if (g.arrive > now) { g.fatigue = clamp(g.fatigue + 0.015 * (1 + planOf(t, g.house).tempo * 0.25), 0, 1); continue; }
    const next = g.path[0]!;
    if (cannotEnter(w, war, t, g, next)) { g.path = []; g.to = undefined; g.arrive = undefined; continue; }
    // The crossing burns fuel from the house's stores; a house that has none (and cannot buy it) is held where it is.
    const fuel = Math.round(legFuel(w, g) * edgeCycles(t, g.at, next) / 2 * 10) / 10;
    if (fuel > 0) {
      const met = payWar(w, t, g.house, { fuel }, `${g.name}: to ${t.nodes[next]!.name}`);
      if (met < 0.99) {
        if (!g.dry) say(t, w, `${g.name} of House ${houseName(w, g.house)} cannot move: no fuel.`, g.house === w.playerHouseId, g.side);
        g.dry = true; g.arrive = now + 2; continue;
      }
    }
    g.dry = false;
    // Landings come down in waves: one host every two turns onto a world that is not theirs.
    const land = t.nodes[next]!;
    if (land.kind === 'ground' && land.owner !== g.side) {
      if (land.landed !== undefined && now - land.landed < 4 && land.landedBy !== g.id) { g.arrive = now + 2; continue; }
      land.landed = now; land.landedBy = g.id;
    }
    // Arriving at a fight a friend is already in: that is a hammer falling.
    g.joined = groupsAt(t, next, other(g.side)).some((e) => e.pinned && e.pinned > now) || groupsAt(t, next, g.side).some((f) => f.fought > 0 && f.since < now - 2);
    g.prev = g.at; g.at = next; g.since = now; g.path.shift();
    g.arrive = g.path.length ? now + stepCycles(t, g, g.at, g.path[0]!) : undefined;
    if (!g.path.length) g.to = undefined;
  }
}

/** Supplied while there is a way home through places no enemy holds; raiders and blockades cut it. */
function supply(w: World, war: War, t: TheatreState): void {
  for (const side of ['attackers', 'defenders'] as const) {
    // Depots: our worlds, the stations we hold, and wherever our great ships are (their holds carry stores).
    const homes = Object.values(t.nodes).filter((n) => n.holder === side && (n.kind === 'station' || (n.owner === side && n.kind === 'ground'))).map((n) => n.id)
      .concat(groupsOf(t, side).filter((g) => g.great.length).map((g) => g.at));
    const ok = new Set(homes);
    let frontier = [...homes];
    while (frontier.length) {
      const next: string[] = [];
      for (const id of frontier) for (const nb of neighbours(t, id)) {
        if (ok.has(nb.id)) continue;
        const n = t.nodes[nb.id]!;
        if (n.holder === other(side) || groupsAt(t, nb.id, other(side), 'void').some((g) => g.role === 'blockade' || g.role === 'line')) continue;
        ok.add(nb.id); next.push(nb.id);
      }
      frontier = next;
    }
    const lead = side === 'attackers' ? war.attacker : war.defender;
    const plan = planOf(t, lead);
    // Raiders on our roads.
    const raided = groupsOf(t, other(side)).filter((g) => (g.role === 'raider' || g.role === 'laneRaider') && t.nodes[g.at]?.owner === side).length * (has(t, groupsOf(t, other(side))[0]?.house ?? '', 'supply') ? 2 : 1);
    const hungry = (w.economy?.houses[lead]?.stock.provisions ?? 1) <= 0;
    for (const g of groupsOf(t, side)) {
      const linked = ok.has(g.at) && !(hungry && w.economy?.houses[g.house]);
      const deep = (g.role === 'raider' || g.role === 'infiltrator') && has(t, g.house, 'deepRaid');
      const favour = plan.supply === 'balanced' ? 1 : (plan.supply === 'void') === (g.domain === 'void') ? 1.3 : 0.75;
      const isolate = groupsOf(t, other(side)).some((x) => planOf(t, x.house).against[g.id] === 'isolate') ? 1.5 : 1;
      g.supply = clamp(g.supply + (linked || deep ? 0.08 * favour : -0.07 * isolate) - raided * 0.015, 0, 1);
    }
  }
}

function hold(w: World, war: War, t: TheatreState): void {
  for (const n of Object.values(t.nodes)) {
    if (n.kind === 'ground') continue;
    const a = groupsAt(t, n.id, 'attackers', 'void').length, d = groupsAt(t, n.id, 'defenders', 'void').length;
    if (n.kind === 'station') {
      const ga = groupsAt(t, n.id, 'attackers', 'ground').length, gd = groupsAt(t, n.id, 'defenders', 'ground').length;
      if (ga && !gd && n.garrison <= n.garrisonMax * 0.1) n.holder = 'attackers';
      else if (gd && !ga && n.holder !== 'defenders' && n.garrison <= n.garrisonMax * 0.1) n.holder = 'defenders';
      continue;
    }
    if (a && !d) n.holder = 'attackers';
    else if (d && !a) n.holder = 'defenders';
  }
  // A world falls when no defender stands on it and its garrison is broken.
  for (const n of Object.values(t.nodes)) {
    if (n.kind !== 'ground' || !n.owner) continue;
    const foe = other(n.owner);
    const theirs = groupsAt(t, n.id, foe, 'ground').length, mine = groupsAt(t, n.id, n.owner, 'ground').length;
    if (theirs && !mine && n.garrison <= n.garrisonMax * 0.1 && n.holder !== foe) {
      n.holder = foe;
      war.score = clamp(war.score + (foe === 'attackers' ? 1 : -1) * (n.target ? 45 : n.capital ? 30 : 15), -100, 100);
      say(t, w, `${n.name} falls to House ${houseName(w, foe === 'attackers' ? war.attacker : war.defender)}.`, true, foe);
      if (!t.sim) logRecord(w, { kind: 'world', type: 'fight', severity: sideOfHouse(war, w.playerHouseId) ? 3 : 1, text: `${n.name} falls in ${war.name}.`, source: 'the Numarade' });
    }
    if (mine && !theirs && n.holder !== n.owner) n.holder = n.owner;
    // Walls are rebuilt slowly, garrisons refilled, while it holds.
    if (n.holder === n.owner && !theirs) n.garrison = Math.min(n.garrisonMax, n.garrison + Math.max(1, rnd(n.garrisonMax * 0.004)));
    if (theirs && groupsAt(t, n.id, foe, 'ground').some((g) => g.role === 'infiltrator' || g.role === 'siege') && n.fort > 0 && n.holder === n.owner) n.fort = Math.max(0, n.fort - 0.02);
  }
}

/** Raiders in their roads take their convoys: othes from a house we can see the treasury of, supply from all. */
function raids(w: World, war: War, t: TheatreState, rng: Rng): void {
  for (const g of Object.values(t.groups)) {
    if (g.role !== 'raider' && g.role !== 'laneRaider' && g.role !== 'blockade') continue;
    const n = t.nodes[g.at]!;
    if (n.owner !== other(g.side) && !(n.kind === 'lane' && g.role !== 'blockade')) continue;
    if (groupsAt(t, g.at, other(g.side), g.domain).some((x) => x.duty !== 'support' && x.role !== 'laneRaider')) continue;
    const foe = n.house ?? (g.side === 'attackers' ? war.defender : war.attacker);
    const take = rnd((g.domain === 'void' ? g.n * 30 : g.n / 40) * (has(t, g.house, 'supply') ? 2 : 1) * (g.role === 'blockade' ? 1.5 : 1) * (0.7 + rng.next() * 0.6));
    if (w.houses[foe]) econ(w, foe).stock.othes -= take;
    if (w.houses[g.house]) econ(w, g.house).stock.othes += rnd(take * 0.25);
    war.losses[foe] = (war.losses[foe] ?? 0) + rnd(take / 20);
    if (rng.chance(0.25)) say(t, w, `${g.name} takes House ${houseName(w, foe)}'s convoys at ${n.name}.`, false, g.side);
  }
}

// ---------------------------------------------------------------- the minds behind it

/** The player's groups and their commanders, between orders: roles do what they say, leashes decide how freely. */
function standingOrders(w: World, war: War, t: TheatreState, h: string): void {
  const now = absoluteCycle(w.date);
  for (const g of groupsOf(t, undefined, h)) {
    if (g.engaged) continue;
    const c = commanderOfGroup(w, g);
    // Falling back at the line we set.
    if (g.n < g.start * g.fallback && !g.falling) {
      const home = Object.values(t.nodes).find((n) => n.owner === g.side && (g.domain === 'void' ? n.kind === 'approach' : n.kind === 'ground' && n.capital));
      if (home && home.id !== g.at && sendTo(w, war, t, g, home.id)) { g.falling = true; say(t, w, `${g.name} falls back on ${home.name}, as ordered.`, false, g.side); }
      continue;
    }
    if (g.path.length) continue;
    // Reserves commit to a fight next to them, if the leash lets them.
    if ((g.role === 'reserve' || g.role === 'squadron') && g.leash !== 'tight') {
      const fightNear = t.contacts.find((x) => x.domain === g.domain && neighbours(t, g.at).some((nb) => nb.id === x.node));
      if (fightNear && sendTo(w, war, t, g, fightNear.node)) { say(t, w, `${c.name} commits ${g.name} to ${t.nodes[fightNear.node]!.name}.`, false, g.side); continue; }
    }
    if (g.leash !== 'free') continue;
    // A free hand: the commander acts on what they see. Good ones well, poor ones rashly.
    const seen = Object.entries(t.sight[g.side]).filter(([id, s]) => s.level >= 2 && t.groups[id]?.domain === g.domain);
    const near = seen.filter(([, s]) => neighbours(t, g.at).some((nb) => nb.id === s.at) && fightsHere(g.domain, t.nodes[s.at]!.kind));
    if (g.duty === 'attack' || g.role === 'pursuer') {
      const weak = near.filter(([, s]) => s.n * (c.skill >= 12 ? 1.0 : 2.5) < g.n).sort((a, b) => a[1].n - b[1].n)[0];
      if (weak && !cannotEnter(w, war, t, g, weak[1].at) && sendTo(w, war, t, g, weak[1].at)) { if (c.skill < 10) g.lured = now; say(t, w, `${c.name} takes ${g.name} after them at ${t.nodes[weak[1].at]!.name}.`, false, g.side); }
    }
  }
}

/** The AI: each house fights as it is known to, and a little better or worse as its commanders are. */
function aiTurn(w: World, war: War, t: TheatreState, h: string, rng: Rng, phase: boolean): void {
  const side = sideOfHouse(war, h)!;
  const d = doctrineOf(h, w);
  const now = absoluteCycle(w.date);
  const mine = groupsOf(t, side, h);
  const home = t.nodes[`${h}:ap`] ? h : side === 'attackers' ? war.attacker : war.defender;
  const theirHome = side === 'attackers' ? war.defender : war.attacker;
  const target = Object.values(t.nodes).find((n) => n.kind === 'ground' && n.target)!;
  const targetOrbit = `${target.id.slice(0, -2)}:o`;
  const sight = t.sight[side];
  const clashes = war.rung === 'clashes';
  const visible = Object.entries(sight).filter(([id, s]) => s.level >= 1 && t.groups[id]);
  const voidHeld = (id: string) => t.nodes[id]?.holder === side;
  for (const g of mine) {
    if (g.engaged) continue;
    const c = commanderOfGroup(w, g);
    if ((g.n < g.start * 0.35 || (g.morale < 30 && g.domain === 'ground')) && t.nodes[g.at]!.owner !== side) {
      const back = g.domain === 'void' ? `${home}:ap` : Object.values(t.nodes).find((n) => n.house === home && n.kind === 'ground' && n.capital)!.id;
      if (g.to !== back) sendTo(w, war, t, g, back);
      continue;
    }
    // Assault houses go for whatever they see that they can beat: that is how bait works on them.
    if (g.chasing && (!t.groups[g.chasing] || g.to === undefined)) g.chasing = undefined;
    if (g.domain === 'ground' && (d.style === 'assault' || d.style === 'shock' || d.style === 'knights') && g.duty === 'attack' && !g.chasing) {
      const prey = visible.filter(([id, s]) => t.groups[id]!.domain === 'ground' && fightsHere('ground', t.nodes[s.at]!.kind) && s.n < g.n * 1.2 && !cannotEnter(w, war, t, g, s.at)
        && !mine.some((o) => o.id !== g.id && o.chasing === id))
        .map(([id, s]) => ({ id, s, dist: routeFor(w, war, t, g, s.at)?.length ?? 99 })).filter((x) => x.dist <= 3).sort((a, b) => a.dist - b.dist)[0];
      const wary = c.skill >= 15 && prey && t.groups[prey.id]!.role === 'bait' && rng.chance(0.5);
      if (prey && !wary && g.to !== prey.s.at) {
        if (sendTo(w, war, t, g, prey.s.at, true)) { g.chasing = prey.id; if (t.groups[prey.id]!.role === 'bait') g.lured = now; continue; }
      }
    }
    if (!phase && g.path.length) continue;
    // Where it means to be.
    let dest: string | undefined;
    if (g.domain === 'void' && g.role === 'escort') {
      const host = mine.filter((x) => x.domain === 'ground' && isVoid(t.nodes[x.at]!.kind) && t.nodes[x.at]!.kind !== 'station').sort((a, b) => b.n - a.n)[0];
      if (host) { if (host.at !== g.at && g.to !== host.at) sendTo(w, war, t, g, host.at); continue; }
    }
    if (g.domain === 'void') {
      if (side === 'attackers') dest = clashes ? (g.role === 'laneRaider' ? `${theirHome}:ap` : 'lanes') : g.role === 'laneRaider' ? `${theirHome}:ap` : g.role === 'picket' ? 'dark' : targetOrbit;
      else dest = g.role === 'laneRaider' ? `${war.attacker}:ap` : g.role === 'picket' ? 'lanes' : d.style === 'attrition' ? Object.values(t.nodes).find((n) => n.house === home && n.kind === 'orbit' && n.capital)!.id : `${home}:ap`;
      // Troops held up by enemy ships: the line goes to clear the way.
      const danger = dangerFor(t, side);
      const blocked = (g.role === 'line' || g.role === 'escort') ? [...danger].find((id) => mine.some((x) => x.domain === 'ground' && !x.engaged && neighbours(t, x.at).some((nb) => nb.id === id))) : undefined;
      if (blocked && !(clashes && t.nodes[blocked]!.owner === other(side) && t.nodes[blocked]!.kind === 'orbit')) dest = blocked;
      // A beaten fleet does not go back for more until it is stronger.
      const foeLine = visible.filter(([id, s]) => t.groups[id]!.domain === 'void' && s.at === dest).reduce((a, [, s]) => a + s.n, 0);
      if (foeLine > g.n * 1.6 && g.role !== 'laneRaider' && c.skill >= 9) dest = g.role === 'line' ? `${home}:ap` : g.at;
    } else {
      if (side === 'attackers') {
        if (clashes) dest = g.role === 'raider' ? `${theirHome}:st` : 'relay';
        else if (voidHeld(targetOrbit) || mine.some((x) => x.domain === 'void' && x.at === targetOrbit)) dest = voidHeld(targetOrbit) ? target.id : targetOrbit;
        else {
          // Troops ride with the fleet: where the battle line is, they are, until the sky over the target is won.
          const line = mine.filter((x) => x.domain === 'void' && x.role === 'line').sort((a, b) => b.n - a.n)[0];
          dest = d.style === 'raid' && g.role === 'raider' ? `${theirHome}:st` : line ? line.at : `${home}:ap`;
          if (d.style === 'assault' && !line) dest = 'relay';
        }
      } else {
        dest = g.role === 'anchor' ? Object.values(t.nodes).find((n) => n.house === home && n.kind === 'ground' && n.capital)!.id
          : g.role === 'raider' ? `${war.attacker}:st`
          : target.house === home ? target.id : Object.values(t.nodes).find((n) => n.house === home && n.kind === 'ground' && n.capital)!.id;
        // A defender with ships over its world sends the reserve to whatever world is threatened.
        const threatened = Object.values(t.nodes).find((n) => n.kind === 'ground' && n.owner === side && groupsAt(t, n.id, other(side), 'ground').length);
        if (threatened && (g.role === 'reserve' || g.role === 'anvil')) dest = threatened.id;
      }
    }
    // A line that has run ahead of its troops waits for them.
    if (g.domain === 'void' && g.role === 'line' && side === 'attackers' && mine.some((x) => x.domain === 'ground' && !x.engaged && x.to === g.at && x.at !== g.at)) { g.path = []; g.to = undefined; g.arrive = undefined; continue; }
    if (dest && dest !== g.at && dest !== g.to && !cannotEnter(w, war, t, g, dest)) { if (!sendTo(w, war, t, g, dest, g.domain === 'ground') && g.domain === 'ground') { g.path = []; g.to = undefined; } }
    // Troops on the move that find the way ahead now held by enemy ships stop where they are.
    if (g.domain === 'ground' && g.path.length && dangerFor(t, side).has(g.path[0]!) && g.path[0] !== g.to) { if (!sendTo(w, war, t, g, g.to ?? g.at, true)) { g.path = []; g.to = undefined; g.arrive = undefined; } }
  }
}

// ---------------------------------------------------------------- the turn

/** One turn of a war's theatre. Runs every turn the war is on. */
export function theatreTurn(w: World, rng: Rng, war: War, phase: boolean): void {
  const t = ensureTheatre(w, war);
  const P = w.playerHouseId;
  for (const h of [war.attacker, ...war.attackers, war.defender, ...war.defenders]) if (!groupsOf(t, undefined, h).length) muster(w, t, war, h, rng);
  // Fights of ours being fought in the battle engine.
  for (const c of t.contacts.slice()) settleContact(w, war, t, c, rng);
  updateSight(w, war, t);
  for (const h of [war.attacker, ...war.attackers, war.defender, ...war.defenders]) {
    if (h === P) standingOrders(w, war, t, h);
    else aiTurn(w, war, t, h, rng, phase);
  }
  move(w, war, t);
  updateSight(w, war, t);
  caughtInTransit(w, war, t, rng);
  contactsAt(w, war, t, rng);
  hold(w, war, t);
  supply(w, war, t);
  if (phase) {
    raids(w, war, t, rng);
    for (const g of Object.values(t.groups)) g.morale = clamp(g.morale + (g.supply > 0.6 ? 0.8 : -1.5), has(t, g.house, 'discipline') ? 40 : 5, 90);
    for (const p of Object.values(t.plans)) p.familiarity = clamp(p.familiarity + 3, 0, 100);
    holdingScore(w, war, t);
  }
  syncFormations(w, war, t);
  syncFronts(war, t);
}

function holdingScore(w: World, war: War, t: TheatreState): void {
  const val = (n: WNode) => (n.kind === 'ground' ? (n.capital ? 6 : 3) : n.kind === 'orbit' ? 2 : n.kind === 'station' ? 1.5 : 1);
  let a = 0, d = 0;
  for (const n of Object.values(t.nodes)) {
    if (!n.owner || n.holder === n.owner || !n.holder) continue;
    if (n.holder === 'attackers') a += val(n); else d += val(n);
  }
  war.score = clamp(war.score + (a - d) * 0.5 - (a === 0 ? 0.6 : 0), -100, 100);
  void w;
}

function settleContact(w: World, war: War, t: TheatreState, c: Contact, rng: Rng): void {
  const b = battleOf(w, c.battle);
  const node = t.nodes[c.node]!;
  const groups: Record<WSide, WGroup[]> = {
    attackers: Object.values(t.groups).filter((g) => g.engaged === c.id && g.side === 'attackers'),
    defenders: Object.values(t.groups).filter((g) => g.engaged === c.id && g.side === 'defenders'),
  };
  if (c.domain === 'ground') { const gg = garrisonGroup(war, node); if (gg) groups[gg.side].push(gg); }
  const done = () => { t.contacts = t.contacts.filter((x) => x.id !== c.id); for (const g of Object.values(t.groups)) if (g.engaged === c.id) g.engaged = undefined; };
  if (!b) { done(); return; }
  if (b.status !== 'over') {
    if (absoluteCycle(w.date) - c.since > 8) runOut(b, w); else return;
  }
  if (!b.result) return;
  applyFates(w, b);
  const P = w.playerHouseId;
  const ourSide = sideOfHouse(war, P)!;
  const shout = (b as typeof b & { shouted?: string }).shouted;
  const fx = shout ? (b as typeof b & { shouts?: Record<string, ShoutFx> }).shouts?.[shout] : undefined;
  // A group called in by the shout was in it too.
  if (fx?.join && t.groups[fx.join]) { const g = t.groups[fx.join]!; g.prev = g.at; g.at = node.id; g.since = absoluteCycle(w.date); g.path = []; groups[g.side].push(g); }
  if (!groups.attackers.length || !groups.defenders.length) { done(); return; }
  const weWon = b.result.winner === 0;
  const winner: WSide = weWon ? ourSide : other(ourSide);
  if (b.result.brokeOff) {
    // We broke contact: a fighting withdrawal, lighter than a defeat.
    const out = escapeFor(t, groups[ourSide], node);
    for (const g of groups[ourSide]) { bleedGroup(w, war, g, 0.03, rng, b.title); if (out) { g.prev = g.at; g.at = out; g.since = absoluteCycle(w.date); } g.engaged = undefined; }
    say(t, w, `We break contact at ${node.name}.`, true, ourSide);
    done();
    return;
  }
  done();
  settle(w, war, t, node, c.domain, groups, c.judged, winner, rng, b.id, shout);
}

/** Formations with groups in the field are at the war; the old fronts follow the theatre. */
function syncFormations(w: World, war: War, t: TheatreState): void {
  const front = war.fronts.find((f) => !f.ended)?.id;
  const inField = new Set(Object.values(t.groups).flatMap((g) => g.from.map((s) => s.formationId)));
  for (const f of Object.values(w.war!.formations)) {
    if (sideOfHouse(war, f.houseId) === null) continue;
    if (inField.has(f.id)) f.front = front;
    else if (war.fronts.some((x) => x.id === f.front)) f.front = undefined;
  }
}

function syncFronts(war: War, t: TheatreState): void {
  const meter = (n?: WNode) => (!n ? 0 : n.holder === 'attackers' ? (n.owner === 'defenders' ? 100 : 30) : n.holder === 'defenders' ? (n.owner === 'attackers' ? -30 : -100) : 0);
  const target = Object.values(t.nodes).find((n) => n.kind === 'ground' && n.target);
  const orbit = target ? t.nodes[`${target.id.slice(0, -2)}:o`] : undefined;
  for (const fr of war.fronts) {
    if (fr.ended) continue;
    if (fr.kind === 'border') fr.meter = clamp((meter(t.nodes.lanes) + meter(t.nodes.relay) + meter(t.nodes.dark)) / 3 + (t.nodes[`${war.defender}:ap`]?.holder === 'attackers' ? 40 : 0), -99, 99);
    if (fr.kind === 'orbit') fr.meter = clamp(meter(orbit), -99, 99);
    if (fr.kind === 'siege') fr.meter = clamp(meter(target), -99, 99);
  }
  if (orbit?.holder === 'attackers' && !war.fronts.some((f) => f.kind === 'siege' && !f.ended)) war.fronts.push({ id: `fr${t.next++}x`, kind: 'siege', where: target?.name ?? 'their world', meter: 0, since: 0 });
}

// ---------------------------------------------------------------- for the War Room screen

/** Our side, and the groups and places as we see them. */
export function picture(w: World, war: War): { t: TheatreState; side: WSide; ours: WGroup[]; theirs: { g: WGroup; seen: NonNullable<ReturnType<typeof estimate>> }[]; allies: WGroup[] } | null {
  const t = theatreOf(war);
  const side = sideOfHouse(war, w.playerHouseId);
  if (!t || !side) return null;
  const P = w.playerHouseId;
  return {
    t, side,
    ours: groupsOf(t, side, P),
    allies: groupsOf(t, side).filter((g) => g.house !== P),
    theirs: groupsOf(t, other(side)).map((g) => ({ g, seen: estimate(t, side, g.id)! })).filter((x) => x.seen),
  };
}

/** The staff's read on a place: what would happen if our groups there fought what we know is there. */
export function staffRead(w: World, war: War, nodeId: string): { p: number; why: string[] } | null {
  const t = theatreOf(war);
  const side = sideOfHouse(war, w.playerHouseId);
  if (!t || !side || !t.nodes[nodeId]) return null;
  const node = t.nodes[nodeId]!;
  const mine = Object.values(t.groups).filter((g) => g.side === side && g.at === nodeId);
  const domain = mine[0]?.domain ?? 'ground';
  const theirs = Object.values(t.groups).filter((g) => g.side !== side && g.domain === domain && (t.sight[side][g.id]?.level ?? 0) >= 1 && t.sight[side][g.id]!.at === nodeId);
  const gg = domain === 'ground' ? garrisonGroup(war, node) : null;
  if (gg && gg.side !== side) theirs.push(gg);
  if (!mine.length || !theirs.length) return null;
  const attack: WSide = node.holder === side ? other(side) : side;
  const j = judge(w, war, t, node, attack === side ? mine : theirs, attack === side ? theirs : mine, attack);
  const p = side === 'attackers' ? j.p : 1 - j.p;
  return { p, why: j.mults.filter((m) => Math.abs(m.x - 1) >= 0.06).map((m) => `${m.side === side ? '' : 'theirs: '}${m.label} ×${m.x}`).slice(0, 6) };
}

export { ROLE_DEF };
