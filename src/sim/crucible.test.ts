import { createWorld } from './world';
import { advanceTurn } from './tick';
import { deserialize, serialize } from './save';
import { championScore, currentRound, eligible, enterCrucible, knightScore, marshalScore, menFor, setStance } from './crucible';
import { diamondRead, diamondsOf, diamondText, seasonLine, tally } from './careers';
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
  it('draws houses, runs four Orbits of battles over sites, crowns a winner; our people are away meanwhile', () => {
    let w = createWorld();
    const P = w.playerHouseId;
    let sent: string[] = [];
    let wasAway = false;
    for (let i = 0; i < 1300 && !(w.crucible.history.length && sent.length); i++) {
      w = step(w);
      if (w.crucible.stage === 'drawn' && w.crucible.entrants.includes(P) && !w.crucible.contingents[P]) {
        w.economy.houses[P]!.stock.provisions += 500; w.economy.houses[P]!.stock.fuel += 500;
        const pool = eligible(w, P);
        const m = [...pool].sort((a, b) => marshalScore(b) - marshalScore(a))[0]!;
        const ch = pool.filter((c) => c !== m).sort((a, b) => championScore(b) - championScore(a))[0]!;
        const kn = pool.filter((c) => c !== m && c !== ch).sort((a, b) => knightScore(b) - knightScore(a)).slice(0, 4);
        w = enterCrucible(w, { houseId: P, marshalId: m.id, championId: ch.id, knights: kn.map((c) => c.id), men: menFor(4), menLost: 0 });
        expect(w.crucible.contingents[P]!.men).toBe(300);
        sent = [m.id, ch.id];
      }
      if (w.crucible.stage === 'campaign' && sent.some((id) => w.characters[id]?.alive && isAway(w, id))) wasAway = true;
      const r = currentRound(w);
      if (r && w.crucible.contingents[P] && !r.stance[P]) w = setStance(w, 'cunning');
    }
    expect(sent.length).toBe(2);
    expect(wasAway).toBe(true);
    const last = w.crucible.history[w.crucible.history.length - 1]!;
    expect(last.drawn.length).toBeGreaterThanOrEqual(5);
    expect(sent.every((id) => !w.characters[id]?.flags.some((f) => f.id === 'crucible'))).toBe(true);
    expect(deserialize(serialize(w)).crucible).toEqual(w.crucible);
  });
});
