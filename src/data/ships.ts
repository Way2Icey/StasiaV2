// Ships and the things they carry, for port traffic.

export type ShipClass =
  | 'bulk hauler' | 'freighter' | 'tramp freighter' | 'grain barge' | 'courier'
  | 'liner' | 'yacht' | 'frigate' | 'small craft';

export interface ShipClassDef {
  crew: [number, number];
  /** Cargo units it can carry; 0 for ships that carry people or letters. */
  hold: [number, number];
  /** Passengers it can carry. */
  berths: [number, number];
}

export const SHIP_CLASSES: Record<ShipClass, ShipClassDef> = {
  'bulk hauler': { crew: [8, 20], hold: [300, 600], berths: [0, 2] },
  'freighter': { crew: [6, 14], hold: [100, 300], berths: [0, 4] },
  'tramp freighter': { crew: [4, 10], hold: [40, 150], berths: [0, 6] },
  'grain barge': { crew: [6, 12], hold: [400, 900], berths: [0, 1] },
  'courier': { crew: [2, 5], hold: [0, 10], berths: [1, 3] },
  'liner': { crew: [12, 30], hold: [10, 40], berths: [30, 120] },
  'yacht': { crew: [3, 8], hold: [0, 10], berths: [1, 6] },
  'frigate': { crew: [40, 80], hold: [20, 60], berths: [2, 10] },
  'small craft': { crew: [1, 3], hold: [5, 30], berths: [0, 2] },
};

export const SHIP_ADJECTIVES = [
  'Gilded', 'Seventh', 'Pale', 'Quiet', 'Ardent', 'Patient', 'Iron', 'Last', 'Silver', 'Hollow',
  'Burning', 'Faithful', 'Long', 'Salt', 'Crooked', 'Distant', 'Second', 'Honest', 'Bitter', 'Bright',
  'Grey', 'Lucky', 'Broken', 'Sworn', 'Red', 'Cold', 'Wandering', 'Narrow', 'Heavy', 'Tenth',
];

export const SHIP_NOUNS = [
  'Wake', 'Mercy', 'Lantern', 'Ledger', 'Claim', 'Promise', 'Tide', 'Errand', 'Harvest', 'Oath',
  'Comet', 'Lark', 'Anvil', 'Vow', 'Margin', 'Reckoning', 'Sparrow', 'Bargain', 'Covenant', 'Heron',
  'Furrow', 'Wager', 'Return', 'Answer', 'Crown', 'Kettle', 'Thread', 'Orbit', 'Pilgrim', 'Spindle',
];

/** What a sealed crate can hold, once someone opens it. */
export type CrateContents = 'weapons' | 'godglass' | 'luxuries' | 'nothing' | 'stolen relics';

export const CRATE_TEXT: Record<CrateContents, string> = {
  weapons: 'Shard rifles, packed in grease. Enough to arm a raiding party.',
  godglass: 'Vials of godglass, the drug that sharpens resonance and eats the mind.',
  luxuries: 'Lyreth silks and Serathi spirits, untaxed.',
  nothing: 'Ballast and old hull plate. The captain is offended.',
  'stolen relics': 'Temple relics with Torvann house marks, stolen from somewhere they will be missed.',
};

export const PAPERS_LABEL = { ok: 'papers in order', none: 'no papers', forged: 'papers look right' } as const;

export const PASSENGER_ROLES = [
  'merchant', 'pilgrim', 'student', 'factor', 'physician', 'surveyor', 'deckhand', 'cook',
  'mercenary', 'clerk', 'musician', 'priest', 'labourer', 'courier', 'widow', 'gambler',
];
