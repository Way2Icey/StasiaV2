import { useRef } from 'react';
import type { ReactNode } from 'react';
import { displayName } from '../sim/names';
import { ageOf } from '../sim/characters';
import { findSector } from '../sim/query';
import { TRAITS_BY_ID, traitLabel } from '../data/traits';
import { FLAGS_BY_ID } from '../data/flags';
import { SPECIES } from '../data/species';
import type { Character, FlagInstance, TraitInstance } from '../sim/types';
import { useHover, useInspect, useNav, usePersonMenu, useWorld } from './context';
import type { Route } from './router';
import { useSee } from './fog';

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const BAND_COLOR: Record<string, string> = {
  frostpoint: 'var(--muted)', bluewake: 'var(--blue)', ambercore: 'var(--amber)', redline: 'var(--red)', whitebreak: '#f2f0ea',
};

/** A button that navigates. */
export function Go({ to, children, className, title }: { to: Route; children: ReactNode; className?: string; title?: string }) {
  const nav = useNav();
  return (
    <button type="button" className={className ?? 'linklike'} title={title} onClick={() => nav.to(to)}>
      {children}
    </button>
  );
}

export function PersonLink({ c, short }: { c: Character; short?: boolean }) {
  const ins = useInspect();
  const hover = useHover();
  const menu = usePersonMenu();
  // Long-press on a touch screen opens the same menu (iOS never sends a context-menu event).
  const press = useRef<{ t: number; fired: boolean }>({ t: 0, fired: false });
  const endPress = () => window.clearTimeout(press.current.t);
  return (
    <button
      type="button"
      className={`linklike${c.alive ? '' : ' dead'}`}
      aria-haspopup="menu"
      title="Right-click for decisions"
      onContextMenu={(e) => { e.preventDefault(); hover.hide(); menu.open(c.id, e.clientX, e.clientY); }}
      onKeyDown={(e) => { if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); hover.hide(); menu.open(c.id, r.left, r.bottom + 4); } }}
      onClick={(e) => { e.stopPropagation(); if (press.current.fired) { press.current.fired = false; return; } hover.hide(); ins.open({ k: 'person', id: c.id }); }}
      onTouchStart={(e) => { const t = e.touches[0]; if (!t) return; const x = t.clientX; const y = t.clientY; press.current.fired = false; endPress(); press.current.t = window.setTimeout(() => { press.current.fired = true; hover.hide(); menu.open(c.id, x, y); }, 480); }}
      onTouchEnd={(e) => { endPress(); if (press.current.fired) e.preventDefault(); }}
      onTouchMove={endPress}
      onMouseEnter={(e) => hover.show(c.id, e.currentTarget)}
      onMouseLeave={hover.hide}
      onFocus={(e) => hover.show(c.id, e.currentTarget)}
      onBlur={hover.hide}
    >
      {short ? `${c.name.given}${c.name.family ? ` ${c.name.family}` : ''}` : displayName(c.name)}
      {c.alive ? null : ' †'}
    </button>
  );
}

export function PersonById({ id }: { id: string | null | undefined }) {
  const world = useWorld();
  const c = id ? world.characters[id] : undefined;
  return c ? <PersonLink c={c} /> : <span className="muted">—</span>;
}

/** Opens a card over the page rather than leaving it. */
export function Peek({ t, children, className, title }: { t: import('./context').Inspect; children: ReactNode; className?: string; title?: string }) {
  const ins = useInspect();
  return <button type="button" className={className ?? 'linklike'} title={title} onClick={(e) => { e.stopPropagation(); ins.open(t); }}>{children}</button>;
}

export function HouseLink({ id }: { id: string }) {
  const world = useWorld();
  return <Peek t={{ k: 'house', id }}>{world.houses[id]?.name ?? world.archon?.houses[id]?.name ?? id}</Peek>;
}

export function FamilyLink({ id, prefix }: { id: string; prefix?: boolean }) {
  const world = useWorld();
  const f = world.families[id];
  if (!f) return <span className="muted">—</span>;
  return <Go to={{ kind: 'family', id }}>{prefix ? `Family ${f.name}` : f.name}</Go>;
}

export function PlanetLink({ id }: { id: string }) {
  const world = useWorld();
  return <Peek t={{ k: 'planet', id }}>{world.planets[id]?.name ?? id}</Peek>;
}

export function SectorLink({ id, withPlanet }: { id: string; withPlanet?: boolean }) {
  const world = useWorld();
  const found = findSector(world, id);
  if (!found) return <span className="muted">—</span>;
  return (
    <span>
      <Peek t={{ k: 'sector', id }}>{found.sector.name}</Peek>
      {withPlanet ? <>, <PlanetLink id={found.planet.id} /></> : null}
    </span>
  );
}

export function SpeciesLink({ id }: { id: string }) {
  return <Go to={{ kind: 'species', id }}>{SPECIES[id as keyof typeof SPECIES]?.name ?? id}</Go>;
}

/** Resonance as the player's house knows it. */
export function BandLink({ c }: { c: Character }) {
  const see = useSee();
  const r = see(c).resonance;
  if (r === null) return <span className="muted">—</span>;
  if (r === 'unknown') return <span className="muted" title="Not yet measured by your people">Unknown</span>;
  return (
    <Go to={{ kind: 'band', id: r.band }}>
      <span style={{ color: BAND_COLOR[r.band] }}>{cap(r.band)}{r.degrees !== undefined ? <> <span className="mono">{r.degrees}°S</span></> : null}</span>
    </Go>
  );
}

/** Traits the player's house knows of, comma separated, with a hint if some are unknown. */
export function TraitList({ c }: { c: Character }) {
  const v = useSee()(c);
  return (
    <>
      {v.traits.map((t, i) => <span key={t.id + i}>{i ? ', ' : ''}<TraitText t={t} /></span>)}
      {v.hiddenTraits > 0 ? <span className="muted">{v.traits.length ? ' ' : ''}+?</span> : null}
    </>
  );
}

export function TraitChip({ t }: { t: TraitInstance }) {
  const def = TRAITS_BY_ID[t.id];
  return (
    <Go to={{ kind: 'trait', id: t.id }} className={`chip link ${def?.category === 'earned' ? 'earned' : ''}`} title={def?.description}>
      <span className="k">{cap(def?.category ?? '')} ·</span>{traitLabel(t.id, t.detail)}
    </Go>
  );
}

export function TraitText({ t }: { t: TraitInstance }) {
  return <Go to={{ kind: 'trait', id: t.id }}>{traitLabel(t.id, t.detail)}</Go>;
}

export function FlagChip({ f }: { f: FlagInstance }) {
  const def = FLAGS_BY_ID[f.id];
  return (
    <Go to={{ kind: 'flag', id: f.id }} className={`chip link ${def?.visibility === 'secret' ? 'secret' : ''}`} title={def?.endsBy}>
      {def?.label ?? f.id}{f.detail ? <span className="k">· {f.detail}</span> : null}
    </Go>
  );
}

/** One-line description used in lists and hover cards. */
export function personSummary(c: Character, worldDate: Parameters<typeof ageOf>[1]): string {
  return `${c.role} · ${SPECIES[c.species].name} · ${c.alive ? `age ${ageOf(c, worldDate)}` : 'deceased'}`;
}

/** A compact table of people, used on many pages. */
export function PeopleTable({ people, empty, extra }: { people: Character[]; empty?: string; extra?: { label: string; cell: (c: Character) => ReactNode } }) {
  const world = useWorld();
  if (people.length === 0) return <p className="muted body" style={{ margin: 0 }}>{empty ?? 'No one.'}</p>;
  return (
    <div className="table-wrap">
      <table className="list">
        <thead><tr><th>Name</th><th>House</th><th>Species</th><th>Age</th><th>Role</th>{extra ? <th>{extra.label}</th> : null}</tr></thead>
        <tbody>
          {people.map((c) => (
            <tr key={c.id}>
              <td><PersonLink c={c} /></td>
              <td><HouseLink id={c.houseId} /></td>
              <td><SpeciesLink id={c.species} /></td>
              <td className="mono">{c.alive ? ageOf(c, world.date) : '†'}</td>
              <td>{c.role}</td>
              {extra ? <td>{extra.cell(c)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Panel({ title, aside, className, children }: { title: ReactNode; aside?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`panel ${className ?? ''}`}>
      <header><h3>{title}</h3>{aside ? <span className="aside">{aside}</span> : null}</header>
      {children}
    </section>
  );
}
