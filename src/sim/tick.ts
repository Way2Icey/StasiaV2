import { displayName } from './names';
import { Rng } from './rng';
import { ageOf } from './characters';
import { FLAGS_BY_ID } from '../data/flags';
import { advanceMissions } from './missions';
import {
  absoluteCycle,
  addCycles,
  boundariesCrossed,
  CYCLES_PER_ORBIT,
  CYCLES_PER_TURN,
  dateParts,
  type GameDate,
} from './time';
import type { Character, World } from './types';

/** Keep the feed from growing without bound. */
const FEED_LIMIT = 400;

/**
 * One press of Continue: advance the clock and resolve what happens.
 * Returns a new world; the input is not modified.
 */
export function advanceTurn(input: World): World {
  const world = structuredClone(input);
  const rng = new Rng(world.rng);
  const from = world.date;
  const to = addCycles(from, CYCLES_PER_TURN);
  world.date = to;

  const crossed = boundariesCrossed(from, to);
  const parts = dateParts(to);
  if (crossed.years > 0) {
    log(world, 'time', `Year SY-${parts.year} begins.`);
  } else if (crossed.orbits > 0) {
    log(world, 'time', `Orbit ${parts.orbit} begins.`);
  } else if (crossed.phases > 0) {
    log(world, 'time', `Phase ${parts.phase} of Orbit ${parts.orbit} begins.`);
  }

  expireFlags(world, to);
  advanceMissions(world, rng);
  if (crossed.orbits > 0) checkDeaths(world, rng, to);

  world.rng = rng.state;
  if (world.feed.length > FEED_LIMIT) world.feed = world.feed.slice(-FEED_LIMIT);
  return world;
}

/** Advance several turns at once (for tests and fast-forward). */
export function advanceTurns(world: World, turns: number): World {
  let w = world;
  for (let i = 0; i < turns; i++) w = advanceTurn(w);
  return w;
}

function log(world: World, kind: World['feed'][number]['kind'], text: string, characterIds?: string[]) {
  world.feed.push({ date: world.date, kind, text, characterIds });
}

function expireFlags(world: World, now: GameDate) {
  const t = absoluteCycle(now);
  for (const c of Object.values(world.characters)) {
    const kept = c.flags.filter((f) => !f.until || absoluteCycle(f.until) > t);
    if (kept.length === c.flags.length) continue;
    for (const f of c.flags) {
      if (f.until && absoluteCycle(f.until) <= t) {
        const def = FLAGS_BY_ID[f.id];
        if (def?.visibility === 'all' && c.tier === 'full' && c.alive) {
          log(world, 'flag', `${displayName(c.name)} is no longer ${def.label.toLowerCase()}.`, [c.id]);
        }
      }
    }
    c.flags = kept;
  }
}

/** Old age, checked once per Orbit. */
function checkDeaths(world: World, rng: Rng, now: GameDate) {
  for (const c of Object.values(world.characters)) {
    if (!c.alive) continue;
    const age = ageOf(c, now);
    const nearEnd = age >= c.lifespan * 0.92;
    if (age >= c.lifespan || (nearEnd && rng.chance(0.04))) {
      kill(world, c, now, 'old age');
    }
  }
}

export function kill(world: World, c: Character, now: GameDate, cause: string) {
  c.alive = false;
  c.death = { date: now, cause };
  const seat = c.seat;
  c.seat = undefined;
  if (c.tier === 'full') {
    log(world, 'death', `${displayName(c.name)} has died (${cause}), aged ${ageOf(c, now)}.`, [c.id]);
  }
  // Family mourns.
  for (const k of Object.values(world.characters)) {
    if (k.alive && k.familyId === c.familyId && k.id !== c.id && k.tier === 'full') {
      k.flags.push({ id: 'grieving', since: now, until: addCycles(now, CYCLES_PER_ORBIT * 2), detail: displayName(c.name) });
    }
  }
  const house = world.houses[c.houseId];
  if (house && house.rulerId === c.id) {
    const successor = pickSuccessor(world, c);
    house.rulerId = successor?.id ?? null;
    if (successor) {
      successor.seat = 'highroy';
      successor.role = 'Highroy';
      log(world, 'world', `${displayName(successor.name)} succeeds as Highroy of ${house.name}.`, [successor.id]);
    }
  } else if (seat) {
    log(world, 'world', `A seat on the council of ${house?.name ?? 'the house'} is now empty.`);
  }
}

/** For now: the eldest adult of the ruling family. Elections come later. */
function pickSuccessor(world: World, ruler: Character): Character | undefined {
  const now = world.date;
  return Object.values(world.characters)
    .filter((k) => k.alive && k.familyId === ruler.familyId && k.id !== ruler.id && ageOf(k, now) >= 16)
    .sort((a, b) => (a.role === 'Heir' ? -1 : b.role === 'Heir' ? 1 : ageOf(b, now) - ageOf(a, now)))[0];
}
