// What each house is, in numbers: how many people it holds and what it is good at, from the canon's point of
// view. Size comes from the people; what a house does with them comes from what the canon says it is known for.
//
// Where the canon gives figures they are used as they stand: Alerion is 750,000 to a million people with
// 30,000-40,000 elite soldiers; Endama two to three million with 150,000-200,000. Everyone else is set to
// the same density (about 700,000 to a million people a world, more for the old, rich Great Houses) and to
// the character the canon gives them.
//
// Each aptitude is per head: 1 is an ordinary house. A big house with ordinary aptitudes is strong by
// weight of numbers; a small one with a rare aptitude leads in that one thing. Lumen, the crème of the
// Archon, is good at everything and the best at nothing: Torvann has more soldiers, Varn'Gotha better ones,
// Myr the bigger fleet, Doven the deeper purse and the forges, TheaSzar the knights, Alerion the learning.

export interface HouseProfile {
  /** People, in millions. */
  pop: number;
  /** Share of the people under arms (garrisons, company and legion together). */
  arms: number;
  /** How good its soldiers are, man for man: 1 is ordinary. */
  quality: number;
  /** Ships for its size: 1 is ordinary. */
  fleet: number;
  /** Coin per head: trade, rents, guild dues and banking. */
  wealth: number;
  /** Forges, yards, mines and works per head. */
  industry: number;
  /** Learning, records and research. */
  learning: number;
  /** Knights per head, and how good they are. */
  knights: number;
  /** Weight in the courts: diplomacy, law, culture and the regard of others. */
  influence: number;
}

const p = (pop: number, arms: number, quality: number, fleet: number, wealth: number, industry: number, learning: number, knights: number, influence: number): HouseProfile =>
  ({ pop, arms, quality, fleet, wealth, industry, learning, knights, influence });

export const PROFILES: Record<string, HouseProfile> = {
  // ---- Great Houses
  // The oldest human line, rich and drilled and used to leading: very good at everything, first at nothing.
  lumen: p(7.0, 0.034, 1.15, 1.0, 1.2, 1.05, 1.25, 1.2, 1.3),
  // Pale titans: few, and each worth a company. The best soldiers in the Archon; materials science.
  varngotha: p(2.0, 0.06, 1.75, 0.8, 0.9, 1.1, 1.0, 1.2, 0.9),
  // Thessari martial philosophers: their academies train half the knights of the Archon.
  theaszar: p(4.2, 0.042, 1.3, 0.9, 0.9, 0.9, 1.15, 2.0, 1.2),
  // A Great House of the Numarade; little else is on record, so an ordinary one.
  mull: p(3.5, 0.04, 1.0, 1.0, 1.05, 1.0, 0.9, 1.0, 0.9),
  // Warrior-monks of heavy infantry and siege: the most soldiers under arms of any house.
  torvann: p(3.5, 0.07, 1.35, 0.8, 0.85, 0.9, 0.9, 1.3, 0.95),
  // The guilds that run the mines, docks and armouries of half the Archon, and are owed by almost everyone.
  doven: p(6.0, 0.025, 1.0, 1.2, 1.6, 1.6, 1.0, 0.8, 1.1),
  // A proud human house with Draychi clans for the wet worlds and the void: the biggest fleet.
  myr: p(4.0, 0.035, 1.1, 1.75, 1.05, 1.0, 0.95, 1.05, 0.9),
  // ---- Minor Houses
  // Fokari intellect, records and cyber warfare: the finest learning in the Archon. Canon: 750k-1M people, 30-40k elite soldiers.
  alerion: p(0.85, 0.045, 1.2, 1.0, 1.1, 1.0, 3.2, 1.0, 1.0),
  // Devout and heavily militarised. Canon: 2-3M people, 150-200k soldiers; a modest fleet built for assault.
  endama: p(2.5, 0.07, 1.15, 0.55, 0.8, 1.0, 0.7, 1.3, 0.8),
  // Scent-speakers and arbiters: a modest army, much regard.
  gholari: p(1.1, 0.02, 1.05, 0.6, 0.9, 0.7, 1.4, 0.9, 1.6),
  // Ko'renite forge-masters and shipwrights: militarised, and behind half the hulls of the Archon.
  koren: p(1.4, 0.05, 1.1, 1.6, 1.0, 1.7, 1.3, 1.0, 0.9),
  // Tavari of the floating cities: navigators and mediators, sworn to sacred neutrality.
  tavareen: p(0.9, 0.015, 0.95, 1.0, 0.9, 0.8, 1.6, 0.8, 1.4),
  // Velarai philosophers, pacifist by inclination.
  vahler: p(0.8, 0.01, 0.8, 0.6, 1.0, 0.8, 1.8, 0.6, 1.3),
  // Mimics, diplomats and spies whose culture travels further than their fleets.
  shaaliin: p(1.0, 0.02, 1.0, 0.7, 1.0, 0.8, 1.1, 0.9, 1.5),
  // Many-armed architects of spires and other houses' fortresses.
  murnath: p(1.1, 0.025, 1.0, 0.7, 1.05, 1.5, 1.4, 0.8, 1.0),
  // Myrelic scholars: theory and history.
  myrai: p(0.8, 0.015, 0.9, 0.6, 1.0, 0.8, 2.6, 0.7, 1.3),
  // Scouts, analysts and strike teams: small and sharp.
  serath: p(1.0, 0.04, 1.2, 0.9, 0.9, 0.9, 1.3, 1.1, 0.9),
  // Azurian negotiators who shape the law of the Archon.
  azure: p(1.2, 0.015, 1.0, 0.8, 1.15, 0.8, 1.3, 0.9, 2.0),
};

/** How long each house has stood, in years: the Varn'Gotha and Lumen lines oldest, the minor houses younger. */
export const HOUSE_AGE: Record<string, number> = {
  varngotha: 1100, lumen: 950, theaszar: 800, torvann: 750, doven: 700, myr: 650, mull: 600,
  gholari: 450, alerion: 400, endama: 380, myrai: 350, azure: 330, koren: 320, tavareen: 300, vahler: 300, murnath: 300, serath: 290, shaaliin: 280,
};

/** A house the canon does not describe: a young frontier house, ordinary in everything and small. */
export const DEFAULT_PROFILE: HouseProfile = p(0.6, 0.03, 0.95, 0.8, 0.9, 0.9, 0.9, 0.9, 0.9);

export const profileOf = (id: string): HouseProfile => PROFILES[id] ?? DEFAULT_PROFILE;

/** Soldiers under arms, all told. */
export const standingArmy = (id: string): number => Math.round((profileOf(id).pop * 1e6 * profileOf(id).arms) / 100) * 100;

/** Hulls in the numbered fleet: by people (sublinear: the void does not need a ship per head) and aptitude. */
export const fleetHulls = (id: string): number => Math.max(6, Math.round(45 * profileOf(id).pop ** 0.6 * profileOf(id).fleet));

/** Of a house's soldiers, the share kept in garrisons on its worlds, stations and outposts: more worlds, more to hold. */
export const garrisonShare = (worlds: number): number => Math.min(0.6, Math.max(0.25, 0.15 + 0.08 * Math.max(1, worlds)));

/** Weight in arms, the one number the older systems use: the field army's strength and its quality. */
export function mightOf(id: string): number {
  const pr = profileOf(id);
  const v = Math.sqrt(standingArmy(id)) * pr.quality;
  return Math.round(Math.min(1.4, Math.max(0.6, 0.7 + (0.6 * v) / 700)) * 100) / 100;
}

/** How a house's knights fare against others', man for man: TheaSzar's academies at the top. */
export const knightSkillOf = (id: string): number => Math.round((0.7 + 0.35 * profileOf(id).knights) * 100) / 100;
