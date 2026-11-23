import type { HouseTier, SpeciesId } from '../sim/types';

// The eighteen houses of the Archon, as canon has them (the vault's house list and the Government sheet:
// seven Great, eleven Minor). Every house is on file here; only some are simulated in full, and the rest
// live in the registry, vote in the Numarade, send contingents to the Crucible and keep their own history,
// so any of them can be brought fully to life later without changing how the realm works.

/** The topics houses hold views on. Each view runs −2 (against) to +2 (for). */
export type Topic = 'caiges' | 'resonance' | 'numarade' | 'crucible' | 'trade' | 'faith' | 'peoples' | 'honour' | 'drift';
export const TOPICS: Topic[] = ['caiges', 'resonance', 'numarade', 'crucible', 'trade', 'faith', 'peoples', 'honour', 'drift'];
export const TOPIC_LABEL: Record<Topic, string> = {
  caiges: 'Caiges', resonance: 'Resonance', numarade: 'The Numarade', crucible: 'War and the Crucible', trade: 'Trade',
  faith: 'Faith', peoples: 'Other peoples', honour: 'Honour', drift: 'The Drift',
};
/** What each end of a view means: [against, for]. */
export const TOPIC_ENDS: Record<Topic, [string, string]> = {
  caiges: ['Caiges should be bound by law', 'Caiges are a sacred right'],
  resonance: ['High resonance is a danger', 'High resonance is holy'],
  numarade: ['Each house is sovereign', 'The Numarade and the Exarchon above all'],
  crucible: ['The Crucible is waste', 'War and the Crucible are honour'],
  trade: ['Keep to our own', 'Open lanes, open markets'],
  faith: ['The Celarchs are a story', 'The Celarchs watch'],
  peoples: ['Blood and line first', 'Any people may rise'],
  honour: ['Results are what count', 'A word given is a word kept'],
  drift: ['The Drift must be buried', 'The Drift must be understood'],
};
export type Views = Record<Topic, number>;

export interface CanonNotable { name: string; role: string; note: string; species?: SpeciesId; age?: number; /** A Crucible role, if they fight for the house there. */ crucible?: 'marshal' | 'champion' }

export interface CanonHouse {
  id: string;
  name: string;
  tier: HouseTier;
  /** The people of the ruling lines. */
  species: SpeciesId;
  /** Whether canon names the ruling people (false: a human placeholder until it does). */
  speciesKnown: boolean;
  /** Other peoples sworn to the house. */
  vassals?: SpeciesId[];
  /** What the house is known for, in a few words. */
  focus: string;
  blurb: string;
  /** How many worlds it holds, low and high. */
  worlds: [number, number];
  /** Rough weight in arms and coin, 1 = an ordinary house. */
  might: number;
  views: Views;
  /** Personality for rival-house behaviour, as the simulated houses have it. */
  personality: Record<'aggression' | 'honour' | 'greed' | 'intrigue' | 'piety' | 'isolation', number>;
  /** Simulated in full in this build. */
  simulated?: boolean;
  /** Canon people of the house. */
  notables?: CanonNotable[];
  /** Families of note (the ruling one first). */
  families?: string[];
  /** The house's capital, by name. */
  capital?: string;
}

const v = (caiges: number, resonance: number, numarade: number, crucible: number, trade: number, faith: number, peoples: number, honour: number, drift: number): Views =>
  ({ caiges, resonance, numarade, crucible, trade, faith, peoples, honour, drift });
const P = (aggression: number, honour: number, greed: number, intrigue: number, piety: number, isolation: number) => ({ aggression, honour, greed, intrigue, piety, isolation });

export const CANON_HOUSES: CanonHouse[] = [
  // ---- the Great Houses
  {
    id: 'lumen', name: 'Lumen', tier: 'great', species: 'human', speciesKnown: true, focus: 'Old power and the Exarchon\'s court',
    blurb: 'The oldest human line in the Archon, rich and drilled and used to leading. Atrea Lumen, of the last years of the War for Life, was theirs.',
    worlds: [5, 8], might: 1.25, views: v(1, 1, 2, 1, 2, 1, 0, 0, -2), personality: P(0.5, 0.5, 0.6, 0.6, 0.5, 0.2),
    families: ['Lumen', 'Castellan', 'Ardent', 'Brightwater'], capital: 'Lumen Exalt',
    notables: [{ name: 'Atrea Lumen', role: 'Of the War for Life', note: 'Sought an end to the war in its last years. Long dead. What he built is not discussed at the Lumen table.' }],
  },
  {
    id: 'varngotha', name: "Varn'Gotha", tier: 'great', species: 'varngotha', speciesKnown: true, focus: 'Ordeal, ritual and the Council of the Sharded',
    blurb: 'Pale titans, semi-divine to some minor houses and feared by the rest. They enter politics only when they must, and then decisively.',
    worlds: [3, 5], might: 1.3, views: v(2, 2, -1, 2, -1, 2, -1, 2, -1), personality: P(0.6, 0.9, 0.2, 0.2, 0.9, 0.8),
    families: ['the Glass Seam', 'the Iron Vein', 'the Stone Crest', 'the Ash Brand'], capital: 'Gorhan Deep',
  },
  {
    id: 'theaszar', name: 'TheaSzar', tier: 'great', species: 'thessari', speciesKnown: true, focus: 'Academies, duelling courts and honour councils',
    blurb: 'Thessari martial philosophers. Their academies train half the knights of the Archon and their duelling courts settle what the Numarade cannot.',
    worlds: [4, 6], might: 1.2, views: v(1, 1, 1, 2, 0, 0, 0, 2, -1), personality: P(0.6, 0.9, 0.3, 0.3, 0.4, 0.3),
    families: ['TheaSzar', 'Dravos', 'Mazur', 'Arkan'], capital: 'Szar Academae',
  },
  {
    id: 'mull', name: 'Mull', tier: 'great', species: 'human', speciesKnown: false, focus: 'A Great House',
    blurb: 'A Great House of the Numarade. Little else is on record.',
    worlds: [4, 6], might: 1.1, views: v(0, 0, 0, 0, 0, 0, 0, 0, 0), personality: P(0.5, 0.5, 0.5, 0.5, 0.5, 0.5),
    families: ['Mull'], capital: 'Mull',
  },
  {
    id: 'torvann', name: 'Torvann', tier: 'great', species: 'torvann', speciesKnown: true, focus: 'Heavy infantry, sieges and the ethics of war',
    blurb: 'Warrior-monks with a strict ethic of war. Their monastic orders keep enclaves far beyond their own worlds.',
    worlds: [3, 5], might: 1.2, views: v(1, 0, 1, 2, -1, 2, 0, 2, -2), personality: P(0.75, 0.85, 0.3, 0.2, 0.7, 0.4), simulated: true,
  },
  {
    id: 'doven', name: 'Doven', tier: 'great', species: 'doven', speciesKnown: true, focus: 'Guilds, mining and engineering',
    blurb: 'Their guilds run the mines, docks and armouries of half the Archon. Respected everywhere, loved nowhere, and owed by almost everyone.',
    worlds: [5, 7], might: 1.15, views: v(0, -1, 1, 0, 2, 0, 1, 0, -1), personality: P(0.3, 0.6, 0.8, 0.4, 0.3, 0.3),
    families: ['Doven', 'Tolland', 'Garrow', 'Brask'], capital: 'The Underforge',
  },
  {
    id: 'myr', name: 'Myr', tier: 'great', species: 'human', speciesKnown: true, vassals: ['draychi'], focus: 'Caige-wielders, law and pride',
    blurb: 'A proud human house with Draychi clans sworn beneath it for the wet worlds. Quick to take offence in law and slow to forget it.',
    worlds: [4, 6], might: 1.15, views: v(2, 0, 1, 1, 1, 0, 1, 1, 0), personality: P(0.55, 0.6, 0.5, 0.6, 0.3, 0.3),
    families: ['Myr', 'Sallow', 'Kell'], capital: 'Myr Tidehold',
    notables: [
      { name: 'Zarei Myr', role: 'Escort commander', note: 'A veteran Caige-wielder. Speaks little and carries authority.', species: 'human', age: 52, crucible: 'marshal' },
      { name: 'Eris Myr', role: 'Speaker for the house', note: 'Charismatic and cutting: confrontation, legal baiting and the house\'s pride.', species: 'human', age: 38 },
      { name: 'Sorin Myr', role: 'Duelist', note: 'An Archon duelist, ambitious and hungry for greatness.', species: 'human', age: 29, crucible: 'champion' },
    ],
  },
  // ---- the Minor Houses
  {
    id: 'alerion', name: 'Alerion', tier: 'minor', species: 'fokari', speciesKnown: true, focus: 'Records, intelligence and the vault of Caiges',
    blurb: 'Intellect, records and cyber warfare. Every ruling line is Fokari. Secretive, and set on becoming the eighth Great House.',
    worlds: [1, 2], might: 0.9, views: v(2, 1, 0, 0, 0, 0, -2, 0, 2), personality: P(0.3, 0.6, 0.3, 0.8, 0.2, 0.6), simulated: true,
  },
  {
    id: 'endama', name: 'Endama', tier: 'minor', species: 'human', speciesKnown: false, focus: 'Faith, siege and planetary assault',
    blurb: 'A devout military house that holds battle to be a sacred duty. A great army for a minor house, and fortresses on every world they hold.',
    worlds: [3, 4], might: 1.05, views: v(1, 1, 1, 2, -1, 2, 0, 2, -2), personality: P(0.7, 0.85, 0.3, 0.2, 0.9, 0.4),
    families: ['Endama', 'Hale', 'Thorne'], capital: 'Endama Sanctum',
  },
  {
    id: 'gholari', name: 'Gholari', tier: 'minor', species: 'gholari', speciesKnown: true, focus: 'Arbitration, memory and interspecies law',
    blurb: 'Swamp-born scent-speakers trusted as arbiters and memory-keepers. A modest army, but formidable at siege and at taking people alive.',
    worlds: [1, 2], might: 0.85, views: v(-1, 0, 1, -1, 1, 1, 2, 1, 1), personality: P(0.2, 0.8, 0.3, 0.3, 0.6, 0.4),
    families: ['Gholari', 'Mirewood', 'the Fen Vault'], capital: 'The Scented Grove',
  },
  {
    id: 'koren', name: 'Koren', tier: 'minor', species: 'korenite', speciesKnown: true, focus: 'Forges and shipwrights',
    blurb: 'Ko\'renite forge-masters behind half the hulls and Caige-housings in the Archon. Insular, militarised and politically busy.',
    worlds: [1, 3], might: 0.95, views: v(2, 0, 0, 1, 1, 0, -1, 0, 0), personality: P(0.5, 0.5, 0.6, 0.4, 0.2, 0.7),
    families: ['Koren', 'the Third Forge', 'the Hull Line'], capital: 'Ko\'ren Anvil',
  },
  {
    id: 'tavareen', name: 'Tavareen', tier: 'minor', species: 'tavari', speciesKnown: true, focus: 'Gravity, faith and diplomacy',
    blurb: 'Tavari of the floating cities: spiritual students of gravity, mediators and navigators, bound by clauses of sacred neutrality.',
    worlds: [1, 2], might: 0.85, views: v(1, 2, 0, -1, 1, 2, 1, 1, 1), personality: P(0.2, 0.7, 0.3, 0.3, 0.8, 0.5),
    families: ['Tavareen', 'Zenthi', 'Aerovel'], capital: 'High Tavar',
  },
  {
    id: 'vahler', name: 'Vahler', tier: 'minor', species: 'velarai', speciesKnown: true, focus: 'Philosophy, culture and peace',
    blurb: 'Velarai philosophers and cultural stewards, pacifist by inclination, who keep careful records of everyone\'s standing but their own.',
    worlds: [1, 2], might: 0.8, views: v(-2, 0, 1, -2, 1, 0, 2, 1, 0), personality: P(0.1, 0.7, 0.3, 0.4, 0.3, 0.4),
    families: ['Vahler', 'Voxillian', 'Aeloren'], capital: 'Vahl Concord',
    notables: [{ name: 'Remiah Voxillian Vahler', role: 'Advisor to the house', note: 'A Velarai foundling raised as family; records, political analysis and vassal relations. Notices what others ignore.', species: 'velarai', age: 20 }],
  },
  {
    id: 'shaaliin', name: 'Shaaliin', tier: 'minor', species: 'shaaliin', speciesKnown: true, focus: 'Espionage, soft power and culture',
    blurb: 'Mimics, diplomats and spies. Their culture travels further than their fleets.',
    worlds: [1, 2], might: 0.85, views: v(0, 0, -1, 0, 1, -1, 1, -2, 1), personality: P(0.3, 0.3, 0.5, 0.9, 0.2, 0.3), simulated: true,
  },
  {
    id: 'murnath', name: 'Murnath', tier: 'minor', species: 'murnath', speciesKnown: true, focus: 'Silk, spires and fortresses',
    blurb: 'Many-armed architects of vertical cities and builders of other houses\' fortresses, who write their laws in woven silk.',
    worlds: [1, 2], might: 0.85, views: v(0, 0, 0, 0, 2, 0, 0, 0, 1), personality: P(0.3, 0.5, 0.6, 0.4, 0.3, 0.5),
    families: ['Murnath', 'the High Loom', 'Silkspire'], capital: 'The Ninth Spire',
  },
  {
    id: 'myrai', name: 'Myrai', tier: 'minor', species: 'myrelic', speciesKnown: true, focus: 'Research, history and diplomacy',
    blurb: 'Myrelic scholars: theory, the preservation of history and a quiet philosophical influence on every court.',
    worlds: [1, 2], might: 0.8, views: v(0, 1, 1, -1, 1, -1, 1, 0, 2), personality: P(0.2, 0.6, 0.3, 0.5, 0.2, 0.4),
    families: ['Myrai', 'Lumeth', 'Orrisel'], capital: 'Myrai Athenaeum',
  },
  {
    id: 'serath', name: 'Serath', tier: 'minor', species: 'serathi', speciesKnown: true, focus: 'Scouts, analysts and strike teams',
    blurb: 'Scouts, analysts and mobile strike teams. Alerion\'s ally.',
    worlds: [1, 2], might: 0.9, views: v(0, 0, 0, 1, 0, -1, 1, -1, 0), personality: P(0.4, 0.5, 0.4, 0.6, 0.2, 0.2), simulated: true,
  },
  {
    id: 'azure', name: 'Azure', tier: 'minor', species: 'azurian', speciesKnown: true, focus: 'Negotiation, law and peacekeeping',
    blurb: 'Azurian negotiators who shape treaties and the law of the Archon. Hostility tends to soften in their presence.',
    worlds: [1, 3], might: 0.85, views: v(-1, 0, 2, -1, 1, 0, 1, 1, -1), personality: P(0.2, 0.8, 0.4, 0.5, 0.3, 0.2),
    families: ['Azure', 'Cerulon', 'Solenne'], capital: 'Azure Tribunal',
  },
];

export const CANON_BY_ID: Record<string, CanonHouse> = Object.fromEntries(CANON_HOUSES.map((h) => [h.id, h]));

/** Seats in the Numarade: the seven Great Houses and four elected from the Minor. */
export const GREAT_SEATS = 7;
export const MINOR_SEATS = 4;
