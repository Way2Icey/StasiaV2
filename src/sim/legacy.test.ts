import { describe, expect, it } from 'vitest';
import { createWorld } from './world';
import { advanceUntil } from './tick';
import { allDefs, fireStage, optionsFor, settle } from './events';
import { addDeed, discover, earnedEpithet, ensureLegacy, makeRelic, nextDrift, readRelic, relicsOf, renownOf } from './legacy';
import { kill } from './death';
import { econ } from './economy';
import { Rng } from './rng';
import { FRAGMENTS } from '../data/archive';
import type { World } from './types';

const fresh = (): World => structuredClone(createWorld('legacy-test', { house: 'alerion' }));
const ours = (w: World) => Object.values(w.characters).filter((c) => c.alive && c.houseId === w.playerHouseId && c.tier === 'full');

describe('legacy', () => {
  it('deeds add up to a name', () => {
    const w = fresh();
    const c = ours(w).find((x) => !x.name.epithet)!;
    addDeed(w, c.id, 'duel', 'Won a duel', 3);
    expect(earnedEpithet(w, c, Rng.fromSeed('e'))).toBeNull();
    addDeed(w, c.id, 'duel', 'Won another duel', 3);
    expect(renownOf(w, c.id)).toBe(6);
    expect(earnedEpithet(w, c, Rng.fromSeed('e'))).toBeTruthy();
  });

  it('the honoured dead go to the Hall', () => {
    const w = fresh();
    const c = ours(w).find((x) => x.seat && x.seat !== 'highroy')!;
    addDeed(w, c.id, 'battle', 'Held the breach', 3);
    kill(w, c, w.date, 'a fall');
    const L = ensureLegacy(w);
    expect(L.hall[0]?.id).toBe(c.id);
    expect(L.hall[0]?.deeds).toContain('Held the breach');
  });

  it('an Echo Coin, heard, gives the Archive a fragment', () => {
    let w = fresh();
    const r = makeRelic(w, 'echoCoin', { origin: 'test' });
    expect(relicsOf(w).some((x) => x.id === r.id)).toBe(true);
    expect(r.fragment).toBeTruthy();
    w = readRelic(w, r.id);
    expect(ensureLegacy(w).archive[r.fragment!]).toBeTruthy();
    expect(() => readRelic(w, r.id)).toThrow(/Already/);
  });

  it('the Drift\'s thread comes in order, and only as the age allows', () => {
    const w = fresh();
    const L = ensureLegacy(w);
    L.drift = 10;
    const got: string[] = [];
    for (let i = 0; i < 6; i++) { const f = discover(w, 'test', { thread: 'drift', rng: Rng.fromSeed(`d${i}`) }); if (f) got.push(f.id); }
    expect(got).toEqual(['dri1', 'dri2']);
    L.drift = 100;
    for (let i = 0; i < 6; i++) discover(w, 'test', { thread: 'drift', rng: Rng.fromSeed(`e${i}`) });
    expect(nextDrift(w)).toBeUndefined();
  });

  it('every legacy story can be set up where it fits and answered every way', () => {
    let w = fresh();
    w = advanceUntil(w, 400, false).world;
    econ(w, w.playerHouseId).stock.othes = 300000;
    econ(w, w.playerHouseId).stock.navisium = 500;
    for (const k of ['echoCoin', 'shardsaint', 'clrch', 'banner', 'keepring'] as const) makeRelic(w, k, { origin: 'test' });
    ensureLegacy(w).drift = 80;
    const ids = allDefs().filter((d) => d.id.startsWith('leg:')).map((d) => d.id);
    expect(ids.length).toBeGreaterThanOrEqual(17);
    let placed = 0;
    for (const id of ids) {
      const x = structuredClone(w);
      const p = fireStage(x, Rng.fromSeed(id), id, {});
      if (!p) continue;
      placed++;
      for (let i = 0; i < optionsFor(allDefs().find((d) => d.id === id)!, p).length; i++) {
        const y = structuredClone(x);
        expect(() => settle(y, Rng.fromSeed(`${id}/${i}`), p.id, i)).not.toThrow();
      }
    }
    expect(placed).toBeGreaterThan(8);
  }, 120000);

  it('the fragments are well formed', () => {
    const ids = new Set(FRAGMENTS.map((f) => f.id));
    expect(ids.size).toBe(FRAGMENTS.length);
    for (const f of FRAGMENTS) if (f.disputes) expect(ids.has(f.disputes)).toBe(true);
  });
});
