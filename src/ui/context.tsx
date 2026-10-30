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
