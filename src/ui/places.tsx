// The places of the Archon that are not worlds: what we hold, what others hold that we could take, the
// frontier, the sites of the past, and the landmarks of the canon. Each place opens as a card with
// everything that can be done there.
import type { ReactNode } from 'react';
import { useWorld } from './context';
import { Go, Panel, Peek, PersonById } from './links';
import { ArchonHouseLink } from './archon';
import { SITE_LABEL, siteDefence, sitesOf, type Site } from '../sim/places';
import { CLAIM_COST } from '../sim/arcs_places';
import { atWar } from '../sim/war';
import { CLIMATE_LABEL, HAZARD_LABEL, worthOf } from '../sim/frontier';
import { absoluteCycle } from '../sim/time';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const yieldsText = (s: Site) => Object.entries(s.yields).filter(([, v]) => v).map(([k, v]) => `${k === 'othes' ? fmt(v!) : v} ${k}`).join(', ') || 'nothing';

function Row({ s, children }: { s: Site; children?: ReactNode }) {
  return (
    <div className="row" style={{ gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
      <span style={{ flex: '1 1 260px' }}><strong><Peek t={{ k: 'site', id: s.id }}>{s.name}</Peek></strong> <span className="muted">· {SITE_LABEL[s.kind].toLowerCase()} · {s.region}</span></span>
      {children}
    </div>
  );
}

export function PlacesPage() {
  const world = useWorld();
  const P = world.playerHouseId;
  const sites = Object.values(world.places?.sites ?? {});
  const ours = sitesOf(world, P);
  const theirs = sites.filter((s) => s.known && s.holdable && s.holder && s.holder !== P).sort((a, b) => Number(atWar(world, P, b.holder!)) - Number(atWar(world, P, a.holder!)));
  const ruins = sites.filter((s) => s.known && s.kind === 'ruin');
  const marks = sites.filter((s) => s.known && (s.kind === 'landmark' || s.kind === 'moving'));
  const free = Object.values(world.archon?.frontier ?? {}).filter((x) => !x.claimedBy).sort((a, b) => worthOf(b) - worthOf(a));
  const now = absoluteCycle(world.date);
  return (
    <>
      <div className="page-title">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span className="eyebrow gold">Beyond the worlds</span>
          <h2>Places of the Archon</h2>
          <p>Stations held and stations to take, outposts on the frontier, the sites of the past, and the landmarks every house knows. Open a place to run it, take it, or explore it.</p>
        </div>
      </div>
      <div className="grid">
        <Panel title="Our places" aside={`${ours.length}`} className="span-6">
          {ours.length ? ours.map((s) => (
            <Row key={s.id} s={s}>
              <span className="muted mono" style={{ fontSize: 12 }}>{yieldsText(s)} · garrison {fmt(s.garrison)}{s.overseerId ? <> · <PersonById id={s.overseerId} /></> : null}{s.takenFrom ? ' · contested' : ''}</span>
              {s.overseerId ? null : <Peek t={{ k: 'site', id: s.id }} className={`btn small${s.id === ours.find((x) => !x.overseerId)?.id ? ' lead' : ''}`}>Name an overseer</Peek>}
            </Row>
          )) : <div className="body muted">The house holds no places beyond its worlds.</div>}
        </Panel>
        <Panel title="Places others hold" aside={`${theirs.length} known`} className="span-6">
          {theirs.map((s) => (
            <Row key={s.id} s={s}>
              <span className="muted" style={{ fontSize: 12 }}><ArchonHouseLink id={s.holder!} /> · defence {Math.round(siteDefence(world, s))}{s.takenFrom?.houseId === P ? ' · it was ours' : ''}</span>
              {atWar(world, P, s.holder!) ? <Peek t={{ k: 'site', id: s.id }} className="btn small primary">Plan an assault</Peek> : null}
            </Row>
          ))}
          <p className="body muted" style={{ margin: 0, fontSize: 12 }}>In war, ships in harbour can carry troops against a place of the house we fight.</p>
        </Panel>
        <Panel title="Sites of the past" aside={`${ruins.length} known`} className="span-6">
          {ruins.length ? ruins.map((s) => {
            const away = world.places!.expeditions.find((e) => e.siteId === s.id);
            return <Row key={s.id} s={s}><span className="muted" style={{ fontSize: 12 }}>{s.explored ? 'explored' : away ? <><PersonById id={away.personId} /> is there</> : 'unexplored'}</span></Row>;
          }) : <div className="body muted">None charted yet. Surveyors bring word of them.</div>}
        </Panel>
        <Panel title="The frontier" aside={`${free.length} unclaimed`} className="span-6">
          <p className="body" style={{ margin: 0 }}>Best unclaimed: {free.slice(0, 3).map((x, i) => <span key={x.id}>{i ? ' · ' : ''}{x.name} <span className="muted">({CLIMATE_LABEL[x.climate].toLowerCase()}, {HAZARD_LABEL[x.hazard].toLowerCase()})</span></span>)}</p>
          <p className="body muted" style={{ margin: 0, fontSize: 12 }}>An outpost costs {fmt(CLAIM_COST.othes)} othes and {CLAIM_COST.components} components, gives what its world has, and draws corsairs, Breakline and worse. Held three years, it can be settled into a world of the house.</p>
          <div className="actions body"><Go to={{ kind: 'frontier' }} className="btn small">The whole frontier, and claims ›</Go></div>
        </Panel>
        <Panel title="Landmarks" className="span-12">
          {marks.map((s) => (
            <Row key={s.id} s={s}>
              <span className="muted" style={{ fontSize: 12 }}>{s.kind === 'moving' ? (s.sightedUntil && s.sightedUntil > now ? 'sighted now' : 'whereabouts unknown') : s.holder ? <ArchonHouseLink id={s.holder} /> : 'held by no one'}</span>
            </Row>
          ))}
        </Panel>
      </div>
    </>
  );
}
