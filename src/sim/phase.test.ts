import { describe, expect, it } from 'vitest';
import { createWorld } from './world';
import { stepClock, advanceTurns } from './tick';
import { startWar } from './war';
import { Rng } from './rng';
import { absoluteCycle } from './time';
import { bestPlan, briefOf, forecastWar, forecastWith, whatIf } from './forecast';
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
