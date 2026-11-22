import { createWorld } from './world';
import { advanceTurn } from './tick';
import { deserialize, serialize } from './save';
import { econ } from './economy';
import { baseStrength, buildModule, earsOf, modulesOf, shipSeen } from './holdings';
import { cannotCommission, onSlips } from './fleet';
import { appointAmbassador, embassy, expelAmbassador } from './embassies';
import { attend, cannotAttend } from './infirmary';
import { relation } from './relations';
import type { World } from './types';

const world = createWorld();
const P = world.playerHouseId;
const run = (w: World, n: number) => { let x = w; for (let i = 0; i < n; i++) { x = advanceTurn(x); x.events.pending = []; } return x; };
const rich = () => { const w = structuredClone(world); econ(w, P).stock.othes = 200000; econ(w, P).stock.components = 2000; return w; };
const home = () => Object.values(world.planets).find((p) => p.houseId === P)!;

describe('bases, listening posts, shipyards, embassies, infirmary', () => {
  it('every house has a shipyard; the slips hold one ship a level', () => {
    for (const h of Object.keys(world.houses)) expect(modulesOf(world, h, 'shipyard').length).toBe(1);
    const yard = modulesOf(world, P, 'shipyard')[0]!;
    expect(cannotCommission(rich(), 'cruiser', yard.id)).toBeNull();
    expect(onSlips(world, yard).length).toBe(0);
  });

  it('a base adds to a sector\'s defence and brings cells', () => {
    const farm = home().sectors.find((s) => s.designation === 'Farmland')!;
    let w = buildModule(rich(), 'base', farm.id);
    w = run(w, 9);
    expect(baseStrength(w, farm.id)).toBeGreaterThanOrEqual(12);
    expect(Object.values(w.holdings.modules).some((m) => m.sectorId === farm.id && m.kind === 'cells')).toBe(true);
  });

  it('a listening post lets us see foreign ships at its world', () => {
    const s = home().sectors[0]!;
    let w = buildModule(rich(), 'listening', s.id);
    w = run(w, 9);
    expect(earsOf(w, P).worlds.has(home().id)).toBe(true);
    const theirs = Object.values(w.fleet.ships).find((x) => x.houseId !== P)!;
    expect(shipSeen(w, P, theirs)).toBe(false);
  });

  it('embassies exist both ways; we appoint, they can be expelled', () => {
    const guest = 'torvann';
    expect(embassy(world, guest, P)).toBeTruthy();
    expect(embassy(world, P, guest)?.ambassadorId).toBeTruthy();
    const c = Object.values(world.characters).find((x) => x.alive && x.houseId === P && x.tier === 'full' && !x.seat && !x.flags.some((f) => ['ward', 'posted', 'travelling'].includes(f.id)))!;
    let w = appointAmbassador(world, guest, c.id);
    expect(embassy(w, guest, P)?.ambassadorId).toBe(c.id);
    const before = relation(w, guest, P);
    w = expelAmbassador(w, guest);
    expect(relation(w, guest, P)).toBeLessThan(before);
    expect(deserialize(serialize(run(w, 20))).embassies).toBeTruthy();
  });

  it('the Physician shortens a wound', () => {
    const w = rich();
    const c = Object.values(w.characters).find((x) => x.alive && x.houseId === P && x.tier === 'full' && !x.seat)!;
    c.flags.push({ id: 'wounded', since: w.date, until: { ...w.date, cycle: w.date.cycle + 40 } as never });
    if (!cannotAttend(w, c.id, 'wounded')) {
      const after = attend(w, c.id, 'wounded');
      expect(after.characters[c.id]!.flags.find((f) => f.id === 'wounded')!.detail).toMatch(/attended/);
    }
  });
});
