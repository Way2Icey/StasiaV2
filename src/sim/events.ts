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
import { logRecord } from './records';
import { absoluteCycle, addCycles, CYCLES_PER_PHASE } from './time';
import { RESOURCE_LABEL, type Good } from '../data/economy';
import type { Character, Mission, Sector, StatId, World } from './types';
import { addThread, ensureStory, type Act, type ArcRun, type Struggle, type ThreadKind } from './storystate';

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
  /** The arc this is a stage of. */
  arcId?: string;
  /** The struggle this is a turning point of. */
  struggleId?: string;
  /** Freezes the clock until answered. */
  urgent?: boolean;
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
  /** How many times each event has fired, all told: the commoner it has been, the rarer it gets. */
  fired?: Record<string, number>;
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
  /** The arc this stage belongs to, if any. */
  arc?: ArcRun;
  /** The struggle this is a turning point of, if any. */
  struggle?: Struggle;
  /** Scratch space an option's resolve can leave for its `then`. */
  memo?: Record<string, string>;
}

export interface Check {
  who: (c: Ctx) => Character | undefined;
  stats: StatId[];
  dc: number;
  /** An opposed check: set against this person's stats instead of a fixed difficulty. */
  vs?: (c: Ctx) => Character | undefined;
  vsStats?: StatId[];
}

/** What an option leads to: the next stage of the arc, some cycles on. */
export interface Next { next: string; after: number; cast?: ArcRun['cast']; data?: Record<string, string | number> }

export interface EventOption {
  label: string;
  hint?: string;
  check?: Check;
  /** Why this option can't be taken, or null. */
  available?: (c: Ctx) => string | null;
  resolve: (c: Ctx, passed: boolean) => void;
  /** Carries the story on: the stage that follows, or null to end it here. */
  then?: (c: Ctx, passed: boolean) => Next | null;
  /** How the arc ends if it ends on this option. */
  ending?: string;
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
  /** Only ever comes as a stage of an arc, never on its own. */
  stage?: boolean;
  /** Stops the clock until answered. */
  urgent?: boolean;
  /** How long it waits before the council settles it, in cycles. */
  life?: number;
  /** When the storyteller likes it best. */
  act?: Act;
  /** Names the arc it starts, when it starts one. */
  arc?: string;
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
  /** Leave something hanging on a person for a later story to pick up. */
  thread(c: Character | undefined, kind: ThreadKind, text: string, about?: string) {
    if (!c) return this;
    addThread(this.w, c.id, kind, text, about);
    return this;
  }
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

/** The odds of a check: against a fixed difficulty, or against a named person (two rolls, so a wider spread). */
export function checkChance(ctx: Ctx, check: Check): number {
  if (check.vs) return phi((checkValue(check.who(ctx), check.stats) - checkValue(check.vs(ctx), check.vsStats ?? check.stats)) / (SPREAD * Math.SQRT2));
  return phi((checkValue(check.who(ctx), check.stats) - check.dc) / SPREAD);
}

/** Odds from what we know: our side exact, theirs as a range. Returns the lowest and highest chance. */
export function checkBand(ctx: Ctx, check: Check, theirs: [number, number] | null): [number, number] {
  if (!check.vs || !theirs) { const p = checkChance(ctx, check); return [p, p]; }
  const mine = checkValue(check.who(ctx), check.stats);
  const f = (v: number) => phi((mine - v) / (SPREAD * Math.SQRT2));
  return [f(theirs[1]), f(theirs[0])];
}

export { SPREAD as CHECK_SPREAD };

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
    arc: p.arcId ? world.story?.arcs.find((a) => a.id === p.arcId) : undefined,
    struggle: p.struggleId ? world.story?.struggles.find((x) => x.id === p.struggleId) : undefined,
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
export function registerEvents(defs: EventDef[]): void { DEFS = [...defs, ...DEFS.filter((d) => !defs.some((x) => x.id === d.id))]; }
/** Add more definitions (arcs, struggles) alongside the rest. */
export function addEvents(defs: EventDef[]): void { DEFS = [...DEFS.filter((d) => !defs.some((x) => x.id === d.id)), ...defs]; }
export function eventDef(id: string): EventDef | undefined { return DEFS.find((d) => d.id === id); }

function place(world: World, def: EventDef, holder: Partial<PendingEvent>, life: number, arcId?: string): PendingEvent {
  const ev = world.events;
  const fresh = makeCtx(world, new Rng(world.rng), holder);
  if (arcId) fresh.arc = world.story?.arcs.find((a) => a.id === arcId);
  const p: PendingEvent = {
    ...holder,
    id: `e${world.nextId++}`,
    defId: def.id,
    date: world.date,
    expires: addCycles(world.date, def.life ?? life),
    text: def.text(fresh),
    ...(arcId ? { arcId } : {}),
    ...(def.urgent ? { urgent: true } : {}),
  };
  ev.pending.push(p);
  ev.recent.unshift(def.id);
  ev.recent = ev.recent.slice(0, 14);
  (ev.fired ??= {})[def.id] = (ev.fired[def.id] ?? 0) + 1;
  if (world.story) world.story.quiet = 0;
  return p;
}

/** Fire one event of this trigger, weighted, preferring what suits the storyteller's act. */
export function fire(world: World, rng: Rng, trigger: EventTrigger, seed: Partial<PendingEvent>, life: number, act?: Act): boolean {
  const ev = world.events;
  const candidates = DEFS.filter((d) => d.trigger === trigger && !d.stage && !ev.recent.includes(d.id));
  const pool = [...candidates];
  for (let tries = 0; tries < 6 && pool.length; tries++) {
    // What has happened often grows rarer: the same quarrel every year stops being news.
    const fired = ev.fired ?? {};
    const def = rng.weighted(pool.map((d) => [d, (d.weight * (act && d.act === act ? 2.5 : act && d.act && d.act !== act ? 0.4 : 1)) / (1 + (fired[d.id] ?? 0) * 0.6)] as [EventDef, number]));
    pool.splice(pool.indexOf(def), 1);
    const holder: Partial<PendingEvent> = { ...seed };
    const ctx = makeCtx(world, rng, seed);
    ctx.set = holder;
    if (!def.setup(ctx)) continue;
    const p = place(world, def, holder, life);
    if (def.arc) startArc(world, p, def.arc);
    return true;
  }
  return false;
}

/** Fire a named event directly: the next stage of an arc, or a struggle's turning point. */
export function fireStage(world: World, rng: Rng, defId: string, seed: Partial<PendingEvent>, arcId?: string): PendingEvent | null {
  const def = eventDef(defId);
  if (!def) return null;
  const holder: Partial<PendingEvent> = { ...seed };
  const ctx = makeCtx(world, rng, seed);
  ctx.set = holder;
  if (arcId) ctx.arc = world.story?.arcs.find((a) => a.id === arcId);
  if (!def.setup(ctx)) return null;
  const p = place(world, def, holder, CYCLES_PER_PHASE, arcId);
  if (!arcId && def.arc) startArc(world, p, def.arc);
  return p;
}

function castOf(p: Partial<PendingEvent>) {
  const c: ArcRun['cast'] = {};
  if (p.personId) c.personId = p.personId;
  if (p.secondId) c.secondId = p.secondId;
  if (p.otherHouseId) c.otherHouseId = p.otherHouseId;
  if (p.sectorId) c.sectorId = p.sectorId;
  if (p.missionId) c.missionId = p.missionId;
  return c;
}

function startArc(world: World, p: PendingEvent, title: string): ArcRun {
  ensureStory(world);
  const run: ArcRun = { id: `arc${world.nextId++}`, title, cast: castOf(p), stages: [], open: true };
  world.story!.arcs.unshift(run);
  world.story!.arcs = world.story!.arcs.filter((a, i) => a.open || i < 40);
  p.arcId = run.id;
  return run;
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
  // At home: the storyteller decides when (see story.ts).
  void phaseTurned;
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
    const vs = use.check.vs?.(ctx);
    const bar = use.check.vs ? checkValue(vs, use.check.vsStats ?? use.check.stats) + rng.gauss() * SPREAD : use.check.dc;
    passed = checkValue(who, use.check.stats) + rng.gauss() * SPREAD >= bar;
    ctx.fx.say(`${who ? shortName(who.name) : 'Our people'} ${passed ? (vs ? `get the better of ${shortName(vs.name)}` : 'succeed') : (vs ? `are bested by ${shortName(vs.name)}` : 'fail')}`);
  }
  use.resolve(ctx, passed);
  // The story goes on, or ends here.
  let run = ctx.arc ?? (p.arcId ? world.story?.arcs.find((a) => a.id === p.arcId) : undefined);
  const nx = use.then?.(ctx, passed) ?? null;
  // An event that leads somewhere becomes an arc the moment it does.
  if (!run && nx) run = startArc(world, p, def.arc ?? def.title);
  if (run) {
    run.stages.push({ date: world.date, title: def.title, choice: use.label, lines: [...ctx.fx.lines], byCouncil: choice === null });
    Object.assign(run.cast, castOf(p));
    if (nx?.cast) Object.assign(run.cast, nx.cast);
    if (nx?.data) run.data = { ...(run.data ?? {}), ...nx.data };
    if (nx && eventDef(nx.next)) run.next = { defId: nx.next, at: addCycles(world.date, Math.max(1, nx.after)) };
    else { run.open = false; delete run.next; run.ending = use.ending ?? `${use.label}.`; }
  }
  const r: ResolvedEvent = {
    id: p.id, defId: def.id, title: def.title, date: world.date, choice: use.label, byCouncil: choice === null,
    lines: ctx.fx.lines, missionId: p.missionId,
  };
  ev.log.unshift(r);
  ev.log = ev.log.slice(0, 40);
  const m = p.missionId ? world.missions[p.missionId] : undefined;
  if (m) m.log.push({ date: world.date, text: `${def.title}: ${use.label.toLowerCase()}. ${ctx.fx.lines.join('; ')}.` });
  const who: { id: string; part: string }[] = [];
  if (ctx.leader) who.push({ id: ctx.leader.id, part: 'mission leader' });
  if (ctx.person && ctx.person.id !== ctx.leader?.id) who.push({ id: ctx.person.id, part: 'at the heart of it' });
  if (ctx.second) who.push({ id: ctx.second.id, part: 'also involved' });
  logRecord(world, {
    kind: 'council', type: 'decision',
    severity: ctx.fx.lines.some((l) => l.includes('wounded')) ? 2 : 1,
    text: `${def.title}: ${choice === null ? 'left to the council, who chose to' : 'we chose to'} ${use.label.toLowerCase()}.`,
    detail: p.text, effects: ctx.fx.lines, who, missionId: p.missionId,
    placeId: p.sectorId ?? (m ? m.targetSectorId ?? m.targetPlanetId : undefined),
    houseIds: p.otherHouseId ? [p.otherHouseId] : undefined,
    source: m ? `${ctx.leader ? ctx.leader.name.given : 'the party'}'s report` : 'the court',
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
