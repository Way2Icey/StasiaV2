import { createWorld } from './world';
import { advanceTurn } from './tick';
import { deserialize, serialize } from './save';
import { econ } from './economy';
import { answerAsk, borrow, debtOf, loansOf, quoteFor, repay, settleDefault } from './loans';
import { addCycles } from './time';
import type { World } from './types';

const world = createWorld();
const P = world.playerHouseId;

function run(w: World, turns: number, accept = false): World {
  let x = w;
  for (let i = 0; i < turns; i++) {
    x = advanceTurn(x); x.events.pending = [];
    if (accept) for (const a of x.loans.asks) { try { x = answerAsk(x, a.id, true); } catch { /* skip */ } }
  }
  return x;
}

describe('loans', () => {
  it('a rival with money will quote us terms, and the money arrives', () => {
    const w0 = structuredClone(world);
    econ(w0, 'torvann').stock.othes = 60000;
    const q = quoteFor(w0, 'torvann', 10000, 3);
    if ('no' in q) throw new Error(q.no);
    expect(q.rate).toBeGreaterThan(0);
    const before = econ(w0, P).stock.othes;
    const w = borrow(w0, 'torvann', 10000, 3);
    expect(econ(w, P).stock.othes).toBe(before + 10000);
    expect(debtOf(w, P)).toBe(10000);
  });

  it('interest accrues, autopay chips away, and an early repayment clears it', () => {
    const w0 = structuredClone(world);
    econ(w0, 'torvann').stock.othes = 60000;
    let w = borrow(w0, 'torvann', 10000, 3);
    w = run(w, 10);
    const l = loansOf(w, P)[0]!;
    expect(l.owed).toBeLessThan(10000 * 1.2);
    econ(w, P).stock.othes += 50000;
    w = repay(w, l.id, l.owed);
    expect(w.loans.loans[l.id]!.status).toBe('repaid');
  });

  it('a borrower who cannot pay defaults, and we may seize the security', () => {
    const w0 = structuredClone(world);
    econ(w0, P).stock.othes = 100000;
    w0.loans.asks.push({ id: 'ask-t', from: 'serath', to: P, amount: 20000, rate: 0.02, orbits: 1, collateral: { kind: 'revenue', id: 'x', label: 'a sector' }, expires: addCycles(w0.date, 30), kind: 'ask' });
    let w = answerAsk(w0, 'ask-t', true);
    const l = loansOf(w, P)[0]!;
    // Serath is suddenly broke.
    for (let i = 0; i < 45; i++) {
      econ(w, 'serath').stock.othes = 0;
      for (const v of Object.values(w.holdings.modules)) if (v.houseId === 'serath') v.drives = 0;
      w = advanceTurn(w); w.events.pending = [];
    }
    expect(w.loans.loans[l.id]!.overdue).toBe(true);
    w = settleDefault(w, l.id, 'seize');
    expect(w.loans.loans[l.id]!.status).toBe('seized');
    expect(econ(w, P).boons.some((b) => /seized/.test(b.label))).toBe(true);
  });

  it('runs for years with the player lending to all comers', () => {
    const w = run(world, 400, true);
    const back = deserialize(serialize(w));
    expect(back.loans).toEqual(w.loans);
  });
});
