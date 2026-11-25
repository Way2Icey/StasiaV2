// The Archon as a whole: the register of houses, the Numarade, the history, the frontier, and the new-game
// screen where a house is chosen.
import { CLAIM_COST, cannotClaim, claimWild } from '../sim/arcs_places';
import { Peek } from './links';
import { useMemo, useState } from 'react';
import { useGame, useNav, useWorld } from './context';
import { Go, Panel, PersonById } from './links';
import { bar } from './hall';
import { Term } from './tip';
import {
  affinity, agreements, cannotCourt, cannotTable, courtHouse, COURT_COST, exarchonOf, houseName, liveHouses, lowestGreat, openWilds, regardOf,
  riftBetween, sponsorFor, tableMotion, tally, type Motion, type OurMotion,
} from '../sim/archon';
import { CANON_HOUSES, TOPICS, TOPIC_ENDS, TOPIC_LABEL, type Views } from '../data/canon';
import { CLIMATE_LABEL, HAZARD_LABEL, worthOf, wildLabel } from '../sim/frontier';
import { SPECIES } from '../data/species';
import { attitude, attitudeColor } from '../sim/relations';
import { createWorld } from '../sim/world';
import { beginLegendHunt, beginPact, whyNoAgent } from '../sim/scenes_api';
import { dateParts, formatDate } from '../sim/time';
import type { World } from '../sim/types';

const pct = (v: number) => Math.max(0, Math.min(1, v / 100));
const H = (w: World, id: string) => `House ${houseName(w, id)}`;

export function ArchonHouseLink({ id }: { id: string }) {
  const world = useWorld();
  return <Peek t={{ k: 'house', id }}>{houseName(world, id)}</Peek>;
}

function Title({ eyebrow, title, sub }: { eyebrow?: React.ReactNode; title: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="page-title">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        {eyebrow ? <span className="eyebrow gold">{eyebrow}</span> : null}
        <h2>{title}</h2>
        {sub ? <p>{sub}</p> : null}
      </div>
    </div>
  );
}

function usePlay() {
  const game = useGame();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: (w: World) => World) => game.update((w) => { try { setErr(null); return fn(w); } catch (e) { setErr((e as Error).message); return w; } });
  return { run, err };
}

// ---------------------------------------------------------------- views

/** A house's views as a row of −2..+2 marks. */
export function ViewsList({ views, compare }: { views: Views; compare?: Views }) {
  return (
    <div className="views">
      {compare ? <div className="view-row muted" style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}><span /><span>them</span><span /><span>us</span></div> : null}
      {TOPICS.map((t) => {
        const v = views[t];
        const mark = ['◀◀', '◀', '·', '▶', '▶▶'][v + 2];
        return (
          <div key={t} className="view-row" title={`${TOPIC_ENDS[t][0]} ◀ ▶ ${TOPIC_ENDS[t][1]}`}>
            <span className="view-topic">{TOPIC_LABEL[t]}</span>
            <span className="mono view-mark">{mark}</span>
            <span className="muted view-word">{v === 0 ? 'no strong view' : TOPIC_ENDS[t][v > 0 ? 1 : 0]}</span>
            {compare ? <span className="mono muted" title="Our view">{['◀◀', '◀', '·', '▶', '▶▶'][compare[t] + 2]}</span> : null}
          </div>
        );
      })}
    </div>
  );
}

/** Where a house stands with us and in the Archon. */
export function ArchonPanel({ id, className }: { id: string; className?: string }) {
  const world = useWorld();
  const h = world.archon?.houses[id];
  if (!h) return null;
  const P = world.playerHouseId;
  const us = id === P;
  const ag = us ? null : agreements(world, P, id);
  const seat = world.archon!.numarade.seats.includes(id);
  return (
    <Panel title={<Term k="outlook">Outlook</Term>} aside={us ? 'what we believe' : `alike ${Math.round((affinity(world, P, id) + 1) * 50)}%`} className={className}>
      <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <dl className="kv">
          <dt>Rank</dt><dd>{h.tier === 'great' ? 'Great House' : 'Minor House'}{seat ? ' · seated in the Numarade' : ''}</dd>
          <dt><Term k="prestige">Standing</Term></dt><dd className="mono">{bar(pct(h.prestige))} {Math.round(h.prestige)}</dd>
          {!us ? <><dt>They regard us</dt><dd style={{ color: attitudeColor(regardOf(world, id, P)) }}>{attitude(regardOf(world, id, P))} ({regardOf(world, id, P)})</dd></> : null}
        </dl>
        <ViewsList views={h.views} compare={us ? undefined : world.archon!.houses[P]?.views} />
        {ag && (ag.agree.length || ag.differ.length) ? (
          <span className="muted" style={{ fontSize: 12 }}>
            {ag.agree.length ? `We agree on ${ag.agree.map((t) => TOPIC_LABEL[t].toLowerCase()).join(', ')}. ` : ''}
            {ag.differ.length ? `We are far apart on ${ag.differ.map((t) => TOPIC_LABEL[t].toLowerCase()).join(', ')}.` : ''}
          </span>
        ) : null}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------- the register

export function RegisterPanel({ className }: { className?: string }) {
  const world = useWorld();
  const P = world.playerHouseId;
  const n = world.archon?.numarade;
  const rows = liveHouses(world).sort((a, b) => (a.tier === b.tier ? b.prestige - a.prestige : a.tier === 'great' ? -1 : 1));
  return (
    <Panel scroll={620} title="The Houses of the Archon" aside={`${rows.filter((h) => h.tier === 'great').length} Great · ${rows.filter((h) => h.tier === 'minor').length} Minor`} className={className}>
      <div className="body" style={{ overflowX: 'auto' }}>
        <table className="list">
          <thead><tr><th>House</th><th>Rank</th><th>People</th><th>Seat</th><th>Standing</th><th>Toward us</th><th>Known for</th></tr></thead>
          <tbody>
            {rows.map((h) => (
              <tr key={h.id} className={h.id === P ? 'ours' : undefined}>
                <td><ArchonHouseLink id={h.id} />{h.simulated ? '' : <span className="muted" title="On the register: not simulated in full"> ·</span>}</td>
                <td>{h.tier === 'great' ? 'Great' : 'Minor'}</td>
                <td>{h.speciesKnown ? SPECIES[h.species].name : <span className="muted">unknown</span>}{h.vassals?.length ? ` (+${h.vassals.map((v) => SPECIES[v].name).join(', ')})` : ''}</td>
                <td>{n?.exarchon?.houseId === h.id ? 'Exarchon' : n?.seats.includes(h.id) ? 'Seated' : '—'}</td>
                <td className="mono">{Math.round(h.prestige)}</td>
                <td style={{ color: h.id === P ? undefined : attitudeColor(regardOf(world, h.id, P)) }}>{h.id === P ? 'us' : regardOf(world, h.id, P)}</td>
                <td className="muted" style={{ fontSize: 12 }}>{h.focus}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: 11, margin: '6px 0 0' }}>Houses marked · are on the register: they vote, feud, ally and fight in the Crucible, but their people are not simulated one by one.</p>
      </div>
    </Panel>
  );
}

/** The page of a house on the register. */
export function ArchonHousePage({ id }: { id: string }) {
  const world = useWorld();
  const { run, err } = usePlay();
  const h = world.archon?.houses[id];
  if (!h) return <p className="error">No such house.</p>;
  const P = world.playerHouseId;
  const a = world.archon!;
  const feuds = a.feuds.filter((r) => r.a === id || r.b === id);
  const pacts = a.pacts.filter((r) => r.a === id || r.b === id);
  const past = a.history.filter((e) => e.houses.includes(id)).slice(-14).reverse();
  const why = cannotCourt(world, id);
  const year = dateParts(world.date).year;
  return (
    <>
      <Title eyebrow={<>{h.tier === 'great' ? 'Great House' : 'Minor House'} of Archon{h.canon ? '' : ' · founded in play'}</>} title={`House ${h.name}`} sub={h.blurb} />
      {err ? <p className="error">{err}</p> : null}
      <div className="actions">
        <button type="button" className="btn primary" disabled={!!why} title={why ?? undefined} onClick={() => run((w) => courtHouse(w, id))}>Court them ({COURT_COST.toLocaleString('en-US')} othes)</button>
        <Go to={{ kind: 'numarade' }} className="btn">The Numarade ›</Go>
        <button type="button" className="btn" onClick={() => run((w) => beginPact(w, id))} title="A live negotiation">Propose a pact</button>
        <Go to={{ kind: 'war' }} className="btn">War ›</Go>
      </div>
      <div className="grid">
        <Panel title="The house" className="span-6">
          <div className="body">
            <dl className="kv">
              <dt>Ruler</dt><dd>{h.ruler ? `${h.ruler.name}, ${year - h.ruler.born}` : '—'}{h.ruler ? <span className="muted"> · since {h.ruler.since}</span> : null}</dd>
              <dt>People</dt><dd>{SPECIES[h.species].name}{h.speciesKnown ? '' : ' (not on record; assumed)'}{h.vassals?.length ? `, with ${h.vassals.map((v) => SPECIES[v].name).join(', ')} vassals` : ''}</dd>
              <dt>Known for</dt><dd>{h.focus}</dd>
              <dt>Capital</dt><dd>{h.capital}</dd>
              <dt>Worlds</dt><dd className="mono">{h.worlds}</dd>
              {h.founded ? <><dt>Founded</dt><dd>{h.founded}{h.foundedBy ? ` by ${h.foundedBy}` : ''}</dd></> : null}
              <dt>Families</dt><dd>{h.families.join(', ')}</dd>
              <dt>Feuds</dt><dd>{feuds.length ? feuds.map((r, i) => <span key={i}>{i ? ', ' : ''}<ArchonHouseLink id={r.a === id ? r.b : r.a} /> <span className="muted">since {r.since}</span></span>) : 'none'}</dd>
              <dt>Pacts</dt><dd>{pacts.length ? pacts.map((r, i) => <span key={i}>{i ? ', ' : ''}<ArchonHouseLink id={r.a === id ? r.b : r.a} /></span>) : 'none'}</dd>
            </dl>
          </div>
        </Panel>
        <ArchonPanel id={id} className="span-6" />
        {h.notables.length ? (
          <Panel scroll={320} title="People of note" className="span-6">
            <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {h.notables.map((n) => <div key={n.name}><strong>{n.name}</strong> <span className="muted">· {n.role}</span><div style={{ fontSize: 12, color: 'var(--fg-2)' }}>{n.note}</div></div>)}
            </div>
          </Panel>
        ) : null}
        <Panel scroll={320} title="In the histories" className={h.notables.length ? 'span-6' : 'span-12'}>
          <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
            {past.length ? past.map((e, i) => <div key={i}><span className="mono muted">{e.year > 0 ? e.year : '—'}</span> {e.text}</div>) : <span className="muted">Nothing on record.</span>}
          </div>
        </Panel>
        <Panel scroll={320} title="Toward the others" className="span-12">
          <div className="body" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 12 }}>
            {liveHouses(world).filter((o) => o.id !== id).sort((x, y) => regardOf(world, id, y.id) - regardOf(world, id, x.id)).map((o) => (
              <span key={o.id}><ArchonHouseLink id={o.id} /> <span className="mono" style={{ color: attitudeColor(regardOf(world, id, o.id)) }}>{regardOf(world, id, o.id)}</span>{o.id === P ? ' (us)' : ''}</span>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- the Numarade

function MotionRow({ m }: { m: Motion }) {
  const world = useWorld();
  const t = tally(m);
  const P = world.playerHouseId;
  const ours = m.votes[P];
  return (
    <div className="row" style={{ alignItems: 'baseline', gap: 8, fontSize: 13 }}>
      <span className="mono muted">{formatDate(m.date)}</span>
      <span style={{ flex: 1 }}>
        {m.title}
        {m.status !== 'open' ? <span className="muted"> · {m.result}</span> : m.kind === 'elect' || m.kind === 'seats' ? <span className="muted"> · under way</span> : <span className="muted"> · {t.aye} for, {t.nay} against so far</span>}
        {ours !== undefined && m.kind !== 'seats' ? <span className="tag" style={{ marginLeft: 6 }}>we: {typeof ours === 'number' ? m.candidates?.[ours]?.name ?? '—' : ours}</span> : null}
      </span>
      <span className={`tag${m.status === 'passed' ? ' good' : m.status === 'failed' ? ' bad' : ''}`}>{m.status === 'open' ? 'open' : m.status === 'passed' ? (m.kind === 'elect' || m.kind === 'seats' ? 'decided' : 'carried') : 'fell'}</span>
    </div>
  );
}

export function NumaradePage() {
  const world = useWorld();
  const { run, err } = usePlay();
  const a = world.archon;
  const [kind, setKind] = useState<OurMotion>('censure');
  const [target, setTarget] = useState('');
  const [second, setSecond] = useState('');
  if (!a) return <p className="error">The Numarade is not sitting.</p>;
  const n = a.numarade;
  const P = world.playerHouseId;
  const ex = exarchonOf(world);
  const year = dateParts(world.date).year;
  const sponsor = sponsorFor(world);
  const why = cannotTable(world, kind, target || undefined, second || undefined);
  const houses = liveHouses(world);
  const feuds: [string, string][] = [...a.feuds.map((r) => [r.a, r.b] as [string, string]), ...(world.realm?.feuds ?? []).map((f) => [f.a, f.b] as [string, string])];
  const open = n.motions.filter((m) => m.status === 'open');
  const past = n.motions.filter((m) => m.status !== 'open').slice(0, 16);
  const low = lowestGreat(world);
  return (
    <>
      <Title eyebrow="The High Council of the Archon" title="The Numarade" sub="Eleven seats: the seven Great Houses, and four the Minor Houses elect every five years. They choose the Exarchon, who serves for life, and vote on what binds the houses. Major acts need eight seats." />
      {err ? <p className="error">{err}</p> : null}
      <div className="grid">
        <Panel title={<Term k="exarchon">The Exarchon</Term>} className="span-6">
          <div className="body">
            {ex ? (
              <dl className="kv">
                <dt>Exarchon</dt><dd>{ex.personId ? <PersonById id={ex.personId} /> : ex.name}, of <ArchonHouseLink id={ex.houseId} /></dd>
                <dt>In the chair</dt><dd>since {ex.since} · {year - ex.born} years old</dd>
                <dt>Toward us</dt><dd style={{ color: attitudeColor(regardOf(world, ex.houseId, P)) }}>{ex.houseId === P ? 'one of ours' : `${attitude(regardOf(world, ex.houseId, P))} (${regardOf(world, ex.houseId, P)})`}</dd>
              </dl>
            ) : <p className="muted" style={{ margin: 0 }}>The chair is empty. The Great Houses are putting forward candidates.</p>}
            {n.capanna.length ? (
              <>
                <span className="eyebrow" style={{ display: 'block', marginTop: 10 }}><Term k="capanna">The Capanna</Term></span>
                {n.capanna.map((c, i) => <div key={i} style={{ fontSize: 13 }}>{c.personId ? <PersonById id={c.personId} /> : c.name} <span className="muted">· {c.role} · <ArchonHouseLink id={c.houseId} /></span></div>)}
              </>
            ) : null}
          </div>
        </Panel>
        <Panel scroll={380} title="The seats" aside={`next Minor election: ${n.nextElection}`} className="span-6">
          <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 13 }}>
            {n.seats.map((s) => (
              <div key={s} className="row" style={{ gap: 8 }}>
                <span style={{ flex: 1 }}><ArchonHouseLink id={s} />{s === P ? ' (us)' : ''}</span>
                <span className="muted">{a.houses[s]?.tier === 'great' ? 'Great' : 'Minor, elected'}</span>
                <span className="mono" style={{ width: 40, textAlign: 'right', color: s === P ? undefined : attitudeColor(regardOf(world, s, P)) }}>{s === P ? '—' : regardOf(world, s, P)}</span>
              </div>
            ))}
            <span className="muted" style={{ fontSize: 11 }}>Right column: how each seat regards us.</span>
          </div>
        </Panel>
        <Panel fold="open" title="Bring a motion" aside={sponsor === P ? 'through our own seat' : sponsor ? `through House ${houseName(world, sponsor)}` : 'no one will bring it'} className="span-12">
          <div className="body" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select className="select" aria-label="Kind of motion" value={kind} onChange={(e) => { setKind(e.target.value as OurMotion); setTarget(''); setSecond(''); }}>
              <option value="censure">Censure a house</option>
              <option value="commend">Commend a house</option>
              <option value="mediate">End a feud</option>
              <option value="raise">Raise us a Great House</option>
            </select>
            {kind === 'censure' || kind === 'commend' ? (
              <select className="select" aria-label="House" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">House…</option>
                {houses.filter((h) => h.id !== P).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            ) : null}
            {kind === 'mediate' ? (
              <select className="select" aria-label="Feud" value={target && second ? `${target}|${second}` : ''} onChange={(e) => { const [x, y] = e.target.value.split('|'); setTarget(x ?? ''); setSecond(y ?? ''); }}>
                <option value="">Feud…</option>
                {feuds.map(([x, y]) => <option key={`${x}|${y}`} value={`${x}|${y}`}>{houseName(world, x)} and {houseName(world, y)}</option>)}
              </select>
            ) : null}
            {kind === 'raise' && low ? <span className="muted" style={{ fontSize: 12 }}>House {low.name} would stand down ({Math.round(low.prestige)} to our {Math.round(a.houses[P]?.prestige ?? 0)}). Needs eight seats.</span> : null}
            <button type="button" className="btn primary" disabled={!!why} title={why ?? undefined} onClick={() => run((w) => tableMotion(w, kind, target || undefined, second || undefined))}>Table it</button>
            {why ? <span className="muted" style={{ fontSize: 12, flexBasis: '100%' }}>{why}</span> : null}
          </div>
        </Panel>
        <Panel scroll={480} title="Before the Numarade" className="span-12">
          <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {open.length ? open.map((m) => <MotionRow key={m.id} m={m} />) : <span className="muted">Nothing is before them.</span>}
            {past.length ? <span className="eyebrow" style={{ marginTop: 8 }}>Lately decided</span> : null}
            {past.map((m) => <MotionRow key={m.id} m={m} />)}
          </div>
        </Panel>
        <RegisterPanel className="span-12" />
      </div>
    </>
  );
}

// ---------------------------------------------------------------- history and frontier

function LegendHunt({ id }: { id: string }) {
  const world = useWorld();
  const { run } = usePlay();
  const why = whyNoAgent(world);
  return <button type="button" className="btn tiny" disabled={!!why} title={why ?? 'An expedition: 2,000 othes, and a live infiltration'} onClick={() => run((w) => beginLegendHunt(w, id))}>Send someone after it</button>;
}

export function HistoryPage() {
  const world = useWorld();
  const a = world.archon;
  const [kind, setKind] = useState('');
  if (!a) return null;
  const rows = a.history.filter((e) => !kind || e.kind === kind).slice().reverse();
  const kinds = [...new Set(a.history.map((e) => e.kind))];
  return (
    <>
      <Title eyebrow="The Drift Era" title="Annals of the Archon" sub="What the houses remember: Exarchons, wars, champions, Caiges lost, houses founded and ended. Every world has its own." />
      <div className="actions">
        <select className="select" aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Everything</option>
          {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <Go to={{ kind: 'frontier' }} className="btn">The frontier ›</Go>
      </div>
      <div className="grid">
        <Panel fold title="Lost Caiges" aside="legends; perhaps still out there" className="span-12">
          <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
            {a.legends.map((l) => <div key={l.id} className="fline2" style={{ gap: 8, alignItems: 'baseline' }}><strong>{l.name}</strong> <span className="muted">· {l.form} · <ArchonHouseLink id={l.house} />, lost {l.year} · {l.where}</span>{l.found ? <span className="tag">found {l.found}</span> : <LegendHunt id={l.id} />}</div>)}
          </div>
        </Panel>
        <Panel scroll={540} title="The record" aside={`${rows.length} entries`} className="span-12">
          <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
            {rows.map((e, i) => (
              <div key={i} className="row" style={{ gap: 8, alignItems: 'baseline' }}>
                <span className="mono muted" style={{ width: 44, flexShrink: 0 }}>{e.year > 0 ? e.year : 'before'}</span>
                <span className="tag">{e.kind}</span>
                <span style={{ flex: 1 }}>{e.text}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}

export function FrontierPage() {
  const world = useWorld();
  const game = useGame();
  const [err, setErr] = useState<string | null>(null);
  const claim = (id: string) => game.update((w) => { try { setErr(null); return claimWild(w, id); } catch (e) { setErr((e as Error).message); return w; } });
  const a = world.archon;
  if (!a) return null;
  const all = Object.values(a.frontier).sort((x, y) => (x.claimedBy ? 1 : 0) - (y.claimedBy ? 1 : 0) || worthOf(y) - worthOf(x));
  const total = Object.keys(world.planets).length + all.length;
  return (
    <>
      <Title eyebrow="Unclaimed" title="The frontier" sub={`Worlds and moons no house holds. Claim one as an outpost (${CLAIM_COST.othes.toLocaleString('en-US')} othes and ${CLAIM_COST.components} components), hold it three years, and it can be settled into a world of the house. New houses are founded out here too; there can never be more houses than worlds to hold them (${liveHouses(world).length} houses, ${total} worlds known).`} />
      {err ? <p className="error body">{err}</p> : null}
      <div className="grid">
        <Panel scroll={560} title="Worlds and moons" aside={`${openWilds(world).length} unclaimed`} className="span-12">
          <div className="body" style={{ overflowX: 'auto' }}>
            <table className="list">
              <thead><tr><th>World</th><th>Region</th><th>Kind</th><th>Liveable</th><th>Worth</th><th>Hazard</th><th>Held by</th><th></th></tr></thead>
              <tbody>
                {all.map((x) => (
                  <tr key={x.id}>
                    <td title={x.note}>{wildLabel(x)}<div className="muted" style={{ fontSize: 11 }}>{x.note}</div></td>
                    <td>{x.region}</td>
                    <td>{CLIMATE_LABEL[x.climate]}</td>
                    <td className="mono">{bar(x.habitable, 6)}</td>
                    <td className="mono">{Math.round(worthOf(x) * 100)}</td>
                    <td>{HAZARD_LABEL[x.hazard]}</td>
                    <td>{x.claimedBy ? <><ArchonHouseLink id={x.claimedBy} /> <span className="muted">{x.claimedYear}</span></> : <span className="muted">no one</span>}</td>
                    <td>{x.claimedBy ? null : (() => { const why = cannotClaim(world, x.id); return <button type="button" className="btn small" disabled={!!why} title={why ?? 'Claim it as an outpost'} onClick={() => claim(x.id)}>Claim</button>; })()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>Our outposts, and what the frontier sends against them, are kept under Places.</p>
          </div>
        </Panel>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- new game

const PLAYABLE = new Set(['alerion', 'torvann', 'serath', 'shaaliin']);
type Start = 'highroy' | 'knight' | 'councillor' | 'founder';
const STARTS: { id: Start; label: string; note: string; ready: boolean }[] = [
  { id: 'highroy', label: 'Highroy', note: 'Rule the house: its council, its knights, its worlds and its seat.', ready: true },
  { id: 'knight', label: 'A knight', note: 'Serve, rise, and perhaps found a house of your own.', ready: false },
  { id: 'councillor', label: 'A councillor', note: 'Hold one seat on the council and play the court from inside.', ready: false },
  { id: 'founder', label: 'A founder', note: 'Claim a world on the frontier and raise a capital.', ready: false },
];

export function NewGamePage({ setWorld }: { setWorld: (w: World) => void }) {
  const nav = useNav();
  const world = useWorld();
  const [pick, setPick] = useState('alerion');
  const [start, setStart] = useState<Start>('highroy');
  const [seed, setSeed] = useState(() => (world.seed === 'stasia' ? 'stasia' : `${world.seed}`));
  const c = CANON_HOUSES.find((h) => h.id === pick)!;
  const greats = useMemo(() => CANON_HOUSES.filter((h) => h.tier === 'great'), []);
  const minors = useMemo(() => CANON_HOUSES.filter((h) => h.tier === 'minor'), []);
  const card = (h: typeof CANON_HOUSES[number]) => (
    <button key={h.id} type="button" className={`house-pick${pick === h.id ? ' on' : ''}${PLAYABLE.has(h.id) ? '' : ' later'}`} aria-pressed={pick === h.id} onClick={() => setPick(h.id)}>
      <strong>{h.name}</strong>
      <span className="muted">{SPECIES[h.species].name}{h.speciesKnown ? '' : '?'}{PLAYABLE.has(h.id) ? '' : ' · later'}</span>
    </button>
  );
  return (
    <>
      <Title eyebrow="A new chronicle" title="Choose a house" sub="Eighteen houses of the Archon. Four can be played today; the rest are on the register and act on their own, and will open as they are built." />
      <div className="grid">
        <Panel title="Great Houses" className="span-6"><div className="body house-picks">{greats.map(card)}</div></Panel>
        <Panel title="Minor Houses" className="span-6"><div className="body house-picks">{minors.map(card)}</div></Panel>
        <Panel title={`House ${c.name}`} aside={`${c.tier === 'great' ? 'Great' : 'Minor'} · ${SPECIES[c.species].name}${c.vassals ? ` with ${c.vassals.map((v) => SPECIES[v].name).join(', ')} vassals` : ''}`} className="span-7">
          <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ margin: 0 }}>{c.blurb}</p>
            <span className="muted" style={{ fontSize: 12 }}>Known for: {c.focus}. Holds {c.worlds[0] === c.worlds[1] ? c.worlds[0] : `${c.worlds[0]}–${c.worlds[1]}`} worlds.</span>
            <ViewsList views={c.views} />
          </div>
        </Panel>
        <Panel title="Begin as" className="span-5">
          <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {STARTS.map((s) => (
              <label key={s.id} className={`start-pick${s.ready ? '' : ' later'}`}>
                <input type="radio" name="start" value={s.id} checked={start === s.id} disabled={!s.ready} onChange={() => setStart(s.id)} />
                <span><strong>{s.label}</strong>{s.ready ? '' : <span className="muted"> · coming</span>}<br /><span className="muted" style={{ fontSize: 12 }}>{s.note}</span></span>
              </label>
            ))}
            <label className="eyebrow" htmlFor="ng-seed" style={{ marginTop: 6 }}>Seed</label>
            <input id="ng-seed" className="text" value={seed} onChange={(e) => setSeed(e.target.value)} />
            <span className="muted" style={{ fontSize: 11 }}>The same seed builds the same world, history and frontier.</span>
            <button type="button" className="btn primary" disabled={!PLAYABLE.has(pick)} title={PLAYABLE.has(pick) ? undefined : 'Not playable yet'} onClick={() => { setWorld(createWorld(seed.trim() || 'stasia', { house: pick })); nav.to({ kind: 'throne' }); }}>
              {PLAYABLE.has(pick) ? `Begin as Highroy of House ${c.name}` : `House ${c.name} is not playable yet`}
            </button>
          </div>
        </Panel>
      </div>
    </>
  );
}

export { H as houseLabel, riftBetween };
