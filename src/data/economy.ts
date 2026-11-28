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
  'Starport Nine': { flow: { othes: 1300, fuel: -5 }, takings: true },
  'The Cargo Yards': { flow: { othes: 500 }, takings: true },
  'Ninth Market': { flow: { othes: 600 }, takings: true },
  'Shipwright Annex': { flow: { othes: -150, metals: -20 } },
  'Kessmere Terraces': { flow: { provisions: 310 } },
  'Mill Town': { flow: { provisions: 90, othes: 120 } },
  'Greyspire Foundries': { flow: { metals: 220 } },
  'Fuel Refinery': { flow: { navisium: -20, fuel: 35 } },
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
 * Rival houses own more than their capital, but only capitals are modelled in the slice. Their other
 * holdings make and use this much each Phase, and each house has its own shape: Torvann is a forge
 * that cannot feed its monks and soldiers; Serath is a fleet of fast ships always short of fuel and
 * metal, though its sensor works turn out fine components; Shaaliin's gardens feed half the Reaches and its workshops make fine components, but it has no
 * mines. What one lacks another has, so they trade, and what they ship can be taken.
 */
export const ESTATES: Record<string, Flow> = {
  // Alerion (canon): one or two worlds, six to eight research stations. Its stations make components and sell
  // learning; its second world's farms nearly feed it, and what it lacks it buys with what it makes.
  alerion: { othes: 220, components: 22, provisions: 210 },
  // Torvann: the largest legions in the Archon, fed from their own terraces and paid from the mines.
  torvann: { othes: 3000, metals: 240, provisions: 1000, fuel: 25, navisium: -20, components: -8 },
  // Serath: fast ships, always short of fuel.
  serath: { othes: 1400, provisions: 230, fuel: -20, components: 8, navisium: -15, metals: -40 },
  shaaliin: { othes: 900, provisions: 420, components: 12, metals: -60, fuel: -15, navisium: -10 },
};

// ---------------------------------------------------------------- rates (9.26)
// Every system draws on the same six pools. These are the unit costs everything else is built from.

/** Soldiers per unit of provisions a Phase: at home, and in the field (where food travels and spoils). */
export const SOLDIERS_PER_PROVISION = { home: 400, field: 200 } as const;
/** Crew per unit of provisions a Phase, aboard ships. */
export const CREW_PER_PROVISION = 300;
/** Fuel to cross one lane, by kind of hull. */
export const FUEL_PER_LANE = { fighter: 0.1, gunship: 0.25, destroyer: 0.75, cruiser: 1.5 } as const;
export const GREAT_FUEL_PER_LANE: Record<string, number> = { flagship: 5, carrier: 3, cruiser: 1.5, destroyer: 0.75 };
/** Troopships: fuel per lane per 1,000 soldiers carried (a host of 40,000 burns 10 a lane). */
export const TROOP_FUEL_PER_LANE = 0.25;
/** Ships on station burn this share of a lane's fuel each Phase. */
export const STATION_FUEL_SHARE = 0.25;
/** A fight wears arms and ships: components per soldier and per hull in it; a little navisium for the shard arms. */
export const FIGHT_WEAR = { soldiersPerComponent: 2000, componentsPerHull: 0.3, soldiersPerNavisium: 10000, hullsPerNavisium: 20 } as const;
/** Shard arms in the field are re-alloyed: soldiers per unit of navisium a Phase. */
export const REALLOY_SOLDIERS_PER_NAVISIUM = 5000;
/** A Caige kept in a vault: navisium a Phase to keep it stable. */
export const CAIGE_NAVISIUM = 2;
/** Raising (or replacing) forces: per 1,000 soldiers, per hull, per sworn blade. */
export const RAISE_BILL = {
  legion: { othes: 300, metals: 40, components: 5 },
  fleet: { othes: 1200, metals: 30, components: 6 },
  company: { othes: 3, metals: 0.2, components: 0 },
} as const;
/** Building: per level of a module, on top of its othes. */
export const MODULE_GOODS_PER_LEVEL = { metals: 80, components: 10 } as const;
/** A great ship takes this many metals per component of its build. */
export const GREAT_SHIP_METALS_PER_COMPONENT = 8;

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
  alerion: { othes: 5000, navisium: 150, metals: 400, provisions: 900, fuel: 300, components: 60 },
  // Torvann keeps war stores: the largest legions in the Archon do not march on an empty granary.
  torvann: { othes: 9000, navisium: 300, metals: 600, provisions: 2400, fuel: 700, components: 120 },
  serath: { othes: 4500, navisium: 120, metals: 150, provisions: 500, fuel: 150, components: 10 },
  shaaliin: { othes: 5500, navisium: 120, metals: 100, provisions: 450, fuel: 80, components: 10 },
};
