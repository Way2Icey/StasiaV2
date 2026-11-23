import type { SpeciesId, StatId } from '../sim/types';

export interface SpeciesProfile {
  id: SpeciesId;
  name: string;
  /** Lifespan range in years (from the species sheets in the vault). */
  lifespan: [number, number];
  /** Age at which they count as adults. */
  adulthood: number;
  /** Natural strengths and weaknesses, added to rolled stats. */
  statMods: Partial<Record<StatId, number>>;
  /** Base drift resistance: added to Willpower when resisting the Drift. */
  driftResistance: number;
  /** One-line note shown on character sheets. */
  note: string;
}

export const SPECIES: Record<SpeciesId, SpeciesProfile> = {
  fokari: {
    id: 'fokari',
    name: 'Fokari',
    lifespan: [180, 230],
    adulthood: 30,
    statMods: { intellect: 3, perception: 3, insight: 2, tactics: 1, strength: -3, constitution: -2, endurance: -1, reflexes: 2 },
    driftResistance: 4,
    note: 'Near-perfect memory after 30; light, hollow-boned; resistant to neural drift.',
  },
  thessari: {
    id: 'thessari',
    name: 'Thessari',
    lifespan: [100, 120],
    adulthood: 18,
    statMods: { strength: 2, endurance: 2, painTolerance: 2, discipline: 2, tactics: 1, duelling: 1 },
    driftResistance: 1,
    note: 'Horned, thick-hided martial philosophers; dulled pain, strong moral code.',
  },
  torvann: {
    id: 'torvann',
    name: 'Torvann',
    lifespan: [70, 110],
    adulthood: 18,
    statMods: { strength: 4, endurance: 3, constitution: 3, painTolerance: 3, agility: -2, stealth: -3, siegecraft: 1 },
    driftResistance: 1,
    note: 'Tusked giants with dermal plating; warrior-monks, poets and tacticians.',
  },
  serathi: {
    id: 'serathi',
    name: 'Serathi',
    lifespan: [65, 100],
    adulthood: 16,
    statMods: { agility: 3, reflexes: 3, stealth: 3, perception: 2, strength: -2, constitution: -1 },
    driftResistance: 0,
    note: 'Small, quick and tailed; prized as scouts, analysts and infiltrators.',
  },
  shaaliin: {
    id: 'shaaliin',
    name: 'Shaaliin',
    lifespan: [60, 95],
    adulthood: 16,
    statMods: { deception: 4, eloquence: 2, agility: 2, intrigue: 2, insight: 1, strength: -1 },
    driftResistance: 0,
    note: 'Mimics: skin and voice change at will; diplomats, performers, spies.',
  },
  doven: {
    id: 'doven',
    name: 'Doven',
    lifespan: [85, 120],
    adulthood: 18,
    statMods: { endurance: 2, constitution: 2, logistics: 2, stewardship: 1, intellect: 1, agility: -1 },
    driftResistance: 1,
    note: 'Dense-boned builders and engineers; resistant to pressure and toxins.',
  },
  gholari: {
    id: 'gholari',
    name: 'Gholari',
    lifespan: [120, 150],
    adulthood: 25,
    statMods: { insight: 4, diplomacy: 2, law: 2, perception: 2, deception: -2 },
    driftResistance: 2,
    note: 'Mouthless, four-eyed; they smell emotion and lies and speak through scent.',
  },
  human: {
    id: 'human',
    name: 'Human',
    lifespan: [75, 110],
    adulthood: 18,
    statMods: { determination: 1, diplomacy: 1 },
    driftResistance: 0,
    note: 'The most common people of the Archon; the ruling lines of Lumen and Myr, and many lesser houses.',
  },
  varngotha: {
    id: 'varngotha',
    name: "Varn'Gotha",
    lifespan: [120, 180],
    adulthood: 30,
    statMods: { strength: 5, constitution: 4, endurance: 3, painTolerance: 4, agility: -3, stealth: -4, perception: -1, willpower: 2 },
    driftResistance: 3,
    note: 'Pale titans with skin inches thick and scars set with metal and glass; semi-divine to some, ruled by the Council of the Sharded.',
  },
  azurian: {
    id: 'azurian',
    name: 'Azurian',
    lifespan: [120, 170],
    adulthood: 20,
    statMods: { diplomacy: 3, negotiation: 3, eloquence: 2, law: 2, composure: 2, strength: -1 },
    driftResistance: 2,
    note: 'Pale blue, gold-eyed and white-haired; resistant to psychic pressure, with a faint aura that disarms hostility.',
  },
  myrelic: {
    id: 'myrelic',
    name: 'Myrelic',
    lifespan: [100, 160],
    adulthood: 20,
    statMods: { intellect: 3, insight: 2, diplomacy: 2, perception: 1, strength: -1 },
    driftResistance: 1,
    note: 'Near-human, with glowing freckles and slit pupils; mildly psionic, keepers of theory and history.',
  },
  velarai: {
    id: 'velarai',
    name: 'Velarai',
    lifespan: [140, 170],
    adulthood: 22,
    statMods: { eloquence: 3, insight: 2, diplomacy: 2, perception: 2, duelling: -2, strength: -1 },
    driftResistance: 1,
    note: 'Tall and iridescent, with harmonic voices; philosophers, artists and pacifists.',
  },
  tavari: {
    id: 'tavari',
    name: 'Tavari',
    lifespan: [120, 150],
    adulthood: 20,
    statMods: { agility: 2, perception: 2, diplomacy: 2, fleetCommand: 1, strength: -2, constitution: -1 },
    driftResistance: 2,
    note: 'Lithe and faintly luminous, with a gravity sense along the spine; mediators, navigators and builders of floating cities.',
  },
  korenite: {
    id: 'korenite',
    name: "Ko'renite",
    lifespan: [80, 100],
    adulthood: 16,
    statMods: { logistics: 2, siegecraft: 2, constitution: 2, tactics: 1, intellect: 1, eloquence: -2 },
    driftResistance: 1,
    note: 'Three-eyed insectoids in geometric chitin; forge-masters and shipwrights.',
  },
  murnath: {
    id: 'murnath',
    name: 'Murnath',
    lifespan: [90, 130],
    adulthood: 18,
    statMods: { intellect: 2, stewardship: 2, agility: 2, siegecraft: 1, constitution: -1 },
    driftResistance: 1,
    note: 'Many-armed and silk-spinning; architects of spires and fortresses, philosophers who write in woven glyphs.',
  },
  draychi: {
    id: 'draychi',
    name: 'Draychi',
    lifespan: [70, 100],
    adulthood: 15,
    statMods: { constitution: 3, endurance: 2, logistics: 2, strength: 1, eloquence: -2, agility: -1 },
    driftResistance: 1,
    note: 'Short, shelled and tailed; ocean engineers, and the vassals of House Myr.',
  },
};
