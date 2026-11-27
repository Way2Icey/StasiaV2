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
  | 'gholari'
  // 6.0: the peoples of the other canon houses.
  | 'human'
  | 'varngotha'
  | 'azurian'
  | 'myrelic'
  | 'velarai'
  | 'tavari'
  | 'korenite'
  | 'murnath'
  | 'draychi';

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
  /** 0..100: how they feel about their house right now. Full-tier people only. */
  mood?: number;
  /** When they last came home from a mission. */
  lastMission?: GameDate;
  /** In the Household (out of the Circle) since this year: of the house, but no longer followed (circle.ts). */
  veiled?: number;
  /** Kept in the Circle by the player's choice. */
  pinned?: boolean;
  /** What they carry from the fights they have been in: wounds, grudges, feats, habits others noticed. */
  marks?: import('./details').Mark[];
  /** Absolute cycle they last had a part in a story. */
  seen?: number;
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
  /** Standing at court and in the Numarade. */
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

/** What sort of happening a record is, for the Log page's filters. */
export type RecordType =
  | 'decision' | 'mission' | 'port' | 'seizure' | 'raid' | 'fight' | 'death' | 'birth' | 'intrigue'
  | 'captive' | 'council' | 'politics' | 'discovery' | 'economy' | 'world' | 'time' | 'condition';

/** 0 routine, 1 notable, 2 serious, 3 grave. */
export type Severity = 0 | 1 | 2 | 3;

/**
 * One happening, the same shape whatever it was: the Log page, a person's
 * record, a port's log and the Chronicle are all filtered views of these.
 */
export interface FeedEntry {
  /** Set on records written since the log was unified. */
  id?: string;
  date: GameDate;
  kind: 'time' | 'death' | 'birth' | 'flag' | 'world' | 'mission' | 'council' | 'intrigue';
  /** The headline. */
  text: string;
  characterIds?: string[];
  missionId?: string;
  type?: RecordType;
  severity?: Severity;
  /** A sector or planet id. */
  placeId?: string;
  /** People and the part they played. */
  who?: { id: string; part: string }[];
  /** A short account beyond the headline. */
  detail?: string;
  /** What changed, as ledger-style lines. */
  effects?: string[];
  /** Who told us, and how sure. */
  source?: string;
  shipId?: string;
  houseIds?: string[];
  /** The record that led to this one. */
  causeId?: string;
  /** Which councillor brings it to the Highroy (else worked out from what it is). */
  seat?: import('./reports').Reporter;
  /** The original words of a letter: who wrote it, and what they said. */
  quote?: { from: string; text: string };
  /** An account of what happened, from someone who was there. */
  account?: import('./details').Account;
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
  /** The lead this mission is following up, if any. */
  leadId?: string;
  /** Up to two people riding with the leader. */
  companions?: string[];
  /** Pupils brought along to learn: a teacher's own charges, or one the academy sent. */
  pupils?: string[];
  /** Party members the Highroy ordered to go against their wishes. */
  forced?: string[];
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
  /** Those at court who stand behind it. */
  backers?: string[];
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
  /** When the Elder last gave counsel. */
  lastCounsel?: GameDate;
}

export interface Captive {
  characterId: string;
  heldBy: string;
  since: GameDate;
  /** The mission they were caught on. */
  missionId?: string;
  interrogated: boolean;
  /** A ransom offer or demand, if one has been made. */
  ransom?: { amount: number; expires: GameDate; status: 'open' | 'refused' | 'paid' };
  /** Which cells they are kept in. */
  cellId?: string;
  treatment?: import('./holdings').Treatment;
  reason?: import('./holdings').HoldReason;
  /** Questioning: how much resolve they have left, and how it was worn down. */
  cell?: import('./turning').Cell;
}

// ---------------------------------------------------------------- economy

export type ResourceId = 'othes' | 'navisium' | 'metals' | 'provisions' | 'fuel' | 'components';
export type GoodId = Exclude<ResourceId, 'othes'>;

export interface LedgerLine {
  resource: ResourceId;
  /** Per Phase for standing flows; the amount for one-off entries. */
  amount: number;
  label: string;
  kind: 'quarter' | 'tax' | 'food' | 'stipend' | 'skim' | 'quota' | 'trade' | 'mission' | 'develop' | 'ransom' | 'steward' | 'audit' | 'boon' | 'court' | 'port' | 'raid' | 'forces' | 'war';
  sectorId?: string;
  quarterId?: string;
  characterId?: string;
}

export interface HouseEconomy {
  stock: Record<ResourceId, number>;
  tax: 'low' | 'normal' | 'high';
  /** Navisium granted by the Numarade last Orbit. */
  quota: number;
  /** One-off entries since the Phase began (trades, missions, ransoms). */
  recent: (LedgerLine & { date: GameDate })[];
  /** The standing flows as applied at the last Phase. */
  lastPhase: LedgerLine[];
  /** Temporary income from deals and finds. */
  boons: Boon[];
  /** How the house arms its legions: 0 old issue .. 3 the finest in the Archon. */
  equip?: 0 | 1 | 2 | 3;
  /** What the house spends on the ceremonies its station owes. */
  ceremony?: 'modest' | 'fitting' | 'lavish';
  /** 0..100: the credibility of the house's othes, which are bound commitments. Defaults cost it. */
  credibility?: number;
  /** The year the house last held a festival for the Realm. */
  festivalYear?: number;
  /** Othes in and out this year and last, by kind. */
  tally?: Record<string, number>;
  lastTally?: Record<string, number>;
}

export interface MarketGood {
  price: number;
  /** Price at the end of each recent Phase, oldest first. */
  history: number[];
  /** Net units bought (positive) or sold this Phase. */
  pressure: number;
}

export interface Economy {
  houses: Record<string, HouseEconomy>;
  market: Record<GoodId, MarketGood>;
  /** Where the last scan for ceremonies owed left off (absolute cycle), and the ranks it saw. */
  ceremonyScan?: { at: number; ranks: Record<string, string> };
  /** How the house pays its knights, champion and councillors. */
  payScale?: 'meagre' | 'fair' | 'generous';
  /** Events out in the Archon pulling prices away from the usual. */
  shocks?: import('./arcs_economy').Shock[];
  /** The last Exchange crash, and how far along it is. */
  crash?: { at: number; stage: 0 | 1 | 2 | 3; asker?: string };
  /** The regional markets, the orders on them, and the Steward's standing orders (exchange.ts). */
  exchange?: import('./exchange').ExchangeState;
}

// ---------------------------------------------------------------- discoveries

export interface Caige {
  id: string;
  name: string;
  type: ResonanceType;
  band: ResonanceBand;
  houseId: string;
  found: GameDate;
  foundAt: { planetId: string; sectorId: string };
  bondedTo?: string;
  /** 0..100: how steady its navisium is while it sits in a vault. */
  stability?: number;
  vaultId?: string;
  /** Put up as security for a loan from this house. */
  pledgedTo?: string;
  /** The souls held in it (canon: their will against the wielder's). */
  souls?: import('./scenes_power').Soul[];
  /** Caige Density Index once bonded: 0..1, never 1. */
  cdi?: number;
  /** The shape it takes in the bearer's hand. */
  form?: string;
  /** How many transmuted states it allows (rarely two). */
  forms?: number;
}

/** Who in the house wants a prospect, and what for. */
export interface Proposal { kind: 'academy' | 'tutor' | 'retainer'; sponsorId?: string; moduleId?: string; subject: 'arms' | 'command' | 'statecraft' | 'intrigue' | 'resonance' | 'learning' }

export interface Lead {
  id: string;
  houseId: string;
  kind: 'caige' | 'recruit' | 'site' | 'secret';
  title: string;
  text: string;
  planetId: string;
  sectorId: string;
  /** Mission that follows it up (none for a recruit, who is approached directly). */
  missionKind?: MissionKind;
  /** The person concerned: the recruit, or the person with a secret. */
  targetId?: string;
  /** For a recruit: what it costs to bring them in. */
  cost?: number;
  /** For a prospect: who in the house wants them, and for what. */
  proposal?: Proposal;
  /** How they came to our notice. */
  noticedBy?: string;
  found: GameDate;
  expires: GameDate;
  sourceMissionId?: string;
}

export interface Boon {
  id: string;
  label: string;
  flow: Partial<Record<ResourceId, number>>;
  until: GameDate;
}

export type Stance = 'friendly' | 'neutral' | 'opposed';

export interface World {
  version: 11;
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
  /** Everyone held by a house, keyed by character id. */
  captives: Record<string, Captive>;
  economy: Economy;
  /** Caiges held by houses, by id. */
  armoury: Record<string, Caige>;
  /** Opportunities turned up by missions, waiting for a decision. */
  leads: Lead[];
  /** Each house's own record of its doings: births, recruits, Caiges. Private entries are learned by looking. */
  annals: Record<string, { date: GameDate; text: string; public: boolean; characterIds?: string[] }[]>;
  /** lastLooked[observer][house]: when the observer last had a good look at that house. */
  lastLooked: Record<string, Record<string, GameDate>>;
  /** stances[house][other]: the public line a house takes toward another. */
  stances: Record<string, Record<string, Stance>>;
  /** Keys of news items the player has already answered publicly. */
  answered: string[];
  /** Nobles have been given occupations (idle, court helper, envoy, knight). */
  householdReady?: boolean;
  /** Decisions waiting on the Highroy, and how past ones went. */
  events: import('./events').EventState;
  /** Ships through our ports, raids, the watchlist. */
  ports: import('./ports').PortsState;
  /** Who feels what about whom. */
  ties: import('./relationships').Ties;
  /** Cells, vaults and academies; prisoners; rescues and heists under way. */
  holdings: import('./holdings').HoldingsState;
  /** Money lent between houses, and requests waiting for an answer. */
  loans: import('./loans').LoansState;
  /** Tutoring, drill, academies and wards between houses. */
  training: import('./training').TrainingState;
  /** Great ships of every house. */
  fleet: import('./fleet').FleetState;
  /** Every house's embassy in every other house's capital. */
  embassies: import('./embassies').EmbassiesState;
  /** What people want, and who has come to the Highroy about it. */
  ambitions: import('./ambitions').AmbitionsState;
  /** Every deed counted by season, titles won, and who the Highroy follows. */
  careers: import('./careers').CareersState;
  /** Every house of the Archon on the register, the Numarade, the history and the frontier. */
  archon?: import('./archon').ArchonState;
  /** Forces, wars, tribute, hostages and fealty. */
  war?: import('./war').WarState;
  /** Live scenes: sessions, negotiations, rituals, infiltrations, audiences, ceremonies, crises, the chronicle. */
  scenes?: import('./scene').ScenesState;
  /** The year's mock war. */
  crucible: import('./crucible').CrucibleState;
  grounds: import('./grounds').GroundsState;
  ladder: import('./ladder').LadderState;
  treasury: import('./treasury').TreasuryState;
  /** Convoys on the lanes, the corsair companies, customs posts and deals. */
  lanes: import('./lanes').LanesState;
  /** The renown tier each person last reached (for news when it rises). */
  renown?: Record<string, string>;
  /** Aims, alliances, feuds and the Numarade's favour. */
  realm: import('./houses').RealmState;
  /** The storyteller's pace, arcs under way, threads on people, long struggles. */
  story?: import('./storystate').StoryState;
  /** The Exarchon's chair: promises, legitimacy, guards on our people, and the chair itself when it is ours. */
  chair?: import('./chair').ChairState;
  places?: import('./places').PlacesState;
  /** Prices on heads, and the people who collect them. */
  bounties?: import('./bounties').BountyState;
  /** What our cells and our agents have given us, and the wrongs that give a reason for war. */
  intel?: import('./turning').IntelState;
  /** What the Highroy ordered on the court's concerns, being carried out. */
  orders?: import('./concerns').Order[];
  /** What each seat saw last time it reported, to say what changed. */
  seatNotes?: Record<string, { at: number; snap: Record<string, number> }>;
  /** The council at the door: what needs the Highroy, one councillor at a time. */
  briefings?: import('./briefings').BriefState;
  /** The house's measure each Phase, the last ten. */
  since?: import('./since').Snapshot[];
  /** The Grand Master's board of deeds. */
  quests?: import('./quests').QuestState;
  /** Concerns the court has brought to the Highroy. */
  concerns?: import('./concerns').Concern[];
  /** People asking to see the Highroy. */
  talkRequests?: import('./talk').TalkRequest[];
  /** The audience under way, if any. */
  talk?: import('./talk').Talk;
  /** What each person remembers of talking with us. */
  talks?: Record<string, import('./talk').TalkMemory>;
  /** Battles under way or waiting to be watched. */
  battles?: import('./battle').BattlesState;
}
