// What standing costs. A house that rises is expected to live like it: its councillors, knights and
// famous are paid like the servants of a Great House, its legions are armed to the standard of their rank,
// it owes the Numarade and the chair, and every knighting, promotion, birth and funeral is owed a ceremony
// worth the house's name. And because an othe is a bound commitment, valued by the credibility of whoever
// issued it, a house that cannot pay what it has promised finds its money worth less everywhere.
import type { LedgerLine, World } from './types';
import { absoluteCycle, dateParts, CYCLES_PER_ORBIT } from './time';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round = (n: number) => Math.round(n);
const H = (w: World, id: string) => w.economy?.houses[id];

export type EquipLevel = 0 | 1 | 2 | 3;
export const EQUIP_LABEL = ['Old issue', 'Shard and armour', 'Shields and mechs', 'The finest in the Archon'] as const;
export const EQUIP_NOTE = [
  'Shard rifles a generation old and patched armour. Cheap, and every house can see it.',
  'Shard weapons and power armour for every soldier: what the Archon expects of a Minor House.',
  'Energy shields, Stryder mechs and Goliath tanks with the legions: what a Great House is expected to field.',
  'Every soldier in new power armour, every company with its mechs, shard cannons on every line. Ruinous, and feared.',
] as const;
/** Othes a Phase per soldier, by level. */
export const EQUIP_COST = [0, 0.001, 0.0025, 0.005] as const;
/** What the level does for a formation's power in the field. */
export const EQUIP_POWER = [0.86, 1, 1.1, 1.2] as const;

/** How much the house's station multiplies what it is expected to pay. */
export function standingMult(w: World, houseId: string): number {
  const a = w.archon?.houses[houseId];
  const great = (w.houses[houseId]?.tier ?? a?.tier) === 'great';
  const prestige = a?.prestige ?? 40;
  let m = (great ? 1.4 : 1) * (0.85 + prestige / 200);
  if (w.archon?.numarade.exarchon?.houseId === houseId) m *= 1.25;
  return clamp(m, 0.8, 3);
}

export const expectedEquip = (w: World, houseId: string): EquipLevel => ((w.houses[houseId]?.tier ?? w.archon?.houses[houseId]?.tier) === 'great' ? 2 : 1);
export function equipOf(w: World, houseId: string): EquipLevel {
  const e = H(w, houseId);
  if (e?.equip !== undefined) return e.equip;
  // Other houses arm to their rank, and below it when the coffers are empty.
  const want = expectedEquip(w, houseId);
  return (e && e.stock.othes < 0 && houseId !== w.playerHouseId ? Math.max(0, want - 1) : want) as EquipLevel;
}
export const equipPower = (w: World, houseId: string): number => EQUIP_POWER[equipOf(w, houseId)];

function soldiers(w: World, houseId: string): number {
  return Object.values(w.war?.formations ?? {}).filter((f) => f.houseId === houseId && f.kind !== 'fleet' && f.strength > 0).reduce((t, f) => t + f.strength, 0);
}

/** The standing costs, a Phase: equipment, the court, the famous, and what a Great House owes the Archon. */
export function standingLines(w: World, houseId: string): LedgerLine[] {
  const out: LedgerLine[] = [];
  const S = standingMult(w, houseId);
  const eq = equipOf(w, houseId);
  const arms = round(soldiers(w, houseId) * EQUIP_COST[eq]);
  if (arms) out.push({ resource: 'othes', amount: -arms, label: `Arms of the legions: ${EQUIP_LABEL[eq].toLowerCase()}`, kind: 'forces' });
  let circle = 0, household = 0, famous = 0;
  for (const c of Object.values(w.characters)) {
    if (!c.alive || c.houseId !== houseId) continue;
    if (c.veiled) { household++; continue; }
    circle++;
    if (c.name.epithet && c.seat !== 'highroy') famous++;
  }
  const court = round((circle * 3 + household * 0.3) * S);
  if (court) out.push({ resource: 'othes', amount: -court, label: `The court and household (${circle} at court)`, kind: 'stipend' });
  if (famous) out.push({ resource: 'othes', amount: -round(famous * 20 * S), label: `The famous, whom other houses court (${famous})`, kind: 'stipend' });
  const n = w.archon?.numarade;
  const great = (w.houses[houseId]?.tier) === 'great';
  if (great) out.push({ resource: 'othes', amount: -round(120 * S), label: 'A Great House\'s dues to the Numarade', kind: 'stipend' });
  else if (n?.seats.includes(houseId)) out.push({ resource: 'othes', amount: -round(50 * S), label: 'Keeping a seat in the Numarade', kind: 'stipend' });
  if (n?.exarchon?.houseId === houseId) out.push({ resource: 'othes', amount: -round(300 * S), label: 'The Exarchon\'s household', kind: 'stipend' });
  return out;
}

export function setEquip(input: World, level: EquipLevel): World {
  const w = structuredClone(input);
  H(w, w.playerHouseId)!.equip = level;
  return w;
}

// ---------------------------------------------------------------- credibility

export const credibilityOf = (w: World, houseId: string): number => H(w, houseId)?.credibility ?? 60;

export function shiftCredibility(w: World, houseId: string, by: number): void {
  const e = H(w, houseId);
  if (!e) return;
  e.credibility = clamp((e.credibility ?? 60) + by, 0, 100);
}

/** Each Phase: a house in debt is a house whose promises are worth less; a solvent one slowly earns trust back. */
export function credibilityPhase(w: World, houseId: string): void {
  const e = H(w, houseId);
  if (!e) return;
  const c = e.credibility ?? 60;
  // A few othes short at the turn of a Phase is a late payment; real debt is a broken promise.
  if (e.stock.othes < -1500) shiftCredibility(w, houseId, -1.2);
  else if (e.stock.othes >= 0 && c < 75) shiftCredibility(w, houseId, 0.3);
}

export const credibilityWord = (c: number): string => (c >= 80 ? 'unimpeachable' : c >= 65 ? 'sound' : c >= 50 ? 'ordinary' : c >= 35 ? 'doubted' : c >= 20 ? 'shaky' : 'worthless');

// ---------------------------------------------------------------- ceremonies owed

export const CEREMONY_LABEL = { modest: 'Modest', fitting: 'Fitting', lavish: 'Lavish' } as const;
export const CEREMONY_NOTE = {
  modest: 'Saves money. The honoured notice, and so does every house watching.',
  fitting: 'What the house\'s station is owed.',
  lavish: 'Costly. The honoured remember it, and the Archon talks of it.',
} as const;
const CEREMONY_MULT = { modest: 0.4, fitting: 1, lavish: 2.2 } as const;
const OCCASION = { knighting: 350, rank: 500, funeral: 600, birth: 250, highroyFuneral: 2500 } as const;
type Occasion = keyof typeof OCCASION;

export function setCeremony(input: World, level: 'modest' | 'fitting' | 'lavish'): World {
  const w = structuredClone(input);
  H(w, w.playerHouseId)!.ceremony = level;
  return w;
}

/** Each Orbit: the knightings, promotions, births and funerals since the last, and what they cost the house. */
export function ceremoniesOrbit(w: World, record: (houseId: string, line: LedgerLine) => void): void {
  if (!w.economy) return;
  const now = absoluteCycle(w.date);
  const scan = (w.economy.ceremonyScan ??= { at: now, ranks: {} });
  const since = scan.at;
  scan.at = now;
  const ranks = (w as { legacy?: { ranks: Record<string, string> } }).legacy?.ranks ?? {};
  const found: Record<string, { k: Occasion; id: string }[]> = {};
  const add = (h: string, k: Occasion, id: string) => (found[h] ??= []).push({ k, id });
  for (const c of Object.values(w.characters)) {
    const h = c.houseId;
    if (!h || !w.houses[h] || c.veiled) continue;
    if (c.alive) {
      const kn = c.flags.find((f) => f.id === 'knighted');
      if (kn && absoluteCycle(kn.since) > since) add(h, 'knighting', c.id);
      if (absoluteCycle(c.birth) > since && (c.role === 'Child of the Highroy' || c.role === 'Heir')) add(h, 'birth', c.id);
      if (ranks[c.id] && scan.ranks[c.id] !== ranks[c.id] && scan.ranks[c.id] !== undefined) add(h, 'rank', c.id);
    } else if (c.death && absoluteCycle(c.death.date) > since && c.tier === 'full') {
      add(h, c.id === w.houses[h]!.rulerId || c.seat === 'highroy' || /Highroy/.test(c.role) ? 'highroyFuneral' : 'funeral', c.id);
    }
  }
  // A newly seen rank only counts once it changes, so the first scan does not charge for the whole ladder.
  for (const [id, r] of Object.entries(ranks)) scan.ranks[id] = r;
  for (const [h, list] of Object.entries(found)) {
    const level = h === w.playerHouseId ? (H(w, h)?.ceremony ?? 'fitting') : 'fitting';
    const S = standingMult(w, h);
    const cost = round(list.reduce((t, o) => t + OCCASION[o.k], 0) * S * CEREMONY_MULT[level]);
    const counts = list.reduce<Record<string, number>>((m, o) => ((m[o.k] = (m[o.k] ?? 0) + 1), m), {});
    const words: string[] = [];
    const word: Record<Occasion, [string, string]> = { knighting: ['a knighting', 'knightings'], rank: ['a promotion', 'promotions'], funeral: ['a funeral', 'funerals'], highroyFuneral: ['a Highroy\'s funeral', 'Highroys\' funerals'], birth: ['a birth in the Highroy\'s family', 'births in the Highroy\'s family'] };
    for (const [k, n] of Object.entries(counts)) words.push(n === 1 ? word[k as Occasion][0] : `${n} ${word[k as Occasion][1]}`);
    record(h, { resource: 'othes', amount: -cost, label: `Ceremonies (${level}): ${words.join(', ')}`, kind: 'court' });
    if (h === w.playerHouseId && level !== 'fitting') {
      const st = w.houses[h]!.standing;
      st.respect = clamp(st.respect + (level === 'lavish' ? 1 : -1), 0, 100);
      for (const o of list) { const c = w.characters[o.id]; if (c?.alive) c.mood = clamp((c.mood ?? 60) + (level === 'lavish' ? 8 : -8), 0, 100); }
      if (level === 'lavish' && w.archon?.houses[h]) w.archon.houses[h]!.prestige = clamp(w.archon.houses[h]!.prestige + 0.2 * list.length, 0, 100);
    }
  }
  void CYCLES_PER_ORBIT;
}

// ---------------------------------------------------------------- the year, and festivals

/** Once a year: a house whose legions fall below the standard of its rank is seen to; one above it is feared. */
export function standingYear(w: World): void {
  for (const h of Object.keys(w.houses)) {
    const a = w.archon?.houses[h];
    if (!a) continue;
    const gap = equipOf(w, h) - expectedEquip(w, h);
    if (gap < 0) a.prestige = clamp(a.prestige + gap * 1.5, 0, 100);
    else if (gap > 0) a.prestige = clamp(a.prestige + 0.5, 0, 100);
    const e = H(w, h);
    if (e) { e.lastTally = e.tally ?? {}; e.tally = {}; }
  }
}

/** Count a line into the house's year. */
export function tallyLine(w: World, houseId: string, l: LedgerLine): void {
  if (l.resource !== 'othes' || !l.amount) return;
  const e = H(w, houseId);
  if (!e) return;
  const t = (e.tally ??= {});
  const k = `${l.amount > 0 ? '+' : '-'}${l.kind}`;
  t[k] = (t[k] ?? 0) + l.amount;
}

export const festivalCost = (w: World): number => round(2500 * standingMult(w, w.playerHouseId));
export function cannotHoldFestival(w: World): string | null {
  const e = H(w, w.playerHouseId);
  if (!e) return 'No treasury.';
  if (e.festivalYear === dateParts(w.date).year) return 'A festival has been held this year.';
  if (e.stock.othes < festivalCost(w)) return `Needs ${festivalCost(w).toLocaleString('en-US')} othes.`;
  return null;
}
