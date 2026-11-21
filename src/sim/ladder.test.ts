import { createWorld } from './world';
import { advanceTurn } from './tick';
import { deserialize, serialize } from './save';
import { econ } from './economy';
import { answerBlooding, lastingWound, proofOf, stageOf, trialAge } from './ladder';
import { cannotKnight, knight } from './ambitions';
import { ageOf } from './characters';
import { Rng } from './rng';
import { tally } from './careers';
import type { World } from './types';

const step = (w: World) => { const x = advanceTurn(w); x.events.pending = []; x.ambitions.audiences = []; return x; };

describe('the ladder', () => {
  it('the young of the house are pupils, then sit the trials; some pass, some fail and it is remembered', () => {
    let w = createWorld();
    for (let i = 0; i < 40; i++) w = step(w);
    const P = w.playerHouseId;
    const rungs = Object.entries(w.ladder.of);
    expect(rungs.length).toBeGreaterThan(0);
    for (const [id, r] of rungs) {
      const c = w.characters[id]!;
      if (r.stage === 'pupil') expect(ageOf(c, w.date)).toBeLessThan(trialAge(c) + 2);
      expect(c.houseId).toBe(P);
    }
    // Force a pupil to trial age and run a year of trials.
    const pupil = Object.keys(w.ladder.of).find((id) => w.ladder.of[id]!.stage === 'pupil');
    if (pupil) {
      const c = w.characters[pupil]!;
      c.birth = { ...c.birth, year: w.date.year - Math.ceil(trialAge(c)) - 1 };
      for (let i = 0; i < 420 && w.ladder.of[pupil]!.stage === 'pupil' && w.ladder.of[pupil]!.failed === 0; i++) w = step(w);
      const r = w.ladder.of[pupil]!;
      expect(r.stage !== 'pupil' || r.failed > 0).toBe(true);
      expect(r.history.length).toBeGreaterThan(0);
    }
    expect(deserialize(serialize(w)).ladder).toEqual(w.ladder);
  });

  it('an aspirant proves themselves, is put forward, blooded before the house, and only then can be knighted', () => {
    let w = structuredClone(createWorld());
    const P = w.playerHouseId;
    w = step(w);
    for (let i = 0; i < 40 && !Object.values(w.ladder.of).some((r) => r.stage === 'aspirant'); i++) w = step(w);
    const id = Object.keys(w.ladder.of).find((x) => w.ladder.of[x]!.stage === 'aspirant')!;
    expect(id).toBeDefined();
    expect(cannotKnight(w, id)).toBe('Not yet blooded');
    // Deeds.
    tally(w, id, 'boutsWon', 6); tally(w, id, 'triumphs', 2);
    expect(proofOf(w, id)).toBeGreaterThan(14);
    for (let i = 0; i < 120 && !w.ladder.proposals.some((b) => b.aspirantId === id); i++) w = step(w);
    const b = w.ladder.proposals.find((x) => x.aspirantId === id)!;
    expect(b).toBeDefined();
    econ(w, P).stock.othes += 1000;
    w = answerBlooding(w, b.id, 'gift');
    expect(stageOf(w, id)).toBe('blooded');
    expect(w.feed.some((e) => e.text.includes('is blooded at'))).toBe(true);
    expect(cannotKnight(w, id)).toBeNull();
    w = knight(w, id);
    expect(stageOf(w, id)).toBe('knight');
  });

  it('some wounds last', () => {
    const w = structuredClone(createWorld());
    const c = Object.values(w.characters).find((x) => x.alive && x.houseId === w.playerHouseId && x.role === 'Knight')!;
    const rng = Rng.fromSeed('wounds');
    let what: string | null = null;
    for (let i = 0; i < 200 && !what; i++) what = lastingWound(w, rng, c.id, 'in a test');
    expect(what).toBeTruthy();
  });
});
