import { createWorld } from './world';
import { advanceTurn } from './tick';
import { deserialize, serialize } from './save';
import { championScore, eligible, enterCrucible, knightScore, marshalScore, ourNext, setStance } from './crucible';
import { diamondRead, diamondsOf, diamondText, seasonLine, tally, titlesOf } from './careers';
import { isAway } from './court';
import type { World } from './types';

const step = (w: World) => { const x = advanceTurn(w); x.events.pending = []; x.ambitions.audiences = []; return x; };

describe('careers', () => {
  it('counts deeds by season and reads potential as diamonds', () => {
    const w = structuredClone(createWorld());
    const c = Object.values(w.characters).find((x) => x.alive && x.houseId === w.playerHouseId && x.tier === 'full')!;
    tally(w, c.id, 'bouts', 3); tally(w, c.id, 'boutsWon', 2);
    expect(seasonLine(w.careers.of[c.id]![w.date.year]!)).toMatch(/2–1 in the pits/);
    expect([1, 2, 3]).toContain(diamondsOf(c));
    const r = diamondRead(w, c);
    expect(diamondText(r)).toHaveLength(3);
  });
});

describe('the Crucible', () => {
  it('runs a year: entries, three rounds, a final, a champion; the contingent is away meanwhile', () => {
    let w = createWorld();
    const P = w.playerHouseId;
    let sent: string[] = [];
    let wasAway = false;
    for (let i = 0; i < 400 && w.crucible.history.length === 0; i++) {
      w = step(w);
      if (w.crucible.stage === 'open' && !w.crucible.contingents[P]) {
        const pool = eligible(w, P);
        const m = [...pool].sort((a, b) => marshalScore(b) - marshalScore(a))[0]!;
        const ch = pool.filter((c) => c !== m).sort((a, b) => championScore(b) - championScore(a)).slice(0, 3);
        const kn = pool.filter((c) => c !== m && !ch.includes(c)).sort((a, b) => knightScore(b) - knightScore(a)).slice(0, 6);
        w = enterCrucible(w, { houseId: P, marshalId: m.id, champions: ch.map((c) => c.id), knights: kn.map((c) => c.id), chest: 1000 });
        sent = [m.id, ...ch.map((c) => c.id)];
      }
      if (w.crucible.stage === 'campaign' && sent.some((id) => w.characters[id]?.alive && isAway(w, id))) wasAway = true;
      const nx = ourNext(w);
      if (nx && !nx.stance[P]) w = setStance(w, nx.id, 'cunning');
    }
    expect(wasAway).toBe(true);
    expect(w.crucible.history.length).toBe(1);
    const champ = w.crucible.history[0]!.champion;
    const someone = Object.values(w.characters).find((c) => c.houseId === champ && titlesOf(w, c.id).length);
    expect(someone).toBeTruthy();
    expect(sent.every((id) => !w.characters[id]?.flags.some((f) => f.id === 'crucible'))).toBe(true);
    expect(deserialize(serialize(w)).crucible).toEqual(w.crucible);
  });
});
