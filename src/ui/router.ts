import { displayName } from '../sim/names';
import { findSector } from '../sim/query';
import type { CouncilSeat, World } from '../sim/types';
import { SEAT_TITLE } from '../sim/world';
import { TRAITS_BY_ID } from '../data/traits';
import { FLAGS_BY_ID } from '../data/flags';
import { SPECIES } from '../data/species';

export type Route =
  | { kind: 'throne' }
  | { kind: 'people'; focus?: string; view?: 'opinions' | 'guards' | 'web' | 'factions' | 'ambitions' | 'young' | 'everyone' | 'renown' }
  | { kind: 'houses' }
  | { kind: 'worlds' }
  | { kind: 'save' }
  | { kind: 'missions' }
  | { kind: 'bounties' }
  | { kind: 'intel' }
  | { kind: 'greatSeats' }
  | { kind: 'military' }
  | { kind: 'boards' }
  | { kind: 'talk'; id: string }
  | { kind: 'mission'; id: string }
  | { kind: 'plan'; mission: 'investigate' | 'scout' | 'envoy'; target?: string; leader?: string; petition?: string; lead?: string }
  | { kind: 'council' }
  | { kind: 'seat'; id: CouncilSeat }
  | { kind: 'economy' }
  | { kind: 'exchange' }
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
  | { kind: 'rankings' }
  | { kind: 'history' }
  | { kind: 'legacy' }
  | { kind: 'chair' }
  | { kind: 'places' }
  | { kind: 'frontier' }
  | { kind: 'newgame' }
  | { kind: 'war' }
  | { kind: 'ship'; id: string }
  | { kind: 'log'; person?: string; place?: string; house?: string; open?: string };

export type Section = 'hall' | 'court' | 'people' | 'arms' | 'realm' | 'archon' | 'treasury' | 'missions' | 'log' | 'save' | 'glossary';

/** Which rail section a page belongs to: grouped by what the Highroy is doing, not by what things are. */
export function sectionOf(r: Route): Section | null {
  switch (r.kind) {
    case 'throne': return 'hall';
    case 'council': case 'seat': case 'greatSeats': return 'court';
    case 'people': return r.view === 'ambitions' ? 'court' : r.view === 'renown' ? 'realm' : 'people';
    case 'character': case 'talk': case 'trait': case 'flag': case 'species': case 'band': case 'family': return 'people';
    case 'military': case 'training': case 'crucible': case 'grounds': case 'knights': case 'fleet': case 'ship': case 'war': return 'arms';
    case 'worlds': case 'planet': case 'sector': case 'port': case 'holdings': case 'build': case 'lanes': case 'frontier': case 'places': return 'realm';
    case 'houses': case 'house': case 'embassies': case 'numarade': case 'history': case 'chair': case 'legacy': case 'rankings': return 'archon';
    case 'economy': case 'exchange': case 'loans': case 'vaults': case 'spend': return 'treasury';
    case 'missions': case 'mission': case 'plan': case 'bounties': case 'intel': case 'boards': return 'missions';
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
  { id: 'people', label: 'HOUSE', key: '3', home: { kind: 'people' } },
  { id: 'arms', label: 'ARMS', key: '4', home: { kind: 'military' } },
  { id: 'realm', label: 'REALM', key: '5', home: { kind: 'worlds' } },
  { id: 'archon', label: 'ARCHON', key: '6', home: { kind: 'rankings' } },
  { id: 'treasury', label: 'TREASURY', key: '7', home: { kind: 'economy' } },
  { id: 'missions', label: 'MISSIONS', key: '8', home: { kind: 'missions' } },
  { id: 'log', label: 'LOG', key: '9', home: { kind: 'log' }, utility: true },
  { id: 'save', label: 'SAVE', key: '0', home: { kind: 'save' }, utility: true },
  { id: 'glossary', label: 'GLOSSARY', key: '?', home: { kind: 'glossary' }, utility: true },
];

export interface SubTab { label: string; to: Route; on: (r: Route) => boolean; /** Shown only when this holds (or when it is the page open). */ show?: (w: World) => boolean }
const is = (k: Route['kind']) => (r: Route) => r.kind === k;
/** Each section's strip of tabs: every feature at most two clicks from the rail. */
export const SUBTABS: Partial<Record<Section, SubTab[]>> = {
  court: [
    { label: 'Council', to: { kind: 'council' }, on: (r) => r.kind === 'council' || r.kind === 'seat' },
    { label: 'Audiences & ambitions', to: { kind: 'people', view: 'ambitions' }, on: (r) => r.kind === 'people' && r.view === 'ambitions' },
    { label: 'Seats of the court', to: { kind: 'greatSeats' }, on: is('greatSeats') },
  ],
  people: [
    { label: 'The House', to: { kind: 'people' }, on: (r) => r.kind === 'people' && !r.focus && r.view !== 'web' },
    { label: 'Ties', to: { kind: 'people', view: 'web' }, on: (r) => r.kind === 'people' && (r.view === 'web' || !!r.focus) },
  ],
  arms: [
    { label: 'Military', to: { kind: 'military' }, on: is('military') },
    { label: 'Fleet', to: { kind: 'fleet' }, on: (r) => r.kind === 'fleet' || r.kind === 'ship' },
    { label: 'Knights & challenges', to: { kind: 'knights' }, on: is('knights') },
    { label: 'Training & academy', to: { kind: 'training' }, on: is('training') },
    { label: 'Circuit & tourneys', to: { kind: 'grounds' }, on: is('grounds') },
    { label: 'The Crucible', to: { kind: 'crucible' }, on: is('crucible') },
    { label: 'War', to: { kind: 'war' }, on: is('war') },
  ],
  realm: [
    { label: 'Star map', to: { kind: 'worlds' }, on: (r) => r.kind === 'worlds' || r.kind === 'planet' || r.kind === 'sector' || r.kind === 'port' },
    { label: 'Holdings & build', to: { kind: 'holdings' }, on: (r) => r.kind === 'holdings' || r.kind === 'build' },
    { label: 'Places', to: { kind: 'places' }, on: is('places') },
    { label: 'Frontier', to: { kind: 'frontier' }, on: is('frontier') },
    { label: 'Lanes & corsairs', to: { kind: 'lanes' }, on: is('lanes') },
    { label: 'Renown', to: { kind: 'people', view: 'renown' }, on: (r) => r.kind === 'people' && r.view === 'renown' },
  ],
  archon: [
    { label: 'Rankings', to: { kind: 'rankings' }, on: is('rankings') },
    { label: 'Numarade', to: { kind: 'numarade' }, on: is('numarade') },
    { label: 'Houses', to: { kind: 'houses' }, on: (r) => r.kind === 'houses' || r.kind === 'house' },
    { label: 'The Chair', to: { kind: 'chair' }, on: is('chair'), show: (w) => w.archon?.houses[w.playerHouseId]?.tier === 'great' || w.archon?.numarade.exarchon?.houseId === w.playerHouseId },
    { label: 'Annals', to: { kind: 'history' }, on: is('history') },
    { label: 'Our legacy', to: { kind: 'legacy' }, on: is('legacy') },
  ],
  treasury: [
    { label: 'Ledger', to: { kind: 'economy' }, on: is('economy') },
    { label: 'The Exchange', to: { kind: 'exchange' }, on: is('exchange') },
    { label: 'Loans', to: { kind: 'loans' }, on: is('loans') },
    { label: 'Vaults', to: { kind: 'vaults' }, on: is('vaults') },
    { label: 'Pay & great works', to: { kind: 'spend' }, on: is('spend') },
  ],
  missions: [
    { label: 'Missions', to: { kind: 'missions' }, on: (r) => r.kind === 'missions' || r.kind === 'mission' || r.kind === 'plan' || r.kind === 'boards' },
    { label: 'Bounties', to: { kind: 'bounties' }, on: (r) => r.kind === 'bounties' },
    { label: 'Cells & intel', to: { kind: 'intel' }, on: (r) => r.kind === 'intel' },
  ],
};

export function sameRoute(a: Route, b: Route): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function routeLabel(world: World, r: Route): string {
  switch (r.kind) {
    case 'throne': return 'Hall';
    case 'people': return r.view === 'ambitions' ? 'Audiences & ambitions' : r.view === 'renown' ? 'Renown' : r.view === 'web' || r.focus ? 'Ties' : 'The House';
    case 'houses': return 'Houses';
    case 'rankings': return 'Rankings';
    case 'worlds': return 'Star map';
    case 'save': return 'Save & Load';
    case 'missions': return 'Missions';
    case 'bounties': return 'Bounties';
    case 'intel': return 'Cells & intel';
    case 'greatSeats': return 'Seats of the court';
    case 'military': return 'Military';
    case 'boards': return 'The boards';
    case 'talk': return `Audience · ${world.characters[r.id]?.name.given ?? ''}`;
    case 'council': return 'Council';
    case 'seat': return SEAT_TITLE[r.id];
    case 'economy': return 'Ledger';
    case 'exchange': return 'The Exchange';
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
    case 'legacy': return 'Legacy';
    case 'chair': return 'The Chair';
    case 'places': return 'Places';
    case 'frontier': return 'The frontier';
    case 'newgame': return 'New game';
    case 'war': return 'War';
    case 'ship': return (world as unknown as { fleet?: { ships: Record<string, { name: string }> } }).fleet?.ships[r.id]?.name ?? 'Ship';
  }
}
