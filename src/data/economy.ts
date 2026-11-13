// What the economy runs on: othes (the currency, a promise backed by a house's
// word) and the five resources from the design document. Components are made,
// not mined. Figures are per Phase unless they say otherwise.

export const GOODS = ['navisium', 'metals', 'provisions', 'fuel', 'components'] as const;
export type Good = (typeof GOODS)[number];
export type Resource = 'othes' | Good;
export const RESOURCES: Resource[] = ['othes', ...GOODS];

export const RESOURCE_LABEL: Record<Resource, string> = {
  othes: 'Othes',
  navisium: 'Navisium',
  metals: 'Metals',
  provisions: 'Provisions',
  fuel: 'Fuel',
  components: 'Components',
};

export const RESOURCE_NOTE: Record<Resource, string> = {
  othes: 'The currency: a promise. Your honour sets what your othes buy.',
  navisium: 'Rationed by the Numarade each Orbit. Caiges, shard weapons; refined into fuel and components.',
  metals: 'From mines and foundries. Ships, armour, construction.',
  provisions: 'From farms and mills. Every person eats; a shortage breeds unrest.',
  fuel: 'Refined from Navisium and energy. Jumps, shields, fleets.',
  components: 'Made from Navisium and metals. Weapons, machines, Caige work.',
};

/** Starting Imperial Exchange prices, in othes per unit. */
export const BASE_PRICE: Record<Good, number> = {
  navisium: 40,
  metals: 6,
  provisions: 4,
  fuel: 15,
  components: 60,
};

export type Flow = Partial<Record<Resource, number>>;

export interface QuarterEconomy {
  /** Per Phase. Negative = consumed or paid. */
  flow: Flow;
  /** Computing capacity per Orbit. */
  computing?: number;
  /** A trade or market quarter whose takings an overseer can skim. */
  takings?: boolean;
}

/** Quarter economics, by quarter name. Quarters not listed cost and make nothing. */
export const QUARTER_ECONOMY: Record<string, QuarterEconomy> = {
  // Alerion Prime
  'The Citadel': { flow: { othes: -200 } },
  'The Unbroken Vault': { flow: { othes: -150 } },
  'Embassy Row': { flow: { othes: -120 } },
  'Citadel Garrison': { flow: { othes: -600, provisions: -60 } },
  'Starport Nine': { flow: { othes: 2100, fuel: -5 }, takings: true },
  'The Cargo Yards': { flow: { othes: 500 }, takings: true },
  'Ninth Market': { flow: { othes: 600 }, takings: true },
  'Shipwright Annex': { flow: { othes: -150, metals: -20 } },
  'Kessmere Terraces': { flow: { provisions: 310 } },
  'Mill Town': { flow: { provisions: 90, othes: 120 } },
  'Greyspire Foundries': { flow: { metals: 220 } },
  'Fuel Refinery': { flow: { navisium: -20, fuel: 60 } },
  'Shard Works': { flow: { navisium: -10, metals: -30, components: 10 } },
  'The Data Halls': { flow: { othes: -100 }, computing: 160 },
  'Alerion Academy': { flow: { othes: -100 } },
  'Signals School': { flow: { othes: -80 } },
  'Deepcut Mines': { flow: { metals: 120 } },
  'Varek Hall': { flow: { othes: -80 } },
  'Holdfast Garrison': { flow: { othes: -375, provisions: -40 } },
  // Ashfall (Torvann)
  'The Caldera Seat': { flow: { othes: -200 } },
  'Hall of Scars': { flow: { othes: -150, provisions: -30 } },
  'Ember Shafts': { flow: { metals: 260 } },
  'The Long Wall': { flow: { othes: -400, provisions: -50 } },
  // Serath Reach
  'The Perch': { flow: { othes: -200 } },
  'Tailwind Docks': { flow: { othes: 1500, fuel: -5 }, takings: true },
  'Scout School': { flow: { othes: -100 } },
  'The Arrays': { flow: { othes: -120 }, computing: 60 },
  // Lyreth (Shaaliin)
  'The Mirror Court': { flow: { othes: -200 } },
  'The Grand Theatre': { flow: { othes: -150 } },
  'The Whisper Floor': { flow: { othes: 900 }, takings: true },
};

/**
 * Rival houses own more than their capital, but only capitals are modelled in
 * the slice. Their other holdings send this much home each Phase.
 */
export const ESTATES: Record<string, Flow> = {
  torvann: { othes: 1500, provisions: 300, metals: 60 },
  serath: { othes: 700, provisions: 150 },
  shaaliin: { othes: 800, provisions: 150 },
};

/** Othes per person per Phase at the normal tax rate. */
export const TAX_PER_PERSON = 0.002;
/** People per unit of provisions eaten per Phase. */
export const PEOPLE_PER_PROVISION = 1800;
/** Stipend per council seat per Phase. */
export const STIPEND = 60;

export type TaxRate = 'low' | 'normal' | 'high';
export const TAX: Record<TaxRate, { factor: number; unrest: number; label: string; note: string }> = {
  low: { factor: 0.6, unrest: -1, label: 'Low', note: 'Less coin; sectors calm by 1 a Phase.' },
  normal: { factor: 1, unrest: 0, label: 'Normal', note: 'The customary rate.' },
  high: { factor: 1.4, unrest: 1, label: 'High', note: 'More coin; sectors grow restless by 1 a Phase.' },
};

/** What sending people out costs, in othes, before the Quick surcharge (+50%). */
export const MISSION_COST = { investigate: 150, scout: 100, envoy: 250 } as const;

/** Developing a sector: cost of each new piece of construction. */
export const DEVELOP_COST: Flow = { othes: 300, metals: 40 };

/** Navisium quota per Orbit before standing. */
export const QUOTA_BASE = { great: 300, minor: 120 } as const;

export const STARTING_STOCK: Record<string, Record<Resource, number>> = {
  alerion: { othes: 5000, navisium: 150, metals: 400, provisions: 900, fuel: 120, components: 20 },
  torvann: { othes: 6000, navisium: 300, metals: 600, provisions: 700, fuel: 200, components: 40 },
  serath: { othes: 4500, navisium: 120, metals: 150, provisions: 500, fuel: 150, components: 10 },
  shaaliin: { othes: 5500, navisium: 120, metals: 100, provisions: 450, fuel: 80, components: 10 },
};
