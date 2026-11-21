// The ladder: how a child of the house becomes a knight. Pupil until the trial age; then the house
// trials, once a year, which can be failed (and the failing becomes part of who they are); Aspirant,
// proving themselves by deeds until their teacher thinks them ready; Blooded, in a ceremony before
// whoever is near; and knighted only when the Highroy decides. Alongside it, the knighthood turns over:
// survivors get better, wounds can last, the old retire, and the disloyal drift to other houses.
import { Rng } from './rng';
import { displayName, shortName } from './names';
import { ageOf } from './characters';
import { SPECIES } from '../data/species';
import { econ, fameOf, record } from './economy';
import { logRecord } from './records';
import { isAway } from './court';
import { shiftMood } from './mood';
import { seatHolder } from './query';
import { shiftRelation } from './relations';
import { bondOf, opinion, shiftOpinion } from './relationships';
import { addGlory } from './ambitions';
import { award, titlesOf, totals, type Season } from './careers';
import { competence } from './reports';
import { rivalsFrom } from './grounds';
import { hasWork } from './treasury';
import { SUBJECTS, takeIntoHouse, teacherSkill, type Subject } from './training';
import { materialize } from './discovery';
import { absoluteCycle, addCycles, CYCLES_PER_ORBIT, dateParts, type GameDate } from './time';
import type { Character, StatId, World } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export type Stage = 'pupil' | 'aspirant' | 'blooded';
export const STAGE_LABEL: Record<Stage, string> = { pupil: 'Pupil', aspirant: 'Aspirant', blooded: 'Blooded' };

export interface Rung {
  stage: Stage;
  since: GameDate;
  /** Times they have failed the trials. */
  failed: number;
  /** Their record when they became an aspirant, so deeds since can be counted. */
  base?: Season;
  /** When their teacher last put them forward (or was told to wait). */
  asked?: GameDate;
  history: { date: GameDate; what: string }[];
}

/** A teacher puts an aspirant forward to be blooded. */
export interface Blooding {
  id: string;
  aspirantId: string;
  teacherId?: string;
  readiness: 'early' | 'ready' | 'overdue';
  expires: GameDate;
  /** The Champion's find in the rings: one of ours never blooded, or a local fighter worth taking in. */
  scout?: boolean;
  local?: { name: string; skill: number; where: string; planetId: string; sectorId: string; record: string };
}

export interface LadderState {
  of: Record<string, Rung>;
  proposals: Blooding[];
  /** Per person, an Orbit-by-Orbit line of how they have grown: [cycle, fight, best subject]. */
  snaps: Record<string, [number, number, number][]>;
  /** The year the trials were last held. */
  trialsYear?: number;
  /** Who the Spymaster has already warned about, and toward which house. */
  warned?: Record<string, GameDate>;
  warnedTo?: Record<string, string>;
}

export function ensureLadder(world: World): void {
  world.ladder ??= { of: {}, proposals: [], snaps: {} };
  world.ladder.proposals ??= [];
  world.ladder.snaps ??= {};
  world.ladder.warned ??= {};
}

/** Fourteen as a human counts it; later for the slower-growing. */
export function trialAge(c: Character): number {
  return SPECIES[c.species].adulthood * (14 / 18);
}

export function stageOf(world: World, id: string): Stage | 'knight' | undefined {
  const c = world.characters[id];
  if (c?.flags.some((f) => f.id === 'knighted') || c?.role === 'Knight') return 'knight';
  return world.ladder?.of[id]?.stage;
}

const fightOf = (c: Character) => (c.stats.duelling * 2 + c.stats.agility + c.stats.reflexes + c.stats.valor) / 5;
function bestSubject(c: Character): { subject: Subject; value: number } {
  let subject: Subject = 'arms';
  let value = -1;
  for (const [k, d] of Object.entries(SUBJECTS) as [Subject, { stats: StatId[] }][]) {
    const v = d.stats.reduce((n, s) => n + c.stats[s], 0) / d.stats.length;
    if (v > value) { value = v; subject = k; }
  }
  return { subject, value };
}

/** Who answers for an aspirant: their teacher, the academy's head, or the Grand Master. */
export function mentorOf(world: World, id: string): Character | undefined {
  const e = Object.values(world.training?.enrolments ?? {}).find((x) => x.studentId === id);
  const t = e?.teacherId ? world.characters[e.teacherId] : undefined;
  if (t?.alive) return t;
  if (e?.program === 'academy' && e.moduleId) { const m = world.holdings?.modules[e.moduleId]; const h = m?.overseerId ? world.characters[m.overseerId] : undefined; if (h?.alive) return h; }
  const P = world.characters[id]?.houseId ?? world.playerHouseId;
  return seatHolder(world, P, 'grandMaster') ?? seatHolder(world, P, 'champion');
}

/** How much a teacher needs to see before they put someone forward. Hopeful teachers ask early; stern ones late. */
export function sternness(t: Character | undefined): { bar: number; kind: 'hopeful' | 'measured' | 'stern' } {
  if (!t) return { bar: 10, kind: 'measured' };
  if (t.stats.discipline >= 14 || t.traits.some((x) => x.id === 'proud' || x.id === 'ironBlooded')) return { bar: 15, kind: 'stern' };
  if (t.hidden.temperament >= 13) return { bar: 6, kind: 'hopeful' };
  return { bar: 10, kind: 'measured' };
}

/** What an aspirant has done since they passed the trials, as proof. */
export function proofOf(world: World, id: string): number {
  const r = world.ladder?.of[id];
  if (!r || r.stage !== 'aspirant') return 0;
  const now = totals(world, id);
  const b = r.base ?? {};
  const d = (k: keyof Season) => (now[k] ?? 0) - (b[k] ?? 0);
  const orbits = (absoluteCycle(world.date) - absoluteCycle(r.since)) / CYCLES_PER_ORBIT;
  return d('boutsWon') * 2 + d('duelsWon') * 3 + d('triumphs') * 3 + d('missions') + d('crucible') * 2 + d('crucibleWon') * 3
    + d('rescues') * 3 + d('raidsRepelled') * 2 + d('titles') * 3 + orbits * 0.25;
}

function note(r: Rung, world: World, what: string) {
  r.history.push({ date: world.date, what });
}

// ---------------------------------------------------------------- the trials

function holdTrials(world: World, rng: Rng) {
  const P = world.playerHouseId;
  const sitting = Object.entries(world.ladder.of).filter(([id, r]) => {
    const c = world.characters[id];
    return r.stage === 'pupil' && c?.alive && c.houseId === P && ageOf(c, world.date) >= trialAge(c) && !isAway(world, id);
  });
  if (!sitting.length) return;
  const passed: string[] = [];
  const failed: string[] = [];
  const lines: string[] = [];
  for (const [id, r] of sitting) {
    const c = world.characters[id]!;
    const best = bestSubject(c);
    const t = mentorOf(world, id);
    const enrolled = Object.values(world.training?.enrolments ?? {}).some((e) => e.studentId === id);
    const p = clamp(0.4 + (best.value - 8) * 0.06 + (enrolled ? 0.12 : 0) + teacherSkill(world, t?.id, best.subject) / 100 + r.failed * 0.08 + (hasWork(world, 'archive') ? 0.1 : 0), 0.1, 0.95);
    if (rng.chance(p)) {
      r.stage = 'aspirant';
      r.since = world.date;
      r.base = totals(world, id);
      note(r, world, r.failed ? `passed the trials at the ${['', 'second', 'third', 'fourth', 'fifth'][r.failed] ?? 'last'} attempt` : 'passed the trials');
      passed.push(id);
      shiftMood(c, 8);
      if (c.role === 'Pupil' || c.role === 'Youngling' || c.role === 'Retainer') c.role = 'Aspirant';
      lines.push(`${shortName(c.name)} passed${r.failed ? `, at the ${r.failed + 1}${r.failed === 1 ? 'nd' : r.failed === 2 ? 'rd' : 'th'} attempt` : ''} (${SUBJECTS[best.subject].label.toLowerCase()}).`);
    } else {
      r.failed++;
      failed.push(id);
      note(r, world, `failed the trials (${r.failed === 1 ? 'first' : r.failed === 2 ? 'second' : `${r.failed}th`} time)`);
      // How they take it is who they are.
      if (c.stats.determination >= 13 || c.hidden.ambition >= 14) {
        c.flags.push({ id: 'stung', since: world.date, until: addCycles(world.date, CYCLES_PER_ORBIT * 2), detail: 'failed the trials' });
        if (world.ambitions?.will) world.ambitions.will[id] = Math.min(100, (world.ambitions.will[id] ?? 0) + 30);
        lines.push(`${shortName(c.name)} failed, and means to come back stronger.`);
      } else {
        shiftMood(c, -10);
        lines.push(`${shortName(c.name)} failed${r.failed > 1 ? ' again' : ''}, and took it hard.`);
      }
    }
  }
  logRecord(world, {
    kind: 'world', type: 'world', severity: 2, seat: 'elder',
    text: `The house trials: ${passed.length} of ${sitting.length} passed.${failed.length ? ` ${failed.map((id) => shortName(world.characters[id]!.name)).join(', ')} will sit them again next year.` : ''}`,
    detail: lines.join('\n'),
    who: [...passed.map((id) => ({ id, part: 'passed' })), ...failed.map((id) => ({ id, part: 'failed' }))],
  });
}

// ---------------------------------------------------------------- blooding

export function answerBlooding(input: World, id: string, choice: 'gift' | 'word' | 'seat' | 'wait'): World {
  const w = structuredClone(input);
  ensureLadder(w);
  const b = w.ladder.proposals.find((x) => x.id === id);
  if (!b) throw new Error('That has passed');
  w.ladder.proposals = w.ladder.proposals.filter((x) => x.id !== id);
  if (b.local && choice !== 'wait') {
    // Take the fighter in from the rings first.
    if (econ(w, w.playerHouseId).stock.othes < LOCAL_COST + (choice === 'gift' ? 200 : 0)) throw new Error('Not enough othes');
    record(w, w.playerHouseId, { resource: 'othes', amount: -LOCAL_COST, label: `Buying out ${b.local.name}'s contract`, kind: 'court' });
    const rng = new Rng(w.rng);
    const nc = materialize(w, rng, b.local.planetId, b.local.sectorId);
    w.rng = rng.state;
    nc.name = { given: b.local.name } as typeof nc.name;
    nc.birth = { year: w.date.year - Math.round(SPECIES[nc.species].adulthood * 1.15), cycle: 0 } as GameDate;
    for (const k of ['duelling', 'agility', 'reflexes', 'valor', 'endurance', 'strength'] as StatId[]) nc.stats[k] = clamp(Math.round(b.local.skill + (k === 'duelling' ? 1 : -1)), 4, 20);
    takeIntoHouse(w, nc, 'Blooded');
    b.aspirantId = nc.id;
  }
  const c = w.characters[b.aspirantId];
  if (c?.alive && !w.ladder.of[c.id]) w.ladder.of[c.id] = { stage: 'aspirant', since: w.date, failed: 0, base: totals(w, c.id), history: [{ date: w.date, what: b.local ? `taken in from ${b.local.where}` : 'put forward by the Champion' }] };
  const r = c ? w.ladder.of[c.id] : undefined;
  if (!c?.alive || !r) return w;
  const t = b.teacherId ? w.characters[b.teacherId] : undefined;
  r.asked = w.date;
  if (choice === 'wait') {
    if (b.readiness === 'overdue') { shiftMood(c, -6); if (t) shiftOpinion(w, b.aspirantId, w.houses[w.playerHouseId]!.rulerId!, -5, 'made to wait for their blooding'); }
    logRecord(w, { kind: 'world', type: 'world', severity: 1, seat: 'grandMaster', text: `The Highroy tells ${t ? shortName(t.name) : 'the teacher'} that ${shortName(c.name)} must wait a while longer to be blooded.`, who: [{ id: c.id, part: 'made to wait' }] });
    return w;
  }
  if (choice === 'gift') {
    if (econ(w, w.playerHouseId).stock.othes < 200) throw new Error('Not enough othes');
    record(w, w.playerHouseId, { resource: 'othes', amount: -200, label: `A gift at ${shortName(c.name)}'s blooding`, kind: 'court' });
  }
  bloodIn(w, c, r, t, choice);
  return w;
}

function bloodIn(w: World, c: Character, r: Rung, t: Character | undefined, choice: 'gift' | 'word' | 'seat' | 'auto') {
  const P = c.houseId;
  r.stage = 'blooded';
  r.since = w.date;
  if (!c.flags.some((f) => f.id === 'blooded')) c.flags.push({ id: 'blooded', since: w.date });
  if (c.role === 'Aspirant' || c.role === 'Pupil' || c.role === 'Retainer') c.role = 'Blooded';
  // Who came: whoever was near and thought well enough of them. Who stayed away is noted.
  const here = Object.values(w.characters).filter((x) => x.alive && x.houseId === P && x.id !== c.id && x.tier === 'full' && !isAway(w, x.id) && x.location.planetId === c.location.planetId);
  const came = here.filter((x) => opinion(w, x.id, c.id) >= -10 && (!t || opinion(w, x.id, t.id) >= -25) && ageOf(x, w.date) >= SPECIES[x.species].adulthood);
  const stayed = here.filter((x) => !came.includes(x) && (bondOf(w, x.id, c.id) === 'rival' || bondOf(w, x.id, c.id) === 'feud' || opinion(w, x.id, c.id) < -25));
  const sector = w.planets[c.location.planetId]?.sectors.find((s) => s.id === c.location.sectorId)?.name ?? w.planets[c.location.planetId]?.name ?? 'home';
  for (const x of came) { shiftMood(x, 2); shiftOpinion(w, c.id, x.id, 3, 'came to their blooding'); }
  if (t) { shiftOpinion(w, c.id, t.id, 10, 'stood for them at their blooding'); shiftOpinion(w, t.id, c.id, 8, 'blooded under their eye'); }
  const lord = w.houses[P]?.rulerId;
  if (choice === 'gift' && lord) shiftOpinion(w, c.id, lord, 12, 'a gift at their blooding');
  if (choice === 'word') { shiftMood(c, 8); if (w.ambitions?.will) w.ambitions.will[c.id] = Math.min(100, (w.ambitions.will[c.id] ?? 0) + 40); }
  if (choice === 'seat') { addGlory(w, c.id, 1); shiftMood(c, 5); }
  shiftMood(c, 8);
  award(w, c.id, `Blooded at ${sector}`);
  // The teacher's other charges notice who went first.
  // Only a teacher's own pupils, and at most one of them, take it personally.
  const own = t ? Object.entries(w.ladder.of).filter(([oid, or]) => oid !== c.id && or.stage === 'aspirant' && w.characters[oid]?.alive && Object.values(w.training?.enrolments ?? {}).some((e) => e.studentId === oid && e.teacherId === t.id)) : [];
  const jealous = own.find(([oid]) => (oid.charCodeAt(oid.length - 1) + c.id.charCodeAt(c.id.length - 1)) % 2 === 0);
  if (t && jealous) {
    shiftOpinion(w, jealous[0], t.id, -8, `put ${shortName(c.name)} forward first`);
    rivalsFrom(w, jealous[0], c.id, `${shortName(t.name)} put them forward first`);
  }
  note(r, w, `blooded at ${sector} before ${came.length}`);
  const deed = titlesOf(w, c.id).filter((x) => !x.title.startsWith('Blooded')).slice(-1)[0]?.title;
  const words = t ? (deed ? `I have watched ${shortName(c.name)} since they were a pupil. ${deed}. They are ready.` : `I have watched ${shortName(c.name)} since they were a pupil. They are ready, and they know it.`) : undefined;
  if (P !== w.playerHouseId) return;
  logRecord(w, {
    kind: 'world', type: 'world', severity: 2, seat: 'grandMaster',
    text: `${displayName(c.name)} is blooded at ${sector}, before ${came.length} of the house${t ? `; ${shortName(t.name)} stood for them` : ''}.${choice === 'gift' ? ' The Highroy sent a gift.' : choice === 'word' ? ' The Highroy\'s words were read out.' : choice === 'seat' ? ' They sat at the high table that night.' : ''}${stayed.length ? ` ${stayed.map((x) => shortName(x.name)).join(' and ')} stayed away.` : ''}`,
    quote: t && words ? { from: t.id, text: words } : undefined,
    detail: came.length ? `There: ${came.slice(0, 12).map((x) => shortName(x.name)).join(', ')}${came.length > 12 ? '…' : ''}` : undefined,
    who: [{ id: c.id, part: 'blooded' }, ...(t ? [{ id: t.id, part: 'stood for them' }] : []), ...stayed.map((x) => ({ id: x.id, part: 'stayed away' }))],
  });
}

// ---------------------------------------------------------------- the Champion's eye

export const LOCAL_COST = 400;

/** The Champion watches the rings: one of ours who has proved themselves without ever being blooded, or a local worth buying. */
function scoutRings(world: World, rng: Rng) {
  const P = world.playerHouseId;
  const champ = seatHolder(world, P, 'champion');
  if (!champ || isAway(world, champ.id) || world.ladder.proposals.some((b) => b.scout) || !rng.chance(0.4)) return;
  const wins = (id: string) => { const t = totals(world, id); return (t.boutsWon ?? 0) + (t.duelsWon ?? 0) + (t.cDuelsWon ?? 0); };
  const ours = Object.values(world.characters).filter((c) => c.alive && c.houseId === P && c.tier === 'full' && c.seat !== 'highroy'
    && !c.flags.some((f) => f.id === 'blooded' || f.id === 'knighted' || f.id === 'retired') && c.role !== 'Knight' && world.ladder.of[c.id]?.stage !== 'pupil'
    && ageOf(c, world.date) >= SPECIES[c.species].adulthood && wins(c.id) >= 3).sort((a, b) => wins(b.id) - wins(a.id));
  const exp = addCycles(world.date, CYCLES_PER_ORBIT);
  if (ours[0]) {
    const n = wins(ours[0].id);
    world.ladder.proposals.push({ id: `bl${world.nextId++}`, aspirantId: ours[0].id, teacherId: champ.id, readiness: n >= 8 ? 'overdue' : 'ready', expires: exp, scout: true });
    logRecord(world, { kind: 'world', type: 'world', severity: 2, seat: 'champion', text: `The Champion has been watching ${displayName(ours[0].name)} in the rings.`, quote: { from: champ.id, text: `${n} wins and never blooded. Either we blood ${shortName(ours[0].name)} or someone else will take them.` }, who: [{ id: ours[0].id, part: 'watched' }] });
    return;
  }
  // A local fighter, seen on a card we heard about.
  const since = absoluteCycle(world.date) - CYCLES_PER_ORBIT * 2;
  for (const e of [...(world.grounds?.circuit ?? [])].reverse()) {
    if (!e.done || !e.heard || absoluteCycle(e.held) < since || !e.bouts) continue;
    const won: Record<string, number> = {};
    for (const b of e.bouts) if (b.winner.startsWith('~')) won[b.winner] = (won[b.winner] ?? 0) + 1;
    const best = Object.entries(won).sort((a, b) => b[1] - a[1])[0];
    if (!best || best[1] < 2) continue;
    const name = best[0].slice(1);
    if (Object.values(world.characters).some((c) => c.alive && c.houseId === P && c.name.given === name && !c.name.family)) continue;
    const skill = 11 + rng.next() * 5;
    world.ladder.proposals.push({ id: `bl${world.nextId++}`, aspirantId: '', teacherId: champ.id, readiness: 'ready', expires: exp, scout: true, local: { name, skill, where: e.name, planetId: e.planetId, sectorId: e.sectorId, record: `${best[1]} wins on one card` } });
    logRecord(world, { kind: 'world', type: 'world', severity: 2, seat: 'champion', text: `The Champion wants a pit fighter called ${name}, seen at ${e.name}.`, quote: { from: champ.id, text: `${name} won ${best[1]} on the card and walked out. No house, no name. Buy them out (${LOCAL_COST} othes), blood them, and we have a fighter.` } });
    return;
  }
}

// ---------------------------------------------------------------- the knighthood turns over

/** A fight survived teaches something; a win more. Never past what they were born able to be. */
export function seasoned(world: World, rng: Rng, id: string, won: boolean): void {
  const c = world.characters[id];
  if (!c?.alive) return;
  const home = c.houseId === world.playerHouseId && hasWork(world, 'arena') ? 1.3 : 1;
  if (!rng.chance((won ? 0.3 : 0.12) * home)) return;
  const cap = 6 + c.hidden.potential * 0.7;
  const k = rng.pick(['duelling', 'agility', 'reflexes', 'valor', 'endurance'] as StatId[]);
  if (c.stats[k] < cap) c.stats[k] = Math.min(20, c.stats[k] + 1);
}

/** Some wounds never fully heal. */
export function lastingWound(world: World, rng: Rng, id: string, where: string): string | null {
  const c = world.characters[id];
  if (!c?.alive || !rng.chance(0.12)) return null;
  const roll = rng.next();
  let what: string;
  if (roll < 0.15) {
    // Crippled: done with arms.
    if (!c.flags.some((f) => f.id === 'retired')) c.flags.push({ id: 'retired', since: world.date, detail: `crippled ${where}` });
    if (c.role === 'Knight' || c.role === 'Blooded' || c.role === 'Aspirant') c.role = 'Retired from arms';
    c.stats.agility = Math.max(1, c.stats.agility - 4);
    what = 'crippled; they will not fight again';
  } else if (roll < 0.4 && !c.traits.some((t) => t.id === 'lostEye')) {
    c.traits.push({ id: 'lostEye' }); c.stats.perception = Math.max(1, c.stats.perception - 3); c.stats.marksmanship = Math.max(1, c.stats.marksmanship - 2);
    what = 'lost an eye';
  } else if (roll < 0.65 && !c.traits.some((t) => t.id === 'limp')) {
    c.traits.push({ id: 'limp' }); c.stats.agility = Math.max(1, c.stats.agility - 3);
    what = 'will limp for the rest of their life';
  } else if (roll < 0.85 && !c.traits.some((t) => t.id === 'ruinedHand')) {
    c.traits.push({ id: 'ruinedHand' }); c.stats.duelling = Math.max(1, c.stats.duelling - 2); c.stats.strength = Math.max(1, c.stats.strength - 1);
    what = 'has a sword hand that will never be what it was';
  } else {
    if (!c.traits.some((t) => t.id === 'battleScarred')) c.traits.push({ id: 'battleScarred' });
    what = 'carries a scar they will be asked about for the rest of their life';
  }
  if (c.houseId === world.playerHouseId) logRecord(world, { kind: 'world', type: 'condition', severity: 2, seat: 'physician', text: `${displayName(c.name)}, wounded ${where}, ${what}.`, who: [{ id: c.id, part: 'wounded' }] });
  return what;
}

/** A knight's eye wanders: friends, a muse, or a house that seems the better one. Loyalty decides. */
function pullOf(world: World, c: Character): { house: string; pull: number; why: string } | undefined {
  const byHouse: Record<string, { pull: number; why: string[] }> = {};
  const mine = world.houses[c.houseId]!;
  for (const [oid, t] of Object.entries(world.ties?.[c.id] ?? {})) {
    const o = world.characters[oid];
    if (!o?.alive || o.houseId === c.houseId || !world.houses[o.houseId]) continue;
    const e = (byHouse[o.houseId] ??= { pull: 0, why: [] });
    if (t.bond === 'lover' || t.bond === 'spouse') { e.pull += 2; e.why.push(`${shortName(o.name)}, who has their heart`); }
    else if (t.bond === 'friend' || t.bond === 'sworn' || opinion(world, c.id, oid) >= 50) { e.pull += 1; e.why.push(`a friend in ${shortName(o.name)}`); }
  }
  for (const h of Object.values(world.houses)) {
    if (h.id === c.houseId) continue;
    if (h.standing.respect - mine.standing.respect >= 15) { const e = (byHouse[h.id] ??= { pull: 0, why: [] }); e.pull += 1; e.why.push(`House ${h.name}'s name`); }
  }
  const best = Object.entries(byHouse).sort((a, b) => b[1].pull - a[1].pull)[0];
  return best && best[1].pull > 0 ? { house: best[0], pull: best[1].pull, why: best[1].why.slice(0, 2).join(' and ') } : undefined;
}

function churn(world: World, rng: Rng, orbitTurned: boolean, yearTurned: boolean) {
  if (!orbitTurned) return;
  const P = world.playerHouseId;
  for (const c of Object.values(world.characters)) {
    if (!c.alive || c.tier !== 'full' || !world.houses[c.houseId] || c.seat === 'highroy') continue;
    const knight = c.flags.some((f) => f.id === 'knighted') || c.role === 'Knight';
    if (!knight || c.flags.some((f) => f.id === 'retired')) continue;
    // The old step back.
    if (yearTurned && ageOf(c, world.date) >= SPECIES[c.species].adulthood * 2.7 && rng.chance(0.25)) {
      c.flags.push({ id: 'retired', since: world.date, detail: 'of age' });
      c.role = 'Retired knight';
      if (c.houseId === P) logRecord(world, { kind: 'world', type: 'world', severity: 2, seat: 'grandMaster', text: `${displayName(c.name)} hangs up their blade after a long service.`, quote: { from: c.id, text: c.hidden.temperament >= 12 ? 'I have had more years in harness than I was owed. Give my place to someone hungry.' : 'It is time. Do not make a fuss.' }, who: [{ id: c.id, part: 'retired' }] });
      continue;
    }
    // Loyalty wears when they are unhappy, or ill paid.
    const ill = (world.economy?.payScale ?? 'fair') === 'meagre' && c.houseId === P;
    // The famous know their worth; paid meanly, they sour.
    if (ill && fameOf(world, c) >= 6) { shiftMood(c, -3); const a = world.ambitions?.of[c.id]; if (a) a.frustration = Math.min(100, a.frustration + 5); }
    if ((world.economy?.payScale ?? 'fair') === 'generous' && c.houseId === P) shiftMood(c, 1);
    if (((c.mood ?? 50) < 35 || ill) && rng.chance(0.25)) c.hidden.loyalty = Math.max(1, c.hidden.loyalty - 1);
    if ((world.economy?.payScale ?? 'fair') === 'generous' && c.houseId === P && rng.chance(0.15)) c.hidden.loyalty = Math.min(20, c.hidden.loyalty + 1);
    const pull = pullOf(world, c);
    if (!pull) continue;
    // The Spymaster may see it coming.
    if (c.houseId === P && c.hidden.loyalty <= 10 && competence(world, 'spymaster') >= 8) {
      const last = world.ladder.warned![c.id];
      const sameHouse = (world.ladder.warnedTo ??= {})[c.id] === pull.house;
      if (!last || !sameHouse || absoluteCycle(world.date) - absoluteCycle(last) > CYCLES_PER_ORBIT * 8) {
        world.ladder.warned![c.id] = world.date;
        world.ladder.warnedTo![c.id] = pull.house;
        logRecord(world, { kind: 'intrigue', type: 'intrigue', severity: 2, seat: 'spymaster', text: `${displayName(c.name)}'s eye has been wandering toward House ${world.houses[pull.house]!.name}: ${pull.why}.`, who: [{ id: c.id, part: 'drifting' }], houseIds: [pull.house] });
      }
    }
    if (c.hidden.loyalty <= 7 && pull.pull >= 2 && rng.chance(0.12)) {
      const from = c.houseId;
      const to = world.houses[pull.house]!;
      c.houseId = to.id;
      const fam = Object.values(world.families).find((f) => f.houseId === to.id && !f.ruling);
      if (fam) c.familyId = fam.id;
      const home = world.planets[to.capitalPlanetId]!;
      c.location = { planetId: home.id, sectorId: home.sectors[0]!.id };
      delete c.seat;
      shiftRelation(world, from, to.id, -4);
      if (from === P || to.id === P) {
        logRecord(world, {
          kind: 'intrigue', type: 'intrigue', severity: 3, seat: 'spymaster',
          text: from === P ? `${displayName(c.name)} has sworn to House ${to.name}. ${pull.why[0]!.toUpperCase() + pull.why.slice(1)} drew them away.` : `${displayName(c.name)}, a knight of House ${world.houses[from]!.name}, has come over to us.`,
          who: [{ id: c.id, part: from === P ? 'defected' : 'came over' }], houseIds: [from === P ? to.id : from], effects: from === P ? ['A knight lost'] : ['A knight gained'],
        });
      }
    }
  }
}

// ---------------------------------------------------------------- each turn

export function advanceLadder(world: World, rng: Rng, orbitTurned: boolean): void {
  ensureLadder(world);
  const L = world.ladder;
  const P = world.playerHouseId;
  const d = dateParts(world.date);
  const now = absoluteCycle(world.date);
  L.proposals = L.proposals.filter((b) => absoluteCycle(b.expires) > now && (b.local || world.characters[b.aspirantId]?.alive));
  if (!orbitTurned) return;
  // Everyone young of the house is on the ladder.
  for (const c of Object.values(world.characters)) {
    if (!c.alive || c.houseId !== P || c.tier !== 'full' || L.of[c.id]) continue;
    if (c.flags.some((f) => f.id === 'knighted') || c.seat) continue;
    const a = ageOf(c, world.date);
    if (a < trialAge(c)) L.of[c.id] = { stage: 'pupil', since: world.date, failed: 0, history: [] };
    else if (a < SPECIES[c.species].adulthood * 1.3) {
      // Grown already and handy with a blade: blooded before our time.
      const blooded = a >= SPECIES[c.species].adulthood && fightOf(c) >= 10;
      L.of[c.id] = { stage: blooded ? 'blooded' : 'aspirant', since: world.date, failed: 0, base: totals(world, c.id), history: [{ date: world.date, what: blooded ? 'already blooded' : 'counted among the aspirants' }] };
      if (blooded && !c.flags.some((f) => f.id === 'blooded')) c.flags.push({ id: 'blooded', since: world.date });
    }
  }
  // How they are growing.
  for (const id of Object.keys(L.of)) {
    const c = world.characters[id];
    if (!c?.alive) { delete L.of[id]; continue; }
    const line = (L.snaps[id] ??= []);
    line.push([now, Math.round(fightOf(c) * 10) / 10, Math.round(bestSubject(c).value * 10) / 10]);
    if (line.length > 60) line.splice(0, line.length - 60);
  }
  for (const c of Object.values(world.characters)) if (c.alive && c.houseId === P && (c.flags.some((f) => f.id === 'knighted') || world.careers?.pinned.includes(c.id)) && !L.of[c.id]) {
    const line = (L.snaps[c.id] ??= []);
    line.push([now, Math.round(fightOf(c) * 10) / 10, Math.round(bestSubject(c).value * 10) / 10]);
    if (line.length > 60) line.splice(0, line.length - 60);
  }
  // The trials, once a year.
  if (d.orbit === 2 && L.trialsYear !== d.year) { L.trialsYear = d.year; holdTrials(world, rng); }
  // Teachers put aspirants forward.
  const putForward = new Set<string>();
  for (const [id, r] of Object.entries(L.of)) {
    if (r.stage !== 'aspirant' || L.proposals.some((b) => b.aspirantId === id)) continue;
    const c = world.characters[id]!;
    if (c.houseId !== P || isAway(world, id)) continue;
    if (r.asked && now - absoluteCycle(r.asked) < CYCLES_PER_ORBIT * 2) continue;
    const t = mentorOf(world, id);
    const { bar } = sternness(t);
    const proof = proofOf(world, id);
    if (proof < bar) continue;
    // A teacher puts forward one at a time, and not on time served alone.
    if (t && putForward.has(t.id)) continue;
    const r0 = world.ladder.of[id]!;
    if (proof - ((absoluteCycle(world.date) - absoluteCycle(r0.since)) / CYCLES_PER_ORBIT) * 0.25 < 2) continue;
    if (t) putForward.add(t.id);
    const readiness = proof < 10 ? 'early' : proof >= 18 ? 'overdue' : 'ready';
    L.proposals.push({ id: `bl${world.nextId++}`, aspirantId: id, teacherId: t?.id, readiness, expires: addCycles(world.date, CYCLES_PER_ORBIT) });
    if (world.ports) world.ports.alerts += 1;
  }
  scoutRings(world, rng);
  // Other houses blood their own quietly.
  churn(world, rng, orbitTurned, d.orbit === 1);
}

export function readinessText(b: Blooding): string {
  return b.readiness === 'early' ? 'perhaps a little early' : b.readiness === 'overdue' ? 'and has been ready for some time' : 'ready';
}
