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
  /** 8..20: how hard they are to take. */
  skill: number;
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
export interface Hunt { id: string; faction: string; memberId: string; leaderId: string; companions: string[]; launched: GameDate; resolves: GameDate }

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
  return {
    id: `cm${world.nextId++}`, name: personName(rng), role,
    ship: role === 'fixer' ? undefined : `${rng.pick(SHIP_ADJECTIVES)} ${rng.pick(SHIP_NOUNS)}`,
    skill: role === 'chief' ? rng.int(14, 19) : role === 'captain' ? rng.int(9, 16) : rng.int(8, 12),
    takes: 0, known: false, notes: [],
  };
}

export function seedMembers(world: World, f: Faction): void {
  if (f.members?.length) return;
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
export function huntMember(input: World, factionId: string, memberId: string, leaderId: string, companions: string[] = []): World {
  if (cannotHunt(input, factionId, memberId, leaderId)) return input;
  return act(input, (w) => {
    const P = w.playerHouseId;
    const f = w.lanes.factions[factionId]!;
    const m = f.members.find((x) => x.id === memberId)!;
    const lead = w.characters[leaderId]!;
    const crew = companions.filter((id) => id !== leaderId && w.characters[id]?.alive && !isAway(w, id)).slice(0, 2);
    record(w, P, { resource: 'othes', amount: -HUNT_COST, label: `Hunting ${m.name}`, kind: 'mission' });
    const until = addCycles(w.date, HUNT_CYCLES);
    for (const id of [leaderId, ...crew]) w.characters[id]!.flags.push({ id: 'hunting', since: w.date, detail: `after ${m.name} of ${f.name}` });
    w.lanes.hunts.push({ id: `hn${w.nextId++}`, faction: factionId, memberId, leaderId, companions: crew, launched: w.date, resolves: until });
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
  if (!f || !m || !lead?.alive) return;
  const who = [{ id: lead.id, part: 'led the hunt' }, ...h.companions.map((id) => ({ id, part: 'went with them' }))];
  // Finding them at all.
  const find = 0.55 + competence(world, 'spymaster') * 0.012 + (lead.stats.perception - 10) * 0.02;
  if (m.fate || !rng.chance(clamp(find, 0.3, 0.9))) {
    chronicle(world, f, `${lead.name.given} hunted ${m.name} for two Phases and never found the ${m.ship ?? 'ship'}.`);
    logRecord(world, { kind: 'world', type: 'mission', severity: 1, seat: 'grandMaster', houseIds: [P], text: `${lead.name.given} came home without ${m.name}: the ${m.ship ?? 'ship'} was never where the word said it would be.`, who });
    return;
  }
  // The leader carries it; each companion adds a quarter of what they are worth.
  const worth = (c: (typeof party)[number]) => (c!.stats.duelling + c!.stats.valor + c!.stats.tactics) / 3;
  const ours = worth(lead) + party.filter((c) => c!.id !== lead.id).reduce((n, c) => n + worth(c) * 0.25, 0) + rng.gauss() * 4;
  const theirs = m.skill + f.strength / 8 + (m.role === 'chief' ? 4 : 0) + rng.gauss() * 4;
  tally(world, lead.id, 'raidsRepelled');
  if (ours >= theirs) {
    const taken = rng.chance(0.45);
    m.fate = taken ? 'captured' : 'dead';
    m.fateBy = lead.id;
    f.strength = clamp(f.strength - (m.role === 'chief' ? 15 : 8), 10, 95);
    f.rel[P] = clamp((f.rel[P] ?? 0) - 30, -100, 100);
    const st = world.houses[P]!.standing;
    st.respect = clamp(st.respect + 2, 0, 100);
    st.dread = clamp(st.dread + 1, 0, 100);
    if (taken) imprison(world, P, m.name, `corsair ${m.role} of ${f.name}`, null, 'crime', 10 + rng.int(0, 6));
    chronicle(world, f, `${lead.name.given} ${taken ? 'took' : 'killed'} ${m.name}${m.ship ? ` aboard the ${m.ship}` : ''}.`);
    logRecord(world, { kind: 'world', type: 'fight', severity: 2, seat: 'grandMaster', houseIds: [P], text: `${lead.name.given} ran down ${m.name} of ${f.name}${m.ship ? ` aboard the ${m.ship}` : ''} and ${taken ? 'brought them home in chains' : 'killed them'}.`, who, effects: ['Respect +2', 'Dread +1', `${cap(f.name)} weakened`, `${cap(f.name)} regard −30`], quote: { from: lead.id, text: taken ? 'Alive, as you see. They will have plenty to say.' : 'They would not strike. So.' } });
  } else {
    f.rel[P] = clamp((f.rel[P] ?? 0) - 10, -100, 100);
    const roll = rng.next();
    let hurt = '';
    if (roll < 0.15) { kill(world, lead, world.date, `killed hunting ${m.name} of ${f.name}`); hurt = `${lead.name.given} was killed`; }
    else if (roll < 0.7) { lead.flags.push({ id: 'wounded', since: world.date, until: addCycles(world.date, CYCLES_PER_PHASE * 3), detail: `hunting ${m.name}` }); hurt = `${lead.name.given} came home wounded`; }
    else hurt = `${lead.name.given} came home empty-handed`;
    m.notes.push(`Beat off a hunt led by ${lead.name.given}.`);
    chronicle(world, f, `${m.name} beat off our hunt: ${hurt.toLowerCase()}.`);
    logRecord(world, { kind: 'world', type: 'fight', severity: 2, seat: 'grandMaster', houseIds: [P], text: `${m.name} was waiting for us. The hunt failed: ${hurt}.`, who });
  }
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

