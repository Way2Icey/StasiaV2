// The forecast: the next 16 cycles of a war, played out several times on a copy, from what we know.
//
// The copy holds only the war and the stores; nothing outside them is touched, no battle opens and no one dies.
// The enemy in the copy is the enemy as we see it: rumours stand at their rumoured strength, groups we have lost
// sight of stand where we last saw them, and groups we have never seen stand where the staff fear them most (at
// the place their side holds nearest the front, at the strength the registers give). Their commanders then act as
// their doctrine says they would. So the forecast is only as good as our intel, as a staff's would be.
//
// It answers: what are the odds this Phase goes our way, what will it cost, where will everyone be each cycle, and
// which fights are coming. The calculator asks it the same question for each alternative order.
import { Rng } from './rng';
import { absoluteCycle, addCycles, CYCLES_PER_PHASE } from './time';
import { cannotPlant, networkIn, networksOf, plantTerms } from './networks';
import { houseName } from './archon';
import { applyOrder, cannotOrder, PROBE_COST, groupsOf, theatreOf, theatreTurn, type GroupOrder, type TheatreState, type WGroup, type WNode, type WSide } from './warroom';
import { HULL_TYPES, mixFor } from '../data/hulls';
import type { Good } from '../data/economy';
import type { War } from './war';
import type { World } from './types';

export const HORIZON = CYCLES_PER_PHASE;
export const FORECAST_GOODS: Good[] = ['fuel', 'provisions', 'components', 'navisium'];

export interface Track {
  id: string;
  name: string;
  house: string;
  side: WSide;
  domain: 'ground' | 'void';
  ours: boolean;
  /** Where it is at the end of each cycle, 0..HORIZON (0 = now). */
  at: string[];
  n: number[];
  /** How well we see it now: 3 known .. 0 last seen, -1 never seen (placed by the staff's guess). Ours are 3. */
  seen: number;
}

export interface ForecastContact { node: string; cycle: number; title: string; runs: number; won: number; pOurs: number }

export interface Forecast {
  runs: number;
  /** Share of runs in which the Phase goes our way (ties count half). */
  pWin: number;
  /** Mean change in the war's score, from our side. */
  score: number;
  /** Mean exhaustion the Phase costs us more than them (losses against strength, an empty treasury). */
  wear: number;
  ourLoss: number;
  theirLoss: number;
  /** Mean of what we use, by good (positive = used). */
  cost: Record<Good, number>;
  /** Our stores by cycle (mean), 0..HORIZON. */
  stock: Record<Good, number[]>;
  contacts: ForecastContact[];
  /** Positions by cycle, from the first run. */
  tracks: Track[];
  /** Places that change hands, from the first run. */
  taken: { node: string; by: WSide; cycle: number }[];
}

/** The war and the stores, copied; the rest of the world shared and left alone. */
function lightCopy(w: World): World {
  return {
    ...w,
    war: structuredClone(w.war),
    economy: structuredClone(w.economy),
    battles: w.battles ? { ...w.battles, list: [] } : w.battles,
    feed: [],
    date: { ...w.date },
  } as World;
}

const sideOf = (war: War, h: string): WSide | null => (war.attacker === h || war.attackers.includes(h) ? 'attackers' : war.defender === h || war.defenders.includes(h) ? 'defenders' : null);

/** Replace the enemy with the enemy as we see it. */
/** Unseen groups, and where each might be: read by every run (fog fills it, a run places them). */
const MAYBE = new Map<string, string[]>();

function fog(t: TheatreState, side: WSide): void {
  for (const g of Object.values(t.groups)) {
    if (g.side === side) continue;
    const s = t.sight[side][g.id];
    if (!s) {
      // Never seen: the staff know the house's strength from the registers, not where it is. Each run of the
      // forecast puts it somewhere else its side holds that it could stand in, so the odds carry the doubt.
      const fits = (n: WNode) => n.holder === g.side && (g.domain === 'void' ? n.kind !== 'ground' : n.kind === 'ground' || n.kind === 'station');
      const maybe = Object.values(t.nodes).filter(fits).map((n) => n.id);
      if (!maybe.length) { delete t.groups[g.id]; continue; }
      MAYBE.set(g.id, maybe);
      continue;
    }
    const ratio = g.n > 0 ? s.n / g.n : 1;
    g.n = Math.max(1, Math.round(s.n));
    if (g.domain === 'void') g.hulls = mixFor(g.n);
    else g.from = g.from.map((x) => ({ ...x, n: Math.round(x.n * ratio) }));
    if (s.level === 0) { g.at = s.at; g.path = []; g.to = undefined; g.arrive = undefined; }
  }
  // Fights being fought in the battle engine are left out: their groups stand where they are.
  t.contacts = [];
  for (const g of Object.values(t.groups)) g.engaged = undefined;
}

interface Run { score: number; wear: number; ourLoss: number; theirLoss: number; used: Record<Good, number>; stock: Record<Good, number[]>; tracks: Track[]; reports: { node: string; cycle: number; title: string; won: boolean; p: number }[]; taken: Forecast['taken'] }

function runOnce(base: World, warId: string, seed: string, keepTracks: boolean): Run {
  const w = lightCopy(base);
  const war = w.war!.wars.find((x) => x.id === warId)!;
  const t = theatreOf(war)!;
  t.sim = true;
  const P = w.playerHouseId;
  const side = sideOf(war, P)!;
  const sign = side === 'attackers' ? 1 : -1;
  const start = absoluteCycle(w.date);
  const score0 = war.score;
  const loss0 = { ...war.losses };
  const e = w.economy.houses[P];
  const stock0 = Object.fromEntries(FORECAST_GOODS.map((g) => [g, e?.stock[g] ?? 0])) as Record<Good, number>;
  const stock = Object.fromEntries(FORECAST_GOODS.map((g) => [g, [stock0[g]]])) as Record<Good, number[]>;
  const reports0 = t.reports.length ? t.reports[0]!.id : '';
  const holders0 = Object.fromEntries(Object.values(t.nodes).map((n) => [n.id, n.holder]));
  const taken: Forecast['taken'] = [];
  const tracks: Record<string, Track> = {};
  const snap = (cycle: number) => {
    for (const g of Object.values(t.groups)) {
      const tr = tracks[g.id] ??= { id: g.id, name: g.name, house: g.house, side: g.side, domain: g.domain, ours: g.side === side, at: [], n: [], seen: g.side === side ? 3 : t.sight[side][g.id] ? t.sight[side][g.id]!.level : -1 };
      while (tr.at.length < cycle) { tr.at.push(tr.at.at(-1) ?? g.at); tr.n.push(tr.n.at(-1) ?? g.n); }
      tr.at[cycle] = g.at; tr.n[cycle] = g.n;
    }
  };
  const rng = Rng.fromSeed(seed);
  for (const [gid, maybe] of MAYBE) {
    const g = t.groups[gid];
    if (!g) continue;
    g.at = maybe[Math.floor(rng.next() * maybe.length)]!; g.path = []; g.to = undefined; g.arrive = undefined; g.hold = undefined;
  }
  if (keepTracks) snap(0);
  for (let step = 1; step <= HORIZON / 2; step++) {
    const before = absoluteCycle(w.date);
    w.date = addCycles(w.date, 2);
    const phase = Math.floor(absoluteCycle(w.date) / CYCLES_PER_PHASE) > Math.floor(before / CYCLES_PER_PHASE);
    theatreTurn(w, rng, war, phase);
    if (keepTracks) { snap(step * 2 - 1); snap(step * 2); }
    for (const g of FORECAST_GOODS) { const v = e?.stock[g] ?? 0; stock[g].push(v, v); }
    for (const n of Object.values(t.nodes)) if (n.holder !== holders0[n.id] && n.holder && !taken.some((x) => x.node === n.id)) taken.push({ node: n.id, by: n.holder, cycle: step * 2 });
  }
  const fresh = [];
  for (const r of t.reports) { if (r.id === reports0) break; fresh.push(r); }
  const lost = (houses: string[]) => houses.reduce((n, h) => n + (war.losses[h] ?? 0) - (loss0[h] ?? 0), 0);
  const ours = [war.attacker, ...war.attackers, war.defender, ...war.defenders].filter((h) => sideOf(war, h) === side);
  const theirs = [war.attacker, ...war.attackers, war.defender, ...war.defenders].filter((h) => sideOf(war, h) !== side);
  // What the Phase costs in exhaustion, which ends wars as surely as the score: the share of each side's
  // strength lost (weighed as the war weighs it), and an empty treasury.
  const strength = (houses: string[]) => Object.values(w.war!.formations).filter((f) => houses.includes(f.houseId)).reduce((t, f) => t + f.max * (f.kind === 'legion' ? 1 : f.kind === 'fleet' ? 1000 : 2), 0) || 1;
  const broke = (houses: string[]) => houses.some((h) => (w.economy.houses[h]?.stock.othes ?? 0) < 0) ? 1.2 * (HORIZON / 16) : 0;
  const wear = (lost(ours) / strength(ours) - lost(theirs) / strength(theirs)) * 110 + broke(ours) - broke(theirs);
  return {
    score: (war.score - score0) * sign,
    wear,
    ourLoss: lost(ours), theirLoss: lost(theirs),
    used: Object.fromEntries(FORECAST_GOODS.map((g) => [g, stock0[g] - (e?.stock[g] ?? 0)])) as Record<Good, number>,
    stock,
    tracks: Object.values(tracks),
    reports: fresh.reverse().map((r) => {
      const involved = [...r.sides.attackers.groups, ...r.sides.defenders.groups];
      void involved;
      return { node: r.where, cycle: r.cycle - start, title: r.title, won: r.winner === side, p: side === 'attackers' ? r.p : 1 - r.p };
    }),
    taken,
  };
}

/** Play the next 16 cycles out `runs` times and sum it up. */
export function forecastWar(w: World, warId: string, runs = 6, salt = '', truth = false): Forecast | null {
  const war = w.war?.wars.find((x) => x.id === warId && x.status === 'active');
  const t = war ? theatreOf(war) : undefined;
  if (!war || !t) return null;
  const side = sideOf(war, w.playerHouseId);
  if (!side) return null;
  const base = prepared(w, warId, side, truth);
  return summarise(base, warId, runs, salt);
}

/** A copy of the world with the enemy fogged, ready to be played forward (and to take what-if orders). */
function prepared(w: World, warId: string, side: WSide, truth = false): World {
  const base = lightCopy(w);
  const war = base.war!.wars.find((x) => x.id === warId)!;
  MAYBE.clear();
  if (!truth) fog(theatreOf(war)!, side);
  return base;
}

function summarise(base: World, warId: string, runs: number, salt: string): Forecast {
  const out: Run[] = [];
  for (let r = 0; r < runs; r++) out.push(runOnce(base, warId, `${base.seed}/fc/${absoluteCycle(base.date)}/${salt}/${r}`, r === 0));
  const mean = (f: (x: Run) => number) => out.reduce((a, x) => a + f(x), 0) / out.length;
  // A place fought over: in how many runs, and the odds there (the first fight at it in each run).
  const contacts = new Map<string, ForecastContact>();
  for (const run of out) {
    const seen = new Set<string>();
    for (const c of run.reports) {
      if (seen.has(c.node)) continue;
      seen.add(c.node);
      const k = contacts.get(c.node) ?? { node: c.node, cycle: c.cycle, title: c.title, runs: 0, won: 0, pOurs: 0 };
      k.runs++; if (c.won) k.won++; k.pOurs += c.p; k.cycle = Math.min(k.cycle, c.cycle);
      contacts.set(c.node, k);
    }
  }
  const stock = Object.fromEntries(FORECAST_GOODS.map((g) => [g, out[0]!.stock[g].map((_, i) => out.reduce((a, x) => a + (x.stock[g][i] ?? 0), 0) / out.length)])) as Record<Good, number[]>;
  return {
    runs,
    // Each run's outcome read softly (a narrow win is not a sure one), so the odds move with every choice.
    // A Phase goes our way when what it gains outweighs what it wears out of us.
    pWin: out.reduce((a, x) => a + 1 / (1 + Math.exp(-(x.score - x.wear) / 5)), 0) / runs,
    score: mean((x) => x.score),
    wear: mean((x) => x.wear),
    ourLoss: mean((x) => x.ourLoss),
    theirLoss: mean((x) => x.theirLoss),
    cost: Object.fromEntries(FORECAST_GOODS.map((g) => [g, mean((x) => x.used[g])])) as Record<Good, number>,
    stock,
    contacts: [...contacts.values()].map((c) => ({ ...c, pOurs: c.pOurs / c.runs })).sort((a, b) => a.cycle - b.cycle),
    tracks: out[0]!.tracks,
    taken: out[0]!.taken,
  };
}

/** The forecast with our plan changed: orders for some of our groups. */
export function forecastWith(w: World, warId: string, orders: Record<string, GroupOrder>, runs = 6, salt = ''): Forecast | null {
  const war0 = w.war?.wars.find((x) => x.id === warId && x.status === 'active');
  const side = war0 ? sideOf(war0, w.playerHouseId) : null;
  if (!war0 || !side) return null;
  const base = prepared(w, warId, side);
  const war = base.war!.wars.find((x) => x.id === warId)!;
  const t = theatreOf(war)!;
  for (const [gid, o] of Object.entries(orders)) {
    const g = t.groups[gid];
    if (g && g.house === w.playerHouseId) { try { applyOrder(base, war, t, g, o); } catch { /* an order that cannot be given is left out */ } }
  }
  return summarise(base, warId, runs, salt);
}

/** For each alternative order of one group: the odds that the Phase goes our way with it. */
export function whatIf(w: World, warId: string, gid: string, options: GroupOrder[], runs = 4): { order: GroupOrder; pWin: number; score: number }[] {
  return options.map((o, i) => {
    // The same dice for every option, so the difference between them is the choice and not the luck.
    const f = forecastWith(w, warId, { [gid]: o }, runs);
    void i;
    return { order: o, pWin: f?.pWin ?? 0, score: (f?.score ?? 0) - (f?.wear ?? 0) };
  });
}

/** The staff's best plan, one pass over our groups: first where each goes (with the others' best so far), then
 *  when each that is going leaves, then how each fights. Returns the orders and the odds with them. */
export function bestPlan(w: World, warId: string, runs = 4, start: Record<string, GroupOrder> = {}): { orders: Record<string, GroupOrder>; pWin: number; score: number } | null {
  const war = w.war?.wars.find((x) => x.id === warId && x.status === 'active');
  const t = war ? theatreOf(war) : null;
  if (!war || !t) return null;
  const orders: Record<string, GroupOrder> = structuredClone(start);
  let best = forecastWith(w, warId, orders, runs);
  if (!best) return null;
  const better = (f: Forecast | null): f is Forecast => !!f && (f.pWin > best!.pWin + 0.005 || (Math.abs(f.pWin - best!.pWin) <= 0.005 && f.score - f.wear > best!.score - best!.wear + 0.5));
  const tryOrder = (gid: string, o: GroupOrder) => {
    const next = { ...orders, [gid]: { ...orders[gid], ...o } };
    const f = forecastWith(w, warId, next, runs);
    if (better(f)) { best = f; orders[gid] = next[gid]!; }
  };
  const ours = Object.values(t.groups).filter((g) => g.house === w.playerHouseId && !g.engaged).sort((a, b) => b.n * (b.domain === 'void' ? 1000 : 1) - a.n * (a.domain === 'void' ? 1000 : 1));
  const destOf = (g: WGroup) => (orders[g.id] && 'to' in orders[g.id]! ? orders[g.id]!.to ?? null : g.to ?? null);
  // Where.
  for (const g of ours) {
    const places = Object.keys(t.nodes).filter((id) => id !== g.at && !cannotOrder(w, warId, g.id, { to: id }));
    for (const to of [null, ...places]) if (to !== destOf(g)) tryOrder(g.id, { to });
  }
  // When: a group that waits can arrive with another, or after the enemy has committed.
  for (const g of ours) {
    const to = destOf(g);
    if (!to) continue;
    for (const leave of [2, 4, 6, 8]) tryOrder(g.id, { to, leave });
  }
  // How.
  for (const g of ours) for (const duty of ['attack', 'defend', 'support'] as const) if (duty !== (orders[g.id]?.duty ?? g.duty)) tryOrder(g.id, { duty });
  return { orders, pWin: best.pWin, score: best.score };
}

/** A whole plan: an order for every group of ours, judged together. */
export interface StaffPlan { name: string; note: string; orders: Record<string, GroupOrder>; pWin: number; score: number; wear: number; ourLoss: number; theirLoss: number }

/** The staff's plans: whole plans for every group at once (stand fast, everything at one place, the fleet over a
 *  world with the troops on it), each judged as one thing, and the best of them refined group by group. The top
 *  three different plans, best first. */
export function staffPlans(w: World, warId: string, runs = 4): StaffPlan[] {
  const war = w.war?.wars.find((x) => x.id === warId && x.status === 'active');
  const t = war ? theatreOf(war) : null;
  const side = war ? sideOf(war, w.playerHouseId) : null;
  if (!war || !t || !side) return [];
  const ours = Object.values(t.groups).filter((g) => g.house === w.playerHouseId && !g.engaged);
  if (!ours.length) return [];
  const can = (g: WGroup, to: string) => to === g.at || !cannotOrder(w, warId, g.id, { to });
  const short = (id: string) => (t.nodes[id]?.name ?? id).replace(/^the /, '');
  const candidates: { name: string; note: string; orders: Record<string, GroupOrder> }[] = [];
  candidates.push({ name: 'As ordered', note: 'every group keeps the orders it has', orders: {} });
  candidates.push({ name: 'Stand fast', note: 'every group holds where it is', orders: Object.fromEntries(ours.map((g) => [g.id, { to: null }])) });
  // Places worth the whole force: theirs to take, ours to save.
  const worth = Object.values(t.nodes).filter((n) => n.kind !== 'lane' && (n.holder !== side || n.owner === side));
  for (const n of worth) {
    // Everything that can get there, goes.
    const all: Record<string, GroupOrder> = {};
    for (const g of ours) if (g.at !== n.id && can(g, n.id)) all[g.id] = { to: n.id };
    if (Object.keys(all).length) candidates.push({ name: `Everything to ${short(n.id)}`, note: `${Object.keys(all).length} of ${ours.length} groups converge`, orders: all });
    // A world: the fleet takes the space over it, the troops land.
    if (n.kind === 'ground' && n.world) {
      const orbit = Object.values(t.nodes).find((x) => x.kind === 'orbit' && x.world === n.world);
      if (!orbit) continue;
      const o: Record<string, GroupOrder> = {};
      for (const g of ours) {
        if (g.domain === 'void' && can(g, orbit.id) && g.at !== orbit.id) o[g.id] = { to: orbit.id, duty: 'support' };
        // Troops wait two cycles for the fleet to clear the space first.
        if (g.domain === 'ground' && can(g, n.id) && g.at !== n.id) o[g.id] = { to: n.id, leave: 2 };
      }
      const troops = Object.values(o).some((x) => x.leave);
      if (Object.keys(o).length) candidates.push({ name: troops ? `Fleet over ${short(n.id)}, troops onto it` : `The fleet over ${short(n.id)}`, note: troops ? 'the fleet clears the space; the troops follow two cycles behind' : 'the fleet takes the space over it; the troops stay', orders: o });
    }
  }
  const judged = candidates.map((c) => { const f = forecastWith(w, warId, c.orders, runs); return f ? { ...c, pWin: f.pWin, score: f.score, wear: f.wear, ourLoss: f.ourLoss, theirLoss: f.theirLoss } : null; }).filter((x): x is StaffPlan => !!x);
  judged.sort((a, b) => b.pWin - a.pWin || b.score - b.wear - (a.score - a.wear));
  // The best whole plan, then refined group by group from there.
  const top = judged[0];
  if (top) {
    const refined = bestPlan(w, warId, runs, top.orders);
    if (refined && refined.pWin > top.pWin + 0.01) {
      const f = forecastWith(w, warId, refined.orders, runs)!;
      judged.unshift({ name: `${top.name}, refined`, note: 'the best whole plan, then each group bettered in turn', orders: refined.orders, pWin: f.pWin, score: f.score, wear: f.wear, ourLoss: f.ourLoss, theirLoss: f.theirLoss });
    }
  }
  // The finalists judged again on the same dice as the odds at the top of the page, so a plan reads the same
  // before it is adopted and after.
  const sig = (o: Record<string, GroupOrder>) => JSON.stringify(Object.entries(o).sort());
  const finalists: StaffPlan[] = [];
  for (const p of judged) { if (finalists.some((x) => sig(x.orders) === sig(p.orders))) continue; finalists.push(p); if (finalists.length >= 5) break; }
  const rejudged = finalists.map((p) => { const f = forecastWith(w, warId, p.orders, 8); return f ? { ...p, pWin: f.pWin, score: f.score, wear: f.wear, ourLoss: f.ourLoss, theirLoss: f.theirLoss } : p; });
  return rejudged.sort((a, b) => b.pWin - a.pWin || b.score - b.wear - (a.score - a.wear)).slice(0, 3);
}

// ---------------------------------------------------------------- the brief: what needs an answer this Phase

export interface BriefOption {
  label: string; note: string; orders: Record<string, GroupOrder>;
  /** Not an order to our forces but a job for the Spymaster: a network in a house, or people sent to look at a place. */
  spy?: { kind: 'network'; house: string; cost: number; odds: number } | { kind: 'probe'; node: string; cost: number };
}
export interface BriefItem { kind: 'threat' | 'opportunity' | 'unknown'; title: string; when: string; node?: string; options: BriefOption[] }

/** From the forecast of doing nothing new: what is coming at us, what we could hit, and what we cannot see. */
export function briefOf(w: World, warId: string, f: Forecast): BriefItem[] {
  const war = w.war?.wars.find((x) => x.id === warId);
  const t = war ? theatreOf(war) : undefined;
  if (!war || !t) return [];
  const P = w.playerHouseId;
  const side = sideOf(war, P)!;
  const ours = groupsOf(t, side, P);
  const items: BriefItem[] = [];
  const name = (id: string) => t.nodes[id]?.name ?? id;
  const best = (domain: 'ground' | 'void') => ours.filter((g) => g.domain === domain).sort((a, b) => b.n - a.n)[0];
  const capital = Object.values(t.nodes).find((n) => n.owner === side && n.kind === 'ground' && n.capital);
  // Threats: enemy groups the forecast puts on our places.
  const seenThreat = new Set<string>();
  for (const tr of f.tracks.filter((x) => !x.ours)) {
    const idx = tr.at.findIndex((at, i) => i > 0 && t.nodes[at]?.owner === side);
    if (idx < 0) continue;
    const node = tr.at[idx]!;
    if (seenThreat.has(node)) continue;
    seenThreat.add(node);
    const n = t.nodes[node]!;
    const domain = n.kind === 'ground' || n.kind === 'station' ? 'ground' : 'void';
    const g = best(domain);
    const opts: BriefOption[] = [];
    if (g) opts.push({ label: `Meet them at ${name(node)}`, note: `${g.name} goes there now`, orders: { [g.id]: { to: node, leave: 0 } } });
    const all = ours.filter((x) => x.domain === domain);
    if (all.length > 1) opts.push({ label: 'Everything there', note: `${all.length} groups concentrate at ${name(node)}`, orders: Object.fromEntries(all.map((x) => [x.id, { to: node, leave: 0 }])) });
    if (capital && node !== capital.id && domain === 'ground') opts.push({ label: 'Fall back behind the walls', note: `our troops gather at ${capital.name}`, orders: Object.fromEntries(ours.filter((x) => x.domain === 'ground').map((x) => [x.id, { to: capital.id, leave: 0 }])) });
    const line = best('void');
    const lane = tr.at.slice(1, idx).find((at) => t.nodes[at]?.kind === 'lane' || t.nodes[at]?.kind === 'approach');
    if (line && lane && domain === 'ground') opts.push({ label: 'Hit them in transit', note: `${line.name} waits at ${name(lane)}`, orders: { [line.id]: { to: lane, leave: 0 } } });
    items.push({ kind: 'threat', title: `${tr.seen >= 2 ? tr.name : `${war.attacker === tr.house || war.defender === tr.house ? 'Their' : 'Allied'} ${tr.domain === 'void' ? 'ships' : 'troops'}`} reach ${name(node)}`, when: `c${idx}`, node, options: opts });
    if (items.length >= 2) break;
  }
  // Opportunity: an enemy group in the void without escort, or one weaker than our strongest.
  const target = f.tracks.find((tr) => !tr.ours && tr.seen >= 1 && tr.domain === 'ground' && tr.at.slice(1).some((at) => ['lane', 'approach', 'orbit'].includes(t.nodes[at]?.kind ?? '')));
  const line = best('void');
  if (target && line) {
    const i = target.at.findIndex((at, k) => k > 0 && ['lane', 'approach', 'orbit'].includes(t.nodes[at]?.kind ?? ''));
    const at = target.at[i]!;
    items.push({ kind: 'opportunity', title: `Their troops cross ${name(at)} in transports`, when: `c${i}`, node: at, options: [
      { label: `Catch them with ${line.name}`, note: `there by c${i}`, orders: { [line.id]: { to: at, leave: 0 } } },
      { label: 'Let them come', note: 'keep the fleet home', orders: {} },
    ] });
  }
  // Unknown: enemy groups we have never seen or have lost. The answer is the Spymaster's.
  const blind = Object.values(t.groups).filter((g) => g.side !== side && (t.sight[side][g.id]?.level ?? 0) === 0);
  if (blind.length) {
    const options: BriefOption[] = [];
    for (const h of [...new Set(blind.map((g) => g.house))]) {
      if (networkIn(w, h)) continue;
      const why = cannotPlant(w, h);
      const terms = plantTerms(w, h);
      options.push({ label: `Plant a network in House ${houseName(w, h)}`, note: why ?? `${terms.war ? 'harder in a war: ' : ''}reports from next Phase`, orders: {}, spy: { kind: 'network', house: h, cost: terms.cost, odds: terms.odds } });
    }
    // Where the forecast most often puts what we cannot see, mid-Phase.
    const count = new Map<string, number>();
    for (const tr of f.tracks) if (!tr.ours && tr.seen <= 0) { const at = tr.at[Math.floor(HORIZON / 2)] ?? tr.at[0]; if (at && !(t.probes[at] && t.probes[at]! > absoluteCycle(w.date))) count.set(at, (count.get(at) ?? 0) + 1); }
    const look = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (look) options.push({ label: `Send people to look at ${name(look)}`, note: 'sees there for a Phase', orders: {}, spy: { kind: 'probe', node: look, cost: PROBE_COST } });
    options.push({ label: 'Leave it', note: 'risk it', orders: {} });
    const pending = networksOf(w).filter((n) => blind.some((g) => g.house === n.house) && n.ready > absoluteCycle(w.date)).map((n) => houseName(w, n.house));
    items.push({ kind: 'unknown', title: `${blind.length} of their groups unseen${pending.length ? ` (our people in ${pending.join(', ')} report from next Phase)` : ''}`, when: '?', options });
  }
  return items;
}

export { HULL_TYPES };
export type { WGroup };
