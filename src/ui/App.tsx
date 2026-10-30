import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createWorld } from '../sim/world';
import { advanceTurn } from '../sim/tick';
import { dateParts, formatDate } from '../sim/time';
import { deserialize, serialize } from '../sim/save';
import { ageOf } from '../sim/characters';
import { displayName } from '../sim/names';
import { superiorOf } from '../sim/query';
import { SPECIES } from '../data/species';
import { traitLabel } from '../data/traits';
import type { World } from '../sim/types';
import { HoverContext, NavContext, WorldContext, type Hover, type Nav } from './context';
import { routeLabel, sameRoute, sectionOf, type Route, type Section } from './router';
import { AUTOSAVE, storage } from './storage';
import {
  BandPage, CharacterPage, FamilyPage, FlagPage, HousePage, HousesPage, PeoplePage, PlanetPage,
  SavePage, SearchPage, SectorPage, SpeciesPage, ThroneRoom, TraitPage, WorldsPage,
} from './pages';

function initialWorld(): World {
  const saved = storage.get(AUTOSAVE);
  if (saved) {
    try { return deserialize(saved); } catch { /* start fresh */ }
  }
  return createWorld();
}

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'throne', label: 'Throne Room' },
  { id: 'people', label: 'People' },
  { id: 'houses', label: 'Houses' },
  { id: 'worlds', label: 'Worlds' },
  { id: 'save', label: 'Save & Load' },
];

interface History { stack: Route[]; index: number }

export function App() {
  const [world, setWorld] = useState<World>(initialWorld);
  const [history, setHistory] = useState<History>({ stack: [{ kind: 'throne' }], index: 0 });
  const [query, setQuery] = useState('');
  const [hovered, setHovered] = useState<{ id: string; x: number; y: number; above: boolean } | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const hideTimer = useRef<number | undefined>(undefined);

  useEffect(() => { storage.set(AUTOSAVE, serialize(world)); }, [world]);

  const current = history.stack[history.index]!;
  useEffect(() => { mainRef.current?.scrollTo({ top: 0 }); setHovered(null); }, [history]);

  const nav: Nav = useMemo(() => ({
    current,
    canBack: history.index > 0,
    canForward: history.index < history.stack.length - 1,
    to: (r) => setHistory((h) => {
      if (sameRoute(h.stack[h.index]!, r)) return h;
      const stack = [...h.stack.slice(0, h.index + 1), r].slice(-60);
      return { stack, index: stack.length - 1 };
    }),
    back: () => setHistory((h) => ({ ...h, index: Math.max(0, h.index - 1) })),
    forward: () => setHistory((h) => ({ ...h, index: Math.min(h.stack.length - 1, h.index + 1) })),
  }), [current, history]);

  const hover: Hover = useMemo(() => ({
    show: (id, el) => {
      window.clearTimeout(hideTimer.current);
      const r = el.getBoundingClientRect();
      const width = 280;
      const x = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      const above = r.bottom + 190 > window.innerHeight;
      setHovered({ id, x, y: above ? r.top - 8 : r.bottom + 6, above });
    },
    hide: () => {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setHovered(null), 60);
    },
  }), []);

  const onContinue = useCallback(() => setWorld((w) => advanceTurn(w)), []);
  const parts = dateParts(world.date);
  const house = world.houses[world.playerHouseId]!;
  const section = sectionOf(current);
  const trail = history.stack.slice(Math.max(0, history.index - 4), history.index);

  return (
    <WorldContext.Provider value={world}>
      <NavContext.Provider value={nav}>
        <HoverContext.Provider value={hover}>
          <div className="app">
            <header className="topbar">
              <button type="button" className="crest" onClick={() => nav.to({ kind: 'house', id: house.id })} aria-label={`Open House ${house.name}`}>
                <svg width="30" height="34" viewBox="0 0 34 38" aria-hidden="true">
                  <path d="M17 1 L32 7 V19 C32 28 25 34 17 37 C9 34 2 28 2 19 V7 Z" fill="#1c232d" stroke="var(--gold)" strokeWidth="1.5" />
                  <path d="M17 9 L24 21 H10 Z" fill="none" stroke="var(--gold)" strokeWidth="1.5" />
                  <circle cx="17" cy="24" r="2.5" fill="var(--gold)" />
                </svg>
                <span>
                  <span className="crest-name">House {house.name}</span>
                  <small>{house.tier === 'great' ? 'Great House' : 'Minor House'}</small>
                </span>
              </button>
              <div className="navbtns">
                <button type="button" className="btn small" onClick={nav.back} disabled={!nav.canBack} aria-label="Back">‹</button>
                <button type="button" className="btn small" onClick={nav.forward} disabled={!nav.canForward} aria-label="Forward">›</button>
              </div>
              <form className="search" role="search" onSubmit={(e) => { e.preventDefault(); if (query.trim()) nav.to({ kind: 'search', q: query.trim() }); }}>
                <label htmlFor="global-search" className="sr-only">Search people and places</label>
                <input id="global-search" className="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people, families, places…" />
              </form>
              <div className="date">
                <strong>{formatDate(world.date)}</strong>
                <span>Phase {parts.phase} of 5 · Cycle {parts.cycleOfPhase} of 16</span>
              </div>
              <button type="button" className="btn primary" onClick={onContinue}>Continue ›</button>
            </header>
            <div className="shell">
              <nav className="rail" aria-label="Screens">
                {SECTIONS.map((s) => (
                  <button key={s.id} type="button" aria-current={section === s.id ? 'page' : undefined} onClick={() => nav.to({ kind: s.id } as Route)}>
                    {s.label}
                  </button>
                ))}
              </nav>
              <main className="main" ref={mainRef} onScroll={() => setHovered(null)}>
                {trail.length > 0 ? (
                  <nav className="trail" aria-label="Recently viewed">
                    {trail.map((r, i) => (
                      <span key={i}>
                        <button type="button" className="linklike" onClick={() => setHistory((h) => ({ ...h, index: h.index - (trail.length - i) }))}>{routeLabel(world, r)}</button>
                        <span className="sep" aria-hidden="true">›</span>
                      </span>
                    ))}
                    <span className="here">{routeLabel(world, current)}</span>
                  </nav>
                ) : null}
                <Page route={current} setWorld={setWorld} />
              </main>
            </div>
            {hovered ? <HoverCard id={hovered.id} x={hovered.x} y={hovered.y} above={hovered.above} keep={() => window.clearTimeout(hideTimer.current)} leave={hover.hide} /> : null}
          </div>
        </HoverContext.Provider>
      </NavContext.Provider>
    </WorldContext.Provider>
  );
}

function Page({ route, setWorld }: { route: Route; setWorld: (w: World) => void }) {
  switch (route.kind) {
    case 'throne': return <ThroneRoom />;
    case 'people': return <PeoplePage />;
    case 'houses': return <HousesPage />;
    case 'worlds': return <WorldsPage />;
    case 'save': return <SavePage setWorld={setWorld} />;
    case 'character': return <CharacterPage key={route.id} id={route.id} />;
    case 'house': return <HousePage id={route.id} />;
    case 'family': return <FamilyPage id={route.id} />;
    case 'planet': return <PlanetPage id={route.id} />;
    case 'sector': return <SectorPage id={route.id} />;
    case 'trait': return <TraitPage id={route.id} />;
    case 'flag': return <FlagPage id={route.id} />;
    case 'species': return <SpeciesPage id={route.id} />;
    case 'band': return <BandPage id={route.id} />;
    case 'search': return <SearchPage q={route.q} />;
  }
}

function HoverCard({ id, x, y, above, keep, leave }: { id: string; x: number; y: number; above: boolean; keep: () => void; leave: () => void }) {
  return (
    <WorldContext.Consumer>
      {(world) => {
        const c = world?.characters[id];
        if (!world || !c) return null;
        const boss = superiorOf(world, c);
        const fam = world.families[c.familyId];
        return (
          <div className="hovercard" role="tooltip" style={{ left: x, top: y, transform: above ? 'translateY(-100%)' : undefined }} onMouseEnter={keep} onMouseLeave={leave}>
            <div className="eyebrow gold">{c.role}</div>
            <div className="hc-name">{displayName(c.name)}{c.alive ? '' : ' †'}</div>
            <div className="muted" style={{ fontSize: 11 }}>
              House {world.houses[c.houseId]?.name} · {SPECIES[c.species].name} · {c.alive ? `age ${ageOf(c, world.date)}` : 'deceased'}
              {fam ? ` · ${fam.name}` : ''}
            </div>
            {c.traits.length ? <div style={{ fontSize: 12 }}>{c.traits.slice(0, 4).map((t) => traitLabel(t.id, t.detail)).join(' · ')}</div> : null}
            {boss ? <div className="muted" style={{ fontSize: 11 }}>Answers to {displayName(boss.name)}</div> : null}
          </div>
        );
      }}
    </WorldContext.Consumer>
  );
}
