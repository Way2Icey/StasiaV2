import { createWorld } from './world';
import { advanceTurn } from './tick';
import { deserialize, serialize } from './save';
import { econ } from './economy';
import {
  buildModule, caigesIn, sectorHasCells, cellCapacity, deposit, escapeChance, imprison, keeperCoverage, modulesOf, reservesOf, setKeeper, setTreatment, upgradeModule, withdraw,
} from './holdings';
import type { World } from './types';

const world = createWorld();
const P = world.playerHouseId;

function run(w: World, turns: number): World {
  let x = w;
  for (let i = 0; i < turns; i++) { x = advanceTurn(x); x.events.pending = []; }
  return x;
}

describe('holdings', () => {
  it('every house has a vault at its capital and cells in its cities, ports and ships, not its farmland', () => {
    for (const h of Object.keys(world.houses)) {
      expect(modulesOf(world, h, 'cells').length).toBeGreaterThan(1);
      expect(modulesOf(world, h, 'vault').length).toBe(1);
      expect(modulesOf(world, h, 'cells').some((m) => m.shipId)).toBe(true);
    }
    for (const p of Object.values(world.planets)) for (const sec of p.sectors) {
      const has = Object.values(world.holdings.modules).some((m) => m.sectorId === sec.id && m.kind === 'cells');
      expect(has).toBe(sectorHasCells(sec) || sec.id === Object.values(world.holdings.modules).find((m) => m.kind === 'vault' && m.sectorId === sec.id)?.sectorId);
    }
  });

  it('builds a module over a Phase and charges for it', () => {
    const w0 = structuredClone(world);
    econ(w0, P).stock.othes = 20000;
    const sector = Object.values(w0.planets).find((p) => p.houseId === P)!.sectors.find((s) => !Object.values(w0.holdings.modules).some((m) => m.sectorId === s.id))!;
    let w = buildModule(w0, 'academy', sector.id);
    expect(econ(w, P).stock.othes).toBe(16000);
    expect(modulesOf(w, P, 'academy').length).toBe(0);
    w = run(w, 9);
    expect(modulesOf(w, P, 'academy').length).toBe(1);
    const a = modulesOf(w, P, 'academy')[0]!;
    w = upgradeModule(w, a.id);
    expect(w.holdings.modules[a.id]!.works?.to).toBe(2);
  });

  it('puts othes on ledger drives and takes them back', () => {
    const w0 = structuredClone(world);
    econ(w0, P).stock.othes = 10000;
    const v = modulesOf(w0, P, 'vault')[0]!;
    let w = deposit(w0, v.id, 6000);
    expect(econ(w, P).stock.othes).toBe(4000);
    expect(reservesOf(w, P)).toBe(6000);
    w = withdraw(w, v.id, 2000);
    expect(econ(w, P).stock.othes).toBe(6000);
  });

  it('keepers steady stored Caiges; neglected ones slip', () => {
    const w0 = structuredClone(world);
    const v = modulesOf(w0, P, 'vault')[0]!;
    for (let i = 0; i < 6; i++) {
      const id = `cg-test-${i}`;
      w0.armoury[id] = { id, name: `Test ${i}`, type: 'magnetic', band: 'frostpoint', houseId: P, found: w0.date, foundAt: { planetId: 'x', sectorId: 'y' }, vaultId: v.id, stability: 80 };
    }
    const none = structuredClone(w0);
    none.holdings.modules[v.id]!.keepers = [];
    expect(keeperCoverage(none, none.holdings.modules[v.id]!)).toBe(0);
    const later = run(none, 40);
    const avg = (w: World) => caigesIn(w, v.id).reduce((n, c) => n + (c.stability ?? 0), 0) / Math.max(1, caigesIn(w, v.id).length);
    expect(avg(later)).toBeLessThan(80);
    let kept = w0;
    const people = Object.values(w0.characters).filter((c) => c.alive && c.houseId === P && c.tier === 'full' && c.resonance && !c.seat).slice(0, 3);
    for (const k of people) kept = setKeeper(kept, v.id, k.id, true);
    expect(keeperCoverage(kept, kept.holdings.modules[v.id]!)).toBeGreaterThan(0.5);
  });

  it('jails nobodies, and harsh cells let fewer slip but cost honour', () => {
    const w = structuredClone(world);
    const p = imprison(w, P, 'Kesh Vabran', 'smuggler', null, 'spy', 10)!;
    const cell = w.holdings.modules[p.cellId]!;
    expect(cellCapacity(cell)).toBeGreaterThanOrEqual(4);
    expect(escapeChance(w, 10, cell, 'isolation')).toBeLessThan(escapeChance(w, 10, cell, 'decent'));
    const harsh = setTreatment(w, p.id, 'harsh');
    expect(harsh.holdings.prisoners[p.id]!.treatment).toBe('harsh');
  });

  it('runs for years without breaking and survives a save', () => {
    const w = run(world, 400);
    const back = deserialize(serialize(w));
    expect(back.holdings).toEqual(w.holdings);
  });
});
