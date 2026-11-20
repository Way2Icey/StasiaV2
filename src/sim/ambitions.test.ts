import { createWorld } from './world';
import { advanceTurn } from './tick';
import { deserialize, serialize } from './save';
import { answerAudience, appointToSeat, cannotHoldAudience, holdAudience, optionsFor } from './ambitions';
import { opinion } from './relationships';
import { seatHolder } from './query';
import type { World } from './types';

const world = createWorld();
const P = world.playerHouseId;
const run = (w: World, n: number) => { let x = w; for (let i = 0; i < n; i++) { x = advanceTurn(x); x.events.pending = []; } return x; };

describe('ambitions', () => {
  it('people of note want things from the start', () => {
    const ours = Object.entries(world.ambitions.of).filter(([id]) => world.characters[id]?.houseId === P);
    expect(ours.length).toBeGreaterThan(10);
    expect(new Set(ours.map(([, a]) => a.kind)).size).toBeGreaterThan(2);
  });

  it('an audience reveals what they want and puts them on the desk', () => {
    const c = Object.values(world.characters).find((x) => x.alive && x.houseId === P && world.ambitions.of[x.id] && x.seat !== 'highroy' && !cannotHoldAudience(world, x.id))!;
    const w = holdAudience(world, c.id);
    expect(w.ambitions.of[c.id]!.known).toBe(true);
    const au = w.ambitions.audiences.find((a) => a.characterId === c.id)!;
    expect(optionsFor(w, au).length).toBeGreaterThan(1);
    expect(cannotHoldAudience(w, c.id)).toBeTruthy();
    const lord = w.houses[P]!.rulerId!;
    const refused = answerAudience(w, au.id, optionsFor(w, au).some((o) => o.id === 'refuse') ? 'refuse' : 'forbid');
    expect(opinion(refused, c.id, lord)).toBeLessThan(opinion(w, c.id, lord));
  });

  it('naming someone to a seat fulfils a seat ambition and stings the one dismissed', () => {
    const old = seatHolder(world, P, 'steward')!;
    const c = Object.values(world.characters).find((x) => x.alive && x.houseId === P && !x.seat && x.tier === 'full')!;
    const w0 = structuredClone(world);
    w0.ambitions.of[c.id] = { kind: 'seat', target: 'steward', since: w0.date, frustration: 60 };
    const w = appointToSeat(w0, 'steward', c.id);
    expect(seatHolder(w, P, 'steward')!.id).toBe(c.id);
    expect(w.ambitions.of[c.id]).toBeUndefined();
    expect(w.characters[old.id]!.seat).toBeUndefined();
    expect(w.ambitions.of[old.id]?.kind).toBe('seat');
  });

  it('left alone, ambitions sour and people come to the Highroy; it survives a save', () => {
    let w = world;
    let seen = 0;
    for (let i = 0; i < 6; i++) { w = run(w, 40); seen += w.ambitions.audiences.length; }
    expect(seen).toBeGreaterThan(0);
    expect(deserialize(serialize(w)).ambitions).toEqual(w.ambitions);
  });
});
