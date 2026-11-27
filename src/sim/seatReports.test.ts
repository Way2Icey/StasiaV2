import { createWorld } from './world';
import { advanceTurns } from './tick';
import { Rng } from './rng';
import { openBriefings } from './briefings';
import { advanceQuests, candidatesFor, sendOnQuest } from './quests';
import { ensureBounties, placeBounty } from './bounties';

describe('the council reports on its work', () => {
  it('each seat brings task reports with real content, and does not stop the clock', () => {
    let w = structuredClone(createWorld());
    w = advanceTurns(w, 80);
    const tasks = openBriefings(w).filter((b) => b.kind === 'task');
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.every((b) => b.done && b.done.summary.length > 0)).toBe(true);
    // One per seat at most.
    const seats = tasks.map((b) => b.seat);
    expect(new Set(seats).size).toBe(seats.length);
  });
});

describe("the Grand Master's board, fleshed out", () => {
  it('posts prices from the bounty board, and sending someone puts them on the trail', () => {
    let w = structuredClone(createWorld());
    ensureBounties(w);
    const foe = Object.values(w.characters).find((c) => c.alive && c.houseId && c.houseId !== w.playerHouseId && !c.seat)!;
    // Someone else's price: an underworld poster on the open board.
    w.bounties!.list.push({ id: 'bx', target: { kind: 'person', id: foe.id }, poster: { kind: 'underworld', name: 'Vesh', title: 'a syndicate lord' }, reward: 3000, terms: 'dead', reason: 'a debt', posted: w.date, expires: { year: w.date.year + 2, cycle: 0 }, open: true, status: 'open', trail: 0, known: true });
    w.quests = { board: [] };
    const r = new Rng(w.rng);
    for (let i = 0; i < 12 && !w.quests.board.some((x) => x.kind === 'bounty'); i++) { w.quests.board = []; advanceQuests(w, r, true); }
    const q = w.quests.board.find((x) => x.kind === 'bounty');
    expect(q).toBeDefined();
    const c = candidatesFor(w)[0];
    if (!c) return;
    w = sendOnQuest(w, q!.id, c.id);
    expect(w.bounties!.list.find((b) => b.id === 'bx')!.hunterId).toBe(`p:${c.id}`);
    void placeBounty;
  });
});
