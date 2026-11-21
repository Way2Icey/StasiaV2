// Treasury: how we pay our people, and what a rich house spends on.
import { useState } from 'react';
import { useGame, useWorld } from './context';
import { Panel, PersonLink } from './links';
import { PAY_SCALE, phaseLedger, setPayScale, stipendOf, fameOf } from '../sim/economy';
import { BRIBE_COST, bribeDraw, cannotBribe, cannotFund, cannotStartWork, FUND_COST, fundBid, startWork, WORKS, type WorkId } from '../sim/treasury';
import type { World } from '../sim/types';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

function usePlay() {
  const game = useGame();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: (w: World) => World) => game.update((w) => { try { setErr(null); return fn(w); } catch (e) { setErr((e as Error).message); return w; } });
  return { run, err };
}

export function SpendPage() {
  const world = useWorld();
  const { run, err } = usePlay();
  const P = world.playerHouseId;
  const scale = world.economy.payScale ?? 'fair';
  const lines = phaseLedger(world, P).filter((l) => l.kind === 'stipend');
  const knights = Object.values(world.characters).filter((c) => c.alive && c.houseId === P && (c.role === 'Knight' || c.flags.some((f) => f.id === 'knighted')) && !c.flags.some((f) => f.id === 'retired')).sort((a, b) => stipendOf(world, b) - stipendOf(world, a));
  const mult = PAY_SCALE[scale].mult;
  return (
    <>
      <div className="page-title">
        <h2>Pay &amp; great works</h2>
        <p>What the house costs to run, how it pays the people who fight and serve for it, and what a rich house spends on when the bills are paid.</p>
      </div>
      {err ? <p className="body error">{err}</p> : null}
      <div className="grid">
        <Panel title="How we pay" aside={`${fmt(-lines.reduce((n, l) => n + l.amount, 0))} othes a Phase`} className="span-6">
          <div className="actions body">
            {(Object.keys(PAY_SCALE) as (keyof typeof PAY_SCALE)[]).map((k) => (
              <button key={k} type="button" className={`btn small${scale === k ? ' primary' : ''}`} title={PAY_SCALE[k].note} onClick={() => run((w) => setPayScale(w, k))}>{PAY_SCALE[k].label}</button>
            ))}
          </div>
          <p className="body muted" style={{ margin: 0, fontSize: 12 }}>{PAY_SCALE[scale].note} Knights are paid by their fame: every title and win raises what they expect.</p>
          {lines.map((l, i) => <div key={i} className="row"><span style={{ flex: 1 }}>{l.label}</span><span className="mono">{fmt(l.amount)}</span></div>)}
        </Panel>
        <Panel title="The knights' pay" aside={`${knights.length}`} className="span-6">
          {knights.slice(0, 14).map((c) => (
            <div key={c.id} className="row"><span style={{ flex: 1 }}><PersonLink c={c} /> <span className="muted">· fame {fameOf(world, c).toFixed(0)}</span></span><span className="mono">{fmt(stipendOf(world, c) * mult)}/Phase</span></div>
          ))}
        </Panel>
        <Panel title="The Crucible bid" aside={`${fmt(FUND_COST)} othes`} className="span-6">
          <p className="body muted" style={{ margin: 0, fontSize: 12 }}>Once we are drawn: the best kit, fresh provisions and a second transport. Our force fights about a twelfth stronger that year.</p>
          <div className="actions"><button type="button" className="btn small primary" disabled={!!cannotFund(world)} title={cannotFund(world) ?? ''} onClick={() => run(fundBid)}>{cannotFund(world) ?? 'Fund it in full'}</button></div>
        </Panel>
        <Panel title="A word with the Numarade" aside={`${fmt(BRIBE_COST)} othes`} className="span-6">
          <p className="body muted" style={{ margin: 0, fontSize: 12 }}>A purse for the right clerk and we are drawn for the next Crucible. About one time in three, it comes out, and the other courts laugh.</p>
          <div className="actions"><button type="button" className="btn small" disabled={!!cannotBribe(world)} title={cannotBribe(world) ?? ''} onClick={() => run(bribeDraw)}>{cannotBribe(world) ?? 'Pay the clerk'}</button></div>
        </Panel>
        <Panel title="Great works" aside="One at a time · paid as the treasury allows" className="span-12">
          {(Object.keys(WORKS) as WorkId[]).map((id) => {
            const d = WORKS[id];
            const x = world.treasury?.works.find((y) => y.id === id);
            const why = cannotStartWork(world, id);
            return (
              <div key={id} className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                <span style={{ flex: 1 }}><strong>{d.name}</strong> <span className="muted">· {fmt(d.cost)} othes · {d.note} {d.effect}</span></span>
                {x ? <span className="mono">{x.done ? 'Finished' : `[${'█'.repeat(Math.round((x.paid / d.cost) * 12))}${'░'.repeat(12 - Math.round((x.paid / d.cost) * 12))}] ${Math.round((x.paid / d.cost) * 100)}%`}</span>
                  : <button type="button" className="btn small" disabled={!!why} title={why ?? ''} onClick={() => run((w) => startWork(w, id))}>{why ?? 'Begin'}</button>}
              </div>
            );
          })}
        </Panel>
      </div>
    </>
  );
}
