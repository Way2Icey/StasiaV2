import { describe, expect, it } from 'vitest';
import { createWorld } from './world';
import { advanceUntil } from './tick';
import { anchored, bringIntoView, circleOf, CIRCLE_CAP, knownTo, letFade, pin, tendCircles, touch, veil } from './circle';
import { learn } from './knowledge';
import { absoluteCycle, CYCLES_PER_YEAR } from './time';
import type { World } from './types';

const fresh = (): World => structuredClone(createWorld('circle-test', { house: 'alerion' }));

describe('the Circle', () => {
  it('people the story stops touching drift into the Household, and touching brings them back', () => {
    const w = fresh();
    const P = w.playerHouseId;
    const c = circleOf(w, P).find((x) => !anchored(w, x))!;
    expect(c).toBeTruthy();
    c.seen = absoluteCycle(w.date) - CYCLES_PER_YEAR * 10;
    tendCircles(w);
    expect(c.veiled).toBeTruthy();
    expect(c.tier).toBe('minor');
    touch(w, c.id);
    expect(c.veiled).toBeUndefined();
    expect(c.tier).toBe('full');
  });

  it('the Circle is kept to its size, and the anchored are never let go', () => {
    let w = fresh();
    w = advanceUntil(w, 400 * 8, false).world;
    for (const h of Object.keys(w.houses)) {
      const inView = circleOf(w, h);
      const anchors = inView.filter((c) => anchored(w, c)).length;
      // Tended once a year: between tendings, a few may come into view.
      expect(inView.length).toBeLessThanOrEqual(Math.max(CIRCLE_CAP, anchors) + 8);
      const ruler = w.houses[h]!.rulerId ? w.characters[w.houses[h]!.rulerId!] : undefined;
      if (ruler) expect(ruler.veiled).toBeUndefined();
    }
  }, 300000);

  it('pinning keeps someone in view; letting fade sends them to the Household', () => {
    let w = fresh();
    const P = w.playerHouseId;
    const c = circleOf(w, P).find((x) => !anchored(w, x))!;
    w = letFade(w, c.id);
    expect(w.characters[c.id]!.veiled).toBeTruthy();
    w = pin(w, c.id, true);
    expect(w.characters[c.id]!.veiled).toBeUndefined();
    expect(w.characters[c.id]!.pinned).toBe(true);
    expect(() => letFade(w, w.houses[P]!.rulerId!)).toThrow(/too close/);
  });

  it('other houses\' leaders are known; the rest must be uncovered', () => {
    const w = fresh();
    const P = w.playerHouseId;
    const other = Object.keys(w.houses).find((h) => h !== P)!;
    const ruler = w.characters[w.houses[other]!.rulerId!]!;
    expect(knownTo(w, P, ruler)).toBe(true);
    const nobody = Object.values(w.characters).find((c) => c.alive && c.houseId === other && !c.seat && c.id !== ruler.id && !c.name.epithet && !knownTo(w, P, c));
    if (nobody) {
      learn(w, P, nobody.id, 10);
      expect(knownTo(w, P, nobody)).toBe(true);
    }
    const veiled = Object.values(w.characters).find((c) => c.alive && c.houseId === other && !c.seat && c.id !== ruler.id)!;
    veil(w, veiled);
    expect(knownTo(w, P, veiled)).toBe((w.knowledge[P]?.[veiled.id]?.depth ?? 0) >= 20);
    bringIntoView(w, veiled, 'quiet');
  });
});
