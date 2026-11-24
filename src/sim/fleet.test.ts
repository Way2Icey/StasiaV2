import { refit, retireShip, shipLog } from './fleet';
import { buildModule } from './holdings';
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
  it('every house starts with the fleet of its canon or its rank; only Great Houses have flagships', () => {
    for (const h of Object.values(world.houses)) {
      const ships = shipsOf(world, h.id);
      expect(ships.length).toBeGreaterThanOrEqual(2);
      expect(ships.some((s) => s.cls === 'flagship')).toBe(h.tier === 'great');
    }
    expect(shipsOf(world, 'alerion').map((s) => s.cls).sort()).toEqual(['cruiser', 'destroyer', 'destroyer', 'destroyer']);
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
    const yard = Object.values(w0.holdings.modules).find((m) => m.kind === 'shipyard' && m.houseId === P)!;
    let w = commission(w0, 'cruiser', yard.id);
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
    for (let i = 0; i < 160; i++) { econ(w, P).stock.othes = 0; w = advanceTurn(w); w.events.pending = []; }
    const after = w.fleet.ships[s.id]!;
    expect(after.lost || after.crew < s.crew || after.crewMood > 12 || w.feed.some((f) => /deserted|Mutiny on the/.test(f.text))).toBeTruthy();
    expect(deserialize(serialize(w)).fleet).toEqual(w.fleet);
  });

  it('refits, a record that earns a name, and laying a ship up with honour', () => {
    let w = structuredClone(world);
    const s = shipsOf(w, P).find((x) => x.cls === 'cruiser') ?? shipsOf(w, P)[0]!;
    w.economy.houses[P]!.stock.othes = 100000; w.economy.houses[P]!.stock.components = 500;
    if (!Object.values(w.holdings.modules).some((m) => m.kind === 'shipyard' && m.houseId === P && m.sectorId === s.sectorId)) w = buildModule(w, 'shipyard', s.sectorId);
    for (const m of Object.values(w.holdings.modules)) if (m.kind === 'shipyard' && m.houseId === P) { m.level = Math.max(1, m.level); delete m.works; }
    const before = powerOf(w, w.fleet.ships[s.id]!);
    w = refit(w, s.id, 'shardCannons');
    expect(powerOf(w, w.fleet.ships[s.id]!)).toBeGreaterThan(before);
    for (let i = 0; i < 5; i++) shipLog(w, w.fleet.ships[s.id]!, 'Fought, and won', 3);
    expect(w.fleet.ships[s.id]!.epithet).toBeTruthy();
    w = retireShip(w, s.id, 'honour');
    expect(w.fleet.ships[s.id]!.lost).toBeTruthy();
    expect(w.fleet.past?.[0]?.name).toBe(s.name);
  });
});
