import { createWorld } from './world';
import { advanceTurn } from './tick';
import { econ } from './economy';
import { knight, cannotKnight } from './ambitions';
import { lettersFor, noteOn, reporterOf, competence } from './reports';
import type { World } from './types';

const step = (w: World) => { const x = advanceTurn(w); x.events.pending = []; return x; };

describe('council reports', () => {
  it('news comes through the council, seat by seat, with notes', () => {
    let w = createWorld();
    for (let i = 0; i < 120; i++) w = step(w);
    const letters = lettersFor(w);
    expect(letters.length).toBeGreaterThan(0);
    const seats = new Set(letters.map((e) => reporterOf(w, e)));
    expect(seats.size).toBeGreaterThanOrEqual(2);
    const withNote = letters.filter((e) => reporterOf(w, e) !== 'heralds').map((e) => noteOn(w, e));
    expect(withNote.every((n) => n && n.text.length > 0)).toBe(true);
  });

  it('a new knight writes, and the Grand Master passes it on', () => {
    let w = structuredClone(createWorld());
    const P = w.playerHouseId;
    econ(w, P).stock.othes += 5000;
    const c = Object.values(w.characters).find((x) => x.alive && x.houseId === P && x.tier === 'full' && !cannotKnight(w, x.id))!;
    w = knight(w, c.id);
    const letter = lettersFor(w).find((e) => e.quote?.from === c.id);
    expect(letter).toBeDefined();
    expect(reporterOf(w, letter!)).toBe('grandMaster');
    expect(letter!.quote!.text.length).toBeGreaterThan(10);
  });

  it('an empty seat leaves the house deaf to the small things', () => {
    const w = structuredClone(createWorld());
    const spy = Object.values(w.characters).find((x) => x.houseId === w.playerHouseId && x.seat === 'spymaster')!;
    expect(competence(w, 'spymaster')).toBeGreaterThan(0);
    delete spy.seat;
    expect(competence(w, 'spymaster')).toBe(0);
  });
});
