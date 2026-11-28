// The house's stores: how long each lasts at today's rates, what draws on it, and what a war would add.
// Shown in full on the Economy page and as a strip in the Hall.
import { econ, mixOf, netPerPhase, phaseLedger, quotaFor } from '../sim/economy';
import { CYCLES_PER_ORBIT, CYCLES_PER_PHASE } from '../sim/time';
import { GOODS, RESOURCE_LABEL, RESOURCES, SOLDIERS_PER_PROVISION, REALLOY_SOLDIERS_PER_NAVISIUM, TROOP_FUEL_PER_LANE, type Resource } from '../data/economy';
import type { LedgerLine, World } from '../sim/types';
import { useWorld } from './context';
import { Go, Panel } from './links';
import { Term } from './tip';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '0');

/** Which part of the house a ledger line belongs to. */
const SYSTEM: Partial<Record<LedgerLine['kind'], string>> = {
  quarter: 'Holdings', tax: 'Taxes', court: 'Court business', boon: 'Boons', food: 'Feeding the people', forces: 'Forces at home',
  war: 'War', stipend: 'Court, council and knights', skim: 'Losses to theft', quota: 'The Numarade', develop: 'Building', mission: 'Passages and missions',
};

/** Net per Phase, with the Numarade's navisium quota (paid each Orbit) spread across the Orbit's Phases. */
export function netWithQuota(w: World, houseId: string): Record<Resource, number> {
  const net = netPerPhase(phaseLedger(w, houseId));
  net.navisium += quotaFor(w, houseId) / (CYCLES_PER_ORBIT / CYCLES_PER_PHASE);
  return net;
}

/** Phases a store lasts at its net rate: Infinity when it is not falling. */
export function runway(stock: number, net: number): number {
  return net >= 0 ? Infinity : Math.max(0, stock / -net);
}
const runwayText = (r: number) => (r === Infinity ? 'holding' : r < 1 ? 'under a Phase' : `${Math.floor(r)} Phase${Math.floor(r) === 1 ? '' : 's'}`);
const runwayClass = (r: number) => (r === Infinity ? 'up' : r < 3 ? 'down' : r < 8 ? '' : 'muted');

/** What a war would add each Phase, roughly: the field army eating field rations and re-alloying its arms, its
 *  troopships and the fleet crossing about four lanes. */
export function warEstimate(w: World, houseId: string): Partial<Record<Resource, number>> {
  const field = Object.values(w.war?.formations ?? {}).filter((f) => f.houseId === houseId && f.kind !== 'fleet').reduce((n, f) => n + f.strength, 0);
  const hulls = Object.values(w.war?.formations ?? {}).filter((f) => f.houseId === houseId && f.kind === 'fleet').reduce((n, f) => n + f.strength, 0);
  return {
    provisions: -Math.round(field / SOLDIERS_PER_PROVISION.field - field / SOLDIERS_PER_PROVISION.home),
    fuel: -Math.round(4 * (mixOf(hulls).fuel + (field / 1000) * TROOP_FUEL_PER_LANE)),
    navisium: -Math.round(field / REALLOY_SOLDIERS_PER_NAVISIUM),
  };
}

export function StoresPanel({ className }: { className?: string }) {
  const world = useWorld();
  const P = world.playerHouseId;
  const e = econ(world, P);
  const lines = phaseLedger(world, P);
  const net = netWithQuota(world, P);
  const war = warEstimate(world, P);
  const draws = (r: Resource) => {
    const by = new Map<string, number>();
    for (const l of lines) if (l.resource === r && l.amount < 0) by.set(SYSTEM[l.kind] ?? 'Other', (by.get(SYSTEM[l.kind] ?? 'Other') ?? 0) + l.amount);
    return [...by.entries()].sort((a, b) => a[1] - b[1]).slice(0, 3);
  };
  return (
    <Panel title="What our stores carry" aside="per Phase, at today's rates" className={className}>
      <div className="table-wrap">
        <table className="list">
          <thead><tr><th>Store</th><th style={{ textAlign: 'right' }}>Held</th><th style={{ textAlign: 'right' }}>Net</th><th>Lasts</th><th>What draws on it</th><th style={{ textAlign: 'right' }}>A war would add</th></tr></thead>
          <tbody>
            {RESOURCES.map((r) => {
              const rw = runway(e.stock[r], net[r]);
              const atWar = runway(e.stock[r], net[r] + (war[r] ?? 0));
              return (
                <tr key={r}>
                  <td><Term k={r}>{RESOURCE_LABEL[r]}</Term></td>
                  <td className="mono" style={{ textAlign: 'right' }}>{fmt(e.stock[r])}</td>
                  <td className={`mono ${net[r] > 0 ? 'up' : net[r] < 0 ? 'down' : 'muted'}`} style={{ textAlign: 'right' }}>{signed(net[r])}</td>
                  <td className={runwayClass(rw)}>{runwayText(rw)}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{draws(r).map(([k, v]) => `${k} ${signed(v)}`).join(' · ') || '—'}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{war[r] ? <span className="down">{signed(war[r]!)}<span className="muted"> · lasts {runwayText(atWar)}</span></span> : <span className="muted">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="body muted" style={{ margin: 0, fontSize: 12 }}>
        Soldiers eat at home and twice as much in the field; ships burn fuel for every lane and a little on station; every fight wears out components and a little navisium. What the house lacks, the Steward buys on the Exchange while the othes last. See <Go to={{ kind: 'war' }}>War ›</Go> for what a war is costing now.
      </p>
    </Panel>
  );
}

/** A strip for the Hall: each store and how long it lasts. */
export function StoresStrip() {
  const world = useWorld();
  const P = world.playerHouseId;
  const e = econ(world, P);
  const net = netWithQuota(world, P);
  const low = GOODS.filter((g) => runway(e.stock[g], net[g]) < 3);
  return (
    <section className="panel stores-strip" aria-label="Our stores">
      {RESOURCES.map((r) => {
        const rw = runway(e.stock[r], net[r]);
        return (
          <Go key={r} to={{ kind: 'economy' }} className={`stores-cell${rw < 3 ? ' low' : ''}`}>
            <span className="eyebrow">{RESOURCE_LABEL[r]}</span>
            <b className="mono">{fmt(e.stock[r])}</b>
            <span className={`mono small ${net[r] > 0 ? 'up' : net[r] < 0 ? 'down' : 'muted'}`}>{signed(net[r])} · {runwayText(rw)}</span>
          </Go>
        );
      })}
      {low.length ? <span className="stores-warn down">Running low: {low.map((g) => RESOURCE_LABEL[g].toLowerCase()).join(', ')}</span> : null}
    </section>
  );
}
