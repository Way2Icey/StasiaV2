import { createWorld } from './world';
import { advanceTurn } from './tick';
import { netPerPhase, phaseLedger } from './economy';
import { pipeline } from './ladder';
import type { World } from './types';

const step = (w: World) => { const x = advanceTurn(w); x.events.pending = []; x.ambitions.audiences = []; return x; };

describe('the house takes on young people as it needs them', () => {
  it('the pipeline wants more aspirants than knights, and the ladder fills to it, not past it', () => {
    let w = structuredClone(createWorld());
    for (let i = 0; i < 400; i++) w = step(w);
    const n = pipeline(w);
    expect(n.wantAspirants).toBeGreaterThan(Math.ceil(n.knights * 0.6));
    // Pupils come on only to fill places: never far past what is wanted.
    expect(n.pupils).toBeLessThanOrEqual(n.wantPupils + 2);
  });
});

describe('rival economies', () => {
  it('each rival makes something and lacks something, so the houses have reasons to trade', () => {
    const w = createWorld();
    const shapes = Object.keys(w.houses).filter((h) => h !== w.playerHouseId).map((h) => netPerPhase(phaseLedger(w, h)));
    for (const net of shapes) {
      const goods = (['metals', 'provisions', 'fuel', 'components'] as const);
      expect(goods.some((g) => net[g] > 0)).toBe(true);
      expect(goods.some((g) => net[g] < 0)).toBe(true);
    }
  });
});
