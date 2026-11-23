import { describe, expect, it } from 'vitest';
import { createWorld } from './world';
import { advanceUntil } from './tick';
import { answerEvent, eventDef, settle } from './events';
import { Rng } from './rng';
import { deserialize, serialize } from './save';
import {
  affinity, aiVote, callElection, cannotTable, foundHouse, liveHouses, openWilds, raise, regardOf, table, tableMotion, tierOf,
} from './archon';
import { CANON_HOUSES } from '../data/canon';
import { CULTURES } from '../data/cultures';
import { SPECIES } from '../data/species';
import { generateName } from './names';
import { guestOf } from './crucible';
import type { World } from './types';

/** Run the clock, letting the council answer everything. */
function run(w: World, turns: number): World {
  let left = turns;
  while (left > 0) {
    const r = advanceUntil(w, Math.min(50, left), false);
    w = r.world;
    left -= r.ran;
    const rng = new Rng(w.rng);
    for (const p of [...w.events.pending]) settle(w, rng, p.id, null);
    w.rng = rng.state;
  }
  return w;
}

describe('the Archon', () => {
  it('has every canon house on the register, at the canon ranks, with eleven seats', () => {
    const w = createWorld();
    const a = w.archon!;
    expect(Object.keys(a.houses).length).toBe(18);
    for (const c of CANON_HOUSES) expect(a.houses[c.id]!.tier).toBe(c.tier);
    expect(liveHouses(w).filter((h) => h.tier === 'great').length).toBe(7);
    expect(a.numarade.seats.length).toBe(11);
    expect(a.numarade.minorSeats.length).toBe(4);
    for (const s of a.numarade.minorSeats) expect(a.houses[s]!.tier).toBe('minor');
    // The four simulated houses are marked so, and agree with the full simulation.
    for (const id of Object.keys(w.houses)) { expect(a.houses[id]!.simulated).toBe(true); expect(a.houses[id]!.tier).toBe(w.houses[id]!.tier); }
  });

  it('names people in every culture', () => {
    const rng = Rng.fromSeed('names');
    for (const sp of Object.keys(SPECIES) as (keyof typeof SPECIES)[]) {
      const fam = { id: 'f', houseId: 'x', name: CULTURES[sp].familyNames[0]!, species: sp, ruling: false, high: false };
      const n = generateName(rng, { species: sp, family: fam, sex: 'f' });
      expect(n.given.length).toBeGreaterThan(1);
    }
  });

  it('writes a history and a frontier that differ by seed and repeat for the same seed', () => {
    const a = createWorld('one'), b = createWorld('one'), c = createWorld('two');
    expect(a.archon!.history.length).toBeGreaterThan(25);
    expect(a.archon!.history.map((e) => e.text)).toEqual(b.archon!.history.map((e) => e.text));
    expect(a.archon!.history.map((e) => e.text)).not.toEqual(c.archon!.history.map((e) => e.text));
    expect(Object.keys(a.archon!.frontier).length).toBeGreaterThan(20);
    expect(a.archon!.legends.length).toBeGreaterThanOrEqual(4);
    // The past ends at the canon: no house ends, none is added.
    expect(liveHouses(a).length).toBe(18);
    const ex = a.archon!.numarade.exarchon;
    if (ex) expect(tierOf(a, ex.houseId)).toBe('great');
  });

  it('houses that think alike regard each other better', () => {
    const w = createWorld();
    expect(affinity(w, 'torvann', 'endama')).toBeGreaterThan(affinity(w, 'torvann', 'vahler'));
  });

  it('a motion is voted on and carried or lost', () => {
    let w = structuredClone(createWorld());
    const m = table(w, 'commend', 'lumen', 'varngotha');
    expect(m.status).toBe('open');
    w = run(w, 20);
    const done = w.archon!.numarade.motions.find((x) => x.id === m.id)!;
    expect(done.status).not.toBe('open');
    expect(done.result).toMatch(/to/);
  });

  it('a seat votes against its own censure', () => {
    const w = createWorld();
    const m = table(structuredClone(w), 'censure', 'lumen', 'myr');
    expect(aiVote(w, 'myr', m)).toBe('nay');
  });

  it('raising a house keeps seven Great Houses and eleven seats', () => {
    const w = structuredClone(createWorld());
    raise(w, 'azure', 'mull', 412, 'in a test');
    expect(tierOf(w, 'azure')).toBe('great');
    expect(tierOf(w, 'mull')).toBe('minor');
    expect(liveHouses(w).filter((h) => h.tier === 'great').length).toBe(7);
    expect(w.archon!.numarade.seats.length).toBe(11);
    expect(w.archon!.numarade.seats).toContain('azure');
  });

  it('an empty chair is filled by election', () => {
    let w = structuredClone(createWorld());
    w.archon!.numarade.exarchon = null;
    callElection(w, new Rng(w.rng));
    w = run(w, 30);
    expect(w.archon!.numarade.exarchon).toBeTruthy();
    expect(tierOf(w, w.archon!.numarade.exarchon!.houseId)).toBe('great');
    expect(w.archon!.numarade.capanna.length).toBeGreaterThan(0);
  });

  it('a house can be founded on the frontier, and the world is then held', () => {
    const w = structuredClone(createWorld());
    const wild = openWilds(w)[0]!;
    const h = foundHouse(w, new Rng(w.rng), { founder: 'Ser Test', species: 'human', family: 'Testbrook', from: 'lumen', wildId: wild.id, year: 412 })!;
    expect(h.tier).toBe('minor');
    expect(w.archon!.frontier[wild.id]!.claimedBy).toBe(h.id);
    expect(regardOf(w, h.id, 'lumen')).toBeGreaterThan(regardOf(w, h.id, 'varngotha') - 40);
    expect(foundHouse(w, new Rng(w.rng), { founder: 'Another', species: 'human', family: 'X', wildId: wild.id, year: 412 })).toBeNull();
  });

  it('the Crucible draws houses from the register, with canon people', () => {
    const w = createWorld();
    expect(guestOf(w, 'myr')?.name).toBe('Myr');
    expect(guestOf(w, 'alerion')).toBeUndefined();
    expect(guestOf(w, 'g-veyr')?.name).toBe('Veyr');
  });

  it('our seat is asked, and every answer works', () => {
    const base = structuredClone(createWorld('seat', { house: 'torvann' }));
    expect(base.archon!.numarade.seats).toContain('torvann');
    base.events.pending = [];
    table(base, 'censure', 'lumen', 'myr');
    let w = advanceUntil(base, 2, false).world;
    const ask = w.events.pending.find((p) => p.defId === 'num:vote');
    expect(ask).toBeTruthy();
    for (let i = 0; i < eventDef('num:vote')!.options.length; i++) {
      const after = answerEvent(w, ask!.id, i);
      const m = after.archon!.numarade.motions.find((x) => x.kind === 'censure')!;
      expect(m.votes.torvann).toBeDefined();
    }
    w = answerEvent(w, ask!.id, 1);
    w = run(w, 20);
    expect(w.archon!.numarade.motions.find((x) => x.kind === 'censure')!.status).not.toBe('open');
  });

  it('we can bring a motion through a friendly seat or our own', () => {
    const w = createWorld('seat', { house: 'torvann' });
    expect(cannotTable(w, 'commend', 'endama')).toBeNull();
    const after = tableMotion(w, 'commend', 'endama');
    const m = after.archon!.numarade.motions[0]!;
    expect(m.by).toBe('torvann');
    expect(m.votes.torvann).toBe('aye');
    expect(cannotTable(after, 'commend', 'endama')).toMatch(/lately|already/);
  });

  it('every playable house starts and runs', () => {
    for (const house of ['torvann', 'serath', 'shaaliin']) {
      let w = createWorld(`as-${house}`, { house });
      expect(w.playerHouseId).toBe(house);
      w = run(w, 400);
      expect(w.date.year).toBeGreaterThan(412);
    }
  }, 120000);

  it('a save from before the register gains one when loaded', () => {
    const w = structuredClone(createWorld());
    delete w.archon;
    const back = deserialize(serialize(w));
    expect(back.archon).toBeTruthy();
    expect(back.archon!.history.length).toBeGreaterThan(10);
    expect(Object.keys(back.archon!.houses).length).toBe(18);
  });
});
