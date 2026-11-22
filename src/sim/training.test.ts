import { createWorld } from './world';
import { advanceTurn } from './tick';
import { deserialize, serialize } from './save';
import { econ } from './economy';
import { buildModule, modulesOf, setModuleOverseer } from './holdings';
import { academyAge, cannotEnrol, cannotTutor, PERSONAL_LIMIT, askForWard, enrolAcademy, kindFor, paceOf, sendWard, setDrill, startTutoring, youths } from './training';
import type { World } from './types';

const world = createWorld();
const P = world.playerHouseId;
const ours = Object.values(world.characters).filter((c) => c.alive && c.houseId === P && c.tier === 'full');

function run(w: World, turns: number): World {
  let x = w;
  for (let i = 0; i < turns; i++) { x = advanceTurn(x); x.events.pending = []; }
  return x;
}

describe('training', () => {
  it('seeds the ward already fostered at Serath', () => {
    expect(Object.values(world.training.wards).some((s) => s.host === 'serath' && s.from === P)).toBe(true);
  });

  it('a tutor raises a student over an Orbit, and the young learn fastest', () => {
    const student = youths(world, P).find((c) => !c.flags.some((f) => f.id === 'ward')) ?? ours.find((c) => !c.seat)!;
    const tutor = ours.filter((c) => c.id !== student.id && c.seat).sort((a, b) => b.stats.duelling - a.stats.duelling)[0]!;
    let w = startTutoring(world, student.id, tutor.id, 'arms');
    const before = ['duelling', 'marksmanship', 'agility', 'endurance', 'reflexes'].reduce((n, k) => n + world.characters[student.id]!.stats[k as 'agility'], 0);
    w = run(w, 45);
    const after = ['duelling', 'marksmanship', 'agility', 'endurance', 'reflexes'].reduce((n, k) => n + w.characters[student.id]!.stats[k as 'agility'], 0);
    expect(after).toBeGreaterThan(before);
    const old = ours.find((c) => c.seat === 'elder')!;
    expect(paceOf(world, { studentId: old.id, program: 'tutor', subject: 'arms', teacherId: tutor.id, houseId: P })).toBeLessThan(paceOf(world, { studentId: student.id, program: 'tutor', subject: 'arms', teacherId: tutor.id, houseId: P }));
  });

  it('drills the knights and runs an academy', () => {
    const w0 = structuredClone(world);
    econ(w0, P).stock.othes = 50000;
    let w = setDrill(w0, 'arms');
    expect(Object.values(w.training.enrolments).filter((e) => e.program === 'drill').length).toBeGreaterThan(0);
    const sector = Object.values(w.planets).find((p) => p.houseId === P)!.sectors[1]!;
    w = buildModule(w, 'academy', sector.id);
    w = run(w, 9);
    const a = modulesOf(w, P, 'academy')[0]!;
    const student = ours.find((c) => !c.seat && academyAge(w, c) && !c.flags.some((f) => f.id === 'ward'))!;
    const head = ours.filter((c) => c.seat).sort((x, y) => y.stats.intellect - x.stats.intellect)[0]!;
    w = setModuleOverseer(w, a.id, head.id);
    w = enrolAcademy(w, student.id, a.id, 'learning');
    w = run(w, 85);
    expect(w.holdings.modules[a.id]!.reputation).toBeGreaterThan(0);
  });

  it('sending a ward up is an honour; wards change hands and come home', () => {
    expect(kindFor(world, P, 'torvann')).toBe('honour');
    expect(kindFor(world, 'torvann', P)).toBe('humbling');
    const w0 = structuredClone(world);
    w0.relations.serath![P] = 30;
    const w = askForWard(w0, 'serath');
    const stays = Object.values(w.training.wards).filter((s) => s.host === P);
    if (stays.length) {
      const later = run(w, 170);
      expect(Object.values(later.training.wards).some((s) => s.id === stays[0]!.id)).toBe(false);
    }
    const youth = youths(world, P)[0];
    if (youth) {
      const w2 = structuredClone(world);
      w2.relations.shaaliin![P] = 20;
      const sent = sendWard(w2, youth.id, 'shaaliin');
      expect(sent.characters[youth.id]!.flags.some((f) => f.id === 'ward')).toBe(true);
    }
  });

  it('a teacher takes at most two personal charges; adults get no tutor', () => {
    const kids = youths(world, P).filter((c) => !c.flags.some((f) => f.id === 'ward'));
    const tutor = ours.find((c) => c.seat === 'elder')!;
    const adult = ours.find((c) => c.seat && c.id !== tutor.id)!;
    expect(cannotTutor(world, adult.id, tutor.id)).toMatch(/younglings/);
    let w = structuredClone(world);
    w.economy.houses[P]!.stock.othes = 10000;
    for (const k of kids.slice(0, PERSONAL_LIMIT)) w = startTutoring(w, k.id, tutor.id, 'learning');
    if (kids.length > PERSONAL_LIMIT) expect(cannotTutor(w, kids[PERSONAL_LIMIT]!.id, tutor.id)).toMatch(/already has/);
  });

  it('the academy takes young adults but not their elders', () => {
    const elder = ours.find((c) => c.seat === 'elder')!;
    const w0 = structuredClone(world);
    w0.economy.houses[P]!.stock.othes = 50000;
    const sector = Object.values(w0.planets).find((p) => p.houseId === P)!.sectors[1]!;
    const w = run(buildModule(w0, 'academy', sector.id), 9);
    const a = modulesOf(w, P, 'academy')[0]!;
    expect(cannotEnrol(w, elder.id, a.id)).toMatch(/young adults/);
  });

  it('survives a save', () => {
    const w = run(world, 200);
    expect(deserialize(serialize(w)).training).toEqual(w.training);
  });
});
