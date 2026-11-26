import { createWorld } from './world';
import { advanceTurns } from './tick';
import { Rng } from './rng';
import { advanceBriefings, briefDone, dismissBriefing, openBriefings } from './briefings';
import { advanceConcerns } from './concerns';
import { launchMission } from './missions';
import { seatHolder } from './query';

describe('briefings', () => {
  it('a concern comes to the door in its backer\'s mouth, and leaves once answered elsewhere', () => {
    const w = structuredClone(createWorld());
    const r = new Rng(w.rng);
    for (let i = 0; i < 60 && !(w.concerns ?? []).length; i++) advanceConcerns(w, r, true);
    if (!(w.concerns ?? []).length) return;
    advanceBriefings(w, false);
    const b = openBriefings(w).find((x) => x.kind === 'concern')!;
    expect(b.personId).toBe(w.concerns![0]!.raisedBy);
    w.concerns = [];
    advanceBriefings(w, false);
    expect(openBriefings(w).some((x) => x.id === b.id)).toBe(false);
  });

  it('a mission home is reported by its leader; done briefings stay until thanked', () => {
    const w0 = structuredClone(createWorld());
    const P = w0.playerHouseId;
    const spy = seatHolder(w0, P, 'spymaster')!;
    const target = Object.values(w0.characters).find((c) => c.alive && c.houseId !== P && c.seat)!;
    let { world: w, id } = launchMission(w0, { kind: 'investigate', houseId: P, leaderId: spy.id, targetId: target.id, approach: 'quick' });
    for (let i = 0; i < 60 && w.missions[id]!.stage !== 'done'; i++) w = advanceTurns(w, 1);
    const b = openBriefings(w).find((x) => x.kind === 'mission' && x.ref === id);
    expect(b).toBeDefined();
    expect(b!.lines.length).toBeGreaterThan(0);
    briefDone(w, b!.id, 'Understood', []);
    w = advanceTurns(w, 2);
    expect(openBriefings(w).some((x) => x.id === b!.id)).toBe(true);
    w = dismissBriefing(w, b!.id);
    expect(openBriefings(w).some((x) => x.id === b!.id)).toBe(false);
  });
});
