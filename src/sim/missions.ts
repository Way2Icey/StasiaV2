// Missions: the house sends one of its people to do something somewhere.
// Milestone 2 has two kinds: Investigate (look into a person) and Scout
// (survey a world). Everything resolves turn by turn, deterministically.
import { Rng } from './rng';
import { ageOf } from './characters';
import { displayName, shortName } from './names';
import { findSector, seatHolder } from './query';
import { believed, knowledgeOf, learn, viewOf, type CharacterView } from './knowledge';
import { absoluteCycle, addCycles, CYCLES_PER_ORBIT, type GameDate } from './time';
import { SPECIES } from '../data/species';
import { attitude, relation, shiftRelation } from './relations';
import { FLAGS_BY_ID } from '../data/flags';
import { traitLabel } from '../data/traits';
import type { Approach, Character, Mission, MissionKind, Outcome, SpeciesId, World } from './types';

// ---------------------------------------------------------------- geography

const DISTANCES: Record<string, number> = {
  'alerion-prime|serath-reach': 6,
  'alerion-prime|torvann-ashfall': 10,
  'alerion-prime|shaaliin-lyreth': 8,
  'serath-reach|shaaliin-lyreth': 8,
  'serath-reach|torvann-ashfall': 10,
  'shaaliin-lyreth|torvann-ashfall': 10,
};

/** Travel time in cycles between two worlds (always even: whole turns). */
export function travelCycles(a: string, b: string): number {
  if (a === b) return 2;
  const key = [a, b].sort().join('|');
  return DISTANCES[key] ?? 10;
}

export const TASK_CYCLES: Record<MissionKind, Record<Approach, number>> = {
  investigate: { careful: 10, quick: 6 },
  scout: { careful: 8, quick: 4 },
  envoy: { careful: 8, quick: 4 },
};

export const MISSION_LABEL: Record<MissionKind, string> = {
  investigate: 'Investigate',
  scout: 'Scout',
  envoy: 'Envoy',
};

export const OUTCOME_LABEL: Record<Outcome, string> = {
  triumph: 'Triumph',
  success: 'Success',
  partial: 'Partial',
  failure: 'Failure',
  disaster: 'Disaster',
};

// ---------------------------------------------------------------- who and what

export function activeMissionOf(world: World, characterId: string): Mission | undefined {
  return Object.values(world.missions).find((m) => m.leaderId === characterId && m.stage !== 'done');
}

export function activeMissions(world: World, houseId?: string): Mission[] {
  return Object.values(world.missions)
    .filter((m) => m.stage !== 'done' && (!houseId || m.houseId === houseId))
    .sort((a, b) => absoluteCycle(a.stageEnds) - absoluteCycle(b.stageEnds));
}

export function pastMissions(world: World, houseId?: string): Mission[] {
  return Object.values(world.missions)
    .filter((m) => m.stage === 'done' && (!houseId || m.houseId === houseId))
    .sort((a, b) => absoluteCycle(b.ended ?? b.launched) - absoluteCycle(a.ended ?? a.launched));
}

/** Why this person can't lead a mission, or null if they can. */
export function cannotLead(world: World, houseId: string, c: Character): string | null {
  if (!c.alive) return 'Dead';
  if (c.houseId !== houseId) return 'Not of your house';
  if (c.tier !== 'full') return 'Not someone you can send';
  if (c.seat === 'highroy') return 'The Highroy does not go himself';
  if (ageOf(c, world.date) < SPECIES[c.species].adulthood) return 'Too young';
  if (c.flags.some((f) => f.id === 'captive' || f.id === 'missing')) return 'Unaccounted for';
  if (activeMissionOf(world, c.id)) return 'Already on a mission';
  return null;
}

export function skillFor(kind: MissionKind, c: Character): number {
  const s = c.stats;
  if (kind === 'investigate') return s.intrigue * 0.45 + s.insight * 0.3 + s.perception * 0.25;
  if (kind === 'envoy') return s.diplomacy * 0.45 + s.eloquence * 0.3 + s.negotiation * 0.25;
  return s.perception * 0.4 + s.stealth * 0.3 + s.intellect * 0.3;
}

/** How well the leader suits the job, as a word. */
export function fitLabel(skill: number): string {
  if (skill >= 15) return 'Excellent';
  if (skill >= 12) return 'Good';
  if (skill >= 9) return 'Fair';
  return 'Poor';
}

export interface MissionSpec {
  kind: MissionKind;
  houseId: string;
  leaderId: string;
  targetId?: string;
  targetPlanetId?: string;
  targetHouseId?: string;
  approach: Approach;
}

interface Resolved {
  leader: Character;
  target?: Character;
  planetId: string;
  sectorId: string;
  targetHouseId: string;
}

function resolveSpec(world: World, spec: MissionSpec): Resolved | string {
  const leader = world.characters[spec.leaderId];
  if (!leader) return 'No such leader.';
  const why = cannotLead(world, spec.houseId, leader);
  if (why) return why;
  if (spec.kind === 'investigate') {
    const target = spec.targetId ? world.characters[spec.targetId] : undefined;
    if (!target || !target.alive) return 'No one to investigate.';
    if (target.id === leader.id) return 'They cannot investigate themselves.';
    return { leader, target, planetId: target.location.planetId, sectorId: target.location.sectorId, targetHouseId: target.houseId };
  }
  if (spec.kind === 'envoy') {
    const h = spec.targetHouseId ? world.houses[spec.targetHouseId] : undefined;
    if (!h || h.id === spec.houseId) return 'Choose a house to visit.';
    spec = { ...spec, targetPlanetId: h.capitalPlanetId };
  }
  const planet = spec.targetPlanetId ? world.planets[spec.targetPlanetId] : undefined;
  if (!planet) return 'No world to scout.';
  const portRank = { none: 0, 'landing field': 1, spaceport: 2, starport: 3 } as const;
  const sector = [...planet.sectors].sort((a, b) => portRank[b.port] - portRank[a.port])[0]!;
  return { leader, planetId: planet.id, sectorId: sector.id, targetHouseId: planet.houseId };
}

// ---------------------------------------------------------------- odds

/** How hard the job is, judged from what `observer` believes (or the truth). */
function difficulty(world: World, kind: MissionKind, r: Resolved, observer: string | null): number {
  const houseIntrigue = world.houses[r.targetHouseId]?.personality.intrigue ?? 0.5;
  if (kind === 'scout') return houseIntrigue * 8 + 6;
  if (kind === 'envoy') {
    const h = world.houses[r.targetHouseId]!;
    const regard = relation(world, h.id, r.leader.houseId);
    return 6 + h.personality.isolation * 8 + Math.max(0, -regard) / 8 + (h.tier === 'great' ? 2 : 0);
  }
  const t = r.target!;
  let discretion = t.hidden.discretion;
  let insight = t.stats.insight;
  let perception = t.stats.perception;
  if (observer) {
    const v = viewOf(world, observer, t);
    discretion = v.hidden ? believed(v.hidden.discretion) : 10;
    insight = believed(v.stats.insight);
    perception = believed(v.stats.perception);
  }
  const paranoid = t.traits.some((x) => x.id === 'paranoid') && (!observer || viewOf(world, observer, t).traits.some((x) => x.id === 'paranoid')) ? 3 : 0;
  return discretion * 0.5 + insight * 0.3 + perception * 0.2 + paranoid + houseIntrigue * 4;
}

function watcherSkill(world: World, r: Resolved): number {
  const spy = seatHolder(world, r.targetHouseId, 'spymaster');
  const spyEye = spy ? (spy.stats.insight + spy.stats.perception) / 2 : 8;
  const own = r.target ? r.target.stats.perception * 0.8 : 0;
  // Counter-intelligence: a spymaster watching their own house, and patrols.
  const tasks = world.courts?.[r.targetHouseId]?.tasks;
  const bonus = (tasks?.spymaster?.task === 'watchHouse' && spy ? 3 : 0) + (tasks?.grandMaster?.task === 'patrol' ? 1.5 : 0);
  return Math.max(spyEye, own) + bonus;
}

function detectionChance(world: World, r: Resolved, approach: Approach, watcher = watcherSkill(world, r)): number {
  const sneak = (r.leader.stats.stealth + r.leader.stats.deception) / 2;
  const p = 0.02 + Math.max(0, watcher - sneak) * 0.007;
  return Math.min(0.5, approach === 'quick' ? p * 2 : p);
}

function progressRoll(rng: Rng, skill: number, diff: number, approach: Approach): number {
  const g = Math.max(0, skill - diff * 0.5 + rng.gauss() * 2.5);
  return g * (approach === 'quick' ? 1.5 : 1);
}

function outcomeFor(progress: number, noticed: boolean): Outcome {
  let o: Outcome = progress >= 40 ? 'triumph' : progress >= 25 ? 'success' : progress >= 12 ? 'partial' : 'failure';
  if (noticed && o === 'triumph') o = 'success';
  else if (noticed && o === 'success' && progress < 40) o = 'partial';
  return o;
}

export interface Forecast {
  ok: true;
  travel: number;
  task: number;
  total: number;
  returns: GameDate;
  fit: string;
  /** Chance of success or better, 0..1, as the house judges it. */
  success: number;
  /** Chance of being noticed at some point. */
  noticed: number;
  /** How confident the estimate is, from what is known about the target. */
  confidence: string;
}

export function forecast(world: World, spec: MissionSpec): Forecast | { ok: false; reason: string } {
  const r = resolveSpec(world, spec);
  if (typeof r === 'string') return { ok: false, reason: r };
  const travel = travelCycles(r.leader.location.planetId, r.planetId);
  const task = TASK_CYCLES[spec.kind][spec.approach];
  const rolls = task / 2;
  const skill = skillFor(spec.kind, r.leader);
  const diff = difficulty(world, spec.kind, r, spec.houseId);
  // The house guesses the watchers from what it knows of the target's spymaster.
  const p = spec.kind === 'envoy' ? 0 : detectionChance(world, r, spec.approach);
  const rng = Rng.fromSeed(`forecast|${spec.kind}|${spec.leaderId}|${spec.targetId ?? spec.targetPlanetId ?? spec.targetHouseId}|${spec.approach}`);
  let good = 0;
  const N = 300;
  for (let i = 0; i < N; i++) {
    let prog = 0;
    let noticed = false;
    for (let k = 0; k < rolls; k++) {
      prog += progressRoll(rng, skill, diff, spec.approach);
      if (!noticed && rng.chance(p)) noticed = true;
    }
    const o = outcomeFor(prog, noticed);
    if (o === 'triumph' || o === 'success') good++;
  }
  const depth = spec.kind === 'investigate' && r.target ? knowledgeOf(world, spec.houseId, r.target.id).depth : spec.kind === 'envoy' ? knowledgeOf(world, spec.houseId, world.houses[r.targetHouseId]?.rulerId ?? '').depth : 50;
  return {
    ok: true,
    travel,
    task,
    total: travel * 2 + task,
    returns: addCycles(world.date, travel * 2 + task),
    fit: fitLabel(skill),
    success: good / N,
    noticed: 1 - Math.pow(1 - p, rolls),
    confidence: depth >= 60 ? 'Firm' : depth >= 30 ? 'Rough' : 'A guess',
  };
}

// ---------------------------------------------------------------- launching

/** Send someone out. Returns a new world (input untouched) and the mission id. */
export function launchMission(input: World, spec: MissionSpec): { world: World; id: string } {
  const world = structuredClone(input);
  const id = launchInPlace(world, spec);
  return { world, id };
}

/** Launch on a world already cloned for this turn (used by rival houses). */
export function launchInPlace(world: World, spec: MissionSpec): string {
  const r = resolveSpec(world, spec);
  if (typeof r === 'string') throw new Error(r);
  const travel = travelCycles(r.leader.location.planetId, r.planetId);
  const task = TASK_CYCLES[spec.kind][spec.approach];
  const id = `m${world.nextId++}`;
  const where = placeName(world, r.sectorId);
  const m: Mission = {
    id,
    kind: spec.kind,
    houseId: spec.houseId,
    leaderId: r.leader.id,
    targetId: r.target?.id,
    targetHouseId: spec.kind === 'envoy' ? r.targetHouseId : undefined,
    targetPlanetId: r.planetId,
    targetSectorId: r.sectorId,
    approach: spec.approach,
    stage: 'travel',
    launched: world.date,
    stageEnds: addCycles(world.date, travel),
    travelCycles: travel,
    taskCycles: task,
    origin: { ...r.leader.location },
    progress: 0,
    rolls: 0,
    noticed: false,
    leaderKnowsNoticed: false,
    log: [],
  };
  m.log.push({ date: world.date, text: `${shortName(r.leader.name)} sets out for ${where}${spec.approach === 'quick' ? ', travelling light and fast' : ''}.` });
  world.missions[id] = m;
  if (m.houseId === world.playerHouseId) {
    world.feed.push({
      date: world.date,
      kind: 'mission',
      text: `${displayName(r.leader.name)} leaves to ${describeJob(world, m)}.`,
      characterIds: [r.leader.id],
      missionId: id,
    });
  }
  return id;
}

/** A line in the player's Chronicle, for things the player's house would see. */
function tell(world: World, kind: 'intrigue' | 'world', text: string, characterIds?: string[]) {
  world.feed.push({ date: world.date, kind, text, characterIds });
}

function houseName(world: World, id: string): string {
  return `House ${world.houses[id]?.name ?? id}`;
}

export function describeJob(world: World, m: Mission): string {
  if (m.kind === 'investigate') {
    const t = m.targetId ? world.characters[m.targetId] : undefined;
    return `look into ${t ? displayName(t.name) : 'someone'}`;
  }
  if (m.kind === 'envoy') return `visit the court of House ${world.houses[m.targetHouseId ?? '']?.name ?? '?'}`;
  return `scout ${world.planets[m.targetPlanetId]?.name ?? 'a world'}`;
}

function placeName(world: World, sectorId: string): string {
  const f = findSector(world, sectorId);
  return f ? `${f.sector.name}, ${f.planet.name}` : 'parts unknown';
}

// ---------------------------------------------------------------- each turn

/** Called once per turn by advanceTurn (world already cloned). */
export function advanceMissions(world: World, rng: Rng): void {
  const now = absoluteCycle(world.date);
  for (const m of Object.values(world.missions)) {
    if (m.stage === 'done') continue;
    const leader = world.characters[m.leaderId];
    if (!leader || !leader.alive) {
      end(world, m, 'failure', `${leader ? shortName(leader.name) : 'The leader'} did not live to finish it.`);
      continue;
    }
    if (m.stage === 'task') {
      const taskStart = absoluteCycle(m.stageEnds) - m.taskCycles;
      if (now > taskStart) taskTurn(world, m, leader, rng);
      if (m.stage !== 'task') continue; // captured
    }
    // Advance through any stages whose time is up.
    while ((m.stage as Mission['stage']) !== 'done' && now >= absoluteCycle(m.stageEnds)) {
      if (m.stage === 'travel') {
        m.stage = 'task';
        m.stageEnds = addCycles(m.stageEnds, m.taskCycles);
        leader.location = { planetId: m.targetPlanetId, sectorId: m.targetSectorId };
        m.log.push({ date: world.date, text: `Arrived at ${placeName(world, m.targetSectorId)}. Work begins.` });
        if (m.kind === 'envoy' && m.targetHouseId === world.playerHouseId && m.houseId !== world.playerHouseId) {
          learn(world, world.playerHouseId, leader.id, 20);
          tell(world, 'world', `An envoy of ${houseName(world, m.houseId)}, ${displayName(leader.name)}, arrives at our court.`, [leader.id]);
        }
      } else if (m.stage === 'task') {
        m.outcome = outcomeFor(m.progress, m.noticed);
        m.stage = 'return';
        m.stageEnds = addCycles(m.stageEnds, m.travelCycles);
        m.log.push({ date: world.date, text: `The work is done. ${shortName(leader.name)} heads home.` });
      } else if (m.stage === 'return') {
        leader.location = { ...m.origin };
        deliver(world, m, leader, rng);
      }
    }
  }
}

function taskTurn(world: World, m: Mission, leader: Character, rng: Rng) {
  const r = resolveSpec({ ...world, missions: {} }, {
    kind: m.kind, houseId: m.houseId, leaderId: m.leaderId, targetId: m.targetId, targetPlanetId: m.targetPlanetId, targetHouseId: m.targetHouseId, approach: m.approach,
  });
  if (typeof r === 'string') {
    end(world, m, 'failure', `The trail went cold: ${r.toLowerCase()}`);
    return;
  }
  const gain = progressRoll(rng, skillFor(m.kind, leader), difficulty(world, m.kind, r, null), m.approach);
  m.progress += gain;
  m.rolls += 1;
  const LINES = {
    investigate: ['A good day: a servant talks, a record turns up.', 'Nothing. Doors stay shut.'],
    scout: ['Covered a lot of ground today.', 'Slow going. Patrols everywhere.'],
    envoy: ['Received warmly at court. A long dinner, good words.', 'Kept waiting in antechambers all day.'],
  } as const;
  if (gain >= 9) m.log.push({ date: world.date, text: LINES[m.kind][0] });
  else if (gain < 2) m.log.push({ date: world.date, text: LINES[m.kind][1] });

  if (m.noticed || m.kind === 'envoy') return;
  const watcher = watcherSkill(world, r);
  if (!rng.chance(detectionChance(world, r, m.approach, watcher))) return;

  m.noticed = true;
  m.leaderKnowsNoticed = rng.chance(Math.min(0.9, leader.stats.perception / 22));
  if (m.leaderKnowsNoticed) m.log.push({ date: world.date, text: `${shortName(leader.name)} is sure they have been seen.` });

  const escape = (leader.stats.agility + leader.stats.reflexes) / 2;
  const capture = Math.min(0.6, (m.approach === 'quick' ? 0.2 : 0.08) + Math.max(0, watcher - escape) * 0.015);
  if (rng.chance(capture)) {
    leader.flags.push({ id: 'captive', since: world.date, detail: `held by House ${world.houses[r.targetHouseId]?.name}`, knownBy: [r.targetHouseId] });
    leader.flags.push({ id: 'missing', since: world.date });
    learn(world, r.targetHouseId, leader.id, 40);
    world.captives ??= {};
    world.captives[leader.id] = { characterId: leader.id, heldBy: r.targetHouseId, since: world.date, missionId: m.id, interrogated: false };
    leader.location = { planetId: m.targetPlanetId, sectorId: m.targetSectorId };
    if (r.targetHouseId === world.playerHouseId) {
      tell(world, 'intrigue', `Caught: ${displayName(leader.name)}, an agent of ${houseName(world, m.houseId)}, was seized in ${placeName(world, m.targetSectorId)}${r.target ? ` asking after ${shortName(r.target.name)}` : ''}. They are ours to deal with.`, [leader.id, ...(r.target ? [r.target.id] : [])]);
    }
    m.log.push({ date: world.date, text: 'No word since this cycle.' });
    end(world, m, 'disaster', `${displayName(leader.name)} has not reported in. They were last heard from at ${placeName(world, m.targetSectorId)}.`);
    return;
  }
  // Seen, but got away: the other house now knows a face.
  learn(world, r.targetHouseId, leader.id, 25);
  if (r.targetHouseId === world.playerHouseId && m.houseId !== world.playerHouseId) {
    tell(world, 'intrigue', `Our people spotted an agent of ${houseName(world, m.houseId)} in ${placeName(world, m.targetSectorId)}${r.target ? `, asking after ${shortName(r.target.name)}` : ''}. ${shortName(leader.name)} slipped away.`, [leader.id, ...(r.target ? [r.target.id] : [])]);
  }
  leader.flags.push({
    id: 'exposed', since: world.date, until: addCycles(world.date, CYCLES_PER_ORBIT * 3),
    detail: `to House ${world.houses[r.targetHouseId]?.name}`, knownBy: [r.targetHouseId, ...(m.leaderKnowsNoticed ? [m.houseId] : [])],
  });
}

function end(world: World, m: Mission, outcome: Outcome, text: string) {
  m.stage = 'done';
  m.outcome = outcome;
  m.ended = world.date;
  m.report = text;
  m.findings = [];
  if (m.houseId === world.playerHouseId) {
    world.feed.push({ date: world.date, kind: 'mission', text: `${MISSION_LABEL[m.kind]} — ${OUTCOME_LABEL[outcome]}. ${text}`, characterIds: [m.leaderId], missionId: m.id });
  }
}

// ---------------------------------------------------------------- the report

const GAINS: Record<MissionKind, Record<Exclude<Outcome, 'disaster'>, [number, number]>> = {
  // [full tier, minor tier]
  investigate: { triumph: [65, 65], success: [45, 45], partial: [25, 25], failure: [8, 8] },
  scout: { triumph: [35, 20], success: [25, 12], partial: [12, 6], failure: [3, 0] },
  envoy: { triumph: [20, 0], success: [15, 0], partial: [8, 0], failure: [3, 0] },
};

const ENVOY_REGARD: Record<Exclude<Outcome, 'disaster'>, number> = { triumph: 20, success: 12, partial: 5, failure: -4 };

function deliver(world: World, m: Mission, leader: Character, rng: Rng) {
  const outcome = (m.outcome ?? 'failure') as Exclude<Outcome, 'disaster'>;
  const findings: string[] = [];

  if (m.kind === 'investigate' && m.targetId) {
    const t = world.characters[m.targetId]!;
    const before = viewOf(world, m.houseId, t);
    learn(world, m.houseId, t.id, GAINS.investigate[outcome][0]);
    // Secrets: a triumph opens them all, a success one.
    const secrets = t.flags.filter((f) => FLAGS_BY_ID[f.id]?.visibility === 'secret' && !f.knownBy?.includes(m.houseId) && f.id !== 'exposed');
    const opened = outcome === 'triumph' ? secrets : outcome === 'success' ? secrets.slice(0, 1) : [];
    for (const f of opened) f.knownBy = [...(f.knownBy ?? []), m.houseId];
    if (outcome === 'triumph' && t.species === 'shaaliin' && t.name.trueName && !t.flags.some((f) => f.id === 'trueNameKnown' && f.knownBy?.includes(m.houseId))) {
      t.flags.push({ id: 'trueNameKnown', since: world.date, detail: t.name.trueName, knownBy: [m.houseId] });
    }
    const after = viewOf(world, m.houseId, t);
    findings.push(...diffViews(before, after));
  } else if (m.kind === 'envoy' && m.targetHouseId) {
    const h = world.houses[m.targetHouseId]!;
    const before = relation(world, h.id, m.houseId);
    shiftRelation(world, h.id, m.houseId, ENVOY_REGARD[outcome], 70);
    // Courtesy runs both ways, a little.
    if (outcome !== 'failure') shiftRelation(world, m.houseId, h.id, 3, 70);
    const after = relation(world, h.id, m.houseId);
    findings.push(after > before
      ? `House ${h.name} now regards us as ${attitude(after)} (${before} → ${after}).`
      : after < before ? `The visit went badly. House ${h.name} cools toward us (${before} → ${after}).` : `House ${h.name}'s regard is unchanged (${after}).`);
    // Both sides learn faces.
    learn(world, h.id, leader.id, 30);
    const seen = Object.values(world.characters).filter((c) => c.alive && c.houseId === h.id && c.seat);
    const gain = GAINS.envoy[outcome][0];
    for (const c of seen) learn(world, m.houseId, c.id, gain);
    if (seen.length && gain) findings.push(`Met their council face to face: ${seen.length} councillors better known.`);
    if (outcome === 'triumph') {
      const st = world.houses[m.houseId]!.standing;
      st.respect = Math.min(100, st.respect + 2);
      findings.push('Word of the visit spreads. Our respect grows.');
    }
  } else {
    const planet = world.planets[m.targetPlanetId]!;
    const [full, minor] = GAINS.scout[outcome];
    let learned = 0;
    for (const c of Object.values(world.characters)) {
      if (!c.alive || c.location.planetId !== planet.id) continue;
      const g = c.tier === 'full' ? full : minor;
      if (g > 0 && learn(world, m.houseId, c.id, g) > 0) learned++;
    }
    if (learned) findings.push(`New details on ${learned} people living on ${planet.name}.`);
    if (outcome !== 'failure') {
      const restless = [...planet.sectors].sort((a, b) => b.unrest - a.unrest)[0];
      if (restless) findings.push(`${restless.name} is the most restless sector (unrest ${restless.unrest}).`);
      const seat = seatHolder(world, planet.houseId, 'grandMaster');
      if (seat && (outcome === 'success' || outcome === 'triumph')) findings.push(`Their Grand Master, ${displayName(seat.name)}, keeps the garrison.`);
    }
    if (outcome === 'triumph') {
      const ports = planet.sectors.filter((s) => s.port === 'starport' || s.port === 'spaceport').map((s) => s.name);
      if (ports.length) findings.push(`Ports able to take warships: ${ports.join(', ')}.`);
    }
    if (!findings.length) findings.push('Nothing of use.');
  }

  if (m.noticed && m.leaderKnowsNoticed) findings.push(`${shortName(leader.name)} believes they were seen.`);

  m.report = report(world, m, leader, outcome, rng);
  m.findings = findings;
  m.stage = 'done';
  m.ended = world.date;
  m.log.push({ date: world.date, text: `Home. Report delivered.` });
  if (m.houseId !== world.playerHouseId) {
    if (m.kind === 'envoy' && m.targetHouseId === world.playerHouseId) {
      tell(world, 'world', `The envoy of ${houseName(world, m.houseId)} leaves our court. We now regard them as ${attitude(relation(world, world.playerHouseId, m.houseId))}.`, [leader.id]);
    } else if (m.kind === 'envoy' && m.targetHouseId) {
      tell(world, 'world', `Word reaches us: ${houseName(world, m.houseId)} sent an envoy to ${houseName(world, m.targetHouseId)}.`);
    }
    return;
  }
  world.feed.push({
    date: world.date,
    kind: 'mission',
    text: `${displayName(leader.name)} returns: ${describeJob(world, m)} — ${OUTCOME_LABEL[outcome].toLowerCase()}.`,
    characterIds: [leader.id, ...(m.targetId ? [m.targetId] : [])],
    missionId: m.id,
  });
}

function diffViews(before: CharacterView, after: CharacterView): string[] {
  const out: string[] = [];
  const newTraits = after.traits.filter((t) => !before.traits.some((b) => b.id === t.id));
  if (newTraits.length) out.push(`Character: ${newTraits.map((t) => traitLabel(t.id, t.detail)).join(', ')}.`);
  const newFlags = after.flags.filter((f) => !before.flags.some((b) => b.id === f.id));
  for (const f of newFlags) {
    const def = FLAGS_BY_ID[f.id];
    out.push(`Secret uncovered: ${def?.label ?? f.id}${f.detail ? ` (${f.detail})` : ''}.`);
  }
  if (!before.hidden && after.hidden) out.push('Their temperament and loyalties can now be read.');
  const bRes = before.resonance;
  const aRes = after.resonance;
  if (aRes && aRes !== 'unknown' && (bRes === 'unknown' || (bRes !== null && bRes.degrees === undefined && aRes.degrees !== undefined))) {
    out.push(aRes.degrees !== undefined ? `Resonance measured: ${aRes.degrees}°S.` : `Resonance band: ${aRes.band}.`);
  }
  const width = (v: CharacterView) => {
    const r = v.stats.intrigue;
    return r[1] - r[0];
  };
  if (width(after) < width(before)) out.push(after.depth >= 85 ? 'Their abilities are now known exactly.' : 'Their abilities are better understood.');
  if (!out.length) out.push('Nothing new.');
  return out;
}

// Each species reports in its own voice.
const VOICE: Record<SpeciesId, { open: Record<Exclude<Outcome, 'disaster'>, string[]>; close: string[] }> = {
  fokari: {
    open: {
      triumph: ['It is all here, set down in order.', 'The record is complete.'],
      success: ['I have what you asked for.', 'The matter is mostly clear.'],
      partial: ['Some of it, not all.', 'I return with pieces.'],
      failure: ['I have little to show.', 'The record stays closed.'],
    },
    close: ['For the House.', 'Recorded and sealed.'],
  },
  thessari: {
    open: {
      triumph: ['Clean work. Every question answered.', 'Done, and done well.'],
      success: ['The job is done.', 'Good hunting.'],
      partial: ['Half a job. I will say so plainly.', 'Not my best work.'],
      failure: ['I failed you. No excuses.', 'Nothing. I will not dress it up.'],
    },
    close: ['Standing by.', 'At your word.'],
  },
  torvann: {
    open: {
      triumph: ['I took it all. Every secret.', 'The hunt went well.'],
      success: ['I found what you sent me for.', 'Good blood, this hunt.'],
      partial: ['Scraps. But scraps feed.', 'I came back with something.'],
      failure: ['Empty hands. It shames me.', 'The trail ran out.'],
    },
    close: ['The hold remembers.', 'Ash and iron.'],
  },
  serathi: {
    open: {
      triumph: ['In and out, nobody the wiser, and look what I brought.', 'Textbook run.'],
      success: ['Got it. Mostly smooth.', 'Clean enough.'],
      partial: ['Bit of a scramble, but I got some.', 'Partial haul.'],
      failure: ['Bust. Total bust.', 'Came up dry.'],
    },
    close: ['Over and out.', 'Wheels down.'],
  },
  shaaliin: {
    open: {
      triumph: ['They told me everything, and thanked me for listening.', 'The masks came off, one by one.'],
      success: ['A pleasant few cycles, and fruitful.', 'I have learned what they would rather keep.'],
      partial: ['They were guarded. Still, a thread or two.', 'Polite doors, mostly closed.'],
      failure: ['They smiled and said nothing.', 'A wasted season, prettily spent.'],
    },
    close: ['With grace.', 'Yours, in confidence.'],
  },
  doven: {
    open: {
      triumph: ['Every figure tallied.', 'The accounts balance.'],
      success: ['The numbers mostly add up.', 'A fair return.'],
      partial: ['Incomplete figures.', 'Some columns are empty.'],
      failure: ['A loss, I am afraid.', 'Nothing to enter in the ledger.'],
    },
    close: ['Respectfully submitted.', 'Ledger closed.'],
  },
  gholari: {
    open: {
      triumph: ['Slowly, patiently, it all came up from the dark.', 'The roots go deep; I followed them all.'],
      success: ['Patience was rewarded.', 'Enough has surfaced.'],
      partial: ['Some of it has surfaced. Not all.', 'Shallow digging.'],
      failure: ['The ground was hard.', 'Nothing grew.'],
    },
    close: ['In time, all things.', 'From below.'],
  },
};

function report(world: World, m: Mission, leader: Character, outcome: Exclude<Outcome, 'disaster'>, rng: Rng): string {
  const v = VOICE[leader.species];
  const subject = m.kind === 'investigate' && m.targetId ? shortName(world.characters[m.targetId]!.name)
    : m.kind === 'envoy' ? `House ${world.houses[m.targetHouseId ?? '']?.name ?? ''}`
    : world.planets[m.targetPlanetId]?.name ?? '';
  return `${rng.pick(v.open[outcome])} On ${subject}, what I found is set out below. ${rng.pick(v.close)} — ${shortName(leader.name)}`;
}
