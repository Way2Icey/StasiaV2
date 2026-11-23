import { describe, expect, it } from 'vitest';
import { createWorld } from './world';
import { advanceUntil } from './tick';
import { answerEvent, eventDef, settle } from './events';
import { Rng } from './rng';
import { deserialize, serialize } from './save';
import {
  activeWars, applyTerms, assignFormation, cannotDeclare, declareWar, endWar, escalate, formationsOf, grievances, joinWar, makePlanet, offerPeace,
  orderCeasefire, startWar, warsOf, type War,
} from './war';
import { fightItOut } from './battle';
import { liveHouses } from './archon';
import type { World } from './types';

/** Run the clock; the council answers everything and our commanders fight our battles. */
function run(w: World, turns: number, answer?: (w: World) => World): World {
  let left = turns;
  while (left > 0) {
    const r = advanceUntil(w, Math.min(20, left), false);
    w = r.world;
    left -= r.ran;
    for (const b of (w.battles?.list ?? []).filter((x) => x.status !== 'over')) w = fightItOut(w, b.id);
    if (answer) w = answer(w);
    const rng = new Rng(w.rng);
    for (const p of [...w.events.pending]) settle(w, rng, p.id, null);
    w.rng = rng.state;
  }
  return w;
}

describe('war', () => {
  it('every house has named forces, ours led by our own people', () => {
    const w = createWorld();
    for (const h of liveHouses(w)) expect(formationsOf(w, h.id).length).toBeGreaterThanOrEqual(2);
    const ours = formationsOf(w, w.playerHouseId);
    expect(ours.map((f) => f.kind).sort()).toEqual(['company', 'fleet', 'legion']);
    for (const f of ours) expect(w.characters[f.commanderId!]?.houseId).toBe(w.playerHouseId);
    const theirs = formationsOf(w, 'lumen')[0]!;
    expect(theirs.commanderName).toBeTruthy();
  });

  it('a war we declare is fought on fronts, with battles of ours, and ends in terms', () => {
    let w = createWorld('war-a');
    expect(cannotDeclare(w, 'myr', 'war')).toBeNull();
    w = declareWar(w, 'myr', 'tribute', 'war');
    const war = activeWars(w)[0]!;
    expect(war.fronts.map((f) => f.kind).sort()).toEqual(['border', 'orbit']);
    expect(formationsOf(w, w.playerHouseId).every((f) => f.front)).toBe(true);
    let battles = 0;
    for (let i = 0; i < 60 && w.war!.wars.find((x) => x.id === war.id)!.status === 'active'; i++) {
      w = run(w, 20);
      battles = (w.battles?.list ?? []).filter((b) => b.kind === 'war').length;
    }
    const done = w.war!.wars.find((x) => x.id === war.id)!;
    expect(done.status).toBe('ended');
    expect(battles).toBeGreaterThan(0);
    expect(done.log.length).toBeGreaterThan(3);
    if (done.result!.winner !== 'none') expect(done.result!.terms).toBeTruthy();
  }, 60000);

  it('clashes can be stepped up to war, and peace can be offered', () => {
    let w = createWorld('war-b');
    w = declareWar(w, 'koren', 'humble', 'clashes');
    const id = activeWars(w)[0]!.id;
    w = escalate(w, id);
    expect(w.war!.wars.find((x) => x.id === id)!.rung).toBe('war');
    w = offerPeace(w, id, 'yield');
    expect(w.war!.wars.find((x) => x.id === id)!.status).toBe('ended');
  });

  it('every term can be applied, and taking a register world makes it ours', () => {
    for (const g of ['tribute', 'reparations', 'humble', 'relic', 'hostage', 'world', 'vassal'] as const) {
      const w = structuredClone(createWorld('terms'));
      const rng = new Rng(w.rng);
      const war = startWar(w, rng, { attacker: w.playerHouseId, defender: 'murnath', goal: g, rung: 'war' });
      war.status = 'ended';
      war.result = { winner: 'attackers', text: 'test', date: w.date };
      const planets = Object.keys(w.planets).length;
      applyTerms(w, rng, war, g);
      if (g === 'world') expect(Object.keys(w.planets).length).toBe(planets + 1);
      if (g === 'vassal') expect(w.war!.liege.murnath).toBe(w.playerHouseId);
      if (g === 'tribute') expect(w.war!.tributes.length).toBe(1);
    }
  });

  it('the terms event lets us choose, within what the victory allows', () => {
    let w = structuredClone(createWorld('choose'));
    const rng = new Rng(w.rng);
    const war = startWar(w, rng, { attacker: w.playerHouseId, defender: 'vahler', goal: 'tribute', rung: 'war' });
    war.score = 100;
    endWar(w, rng, war, 'attackers', 'Beaten.');
    const ev = w.events.pending.find((p) => p.defId === 'war:terms')!;
    expect(ev).toBeTruthy();
    for (let i = 0; i < eventDef('war:terms')!.options.length; i++) answerEvent(w, ev.id, i);
    w = answerEvent(w, ev.id, 0);
    expect(w.war!.wars.find((x) => x.id === war.id)!.result!.terms).toBe('tribute');
  });

  it('a new world taken in war runs with the rest', () => {
    let w = structuredClone(createWorld('newworld'));
    makePlanet(w, new Rng(w.rng), w.playerHouseId, 'Testara', 'A test.', { human: 100 });
    w = run(deserialize(serialize(w)), 200);
    expect(Object.values(w.planets).some((p) => p.name === 'Testara')).toBe(true);
  });

  it('we can join another war, and the Numarade can stop one', () => {
    let w = structuredClone(createWorld('join'));
    const war = startWar(w, new Rng(w.rng), { attacker: 'lumen', defender: 'endama', goal: 'world', rung: 'war' });
    w = joinWar(w, war.id, 'defenders');
    expect(warsOf(w, w.playerHouseId).length).toBe(1);
    const f = formationsOf(w, w.playerHouseId)[0]!;
    w = assignFormation(w, f.id, null);
    orderCeasefire(w, war.id);
    expect(w.events.pending.some((p) => p.defId === 'war:ceasefire')).toBe(true);
    w = run(w, 60);
    expect(w.war!.wars.find((x) => x.id === war.id)!.status).toBe('ended');
  });

  it('grievances are found, and the Archon makes war on its own over the years', () => {
    let w = createWorld('ages');
    expect(Array.isArray(grievances(w, 'lumen', 'myr'))).toBe(true);
    w = run(w, 400 * 6);
    const all = w.war!.wars as War[];
    expect(all.length).toBeGreaterThan(0);
    expect(w.archon!.history.some((e) => e.kind === 'war' && e.year >= 412)).toBe(true);
  }, 120000);
});
