import { createWorld } from './world';
import { advanceTurns } from './tick';
import { annal, newsSinceLastLook, rivalCaige, rivalRecruit } from './growth';
import { materialize } from './discovery';
import { deserialize, serialize } from './save';
import { Rng } from './rng';

const base = createWorld();
const P = base.playerHouseId;

describe('houses grow on their own', () => {
  it('over a year, rivals gain people and the annals fill', () => {
    const w = advanceTurns(base, 400);
    const count = (world: typeof w, h: string) => Object.values(world.characters).filter((c) => c.houseId === h && c.alive && c.tier === 'full').length;
    const grew = ['torvann', 'serath', 'shaaliin'].filter((h) => count(w, h) > count(base, h));
    expect(grew.length).toBeGreaterThan(0);
    expect(Object.values(w.annals).some((a) => a.length > 0)).toBe(true);
  });

  it('a rival can poach someone we had our eye on', () => {
    const w = structuredClone(base);
    const c = materialize(w, Rng.fromSeed('p'), 'alerion-prime', w.planets['alerion-prime']!.sectors[1]!.id);
    w.leads.push({ id: 'l1', houseId: P, kind: 'recruit', title: 't', text: 't', planetId: 'alerion-prime', sectorId: c.location.sectorId, targetId: c.id, cost: 300, found: w.date, expires: w.date });
    rivalRecruit(w, Rng.fromSeed('q'), 'shaaliin', c);
    expect(w.characters[c.id]!.houseId).toBe('shaaliin');
    expect(w.leads).toHaveLength(0);
    expect(w.feed[w.feed.length - 1]!.text).toMatch(/Before we could approach/);
  });

  it('private doings are learned only by looking', () => {
    const w = structuredClone(base);
    rivalCaige(w, Rng.fromSeed('c'), 'torvann');
    annal(w, 'torvann', 'A public thing.', true);
    expect(w.feed.some((f) => /Caige/.test(f.text) && /Torvann|They came/.test(f.text))).toBe(false);
    const news = newsSinceLastLook(w, P, 'torvann');
    expect(news[0]).toMatch(/Caige/);
    expect(newsSinceLastLook(w, P, 'torvann')).toEqual([]);
  });

  it('upgrades a version 6 save', () => {
    const old = JSON.parse(serialize(base));
    old.version = 6;
    delete old.annals;
    delete old.lastLooked;
    const w = deserialize(JSON.stringify(old));
    expect(w.version).toBe(10);
    expect(w.annals[P]).toEqual([]);
  });
});

import { advanceUntil } from './tick';
import { launchMission } from './missions';
import { seatHolder } from './query';

describe('long continues', () => {
  it('runs a full stretch when told not to stop', () => {
    const r = advanceUntil(base, 40, false);
    expect(r.ran).toBe(40);
    expect(r.stop).toBeUndefined();
  });

  it('stops when a mission comes home', () => {
    const spy = seatHolder(base, P, 'spymaster')!;
    const { world } = launchMission(base, { kind: 'scout', houseId: P, leaderId: spy.id, targetPlanetId: 'serath-reach', approach: 'careful' });
    const r = advanceUntil(world, 400, true);
    expect(r.stop).toBeDefined();
    expect(r.ran).toBeLessThan(400);
  });
});
