import { createWorld } from './world';
import { computeRankings, RANK_KEYS } from './rankings';
import { fleetHulls, PROFILES, standingArmy } from '../data/profiles';

describe('the houses as the canon has them', () => {
  it('keeps the canon figures: Alerion 30-40k soldiers of under a million, Endama 150-200k of two to three million', () => {
    expect(standingArmy('alerion')).toBeGreaterThanOrEqual(30000);
    expect(standingArmy('alerion')).toBeLessThanOrEqual(40000);
    expect(standingArmy('endama')).toBeGreaterThanOrEqual(150000);
    expect(standingArmy('endama')).toBeLessThanOrEqual(200000);
    expect(fleetHulls('alerion')).toBeGreaterThanOrEqual(40);
    // Every Great House outnumbers every minor one in people.
    const great = ['lumen', 'varngotha', 'theaszar', 'mull', 'torvann', 'doven', 'myr'];
    const minPop = Math.min(...great.map((g) => PROFILES[g]!.pop));
    for (const [id, p] of Object.entries(PROFILES)) if (!great.includes(id) && id !== 'endama') expect(p.pop).toBeLessThan(minPop);
  });

  it('Lumen stands first, and the best at nothing; each house leads in what it is known for', () => {
    for (const seed of [undefined, 'stasia-b', 'stasia-c', 'stasia-d']) {
      const t = computeRankings(createWorld(seed));
      const lead = Object.fromEntries(RANK_KEYS.map((k) => [k, t.find((r) => r.rank[k] === 1)!.id]));
      expect(t[0]!.id).toBe('lumen');
      expect(lead.power).toBe('torvann');
      expect(lead.economy).toBe('doven');
      expect(lead.knights).toBe('theaszar');
      for (const k of ['power', 'economy', 'knights'] as const) expect(lead[k]).not.toBe('lumen');
      // Lumen is in the first three of every ranking.
      const l = t.find((r) => r.id === 'lumen')!;
      for (const k of ['power', 'economy', 'knights'] as const) expect(l.rank[k]).toBeLessThanOrEqual(3);
    }
  }, 120000);
});
