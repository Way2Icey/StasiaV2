import { displayName } from '../sim/names';
import { findSector } from '../sim/query';
import type { CouncilSeat, World } from '../sim/types';
import { SEAT_TITLE } from '../sim/world';
import { TRAITS_BY_ID } from '../data/traits';
import { FLAGS_BY_ID } from '../data/flags';
import { SPECIES } from '../data/species';

export type Route =
  | { kind: 'throne' }
  | { kind: 'people'; focus?: string; view?: 'web' | 'factions' | 'ambitions' | 'young' | 'everyone' | 'renown' }
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
  | { kind: 'grounds' }
  | { kind: 'knights' }
  | { kind: 'fleet' }
  | { kind: 'embassies' }
  | { kind: 'loans' }
  | { kind: 'vaults' }
  | { kind: 'build'; what?: string }
  | { kind: 'spend' }
  | { kind: 'lanes' }
  | { kind: 'numarade' }
  | { kind: 'history' }
  | { kind: 'frontier' }
  | { kind: 'newgame' }
  | { kind: 'ship'; id: string }
  | { kind: 'log'; person?: string; place?: string; house?: string; open?: string };

export type Section = 'hall' | 'court' | 'people' | 'arms' | 'realm' | 'treasury' | 'missions' | 'log' | 'save' | 'glossary';

/** Which rail section a page belongs to: grouped by what the Highroy is doing, not by what things are. */
export function sectionOf(r: Route): Section | null {
  switch (r.kind) {
    case 'throne': return 'hall';
    case 'council': case 'seat': return 'court';
    case 'people': return r.view === 'ambitions' ? 'court' : 'people';
    case 'training': case 'character': case 'trait': case 'flag': case 'species': case 'band': case 'family': return 'people';
    case 'crucible': case 'grounds': case 'knights': case 'fleet': case 'ship': return 'arms';
    case 'worlds': case 'planet': case 'sector': case 'port': case 'holdings': case 'build': case 'houses': case 'house': case 'embassies': case 'lanes': case 'numarade': case 'history': case 'frontier': return 'realm';
    case 'economy': case 'loans': case 'vaults': case 'spend': return 'treasury';
    case 'missions': case 'mission': case 'plan': return 'missions';
    case 'log': return 'log';
    case 'save': case 'newgame': return 'save';
    case 'glossary': return 'glossary';
    default: return null;
  }
}

export interface SectionDef { id: Section; label: string; key: string; home: Route; utility?: boolean }
export const SECTIONS: SectionDef[] = [
  { id: 'hall', label: 'HALL', key: '1', home: { kind: 'throne' } },
  { id: 'court', label: 'COURT', key: '2', home: { kind: 'council' } },
  { id: 'people', label: 'PEOPLE', key: '3', home: { kind: 'people' } },
  { id: 'arms', label: 'ARMS', key: '4', home: { kind: 'crucible' } },
  { id: 'realm', label: 'REALM', key: '5', home: { kind: 'worlds' } },
  { id: 'treasury', label: 'TREASURY', key: '6', home: { kind: 'economy' } },
  { id: 'missions', label: 'MISSIONS', key: '7', home: { kind: 'missions' } },
  { id: 'log', label: 'LOG', key: '8', home: { kind: 'log' }, utility: true },
  { id: 'save', label: 'SAVE', key: '9', home: { kind: 'save' }, utility: true },
  { id: 'glossary', label: 'GLOSSARY', key: '?', home: { kind: 'glossary' }, utility: true },
];

export interface SubTab { label: string; to: Route; on: (r: Route) => boolean }
const is = (k: Route['kind']) => (r: Route) => r.kind === k;
/** Each section's strip of tabs: every feature at most two clicks from the rail. */
export const SUBTABS: Partial<Record<Section, SubTab[]>> = {
  court: [
    { label: 'Council', to: { kind: 'council' }, on: is('council') },
    { label: 'Ambitions & audiences', to: { kind: 'people', view: 'ambitions' }, on: (r) => r.kind === 'people' && r.view === 'ambitions' },
    { label: 'Infirmary', to: { kind: 'seat', id: 'physician' }, on: (r) => r.kind === 'seat' && r.id === 'physician' },
    { label: 'Seats', to: { kind: 'seat', id: 'envoy' }, on: (r) => r.kind === 'seat' && r.id !== 'physician' },
  ],
  people: [
    { label: 'Ties', to: { kind: 'people', view: 'web' }, on: (r) => r.kind === 'people' && (!r.view || r.view === 'web') },
    { label: 'Factions', to: { kind: 'people', view: 'factions' }, on: (r) => r.kind === 'people' && r.view === 'factions' },
    { label: 'Renown', to: { kind: 'people', view: 'renown' }, on: (r) => r.kind === 'people' && r.view === 'renown' },
    { label: 'Younglings & wards', to: { kind: 'people', view: 'young' }, on: (r) => r.kind === 'people' && r.view === 'young' },
    { label: 'Training & academy', to: { kind: 'training' }, on: is('training') },
    { label: 'Everyone', to: { kind: 'people', view: 'everyone' }, on: (r) => r.kind === 'people' && r.view === 'everyone' },
  ],
  arms: [
    { label: 'The Crucible', to: { kind: 'crucible' }, on: is('crucible') },
    { label: 'Circuit & tourneys', to: { kind: 'grounds' }, on: is('grounds') },
    { label: 'Knights & challenges', to: { kind: 'knights' }, on: is('knights') },
    { label: 'Fleet', to: { kind: 'fleet' }, on: (r) => r.kind === 'fleet' || r.kind === 'ship' },
  ],
  realm: [
    { label: 'Star map', to: { kind: 'worlds' }, on: (r) => r.kind === 'worlds' || r.kind === 'planet' || r.kind === 'sector' || r.kind === 'port' },
    { label: 'Holdings', to: { kind: 'holdings' }, on: is('holdings') },
    { label: 'Build', to: { kind: 'build' }, on: is('build') },
    { label: 'Houses', to: { kind: 'houses' }, on: (r) => r.kind === 'houses' || r.kind === 'house' },
    { label: 'Numarade', to: { kind: 'numarade' }, on: is('numarade') },
    { label: 'Annals & frontier', to: { kind: 'history' }, on: (r) => r.kind === 'history' || r.kind === 'frontier' },
    { label: 'Embassies', to: { kind: 'embassies' }, on: is('embassies') },
    { label: 'Lanes & corsairs', to: { kind: 'lanes' }, on: is('lanes') },
  ],
  treasury: [
    { label: 'Ledger & exchange', to: { kind: 'economy' }, on: is('economy') },
    { label: 'Loans', to: { kind: 'loans' }, on: is('loans') },
    { label: 'Vaults', to: { kind: 'vaults' }, on: is('vaults') },
    { label: 'Pay & great works', to: { kind: 'spend' }, on: is('spend') },
  ],
  missions: [
    { label: 'Board', to: { kind: 'missions' }, on: (r) => r.kind === 'missions' || r.kind === 'mission' },
    { label: 'Investigate', to: { kind: 'plan', mission: 'investigate' }, on: (r) => r.kind === 'plan' && r.mission === 'investigate' },
    { label: 'Scout', to: { kind: 'plan', mission: 'scout' }, on: (r) => r.kind === 'plan' && r.mission === 'scout' },
    { label: 'Envoy', to: { kind: 'plan', mission: 'envoy' }, on: (r) => r.kind === 'plan' && r.mission === 'envoy' },
  ],
};

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
    case 'house': return `House ${world.houses[r.id]?.name ?? world.archon?.houses[r.id]?.name ?? r.id}`;
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
    case 'grounds': return 'Circuit & tourneys';
    case 'knights': return 'Knights';
    case 'fleet': return 'Fleet';
    case 'embassies': return 'Embassies';
    case 'loans': return 'Loans';
    case 'vaults': return 'Vaults';
    case 'build': return 'Build';
    case 'spend': return 'Pay & great works';
    case 'lanes': return 'Lanes & corsairs';
    case 'numarade': return 'The Numarade';
    case 'history': return 'Annals of the Archon';
    case 'frontier': return 'The frontier';
    case 'newgame': return 'New game';
    case 'ship': return (world as unknown as { fleet?: { ships: Record<string, { name: string }> } }).fleet?.ships[r.id]?.name ?? 'Ship';
  }
}
