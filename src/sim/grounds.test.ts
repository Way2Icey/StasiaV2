import { createWorld } from './world';
import { advanceTurn } from './tick';
import { deserialize, serialize } from './save';
import { econ } from './economy';
import { answerChallenge, answerPitNight, callTourney, cannotCallTourney, fighters, TOURNEY_COST } from './grounds';
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
    const [a, b] = fighters(w, P);
    setBond(w, a!.id, b!.id, 'feud', 'feud', 'test');
    a!.stats.valor = 20; a!.hidden.ambition = 20;
    for (let i = 0; i < 400 && !w.grounds.challenges.length; i++) w = step(w);
    expect(w.grounds.challenges.length).toBe(1);
    const c = w.grounds.challenges[0]!;
    w = answerChallenge(w, c.id, true);
    expect(w.grounds.challenges.length).toBe(0);
    expect(w.grounds.duels.length).toBe(1);
    expect([c.challenger, c.challenged]).toContain(w.grounds.duels[0]!.bout.winner);
  });

  it('another house invites us to a pit night; we send three', () => {
    let w = structuredClone(createWorld());
    const P = w.playerHouseId;
    for (let i = 0; i < 600 && !w.grounds.invites.length; i++) w = step(w);
    expect(w.grounds.invites.length).toBe(1);
    const ours = fighters(w, P).slice(0, 3).map((c) => c.id);
    w = answerPitNight(w, w.grounds.invites[0]!.id, ours);
    expect(w.grounds.pitNights[0]!.bouts.length).toBe(3);
    expect(w.grounds.invites.length).toBe(0);
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
