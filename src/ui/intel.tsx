// Cells & intel: questioning the people we hold, turning them, the agents we run inside other houses,
// and what all of it has given us to use.
import { useState } from 'react';
import { useGame, useNav, useWorld } from './context';
import { Panel, PersonById, PersonLink } from './links';
import { ArchonHouseLink } from './archon';
import { captivesHeldBy } from '../sim/captives';
import {
  activeAgents, askAgent, blackmail, cannotQuestion, cannotStrike, cannotTurn, liveIntel, METHOD_LABEL, METHOD_NOTE, questionCaptive, strikeSite,
  turnCaptive, turnOdds, TURN_AT, startResolveOf, type Intel, type Method,
} from '../sim/turning';
import { shipsFree } from '../sim/arcs_places';
import { formatDate } from '../sim/time';
import type { World } from '../sim/types';

const bar = (n: number) => `[${'█'.repeat(Math.round(n / 10))}${'░'.repeat(10 - Math.round(n / 10))}]`;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const KIND_LABEL: Record<Intel['kind'], string> = { site: 'A way in', plot: 'A plot', secret: 'A secret' };

function usePlay() {
  const game = useGame();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: (w: World) => World) => game.update((w) => { try { setErr(null); return fn(w); } catch (e) { setErr((e as Error).message); return w; } });
  return { run, err };
}

export function IntelPage({ bare }: { bare?: boolean } = {}) {
  const { run, err } = usePlay();
  return (
    <>
      {bare ? null : (
      <div className="page-title">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span className="eyebrow">The Spymaster's rooms</span>
          <h2>Cells &amp; intel</h2>
          <p>What the people in our cells know, how hard we are willing to get it out of them, and what it buys: a way into a station without a declared war, a secret worth a purse, a plot the Archon will hear as a grievance. Some of them will lie. Some we turn will never be ours.</p>
        </div>
      </div>
      )}
      {err ? <p className="body error">{err}</p> : null}
      <div className="grid">
        <Cells run={run} />
        <IntelList run={run} />
        <Agents run={run} />
        <Wrongs />
      </div>
    </>
  );
}

function Cells({ run }: { run: (fn: (w: World) => World) => void }) {
  const world = useWorld();
  const held = captivesHeldBy(world, world.playerHouseId);
  const [method, setMethod] = useState<Method>('talk');
  return (
    <Panel title="The cells" aside={held.length ? `${held.length} held` : 'empty'} className="span-12">
      <p className="body muted" style={{ margin: 0, fontSize: 12 }}>
        Each session wears their resolve down. Past 70, 45 and 20 they give something up. At {TURN_AT} or below they can be turned. Once a Phase each.
      </p>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {(['talk', 'press', 'break'] as Method[]).map((m) => (
          <button key={m} type="button" className={`btn small${method === m ? ' primary' : ''}`} aria-pressed={method === m} onClick={() => setMethod(m)}>{METHOD_LABEL[m]}</button>
        ))}
        <span className="muted" style={{ fontSize: 12, flex: 1, minWidth: 220 }}>{METHOD_NOTE[method]}</span>
      </div>
      {held.length === 0 ? <p className="body muted" style={{ margin: 0 }}>No one is held. Investigations, a watchful Spymaster, and bounties taken alive fill the cells.</p> : null}
      <div className="table-wrap">
        {held.length ? (
          <table className="ctable">
            <thead><tr><th>CAPTIVE</th><th>RESOLVE</th><th>SESSIONS</th><th /></tr></thead>
            <tbody>
              {held.map((cap) => {
                const c = world.characters[cap.characterId]!;
                const k = cap.cell;
                const q = cannotQuestion(world, c.id);
                const qBtn = q && /this Phase/.test(q) ? 'Questioned this Phase' : METHOD_LABEL[method];
                const t = cannotTurn(world, c.id);
                return (
                  <tr key={c.id}>
                    <td><PersonLink c={c} /><br /><span className="muted" style={{ fontSize: 12 }}>{c.role} · <ArchonHouseLink id={c.houseId ?? ''} /> · since {formatDate(cap.since)}</span></td>
                    <td className="mono">{(() => { const r = k?.resolve ?? startResolveOf(c); return <>{bar(r)} {r}{k ? '' : <span className="muted"> untouched</span>}</>; })()}</td>
                    <td className="mono muted" style={{ fontSize: 12 }}>{k ? `talk ${k.sessions.talk} · press ${k.sessions.press} · cage ${k.sessions.break}` : '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button type="button" className="btn small primary" disabled={!!q} title={q ? undefined : METHOD_NOTE[method]} onClick={() => run((w) => questionCaptive(w, c.id, method))}>{qBtn}</button>{' '}
                      {t ? <span className="muted" style={{ fontSize: 12 }}>{/^Not yet/.test(t) ? `Turns at ${TURN_AT}` : t}</span> : (
                        <>
                          <button type="button" className="btn small" title={`The Spymaster reckons ${pct(turnOdds(world, c.id))} they are truly ours`} onClick={() => run((w) => turnCaptive(w, c.id, 'serve'))}>Turn: serve us</button>{' '}
                          <button type="button" className="btn small" title={`Let them "escape" home and report from inside. The Spymaster reckons ${pct(turnOdds(world, c.id))} they are truly ours.`} onClick={() => run((w) => turnCaptive(w, c.id, 'home'))}>Turn: send home</button>{' '}
                          <span className="muted mono" style={{ fontSize: 12 }}>~{pct(turnOdds(world, c.id))} true</span>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </div>
    </Panel>
  );
}

function IntelList({ run }: { run: (fn: (w: World) => World) => void }) {
  const world = useWorld();
  const items = liveIntel(world);
  const free = shipsFree(world, world.playerHouseId);
  const [pick, setPick] = useState<Record<string, string[]>>({});
  return (
    <Panel title="What we know" aside={items.length ? `${items.length} in hand` : 'nothing'} className="span-12">
      {items.length === 0 ? <p className="body muted" style={{ margin: 0 }}>Nothing yet. Captives and agents give us ways into stations, other houses' plots, and secrets worth money.</p> : null}
      {items.map((it) => {
        const sel = pick[it.id] ?? free.slice(0, 2).map((s) => s.id);
        const why = it.kind === 'site' ? cannotStrike(world, it.id, sel) : null;
        return (
          <div key={it.id} className="row petition" style={{ alignItems: 'flex-start' }}>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span><strong>{KIND_LABEL[it.kind]}</strong> · <ArchonHouseLink id={it.houseId} /> <span className="muted" style={{ fontSize: 12 }}>· {it.source} · {'★'.repeat(it.quality)}{'☆'.repeat(3 - it.quality)} · stale {formatDate(it.expires)}</span></span>
              <span className="body">{it.text}</span>
              {it.kind === 'plot' ? <span className="muted" style={{ fontSize: 12 }}>If it is aimed at us, the Archon counts it as a grievance for war.</span> : null}
              {it.kind === 'site' ? (
                <span className="muted" style={{ fontSize: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  Strike with:{free.length === 0 ? ' no ships ready' : null}
                  {free.map((s) => (
                    <label key={s.id} style={{ whiteSpace: 'nowrap' }}>
                      <input type="checkbox" checked={sel.includes(s.id)} onChange={(e) => setPick({ ...pick, [it.id]: e.target.checked ? [...sel, s.id] : sel.filter((x) => x !== s.id) })} /> {s.name}
                    </label>
                  ))}
                </span>
              ) : null}
            </span>
            <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
              {it.kind === 'site' ? <button type="button" className="btn small primary" disabled={!!why} title={why ?? 'No colours, no declaration. Loot and a cut garrison if it works; regard and a grievance against us if we are recognised.'} onClick={() => run((w) => strikeSite(w, it.id, sel))}>Strike</button> : null}
              {it.kind === 'secret' ? (
                <>
                  <button type="button" className="btn small primary" title="They pay to keep it quiet" onClick={() => run((w) => blackmail(w, it.id, 'pay'))}>Make them pay</button>
                  <button type="button" className="btn small" title="Read it out in the Numarade: their house loses honour, they are disgraced" onClick={() => run((w) => blackmail(w, it.id, 'ruin'))}>Ruin them</button>
                </>
              ) : null}
            </span>
          </div>
        );
      })}
    </Panel>
  );
}

function Agents({ run }: { run: (fn: (w: World) => World) => void }) {
  const world = useWorld();
  const agents = activeAgents(world);
  const lost = (world.intel?.agents ?? []).filter((a) => a.burned);
  return (
    <Panel title="Our people inside" aside={`${agents.length} active`} className="span-6">
      {agents.length === 0 ? <p className="body muted" style={{ margin: 0 }}>None. A captive turned and sent home reports from inside their house, if they are really ours.</p> : null}
      {agents.map((a) => (
        <div key={a.personId} className="row petition">
          <span style={{ flex: 1, minWidth: 0 }}>
            <PersonById id={a.personId} /> <span className="muted" style={{ fontSize: 12 }}>· inside <ArchonHouseLink id={world.characters[a.personId]?.houseId ?? ''} /> since {formatDate(a.since)} · {a.reports} reports</span>
          </span>
          <span style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button type="button" className="btn small" disabled={(a.asked ?? 0) >= 2} title="Have them leave a gate open on a station. Raises the chance they are found out." onClick={() => run((w) => askAgent(w, a.personId, 'gate'))}>Ask for a gate</button>
            <button type="button" className="btn small" disabled={(a.asked ?? 0) >= 2} title="Have them skim the house ledger. Raises the chance they are found out." onClick={() => run((w) => askAgent(w, a.personId, 'purse'))}>Skim the ledger</button>
          </span>
        </div>
      ))}
      {lost.length ? <p className="muted" style={{ margin: 0, fontSize: 12 }}>Lost: {lost.map((a) => world.characters[a.personId]?.name.given ?? 'someone').join(', ')}.</p> : null}
    </Panel>
  );
}

function Wrongs() {
  const world = useWorld();
  const nav = useNav();
  const P = world.playerHouseId;
  const ws = (world.intel?.wrongs ?? []).slice(-12).reverse();
  return (
    <Panel title="Wrongs on the record" aside="the Archon's reasons for war" className="span-6">
      {ws.length === 0 ? <p className="body muted" style={{ margin: 0 }}>None. A plot against us, confessed by their own people, is one; a strike we were seen making is one against us.</p> : null}
      {ws.map((x, i) => (
        <div key={i} className="row" style={{ gap: 6, fontSize: 12 }}>
          <span className="mono muted">SY-{x.year}</span>
          <span style={{ flex: 1 }}>{x.against === P ? <>By <ArchonHouseLink id={x.by} />: {x.text}</> : <>Against <ArchonHouseLink id={x.against} /> (theirs to use): {x.text}</>}</span>
          {x.against === P ? <button type="button" className="btn small" onClick={() => nav.to({ kind: 'house', id: x.by })}>House ›</button> : null}
        </div>
      ))}
    </Panel>
  );
}
