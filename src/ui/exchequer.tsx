// The Treasury on one screen: the Exchange ticker, the flow of othes through the coffers with its two banks
// set out as plain lists, the goods as cards with their price trend and the Steward's standing order, and the
// rest (vaults, loans, great works, taxes and pay, orders, other resources) as drawers.
import { StoresPanel } from './stores';
import { useState } from 'react';
import { useGame, useWorld } from './context';
import { Go, Panel } from './links';
import { Term } from './tip';
import { econ, lavishness, LAVISH_FROM, netPerPhase, phaseLedger } from '../sim/economy';
import { duesFor, setPolicy } from '../sim/exchange';
import { modulesOf } from '../sim/holdings';
import { orbitAgo } from '../sim/since';
import { absoluteCycle, CYCLES_PER_PHASE } from '../sim/time';
import { ordinal } from '../sim/rankings';
import { tableOf } from './rankings';
import { GOODS, RESOURCE_LABEL, type Good } from '../data/economy';
import { EconomyPage } from './economy';
import { ExchangePage } from './exchange';
import { LoansPage, VaultsPage } from './sections';
import { SpendPage } from './spend';
import type { LedgerLine } from '../sim/types';

export type Drawer = 'vaults' | 'loans' | 'works' | 'books' | 'orders';
const DRAWERS: [Drawer, string][] = [['vaults', 'Vaults'], ['loans', 'Loans'], ['works', 'Pay & great works'], ['books', 'The full books · taxes · other resources'], ['orders', 'The Exchange floor · orders']];
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${fmt(Math.abs(n))}`;
const BLOCKS = '▁▂▃▄▅▆▇█';
const spark = (xs: number[]) => { if (xs.length < 2) return ''; const lo = Math.min(...xs), hi = Math.max(...xs); return xs.map((x) => BLOCKS[hi === lo ? 3 : Math.round(((x - lo) / (hi - lo)) * 7)]).join(''); };

/** Ledger lines grouped into a few plain heads, biggest first. */
function group(lines: LedgerLine[], sign: 1 | -1): { label: string; amount: number; hot?: boolean }[] {
  const by = new Map<string, number>();
  const name = (l: LedgerLine) => (l.kind === 'tax' ? 'Taxes' : l.kind === 'stipend' && /Council|Knights|blooded/.test(l.label) ? 'Stipends' : l.kind === 'forces' || /garrison/i.test(l.label) ? 'Forces & garrisons' : l.label);
  for (const l of lines.filter((x) => x.resource === 'othes' && Math.sign(x.amount) === sign)) by.set(name(l), (by.get(name(l)) ?? 0) + l.amount);
  const all = [...by.entries()].map(([label, amount]) => ({ label, amount, hot: label === 'The court lives by the coffers' })).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  // The small lines fold into one, so the banks stay short.
  const total = Math.abs(all.reduce((n, x) => n + x.amount, 0)) || 1;
  const big = all.filter((x, i) => i < 7 && Math.abs(x.amount) / total >= 0.04);
  const rest = all.filter((x) => !big.includes(x));
  return rest.length ? [...big, { label: `${rest.length} smaller ${sign > 0 ? 'sources' : 'costs'}`, amount: rest.reduce((n, x) => n + x.amount, 0) }] : big;
}

export function ExchequerPage({ drawer: initial }: { drawer?: Drawer }) {
  const world = useWorld();
  const game = useGame();
  const P = world.playerHouseId;
  const e = econ(world, P);
  const lines = phaseLedger(world, P);
  const net = netPerPhase(lines);
  const [open, setOpen] = useState<Drawer | null>(initial ?? null);
  const ins = group(lines, 1), outs = group(lines, -1);
  const tin = ins.reduce((n, x) => n + x.amount, 0), tout = outs.reduce((n, x) => n + x.amount, 0);
  const max = Math.max(1, ...ins.map((x) => x.amount), ...outs.map((x) => -x.amount));
  const hist = (world.since ?? []).map((s) => s.othes).concat(Math.round(e.stock.othes));
  const ago = orbitAgo(world);
  const delta = ago ? Math.round(e.stock.othes - ago.othes) : 0;
  // The books are the standing flows; goods the Steward sells, ransoms, loans and windfalls come on top.
  const phasesBack = ago ? Math.max(1, (absoluteCycle(world.date) - absoluteCycle(ago.date)) / CYCLES_PER_PHASE) : 0;
  const besides = ago ? Math.round(delta / phasesBack - net.othes) : 0;
  const real = ago ? Math.round(delta / phasesBack) : net.othes;
  const us = tableOf(world).find((r) => r.id === P);
  const lavish = lavishness(e.stock.othes);
  const vault = modulesOf(world, P, 'vault')[0];
  const dues = duesFor(world, P);
  const market = world.economy.market;
  const policy = world.economy.exchange?.policy;
  // The best good to sell now: the one priced furthest above where it was.
  const hot = [...GOODS].filter((g) => e.stock[g] > 50).sort((a, b) => trendOf(b) - trendOf(a))[0];
  function trendOf(g: Good) { const h = market[g].history; return h.length > 4 ? (market[g].price - h[h.length - 5]!) / h[h.length - 5]! : 0; }
  return (
    <>
      <div className="page-title">
        <h2>The Exchequer</h2>
        <p>What comes in, what goes out, what sits in the coffers, and what the goods fetch. Economy ranked {us ? ordinal(us.rank.economy) : '—'}; Exchange dues {Math.round(dues * 100)}%.</p>
      </div>
      <div className="ticker">
        <span className="eyebrow">Exchange</span>
        {GOODS.map((g) => { const t = trendOf(g); return <span key={g}>{RESOURCE_LABEL[g].toUpperCase()} {market[g].price.toFixed(market[g].price < 10 ? 1 : 0)} <span className={t > 0.01 ? 'up' : t < -0.01 ? 'down' : 'muted'}>{t > 0.01 ? '▲' : t < -0.01 ? '▼' : '·'}{Math.abs(Math.round(t * 100))}%</span></span>; })}
      </div>
      <div className="xq-layout">
        <div className="stack" style={{ minWidth: 0 }}>
          <div className="xq-flow">
            <div className="xq-bank">
              <span className="eyebrow up">In · a Phase</span>
              {ins.map((x) => <div key={x.label} className="xq-line"><span>{x.label}</span><span className="xq-bar in" style={{ width: `${Math.round((x.amount / max) * 90)}px` }} /><span className="up mono">{signed(x.amount)}</span></div>)}
              <div className="xq-line total"><strong>Total</strong><span /><strong className="up mono">{signed(tin)}</strong></div>
              <span className="muted" style={{ fontSize: 11 }}>The standing flows only: goods the Steward sells, ransoms and windfalls are counted beside the coffers.</span>
            </div>
            <div className="xq-coffers">
              <span className="eyebrow gold"><Term k="othes">The coffers</Term></span>
              <strong style={{ fontSize: 28 }}>{fmt(e.stock.othes)}</strong>
              <span className="spark">{spark(hist)}</span>
              <span className={real >= 0 ? 'up' : 'down'} style={{ fontSize: 13 }}><strong>{signed(real)}</strong> a Phase, all told</span>
              <span className="xq-split muted">books <span className={net.othes >= 0 ? 'up' : 'down'}>{signed(net.othes)}</span>{ago ? <> · sales &amp; one-offs <span className={besides >= 0 ? 'up' : 'down'}>{signed(besides)}</span></> : null}</span>
              {delta ? <span className="muted" style={{ fontSize: 11 }}>{delta > 0 ? '▲' : '▼'}{fmt(Math.abs(delta))} over the last Orbit</span> : null}
              <span className="muted" style={{ fontSize: 11 }}>drives {fmt(vault?.drives ?? 0)}{vault ? '' : ' · no vault'}</span>
            </div>
            <div className="xq-bank">
              <span className="eyebrow down">Out · a Phase</span>
              {outs.map((x) => <div key={x.label} className={`xq-line${x.hot ? ' lead' : ''}`}><span className={x.hot ? 'gold' : undefined}>{x.hot ? <button type="button" className="linklike" style={{ color: 'var(--gold)' }} title="Othes on ledger drives are not spent" onClick={() => setOpen('vaults')}>{x.label} ›</button> : x.label}</span><span className="xq-bar out" style={{ width: `${Math.round((-x.amount / max) * 90)}px` }} /><span className="down mono">{signed(x.amount)}</span></div>)}
              <div className="xq-line total"><strong>Total</strong><span /><strong className="down mono">{signed(tout)}</strong></div>
            </div>
          </div>
          <div className="xq-goods">
            {GOODS.map((g) => {
              const pol = policy?.[g];
              const t = trendOf(g);
              return (
                <div key={g} className={`xq-good${g === hot && t > 0.02 ? ' lead' : ''}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><strong>{RESOURCE_LABEL[g]}</strong><span className={t > 0.01 ? 'up' : t < -0.01 ? 'down' : 'muted'}>{market[g].price.toFixed(market[g].price < 10 ? 1 : 0)}</span></div>
                  <span className="spark">{spark(market[g].history.slice(-8))}</span>
                  <span className="muted" style={{ fontSize: 11 }}>{fmt(e.stock[g])} · {signed(net[g])}/Ph</span>
                  <div className="filters" style={{ gap: 4 }}>
                    {(['hold', 'fair', 'quick'] as const).map((st) => <button key={st} type="button" className="pill" aria-pressed={pol?.sell === st} onClick={() => game.update((w) => setPolicy(w, g, { sell: st }))}>{st === 'fair' ? 'sell' : st === 'quick' ? 'dump' : 'hold'}</button>)}
                  </div>
                  <button type="button" className="pill" aria-pressed={pol?.buy === 'cover'} onClick={() => game.update((w) => setPolicy(w, g, { buy: pol?.buy === 'cover' ? 'off' : 'cover' }))}>{pol?.buy === 'cover' ? 'covers shortfalls' : 'never buys'}</button>
                </div>
              );
            })}
          </div>
          <StoresPanel />
          <Lately />
        </div>
        <aside className="xq-side">
          {lavish ? (
            <Panel title="The Steward advises" className="lead">
              <div className="body" style={{ display: 'grid', gap: 6, fontSize: 12 }}>
                <span>Above {fmt(LAVISH_FROM)} the court spends freely: <strong className="gold">{fmt(lavish)} a Phase</strong>, more the more we hold. Othes moved onto ledger drives in a vault are not spent.</span>
                {vault ? <button type="button" className="btn small lead" style={{ justifySelf: 'start' }} onClick={() => setOpen('vaults')}>Put it on drives</button> : <Go to={{ kind: 'build', what: 'vault' }} className="btn small lead">Build a vault ›</Go>}
              </div>
            </Panel>
          ) : null}
          {DRAWERS.map(([id, label]) => (
            <button key={id} type="button" className="xq-drawer" aria-expanded={open === id} onClick={() => setOpen(open === id ? null : id)}>
              <span>{open === id ? '▾' : '▸'} {label}</span>
            </button>
          ))}
        </aside>
      </div>
      {open ? <div className="front-detail">
        {open === 'vaults' ? <VaultsPage bare /> : open === 'loans' ? <LoansPage bare /> : open === 'works' ? <SpendPage bare /> : open === 'books' ? <EconomyPage bare /> : <ExchangePage bare />}
      </div> : null}
    </>
  );
}

/** The Orbit's one-off sums, biggest first: what came in and what went out besides the standing flows. */
function Lately() {
  const world = useWorld();
  const e = econ(world, world.playerHouseId);
  const now = absoluteCycle(world.date);
  const lines = (e.recent ?? []).filter((l) => l.resource === 'othes' && l.date && now - absoluteCycle(l.date) <= 80 && Math.abs(l.amount) >= 50 && !/^Upkeep: /.test(l.label));
  const top = (sign: 1 | -1) => lines.filter((l) => Math.sign(l.amount) === sign).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 6);
  const col = (sign: 1 | -1, title: string) => (
    <div className="xq-bank">
      <span className={`eyebrow ${sign > 0 ? 'up' : 'down'}`}>{title}</span>
      {top(sign).length ? top(sign).map((l, i) => <div key={i} className="xq-line"><span>{l.label}</span><span className="muted mono" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{l.date ? `c${l.date.cycle}` : ''}</span><span className={`${sign > 0 ? 'up' : 'down'} mono`}>{signed(l.amount)}</span></div>) : <span className="muted" style={{ fontSize: 12 }}>Nothing this Orbit.</span>}
    </div>
  );
  return (
    <div className="xq-lately">
      {col(1, 'Came in this Orbit · one-offs')}
      {col(-1, 'Went out this Orbit · one-offs')}
    </div>
  );
}
