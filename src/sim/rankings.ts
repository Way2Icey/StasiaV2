// The Numarade's rankings: every house of the Archon measured in five ways (Power, Economy, Influence,
// Legacy, Knights) and overall, published each Orbit with a bulletin of who rose and who fell. Houses we
// know only from afar are measured from what the register shows of them. A house can lead in one and
// still not be first; the first house is the one strong everywhere, and the Archon's esteem follows it.
import { econ, phaseLedger } from './economy';
import { liveHouses, regardOf, isSim } from './archon';
import { formationsOf } from './war';
import { shipsOf } from './fleet';
import { renownOf } from './renown';
import { reservesOf } from './holdings';
import { partnersOf } from './lanes';
import { dateParts, type GameDate } from './time';
import { logRecord } from './records';
import type { World } from './types';

export type RankKey = 'power' | 'economy' | 'influence' | 'legacy' | 'knights';
export const RANK_KEYS: RankKey[] = ['power', 'economy', 'influence', 'legacy', 'knights'];
export const RANK_LABEL: Record<RankKey, string> = { power: 'Power', economy: 'Economy', influence: 'Influence', legacy: 'Legacy', knights: 'Knights' };
export const RANK_NOTE: Record<RankKey, string> = {
  power: 'Soldiers, ships, wars won and lost, and the fear the house inspires.',
  economy: 'What the house holds, what it takes in each Phase, and the trade it does.',
  influence: 'Seats in the Numarade, how the other houses regard it, its allies and its vassals.',
  legacy: 'Its age, its honour, its Crucible titles and its place in the annals.',
  knights: 'How many knights it keeps and how famous the best of them are.',
};
/** What a place in the top three earns. */
export const TOP_THREE: Record<RankKey, string> = {
  power: 'Corsairs and raiders pick other targets.',
  economy: 'Exchange dues fall from 10% to 6%.',
  influence: 'The Numarade grants 15% more Navisium.',
  legacy: 'Honour and respect no longer slip back.',
  knights: 'Board jobs for knights go better (+5%).',
};

export interface Part { label: string; value: number; shown: string; estimate?: boolean }
export interface HouseRank {
  id: string;
  score: Record<RankKey, number>;
  rank: Record<RankKey, number>;
  overall: number;
  place: number;
  parts: Record<RankKey, Part[]>;
}
export interface BulletinLine { text: string; houseIds: string[]; tone?: 'up' | 'down' | 'ours' }
export interface Bulletin { date: GameDate; lines: BulletinLine[] }
export interface RankingsState { at: GameDate; table: HouseRank[]; prev?: HouseRank[]; bulletins: Bulletin[]; /** How much of the annals the last bulletin had seen. */ histAt?: number; /** Each house's overall place at the last six bulletins, oldest first. */ form?: Record<string, number[]> }

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const knightsOf = (w: World, id: string) => Object.values(w.characters).filter((c) => c.alive && c.houseId === id && c.tier === 'full' && (c.role === 'Knight' || c.flags.some((f) => f.id === 'knighted')));
const takings = (w: World, id: string) => phaseLedger(w, id).filter((l) => l.resource === 'othes' && l.amount > 0).reduce((n, l) => n + l.amount, 0);
const fameOfBest = (w: World, id: string) => knightsOf(w, id).map((c) => renownOf(w, c)).sort((x, y) => y - x).slice(0, 5).reduce((s, v) => s + v, 0);

/** Per unit of might × worlds, what the houses we see whole hold: used to measure the rest. */
interface Calibration { wealth: number; income: number; knights: number; fame: number }
const scaleOf = (w: World, id: string) => { const a = w.archon!.houses[id]!; return a.might * Math.max(1, a.worlds) * (a.tier === 'great' ? 1.3 : 1); };
function calibrate(w: World): Calibration {
  const sims = Object.keys(w.houses).filter((h) => w.archon?.houses[h]);
  const acc = { wealth: 0, income: 0, knights: 0, fame: 0 };
  for (const id of sims) {
    const s = scaleOf(w, id);
    acc.wealth += (econ(w, id).stock.othes + reservesOf(w, id)) / s;
    acc.income += takings(w, id) / s;
    acc.knights += knightsOf(w, id).length / s;
    acc.fame += fameOfBest(w, id) / s;
  }
  const k = Math.max(1, sims.length);
  return { wealth: Math.max(1000, acc.wealth / k), income: Math.max(200, acc.income / k), knights: Math.max(0.5, acc.knights / k), fame: Math.max(5, acc.fame / k) };
}

/** Raw measures for one house, before they are scaled against the others. */
function measure(w: World, id: string, cal: Calibration): Record<RankKey, Part[]> {
  const a = w.archon!.houses[id]!;
  const sim = isSim(w, id);
  const h = w.houses[id];
  const year = dateParts(w.date).year;
  const forms = formationsOf(w, id);
  const soldiers = forms.filter((f) => f.kind !== 'fleet').reduce((n, f) => n + f.strength, 0);
  const fleet = forms.filter((f) => f.kind === 'fleet').reduce((n, f) => n + f.strength, 0) + (sim ? shipsOf(w, id).length * 6 : Math.round(a.might * a.worlds));
  const wars = (w.war?.wars ?? []).filter((x) => x.status === 'ended' && x.result && year - x.result.date.year <= 10);
  const won = wars.filter((x) => (x.result!.winner === 'attackers' && x.attackers.includes(id)) || (x.result!.winner === 'defenders' && x.defenders.includes(id))).length;
  const lost = wars.filter((x) => (x.result!.winner === 'attackers' && x.defenders.includes(id)) || (x.result!.winner === 'defenders' && x.attackers.includes(id))).length;
  const dread = h ? h.standing.dread : Math.round(a.personality.aggression * 40);
  // What the register shows of a distant house is less than it holds: the books we see are the books it shows.
  const scale = scaleOf(w, id) * 0.75;
  const wealth = h ? econ(w, id).stock.othes + reservesOf(w, id) : cal.wealth * scale * (0.8 + a.personality.greed * 0.4);
  const income = h ? takings(w, id) : cal.income * scale;
  const trade = h ? partnersOf(w, id).length * 2 + (id === w.playerHouseId ? (w.quests?.pacts ?? []).length : 0) : Math.round(a.worlds / 2);
  const others = liveHouses(w).filter((x) => x.id !== id);
  const regard = others.length ? others.reduce((n, x) => n + regardOf(w, x.id, id), 0) / others.length : 0;
  const n = w.archon!.numarade;
  const seat = n.exarchon?.houseId === id ? 100 : n.seats.includes(id) ? (a.tier === 'great' ? 70 : 50) : n.capanna.some((c) => c.houseId === id) ? 30 : 0;
  const allies = (w.archon!.pacts ?? []).filter((p) => p.a === id || p.b === id).length + Object.values(w.war?.liege ?? {}).filter((l) => l === id).length * 2;
  const age = year - (a.founded || year - 300);
  const honour = h ? h.standing.honour : Math.round(a.personality.honour * 100);
  const titles = (w.crucible?.history ?? []).filter((x) => x.champion === id).length;
  const runner = (w.crucible?.history ?? []).filter((x) => x.runnerUp === id).length;
  const annals = (w.archon!.history ?? []).filter((e) => e.houses.includes(id)).length;
  let knights: number, fame: number;
  if (h) { knights = knightsOf(w, id).length; fame = fameOfBest(w, id); }
  else {
    knights = Math.round(cal.knights * scale);
    const r = w.crucible?.rosters?.[id];
    fame = r ? r.knight * 3 + r.champion.won * 4 : cal.fame * scale;
  }
  const est = !sim;
  return {
    power: [
      { label: 'Soldiers', value: soldiers, shown: fmt(soldiers) },
      { label: 'Fleet', value: fleet, shown: fmt(fleet) },
      { label: 'Wars won and lost, ten years', value: won * 2 - lost * 2 + 4, shown: `${won} won · ${lost} lost` },
      { label: 'Dread', value: dread, shown: `${dread}`, estimate: est },
    ],
    economy: [
      { label: 'Coffers and reserves', value: wealth, shown: fmt(wealth), estimate: est },
      { label: 'Takings a Phase', value: income, shown: fmt(income), estimate: est },
      { label: 'Trade', value: trade, shown: `${trade}`, estimate: est },
    ],
    influence: [
      { label: 'Seat', value: seat, shown: seat === 100 ? 'Exarchon' : seat >= 50 ? 'Numarade seat' : seat ? 'Capanna' : 'none' },
      { label: 'Regard of the houses', value: regard + 100, shown: `${regard >= 0 ? '+' : ''}${Math.round(regard)}` },
      { label: 'Allies and vassals', value: allies, shown: `${allies}` },
      { label: 'Prestige', value: a.prestige, shown: `${Math.round(a.prestige)}` },
    ],
    legacy: [
      { label: 'Age of the house', value: age, shown: `${age} years` },
      { label: 'Honour', value: honour, shown: `${honour}`, estimate: est },
      { label: 'Crucible titles', value: titles * 3 + runner, shown: `${titles} won · ${runner} runner-up` },
      { label: 'In the annals', value: annals, shown: `${annals} entries` },
    ],
    knights: [
      { label: 'Knights', value: knights, shown: `${knights}`, estimate: est },
      { label: 'Fame of the best five', value: fame, shown: `${Math.round(fame)}`, estimate: est },
    ],
  };
}

/** Big, uneven measures are compared on a log scale, so one rich house does not flatten the rest. */
const LOG = new Set(['Soldiers', 'Fleet', 'Coffers and reserves', 'Takings a Phase', 'Fame of the best five', 'Age of the house', 'In the annals']);

/** Measure every house and rank them. */
export function computeRankings(w: World): HouseRank[] {
  if (!w.archon) return [];
  const ids = liveHouses(w).map((h) => h.id);
  if (!ids.length) return [];
  const cal = calibrate(w);
  const raw = Object.fromEntries(ids.map((id) => [id, measure(w, id, cal)])) as Record<string, Record<RankKey, Part[]>>;
  const out: HouseRank[] = ids.map((id) => ({ id, score: {} as Record<RankKey, number>, rank: {} as Record<RankKey, number>, overall: 0, place: 0, parts: raw[id]! }));
  for (const k of RANK_KEYS) {
    const count = raw[ids[0]!]![k].length;
    for (let i = 0; i < count; i++) {
      const label = raw[ids[0]!]![k][i]!.label;
      const v = (id: string) => { const x = Math.max(0, raw[id]![k][i]!.value); return LOG.has(label) ? Math.log1p(x) : x; };
      const lo = Math.min(...ids.map(v)), hi = Math.max(...ids.map(v));
      for (const r of out) r.score[k] = (r.score[k] ?? 0) + (hi > lo ? ((v(r.id) - lo) / (hi - lo)) * 100 : 50) / count;
    }
    for (const r of out) r.score[k] = Math.round(r.score[k]);
    [...out].sort((x, y) => y.score[k] - x.score[k]).forEach((r, i) => { r.rank[k] = i + 1; });
  }
  for (const r of out) r.overall = Math.round(RANK_KEYS.reduce((n, k) => n + r.score[k], 0) / RANK_KEYS.length);
  [...out].sort((x, y) => y.overall - x.overall || y.score.influence - x.score.influence).forEach((r, i) => { r.place = i + 1; });
  return out.sort((x, y) => x.place - y.place);
}

export function ensureRankings(w: World): RankingsState {
  if (!w.rankings) w.rankings = { at: w.date, table: computeRankings(w), bulletins: [], histAt: w.archon?.history.length ?? 0 };
  w.rankings.bulletins ??= [];
  return w.rankings;
}

export { inTopThree, weakestInPower } from './rankcheck';

/** Each Orbit: measure, publish, and let prestige follow the measure a little. */
export function advanceRankings(w: World, orbitTurned: boolean): void {
  if (!w.archon) return;
  const s = ensureRankings(w);
  if (!orbitTurned) return;
  const prev = s.table;
  const table = computeRankings(w);
  s.prev = prev; s.table = table; s.at = w.date;
  s.form ??= {};
  for (const r of table) s.form[r.id] = [...(s.form[r.id] ?? []), r.place].slice(-6);
  // Prestige is what the Archon thinks of a house; over time it follows what the house is.
  for (const r of table) { const a = w.archon.houses[r.id]; if (a) a.prestige = Math.round((a.prestige + (r.overall - a.prestige) * 0.08) * 10) / 10; }
  s.bulletins.unshift(bulletin(w, prev, table));
  s.bulletins = s.bulletins.slice(0, 12);
  const us = table.find((x) => x.id === w.playerHouseId);
  const was = prev.find((x) => x.id === w.playerHouseId);
  if (us && was && us.place !== was.place) {
    logRecord(w, { kind: 'world', type: 'politics', severity: 2, text: `The Numarade's bulletin: House ${w.houses[w.playerHouseId]!.name} ${us.place < was.place ? 'rises' : 'falls'} to ${ordinal(us.place)} of the Archon.`, houseIds: [w.playerHouseId], source: 'the Numarade' });
  }
}

export const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
const nameOf = (w: World, id: string) => w.archon?.houses[id]?.name ?? w.houses[id]?.name ?? id;

/** The Orbit's bulletin: the first house, new leaders, the risers and fallers, the news, and where we stand. */
function bulletin(w: World, prev: HouseRank[], table: HouseRank[]): Bulletin {
  const lines: BulletinLine[] = [];
  const P = w.playerHouseId;
  const before = Object.fromEntries(prev.map((r) => [r.id, r]));
  const top = table[0];
  if (top) lines.push({ text: before[top.id]?.place === 1 ? `House ${nameOf(w, top.id)} holds first place in the Archon.` : `House ${nameOf(w, top.id)} takes first place in the Archon.`, houseIds: [top.id] });
  for (const k of RANK_KEYS) {
    const lead = table.find((r) => r.rank[k] === 1);
    const was = prev.find((r) => r.rank[k] === 1);
    if (lead && was && lead.id !== was.id) lines.push({ text: `House ${nameOf(w, lead.id)} overtakes House ${nameOf(w, was.id)} to lead in ${RANK_LABEL[k]}.`, houseIds: [lead.id, was.id] });
  }
  const moves = table.map((r) => ({ r, d: (before[r.id]?.place ?? r.place) - r.place })).filter((x) => x.d && x.r.id !== P).sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
  const riser = moves.find((x) => x.d > 0), faller = moves.find((x) => x.d < 0);
  if (riser) lines.push({ text: `House ${nameOf(w, riser.r.id)} climbs ${riser.d} to ${ordinal(riser.r.place)}${why(before[riser.r.id], riser.r, true)}.`, houseIds: [riser.r.id], tone: 'up' });
  if (faller) lines.push({ text: `House ${nameOf(w, faller.r.id)} falls ${-faller.d} to ${ordinal(faller.r.place)}${why(before[faller.r.id], faller.r, false)}.`, houseIds: [faller.r.id], tone: 'down' });
  // What the Archon talked about since the last bulletin.
  const hist = w.archon?.history ?? [];
  const from = w.rankings?.histAt ?? hist.length;
  for (const e of hist.slice(from).filter((x) => x.kind !== 'founding').slice(-3)) lines.push({ text: e.text, houseIds: e.houses });
  if (w.rankings) w.rankings.histAt = hist.length;
  const us = table.find((r) => r.id === P);
  if (us) {
    const was = before[P];
    const d = was ? was.place - us.place : 0;
    const best = [...RANK_KEYS].sort((x, y) => us.rank[x] - us.rank[y])[0]!;
    const reason = d ? why(was, us, d > 0) : '';
    lines.push({ text: `House ${nameOf(w, P)} stands ${ordinal(us.place)} of ${table.length}${d ? ` (${d > 0 ? 'up' : 'down'} ${Math.abs(d)}${reason ? `,${reason}` : ''})` : ''}. Our best ranking: ${RANK_LABEL[best]}, ${ordinal(us.rank[best])}.`, houseIds: [P], tone: 'ours' });
  }
  return { date: w.date, lines };
}

/** The ranking that moved most in the direction given, as a short reason. */
function why(was: HouseRank | undefined, now: HouseRank, up: boolean): string {
  if (!was) return '';
  const k = [...RANK_KEYS].sort((x, y) => (up ? (now.score[y] - was.score[y]) - (now.score[x] - was.score[x]) : (now.score[x] - was.score[x]) - (now.score[y] - was.score[y])))[0]!;
  const d = now.score[k] - was.score[k];
  if (!d || (up && d < 0) || (!up && d > 0)) return '';
  return ` on ${up ? 'stronger' : 'weaker'} ${RANK_LABEL[k].toLowerCase()}`;
}
