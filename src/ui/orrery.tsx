// The Realm as an orrery: our system in its rings, a world and what circles it, then one place, with who runs
// it and what it yields. Each click zooms one level in; the breadcrumb goes back out.
import { useState, type CSSProperties } from 'react';
import { useWorld } from './context';
import { Go, Panel, PersonById, PersonLink } from './links';
import { Peek } from './links';
import { phaseLedger } from '../sim/economy';
import { modulesOf, MODULE_LABEL } from '../sim/holdings';
import { shipsOf } from '../sim/fleet';
import { sitesOf, SITE_LABEL } from '../sim/places';
import { familyHead } from '../sim/query';
import { orbitAgo } from '../sim/since';
import { worthOf } from '../sim/frontier';
import { CLAIM_COST } from '../sim/arcs_places';
import type { Planet, Sector, World } from '../sim/types';

type Level = { at: 'system' } | { at: 'world'; planet: string } | { at: 'place'; planet: string; sector: string } | { at: 'site'; site: string };
type Layer = 'unrest' | 'yields';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${fmt(Math.abs(n))}`;
const unrestTone = (u: number) => (u >= 30 ? 'var(--orange)' : u >= 15 ? 'var(--gold)' : 'var(--green)');
const held = (s: Sector) => !!s.controllerFamilyId;
const takingsOf = (w: World, sectorId: string) => phaseLedger(w, w.playerHouseId).filter((l) => l.sectorId === sectorId && l.resource === 'othes').reduce((n, l) => n + l.amount, 0);
const worldUnrest = (p: Planet) => { const s = p.sectors.filter(held); return s.length ? Math.round(s.reduce((n, x) => n + x.unrest, 0) / s.length) : 0; };

/** A body on a ring, placed by angle. */
function Body({ size, angle, ring, label, sub, color, dashed, onClick, glow }: { size: number; angle: number; ring: number; label: string; sub?: string; color: string; dashed?: boolean; onClick?: () => void; glow?: boolean }) {
  const x = 50 + (ring / 2) * Math.cos(angle), y = 50 + (ring / 2) * Math.sin(angle);
  const style: CSSProperties = { left: `${x}%`, top: `${y}%` };
  return (
    <button type="button" className="orb-body" style={style} onClick={onClick} title={sub ? `${label} · ${sub}` : label}>
      <span className="orb-dot" style={{ width: size, height: size, borderColor: color, borderStyle: dashed ? 'dashed' : 'solid', boxShadow: glow ? `0 0 14px -2px ${color}` : undefined }} />
      <span className="orb-label">{label}</span>
      {sub ? <span className="orb-sub" style={{ color }}>{sub}</span> : null}
    </button>
  );
}

export function OrreryPage() {
  const world = useWorld();
  const P = world.playerHouseId;
  const [lv, setLv] = useState<Level>({ at: 'system' });
  const [layer, setLayer] = useState<Layer>('unrest');
  const planets = Object.values(world.planets).filter((p) => p.houseId === P);
  const sites = sitesOf(world, P);
  const outposts = Object.values(world.archon?.frontier ?? {}).filter((x) => x.claimedBy === P);
  const open = Object.values(world.archon?.frontier ?? {}).filter((x) => !x.claimedBy).sort((a, b) => worthOf(b) - worthOf(a)).slice(0, 3);
  const crumb = (
    <nav className="orb-crumb">
      <button type="button" className="linklike" onClick={() => setLv({ at: 'system' })}>Our system</button>
      {lv.at === 'world' || lv.at === 'place' ? <><span className="muted">›</span><button type="button" className="linklike" onClick={() => setLv({ at: 'world', planet: lv.planet })}>{world.planets[lv.planet]?.name}</button></> : null}
      {lv.at === 'place' ? <><span className="muted">›</span><span className="gold">{world.planets[lv.planet]?.sectors.find((s) => s.id === lv.sector)?.name}</span></> : null}
      {lv.at === 'site' ? <><span className="muted">›</span><span className="gold">{world.places?.sites[lv.site]?.name}</span></> : null}
      <span className="filters" style={{ marginLeft: 'auto' }}>
        <span className="eyebrow" style={{ alignSelf: 'center' }}>Show</span>
        <button type="button" className="pill" aria-pressed={layer === 'unrest'} onClick={() => setLayer('unrest')}>Unrest</button>
        <button type="button" className="pill" aria-pressed={layer === 'yields'} onClick={() => setLayer('yields')}>Takings</button>
      </span>
    </nav>
  );
  return (
    <>
      <div className="page-title">
        <h2>The Realm</h2>
        <p>Our worlds, stations and outposts in their orbits. Click a world to see what circles it, and a place to see who runs it and what it yields.</p>
      </div>
      {crumb}
      {lv.at === 'system' ? <SystemView planets={planets} layer={layer} go={setLv} sites={sites.map((s) => s.id)} outposts={outposts.map((o) => o.id)} open={open.map((o) => o.id)} /> : null}
      {lv.at === 'world' ? <WorldView planet={world.planets[lv.planet]!} layer={layer} go={setLv} /> : null}
      {lv.at === 'place' ? <PlaceView planet={world.planets[lv.planet]!} sectorId={lv.sector} /> : null}
      {lv.at === 'site' ? <SiteView id={lv.site} /> : null}
    </>
  );
}

function SystemView({ planets, layer, go, sites, outposts, open }: { planets: Planet[]; layer: Layer; go: (l: Level) => void; sites: string[]; outposts: string[]; open: string[] }) {
  const world = useWorld();
  const ago = orbitAgo(world);
  void ago;
  const tag = (p: Planet) => (layer === 'unrest' ? { sub: `unrest ${worldUnrest(p)}`, color: unrestTone(worldUnrest(p)) } : { sub: signed(p.sectors.reduce((n, s) => n + takingsOf(world, s.id), 0)), color: 'var(--gold)' });
  const worst = [...planets].sort((a, b) => worldUnrest(b) - worldUnrest(a))[0];
  return (
    <div className="orb-layout">
      <div className="orb-stage">
        <span className="orb-ring" style={{ width: '38%', height: '38%' }} />
        <span className="orb-ring" style={{ width: '64%', height: '64%' }} />
        <span className="orb-ring dashed" style={{ width: '92%', height: '92%' }} />
        <span className="orb-sun" />
        {planets.map((p, i) => { const t = tag(p); return <Body key={p.id} size={i === 0 ? 34 : 24} angle={-Math.PI / 6 + i * (Math.PI * 2 / Math.max(3, planets.length))} ring={38} label={p.name} sub={t.sub} color={t.color} glow={p === worst && worldUnrest(p) >= 15} onClick={() => go({ at: 'world', planet: p.id })} />; })}
        {sites.map((id, i) => { const s = world.places!.sites[id]!; return <Body key={id} size={16} angle={Math.PI / 3 + i * 1.1} ring={64} label={s.name} sub={s.overseerId ? SITE_LABEL[s.kind].toLowerCase() : 'no overseer'} color={s.overseerId ? 'var(--blue)' : 'var(--gold)'} onClick={() => go({ at: 'site', site: id })} />; })}
        {outposts.map((id, i) => { const x = world.archon!.frontier[id]!; const site = Object.values(world.places?.sites ?? {}).find((s) => s.wildId === id); return <Body key={id} size={16} angle={Math.PI + i * 0.8} ring={92} label={x.name} sub="our outpost" color="var(--green)" onClick={site ? () => go({ at: 'site', site: site.id }) : undefined} />; })}
        {open.map((id, i) => { const x = world.archon!.frontier[id]!; return <Body key={id} size={12} angle={Math.PI * 1.55 + i * 0.45} ring={92} label={x.name} sub={`worth ${Math.round(worthOf(x) * 100)}`} color="var(--line)" dashed /> ; })}
      </div>
      <Panel title="The system" aside={`${planets.length} worlds · ${sites.length} stations · ${outposts.length} outposts`} className="orb-side">
        <div className="body" style={{ display: 'grid', gap: 2, fontSize: 13 }}>
          {planets.map((p) => (
            <button key={p.id} type="button" className={`orb-row${p === worst && worldUnrest(p) >= 15 ? ' lead' : ''}`} onClick={() => go({ at: 'world', planet: p.id })}>
              <span>{p.name} <span className="muted">· {p.sectors.filter(held).length} places</span></span>
              <span style={{ color: unrestTone(worldUnrest(p)) }}>unrest {worldUnrest(p)}</span>
            </button>
          ))}
          {sites.map((id) => { const s = world.places!.sites[id]!; return (
            <button key={id} type="button" className={`orb-row${!s.overseerId ? ' lead' : ''}`} onClick={() => go({ at: 'site', site: id })}>
              <span>{s.name} <span className="muted">· {SITE_LABEL[s.kind].toLowerCase()}</span></span>
              <span className={s.overseerId ? 'muted' : 'gold'}>{s.overseerId ? `garrison ${fmt(s.garrison)}` : 'no overseer'}</span>
            </button>
          ); })}
          <span className="eyebrow" style={{ marginTop: 8 }}>The frontier</span>
          {open.map((id) => { const x = world.archon!.frontier[id]!; return <div key={id} className="orb-row static"><span>{x.name}</span><span className="muted">worth {Math.round(worthOf(x) * 100)} · {fmt(CLAIM_COST.othes)}</span></div>; })}
          <div className="actions" style={{ marginTop: 6 }}><Go to={{ kind: 'frontier' }} className="btn small">All the frontier ›</Go><Go to={{ kind: 'places' }} className="btn small">Places to take ›</Go><Go to={{ kind: 'build' }} className="btn small">Build ›</Go></div>
        </div>
      </Panel>
    </div>
  );
}

function WorldView({ planet, layer, go }: { planet: Planet; layer: Layer; go: (l: Level) => void }) {
  const world = useWorld();
  const P = world.playerHouseId;
  const secs = planet.sectors.filter(held);
  const docked = shipsOf(world, P).filter((s) => planet.sectors.some((x) => x.id === s.sectorId));
  const worst = [...secs].sort((a, b) => b.unrest - a.unrest)[0];
  return (
    <div className="orb-layout">
      <div className="orb-stage">
        <span className="orb-ring" style={{ width: '62%', height: '62%' }} />
        <span className="orb-ring" style={{ width: '88%', height: '88%' }} />
        <span className="orb-planet"><strong>{planet.name}</strong></span>
        {secs.map((s, i) => <Body key={s.id} size={s.port !== 'none' ? 22 : 16} angle={-Math.PI / 2 + i * (Math.PI * 2 / Math.max(1, secs.length))} ring={i % 2 ? 88 : 62} label={s.name} sub={layer === 'unrest' ? `unrest ${s.unrest}` : signed(takingsOf(world, s.id))} color={layer === 'unrest' ? unrestTone(s.unrest) : 'var(--gold)'} glow={s === worst && s.unrest >= 20} onClick={() => go({ at: 'place', planet: planet.id, sector: s.id })} />)}
      </div>
      <Panel title={planet.name} aside={`${secs.length} places · ${fmt(secs.reduce((n, s) => n + s.population, 0))} people`} className="orb-side">
        <div className="body" style={{ display: 'grid', gap: 2, fontSize: 13 }}>
          <span className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{planet.description}</span>
          {secs.map((s) => (
            <button key={s.id} type="button" className={`orb-row${s === worst && s.unrest >= 20 ? ' lead' : ''}`} onClick={() => go({ at: 'place', planet: planet.id, sector: s.id })}>
              <span>{s.name}</span>
              <span><span className="mono" style={{ color: unrestTone(s.unrest) }}>unrest {s.unrest}</span> <span className="muted">· {signed(takingsOf(world, s.id))}</span></span>
            </button>
          ))}
          {docked.length ? <span className="muted" style={{ fontSize: 12, marginTop: 6 }}>In orbit: {docked.map((s) => s.name).join(', ')}</span> : null}
          <div className="actions" style={{ marginTop: 6 }}><Go to={{ kind: 'planet', id: planet.id }} className="btn small">The world's page ›</Go></div>
        </div>
      </Panel>
    </div>
  );
}

function PlaceView({ planet, sectorId }: { planet: Planet; sectorId: string }) {
  const world = useWorld();
  const P = world.playerHouseId;
  const s = planet.sectors.find((x) => x.id === sectorId)!;
  const fam = s.controllerFamilyId ? world.families[s.controllerFamilyId] : undefined;
  const head = s.controllerFamilyId ? familyHead(world, s.controllerFamilyId) : undefined;
  const lines = phaseLedger(world, P).filter((l) => l.sectorId === s.id);
  const mods = modulesOf(world, P).filter((m) => m.sectorId === s.id);
  const ships = shipsOf(world, P).filter((x) => x.sectorId === s.id);
  const recent = world.feed.filter((e) => e.placeId === s.id).slice(-3).reverse();
  const unowned = s.quarters.filter((q) => !q.overseerId && lines.some((l) => l.quarterId === q.id && l.amount > 0));
  return (
    <div className="grid">
      <Panel title={s.name} aside={`${planet.name} · ${fmt(s.population)} people`} className="span-7">
        <div className="body" style={{ display: 'grid', gap: 6, fontSize: 13 }}>
          <span>Held by {fam ? <>the {fam.name} family{head ? <> · head <PersonLink c={head} /></> : null}</> : 'no one'} · <span style={{ color: unrestTone(s.unrest) }}>unrest {s.unrest}</span> · port {s.port}</span>
          <span className="eyebrow" style={{ marginTop: 6 }}>Quarters</span>
          {s.quarters.map((q) => {
            const take = lines.filter((l) => l.quarterId === q.id).map((l) => `${l.amount > 0 ? '+' : ''}${fmt(l.amount)} ${l.resource}`).join(', ');
            return (
              <div key={q.id} className={`front-row${unowned.includes(q) ? ' lead' : ''}`}>
                <span>{q.name} <span className="muted">· {q.kind}</span></span>
                <span>{q.overseerId ? <PersonById id={q.overseerId} /> : <span className="gold">no overseer</span>} <span className="muted">· {take || q.gives}</span></span>
              </div>
            );
          })}
          {lines.filter((l) => l.kind === 'tax').map((l, i) => <div key={i} className="front-row"><span>Taxes</span><span>+{fmt(l.amount)}</span></div>)}
        </div>
      </Panel>
      <Panel title="Here" className="span-5">
        <div className="body" style={{ display: 'grid', gap: 8, fontSize: 13 }}>
          <span><span className="muted">Built</span> {mods.length ? mods.map((m) => `${MODULE_LABEL[m.kind]} L${m.level}`).join(' · ') : 'nothing yet'}</span>
          <span><span className="muted">Docked</span> {ships.length ? ships.map((x) => x.name).join(', ') : 'no great ships'}</span>
          {recent.length ? <><span className="eyebrow">Lately</span>{recent.map((e, i) => <span key={i} className="muted" style={{ fontSize: 12 }}>{e.text}</span>)}</> : null}
          <div className="actions">
            {unowned.length ? <Go to={{ kind: 'sector', id: s.id }} className="btn small lead">Name an overseer ›</Go> : null}
            <Go to={{ kind: 'build' }} className="btn small">Build here ›</Go>
            {s.port !== 'none' ? <Go to={{ kind: 'port', id: s.id }} className="btn small">The port ›</Go> : null}
            <Go to={{ kind: 'sector', id: s.id }} className="btn small">Full page ›</Go>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function SiteView({ id }: { id: string }) {
  const world = useWorld();
  const s = world.places?.sites[id];
  if (!s) return null;
  return (
    <Panel title={s.name} aside={`${SITE_LABEL[s.kind]} · ${s.region}`}>
      <div className="body" style={{ display: 'grid', gap: 8, fontSize: 13 }}>
        <span className="muted">{s.note}</span>
        <span><span className="muted">Overseer</span> {s.overseerId ? <PersonById id={s.overseerId} /> : <span className="gold">none</span>} · <span className="muted">garrison</span> {fmt(s.garrison)} · <span className="muted">defence</span> {Math.round(s.defence)}</span>
        <span><span className="muted">Yields</span> {Object.entries(s.yields).filter(([, v]) => v).map(([k, v]) => `${fmt(v!)} ${k}`).join(', ') || 'nothing'} · <span className="muted">upkeep</span> {fmt(s.upkeep)}</span>
        <div className="actions"><Peek t={{ k: 'site', id: s.id }} className={`btn small${s.overseerId ? '' : ' lead'}`}>Run it ›</Peek></div>
      </div>
    </Panel>
  );
}
