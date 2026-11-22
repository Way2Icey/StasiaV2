import { createWorld } from './world';
import { advanceTurn } from './tick';
import { econ } from './economy';
import { answerCrew, cannotDeal, factionOdds, LANE_BY_ID, laneBetween, makeDeal, setCustoms } from './lanes';
import { deserialize, serialize } from './save';
import type { World } from './types';

const step = (w: World) => { const x = advanceTurn(w); x.events.pending = []; x.ambitions.audiences = []; return x; };

describe('dynamic lanes', () => {
  it('quotas and trade really travel, and some of it never arrives', () => {
    let w = structuredClone(createWorld());
    for (let i = 0; i < 800; i++) w = step(w);
    const done = w.lanes.done;
    expect(done.length).toBeGreaterThan(20);
    expect(done.some((c) => c.kind === 'quota' && c.fate === 'arrived')).toBe(true);
    // Every house has sent something somewhere.
    const owners = new Set([...done, ...Object.values(w.lanes.convoys)].map((c) => c.owner));
    for (const h of Object.keys(w.houses)) expect(owners.has(h)).toBe(true);
    expect(Object.values(w.lanes.factions).some((f) => f.hauls > 0)).toBe(true);
    expect(deserialize(serialize(w)).lanes).toEqual(w.lanes);
  });

  it('passage, bounties and letters change who the companies hunt', () => {
    let w = structuredClone(createWorld());
    const P = w.playerHouseId;
    econ(w, P).stock.othes = 50000;
    const lane = laneBetween('alerion-prime', 'exchange')!;
    const f = w.lanes.factions.ninefold!;
    const base = factionOdds(w, f, lane, P);
    w = makeDeal(w, 'ninefold', 'passage');
    expect(factionOdds(w, w.lanes.factions.ninefold!, lane, P)).toBeLessThan(base * 0.5);
    expect(cannotDeal(w, 'ninefold', 'bounty')).toBeTruthy();
    // Letters need trust first.
    const rival = Object.keys(w.houses).find((h) => h !== P)!;
    w.lanes.factions.ninefold!.rel[P] = 0;
    expect(cannotDeal(w, 'ninefold', 'marque', rival)).toMatch(/trust/);
    w.lanes.factions.ninefold!.rel[P] = 40;
    const rivalLane = LANE_BY_ID[[w.houses[rival]!.capitalPlanetId, 'exchange'].sort().join('~')]!;
    const before = factionOdds(w, w.lanes.factions.ninefold!, rivalLane, rival);
    w = makeDeal(w, 'ninefold', 'marque', rival);
    expect(factionOdds(w, w.lanes.factions.ninefold!, rivalLane, rival)).toBeGreaterThan(before * 2);
  });

  it('a blind eye warms the companies; a held crew can be bought back', () => {
    let w = structuredClone(createWorld());
    const P = w.playerHouseId;
    w = setCustoms(w, 'blind');
    const r0 = w.lanes.factions.ninefold!.rel[P]!;
    for (let i = 0; i < 160; i++) w = step(w);
    expect(w.lanes.factions.ninefold!.rel[P]!).toBeGreaterThan(r0);
    w.lanes.held.push({ id: 'chx', faction: 'hollow', owner: P, crew: 20, ransom: 1200, expires: { year: w.date.year + 1, cycle: 1 }, what: 'our fuel convoy' });
    econ(w, P).stock.othes = 5000;
    w = answerCrew(w, 'chx', true);
    expect(econ(w, P).stock.othes).toBe(3800);
    expect(w.lanes.held.some((h) => h.id === 'chx')).toBe(false);
  });
});
