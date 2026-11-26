// Bounties and the people who hunt them.
//
// A price on a head is posted through the brokers of the Ghost Ledger, who hold the purse and take
// their tithe (Breakline's twelve to eighteen in a hundred). Houses post most of them; the underworld
// posts its own: a corsair chief whose captain was taken, a syndicate lord settling a debt. Hunters
// are their own people, with names, records, rivals and a reputation that sets what they will take.
// A house may also send one of its own to claim a price on the board, for the coin and the name.
import { Rng } from './rng';
import { addCycles, absoluteCycle, CYCLES_PER_ORBIT, CYCLES_PER_PHASE } from './time';
import { logRecord } from './records';
import { econ } from './economy';
import { kill } from './death';
import { displayName, shortName, buildWord } from './names';
import { fightScore } from './grounds';
import { protection } from './chair';
import { isAway } from './court';
import { shiftRelation } from './relations';
import { regardOf, shiftRegard } from './archon';
import { atWar } from './war';
import { imprison } from './holdings';
import { CULTURES } from '../data/cultures';
import { addMark, bountyAccount, type Account } from './details';
import type { Character, World } from './types';

export type Terms = 'alive' | 'dead' | 'either';
export const TERMS_LABEL: Record<Terms, string> = { alive: 'Alive', dead: 'Dead', either: 'Dead or alive' };

export type BountyTarget = { kind: 'person'; id: string } | { kind: 'corsair'; factionId: string; memberId: string };
export type Poster = { kind: 'house'; houseId: string } | { kind: 'underworld'; name: string; title: string; factionId?: string };

export interface Bounty {
  id: string;
  target: BountyTarget;
  poster: Poster;
  reward: number;
  terms: Terms;
  reason: string;
  posted: import('./time').GameDate;
  expires: import('./time').GameDate;
  /** Posted on the open board, where anyone can read it; or passed quietly through a broker. */
  open: boolean;
  status: 'open' | 'hunted' | 'done' | 'failed' | 'withdrawn' | 'expired';
  /** A hunter's id, or 'p:<person>' when one of ours has gone after it. */
  hunterId?: string;
  /** 0..100: how close the hunter is. */
  trail: number;
  outcome?: 'taken' | 'killed' | 'lost';
  /** For a price on one of ours: whether we know of it yet. */
  known: boolean;
  /** Hunters who went after it and came back without it. */
  beaten?: string[];
}

export type HunterStyle = 'clean' | 'brutal' | 'patient' | 'showman';
export const STYLE_LABEL: Record<HunterStyle, string> = { clean: 'Clean: in and out, nobody hurt who need not be', brutal: 'Brutal: brings them back, in whatever state', patient: 'Patient: waits for the one right moment', showman: 'A showman: wants it seen' };

export interface Hunter {
  id: string;
  name: string;
  species: string;
  epithet: string;
  /** 1..20: how they fight. */
  skill: number;
  /** 1..20: how they find people. */
  tracking: number;
  /** 1..20: how much they will risk. */
  nerve: number;
  /** 0..100. */
  renown: number;
  style: HunterStyle;
  /** The tool of the trade, if they carry something worth naming. */
  kit: string;
  status: 'free' | 'hunting' | 'hurt' | 'dead' | 'retired';
  hurtUntil?: import('./time').GameDate;
  taken: number;
  killed: number;
  failed: number;
  rivalId?: string;
  notes: string[];
}

export interface BountyState { list: Bounty[]; hunters: Record<string, Hunter>; answered: string[] }

/** The brokers' tithe on every purse. */
export const BROKER_CUT = 0.15;
/** How long a price stands before the purse goes back. */
export const BOUNTY_ORBITS = 4;

const KITS = ['a Caige residue lens', 'gravitic anchor spikes', 'a pulse cage folded into a case', 'a tracker\'s CDI analyser', 'a long rifle with a cracked stock', 'a borrowed Caige that does not like them', 'thermal cuffs and a lot of patience', 'nothing but a knife and a ship'];
const EPITHETS = ['the Quiet', 'Lantern', 'the Ledger', 'Glasshand', 'the Ninth', 'Driftwake', 'the Collector', 'Old Iron', 'Seven Doors', 'the Long Count', 'Hollow', 'Ashlight'];
const SPECIES_POOL = ['human', 'serathi', 'torvann', 'shaaliin', 'doven', 'fokari', 'gholari', 'thessari'];

export function ensureBounties(w: World): BountyState {
  // Old grudges, from before there was a board, are already settled.
  w.bounties ??= { list: [], hunters: {}, answered: Object.values(w.lanes?.factions ?? {}).flatMap((f) => f.members.filter((m) => m.fate).map((m) => m.id)) };
  if (!Object.keys(w.bounties.hunters).length) seedHunters(w);
  return w.bounties;
}

function seedHunters(w: World) {
  const r = Rng.fromSeed(`${w.seed}:hunters`);
  const eps = r.shuffle([...EPITHETS]);
  for (let i = 0; i < 9; i++) newHunter(w, r, eps[i]!, i < 2 ? 55 + r.int(0, 25) : r.int(5, 45));
  const hs = Object.values(w.bounties!.hunters);
  // A rivalry or two, from before the game began.
  for (let i = 0; i < 2; i++) { const [a, b] = r.shuffle([...hs]); if (a && b && !a.rivalId && !b.rivalId) { a.rivalId = b.id; b.rivalId = a.id; a.notes.push(`Has not spoken to ${b.name} since a job on the Ulamar lanes went wrong.`); b.notes.push(`Owes ${a.name} a share from the Ulamar job, and says otherwise.`); } }
}

function newHunter(w: World, r: Rng, epithet: string, renown: number): Hunter {
  const sp = r.pick(SPECIES_POOL.filter((s) => CULTURES[s as keyof typeof CULTURES]));
  const c = CULTURES[sp as keyof typeof CULTURES]!;
  const h: Hunter = {
    id: `bh${w.nextId++}`, name: `${buildWord(r, c.given)} ${r.pick(c.familyNames)}`, species: sp, epithet,
    skill: r.int(9, 17), tracking: r.int(8, 18), nerve: r.int(6, 18), renown,
    style: r.pick(['clean', 'brutal', 'patient', 'showman'] as const), kit: r.pick(KITS),
    status: 'free', taken: Math.round(renown / 12), killed: Math.round(renown / 20), failed: r.int(0, 3), notes: [],
  };
  w.bounties!.hunters[h.id] = h;
  return h;
}

export const hunterName = (h: Hunter) => `${h.name} "${h.epithet}"`;

// ---------------------------------------------------------------- targets and prices

export interface TargetView { name: string; houseId: string | null; strength: number; cunning: number; alive: boolean; where: string }

export function viewTarget(w: World, t: BountyTarget): TargetView | null {
  if (t.kind === 'person') {
    const c = w.characters[t.id];
    if (!c) return null;
    return { name: displayName(c.name), houseId: c.houseId, strength: fightScore(c) + (c.houseId === w.playerHouseId ? protection(w, c.id) * 20 : guardOf(w, c) * 4), cunning: (c.stats.stealth + c.stats.intrigue + c.stats.perception) / 3, alive: c.alive, where: c.seat ? 'at court' : 'about the house\'s business' };
  }
  const f = w.lanes?.factions[t.factionId];
  const m = f?.members.find((x) => x.id === t.memberId);
  if (!f || !m) return null;
  return { name: `${m.name} of ${f.name}`, houseId: null, strength: m.skill + (m.crew ?? 40) / 12, cunning: m.cunning ?? 10, alive: !m.fate, where: m.ship ? `aboard the ${m.ship}` : 'in the Reaches' };
}

/** Other houses' people are guarded according to their rank. */
function guardOf(w: World, c: Character): number {
  if (w.houses[c.houseId!]?.rulerId === c.id) return 3;
  return c.seat ? 2 : c.role === 'Knight' ? 1 : 0.5;
}

/** What the brokers say a head is worth: what a hunter of standing would take it for. */
export function fairPrice(w: World, t: BountyTarget): number {
  const v = viewTarget(w, t);
  if (!v) return 0;
  const rank = t.kind === 'person' ? (w.houses[v.houseId ?? '']?.rulerId === t.id ? 3 : w.characters[t.id]?.seat ? 1.8 : w.characters[t.id]?.role === 'Knight' ? 1.3 : 1) : (w.lanes.factions[t.factionId]?.members.find((m) => m.id === t.memberId)?.role === 'chief' ? 2.2 : 1.2);
  return Math.round(((600 + v.strength * 140 + v.cunning * 60) * rank) / 50) * 50;
}

export function cannotPlace(w: World, t: BountyTarget, reward: number): string | null {
  const P = w.playerHouseId;
  const v = viewTarget(w, t);
  if (!v || !v.alive) return 'They are beyond any price';
  if (t.kind === 'person') {
    const c = w.characters[t.id]!;
    if (c.houseId === P) return 'One of our own';
    if (w.houses[c.houseId ?? '']?.rulerId === t.id && !atWar(w, P, c.houseId!)) return 'A price on a Highroy is war; we are not at war with them';
  }
  if ((w.bounties?.list ?? []).some((b) => (b.status === 'open' || b.status === 'hunted') && sameTarget(b.target, t) && b.poster.kind === 'house' && b.poster.houseId === P)) return 'We already have a price on them';
  if (reward < 300) return 'The brokers will not post less than 300';
  if (econ(w, P).stock.othes < Math.ceil(reward * (1 + BROKER_CUT))) return 'Not enough othes for the purse and the tithe';
  return null;
}

const sameTarget = (a: BountyTarget, b: BountyTarget) => a.kind === b.kind && (a.kind === 'person' ? a.id === (b as typeof a).id : a.memberId === (b as { memberId: string }).memberId);
export const isLive = (b: Bounty) => b.status === 'open' || b.status === 'hunted';

function post(w: World, b: Omit<Bounty, 'id' | 'posted' | 'expires' | 'status' | 'trail'> & { orbits?: number }): Bounty {
  const s = ensureBounties(w);
  const full: Bounty = { ...b, id: `bt${w.nextId++}`, posted: w.date, expires: addCycles(w.date, CYCLES_PER_ORBIT * (b.orbits ?? BOUNTY_ORBITS)), status: 'open', trail: 0 };
  delete (full as { orbits?: number }).orbits;
  s.list.unshift(full);
  if (s.list.length > 80) s.list = s.list.filter((x, i) => i < 60 || isLive(x));
  return full;
}

/** The Highroy puts a price on someone. The purse and the tithe are paid now. */
export function placeBounty(input: World, t: BountyTarget, reward: number, terms: Terms, open: boolean, reason = 'by order of the Highroy'): World {
  const w = structuredClone(input);
  ensureBounties(w);
  const why = cannotPlace(w, t, reward);
  if (why) throw new Error(why);
  const P = w.playerHouseId;
  const cost = Math.ceil(reward * (1 + BROKER_CUT));
  econ(w, P).stock.othes -= cost;
  const v = viewTarget(w, t)!;
  const b = post(w, { target: t, poster: { kind: 'house', houseId: P }, reward, terms, reason, open, known: true });
  const effects = [`−${cost.toLocaleString('en-US')} othes (purse ${reward.toLocaleString('en-US')}, the brokers' tithe ${(cost - reward).toLocaleString('en-US')})`];
  if (t.kind === 'person' && v.houseId && open) {
    // A price posted in the open on another house's kin is an insult they will not forget.
    shiftRelation(w, v.houseId, P, -15); shiftRegard(w, v.houseId, P, -15);
    effects.push(`House ${w.houses[v.houseId]?.name} regard −15`);
  }
  if (t.kind === 'corsair') { const f = w.lanes.factions[t.factionId]; if (f) { f.rel[P] = Math.max(-100, (f.rel[P] ?? 0) - 15); effects.push(`${f.name}: −15`); } }
  logRecord(w, { kind: 'intrigue', type: 'intrigue', severity: 2, text: `We put a price on ${v.name}: ${b.reward.toLocaleString('en-US')} othes, ${TERMS_LABEL[terms].toLowerCase()}${open ? ', on the open board' : ', quietly'}.`, who: t.kind === 'person' ? [{ id: t.id, part: 'the mark' }] : undefined, effects });
  return w;
}

/** Take a price back down. The tithe is gone; the purse comes back if no one has gone after it yet. */
export function withdrawBounty(input: World, id: string): World {
  const w = structuredClone(input);
  const b = ensureBounties(w).list.find((x) => x.id === id);
  if (!b || b.poster.kind !== 'house' || b.poster.houseId !== w.playerHouseId) throw new Error('Not ours to take down');
  if (b.status !== 'open') throw new Error(b.status === 'hunted' ? 'A hunter is already on it' : 'It is already over');
  b.status = 'withdrawn';
  econ(w, w.playerHouseId).stock.othes += b.reward;
  logRecord(w, { kind: 'intrigue', type: 'intrigue', severity: 1, text: `We took down our price on ${viewTarget(w, b.target)?.name ?? 'them'}.`, effects: [`+${b.reward.toLocaleString('en-US')} othes back from the brokers`] });
  return w;
}

/** Buy off a price on one of ours: the brokers close it for the purse and half again. */
export const buyOffCost = (b: Bounty) => Math.round(b.reward * 1.5 / 50) * 50;
export function buyOff(input: World, id: string): World {
  const w = structuredClone(input);
  const b = ensureBounties(w).list.find((x) => x.id === id);
  const P = w.playerHouseId;
  if (!b || !isLive(b) || b.target.kind !== 'person' || w.characters[b.target.id]?.houseId !== P) throw new Error('Nothing to buy off');
  const cost = buyOffCost(b);
  if (econ(w, P).stock.othes < cost) throw new Error('Not enough othes');
  econ(w, P).stock.othes -= cost;
  const h = b.hunterId && !b.hunterId.startsWith('p:') ? w.bounties!.hunters[b.hunterId] : undefined;
  if (h) h.status = 'free';
  b.status = 'withdrawn';
  logRecord(w, { kind: 'intrigue', type: 'intrigue', severity: 2, text: `We bought the price off ${shortName(w.characters[b.target.id]!.name)}'s head.`, who: [{ id: b.target.id, part: 'the mark' }], effects: [`−${cost.toLocaleString('en-US')} othes`] });
  return w;
}

/** Can one of ours go after this price? */
export function cannotClaim(w: World, id: string, personId: string): string | null {
  const b = w.bounties?.list.find((x) => x.id === id);
  const c = w.characters[personId];
  const P = w.playerHouseId;
  if (!b || b.status !== 'open' || !b.open) return 'It is not on the board';
  if (b.poster.kind === 'house' && b.poster.houseId === P) return 'Our own price';
  if (b.target.kind === 'person' && w.characters[b.target.id]?.houseId === P) return 'One of ours';
  if (!c?.alive || c.houseId !== P) return 'Not one of ours';
  if (c.seat === 'highroy') return 'The Highroy does not hunt for coin';
  if (isAway(w, personId) || c.flags.some((f) => f.id === 'wounded' || f.id === 'bounty')) return 'Away or hurt';
  return null;
}

/** Send one of ours after a price on the board, for the coin and the name. */
export function claimBounty(input: World, id: string, personId: string): World {
  const w = structuredClone(input);
  ensureBounties(w);
  const why = cannotClaim(w, id, personId);
  if (why) throw new Error(why);
  const b = w.bounties!.list.find((x) => x.id === id)!;
  const c = w.characters[personId]!;
  b.status = 'hunted'; b.hunterId = `p:${personId}`;
  c.flags.push({ id: 'bounty', since: w.date, until: b.expires, detail: `hunting ${viewTarget(w, b.target)?.name}` });
  logRecord(w, { kind: 'world', type: 'fight', severity: 1, text: `${shortName(c.name)} has gone after the price on ${viewTarget(w, b.target)?.name}.`, who: [{ id: c.id, part: 'hunter' }] });
  return w;
}

// ---------------------------------------------------------------- the passage of time

interface Side { name: string; short: string; strength: number; tracking: number; nerve: number; c?: Character; h?: Hunter }

function hunterSide(w: World, b: Bounty): Side | null {
  if (!b.hunterId) return null;
  if (b.hunterId.startsWith('p:')) {
    const c = w.characters[b.hunterId.slice(2)];
    if (!c?.alive) return null;
    return { name: shortName(c.name), short: c.name.given, strength: fightScore(c), tracking: (c.stats.perception + c.stats.intrigue + c.stats.stealth) / 3, nerve: c.stats.valor, c };
  }
  const h = w.bounties!.hunters[b.hunterId];
  if (!h || h.status === 'dead') return null;
  return { name: hunterName(h), short: h.epithet.replace(/^the /, 'the '), strength: h.skill + h.nerve / 4 + h.renown / 25, tracking: h.tracking, nerve: h.nerve, h };
}

/** Each turn: hunters take prices, close in, and settle them; the underworld and the houses post new ones. */
export function advanceBounties(w: World, rng: Rng, phaseTurned: boolean, orbitTurned: boolean): void {
  const s = ensureBounties(w);
  const now = absoluteCycle(w.date);
  for (const h of Object.values(s.hunters)) if (h.status === 'hurt' && h.hurtUntil && absoluteCycle(h.hurtUntil) <= now) h.status = 'free';
  if (!phaseTurned) return;
  for (const b of s.list.filter(isLive)) {
    const v = viewTarget(w, b.target);
    if (!v || !v.alive) { close(w, b, 'failed'); continue; }
    if (b.status === 'open' && absoluteCycle(b.expires) <= now) { expire(w, b); continue; }
    if (b.status === 'open') { pickUp(w, rng, b); continue; }
    hunt(w, rng, b);
  }
  // Our Spymaster may hear of a quiet price on one of ours.
  const spy = Object.values(w.characters).find((c) => c.alive && c.houseId === w.playerHouseId && c.seat === 'spymaster');
  for (const b of s.list.filter((x) => isLive(x) && !x.known && x.target.kind === 'person' && w.characters[x.target.id]?.houseId === w.playerHouseId)) {
    if (rng.chance(0.15 + (spy ? spy.stats.intrigue / 60 : 0) + (b.status === 'hunted' ? 0.15 : 0))) {
      b.known = true;
      logRecord(w, { kind: 'intrigue', type: 'intrigue', severity: 2, text: `The Spymaster has word: there is a price on ${shortName(w.characters[(b.target as { id: string }).id]!.name)}'s head.`, who: [{ id: (b.target as { id: string }).id, part: 'the mark' }], detail: `${posterName(w, b.poster)} posted it, ${b.reward.toLocaleString('en-US')} othes, ${TERMS_LABEL[b.terms].toLowerCase()}.`, source: spy ? `${shortName(spy.name)}, Spymaster` : undefined });
    }
  }
  if (orbitTurned) { underworldPosts(w, rng); housePosts(w, rng); newBlood(w, rng); }
}

export function posterName(w: World, p: Poster): string {
  return p.kind === 'house' ? `House ${w.houses[p.houseId]?.name ?? w.archon?.houses[p.houseId]?.name ?? p.houseId}` : `${p.name}, ${p.title}`;
}

function close(w: World, b: Bounty, status: Bounty['status']) {
  b.status = status;
  if (b.hunterId && !b.hunterId.startsWith('p:')) { const h = w.bounties!.hunters[b.hunterId]; if (h && h.status === 'hunting') h.status = 'free'; }
  if (b.hunterId?.startsWith('p:')) { const c = w.characters[b.hunterId.slice(2)]; if (c) c.flags = c.flags.filter((f) => f.id !== 'bounty'); }
}

function expire(w: World, b: Bounty) {
  close(w, b, 'expired');
  if (b.poster.kind === 'house') econ(w, b.poster.houseId).stock.othes += b.reward;
  if (b.poster.kind === 'house' && b.poster.houseId === w.playerHouseId) logRecord(w, { kind: 'intrigue', type: 'intrigue', severity: 1, text: `No one took our price on ${viewTarget(w, b.target)?.name}. The brokers send the purse back.`, effects: [`+${b.reward.toLocaleString('en-US')} othes`] });
}

/** A free hunter takes the best price they think they can collect. */
function pickUp(w: World, rng: Rng, b: Bounty) {
  const v = viewTarget(w, b.target)!;
  const free = Object.values(w.bounties!.hunters).filter((h) => h.status === 'free' && !b.beaten?.includes(h.id));
  // What a hunter wants for the risk: their renown sets their price.
  const willing = free.filter((h) => b.reward >= fairPrice(w, b.target) * (0.45 + h.renown / 160) && h.skill + h.nerve / 2 >= v.strength * 0.85 - 2);
  if (!willing.length || !rng.chance(b.open ? 0.6 : 0.4)) return;
  const h = willing.sort((a, c) => c.renown - a.renown)[0]!;
  h.status = 'hunting';
  b.status = 'hunted'; b.hunterId = h.id;
  if (h.rivalId && w.bounties!.hunters[h.rivalId]?.status === 'free' && rng.chance(0.3)) h.notes.push(`Took the ${v.name} job out from under ${w.bounties!.hunters[h.rivalId]!.name}.`);
}

function hunt(w: World, rng: Rng, b: Bounty) {
  const hs = hunterSide(w, b);
  const v = viewTarget(w, b.target)!;
  if (!hs) { b.status = 'open'; b.hunterId = undefined; return; }
  b.trail = Math.min(100, b.trail + Math.max(3, hs.tracking * rng.next() * 1.6 + 6 - v.cunning * 0.6));
  if (b.trail < 100) return;
  confront(w, rng, b, hs, v);
}

function confront(w: World, rng: Rng, b: Bounty, hs: Side, v: TargetView) {
  const P = w.playerHouseId;
  const tc = b.target.kind === 'person' ? w.characters[b.target.id] : undefined;
  const margin = hs.strength - v.strength;
  const win = rng.chance(1 / (1 + Math.exp(-margin / 3)));
  const ours = (tc && tc.houseId === P) || hs.c?.houseId === P || (b.poster.kind === 'house' && b.poster.houseId === P);
  let outcome: 'taken' | 'killed' | 'escaped' | 'hunterDown' | 'hunterDead';
  if (win) {
    const alive = b.terms === 'alive' || (b.terms === 'either' && (hs.h?.style === 'clean' || hs.h?.style === 'patient' || rng.chance(0.5)));
    outcome = alive && rng.chance(hs.h?.style === 'brutal' ? 0.7 : 0.9) ? 'taken' : b.terms === 'alive' ? 'escaped' : 'killed';
  } else outcome = rng.chance(0.15 + Math.max(0, -margin) * 0.03) ? 'hunterDead' : rng.chance(0.6) ? 'hunterDown' : 'escaped';

  const account: Account = bountyAccount(w, rng, { hunter: hs.name, hunterShort: hs.short, targetShort: tc ? tc.name.given : v.name.split(' of ')[0]!.split(' ')[0], hunterC: hs.c, style: hs.h?.style, kit: hs.h?.kit, target: v.name, targetC: tc, where: v.where, outcome, poster: posterName(w, b.poster) });
  const head = `${hs.name} ${outcome === 'taken' ? `took ${v.name} alive` : outcome === 'killed' ? `killed ${v.name}` : outcome === 'escaped' ? `came close to ${v.name}, and lost them` : outcome === 'hunterDead' ? `went after ${v.name} and did not come back` : `went after ${v.name} and was beaten off`}.`;
  const effects: string[] = [];

  if (outcome === 'taken' || outcome === 'killed') {
    b.status = 'done'; b.outcome = outcome === 'taken' ? 'taken' : 'killed';
    if (tc) {
      if (outcome === 'killed') kill(w, tc, w.date, `killed for a price posted by ${posterName(w, b.poster)}`);
      else if (b.poster.kind === 'house') { w.captives[tc.id] = { characterId: tc.id, heldBy: b.poster.houseId, since: w.date, interrogated: false, reason: 'leverage' }; effects.push(`Held by ${posterName(w, b.poster)}`); }
      else { kill(w, tc, w.date, `taken by hunters for ${b.poster.name}, and never seen again`); }
      // Kin remember who posted it, when they can find out.
      if (b.poster.kind === 'house' && tc.houseId && b.open) { shiftRelation(w, tc.houseId, b.poster.houseId, -20); shiftRegard(w, tc.houseId, b.poster.houseId, -20); }
    } else if (b.target.kind === 'corsair') {
      const f = w.lanes.factions[b.target.factionId];
      const mid = b.target.memberId;
      const m = f?.members.find((x) => x.id === mid);
      if (f && m) {
        m.fate = outcome === 'taken' ? 'captured' : 'dead';
        m.notes.push(`${outcome === 'taken' ? 'Taken' : 'Killed'} by ${hs.name} for ${posterName(w, b.poster)}'s price.`);
        if (outcome === 'taken' && b.poster.kind === 'house') imprison(w, b.poster.houseId, m.name, `${m.role} of ${f.name}`, null, 'crime', m.cunning ?? 10);
        if (b.poster.kind === 'house') f.rel[b.poster.houseId] = Math.max(-100, (f.rel[b.poster.houseId] ?? 0) - 20);
      }
    }
    // The purse.
    if (hs.c) { econ(w, P).stock.othes += b.reward; effects.push(`+${b.reward.toLocaleString('en-US')} othes, the purse`); addMark(w, hs.c, { kind: outcome === 'killed' ? 'kill' : 'feat', text: `collected the price on ${v.name}`, place: v.where }); }
    if (hs.h) { hs.h.status = 'free'; hs.h.renown = Math.min(100, hs.h.renown + Math.round(4 + b.reward / 900)); if (outcome === 'taken') hs.h.taken++; else hs.h.killed++; }
  } else {
    b.trail = 30;
    if (hs.h) {
      hs.h.failed++;
      if (outcome === 'hunterDead') { hs.h.status = 'dead'; hs.h.notes.push(`Died going after ${v.name}.`); }
      else if (outcome === 'hunterDown') { hs.h.status = 'hurt'; hs.h.hurtUntil = addCycles(w.date, CYCLES_PER_PHASE * 3); }
      else hs.h.status = 'free';
      hs.h.renown = Math.max(0, hs.h.renown - 3);
      (b.beaten ??= []).push(hs.h.id);
    }
    if (hs.c) {
      if (outcome === 'hunterDead') kill(w, hs.c, w.date, `killed going after ${v.name} for a price`);
      else if (outcome === 'hunterDown') hs.c.flags.push({ id: 'wounded', since: w.date, until: addCycles(w.date, CYCLES_PER_PHASE * 2), detail: `going after ${v.name}` });
      hs.c.flags = hs.c.flags.filter((f) => f.id !== 'bounty');
    }
    if (tc) addMark(w, tc, { kind: 'feat', text: `lived through a hunter sent for the price on their head`, place: v.where });
    b.status = 'open'; b.hunterId = undefined;
    if (hs.c) b.status = 'open';
  }
  if (ours || b.open) logRecord(w, { kind: 'world', type: 'fight', severity: outcome === 'killed' || outcome === 'hunterDead' ? 3 : 2, text: head, who: [...(tc ? [{ id: tc.id, part: 'the mark' }] : []), ...(hs.c ? [{ id: hs.c.id, part: 'hunter' }] : [])], effects, account });
}

// ---------------------------------------------------------------- who posts prices

/** The underworld answers: a corsair chief whose people were taken puts a price on whoever led the hunt. */
function underworldPosts(w: World, rng: Rng) {
  const s = w.bounties!;
  for (const f of Object.values(w.lanes?.factions ?? {})) {
    const chief = f.members.find((m) => m.role === 'chief' && !m.fate);
    for (const m of f.members.filter((x) => x.fate && x.fateBy && !s.answered.includes(x.id))) {
      s.answered.push(m.id);
      const by = w.characters[m.fateBy!];
      if (!chief || !by?.alive || !rng.chance(f.temper === 'cruel' ? 0.7 : 0.4)) continue;
      const t: BountyTarget = { kind: 'person', id: by.id };
      const reward = Math.round(fairPrice(w, t) * (0.9 + rng.next() * 0.6) / 50) * 50;
      post(w, { target: t, poster: { kind: 'underworld', name: chief.name, title: `chief of ${f.name}`, factionId: f.id }, reward, terms: 'dead', reason: `for ${m.name}, ${m.fate === 'dead' ? 'killed' : 'taken'} in a hunt`, open: rng.chance(0.5), known: false, orbits: 6 });
    }
  }
  // A syndicate lord settles a score with a corsair captain who crossed them: the board is never empty.
  const live = Object.values(w.lanes?.factions ?? {}).flatMap((f) => f.members.filter((m) => !m.fate && m.role === 'captain').map((m) => ({ f, m })));
  if (live.length && s.list.filter(isLive).length < 6 && rng.chance(0.5)) {
    const { f, m } = rng.pick(live);
    const t: BountyTarget = { kind: 'corsair', factionId: f.id, memberId: m.id };
    if (!s.list.some((b) => isLive(b) && sameTarget(b.target, t))) {
      const lord = `${buildWord(rng, CULTURES.human!.given)} ${rng.pick(['Vasque', 'Orrel', 'Thane', 'Kessick', 'Marrow'])}`;
      post(w, { target: t, poster: { kind: 'underworld', name: lord, title: rng.pick(['a Breakline kingpin', 'a syndicate lord of the Ulamar lanes', 'a slaver out of the deep Reaches']) }, reward: Math.round(fairPrice(w, t) * (0.8 + rng.next() * 0.7) / 50) * 50, terms: rng.pick(['dead', 'either', 'alive'] as const), reason: rng.pick(['a debt on the Ghost Ledger', 'a cargo that never arrived', 'a broken word', 'a dead lieutenant']), open: true, known: true });
      m.known = true;
    }
  }
}

/** Houses post too: on corsair captains who bleed them, and in war on the other side's people. */
function housePosts(w: World, rng: Rng) {
  const s = w.bounties!;
  const P = w.playerHouseId;
  for (const hid of Object.keys(w.houses)) {
    if (hid === P) continue;
    const e = w.economy.houses[hid];
    if (!e || e.stock.othes < 4000) continue;
    // Corsairs who hate them.
    const foe = Object.values(w.lanes?.factions ?? {}).find((f) => (f.rel[hid] ?? 0) < -40);
    if (foe && rng.chance(0.12)) {
      const m = foe.members.find((x) => !x.fate && x.role === 'captain');
      if (m) {
        const t: BountyTarget = { kind: 'corsair', factionId: foe.id, memberId: m.id };
        if (!s.list.some((b) => isLive(b) && sameTarget(b.target, t))) { const reward = Math.round(fairPrice(w, t) * (0.9 + rng.next() * 0.4) / 50) * 50; e.stock.othes -= Math.ceil(reward * (1 + BROKER_CUT)); post(w, { target: t, poster: { kind: 'house', houseId: hid }, reward, terms: 'either', reason: 'for raids on their convoys', open: true, known: true }); m.known = true; }
      }
    }
    // In war, the other side's champion or spymaster.
    for (const other of Object.keys(w.houses)) {
      if (other === hid || !atWar(w, hid, other) || !rng.chance(0.1)) continue;
      const mark = Object.values(w.characters).filter((c) => c.alive && c.houseId === other && (c.seat === 'spymaster' || c.seat === 'grandMaster' || c.role === 'Champion')).sort(() => rng.next() - 0.5)[0];
      if (!mark) continue;
      const t: BountyTarget = { kind: 'person', id: mark.id };
      if (s.list.some((b) => isLive(b) && sameTarget(b.target, t))) continue;
      const reward = Math.round(fairPrice(w, t) * (1 + rng.next() * 0.5) / 50) * 50;
      if (e.stock.othes < reward * 1.2) continue;
      e.stock.othes -= Math.ceil(reward * (1 + BROKER_CUT));
      post(w, { target: t, poster: { kind: 'house', houseId: hid }, reward, terms: rng.pick(['dead', 'either'] as const), reason: 'in the war', open: rng.chance(0.4), known: other !== P });
    }
    // Spite: a house that loathes us may put a quiet price on one of our agents.
    if (regardOf(w, hid, P) < -50 && rng.chance(0.06)) {
      const mark = Object.values(w.characters).filter((c) => c.alive && c.houseId === P && c.tier === 'full' && !c.seat && (c.role === 'Agent' || c.role === 'Knight')).sort(() => rng.next() - 0.5)[0];
      if (mark) { const t: BountyTarget = { kind: 'person', id: mark.id }; const reward = Math.round(fairPrice(w, t) / 50) * 50; e.stock.othes -= Math.ceil(reward * (1 + BROKER_CUT)); post(w, { target: t, poster: { kind: 'house', houseId: hid }, reward, terms: 'either', reason: 'an old grievance', open: false, known: false }); }
    }
  }
}

/** Hunters die and retire; new ones come up from the docks. */
function newBlood(w: World, rng: Rng) {
  const s = w.bounties!;
  const active = Object.values(s.hunters).filter((h) => h.status !== 'dead' && h.status !== 'retired');
  for (const h of active) if (h.renown > 85 && rng.chance(0.03)) { h.status = 'retired'; h.notes.push('Retired, rich, to somewhere nobody will say.'); }
  if (active.length < 8 && rng.chance(0.5)) {
    const used = new Set(Object.values(s.hunters).map((h) => h.epithet));
    const ep = EPITHETS.find((e) => !used.has(e)) ?? `the ${['Second', 'Third', 'Fourth'][rng.int(0, 2)]}`;
    const h = newHunter(w, rng, ep, rng.int(3, 20));
    h.notes.push('New on the board this year.');
  }
}

/** Prices on our people that we know of. */
export function onOurHeads(w: World): Bounty[] {
  return (w.bounties?.list ?? []).filter((b) => isLive(b) && b.known && b.target.kind === 'person' && w.characters[b.target.id]?.houseId === w.playerHouseId);
}
export function ourBounties(w: World): Bounty[] {
  return (w.bounties?.list ?? []).filter((b) => b.poster.kind === 'house' && b.poster.houseId === w.playerHouseId);
}
export function board(w: World): Bounty[] {
  return (w.bounties?.list ?? []).filter((b) => isLive(b) && b.open);
}
