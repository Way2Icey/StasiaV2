import { displayName } from './names';
import { Rng } from './rng';
import { ageOf } from './characters';
import { FLAGS_BY_ID } from '../data/flags';
import { advanceMissions } from './missions';
import { advanceCouncil } from './council';
import { advanceRivals } from './ai';
import { advanceCaptives } from './captives';
import { kill } from './death';
import { advanceEconomy, lapseRansoms } from './economy';
import { advanceMood } from './mood';
import { advanceCourt } from './court';
import { advanceDiscovery } from './discovery';
import { advanceGrowth } from './growth';
import {
  absoluteCycle,
  addCycles,
  boundariesCrossed,

  CYCLES_PER_TURN,
  dateParts,
  type GameDate,
} from './time';
import type { World } from './types';

/** Keep the feed from growing without bound. */
const FEED_LIMIT = 400;

/**
 * One press of Continue: advance the clock and resolve what happens.
 * Returns a new world; the input is not modified.
 */
export function advanceTurn(input: World): World {
  const world = structuredClone(input);
  stepInPlace(world);
  return world;
}

/** One turn on a world the caller already owns (no copy). */
function stepInPlace(world: World): void {
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
  advanceEconomy(world, rng, crossed.phases > 0, crossed.orbits > 0);
  lapseRansoms(world);
  advanceCouncil(world, rng, crossed.phases > 0, crossed.orbits > 0);
  advanceRivals(world, rng, crossed.phases > 0);
  advanceCaptives(world, rng, crossed.phases > 0);
  advanceMood(world, crossed.phases > 0, new Set(Object.values(world.missions).filter((m) => m.stage !== 'done').flatMap((m) => [m.leaderId, ...(m.companions ?? [])])));
  advanceCourt(world, rng, crossed.phases > 0);
  advanceDiscovery(world);
  advanceGrowth(world, rng, crossed.phases > 0);
  if (crossed.orbits > 0) checkDeaths(world, rng, to);

  world.rng = rng.state;
  if (world.feed.length > FEED_LIMIT) world.feed = world.feed.slice(-FEED_LIMIT);
}

/** Advance several turns at once (for tests and fast-forward). */
export function advanceTurns(world: World, turns: number): World {
  const w = structuredClone(world);
  for (let i = 0; i < turns; i++) stepInPlace(w);
  return w;
}

/** Why the clock stopped early: something the player should see. */
export interface Interruption { reason: string }

/**
 * Advance up to `turns` turns, stopping early (after the turn it happened)
 * when something needs the player, if `stopOnEvents`. The input is untouched.
 */
export function advanceUntil(input: World, turns: number, stopOnEvents: boolean): { world: World; ran: number; stop?: Interruption } {
  const w = structuredClone(input);
  for (let i = 0; i < turns; i++) {
    const before = snapshotOfAttention(w);
    stepInPlace(w);
    if (stopOnEvents) {
      const reason = needsAttention(w, before);
      if (reason) return { world: w, ran: i + 1, stop: { reason } };
    }
  }
  return { world: w, ran: turns };
}

interface Attention { petitions: number; leads: number; demands: number; held: number; done: number; last: World['feed'][number] | undefined; oath: string | null }

function snapshotOfAttention(w: World): Attention {
  const P = w.playerHouseId;
  return {
    petitions: w.courts[P]?.petitions.length ?? 0,
    leads: w.leads.filter((l) => l.houseId === P).length,
    demands: Object.values(w.captives).filter((c) => c.ransom?.status === 'open' && w.characters[c.characterId]?.houseId === P).length,
    held: Object.values(w.captives).filter((c) => c.heldBy === P).length,
    done: Object.values(w.missions).filter((m) => m.houseId === P && m.stage === 'done').length,
    last: w.feed[w.feed.length - 1],
    oath: w.courts[P]?.oath?.id ?? null,
  };
}

function needsAttention(w: World, b: Attention): string | null {
  const a = snapshotOfAttention(w);
  if (a.done > b.done) return 'A mission has come home.';
  if (a.demands > b.demands) return 'A ransom demand has arrived.';
  if (a.held > b.held) return 'We have caught someone.';
  if (a.petitions > b.petitions) return 'A councillor has a petition.';
  if (a.leads > b.leads) return 'Something new to follow up.';
  if (b.oath && !a.oath) return 'The oath has ended.';
  const fresh = w.feed.slice(b.last ? w.feed.indexOf(b.last) + 1 : 0);
  const P = w.playerHouseId;
  if (fresh.some((f) => f.kind === 'death' && f.characterIds?.some((id) => w.characters[id]?.houseId === P))) return 'Someone of our house has died.';
  if (fresh.some((f) => f.kind === 'intrigue')) return 'News from the shadows.';
  return null;
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

export { kill } from './death';
