import type { GameDate } from './time';
import type { RngState } from './rng';

// ---------------------------------------------------------------- species

export type SpeciesId =
  | 'fokari'
  | 'thessari'
  | 'torvann'
  | 'serathi'
  | 'shaaliin'
  | 'doven'
  | 'gholari';

// ---------------------------------------------------------------- stats

export const MIND_STATS = [
  'tactics', 'logistics', 'fleetCommand', 'siegecraft',
  'diplomacy', 'negotiation', 'eloquence',
  'intrigue', 'deception', 'insight',
  'stewardship', 'law', 'intellect', 'perception',
] as const;

export const BODY_STATS = [
  'strength', 'endurance', 'agility', 'constitution',
  'duelling', 'marksmanship', 'reflexes', 'stealth', 'painTolerance',
] as const;

export const SPIRIT_STATS = [
  'willpower', 'composure', 'determination',
  'valor', 'leadership', 'discipline',
  'caigeSync', 'resonanceControl',
] as const;

export const ALL_STATS = [...MIND_STATS, ...BODY_STATS, ...SPIRIT_STATS] as const;
export type StatId = (typeof ALL_STATS)[number];

export const HIDDEN_STATS = [
  'loyalty', 'drift', 'ambition', 'greed', 'consistency',
  'nerve', 'temperament', 'discretion', 'potential',
] as const;
export type HiddenStatId = (typeof HIDDEN_STATS)[number];

export type Stats = Record<StatId, number>;
export type HiddenStats = Record<HiddenStatId, number>;

// ---------------------------------------------------------------- traits & flags

export type TraitCategory = 'born' | 'learned' | 'earned';

export interface TraitInstance {
  id: string;
  /** For earned traits that name a place or deed: "the Kessar Pits". */
  detail?: string;
}

export type FlagVisibility = 'all' | 'secret';

export interface FlagInstance {
  id: string;
  since: GameDate;
  /** When the flag lapses on its own, if it does. */
  until?: GameDate;
  detail?: string;
  /** Secret flags are known only to the houses listed in `knownBy`. */
  knownBy?: string[];
}

// ---------------------------------------------------------------- names

export interface PersonName {
  given: string;
  /** Family or line name, if the culture uses one. */
  family?: string;
  /** Torvann: the hold that raised them. */
  hold?: string;
  /** Torvann scar-name, earned. */
  epithet?: string;
  /** Serathi callsign. */
  callsign?: string;
  /** Shaaliin: name used among Shaaliin. */
  courtName?: string;
  /** Shaaliin: almost no one knows it. */
  trueName?: string;
  /** Honorific shown before the name: "Ser", "Lord". */
  title?: string;
}

// ---------------------------------------------------------------- people

export type Tier = 'full' | 'minor';
export type Sex = 'f' | 'm';

export type ResonanceBand = 'frostpoint' | 'bluewake' | 'ambercore' | 'redline' | 'whitebreak';
export type ResonanceType = 'magnetic' | 'gravitic' | 'drift';

export interface Resonance {
  degrees: number;
  band: ResonanceBand;
  type: ResonanceType;
}

export interface Character {
  id: string;
  houseId: string;
  familyId: string;
  species: SpeciesId;
  sex: Sex;
  name: PersonName;
  birth: GameDate;
  /** Age (in years) at which this person dies of old age if nothing else kills them. */
  lifespan: number;
  tier: Tier;
  /** Position in the house: "Highroy", "Grand Master", "Knight", "Dockworker"… */
  role: string;
  /** Council seat, if any. */
  seat?: CouncilSeat;
  stats: Stats;
  hidden: HiddenStats;
  traits: TraitInstance[];
  flags: FlagInstance[];
  resonance: Resonance | null;
  location: { planetId: string; sectorId: string };
  alive: boolean;
  death?: { date: GameDate; cause: string };
}

// ---------------------------------------------------------------- houses

export type HouseTier = 'great' | 'minor';

export type CouncilSeat =
  | 'highroy'
  | 'grandMaster'
  | 'envoy'
  | 'spymaster'
  | 'steward'
  | 'physician'
  | 'elder'
  | 'champion'
  | 'masterOfRites';

export interface House {
  id: string;
  name: string;
  tier: HouseTier;
  /** Species of the ruling lines. */
  species: SpeciesId;
  /** Which naming culture its people use by default. */
  culture: SpeciesId;
  /** Top families carry the house name as surname (all except Alerion). */
  houseNameSurnames: boolean;
  capitalPlanetId: string;
  rulerId: string | null;
  /** Personality weights 0..1 used by rival-house behaviour later. */
  personality: Record<'aggression' | 'honour' | 'greed' | 'intrigue' | 'piety' | 'isolation', number>;
  blurb: string;
}

export interface Family {
  id: string;
  houseId: string;
  name: string;
  species: SpeciesId;
  /** The ruling family of the house. */
  ruling: boolean;
  /** Close to the top: carries the house name where the house does that. */
  high: boolean;
}

// ---------------------------------------------------------------- places

export type PortLevel = 'none' | 'landing field' | 'spaceport' | 'starport';

export interface Quarter {
  id: string;
  name: string;
  kind: string;
  gives: string;
  overseerId: string | null;
}

export interface Sector {
  id: string;
  name: string;
  designation: string;
  port: PortLevel;
  room: number;
  roomUsed: number;
  population: number;
  unrest: number;
  controllerFamilyId: string | null;
  peoples: Partial<Record<SpeciesId, number>>;
  description: string;
  quarters: Quarter[];
}

export interface Planet {
  id: string;
  name: string;
  houseId: string;
  description: string;
  sectorLimit: number;
  sectors: Sector[];
}

// ---------------------------------------------------------------- world

export interface FeedEntry {
  date: GameDate;
  kind: 'time' | 'death' | 'birth' | 'flag' | 'world';
  text: string;
  characterIds?: string[];
}

export interface World {
  version: 1;
  seed: string;
  date: GameDate;
  rng: RngState;
  playerHouseId: string;
  nextId: number;
  houses: Record<string, House>;
  families: Record<string, Family>;
  characters: Record<string, Character>;
  planets: Record<string, Planet>;
  feed: FeedEntry[];
}
