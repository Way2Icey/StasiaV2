// Bills: what an action costs in all six resources, and paying them. Every system calls these, so that an envoy's
// passage, a raid, a host's march and a new academy all draw on the same stores.
//
// A house that is short buys what it lacks on the Exchange if its othes allow (the Steward does it without being
// asked); what still cannot be paid is not paid, and the caller is told how much of the bill was met.
import { GOODS, RESOURCE_LABEL, type Flow, type Good, type Resource } from '../data/economy';
import { record, buyUpTo, buyPrice } from './economy';
import type { LedgerLine, World } from './types';

const fmt = (n: number) => (Math.abs(n) >= 10 ? Math.round(n) : Math.round(n * 10) / 10).toLocaleString('en-US');

/** Add bills together. */
export function plus(...bills: Flow[]): Flow {
  const out: Flow = {};
  for (const b of bills) for (const [r, v] of Object.entries(b) as [Resource, number][]) if (v) out[r] = (out[r] ?? 0) + v;
  return out;
}

/** Scale a bill. */
export const times = (b: Flow, k: number): Flow => Object.fromEntries(Object.entries(b).map(([r, v]) => [r, (v as number) * k])) as Flow;

/** "1,200 othes · 40 metals · 5 components" */
export function billText(b: Flow): string {
  const order: Resource[] = ['othes', ...GOODS];
  const parts = order.filter((r) => (b[r] ?? 0) > 0.05).map((r) => `${fmt(b[r]!)} ${RESOURCE_LABEL[r].toLowerCase()}`);
  return parts.length ? parts.join(' · ') : 'nothing';
}

/** What of a bill we lack, after what the Exchange would sell us for the othes we have. Empty = affordable. */
export function shortfall(w: World, houseId: string, b: Flow): Flow {
  const e = w.economy?.houses[houseId];
  if (!e) return {};
  const out: Flow = {};
  let othes = e.stock.othes - (b.othes ?? 0);
  if (othes < 0) out.othes = -othes;
  for (const g of GOODS) {
    const need = (b[g] ?? 0) - Math.max(0, e.stock[g]);
    if (need <= 0) continue;
    const cost = need * buyPrice(w, houseId, g);
    if (othes >= cost) { othes -= cost; continue; }
    out[g] = need - Math.max(0, othes) / buyPrice(w, houseId, g);
    othes = 0;
  }
  return out;
}

export function cannotPay(w: World, houseId: string, b: Flow): string | null {
  const s = shortfall(w, houseId, b);
  const keys = Object.keys(s) as Resource[];
  if (!keys.length) return null;
  return `Short of ${keys.map((r) => `${fmt(s[r]!)} ${RESOURCE_LABEL[r].toLowerCase()}`).join(', ')}`;
}

/**
 * Pay a bill. Goods we lack are bought on the Exchange first, if the othes allow. Returns the share of the bill met
 * (1 = all of it). Houses without a treasury of their own in the simulation pay nothing and get 1.
 */
export function spend(w: World, houseId: string, b: Flow, label: string, kind: LedgerLine['kind'] = 'develop', opts: { partial?: boolean } = {}): number {
  const e = w.economy?.houses[houseId];
  if (!e) return 1;
  // Partial: pay only the share of the bill we can afford without going into debt, and say how much that was.
  if (opts.partial) {
    let k = 1;
    while (k > 0 && Object.keys(shortfall(w, houseId, times(b, k))).length) k = Math.round((k - 0.1) * 10) / 10;
    if (k <= 0) return 0;
    if (k < 1) return k * spend(w, houseId, times(b, k), label, kind);
  }
  let met = 1;
  for (const g of GOODS) {
    const need = b[g] ?? 0;
    if (need <= 0) continue;
    if (e.stock[g] < need) buyUpTo(w, houseId, g as Good, Math.ceil(need - Math.max(0, e.stock[g])));
    const paid = Math.max(0, Math.min(need, e.stock[g]));
    if (paid > 0) record(w, houseId, { resource: g, amount: -Math.round(paid * 10) / 10, label, kind });
    met = Math.min(met, paid / need);
  }
  if (b.othes) record(w, houseId, { resource: 'othes', amount: -b.othes, label, kind });
  return met;
}
