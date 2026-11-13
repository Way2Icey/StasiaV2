import { createWorld } from './world';
import { advanceTurns } from './tick';
import { deserialize, serialize } from './save';
import { fieldSlots, moodOf, retinue, unwilling } from './mood';
import { cannotLead, forecast, launchMission } from './missions';
import { bondCaige, cannotBond, discover, materialize, recruit } from './discovery';
import { seatHolder } from './query';
import { Rng } from './rng';
import type { Mission, World } from './types';

const base = createWorld();
const P = base.playerHouseId;

describe('mood and field slots', () => {
  it('every named person has a mood and the house has slots', () => {
    for (const c of Object.values(base.characters)) if (c.tier === 'full') expect(c.mood).toBeGreaterThanOrEqual(0);
    expect(fieldSlots(base, P)).toBeGreaterThanOrEqual(1);
    expect(fieldSlots(base, P)).toBeLessThanOrEqual(6);
  });

  it('resentful people refuse, and slots fall with mood', () => {
    const w = structuredClone(base);
    const spy = seatHolder(w, P, 'spymaster')!;
    spy.mood = 10;
    expect(unwilling(w, spy)).toMatch(/Resentful/);
    expect(cannotLead(w, P, spy)).toMatch(/Resentful/);
    for (const c of retinue(w, P)) c.mood = 20;
    expect(fieldSlots(w, P)).toBe(1);
    for (const c of retinue(w, P)) c.mood = 95;
    expect(fieldSlots(w, P)).toBe(6);
  });

  it('a full field blocks new missions', () => {
    const w = structuredClone(base);
    for (const c of retinue(w, P)) c.mood = 20; // 1 slot
    const [a, b] = Object.values(w.characters).filter((c) => c.houseId === P && !cannotLead(w, P, c));
    const target = seatHolder(w, 'serath', 'highroy')!;
    const one = launchMission(w, { kind: 'scout', houseId: P, leaderId: a!.id, targetPlanetId: 'serath-reach', approach: 'careful' }).world;
    const f = forecast(one, { kind: 'investigate', houseId: P, leaderId: b!.id, targetId: target.id, approach: 'careful' });
    expect(f.ok && f.slots.used >= f.slots.total).toBe(true);
    expect(() => launchMission(one, { kind: 'investigate', houseId: P, leaderId: b!.id, targetId: target.id, approach: 'careful' })).toThrow(/slot/);
  });

  it('council away on a mission does no task work', () => {
    const steward = seatHolder(base, P, 'steward')!;
    const { world } = launchMission(base, { kind: 'scout', houseId: P, leaderId: steward.id, targetPlanetId: 'torvann-ashfall', approach: 'careful' });
    const before = world.courts[P]!.tasks.steward!.progress;
    const later = advanceTurns(world, 2);
    expect(later.courts[P]!.tasks.steward!.progress).toBe(before);
  });
});

describe('discoveries', () => {
  function fakeMission(w: World, kind: Mission['kind'], outcome: Mission['outcome']): Mission {
    return {
      id: 'mx', kind, houseId: P, leaderId: seatHolder(w, P, 'spymaster')!.id, targetPlanetId: 'serath-reach', targetSectorId: w.planets['serath-reach']!.sectors[0]!.id,
      targetHouseId: kind === 'envoy' ? 'serath' : undefined, approach: 'careful', stage: 'done', launched: w.date, stageEnds: w.date,
      travelCycles: 6, taskCycles: 8, origin: { planetId: 'alerion-prime', sectorId: 'x' }, progress: 50, rolls: 4, noticed: false, leaderKnowsNoticed: false, outcome, log: [],
    };
  }

  it('triumphs often turn something up; failures never do', () => {
    let found = 0;
    for (let i = 0; i < 40; i++) {
      const w = structuredClone(base);
      const m = fakeMission(w, i % 2 ? 'scout' : 'envoy', 'triumph');
      found += discover(w, Rng.fromSeed(`d${i}`), m, w.characters[m.leaderId]!).length ? 1 : 0;
      const f = structuredClone(base);
      expect(discover(f, Rng.fromSeed(`d${i}`), fakeMission(f, 'scout', 'failure'), f.characters[m.leaderId]!)).toEqual([]);
    }
    expect(found).toBeGreaterThan(12);
  });

  it('a materialized person can be brought into the house', () => {
    const w = structuredClone(base);
    const c = materialize(w, Rng.fromSeed('m'), 'serath-reach', w.planets['serath-reach']!.sectors[0]!.id);
    expect(c.tier).toBe('full');
    w.leads.push({ id: 'l1', houseId: P, kind: 'recruit', title: 't', text: 't', planetId: 'serath-reach', sectorId: c.location.sectorId, targetId: c.id, cost: 300, found: w.date, expires: w.date });
    const after = recruit(w, 'l1');
    expect(after.characters[c.id]!.houseId).toBe(P);
    expect(after.economy.houses[P]!.stock.othes).toBe(w.economy.houses[P]!.stock.othes - 300);
    expect(after.leads).toHaveLength(0);
  });

  it('a Caige can be bonded once', () => {
    const w = structuredClone(base);
    w.armoury.cg1 = { id: 'cg1', name: 'Vigil', type: 'gravitic', band: 'redline', houseId: P, found: w.date, foundAt: { planetId: 'serath-reach', sectorId: 'x' } };
    const who = Object.values(w.characters).find((c) => c.houseId === P && !cannotBond(c))!;
    const mood = moodOf(who);
    const after = bondCaige(w, 'cg1', who.id);
    expect(after.armoury.cg1!.bondedTo).toBe(who.id);
    expect(after.characters[who.id]!.flags.some((f) => f.id === 'caigeBonded')).toBe(true);
    expect(moodOf(after.characters[who.id]!)).toBeGreaterThan(mood);
    expect(() => bondCaige(after, 'cg1', who.id)).toThrow();
  });

  it('upgrades a version 5 save', () => {
    const old = JSON.parse(serialize(base));
    old.version = 5;
    delete old.armoury;
    delete old.leads;
    for (const c of Object.values(old.characters) as { mood?: number }[]) delete c.mood;
    const w = deserialize(JSON.stringify(old));
    expect(w.version).toBe(8);
    expect(w.leads).toEqual([]);
    expect(moodOf(Object.values(w.characters).find((c) => c.tier === 'full')!)).toBeGreaterThan(0);
  });
});
