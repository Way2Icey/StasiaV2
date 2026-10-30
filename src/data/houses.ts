import type { House, SpeciesId } from '../sim/types';

// The four houses of the vertical slice. Personalities come from the
// species and house notes in the vault.

export interface FamilySeed {
  key: string;
  name: string;
  species: SpeciesId;
  ruling?: boolean;
  high?: boolean;
}

export interface HouseSeed extends Omit<House, 'rulerId'> {
  families: FamilySeed[];
}

export const SLICE_HOUSES: HouseSeed[] = [
  {
    id: 'alerion',
    name: 'Alerion',
    tier: 'minor',
    species: 'fokari',
    culture: 'fokari',
    houseNameSurnames: false,
    capitalPlanetId: 'alerion-prime',
    personality: { aggression: 0.3, honour: 0.6, greed: 0.3, intrigue: 0.8, piety: 0.2, isolation: 0.6 },
    blurb: 'Intellect, records and cyber warfare. Every ruling line is Fokari. Secretive.',
    families: [
      { key: 'vanthos', name: 'Vanthos', species: 'fokari', ruling: true, high: true },
      { key: 'varek', name: 'Varek', species: 'fokari', high: true },
      { key: 'seradine', name: 'Seradine', species: 'fokari' },
      { key: 'orrow', name: 'Orrow', species: 'fokari' },
      { key: 'ennic', name: 'Ennic', species: 'doven' },
      { key: 'holm', name: 'Holm', species: 'thessari' },
      { key: 'rhosk', name: 'Rhosk', species: 'thessari' },
      { key: 'deepmoss', name: 'Deepmoss', species: 'gholari' },
    ],
  },
  {
    id: 'torvann',
    name: 'Torvann',
    tier: 'great',
    species: 'torvann',
    culture: 'torvann',
    houseNameSurnames: true,
    capitalPlanetId: 'torvann-ashfall',
    personality: { aggression: 0.75, honour: 0.85, greed: 0.3, intrigue: 0.2, piety: 0.7, isolation: 0.4 },
    blurb: 'Warrior-monks with a strict ethic of war. Heavy infantry and sieges.',
    families: [
      { key: 'torvann', name: 'Torvann', species: 'torvann', ruling: true, high: true },
      { key: 'kesh', name: 'Kesh Hold', species: 'torvann' },
      { key: 'ashfall', name: 'Ashfall Hold', species: 'torvann' },
      { key: 'blackstair', name: 'the Black Stair', species: 'torvann' },
    ],
  },
  {
    id: 'serath',
    name: 'Serath',
    tier: 'minor',
    species: 'serathi',
    culture: 'serathi',
    houseNameSurnames: true,
    capitalPlanetId: 'serath-reach',
    personality: { aggression: 0.4, honour: 0.5, greed: 0.4, intrigue: 0.6, piety: 0.2, isolation: 0.2 },
    blurb: 'Scouts, analysts and mobile strike teams. Alerion’s ally.',
    families: [
      { key: 'serath', name: 'Serath', species: 'serathi', ruling: true, high: true },
      { key: 'kett', name: 'Kett', species: 'serathi' },
      { key: 'venn', name: 'Venn', species: 'serathi' },
      { key: 'tannik', name: 'Tannik', species: 'serathi' },
    ],
  },
  {
    id: 'shaaliin',
    name: 'Shaaliin',
    tier: 'minor',
    species: 'shaaliin',
    culture: 'shaaliin',
    houseNameSurnames: true,
    capitalPlanetId: 'shaaliin-lyreth',
    personality: { aggression: 0.3, honour: 0.2, greed: 0.5, intrigue: 0.95, piety: 0.1, isolation: 0.3 },
    blurb: 'Mimics and spymasters. Soft power, espionage, culture.',
    families: [
      { key: 'shaaliin', name: 'Shaaliin', species: 'shaaliin', ruling: true, high: true },
      { key: 'lorrel', name: 'Lorrel', species: 'shaaliin' },
      { key: 'meseth', name: 'Meseth', species: 'shaaliin' },
      { key: 'varrine', name: 'Varrine', species: 'shaaliin' },
    ],
  },
];
