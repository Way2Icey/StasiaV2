import { describe, expect, it } from 'vitest';
import { createWorld } from './world';
import { advanceUntil } from './tick';
import { allDefs, eventDef, fireStage, makeCtx, optionsFor, settle, shown, titleFor, variantsOf, type PendingEvent } from './events';
import { econ, phaseLedger, sellSurplus } from './economy';
import { startWar, formationsOf, warsOf } from './war';
import { advanceCrash, maybeCrash, shockMult, deepInDebt, openDebt } from './arcs_economy';
import { openStruggles } from './storystate';
import { Rng } from './rng';
import type { World } from './types';

const fresh = (seed: string, house = 'alerion'): World => { const w = structuredClone(createWorld(seed, { house })); w.events.pending = []; return w; };

/** Fire an event until it comes up as the telling we want (or give up). */
function fireAs(w: World, defId: string, variant: string | undefined, seed: Partial<PendingEvent> = {}): PendingEvent | null {
  for (let i = 0; i < 80; i++) {
    const rng = Rng.fromSeed(`${defId}/${i}`);
    const before = structuredClone(w);
    const p = fireStage(w, rng, defId, seed);
    if (p && p.variant === variant) return p;
    Object.assign(w, before);
  }
  return null;
}

describe('event variants', () => {
  it('a variant carries its own stakes, scaled to the house, into the answer', () => {
    const w = fresh('var1');
    econ(w, w.playerHouseId).stock.othes = 500000;
    const p = fireAs(w, 'blackmail', 'scaled')!;
    expect(p).toBeTruthy();
    const amt = Number(p.stakes?.amt);
    expect(amt).toBeGreaterThanOrEqual(50);
    expect(p.text).toContain(amt.toLocaleString('en-US'));
    const before = econ(w, w.playerHouseId).stock.othes;
    settle(w, Rng.fromSeed('s'), p.id, 0);
    expect(before - econ(w, w.playerHouseId).stock.othes).toBe(amt);
  });

  it('tellings with conditions only come when they hold, and the plain one still comes', () => {
    const w = fresh('var2');
    // No war: the wartime dockworkers never come.
    const seen = new Set<string | undefined>();
    for (let i = 0; i < 40; i++) { const x = structuredClone(w); const p = fireStage(x, Rng.fromSeed(`d${i}`), 'dockworkers', {}); if (p) seen.add(p.variant); }
    expect(seen.has('warwork')).toBe(false);
    expect(seen.has(undefined)).toBe(true);
  });

  it('branches are hidden unless their condition holds, and a hidden choice falls back to the council\'s', () => {
    const w = fresh('var3');
    const p = fireStage(w, Rng.fromSeed('r'), 'quota', {})!;
    const def = eventDef('quota')!;
    const opts = optionsFor(def, p);
    const ctx = makeCtx(w, Rng.fromSeed('x'), p);
    const hidden = opts.findIndex((o) => !shown(o, ctx));
    if (hidden >= 0) {
      const r = settle(w, Rng.fromSeed('y'), p.id, hidden)!;
      expect(r.choice).toBe(opts[def.fallback]!.label);
    }
    expect(titleFor(def, p)).toBeTruthy();
  });

  it('every telling of every event can be set up and answered every way without error', () => {
    let w = fresh('var4');
    w = advanceUntil(w, 800, false).world;
    econ(w, w.playerHouseId).stock.othes = 200000;
    for (const def of allDefs().filter((d) => variantsOf(d).length)) {
      for (const v of [undefined, ...variantsOf(def).map((x) => x.id)]) {
        const x = structuredClone(w);
        const p = fireAs(x, def.id, v);
        if (!p) continue;
        for (let i = 0; i < optionsFor(def, p).length; i++) {
          const y = structuredClone(x);
          expect(() => settle(y, Rng.fromSeed(`o${i}`), p.id, i)).not.toThrow();
        }
      }
    }
  }, 120000);
});

describe('war bites', () => {
  it('standing forces cost a little in peace, and a host in the field at war costs far more', () => {
    const w = fresh('war1', 'torvann');
    const peace = phaseLedger(w, w.playerHouseId);
    const home = peace.find((l) => l.kind === 'forces');
    expect(home && home.amount < 0).toBe(true);
    const war = startWar(w, Rng.fromSeed('w'), { attacker: w.playerHouseId, defender: 'murnath', goal: 'tribute', rung: 'war' });
    if (!war.fronts.length) war.fronts.push({ id: 'fr-test', kind: 'border', where: 'the border', meter: 0, since: 0 });
    for (const f of formationsOf(w, w.playerHouseId)) f.front = war.fronts[0]!.id;
    const lines = phaseLedger(w, w.playerHouseId);
    const field = lines.filter((l) => l.kind === 'war').reduce((t, l) => t + l.amount, 0);
    expect(field).toBeLessThan(home!.amount * 2);
    expect(lines.some((l) => l.label.startsWith('Trade lost'))).toBe(true);
    expect(warsOf(w, w.playerHouseId).length).toBe(1);
  });

  it('the Steward sells surplus stores to cover a debt', () => {
    const w = fresh('war2', 'torvann');
    const e = econ(w, w.playerHouseId);
    e.stock.navisium = 5000;
    e.stock.othes = -3000;
    const got = sellSurplus(w, w.playerHouseId, 3000);
    expect(got).toBeGreaterThanOrEqual(3000);
    expect(e.stock.othes).toBeGreaterThanOrEqual(0);
    expect(e.stock.navisium).toBeGreaterThan(250);
  });
});

describe('the Exchange', () => {
  it('a crash pulls prices down, calls in loans, and plays out its stages', () => {
    let w = fresh('ex1');
    const before = w.economy.market.components.price;
    const rng = Rng.fromSeed('c');
    for (let i = 0; i < 200 && !w.economy.crash; i++) maybeCrash(w, rng);
    expect(w.economy.crash).toBeTruthy();
    expect(w.economy.market.components.price).toBeLessThan(before);
    expect(shockMult(w, 'components')).toBeLessThan(1);
    expect(w.events.pending.some((p) => p.defId === 'x5:floor')).toBe(true);
    for (const p of [...w.events.pending]) settle(w, rng, p.id, null);
    w = advanceUntil(w, 16 * 3, false).world;
    advanceCrash(w, rng);
    expect((w.economy.crash as { stage: number }).stage).toBeGreaterThanOrEqual(2);
  });

  it('the debt spiral opens as a struggle when we are deep in it', () => {
    const w = fresh('ex2');
    econ(w, w.playerHouseId).stock.othes = -20000;
    expect(deepInDebt(w)).toBe(false); // no loans: no creditors to spiral with
    openDebt(w, 'Test.');
    expect(openStruggles(w).some((s) => s.kind === 'debt')).toBe(true);
  });
});

describe('stories on the new systems', () => {
  it('every new story can be set up where it fits and answered every way', () => {
    let w = fresh('sys1');
    w = advanceUntil(w, 1600, false).world;
    econ(w, w.playerHouseId).stock.othes = 300000;
    const ids = allDefs().filter((d) => d.id.startsWith('sys:')).map((d) => d.id);
    expect(ids.length).toBeGreaterThanOrEqual(20);
    let placed = 0;
    for (const id of ids) {
      const x = structuredClone(w);
      const p = fireStage(x, Rng.fromSeed(id), id, {});
      if (!p) continue;
      placed++;
      for (let i = 0; i < optionsFor(eventDef(id)!, p).length; i++) {
        const y = structuredClone(x);
        expect(() => settle(y, Rng.fromSeed(`${id}/${i}`), p.id, i)).not.toThrow();
      }
    }
    expect(placed).toBeGreaterThan(5);
  }, 120000);
});
