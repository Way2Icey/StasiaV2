// Ambitions: what people want out of life, and what they do when they don't get it.
// Everyone of note wants something: a seat, a ship, glory, love, a fortune, the wide Reaches.
// Wants that go unmet sour into resentment; ours come to the Highroy in audience, and the Highroy must answer.
import { rivalsFrom, sting } from './grounds';
import { award, tally, titlesOf } from './careers';
import { Rng } from './rng';
import { displayName, shortName } from './names';
import { ageOf, focusForSeat, ROLE_FOCUS } from './characters';
import { SPECIES } from '../data/species';
import { econ, record } from './economy';
import { logRecord } from './records';
import { seatHolder } from './query';
import { isAway } from './court';
import { shiftMood } from './mood';
import { bondOf, opinion, setBond, shiftBoth, shiftOpinion, tiesOf } from './relationships';
import { relation, shiftRelation } from './relations';
import { kill } from './death';
import { SEAT_TITLE } from './world';
import { absoluteCycle, addCycles, CYCLES_PER_ORBIT, CYCLES_PER_PHASE, type GameDate } from './time';
import type { Character, CouncilSeat, World } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const H = (w: World, id: string) => `House ${w.houses[id]?.name ?? id}`;

export type AmbitionKind = 'seat' | 'captain' | 'knight' | 'glory' | 'love' | 'fortune' | 'abroad' | 'mastery' | 'revenge';

export interface Ambition {
  kind: AmbitionKind;
  /** The seat wanted, the person loved or hated. */
  target?: string;
  since: GameDate;
  /** 0..100: how much it gnaws at them. */
  frustration: number;
  /** For glory: deeds done so far. */
  deeds?: number;
  /** The Highroy promised it, to be kept by this date. */
  promised?: GameDate;
  /** Whether our house knows what they want. */
  known?: boolean;
  /** When they last came to the Highroy about it. */
  asked?: GameDate;
  /** When they last acted on their own out of resentment. */
  sulked?: GameDate;
}

export interface Audience {
  id: string;
  characterId: string;
  kind: AmbitionKind;
  target?: string;
  text: string;
  expires: GameDate;
}

export interface AmbitionsState {
  of: Record<string, Ambition>;
  audiences: Audience[];
  /** Record ids the Highroy has put aside on the desk. */
  seen: string[];
  /** The last Phase the Highroy held an audience of their own choosing. */
  heldAudience?: GameDate;
  /** Fulfilled ambitions, for the record. */
  done: Record<string, number>;
  /** The last want each person had met, so they want something new next. */
  last?: Record<string, { kind: AmbitionKind; target?: string; date: GameDate }>;
  /**
   * Will: the hidden reserve everyone builds before they act on what they want.
   * It fills a little each Phase (faster for the ambitious, the disciplined, the born leader,
   * and for whoever is gnawed at), and acting (coming to the Highroy, scheming, leaving) spends it all.
   */
  will?: Record<string, number>;
}

/** Will needed before someone acts on their want. */
export const WILL_TO_ACT = 100;

/** How much will someone gathers in a Phase. */
export function willRate(c: Character, frustration = 0): number {
  return 0.5 + c.hidden.ambition / 8 + (c.stats.discipline + c.stats.leadership) / 40 + frustration / 50;
}

export function willOf(world: World, id: string): number {
  return world.ambitions?.will?.[id] ?? 0;
}

/** Ready to act: their will is full. */
function ready(world: World, c: Character): boolean {
  return willOf(world, c.id) >= WILL_TO_ACT;
}

function spendWill(world: World, c: Character): void {
  (world.ambitions.will ??= {})[c.id] = 0;
}

const COUNCIL: CouncilSeat[] = ['grandMaster', 'envoy', 'spymaster', 'steward', 'physician', 'elder', 'champion'];

export function seatTitle(s: string): string { return SEAT_TITLE[s as CouncilSeat] ?? s; }

/** How someone would put their ambition. */
export function ambitionText(world: World, a: Ambition): string {
  const who = a.target ? world.characters[a.target] : undefined;
  switch (a.kind) {
    case 'seat': return `wants to be ${seatTitle(a.target ?? '')}`;
    case 'captain': return 'wants to captain a great ship';
    case 'knight': return 'wants to be knighted';
    case 'glory': return 'wants a life of glory';
    case 'love': return who ? `loves ${displayName(who.name)}` : 'wants to be loved';
    case 'fortune': return 'wants a fortune of their own';
    case 'abroad': return 'wants to see the Reaches';
    case 'mastery': return 'wants to master their craft';
    case 'revenge': return who ? `wants to see ${displayName(who.name)} brought low` : 'wants revenge';
  }
}

export const AMBITION_LABEL: Record<AmbitionKind, string> = {
  seat: 'A seat', captain: 'A command', knight: 'Knighthood', glory: 'Glory', love: 'Love', fortune: 'A fortune', abroad: 'The Reaches', mastery: 'Mastery', revenge: 'Revenge',
};

const adult = (w: World, c: Character) => ageOf(c, w.date) >= SPECIES[c.species].adulthood;

function seatFit(c: Character, seat: CouncilSeat): number {
  const stats = ROLE_FOCUS[focusForSeat(seat)] ?? [];
  return stats.length ? stats.reduce((n, k) => n + c.stats[k], 0) / stats.length : 0;
}

/** Who matters enough to want things on the page. */
function notable(w: World, c: Character): boolean {
  return c.alive && c.tier === 'full' && c.seat !== 'highroy' && ageOf(c, w.date) >= SPECIES[c.species].adulthood * 0.6;
}

/** Choose what someone wants, from who they are. */
function chooseAmbition(w: World, rng: Rng, c: Character): Ambition | null {
  const options: [Ambition, number][] = [];
  const amb = c.hidden.ambition;
  const isAdult = adult(w, c);
  if (isAdult) {
    for (const s of COUNCIL) {
      if (c.seat === s) continue;
      const fit = seatFit(c, s);
      if (fit >= 11) options.push([{ kind: 'seat', target: s, since: w.date, frustration: 0 }, (fit - 9) * (amb / 8)]);
    }
    if (c.stats.fleetCommand + c.stats.leadership >= 22 && !Object.values(w.fleet?.ships ?? {}).some((s) => s.captainId === c.id)) options.push([{ kind: 'captain', since: w.date, frustration: 0 }, 2 + amb / 5]);
    if (c.role !== 'Knight' && !c.seat && c.stats.duelling + c.stats.valor >= 20) options.push([{ kind: 'knight', since: w.date, frustration: 0 }, 2.5]);
    options.push([{ kind: 'glory', since: w.date, frustration: 0, deeds: 0 }, c.stats.valor / 6 + (c.role === 'Knight' ? 1.5 : 0)]);
    options.push([{ kind: 'fortune', since: w.date, frustration: 0 }, c.hidden.greed / 6]);
    options.push([{ kind: 'abroad', since: w.date, frustration: 0 }, (20 - c.hidden.loyalty) / 10 + c.stats.diplomacy / 12]);
  }
  options.push([{ kind: 'mastery', since: w.date, frustration: 0 }, c.stats.intellect / 7 + (isAdult ? 0 : 1.5)]);
  // The heart: someone they already like a great deal.
  const crush = tiesOf(w, c.id).filter((t) => t.out > 40 && !t.bond && w.characters[t.other]?.alive && notable(w, w.characters[t.other]!) && adult(w, w.characters[t.other]!)).sort((a, b) => b.out - a.out)[0];
  if (crush && isAdult) options.push([{ kind: 'love', target: crush.other, since: w.date, frustration: 0 }, 3]);
  const foe = tiesOf(w, c.id).filter((t) => (t.bond === 'rival' || t.bond === 'feud') && w.characters[t.other]?.alive && w.characters[t.other]!.houseId === c.houseId).sort((a, b) => a.out - b.out)[0];
  if (foe) options.push([{ kind: 'revenge', target: foe.other, since: w.date, frustration: 0 }, 2 + (20 - c.hidden.temperament) / 6]);
  // Not the same want they just had satisfied.
  const last = w.ambitions?.last?.[c.id];
  const fresh = last && absoluteCycle(w.date) - absoluteCycle(last.date) < CYCLES_PER_ORBIT * 6 ? options.filter(([o]) => o.kind !== last.kind) : options;
  if (!fresh.length) return null;
  return rng.weighted(fresh);
}

export function ensureAmbitions(world: World): void {
  if (world.ambitions?.of) { world.ambitions.done ??= {}; world.ambitions.seen ??= []; world.ambitions.will ??= {}; return; }
  world.ambitions = { of: {}, audiences: [], seen: [], done: {}, will: {} };
  const rng = new Rng(world.rng);
  for (const c of Object.values(world.characters)) {
    if (!notable(world, c)) continue;
    const a = chooseAmbition(world, rng, c);
    if (a) { a.frustration = Math.round(rng.next() * 50); world.ambitions.of[c.id] = a; }
  }
  world.rng = rng.state;
}

export function ambitionOf(world: World, id: string): Ambition | undefined {
  return world.ambitions?.of[id];
}

/** Is the ambition met? */
function fulfilled(w: World, c: Character, a: Ambition): boolean {
  switch (a.kind) {
    case 'seat': return c.seat === a.target;
    case 'captain': return Object.values(w.fleet?.ships ?? {}).some((s) => s.captainId === c.id && !s.lost);
    case 'knight': return c.role === 'Knight';
    case 'glory': return (a.deeds ?? 0) >= 3;
    case 'love': return !!a.target && ['lover', 'spouse'].includes(bondOf(w, c.id, a.target) ?? '');
    case 'fortune': return false; // only by a grant
    case 'abroad': return c.flags.some((f) => (f.id === 'posted' && /ambassador/.test(f.detail ?? '')) || f.id === 'ward');
    case 'mastery': return (a.deeds ?? 0) >= 3;
    case 'revenge': return !!a.target && (!w.characters[a.target]?.alive || w.characters[a.target]!.houseId !== c.houseId || (a.deeds ?? 0) >= 1);
  }
}

/** Is it blocked by someone? Who stands in the way. */
export function blocker(w: World, c: Character, a: Ambition): Character | undefined {
  if (a.kind === 'seat' && a.target) return seatHolder(w, c.houseId, a.target as CouncilSeat);
  if (a.kind === 'revenge' && a.target) return w.characters[a.target];
  return undefined;
}

// ---------------------------------------------------------------- what happens when they get it

function satisfy(w: World, c: Character, a: Ambition, how: string) {
  delete w.ambitions.of[c.id];
  (w.ambitions.last ??= {})[c.id] = { kind: a.kind, target: a.target, date: w.date };
  w.ambitions.done[c.id] = (w.ambitions.done[c.id] ?? 0) + 1;
  shiftMood(c, 15);
  const lord = w.houses[c.houseId]?.rulerId;
  if (lord) shiftOpinion(w, c.id, lord, 20, `gave them what they wanted`);
  c.hidden.loyalty = clamp(c.hidden.loyalty + 1, 1, 20);
  if (c.houseId === w.playerHouseId) {
    logRecord(w, {
      kind: 'world', type: 'world', severity: 2,
      text: `${displayName(c.name)} has what they wanted: ${how}.`,
      detail: 'They are happier, and more loyal to the Highroy for it. In time they will want something else.',
      who: [{ id: c.id, part: 'fulfilled' }], effects: ['Mood +15', 'Loyalty +1', 'Opinion of the Highroy +20'],
    });
  }
}

/** Deeds toward glory, from missions and fights. */
export function addGlory(w: World, id: string, deeds = 1): void {
  const a = w.ambitions?.of[id];
  if (a && (a.kind === 'glory' || a.kind === 'mastery')) a.deeds = (a.deeds ?? 0) + deeds;
}

// ---------------------------------------------------------------- the Highroy's answers

export type Answer = 'grant' | 'promise' | 'refuse' | 'forbid' | 'reconcile';

export interface AnswerOption { id: Answer; label: string; note: string; disabled?: string }

/** What the Highroy can say to one audience. */
export function optionsFor(w: World, au: Audience): AnswerOption[] {
  const c = w.characters[au.characterId];
  if (!c) return [];
  const holder = au.kind === 'seat' ? seatHolder(w, c.houseId, au.target as CouncilSeat) : undefined;
  const target = au.target ? w.characters[au.target] : undefined;
  const freeShip = Object.values(w.fleet?.ships ?? {}).find((s) => s.houseId === c.houseId && !s.lost && !s.ready && !s.captainId);
  const anyShip = Object.values(w.fleet?.ships ?? {}).find((s) => s.houseId === c.houseId && !s.lost && !s.ready);
  const othes = econ(w, w.playerHouseId).stock.othes;
  const promise: AnswerOption = { id: 'promise', label: 'Promise it in time', note: 'They will wait two Orbits. Break the promise and they will not forget.' };
  const refuse: AnswerOption = { id: 'refuse', label: 'Refuse', note: 'They take it badly: opinion of the Highroy falls, and it gnaws at them.' };
  switch (au.kind) {
    case 'seat': return [
      { id: 'grant', label: holder ? `Name them ${seatTitle(au.target!)}, dismissing ${shortName(holder.name)}` : `Name them ${seatTitle(au.target!)}`, note: holder ? `${shortName(holder.name)} will be bitter, and may become their rival.` : 'The seat is empty; nobody is hurt by it.' },
      promise, refuse];
    case 'captain': return [
      { id: 'grant', label: freeShip ? `Give them the ${freeShip.name}` : anyShip ? `Give them the ${anyShip.name}, replacing its captain` : 'Give them a ship', note: freeShip ? 'The ship has no captain.' : 'The old captain will resent it.', disabled: anyShip ? undefined : 'We have no great ship to give' },
      promise, refuse];
    case 'knight': return [
      { id: 'grant', label: 'Knight them (300 othes)', note: 'A ceremony in the hall. They join the knights.', disabled: othes < 300 ? 'Not enough othes' : undefined },
      promise, refuse];
    case 'glory': return [
      { id: 'grant', label: 'Send them where the fighting is', note: 'Corsair hunts and the pits. Most come back with a name; some come back hurt; a few do not come back.' },
      refuse];
    case 'fortune': return [
      { id: 'grant', label: 'Settle 1,000 othes on them', note: 'Bought loyalty is still loyalty.', disabled: othes < 1000 ? 'Not enough othes' : undefined },
      promise, refuse];
    case 'abroad': return [
      { id: 'grant', label: 'Send them abroad', note: 'As our ambassador where the post is empty, or on a long journey otherwise.' },
      refuse];
    case 'mastery': return [
      { id: 'grant', label: 'Pay for a year of study (400 othes)', note: 'They come back better at what they do.', disabled: othes < 400 ? 'Not enough othes' : undefined },
      refuse];
    case 'love': return [
      { id: 'grant', label: `Bless the match with ${target ? shortName(target.name) : 'them'}`, note: 'If the other is willing, they marry; if not, a broken heart.' },
      { id: 'forbid', label: 'Forbid it', note: 'They may obey. They may not.' }];
    case 'revenge': return [
      { id: 'grant', label: `Let them call out ${target ? shortName(target.name) : 'their enemy'}`, note: 'A duel at dawn. Someone is hurt; someone may die.' },
      { id: 'reconcile', label: 'Make them reconcile', note: 'The Highroy sits them down together. It may hold.' },
      { id: 'forbid', label: 'Forbid it', note: 'It will fester.' }];
  }
}

function setSeat(w: World, c: Character, seat: CouncilSeat) {
  const old = seatHolder(w, c.houseId, seat);
  if (c.seat && c.seat !== 'highroy') { /* leaving their old seat empty */ c.seat = undefined; }
  if (old) {
    old.seat = undefined;
    old.role = `Former ${seatTitle(seat)}`;
    shiftMood(old, -20);
    const lord = w.houses[c.houseId]?.rulerId;
    if (lord) shiftOpinion(w, old.id, lord, -30, `took away their seat`);
    shiftOpinion(w, old.id, c.id, -35, `took their seat`);
    w.ambitions.of[old.id] = { kind: 'seat', target: seat, since: w.date, frustration: 50, known: true };
  }
  c.seat = seat;
  c.role = seatTitle(seat);
}

export function answerAudience(input: World, audienceId: string, answer: Answer): World {
  const w = structuredClone(input);
  ensureAmbitions(w);
  const au = w.ambitions.audiences.find((x) => x.id === audienceId);
  if (!au) return w;
  const opt = optionsFor(w, au).find((o) => o.id === answer);
  if (!opt || opt.disabled) throw new Error(opt?.disabled ?? 'Not possible');
  w.ambitions.audiences = w.ambitions.audiences.filter((x) => x.id !== audienceId);
  const c = w.characters[au.characterId];
  const a = c ? w.ambitions.of[c.id] : undefined;
  if (!c || !a) return w;
  const rng = new Rng(w.rng);
  const P = w.playerHouseId;
  const lord = w.houses[P]?.rulerId;
  const who = [{ id: c.id, part: 'asked' }, ...(lord ? [{ id: lord, part: 'answered' }] : [])];
  a.known = true;
  if (answer === 'promise') {
    a.promised = addCycles(w.date, CYCLES_PER_ORBIT * 2);
    a.frustration = Math.max(0, a.frustration - 30);
    if (lord) shiftOpinion(w, c.id, lord, 6, 'promised them');
    logRecord(w, { kind: 'world', type: 'decision', severity: 1, text: `The Highroy promises ${displayName(c.name)} that in time they will have what they want: ${ambitionText(w, a).replace(/^wants /, '')}.`, who, effects: ['Kept within two Orbits, or broken'] });
  } else if (answer === 'refuse' || answer === 'forbid') {
    a.frustration = clamp(a.frustration + 20, 0, 100);
    if (lord) shiftOpinion(w, c.id, lord, -15, `refused them`);
    shiftMood(c, -8);
    let extra = '';
    if (au.kind === 'love' && a.target && rng.chance(0.35 + (20 - c.hidden.loyalty) / 60)) {
      setBond(w, c.id, a.target, 'lover', 'lover', 'met in secret');
      extra = ' They went to each other anyway, in secret.';
    }
    logRecord(w, { kind: 'world', type: 'decision', severity: 1, text: `The Highroy ${answer === 'forbid' ? 'forbids' : 'refuses'} ${displayName(c.name)}, who ${ambitionText(w, a)}.${extra}`, who, effects: ['Opinion of the Highroy −15', 'Frustration +20'] });
  } else if (answer === 'reconcile' && a.target) {
    const t = w.characters[a.target];
    const ok = rng.chance(0.45 + (c.hidden.temperament - 10) / 40);
    if (t) shiftBoth(w, c.id, t.id, ok ? 35 : -10, ok ? 'made to make peace by the Highroy' : 'a peace that did not take');
    if (ok) { delete w.ambitions.of[c.id]; if (t) setBond(w, c.id, t.id, undefined, undefined, 'reconciled'); }
    logRecord(w, { kind: 'world', type: 'decision', severity: 2, text: ok ? `${displayName(c.name)} and ${t ? displayName(t.name) : 'their enemy'} clasp hands before the Highroy. For now, it holds.` : `The Highroy sat ${displayName(c.name)} and ${t ? displayName(t.name) : 'their enemy'} down together. It did not take.`, who: [...who, ...(t ? [{ id: t.id, part: 'the other' }] : [])] });
  } else {
    grant(w, rng, c, a, au);
  }
  w.rng = rng.state;
  return w;
}

function grant(w: World, rng: Rng, c: Character, a: Ambition, au: Audience) {
  const P = w.playerHouseId;
  switch (au.kind) {
    case 'seat': setSeat(w, c, au.target as CouncilSeat); satisfy(w, c, a, `named ${seatTitle(au.target!)}`); break;
    case 'captain': {
      const ship = Object.values(w.fleet.ships).find((s) => s.houseId === c.houseId && !s.lost && !s.ready && !s.captainId)
        ?? Object.values(w.fleet.ships).find((s) => s.houseId === c.houseId && !s.lost && !s.ready);
      if (!ship) return;
      const old = ship.captainId ? w.characters[ship.captainId] : undefined;
      if (old) { old.flags = old.flags.filter((f) => f.id !== 'aboard'); shiftOpinion(w, old.id, c.id, -25, `took their ship`); shiftMood(old, -12); }
      ship.captainId = c.id;
      ship.crewMood = clamp(ship.crewMood + (c.stats.leadership - 10), 0, 100);
      satisfy(w, c, a, `command of the ${ship.name}`);
      break;
    }
    case 'knight':
      record(w, P, { resource: 'othes', amount: -300, label: `Knighting of ${shortName(c.name)}`, kind: 'court' });
      c.role = 'Knight';
      satisfy(w, c, a, 'knighted in the hall');
      break;
    case 'fortune':
      record(w, P, { resource: 'othes', amount: -1000, label: `Settled on ${shortName(c.name)}`, kind: 'court' });
      satisfy(w, c, a, 'a fortune settled on them');
      break;
    case 'mastery':
      record(w, P, { resource: 'othes', amount: -400, label: `A year of study for ${shortName(c.name)}`, kind: 'court' });
      for (const k of (Object.keys(c.stats) as (keyof typeof c.stats)[]).sort((x, y) => c.stats[y] - c.stats[x]).slice(0, 2)) c.stats[k] = clamp(c.stats[k] + 1, 1, 20);
      a.deeds = 3;
      satisfy(w, c, a, 'a year of study, and better for it');
      break;
    case 'abroad': {
      const post = Object.values(w.embassies ?? {}).find((e) => e.guest === P && !e.ambassadorId && relation(w, e.host, P) > -50);
      if (post && !c.seat) {
        post.ambassadorId = c.id;
        post.since = w.date;
        c.flags.push({ id: 'posted', since: w.date, detail: `ambassador to ${H(w, post.host)}` });
        satisfy(w, c, a, `the post of ambassador to ${H(w, post.host)}`);
      } else {
        c.flags.push({ id: 'travelling', since: w.date, until: addCycles(w.date, CYCLES_PER_ORBIT), detail: 'seeing the Reaches' });
        satisfy(w, c, a, 'a year on the lanes, seeing the Reaches');
      }
      break;
    }
    case 'glory': {
      const r = rng.next() + (c.stats.duelling + c.stats.valor - 20) / 40;
      if (r < 0.06) {
        kill(w, c, w.date, 'fell hunting corsairs, seeking glory');
        logRecord(w, { kind: 'world', type: 'fight', severity: 3, text: `${displayName(c.name)} went looking for glory and found the end of it. They fell in a corsair hunt beyond the Narrows.`, who: [{ id: c.id, part: 'fallen' }] });
        delete w.ambitions.of[c.id];
      } else if (r < 0.3) {
        c.flags.push({ id: 'wounded', since: w.date, until: addCycles(w.date, CYCLES_PER_PHASE * 3) });
        a.deeds = (a.deeds ?? 0) + 1;
        logRecord(w, { kind: 'world', type: 'fight', severity: 2, text: `${displayName(c.name)} came back from the pits bloodied but unbowed.`, who: [{ id: c.id, part: 'wounded' }], effects: ['Wounded', 'A deed toward glory'] });
      } else {
        a.deeds = (a.deeds ?? 0) + 2;
        const st = w.houses[P]!.standing;
        st.respect = clamp(st.respect + 1, 0, 100);
        st.dread = clamp(st.dread + 1, 0, 100);
        logRecord(w, { kind: 'world', type: 'fight', severity: 2, text: `${displayName(c.name)} has made a name in the pits and on the corsair lanes. The house's name grows with theirs.`, who: [{ id: c.id, part: 'champion of the day' }], effects: ['Respect +1', 'Dread +1', 'Two deeds toward glory'] });
        if (fulfilled(w, c, a)) satisfy(w, c, a, 'a name sung in the halls');
      }
      break;
    }
    case 'love': {
      const t = a.target ? w.characters[a.target] : undefined;
      if (!t?.alive) { delete w.ambitions.of[c.id]; return; }
      const willing = opinion(w, t.id, c.id) > 15 || rng.chance(0.25);
      if (willing) {
        setBond(w, c.id, t.id, 'spouse', 'spouse', 'married with the Highroy\'s blessing');
        satisfy(w, c, a, `marriage to ${displayName(t.name)}`);
        const tAmb = w.ambitions.of[t.id];
        if (tAmb?.kind === 'love' && tAmb.target === c.id) satisfy(w, t, tAmb, `marriage to ${displayName(c.name)}`);
      } else {
        shiftMood(c, -15);
        shiftOpinion(w, c.id, t.id, -10, 'turned them down');
        delete w.ambitions.of[c.id];
        logRecord(w, { kind: 'world', type: 'world', severity: 2, text: `With the Highroy's blessing, ${displayName(c.name)} asked for ${displayName(t.name)}'s hand, and was refused.`, who: [{ id: c.id, part: 'heartbroken' }, { id: t.id, part: 'refused' }], effects: ['Mood −15'] });
      }
      break;
    }
    case 'revenge': {
      const t = a.target ? w.characters[a.target] : undefined;
      if (!t?.alive) { delete w.ambitions.of[c.id]; return; }
      const roll = (c.stats.duelling + c.stats.reflexes) - (t.stats.duelling + t.stats.reflexes) + rng.gauss() * 6;
      const winner = roll >= 0 ? c : t;
      const loser = winner === c ? t : c;
      const dies = rng.chance(0.12);
      if (dies) kill(w, loser, w.date, `killed in a duel with ${displayName(winner.name)}`);
      else loser.flags.push({ id: 'wounded', since: w.date, until: addCycles(w.date, CYCLES_PER_PHASE * 3) });
      shiftBoth(w, c.id, t.id, -10, 'the duel');
      tally(w, c.id, 'duels'); tally(w, t.id, 'duels'); tally(w, winner.id, 'duelsWon');
      if (winner === c) { a.deeds = 1; satisfy(w, c, a, `${displayName(t.name)} beaten at dawn`); }
      else { a.frustration = clamp(a.frustration + 15, 0, 100); shiftMood(c, -10); }
      logRecord(w, {
        kind: 'world', type: 'fight', severity: dies ? 3 : 2,
        text: `At dawn ${displayName(c.name)} and ${displayName(t.name)} met with blades. ${displayName(winner.name)} won${dies ? `, and ${displayName(loser.name)} did not get up` : `; ${displayName(loser.name)} was carried off wounded`}.`,
        who: [{ id: winner.id, part: 'won' }, { id: loser.id, part: dies ? 'killed' : 'wounded' }],
      });
      break;
    }
  }
}

// ---------------------------------------------------------------- the Highroy's own audience

/** Once a Phase the Highroy can call someone in: they say what they want, and feel heard. */
export function cannotHoldAudience(world: World, id: string): string | null {
  const c = world.characters[id];
  if (!c?.alive || c.houseId !== world.playerHouseId) return 'Not one of ours';
  if (c.seat === 'highroy') return 'That is you';
  if (isAway(world, c.id)) return 'They are away';
  const last = world.ambitions?.heldAudience;
  if (last && absoluteCycle(world.date) - absoluteCycle(last) < CYCLES_PER_PHASE) return 'Once a Phase';
  return null;
}

export function holdAudience(input: World, id: string): World {
  const w = structuredClone(input);
  ensureAmbitions(w);
  const why = cannotHoldAudience(w, id);
  if (why) throw new Error(why);
  const c = w.characters[id]!;
  const lord = w.houses[w.playerHouseId]?.rulerId;
  w.ambitions.heldAudience = w.date;
  if (lord) shiftBoth(w, c.id, lord, 5, 'an audience with the Highroy');
  shiftMood(c, 4);
  const a = w.ambitions.of[c.id];
  if (a) {
    a.known = true;
    a.frustration = Math.max(0, a.frustration - 10);
    w.ambitions.audiences = w.ambitions.audiences.filter((x) => x.characterId !== c.id);
    w.ambitions.audiences.push({ id: `au${w.nextId++}`, characterId: c.id, kind: a.kind, target: a.target, text: requestText(w, c, a), expires: addCycles(w.date, CYCLES_PER_PHASE * 2) });
  } else {
    logRecord(w, { kind: 'world', type: 'world', severity: 0, text: `The Highroy sits a while with ${displayName(c.name)}. They want for nothing just now.`, who: [{ id: c.id, part: 'heard' }] });
  }
  return w;
}

function requestText(w: World, c: Character, a: Ambition): string {
  const t = a.target ? w.characters[a.target] : undefined;
  const n = shortName(c.name);
  switch (a.kind) {
    case 'seat': {
      const h = seatHolder(w, c.houseId, a.target as CouncilSeat);
      return h ? `${n} believes they would make a better ${seatTitle(a.target!)} than ${shortName(h.name)}, and asks for the seat.` : `${n} asks to be named ${seatTitle(a.target!)}. The seat stands empty.`;
    }
    case 'captain': return `${n} asks for command of one of the house's great ships.`;
    case 'knight': return `${n} kneels and asks to be made a knight of the house.`;
    case 'glory': return `${n} is tired of waiting at court. They ask to be sent where the fighting is.`;
    case 'fortune': return `${n} has served long and asks that something be settled on them.`;
    case 'abroad': return `${n} asks to be sent abroad, to see the Reaches.`;
    case 'mastery': return `${n} asks for a year to study and master their craft.`;
    case 'love': return `${n} asks the Highroy's blessing to marry ${t ? displayName(t.name) : 'the one they love'}.`;
    case 'revenge': return `${n} asks leave to call out ${t ? displayName(t.name) : 'their enemy'}. They say honour demands it.`;
  }
}

// ---------------------------------------------------------------- the passage of time

export function advanceAmbitions(world: World, rng: Rng, phaseTurned: boolean): void {
  ensureAmbitions(world);
  const now = absoluteCycle(world.date);
  const P = world.playerHouseId;
  // Unanswered audiences lapse: a quieter refusal.
  for (const au of [...world.ambitions.audiences]) {
    if (absoluteCycle(au.expires) > now && world.characters[au.characterId]?.alive) continue;
    world.ambitions.audiences = world.ambitions.audiences.filter((x) => x.id !== au.id);
    const a = world.ambitions.of[au.characterId];
    const c = world.characters[au.characterId];
    const lord = world.houses[P]?.rulerId;
    if (a && c?.alive) { a.frustration = clamp(a.frustration + 10, 0, 100); if (lord) shiftOpinion(world, c.id, lord, -8, 'kept waiting for an answer'); }
  }
  if (!phaseTurned) return;
  for (const c of Object.values(world.characters)) {
    if (!notable(world, c)) { if (!c.alive) delete world.ambitions.of[c.id]; continue; }
    let a = world.ambitions.of[c.id];
    if (!a) {
      // Someone who has had what they wanted rests a while before wanting again.
      if (!rng.chance(0.08)) continue;
      const fresh = chooseAmbition(world, rng, c);
      if (!fresh) continue;
      world.ambitions.of[c.id] = fresh;
      a = fresh;
    }
    if (fulfilled(world, c, a)) { satisfy(world, c, a, ambitionText(world, a).replace(/^wants (to )?/, '')); continue; }
    // Will gathers, every Phase, whether or not anyone sees it. Someone new starts partway.
    const wills = (world.ambitions.will ??= {});
    wills[c.id] = Math.min(WILL_TO_ACT, (wills[c.id] ?? (c.id.charCodeAt(c.id.length - 1) * 7) % 70) + willRate(c, a.frustration));
    // A broken promise.
    if (a.promised && absoluteCycle(a.promised) <= now) {
      a.promised = undefined;
      a.frustration = clamp(a.frustration + 40, 0, 100);
      const lord = world.houses[c.houseId]?.rulerId;
      if (lord) shiftOpinion(world, c.id, lord, -30, 'broke a promise to them');
      c.hidden.loyalty = clamp(c.hidden.loyalty - 2, 1, 20);
      if (c.houseId === P) logRecord(world, { kind: 'world', type: 'world', severity: 2, text: `${displayName(c.name)} was promised, and the promise was not kept. They have stopped waiting.`, who: [{ id: c.id, part: 'betrayed' }], effects: ['Opinion of the Highroy −30', 'Loyalty −2'] });
    }
    if (a.promised) continue;
    // It gnaws: faster for the ambitious, and when someone they dislike stands in the way.
    const b = blocker(world, c, a);
    const grate = b && b.id !== c.id ? Math.max(0, -opinion(world, c.id, b.id)) / 20 : 0;
    a.frustration = clamp(a.frustration + c.hidden.ambition / 9 + grate + rng.gauss(), 0, 100);
    if (c.houseId !== P) { if (ready(world, c)) otherHouse(world, rng, c, a); continue; }
    // They come to the Highroy.
    const lordFam = world.characters[world.houses[P]?.rulerId ?? '']?.familyId;
    const important = !!c.seat || c.role === 'Knight' || c.role === 'Heir' || c.familyId === lordFam || a.frustration >= 70;
    if (ready(world, c) && important && a.frustration >= 40 && a.frustration < 85 && world.ambitions.audiences.length < 3 && !isAway(world, c.id) && !world.ambitions.audiences.some((x) => x.characterId === c.id)) {
      a.asked = world.date;
      a.known = true;
      spendWill(world, c);
      world.ambitions.audiences.push({ id: `au${world.nextId++}`, characterId: c.id, kind: a.kind, target: a.target, text: requestText(world, c, a), expires: addCycles(world.date, CYCLES_PER_PHASE * 2) });
      if (world.ports) world.ports.alerts += 1;
    }
    // Or, past bearing, they act on their own.
    if (a.frustration >= 85 && ready(world, c)) { a.sulked = world.date; spendWill(world, c); actAlone(world, rng, c, a); }
  }
}

/** Ambition unmet past bearing. */
function actAlone(w: World, rng: Rng, c: Character, a: Ambition) {
  const P = w.playerHouseId;
  const b = blocker(w, c, a);
  const lord = w.houses[P]?.rulerId;
  const r = rng.next();
  if (b && b.id !== c.id && r < 0.45) {
    // Undermine whoever stands in the way.
    setBond(w, c.id, b.id, 'rival', 'rival', `stands between them and ${ambitionText(w, a).replace(/^wants (to )?/, '')}`);
    shiftOpinion(w, b.id, c.id, -20, 'whispers against them');
    if (b.seat) shiftMood(b, -6);
    a.frustration = 70;
    logRecord(w, { kind: 'intrigue', type: 'intrigue', severity: 2, text: `${displayName(c.name)} has begun working against ${displayName(b.name)} in the corridors. They want what ${shortName(b.name)} has.`, who: [{ id: c.id, part: 'scheming' }, { id: b.id, part: 'in the way' }] });
  } else if (r < 0.75 && c.hidden.loyalty < 12 && !c.seat) {
    // Leave for a house that will give them what they want.
    const to = Object.values(w.houses).filter((h) => h.id !== P).sort((x, y) => relation(w, y.id, P) - relation(w, x.id, P))[rng.next() < 0.5 ? 0 : Object.keys(w.houses).length - 2]!;
    if (!to) return;
    c.houseId = to.id;
    const fam = Object.values(w.families).find((f) => f.houseId === to.id && !f.ruling);
    if (fam) c.familyId = fam.id;
    const home = w.planets[to.capitalPlanetId]!;
    c.location = { planetId: home.id, sectorId: home.sectors[0]!.id };
    c.role = `Sworn to ${to.name}`;
    delete w.ambitions.of[c.id];
    w.ambitions.of[c.id] = { ...a, frustration: 10 };
    shiftRelation(w, P, to.id, -5);
    logRecord(w, { kind: 'intrigue', type: 'intrigue', severity: 3, text: `${displayName(c.name)} has left us for ${H(w, to.id)}. They were tired of waiting for what the Highroy would not give.`, who: [{ id: c.id, part: 'left the house' }], houseIds: [to.id], effects: ['Lost to the house'] });
  } else {
    // Sulk, and let it show.
    shiftMood(c, -10);
    if (lord) shiftOpinion(w, c.id, lord, -10, 'will not give them what they want');
    a.frustration = 75;
    logRecord(w, { kind: 'world', type: 'condition', severity: 1, text: `${displayName(c.name)} no longer hides how little they think of the Highroy's judgment.`, who: [{ id: c.id, part: 'resentful' }] });
  }
}

/** Other houses' people: their Highroy answers for them, more or less wisely. */
function otherHouse(w: World, rng: Rng, c: Character, a: Ambition) {
  const h = w.houses[c.houseId];
  if (!h) return;
  if (a.frustration < 60) return;
  spendWill(w, c);
  if (a.kind === 'seat' && a.target && rng.chance(0.3)) {
    setSeat(w, c, a.target as CouncilSeat);
    satisfy(w, c, a, `named ${seatTitle(a.target)}`);
    return;
  }
  if (rng.chance(0.4)) { a.frustration = 40; return; }
  // A resentful soul across the lanes: we may hear of it, and they may come to us.
  if (c.hidden.loyalty < 10 && rng.chance(0.3)) {
    a.known = true;
    logRecord(w, { kind: 'intrigue', type: 'intrigue', severity: 1, text: `Word from ${H(w, h.id)}: ${displayName(c.name)} ${ambitionText(w, a)}, and is bitter they have not had it.`, who: [{ id: c.id, part: 'discontented' }], houseIds: [h.id], source: 'court gossip' });
  }
}

export { COUNCIL as AMBITION_SEATS };

const hashOf = (x: string) => { let h = 0; for (let i = 0; i < x.length; i++) h = (h * 31 + x.charCodeAt(i)) | 0; return h; };

/** The Highroy knights someone in the hall: 300 othes and a ceremony. */
export function cannotKnight(world: World, id: string): string | null {
  const c = world.characters[id];
  if (!c?.alive || c.houseId !== world.playerHouseId) return 'Not one of ours';
  if (world.ladder?.of[id] && world.ladder.of[id]!.stage !== 'blooded') return world.ladder.of[id]!.stage === 'pupil' ? 'Still a pupil' : 'Not yet blooded';
  if (c.flags.some((f) => f.id === 'retired')) return 'Retired from arms';
  if (!c.flags.some((f) => f.id === 'blooded' || f.id === 'knighted') && c.role !== 'Knight') return 'Never blooded';
  if (c.role === 'Knight' || c.flags.some((f) => f.id === 'knighted') || titlesOf(world, id).some((t) => t.title.startsWith('Knighted'))) return 'Already a knight';
  if (c.seat) return 'A councillor';
  if (!adult(world, c)) return 'Too young';
  if (isAway(world, id)) return 'They are away';
  if (econ(world, world.playerHouseId).stock.othes < 300) return 'Not enough othes';
  return null;
}

export function knight(input: World, id: string): World {
  const w = structuredClone(input);
  ensureAmbitions(w);
  const why = cannotKnight(w, id);
  if (why) throw new Error(why);
  const c = w.characters[id]!;
  record(w, w.playerHouseId, { resource: 'othes', amount: -300, label: `Knighting of ${shortName(c.name)}`, kind: 'court' });
  c.role = 'Knight';
  if (!c.flags.some((f) => f.id === 'knighted')) c.flags.push({ id: 'knighted', since: w.date });
  award(w, c.id, 'Knighted');
  shiftMood(c, 10);
  const lord = w.houses[w.playerHouseId]?.rulerId;
  if (lord) shiftOpinion(w, c.id, lord, 15, 'knighted them');
  const a = w.ambitions.of[c.id];
  if (a?.kind === 'knight') satisfy(w, c, a, 'knighted in the hall');
  logRecord(w, { kind: 'world', type: 'world', severity: 2, seat: 'grandMaster', text: `${displayName(c.name)} kneels in the hall and rises a knight of the house.`, who: [{ id: c.id, part: 'knighted' }, ...(lord ? [{ id: lord, part: 'gave the accolade' }] : [])], effects: ['−300 othes'] });
  // Those who waited longer feel passed over.
  const mine = w.ladder?.of[c.id];
  const waited = Object.entries(w.ladder?.of ?? {})
    .filter(([oid, r]) => oid !== c.id && r.stage === 'blooded' && w.characters[oid]?.alive && w.characters[oid]!.houseId === w.playerHouseId && w.characters[oid]!.role !== 'Knight' && !w.characters[oid]!.flags.some((f) => f.id === 'knighted' || f.id === 'retired') && (!mine || absoluteCycle(r.since) < absoluteCycle(mine.since)))
    .sort((a, b) => absoluteCycle(a[1].since) - absoluteCycle(b[1].since))[0];
  if (waited && Math.abs(hashOf(waited[0] + c.id)) % 3 !== 0) { rivalsFrom(w, waited[0], c.id, `passed over for a knighthood that went to ${shortName(c.name)}`, 2); sting(w, waited[0], c.id, 'passed over'); }
  // A few days later, their letter: thanks, and what they mean to do.
  logRecord(w, { kind: 'world', type: 'world', severity: 2, seat: 'grandMaster', text: `A letter from ${displayName(c.name)}, newly knighted.`, quote: { from: c.id, text: oathOf(w, c) }, who: [{ id: c.id, part: 'wrote' }] });
  return w;
}

/** What a new knight swears they will do: their want, their old score, or their nature. */
export function oathOf(w: World, c: Character): string {
  const a = w.ambitions?.of[c.id];
  const score = (w.crucible?.nemeses ?? []).find((n) => !n.settled && n.victimId === c.id);
  const rival = Object.entries(w.ties?.[c.id] ?? {}).find(([, t]) => t.bond === 'rival' || t.bond === 'feud');
  const R = rival && w.characters[rival[0]] ? shortName(w.characters[rival[0]]!.name) : '';
  const thanks = c.hidden.temperament >= 12 ? 'My lord, I have no words fit for the honour, so I will use these:' : 'My lord.';
  const vow = score ? `I will meet ${score.foeName} again, and this time I will not fall.`
    : a?.kind === 'seat' && a.target === 'champion' ? 'I will be the champion of this house one day. Hold me to it.'
    : a?.kind === 'seat' && a.target === 'grandMaster' ? 'I mean to lead the knights of this house before I am done.'
    : a?.kind === 'glory' ? 'I will give this house a name the Reaches sing.'
    : a?.kind === 'captain' ? 'Give me a ship and I will carry the house\'s colours wherever you point it.'
    : rival ? `I will prove I was the better choice. ${R} knows what I mean.`
    : c.hidden.loyalty >= 14 ? 'Whatever this house asks, the answer is yes.'
    : c.stats.valor >= 14 ? 'Put me where it is hardest. That is where I am useful.'
    : 'I will not make you regret it.';
  return `${thanks} ${vow}`;
}

/** The Highroy names someone to a council seat directly. */
export function appointToSeat(input: World, seat: CouncilSeat, id: string): World {
  const w = structuredClone(input);
  ensureAmbitions(w);
  const c = w.characters[id];
  if (!c?.alive || c.houseId !== w.playerHouseId || c.seat === 'highroy') throw new Error('Not someone we can name');
  if (c.seat === seat) return w;
  const old = seatHolder(w, c.houseId, seat);
  setSeat(w, c, seat);
  for (const [oid, oa] of Object.entries(w.ambitions.of)) if (oid !== c.id && oa.kind === 'seat' && oa.target === seat && w.characters[oid]?.alive && w.characters[oid]!.houseId === w.playerHouseId) { rivalsFrom(w, oid, c.id, `wanted to be ${seatTitle(seat)} and saw it go to ${shortName(c.name)}`, 2); sting(w, oid, c.id, 'passed over for a seat'); }
  const a = w.ambitions.of[c.id];
  if (a?.kind === 'seat' && a.target === seat) satisfy(w, c, a, `named ${seatTitle(seat)}`);
  else { shiftMood(c, 5); }
  logRecord(w, { kind: 'council', type: 'council', severity: 2, text: `${displayName(c.name)} is named ${seatTitle(seat)}${old ? `, in place of ${displayName(old.name)}` : ''}.`, who: [{ id: c.id, part: 'named' }, ...(old ? [{ id: old.id, part: 'dismissed' }] : [])] });
  return w;
}
