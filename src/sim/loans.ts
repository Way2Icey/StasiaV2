// Loans: only houses lend. Money moves between houses with interest, a term and something put up as security.
import { Rng } from './rng';
import { displayName } from './names';
import { econ, record, heldSectors } from './economy';
import { relation, shiftRelation } from './relations';
import { logRecord } from './records';
import { reservesOf, storeInVault } from './holdings';
import { setBond } from './relationships';
import { ageOf } from './characters';
import { SPECIES } from '../data/species';
import { absoluteCycle, addCycles, CYCLES_PER_ORBIT, CYCLES_PER_PHASE, type GameDate } from './time';
import type { World } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const H = (w: World, id: string) => `House ${w.houses[id]?.name ?? id}`;

export type CollateralKind = 'none' | 'revenue' | 'caige' | 'ward';
export const COLLATERAL_LABEL: Record<CollateralKind, string> = {
  none: 'Their word',
  revenue: "A sector's revenue",
  caige: 'A Caige',
  ward: 'A ward of the family',
};
export const COLLATERAL_NOTE: Record<CollateralKind, string> = {
  none: 'Nothing but honour. Default costs the borrower dearly in honour and regard.',
  revenue: "If they default, the lender takes that sector's othes for two Orbits.",
  caige: 'Held in the lender\'s vault until the debt is paid. Lost on default.',
  ward: 'A young member of the family lives at the lender\'s court until it is paid. On default they stay, as a hostage.',
};

export interface Collateral { kind: CollateralKind; id?: string; label?: string }

export interface Loan {
  id: string;
  lender: string;
  borrower: string;
  principal: number;
  /** Still owed, interest included. */
  owed: number;
  /** Interest per Phase on what is owed. */
  rate: number;
  start: GameDate;
  due: GameDate;
  collateral: Collateral;
  status: 'active' | 'repaid' | 'defaulted' | 'forgiven' | 'seized' | 'extended';
  missed: number;
  /** For the player as borrower: pay the instalment from the coffers each Phase. */
  autopay?: boolean;
  /** The lender has been told it is overdue and must choose. */
  overdue?: boolean;
  purpose?: string;
}

/** A house asking us (or anyone) for money, or a lender's answer to us. */
export interface LoanAsk {
  id: string;
  from: string;
  to: string;
  amount: number;
  rate: number;
  orbits: number;
  collateral: Collateral;
  expires: GameDate;
  /** 'ask': `from` wants to borrow from `to`. 'offer': `from` will lend to `to` on these terms. */
  kind: 'ask' | 'offer';
  reason?: string;
}

export interface LoansState { loans: Record<string, Loan>; asks: LoanAsk[] }

export function ensureLoans(world: World): void {
  world.loans ??= { loans: {}, asks: [] };
  world.loans.asks ??= [];
}

export function loansOf(world: World, houseId: string): Loan[] {
  return Object.values(world.loans?.loans ?? {}).filter((l) => (l.lender === houseId || l.borrower === houseId) && (l.status === 'active' || l.status === 'extended'));
}

export function debtOf(world: World, houseId: string): number {
  return loansOf(world, houseId).filter((l) => l.borrower === houseId).reduce((n, l) => n + l.owed, 0);
}

function phasesLeft(world: World, l: Loan): number {
  return Math.max(1, Math.ceil((absoluteCycle(l.due) - absoluteCycle(world.date)) / CYCLES_PER_PHASE));
}

export function instalment(world: World, l: Loan): number {
  return Math.ceil(l.owed / phasesLeft(world, l));
}

/** What a house could spare to lend right now. */
export function canLend(world: World, houseId: string): number {
  const stock = econ(world, houseId).stock.othes;
  return Math.max(0, Math.round(stock * 0.6 + reservesOf(world, houseId) * 0.5 - 3000));
}

/** Is this house good for it? 0..1 from honour, debts and regard. */
export function creditworthiness(world: World, borrower: string, lender: string): number {
  const h = world.houses[borrower];
  if (!h) return 0;
  const debt = debtOf(world, borrower);
  const income = Math.max(1000, (reservesOf(world, borrower) + econ(world, borrower).stock.othes) / 4);
  const defaults = Object.values(world.loans.loans).filter((l) => l.borrower === borrower && l.status === 'defaulted').length;
  return clamp(h.standing.honour / 100 - debt / (income * 6) + relation(world, lender, borrower) / 300 - defaults * 0.15, 0, 1);
}

/** The rate a lender asks: greedier lenders and shakier borrowers pay more. */
export function rateFor(world: World, lender: string, borrower: string): number {
  const g = world.houses[lender]?.personality.greed ?? 0.5;
  const trust = creditworthiness(world, borrower, lender);
  return Math.round((0.01 + g * 0.025 + (1 - trust) * 0.03) * 1000) / 1000;
}

function collateralOptions(world: World, houseId: string): Collateral[] {
  const out: Collateral[] = [{ kind: 'none' }];
  const s = heldSectors(world, houseId)[0];
  if (s) out.push({ kind: 'revenue', id: s.id, label: s.name });
  const c = Object.values(world.armoury).find((x) => x.houseId === houseId && !x.bondedTo);
  if (c) out.push({ kind: 'caige', id: c.id, label: c.name });
  const ward = wardCandidate(world, houseId);
  if (ward) out.push({ kind: 'ward', id: ward, label: displayName(world.characters[ward]!.name) });
  return out;
}

export function collateralFor(world: World, houseId: string): Collateral[] { return collateralOptions(world, houseId); }

/** The youngest of the ruling family old enough to travel. */
function wardCandidate(world: World, houseId: string): string | undefined {
  const lord = world.characters[world.houses[houseId]?.rulerId ?? ''];
  if (!lord) return undefined;
  return Object.values(world.characters)
    .filter((c) => c.alive && c.familyId === lord.familyId && c.id !== lord.id && c.tier === 'full' && !c.seat && !c.flags.some((f) => f.id === 'ward' || f.id === 'captive'))
    .filter((c) => { const a = ageOf(c, world.date); const ad = SPECIES[c.species].adulthood; return a >= ad * 0.5 && a < ad * 1.4; })
    .sort((a, b) => ageOf(a, world.date) - ageOf(b, world.date))[0]?.id;
}

// ---------------------------------------------------------------- making a loan

function open(world: World, a: { lender: string; borrower: string; amount: number; rate: number; orbits: number; collateral: Collateral; spend?: string }): Loan | null {
  const e = econ(world, a.lender);
  if (e.stock.othes < a.amount) return null;
  const id = `loan${world.nextId++}`;
  const l: Loan = {
    id, lender: a.lender, borrower: a.borrower, principal: a.amount, owed: a.amount, rate: a.rate,
    start: world.date, due: addCycles(world.date, a.orbits * CYCLES_PER_ORBIT), collateral: a.collateral, status: 'active', missed: 0,
    autopay: a.borrower === world.playerHouseId ? true : undefined,
  };
  record(world, a.lender, { resource: 'othes', amount: -a.amount, label: `Lent to ${H(world, a.borrower)}`, kind: 'trade' });
  record(world, a.borrower, { resource: 'othes', amount: a.amount, label: `Borrowed from ${H(world, a.lender)}`, kind: 'trade' });
  world.loans.loans[id] = l;
  l.purpose = a.spend;
  if (a.spend && a.borrower !== world.playerHouseId) record(world, a.borrower, { resource: 'othes', amount: -Math.round(a.amount * 0.75), label: `Spent ${a.spend}`, kind: 'develop' });
  // Security changes hands now where it must.
  if (a.collateral.kind === 'caige' && a.collateral.id) {
    const c = world.armoury[a.collateral.id];
    if (c) { c.pledgedTo = a.lender; }
  }
  if (a.collateral.kind === 'ward' && a.collateral.id) {
    const c = world.characters[a.collateral.id];
    if (c) {
      c.flags.push({ id: 'ward', since: world.date, detail: `security for a debt, at the court of ${H(world, a.lender)}` });
      const home = world.planets[world.houses[a.lender]?.capitalPlanetId ?? ''];
      if (home) c.location = { planetId: home.id, sectorId: home.sectors[0]!.id };
    }
  }
  const lr = world.houses[a.lender]?.rulerId;
  const br = world.houses[a.borrower]?.rulerId;
  if (lr && br) setBond(world, lr, br, 'creditor', 'debtor', `a loan of ${fmt(a.amount)} othes`);
  shiftRelation(world, a.borrower, a.lender, 6);
  const P = world.playerHouseId;
  if (a.lender === P || a.borrower === P) {
    logRecord(world, {
      kind: 'world', type: 'economy', severity: 1,
      text: a.lender === P ? `We lend ${fmt(a.amount)} othes to ${H(world, a.borrower)} at ${(a.rate * 100).toFixed(1)}% a Phase.` : `${H(world, a.lender)} lends us ${fmt(a.amount)} othes at ${(a.rate * 100).toFixed(1)}% a Phase.`,
      detail: `Due ${a.orbits} Orbits from now. Security: ${COLLATERAL_LABEL[a.collateral.kind]}${a.collateral.label ? ` (${a.collateral.label})` : ''}.`,
      houseIds: [a.lender, a.borrower], effects: [`${H(world, a.borrower)} regard +6`],
    });
  } else {
    logRecord(world, { kind: 'world', type: 'economy', severity: 0, text: `${H(world, a.lender)} has lent ${H(world, a.borrower)} ${fmt(a.amount)} othes.`, houseIds: [a.lender, a.borrower], source: 'talk at the Exchange' });
  }
  return l;
}

/** What a house would say if we asked it for money. Null means no. */
export function quoteFor(world: World, lender: string, amount: number, orbits: number): { rate: number; collateral: Collateral; why?: string } | { no: string } {
  const P = world.playerHouseId;
  if (lender === P) return { no: 'We cannot lend to ourselves.' };
  if (amount > canLend(world, lender)) return { no: `${H(world, lender)} cannot spare that much.` };
  const reg = relation(world, lender, P);
  if (reg < -25) return { no: `${H(world, lender)} will not lend to a house it dislikes.` };
  const trust = creditworthiness(world, P, lender);
  if (trust < 0.2) return { no: `${H(world, lender)} doubts we would pay it back.` };
  const opts = collateralOptions(world, P);
  // Bigger loans and shakier names want security.
  const wants: CollateralKind = amount > 20000 || trust < 0.45 ? (opts.some((o) => o.kind === 'ward') && (world.houses[lender]?.personality.intrigue ?? 0) > 0.5 ? 'ward' : opts.some((o) => o.kind === 'caige') && amount > 30000 ? 'caige' : 'revenue') : 'none';
  const collateral = opts.find((o) => o.kind === wants) ?? { kind: 'none' as const };
  return { rate: rateFor(world, lender, P) + (orbits > 4 ? 0.005 : 0), collateral };
}

export function borrow(input: World, lender: string, amount: number, orbits: number): World {
  const w = structuredClone(input);
  ensureLoans(w);
  const q = quoteFor(w, lender, amount, orbits);
  if ('no' in q) throw new Error(q.no);
  const l = open(w, { lender, borrower: w.playerHouseId, amount, rate: q.rate, orbits, collateral: q.collateral });
  if (!l) throw new Error('They cannot lend that now.');
  return w;
}

export function answerAsk(input: World, askId: string, yes: boolean): World {
  const w = structuredClone(input);
  ensureLoans(w);
  const a = w.loans.asks.find((x) => x.id === askId);
  if (!a) return w;
  w.loans.asks = w.loans.asks.filter((x) => x.id !== askId);
  if (!yes) {
    shiftRelation(w, a.from, a.to, a.kind === 'ask' ? -4 : 0);
    logRecord(w, { kind: 'world', type: 'economy', severity: 0, text: `We turn down ${H(w, a.from)}'s request for ${fmt(a.amount)} othes.`, houseIds: [a.from] });
    return w;
  }
  const l = a.kind === 'ask'
    ? open(w, { lender: a.to, borrower: a.from, amount: a.amount, rate: a.rate, orbits: a.orbits, collateral: a.collateral, spend: a.reason })
    : open(w, { lender: a.from, borrower: a.to, amount: a.amount, rate: a.rate, orbits: a.orbits, collateral: a.collateral });
  if (!l) throw new Error('Not enough othes.');
  return w;
}

export function repay(input: World, loanId: string, amount: number): World {
  const w = structuredClone(input);
  const l = w.loans.loans[loanId];
  if (!l || l.borrower !== w.playerHouseId) return w;
  const pay = Math.max(0, Math.min(amount, l.owed, econ(w, l.borrower).stock.othes));
  payInPlace(w, l, pay);
  return w;
}

export function setAutopay(input: World, loanId: string, on: boolean): World {
  const w = structuredClone(input);
  const l = w.loans.loans[loanId];
  if (l) l.autopay = on;
  return w;
}

/** The lender's choice when a debt runs past its day. */
export function settleDefault(input: World, loanId: string, how: 'seize' | 'forgive' | 'extend'): World {
  const w = structuredClone(input);
  const l = w.loans.loans[loanId];
  if (!l || l.lender !== w.playerHouseId || !l.overdue) return w;
  settleInPlace(w, l, how);
  return w;
}

function payInPlace(w: World, l: Loan, pay: number) {
  if (pay <= 0) return;
  record(w, l.borrower, { resource: 'othes', amount: -pay, label: `Repaid to ${H(w, l.lender)}`, kind: 'trade' });
  record(w, l.lender, { resource: 'othes', amount: pay, label: `Repaid by ${H(w, l.borrower)}`, kind: 'trade' });
  l.owed = Math.max(0, Math.round(l.owed - pay));
  if (l.owed === 0) close(w, l, 'repaid');
}

function releaseSecurity(w: World, l: Loan) {
  if (l.collateral.kind === 'caige' && l.collateral.id) { const c = w.armoury[l.collateral.id]; if (c) delete c.pledgedTo; }
  if (l.collateral.kind === 'ward' && l.collateral.id) {
    const c = w.characters[l.collateral.id];
    if (c) {
      c.flags = c.flags.filter((f) => !(f.id === 'ward' && /security for a debt/.test(f.detail ?? '')));
      const home = w.planets[w.houses[c.houseId]?.capitalPlanetId ?? ''];
      if (home) c.location = { planetId: home.id, sectorId: home.sectors[0]!.id };
    }
  }
}

function close(w: World, l: Loan, status: Loan['status']) {
  l.status = status;
  l.overdue = false;
  releaseSecurity(w, l);
  const lr = w.houses[l.lender]?.rulerId;
  const br = w.houses[l.borrower]?.rulerId;
  if (lr && br && !loansOf(w, l.borrower).some((x) => x.lender === l.lender)) setBond(w, lr, br, undefined, undefined, status === 'repaid' ? 'the debt is paid' : 'the debt is settled');
  if (status === 'repaid') {
    const h = w.houses[l.borrower]!;
    h.standing.honour = clamp(h.standing.honour + 2, 0, 100);
    shiftRelation(w, l.lender, l.borrower, 5);
    if (l.lender === w.playerHouseId || l.borrower === w.playerHouseId) logRecord(w, { kind: 'world', type: 'economy', severity: 1, text: `${l.borrower === w.playerHouseId ? 'We have' : `${H(w, l.borrower)} has`} paid off the loan from ${l.lender === w.playerHouseId ? 'us' : H(w, l.lender)}.`, effects: ['Honour +2'], houseIds: [l.lender, l.borrower] });
  }
}

function settleInPlace(w: World, l: Loan, how: 'seize' | 'forgive' | 'extend') {
  const P = w.playerHouseId;
  const ours = l.lender === P || l.borrower === P;
  if (how === 'extend') {
    l.due = addCycles(w.date, CYCLES_PER_ORBIT * 2);
    l.status = 'extended';
    l.overdue = false;
    l.rate = Math.round(l.rate * 1.3 * 1000) / 1000;
    shiftRelation(w, l.borrower, l.lender, 6);
    if (ours) logRecord(w, { kind: 'world', type: 'economy', severity: 1, text: `${l.lender === P ? 'We give' : `${H(w, l.lender)} gives`} ${l.borrower === P ? 'us' : H(w, l.borrower)} two more Orbits to pay, at a steeper rate.`, houseIds: [l.lender, l.borrower] });
    return;
  }
  if (how === 'forgive') {
    shiftRelation(w, l.borrower, l.lender, 25);
    w.houses[l.lender]!.standing.honour = clamp(w.houses[l.lender]!.standing.honour + 3, 0, 100);
    close(w, l, 'forgiven');
    if (ours) logRecord(w, { kind: 'world', type: 'economy', severity: 2, text: `${l.lender === P ? 'We forgive' : `${H(w, l.lender)} forgives`} ${l.borrower === P ? 'our' : `${H(w, l.borrower)}'s`} debt of ${fmt(l.owed)} othes.`, effects: [`${H(w, l.borrower)} regard +25`, `${H(w, l.lender)} honour +3`], houseIds: [l.lender, l.borrower] });
    return;
  }
  // Seize the security.
  const effects: string[] = [];
  const k = l.collateral;
  if (k.kind === 'caige' && k.id && w.armoury[k.id]) {
    const c = w.armoury[k.id]!;
    delete c.pledgedTo;
    if (c.bondedTo) { const b = w.characters[c.bondedTo]; if (b) b.flags = b.flags.filter((f) => f.id !== 'caigeBonded'); c.bondedTo = undefined; }
    c.houseId = l.lender;
    c.vaultId = undefined;
    storeInVault(w, c);
    effects.push(`${c.name} goes to ${H(w, l.lender)}`);
  } else if (k.kind === 'revenue' && k.id) {
    const until = addCycles(w.date, CYCLES_PER_ORBIT * 2);
    const per = Math.max(200, Math.round(l.owed / 10));
    econ(w, l.lender).boons.push({ id: `b${w.nextId++}`, label: `Revenue of ${k.label ?? 'a sector'} (seized)`, flow: { othes: per }, until });
    econ(w, l.borrower).boons.push({ id: `b${w.nextId++}`, label: `${k.label ?? 'A sector'}'s revenue to ${H(w, l.lender)}`, flow: { othes: -per }, until });
    effects.push(`${fmt(per)} othes a Phase to ${H(w, l.lender)} for two Orbits`);
  } else if (k.kind === 'ward' && k.id) {
    const c = w.characters[k.id];
    if (c?.alive) {
      c.flags = c.flags.filter((f) => f.id !== 'ward');
      c.flags.push({ id: 'captive', since: w.date, detail: `held by ${H(w, l.lender)}`, knownBy: [l.lender, l.borrower] });
      w.captives[c.id] = { characterId: c.id, heldBy: l.lender, since: w.date, interrogated: false, reason: 'leverage', treatment: 'decent' };
      effects.push(`${displayName(c.name)} is now a hostage`);
    }
  }
  w.houses[l.lender]!.standing.dread = clamp(w.houses[l.lender]!.standing.dread + 2, 0, 100);
  shiftRelation(w, l.borrower, l.lender, -15);
  l.status = 'seized';
  l.overdue = false;
  if (k.kind !== 'ward') releaseSecurity(w, l);
  if (ours) logRecord(w, {
    kind: 'world', type: 'economy', severity: 2,
    text: `${l.lender === P ? 'We seize' : `${H(w, l.lender)} seizes`} what ${l.borrower === P ? 'we' : H(w, l.borrower)} put up for the loan.`,
    effects: [...effects, 'Dread +2', `${H(w, l.borrower)} regard −15`], houseIds: [l.lender, l.borrower],
  });
}

// ---------------------------------------------------------------- the passage of time

function defaultLoan(w: World, rng: Rng, l: Loan) {
  const P = w.playerHouseId;
  const b = w.houses[l.borrower]!;
  b.standing.honour = clamp(b.standing.honour - 8, 0, 100);
  shiftRelation(w, l.lender, l.borrower, -20);
  l.overdue = true;
  if (l.lender === P || l.borrower === P) {
    logRecord(w, {
      kind: 'world', type: 'economy', severity: 3,
      text: `${l.borrower === P ? 'We have' : `${H(w, l.borrower)} has`} failed to repay ${l.lender === P ? 'us' : H(w, l.lender)}: ${fmt(l.owed)} othes outstanding.`,
      detail: l.lender === P ? 'Seize what they put up, forgive it, or give them more time.' : 'What they do now is up to them.',
      effects: [`${H(w, l.borrower)} honour −8`, `${H(w, l.lender)}'s regard −20`], houseIds: [l.lender, l.borrower],
    });
    if (w.ports) w.ports.alerts += l.lender === P ? 1 : 0;
  }
  if (l.lender !== P) {
    const p = w.houses[l.lender]!.personality;
    const how = rng.chance(p.aggression * 0.7 + p.greed * 0.3) ? 'seize' : l.status === 'extended' ? 'seize' : rng.chance(p.honour * 0.3) ? 'forgive' : 'extend';
    settleInPlace(w, l, how);
  }
}

/** AI houses short of money ask the rich for it; we may be the rich. */
function aiAsks(w: World, rng: Rng) {
  const P = w.playerHouseId;
  for (const h of Object.values(w.houses)) {
    if (h.id === P) continue;
    const e = econ(w, h.id);
    const broke = e.stock.othes < 2500 && reservesOf(w, h.id) < 4000;
    // Or a project bigger than the purse: a warship, an academy, a war chest.
    const project = !broke && e.stock.othes < 20000 && rng.chance(0.02 + h.personality.aggression * 0.02 + h.personality.greed * 0.01);
    if (!broke && !project) continue;
    if (w.loans.asks.some((a) => a.from === h.id) || debtOf(w, h.id) > 40000) continue;
    if (broke && !rng.chance(0.4)) continue;
    const lenders = Object.values(w.houses).filter((o) => o.id !== h.id && relation(w, o.id, h.id) > -20 && canLend(w, o.id) > 6000);
    if (!lenders.length) continue;
    const ranked = lenders.sort((a, b) => canLend(w, b.id) + relation(w, b.id, h.id) * 300 - (canLend(w, a.id) + relation(w, a.id, h.id) * 300));
    const to = ranked[0]!.id === P && ranked.length > 1 && rng.chance(0.4) ? ranked[1]! : ranked[0]!;
    const amount = Math.round(Math.min(canLend(w, to.id) * 0.5, 6000 + rng.next() * 14000) / 500) * 500;
    const opts = collateralOptions(w, h.id);
    const collateral = amount > 12000 ? (opts.find((o) => o.kind === 'ward') ?? opts.find((o) => o.kind === 'revenue') ?? opts[0]!) : (rng.chance(0.5) ? opts.find((o) => o.kind === 'revenue') ?? opts[0]! : opts[0]!);
    const ask: LoanAsk = {
      id: `ask${w.nextId++}`, from: h.id, to: to.id, amount, rate: Math.round((0.012 + rng.next() * 0.02) * 1000) / 1000, orbits: 2 + Math.floor(rng.next() * 4),
      collateral, expires: addCycles(w.date, CYCLES_PER_PHASE * 2), kind: 'ask',
      reason: broke
        ? rng.pick(['to pay their knights', 'after a poor harvest', 'to cover a shortfall at the Exchange', 'to rebuild after a raid', 'to keep their council paid'])
        : rng.pick(['to fit out a new warship', 'to found an academy', 'to buy navisium ahead of the quota', 'for a dowry', 'to build a new quarter', 'for a war chest, they say, against corsairs']),
    };
    if (to.id === P) {
      w.loans.asks.push(ask);
      logRecord(w, { kind: 'world', type: 'economy', severity: 1, text: `${H(w, h.id)} asks to borrow ${fmt(amount)} othes from us, ${ask.reason}.`, houseIds: [h.id], detail: `They offer ${(ask.rate * 100).toFixed(1)}% a Phase over ${ask.orbits} Orbits, with ${COLLATERAL_LABEL[collateral.kind].toLowerCase()}${collateral.label ? ` (${collateral.label})` : ''} as security.` });
      w.ports && (w.ports.alerts += 1);
    } else {
      // Between other houses: the lender decides.
      const yes = creditworthiness(w, h.id, to.id) > 0.3 && rng.chance(0.4 + to.personality.greed * 0.4);
      if (yes) open(w, { lender: to.id, borrower: h.id, amount, rate: rateFor(w, to.id, h.id), orbits: ask.orbits, collateral, spend: ask.reason });
    }
  }
}

export function advanceLoans(world: World, rng: Rng, phaseTurned: boolean): void {
  ensureLoans(world);
  const now = absoluteCycle(world.date);
  const P = world.playerHouseId;
  world.loans.asks = world.loans.asks.filter((a) => absoluteCycle(a.expires) > now);
  if (!phaseTurned) return;
  for (const l of Object.values(world.loans.loans)) {
    if (l.status !== 'active' && l.status !== 'extended') continue;
    if (l.overdue) continue;
    // Interest.
    l.owed = Math.round(l.owed * (1 + l.rate));
    // Leverage: a debtor does not easily turn on its creditor.
    if (relation(world, l.borrower, l.lender) < -20) world.relations[l.borrower]![l.lender] = -20;
    // Payment.
    const due = instalment(world, l);
    const e = econ(world, l.borrower);
    const auto = l.borrower === P ? l.autopay !== false : true;
    const can = l.borrower === P ? e.stock.othes : Math.max(0, e.stock.othes - 1500);
    if (auto && can >= due) payInPlace(world, l, due);
    else if (auto && l.borrower !== P && reservesOf(world, l.borrower) > due) {
      // Draw from the vault to pay.
      for (const v of Object.values(world.holdings.modules)) if (v.kind === 'vault' && v.houseId === l.borrower && (v.drives ?? 0) >= due) { v.drives! -= due; e.stock.othes += due; break; }
      payInPlace(world, l, due);
    } else {
      l.missed++;
      if (l.borrower === P && auto) logRecord(world, { kind: 'world', type: 'economy', severity: 2, text: `We could not make this Phase's payment of ${fmt(due)} othes to ${H(world, l.lender)}.`, houseIds: [l.lender], effects: ['A missed payment'] });
    }
    if ((l.status === 'active' || l.status === 'extended') && absoluteCycle(l.due) <= now && l.owed > 0) defaultLoan(world, rng, l);
  }
  aiAsks(world, rng);
}

