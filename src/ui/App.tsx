import { useCallback, useEffect, useState } from 'react';
import { createWorld } from '../sim/world';
import { advanceTurn } from '../sim/tick';
import { dateParts, formatDate } from '../sim/time';
import { deserialize, serialize } from '../sim/save';
import type { World } from '../sim/types';
import { CharacterSheet, HousesView, PeopleView, PlanetView, SaveView, ThroneRoom } from './views';

export type Tab = 'throne' | 'people' | 'houses' | 'planet' | 'save';

export interface Nav {
  openCharacter: (id: string) => void;
  openPlanet: (id: string) => void;
  go: (tab: Tab) => void;
}

const AUTOSAVE_KEY = 'stasia.autosave.v1';
const SLOT_KEY = 'stasia.slot1.v1';

export const storage = {
  get(key: string): string | null {
    try { return window.localStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: string): boolean {
    try { window.localStorage.setItem(key, value); return true; } catch { return false; }
  },
};

export const SLOT = SLOT_KEY;

function initialWorld(): World {
  const saved = storage.get(AUTOSAVE_KEY);
  if (saved) {
    try { return deserialize(saved); } catch { /* fall through to a new world */ }
  }
  return createWorld();
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'throne', label: 'Throne Room' },
  { id: 'people', label: 'People' },
  { id: 'houses', label: 'Houses' },
  { id: 'planet', label: 'Worlds' },
  { id: 'save', label: 'Save & Load' },
];

export function App() {
  const [world, setWorld] = useState<World>(initialWorld);
  const [tab, setTab] = useState<Tab>('throne');
  const [characterId, setCharacterId] = useState<string | null>(null);
  const [planetId, setPlanetId] = useState<string>('alerion-prime');

  useEffect(() => { storage.set(AUTOSAVE_KEY, serialize(world)); }, [world]);

  const nav: Nav = {
    openCharacter: (id) => { setCharacterId(id); },
    openPlanet: (id) => { setPlanetId(id); setCharacterId(null); setTab('planet'); },
    go: (t) => { setTab(t); setCharacterId(null); },
  };

  const onContinue = useCallback(() => setWorld((w) => advanceTurn(w)), []);
  const parts = dateParts(world.date);
  const house = world.houses[world.playerHouseId]!;
  const ruler = house.rulerId ? world.characters[house.rulerId] : undefined;

  return (
    <div className="app">
      <header className="topbar">
        <div className="crest">
          <svg width="30" height="34" viewBox="0 0 34 38" aria-hidden="true">
            <path d="M17 1 L32 7 V19 C32 28 25 34 17 37 C9 34 2 28 2 19 V7 Z" fill="#1c232d" stroke="var(--gold)" strokeWidth="1.5" />
            <path d="M17 9 L24 21 H10 Z" fill="none" stroke="var(--gold)" strokeWidth="1.5" />
            <circle cx="17" cy="24" r="2.5" fill="var(--gold)" />
          </svg>
          <div>
            <h1>House {house.name}</h1>
            <small>{house.tier === 'great' ? 'Great House' : 'Minor House'}{ruler ? ` · Highroy ${ruler.name.given} ${ruler.name.family ?? ''}` : ''}</small>
          </div>
        </div>
        <div className="date">
          <strong>{formatDate(world.date)}</strong>
          <span>Phase {parts.phase} of 5 · Cycle {parts.cycleOfPhase} of 16</span>
        </div>
        <button type="button" className="btn primary" onClick={onContinue}>Continue ›</button>
      </header>
      <div className="shell">
        <nav className="rail" aria-label="Screens">
          {TABS.map((t) => (
            <button key={t.id} type="button" aria-current={tab === t.id && !characterId ? 'page' : undefined} onClick={() => nav.go(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <main className="main">
          {characterId ? (
            <CharacterSheet world={world} id={characterId} nav={nav} onBack={() => setCharacterId(null)} />
          ) : tab === 'throne' ? (
            <ThroneRoom world={world} nav={nav} />
          ) : tab === 'people' ? (
            <PeopleView world={world} nav={nav} />
          ) : tab === 'houses' ? (
            <HousesView world={world} nav={nav} />
          ) : tab === 'planet' ? (
            <PlanetView world={world} nav={nav} planetId={planetId} setPlanetId={setPlanetId} />
          ) : (
            <SaveView world={world} setWorld={(w) => { setWorld(w); setCharacterId(null); setTab('throne'); }} />
          )}
        </main>
      </div>
    </div>
  );
}
