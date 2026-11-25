// The houses as players: what each is after, who stands with whom, and where the Numarade's favour lies.
//
// Aims: each rival house wants something (revenge on a house, an ally, wealth, more ships, glory) and its
// choices lean that way. Our Spymaster learns what they are after, sooner if sharp.
// Alliances grow out of compacts and long regard; feuds out of raids, letters, blockades and embargoes.
// The Numarade's favour rises with honour and good order and falls with scandal: it sets the size of the
// quota, and at the extremes brings privileges or a censure.
// Poaching: we can try to bring a rival's knight over, if something already pulls them toward us.
import { Rng } from './rng';
import { econ, record } from './economy';
import { logRecord } from './records';
import { relation, shiftRelation } from './relations';
import { competence } from './reports';
import { barsOf, shiftOpinion } from './relationships';
import { takeIntoHouse } from './training';
import { isAway } from './court';
import { renownOf } from './renown';
import { displayName } from './names';
import { absoluteCycle, CYCLES_PER_YEAR, type GameDate } from './time';
import type { Character, World } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const H = (w: World, id: string) => `House ${w.houses[id]?.name ?? id}`;

export type AimKind = 'revenge' | 'alliance' | 'wealth' | 'expand' | 'glory';
export const AIM_LABEL: Record<AimKind, string> = { revenge: 'Revenge', alliance: 'An ally', wealth: 'Wealth', expand: 'A greater fleet', glory: 'Glory' };
export interface Aim { kind: AimKind; target?: string; since: GameDate; /** Whether our Spymaster has learned it. */ known: boolean }
export interface Pact { id: string; a: string; b: string; since: GameDate }
export interface Feud { id: string; a: string; b: string; since: GameDate; cause: string }
export interface AllianceOffer { id: string; from: string; expires: GameDate }

export interface RealmState {
  aims: Record<string, Aim>;
  alliances: Pact[];
  feuds: Feud[];
  /** The Numarade's favour toward each house, 0..100. */
  favour: Record<string, number>;
  /** Privilege or censure in force, until. */
  privilege: Record<string, { kind: 'privilege' | 'censure'; until: GameDate }>;
  offers: AllianceOffer[];
}

export function ensureRealm(world: World): void {
  world.realm ??= { aims: {}, alliances: [], feuds: [], favour: {}, privilege: {}, offers: [] };
  const r = world.realm;
  r.aims ??= {}; r.alliances ??= []; r.feuds ??= []; r.favour ??= {}; r.privilege ??= {}; r.offers ??= [];
  for (const h of Object.values(world.houses)) r.favour[h.id] ??= clamp(50 + (h.standing.respect - 50) / 4 + (h.standing.honour - 50) / 5, 10, 90);
}

export const allied = (world: World, a: string, b: string) => !!world.realm?.alliances.some((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a));
export const feuding = (world: World, a: string, b: string) => !!world.realm?.feuds.some((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a));
export const alliesOf = (world: World, h: string) => (world.realm?.alliances ?? []).filter((p) => p.a === h || p.b === h).map((p) => (p.a === h ? p.b : p.a));
export const favourOf = (world: World, h: string) => world.realm?.favour[h] ?? 50;
export function favourWord(v: number): string { return v >= 75 ? 'in high favour' : v >= 55 ? 'well regarded' : v >= 40 ? 'unremarkable' : v >= 25 ? 'watched' : 'in disgrace'; }

/** Nudge a house's standing with the Numarade (from anywhere in the sim). */
export function shiftFavour(world: World, h: string, by: number): void {
  if (!world.realm) return;
  world.realm.favour[h] = clamp((world.realm.favour[h] ?? 50) + by, 0, 100);
}

/** How the Numarade's favour scales the quota. */
export const favourQuota = (world: World, h: string) => {
  const pr = world.realm?.privilege[h];
  const live = pr && absoluteCycle(pr.until) > absoluteCycle(world.date);
  return (0.85 + favourOf(world, h) / 333) * (live ? (pr!.kind === 'privilege' ? 1.15 : 0.8) : 1);
};

/** An aim can lean any choice: returns a multiplier for that kind of act against that house. */
export function aimBias(world: World, h: string, kind: AimKind, target?: string): number {
  const a = world.realm?.aims[h];
  if (!a || a.kind !== kind) return 1;
  if (target && a.target && a.target !== target) return 1;
  return 3;
}

function chooseAim(world: World, rng: Rng, h: string): Aim {
  const house = world.houses[h]!;
  const p = house.personality;
  const others = Object.keys(world.houses).filter((o) => o !== h);
  const hated = others.sort((a, b) => relation(world, h, a) - relation(world, h, b))[0]!;
  const liked = [...others].sort((a, b) => relation(world, h, b) - relation(world, h, a))[0]!;
  const opts: [AimKind, number, string | undefined][] = [
    ['revenge', relation(world, h, hated) < -40 ? 2 + p.aggression * 3 + (feuding(world, h, hated) ? 3 : 0) : 0, hated],
    ['alliance', relation(world, h, liked) >= 30 && !allied(world, h, liked) ? 1.5 + (1 - p.isolation) * 2 : 0, liked],
    ['wealth', 1 + p.greed * 3 + (econ(world, h).stock.othes < 10000 ? 2 : 0), undefined],
    ['expand', 0.5 + p.aggression * 2 + (econ(world, h).stock.othes > 40000 ? 1.5 : 0), undefined],
    ['glory', 0.5 + p.honour * 2.5, undefined],
  ];
  const pick = rng.weighted(opts.filter(([, w]) => w > 0).map(([k, w, t]) => [[k, t] as [AimKind, string | undefined], w] as const));
  return { kind: pick[0], target: pick[1], since: world.date, known: false };
}

/** Each Orbit: aims, alliances, feuds and the Numarade's eye. */
export function advanceRealm(world: World, rng: Rng, orbitTurned: boolean): void {
  ensureRealm(world);
  if (!orbitTurned) return;
  const P = world.playerHouseId;
  const r = world.realm;
  const now = absoluteCycle(world.date);
  // Aims: chosen, and changed now and then.
  for (const h of Object.keys(world.houses)) {
    if (h === P) continue;
    const a = r.aims[h];
    if (!a || now - absoluteCycle(a.since) > CYCLES_PER_YEAR * 2 || (a.kind === 'alliance' && a.target && allied(world, h, a.target)) || rng.chance(0.04)) {
      r.aims[h] = chooseAim(world, rng, h);
    }
    const aim = r.aims[h]!;
    if (!aim.known && rng.chance(0.15 + competence(world, 'spymaster') * 0.025)) {
      aim.known = true;
      logRecord(world, { kind: 'world', type: 'intrigue', severity: aim.target === P ? 2 : 1, seat: 'spymaster', houseIds: [h, ...(aim.target ? [aim.target] : [])], text: aimText(world, h, aim) });
    }
    if (aim.kind === 'alliance' && aim.target) shiftRelation(world, h, aim.target, 1.5);
    if (aim.kind === 'revenge' && aim.target) shiftRelation(world, h, aim.target, -0.5);
  }
  // Alliances form from compacts and long regard, and break when it sours.
  const hs = Object.keys(world.houses);
  for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) {
    const a = hs[i]!, b = hs[j]!;
    const both = Math.min(relation(world, a, b), relation(world, b, a));
    if (allied(world, a, b)) {
      shiftRelation(world, a, b, 0.5); shiftRelation(world, b, a, 0.5);
      if (both < 10) breakPact(world, a, b, 'there was too little left between them');
    } else if (a !== P && b !== P && both >= 50 && world.lanes?.compacts.some((c) => (c.a === a && c.b === b) || (c.a === b && c.b === a)) && rng.chance(0.08 * aimBias(world, a, 'alliance', b))) {
      makePact(world, a, b);
    }
    // Feuds: deep hatred both ways.
    if (!feuding(world, a, b) && relation(world, a, b) <= -55 && relation(world, b, a) <= -45) {
      r.feuds.push({ id: `fd${world.nextId++}`, a, b, since: world.date, cause: lastGrievance(world, a, b) });
      if (allied(world, a, b)) breakPact(world, a, b, 'it has come to a feud');
      logRecord(world, { kind: 'world', type: 'politics', severity: a === P || b === P ? 2 : 1, seat: a === P || b === P ? 'envoy' : 'heralds', houseIds: [a, b], text: a === P || b === P ? `It is a feud now between us and ${H(world, a === P ? b : a)}. Their people will treat ours as enemies.` : `${H(world, a)} and ${H(world, b)} are in open feud.` });
    } else if (feuding(world, a, b) && relation(world, a, b) > -25 && relation(world, b, a) > -25) {
      r.feuds = r.feuds.filter((f) => !((f.a === a && f.b === b) || (f.a === b && f.b === a)));
      logRecord(world, { kind: 'world', type: 'politics', severity: 1, seat: a === P || b === P ? 'envoy' : 'heralds', houseIds: [a, b], text: `The feud between ${H(world, a)} and ${H(world, b)} has cooled.` });
    }
  }
  // Allies stand by each other: whoever blockades or embargoes one angers the other.
  for (const p of r.alliances) for (const [x, y] of [[p.a, p.b], [p.b, p.a]]) {
    for (const e of world.lanes?.embargoes ?? []) if (e.against === x) shiftRelation(world, y!, e.by, -2);
    for (const w of world.lanes?.watches ?? []) if (w.stance === 'blockade' && w.house !== y && w.house !== x) shiftRelation(world, y!, w.house, -1);
  }
  // A rival who likes us may offer an alliance.
  r.offers = r.offers.filter((o) => absoluteCycle(o.expires) > now);
  for (const h of hs) {
    if (h === P || allied(world, h, P) || r.offers.some((o) => o.from === h)) continue;
    if (relation(world, h, P) >= 50 && rng.chance(0.08 * aimBias(world, h, 'alliance', P))) {
      r.offers.push({ id: `ao${world.nextId++}`, from: h, expires: { year: world.date.year + 1, cycle: world.date.cycle } });
      logRecord(world, { kind: 'world', type: 'politics', severity: 2, seat: 'envoy', houseIds: [P, h], text: `${H(world, h)} proposes an alliance: their convoys and ours guarded alike, and no letters or embargoes between us.` });
    }
  }
  favourOrbit(world, rng);
}

function aimText(world: World, h: string, a: Aim): string {
  const P = world.playerHouseId;
  const t = a.target ? (a.target === P ? 'us' : H(world, a.target)) : '';
  switch (a.kind) {
    case 'revenge': return `${H(world, h)} wants revenge on ${t}. Expect letters to the companies, embargoes, perhaps a blockade.`;
    case 'alliance': return `${H(world, h)} is looking for an ally, and has its eye on ${t}.`;
    case 'wealth': return `${H(world, h)} is after money: compacts, blind eyes at their docks, and smuggling by their people.`;
    case 'expand': return `${H(world, h)} is building strength at sea. More ships, and more of them on the lanes.`;
    case 'glory': return `${H(world, h)} wants glory: their fighters will be on every card and at the Crucible in force.`;
  }
}

function lastGrievance(world: World, a: string, b: string): string {
  const e = [...world.feed].reverse().find((x) => x.houseIds?.includes(a) && x.houseIds?.includes(b) && /blockade|embargo|letters|told|feud|killed|seized/.test(x.text));
  return e ? e.text.slice(0, 120) : 'years of bad blood';
}

function makePact(world: World, a: string, b: string) {
  world.realm.alliances.push({ id: `al${world.nextId++}`, a, b, since: world.date });
  world.realm.offers = world.realm.offers.filter((o) => !((o.from === a && b === world.playerHouseId) || (o.from === b && a === world.playerHouseId)));
  const P = world.playerHouseId;
  logRecord(world, { kind: 'world', type: 'politics', severity: 2, seat: a === P || b === P ? 'envoy' : 'heralds', houseIds: [a, b], text: a === P || b === P ? `We are allied with ${H(world, a === P ? b : a)}.` : `${H(world, a)} and ${H(world, b)} have sworn an alliance.` });
}

function breakPact(world: World, a: string, b: string, why: string) {
  world.realm.alliances = world.realm.alliances.filter((p) => !((p.a === a && p.b === b) || (p.a === b && p.b === a)));
  const P = world.playerHouseId;
  logRecord(world, { kind: 'world', type: 'politics', severity: 2, seat: a === P || b === P ? 'envoy' : 'heralds', houseIds: [a, b], text: `The alliance between ${H(world, a)} and ${H(world, b)} is over: ${why}.` });
}

// ---------------------------------------------------------------- the Numarade

function favourOrbit(world: World, rng: Rng) {
  const r = world.realm;
  const P = world.playerHouseId;
  for (const h of Object.values(world.houses)) {
    const base = 30 + h.standing.honour / 4 + h.standing.respect / 8;
    let f = r.favour[h.id] ?? 50;
    f += (base - f) * 0.05;
    const cu = world.lanes?.customs[h.id];
    if (cu === 'strict') f += 0.8;
    if (cu === 'blind') f -= 0.8;
    r.favour[h.id] = clamp(f, 0, 100);
    const pr = r.privilege[h.id];
    const live = pr && absoluteCycle(pr.until) > absoluteCycle(world.date);
    if (live) continue;
    if (f >= 75 && rng.chance(0.25)) {
      r.privilege[h.id] = { kind: 'privilege', until: { year: world.date.year + 1, cycle: world.date.cycle } };
      logRecord(world, { kind: 'world', type: 'politics', severity: h.id === P ? 2 : 1, seat: 'heralds', houseIds: [h.id], text: `The Numarade grants ${h.id === P ? 'us' : H(world, h.id)} a year's privilege: a larger Navisium quota and the Exchange's best terms.`, effects: ['Quota +15% for a year', 'Exchange prices −5%'] });
    } else if (f <= 25 && rng.chance(0.3)) {
      const fine = 3000;
      r.privilege[h.id] = { kind: 'censure', until: { year: world.date.year + 1, cycle: world.date.cycle } };
      record(world, h.id, { resource: 'othes', amount: -Math.min(fine, Math.max(0, econ(world, h.id).stock.othes)), label: 'Fine: Numarade censure', kind: 'court' });
      logRecord(world, { kind: 'world', type: 'politics', severity: 2, seat: 'heralds', houseIds: [h.id], text: `The Numarade censures ${h.id === P ? 'us' : H(world, h.id)}: a fine of ${fmt(fine)} othes and a smaller quota for a year.`, effects: [`−${fmt(fine)} othes`, 'Quota −20% for a year'] });
    }
  }
}

export function privilegeOf(world: World, h: string): 'privilege' | 'censure' | undefined {
  const pr = world.realm?.privilege[h];
  return pr && absoluteCycle(pr.until) > absoluteCycle(world.date) ? pr.kind : undefined;
}

// ---------------------------------------------------------------- the Highroy's hand

function act(input: World, fn: (w: World, rng: Rng) => void): World {
  const w = structuredClone(input);
  ensureRealm(w);
  const rng = new Rng(w.rng);
  fn(w, rng);
  w.rng = rng.state;
  return w;
}

export function cannotAlly(world: World, h: string): string | null {
  const P = world.playerHouseId;
  if (!world.houses[h] || h === P) return 'Choose a house.';
  if (allied(world, P, h)) return 'Already allies.';
  if (feuding(world, P, h)) return 'Not while we are in feud.';
  if (!world.lanes?.compacts.some((c) => (c.a === P && c.b === h) || (c.a === h && c.b === P))) return 'An alliance starts with a trade compact.';
  const r = relation(world, h, P);
  if (r < 45) return `Their regard for us is ${Math.round(r)}; they would want 45.`;
  return null;
}

export function proposeAlliance(input: World, h: string): World {
  if (cannotAlly(input, h)) return input;
  return act(input, (w) => makePact(w, w.playerHouseId, h));
}

export function answerAlliance(input: World, offerId: string, yes: boolean): World {
  return act(input, (w) => {
    const o = w.realm.offers.find((x) => x.id === offerId);
    if (!o) return;
    w.realm.offers = w.realm.offers.filter((x) => x !== o);
    if (yes) makePact(w, o.from, w.playerHouseId);
    else shiftRelation(w, o.from, w.playerHouseId, -6);
  });
}

export function endAlliance(input: World, h: string): World {
  return act(input, (w) => {
    if (!allied(w, w.playerHouseId, h)) return;
    shiftRelation(w, h, w.playerHouseId, -15);
    breakPact(w, w.playerHouseId, h, 'we ended it');
  });
}

export const REPARATIONS = 5000;
export function cannotMakePeace(world: World, h: string): string | null {
  if (!feuding(world, world.playerHouseId, h)) return 'There is no feud.';
  if (econ(world, world.playerHouseId).stock.othes < REPARATIONS) return `Needs ${fmt(REPARATIONS)} othes.`;
  return null;
}

/** Pay to end a feud: it buys regard on both sides; whether it holds is up to them. */
export function makePeace(input: World, h: string): World {
  if (cannotMakePeace(input, h)) return input;
  return act(input, (w) => {
    const P = w.playerHouseId;
    record(w, P, { resource: 'othes', amount: -REPARATIONS, label: `Reparations to ${H(w, h)}`, kind: 'court' });
    shiftRelation(w, h, P, 35); shiftRelation(w, P, h, 20);
    logRecord(w, { kind: 'council', type: 'decision', severity: 2, houseIds: [P, h], text: `We paid ${H(w, h)} ${fmt(REPARATIONS)} othes in reparations to end the feud.` });
  });
}

// ---------------------------------------------------------------- poaching

/** What pulls a rival's fighter toward us: people they care for here, our name, and the purse. */
export function poachOdds(world: World, id: string, purse: number): { p: number; why: string[] } {
  const P = world.playerHouseId;
  const c = world.characters[id];
  if (!c) return { p: 0, why: [] };
  const why: string[] = [];
  let p = 0.05;
  let best = 0;
  for (const o of Object.values(world.characters)) {
    if (!o.alive || o.houseId !== P) continue;
    const like = barsOf(world, c.id, o.id).like;
    if (like > best) best = like;
  }
  if (best >= 75) { p += 0.25; why.push('someone here they are devoted to'); }
  else if (best >= 55) { p += 0.12; why.push('someone here they are close to'); }
  const mine = world.houses[c.houseId]!.standing.respect;
  const ours = world.houses[P]!.standing.respect;
  if (ours > mine) { p += (ours - mine) * 0.004; why.push('our name'); }
  p -= (c.hidden.loyalty - 10) * 0.03;
  if ((c.mood ?? 50) < 40) { p += 0.1; why.push('they are unhappy where they are'); }
  if (purse > 0) { p += Math.min(0.3, purse / 20000); why.push(`a purse of ${fmt(purse)}`); }
  if (feuding(world, P, c.houseId)) p -= 0.1;
  if (c.seat) p -= 0.15;
  return { p: clamp(p, 0.02, 0.85), why };
}

export function poachable(world: World): Character[] {
  const P = world.playerHouseId;
  return Object.values(world.characters).filter((c) => c.alive && c.tier === 'full' && c.houseId !== P && world.houses[c.houseId] && c.seat !== 'highroy' && !isAway(world, c.id)
    && (c.role === 'Knight' || c.flags.some((f) => f.id === 'knighted' || f.id === 'blooded') || c.seat === 'champion'))
    .sort((a, b) => renownOf(world, b) - renownOf(world, a));
}

export const POACH_APPROACH = 500;
export function cannotPoach(world: World, id: string, purse: number): string | null {
  const c = world.characters[id];
  if (!c?.alive || c.houseId === world.playerHouseId) return 'Not someone we can approach.';
  if (c.seat === 'highroy') return 'Not their Highroy.';
  if (c.flags.some((f) => f.id === 'approached')) return 'Already approached this year.';
  if (econ(world, world.playerHouseId).stock.othes < POACH_APPROACH + purse) return `Needs ${fmt(POACH_APPROACH + purse)} othes.`;
  return null;
}

/** Make an offer to a rival's fighter. The approach costs something either way; the purse only if they come. */
export function poach(input: World, id: string, purse: number): World {
  if (cannotPoach(input, id, purse)) return input;
  return act(input, (w, rng) => {
    const P = w.playerHouseId;
    const c = w.characters[id]!;
    const from = c.houseId;
    const { p } = poachOdds(w, id, purse);
    record(w, P, { resource: 'othes', amount: -POACH_APPROACH, label: `An approach to ${displayName(c.name)}`, kind: 'court' });
    c.flags.push({ id: 'approached', since: w.date, until: { year: w.date.year + 1, cycle: w.date.cycle } });
    if (rng.chance(p)) {
      if (purse) record(w, P, { resource: 'othes', amount: -purse, label: `Purse for ${displayName(c.name)}`, kind: 'court' });
      delete c.seat;
      takeIntoHouse(w, c, c.role === 'Knight' ? 'Knight' : c.role);
      const home = w.planets[w.houses[P]!.capitalPlanetId]!;
      c.location = { planetId: home.id, sectorId: home.sectors[0]!.id };
      shiftRelation(w, from, P, -20);
      logRecord(w, { kind: 'intrigue', type: 'intrigue', severity: 3, seat: 'spymaster', houseIds: [P, from], text: `${displayName(c.name)} has left House ${w.houses[from]!.name} and sworn to us.`, who: [{ id: c.id, part: 'came over' }], effects: [`${H(w, from)} regard −20`], quote: { from: c.id, text: 'They will call me a turncoat. Let them. I know where I am wanted.' } });
    } else {
      const told = rng.chance(0.45 + (c.hidden.loyalty - 10) * 0.03);
      if (told) { shiftRelation(w, from, P, -8); w.houses[P]!.standing.honour = clamp(w.houses[P]!.standing.honour - 1, 0, 100); }
      shiftOpinion(w, c.id, w.houses[P]!.rulerId ?? '', told ? -5 : 2, 'tried to lure them away');
      logRecord(w, { kind: 'intrigue', type: 'intrigue', severity: 1, seat: 'spymaster', houseIds: [P, from], text: `${displayName(c.name)} turned down our offer${told ? ', and told their lord about it' : ''}.`, effects: told ? [`${H(w, from)} regard −8`, 'Honour −1'] : [] });
    }
  });
}

/** Open a feud between two houses from a story, if there isn't one. */
export function openFeud(world: World, a: string, b: string, cause: string): void {
  ensureRealm(world);
  if (a === b || feuding(world, a, b)) return;
  world.realm.feuds.push({ id: `fd${world.nextId++}`, a, b, since: world.date, cause });
}
