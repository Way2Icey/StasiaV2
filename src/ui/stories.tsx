// The house's stories: arcs under way, the long struggles and who we have set to them, and the threads
// left hanging on people.
import { useState } from 'react';
import { useGame, useWorld } from './context';
import { Panel, PersonById, PersonLink } from './links';
import { Term } from './tip';
import { formatDate, absoluteCycle } from '../sim/time';
import { openArcs, openStruggles, openThreads, THREAD_LABEL, type Struggle } from '../sim/storystate';
import { cannotJoin, joinStruggle, leaveStruggle, oursPush, STRUGGLE, MAX_ON_STRUGGLE } from '../sim/story';
import { displayName } from '../sim/names';
import type { World } from '../sim/types';

function Meter({ v }: { v: number }) {
  const left = v >= 0 ? 50 : 50 + v / 2;
  return <div className="meter" role="img" aria-label={`${Math.round(v)} of 100`}><span className="mid" /><span className="fill" style={{ left: `${left}%`, width: `${Math.abs(v) / 2}%` }} /></div>;
}

function StruggleRow({ s }: { s: Struggle }) {
  const world = useWorld();
  const game = useGame();
  const [pick, setPick] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const can = Object.values(world.characters).filter((c) => c.alive && c.houseId === world.playerHouseId && c.tier === 'full' && !cannotJoin(world, s, c.id));
  const ours = oursPush(world, s);
  const trend = ours - s.theirs.strength;
  const run = (fn: (w: World) => World) => game.update((w) => { try { setErr(null); return fn(w); } catch (e) { setErr((e as Error).message); return w; } });
  return (
    <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
      <span style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <strong>{s.title}</strong>
        <span className="muted" style={{ fontSize: 12 }}>since {formatDate(s.since)} · against {s.theirs.known && s.theirs.personId ? <PersonById id={s.theirs.personId} /> : s.theirs.name} · {Math.round(s.meter) >= 0 ? '+' : ''}{Math.round(s.meter)} · {trend > 2 ? 'turning our way' : trend < -2 ? 'slipping away' : 'in the balance'}</span>
      </span>
      <Meter v={s.meter} />
      <span className="muted" style={{ fontSize: 12 }}>{STRUGGLE[s.kind].note} At +100: {STRUGGLE[s.kind].ours}. At −100: {STRUGGLE[s.kind].theirs}.</span>
      <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
        <span className="eyebrow">On it</span>
        {s.kind === 'madness' && s.cast.personId ? <span><PersonById id={s.cast.personId} /> <span className="muted">(the bearer)</span></span> : null}
        {s.ours.length === 0 && s.kind !== 'madness' ? <span className="muted">No one. It is slipping.</span> : null}
        {s.ours.map((id) => <span key={id}><PersonById id={id} /> <button type="button" className="linklike muted" onClick={() => run((w) => leaveStruggle(w, s.id, id))} aria-label="Take them off it">✕</button></span>)}
        {s.ours.length < MAX_ON_STRUGGLE && can.length ? (
          <>
            <select className="select" aria-label={`Set someone to ${s.title}`} value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Set someone to it…</option>
              {can.sort((a, b) => STRUGGLE[s.kind].stats.reduce((t, x) => t + b.stats[x] - a.stats[x], 0)).slice(0, 14).map((c) => <option key={c.id} value={c.id}>{displayName(c.name)} · {STRUGGLE[s.kind].stats.map((x) => c.stats[x]).join('/')}</option>)}
            </select>
            <button type="button" className="btn small" disabled={!pick} onClick={() => { run((w) => joinStruggle(w, s.id, pick)); setPick(''); }}>Set to it</button>
          </>
        ) : null}
      </span>
      {err ? <span className="error" style={{ fontSize: 12 }}>{err}</span> : null}
    </div>
  );
}

export function StoriesPanel({ className }: { className?: string }) {
  const world = useWorld();
  const arcs = openArcs(world);
  const strs = openStruggles(world);
  const done = (world.story?.arcs ?? []).filter((a) => !a.open && a.stages.length > 1).slice(0, 4);
  const now = absoluteCycle(world.date);
  if (!arcs.length && !strs.length && !done.length) return null;
  return (
    <Panel title={<Term k="arc">Stories under way</Term>} aside={`${arcs.length} arc${arcs.length === 1 ? '' : 's'} · ${strs.length} struggle${strs.length === 1 ? '' : 's'}`} className={className}>
      {strs.map((s) => <StruggleRow key={s.id} s={s} />)}
      {arcs.map((a) => (
        <div key={a.id} className="row">
          <span style={{ flex: 1 }}>
            <strong>{a.title}</strong>
            {a.cast.personId ? <> · <PersonById id={a.cast.personId} /></> : null}
            <span className="muted" style={{ fontSize: 12 }}> · {a.stages.map((x) => x.choice.toLowerCase()).join(' → ') || 'just begun'}</span>
          </span>
          <span className="muted" style={{ fontSize: 12 }}>{a.next ? (absoluteCycle(a.next.at) - now <= 8 ? 'soon' : 'more to come') : 'waiting on you'}</span>
        </div>
      ))}
      {done.length ? <div className="row"><span className="eyebrow">Lately ended</span></div> : null}
      {done.map((a) => (
        <div key={a.id} className="row">
          <span style={{ flex: 1, fontSize: 13 }}>{a.title}{a.cast.personId ? <> · <PersonById id={a.cast.personId} /></> : null} <span className="muted">· {a.stages.map((x) => x.choice.toLowerCase()).join(' → ')}</span></span>
          <span className="muted" style={{ fontSize: 12 }}>{a.ending}</span>
        </div>
      ))}
    </Panel>
  );
}

/** Threads left on one person, and the stories they are part of. */
export function ThreadsPanel({ id }: { id: string }) {
  const world = useWorld();
  const threads = openThreads(world, id);
  const arcs = (world.story?.arcs ?? []).filter((a) => a.cast.personId === id || a.cast.secondId === id).slice(0, 5);
  const strs = (world.story?.struggles ?? []).filter((s) => s.ours.includes(id) || s.cast.personId === id || s.theirs.personId === id).slice(0, 4);
  if (!threads.length && !arcs.length && !strs.length) return null;
  return (
    <Panel title={<Term k="thread">Threads &amp; stories</Term>} aside={`${threads.length} open`}>
      {threads.map((t) => (
        <div key={t.id} className="row">
          <span style={{ flex: 1, fontSize: 13 }}><span className="eyebrow" style={{ marginRight: 8 }}>{THREAD_LABEL[t.kind]}</span>{t.text}{t.about && world.characters[t.about] ? <> · <PersonLink c={world.characters[t.about]!} /></> : null}</span>
          <span className="muted" style={{ fontSize: 11 }}>{formatDate(t.since)}</span>
        </div>
      ))}
      {strs.map((s) => <div key={s.id} className="row"><span style={{ fontSize: 13 }}><span className="eyebrow" style={{ marginRight: 8 }}>Struggle</span>{s.title} · {s.ended ? s.ended.text : `${Math.round(s.meter)}`}</span></div>)}
      {arcs.map((a) => <div key={a.id} className="row"><span style={{ fontSize: 13 }}><span className="eyebrow" style={{ marginRight: 8 }}>Arc</span>{a.title} · <span className="muted">{a.stages.map((x) => x.choice.toLowerCase()).join(' → ')}{a.open ? '' : ` · ${a.ending}`}</span></span></div>)}
    </Panel>
  );
}
