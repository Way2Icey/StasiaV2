// The bounty board: prices on heads, the hunters who collect them, the prices on our own people,
// and the form to post one of our own.
import { useMemo, useState } from 'react';
import { useGame, useWorld } from './context';
import { Panel, PersonById, PersonLink } from './links';
import { ArchonHouseLink } from './archon';
import {
  board, BROKER_CUT, buyOff, buyOffCost, cannotClaim, cannotPlace, claimBounty, fairPrice, hunterName, onOurHeads, ourBounties, placeBounty,
  posterName, STYLE_LABEL, TERMS_LABEL, viewTarget, withdrawBounty, type Bounty, type BountyTarget, type Terms,
} from '../sim/bounties';
import { setGuard, GUARD_LABEL, type GuardLevel } from '../sim/chair';
import { fightScore } from '../sim/grounds';
import { formatDate } from '../sim/time';
import type { World } from '../sim/types';
import { SEAT_TITLE } from '../sim/world';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const bar = (n: number) => `[${'█'.repeat(Math.round(n / 10))}${'░'.repeat(10 - Math.round(n / 10))}]`;

function usePlay() {
  const game = useGame();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: (w: World) => World) => game.update((w) => { try { setErr(null); return fn(w); } catch (e) { setErr((e as Error).message); return w; } });
  return { run, err };
}

function Target({ t }: { t: BountyTarget }) {
  const world = useWorld();
  if (t.kind === 'person') return <PersonById id={t.id} />;
  const v = viewTarget(world, t);
  return <span>{v?.name ?? 'someone'}</span>;
}

function Poster({ b }: { b: Bounty }) {
  const world = useWorld();
  return b.poster.kind === 'house' ? <ArchonHouseLink id={b.poster.houseId} /> : <span className="muted">{posterName(world, b.poster)}</span>;
}

function Hunter({ b }: { b: Bounty }) {
  const world = useWorld();
  if (!b.hunterId) return <span className="muted">no one yet</span>;
  if (b.hunterId.startsWith('p:')) return <>ours: <PersonById id={b.hunterId.slice(2)} /></>;
  const h = world.bounties?.hunters[b.hunterId];
  return <span>{h ? hunterName(h) : 'a hunter'}</span>;
}

export function BountiesPage() {
  const world = useWorld();
  const { run, err } = usePlay();
  const P = world.playerHouseId;
  const open = board(world);
  const heads = onOurHeads(world);
  const mine = ourBounties(world).slice(0, 12);
  const hunters = Object.values(world.bounties?.hunters ?? {}).sort((a, b) => Number(b.status !== 'dead') - Number(a.status !== 'dead') || b.renown - a.renown);
  const ours = Object.values(world.characters).filter((c) => c.alive && c.houseId === P && c.tier === 'full' && c.seat !== 'highroy').sort((a, b) => fightScore(b) - fightScore(a));
  const [send, setSend] = useState<Record<string, string>>({});
  return (
    <>
      <div className="page-title">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span className="eyebrow">The Ghost Ledger</span>
          <h2>Bounties</h2>
          <p>Prices on heads, held by the brokers of the Ghost Ledger, who take their tithe from every purse. Houses post them; so does the underworld. Hunters take the ones worth the risk. A house may send its own after a price on the board, for the coin and the name.</p>
        </div>
      </div>
      {err ? <p className="body error">{err}</p> : null}
      <div className="grid">
        {heads.length ? (
          <Panel title="Prices on our people" aside={`${heads.length}`} className="span-12">
            {heads.map((b) => {
              const t = b.target.kind === 'person' ? world.characters[b.target.id] : undefined;
              const g = (t && world.chair?.guards[t.id]) ?? 0;
              return (
                <div key={b.id} className="row" style={{ gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span style={{ flex: '1 1 320px' }}><strong><Target t={b.target} /></strong> <span className="muted">· {fmt(b.reward)} othes, {TERMS_LABEL[b.terms].toLowerCase()} · posted by</span> <Poster b={b} /> <span className="muted">{b.reason}</span></span>
                  <span className="mono" style={{ fontSize: 12 }}>{b.status === 'hunted' ? <><Hunter b={b} /> {bar(b.trail)}</> : 'no hunter yet'}</span>
                  <span className="actions">
                    {t ? <select className="select" value={g} aria-label="Guard" onChange={(e) => run((w) => setGuard(w, t.id, Number(e.target.value) as GuardLevel))}>{GUARD_LABEL.map((l, i) => <option key={l} value={i}>{l}</option>)}</select> : null}
                    <button type="button" className="btn small primary" disabled={(world.economy.houses[P]?.stock.othes ?? 0) < buyOffCost(b)} onClick={() => run((w) => buyOff(w, b.id))}>Buy it off · {fmt(buyOffCost(b))}</button>
                  </span>
                </div>
              );
            })}
            <p className="body muted" style={{ margin: 0, fontSize: 12 }}>A guard makes them harder to reach (and costs every Phase). Buying it off pays the brokers to close it: the purse and half again.</p>
          </Panel>
        ) : null}
        <Panel scroll={460} title="The board" aside={`${open.length} open`} className="span-7">
          {open.length ? open.map((b) => {
            const why = (id: string) => cannotClaim(world, b.id, id);
            const pick = send[b.id] ?? '';
            const v = viewTarget(world, b.target);
            return (
              <div key={b.id} className="row" style={{ gap: 10, alignItems: 'baseline', flexWrap: 'wrap', paddingBlock: 6 }}>
                <span style={{ flex: '1 1 300px' }}>
                  <strong><Target t={b.target} /></strong> <span className="muted">· {TERMS_LABEL[b.terms].toLowerCase()}</span>
                  <br /><span className="muted" style={{ fontSize: 12 }}>by <Poster b={b} />, {b.reason} · until {formatDate(b.expires)}{v ? ` · reckoned ${Math.round(v.strength)} to beat` : ''}</span>
                </span>
                <span className="mono" style={{ fontWeight: 700 }}>{fmt(b.reward)}</span>
                {b.status === 'hunted' ? <span className="mono muted" style={{ fontSize: 12, flexBasis: '100%' }}><Hunter b={b} /> {bar(b.trail)}</span> : (
                  <span className="actions" style={{ flexBasis: '100%' }}>
                    <select className="select" value={pick} aria-label="Send" onChange={(e) => setSend({ ...send, [b.id]: e.target.value })}>
                      <option value="">Send one of ours…</option>
                      {ours.slice(0, 16).map((c) => <option key={c.id} value={c.id} disabled={!!why(c.id)}>{c.name.given} · fights {Math.round(fightScore(c))}{why(c.id) ? ` · ${why(c.id)}` : ''}</option>)}
                    </select>
                    <button type="button" className="btn small" disabled={!pick || !!why(pick)} title={pick ? why(pick) ?? '' : ''} onClick={() => run((w) => claimBounty(w, b.id, pick))}>Go after it</button>
                  </span>
                )}
              </div>
            );
          }) : <div className="body muted">Nothing posted. It will not stay that way.</div>}
        </Panel>
        <PlaceBounty className="span-5" run={run} />
        <Panel scroll={360} title="Our prices" aside={`${ourBounties(world).filter((b) => b.status === 'open' || b.status === 'hunted').length} standing`} className="span-6">
          {mine.length ? mine.map((b) => (
            <div key={b.id} className="row" style={{ gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span style={{ flex: '1 1 240px' }}><Target t={b.target} /> <span className="muted">· {fmt(b.reward)} · {TERMS_LABEL[b.terms].toLowerCase()}{b.open ? '' : ' · quiet'}</span></span>
              <span className="mono" style={{ fontSize: 12 }}>{b.status === 'hunted' ? <><Hunter b={b} /> {bar(b.trail)}</> : b.status === 'done' ? (b.outcome === 'taken' ? 'taken alive' : 'killed') : b.status}</span>
              {b.status === 'open' ? <button type="button" className="btn small" onClick={() => run((w) => withdrawBounty(w, b.id))}>Take it down</button> : null}
            </div>
          )) : <div className="body muted">We have put no price on anyone.</div>}
        </Panel>
        <Panel scroll={360} title="The hunters" aside={`${hunters.filter((h) => h.status !== 'dead' && h.status !== 'retired').length} working`} className="span-6">
          <table className="ctable">
            <thead><tr><th>Name</th><th>Renown</th><th>Record</th><th>Now</th></tr></thead>
            <tbody>
              {hunters.map((h) => (
                <tr key={h.id} className={h.status === 'dead' || h.status === 'retired' ? 'gone' : ''} title={`${STYLE_LABEL[h.style]}. Carries ${h.kit}.${h.notes.length ? ' ' + h.notes.join(' ') : ''}`}>
                  <td>{hunterName(h)}<br /><span className="muted" style={{ fontSize: 11 }}>{h.style} · fights {h.skill} · tracks {h.tracking}{h.rivalId ? ` · rival of ${world.bounties!.hunters[h.rivalId]?.epithet}` : ''}</span></td>
                  <td className="mono">{bar(h.renown)}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{h.taken} taken · {h.killed} killed · {h.failed} failed</td>
                  <td className="muted">{h.status === 'hurt' ? 'healing' : h.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </>
  );
}

function PlaceBounty({ className, run }: { className: string; run: (fn: (w: World) => World) => void }) {
  const world = useWorld();
  const P = world.playerHouseId;
  const people = useMemo(() => Object.values(world.characters).filter((c) => c.alive && c.houseId && c.houseId !== P && c.tier === 'full' && (c.seat || c.role === 'Knight' || c.role === 'Champion' || c.role === 'Agent' || world.houses[c.houseId]?.rulerId === c.id)), [world, P]);
  const corsairs = Object.values(world.lanes?.factions ?? {}).flatMap((f) => f.members.filter((m) => m.known && !m.fate).map((m) => ({ f, m })));
  const [key, setKey] = useState('');
  const [terms, setTerms] = useState<Terms>('either');
  const [open, setOpen] = useState(true);
  const t: BountyTarget | null = key.startsWith('p:') ? { kind: 'person', id: key.slice(2) } : key.startsWith('c:') ? { kind: 'corsair', factionId: key.split(':')[1]!, memberId: key.split(':')[2]! } : null;
  const fair = t ? fairPrice(world, t) : 0;
  const [reward, setReward] = useState(0);
  const r = reward || fair;
  const why = t ? cannotPlace(world, t, r) : 'Choose who';
  const tc = t?.kind === 'person' ? world.characters[t.id] : undefined;
  return (
    <Panel title="Post a price" className={className}>
      <div className="body" style={{ display: 'grid', gap: 8 }}>
        <select className="select" value={key} aria-label="On whom" onChange={(e) => { setKey(e.target.value); setReward(0); }}>
          <option value="">On whom…</option>
          <optgroup label="People of other houses">
            {people.map((c) => <option key={c.id} value={`p:${c.id}`}>{c.name.given} {c.name.family ?? c.name.hold ?? ''} · {world.houses[c.houseId!]?.name}{c.seat ? ` · ${SEAT_TITLE[c.seat]}` : c.role ? ` · ${c.role}` : ''}</option>)}
          </optgroup>
          <optgroup label="Corsairs we know by name">
            {corsairs.map(({ f, m }) => <option key={m.id} value={`c:${f.id}:${m.id}`}>{m.name} · {m.role} of {f.name}</option>)}
          </optgroup>
        </select>
        {t ? <>
          {tc ? <span className="muted" style={{ fontSize: 12 }}><PersonLink c={tc} /> of House {world.houses[tc.houseId!]?.name}</span> : null}
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>Purse <input className="text" type="number" min={300} step={50} value={r} onChange={(e) => setReward(Math.max(0, Number(e.target.value)))} style={{ width: 120 }} /> <span className="muted" style={{ fontSize: 12 }}>the brokers call {fmt(fair)} fair</span></label>
          <div className="actions">{(['alive', 'either', 'dead'] as Terms[]).map((k) => <button key={k} type="button" className={`btn small${terms === k ? ' primary' : ''}`} onClick={() => setTerms(k)}>{TERMS_LABEL[k]}</button>)}</div>
          <div className="actions"><button type="button" className={`btn small${open ? ' primary' : ''}`} onClick={() => setOpen(true)}>On the open board</button><button type="button" className={`btn small${!open ? ' primary' : ''}`} onClick={() => setOpen(false)}>Quietly, through a broker</button></div>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            Costs {fmt(Math.ceil(r * (1 + BROKER_CUT)))} now: the purse, and the brokers' tithe of {Math.round(BROKER_CUT * 100)} in a hundred. The purse comes back if no one takes it.
            {' '}{r < fair * 0.7 ? 'Below what good hunters take: only the hungry will go.' : r > fair * 1.3 ? 'Generous: the best on the board will want it.' : ''}
            {' '}{open && tc ? `House ${world.houses[tc.houseId!]?.name} will know it was us, and will not forgive it.` : !open && tc ? 'Quiet prices leak, now and then.' : ''}
            {' '}{terms === 'alive' && tc ? 'Alive, they come to our cells.' : ''}
          </p>
          <button type="button" className="btn primary" disabled={!!why} title={why ?? ''} onClick={() => { run((w) => placeBounty(w, t, r, terms, open)); setKey(''); setReward(0); }}>{why ?? `Post it · ${fmt(Math.ceil(r * (1 + BROKER_CUT)))}`}</button>
        </> : <p className="muted" style={{ margin: 0, fontSize: 12 }}>People of standing in other houses, and the corsairs we know by name.</p>}
      </div>
    </Panel>
  );
}
