import { CULTURES } from '../data/cultures';
import { SLICE_HOUSES } from '../data/houses';
import { SLICE_PLANETS } from '../data/planets';
import { SPECIES } from '../data/species';
import { createCharacter, focusForSeat, type CharacterSpec } from './characters';
import { Rng } from './rng';
import { makeDate } from './time';
import { ensureKnowledge } from './knowledge';
import { ensureCouncil, initialStanding } from './council';
import type { Character, CouncilSeat, Family, Planet, SpeciesId, World } from './types';

export const DEFAULT_SEED = 'stasia';
export const START_DATE = makeDate(412, 3, 14);

const familyId = (houseId: string, key: string) => `${houseId}:${key}`;

/** Build a new world from a seed. The same seed always gives the same world. */
export function createWorld(seed: string = DEFAULT_SEED): World {
  const rng = Rng.fromSeed(seed);
  const world: World = {
    version: 3,
    seed,
    date: START_DATE,
    rng: rng.state,
    playerHouseId: 'alerion',
    nextId: 1,
    houses: {},
    families: {},
    characters: {},
    planets: {},
    feed: [],
    knowledge: {},
    missions: {},
    relations: {},
    courts: {},
  };

  for (const h of SLICE_HOUSES) {
    const { families, ...house } = h;
    world.houses[h.id] = { ...house, rulerId: null, standing: { honour: 50, respect: 30, dread: 10 } };
    world.houses[h.id]!.standing = initialStanding(world, h.id);
    for (const f of families) {
      const fam: Family = {
        id: familyId(h.id, f.key),
        houseId: h.id,
        name: f.name,
        species: f.species,
        ruling: !!f.ruling,
        high: !!f.high,
      };
      world.families[fam.id] = fam;
    }
  }

  for (const p of SLICE_PLANETS) {
    const planet: Planet = {
      id: p.id,
      name: p.name,
      houseId: p.houseId,
      description: p.description,
      sectorLimit: p.sectorLimit,
      sectors: p.sectors.map((s) => ({
        id: `${p.id}:${s.key}`,
        name: s.name,
        designation: s.designation,
        port: s.port,
        room: s.room,
        roomUsed: s.roomUsed,
        population: s.population,
        unrest: s.unrest,
        controllerFamilyId: s.controller ? familyId(p.houseId, s.controller) : null,
        peoples: s.peoples,
        description: s.description,
        quarters: s.quarters.map((q, i) => ({
          id: `${p.id}:${s.key}:q${i}`,
          name: q.name,
          kind: q.kind,
          gives: q.gives,
          overseerId: null,
        })),
      })),
    };
    world.planets[p.id] = planet;
  }

  populateAlerion(world, rng);
  for (const id of ['torvann', 'serath', 'shaaliin']) populateRivalHouse(world, rng, id);
  for (const p of SLICE_PLANETS) populatePlanet(world, rng, p.id);

  world.feed.push({
    date: world.date,
    kind: 'world',
    text: `The Chronicle opens. Aurel Vanthos rules House Alerion from the Vanthos Citadel.`,
  });
  ensureKnowledge(world);
  ensureCouncil(world);
  world.rng = rng.state;
  return world;
}

// ---------------------------------------------------------------- Alerion

function at(planetId: string, sectorKey: string) {
  return { planetId, sectorId: `${planetId}:${sectorKey}` };
}

const CITADEL = at('alerion-prime', 'citadel');

/** The named cast from the design docs, then everyone else rolled. */
function populateAlerion(world: World, rng: Rng) {
  const A = 'alerion';
  const make = (spec: Omit<CharacterSpec, 'houseId' | 'tier' | 'location'> & Partial<Pick<CharacterSpec, 'tier' | 'location'>>) =>
    createCharacter(world, rng, { houseId: A, tier: 'full', location: CITADEL, ...spec });

  const aurel = make({
    familyId: familyId(A, 'vanthos'), species: 'fokari', sex: 'm', age: 47,
    role: 'Highroy', focus: 'ruler', seat: 'highroy', name: { given: 'Aurel' },
    traits: [{ id: 'coldBlooded' }, { id: 'archivist' }],
    flags: [{ id: 'caigeBonded', detail: 'signet Caige, dagger form' }],
    resonance: { degrees: 88, band: 'bluewake', type: 'magnetic' },
  });
  world.houses[A]!.rulerId = aurel.id;

  make({ familyId: familyId(A, 'vanthos'), species: 'serathi', sex: 'f', age: 44, role: 'Spouse of the Highroy', focus: 'noble',
    name: { given: 'Imra', callsign: undefined }, traits: [{ id: 'courtier' }] });
  make({ familyId: familyId(A, 'vanthos'), species: 'fokari', sex: 'f', age: 19, role: 'Heir', focus: 'noble', name: { given: 'Cassia' },
    traits: [{ id: 'gifted' }, { id: 'proud' }], flags: [{ id: 'caigeBonded' }],
    resonance: { degrees: 168, band: 'ambercore', type: 'magnetic' } });
  make({ familyId: familyId(A, 'vanthos'), species: 'fokari', sex: 'm', age: 15, role: 'Son of the Highroy', focus: 'child', name: { given: 'Dorran' },
    location: at('serath-reach', 'tailwind'), flags: [{ id: 'ward', detail: 'fostered at House Serath' }] });
  make({ familyId: familyId(A, 'vanthos'), species: 'fokari', sex: 'f', age: 8, role: 'Daughter of the Highroy', focus: 'child', name: { given: 'Elin' },
    location: at('alerion-prime', 'scholars') });
  make({ familyId: familyId(A, 'vanthos'), species: 'fokari', sex: 'f', age: 68, role: 'Elder', focus: 'elder', seat: 'elder', name: { given: 'Oriane' } });

  make({ familyId: familyId(A, 'holm'), species: 'thessari', sex: 'm', age: 52, role: 'Grand Master', focus: 'grandMaster', seat: 'grandMaster',
    name: { given: 'Deyric' }, traits: [{ id: 'tactician' }, { id: 'brave' }] });
  make({ familyId: familyId(A, 'seradine'), species: 'fokari', sex: 'f', age: 61, role: 'Envoy', focus: 'envoy', seat: 'envoy',
    name: { given: 'Lisset' }, traits: [{ id: 'charismatic' }, { id: 'courtier' }] });
  make({ familyId: familyId(A, 'orrow'), species: 'fokari', sex: 'm', age: 74, role: 'Spymaster', focus: 'spymaster', seat: 'spymaster',
    name: { given: 'Kaen' }, traits: [{ id: 'cunning' }, { id: 'paranoid' }] });
  make({ familyId: familyId(A, 'ennic'), species: 'doven', sex: 'm', age: 58, role: 'Steward', focus: 'steward', seat: 'steward',
    name: { given: 'Paol' } });
  make({ familyId: familyId(A, 'deepmoss'), species: 'gholari', role: 'Physician', focus: 'physician', seat: 'physician' });
  make({ familyId: familyId(A, 'rhosk'), species: 'thessari', sex: 'm', age: 34, role: 'House Champion', focus: 'champion', seat: 'champion',
    name: { given: 'Calder' },
    traits: [{ id: 'ironBlooded' }, { id: 'duelistsCreed' }, { id: 'victorOf', detail: 'the Kessar Pits' }, { id: 'proud' }, { id: 'ambitious' }],
    flags: [{ id: 'caigeBonded', detail: '"Ashfang", greatblade form' }],
    resonance: { degrees: 214, band: 'ambercore', type: 'gravitic' } });
  make({ familyId: familyId(A, 'varek'), species: 'fokari', sex: 'm', age: 88, role: 'Head of the Varek family', focus: 'noble',
    name: { given: 'Merek', title: 'Lord' }, traits: [{ id: 'ambitious' }, { id: 'cunning' }], location: at('alerion-prime', 'holdfast') });

  // The rest of each noble family.
  const familyHomes: Record<string, string> = {
    vanthos: 'citadel', varek: 'holdfast', seradine: 'citadel', orrow: 'citadel',
    ennic: 'kessmere', holm: 'greyspire', rhosk: 'citadel', deepmoss: 'sector9',
  };
  for (const [key, home] of Object.entries(familyHomes)) {
    const fam = world.families[familyId(A, key)]!;
    const extra = key === 'vanthos' ? 0 : rng.int(2, 4);
    for (let i = 0; i < extra; i++) {
      const knightly = fam.species === 'thessari' && rng.chance(0.6);
      make({
        familyId: fam.id,
        species: fam.species,
        role: knightly ? 'Knight' : 'Noble',
        focus: knightly ? 'knight' : rng.chance(0.3) ? 'scholar' : 'noble',
        location: at('alerion-prime', home),
      });
    }
  }
}

// ---------------------------------------------------------------- rivals

const RIVAL_SEATS: CouncilSeat[] = ['grandMaster', 'envoy', 'spymaster', 'steward'];
const SEAT_TITLE: Record<CouncilSeat, string> = {
  highroy: 'Highroy', grandMaster: 'Grand Master', envoy: 'Envoy', spymaster: 'Spymaster', steward: 'Steward',
  physician: 'Physician', elder: 'Elder', champion: 'Champion', masterOfRites: 'Master of Rites',
};

function populateRivalHouse(world: World, rng: Rng, houseId: string) {
  const house = world.houses[houseId]!;
  const planet = world.planets[house.capitalPlanetId]!;
  const seatSector = planet.sectors[0]!;
  const location = { planetId: planet.id, sectorId: seatSector.id };
  const families = Object.values(world.families).filter((f) => f.houseId === houseId);
  const ruling = families.find((f) => f.ruling)!;
  const others = families.filter((f) => !f.ruling);

  const ruler = createCharacter(world, rng, {
    houseId, familyId: ruling.id, species: ruling.species, role: 'Highroy', focus: 'ruler', seat: 'highroy', tier: 'full', location,
  });
  house.rulerId = ruler.id;
  const sp = SPECIES[ruling.species];
  createCharacter(world, rng, {
    houseId, familyId: ruling.id, species: ruling.species, role: 'Heir', focus: 'noble', tier: 'full', location,
    age: rng.int(sp.adulthood, sp.adulthood + 12),
  });
  for (let i = 0; i < rng.int(1, 3); i++) {
    createCharacter(world, rng, { houseId, familyId: ruling.id, species: ruling.species, role: 'Noble', focus: 'noble', tier: 'full', location });
  }

  for (const seat of RIVAL_SEATS) {
    // Top seats mostly go to the ruling family's inner circle.
    const fam = rng.chance(0.35) ? ruling : rng.pick(others);
    createCharacter(world, rng, {
      houseId, familyId: fam.id, species: fam.species, role: SEAT_TITLE[seat], focus: focusForSeat(seat), seat, tier: 'full', location,
    });
  }
  for (let i = 0; i < 3; i++) {
    const fam = rng.pick(others);
    createCharacter(world, rng, { houseId, familyId: fam.id, species: fam.species, role: 'Knight', focus: 'knight', tier: 'full', location });
  }
}

// ---------------------------------------------------------------- commoners and overseers

function commonerFamily(world: World, rng: Rng, houseId: string, species: SpeciesId): Family {
  // A commoner family of the right culture, created on demand.
  const existing = Object.values(world.families).filter((f) => f.houseId === houseId && f.species === species && !f.high && !f.ruling);
  if (existing.length > 0 && rng.chance(0.4)) return rng.pick(existing);
  const id = `${houseId}:commoner-${world.nextId++}`;
  const family: Family = { id, houseId, name: '', species, ruling: false, high: false };
  // Name it in its own culture.
  family.name = commonerSurname(rng, species);
  world.families[id] = family;
  return family;
}

function commonerSurname(rng: Rng, species: SpeciesId): string {
  return rng.pick(CULTURES[species].familyNames);
}

function pickSpecies(rng: Rng, peoples: Partial<Record<SpeciesId, number>>): SpeciesId {
  const entries = Object.entries(peoples) as [SpeciesId, number][];
  return rng.weighted(entries);
}

function populatePlanet(world: World, rng: Rng, planetId: string) {
  const seed = SLICE_PLANETS.find((p) => p.id === planetId)!;
  const planet = world.planets[planetId]!;
  for (const [i, sector] of planet.sectors.entries()) {
    const sectorSeed = seed.sectors[i]!;
    const location = { planetId, sectorId: sector.id };

    // Overseers for quarters that have one.
    for (const [qi, quarter] of sector.quarters.entries()) {
      const role = sectorSeed.quarters[qi]?.overseerRole;
      if (!role) continue;
      const controller = sector.controllerFamilyId ? world.families[sector.controllerFamilyId] : undefined;
      // Vassal families staff their own sectors; the ruling family does not run quarters itself.
      const fam = controller && !controller.ruling && rng.chance(0.5) ? controller : commonerFamily(world, rng, planet.houseId, pickSpecies(rng, sector.peoples));
      const c: Character = createCharacter(world, rng, {
        houseId: planet.houseId, familyId: fam.id, species: fam.species, role: `${role}, ${quarter.name}`, focus: 'overseer', tier: 'minor', location,
      });
      quarter.overseerId = c.id;
    }

    // A handful of named commoners per sector.
    for (const role of sectorSeed.commoners) {
      const fam = commonerFamily(world, rng, planet.houseId, pickSpecies(rng, sector.peoples));
      const focus = /smuggler/i.test(role) ? 'rogue' : /trader|broker|keeper/i.test(role) ? 'trader' : /student|tech|analyst|clerk/i.test(role) ? 'scholar' : 'labourer';
      createCharacter(world, rng, { houseId: planet.houseId, familyId: fam.id, species: fam.species, role, focus, tier: 'minor', location });
    }
  }
}

// ---------------------------------------------------------------- queries

export function membersOf(world: World, houseId: string): Character[] {
  return Object.values(world.characters).filter((c) => c.houseId === houseId);
}

export function councilOf(world: World, houseId: string): Character[] {
  const order: CouncilSeat[] = ['highroy', 'grandMaster', 'envoy', 'spymaster', 'steward', 'physician', 'elder', 'champion', 'masterOfRites'];
  return membersOf(world, houseId)
    .filter((c) => c.seat && c.alive)
    .sort((a, b) => order.indexOf(a.seat!) - order.indexOf(b.seat!));
}

export { SEAT_TITLE };
