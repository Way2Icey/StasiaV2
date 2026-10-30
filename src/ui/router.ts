import { displayName } from '../sim/names';
import { findSector } from '../sim/query';
import type { World } from '../sim/types';
import { TRAITS_BY_ID } from '../data/traits';
import { FLAGS_BY_ID } from '../data/flags';
import { SPECIES } from '../data/species';

export type Route =
  | { kind: 'throne' }
  | { kind: 'people' }
  | { kind: 'houses' }
  | { kind: 'worlds' }
  | { kind: 'save' }
  | { kind: 'missions' }
  | { kind: 'mission'; id: string }
  | { kind: 'plan'; mission: 'investigate' | 'scout'; target?: string }
  | { kind: 'character'; id: string }
  | { kind: 'house'; id: string }
  | { kind: 'family'; id: string }
  | { kind: 'planet'; id: string }
  | { kind: 'sector'; id: string }
  | { kind: 'trait'; id: string }
  | { kind: 'flag'; id: string }
  | { kind: 'species'; id: string }
  | { kind: 'band'; id: string }
  | { kind: 'search'; q: string };

export type Section = 'throne' | 'people' | 'houses' | 'worlds' | 'missions' | 'save';

/** Which sidebar section a page belongs to. */
export function sectionOf(r: Route): Section | null {
  switch (r.kind) {
    case 'throne': case 'people': case 'houses': case 'worlds': case 'save': case 'missions': return r.kind;
    case 'mission': case 'plan': return 'missions';
    case 'character': case 'trait': case 'flag': case 'species': case 'band': return 'people';
    case 'house': case 'family': return 'houses';
    case 'planet': case 'sector': return 'worlds';
    default: return null;
  }
}

export function sameRoute(a: Route, b: Route): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function routeLabel(world: World, r: Route): string {
  switch (r.kind) {
    case 'throne': return 'Throne Room';
    case 'people': return 'People';
    case 'houses': return 'Houses';
    case 'worlds': return 'Worlds';
    case 'save': return 'Save & Load';
    case 'missions': return 'Missions';
    case 'mission': {
      const m = world.missions[r.id];
      if (!m) return 'Mission';
      if (m.kind === 'scout') return `Scouting ${world.planets[m.targetPlanetId]?.name ?? ''}`;
      const t = m.targetId ? world.characters[m.targetId] : undefined;
      return `Investigating ${t ? t.name.given : 'someone'}`;
    }
    case 'plan': return r.mission === 'investigate' ? 'Plan an investigation' : 'Plan a scouting run';
    case 'character': { const c = world.characters[r.id]; return c ? displayName(c.name) : 'Unknown'; }
    case 'house': return `House ${world.houses[r.id]?.name ?? r.id}`;
    case 'family': return `Family ${world.families[r.id]?.name ?? r.id}`;
    case 'planet': return world.planets[r.id]?.name ?? r.id;
    case 'sector': return findSector(world, r.id)?.sector.name ?? r.id;
    case 'trait': return TRAITS_BY_ID[r.id]?.label.replace(' {detail}', '').replace('{detail}', 'Scar-name') ?? r.id;
    case 'flag': return FLAGS_BY_ID[r.id]?.label ?? r.id;
    case 'species': return SPECIES[r.id as keyof typeof SPECIES]?.name ?? r.id;
    case 'band': return `${cap(r.id)} resonance`;
    case 'search': return `Search “${r.q}”`;
  }
}
