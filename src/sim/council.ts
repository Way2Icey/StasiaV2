// The council at work: standing tasks for each seat, the Highroy's oath,
// petitions from the council, and the house's standing and relations.
import { Rng } from './rng';
import { ageOf } from './characters';
import { shortName } from './names';
import { alive, seatHolder } from './query';
import { knowledgeOf, learn } from './knowledge';
import { activeMissions, cannotLead, skillFor } from './missions';
import { attitude, attitudeColor, relation, shiftRelation } from './relations';
import { absoluteCycle, addCycles, CYCLES_PER_ORBIT, CYCLES_PER_PHASE } from './time';
import { FLAGS_BY_ID } from '../data/flags';
import { SPECIES } from '../data/species';
import type {
  Character, CouncilSeat, Court, MissionKind, Petition, Standing, StatId, TaskAssignment, World,
} from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ---------------------------------------------------------------- standing & relations

export function initialStanding(world: World, houseId: string): Standing {
  const h = world.houses[houseId]!;
  if (houseId === world.playerHouseId) return { honour: 55, respect: 30, dread: 10 };
  return {
    honour: Math.round(35 + h.personality.honour * 35),
    respect: h.tier === 'great' ? 60 : 35,
    dread: Math.round(10 + h.personality.aggression * 40),
  };
}

export { relation, shiftRelation, attitude, attitudeColor };

function initialRelations(world: World, rng: Rng) {
  const ids = Object.keys(world.houses);
  for (const a of ids) {
    world.relations[a] ??= {};
    for (const b of ids) {
      if (a === b || world.relations[a]![b] !== undefined) continue;
      const p = world.houses[a]!.personality;
      const base = (p.honour - p.aggression) * 25 - p.isolation * 10 + rng.int(-10, 10);
      world.relations[a]![b] = Math.round(clamp(base, -60, 60));
    }
  }
}

// ---------------------------------------------------------------- tasks

export type TaskTarget = 'house' | 'ownSector' | null;

export interface TaskDef {
  id: string;
  seat: CouncilSeat;
  label: string;
  description: string;
  target: TaskTarget;
  /** Stats that drive how well it goes, with weights summing to 1. */
  stats: [StatId, number][];
  /** Progress needed for one result. */
  threshold: number;
}

export const TASKS: TaskDef[] = [
  { id: 'keepOrder', seat: 'steward', label: 'Keep order', description: 'Settle disputes and grievances across our sectors. Lowers unrest.', target: null, stats: [['stewardship', 0.5], ['law', 0.3], ['diplomacy', 0.2]], threshold: 50 },
  { id: 'develop', seat: 'steward', label: 'Develop a sector', description: 'Pour effort into one sector: new quarters, more people.', target: 'ownSector', stats: [['stewardship', 0.5], ['logistics', 0.3], ['intellect', 0.2]], threshold: 90 },
  { id: 'drillHost', seat: 'grandMaster', label: 'Drill the host', description: 'Train the knights. They slowly grow sharper.', target: null, stats: [['tactics', 0.4], ['discipline', 0.3], ['leadership', 0.3]], threshold: 70 },
  { id: 'patrol', seat: 'grandMaster', label: 'Patrol the sectors', description: 'Show the house’s steel where trouble brews. Lowers unrest, raises dread.', target: null, stats: [['leadership', 0.4], ['tactics', 0.3], ['perception', 0.3]], threshold: 55 },
  { id: 'courtHouse', seat: 'envoy', label: 'Court a house', description: 'Letters, gifts and visits to one house. Warms their view of us.', target: 'house', stats: [['diplomacy', 0.45], ['eloquence', 0.3], ['negotiation', 0.25]], threshold: 50 },
  { id: 'attendNumerade', seat: 'envoy', label: 'Attend the Numerade', description: 'Be seen and heard among the Houses of Archon. Raises respect.', target: null, stats: [['eloquence', 0.4], ['diplomacy', 0.3], ['law', 0.3]], threshold: 60 },
  { id: 'whispers', seat: 'spymaster', label: 'Gather whispers', description: 'Agents listen at one house’s doors. Slowly learn about its people.', target: 'house', stats: [['intrigue', 0.5], ['insight', 0.3], ['deception', 0.2]], threshold: 45 },
  { id: 'watchHouse', seat: 'spymaster', label: 'Watch our own', description: 'Keep eyes on our own people. Learn them better; secrets surface.', target: null, stats: [['insight', 0.5], ['perception', 0.3], ['intrigue', 0.2]], threshold: 50 },
  { id: 'tendHousehold', seat: 'physician', label: 'Tend the household', description: 'Wounds and sickness in the family heal faster; grief passes sooner.', target: null, stats: [['intellect', 0.5], ['insight', 0.3], ['composure', 0.2]], threshold: 30 },
  { id: 'tendCommons', seat: 'physician', label: 'Serve the commons', description: 'Open clinics in our sectors. Lowers unrest a little, earns respect.', target: null, stats: [['intellect', 0.4], ['diplomacy', 0.3], ['stewardship', 0.3]], threshold: 70 },
  { id: 'keepRecords', seat: 'elder', label: 'Keep the records', description: 'Guard the house’s traditions and word. Raises honour slowly.', target: null, stats: [['law', 0.4], ['intellect', 0.4], ['composure', 0.2]], threshold: 80 },
  { id: 'teachYoung', seat: 'elder', label: 'Teach the young', description: 'Tutor the house’s children and young adults. Their minds grow.', target: null, stats: [['intellect', 0.4], ['eloquence', 0.3], ['composure', 0.3]], threshold: 60 },
  { id: 'trainKnights', seat: 'champion', label: 'Train with the knights', description: 'Spar with the knights. Their blades and nerve improve.', target: null, stats: [['duelling', 0.5], ['leadership', 0.25], ['valor', 0.25]], threshold: 60 },
  { id: 'pits', seat: 'champion', label: 'Fight in the pits', description: 'Win bouts for the house’s name. Respect and dread, at a risk.', target: null, stats: [['duelling', 0.5], ['strength', 0.2], ['agility', 0.3]], threshold: 60 },
];

export const TASKS_BY_ID: Record<string, TaskDef> = Object.fromEntries(TASKS.map((t) => [t.id, t]));

export const DEFAULT_TASK: Partial<Record<CouncilSeat, string>> = {
  steward: 'keepOrder', grandMaster: 'drillHost', envoy: 'attendNumerade', spymaster: 'watchHouse',
  physician: 'tendHousehold', elder: 'keepRecords', champion: 'trainKnights',
};

export function tasksForSeat(seat: CouncilSeat): TaskDef[] {
  return TASKS.filter((t) => t.seat === seat);
}

export function taskScore(def: TaskDef, c: Character): number {
  return def.stats.reduce((sum, [s, w]) => sum + c.stats[s] * w, 0);
}

/** 1..20 score to a word, same scale as mission fit. */
export function taskFit(score: number): string {
  if (score >= 15) return 'Excellent';
  if (score >= 12) return 'Good';
  if (score >= 9) return 'Fair';
  return 'Poor';
}

// ---------------------------------------------------------------- oaths

export interface OathDef {
  id: string;
  label: string;
  vow: string;
  description: string;
  target: 'house' | null;
  /** Tasks that get a boost while the oath stands. */
  tasks: string[];
  measure: (world: World, houseId: string, target?: string) => number;
  /** The goal, given where the measure stood when it was sworn. */
  goal: (baseline: number) => number;
  unit: string;
}

const MARTIAL: StatId[] = ['duelling', 'tactics', 'discipline', 'valor', 'marksmanship'];

function rivalCouncil(world: World, houseId: string): Character[] {
  return alive(world).filter((c) => c.houseId !== houseId && c.seat);
}

function martialOf(world: World, houseId: string): number {
  return alive(world)
    .filter((c) => c.houseId === houseId && (c.role === 'Knight' || c.seat === 'champion'))
    .reduce((sum, c) => sum + MARTIAL.reduce((s, k) => s + c.stats[k], 0), 0);
}

function ownSectors(world: World, houseId: string) {
  return Object.values(world.planets).filter((p) => p.houseId === houseId).flatMap((p) => p.sectors).filter((s) => s.controllerFamilyId);
}

export const OATHS: OathDef[] = [
  {
    id: 'knowRivals', label: 'Know our rivals', vow: 'No council in Stasia will hold secrets from us.',
    description: 'Learn the councils of every rival house: average knowledge of them must reach 50.',
    target: null, tasks: ['whispers', 'watchHouse'],
    measure: (w, h) => {
      const r = rivalCouncil(w, h);
      return r.length ? Math.round(r.reduce((s, c) => s + knowledgeOf(w, h, c.id).depth, 0) / r.length) : 100;
    },
    goal: () => 50, unit: 'average knowledge',
  },
  {
    id: 'winFriend', label: 'Win a friend at court', vow: 'They will call us friend before the Orbit turns.',
    description: 'Bring one house to regard us as Friendly (40 or better).',
    target: 'house', tasks: ['courtHouse', 'attendNumerade'],
    measure: (w, h, t) => (t ? relation(w, t, h) : 0),
    goal: () => 40, unit: 'their regard',
  },
  {
    id: 'orderAtHome', label: 'Order at home', vow: 'Not one of our sectors will be left to grumble.',
    description: 'Bring unrest in every sector we hold down to 15 or lower.',
    target: null, tasks: ['keepOrder', 'patrol', 'tendCommons'],
    measure: (w, h) => Math.max(0, ...ownSectors(w, h).map((s) => s.unrest)),
    goal: () => 15, unit: 'worst unrest',
  },
  {
    id: 'steelHost', label: 'Steel the host', vow: 'Our knights will be sharper when this oath is done.',
    description: 'Raise the combined martial skill of our knights and champion by 12.',
    target: null, tasks: ['drillHost', 'trainKnights', 'pits'],
    measure: (w, h) => martialOf(w, h),
    goal: (b) => b + 12, unit: 'martial total',
  },
  {
    id: 'raiseName', label: 'Raise our name', vow: 'Every house in Stasia will know our name.',
    description: 'Raise the house’s respect by 10.',
    target: null, tasks: ['attendNumerade', 'pits', 'keepRecords'],
    measure: (w, h) => w.houses[h]!.standing.respect,
    goal: (b) => Math.min(100, b + 10), unit: 'respect',
  },
];

export const OATHS_BY_ID: Record<string, OathDef> = Object.fromEntries(OATHS.map((o) => [o.id, o]));

/** Oaths measured downward (lower is better). */
const LOWER_IS_BETTER = new Set(['orderAtHome']);

export const OATH_LENGTH = CYCLES_PER_ORBIT;

export interface OathProgress {
  value: number;
  goal: number;
  /** 0..1 of the way there, from the baseline. */
  fraction: number;
  done: boolean;
}

export function oathProgress(world: World, houseId: string): OathProgress | null {
  const oath = world.courts[houseId]?.oath;
  if (!oath) return null;
  const def = OATHS_BY_ID[oath.id]!;
  const value = def.measure(world, houseId, oath.target);
  const goal = def.goal(oath.baseline);
  if (LOWER_IS_BETTER.has(def.id)) {
    const span = oath.baseline - goal;
    return { value, goal, done: value <= goal, fraction: span <= 0 ? 1 : clamp((oath.baseline - value) / span, 0, 1) };
  }
  const span = goal - oath.baseline;
  return { value, goal, done: value >= goal, fraction: span <= 0 ? 1 : clamp((value - oath.baseline) / span, 0, 1) };
}

// ---------------------------------------------------------------- setup

function newCourt(): Court {
  return { tasks: {}, oath: null, oaths: [], petitions: [], reports: [] };
}

/** Fill in standing, relations and courts where missing (new worlds and old saves). */
export function ensureCouncil(world: World): void {
  world.relations ??= {};
  world.courts ??= {};
  for (const h of Object.values(world.houses)) {
    h.standing ??= initialStanding(world, h.id);
    const court = (world.courts[h.id] ??= newCourt());
    for (const [seat, task] of Object.entries(DEFAULT_TASK) as [CouncilSeat, string][]) {
      if (court.tasks[seat]) continue;
      let target: string | undefined;
      if (TASKS_BY_ID[task]!.target === 'house') target = Object.keys(world.houses).find((x) => x !== h.id);
      court.tasks[seat] = { task, target, since: world.date, progress: 0 };
    }
  }
  initialRelations(world, Rng.fromSeed(`${world.seed}|relations`));
}

// ---------------------------------------------------------------- player actions (pure: return a new world)

export function assignTask(input: World, houseId: string, seat: CouncilSeat, task: string, target?: string): World {
  const def = TASKS_BY_ID[task];
  if (!def || def.seat !== seat) throw new Error('That task does not belong to that seat.');
  const world = structuredClone(input);
  const court = world.courts[houseId]!;
  if (def.target && !target) {
    target = def.target === 'house'
      ? Object.keys(world.houses).find((x) => x !== houseId)
      : ownSectors(world, houseId)[0]?.id;
  }
  const prev = court.tasks[seat];
  const same = prev && prev.task === task && prev.target === target;
  court.tasks[seat] = same ? prev : { task, target, since: world.date, progress: 0 };
  return world;
}

export function swearOath(input: World, houseId: string, oathId: string, target?: string): World {
  const def = OATHS_BY_ID[oathId];
  if (!def) throw new Error('No such oath.');
  if (def.target === 'house' && (!target || !input.houses[target] || target === houseId)) throw new Error('Choose a house.');
  const world = structuredClone(input);
  swearInPlace(world, houseId, oathId, target);
  return world;
}

/** Swear an oath on a world already cloned for this turn (used by rival houses). */
export function swearInPlace(world: World, houseId: string, oathId: string, target?: string): void {
  const def = OATHS_BY_ID[oathId]!;
  const court = world.courts[houseId]!;
  if (court.oath) throw new Error('An oath already stands.');
  court.oath = {
    id: oathId, target: def.target ? target : undefined, sworn: world.date,
    ends: addCycles(world.date, OATH_LENGTH), baseline: def.measure(world, houseId, target),
  };
  if (houseId === world.playerHouseId) {
    const ruler = world.characters[world.houses[houseId]!.rulerId ?? ''];
    world.feed.push({
      date: world.date, kind: 'council',
      text: `${ruler ? shortName(ruler.name) : 'The Highroy'} swears an oath before the council: “${def.vow}”${target ? ` (House ${world.houses[target]!.name})` : ''}`,
      characterIds: ruler ? [ruler.id] : undefined,
    });
  }
}

export function abandonOath(input: World, houseId: string): World {
  const world = structuredClone(input);
  closeOath(world, houseId, 'abandoned');
  return world;
}

export function dismissPetition(input: World, houseId: string, petitionId: string): World {
  const world = structuredClone(input);
  const court = world.courts[houseId]!;
  const p = court.petitions.find((x) => x.id === petitionId);
  court.petitions = court.petitions.filter((x) => x.id !== petitionId);
  const from = p ? world.characters[p.fromId] : undefined;
  if (from) from.hidden.loyalty = clamp(from.hidden.loyalty - 0.25, 1, 20);
  return world;
}

/** Remove a petition once acted on (the mission was sent). */
export function closePetition(world: World, houseId: string, petitionId: string): void {
  const court = world.courts[houseId];
  if (court) court.petitions = court.petitions.filter((x) => x.id !== petitionId);
}

function closeOath(world: World, houseId: string, result: 'kept' | 'broken' | 'abandoned') {
  const court = world.courts[houseId]!;
  const oath = court.oath;
  if (!oath) return;
  const def = OATHS_BY_ID[oath.id]!;
  const st = world.houses[houseId]!.standing;
  if (result === 'kept') {
    st.honour = clamp(st.honour + 5, 0, 100);
    st.respect = clamp(st.respect + 3, 0, 100);
    for (const c of alive(world)) if (c.houseId === houseId && c.seat) c.hidden.loyalty = clamp(c.hidden.loyalty + 1, 1, 20);
  } else {
    st.honour = clamp(st.honour - (result === 'abandoned' ? 6 : 4), 0, 100);
  }
  court.oaths.unshift({ id: oath.id, target: oath.target, sworn: oath.sworn, ended: world.date, result });
  court.oaths = court.oaths.slice(0, 20);
  court.oath = null;
  if (houseId === world.playerHouseId) {
    const text = result === 'kept'
      ? `Oath kept: “${def.label}”. Honour and respect rise.`
      : result === 'broken'
        ? `Oath broken: “${def.label}” was not fulfilled in time. Honour suffers.`
        : `Oath abandoned: “${def.label}”. The council notes it. Honour suffers.`;
    world.feed.push({ date: world.date, kind: 'council', text });
  }
}

// ---------------------------------------------------------------- each turn

export function advanceCouncil(world: World, rng: Rng, phaseTurned: boolean, orbitTurned: boolean): void {
  for (const houseId of Object.keys(world.houses)) {
    const court = world.courts[houseId];
    if (!court) continue;
    const oathTasks = new Set(court.oath ? OATHS_BY_ID[court.oath.id]?.tasks ?? [] : []);
    for (const [seat, a] of Object.entries(court.tasks) as [CouncilSeat, TaskAssignment][]) {
      const c = seatHolder(world, houseId, seat);
      const def = TASKS_BY_ID[a.task];
      if (!c || !def) continue;
      if (c.flags.some((f) => f.id === 'captive' || f.id === 'missing')) continue;
      if (activeMissions(world).some((m) => m.leaderId === c.id)) continue; // away on a mission
      const perf = Math.max(0, taskScore(def, c) + rng.gauss() * 2) * (oathTasks.has(def.id) ? 1.25 : 1);
      a.progress += perf;
      while (a.progress >= def.threshold) {
        a.progress -= def.threshold;
        const text = runTask(world, rng, houseId, c, def, a);
        if (text) report(world, houseId, seat, c, text);
      }
    }
    // Oath check.
    const p = oathProgress(world, houseId);
    if (court.oath && p) {
      if (p.done) closeOath(world, houseId, 'kept');
      else if (absoluteCycle(world.date) >= absoluteCycle(court.oath.ends)) closeOath(world, houseId, 'broken');
    }
    // Petitions.
    court.petitions = court.petitions.filter((x) => absoluteCycle(x.expires) > absoluteCycle(world.date));
    if (houseId === world.playerHouseId) maybePetition(world, rng, houseId);
  }

  if (orbitTurned) driftUnrest(world, rng);
  if (phaseTurned) driftRelations(world);
}

function report(world: World, houseId: string, seat: CouncilSeat, c: Character, text: string) {
  const court = world.courts[houseId]!;
  court.reports.unshift({ date: world.date, seat, characterId: c.id, text });
  court.reports = court.reports.slice(0, 40);
}

function feed(world: World, houseId: string, text: string, ids: string[]) {
  if (houseId === world.playerHouseId) world.feed.push({ date: world.date, kind: 'council', text, characterIds: ids });
}

function growStat(rng: Rng, c: Character, stats: StatId[], chanceScale = 1): StatId | null {
  const s = rng.pick(stats);
  const chance = (c.hidden.potential / 20) * chanceScale * (c.stats[s] >= 17 ? 0.35 : 1);
  if (c.stats[s] >= 20 || !rng.chance(chance)) return null;
  c.stats[s] += 1;
  return s;
}

const STAT_WORD: Partial<Record<StatId, string>> = {
  duelling: 'duelling', tactics: 'tactics', discipline: 'discipline', valor: 'valor', marksmanship: 'marksmanship',
  intellect: 'intellect', eloquence: 'eloquence', law: 'law', insight: 'insight', diplomacy: 'diplomacy',
};

function runTask(world: World, rng: Rng, houseId: string, c: Character, def: TaskDef, a: TaskAssignment): string | null {
  const st = world.houses[houseId]!.standing;
  const who = shortName(c.name);
  switch (def.id) {
    case 'keepOrder': {
      const sectors = ownSectors(world, houseId).filter((s) => s.unrest > 0);
      for (const s of sectors) s.unrest = Math.max(0, s.unrest - 1);
      return sectors.length ? `Grievances heard across ${sectors.length} sectors. Unrest eases.` : 'All quiet. Nothing to settle.';
    }
    case 'develop': {
      const s = ownSectors(world, houseId).find((x) => x.id === a.target);
      if (!s) return null;
      if (s.roomUsed < s.room) {
        s.roomUsed += 1;
        s.population = Math.round(s.population * 1.03);
        feed(world, houseId, `${s.name} grows: new ground is built on.`, [c.id]);
        return `New construction in ${s.name}. Room used ${s.roomUsed}/${s.room}.`;
      }
      s.unrest = Math.max(0, s.unrest - 1);
      return `${s.name} is built out. Effort goes to upkeep instead.`;
    }
    case 'drillHost':
    case 'trainKnights': {
      const knights = alive(world).filter((k) => k.houseId === houseId && k.role === 'Knight');
      if (!knights.length) return 'No knights to train.';
      const k = rng.pick(knights);
      const stats: StatId[] = def.id === 'drillHost' ? ['tactics', 'discipline', 'marksmanship'] : ['duelling', 'valor'];
      const grew = growStat(rng, k, stats);
      if (grew) {
        feed(world, houseId, `${shortName(k.name)} improves in ${STAT_WORD[grew]} under ${who}.`, [k.id, c.id]);
        return `${shortName(k.name)} improves: ${STAT_WORD[grew]} ${k.stats[grew]}.`;
      }
      return `${shortName(k.name)} trained hard. No breakthrough yet.`;
    }
    case 'patrol': {
      const s = [...ownSectors(world, houseId)].sort((x, y) => y.unrest - x.unrest)[0];
      if (s) s.unrest = Math.max(0, s.unrest - 2);
      if (rng.chance(0.4)) st.dread = clamp(st.dread + 1, 0, 100);
      return s ? `Patrols through ${s.name}. Unrest there now ${s.unrest}.` : 'Patrols find nothing.';
    }
    case 'courtHouse': {
      if (!a.target || !world.houses[a.target]) return null;
      const iso = world.houses[a.target]!.personality.isolation;
      const gain = rng.chance(1 - iso * 0.5) ? 2 : 1;
      const moved = shiftRelation(world, a.target, houseId, gain, 45);
      learn(world, houseId, world.houses[a.target]!.rulerId ?? '', 2);
      return moved > 0
        ? `Gifts and letters to House ${world.houses[a.target]!.name}. Their regard: ${relation(world, a.target, houseId)}.`
        : `House ${world.houses[a.target]!.name} accepts our courtesies but will warm no further this way.`;
    }
    case 'attendNumerade': {
      if (st.respect < 70 || rng.chance(0.3)) st.respect = clamp(st.respect + 1, 0, 100);
      return `${who} speaks in the Numerade. Respect ${st.respect}.`;
    }
    case 'whispers': {
      if (!a.target || !world.houses[a.target]) return null;
      const people = alive(world).filter((k) => k.houseId === a.target && k.tier === 'full' && knowledgeOf(world, houseId, k.id).depth < 60);
      if (!people.length) return `There is little left to learn of House ${world.houses[a.target]!.name} from whispers alone.`;
      const picked = rng.shuffle([...people]).slice(0, 3);
      for (const k of picked) learn(world, houseId, k.id, 4);
      return `Whispers from House ${world.houses[a.target]!.name}: news of ${picked.map((k) => shortName(k.name)).join(', ')}.`;
    }
    case 'watchHouse': {
      const people = alive(world).filter((k) => k.houseId === houseId && k.tier === 'full' && k.id !== c.id);
      const picked = rng.shuffle([...people]).slice(0, 3);
      for (const k of picked) learn(world, houseId, k.id, 3);
      // A secret may surface.
      if (rng.chance(0.2)) {
        const secret = people.flatMap((k) => k.flags.filter((f) => FLAGS_BY_ID[f.id]?.visibility === 'secret' && !f.knownBy?.includes(houseId)).map((f) => ({ k, f })));
        if (secret.length) {
          const { k, f } = rng.pick(secret);
          f.knownBy = [...(f.knownBy ?? []), houseId];
          feed(world, houseId, `${who} uncovers a secret in our own house: ${shortName(k.name)} is ${FLAGS_BY_ID[f.id]!.label.toLowerCase()}.`, [k.id, c.id]);
          return `Secret uncovered: ${shortName(k.name)} — ${FLAGS_BY_ID[f.id]!.label}.`;
        }
      }
      return picked.length ? `Eyes on ${picked.map((k) => shortName(k.name)).join(', ')}.` : null;
    }
    case 'tendHousehold': {
      let tended = 0;
      for (const k of alive(world)) {
        if (k.houseId !== houseId) continue;
        for (const f of k.flags) {
          if (f.until && (f.id === 'wounded' || f.id === 'ill' || f.id === 'grieving')) {
            f.until = addCycles(f.until, -4);
            tended++;
          }
        }
      }
      return tended ? `Tended ${tended} ${tended === 1 ? 'ailment' : 'ailments'} in the household.` : null;
    }
    case 'tendCommons': {
      const s = rng.pick(ownSectors(world, houseId));
      if (s) s.unrest = Math.max(0, s.unrest - 1);
      if (rng.chance(0.3)) st.respect = clamp(st.respect + 1, 0, 100);
      return s ? `Clinics open in ${s.name}. The people are grateful.` : null;
    }
    case 'keepRecords': {
      if (st.honour < 75 || rng.chance(0.25)) st.honour = clamp(st.honour + 1, 0, 100);
      return `The records are kept. Honour ${st.honour}.`;
    }
    case 'teachYoung': {
      const young = alive(world).filter((k) => k.houseId === houseId && k.tier === 'full' && ageOf(k, world.date) < SPECIES[k.species].adulthood + 6);
      if (!young.length) return 'No young ones to teach.';
      const k = rng.pick(young);
      const grew = growStat(rng, k, ['intellect', 'eloquence', 'law', 'insight', 'diplomacy'], 1.4);
      if (grew) {
        feed(world, houseId, `${shortName(k.name)} learns well from ${who}: ${STAT_WORD[grew]} improves.`, [k.id, c.id]);
        return `${shortName(k.name)} improves: ${STAT_WORD[grew]} ${k.stats[grew]}.`;
      }
      return `Lessons with ${shortName(k.name)}.`;
    }
    case 'pits': {
      const win = rng.chance(clamp(0.35 + (taskScore(def, c) - 10) * 0.05, 0.1, 0.9));
      if (win) {
        st.respect = clamp(st.respect + 1, 0, 100);
        if (rng.chance(0.5)) st.dread = clamp(st.dread + 1, 0, 100);
        growStat(rng, c, ['duelling'], 0.4);
      }
      if (rng.chance(win ? 0.04 : 0.12)) {
        c.flags.push({ id: 'wounded', since: world.date, until: addCycles(world.date, CYCLES_PER_PHASE * 2), detail: 'in the pits' });
        feed(world, houseId, `${who} is wounded in the pits.`, [c.id]);
        return `${win ? 'Won, but' : 'Lost, and'} wounded.`;
      }
      return win ? `A victory in the pits. Respect ${st.respect}.` : 'A loss in the pits. No harm done.';
    }
  }
  return null;
}

function driftUnrest(world: World, rng: Rng) {
  for (const p of Object.values(world.planets)) {
    for (const s of p.sectors) if (s.controllerFamilyId) s.unrest = clamp(s.unrest + rng.int(0, 3), 0, 100);
  }
}

/** Relations fade a little toward where personalities put them. */
function driftRelations(world: World) {
  for (const [a, book] of Object.entries(world.relations)) {
    for (const b of Object.keys(book)) {
      const v = book[b]!;
      if (v > 25) book[b] = v - 1;
      else if (v < -25) book[b] = v + 1;
    }
    void a;
  }
}

// ---------------------------------------------------------------- petitions


function bestLeader(world: World, houseId: string, kind: MissionKind, prefer?: Character): Character | undefined {
  if (prefer && !cannotLead(world, houseId, prefer)) return prefer;
  return alive(world)
    .filter((c) => !cannotLead(world, houseId, c))
    .sort((a, b) => skillFor(kind, b) - skillFor(kind, a))[0];
}

function maybePetition(world: World, rng: Rng, houseId: string) {
  const court = world.courts[houseId]!;
  if (court.petitions.length >= 3) return;
  const oath = court.oath;
  if (!rng.chance(oath ? 0.12 : 0.04)) return;

  const seat = (s: CouncilSeat) => seatHolder(world, houseId, s);
  const rivals = Object.keys(world.houses).filter((h) => h !== houseId);
  const busyTargets = new Set([
    ...activeMissions(world, houseId).map((m) => m.targetId ?? m.targetHouseId ?? m.targetPlanetId),
    ...court.petitions.map((p) => p.targetId ?? p.targetHouseId ?? p.targetPlanetId),
  ]);
  const options: Omit<Petition, 'id' | 'date' | 'expires'>[] = [];

  const spy = seat('spymaster');
  const envoy = seat('envoy');
  const gm = seat('grandMaster');

  // Look into the least-known rival councillor.
  if (spy && (!oath || oath.id === 'knowRivals')) {
    const t = rivalCouncil(world, houseId).filter((c) => !busyTargets.has(c.id))
      .sort((a, b) => knowledgeOf(world, houseId, a.id).depth - knowledgeOf(world, houseId, b.id).depth)[0];
    const leader = bestLeader(world, houseId, 'investigate', spy);
    if (t && leader) options.push({ fromId: spy.id, kind: 'investigate', leaderId: leader.id, targetId: t.id, reason: `We know almost nothing of ${shortName(t.name)}, ${t.role} of House ${world.houses[t.houseId]!.name}. Let me find out.` });
  }
  // Send an envoy.
  if (envoy && (!oath || oath.id === 'winFriend' || oath.id === 'raiseName')) {
    const t = oath?.id === 'winFriend' && oath.target ? oath.target
      : rivals.filter((h) => !busyTargets.has(h)).sort((a, b) => relation(world, b, houseId) - relation(world, a, houseId))[0];
    const leader = bestLeader(world, houseId, 'envoy', envoy);
    if (t && !busyTargets.has(t) && leader) options.push({ fromId: envoy.id, kind: 'envoy', leaderId: leader.id, targetHouseId: t, reason: `A visit in person would do more than letters. Let me go to House ${world.houses[t]!.name}.` });
  }
  // Scout a rival world.
  if (gm && (!oath || oath.id === 'steelHost' || oath.id === 'knowRivals')) {
    const planets = Object.values(world.planets).filter((p) => p.houseId !== houseId && !busyTargets.has(p.id));
    const t = planets.length ? rng.pick(planets) : undefined;
    const leader = bestLeader(world, houseId, 'scout');
    if (t && leader) options.push({ fromId: gm.id, kind: 'scout', leaderId: leader.id, targetPlanetId: t.id, reason: `We should see how ${t.name} is held before anyone else does. I would send ${shortName(leader.name)}.` });
  }
  // Order at home: look into the overseer of the most restless sector.
  if (spy && oath?.id === 'orderAtHome') {
    const s = [...ownSectors(world, houseId)].sort((a, b) => b.unrest - a.unrest)[0];
    const overseer = s?.quarters.map((q) => (q.overseerId ? world.characters[q.overseerId] : undefined)).find((c) => c && c.alive && !busyTargets.has(c.id));
    const leader = bestLeader(world, houseId, 'investigate', spy);
    if (s && overseer && leader && leader.id !== overseer.id) options.push({ fromId: spy.id, kind: 'investigate', leaderId: leader.id, targetId: overseer.id, reason: `${s.name} will not settle. I want to know what ${shortName(overseer.name)} is doing there.` });
  }

  if (!options.length) return;
  const pick = rng.pick(options);
  court.petitions.push({
    ...pick,
    id: `p${world.nextId++}`,
    date: world.date,
    expires: addCycles(world.date, CYCLES_PER_PHASE),
  });
}
