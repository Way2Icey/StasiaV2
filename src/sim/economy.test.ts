import { createWorld } from './world';
import { advanceTurns } from './tick';
import { deserialize, serialize } from './save';
import {
  answerRansom, demandRansom, econ, missionCost, netPerPhase, phaseLedger, rivalDemandsRansom, trade,
} from './economy';
import { assignTask } from './council';
import { launchMission } from './missions';
import { seatHolder } from './query';
import { Rng } from './rng';
import type { World } from './types';

const base = createWorld();
const P = base.playerHouseId;

describe('economy', () => {
  it('every house starts with stock and a ledger', () => {
    for (const h of Object.keys(base.houses)) {
      expect(econ(base, h).stock.othes).toBeGreaterThan(0);
      expect(phaseLedger(base, h).length).toBeGreaterThan(2);
    }
  });

  it('settles a Phase exactly as the ledger forecast', () => {
    const before = econ(base, P).stock;
    const net = netPerPhase(phaseLedger(base, P));
    // Advance to just past the next Phase boundary.
    let w = base;
    while (w.economy.houses[P]!.lastPhase.length === 0) w = advanceTurns(w, 1);
    const after = econ(w, P).stock;
    // Metals are never bought automatically, so they move exactly by the forecast.
    expect(after.metals - before.metals).toBe(net.metals);
  });

  it('buys and sells at the Exchange', () => {
    const othes = econ(base, P).stock.othes;
    const bought = trade(base, P, 'fuel', 10);
    expect(econ(bought, P).stock.fuel).toBe(econ(base, P).stock.fuel + 10);
    expect(econ(bought, P).stock.othes).toBeLessThan(othes);
    const sold = trade(bought, P, 'metals', -100);
    expect(econ(sold, P).stock.othes).toBeGreaterThan(econ(bought, P).stock.othes);
    expect(() => trade(base, P, 'components', 100000)).toThrow(/othes/);
  });

  it('missions cost othes', () => {
    const spy = seatHolder(base, P, 'spymaster')!;
    const target = seatHolder(base, 'serath', 'highroy')!;
    const { world } = launchMission(base, { kind: 'investigate', houseId: P, leaderId: spy.id, targetId: target.id, approach: 'quick' });
    expect(econ(world, P).stock.othes).toBe(econ(base, P).stock.othes - missionCost('investigate', 'quick'));
    const broke = structuredClone(base);
    econ(broke, P).stock.othes = 10;
    expect(() => launchMission(broke, { kind: 'investigate', houseId: P, leaderId: spy.id, targetId: target.id, approach: 'careful' })).toThrow(/othes/);
  });

  it('developing a sector spends othes and metals', () => {
    const s = base.planets['alerion-prime']!.sectors.find((x) => x.roomUsed < x.room && x.controllerFamilyId)!;
    let w = assignTask(base, P, 'steward', 'develop', s.id);
    w = advanceTurns(w, 30);
    expect(w.economy.houses[P]!.recent.some((l) => l.kind === 'develop') || w.feed.some((f) => /grows/.test(f.text))).toBe(true);
  });

  it('runs a long game without NaN', () => {
    const w = advanceTurns(base, 240);
    for (const h of Object.keys(w.houses)) for (const v of Object.values(econ(w, h).stock)) expect(Number.isFinite(v)).toBe(true);
    for (const m of Object.values(w.economy.market)) expect(m.price).toBeGreaterThan(0);
  });
});

function caught(holder: string, owner: string): { w: World; id: string } {
  const w = structuredClone(base);
  const agent = Object.values(w.characters).find((c) => c.houseId === owner && c.role === 'Knight')!;
  agent.flags.push({ id: 'captive', since: w.date, knownBy: [holder] }, { id: 'missing', since: w.date });
  w.captives[agent.id] = { characterId: agent.id, heldBy: holder, since: w.date, interrogated: true };
  return { w, id: agent.id };
}

describe('ransom', () => {
  it('a rival pays or refuses, once', () => {
    const { w, id } = caught(P, 'torvann');
    const after = demandRansom(w, id, Rng.fromSeed('x'));
    const paid = !after.captives[id];
    if (paid) expect(econ(after, P).stock.othes).toBeGreaterThan(econ(w, P).stock.othes);
    else expect(after.captives[id]!.ransom?.status).toBe('refused');
  });

  it('we can pay for our own', () => {
    const { w, id } = caught('torvann', P);
    rivalDemandsRansom(w, id);
    expect(w.captives[id]!.ransom?.status).toBe('open');
    const paid = answerRansom(w, id, true);
    expect(paid.captives[id]).toBeUndefined();
    expect(paid.characters[id]!.flags.some((f) => f.id === 'captive')).toBe(false);
    const refused = answerRansom(w, id, false);
    expect(refused.captives[id]!.ransom?.status).toBe('refused');
  });
});

describe('save', () => {
  it('upgrades a version 4 save', () => {
    const old = JSON.parse(serialize(base));
    old.version = 4;
    delete old.economy;
    const w = deserialize(JSON.stringify(old));
    expect(w.version).toBe(9);
    expect(econ(w, P).stock.othes).toBeGreaterThan(0);
  });
});
