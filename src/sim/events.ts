// Events: moments that ask the Highroy for a decision. They fire during
// missions (on the road and at the target) and at home, wait in the Throne
// Room, and settle with the chosen option. Left unanswered, the council
// settles them with a cautious default when they lapse.
import { Rng } from './rng';
import { displayName, shortName } from './names';
import { findSector, seatHolder } from './query';
import { learn } from './knowledge';
import { shiftRelation } from './relations';
import { shiftMood } from './mood';
import { econ } from './economy';
import { absoluteCycle, addCycles, CYCLES_PER_PHASE } from './time';
import { RESOURCE_LABEL, type Good } from '../data/economy';
import type { Character, Mission, Sector, StatId, World } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ---------------------------------------------------------------- shapes

export type EventTrigger = 'travel' | 'arrival' | 'home';

export interface PendingEvent {
  id: string;
  defId: string;
  date: World['date'];
  expires: World['date'];
  missionId?: string;
  personId?: string;
  /** A second person, for events between two people. */
  secondId?: string;
  otherHouseId?: string;
  sectorId?: string;
  text: string;
}

export interface ResolvedEvent {
  id: string;
  defId: string;
  title: string;
  date: World['date'];
  choice: string;
  byCouncil: boolean;
  lines: string[];
  missionId?: string;
}

export interface EventState {
  pending: PendingEvent[];
  log: ResolvedEvent[];
  /** Ids of recently fired events, to keep them from repeating. */
  recent: string[];
}

export interface Ctx {
  world: World;
  rng: Rng;
  house: string;
  m?: Mission;
  leader?: Character;
  party: Character[];
  person?: Character;
  second?: Character;
  other?: string;
  sector?: Sector;
  fx: Fx;
  /** While an event is being set up: who and where it is about. */
  set?: Partial<PendingEvent>;
}

export interface Check {
  who: (c: Ctx) => Character | undefined;
  stats: StatId[];
  dc: number;
}

export interface EventOption {
  label: string;
  hint?: string;
  check?: Check;
  /** Why this option can't be taken, or null. */
  available?: (c: Ctx) => string | null;
  resolve: (c: Ctx, passed: boolean) => void;
}

export interface EventDef {
  id: string;
  title: string;
  category: string;
  trigger: EventTrigger;
  weight: number;
  /** Fill in who and where; return false if the event doesn't fit right now. */
  setup: (c: Ctx) => boolean;
  text: (c: Ctx) => string;
  options: EventOption[];
  /** The option the council takes if the Highroy says nothing. */
  fallback: number;
}

// ---------------------------------------------------------------- effects

/** Effects that change the world and say what they did. */
export class Fx {
  lines: string[] = [];
  constructor(private c: Omit<Ctx, 'fx'>) {}
  private get w() { return this.c.world; }
  say(text: string) { this.lines.push(text); return this; }
  othes(n: number) {
    if (!n) return this;
    const e = econ(this.w, this.c.house);
    e.stock.othes += n;
    e.recent.unshift({ resource: 'othes', amount: n, label: 'A decision', kind: 'trade', date: this.w.date });
    e.recent = e.recent.slice(0, 40);
    return this.say(`${n > 0 ? '+' : '−'}${Math.abs(n).toLocaleString('en-US')} othes`);
  }
  good(g: Good, n: number) {
    if (!n) return this;
    const e = econ(this.w, this.c.house);
    e.stock[g] = Math.max(0, e.stock[g] + n);
    return this.say(`${n > 0 ? '+' : '−'}${Math.abs(n)} ${RESOURCE_LABEL[g].toLowerCase()}`);
  }
  regard(houseId: string | undefined, n: number) {
    if (!houseId || !n || !this.w.houses[houseId]) return this;
    shiftRelation(this.w, houseId, this.c.house, n);
    return this.say(`House ${this.w.houses[houseId]!.name}'s regard ${n > 0 ? '+' : '−'}${Math.abs(n)}`);
  }
  private standing(key: 'honour' | 'respect' | 'dread', n: number) {
    if (!n) return this;
    const st = this.w.houses[this.c.house]!.standing;
    st[key] = clamp(st[key] + n, 0, 100);
    return this.say(`${key[0]!.toUpperCase()}${key.slice(1)} ${n > 0 ? '+' : '−'}${Math.abs(n)}`);
  }
  honour(n: number) { return this.standing('honour', n); }
  respect(n: number) { return this.standing('respect', n); }
  dread(n: number) { return this.standing('dread', n); }
  mood(c: Character | undefined, n: number) {
    if (!c || !n) return this;
    shiftMood(c, n);
    return this.say(`${shortName(c.name)} mood ${n > 0 ? '+' : '−'}${Math.abs(n)}`);
  }
  moodAll(cs: Character[], n: number, who: string) {
    if (!cs.length || !n) return this;
    for (const c of cs) shiftMood(c, n);
    return this.say(`${who} mood ${n > 0 ? '+' : '−'}${Math.abs(n)}`);
  }
  wound(c: Character | undefined) {
    if (!c) return this;
    c.flags.push({ id: 'wounded', since: this.w.date, until: addCycles(this.w.date, CYCLES_PER_PHASE * 2) });
    return this.say(`${shortName(c.name)} is wounded`);
  }
  stat(c: Character | undefined, s: StatId, n: number) {
    if (!c || !n) return this;
    c.stats[s] = clamp(c.stats[s] + n, 1, 20);
    return this.say(`${shortName(c.name)} ${s} ${n > 0 ? '+' : '−'}${Math.abs(n)}`);
  }
  unrest(s: Sector | undefined, n: number) {
    if (!s || !n) return this;
    s.unrest = clamp(s.unrest + n, 0, 100);
    return this.say(`Unrest in ${s.name} ${n > 0 ? '+' : '−'}${Math.abs(n)}`);
  }
  progress(n: number) {
    const m = this.c.m;
    if (!m || m.stage === 'done' || !n) return this;
    m.progress = Math.max(0, m.progress + n);
    return this.say(n > 0 ? 'The mission gains ground' : 'The mission loses ground');
  }
  delay(cycles: number) {
    const m = this.c.m;
    if (!m || m.stage === 'done' || !cycles) return this;
    m.stageEnds = addCycles(m.stageEnds, cycles);
    return this.say(`Delayed ${cycles} cycles`);
  }
  noticed() {
    const m = this.c.m;
    if (!m || m.stage === 'done' || m.kind === 'envoy' || m.noticed) return this;
    m.noticed = true;
    m.leaderKnowsNoticed = true;
    return this.say('Our people have been noticed');
  }
  learnHouse(houseId: string | undefined, n: number, councilOnly = true) {
    if (!houseId) return this;
    for (const c of Object.values(this.w.characters)) {
      if (c.alive && c.houseId === houseId && (councilOnly ? !!c.seat : c.tier === 'full')) learn(this.w, this.c.house, c.id, n);
    }
    return this.say(`We learn more of House ${this.w.houses[houseId]?.name}${councilOnly ? "'s council" : ''}`);
  }
  learnOf(c: Character | undefined, n: number) {
    if (!c) return this;
    learn(this.w, this.c.house, c.id, n);
    return this.say(`We learn more of ${shortName(c.name)}`);
  }
}

// ---------------------------------------------------------------- checks

/** Normal CDF, close enough for odds shown to the player. */
function phi(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

const SPREAD = 3;

export function checkValue(c: Character | undefined, stats: StatId[]): number {
  if (!c) return 5;
  const base = stats.reduce((s, x) => s + c.stats[x], 0) / stats.length;
  return base + (c.flags.some((f) => f.id === 'counselled') ? 1 : 0);
}

export function checkChance(ctx: Ctx, check: Check): number {
  return phi((checkValue(check.who(ctx), check.stats) - check.dc) / SPREAD);
}

export function oddsWord(p: number): string {
  if (p >= 0.85) return 'almost certain';
  if (p >= 0.65) return 'likely';
  if (p >= 0.4) return 'even';
  if (p >= 0.2) return 'unlikely';
  return 'a long shot';
}

// ---------------------------------------------------------------- context

export function ensureEvents(world: World): void {
  world.events ??= { pending: [], log: [], recent: [] };
}

function baseCtx(world: World, rng: Rng, p: Partial<PendingEvent>): Omit<Ctx, 'fx'> {
  const house = world.playerHouseId;
  const m = p.missionId ? world.missions[p.missionId] : undefined;
  const party = m ? [m.leaderId, ...(m.companions ?? [])].map((id) => world.characters[id]).filter((c): c is Character => !!c?.alive) : [];
  return {
    world, rng, house, m, party,
    leader: m ? world.characters[m.leaderId] : undefined,
    person: p.personId ? world.characters[p.personId] : undefined,
    second: p.secondId ? world.characters[p.secondId] : undefined,
    other: p.otherHouseId,
    sector: p.sectorId ? findSector(world, p.sectorId)?.sector : undefined,
  };
}

export function makeCtx(world: World, rng: Rng, p: Partial<PendingEvent>): Ctx {
  const base = baseCtx(world, rng, p);
  const ctx = base as Ctx;
  ctx.fx = new Fx(base);
  return ctx;
}

// ---------------------------------------------------------------- firing

let DEFS: EventDef[] = [];
export function registerEvents(defs: EventDef[]): void { DEFS = defs; }
export function eventDef(id: string): EventDef | undefined { return DEFS.find((d) => d.id === id); }

function fire(world: World, rng: Rng, trigger: EventTrigger, seed: Partial<PendingEvent>, life: number): boolean {
  const ev = world.events;
  const candidates = DEFS.filter((d) => d.trigger === trigger && !ev.recent.includes(d.id));
  // Try a few in weighted order until one fits.
  const pool = [...candidates];
  for (let tries = 0; tries < 6 && pool.length; tries++) {
    const def = rng.weighted(pool.map((d) => [d, d.weight] as [EventDef, number]));
    pool.splice(pool.indexOf(def), 1);
    const holder: Partial<PendingEvent> = { ...seed };
    const ctx = makeCtx(world, rng, seed);
    ctx.set = holder;
    if (!def.setup(ctx)) continue;
    const fresh = makeCtx(world, rng, holder);
    const p: PendingEvent = {
      ...holder,
      id: `e${world.nextId++}`,
      defId: def.id,
      date: world.date,
      expires: addCycles(world.date, life),
      text: def.text(fresh),
    };
    ev.pending.push(p);
    ev.recent.unshift(def.id);
    ev.recent = ev.recent.slice(0, 14);
    return true;
  }
  return false;
}

/** Choose who/where an event is about, from inside `setup`. */
export function choose(c: Ctx, set: Partial<Pick<PendingEvent, 'personId' | 'secondId' | 'otherHouseId' | 'sectorId'>>): true {
  if (c.set) Object.assign(c.set, set);
  if (set.personId) c.person = c.world.characters[set.personId];
  if (set.secondId) c.second = c.world.characters[set.secondId];
  if (set.otherHouseId) c.other = set.otherHouseId;
  if (set.sectorId) c.sector = findSector(c.world, set.sectorId)?.sector;
  return true;
}

/** Once a turn: maybe fire events, and let lapsed ones fall to the council. */
export function advanceEvents(world: World, rng: Rng, phaseTurned: boolean): void {
  ensureEvents(world);
  const ev = world.events;
  const P = world.playerHouseId;
  // Lapsed decisions: the council takes the cautious road.
  const now = absoluteCycle(world.date);
  for (const p of [...ev.pending]) {
    const m = p.missionId ? world.missions[p.missionId] : undefined;
    if (absoluteCycle(p.expires) <= now || (m && m.stage === 'done')) settle(world, rng, p.id, null);
  }
  // On the road and at the target.
  for (const m of Object.values(world.missions)) {
    if (m.houseId !== P || m.stage === 'done' || ev.pending.some((x) => x.missionId === m.id)) continue;
    if (m.stage === 'travel' && rng.chance(0.08)) fire(world, rng, 'travel', { missionId: m.id }, 8);
    else if (m.stage === 'task' && rng.chance(0.09)) fire(world, rng, 'arrival', { missionId: m.id }, 6);
  }
  // At home, now and then.
  const homePending = ev.pending.filter((x) => !x.missionId).length;
  if (phaseTurned && homePending < 3 && rng.chance(0.5)) fire(world, rng, 'home', {}, CYCLES_PER_PHASE);
}

/** Answer an event (option index), or let the council settle it (null). */
export function settle(world: World, rng: Rng, eventId: string, choice: number | null): ResolvedEvent | null {
  const ev = world.events;
  const p = ev.pending.find((x) => x.id === eventId);
  if (!p) return null;
  const def = eventDef(p.defId);
  ev.pending = ev.pending.filter((x) => x.id !== eventId);
  if (!def) return null;
  const idx = choice ?? def.fallback;
  const ctx = makeCtx(world, rng, p);
  const opt = def.options[idx]!;
  const why = opt.available?.(ctx);
  const use = why ? def.options[def.fallback]! : opt;
  let passed = true;
  if (use.check) {
    const who = use.check.who(ctx);
    passed = checkValue(who, use.check.stats) + rng.gauss() * SPREAD >= use.check.dc;
    ctx.fx.say(`${who ? shortName(who.name) : 'Our people'} ${passed ? 'succeed' : 'fail'}`);
  }
  use.resolve(ctx, passed);
  const r: ResolvedEvent = {
    id: p.id, defId: def.id, title: def.title, date: world.date, choice: use.label, byCouncil: choice === null,
    lines: ctx.fx.lines, missionId: p.missionId,
  };
  ev.log.unshift(r);
  ev.log = ev.log.slice(0, 40);
  const m = p.missionId ? world.missions[p.missionId] : undefined;
  if (m) m.log.push({ date: world.date, text: `${def.title}: ${use.label.toLowerCase()}. ${ctx.fx.lines.join('; ')}.` });
  world.feed.push({
    date: world.date, kind: 'council',
    text: `${def.title}: ${choice === null ? 'left to the council, who chose to' : 'we chose to'} ${use.label.toLowerCase()}. ${ctx.fx.lines.join('; ')}.`,
    characterIds: ctx.person ? [ctx.person.id] : ctx.leader ? [ctx.leader.id] : undefined,
    missionId: p.missionId,
  });
  return r;
}

/** Player action (pure). */
export function answerEvent(input: World, eventId: string, choice: number): World {
  const world = structuredClone(input);
  const rng = new Rng(world.rng);
  settle(world, rng, eventId, choice);
  world.rng = rng.state;
  return world;
}

// Helpers for definitions.
export const who = {
  leader: (c: Ctx) => c.leader,
  best: (stats: StatId[]) => (c: Ctx) => [...c.party].sort((a, b) => checkValue(b, stats) - checkValue(a, stats))[0],
  seat: (seat: NonNullable<Character['seat']>) => (c: Ctx) => seatHolder(c.world, c.house, seat),
  person: (c: Ctx) => c.person,
};

export function personName(c: Ctx): string {
  return c.person ? displayName(c.person.name) : 'someone';
}
