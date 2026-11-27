// The register of ships: every hull of ours by name, its captain, its crew, where it is and who it carries.
// Open any line for its manifest.
import { useState } from 'react';
import { useWorld } from './context';
import { Panel, PersonLink } from './links';
import { ShipLink } from './fleet';
import { CAPITAL_CLASSES, DUTY_LABEL, shipsOf, type CapitalShip } from '../sim/fleet';
import { captainOf, carrying, complement, crewCount, HULL_LABEL, HULL_NOTE, hullsOf, type Hull, type Passage } from '../sim/register';
import { formatDate } from '../sim/time';
import type { World } from '../sim/types';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

function Passengers({ p }: { p: Passage }) {
  const world = useWorld();
  const who = p.ids.map((id) => world.characters[id]).filter((c) => !!c);
  return <>{who.map((c, i) => <span key={c!.id}>{i ? ', ' : ''}<PersonLink c={c!} /></span>)} <span className="muted">({p.why})</span></>;
}

function greatStatus(world: World, s: CapitalShip): { text: string; tone?: string } {
  const p = carrying(world, s.id);
  if (s.ready) return { text: `on the slips · launches ${formatDate(s.ready)}`, tone: 'muted' };
  if (p) return { text: `carrying ${p.ids.length} of ours`, tone: 'gold' };
  if (s.crucible) return { text: 'at the Crucible', tone: 'gold' };
  if (s.watch) return { text: 'on a lane watch' };
  if (s.arrives) return { text: `under way · ${DUTY_LABEL[s.duty].toLowerCase()}` };
  return { text: DUTY_LABEL[s.duty].toLowerCase(), tone: s.duty === 'harbour' ? 'muted' : undefined };
}

function hullStatus(world: World, h: Hull): { text: string; tone?: string } {
  const p = carrying(world, h.id);
  if (p) return { text: `carrying ${p.ids.length} of ours`, tone: 'gold' };
  const f = world.war?.formations[h.formationId];
  if (f?.front) return { text: 'with the fleet at war', tone: 'down' };
  return { text: 'in harbour', tone: 'muted' };
}

/** What a ship is and who is aboard: her captain, her company to the last hand, and her passengers. */
export function Manifest({ ship, hull, here }: { ship?: CapitalShip; hull?: Hull; here?: boolean }) {
  const world = useWorld();
  const id = ship?.id ?? hull!.id;
  const p = carrying(world, id);
  const cap = ship ? captainOf(world, ship) : { name: hull!.captain };
  const capChar = 'id' in cap && cap.id ? world.characters[cap.id] : undefined;
  const crew = ship?.crew ?? hull!.crew;
  const kind = ship ? ship.cls : hull!.type;
  const parts = complement(crew, kind);
  const form = hull ? world.war?.formations[hull.formationId] : undefined;
  const log = ship?.log ?? hull?.log ?? [];
  return (
    <div className="manifest">
      <div className="manifest-head">
        <span className="eyebrow gold">Manifest</span>
        <strong>{ship ? ship.name : hull!.name}</strong>
        <span className="muted">{ship ? CAPITAL_CLASSES[ship.cls].label : HULL_LABEL[hull!.type]}{form ? ` · flies with ${form.name}` : ''} · {ship ? `laid down ${formatDate(ship.built)}` : `on the register since ${formatDate(hull!.built)}`}</span>
      </div>
      <div className="manifest-grid">
        <div>
          <span className="eyebrow">{hull?.type === 'fighter' ? 'Pilot' : 'Captain'}</span>
          <div>{capChar ? <PersonLink c={capChar} /> : cap.name}{ship && !capChar ? <span className="muted"> · sailing master</span> : null}</div>
        </div>
        <div>
          <span className="eyebrow">Company · {fmt(crew)}</span>
          <div className="manifest-crew">{parts.map((x) => <span key={x.label}><strong className="mono">{fmt(x.n)}</strong> <span className="muted">{x.label}</span></span>)}</div>
        </div>
        <div>
          <span className="eyebrow">Aboard</span>
          <div>{p ? <Passengers p={p} /> : <span className="muted">{hull?.type === 'fighter' ? 'carries no one' : 'no one of ours'}</span>}</div>
          {p ? <span className="muted" style={{ fontSize: 11 }}>since {formatDate(p.since)}</span> : null}
        </div>
      </div>
      {hull ? <p className="muted" style={{ margin: 0, fontSize: 11 }}>{HULL_NOTE[hull.type]}</p> : null}
      {log.length ? <div className="manifest-log">{log.slice(0, 5).map((l, i) => <div key={i}><span className="mono muted">{l.year}</span> {l.text}</div>)}</div> : null}
      {ship && !here ? <div><ShipLink s={ship} /> <span className="muted">· her duties, fittings and refits ›</span></div> : null}
    </div>
  );
}

/** Every hull of ours, by type, each line opening its manifest. */
export function RegisterPanel({ className }: { className?: string }) {
  const world = useWorld();
  const P = world.playerHouseId;
  const [open, setOpen] = useState<string | null>(null);
  const great = shipsOf(world, P);
  const hulls = hullsOf(world);
  const guns = hulls.filter((h) => h.type === 'gunship');
  const fighters = hulls.filter((h) => h.type === 'fighter');
  const crew = crewCount(world);
  const out = great.filter((s) => carrying(world, s.id)).length + guns.filter((h) => carrying(world, h.id)).length;
  const line = (id: string, name: string, kind: string, captain: string, n: number, st: { text: string; tone?: string }, body: JSX.Element) => (
    <div key={id} className={`reg-row${open === id ? ' open' : ''}`}>
      <button type="button" className="reg-line" aria-expanded={open === id} onClick={() => setOpen(open === id ? null : id)}>
        <span className="reg-name">{open === id ? '▾' : '▸'} {name}</span>
        <span className="muted reg-kind">{kind}</span>
        <span className="reg-cap">{captain}</span>
        <span className="mono muted reg-crew">{fmt(n)}</span>
        <span className={`reg-st ${st.tone ?? ''}`}>{st.text}</span>
      </button>
      {open === id ? body : null}
    </div>
  );
  return (
    <Panel title="The register" aside={`${great.length + hulls.length} hulls · ${fmt(crew.total)} aboard · ${out} out carrying`} className={className}>
      <div className="reg-head"><span>Ship</span><span>Type</span><span>Captain</span><span style={{ textAlign: 'right' }}>Crew</span><span>Now</span></div>
      <div className="eyebrow reg-sec">Great ships · {great.length}</div>
      {great.map((s) => line(s.id, s.name, CAPITAL_CLASSES[s.cls].label.toLowerCase(), captainOf(world, s).name, s.crew, greatStatus(world, s), <Manifest ship={s} />))}
      <div className="eyebrow reg-sec">Gunships · {guns.length}</div>
      {guns.map((h) => line(h.id, h.name, 'gunship', h.captain, h.crew, hullStatus(world, h), <Manifest hull={h} />))}
      <details className="reg-fighters">
        <summary className="eyebrow reg-sec" style={{ cursor: 'pointer' }}>Fighters · {fighters.length} · {fmt(crew.pilots)} pilots and gunners</summary>
        {fighters.map((h) => line(h.id, h.name, 'fighter', h.captain, h.crew, hullStatus(world, h), <Manifest hull={h} />))}
      </details>
      {world.register?.struck?.length ? (
        <details className="body"><summary className="muted" style={{ cursor: 'pointer' }}>Struck from the register · {world.register.struck.length}</summary>
          {world.register.struck.map((x, i) => <div key={i} className="row"><span style={{ flex: 1 }}>{x.name} <span className="muted">· {HULL_LABEL[x.type].toLowerCase()} · {x.how}</span></span><span className="mono muted">{x.year}</span></div>)}
        </details>
      ) : null}
      <p className="body muted" style={{ margin: 0, fontSize: 12 }}>Whoever of ours goes out takes a ship: envoys a cruiser, the Champion a destroyer, knights a gunship, the Spymaster's people a destroyer when one is free. A ship carrying someone is not on a duty; give her one and they go on in another ship.</p>
    </Panel>
  );
}
