import { createContext, useContext } from 'react';
import type { World } from '../sim/types';
import type { Route } from './router';

export interface Nav {
  to: (r: Route) => void;
  back: () => void;
  forward: () => void;
  canBack: boolean;
  canForward: boolean;
  current: Route;
}

export interface Hover {
  show: (characterId: string, el: HTMLElement) => void;
  hide: () => void;
}

export const WorldContext = createContext<World | null>(null);
export const NavContext = createContext<Nav | null>(null);
export const HoverContext = createContext<Hover>({ show: () => {}, hide: () => {} });

export function useWorld(): World {
  const w = useContext(WorldContext);
  if (!w) throw new Error('WorldContext missing');
  return w;
}

export function useNav(): Nav {
  const n = useContext(NavContext);
  if (!n) throw new Error('NavContext missing');
  return n;
}

export function useHover(): Hover {
  return useContext(HoverContext);
}

/** Game-wide controls: change the world, and the developer reveal switch. */
export interface Game {
  update: (fn: (w: World) => World) => void;
  reveal: boolean;
  setReveal: (v: boolean) => void;
}

export const GameContext = createContext<Game>({ update: () => {}, reveal: false, setReveal: () => {} });

export function useGame(): Game {
  return useContext(GameContext);
}

/** The right-click menu of decisions on a person. */
export interface PersonMenu {
  open: (characterId: string, x: number, y: number) => void;
}
export const PersonMenuContext = createContext<PersonMenu>({ open: () => {} });
export function usePersonMenu(): PersonMenu {
  return useContext(PersonMenuContext);
}

/** What the inspector can open: anything with a card. */
export type Inspect =
  | { k: 'person'; id: string }
  | { k: 'ship'; id: string }
  | { k: 'portShip'; id: string }
  | { k: 'site'; id: string }
  | { k: 'relic'; id: string }
  | { k: 'planet'; id: string }
  | { k: 'sector'; id: string }
  | { k: 'module'; id: string }
  | { k: 'house'; id: string };
export interface Inspector { open: (t: Inspect) => void; close: () => void }
export const InspectContext = createContext<Inspector>({ open: () => {}, close: () => {} });
export const useInspect = (): Inspector => useContext(InspectContext);
