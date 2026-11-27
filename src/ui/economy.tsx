import { useState } from 'react';
import { QuarterTerm, Term } from './tip';
import {
  computingOf, credibilityMarkup, econ, lavishness, LAVISH_FROM, netPerPhase, phaseLedger, quotaFor, setTax,
} from '../sim/economy';
import { delta, orbitAgo } from '../sim/since';
import { modulesOf } from '../sim/holdings';
import { addCycles, dateParts, formatDate, CYCLES_PER_ORBIT, CYCLES_PER_PHASE } from '../sim/time';
import { RESOURCE_LABEL, RESOURCE_NOTE, RESOURCES, TAX, type Resource, type TaxRate } from '../data/economy';
import type { LedgerLine, World } from '../sim/types';
import { useGame, useWorld } from './context';
import { Go, Panel, PersonById, SectorLink } from './links';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const BLOCKS = '▁▂▃▄▅▆▇█';
/** A small trend line. */
const spark = (xs: number[]) => { const lo = Math.min(...xs), hi = Math.max(...xs); return xs.map((x) => BLOCKS[hi === lo ? 3 : Math.round(((x - lo) / (hi - lo)) * 7)]).join(''); };
const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '0');

function nextSettlement(world: World) {
  const p = dateParts(world.date);
  const phaseLeft = CYCLES_PER_PHASE - p.cycleOfPhase + 1;
  const orbitLeft = CYCLES_PER_ORBIT - p.cycleOfOrbit + 1;
  return { phase: addCycles(world.date, phaseLeft), phaseLeft, orbit: addCycles(world.date, orbitLeft) };
}

export function EconomyPage({ bare }: { bare?: boolean } = {}) {
  const world = useWorld();
  const game = useGame();
  const house = world.playerHouseId;
  const e = econ(world, house);
  const lines = phaseLedger(world, house);
  const net = netPerPhase(lines);
  const [sel, setSel] = useState<Resource>('othes');
  const next = nextSettlement(world);
  const computing = computingOf(world, house);
  const markup = credibilityMarkup(world, house);


  const hist = (world.since ?? []).map((x) => x.othes);
  const trend = hist.length >= 2 ? spark([...hist, Math.round(e.stock.othes)]) : '';
  const ago = orbitAgo(world);
  const since = ago ? delta(e.stock.othes, ago.othes) : '';
  const lavish = lavishness(e.stock.othes);
  const vault = modulesOf(world, house, 'vault')[0];
  const shown = lines.filter((l) => l.resource === sel).sort((a, b) => b.amount - a.amount);
  const recent = e.recent.filter((l) => l.resource === sel);

  return (
    <>
      {bare ? null : (
      <div className="page-title">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h2>Ledger &amp; exchange</h2>
          <p>Standing flows settle at the start of each Phase: next on {formatDate(next.phase)}, in {next.phaseLeft} {next.phaseLeft === 1 ? "cycle" : "cycles"}. Trades, missions and ransoms settle at once.</p>
        </div>
      </div>
      )}

      <div className="stocks">
        {RESOURCES.map((r) => (
          <button key={r} type="button" className="stock" aria-pressed={sel === r} onClick={() => setSel(r)}>
            <span className="eyebrow"><Term k={r}>{RESOURCE_LABEL[r]}</Term></span>
            <strong className={`mono${e.stock[r] < 0 ? ' error' : ''}`}>{fmt(e.stock[r])}</strong>
            <span className={`mono small ${net[r] > 0 ? 'up' : net[r] < 0 ? 'down' : 'muted'}`}>{signed(net[r])} / Phase</span>
            {r === 'othes' && trend ? <span className="mono small muted" title="Othes in the coffers, each of the last Phases"><span className="spark">{trend}</span> {since ? <span className={since.startsWith('+') ? 'up' : 'down'}>{since} since last Orbit</span> : null}</span> : null}
          </button>
        ))}
        <div className="stock static">
          <span className="eyebrow"><Term k="computing">Computing</Term></span>
          <strong className="mono">{fmt(computing.total)}</strong>
          <span className="mono small muted">per Orbit · unassigned</span>
        </div>
      </div>

      <div className="grid">
        <Panel scroll={520} title={<Term k="ledger">{`${RESOURCE_LABEL[sel]} ledger`}</Term>} aside="Per Phase, at today's rates" className="span-8">
          <p className="body muted" style={{ margin: 0, fontSize: 12 }}>{RESOURCE_NOTE[sel]}{sel === 'othes' ? ' What the Steward sells at the Exchange comes on top, less its dues.' : ''}</p>
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
          {lavish ? (
            <Panel title="Full coffers" className="lead">
              <div className="body" style={{ display: 'grid', gap: 8 }}>
                <span style={{ fontSize: 13 }}>Above {fmt(LAVISH_FROM)} othes the court lives by the coffers: {fmt(lavish)} a Phase goes on kin, gifts and the household. Othes on ledger drives are not spent this way.</span>
                <span className="actions">
                  {vault ? <Go to={{ kind: 'vaults' }} className="btn small lead">Put it on drives ›</Go> : <Go to={{ kind: 'build', what: 'vault' }} className="btn small lead">Build a vault ›</Go>}
                  <Go to={{ kind: 'frontier' }} className="btn small">Claim on the frontier ›</Go>
                  <Go to={{ kind: 'spend' }} className="btn small">Great works ›</Go>
                </span>
              </div>
            </Panel>
          ) : null}
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

        <Panel title="The Exchange" className="span-12"><p className="body" style={{ margin: 0 }}>Our stores, the Steward's orders, the markets and news: <Go to={{ kind: 'exchange' }}>Treasury › The Exchange ›</Go></p></Panel>
        <Panel scroll={360} title="Loans" className="span-12"><p className="body" style={{ margin: 0 }}>Lending and borrowing between houses: <Go to={{ kind: 'loans' }}>Treasury › Loans ›</Go></p></Panel>
      </div>
    </>
  );
}

function LedgerRow({ l }: { l: LedgerLine }) {
  return (
    <tr className={l.kind === 'skim' ? 'skim' : undefined}>
      <td>{l.kind === 'skim' ? <Term k="skim">{l.label}</Term> : l.kind === 'stipend' ? <Term k="stipend">{l.label}</Term> : l.kind === 'quarter' && l.quarterId ? <QuarterTerm name={l.label} /> : l.kind === 'boon' ? <Term k="boon">{l.label}</Term> : l.kind === 'forces' || l.kind === 'war' ? <Term k="warcost">{l.label}</Term> : l.label}{l.kind === 'skim' && !l.characterId ? <span className="muted" style={{ fontSize: 11 }}> · cause unknown; an audit may find it</span> : null}</td>
      <td>{l.sectorId ? <SectorLink id={l.sectorId} /> : <span className="muted">—</span>}</td>
      <td>{l.characterId ? <PersonById id={l.characterId} /> : <span className="muted">—</span>}</td>
      <td className={`mono ${l.amount >= 0 ? 'up' : 'down'}`} style={{ textAlign: 'right' }}>{signed(l.amount)}</td>
    </tr>
  );
}


/** One line for the top bar: othes in the coffers. */
export function Coffers() {
  const world = useWorld();
  const e = world.economy?.houses[world.playerHouseId];
  if (!e) return null;
  return <span className={`coffers mono${e.stock.othes < 0 ? ' error' : ''}`} title="Othes in the coffers">{fmt(e.stock.othes)} othes</span>;
}
