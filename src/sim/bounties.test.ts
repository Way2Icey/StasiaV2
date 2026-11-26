import { createWorld } from './world';
import { advanceTurns } from './tick';
import { econ } from './economy';
import { deserialize, serialize } from './save';
import { board, buyOff, cannotPlace, claimBounty, ensureBounties, fairPrice, placeBounty, withdrawBounty, type BountyTarget } from './bounties';
import type { World } from './types';

const corsair = (w: World): BountyTarget => { const f = Object.values(w.lanes.factions)[0]!; const m = f.members.find((x) => x.role === 'captain' && !x.fate)!; return { kind: 'corsair', factionId: f.id, memberId: m.id }; };

describe('bounties', () => {
  it('hunters are on the books from the start, with names and records', () => {
    const w = structuredClone(createWorld());
    const s = ensureBounties(w);
    expect(Object.keys(s.hunters).length).toBeGreaterThanOrEqual(8);
    expect(Object.values(s.hunters).every((h) => h.name && h.epithet)).toBe(true);
  });

  it('posting costs the purse and the tithe; taking it down returns the purse', () => {
    let w = structuredClone(createWorld());
    econ(w, w.playerHouseId).stock.othes = 20000;
    const t = corsair(w);
    const fair = fairPrice(w, t);
    w = placeBounty(w, t, fair, 'either', true);
    expect(econ(w, w.playerHouseId).stock.othes).toBe(20000 - Math.ceil(fair * 1.15));
    expect(cannotPlace(w, t, fair)).toMatch(/already/);
    const b = w.bounties!.list[0]!;
    w = withdrawBounty(w, b.id);
    expect(econ(w, w.playerHouseId).stock.othes).toBe(20000 - Math.ceil(fair * 1.15) + fair);
  });

  it('a price on our own people, or a Highroy in peace, is refused', () => {
    const w = structuredClone(createWorld());
    econ(w, w.playerHouseId).stock.othes = 50000;
    const ours = Object.values(w.characters).find((c) => c.alive && c.houseId === w.playerHouseId)!;
    expect(cannotPlace(w, { kind: 'person', id: ours.id }, 2000)).toMatch(/own/);
    const other = Object.values(w.houses).find((h) => h.id !== w.playerHouseId && h.rulerId)!;
    expect(cannotPlace(w, { kind: 'person', id: other.rulerId! }, 50000)).toMatch(/war/);
  });

  it('over time prices are posted, hunted and settled, and it all survives a save', () => {
    let w = structuredClone(createWorld());
    econ(w, w.playerHouseId).stock.othes = 30000;
    const t = corsair(w);
    w = placeBounty(w, t, Math.round(fairPrice(w, t) * 1.4), 'either', true);
    w = advanceTurns(w, 900);
    const s = w.bounties!;
    expect(s.list.length).toBeGreaterThan(2);
    expect(s.list.some((b) => b.status === 'done' || b.status === 'hunted')).toBe(true);
    const back = deserialize(serialize(w));
    expect(back.bounties!.list.length).toBe(s.list.length);
  });

  it('one of ours can go after a price on the board, and is away while hunting', () => {
    let w = structuredClone(createWorld());
    w = advanceTurns(w, 400);
    const b = board(w).find((x) => x.status === 'open' && !(x.poster.kind === 'house' && x.poster.houseId === w.playerHouseId));
    if (!b) return;
    const k = Object.values(w.characters).find((c) => c.alive && c.houseId === w.playerHouseId && c.tier === 'full' && c.seat !== 'highroy' && !c.flags.some((f) => f.id === 'wounded'))!;
    w = claimBounty(w, b.id, k.id);
    expect(w.bounties!.list.find((x) => x.id === b.id)!.status).toBe('hunted');
    expect(w.characters[k.id]!.flags.some((f) => f.id === 'bounty')).toBe(true);
  });

  it('a price on one of ours can be bought off', () => {
    let w = structuredClone(createWorld());
    const s = ensureBounties(w);
    const ours = Object.values(w.characters).find((c) => c.alive && c.houseId === w.playerHouseId && c.role === 'Knight') ?? Object.values(w.characters).find((c) => c.alive && c.houseId === w.playerHouseId)!;
    s.list.unshift({ id: 'btx', target: { kind: 'person', id: ours.id }, poster: { kind: 'underworld', name: 'Vasque', title: 'a Breakline kingpin' }, reward: 2000, terms: 'dead', reason: 'a debt', posted: w.date, expires: w.date, open: true, status: 'open', trail: 0, known: true });
    econ(w, w.playerHouseId).stock.othes = 10000;
    w = buyOff(w, 'btx');
    expect(w.bounties!.list.find((b) => b.id === 'btx')!.status).toBe('withdrawn');
    expect(econ(w, w.playerHouseId).stock.othes).toBe(7000);
  });
});
