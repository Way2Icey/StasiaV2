import { createWorld } from './world';
import { advanceTurn, advanceUntil } from './tick';
import { deserialize, serialize } from './save';
import {
  answerRaid, arrest, boardOf, detainShip, fineShip, harbourmaster, inspectShip, mainPort, portSectors,
  setAgentOn, setPortOrders, toggleWatch, type Ship,
} from './ports';
import { addCycles } from './time';
import type { World } from './types';

const world = createWorld();
const P = world.playerHouseId;

function withShip(w: World, ship: Partial<Ship>): { w: World; id: string } {
  const copy = structuredClone(w);
  const port = mainPort(copy)!;
  const id = `test-ship-${copy.nextId++}`;
  copy.ports.ships[id] = {
    id, name: 'Test Wake', cls: 'tramp freighter', flag: 'none', registry: 'XX-0001-A', age: 20, captain: 'Kesh Vabran',
    crew: 6, passengers: 2, from: 'outer', to: 'exchange', sectorId: port.id, status: 'docked', berth: 3,
    arrives: copy.date, departs: addCycles(copy.date, 6), purpose: 'smuggling', declared: 'salvage',
    cargo: [{ label: 'hull plate', qty: 30 }, { label: 'components', good: 'components', qty: 20, hidden: true, found: true }],
    aboard: [], notes: [], ...ship,
  };
  return { w: copy, id };
}

describe('ports', () => {
  it('opens a port for every sector we hold with one', () => {
    const sectors = portSectors(world);
    expect(sectors.length).toBeGreaterThan(0);
    for (const s of sectors) expect(world.ports.ports[s.id]).toBeDefined();
    expect(mainPort(world)!.port).toBe('starport');
    expect(harbourmaster(world, mainPort(world)!.id)).toBeDefined();
  });

  it('fills with traffic, collects tariffs, and stays deterministic', () => {
    const run = () => advanceUntil(world, 60, false).world;
    const a = run();
    const b = run();
    expect(serialize(a)).toBe(serialize(b));
    expect(boardOf(a, mainPort(a)!.id).length).toBeGreaterThan(3);
    const tariffs = a.economy.houses[P]!.recent.filter((l) => l.kind === 'port');
    expect(tariffs.length).toBeGreaterThan(0);
    for (const s of Object.values(a.ports.ships)) expect(s.sectorId).toBeTruthy();
  });

  it('inspects without changing the input, and fines seize what was found', () => {
    const { w, id } = withShip(world, {});
    const before = serialize(w);
    inspectShip(w, id);
    expect(serialize(w)).toBe(before);
    const othes = w.economy.houses[P]!.stock.othes;
    const comps = w.economy.houses[P]!.stock.components;
    const after = fineShip(detainShip(w, id), id);
    expect(after.economy.houses[P]!.stock.othes).toBeGreaterThan(othes);
    expect(after.economy.houses[P]!.stock.components).toBe(comps + 20);
    expect(after.ports.ships[id]!.status).toBe('docked');
  });

  it('turns a caught spy into a captive', () => {
    const agent = Object.values(world.characters).find((c) => c.houseId === 'serath' && c.tier === 'full' && !c.seat)!;
    const { w, id } = withShip(world, { aboard: [{ name: 'A Merchant', species: agent.species, role: 'merchant', papers: 'forged', characterId: agent.id, truth: 'spy', houseId: 'serath', suspect: true }] });
    const after = arrest(w, id, 0);
    expect(after.captives[agent.id]?.heldBy).toBe(P);
    expect(after.characters[agent.id]!.flags.some((f) => f.id === 'captive')).toBe(true);
  });

  it('sends an agent aboard only when one is free', () => {
    const { w, id } = withShip(world, {});
    expect(setAgentOn(w, id).ports.ships[id]!.agentChecked).toBeFalsy();
  });

  it('raises the alarm when a watched person docks', () => {
    const target = Object.values(world.characters).find((c) => c.houseId === 'shaaliin' && c.tier === 'full')!;
    let w = toggleWatch(world, target.id);
    const port = mainPort(w)!;
    ({ w } = withShip(w, { status: 'inbound', arrives: w.date, aboard: [{ name: 'Lady', species: target.species, role: 'envoy', papers: 'ok', characterId: target.id }], sectorId: port.id }));
    const before = w.ports.alerts;
    w = advanceTurn(w);
    expect(w.ports.alerts).toBeGreaterThan(before);
    expect(w.feed.some((e) => e.text.startsWith('Watchlist'))).toBe(true);
  });

  it('a closed port turns ships away', () => {
    const port = mainPort(world)!;
    let w = setPortOrders(world, port.id, { closed: true });
    w = advanceUntil(w, 20, false).world;
    expect(Object.values(w.ports.ships).filter((s) => s.sectorId === port.id && s.status === 'docked' && !s.ours).length).toBe(0);
  });

  it('raids come, can be answered, and end', () => {
    const w0 = structuredClone(world);
    const port = mainPort(w0)!;
    w0.ports.raids.push({ id: 'raid1', sectorId: port.id, strength: 30, status: 'revealed', revealAt: w0.date, arrives: addCycles(w0.date, 2), known: true });
    let w = answerRaid(w0, 'raid1', 'muster');
    expect(w.ports.raids[0]!.answer).toBe('muster');
    w = advanceUntil(w, 6, false).world;
    const raid = w.ports.raids.find((r) => r.id === 'raid1')!;
    expect(raid.status).toBe('over');
    expect(raid.result).toBeTruthy();
  });

  it('upgrades a version 10 save', () => {
    const old = JSON.parse(serialize(world));
    old.version = 10;
    delete old.ports;
    const w = deserialize(JSON.stringify(old));
    expect(w.version).toBe(11);
    expect(Object.keys(w.ports.ports).length).toBe(portSectors(w).length);
  });
});
