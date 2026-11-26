import { createWorld } from './world';
import { advanceTurns } from './tick';
import { Rng } from './rng';
import { econ } from './economy';
import { advanceConcerns, answerConcern } from './concerns';
import { fire, orderEvent, awaiting } from './events';
import { openBriefings } from './briefings';
import { launchMission, recallMission, setMissionApproach } from './missions';
import { seatHolder } from './query';
import './eventDefs';

describe('orders take time', () => {
  it('a concern said yes to is carried out later, and its carrier reports back', () => {
    let w = structuredClone(createWorld());
    const r = new Rng(w.rng);
    for (let i = 0; i < 80 && !(w.concerns ?? []).length; i++) advanceConcerns(w, r, true);
    w.rng = r.state;
    const c = (w.concerns ?? [])[0];
    if (!c) return;
    econ(w, w.playerHouseId).stock.othes = 100000;
    w = answerConcern(w, c.id, true);
    expect(w.orders?.length).toBe(1);
    const due = w.orders![0]!.at;
    w = advanceTurns(w, 25);
    expect(w.orders?.length ?? 0).toBe(0);
    expect(w.feed.some((f) => /^Done:/.test(f.text))).toBe(true);
    void due;
    expect(openBriefings(w).some((b) => b.kind === 'report' && b.done)).toBe(true);
  });

  it('an event answered as an order waits, then settles with that choice', () => {
    let w = structuredClone(createWorld());
    const rng = new Rng(w.rng);
    let p: ReturnType<typeof awaiting>[number] | undefined;
    for (let i = 0; i < 20 && !p; i++) { if (fire(w, rng, 'home', {}, 16, 'calm')) p = w.events.pending.find((x) => !x.urgent && !x.missionId); }
    w.rng = rng.state;
    if (!p) return;
    w = orderEvent(w, p.id, 0);
    expect(awaiting(w).some((x) => x.id === p.id)).toBe(false);
    expect(w.events.pending.some((x) => x.id === p.id)).toBe(true);
    w = advanceTurns(w, 10);
    expect(w.events.pending.some((x) => x.id === p.id)).toBe(false);
    const res = w.events.log.find((x) => x.id === p.id)!;
    expect(res.ordered).toBe(true);
    expect(res.byCouncil).toBe(false);
  });

  it('missions send word from the field, and can be told to hurry or come home', () => {
    const w0 = structuredClone(createWorld());
    const P = w0.playerHouseId;
    const spy = seatHolder(w0, P, 'spymaster')!;
    const target = Object.values(w0.characters).find((c) => c.alive && c.houseId !== P && c.seat)!;
    let { world: w, id } = launchMission(w0, { kind: 'investigate', houseId: P, leaderId: spy.id, targetId: target.id, approach: 'careful' });
    for (let i = 0; i < 40 && w.missions[id]!.stage !== 'task'; i++) w = advanceTurns(w, 1);
    w = advanceTurns(w, 1);
    expect(openBriefings(w).some((b) => b.kind === 'checkin' && b.ref === `${id}:arrived`)).toBe(true);
    const ends = w.missions[id]!.stageEnds;
    w = setMissionApproach(w, id, 'quick');
    expect(w.missions[id]!.approach).toBe('quick');
    expect(w.missions[id]!.stageEnds.cycle !== ends.cycle || w.missions[id]!.stageEnds.year !== ends.year).toBe(true);
    w = recallMission(w, id);
    expect(w.missions[id]!.stage).toBe('return');
  });
});
