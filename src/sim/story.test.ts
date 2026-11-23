import { createWorld } from './world';
import { advanceTurn, stepClock } from './tick';
import { answerEvent, fireStage, checkChance, makeCtx, eventDef } from './events';
import { startStruggle, joinStruggle, cannotJoin } from './story';
import { openThreads } from './storystate';
import { Rng } from './rng';
import type { World } from './types';

const ours = (w: World) => Object.values(w.characters).filter((c) => c.alive && c.houseId === w.playerHouseId && c.tier === 'full' && c.seat !== 'highroy');
const quiet = (w: World) => { w.events.pending = []; w.ambitions.audiences = []; return w; };

describe('arcs', () => {
  it('a choice carries the story on: the next stage comes later, with the same people', () => {
    let w = structuredClone(createWorld());
    const p = ours(w).find((c) => c.resonance) ?? ours(w)[0]!;
    p.resonance = { degrees: 80, band: 'bluewake', type: 'gravitic' };
    const rng = new Rng(w.rng);
    const ev = fireStage(w, rng, 'hum1', { personId: p.id })!;
    expect(ev).toBeTruthy();
    // hum1 is a first stage: answering it starts an arc and schedules the surge.
    w = answerEvent(w, ev.id, 0);
    const arc = w.story!.arcs.find((a) => a.title === 'The hum')!;
    const who = arc.cast.personId;
    expect(arc.open).toBe(true);
    expect(arc.next?.defId).toBe('hum2');
    for (let i = 0; i < 40 && !w.events.pending.some((x) => x.arcId === arc.id); i++) { w = advanceTurn(w); w.events.pending = w.events.pending.filter((x) => x.arcId === arc.id); w.ambitions.audiences = []; }
    const stage = w.events.pending.find((x) => x.arcId === arc.id)!;
    expect(stage.defId).toBe('hum2');
    expect(stage.personId).toBe(who);
    expect(stage.urgent).toBe(true);
    w = answerEvent(w, stage.id, 2); // sedate: ends it
    const done = w.story!.arcs.find((a) => a.id === arc.id)!;
    expect(done.open).toBe(false);
    expect(done.stages.map((s) => s.title)).toEqual(['The hum', 'The surge']);
  });

  it('a duel lost leaves a grudge, and the rematch is cast the other way round', () => {
    let w = structuredClone(createWorld());
    const [a, b] = ours(w);
    const rng = Rng.fromSeed('7');
    const ev = fireStage(w, rng, 'blades', { personId: a!.id, secondId: b!.id })!;
    w = answerEvent(w, ev.id, 1);
    const grudges = openThreads(w, undefined, 'grudge');
    expect(grudges.length).toBe(1);
    const arc = w.story!.arcs.find((x) => x.stages[0]?.title === 'Blades at dawn');
    if (arc?.next) expect(arc.cast.secondId).toBe(grudges[0]!.personId);
  });

  it('opposed checks set our people against a named person', () => {
    const w = structuredClone(createWorld());
    const [a, b] = ours(w);
    a!.stats.duelling = 18; a!.stats.reflexes = 18; b!.stats.duelling = 6; b!.stats.reflexes = 6;
    const def = eventDef('blades2')!;
    const ctx = makeCtx(w, Rng.fromSeed('1'), { personId: b!.id, secondId: a!.id });
    expect(checkChance(ctx, def.options[0]!.check!)).toBeGreaterThan(0.9);
    const ctx2 = makeCtx(w, Rng.fromSeed('1'), { personId: a!.id, secondId: b!.id });
    expect(checkChance(ctx2, def.options[0]!.check!)).toBeLessThan(0.1);
  });
});

describe('struggles', () => {
  it('both sides push each Phase; people set to it turn it our way, and the end asks for a decision', () => {
    let w = structuredClone(createWorld());
    const s = startStruggle(w, 'ring', { strength: 9, theirName: 'the ring' });
    const best = ours(w).filter((c) => !cannotJoin(w, s, c.id)).sort((x, y) => (y.stats.law + y.stats.perception) - (x.stats.law + x.stats.perception)).slice(0, 3);
    for (const c of best) w = joinStruggle(w, s.id, c.id);
    let ended = false;
    for (let i = 0; i < 600 && !ended; i++) {
      w = advanceTurn(w);
      const turn = w.events.pending.find((x) => x.struggleId === s.id);
      w.events.pending = w.events.pending.filter((x) => x.struggleId === s.id);
      w.ambitions.audiences = [];
      if (turn) w = answerEvent(w, turn.id, 0);
      ended = !!w.story!.struggles.find((x) => x.id === s.id)!.ended;
    }
    const done = w.story!.struggles.find((x) => x.id === s.id)!;
    expect(done.ended?.won).toBe(true);
    expect(done.fired.length).toBeGreaterThan(0);
  });

  it('left alone, it slips away', () => {
    let w = structuredClone(createWorld());
    const s = startStruggle(w, 'plot', { strength: 14, theirName: 'someone' });
    for (let i = 0; i < 80; i++) { w = quiet(advanceTurn(w)); }
    expect(w.story!.struggles.find((x) => x.id === s.id)!.meter).toBeLessThan(-30);
  });
});

describe('the clock', () => {
  it('runs until a decision arrives, then freezes with it', () => {
    let w = structuredClone(createWorld());
    let froze: string[] | undefined;
    for (let i = 0; i < 2000 && !froze; i++) {
      const r = stepClock(w);
      w = r.world;
      w.ambitions.audiences = [];
      if (r.freeze?.events.length) froze = r.freeze.events;
    }
    expect(froze?.length).toBeGreaterThan(0);
    expect(w.events.pending.some((p) => froze!.includes(p.id))).toBe(true);
  });

  it('the storyteller keeps a pace: a few dozen decisions a year, not hundreds', () => {
    let w = structuredClone(createWorld());
    let n = 0;
    for (let i = 0; i < 400; i++) { w = advanceTurn(w); n += w.events.pending.length; w.events.pending = []; w.ambitions.audiences = []; }
    expect(n).toBeGreaterThan(12);
    expect(n).toBeLessThan(90);
    expect(['calm', 'rising', 'crisis']).toContain(w.story!.act);
  });
});
