import { displayName } from '../sim/names';
import { findSector } from '../sim/query';
import type { CouncilSeat, World } from '../sim/types';
import { SEAT_TITLE } from '../sim/world';
import { TRAITS_BY_ID } from '../data/traits';
import { FLAGS_BY_ID } from '../data/flags';
import { SPECIES } from '../data/species';

export type Route =
  | { kind: 'throne' }
  | { kind: 'people'; focus?: string; view?: 'web' | 'factions' | 'ambitions' | 'young' | 'everyone' }
  | { kind: 'houses' }
  | { kind: 'worlds' }
  | { kind: 'save' }
  | { kind: 'missions' }
  | { kind: 'mission'; id: string }
  | { kind: 'plan'; mission: 'investigate' | 'scout' | 'envoy'; target?: string; leader?: string; petition?: string; lead?: string }
  | { kind: 'council' }
  | { kind: 'seat'; id: CouncilSeat }
  | { kind: 'economy' }
  | { kind: 'glossary' }
  | { kind: 'character'; id: string }
  | { kind: 'house'; id: string }
  | { kind: 'family'; id: string }
  | { kind: 'planet'; id: string }
  | { kind: 'sector'; id: string }
  | { kind: 'trait'; id: string }
  | { kind: 'flag'; id: string }
  | { kind: 'species'; id: string }
  | { kind: 'band'; id: string }
  | { kind: 'search'; q: string }
  | { kind: 'port'; id: string; ship?: string }
  | { kind: 'holdings'; id?: string }
  | { kind: 'crucible' }
  | { kind: 'training'; id?: string }
  | { kind: 'ship'; id: string }
  | { kind: 'log'; person?: string; place?: string; house?: string; open?: string };

export type Section = 'throne' | 'council' | 'economy' | 'glossary' | 'people' | 'houses' | 'worlds' | 'missions' | 'save' | 'log';

/** Which sidebar section a page belongs to. */
export function sectionOf(r: Route): Section | null {
  switch (r.kind) {
    case 'throne': case 'people': case 'houses': case 'worlds': case 'save': case 'missions': case 'council': case 'economy': case 'glossary': case 'log': return r.kind;
    case 'mission': case 'plan': return 'missions';
    case 'seat': return 'council';
    case 'holdings': return 'economy';
    case 'crucible': return 'houses';
    case 'training': return 'people';
    case 'ship': return 'worlds';
    case 'character': case 'trait': case 'flag': case 'species': case 'band': return 'people';
    case 'house': case 'family': return 'houses';
    case 'planet': case 'sector': case 'port': return 'worlds';
    default: return null;
  }
}

export function sameRoute(a: Route, b: Route): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function routeLabel(world: World, r: Route): string {
  switch (r.kind) {
    case 'throne': return 'Hall';
    case 'people': return 'Relations';
    case 'houses': return 'Houses';
    case 'worlds': return 'Star map';
    case 'save': return 'Save & Load';
    case 'missions': return 'Missions';
    case 'council': return 'Council';
    case 'seat': return SEAT_TITLE[r.id];
    case 'economy': return 'Ledger';
    case 'glossary': return 'Glossary';
    case 'log': return r.person ? `Record: ${world.characters[r.person]?.name.given ?? ''}` : r.place ? `Log: ${findSector(world, r.place)?.sector.name ?? world.planets[r.place]?.name ?? ''}` : r.house ? `Log: ${world.houses[r.house]?.name ?? ''}` : 'Log';
    case 'mission': {
      const m = world.missions[r.id];
      if (!m) return 'Mission';
      if (m.kind === 'scout') return `Scouting ${world.planets[m.targetPlanetId]?.name ?? ''}`;
      if (m.kind === 'envoy') return `Envoy to ${world.houses[m.targetHouseId ?? '']?.name ?? ''}`;
      const t = m.targetId ? world.characters[m.targetId] : undefined;
      return `Investigating ${t ? t.name.given : 'someone'}`;
    }
    case 'plan': return r.mission === 'investigate' ? 'Plan an investigation' : r.mission === 'envoy' ? 'Send an envoy' : 'Plan a scouting run';
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
    case 'port': return `Port: ${findSector(world, r.id)?.sector.name ?? r.id}`;
    case 'holdings': return 'Holdings';
    case 'crucible': return 'The Crucible';
    case 'training': return 'Training';
    case 'ship': return (world as unknown as { fleet?: { ships: Record<string, { name: string }> } }).fleet?.ships[r.id]?.name ?? 'Ship';
  }
}
