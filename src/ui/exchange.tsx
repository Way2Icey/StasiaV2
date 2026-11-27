// The regional Exchange: what we hold against what we need, the Steward's standing orders, trading now
// against the board, prices market by market, and orders by hand (selling elsewhere ships the goods ahead).
import { useState } from 'react';
import { Term } from './tip';
import { useGame, useWorld } from './context';
import { Panel } from './links';
import { econ, tradeInPlace } from '../sim/economy';
import { shocksOf } from '../sim/arcs_economy';
import { absoluteCycle, CYCLES_PER_ORBIT } from '../sim/time';
import {
  cancelOrder, ensureExchange, haul, homeRegion, localPrice, needWord, placeOrder, quote, regionName, regionsOf,
  reserveOf, setPolicy, useOf, type SellStance,
} from '../sim/exchange';
import { BASE_PRICE, GOODS, RESOURCE_LABEL, type Good } from '../data/economy';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const p2 = (n: number) => (n >= 100 ? Math.round(n).toString() : n.toFixed(1));
const STANCE: { k: SellStance; label: string; note: string }[] = [
  { k: 'hold', label: 'Hold', note: 'Sell nothing; keep it all in store.' },
  { k: 'fair', label: 'Fair', note: 'Put up the surplus at what last Phase\'s buyers paid; half of it at a time, all of it in a glut.' },
  { k: 'quick', label: 'Quick', note: 'Sell the whole surplus now, at whatever clears.' },
];

export function ExchangePanels() {
  const world = useWorld();
  const game = useGame();
  const P = world.playerHouseId;
  const e = econ(world, P);
  const ex = ensureExchange(world);
  const home = homeRegion(world, P);
  const regions = regionsOf(world);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<{ side: 'sell' | 'buy'; good: Good; qty: number; region: string; limit: string }>({ side: 'sell', good: 'metals', qty: 100, region: 'exchange', limit: '' });

  const now = (g: Good, qty: number) => {
    let err: string | null = null;
    game.update((w) => { const c = structuredClone(w); err = tradeInPlace(c, P, g, qty); return err ? w : c; });
    setError(err);
  };
  const act = (f: (w: typeof world) => typeof world) => {
    try { game.update(f); setError(null); } catch (x) { setError((x as Error).message); }
  };
  const mine = ex.orders.filter((o) => o.owner === P && !o.auto);
  const fills = ex.fills.filter((f) => f.seller === P || f.buyer === P).slice(0, 8);
  const limit = form.limit === '' ? localPrice(world, form.region, form.good) : Number(form.limit);

  return (
    <>
      <Panel className="span-12" title={<Term k="exchange">Our stores and the Steward</Term>} aside="What we hold against what we need · what to do with the rest">
          {error ? <p className="body error" style={{ margin: 0 }}>{error}</p> : null}
          <div className="table-wrap">
            <table className="list market">
              <thead><tr><th>Good</th><th style={{ textAlign: 'right' }}>In store</th><th style={{ textAlign: 'right' }}>Reserve</th><th>Stands</th><th><Term k="sellstance">Steward sells</Term></th><th>Steward buys</th><th>Sell now</th><th>Buy now</th></tr></thead>
              <tbody>
                {GOODS.map((g) => {
                  const pol = ex.policy[g];
                  const res = reserveOf(world, P, g);
                  const nw = needWord(world, P, g);
                  const spare = Math.max(0, Math.floor(e.stock[g] - res));
                  const qs = quote(world, P, g, -Math.max(1, Math.min(spare || 10, 100)));
                  const qb = quote(world, P, g, 10);
                  return (
                    <tr key={g}>
                      <td>{RESOURCE_LABEL[g]}<div className="muted" style={{ fontSize: 11 }}>uses {fmt(useOf(world, P, g))}/Phase</div></td>
                      <td className="mono" style={{ textAlign: 'right' }}>{fmt(e.stock[g])}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>
                        <input aria-label={`Reserve of ${RESOURCE_LABEL[g]}`} className="mono" style={{ width: 64, textAlign: 'right' }} type="number" min={0} value={pol.keep ?? res}
                          onChange={(ev) => act((w) => setPolicy(w, g, { keep: Math.max(0, Number(ev.target.value) || 0) }))} />
                        {pol.keep !== undefined ? <button type="button" className="btn small" title="Let the Steward reckon it" onClick={() => act((w) => setPolicy(w, g, { keep: undefined }))}>auto</button> : null}
                      </td>
                      <td><span className={nw.tone === 'bad' ? 'down' : nw.tone === 'up' ? 'up' : nw.tone === 'warn' ? 'warn' : 'muted'}>{nw.word}</span></td>
                      <td><span className="filters">{STANCE.map((s) => <button key={s.k} type="button" className="pill" title={s.note} aria-pressed={pol.sell === s.k} onClick={() => act((w) => setPolicy(w, g, { sell: s.k }))}>{s.label}</button>)}</span></td>
                      <td><span className="filters">{(['cover', 'off'] as const).map((b) => <button key={b} type="button" className="pill" title={b === 'cover' ? 'Buy what we lack, paying more the shorter we are' : 'Buy only by hand (a shortfall is still covered)'} aria-pressed={pol.buy === b} onClick={() => act((w) => setPolicy(w, g, { buy: b }))}>{b === 'cover' ? 'Cover' : 'By hand'}</button>)}</span></td>
                      <td>
                        <span className="trade">
                          {[10, 100].map((q) => <button key={q} type="button" className="btn small" disabled={e.stock[g] < q} onClick={() => now(g, -q)}>−{q}</button>)}
                          <button type="button" className="btn small" disabled={spare <= 0} title="Everything above the reserve" onClick={() => now(g, -spare)}>surplus</button>
                        </span>
                        <div className="muted mono" style={{ fontSize: 11 }}>{qs.done ? `≈${p2(qs.avg)} each` : 'no buyers'}</div>
                      </td>
                      <td>
                        <span className="trade">{[10, 100].map((q) => <button key={q} type="button" className="btn small" onClick={() => now(g, q)}>+{q}</button>)}</span>
                        <div className="muted mono" style={{ fontSize: 11 }}>{qb.done ? `≈${p2(qb.avg)} each` : 'no sellers'}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="body muted" style={{ margin: 0, fontSize: 11 }}>No one buys what they do not need. Each house bids by how short it is (a starving house pays up to two and a half times the usual price, a fed one only stocks up cheaply), and sellers come down to where the buyers are. Trading now takes the best bids and asks left on the board after the last Phase, less the haul down the lanes.</p>
        </Panel>

      <Panel className="span-12" scroll={460} title={<Term k="markets">Markets</Term>} aside="Price per unit · ▲▼ against the usual · short = buyers left wanting · glut = sellers left holding">
          <div className="table-wrap">
            <table className="list market">
              <thead><tr><th>Good</th>{regions.map((r) => <th key={r.id} style={{ textAlign: 'right' }}>{r.id === home ? <strong>{r.name} (ours)</strong> : r.name}</th>)}</tr></thead>
              <tbody>
                {GOODS.map((g) => (
                  <tr key={g}>
                    <td>{RESOURCE_LABEL[g]}<div className="muted mono" style={{ fontSize: 11 }}>usual {BASE_PRICE[g]}</div></td>
                    {regions.map((r) => {
                      const rg = r.goods[g];
                      const vs = rg.price / BASE_PRICE[g];
                      return (
                        <td key={r.id} className="mono" style={{ textAlign: 'right' }}>
                          <span className={vs > 1.1 ? 'up' : vs < 0.9 ? 'down' : undefined}>{p2(rg.price)}{vs > 1.1 ? ' ▲' : vs < 0.9 ? ' ▼' : ''}</span>
                          <div style={{ fontSize: 11 }}>{rg.unmet > 0 ? <span className="warn">short {fmt(rg.unmet)}</span> : null}{rg.unmet > 0 && rg.unsold > 0 ? ' · ' : null}{rg.unsold > 0 ? <span className="muted">glut {fmt(rg.unsold)}</span> : null}</div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="body muted" style={{ margin: 0, fontSize: 11 }}>Each capital is a market for its own house's needs; the Exchange Docks carry the rest of the Archon, and the Outer Reach buys fuel and food dear and sells ore cheap. Hauling between them costs freight (two and a half times as much to or from a house at open war). Underneath it all the Imperial Exchange buys at {Math.round(0.38 * 100)}% of the usual price and sells at 190%, in limited amounts each Phase.</p>
        </Panel>

      <Panel className="span-12" fold="open" title={'Orders by hand'} aside="They stand until filled or cancelled, and fill at each Phase's clearing">
          <div className="body" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="filters">{(['sell', 'buy'] as const).map((s) => <button key={s} type="button" className="pill" aria-pressed={form.side === s} onClick={() => setForm({ ...form, side: s })}>{s === 'sell' ? 'Sell' : 'Buy'}</button>)}</span>
            <input aria-label="Quantity" className="mono" type="number" min={1} style={{ width: 80 }} value={form.qty} onChange={(ev) => setForm({ ...form, qty: Number(ev.target.value) })} />
            <select aria-label="Good" value={form.good} onChange={(ev) => setForm({ ...form, good: ev.target.value as Good, limit: '' })}>{GOODS.map((g) => <option key={g} value={g}>{RESOURCE_LABEL[g]}</option>)}</select>
            <span>at</span>
            <select aria-label="Market" value={form.region} onChange={(ev) => setForm({ ...form, region: ev.target.value, limit: '' })}>{regions.map((r) => <option key={r.id} value={r.id}>{r.name}{r.id === home ? ' (ours)' : ''}</option>)}</select>
            <span>{form.side === 'sell' ? 'for no less than' : 'for no more than'}</span>
            <input aria-label="Price per unit" className="mono" type="number" min={0.01} step={0.1} style={{ width: 80 }} value={form.limit === '' ? p2(limit) : form.limit} onChange={(ev) => setForm({ ...form, limit: ev.target.value })} />
            <span className="muted">each</span>
            <button type="button" className="btn primary small" onClick={() => act((w) => placeOrder(w, { side: form.side, good: form.good, qty: form.qty, region: form.region, limit }))}>Place order</button>
          </div>
          <p className="body muted" style={{ margin: 0, fontSize: 12 }}>
            {form.region === home ? 'Our own market: the goods stay in store until they sell.'
              : form.side === 'sell' ? `Goods to sell at ${regionName(world, form.region)} are shipped there now and wait on the market; the lanes may take them on the way. Buyers there pay the haul to their own door, so the closer the market, the better we do.`
              : `Bought at ${regionName(world, form.region)}, the goods ship home: ${p2(haul(world, form.good, form.region, home))} a unit in freight on top.`}
          </p>
          {mine.length ? (
            <div className="table-wrap">
              <table className="list">
                <thead><tr><th>Order</th><th>Market</th><th style={{ textAlign: 'right' }}>Limit</th><th style={{ textAlign: 'right' }}>Filled</th><th style={{ textAlign: 'right' }}>Left</th><th /></tr></thead>
                <tbody>
                  {mine.map((o) => (
                    <tr key={o.id}>
                      <td>{o.side === 'sell' ? 'Sell' : 'Buy'} {RESOURCE_LABEL[o.good].toLowerCase()}{o.inTransit ? <span className="muted"> · on the lanes</span> : null}</td>
                      <td>{regionName(world, o.region)}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{p2(o.limit)}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{fmt(o.filled)}{o.filled ? <span className="muted"> · {fmt(o.value)}</span> : null}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{fmt(o.qty)}</td>
                      <td><button type="button" className="btn small" onClick={() => act((w) => cancelOrder(w, o.id))}>Cancel</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="body muted" style={{ margin: 0, fontSize: 12 }}>No orders standing. The Steward's own orders are set again each Phase from the stances above.</p>}
          {fills.length ? (
            <>
              <div className="row"><span className="eyebrow">Our last trades</span></div>
              <div className="table-wrap">
                <table className="list">
                  <tbody>
                    {fills.map((f, i) => (
                      <tr key={i}>
                        <td>{f.seller === P ? 'Sold' : 'Bought'} {fmt(f.qty)} {RESOURCE_LABEL[f.good].toLowerCase()}</td>
                        <td className="muted">{f.seller === P ? `to ${who(world, f.buyer)} at ${regionName(world, f.to)}` : `from ${who(world, f.seller)} at ${regionName(world, f.from)}`}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{p2(f.price)} each</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </Panel>
    </>
  );
}

function who(world: ReturnType<typeof useWorld>, id: string): string {
  if (id === 'archon') return 'buyers from across the Archon';
  if (id === 'frontier') return 'frontier buyers';
  if (id === 'free') return 'free traders';
  if (id === 'floor') return 'the Imperial Exchange (its floor)';
  if (id === 'ceiling') return 'the Imperial Exchange (its reserve)';
  return `House ${world.houses[id]?.name ?? id}`;
}

/** The Exchange as its own page: our stores and the Steward, the markets, orders by hand, and the news. */
export function ExchangePage({ bare }: { bare?: boolean } = {}) {
  const world = useWorld();
  return (
    <>
      {bare ? null : (
      <div className="page-title">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h2>The Exchange</h2>
          <p>What we hold against what we need, what the Steward does with the rest, and what every market will pay. Prices clear at each Phase.</p>
        </div>
      </div>
      )}
      <div className="grid">
        <ExchangePanels />
        <Panel fold="open" scroll={300} title="News on the Exchange" className="span-12">
          {(() => {
            const now = absoluteCycle(world.date);
            const live = shocksOf(world).filter((x) => x.until > now);
            const crash = world.economy.crash && world.economy.crash.stage < 3;
            return live.length || crash ? (
              <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12 }}>
                {crash ? <strong className="down">The Exchange is in a crash. Creditors are calling in loans; prices will climb back when it finds its floor.</strong> : null}
                {live.filter((x) => x.cause !== 'the crash' && x.cause !== 'the crash, deepening').map((x, i) => (
                  <span key={i}><strong className={x.mult > 1 ? 'up' : 'down'}>{RESOURCE_LABEL[x.good]} {x.mult > 1 ? '▲' : '▼'}</strong> on {x.cause}: {x.mult > 1 ? 'the far worlds want more and have less to sell' : 'the far worlds want less and have more to sell'} for about {Math.max(1, Math.round((x.until - now) / CYCLES_PER_ORBIT))} Orbit{Math.round((x.until - now) / CYCLES_PER_ORBIT) === 1 ? '' : 's'} more.</span>
                ))}
              </div>
            ) : <p className="body muted" style={{ margin: 0, fontSize: 12 }}>Nothing out of the ordinary.</p>;
          })()}
          <p className="body muted" style={{ margin: 0, fontSize: 11 }}>News out in the Archon moves what the world beyond the houses wants and has to sell: a shortage there is a seller's market here.</p>
        </Panel>
      </div>
    </>
  );
}
