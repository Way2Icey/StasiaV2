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
  // Humans of the Archon (Lumen, Myr, and the human micro-houses): old court names.
  human: {
    species: 'human',
    given: {
      starts: ['A', 'Ca', 'E', 'Ze', 'So', 'Ma', 'Al', 'Re', 'Ju', 'Le', 'Hel', 'Ad', 'Ro', 'Is', 'Ve', 'Da', 'Ni', 'Ma'],
      mids: ['r', 'l', 'n', 'ri', 'le', 'tr', 'd', 'v'],
      ends: ['ea', 'in', 'is', 'en', 'ra', 'ius', 'ei', 'an', 'el', 'a', 'on', 'eth', 'ine'],
      midChance: 0.45,
    },
    familyNames: ['Castellan', 'Ardent', 'Morrow', 'Hale', 'Corwin', 'Vance', 'Ashgrove', 'Thorne', 'Wrenfield', 'Sallow', 'Brightwater', 'Kell'],
    knightTitle: { f: 'Dame', m: 'Ser' },
  },
  // Varn'Gotha: low, echoic Gorhan; bloodlines of the Sharded.
  varngotha: {
    species: 'varngotha',
    given: {
      starts: ['Gor', 'Vurn', 'Aath', 'Morg', 'Oth', 'Hral', 'Dhur', 'Uur', 'Khol', 'Varn', 'Bhel', 'Thurg'],
      mids: ['a', 'o', 'ra', 'u'],
      ends: ['ath', 'oth', 'um', 'gar', 'ond', 'uun', 'esh', 'ath', 'orr'],
      midChance: 0.3,
    },
    familyNames: ['the Glass Seam', 'the Iron Vein', 'the Stone Crest', 'the Ash Brand', 'the Black Weld', 'the Pale Seam'],
  },
  // Azurians: measured, liquid, lawyerly.
  azurian: {
    species: 'azurian',
    given: {
      starts: ['Ae', 'Sol', 'Ilu', 'Ce', 'Ora', 'Lys', 'Va', 'Eli', 'Sev', 'Ama', 'Que', 'Ri'],
      mids: ['l', 'v', 'r', 'n', 'lu'],
      ends: ['an', 'ine', 'is', 'ael', 'ora', 'eus', 'iel', 'ane', 'yr'],
      midChance: 0.5,
    },
    familyNames: ['Azure', 'Cerulon', 'Solenne', 'Ilvaren', 'Quessane', 'Aumery', 'Valcrest'],
    knightTitle: { f: 'Dame', m: 'Ser' },
  },
  // Myrelic (Myrai): scholarly, soft.
  myrelic: {
    species: 'myrelic',
    given: {
      starts: ['My', 'Ne', 'Ila', 'Tho', 'Sae', 'Pe', 'Lu', 'Ore', 'Vy', 'Ka', 'Ei'],
      mids: ['r', 'l', 'th', 'n', 'ri'],
      ends: ['a', 'en', 'ia', 'is', 'el', 'on', 'eth', 'ra'],
      midChance: 0.45,
    },
    familyNames: ['Myrai', 'Lumeth', 'Orrisel', 'Sethany', 'Vellum', 'Quarrel', 'Ithe'],
  },
  // Velarai (Vahler): harmonic, long vowels, layered names.
  velarai: {
    species: 'velarai',
    given: {
      starts: ['Re', 'Vo', 'Ae', 'Ly', 'Se', 'Ila', 'Mi', 'Ora', 'Vel', 'Thi'],
      mids: ['x', 'll', 'ri', 'v', 'l', 'mi'],
      ends: ['iah', 'ian', 'ael', 'ora', 'ys', 'ielle', 'een', 'ar'],
      midChance: 0.55,
    },
    familyNames: ['Vahler', 'Voxillian', 'Aeloren', 'Lyssande', 'Serethiel', 'Mirevale'],
  },
  // Tavari (Tavareen): airy, rising.
  tavari: {
    species: 'tavari',
    given: {
      starts: ['Ta', 'Ze', 'Ei', 'Lo', 'Ya', 'Ve', 'Sio', 'Na', 'Ri', 'Ae'],
      mids: ['v', 'r', 'th', 'l', 'n'],
      ends: ['ri', 'en', 'ail', 'ia', 'ea', 'is', 'ani', 'ue'],
      midChance: 0.5,
    },
    familyNames: ['Tavareen', 'Zenthi', 'Aerovel', 'Lithane', 'Sioren', 'Nalatha'],
  },
  // Ko'renites (Koren): clipped, glottal, apostrophes.
  korenite: {
    species: 'korenite',
    given: {
      starts: ["Ko'", "Ta'", "Ve'", "Kr", "Zha", "Ik'", "Ro", "Tek", "Vak", "Sk"],
      mids: [],
      ends: ['ren', 'th', 'ax', 'zek', 'tal', 'rik', 'ass', 'ok', 'reth'],
      midChance: 0,
    },
    familyNames: ['Koren', 'the Third Forge', 'the Hull Line', "Ke'tar", 'the Anvil Brood', "Ro'zhek"],
  },
  // Murnath: clicked syllables, woven names.
  murnath: {
    species: 'murnath',
    given: {
      starts: ['Mur', 'Ith', 'Ske', 'Tal', 'Vrii', 'Nash', 'Ol', 'Kitt', 'Sil'],
      mids: ['k', 'th', 'r', 'x'],
      ends: ['ath', 'enn', 'ix', 'ari', 'oth', 'ik', 'ess'],
      midChance: 0.35,
    },
    familyNames: ['Murnath', 'the High Loom', 'Silkspire', 'the Woven Tower', 'Threadwall', 'the Ninth Spire'],
  },
  // Draychi: clicking Drask; clan and totem.
  draychi: {
    species: 'draychi',
    given: {
      starts: ['Dra', 'Kk', 'Tok', 'Shel', 'Bru', 'Kas', 'Rrk', 'Ott', 'Gul'],
      mids: [],
      ends: ['ask', 'ik', 'ot', 'uk', 'ek', 'esh', 'al'],
      midChance: 0,
    },
    familyNames: ['the Trench Clan', 'the Kelp Totem', 'the Brass Shell', 'the Deep Wrench', 'the Vent Clan'],
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
export const OF_STYLE: SpeciesId[] = ['torvann', 'gholari', 'varngotha', 'draychi', 'korenite', 'murnath'];
