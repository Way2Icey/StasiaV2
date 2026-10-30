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
};
