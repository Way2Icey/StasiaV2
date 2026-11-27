import { createWorld } from './world';
import { advanceTurn, advanceUntil } from './tick';
import { deserialize, serialize } from './save';
import {
  answerRaid, arrest, boardOf, detainShip, fineShip, gradeOf, harbourmaster, inspectShip, isOurs, logIncident, mainPort, portSectors,
  postAgent, recallAgent, setAgentOn, setBan, setPortOrders, toggleWatch, type Ship,
} from './ports';
import { isAway } from './court';
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
    const tariffs = a.economy.houses[P]!.recent.filter((l) => l.kind === 'port').length + Object.values(a.ports.ports).reduce((t, p) => t + p.tally.tariffs + p.last.tariffs, 0);
    expect(tariffs).toBeGreaterThan(0);
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

describe('the register, travel and rival ports', () => {
  it('fines most finds on the spot and holds only the serious ones', () => {
    const w = advanceUntil(world, 200, false).world;
    const reg = Object.values(w.ports.register);
    expect(reg.length).toBeGreaterThan(0);
    const held = Object.values(w.ports.ships).filter((s) => s.status === 'held').length;
    expect(held).toBeLessThanOrEqual(3);
    for (const e of reg) expect(e.incidents.length).toBeGreaterThan(0);
  });

  it('turns banned captains away at every port', () => {
    let { w, id } = withShip(world, { status: 'inbound', arrives: world.date, captain: 'Banned Bob', registry: 'XX-BAN-1' });
    const entry = logIncident(w, w.ports.ships[id]!, 'test', 3);
    w = setBan(w, entry.id, true);
    expect(gradeOf(w.ports.register[entry.id])).toBe(4);
    w = advanceTurn(w);
    expect(w.ports.ships[id]!.status).toBe('departed');
    expect(w.ports.ships[id]!.notes.some((n) => n.includes('banned'))).toBe(true);
    w = setBan(w, entry.id, false);
    expect(gradeOf(w.ports.register[entry.id])).toBe(3);
  });

  it('sends our people travelling and brings them home', () => {
    let w = world;
    let seen = 0;
    for (let i = 0; i < 30 && !seen; i++) {
      w = advanceUntil(w, 20, false).world;
      seen = Object.values(w.ports.ships).filter((s) => s.purpose === 'travel').length;
    }
    expect(seen).toBeGreaterThan(0);
    const traveller = Object.values(w.characters).find((c) => c.flags.some((f) => f.id === 'travelling'));
    if (traveller) expect(isAway(w, traveller.id)).toBe(true);
  });

  it('a posted agent shows us a rival port, and a recall closes it', () => {
    const w0 = structuredClone(world);
    const agent = Object.values(w0.characters).find((c) => c.houseId === P && c.tier === 'full' && !c.seat)!;
    agent.flags.push({ id: 'agent', since: w0.date, knownBy: [P] });
    const port = Object.values(w0.planets).find((p) => p.houseId === 'serath')!.sectors.find((s) => s.port === 'starport')!;
    let w = postAgent(w0, agent.id, port.id);
    expect(isOurs(w, port.id)).toBe(false);
    expect(isAway(w, agent.id)).toBe(true);
    w = advanceUntil(w, 20, false).world;
    if (w.ports.posts[agent.id]) {
      expect(boardOf(w, port.id).length).toBeGreaterThan(0);
      w = recallAgent(w, agent.id);
    }
    expect(w.ports.ports[port.id]).toBeUndefined();
    expect(isAway(w, agent.id) && !w.captives[agent.id]).toBe(false);
  });
});
