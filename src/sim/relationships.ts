// Relationships: what people feel about each other. Every notable person can
// hold a tie to another, with an opinion from -100 to +100 and, once it earns
// one, a bond: friends, rivals, sworn knights, lovers, mentors, a blood feud.
import { SUBJECTS } from './training';
import { traitLabel } from '../data/traits';
import { Rng } from './rng';
import { displayName } from './names';
import { isAway } from './court';
import { shiftMood } from './mood';
import { ageOf } from './characters';
import { SPECIES } from '../data/species';
import { logRecord } from './records';
import { wardsAt } from './training';
import { ambassadorsAt } from './embassies';
import { absoluteCycle, type GameDate } from './time';
import type { Character, World } from './types';

export type Bond =
  | 'friend' | 'rival' | 'sworn' | 'lover' | 'spouse' | 'mentor' | 'pupil' | 'captor' | 'captive'
  | 'creditor' | 'debtor' | 'feud' | 'guardian' | 'ward';

export const BOND_LABEL: Record<Bond, string> = {
  friend: 'friend', rival: 'rival', sworn: 'sworn brother-in-arms', lover: 'lover', spouse: 'spouse', mentor: 'mentor',
  pupil: 'pupil', captor: 'captor', captive: 'captive', creditor: 'creditor', debtor: 'debtor', feud: 'blood feud',
  guardian: 'guardian', ward: 'ward',
};

/** Bonds nobody outside the pair should see without digging. */
export const SECRET_BONDS: Bond[] = ['lover'];

export interface Tie {
  /** like − dislike, kept for everything that reads one number. */
  opinion: number;
  /** 0..100 each: how much they like, and how much they dislike, the other. Both can be high at once. */
  like?: number;
  dislike?: number;
  /** Tiers already announced for this pair, so a bar wavering at a line is not news twice. */
  marks?: string[];
  bond?: Bond;
  since: GameDate;
  /** The last few things that moved it, newest first. */
  reasons: string[];
}

export type Ties = Record<string, Record<string, Tie>>;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function ensureTies(world: World): void {
  if (world.ties) return;
  world.ties = {};
  // The Highroy and the consort start as spouses.
  for (const h of Object.values(world.houses)) {
    const lord = h.rulerId ? world.characters[h.rulerId] : undefined;
    const consort = Object.values(world.characters).find((c) => c.alive && c.houseId === h.id && c.role === 'Spouse of the Highroy');
    if (lord && consort) setBond(world, lord.id, consort.id, 'spouse', 'spouse', 'married');
  }
}

export function tieOf(world: World, a: string, b: string): Tie | undefined {
  return world.ties?.[a]?.[b];
}

function tie(world: World, a: string, b: string): Tie {
  world.ties ??= {};
  const row = (world.ties[a] ??= {});
  return (row[b] ??= { opinion: 0, since: world.date, reasons: [] });
}

/** Kin and house give a starting warmth; the stored tie moves from there. */
export function baseOpinion(world: World, a: string, b: string): number {
  const A = world.characters[a];
  const B = world.characters[b];
  if (!A || !B) return 0;
  let v = 0;
  if (A.familyId === B.familyId) v += 15;
  else if (A.houseId === B.houseId) v += 5;
  return v;
}

/** How a feels about b, all told. */
export function opinion(world: World, a: string, b: string): number {
  return clamp(baseOpinion(world, a, b) + (tieOf(world, a, b)?.opinion ?? 0), -100, 100);
}

export function bondOf(world: World, a: string, b: string): Bond | 'kin' | undefined {
  const t = tieOf(world, a, b)?.bond;
  if (t) return t;
  const A = world.characters[a];
  const B = world.characters[b];
  return A && B && A.familyId === B.familyId ? 'kin' : undefined;
}

// ---------------------------------------------------------------- like and dislike

/** The tiers of each bar, and what they do. */
export const LIKE_TIERS: [number, string][] = [[75, 'Devoted'], [55, 'Close'], [35, 'Friendly'], [15, 'Acquainted']];
export const DISLIKE_TIERS: [number, string][] = [[75, 'Hatred'], [55, 'Enmity'], [35, 'Dislike'], [15, 'Wary']];
/** Close: they seek each other out, go on work together and form circles. */
export const CLOSE = 55;
/** Dislike: they avoid each other and work worse together. */
export const AVOID = 35;

export function tierOf(v: number, tiers: [number, string][]): string | undefined {
  return tiers.find(([at]) => v >= at)?.[1];
}

/** Older saves kept one number: split it into the two bars. */
function bars(t: Tie) {
  if (t.like === undefined || t.dislike === undefined) {
    t.like = Math.max(0, t.opinion);
    t.dislike = Math.max(0, -t.opinion);
  }
  return t as Tie & { like: number; dislike: number };
}

/** How much a likes and dislikes b. */
export function barsOf(world: World, a: string, b: string): { like: number; dislike: number } {
  const t = tieOf(world, a, b);
  if (!t) return { like: 0, dislike: 0 };
  const x = bars(t);
  return { like: x.like, dislike: x.dislike };
}

export const isClose = (world: World, a: string, b: string) => barsOf(world, a, b).like >= CLOSE && barsOf(world, b, a).like >= CLOSE - 10;
export const avoids = (world: World, a: string, b: string) => barsOf(world, a, b).dislike >= AVOID || barsOf(world, b, a).dislike >= AVOID;

/** Move how a feels about b, with a reason that is kept. Warmth fills the like bar, friction the dislike bar. */
export function shiftOpinion(world: World, a: string, b: string, by: number, reason: string): void {
  if (a === b || !by) return;
  const t = bars(tie(world, a, b));
  const was = t.opinion;
  const tierWas = [tierOf(t.like, LIKE_TIERS), tierOf(t.dislike, DISLIKE_TIERS)];
  if (by > 0) { t.like = clamp(t.like + by, 0, 100); t.dislike = clamp(t.dislike - by * 0.2, 0, 100); }
  else { t.dislike = clamp(t.dislike - by, 0, 100); t.like = clamp(t.like + by * 0.2, 0, 100); }
  t.opinion = clamp(Math.round(t.like - t.dislike), -100, 100) || 0;
  noteTier(world, a, b, tierWas, [tierOf(t.like, LIKE_TIERS), tierOf(t.dislike, DISLIKE_TIERS)]);
  const d = Math.round(t.opinion - was) || Math.sign(by);
  // The same cause again adds up rather than repeating.
  const same = t.reasons.findIndex((r) => r.replace(/^[+-]?\d+ /, '') === reason);
  const prev = same >= 0 ? parseInt(t.reasons[same]!, 10) || 0 : 0;
  const rest = same >= 0 ? t.reasons.filter((_, i) => i !== same) : t.reasons;
  const total = prev + d;
  t.reasons = [`${total > 0 ? '+' : ''}${total} ${reason}`, ...rest].slice(0, 4);
  settleBond(world, a, b, t);
}

/** Crossing into Close, Devoted, Enmity or Hatred is news at our court. */
function noteTier(world: World, a: string, b: string, was: (string | undefined)[], now: (string | undefined)[]) {
  const A = world.characters[a];
  const B = world.characters[b];
  if (!A || !B || (A.houseId !== world.playerHouseId && B.houseId !== world.playerHouseId) || a > b) return;
  const who = [{ id: a, part: '' }, { id: b, part: '' }];
  const t = world.ties?.[a]?.[b];
  const seen = (k: string) => { if (!t) return false; if (t.marks?.includes(k)) return true; (t.marks ??= []).push(k); return false; };
  if (now[0] !== was[0] && (now[0] === 'Close' || now[0] === 'Devoted') && was[0] !== 'Devoted' && !seen(now[0]!)) {
    logRecord(world, { kind: 'world', type: 'world', severity: now[0] === 'Devoted' ? 1 : 0, text: now[0] === 'Devoted' ? `${displayName(A.name)} and ${displayName(B.name)} are devoted to each other now. Where one goes, the other follows.` : `${displayName(A.name)} and ${displayName(B.name)} have grown close. They look for work together.`, who });
  }
  if (now[1] !== was[1] && (now[1] === 'Enmity' || now[1] === 'Hatred') && was[1] !== 'Hatred' && !seen(now[1]!)) {
    logRecord(world, { kind: 'world', type: 'world', severity: now[1] === 'Hatred' ? 1 : 0, text: now[1] === 'Hatred' ? `${displayName(A.name)} hates ${displayName(B.name)}. It will come to something.` : `${displayName(A.name)} can no longer stand ${displayName(B.name)}. They keep out of each other's way.`, who });
  }
}

/**
 * Two or more people thrown together: a mission, a hunt, a card at the pits, a ceremony, the docks. Each pair
 * rolls: their fixed chemistry, how it went, and their natures push the roll toward liking or disliking.
 * `went` runs from -1 (a disaster) to 1 (a triumph).
 */
export function meet(world: World, rng: Rng, ids: string[], where: string, went = 0, weight = 1): void {
  const people = [...new Set(ids)].filter((id) => world.characters[id]?.alive).slice(0, 8);
  for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) {
    const a = world.characters[people[i]!]!;
    const b = world.characters[people[j]!]!;
    let r = chemistry(a.id, b.id) * 0.6 + went * 0.4 + rng.gauss() * 0.5;
    if (a.hidden.ambition >= 14 && b.hidden.ambition >= 14) r -= 0.25;
    if (a.traits.some((t) => b.traits.some((u) => u.id === t.id))) r += 0.2;
    if (avoids(world, a.id, b.id)) r -= 0.2;
    const amt = (2 + Math.abs(r) * 6) * weight;
    if (r > 0.15) { shiftOpinion(world, a.id, b.id, Math.round(amt), `${where} together`); shiftOpinion(world, b.id, a.id, Math.round(amt * (0.7 + rng.next() * 0.5)), `${where} together`); }
    else if (r < -0.15) { shiftOpinion(world, a.id, b.id, -Math.round(amt), `friction: ${where}`); shiftOpinion(world, b.id, a.id, -Math.round(amt * (0.7 + rng.next() * 0.5)), `friction: ${where}`); }
    else { shiftOpinion(world, a.id, b.id, 1, `${where} together`); shiftOpinion(world, b.id, a.id, 1, `${where} together`); }
  }
}

/** The people someone would bring along: close to them, free, and willing; never someone they avoid. */
export function companionsFor(world: World, id: string, ok: (c: Character) => boolean): Character[] {
  return Object.entries(world.ties?.[id] ?? {})
    .filter(([o]) => world.characters[o]?.alive && ok(world.characters[o]!) && isClose(world, id, o) && !avoids(world, id, o))
    .sort((x, y) => (bars(y[1]).like) - (bars(x[1]).like))
    .map(([o]) => world.characters[o]!);
}

export function shiftBoth(world: World, a: string, b: string, by: number, reason: string): void {
  shiftOpinion(world, a, b, by, reason);
  shiftOpinion(world, b, a, by, reason);
}

export function setBond(world: World, a: string, b: string, ab: Bond | undefined, ba: Bond | undefined, reason: string): void {
  const t1 = tie(world, a, b);
  const t2 = tie(world, b, a);
  t1.bond = ab; t2.bond = ba;
  t1.since = t2.since = world.date;
  // A bond named outright carries the feeling that goes with it.
  for (const [t, b] of [[t1, ab], [t2, ba]] as const) {
    const x = bars(t);
    if (b === 'rival' || b === 'feud') x.dislike = Math.max(x.dislike, 45);
    if (b === 'friend' || b === 'sworn' || b === 'lover' || b === 'spouse') x.like = Math.max(x.like, 55);
    x.opinion = clamp(Math.round(x.like - x.dislike), -100, 100) || 0;
  }
  t1.reasons = [reason, ...t1.reasons].slice(0, 4);
  t2.reasons = [reason, ...t2.reasons].slice(0, 4);
}

/** Friendships and rivalries form, and fade, as opinions cross a line. */
function settleBond(world: World, a: string, b: string, t: Tie) {
  if (t.bond && !['friend', 'rival'].includes(t.bond)) return;
  const mineB = bars(t);
  const backB = barsOf(world, b, a);
  const A = world.characters[a];
  const B = world.characters[b];
  const ours = A?.houseId === world.playerHouseId || B?.houseId === world.playerHouseId;
  if (!t.bond && mineB.like >= 50 && backB.like >= 50 && mineB.dislike < 35 && backB.dislike < 35) {
    setBond(world, a, b, 'friend', 'friend', 'became friends');
    if (ours && A && B) logRecord(world, { kind: 'world', type: 'world', severity: 1, text: `${displayName(A.name)} and ${displayName(B.name)} have become friends.`, who: [{ id: a, part: 'friend' }, { id: b, part: 'friend' }] });
  } else if (!t.bond && mineB.dislike >= 55 && backB.dislike >= 40) {
    setBond(world, a, b, 'rival', 'rival', 'fell out');
    if (ours && A && B) logRecord(world, { kind: 'world', type: 'world', severity: 1, text: `${displayName(A.name)} and ${displayName(B.name)} are now open rivals.`, who: [{ id: a, part: 'rival' }, { id: b, part: 'rival' }] });
  } else if (t.bond === 'friend' && (mineB.like < 30 || mineB.dislike >= 50)) {
    setBond(world, a, b, undefined, undefined, 'drifted apart');
  } else if (t.bond === 'rival' && mineB.dislike < 25) {
    setBond(world, a, b, undefined, undefined, 'made peace');
  }
}

/** Everyone a person has a tie with (either way), strongest feeling first. */
export function tiesOf(world: World, id: string): { other: string; out: number; back: number; bond?: Bond | 'kin'; reasons: string[] }[] {
  const others = new Set<string>([...Object.keys(world.ties?.[id] ?? {})]);
  for (const [from, row] of Object.entries(world.ties ?? {})) if (row[id]) others.add(from);
  const me = world.characters[id];
  if (me) for (const c of Object.values(world.characters)) if (c.alive && c.familyId === me.familyId && c.id !== id && c.tier === 'full') others.add(c.id);
  return [...others]
    .filter((o) => world.characters[o]?.alive !== false)
    .map((o) => ({ other: o, out: opinion(world, id, o), back: opinion(world, o, id), bond: bondOf(world, id, o), reasons: tieOf(world, id, o)?.reasons ?? [] }))
    .sort((x, y) => Math.abs(y.out) + (y.bond ? 40 : 0) - (Math.abs(x.out) + (x.bond ? 40 : 0)));
}

/** Friends pull together; rivals drag; kindred spirits most of all. Used as a multiplier on a mission party. */
export function synergy(world: World, ids: string[]): number {
  if (ids.length < 2) return 1;
  let sum = 0;
  let n = 0;
  let kin = 0;
  for (const a of ids) for (const b of ids) if (a !== b) { sum += opinion(world, a, b); n++; if (a < b && kindred(world, a, b)) kin++; }
  const avg = sum / n;
  const sworn = ids.some((a) => ids.some((b) => bondOf(world, a, b) === 'sworn'));
  let close = 0;
  let sour = 0;
  for (const a of ids) for (const b of ids) if (a < b) { if (isClose(world, a, b)) close++; if (avoids(world, a, b)) sour++; }
  return clamp(1 + avg / 800 + (sworn ? 0.05 : 0) + kin * 0.03 + close * 0.04 - sour * 0.05, 0.8, 1.22);
}

/** The thing a person is best at, as a subject. */
function bent(c: Character): string {
  let best = '';
  let v = -1;
  for (const [k, def] of Object.entries(SUBJECTS)) {
    const x = def.stats.reduce((n, s) => n + c.stats[s], 0) / def.stats.length;
    if (x > v) { v = x; best = k; }
  }
  return best;
}

/**
 * Kindred spirits: two people who like each other and share something real, a trait, a calling,
 * or a teacher and the pupil they think well of. They seek each other out for work and do it better together.
 * Returns what they share, or null.
 */
export function kindred(world: World, a: string, b: string): string | null {
  const x = world.characters[a];
  const y = world.characters[b];
  if (!x?.alive || !y?.alive || x.houseId !== y.houseId) return null;
  if (opinion(world, a, b) < 30 || opinion(world, b, a) < 30) return null;
  const shared = x.traits.find((t) => y.traits.some((u) => u.id === t.id));
  if (shared) return `both ${traitLabel(shared.id)}`;
  const teach = Object.values(world.training?.enrolments ?? {}).find((e) => (e.teacherId === a && e.studentId === b) || (e.teacherId === b && e.studentId === a));
  if (teach) return 'teacher and pupil';
  const bx = bent(x);
  if (bx === bent(y)) return `both given to ${SUBJECTS[bx as keyof typeof SUBJECTS].label.toLowerCase()}`;
  return null;
}

/** Someone the leader would naturally bring: kindred, free, and willing. */
export function kindredOf(world: World, id: string, ok: (c: Character) => boolean): { c: Character; why: string } | undefined {
  const out: { c: Character; why: string; o: number }[] = [];
  for (const other of Object.keys(world.ties?.[id] ?? {})) {
    const c = world.characters[other];
    if (!c || !ok(c)) continue;
    const why = kindred(world, id, other);
    if (why) out.push({ c, why, o: opinion(world, id, other) });
  }
  return out.sort((p, q) => q.o - p.o)[0];
}

// ---------------------------------------------------------------- the passage of time

const adult = (world: World, c: Character) => ageOf(c, world.date) >= SPECIES[c.species].adulthood;

/** A fixed liking (-1..1) between two people, the same whenever they meet. */
export function chemistry(a: string, b: string): number {
  const key = a < b ? a + '|' + b : b + '|' + a;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  const u = ((h >>> 0) % 10000) / 10000;
  // Mostly mild; a few pairs strongly drawn or strongly repelled.
  return Math.sign(u - 0.5) * Math.pow(Math.abs(u - 0.5) * 2, 1.6);
}

/** Once a Phase: people at the same court get to know each other better, or worse. */
export function advanceRelationships(world: World, rng: Rng, phaseTurned: boolean): void {
  ensureTies(world);
  if (!phaseTurned) return;
  for (const h of Object.keys(world.houses)) {
    const court = [...Object.values(world.characters).filter((c) => c.alive && c.houseId === h && c.tier === 'full' && !isAway(world, c.id)), ...wardsAt(world, h), ...ambassadorsAt(world, h)];
    if (court.length < 2) continue;
    // A handful of meetings each Phase.
    const meetings = Math.max(3, Math.round(court.length * 1.2));
    for (let i = 0; i < meetings; i++) {
      const a = rng.pick(court);
      // Half the time people seek out someone they already know; otherwise anyone at court.
      const known = Object.keys(world.ties?.[a.id] ?? {}).map((id) => court.find((c) => c.id === id)).filter((c): c is Character => !!c);
      const b = known.length && rng.chance(0.5) ? rng.pick(known) : rng.pick(court);
      if (a.id === b.id) continue;
      // People who dislike each other keep apart; mostly they simply do not meet.
      if (avoids(world, a.id, b.id) && rng.chance(0.7)) continue;
      // Some people simply get on, and some never will: chemistry is fixed for each pair.
      // Then ambition grates on ambition, greed sours, and shared work builds trust.
      let drift = chemistry(a.id, b.id) * 7 + rng.gauss() * 3;
      if (a.hidden.ambition >= 13 && b.hidden.ambition >= 13) drift -= 3;
      if (a.role === b.role) drift += 2;
      if (a.hidden.greed >= 14) drift -= 1.5;
      if (a.hidden.loyalty >= 14 && b.hidden.loyalty >= 14) drift += 2;
      shiftOpinion(world, a.id, b.id, Math.round(drift), drift >= 0 ? 'time at court together' : 'friction at court');
      shiftOpinion(world, b.id, a.id, Math.round(drift * 0.8 + rng.gauss() * 2), drift >= 0 ? 'time at court together' : 'friction at court');
      // Love, now and then, between adults who like each other.
      const t = tieOf(world, a.id, b.id);
      if (t && !t.bond && adult(world, a) && adult(world, b) && opinion(world, a.id, b.id) >= 60 && opinion(world, b.id, a.id) >= 50
        && a.role !== 'Spouse of the Highroy' && b.role !== 'Spouse of the Highroy' && a.familyId !== b.familyId && rng.chance(0.15)) {
        setBond(world, a.id, b.id, 'lover', 'lover', 'fell for each other');
        if (h === world.playerHouseId) logRecord(world, { kind: 'intrigue', type: 'intrigue', severity: 1, text: `Whispers at court: ${displayName(a.name)} and ${displayName(b.name)} are lovers.`, who: [{ id: a.id, part: 'lover' }, { id: b.id, part: 'lover' }], source: 'court gossip' });
      }
    }
  }
  // Feelings fade without contact: liking slowly, dislike more slowly still.
  for (const row of Object.values(world.ties ?? {})) for (const t of Object.values(row)) {
    const x = bars(t);
    x.like = Math.max(0, x.like - 0.25);
    x.dislike = Math.max(0, x.dislike - 0.15);
    x.opinion = clamp(Math.round(x.like - x.dislike), -100, 100) || 0;
  }
  // Ties colour mood: a friend at court lifts it, a rival at court sours it.
  for (const c of Object.values(world.characters)) {
    if (!c.alive || c.houseId !== world.playerHouseId || c.tier !== 'full' || isAway(world, c.id)) continue;
    let friends = 0;
    let rivals = 0;
    for (const [o, t] of Object.entries(world.ties?.[c.id] ?? {})) {
      if (!world.characters[o]?.alive || isAway(world, o) || world.characters[o]?.houseId !== c.houseId) continue;
      if (t.bond === 'friend' || t.bond === 'lover' || t.bond === 'sworn' || t.bond === 'spouse') friends++;
      if (t.bond === 'rival' || t.bond === 'feud') rivals++;
    }
    shiftMood(c, Math.min(2, friends) - Math.min(2, rivals));
  }
}

/** A mission party comes home: shared danger makes friends, failure finds someone to blame. */
export function afterMission(world: World, rng: Rng, ids: string[], outcome: string): void {
  if (ids.length < 2) return;
  meet(world, rng, ids, 'a mission', outcome === 'triumph' ? 1 : outcome === 'success' ? 0.6 : outcome === 'disaster' ? -1 : -0.3, 1.3);
  if (outcome === 'triumph') {
    const knights = ids.filter((id) => world.characters[id]?.role === 'Knight' || world.characters[id]?.seat === 'champion');
    if (knights.length >= 2 && rng.chance(0.5) && !tieOf(world, knights[0]!, knights[1]!)?.bond) {
      setBond(world, knights[0]!, knights[1]!, 'sworn', 'sworn', 'swore themselves brothers-in-arms');
      const [x, y] = [world.characters[knights[0]!]!, world.characters[knights[1]!]!];
      logRecord(world, { kind: 'world', type: 'world', severity: 2, text: `${displayName(x.name)} and ${displayName(y.name)} swore themselves brothers-in-arms after their triumph.`, who: [{ id: x.id, part: 'sworn' }, { id: y.id, part: 'sworn' }] });
    }
  }
}

/** A death leaves grief in friends and, if someone is to blame, a feud. */
export function onDeath(world: World, deadId: string, killerHouse?: string): void {
  for (const [from, row] of Object.entries(world.ties ?? {})) {
    const t = row[deadId];
    if (!t) continue;
    const c = world.characters[from];
    if (c?.alive && (t.bond === 'friend' || t.bond === 'lover' || t.bond === 'sworn' || t.bond === 'spouse')) shiftMood(c, -10);
  }
  if (!killerHouse) return;
  const dead = world.characters[deadId];
  if (!dead) return;
  const ruler = world.houses[killerHouse]?.rulerId;
  for (const kin of Object.values(world.characters)) {
    if (kin.alive && kin.familyId === dead.familyId && kin.tier === 'full' && ruler) {
      setBond(world, kin.id, ruler, 'feud', undefined, `blood feud for ${displayName(dead.name)}`);
      shiftOpinion(world, kin.id, ruler, -60, `the death of ${displayName(dead.name)}`);
    }
  }
}

/** Groups of our people who stick together: friends, lovers and sworn knights. */
export function factions(world: World, houseId: string): string[][] {
  const ids = Object.values(world.characters).filter((c) => c.alive && c.houseId === houseId && c.tier === 'full').map((c) => c.id);
  const near = (a: string, b: string) => {
    const bd = tieOf(world, a, b)?.bond;
    return bd === 'friend' || bd === 'sworn' || bd === 'lover' || bd === 'spouse' || isClose(world, a, b);
  };
  const seen = new Set<string>();
  const groups: string[][] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const group: string[] = [];
    const stack = [id];
    while (stack.length) {
      const x = stack.pop()!;
      if (seen.has(x)) continue;
      seen.add(x);
      group.push(x);
      for (const y of ids) if (!seen.has(y) && near(x, y)) stack.push(y);
    }
    if (group.length >= 2) groups.push(group);
  }
  return groups.sort((a, b) => b.length - a.length);
}

export function ageOfTie(world: World, t: Tie): number {
  return absoluteCycle(world.date) - absoluteCycle(t.since);
}
