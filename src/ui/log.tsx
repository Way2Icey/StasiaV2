// The Log: every record in one place, one line each, the same card for all.
import { Peek } from './links';
import { useMemo, useState } from 'react';
import { useNav, useWorld } from './context';
import { Go, HouseLink, Panel, PersonById, PlanetLink, SectorLink } from './links';
import { classify, involves, SEVERITY_LABEL, SEVERITY_MARK, TYPE_LABEL } from '../sim/records';
import { findSector } from '../sim/query';
import { dateParts, formatDate } from '../sim/time';
import type { FeedEntry, RecordType, World } from '../sim/types';

interface Row { e: FeedEntry; key: string; type: RecordType; severity: number }

function short(d: FeedEntry['date']): string {
  const p = dateParts(d);
  return `${p.year}·${p.orbit}·${String(p.cycleOfOrbit).padStart(2, '0')}`;
}

function placeName(world: World, id?: string): string {
  if (!id) return '';
  return findSector(world, id)?.sector.name ?? world.planets[id]?.name ?? '';
}

function atPlace(world: World, e: FeedEntry, place: string): boolean {
  if (!e.placeId) return false;
  if (e.placeId === place) return true;
  const p = world.planets[place];
  return !!p && p.sectors.some((s) => s.id === e.placeId);
}

function forHouse(world: World, e: FeedEntry, house: string): boolean {
  if (e.houseIds?.includes(house)) return true;
  const ids = [...(e.characterIds ?? []), ...(e.who ?? []).map((w) => w.id)];
  return ids.some((id) => world.characters[id]?.houseId === house);
}

export function LogPage({ person, place, house, open: initial }: { person?: string; place?: string; house?: string; open?: string }) {
  const world = useWorld();
  const nav = useNav();
  const [type, setType] = useState<RecordType | 'all'>('all');
  const [minSev, setMinSev] = useState(person || place || house ? 0 : 1);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(initial ?? null);
  const [shown, setShown] = useState(120);

  const rows: Row[] = useMemo(() => world.feed.map((e, i) => {
    const c = classify(world, e);
    return { e, key: e.id ?? `f${i}`, type: c.type, severity: c.severity };
  }).reverse(), [world]);

  const scoped = rows.filter((r) => (!person || involves(r.e, person)) && (!place || atPlace(world, r.e, place)) && (!house || forHouse(world, r.e, house)));
  const types = Array.from(new Set(scoped.map((r) => r.type))).sort();
  const needle = q.trim().toLowerCase();
  const list = scoped.filter((r) => (type === 'all' || r.type === type) && r.severity >= minSev
    && (!needle || r.e.text.toLowerCase().includes(needle) || (r.e.detail ?? '').toLowerCase().includes(needle)));

  const scope = person ? <>the record of <PersonById id={person} /></> : place ? <>what happened at {findSector(world, place) ? <SectorLink id={place} /> : <PlanetLink id={place} />}</> : house ? <>everything touching <HouseLink id={house} /></> : null;

  return (
    <>
      <div className="page-title">
        <h2>Log</h2>
        <p>Every happening the house knows of, newest first, on the same card. Each says who told us.</p>
      </div>
      <div className="grid">
        <Panel title={scope ? <>Log · {scope}</> : 'The log'} aside={`${list.length} of ${scoped.length} records`} className="major span-12">
          <div className="body" style={{ display: 'grid', gap: 8, paddingBottom: 4 }}>
            {scope ? (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span className="muted">Showing only {scope}.</span>
                <button type="button" className="btn small" onClick={() => nav.to({ kind: 'log' })}>SHOW EVERYTHING</button>
              </div>
            ) : null}
            <div className="filters" style={{ padding: 0 }}>
              <button type="button" className="pill" aria-pressed={type === 'all'} onClick={() => setType('all')}>ALL</button>
              {types.map((t) => <button key={t} type="button" className="pill" aria-pressed={type === t} onClick={() => setType(t)}>{TYPE_LABEL[t].toUpperCase()}</button>)}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="filters" style={{ padding: 0 }}>
                {[0, 1, 2, 3].map((s) => (
                  <button key={s} type="button" className="pill" aria-pressed={minSev === s} onClick={() => setMinSev(s)}>
                    {s === 0 ? 'EVERYTHING' : `${(SEVERITY_LABEL[s] ?? "").toUpperCase()}${s < 3 ? '+' : ''}`}
                  </button>
                ))}
              </div>
              <input className="text" style={{ flex: '1 1 220px', maxWidth: 360 }} placeholder="Search the log…" aria-label="Search the log" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          <div className="log-list" role="list">
            {list.length === 0 ? <p className="body muted" style={{ margin: 0 }}>Nothing matches.</p> : null}
            {list.slice(0, shown).map((r) => (
              <div key={r.key} role="listitem">
                <button type="button" className={`log-row sev${r.severity}`} aria-expanded={open === r.key} onClick={() => setOpen((o) => (o === r.key ? null : r.key))}>
                  <span className="when">{short(r.e.date)}</span>
                  <span className="mark" aria-label={SEVERITY_LABEL[r.severity]}>{SEVERITY_MARK[r.severity]}</span>
                  <span className="type">{TYPE_LABEL[r.type].toUpperCase()}</span>
                  <span className="head">{r.e.text}</span>
                  <span className="where">{placeName(world, r.e.placeId)}</span>
                </button>
                {open === r.key ? <RecordCard row={r} /> : null}
              </div>
            ))}
          </div>
          {list.length > shown ? <div className="body"><button type="button" className="btn small" onClick={() => setShown((n) => n + 200)}>SHOW OLDER ({list.length - shown} more)</button></div> : null}
        </Panel>
      </div>
    </>
  );
}

export function RecordCard({ row }: { row: Row }) {
  const world = useWorld();
  const { e } = row;
  const people = e.who?.length ? e.who : (e.characterIds ?? []).map((id) => ({ id, part: 'named' }));
  const cause = e.causeId ? world.feed.find((x) => x.id === e.causeId) : undefined;
  const ship = e.shipId ? world.ports?.ships[e.shipId] : undefined;
  return (
    <div className="record-card">
      <p style={{ margin: '0 0 8px', fontWeight: 600 }}>{e.text}</p>
      <dl className="kv">
        <dt>When</dt><dd>{formatDate(e.date)}</dd>
        {e.placeId ? <><dt>Where</dt><dd>{findSector(world, e.placeId) ? <SectorLink id={e.placeId} withPlanet /> : <PlanetLink id={e.placeId} />}</dd></> : null}
        <dt>What</dt><dd>{TYPE_LABEL[row.type]} · {SEVERITY_LABEL[row.severity]}</dd>
        {people.length ? <><dt>Who</dt><dd style={{ display: 'grid', gap: 2 }}>{people.map((p) => <span key={p.id + p.part}><PersonById id={p.id} /> <span className="muted">— {p.part}</span></span>)}</dd></> : null}
        {e.houseIds?.length ? <><dt>Houses</dt><dd>{e.houseIds.map((h, i) => <span key={h}>{i ? ', ' : ''}<HouseLink id={h} /></span>)}</dd></> : null}
        {e.detail ? <><dt>Account</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{e.detail}</dd></> : null}
        {e.effects?.length ? <><dt>Effects</dt><dd style={{ display: 'grid', gap: 2 }}>{e.effects.map((x, i) => <span key={i}>› {x}</span>)}</dd></> : null}
        <dt>Source</dt><dd>{e.source ?? "the house's own people"}</dd>
        {e.missionId && world.missions[e.missionId] ? <><dt>Mission</dt><dd><Go to={{ kind: 'mission', id: e.missionId }}>open the mission ›</Go></dd></> : null}
        {ship ? <><dt>Ship</dt><dd><Peek t={{ k: 'portShip', id: ship.id }}>{ship.name} ›</Peek></dd></> : null}
        {cause ? <><dt>Follows from</dt><dd>{cause.text}</dd></> : null}
      </dl>
    </div>
  );
}
