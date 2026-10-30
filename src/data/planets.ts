import type { PortLevel, SpeciesId } from '../sim/types';

// Capitals for the slice. Alerion Prime follows the planet mockup; the rival
// capitals are lighter until their planet pages are designed.

export interface QuarterSeed {
  name: string;
  kind: string;
  gives: string;
  /** Role given to the generated overseer. */
  overseerRole?: string;
}

export interface SectorSeed {
  key: string;
  name: string;
  designation: string;
  port: PortLevel;
  room: number;
  roomUsed: number;
  population: number;
  unrest: number;
  /** Family key that controls it, or null if unclaimed. */
  controller: string | null;
  peoples: Partial<Record<SpeciesId, number>>;
  description: string;
  quarters: QuarterSeed[];
  /** Commoner roles to populate with minor named characters. */
  commoners: string[];
}

export interface PlanetSeed {
  id: string;
  name: string;
  houseId: string;
  description: string;
  sectorLimit: number;
  sectors: SectorSeed[];
}

export const SLICE_PLANETS: PlanetSeed[] = [
  {
    id: 'alerion-prime',
    name: 'Alerion Prime',
    houseId: 'alerion',
    description: 'Temperate core world, seat of House Alerion.',
    sectorLimit: 24,
    sectors: [
      { key: 'citadel', name: 'Vanthos Citadel', designation: 'Citadel city', port: 'spaceport', room: 10, roomUsed: 9, population: 106000, unrest: 8, controller: 'vanthos',
        peoples: { fokari: 64, doven: 20, gholari: 8, thessari: 8 },
        description: 'Seat of the house: the Citadel, the council chambers, embassy row and the entrance to the Unbroken Vault.',
        quarters: [
          { name: 'The Citadel', kind: 'Seat', gives: 'Shield level 2 · seat of the Highroy' },
          { name: 'The Unbroken Vault', kind: 'Archive', gives: 'Archived minds · Caige forging', overseerRole: 'Archivist' },
          { name: 'Embassy Row', kind: 'Diplomacy', gives: 'Envoys from four houses', overseerRole: 'Master of Embassies' },
          { name: 'Citadel Garrison', kind: 'Military', gives: '2,400 soldiers', overseerRole: 'Garrison Commander' },
        ],
        commoners: ['Archive clerk', 'Citadel guard', 'Servant'] },
      { key: 'sector9', name: 'Sector 9 — Lower Docks', designation: 'Dock city', port: 'starport', room: 10, roomUsed: 10, population: 234000, unrest: 34, controller: 'vanthos',
        peoples: { doven: 38, gholari: 22, fokari: 15, serathi: 10, thessari: 8, shaaliin: 7 },
        description: 'Alerion’s busiest port and its poorest district. Most of the house’s trade passes through here, and so do most of its smugglers.',
        quarters: [
          { name: 'Starport Nine', kind: 'Trade', gives: '+2,100 othes per Phase · 4 heavy berths', overseerRole: 'Harbourmaster' },
          { name: 'The Cargo Yards', kind: 'Logistics', gives: 'Trade throughput +30%', overseerRole: 'Yard Foreman' },
          { name: 'The Stacks', kind: 'Housing', gives: '120,000 residents' },
          { name: 'Ninth Market', kind: 'Commerce', gives: '+600 othes per Phase · black market suspected' },
          { name: 'Shipwright Annex', kind: 'Industry', gives: 'Repairs two ships at once', overseerRole: 'Master Shipwright' },
        ],
        commoners: ['Dockworker', 'Dockworker', 'Cargo hauler', 'Market trader', 'Smuggler', 'Tavern keeper'] },
      { key: 'kessmere', name: 'Kessmere Fields', designation: 'Farmland', port: 'landing field', room: 12, roomUsed: 6, population: 98000, unrest: 12, controller: 'ennic',
        peoples: { doven: 52, gholari: 31, fokari: 9, thessari: 8 },
        description: 'Terraced farmland and mill towns that feed most of the planet. Run for the house by the Ennic family.',
        quarters: [
          { name: 'Kessmere Terraces', kind: 'Farming', gives: 'Provisions +310 per Phase', overseerRole: 'Factor' },
          { name: 'Mill Town', kind: 'Manufacturing', gives: 'Provisions +90 per Phase · basic goods', overseerRole: 'Reeve' },
          { name: 'Grain Silos', kind: 'Storage', gives: 'Holds two Orbits of provisions' },
        ],
        commoners: ['Farmer', 'Miller'] },
      { key: 'greyspire', name: 'Greyspire Works', designation: 'Foundry city', port: 'spaceport', room: 10, roomUsed: 8, population: 141000, unrest: 22, controller: 'holm',
        peoples: { gholari: 44, doven: 38, thessari: 10, fokari: 8 },
        description: 'Foundries, the fuel refinery and the shard-weapon lines. Loud, hot and essential.',
        quarters: [
          { name: 'Greyspire Foundries', kind: 'Industry', gives: 'Metals +220 per Phase', overseerRole: 'Forgemaster' },
          { name: 'Fuel Refinery', kind: 'Refining', gives: 'Fuel +60 per Phase from Navisium and energy', overseerRole: 'Chief Engineer' },
          { name: 'Shard Works', kind: 'Arms', gives: 'Components · shard rifles', overseerRole: 'Master of Arms' },
          { name: 'Workers’ Wards', kind: 'Housing', gives: '90,000 residents' },
        ],
        commoners: ['Foundry worker', 'Foundry worker', 'Refinery hand'] },
      { key: 'scholars', name: 'Scholars’ Reach', designation: 'University district', port: 'none', room: 8, roomUsed: 5, population: 68000, unrest: 5, controller: 'vanthos',
        peoples: { fokari: 72, gholari: 10, doven: 8, serathi: 10 },
        description: 'Universities and data halls. Most of Alerion’s computing capacity runs here.',
        quarters: [
          { name: 'The Data Halls', kind: 'Computing', gives: 'Computing 160', overseerRole: 'Provost' },
          { name: 'Alerion Academy', kind: 'Education', gives: 'Educates heirs and wards', overseerRole: 'Tutor' },
          { name: 'Signals School', kind: 'Training', gives: 'Trains cyber and signals officers', overseerRole: 'Instructor' },
        ],
        commoners: ['Student', 'Data-hall tech'] },
      { key: 'holdfast', name: 'Varek Holdfast', designation: 'Mining region', port: 'landing field', room: 12, roomUsed: 7, population: 129000, unrest: 41, controller: 'varek',
        peoples: { doven: 55, gholari: 35, fokari: 10 },
        description: 'Deep mines worked for metals. The Varek family runs it like a small kingdom of its own.',
        quarters: [
          { name: 'Deepcut Mines', kind: 'Mining', gives: 'Metals +120 per Phase', overseerRole: 'Mine Overseer' },
          { name: 'Varek Hall', kind: 'Seat', gives: 'Seat of the Varek family' },
          { name: 'Holdfast Garrison', kind: 'Military', gives: '1,500 Varek household troops', overseerRole: 'Captain of the Holdfast' },
          { name: 'Miners’ Camps', kind: 'Housing', gives: '60,000 residents' },
        ],
        commoners: ['Miner', 'Miner'] },
      { key: 'hollow', name: 'The Hollow Reaches', designation: 'Wilds', port: 'none', room: 14, roomUsed: 1, population: 4000, unrest: 0, controller: null,
        peoples: { doven: 50, gholari: 50 },
        description: 'Mountains and old ruins beyond the farmland. The most room on the planet, and rumours of a resonant cult.',
        quarters: [{ name: 'Ruin camps', kind: 'Squatters', gives: 'Nothing yet' }],
        commoners: ['Squatter'] },
    ],
  },
  {
    id: 'torvann-ashfall',
    name: 'Ashfall',
    houseId: 'torvann',
    description: 'Volcanic capital of House Torvann, ringed with monastery-fortresses.',
    sectorLimit: 30,
    sectors: [
      { key: 'kesh', name: 'Kesh Hold', designation: 'Fortress-monastery', port: 'spaceport', room: 10, roomUsed: 8, population: 210000, unrest: 6, controller: 'torvann',
        peoples: { torvann: 90, doven: 10 }, description: 'Seat of the Torvann line, carved into a caldera wall.',
        quarters: [
          { name: 'The Caldera Seat', kind: 'Seat', gives: 'Seat of the house' },
          { name: 'Hall of Scars', kind: 'Monastery', gives: 'Trains warrior-monks', overseerRole: 'Abbot' },
        ],
        commoners: ['Monk', 'Smith'] },
      { key: 'ember', name: 'Ember Deep', designation: 'Mining region', port: 'landing field', room: 12, roomUsed: 9, population: 160000, unrest: 15, controller: 'ashfall',
        peoples: { torvann: 70, doven: 30 }, description: 'Heat-mines under the volcano.',
        quarters: [{ name: 'Ember Shafts', kind: 'Mining', gives: 'Metals', overseerRole: 'Mine Overseer' }],
        commoners: ['Miner'] },
      { key: 'plains', name: 'The Siege Plains', designation: 'Training grounds', port: 'landing field', room: 14, roomUsed: 6, population: 90000, unrest: 4, controller: 'blackstair',
        peoples: { torvann: 95, doven: 5 }, description: 'Where Torvann heavy infantry drill against mock walls.',
        quarters: [{ name: 'The Long Wall', kind: 'Military', gives: 'Heavy infantry training', overseerRole: 'Drillmaster' }],
        commoners: ['Infantryman'] },
    ],
  },
  {
    id: 'serath-reach',
    name: 'Serath Reach',
    houseId: 'serath',
    description: 'Wind-swept capital of House Serath, built for speed and watching.',
    sectorLimit: 20,
    sectors: [
      { key: 'tailwind', name: 'Tailwind Port', designation: 'Port city', port: 'starport', room: 10, roomUsed: 8, population: 140000, unrest: 10, controller: 'serath',
        peoples: { serathi: 85, doven: 15 }, description: 'Fast-turnaround starport and the house seat.',
        quarters: [
          { name: 'The Perch', kind: 'Seat', gives: 'Seat of the house' },
          { name: 'Tailwind Docks', kind: 'Trade', gives: 'Trade', overseerRole: 'Harbourmaster' },
        ],
        commoners: ['Pilot', 'Dockhand'] },
      { key: 'warrens', name: 'The Warrens', designation: 'Old city', port: 'none', room: 8, roomUsed: 7, population: 95000, unrest: 18, controller: 'kett',
        peoples: { serathi: 95, doven: 5 }, description: 'Tunnels and tight streets where scouts are raised.',
        quarters: [{ name: 'Scout School', kind: 'Training', gives: 'Trains scouts', overseerRole: 'Scoutmaster' }],
        commoners: ['Runner'] },
      { key: 'watchspire', name: 'Watchspire', designation: 'Listening post', port: 'landing field', room: 6, roomUsed: 3, population: 20000, unrest: 3, controller: 'venn',
        peoples: { serathi: 100 }, description: 'Sensor arrays and analysts watching the lanes.',
        quarters: [{ name: 'The Arrays', kind: 'Intelligence', gives: 'Lane surveillance', overseerRole: 'Chief Analyst' }],
        commoners: ['Analyst'] },
    ],
  },
  {
    id: 'shaaliin-lyreth',
    name: 'Lyreth',
    houseId: 'shaaliin',
    description: 'Garden capital of House Shaaliin, where nothing is quite what it looks like.',
    sectorLimit: 20,
    sectors: [
      { key: 'masque', name: 'The Masque Quarter', designation: 'Court city', port: 'spaceport', room: 10, roomUsed: 9, population: 120000, unrest: 7, controller: 'shaaliin',
        peoples: { shaaliin: 80, gholari: 10, doven: 10 }, description: 'Theatres, salons and the house seat.',
        quarters: [
          { name: 'The Mirror Court', kind: 'Seat', gives: 'Seat of the house' },
          { name: 'The Grand Theatre', kind: 'Culture', gives: 'Soft power abroad', overseerRole: 'Impresario' },
        ],
        commoners: ['Performer', 'Courtesan'] },
      { key: 'gardens', name: 'Hanging Gardens', designation: 'Garden city', port: 'none', room: 8, roomUsed: 5, population: 70000, unrest: 4, controller: 'lorrel',
        peoples: { shaaliin: 90, gholari: 10 }, description: 'Terraced gardens and very private villas.',
        quarters: [{ name: 'The Villas', kind: 'Housing', gives: 'Noble residences' }],
        commoners: ['Gardener'] },
      { key: 'exchange', name: 'The Quiet Exchange', designation: 'Market', port: 'spaceport', room: 8, roomUsed: 6, population: 60000, unrest: 9, controller: 'meseth',
        peoples: { shaaliin: 70, doven: 20, serathi: 10 }, description: 'A market where information sells better than goods.',
        quarters: [{ name: 'The Whisper Floor', kind: 'Commerce', gives: 'Information trade', overseerRole: 'Broker' }],
        commoners: ['Broker', 'Courier'] },
    ],
  },
];
