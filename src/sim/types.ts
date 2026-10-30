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
  /** How the house stands among the Houses of Archon, each 0..100. */
  standing: Standing;
}

export interface Standing {
  /** Keeping your word: oaths kept, debts paid. */
  honour: number;
  /** Standing at court and in the Numerade. */
  respect: number;
  /** How much the others fear you. */
  dread: number;
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
  kind: 'time' | 'death' | 'birth' | 'flag' | 'world' | 'mission' | 'council';
  text: string;
  characterIds?: string[];
  missionId?: string;
}

// ---------------------------------------------------------------- knowledge

/** What one house knows about one person. */
export interface KnowledgeEntry {
  /** 0..100: how deeply the house knows this person. */
  depth: number;
  updated: GameDate;
  /** Changes whenever new intelligence arrives, reshuffling estimates. */
  salt: number;
}

// ---------------------------------------------------------------- missions

export type MissionKind = 'investigate' | 'scout' | 'envoy';
export type Approach = 'careful' | 'quick';
export type MissionStage = 'travel' | 'task' | 'return' | 'done';
export type Outcome = 'triumph' | 'success' | 'partial' | 'failure' | 'disaster';

export interface Mission {
  id: string;
  kind: MissionKind;
  houseId: string;
  leaderId: string;
  /** Investigate: the person being looked into. */
  targetId?: string;
  /** Envoy: the house being courted. */
  targetHouseId?: string;
  targetPlanetId: string;
  targetSectorId: string;
  approach: Approach;
  stage: MissionStage;
  launched: GameDate;
  stageEnds: GameDate;
  travelCycles: number;
  taskCycles: number;
  origin: { planetId: string; sectorId: string };
  progress: number;
  rolls: number;
  noticed: boolean;
  /** Whether the leader realised they were noticed. */
  leaderKnowsNoticed: boolean;
  outcome?: Outcome;
  ended?: GameDate;
  log: { date: GameDate; text: string }[];
  report?: string;
  findings?: string[];
}

// ---------------------------------------------------------------- council

export interface TaskAssignment {
  task: string;
  /** A house or sector id, for tasks that need one. */
  target?: string;
  since: GameDate;
  /** Builds each turn; a result lands when it passes the task's threshold. */
  progress: number;
}

export interface OathState {
  id: string;
  target?: string;
  sworn: GameDate;
  ends: GameDate;
  /** Where the measure stood when the oath was sworn. */
  baseline: number;
}

export interface OathRecord {
  id: string;
  target?: string;
  sworn: GameDate;
  ended: GameDate;
  result: 'kept' | 'broken' | 'abandoned';
}

export interface Petition {
  id: string;
  date: GameDate;
  expires: GameDate;
  fromId: string;
  kind: MissionKind;
  leaderId: string;
  targetId?: string;
  targetPlanetId?: string;
  targetHouseId?: string;
  reason: string;
}

export interface CouncilReport {
  date: GameDate;
  seat: CouncilSeat;
  characterId: string;
  text: string;
}

export interface Court {
  tasks: Partial<Record<CouncilSeat, TaskAssignment>>;
  oath: OathState | null;
  oaths: OathRecord[];
  petitions: Petition[];
  reports: CouncilReport[];
}

export interface World {
  version: 3;
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
  /** knowledge[observerHouseId][characterId] */
  knowledge: Record<string, Record<string, KnowledgeEntry>>;
  missions: Record<string, Mission>;
  /** relations[a][b]: how house a regards house b, -100..100. */
  relations: Record<string, Record<string, number>>;
  courts: Record<string, Court>;
}
