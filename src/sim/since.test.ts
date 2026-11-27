import { createWorld } from './world';
import { advanceTurn } from './tick';
import { econ, fadeStanding, lavishness, LAVISH_FROM, phaseLedger } from './economy';
import { orbitAgo, delta, KEEP } from './since';
import { deserialize, serialize } from './save';
import { Rng } from './rng';

describe('9.10: meaning in the numbers', () => {
  it('a full treasury is spent each Phase; a modest one is not', () => {
    expect(lavishness(LAVISH_FROM)).toBe(0);
    expect(lavishness(LAVISH_FROM + 10000)).toBeGreaterThan(0);
    const w = createWorld();
    econ(w, w.playerHouseId).stock.othes = 100000;
    expect(phaseLedger(w, w.playerHouseId).some((l) => l.label === 'The court lives by the coffers' && l.amount < 0)).toBe(true);
  });

  it('honour and respect near the top slip back unless renewed', () => {
    const w = createWorld();
    const st = w.houses[w.playerHouseId]!.standing;
    st.honour = 98; st.respect = 98;
    const rng = new Rng(w.rng);
    for (let i = 0; i < 20; i++) fadeStanding(w, rng, w.playerHouseId);
    expect(st.honour).toBeLessThan(98);
    expect(st.respect).toBeLessThan(98);
    st.honour = 40;
    for (let i = 0; i < 20; i++) fadeStanding(w, rng, w.playerHouseId);
    expect(st.honour).toBe(40);
  });

  it('the house is measured each Phase, the last ten kept, and it survives a save', () => {
    let w = createWorld();
    for (let i = 0; i < 100; i++) w = advanceTurn(w);
    expect(w.since!.length).toBeGreaterThan(5);
    expect(w.since!.length).toBeLessThanOrEqual(KEEP);
    const ago = orbitAgo(w)!;
    expect(ago.othes).toBeTypeOf('number');
    expect(Object.keys(ago.toLord).length).toBeGreaterThan(3);
    expect(deserialize(serialize(w)).since).toEqual(w.since);
    expect(delta(10, 7)).toBe('+3');
    expect(delta(7, 10)).toBe('−3');
    expect(delta(7, 7)).toBe('');
  });

  it('the boards never post two jobs of a kind against one house', () => {
    let w = createWorld();
    for (let i = 0; i < 200; i++) w = advanceTurn(w);
    const keys = (w.quests?.board ?? []).filter((q) => q.where && !q.goneId).map((q) => `${q.kind}:${q.where}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
