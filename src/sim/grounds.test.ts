import { createWorld } from './world';
import { advanceTurn } from './tick';
import { deserialize, serialize } from './save';
import { econ } from './economy';
import { answerChallenge, callTourney, cannotCallTourney, fighters, isMilitary, TOURNEY_COST } from './grounds';
import { cannotEnter, enterCircuit, knownEvents } from './circuit';
import { setBond, kindred, opinion, shiftOpinion } from './relationships';
import { availability, launchMission, readyForCommand, FIRST_COMMAND_AGE } from './missions';
import { titlesOf } from './careers';
import { ageOf } from './characters';
import { SPECIES } from '../data/species';
import type { World } from './types';

const step = (w: World) => { const x = advanceTurn(w); x.events.pending = []; x.ambitions.audiences = []; return x; };

describe('the house tourney', () => {
  it('runs a bracket of eight, crowns a champion and is once a year', () => {
    let w = structuredClone(createWorld());
    const P = w.playerHouseId;
    econ(w, P).stock.othes = 10000;
    expect(cannotCallTourney(w)).toBeNull();
    w = callTourney(w);
    const t = w.grounds.tourneys[0]!;
    expect(t.rounds.map((r) => r.length)).toEqual([4, 2, 1]);
    expect(titlesOf(w, t.champion).some((x) => x.title.startsWith('Tourney champion'))).toBe(true);
    expect(econ(w, P).stock.othes).toBe(10000 - TOURNEY_COST);
    expect(cannotCallTourney(w)).toBe('One tourney a year');
    expect(deserialize(serialize(w)).grounds).toEqual(w.grounds);
  });
});

describe('challenges and pit nights', () => {
  it('rivals at court throw down challenges; allowed, they fight', () => {
    let w = structuredClone(createWorld());
    const P = w.playerHouseId;
    const [a, b] = fighters(w, P).filter((c) => isMilitary(w, c));
    const courtier = fighters(w, P).find((c) => !isMilitary(w, c))!;
    setBond(w, courtier.id, a!.id, 'feud', 'feud', 'test');
    setBond(w, a!.id, b!.id, 'feud', 'feud', 'test');
    a!.stats.valor = 20; a!.hidden.ambition = 20;
    for (let i = 0; i < 400 && !w.grounds.challenges.length; i++) w = step(w);
    expect(w.grounds.challenges.length).toBe(1);
    const c = w.grounds.challenges[0]!;
    w = answerChallenge(w, c.id, true);
    expect(w.grounds.challenges.length).toBe(0);
    expect(w.grounds.duels.length).toBe(1);
    expect([c.challenger, c.challenged]).toContain(w.grounds.duels[0]!.bout.winner);
    expect([c.challenger, c.challenged]).not.toContain(courtier.id);
  });

  it('the circuit runs on its own: cards, tourneys, our people going, and word coming home', () => {
    let w = structuredClone(createWorld());
    const P = w.playerHouseId;
    let sent = false;
    for (let i = 0; i < 900; i++) {
      w = step(w);
      if (!sent) {
        const e = w.grounds.circuit.find((x) => !x.done && x.kind === 'public');
        if (e) {
          const ids = fighters(w, P).slice(0, 2).map((c) => c.id);
          if (!cannotEnter(w, e.id, ids)) { w = enterCircuit(w, e.id, ids); sent = true; }
        }
      }
    }
    const done = w.grounds.circuit.filter((e) => e.done);
    expect(done.some((e) => e.kind === 'underground')).toBe(true);
    expect(done.some((e) => e.kind === 'public')).toBe(true);
    expect(sent).toBe(true);
    // We hear about some of it, not all of it.
    const heard = knownEvents(w).filter((e) => e.done);
    expect(heard.length).toBeGreaterThan(0);
    expect(heard.length).toBeLessThan(done.length);
    // Someone of ours went somewhere on their own.
    expect(w.grounds.circuit.some((e) => e.entrants.some((x) => x.houseId === P && !x.sent))).toBe(true);
    expect(deserialize(serialize(w)).grounds).toEqual(w.grounds);
  });
});

describe('kindred spirits and first commands', () => {
  it('two who like each other and share a calling are kindred, and one comes along unasked', () => {
    const w = structuredClone(createWorld());
    const P = w.playerHouseId;
    const pool = Object.values(w.characters).filter((c) => c.alive && c.houseId === P && c.tier === 'full' && c.seat !== 'highroy' && availability(w, P, c).ok);
    const [a, b] = pool;
    a!.traits.push({ id: 'tactician' }); b!.traits.push({ id: 'tactician' });
    shiftOpinion(w, a!.id, b!.id, 80, 'test'); shiftOpinion(w, b!.id, a!.id, 80, 'test');
    expect(opinion(w, a!.id, b!.id)).toBeGreaterThanOrEqual(30);
    expect(kindred(w, a!.id, b!.id)).toMatch(/both/);
    const target = Object.values(w.characters).find((c) => c.alive && c.houseId !== P && c.tier === 'full')!;
    let joined = false;
    for (let i = 0; i < 12 && !joined; i++) {
      const x = structuredClone(w);
      x.nextId += i * 7;
      const r = launchMission(x, { kind: 'investigate', houseId: P, leaderId: a!.id, targetId: target.id, approach: 'careful', force: [a!.id] });
      joined = r.world.missions[r.id]!.companions!.includes(b!.id);
    }
    expect(joined).toBe(true);
  });

  it('a near-adult can lead only with someone seasoned alongside', () => {
    const w = structuredClone(createWorld());
    const P = w.playerHouseId;
    const kid = Object.values(w.characters).find((c) => c.alive && c.houseId === P && c.tier === 'full' && ageOf(c, w.date) < SPECIES[c.species].adulthood)!;
    kid.birth = { year: w.date.year - Math.ceil(SPECIES[kid.species].adulthood * 0.9), cycle: 0 } as never;
    expect(ageOf(kid, w.date) / SPECIES[kid.species].adulthood).toBeGreaterThanOrEqual(FIRST_COMMAND_AGE);
    const target = Object.values(w.characters).find((c) => c.alive && c.houseId !== P && c.tier === 'full')!;
    expect(() => launchMission(w, { kind: 'investigate', houseId: P, leaderId: kid.id, targetId: target.id, approach: 'careful', force: [kid.id] })).toThrow(/seasoned/);
    const vet = Object.values(w.characters).find((c) => c.alive && c.houseId === P && c.tier === 'full' && c.seat && c.seat !== 'highroy' && availability(w, P, c).ok)!;
    const r = launchMission(w, { kind: 'investigate', houseId: P, leaderId: kid.id, companions: [vet.id], targetId: target.id, approach: 'careful', force: [kid.id, vet.id] });
    expect(r.world.missions[r.id]!.log.some((l) => /first command/.test(l.text))).toBe(true);
    expect(Array.isArray(readyForCommand(r.world, P))).toBe(true);
  });
});
