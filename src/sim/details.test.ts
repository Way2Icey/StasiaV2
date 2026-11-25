import { createWorld } from './world';
import { Rng } from './rng';
import { addMark, combatant, duelAccount, marksOf, meetings, oldWound, standoffAccount, attemptAccount } from './details';
import { callTourney, fighters, isMilitary } from './grounds';
import { econ } from './economy';
import { deserialize, serialize } from './save';
import type { World } from './types';

const soldiers = (w: World) => fighters(w, w.playerHouseId).filter((c) => isMilitary(w, c));

describe('accounts and marks', () => {
  it('a duel is told in a few lines and leaves marks on both fighters', () => {
    const w = structuredClone(createWorld());
    const [a, b] = soldiers(w);
    const acc = duelAccount(w, Rng.fromSeed(String(7)), combatant(a!, 12), combatant(b!, 10), { winner: 'a', hurt: true, lasting: null }, { place: 'in the yard', witness: 'the yard-master' });
    expect(acc.by).toBe('the yard-master');
    expect(acc.lines.length).toBeGreaterThanOrEqual(3);
    expect(acc.lines.length).toBeLessThanOrEqual(8);
    expect(marksOf(a).some((m) => m.kind === 'feat' && m.with === b!.id)).toBe(true);
    expect(marksOf(b).some((m) => m.with === a!.id)).toBe(true);
    expect(meetings(a, b!.id).won).toBe(1);
  });

  it('remembers: a second meeting says so, and an old wound shows', () => {
    const w = structuredClone(createWorld());
    const [a, b] = soldiers(w);
    addMark(w, b!, { kind: 'scar', text: 'a cut to the left knee', part: 'knee', side: 'left', place: 'at the tourney', with: a!.id });
    expect(oldWound(b)?.part).toBe('knee');
    let saw = 0;
    for (let i = 0; i < 20; i++) {
      const x = structuredClone(w);
      const acc = duelAccount(x, Rng.fromSeed(String(i + 1)), combatant(x.characters[a!.id]!, 12), combatant(x.characters[b!.id]!, 10), { winner: 'a' }, { place: 'in the yard', witness: 'a squire' });
      if (acc.lines.some((l) => /knee|before|again|last time/i.test(l))) saw++;
    }
    expect(saw).toBeGreaterThan(0);
  });

  it('accounts differ from fight to fight', () => {
    const w = structuredClone(createWorld());
    const [a, b] = soldiers(w);
    const told = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const x = structuredClone(w);
      told.add(duelAccount(x, Rng.fromSeed(String(100 + i)), combatant(x.characters[a!.id]!, 11), combatant(x.characters[b!.id]!, 11), { winner: i % 2 ? 'a' : 'b' }, { place: 'in the yard', witness: 'a squire' }).lines.join(' '));
    }
    expect(told.size).toBeGreaterThanOrEqual(10);
  });

  it('marks stay bounded and keep the lasting ones', () => {
    const w = structuredClone(createWorld());
    const [a] = soldiers(w);
    addMark(w, a!, { kind: 'kill', text: 'killed a man in the pits', place: 'the pits' });
    for (let i = 0; i < 40; i++) addMark(w, a!, { kind: 'feat', text: `won bout ${i}`, place: 'the yard' });
    expect(marksOf(a).length).toBe(16);
    expect(marksOf(a).some((m) => m.kind === 'kill')).toBe(true);
  });

  it('standoffs and attempts on a life are told too', () => {
    const w = structuredClone(createWorld());
    const [a, b] = soldiers(w);
    expect(standoffAccount(w, Rng.fromSeed(String(3)), { name: 'Vigil', captainId: a!.id }, { name: 'Ardent', captainId: b!.id }, 'Kesh').lines.length).toBeGreaterThan(1);
    expect(attemptAccount(w, Rng.fromSeed(String(4)), a!, 'assassin', true, 2, 'none').lines.length).toBeGreaterThan(1);
  });

  it('the tourney final carries an account into the log, and it survives a save', () => {
    let w = structuredClone(createWorld());
    econ(w, w.playerHouseId).stock.othes = 10000;
    w = callTourney(w);
    const rec = w.feed.find((e) => e.account);
    expect(rec?.account?.lines.length).toBeGreaterThan(0);
    const back = deserialize(serialize(w));
    expect(back.feed.find((e) => e.id === rec!.id)?.account).toEqual(rec!.account);
    expect(Object.values(back.characters).some((c) => c.marks?.length)).toBe(true);
  });
});
