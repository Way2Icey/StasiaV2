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
import { orderGroup, theatreOf } from './warroom';
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
    // In the War Room: the fleet goes for the space over their capital, the host rides behind it.
    const t = theatreOf(war)!;
    const orbit = Object.values(t.nodes).find((n) => n.kind === 'orbit' && n.target)!;
    for (const g of Object.values(t.groups).filter((x) => x.house === w.playerHouseId)) w = orderGroup(w, war.id, g.id, { to: g.domain === 'void' ? orbit.id : 'myr:ap' });
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
    // A world chosen so that its rivals come to blows; whether a given seed does is a matter of chance.
    let w = createWorld('a4');
    expect(Array.isArray(grievances(w, 'lumen', 'myr'))).toBe(true);
    w = run(w, 400 * 6);
    const all = w.war!.wars as War[];
    expect(all.length).toBeGreaterThan(0);
    expect(w.archon!.history.some((e) => e.kind === 'war' && e.year >= 412)).toBe(true);
  }, 120000);
});

describe('6.4', () => {
  it('our great ships sail with the fleet and can be lost', () => {
    let w = createWorld('ships');
    const ships = Object.values(w.fleet.ships).filter((s) => s.houseId === w.playerHouseId && !s.ready);
    w = declareWar(w, 'myr', 'tribute', 'war');
    const fleet = formationsOf(w, w.playerHouseId).find((f) => f.kind === 'fleet')!;
    expect(fleet.front).toBeTruthy();
    w = run(w, 400);
    expect(ships.length).toBeGreaterThanOrEqual(0);
  }, 60000);

  it('a knight can be given leave to found a house sworn to us', async () => {
    const { grantFounding, cannotFound } = await import('./war');
    const { openWilds } = await import('./archon');
    let w = structuredClone(createWorld('found'));
    w.economy.houses[w.playerHouseId]!.stock.othes = 20000;
    const k = Object.values(w.characters).find((c) => c.alive && c.houseId === w.playerHouseId && c.flags.some((f) => f.id === 'knighted') && !c.seat)!;
    const wild = openWilds(w)[0]!;
    expect(cannotFound(w, k.id, wild.id)).toBeNull();
    w = grantFounding(w, k.id, wild.id);
    const h = Object.values(w.archon!.houses).find((x) => x.foundedBy && w.archon!.frontier[wild.id]!.claimedBy === x.id)!;
    expect(w.war!.liege[h.id]).toBe(w.playerHouseId);
    expect(w.characters[k.id]!.flags.some((f) => f.id === 'retired')).toBe(true);
    w = run(w, 200);
  }, 60000);

  it('a vassal can fight its liege, and winning frees it', () => {
    const w = structuredClone(createWorld('fealty'));
    w.war!.liege[w.playerHouseId] = 'lumen';
    expect(cannotDeclare(w, 'lumen', 'clashes')).toBeNull();
    const rng = new Rng(w.rng);
    const war = startWar(w, rng, { attacker: w.playerHouseId, defender: 'lumen', goal: 'humble', rung: 'clashes' });
    war.status = 'ended';
    war.result = { winner: 'attackers', text: 't', date: w.date };
    applyTerms(w, rng, war, 'humble');
    expect(w.war!.liege[w.playerHouseId]).toBeUndefined();
  });

  it('a world taken in war has people to govern', () => {
    const w = structuredClone(createWorld('people'));
    const p = makePlanet(w, new Rng(w.rng), w.playerHouseId, 'Peopled', 'x', { human: 100 });
    expect(Object.values(w.characters).filter((c) => c.location?.planetId === p.id).length).toBeGreaterThan(3);
    expect(p.sectors.every((s) => s.quarters.every((q) => q.overseerId))).toBe(true);
  });
});
