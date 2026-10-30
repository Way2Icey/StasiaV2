import { SPECIES } from '../data/species';
import { TRAITS, TRAITS_BY_ID, type TraitDef } from '../data/traits';
import { TORVANN_SCAR_NAMES } from '../data/cultures';
import { generateName } from './names';
import type { Rng } from './rng';
import { addCycles, CYCLES_PER_YEAR, yearsBetween, type GameDate } from './time';
import {
  ALL_STATS,
  HIDDEN_STATS,
  type Character,
  type CouncilSeat,
  type FlagInstance,
  type HiddenStats,
  type PersonName,
  type Resonance,
  type ResonanceBand,
  type Sex,
  type SpeciesId,
  type StatId,
  type Stats,
  type Tier,
  type TraitInstance,
  type World,
} from './types';

// ---------------------------------------------------------------- roles

/** Which stats each kind of role leans on. */
const ROLE_FOCUS: Record<string, StatId[]> = {
  ruler: ['leadership', 'diplomacy', 'law', 'insight', 'composure'],
  grandMaster: ['tactics', 'leadership', 'logistics', 'siegecraft', 'discipline'],
  envoy: ['diplomacy', 'negotiation', 'eloquence', 'insight'],
  spymaster: ['intrigue', 'deception', 'insight', 'perception', 'stealth'],
  steward: ['stewardship', 'law', 'negotiation', 'logistics'],
  physician: ['intellect', 'perception', 'composure'],
  elder: ['law', 'eloquence', 'insight', 'willpower'],
  champion: ['duelling', 'valor', 'strength', 'reflexes', 'caigeSync'],
  knight: ['duelling', 'valor', 'discipline', 'marksmanship', 'tactics'],
  scholar: ['intellect', 'perception', 'law'],
  overseer: ['stewardship', 'logistics', 'leadership'],
  noble: ['diplomacy', 'eloquence', 'intrigue'],
  labourer: ['strength', 'endurance', 'constitution'],
  trader: ['negotiation', 'insight', 'stewardship'],
  rogue: ['stealth', 'deception', 'agility', 'intrigue'],
  child: [],
};

const SEAT_FOCUS: Record<CouncilSeat, string> = {
  highroy: 'ruler',
  grandMaster: 'grandMaster',
  envoy: 'envoy',
  spymaster: 'spymaster',
  steward: 'steward',
  physician: 'physician',
  elder: 'elder',
  champion: 'champion',
  masterOfRites: 'elder',
};

const MARTIAL_FOCI = new Set(['grandMaster', 'champion', 'knight', 'labourer']);

// ---------------------------------------------------------------- spec

export interface CharacterSpec {
  houseId: string;
  familyId: string;
  species: SpeciesId;
  role: string;
  /** Kind of role, for stat focus (see ROLE_FOCUS). */
  focus: keyof typeof ROLE_FOCUS | string;
  tier: Tier;
  location: { planetId: string; sectorId: string };
  sex?: Sex;
  /** Exact age in years; otherwise rolled from the species' adult range. */
  age?: number;
  seat?: CouncilSeat;
  /** Fixed name parts (anchor characters from the design docs). */
  name?: Partial<PersonName>;
  /** If given, these replace rolled traits. */
  traits?: TraitInstance[];
  flags?: Omit<FlagInstance, 'since'>[];
  knighted?: boolean;
  /** Fixed resonance; `null` forces none; undefined rolls it. */
  resonance?: Resonance | null;
}

// ---------------------------------------------------------------- helpers

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function bandFor(degrees: number): ResonanceBand {
  if (degrees >= 400) return 'whitebreak';
  if (degrees >= 250) return 'redline';
  if (degrees >= 120) return 'ambercore';
  if (degrees >= 50) return 'bluewake';
  return 'frostpoint';
}

function rollResonance(rng: Rng, martial: boolean): Resonance {
  const roll = rng.next();
  const boost = martial ? 0.06 : 0;
  let degrees: number;
  if (roll < 0.008 + boost / 6) degrees = rng.int(250, 330);
  else if (roll < 0.06 + boost) degrees = rng.int(120, 249);
  else if (roll < 0.24 + boost) degrees = rng.int(50, 119);
  else degrees = rng.int(0, 49);
  const type = rng.weighted([['magnetic', 5], ['gravitic', 5], ['drift', 1]] as const);
  return { degrees, band: bandFor(degrees), type };
}

/** Age in years at a given date. */
export function ageOf(c: Character, date: GameDate): number {
  return yearsBetween(c.birth, date);
}

function rollAge(rng: Rng, species: SpeciesId, focus: string): number {
  const sp = SPECIES[species];
  const life = (sp.lifespan[0] + sp.lifespan[1]) / 2;
  if (focus === 'child') return rng.int(2, Math.max(3, sp.adulthood - 2));
  const hi = Math.round(life * (focus === 'elder' ? 0.85 : 0.7));
  // Rulers and council members are established adults, not youths.
  const senior = ['ruler', 'grandMaster', 'envoy', 'spymaster', 'steward', 'physician'].includes(focus);
  const minAge =
    focus === 'elder' ? Math.round(life * 0.55)
    : senior ? Math.round(sp.adulthood + life * 0.15)
    : sp.adulthood;
  return rng.int(minAge, Math.max(minAge, hi));
}

function rollTraits(rng: Rng, spec: CharacterSpec, age: number): TraitInstance[] {
  const chosen: TraitInstance[] = [];
  const has = (id: string) => chosen.some((t) => t.id === id);
  const blocked = (def: TraitDef) =>
    has(def.id) || chosen.some((t) => TRAITS_BY_ID[t.id]?.opposes?.includes(def.id) || def.opposes?.includes(t.id));
  const add = (pool: TraitDef[]) => {
    const options = pool.filter((d) => !blocked(d));
    if (options.length > 0) chosen.push({ id: rng.pick(options).id });
  };

  const born = TRAITS.filter((t) => t.category === 'born');
  const temperament = TRAITS.filter(
    (t) => t.category === 'learned' && ['honourBound', 'ruthless', 'merciful', 'ambitious', 'generous', 'proud', 'humble', 'brave', 'wrathful', 'paranoid', 'trusting', 'silverTongued'].includes(t.id),
  );
  const training: Record<string, string[]> = {
    knight: ['duelistsCreed', 'tactician'],
    champion: ['duelistsCreed'],
    grandMaster: ['tactician'],
    envoy: ['courtier', 'linguist'],
    spymaster: ['streetWise', 'linguist'],
    scholar: ['archivist'],
    physician: ['healer'],
    elder: ['archivist', 'courtier'],
    ruler: ['courtier', 'archivist', 'tactician'],
    rogue: ['streetWise'],
    noble: ['courtier'],
  };

  // Rare: most people have none or one born trait.
  if (rng.chance(spec.tier === 'full' ? 0.35 : 0.2)) add(born);
  if (rng.chance(0.05)) add(born);
  if (spec.focus !== 'child') {
    if (rng.chance(spec.tier === 'full' ? 0.75 : 0.45)) add(temperament);
    if (rng.chance(0.12)) add(temperament);
    const train = training[spec.focus];
    const trainChance = spec.focus === 'noble' ? 0.25 : 0.5;
    if (train && rng.chance(trainChance)) add(train.map((id) => TRAITS_BY_ID[id]!).filter(Boolean));
  }

  // Earned traits come from a life lived: older, martial people more often.
  const adult = SPECIES[spec.species].adulthood;
  const martial = MARTIAL_FOCI.has(spec.focus);
  if (age > adult + 8 && rng.chance(martial ? 0.22 : 0.06)) {
    const earned = rng.weighted([
      ['battleScarred', martial ? 4 : 1],
      ['heroOf', martial ? 2 : 0.5],
      ['victorOf', martial ? 2 : 0.3],
      ['survivorOf', 2],
    ] as const);
    const details: Record<string, string[]> = {
      heroOf: ['the Ninefold Skirmish', 'the Serath Lane', 'Kesh Breach', 'the Long Wall'],
      victorOf: ['the Kessar Pits', 'the Gransuche Sands', 'the Spire Tourney'],
      survivorOf: ['the Y409 Dock Fire', 'the Ember Deep collapse', 'the Varo Purge', 'the Lantern Wreck'],
    };
    const pool = details[earned];
    chosen.push(pool ? { id: earned, detail: rng.pick(pool) } : { id: earned });
  }
  if (spec.species === 'torvann' && martial && age > adult + 5 && rng.chance(0.3)) {
    chosen.push({ id: 'scarName', detail: rng.pick(TORVANN_SCAR_NAMES) });
  }
  return chosen;
}

function rollStats(rng: Rng, spec: CharacterSpec, age: number, traits: TraitInstance[]): Stats {
  const sp = SPECIES[spec.species];
  const focus = new Set(ROLE_FOCUS[spec.focus] ?? []);
  const life = (sp.lifespan[0] + sp.lifespan[1]) / 2;
  const young = age < sp.adulthood;
  const old = age > life * 0.75;
  const stats = {} as Stats;
  const tierBonus = spec.tier === 'full' ? 1 : -1;

  for (const id of ALL_STATS) {
    let v = 7 + rng.gauss() * 2.2 + tierBonus;
    if (focus.has(id)) v += 4 + rng.next() * 3;
    v += sp.statMods[id] ?? 0;
    for (const t of traits) v += TRAITS_BY_ID[t.id]?.statMods?.[id] ?? 0;
    if (young) v -= 3;
    if (old && ['strength', 'agility', 'endurance', 'reflexes', 'constitution'].includes(id)) v -= 3;
    if (old && ['insight', 'law', 'composure'].includes(id)) v += 1;
    stats[id] = clamp(Math.round(v), 1, 20);
  }
  return stats;
}

function rollHidden(rng: Rng, spec: CharacterSpec, stats: Stats, traits: TraitInstance[]): HiddenStats {
  const hidden = {} as HiddenStats;
  for (const id of HIDDEN_STATS) hidden[id] = clamp(Math.round(10 + rng.gauss() * 3.5), 1, 20);
  hidden.loyalty = clamp(Math.round(13 + rng.gauss() * 3), 1, 20);
  hidden.drift = clamp(Math.round(4 + rng.gauss() * 2.5 - SPECIES[spec.species].driftResistance), 0, 20);
  const avg = ALL_STATS.reduce((s, id) => s + stats[id], 0) / ALL_STATS.length;
  hidden.potential = clamp(Math.round(avg + 3 + rng.next() * 6), 1, 20);
  for (const t of traits) {
    const mods = TRAITS_BY_ID[t.id]?.hiddenMods ?? {};
    for (const [k, v] of Object.entries(mods)) {
      const key = k as keyof HiddenStats;
      hidden[key] = clamp(hidden[key] + (v ?? 0), 0, 20);
    }
  }
  return hidden;
}

// ---------------------------------------------------------------- create

export function createCharacter(world: World, rng: Rng, spec: CharacterSpec): Character {
  const sp = SPECIES[spec.species];
  const family = world.families[spec.familyId];
  if (!family) throw new Error(`unknown family ${spec.familyId}`);

  const sex: Sex = spec.sex ?? (rng.chance(0.5) ? 'f' : 'm');
  const age = spec.age ?? rollAge(rng, spec.species, spec.focus);
  // Born somewhere in the year `age` years before today.
  const birth = addCycles(world.date, -(age * CYCLES_PER_YEAR + rng.int(0, CYCLES_PER_YEAR - 1)));

  const traits = spec.traits ?? rollTraits(rng, spec, age);
  const stats = rollStats(rng, spec, age, traits);
  const hidden = rollHidden(rng, spec, stats, traits);

  const martial = MARTIAL_FOCI.has(spec.focus);
  const knighted = spec.knighted ?? (spec.focus === 'knight' || spec.focus === 'champion');
  const scar = traits.find((t) => t.id === 'scarName')?.detail;
  const generated = generateName(rng, { species: spec.species, family, sex, knighted, epithet: scar });
  const name: PersonName = { ...generated, ...spec.name };

  const lifespanBonus = traits.reduce((s, t) => s + (TRAITS_BY_ID[t.id]?.lifespanBonus ?? 0), 0);
  const lifespan = Math.max(age + 1, rng.int(sp.lifespan[0], sp.lifespan[1]) + lifespanBonus);

  const resonance = spec.resonance === undefined ? rollResonance(rng, martial) : spec.resonance;

  const flags: FlagInstance[] = (spec.flags ?? []).map((f) => ({ ...f, since: world.date }));
  if (knighted && !flags.some((f) => f.id === 'knighted')) flags.push({ id: 'knighted', since: world.date });
  if (resonance && resonance.degrees >= 120 && martial && rng.chance(0.6) && !flags.some((f) => f.id === 'caigeBonded')) {
    flags.push({ id: 'caigeBonded', since: world.date });
  }
  if (name.callsign) flags.push({ id: 'callsign', since: world.date, detail: name.callsign });

  const id = `c${world.nextId++}`;
  const character: Character = {
    id,
    houseId: spec.houseId,
    familyId: spec.familyId,
    species: spec.species,
    sex,
    name,
    birth,
    lifespan,
    tier: spec.tier,
    role: spec.role,
    seat: spec.seat,
    stats,
    hidden,
    traits,
    flags,
    resonance,
    location: spec.location,
    alive: true,
  };
  world.characters[id] = character;
  return character;
}

export function focusForSeat(seat: CouncilSeat): string {
  return SEAT_FOCUS[seat];
}
