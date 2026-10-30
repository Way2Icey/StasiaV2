import { createWorld } from './world';
import { advanceTurns } from './tick';
import { executeCaptive, interrogateCaptive, releaseCaptive } from './captives';
import { relation } from './relations';
import { serialize } from './save';
import type { World } from './types';

const base = createWorld();
const P = base.playerHouseId;

/** Put a rival agent in our cells. */
function withCaptive(): { w: World; id: string } {
  const w = structuredClone(base);
  const agent = Object.values(w.characters).find((c) => c.houseId === 'torvann' && c.role === 'Knight')!;
  agent.flags.push({ id: 'captive', since: w.date, knownBy: [P] }, { id: 'missing', since: w.date });
  w.captives[agent.id] = { characterId: agent.id, heldBy: P, since: w.date, interrogated: false };
  return { w, id: agent.id };
}

describe('rival houses', () => {
  const later = advanceTurns(base, 160);

  it('send their own missions and swear their own oaths', () => {
    const rival = Object.values(later.missions).filter((m) => m.houseId !== P);
    expect(rival.length).toBeGreaterThan(3);
    const sworn = Object.entries(later.courts).filter(([h, c]) => h !== P && (c.oath || c.oaths.length));
    expect(sworn.length).toBeGreaterThan(0);
  });

  it('never write their private business into our Chronicle', () => {
    for (const e of later.feed) {
      if (e.missionId) expect(later.missions[e.missionId]!.houseId).toBe(P);
    }
  });

  it('is deterministic', () => {
    expect(serialize(advanceTurns(base, 60))).toBe(serialize(advanceTurns(base, 60)));
  });
});

describe('captives', () => {
  it('release frees them and warms their house', () => {
    const { w, id } = withCaptive();
    const before = relation(w, 'torvann', P);
    const after = releaseCaptive(w, id);
    expect(after.captives[id]).toBeUndefined();
    expect(after.characters[id]!.flags.some((f) => f.id === 'captive' || f.id === 'missing')).toBe(false);
    expect(relation(after, 'torvann', P)).toBeGreaterThan(before);
  });

  it('interrogation happens once', () => {
    const { w, id } = withCaptive();
    const once = interrogateCaptive(w, id);
    expect(once.captives[id]!.interrogated).toBe(true);
    expect(serialize(interrogateCaptive(once, id))).toBe(serialize(once));
  });

  it('execution kills, raises dread and angers their house', () => {
    const { w, id } = withCaptive();
    const after = executeCaptive(w, id);
    expect(after.characters[id]!.alive).toBe(false);
    expect(after.houses[P]!.standing.dread).toBe(w.houses[P]!.standing.dread + 5);
    expect(relation(after, 'torvann', P)).toBeLessThan(relation(w, 'torvann', P) - 30);
  });
});
