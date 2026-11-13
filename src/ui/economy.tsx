import { useState } from 'react';
import { QuarterTerm, Term } from './tip';
import {
  buyPrice, computingOf, credibilityMarkup, econ, netPerPhase, phaseLedger, quotaFor, sellPrice, setTax, tradeInPlace,
} from '../sim/economy';
import { addCycles, dateParts, formatDate, CYCLES_PER_ORBIT, CYCLES_PER_PHASE } from '../sim/time';
import { GOODS, RESOURCE_LABEL, RESOURCE_NOTE, RESOURCES, TAX, type Good, type Resource, type TaxRate } from '../data/economy';
import type { LedgerLine, World } from '../sim/types';
import { useGame, useWorld } from './context';
import { Panel, PersonById, SectorLink } from './links';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '0');

function nextSettlement(world: World) {
  const p = dateParts(world.date);
  const phaseLeft = CYCLES_PER_PHASE - p.cycleOfPhase + 1;
  const orbitLeft = CYCLES_PER_ORBIT - p.cycleOfOrbit + 1;
  return { phase: addCycles(world.date, phaseLeft), phaseLeft, orbit: addCycles(world.date, orbitLeft) };
}

export function EconomyPage() {
  const world = useWorld();
  const game = useGame();
  const house = world.playerHouseId;
  const e = econ(world, house);
  const lines = phaseLedger(world, house);
  const net = netPerPhase(lines);
  const [sel, setSel] = useState<Resource>('othes');
  const [error, setError] = useState<string | null>(null);
  const next = nextSettlement(world);
  const computing = computingOf(world, house);
  const markup = credibilityMarkup(world, house);

  const doTrade = (g: Good, qty: number) => {
    let err: string | null = null;
    game.update((w) => {
      const copy = structuredClone(w);
      err = tradeInPlace(copy, house, g, qty);
      return err ? w : copy;
    });
    setError(err);
  };

  const shown = lines.filter((l) => l.resource === sel).sort((a, b) => b.amount - a.amount);
  const recent = e.recent.filter((l) => l.resource === sel);

  return (
    <>
      <div className="page-title">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h2>Economy</h2>
          <p>Standing flows settle at the start of each Phase: next on {formatDate(next.phase)}, in {next.phaseLeft} {next.phaseLeft === 1 ? "cycle" : "cycles"}. Trades, missions and ransoms settle at once.</p>
        </div>
      </div>

      <div className="stocks">
        {RESOURCES.map((r) => (
          <button key={r} type="button" className="stock" aria-pressed={sel === r} onClick={() => setSel(r)}>
            <span className="eyebrow"><Term k={r}>{RESOURCE_LABEL[r]}</Term></span>
            <strong className={`mono${e.stock[r] < 0 ? ' error' : ''}`}>{fmt(e.stock[r])}</strong>
            <span className={`mono small ${net[r] > 0 ? 'up' : net[r] < 0 ? 'down' : 'muted'}`}>{signed(net[r])} / Phase</span>
          </button>
        ))}
        <div className="stock static">
          <span className="eyebrow"><Term k="computing">Computing</Term></span>
          <strong className="mono">{fmt(computing.total)}</strong>
          <span className="mono small muted">per Orbit · unassigned</span>
        </div>
      </div>

      <div className="grid">
        <Panel title={<Term k="ledger">{`${RESOURCE_LABEL[sel]} ledger`}</Term>} aside="Per Phase, at today's rates" className="span-8">
          <p className="body muted" style={{ margin: 0, fontSize: 12 }}>{RESOURCE_NOTE[sel]}</p>
          <div className="table-wrap">
            <table className="list">
              <thead><tr><th>Source or use</th><th>Where</th><th><Term k="overseer">Run by</Term></th><th style={{ textAlign: 'right' }}>Per Phase</th></tr></thead>
              <tbody>
                {shown.length === 0 ? <tr><td colSpan={4} className="muted">Nothing comes in or goes out on a regular basis.</td></tr> : null}
                {shown.map((l, i) => <LedgerRow key={i} l={l} />)}
              </tbody>
              {shown.length ? (
                <tfoot><tr><td colSpan={3}><strong>Net</strong></td><td className={`mono ${net[sel] >= 0 ? 'up' : 'down'}`} style={{ textAlign: 'right' }}><strong>{signed(net[sel])}</strong></td></tr></tfoot>
              ) : null}
            </table>
          </div>
          {recent.length ? (
            <>
              <div className="row"><span className="eyebrow">This Phase so far</span></div>
              <div className="table-wrap">
                <table className="list">
                  <tbody>
                    {recent.map((l, i) => (
                      <tr key={i}><td className="mono muted">{formatDate(l.date)}</td><td>{l.label}</td><td className={`mono ${l.amount >= 0 ? 'up' : 'down'}`} style={{ textAlign: 'right' }}>{signed(l.amount)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </Panel>

        <div className="span-4 stack">
          <Panel title={<Term k="taxes">Taxes</Term>}>
            <div className="body" style={{ display: 'grid', gap: 8 }}>
              <div className="filters">
                {(Object.keys(TAX) as TaxRate[]).map((t) => (
                  <button key={t} type="button" className="pill" aria-pressed={e.tax === t} onClick={() => game.update((w) => setTax(w, house, t))}>{TAX[t].label}</button>
                ))}
              </div>
              <span className="muted" style={{ fontSize: 12 }}>{TAX[e.tax].note}</span>
            </div>
          </Panel>
          <Panel title={<Term k="quota">Navisium quota</Term>} aside={<>From the <Term k="numarade">Numarade</Term></>}>
            <div className="body">
              <dl className="kv">
                <dt>This Orbit</dt><dd className="mono">{fmt(e.quota)} units</dd>
                <dt>Next grant</dt><dd>{formatDate(next.orbit)} · about {fmt(quotaFor(world, house))}</dd>
              </dl>
              <p className="muted" style={{ fontSize: 11, margin: '8px 0 0' }}>The Numarade sizes each house's share by its standing: more respect, more Navisium.</p>
            </div>
          </Panel>
          <Panel title={<Term k="credit">Our credit</Term>}>
            <div className="body">
              <span style={{ fontSize: 13 }}>
                Honour {world.houses[house]!.standing.honour}: we buy at{' '}
                <strong className={markup > 0 ? 'down' : 'up'}>{markup === 0 ? 'the going price' : markup > 0 ? `+${Math.round(markup * 100)}%` : `${Math.round(markup * 100)}%`}</strong>.
              </span>
              <p className="muted" style={{ fontSize: 11, margin: '6px 0 0' }}>Othes are a promise. Break your word and every seller charges more; going into debt costs honour each Phase.</p>
            </div>
          </Panel>
        </div>

        <Panel title={<Term k="exchange">Imperial Exchange</Term>} aside="Prices in othes · last 12 Phases" className="span-12">
          {error ? <p className="body error" style={{ margin: 0 }}>{error}</p> : null}
          <div className="table-wrap">
            <table className="list market">
              <thead><tr><th>Good</th><th style={{ textAlign: 'right' }}>In store</th><th>Trend</th><th style={{ textAlign: 'right' }}>We buy at</th><th style={{ textAlign: 'right' }}>We sell at</th><th>Buy</th><th>Sell</th></tr></thead>
              <tbody>
                {GOODS.map((g) => {
                  const m = world.economy.market[g];
                  return (
                    <tr key={g}>
                      <td>{RESOURCE_LABEL[g]}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{fmt(e.stock[g])}</td>
                      <td><Spark values={m.history} /></td>
                      <td className="mono" style={{ textAlign: 'right' }}>{buyPrice(world, house, g).toFixed(1)}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{sellPrice(world, g).toFixed(1)}</td>
                      <td><span className="trade">{[10, 100].map((q) => <button key={q} type="button" className="btn small" onClick={() => doTrade(g, q)}>+{q}</button>)}</span></td>
                      <td><span className="trade">{[10, 100].map((q) => <button key={q} type="button" className="btn small" disabled={e.stock[g] < q} onClick={() => doTrade(g, -q)}>−{q}</button>)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="body muted" style={{ margin: 0, fontSize: 11 }}>Every house trades here. What they buy and sell moves prices each Phase; prices drift back toward the usual level over time.</p>
        </Panel>
      </div>
    </>
  );
}

function LedgerRow({ l }: { l: LedgerLine }) {
  return (
    <tr className={l.kind === 'skim' ? 'skim' : undefined}>
      <td>{l.kind === 'skim' ? <Term k="skim">{l.label}</Term> : l.kind === 'stipend' ? <Term k="stipend">{l.label}</Term> : l.kind === 'quarter' && l.quarterId ? <QuarterTerm name={l.label} /> : l.label}{l.kind === 'skim' && !l.characterId ? <span className="muted" style={{ fontSize: 11 }}> · cause unknown; an audit may find it</span> : null}</td>
      <td>{l.sectorId ? <SectorLink id={l.sectorId} /> : <span className="muted">—</span>}</td>
      <td>{l.characterId ? <PersonById id={l.characterId} /> : <span className="muted">—</span>}</td>
      <td className={`mono ${l.amount >= 0 ? 'up' : 'down'}`} style={{ textAlign: 'right' }}>{signed(l.amount)}</td>
    </tr>
  );
}

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="muted">—</span>;
  const w = 90;
  const h = 22;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 2 - ((v - lo) / span) * (h - 4)}`).join(' ');
  const up = values[values.length - 1]! >= values[0]!;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`From ${values[0]!.toFixed(1)} to ${values[values.length - 1]!.toFixed(1)}`}>
      <polyline points={pts} fill="none" stroke={up ? 'var(--orange)' : 'var(--green)'} strokeWidth="1.5" />
    </svg>
  );
}

/** One line for the top bar: othes in the coffers. */
export function Coffers() {
  const world = useWorld();
  const e = world.economy?.houses[world.playerHouseId];
  if (!e) return null;
  return <span className={`coffers mono${e.stock.othes < 0 ? ' error' : ''}`} title="Othes in the coffers">{fmt(e.stock.othes)} othes</span>;
}
