import { createWorld } from './world';
import { advanceTurn } from './tick';
import { econ, phaseLedger, setPayScale } from './economy';
import { startWork, bribeDraw } from './treasury';
import { noteFinal, stungBy } from './grounds';
import { bondOf } from './relationships';
import { dateParts } from './time';
import type { World } from './types';

const step = (w: World) => { const x = advanceTurn(w); x.events.pending = []; x.ambitions.audiences = []; return x; };

describe('money that means something', () => {
  it('knights are paid by fame, holdings cost upkeep, and the pay scale changes the bill', () => {
    let w = structuredClone(createWorld());
    const P = w.playerHouseId;
    const cost = (x: World) => -phaseLedger(x, P).filter((l) => l.kind === 'stipend').reduce((n, l) => n + l.amount, 0);
    const fair = cost(w);
    expect(phaseLedger(w, P).some((l) => l.label.startsWith("Knights' stipends"))).toBe(true);
    w = setPayScale(w, 'generous');
    expect(cost(w)).toBeGreaterThan(fair);
    w = setPayScale(w, 'meagre');
    expect(cost(w)).toBeLessThan(fair);
  });

  it('a great work is paid off Phase by Phase and finishes', () => {
    let w = structuredClone(createWorld());
    const P = w.playerHouseId;
    econ(w, P).stock.othes = 200000;
    const r0 = w.houses[P]!.standing.respect;
    w = startWork(w, 'spire');
    for (let i = 0; i < 200 && !w.treasury.works[0]!.done; i++) { w = step(w); econ(w, P).stock.othes = Math.max(econ(w, P).stock.othes, 50000); }
    expect(w.treasury.works[0]!.done).toBe(true);
    expect(w.houses[P]!.standing.respect).toBeGreaterThanOrEqual(Math.min(100, r0));
  });

  it('a paid clerk puts us in the draw', () => {
    let w = structuredClone(createWorld());
    const P = w.playerHouseId;
    econ(w, P).stock.othes = 50000;
    w = bribeDraw(w);
    const year = w.treasury.bribed!;
    for (let i = 0; i < 1200 && !(w.crucible.year === year && w.crucible.stage !== 'quiet'); i++) w = step(w);
    expect(dateParts(w.date).year).toBe(year);
    expect(w.crucible.entrants).toContain(P);
  });
});

describe('rivalries from moments', () => {
  it('losing two finals to the same person makes a rival, and stings', () => {
    const w = structuredClone(createWorld());
    const pool = Object.values(w.characters).filter((c) => c.alive && c.houseId === w.playerHouseId && c.tier === 'full');
    const a = pool[0]!;
    const b = pool.find((x) => x.id !== a.id && !bondOf(w, a.id, x.id))!;
    noteFinal(w, a!.id, b!.id);
    expect(stungBy(w.characters[a!.id]!)).toBe(b!.id);
    noteFinal(w, a!.id, b!.id);
    expect(bondOf(w, a!.id, b!.id)).toBe('rival');
  });
});
