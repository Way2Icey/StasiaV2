// Holdings: what a house builds into its sectors (and later its great ships).
// Three modules for now: cells for prisoners, vaults for othes on ledger drives,
// Caiges and records, and academies for training.
import { tally } from './careers';
import { Rng } from './rng';
import { displayName, shortName } from './names';
import { econ, record } from './economy';
import { cannotPay, spend } from './bills';
import { MODULE_GOODS_PER_LEVEL, type Flow } from '../data/economy';
import { findSector, seatHolder } from './query';
import { learn } from './knowledge';
import { shiftRelation, relation } from './relations';
import { shiftMood } from './mood';
import { logRecord } from './records';
import { isAway } from './court';
import { kill } from './death';
import { shiftBoth, shiftOpinion } from './relationships';
import { absoluteCycle, addCycles, CYCLES_PER_ORBIT, CYCLES_PER_PHASE, type GameDate } from './time';
import type { Caige, Captive, Character, World } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const houseName = (w: World, id: string) => `House ${w.houses[id]?.name ?? id}`;

// ---------------------------------------------------------------- types

export type ModuleKind = 'cells' | 'vault' | 'academy' | 'hangar' | 'base' | 'listening' | 'shipyard';
export type Treatment = 'decent' | 'harsh' | 'isolation';
export type HoldReason = 'spy' | 'crime' | 'war' | 'leverage';

export const MODULE_LABEL: Record<ModuleKind, string> = { cells: 'Cells', vault: 'Vault', academy: 'Academy', hangar: 'Hangar', base: 'Base', listening: 'Listening post', shipyard: 'Shipyard' };
export const OVERSEER_TITLE: Record<ModuleKind, string> = { cells: 'Warden', vault: 'Vaultmaster', academy: 'Head of the academy', hangar: 'Wing commander', base: 'Commander', listening: 'Listener', shipyard: 'Master shipwright' };
export const MODULE_NOTE: Record<ModuleKind, string> = {
  cells: 'Holds prisoners. Four to a level. Higher levels and a sharp warden make escapes and rescues harder.',
  vault: 'Othes on ledger drives, stored Caiges and the house records. Raids cannot touch what is vaulted; heists can try.',
  academy: 'Trains people of the house and, once it has a name, draws recruits and wards from other houses.',
  hangar: 'Fighter wings aboard a great ship. Each level adds to the ship\'s fighting strength.',
  base: 'A garrison of the house\'s troops. It fights any raid on this sector whether or not the knights muster, and keeps its own cells.',
  listening: 'Antennae and quiet listeners. Raids on this world are seen sooner, foreign agents here are caught more often, and other houses\' great ships near it are seen. Level 2 follows ships on the lanes to and from it; level 3 hears the whole Reaches.',
  shipyard: 'Slips and drydocks. Great ships are laid down here, one at a time per level, and ships docked here are repaired twice as fast. A better yard builds faster.',
};
/** Othes to build level 1, 2 and 3. */
export const BUILD_COST: Record<ModuleKind, [number, number, number]> = {
  cells: [1500, 3000, 6000],
  vault: [2500, 5000, 10000],
  academy: [4000, 8000, 15000],
  hangar: [6000, 12000, 20000],
  base: [5000, 10000, 20000],
  listening: [3000, 6000, 12000],
  shipyard: [8000, 16000, 30000],
};

/** Kinds that can be built into a sector (not ships). */
export const SECTOR_KINDS: ModuleKind[] = ['cells', 'vault', 'academy', 'base', 'listening', 'shipyard'];

/** A base's strength against raiders: level and the commander's head for tactics. */
export function baseStrength(world: World, sectorId: string): number {
  return modulesAt(world, sectorId).filter((m) => m.kind === 'base' && m.level > 0 && m.houseId === world.playerHouseId).reduce((n, m) => {
    const c = m.overseerId ? world.characters[m.overseerId] : undefined;
    return n + m.level * 12 + (c?.alive ? Math.round((c.stats.tactics + c.stats.leadership) / 2) : 0);
  }, 0);
}

/** The best listening post a house has on a planet. */
export function listeningOn(world: World, houseId: string, planetId: string): number {
  return Object.values(world.holdings?.modules ?? {}).filter((m) => m.kind === 'listening' && m.houseId === houseId && m.level > 0 && m.sectorId && findSector(world, m.sectorId)?.planet.id === planetId)
    .reduce((n, m) => Math.max(n, m.level), 0);
}

/** The reach of a house's ears: the worlds it hears, and whether it follows the lanes or hears everything. */
export function earsOf(world: World, houseId: string): { worlds: Set<string>; lanes: boolean; all: boolean } {
  const worlds = new Set<string>();
  let lanes = false;
  let all = false;
  for (const m of Object.values(world.holdings?.modules ?? {})) {
    if (m.kind !== 'listening' || m.houseId !== houseId || m.level < 1 || !m.sectorId) continue;
    const p = findSector(world, m.sectorId)?.planet.id;
    if (p) worlds.add(p);
    if (m.level >= 2) lanes = true;
    if (m.level >= 3) all = true;
  }
  return { worlds, lanes, all };
}

/** Does this house see that great ship? Its own, any at its own worlds, any its listening posts can hear. */
export function shipSeen(world: World, houseId: string, s: { houseId: string; sectorId: string; from?: string; arrives?: unknown }): boolean {
  if (s.houseId === houseId) return true;
  const to = findSector(world, s.sectorId)?.planet;
  if (to && to.houseId === houseId && !s.arrives) return true;
  const ears = earsOf(world, houseId);
  if (ears.all) return true;
  const toId = to?.id;
  const fromId = s.from ? findSector(world, s.from)?.planet.id : undefined;
  if (!s.arrives) return !!toId && ears.worlds.has(toId);
  return ears.lanes && ((!!toId && ears.worlds.has(toId)) || (!!fromId && ears.worlds.has(fromId)));
}
/** Othes a vault can hold at each level. */
export const VAULT_CAPACITY = [0, 25000, 60000, 120000];
export const TREATMENT_LABEL: Record<Treatment, string> = { decent: 'Decent', harsh: 'Harsh', isolation: 'Isolation' };
export const TREATMENT_NOTE: Record<Treatment, string> = {
  decent: 'Fed, lit and spoken to. Questioning is gentler, but some come to like their jailers, and a few change sides.',
  harsh: 'Hunger and the dark. They talk more readily, but word gets out: honour −1 a Phase unless they are held for a crime, and their house hates us for it.',
  isolation: 'Sealed away. No one can reach them to rescue them, and they cannot plot an escape with anyone, but they break slowly.',
};
export const REASON_LABEL: Record<HoldReason, string> = { spy: 'Spying', crime: 'A crime', war: 'War', leverage: 'Leverage' };

export interface Module {
  id: string;
  kind: ModuleKind;
  houseId: string;
  sectorId?: string;
  shipId?: string;
  level: number;
  overseerId: string | null;
  built: GameDate;
  /** Building or upgrading: the level being built and when it is done. */
  works?: { to: number; done: GameDate };
  // vault
  drives?: number;
  keepers?: string[];
  // academy
  reputation?: number;
}

/** A nobody held in our cells: a corsair scout, a smuggler, a thief. */
export interface Prisoner {
  id: string;
  name: string;
  houseId: string | null;
  /** What they were: 'corsair scout', 'smuggler'… */
  what: string;
  heldBy: string;
  cellId: string;
  reason: HoldReason;
  treatment: Treatment;
  since: GameDate;
  /** When a sentence for a crime is served. */
  until?: GameDate;
  /** Agility+stealth-ish, 1..20, for escapes. */
  wits: number;
}

export interface Operation {
  id: string;
  kind: 'rescue' | 'heist';
  houseId: string;
  targetHouseId: string;
  /** The captive to bring home, or the vault to rob. */
  targetId: string;
  agentId: string;
  started: GameDate;
  done: GameDate;
}

export interface HoldingsState {
  modules: Record<string, Module>;
  prisoners: Record<string, Prisoner>;
  ops: Operation[];
  /** When a house last tried a rescue or a heist, keyed 'rescue:house' / 'heist:house'. */
  cooldown?: Record<string, GameDate>;
  /** Cities, ports and ships have had their cells added. */
  seeded?: boolean;
  seededYards?: boolean;
}

// ---------------------------------------------------------------- set-up

function capitalSector(world: World, houseId: string): string | undefined {
  const p = world.planets[world.houses[houseId]?.capitalPlanetId ?? ''];
  if (!p) return undefined;
  const rank = { none: 0, 'landing field': 1, spaceport: 2, starport: 3 } as const;
  return [...p.sectors].sort((a, b) => rank[b.port] - rank[a.port])[0]?.id;
}

function newModule(world: World, houseId: string, kind: ModuleKind, sectorId: string, level: number): Module {
  const id = `mod${world.nextId++}`;
  const m: Module = { id, kind, houseId, sectorId, level, overseerId: null, built: world.date };
  if (kind === 'vault') { m.drives = 0; m.keepers = []; }
  if (kind === 'academy') m.reputation = 0;
  world.holdings.modules[id] = m;
  return m;
}

export function ensureHoldings(world: World): void {
  if (world.holdings?.modules) {
    world.holdings.prisoners ??= {};
    world.holdings.ops ??= [];
    seedCells(world);
    return;
  }
  world.holdings = { modules: {}, prisoners: {}, ops: [] };
  for (const h of Object.values(world.houses)) {
    const at = capitalSector(world, h.id);
    if (!at) continue;
    const great = h.tier === 'great';
    const cells = newModule(world, h.id, 'cells', at, great ? 2 : 1);
    const vault = newModule(world, h.id, 'vault', at, great ? 2 : 1);
    // A rival's vault starts with some of its wealth put away.
    const e = world.economy?.houses[h.id];
    if (e && h.id !== world.playerHouseId) {
      const put = Math.round(e.stock.othes * 0.4);
      e.stock.othes -= put;
      vault.drives = put;
    }
    // Warden and vaultmaster: the spymaster minds the cells, the steward the vault, until someone better is named.
    cells.overseerId = seatHolder(world, h.id, 'spymaster')?.id ?? null;
    vault.overseerId = seatHolder(world, h.id, 'steward')?.id ?? null;
    // Someone who can feel a Caige to keep them.
    const keeper = Object.values(world.characters)
      .filter((c) => c.alive && c.houseId === h.id && c.tier === 'full' && c.resonance && !c.seat)
      .sort((a, b) => b.stats.resonanceControl - a.stats.resonanceControl)[0];
    if (keeper) vault.keepers = [keeper.id];
  }
  seedCells(world);
  for (const c of Object.values(world.armoury ?? {})) storeInVault(world, c);
  for (const cap of Object.values(world.captives ?? {})) placeCaptive(world, cap, 'spy');
}

/** Cities, bases and ports keep cells as a matter of course; farmland and wilds do not. */
export function sectorHasCells(sector: { designation: string; port: string }): boolean {
  return /city|fortress|post|base|garrison|citadel/i.test(sector.designation) || sector.port === 'spaceport' || sector.port === 'starport';
}

/** Give every city, port and base its cells, and every great ship its brig. Runs once per save. */
function seedCells(world: World): void {
  if (!world.holdings.seededYards) {
    world.holdings.seededYards = true;
    for (const h of Object.values(world.houses)) {
      const at = capitalSector(world, h.id);
      if (at && !Object.values(world.holdings.modules).some((m) => m.kind === 'shipyard' && m.houseId === h.id)) newModule(world, h.id, 'shipyard', at, h.tier === 'great' ? 2 : 1);
    }
  }
  if (world.holdings.seeded) return;
  world.holdings.seeded = true;
  for (const p of Object.values(world.planets)) {
    for (const sec of p.sectors) {
      if (!sectorHasCells(sec)) continue;
      if (Object.values(world.holdings.modules).some((m) => m.sectorId === sec.id && m.kind === 'cells')) continue;
      const m = newModule(world, p.houseId, 'cells', sec.id, 1);
      m.overseerId = null;
    }
  }
}

/** A brig for a great ship that has none. */
export function ensureBrig(world: World, shipId: string, houseId: string): void {
  if (Object.values(world.holdings.modules).some((m) => m.shipId === shipId && m.kind === 'cells')) return;
  const id = `mod${world.nextId++}`;
  world.holdings.modules[id] = { id, kind: 'cells', houseId, shipId, level: 1, overseerId: null, built: world.date };
}

/** How many Caiges a vault can keep: four a level. */
export function caigeRoom(m: Module): number { return m.level * 4; }

/** Unbonded Caiges belong in a vault; a new find goes to the house's first vault. */
export function storeInVault(world: World, c: Caige): void {
  if (c.bondedTo) { delete c.vaultId; return; }
  const cur = c.vaultId ? world.holdings.modules[c.vaultId] : undefined;
  if (cur && cur.houseId === c.houseId) return;
  delete c.vaultId;
  // The first vault of the house with room; with none, it sits loose in the armoury and slips faster.
  const v = modulesOf(world, c.houseId, 'vault').find((m) => caigesIn(world, m.id).length < caigeRoom(m));
  if (v) c.vaultId = v.id;
  c.stability ??= 85;
}

/** Put a captive into a cell of their holder, with a reason and the holder's way of treating them. */
export function placeCaptive(world: World, cap: Captive, reason: HoldReason): void {
  if (cap.cellId && world.holdings.modules[cap.cellId]) return;
  const cell = roomiestCell(world, cap.heldBy);
  if (cell) cap.cellId = cell.id;
  cap.reason ??= reason;
  cap.treatment ??= cap.heldBy === world.playerHouseId ? 'decent' : aiTreatment(world, cap.heldBy, reason);
}

function aiTreatment(world: World, houseId: string, reason: HoldReason): Treatment {
  const p = world.houses[houseId]?.personality;
  if (!p) return 'decent';
  if (p.intrigue > 0.65 && reason === 'spy') return 'isolation';
  if (p.aggression > 0.6 && p.honour < 0.5) return 'harsh';
  return 'decent';
}

// ---------------------------------------------------------------- queries

export function modulesOf(world: World, houseId: string, kind?: ModuleKind): Module[] {
  return Object.values(world.holdings?.modules ?? {}).filter((m) => m.houseId === houseId && (!kind || m.kind === kind) && m.level > 0);
}

export function modulesAt(world: World, sectorId: string): Module[] {
  return Object.values(world.holdings?.modules ?? {}).filter((m) => m.sectorId === sectorId);
}

export function placeOf(world: World, m: Module): string {
  if (m.sectorId) return findSector(world, m.sectorId)?.sector.name ?? 'somewhere';
  if (m.shipId) return `the ${world.fleet?.ships[m.shipId]?.name ?? 'ship'}`;
  return 'somewhere';
}

export function inmates(world: World, cellId: string): { captives: Captive[]; prisoners: Prisoner[] } {
  return {
    captives: Object.values(world.captives ?? {}).filter((c) => c.cellId === cellId && world.characters[c.characterId]?.alive),
    prisoners: Object.values(world.holdings?.prisoners ?? {}).filter((p) => p.cellId === cellId),
  };
}

export function cellCapacity(m: Module): number { return m.level * 4; }

export function cellLoad(world: World, cellId: string): number {
  const i = inmates(world, cellId);
  return i.captives.length + i.prisoners.length;
}

function roomiestCell(world: World, houseId: string): Module | undefined {
  return modulesOf(world, houseId, 'cells').sort((a, b) => (cellCapacity(b) - cellLoad(world, b.id)) - (cellCapacity(a) - cellLoad(world, a.id)))[0];
}

/** How hard it is to get out of (or into) these cells, roughly 5..30. */
export function cellSecurity(world: World, m: Module | undefined): number {
  if (!m) return 4;
  const w = m.overseerId ? world.characters[m.overseerId] : undefined;
  const warden = w?.alive ? (w.stats.perception + w.stats.intrigue) / 2 : 5;
  const crowd = Math.max(0, cellLoad(world, m.id) - cellCapacity(m)) * 2;
  const atSea = m.shipId && world.fleet?.ships[m.shipId] && world.fleet.ships[m.shipId]!.duty !== 'harbour' ? 5 : 0;
  return m.level * 5 + warden * 0.8 - crowd + atSea;
}

export function vaultSecurity(world: World, m: Module): number {
  const vm = m.overseerId ? world.characters[m.overseerId] : undefined;
  const master = vm?.alive ? (vm.stats.perception + vm.stats.stewardship) / 2 : 5;
  const robbed = world.holdings?.cooldown?.[`guard:${m.id}`];
  const alert = robbed && absoluteCycle(world.date) - absoluteCycle(robbed) < CYCLES_PER_ORBIT * 3 ? 8 : 0;
  return m.level * 6 + master * 0.8 + (m.keepers?.length ?? 0) + alert;
}

export function reservesOf(world: World, houseId: string): number {
  return modulesOf(world, houseId, 'vault').reduce((n, v) => n + (v.drives ?? 0), 0);
}

export function caigesIn(world: World, vaultId: string): Caige[] {
  return Object.values(world.armoury ?? {}).filter((c) => c.vaultId === vaultId && !c.bondedTo);
}

/** Share of the vault's Caiges its keepers can watch over, 0..1. Not one keeper per Caige: each can mind about three. */
export function keeperCoverage(world: World, v: Module): number {
  const caiges = caigesIn(world, v.id).length;
  if (!caiges) return 1;
  const skill = (v.keepers ?? []).map((id) => world.characters[id]).filter((c): c is Character => !!c?.alive && !isAway(world, c.id))
    .reduce((n, c) => n + 0.6 + c.stats.resonanceControl / 25, 0);
  return clamp(skill * 3 / caiges, 0, 1);
}

export function stabilityWord(s: number): string {
  return s >= 70 ? 'steady' : s >= 40 ? 'restless' : s >= 15 ? 'unstable' : 'failing';
}

// ---------------------------------------------------------------- player actions (pure)

function act(input: World, fn: (w: World, rng: Rng) => void): World {
  const w = structuredClone(input);
  ensureHoldings(w);
  const rng = new Rng(w.rng);
  fn(w, rng);
  w.rng = rng.state;
  return w;
}

export function buildCost(kind: ModuleKind, toLevel: number): number {
  return BUILD_COST[kind][toLevel - 1] ?? 0;
}

/** The whole bill for raising a module to a level: othes, and metals and components for the work. */
export function buildBill(kind: ModuleKind, toLevel: number): Flow {
  return { othes: buildCost(kind, toLevel), metals: MODULE_GOODS_PER_LEVEL.metals * toLevel, components: MODULE_GOODS_PER_LEVEL.components * toLevel };
}

/** Why a module can't be built here, or null. */
export function cannotBuild(world: World, kind: ModuleKind, sectorId: string): string | null {
  const s = findSector(world, sectorId);
  if (!s || s.planet.houseId !== world.playerHouseId) return 'Not our sector';
  if (modulesAt(world, sectorId).some((m) => m.kind === kind && m.houseId === world.playerHouseId)) return 'Already one here';
  if (kind === 'shipyard' && s.sector.port !== 'spaceport' && s.sector.port !== 'starport') return 'Needs a spaceport or starport';
  if (kind === 'hangar') return 'Hangars go on ships';
  return cannotPay(world, world.playerHouseId, buildBill(kind, 1));
}

export function buildModule(input: World, kind: ModuleKind, sectorId: string): World {
  return act(input, (w) => {
    const why = cannotBuild(w, kind, sectorId);
    if (why) throw new Error(why);
    const P = w.playerHouseId;
    spend(w, P, buildBill(kind, 1), `${MODULE_LABEL[kind]} built at ${findSector(w, sectorId)?.sector.name}`, 'develop');
    const m = newModule(w, P, kind, sectorId, 0);
    m.works = { to: 1, done: addCycles(w.date, CYCLES_PER_PHASE) };
  });
}

/** Fit a module into a great ship: a brig (cells), a strongroom (vault) or a hangar. */
export function cannotFit(world: World, kind: ModuleKind, shipId: string): string | null {
  const s = world.fleet?.ships[shipId];
  if (!s || s.houseId !== world.playerHouseId || s.lost) return 'Not our ship';
  if (kind === 'academy') return 'No room for a school aboard';
  const fitted = Object.values(world.holdings.modules).filter((m) => m.shipId === shipId);
  if (fitted.some((m) => m.kind === kind)) return 'Already fitted';
  const slots = ({ flagship: 4, carrier: 3, cruiser: 2, destroyer: 1 } as Record<string, number>)[s.cls] ?? 2;
  if (fitted.length >= slots) return 'No slots left';
  return cannotPay(world, world.playerHouseId, buildBill(kind, 1));
}

export function fitModule(input: World, kind: ModuleKind, shipId: string): World {
  return act(input, (w) => {
    const why = cannotFit(w, kind, shipId);
    if (why) throw new Error(why);
    const P = w.playerHouseId;
    spend(w, P, buildBill(kind, 1), `${MODULE_LABEL[kind]} fitted to the ${w.fleet.ships[shipId]!.name}`, 'develop');
    const id = `mod${w.nextId++}`;
    w.holdings.modules[id] = { id, kind, houseId: P, shipId, level: 0, overseerId: null, built: w.date, works: { to: 1, done: addCycles(w.date, CYCLES_PER_PHASE) }, ...(kind === 'vault' ? { drives: 0, keepers: [] } : {}) };
  });
}

export function upgradeModule(input: World, id: string): World {
  return act(input, (w) => {
    const m = w.holdings.modules[id];
    if (!m || m.houseId !== w.playerHouseId || m.works || m.level >= 3) throw new Error('Cannot improve that.');
    const bill = buildBill(m.kind, m.level + 1);
    const why = cannotPay(w, m.houseId, bill);
    if (why) throw new Error(`${why}.`);
    spend(w, m.houseId, bill, `${MODULE_LABEL[m.kind]} at ${placeOf(w, m)} to level ${m.level + 1}`, 'develop');
    m.works = { to: m.level + 1, done: addCycles(w.date, CYCLES_PER_PHASE * (m.level + 1)) };
  });
}

export function setModuleOverseer(input: World, id: string, characterId: string | null): World {
  return act(input, (w) => {
    const m = w.holdings.modules[id];
    if (!m || m.houseId !== w.playerHouseId) return;
    m.overseerId = characterId;
  });
}

export function deposit(input: World, vaultId: string, amount: number): World {
  return act(input, (w) => {
    const v = w.holdings.modules[vaultId];
    if (!v || v.kind !== 'vault' || v.houseId !== w.playerHouseId) return;
    const room = VAULT_CAPACITY[v.level]! - (v.drives ?? 0);
    const put = Math.max(0, Math.min(amount, room, econ(w, v.houseId).stock.othes));
    if (!put) return;
    record(w, v.houseId, { resource: 'othes', amount: -put, label: `Put on ledger drives at ${placeOf(w, v)}`, kind: 'trade', sectorId: v.sectorId });
    v.drives = (v.drives ?? 0) + put;
  });
}

export function withdraw(input: World, vaultId: string, amount: number): World {
  return act(input, (w) => {
    const v = w.holdings.modules[vaultId];
    if (!v || v.kind !== 'vault' || v.houseId !== w.playerHouseId) return;
    const take = Math.max(0, Math.min(amount, v.drives ?? 0));
    if (!take) return;
    v.drives = (v.drives ?? 0) - take;
    record(w, v.houseId, { resource: 'othes', amount: take, label: `Drawn from the vault at ${placeOf(w, v)}`, kind: 'trade', sectorId: v.sectorId });
  });
}

export function setKeeper(input: World, vaultId: string, characterId: string, on: boolean): World {
  return act(input, (w) => {
    const v = w.holdings.modules[vaultId];
    if (!v || v.kind !== 'vault') return;
    const ks = new Set(v.keepers ?? []);
    if (on) ks.add(characterId); else ks.delete(characterId);
    v.keepers = [...ks];
  });
}

/** Bonding takes a Caige out of the vault; giving it back puts it in. */
export function returnCaige(input: World, caigeId: string): World {
  return act(input, (w) => {
    const c = w.armoury[caigeId];
    if (!c || !c.bondedTo) return;
    const holder = w.characters[c.bondedTo];
    if (holder) {
      holder.flags = holder.flags.filter((f) => f.id !== 'caigeBonded');
      shiftMood(holder, -8);
    }
    c.bondedTo = undefined;
    storeInVault(w, c);
    logRecord(w, { kind: 'world', type: 'world', severity: 1, text: `${c.name} is unbonded and laid back in the vault.`, who: holder ? [{ id: holder.id, part: 'gave it up' }] : [] });
  });
}

export function setTreatment(input: World, id: string, t: Treatment): World {
  return act(input, (w) => {
    const cap = w.captives[id];
    const pr = w.holdings.prisoners[id];
    if (cap && cap.heldBy === w.playerHouseId) cap.treatment = t;
    if (pr && pr.heldBy === w.playerHouseId) pr.treatment = t;
  });
}

export function setReason(input: World, id: string, r: HoldReason): World {
  return act(input, (w) => {
    const cap = w.captives[id];
    if (cap && cap.heldBy === w.playerHouseId) cap.reason = r;
    const pr = w.holdings.prisoners[id];
    if (pr && pr.heldBy === w.playerHouseId) pr.reason = r;
  });
}

export function moveToCell(input: World, id: string, cellId: string): World {
  return act(input, (w) => {
    const m = w.holdings.modules[cellId];
    if (!m || m.kind !== 'cells' || m.houseId !== w.playerHouseId) return;
    const cap = w.captives[id];
    if (cap) cap.cellId = cellId;
    const pr = w.holdings.prisoners[id];
    if (pr) pr.cellId = cellId;
  });
}

export function releasePrisoner(input: World, id: string): World {
  return act(input, (w) => {
    const p = w.holdings.prisoners[id];
    if (!p) return;
    delete w.holdings.prisoners[id];
    if (p.houseId && w.houses[p.houseId]) shiftRelation(w, p.houseId, w.playerHouseId, 3);
    logRecord(w, { kind: 'world', type: 'captive', severity: 0, text: `${p.name}, ${p.what}, is let go.`, placeId: w.holdings.modules[p.cellId]?.sectorId });
  });
}

export function executePrisoner(input: World, id: string): World {
  return act(input, (w) => {
    const p = w.holdings.prisoners[id];
    if (!p) return;
    delete w.holdings.prisoners[id];
    const st = w.houses[w.playerHouseId]!.standing;
    st.dread = clamp(st.dread + 1, 0, 100);
    if (p.reason !== 'crime') st.honour = clamp(st.honour - 1, 0, 100);
    if (p.houseId && w.houses[p.houseId]) shiftRelation(w, p.houseId, w.playerHouseId, -10);
    logRecord(w, { kind: 'world', type: 'captive', severity: 1, text: `${p.name}, ${p.what}, is put to death in our cells.`, effects: ['Dread +1', ...(p.reason !== 'crime' ? ['Honour −1'] : [])], placeId: w.holdings.modules[p.cellId]?.sectorId });
  });
}

/** Send someone to break one of ours out of a rival's cells. */
export const RESCUE_COST = 800;
export function cannotRescue(world: World, captiveId: string, agentId: string): string | null {
  const cap = world.captives[captiveId];
  const a = world.characters[agentId];
  if (!cap || world.characters[captiveId]?.houseId !== world.playerHouseId) return 'Not one of ours';
  if (cap.treatment === 'isolation') return 'Sealed in isolation: no one can reach them';
  if (world.holdings.ops.some((o) => o.targetId === captiveId)) return 'A rescue is already under way';
  if (!a || !a.alive || a.houseId !== world.playerHouseId || isAway(world, a.id)) return 'They cannot go';
  if (econ(world, world.playerHouseId).stock.othes < RESCUE_COST) return 'Not enough othes';
  return null;
}

export function mountRescue(input: World, captiveId: string, agentId: string): World {
  return act(input, (w) => {
    const why = cannotRescue(w, captiveId, agentId);
    if (why) throw new Error(why);
    const cap = w.captives[captiveId]!;
    const P = w.playerHouseId;
    record(w, P, { resource: 'othes', amount: -RESCUE_COST, label: `Rescue of ${shortName(w.characters[captiveId]!.name)}`, kind: 'mission' });
    const agent = w.characters[agentId]!;
    agent.flags.push({ id: 'travelling', since: w.date, detail: 'on a rescue' });
    w.holdings.ops.push({ id: `op${w.nextId++}`, kind: 'rescue', houseId: P, targetHouseId: cap.heldBy, targetId: captiveId, agentId, started: w.date, done: addCycles(w.date, CYCLES_PER_PHASE) });
  });
}

/** Rob a rival's vault: othes, a Caige, or their records. */
export const HEIST_COST = 1200;
export function cannotHeist(world: World, vaultId: string, agentId: string): string | null {
  const v = world.holdings.modules[vaultId];
  const a = world.characters[agentId];
  if (!v || v.kind !== 'vault' || v.houseId === world.playerHouseId) return 'No such vault';
  if (world.holdings.ops.some((o) => o.targetId === vaultId && o.houseId === world.playerHouseId)) return 'Already under way';
  if (!a || !a.alive || a.houseId !== world.playerHouseId || isAway(world, a.id)) return 'They cannot go';
  if (econ(world, world.playerHouseId).stock.othes < HEIST_COST) return 'Not enough othes';
  return null;
}

export function mountHeist(input: World, vaultId: string, agentId: string): World {
  return act(input, (w) => {
    const why = cannotHeist(w, vaultId, agentId);
    if (why) throw new Error(why);
    const v = w.holdings.modules[vaultId]!;
    const P = w.playerHouseId;
    record(w, P, { resource: 'othes', amount: -HEIST_COST, label: `Heist on House ${w.houses[v.houseId]?.name}`, kind: 'mission' });
    w.characters[agentId]!.flags.push({ id: 'travelling', since: w.date, detail: 'on a heist' });
    w.holdings.ops.push({ id: `op${w.nextId++}`, kind: 'heist', houseId: P, targetHouseId: v.houseId, targetId: vaultId, agentId, started: w.date, done: addCycles(w.date, CYCLES_PER_PHASE) });
  });
}

// ---------------------------------------------------------------- hooks for other systems

/** A nobody caught at our docks goes to our cells. */
export function imprison(world: World, houseId: string, name: string, what: string, from: string | null, reason: HoldReason, wits: number, sectorId?: string): Prisoner | undefined {
  ensureHoldings(world);
  const cells = (sectorId ? modulesAt(world, sectorId).find((m) => m.kind === 'cells' && m.houseId === houseId && m.level > 0) : undefined) ?? roomiestCell(world, houseId);
  if (!cells) return undefined;
  const p: Prisoner = {
    id: `pr${world.nextId++}`, name, houseId: from, what, heldBy: houseId, cellId: cells.id, reason, since: world.date,
    treatment: houseId === world.playerHouseId ? 'decent' : aiTreatment(world, houseId, reason), wits: clamp(Math.round(wits), 1, 20),
    until: reason === 'crime' ? addCycles(world.date, CYCLES_PER_ORBIT * 2) : undefined,
  };
  world.holdings.prisoners[p.id] = p;
  return p;
}

/** Othes a raid can carry off: only what is not on ledger drives in a vault there. */
export function vaultedAt(world: World, sectorId: string): number {
  return modulesAt(world, sectorId).filter((m) => m.kind === 'vault').reduce((n, v) => n + (v.drives ?? 0), 0);
}

// ---------------------------------------------------------------- the passage of time

function finishWorks(world: World) {
  const now = absoluteCycle(world.date);
  for (const m of Object.values(world.holdings.modules)) {
    if (!m.works || absoluteCycle(m.works.done) > now) continue;
    m.level = m.works.to;
    delete m.works;
    if (m.kind === 'base' && m.sectorId && !modulesAt(world, m.sectorId).some((x) => x.kind === 'cells' && x.houseId === m.houseId)) newModule(world, m.houseId, 'cells', m.sectorId, 1);
    if (m.houseId === world.playerHouseId) {
      logRecord(world, { kind: 'world', type: 'economy', severity: 1, text: `${m.level === 1 ? 'New' : 'Improved'} ${MODULE_LABEL[m.kind].toLowerCase()} at ${placeOf(world, m)} ${m.level === 1 ? 'are' : 'now'} ready${m.level > 1 ? ` (level ${m.level})` : ''}.`, placeId: m.sectorId });
    }
  }
}

/** One escape attempt's odds per Phase. */
export function escapeChance(world: World, wits: number, cell: Module | undefined, t: Treatment): number {
  const sec = cellSecurity(world, cell);
  let p = clamp(0.04 + (wits - sec) * 0.006, 0.004, 0.3);
  if (t === 'isolation') p *= 0.5;
  if (t === 'harsh') p += 0.006;
  return p;
}

function wits(c: Character): number {
  return (c.stats.agility + c.stats.stealth + c.stats.deception + c.stats.intellect) / 4;
}

function freeCaptive(world: World, cap: Captive) {
  const c = world.characters[cap.characterId]!;
  c.flags = c.flags.filter((f) => f.id !== 'captive' && f.id !== 'missing');
  const home = world.planets[world.houses[c.houseId]?.capitalPlanetId ?? ''];
  if (home) c.location = { planetId: home.id, sectorId: home.sectors[0]!.id };
  delete world.captives[cap.characterId];
}

function capture(world: World, c: Character, by: string, reason: HoldReason, why: string) {
  c.flags.push({ id: 'captive', since: world.date, detail: `held by ${houseName(world, by)}`, knownBy: [by, c.houseId] }, { id: 'missing', since: world.date });
  world.captives[c.id] = { characterId: c.id, heldBy: by, since: world.date, interrogated: false, reason };
  placeCaptive(world, world.captives[c.id]!, reason);
  learn(world, by, c.id, 30);
  void why;
}

function cellsLife(world: World, rng: Rng) {
  const P = world.playerHouseId;
  // Captives of note.
  for (const cap of Object.values(world.captives ?? {})) {
    const c = world.characters[cap.characterId];
    if (!c?.alive) continue;
    placeCaptive(world, cap, 'spy');
    const cell = cap.cellId ? world.holdings.modules[cap.cellId] : undefined;
    const t = cap.treatment ?? 'decent';
    const holder = world.houses[cap.heldBy];
    // How they are kept.
    if (t === 'harsh') {
      shiftMood(c, -6);
      if (holder && cap.reason !== 'crime') holder.standing.honour = clamp(holder.standing.honour - 1, 0, 100);
      shiftRelation(world, c.houseId, cap.heldBy, -3);
      if (c.stats.constitution < 6 && rng.chance(0.04)) {
        kill(world, c, world.date, `died in the cells of ${houseName(world, cap.heldBy)}`);
        delete world.captives[c.id];
        shiftRelation(world, c.houseId, cap.heldBy, -30);
        continue;
      }
    } else if (t === 'isolation') {
      shiftMood(c, -4);
      if (rng.chance(0.06) && c.stats.willpower > 1) c.stats.willpower -= 1;
    } else {
      shiftMood(c, -1);
      // The decent jailer: some come round.
      const turn = 0.02 * Math.max(0, 14 - c.hidden.loyalty) / 6 * ((100 - (c.mood ?? 50)) / 60);
      const heldOrbits = (absoluteCycle(world.date) - absoluteCycle(cap.since)) / CYCLES_PER_ORBIT;
      if (heldOrbits >= 1 && c.tier === 'full' && !c.seat && rng.chance(turn)) { defect(world, cap); continue; }
    }
    // Escape.
    if (rng.chance(escapeChance(world, wits(c), cell, t))) {
      freeCaptive(world, cap);
      shiftRelation(world, c.houseId, cap.heldBy, -5);
      if (holder) holder.standing.respect = clamp(holder.standing.respect - 1, 0, 100);
      if (cap.heldBy === P || c.houseId === P) {
        logRecord(world, {
          kind: 'intrigue', type: 'captive', severity: 2,
          text: cap.heldBy === P ? `${displayName(c.name)} has escaped our cells at ${cell ? placeOf(world, cell) : 'the capital'}.` : `${displayName(c.name)} has broken out of the cells of ${houseName(world, cap.heldBy)} and is coming home.`,
          who: [{ id: c.id, part: 'escaped' }, ...(cell?.overseerId ? [{ id: cell.overseerId, part: 'warden' }] : [])], placeId: cell?.sectorId,
          effects: cap.heldBy === P ? ['Respect −1'] : [],
        });
        const lord = world.houses[P]?.rulerId;
        if (cap.heldBy === P && cell?.overseerId && lord) shiftOpinion(world, lord, cell.overseerId, -10, 'let a prisoner escape');
        if (c.houseId === P) shiftMood(c, 10);
      }
      continue;
    }
    // A rival may try to get their own back from us.
    if (cap.heldBy === P && t !== 'isolation' && c.houseId !== P) aiRescue(world, rng, cap);
  }
  // Nobodies.
  for (const p of Object.values(world.holdings.prisoners)) {
    const cell = world.holdings.modules[p.cellId];
    if (!cell) { delete world.holdings.prisoners[p.id]; continue; }
    if (p.until && absoluteCycle(p.until) <= absoluteCycle(world.date)) {
      delete world.holdings.prisoners[p.id];
      if (p.heldBy === P) logRecord(world, { kind: 'world', type: 'captive', severity: 0, text: `${p.name} has served their sentence and is let out.`, placeId: cell.sectorId });
      continue;
    }
    if (p.treatment === 'harsh' && p.reason !== 'crime') {
      const st = world.houses[p.heldBy]?.standing;
      if (st && rng.chance(0.5)) st.honour = clamp(st.honour - 1, 0, 100);
    }
    if (rng.chance(escapeChance(world, p.wits, cell, p.treatment))) {
      delete world.holdings.prisoners[p.id];
      if (p.heldBy === P) {
        logRecord(world, { kind: 'intrigue', type: 'captive', severity: 1, text: `${p.name}, the ${p.what}, has slipped out of our cells at ${placeOf(world, cell)}.`, placeId: cell.sectorId, who: cell.overseerId ? [{ id: cell.overseerId, part: 'warden' }] : [] });
      }
    }
  }
}

/** A captive treated well comes over to us. */
function defect(world: World, cap: Captive) {
  const c = world.characters[cap.characterId]!;
  const from = c.houseId;
  const to = cap.heldBy;
  freeCaptive(world, cap);
  const famId = `${to}:line-${world.nextId++}`;
  const oldFam = world.families[c.familyId];
  world.families[famId] = { id: famId, houseId: to, name: oldFam?.name || c.name.family || c.name.given, species: c.species, ruling: false, high: false };
  c.houseId = to;
  c.familyId = famId;
  c.role = `Turncoat (${c.role.toLowerCase()})`;
  const home = world.planets[world.houses[to]!.capitalPlanetId]!;
  c.location = { planetId: home.id, sectorId: home.sectors[0]!.id };
  c.mood = 55;
  c.flags.push({ id: 'turncoat', since: world.date, detail: `once of ${houseName(world, from)}`, knownBy: [to, from] });
  learn(world, to, c.id, 60);
  shiftRelation(world, from, to, -15);
  // They tell what they know.
  for (const k of Object.values(world.characters)) if (k.alive && k.houseId === from && k.seat) learn(world, to, k.id, 25);
  if (to === world.playerHouseId || from === world.playerHouseId) {
    logRecord(world, {
      kind: 'intrigue', type: 'intrigue', severity: 3,
      text: to === world.playerHouseId ? `${displayName(c.name)}, held in our cells, has asked to swear to our house. ${houseName(world, from)} has lost them.` : `${displayName(c.name)}, held by ${houseName(world, to)}, has gone over to them.`,
      detail: to === world.playerHouseId ? 'Decent treatment did what questioning could not. They told us all they knew of their old council.' : 'Whatever they knew of us, our enemies know now.',
      who: [{ id: c.id, part: 'turned' }], houseIds: [from, to],
      effects: [`${houseName(world, from)} regard −15`, ...(to === world.playerHouseId ? ['We know their council better'] : [])],
    });
  }
}

/** A rival tries to break their person out of our cells. */
function aiRescue(world: World, rng: Rng, cap: Captive) {
  const c = world.characters[cap.characterId]!;
  const h = world.houses[c.houseId];
  if (!h) return;
  const want = 0.025 + h.personality.aggression * 0.04 + (c.seat ? 0.05 : 0) + (c.tier === 'full' ? 0.01 : 0);
  // A house that just tried and failed waits a while before trying again.
  const cool = world.holdings.cooldown?.[`rescue:${h.id}`];
  if (cool && absoluteCycle(world.date) - absoluteCycle(cool) < CYCLES_PER_ORBIT * 2) return;
  if (!rng.chance(want)) return;
  (world.holdings.cooldown ??= {})[`rescue:${h.id}`] = world.date;
  const team = Object.values(world.characters).filter((k) => k.alive && k.houseId === h.id && k.tier === 'full' && !k.seat && !isAway(world, k.id) && k.role !== 'Highroy');
  if (!team.length) return;
  const agent = team.sort((a, b) => wits(b) + b.stats.duelling / 2 - (wits(a) + a.stats.duelling / 2))[0]!;
  const cell = cap.cellId ? world.holdings.modules[cap.cellId] : undefined;
  const P = world.playerHouseId;
  const roll = wits(agent) + agent.stats.duelling / 3 + 2 + rng.gauss() * 4 - cellSecurity(world, cell);
  if (roll > -5 && roll <= 0) {
    if (rng.chance(0.5)) logRecord(world, { kind: 'intrigue', type: 'intrigue', severity: 1, text: `Someone tried the cells at ${cell ? placeOf(world, cell) : 'the capital'} in the night and fled when the alarm went up.`, placeId: cell?.sectorId, who: cell?.overseerId ? [{ id: cell.overseerId, part: 'warden' }] : [] });
    return;
  }
  if (roll > 0) {
    freeCaptive(world, cap);
    shiftBoth(world, agent.id, c.id, 30, 'broke them out');
    world.houses[P]!.standing.respect = clamp(world.houses[P]!.standing.respect - 2, 0, 100);
    logRecord(world, {
      kind: 'intrigue', type: 'fight', severity: 2,
      text: `${houseName(world, h.id)} has broken ${displayName(c.name)} out of our cells at ${cell ? placeOf(world, cell) : 'the capital'}.`,
      detail: `It was done by ${displayName(agent.name)}. Our warden ${cell?.overseerId ? displayName(world.characters[cell.overseerId]!.name) : '(none named)'} could not stop them.`,
      who: [{ id: c.id, part: 'freed' }, { id: agent.id, part: 'rescuer' }, ...(cell?.overseerId ? [{ id: cell.overseerId, part: 'warden' }] : [])],
      placeId: cell?.sectorId, houseIds: [h.id], effects: ['Respect −2'],
    });
    learn(world, P, agent.id, 20);
  } else {
    capture(world, agent, P, 'spy', 'caught breaking in');
    shiftRelation(world, h.id, P, -4);
    logRecord(world, {
      kind: 'intrigue', type: 'captive', severity: 2,
      text: `A rescue failed: ${displayName(agent.name)} of ${houseName(world, h.id)} was caught trying to free ${displayName(c.name)}. Now we hold both.`,
      who: [{ id: agent.id, part: 'caught' }, { id: c.id, part: 'still held' }, ...(cell?.overseerId ? [{ id: cell.overseerId, part: 'warden' }] : [])],
      placeId: cell?.sectorId, houseIds: [h.id], effects: ['Another captive'],
    });
  }
}

function resolveOps(world: World, rng: Rng) {
  const now = absoluteCycle(world.date);
  const P = world.playerHouseId;
  for (const op of [...world.holdings.ops]) {
    if (absoluteCycle(op.done) > now) continue;
    world.holdings.ops = world.holdings.ops.filter((o) => o.id !== op.id);
    const a = world.characters[op.agentId];
    if (!a?.alive) continue;
    a.flags = a.flags.filter((f) => !(f.id === 'travelling' && /rescue|heist/.test(f.detail ?? '')));
    if (op.kind === 'rescue') {
      const cap = world.captives[op.targetId];
      const c = world.characters[op.targetId];
      if (!cap || !c) { if (op.houseId === P) logRecord(world, { kind: 'intrigue', type: 'mission', severity: 1, text: `${displayName(a.name)} came back: there was no one left to rescue.`, who: [{ id: a.id, part: 'rescuer' }] }); continue; }
      const cell = cap.cellId ? world.holdings.modules[cap.cellId] : undefined;
      const roll = wits(a) + a.stats.duelling / 3 + a.stats.tactics / 4 + rng.gauss() * 4 - cellSecurity(world, cell);
      if (roll > 0) {
        freeCaptive(world, cap);
        shiftBoth(world, a.id, c.id, 35, 'broke them out');
        tally(world, a.id, 'rescues');
        shiftRelation(world, op.targetHouseId, P, -8);
        world.houses[P]!.standing.dread = clamp(world.houses[P]!.standing.dread + 2, 0, 100);
        logRecord(world, {
          kind: 'intrigue', type: 'fight', severity: 3, text: `${displayName(a.name)} has broken ${displayName(c.name)} out of the cells of ${houseName(world, op.targetHouseId)}. Both are coming home.`,
          who: [{ id: a.id, part: 'rescuer' }, { id: c.id, part: 'freed' }], houseIds: [op.targetHouseId], placeId: cell?.sectorId,
          effects: ['Dread +2', `${houseName(world, op.targetHouseId)} regard −8`, 'A bond between them'],
        });
        shiftMood(a, 10); shiftMood(c, 15);
      } else if (roll > -6) {
        a.flags.push({ id: 'wounded', since: world.date, until: addCycles(world.date, CYCLES_PER_PHASE * 2) });
        logRecord(world, { kind: 'intrigue', type: 'fight', severity: 2, text: `The rescue of ${displayName(c.name)} failed. ${displayName(a.name)} got away, wounded.`, who: [{ id: a.id, part: 'rescuer, wounded' }, { id: c.id, part: 'still held' }], houseIds: [op.targetHouseId] });
        if (cap.treatment !== 'isolation' && rng.chance(0.5)) cap.treatment = 'isolation';
      } else {
        capture(world, a, op.targetHouseId, 'spy', 'caught on a rescue');
        shiftRelation(world, op.targetHouseId, P, -6);
        logRecord(world, { kind: 'intrigue', type: 'captive', severity: 3, text: `The rescue went wrong. ${houseName(world, op.targetHouseId)} now holds ${displayName(a.name)} as well as ${displayName(c.name)}.`, who: [{ id: a.id, part: 'captured' }, { id: c.id, part: 'still held' }], houseIds: [op.targetHouseId] });
      }
    } else {
      const v = world.holdings.modules[op.targetId];
      if (!v) continue;
      heist(world, rng, a, v);
    }
  }
}

/** Someone tries to rob a vault. */
function heist(world: World, rng: Rng, thief: Character, v: Module) {
  const P = world.playerHouseId;
  const sec = vaultSecurity(world, v);
  const roll = (thief.stats.stealth + thief.stats.intrigue + thief.stats.deception) / 3 + rng.gauss() * 4 - sec * 0.6;
  const owner = v.houseId;
  const by = thief.houseId;
  const ours = owner === P || by === P;
  if (roll > 0) {
    const caiges = caigesIn(world, v.id);
    const pick = rng.next();
    let what = '';
    const effects: string[] = [];
    if (caiges.length && pick < 0.25) {
      const c = rng.pick(caiges);
      c.houseId = by;
      c.vaultId = undefined;
      storeInVault(world, c);
      what = `the Caige ${c.name}`;
      effects.push(`${c.name} changes hands`);
    } else if (pick < 0.55 || (v.drives ?? 0) < 1000) {
      for (const k of Object.values(world.characters)) if (k.alive && k.houseId === owner && k.tier === 'full') learn(world, by, k.id, 15);
      what = 'the house records';
      effects.push(`${houseName(world, by)} knows ${houseName(world, owner)}'s people better`);
    } else {
      const take = Math.min(15000, Math.round((v.drives ?? 0) * (0.05 + rng.next() * 0.1)));
      v.drives = (v.drives ?? 0) - take;
      record(world, by, { resource: 'othes', amount: take, label: `Taken from the vault of ${houseName(world, owner)}`, kind: 'raid' });
      what = `${fmt(take)} othes on ledger drives`;
      effects.push(`−${fmt(take)} othes for ${houseName(world, owner)}`);
    }
    shiftRelation(world, owner, by, rng.chance(0.5) ? -10 : -2);
    // The vaultmaster doubles the guard for a good while.
    (world.holdings.cooldown ??= {})[`guard:${v.id}`] = world.date;
    if (ours) logRecord(world, {
      kind: 'intrigue', type: 'intrigue', severity: owner === P ? 3 : 2,
      text: owner === P ? `Our vault at ${placeOf(world, v)} has been robbed: ${what} gone.` : `${displayName(thief.name)} has robbed the vault of ${houseName(world, owner)}: ${what}.`,
      detail: owner === P ? `Who did it is not certain. ${rng.chance(0.5) ? `Whispers name ${houseName(world, by)}.` : 'No one saw a face.'}` : undefined,
      who: [...(by === P ? [{ id: thief.id, part: 'thief' }] : []), ...(owner === P && v.overseerId ? [{ id: v.overseerId, part: 'vaultmaster' }] : [])],
      placeId: v.sectorId, houseIds: [owner, by], effects,
    });
    if (by === P) shiftMood(thief, 8);
    tally(world, thief.id, 'heists');
  } else if (roll > -5) {
    if (ours) logRecord(world, { kind: 'intrigue', type: 'intrigue', severity: 1, text: owner === P ? `Someone tried our vault at ${placeOf(world, v)} and got nowhere.` : `${displayName(thief.name)} could not get into the vault of ${houseName(world, owner)} and slipped away.`, placeId: v.sectorId, who: by === P ? [{ id: thief.id, part: 'thief' }] : [] });
  } else {
    capture(world, thief, owner, 'crime', 'caught in the vault');
    shiftRelation(world, owner, by, -12);
    if (ours) logRecord(world, {
      kind: 'intrigue', type: 'captive', severity: 2,
      text: owner === P ? `A thief was caught in our vault at ${placeOf(world, v)}: ${displayName(thief.name)} of ${houseName(world, by)}.` : `${displayName(thief.name)} was caught in the vault of ${houseName(world, owner)}.`,
      who: [{ id: thief.id, part: 'caught' }], placeId: v.sectorId, houseIds: [owner, by],
    });
  }
}

/** Rival houses with a grudge and a taste for intrigue try our vaults, and each other's. */
function aiHeists(world: World, rng: Rng) {
  for (const h of Object.values(world.houses)) {
    if (h.id === world.playerHouseId) continue;
    const cool = world.holdings.cooldown?.[`heist:${h.id}`];
    if (cool && absoluteCycle(world.date) - absoluteCycle(cool) < CYCLES_PER_ORBIT * 4) continue;
    if (!rng.chance(0.006 + h.personality.intrigue * 0.02 + h.personality.greed * 0.012)) continue;
    (world.holdings.cooldown ??= {})[`heist:${h.id}`] = world.date;
    const targets = Object.values(world.houses).filter((o) => o.id !== h.id && relation(world, h.id, o.id) < 10);
    if (!targets.length) continue;
    const t = rng.pick(targets);
    const v = modulesOf(world, t.id, 'vault')[0];
    if (!v) continue;
    const thief = Object.values(world.characters).filter((k) => k.alive && k.houseId === h.id && k.tier === 'full' && !k.seat && !isAway(world, k.id))
      .sort((a, b) => b.stats.stealth - a.stats.stealth)[0];
    if (thief) heist(world, rng, thief, v);
  }
}

/** Caiges kept in vaults drift unless someone keeps watch. */
function caigeStability(world: World, rng: Rng) {
  const P = world.playerHouseId;
  // Loose Caiges, with no vault to hold them, slip quickly.
  for (const c of Object.values(world.armoury ?? {})) {
    if (c.bondedTo || c.vaultId) continue;
    const before = c.stability ?? 85;
    c.stability = Math.max(0, Math.round((before - 4 + rng.gauss()) * 10) / 10);
    if (before >= 40 && c.stability < 40 && c.houseId === P) logRecord(world, { kind: 'world', type: 'condition', severity: 2, text: `${c.name} has no place in any vault and is growing restless in the armoury.`, detail: 'Build a vault, or improve one, to give it a home.' });
  }
  for (const v of Object.values(world.holdings.modules)) {
    if (v.kind !== 'vault') continue;
    v.keepers = (v.keepers ?? []).filter((id) => world.characters[id]?.alive && world.characters[id]?.houseId === v.houseId);
    const caiges = caigesIn(world, v.id);
    if (!caiges.length) continue;
    const cover = keeperCoverage(world, v);
    for (const c of caiges) {
      const before = c.stability ?? 85;
      const next = clamp(before - (3 - 4 * cover) + rng.gauss() * 1.5, 0, 100);
      c.stability = Math.round(next * 10) / 10;
      if (v.houseId !== P && cover < 0.5 && rng.chance(0.3)) {
        // Rivals notice and assign another keeper.
        const k = Object.values(world.characters).find((x) => x.alive && x.houseId === v.houseId && x.tier === 'full' && x.resonance && !(v.keepers ?? []).includes(x.id) && !x.seat);
        if (k) v.keepers = [...(v.keepers ?? []), k.id];
      }
      if (before >= 40 && next < 40 && v.houseId === P) {
        logRecord(world, {
          kind: 'world', type: 'condition', severity: 2, text: `${c.name} has grown restless in the vault at ${placeOf(world, v)}. Its navisium is starting to slip.`,
          detail: `Stability ${Math.round(next)}. More keepers, or keepers with better resonance control, will steady it.`, placeId: v.sectorId,
          who: (v.keepers ?? []).map((id) => ({ id, part: 'keeper' })),
        });
        world.ports && (world.ports.alerts += 1);
      }
      if (next < 15) destabilise(world, rng, v, c);
    }
  }
}

function destabilise(world: World, rng: Rng, v: Module, c: Caige) {
  const P = world.playerHouseId;
  const keepers = (v.keepers ?? []).map((id) => world.characters[id]).filter((k): k is Character => !!k?.alive);
  const r = rng.next();
  let text: string;
  const effects: string[] = [];
  const who: { id: string; part: string }[] = [];
  if (r < 0.4 && keepers.length) {
    const k = rng.pick(keepers);
    k.flags.push({ id: 'wounded', since: world.date, until: addCycles(world.date, CYCLES_PER_PHASE * 3) });
    c.stability = 35;
    text = `${c.name} flared in the vault at ${placeOf(world, v)}. ${displayName(k.name)} held it down and was burned for it.`;
    who.push({ id: k.id, part: 'keeper, wounded' });
    effects.push(`${shortName(k.name)} wounded`, `${c.name} steadied (35)`);
  } else if (r < 0.65 && keepers.length) {
    const k = keepers.sort((a, b) => b.stats.resonanceControl - a.stats.resonanceControl)[0]!;
    k.stats.caigeSync = clamp(k.stats.caigeSync + 2, 1, 20);
    k.stats.resonanceControl = clamp(k.stats.resonanceControl + 1, 1, 20);
    c.stability = 45;
    text = `${c.name} surged in the night, and ${displayName(k.name)} rode it out. They came out of the vault changed: something in them answers Caiges now.`;
    who.push({ id: k.id, part: 'keeper, changed' });
    effects.push('Caige sync +2', 'Resonance control +1');
  } else {
    delete world.armoury[c.id];
    text = `${c.name} has failed. Its navisium came apart in the vault at ${placeOf(world, v)}, and the room is scorched black.`;
    effects.push(`${c.name} lost for ever`);
    for (const k of keepers) { who.push({ id: k.id, part: 'keeper' }); shiftMood(k, -10); }
    const st = world.houses[v.houseId]?.standing;
    if (st) st.respect = clamp(st.respect - 3, 0, 100);
    effects.push('Respect −3');
  }
  if (v.houseId === P) {
    logRecord(world, { kind: 'world', type: 'condition', severity: 3, text, who, effects, placeId: v.sectorId });
    if (world.ports) world.ports.alerts += 1;
  }
}

/** Reserves on drives steady a house's name: lenders and the Numarade notice. */
function reservesStanding(world: World) {
  for (const h of Object.values(world.houses)) {
    const r = reservesOf(world, h.id);
    if (r >= 25000 && h.standing.respect < 70) h.standing.respect = clamp(h.standing.respect + 1, 0, 100);
  }
}

/** Rival houses build and put money away too. */
function aiBuild(world: World, rng: Rng) {
  for (const h of Object.values(world.houses)) {
    if (h.id === world.playerHouseId) continue;
    const e = world.economy?.houses[h.id];
    if (!e) continue;
    const vault = modulesOf(world, h.id, 'vault')[0];
    if (vault && e.stock.othes > 8000) {
      const room = VAULT_CAPACITY[vault.level]! - (vault.drives ?? 0);
      const put = Math.max(0, Math.min(room, Math.round((e.stock.othes - 5000) * 0.5)));
      e.stock.othes -= put;
      vault.drives = (vault.drives ?? 0) + put;
      if (room < 5000 && vault.level < 3 && !vault.works && rng.chance(0.3)) vault.works = { to: vault.level + 1, done: addCycles(world.date, CYCLES_PER_PHASE * 2) };
    }
    if (vault && e.stock.othes < 500 && (vault.drives ?? 0) > 0) {
      const take = Math.min(vault.drives ?? 0, 3000);
      vault.drives = (vault.drives ?? 0) - take;
      e.stock.othes += take;
    }
    const cells = modulesOf(world, h.id, 'cells');
    const full = cells.every((m) => cellLoad(world, m.id) >= cellCapacity(m));
    if (full && cells[0] && cells[0].level < 3 && !cells[0].works && e.stock.othes > 4000) {
      e.stock.othes -= buildCost('cells', cells[0].level + 1);
      cells[0].works = { to: cells[0].level + 1, done: addCycles(world.date, CYCLES_PER_PHASE * 2) };
    }
  }
}

export function advanceHoldings(world: World, rng: Rng, phaseTurned: boolean, orbitTurned: boolean): void {
  ensureHoldings(world);
  finishWorks(world);
  for (const c of Object.values(world.armoury ?? {})) storeInVault(world, c);
  resolveOps(world, rng);
  if (!phaseTurned) return;
  // Bases cost their garrison's pay.
  for (const m of Object.values(world.holdings.modules)) {
    if (m.kind !== 'base' || m.level < 1) continue;
    const e = world.economy?.houses[m.houseId];
    if (!e) continue;
    const pay = 120 * m.level;
    if (m.houseId === world.playerHouseId) record(world, m.houseId, { resource: 'othes', amount: -Math.min(pay, e.stock.othes), label: `Garrison pay at ${placeOf(world, m)}`, kind: 'stipend', sectorId: m.sectorId });
    else e.stock.othes = Math.max(0, e.stock.othes - pay);
  }
  cellsLife(world, rng);
  caigeStability(world, rng);
  aiBuild(world, rng);
  aiHeists(world, rng);
  if (orbitTurned) reservesStanding(world);
}
