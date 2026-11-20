import { createWorld } from './world';
import { advanceTurn } from './tick';
import { deserialize, serialize } from './save';
import { econ } from './economy';
import { relation } from './relations';
import { commission, powerOf, setCaptain, setDuty, shipsOf } from './fleet';
import { fitModule } from './holdings';
import { defenceOf } from './ports';
import type { World } from './types';

const world = createWorld();
const P = world.playerHouseId;

function run(w: World, turns: number): World {
  let x = w;
  for (let i = 0; i < turns; i++) { x = advanceTurn(x); x.events.pending = []; }
  return x;
}

describe('great ships', () => {
  it('every house has a flagship; great houses two', () => {
    for (const h of Object.values(world.houses)) expect(shipsOf(world, h.id).length).toBe(h.tier === 'great' ? 2 : 1);
    expect(powerOf(world, shipsOf(world, P)[0]!)).toBeGreaterThan(0);
  });

  it('a ship in harbour defends its sector against raiders', () => {
    const s = shipsOf(world, P)[0]!;
    expect(defenceOf(world, s.sectorId)).toBeGreaterThan(defenceOf(world));
  });

  it('sails to blockade, costs the target trade and regard', () => {
    const s = shipsOf(world, P)[0]!;
    const before = relation(world, 'serath', P);
    let w = setDuty(world, s.id, 'blockade', 'serath');
    expect(w.fleet.ships[s.id]!.arrives).toBeTruthy();
    w = run(w, 40);
    expect(relation(w, 'serath', P)).toBeLessThan(before);
  });

  it('commissions a new ship that launches after two Orbits, and fits a hangar', () => {
    const w0 = structuredClone(world);
    econ(w0, P).stock.othes = 100000;
    econ(w0, P).stock.components = 500;
    let w = commission(w0, 'cruiser');
    const fresh = shipsOf(w, P).find((s) => s.ready)!;
    expect(fresh).toBeTruthy();
    w = run(w, 82);
    expect(w.fleet.ships[fresh.id]!.ready).toBeUndefined();
    const cap = Object.values(w.characters).find((c) => c.alive && c.houseId === P && c.role === 'Knight' && !Object.values(w.fleet.ships).some((s) => s.captainId === c.id))!;
    w = setCaptain(w, fresh.id, cap.id);
    w = fitModule(w, 'hangar', fresh.id);
    const p0 = powerOf(w, w.fleet.ships[fresh.id]!);
    w = run(w, 10);
    expect(powerOf(w, w.fleet.ships[fresh.id]!)).toBeGreaterThanOrEqual(p0);
  });

  it('an unpaid, idle crew turns, and the world goes on', () => {
    let w = structuredClone(world);
    const s = shipsOf(w, P)[0]!;
    w.fleet.ships[s.id]!.crewMood = 12;
    w.fleet.ships[s.id]!.captainId = null;
    for (let i = 0; i < 60; i++) { econ(w, P).stock.othes = 0; w = advanceTurn(w); w.events.pending = []; }
    const after = w.fleet.ships[s.id]!;
    expect(after.lost || after.crew < s.crew || after.crewMood > 12).toBeTruthy();
    expect(deserialize(serialize(w)).fleet).toEqual(w.fleet);
  });
});
