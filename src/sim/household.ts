// What the nobles of a house do with themselves, the Elder's counsel, and the
// Spymaster's agents among the envoys.
import { alive, seatHolder } from './query';
import { shortName } from './names';
import { shiftMood } from './mood';
import { isAway } from './court';
import { absoluteCycle, addCycles, CYCLES_PER_ORBIT, CYCLES_PER_PHASE, formatDate } from './time';
import { ENVOY_ROLE, envoysOf, MAX_ENVOYS } from './politics';
import type { Character, World } from './types';

// ---------------------------------------------------------------- occupations

export type Occupation = 'idle' | 'courtier' | 'envoy' | 'knight';
export const IDLE_ROLE = 'Noble';
export const COURTIER_ROLE = 'Courtier';

export const OCCUPATION_LABEL: Record<Occupation, string> = {
  idle: 'Idle', courtier: 'Court helper', envoy: 'Envoy', knight: 'Knight',
};

export const OCCUPATION_NOTE: Record<Occupation, string> = {
  idle: 'Rests: mood recovers faster (+2 a Phase), but brings nothing to the house.',
  courtier: 'Helps at court: adds to othes income while at home.',
  envoy: 'Joins the envoy corps under the Speaker; can lead envoy missions.',
  knight: 'Knighted by the Highroy: joins the knights under the Grand Master. For good.',
};

/** Nobles whose occupation the Highroy chooses (not council, family heads, or the Highroy's close family). */
export function isHouseholdNoble(c: Character): boolean {
  return c.tier === 'full' && !c.seat && (c.role === IDLE_ROLE || c.role === COURTIER_ROLE || c.role === ENVOY_ROLE || c.role.startsWith('Retainer'));
}

export function occupationOf(c: Character): Occupation {
  if (c.role === ENVOY_ROLE) return 'envoy';
  if (c.role === 'Knight') return 'knight';
  if (c.role === IDLE_ROLE) return 'idle';
  return 'courtier';
}

/** Enough steel to be knighted? */
export function knightReady(c: Character): string | null {
  const steel = c.stats.duelling + c.stats.valor;
  return steel >= 22 ? null : `Not ready: duelling + valor ${steel} of 22`;
}

export function setOccupation(input: World, houseId: string, id: string, occ: Occupation): World {
  const world = structuredClone(input);
  const c = world.characters[id];
  if (!c || c.houseId !== houseId || !isHouseholdNoble(c)) throw new Error('Not a noble of the house.');
  const from = occupationOf(c);
  if (from === occ) return world;
  if (occ === 'envoy' && envoysOf(world, houseId).length >= MAX_ENVOYS) throw new Error(`The envoy corps holds ${MAX_ENVOYS} at most.`);
  if (occ === 'knight') {
    const why = knightReady(c);
    if (why) throw new Error(why);
    c.role = 'Knight';
    c.flags.push({ id: 'knighted', since: world.date });
    shiftMood(c, 8);
    world.feed.push({ date: world.date, kind: 'council', text: `${shortName(c.name)} kneels before the Highroy and rises a knight of the house.`, characterIds: [c.id] });
    return world;
  }
  // Leaving the corps stops any spying under its cover.
  if (from === 'envoy') c.flags = c.flags.filter((f) => f.id !== 'agent');
  c.role = occ === 'envoy' ? ENVOY_ROLE : occ === 'idle' ? IDLE_ROLE : COURTIER_ROLE;
  if (occ === 'envoy') shiftMood(c, 3);
  return world;
}

// ---------------------------------------------------------------- the Elder's counsel

export const COUNSEL_BONUS = 0.1;

export function counselled(c: Character | undefined): boolean {
  return !!c?.flags.some((f) => f.id === 'counselled');
}

/** Why the Elder can't give counsel now, or null. */
export function cannotCounsel(world: World, houseId: string): string | null {
  const elder = seatHolder(world, houseId, 'elder');
  if (!elder) return 'The house has no Elder.';
  if (isAway(world, elder.id)) return 'The Elder is away.';
  const last = world.courts[houseId]?.lastCounsel;
  if (last && absoluteCycle(world.date) - absoluteCycle(last) < CYCLES_PER_PHASE) return `The Elder counsels once a Phase; next on ${formatDate(addCycles(last, CYCLES_PER_PHASE))}.`;
  return null;
}

/** Someone of the house sits with the Elder: better at their work for an Orbit, and calmer for it. */
export function seekWisdom(input: World, houseId: string, id: string): World {
  const world = structuredClone(input);
  const why = cannotCounsel(world, houseId);
  if (why) throw new Error(why);
  const elder = seatHolder(world, houseId, 'elder')!;
  const c = world.characters[id];
  if (!c || c.houseId !== houseId || !c.alive || c.id === elder.id) throw new Error('They cannot sit with the Elder.');
  if (isAway(world, c.id)) throw new Error('They are away.');
  c.flags = c.flags.filter((f) => f.id !== 'counselled');
  c.flags.push({ id: 'counselled', since: world.date, until: addCycles(world.date, CYCLES_PER_ORBIT), detail: `by ${shortName(elder.name)}` });
  const wise = (elder.stats.intellect + elder.stats.law + elder.stats.composure) / 3;
  shiftMood(c, Math.round(3 + wise / 5));
  world.courts[houseId]!.lastCounsel = world.date;
  world.feed.push({ date: world.date, kind: 'council', text: `${shortName(c.name)} seeks the counsel of ${shortName(elder.name)}, and comes away clearer of mind.`, characterIds: [c.id, elder.id] });
  return world;
}

/** The council's pace: the Elder at home steadies it; a counselled Highroy steers it better. */
export function elderFactor(world: World, houseId: string): number {
  const elder = seatHolder(world, houseId, 'elder');
  const ruler = world.characters[world.houses[houseId]?.rulerId ?? ''];
  return (elder && !isAway(world, elder.id) ? 1.03 : 1) * (counselled(ruler) ? 1.05 : 1);
}

// ---------------------------------------------------------------- the Spymaster's agents

export function agentsOf(world: World, houseId: string): Character[] {
  return alive(world).filter((c) => c.houseId === houseId && c.flags.some((f) => f.id === 'agent'));
}

export function maxAgents(world: World, houseId: string): number {
  const spy = seatHolder(world, houseId, 'spymaster');
  return spy ? Math.max(1, Math.floor(spy.stats.intrigue / 5)) : 0;
}

export function isAgent(c: Character | undefined): boolean {
  return !!c?.flags.some((f) => f.id === 'agent');
}

export function recruitAgent(input: World, houseId: string, id: string): World {
  const world = structuredClone(input);
  const c = world.characters[id];
  if (!c || c.houseId !== houseId || c.role !== ENVOY_ROLE) throw new Error('Only envoys can be recruited as agents.');
  if (isAgent(c)) return world;
  if (agentsOf(world, houseId).length >= maxAgents(world, houseId)) throw new Error('The Spymaster cannot run more agents.');
  c.flags.push({ id: 'agent', since: world.date, knownBy: [houseId] });
  shiftMood(c, c.traits.some((t) => t.id === 'ambitious' || t.id === 'cunning') ? 3 : -2);
  return world;
}

export function releaseAgent(input: World, id: string): World {
  const world = structuredClone(input);
  const c = world.characters[id];
  if (c) c.flags = c.flags.filter((f) => f.id !== 'agent');
  return world;
}

/** Agents at home feed the Spymaster's whispers: +10% each, up to +30%. */
export function agentFactor(world: World, houseId: string): number {
  const home = agentsOf(world, houseId).filter((c) => !isAway(world, c.id)).length;
  return 1 + Math.min(0.3, home * 0.1);
}

// ---------------------------------------------------------------- setup

/** Nobles start as court helpers (new worlds and old saves). */
export function ensureHousehold(world: World): void {
  if (world.householdReady) return;
  for (const c of Object.values(world.characters)) if (c.tier === 'full' && !c.seat && c.role === IDLE_ROLE) c.role = COURTIER_ROLE;
  world.householdReady = true;
}

/** Idle nobles recover their spirits faster. Once a Phase. */
export function advanceHousehold(world: World, phaseTurned: boolean): void {
  if (!phaseTurned) return;
  for (const c of alive(world)) if (c.role === IDLE_ROLE && c.tier === 'full' && !isAway(world, c.id)) shiftMood(c, 2);
}
