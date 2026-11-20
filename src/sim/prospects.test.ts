import { createWorld } from './world';
import { advanceTurn } from './tick';
import { deserialize, serialize } from './save';
import { econ } from './economy';
import { buildModule, modulesOf, setModuleOverseer } from './holdings';
import { noticeYouth } from './prospects';
import { recruit } from './discovery';
import { Rng } from './rng';
import { answerIntake, answerPupilOffer, enrolmentOf, startTutoring, youths } from './training';
import { launchMission } from './missions';
import { isAway } from './court';
import { ensureAmbitions, WILL_TO_ACT, willOf, willRate } from './ambitions';
import type { World } from './types';

const world = createWorld();
const P = world.playerHouseId;
const home = Object.values(world.planets).find((p) => p.houseId === P)!;

function run(w: World, turns: number): World {
  let x = w;
  for (let i = 0; i < turns; i++) { x = advanceTurn(x); x.events.pending = []; }
  return x;
}

describe('prospects are noticed, not bought', () => {
  it('an incident on our world brings a youngster to our notice, with someone asking for them', () => {
    const w = structuredClone(world);
    const rng = new Rng(w.rng);
    let found = null;
    for (let i = 0; i < 60 && !found; i++) found = noticeYouth(w, rng, home.id, home.sectors[0]!.id, 'raid');
    expect(found).not.toBeNull();
    const lead = w.leads.find((l) => l.targetId === found!.id)!;
    expect(lead.proposal).toBeDefined();
    expect(lead.noticedBy).toBeTruthy();
    expect(lead.text).toMatch(/raid/);
    econ(w, P).stock.othes = 50000;
    const w2 = recruit(w, lead.id);
    const c = w2.characters[found!.id]!;
    expect(c.houseId).toBe(P);
    if (lead.proposal!.kind === 'tutor') expect(enrolmentOf(w2, c.id)?.teacherId).toBe(lead.proposal!.sponsorId);
  });

  it('the academy brings forward pupils each Orbit; the Highroy educates, trains or sends them home', () => {
    let w = structuredClone(world);
    econ(w, P).stock.othes = 80000;
    w = buildModule(w, 'academy', home.sectors[1]!.id);
    w = run(w, 9);
    const a = modulesOf(w, P, 'academy')[0]!;
    const head = Object.values(w.characters).filter((c) => c.alive && c.houseId === P && c.seat && c.seat !== 'highroy').sort((x, y) => y.stats.intellect - x.stats.intellect)[0]!;
    w = setModuleOverseer(w, a.id, head.id);
    for (let i = 0; i < 200 && !(w.training.intake ?? []).length; i++) w = run(w, 1);
    const intake = w.training.intake!;
    expect(intake.length).toBeGreaterThan(0);
    const first = intake[0]!;
    w = answerIntake(w, first.id, 'train');
    expect(enrolmentOf(w, first.studentId)?.program).toBe('academy');
    expect(enrolmentOf(w, first.studentId)?.subject).toBe('arms');
    expect(w.characters[first.studentId]!.houseId).toBe(P);
    expect(deserialize(serialize(w)).training.intake).toEqual(w.training.intake);
  });
});

describe('pupils go along on missions', () => {
  it("a teacher's own pupil goes with them, and is away until they are home", () => {
    const w0 = structuredClone(world);
    econ(w0, P).stock.othes = 50000;
    const student = youths(w0, P).find((c) => !c.flags.some((f) => f.id === 'ward'))!;
    const teacher = Object.values(w0.characters).find((c) => c.alive && c.houseId === P && c.seat === 'spymaster')!;
    let w = startTutoring(w0, student.id, teacher.id, 'intrigue');
    const target = Object.values(w.characters).find((c) => c.alive && c.houseId === 'serath' && c.tier === 'full')!;
    const r = launchMission(w, { kind: 'investigate', houseId: P, leaderId: teacher.id, targetId: target.id, approach: 'careful', force: [teacher.id] });
    w = r.world;
    expect(w.missions[r.id]!.pupils).toContain(student.id);
    expect(isAway(w, student.id)).toBe(true);
    for (let i = 0; i < 80 && w.missions[r.id]!.stage !== 'done'; i++) w = run(w, 1);
    expect(w.missions[r.id]!.stage).toBe('done');
    expect(isAway(w, student.id)).toBe(false);
  });

  it('the academy head may ask for a pupil to go; saying yes puts them in the party', () => {
    let w = structuredClone(world);
    econ(w, P).stock.othes = 80000;
    w = buildModule(w, 'academy', home.sectors[1]!.id);
    w = run(w, 9);
    const a = modulesOf(w, P, 'academy')[0]!;
    const seated = Object.values(w.characters).filter((c) => c.alive && c.houseId === P && c.seat && c.seat !== 'highroy');
    const head = seated.find((c) => c.seat === 'elder') ?? seated[0]!;
    w = setModuleOverseer(w, a.id, head.id);
    for (let i = 0; i < 200 && !(w.training.intake ?? []).length; i++) w = run(w, 1);
    w = answerIntake(w, w.training.intake![0]!.id, 'educate');
    const leader = seated.find((c) => c.id !== head.id && c.seat === 'spymaster')!;
    const target = Object.values(w.characters).find((c) => c.alive && c.houseId === 'serath' && c.tier === 'full')!;
    let offered = false;
    for (let t = 0; t < 12 && !offered; t++) {
      const r = launchMission(w, { kind: 'investigate', houseId: P, leaderId: leader.id, targetId: target.id, approach: 'careful', force: [leader.id] });
      const o = r.world.training.pupilOffers!.find((x) => x.missionId === r.id);
      if (o) {
        const w2 = answerPupilOffer(r.world, o.id, true);
        expect(w2.missions[r.id]!.pupils).toContain(o.pupilId);
        offered = true;
      }
      w = run(w, 1);
    }
    expect(offered).toBe(true);
  });
});

describe('will', () => {
  it('fills with time and ambition; nobody comes to the Highroy before their will is full', () => {
    let w = structuredClone(world);
    ensureAmbitions(w);
    const someone = Object.values(w.characters).find((c) => c.alive && c.houseId === P && c.seat && c.seat !== 'highroy')!;
    const keen = { ...someone, hidden: { ...someone.hidden, ambition: 20 } };
    const idle = { ...someone, hidden: { ...someone.hidden, ambition: 1 } };
    expect(willRate(keen)).toBeGreaterThan(willRate(idle));
    w = run(w, 60);
    for (const au of w.ambitions.audiences) expect(willOf(w, au.characterId)).toBeLessThan(WILL_TO_ACT);
    expect(Object.keys(w.ambitions.will ?? {}).length).toBeGreaterThan(0);
  });
});
