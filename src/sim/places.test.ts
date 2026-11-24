import { describe, expect, it } from 'vitest';
import { createWorld } from './world';
import { advanceUntil } from './tick';
import { phaseLedger } from './economy';
import { ensurePlaces, sitesOf } from './places';
import { assaultSite, claimWild, sendExpedition, settleOutpost } from './arcs_places';
import { declareWar, grievances } from './war';
import { shipsOf } from './fleet';
import { deserialize, serialize } from './save';
import type { World } from './types';

const fresh = (): World => structuredClone(createWorld('places-test', { house: 'torvann' }));

describe('places', () => {
  it('every house holds stations that pay it, and the canon landmarks are known', () => {
    const w = fresh();
    const ps = ensurePlaces(w);
    for (const h of Object.keys(w.houses)) expect(sitesOf(w, h).length).toBeGreaterThanOrEqual(2);
    expect(Object.values(ps.sites).some((s) => s.name === 'The Seat of the Numarade' && s.known)).toBe(true);
    expect(Object.values(ps.sites).some((s) => s.name === 'The Virella' && !s.known)).toBe(true);
    expect(phaseLedger(w, w.playerHouseId).some((l) => /Relay/.test(l.label))).toBe(true);
  });

  it('a place taken in war changes hands, and becomes a grievance', () => {
    let w = fresh();
    const P = w.playerHouseId;
    const them = Object.keys(w.houses).find((h) => h !== P)!;
    w = declareWar(w, them, 'tribute', 'war');
    const site = sitesOf(w, them)[0]!;
    site.defence = 0; site.garrison = 100;
    const ships = shipsOf(w, P).filter((s) => !s.ready).map((s) => s.id);
    for (const id of ships) { w.fleet.ships[id]!.duty = 'harbour'; delete w.fleet.ships[id]!.arrives; w.fleet.ships[id]!.condition = 100; }
    w = assaultSite(w, site.id, ships);
    expect(w.places!.sites[site.id]!.holder).toBe(P);
    expect(grievances(w, them, P).some((g) => g.includes(site.name))).toBe(true);
  });

  it('the frontier can be claimed as an outpost, and settled into a world after three years', () => {
    let w = fresh();
    const P = w.playerHouseId;
    const wild = Object.values(w.archon!.frontier).find((x) => !x.claimedBy)!;
    w.economy.houses[P]!.stock.othes = 200000; w.economy.houses[P]!.stock.components = 500;
    w = claimWild(w, wild.id);
    const out = sitesOf(w, P).find((s) => s.kind === 'outpost')!;
    expect(out.wildId).toBe(wild.id);
    out.since = w.date.year - 3;
    const worlds = Object.values(w.planets).filter((p) => p.houseId === P).length;
    w = settleOutpost(w, out.id);
    expect(Object.values(w.planets).filter((p) => p.houseId === P).length).toBe(worlds + 1);
  });

  it('an expedition to a site of the past comes home, and the game runs on and saves', () => {
    let w = fresh();
    const P = w.playerHouseId;
    const ruin = Object.values(ensurePlaces(w).sites).find((s) => s.kind === 'ruin')!;
    ruin.known = true;
    const who = Object.values(w.characters).find((c) => c.alive && c.houseId === P && c.tier === 'full' && !c.seat && c.id !== w.houses[P]!.rulerId)!;
    w.economy.houses[P]!.stock.othes = 50000;
    w = sendExpedition(w, ruin.id, who.id);
    w = advanceUntil(w, 400, false).world;
    expect(w.places!.expeditions.length).toBe(0);
    expect(w.places!.sites[ruin.id]!.explored || !w.characters[who.id]!.alive).toBe(true);
    expect(deserialize(serialize(w)).places).toEqual(w.places);
  }, 120000);
});
