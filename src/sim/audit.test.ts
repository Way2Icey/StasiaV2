import { createWorld } from './world';
import { advanceTurns } from './tick';
import { Rng } from './rng';
import { econ } from './economy';
import { deserialize, serialize } from './save';
import { advanceConcerns, answerConcern, courtiers, sides, MIN_BACKERS } from './concerns';
import { advanceQuests, candidatesFor, sendOnQuest } from './quests';
import { advanceTalkRequests, receiveRequest, turnAway } from './talk';
import { standingFx } from './standingFx';
import { opinion } from './relationships';
import type { World } from './types';

const phases = (w: World, fn: (w: World, r: Rng) => void, n: number) => { const r = new Rng(w.rng); for (let i = 0; i < n; i++) fn(w, r); w.rng = r.state; };

describe('concerns of the court', () => {
  it('a concern comes only with three or more backers, and answering it moves their opinion', () => {
    const w = structuredClone(createWorld());
    expect(courtiers(w).length).toBeGreaterThan(3);
    phases(w, (x, r) => advanceConcerns(x, r, true), 40);
    const list = w.concerns ?? [];
    expect(list.every((c) => c.backers.length >= MIN_BACKERS)).toBe(true);
    if (!list.length) return;
    const c = list[0]!;
    const lord = w.houses[w.playerHouseId]!.rulerId!;
    const before = opinion(w, c.backers[0]!, lord);
    econ(w, w.playerHouseId).stock.othes = 100000;
    const after = answerConcern(w, c.id, true);
    expect((after.concerns ?? []).some((x) => x.id === c.id)).toBe(false);
    expect(opinion(after, c.backers[0]!, lord)).toBeGreaterThan(before);
  });

  it('people take sides by who they are', () => {
    const w = structuredClone(createWorld());
    const s = sides(w, 'stipends');
    const both = new Set([...s.backers, ...s.against].map((c) => c.id));
    expect(both.size).toBe(s.backers.length + s.against.length);
  });
});

describe("the Grand Master's board", () => {
  it('fills, and someone sent comes back changed', () => {
    let w = structuredClone(createWorld());
    phases(w, (x, r) => advanceQuests(x, r, true), 2);
    const q = w.quests!.board[0];
    expect(q).toBeDefined();
    const c = candidatesFor(w)[0];
    if (!c) return;
    w = sendOnQuest(w, q!.id, c.id);
    expect(w.characters[c.id]!.flags.some((f) => f.id === 'quest')).toBe(true);
    w = advanceTurns(w, q!.cycles + 2);
    expect(w.characters[c.id]!.flags.some((f) => f.id === 'quest')).toBe(false);
    expect(w.quests!.board.some((x) => x.id === q!.id)).toBe(false);
  });
});

describe('audience requests', () => {
  it('people ask to see us; receiving opens an audience, turning away costs a little', () => {
    const w = structuredClone(createWorld());
    phases(w, (x, r) => advanceTalkRequests(x, r, true), 20);
    const reqs = w.talkRequests ?? [];
    expect(reqs.length).toBeGreaterThan(0);
    const r = reqs[0]!;
    const got = receiveRequest(w, r.id, 'warm');
    expect(got.talk?.with).toBe(r.personId);
    const lord = w.houses[w.playerHouseId]!.rulerId!;
    const before = opinion(w, r.personId, lord);
    const away = turnAway(w, r.id);
    expect(opinion(away, r.personId, lord)).toBeLessThan(before);
  });
});

describe('standing, made plain', () => {
  it('names what each part of standing does now', () => {
    const w = structuredClone(createWorld());
    const fx = standingFx(w, w.playerHouseId);
    expect(fx.honour.length && fx.respect.length && fx.dread.length).toBeTruthy();
  });

  it('a world with all of this survives a save and a year', () => {
    let w = structuredClone(createWorld());
    w = advanceTurns(w, 160);
    w = deserialize(serialize(w));
    w = advanceTurns(w, 40);
    expect(w.quests).toBeDefined();
  });
});
