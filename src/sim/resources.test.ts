import { describe, expect, it } from 'vitest';
import { createWorld } from './world';
import { advanceTurns } from './tick';
import { startWar } from './war';
import { Rng } from './rng';
import { econ, phaseLedger, netPerPhase } from './economy';
import { buildBill, buildModule } from './holdings';
import { billText, cannotPay, spend } from './bills';
import { theatreOf, orderGroup } from './warroom';

describe('every system runs on the six resources', () => {
  it('soldiers and crews eat, ships burn fuel on station', () => {
    const w = createWorld();
    const L = phaseLedger(w, w.playerHouseId);
    expect(L.some((l) => l.resource === 'provisions' && l.label.startsWith('Feeding the legions'))).toBe(true);
    expect(L.some((l) => l.resource === 'provisions' && l.label.startsWith('Feeding the crews'))).toBe(true);
    expect(L.some((l) => l.resource === 'fuel' && l.label === 'Ships on station')).toBe(true);
  });

  it('at peace no simulated house runs short of food in its first year', () => {
    let w = createWorld();
    w = advanceTurns(w, 400);
    for (const h of Object.keys(w.economy.houses)) expect(econ(w, h).stock.provisions).toBeGreaterThan(0);
  }, 120000);

  it('building takes metals and components as well as othes', () => {
    const w0 = createWorld();
    const P = w0.playerHouseId;
    const bill = buildBill('academy', 1);
    expect(bill.metals).toBeGreaterThan(0);
    expect(billText(bill)).toMatch(/metals/);
    const sector = Object.values(w0.planets).find((p) => p.houseId === P)!.sectors.find((s) => s.roomUsed < s.room)!;
    w0.economy.houses[P]!.stock.othes += 50000;
    const before = econ(w0, P).stock.metals;
    const w1 = buildModule(w0, 'academy', sector.id);
    expect(econ(w1, P).stock.metals).toBeLessThan(before);
  });

  it('a house that cannot pay is told what it lacks; a partial bill pays what it can', () => {
    const w = createWorld();
    const P = w.playerHouseId;
    w.economy.houses[P]!.stock.othes = 0;
    w.economy.houses[P]!.stock.metals = 10;
    expect(cannotPay(w, P, { metals: 100 })).toMatch(/Short of/);
    expect(spend(w, P, { metals: 100 }, 'test', 'develop', { partial: true })).toBeLessThan(1);
  });

  it('a war is paid in fuel and food: moving burns fuel, the host in the field eats more', () => {
    let w = createWorld();
    const P = w.playerHouseId;
    startWar(w, new Rng(w.rng), { attacker: 'torvann', defender: P, goal: 'tribute', rung: 'war' });
    const war = w.war!.wars[0]!;
    const fleet = Object.values(theatreOf(war)!.groups).find((g) => g.house === P && g.domain === 'void')!;
    w = orderGroup(w, war.id, fleet.id, { to: 'lanes' });
    const fuel0 = econ(w, P).stock.fuel;
    w = advanceTurns(w, 1);
    const moved = econ(w, P).recent.some((r) => r.resource === 'fuel' && r.amount < 0 && r.label.includes(fleet.name));
    expect(moved || econ(w, P).stock.fuel < fuel0).toBe(true);
    const t = econ(w, 'torvann');
    expect(t).toBeTruthy();
    expect(netPerPhase(phaseLedger(w, 'torvann')).navisium).toBeLessThan(0);
  }, 60000);
});
