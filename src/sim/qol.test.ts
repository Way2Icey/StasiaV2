import { createWorld } from './world';
import { advanceUntil, DEFAULT_STOPS, type StopPrefs } from './tick';
import { knight, cannotKnight } from './ambitions';
import { econ } from './economy';
import { ageOf } from './characters';
import { SPECIES } from '../data/species';
import { CULTURES } from '../data/cultures';
import type { World } from './types';

describe('8.9: the clock and the hall', () => {
  it('stops only for what the player asked to be stopped for', () => {
    let w = structuredClone(createWorld());
    const none = Object.fromEntries(Object.keys(DEFAULT_STOPS).map((k) => [k, false])) as StopPrefs;
    const r = advanceUntil(w, 40, none);
    // A battle may still stop it; nothing else can.
    if (r.stop) expect(r.stop.kind).toBe('decision');
    for (let i = 0; i < 6; i++) {
      const s = advanceUntil(w, 200, DEFAULT_STOPS);
      if (s.stop?.kind) expect(DEFAULT_STOPS[s.stop.kind]).toBe(true);
      w = s.world;
      w.events.pending = [];
    }
  });

  it('a new knight rises with the title their people give one', () => {
    const w: World = structuredClone(createWorld());
    econ(w, w.playerHouseId).stock.othes = 5000;
    const c = Object.values(w.characters).find((x) => x.alive && x.houseId === w.playerHouseId && !x.name.title && x.role !== 'Knight' && !x.seat && x.tier === 'full'
      && !!CULTURES[x.species]?.knightTitle && ageOf(x, w.date) >= SPECIES[x.species].adulthood && !w.ladder?.of[x.id] && !x.flags.some((f) => f.id === 'knighted' || f.id === 'retired'))!;
    expect(c).toBeTruthy();
    c.flags.push({ id: 'blooded', since: w.date });
    expect(cannotKnight(w, c.id)).toBeNull();
    const after = knight(w, c.id);
    expect(['Ser', 'Dame']).toContain(after.characters[c.id]!.name.title);
  });
});
