import { LegacyPage } from './legacy';
import { ChairPage } from './chair';
import { PlacesPage } from './places';
import { PersonMenuLayer, Toast } from './personmenu';
import { RenownPage } from './realm';
import { VERSION } from '../version';
import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from 'react';
import { Term } from './tip';
import { GlossaryPage } from './glossary';
import { createWorld } from '../sim/world';
import { ClockControl, useClock } from './clock';
import { MomentWindow } from './moments';
import { BattleWindow } from './battle';
import { SceneWindow } from './scene';
import { dateParts, formatDate } from '../sim/time';
import { deserialize, serialize } from '../sim/save';
import { ageOf } from '../sim/characters';
import { displayName } from '../sim/names';
import { superiorOf } from '../sim/query';
import { SPECIES } from '../data/species';
import { traitLabel } from '../data/traits';
import type { World } from '../sim/types';
import { GameContext, HoverContext, PersonMenuContext, NavContext, WorldContext, type Game, type Hover, type Nav } from './context';
import { seenBy } from './fog';
import { MissionPage, MissionsPage, PlanPage } from './missions';
import { CouncilPage } from './council';
import { SeatPage } from './seats';
import { Coffers, EconomyPage } from './economy';
import { StarMapPage } from './starmap';
import { PortPage } from './ports';
import { LogPage } from './log';
import { RelationsPage } from './relations';
import { HoldingsPage } from './holdings';
import { CruciblePage } from './crucible';
import { TrainingPage } from './training';
import { GroundsPage } from './grounds';
import { SpendPage } from './spend';
import { LanesPage } from './lanes';
import { BuildPage, EmbassiesPage, FleetPage, KnightsPage, LoansPage, railCount, SubTabs, VaultsPage } from './sections';
import { CommandBar } from './command';
import { ShipPage } from './fleet';
import { routeLabel, sameRoute, sectionOf, SECTIONS, SUBTABS, type Route } from './router';
import { AUTOSAVE, storage } from './storage';
import {
  BandPage, CharacterPage, FamilyPage, FlagPage, HousePage, HousesPage, PlanetPage,
  SavePage, SearchPage, SectorPage, SpeciesPage, ThroneRoom, TraitPage,
} from './pages';

import { FrontierPage, HistoryPage, NewGamePage, NumaradePage } from './archon';
import { WarPage } from './war';

/** A first visit (nothing saved) opens on choosing a house. */
const firstVisit = !storage.get(AUTOSAVE);

function initialWorld(): World {
  const saved = storage.get(AUTOSAVE);
  if (saved) {
    try { return deserialize(saved); } catch { /* start fresh */ }
  }
  return createWorld();
}



interface History { stack: Route[]; index: number }

export function App() {
  const [world, setWorld] = useState<World>(initialWorld);
  const [history, setHistory] = useState<History>({ stack: [firstVisit ? { kind: 'newgame' } : { kind: 'throne' }], index: 0 });
  const [query, setQuery] = useState('');
  const [command, setCommand] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [hovered, setHovered] = useState<{ id: string; x: number; y: number; above: boolean } | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const hideTimer = useRef<number | undefined>(undefined);

  useEffect(() => { storage.set(AUTOSAVE, serialize(world)); }, [world]);

  const current = history.stack[history.index]!;

  // Number keys jump between screens, as in the terminal; ignored while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCommand(true); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === '/') { e.preventDefault(); setCommand(true); return; }
      const s = SECTIONS.find((x) => x.key === e.key);
      if (!s) return;
      e.preventDefault();
      setHistory((h) => {
        const r = s.home;
        if (sameRoute(h.stack[h.index]!, r)) return h;
        const stack = [...h.stack.slice(0, h.index + 1), r].slice(-60);
        return { stack, index: stack.length - 1 };
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
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

  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number>(0);
  const personMenu = useMemo(() => ({ open: (id: string, x: number, y: number) => { setHovered(null); setMenu({ id, x, y }); } }), []);
  const closeMenu = useCallback(() => setMenu(null), []);
  const done = useCallback((m: string) => { setToast(m); window.clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(null), 2600); }, []);
  // Moments: decisions that froze the clock, shown over whatever page you are on.
  const [moments, setMoments] = useState<{ ids: string[]; reason: string; resume: boolean; battle?: string } | null>(null);
  const [battle, setBattle] = useState<string | null>(null);
  const [scene, setScene] = useState<string | null>(null);
  const onFreeze = useCallback((ids: string[], reason: string, battleId?: string, sceneId?: string) => { if (sceneId && !ids.length && !battleId) { setScene(sceneId); return; } setMoments((m) => ({ ids: [...(m?.ids ?? []), ...ids.filter((x) => !m?.ids.includes(x))], reason, resume: true, battle: battleId ?? m?.battle })); }, []);
  const onNotice = useCallback((msg: string) => done(msg), [done]);
  const clock = useClock(world, setWorld, onFreeze, onNotice, !!moments || !!battle || !!scene);
  // A scene started from the page (a bonding, a talk, a rescue) opens at once.
  useEffect(() => {
    if (scene || battle || moments) return;
    const s = world.scenes?.list.find((x) => x.status !== 'over' && !x.prompted);
    if (s) { setScene(s.id); clock.setRunning(false); }
  }, [world, scene, battle, moments, clock]);
  const game: Game = useMemo(() => ({ update: (fn) => setWorld((w) => fn(w)), reveal, setReveal }), [reveal]);

  const parts = dateParts(world.date);
  const house = world.houses[world.playerHouseId]!;
  const section = sectionOf(current);
  // Where you are, not where you have been: section › page › the thing you are looking at.
  const secDef = SECTIONS.find((x) => x.id === section);
  const tab = section ? SUBTABS[section]?.find((t) => t.on(current)) : undefined;
  const here = routeLabel(world, current);
  const crumbs: { label: string; to?: Route }[] = [];
  if (secDef) crumbs.push({ label: secDef.label.charAt(0) + secDef.label.slice(1).toLowerCase(), to: secDef.home });
  if (tab && tab.label !== here) crumbs.push({ label: tab.label, to: tab.to });

  return (
    <WorldContext.Provider value={world}>
      <NavContext.Provider value={nav}>
        <HoverContext.Provider value={hover}>
        <PersonMenuContext.Provider value={personMenu}>
          <GameContext.Provider value={game}>
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
                  <small>{house.tier === 'great' ? 'Great House' : 'Minor House'} · v{VERSION}</small>
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
                <span><Term k="phase">Phase</Term> {parts.phase} of 5 · <Term k="cycle">Cycle</Term> {parts.cycleOfPhase} of 16 · <button type="button" className="linklike coffers-link" onClick={() => nav.to({ kind: 'economy' })}><Coffers /></button></span>
              </div>
              <ClockControl world={world} setWorld={setWorld} clock={clock} onFreeze={onFreeze} />
            </header>
            <div className="shell">
              <nav className="rail" aria-label="Screens">
                {SECTIONS.map((s, i) => {
                  const n = railCount(world, s.id);
                  return (
                    <Fragment key={s.id}>
                    {s.utility && !SECTIONS[i - 1]?.utility ? <span className="rail-gap" /> : null}
                    <button type="button" className={s.utility ? 'utility' : undefined} aria-current={section === s.id ? 'page' : undefined} onClick={() => nav.to(s.home)}>
                      <span className="key" aria-hidden="true">[{s.key}]</span>{s.label}
                      {n.gold ? <span className="count gold-count">{n.gold}</span> : n.plain ? <span className="count">{n.plain}</span> : null}
                    </button>
                    </Fragment>
                  );
                })}
                <button type="button" className="utility" onClick={() => setCommand(true)} title="Find anything, do anything"><span className="key" aria-hidden="true">[/]</span>COMMAND</button>
              </nav>
              <main className="main" ref={mainRef} onScroll={() => { setHovered(null); setMenu(null); }}>
                <nav className="trail" aria-label="Where you are">
                  {crumbs.filter((c) => c.label !== here).map((c, i) => (
                    <span key={i}>
                      <button type="button" className="linklike" onClick={() => c.to && nav.to(c.to)}>{c.label}</button>
                      <span className="sep" aria-hidden="true">›</span>
                    </span>
                  ))}
                  <span className="here">{here}</span>
                </nav>
                <SubTabs section={section} current={current} />
                <Page route={current} setWorld={setWorld} />
              </main>
            </div>
            {command ? <CommandBar onClose={() => setCommand(false)} /> : null}
            {menu ? <PersonMenuLayer key={`${menu.id}-${menu.x}-${menu.y}`} id={menu.id} x={menu.x} y={menu.y} onClose={closeMenu} onDone={done} /> : null}
            {toast ? <Toast msg={toast} /> : null}
            {moments && !battle ? <MomentWindow ids={moments.ids} reason={moments.reason} battle={moments.battle} onCommand={(id) => { setMoments(null); setBattle(id); }} onClose={(resume) => { setMoments(null); if (resume && moments.resume) clock.setRunning(true); }} /> : null}
            {battle ? <BattleWindow id={battle} onClose={() => { setBattle(null); clock.setRunning(true); }} /> : null}
            {scene && !battle ? <SceneWindow id={scene} onClose={() => { setWorld((w) => { const x = w.scenes?.list.find((y) => y.id === scene); if (x && !x.prompted) { const c = structuredClone(w); c.scenes!.list.find((y) => y.id === scene)!.prompted = true; return c; } return w; }); setScene(null); }} /> : null}
            {hovered && !menu ? <HoverCard id={hovered.id} x={hovered.x} y={hovered.y} above={hovered.above} reveal={reveal} keep={() => window.clearTimeout(hideTimer.current)} leave={hover.hide} /> : null}
          </div>
          </GameContext.Provider>
        </PersonMenuContext.Provider>
        </HoverContext.Provider>
      </NavContext.Provider>
    </WorldContext.Provider>
  );
}

function Page({ route, setWorld }: { route: Route; setWorld: (w: World) => void }) {
  switch (route.kind) {
    case 'throne': return <ThroneRoom />;
    case 'people': if (route.view === 'renown') return <RenownPage />;
      return <RelationsPage key={route.view ?? 'web'} focus={route.focus} view={route.view} />;
    case 'houses': return <HousesPage />;
    case 'worlds': return <StarMapPage />;
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
    case 'missions': return <MissionsPage />;
    case 'mission': return <MissionPage id={route.id} />;
    case 'plan': return <PlanPage key={`${route.mission}-${route.target ?? ''}-${route.petition ?? ''}-${route.lead ?? ''}`} kind={route.mission} target={route.target} leader={route.leader} petition={route.petition} lead={route.lead} />;
    case 'council': return <CouncilPage />;
    case 'seat': return <SeatPage key={route.id} seat={route.id} />;
    case 'economy': return <EconomyPage />;
    case 'glossary': return <GlossaryPage />;
    case 'log': return <LogPage key={`${route.person}-${route.place}-${route.house}`} person={route.person} place={route.place} house={route.house} open={route.open} />;
    case 'port': return <PortPage key={route.id} id={route.id} ship={route.ship} />;
    case 'holdings': return <HoldingsPage id={route.id} />;
    case 'crucible': return <CruciblePage />;
    case 'training': return <TrainingPage id={route.id} />;
    case 'grounds': return <GroundsPage />;
    case 'knights': return <KnightsPage />;
    case 'fleet': return <FleetPage />;
    case 'embassies': return <EmbassiesPage />;
    case 'loans': return <LoansPage />;
    case 'vaults': return <VaultsPage />;
    case 'build': return <BuildPage key={route.what ?? ''} what={route.what} />;
    case 'spend': return <SpendPage />;
    case 'lanes': return <LanesPage />;
    case 'numarade': return <NumaradePage />;
    case 'history': return <HistoryPage />;
    case 'legacy': return <LegacyPage />;
    case 'chair': return <ChairPage />;
    case 'places': return <PlacesPage />;
    case 'frontier': return <FrontierPage />;
    case 'newgame': return <NewGamePage setWorld={setWorld} />;
    case 'war': return <WarPage />;
    case 'ship': return <ShipPage key={route.id} id={route.id} />;
  }
}

function HoverCard({ id, x, y, above, reveal, keep, leave }: { id: string; x: number; y: number; above: boolean; reveal: boolean; keep: () => void; leave: () => void }) {
  return (
    <WorldContext.Consumer>
      {(world) => {
        const c = world?.characters[id];
        if (!world || !c) return null;
        const boss = superiorOf(world, c);
        const fam = world.families[c.familyId];
        const v = seenBy(world, reveal)(c);
        return (
          <div className="hovercard" role="tooltip" style={{ left: x, top: y, transform: above ? 'translateY(-100%)' : undefined }} onMouseEnter={keep} onMouseLeave={leave}>
            <div className="eyebrow gold">{c.role}</div>
            <div className="hc-name">{displayName(c.name)}{c.alive ? '' : ' †'}</div>
            <div className="muted" style={{ fontSize: 11 }}>
              House {world.houses[c.houseId]?.name} · {SPECIES[c.species].name} · {c.alive ? `age ${ageOf(c, world.date)}` : 'deceased'}
              {fam ? ` · ${fam.name}` : ''}
            </div>
            {v.traits.length ? <div style={{ fontSize: 12 }}>{v.traits.slice(0, 4).map((t) => traitLabel(t.id, t.detail)).join(' · ')}{v.hiddenTraits ? ' · ?' : ''}</div> : null}
            <div className="muted" style={{ fontSize: 11 }}>Known: {v.label.toLowerCase()}</div>
            {boss ? <div className="muted" style={{ fontSize: 11 }}>Answers to {displayName(boss.name)}</div> : null}
          </div>
        );
      }}
    </WorldContext.Consumer>
  );
}
