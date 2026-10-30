// Read-only questions about the world, shared by the UI and later systems.
import { ageOf } from './characters';
import { displayName } from './names';
import type { Character, Family, Planet, Quarter, Sector, World } from './types';

export function alive(world: World): Character[] {
  return Object.values(world.characters).filter((c) => c.alive);
}

export function ruler(world: World, houseId: string): Character | undefined {
  const id = world.houses[houseId]?.rulerId;
  return id ? world.characters[id] : undefined;
}

export function seatHolder(world: World, houseId: string, seat: Character['seat']): Character | undefined {
  return alive(world).find((c) => c.houseId === houseId && c.seat === seat);
}

export function isCommoner(f: Family): boolean {
  return f.id.includes(':commoner-');
}

export function familyMembers(world: World, familyId: string, includeDead = false): Character[] {
  return Object.values(world.characters)
    .filter((c) => c.familyId === familyId && (includeDead || c.alive))
    .sort((a, b) => ageOf(b, world.date) - ageOf(a, world.date));
}

/** The ruler for the ruling family; otherwise a named head, else the eldest full member. */
export function familyHead(world: World, familyId: string): Character | undefined {
  const fam = world.families[familyId];
  if (!fam) return undefined;
  const members = familyMembers(world, familyId);
  if (fam.ruling) {
    const r = ruler(world, fam.houseId);
    if (r && r.familyId === familyId) return r;
  }
  return members.find((c) => /^Head of/i.test(c.role)) ?? members.find((c) => c.tier === 'full') ?? members[0];
}

export function findSector(world: World, sectorId: string): { planet: Planet; sector: Sector } | undefined {
  for (const planet of Object.values(world.planets)) {
    const sector = planet.sectors.find((s) => s.id === sectorId);
    if (sector) return { planet, sector };
  }
  return undefined;
}

export function sectorsControlledBy(world: World, familyId: string): { planet: Planet; sector: Sector }[] {
  const out: { planet: Planet; sector: Sector }[] = [];
  for (const planet of Object.values(world.planets)) {
    for (const sector of planet.sectors) if (sector.controllerFamilyId === familyId) out.push({ planet, sector });
  }
  return out;
}

export function quartersOverseenBy(world: World, characterId: string): { planet: Planet; sector: Sector; quarter: Quarter }[] {
  const out: { planet: Planet; sector: Sector; quarter: Quarter }[] = [];
  for (const planet of Object.values(world.planets)) {
    for (const sector of planet.sectors) {
      for (const quarter of sector.quarters) if (quarter.overseerId === characterId) out.push({ planet, sector, quarter });
    }
  }
  return out;
}

export function peopleAt(world: World, sectorId: string): Character[] {
  return alive(world).filter((c) => c.location.sectorId === sectorId);
}

export function withTrait(world: World, traitId: string): Character[] {
  return alive(world).filter((c) => c.traits.some((t) => t.id === traitId));
}

export function withFlag(world: World, flagId: string): Character[] {
  return alive(world).filter((c) => c.flags.some((f) => f.id === flagId));
}

/** Who this person answers to. */
export function superiorOf(world: World, c: Character): Character | undefined {
  const r = ruler(world, c.houseId);
  if (!r || r.id === c.id) return undefined;
  if (c.seat) return r;
  if (/^Knight/.test(c.role)) return seatHolder(world, c.houseId, 'grandMaster') ?? r;

  const overseen = quartersOverseenBy(world, c.id)[0];
  if (overseen) {
    const ctrl = overseen.sector.controllerFamilyId;
    const head = ctrl ? familyHead(world, ctrl) : undefined;
    return head && head.id !== c.id ? head : r;
  }

  const fam = world.families[c.familyId];
  if (fam && !isCommoner(fam)) {
    const head = familyHead(world, fam.id);
    return head && head.id !== c.id ? head : r;
  }

  // Commoners answer to an overseer where they live, else the sector's holder.
  const here = findSector(world, c.location.sectorId);
  if (here) {
    const overseer = here.sector.quarters.map((q) => (q.overseerId ? world.characters[q.overseerId] : undefined)).find((o) => o && o.alive);
    if (overseer) return overseer;
    const ctrl = here.sector.controllerFamilyId;
    const head = ctrl ? familyHead(world, ctrl) : undefined;
    if (head) return head;
  }
  return r;
}

export function subordinatesOf(world: World, c: Character): Character[] {
  return alive(world).filter((k) => k.houseId === c.houseId && k.id !== c.id && superiorOf(world, k)?.id === c.id);
}

export interface SearchResults {
  people: Character[];
  families: Family[];
  places: { planet: Planet; sector?: Sector }[];
}

export function search(world: World, query: string): SearchResults {
  const q = query.trim().toLowerCase();
  if (!q) return { people: [], families: [], places: [] };
  const people = Object.values(world.characters)
    .filter((c) => displayName(c.name).toLowerCase().includes(q) || c.role.toLowerCase().includes(q))
    .sort((a, b) => Number(b.alive) - Number(a.alive) || (a.tier === b.tier ? 0 : a.tier === 'full' ? -1 : 1));
  const families = Object.values(world.families).filter((f) => !isCommoner(f) && f.name.toLowerCase().includes(q));
  const places: { planet: Planet; sector?: Sector }[] = [];
  for (const planet of Object.values(world.planets)) {
    if (planet.name.toLowerCase().includes(q)) places.push({ planet });
    for (const sector of planet.sectors) {
      if (sector.name.toLowerCase().includes(q) || sector.quarters.some((qq) => qq.name.toLowerCase().includes(q))) places.push({ planet, sector });
    }
  }
  return { people, families, places };
}
