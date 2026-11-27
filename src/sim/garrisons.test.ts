import { createWorld } from './world';
import { formationsOf } from './war';
import { garrisonsOf, garrisonTotal } from './garrisons';
import { standingArmy } from '../data/profiles';
import { troopsOf } from './crucible';

describe('where the soldiers stand', () => {
  it("Alerion's standing army is the canon's 30,000-40,000, and every soldier is somewhere", () => {
    const w = createWorld();
    const P = w.playerHouseId;
    const land = formationsOf(w, P).filter((f) => f.kind !== 'fleet').reduce((n, f) => n + f.strength, 0);
    const all = land + troopsOf(w, P);
    expect(all).toBeGreaterThanOrEqual(30000);
    expect(all).toBeLessThanOrEqual(40000);
    expect(Math.abs(all - standingArmy('alerion'))).toBeLessThan(200);
    // A garrison on every peopled sector and every station we hold.
    const posts = garrisonsOf(w, P);
    const sectors = Object.values(w.planets).filter((p) => p.houseId === P).flatMap((p) => p.sectors).filter((s) => s.population > 0);
    expect(posts.filter((g) => g.kind === 'sector').length).toBe(sectors.length);
    expect(posts.some((g) => g.kind === 'station')).toBe(true);
    expect(troopsOf(w, P)).toBe(garrisonTotal(w, P));
    // No more than one in twenty of the people under arms.
    const people = sectors.reduce((n, s) => n + s.population, 0);
    expect(all / people).toBeLessThan(0.05);
  });
});
