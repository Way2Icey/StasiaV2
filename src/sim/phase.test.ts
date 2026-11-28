import { describe, expect, it } from 'vitest';
import { createWorld } from './world';
import { stepClock, advanceTurns } from './tick';
import { startWar } from './war';
import { Rng } from './rng';
import { absoluteCycle } from './time';
import { bestPlan, briefOf, forecastWar, forecastWith, staffPlans, whatIf } from './forecast';
import { cannotOrder, commitPhase, orderGroup, phaseIndex, theatreOf } from './warroom';

function atWar() {
  const w = createWorld();
  startWar(w, new Rng(w.rng), { attacker: 'torvann', defender: w.playerHouseId, goal: 'tribute', rung: 'war' });
  return w;
}

describe('the Phase: forecast, plan, commit, watch', () => {
  it('the forecast reads the next Phase without touching the world', () => {
    const w = atWar();
    const war = w.war!.wars[0]!;
    const before = JSON.stringify(w);
    const f = forecastWar(w, war.id, 4)!;
    expect(JSON.stringify(w)).toBe(before);
    expect(f.pWin).toBeGreaterThanOrEqual(0);
    expect(f.pWin).toBeLessThanOrEqual(1);
    expect(f.tracks.some((t) => t.ours)).toBe(true);
    expect(f.stock.fuel.length).toBeGreaterThan(1);
    expect(Array.isArray(briefOf(w, war.id, f))).toBe(true);
  });

  it('the odds move with the choice, on the same dice', () => {
    const w = atWar();
    const war = w.war!.wars[0]!;
    const t = theatreOf(war)!;
    const g = Object.values(t.groups).find((x) => x.house === w.playerHouseId && x.domain === 'void')!;
    const places = Object.keys(t.nodes).filter((id) => id !== g.at && !cannotOrder(w, war.id, g.id, { to: id }));
    const r = whatIf(w, war.id, g.id, [{ to: null }, ...places.map((to) => ({ to }))], 3);
    expect(new Set(r.map((x) => x.score.toFixed(2))).size).toBeGreaterThan(1);
    // the same order twice reads the same
    expect(forecastWith(w, war.id, { [g.id]: { to: places[0]! } }, 3)!.score).toBe(forecastWith(w, war.id, { [g.id]: { to: places[0]! } }, 3)!.score);
  }, 30000);

  it("the staff's best plan is no worse than the plan as it stands", () => {
    const w = atWar();
    const war = w.war!.wars[0]!;
    const base = forecastWith(w, war.id, {}, 3)!;
    const b = bestPlan(w, war.id, 3)!;
    expect(b.pWin).toBeGreaterThanOrEqual(base.pWin);
  }, 60000);

  it('a timed order waits before it leaves', () => {
    let w = atWar();
    const war = w.war!.wars[0]!;
    const t = theatreOf(war)!;
    const g = Object.values(t.groups).find((x) => x.house === w.playerHouseId && x.domain === 'void')!;
    const to = Object.keys(t.nodes).find((id) => id !== g.at && !cannotOrder(w, war.id, g.id, { to: id }))!;
    w = orderGroup(w, war.id, g.id, { to, leave: 6 });
    const g1 = theatreOf(w.war!.wars[0]!)!.groups[g.id]!;
    expect(g1.hold).toBe(absoluteCycle(w.date) + 6);
    w = advanceTurns(w, 1);
    expect(theatreOf(w.war!.wars[0]!)!.groups[g.id]?.at).toBe(g.at);
  }, 30000);

  it('the clock stops once a Phase for the plan, and not once it is given', () => {
    let w = atWar();
    const war = w.war!.wars[0]!;
    let stopped = 0;
    for (let i = 0; i < 12; i++) {
      const s = stepClock(w, false);
      w = s.world;
      if (s.freeze?.war) { stopped++; w = commitPhase(w, war.id, true); }
    }
    expect(stopped).toBeGreaterThanOrEqual(1);
    const t = theatreOf(w.war!.wars.find((x) => x.id === war.id)!);
    if (t) expect(t.phase?.committed === phaseIndex(w) || t.phase?.asked === phaseIndex(w)).toBe(true);
  }, 60000);
});

describe('the fixes of 9.27.1', () => {
  it('the Steward buys nothing for us when told never to', async () => {
    const { setPolicy } = await import('./exchange');
    const { buyUpTo, econ } = await import('./economy');
    let w = createWorld();
    const P = w.playerHouseId;
    w.economy.houses[P]!.stock.othes = 100000;
    w = setPolicy(w, 'fuel', { buy: 'off' });
    expect(buyUpTo(w, P, 'fuel', 50)).toBe(0);
    w = setPolicy(w, 'fuel', { buy: 'cover' });
    const before = econ(w, P).stock.fuel;
    expect(buyUpTo(w, P, 'fuel', 50)).toBeGreaterThan(0);
    expect(econ(w, P).stock.fuel).toBeGreaterThan(before);
  });

  it('a Phase given hands off is not stopped for court business', () => {
    let w = atWar();
    const war = w.war!.wars[0]!;
    w = commitPhase(w, war.id, true);
    const ph = phaseIndex(w);
    let stops = 0;
    for (let i = 0; i < 6 && phaseIndex(w) === ph; i++) {
      const s = stepClock(w, true);
      w = s.world;
      if (phaseIndex(w) === ph && s.freeze && !s.freeze.battle && s.freeze.events.length === 0 && !s.freeze.war && !s.freeze.scene) stops++;
      if (phaseIndex(w) === ph && s.freeze && s.freeze.events.length && !/needs you now/.test(s.freeze.reason)) stops++;
    }
    expect(stops).toBe(0);
  }, 60000);

  it('unseen enemy groups are not left out of the forecast', () => {
    const w = atWar();
    const war = w.war!.wars[0]!;
    const t = theatreOf(war)!;
    const side = war.attacker === w.playerHouseId ? 'attackers' : 'defenders';
    const unseen = Object.values(t.groups).filter((g) => g.side !== side && !t.sight[side][g.id]);
    const f = forecastWar(w, war.id, 2)!;
    for (const g of unseen) expect(f.tracks.some((tr) => tr.id === g.id && tr.seen === -1)).toBe(true);
  });
});

describe('spies and whole plans', () => {
  it('a network is harder and dearer to plant in a house at war with us', async () => {
    const { plantTerms } = await import('./networks');
    const w = createWorld();
    const peace = plantTerms(w, 'torvann');
    startWar(w, new Rng(w.rng), { attacker: 'torvann', defender: w.playerHouseId, goal: 'tribute', rung: 'war' });
    const war = plantTerms(w, 'torvann');
    expect(war.war).toBe(true);
    expect(war.odds).toBeLessThan(peace.odds);
    expect(war.cost).toBeGreaterThan(peace.cost);
  });

  it("a network inside their house shows their forces in the theatre", async () => {
    const { insideSight } = await import('./networks');
    const { ensureIntel } = await import('./turning');
    let w = atWar();
    const war = w.war!.wars[0]!;
    ensureIntel(w).networks = [{ house: 'torvann', for: w.playerHouseId, since: w.date, ready: 0, depth: 2, phases: 3 }];
    expect(insideSight(w, 'torvann', w.playerHouseId)).toBe(2);
    w = advanceTurns(w, 1);
    const t = theatreOf(w.war!.wars.find((x) => x.id === war.id)!)!;
    const side = war.attacker === w.playerHouseId ? 'attackers' : 'defenders';
    const theirs = Object.values(t.groups).filter((g) => g.house === 'torvann');
    expect(theirs.length).toBeGreaterThan(0);
    for (const g of theirs) expect(t.sight[side][g.id]?.level ?? 0).toBeGreaterThanOrEqual(2);
  }, 30000);

  it('planting pays, and either takes or is lost', async () => {
    const { plantNetwork, networkIn } = await import('./networks');
    let w = createWorld();
    const P = w.playerHouseId;
    w.economy.houses[P]!.stock.othes = 20000;
    w = plantNetwork(w, 'serath');
    expect(w.economy.houses[P]!.stock.othes).toBe(20000 - 1500);
    expect(networkIn(w, 'serath') === undefined || networkIn(w, 'serath')!.depth === 1).toBe(true);
  });

  it('the staff offer whole plans, best first, no two alike', () => {
    const w = atWar();
    const war = w.war!.wars[0]!;
    const plans = staffPlans(w, war.id, 2);
    expect(plans.length).toBeGreaterThan(0);
    expect(plans.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < plans.length; i++) expect(plans[i - 1]!.pWin).toBeGreaterThanOrEqual(plans[i]!.pWin - 1e-9);
    expect(new Set(plans.map((p) => JSON.stringify(p.orders))).size).toBe(plans.length);
  }, 60000);
});
