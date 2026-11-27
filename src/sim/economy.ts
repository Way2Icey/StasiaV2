import { inTopThree } from './rankcheck';
// The economy: othes and five resources. Standing flows (quarters, taxes,
// food, stipends) settle once a Phase; trades, missions and ransoms settle at
// once. Prices on the Imperial Exchange move with what the houses buy and sell.
import { hunterLines } from './bounties';
import { siteLines } from './places';
import { embargoMarkup } from './lanewatch';
import { favourQuota, privilegeOf } from './houses';
import { guardCost } from './chair';
import { ceremoniesOrbit, credibilityOf, credibilityPhase, standingLines, standingMult, tallyLine } from './standing';
import { bestBuy, bestSell, clearExchange, marketOrder } from './exchange';
import { renownOf } from './renown';
import { Rng } from './rng';
import { alive, findSector } from './query';
import { shiftMood } from './mood';
import { courtTotals } from './court';
import { displayName, shortName } from './names';
import { absoluteCycle, addCycles, CYCLES_PER_PHASE } from './time';
import {
  BASE_PRICE, DEVELOP_COST, ESTATES, GOODS, MISSION_COST, PEOPLE_PER_PROVISION, QUARTER_ECONOMY, QUOTA_BASE, RESOURCE_LABEL,
  RESOURCES, STARTING_STOCK, STIPEND, TAX, TAX_PER_PERSON, type Flow, type Good, type Resource,
} from '../data/economy';
import type { Approach, Character, HouseEconomy, LedgerLine, MissionKind, Sector, World } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round = (v: number) => Math.round(v);

/** How strongly a unit of trade moves each good's price. */

// ---------------------------------------------------------------- setup

function emptyStock(): Record<Resource, number> {
  return Object.fromEntries(RESOURCES.map((r) => [r, 0])) as Record<Resource, number>;
}

export function ensureEconomy(world: World): void {
  world.economy ??= { houses: {}, market: {} as World['economy']['market'] };
  for (const h of Object.values(world.houses)) {
    if (world.economy.houses[h.id]) continue;
    world.economy.houses[h.id] = {
      stock: { ...emptyStock(), ...(STARTING_STOCK[h.id] ?? { othes: 4000, provisions: 400 }) },
      tax: 'normal',
      quota: quotaFor(world, h.id),
      recent: [],
      lastPhase: [],
      boons: [],
    };
  }
  for (const g of GOODS) {
    world.economy.market[g] ??= { price: BASE_PRICE[g], history: [BASE_PRICE[g]], pressure: 0 };
  }
}

export function econ(world: World, houseId: string): HouseEconomy {
  return world.economy.houses[houseId]!;
}

// ---------------------------------------------------------------- standing flows

export function heldSectors(world: World, houseId: string): Sector[] {
  return Object.values(world.planets).filter((p) => p.houseId === houseId).flatMap((p) => p.sectors).filter((s) => s.controllerFamilyId);
}

/** How much an overseer skims from takings, 0..0.25. Driven by hidden greed and loyalty. */
export function skimRate(c: Character | undefined): number {
  if (!c || !c.alive) return 0;
  return clamp((c.hidden.greed - c.hidden.loyalty + 2) / 30, 0, 0.25);
}

/** How well an overseer runs a quarter: 0.7..1.2 from stewardship. */
function efficiency(c: Character | undefined): number {
  if (!c || !c.alive) return 0.85;
  return 0.7 + c.stats.stewardship / 40;
}

export function quotaFor(world: World, houseId: string): number {
  const h = world.houses[houseId]!;
  return round(QUOTA_BASE[h.tier] * (0.8 + h.standing.respect / 250) * favourQuota(world, houseId) * (inTopThree(world, houseId, 'influence') ? 1.15 : 1));
}

/**
 * The house's standing flows for one Phase, line by line: what comes in, from
 * where, and who runs it. Deterministic; used for the forecast and to settle.
 */
export function phaseLedger(world: World, houseId: string): LedgerLine[] {
  const lines: LedgerLine[] = [];
  const e = econ(world, houseId);
  let people = 0;
  for (const s of heldSectors(world, houseId)) {
    people += s.population;
    const calm = 1 - s.unrest / 200;
    for (const q of s.quarters) {
      const def = QUARTER_ECONOMY[q.name];
      if (!def) continue;
      const overseer = q.overseerId ? world.characters[q.overseerId] : undefined;
      const eff = q.overseerId ? efficiency(overseer) : 1;
      for (const [r, v] of Object.entries(def.flow) as [Resource, number][]) {
        const amount = v > 0 ? round(v * eff * calm) : v;
        lines.push({ resource: r, amount, label: q.name, kind: 'quarter', sectorId: s.id, quarterId: q.id, characterId: overseer?.alive ? overseer.id : undefined });
        if (r === 'othes' && v > 0 && def.takings) {
          const skim = round(amount * skimRate(overseer));
          if (skim > 0) {
            const known = overseer?.flags.some((f) => f.id === 'embezzler' && f.knownBy?.includes(houseId));
            lines.push({ resource: 'othes', amount: -skim, label: `Unaccounted for at ${q.name}`, kind: 'skim', sectorId: s.id, quarterId: q.id, characterId: known ? overseer!.id : undefined });
          }
        }
      }
    }
    const tax = round(s.population * TAX_PER_PERSON * TAX[e.tax].factor * calm);
    if (tax) lines.push({ resource: 'othes', amount: tax, label: `Taxes · ${s.name}`, kind: 'tax', sectorId: s.id });
  }
  // Nobles at home do the house's business at court.
  const court = courtTotals(world, houseId);
  if (court.income > 0) {
    const gross = lines.filter((l) => l.resource === 'othes' && l.amount > 0 && (l.kind === 'quarter' || l.kind === 'tax')).reduce((s, l) => s + l.amount, 0);
    const extra = round(gross * court.income);
    if (extra) lines.push({ resource: 'othes', amount: extra, label: `Court business (+${Math.round(court.income * 1000) / 10}%)`, kind: 'court' });
  }
  for (const b of e.boons ?? []) {
    for (const [r, v] of Object.entries(b.flow) as [Resource, number][]) lines.push({ resource: r, amount: v, label: b.label, kind: 'boon' });
  }
  for (const [r, v] of Object.entries(ESTATES[houseId] ?? {}) as [Resource, number][]) {
    lines.push({ resource: r, amount: v, label: v >= 0 ? 'Holdings beyond the capital' : 'What the holdings beyond the capital use', kind: 'quarter' });
  }
  if (people) lines.push({ resource: 'provisions', amount: -round(people / PEOPLE_PER_PROVISION), label: `Feeding ${people.toLocaleString('en-US')} people`, kind: 'food' });
  const pay = PAY_SCALE[world.economy?.payScale ?? 'fair'];
  // A house's people are paid like the servants of a house of its station.
  const mult = houseId === world.playerHouseId ? pay.mult * (1 + (standingMult(world, houseId) - 1) * 0.5) : 1 + (standingMult(world, houseId) - 1) * 0.2;
  const seats = alive(world).filter((c) => c.houseId === houseId && c.seat && c.seat !== 'highroy').length;
  if (seats) lines.push({ resource: 'othes', amount: -Math.round(seats * STIPEND * mult), label: `Council stipends (${seats})`, kind: 'stipend' });
  // Knights are paid by their fame; the blooded get an allowance.
  const knights = alive(world).filter((c) => c.houseId === houseId && c.tier === 'full' && (c.role === 'Knight' || c.flags.some((f) => f.id === 'knighted')) && !c.flags.some((f) => f.id === 'retired'));
  if (knights.length) lines.push({ resource: 'othes', amount: -Math.round(knights.reduce((n, k) => n + stipendOf(world, k), 0) * mult), label: `Knights' stipends (${knights.length})`, kind: 'stipend' });
  const blooded = Object.entries(world.ladder?.of ?? {}).filter(([id, r]) => r.stage === 'blooded' && world.characters[id]?.houseId === houseId).length;
  if (blooded) lines.push({ resource: 'othes', amount: -Math.round(blooded * 8 * mult), label: `Allowances for the blooded (${blooded})`, kind: 'stipend' });
  // The house's forces cost to keep; in the field, at war, far more, and war chokes the trade that pays for them.
  const { home, field, rung, blockaded } = forcesCost(world, houseId);
  if (home) lines.push({ resource: 'othes', amount: -home, label: 'Standing forces', kind: 'forces' });
  if (field) lines.push({ resource: 'othes', amount: -field, label: 'The host in the field', kind: 'war' });
  if (rung) {
    const takings = lines.filter((l) => l.resource === 'othes' && l.amount > 0 && (l.kind === 'quarter' || l.kind === 'tax')).reduce((t, l) => t + l.amount, 0);
    const cut = round(takings * ((rung === 'war' ? 0.25 : 0.08) + (blockaded ? 0.15 : 0)));
    if (cut) lines.push({ resource: 'othes', amount: -cut, label: blockaded ? 'Trade lost to the war, and the blockade' : 'Trade lost to the war', kind: 'war' });
  }
  // Guards on our people, against the envy of the Archon.
  if (houseId === world.playerHouseId) { const g = guardCost(world); if (g) lines.push({ resource: 'othes', amount: -g, label: 'Guards on our people', kind: 'stipend' }); }
  // What we own costs to keep.
  let upkeep = 0;
  let mods = 0;
  for (const m of Object.values(world.holdings?.modules ?? {})) if (m.houseId === houseId && m.level > 0) { upkeep += m.level * (MODULE_UPKEEP[m.kind] ?? 20); mods++; }
  const pupils = Object.values(world.training?.enrolments ?? {}).filter((e) => e.houseId === houseId && e.program === 'academy').length;
  upkeep += pupils * 8;
  if (upkeep) lines.push({ resource: 'othes', amount: -upkeep, label: `Upkeep of holdings (${mods})${pupils ? ` and ${pupils} academy places` : ''}`, kind: 'stipend' });
  // A full treasury is spent: kin, courtiers and household live up to what the coffers hold.
  const lavish = lavishness(e.stock.othes);
  if (lavish) lines.push({ resource: 'othes', amount: -lavish, label: 'The court lives by the coffers', kind: 'stipend' });
  lines.push(...standingLines(world, houseId), ...siteLines(world, houseId), ...hunterLines(world, houseId));
  return lines;
}

/** Above this, a house's kin and court spend more freely each Phase. */
export const LAVISH_FROM = 15000;
/** What a full treasury costs each Phase, easing in: 2% of the first 15,000 above LAVISH_FROM, 4% of the next
 *  30,000, 6% of the rest. A house with a little to spare spends a little; one sitting on a hoard spends freely. */
export function lavishness(othes: number): number {
  const over = Math.max(0, othes - LAVISH_FROM);
  return Math.round(Math.min(over, 15000) * 0.02 + Math.max(0, Math.min(over, 45000) - 15000) * 0.04 + Math.max(0, over - 45000) * 0.06);
}

/** Per Phase: what a soldier, a ship or a sworn blade costs to keep at home. In the field at war it is six times that. */
export const FORCE_UPKEEP = { legion: 0.003, fleet: 6, company: 0.15 } as const;
export const FIELD_MULT = { war: 6, clashes: 2.5 } as const;

/** What a house's forces cost it this Phase, at home and in the field. */
export function forcesCost(world: World, houseId: string): { home: number; field: number; rung: 'war' | 'clashes' | null; blockaded: boolean } {
  const s = world.war;
  if (!s) return { home: 0, field: 0, rung: null, blockaded: false };
  const wars = s.wars.filter((x) => x.status === 'active' && (x.attacker === houseId || x.defender === houseId || x.attackers.includes(houseId) || x.defenders.includes(houseId)));
  const rung = wars.some((x) => x.rung === 'war') ? 'war' : wars.length ? 'clashes' : null;
  let home = 0, field = 0;
  for (const f of Object.values(s.formations)) {
    if (f.houseId !== houseId || f.strength <= 0) continue;
    const base = f.strength * FORCE_UPKEEP[f.kind];
    if (f.front && rung) field += base * FIELD_MULT[rung]; else home += base;
  }
  const blockaded = wars.some((x) => { const mine = x.attacker === houseId || x.attackers.includes(houseId) ? 'attackers' : 'defenders'; return x.fronts.some((fr) => fr.kind === 'orbit' && fr.winner && fr.winner !== mine); });
  return { home: round(home), field: round(field), rung, blockaded };
}

/** Per Phase, per level. */
export const MODULE_UPKEEP: Record<string, number> = { cells: 45, vault: 65, academy: 130, base: 170, listening: 85, shipyard: 220, hangar: 55, brig: 15 };
export const PAY_SCALE = {
  meagre: { mult: 0.6, label: 'Meagre', note: 'Saves money. The famous resent it, and loyalty wears.' },
  fair: { mult: 1, label: 'Fair', note: 'What the Reaches expect.' },
  generous: { mult: 1.5, label: 'Generous', note: 'Costly. Knights stay, and some grow more loyal.' },
} as const;

/** What a knight is paid a Phase: a base, and more for every name they have made. */
export function stipendOf(world: World, c: Character): number {
  const t = world.careers?.titles[c.id]?.length ?? 0;
  const won = Object.values(world.careers?.of[c.id] ?? {}).reduce((n, s) => n + (s.boutsWon ?? 0) + (s.duelsWon ?? 0) + (s.cDuelsWon ?? 0) * 2, 0);
  const fame = t * 2 + won / 3;
  return Math.round((40 + Math.min(40, fame) * 4) * (c.seat === 'champion' ? 1.5 : c.seat === 'grandMaster' ? 1.3 : 1));
}

/** Fame for pay: a knight's renown, in the stipend's terms. */
export function fameOf(world: World, c: Character): number {
  return renownOf(world, c) / 1.5;
}

export function setPayScale(input: World, scale: 'meagre' | 'fair' | 'generous'): World {
  const w = structuredClone(input);
  w.economy.payScale = scale;
  return w;
}

export function netPerPhase(lines: LedgerLine[]): Record<Resource, number> {
  const out = emptyStock();
  for (const l of lines) out[l.resource] += l.amount;
  return out;
}

/** Computing capacity per Orbit (assigned once research arrives). */
export function computingOf(world: World, houseId: string): { total: number; sources: { label: string; amount: number; sectorId: string }[] } {
  const sources = heldSectors(world, houseId).flatMap((s) => s.quarters
    .filter((q) => QUARTER_ECONOMY[q.name]?.computing)
    .map((q) => ({ label: q.name, amount: QUARTER_ECONOMY[q.name]!.computing!, sectorId: s.id })));
  return { total: sources.reduce((a, b) => a + b.amount, 0), sources };
}

// ---------------------------------------------------------------- one-off entries

export function record(world: World, houseId: string, line: LedgerLine) {
  const e = econ(world, houseId);
  e.stock[line.resource] += line.amount;
  tallyLine(world, houseId, line);
  e.recent.unshift({ ...line, date: world.date });
  e.recent = e.recent.slice(0, 40);
}

export function canAfford(world: World, houseId: string, cost: Flow): boolean {
  const e = world.economy?.houses[houseId];
  if (!e) return true;
  return (Object.entries(cost) as [Resource, number][]).every(([r, v]) => e.stock[r] >= v);
}

export function pay(world: World, houseId: string, cost: Flow, label: string, kind: LedgerLine['kind']): void {
  for (const [r, v] of Object.entries(cost) as [Resource, number][]) if (v) record(world, houseId, { resource: r, amount: -v, label, kind });
}

export function missionCost(kind: MissionKind, approach: Approach): number {
  return round(MISSION_COST[kind] * (approach === 'quick' ? 1.5 : 1));
}

export { DEVELOP_COST };

// ---------------------------------------------------------------- the Imperial Exchange

/** Your honour, and the credibility of your othes, set what they are worth: a markup or a discount, -12%..+45%. */
export function credibilityMarkup(world: World, houseId: string): number {
  return clamp((55 - world.houses[houseId]!.standing.honour) / 250 + Math.max(0, 60 - credibilityOf(world, houseId)) / 150, -0.12, 0.45);
}

/** What our credit, an embargo and the Numarade's privilege add to anything we buy. */
export function purchaseMarkup(world: World, houseId: string): number {
  return (1 + credibilityMarkup(world, houseId)) * embargoMarkup(world, houseId) * (privilegeOf(world, houseId) === 'privilege' ? 0.95 : 1);
}

/** The best price to buy a unit now, delivered home (see exchange.ts). */
export function buyPrice(world: World, houseId: string, g: Good): number {
  return bestBuy(world, houseId, g);
}

/** The best a unit would fetch now, less the haul (see exchange.ts). */
export function sellPrice(world: World, g: Good, houseId = world.playerHouseId): number {
  return bestSell(world, houseId, g);
}

/** Buy (qty > 0) or sell (qty < 0) on a world already cloned. Returns an error or null. */
/**
 * A house with trade compacts buys from its partners first, from what they can spare, at the Exchange
 * price without the Exchange's cut; the goods ship capital to capital. Returns how many it got.
 */
function fromPartners(world: World, houseId: string, g: Good, want: number): number {
  let got = 0;
  for (const cp of world.lanes?.compacts ?? []) {
    if (got >= want) break;
    if (cp.a !== houseId && cp.b !== houseId) continue;
    const s = cp.a === houseId ? cp.b : cp.a;
    const es = econ(world, s);
    const net = netPerPhase(phaseLedger(world, s));
    const keep = g === 'navisium' ? Math.max(150, -net[g] * 3) : Math.max(0, -net[g]) * 3 + 20;
    const price = world.economy.market[g].price;
    const n = Math.min(Math.floor(es.stock[g] - keep), want - got, Math.floor(econ(world, houseId).stock.othes / price));
    if (n <= 0) continue;
    const cost = round(n * price);
    const gl = RESOURCE_LABEL[g].toLowerCase();
    const name = (h: string) => `House ${world.houses[h]?.name ?? h}`;
    record(world, s, { resource: g, amount: -n, label: `Sold to ${name(houseId)} under the compact`, kind: 'trade' });
    record(world, s, { resource: 'othes', amount: cost, label: `${n} ${gl} to ${name(houseId)}`, kind: 'trade' });
    record(world, houseId, { resource: 'othes', amount: -cost, label: `${n} ${gl} from ${name(s)}`, kind: 'trade' });
    record(world, houseId, { resource: g, amount: n, label: `Bought from ${name(s)} under the compact`, kind: 'trade' });
    cp.traded += cost;
    (cp.orbit[s] ??= { sold: 0, bought: 0 }).sold += cost;
    (cp.orbit[houseId] ??= { sold: 0, bought: 0 }).bought += cost;
    world.lanes.loading.push({ owner: s, buyer: houseId, good: g, qty: n, value: cost });
    got += n;
  }
  return got;
}

export function tradeInPlace(world: World, houseId: string, g: Good, qty: number, partial = false): string | null {
  if (!qty) return null;
  if (qty > 0 && world.lanes?.compacts?.length) {
    qty -= fromPartners(world, houseId, g, qty);
    if (qty <= 0) return null;
  }
  const r = marketOrder(world, houseId, g, qty, { partial });
  return r.error ?? null;
}

export function trade(input: World, houseId: string, g: Good, qty: number): World {
  const w = structuredClone(input);
  const err = tradeInPlace(w, houseId, g, qty);
  if (err) throw new Error(err);
  return w;
}

export function setTax(input: World, houseId: string, tax: HouseEconomy['tax']): World {
  const w = structuredClone(input);
  econ(w, houseId).tax = tax;
  return w;
}

// ---------------------------------------------------------------- each turn

export function advanceEconomy(world: World, rng: Rng, phaseTurned: boolean, orbitTurned: boolean): void {
  if (!world.economy) return;
  if (orbitTurned) { deliverQuotas(world); stewardAccounts(world); ceremoniesOrbit(world, (h, l) => record(world, h, l)); }
  if (!phaseTurned) return;
  for (const houseId of Object.keys(world.houses)) settlePhase(world, rng, houseId);
  clearExchange(world, rng);
}

/** Each Orbit the Steward sends up the accounts: what came in, what went out, and whether it can last. */
function stewardAccounts(world: World) {
  const P = world.playerHouseId;
  const lines = phaseLedger(world, P).filter((l) => l.resource === 'othes');
  const inn = lines.filter((l) => l.amount > 0).reduce((n, l) => n + l.amount, 0);
  const out = -lines.filter((l) => l.amount < 0).reduce((n, l) => n + l.amount, 0);
  const net = inn - out;
  const stock = econ(world, P).stock.othes;
  const st = alive(world).find((c) => c.houseId === P && c.seat === 'steward');
  const biggest = lines.filter((l) => l.amount < 0).sort((a, b) => a.amount - b.amount)[0];
  const lasts = net < 0 ? Math.floor(stock / (-net * 5)) : Infinity;
  const fmtN = (n: number) => Math.round(n).toLocaleString('en-US');
  world.feed.push({
    id: `rec${world.nextId++}`, date: world.date, kind: 'world', type: 'economy', severity: net < 0 && lasts < 4 ? 2 : 1, seat: 'steward',
    text: `The accounts for the Orbit: ${fmtN(inn)} in, ${fmtN(out)} out a Phase. ${net >= 0 ? `We put by ${fmtN(net)} a Phase.` : stock <= 0 ? `We lose ${fmtN(-net)} a Phase, and the coffers are already empty: we are living on our name.` : `We lose ${fmtN(-net)} a Phase${Number.isFinite(lasts) ? (lasts < 1 ? '; the coffers will be empty within the Orbit' : `; at this rate the coffers last about ${lasts} Orbit${lasts === 1 ? '' : 's'}`) : ''}.`}`,
    detail: biggest ? `The heaviest outgoing: ${biggest.label} (${fmtN(-biggest.amount)} a Phase).` : undefined,
    quote: st && net < 0 ? { from: st.id, text: lasts < 4 ? 'My lord, we cannot go on like this. Something must give: the stipends, the works, or the holdings.' : 'We are spending more than we take. It can go on a while; not for ever.' } : undefined,
    who: st ? [{ id: st.id, part: 'kept the accounts' }] : [],
  });
}

function tell(world: World, houseId: string, text: string, ids?: string[]) {
  if (houseId === world.playerHouseId) world.feed.push({ date: world.date, kind: 'council', text, characterIds: ids });
}

function deliverQuotas(world: World) {
  // With the lanes running, the quota travels from the Reserve and lands when it lands.
  if (world.lanes) { if (world.playerHouseId) tell(world, world.playerHouseId, `The Numarade grants our Navisium quota for the Orbit: ${quotaFor(world, world.playerHouseId)} units, shipped from the Reserve.`); return; }
  for (const houseId of Object.keys(world.houses)) {
    const q = quotaFor(world, houseId);
    const e = econ(world, houseId);
    e.quota = q;
    record(world, houseId, { resource: 'navisium', amount: q, label: 'Numarade quota for the Orbit', kind: 'quota' });
    tell(world, houseId, `The Numarade grants our Navisium quota for the Orbit: ${q} units.`);
  }
}

function settlePhase(world: World, rng: Rng, houseId: string) {
  const e = econ(world, houseId);
  const lines = phaseLedger(world, houseId);
  for (const l of lines) { e.stock[l.resource] += l.amount; tallyLine(world, houseId, l); }
  e.lastPhase = lines;
  credibilityPhase(world, houseId);
  fadeStanding(world, rng, houseId);
  e.recent = [];

  // Tax mood.
  const shift = TAX[e.tax].unrest;
  if (shift) for (const s of heldSectors(world, houseId)) s.unrest = clamp(s.unrest + shift, 0, 100);

  const isPlayer = houseId === world.playerHouseId;

  // Provisions do not keep for ever: what is far beyond need spoils in the stores.
  const eat = -lines.filter((l) => l.resource === 'provisions' && l.kind === 'food').reduce((t, l) => t + l.amount, 0);
  const keep = Math.max(400, eat * 40);
  if (e.stock.provisions > keep) e.stock.provisions = round(e.stock.provisions - (e.stock.provisions - keep) * 0.04);

  // The Steward covers shortfalls at the Exchange if the coffers allow, selling what we have too much of to pay for it.
  for (const g of GOODS) {
    if (e.stock[g] >= 0) continue;
    const need = Math.ceil(-e.stock[g]);
    if (e.stock.othes < buyPrice(world, houseId, g) * need) sellSurplus(world, houseId, buyPrice(world, houseId, g) * need - e.stock.othes, g);
    tradeInPlace(world, houseId, g, need, true);
    if (e.stock[g] >= 0) {
      const st = alive(world).find((c) => c.houseId === houseId && c.seat === 'steward');
      tell(world, houseId, `${st ? shortName(st.name) : 'The Steward'} bought ${need} ${RESOURCE_LABEL[g].toLowerCase()} on the Exchange, at whatever the sellers asked, to cover a shortfall.`, st ? [st.id] : undefined);
    } else {
      e.stock[g] = 0;
      if (!isPlayer) rivalShort(world, houseId, g);
      if (g === 'provisions') {
        for (const s of heldSectors(world, houseId)) s.unrest = clamp(s.unrest + 3, 0, 100);
        tell(world, houseId, 'Food shortage: the stores ran dry and we could not buy enough. Unrest rises in every sector.');
      } else {
        tell(world, houseId, `${RESOURCE_LABEL[g]} ran out; work that needs it went short this Phase.`);
      }
    }
  }

  // Debt: before borrowing on our name, the Steward sells what we can spare.
  if (e.stock.othes < 0) sellSurplus(world, houseId, -e.stock.othes);
  if (e.stock.othes < 0) {
    const st = world.houses[houseId]!.standing;
    if (rng.chance(0.25)) st.honour = clamp(st.honour - 1, 0, 100);
    tell(world, houseId, `We are in debt (${round(e.stock.othes).toLocaleString('en-US')} othes). Our word is worth less: honour −1.`);
  }
  void rng;
}

/** Each Phase: great honour and respect are kept only by deeds. Above 55, they slip back a little unless renewed. */
export function fadeStanding(world: World, rng: Rng, houseId: string): void {
  const st = world.houses[houseId]?.standing;
  if (!st || inTopThree(world, houseId, 'legacy')) return;
  for (const k of ['honour', 'respect'] as const) if (st[k] > 55 && rng.chance(Math.min(1, (st[k] - 55) / 45))) st[k] -= 1;
}

/** What a house keeps in store before the Steward calls it surplus. */
export const RESERVE: Record<Good, number> = { navisium: 250, metals: 400, provisions: 600, fuel: 300, components: 150 };

/** The Steward raises `want` othes by selling stores beyond the reserve, the dearest first. */
export function sellSurplus(world: World, houseId: string, want: number, not?: Good): number {
  const e = econ(world, houseId);
  let got = 0;
  const order = [...GOODS].filter((g) => g !== not).sort((a, b) => sellPrice(world, b, houseId) - sellPrice(world, a, houseId));
  for (const g of order) {
    if (got >= want) break;
    const spare = Math.floor(e.stock[g] - RESERVE[g]);
    if (spare <= 0) continue;
    const n = Math.min(spare, Math.ceil((want - got) / Math.max(0.01, sellPrice(world, g, houseId))));
    const before = e.stock.othes;
    tradeInPlace(world, houseId, g, -n, true);
    got += e.stock.othes - before;
  }
  if (got > 0) tell(world, houseId, `The Steward sold stores we had too much of for ${round(got).toLocaleString('en-US')} othes, to keep the house fed and paid.`);
  return got;
}

/** A rival running dry is news, and it hurts them: hunger in their sectors, their works idle. */
function rivalShort(world: World, houseId: string, g: Good) {
  const h = world.houses[houseId]!;
  if (g === 'provisions') for (const s of heldSectors(world, houseId)) s.unrest = clamp(s.unrest + 3, 0, 100);
  else h.standing.respect = clamp(h.standing.respect - 1, 0, 100);
  const key = `short:${houseId}:${g}`;
  const cd = (world.holdings?.cooldown ?? {})[key];
  if (cd && absoluteCycle(world.date) - absoluteCycle(cd) < CYCLES_PER_PHASE * 5) return;
  if (world.holdings) (world.holdings.cooldown ??= {})[key] = world.date;
  world.feed.push({
    id: `rec${world.nextId++}`, date: world.date, kind: 'world', type: 'economy', severity: 1, seat: 'spymaster', houseIds: [houseId],
    text: g === 'provisions' ? `House ${h.name}'s granaries are empty and the Exchange would not sell them enough. There is hunger in their sectors.` : `House ${h.name} has run out of ${RESOURCE_LABEL[g].toLowerCase()} and cannot buy more; their works stand idle.`,
    source: 'our agents',
  });
}

/** Rivals keep a couple of Phases of what they use, and sell what piles up. */
// ---------------------------------------------------------------- ransom

const RANSOM_DAYS = CYCLES_PER_PHASE;

export function ransomValue(world: World, c: Character): number {
  const fam = world.families[c.familyId];
  if (fam?.ruling) return 3500;
  if (c.seat) return 2000;
  if (c.tier === 'full') return 900;
  return 400;
}

/** We hold someone: ask their house to pay. They answer at once. */
export function demandRansom(input: World, captiveId: string, rng0?: Rng): World {
  const world = structuredClone(input);
  const cap = world.captives[captiveId];
  const c = world.characters[captiveId];
  if (!cap || !c || cap.ransom) return world;
  const rng = rng0 ?? new Rng(world.rng);
  const amount = ransomValue(world, c);
  const payer = c.houseId;
  const pe = econ(world, payer);
  const h = world.houses[payer]!;
  const regard = world.relations[payer]?.[cap.heldBy] ?? 0;
  const willing = pe.stock.othes - amount > 1000 && regard > -60 && rng.chance(clamp(0.5 + h.personality.honour * 0.4 - h.personality.greed * 0.3, 0.1, 0.95));
  if (willing) {
    record(world, payer, { resource: 'othes', amount: -amount, label: `Ransom for ${shortName(c.name)}`, kind: 'ransom' });
    record(world, cap.heldBy, { resource: 'othes', amount, label: `Ransom for ${shortName(c.name)}`, kind: 'ransom', characterId: c.id });
    cap.ransom = { amount, expires: world.date, status: 'paid' };
    releaseQuietly(world, captiveId);
    if (world.relations[payer]) world.relations[payer]![cap.heldBy] = clamp(regard + 5, -100, 100);
    if (cap.heldBy === world.playerHouseId) world.feed.push({ date: world.date, kind: 'intrigue', text: `House ${h.name} pays ${amount.toLocaleString('en-US')} othes for ${displayName(c.name)}, who goes home.`, characterIds: [c.id] });
  } else {
    cap.ransom = { amount, expires: world.date, status: 'refused' };
    if (cap.heldBy === world.playerHouseId) world.feed.push({ date: world.date, kind: 'intrigue', text: `House ${h.name} refuses to pay ${amount.toLocaleString('en-US')} othes for ${displayName(c.name)}.`, characterIds: [c.id] });
  }
  if (!rng0) world.rng = rng.state;
  return world;
}

function releaseQuietly(world: World, id: string) {
  const c = world.characters[id]!;
  c.flags = c.flags.filter((f) => f.id !== 'captive' && f.id !== 'missing');
  const home = world.planets[world.houses[c.houseId]?.capitalPlanetId ?? ''];
  if (home) c.location = { planetId: home.id, sectorId: home.sectors[0]!.id };
  delete world.captives[id];
}

/** A rival holding one of ours names a price. Called by the captives step. */
export function rivalDemandsRansom(world: World, captiveId: string): void {
  const cap = world.captives[captiveId];
  const c = world.characters[captiveId];
  if (!cap || !c || cap.ransom) return;
  const amount = ransomValue(world, c);
  cap.ransom = { amount, expires: addCycles(world.date, RANSOM_DAYS), status: 'open' };
  // The demand tells us who holds them.
  for (const f of c.flags) if (f.id === 'captive' && !f.knownBy?.includes(c.houseId)) f.knownBy = [...(f.knownBy ?? []), c.houseId];
  if (c.houseId === world.playerHouseId) {
    world.feed.push({ date: world.date, kind: 'intrigue', text: `House ${world.houses[cap.heldBy]!.name} holds ${displayName(c.name)} and demands ${amount.toLocaleString('en-US')} othes for their return.`, characterIds: [c.id] });
  }
}

/** Our answer to a demand for one of ours. */
export function answerRansom(input: World, captiveId: string, pay: boolean): World {
  const world = structuredClone(input);
  const cap = world.captives[captiveId];
  const c = world.characters[captiveId];
  if (!cap || !c || cap.ransom?.status !== 'open') return world;
  if (pay) {
    const amount = cap.ransom.amount;
    if (econ(world, c.houseId).stock.othes < amount) throw new Error('Not enough othes.');
    record(world, c.houseId, { resource: 'othes', amount: -amount, label: `Ransom for ${shortName(c.name)}`, kind: 'ransom', characterId: c.id });
    record(world, cap.heldBy, { resource: 'othes', amount, label: `Ransom for ${shortName(c.name)}`, kind: 'ransom' });
    cap.ransom.status = 'paid';
    releaseQuietly(world, captiveId);
    shiftMood(c, 6);
    world.feed.push({ date: world.date, kind: 'intrigue', text: `We pay ${amount.toLocaleString('en-US')} othes and ${displayName(c.name)} comes home.`, characterIds: [c.id] });
  } else {
    cap.ransom.status = 'refused';
    world.feed.push({ date: world.date, kind: 'intrigue', text: `We refuse to pay for ${displayName(c.name)}. House ${world.houses[cap.heldBy]!.name} will decide their fate.`, characterIds: [c.id] });
  }
  return world;
}

/** Open demands lapse into refusals. */
export function lapseRansoms(world: World): void {
  const now = absoluteCycle(world.date);
  for (const cap of Object.values(world.captives)) {
    if (cap.ransom?.status === 'open' && absoluteCycle(cap.ransom.expires) <= now) cap.ransom.status = 'refused';
  }
}

export function sectorName(world: World, id?: string): string {
  if (!id) return '';
  return findSector(world, id)?.sector.name ?? '';
}
