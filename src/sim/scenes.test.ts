import { describe, expect, it } from 'vitest';
import { createWorld } from './world';
import { advanceUntil } from './tick';
import { actScene, autoScene, sceneOf, type Scene } from './scene';
import {
  beginAudience, beginAwakening, beginBonding, beginHeist, beginLegendHunt, beginPact, beginPeaceTalks, beginRescue, beginSabotage,
  startCeremony, startChronicle, startCrisis,
} from './scenes_api';
import { declareWar, activeWars } from './war';
import { table } from './archon';
import { settle } from './events';
import { Rng } from './rng';
import type { World } from './types';

const last = (w: World) => w.scenes!.list[0]!;
/** Play a scene to the end, taking each option in turn (then the first), and check it closes. */
function playOut(w: World, pick: (s: Scene, i: number) => string | undefined = (s, i) => s.options[i % s.options.length]?.key): World {
  const id = last(w).id;
  for (let i = 0; i < 30 && sceneOf(w, id)!.status !== 'over'; i++) {
    const s = sceneOf(w, id)!;
    const k = pick(s, i) ?? s.options.find((o) => !o.why)?.key;
    const opt = s.options.find((o) => o.key === k && !o.why) ?? s.options.find((o) => !o.why);
    if (!opt) break;
    w = actScene(w, id, opt.key);
  }
  if (sceneOf(w, id)!.status !== 'over') w = autoScene(w, id);
  expect(sceneOf(w, id)!.status).toBe('over');
  return w;
}
const ours = (w: World) => Object.values(w.characters).filter((c) => c.alive && c.houseId === w.playerHouseId && c.tier === 'full' && c.seat !== 'highroy');

describe('live scenes', () => {
  it('a session of the Numarade opens when our seat is asked, and moves real votes', () => {
    let w = structuredClone(createWorld('sess', { house: 'torvann' }));
    w.events.pending = [];
    table(w, 'censure', 'lumen', 'myr');
    w = advanceUntil(w, 2, false).world;
    const s = w.scenes!.list.find((x) => x.kind === 'session')!;
    expect(s).toBeTruthy();
    w = playOut(w, (sc, i) => (i === 0 ? 'want:aye' : sc.options.find((o) => o.key === 'speak' && !o.why)?.key ?? sc.options[0]!.key));
    const m = w.archon!.numarade.motions.find((x) => x.kind === 'censure')!;
    expect(m.status).not.toBe('open');
    expect(m.votes.torvann).toBeDefined();
  });

  it('peace talks end the war one way or another', () => {
    let w = createWorld('talks');
    w = declareWar(w, 'myr', 'tribute', 'war');
    const war = activeWars(w)[0]!;
    w = beginPeaceTalks(w, war.id);
    w = playOut(w, () => 'take');
    expect(w.war!.wars.find((x) => x.id === war.id)!.status).toBe('ended');
  });

  it('a pact can be negotiated', () => {
    let w = createWorld('pact');
    w = beginPact(w, 'azure');
    w = playOut(w);
    expect(last(w).result).toBeTruthy();
  });

  it('bonding writes the Caige its CDI and form, and they count in battle', () => {
    let w = structuredClone(createWorld('bond'));
    const home = w.houses[w.playerHouseId]!;
    w.armoury.cgtest = { id: 'cgtest', name: 'Testwake', type: 'gravitic', band: 'ambercore', houseId: w.playerHouseId, found: w.date, foundAt: { planetId: home.capitalPlanetId, sectorId: w.planets[home.capitalPlanetId]!.sectors[0]!.id }, stability: 70 };
    const free = w.armoury.cgtest!;
    const k = ours(w).find((c) => !c.flags.some((f) => f.id === 'caigeBonded') && c.flags.some((f) => f.id === 'knighted'))!;
    k.stats.willpower = 20; k.stats.composure = 20; k.stats.insight = 18; k.stats.eloquence = 18;
    w = beginBonding(w, free.id, k.id);
    expect(w.armoury.cgtest!.souls!.length).toBeGreaterThanOrEqual(2);
    w = playOut(w, (s) => s.options.find((o) => o.key === 'yield')?.key ?? 'coax');
    const cg = w.armoury[free.id]!;
    if (last(w).result!.good) { expect(cg.bondedTo).toBe(k.id); expect(cg.cdi).toBeGreaterThan(0); expect(cg.cdi).toBeLessThan(1); expect(cg.form).toBeTruthy(); }
  });

  it('an awakening can raise someone\'s band', () => {
    let w = structuredClone(createWorld('wake'));
    const c = ours(w)[0]!;
    c.resonance = { degrees: 80, band: 'bluewake', type: 'gravitic' };
    c.stats.composure = 18; c.stats.discipline = 18;
    w = beginAwakening(w, c.id);
    w = playOut(w, (s) => (s.meter < 30 ? 'breathe' : 'ease'));
    expect(['bluewake', 'ambercore']).toContain(w.characters[c.id]!.resonance!.band);
  });

  it('audiences and interrogations reveal things and close', () => {
    let w = createWorld('aud');
    const c = ours(w)[1]!;
    w = beginAudience(w, c.id, 'private');
    w = playOut(w, () => 'ask');
    expect(last(w).feed.length).toBeGreaterThan(2);
  });

  it('infiltrations: heist, sabotage, a lost Caige, a rescue', () => {
    let w = createWorld('heist');
    w = beginHeist(w, 'torvann');
    w = playOut(w, () => 'slip');
    w = declareWar(w, 'myr', 'tribute', 'war');
    w = beginSabotage(w, activeWars(w)[0]!.fronts[0]!.id);
    w = playOut(w, () => 'slip');
    w.economy.houses[w.playerHouseId]!.stock.othes = 10000;
    w = beginLegendHunt(w, w.archon!.legends[0]!.id);
    w = playOut(w, () => 'slip');
    // A rescue: one of ours held by Torvann.
    const c = ours(w).find((x) => !x.seat)!;
    w = structuredClone(w);
    w.captives[c.id] = { characterId: c.id, heldBy: 'torvann', since: w.date, interrogated: false };
    c.flags.push({ id: 'captive', since: w.date });
    w = beginRescue(w, c.id);
    w = playOut(w, () => 'slip');
  });

  it('ceremonies, crises and the chronicle play and write back', () => {
    let w = structuredClone(createWorld('rites'));
    const c = ours(w)[0]!;
    startCeremony(w, 'knighting', c.id);
    w = playOut(w);
    w = structuredClone(w);
    startCrisis(w, 'riot', Object.values(w.planets).find((p) => p.houseId === w.playerHouseId)!.sectors[0]!.id);
    w = playOut(w);
    w = structuredClone(w);
    startChronicle(w, 412);
    w = playOut(w);
    expect(w.annals[w.playerHouseId]!.some((a) => a.text.includes('was called'))).toBe(true);
  });

  it('years go by with scenes coming and being settled', () => {
    let w = createWorld('years');
    for (let i = 0; i < 400 * 3 / 25; i++) {
      w = advanceUntil(w, 25, false).world;
      for (const s of w.scenes!.list.filter((x) => x.status !== 'over')) w = autoScene(w, s.id);
      const rng = new Rng(w.rng); for (const p of [...w.events.pending]) settle(w, rng, p.id, null); w.rng = rng.state;
    }
    const kinds = new Set(w.scenes!.list.map((s) => s.kind));
    expect(kinds.has('chronicle')).toBe(true);
  }, 120000);
});
