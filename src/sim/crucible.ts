// The Crucible: the houses' answer to having no war. Once a year every house sends a contingent
// to a battle world for a mock war of tactics, champions and steel. It is fought with real people:
// whoever goes is gone for the season, and the blades are not blunted.
import { Rng } from './rng';
import { displayName, shortName } from './names';
import { ageOf } from './characters';
import { SPECIES } from '../data/species';
import { econ, record } from './economy';
import { logRecord } from './records';
import { isAway } from './court';
import { shiftMood } from './mood';
import { shiftRelation } from './relations';
import { shiftBoth, shiftOpinion } from './relationships';
import { kill } from './death';
import { addGlory } from './ambitions';
import { award, tally } from './careers';
import { powerOf } from './fleet';
import { addCycles, dateParts } from './time';
import type { Character, World } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const H = (w: World, id: string) => `House ${w.houses[id]?.name ?? id}`;

export const BATTLE_WORLD = 'the Crucible of Vael';
export const MAX_CHAMPIONS = 3;
export const MAX_KNIGHTS = 6;

export type Stance = 'bold' | 'measured' | 'cunning';
export const STANCE_LABEL: Record<Stance, string> = { bold: 'Bold', measured: 'Measured', cunning: 'Cunning' };
export const STANCE_NOTE: Record<Stance, string> = {
  bold: 'Strike first and hard. Overwhelms a cunning foe; breaks on a measured one.',
  measured: 'Hold the line and wait. Breaks a bold charge; is outwitted by cunning.',
  cunning: 'Feints and flanks. Outwits the measured; is run down by the bold.',
};
const BEATS: Record<Stance, Stance> = { bold: 'cunning', measured: 'bold', cunning: 'measured' };

export type Stage = 'quiet' | 'open' | 'campaign' | 'final' | 'done';

export interface Contingent {
  houseId: string;
  marshalId: string | null;
  champions: string[];
  knights: string[];
  shipId?: string;
  chest: number;
}

export interface FrontResult { front: 'strategy' | 'champions' | 'melee'; winner: string; a: number; b: number; note: string }

export interface Engagement {
  id: string;
  round: number;
  a: string;
  b: string;
  /** Orbit of the year it is fought in (fought at the start of that Orbit's third Phase). */
  orbit: number;
  stance: Record<string, Stance | undefined>;
  fronts?: FrontResult[];
  winner?: string;
  mvpId?: string;
  fallen?: string[];
  wounded?: string[];
}

export interface Standing { played: number; won: number; lost: number; fronts: number; points: number }

export interface CrucibleState {
  year: number;
  stage: Stage;
  contingents: Record<string, Contingent>;
  table: Record<string, Standing>;
  engagements: Engagement[];
  history: { year: number; champion: string; runnerUp: string; heroId?: string }[];
}

// The year's calendar, by Orbit (1–10).
export const OPENS = 4;
export const CLOSES = 5;
export const ROUND_ORBITS = [6, 7, 8];
export const FINAL_ORBIT = 9;
const FIGHT_PHASE = 3;

export function ensureCrucible(world: World): void {
  if (world.crucible) return;
  world.crucible = { year: dateParts(world.date).year, stage: 'quiet', contingents: {}, table: {}, engagements: [], history: [] };
}

export function contingentPeople(c: Contingent | undefined): string[] {
  if (!c) return [];
  return [c.marshalId, ...c.champions, ...c.knights].filter((x): x is string => !!x);
}

/** Who can be sent: adults of the house, at home, not already committed. */
export function eligible(world: World, houseId: string): Character[] {
  return Object.values(world.characters).filter((c) => c.alive && c.houseId === houseId && c.tier === 'full' && c.seat !== 'highroy'
    && ageOf(c, world.date) >= SPECIES[c.species].adulthood * 0.9 && !isAway(world, c.id));
}

export function marshalScore(c: Character): number { return (c.stats.tactics + c.stats.logistics + c.stats.siegecraft + c.stats.leadership) / 4; }
export function championScore(c: Character): number { return (c.stats.duelling + c.stats.reflexes + c.stats.valor + c.stats.agility) / 4; }
export function knightScore(c: Character): number { return (c.stats.duelling + c.stats.discipline + c.stats.strength) / 3; }

/** Our contingent may be named while entries are open. */
export function cannotEnter(world: World, c: Contingent): string | null {
  const cr = world.crucible;
  if (!cr || cr.stage !== 'open') return 'Entries are not open';
  if (!c.marshalId) return 'Name a Marshal';
  if (!c.champions.length) return 'Name at least one champion';
  if (c.champions.length > MAX_CHAMPIONS) return `At most ${MAX_CHAMPIONS} champions`;
  if (c.knights.length > MAX_KNIGHTS) return `At most ${MAX_KNIGHTS} knights`;
  const ids = contingentPeople(c);
  if (new Set(ids).size !== ids.length) return 'Someone is named twice';
  const ok = new Set(eligible(world, world.playerHouseId).map((x) => x.id));
  const prev = new Set(contingentPeople(cr.contingents[world.playerHouseId]));
  if (ids.some((id) => !ok.has(id) && !prev.has(id))) return 'Someone named cannot go';
  const already = cr.contingents[world.playerHouseId]?.chest ?? 0;
  if (c.chest - already > econ(world, world.playerHouseId).stock.othes) return 'Not enough othes for the war chest';
  return null;
}

export function enterCrucible(input: World, c: Contingent): World {
  const w = structuredClone(input);
  ensureCrucible(w);
  const why = cannotEnter(w, c);
  if (why) throw new Error(why);
  const P = w.playerHouseId;
  const prev = w.crucible.contingents[P];
  const delta = c.chest - (prev?.chest ?? 0);
  if (delta) record(w, P, { resource: 'othes', amount: -delta, label: delta > 0 ? 'War chest for the Crucible' : 'War chest returned', kind: 'mission' });
  w.crucible.contingents[P] = { ...c, houseId: P };
  if (!prev) logRecord(w, { kind: 'world', type: 'politics', severity: 1, text: `House ${w.houses[P]!.name} names its contingent for the Crucible: ${c.marshalId ? displayName(w.characters[c.marshalId]!.name) : 'no one'} to lead it.`, who: contingentPeople(c).map((id) => ({ id, part: 'named for the Crucible' })) });
  return w;
}

export function setStance(input: World, engagementId: string, stance: Stance): World {
  const w = structuredClone(input);
  const e = w.crucible?.engagements.find((x) => x.id === engagementId);
  if (!e || e.winner || (e.a !== w.playerHouseId && e.b !== w.playerHouseId)) return w;
  e.stance[w.playerHouseId] = stance;
  return w;
}

/** The engagement waiting on our stance, if any. */
export function ourNext(world: World): Engagement | undefined {
  const P = world.playerHouseId;
  return world.crucible?.engagements.find((e) => !e.winner && (e.a === P || e.b === P));
}

// ---------------------------------------------------------------- the year's turn

function aiContingent(w: World, rng: Rng, houseId: string): Contingent {
  const pool = eligible(w, houseId);
  const taken = new Set<string>();
  const pick = (score: (c: Character) => number) => {
    const c = pool.filter((x) => !taken.has(x.id)).sort((a, b) => score(b) - score(a))[0];
    if (c) taken.add(c.id);
    return c;
  };
  const marshal = pick(marshalScore);
  const champions = [pick(championScore), pick(championScore), pick(championScore)].filter((x): x is Character => !!x).slice(0, rng.chance(0.3) ? 2 : 3);
  const knights: Character[] = [];
  for (let i = 0; i < MAX_KNIGHTS; i++) { const k = pick(knightScore); if (k) knights.push(k); }
  const e = econ(w, houseId);
  const chest = Math.round(Math.min(e.stock.othes * 0.15, 6000) / 100) * 100;
  e.stock.othes -= chest;
  const ship = Object.values(w.fleet?.ships ?? {}).find((s) => s.houseId === houseId && !s.lost && !s.ready && s.duty === 'harbour');
  return { houseId, marshalId: marshal?.id ?? null, champions: champions.map((c) => c.id), knights: knights.map((c) => c.id), shipId: rng.chance(0.5) ? ship?.id : undefined, chest };
}

function commit(w: World, c: Contingent) {
  for (const id of contingentPeople(c)) {
    const p = w.characters[id];
    if (!p?.alive) continue;
    p.flags = p.flags.filter((f) => f.id !== 'crucible');
    p.flags.push({ id: 'crucible', since: w.date, detail: `fighting in ${BATTLE_WORLD}` });
  }
  const s = c.shipId ? w.fleet?.ships[c.shipId] : undefined;
  if (s) s.crucible = true;
}

function release(w: World, houseId: string) {
  const c = w.crucible.contingents[houseId];
  for (const id of contingentPeople(c)) {
    const p = w.characters[id];
    if (p) p.flags = p.flags.filter((f) => f.id !== 'crucible');
  }
  const s = c?.shipId ? w.fleet?.ships[c.shipId] : undefined;
  if (s) delete s.crucible;
}

function open(w: World) {
  const year = dateParts(w.date).year;
  w.crucible = { ...w.crucible, year, stage: 'open', contingents: {}, table: {}, engagements: [] };
  logRecord(w, {
    kind: 'world', type: 'politics', severity: 2,
    text: `The Crucible of ${year} is called. Every house is summoned to ${BATTLE_WORLD} for the year's mock war; contingents must be named by Orbit ${CLOSES}.`,
    detail: 'A Marshal to command, up to three champions for the duels, up to six knights for the melee, a war chest, and a great ship if the house dares. All of them will be gone until the house is out or the final is fought.',
    source: 'the Numarade',
  });
  if (w.ports) w.ports.alerts += 1;
}

function close(w: World, rng: Rng) {
  const P = w.playerHouseId;
  for (const h of Object.keys(w.houses)) {
    if (h === P) continue;
    w.crucible.contingents[h] = aiContingent(w, rng, h);
  }
  const houses = Object.keys(w.crucible.contingents).filter((h) => w.crucible.contingents[h]!.marshalId);
  if (!w.crucible.contingents[P]) {
    const st = w.houses[P]!.standing;
    st.respect = clamp(st.respect - 3, 0, 100);
    logRecord(w, { kind: 'world', type: 'politics', severity: 2, text: `House ${w.houses[P]!.name} sends no one to the Crucible this year. The other houses notice.`, effects: ['Respect −3'] });
  }
  for (const h of houses) { commit(w, w.crucible.contingents[h]!); w.crucible.table[h] = { played: 0, won: 0, lost: 0, fronts: 0, points: 0 }; }
  // Round robin: everyone meets everyone once over the three rounds.
  const order = rng.shuffle([...houses]);
  const rounds: [string, string][][] = [];
  if (order.length === 4) {
    const [a, b, c, d] = order as [string, string, string, string];
    rounds.push([[a, b], [c, d]], [[a, c], [b, d]], [[a, d], [b, c]]);
  } else {
    const pairs: [string, string][] = [];
    for (let i = 0; i < order.length; i++) for (let j = i + 1; j < order.length; j++) pairs.push([order[i]!, order[j]!]);
    for (let r = 0; r < 3; r++) rounds.push(pairs.filter((_, k) => k % 3 === r));
  }
  rounds.forEach((pairs, r) => {
    for (const [a, b] of pairs) w.crucible.engagements.push({ id: `cr${w.nextId++}`, round: r + 1, a, b, orbit: ROUND_ORBITS[r]!, stance: {} });
  });
  w.crucible.stage = 'campaign';
  logRecord(w, { kind: 'world', type: 'politics', severity: 2, text: `The contingents land on ${BATTLE_WORLD}: ${houses.map((h) => w.houses[h]!.name).join(', ')}. The first engagements are fought in Orbit ${ROUND_ORBITS[0]}.`, houseIds: houses });
}

function score(rng: Rng, base: number, edge: number, spread: number): number {
  return base * edge + rng.gauss() * spread;
}

function fight(w: World, rng: Rng, e: Engagement) {
  const P = w.playerHouseId;
  const ca = w.crucible.contingents[e.a]!;
  const cb = w.crucible.contingents[e.b]!;
  for (const h of [e.a, e.b]) e.stance[h] ??= h === P ? 'measured' : rng.pick(['bold', 'measured', 'cunning'] as Stance[]);
  const sa = e.stance[e.a]!;
  const sb = e.stance[e.b]!;
  const edgeA = BEATS[sa] === sb ? 1.15 : BEATS[sb] === sa ? 0.88 : 1;
  const edgeB = BEATS[sb] === sa ? 1.15 : BEATS[sa] === sb ? 0.88 : 1;
  const ch = (id: string | null | undefined) => (id ? w.characters[id] : undefined);
  const alive = (ids: string[]) => ids.map((id) => w.characters[id]).filter((c): c is Character => !!c?.alive && !c.flags.some((f) => f.id === 'wounded'));
  const fronts: FrontResult[] = [];
  const perf: Record<string, number> = {};
  // Strategy: the Marshals and their war chests.
  const ma = ch(ca.marshalId); const mb = ch(cb.marshalId);
  const stA = score(rng, (ma?.alive ? marshalScore(ma) : 5) * 2 + Math.min(10, ca.chest / 800), edgeA, 4);
  const stB = score(rng, (mb?.alive ? marshalScore(mb) : 5) * 2 + Math.min(10, cb.chest / 800), edgeB, 4);
  fronts.push({ front: 'strategy', winner: stA >= stB ? e.a : e.b, a: Math.round(stA), b: Math.round(stB), note: `${ma ? shortName(ma.name) : 'No one'} against ${mb ? shortName(mb.name) : 'no one'}` });
  if (ma) perf[ma.id] = (perf[ma.id] ?? 0) + (stA - stB) / 3;
  if (mb) perf[mb.id] = (perf[mb.id] ?? 0) + (stB - stA) / 3;
  // Champions: duels, first against first.
  const chA = alive(ca.champions); const chB = alive(cb.champions);
  let wa = 0; let wb = 0;
  const duelNotes: string[] = [];
  for (let i = 0; i < Math.max(chA.length, chB.length); i++) {
    const x = chA[i]; const y = chB[i];
    if (!x || !y) { if (x) wa++; if (y) wb++; continue; }
    const rx = score(rng, championScore(x), edgeA, 3);
    const ry = score(rng, championScore(y), edgeB, 3);
    const win = rx >= ry ? x : y;
    const lose = win === x ? y : x;
    if (win === x) wa++; else wb++;
    tally(w, x.id, 'cDuels'); tally(w, y.id, 'cDuels'); tally(w, win.id, 'cDuelsWon');
    perf[win.id] = (perf[win.id] ?? 0) + 4 + Math.abs(rx - ry);
    shiftOpinion(w, lose.id, win.id, -8, `beat them in ${BATTLE_WORLD}`);
    duelNotes.push(`${shortName(win.name)} beat ${shortName(lose.name)}`);
  }
  fronts.push({ front: 'champions', winner: wa >= wb ? e.a : e.b, a: wa, b: wb, note: duelNotes.join('; ') || 'no duels' });
  // Melee: knights and, if sent, a great ship's guns overhead.
  const ka = alive(ca.knights); const kb = alive(cb.knights);
  const shipA = ca.shipId && w.fleet?.ships[ca.shipId] ? powerOf(w, w.fleet.ships[ca.shipId]!) / 2 : 0;
  const shipB = cb.shipId && w.fleet?.ships[cb.shipId] ? powerOf(w, w.fleet.ships[cb.shipId]!) / 2 : 0;
  const meA = score(rng, ka.reduce((n, k) => n + knightScore(k), 0) + shipA, edgeA, 8);
  const meB = score(rng, kb.reduce((n, k) => n + knightScore(k), 0) + shipB, edgeB, 8);
  fronts.push({ front: 'melee', winner: meA >= meB ? e.a : e.b, a: Math.round(meA), b: Math.round(meB), note: `${ka.length} against ${kb.length}${shipA || shipB ? ', with ships overhead' : ''}` });
  for (const k of ka) perf[k.id] = (perf[k.id] ?? 0) + (meA - meB) / 12 + rng.next();
  for (const k of kb) perf[k.id] = (perf[k.id] ?? 0) + (meB - meA) / 12 + rng.next();
  const fa = fronts.filter((f) => f.winner === e.a).length;
  e.fronts = fronts;
  e.winner = fa >= 2 ? e.a : e.b;
  const loser = e.winner === e.a ? e.b : e.a;
  // Who stood out.
  const best = Object.entries(perf).sort((x, y) => y[1] - x[1])[0];
  e.mvpId = best?.[0];
  if (e.mvpId) { tally(w, e.mvpId, 'cMvp'); addGlory(w, e.mvpId, 2); }
  // The blades are real.
  e.fallen = []; e.wounded = [];
  for (const id of [...contingentPeople(ca), ...contingentPeople(cb)]) {
    const p = w.characters[id];
    if (!p?.alive) continue;
    tally(w, id, 'crucible');
    if (contingentPeople(w.crucible.contingents[e.winner]).includes(id)) { tally(w, id, 'crucibleWon'); addGlory(w, id, 1); }
    const r = rng.next();
    if (r < 0.006) { kill(w, p, w.date, `fell in ${BATTLE_WORLD}`); e.fallen.push(id); }
    else if (r < 0.07) { p.flags.push({ id: 'wounded', since: w.date, until: addCycles(w.date, 48) }); e.wounded.push(id); }
  }
  // House fever.
  for (const c of Object.values(w.characters)) {
    if (!c.alive || c.tier !== 'full') continue;
    if (c.houseId === e.winner) shiftMood(c, 2);
    if (c.houseId === loser) shiftMood(c, -1);
  }
  for (const ids of [contingentPeople(w.crucible.contingents[e.winner])]) for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) shiftBoth(w, ids[i]!, ids[j]!, 4, `fought together in ${BATTLE_WORLD}`);
  shiftRelation(w, loser, e.winner, -2);
  const T = w.crucible.table;
  for (const h of [e.a, e.b]) { const t = (T[h] ??= { played: 0, won: 0, lost: 0, fronts: 0, points: 0 }); t.played++; t.fronts += fronts.filter((f) => f.winner === h).length; }
  T[e.winner]!.won++; T[e.winner]!.points += 3;
  T[loser]!.lost++;
  for (const h of [e.a, e.b]) T[h]!.points = T[h]!.won * 3 + T[h]!.fronts;
  const ours = e.a === P || e.b === P;
  const mvp = e.mvpId ? w.characters[e.mvpId] : undefined;
  logRecord(w, {
    kind: 'world', type: 'fight', severity: ours ? (e.round === 4 ? 3 : 2) : 1,
    text: `${e.round === 4 ? 'The Crucible final' : `Crucible, round ${e.round}`}: ${H(w, e.winner)} beat ${H(w, loser)}, ${Math.max(fa, 3 - fa)}–${Math.min(fa, 3 - fa)} on the fronts.${mvp ? ` Best of the field: ${displayName(mvp.name)}.` : ''}`,
    detail: `${STANCE_LABEL[sa]} ${w.houses[e.a]!.name} against ${STANCE_LABEL[sb]} ${w.houses[e.b]!.name}.\n` + fronts.map((f) => `${f.front.toUpperCase()}: ${w.houses[f.winner]!.name} (${f.a}–${f.b}) · ${f.note}`).join('\n')
      + (e.fallen.length ? `\nFallen: ${e.fallen.map((id) => displayName(w.characters[id]!.name)).join(', ')}.` : '') + (e.wounded.length ? `\nWounded: ${e.wounded.map((id) => shortName(w.characters[id]!.name)).join(', ')}.` : ''),
    who: [...(mvp ? [{ id: mvp.id, part: 'best of the field' }] : []), ...e.fallen.map((id) => ({ id, part: 'fell' })), ...e.wounded.map((id) => ({ id, part: 'wounded' }))],
    houseIds: [e.a, e.b], source: BATTLE_WORLD,
  });
  if (ours && w.ports) w.ports.alerts += 1;
}

function standings(w: World): string[] {
  const T = w.crucible.table;
  return Object.keys(T).sort((a, b) => T[b]!.points - T[a]!.points || T[b]!.fronts - T[a]!.fronts || (w.houses[b]!.standing.respect - w.houses[a]!.standing.respect));
}

function toFinal(w: World) {
  const order = standings(w);
  for (const h of order.slice(2)) release(w, h);
  const [a, b] = order as [string, string];
  if (!a || !b) { w.crucible.stage = 'done'; return; }
  w.crucible.engagements.push({ id: `cr${w.nextId++}`, round: 4, a, b, orbit: FINAL_ORBIT, stance: {} });
  w.crucible.stage = 'final';
  logRecord(w, { kind: 'world', type: 'politics', severity: 2, text: `The Crucible final is set: ${H(w, a)} against ${H(w, b)}, in Orbit ${FINAL_ORBIT}.${order.slice(2).includes(w.playerHouseId) ? ' Our contingent comes home.' : ''}`, houseIds: [a, b] });
  if (w.ports) w.ports.alerts += 1;
}

function crown(w: World, final: Engagement) {
  const champ = final.winner!;
  const runner = champ === final.a ? final.b : final.a;
  const st = w.houses[champ]!.standing;
  st.respect = clamp(st.respect + 6, 0, 100);
  st.dread = clamp(st.dread + 3, 0, 100);
  st.honour = clamp(st.honour + 2, 0, 100);
  const year = w.crucible.year;
  const side = contingentPeople(w.crucible.contingents[champ]);
  if (!final.mvpId || !side.includes(final.mvpId)) {
    // The hero comes from the winning side: whoever stood out most across the season.
    final.mvpId = side.filter((id) => w.characters[id]?.alive).sort((a, b) => {
      const sa = w.careers?.of[a]?.[year]; const sb = w.careers?.of[b]?.[year];
      return ((sb?.cMvp ?? 0) * 3 + (sb?.cDuelsWon ?? 0)) - ((sa?.cMvp ?? 0) * 3 + (sa?.cDuelsWon ?? 0));
    })[0];
  }
  for (const id of side) if (w.characters[id]?.alive) award(w, id, `Victor of the Crucible, ${year}`);
  if (final.mvpId && w.characters[final.mvpId]?.alive) award(w, final.mvpId, `Hero of the Crucible, ${year}`);
  for (const c of Object.values(w.characters)) if (c.alive && c.houseId === champ && c.tier === 'full') shiftMood(c, 8);
  for (const h of Object.keys(w.houses)) if (h !== champ) shiftRelation(w, h, champ, -1);
  w.crucible.history.push({ year, champion: champ, runnerUp: runner, heroId: final.mvpId });
  const hero = final.mvpId ? w.characters[final.mvpId] : undefined;
  logRecord(w, {
    kind: 'world', type: 'politics', severity: champ === w.playerHouseId || runner === w.playerHouseId ? 3 : 2,
    text: `${H(w, champ)} wins the Crucible of ${year}.${hero ? ` ${displayName(hero.name)} is named Hero of the Crucible.` : ''}`,
    detail: champ === w.playerHouseId ? 'The whole house is drunk on it. Every member of the contingent carries the title for life.' : `${H(w, runner)} goes home second.`,
    houseIds: [champ, runner], who: hero ? [{ id: hero.id, part: 'Hero of the Crucible' }] : [],
    effects: [`${H(w, champ)}: respect +6, dread +3, honour +2`],
  });
  for (const h of Object.keys(w.crucible.contingents)) release(w, h);
  w.crucible.stage = 'done';
}

export function advanceCrucible(world: World, rng: Rng, phaseTurned: boolean): void {
  ensureCrucible(world);
  if (!phaseTurned) return;
  const d = dateParts(world.date);
  const cr = world.crucible;
  if (d.orbit === OPENS && d.phase === 1 && (cr.stage === 'quiet' || cr.stage === 'done' || cr.year !== d.year)) open(world);
  if (cr.stage === 'open' && d.orbit >= CLOSES) close(world, rng);
  if (cr.stage === 'campaign' || cr.stage === 'final') {
    for (const e of cr.engagements) if (!e.winner && e.orbit === d.orbit && d.phase === FIGHT_PHASE) {
      fight(world, rng, e);
      if (e.round === 4) crown(world, e);
    }
    if (cr.stage === 'campaign' && cr.engagements.filter((e) => e.round <= 3).every((e) => e.winner)) toFinal(world);
  }
}

export { standings };
