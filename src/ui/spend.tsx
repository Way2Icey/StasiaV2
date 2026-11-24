// Treasury: how we pay our people, and what a rich house spends on.
import { useState } from 'react';
import { useGame, useWorld } from './context';
import { Panel, PersonLink } from './links';
import { PAY_SCALE, phaseLedger, setPayScale, stipendOf, fameOf } from '../sim/economy';
import { BRIBE_COST, bribeDraw, cannotBribe, cannotFund, cannotStartWork, FUND_COST, fundBid, holdFestival, startWork, WORKS, type WorkId } from '../sim/treasury';
import { CEREMONY_LABEL, CEREMONY_NOTE, EQUIP_COST, EQUIP_LABEL, EQUIP_NOTE, cannotHoldFestival, credibilityOf, credibilityWord, equipOf, expectedEquip, festivalCost, setCeremony, setEquip, standingMult, type EquipLevel } from '../sim/standing';
import { Term } from './tip';
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
        <p>What the house costs to run, how it pays the people who fight and serve for it, and what a rich house spends on when the bills are paid. The higher the house stands, the more all of it costs: our station asks {standingMult(world, P).toFixed(2)}× what a modest Minor House pays.</p>
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
        <StandingPanels run={run} />
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

function StandingPanels({ run }: { run: (fn: (w: World) => World) => void }) {
  const world = useWorld();
  const P = world.playerHouseId;
  const e = world.economy.houses[P]!;
  const eq = equipOf(world, P);
  const want = expectedEquip(world, P);
  const soldiers = Object.values(world.war?.formations ?? {}).filter((f) => f.houseId === P && f.kind !== 'fleet' && f.strength > 0).reduce((t, f) => t + f.strength, 0);
  const cer = e.ceremony ?? 'fitting';
  const cred = credibilityOf(world, P);
  const fest = cannotHoldFestival(world);
  const tally = Object.entries(e.lastTally ?? {}).filter(([, v]) => Math.abs(v) >= 1).sort((a, b) => b[1] - a[1]);
  const KIND: Record<string, string> = { quarter: 'Quarters and estates', tax: 'Taxes', trade: 'Trade', court: 'Court and ceremony', stipend: 'Stipends, court and dues', forces: 'Forces and arms', war: 'War', develop: 'Building', mission: 'Missions', ransom: 'Ransoms', boon: 'Boons', skim: 'Lost to skimming', raid: 'Raids', port: 'Ports', audit: 'Audits', steward: 'Steward', food: 'Food', quota: 'Quota' };
  return (
    <>
      <Panel title="Arms of the legions" aside={`${fmt(soldiers * EQUIP_COST[eq])} othes a Phase`} className="span-6">
        <div className="actions body">
          {([0, 1, 2, 3] as EquipLevel[]).map((l) => <button key={l} type="button" className={`btn small${eq === l ? ' primary' : ''}`} title={`${EQUIP_NOTE[l]} ${fmt(soldiers * EQUIP_COST[l])} othes a Phase.`} onClick={() => run((w) => setEquip(w, l))}>{EQUIP_LABEL[l]}</button>)}
        </div>
        <p className="body muted" style={{ margin: 0, fontSize: 12 }}>{EQUIP_NOTE[eq]} {eq < want ? <span className="error">Below what the Archon expects of a house of our rank: our standing falls every year it stays so.</span> : eq > want ? 'Above our rank: our standing rises a little each year, and the legions fight harder.' : 'What the Archon expects of a house of our rank.'}</p>
      </Panel>
      <Panel title="Ceremonies owed" className="span-6">
        <div className="actions body">
          {(Object.keys(CEREMONY_LABEL) as (keyof typeof CEREMONY_LABEL)[]).map((k) => <button key={k} type="button" className={`btn small${cer === k ? ' primary' : ''}`} title={CEREMONY_NOTE[k]} onClick={() => run((w) => setCeremony(w, k))}>{CEREMONY_LABEL[k]}</button>)}
        </div>
        <p className="body muted" style={{ margin: 0, fontSize: 12 }}>{CEREMONY_NOTE[cer]} Every knighting, promotion, birth in the Highroy\'s family and funeral of the court is owed one, paid for as it comes.</p>
      </Panel>
      <Panel title={<Term k="credibility">Credibility of our othes</Term>} aside={credibilityWord(cred)} className="span-6">
        <div className="body" style={{ display: 'grid', gap: 6 }}>
          <span className="mono">{'█'.repeat(Math.round(cred / 5)).padEnd(20, '░')} {Math.round(cred)}</span>
          <span className="muted" style={{ fontSize: 12 }}>An othe is a bound commitment, worth what its issuer is trusted to fulfil. Every Phase in debt and every loan defaulted costs us; solvent years slowly earn it back. Below 60, everything we buy costs more and lenders ask more.</span>
        </div>
      </Panel>
      <Panel title="A festival for the Realm" aside={`${fmt(festivalCost(world))} othes`} className="span-6">
        <p className="body muted" style={{ margin: 0, fontSize: 12 }}>Once a year. Unrest falls on every world we hold, the court is glad of it, and if the chair is ours, the Archon sees an Exarchon who is generous.</p>
        <div className="actions"><button type="button" className="btn small" disabled={!!fest} title={fest ?? ''} onClick={() => run(holdFestival)}>{fest ?? 'Hold the festival'}</button></div>
      </Panel>
      {tally.length ? (
        <Panel title="Last year's accounts" className="span-12">
          {tally.map(([k, v]) => <div key={k} className="row"><span style={{ flex: 1 }}>{KIND[k.slice(1)] ?? k.slice(1)}</span><span className="mono">{v > 0 ? '+' : ''}{fmt(v)}</span></div>)}
        </Panel>
      ) : null}
    </>
  );
}
