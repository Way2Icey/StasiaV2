// The battle engine. Every fight (a corsair hunt, a Crucible clash, later war) is a live battle in a theatre:
// on a surface, in atmosphere, in space, aboard a station or a ship. It runs tick by tick as a feed of what
// happens. The Highroy does not hold a blade: orders go through the commander, who decides how many can be
// given and how well they are carried out, and through the fighters, who may not obey. Orders change which
// fights happen; the people in them decide who wins. Key moments stop the battle and ask.
import { Rng } from './rng';
import { caigeEdge } from './scenes_power';
import type { Character, ResonanceBand, ResonanceType, StatId, World } from './types';
import { barsOf } from './relationships';
import { shortName } from './names';
import { kill as killHere } from './death';
import { addCycles } from './time';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ---------------------------------------------------------------- theatres

export type Theatre = 'surface' | 'atmo' | 'space' | 'station' | 'ship';
export type Special = 'highground' | 'intercept' | 'ram' | 'vent' | 'bridge';

export interface TheatreDef {
  label: string;
  note: string;
  /** What makes a fighter strong here. */
  fight: StatId[];
  /** What makes a commander good here. */
  command: StatId[];
  /** How each resonance type fares here. */
  resonance: Record<ResonanceType, number>;
  special: { id: Special; label: string; note: string };
  /** Words for the mass of each side. */
  mass: string;
}

export const THEATRES: Record<Theatre, TheatreDef> = {
  surface: { label: 'Surface', note: 'Ground and walls: siegecraft and endurance count.', fight: ['duelling', 'strength', 'endurance', 'valor'], command: ['tactics', 'siegecraft', 'leadership'], resonance: { magnetic: 1, gravitic: 1.05, drift: 0.95 }, special: { id: 'highground', label: 'Take the high ground', note: 'Our line holds better for a while.' }, mass: 'the line' },
  atmo: { label: 'Atmosphere', note: 'Drop ships and storms: reflexes and nerve.', fight: ['reflexes', 'agility', 'duelling', 'composure'], command: ['fleetCommand', 'tactics', 'composure'], resonance: { magnetic: 0.95, gravitic: 0.95, drift: 1.15 }, special: { id: 'intercept', label: 'Intercept the drop', note: 'Strike their landing before it lands.' }, mass: 'the wing' },
  space: { label: 'Space', note: 'Ships and guns: fleet command and logistics.', fight: ['reflexes', 'marksmanship', 'composure', 'duelling'], command: ['fleetCommand', 'logistics', 'tactics'], resonance: { magnetic: 1, gravitic: 1.15, drift: 0.95 }, special: { id: 'ram', label: 'Ram them', note: 'Both ships pay; theirs pays more.' }, mass: 'the guns' },
  station: { label: 'Station', note: 'Corridors and bulkheads: stealth and reflexes.', fight: ['stealth', 'reflexes', 'duelling', 'agility'], command: ['tactics', 'intrigue', 'leadership'], resonance: { magnetic: 1.12, gravitic: 1, drift: 0.95 }, special: { id: 'vent', label: 'Vent the section', note: 'Everyone in it dies, ours too.' }, mass: 'the decks' },
  ship: { label: 'Aboard ship', note: 'Boarding: blades and discipline.', fight: ['duelling', 'discipline', 'reflexes', 'strength'], command: ['leadership', 'tactics', 'discipline'], resonance: { magnetic: 1.12, gravitic: 1, drift: 0.95 }, special: { id: 'bridge', label: 'Storm the bridge', note: 'Go for their commander.' }, mass: 'the crew' },
};

/** Magnetic beats gravitic, gravitic beats drift, drift beats magnetic. */
const BEATS: Record<ResonanceType, ResonanceType> = { magnetic: 'gravitic', gravitic: 'drift', drift: 'magnetic' };
const BAND_POWER: Record<ResonanceBand, number> = { frostpoint: 0, bluewake: 0.5, ambercore: 1.2, redline: 2, whitebreak: 3 };

// ---------------------------------------------------------------- shapes

export type FighterState = 'ready' | 'engaged' | 'down' | 'dead' | 'pulled';

export interface Fighter {
  key: string;
  /** The character, when it is a real person. */
  id?: string;
  name: string;
  side: 0 | 1;
  power: number;
  res?: { type: ResonanceType; band: ResonanceBand };
  caige: boolean;
  sync: number;
  control: number;
  discipline: number;
  agility: number;
  hp: number;
  state: FighterState;
  foe?: string;
  /** Ticks of Caige surge left. */
  surge: number;
  burnt?: boolean;
  champion?: boolean;
  /** An old score: they go after this one whatever they are told. */
  hunts?: string;
  rating: number;
  deeds: string[];
}

export interface Side {
  name: string;
  houseId?: string;
  commander: { id?: string; name: string; skill: number; lead: number };
  mass: number;
  massMax: number;
  morale: number;
  orders: number;
  ordersMax: number;
  stance: 'press' | 'hold' | null;
  stanceTicks: number;
  buff: number;
  buffTicks: number;
}

export interface FeedLine { t: number; text: string; side?: 0 | 1; big?: boolean }

export type MomentKind = 'challenge' | 'surge' | 'wounded' | 'break' | 'nemesis';
export interface MomentOption { key: string; label: string; hint?: string }
export interface Moment { kind: MomentKind; text: string; options: MomentOption[]; who?: string; foe?: string }

export type BattleKind = 'hunt' | 'crucible' | 'raid' | 'war' | 'arc';

export interface Battle {
  id: string;
  kind: BattleKind;
  title: string;
  theatre: Theatre;
  where: string;
  /** What it settles: a hunt's id, a Crucible location. */
  ref?: string;
  rng: [number, number, number, number];
  tick: number;
  maxTicks: number;
  /** −100..100: + is our side winning. */
  momentum: number;
  sides: [Side, Side];
  fighters: Fighter[];
  feed: FeedLine[];
  moment?: Moment;
  /** Moments already raised, so each comes once. */
  raised: string[];
  status: 'ready' | 'live' | 'over';
  /** Someone is watching and commanding: moments wait for them. */
  commanded?: boolean;
  created: World['date'];
  result?: { winner: 0 | 1; text: string; brokeOff?: boolean };
  applied?: boolean;
  /** The clock has stopped for it once already. */
  prompted?: boolean;
}

export interface BattlesState { list: Battle[] }

export function ensureBattles(world: World): void { world.battles ??= { list: [] }; }
export function battleOf(world: World, id: string): Battle | undefined { return world.battles?.list.find((b) => b.id === id); }
export function readyBattles(world: World): Battle[] { return (world.battles?.list ?? []).filter((b) => b.status !== 'over'); }

// ---------------------------------------------------------------- building a battle

export interface FighterSpec { id?: string; key?: string; name?: string; power?: number; champion?: boolean; hunts?: string; discipline?: number; agility?: number; res?: Fighter['res']; caige?: boolean; sync?: number; control?: number }
export interface SideSpec { name: string; houseId?: string; commander: { id?: string; name?: string; skill?: number; lead?: number }; mass: number; fighters: FighterSpec[]; morale?: number }

const avg = (c: Character, ids: StatId[]) => ids.reduce((t, s) => t + c.stats[s], 0) / ids.length;

export function fighterPower(c: Character, theatre: Theatre): number {
  const base = avg(c, THEATRES[theatre].fight);
  const res = c.resonance ? BAND_POWER[c.resonance.band] * (0.5 + c.stats.resonanceControl / 40) : 0;
  const wounded = c.flags.some((f) => f.id === 'wounded') ? 0.85 : 1;
  return (base + res) * wounded;
}

export function commandOf(c: Character | undefined, theatre: Theatre): number {
  return c ? avg(c, THEATRES[theatre].command) : 8;
}

export function createBattle(world: World, spec: { kind: BattleKind; title: string; theatre: Theatre; where: string; ref?: string; ours: SideSpec; theirs: SideSpec; maxTicks?: number }): Battle {
  ensureBattles(world);
  const th = spec.theatre;
  const mkSide = (s: SideSpec): Side => {
    const cc = s.commander.id ? world.characters[s.commander.id] : undefined;
    const skill = s.commander.skill ?? commandOf(cc, th);
    const lead = s.commander.lead ?? (cc ? cc.stats.leadership : skill);
    return {
      name: s.name, houseId: s.houseId,
      commander: { id: cc?.id, name: cc ? shortName(cc.name) : s.commander.name ?? 'their captain', skill, lead },
      mass: s.mass, massMax: s.mass, morale: s.morale ?? 70,
      // A great commander gets five or six orders through; a poor one two.
      ordersMax: clamp(2 + Math.floor((skill + lead - 8) / 6), 2, 7), orders: 0,
      stance: null, stanceTicks: 0, buff: 1, buffTicks: 0,
    };
  };
  const sides: [Side, Side] = [mkSide(spec.ours), mkSide(spec.theirs)];
  sides.forEach((s) => { s.orders = s.ordersMax; });
  const fighters: Fighter[] = [];
  const mkF = (f: FighterSpec, side: 0 | 1, i: number): Fighter | null => {
    const c = f.id ? world.characters[f.id] : undefined;
    if (f.id && !c?.alive) return null;
    const bonded = c ? c.flags.some((x) => x.id === 'caigeBonded') : !!f.caige;
    return {
      key: f.key ?? f.id ?? `npc${side}-${i}`, id: c?.id, name: c ? shortName(c.name) : f.name ?? 'a fighter', side,
      power: f.power ?? (c ? fighterPower(c, th) * caigeEdge(world, c) : 10),
      res: c?.resonance && c.resonance.band !== 'frostpoint' ? { type: c.resonance.type, band: c.resonance.band } : f.res,
      caige: bonded, sync: c ? c.stats.caigeSync : f.sync ?? 8, control: c ? c.stats.resonanceControl : f.control ?? 8,
      discipline: c ? c.stats.discipline : f.discipline ?? 10, agility: c ? (c.stats.agility + c.stats.stealth) / 2 : f.agility ?? 10,
      hp: 4, state: 'ready', surge: 0, champion: f.champion, hunts: f.hunts, rating: 6, deeds: [],
    };
  };
  spec.ours.fighters.forEach((f, i) => { const x = mkF(f, 0, i); if (x) fighters.push(x); });
  spec.theirs.fighters.forEach((f, i) => { const x = mkF(f, 1, i); if (x) fighters.push(x); });
  // Old scores: a grudge against someone on the other side, and they go after them whatever they are told.
  for (const f of fighters) {
    if (f.side !== 0 || !f.id || f.hunts) continue;
    const g = (world.story?.threads ?? []).find((t) => !t.closed && t.kind === 'grudge' && t.personId === f.id && t.about && fighters.some((o) => o.side === 1 && o.id === t.about));
    if (g) f.hunts = g.about;
  }
  const seedRng = Rng.fromSeed(`${world.nextId}:${world.rng.join(',')}`);
  const b: Battle = {
    id: `bt${world.nextId++}`, kind: spec.kind, title: spec.title, theatre: th, where: spec.where, ref: spec.ref,
    rng: [seedRng.int(1, 2 ** 30), seedRng.int(1, 2 ** 30), seedRng.int(1, 2 ** 30), seedRng.int(1, 2 ** 30)],
    tick: 0, maxTicks: spec.maxTicks ?? 20, momentum: 0, sides, fighters, feed: [], raised: [], status: 'ready', created: world.date,
  };
  b.feed.push({ t: 0, text: `${THEATRES[th].label}: ${b.where}. ${sides[0].commander.name} commands ${sides[0].name}; ${sides[1].commander.name} commands ${sides[1].name}.`, big: true });
  world.battles!.list.unshift(b);
  world.battles!.list = world.battles!.list.filter((x, i) => x.status !== 'over' || i < 12);
  return b;
}

// ---------------------------------------------------------------- the fight

const living = (b: Battle, side?: 0 | 1) => b.fighters.filter((f) => (side === undefined || f.side === side) && (f.state === 'ready' || f.state === 'engaged'));
const byKey = (b: Battle, k?: string) => (k ? b.fighters.find((f) => f.key === k) : undefined);
const say = (b: Battle, text: string, side?: 0 | 1, big?: boolean) => { b.feed.push({ t: b.tick, text, side, big }); if (b.feed.length > 160) b.feed.shift(); };

/** A fighter's strength in this exchange, against this foe, with friends (or not) beside them. */
export function effective(b: Battle, f: Fighter, foe: Fighter | undefined, world?: World): number {
  const th = THEATRES[b.theatre];
  let p = f.power;
  if (f.res) {
    p *= th.resonance[f.res.type];
    if (foe?.res && BEATS[f.res.type] === foe.res.type) p *= 1.1;
  }
  if (f.surge > 0) p *= 1.45 + BAND_POWER[f.res?.band ?? 'bluewake'] * 0.08;
  p *= 0.7 + (Math.max(0, f.hp) / 4) * 0.3;
  // Who is beside them: the close lift each other; the estranged do worse together.
  if (world && f.id) {
    let mod = 0;
    for (const o of living(b, f.side)) {
      if (!o.id || o.key === f.key) continue;
      const bar = barsOf(world, f.id, o.id);
      if (bar.like >= 55) mod += 0.04; else if (bar.dislike >= 35) mod -= 0.04;
    }
    p *= 1 + clamp(mod, -0.1, 0.1);
  }
  return p;
}

function pickFoe(b: Battle, r: Rng, f: Fighter): Fighter | undefined {
  const foes = living(b, (1 - f.side) as 0 | 1);
  if (!foes.length) return undefined;
  const nem = f.hunts ? foes.find((x) => x.key === f.hunts || x.id === f.hunts) : undefined;
  if (nem) return nem;
  if (f.champion) { const ch = foes.find((x) => x.champion && x.state === 'ready'); if (ch && r.chance(0.5)) return ch; }
  const free = foes.filter((x) => x.state === 'ready');
  return r.pick(free.length ? free : foes);
}

function engage(_b: Battle, a: Fighter, c: Fighter) {
  a.state = 'engaged'; a.foe = c.key;
  if (c.state === 'ready') { c.state = 'engaged'; c.foe = a.key; }
}

function release(b: Battle, f: Fighter) {
  const foe = byKey(b, f.foe);
  if (foe && foe.foe === f.key && (foe.state === 'engaged')) { foe.state = 'ready'; delete foe.foe; }
  delete f.foe;
}

function fall(b: Battle, r: Rng, f: Fighter, by: Fighter | undefined, deathRisk: number) {
  release(b, f);
  const dies = r.chance(deathRisk);
  f.state = dies ? 'dead' : 'down';
  f.rating -= 1.2;
  if (by) { by.rating += dies ? 1.6 : 1.1; by.deeds.push(`${dies ? 'killed' : 'downed'} ${f.name}`); if (by.state === 'engaged' && by.foe === f.key) { by.state = 'ready'; delete by.foe; } }
  // A commander who falls leaves their side without orders.
  const side = b.sides[f.side];
  if ((f.id && f.id === side.commander.id) || (!f.id && f.name === side.commander.name)) {
    side.orders = 0; side.commander.skill *= 0.6; side.morale -= 10;
    say(b, `${side.name} has lost its commander.`, f.side, true);
  }
  const swing = (f.champion ? 11 : 5) * (f.side === 0 ? -1 : 1);
  b.momentum = clamp(b.momentum + swing, -100, 100);
  b.sides[f.side].morale = clamp(b.sides[f.side].morale - (f.champion ? 14 : 6), 0, 100);
  say(b, `${f.name} ${dies ? 'is killed' : 'goes down'}${by ? ` to ${by.name}` : ''}.`, f.side, f.champion || dies);
}

/** One exchange between two fighters. */
function exchange(b: Battle, r: Rng, a: Fighter, c: Fighter, world: World | undefined, deathRisk: number) {
  const ra = effective(b, a, c, world) + r.gauss() * 3;
  const rc = effective(b, c, a, world) + r.gauss() * 3;
  const d = ra - rc;
  if (Math.abs(d) < 1.5) return;
  const [w, l] = d > 0 ? [a, c] : [c, a];
  l.hp -= Math.abs(d) > 6 ? 2 : 1;
  w.rating += 0.25; l.rating -= 0.15;
  b.momentum = clamp(b.momentum + (w.side === 0 ? 1 : -1), -100, 100);
  if (l.hp <= 0) fall(b, r, l, w, deathRisk);
  else if (r.chance(0.35)) say(b, `${line(r, b.theatre, w.name, l.name)}.`, w.side);
}

const VERBS: Record<Theatre, string[]> = {
  surface: ['{a} drives {b} back', '{a} breaks {b}\'s guard', '{a} hammers {b} into the mud', '{a} splits {b}\'s shield'],
  atmo: ['{a} outflies {b}', '{a} clips {b}\'s wing', '{a} forces {b} down through the cloud', '{a} cuts across {b}'],
  space: ['{a} rakes {b}\'s hull', '{a} brackets {b} with fire', '{a} outguns {b}', '{a} holes {b}\'s plating'],
  station: ['{a} catches {b} in a corridor', '{a} ambushes {b} at a hatch', '{a} drives {b} back through a bulkhead', '{a} corners {b}'],
  ship: ['{a} beats {b} back', '{a} drives {b} along the gangway', '{a} disarms {b}', '{a} pins {b} against a bulkhead'],
};
const line = (r: Rng, th: Theatre, a: string, b: string) => r.pick(VERBS[th]).replace('{a}', a).replace('{b}', b);

/** The commander's view of the odds, through their own eyes: a better commander reads it truer. */
function readOdds(b: Battle, r: Rng, side: 0 | 1, mine: Fighter, theirs: Fighter): number {
  const noise = (16 - b.sides[side].commander.skill) * 0.25;
  return effective(b, mine, theirs) - effective(b, theirs, mine) + r.gauss() * Math.max(0.5, noise);
}

function obeys(b: Battle, r: Rng, world: World | undefined, f: Fighter): boolean {
  const cmd = b.sides[f.side].commander;
  let p = 0.6 + (f.discipline - 10) * 0.04 + (cmd.lead - 10) * 0.02;
  if (world && f.id && cmd.id) { const bar = barsOf(world, f.id, cmd.id); p += bar.like / 250 - bar.dislike / 150; }
  return r.chance(clamp(p, 0.25, 0.98));
}

// ---------------------------------------------------------------- orders

export type OrderKind = 'press' | 'hold' | 'special' | 'duel' | 'target' | 'commit' | 'pullback' | 'breakoff';
export interface Order { kind: OrderKind; fighter?: string; foe?: string }

export const ORDER_LABEL: Record<OrderKind, string> = { press: 'Press the attack', hold: 'Hold and steady', special: '', duel: 'Call out their champion', target: 'Send after', commit: 'Commit the Caige', pullback: 'Pull back', breakoff: 'Break off' };

export function cannotOrder(b: Battle, side: 0 | 1, o: Order): string | null {
  if (b.status === 'over') return 'It is over';
  if (b.moment && side === 0 && o.kind !== 'breakoff') return 'Answer the moment first';
  const s = b.sides[side];
  if (o.kind !== 'breakoff' && s.orders <= 0) return `${s.commander.name} has no more orders to give`;
  const f = byKey(b, o.fighter);
  if (o.kind === 'target' || o.kind === 'commit' || o.kind === 'pullback') {
    if (!f || f.side !== side || (f.state !== 'ready' && f.state !== 'engaged')) return 'They are not in the fight';
  }
  if (o.kind === 'commit') { if (!f!.caige) return 'No Caige'; if (f!.burnt) return 'Burnt out'; if (f!.surge > 0) return 'Already surging'; }
  if (o.kind === 'target') { const foe = byKey(b, o.foe); if (!foe || foe.side === side || (foe.state !== 'ready' && foe.state !== 'engaged')) return 'Choose who to go after'; }
  if (o.kind === 'duel') {
    const mine = living(b, side).find((x) => x.champion);
    const theirs = living(b, (1 - side) as 0 | 1).find((x) => x.champion);
    if (!mine || !theirs) return 'No champions left to meet';
    if (b.raised.includes(`duel${side}`)) return 'Already called';
  }
  return null;
}

/** Give an order. Spends one of the commander's; the fighter may not obey. */
export function giveOrder(b: Battle, side: 0 | 1, o: Order, world?: World): void {
  if (cannotOrder(b, side, o)) return;
  const r = new Rng(b.rng);
  const s = b.sides[side];
  const sign = side === 0 ? 1 : -1;
  const skill = s.commander.skill;
  if (o.kind !== 'breakoff') s.orders--;
  const f = byKey(b, o.fighter);
  switch (o.kind) {
    case 'press': s.stance = 'press'; s.stanceTicks = 3; say(b, `${s.commander.name}: "Forward!" ${s.name} presses the attack.`, side); break;
    case 'hold': s.stance = 'hold'; s.stanceTicks = 3; say(b, `${s.commander.name} steadies ${s.name}: hold, and let them come.`, side); break;
    case 'special': special(b, r, side, world); break;
    case 'duel': {
      b.raised.push(`duel${side}`);
      const mine = living(b, side).find((x) => x.champion)!;
      const theirs = living(b, (1 - side) as 0 | 1).find((x) => x.champion)!;
      championsDuel(b, r, mine, theirs, world, side);
      break;
    }
    case 'target': {
      const foe = byKey(b, o.foe)!;
      if (f!.hunts !== undefined && f!.hunts !== foe.key && !obeys(b, r, world, f!)) { say(b, `${f!.name} will not leave their own quarrel.`, side); break; }
      // Getting to them: past whoever stands in the way.
      const guard = living(b, foe.side).filter((x) => x.key !== foe.key).reduce((t, x) => t + x.agility, 0) / Math.max(1, living(b, foe.side).length - 1);
      if (f!.agility + r.gauss() * 3 >= guard - 1 || living(b, foe.side).length === 1) {
        release(b, f!); if (foe.state === 'engaged') release(b, foe);
        engage(b, f!, foe); f!.state = 'engaged'; foe.state = 'engaged'; foe.foe = f!.key;
        say(b, `${f!.name} cuts through to ${foe.name}.`, side, true);
        exchange(b, r, f!, foe, world, deathRiskOf(b));
      } else { f!.hp -= 1; say(b, `${f!.name} is turned back short of ${foe.name}, bleeding.`, side); if (f!.hp <= 0) fall(b, r, f!, undefined, deathRiskOf(b)); }
      break;
    }
    case 'commit': {
      if (!obeys(b, r, world, f!) && f!.discipline < 9) { say(b, `${f!.name} hesitates to wake the Caige.`, side); break; }
      f!.surge = 3 + Math.floor(f!.control / 7);
      b.momentum = clamp(b.momentum + 6 * sign, -100, 100);
      say(b, `${f!.name}'s Caige wakes. The air around them bends.`, side, true);
      break;
    }
    case 'pullback': {
      if (f!.hunts && !obeys(b, r, world, f!)) { say(b, `${f!.name} ignores the order: they have someone to kill.`, side, true); break; }
      release(b, f!); f!.state = 'pulled'; b.momentum = clamp(b.momentum - 3 * sign, -100, 100);
      say(b, `${f!.name} falls back out of the fight.`, side);
      break;
    }
    case 'breakoff': {
      const clean = r.chance(clamp(0.4 + (skill - 10) * 0.05, 0.15, 0.9));
      s.mass *= clean ? 0.9 : 0.7;
      end(b, (1 - side) as 0 | 1, `${s.name} broke off${clean ? ' in good order' : ', badly'}.`, true);
      break;
    }
  }
  b.rng = r.state as Battle['rng'];
}

function special(b: Battle, r: Rng, side: 0 | 1, world?: World) {
  const s = b.sides[side]; const o = b.sides[1 - side]!;
  const sign = side === 0 ? 1 : -1;
  const k = s.commander.skill / 12;
  switch (THEATRES[b.theatre].special.id) {
    case 'highground': s.buff = 1 + 0.25 * k; s.buffTicks = 4; say(b, `${s.name} takes the high ground.`, side, true); break;
    case 'intercept': { const hit = r.chance(clamp(0.45 + (s.commander.skill - o.commander.skill) * 0.05, 0.15, 0.9)); if (hit) { o.mass *= 0.82; b.momentum = clamp(b.momentum + 10 * sign, -100, 100); say(b, `${s.name} catches ${o.name} mid-drop.`, side, true); } else say(b, `The intercept misses: ${o.name} lands clean.`, side); break; }
    case 'ram': s.mass *= 0.85; o.mass *= 0.72; b.momentum = clamp(b.momentum + 16 * sign, -100, 100); say(b, `${s.name} rams. Both hulls scream.`, side, true); for (const f of living(b, side)) if (r.chance(0.15)) { f.hp -= 1; if (f.hp <= 0) fall(b, r, f, undefined, deathRiskOf(b)); } break;
    case 'vent': s.mass *= 0.8; o.mass *= 0.7; b.momentum = clamp(b.momentum + 20 * sign, -100, 100); say(b, `${s.commander.name} vents the section. Nobody in it will be found.`, side, true); b.raised.push(`vented${side}`); break;
    case 'bridge': {
      const lead = living(b, side).sort((x, y) => effective(b, y, undefined, world) - effective(b, x, undefined, world))[0];
      const at = living(b, (1 - side) as 0 | 1).sort((x, y) => effective(b, y, undefined, world) - effective(b, x, undefined, world))[0];
      if (!lead || !at) break;
      say(b, `${lead.name} leads the rush for the bridge.`, side, true);
      for (let i = 0; i < 3 && lead.hp > 0 && at.hp > 0; i++) exchange(b, r, lead, at, world, deathRiskOf(b));
      if (at.hp <= 0) { b.momentum = clamp(b.momentum + 30 * sign, -100, 100); o.morale -= 20; say(b, `${s.name} takes the bridge.`, side, true); }
      break;
    }
  }
}

function championsDuel(b: Battle, r: Rng, a: Fighter, c: Fighter, world: World | undefined, side: 0 | 1) {
  say(b, `${a.name} and ${c.name} meet between the lines. Everything stops to watch.`, side, true);
  release(b, a); release(b, c);
  for (let i = 0; i < 6 && a.hp > 0 && c.hp > 0; i++) exchange(b, r, a, c, world, deathRiskOf(b) * 1.5);
  const winner = a.hp > 0 && c.hp <= 0 ? a : c.hp > 0 && a.hp <= 0 ? c : undefined;
  if (winner) {
    const sign = winner.side === 0 ? 1 : -1;
    b.momentum = clamp(b.momentum + 18 * sign, -100, 100);
    b.sides[1 - winner.side]!.morale -= 12;
    winner.rating += 1;
    winner.deeds.push('won the champions\' duel');
    say(b, `${winner.name} wins the duel.`, winner.side, true);
  } else say(b, 'Neither yields; the lines close again.', side);
}

function deathRiskOf(b: Battle): number {
  return b.kind === 'crucible' ? 0.03 : b.kind === 'hunt' ? 0.04 : 0.08;
}

function end(b: Battle, winner: 0 | 1, text: string, brokeOff = false) {
  b.status = 'over';
  delete b.moment;
  for (const f of b.fighters) if (f.state === 'engaged') { f.state = 'ready'; delete f.foe; }
  b.result = { winner, text, brokeOff };
  say(b, text, winner, true);
}

// ---------------------------------------------------------------- moments

function raise(b: Battle, key: string, m: Moment) {
  b.raised.push(key);
  b.moment = m;
}

/** A turning point that asks our commander (and the Highroy, if watching). */
function checkMoments(b: Battle) {
  if (b.moment || b.status === 'over') return;
  const ours = living(b, 0);
  const theirs = living(b, 1);
  const theirChamp = theirs.find((f) => f.champion);
  const myChamp = ours.find((f) => f.champion);
  if (theirChamp && myChamp && b.tick >= 2 && !b.raised.includes('challenge') && !b.raised.includes('duel0') && !b.raised.includes('duel1')) {
    raise(b, 'challenge', { kind: 'challenge', who: myChamp.key, foe: theirChamp.key, text: `${theirChamp.name} steps out of the line and calls for ${myChamp.name}.`, options: [{ key: 'accept', label: `Send ${myChamp.name}`, hint: 'the duel swings the battle' }, { key: 'decline', label: 'Refuse the challenge', hint: 'morale suffers' }] });
    return;
  }
  for (const f of ours) {
    if (f.caige && !f.burnt && f.surge === 0 && f.hp <= 3 && !b.raised.includes(`surge${f.key}`)) {
      raise(b, `surge${f.key}`, { kind: 'surge', who: f.key, text: `${f.name} is hurt. Their Caige is humming to be let loose.`, options: [{ key: 'commit', label: 'Let it loose', hint: `sync ${f.sync}, control ${f.control}: power, and the risk of burning out` }, { key: 'hold', label: 'Hold it back' }] });
      return;
    }
  }
  for (const f of ours) {
    if (f.hp <= 1 && !b.raised.includes(`hurt${f.key}`)) {
      raise(b, `hurt${f.key}`, { kind: 'wounded', who: f.key, text: `${f.name} is badly hurt and still fighting.`, options: [{ key: 'pull', label: 'Pull them out', hint: 'safe; the line weakens' }, { key: 'stay', label: 'Let them fight on' }] });
      return;
    }
  }
  for (const f of ours) {
    const foe = f.hunts ? theirs.find((x) => x.key === f.hunts || x.id === f.hunts) : undefined;
    if (foe && !b.raised.includes(`nem${f.key}`)) {
      raise(b, `nem${f.key}`, { kind: 'nemesis', who: f.key, foe: foe.key, text: `${f.name} has seen ${foe.name} across the field: the one they have a score with.`, options: [{ key: 'let', label: 'Let them go', hint: 'they fight harder for it' }, { key: 'call', label: 'Call them back', hint: 'they may not listen' }] });
      return;
    }
  }
  if (b.momentum <= -55 && !b.raised.includes('break')) {
    raise(b, 'break', { kind: 'break', text: `${b.sides[0].name} is breaking. ${b.sides[0].commander.name} looks for the word.`, options: [{ key: 'hold', label: 'Hold the line', hint: 'their nerve against it' }, { key: 'sacrifice', label: 'Sacrifice the rearguard', hint: 'buys the moment, at a price' }, { key: 'breakoff', label: 'Break off', hint: 'lose, and save who we can' }] });
  }
}

export function answerMoment(b: Battle, key: string, world?: World): void {
  const m = b.moment;
  if (!m) return;
  const r = new Rng(b.rng);
  delete b.moment;
  const f = byKey(b, m.who);
  const foe = byKey(b, m.foe);
  switch (m.kind) {
    case 'challenge':
      if (key === 'accept' && f && foe) championsDuel(b, r, f, foe, world, 0);
      else { b.sides[0].morale -= 10; b.momentum = clamp(b.momentum - 8, -100, 100); say(b, `${b.sides[0].name} will not answer the challenge. Jeers from across the field.`, 1); }
      break;
    case 'surge':
      if (key === 'commit' && f) { f.surge = 3 + Math.floor(f.control / 7); b.momentum = clamp(b.momentum + 6, -100, 100); say(b, `${f.name}'s Caige wakes.`, 0, true); }
      break;
    case 'wounded':
      if (key === 'pull' && f) { release(b, f); f.state = 'pulled'; b.momentum = clamp(b.momentum - 3, -100, 100); say(b, `${f.name} is carried back.`, 0); }
      break;
    case 'nemesis':
      if (f && foe) {
        if (key === 'call' && obeys(b, r, world, f)) { f.hunts = undefined; say(b, `${f.name} answers the call and holds their place.`, 0); }
        else { release(b, f); if (foe.state === 'engaged') release(b, foe); engage(b, f, foe); f.power *= 1.08; say(b, `${f.name} goes for ${foe.name}.`, 0, true); }
      }
      break;
    case 'break':
      if (key === 'breakoff') { giveOrder(b, 0, { kind: 'breakoff' }, world); return; }
      if (key === 'sacrifice') { b.sides[0].mass *= 0.7; b.momentum = clamp(b.momentum + 30, -100, 100); b.raised.push('sacrificed'); say(b, 'The rearguard turns and holds. They are not seen again.', 0, true); }
      else { const nerve = b.sides[0].morale / 100 + (b.sides[0].commander.lead - 10) * 0.04; if (r.chance(clamp(nerve, 0.1, 0.9))) { b.momentum = clamp(b.momentum + 12, -100, 100); say(b, `${b.sides[0].commander.name} holds them. The line steadies.`, 0, true); } else { b.sides[0].morale -= 15; say(b, 'The line wavers and gives ground.', 1); } }
      break;
  }
  b.rng = r.state as Battle['rng'];
}

/** How a commander answers a moment when the Highroy is not there to: as well as they read it. */
function autoMoment(b: Battle, r: Rng, world?: World): string {
  const m = b.moment!;
  const f = byKey(b, m.who); const foe = byKey(b, m.foe);
  switch (m.kind) {
    case 'challenge': return f && foe && readOdds(b, r, 0, f, foe) > -0.5 ? 'accept' : 'decline';
    case 'surge': return f && f.sync + f.control >= 22 ? 'commit' : 'hold';
    case 'wounded': return b.sides[0].commander.skill >= 11 ? 'pull' : 'stay';
    case 'nemesis': return 'let';
    case 'break': return b.sides[0].commander.skill >= 13 ? 'breakoff' : 'hold';
  }
  void world;
  return m.options[0]!.key;
}

/** Their commander's orders: sharper commanders use them better. */
function aiOrders(b: Battle, r: Rng, side: 0 | 1, world?: World) {
  const s = b.sides[side];
  if (s.orders <= 0 || b.status === 'over') return;
  const mom = side === 0 ? b.momentum : -b.momentum;
  const sharp = s.commander.skill / 20;
  if (!r.chance(0.25 + sharp * 0.4)) return;
  const mine = living(b, side);
  // A Caige held back while losing.
  const bearer = mine.find((f) => f.caige && !f.burnt && f.surge === 0 && f.state === 'engaged');
  if (bearer && (mom < 0 || r.chance(sharp * 0.5))) return giveOrder(b, side, { kind: 'commit', fighter: bearer.key }, world);
  if (mom < -30 && r.chance(0.5)) return giveOrder(b, side, { kind: 'special' }, world);
  if (side === 1 && !cannotOrder(b, side, { kind: 'duel' }) && b.tick >= 3 && r.chance(0.3)) {
    const mc = mine.find((f) => f.champion)!; const tc = living(b, 0).find((f) => f.champion)!;
    if (readOdds(b, r, 1, mc, tc) > 0.5) return giveOrder(b, side, { kind: 'duel' }, world);
  }
  if (mom < 10) return giveOrder(b, side, { kind: 'press' }, world);
  if (mom > 50 && r.chance(0.4)) return giveOrder(b, side, { kind: 'hold' }, world);
}

/** One tick of the battle. Stops on a moment if someone is commanding. */
export function tickBattle(b: Battle, world?: World): void {
  if (b.status === 'over' || b.moment) return;
  const r = new Rng(b.rng);
  b.status = 'live';
  b.tick++;
  const risk = deathRiskOf(b);
  // The mass of each side: troops, guns, crew.
  const strength = (i: 0 | 1) => {
    const s = b.sides[i];
    const st = s.stance === 'press' ? 1.3 : s.stance === 'hold' ? 0.85 : 1;
    return Math.max(1, s.mass) * (0.75 + s.commander.skill / 40) * st * s.buff * (0.5 + s.morale / 200);
  };
  const s0 = strength(0); const s1 = strength(1);
  const swing = ((s0 - s1) / (s0 + s1)) * 6 + r.gauss() * 2;
  b.momentum = clamp(b.momentum + swing, -100, 100);
  for (const i of [0, 1] as const) {
    const s = b.sides[i]; const o = i === 0 ? s1 : s0; const me = i === 0 ? s0 : s1;
    const loss = 0.035 * (o / (me + o)) * (s.stance === 'press' ? 1.4 : s.stance === 'hold' ? 0.6 : 1);
    s.mass = Math.max(0, s.mass * (1 - loss));
    if (s.stanceTicks > 0 && --s.stanceTicks === 0) s.stance = null;
    if (s.buffTicks > 0 && --s.buffTicks === 0) s.buff = 1;
  }
  if (b.sides[0].stance === 'hold') b.momentum *= 0.95;
  // The fighters find each other and fight.
  for (const f of b.fighters.filter((x) => x.state === 'ready')) {
    if (f.state !== 'ready') continue;
    const foe = pickFoe(b, r, f);
    if (foe) engage(b, f, foe);
  }
  const done = new Set<string>();
  for (const f of b.fighters.filter((x) => x.state === 'engaged')) {
    if (f.state !== 'engaged') continue; // fell earlier this tick
    const foe = byKey(b, f.foe);
    if (!foe || (foe.state !== 'engaged' && foe.state !== 'ready')) { f.state = 'ready'; delete f.foe; continue; }
    const pair = [f.key, foe.key].sort().join('|');
    if (done.has(pair)) continue;
    done.add(pair);
    exchange(b, r, f, foe, world, risk);
  }
  // Caiges: power, and the danger of it.
  for (const f of b.fighters) {
    if (f.surge <= 0) continue;
    if (f.state !== 'ready' && f.state !== 'engaged') { f.surge = 0; continue; }
    f.surge--;
    const burn = clamp(0.15 - (f.sync + f.control - 20) * 0.015, 0.03, 0.4);
    if (r.chance(burn)) {
      f.surge = 0; f.burnt = true; f.hp -= 1;
      b.momentum = clamp(b.momentum + (f.side === 0 ? -8 : 8), -100, 100);
      say(b, `${f.name}'s Caige turns on them. They burn out.`, f.side, true);
      if (f.hp <= 0) fall(b, r, f, undefined, risk);
    } else if (f.state === 'engaged') f.rating += 0.2;
  }
  // A side with no one left standing breaks fast.
  for (const i of [0, 1] as const) if (!living(b, i).length && b.fighters.some((f) => f.side === i)) { b.momentum += i === 0 ? -9 : 9; b.sides[i].morale -= 6; }
  b.momentum = clamp(b.momentum, -100, 100);
  for (const i of [0, 1] as const) { const mom = i === 0 ? b.momentum : -b.momentum; b.sides[i].morale = clamp(b.sides[i].morale + (mom > 20 ? 1.5 : mom < -20 ? -2.5 : 0), 0, 100); }
  if (b.tick % 3 === 0) say(b, b.momentum > 25 ? `${b.sides[0].name} is gaining ground.` : b.momentum < -25 ? `${b.sides[1].name} is pushing us back.` : 'The fighting hangs in the balance.');
  aiOrders(b, r, 1, world);
  if (!b.commanded) aiOrders(b, r, 0, world);
  b.rng = r.state as Battle['rng'];
  // The end: one side broken, or out of fighters and men, or time.
  const broken = (i: 0 | 1) => b.sides[i].morale <= 0 || (b.sides[i].mass < b.sides[i].massMax * 0.15 && !living(b, i).length);
  if (b.momentum >= 100 || broken(1)) return end(b, 0, `${b.sides[0].name} carries the day.`);
  if (b.momentum <= -100 || broken(0)) return end(b, 1, `${b.sides[1].name} carries the day.`);
  if (b.tick >= b.maxTicks) return end(b, b.momentum >= 0 ? 0 : 1, `${b.sides[b.momentum >= 0 ? 0 : 1].name} holds the field when the fighting stops.`);
  checkMoments(b);
  if (b.moment && !b.commanded) { const r2 = new Rng(b.rng); const k = autoMoment(b, r2, world); b.rng = r2.state as Battle['rng']; answerMoment(b, k, world); }
}

/** Play the rest of it out, with the commanders deciding. */
export function runOut(b: Battle, world?: World): void {
  b.commanded = false;
  for (let i = 0; i < 60 && b.status !== 'over'; i++) {
    if (b.moment) { const r = new Rng(b.rng); const k = autoMoment(b, r, world); b.rng = r.state as Battle['rng']; answerMoment(b, k, world); }
    tickBattle(b, world);
  }
}

/** How each of ours came out of it. */
export function outcomes(b: Battle): { key: string; id?: string; name: string; side: 0 | 1; fate: 'fine' | 'hurt' | 'down' | 'dead'; rating: number; deeds: string[] }[] {
  return b.fighters.map((f) => ({
    key: f.key, id: f.id, name: f.name, side: f.side, rating: Math.round(clamp(f.rating, 1, 10) * 10) / 10, deeds: f.deeds,
    fate: f.state === 'dead' ? 'dead' : f.state === 'down' ? 'down' : f.hp < 3 || f.burnt ? 'hurt' : 'fine',
  }));
}

export { living as livingFighters };

// ---------------------------------------------------------------- player actions (pure)

function onBattle(input: World, id: string, fn: (b: Battle, w: World) => void): World {
  const w = structuredClone(input);
  const b = battleOf(w, id);
  if (b) fn(b, w);
  return w;
}
/** Take command: moments wait for the Highroy, and our commander gives no orders of their own. */
export const commandBattle = (input: World, id: string) => onBattle(input, id, (b) => { b.commanded = true; if (b.status === 'ready') b.status = 'live'; });
export const stepBattle = (input: World, id: string) => onBattle(input, id, (b, w) => tickBattle(b, w));
export const orderBattle = (input: World, id: string, o: Order) => onBattle(input, id, (b, w) => giveOrder(b, 0, o, w));
export const answerBattleMoment = (input: World, id: string, key: string) => onBattle(input, id, (b, w) => answerMoment(b, key, w));
/** Leave it to the commander: fought out now. */
export const fightItOut = (input: World, id: string) => onBattle(input, id, (b, w) => runOut(b, w));

/**
 * What a battle did to our people, applied once: the dead are dead, the downed are wounded, scores settled.
 * Hunts and the Crucible settle their own; arcs and others use this.
 */
export function applyFates(world: World, b: Battle): void {
  if (b.applied) return;
  b.applied = true;
  for (const f of b.fighters) {
    const c = f.id ? world.characters[f.id] : undefined;
    if (!c?.alive) continue;
    if (f.state === 'dead') { killHere(world, c, world.date, `killed: ${b.title}`); continue; }
    if (f.state === 'down' && !c.flags.some((x) => x.id === 'wounded')) c.flags.push({ id: 'wounded', since: world.date, until: addCycles(world.date, 32) });
    // A score settled: the one they hunted went down.
    if (f.hunts) {
      const foe = b.fighters.find((x) => x.key === f.hunts || x.id === f.hunts);
      if (foe && (foe.state === 'down' || foe.state === 'dead')) for (const t of world.story?.threads ?? []) if (!t.closed && t.personId === c.id && t.kind === 'grudge' && t.about === (foe.id ?? foe.key)) t.closed = world.date;
    }
  }
}
