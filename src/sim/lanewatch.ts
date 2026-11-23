// Holding a lane, closing trade, and knowing what moves.
//
// A lane watch: a knight and some ships sent to sit on a lane. Securing it makes every friendly run safer
// and the sectors at either end quieter; blockading it also stops other houses' convoys and takes what
// they carry. Either way it costs upkeep every Phase, and the knight and ships are away while it lasts.
//
// An embargo is a compact turned inside out: no trade with that house, and the other houses take sides.
//
// Convoy intelligence: the Spymaster's people (and a fixer or a turned captain, if we have one) learn of
// some rival convoys as they leave. A known convoy can be pointed out to a corsair company that likes us.
import { Rng } from './rng';
import { econ, record } from './economy';
import { logRecord } from './records';
import { relation, shiftRelation } from './relations';
import { isMilitary } from './grounds';
import { isAway } from './court';
import { powerOf } from './fleet';
import { competence } from './reports';
import { meet } from './relationships';
import { aimBias, allied, shiftFavour } from './houses';
import { absoluteCycle, CYCLES_PER_PHASE } from './time';
import { RESOURCE_LABEL } from '../data/economy';
import { compactOf, convoyLabel, ensureLanes, laneName, LANE_BY_ID, type Convoy, type Faction, type Lane } from './lanes';
import type { GameDate } from './time';
import type { World } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const H = (w: World, id: string) => `House ${w.houses[id]?.name ?? id}`;

export type WatchStance = 'secure' | 'blockade';
export interface Watch { id: string; house: string; lane: string; leaderId: string; shipIds: string[]; stance: WatchStance; since: GameDate; stopped: number }
export interface Embargo { id: string; by: string; against: string; since: GameDate }

export const WATCH_UPKEEP = (ships: number) => 250 + ships * 120;
export const TIP_CUT = 0.2;

export function watchesOn(world: World, laneId: string): Watch[] { return (world.lanes?.watches ?? []).filter((w) => w.lane === laneId); }
export function watchOf(world: World, house = world.playerHouseId): Watch[] { return (world.lanes?.watches ?? []).filter((w) => w.house === house); }
export const embargoed = (world: World, by: string, against: string) => !!world.lanes?.embargoes?.some((e) => e.by === by && e.against === against);
export const embargoesOn = (world: World, against: string) => (world.lanes?.embargoes ?? []).filter((e) => e.against === against);

const friendly = (world: World, a: string, b: string) => a === b || allied(world, a, b);

function watchPower(world: World, w: Watch): number {
  const lead = world.characters[w.leaderId];
  const ships = w.shipIds.map((id) => world.fleet?.ships[id]).filter((s) => s && !s.lost);
  return ships.reduce((n, s) => n + powerOf(world, s!), 0) + (lead ? (lead.stats.tactics + lead.stats.leadership) / 2 : 0);
}

/** How a watch on this lane changes a company's odds against this owner's run. */
export function watchFactor(world: World, lane: Lane, owner: string): number {
  let f = 1;
  for (const w of watchesOn(world, lane.id)) f *= owner !== 'free' && friendly(world, w.house, owner) ? 0.3 : 0.75;
  return f;
}

/** A blockade on this lane stops runs of houses it is not friendly with. True if it did. */
export function blockadeStops(world: World, rng: Rng, c: Convoy, lane: Lane): boolean {
  if (c.owner === 'free' && !rng.chance(0.5)) return false;
  const P = world.playerHouseId;
  for (const w of watchesOn(world, lane.id)) {
    if (w.stance !== 'blockade') continue;
    const victim = c.buyer ?? c.owner;
    if (victim !== 'free' && friendly(world, w.house, victim)) continue;
    const esc = c.escort ? world.fleet?.ships[c.escort] : undefined;
    const ours = watchPower(world, w);
    const theirs = esc && !esc.lost ? powerOf(world, esc) : 0;
    if (!rng.chance(clamp(0.65 * ours / (ours + theirs + 10), 0.1, 0.8))) continue;
    // Stopped: the cargo is taken into the blockader's stores; the owner loses it.
    w.stopped++;
    record(world, w.house, { resource: c.good, amount: c.qty, label: `Taken by our lane watch on the ${laneName(world, lane)} lane`, kind: 'raid' });
    if (victim !== 'free') {
      const take = Math.min(Math.max(0, econ(world, victim).stock[c.good]), c.qty);
      if (c.kind === 'export') record(world, victim, { resource: 'othes', amount: -Math.min(Math.max(0, econ(world, victim).stock.othes), c.value), label: `Stopped by ${H(world, w.house)}'s blockade`, kind: 'raid' });
      else record(world, victim, { resource: c.good, amount: -take, label: `Stopped by ${H(world, w.house)}'s blockade`, kind: 'raid' });
      shiftRelation(world, victim, w.house, -6);
    }
    const lead = world.characters[w.leaderId];
    const what = convoyLabel(world, c);
    if (w.house === P) logRecord(world, { kind: 'world', type: 'raid', severity: 1, seat: 'grandMaster', houseIds: [P, ...(victim !== 'free' ? [victim] : [])], text: `${lead?.name.given ?? 'Our watch'} stopped ${what} on the ${laneName(world, lane)} lane and took the cargo.`, effects: [`+${fmt(c.qty)} ${RESOURCE_LABEL[c.good].toLowerCase()}`], who: lead ? [{ id: lead.id, part: 'held the lane' }] : [] });
    else if (victim === P) logRecord(world, { kind: 'world', type: 'raid', severity: 2, seat: 'steward', houseIds: [P, w.house], text: `${H(world, w.house)}'s blockade on the ${laneName(world, lane)} lane stopped ${what} and took the cargo.`, effects: [`Lost about ${fmt(c.value)} othes`] });
    const t = world.lanes.done;
    c.fate = 'seized'; c.by = w.house; c.note = 'stopped by a blockade';
    delete world.lanes.convoys[c.id];
    t.unshift(c);
    world.lanes.done = t.slice(0, 60);
    return true;
  }
  return false;
}

/** Each Phase: watches are paid for, or they come home. */
function payWatches(world: World) {
  const P = world.playerHouseId;
  for (const w of [...(world.lanes.watches ?? [])]) {
    const cost = WATCH_UPKEEP(w.shipIds.length);
    const lead = world.characters[w.leaderId];
    const gone = !lead?.alive || w.shipIds.every((id) => !world.fleet?.ships[id] || world.fleet.ships[id]!.lost);
    if (gone || econ(world, w.house).stock.othes < cost) { endWatchIn(world, w, gone ? 'it could not be held' : 'there was no money to keep it'); continue; }
    record(world, w.house, { resource: 'othes', amount: -cost, label: `Lane watch on the ${laneName(world, LANE_BY_ID[w.lane]!)} lane`, kind: 'mission' });
    if (w.stance === 'blockade') for (const h of Object.keys(world.houses)) if (h !== w.house && !friendly(world, w.house, h)) shiftRelation(world, h, w.house, -0.5);
    if (w.house === P && lead) for (const id of w.shipIds) { const s = world.fleet?.ships[id]; if (s?.captainId) meet(world, new Rng(world.rng), [lead.id, s.captainId], 'the lane watch', 0.2, 0.4); }
  }
}

function endWatchIn(world: World, w: Watch, why: string) {
  world.lanes.watches = (world.lanes.watches ?? []).filter((x) => x !== w);
  const lead = world.characters[w.leaderId];
  if (lead) lead.flags = lead.flags.filter((f) => f.id !== 'watch');
  for (const id of w.shipIds) { const s = world.fleet?.ships[id]; if (s) delete s.watch; }
  if (w.house === world.playerHouseId) logRecord(world, { kind: 'world', type: 'world', severity: 1, seat: 'grandMaster', houseIds: [w.house], text: `The watch on the ${laneName(world, LANE_BY_ID[w.lane]!)} lane is over: ${why}.${w.stopped ? ` It stopped ${w.stopped} convoy${w.stopped === 1 ? '' : 's'}.` : ''}` });
}

export function freeWatchShips(world: World, house = world.playerHouseId): string[] {
  return Object.values(world.fleet?.ships ?? {}).filter((s) => s.houseId === house && !s.lost && !s.arrives && !s.ready && !s.crucible && !s.watch && s.condition >= 40).map((s) => s.id);
}

export function cannotWatch(world: World, laneId: string, leaderId: string, shipIds: string[]): string | null {
  const P = world.playerHouseId;
  if (!LANE_BY_ID[laneId]) return 'Choose a lane.';
  if (watchesOn(world, laneId).some((w) => w.house === P)) return 'We already hold that lane.';
  const c = world.characters[leaderId];
  if (!c?.alive || c.houseId !== P) return 'Choose a knight to lead it.';
  if (!isMilitary(world, c)) return 'Only knights and officers lead a lane watch.';
  if (isAway(world, c.id) || c.flags.some((f) => f.id === 'wounded' || f.id === 'watch')) return `${c.name.given} is not free.`;
  const free = freeWatchShips(world);
  if (!shipIds.length) return 'Send at least one ship.';
  if (shipIds.some((id) => !free.includes(id))) return 'One of those ships is not free.';
  if (econ(world, P).stock.othes < WATCH_UPKEEP(shipIds.length) * 2) return `Needs ${fmt(WATCH_UPKEEP(shipIds.length) * 2)} othes in hand.`;
  return null;
}

function act(input: World, fn: (w: World, rng: Rng) => void): World {
  const w = structuredClone(input);
  ensureLanes(w);
  const rng = new Rng(w.rng);
  fn(w, rng);
  w.rng = rng.state;
  return w;
}

export function startWatch(input: World, laneId: string, leaderId: string, shipIds: string[], stance: WatchStance): World {
  if (cannotWatch(input, laneId, leaderId, shipIds)) return input;
  return act(input, (w) => {
    const P = w.playerHouseId;
    const watch: Watch = { id: `lw${w.nextId++}`, house: P, lane: laneId, leaderId, shipIds, stance, since: w.date, stopped: 0 };
    (w.lanes.watches ??= []).push(watch);
    const lead = w.characters[leaderId]!;
    lead.flags.push({ id: 'watch', since: w.date, detail: `holding the ${laneName(w, LANE_BY_ID[laneId]!)} lane` });
    for (const id of shipIds) w.fleet.ships[id]!.watch = watch.id;
    const lane = LANE_BY_ID[laneId]!;
    logRecord(w, { kind: 'council', type: 'decision', severity: 1, houseIds: [P], text: `${lead.name.given} takes ${shipIds.length} ship${shipIds.length === 1 ? '' : 's'} to ${stance === 'blockade' ? 'blockade' : 'secure'} the ${laneName(w, lane)} lane. Upkeep ${fmt(WATCH_UPKEEP(shipIds.length))} a Phase.`, who: [{ id: lead.id, part: 'leads the watch' }], quote: { from: lead.id, text: stance === 'blockade' ? 'Nothing of theirs gets through.' : 'Our convoys will sleep easy.' } });
    if (stance === 'blockade') for (const h of Object.keys(w.houses)) if (h !== P && !friendly(w, P, h)) shiftRelation(w, h, P, -5);
  });
}

export function endWatch(input: World, watchId: string): World {
  return act(input, (w) => { const x = (w.lanes.watches ?? []).find((y) => y.id === watchId && y.house === w.playerHouseId); if (x) endWatchIn(w, x, 'called home'); });
}

/** A rival house's blockade, now and then, against a house it hates. */
function aiWatches(world: World, rng: Rng) {
  const P = world.playerHouseId;
  for (const h of Object.values(world.houses)) {
    if (h.id === P || (world.lanes.watches ?? []).some((w) => w.house === h.id)) continue;
    const enemy = Object.keys(world.houses).filter((o) => o !== h.id && relation(world, h.id, o) < -50).sort((a, b) => relation(world, h.id, a) - relation(world, h.id, b))[0];
    if (!enemy || h.personality.aggression < 0.4 || econ(world, h.id).stock.othes < 15000 || !rng.chance(0.06 * aimBias(world, h.id, 'revenge', enemy) * (aimBias(world, h.id, 'expand') > 1 ? 1.5 : 1))) continue;
    const ships = freeWatchShips(world, h.id).slice(0, 2);
    const lead = Object.values(world.characters).find((c) => c.alive && c.houseId === h.id && isMilitary(world, c) && !isAway(world, c.id));
    const lane = Object.values(LANE_BY_ID).find((l) => (l.a === world.houses[enemy]!.capitalPlanetId || l.b === world.houses[enemy]!.capitalPlanetId) && (l.a === 'exchange' || l.b === 'exchange'));
    if (!ships.length || !lead || !lane) continue;
    const watch: Watch = { id: `lw${world.nextId++}`, house: h.id, lane: lane.id, leaderId: lead.id, shipIds: ships, stance: 'blockade', since: world.date, stopped: 0 };
    (world.lanes.watches ??= []).push(watch);
    lead.flags.push({ id: 'watch', since: world.date, detail: `holding the ${laneName(world, lane)} lane` });
    for (const id of ships) world.fleet.ships[id]!.watch = watch.id;
    shiftRelation(world, enemy, h.id, -8);
    logRecord(world, { kind: 'world', type: 'politics', severity: enemy === P ? 2 : 1, seat: 'spymaster', houseIds: [h.id, enemy], text: `${H(world, h.id)} has put ships across the ${laneName(world, lane)} lane: a blockade on ${enemy === P ? 'us' : H(world, enemy)}.` });
  }
  // They give it up after a while.
  for (const w of [...(world.lanes.watches ?? [])]) if (w.house !== P && absoluteCycle(world.date) - absoluteCycle(w.since) > CYCLES_PER_PHASE * 15 && rng.chance(0.3)) endWatchIn(world, w, 'they lifted it');
}

// ---------------------------------------------------------------- embargoes

export function cannotEmbargo(world: World, against: string): string | null {
  const P = world.playerHouseId;
  if (!world.houses[against] || against === P) return 'Choose a house.';
  if (embargoed(world, P, against)) return 'Already in force.';
  if (allied(world, P, against)) return 'Not against an ally.';
  return null;
}

function embargoIn(world: World, by: string, against: string) {
  (world.lanes.embargoes ??= []).push({ id: `em${world.nextId++}`, by, against, since: world.date });
  shiftFavour(world, by, -2);
  const cp = compactOf(world, by, against);
  if (cp) world.lanes.compacts = world.lanes.compacts.filter((x) => x !== cp);
  shiftRelation(world, against, by, -15);
  // The other houses take sides: those who hate the target warm to us, its friends cool.
  for (const o of Object.keys(world.houses)) {
    if (o === by || o === against) continue;
    const r = relation(world, o, against);
    if (r < -20) shiftRelation(world, o, by, 3);
    else if (r > 30) shiftRelation(world, o, by, -3);
  }
  const P = world.playerHouseId;
  logRecord(world, { kind: 'world', type: 'politics', severity: by === P || against === P ? 2 : 1, seat: by === P || against === P ? 'envoy' : 'heralds', houseIds: [by, against], text: by === P ? `We have declared an embargo on ${H(world, against)}. None of ours trades with them.` : against === P ? `${H(world, by)} has declared an embargo on us. Their docks are shut to our trade.` : `${H(world, by)} has declared an embargo on ${H(world, against)}.` });
}

export function declareEmbargo(input: World, against: string): World {
  if (cannotEmbargo(input, against)) return input;
  return act(input, (w) => embargoIn(w, w.playerHouseId, against));
}

export function liftEmbargo(input: World, against: string): World {
  return act(input, (w) => {
    const P = w.playerHouseId;
    if (!embargoed(w, P, against)) return;
    w.lanes.embargoes = w.lanes.embargoes.filter((e) => !(e.by === P && e.against === against));
    shiftRelation(w, against, P, 5);
    logRecord(w, { kind: 'council', type: 'decision', severity: 1, houseIds: [P, against], text: `We have lifted our embargo on ${H(w, against)}.` });
  });
}

/** What an embargo costs its target at the Exchange: every house that shuts it out adds to the price. */
export function embargoMarkup(world: World, houseId: string): number {
  return 1 + embargoesOn(world, houseId).length * 0.08;
}

function aiEmbargoes(world: World, rng: Rng) {
  for (const h of Object.keys(world.houses)) {
    if (h === world.playerHouseId) continue;
    for (const o of Object.keys(world.houses)) {
      if (o === h || embargoed(world, h, o) || allied(world, h, o)) continue;
      const r = relation(world, h, o);
      if (r < -55 && rng.chance(0.05 * aimBias(world, h, 'revenge', o))) embargoIn(world, h, o);
    }
    for (const e of (world.lanes.embargoes ?? []).filter((x) => x.by === h)) {
      if (relation(world, h, e.against) > -25 && rng.chance(0.3)) {
        world.lanes.embargoes = world.lanes.embargoes.filter((x) => x !== e);
        logRecord(world, { kind: 'world', type: 'politics', severity: 1, seat: e.against === world.playerHouseId ? 'envoy' : 'heralds', houseIds: [h, e.against], text: `${H(world, h)} has lifted its embargo on ${e.against === world.playerHouseId ? 'us' : H(world, e.against)}.` });
      }
    }
  }
  // An embargo festers: each Orbit it lasts, the target thinks a little worse of whoever holds it.
  for (const e of world.lanes.embargoes ?? []) shiftRelation(world, e.against, e.by, -1);
}

// ---------------------------------------------------------------- what we know is moving

/** The chance our people hear of a rival run as it leaves. */
export function intelOdds(world: World): number {
  const P = world.playerHouseId;
  let p = 0.08 + competence(world, 'spymaster') * 0.03;
  for (const f of Object.values(world.lanes?.factions ?? {})) {
    if (f.goBetween?.includes(P)) p += 0.1;
    if (f.members.some((m) => m.informant === P && m.fate === 'captured')) p += 0.08;
  }
  return clamp(p, 0, 0.8);
}

export function noticeConvoy(world: World, rng: Rng, c: Convoy) {
  const P = world.playerHouseId;
  if (c.owner === P || c.buyer === P || c.owner === 'free') return;
  if (c.value < 1500 && c.kind !== 'quota') return;
  if (rng.chance(intelOdds(world))) c.known = true;
}

export function knownRivalConvoys(world: World): Convoy[] {
  return Object.values(world.lanes?.convoys ?? {}).filter((x) => x.known).sort((a, b) => b.value - a.value);
}

export function cannotTip(world: World, convoyId: string, factionId: string): string | null {
  const P = world.playerHouseId;
  const c = world.lanes?.convoys[convoyId];
  const f = world.lanes?.factions[factionId];
  if (!c || !c.known) return 'We do not know of that run.';
  if (!f) return 'No such company.';
  if (c.tipped) return 'Already passed on.';
  if ((f.rel[P] ?? 0) < 20) return 'They do not trust us enough to act on our word.';
  if (f.hostile?.includes(P)) return 'We are at war with them.';
  if (allied(world, P, c.buyer ?? c.owner)) return 'That run belongs to an ally.';
  return null;
}

/** Tell a company where a known rival convoy will be. They are far likelier to strike it; a fifth is ours. */
export function tipOff(input: World, convoyId: string, factionId: string): World {
  if (cannotTip(input, convoyId, factionId)) return input;
  return act(input, (w) => {
    const c = w.lanes.convoys[convoyId]!;
    c.tipped = factionId;
    c.tippedBy = w.playerHouseId;
    const f = w.lanes.factions[factionId]!;
    f.rel[w.playerHouseId] = clamp((f.rel[w.playerHouseId] ?? 0) + 2, -100, 100);
    logRecord(w, { kind: 'council', type: 'decision', severity: 1, houseIds: [w.playerHouseId], text: `We passed word of ${convoyLabel(w, c)} to ${f.name}.` });
  });
}

/** After a tipped run is taken: our cut, and the chance it is traced back. */
export function tipPaid(world: World, rng: Rng, c: Convoy, f: Faction) {
  if (!c.tippedBy || c.tipped !== f.id) return;
  const P = c.tippedBy;
  const cut = Math.round(c.value * TIP_CUT);
  record(world, P, { resource: 'othes', amount: cut, label: `A word to ${f.name}`, kind: 'raid' });
  const victim = c.buyer ?? c.owner;
  if (victim !== 'free' && rng.chance(0.12)) {
    world.houses[P]!.standing.honour = clamp(world.houses[P]!.standing.honour - 3, 0, 100);
    shiftFavour(world, P, -8);
    shiftRelation(world, victim, P, -20);
    logRecord(world, { kind: 'world', type: 'politics', severity: 2, seat: 'spymaster', houseIds: [P, victim], text: `${H(world, victim)} has learned who told ${f.name} where their convoy would be. It was us.`, effects: ['Honour −3', `${H(world, victim)} regard −20`] });
  } else logRecord(world, { kind: 'world', type: 'intrigue', severity: 1, seat: 'spymaster', houseIds: [P], text: `${f.name[0]!.toUpperCase() + f.name.slice(1)} acted on our word: ${convoyLabel(world, c)} is taken. Our share has come in.`, effects: [`+${fmt(cut)} othes`] });
}

export function advanceLaneWatch(world: World, rng: Rng, phaseTurned: boolean, orbitTurned: boolean): void {
  world.lanes.watches ??= [];
  world.lanes.embargoes ??= [];
  if (phaseTurned) payWatches(world);
  if (orbitTurned) { aiWatches(world, rng); aiEmbargoes(world, rng); }
}

