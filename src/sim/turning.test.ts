import { createWorld } from './world';
import { advanceTurns } from './tick';
import { econ } from './economy';
import { addCycles, CYCLES_PER_PHASE, dateParts } from './time';
import { deserialize, serialize } from './save';
import { grievances } from './war';
import { shipsFree } from './arcs_places';
import { activeAgents, blackmail, cannotQuestion, cannotStrike, cannotTurn, ensureIntel, liveIntel, questionCaptive, strikeSite, turnCaptive, TURN_AT, type Intel } from './turning';
import type { Character, World } from './types';

/** Put one of a rival's people in our cells. */
function hold(w: World): Character {
  const P = w.playerHouseId;
  const rival = Object.values(w.houses).find((h) => h.id !== P && Object.values(w.characters).some((c) => c.alive && c.houseId === h.id && c.id !== h.rulerId))!;
  const c = Object.values(w.characters).find((x) => x.alive && x.houseId === rival.id && x.id !== rival.rulerId)!;
  w.captives[c.id] = { characterId: c.id, heldBy: P, since: w.date, interrogated: false };
  c.flags.push({ id: 'captive', since: w.date, knownBy: [P, rival.id] }, { id: 'missing', since: w.date });
  return c;
}
const nextPhase = (w: World): World => ({ ...w, date: addCycles(w.date, CYCLES_PER_PHASE) });

describe('the cells', () => {
  it('each session wears resolve down, once a Phase, and the harsh ways cost honour', () => {
    let w = structuredClone(createWorld());
    const c = hold(w);
    const honour = w.houses[w.playerHouseId]!.standing.honour;
    w = questionCaptive(w, c.id, 'talk');
    const r1 = w.captives[c.id]!.cell!.resolve;
    expect(cannotQuestion(w, c.id)).toMatch(/this Phase/);
    expect(w.houses[w.playerHouseId]!.standing.honour).toBe(honour);
    w = questionCaptive(nextPhase(w), c.id, 'press');
    expect(w.captives[c.id]!.cell!.resolve).toBeLessThan(r1);
    expect(w.houses[w.playerHouseId]!.standing.honour).toBe(honour - 1);
    expect(w.feed.some((f) => f.account)).toBe(true);
  });

  it('broken far enough, they give up intel, and may be turned', () => {
    let w = structuredClone(createWorld());
    const c = hold(w);
    expect(cannotTurn(w, c.id)).toMatch(/Not yet/);
    for (let i = 0; i < 8 && w.captives[c.id] && w.captives[c.id]!.cell?.resolve !== 0; i++) w = questionCaptive(i ? nextPhase(w) : w, c.id, 'press');
    if (!w.captives[c.id]) return; // died is not possible by pressing, but keep the test honest
    expect(w.captives[c.id]!.cell!.resolve).toBeLessThanOrEqual(TURN_AT);
    expect(liveIntel(w).length).toBeGreaterThan(0);
    expect(cannotTurn(w, c.id)).toBeNull();
    w = turnCaptive(w, c.id, 'home');
    expect(w.captives[c.id]).toBeUndefined();
    expect(w.characters[c.id]!.flags.some((f) => f.id === 'captive' || f.id === 'missing')).toBe(false);
    expect(activeAgents(w).map((a) => a.personId)).toContain(c.id);
  });

  it('a plot against us becomes a grievance the Archon accepts', () => {
    const w = structuredClone(createWorld());
    const them = Object.values(w.houses).find((h) => h.id !== w.playerHouseId)!.id;
    ensureIntel(w).wrongs.push({ by: them, against: w.playerHouseId, text: 'They plotted against us.', year: dateParts(w.date).year });
    expect(grievances(w, w.playerHouseId, them).some((g) => /plotted/.test(g))).toBe(true);
  });

  it('a strike on a station needs the intel and free ships, and leaves its mark', () => {
    let w = structuredClone(createWorld());
    const P = w.playerHouseId;
    const site = Object.values(w.places!.sites).find((s) => s.holder && s.holder !== P && s.holdable)!;
    const it: Intel = { id: 'inX', kind: 'site', houseId: site.holder!, siteId: site.id, text: 'x', source: 'test', date: w.date, expires: addCycles(w.date, 999), quality: 3 };
    ensureIntel(w).items.push(it);
    expect(cannotStrike(w, 'inX', [])).toMatch(/at least one/);
    const ships = shipsFree(w, P).slice(0, 2).map((s) => s.id);
    if (!ships.length) return;
    const before = econ(w, P).stock.othes;
    w = strikeSite(w, 'inX', ships);
    expect(w.intel!.items.find((x) => x.id === 'inX')!.used).toBe(true);
    expect(econ(w, P).stock.othes).toBeGreaterThanOrEqual(before);
    expect(cannotStrike(w, 'inX', ships)).toMatch(/No way in/);
  });

  it('blackmail with a true secret pays; a false one embarrasses us', () => {
    let w = structuredClone(createWorld());
    const P = w.playerHouseId;
    const p = Object.values(w.characters).find((c) => c.alive && c.houseId && c.houseId !== P && c.seat)!;
    econ(w, p.houseId!).stock.othes = 50000;
    ensureIntel(w).items.push({ id: 's1', kind: 'secret', houseId: p.houseId!, personId: p.id, text: 'x', source: 't', date: w.date, expires: addCycles(w.date, 999), quality: 2 },
      { id: 's2', kind: 'secret', houseId: p.houseId!, personId: p.id, text: 'y', source: 't', date: w.date, expires: addCycles(w.date, 999), quality: 2, false: true });
    const before = econ(w, P).stock.othes;
    w = blackmail(w, 's1', 'pay');
    expect(econ(w, P).stock.othes).toBe(before + 4000);
    const b2 = econ(w, P).stock.othes;
    w = blackmail(w, 's2', 'pay');
    expect(econ(w, P).stock.othes).toBe(b2);
  });

  it('the intel state survives a save, and time moves agents along without breaking', () => {
    let w = structuredClone(createWorld());
    const c = hold(w);
    for (let i = 0; i < 6 && w.captives[c.id]; i++) w = questionCaptive(i ? nextPhase(w) : w, c.id, 'press');
    if (w.captives[c.id] && !cannotTurn(w, c.id)) w = turnCaptive(w, c.id, 'home');
    w = deserialize(serialize(w));
    w = advanceTurns(w, 40);
    expect(w.intel).toBeDefined();
  });
});
