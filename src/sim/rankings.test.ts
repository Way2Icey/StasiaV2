import { createWorld } from './world';
import { advanceTurn } from './tick';
import { computeRankings, inTopThree, RANK_KEYS } from './rankings';
import { duesFor, EXCHANGE_DUES } from './exchange';
import { deserialize, serialize } from './save';

describe('the Numarade rankings', () => {
  it('ranks every house in five ways and overall, from the first day', () => {
    const w = createWorld();
    const t = w.rankings!.table;
    expect(t.length).toBe(Object.values(w.archon!.houses).filter((h) => !h.ended).length);
    expect(t.map((r) => r.place)).toEqual(t.map((_, i) => i + 1));
    for (const k of RANK_KEYS) expect(new Set(t.map((r) => r.rank[k])).size).toBe(t.length);
    // No single house leads everything.
    expect(new Set(RANK_KEYS.map((k) => t.find((r) => r.rank[k] === 1)!.id)).size).toBeGreaterThan(1);
    expect(computeRankings(w).length).toBe(t.length);
  });

  it('publishes a bulletin at the turn of the Orbit, and it survives a save', () => {
    let w = createWorld();
    for (let i = 0; i < 45 && !w.rankings!.bulletins.length; i++) w = advanceTurn(w);
    expect(w.rankings!.bulletins.length).toBe(1);
    expect(w.rankings!.bulletins[0]!.lines.some((l) => l.tone === 'ours')).toBe(true);
    expect(w.rankings!.prev?.length).toBeGreaterThan(0);
    expect(deserialize(serialize(w)).rankings).toEqual(w.rankings);
  });

  it('the top three in Economy pay lower Exchange dues', () => {
    const w = createWorld();
    const top = w.rankings!.table.find((r) => r.rank.economy === 1)!.id;
    expect(inTopThree(w, top, 'economy')).toBe(true);
    expect(duesFor(w, top)).toBeLessThan(EXCHANGE_DUES);
  });
});
