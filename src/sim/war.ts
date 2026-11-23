// War between houses: the escalation ladder, the forces that fight it, the fronts it is fought on, and the
// terms it ends with.
//
// The ladder: a grievance; clashes on the border (a limited war, easily stepped back from); declared war,
// where fleets fight for the space over a world; a siege or an invasion once the space is held; terms.
// The Numarade does not say who may fight whom, but it can vote to stop a war that has gone too far, and a
// house that defies it has every seat against it.
//
// Forces are named down to the company and the ship, led by real people, but the soldiers in them are
// counted, not named, until a battle gives one of them a reason to matter: the survivor who fled and comes
// back for the knight who broke the line, the wounded soldier who carried a knight out. Then the game names
// them, and they carry it.
import { Rng } from './rng';
import { buildWord, displayName, shortName } from './names';
import { logRecord } from './records';
import { addThread } from './storystate';
import { createBattle, battleOf, commandOf, fighterPower, outcomes, runOut, applyFates, type FighterSpec, type Theatre } from './battle';
import { absoluteCycle, addCycles, CYCLES_PER_ORBIT, CYCLES_PER_PHASE, CYCLES_PER_YEAR, dateParts } from './time';
import { isAway } from './court';
import { econ } from './economy';
import { createCharacter } from './characters';
import { commonerFamily } from './world';
import { fireStage, makeCtx } from './events';
import { affinity, houseName, liveHouses, personName, regardOf, shiftRegard, table, type ArchonHouse, type Motion } from './archon';
import { worthOf, wildLabel, type Wild } from './frontier';
import { rosterOf } from './crucible';
import { SPECIES } from '../data/species';
import { CULTURES } from '../data/cultures';
import type { Character, Planet, SpeciesId, World } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const rnd = (v: number) => Math.round(v) + 0;
const fmt = (n: number) => rnd(n).toLocaleString('en-US');

// ---------------------------------------------------------------- forces

export type FormationKind = 'legion' | 'fleet' | 'company';
export const FORMATION_LABEL: Record<FormationKind, string> = { legion: 'Legion', fleet: 'Fleet', company: 'Knights\' company' };
/** What one counts: soldiers, ships, or knights' retinues. */
export const UNIT_LABEL: Record<FormationKind, string> = { legion: 'soldiers', fleet: 'ships', company: 'men' };

export interface Formation {
  id: string;
  houseId: string;
  kind: FormationKind;
  name: string;
  /** A real person of a simulated house, or a name for houses on the register. */
  commanderId?: string;
  commanderName?: string;
  commanderSkill?: number;
  /** Knights riding with it (simulated houses). */
  knights: string[];
  strength: number;
  max: number;
  /** Drill and kit, 0.6..1.4. */
  quality: number;
  morale: number;
  /** A front id, or home. */
  front?: string;
  /** Battles fought and won, and what they are remembered for. */
  fought: number;
  won: number;
  honours: string[];
}

// ---------------------------------------------------------------- wars

export type Rung = 'clashes' | 'war';
export type WarGoal = 'tribute' | 'reparations' | 'humble' | 'relic' | 'hostage' | 'world' | 'vassal';
export const GOAL_LABEL: Record<WarGoal, string> = {
  tribute: 'Tribute for five years', reparations: 'Reparations', humble: 'Their humiliation', relic: 'A Caige from their vault',
  hostage: 'A hostage of their blood', world: 'One of their worlds', vassal: 'Their fealty',
};
export type FrontKind = 'border' | 'orbit' | 'siege';
export const FRONT_LABEL: Record<FrontKind, string> = { border: 'The border', orbit: 'The fight for orbit', siege: 'Siege and invasion' };

export interface Front {
  id: string;
  kind: FrontKind;
  where: string;
  /** −100 (defenders hold) .. +100 (attackers win it). */
  meter: number;
  since: number;
  ended?: number;
  winner?: 'attackers' | 'defenders';
  /** A battle being fought on it now. */
  battle?: string;
}

export interface WarLine { date: World['date']; text: string; big?: boolean }

export interface War {
  id: string;
  name: string;
  attacker: string;
  defender: string;
  /** Allies who joined, either side. */
  attackers: string[];
  defenders: string[];
  rung: Rung;
  goal: WarGoal;
  cause: string;
  since: World['date'];
  /** −100..100: + the attackers are winning. */
  score: number;
  /** 0..100 per house: when it reaches 100 the house cannot go on. */
  exhaustion: Record<string, number>;
  /** Soldiers lost, per house. */
  losses: Record<string, number>;
  fronts: Front[];
  /** The world the war is about, if any (a planet id or a register world's name). */
  target?: string;
  log: WarLine[];
  status: 'active' | 'ended';
  result?: { winner: 'attackers' | 'defenders' | 'none'; text: string; terms?: WarGoal; date: World['date'] };
  /** The Numarade has ordered it stopped by this cycle. */
  ceasefire?: number;
  defied?: boolean;
  /** Terms are waiting on our word. */
  asking?: boolean;
}

/** Someone from the ranks the war has named: a survivor with a score, or one of ours who did something. */
export interface Named {
  id: string;
  name: string;
  species: SpeciesId;
  houseId: string;
  /** Whom they mean to kill. */
  against?: string;
  why: string;
  year: number;
  power: number;
  /** When they come. */
  comes: number;
  done?: boolean;
}

export interface Tribute { from: string; to: string; amount: number; until: number }
export interface Hostage { name: string; personId?: string; from: string; heldBy: string; since: number }

export interface WarState {
  formations: Record<string, Formation>;
  wars: War[];
  named: Named[];
  tributes: Tribute[];
  hostages: Hostage[];
  /** liege[house] = the house it is sworn to. */
  liege: Record<string, string>;
}

// ---------------------------------------------------------------- reading

export const warsOf = (w: World, h: string) => (w.war?.wars ?? []).filter((x) => x.status === 'active' && sideOf(x, h) !== null);
export const activeWars = (w: World) => (w.war?.wars ?? []).filter((x) => x.status === 'active');
export const formationsOf = (w: World, h: string) => Object.values(w.war?.formations ?? {}).filter((f) => f.houseId === h);
export function sideOf(war: War, h: string): 'attackers' | 'defenders' | null {
  if (war.attacker === h || war.attackers.includes(h)) return 'attackers';
  if (war.defender === h || war.defenders.includes(h)) return 'defenders';
  return null;
}
export const partiesOf = (war: War, side: 'attackers' | 'defenders') => side === 'attackers' ? [war.attacker, ...war.attackers] : [war.defender, ...war.defenders];
export const atWar = (w: World, a: string, b: string) => activeWars(w).some((x) => { const sa = sideOf(x, a), sb = sideOf(x, b); return sa && sb && sa !== sb; });
export const liegeOf = (w: World, h: string) => w.war?.liege[h];
export const vassalsOf = (w: World, h: string) => Object.entries(w.war?.liege ?? {}).filter(([, l]) => l === h).map(([v]) => v);

const say = (w: World, war: War, text: string, big = false) => { war.log.push({ date: w.date, text, big }); if (war.log.length > 80) war.log.shift(); };
const isSim = (w: World, h: string) => !!w.houses[h];
const knightsOf = (w: World, h: string) => Object.values(w.characters).filter((c) => c.alive && c.houseId === h && c.flags.some((f) => f.id === 'knighted'));

// ---------------------------------------------------------------- raising the forces

const LEGION_A = ['Ashen', 'Iron', 'Grey', 'Long', 'Silent', 'Red', 'Glass', 'Third', 'Ember', 'Black', 'White', 'Salt', 'Storm', 'Hollow', 'Bright'];
const LEGION_B = ['Legion', 'Host', 'Spear', 'Wall', 'Line', 'Shield', 'March'];
const FLEET_B = ['Wake', 'Watch', 'Squadron', 'Tide', 'Wing', 'Lance'];
const COMPANY_B = ['Company', 'Blades', 'Oathsworn', 'Hand', 'Lances'];

function forceName(rng: Rng, used: Set<string>, nouns: string[]): string {
  let n = '';
  for (let i = 0; i < 20 && (!n || used.has(n)); i++) n = `the ${rng.pick(LEGION_A)} ${rng.pick(nouns)}`;
  used.add(n);
  return n;
}

/** Soldiers and ships a house can put in the field, from its weight in the Archon. */
function sizes(w: World, h: string): { legion: number; fleet: number } {
  const a = w.archon?.houses[h];
  const might = a?.might ?? 1;
  const worlds = a?.worlds ?? 1;
  return { legion: rnd((18000 + might * 30000 + worlds * 6000) / 100) * 100, fleet: rnd(10 + might * 18 + worlds * 2) };
}

function bestBy(cs: Character[], f: (c: Character) => number): Character | undefined {
  return cs.slice().sort((a, b) => f(b) - f(a))[0];
}

/** Give every house its legion, fleet and (for the simulated) a knights' company. */
export function ensureWar(w: World): void {
  w.war ??= { formations: {}, wars: [], named: [], tributes: [], hostages: [], liege: {} };
  const s = w.war;
  s.named ??= []; s.tributes ??= []; s.hostages ??= []; s.liege ??= {};
  const rng = Rng.fromSeed(`${w.seed}/forces/${Object.keys(s.formations).length}`);
  const used = new Set(Object.values(s.formations).map((f) => f.name));
  for (const h of liveHouses(w)) {
    if (formationsOf(w, h.id).length) continue;
    const sz = sizes(w, h.id);
    const make = (kind: FormationKind, name: string, strength: number): Formation => {
      const f: Formation = { id: `fm${w.nextId++}`, houseId: h.id, kind, name, knights: [], strength, max: strength, quality: 0.85 + rng.next() * 0.3, morale: 70, fought: 0, won: 0, honours: [] };
      s.formations[f.id] = f;
      return f;
    };
    make('legion', forceName(rng, used, LEGION_B), sz.legion);
    make('fleet', forceName(rng, used, FLEET_B), sz.fleet);
    if (isSim(w, h.id)) make('company', forceName(rng, used, COMPANY_B), 400 + rng.int(0, 6) * 50);
  }
  for (const f of Object.values(s.formations)) staffFormation(w, rng, f);
}

/** Who leads it: the house's own people where it has them. */
export function staffFormation(w: World, rng: Rng, f: Formation): void {
  if (isSim(w, f.houseId)) {
    const cur = f.commanderId ? w.characters[f.commanderId] : undefined;
    if (cur?.alive && cur.houseId === f.houseId) return;
    const people = Object.values(w.characters).filter((c) => c.alive && c.houseId === f.houseId && c.tier === 'full' && c.seat !== 'highroy' && !Object.values(w.war!.formations).some((o) => o !== f && o.commanderId === c.id));
    const gm = people.find((c) => c.seat === 'grandMaster');
    const pick = f.kind === 'legion' ? gm ?? bestBy(people, (c) => c.stats.tactics + c.stats.leadership)
      : f.kind === 'fleet' ? bestBy(people, (c) => c.stats.fleetCommand * 2 + c.stats.leadership)
      : bestBy(knightsOf(w, f.houseId).filter((k) => k.id !== gm?.id), (c) => c.stats.duelling + c.stats.leadership);
    f.commanderId = pick?.id;
    delete f.commanderName;
    if (f.kind === 'company' && !f.knights.length) f.knights = knightsOf(w, f.houseId).filter((k) => k.id !== pick?.id && k.id !== gm?.id).slice(0, 3).map((k) => k.id);
    return;
  }
  if (!f.commanderName) {
    const h = w.archon?.houses[f.houseId];
    const sp = h?.species ?? 'human';
    f.commanderName = personName(rng, sp, rng.pick(h?.families.length ? h.families : [h?.name ?? 'House']));
    f.commanderSkill = 8 + rng.next() * 8 * (h?.might ?? 1);
  }
}

export function commanderOf(w: World, f: Formation): { name: string; skill: number; id?: string } {
  const c = f.commanderId ? w.characters[f.commanderId] : undefined;
  const th: Theatre = f.kind === 'fleet' ? 'space' : 'surface';
  if (c?.alive) return { name: shortName(c.name), skill: commandOf(c, th), id: c.id };
  return { name: f.commanderName ?? 'a captain', skill: f.commanderSkill ?? 10 };
}

// ---------------------------------------------------------------- power on a front

const WEIGHT: Record<FrontKind, Record<FormationKind, number>> = {
  border: { legion: 1, fleet: 0.35, company: 0.8 },
  orbit: { legion: 0.15, fleet: 1, company: 0.3 },
  siege: { legion: 1, fleet: 0.4, company: 0.9 },
};
const SCALE: Record<FormationKind, number> = { legion: 1000, fleet: 1, company: 60 };

function formationPower(w: World, f: Formation, kind: FrontKind): number {
  const cmd = commanderOf(w, f);
  const knights = f.knights.map((id) => w.characters[id]).filter((c): c is Character => !!c?.alive);
  const kp = knights.reduce((t, k) => t + fighterPower(k, kind === 'orbit' ? 'ship' : 'surface') * (k.flags.some((x) => x.id === 'caigeBonded') ? 1.4 : 1), 0) / 12;
  return (Math.sqrt(f.strength / SCALE[f.kind]) * f.quality * (0.5 + f.morale / 200) * (1 + (cmd.skill - 10) / 30) + kp) * WEIGHT[kind][f.kind];
}

export function sidePower(w: World, war: War, front: Front, side: 'attackers' | 'defenders'): number {
  const houses = partiesOf(war, side);
  return Object.values(w.war!.formations).filter((f) => f.front === front.id && houses.includes(f.houseId)).reduce((t, f) => t + formationPower(w, f, front.kind), 0);
}

// ---------------------------------------------------------------- grievances

/** What we hold against a house: the reasons a war would be just. */
export function grievances(w: World, us: string, them: string): string[] {
  const out: string[] = [];
  const year = dateParts(w.date).year;
  if ((w.realm?.feuds ?? []).some((f) => (f.a === us && f.b === them) || (f.a === them && f.b === us))) out.push('We are at feud.');
  if ((w.archon?.feuds ?? []).some((f) => (f.a === us && f.b === them) || (f.a === them && f.b === us))) out.push('An old feud stands between us.');
  const censure = (w.archon?.numarade.motions ?? []).find((m) => m.kind === 'censure' && m.target === us && (m.by === them || m.votes[them] === 'aye') && year - m.date.year <= 5);
  if (censure) out.push(`They moved or voted for our censure in ${censure.date.year}.`);
  const lastWar = (w.archon?.history ?? []).filter((e) => e.kind === 'war' && e.houses.includes(us) && e.houses.includes(them)).pop();
  if (lastWar && year - lastWar.year <= 40) out.push(`The war of ${lastWar.year} is not forgotten.`);
  if (regardOf(w, us, them) <= -50) out.push('We hate them, and they know it.');
  if ((w.war?.named ?? []).some((n) => n.houseId === them && n.against && w.characters[n.against]?.houseId === us)) out.push('One of theirs hunts one of ours.');
  if (w.war?.liege[them] === us) out.push('They are sworn to us.');
  return out;
}

// ---------------------------------------------------------------- starting a war

const WAR_ADJ = ['Ash', 'Glass', 'Iron', 'Salt', 'Grey', 'Long', 'Bitter', 'Red', 'Broken', 'Winter', 'Silent', 'Pale'];
function warName(rng: Rng, w: World, a: string, b: string, target?: string): string {
  const r = rng.next();
  if (target && r < 0.35) return `the War for ${target}`;
  if (r < 0.6) return `the ${houseName(w, a)}–${houseName(w, b)} War`;
  return `the ${rng.pick(WAR_ADJ)} War`;
}

function targetWorld(w: World, defender: string, goal: WarGoal): string | undefined {
  if (isSim(w, defender)) {
    const ps = Object.values(w.planets).filter((p) => p.houseId === defender);
    const cap = w.houses[defender]!.capitalPlanetId;
    if (goal === 'world') return (ps.find((p) => p.id !== cap) ?? ps[0])?.name;
    return w.planets[cap]?.name;
  }
  const h = w.archon?.houses[defender];
  return goal === 'world' ? worldName(Rng.fromSeed(`${w.seed}/${defender}/${w.nextId}`)) : h?.capital;
}

function worldName(rng: Rng): string {
  return buildWord(rng, { starts: ['Ka', 'Ve', 'Or', 'Tha', 'Sel', 'Mor', 'Dra', 'Cor', 'Bel', 'Hes', 'Lio'], mids: ['r', 'l', 'th', 'v'], ends: ['os', 'ara', 'eon', 'is', 'une', 'ath', 'ora'], midChance: 0.4 });
}

export interface Declaration { attacker: string; defender: string; goal: WarGoal; rung: Rung; cause?: string }

export function startWar(w: World, rng: Rng, d: Declaration): War {
  ensureWar(w);
  const target = targetWorld(w, d.defender, d.goal);
  const war: War = {
    id: `war${w.nextId++}`, name: warName(rng, w, d.attacker, d.defender, d.rung === 'war' ? target : undefined),
    attacker: d.attacker, defender: d.defender, attackers: [], defenders: [], rung: d.rung, goal: d.goal,
    cause: d.cause ?? grievances(w, d.attacker, d.defender)[0] ?? 'ambition, and nothing else',
    since: w.date, score: 0, exhaustion: { [d.attacker]: 0, [d.defender]: 0 }, losses: {}, fronts: [], target, log: [], status: 'active',
  };
  w.war!.wars.unshift(war);
  w.war!.wars = w.war!.wars.filter((x, i) => x.status === 'active' || i < 30);
  openFront(w, war, 'border', `the border of House ${houseName(w, d.defender)}`);
  if (d.rung === 'war') escalateWar(w, rng, war, true);
  deploy(w, war);
  // Vassals follow their liege in.
  for (const v of vassalsOf(w, d.attacker)) if (v !== d.defender) war.attackers.push(v);
  for (const v of vassalsOf(w, d.defender)) if (v !== d.attacker) war.defenders.push(v);
  shiftRegard(w, d.defender, d.attacker, -25);
  const P = w.playerHouseId;
  const ours = sideOf(war, P);
  say(w, war, `${d.rung === 'war' ? 'War is declared' : 'Clashes begin on the border'}: House ${houseName(w, d.attacker)} against House ${houseName(w, d.defender)}. Cause: ${war.cause}`, true);
  logRecord(w, {
    kind: 'world', type: 'fight', severity: ours ? 3 : 1,
    text: `${d.rung === 'war' ? 'War' : 'Border clashes'}: House ${houseName(w, d.attacker)} against House ${houseName(w, d.defender)}${d.rung === 'war' ? `, for ${GOAL_LABEL[d.goal].toLowerCase()}` : ''}.`,
    houseIds: [d.attacker, d.defender].filter((x) => isSim(w, x)), source: 'the Numarade',
  });
  w.archon?.history.push({ year: w.date.year, kind: 'war', text: `${cap(war.name)}: House ${houseName(w, d.attacker)} against House ${houseName(w, d.defender)}.`, houses: [d.attacker, d.defender] });
  // Leaving a pact for war breaks it.
  if (w.archon) w.archon.pacts = w.archon.pacts.filter((r) => !((r.a === d.attacker && r.b === d.defender) || (r.a === d.defender && r.b === d.attacker)));
  return war;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function openFront(w: World, war: War, kind: FrontKind, where: string): Front {
  const f: Front = { id: `fr${w.nextId++}`, kind, where, meter: 0, since: absoluteCycle(w.date) };
  war.fronts.push(f);
  return f;
}

/** From clashes to war: the fleets go for the space over the target. */
export function escalateWar(w: World, rng: Rng, war: War, quiet = false): void {
  war.rung = 'war';
  if (!war.fronts.some((f) => f.kind === 'orbit' && !f.ended)) openFront(w, war, 'orbit', `the space over ${war.target ?? 'their world'}`);
  if (!quiet) {
    say(w, war, `It is war now: the fleets go for the space over ${war.target}.`, true);
    logRecord(w, { kind: 'world', type: 'fight', severity: sideOf(war, w.playerHouseId) ? 3 : 1, text: `${cap(war.name)} is now open war, for ${GOAL_LABEL[war.goal].toLowerCase()}.`, source: 'the Numarade' });
    deploy(w, war);
  }
  void rng;
}

/** Send each house's forces where they fit (ours stay where we put them, once we have placed them). */
function deploy(w: World, war: War): void {
  const P = w.playerHouseId;
  const open = war.fronts.filter((f) => !f.ended);
  for (const side of ['attackers', 'defenders'] as const) {
    for (const h of partiesOf(war, side)) {
      for (const f of formationsOf(w, h)) {
        if (h === P && f.front && open.some((x) => x.id === f.front)) continue;
        if (f.strength < f.max * 0.15) { f.front = undefined; continue; }
        const want: FrontKind = f.kind === 'fleet' ? 'orbit' : open.some((x) => x.kind === 'siege') ? 'siege' : 'border';
        const fr = open.find((x) => x.kind === want) ?? open.find((x) => x.kind === 'border') ?? open[0];
        f.front = fr?.id;
      }
    }
  }
}

// ---------------------------------------------------------------- the player declares

export function cannotDeclare(w: World, target: string, rung: Rung): string | null {
  const P = w.playerHouseId;
  if (target === P) return 'Not ourselves.';
  if (!w.archon?.houses[target] || w.archon.houses[target]!.ended) return 'No such house.';
  if (atWar(w, P, target)) return 'We are already fighting them.';
  if (w.war?.liege[P] === target) return 'We are sworn to them; breaking fealty is its own war (not yet).';
  if (warsOf(w, P).length >= 2) return 'We cannot fight more than two wars at once.';
  if (!formationsOf(w, P).some((f) => f.strength > f.max * 0.3)) return 'Our forces are too broken to march.';
  if (rung === 'war' && econ(w, P).stock.othes < 4000) return 'A declared war needs a war chest of 4,000 othes.';
  return null;
}

export function declareWar(input: World, target: string, goal: WarGoal, rung: Rung): World {
  const why = cannotDeclare(input, target, rung);
  if (why) throw new Error(why);
  const w = structuredClone(input);
  const P = w.playerHouseId;
  const rng = new Rng(w.rng);
  const just = grievances(w, P, target);
  const war = startWar(w, rng, { attacker: P, defender: target, goal, rung });
  if (!just.length) {
    // War for nothing: the others take note.
    const std = w.houses[P]!.standing;
    std.honour = clamp(std.honour - 8, 0, 100);
    for (const h of liveHouses(w)) if (h.id !== P && h.id !== target) shiftRegard(w, h.id, P, -5);
    say(w, war, 'We went to war without a grievance anyone could name. The houses noticed.');
  }
  callAllies(w, war, 'defenders', rng);
  w.rng = rng.state;
  return w;
}

/** Allies of a side may come in. */
function callAllies(w: World, war: War, side: 'attackers' | 'defenders', rng: Rng): void {
  const lead = side === 'attackers' ? war.attacker : war.defender;
  const foe = side === 'attackers' ? war.defender : war.attacker;
  const pacted = (w.archon?.pacts ?? []).filter((r) => r.a === lead || r.b === lead).map((r) => (r.a === lead ? r.b : r.a));
  const allied = (w.realm?.alliances ?? []).filter((p) => p.a === lead || p.b === lead).map((p) => (p.a === lead ? p.b : p.a));
  for (const h of [...new Set([...pacted, ...allied])]) {
    if (h === foe || sideOf(war, h) || h === w.playerHouseId) continue;
    if (rng.chance(0.35 + Math.max(0, regardOf(w, h, lead)) / 200)) {
      (side === 'attackers' ? war.attackers : war.defenders).push(h);
      say(w, war, `House ${houseName(w, h)} comes in on the side of House ${houseName(w, lead)}.`);
    }
  }
  deploy(w, war);
}

/** Put one of our formations on a front, or bring it home. */
export function assignFormation(input: World, formationId: string, frontId: string | null): World {
  const w = structuredClone(input);
  const f = w.war?.formations[formationId];
  if (!f || f.houseId !== w.playerHouseId) throw new Error('Not ours.');
  if (frontId && !activeWars(w).some((x) => x.fronts.some((fr) => fr.id === frontId && !fr.ended))) throw new Error('No such front.');
  f.front = frontId ?? undefined;
  return w;
}

/** Attach or detach a knight from one of our formations. */
export function setKnight(input: World, formationId: string, knightId: string, on: boolean): World {
  const w = structuredClone(input);
  const f = w.war?.formations[formationId];
  if (!f || f.houseId !== w.playerHouseId) throw new Error('Not ours.');
  for (const o of Object.values(w.war!.formations)) o.knights = o.knights.filter((k) => k !== knightId);
  if (on) f.knights.push(knightId);
  return w;
}

export function setCommander(input: World, formationId: string, personId: string): World {
  const w = structuredClone(input);
  const f = w.war?.formations[formationId];
  if (!f || f.houseId !== w.playerHouseId) throw new Error('Not ours.');
  const c = w.characters[personId];
  if (!c?.alive || c.houseId !== f.houseId) throw new Error('They cannot lead it.');
  for (const o of Object.values(w.war!.formations)) { if (o.commanderId === personId) o.commanderId = undefined; o.knights = o.knights.filter((k) => k !== personId); }
  f.commanderId = personId;
  return w;
}

/** Join someone else's war. */
export function cannotJoin(w: World, warId: string, side: 'attackers' | 'defenders'): string | null {
  const war = w.war?.wars.find((x) => x.id === warId && x.status === 'active');
  const P = w.playerHouseId;
  if (!war) return 'No such war.';
  if (sideOf(war, P)) return 'We are already in it.';
  const foe = side === 'attackers' ? war.defender : war.attacker;
  if (w.war?.liege[P] === foe) return 'We are sworn to them.';
  if (warsOf(w, P).length >= 2) return 'We cannot fight more than two wars at once.';
  return null;
}

export function joinWar(input: World, warId: string, side: 'attackers' | 'defenders'): World {
  const why = cannotJoin(input, warId, side);
  if (why) throw new Error(why);
  const w = structuredClone(input);
  const war = w.war!.wars.find((x) => x.id === warId)!;
  const P = w.playerHouseId;
  (side === 'attackers' ? war.attackers : war.defenders).push(P);
  war.exhaustion[P] = 0;
  const lead = side === 'attackers' ? war.attacker : war.defender;
  const foe = side === 'attackers' ? war.defender : war.attacker;
  shiftRegard(w, lead, P, 15);
  shiftRegard(w, foe, P, -25);
  deploy(w, war);
  say(w, war, `House ${houseName(w, P)} comes in on the side of House ${houseName(w, lead)}.`, true);
  logRecord(w, { kind: 'world', type: 'fight', severity: 3, text: `We join ${war.name} on the side of House ${houseName(w, lead)}.`, houseIds: [lead, foe].filter((x) => isSim(w, x)) });
  return w;
}

// ---------------------------------------------------------------- the war goes on

export function advanceWar(w: World, rng: Rng, t: { phase: boolean; orbit: boolean; year: boolean }): void {
  ensureWar(w);
  const s = w.war!;
  // Battles of ours that have finished settle their front.
  for (const war of activeWars(w)) for (const fr of war.fronts) if (fr.battle) settleBattle(w, rng, war, fr);
  if (t.phase) {
    // The dead and the departed leave their places.
    for (const f of Object.values(s.formations)) f.knights = f.knights.filter((k) => w.characters[k]?.alive && w.characters[k]!.houseId === f.houseId);
    for (const war of activeWars(w)) phaseOf(w, rng, war);
    for (const f of Object.values(s.formations)) {
      if (!f.front) { f.strength = Math.min(f.max, f.strength + Math.max(1, f.max * 0.012)); f.morale = clamp(f.morale + 1.5, 0, 80); }
      if (!f.front || !activeWars(w).some((x) => x.fronts.some((fr) => fr.id === f.front && !fr.ended))) f.front = undefined;
    }
    named(w, rng);
  }
  if (t.orbit) for (const f of Object.values(s.formations)) staffFormation(w, rng, f);
  if (t.year) yearly(w, rng);
}

function phaseOf(w: World, rng: Rng, war: War): void {
  const P = w.playerHouseId;
  const ours = sideOf(war, P);
  for (const fr of war.fronts.filter((x) => !x.ended)) {
    if (fr.battle) continue;
    const pa = sidePower(w, war, fr, 'attackers'), pd = sidePower(w, war, fr, 'defenders');
    const total = Math.max(0.5, pa + pd);
    const edge = (pa - pd) / total;
    // A battle of ours on this front: the clock stops for it.
    const oursHere = ours && Object.values(w.war!.formations).some((f) => f.houseId === P && f.front === fr.id && f.strength > 0);
    if (oursHere && !w.battles?.list.some((b) => b.status !== 'over' && b.kind === 'war') && rng.chance(fr.kind === 'border' && war.rung === 'clashes' ? 0.22 : 0.3)) {
      warBattle(w, rng, war, fr);
      continue;
    }
    const move = edge * 14 + rng.gauss() * 6 + (fr.kind === 'siege' ? -2 : 0);
    fr.meter = clamp(fr.meter + move, -100, 100);
    bleed(w, war, fr, Math.abs(edge), rng);
    frontEnds(w, rng, war, fr);
  }
  // The score follows the fronts; time and blood wear both sides down.
  const open = war.fronts.filter((x) => !x.ended);
  war.score = clamp(war.score + open.reduce((t, fr) => t + fr.meter * (fr.kind === 'border' ? 0.03 : fr.kind === 'orbit' ? 0.05 : 0.08), 0), -100, 100);
  for (const h of [...partiesOf(war, 'attackers'), ...partiesOf(war, 'defenders')]) {
    const lost = war.losses[h] ?? 0;
    const strength = formationsOf(w, h).reduce((t, f) => t + f.max * (f.kind === 'legion' ? 1 : f.kind === 'fleet' ? 1000 : 2), 0) || 1;
    war.exhaustion[h] = clamp((war.exhaustion[h] ?? 0) + 0.6 + (war.rung === 'war' ? 0.5 : 0) + (lost / strength) * 4, 0, 100);
    if (h === P) econ(w, P).stock.othes -= war.rung === 'war' ? 300 : 120;
  }
  if (war.ceasefire !== undefined && absoluteCycle(w.date) >= war.ceasefire && war.status === 'active') {
    if (!war.defied) endWar(w, rng, war, 'none', 'The Numarade\'s ceasefire holds.');
  }
  checkEnd(w, rng, war);
}

/** Losses on a front this Phase. */
function bleed(w: World, war: War, fr: Front, edge: number, rng: Rng): void {
  for (const side of ['attackers', 'defenders'] as const) {
    const winning = (side === 'attackers') === (fr.meter >= 0);
    const fs = Object.values(w.war!.formations).filter((f) => f.front === fr.id && partiesOf(war, side).includes(f.houseId));
    for (const f of fs) {
      const rate = (war.rung === 'clashes' ? 0.004 : 0.008) * (winning ? 0.6 : 1.2) * (1 + edge) * (0.8 + rng.next() * 0.4);
      const lost = f.kind === 'fleet' ? (rng.chance(rate * 6) ? 1 : 0) : rnd(f.strength * rate);
      f.strength = Math.max(0, f.strength - lost);
      f.morale = clamp(f.morale + (winning ? 1 : -2.5), 5, 100);
      war.losses[f.houseId] = (war.losses[f.houseId] ?? 0) + (f.kind === 'fleet' ? lost * 300 : lost);
    }
  }
}

function frontEnds(w: World, rng: Rng, war: War, fr: Front): void {
  if (Math.abs(fr.meter) < 100) return;
  fr.ended = absoluteCycle(w.date);
  fr.winner = fr.meter > 0 ? 'attackers' : 'defenders';
  const A = houseName(w, war.attacker), D = houseName(w, war.defender);
  if (fr.kind === 'border') {
    war.score = clamp(war.score + (fr.winner === 'attackers' ? 25 : -25), -100, 100);
    say(w, war, fr.winner === 'attackers' ? `House ${A} breaks the border line.` : `House ${D} holds the border.`, true);
    if (fr.winner === 'attackers' && war.rung === 'war') { /* the way to the world is open */ }
    // A border won in a limited war usually ends it.
    if (war.rung === 'clashes') { endWar(w, rng, war, fr.winner, `The border clashes end with House ${fr.winner === 'attackers' ? A : D} the stronger.`); return; }
    openFront(w, war, 'border', `the border of House ${D}`);
  } else if (fr.kind === 'orbit') {
    if (fr.winner === 'attackers') {
      war.score = clamp(war.score + 20, -100, 100);
      say(w, war, `House ${A} holds the space over ${war.target}. The landings begin.`, true);
      openFront(w, war, 'siege', war.target ?? 'their world');
    } else {
      war.score = clamp(war.score - 30, -100, 100);
      say(w, war, `House ${D}'s ships drive House ${A} from the space over ${war.target}.`, true);
      openFront(w, war, 'orbit', `the space over ${war.target}`);
      fr.meter = 0;
    }
  } else {
    war.score = clamp(war.score + (fr.winner === 'attackers' ? 60 : -40), -100, 100);
    say(w, war, fr.winner === 'attackers' ? `${war.target} falls to House ${A}.` : `The siege of ${war.target} is broken.`, true);
    if (fr.winner === 'defenders') openFront(w, war, 'orbit', `the space over ${war.target}`);
  }
  deploy(w, war);
  void rng;
}

function checkEnd(w: World, rng: Rng, war: War): void {
  if (war.status !== 'active') return;
  const A = war.attacker, D = war.defender;
  const ea = war.exhaustion[A] ?? 0, ed = war.exhaustion[D] ?? 0;
  if (war.score >= 100 || ed >= 100) endWar(w, rng, war, 'attackers', war.score >= 100 ? `House ${houseName(w, D)} is beaten.` : `House ${houseName(w, D)} cannot go on.`);
  else if (war.score <= -100 || ea >= 100) endWar(w, rng, war, 'defenders', war.score <= -100 ? `House ${houseName(w, A)} is thrown back.` : `House ${houseName(w, A)} cannot go on.`);
  else if (ea >= 75 && ed >= 75) endWar(w, rng, war, 'none', 'Both houses are spent.');
}

// ---------------------------------------------------------------- battles of ours

function fightersFor(w: World, rng: Rng, war: War, fr: Front, side: 'attackers' | 'defenders', _th: Theatre): { spec: FighterSpec[]; cmd: { id?: string; name?: string; skill?: number }; mass: number; name: string; house: string } {
  const fs = Object.values(w.war!.formations).filter((f) => f.front === fr.id && partiesOf(war, side).includes(f.houseId)).sort((a, b) => formationPower(w, b, fr.kind) - formationPower(w, a, fr.kind));
  const lead = fs[0];
  const house = lead?.houseId ?? (side === 'attackers' ? war.attacker : war.defender);
  const cmd = lead ? commanderOf(w, lead) : { name: 'their captain', skill: 10 };
  const mass = clamp(rnd(fs.reduce((t, f) => t + Math.sqrt(f.strength / SCALE[f.kind]) * 6, 0)), 10, 120);
  const name = lead ? `${cap(lead.name)} of House ${houseName(w, house)}` : `House ${houseName(w, house)}`;
  if (isSim(w, house)) {
    const people = [...new Set(fs.flatMap((f) => [f.commanderId, ...f.knights]).filter((x): x is string => !!x))].map((id) => w.characters[id]).filter((c): c is Character => !!c?.alive && !isAway(w, c.id) || (!!c?.alive && fs.some((f) => f.commanderId === c.id)));
    const spec: FighterSpec[] = people.slice(0, 5).map((c, i) => ({ id: c.id, champion: i === 0 && c.flags.some((x) => x.id === 'knighted') }));
    if (spec.length < 2) spec.push(...Array.from({ length: 3 - spec.length }, (_, i) => ({ key: `ranks${i}`, name: `a sergeant of the ${lead?.name.replace(/^the /, '') ?? 'line'}`, power: 9 + rng.next() * 3 })));
    return { spec, cmd: { id: cmd.id, name: cmd.name, skill: cmd.skill }, mass, name, house };
  }
  // A house on the register: its Crucible people lead it in, if it has them.
  const r = rosterOf(w, rng, house);
  const spec: FighterSpec[] = [
    { key: r.champion.key, name: r.champion.name, power: r.champion.skill, champion: true },
    ...Array.from({ length: rng.int(2, 3) }, (_, i) => ({ key: `${house}-k${i}-${w.nextId}`, name: `a knight of House ${houseName(w, house)}`, power: r.knight * (0.9 + rng.next() * 0.2) })),
  ];
  return { spec, cmd: { name: cmd.name, skill: cmd.skill }, mass, name, house };
}

function warBattle(w: World, rng: Rng, war: War, fr: Front): void {
  const P = w.playerHouseId;
  const ours = sideOf(war, P)!;
  const theirs = ours === 'attackers' ? 'defenders' : 'attackers';
  const th: Theatre = fr.kind === 'orbit' ? rng.pick(['space', 'space', 'ship', 'station'] as Theatre[]) : fr.kind === 'siege' ? rng.pick(['surface', 'surface', 'atmo'] as Theatre[]) : rng.pick(['surface', 'atmo'] as Theatre[]);
  const us = fightersFor(w, rng, war, fr, ours, th);
  const them = fightersFor(w, rng, war, fr, theirs, th);
  const place = fr.kind === 'orbit' ? fr.where : fr.kind === 'siege' ? `the walls of ${war.target}` : rng.pick(['a border moon', 'a relay station', 'a river crossing', 'the pass at the border', 'a forward depot']);
  const title = `${fr.kind === 'siege' ? 'The assault on' : fr.kind === 'orbit' ? 'Battle over' : 'Clash at'} ${fr.kind === 'border' ? place : war.target ?? place}`;
  const b = createBattle(w, {
    kind: 'war', title, theatre: th, where: place, ref: fr.id,
    ours: { name: us.name, houseId: P, commander: us.cmd, mass: us.mass, fighters: us.spec },
    theirs: { name: them.name, houseId: them.house, commander: them.cmd, mass: them.mass, fighters: them.spec },
  });
  fr.battle = b.id;
  say(w, war, `${title}: our people go in.`, true);
}

function settleBattle(w: World, rng: Rng, war: War, fr: Front): void {
  const b = battleOf(w, fr.battle!);
  if (!b) { fr.battle = undefined; return; }
  if (b.status !== 'over') {
    if (absoluteCycle(w.date) - absoluteCycle(b.created) > 8) runOut(b, w);
    else return;
  }
  if (!b.result) return;
  applyFates(w, b);
  fr.battle = undefined;
  const P = w.playerHouseId;
  const ours = sideOf(war, P)!;
  const weWon = b.result.winner === 0;
  const dir = (ours === 'attackers' ? 1 : -1) * (weWon ? 1 : -1);
  fr.meter = clamp(fr.meter + dir * (22 + rng.next() * 10), -100, 100);
  // The ranks pay for it.
  for (const f of Object.values(w.war!.formations).filter((x) => x.front === fr.id)) {
    const won = (sideOf(war, f.houseId) === ours) === weWon;
    const rate = won ? 0.03 + rng.next() * 0.03 : 0.08 + rng.next() * 0.08;
    const lost = f.kind === 'fleet' ? (rng.chance(won ? 0.25 : 0.6) ? rng.int(1, won ? 1 : 3) : 0) : rnd(f.strength * rate);
    f.strength = Math.max(0, f.strength - lost);
    f.morale = clamp(f.morale + (won ? 8 : -12), 5, 100);
    f.fought++;
    if (won) f.won++;
    if (won && sideOf(war, f.houseId) === ours && f.houseId === P && rng.chance(0.3)) f.honours.push(`${b.title} (${w.date.year})`);
    war.losses[f.houseId] = (war.losses[f.houseId] ?? 0) + (f.kind === 'fleet' ? lost * 300 : lost);
  }
  say(w, war, `${b.title}: ${weWon ? 'ours' : 'theirs'}. ${b.result.text}`, true);
  promote(w, rng, war, b, weWon);
  frontEnds(w, rng, war, fr);
  checkEnd(w, rng, war);
}

// ---------------------------------------------------------------- from the ranks

/** A battle names someone from the ranks: a survivor with a score, or one of ours who did something. */
function promote(w: World, rng: Rng, war: War, b: ReturnType<typeof battleOf> & object, weWon: boolean): void {
  const P = w.playerHouseId;
  const year = w.date.year;
  const out = outcomes(b);
  const ourBest = out.filter((o) => o.side === 0 && o.id && w.characters[o.id]?.alive).sort((x, y) => y.rating - x.rating)[0];
  const enemy = b.sides[1].houseId ?? (sideOf(war, P) === 'attackers' ? war.defender : war.attacker);
  // They broke and ran; one of them will not forget who broke them.
  if (weWon && ourBest && rng.chance(0.4)) {
    const h = w.archon?.houses[enemy];
    const sp: SpeciesId = h ? (h.vassals?.length && rng.chance(0.25) ? rng.pick(h.vassals) : h.species) : 'human';
    const name = buildWord(rng, CULTURES[sp].given);
    const n: Named = {
      id: `nm${w.nextId++}`, name: `${name}, who fled ${b.where}`, species: sp, houseId: enemy, against: ourBest.id,
      why: `fled ${b.title.toLowerCase()} when ${ourBest.name} broke the line`, year, power: 10 + rng.next() * 4, comes: year + rng.int(1, 4),
    };
    w.war!.named.push(n);
    addThread(w, ourBest.id!, 'omen', `Someone who fled ${b.title.toLowerCase()} means to kill them`, n.id);
    say(w, war, `A soldier of House ${houseName(w, enemy)} got out of ${b.where} alive, and asked who it was that broke them.`);
  }
  // One of ours from the ranks did something worth a name.
  const hurt = out.find((o) => o.side === 0 && o.id && o.fate !== 'fine');
  if ((hurt || !weWon) && rng.chance(0.35)) {
    const home = w.houses[P]!;
    const planet = w.planets[home.capitalPlanetId]!;
    const sector = planet.sectors[0]!;
    const sp = rng.weighted(Object.entries(sector.peoples) as [SpeciesId, number][]);
    const fam = commonerFamily(w, rng, P, sp);
    const c = createCharacter(w, rng, { houseId: P, familyId: fam.id, species: sp, role: 'Soldier', focus: 'knight', knighted: false, tier: 'full', location: { planetId: planet.id, sectorId: sector.id }, age: SPECIES[sp].adulthood + rng.int(2, 12) });
    c.stats.valor = clamp(c.stats.valor + 3, 1, 20);
    const deed = hurt && w.characters[hurt.id!] ? `carried ${hurt.name} out of ${b.where}` : `held the line at ${b.where} when it broke`;
    c.flags.push({ id: 'wounded', since: w.date, until: addCycles(w.date, 24) });
    addThread(w, c.id, 'scar', `${cap(deed)} (${year})`);
    if (hurt?.id) addThread(w, hurt.id, 'debt', `Owes their life to ${displayName(c.name)}, a soldier`, c.id);
    w.war!.named.push({ id: `nm${w.nextId++}`, name: displayName(c.name), species: sp, houseId: P, why: deed, year, power: 0, comes: year, done: true });
    say(w, war, `${displayName(c.name)}, a soldier from the ranks, ${deed}. The house has their name now.`);
    logRecord(w, { kind: 'world', type: 'fight', severity: 2, text: `From the ranks: ${displayName(c.name)} ${deed}.`, who: [{ id: c.id, part: 'from the ranks' }] });
    fireStage(w, rng, 'war:ranks', { personId: c.id, ...(hurt?.id ? { secondId: hurt.id } : {}) });
  }
}

/** Survivors with a score come when their time comes. */
function named(w: World, rng: Rng): void {
  const year = w.date.year;
  if (w.events.pending.some((p) => p.defId.startsWith('war:revenge'))) return;
  const n = w.war!.named.find((x) => !x.done && x.against && x.comes <= year);
  if (!n) return;
  const target = w.characters[n.against!];
  if (!target?.alive) { n.done = true; return; }
  if (!rng.chance(0.25)) return;
  n.done = true;
  fireStage(w, rng, 'war:revenge', { personId: target.id, otherHouseId: n.houseId });
}

/** The survivor who is coming for this person, if any. */
export const hunterOf = (w: World, personId: string) => (w.war?.named ?? []).filter((n) => n.against === personId).pop();

// ---------------------------------------------------------------- ending

export function endWar(w: World, rng: Rng, war: War, winner: 'attackers' | 'defenders' | 'none', why: string): void {
  if (war.status !== 'active') return;
  war.status = 'ended';
  const P = w.playerHouseId;
  const ours = sideOf(war, P);
  for (const f of Object.values(w.war!.formations)) if (war.fronts.some((fr) => fr.id === f.front)) f.front = undefined;
  for (const fr of war.fronts) if (!fr.ended) fr.ended = absoluteCycle(w.date);
  const winnerHouse = winner === 'attackers' ? war.attacker : winner === 'defenders' ? war.defender : '';
  const loserHouse = winner === 'attackers' ? war.defender : winner === 'defenders' ? war.attacker : '';
  // Terms: the goal if the attacker won; a defender who won takes reparations.
  const terms: WarGoal | undefined = winner === 'attackers' ? (war.rung === 'clashes' ? 'humble' : war.goal) : winner === 'defenders' ? 'reparations' : undefined;
  war.result = { winner, text: why, terms, date: w.date };
  say(w, war, why, true);
  const year = w.date.year;
  w.archon?.history.push({ year, kind: 'war', text: `${cap(war.name)} ended: ${why}${terms ? ` Terms: ${GOAL_LABEL[terms].toLowerCase()}.` : ''}`, houses: [war.attacker, war.defender] });
  logRecord(w, { kind: 'world', type: 'fight', severity: ours ? 3 : 1, text: `${cap(war.name)} is over. ${why}`, houseIds: [war.attacker, war.defender].filter((x) => isSim(w, x)), source: 'the Numarade' });
  if (!winnerHouse) return;
  // Ours to choose: the terms come to us.
  if (winnerHouse === P) { war.asking = true; fireStage(w, rng, 'war:terms', { otherHouseId: loserHouse }); return; }
  applyTerms(w, rng, war, terms!);
}

/** What the winner takes. */
export function applyTerms(w: World, rng: Rng, war: War, terms: WarGoal): void {
  const r = war.result!;
  const winner = r.winner === 'attackers' ? war.attacker : war.defender;
  const loser = r.winner === 'attackers' ? war.defender : war.attacker;
  r.terms = terms;
  war.asking = false;
  const W = houseName(w, winner), L = houseName(w, loser);
  const year = w.date.year;
  const pay = (from: string, to: string, n: number) => {
    if (isSim(w, from)) econ(w, from).stock.othes -= n;
    if (isSim(w, to)) econ(w, to).stock.othes += n;
  };
  const shift = (id: string, by: number) => { const h = w.archon?.houses[id]; if (h) h.prestige = clamp(h.prestige + by, 0, 100); };
  shift(winner, 6); shift(loser, -6);
  let text = '';
  switch (terms) {
    case 'tribute': {
      const amount = rnd(2000 + (w.archon?.houses[loser]?.might ?? 1) * 2500);
      w.war!.tributes.push({ from: loser, to: winner, amount, until: year + 5 });
      text = `House ${L} pays House ${W} ${fmt(amount)} othes a year for five years.`;
      break;
    }
    case 'reparations': {
      const n = rnd(6000 + (w.archon?.houses[loser]?.might ?? 1) * 6000);
      pay(loser, winner, n);
      text = `House ${L} pays House ${W} ${fmt(n)} othes in reparations.`;
      break;
    }
    case 'humble': shift(winner, 6); shift(loser, -8); if (isSim(w, loser)) w.houses[loser]!.standing.respect = clamp(w.houses[loser]!.standing.respect - 8, 0, 100); text = `House ${L} is humbled before the Archon.`; break;
    case 'relic': {
      const cg = Object.values(w.armoury).find((g) => g.houseId === loser && !g.bondedTo);
      if (cg && isSim(w, winner)) { cg.houseId = winner; delete cg.vaultId; text = `House ${L} gives up the Caige ${cg.name}.`; }
      else if (isSim(w, winner)) {
        const ctx = makeCtx(w, rng, {});
        if (winner !== w.playerHouseId) ctx.house = winner;
        const lost = (w.archon?.legends ?? []).find((l) => l.house === loser && !l.found);
        const caige = { id: `cg${w.nextId++}`, name: lost?.name ?? `the ${L} Blade`, type: rng.pick(['magnetic', 'gravitic', 'drift'] as const), band: rng.pick(['ambercore', 'redline'] as const), houseId: winner, found: w.date, foundAt: { planetId: w.houses[winner]!.capitalPlanetId, sectorId: w.planets[w.houses[winner]!.capitalPlanetId]!.sectors[0]!.id }, stability: 65 };
        w.armoury[caige.id] = caige as never;
        if (lost) lost.found = year;
        text = `House ${L} gives up ${caige.name} from its vault.`;
        void ctx;
      } else text = `House ${L} gives up a Caige from its vault.`;
      break;
    }
    case 'hostage': {
      const noble = isSim(w, loser) ? Object.values(w.characters).find((c) => c.alive && c.houseId === loser && c.tier === 'full' && (c.role === 'Heir' || c.role === 'Noble')) : undefined;
      const h = w.archon?.houses[loser];
      const name = noble ? displayName(noble.name) : personName(rng, h?.species ?? 'human', h?.families[0] ?? L);
      w.war!.hostages.push({ name, personId: noble?.id, from: loser, heldBy: winner, since: year });
      if (noble) noble.flags.push({ id: 'ward', since: w.date, detail: `hostage of House ${W}` });
      text = `${name} of House ${L} goes to House ${W} as a hostage.`;
      break;
    }
    case 'world': text = takeWorld(w, rng, winner, loser, war.goal === 'world' && !isSim(w, loser) ? war.target : undefined); break;
    case 'vassal': {
      if (loser === w.playerHouseId || !w.archon?.houses[loser]) { text = `House ${L} swears fealty to House ${W}.`; }
      else text = `House ${L} swears fealty to House ${W}.`;
      w.war!.liege[loser] = winner;
      for (const v of vassalsOf(w, loser)) w.war!.liege[v] = winner;
      break;
    }
  }
  shiftRegard(w, loser, winner, -20);
  say(w, war, `Terms: ${text}`, true);
  logRecord(w, { kind: 'world', type: 'politics', severity: winner === w.playerHouseId || loser === w.playerHouseId ? 3 : 1, text: `The terms of ${war.name}: ${text}`, houseIds: [winner, loser].filter((x) => isSim(w, x)), source: 'the Numarade' });
  w.archon?.history.push({ year, kind: 'war', text: `The terms of ${war.name}: ${text}`, houses: [winner, loser] });
}

// ---------------------------------------------------------------- worlds change hands

const SECTOR_KINDS: [string, string, string, string][] = [
  ['Garrison', 'Military', '1,200 soldiers', 'Garrison Commander'],
  ['Landing Yards', 'Logistics', 'Supply and transit', 'Yardmaster'],
  ['Mines', 'Mining', 'Metals', 'Mine Boss'],
  ['Fields', 'Farming', 'Provisions', 'Steward of the Fields'],
  ['Old Town', 'Housing', 'Homes and markets', ''],
  ['Trading Post', 'Trade', 'Trade and tariffs', 'Factor'],
];

/** Make a real world for the house that takes or claims it: a few sectors, people to come. */
export function makePlanet(w: World, rng: Rng, houseId: string, name: string, desc: string, peoples: Partial<Record<SpeciesId, number>>): Planet {
  const id = `${name.toLowerCase().replace(/[^a-z]+/g, '-')}-${w.nextId++}`;
  const n = rng.int(2, 3);
  const keys = rng.shuffle([...SECTOR_KINDS]);
  const planet: Planet = {
    id, name, houseId, description: desc, sectorLimit: 6,
    sectors: Array.from({ length: n }, (_, i) => {
      const [label, kind, gives] = i === 0 ? SECTOR_KINDS[0]! : keys[i] ?? SECTOR_KINDS[4]!;
      const sid = `${id}:s${i}`;
      return {
        id: sid, name: i === 0 ? `${name} Hold` : `${name} ${label}`, designation: i === 0 ? 'Held town' : 'Settlement', port: i === 0 ? 'landing field' as const : 'none' as const,
        room: 6, roomUsed: 3, population: rng.int(8, 40) * 1000, unrest: 25 + rng.int(0, 20), controllerFamilyId: null, peoples,
        description: desc,
        quarters: [{ id: `${sid}:q0`, name: i === 0 ? 'The Hold' : label, kind: i === 0 ? 'Military' : kind, gives: i === 0 ? '600 soldiers' : gives, overseerId: null }],
      };
    }),
  };
  w.planets[id] = planet;
  for (const h of Object.keys(w.houses)) { w.knowledge[h] ??= {}; }
  return planet;
}

function takeWorld(w: World, rng: Rng, winner: string, loser: string, named?: string): string {
  const W = houseName(w, winner), L = houseName(w, loser);
  const lh = w.archon?.houses[loser], wh = w.archon?.houses[winner];
  if (isSim(w, loser)) {
    const cap0 = w.houses[loser]!.capitalPlanetId;
    const p = Object.values(w.planets).find((x) => x.houseId === loser && x.id !== cap0);
    if (p && isSim(w, winner)) { p.houseId = winner; for (const s of p.sectors) s.controllerFamilyId = null; if (lh) lh.worlds = Math.max(1, lh.worlds - 1); return `House ${L} cedes ${p.name} to House ${W}.`; }
    // A simulated house's capital is not taken: tribute instead.
    const amount = rnd(4000 + (lh?.might ?? 1) * 3000);
    w.war!.tributes.push({ from: loser, to: winner, amount, until: w.date.year + 5 });
    return `House ${L} has no world to spare beyond its capital, and pays ${fmt(amount)} othes a year for five years instead.`;
  }
  if (!lh) return '';
  lh.worlds -= 1;
  if (wh) wh.worlds += 1;
  const name = named ?? worldName(rng);
  if (isSim(w, winner)) {
    const p = makePlanet(w, rng, winner, name, `Taken from House ${L} in ${w.date.year}. Its people have not yet decided what they think of us.`, { [lh.species]: 70, human: 30 } as Partial<Record<SpeciesId, number>>);
    void p;
  }
  let text = `House ${L} cedes the world of ${name} to House ${W}.`;
  if (lh.worlds <= 0) text += ' ' + fall(w, loser, winner);
  return text;
}

/** A house with no worlds left is no more: its people pass to the victor. */
export function fall(w: World, id: string, to: string): string {
  const h = w.archon?.houses[id];
  if (!h || isSim(w, id)) return '';
  h.ended = w.date.year;
  delete w.war!.liege[id];
  for (const f of formationsOf(w, id)) delete w.war!.formations[f.id];
  if (w.archon) {
    w.archon.numarade.minorSeats = w.archon.numarade.minorSeats.filter((s) => s !== id);
    w.archon.numarade.seats = w.archon.numarade.seats.filter((s) => s !== id);
    w.archon.history.push({ year: w.date.year, kind: 'end', text: `House ${h.name} fell: its last world went to House ${houseName(w, to)}.`, houses: [id, to] });
  }
  return `House ${h.name} has no world left, and is no more.`;
}

// ---------------------------------------------------------------- the year

function yearly(w: World, rng: Rng): void {
  const s = w.war!;
  const year = w.date.year;
  // Tribute is paid.
  for (const t of s.tributes) {
    if (t.until < year) continue;
    if (isSim(w, t.from)) econ(w, t.from).stock.othes -= t.amount;
    if (isSim(w, t.to)) econ(w, t.to).stock.othes += t.amount;
    if (t.from === w.playerHouseId || t.to === w.playerHouseId) logRecord(w, { kind: 'world', type: 'economy', severity: 1, text: `Tribute: House ${houseName(w, t.from)} pays House ${houseName(w, t.to)} ${fmt(t.amount)} othes (until ${t.until}).` });
  }
  s.tributes = s.tributes.filter((t) => t.until >= year);
  // Vassals pay their liege and vote with them.
  for (const [v, l] of Object.entries(s.liege)) {
    const amount = rnd(1000 + (w.archon?.houses[v]?.might ?? 1) * 1500);
    if (isSim(w, v)) econ(w, v).stock.othes -= amount;
    if (isSim(w, l)) econ(w, l).stock.othes += amount;
    shiftRegard(w, v, l, -2);
  }
  // A Great House gone leaves a seat: the strongest Minor is raised by acclamation.
  const a = w.archon;
  if (a) {
    const greats = liveHouses(w).filter((h) => h.tier === 'great');
    if (greats.length < 7) {
      const up = liveHouses(w).filter((h) => h.tier === 'minor').sort((x, y) => y.prestige - x.prestige)[0];
      if (up) { up.tier = 'great'; if (w.houses[up.id]) w.houses[up.id]!.tier = 'great'; a.numarade.minorSeats = a.numarade.minorSeats.filter((x) => x !== up.id); a.numarade.seats = [...liveHouses(w).filter((h) => h.tier === 'great').map((h) => h.id), ...a.numarade.minorSeats]; a.history.push({ year, kind: 'rise', text: `House ${up.name} was raised a Great House by acclamation, to fill an empty seat.`, houses: [up.id] }); }
    }
  }
  // Wars across the Archon: feuds and hatred become clashes, clashes become wars.
  for (const war of activeWars(w)) {
    if (war.rung === 'clashes' && !sideOf(war, w.playerHouseId) && rng.chance(0.3)) escalateWar(w, rng, war);
  }
  if (activeWars(w).length < 3) maybeWar(w, rng);
}

function maybeWar(w: World, rng: Rng): void {
  const P = w.playerHouseId;
  const houses = liveHouses(w);
  const pairs: [ArchonHouse, ArchonHouse, number][] = [];
  for (const x of houses) for (const y of houses) {
    if (x.id === y.id || atWar(w, x.id, y.id) || w.war!.liege[x.id] === y.id || w.war!.liege[y.id] === x.id) continue;
    if (warsOf(w, x.id).length || (y.id !== P && warsOf(w, y.id).length > 1)) continue;
    // Not the same two again so soon, and not us again so soon.
    const last = w.war!.wars.filter((v) => v.status === 'ended' && ((v.attacker === x.id && v.defender === y.id) || (v.attacker === y.id && v.defender === x.id) || (y.id === P && sideOf(v, P)))).map((v) => v.result?.date.year ?? 0);
    if (last.some((yr) => w.date.year - yr < (y.id === P ? 4 : 6))) continue;
    const r = regardOf(w, x.id, y.id);
    const feud = grievances(w, x.id, y.id).length;
    if (r > -20 && !feud) continue;
    let weight = (x.personality.aggression + 0.2) * (Math.max(0, -r) / 50 + (feud ? 0.6 : 0)) * (x.might / Math.max(0.5, y.might));
    // We are not picked on often.
    if (y.id === P) weight *= 0.25;
    if (x.id === P) continue;
    if (weight > 0) pairs.push([x, y, weight]);
  }
  if (!pairs.length || !rng.chance(0.5)) return;
  const [x, y] = rng.weighted(pairs.map(([a, b, wt]) => [[a, b] as const, wt] as const));
  const goals: WarGoal[] = ['tribute', 'reparations', 'humble', 'relic', 'hostage', 'world', 'vassal'];
  const goal = rng.weighted(goals.map((g) => [g, g === 'world' ? (y.worlds > 1 ? 1 : 0.2) * x.personality.greed : g === 'vassal' ? (x.might > y.might * 1.3 ? 0.8 : 0.05) : g === 'tribute' ? 1 + x.personality.greed : g === 'humble' ? 0.5 + x.personality.honour : 0.6] as const));
  const war = startWar(w, rng, { attacker: x.id, defender: y.id, goal, rung: rng.chance(0.6) ? 'clashes' : 'war' });
  callAllies(w, war, 'attackers', rng);
  if (y.id !== P) callAllies(w, war, 'defenders', rng);
  if (y.id === P) fireStage(w, rng, 'war:attacked', { otherHouseId: x.id });
}

// ---------------------------------------------------------------- peace by talking

/** How likely the other side is to accept a peace we offer now. */
export function peaceOdds(w: World, war: War, offer: 'white' | 'yield'): number {
  const P = w.playerHouseId;
  const ours = sideOf(war, P);
  if (!ours) return 0;
  const our = ours === 'attackers' ? war.score : -war.score;
  const foe = ours === 'attackers' ? war.defender : war.attacker;
  const theirEx = war.exhaustion[foe] ?? 0;
  if (offer === 'yield') return 0.95;
  return clamp(0.25 + our / 120 + theirEx / 160 + affinity(w, foe, P) * 0.2, 0.02, 0.95);
}

/** Offer peace: an even peace, or yield and give them their terms. */
export function offerPeace(input: World, warId: string, offer: 'white' | 'yield'): World {
  const w = structuredClone(input);
  const war = w.war?.wars.find((x) => x.id === warId && x.status === 'active');
  const P = w.playerHouseId;
  if (!war || !sideOf(war, P)) throw new Error('Not our war.');
  if (war.attacker !== P && war.defender !== P) {
    // An ally can simply leave.
    war.attackers = war.attackers.filter((h) => h !== P);
    war.defenders = war.defenders.filter((h) => h !== P);
    for (const f of formationsOf(w, P)) if (war.fronts.some((fr) => fr.id === f.front)) f.front = undefined;
    const lead = sideOf(input.war!.wars.find((x) => x.id === warId)!, P) === 'attackers' ? war.attacker : war.defender;
    shiftRegard(w, lead, P, -12);
    say(w, war, `House ${houseName(w, P)} leaves the war.`);
    return w;
  }
  const rng = new Rng(w.rng);
  const ours = sideOf(war, P)!;
  if (offer === 'yield') endWar(w, rng, war, ours === 'attackers' ? 'defenders' : 'attackers', `House ${houseName(w, P)} yields.`);
  else if (rng.chance(peaceOdds(w, war, 'white'))) endWar(w, rng, war, 'none', 'Peace is made, and nobody takes anything.');
  else { say(w, war, `House ${houseName(w, ours === 'attackers' ? war.defender : war.attacker)} refuses our offer of peace.`); w.houses[P]!.standing.respect = clamp(w.houses[P]!.standing.respect - 1, 0, 100); }
  w.rng = rng.state;
  return w;
}

/** Step up from clashes to declared war. */
export function escalate(input: World, warId: string): World {
  const w = structuredClone(input);
  const war = w.war?.wars.find((x) => x.id === warId && x.status === 'active');
  if (!war || war.attacker !== w.playerHouseId || war.rung !== 'clashes') throw new Error('Only our own clashes can be made a war.');
  escalateWar(w, new Rng(w.rng), war);
  return w;
}

// ---------------------------------------------------------------- the Numarade

/** Wars the Numarade might want stopped: long, bloody, or spreading. */
export function warWorry(w: World, war: War): number {
  const dead = Object.values(war.losses).reduce((t, x) => t + x, 0);
  const years = (absoluteCycle(w.date) - absoluteCycle(war.since)) / CYCLES_PER_YEAR;
  return dead / 40000 + years * 0.6 + (war.attackers.length + war.defenders.length) * 0.8 + Math.abs(war.score) / 60 + (war.rung === 'war' ? 1 : 0);
}

export function orderCeasefire(w: World, warId: string): void {
  const war = w.war?.wars.find((x) => x.id === warId && x.status === 'active');
  if (!war) return;
  war.ceasefire = absoluteCycle(w.date) + CYCLES_PER_ORBIT;
  say(w, war, 'The Numarade orders a ceasefire within the Orbit.', true);
  if (sideOf(war, w.playerHouseId)) fireStage(w, new Rng(w.rng), 'war:ceasefire', { otherHouseId: war.attacker === w.playerHouseId ? war.defender : war.attacker });
}

/** We fight on against the Numarade's word. */
export function defyCeasefire(w: World, war: War): void {
  war.defied = true;
  delete war.ceasefire;
  const P = w.playerHouseId;
  for (const s of w.archon?.numarade.seats ?? []) if (s !== P) shiftRegard(w, s, P, -12);
  if (w.archon) table(w, 'censure', w.archon.numarade.seats.find((s) => s !== P && !sideOf(war, s)) ?? w.archon.numarade.seats[0]!, P);
  say(w, war, `House ${houseName(w, P)} defies the Numarade and fights on.`, true);
}

export function ceasefireMotionFor(w: World): { warId: string; by: string } | null {
  const seats = w.archon?.numarade.seats ?? [];
  const war = activeWars(w).filter((x) => !x.ceasefire && !x.defied && absoluteCycle(w.date) - absoluteCycle(x.since) >= CYCLES_PER_YEAR && warWorry(w, x) > 4.5).sort((a, b) => warWorry(w, b) - warWorry(w, a))[0];
  if (!war) return null;
  const by = seats.filter((s) => !sideOf(war, s)).sort((a, b) => (w.archon!.houses[b]!.views.numarade + w.archon!.houses[b]!.views.honour) - (w.archon!.houses[a]!.views.numarade + w.archon!.houses[a]!.views.honour))[0];
  return by ? { warId: war.id, by } : null;
}

export const warOf = (w: World, id?: string) => (id ? w.war?.wars.find((x) => x.id === id) : undefined);
export type { Motion };
export { wildLabel, worthOf };
export type { Wild };
void CYCLES_PER_PHASE;
