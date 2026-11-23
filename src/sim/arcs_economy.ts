// The economy's stories: shocks on the Imperial Exchange (a harvest fails, corsairs close a lane, a new
// seam is found), the Exchange crash (X5), and the debt spiral (S7), the long struggle to get out from
// under our creditors.
import { Rng } from './rng';
import { addEvents, fireStage, type Ctx, type EventDef } from './events';
import { econ, netPerPhase, phaseLedger, sellPrice, tradeInPlace, record } from './economy';
import { debtOf, loansOf, openLoan, settleLoanInPlace } from './loans';
import { nudgePrices } from './exchange';
import { startStruggle, pushStruggle, endStruggle } from './story';
import { openStruggles } from './storystate';
import { logRecord } from './records';
import { relation, shiftRelation } from './relations';
import { seat, nm } from './arckit';
import { absoluteCycle, addCycles, CYCLES_PER_ORBIT, CYCLES_PER_PHASE } from './time';
import { GOODS, RESOURCE_LABEL, type Good } from '../data/economy';
import { activeWars } from './war';
import type { World } from './types';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const H = (w: World, id?: string) => `House ${w.houses[id ?? '']?.name ?? id}`;

// ---------------------------------------------------------------- shocks

export interface Shock { good: Good; mult: number; until: number; cause: string }

const CAUSES: Record<Good, { up: string[]; down: string[] }> = {
  provisions: { up: ['a blight on the farm worlds of the Shallows', 'a failed harvest across the Reaches', 'a war that has emptied the granaries'], down: ['a record harvest in the Reaches', 'grain ships freed from a long blockade'] },
  metals: { up: ['a foundry fire on a Doven world', 'the war\'s hunger for armour', 'a strike in the deep mines'], down: ['a new seam opened by the Doven guilds', 'a glut of salvage from the old war'] },
  fuel: { up: ['corsairs closing the Silent Belt lanes', 'a refinery lost to a Drift storm', 'fleets at war buying every drop'], down: ['a new refinery in the Ember Verge', 'peace, and idle fleets selling stores'] },
  navisium: { up: ['the Numarade tightening the Reserve', 'a quota dispute in the chamber', 'a hoarding scandal at the Reserve'], down: ['a navisium seam charted on the frontier', 'the Reserve releasing old stock'] },
  components: { up: ['the Ko\'renite forges sold out to the war', 'a ban on Shard Works exports', 'a shipyard boom'], down: ['the Ko\'renite forges dumping stock', 'a guild price war'] },
};

export function shocksOf(w: World): Shock[] { return (w.economy as World['economy'] & { shocks?: Shock[] }).shocks ?? []; }

/** Where a good's price is being pulled to by shocks under way (1 = its usual price). */
export function shockMult(w: World, g: Good): number {
  const now = absoluteCycle(w.date);
  return shocksOf(w).filter((s) => s.good === g && s.until > now).reduce((m, s) => m * s.mult, 1);
}

function addShock(w: World, s: Shock): void {
  const e = w.economy as World['economy'] & { shocks?: Shock[] };
  e.shocks = [...(e.shocks ?? []).filter((x) => x.until > absoluteCycle(w.date)), s];
}

/** Once an Orbit: the Exchange may be shaken by something out in the Archon. */
export function marketShocks(w: World, rng: Rng): void {
  // Wars across the Archon drive up what armies use.
  const wars = activeWars(w).filter((x) => x.rung === 'war').length;
  if (wars >= 2 && !shocksOf(w).some((s) => s.good === 'fuel' && s.until > absoluteCycle(w.date))) {
    addShock(w, { good: 'fuel', mult: 1 + 0.12 * wars, until: absoluteCycle(w.date) + CYCLES_PER_ORBIT * 2, cause: `${wars} wars across the Archon` });
  }
  if (!rng.chance(0.1)) return;
  const g = rng.pick([...GOODS]);
  const up = rng.chance(0.6);
  const cause = rng.pick(CAUSES[g][up ? 'up' : 'down']);
  const mult = up ? 1.35 + rng.next() * 0.6 : 0.55 + rng.next() * 0.25;
  addShock(w, { good: g, mult, until: absoluteCycle(w.date) + CYCLES_PER_ORBIT * rng.int(1, 3), cause });
  logRecord(w, {
    kind: 'world', type: 'economy', severity: 1, seat: 'steward',
    text: `The Exchange: ${RESOURCE_LABEL[g].toLowerCase()} ${up ? 'climbs' : 'falls'} on news of ${cause}.`,
    detail: up ? `A good time to sell ${RESOURCE_LABEL[g].toLowerCase()} we can spare, a bad time to buy.` : `A good time to buy ${RESOURCE_LABEL[g].toLowerCase()} ahead of need.`,
    source: 'the Imperial Exchange',
  });
}

// ---------------------------------------------------------------- X5 the Exchange crash

interface Crash { at: number; stage: 0 | 1 | 2 | 3; asker?: string }
const crashOf = (w: World) => (w.economy as World['economy'] & { crash?: Crash }).crash;
/** Whether the Exchange is in the middle of a crash. */
export const crashOn = (w: World): boolean => { const c = crashOf(w); return !!c && c.stage < 3; };

/** Once a year: rarely, the floor of the Exchange gives way. */
export function maybeCrash(w: World, rng: Rng): void {
  const e = w.economy as World['economy'] & { crash?: Crash };
  const now = absoluteCycle(w.date);
  if (e.crash && now - e.crash.at < CYCLES_PER_ORBIT * 10 * 12) return;
  if (!rng.chance(0.06)) return;
  e.crash = { at: now, stage: 1 };
  for (const g of GOODS) addShock(w, { good: g, mult: 0.7, until: now + CYCLES_PER_ORBIT * 4, cause: 'the crash' });
  nudgePrices(w, 0.75);
  fireStage(w, rng, 'x5:floor', {});
}

/** The crash's later stages come when they are due. */
export function advanceCrash(w: World, rng: Rng): void {
  const c = crashOf(w);
  if (!c || c.stage >= 3) return;
  const now = absoluteCycle(w.date);
  if (c.stage === 1 && now - c.at >= CYCLES_PER_PHASE * 2) {
    c.stage = 2;
    for (const g of GOODS) { addShock(w, { good: g, mult: 0.65, until: now + CYCLES_PER_ORBIT * 2, cause: 'the crash, deepening' }); nudgePrices(w, 0.8, g); }
    // Creditors call in their loans, ours and everyone's.
    for (const l of Object.values(w.loans.loans)) if (l.status === 'active' || l.status === 'extended') { const soon = addCycles(w.date, CYCLES_PER_ORBIT); if (absoluteCycle(soon) < absoluteCycle(l.due)) l.due = soon; }
    const asker = Object.values(w.houses).filter((h) => h.id !== w.playerHouseId).sort((a, b) => econ(w, a.id).stock.othes - econ(w, b.id).stock.othes)[0];
    c.asker = asker?.id;
    fireStage(w, rng, 'x5:calls', { ...(asker ? { otherHouseId: asker.id } : {}) });
  } else if (c.stage === 2 && now - c.at >= CYCLES_PER_ORBIT * 3) {
    c.stage = 3;
    fireStage(w, rng, 'x5:after', {});
  }
}

const holdings = (w: World, h: string) => GOODS.reduce((t, g) => t + econ(w, h).stock[g] * w.economy.market[g].price, 0);

const crashDefs: EventDef[] = [
  {
    id: 'x5:floor', title: 'The floor falls', arc: 'The Exchange crash', category: 'Treasury', trigger: 'home', weight: 0, stage: true, urgent: true,
    setup: () => true,
    text: (c) => `The Imperial Exchange is falling. Every good is a quarter cheaper since this morning and still going. Our stores are worth ${fmt(holdings(c.world, c.house))} othes at today's prices; the coffers hold ${fmt(econ(c.world, c.house).stock.othes)}. ${nm(seat(c, 'steward'))} thinks it will fall further before it comes back.`,
    options: [
      { label: 'Sell what we can before it falls further', hint: 'cash now; buy back later', resolve: (c) => { let got = 0; for (const g of GOODS) { const n = Math.floor(econ(c.world, c.house).stock[g] * 0.6); if (n > 0) { got += sellPrice(c.world, g) * n; tradeInPlace(c.world, c.house, g, -n); } } c.fx.say(`We sell into the fall for ${fmt(got)} othes`); } },
      { label: 'Hold and wait', resolve: (c) => c.fx.say('We sit on our stores') },
      { label: 'Buy the ruin cheap', hint: 'a third of the coffers into goods', check: { who: (c) => seat(c, 'steward'), stats: ['stewardship', 'intellect'], dc: 12 },
        resolve: (c, ok) => { const budget = econ(c.world, c.house).stock.othes / 3; const pick: Good[] = ok ? ['navisium', 'components'] : ['provisions', 'metals']; for (const g of pick) { const n = Math.floor(budget / 2 / c.world.economy.market[g].price); if (n > 0) tradeInPlace(c.world, c.house, g, n, true); } c.fx.say(ok ? 'The Steward buys what will come back hardest' : 'The Steward buys, but not wisely'); } },
    ],
    fallback: 1,
  },
  {
    id: 'x5:calls', title: 'The calls', arc: 'The Exchange crash', category: 'Treasury', trigger: 'home', weight: 0, stage: true, urgent: true,
    setup: (c) => !!c.other,
    text: (c) => `The crash deepens, and every creditor in the Archon calls in its loans at once${debtOf(c.world, c.house) ? `, ours among them: ${fmt(debtOf(c.world, c.house))} othes now due within the Orbit` : ''}. ${H(c.world, c.other)} is going under. Their envoy is at the gate, asking for help.`,
    options: [
      { label: 'Lend them 10,000 othes', hint: 'generous terms; they will remember', available: (c) => (econ(c.world, c.house).stock.othes < 10000 ? 'Needs 10,000 othes.' : null),
        resolve: (c) => { openLoan(c.world, { lender: c.house, borrower: c.other!, amount: 10000, rate: 0.008, orbits: 6, collateral: { kind: 'none' }, spend: 'to survive the crash' }); shiftRelation(c.world, c.other!, c.house, 30); c.fx.say(`${H(c.world, c.other)} lives, and owes us`); } },
      { label: 'Buy one of their holdings', hint: '12,000 othes for its revenue, for good', available: (c) => (econ(c.world, c.house).stock.othes < 12000 ? 'Needs 12,000 othes.' : null),
        resolve: (c) => { const per = 450; record(c.world, c.house, { resource: 'othes', amount: -12000, label: `Bought a holding from ${H(c.world, c.other)}`, kind: 'trade' }); record(c.world, c.other!, { resource: 'othes', amount: 12000, label: `Sold a holding to ${H(c.world, c.house)}`, kind: 'trade' }); const forever = addCycles(c.world.date, CYCLES_PER_ORBIT * 10 * 60); econ(c.world, c.house).boons.push({ id: `b${c.world.nextId++}`, label: `Holding bought from ${H(c.world, c.other)} in the crash`, flow: { othes: per }, until: forever }); econ(c.world, c.other!).boons.push({ id: `b${c.world.nextId++}`, label: `Holding sold to ${H(c.world, c.house)} in the crash`, flow: { othes: -per }, until: forever }); shiftRelation(c.world, c.other!, c.house, -5); c.fx.say(`A holding of ${H(c.world, c.other)}'s pays us ${per} a Phase from now on`); } },
      { label: 'Let them fall', resolve: (c) => { const h = c.world.houses[c.other!]!; h.standing.honour = clamp(h.standing.honour - 8, 0, 100); h.standing.respect = clamp(h.standing.respect - 8, 0, 100); shiftRelation(c.world, c.other!, c.house, -15); c.fx.say(`${H(c.world, c.other)} is left to the creditors`); } },
    ],
    fallback: 2,
  },
  {
    id: 'x5:after', title: 'After the crash', arc: 'The Exchange crash', category: 'Treasury', trigger: 'home', weight: 0, stage: true,
    setup: () => true,
    text: (c) => { const net = netPerPhase(phaseLedger(c.world, c.house)).othes; const debt = debtOf(c.world, c.house); return `The Exchange has found its floor and begun to climb. We come out of it with ${fmt(econ(c.world, c.house).stock.othes)} othes in the coffers${debt ? `, ${fmt(debt)} owed` : ''}, and ${net >= 0 ? `${fmt(net)} a Phase coming in` : `${fmt(-net)} a Phase going out`}.`; },
    options: [{ label: 'So be it', resolve: (c) => { if (deepInDebt(c.world)) openDebt(c.world, 'The crash left us owing more than we can pay.'); } }],
    fallback: 0,
  },
];

// ---------------------------------------------------------------- S7 the debt spiral

/** Owing more than a year of what we take in, or behind on what we owe. */
export function deepInDebt(w: World): boolean {
  const P = w.playerHouseId;
  const debt = debtOf(w, P);
  if (!debt) return false;
  const income = Math.max(1, phaseLedger(w, P).filter((l) => l.resource === 'othes' && l.amount > 0).reduce((t, l) => t + l.amount, 0));
  const behind = loansOf(w, P).some((l) => l.borrower === P && (l.missed >= 2 || l.overdue));
  return debt > income * 25 || (behind && debt > income * 8) || econ(w, P).stock.othes < -5000;
}

export function openDebt(w: World, why: string): void {
  const P = w.playerHouseId;
  if (openStruggles(w).some((s) => s.kind === 'debt')) return;
  const creditor = loansOf(w, P).filter((l) => l.borrower === P).sort((a, b) => b.owed - a.owed)[0]?.lender;
  const debt = debtOf(w, P);
  const st = Object.values(w.characters).find((c) => c.alive && c.houseId === P && c.seat === 'steward');
  startStruggle(w, 'debt', { title: 'The debt spiral', strength: clamp(8 + debt / 5000, 8, 20), theirName: creditor ? `our creditors, ${H(w, creditor)} first` : 'our creditors', theirHouse: creditor, known: true, ours: st ? [st.id] : [], meter: -10 });
  logRecord(w, { kind: 'council', type: 'economy', severity: 3, text: `${why} The Steward calls it what it is: a spiral.`, seat: 'steward' });
}

/** Once a year: are we sliding into it? */
export function checkDebt(w: World): void {
  if (deepInDebt(w)) openDebt(w, `We owe ${fmt(debtOf(w, w.playerHouseId))} othes and are falling behind.`);
}

const ourLoans = (c: Ctx) => loansOf(c.world, c.house).filter((l) => l.borrower === c.house && (l.status === 'active' || l.status === 'extended'));
const strug = (c: Ctx) => c.struggle;

const debtDefs: EventDef[] = [
  { id: 'str:debt:open', title: '', category: 'Treasury', trigger: 'home', weight: 0, stage: true, setup: () => false, text: () => '', options: [{ label: '—', resolve: () => {} }], fallback: 0 },
  {
    id: 'str:debt:down', title: 'A creditor moves', category: 'Treasury', trigger: 'home', weight: 0, stage: true, setup: (c) => ourLoans(c).length > 0,
    text: (c) => { const l = ourLoans(c).sort((a, b) => b.owed - a.owed)[0]!; return `${H(c.world, l.lender)} has lost patience with the ${fmt(l.owed)} othes we owe, and means to take what we put up for it${l.collateral.kind === 'none' ? '' : ` (${l.collateral.label ?? l.collateral.kind})`}.`; },
    options: [
      { label: 'Let them take it', resolve: (c) => { const l = ourLoans(c).sort((a, b) => b.owed - a.owed)[0]!; settleLoanInPlace(c.world, l, 'seize'); pushStruggle(c.world, strug(c)?.id, 6); } },
      { label: 'Pay a quarter of it to keep it', hint: 'stewardship', available: (c) => { const l = ourLoans(c).sort((a, b) => b.owed - a.owed)[0]!; return econ(c.world, c.house).stock.othes < l.owed / 4 ? `Needs ${fmt(l.owed / 4)} othes.` : null; },
        resolve: (c) => { const l = ourLoans(c).sort((a, b) => b.owed - a.owed)[0]!; const n = Math.round(l.owed / 4); record(c.world, c.house, { resource: 'othes', amount: -n, label: `Paid down to ${H(c.world, l.lender)}`, kind: 'trade' }); record(c.world, l.lender, { resource: 'othes', amount: n, label: `Paid down by ${H(c.world, c.house)}`, kind: 'trade' }); l.owed -= n; pushStruggle(c.world, strug(c)?.id, 10); } },
      { label: 'Argue the terms in the Numarade\'s courts', check: { who: (c) => seat(c, 'steward'), stats: ['law', 'negotiation'], dc: 13 }, resolve: (c, ok) => { if (ok) { pushStruggle(c.world, strug(c)?.id, 14); c.fx.say('The courts give us time'); } else { const l = ourLoans(c).sort((a, b) => b.owed - a.owed)[0]!; settleLoanInPlace(c.world, l, 'seize'); c.fx.honour(-2); pushStruggle(c.world, strug(c)?.id, -6); } } },
    ],
    fallback: 0,
  },
  {
    id: 'str:debt:up', title: 'Our debt for sale', category: 'Treasury', trigger: 'home', weight: 0, stage: true, setup: (c) => ourLoans(c).length > 0,
    text: (c) => { const l = ourLoans(c).sort((a, b) => b.owed - a.owed)[0]!; return `${H(c.world, l.lender)} needs coin more than it needs us, and will sell our ${fmt(l.owed)} othes of debt for less than it is worth.`; },
    options: [
      { label: 'Buy it back at half', available: (c) => { const l = ourLoans(c).sort((a, b) => b.owed - a.owed)[0]!; return econ(c.world, c.house).stock.othes < l.owed / 2 ? `Needs ${fmt(l.owed / 2)} othes.` : null; },
        resolve: (c) => { const l = ourLoans(c).sort((a, b) => b.owed - a.owed)[0]!; const n = Math.round(l.owed / 2); record(c.world, c.house, { resource: 'othes', amount: -n, label: `Bought back our debt from ${H(c.world, l.lender)}`, kind: 'trade' }); record(c.world, l.lender, { resource: 'othes', amount: n, label: `Sold ${H(c.world, c.house)}'s debt`, kind: 'trade' }); l.owed = 0; l.status = 'repaid'; pushStruggle(c.world, strug(c)?.id, 22); } },
      { label: 'Let it go to a kinder creditor', resolve: (c) => { const l = ourLoans(c).sort((a, b) => b.owed - a.owed)[0]!; l.owed = Math.round(l.owed * 0.75); l.rate = Math.round(l.rate * 0.8 * 1000) / 1000; pushStruggle(c.world, strug(c)?.id, 10); } },
    ],
    fallback: 1,
  },
  {
    id: 'str:debt:won', title: 'Clear of it', category: 'Treasury', trigger: 'home', weight: 0, stage: true, setup: () => true,
    text: () => 'The Steward closes the last ledger of the bad years. We are not rich, but we are clear.',
    options: [{ label: 'Never again', resolve: (c) => { for (const l of ourLoans(c)) l.rate = Math.round(l.rate * 0.7 * 1000) / 1000; c.fx.honour(3); endStruggle(c.world, strug(c)?.id, true, 'We came clear of our debts.'); } }],
    fallback: 0,
  },
  {
    id: 'str:debt:lost', title: 'Signed away', category: 'Treasury', trigger: 'home', weight: 0, stage: true, setup: () => true,
    text: (c) => `There is nothing left to sell. ${c.struggle?.theirs.houseId ? H(c.world, c.struggle.theirs.houseId) : 'Our creditors'} take the rights to a sector's revenue, for good, in settlement.`,
    options: [{ label: 'Sign', resolve: (c) => {
      const to = c.struggle?.theirs.houseId;
      const debt = debtOf(c.world, c.house);
      const per = clamp(Math.round(debt / 25), 200, 1500);
      const forever = addCycles(c.world.date, CYCLES_PER_ORBIT * 10 * 60);
      econ(c.world, c.house).boons.push({ id: `b${c.world.nextId++}`, label: `A sector's revenue, signed away${to ? ` to ${H(c.world, to)}` : ''}`, flow: { othes: -per }, until: forever });
      if (to && c.world.houses[to]) econ(c.world, to).boons.push({ id: `b${c.world.nextId++}`, label: `${H(c.world, c.house)}'s signed-away revenue`, flow: { othes: per }, until: forever });
      for (const l of ourLoans(c)) { l.owed = 0; l.status = 'seized'; }
      c.fx.honour(-4).respect(-5);
      endStruggle(c.world, strug(c)?.id, false, `A sector's revenue signed away: ${per} othes a Phase, for good.`);
    } }],
    fallback: 0,
  },
];

addEvents([...crashDefs, ...debtDefs]);
void relation;
