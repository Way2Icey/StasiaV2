// The house's register of ships: every hull we own, by name, with its captain and its crew counted.
//
// The great ships (fleet.ts) are already named. The rest of the fleet is carried in war.ts as a number on
// each fleet formation; here that number becomes hulls: gunships, which can carry people, and fighters,
// which cannot. As the formations grow or lose ships, the register commissions or strikes hulls to match.
//
// Whoever of ours goes out takes a ship: an envoy goes in a cruiser, the Champion in a destroyer, a knight
// in a gunship, the Spymaster's people in a destroyer if one is free. A ship carrying someone is not free
// for duties until they are home; if nothing of ours is free they take passage on a merchant hull.
import { Rng } from './rng';
import { CULTURES } from '../data/cultures';
import { buildWord } from './names';
import { formationsOf } from './war';
import { CAPITAL_CLASSES, shipLog, shipsOf, type CapitalClass, type CapitalShip } from './fleet';
import { absoluteCycle, type GameDate } from './time';
import type { Character, World } from './types';

export type HullType = 'gunship' | 'fighter';
export const HULL_LABEL: Record<HullType, string> = { gunship: 'Gunship', fighter: 'Fighter' };
export const HULL_NOTE: Record<HullType, string> = {
  gunship: 'Small and quick: fire support, boarding, hit-and-run. Carries a knight and a few companions wherever the house sends them.',
  fighter: 'A single craft of the wing: a pilot and sometimes a gunner. Scouts, screens and strikes; carries no one.',
};
/** Of every ten hulls in a fleet formation, how many are gunships; the rest fly as fighters. */
const GUNSHIP_SHARE = 0.4;

export interface Hull {
  id: string;
  type: HullType;
  name: string;
  /** Named, but not a person of the court. */
  captain: string;
  crew: number;
  /** The fleet formation it flies with. */
  formationId: string;
  built: GameDate;
  /** When she last came home from carrying someone: the longest idle goes next. */
  lastOut?: number;
  log?: { year: number; text: string }[];
}

/** Someone of ours away from home, and the ship carrying them. */
export interface Passage {
  key: string;
  ids: string[];
  /** What took them out. */
  why: string;
  since: GameDate;
  /** A great ship's id, a hull's id, or 'merchant'. */
  ship: string;
  /** Dropped them where they are going and came home: no longer held. */
  delivered?: boolean;
}

export interface RegisterState {
  hulls: Record<string, Hull>;
  /** Sailing masters of great ships with no captain from the court. */
  masters: Record<string, string>;
  passages: Record<string, Passage>;
  /** Hulls struck from the register: lost in battle or paid off. */
  struck?: { name: string; type: HullType; year: number; how: string }[];
  next: number;
}

const GUN_A = ['Quiet', 'Swift', 'Grey', 'Bright', 'Narrow', 'Keen', 'Patient', 'Silver', 'Second', 'Low', 'Sworn', 'Pale', 'Ardent', 'Hollow', 'Late'];
const GUN_B = ['Lance', 'Spur', 'Talon', 'Needle', 'Wasp', 'Spark', 'Thorn', 'Arrow', 'Shrike', 'Sting', 'Kestrel', 'Pike', 'Hound', 'Ember', 'Whisper'];
const WINGS = ['Grey', 'Ash', 'Lantern', 'Silent', 'Copper', 'Dusk', 'Glass', 'Harrow'];
/** Crew and pilots: a gunship's company and a fighter's one or two. */
const crewFor = (t: HullType, rng: Rng) => (t === 'gunship' ? rng.int(45, 70) : rng.chance(0.4) ? 2 : 1);

export function ensureRegister(w: World): RegisterState {
  w.register ??= { hulls: {}, masters: {}, passages: {}, next: 1 };
  return w.register;
}

function captainName(w: World, rng: Rng): string {
  const culture = CULTURES[w.houses[w.playerHouseId]!.species] ?? Object.values(CULTURES)[0]!;
  const family = culture.familyNames.length && rng.chance(0.6) ? rng.pick(culture.familyNames) : buildWord(rng, culture.given);
  return `${buildWord(rng, culture.given)} ${family}`;
}

function hullName(reg: RegisterState, rng: Rng, t: HullType): string {
  const taken = new Set(Object.values(reg.hulls).map((h) => h.name));
  if (t === 'fighter') {
    for (const wing of WINGS) for (let n = 1; n <= 12; n++) { const x = `${wing} ${n}`; if (!taken.has(x)) return x; }
    return `Wing ${reg.next}`;
  }
  for (let i = 0; i < 30; i++) { const x = `${rng.pick(GUN_A)} ${rng.pick(GUN_B)}`; if (!taken.has(x)) return x; }
  return `${rng.pick(GUN_B)} ${reg.next}`;
}

export const hullsOf = (w: World): Hull[] => Object.values(w.register?.hulls ?? {});
export const passagesOf = (w: World): Passage[] => Object.values(w.register?.passages ?? {});
/** Who a great ship or hull is carrying now. */
export const carrying = (w: World, shipId: string): Passage | undefined => passagesOf(w).find((p) => p.ship === shipId && !p.delivered);
/** The passage someone of ours is on. */
export const passageOf = (w: World, personId: string): Passage | undefined => passagesOf(w).find((p) => p.ids.includes(personId));

/** A great ship's captain, by name: the court's own, or the sailing master who has her. */
export function captainOf(w: World, s: CapitalShip): { name: string; id?: string } {
  const c = s.captainId ? w.characters[s.captainId] : undefined;
  if (c?.alive) return { name: `${c.name.given}${c.name.family ? ` ${c.name.family}` : ''}`, id: c.id };
  return { name: w.register?.masters[s.id] ?? 'no one' };
}

/** Every soul aboard everything we own. */
export function crewCount(w: World): { great: number; gunships: number; pilots: number; total: number } {
  const great = shipsOf(w, w.playerHouseId).filter((s) => !s.ready).reduce((n, s) => n + s.crew, 0);
  const hs = hullsOf(w);
  const gunships = hs.filter((h) => h.type === 'gunship').reduce((n, h) => n + h.crew, 0);
  const pilots = hs.filter((h) => h.type === 'fighter').reduce((n, h) => n + h.crew, 0);
  return { great, gunships, pilots, total: great + gunships + pilots };
}

/** How a ship's company divides: who stands watch, who runs the drives, who mans the guns, who boards. */
export function complement(crew: number, kind: CapitalClass | HullType): { label: string; n: number }[] {
  if (kind === 'fighter') return crew > 1 ? [{ label: 'pilot', n: 1 }, { label: 'gunner', n: crew - 1 }] : [{ label: 'pilot', n: 1 }];
  const officers = Math.max(2, Math.round(crew * 0.06));
  const marines = kind === 'carrier' ? Math.round(crew * 0.25) : kind === 'gunship' ? Math.round(crew * 0.2) : Math.round(crew * 0.12);
  const gunners = Math.round(crew * (kind === 'destroyer' || kind === 'gunship' ? 0.3 : 0.22));
  const flight = kind === 'carrier' ? Math.round(crew * 0.18) : kind === 'flagship' ? Math.round(crew * 0.1) : 0;
  const drives = Math.max(0, crew - officers - marines - gunners - flight);
  return [{ label: 'officers', n: officers }, { label: 'drive & deck', n: drives }, { label: 'gunners', n: gunners }, ...(flight ? [{ label: 'flight deck', n: flight }] : []), { label: 'marines', n: marines }];
}

function hullLog(h: Hull, w: World, text: string): void {
  (h.log ??= []).unshift({ year: w.date.year, text });
  if (h.log.length > 12) h.log.length = 12;
}

/** Keep the register's hulls in step with the fleet formations: commission the new, strike the lost. */
function reconcileHulls(w: World, rng: Rng): void {
  const reg = ensureRegister(w);
  const forms = formationsOf(w, w.playerHouseId).filter((f) => f.kind === 'fleet');
  const live = new Set(forms.map((f) => f.id));
  for (const h of Object.values(reg.hulls)) if (!live.has(h.formationId)) strike(w, h, 'paid off when her fleet was stood down');
  for (const f of forms) {
    const mine = Object.values(reg.hulls).filter((h) => h.formationId === f.id);
    const want = Math.max(0, Math.round(f.strength));
    // Strike the excess, fighters first, and never a hull carrying someone if another will do.
    if (mine.length > want) {
      const order = [...mine].sort((a, b) => Number(!!carrying(w, a.id)) - Number(!!carrying(w, b.id)) || (a.type === 'fighter' ? -1 : 1) - (b.type === 'fighter' ? -1 : 1));
      for (const h of order.slice(0, mine.length - want)) strike(w, h, f.front ? 'lost in battle' : 'lost');
    }
    for (let n = mine.length; n < want; n++) {
      const all = Object.values(reg.hulls).filter((h) => h.formationId === f.id);
      const guns = all.filter((h) => h.type === 'gunship').length;
      const type: HullType = guns < Math.round((all.length + 1) * GUNSHIP_SHARE) ? 'gunship' : 'fighter';
      const id = `hu${reg.next++}`;
      reg.hulls[id] = { id, type, name: hullName(reg, rng, type), captain: captainName(w, rng), crew: crewFor(type, rng), formationId: f.id, built: { ...w.date } };
    }
  }
  // Every great ship of ours has someone in command.
  for (const s of shipsOf(w, w.playerHouseId)) if (!reg.masters[s.id]) reg.masters[s.id] = captainName(w, rng);
}

function strike(w: World, h: Hull, how: string): void {
  const reg = w.register!;
  const p = carrying(w, h.id);
  if (p) p.ship = 'merchant';
  (reg.struck ??= []).unshift({ name: h.name, type: h.type, year: w.date.year, how });
  if (reg.struck.length > 40) reg.struck.length = 40;
  delete reg.hulls[h.id];
}

// ---------------------------------------------------------------- passages

/** Away on these, they travel: lane watches and captives are not voyages of ours. */
const TRAVEL_FLAGS = ['travelling', 'posted', 'crucible', 'circuit', 'bounty', 'quest', 'hunting', 'expedition', 'atChair'] as const;
/** Gone where they were going and staying: the ship drops them and comes home. */
const STAYS = new Set(['posted', 'atChair']);
type Want = CapitalClass | HullType;

function wantFor(c: Character, why: { flag?: string; mission?: string }): Want[] {
  if (c.seat === 'envoy' || why.mission === 'envoy' || why.flag === 'posted' || why.flag === 'atChair' || c.seat === 'highroy') return ['cruiser', 'flagship', 'carrier', 'destroyer', 'gunship'];
  if (c.seat === 'champion' || why.flag === 'crucible') return ['destroyer', 'gunship', 'cruiser'];
  if (c.seat === 'spymaster' || why.mission === 'investigate' || why.mission === 'scout') return ['destroyer', 'gunship'];
  if (c.role === 'Knight' || c.flags.some((f) => f.id === 'knighted') || why.flag === 'bounty' || why.flag === 'hunting' || why.flag === 'quest' || why.flag === 'circuit') return ['gunship', 'destroyer'];
  return ['gunship', 'destroyer', 'cruiser'];
}

/** Is this ship free to carry someone: home, idle, not building, not on a watch or at the Crucible. */
function greatFree(w: World, s: CapitalShip): boolean {
  return !s.lost && !s.ready && !s.arrives && !s.watch && !s.crucible && s.duty === 'harbour' && !carrying(w, s.id);
}
function hullFree(w: World, h: Hull): boolean {
  if (h.type !== 'gunship' || carrying(w, h.id)) return false;
  return !w.war?.formations[h.formationId]?.front;
}

function pickShip(w: World, want: Want[]): string {
  const great = shipsOf(w, w.playerHouseId).filter((s) => greatFree(w, s));
  const hulls = hullsOf(w).filter((h) => hullFree(w, h));
  for (const k of want) {
    if (k === 'gunship') { const h = [...hulls].sort((a, b) => (a.lastOut ?? -1) - (b.lastOut ?? -1) || a.id.localeCompare(b.id))[0]; if (h) return h.id; continue; }
    if (k === 'fighter') continue;
    const s = great.filter((x) => x.cls === k).sort((a, b) => b.condition - a.condition)[0];
    if (s) return s.id;
  }
  return 'merchant';
}

export function shipLabel(w: World, id: string): string {
  if (id === 'merchant') return 'a merchant hull';
  const s = w.fleet?.ships[id];
  if (s) return `the ${s.name}`;
  const h = w.register?.hulls[id];
  return h ? `the ${h.name}` : 'a ship since lost';
}
export function shipKind(w: World, id: string): string {
  const s = w.fleet?.ships[id];
  if (s) return CAPITAL_CLASSES[s.cls].label.toLowerCase();
  const h = w.register?.hulls[id];
  return h ? HULL_LABEL[h.type].toLowerCase() : 'merchant hull';
}

const nm = (c: Character) => `${c.name.title ? `${c.name.title} ` : ''}${c.name.given}`;

/** Who of ours is out, and what they went for: one party per mission, one person per errand. */
function parties(w: World): { key: string; ids: string[]; why: string; flag?: string; mission?: string }[] {
  const P = w.playerHouseId;
  const out: ReturnType<typeof parties> = [];
  const seen = new Set<string>();
  for (const m of Object.values(w.missions)) {
    if (m.stage === 'done' || m.houseId !== P) continue;
    const ids = [m.leaderId, ...(m.companions ?? []), ...(m.pupils ?? [])].filter((id) => w.characters[id]?.alive);
    if (!ids.length) continue;
    ids.forEach((id) => seen.add(id));
    const at = w.planets[m.targetPlanetId]?.name;
    out.push({ key: `m:${m.id}`, ids, why: `${m.kind === 'envoy' ? 'an embassy' : m.kind === 'scout' ? 'scouting' : 'an inquiry'}${at ? ` to ${at}` : ''}`, mission: m.kind });
  }
  // Those out on the same errand to the same place travel together.
  const groups = new Map<string, { ids: string[]; why: string; flag: string }>();
  for (const c of Object.values(w.characters)) {
    if (!c.alive || c.houseId !== P || seen.has(c.id)) continue;
    if (c.flags.some((f) => f.id === 'captive' || f.id === 'missing' || f.id === 'aboard' || f.id === 'watch')) continue;
    const f = c.flags.find((x) => (TRAVEL_FLAGS as readonly string[]).includes(x.id));
    if (!f) continue;
    const together = f.id === 'crucible' || f.id === 'circuit' || (f.id === 'travelling' && /tournament|wedding|funeral/.test(f.detail ?? ''));
    const key = together ? `g:${f.id}:${f.detail ?? ''}` : `f:${c.id}:${f.id}`;
    const g = groups.get(key) ?? { ids: [], why: f.detail ?? (f.id === 'atChair' ? 'the Numarade' : f.id === 'crucible' ? 'the Crucible' : f.id), flag: f.id };
    g.ids.push(c.id);
    groups.set(key, g);
  }
  const lead = (c: Character | undefined) => (!c ? 9 : c.seat === 'champion' ? 0 : c.seat === 'envoy' ? 1 : c.seat ? 2 : c.role === 'Knight' ? 3 : 4);
  for (const [key, g] of groups) {
    g.ids.sort((a, b) => lead(w.characters[a]) - lead(w.characters[b]));
    out.push({ key, ids: g.ids, why: g.why, flag: g.flag });
  }
  return out;
}

/** Take a ship for everyone newly out; bring the ships home for everyone back. */
function reconcilePassages(w: World): void {
  const reg = ensureRegister(w);
  const now = absoluteCycle(w.date);
  const live = new Map(parties(w).map((p) => [p.key, p]));
  for (const p of Object.values(reg.passages)) {
    // Delivered and stayed: the ship comes home after the run there and back.
    if (!p.delivered && STAYS.has(p.key.split(':')[p.key.startsWith('g:') ? 1 : 2] ?? '') && now - absoluteCycle(p.since) >= 8) {
      p.delivered = true;
      voyageDone(w, p, 'carried', 'and came home alone');
    }
    if (live.has(p.key)) p.ids = live.get(p.key)!.ids;
    if (live.has(p.key)) {
      // Her ship was taken for something else, or lost: they go on in another.
      const g = w.fleet?.ships[p.ship];
      const gone = p.ship !== 'merchant' && !p.delivered && (g ? (g.lost || g.watch || g.crucible || g.duty !== 'harbour' || !!g.arrives) : !reg.hulls[p.ship]);
      if (gone) { p.ship = 'merchant'; const lead = w.characters[p.ids[0]!]; if (lead) p.ship = pickShip(w, wantFor(lead, live.get(p.key)!)); }
      continue;
    }
    if (!p.delivered) { const one = p.ids.length === 1 ? w.characters[p.ids[0]!] : undefined; voyageDone(w, p, 'brought', `and brought ${one ? (one.sex === 'f' ? 'her' : 'him') : 'them'} home`); }
    delete reg.passages[p.key];
  }
  for (const [key, party] of live) {
    if (reg.passages[key]) continue;
    const lead = w.characters[party.ids[0]!]!;
    const ship = pickShip(w, wantFor(lead, party));
    reg.passages[key] = { key, ids: party.ids, why: party.why, since: { ...w.date }, ship };
  }
}

function voyageDone(w: World, p: Passage, _verb: string, tail: string): void {
  const who = p.ids.map((id) => w.characters[id]).filter((c): c is Character => !!c);
  if (!who.length || p.ship === 'merchant') return;
  const names = who.length > 2 ? `${nm(who[0]!)} and ${who.length - 1} others` : who.map(nm).join(' and ');
  const days = absoluteCycle(w.date) - absoluteCycle(p.since);
  const s = w.fleet?.ships[p.ship];
  if (s) {
    shipLog(w, s, `Carried ${names} (${p.why}) ${tail}.`, days >= 24 ? 1 : 0);
    s.crewMood = Math.min(100, s.crewMood + 4);
    s.condition = Math.max(0, s.condition - Math.min(6, days / 8));
    return;
  }
  const h = w.register?.hulls[p.ship];
  if (h) { hullLog(h, w, `Carried ${names} (${p.why}) ${tail}.`); h.lastOut = absoluteCycle(w.date); }
}

/** Why a great ship cannot take a duty now: she has people of ours aboard. */
export function busyCarrying(w: World, shipId: string): string | null {
  const p = carrying(w, shipId);
  if (!p) return null;
  const c = w.characters[p.ids[0]!];
  return `Carrying ${c ? nm(c) : 'our people'}${p.ids.length > 1 ? ` and ${p.ids.length - 1} more` : ''} (${p.why})`;
}

export function advanceRegister(w: World, rng: Rng): void {
  if (!w.fleet || !w.war) return;
  reconcileHulls(w, rng);
  reconcilePassages(w);
}

/** Draw up the register on a new game or an old save, from its own stream so nothing else shifts. */
export function ensureRegisterNow(w: World): void {
  if (w.register || !w.fleet || !w.war) return;
  advanceRegister(w, Rng.fromSeed(`${w.seed ?? 'stasia'}:register`));
}

/** For tests and the UI: the world with its register drawn up. */
export function registerNow(input: World): World {
  if (input.register) return input;
  const w = structuredClone(input);
  ensureRegisterNow(w);
  return w;
}
