// The regional Exchange. There is no bottomless buyer: a good sells only to a house, or a world, that
// wants it, at what it will pay for it. Every house wants goods according to how short it is: a starving
// house pays two and a half times the usual price for provisions, a fed one will only stock up cheaply.
// Sellers put up their surplus at a price they choose; a seller who wants othes must come down to where
// the buyers are. Each house's capital is a market, and so are the Exchange Docks and the Outer Reach;
// goods sold between them pay freight down the lanes, and the price of a good differs from one market
// to the next. Underneath everything, the Imperial Exchange buys at a low floor and sells at a high
// ceiling, in limited amounts each Phase, so nothing is ever quite worthless or quite unobtainable.
import { Rng as RngCtor, type Rng } from './rng';
import { BASE_PRICE, GOODS, RESOURCE_LABEL, type Good } from '../data/economy';
import { econ, netPerPhase, phaseLedger, record, credibilityMarkup, purchaseMarkup } from './economy';
import { laneBetween, launch, placeName } from './lanes';
import { shockMult, crashOn } from './arcs_economy';
import { addCycles, type GameDate } from './time';
import type { World } from './types';

const round = (n: number) => Math.round(n);
const cents = (n: number) => Math.round(n * 100) / 100;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

// ---------------------------------------------------------------- the shape of it

export interface RegionGood {
  price: number;
  history: number[];
  /** Last Phase: units bought by buyers in this market. */
  sold: number;
  /** Last Phase: what buyers here wanted and could not get. */
  unmet: number;
  /** Last Phase: what sellers here put up and did not sell. */
  unsold: number;
}
export interface Region { id: string; name: string; home?: string; goods: Record<Good, RegionGood> }

export type SellStance = 'hold' | 'fair' | 'quick';
export interface Policy {
  /** What the Steward does with what we have beyond the reserve. */
  sell: SellStance;
  /** Whether the Steward buys what we are short of. */
  buy: 'cover' | 'off';
  /** The reserve to keep, if not the Steward's own reckoning. */
  keep?: number;
}

export interface Order {
  id: string;
  owner: string;
  side: 'sell' | 'buy';
  good: Good;
  /** The market it sits in. */
  region: string;
  /** Still to fill. */
  qty: number;
  /** Least we take (selling) or most we pay (buying), per unit, in that market. */
  limit: number;
  placed: GameDate;
  /** The Steward's (or a rival's) standing order, set again each Phase. */
  auto?: boolean;
  /** Goods shipped ahead to another market to sell there; not on sale till they arrive. */
  consigned?: boolean;
  inTransit?: boolean;
  filled: number;
  /** Othes taken (selling) or paid (buying) so far. */
  value: number;
}

/** A price on the board: a bid or an ask, from a house, an order or the world beyond. */
export interface Quote { who: string; region: string; qty: number; price: number; order?: string }

export interface Fill { date: GameDate; good: Good; qty: number; price: number; seller: string; buyer: string; from: string; to: string }

export interface ExchangeState {
  regions: Record<string, Region>;
  orders: Order[];
  policy: Record<Good, Policy>;
  /** What was left on the board after the last clearing: instant trades take from it. */
  book: Record<Good, { bids: Quote[]; asks: Quote[] }>;
  /** Every bid made at the last clearing, before any filled: what sellers price against. */
  board?: Partial<Record<Good, Quote[]>>;
  fills: Fill[];
}

export const REGION_EXCHANGE = 'exchange';
export const REGION_REACH = 'reach';

/** Least a house keeps of a good, whatever it uses. */
export const MIN_RESERVE: Record<Good, number> = { navisium: 100, metals: 150, provisions: 300, fuel: 100, components: 30 };
/** Phases of use a house likes to keep in store. */
export const RESERVE_PHASES = 12;

/** How much a house will pay, as a share of the usual price, by how short it is (cover in Phases of use). */
export const NEED_CURVE: { upTo: 'empty' | number | 'reserve' | 'stockUp'; mult: number }[] = [
  { upTo: 'empty', mult: 2.6 },
  { upTo: 3, mult: 1.8 },
  { upTo: 8, mult: 1.25 },
  { upTo: 'reserve', mult: 1.0 },
  { upTo: 'stockUp', mult: 0.62 },
];

/** The rest of the Archon, buying at the Docks each Phase: [units, share of usual price]. */
const ARCHON_DEMAND: Record<Good, [number, number][]> = {
  metals: [[110, 1.4], [130, 1.0], [130, 0.75]],
  provisions: [[60, 1.5], [70, 1.05], [70, 0.8]],
  fuel: [[45, 1.5], [55, 1.0], [50, 0.75]],
  components: [[8, 1.5], [9, 1.0], [8, 0.75]],
  navisium: [[12, 1.4], [14, 1.0], [14, 0.8]],
};
/** The frontier, buying in the Reach. */
const REACH_DEMAND: Partial<Record<Good, [number, number][]>> = {
  fuel: [[30, 1.6], [40, 1.15]],
  provisions: [[30, 1.6], [40, 1.15]],
  components: [[5, 1.6], [5, 1.2]],
};
/** Free traders and the far worlds, selling at the Docks. */
const OUTSIDE_SUPPLY: Record<Good, [number, number][]> = {
  metals: [[30, 0.9], [30, 1.2]],
  provisions: [[130, 0.85], [190, 1.12]],
  fuel: [[80, 0.85], [110, 1.12]],
  components: [[10, 0.9], [15, 1.2]],
  navisium: [[12, 1.15], [18, 1.4]],
};
/** Ore and salvage out of the Reach. */
const REACH_SUPPLY: Partial<Record<Good, [number, number][]>> = {
  metals: [[70, 0.55], [80, 0.8]],
  components: [[6, 0.7], [9, 0.95]],
};
/** The Imperial floor and ceiling: share of the usual price, and units a Phase. */
export const FLOOR = 0.38;
export const CEILING = 1.9;
const FLOOR_CAP: Record<Good, number> = { metals: 260, provisions: 220, fuel: 110, components: 16, navisium: 22 };
const CEIL_CAP: Record<Good, number> = { metals: 200, provisions: 320, fuel: 160, components: 22, navisium: 24 };

const ABSTRACT = new Set(['archon', 'frontier', 'free', 'floor', 'ceiling']);
const isHouse = (who: string) => !ABSTRACT.has(who);

// ---------------------------------------------------------------- setup

export function exchangeOf(world: World): ExchangeState {
  return ensureExchange(world);
}

export function ensureExchange(world: World): ExchangeState {
  const eco = world.economy as World['economy'] & { exchange?: ExchangeState };
  const ex = (eco.exchange ??= { regions: {}, orders: [], policy: {} as Record<Good, Policy>, book: {} as ExchangeState['book'], fills: [] });
  const mk = (id: string, name: string, home?: string): Region => ({
    id, name, home,
    goods: Object.fromEntries(GOODS.map((g) => [g, { price: world.economy.market[g]?.price ?? BASE_PRICE[g], history: [], sold: 0, unmet: 0, unsold: 0 }])) as unknown as Record<Good, RegionGood>,
  });
  ex.regions[REGION_EXCHANGE] ??= mk(REGION_EXCHANGE, 'the Exchange Docks');
  ex.regions[REGION_REACH] ??= mk(REGION_REACH, 'the Outer Reach');
  for (const h of Object.values(world.houses)) {
    if (!h.capitalPlanetId) continue;
    ex.regions[h.capitalPlanetId] ??= mk(h.capitalPlanetId, placeName(world, h.capitalPlanetId), h.id);
  }
  for (const g of GOODS) {
    ex.policy[g] ??= { sell: 'fair', buy: 'cover' };
    // Before the first clearing, the board holds only the world beyond the houses.
    ex.book[g] ??= {
      bids: [...tranches('archon', REGION_EXCHANGE, g, ARCHON_DEMAND[g], 1, 1), ...tranches('frontier', REGION_REACH, g, REACH_DEMAND[g], 1, 1), { who: 'floor', region: REGION_EXCHANGE, qty: FLOOR_CAP[g], price: cents(BASE_PRICE[g] * FLOOR) }],
      asks: [...tranches('free', REGION_EXCHANGE, g, OUTSIDE_SUPPLY[g], 1, 1), ...tranches('free', REGION_REACH, g, REACH_SUPPLY[g], 1, 1), { who: 'ceiling', region: REGION_EXCHANGE, qty: CEIL_CAP[g], price: cents(BASE_PRICE[g] * CEILING) }],
    };
  }
  ex.orders ??= []; ex.fills ??= [];
  return ex;
}

export function regionsOf(world: World): Region[] {
  const ex = ensureExchange(world);
  const order = [REGION_EXCHANGE, ...Object.values(world.houses).map((h) => h.capitalPlanetId), REGION_REACH];
  return order.map((id) => ex.regions[id]).filter((r): r is Region => !!r);
}
export const homeRegion = (world: World, houseId: string): string => world.houses[houseId]?.capitalPlanetId ?? REGION_EXCHANGE;
export const regionName = (world: World, id: string): string => ensureExchange(world).regions[id]?.name ?? placeName(world, id);
export function localPrice(world: World, region: string, g: Good): number {
  return ensureExchange(world).regions[region]?.goods[g].price ?? world.economy.market[g].price;
}

// ---------------------------------------------------------------- distance

/** Lane cycles between two markets, through the Docks if no lane runs direct. */
export function laneCycles(a: string, b: string): number {
  if (a === b) return 0;
  const d = laneBetween(a, b);
  if (d) return d.cycles;
  const x = laneBetween(a, REGION_EXCHANGE), y = laneBetween(REGION_EXCHANGE, b);
  return (x?.cycles ?? 10) + (y?.cycles ?? 10);
}
/** What it costs to haul one unit from one market to another. */
export function freight(g: Good, a: string, b: string): number {
  return a === b ? 0 : cents(BASE_PRICE[g] * 0.012 * laneCycles(a, b));
}
/** A market whose house is at open war ships under escort and insurance: two and a half times the haul. */
export function warRisk(world: World, region: string): number {
  const h = ensureExchange(world).regions[region]?.home;
  if (!h) return 1;
  return (world.war?.wars ?? []).some((x) => x.status === 'active' && x.rung === 'war' && (x.attacker === h || x.defender === h || x.attackers.includes(h) || x.defenders.includes(h))) ? 2.5 : 1;
}
/** The haul as it stands today: freight, made dearer by a war at either end. */
export function haul(world: World, g: Good, a: string, b: string): number {
  if (a === b) return 0;
  return cents(freight(g, a, b) * Math.max(warRisk(world, a), warRisk(world, b)));
}

// ---------------------------------------------------------------- need

/** During a clearing, each house's ledger is reckoned once, not once per good per question. */
let NETS: Map<string, ReturnType<typeof netPerPhase>> | null = null;
const netsOf = (world: World, houseId: string) => {
  if (NETS) { let n = NETS.get(houseId); if (!n) { n = netPerPhase(phaseLedger(world, houseId)); NETS.set(houseId, n); } return n; }
  return netPerPhase(phaseLedger(world, houseId));
};
/** What a house uses of a good each Phase (0 if it makes more than it uses). */
export function useOf(world: World, houseId: string, g: Good): number {
  return Math.max(0, -netsOf(world, houseId)[g]);
}
/** What a house means to keep in store. */
export function reserveOf(world: World, houseId: string, g: Good): number {
  const pol = houseId === world.playerHouseId ? ensureExchange(world).policy[g] : undefined;
  if (pol?.keep !== undefined) return pol.keep;
  return Math.max(MIN_RESERVE[g], round(useOf(world, houseId, g) * RESERVE_PHASES));
}
/** How a house's stores stand against its needs, in words. */
export function needWord(world: World, houseId: string, g: Good): { word: string; tone: 'bad' | 'warn' | 'ok' | 'up' } {
  const s = econ(world, houseId).stock[g];
  const use = useOf(world, houseId, g);
  const res = reserveOf(world, houseId, g);
  if (s <= 0 && use > 0) return { word: 'out', tone: 'bad' };
  if (use > 0 && s < use * 3) return { word: 'short', tone: 'bad' };
  if (s < res) return { word: 'low', tone: 'warn' };
  if (s > res * 2.5) return { word: 'glut', tone: 'up' };
  if (s > res) return { word: 'surplus', tone: 'up' };
  return { word: 'enough', tone: 'ok' };
}

/** What a house will bid for a good this Phase: tranches by how short it is, and what it can pay. */
function houseBids(world: World, houseId: string, g: Good): Quote[] {
  const player = houseId === world.playerHouseId;
  if (player && ensureExchange(world).policy[g].buy === 'off') return [];
  const e = econ(world, houseId);
  const use = useOf(world, houseId, g);
  const res = reserveOf(world, houseId, g);
  let have = e.stock[g];
  let budget = Math.max(0, e.stock.othes - (player ? 500 : 1500));
  const region = homeRegion(world, houseId);
  const out: Quote[] = [];
  for (const step of NEED_CURVE) {
    if (player && step.upTo === 'stockUp') break;
    const level = step.upTo === 'empty' ? 0 : step.upTo === 'reserve' ? res : step.upTo === 'stockUp' ? res * 1.4 : Math.min(res, use * step.upTo);
    let q = Math.ceil(level - have);
    if (q <= 0) continue;
    const price = cents(BASE_PRICE[g] * step.mult);
    q = Math.min(q, Math.floor(budget / price));
    if (q <= 0) break;
    out.push({ who: houseId, region, qty: q, price });
    budget -= q * price;
    have += q;
  }
  return out;
}

/** The price, net of the haul, at which `qty` would have sold to last Phase's buyers. */
export function clearingPrice(world: World, houseId: string, g: Good, qty: number): number {
  const ex = ensureExchange(world);
  const home = homeRegion(world, houseId);
  const bids = (ex.board?.[g] ?? ex.book[g].bids).filter((b) => b.who !== houseId && b.qty > 0)
    .map((b) => ({ qty: b.qty, net: b.price - haul(world, g, home, b.region) }))
    .sort((a, b) => b.net - a.net);
  let n = 0;
  for (const b of bids) { n += b.qty; if (n >= qty) return b.net; }
  return BASE_PRICE[g] * FLOOR - haul(world, g, home, REGION_EXCHANGE);
}

/** What a house's Steward (or a rival) puts up for sale, and at what. */
function houseAsks(world: World, houseId: string, g: Good): Order | null {
  const player = houseId === world.playerHouseId;
  const stance: SellStance = player ? ensureExchange(world).policy[g].sell : 'fair';
  if (stance === 'hold') return null;
  const e = econ(world, houseId);
  const res = reserveOf(world, houseId, g);
  const manual = player ? ensureExchange(world).orders.filter((o) => o.owner === houseId && !o.auto && o.side === 'sell' && o.good === g && !o.consigned).reduce((t, o) => t + o.qty, 0) : 0;
  const surplus = Math.floor(e.stock[g] - res - manual);
  if (surplus <= 0) return null;
  const region = homeRegion(world, houseId);
  // Ask what last Phase's buyers would have paid for it, less the haul: enough to move half the surplus,
  // all of it in a glut, or all of it at once when the Steward is told to sell quickly.
  const glut = surplus / Math.max(res, 50);
  const floor = Math.max(0.01, BASE_PRICE[g] * FLOOR - haul(world, g, region, REGION_EXCHANGE));
  const limit = Math.max(floor, clearingPrice(world, houseId, g, stance === 'quick' || glut > 3 ? surplus : Math.ceil(surplus / 2)) * (stance === 'quick' ? 0.97 : 1));
  return { id: `ao${world.nextId++}`, owner: houseId, side: 'sell', good: g, region, qty: surplus, limit: cents(limit), placed: world.date, auto: true, filled: 0, value: 0 };
}

const tranches = (who: string, region: string, g: Good, t: [number, number][] | undefined, qMult: number, pMult: number): Quote[] =>
  (t ?? []).map(([q, m]) => ({ who, region, qty: Math.max(0, round(q * qMult)), price: cents(BASE_PRICE[g] * m * pMult) })).filter((x) => x.qty > 0);

// ---------------------------------------------------------------- the clearing

/** Once a Phase: every house and world puts up its bids and asks, and the Exchange matches them. */
export function clearExchange(world: World, rng: Rng): void {
  NETS = new Map();
  try { clearing(world, rng); } finally { NETS = null; }
}

function clearing(world: World, rng: Rng): void {
  const ex = ensureExchange(world);
  // The standing orders are set again; the player's own stay.
  ex.orders = ex.orders.filter((o) => !o.auto && o.qty > 0);
  const totals = new Map<string, { qty: number; value: number; good: Good; side: 'sell' | 'buy'; where: string }>();
  for (const g of GOODS) {
    for (const r of Object.values(ex.regions)) { r.goods[g].sold = 0; r.goods[g].unmet = 0; r.goods[g].unsold = 0; }
    const s = shockMult(world, g);
    const dem = crashOn(world) ? 0.6 : 1;
    const bids: Quote[] = [
      ...Object.keys(world.houses).flatMap((h) => houseBids(world, h, g)),
      ...ex.orders.filter((o) => o.side === 'buy' && o.good === g).map((o) => ({ who: o.owner, region: o.region, qty: o.qty, price: o.limit, order: o.id })),
      ...tranches('archon', REGION_EXCHANGE, g, ARCHON_DEMAND[g], s * dem * (0.9 + rng.next() * 0.2), Math.max(1, s)),
      ...tranches('frontier', REGION_REACH, g, REACH_DEMAND[g], s * (0.85 + rng.next() * 0.3), Math.max(1, s)),
      { who: 'floor', region: REGION_EXCHANGE, qty: FLOOR_CAP[g], price: cents(BASE_PRICE[g] * FLOOR * (crashOn(world) ? 0.85 : 1)) },
    ];
    for (const h of Object.keys(world.houses)) { const o = houseAsks(world, h, g); if (o) ex.orders.push(o); }
    (ex.board ??= {})[g] = bids.map((b) => ({ ...b }));
    const asks: Quote[] = [
      ...ex.orders.filter((o) => o.side === 'sell' && o.good === g && !o.inTransit).map((o) => ({ who: o.owner, region: o.region, qty: o.consigned ? o.qty : Math.min(o.qty, Math.floor(Math.max(0, econ(world, o.owner).stock[g]))), price: o.limit, order: o.id })),
      ...tranches('free', REGION_EXCHANGE, g, OUTSIDE_SUPPLY[g], (1 / s) * (0.85 + rng.next() * 0.3), Math.max(1, s * 0.9)),
      ...tranches('free', REGION_REACH, g, REACH_SUPPLY[g], (1 / s) * (0.8 + rng.next() * 0.4), 1),
      { who: 'ceiling', region: REGION_EXCHANGE, qty: CEIL_CAP[g], price: cents(BASE_PRICE[g] * CEILING * Math.max(1, s)) },
    ].filter((q) => q.qty > 0);
    match(world, g, bids, asks, totals, 'clearing');
    ex.book[g] = { bids: bids.filter((q) => q.qty > 0), asks: asks.filter((q) => q.qty > 0) };
    // What is left on the board, market by market.
    for (const q of ex.book[g].bids) if (isHouse(q.who) || q.who === 'archon' || q.who === 'frontier') { const r = ex.regions[q.region]; if (r) r.goods[g].unmet += q.qty; }
    for (const q of ex.book[g].asks) if (isHouse(q.who)) { const r = ex.regions[q.region]; if (r) r.goods[g].unsold += q.qty; }
    reprice(world, g);
  }
  writeTotals(world, totals);
  // Orders fully filled come off the board; the house hears of it.
  for (const o of ex.orders.filter((x) => !x.auto && x.qty <= 0)) {
    if (o.owner === world.playerHouseId) world.feed.push({ date: world.date, kind: 'council', text: `Our order to ${o.side} ${RESOURCE_LABEL[o.good].toLowerCase()} at ${regionName(world, o.region)} is filled: ${fmt(o.filled)} for ${fmt(o.value)} othes.` });
  }
  ex.orders = ex.orders.filter((o) => o.qty > 0);
  ex.fills = ex.fills.slice(0, 40);
}

type Totals = Map<string, { qty: number; value: number; good: Good; side: 'sell' | 'buy'; where: string }>;

/** Highest bids first, each taking the cheapest ask it can reach (price plus the haul). */
function match(world: World, g: Good, bids: Quote[], asks: Quote[], totals: Totals, mode: 'clearing' | 'now'): number {
  const ex = ensureExchange(world);
  let moved = 0;
  bids.sort((a, b) => b.price - a.price);
  for (const b of bids) {
    while (b.qty > 0) {
      let best: Quote | undefined; let bestCost = Infinity;
      for (const a of asks) {
        if (a.qty <= 0 || a.who === b.who) continue;
        if (a.who === 'ceiling' && b.who === 'floor') continue;
        if (!isHouse(a.who) && !isHouse(b.who)) continue; // the world does not trade with itself here
        const cost = a.price + haul(world, g, a.region, b.region);
        if (cost < bestCost) { bestCost = cost; best = a; }
      }
      if (!best || bestCost > b.price) break;
      let q = Math.min(b.qty, best.qty);
      // A house cannot pay more than it has.
      const unit = mode === 'now' || best.who === 'ceiling' ? bestCost : b.who === 'floor' ? b.price : cents((bestCost + b.price) / 2);
      if (isHouse(b.who)) {
        const mark = purchaseMarkup(world, b.who);
        q = Math.min(q, Math.floor(Math.max(0, econ(world, b.who).stock.othes) / (unit * mark)));
        if (q <= 0) { b.qty = 0; break; }
      }
      if (isHouse(best.who) && !ex.orders.find((o) => o.id === best!.order)?.consigned) q = Math.min(q, Math.floor(Math.max(0, econ(world, best.who).stock[g])));
      if (q <= 0) { best.qty = 0; continue; }
      execute(world, g, q, unit, best, b, totals);
      best.qty -= q; b.qty -= q; moved += q;
    }
  }
  void ex;
  return moved;
}

/** The Exchange's dues on every sale. */
export const EXCHANGE_DUES = 0.1;

function execute(world: World, g: Good, q: number, unit: number, a: Quote, b: Quote, totals: Totals): void {
  const ex = ensureExchange(world);
  const cost = haul(world, g, a.region, b.region);
  // The Exchange keeps its dues from every sale.
  const toSeller = (unit - cost) * q * (1 - EXCHANGE_DUES);
  const fromBuyer = isHouse(b.who) ? unit * q * purchaseMarkup(world, b.who) : 0;
  const add = (who: string, side: 'sell' | 'buy', value: number, where: string) => {
    const k = `${who}|${g}|${side}|${where}`;
    const t = totals.get(k) ?? { qty: 0, value: 0, good: g, side, where };
    t.qty += q; t.value += value; totals.set(k, t);
  };
  if (isHouse(a.who)) {
    const o = a.order ? ex.orders.find((x) => x.id === a.order) : undefined;
    if (o) { o.qty -= q; o.filled += q; o.value += toSeller; }
    if (!o?.consigned) econ(world, a.who).stock[g] -= q;
    econ(world, a.who).stock.othes += toSeller;
    add(a.who, 'sell', toSeller, b.region);
  }
  if (isHouse(b.who)) {
    const o = b.order ? ex.orders.find((x) => x.id === b.order) : undefined;
    if (o) { o.qty -= q; o.filled += q; o.value += fromBuyer; }
    econ(world, b.who).stock[g] += q;
    econ(world, b.who).stock.othes -= fromBuyer;
    add(b.who, 'buy', fromBuyer, a.region);
  }
  const r = ex.regions[b.region];
  if (r) { const rg = r.goods[g] as RegionGood & { tv?: number }; rg.sold += q; rg.tv = (rg.tv ?? 0) + unit * q; }
  ex.fills.unshift({ date: world.date, good: g, qty: q, price: cents(unit), seller: a.who, buyer: b.who, from: a.region, to: b.region });
  // The goods ship down the lanes.
  if (isHouse(a.who) || isHouse(b.who)) {
    const from = a.region, to = b.region;
    if (from !== to) world.lanes?.loading?.push({ owner: isHouse(a.who) ? a.who : b.who, buyer: isHouse(a.who) && isHouse(b.who) ? b.who : undefined, good: g, qty: isHouse(a.who) ? -q : q, value: round(unit * q), from, to } as never);
  }
}

/** Bookkeeping in the ledger: one line per house, good, side and market, not one per trade. */
function writeTotals(world: World, totals: Totals): void {
  // execute() has already moved the stock; record() would move it again, so we log without moving.
  for (const [k, t] of totals) {
    const who = k.split('|')[0]!;
    const e = econ(world, who);
    const gl = RESOURCE_LABEL[t.good].toLowerCase();
    const at = regionName(world, t.where);
    const line = t.side === 'sell'
      ? { resource: 'othes' as const, amount: round(t.value), label: `Sold ${fmt(t.qty)} ${gl} to buyers at ${at}`, kind: 'trade' as const, date: world.date }
      : { resource: 'othes' as const, amount: -round(t.value), label: `Bought ${fmt(t.qty)} ${gl} from ${at}`, kind: 'trade' as const, date: world.date };
    e.recent.unshift(line);
    e.recent = e.recent.slice(0, 40);
  }
}

/** Each market's price follows what buyers there paid, or where its bids and asks now stand. */
function reprice(world: World, g: Good): void {
  const ex = ensureExchange(world);
  const base = BASE_PRICE[g];
  for (const r of Object.values(ex.regions)) {
    const rg = r.goods[g] as RegionGood & { tv?: number };
    let target: number;
    if (rg.sold > 0) target = (rg.tv ?? 0) / rg.sold;
    else {
      const bestBid = Math.max(0, ...ex.book[g].bids.filter((q) => q.region === r.id).map((q) => q.price));
      const asks = ex.book[g].asks.map((a) => a.price + haul(world, g, a.region, r.id));
      const bestAsk = asks.length ? Math.min(...asks) : base * CEILING;
      target = bestBid > 0 ? (bestBid + bestAsk) / 2 : Math.min(rg.price, bestAsk);
    }
    rg.price = cents(clamp(rg.price + (target - rg.price) * (rg.sold > 0 ? 0.55 : 0.25), base * FLOOR, base * CEILING * 1.6));
    rg.history.push(rg.price);
    rg.history = rg.history.slice(-12);
    rg.tv = 0;
  }
  const m = world.economy.market[g];
  m.price = ex.regions[REGION_EXCHANGE]!.goods[g].price;
  m.history.push(m.price);
  m.history = m.history.slice(-12);
  m.pressure = 0;
}

/** Shove every market's price at once (a crash, a panic). */
export function nudgePrices(world: World, mult: number, g?: Good): void {
  const ex = ensureExchange(world);
  for (const gg of g ? [g] : GOODS) {
    for (const r of Object.values(ex.regions)) r.goods[gg].price = cents(clamp(r.goods[gg].price * mult, BASE_PRICE[gg] * FLOOR, BASE_PRICE[gg] * CEILING * 1.6));
    world.economy.market[gg].price = ex.regions[REGION_EXCHANGE]!.goods[gg].price;
  }
}

// ---------------------------------------------------------------- trading now

/** Buy (qty > 0) or sell (qty < 0) at once, against what is on the board. Moves stock and othes. */
export function marketOrder(world: World, houseId: string, g: Good, qty: number, opts: { partial?: boolean } = {}): { done: number; value: number; error?: string } {
  const ex = ensureExchange(world);
  const book = ex.book[g];
  const home = homeRegion(world, houseId);
  const totals: Totals = new Map();
  if (qty > 0) {
    const asks = book.asks.length ? book.asks : [{ who: 'ceiling', region: REGION_EXCHANGE, qty: CEIL_CAP[g], price: cents(BASE_PRICE[g] * CEILING) }];
    const q = quoteFrom(world, houseId, g, qty, asks, true);
    if (q.done < qty && !opts.partial) return { done: 0, value: 0, error: q.done ? `Only ${fmt(q.done)} on offer within reach this Phase.` : 'No one is selling.' };
    if (q.value * purchaseMarkup(world, houseId) > econ(world, houseId).stock.othes + 0.5 && !opts.partial) return { done: 0, value: 0, error: `Not enough othes: ${fmt(q.value * purchaseMarkup(world, houseId))} needed.` };
    const bid: Quote = { who: houseId, region: home, qty, price: Infinity };
    const moved = match(world, g, [bid], asks, totals, 'now');
    book.asks = asks.filter((a) => a.qty > 0);
    writeTotals(world, totals);
    const value = [...totals.values()].reduce((t, x) => t + x.value, 0);
    return { done: moved, value };
  }
  const n = -qty;
  if (econ(world, houseId).stock[g] < n) return { done: 0, value: 0, error: `Only ${fmt(econ(world, houseId).stock[g])} ${RESOURCE_LABEL[g].toLowerCase()} in store.` };
  const bids = book.bids.length ? book.bids : [{ who: 'floor', region: REGION_EXCHANGE, qty: FLOOR_CAP[g], price: cents(BASE_PRICE[g] * FLOOR) }];
  const q = quoteFrom(world, houseId, g, -n, bids, true);
  if (q.done < n && !opts.partial) return { done: 0, value: 0, error: q.done ? `Buyers will take only ${fmt(q.done)} this Phase.` : 'No one is buying.' };
  // Selling into the bids: the seller takes each bid's price, less the haul.
  let left = n, value = 0;
  bids.sort((a, b) => (b.price - haul(world, g, home, b.region)) - (a.price - haul(world, g, home, a.region)));
  for (const b of bids) {
    if (left <= 0) break;
    if (b.qty <= 0 || b.who === houseId) continue;
    const net = b.price - haul(world, g, home, b.region);
    if (net <= 0) continue;
    let take = Math.min(left, b.qty);
    if (isHouse(b.who)) take = Math.min(take, Math.floor(Math.max(0, econ(world, b.who).stock.othes) / (b.price * purchaseMarkup(world, b.who))));
    if (take <= 0) continue;
    execute(world, g, take, b.price, { who: houseId, region: home, qty: take, price: net }, b, totals);
    b.qty -= take; left -= take; value += net * take;
  }
  book.bids = bids.filter((b) => b.qty > 0);
  writeTotals(world, totals);
  return { done: n - left, value };
}

/** What a trade now would come to, without making it: units it would fill and othes all told. */
export function quote(world: World, houseId: string, g: Good, qty: number): { done: number; value: number; avg: number } {
  const ex = ensureExchange(world);
  const list = qty > 0 ? ex.book[g].asks : ex.book[g].bids;
  return quoteFrom(world, houseId, g, qty, list, false);
}

function quoteFrom(world: World, houseId: string, g: Good, qty: number, list: Quote[], _live: boolean): { done: number; value: number; avg: number } {
  const home = homeRegion(world, houseId);
  const want = Math.abs(qty);
  const priced = list.filter((q) => q.qty > 0 && q.who !== houseId).map((q) => ({ q, unit: qty > 0 ? q.price + haul(world, g, q.region, home) : (q.price - haul(world, g, home, q.region)) * (1 - EXCHANGE_DUES) }))
    .filter((x) => x.unit > 0)
    .sort((a, b) => (qty > 0 ? a.unit - b.unit : b.unit - a.unit));
  let done = 0, value = 0;
  for (const { q, unit } of priced) {
    if (done >= want) break;
    const take = Math.min(want - done, q.qty);
    done += take; value += take * unit;
  }
  return { done, value: round(value), avg: done ? cents(value / done) : 0 };
}

/** The best price to buy one unit now, delivered home, with our credit's markup. */
export function bestBuy(world: World, houseId: string, g: Good): number {
  const q = quote(world, houseId, g, 1);
  return cents((q.done ? q.avg : BASE_PRICE[g] * CEILING) * purchaseMarkup(world, houseId));
}
/** The best price a unit would fetch now, less the haul. */
export function bestSell(world: World, houseId: string, g: Good): number {
  const q = quote(world, houseId, g, -1);
  return q.done ? q.avg : cents(BASE_PRICE[g] * FLOOR);
}

// ---------------------------------------------------------------- orders by hand

export function placeOrder(input: World, o: { side: 'sell' | 'buy'; good: Good; qty: number; region: string; limit: number }, houseId = input.playerHouseId): World {
  const w = structuredClone(input);
  const rng = new RngCtor(w.rng);
  const ex = ensureExchange(w);
  const qty = Math.floor(o.qty);
  if (qty <= 0) throw new Error('Name a quantity.');
  if (!(o.limit > 0)) throw new Error('Name a price.');
  if (!ex.regions[o.region]) throw new Error('No such market.');
  const home = homeRegion(w, houseId);
  const order: Order = { id: `or${w.nextId++}`, owner: houseId, side: o.side, good: o.good, region: o.region, qty, limit: cents(o.limit), placed: w.date, filled: 0, value: 0 };
  if (o.side === 'sell' && o.region !== home) {
    // Goods for another market are shipped there first, and are at the lanes' mercy on the way.
    const e = econ(w, houseId);
    if (e.stock[o.good] < qty) throw new Error(`Only ${fmt(e.stock[o.good])} in store.`);
    record(w, houseId, { resource: o.good, amount: -qty, label: `Shipped to ${regionName(w, o.region)} to sell there`, kind: 'trade' });
    order.consigned = true; order.inTransit = true;
    // With no lane straight there, the dangerous leg is the last one, out from the Docks.
    const from = laneBetween(home, o.region) ? home : REGION_EXCHANGE;
    const cv = launch(w, rng, { owner: houseId, kind: 'export', good: o.good, qty, value: round(qty * o.limit), from, to: o.region, crew: rng.int(10, 26) } as never);
    if (cv) cv.order = order.id; else order.inTransit = false;
  }
  ex.orders.push(order);
  w.rng = rng.state;
  return w;
}

export function cancelOrder(input: World, id: string): World {
  const w = structuredClone(input);
  const ex = ensureExchange(w);
  const o = ex.orders.find((x) => x.id === id);
  if (!o) return w;
  if (o.consigned && o.qty > 0) record(w, o.owner, { resource: o.good, amount: o.qty, label: `Unsold at ${regionName(w, o.region)}, shipped home`, kind: 'trade' });
  ex.orders = ex.orders.filter((x) => x.id !== id);
  return w;
}

export function setPolicy(input: World, g: Good, p: Partial<Policy>): World {
  const w = structuredClone(input);
  const ex = ensureExchange(w);
  ex.policy[g] = { ...ex.policy[g], ...p };
  if (p.keep === undefined && 'keep' in p) delete ex.policy[g].keep;
  return w;
}

/** A consignment landed (lanes.ts): its goods go on sale. */
export function consignmentLanded(world: World, orderId: string): void {
  const o = ensureExchange(world).orders.find((x) => x.id === orderId);
  if (o) o.inTransit = false;
}
/** A consignment was taken on the lanes: the goods are gone, and so is the order. */
export function consignmentLost(world: World, orderId: string): void {
  const ex = ensureExchange(world);
  ex.orders = ex.orders.filter((x) => x.id !== orderId);
}

void addCycles; void credibilityMarkup;
