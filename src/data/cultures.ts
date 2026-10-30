import type { SpeciesId } from '../sim/types';

// Naming cultures (Traits and House Cultures doc). Names are built from sound
// pieces, so people of one culture sound related without repeating.

export interface SyllableSet {
  starts: string[];
  mids: string[];
  ends: string[];
  /** Chance of inserting a middle piece. */
  midChance: number;
}

export interface Culture {
  species: SpeciesId;
  given: SyllableSet;
  /** Family or line names for new families of this culture. */
  familyNames: string[];
  /** Honorific for knights, by sex. */
  knightTitle?: { f: string; m: string };
}

export const CULTURES: Record<SpeciesId, Culture> = {
  // Alerion: soft consonants, open vowels; given + line name.
  fokari: {
    species: 'fokari',
    given: {
      starts: ['Ae', 'Au', 'Ca', 'Ce', 'Eli', 'Il', 'Lae', 'Li', 'Or', 'Sa', 'Sae', 'Sel', 'The', 'Va', 'Vae', 'Ori', 'Ny', 'Ise'],
      mids: ['l', 'li', 'ri', 're', 's', 'th', 'v', 'n', 'la'],
      ends: ['in', 'iel', 'is', 'ane', 'ar', 'os', 'ia', 'en', 'ith', 'e', 'a'],
      midChance: 0.35,
    },
    familyNames: ['Corvane', 'Aurane', 'Selith', 'Quillane', 'Avos', 'Thessane', 'Ilvar', 'Caerin', 'Maelis', 'Vexar'],
    knightTitle: { f: 'Dame', m: 'Ser' },
  },
  // Torvann: hard, low, short; given + hold (+ scar-name).
  torvann: {
    species: 'torvann',
    given: {
      starts: ['Dur', 'Gar', 'Thor', 'Kesh', 'Orr', 'Mek', 'Vath', 'Kor', 'Bru', 'Grom', 'Dag', 'Ruk', 'Tham', 'Uld', 'Zor', 'Har', 'Mor'],
      mids: [],
      ends: ['an', 'ok', 'um', 'ar', 'oth', 'ek', 'un', 'ash', '', 'ga', 'uk'],
      midChance: 0,
    },
    familyNames: ['Kesh Hold', 'Ashfall Hold', 'the Black Stair', 'Ember Deep', 'the Iron Cloister', 'Stonewake', 'the Red Terrace'],
  },
  // Serathi: quick, bright, clipped; given + clan + callsign.
  serathi: {
    species: 'serathi',
    given: {
      starts: ['Ti', 'Ri', 'Ve', 'Ik', 'Te', 'She', 'Va', 'Ki', 'Se', 'Ni', 'Ka', 'Ze', 'Ta', 'Vi'],
      mids: [],
      ends: ['kka', 'ssa', 'sh', 'ka', 'x', 'v', 'ss', 'tt', 'nn', 'ra', 'ki', 'sk'],
      midChance: 0,
    },
    familyNames: ['Kett', 'Venn', 'Tannik', 'Sorel', 'Marrix', 'Lin', 'Vask', 'Tirr', 'Dask', 'Nell', 'Quist', 'Rook'],
  },
  // Shaaliin: long, sibilant, liquid; public, court and true names.
  shaaliin: {
    species: 'shaaliin',
    given: {
      starts: ['Sha', 'Aa', 'Li', 'Y', 'Shie', 'Me', 'Lo', 'Vaa', 'Ys', 'Ree', 'I', 'Sae'],
      mids: ['l', 'r', 'sh', 'th', 'ss', 'v', 'n', 'rr'],
      ends: ['aal', 'yr', 'esh', 'ia', 'ine', 'eth', 'el', 'an', 'iel'],
      midChance: 0.5,
    },
    familyNames: ['Lorrel', 'Meseth', 'Varrine', 'Aalith', 'Corrys', 'Remiel', 'Shaalen', 'Ilvesh'],
  },
  // Thessari (TheaSzar's people; Rhosk and Holm in Alerion).
  thessari: {
    species: 'thessari',
    given: {
      starts: ['Ka', 'Bra', 'Sor', 'Val', 'Dre', 'Tor', 'Mar', 'Ruh', 'Cas', 'Zev', 'Cal', 'Dey', 'Kor'],
      mids: [],
      ends: ['dor', 'ek', 'ran', 'en', 'os', 'ius', 'ar', 'eth', 'ric', 'der'],
      midChance: 0,
    },
    familyNames: ['Dravos', 'Toren', 'Mazur', 'Velk', 'Arkan', 'Strell'],
    knightTitle: { f: 'Dame', m: 'Ser' },
  },
  doven: {
    species: 'doven',
    given: {
      starts: ['Bo', 'Har', 'Tul', 'Gren', 'Ost', 'Bel', 'Dun', 'Mor', 'Ruk', 'Fen', 'Pa', 'Od'],
      mids: [],
      ends: ['rin', 'ek', 'dal', 'gar', 'm', 'sk', 'n', 'o', 'l', 'ol'],
      midChance: 0,
    },
    familyNames: ['Pask', 'Corrin', 'Sorrel', 'Dray', 'Fenn', 'Tolland', 'Garrow', 'Brask'],
  },
  // Gholari: given + "of" a grove.
  gholari: {
    species: 'gholari',
    given: {
      starts: ['Om', 'Hru', 'Vel', 'Ush', 'Mor', 'Gha', 'Ul', 'Bro', 'Ess', 'Thu'],
      mids: [],
      ends: ['un', 'ash', 'ol', 'eth', 'ar', 'oom', 'ith', 'uul'],
      midChance: 0,
    },
    familyNames: ['Mirewood', 'the Fen Vault', 'Sporehall', 'Deepmoss', 'the Quiet Grove', 'Lantern Marsh'],
  },
};

/** Torvann scar-names, earned through deeds (become the epithet). */
export const TORVANN_SCAR_NAMES = [
  'the Twice-Burned', 'the Unbowed', 'Split-Tusk', 'the Quiet', 'Ash-Handed',
  'the Patient Stone', 'Nine-Scars', 'the Long Wall',
];

/** Serathi callsigns, given by comrades. */
export const SERATHI_CALLSIGNS = [
  'Needle', 'Wire', 'Dusk', 'Quick', 'Ghost', 'Ash', 'Static', 'Hook', 'Burr',
  'Latch', 'Echo', 'Snap', 'Slip', 'Fang', 'Lantern', 'Grit',
];

/** Cultures that write the family part as "of …". */
export const OF_STYLE: SpeciesId[] = ['torvann', 'gholari'];
