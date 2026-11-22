// Great ships: each house's capital ships, their captains and crews, where they are and what they are doing.
import { tally } from './careers';
import { Rng } from './rng';
import { displayName } from './names';
import { econ, record } from './economy';
import { relation, shiftRelation } from './relations';
import { logRecord } from './records';
import { findSector } from './query';
import { shiftMood } from './mood';
import { shiftOpinion } from './relationships';
import { kill } from './death';
import { addGlory } from './ambitions';
import { ensureBrig, type Module } from './holdings';
import { absoluteCycle, addCycles, CYCLES_PER_ORBIT, CYCLES_PER_PHASE, type GameDate } from './time';
import type { Character, World } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const H = (w: World, id: string) => `House ${w.houses[id]?.name ?? id}`;
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

// Placeholder class names until the house's own ship-class list is wired in.
export type CapitalClass = 'cruiser' | 'battlecruiser' | 'carrier' | 'dreadnought';
export interface CapitalClassDef { label: string; crew: number; upkeep: number; power: number; cost: number; components: number; slots: number; note: string }
export const CAPITAL_CLASSES: Record<CapitalClass, CapitalClassDef> = {
  cruiser: { label: 'Cruiser', crew: 320, upkeep: 400, power: 20, cost: 25000, components: 120, slots: 2, note: 'Fast and cheap to keep. The workhorse of a minor house.' },
  battlecruiser: { label: 'Battlecruiser', crew: 600, upkeep: 700, power: 35, cost: 45000, components: 220, slots: 2, note: 'Heavy guns on a cruiser\'s legs.' },
  carrier: { label: 'Carrier', crew: 800, upkeep: 800, power: 28, cost: 50000, components: 250, slots: 3, note: 'Fights through its wings: a hangar makes it.' },
  dreadnought: { label: 'Dreadnought', crew: 1200, upkeep: 1200, power: 50, cost: 80000, components: 400, slots: 3, note: 'A house\'s pride and its whole treasury, afloat.' },
};

export type Duty = 'harbour' | 'patrol' | 'show' | 'blockade' | 'escort';
export const DUTY_LABEL: Record<Duty, string> = { harbour: 'In harbour', patrol: 'Patrol', show: 'Show the flag', blockade: 'Blockade', escort: 'Convoy escort' };
export const DUTY_NOTE: Record<Duty, string> = {
  harbour: 'Moored at home. Cheap to keep and repairs itself, but idle crews grow restless.',
  patrol: 'Watches one of our sectors: raiders think twice, and if they come the ship fights.',
  show: 'Takes station over another house\'s world. Our dread rises; their regard falls, unless they are friends.',
  blockade: 'Stops ships at another house\'s main port. Their trade suffers and they hate us for it; warships may come out to test us.',
  escort: 'Guards our convoys on the lanes, two runs at a time: corsairs think twice, and if they come the ship fights. Convoy fees from others bring in othes.',
};

export interface CapitalShip {
  id: string;
  houseId: string;
  name: string;
  cls: CapitalClass;
  captainId: string | null;
  crew: number;
  /** 0..100. Below 25 talk turns to mutiny. */
  crewMood: number;
  /** 0..100 hull and systems. */
  condition: number;
  /** The sector it is at, or heading for. */
  sectorId: string;
  arrives?: GameDate;
  /** Where it sailed from, and when, while under way. */
  from?: string;
  left?: GameDate;
  duty: Duty;
  /** For show/blockade: the house. For patrol: the sector (same as sectorId). */
  target?: string;
  /** When it last left harbour. */
  deployed?: GameDate;
  built: GameDate;
  /** Under construction until this date, at this yard. */
  ready?: GameDate;
  yardId?: string;
  lost?: { date: GameDate; how: string };
  /** Sent to the Crucible for the season. */
  crucible?: boolean;
  unpaid?: number;
}

export interface FleetState { ships: Record<string, CapitalShip> }

const GRAND = ['Resolve', 'Sovereign', 'Aegis', 'Dominion', 'Vigil', 'Requiem', 'Ascendant', 'Bastion', 'Herald', 'Tempest', 'Covenant', 'Meridian', 'Paragon', 'Reckoning', 'Lodestar', 'Equinox'];

function shipName(world: World, rng: Rng, houseId: string): string {
  const h = world.houses[houseId]!;
  const taken = new Set(Object.values(world.fleet?.ships ?? {}).map((s) => s.name));
  for (let i = 0; i < 20; i++) {
    const n = rng.chance(0.4) ? `${h.name} ${rng.pick(GRAND)}` : `${rng.pick(['Patient', 'Sworn', 'Iron', 'Seventh', 'Last', 'Ardent', 'Quiet', 'Burning', 'Pale', 'Faithful', 'Long'])} ${rng.pick(GRAND)}`;
    if (!taken.has(n)) return n;
  }
  return `${h.name} ${rng.pick(GRAND)} ${world.nextId}`;
}

function capitalSector(world: World, houseId: string): string {
  const p = world.planets[world.houses[houseId]?.capitalPlanetId ?? '']!;
  const rank = { none: 0, 'landing field': 1, spaceport: 2, starport: 3 } as const;
  return [...p.sectors].sort((a, b) => rank[b.port] - rank[a.port])[0]!.id;
}

function bestCaptain(world: World, houseId: string, except: Set<string>): Character | undefined {
  return Object.values(world.characters)
    .filter((c) => c.alive && c.houseId === houseId && c.tier === 'full' && !except.has(c.id) && !c.seat && !c.flags.some((f) => f.id === 'ward' || f.id === 'captive'))
    .sort((a, b) => b.stats.fleetCommand + b.stats.leadership + (b.role === 'Knight' ? 6 : 0) - (a.stats.fleetCommand + a.stats.leadership + (a.role === 'Knight' ? 6 : 0)))[0];
}

export function ensureFleet(world: World): void {
  if (world.fleet?.ships) {
    for (const s of Object.values(world.fleet.ships)) if (!s.lost && world.holdings) ensureBrig(world, s.id, s.houseId);
    return;
  }
  world.fleet = { ships: {} };
  const rng = new Rng(world.rng);
  for (const h of Object.values(world.houses)) {
    const n = h.tier === 'great' ? 2 : 1;
    const used = new Set<string>();
    for (let i = 0; i < n; i++) {
      const cls: CapitalClass = h.tier === 'great' ? (i === 0 ? 'dreadnought' : 'carrier') : (h.personality.aggression > 0.6 ? 'battlecruiser' : 'cruiser');
      const cap = bestCaptain(world, h.id, used);
      if (cap) used.add(cap.id);
      const id = `cs${world.nextId++}`;
      world.fleet.ships[id] = {
        id, houseId: h.id, name: shipName(world, rng, h.id), cls, captainId: cap?.id ?? null, crew: CAPITAL_CLASSES[cls].crew,
        crewMood: 55 + Math.round(rng.next() * 20), condition: 80 + Math.round(rng.next() * 20), sectorId: capitalSector(world, h.id),
        duty: 'harbour', built: world.date,
      };
    }
  }
  world.rng = rng.state;
  if (world.holdings) for (const s of Object.values(world.fleet.ships)) ensureBrig(world, s.id, s.houseId);
}

// ---------------------------------------------------------------- queries

export function shipsOf(world: World, houseId: string): CapitalShip[] {
  return Object.values(world.fleet?.ships ?? {}).filter((s) => s.houseId === houseId && !s.lost);
}

export function shipsAt(world: World, sectorId: string): CapitalShip[] {
  return Object.values(world.fleet?.ships ?? {}).filter((s) => !s.lost && !s.ready && !s.crucible && s.sectorId === sectorId && !s.arrives);
}

export function underway(s: CapitalShip): boolean { return !!s.arrives; }

/** Fighting strength now: class, crew, condition, captain. */
export function powerOf(world: World, s: CapitalShip): number {
  const def = CAPITAL_CLASSES[s.cls];
  const cap = s.captainId ? world.characters[s.captainId] : undefined;
  const lead = cap?.alive ? (cap.stats.fleetCommand + cap.stats.tactics) / 20 : 0.6;
  const hangar = Object.values(world.holdings?.modules ?? {}).filter((m) => m.shipId === s.id && m.kind === 'hangar').reduce((n, m) => n + m.level * 6, 0);
  return Math.round((def.power + hangar) * (0.5 + s.condition / 200) * (0.6 + s.crewMood / 250) * (0.7 + lead * 0.5) * (s.crew / def.crew));
}

/** What our ships add to a sector's defence against raiders. */
export function fleetDefence(world: World, sectorId: string): number {
  return shipsAt(world, sectorId).filter((s) => s.houseId === world.playerHouseId && (s.duty === 'patrol' || s.duty === 'harbour')).reduce((n, s) => n + powerOf(world, s), 0);
}

export function upkeepOf(s: CapitalShip): number {
  const u = CAPITAL_CLASSES[s.cls].upkeep;
  return s.duty === 'harbour' ? Math.round(u * 0.6) : u;
}

export function moodWord(m: number): string {
  return m >= 70 ? 'proud' : m >= 50 ? 'steady' : m >= 35 ? 'grumbling' : m >= 25 ? 'sullen' : 'mutinous';
}

function travelCycles(world: World, from: string, to: string): number {
  const a = findSector(world, from)?.planet.id;
  const b = findSector(world, to)?.planet.id;
  return a && a === b ? 2 : CYCLES_PER_PHASE;
}

/** The main port of a house, for showing the flag or a blockade. */
export function mainPortOf(world: World, houseId: string): string { return capitalSector(world, houseId); }

// ---------------------------------------------------------------- actions

function act(input: World, fn: (w: World, rng: Rng) => void): World {
  const w = structuredClone(input);
  ensureFleet(w);
  const rng = new Rng(w.rng);
  fn(w, rng);
  w.rng = rng.state;
  return w;
}

function aboard(w: World, s: CapitalShip) {
  const c = s.captainId ? w.characters[s.captainId] : undefined;
  if (!c) return;
  c.flags = c.flags.filter((f) => f.id !== 'aboard');
  if (s.duty !== 'harbour' || s.arrives) c.flags.push({ id: 'aboard', since: w.date, detail: `in command of the ${s.name}` });
}

export function setCaptain(input: World, shipId: string, captainId: string | null): World {
  return act(input, (w) => {
    const s = w.fleet.ships[shipId];
    if (!s || s.houseId !== w.playerHouseId) return;
    const old = s.captainId ? w.characters[s.captainId] : undefined;
    if (old) old.flags = old.flags.filter((f) => f.id !== 'aboard');
    for (const o of Object.values(w.fleet.ships)) if (o.captainId === captainId) o.captainId = null;
    s.captainId = captainId;
    if (old && captainId && old.id !== captainId) shiftMood(old, -6);
    aboard(w, s);
    if (captainId) {
      const c = w.characters[captainId]!;
      s.crewMood = clamp(s.crewMood + (c.stats.leadership - 10), 0, 100);
    }
  });
}

/** Send a ship on a duty; it sails to where the duty is. */
export function setDuty(input: World, shipId: string, duty: Duty, target?: string): World {
  return act(input, (w) => {
    const s = w.fleet.ships[shipId];
    if (!s || s.houseId !== w.playerHouseId || s.ready || s.lost || s.crucible) return;
    dutyInPlace(w, s, duty, target);
  });
}

function dutyInPlace(w: World, s: CapitalShip, duty: Duty, target?: string) {
  const home = capitalSector(w, s.houseId);
  const dest = duty === 'harbour' || duty === 'escort' ? home : duty === 'patrol' ? (target ?? home) : mainPortOf(w, target ?? s.houseId);
  s.duty = duty;
  s.target = duty === 'show' || duty === 'blockade' ? target : duty === 'patrol' ? dest : undefined;
  if (dest !== s.sectorId) {
    s.arrives = addCycles(w.date, travelCycles(w, s.sectorId, dest));
    s.from = s.sectorId;
    s.left = w.date;
    s.sectorId = dest;
  }
  if (duty !== 'harbour' && !s.deployed) s.deployed = w.date;
  if (duty === 'harbour') s.deployed = undefined;
  aboard(w, s);
  const P = w.playerHouseId;
  if (s.houseId === P || (s.target && s.target === P)) {
    const where = findSector(w, dest);
    logRecord(w, {
      kind: 'world', type: 'world', severity: duty === 'blockade' || (duty === 'show' && s.houseId !== P) ? 2 : 0,
      text: s.houseId === P
        ? `The ${s.name} ${duty === 'harbour' ? 'returns to harbour' : `sails ${duty === 'patrol' ? `to patrol ${where?.sector.name}` : duty === 'escort' ? 'to escort the convoys' : `${duty === 'show' ? 'to show our flag over' : 'to blockade'} ${H(w, target ?? '')}`}`}.`
        : `${H(w, s.houseId)}'s ${CAPITAL_CLASSES[s.cls].label.toLowerCase()} ${s.name} is coming ${duty === 'blockade' ? 'to blockade our port' : 'to take station over our world'}.`,
      houseIds: [s.houseId, ...(s.target ? [s.target] : [])], placeId: dest, who: s.captainId ? [{ id: s.captainId, part: 'captain' }] : [],
    });
  }
}

/** Ships on the slips of a yard: still building there. */
export function onSlips(world: World, yard: Module): CapitalShip[] {
  return Object.values(world.fleet?.ships ?? {}).filter((x) => x.ready && x.yardId === yard.id && !x.lost);
}

/** Orbits a yard takes to build a great ship: two at level 1, down to one at level 3. */
export function buildOrbits(yard: Module): number { return [2, 2, 1.5, 1][yard.level] ?? 2; }

export function cannotCommission(world: World, cls: CapitalClass, yardId: string): string | null {
  const yard = world.holdings?.modules[yardId];
  if (!yard || yard.kind !== 'shipyard' || yard.houseId !== world.playerHouseId || yard.level < 1) return 'Needs a shipyard';
  if (onSlips(world, yard).length >= yard.level) return `The slips are full (${yard.level})`;
  const e = econ(world, world.playerHouseId);
  const d = CAPITAL_CLASSES[cls];
  if (e.stock.othes < d.cost) return `Needs ${fmt(d.cost)} othes`;
  if (e.stock.components < d.components) return `Needs ${d.components} components`;
  return null;
}

export function commission(input: World, cls: CapitalClass, yardId: string): World {
  return act(input, (w, rng) => {
    const why = cannotCommission(w, cls, yardId);
    if (why) throw new Error(why);
    const yard = w.holdings.modules[yardId]!;
    const P = w.playerHouseId;
    const d = CAPITAL_CLASSES[cls];
    record(w, P, { resource: 'othes', amount: -d.cost, label: `Laid down a ${d.label.toLowerCase()}`, kind: 'develop', sectorId: yard.sectorId });
    record(w, P, { resource: 'components', amount: -d.components, label: `Laid down a ${d.label.toLowerCase()}`, kind: 'develop', sectorId: yard.sectorId });
    const id = `cs${w.nextId++}`;
    const orbits = buildOrbits(yard);
    w.fleet.ships[id] = {
      id, houseId: P, name: shipName(w, rng, P), cls, captainId: null, crew: d.crew, crewMood: 60, condition: 100,
      sectorId: yard.sectorId!, duty: 'harbour', built: w.date, ready: addCycles(w.date, Math.round(CYCLES_PER_ORBIT * orbits)), yardId: yard.id,
    };
    ensureBrig(w, id, P);
    logRecord(w, { kind: 'world', type: 'economy', severity: 2, text: `The keel of a new ${d.label.toLowerCase()}, the ${w.fleet.ships[id]!.name}, is laid at the yards of ${findSector(w, yard.sectorId!)?.sector.name}.`, effects: [`−${fmt(d.cost)} othes`, `−${d.components} components`, `Ready in ${orbits} Orbits`], placeId: yard.sectorId });
  });
}

export function renameShip(input: World, shipId: string, name: string): World {
  return act(input, (w) => { const s = w.fleet.ships[shipId]; if (s && s.houseId === w.playerHouseId && name.trim()) s.name = name.trim().slice(0, 40); });
}

// ---------------------------------------------------------------- the passage of time

function arrive(w: World, s: CapitalShip) {
  delete s.arrives;
  aboard(w, s);
  const P = w.playerHouseId;
  if (s.houseId !== P && s.target === P) {
    logRecord(w, {
      kind: 'world', type: 'politics', severity: 2, text: `${H(w, s.houseId)}'s ${s.name} has taken station over ${findSector(w, s.sectorId)?.planet.name}.`,
      detail: s.duty === 'blockade' ? 'Ships bound for our port are being turned back.' : 'A reminder of who is watching.', placeId: s.sectorId, houseIds: [s.houseId],
    });
    if (w.ports) w.ports.alerts += 1;
  }
}

function payUpkeep(w: World, s: CapitalShip) {
  const cost = upkeepOf(s);
  const e = econ(w, s.houseId);
  if (e.stock.othes >= cost) {
    record(w, s.houseId, { resource: 'othes', amount: -cost, label: `Upkeep: the ${s.name}`, kind: 'stipend' });
    s.unpaid = 0;
  } else {
    s.unpaid = (s.unpaid ?? 0) + 1;
    s.crewMood = clamp(s.crewMood - 10, 0, 100);
    if (s.houseId === w.playerHouseId) logRecord(w, { kind: 'world', type: 'economy', severity: 2, text: `The crew of the ${s.name} went unpaid this Phase.`, effects: ['Crew mood −10'] });
  }
}

function crewLife(w: World, rng: Rng, s: CapitalShip) {
  const cap = s.captainId ? w.characters[s.captainId] : undefined;
  if (s.captainId && !cap?.alive) s.captainId = null;
  let d = (cap?.alive ? (cap.stats.leadership - 10) / 4 : -2) + rng.gauss();
  if (s.duty === 'harbour' && !s.arrives) {
    d -= 0.8;
    const yard = Object.values(w.holdings?.modules ?? {}).some((m) => m.kind === 'shipyard' && m.sectorId === s.sectorId && m.houseId === s.houseId && m.level > 0);
    s.condition = clamp(s.condition + (yard ? 8 : 4), 0, 100);
    // New hands sign on at home.
    s.crew = Math.min(CAPITAL_CLASSES[s.cls].crew, s.crew + Math.round(CAPITAL_CLASSES[s.cls].crew * 0.05));
  }
  else if (s.duty === 'escort' && !s.arrives) s.condition = clamp(s.condition + 2, 0, 100); // refits at home between runs
  else s.condition = clamp(s.condition - 0.6, 0, 100);
  if (s.duty === 'escort') d += 0.5;
  const out = s.deployed ? (absoluteCycle(w.date) - absoluteCycle(s.deployed)) / CYCLES_PER_ORBIT : 0;
  // Escorts come home between runs; it is the long stations away that wear a crew down.
  if (out > 2 && s.duty !== 'escort') d -= (out - 2);
  // Pulled toward a middling mood.
  d += (55 - s.crewMood) * 0.05;
  s.crewMood = clamp(Math.round((s.crewMood + d) * 10) / 10, 0, 100);
  if (s.crewMood < 25 && rng.chance((25 - s.crewMood) / 60)) mutiny(w, rng, s);
}

function mutiny(w: World, rng: Rng, s: CapitalShip) {
  const P = w.playerHouseId;
  const cap = s.captainId ? w.characters[s.captainId] : undefined;
  const st = w.houses[s.houseId]!.standing;
  const roll = rng.next() + (cap ? (cap.stats.leadership + cap.stats.valor - 20) / 40 : 0);
  if (roll > 0.55) {
    // Desertion: a third of the crew walk off at the next port.
    const lost = Math.round(s.crew * 0.3);
    s.crew -= lost;
    s.crewMood = 40;
    if (s.duty !== 'harbour') dutyInPlace(w, s, 'harbour');
    if (s.houseId === P) logRecord(w, { kind: 'world', type: 'condition', severity: 2, text: `${fmt(lost)} of the ${s.name}'s crew have deserted.`, detail: 'The ones who stayed are calmer for it. The ship fights weaker until it is crewed again.', who: cap ? [{ id: cap.id, part: 'captain' }] : [], effects: [`Crew −${fmt(lost)}`] });
  } else if (roll > 0.2) {
    // The crew put the captain ashore and send demands.
    if (cap) { cap.flags = cap.flags.filter((f) => f.id !== 'aboard'); shiftMood(cap, -15); }
    s.captainId = null;
    s.crewMood = 45;
    if (s.duty !== 'harbour') dutyInPlace(w, s, 'harbour');
    st.respect = clamp(st.respect - 3, 0, 100);
    if (s.houseId === P) logRecord(w, { kind: 'world', type: 'condition', severity: 3, text: `Mutiny on the ${s.name}: the crew have put ${cap ? displayName(cap.name) : 'their officers'} ashore and refuse to sail until they are paid and heard.`, detail: 'Name a new captain they can stomach, keep them paid, and bring the ship home.', who: cap ? [{ id: cap.id, part: 'put ashore' }] : [], effects: ['Respect −3', 'No captain'] });
  } else {
    // The ship is gone: turned corsair.
    s.lost = { date: w.date, how: 'mutiny: turned corsair' };
    st.respect = clamp(st.respect - 8, 0, 100);
    st.dread = clamp(st.dread - 4, 0, 100);
    if (cap?.alive) {
      if (rng.chance(0.5)) kill(w, cap, w.date, `killed by mutineers aboard the ${s.name}`);
      else { cap.flags = cap.flags.filter((f) => f.id !== 'aboard'); shiftMood(cap, -25); }
    }
    for (const r of w.ports?.raids ?? []) if (r.status === 'brewing') r.strength += Math.round(CAPITAL_CLASSES[s.cls].power * 0.8);
    if (s.houseId === P) logRecord(w, { kind: 'world', type: 'condition', severity: 3, text: `The ${s.name} is lost. Her crew rose, ${cap ? `${cap.alive ? 'threw ' + displayName(cap.name) + ' into a lifeboat' : 'killed ' + displayName(cap.name)}` : 'took the ship'}, and ran for the dark between the worlds. She sails with the corsairs now.`, who: cap ? [{ id: cap.id, part: cap.alive ? 'set adrift' : 'killed' }] : [], effects: ['Ship lost', 'Respect −8', 'Dread −4', 'Corsairs stronger'] });
    else logRecord(w, { kind: 'world', type: 'world', severity: 2, text: `Word from the Exchange: ${H(w, s.houseId)} has lost the ${s.name} to mutiny. She has gone corsair.`, houseIds: [s.houseId], source: 'talk at the Exchange' });
  }
}

function onStation(w: World, rng: Rng, s: CapitalShip) {
  if (s.arrives) return;
  const P = w.playerHouseId;
  const them = s.target;
  if (s.duty === 'show' && them && w.houses[them]) {
    const friends = relation(w, them, s.houseId) > 30;
    shiftRelation(w, them, s.houseId, friends ? 1 : -3);
    const st = w.houses[s.houseId]!.standing;
    st.dread = clamp(st.dread + (friends ? 0 : 1), 0, 100);
    if (friends) st.respect = clamp(st.respect + 1, 0, 100);
  }
  if (s.duty === 'blockade' && them && w.houses[them]) {
    shiftRelation(w, them, s.houseId, -6);
    for (const o of Object.keys(w.houses)) if (o !== them && o !== s.houseId) shiftRelation(w, o, s.houseId, -1);
    const loss = Math.round(500 + rng.next() * 700);
    const e = econ(w, them);
    const took = Math.min(loss, e.stock.othes);
    record(w, them, { resource: 'othes', amount: -took, label: `Trade lost to the blockade by ${H(w, s.houseId)}`, kind: 'port' });
    w.houses[s.houseId]!.standing.dread = clamp(w.houses[s.houseId]!.standing.dread + 2, 0, 100);
    w.houses[s.houseId]!.standing.honour = clamp(w.houses[s.houseId]!.standing.honour - 1, 0, 100);
    // Their great ships may come out to test us. War is not declared; this is a standoff, and sometimes shots.
    const theirs = shipsAt(w, s.sectorId).filter((x) => x.houseId === them && x.condition > 50);
    const key = `standoff:${s.id}`;
    const last = (w.holdings?.cooldown ?? {})[key];
    if (theirs.length && (!last || absoluteCycle(w.date) - absoluteCycle(last) >= CYCLES_PER_ORBIT) && rng.chance(0.35)) {
      if (w.holdings) (w.holdings.cooldown ??= {})[key] = w.date;
      standoff(w, rng, s, theirs[0]!);
    }
    if (them === P || s.houseId === P) {
      if (rng.chance(0.3)) logRecord(w, { kind: 'world', type: 'economy', severity: 1, text: `The blockade of ${H(w, them)}'s port holds. ${fmt(took)} othes of trade turned away this Phase.`, houseIds: [s.houseId, them], placeId: s.sectorId });
    }
  }
  if (s.duty === 'escort') {
    const gain = Math.round(300 + rng.next() * 400);
    record(w, s.houseId, { resource: 'othes', amount: gain, label: `Convoy fees: the ${s.name}`, kind: 'port' });
  }
}

/** Two great ships face each other at a blockade. */
function standoff(w: World, rng: Rng, a: CapitalShip, b: CapitalShip) {
  const P = w.playerHouseId;
  const pa = powerOf(w, a) + rng.gauss() * 6;
  const pb = powerOf(w, b) + rng.gauss() * 6;
  const shots = rng.chance(0.4);
  const where = findSector(w, a.sectorId);
  const loser = pa >= pb ? b : a;
  const winner = loser === a ? b : a;
  if (shots) {
    loser.condition = clamp(loser.condition - (10 + rng.next() * 20), 0, 100);
    winner.condition = clamp(winner.condition - rng.next() * 8, 0, 100);
    winner.crewMood = clamp(winner.crewMood + 8, 0, 100);
    if (winner.captainId) { addGlory(w, winner.captainId, 2); tally(w, winner.captainId, 'standoffsWon'); }
    loser.crewMood = clamp(loser.crewMood - 6, 0, 100);
    w.houses[winner.houseId]!.standing.dread = clamp(w.houses[winner.houseId]!.standing.dread + 3, 0, 100);
    shiftRelation(w, loser.houseId, winner.houseId, -10);
    const wc = winner.captainId ? w.characters[winner.captainId] : undefined;
    const lc = loser.captainId ? w.characters[loser.captainId] : undefined;
    if (wc && lc) shiftOpinion(w, lc.id, wc.id, -30, `outfought them at ${where?.sector.name}`);
    if (loser === a && a.duty === 'blockade') { dutyInPlace(w, a, 'harbour'); }
    if (a.houseId === P || b.houseId === P) logRecord(w, {
      kind: 'world', type: 'fight', severity: 3,
      text: `Shots exchanged over ${where?.planet.name}: the ${winner.name} and the ${loser.name}. The ${loser.name} came off worse${loser === a ? ' and broke the blockade off' : ' and was driven back to her moorings'}.`,
      detail: 'No war has been declared. The Numarade will hear of this.',
      who: [...(wc ? [{ id: wc.id, part: `captain of the ${winner.name}` }] : []), ...(lc ? [{ id: lc.id, part: `captain of the ${loser.name}` }] : [])],
      houseIds: [a.houseId, b.houseId], placeId: where?.sector.id,
      effects: [`${loser.name} damaged`, `${H(w, winner.houseId)} dread +3`, `${H(w, loser.houseId)} regard −10`],
    });
  } else if (a.houseId === P || b.houseId === P) {
    logRecord(w, { kind: 'world', type: 'world', severity: 1, text: `The ${b.name} came out to face the ${a.name}. Guns were run out; neither fired. They hold their stations.`, houseIds: [a.houseId, b.houseId], placeId: a.sectorId });
  }
}

/** Rival houses send their ships about: mostly home, sometimes to make a point. */
function aiFleet(w: World, rng: Rng) {
  const P = w.playerHouseId;
  for (const s of Object.values(w.fleet.ships)) {
    if (s.houseId === P || s.lost || s.ready || s.arrives || s.crucible) continue;
    const h = w.houses[s.houseId]!;
    if (!s.captainId) { const c = bestCaptain(w, s.houseId, new Set(Object.values(w.fleet.ships).map((x) => x.captainId ?? ''))); if (c) { s.captainId = c.id; aboard(w, s); } }
    const out = s.deployed ? (absoluteCycle(w.date) - absoluteCycle(s.deployed)) / CYCLES_PER_ORBIT : 0;
    if (s.duty !== 'harbour' && (out > 1.5 || s.condition < 45 || s.crewMood < 35)) { dutyInPlace(w, s, 'harbour'); continue; }
    if (s.duty !== 'harbour' || !rng.chance(0.12)) continue;
    const enemies = Object.keys(w.houses).filter((o) => o !== h.id && relation(w, h.id, o) < -10);
    const r = rng.next();
    if (enemies.length && r < h.personality.aggression * 0.5) {
      const t = rng.pick(enemies);
      dutyInPlace(w, s, relation(w, h.id, t) < -55 && rng.chance(0.4) ? 'blockade' : 'show', t);
    } else if (r < 0.6) dutyInPlace(w, s, 'patrol', capitalSector(w, h.id));
    else dutyInPlace(w, s, 'escort');
  }
  // Rich houses lay down new ships now and then.
  for (const h of Object.values(w.houses)) {
    if (h.id === P) continue;
    const e = econ(w, h.id);
    const n = shipsOf(w, h.id).length;
    if (n >= (h.tier === 'great' ? 3 : 2) || e.stock.othes < 30000 || !rng.chance(0.15)) continue;
    const cls: CapitalClass = h.tier === 'great' ? 'battlecruiser' : 'cruiser';
    e.stock.othes -= CAPITAL_CLASSES[cls].cost;
    const id = `cs${w.nextId++}`;
    w.fleet.ships[id] = { id, houseId: h.id, name: shipName(w, rng, h.id), cls, captainId: null, crew: CAPITAL_CLASSES[cls].crew, crewMood: 60, condition: 100, sectorId: capitalSector(w, h.id), duty: 'harbour', built: w.date, ready: addCycles(w.date, CYCLES_PER_ORBIT * 2) };
    logRecord(w, { kind: 'world', type: 'world', severity: 1, text: `${H(w, h.id)} is building a new ${cls}.`, houseIds: [h.id], source: 'shipyard talk' });
  }
}

export function advanceFleet(world: World, rng: Rng, phaseTurned: boolean): void {
  ensureFleet(world);
  const now = absoluteCycle(world.date);
  for (const s of Object.values(world.fleet.ships)) {
    if (s.lost) continue;
    if (s.ready && absoluteCycle(s.ready) <= now) {
      delete s.ready;
      if (s.houseId === world.playerHouseId) logRecord(world, { kind: 'world', type: 'world', severity: 2, text: `The ${s.name} is launched and ready for a captain.`, placeId: s.sectorId });
    }
    if (s.arrives && absoluteCycle(s.arrives) <= now) arrive(world, s);
  }
  if (!phaseTurned) return;
  for (const s of Object.values(world.fleet.ships)) {
    if (s.lost || s.ready) continue;
    payUpkeep(world, s);
    crewLife(world, rng, s);
    if (!s.lost) onStation(world, rng, s);
  }
  aiFleet(world, rng);
}

