import { createWorld } from './world';
import { advanceTurn } from './tick';
import { createBattle, runOut, tickBattle, giveOrder, answerMoment, cannotOrder, outcomes, battleOf, commandBattle, fightItOut, type Battle } from './battle';
import { huntMember, huntersFree } from './companies';
import type { World } from './types';
import { econ } from './economy';

const ours = (w: World) => Object.values(w.characters).filter((c) => c.alive && c.houseId === w.playerHouseId && c.tier === 'full').sort((a, b) => b.stats.duelling - a.stats.duelling);

function fight(w: World, theirPower: number, opts: { theatre?: 'ship' | 'space' | 'surface'; skill?: number } = {}): Battle {
  const [a, b, c] = ours(w);
  return createBattle(w, {
    kind: 'hunt', title: 'test', theatre: opts.theatre ?? 'ship', where: 'here',
    ours: { name: 'ours', commander: { id: a!.id }, mass: 60, fighters: [{ id: a!.id, champion: true }, { id: b!.id }, { id: c!.id }] },
    theirs: { name: 'theirs', commander: { name: 'Vask', skill: opts.skill ?? 11, lead: 11 }, mass: 60, fighters: [{ name: 'Vask', power: theirPower, champion: true }, { name: 'mate', power: theirPower - 3 }] },
  });
}

describe('the battle engine', () => {
  it('the stronger side usually wins, but not always; outcomes are the same for the same seed', () => {
    let strong = 0, weak = 0;
    for (let i = 0; i < 60; i++) {
      const w = structuredClone(createWorld()); w.nextId += i * 13;
      const b1 = fight(w, 8); runOut(b1, w); if (b1.result!.winner === 0) strong++;
      const b2 = fight(w, 22); runOut(b2, w); if (b2.result!.winner === 0) weak++;
    }
    expect(strong).toBeGreaterThan(50);
    expect(weak).toBeLessThan(strong);
    const w1 = structuredClone(createWorld()); const x = fight(w1, 14); runOut(x, w1);
    const w2 = structuredClone(createWorld()); const y = fight(w2, 14); runOut(y, w2);
    expect(x.feed.map((l) => l.text)).toEqual(y.feed.map((l) => l.text));
  });

  it('orders go through the commander: a few, and then no more', () => {
    const w = structuredClone(createWorld());
    const b = fight(w, 12);
    const max = b.sides[0].ordersMax;
    expect(max).toBeGreaterThanOrEqual(2);
    expect(max).toBeLessThanOrEqual(7);
    b.commanded = true;
    for (let i = 0; i < max; i++) giveOrder(b, 0, { kind: i % 2 ? 'press' : 'hold' }, w);
    expect(b.sides[0].orders).toBe(0);
    expect(cannotOrder(b, 0, { kind: 'press' })).toMatch(/no more orders/);
  });

  it('when someone commands, a moment waits for them; when no one does, the commander answers it', () => {
    const w = structuredClone(createWorld());
    const b = fight(w, 13);
    b.commanded = true;
    for (let i = 0; i < 40 && !b.moment && b.status !== 'over'; i++) tickBattle(b, w);
    if (b.moment) {
      const t = b.tick;
      tickBattle(b, w);
      expect(b.tick).toBe(t); // frozen until answered
      answerMoment(b, b.moment.options[0]!.key, w);
      expect(b.moment).toBeUndefined();
    }
    const c = fight(w, 13);
    runOut(c, w);
    expect(c.status).toBe('over');
  });

  it('breaking off ends it as a loss, and saves people', () => {
    const w = structuredClone(createWorld());
    const b = fight(w, 25);
    b.commanded = true;
    tickBattle(b, w);
    giveOrder(b, 0, { kind: 'breakoff' }, w);
    expect(b.status).toBe('over');
    expect(b.result!.winner).toBe(1);
    expect(b.result!.brokeOff).toBe(true);
    expect(outcomes(b).filter((o) => o.side === 0 && o.fate === 'dead').length).toBe(0);
  });
});

describe('hunts are fought live', () => {
  it('a found captain becomes a battle; when it ends, the hunt settles', () => {
    let w = structuredClone(createWorld());
    econ(w, w.playerHouseId).stock.othes += 5000;
    const f = Object.values(w.lanes.factions)[0]!;
    const m = f.members.find((x) => x.role === 'captain') ?? f.members[0]!;
    m.known = true; m.skill = 9; m.cunning = 1;
    const leader = huntersFree(w)[0]!;
    w = huntMember(w, f.id, m.id, leader, []);
    let battleId: string | undefined;
    for (let i = 0; i < 200 && !battleId; i++) { w = advanceTurn(w); w.events.pending = []; w.ambitions.audiences = []; battleId = w.lanes.hunts.find((h) => h.memberId === m.id)?.battleId; if (!w.lanes.hunts.some((h) => h.memberId === m.id)) break; }
    if (!battleId) return; // slipped the hunt: allowed
    expect(battleOf(w, battleId)!.status).toBe('ready');
    w = commandBattle(w, battleId);
    w = fightItOut(w, battleId);
    expect(battleOf(w, battleId)!.status).toBe('over');
    w = advanceTurn(w);
    expect(w.lanes.hunts.some((h) => h.memberId === m.id)).toBe(false);
    expect(battleOf(w, battleId)!.applied).toBe(true);
    expect(w.characters[leader]!.flags.some((x) => x.id === 'hunting')).toBe(false);
  });
});

describe('the Crucible is fought live', () => {
  it('our clashes become battles on the surface, and settle the ground when they end', async () => {
    const { eligible, enterCrucible, marshalScore, championScore, knightScore, menFor } = await import('./crucible');
    let w = createWorld();
    const P = w.playerHouseId;
    let entered = false;
    let seen: Battle | undefined;
    for (let i = 0; i < 1300 && !(seen?.applied); i++) {
      w = advanceTurn(w); w.events.pending = []; w.ambitions.audiences = [];
      if (!entered && w.crucible.stage === 'drawn' && w.crucible.entrants.includes(P) && !w.crucible.contingents[P]) {
        w.economy.houses[P]!.stock.provisions += 500; w.economy.houses[P]!.stock.fuel += 500; w.economy.houses[P]!.stock.othes += 5000;
        const pool = eligible(w, P);
        const m = [...pool].sort((a, b) => marshalScore(b) - marshalScore(a))[0]!;
        const ch = pool.filter((c) => c !== m).sort((a, b) => championScore(b) - championScore(a))[0]!;
        const kn = pool.filter((c) => c !== m && c !== ch).sort((a, b) => knightScore(b) - knightScore(a)).slice(0, 4);
        w = enterCrucible(w, { houseId: P, marshalId: m.id, championId: ch.id, knights: kn.map((c) => c.id), men: menFor(4), menLost: 0 });
        entered = true;
      }
      seen = w.battles?.list.find((b) => b.kind === 'crucible') ?? seen;
      if (seen) seen = battleOf(w, seen.id);
    }
    if (!entered) return; // not drawn in this world's first years: nothing to see
    // Drawn, but never met another house at a location: no clash of ours to fight.
    if (!seen) { expect(w.crucible.rounds.every((r) => r.battles.every((b) => !b.sides.includes(P)))).toBe(true); return; }
    expect(seen?.theatre).toBe('surface');
    expect(seen?.applied).toBe(true);
    expect(w.crucible.rounds.some((r) => r.battles.some((b) => b.locationId === seen!.ref))).toBe(true);
  });
});
