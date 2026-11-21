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
  opinion: number;
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

/** Move how a feels about b, with a reason that is kept. */
export function shiftOpinion(world: World, a: string, b: string, by: number, reason: string): void {
  if (a === b || !by) return;
  const t = tie(world, a, b);
  const was = t.opinion;
  t.opinion = clamp(t.opinion + by, -100, 100);
  const d = Math.round(t.opinion - was) || Math.sign(by);
  // The same cause again adds up rather than repeating.
  const same = t.reasons.findIndex((r) => r.replace(/^[+-]?\d+ /, '') === reason);
  const prev = same >= 0 ? parseInt(t.reasons[same]!, 10) || 0 : 0;
  const rest = same >= 0 ? t.reasons.filter((_, i) => i !== same) : t.reasons;
  const total = prev + d;
  t.reasons = [`${total > 0 ? '+' : ''}${total} ${reason}`, ...rest].slice(0, 4);
  settleBond(world, a, b, t);
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
  t1.reasons = [reason, ...t1.reasons].slice(0, 4);
  t2.reasons = [reason, ...t2.reasons].slice(0, 4);
}

/** Friendships and rivalries form, and fade, as opinions cross a line. */
function settleBond(world: World, a: string, b: string, t: Tie) {
  if (t.bond && !['friend', 'rival'].includes(t.bond)) return;
  const back = opinion(world, b, a);
  const mine = opinion(world, a, b);
  const A = world.characters[a];
  const B = world.characters[b];
  const ours = A?.houseId === world.playerHouseId || B?.houseId === world.playerHouseId;
  if (!t.bond && mine >= 45 && back >= 45) {
    setBond(world, a, b, 'friend', 'friend', 'became friends');
    if (ours && A && B) logRecord(world, { kind: 'world', type: 'world', severity: 1, text: `${displayName(A.name)} and ${displayName(B.name)} have become friends.`, who: [{ id: a, part: 'friend' }, { id: b, part: 'friend' }] });
  } else if (!t.bond && mine <= -45 && back <= -35) {
    setBond(world, a, b, 'rival', 'rival', 'fell out');
    if (ours && A && B) logRecord(world, { kind: 'world', type: 'world', severity: 1, text: `${displayName(A.name)} and ${displayName(B.name)} are now open rivals.`, who: [{ id: a, part: 'rival' }, { id: b, part: 'rival' }] });
  } else if (t.bond === 'friend' && mine < 15) {
    setBond(world, a, b, undefined, undefined, 'drifted apart');
  } else if (t.bond === 'rival' && mine > -10) {
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
  return clamp(1 + avg / 800 + (sworn ? 0.05 : 0) + kin * 0.03, 0.85, 1.18);
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
  const good = outcome === 'success' || outcome === 'triumph';
  for (const a of ids) for (const b of ids) {
    if (a === b) continue;
    shiftOpinion(world, a, b, good ? 6 + rng.next() * 4 : outcome === 'disaster' ? -6 - rng.next() * 6 : -2, good ? 'came through a mission together' : 'a mission that went wrong');
  }
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
    return bd === 'friend' || bd === 'sworn' || bd === 'lover' || bd === 'spouse' || (opinion(world, a, b) >= 40 && opinion(world, b, a) >= 40);
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
