import { createWorld } from './world';
import { advanceTurn, advanceUntil } from './tick';
import { deserialize, serialize } from './save';
import { answerEvent, checkChance, eventDef, makeCtx, settle } from './events';
import { EVENTS } from './eventDefs';
import { launchMission, cannotLead } from './missions';
import { seatHolder } from './query';
import { Rng } from './rng';
import type { World } from './types';

const world = createWorld();
const P = world.playerHouseId;

function sendOut(w: World): World {
  const leader = seatHolder(w, P, 'spymaster')!;
  const target = Object.values(w.characters).find((c) => c.houseId === 'serath' && c.tier === 'full')!;
  expect(cannotLead(w, P, leader)).toBeNull();
  return launchMission(w, { kind: 'investigate', houseId: P, leaderId: leader.id, targetId: target.id, approach: 'careful' }).world;
}

describe('events', () => {
  it('has unique ids and a valid fallback for every event', () => {
    const ids = new Set(EVENTS.map((e) => e.id));
    expect(ids.size).toBe(EVENTS.length);
    for (const e of EVENTS) {
      expect(e.options[e.fallback]).toBeDefined();
      expect(e.options[e.fallback]!.available).toBeUndefined(); // the council can always take it
    }
  });

  it('fires home events and stops the clock for them', () => {
    let w = world;
    let stopped = false;
    for (let i = 0; i < 20 && !stopped; i++) {
      const r = advanceUntil(w, 400, true);
      w = r.world;
      if (r.stop?.reason.startsWith('A decision')) stopped = true;
    }
    expect(stopped).toBe(true);
    expect(w.events.pending.length).toBeGreaterThan(0);
  });

  it('every option of every event resolves without error', () => {
    let w = sendOut(world);
    for (let i = 0; i < 3; i++) w = advanceTurn(w);
    const m = Object.values(w.missions).find((x) => x.houseId === P)!;
    for (const def of EVENTS) {
      for (let o = 0; o < def.options.length; o++) {
        const copy = structuredClone(w);
        const rng = new Rng(copy.rng);
        const seed = def.trigger === 'home' ? {} : { missionId: m.id };
        const ctx = makeCtx(copy, rng, seed);
        ctx.set = { ...seed };
        if (!def.setup(ctx)) continue;
        const p = { ...ctx.set, id: 'x', defId: def.id, date: copy.date, expires: copy.date, text: '' };
        const c2 = makeCtx(copy, rng, p);
        expect(typeof def.text(c2)).toBe('string');
        const opt = def.options[o]!;
        if (opt.check) {
          const pr = checkChance(c2, opt.check);
          expect(pr).toBeGreaterThanOrEqual(0);
          expect(pr).toBeLessThanOrEqual(1);
        }
        copy.events.pending.push(p);
        const r = settle(copy, rng, 'x', o);
        expect(r).not.toBeNull();
        expect(copy.events.pending.length).toBe(0);
      }
    }
  });

  it('answering is pure and logged; lapsed ones fall to the council', () => {
    let w = world;
    for (let i = 0; i < 30 && w.events.pending.length === 0; i++) w = advanceUntil(w, 400, true).world;
    const p = w.events.pending[0]!;
    const before = serialize(w);
    const after = answerEvent(w, p.id, eventDef(p.defId)!.fallback);
    expect(serialize(w)).toBe(before);
    expect(after.events.pending.find((x) => x.id === p.id)).toBeUndefined();
    expect(after.events.log[0]!.byCouncil).toBe(false);
    // Leave the rest: they lapse.
    const later = advanceUntil(after, 40, false).world;
    for (const q of after.events.pending) expect(later.events.pending.find((x) => x.id === q.id)).toBeUndefined();
  });

  it('runs a long reign with events and missions without breaking', () => {
    let w = sendOut(world);
    for (let i = 0; i < 6; i++) {
      w = advanceUntil(w, 100, false).world;
      for (const p of [...w.events.pending]) w = answerEvent(w, p.id, 0);
    }
    expect(deserialize(serialize(w)).events.log.length).toBeGreaterThan(0);
  });

  it('upgrades a version 9 save', () => {
    const old = JSON.parse(serialize(world));
    old.version = 9;
    delete old.events;
    const w = deserialize(JSON.stringify(old));
    expect(w.version).toBe(10);
    expect(w.events.pending).toEqual([]);
  });
});
