import { createWorld } from './world';
import { advanceTurns } from './tick';
import { formationsOf } from './war';
import { shipsOf } from './fleet';
import { captainOf, crewCount, hullsOf, passagesOf, registerNow } from './register';

describe('the register of ships', () => {
  it('registers a hull for every ship the fleet formations count, each with a captain and a crew', () => {
    const w = registerNow(createWorld());
    const counted = formationsOf(w, w.playerHouseId).filter((f) => f.kind === 'fleet').reduce((n, f) => n + Math.round(f.strength), 0);
    const hulls = hullsOf(w);
    expect(hulls.length).toBe(counted);
    expect(hulls.some((h) => h.type === 'gunship')).toBe(true);
    expect(hulls.some((h) => h.type === 'fighter')).toBe(true);
    for (const h of hulls) { expect(h.captain).toMatch(/\S+ \S+/); expect(h.crew).toBeGreaterThan(0); }
    expect(new Set(hulls.map((h) => h.name)).size).toBe(hulls.length);
    for (const s of shipsOf(w, w.playerHouseId)) expect(captainOf(w, s).name).not.toBe('no one');
    const c = crewCount(w);
    expect(c.total).toBe(c.great + c.gunships + c.pilots);
  });

  it('whoever of ours goes out takes a ship, and the ship comes home with them', () => {
    let w = createWorld();
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      w = advanceTurns(w, 40);
      for (const p of passagesOf(w)) seen.add(p.ship === 'merchant' ? 'merchant' : w.fleet.ships[p.ship] ? 'great' : 'hull');
      // No ship carries two parties at once.
      const busy = passagesOf(w).filter((p) => p.ship !== 'merchant' && !p.delivered).map((p) => p.ship);
      expect(new Set(busy).size).toBe(busy.length);
    }
    expect(seen.has('great') || seen.has('hull')).toBe(true);
    const logged = [...shipsOf(w, w.playerHouseId).flatMap((s) => s.log ?? []), ...hullsOf(w).flatMap((h) => h.log ?? [])].filter((l) => /^Carried /.test(l.text));
    expect(logged.length).toBeGreaterThan(0);
  });
});
