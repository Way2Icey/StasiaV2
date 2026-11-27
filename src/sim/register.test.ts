import { createWorld } from './world';
import { advanceTurns } from './tick';
import { formationsOf } from './war';
import { shipsOf } from './fleet';
import { captainOf, crewCount, hullsOf, mixFor, passagesOf, registerNow, wantFor } from './register';

describe('the register of ships', () => {
  it('registers a hull for every ship the fleet formations count, each with a captain and a crew', () => {
    const w = registerNow(createWorld());
    const counted = formationsOf(w, w.playerHouseId).filter((f) => f.kind === 'fleet').reduce((n, f) => n + Math.round(f.strength), 0);
    const hulls = hullsOf(w);
    expect(hulls.length).toBe(counted);
    for (const t of ['cruiser', 'destroyer', 'gunship', 'fighter'] as const) expect(hulls.filter((h) => h.type === t).length).toBeGreaterThan(t === 'cruiser' || t === 'destroyer' ? 1 : 3);
    // Alerion's whole fleet runs to forty-odd vessels.
    expect(hulls.length + shipsOf(w, w.playerHouseId).length).toBeGreaterThanOrEqual(38);
    for (const h of hulls) { expect(h.captain).toMatch(/\S+ \S+/); expect(h.crew).toBeGreaterThan(0); }
    expect(new Set(hulls.map((h) => h.name)).size).toBe(hulls.length);
    for (const s of shipsOf(w, w.playerHouseId)) expect(captainOf(w, s).name).not.toBe('no one');
    const c = crewCount(w);
    expect(c.total).toBe(c.great + c.hulls + c.pilots);
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

describe('who takes which ship', () => {
  it('keeps the mix as the fleet grows and shrinks', () => {
    for (const n of [5, 12, 28, 41, 60]) { const m = mixFor(n); expect(m.cruiser + m.destroyer + m.gunship + m.fighter).toBe(n); if (n >= 12) { expect(m.cruiser).toBeGreaterThanOrEqual(2); expect(m.destroyer).toBeGreaterThanOrEqual(2); } }
  });
  it('sends envoys and spies in cruisers, the Champion in a destroyer, knights in gunships, the Highroy in a great ship', () => {
    const w = createWorld();
    const any = Object.values(w.characters).find((c) => c.alive && c.houseId === w.playerHouseId)!;
    expect(wantFor({ ...any, seat: 'envoy' }, {})[0]).toBe('cruiser');
    expect(wantFor({ ...any, seat: 'spymaster' }, {})[0]).toBe('cruiser');
    expect(wantFor({ ...any, seat: 'champion' }, {})[0]).toBe('destroyer');
    expect(wantFor({ ...any, seat: undefined, role: 'Knight' }, {})[0]).toBe('gunship');
    expect(wantFor({ ...any, seat: 'highroy' }, {})[0]).toBe('great');
    expect(wantFor({ ...any, seat: 'grandMaster' }, {})[0]).toBe('great');
  });
});
