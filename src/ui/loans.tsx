// Debts and loans: what we owe, what we are owed, who is asking.
import { useState } from 'react';
import { useGame, useWorld } from './context';
import { HouseLink, Panel } from './links';
import { Term } from './tip';
import {
  answerAsk, borrow, canLend, COLLATERAL_LABEL, COLLATERAL_NOTE, creditworthiness, instalment, loansOf, quoteFor, repay, setAutopay, settleDefault,
} from '../sim/loans';
import { econ } from '../sim/economy';
import { formatDate } from '../sim/time';
import type { World } from '../sim/types';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const pctP = (r: number) => `${(r * 100).toFixed(1)}%/Phase`;

export function LoansPanel({ className }: { className?: string }) {
  const world = useWorld();
  const game = useGame();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: (w: World) => World) => game.update((w) => { try { setErr(null); return fn(w); } catch (e) { setErr((e as Error).message); return w; } });
  const P = world.playerHouseId;
  const all = loansOf(world, P);
  const owe = all.filter((l) => l.borrower === P);
  const owed = all.filter((l) => l.lender === P);
  const asks = (world.loans?.asks ?? []).filter((a) => a.to === P);
  const othes = econ(world, P).stock.othes;
  const [lender, setLender] = useState('');
  const [amount, setAmount] = useState(10000);
  const [orbits, setOrbits] = useState(3);
  const others = Object.values(world.houses).filter((h) => h.id !== P);
  const quote = lender ? quoteFor(world, lender, amount, orbits) : null;
  return (
    <Panel title={<Term k="loan">Debts &amp; loans</Term>} aside={`we owe ${fmt(owe.reduce((n, l) => n + l.owed, 0))} · owed to us ${fmt(owed.reduce((n, l) => n + l.owed, 0))}`} className={className}>
      <p className="body muted" style={{ margin: 0 }}>Only houses lend. A debt keeps the debtor civil: their regard for the lender cannot sink below −20 while it runs. Default costs honour, and the lender may take what was put up.</p>
      {asks.map((a) => (
        <div key={a.id} className="row petition" style={{ flexWrap: 'wrap' }}>
          <span style={{ flex: '1 1 300px' }}>
            <HouseLink id={a.from} /> asks for <b>{fmt(a.amount)}</b> othes{a.reason ? `, ${a.reason}` : ''}.
            <span className="muted" style={{ fontSize: 12 }}> {pctP(a.rate)} over {a.orbits} Orbits · security: {COLLATERAL_LABEL[a.collateral.kind].toLowerCase()}{a.collateral.label ? ` (${a.collateral.label})` : ''} · their credit {Math.round(creditworthiness(world, a.from, P) * 100)}/100 · answer by {formatDate(a.expires)}</span>
          </span>
          <span style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="btn small primary" disabled={othes < a.amount} onClick={() => run((w) => answerAsk(w, a.id, true))}>Lend</button>
            <button type="button" className="btn small" onClick={() => run((w) => answerAsk(w, a.id, false))}>Refuse</button>
          </span>
        </div>
      ))}
      <div className="table-wrap">
        {all.length ? (
          <table className="ctable">
            <thead><tr><th /><th>HOUSE</th><th>LENT</th><th>OWED NOW</th><th>RATE</th><th>DUE</th><th>SECURITY</th><th /></tr></thead>
            <tbody>
              {all.map((l) => {
                const weOwe = l.borrower === P;
                return (
                  <tr key={l.id}>
                    <td>{weOwe ? 'WE OWE' : 'OWED US'}{l.overdue ? ' · OVERDUE' : ''}</td>
                    <td><HouseLink id={weOwe ? l.lender : l.borrower} /></td>
                    <td className="mono">{fmt(l.principal)}</td>
                    <td className="mono">{fmt(l.owed)}</td>
                    <td className="mono">{pctP(l.rate)}</td>
                    <td className="muted">{formatDate(l.due)}{l.missed ? ` · ${l.missed} missed` : ''}</td>
                    <td className="muted" title={COLLATERAL_NOTE[l.collateral.kind]}>{COLLATERAL_LABEL[l.collateral.kind]}{l.collateral.label ? ` · ${l.collateral.label}` : ''}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {weOwe ? (
                        <>
                          <button type="button" className="btn small" disabled={othes < 1} onClick={() => run((w) => repay(w, l.id, instalment(w, l)))}>Pay {fmt(instalment(world, l))}</button>{' '}
                          <button type="button" className="btn small" disabled={othes < l.owed} onClick={() => run((w) => repay(w, l.id, l.owed))}>Clear</button>{' '}
                          <button type="button" className="btn small" aria-pressed={l.autopay !== false} onClick={() => run((w) => setAutopay(w, l.id, l.autopay === false))}>Autopay {l.autopay === false ? 'off' : 'on'}</button>
                        </>
                      ) : l.overdue ? (
                        <>
                          <button type="button" className="btn small primary" onClick={() => run((w) => settleDefault(w, l.id, 'seize'))}>Seize</button>{' '}
                          <button type="button" className="btn small" onClick={() => run((w) => settleDefault(w, l.id, 'extend'))}>More time</button>{' '}
                          <button type="button" className="btn small" onClick={() => run((w) => settleDefault(w, l.id, 'forgive'))}>Forgive</button>
                        </>
                      ) : <span className="muted">paying</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <p className="body muted" style={{ margin: 0 }}>No debts either way.</p>}
      </div>
      <div className="body" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid var(--line)' }}>
        <span className="eyebrow">Borrow</span>
        <select className="select" aria-label="From which house" value={lender} onChange={(e) => setLender(e.target.value)}>
          <option value="">From…</option>
          {others.map((h) => <option key={h.id} value={h.id}>House {h.name} · can spare ~{fmt(Math.round(canLend(world, h.id) / 1000) * 1000)}</option>)}
        </select>
        <select className="select" aria-label="How much" value={amount} onChange={(e) => setAmount(Number(e.target.value))}>
          {[5000, 10000, 20000, 40000].map((n) => <option key={n} value={n}>{fmt(n)} othes</option>)}
        </select>
        <select className="select" aria-label="Over how long" value={orbits} onChange={(e) => setOrbits(Number(e.target.value))}>
          {[2, 3, 5, 8].map((n) => <option key={n} value={n}>{n} Orbits</option>)}
        </select>
        {quote ? ('no' in quote ? <span className="muted">{quote.no}</span> : (
          <>
            <span className="muted">They offer {pctP(quote.rate)}, security: {COLLATERAL_LABEL[quote.collateral.kind].toLowerCase()}{quote.collateral.label ? ` (${quote.collateral.label})` : ''}.</span>
            <button type="button" className="btn small primary" onClick={() => run((w) => borrow(w, lender, amount, orbits))}>Take it</button>
          </>
        )) : null}
      </div>
      {err ? <p className="error body" style={{ margin: 0 }}>{err}</p> : null}
    </Panel>
  );
}
