import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import {
  addCycles, boundariesCrossed, dateParts, formatDate, makeDate, yearsBetween,
  CYCLES_PER_YEAR,
} from './time';
import { buildWord, displayName, generateName } from './names';
import { CULTURES } from '../data/cultures';
import { createWorld, councilOf, membersOf } from './world';
import { advanceTurn, advanceTurns, kill } from './tick';
import { deserialize, serialize, SaveError } from './save';
import { ageOf } from './characters';
import { ALL_STATS } from './types';
import { TRAITS_BY_ID } from '../data/traits';

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = Rng.fromSeed('x');
    const b = Rng.fromSeed('x');
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });
  it('differs between seeds and stays in range', () => {
    const a = Rng.fromSeed('x').next();
    const b = Rng.fromSeed('y').next();
    expect(a).not.toBe(b);
    const r = Rng.fromSeed('z');
    for (let i = 0; i < 1000; i++) {
      const v = r.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });
  it('resumes from a saved state', () => {
    const a = Rng.fromSeed('resume');
    a.next();
    const copy = new Rng(a.state);
    expect(copy.next()).toBe(a.next());
  });
});

describe('LPS calendar', () => {
  it('formats the start date', () => {
    expect(formatDate(makeDate(412, 3, 14))).toBe('SY-412 · Orbit 3 · Cycle 14');
  });
  it('splits a date into orbit and phase', () => {
    const p = dateParts(makeDate(412, 3, 17));
    expect(p).toMatchObject({ orbit: 3, phase: 2, cycleOfOrbit: 17, cycleOfPhase: 1 });
  });
  it('rolls over orbits and years', () => {
    expect(formatDate(addCycles(makeDate(412, 10, 80), 1))).toBe('SY-413 · Orbit 1 · Cycle 1');
    expect(formatDate(addCycles(makeDate(412, 3, 80), 1))).toBe('SY-412 · Orbit 4 · Cycle 1');
  });
  it('counts boundaries crossed', () => {
    const from = makeDate(412, 3, 79);
    expect(boundariesCrossed(from, addCycles(from, 2))).toEqual({ phases: 1, orbits: 1, years: 0 });
  });
  it('computes ages', () => {
    expect(yearsBetween(makeDate(400, 1, 1), makeDate(412, 1, 1))).toBe(12);
    expect(yearsBetween(makeDate(400, 5, 1), makeDate(412, 4, 80))).toBe(11);
  });
});

describe('names', () => {
  it('builds words only from a culture’s pieces', () => {
    const rng = Rng.fromSeed('names');
    for (let i = 0; i < 200; i++) {
      const w = buildWord(rng, CULTURES.torvann.given);
      expect(w).toMatch(/^[A-Z][a-z]+$/);
      expect(w).not.toMatch(/(.)\1\1/i);
    }
  });
  it('follows house conventions', () => {
    const world = createWorld('conventions');
    const people = Object.values(world.characters);
    const torvannCommon = people.filter((c) => c.species === 'torvann' && !world.families[c.familyId]!.high);
    expect(torvannCommon.length).toBeGreaterThan(0);
    for (const c of torvannCommon) expect(displayName(c.name)).toContain(' of ');

    const torvannRuler = world.characters[world.houses.torvann!.rulerId!]!;
    expect(torvannRuler.name.family).toBe('Torvann');
    expect(world.characters[world.houses.serath!.rulerId!]!.name.family).toBe('Serath');

    const shaaliin = people.filter((c) => c.species === 'shaaliin');
    expect(shaaliin.length).toBeGreaterThan(0);
    for (const c of shaaliin) {
      expect(c.name.courtName).toBeTruthy();
      expect(c.name.trueName).toBeTruthy();
    }
    // Alerion never uses its house name as a surname.
    for (const c of membersOf(world, 'alerion')) expect(c.name.family).not.toBe('Alerion');
  });
  it('gives knights a title', () => {
    const rng = Rng.fromSeed('knight');
    const n = generateName(rng, {
      species: 'thessari', sex: 'f', knighted: true,
      family: { id: 'f', houseId: 'h', name: 'Holm', species: 'thessari', ruling: false, high: false },
    });
    expect(displayName(n)).toMatch(/^Dame [A-Z][a-z]+ Holm$/);
  });
});

describe('world generation', () => {
  it('is deterministic for a seed', () => {
    expect(serialize(createWorld('same'))).toBe(serialize(createWorld('same')));
    expect(serialize(createWorld('same'))).not.toBe(serialize(createWorld('other')));
  });
  it('builds the slice: four houses, four capitals, named people', () => {
    const w = createWorld();
    expect(Object.keys(w.houses).sort()).toEqual(['alerion', 'serath', 'shaaliin', 'torvann']);
    expect(Object.keys(w.planets)).toHaveLength(4);
    expect(w.planets['alerion-prime']!.sectors).toHaveLength(7);
    const people = Object.values(w.characters);
    expect(people.filter((c) => c.tier === 'full').length).toBeGreaterThanOrEqual(40);
    expect(people.filter((c) => c.tier === 'minor').length).toBeGreaterThanOrEqual(30);
  });
  it('seats the Alerion council from the design docs', () => {
    const w = createWorld();
    const council = councilOf(w, 'alerion');
    const byName = council.map((c) => displayName(c.name));
    expect(byName).toContain('Aurel Vanthos');
    expect(byName).toContain('Ser Calder Rhosk');
    const rhosk = council.find((c) => c.seat === 'champion')!;
    expect(rhosk.species).toBe('thessari');
    expect(rhosk.traits.map((t) => t.id)).toContain('victorOf');
    expect(ageOf(world_aurel(w), w.date)).toBe(47);
  });
  it('keeps every stat in range and every trait known', () => {
    const w = createWorld('ranges');
    for (const c of Object.values(w.characters)) {
      for (const s of ALL_STATS) {
        expect(c.stats[s]).toBeGreaterThanOrEqual(1);
        expect(c.stats[s]).toBeLessThanOrEqual(20);
      }
      for (const t of c.traits) expect(TRAITS_BY_ID[t.id]).toBeDefined();
      // No opposing traits together.
      for (const t of c.traits) {
        for (const o of TRAITS_BY_ID[t.id]!.opposes ?? []) expect(c.traits.map((x) => x.id)).not.toContain(o);
      }
    }
  });
  it('gives every overseer-role quarter an overseer', () => {
    const w = createWorld();
    const docks = w.planets['alerion-prime']!.sectors.find((s) => s.name.startsWith('Sector 9'))!;
    const port = docks.quarters.find((q) => q.name === 'Starport Nine')!;
    expect(port.overseerId).toBeTruthy();
    expect(w.characters[port.overseerId!]!.role).toContain('Harbourmaster');
  });
});

function world_aurel(w: ReturnType<typeof createWorld>) {
  return w.characters[w.houses.alerion!.rulerId!]!;
}

describe('turns', () => {
  it('advances two cycles and does not mutate the input', () => {
    const w = createWorld();
    const before = serialize(w);
    const next = advanceTurn(w);
    expect(serialize(w)).toBe(before);
    expect(formatDate(next.date)).toBe('SY-412 · Orbit 3 · Cycle 16');
  });
  it('is deterministic across turns', () => {
    const a = advanceTurns(createWorld('turns'), 450);
    const b = advanceTurns(createWorld('turns'), 450);
    expect(serialize(a)).toBe(serialize(b));
  });
  it('logs a new orbit', () => {
    const w = advanceTurns(createWorld(), 34); // Cycle 14 + 68 → into Orbit 4
    expect(w.feed.some((e) => e.text === 'Orbit 4 begins.')).toBe(true);
  });
  it('passes the seat to an heir when the ruler dies', () => {
    const w = createWorld();
    const ruler = world_aurel(w);
    kill(w, ruler, w.date, 'a test');
    const next = w.characters[w.houses.alerion!.rulerId!]!;
    expect(next.name.given).toBe('Cassia');
    expect(next.seat).toBe('highroy');
    expect(next.flags.some((f) => f.id === 'grieving')).toBe(true);
  });
  it('ages people over years', () => {
    const w = createWorld();
    const later = advanceTurns(w, CYCLES_PER_YEAR / 2); // one year
    expect(ageOf(world_aurel(later), later.date)).toBe(48);
  });
});

describe('save and load', () => {
  it('round-trips exactly, and play continues identically', () => {
    const w = advanceTurns(createWorld('save'), 10);
    const loaded = deserialize(serialize(w));
    expect(serialize(advanceTurns(loaded, 50))).toBe(serialize(advanceTurns(w, 50)));
  });
  it('rejects junk', () => {
    expect(() => deserialize('nope')).toThrow(SaveError);
    expect(() => deserialize('{"version":99}')).toThrow(SaveError);
  });
});
