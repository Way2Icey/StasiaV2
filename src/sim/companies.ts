// The corsair companies as people: a chief, captains and a fixer, most of them names we do not know yet.
// We learn them as they cross us: a raid led by a captain someone recognised, a ransomed crew's story, a
// word from a company that likes us. Every dealing with a company goes in its history. A house can turn
// openly hostile to a company, or send its knights to hunt a known captain down.
import { Rng } from './rng';
import { buildWord } from './names';
import { econ, record } from './economy';
import { logRecord } from './records';
import { isAway } from './court';
import { isMilitary } from './grounds';
import { kill } from './death';
import { imprison } from './holdings';
import { tally } from './careers';
import { seasoned } from './ladder';
import { powerOf } from './fleet';
import { LANE_BY_ID } from './lanes';
import { competence } from './reports';
import { absoluteCycle, addCycles, CYCLES_PER_PHASE, type GameDate } from './time';
import { CULTURES } from '../data/cultures';
import { SHIP_ADJECTIVES, SHIP_NOUNS } from '../data/ships';
import type { SpeciesId, World } from './types';
import type { Faction } from './lanes';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export type MemberRole = 'chief' | 'captain' | 'fixer';
export const ROLE_LABEL: Record<MemberRole, string> = { chief: 'Chief', captain: 'Captain', fixer: 'Fixer' };
export interface Member {
  id: string;
  name: string;
  role: MemberRole;
  ship?: string;
  /** What they sail: a cutter, a raider or a frigate. */
  hull?: Hull;
  /** 1..20, like our people: blade work, how they fight a ship, how hard they are to find. */
  skill: number;
  tactics?: number;
  cunning?: number;
  /** 0..100: how good their crew is. */
  crew?: number;
  /** How many runs they have taken. */
  takes: number;
  known: boolean;
  /** What we know of them, as we learned it. */
  notes: string[];
  fate?: 'dead' | 'captured';
  /** Who did it. */
  fateBy?: string;
}
export interface CompanyLine { date: GameDate; text: string; ours?: boolean }
export interface Hunt { id: string; faction: string; memberId: string; leaderId: string; companions: string[]; launched: GameDate; resolves: GameDate; /** Our ship, if one went. */ shipId?: string }

export type Hull = 'cutter' | 'raider' | 'frigate';
export const HULL: Record<Hull, { label: string; power: number }> = {
  cutter: { label: 'Cutter', power: 6 }, raider: { label: 'Raider', power: 11 }, frigate: { label: 'Corsair frigate', power: 17 },
};

export const HUNT_COST = 600;
export const HUNT_CYCLES = CYCLES_PER_PHASE * 2;

const SPECIES: SpeciesId[] = ['fokari', 'thessari', 'doven', 'gholari', 'serathi', 'torvann', 'shaaliin'];
const EPITHETS = ['the Knife', 'Half-Hand', 'the Quiet', 'Saltjaw', 'the Widow', 'Ninefingers', 'the Tally', 'Black Lantern', 'the Ferryman', 'Old Rust', 'the Debt', 'Copper-Eye'];

function personName(rng: Rng): string {
  const sp = rng.pick(SPECIES.filter((s) => CULTURES[s]));
  const c = CULTURES[sp]!;
  const base = `${buildWord(rng, c.given)} ${rng.pick(c.familyNames)}`;
  return rng.chance(0.4) ? `${base.split(' ')[0]} ${rng.pick(EPITHETS)}` : base;
}

function newMember(world: World, rng: Rng, role: MemberRole): Member {
  const chief = role === 'chief';
  return {
    id: `cm${world.nextId++}`, name: personName(rng), role,
    ship: role === 'fixer' ? undefined : `${rng.pick(SHIP_ADJECTIVES)} ${rng.pick(SHIP_NOUNS)}`,
    hull: role === 'fixer' ? undefined : chief ? 'frigate' : rng.pick(['cutter', 'raider', 'raider'] as const),
    skill: chief ? rng.int(13, 17) : role === 'captain' ? rng.int(8, 14) : rng.int(6, 10),
    tactics: chief ? rng.int(12, 17) : rng.int(7, 14),
    cunning: rng.int(7, chief ? 16 : 14),
    crew: chief ? rng.int(55, 80) : rng.int(30, 65),
    takes: 0, known: false, notes: [],
  };
}

/** Older saves: give everyone the full set. */
function fill(m: Member, seed: string) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  m.tactics ??= 8 + (h % 7);
  m.cunning ??= 8 + ((h >> 3) % 7);
  m.crew ??= 35 + ((h >> 5) % 35);
  if (m.role !== 'fixer') m.hull ??= m.role === 'chief' ? 'frigate' : (h % 3 === 0 ? 'cutter' : 'raider');
}

/** A run taken teaches the captain and hardens the crew; a beating costs them hands. */
export function piracyXp(rng: Rng, m: Member | undefined, won: boolean): void {
  if (!m) return;
  if (won) {
    m.crew = clamp((m.crew ?? 40) + 2, 0, 95);
    if (rng.chance(0.3)) {
      const k = rng.pick(['skill', 'tactics', 'cunning'] as const);
      m[k] = clamp((m[k] ?? 10) + 1, 1, 20);
    }
  } else {
    m.crew = clamp((m.crew ?? 40) - 4, 10, 95);
    if (rng.chance(0.15)) m.tactics = clamp((m.tactics ?? 10) + 1, 1, 20);
  }
}

export function seedMembers(world: World, f: Faction): void {
  if (f.members?.length) { for (const m of f.members) fill(m, m.id + m.name); return; }
  const rng = Rng.fromSeed(`${world.seed}:${f.id}:crew`);
  f.members = [newMember(world, rng, 'chief'), newMember(world, rng, 'captain'), newMember(world, rng, 'captain'), newMember(world, rng, 'captain'), newMember(world, rng, 'fixer')];
  // Everyone knows who leads a company; nobody knows much else.
  f.members[0]!.known = true;
  f.members[0]!.notes.push('Known by name across the Reaches.');
}

export const alive = (f: Faction) => (f.members ?? []).filter((m) => !m.fate);
export const knownMembers = (f: Faction) => (f.members ?? []).filter((m) => m.known);

/** Who led a strike: usually a captain, now and then the chief. */
export function leaderFor(f: Faction, rng: Rng): Member | undefined {
  const caps = alive(f).filter((m) => m.role === 'captain');
  const chief = alive(f).find((m) => m.role === 'chief');
  if (chief && (rng.chance(0.15) || !caps.length)) return chief;
  return caps.length ? rng.pick(caps) : undefined;
}

/** Learn a name: returns the member if they were unknown before. */
export function reveal(m: Member | undefined, how: string): Member | undefined {
  if (!m || m.known) return undefined;
  m.known = true;
  m.notes.push(how);
  return m;
}

export function chronicle(world: World, f: Faction, text: string, ours = true): void {
  (f.log ??= []).unshift({ date: world.date, text, ours });
  f.log = f.log.slice(0, 80);
}

/** Captains die and get caught; the company makes new ones. */
export function replenish(world: World, rng: Rng, f: Faction): void {
  const caps = alive(f).filter((m) => m.role === 'captain').length;
  if (caps < 3 && rng.chance(0.3)) f.members.push(newMember(world, rng, 'captain'));
  if (!alive(f).some((m) => m.role === 'chief') && rng.chance(0.5)) {
    const heir = alive(f).filter((m) => m.role === 'captain').sort((a, b) => b.takes - a.takes)[0];
    if (heir) {
      heir.role = 'chief';
      heir.skill = Math.max(heir.skill, 14);
      chronicle(world, f, `${heir.known ? heir.name : 'One of the captains'} has taken command of ${f.name}.`, false);
    }
  }
}

// ---------------------------------------------------------------- the Highroy's hand

function act(input: World, fn: (w: World, rng: Rng) => void): World {
  const w = structuredClone(input);
  const rng = new Rng(w.rng);
  fn(w, rng);
  w.rng = rng.state;
  return w;
}

export function isHostile(world: World, f: Faction, house = world.playerHouseId): boolean { return !!f.hostile?.includes(house); }

/** Declare the company an enemy of the house, or stand that down. */
export function setHostile(input: World, factionId: string, on: boolean): World {
  return act(input, (w) => {
    const P = w.playerHouseId;
    const f = w.lanes?.factions[factionId];
    if (!f) return;
    f.hostile = (f.hostile ?? []).filter((h) => h !== P);
    if (on) {
      f.hostile.push(P);
      w.lanes.deals = w.lanes.deals.filter((d) => !(d.house === P && d.faction === factionId && d.kind !== 'bounty'));
      f.rel[P] = clamp((f.rel[P] ?? 0) - 15, -100, 100);
      chronicle(w, f, `We declared ${f.name} enemies of the house. Our escorts and patrols fight them on sight; our docks will not touch their goods.`);
    } else chronicle(w, f, `We stood down our quarrel with ${f.name}.`);
  });
}

/** Our great ships that could go on a hunt: home and not on a long station. */
export function huntShips(world: World): string[] {
  const P = world.playerHouseId;
  return Object.values(world.fleet?.ships ?? {}).filter((s) => s.houseId === P && !s.lost && !s.arrives && !s.ready && !s.crucible && s.condition >= 40 && (s.duty === 'harbour' || s.duty === 'escort' || s.duty === 'patrol')).map((s) => s.id);
}

const worth = (c: { stats: Record<string, number> }) => (c.stats.duelling! + c.stats.valor! + c.stats.tactics!) / 3;

/**
 * Both sides of a hunt, before the dice. Ours: the leader, a fifth of each companion, the leader's command,
 * and the ship (a hired cutter if none). Theirs: the captain's blade and tactics, the crew, the hull, any
 * other captain sailing with them, and how well they know the lanes they are found on.
 */
export function huntOdds(world: World, factionId: string, memberId: string, leaderId: string, companions: string[] = [], shipId?: string): { ours: number; theirs: number; win: number; find: number } {
  const f = world.lanes.factions[factionId]!;
  const m = f.members.find((x) => x.id === memberId)!;
  const lead = world.characters[leaderId];
  if (!lead) return { ours: 0, theirs: 0, win: 0, find: 0 };
  const mates = companions.map((id) => world.characters[id]).filter((c) => c?.alive);
  const ship = shipId ? world.fleet?.ships[shipId] : undefined;
  const ours = worth(lead) + mates.reduce((n, c) => n + worth(c!) / 5, 0) + (lead.stats.leadership + lead.stats.tactics - 20) / 5 + (ship ? powerOf(world, ship) / 4 : HULL.cutter.power / 2);
  const wild = f.haunts.reduce((n, id) => n + (LANE_BY_ID[id]?.wild ?? 0.3), 0) / Math.max(1, f.haunts.length);
  const second = m.role === 'chief' ? alive(f).filter((x) => x.role === 'captain').sort((a, b) => b.skill - a.skill)[0] : undefined;
  const theirs = m.skill * 0.6 + (m.tactics ?? 10) * 0.4 + (m.crew ?? 40) / 10 + HULL[m.hull ?? 'raider'].power / 2 + (second ? second.skill / 3 : 0) + wild * 3;
  // Both sides roll ±4: the difference spreads about 5.7 either way.
  const win = 1 / (1 + Math.exp(-((ours - theirs) / 5.66) * 1.7));
  const find = clamp(0.5 + competence(world, 'spymaster') * 0.012 + (lead.stats.perception - 10) * 0.02 - ((m.cunning ?? 10) - 10) * 0.025, 0.25, 0.9);
  return { ours, theirs, win, find };
}

export function cannotHunt(world: World, factionId: string, memberId: string, leaderId: string): string | null {
  const P = world.playerHouseId;
  const f = world.lanes?.factions[factionId];
  const m = f?.members.find((x) => x.id === memberId);
  if (!f || !m) return 'No such person.';
  if (!m.known) return 'We do not know who they are.';
  if (m.fate) return m.fate === 'dead' ? 'Already dead.' : 'Already taken.';
  if (m.role === 'fixer') return 'A fixer lives in the ports, not on a ship: an investigation, not a hunt.';
  if (world.lanes.hunts.some((h) => h.memberId === memberId)) return 'Already being hunted.';
  const c = world.characters[leaderId];
  if (!c?.alive || c.houseId !== P) return 'Choose who leads it.';
  if (!isMilitary(world, c)) return 'Only knights and officers hunt corsairs.';
  if (isAway(world, c.id) || c.flags.some((x) => x.id === 'wounded' || x.id === 'hunting')) return `${c.name.given} is not free.`;
  if (econ(world, P).stock.othes < HUNT_COST) return `Needs ${HUNT_COST} othes.`;
  return null;
}

/** Send a knight, and whoever they take, after a known captain. */
export function huntMember(input: World, factionId: string, memberId: string, leaderId: string, companions: string[] = [], shipId?: string): World {
  if (cannotHunt(input, factionId, memberId, leaderId)) return input;
  if (shipId && !huntShips(input).includes(shipId)) shipId = undefined;
  return act(input, (w) => {
    const P = w.playerHouseId;
    const f = w.lanes.factions[factionId]!;
    const m = f.members.find((x) => x.id === memberId)!;
    const lead = w.characters[leaderId]!;
    const crew = companions.filter((id) => id !== leaderId && w.characters[id]?.alive && !isAway(w, id)).slice(0, 3);
    record(w, P, { resource: 'othes', amount: -HUNT_COST, label: `Hunting ${m.name}`, kind: 'mission' });
    const until = addCycles(w.date, HUNT_CYCLES);
    for (const id of [leaderId, ...crew]) w.characters[id]!.flags.push({ id: 'hunting', since: w.date, detail: `after ${m.name} of ${f.name}` });
    w.lanes.hunts.push({ id: `hn${w.nextId++}`, faction: factionId, memberId, leaderId, companions: crew, launched: w.date, resolves: until, shipId });
    const ship = shipId ? w.fleet.ships[shipId] : undefined;
    if (ship) { ship.from = ship.sectorId; ship.left = w.date; ship.arrives = until; }
    chronicle(w, f, `${lead.name.given} went out after ${m.name}${m.ship ? ` and the ${m.ship}` : ''}.`);
    logRecord(w, { kind: 'world', type: 'mission', severity: 1, seat: 'grandMaster', houseIds: [P], text: `${lead.name.given} sails to hunt ${m.name} of ${f.name}.`, who: [{ id: lead.id, part: 'leads the hunt' }, ...crew.map((id) => ({ id, part: 'with them' }))], quote: { from: lead.id, text: rngLine(lead.id + m.id, ['I will bring back their ship or their head.', 'They have had our convoys long enough.', 'Give me a Phase. Two at most.']) } });
  });
}

function rngLine(seed: string, xs: string[]): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return xs[h % xs.length]!;
}

function resolveHunt(world: World, rng: Rng, h: Hunt) {
  const P = world.playerHouseId;
  const f = world.lanes.factions[h.faction];
  const m = f?.members.find((x) => x.id === h.memberId);
  const lead = world.characters[h.leaderId];
  const party = [h.leaderId, ...h.companions].map((id) => world.characters[id]).filter((c) => c?.alive);
  for (const c of party) c!.flags = c!.flags.filter((x) => x.id !== 'hunting');
  const ship = h.shipId ? world.fleet?.ships[h.shipId] : undefined;
  if (!f || !m || !lead?.alive) return;
  const who = [{ id: lead.id, part: 'led the hunt' }, ...h.companions.map((id) => ({ id, part: 'went with them' }))];
  const odds = huntOdds(world, f.id, m.id, lead.id, h.companions, ship?.id);
  const aboard = ship ? ` aboard the ${ship.name}` : '';
  if (m.fate || !rng.chance(odds.find)) {
    chronicle(world, f, `${lead.name.given} hunted ${m.name} for two Phases and never found the ${m.ship ?? 'ship'}.`);
    logRecord(world, { kind: 'world', type: 'mission', severity: 1, seat: 'grandMaster', houseIds: [P], text: `${lead.name.given} came home without ${m.name}: the ${m.ship ?? 'ship'} was never where the word said it would be.`, who });
    m.notes.push(`Slipped a hunt led by ${lead.name.given}.`);
    return;
  }
  const margin = odds.ours + rng.gauss() * 4 - (odds.theirs + rng.gauss() * 4);
  const won = margin >= 0;
  for (const c of party) { seasoned(world, rng, c!.id, won); tally(world, c!.id, 'raidsRepelled'); }
  piracyXp(rng, m, !won);
  if (ship) { ship.condition = clamp(ship.condition - rng.int(5, won ? 12 : 22), 5, 100); }
  if (won) {
    const taken = rng.chance(clamp(0.35 + margin * 0.05, 0.2, 0.8));
    m.fate = taken ? 'captured' : 'dead';
    m.fateBy = lead.id;
    f.strength = clamp(f.strength - (m.role === 'chief' ? 15 : 8), 10, 95);
    f.rel[P] = clamp((f.rel[P] ?? 0) - 30, -100, 100);
    const st = world.houses[P]!.standing;
    st.respect = clamp(st.respect + 2, 0, 100);
    st.dread = clamp(st.dread + 1, 0, 100);
    if (taken) imprison(world, P, m.name, `corsair ${m.role} of ${f.name}`, null, 'crime', 10 + rng.int(0, 6));
    chronicle(world, f, `${lead.name.given} ${taken ? 'took' : 'killed'} ${m.name}${m.ship ? ` aboard the ${m.ship}` : ''}.`);
    logRecord(world, { kind: 'world', type: 'fight', severity: 2, seat: 'grandMaster', houseIds: [P], text: `${lead.name.given} ran down ${m.name} of ${f.name}${m.ship ? ` and the ${m.ship}` : ''}${aboard} and ${taken ? 'brought them home in chains' : 'killed them'}.`, who, effects: ['Respect +2', 'Dread +1', `${cap(f.name)} weakened`, `${cap(f.name)} regard −30`], quote: { from: lead.id, text: taken ? 'Alive, as you see. They will have plenty to say.' : 'They would not strike. So.' } });
    return;
  }
  // Beaten. A near thing costs a bruise or two; a rout can cost a life.
  f.rel[P] = clamp((f.rel[P] ?? 0) - 10, -100, 100);
  const rout = margin < -5;
  let hurt: string;
  const roll = rng.next();
  if (rout && roll < 0.05) { kill(world, lead, world.date, `killed hunting ${m.name} of ${f.name}`); hurt = `${lead.name.given} was killed`; }
  else if (roll < (rout ? 0.6 : 0.3)) { lead.flags.push({ id: 'wounded', since: world.date, until: addCycles(world.date, CYCLES_PER_PHASE * (rout ? 3 : 2)), detail: `hunting ${m.name}` }); hurt = `${lead.name.given} came home wounded`; }
  else hurt = `${lead.name.given} brought everyone home, beaten`;
  if (rout) for (const id of h.companions) { const c = world.characters[id]; if (c?.alive && rng.chance(0.3)) c.flags.push({ id: 'wounded', since: world.date, until: addCycles(world.date, CYCLES_PER_PHASE * 2), detail: `hunting ${m.name}` }); }
  m.notes.push(`Beat off a hunt led by ${lead.name.given}${aboard}.`);
  chronicle(world, f, `${m.name} beat off our hunt${aboard}: ${hurt.toLowerCase()}.`);
  logRecord(world, { kind: 'world', type: 'fight', severity: 2, seat: 'grandMaster', houseIds: [P], text: `${m.name} was ready for us${aboard ? `, and the ${ship!.name} came home scarred` : ''}. The hunt ${rout ? 'was routed' : 'fell just short'}: ${hurt}.`, who });
}

export function advanceHunts(world: World, rng: Rng): void {
  const now = absoluteCycle(world.date);
  for (const h of [...(world.lanes.hunts ?? [])]) {
    if (absoluteCycle(h.resolves) > now) continue;
    world.lanes.hunts = world.lanes.hunts.filter((x) => x !== h);
    resolveHunt(world, rng, h);
  }
}

export function huntersFree(world: World): string[] {
  const P = world.playerHouseId;
  return Object.values(world.characters).filter((c) => c.alive && c.houseId === P && isMilitary(world, c) && !isAway(world, c.id) && !c.flags.some((x) => x.id === 'wounded' || x.id === 'hunting'))
    .sort((a, b) => (b.stats.duelling + b.stats.valor + b.stats.tactics) - (a.stats.duelling + a.stats.valor + a.stats.tactics)).map((c) => c.id);
}

