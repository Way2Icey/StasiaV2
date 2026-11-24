// Places of the Archon that are not worlds: the stations the houses hold (relays, mining deeps, yards and
// fortresses), outposts claimed on the frontier, the landmarks of the canon, the sites of the past, and the
// Virella, which no empire has found twice in the same year. A station held is income and a place to lose;
// one taken in war is a grievance that never closes.
import { Rng } from './rng';
import type { LedgerLine, World } from './types';
import type { Wild } from './frontier';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export type SiteKind = 'relay' | 'mining' | 'yards' | 'fortress' | 'outpost' | 'landmark' | 'ruin' | 'moving';
export const SITE_LABEL: Record<SiteKind, string> = {
  relay: 'Relay station', mining: 'Mining deep', yards: 'Orbital yards', fortress: 'Fortress station', outpost: 'Frontier outpost',
  landmark: 'Landmark', ruin: 'Site of the past', moving: 'Moving city',
};
type Res = 'othes' | 'metals' | 'navisium' | 'components' | 'provisions';

export interface Site {
  id: string;
  name: string;
  kind: SiteKind;
  region: string;
  note: string;
  /** Who holds it: a house id, or nobody. Landmarks and ruins may be held by no one. */
  holder?: string | null;
  /** The house it was taken from, and when: a grievance that does not close. */
  takenFrom?: { houseId: string; year: number };
  since?: number;
  /** Soldiers stationed there. */
  garrison: number;
  /** Walls, guns, shields: what an assault must overcome beyond the garrison. */
  defence: number;
  /** What it gives its holder each Phase, and costs to keep. */
  yields: Partial<Record<Res, number>>;
  upkeep: number;
  overseerId?: string | null;
  /** Whether we know of it. */
  known: boolean;
  /** A site of the past that has been explored. */
  explored?: boolean;
  /** A frontier world it stands on. */
  wildId?: string;
  /** Can it be taken at all. */
  holdable: boolean;
  /** For the Virella: seen until this absolute cycle. */
  sightedUntil?: number;
}

export interface PlacesState {
  sites: Record<string, Site>;
  /** An expedition to a site of the past: who went, and when they come back. */
  expeditions: { siteId: string; personId: string; returns: number }[];
}

const STATION_NAMES = ['Kett', 'Varo', 'Ossin', 'Brael', 'Thune', 'Mirehold', 'Calden', 'Iske', 'Orrow', 'Sabre', 'Hollin', 'Vael', 'Darrow', 'Quill', 'Asker', 'Tamsk'];
const RUIN = [
  { name: 'the Field of Gray Ash', note: 'A battlefield of the War for Life: a moon still carpeted in broken armour, where two legions fought for eleven years.' },
  { name: 'the Choir Station', note: 'A station that went dark in the Silence with its whole crew aboard. On some frequencies it still sings.' },
  { name: 'the Rend Scar', note: 'Where the Rend tore deepest. The ground hums. Navisium dug there comes up heavier than it went in.' },
  { name: 'the Ninth Crusade Anchorage', note: 'Where Vaelor Primus\'s crusade fleets gathered, two thousand years ago. The moorings still stand in the dark.' },
  { name: 'the Quiet Archive', note: 'A records station of the old Archon, abandoned when contact between the stars ceased. Its doors are sealed from inside.' },
  { name: 'the Ossuary of Ships', note: 'A graveyard of hulls from the War for Peace, towed together by someone, for some reason, long ago.' },
];

/** Whoever holds the most: the places of the Archon, built once per game. */
export function ensurePlaces(w: World): PlacesState {
  if (w.places?.sites) { w.places.expeditions ??= []; return w.places; }
  const rng = Rng.fromSeed(`${w.seed}/places`);
  const sites: Record<string, Site> = {};
  const add = (s: Omit<Site, 'id'>) => { const id = `site${Object.keys(sites).length + 1}`; sites[id] = { id, ...s }; return sites[id]!; };
  const regions = ['the Reaches', 'the Shallows', 'the Drift Margin', 'the Old Front', 'the Silent Belt', 'the Ember Verge'];
  // The landmarks of the canon: known to all, held by no one, or by the house the canon gives them to.
  add({ name: 'The Seat of the Numarade', kind: 'landmark', region: 'the heart of the Archon', note: 'The fortified citadel where the High Council sits and the Exarchon presides: the administrative and ceremonial centre of the Archon.', holder: null, garrison: 0, defence: 0, yields: {}, upkeep: 0, known: true, holdable: false });
  add({ name: 'The navisium world', kind: 'landmark', region: 'the Silent Belt', note: 'The remote world where navisium is found and harvested at a very high price. Every house\'s quota comes from here, by the Numarade\'s leave.', holder: null, garrison: 0, defence: 0, yields: {}, upkeep: 0, known: true, holdable: false });
  if (w.archon?.houses['alerion']) add({ name: 'The Vault of Unbreakable Caiges', kind: 'landmark', region: 'the Reaches', note: 'House Alerion\'s vault, on its core world: the neurological records of key individuals and the house\'s long history, kept in Caiges no one can break.', holder: 'alerion', garrison: 0, defence: 0, yields: {}, upkeep: 0, known: true, holdable: false });
  for (const [name, note] of [
    ['The Neutral Drift Belt', 'A Breakline corridor. Lanes no house charts; convoys that should not exist move through it.'],
    ['The Ulamar Lanes', 'A Breakline corridor: the way goods move when the official lanes are shut.'],
    ['The Sector Nine relay', 'A relay Breakline keeps running for its own traffic. No house admits to using it; every house does.'],
  ] as const) add({ name, kind: 'landmark', region: 'beyond the charts', note, holder: null, garrison: 0, defence: 0, yields: {}, upkeep: 0, known: true, holdable: false });
  add({ name: 'The Virella', kind: 'moving', region: 'unknown', note: 'Breakline\'s city in motion: a converted dreadnought carrier, gambling dens and bazaars on its upper decks, an arbitration hall on the seventh. No empire has found it twice in the same year. No blood on the Virella.', holder: null, garrison: 0, defence: 0, yields: {}, upkeep: 0, known: false, holdable: false });
  // The houses' stations.
  const names = rng.shuffle(STATION_NAMES);
  let n = 0;
  const station = (holder: string, kind: 'relay' | 'mining' | 'yards' | 'fortress', region: string) => {
    const base = names[n++ % names.length]!;
    const def = { relay: { y: { othes: 180 }, up: 30, d: 6, g: 800, nm: `${base} Relay` }, mining: { y: { metals: 5, navisium: rng.chance(0.3) ? 1 : 0 }, up: 40, d: 5, g: 600, nm: `the ${base} Deep` }, yards: { y: { components: 4 }, up: 60, d: 9, g: 1200, nm: `the ${base} Yards` }, fortress: { y: { othes: 80 }, up: 90, d: 20, g: 3000, nm: `${base} Bastion` } }[kind];
    const y = Object.fromEntries(Object.entries(def.y).filter(([, v]) => v)) as Partial<Record<Res, number>>;
    return add({ name: def.nm, kind, region, note: { relay: 'A relay station on the lanes: tolls, traffic, and ears on everything that passes.', mining: 'A mining station on a barren moon: metals, and sometimes a seam of navisium.', yards: 'Orbital yards: components forged in the cold, and slips for small craft.', fortress: 'A fortress station guarding the approaches: shields, turrets and a garrison that has never been told to stand down.' }[kind], holder, since: w.date.year, garrison: def.g, defence: def.d, yields: y, upkeep: def.up, known: holder === w.playerHouseId || rng.chance(0.6), holdable: true });
  };
  for (const h of Object.values(w.houses)) {
    const region = rng.pick(regions);
    station(h.id, 'relay', region);
    station(h.id, 'mining', rng.pick(regions));
    if (h.tier === 'great') station(h.id, rng.chance(0.5) ? 'yards' : 'fortress', region);
  }
  for (const h of Object.values(w.archon?.houses ?? {})) if (!w.houses[h.id] && !h.ended && h.tier === 'great') station(h.id, rng.pick(['relay', 'mining', 'fortress'] as const), rng.pick(regions));
  for (const r of rng.shuffle(RUIN).slice(0, 5)) add({ name: r.name.replace(/^the /, 'The '), kind: 'ruin', region: rng.pick(regions), note: r.note, holder: null, garrison: 0, defence: 0, yields: {}, upkeep: 0, known: rng.chance(0.25), holdable: false });
  w.places = { sites, expeditions: [] };
  return w.places;
}

export const sitesOf = (w: World, houseId: string): Site[] => Object.values(w.places?.sites ?? {}).filter((s) => s.holder === houseId);
export const knownSites = (w: World): Site[] => Object.values(w.places?.sites ?? {}).filter((s) => s.known);

/** How well an overseer runs a place: stewardship, mostly. */
function overseerMult(w: World, s: Site): number {
  const o = s.overseerId ? w.characters[s.overseerId] : undefined;
  return o?.alive && o.houseId === s.holder ? 1 + (o.stats.stewardship - 8) / 30 : 0.85;
}

/** What a house's places give and cost each Phase. */
export function siteLines(w: World, houseId: string): LedgerLine[] {
  const out: LedgerLine[] = [];
  for (const s of sitesOf(w, houseId)) {
    if (!s.holdable) continue;
    const m = overseerMult(w, s);
    for (const [r, v] of Object.entries(s.yields) as [Res, number][]) if (v) out.push({ resource: r, amount: Math.round(v * m), label: s.name, kind: 'quarter' });
    if (s.upkeep) out.push({ resource: 'othes', amount: -s.upkeep - Math.round(s.garrison * 0.01), label: `Keeping ${s.name}`, kind: 'stipend' });
  }
  return out;
}

/** What it takes to take a place: walls, garrison, and the holder's arms. */
export function siteDefence(_w: World, s: Site): number {
  return s.defence + Math.sqrt(s.garrison) / 2;
}

/** A place changes hands. */
export function transferSite(w: World, s: Site, to: string, how: string): void {
  const from = s.holder ?? undefined;
  if (from && from !== to) s.takenFrom = { houseId: from, year: w.date.year };
  if (s.takenFrom?.houseId === to) delete s.takenFrom;
  s.holder = to;
  s.since = w.date.year;
  s.overseerId = null;
  s.garrison = Math.round(s.garrison * 0.4) + 300;
  if (to === w.playerHouseId || from === w.playerHouseId) s.known = true;
  void how;
}

/** Places taken from a house that it still wants back. */
export const grievedSites = (w: World, us: string, them: string): Site[] => Object.values(w.places?.sites ?? {}).filter((s) => s.holder === them && s.takenFrom?.houseId === us);

/** A frontier outpost on a wild world. */
export function outpostFor(w: World, wild: Wild, holder: string): Site {
  const ps = ensurePlaces(w);
  const id = `site${Object.keys(ps.sites).length + 1}`;
  const r = wild.riches;
  const yields: Partial<Record<Res, number>> = {};
  if (r.metals > 0.3) yields.metals = Math.round(r.metals * 6);
  if (r.provisions > 0.3) yields.provisions = Math.round(r.provisions * 6);
  if (r.navisium > 0.4) yields.navisium = 1;
  if (!Object.keys(yields).length) yields.othes = 60;
  ps.sites[id] = { id, name: `${wild.name} Outpost`, kind: 'outpost', region: wild.region, note: `An outpost on ${wild.name}: ${wild.note}`, holder, since: w.date.year, garrison: 400, defence: 3, yields, upkeep: 50, known: true, holdable: true, wildId: wild.id };
  return ps.sites[id]!;
}

export function setSiteOverseer(input: World, siteId: string, personId: string | null): World {
  const w = structuredClone(input);
  const s = w.places?.sites[siteId];
  if (!s || s.holder !== w.playerHouseId) throw new Error('Not ours.');
  if (personId && w.characters[personId]?.houseId !== w.playerHouseId) throw new Error('Not one of ours.');
  s.overseerId = personId;
  if (personId) { const c = w.characters[personId]!; delete c.veiled; c.tier = 'full'; c.seen = undefined; }
  return w;
}

/** Send soldiers to a place, or call them home. A garrison costs to keep. */
export function setGarrison(input: World, siteId: string, garrison: number): World {
  const w = structuredClone(input);
  const s = w.places?.sites[siteId];
  if (!s || s.holder !== w.playerHouseId) throw new Error('Not ours.');
  s.garrison = clamp(Math.round(garrison), 100, 8000);
  return w;
}
