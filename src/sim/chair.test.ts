import { describe, expect, it } from 'vitest';
import { createWorld } from './world';
import { advanceUntil } from './tick';
import { dateParts } from './time';
import { ensureChair, guardCost, isOurChair, promiseSeat, protection, regencyFactor, setGuard, watchChair, chooseRegent, CAPANNA_ROLES } from './chair';
import { appointToCapanna, dismissFromCapanna, issueDecree } from './arcs_chair';
import { envyAgainst, envyOf, topHouse } from './envy';
import { liveHouses, lowestGreat, regardOf, table } from './archon';
import { fireStage, settle } from './events';
import { Rng } from './rng';
import type { World } from './types';

const fresh = (): World => structuredClone(createWorld('chair-test', { house: 'alerion' }));

function seatUs(w: World): World {
  const P = w.playerHouseId;
  const ruler = w.characters[w.houses[P]!.rulerId!]!;
  w.archon!.numarade.exarchon = { name: ruler.name.given, houseId: P, personId: ruler.id, since: dateParts(w.date).year, born: 0, species: ruler.species };
  watchChair(w, () => {});
  return w;
}

describe('envy', () => {
  it('the house at the top is resented, and the Exarchon\'s house more', () => {
    const w = fresh();
    const top = topHouse(w)!;
    const before = envyAgainst(w, top);
    expect(before).toBeGreaterThan(0);
    const other = liveHouses(w).find((h) => h.id !== top)!.id;
    w.archon!.numarade.exarchon = { name: 'x', houseId: top, since: 0, born: 0, species: 'human' as never };
    expect(envyOf(w, other, top)).toBeGreaterThan(0);
    expect(envyAgainst(w, top)).toBeGreaterThan(before);
  });
});

describe('the chair', () => {
  it('becomes ours when one of ours is Exarchon, and it is not free', () => {
    const w = seatUs(fresh());
    expect(isOurChair(w)).toBe(true);
    expect(ensureChair(w).held!.capital).toBe(3);
    expect(regencyFactor(w, w.playerHouseId)).toBe(0.75);
    const heir = Object.values(w.characters).find((c) => c.alive && c.houseId === w.playerHouseId && c.id !== w.houses[w.playerHouseId]!.rulerId && c.tier === 'full')!;
    const w2 = chooseRegent(w, heir.id);
    expect(w2.chair!.held!.regentId).toBe(heir.id);
    expect(regencyFactor(w2, w2.playerHouseId)).toBeGreaterThanOrEqual(0.8);
  });

  it('appointing an adviser pleases one house and the Great Houses passed over notice', () => {
    let w = seatUs(fresh());
    const P = w.playerHouseId;
    const others = liveHouses(w).filter((h) => h.id !== P);
    const pick = others.find((h) => h.tier === 'minor') ?? others[0]!;
    const before = regardOf(w, pick.id, P);
    w = appointToCapanna(w, CAPANNA_ROLES[0], pick.id);
    expect(w.archon!.numarade.capanna.some((s) => s.houseId === pick.id)).toBe(true);
    expect(regardOf(w, pick.id, P)).toBeGreaterThan(before);
    w = dismissFromCapanna(w, CAPANNA_ROLES[0]);
    expect(w.archon!.numarade.capanna.length).toBe(0);
  });

  it('decrees cost capital, and a struck motion is gone', () => {
    let w = seatUs(fresh());
    const P = w.playerHouseId;
    const other = liveHouses(w).find((h) => h.id !== P)!.id;
    const m = table(w, 'censure', other, P);
    w = issueDecree(w, 'strike', m.id);
    expect(w.archon!.numarade.motions.find((x) => x.id === m.id)!.status).toBe('failed');
    expect(w.chair!.held!.capital).toBe(2);
    w = issueDecree(w, 'levy');
    expect(() => issueDecree(w, 'levy')).toThrow(/capital/);
  });

  it('guards cost othes and protect', () => {
    let w = fresh();
    const ruler = w.houses[w.playerHouseId]!.rulerId!;
    const p0 = protection(w, ruler);
    w = setGuard(w, ruler, 3);
    expect(guardCost(w)).toBeGreaterThan(0);
    expect(protection(w, ruler)).toBeGreaterThan(p0);
  });

  it('promises can only be made before the chair is ours', () => {
    let w = fresh();
    const other = liveHouses(w).find((h) => h.id !== w.playerHouseId)!.id;
    w = promiseSeat(w, other, true);
    expect(w.chair!.promises).toContain(other);
    w = seatUs(w);
    expect(() => promiseSeat(w, other, true)).toThrow();
  });

  it('a year in the chair runs without breaking, and the crises come', () => {
    let w = seatUs(fresh());
    w = advanceUntil(w, 400, false).world;
    const seen = w.events.pending.filter((p) => p.defId.startsWith('chair:')).length + (w.events.log ?? []).filter((l: { defId?: string }) => l.defId?.startsWith('chair:')).length;
    expect(seen).toBeGreaterThan(0);
  }, 120000);

  it('the chair passes only by death: the Exarchon\'s house cannot be stood down, and a sentence kills', () => {
    let w = seatUs(fresh());
    const P = w.playerHouseId;
    expect(lowestGreat(w)?.id).not.toBe(P);
    const exId = w.chair!.held!.exarchonId;
    const by = liveHouses(w).find((h) => h.id !== P)!.id;
    const m = table(w, 'remove', by);
    for (const s of w.archon!.numarade.seats) m.votes[s] = 'aye';
    m.closes = 0;
    w = advanceUntil(w, 20, false).world;
    expect(w.characters[exId]!.alive).toBe(false);
    expect(isOurChair(w)).toBe(false);
  }, 120000);

  it('a plot against the Exarchon can be turned aside by guards', () => {
    let w = seatUs(fresh());
    const exId = w.chair!.held!.exarchonId;
    w = setGuard(w, exId, 3);
    const rng = Rng.fromSeed('plot');
    fireStage(w, rng, 'chair:plot', {});
    const p = w.events.pending.find((x) => x.defId === 'chair:plot');
    expect(p).toBeTruthy();
    settle(w, rng, p!.id, 3);
    expect(w.chair!.guards[exId]).toBe(3);
  });
});
