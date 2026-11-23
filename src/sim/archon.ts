// The Archon as a whole: every house on the register (simulated in full or not), what each believes, how
// they regard each other, the status track between Great and Minor, and the Numarade: eleven seats (the
// seven Great Houses and four elected from the Minor), an Exarchon chosen from the Great Houses who serves
// for life, the Capanna they appoint, and the motions the seats vote on.
//
// Houses not simulated in full are "on the register": they hold views, regard, prestige, a ruler's name and
// a seat or not, and they vote, feud, ally, fight in the Crucible and can be founded or fall. Turning one into
// a fully simulated house later only means giving it people and worlds; everything here already treats it
// as a house.
import { Rng } from './rng';
import { buildWord } from './names';
import { relation, shiftRelation } from './relations';
import { logRecord } from './records';
import { fireStage } from './events';
import { ceasefireMotionFor, orderCeasefire } from './war';
import { addThread } from './storystate';
import { absoluteCycle, CYCLES_PER_ORBIT, CYCLES_PER_PHASE, dateParts } from './time';
import { CULTURES } from '../data/cultures';
import { CANON_HOUSES, GREAT_SEATS, MINOR_SEATS, TOPICS, type CanonNotable, type Topic, type Views } from '../data/canon';
import { rollFrontier, worthOf, wildLabel, type Wild } from './frontier';
import type { HouseTier, SpeciesId, World } from './types';
import { SPECIES } from '../data/species';
import { econ } from './economy';
import { ageOf } from './characters';
import { displayName } from './names';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** Rounded, never −0 (so saves compare equal). */
const rnd = (v: number) => Math.round(v) + 0;

// ---------------------------------------------------------------- state

export interface ArchonHouse {
  id: string;
  name: string;
  tier: HouseTier;
  species: SpeciesId;
  speciesKnown: boolean;
  vassals?: SpeciesId[];
  /** On the canon list (false: founded during play or in the generated history). */
  canon: boolean;
  /** Simulated in full: has people, worlds and a court in world.houses. */
  simulated: boolean;
  focus: string;
  blurb: string;
  worlds: number;
  might: number;
  views: Views;
  /** Standing among the houses, 0..100: what decides who rises and who falls. */
  prestige: number;
  founded: number;
  foundedBy?: string;
  capital: string;
  /** Where the house holds its capital, if it was founded on the frontier. */
  wildId?: string;
  /** Its ruler, for houses not simulated in full. */
  ruler?: { name: string; born: number; since: number; species: SpeciesId };
  personality: Record<'aggression' | 'honour' | 'greed' | 'intrigue' | 'piety' | 'isolation', number>;
  notables: CanonNotable[];
  families: string[];
  /** The year it ended, if it has. */
  ended?: number;
}

export interface Exarchon { name: string; houseId: string; personId?: string; since: number; born: number; species: SpeciesId }
export interface CapannaSeat { name: string; houseId: string; role: string; personId?: string }

export type MotionKind = 'censure' | 'commend' | 'mediate' | 'raise' | 'remove' | 'elect' | 'seats' | 'ceasefire';
export type Vote = 'aye' | 'nay' | 'abstain';
export interface Candidate { houseId: string; name: string; personId?: string; born?: number; species?: SpeciesId }

export interface Motion {
  id: string;
  kind: MotionKind;
  /** The house that tabled it. */
  by: string;
  target?: string;
  /** The other house in it: the one that falls when another rises, the other side of a feud. */
  second?: string;
  title: string;
  date: World['date'];
  closes: number;
  needed: 'majority' | 'super';
  votes: Record<string, Vote | number>;
  candidates?: Candidate[];
  /** Our seat is asked how it votes. */
  ask?: boolean;
  /** The question has been put to us. */
  asked?: boolean;
  /** Our Speaker spoke for (+) or against (−) it, turning this many waverers. */
  swing?: number;
  /** In an election: the candidate our Speaker lobbied for. */
  swingFor?: number;
  status: 'open' | 'passed' | 'failed';
  result?: string;
  /** For seat elections: the houses chosen. */
  chosen?: string[];
  /** For a ceasefire: the war. */
  warId?: string;
}

export interface NumaradeState {
  seats: string[];
  minorSeats: string[];
  nextElection: number;
  exarchon: Exarchon | null;
  capanna: CapannaSeat[];
  motions: Motion[];
  /** The year a house last rose or fell. */
  lastShift: number;
  /** When we last brought a motion. */
  ourLast?: number;
  /** When we last courted each house (absolute cycle). */
  courted?: Record<string, number>;
  /** The Exarchon means to offer us a seat on the Capanna. */
  capannaOffer?: boolean;
}

export type HistoryKind = 'era' | 'exarchon' | 'war' | 'champion' | 'caige' | 'feud' | 'pact' | 'founding' | 'rise' | 'fall' | 'end' | 'plague' | 'claim';
export interface HistoryEntry { year: number; kind: HistoryKind; text: string; houses: string[] }
/** A Caige lost to history: where it was last seen. */
export interface Legend { id: string; name: string; form: string; house: string; year: number; where: string; wildId?: string; found?: number }
export interface Rift { a: string; b: string; since: number; cause: string }

export interface ArchonState {
  houses: Record<string, ArchonHouse>;
  /** regard[a][b], −100..100, for any pair where one side is not simulated in full. */
  regard: Record<string, Record<string, number>>;
  feuds: Rift[];
  pacts: Rift[];
  numarade: NumaradeState;
  history: HistoryEntry[];
  legends: Legend[];
  frontier: Record<string, Wild>;
}

// ---------------------------------------------------------------- reading

export const isSim = (w: World, id: string) => !!w.houses[id];
export const archonHouse = (w: World, id: string) => w.archon?.houses[id];
export const houseName = (w: World, id: string) => w.houses[id]?.name ?? w.archon?.houses[id]?.name ?? id;
export const liveHouses = (w: World) => Object.values(w.archon?.houses ?? {}).filter((h) => !h.ended);
export const tierOf = (w: World, id: string): HouseTier => w.archon?.houses[id]?.tier ?? w.houses[id]?.tier ?? 'minor';
export const prestigeOf = (w: World, id: string) => w.archon?.houses[id]?.prestige ?? 40;
export const seated = (w: World, id: string) => !!w.archon?.numarade.seats.includes(id);
export const exarchonOf = (w: World) => w.archon?.numarade.exarchon ?? null;

export function viewsOf(w: World, id: string): Views {
  return w.archon?.houses[id]?.views ?? Object.fromEntries(TOPICS.map((t) => [t, 0])) as Views;
}

/** How alike two houses' views are, −1 (opposed on everything) to +1 (of one mind). */
export function affinity(w: World, a: string, b: string): number {
  const va = viewsOf(w, a), vb = viewsOf(w, b);
  let s = 0;
  for (const t of TOPICS) s += 2 - Math.abs(va[t] - vb[t]);
  return s / (2 * TOPICS.length);
}

/** The topics two houses agree and disagree on most. */
export function agreements(w: World, a: string, b: string): { agree: Topic[]; differ: Topic[] } {
  const va = viewsOf(w, a), vb = viewsOf(w, b);
  const agree = TOPICS.filter((t) => Math.abs(va[t] - vb[t]) === 0 && va[t] !== 0);
  const differ = TOPICS.filter((t) => Math.abs(va[t] - vb[t]) >= 3);
  return { agree, differ };
}

/** How house a regards house b: the full relation where both are simulated, the register's otherwise. */
export function regardOf(w: World, a: string, b: string): number {
  if (a === b) return 100;
  if (isSim(w, a) && isSim(w, b)) return relation(w, a, b);
  return w.archon?.regard[a]?.[b] ?? 0;
}

export function shiftRegard(w: World, a: string, b: string, by: number): void {
  if (a === b) return;
  if (isSim(w, a) && isSim(w, b)) { shiftRelation(w, a, b, by); return; }
  if (!w.archon) return;
  const book = (w.archon.regard[a] ??= {});
  book[b] = rnd(clamp((book[b] ?? 0) + by, -100, 100));
}

export const riftBetween = (list: Rift[], a: string, b: string) => list.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));

// ---------------------------------------------------------------- people of the register

/** A name for someone of this people and family. */
export function personName(rng: Rng, species: SpeciesId, family: string): string {
  const given = buildWord(rng, CULTURES[species].given);
  return family.startsWith('the ') ? `${given} of ${family}` : `${given} ${family}`;
}

function newRuler(rng: Rng, h: ArchonHouse, year: number, settled = false) {
  const sp = h.species;
  const span = SPECIES[sp].lifespan;
  const adult = SPECIES[sp].adulthood;
  const age = settled ? rng.int(adult + 14, rnd(span[0] * 0.85)) : rng.int(adult + 6, rnd(span[0] * 0.75));
  const since = settled ? year - rng.int(1, Math.max(2, Math.min(35, age - adult - 8))) : year;
  return { name: personName(rng, sp, h.families[0] ?? h.name), born: year - age, since, species: sp };
}

// ---------------------------------------------------------------- building the register

function fromCanon(w: World, rng: Rng, year: number): Record<string, ArchonHouse> {
  const out: Record<string, ArchonHouse> = {};
  for (const c of CANON_HOUSES) {
    const sim = w.houses[c.id];
    const worlds = sim ? Object.values(w.planets).filter((p) => p.houseId === c.id).length || 1 : rng.int(c.worlds[0], c.worlds[1]);
    const h: ArchonHouse = {
      id: c.id, name: c.name, tier: sim?.tier ?? c.tier, species: sim?.species ?? c.species, speciesKnown: c.speciesKnown,
      ...(c.vassals ? { vassals: c.vassals } : {}),
      canon: true, simulated: !!sim, focus: c.focus, blurb: sim?.blurb ?? c.blurb, worlds, might: c.might,
      views: { ...c.views }, prestige: 0, founded: 0, capital: sim ? (w.planets[sim.capitalPlanetId]?.name ?? c.name) : (c.capital ?? c.name),
      personality: sim?.personality ?? c.personality, notables: c.notables ?? [], families: c.families ?? [c.name],
    };
    if (!sim) h.ruler = newRuler(rng, h, year, true);
    h.prestige = basisOf(w, h);
    out[c.id] = h;
  }
  // Any simulated house not on the canon list joins too.
  for (const sim of Object.values(w.houses)) {
    if (out[sim.id]) continue;
    out[sim.id] = {
      id: sim.id, name: sim.name, tier: sim.tier, species: sim.species, speciesKnown: true, canon: false, simulated: true, focus: '', blurb: sim.blurb,
      worlds: 1, might: 1, views: Object.fromEntries(TOPICS.map((t) => [t, rng.int(-2, 2)])) as Views, prestige: 40, founded: 0,
      capital: w.planets[sim.capitalPlanetId]?.name ?? sim.name, personality: sim.personality, notables: [], families: [sim.name],
    };
  }
  return out;
}

/** What a house's standing settles toward: arms, worlds, rank, a seat, the Exarchon. */
export function basisOf(w: World, h: ArchonHouse): number {
  let b = 18 + h.might * 22 + Math.min(8, h.worlds) * 2.5 + (h.tier === 'great' ? 14 : 0);
  const sim = w.houses[h.id];
  if (sim) b += (sim.standing.respect - 40) * 0.25 + ((w.realm?.favour[h.id] ?? 50) - 50) * 0.15;
  if (w.archon?.numarade.seats.includes(h.id) && h.tier === 'minor') b += 4;
  if (w.archon?.numarade.exarchon?.houseId === h.id) b += 8;
  return clamp(b, 5, 95);
}

function initialRegard(w: World, rng: Rng, a: ArchonState): void {
  const ids = Object.keys(a.houses);
  for (const x of ids) for (const y of ids) {
    if (x === y || (isSim(w, x) && isSim(w, y))) continue;
    (a.regard[x] ??= {})[y] = rnd(clamp(affinity(w, x, y) * 30 + (rng.next() - 0.5) * 30, -100, 100));
  }
}

/** Seats: every Great House, and the four Minor with the most standing (the rest wait for an election). */
function seatHouses(w: World, a: ArchonState): void {
  const n = a.numarade;
  const great = Object.values(a.houses).filter((h) => !h.ended && h.tier === 'great').map((h) => h.id);
  n.minorSeats = n.minorSeats.filter((id) => a.houses[id] && !a.houses[id]!.ended && a.houses[id]!.tier === 'minor');
  if (n.minorSeats.length < MINOR_SEATS) {
    const pool = Object.values(a.houses).filter((h) => !h.ended && h.tier === 'minor' && !n.minorSeats.includes(h.id)).sort((x, y) => y.prestige - x.prestige);
    for (const h of pool) { if (n.minorSeats.length >= MINOR_SEATS) break; n.minorSeats.push(h.id); }
  }
  n.seats = [...great, ...n.minorSeats];
  void w; void GREAT_SEATS;
}

/** Returns true when the register was just made (so its history can be written). */
export function ensureArchon(world: World): boolean {
  if (world.archon) {
    const a = world.archon;
    a.feuds ??= []; a.pacts ??= []; a.legends ??= []; a.history ??= []; a.frontier ??= {}; a.regard ??= {};
    a.numarade.motions ??= []; a.numarade.capanna ??= []; a.numarade.courted ??= {};
    return false;
  }
  const rng = Rng.fromSeed(`${world.seed}/archon`);
  const year = dateParts(world.date).year;
  const a: ArchonState = {
    houses: fromCanon(world, rng, year), regard: {}, feuds: [], pacts: [], history: [], legends: [], frontier: rollFrontier(rng),
    numarade: { seats: [], minorSeats: [], nextElection: year + 1 + ((5 - (year % 5)) % 5), exarchon: null, capanna: [], motions: [], lastShift: year - 30, courted: {} },
  };
  world.archon = a;
  initialRegard(world, rng, a);
  seatHouses(world, a);
  return true;
}

// ---------------------------------------------------------------- the Exarchon and the Capanna

/** Who the Great Houses put forward. */
export function candidatesFor(w: World, rng: Rng): Candidate[] {
  const out: Candidate[] = [];
  for (const h of liveHouses(w).filter((x) => x.tier === 'great')) {
    const sim = w.houses[h.id];
    if (sim) {
      const r = sim.rulerId ? w.characters[sim.rulerId] : undefined;
      if (r?.alive) out.push({ houseId: h.id, name: displayName(r.name), personId: r.id });
      continue;
    }
    const sp = h.species;
    const age = rng.int(Math.max(SPECIES[sp].adulthood + 15, 40), rnd(SPECIES[sp].lifespan[0] * 0.8));
    out.push({ houseId: h.id, name: personName(rng, sp, h.families[0] ?? h.name), born: dateParts(w.date).year - age, species: sp });
  }
  return out;
}

function merit(w: World, c: Candidate): number {
  if (c.personId) { const p = w.characters[c.personId]; if (p) return (p.stats.leadership + p.stats.diplomacy + p.stats.law) / 3; }
  return 10;
}

export function candidatesScore(w: World, voter: string, c: Candidate): number {
  if (c.houseId === voter) return 500;
  return regardOf(w, voter, c.houseId) + affinity(w, voter, c.houseId) * 25 + prestigeOf(w, c.houseId) * 0.35 + merit(w, c) * 0.8;
}

export function seatExarchon(w: World, rng: Rng, c: Candidate, year: number): void {
  const a = w.archon!;
  const h = a.houses[c.houseId]!;
  const born = c.born ?? (c.personId && w.characters[c.personId] ? year - ageOf(w.characters[c.personId]!, w.date) : year - 60);
  a.numarade.exarchon = { name: c.name, houseId: c.houseId, ...(c.personId ? { personId: c.personId } : {}), since: year, born, species: c.species ?? h.species };
  appointCapanna(w, rng);
}

/** The Exarchon chooses advisers from the houses they trust; the Capanna can come from any house. */
export function appointCapanna(w: World, rng: Rng): void {
  const a = w.archon!;
  const ex = a.numarade.exarchon;
  if (!ex) { a.numarade.capanna = []; return; }
  const roles = ['Adviser on war', 'Adviser on coin', 'Adviser on law', 'Adviser on faith', 'Adviser on the houses'];
  const pool = liveHouses(w).filter((h) => h.id !== ex.houseId).sort((x, y) => regardOf(w, ex.houseId, y.id) + y.prestige * 0.3 - (regardOf(w, ex.houseId, x.id) + x.prestige * 0.3));
  a.numarade.capanna = pool.slice(0, roles.length).map((h, i) => {
    if (w.houses[h.id]) {
      const pick = Object.values(w.characters).filter((c) => c.alive && c.houseId === h.id && c.seat && c.seat !== 'highroy').sort((x, y) => y.stats.diplomacy + y.stats.law - x.stats.diplomacy - x.stats.law)[0];
      if (pick) return { name: displayName(pick.name), houseId: h.id, role: roles[i]!, personId: pick.id };
    }
    return { name: personName(rng, h.species, h.families[Math.min(i, h.families.length - 1)] ?? h.name), houseId: h.id, role: roles[i]! };
  });
}

// ---------------------------------------------------------------- motions

const MAJORITY_MIN = 5;
const SUPER = 8;

function newMotion(w: World, kind: MotionKind, by: string, title: string, extra: Partial<Motion> = {}): Motion {
  const needed: Motion['needed'] = kind === 'raise' || kind === 'remove' ? 'super' : 'majority';
  return { id: `mo${w.nextId++}`, kind, by, title, date: w.date, closes: absoluteCycle(w.date) + CYCLES_PER_PHASE, needed, votes: {}, status: 'open', ...extra };
}

export function motionTitle(w: World, kind: MotionKind, target?: string, second?: string): string {
  const H = (id?: string) => `House ${houseName(w, id ?? '')}`;
  switch (kind) {
    case 'censure': return `That ${H(target)} be censured`;
    case 'commend': return `That ${H(target)} be commended`;
    case 'mediate': return `That ${H(target)} and ${H(second)} lay down their feud`;
    case 'raise': return `That ${H(target)} be raised a Great House, and ${H(second)} stand down`;
    case 'remove': return `That the Exarchon be removed`;
    case 'elect': return 'The election of an Exarchon';
    case 'seats': return 'The election of the four Minor seats';
    case 'ceasefire': return `That the war between ${H(target)} and ${H(second)} stop`;
  }
}

/** Put a motion before the Numarade. Our seat is asked if we hold one. */
export function table(w: World, kind: MotionKind, by: string, target?: string, second?: string, extra: Partial<Motion> = {}): Motion {
  const a = w.archon!;
  const P = w.playerHouseId;
  const m = newMotion(w, kind, by, motionTitle(w, kind, target, second), { ...(target ? { target } : {}), ...(second ? { second } : {}), ...extra });
  const askable = kind === 'seats' ? tierOf(w, P) === 'minor' : a.numarade.seats.includes(P);
  if (askable) { m.ask = true; m.closes = absoluteCycle(w.date) + CYCLES_PER_PHASE * 2; }
  a.numarade.motions.unshift(m);
  a.numarade.motions = a.numarade.motions.filter((x, i) => x.status === 'open' || i < 60);
  logRecord(w, {
    kind: 'world', type: 'politics', severity: m.ask || target === P || second === P ? 2 : 1,
    text: `Before the Numarade: ${m.title}${by && kind !== 'elect' && kind !== 'seats' ? `, tabled by House ${houseName(w, by)}` : ''}.`,
    houseIds: [by, target, second].filter((x): x is string => !!x && !!w.houses[x]), source: 'the Numarade',
  });
  return m;
}

/** How a seat votes, from what it thinks of the houses involved and what it believes. */
export function aiVote(w: World, voter: string, m: Motion): Vote | number {
  const liege = w.war?.liege[voter];
  if (liege && liege !== m.target && liege !== m.second && w.archon?.numarade.seats.includes(liege) && voter !== w.playerHouseId) return aiVote(w, liege, m);
  const v = viewsOf(w, voter);
  const by = m.by ? regardOf(w, voter, m.by) * 0.25 : 0;
  const ex = w.archon?.numarade.exarchon;
  let s = 0;
  switch (m.kind) {
    case 'elect': {
      const cs = m.candidates ?? [];
      let best = 0, bs = -Infinity;
      cs.forEach((c, i) => { const sc = candidatesScore(w, voter, c); if (sc > bs) { bs = sc; best = i; } });
      return best;
    }
    case 'seats': return 'abstain';
    case 'ceasefire':
      if (voter === m.target) s = -20 + v.numarade * 6;
      else if (voter === m.second) s = 10 + v.numarade * 4;
      else s = 8 + v.numarade * 6 + v.honour * 2 - v.crucible * 3 + by - (regardOf(w, voter, m.target!) - regardOf(w, voter, m.second!)) * 0.1;
      break;
    case 'censure':
      if (voter === m.target) return 'nay';
      if (voter === m.by) return 'aye';
      s = -regardOf(w, voter, m.target!) * 0.7 + by - affinity(w, voter, m.target!) * 15 - 4;
      break;
    case 'commend':
      if (voter === m.target || voter === m.by) return 'aye';
      s = regardOf(w, voter, m.target!) * 0.6 + by - 6;
      break;
    case 'mediate':
      if (voter === m.target || voter === m.second) {
        const other = voter === m.target ? m.second! : m.target!;
        s = regardOf(w, voter, other) * 0.5 + v.honour * 5 + 5;
      } else s = 6 + v.numarade * 6 + v.honour * 3 + by;
      break;
    case 'raise':
      if (voter === m.target) return 'aye';
      if (voter === m.second) return 'nay';
      s = (regardOf(w, voter, m.target!) - regardOf(w, voter, m.second!)) * 0.5 + (prestigeOf(w, m.target!) - prestigeOf(w, m.second!)) * 0.9 + v.peoples * 4 - (tierOf(w, voter) === 'great' ? 14 : -4) + by;
      break;
    case 'remove':
      if (ex && voter === ex.houseId) return 'nay';
      s = (ex ? -regardOf(w, voter, ex.houseId) * 0.7 : 0) - 22 - v.numarade * 6 + by;
      break;
  }
  return s > 8 ? 'aye' : s < -8 ? 'nay' : 'abstain';
}

/** How strongly a seat holds its vote (for our Speaker turning waverers). */
function conviction(w: World, voter: string, m: Motion): number {
  if (voter === m.target || voter === m.second || voter === m.by) return 99;
  return Math.abs(m.target ? regardOf(w, voter, m.target) : 0) + Math.abs(affinity(w, voter, m.target ?? voter) * 20);
}

export function tally(m: Motion): { aye: number; nay: number; abstain: number } {
  const vs = Object.values(m.votes);
  return { aye: vs.filter((x) => x === 'aye').length, nay: vs.filter((x) => x === 'nay').length, abstain: vs.filter((x) => x === 'abstain').length };
}

function closeMotion(w: World, rng: Rng, m: Motion): void {
  const a = w.archon!;
  const P = w.playerHouseId;
  const year = dateParts(w.date).year;
  if (m.kind === 'seats') { closeSeats(w, rng, m); return; }
  for (const s of a.numarade.seats) if (m.votes[s] === undefined) m.votes[s] = aiVote(w, s, m);
  // Our Speaker's words: turn the least certain seats our way.
  if (m.swing && m.kind !== 'elect') {
    const want: Vote = m.swing > 0 ? 'aye' : 'nay';
    const wavering = a.numarade.seats.filter((s) => s !== P && m.votes[s] !== want).sort((x, y) => conviction(w, x, m) - conviction(w, y, m));
    for (const s of wavering.slice(0, Math.abs(m.swing))) if (conviction(w, s, m) < 60) m.votes[s] = m.votes[s] === 'abstain' ? want : 'abstain';
  }
  if (m.kind === 'elect') { closeElection(w, rng, m); return; }
  const t = tally(m);
  let passed = m.needed === 'super' ? t.aye >= SUPER : t.aye > t.nay && t.aye >= MAJORITY_MIN;
  // The Exarchon breaks a tie.
  const ex = a.numarade.exarchon;
  if (m.needed === 'majority' && t.aye === t.nay && t.aye >= MAJORITY_MIN && ex) passed = aiVote(w, ex.houseId, m) === 'aye';
  m.status = passed ? 'passed' : 'failed';
  m.result = `${passed ? 'Carried' : 'Fell'}, ${t.aye} to ${t.nay}${t.abstain ? ` with ${t.abstain} abstaining` : ''}${m.needed === 'super' ? ' (eight needed)' : ''}.`;
  if (passed) applyMotion(w, rng, m, year);
  else if (m.by) shiftPrestige(w, m.by, -1.5);
  const ours = m.target === P || m.second === P || m.by === P;
  logRecord(w, {
    kind: 'world', type: 'politics', severity: ours ? 2 : 1, text: `The Numarade: ${m.title}. ${m.result}`,
    houseIds: [m.by, m.target, m.second].filter((x): x is string => !!x && !!w.houses[x]), source: 'the Numarade',
  });
  // Seats remember how others voted on their own affairs.
  for (const party of [m.target, m.second].filter((x): x is string => !!x)) {
    for (const s of a.numarade.seats) {
      if (s === party) continue;
      const vote = m.votes[s];
      const forParty = (m.kind === 'censure' && party === m.target) ? vote === 'nay' : (m.kind === 'raise' && party === m.second) ? vote === 'nay' : vote === 'aye';
      const againstParty = (m.kind === 'censure' && party === m.target) ? vote === 'aye' : (m.kind === 'raise' && party === m.second) ? vote === 'aye' : vote === 'nay';
      if (forParty) shiftRegard(w, party, s, 4);
      if (againstParty) shiftRegard(w, party, s, -6);
    }
  }
}

function shiftPrestige(w: World, id: string, by: number): void {
  const h = w.archon?.houses[id];
  if (h) h.prestige = clamp(h.prestige + by, 0, 100);
}

function applyMotion(w: World, rng: Rng, m: Motion, year: number): void {
  const a = w.archon!;
  const fav = (id: string, by: number) => { if (w.realm && w.houses[id]) w.realm.favour[id] = clamp((w.realm.favour[id] ?? 50) + by, 0, 100); };
  switch (m.kind) {
    case 'censure': shiftPrestige(w, m.target!, -6); fav(m.target!, -15); if (w.houses[m.target!]) w.houses[m.target!]!.standing.respect = clamp(w.houses[m.target!]!.standing.respect - 4, 0, 100); shiftRegard(w, m.target!, m.by, -15); break;
    case 'commend': shiftPrestige(w, m.target!, 4); fav(m.target!, 10); shiftRegard(w, m.target!, m.by, 8); break;
    case 'mediate': {
      const x = m.target!, y = m.second!;
      a.feuds = a.feuds.filter((r) => r !== riftBetween(a.feuds, x, y));
      if (w.realm) w.realm.feuds = w.realm.feuds.filter((f) => !((f.a === x && f.b === y) || (f.a === y && f.b === x)));
      shiftRegard(w, x, y, 15); shiftRegard(w, y, x, 15);
      a.history.push({ year, kind: 'pact', text: `The Numarade ended the feud between House ${houseName(w, x)} and House ${houseName(w, y)}.`, houses: [x, y] });
      break;
    }
    case 'raise': raise(w, m.target!, m.second!, year, 'by a vote of the Numarade'); break;
    case 'ceasefire': if (m.warId) orderCeasefire(w, m.warId); break;
    case 'remove': {
      const ex = a.numarade.exarchon;
      if (ex) { a.history.push({ year, kind: 'exarchon', text: `The Numarade removed the Exarchon ${ex.name} of House ${houseName(w, ex.houseId)}.`, houses: [ex.houseId] }); shiftPrestige(w, ex.houseId, -10); }
      a.numarade.exarchon = null; a.numarade.capanna = [];
      callElection(w, rng);
      break;
    }
    default: break;
  }
}

/** A Minor House rises and a Great House stands down. Rare: it reshapes the Numarade. */
export function raise(w: World, up: string, down: string, year: number, how: string): void {
  const a = w.archon!;
  const U = a.houses[up], D = a.houses[down];
  if (!U || !D) return;
  U.tier = 'great'; D.tier = 'minor';
  if (w.houses[up]) w.houses[up]!.tier = 'great';
  if (w.houses[down]) w.houses[down]!.tier = 'minor';
  U.prestige = clamp(U.prestige + 6, 0, 100); D.prestige = clamp(D.prestige - 6, 0, 100);
  a.numarade.lastShift = year;
  a.numarade.minorSeats = a.numarade.minorSeats.filter((s) => s !== up);
  if (a.numarade.minorSeats.length < MINOR_SEATS) a.numarade.minorSeats.push(down);
  seatHouses(w, a);
  a.history.push({ year, kind: 'rise', text: `House ${U.name} was raised a Great House ${how}; House ${D.name} stood down to the Minor.`, houses: [up, down] });
  shiftRegard(w, down, up, -30);
  logRecord(w, { kind: 'world', type: 'politics', severity: 3, text: `House ${U.name} is raised a Great House, and House ${D.name} stands down.`, houseIds: [up, down].filter((x) => w.houses[x]), source: 'the Numarade' });
  if (a.numarade.exarchon?.houseId === down) { a.numarade.exarchon = null; a.numarade.capanna = []; }
}

/** The Exarchon's chair is empty: the Great Houses put forward their candidates. */
export function callElection(w: World, rng: Rng): Motion | null {
  const a = w.archon!;
  if (a.numarade.motions.some((m) => m.status === 'open' && m.kind === 'elect')) return null;
  const candidates = candidatesFor(w, rng);
  if (!candidates.length) return null;
  return table(w, 'elect', '', undefined, undefined, { candidates });
}

function closeElection(w: World, rng: Rng, m: Motion): void {
  const a = w.archon!;
  const year = dateParts(w.date).year;
  let cands = (m.candidates ?? []).map((c, i) => ({ c, i }));
  const votes = { ...m.votes };
  let winner = cands[0]!;
  // Rounds: the weakest drops out until someone has a majority of the seats.
  for (let round = 0; round < 8 && cands.length; round++) {
    const count = new Map<number, number>();
    for (const s of a.numarade.seats) {
      let vote = votes[s];
      if (typeof vote !== 'number' || !cands.some((x) => x.i === vote)) {
        vote = cands.slice().sort((x, y) => candidatesScore(w, s, y.c) - candidatesScore(w, s, x.c))[0]!.i;
        votes[s] = vote;
      }
    }
    // Our Speaker's lobbying, in the first round: the seats least sure of their choice come over.
    if (round === 0 && m.swing && m.swingFor !== undefined && cands.some((x) => x.i === m.swingFor)) {
      const ours = cands.find((x) => x.i === m.swingFor)!;
      const unsure = a.numarade.seats.filter((s) => s !== w.playerHouseId && votes[s] !== ours.i && !cands.some((x) => x.i === votes[s] && x.c.houseId === s))
        .map((s) => ({ s, gap: candidatesScore(w, s, cands.find((x) => x.i === votes[s])!.c) - candidatesScore(w, s, ours.c) }))
        .filter((x) => x.gap < 45).sort((x, y) => x.gap - y.gap);
      for (const u of unsure.slice(0, m.swing)) votes[u.s] = ours.i;
    }
    for (const s of a.numarade.seats) count.set(votes[s] as number, (count.get(votes[s] as number) ?? 0) + 1);
    const ranked = cands.slice().sort((x, y) => (count.get(y.i) ?? 0) - (count.get(x.i) ?? 0) || prestigeOf(w, y.c.houseId) - prestigeOf(w, x.c.houseId));
    winner = ranked[0]!;
    if ((count.get(winner.i) ?? 0) >= Math.floor(a.numarade.seats.length / 2) + 1 || ranked.length === 1) {
      m.result = `${winner.c.name} of House ${houseName(w, winner.c.houseId)}, with ${count.get(winner.i) ?? 0} of ${a.numarade.seats.length} seats${round ? ` after ${round + 1} rounds` : ''}.`;
      break;
    }
    const last = ranked[ranked.length - 1]!;
    cands = cands.filter((x) => x !== last);
    for (const s of Object.keys(votes)) if (votes[s] === last.i) delete votes[s];
  }
  m.votes = votes;
  m.status = 'passed';
  seatExarchon(w, rng, winner.c, year);
  a.history.push({ year, kind: 'exarchon', text: `${winner.c.name} of House ${houseName(w, winner.c.houseId)} was elected Exarchon.`, houses: [winner.c.houseId] });
  shiftPrestige(w, winner.c.houseId, 6);
  const P = w.playerHouseId;
  logRecord(w, { kind: 'world', type: 'politics', severity: 3, text: `The Numarade elects an Exarchon: ${m.result}`, houseIds: [winner.c.houseId].filter((x) => w.houses[x]), source: 'the Numarade' });
  // Who backed the winner is remembered.
  for (const s of a.numarade.seats) {
    if (s === winner.c.houseId) continue;
    shiftRegard(w, winner.c.houseId, s, m.votes[s] === winner.i ? 6 : -3);
  }
  if (a.numarade.capanna.some((c) => c.houseId === P)) a.numarade.capanna = a.numarade.capanna.filter((c) => c.houseId !== P).concat();
  offerCapanna(w, rng);
}

/** The Exarchon may want one of ours on the Capanna: we are asked. */
function offerCapanna(w: World, rng: Rng): void {
  const a = w.archon!;
  const P = w.playerHouseId;
  const ex = a.numarade.exarchon;
  if (!ex || ex.houseId === P) return;
  if (regardOf(w, ex.houseId, P) < 20 && prestigeOf(w, P) < 55) return;
  if (!rng.chance(0.6)) return;
  a.numarade.capannaOffer = true;
}

// ---------------------------------------------------------------- the Minor seats

function seatScore(w: World, voter: string, c: string): number {
  if (voter === c) return 300;
  return regardOf(w, voter, c) + affinity(w, voter, c) * 18 + prestigeOf(w, c) * 0.45;
}

export function callSeats(w: World): Motion {
  const minors = liveHouses(w).filter((h) => h.tier === 'minor').map((h) => h.id);
  return table(w, 'seats', '', undefined, undefined, { candidates: minors.map((id) => ({ houseId: id, name: houseName(w, id) })) });
}

function closeSeats(w: World, rng: Rng, m: Motion): void {
  const a = w.archon!;
  const year = dateParts(w.date).year;
  const minors = liveHouses(w).filter((h) => h.tier === 'minor').map((h) => h.id);
  const score = new Map<string, number>();
  const P = w.playerHouseId;
  for (const v of minors) {
    const picks = minors.slice().sort((x, y) => seatScore(w, v, y) - seatScore(w, v, x)).slice(0, MINOR_SEATS);
    picks.forEach((c, i) => score.set(c, (score.get(c) ?? 0) + (MINOR_SEATS - i)));
  }
  // Our campaign: our Speaker's work counts as votes.
  if (m.swing && minors.includes(P)) score.set(P, (score.get(P) ?? 0) + m.swing * 3);
  for (const c of minors) score.set(c, (score.get(c) ?? 0) + rng.next());
  const chosen = minors.slice().sort((x, y) => (score.get(y) ?? 0) - (score.get(x) ?? 0)).slice(0, MINOR_SEATS);
  const lost = a.numarade.minorSeats.filter((s) => !chosen.includes(s));
  const won = chosen.filter((s) => !a.numarade.minorSeats.includes(s));
  a.numarade.minorSeats = chosen;
  seatHouses(w, a);
  a.numarade.nextElection = year + 5;
  m.status = 'passed';
  m.chosen = chosen;
  m.result = `Seated: ${chosen.map((c) => houseName(w, c)).join(', ')}.${won.length ? ` New: ${won.map((c) => houseName(w, c)).join(', ')}.` : ''}${lost.length ? ` Out: ${lost.map((c) => houseName(w, c)).join(', ')}.` : ''}`;
  for (const c of won) shiftPrestige(w, c, 3);
  for (const c of lost) shiftPrestige(w, c, -3);
  if (won.length || lost.length) a.history.push({ year, kind: 'claim', text: `The Minor seats changed hands: ${m.result}`, houses: [...won, ...lost] });
  logRecord(w, { kind: 'world', type: 'politics', severity: won.includes(P) || lost.includes(P) ? 3 : minors.includes(P) ? 2 : 1, text: `The Minor Houses choose their four: ${m.result}`, houseIds: chosen.filter((x) => w.houses[x]), source: 'the Numarade' });
}

// ---------------------------------------------------------------- what we can do

export function sponsorFor(w: World): string | null {
  const P = w.playerHouseId;
  const a = w.archon;
  if (!a) return null;
  if (a.numarade.seats.includes(P)) return P;
  const best = a.numarade.seats.slice().sort((x, y) => regardOf(w, y, P) - regardOf(w, x, P))[0];
  return best && regardOf(w, best, P) >= 35 ? best : null;
}

export type OurMotion = 'censure' | 'commend' | 'mediate' | 'raise';

export function cannotTable(w: World, kind: OurMotion, target?: string, second?: string): string | null {
  const a = w.archon;
  if (!a) return 'The Numarade is not sitting.';
  const P = w.playerHouseId;
  const sponsor = sponsorFor(w);
  if (!sponsor) return 'We hold no seat, and no seated house regards us well enough to bring it for us.';
  if (a.numarade.ourLast !== undefined && absoluteCycle(w.date) - a.numarade.ourLast < CYCLES_PER_ORBIT * 3) return 'We brought a motion lately; the Numarade will not hear us again so soon.';
  if (a.numarade.motions.some((m) => m.status === 'open' && m.by === sponsor && m.kind !== 'elect' && m.kind !== 'seats')) return 'A motion of ours is already before them.';
  if (kind === 'raise') {
    if (tierOf(w, P) !== 'minor') return 'We are already a Great House.';
    const low = lowestGreat(w);
    if (!low) return 'No Great House to stand down.';
    if (prestigeOf(w, P) < prestigeOf(w, low.id) - 6) return `Our standing (${rnd(prestigeOf(w, P))}) is too far below House ${low.name}'s (${rnd(low.prestige)}).`;
    return null;
  }
  if (!target) return 'Choose a house.';
  if (target === P && kind !== 'mediate') return 'Not ourselves.';
  if (kind === 'mediate') {
    if (!second) return 'Choose both sides of the feud.';
    const feud = riftBetween(a.feuds, target, second) || (w.realm?.feuds ?? []).some((f) => (f.a === target && f.b === second) || (f.a === second && f.b === target));
    if (!feud) return 'They are not at feud.';
  }
  return null;
}

export const lowestGreat = (w: World) => liveHouses(w).filter((h) => h.tier === 'great').sort((x, y) => x.prestige - y.prestige)[0];

/** Bring a motion before the Numarade (through a friendly seat if we hold none). */
export function tableMotion(input: World, kind: OurMotion, target?: string, second?: string): World {
  const why = cannotTable(input, kind, target, second);
  if (why) throw new Error(why);
  const w = structuredClone(input);
  const P = w.playerHouseId;
  const sponsor = sponsorFor(w)!;
  if (kind === 'raise') { target = P; second = lowestGreat(w)!.id; }
  const m = table(w, kind, sponsor, target, second);
  if (sponsor !== P) m.title += ` (for House ${houseName(w, P)})`;
  // Our own motion: our seat is for it, and our Speaker argues it.
  if (m.ask) { m.ask = false; m.votes[P] = 'aye'; }
  const sp = Object.values(w.characters).find((c) => c.alive && c.houseId === P && c.seat === 'envoy');
  if (sp) m.swing = (sp.stats.eloquence + sp.stats.diplomacy) / 2 >= 13 ? 2 : 1;
  w.archon!.numarade.ourLast = absoluteCycle(w.date);
  return w;
}

export const COURT_COST = 2500;
export function cannotCourt(w: World, target: string): string | null {
  if (target === w.playerHouseId) return 'Not ourselves.';
  if (!w.archon?.houses[target] || w.archon.houses[target]!.ended) return 'No such house.';
  const last = w.archon.numarade.courted?.[target];
  if (last !== undefined && absoluteCycle(w.date) - last < CYCLES_PER_ORBIT) return 'Courted this Orbit already.';
  if (econ(w, w.playerHouseId).stock.othes < COURT_COST) return `Needs ${COURT_COST.toLocaleString('en-US')} othes.`;
  return null;
}

/** Gifts and attention to a house: they think better of us (less so each time it is the same house). */
export function courtHouse(input: World, target: string): World {
  const why = cannotCourt(input, target);
  if (why) throw new Error(why);
  const w = structuredClone(input);
  const P = w.playerHouseId;
  econ(w, P).stock.othes -= COURT_COST;
  const now = regardOf(w, target, P);
  const by = Math.max(2, rnd(9 - Math.max(0, now) / 12));
  shiftRegard(w, target, P, by);
  w.archon!.numarade.courted![target] = absoluteCycle(w.date);
  logRecord(w, { kind: 'world', type: 'politics', severity: 1, text: `We send gifts and good words to House ${houseName(w, target)}. They think better of us (+${by}).`, houseIds: [target].filter((x) => w.houses[x]) });
  return w;
}

// ---------------------------------------------------------------- the year and the Orbit

export interface ArchonTick { phase: boolean; orbit: boolean; year: boolean }

export function advanceArchon(w: World, rng: Rng, t: ArchonTick): void {
  ensureArchon(w);
  const a = w.archon!;
  const now = absoluteCycle(w.date);
  // Motions close.
  for (const m of a.numarade.motions.filter((x) => x.status === 'open' && x.closes <= now)) {
    // Ours still waiting: give the council its due first (the event layer settles it).
    // Ours still to answer: the question waits its turn (one is put to us at a time), then the council's due.
    if (m.ask && m.votes[w.playerHouseId] === undefined && (!m.asked || w.events.pending.some((p) => p.defId.startsWith('num:') && p.defId !== 'num:capanna'))) continue;
    closeMotion(w, rng, m);
  }
  if (t.orbit) orbitly(w, rng);
  if (t.year) yearly(w, rng);
  askUs(w, rng);
}

/** Put the Numarade's questions to us, one at a time. */
function askUs(w: World, rng: Rng): void {
  const a = w.archon!;
  const P = w.playerHouseId;
  if (w.events.pending.some((p) => p.defId.startsWith('num:'))) return;
  const m = a.numarade.motions.find((x) => x.status === 'open' && x.ask && !x.asked && x.votes[P] === undefined);
  if (m) {
    m.asked = true;
    const def = m.kind === 'elect' ? 'num:elect' : m.kind === 'seats' ? 'num:seats' : 'num:vote';
    if (!fireStage(w, rng, def, { ...(m.target ? { otherHouseId: m.target } : {}) })) m.ask = false;
    return;
  }
  if (a.numarade.capannaOffer) {
    a.numarade.capannaOffer = false;
    fireStage(w, rng, 'num:capanna', { ...(a.numarade.exarchon ? { otherHouseId: a.numarade.exarchon.houseId } : {}) });
  }
}

/** The motion our seat is being asked about. */
export const askedMotion = (w: World) => w.archon?.numarade.motions.find((x) => x.status === 'open' && x.ask && x.asked && x.votes[w.playerHouseId] === undefined);

function orbitly(w: World, rng: Rng): void {
  const a = w.archon!;
  const n = a.numarade;
  // The Exarchon's chair.
  const ex = n.exarchon;
  if (ex?.personId && !w.characters[ex.personId]?.alive) vacate(w, rng, `The Exarchon ${ex.name} is dead.`);
  if (!n.exarchon) callElection(w, rng);
  // Seats tabling motions.
  if (rng.chance(0.16) && !n.motions.some((m) => m.status === 'open' && m.kind !== 'elect' && m.kind !== 'seats')) aiMotion(w, rng);
}

function vacate(w: World, rng: Rng, why: string): void {
  const a = w.archon!;
  const ex = a.numarade.exarchon;
  if (!ex) return;
  const year = dateParts(w.date).year;
  a.history.push({ year, kind: 'exarchon', text: `${why} (${ex.since}–${year}).`, houses: [ex.houseId] });
  logRecord(w, { kind: 'world', type: 'politics', severity: 3, text: `${why} The Numarade will choose another from the Great Houses.`, source: 'the Numarade' });
  a.numarade.exarchon = null;
  a.numarade.capanna = [];
  callElection(w, rng);
}

function aiMotion(w: World, rng: Rng): void {
  const a = w.archon!;
  const n = a.numarade;
  const opts: [() => void, number][] = [];
  // The same question is not asked again for a few years.
  const now = absoluteCycle(w.date);
  const recent = (kind: MotionKind, target?: string) => n.motions.some((m) => m.kind === kind && m.target === target && now - absoluteCycle(m.date) < CYCLES_PER_ORBIT * 25);
  for (const s of n.seats) {
    const others = liveHouses(w).map((h) => h.id).filter((x) => x !== s);
    const hated = others.slice().sort((x, y) => regardOf(w, s, x) - regardOf(w, s, y))[0];
    const loved = others.slice().sort((x, y) => regardOf(w, s, y) - regardOf(w, s, x))[0];
    if (hated && regardOf(w, s, hated) < -35 && !recent('censure', hated)) opts.push([() => table(w, 'censure', s, hated), (-regardOf(w, s, hated) - 30) / 25 * (1 - viewsOf(w, s).honour * 0.15)]);
    if (loved && regardOf(w, s, loved) > 50 && !recent('commend', loved)) opts.push([() => table(w, 'commend', s, loved), 0.3]);
  }
  const feuds: [string, string][] = [...a.feuds.map((r) => [r.a, r.b] as [string, string]), ...(w.realm?.feuds ?? []).map((f) => [f.a, f.b] as [string, string])];
  for (const [x, y] of feuds) {
    const peacemaker = n.seats.filter((s) => s !== x && s !== y).sort((p, q) => viewsOf(w, q).numarade + viewsOf(w, q).honour - viewsOf(w, p).numarade - viewsOf(w, p).honour)[0];
    if (peacemaker && !recent('mediate', x)) opts.push([() => table(w, 'mediate', peacemaker, x, y), 0.5]);
  }
  const cf = ceasefireMotionFor(w);
  if (cf && !n.motions.some((m) => m.status === 'open' && m.kind === 'ceasefire')) {
    const war = w.war!.wars.find((x) => x.id === cf.warId)!;
    opts.push([() => table(w, 'ceasefire', cf.by, war.attacker, war.defender, { warId: war.id }), 1.5]);
  }
  const ex = n.exarchon;
  if (ex) {
    const dislike = n.seats.filter((s) => s !== ex.houseId).reduce((t, s) => t + regardOf(w, s, ex.houseId), 0) / Math.max(1, n.seats.length - 1);
    if (dislike < -25) { const by = n.seats.filter((s) => s !== ex.houseId).sort((p, q) => regardOf(w, p, ex.houseId) - regardOf(w, q, ex.houseId))[0]; if (by && !recent('remove')) opts.push([() => table(w, 'remove', by), 0.4]); }
  }
  if (!opts.length) return;
  rng.weighted(opts)();
}

function yearly(w: World, rng: Rng): void {
  const a = w.archon!;
  const year = dateParts(w.date).year;
  const P = w.playerHouseId;
  const houses = liveHouses(w);
  // Prestige settles toward what a house is.
  for (const h of houses) {
    if (w.houses[h.id]) h.worlds = Object.values(w.planets).filter((p) => p.houseId === h.id).length || h.worlds;
    h.prestige = clamp(h.prestige + (basisOf(w, h) - h.prestige) * 0.12 + (rng.next() - 0.5) * 4, 0, 100);
  }
  // Regard drifts toward what views and history make of it; feuds and pacts open and close.
  for (const x of houses) for (const y of houses) {
    if (x.id >= y.id) continue;
    const both = isSim(w, x.id) && isSim(w, y.id);
    const aff = affinity(w, x.id, y.id);
    if (both) { shiftRelation(w, x.id, y.id, rnd(aff * 2)); shiftRelation(w, y.id, x.id, rnd(aff * 2)); continue; }
    const feud = riftBetween(a.feuds, x.id, y.id), pact = riftBetween(a.pacts, x.id, y.id);
    const base = aff * 25 + (pact ? 15 : 0) - (feud ? 25 : 0);
    for (const [p, q] of [[x.id, y.id], [y.id, x.id]] as const) shiftRegard(w, p, q, rnd((base - regardOf(w, p, q)) * 0.1 + (rng.next() - 0.5) * 8));
    const r = (regardOf(w, x.id, y.id) + regardOf(w, y.id, x.id)) / 2;
    if (!feud && r < -55 && rng.chance(0.25)) openRift(w, 'feud', x.id, y.id, year, 'old grievances');
    else if (feud && r > -15) closeRift(w, 'feud', feud, year);
    if (!pact && !feud && r > 55 && rng.chance(0.2)) openRift(w, 'pact', x.id, y.id, year, 'long friendship');
    else if (pact && r < 15) closeRift(w, 'pact', pact, year);
  }
  // Rulers of the register age and pass.
  for (const h of houses) {
    if (!h.ruler) continue;
    const age = year - h.ruler.born;
    const span = SPECIES[h.ruler.species].lifespan;
    if (age > span[0] * 0.85 && rng.chance(0.04 + (age - span[0] * 0.85) * 0.015)) {
      const old = h.ruler.name;
      h.ruler = newRuler(rng, h, year);
      // A new ruler sometimes sees one thing differently.
      if (rng.chance(0.35)) { const t = rng.pick(TOPICS); h.views[t] = clamp(h.views[t] + (rng.chance(0.5) ? 1 : -1), -2, 2); }
      logRecord(w, { kind: 'world', type: 'world', severity: 0, text: `${old} of House ${h.name} is dead; ${h.ruler.name} rules in their place.`, source: 'the Numarade' });
    }
  }
  // The Exarchon ages too, if they are not one of ours to simulate.
  const ex = a.numarade.exarchon;
  if (ex && !ex.personId) {
    const age = year - ex.born;
    const span = SPECIES[ex.species].lifespan;
    if (age > span[0] * 0.8 && rng.chance(0.03 + (age - span[0] * 0.8) * 0.02)) vacate(w, rng, `The Exarchon ${ex.name} is dead.`);
  }
  // The Exarchon's eye on us.
  if (ex && w.realm && ex.houseId !== P) w.realm.favour[P] = clamp((w.realm.favour[P] ?? 50) + regardOf(w, ex.houseId, P) / 30, 0, 100);
  if (a.numarade.capanna.some((c) => c.houseId === P) && w.realm) w.realm.favour[P] = clamp((w.realm.favour[P] ?? 50) + 3, 0, 100);
  // The Minor seats every five years.
  if (year >= a.numarade.nextElection && !a.numarade.motions.some((m) => m.status === 'open' && m.kind === 'seats')) callSeats(w);
  // Rising and falling: rare, and only when the gap is plain.
  const low = lowestGreat(w);
  const top = houses.filter((h) => h.tier === 'minor').sort((x, y) => y.prestige - x.prestige)[0];
  if (low && top && top.id !== P && top.prestige > low.prestige + 10 && year - a.numarade.lastShift >= 12 && !a.numarade.motions.some((m) => m.status === 'open' && m.kind === 'raise')) {
    const by = a.numarade.seats.filter((s) => s !== low.id).sort((p, q) => regardOf(w, q, top.id) - regardOf(w, p, top.id))[0];
    if (by && rng.chance(0.5)) table(w, 'raise', by, top.id, low.id);
  }
  // New houses on the frontier.
  maybeFound(w, rng, year);
}

function openRift(w: World, kind: 'feud' | 'pact', x: string, y: string, year: number, cause: string): void {
  const a = w.archon!;
  const r: Rift = { a: x, b: y, since: year, cause };
  (kind === 'feud' ? a.feuds : a.pacts).push(r);
  a.history.push({ year, kind, text: kind === 'feud' ? `House ${houseName(w, x)} and House ${houseName(w, y)} fell into feud over ${cause}.` : `House ${houseName(w, x)} and House ${houseName(w, y)} swore a pact.`, houses: [x, y] });
  const P = w.playerHouseId;
  if (x === P || y === P || kind === 'feud') logRecord(w, { kind: 'world', type: 'politics', severity: x === P || y === P ? 2 : 0, text: a.history[a.history.length - 1]!.text, houseIds: [x, y].filter((h) => w.houses[h]), source: 'the Numarade' });
}

function closeRift(w: World, kind: 'feud' | 'pact', r: Rift, year: number): void {
  const a = w.archon!;
  if (kind === 'feud') a.feuds = a.feuds.filter((x) => x !== r); else a.pacts = a.pacts.filter((x) => x !== r);
  a.history.push({ year, kind, text: kind === 'feud' ? `The feud between House ${houseName(w, r.a)} and House ${houseName(w, r.b)} cooled (${r.since}–${year}).` : `The pact between House ${houseName(w, r.a)} and House ${houseName(w, r.b)} lapsed (${r.since}–${year}).`, houses: [r.a, r.b] });
}

// ---------------------------------------------------------------- founding

/** Worlds that could still take a house. */
export const openWilds = (w: World) => Object.values(w.archon?.frontier ?? {}).filter((x) => !x.claimedBy);

export interface Founding { founder: string; species: SpeciesId; family: string; from?: string; wildId: string; year: number; name?: string }

/** A new Minor House: a founder claims a world, raises a capital, and the Archon has one more house. */
export function foundHouse(w: World, rng: Rng, f: Founding): ArchonHouse | null {
  const a = w.archon!;
  const wild = a.frontier[f.wildId];
  if (!wild || wild.claimedBy) return null;
  const name = f.name ?? (f.family.startsWith('the ') ? buildWord(rng, CULTURES[f.species].given) : f.family);
  let id = name.toLowerCase().replace(/[^a-z]/g, '');
  while (!id || a.houses[id] || w.houses[id]) id = `${id || 'house'}${rng.int(2, 9)}`;
  const parent = f.from ? a.houses[f.from] : undefined;
  const views = Object.fromEntries(TOPICS.map((t) => [t, parent ? clamp(parent.views[t] + rng.int(-1, 1), -2, 2) : rng.int(-2, 2)])) as Views;
  const h: ArchonHouse = {
    id, name, tier: 'minor', species: f.species, speciesKnown: true, canon: false, simulated: false,
    focus: 'A young house of the frontier', blurb: `Founded in ${f.year} by ${f.founder}${parent ? `, once of House ${parent.name}` : ''}, who raised a capital on ${wildLabel(wild)}.`,
    worlds: 1, might: 0.55 + rng.next() * 0.25, views, prestige: 15 + rng.next() * 10, founded: f.year, foundedBy: f.founder,
    capital: `${wild.name} Hold`, wildId: wild.id,
    ruler: { name: f.founder, born: f.year - rng.int(SPECIES[f.species].adulthood + 8, SPECIES[f.species].adulthood + 30), since: f.year, species: f.species },
    personality: { aggression: rng.next(), honour: rng.next(), greed: rng.next(), intrigue: rng.next(), piety: rng.next(), isolation: rng.next() },
    notables: [], families: [name],
  };
  a.houses[id] = h;
  wild.claimedBy = id; wild.claimedYear = f.year; wild.capital = h.capital;
  for (const o of liveHouses(w)) {
    if (o.id === id) continue;
    (a.regard[id] ??= {})[o.id] = rnd(affinity(w, id, o.id) * 25 + (o.id === f.from ? 25 : 0));
    (a.regard[o.id] ??= {})[id] = rnd(affinity(w, o.id, id) * 20 + (o.id === f.from ? 10 : -5));
  }
  a.history.push({ year: f.year, kind: 'founding', text: `${f.founder} claimed ${wildLabel(wild)} and raised a capital there: House ${name} was founded.`, houses: [id, ...(f.from ? [f.from] : [])] });
  return h;
}

/** Now and then someone of a house on the register strikes out and founds their own. */
function maybeFound(w: World, rng: Rng, year: number): void {
  const a = w.archon!;
  const open = openWilds(w).filter((x) => worthOf(x) > 0.3);
  if (!open.length || !rng.chance(0.045)) return;
  const from = rng.pick(liveHouses(w).filter((h) => !h.simulated && h.id !== w.playerHouseId));
  if (!from) return;
  const sp = from.vassals && rng.chance(0.3) ? rng.pick(from.vassals) : from.species;
  const family = rng.pick(CULTURES[sp].familyNames);
  const founder = personName(rng, sp, family);
  const wild = open.sort((x, y) => worthOf(y) - worthOf(x))[rng.int(0, Math.min(3, open.length - 1))]!;
  const h = foundHouse(w, rng, { founder, species: sp, family, from: from.id, wildId: wild.id, year });
  if (h) logRecord(w, { kind: 'world', type: 'politics', severity: 1, text: `A new house: ${founder}, once of House ${from.name}, has claimed ${wildLabel(wild)} and raised a capital. House ${h.name} takes its place among the Minor Houses.`, source: 'the Numarade' });
  void a;
}

// ---------------------------------------------------------------- threads from history onto living people

/** Lay grudges and debts from the past on living people of the simulated houses. */
export function threadsFromHistory(w: World, rng: Rng): void {
  const a = w.archon!;
  const year = dateParts(w.date).year;
  const recentWars = a.history.filter((e) => e.kind === 'war' && year - e.year <= 40);
  for (const e of recentWars) {
    for (const hid of e.houses.filter((h) => w.houses[h])) {
      const foe = e.houses.find((x) => x !== hid);
      if (!foe) continue;
      const elders = Object.values(w.characters).filter((c) => c.alive && c.houseId === hid && c.tier === 'full' && ageOf(c, w.date) - (year - e.year) >= SPECIES[c.species].adulthood);
      const who = elders.length ? rng.pick(elders) : undefined;
      if (who && rng.chance(0.7)) addThread(w, who.id, 'grudge', `An old score from the war with House ${houseName(w, foe)} (${e.year})`);
    }
  }
}

