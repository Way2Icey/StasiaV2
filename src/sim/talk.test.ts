import { Rng } from './rng';
import { createWorld } from './world';
import { advanceTurns } from './tick';
import { deserialize, serialize } from './save';
import { addMark } from './details';
import { opinion } from './relationships';
import { aimsFor, BEATS, cannotTalk, leaveTalk, openTalk, say } from './talk';
import type { World } from './types';

const guest = (w: World) => Object.values(w.characters).find((c) => c.alive && c.houseId && c.houseId !== w.playerHouseId && c.seat)!;

describe('audiences', () => {
  it('three exchanges, then it ends and is remembered', () => {
    let w = structuredClone(createWorld());
    const c = guest(w);
    expect(cannotTalk(w, c.id)).toBeNull();
    expect(aimsFor(w, c.id)).toContain('sway');
    w = openTalk(w, c.id, 'warm');
    expect(w.talk!.options.length).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < BEATS; i++) w = say(w, w.talk!.options[0]!.id);
    expect(w.talk!.done).toBeDefined();
    expect(w.talks![c.id]!.talks).toBe(1);
    w = leaveTalk(w);
    expect(w.talk).toBeUndefined();
    expect(cannotTalk(w, c.id)).toMatch(/this Phase/);
    expect(w.feed.some((f) => /audience/.test(f.text) && f.account)).toBe(true);
  });

  it('always picking the best line beats always picking the worst', () => {
    const run = (best: boolean) => {
      let total = 0;
      for (let k = 0; k < 6; k++) {
        let w = structuredClone(createWorld());
        w.rng = Rng.fromSeed(`t${k}`).state;
        const c = Object.values(w.characters).filter((x) => x.alive && x.houseId && x.houseId !== w.playerHouseId && x.seat)[k]!;
        w = openTalk(w, c.id, 'warm');
        for (let i = 0; i < BEATS; i++) { const o = [...w.talk!.options].sort((a, b) => (best ? b.value - a.value : a.value - b.value))[0]!; w = say(w, o.id); }
        total += w.talk!.done!.score;
      }
      return total;
    };
    expect(run(true)).toBeGreaterThan(run(false) + 6);
  });

  it('a feat from this world can be raised, and a wrong fact is remembered for next time', () => {
    let w = structuredClone(createWorld());
    const c = guest(w);
    addMark(w, c, { kind: 'feat', text: 'outfought the Long Bastion', place: 'at Kesh Breach' });
    let saw = false;
    for (let k = 0; k < 8 && !saw; k++) {
      let x = structuredClone(w); x.rng = Rng.fromSeed(`f${k}`).state;
      x = openTalk(x, c.id, 'warm');
      for (let i = 0; i < BEATS && !saw; i++) { saw = x.talk!.options.some((o) => /Long Bastion/.test(o.text)); x = say(x, x.talk!.options[0]!.id); }
    }
    expect(saw).toBe(true);
    // A slip stays with them, and can be set right next time.
    w.talks = { [c.id]: { last: { year: 1, cycle: 0 }, talks: 1, warmth: 0, slips: ['The Anchor issues every othe and sets what it is worth.'] } };
    w = openTalk(w, c.id, 'warm');
    const mend = w.talk!.options.find((o) => o.key === 'recall:mend');
    expect(mend).toBeDefined();
    w = say(w, mend!.id);
    expect(w.talks![c.id]!.slips).toEqual([]);
  });

  it('a warm audience moves their opinion of our Highroy, and survives a save mid-talk', () => {
    let w = structuredClone(createWorld());
    const c = guest(w);
    const lord = w.houses[w.playerHouseId]!.rulerId!;
    const before = opinion(w, c.id, lord);
    w = openTalk(w, c.id, 'warm');
    w = deserialize(serialize(w));
    for (let i = 0; i < BEATS; i++) { const o = [...w.talk!.options].sort((a, b) => b.value - a.value)[0]!; w = say(w, o.id); }
    expect(opinion(w, c.id, lord)).toBeGreaterThan(before);
    w = leaveTalk(w);
    w = advanceTurns(w, 5);
  });
});
