import { describe, expect, it } from 'vitest';
import { createWorld } from './world';
import { econ, tradeInPlace } from './economy';
import { cancelOrder, clearExchange, ensureExchange, freight, haul, homeRegion, localPrice, needWord, placeOrder, quote, setPolicy, FLOOR, REGION_EXCHANGE } from './exchange';
import { startWar } from './war';
import { BASE_PRICE } from '../data/economy';
import { Rng } from './rng';
import type { World } from './types';

const fresh = (): World => structuredClone(createWorld('ex-test', { house: 'alerion' }));
const clear = (w: World, n = 1) => { for (let i = 0; i < n; i++) clearExchange(w, Rng.fromSeed(`c${i}`)); };

describe('the regional Exchange', () => {
  it('a starving house pays more for food than a fed one', () => {
    const w = fresh();
    econ(w, 'serath').stock.provisions = 0;
    econ(w, 'serath').stock.othes = 50000;
    econ(w, 'shaaliin').stock.provisions = 20000;
    clear(w, 3);
    expect(['bad', 'warn', 'ok', 'up']).toContain(needWord(w, 'serath', 'provisions').tone);
    expect(localPrice(w, homeRegion(w, 'serath'), 'provisions')).toBeGreaterThan(localPrice(w, homeRegion(w, 'shaaliin'), 'provisions'));
  });

  it('a glut drives the price down and cannot all be sold', () => {
    const w = fresh();
    const P = w.playerHouseId;
    const home = homeRegion(w, P);
    const before = localPrice(w, home, 'metals');
    econ(w, P).stock.metals = 60000;
    w.economy.exchange!.policy.metals.sell = 'quick';
    clear(w, 6);
    expect(localPrice(w, home, 'metals')).toBeLessThan(before);
    expect(econ(w, P).stock.metals).toBeGreaterThan(30000);
    expect(ensureExchange(w).regions[home]!.goods.metals.unsold).toBeGreaterThan(0);
  });

  it('selling now takes the bids on the board, and no more than buyers want', () => {
    const w = fresh();
    const P = w.playerHouseId;
    econ(w, P).stock.metals = 100000;
    expect(tradeInPlace(w, P, 'metals', -100000)).toMatch(/Buyers will take only|No one is buying/);
    const q = quote(w, P, 'metals', -50);
    expect(q.done).toBe(50);
    const o = econ(w, P).stock.othes;
    expect(tradeInPlace(w, P, 'metals', -50)).toBeNull();
    expect(econ(w, P).stock.othes - o).toBeCloseTo(q.value, -1);
    expect(q.avg).toBeGreaterThan(BASE_PRICE.metals * FLOOR - freight('metals', homeRegion(w, P), REGION_EXCHANGE) - 0.01);
  });

  it('the Steward holds or sells the surplus as told', () => {
    const w = fresh();
    const P = w.playerHouseId;
    econ(w, P).stock.fuel = 5000;
    const held = setPolicy(w, 'fuel', { sell: 'hold' });
    clear(held, 2);
    expect(econ(held, P).stock.fuel).toBeGreaterThanOrEqual(5000);
    const quick = setPolicy(w, 'fuel', { sell: 'quick' });
    clear(quick, 2);
    expect(econ(quick, P).stock.fuel).toBeLessThan(5000);
  });

  it('goods to sell at another market ship ahead, and come home if the order is cancelled', () => {
    let w = fresh();
    const P = w.playerHouseId;
    econ(w, P).stock.metals = 1000;
    w = placeOrder(w, { side: 'sell', good: 'metals', qty: 400, region: 'reach', limit: 9 });
    expect(econ(w, P).stock.metals).toBe(600);
    const o = w.economy.exchange!.orders.find((x) => !x.auto)!;
    expect(o.consigned).toBe(true);
    expect(Object.values(w.lanes.convoys).some((c) => c.order === o.id)).toBe(true);
    w = cancelOrder(w, o.id);
    expect(econ(w, P).stock.metals).toBe(1000);
  });

  it('a buy order fills when a seller comes down to it', () => {
    let w = setPolicy(fresh(), 'metals', { sell: 'hold' });
    const P = w.playerHouseId;
    econ(w, P).stock.othes = 100000;
    w = placeOrder(w, { side: 'buy', good: 'metals', qty: 50, region: 'reach', limit: 8 });
    const before = econ(w, P).stock.metals;
    clear(w, 2);
    expect(econ(w, P).stock.metals).toBeGreaterThan(before);
  });

  it('war makes the haul dearer to and from the house at war', () => {
    const w = fresh();
    const P = w.playerHouseId;
    const peace = haul(w, 'fuel', homeRegion(w, P), REGION_EXCHANGE);
    startWar(w, Rng.fromSeed('w'), { attacker: P, defender: 'torvann', goal: 'tribute', rung: 'war' });
    expect(haul(w, 'fuel', homeRegion(w, P), REGION_EXCHANGE)).toBeGreaterThan(peace * 2);
  });
});
