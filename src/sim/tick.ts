import { advancePlaces } from './arcs_places';
import { advanceEvents } from './events';
import { advanceStory } from './story';
import { advanceCrash, checkDebt, marketShocks, maybeCrash } from './arcs_economy';
import './arcs';
import './arcs_resonance';
import './arcs_threads';
import './arcs_arms';
import './arcs_court';
import './arcs_intrigue';
import './arcs_realm';
import './arcs_crisis';
import { advancePorts } from './ports';
import { trimFeed } from './records';
import { advanceRelationships } from './relationships';
import { advanceHoldings } from './holdings';
import { advanceLoans } from './loans';
import { advanceTraining } from './training';
import { advanceFleet } from './fleet';
import { advanceEmbassies } from './embassies';
import { advanceAmbitions } from './ambitions';
import { advanceProspects } from './prospects';
import { advanceCrucible } from './crucible';
import { advanceGrounds } from './grounds';
import { advanceCircuit } from './circuit';
import { advanceLadder } from './ladder';
import { advanceTreasury } from './treasury';
import { advanceLanes } from './lanes';
import { advanceRenown } from './renown';
import { advanceRealm } from './houses';
import { advanceArchon } from './archon';
import { advanceWar } from './war';
import { advanceScenes, ensureScenes, once } from './scene';
import { ceremoniesDue, crisesDue, startChronicle, ensureCaigeDepth } from './scenes_api';
import './arcs_war';
import './arcs_numarade';
import './eventDefs';
import './variants';
import { yearlyStories } from './arcs_systems';
import { advanceLegacy } from './legacy';
import { tendCircles } from './circle';
import './arcs_circle';
import { shipStories } from './arcs_ships';
import { standingYear } from './standing';
import { advanceChair } from './arcs_chair';
import { legacyStories } from './arcs_legacy';
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
import { advancePolitics } from './politics';
import { advanceHousehold } from './household';
import {
  absoluteCycle,
  addCycles,
  boundariesCrossed,

  CYCLES_PER_TURN,
  dateParts,
  type GameDate,
} from './time';
import type { World } from './types';


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
  if (crossed.orbits > 0) marketShocks(world, rng);
  if (crossed.phases > 0) advanceCrash(world, rng);
  if (crossed.years > 0) { maybeCrash(world, rng); checkDebt(world); yearlyStories(world, rng); shipStories(world, rng); }
  { const promoted = advanceLegacy(world, rng, crossed); if (crossed.years > 0) legacyStories(world, rng, promoted); }
  advanceChair(world, rng, crossed);
  advancePlaces(world, rng, crossed);
  if (crossed.years > 0) { tendCircles(world); standingYear(world); }
  lapseRansoms(world);
  advanceCouncil(world, rng, crossed.phases > 0, crossed.orbits > 0);
  advanceRivals(world, rng, crossed.phases > 0);
  advanceCaptives(world, rng, crossed.phases > 0);
  advanceMood(world, crossed.phases > 0, new Set(Object.values(world.missions).filter((m) => m.stage !== 'done').flatMap((m) => [m.leaderId, ...(m.companions ?? [])])));
  advanceCourt(world, rng, crossed.phases > 0);
  advanceDiscovery(world);
  advanceGrowth(world, rng, crossed.phases > 0);
  advancePolitics(world, crossed.phases > 0);
  advanceHousehold(world, crossed.phases > 0);
  advancePorts(world, rng, crossed.phases > 0);
  advanceRelationships(world, rng, crossed.phases > 0);
  advanceHoldings(world, rng, crossed.phases > 0, crossed.orbits > 0);
  advanceLoans(world, rng, crossed.phases > 0);
  advanceTraining(world, rng, crossed.phases > 0, crossed.orbits > 0);
  advanceFleet(world, rng, crossed.phases > 0);
  advanceEmbassies(world, rng, crossed.phases > 0);
  advanceAmbitions(world, rng, crossed.phases > 0);
  advanceProspects(world, rng, crossed.orbits > 0);
  advanceCrucible(world, rng, crossed.phases > 0);
  advanceGrounds(world, rng, crossed.phases > 0);
  advanceCircuit(world, rng, crossed.phases > 0, crossed.orbits > 0);
  advanceLadder(world, rng, crossed.orbits > 0);
  advanceTreasury(world, crossed.phases > 0);
  advanceLanes(world, rng, crossed.phases > 0, crossed.orbits > 0);
  advanceRenown(world, crossed.orbits > 0);
  advanceRealm(world, rng, crossed.orbits > 0);
  advanceArchon(world, rng, { phase: crossed.phases > 0, orbit: crossed.orbits > 0, year: crossed.years > 0 });
  advanceWar(world, rng, { phase: crossed.phases > 0, orbit: crossed.orbits > 0, year: crossed.years > 0 });
  ensureScenes(world);
  advanceScenes(world, rng);
  if (crossed.phases > 0) { ensureCaigeDepth(world); ceremoniesDue(world); }
  if (crossed.orbits > 0) crisesDue(world, rng);
  if (crossed.years > 0 && once(world, `chronicle:${parts.year - 1}`)) startChronicle(world, parts.year - 1);
  advanceEvents(world, rng, crossed.phases > 0);
  advanceStory(world, rng, crossed.phases > 0);
  if (crossed.orbits > 0) checkDeaths(world, rng, to);

  world.rng = rng.state;
  trimFeed(world);
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

/** What one tick of the running clock produced: a moment that freezes it, or news that doesn't. */
export interface ClockStep { world: World; freeze?: { reason: string; events: string[]; battle?: string; scene?: string }; notice?: string }

/**
 * One tick of the real-time clock. Decisions freeze it (as events do in CK); urgent ones always do.
 * Other news is a notice: the clock runs on.
 */
export function stepClock(input: World, pauseOnDecisions = true): ClockStep {
  const w = structuredClone(input);
  const before = snapshotOfAttention(w);
  const had = new Set((w.events?.pending ?? []).map((p) => p.id));
  const fought = new Set((w.battles?.list ?? []).map((b) => b.id));
  stepInPlace(w);
  // A battle of ours has begun: everything stops for it.
  void fought;
  const scene = (w.scenes?.list ?? []).find((x) => x.status === 'ready' && !x.prompted);
  if (scene) { scene.prompted = true; return { world: w, freeze: { reason: `${scene.eyebrow}: ${scene.title}.`, events: [], scene: scene.id } }; }
  const battle = (w.battles?.list ?? []).find((b) => b.status === 'ready' && !b.prompted);
  if (battle) battle.prompted = true;
  if (battle) return { world: w, freeze: { reason: `Battle: ${battle.title}.`, events: [], battle: battle.id } };
  const fresh = (w.events?.pending ?? []).filter((p) => !had.has(p.id));
  const urgent = fresh.filter((p) => p.urgent);
  if (urgent.length) return { world: w, freeze: { reason: 'Something needs you now.', events: urgent.map((p) => p.id) } };
  if (fresh.length && pauseOnDecisions) return { world: w, freeze: { reason: 'A decision awaits your word.', events: fresh.map((p) => p.id) } };
  const P = w.playerHouseId;
  const news = w.feed.slice(before.last ? w.feed.indexOf(before.last) + 1 : 0);
  const death = news.find((f) => f.kind === 'death' && f.characterIds?.some((id) => w.characters[id]?.houseId === P && w.characters[id]?.tier === 'full'));
  if (death) return { world: w, freeze: { reason: death.text, events: [] } };
  const raidsBefore = new Set((input.ports?.raids ?? []).filter((r) => r.status === 'revealed').map((r) => r.id));
  const raid = (w.ports?.raids ?? []).find((r) => r.status === 'revealed' && !raidsBefore.has(r.id));
  if (raid) return { world: w, freeze: { reason: 'Raiders are coming for one of our worlds. See the Hall.', events: [] } };
  const reason = needsAttention(w, before);
  return reason ? { world: w, notice: reason } : { world: w };
}

interface Attention { battles: number; petitions: number; leads: number; demands: number; held: number; done: number; last: World['feed'][number] | undefined; oath: string | null; decisions: number; alerts: number }

function snapshotOfAttention(w: World): Attention {
  const P = w.playerHouseId;
  return {
    battles: (w.battles?.list ?? []).filter((x) => x.status !== 'over').length,
    petitions: w.courts[P]?.petitions.length ?? 0,
    leads: w.leads.filter((l) => l.houseId === P).length,
    demands: Object.values(w.captives).filter((c) => c.ransom?.status === 'open' && w.characters[c.characterId]?.houseId === P).length,
    held: Object.values(w.captives).filter((c) => c.heldBy === P).length,
    done: Object.values(w.missions).filter((m) => m.houseId === P && m.stage === 'done').length,
    last: w.feed[w.feed.length - 1],
    oath: w.courts[P]?.oath?.id ?? null,
    decisions: w.events?.pending.length ?? 0,
    alerts: w.ports?.alerts ?? 0,
  };
}

function needsAttention(w: World, b: Attention): string | null {
  const a = snapshotOfAttention(w);
  if (a.battles > b.battles) return 'A battle has begun.';
  if (a.decisions > b.decisions) return 'A decision awaits your word.';
  if (a.alerts > b.alerts) return 'Word has come that needs you.';
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
