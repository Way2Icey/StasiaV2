import { describe, expect, it } from 'vitest';
import { createWorld } from './world';
import { displayName } from './names';
import {
  familyHead, familyMembers, findSector, peopleAt, quartersOverseenBy, ruler, search,
  sectorsControlledBy, subordinatesOf, superiorOf, withFlag, withTrait,
} from './query';

const w = createWorld();
const byName = (n: string) => Object.values(w.characters).find((c) => displayName(c.name) === n)!;

describe('queries', () => {
  it('finds the Vanthos family head as the Highroy', () => {
    expect(familyHead(w, 'alerion:vanthos')?.name.given).toBe('Aurel');
    expect(familyMembers(w, 'alerion:vanthos').length).toBeGreaterThanOrEqual(6);
  });
  it('builds a chain of command', () => {
    const aurel = ruler(w, 'alerion')!;
    expect(superiorOf(w, aurel)).toBeUndefined();
    expect(superiorOf(w, byName('Ser Calder Rhosk'))?.id).toBe(aurel.id);
    expect(subordinatesOf(w, aurel).map((c) => c.name.given)).toContain('Deyric');
    // Every living person except the four rulers answers to someone.
    const rootless = Object.values(w.characters).filter((c) => c.alive && !superiorOf(w, c));
    expect(rootless).toHaveLength(4);
  });
  it('links places, holders and overseers', () => {
    expect(sectorsControlledBy(w, 'alerion:vanthos').length).toBe(3);
    const docks = findSector(w, 'alerion-prime:sector9')!;
    expect(docks.planet.id).toBe('alerion-prime');
    const port = docks.sector.quarters.find((q) => q.name === 'Starport Nine')!;
    expect(quartersOverseenBy(w, port.overseerId!)[0]!.quarter.id).toBe(port.id);
    expect(peopleAt(w, docks.sector.id).length).toBeGreaterThan(5);
  });
  it('finds people by trait, flag and search', () => {
    expect(withTrait(w, 'victorOf').map((c) => c.name.given)).toContain('Calder');
    expect(withFlag(w, 'caigeBonded').length).toBeGreaterThan(0);
    const r = search(w, 'rhosk');
    expect(r.families.map((f) => f.name)).toContain('Rhosk');
    expect(r.people.length).toBeGreaterThan(0);
    expect(search(w, 'sector 9').places.length).toBe(1);
  });
});
