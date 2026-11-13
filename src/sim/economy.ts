// The economy: othes and five resources. Standing flows (quarters, taxes,
// food, stipends) settle once a Phase; trades, missions and ransoms settle at
// once. Prices on the Imperial Exchange move with what the houses buy and sell.
import { Rng } from './rng';
import { alive, findSector } from './query';
import { shiftMood } from './mood';
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
const DEPTH: Record<Good, number> = { navisium: 300, metals: 1500, provisions: 8000, fuel: 600, components: 150 };

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

function heldSectors(world: World, houseId: string): Sector[] {
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
  return round(QUOTA_BASE[h.tier] * (0.8 + h.standing.respect / 250));
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
  for (const b of e.boons ?? []) {
    for (const [r, v] of Object.entries(b.flow) as [Resource, number][]) lines.push({ resource: r, amount: v, label: b.label, kind: 'boon' });
  }
  for (const [r, v] of Object.entries(ESTATES[houseId] ?? {}) as [Resource, number][]) {
    lines.push({ resource: r, amount: v, label: 'Holdings beyond the capital', kind: 'quarter' });
  }
  if (people) lines.push({ resource: 'provisions', amount: -round(people / PEOPLE_PER_PROVISION), label: `Feeding ${people.toLocaleString('en-US')} people`, kind: 'food' });
  const seats = alive(world).filter((c) => c.houseId === houseId && c.seat && c.seat !== 'highroy').length;
  if (seats) lines.push({ resource: 'othes', amount: -seats * STIPEND, label: `Council stipends (${seats})`, kind: 'stipend' });
  return lines;
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

function record(world: World, houseId: string, line: LedgerLine) {
  const e = econ(world, houseId);
  e.stock[line.resource] += line.amount;
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

/** Your honour sets what your othes are worth: a markup or a discount, -12%..+20%. */
export function credibilityMarkup(world: World, houseId: string): number {
  return clamp((55 - world.houses[houseId]!.standing.honour) / 250, -0.12, 0.2);
}

export function buyPrice(world: World, houseId: string, g: Good): number {
  return world.economy.market[g].price * (1 + credibilityMarkup(world, houseId));
}

export function sellPrice(world: World, g: Good): number {
  return world.economy.market[g].price * 0.9;
}

/** Buy (qty > 0) or sell (qty < 0) on a world already cloned. Returns an error or null. */
export function tradeInPlace(world: World, houseId: string, g: Good, qty: number): string | null {
  if (!qty) return null;
  const e = econ(world, houseId);
  const m = world.economy.market[g];
  if (qty > 0) {
    const cost = round(buyPrice(world, houseId, g) * qty);
    if (e.stock.othes < cost) return `Not enough othes: ${cost.toLocaleString('en-US')} needed.`;
    record(world, houseId, { resource: 'othes', amount: -cost, label: `Bought ${qty} ${RESOURCE_LABEL[g].toLowerCase()}`, kind: 'trade' });
    record(world, houseId, { resource: g, amount: qty, label: 'Bought at the Exchange', kind: 'trade' });
  } else {
    const n = -qty;
    if (e.stock[g] < n) return `Only ${round(e.stock[g])} ${RESOURCE_LABEL[g].toLowerCase()} in store.`;
    const gain = round(sellPrice(world, g) * n);
    record(world, houseId, { resource: g, amount: -n, label: 'Sold at the Exchange', kind: 'trade' });
    record(world, houseId, { resource: 'othes', amount: gain, label: `Sold ${n} ${RESOURCE_LABEL[g].toLowerCase()}`, kind: 'trade' });
  }
  m.pressure += qty;
  // Large trades move the price at once, a little.
  m.price = clamp(m.price * (1 + clamp(qty / DEPTH[g], -0.1, 0.1) * 0.5), BASE_PRICE[g] * 0.4, BASE_PRICE[g] * 3);
  return null;
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

function settleMarket(world: World, rng: Rng) {
  for (const g of GOODS) {
    const m = world.economy.market[g];
    const base = BASE_PRICE[g];
    let p = m.price * (1 + clamp(m.pressure / DEPTH[g], -0.15, 0.15) * 0.5);
    p += (base - p) * 0.1; // drifts back toward the usual price
    p *= 1 + rng.gauss() * 0.03;
    m.price = Math.round(clamp(p, base * 0.4, base * 3) * 100) / 100;
    m.history.push(m.price);
    m.history = m.history.slice(-12);
    m.pressure = 0;
  }
}

// ---------------------------------------------------------------- each turn

export function advanceEconomy(world: World, rng: Rng, phaseTurned: boolean, orbitTurned: boolean): void {
  if (!world.economy) return;
  if (orbitTurned) deliverQuotas(world);
  if (!phaseTurned) return;
  for (const houseId of Object.keys(world.houses)) settlePhase(world, rng, houseId);
  settleMarket(world, rng);
}

function tell(world: World, houseId: string, text: string, ids?: string[]) {
  if (houseId === world.playerHouseId) world.feed.push({ date: world.date, kind: 'council', text, characterIds: ids });
}

function deliverQuotas(world: World) {
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
  for (const l of lines) e.stock[l.resource] += l.amount;
  e.lastPhase = lines;
  e.recent = [];

  // Tax mood.
  const shift = TAX[e.tax].unrest;
  if (shift) for (const s of heldSectors(world, houseId)) s.unrest = clamp(s.unrest + shift, 0, 100);

  const isPlayer = houseId === world.playerHouseId;
  if (!isPlayer) rivalTrades(world, houseId, lines);

  // The Steward covers shortfalls at the Exchange if the coffers allow.
  for (const g of GOODS) {
    if (e.stock[g] >= 0) continue;
    const need = Math.ceil(-e.stock[g]);
    const err = tradeInPlace(world, houseId, g, need);
    if (!err) {
      const st = alive(world).find((c) => c.houseId === houseId && c.seat === 'steward');
      tell(world, houseId, `${st ? shortName(st.name) : 'The Steward'} bought ${need} ${RESOURCE_LABEL[g].toLowerCase()} at the Exchange to cover a shortfall.`, st ? [st.id] : undefined);
    } else {
      e.stock[g] = 0;
      if (g === 'provisions') {
        for (const s of heldSectors(world, houseId)) s.unrest = clamp(s.unrest + 3, 0, 100);
        tell(world, houseId, 'Food shortage: the stores ran dry and we could not buy enough. Unrest rises in every sector.');
      } else {
        tell(world, houseId, `${RESOURCE_LABEL[g]} ran out; work that needs it went short this Phase.`);
      }
    }
  }

  // Debt.
  if (e.stock.othes < 0) {
    const st = world.houses[houseId]!.standing;
    st.honour = clamp(st.honour - 1, 0, 100);
    tell(world, houseId, `We are in debt (${round(e.stock.othes).toLocaleString('en-US')} othes). Our word is worth less: honour −1.`);
  }
  void rng;
}

/** Rivals keep a couple of Phases of what they use, and sell what piles up. */
function rivalTrades(world: World, houseId: string, lines: LedgerLine[]) {
  const e = econ(world, houseId);
  const net = netPerPhase(lines);
  for (const g of GOODS) {
    const use = Math.max(0, -net[g]);
    const keep = g === 'navisium' ? Math.max(100, use * 2) : use * 2;
    if (e.stock[g] < keep && e.stock.othes > 1500) {
      const want = Math.ceil(keep - e.stock[g]);
      const afford = Math.floor((e.stock.othes - 1500) / buyPrice(world, houseId, g));
      const qty = Math.min(want, afford);
      if (qty > 0) tradeInPlace(world, houseId, g, qty);
    } else if (net[g] > 0 && e.stock[g] > net[g] * 6) {
      tradeInPlace(world, houseId, g, -Math.floor(e.stock[g] - net[g] * 3));
    } else if (g === 'navisium' && e.stock[g] > Math.max(300, use * 4)) {
      tradeInPlace(world, houseId, g, -Math.floor(e.stock[g] - Math.max(200, use * 3)));
    }
  }
}

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
