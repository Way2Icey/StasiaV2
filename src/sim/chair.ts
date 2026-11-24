// The Exarchon's chair, when it is ours. The canon gives the Exarchon the Numarade's agenda and its
// tie-break, the Capanna to appoint and dismiss at will, the Grand Marshal and the joined legions, and the
// Archon's voice abroad. The game gives the chair its weight: a regent must run the house while the Highroy
// sits in it; crises from every corner of the Archon land on the Exarchon's desk, and almost every ruling
// makes some house an enemy; envy turns on the people closest to the chair; and legitimacy, once spent, is
// what the Numarade removes an Exarchon with. Before the chair is ours, this is also where promises are
// made: a Capanna seat promised for a vote.
import type { Character, World } from './types';
import { Rng } from './rng';
import { dateParts } from './time';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const year = (w: World) => dateParts(w.date).year;

export const CAPANNA_ROLES = ['Adviser on war', 'Adviser on coin', 'Adviser on law', 'Adviser on faith', 'Adviser on the houses'] as const;
export type GuardLevel = 0 | 1 | 2 | 3;
export const GUARD_LABEL = ['None', 'A watch', 'Sworn guards', 'The Spymaster\'s own'] as const;
/** Othes a Phase, per person, for each level of guard. */
export const GUARD_COST = [0, 25, 70, 150] as const;

export interface HeldChair {
  since: number;
  exarchonId: string;
  regentId?: string;
  /** Political capital: what decrees and struck motions are paid with. Refilled each year. */
  capital: number;
  log: { year: number; text: string }[];
}

export interface ChairState {
  /** Houses promised a seat on the Capanna for their vote. Kept, or remembered. */
  promises: string[];
  /** 0..100: how far the houses accept the Exarchon's hand. Low enough, and the Numarade removes them. */
  legitimacy: number;
  /** Protection on our people: envy reaches for the people closest to the chair. */
  guards: Record<string, GuardLevel>;
  held?: HeldChair;
}

export function ensureChair(w: World): ChairState {
  w.chair ??= { promises: [], legitimacy: 50, guards: {} };
  w.chair.promises ??= []; w.chair.guards ??= {};
  return w.chair;
}
export const chairHeld = (w: World): HeldChair | undefined => w.chair?.held;
export const isOurChair = (w: World): boolean => !!w.chair?.held && w.archon?.numarade.exarchon?.houseId === w.playerHouseId;

export function chairLog(w: World, text: string): void {
  const h = w.chair?.held;
  if (h) { h.log.unshift({ year: year(w), text }); h.log = h.log.slice(0, 60); }
}

export function shiftLegitimacy(w: World, by: number, why?: string): void {
  const c = ensureChair(w);
  c.legitimacy = clamp(Math.round(c.legitimacy + by), 0, 100);
  if (why && c.held) chairLog(w, `${why} (legitimacy ${by >= 0 ? '+' : ''}${by})`);
}

/** Those nearest the chair, whom envy reaches for first. */
export function closeToChair(w: World): Character[] {
  const P = w.playerHouseId;
  const ruler = w.houses[P]?.rulerId;
  const regent = w.chair?.held?.regentId;
  return Object.values(w.characters).filter((c) => c.alive && c.houseId === P && !c.veiled && (
    c.id === ruler || c.id === regent || c.role === 'Spouse of the Highroy' || c.role === 'Heir' || /of the Highroy/.test(c.role) || !!c.seat || c.pinned || !!c.name.epithet
  ));
}

/** Othes a Phase for the guards on our people. */
export function guardCost(w: World): number {
  return Object.entries(w.chair?.guards ?? {}).reduce((t, [id, l]) => t + (w.characters[id]?.alive ? GUARD_COST[l] : 0), 0);
}

/** How well a person is protected: 0..1. */
export function protection(w: World, id: string): number {
  const lvl = w.chair?.guards[id] ?? 0;
  const spy = Object.values(w.characters).find((c) => c.alive && c.houseId === w.playerHouseId && c.seat === 'spymaster');
  return clamp(lvl * 0.22 + (spy ? spy.stats.intrigue / 80 : 0), 0, 0.92);
}

// ---------------------------------------------------------------- winning and losing it

/** Each turn: the chair becomes ours when one of ours is elected, and stops being ours when they are gone. */
export function watchChair(w: World, onWon: (w: World) => void): void {
  const c = ensureChair(w);
  const ex = w.archon?.numarade.exarchon;
  const ours = !!ex && ex.houseId === w.playerHouseId && !!ex.personId && !!w.characters[ex.personId]?.alive;
  if (ours && (!c.held || c.held.exarchonId !== ex!.personId)) {
    c.held = { since: year(w), exarchonId: ex!.personId!, capital: 3, log: [] };
    c.legitimacy = 55;
    const p = w.characters[ex!.personId!]!;
    if (!p.flags.some((f) => f.id === 'atChair')) p.flags.push({ id: 'atChair', since: w.date });
    // The Capanna is ours to fill now; whoever sat in it before is gone with the last Exarchon.
    if (w.archon) w.archon.numarade.capanna = [];
    chairLog(w, `${p.name.given} takes the Exarchon's chair.`);
    onWon(w);
  } else if (!ours && c.held) {
    const p = w.characters[c.held.exarchonId];
    if (p) p.flags = p.flags.filter((f) => f.id !== 'atChair');
    const r = c.held.regentId ? w.characters[c.held.regentId] : undefined;
    if (r) r.flags = r.flags.filter((f) => f.id !== 'regent');
    c.held = undefined;
    c.promises = [];
    c.legitimacy = 50;
  }
}

/** Once a year, while the chair is ours: capital refills, the chair wears on its holder, promises fall due. */
export function chairYear(w: World, shift: (a: string, b: string, by: number) => void): void {
  const c = ensureChair(w);
  if (!c.held) {
    // Promises made for an election that never came good slowly lapse.
    return;
  }
  const capanna = w.archon?.numarade.capanna ?? [];
  c.held.capital = Math.min(8, c.held.capital + 3 + (capanna.some((s) => s.role === 'Adviser on law') ? 1 : 0) + Math.floor(c.legitimacy / 40));
  // The chair wears: every year in it is a year of rulings someone hated, and the longer it is held the
  // more the houses want it back.
  shiftLegitimacy(w, -(3 + Math.floor((year(w) - c.held.since) / 6)));
  if (!c.held.regentId || !w.characters[c.held.regentId]?.alive) shiftLegitimacy(w, -3, 'The house has no regent, and the Archon notices');
  // Promises not kept within a year are remembered as broken.
  if (year(w) - c.held.since >= 1) {
    for (const h of c.promises) {
      if (capanna.some((s) => s.houseId === h)) continue;
      shift(h, w.playerHouseId, -25);
      shiftLegitimacy(w, -4, `A promised seat on the Capanna was never given to House ${w.archon?.houses[h]?.name ?? h}`);
    }
    c.promises = c.promises.filter((h) => capanna.some((s) => s.houseId === h));
  }
  // The Capanna's advisers each lend their weight.
  for (const s of capanna) {
    if (s.role === 'Adviser on faith') shiftLegitimacy(w, 1);
    if (s.role === 'Adviser on the houses') shift(s.houseId, w.playerHouseId, 2);
  }
}

// ---------------------------------------------------------------- the player's hand (pure)

const clone = (w: World) => structuredClone(w);
function need(w: World): HeldChair {
  if (!isOurChair(w)) throw new Error('The chair is not ours.');
  return w.chair!.held!;
}
function spend(w: World, n: number): void {
  const h = need(w);
  if (h.capital < n) throw new Error(`Needs ${n} political capital; we have ${h.capital}.`);
  h.capital -= n;
}

export function promiseSeat(input: World, houseId: string, on: boolean): World {
  const w = clone(input);
  const c = ensureChair(w);
  if (c.held) throw new Error('The chair is already ours: appoint them instead.');
  if (on) {
    if (c.promises.includes(houseId)) return w;
    if (c.promises.length >= CAPANNA_ROLES.length) throw new Error('Every seat on the Capanna is already promised.');
    c.promises.push(houseId);
  } else c.promises = c.promises.filter((h) => h !== houseId);
  return w;
}

export function appointAdviser(input: World, role: string, houseId: string, shift: (w: World, a: string, b: string, by: number) => void, name: (w: World, houseId: string) => { name: string; personId?: string }): World {
  const w = clone(input);
  need(w);
  const n = w.archon!.numarade;
  if (houseId === w.playerHouseId) throw new Error('The Capanna advises the Exarchon: it cannot be the Exarchon\'s own house.');
  const old = n.capanna.find((s) => s.role === role);
  if (old) { shift(w, old.houseId, w.playerHouseId, -15); chairLog(w, `Dismissed House ${w.archon!.houses[old.houseId]?.name}'s ${role.toLowerCase()}`); }
  const who = name(w, houseId);
  n.capanna = [...n.capanna.filter((s) => s.role !== role), { role, houseId, name: who.name, ...(who.personId ? { personId: who.personId } : {}) }];
  shift(w, houseId, w.playerHouseId, 12);
  // The Great Houses passed over notice.
  for (const h of Object.values(w.archon!.houses)) if (!h.ended && h.tier === 'great' && h.id !== houseId && h.id !== w.playerHouseId && !n.capanna.some((s) => s.houseId === h.id)) shift(w, h.id, w.playerHouseId, -2);
  w.chair!.promises = w.chair!.promises.filter((h) => h !== houseId);
  chairLog(w, `${who.name} of House ${w.archon!.houses[houseId]?.name} named ${role.toLowerCase()}`);
  return w;
}

export function dismissAdviser(input: World, role: string, shift: (w: World, a: string, b: string, by: number) => void): World {
  const w = clone(input);
  need(w);
  const n = w.archon!.numarade;
  const old = n.capanna.find((s) => s.role === role);
  if (!old) return w;
  n.capanna = n.capanna.filter((s) => s.role !== role);
  shift(w, old.houseId, w.playerHouseId, -18);
  chairLog(w, `Dismissed ${old.name} of House ${w.archon!.houses[old.houseId]?.name}`);
  return w;
}

export function setGuard(input: World, id: string, level: GuardLevel): World {
  const w = clone(input);
  const c = ensureChair(w);
  if (w.characters[id]?.houseId !== w.playerHouseId) throw new Error('Not one of ours.');
  if (level) c.guards[id] = level; else delete c.guards[id];
  return w;
}

export function chooseRegent(input: World, id: string): World {
  const w = clone(input);
  const h = need(w);
  const p = w.characters[id];
  if (!p?.alive || p.houseId !== w.playerHouseId || id === h.exarchonId) throw new Error('Not someone who can be regent.');
  const old = h.regentId ? w.characters[h.regentId] : undefined;
  if (old) old.flags = old.flags.filter((f) => f.id !== 'regent');
  h.regentId = id;
  p.flags.push({ id: 'regent', since: w.date });
  delete p.veiled; p.tier = 'full'; p.pinned = true;
  chairLog(w, `${p.name.given} named regent of the house`);
  return w;
}

/** How well the house is run with its Highroy at the chair: the regent's hand on the council. */
export function regencyFactor(w: World, houseId: string): number {
  if (houseId !== w.playerHouseId || !w.chair?.held) return 0.9;
  const r = w.chair?.held?.regentId ? w.characters[w.chair.held.regentId] : undefined;
  if (!r?.alive) return 0.75;
  return clamp(0.78 + (r.stats.leadership + r.stats.stewardship) / 120, 0.8, 1.05);
}

export type DecreeKind = 'peace' | 'summon' | 'quota' | 'pardon' | 'levy' | 'strike';
export const DECREE_COST: Record<DecreeKind, number> = { peace: 2, summon: 1, quota: 1, pardon: 1, levy: 2, strike: 1 };
export const DECREE_LABEL: Record<DecreeKind, string> = {
  peace: 'Order a war to end', summon: 'Summon a house to answer', quota: 'Move navisium quota between houses',
  pardon: 'End a feud by decree', levy: 'Levy the Great Houses for the Archon', strike: 'Strike a motion from the agenda',
};

export function payDecree(w: World, kind: DecreeKind): void { spend(w, DECREE_COST[kind]); }

export const seedRng = (w: World, salt: string) => Rng.fromSeed(`${w.rng}/${salt}/${w.nextId}`);
