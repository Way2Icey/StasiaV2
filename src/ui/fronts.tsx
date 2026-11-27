// Arms as three fronts: the ground, the void and honour. Each column has its one big number, its people and its
// next step; open a column and its whole working opens beneath. A war, when there is one, runs across all three.
import { useState } from 'react';
import { useWorld } from './context';
import { Go, PersonById } from './links';
import { passagesOf, shipKind, shipLabel } from '../sim/register';
import { absoluteCycle, formatDate } from '../sim/time';
import { MilitaryPage } from './military';
import { FleetPage, KnightsPage } from './sections';
import { GroundsPage } from './grounds';
import { CruciblePage } from './crucible';
import { formationsOf, warsOf } from '../sim/war';
import { troopsOf } from '../sim/crucible';
import { shipsOf } from '../sim/fleet';
import { carrying, crewCount, hullsOf } from '../sim/register';
import { regardOf, liveHouses } from '../sim/archon';
import { grievances } from '../sim/war';
import { isAway } from '../sim/court';
import { ordinal } from '../sim/rankings';
import { tableOf } from './rankings';
import { phaseLedger } from '../sim/economy';
import type { Character } from '../sim/types';

export type Front = 'ground' | 'void' | 'honour';
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export function FrontsPage({ front: initial }: { front?: Front }) {
  const world = useWorld();
  const P = world.playerHouseId;
  const [open, setOpen] = useState<Front | null>(initial ?? null);
  const forms = formationsOf(world, P);
  const land = forms.filter((f) => f.kind !== 'fleet');
  const soldiers = land.reduce((n, f) => n + f.strength, 0);
  const garrisons = troopsOf(world, P);
  const fleets = forms.filter((f) => f.kind === 'fleet');
  const ships = shipsOf(world, P);
  const hulls = hullsOf(world);
  const gunships = hulls.filter((h) => h.type === 'gunship');
  const fighters = hulls.length - gunships.length;
  const crew = crewCount(world).total;
  const gunsOut = gunships.filter((h) => carrying(world, h.id)).length;
  void fleets;
  const knights = Object.values(world.characters).filter((c) => c.alive && c.houseId === P && c.tier === 'full' && (c.role === 'Knight' || c.flags.some((f) => f.id === 'knighted')));
  const aspirants = Object.values(world.characters).filter((c) => c.alive && c.houseId === P && world.ladder?.of[c.id]?.stage === 'aspirant');
  const wounded = (c: Character) => c.flags.some((f) => f.id === 'wounded');
  const free = knights.filter((k) => !wounded(k) && !isAway(world, k.id));
  const jobs = (world.quests?.board ?? []).filter((q) => !q.goneId && ['hunt', 'escort', 'guard', 'trial', 'relic', 'beast', 'bounty', 'capture', 'hold'].includes(q.kind)).length;
  const us = tableOf(world).find((r) => r.id === P);
  const wars = warsOf(world, P);
  const cost = -phaseLedger(world, P).filter((l) => l.resource === 'othes' && (l.kind === 'forces' || l.kind === 'war')).reduce((n, l) => n + l.amount, 0);
  const trouble = liveHouses(world).filter((h) => h.id !== P).map((h) => ({ h, r: regardOf(world, h.id, P), g: grievances(world, h.id, P).length })).sort((a, b) => b.g * 20 - b.r - (a.g * 20 - a.r))[0];
  const weakCmd = land.find((f) => { const c = f.commanderId ? world.characters[f.commanderId] : undefined; return !c?.alive || wounded(c) || isAway(world, c.id); });
  const idleShip = ships.find((s) => (!s.duty || s.duty === 'harbour') && !s.ready && !carrying(world, s.id));
  const col = (id: Front, title: string, big: string, sub: string, rows: [string, string, string?][], step: { label: string; on: () => void } | null, tone: string) => (
    <section className={`front${open === id ? ' open' : ''}`} style={{ borderTopColor: tone }}>
      <span className="front-name" style={{ color: tone }}>{title}</span>
      <strong className="front-big">{big}</strong>
      <span className="muted" style={{ fontSize: 12 }}>{sub}</span>
      <div style={{ display: 'grid' }}>{rows.map(([a, b, t], i) => <div key={i} className="front-row"><span>{a}</span><span className={t}>{b}</span></div>)}</div>
      <div className="actions" style={{ marginTop: 'auto' }}>
        {step ? <button type="button" className="btn small lead" onClick={step.on}>{step.label}</button> : null}
        <button type="button" className="btn small" aria-pressed={open === id} onClick={() => setOpen(open === id ? null : id)}>{open === id ? 'Close ▴' : 'Open ▾'}</button>
      </div>
    </section>
  );
  return (
    <>
      <div className="page-title">
        <h2>Arms</h2>
        <p>The house's three fronts: the ground, the void and honour. Open one to work it. Power ranked {us ? ordinal(us.rank.power) : '—'}, Knights {us ? ordinal(us.rank.knights) : '—'}; forces cost {fmt(cost)} a Phase.</p>
      </div>
      <div className={`war-banner${wars.length ? ' at-war' : ''}`}>
        <span className="eyebrow">{wars.length ? 'AT WAR' : 'WAR'}</span>
        {wars.length ? <span>{wars.map((w) => w.name).join(' · ')}</span> : <span>At peace.{trouble ? <> Nearest trouble: <Go to={{ kind: 'house', id: trouble.h.id }}>House {trouble.h.name}</Go>, regard {trouble.r}{trouble.g ? `, ${trouble.g} grievance${trouble.g === 1 ? '' : 's'} against us` : ''}.</> : null}</span>}
        <Go to={{ kind: 'war' }} className="btn small" >{wars.length ? 'The war ›' : 'Readiness ›'}</Go>
      </div>
      <div className="fronts">
        {col('ground', 'GROUND', fmt(soldiers + garrisons), `soldiers · ${fmt(soldiers)} in formations, ${fmt(garrisons)} in garrisons`,
          [...land.map((f) => [f.name, `${fmt(f.strength)} · morale ${Math.round(f.morale)}`] as [string, string]), ['Commander', weakCmd ? `${weakCmd.name}: needs one` : 'all in hand', weakCmd ? 'down' : 'up']],
          weakCmd ? { label: 'Name a commander', on: () => setOpen('ground') } : null, 'var(--gold)')}
        {col('void', 'VOID', `${ships.length + hulls.length}`, `ships · ${ships.length} great, ${gunships.length} gunships, ${fighters} fighters · ${fmt(crew)} aboard`,
          [...ships.slice(0, 4).map((s) => { const p = carrying(world, s.id); const who = p ? world.characters[p.ids[0]!] : undefined; return [s.name, p ? `carrying ${who?.name.given ?? 'ours'}${p.ids.length > 1 ? ` +${p.ids.length - 1}` : ''}` : `${s.duty} · hull ${Math.round(s.condition)}${s.crewMood < 35 ? ' · crew sullen' : ''}`, p ? 'gold' : s.crewMood < 35 ? 'down' : undefined] as [string, string, string?]; }),
            ['Gunships', gunsOut ? `${gunsOut} of ${gunships.length} out carrying` : `all ${gunships.length} home`, gunsOut ? 'gold' : 'muted']],
          idleShip ? { label: `Give ${idleShip.name} a duty`, on: () => setOpen('void') } : null, 'var(--blue)')}
        {col('honour', 'HONOUR', `${knights.length}`, `knights · ${aspirants.length} aspirant${aspirants.length === 1 ? '' : 's'} · ${jobs} jobs on the board`,
          [...knights.slice(0, 4).map((k) => [k.name.given + (k.name.family ? ` ${k.name.family}` : ''), wounded(k) ? 'wounded' : isAway(world, k.id) ? 'away' : 'free', wounded(k) ? 'down' : isAway(world, k.id) ? 'muted' : 'up'] as [string, string, string])],
          free.length && jobs ? { label: `A job for ${free[0]!.name.given}`, on: () => setOpen('honour') } : null, 'var(--text, #e8dcc4)')}
      </div>
      {open ? null : <ArmsLately />}
      {open === 'ground' ? <div className="front-detail"><MilitaryPage bare /></div> : null}
      {open === 'void' ? <div className="front-detail"><FleetPage bare /></div> : null}
      {open === 'honour' ? <div className="front-detail"><KnightsPage bare /><div className="actions" style={{ marginTop: 12 }}><Go to={{ kind: 'training' }} className="btn small">Training &amp; academy ›</Go><Go to={{ kind: 'grounds' }} className="btn small">The lists ›</Go></div></div> : null}
    </>
  );
}

/** Circuit, tourneys and the Crucible on one tab. */
export function ListsPage({ which: initial }: { which?: 'circuit' | 'crucible' }) {
  const [which, setWhich] = useState<'circuit' | 'crucible'>(initial ?? 'circuit');
  return (
    <>
      <div className="page-title">
        <h2>The Lists</h2>
        <p>Where names are made: the circuit and tourneys all year, the Crucible once a year.</p>
      </div>
      <div className="filters" style={{ marginBottom: 12 }}>
        <button type="button" className="pill" aria-pressed={which === 'circuit'} onClick={() => setWhich('circuit')}>Circuit &amp; tourneys</button>
        <button type="button" className="pill" aria-pressed={which === 'crucible'} onClick={() => setWhich('crucible')}>The Crucible</button>
      </div>
      {which === 'circuit' ? <GroundsPage bare /> : <CruciblePage bare />}
    </>
  );
}

/** Beneath the fronts: what our arms have done lately, and who of ours is out and in which ship. */
function ArmsLately() {
  const world = useWorld();
  const P = world.playerHouseId;
  const now = absoluteCycle(world.date);
  const done = world.feed.filter((e) => (e.type === 'fight' || e.type === 'raid' || e.type === 'captive') && (e.severity ?? 0) >= 2 && e.houseIds?.includes(P) && now - absoluteCycle(e.date) <= 160).slice(0, 8);
  const out = passagesOf(world).filter((p) => !p.delivered);
  return (
    <div className="arms-lately">
      <section className="arms-col">
        <span className="eyebrow">Lately in arms · the last two Orbits</span>
        {done.length ? done.map((e) => (
          <div key={e.id} className="arms-line"><span className="mono muted">{formatDate(e.date).replace(/^SY-\d+ · /, '')}</span><span>{e.text}</span></div>
        )) : <span className="muted">No blows struck. The house is quiet.</span>}
        <Go to={{ kind: 'log' }}>The full record ›</Go>
      </section>
      <section className="arms-col">
        <span className="eyebrow">Out in our ships · {out.length}</span>
        {out.length ? out.slice(0, 8).map((p) => (
          <div key={p.key} className="arms-line">
            <span className={p.ship === 'merchant' ? 'muted' : 'gold'}>{shipLabel(world, p.ship).replace(/^the /, '')}</span>
            <span><PersonById id={p.ids[0]} />{p.ids.length > 1 ? <span className="muted"> +{p.ids.length - 1}</span> : null} <span className="muted">· {p.why} · {shipKind(world, p.ship)}</span></span>
          </div>
        )) : <span className="muted">Everyone of ours is home; every ship is free.</span>}
        {out.length > 8 ? <span className="muted">and {out.length - 8} more</span> : null}
      </section>
    </div>
  );
}
