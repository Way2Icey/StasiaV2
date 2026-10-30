import { createWorld } from './world';
import { advanceTurn, advanceTurns } from './tick';
import { deserialize, serialize } from './save';
import { KNOW, knowledgeOf, rangeWidth, viewOf } from './knowledge';
import { activeMissionOf, cannotLead, forecast, launchMission } from './missions';
import { seatHolder, ruler } from './query';
import { ALL_STATS, HIDDEN_STATS, type World } from './types';

const world = createWorld();
const P = world.playerHouseId;

function spymaster(w: World) {
  return seatHolder(w, P, 'spymaster')!;
}

describe('knowledge fog', () => {
  it('gives every house a baseline for every person', () => {
    for (const h of Object.keys(world.houses)) {
      for (const id of Object.keys(world.characters)) expect(world.knowledge[h]?.[id]).toBeDefined();
    }
  });

  it('knows its own ruler well and foreign commoners barely', () => {
    expect(knowledgeOf(world, P, ruler(world, P)!.id).depth).toBeGreaterThanOrEqual(KNOW.exact);
    const foreign = Object.values(world.characters).find((c) => c.houseId !== P && c.tier === 'minor')!;
    expect(knowledgeOf(world, P, foreign.id).depth).toBeLessThan(15);
  });

  it('estimates always contain the truth', () => {
    for (const c of Object.values(world.characters)) {
      const v = viewOf(world, P, c);
      for (const s of ALL_STATS) {
        const [lo, hi] = v.stats[s];
        expect(c.stats[s]).toBeGreaterThanOrEqual(lo);
        expect(c.stats[s]).toBeLessThanOrEqual(hi);
      }
      if (v.hidden) for (const s of HIDDEN_STATS) {
        const [lo, hi] = v.hidden[s];
        expect(c.hidden[s]).toBeGreaterThanOrEqual(lo);
        expect(c.hidden[s]).toBeLessThanOrEqual(hi);
      }
    }
  });

  it('narrows with depth', () => {
    expect(rangeWidth(90, 0.5)).toBe(0);
    expect(rangeWidth(10, 0.5)).toBeGreaterThan(rangeWidth(60, 0.5));
  });

  it('hides secret flags from houses that do not know them', () => {
    const foreign = Object.values(world.characters).find((c) => c.houseId !== P && c.tier === 'full')!;
    const w = structuredClone(world);
    w.characters[foreign.id]!.flags.push({ id: 'debtor', since: w.date });
    expect(viewOf(w, P, w.characters[foreign.id]!).flags.some((f) => f.id === 'debtor')).toBe(false);
    expect(viewOf(w, P, w.characters[foreign.id]!, true).flags.some((f) => f.id === 'debtor')).toBe(true);
  });
});

describe('missions', () => {
  const target = ruler(world, 'serath')!;

  it('refuses leaders who cannot go', () => {
    expect(cannotLead(world, P, ruler(world, P)!)).toMatch(/Highroy/);
    expect(cannotLead(world, P, target)).toMatch(/house/);
    expect(cannotLead(world, P, spymaster(world))).toBeNull();
  });

  it('forecasts without changing the world', () => {
    const before = serialize(world);
    const f = forecast(world, { kind: 'investigate', houseId: P, leaderId: spymaster(world).id, targetId: target.id, approach: 'careful' });
    expect(f.ok).toBe(true);
    if (f.ok) {
      expect(f.total).toBe(f.travel * 2 + f.task);
      expect(f.success).toBeGreaterThanOrEqual(0);
      expect(f.success).toBeLessThanOrEqual(1);
    }
    expect(serialize(world)).toBe(before);
  });

  it('runs an investigation from launch to report, deterministically', () => {
    const run = () => {
      let { world: w, id } = launchMission(world, { kind: 'investigate', houseId: P, leaderId: spymaster(world).id, targetId: target.id, approach: 'careful' });
      expect(activeMissionOf(w, spymaster(w).id)?.id).toBe(id);
      for (let i = 0; i < 20 && w.missions[id]!.stage !== 'done'; i++) w = advanceTurn(w);
      return { w, m: w.missions[id]! };
    };
    const a = run();
    const b = run();
    expect(a.m.stage).toBe('done');
    expect(a.m.outcome).toBeDefined();
    expect(a.m.report).toBeTruthy();
    expect(serialize(a.w)).toBe(serialize(b.w));
    if (a.m.outcome !== 'disaster') {
      expect(knowledgeOf(a.w, P, target.id).depth).toBeGreaterThan(knowledgeOf(world, P, target.id).depth);
      expect(a.w.characters[spymaster(world).id]!.location).toEqual(spymaster(world).location);
    }
  });

  it('scouting raises knowledge of a whole world', () => {
    const leader = Object.values(world.characters).find((c) => c.houseId === P && c.role === 'Knight' && !cannotLead(world, P, c))!;
    let { world: w, id } = launchMission(world, { kind: 'scout', houseId: P, leaderId: leader.id, targetPlanetId: 'torvann-ashfall', approach: 'careful' });
    w = advanceTurns(w, 20);
    const m = w.missions[id]!;
    expect(m.stage).toBe('done');
    if (m.outcome !== 'disaster') expect(m.findings?.length).toBeGreaterThan(0);
    else expect(m.report).toBeTruthy();
  });

  it('many missions never break invariants', () => {
    let w = world;
    const targets = Object.values(world.characters).filter((c) => c.houseId !== P && c.tier === 'full').slice(0, 8);
    const leaders = Object.values(world.characters).filter((c) => !cannotLead(world, P, c)).slice(0, 8);
    leaders.forEach((l, i) => {
      w = launchMission(w, { kind: 'investigate', houseId: P, leaderId: l.id, targetId: targets[i]!.id, approach: i % 2 ? 'quick' : 'careful' }).world;
    });
    w = advanceTurns(w, 25);
    for (const m of Object.values(w.missions)) expect(m.stage).toBe('done');
    for (const c of Object.values(w.characters)) {
      const v = viewOf(w, P, c);
      for (const s of ALL_STATS) {
        expect(c.stats[s]).toBeGreaterThanOrEqual(v.stats[s][0]);
        expect(c.stats[s]).toBeLessThanOrEqual(v.stats[s][1]);
      }
    }
  });
});

describe('save migration', () => {
  it('upgrades a version 1 save', () => {
    const old = JSON.parse(serialize(world));
    old.version = 1;
    delete old.knowledge;
    delete old.missions;
    const w = deserialize(JSON.stringify(old));
    expect(w.version).toBe(3);
    expect(w.missions).toEqual({});
    expect(Object.keys(w.knowledge[P]!).length).toBe(Object.keys(w.characters).length);
  });
});
