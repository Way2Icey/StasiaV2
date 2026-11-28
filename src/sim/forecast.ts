// The forecast: the next 16 cycles of a war, played out several times on a copy, from what we know.
//
// The copy holds only the war and the stores; nothing outside them is touched, no battle opens and no one dies.
// The enemy in the copy is the enemy as we see it: groups we have never seen are left out, rumours stand at their
// rumoured strength, and groups we have lost sight of stand where we last saw them. Their commanders then act as
// their doctrine says they would. So the forecast is only as good as our intel, as a staff's would be.
//
// It answers: what are the odds this Phase goes our way, what will it cost, where will everyone be each cycle, and
// which fights are coming. The calculator asks it the same question for each alternative order.
import { Rng } from './rng';
import { absoluteCycle, addCycles, CYCLES_PER_PHASE } from './time';
import { applyOrder, cannotOrder, groupsOf, theatreOf, theatreTurn, type GroupOrder, type TheatreState, type WGroup, type WSide } from './warroom';
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
  /** How well we see it now: 3 known .. 0 last seen. Ours are 3. */
  seen: number;
}

export interface ForecastContact { node: string; cycle: number; title: string; runs: number; won: number; pOurs: number }

export interface Forecast {
  runs: number;
  /** Share of runs in which the Phase goes our way (ties count half). */
  pWin: number;
  /** Mean change in the war's score, from our side. */
  score: number;
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
function fog(t: TheatreState, side: WSide): void {
  for (const g of Object.values(t.groups)) {
    if (g.side === side) continue;
    const s = t.sight[side][g.id];
    if (!s) { delete t.groups[g.id]; continue; }
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

interface Run { score: number; ourLoss: number; theirLoss: number; used: Record<Good, number>; stock: Record<Good, number[]>; tracks: Track[]; reports: { node: string; cycle: number; title: string; won: boolean; p: number }[]; taken: Forecast['taken'] }

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
      const tr = tracks[g.id] ??= { id: g.id, name: g.name, house: g.house, side: g.side, domain: g.domain, ours: g.side === side, at: [], n: [], seen: g.side === side ? 3 : t.sight[side][g.id]?.level ?? 0 };
      while (tr.at.length < cycle) { tr.at.push(tr.at.at(-1) ?? g.at); tr.n.push(tr.n.at(-1) ?? g.n); }
      tr.at[cycle] = g.at; tr.n[cycle] = g.n;
    }
  };
  if (keepTracks) snap(0);
  const rng = Rng.fromSeed(seed);
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
  return {
    score: (war.score - score0) * sign,
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
export function forecastWar(w: World, warId: string, runs = 6, salt = ''): Forecast | null {
  const war = w.war?.wars.find((x) => x.id === warId && x.status === 'active');
  const t = war ? theatreOf(war) : undefined;
  if (!war || !t) return null;
  const side = sideOf(war, w.playerHouseId);
  if (!side) return null;
  const base = prepared(w, warId, side);
  return summarise(base, warId, runs, salt);
}

/** A copy of the world with the enemy fogged, ready to be played forward (and to take what-if orders). */
function prepared(w: World, warId: string, side: WSide): World {
  const base = lightCopy(w);
  const war = base.war!.wars.find((x) => x.id === warId)!;
  fog(theatreOf(war)!, side);
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
    pWin: out.reduce((a, x) => a + 1 / (1 + Math.exp(-x.score / 5)), 0) / runs,
    score: mean((x) => x.score),
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
    return { order: o, pWin: f?.pWin ?? 0, score: f?.score ?? 0 };
  });
}

/** The staff's best plan: each of our groups in turn given its best destination (with the others' best so far),
 *  one pass. Returns the orders and the odds with them. */
export function bestPlan(w: World, warId: string, runs = 4): { orders: Record<string, GroupOrder>; pWin: number; score: number } | null {
  const war = w.war?.wars.find((x) => x.id === warId && x.status === 'active');
  const t = war ? theatreOf(war) : null;
  if (!war || !t) return null;
  const orders: Record<string, GroupOrder> = {};
  let best = forecastWith(w, warId, {}, runs);
  if (!best) return null;
  const ours = Object.values(t.groups).filter((g) => g.house === w.playerHouseId).sort((a, b) => b.n * (b.domain === 'void' ? 1000 : 1) - a.n * (a.domain === 'void' ? 1000 : 1));
  for (const g of ours) {
    const places = Object.keys(t.nodes).filter((id) => id !== g.at && !cannotOrder(w, warId, g.id, { to: id }));
    for (const to of [null, ...places]) {
      if ((to ?? null) === (g.to ?? null)) continue;
      const f = forecastWith(w, warId, { ...orders, [g.id]: { to } }, runs);
      if (f && (f.pWin > best.pWin + 0.005 || (Math.abs(f.pWin - best.pWin) <= 0.005 && f.score > best.score + 0.5))) { best = f; orders[g.id] = { to }; }
    }
  }
  return { orders, pWin: best.pWin, score: best.score };
}

// ---------------------------------------------------------------- the brief: what needs an answer this Phase

export interface BriefOption { label: string; note: string; orders: Record<string, GroupOrder> }
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
  // Unknown: enemy groups we have lost.
  const lostSight = Object.values(t.sight[side]).filter((s) => s.level === 0).length;
  if (lostSight) items.push({ kind: 'unknown', title: `${lostSight} of their groups unseen`, when: '?', options: [{ label: 'Leave it', note: 'risk it', orders: {} }] });
  return items;
}

export { HULL_TYPES };
export type { WGroup };
