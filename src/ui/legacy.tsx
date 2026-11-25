// The house's legacy: the Hall of its honoured dead, the Annals of what it has done, the Reliquary, the
// Archive of the past, and the road to greatness (with the tide of the Drift and the ages it names).
import { Peek } from './links';
import { useState } from 'react';
import { useGame, useWorld } from './context';
import { Go, Panel, PersonById } from './links';
import { ArchonHouseLink } from './archon';
import { Term } from './tip';
import { ascent, giftRelic } from '../sim/arcs_legacy';
import { ANNALS, ensureLegacy, knownOf, RANK_LABEL, readRelic, relicsOf, renownOf, deedsOf, rankOf, type Relic } from '../sim/legacy';
import { cannotTable, liveHouses, tableMotion, exarchonOf } from '../sim/archon';
import { FRAGMENTS, SLANT_LABEL, THREADS, fragmentsOf, type ThreadId } from '../data/archive';
import type { Character, World } from '../sim/types';

type Tab = 'hall' | 'annals' | 'reliquary' | 'archive' | 'ascent';
const TABS: { k: Tab; label: string }[] = [
  { k: 'hall', label: 'The Hall' }, { k: 'annals', label: 'Annals' }, { k: 'reliquary', label: 'Reliquary' }, { k: 'archive', label: 'Archive' }, { k: 'ascent', label: 'Greatness & the ages' },
];
const KIND_LABEL: Record<Relic['kind'], string> = {
  echoCoin: 'Echo Coin', keepring: 'Keepring Blade', shardsaint: 'Shardsaint', navisign: 'Navisign', banner: 'Lost legion\'s banner', writ: 'Crusade writ', warNavisium: 'War-navisium', stationLog: 'Station log', clrch: 'Marked CLRCH',
};
const READABLE = new Set<Relic['kind']>(['echoCoin', 'writ', 'stationLog', 'banner', 'warNavisium', 'clrch']);

function usePlay() {
  const game = useGame();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: (w: World) => World) => game.update((w) => { try { setErr(null); return fn(w); } catch (e) { setErr((e as Error).message); return w; } });
  return { run, err };
}

export function LegacyPage({ tab: initial }: { tab?: Tab }) {
  const world = useWorld();
  const [tab, setTab] = useState<Tab>(initial ?? 'hall');
  const L = ensureLegacy(world);
  const earned = Object.keys(L.annals).length;
  return (
    <>
      <div className="page-title">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span className="eyebrow gold">What outlasts the people</span>
          <h2>Legacy of House {world.houses[world.playerHouseId]?.name}</h2>
          <p>{L.hall.length} in the Hall · {earned} of {ANNALS.length} Annals · {relicsOf(world).length} relics · {Object.keys(L.archive).length} of {FRAGMENTS.length} fragments of the past</p>
        </div>
      </div>
      <div className="filters" style={{ marginBottom: 12 }}>
        {TABS.map((t) => <button key={t.k} type="button" className="pill" aria-pressed={tab === t.k} onClick={() => setTab(t.k)}>{t.label}</button>)}
      </div>
      <div className="grid">
        {tab === 'hall' ? <HallTab /> : tab === 'annals' ? <AnnalsTab /> : tab === 'reliquary' ? <ReliquaryTab /> : tab === 'archive' ? <ArchiveTab /> : <AscentTab />}
      </div>
    </>
  );
}

function HallTab() {
  const world = useWorld();
  const L = ensureLegacy(world);
  const living = Object.values(world.characters).filter((c) => c.alive && c.houseId === world.playerHouseId && (deedsOf(world, c.id).length || rankOf(world, c.id)))
    .sort((a, b) => renownOf(world, b.id) - renownOf(world, a.id)).slice(0, 12);
  return (
    <>
      <Panel title="The living, by their deeds" className="span-12">
        {living.length ? (
          <div className="table-wrap"><table className="list">
            <thead><tr><th>Who</th><th>Rank</th><th>Deeds</th><th style={{ textAlign: 'right' }}>Weight</th></tr></thead>
            <tbody>{living.map((c) => <LivingRow key={c.id} c={c} />)}</tbody>
          </table></div>
        ) : <p className="body muted" style={{ margin: 0 }}>No one of ours has done anything the house remembers yet.</p>}
      </Panel>
      <Panel title={<Term k="hall">The Hall of the house</Term>} aside="The honoured dead" className="span-12">
        {L.hall.length ? (
          <div className="table-wrap"><table className="list">
            <thead><tr><th>Name</th><th>Died</th><th>Remembered for</th></tr></thead>
            <tbody>{L.hall.map((h) => (
              <tr key={h.id + h.died}>
                <td><PersonById id={h.id} />{h.epithet ? <div className="muted" style={{ fontSize: 11 }}>{h.epithet}</div> : null}<div className="muted" style={{ fontSize: 11 }}>{[h.rank, h.seat ? h.seat : null, h.caige ? `bore ${h.caige}` : null].filter(Boolean).join(' · ')}</div></td>
                <td className="mono">{h.died}<div className="muted" style={{ fontSize: 11 }}>{h.cause}</div></td>
                <td style={{ fontSize: 12 }}>{h.deeds.length ? h.deeds.join('; ') : <span className="muted">a life of service</span>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <p className="body muted" style={{ margin: 0 }}>The Hall is empty. Names come to it when the people who earned them die.</p>}
      </Panel>
    </>
  );
}

function LivingRow({ c }: { c: Character }) {
  const world = useWorld();
  const ds = deedsOf(world, c.id);
  const r = rankOf(world, c.id);
  return (
    <tr>
      <td><PersonById id={c.id} /></td>
      <td>{r ? RANK_LABEL[r] : <span className="muted">—</span>}</td>
      <td style={{ fontSize: 12 }}>{ds.slice(0, 3).map((d) => d.text).join('; ') || <span className="muted">—</span>}{ds.length > 3 ? <span className="muted"> and {ds.length - 3} more</span> : null}</td>
      <td className="mono" style={{ textAlign: 'right' }}>{Math.round(renownOf(world, c.id))}</td>
    </tr>
  );
}

function AnnalsTab() {
  const world = useWorld();
  const L = ensureLegacy(world);
  const shown = ANNALS.filter((a) => L.annals[a.id] || !a.hidden);
  const hidden = ANNALS.length - shown.length;
  return (
    <Panel title={<Term k="houseAnnals">The Annals of the house</Term>} aside={`${Object.keys(L.annals).length} written · ${hidden} not yet guessed at`} className="span-12">
      <div className="table-wrap"><table className="list">
        <tbody>{shown.sort((a, b) => (L.annals[b.id] ? 1 : 0) - (L.annals[a.id] ? 1 : 0)).map((a) => (
          <tr key={a.id} className={L.annals[a.id] ? undefined : 'muted'}>
            <td style={{ width: 28 }}>{L.annals[a.id] ? '◆' : '◇'}</td>
            <td><strong>{a.title}</strong><div style={{ fontSize: 12 }} className="muted">{a.text}</div></td>
            <td className="mono" style={{ textAlign: 'right' }}>{L.annals[a.id]?.year ?? ''}</td>
          </tr>
        ))}</tbody>
      </table></div>
      <p className="body muted" style={{ margin: 0, fontSize: 11 }}>The Annals never close. Some entries are hidden until the house earns them; some can only be earned by losing something first.</p>
    </Panel>
  );
}

function ReliquaryTab() {
  const world = useWorld();
  const { run, err } = usePlay();
  const rs = relicsOf(world);
  const L = ensureLegacy(world);
  const elsewhere = Object.values(L.relics).filter((r) => r.houseId !== world.playerHouseId && r.history.some((h) => /Came to the house|Given|Stolen|Returned/.test(h.text))).slice(0, 8);
  const [to, setTo] = useState('');
  const houses = liveHouses(world).filter((h) => h.id !== world.playerHouseId);
  return (
    <>
      <Panel title={<Term k="reliquary">The Reliquary</Term>} aside="Memory Steels, Navisigns, and older things" className="span-12">
        {err ? <p className="body error" style={{ margin: 0 }}>{err}</p> : null}
        {rs.length ? (
          <div className="table-wrap"><table className="list">
            <thead><tr><th>Relic</th><th>Kind</th><th>Came to us</th><th /></tr></thead>
            <tbody>{rs.map((r) => (
              <tr key={r.id}>
                <td><strong><Peek t={{ k: 'relic', id: r.id }}>{r.name}</Peek></strong><div className="muted" style={{ fontSize: 12 }}>{r.note}</div>{r.bearer ? <div style={{ fontSize: 11 }}>Borne by <PersonById id={r.bearer} /></div> : null}{r.history.length > 1 ? <div className="muted" style={{ fontSize: 11 }}>{r.history.slice(1).map((h) => `${h.year}: ${h.text}`).join(' · ')}</div> : null}</td>
                <td>{KIND_LABEL[r.kind]}</td>
                <td className="mono" style={{ fontSize: 12 }}>{r.found.year}<div className="muted" style={{ fontFamily: 'inherit' }}>{r.origin}</div></td>
                <td>
                  <span className="actions">
                    {READABLE.has(r.kind) && !r.read ? <button type="button" className="btn small" onClick={() => run((w) => readRelic(w, r.id))}>{r.kind === 'echoCoin' ? 'Listen' : 'Read'}</button> : null}
                    {to ? <button type="button" className="btn small" onClick={() => run((w) => giftRelic(w, r.id, to))}>Give</button> : null}
                  </span>
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <p className="body muted" style={{ margin: 0 }}>Nothing yet. Dealers in old things come to court, derelicts from the Silence drift on the frontier, wars leave spoils, and the honoured dead can be given a Keepring.</p>}
        {rs.length && houses.length ? (
          <div className="body" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: 12 }}>To give a relic away, choose who it is for:</span>
            <select className="select" aria-label="House to give to" value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="">choose a house</option>
              {houses.map((h) => <option key={h.id} value={h.id}>House {h.name}</option>)}
            </select>
          </div>
        ) : null}
      </Panel>
      {elsewhere.length ? (
        <Panel title="Known to be elsewhere" className="span-12">
          <div className="table-wrap"><table className="list"><tbody>{elsewhere.map((r) => (
            <tr key={r.id}><td><Peek t={{ k: 'relic', id: r.id }}>{r.name}</Peek></td><td>{r.houseId ? <ArchonHouseLink id={r.houseId} /> : <span className="muted">lost</span>}</td><td className="muted" style={{ fontSize: 12 }}>{r.history[r.history.length - 1]?.text}</td></tr>
          ))}</tbody></table></div>
        </Panel>
      ) : null}
    </>
  );
}

function ArchiveTab() {
  const world = useWorld();
  const L = ensureLegacy(world);
  const [open, setOpen] = useState<ThreadId | null>(null);
  return (
    <Panel title={<Term k="archive">The Archive</Term>} aside="Every fragment came from someone, and everyone had a side" className="span-12">
      {(Object.keys(THREADS) as ThreadId[]).map((t) => {
        const known = knownOf(world, t);
        const all = fragmentsOf(t).length;
        return (
          <div key={t} className="body" style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
            <button type="button" className="btn small" aria-expanded={open === t} onClick={() => setOpen(open === t ? null : t)} disabled={!known.length}>{open === t ? '▾' : '▸'}</button>{' '}
            <strong>{known.length ? THREADS[t].title : '???'}</strong> <span className="muted mono" style={{ fontSize: 12 }}>{known.length}/{THREADS[t].open ? '?' : all}</span>
            <div className="muted" style={{ fontSize: 12 }}>{known.length ? THREADS[t].note : 'Nothing known.'}</div>
            {open === t ? known.map((f) => (
              <blockquote key={f.id} style={{ margin: '8px 0 0', paddingLeft: 12, borderLeft: '2px solid var(--line)' }}>
                <div><strong>{f.title}</strong> <span className="muted" style={{ fontSize: 11 }}>· {f.source} · {SLANT_LABEL[f.slant]} · found {L.archive[f.id]?.year} ({L.archive[f.id]?.via})</span></div>
                <p style={{ margin: '4px 0 0' }}>{f.text}</p>
                {f.disputes && L.archive[f.disputes] ? <div className="muted" style={{ fontSize: 11 }}>Disputes "{FRAGMENTS.find((x) => x.id === f.disputes)?.title}".</div> : null}
              </blockquote>
            )) : null}
          </div>
        );
      })}
    </Panel>
  );
}

function AscentTab() {
  const world = useWorld();
  const { run, err } = usePlay();
  const a = ascent(world);
  const L = ensureLegacy(world);
  const why = cannotTable(world, 'raise');
  const ex = exarchonOf(world);
  const bars = '▁▂▃▄▅▆▇█';
  return (
    <>
      <Panel title="The road to greatness" className="span-6">
        <div className="body" style={{ display: 'grid', gap: 6 }}>
          <span>We are a <strong>{a.tier === 'great' ? 'Great House' : 'Minor House'}</strong>, with standing <span className="mono">{Math.round(a.prestige)}</span>.</span>
          {a.tier === 'minor' && a.lowestGreat ? (
            <>
              <span>The lowest of the Great Houses is <ArchonHouseLink id={a.lowestGreat.id} />, at <span className="mono">{Math.round(a.lowestGreat.prestige)}</span>. To be raised, the Numarade must vote it by a supermajority, and they must stand down.</span>
              <span className="actions">
                <button type="button" className="btn primary small" disabled={!!why} title={why ?? undefined} onClick={() => run((w) => tableMotion(w, 'raise'))}>Petition to be raised</button>
                {why ? <span className="muted" style={{ fontSize: 12 }}>{why}</span> : null}
              </span>
            </>
          ) : a.tier === 'great' ? (
            <span>{a.exarchon ? 'The Exarchon\'s chair is ours. The houses will want it back the day it falls empty.' : <>As a Great House, one of ours can stand for the Exarchon's chair when it falls empty{ex ? <>. It is held now by {ex.personId ? <PersonById id={ex.personId} /> : ex.name}, of <ArchonHouseLink id={ex.houseId} /></> : null}.</>} Great Houses can fall.</span>
          ) : null}
          {err ? <span className="error">{err}</span> : null}
          <span className="muted" style={{ fontSize: 12 }}>Standing comes from worlds, legions, vassals, Caiges, friends in the chamber and the Reliquary. <Go to={{ kind: 'numarade' }}>The Numarade ›</Go></span>
        </div>
      </Panel>
      <Panel title={<Term k="drift">The tide of the Drift</Term>} className="span-6">
        <div className="body" style={{ display: 'grid', gap: 6 }}>
          <span className="mono" style={{ fontSize: 18, letterSpacing: 1 }}>{L.driftHistory.slice(-30).map((v) => bars[Math.min(7, Math.floor(v / 12.5))]).join('') || '—'}</span>
          <span>{L.drift >= 65 ? 'Restless. Caiges change their weight, bearers dream the same dreams.' : L.drift >= 40 ? 'Stirring. The armourers write down more than they used to.' : L.drift >= 25 ? 'Quiet, mostly.' : 'Still. The Caiges are steady.'}</span>
          <span className="muted" style={{ fontSize: 12 }}>No one at court calls it the Drift; they call it instability, or judgment, or nothing at all.</span>
        </div>
      </Panel>
      <Panel title="The ages" aside="As the chroniclers name them" className="span-12">
        {L.eras.length ? (
          <div className="table-wrap"><table className="list"><tbody>{L.eras.slice().reverse().map((e) => (
            <tr key={e.name + e.from}><td><strong>{e.name}</strong><div className="muted" style={{ fontSize: 12 }}>{e.why}</div></td><td className="mono" style={{ textAlign: 'right' }}>{e.from}{e.to ? `–${e.to}` : '–'}</td></tr>
          ))}</tbody></table></div>
        ) : <p className="body muted" style={{ margin: 0 }}>The chroniclers have not named this age yet. They will when it turns.</p>}
      </Panel>
    </>
  );
}

/** On a person's page: rank and deeds. */
export function DeedsLine({ id }: { id: string }) {
  const world = useWorld();
  const ds = deedsOf(world, id);
  const r = rankOf(world, id);
  if (!ds.length && !r) return null;
  return (
    <div className="body" style={{ fontSize: 12 }}>
      {r ? <strong>{RANK_LABEL[r]}. </strong> : null}
      {ds.length ? <span>Remembered for: {ds.slice(0, 4).map((d) => d.text).join('; ')}{ds.length > 4 ? `; and ${ds.length - 4} more` : ''}.</span> : null}
    </div>
  );
}
