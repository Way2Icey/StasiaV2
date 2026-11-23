// Ports: the ships that come and go through the player's worlds. Every ship
// comes from something the world is doing (trade, a rival's mission, a
// smuggler's run, raiders scouting a target) and the house sees only what its
// harbourmaster, customs and agents find out.
import { meet } from './relationships';
import { raidOdds } from './lanes';
import { noticeYouth } from './prospects';
import { baseStrength, imprison, listeningOn } from './holdings';
import { fleetDefence } from './fleet';
import { tally } from './careers';
import { Rng } from './rng';
import { buildWord, displayName, shortName } from './names';
import { CULTURES } from '../data/cultures';
import {
  CRATE_TEXT, PASSENGER_ROLES, SHIP_ADJECTIVES, SHIP_CLASSES, SHIP_NOUNS,
  type CrateContents, type ShipClass,
} from '../data/ships';
import { BASE_PRICE, type Good } from '../data/economy';
import { econ, heldSectors, record } from './economy';
import { findSector, seatHolder } from './query';
import { learn } from './knowledge';
import { relation, shiftRelation } from './relations';
import { agentsOf } from './household';
import { isAway } from './court';
import { shiftMood } from './mood';
import { ageOf } from './characters';
import { SPECIES } from '../data/species';
import { absoluteCycle, addCycles, CYCLES_PER_PHASE, formatDate, type GameDate } from './time';
import type { Character, FeedEntry, Sector, SpeciesId, World } from './types';
import { logRecord } from './records';

// ---------------------------------------------------------------- shapes

export type ShipStatus = 'inbound' | 'docked' | 'held' | 'departed';
export type Purpose = 'trade' | 'passengers' | 'courier' | 'smuggling' | 'spy' | 'scout' | 'mission' | 'envoy' | 'warship' | 'travel';
export type InspectPolicy = 'none' | 'unflagged' | 'rivals' | 'all';
export type Papers = 'ok' | 'none' | 'forged';

export interface CargoLine {
  label: string;
  good?: Good;
  qty: number;
  /** Not on the manifest. */
  hidden?: boolean;
  /** Customs have found it. */
  found?: boolean;
  crate?: CrateContents;
  opened?: boolean;
}

export interface Aboard {
  name: string;
  species: SpeciesId;
  role: string;
  papers: Papers;
  /** A real person of the world, when it is one. */
  characterId?: string;
  /** Who they really are, if not what they say. */
  truth?: 'spy' | 'scout' | 'runaway';
  houseId?: string;
  revealed?: boolean;
  /** Customs found something wrong with their papers. */
  suspect?: boolean;
  arrested?: boolean;
}

export interface Ship {
  id: string;
  name: string;
  cls: ShipClass;
  /** A house id, 'neutral' or 'none'. */
  flag: string;
  registry: string;
  age: number;
  captain: string;
  crew: number;
  passengers: number;
  from: string;
  to: string;
  sectorId: string;
  status: ShipStatus;
  berth?: number;
  arrives: GameDate;
  departs?: GameDate;
  /** What the ship is really doing. */
  purpose: Purpose;
  /** What it says it is doing. */
  declared: string;
  cargo: CargoLine[];
  aboard: Aboard[];
  transponderGap?: boolean;
  forgedRegistry?: boolean;
  inspected?: boolean;
  agentChecked?: boolean;
  fined?: boolean;
  captainJailed?: boolean;
  /** What our people have found, in order. */
  notes: string[];
  missionId?: string;
  raidId?: string;
  /** Ours, leaving: shown on the board but never inspected. */
  ours?: boolean;
  /** Its entry in the register, once it has one. */
  regId?: string;
}

/** How suspicious a ship or captain is, from the register. */
export type Grade = 0 | 1 | 2 | 3 | 4;
export const GRADE_LABEL = ['clean', 'noted', 'suspect', 'wanted', 'banned'] as const;

export interface Incident { date: GameDate; sectorId: string; shipName: string; text: string; grade: Grade }

export interface RegEntry {
  id: string;
  registry: string;
  captain: string;
  ships: string[];
  incidents: Incident[];
  banned?: boolean;
  lastSeen: GameDate;
}

/** One of our agents watching a rival port. */
export interface Post { agentId: string; sectorId: string; since: GameDate }

export interface PortTally { byFlag: Record<string, number>; ships: number; tariffs: number }

export interface PortState {
  sectorId: string;
  /** Percent of declared cargo value. */
  tariff: number;
  inspect: InspectPolicy;
  closed: boolean;
  tally: PortTally;
  last: PortTally;
  /** The house that holds the port. */
  owner?: string;
}

export interface Raid {
  id: string;
  sectorId: string;
  strength: number;
  status: 'brewing' | 'revealed' | 'over';
  revealAt: GameDate;
  arrives: GameDate;
  /** Strength known exactly (a scout talked). */
  known: boolean;
  answer?: 'muster' | 'tribute';
  result?: string;
}

export interface PortsState {
  ships: Record<string, Ship>;
  ports: Record<string, PortState>;
  /** People the house wants to hear about the moment they dock. */
  watch: string[];
  raids: Raid[];
  /** Counts things worth stopping the clock for. */
  alerts: number;
  /** Newest first: what happened at our ports. */
  log: { date: GameDate; text: string; shipId?: string; sectorId?: string }[];
  /** Every ship and captain customs have had cause to note. */
  register: Record<string, RegEntry>;
  /** Our agents posted at rival ports. */
  posts: Record<string, Post>;
}

export const PLACE_LABEL: Record<string, string> = { exchange: 'the Imperial Exchange', outer: 'the outer lanes' };

export function placeLabel(world: World, id: string): string {
  return world.planets[id]?.name ?? PLACE_LABEL[id] ?? id;
}

export function flagLabel(world: World, flag: string): string {
  if (flag === 'neutral') return 'neutral';
  if (flag === 'none') return 'none';
  return world.houses[flag]?.name ?? flag;
}

const emptyTally = (): PortTally => ({ byFlag: {}, ships: 0, tariffs: 0 });

// ---------------------------------------------------------------- setup

export function portSectors(world: World, houseId = world.playerHouseId): Sector[] {
  return heldSectors(world, houseId).filter((s) => s.port !== 'none');
}

export function ensurePorts(world: World): void {
  world.ports ??= { ships: {}, ports: {}, watch: [], raids: [], alerts: 0, log: [], register: {}, posts: {} };
  world.ports.log ??= [];
  world.ports.register ??= {};
  world.ports.posts ??= {};
  const P = world.playerHouseId;
  for (const s of portSectors(world)) {
    world.ports.ports[s.id] ??= { sectorId: s.id, tariff: 4, inspect: 'unflagged', closed: false, tally: emptyTally(), last: emptyTally() };
    world.ports.ports[s.id]!.owner = P;
  }
  for (const post of Object.values(world.ports.posts)) {
    const f = findSector(world, post.sectorId);
    if (!f) continue;
    world.ports.ports[post.sectorId] ??= { sectorId: post.sectorId, tariff: 4, inspect: 'unflagged', closed: false, tally: emptyTally(), last: emptyTally() };
    world.ports.ports[post.sectorId]!.owner = f.planet.houseId;
  }
}

/** Is this one of our own ports (as against a rival's we watch)? */
export function isOurs(world: World, sectorId: string): boolean {
  const o = world.ports?.ports[sectorId]?.owner;
  return !o || o === world.playerHouseId;
}

/** Who watches a rival port for us. */
export function postAt(world: World, sectorId: string): Post | undefined {
  return Object.values(world.ports?.posts ?? {}).find((p) => p.sectorId === sectorId);
}

// ---------------------------------------------------------------- the register

export function gradeOf(e: RegEntry | undefined): Grade {
  if (!e) return 0;
  if (e.banned) return 4;
  return e.incidents.reduce((g, i) => (i.grade > g ? i.grade : g), 0 as Grade);
}

export function entryFor(world: World, ship: Ship): RegEntry | undefined {
  const reg = world.ports.register;
  if (ship.regId && reg[ship.regId]) return reg[ship.regId];
  return Object.values(reg).find((e) => e.registry === ship.registry || e.captain === ship.captain);
}

/** Write something customs did or found into the register and the port log. */
export function logIncident(world: World, ship: Ship, text: string, grade: Grade): RegEntry {
  let e = entryFor(world, ship);
  if (!e) {
    e = { id: `g${world.nextId++}`, registry: ship.registry, captain: ship.captain, ships: [], incidents: [], lastSeen: world.date };
    world.ports.register[e.id] = e;
  }
  ship.regId = e.id;
  if (!e.ships.includes(ship.name)) e.ships.push(ship.name);
  e.registry = ship.registry;
  e.lastSeen = world.date;
  e.incidents.unshift({ date: world.date, sectorId: ship.sectorId, shipName: ship.name, text, grade });
  e.incidents = e.incidents.slice(0, 20);
  return e;
}

/** The house's busiest port: where missions leave from and envoys land. */
export function mainPort(world: World): Sector | undefined {
  const rank = { starport: 3, spaceport: 2, 'landing field': 1, none: 0 } as const;
  return [...portSectors(world)].sort((a, b) => rank[b.port] - rank[a.port])[0];
}

/** Whoever runs the port: the overseer of its trade quarter, or the Steward. */
export function harbourmaster(world: World, sectorId: string): Character | undefined {
  const s = findSector(world, sectorId)?.sector;
  const q = s?.quarters.find((x) => x.overseerId && x.kind === 'Trade') ?? s?.quarters.find((x) => x.overseerId);
  const c = q?.overseerId ? world.characters[q.overseerId] : undefined;
  return c?.alive ? c : seatHolder(world, findSector(world, sectorId)?.planet.houseId ?? world.playerHouseId, 'steward');
}

/** How good customs are at this port, as a check value (about 6 to 16). */
export function customsSkill(world: World, sectorId: string): number {
  const h = harbourmaster(world, sectorId);
  const base = h ? (h.stats.perception + h.stats.stewardship + h.stats.law) / 3 : 6;
  const s = findSector(world, sectorId)?.sector;
  return base + (s?.port === 'starport' ? 2 : s?.port === 'spaceport' ? 1 : 0);
}

export const BERTHS: Record<Sector['port'], number> = { starport: 12, spaceport: 6, 'landing field': 3, none: 0 };
const ARRIVALS: Record<Sector['port'], number> = { starport: 0.75, spaceport: 0.35, 'landing field': 0.15, none: 0 };

// ---------------------------------------------------------------- making ships

function personName(rng: Rng, species: SpeciesId): string {
  const c = CULTURES[species];
  return `${buildWord(rng, c.given)} ${rng.pick(c.familyNames)}`;
}

function shipName(rng: Rng, captain: string): string {
  if (rng.chance(0.15)) return `${captain.split(' ')[0]}'s ${rng.pick(['Folly', 'Luck', 'Pride', 'Due', 'Errand', 'Wager'])}`;
  return `${rng.pick(SHIP_ADJECTIVES)} ${rng.pick(SHIP_NOUNS)}`;
}

function between(rng: Rng, [a, b]: [number, number]): number {
  return a + Math.floor(rng.next() * (b - a + 1));
}

const SPECIES_OF: Record<string, SpeciesId> = { alerion: 'fokari', serath: 'serathi', torvann: 'torvann', shaaliin: 'shaaliin' };

function houseSpecies(world: World, houseId: string, rng: Rng): SpeciesId {
  const cap = world.planets[world.houses[houseId]?.capitalPlanetId ?? '']?.sectors[0];
  if (cap && rng.chance(0.6)) return rng.weighted(Object.entries(cap.peoples) as [SpeciesId, number][]);
  return SPECIES_OF[houseId] ?? rng.pick(['fokari', 'thessari', 'torvann', 'serathi', 'shaaliin', 'doven', 'gholari'] as SpeciesId[]);
}

function registry(rng: Rng, from: string): string {
  const pre = from === 'exchange' ? 'IX' : from === 'outer' ? 'OL' : from.slice(0, 2).toUpperCase();
  return `${pre}-${String(between(rng, [100, 9999])).padStart(4, '0')}-${'ABCDEFGHJKLMNPQRSTUVWXYZ'[between(rng, [0, 23])]}`;
}

function newShip(world: World, rng: Rng, sector: Sector, purpose: Purpose, opts: Partial<Ship> = {}): Ship {
  const P = world.playerHouseId;
  const rivals = Object.keys(world.houses).filter((h) => h !== P);
  const here = findSector(world, sector.id)?.planet.id;
  const origins = [...Object.values(world.houses).map((h) => h.capitalPlanetId).filter((id) => id !== here), 'exchange', 'exchange', 'outer'];
  const from = opts.from ?? rng.pick(origins);
  const fromHouse = Object.values(world.houses).find((h) => h.capitalPlanetId === from)?.id;
  const cls: ShipClass = opts.cls ?? (
    purpose === 'trade' ? rng.pick(['bulk hauler', 'freighter', 'freighter', 'grain barge'] as ShipClass[])
      : purpose === 'passengers' ? 'liner'
        : purpose === 'courier' || purpose === 'envoy' ? rng.pick(['courier', 'yacht'] as ShipClass[])
          : purpose === 'mission' ? 'frigate'
            : rng.pick(['tramp freighter', 'small craft', 'tramp freighter'] as ShipClass[])
  );
  const def = SHIP_CLASSES[cls];
  const sp = fromHouse ? houseSpecies(world, fromHouse, rng) : rng.pick(['doven', 'gholari', 'fokari', 'thessari', 'serathi'] as SpeciesId[]);
  const captain = personName(rng, sp);
  const crooked = purpose === 'smuggling' || purpose === 'spy' || purpose === 'scout';
  const flag = opts.flag ?? (crooked
    ? (rng.chance(0.5) ? 'none' : rng.chance(0.5) ? 'neutral' : rng.pick(rivals))
    : fromHouse && rng.chance(0.65) ? fromHouse : 'neutral');
  const now = world.date;
  const ship: Ship = {
    id: `s${world.nextId++}`,
    name: shipName(rng, captain),
    cls, flag,
    registry: registry(rng, crooked && rng.chance(0.5) ? rng.pick(origins) : from),
    age: between(rng, [2, crooked ? 45 : 30]),
    captain,
    crew: between(rng, def.crew),
    passengers: between(rng, def.berths),
    from,
    to: rng.pick(origins),
    sectorId: sector.id,
    status: 'inbound',
    arrives: addCycles(now, between(rng, [1, 4])),
    purpose,
    declared: 'trade',
    cargo: [],
    aboard: [],
    notes: [],
    ...opts,
  };
  if (crooked) {
    ship.forgedRegistry = rng.chance(0.6);
    ship.transponderGap = rng.chance(0.5);
  }
  return ship;
}

function addGoods(rng: Rng, ship: Ship, hidden = false) {
  const def = SHIP_CLASSES[ship.cls];
  const qty = between(rng, def.hold);
  if (!qty) return;
  const good: Good = ship.cls === 'grain barge' ? 'provisions' : rng.pick(['metals', 'metals', 'provisions', 'fuel', 'components', 'navisium'] as Good[]);
  const scaled = good === 'navisium' || good === 'components' ? Math.max(5, Math.round(qty / 8)) : qty;
  ship.cargo.push({ label: good, good, qty: scaled, hidden });
}

function addPassengers(world: World, rng: Rng, ship: Ship, n: number) {
  for (let i = 0; i < n; i++) {
    const sp = rng.pick(['fokari', 'thessari', 'torvann', 'serathi', 'shaaliin', 'doven', 'gholari'] as SpeciesId[]);
    ship.aboard.push({ name: personName(rng, sp), species: sp, role: rng.pick(PASSENGER_ROLES), papers: rng.chance(0.93) ? 'ok' : 'none' });
  }
  void world;
}

function declaredOf(ship: Ship): string {
  const shown = ship.cargo.filter((c) => !c.hidden);
  if (ship.purpose === 'envoy' || ship.purpose === 'courier') return 'diplomatic';
  if (ship.cls === 'liner') return `passengers ×${ship.passengers}`;
  if (!shown.length) return ship.purpose === 'smuggling' ? 'salvage' : 'private';
  return shown.map((c) => `${c.label} ×${c.qty}`).join(', ');
}

/** A real person of note, free to travel: not at war, not captive, not busy. */
function freeNotable(world: World, rng: Rng, houseIds: string[]): Character | undefined {
  const busy = new Set(Object.values(world.ports.ships).filter((s) => s.status !== 'departed').flatMap((s) => s.aboard.map((a) => a.characterId)));
  const pool = Object.values(world.characters).filter((c) => c.alive && houseIds.includes(c.houseId) && c.tier === 'full' && !c.seat
    && !isAway(world, c.id) && !world.captives?.[c.id] && !busy.has(c.id) && ageOf(c, world.date) >= SPECIES[c.species].adulthood);
  return pool.length ? rng.pick(pool) : undefined;
}

const WARSHIP_PREFIX: Record<string, string> = { alerion: 'ASV', serath: 'SRV', torvann: 'TWS', shaaliin: 'LSV' };

/** A ship of some ordinary sort, arriving at a port (ours, or a rival's we watch). */
function arrival(world: World, rng: Rng, sector: Sector): Ship {
  const P = world.playerHouseId;
  const owner = world.ports.ports[sector.id]?.owner ?? P;
  const ours = owner === P;
  const brewing = world.ports.raids.find((r) => r.status === 'brewing');
  const rivals = Object.keys(world.houses).filter((h) => h !== P);
  const cold = rivals.filter((h) => relation(world, h, P) < 10);
  const weights: [Purpose, number][] = [
    ['trade', 55], ['passengers', sector.port === 'starport' ? 12 : 4], ['courier', 8],
    ['smuggling', sector.port === 'starport' ? 12 : 8], ['spy', ours ? (cold.length ? 4 : 1) : 0], ['scout', ours && brewing ? 10 : 0],
    ['warship', ours ? 4 : 8],
  ];
  const purpose = rng.weighted(weights);
  // Known offenders come back, sometimes under a new name.
  const offenders = Object.values(world.ports.register).filter((e) => gradeOf(e) >= 1);
  const repeat = ours && purpose === 'smuggling' && offenders.length && rng.chance(0.4) ? rng.pick(offenders) : undefined;
  const ship = newShip(world, rng, sector, purpose, repeat ? {
    captain: repeat.captain,
    ...(rng.chance(0.4) ? { registry: repeat.registry } : {}),
    ...(rng.chance(0.5) ? { name: repeat.ships.at(-1) ?? undefined } : {}),
  } : {});
  if (!ship.name) ship.name = shipName(rng, ship.captain);
  switch (purpose) {
    case 'trade':
      addGoods(rng, ship);
      if (rng.chance(0.12)) addGoods(rng, ship, true); // a little on the side
      addPassengers(world, rng, ship, Math.min(2, ship.passengers));
      break;
    case 'passengers':
    case 'courier': {
      addPassengers(world, rng, ship, purpose === 'courier' ? 1 : 3);
      // People of note travel too, and some of them are worth watching for.
      if (rng.chance(purpose === 'courier' ? 0.5 : 0.35)) {
        const who = freeNotable(world, rng, Object.keys(world.houses).filter((h) => h !== owner));
        if (who) ship.aboard.unshift({ name: displayName(who.name), species: who.species, role: rng.pick(['visitor', 'pilgrim', 'factor', 'guest of the court']), papers: 'ok', characterId: who.id, houseId: who.houseId });
      }
      break;
    }
    case 'smuggling': {
      ship.cargo.push({ label: 'hull plate', qty: between(rng, [20, 60]) });
      ship.cargo.push({ label: 'components', good: 'components', qty: between(rng, [8, 30]), hidden: true });
      if (rng.chance(0.6)) ship.cargo.push({ label: 'sealed crate', qty: 1, hidden: true, crate: rng.weighted<CrateContents>([['weapons', brewing ? 4 : 1], ['godglass', 3], ['luxuries', 4], ['nothing', 2], ['stolen relics', 1]]) });
      addPassengers(world, rng, ship, 1);
      if (rng.chance(0.25)) {
        const sp = rng.pick(['serathi', 'fokari', 'doven'] as SpeciesId[]);
        ship.aboard.push({ name: `"${buildWord(rng, CULTURES[sp].given)}"`, species: sp, role: 'deckhand', papers: 'none', truth: 'runaway', houseId: rng.pick(rivals) });
      }
      break;
    }
    case 'spy': {
      const house = rng.pick(cold.length ? cold : rivals);
      const agent = freeNotable(world, rng, [house]);
      addGoods(rng, ship);
      if (agent) {
        ship.aboard.push({ name: displayName(agent.name), species: agent.species, role: rng.pick(['merchant', 'factor', 'pilgrim', 'deckhand']), papers: 'forged', characterId: agent.id, truth: 'spy', houseId: house });
      }
      addPassengers(world, rng, ship, 1);
      break;
    }
    case 'scout': {
      ship.cargo.push({ label: 'salvage', qty: between(rng, [5, 20]) });
      const sp = rng.pick(['thessari', 'torvann', 'doven'] as SpeciesId[]);
      ship.aboard.push({ name: personName(rng, sp), species: sp, role: rng.pick(['mercenary', 'surveyor', 'deckhand']), papers: rng.chance(0.5) ? 'forged' : 'none', truth: 'scout' });
      ship.raidId = brewing?.id;
      ship.from = 'outer';
      break;
    }
    case 'warship': {
      const house = rng.chance(ours ? 0.45 : 0.6) ? owner : rng.pick(Object.keys(world.houses));
      ship.flag = house;
      ship.cls = 'frigate';
      ship.crew = between(rng, SHIP_CLASSES.frigate.crew);
      ship.passengers = 0;
      ship.name = `${WARSHIP_PREFIX[house] ?? 'HSV'} ${rng.pick(SHIP_ADJECTIVES)} ${rng.pick(SHIP_NOUNS)}`;
      ship.from = world.houses[house]!.capitalPlanetId;
      ship.to = rng.pick(Object.values(world.houses).map((h) => h.capitalPlanetId));
      ship.registry = `${(WARSHIP_PREFIX[house] ?? 'HSV').slice(0, 2)}-WAR-${between(rng, [10, 99])}`;
      ship.forgedRegistry = false; ship.transponderGap = false;
      ship.ours = house === P;
      const officer = freeNotable(world, rng, [house]);
      if (officer && officer.role === 'Knight' && house !== P) ship.aboard.push({ name: displayName(officer.name), species: officer.species, role: 'officer', papers: 'ok', characterId: officer.id, houseId: house });
      ship.declared = rng.pick(['patrol', 'escort duty', 'in transit', 'resupply']);
      return ship;
    }
    default: break;
  }
  ship.declared = declaredOf(ship);
  return ship;
}

// ---------------------------------------------------------------- the turn

function note(world: World, text: string, shipId?: string, sectorId?: string) {
  world.ports.log.unshift({ date: world.date, text, shipId, sectorId: sectorId ?? (shipId ? world.ports.ships[shipId]?.sectorId : undefined) });
  world.ports.log = world.ports.log.slice(0, 150);
}

function tell(world: World, kind: 'intrigue' | 'world' | 'council', text: string, characterIds?: string[], extra: Partial<FeedEntry> = {}) {
  logRecord(world, { kind, text, characterIds, source: 'the port authority', ...extra });
}

function contraband(ship: Ship): CargoLine[] {
  return ship.cargo.filter((c) => c.hidden);
}

/** Customs look a ship over. Returns what they found. */
export function inspectInPlace(world: World, rng: Rng, ship: Ship): string[] {
  const skill = customsSkill(world, ship.sectorId);
  const found: string[] = [];
  ship.inspected = true;
  for (const c of ship.cargo) {
    if (!c.hidden || c.found) continue;
    if (rng.chance(Math.min(0.92, 0.35 + (skill - 9) * 0.07))) { c.found = true; found.push(c.crate ? 'a sealed crate not on the manifest' : `${c.label} ×${c.qty}, undeclared`); }
  }
  for (const a of ship.aboard) {
    if (a.suspect) continue;
    if (a.papers === 'none') { a.suspect = true; found.push(`${a.name} has no papers`); continue; }
    if (a.papers === 'forged' && rng.chance(Math.min(0.8, 0.25 + (skill - 9) * 0.06))) { a.suspect = true; found.push(`${a.name}'s papers are forged`); }
  }
  if (ship.forgedRegistry && rng.chance(0.5)) found.push(`the registry ${ship.registry} does not check out`);
  if (!found.length) found.push('nothing out of order');
  ship.notes.push(`Inspected ${formatDate(world.date)}: ${found.join('; ')}.`);
  // Searching an honest house ship gives offence.
  if (!found.some((f) => f !== 'nothing out of order') && world.houses[ship.flag]) shiftRelation(world, ship.flag, world.playerHouseId, -1);
  return found;
}

/** How serious what customs found is, as a register grade. */
function severity(world: World, ship: Ship, prior: Grade): Grade {
  let g: Grade = 0;
  if (ship.transponderGap) g = 1;
  if (ship.inspected && ship.forgedRegistry) g = 1;
  if (ship.aboard.some((a) => a.suspect && a.papers === 'none')) g = Math.max(g, 1) as Grade;
  const found = contraband(ship).filter((c) => c.found);
  if (found.some((c) => !c.crate)) g = Math.max(g, 2) as Grade;
  if (found.some((c) => c.crate) || ship.aboard.some((a) => a.suspect && a.papers === 'forged') || ship.aboard.some((a) => a.revealed && a.truth)) g = 3;
  if (g >= 2 && prior >= 2) g = 3; // a repeat offence
  void world;
  return g;
}

function dock(world: World, rng: Rng, ship: Ship) {
  const port = world.ports.ports[ship.sectorId];
  const P = world.playerHouseId;
  const ours = isOurs(world, ship.sectorId);
  const sector = findSector(world, ship.sectorId)?.sector;
  const entry = ours && !ship.ours ? entryFor(world, ship) : undefined;
  const prior = gradeOf(entry);
  if (entry) ship.regId = entry.id;
  if (prior === 4) {
    ship.status = 'departed';
    ship.departs = world.date;
    ship.notes.push('Turned away: banned from our ports.');
    note(world, `${ship.name} (captain ${ship.captain}) turned away: banned.`, ship.id, ship.sectorId);
    return;
  }
  ship.status = 'docked';
  const used = new Set(Object.values(world.ports.ships).filter((s) => s.sectorId === ship.sectorId && (s.status === 'docked' || s.status === 'held')).map((s) => s.berth));
  const max = sector ? BERTHS[sector.port] : 3;
  let berth = 1;
  while (used.has(berth) && berth < max + 6) berth++;
  ship.berth = berth;
  ship.departs = addCycles(world.date, between(rng, [2, 6]));
  if (port) {
    port.tally.ships++;
    port.tally.byFlag[ship.flag] = (port.tally.byFlag[ship.flag] ?? 0) + 1;
  }
  if (port && ours) {
    const value = ship.cargo.filter((c) => !c.hidden && c.good).reduce((s, c) => s + c.qty * BASE_PRICE[c.good!], 0);
    // Ships give a house at war a wide berth: half the trade, half the tariffs.
    const shunned = (world.war?.wars ?? []).some((x) => x.status === 'active' && x.rung === 'war' && (x.attacker === P || x.defender === P || x.attackers.includes(P) || x.defenders.includes(P))) ? 0.5 : 1;
    const fee = Math.round(((value * port.tariff) / 100) * 0.7 * shunned) + (ship.cls === 'liner' ? ship.passengers * 2 : 0);
    if (fee > 0 && ship.purpose !== 'warship') {
      port.tally.tariffs += fee;
      record(world, P, { resource: 'othes', amount: fee, label: `Tariffs at ${sector?.name ?? 'port'}`, kind: 'port', sectorId: ship.sectorId });
    }
    // Standing orders, and anyone already on the register.
    const policy = port.inspect;
    const foreignWarship = ship.purpose === 'warship' && !ship.ours;
    const check = !ship.ours && !foreignWarship && (prior >= 2 || policy === 'all'
      || (policy === 'unflagged' && (ship.flag === 'none' || (ship.flag === 'neutral' && rng.chance(0.3))))
      || (policy === 'rivals' && ship.flag !== P && (ship.flag === 'none' || ship.flag === 'neutral' || relation(world, ship.flag, P) < 0)));
    if (check) {
      const found = inspectInPlace(world, rng, ship);
      const g = severity(world, ship, prior);
      const why = prior >= 2 ? ` (on the register as ${GRADE_LABEL[prior]})` : '';
      if (g >= 3) {
        ship.status = 'held';
        world.ports.alerts++;
        logIncident(world, ship, `Held: ${found.join('; ')}${why}.`, g);
        note(world, `${ship.name} held at berth ${ship.berth}: ${found.join('; ')}${why}.`, ship.id, ship.sectorId);
        tell(world, 'world', `Customs at ${sector?.name} held the ${ship.cls} ${ship.name}.`, undefined, {
          type: 'seizure', severity: 2, placeId: ship.sectorId, shipId: ship.id, detail: `${found.join('; ')}${why}.`,
          source: harbourmaster(world, ship.sectorId) ? `${displayName(harbourmaster(world, ship.sectorId)!.name)}, harbourmaster` : 'customs',
          who: harbourmaster(world, ship.sectorId) ? [{ id: harbourmaster(world, ship.sectorId)!.id, part: 'harbourmaster' }] : undefined,
        });
      } else if (g === 2) {
        logIncident(world, ship, `Searched: ${found.join('; ')}. Fined on the spot.`, g);
        fineInPlace(world, ship, true, true);
      } else if (g === 1) {
        logIncident(world, ship, `Searched: ${found.join('; ')}.`, 1);
        note(world, `${ship.name} searched: ${found.join('; ')}.`, ship.id, ship.sectorId);
      } else {
        if (entry) logIncident(world, ship, 'Searched: clean.', 0);
        note(world, `${ship.name} searched: clean.`, ship.id, ship.sectorId);
      }
    } else if (ship.transponderGap && !ship.ours) {
      logIncident(world, ship, 'Came in with its transponder dark.', 1);
    }
  } else if (port && !ours) {
    // A rival's customs, seen through our agent.
    if ((ship.flag === 'none' || ship.purpose === 'smuggling') && rng.chance(0.5)) {
      const hits = contraband(ship).filter(() => rng.chance(0.5));
      for (const c of hits) c.found = true;
      ship.inspected = true;
      const owner = world.houses[port.owner ?? '']?.name ?? 'their';
      if (hits.length) { ship.status = 'held'; ship.notes.push(`${owner} customs found ${hits.map((c) => c.label).join(', ')}.`); note(world, `${owner} customs held ${ship.name}.`, ship.id, ship.sectorId); }
      else ship.notes.push(`${owner} customs searched it and found nothing.`);
    }
  }
  // A spy who walks off the ship unseen at our port reports home.
  if (ours) for (const a of ship.aboard) {
    if (a.truth === 'spy' && a.houseId && !a.revealed && a.characterId) {
      for (const c of Object.values(world.characters)) if (c.alive && c.houseId === P && c.seat) learn(world, a.houseId, c.id, 4);
    }
  }
  // The watchlist, at our ports and any port we watch.
  for (const a of ship.aboard) {
    if (a.characterId && world.ports.watch.includes(a.characterId)) {
      world.ports.alerts++;
      note(world, `WATCH: ${a.name} came in on the ${ship.name} at ${sector?.name}.`, ship.id, ship.sectorId);
      tell(world, 'intrigue', `Watchlist: ${a.name} has docked at ${sector?.name} aboard the ${ship.name}, travelling as a ${a.role}.`, [a.characterId], {
        type: 'port', severity: 1, placeId: ship.sectorId, shipId: ship.id, who: [{ id: a.characterId, part: 'watched' }],
      });
    }
  }
}

function depart(world: World, ship: Ship) {
  ship.status = 'departed';
  ship.departs = world.date;
  const sector = findSector(world, ship.sectorId)?.sector;
  const missed = contraband(ship).filter((c) => !c.found);
  if (missed.length && sector) sector.unrest = Math.min(100, sector.unrest + 1); // the black market grows
  // A raider scout who got away takes our defences home.
  if (ship.raidId) {
    const raid = world.ports.raids.find((r) => r.id === ship.raidId);
    if (raid && raid.status === 'brewing' && ship.aboard.some((a) => a.truth === 'scout' && !a.arrested)) raid.strength = Math.round(raid.strength * 1.08);
  }
}

/** Ships for our own missions and for rivals' missions bound for our worlds. */
function missionShips(world: World, rng: Rng) {
  const P = world.playerHouseId;
  const home = mainPort(world);
  if (!home) return;
  const capital = world.houses[P]!.capitalPlanetId;
  const has = new Set(Object.values(world.ports.ships).map((s) => s.missionId).filter(Boolean));
  for (const m of Object.values(world.missions)) {
    if (m.stage === 'done' || has.has(m.id)) continue;
    if (m.houseId === P && m.stage === 'travel') {
      const lead = world.characters[m.leaderId];
      const ship = newShip(world, rng, home, 'mission', {
        flag: P, from: capital, to: m.targetPlanetId, cls: 'frigate', status: 'departed', arrives: world.date, departs: world.date, ours: true, missionId: m.id,
        captain: lead ? displayName(lead.name) : 'our people',
      });
      ship.declared = `our ${m.kind}`;
      ship.aboard = [m.leaderId, ...(m.companions ?? [])].map((id) => world.characters[id]).filter((c): c is Character => !!c).map((c) => ({ name: displayName(c.name), species: c.species, role: c.role.toLowerCase(), papers: 'ok' as Papers, characterId: c.id }));
      world.ports.ships[ship.id] = ship;
    } else if (m.houseId !== P && m.targetPlanetId === capital && m.stage === 'travel') {
      const lead = world.characters[m.leaderId];
      if (!lead) continue;
      const covert = m.kind !== 'envoy';
      const ship = newShip(world, rng, home, covert ? 'spy' : 'envoy', {
        flag: covert ? rng.pick(['neutral', 'none', m.houseId]) : m.houseId,
        from: world.houses[m.houseId]!.capitalPlanetId, missionId: m.id,
        arrives: addCycles(world.date, Math.max(1, Math.min(4, absoluteCycle(m.stageEnds) - absoluteCycle(world.date)))),
        cls: covert ? 'tramp freighter' : 'courier',
      });
      ship.aboard = [m.leaderId, ...(m.companions ?? [])].map((id) => world.characters[id]).filter((c): c is Character => !!c).map((c) => ({
        name: displayName(c.name), species: c.species,
        role: covert ? rng.pick(['merchant', 'factor', 'pilgrim', 'surveyor']) : c.role.toLowerCase(),
        papers: (covert ? 'forged' : 'ok') as Papers, characterId: c.id, truth: covert ? 'spy' as const : undefined, houseId: m.houseId,
      }));
      if (covert) addGoods(rng, ship);
      ship.declared = covert ? declaredOf(ship) : 'diplomatic';
      world.ports.ships[ship.id] = ship;
    }
  }
}

// ---------------------------------------------------------------- our people on the move

const TRIP_REASONS = [
  'business at the Imperial Exchange', 'a visit to the court of House {house}', 'a pilgrimage', 'a tournament on {world}',
  'family affairs on {world}', 'study at the archives of {world}', 'a wedding at the court of House {house}',
];

/** Now and then someone of the house takes a trip, on a real ship from our port. */
function travel(world: World, rng: Rng) {
  const P = world.playerHouseId;
  const home = mainPort(world);
  if (!home) return;
  const capital = world.houses[P]!.capitalPlanetId;
  if (rng.chance(0.05)) {
    const who = freeNotable(world, rng, [P]);
    if (who) {
      const dest = rng.pick(Object.values(world.houses).filter((h) => h.id !== P));
      const world2 = world.planets[dest.capitalPlanetId]?.name ?? 'abroad';
      const reason = rng.pick(TRIP_REASONS).replace('{house}', dest.name).replace('{world}', world2);
      const len = between(rng, [8, 20]);
      who.flags.push({ id: 'travelling', since: world.date, until: addCycles(world.date, len), detail: reason });
      const ship = newShip(world, rng, home, 'travel', {
        flag: rng.chance(0.5) ? P : 'neutral', cls: rng.pick(['yacht', 'courier', 'liner'] as ShipClass[]), from: capital,
        to: reason.includes('Exchange') ? 'exchange' : dest.capitalPlanetId, status: 'departed', arrives: world.date, departs: world.date, ours: true,
      });
      ship.aboard = [{ name: displayName(who.name), species: who.species, role: who.role.toLowerCase(), papers: 'ok', characterId: who.id, houseId: P }];
      ship.declared = reason;
      world.ports.ships[ship.id] = ship;
      note(world, `${displayName(who.name)} left on the ${ship.name}: ${reason}.`, ship.id, home.id);
    }
  }
  // Homecomings.
  const now = absoluteCycle(world.date);
  for (const c of Object.values(world.characters)) {
    if (!c.alive || c.houseId !== P) continue;
    const f = c.flags.find((x) => x.id === 'travelling');
    if (!f?.until) continue;
    const left = absoluteCycle(f.until) - now;
    if (left > 3) continue;
    const coming = Object.values(world.ports.ships).some((s) => s.status === 'inbound' && s.aboard.some((a) => a.characterId === c.id));
    if (coming) continue;
    const ship = newShip(world, rng, home, 'travel', {
      flag: rng.chance(0.5) ? P : 'neutral', cls: rng.pick(['yacht', 'courier', 'liner'] as ShipClass[]), from: rng.pick(Object.values(world.houses).filter((h) => h.id !== P)).capitalPlanetId,
      to: capital, arrives: addCycles(world.date, Math.max(1, left)), ours: true,
    });
    ship.aboard = [{ name: displayName(c.name), species: c.species, role: c.role.toLowerCase(), papers: 'ok', characterId: c.id, houseId: P }];
    ship.declared = `homeward: ${f.detail ?? 'a trip'}`;
    world.ports.ships[ship.id] = ship;
  }
}

// ---------------------------------------------------------------- our eyes at their ports

export function postAgent(input: World, agentId: string, sectorId: string): World {
  const world = structuredClone(input);
  ensurePorts(world);
  const agent = world.characters[agentId];
  const f = findSector(world, sectorId);
  if (!agent || !f || f.sector.port === 'none' || f.planet.houseId === world.playerHouseId || isAway(world, agentId)) return input;
  world.ports.posts[agentId] = { agentId, sectorId, since: world.date };
  agent.flags.push({ id: 'posted', since: world.date, detail: `at ${f.sector.name}`, knownBy: [world.playerHouseId] });
  ensurePorts(world);
  note(world, `${displayName(agent.name)} took a post at ${f.sector.name}, watching House ${world.houses[f.planet.houseId]?.name}'s docks.`, undefined, sectorId);
  return world;
}

function endPost(world: World, agentId: string, why: string) {
  const post = world.ports.posts[agentId];
  if (!post) return;
  delete world.ports.posts[agentId];
  const agent = world.characters[agentId];
  if (agent) agent.flags = agent.flags.filter((x) => x.id !== 'posted');
  if (!postAt(world, post.sectorId)) {
    delete world.ports.ports[post.sectorId];
    for (const [id, s] of Object.entries(world.ports.ships)) if (s.sectorId === post.sectorId) delete world.ports.ships[id];
  }
  note(world, why);
}

export function recallAgent(input: World, agentId: string): World {
  const world = structuredClone(input);
  const a = world.characters[agentId];
  endPost(world, agentId, `${a ? displayName(a.name) : 'Our agent'} was recalled.`);
  return world;
}

/** How well an agent keeps their cover: intrigue, deception, composure and stealth, plus time to settle in. */
export function coverOf(world: World, agent: Character, since?: GameDate): number {
  const s = agent.stats;
  const settled = since ? Math.min(3, Math.floor((absoluteCycle(world.date) - absoluteCycle(since)) / 80)) : 0;
  return (s.intrigue + s.deception + s.composure + s.stealth) / 4 + settled;
}

/** How hard a house watches a port: its Spymaster and the port's harbourmaster. */
export function watchOf(world: World, sectorId: string): number {
  const f = findSector(world, sectorId);
  if (!f) return 10;
  const spy = seatHolder(world, f.planet.houseId, 'spymaster');
  const hm = harbourmaster(world, sectorId);
  const a = spy ? (spy.stats.intrigue + spy.stats.insight) / 2 : 9;
  const b = hm ? hm.stats.perception : 9;
  return (a + b) / 2 + (f.sector.port === 'starport' ? 1 : 0) + listeningOn(world, f.planet.houseId, f.planet.id) * 1.5;
}

/** Chance each Phase that a posted agent is found out. */
export function postRisk(world: World, agentId: string, sectorId: string): number {
  const agent = world.characters[agentId];
  if (!agent) return 0;
  const post = world.ports?.posts[agentId];
  return Math.max(0.005, Math.min(0.35, 0.06 + (watchOf(world, sectorId) - coverOf(world, agent, post?.since)) * 0.03));
}

/** Each Phase: what posted agents learn, and whether they are caught. */
function tendPosts(world: World, rng: Rng) {
  const P = world.playerHouseId;
  for (const post of Object.values(world.ports.posts)) {
    const agent = world.characters[post.agentId];
    const f = findSector(world, post.sectorId);
    if (!agent?.alive || !f) { endPost(world, post.agentId, 'A post at a foreign port fell silent.'); continue; }
    const house = f.planet.houseId;
    for (const c of Object.values(world.characters)) if (c.alive && c.houseId === house && c.seat) learn(world, P, c.id, 3);
    if (!rng.chance(postRisk(world, agent.id, post.sectorId))) continue;
    // Found out: whether they get away depends on their wits and speed.
    const escape = (agent.stats.agility + agent.stats.reflexes + agent.stats.deception) / 3;
    if (rng.chance(Math.max(0.15, Math.min(0.85, 0.5 + (watchOf(world, post.sectorId) - escape) * 0.05)))) {
      agent.flags.push({ id: 'captive', since: world.date, detail: `held by House ${world.houses[house]?.name}`, knownBy: [house, P] }, { id: 'missing', since: world.date });
      world.captives ??= {};
      world.captives[agent.id] = { characterId: agent.id, heldBy: house, since: world.date, interrogated: false };
      agent.location = { planetId: f.planet.id, sectorId: f.sector.id };
      shiftRelation(world, house, P, -8);
      endPost(world, post.agentId, `${displayName(agent.name)} was taken at the docks of ${f.sector.name}.`);
      tell(world, 'intrigue', `Our agent ${displayName(agent.name)} was seized at the docks of ${f.sector.name} by House ${world.houses[house]?.name}.`, [agent.id], {
        type: 'captive', severity: 2, placeId: f.sector.id, who: [{ id: agent.id, part: 'taken' }], effects: [`House ${world.houses[house]?.name}'s regard −8`], source: 'word from the docks',
      });
    } else {
      agent.flags.push({ id: 'exposed', since: world.date, until: addCycles(world.date, CYCLES_PER_PHASE * 5), detail: `to House ${world.houses[house]?.name}`, knownBy: [house, P] });
      learn(world, house, agent.id, 25);
      endPost(world, post.agentId, `${displayName(agent.name)} was spotted at ${f.sector.name} and slipped away home.`);
      tell(world, 'intrigue', `${displayName(agent.name)} was spotted watching the docks of ${f.sector.name} and had to run.`, [agent.id], {
        type: 'intrigue', severity: 1, placeId: f.sector.id, who: [{ id: agent.id, part: 'exposed' }], source: `${displayName(agent.name)}, on return`,
      });
    }
    world.ports.alerts++;
  }
}

// ---------------------------------------------------------------- raids

function newRaid(world: World, rng: Rng) {
  const targets = portSectors(world);
  if (!targets.length) return;
  const sector = rng.pick(targets);
  const lead = between(rng, [3, 5]) * CYCLES_PER_PHASE / 2;
  const raid: Raid = {
    id: `r${world.nextId++}`, sectorId: sector.id, strength: between(rng, [25, 55]), status: 'brewing',
    arrives: addCycles(world.date, lead), revealAt: addCycles(world.date, lead - 6), known: false,
  };
  // A listening post on that world hears them coming sooner.
  const ears = listeningOn(world, world.playerHouseId, findSector(world, sector.id)?.planet.id ?? '');
  if (ears) raid.revealAt = addCycles(world.date, Math.max(1, lead - 6 - ears * 6));
  world.ports.raids.push(raid);
}

export function defenceOf(world: World, sectorId?: string): number {
  const P = world.playerHouseId;
  const ships = sectorId ? fleetDefence(world, sectorId) : 0;
  const home = Object.values(world.characters).filter((c) => c.alive && c.houseId === P && (c.role === 'Knight' || c.seat === 'champion' || c.seat === 'grandMaster') && !isAway(world, c.id) && !c.flags.some((f) => f.id === 'wounded'));
  return Math.round(home.reduce((s, c) => s + (c.stats.duelling + c.stats.valor + c.stats.tactics) / 3, 0) * 0.55) + ships;
}

export function tributeFor(raid: Raid): number {
  return raid.strength * 40;
}

function reveal(world: World, raid: Raid, how: string) {
  if (raid.status !== 'brewing') return;
  raid.status = 'revealed';
  world.ports.alerts++;
  const s = findSector(world, raid.sectorId)?.sector;
  note(world, `RAID: corsairs bound for ${s?.name}. ${how}`);
  tell(world, 'world', `Corsairs are coming for ${s?.name}, due ${formatDate(raid.arrives)}.`, undefined, { type: 'raid', severity: 2, placeId: raid.sectorId, detail: how, source: 'patrols and the docks' });
}

function strike(world: World, rng: Rng, raid: Raid) {
  const P = world.playerHouseId;
  const s = findSector(world, raid.sectorId)?.sector;
  const house = world.houses[P]!;
  raid.status = 'over';
  if (raid.answer === 'tribute') {
    raid.result = 'They took the tribute and left.';
    tell(world, 'world', `The corsairs took their tribute and passed ${s?.name} by.`, undefined, { type: 'raid', severity: 1, placeId: raid.sectorId, effects: [`Tribute ${tributeFor(raid).toLocaleString('en-US')} othes`, 'Respect −2'] });
    return;
  }
  // Every sector keeps a watch of its own (15); mustered knights fight in full, otherwise about half turn out.
  const defence = 15 + (raid.answer === 'muster' ? defenceOf(world, raid.sectorId) : Math.round(defenceOf(world) * 0.5) + fleetDefence(world, raid.sectorId)) + baseStrength(world, raid.sectorId);
  const roll = defence + rng.gauss() * 8 - raid.strength;
  const knights = Object.values(world.characters).filter((c) => c.alive && c.houseId === P && c.role === 'Knight' && !isAway(world, c.id));
  if (roll >= 0) {
    house.standing.dread = Math.min(100, house.standing.dread + 3);
    if (raid.answer === 'muster') house.standing.honour = Math.min(100, house.standing.honour + 1);
    for (const k of knights) shiftMood(k, 3);
    if (raid.answer === 'muster') { for (const k of knights) tally(world, k.id, 'raidsRepelled'); meet(world, rng, rng.shuffle([...knights]).slice(0, 6).map((k) => k.id), 'holding the walls', 0.7); }
    raid.result = `Driven off at ${s?.name}. Dread +3.`;
    tell(world, 'world', `The corsairs struck ${s?.name} and were driven off${raid.answer === 'muster' ? ' by the mustered knights' : ' by the sector watch'}.`, undefined, {
      type: 'fight', severity: 2, placeId: raid.sectorId, who: knights.map((k) => ({ id: k.id, part: raid.answer === 'muster' ? 'fought' : 'at home' })),
      effects: ['Dread +3', ...(raid.answer === 'muster' ? ['Honour +1', 'Knights mood +3'] : [])], detail: `Raid strength ${raid.strength} against our defence ${defence}.`,
    });
    // In the thick of it, someone young may have shown what they are.
    if (s && rng.chance(0.3)) { const pl = Object.values(world.planets).find((x) => x.sectors.some((y) => y.id === raid.sectorId)); if (pl) noticeYouth(world, rng, pl.id, raid.sectorId, 'raid'); }
  } else {
    const loss = Math.max(0, Math.min(econ(world, P).stock.othes, raid.strength * 60));
    record(world, P, { resource: 'othes', amount: -loss, label: `Raid on ${s?.name ?? 'a sector'}`, kind: 'raid', sectorId: raid.sectorId });
    const food = Math.max(0, Math.min(econ(world, P).stock.provisions, raid.strength * 4));
    record(world, P, { resource: 'provisions', amount: -food, label: `Raid on ${s?.name ?? 'a sector'}`, kind: 'raid', sectorId: raid.sectorId });
    if (s) { s.unrest = Math.min(100, s.unrest + 10); s.population = Math.max(0, s.population - raid.strength * 30); }
    house.standing.respect = Math.max(0, house.standing.respect - 2);
    if (raid.answer === 'muster' && knights.length) {
      const k = rng.pick(knights);
      k.flags.push({ id: 'wounded', since: world.date, until: addCycles(world.date, CYCLES_PER_PHASE * 2) });
    }
    const taken = [loss ? `${loss.toLocaleString('en-US')} othes` : '', food ? `${food} provisions` : ''].filter(Boolean).join(' and ') || 'what little there was';
    raid.result = `${s?.name} was sacked: ${taken} taken, unrest +10.`;
    tell(world, 'world', `The corsairs sacked ${s?.name}.`, undefined, {
      type: 'fight', severity: 3, placeId: raid.sectorId, detail: `Raid strength ${raid.strength} against our defence ${defence}. ${taken} gone, and the people are angry.`,
      effects: [loss ? `−${loss.toLocaleString('en-US')} othes` : '', food ? `−${food} provisions` : '', 'Unrest +10', 'Respect −2', `Population −${raid.strength * 30}`].filter(Boolean),
      who: knights.map((k) => ({ id: k.id, part: raid.answer === 'muster' ? 'fought' : 'at home' })),
    });
    if (s && rng.chance(0.3)) { const pl = Object.values(world.planets).find((x) => x.sectors.some((y) => y.id === raid.sectorId)); if (pl) noticeYouth(world, rng, pl.id, raid.sectorId, 'raid'); }
  }
  world.ports.alerts++;
}

// ---------------------------------------------------------------- once a turn

export function advancePorts(world: World, rng: Rng, phaseTurned: boolean): void {
  ensurePorts(world);
  const ps = world.ports;
  const now = absoluteCycle(world.date);
  missionShips(world, rng);
  travel(world, rng);
  // New arrivals, at our ports and any we watch.
  for (const port of Object.values(ps.ports)) {
    const s = findSector(world, port.sectorId)?.sector;
    if (!s || port.closed) continue;
    let n = ARRIVALS[s.port];
    while (n > 0) {
      if (rng.chance(Math.min(1, n))) { const sh = arrival(world, rng, s); ps.ships[sh.id] = sh; }
      n -= 1;
    }
  }
  // Movement.
  for (const ship of Object.values(ps.ships)) {
    if (ship.status === 'inbound' && absoluteCycle(ship.arrives) <= now) {
      if (ps.ports[ship.sectorId]?.closed) { ship.status = 'departed'; ship.notes.push('Turned away: the port is closed.'); continue; }
      dock(world, rng, ship);
    } else if (ship.status === 'docked' && ship.departs && absoluteCycle(ship.departs) <= now) {
      depart(world, ship);
    }
    // Held too long without word: the harbourmaster settles it.
    else if (ship.status === 'held' && ship.departs && absoluteCycle(ship.departs) + 8 <= now) fineInPlace(world, ship, true);
    // Rival missions: their people leave when the mission ends.
    if (ship.missionId && ship.status === 'docked' && world.missions[ship.missionId]?.stage === 'done') depart(world, ship);
  }
  // Raids.
  for (const raid of ps.raids) {
    if (raid.status === 'brewing' && absoluteCycle(raid.revealAt) <= now) reveal(world, raid, 'Patrols sighted them on the approach.');
    if (raid.status === 'revealed' && absoluteCycle(raid.arrives) <= now) strike(world, rng, raid);
  }
  ps.raids = ps.raids.filter((r) => r.status !== 'over' || absoluteCycle(r.arrives) > now - CYCLES_PER_PHASE * 2);
  if (phaseTurned) {
    if (!ps.raids.some((r) => r.status !== 'over')) {
      const patrol = world.courts[world.playerHouseId]?.tasks.grandMaster?.task === 'patrol';
      if (rng.chance((patrol ? 0.03 : 0.06) * raidOdds(world))) newRaid(world, rng);
    }
    for (const port of Object.values(ps.ports)) { port.last = port.tally; port.tally = emptyTally(); }
    tendPosts(world, rng);
  }
  // Forget old traffic.
  for (const [id, s] of Object.entries(ps.ships)) {
    if (s.status === 'departed' && s.departs && absoluteCycle(s.departs) < now - CYCLES_PER_PHASE) delete ps.ships[id];
  }
}

// ---------------------------------------------------------------- player actions

function act(input: World, shipId: string, fn: (w: World, rng: Rng, ship: Ship) => void): World {
  const world = structuredClone(input);
  const ship = world.ports.ships[shipId];
  if (!ship) return input;
  const rng = new Rng(world.rng);
  fn(world, rng, ship);
  world.rng = rng.state;
  return world;
}

export function inspectShip(input: World, shipId: string): World {
  return act(input, shipId, (w, rng, ship) => {
    const prior = gradeOf(entryFor(w, ship));
    const found = inspectInPlace(w, rng, ship);
    const g = severity(w, ship, prior);
    if (g > 0 || entryFor(w, ship)) logIncident(w, ship, `Searched on the Highroy's order: ${found.join('; ')}.`, g);
    note(w, `${ship.name}: ${found.join('; ')}.`, ship.id);
  });
}

export function openCrate(input: World, shipId: string): World {
  return act(input, shipId, (w, _rng, ship) => {
    const crate = ship.cargo.find((c) => c.crate && c.found && !c.opened);
    if (!crate) return;
    crate.opened = true;
    ship.notes.push(`Crate opened: ${CRATE_TEXT[crate.crate!]}`);
    note(w, `${ship.name}: crate opened. ${CRATE_TEXT[crate.crate!]}`, ship.id);
    if (crate.crate === 'nothing' && w.houses[ship.flag]) shiftRelation(w, ship.flag, w.playerHouseId, -2);
    logIncident(w, ship, `Sealed crate opened: ${crate.crate}.`, crate.crate === 'nothing' ? 1 : crate.crate === 'luxuries' ? 2 : 3);
    if (crate.crate === 'weapons') {
      const raid = w.ports.raids.find((r) => r.status === 'brewing');
      if (raid) reveal(w, raid, `The guns found aboard the ${ship.name} were meant for them.`);
    }
    if (crate.crate === 'stolen relics') { shiftRelation(w, 'torvann', w.playerHouseId, 3); ship.notes.push('House Torvann will want these back.'); }
  });
}

export function detainShip(input: World, shipId: string): World {
  return act(input, shipId, (w, _rng, ship) => {
    if (ship.status !== 'docked') return;
    ship.status = 'held';
    const caught = contraband(ship).some((c) => c.found) || ship.aboard.some((a) => a.revealed && a.truth);
    if (!caught && w.houses[ship.flag]) { shiftRelation(w, ship.flag, w.playerHouseId, -3); w.houses[w.playerHouseId]!.standing.honour = Math.max(0, w.houses[w.playerHouseId]!.standing.honour - 1); }
    note(w, `${ship.name} held at berth ${ship.berth}.`, ship.id);
    logIncident(w, ship, 'Detained on the Highroy\'s order.', caught ? 3 : 1);
  });
}

/** Put the master of a held smuggler in our cells for a crime. */
export function jailCaptain(input: World, shipId: string): World {
  return act(input, shipId, (w, _rng, ship) => {
    if (ship.status !== 'held' || ship.captainJailed || !contraband(ship).some((c) => c.found)) return;
    const p = imprison(w, w.playerHouseId, ship.captain, `master of the ${ship.name}`, w.houses[ship.flag] ? ship.flag : null, 'crime', 8 + (ship.age % 7), ship.sectorId);
    if (!p) return;
    ship.captainJailed = true;
    ship.notes.push(`Captain ${ship.captain} taken to the cells for smuggling.`);
    logIncident(w, ship, `Captain ${ship.captain} jailed for smuggling.`, 3);
    tell(w, 'world', `${ship.captain}, master of the ${ship.name}, is jailed for smuggling.`, undefined, { type: 'captive', severity: 1, placeId: ship.sectorId, shipId: ship.id, effects: ['Two Orbits in the cells'] });
  });
}

function fineInPlace(w: World, ship: Ship, byCouncil = false, onTheSpot = false) {
  if (ship.fined) return;
  const found = contraband(ship).filter((c) => c.found);
  const P = w.playerHouseId;
  const value = found.reduce((s, c) => s + (c.good ? c.qty * BASE_PRICE[c.good] : 150), 0);
  const fine = Math.max(100, Math.round(value * 0.6));
  record(w, P, { resource: 'othes', amount: fine, label: `Fine: ${ship.name}`, kind: 'port', sectorId: ship.sectorId });
  for (const c of found) if (c.good) { record(w, P, { resource: c.good, amount: c.qty, label: `Seized from ${ship.name}`, kind: 'port', sectorId: ship.sectorId }); c.qty = 0; }
  if (!found.length && w.houses[ship.flag]) shiftRelation(w, ship.flag, P, -4);
  ship.fined = true;
  ship.status = 'docked';
  ship.departs = addCycles(w.date, 2);
  ship.notes.push(`${onTheSpot ? 'Customs fined it on the spot:' : byCouncil ? 'The harbourmaster, hearing nothing, fined it' : 'Fined'} ${fine.toLocaleString('en-US')} othes${onTheSpot ? '.' : ' and released.'}`);
  note(w, `${ship.name} fined ${fine.toLocaleString('en-US')} othes${found.length ? ', cargo seized' : ''}${onTheSpot ? ' on the spot' : byCouncil ? ' by the harbourmaster' : ''}.`, ship.id);
  if (!onTheSpot) logIncident(w, ship, `Fined ${fine.toLocaleString('en-US')} othes${found.length ? ', cargo seized' : ''}.`, found.length ? 2 : 0);
}

export function fineShip(input: World, shipId: string): World {
  return act(input, shipId, (w, _rng, ship) => fineInPlace(w, ship));
}

export function releaseShip(input: World, shipId: string): World {
  return act(input, shipId, (w, _rng, ship) => {
    if (ship.status === 'held') { ship.status = 'docked'; ship.departs = addCycles(w.date, 2); }
    else if (ship.status === 'docked') ship.departs = w.date;
    ship.notes.push('Waved through.');
  });
}

export function agentAvailable(world: World): Character | undefined {
  return agentsOf(world, world.playerHouseId).find((c) => !isAway(world, c.id));
}

export function setAgentOn(input: World, shipId: string): World {
  return act(input, shipId, (w, rng, ship) => {
    const agent = agentAvailable(w);
    if (!agent || ship.agentChecked) return;
    ship.agentChecked = true;
    const skill = (agent.stats.intrigue + agent.stats.insight + agent.stats.perception) / 3;
    const lines: string[] = [];
    for (const a of ship.aboard) {
      if (!a.truth || a.revealed) continue;
      if (rng.chance(Math.min(0.9, 0.3 + (skill - 8) * 0.06))) {
        a.revealed = true;
        lines.push(a.truth === 'spy' ? `${a.name} works for House ${w.houses[a.houseId ?? '']?.name ?? '?'}` : a.truth === 'scout' ? `${a.name} is a corsair scout` : `${a.name} is a runaway from House ${w.houses[a.houseId ?? '']?.name ?? '?'}`);
        if (a.characterId) learn(w, w.playerHouseId, a.characterId, 20);
      }
    }
    for (const c of ship.cargo) if (c.hidden && !c.found && rng.chance(0.5)) { c.found = true; lines.push(c.crate ? 'a sealed crate below decks' : `${c.label} ×${c.qty} off the manifest`); }
    const text = `${shortName(agent.name)} went aboard: ${lines.length ? lines.join('; ') : 'nothing worth reporting'}.`;
    ship.notes.push(text);
    note(w, `${ship.name}: ${text}`, ship.id);
  });
}

/** Take someone off a ship. Real people become captives; scouts talk. */
export function arrest(input: World, shipId: string, index: number): World {
  return act(input, shipId, (w, _rng, ship) => {
    const a = ship.aboard[index];
    if (!a || a.arrested || !(a.revealed || a.suspect)) return;
    a.arrested = true;
    if (a.truth && !a.revealed) { a.revealed = true; ship.notes.push(`Under questioning, ${a.name} broke.`); }
    const P = w.playerHouseId;
    const s = findSector(w, ship.sectorId)?.sector;
    if (a.truth === 'spy' && a.characterId) {
      const c = w.characters[a.characterId];
      if (c) {
        c.flags.push({ id: 'captive', since: w.date, detail: `held by House ${w.houses[P]!.name}`, knownBy: [P] }, { id: 'missing', since: w.date });
        c.location = { planetId: w.houses[P]!.capitalPlanetId, sectorId: ship.sectorId };
        w.captives ??= {};
        w.captives[c.id] = { characterId: c.id, heldBy: P, since: w.date, missionId: ship.missionId, interrogated: false };
        learn(w, P, c.id, 30);
        if (a.houseId) shiftRelation(w, a.houseId, P, -6);
        const m = ship.missionId ? w.missions[ship.missionId] : undefined;
        if (m && m.stage !== 'done') { m.stage = 'done'; m.outcome = 'disaster'; m.ended = w.date; m.report = `Taken at the docks of ${s?.name}.`; }
        tell(w, 'intrigue', `Seized at ${s?.name}: ${displayName(c.name)}, an agent of House ${w.houses[a.houseId ?? '']?.name}, taken off the ${ship.name}.`, [c.id], {
          type: 'captive', severity: 2, placeId: ship.sectorId, shipId: ship.id, who: [{ id: c.id, part: 'taken captive' }],
          effects: [`House ${w.houses[a.houseId ?? '']?.name}'s regard −6`], detail: 'They are ours to deal with.',
        });
      }
    } else if (a.truth === 'scout') {
      const held = imprison(w, P, a.name, 'corsair scout', null, 'crime', 9 + (a.name.length % 6), ship.sectorId);
      if (held) ship.notes.push(`${a.name} goes to our cells.`);
      const raid = w.ports.raids.find((r) => r.id === ship.raidId) ?? w.ports.raids.find((r) => r.status === 'brewing');
      if (raid) {
        raid.known = true;
        raid.strength = Math.round(raid.strength * 0.85);
        reveal(w, raid, `The scout taken off the ${ship.name} talked: strength ${raid.strength}, due ${formatDate(raid.arrives)}.`);
      } else ship.notes.push(`${a.name} talks of corsairs, but no raid is coming yet.`);
    } else if (a.truth === 'runaway' && a.houseId) {
      shiftRelation(w, a.houseId, P, 5);
      ship.notes.push(`${a.name} was sent home to House ${w.houses[a.houseId]?.name}, who are grateful.`);
    } else if (!a.truth) {
      // An honest traveller with bad papers: held a while, then let go.
      ship.notes.push(`${a.name} was questioned and turned out to be exactly what they said.`);
      if (w.houses[ship.flag]) shiftRelation(w, ship.flag, P, -1);
    }
    note(w, `${a.name} taken off the ${ship.name}.`, ship.id);
    logIncident(w, ship, `${a.name} taken off the ship${a.truth ? ` (${a.truth})` : ''}.`, a.truth ? 3 : 1);
  });
}

/** Ban a captain and their ships from every port we hold, or lift the ban. */
export function setBan(input: World, entryId: string, banned: boolean): World {
  const world = structuredClone(input);
  const e = world.ports.register[entryId];
  if (!e) return input;
  e.banned = banned;
  e.incidents.unshift({ date: world.date, sectorId: '', shipName: e.ships.at(-1) ?? '', text: banned ? 'Banned from our ports by order of the Highroy.' : 'Ban lifted.', grade: 0 });
  return world;
}

export function setPortOrders(input: World, sectorId: string, patch: Partial<Pick<PortState, 'tariff' | 'inspect' | 'closed'>>): World {
  const world = structuredClone(input);
  ensurePorts(world);
  const port = world.ports.ports[sectorId];
  if (!port) return input;
  Object.assign(port, patch);
  port.tariff = Math.max(0, Math.min(15, Math.round(port.tariff)));
  if (patch.closed !== undefined) {
    const s = findSector(world, sectorId)?.sector;
    if (s && patch.closed) s.unrest = Math.min(100, s.unrest + 3);
  }
  return world;
}

export function toggleWatch(input: World, characterId: string): World {
  const world = structuredClone(input);
  ensurePorts(world);
  const w = world.ports.watch;
  world.ports.watch = w.includes(characterId) ? w.filter((x) => x !== characterId) : [...w, characterId];
  return world;
}

export function answerRaid(input: World, raidId: string, answer: 'muster' | 'tribute'): World {
  const world = structuredClone(input);
  const raid = world.ports.raids.find((r) => r.id === raidId);
  if (!raid || raid.status !== 'revealed' || raid.answer) return input;
  const P = world.playerHouseId;
  if (answer === 'tribute') {
    const cost = tributeFor(raid);
    if (econ(world, P).stock.othes < cost) return input;
    record(world, P, { resource: 'othes', amount: -cost, label: 'Tribute to corsairs', kind: 'raid', sectorId: raid.sectorId });
    world.houses[P]!.standing.respect = Math.max(0, world.houses[P]!.standing.respect - 2);
  }
  raid.answer = answer;
  return world;
}

/** Ships at a port, newest first, as the board shows them. */
export function boardOf(world: World, sectorId: string): Ship[] {
  return Object.values(world.ports?.ships ?? {})
    .filter((s) => s.sectorId === sectorId)
    .sort((a, b) => absoluteCycle(b.status === 'departed' ? b.departs ?? b.arrives : b.arrives) - absoluteCycle(a.status === 'departed' ? a.departs ?? a.arrives : a.arrives));
}

export function activeRaids(world: World): Raid[] {
  return (world.ports?.raids ?? []).filter((r) => r.status === 'revealed');
}

