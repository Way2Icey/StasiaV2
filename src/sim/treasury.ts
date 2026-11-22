// Great expenses: what a rich house spends on when the bills are paid. A fully funded Crucible bid,
// a quiet word (and purse) for the Numarade's draw, and great works that stand for generations.
import { Rng } from './rng';
import { econ, record } from './economy';
import { logRecord } from './records';
import { dateParts } from './time';
import type { World } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface Work { id: WorkId; paid: number; done?: boolean; started: number }
export type WorkId = 'spire' | 'archive' | 'arena';
export const WORKS: Record<WorkId, { name: string; cost: number; note: string; effect: string }> = {
  spire: { name: 'The Spire', cost: 40000, note: 'A tower over the capital that every ship sees on approach.', effect: 'Respect +6, honour +2, for good.' },
  archive: { name: 'The Great Archive', cost: 30000, note: 'Every record of the house, kept and taught from.', effect: 'Pupils pass the trials more often; the Elder misses nothing.' },
  arena: { name: 'The House Arena', cost: 35000, note: 'A proper ground for tourneys and the circuit, at home.', effect: 'Our fighters improve faster; hosting tourneys costs half.' },
};
export const WORK_RATE = 2500;

export interface TreasuryState {
  works: Work[];
  /** Years the Crucible bid was fully funded. */
  funded: number[];
  /** A year the Numarade has been paid to draw us. */
  bribed?: number;
}

export function ensureTreasury(world: World): void {
  world.treasury ??= { works: [], funded: [] };
  world.treasury.works ??= [];
  world.treasury.funded ??= [];
}

export const hasWork = (world: World, id: WorkId) => !!world.treasury?.works.some((x) => x.id === id && x.done);

// ---------------------------------------------------------------- the Crucible bid

export const FUND_COST = 8000;
export function cannotFund(world: World): string | null {
  const cr = world.crucible;
  const P = world.playerHouseId;
  if (!cr || cr.stage !== 'drawn' || !cr.entrants.includes(P)) return 'Only once we are drawn';
  if (world.treasury?.funded.includes(cr.year)) return 'Already funded';
  if (econ(world, P).stock.othes < FUND_COST) return 'Not enough othes';
  return null;
}
/** Better provisions, better kit, better ships to the field: a real edge. */
export function fundBid(input: World): World {
  const w = structuredClone(input);
  ensureTreasury(w);
  const why = cannotFund(w);
  if (why) throw new Error(why);
  record(w, w.playerHouseId, { resource: 'othes', amount: -FUND_COST, label: 'Funding the Crucible bid in full', kind: 'court' });
  w.treasury.funded.push(w.crucible.year);
  logRecord(w, { kind: 'world', type: 'economy', severity: 1, seat: 'steward', text: `The Crucible bid is funded in full: the best kit, fresh provisions, a second transport. The Marshal is grateful.` });
  return w;
}
export const fundedEdge = (world: World, h: string) => (h === world.playerHouseId && world.treasury?.funded.includes(world.crucible?.year ?? -1) ? 1.08 : 1);

// ---------------------------------------------------------------- the Numarade's draw

export const BRIBE_COST = 6000;
export function cannotBribe(world: World): string | null {
  const year = dateParts(world.date).year;
  const target = dateParts(world.date).orbit < 4 ? year : year + 1;
  if (world.treasury?.bribed === target) return 'Already paid';
  if (econ(world, world.playerHouseId).stock.othes < BRIBE_COST) return 'Not enough othes';
  return null;
}
/** A purse for the right clerk: we are drawn for the next Crucible. It may come out. */
export function bribeDraw(input: World): World {
  const w = structuredClone(input);
  ensureTreasury(w);
  const why = cannotBribe(w);
  if (why) throw new Error(why);
  const d = dateParts(w.date);
  w.treasury.bribed = d.orbit < 4 ? d.year : d.year + 1;
  const P = w.playerHouseId;
  record(w, P, { resource: 'othes', amount: -BRIBE_COST, label: 'A consideration for the Numarade', kind: 'court' });
  const rng = new Rng(w.rng);
  if (rng.chance(0.3)) {
    const st = w.houses[P]!.standing;
    st.honour = clamp(st.honour - 3, 0, 100); st.respect = clamp(st.respect - 2, 0, 100);
    logRecord(w, { kind: 'intrigue', type: 'politics', severity: 2, seat: 'envoy', text: 'Word is out that we paid the Numarade for a place in the draw. The other courts are amused, and not kindly.', effects: ['Honour −3', 'Respect −2'] });
  } else {
    logRecord(w, { kind: 'intrigue', type: 'politics', severity: 1, seat: 'spymaster', text: `The right clerk has been paid. We will be drawn for the Crucible of ${w.treasury.bribed}.` });
  }
  w.rng = rng.state;
  return w;
}

// ---------------------------------------------------------------- great works

export function cannotStartWork(world: World, id: WorkId): string | null {
  if (world.treasury?.works.some((x) => x.id === id)) return 'Already begun';
  if (world.treasury?.works.some((x) => !x.done)) return 'One great work at a time';
  if (econ(world, world.playerHouseId).stock.othes < WORK_RATE * 2) return 'Not enough othes to begin';
  return null;
}
export function startWork(input: World, id: WorkId): World {
  const w = structuredClone(input);
  ensureTreasury(w);
  const why = cannotStartWork(w, id);
  if (why) throw new Error(why);
  w.treasury.works.push({ id, paid: 0, started: dateParts(w.date).year });
  logRecord(w, { kind: 'world', type: 'economy', severity: 1, seat: 'steward', text: `Work begins on ${WORKS[id].name}. ${WORKS[id].note}` });
  return w;
}

/** Each Phase, the work takes what the treasury can spare. */
export function advanceTreasury(world: World, phaseTurned: boolean): void {
  ensureTreasury(world);
  if (!phaseTurned) return;
  const P = world.playerHouseId;
  for (const x of world.treasury.works) {
    if (x.done) continue;
    const def = WORKS[x.id];
    const e = econ(world, P);
    const pay = Math.min(WORK_RATE, def.cost - x.paid);
    if (e.stock.othes < pay + 2000) continue; // the Steward will not empty the vaults for stone
    record(world, P, { resource: 'othes', amount: -pay, label: `Building ${def.name}`, kind: 'develop' });
    x.paid += pay;
    if (x.paid >= def.cost) {
      x.done = true;
      const st = world.houses[P]!.standing;
      if (x.id === 'spire') { st.respect = clamp(st.respect + 6, 0, 100); st.honour = clamp(st.honour + 2, 0, 100); }
      logRecord(world, { kind: 'world', type: 'world', severity: 3, seat: 'steward', text: `${def.name} is finished. ${def.effect}` });
    }
  }
}
