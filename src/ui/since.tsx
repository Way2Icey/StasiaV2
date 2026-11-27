// "This Orbit": what has changed in the house since about an Orbit ago, at a glance.
import { useWorld } from './context';
import { Go, Panel, PersonById, HouseLink } from './links';
import { orbitAgo, snapshot } from '../sim/since';
import { absoluteCycle } from '../sim/time';
import { Fragment, type ReactNode } from 'react';

const fmt = (n: number) => Math.round(Math.abs(n)).toLocaleString('en-US');

function Move({ d, unit = '', good = 1 }: { d: number; unit?: string; good?: 1 | -1 }) {
  if (!d) return <span className="muted">steady</span>;
  const up = d > 0;
  return <span className={up === (good > 0) ? 'up' : 'down'}>{up ? '▲' : '▼'} {fmt(d)}{unit}</span>;
}

export function ThisOrbit({ className }: { className?: string }) {
  const world = useWorld();
  const was = orbitAgo(world);
  const P = world.playerHouseId;
  if (!was) {
    return (
      <Panel title="This Orbit" className={className}>
        <p className="body muted" style={{ margin: 0 }}>The house has only just begun keeping its accounts. Changes show here after the first Phase.</p>
      </Panel>
    );
  }
  const now = snapshot(world);
  const from = absoluteCycle(was.date);
  const feed = world.feed.filter((e) => absoluteCycle(e.date) >= from);
  const ours = (ids?: string[]) => (ids ?? []).some((id) => world.characters[id]?.houseId === P);
  const deaths = feed.filter((e) => e.kind === 'death' && (ours(e.characterIds) || (e.who ?? []).some((x) => world.characters[x.id]?.houseId === P)));
  const births = feed.filter((e) => e.kind === 'birth' && (ours(e.characterIds) || (e.who ?? []).some((x) => world.characters[x.id]?.houseId === P)));
  const regard = Object.entries(now.regard).map(([h, v]) => ({ h, d: Math.round(v - (was.regard[h] ?? v)) })).filter((x) => x.d).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 3);
  const hearts = Object.entries(now.toLord).map(([id, v]) => ({ id, d: Math.round(v - (was.toLord[id] ?? v)) })).filter((x) => Math.abs(x.d) >= 5).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 3);
  const rows: [string, ReactNode][] = [
    ['Coffers', <><Move d={now.othes - was.othes} /> <span className="muted">· {now.othes.toLocaleString('en-US')} othes</span></>],
    ['Honour', <Move d={now.honour - was.honour} />],
    ['Respect', <Move d={now.respect - was.respect} />],
    ['Dread', <Move d={now.dread - was.dread} />],
    ['Unrest', <Move d={now.unrest - was.unrest} good={-1} />],
    ['People', <Move d={now.people - was.people} />],
    ['Soldiers', <Move d={now.soldiers - was.soldiers} />],
  ];
  return (
    <Panel title="This Orbit" aside="since about an Orbit ago" className={className}>
      <div className="body orbit-grid">
        <dl className="kv" style={{ margin: 0 }}>
          {rows.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}
        </dl>
        <div style={{ display: 'grid', gap: 6, alignContent: 'start', fontSize: 13 }}>
          <span className="eyebrow">Toward us</span>
          {regard.length ? regard.map((r) => <span key={r.h}><HouseLink id={r.h} /> <Move d={r.d} /></span>) : <span className="muted">No house has moved much.</span>}
          <span className="eyebrow">Toward the Highroy</span>
          {hearts.length ? hearts.map((r) => <span key={r.id}><PersonById id={r.id} /> <Move d={r.d} /></span>) : <span className="muted">The house feels as it did.</span>}
          {deaths.length || births.length ? <span className="eyebrow">Born and lost</span> : null}
          {births.map((e, i) => <span key={'b' + i} className="up" style={{ fontSize: 12 }}>{e.text}</span>)}
          {deaths.map((e, i) => <span key={'d' + i} className="down" style={{ fontSize: 12 }}>{e.text}</span>)}
          <span><Go to={{ kind: "log" }}>The full record ›</Go></span>
        </div>
      </div>
    </Panel>
  );
}
