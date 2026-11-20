// Training and development: a tutor for one, drill for the knights, an academy for many, and wards between houses.
import { Rng } from './rng';
import { displayName, shortName } from './names';
import { ageOf } from './characters';
import { SPECIES } from '../data/species';
import { econ, record } from './economy';
import { relation, shiftRelation } from './relations';
import { logRecord } from './records';
import { isAway } from './court';
import { seatHolder } from './query';
import { setBond, shiftOpinion, opinion, tiesOf } from './relationships';
import { shiftMood } from './mood';
import { modulesOf } from './holdings';
import { addLead, materialize } from './discovery';
import { learn } from './knowledge';
import { absoluteCycle, addCycles, CYCLES_PER_ORBIT, CYCLES_PER_PHASE, type GameDate } from './time';
import type { Character, StatId, World } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const H = (w: World, id: string) => `House ${w.houses[id]?.name ?? id}`;

export type Program = 'tutor' | 'drill' | 'academy' | 'ward';
export type Subject = 'arms' | 'command' | 'statecraft' | 'intrigue' | 'resonance' | 'learning';

export const SUBJECTS: Record<Subject, { label: string; stats: StatId[]; note: string }> = {
  arms: { label: 'Arms', stats: ['duelling', 'marksmanship', 'agility', 'endurance', 'reflexes'], note: 'Blade, gun, footwork and wind.' },
  command: { label: 'Command', stats: ['tactics', 'leadership', 'logistics', 'fleetCommand', 'discipline'], note: 'Leading people and ships.' },
  statecraft: { label: 'Statecraft', stats: ['diplomacy', 'negotiation', 'eloquence', 'law'], note: 'Courts, treaties and the Numarade.' },
  intrigue: { label: 'Shadows', stats: ['intrigue', 'deception', 'stealth', 'insight'], note: 'Secrets, lies and quiet feet.' },
  resonance: { label: 'Resonance', stats: ['caigeSync', 'resonanceControl', 'willpower', 'composure'], note: 'Caiges and the mind that holds them.' },
  learning: { label: 'Learning', stats: ['intellect', 'stewardship', 'perception', 'law'], note: 'Books, ledgers and a sharp eye.' },
};
const SUBJECT_TRAIT: Partial<Record<Subject, string>> = { arms: 'duelistsCreed', command: 'tactician', statecraft: 'courtier', learning: 'archivist', intrigue: 'streetWise' };
export const PROGRAM_LABEL: Record<Program, string> = { tutor: 'Tutor', drill: 'Drill', academy: 'Academy', ward: 'Ward' };
export const TUTOR_COST = 300;
export const ACADEMY_COST = 500;
const RATE: Record<Program, number> = { tutor: 0.45, drill: 0.22, academy: 0.5, ward: 0.35 };

export interface Enrolment {
  id: string;
  studentId: string;
  program: Program;
  subject: Subject;
  /** Who teaches: the tutor, or the Grand Master for drill. */
  teacherId?: string;
  moduleId?: string;
  /** The house whose court they train at. */
  houseId: string;
  start: GameDate;
  /** No end for drill: it runs until stopped. */
  end?: GameDate;
  progress: Partial<Record<StatId, number>>;
  gained: Partial<Record<StatId, number>>;
}

export type WardKind = 'honour' | 'equals' | 'humbling';
export interface WardStay {
  id: string;
  wardId: string;
  from: string;
  host: string;
  kind: WardKind;
  start: GameDate;
  end: GameDate;
  guardianId?: string;
}
export interface WardOffer { id: string; wardId: string; from: string; to: string; expires: GameDate; kind: 'offer' | 'request' }

export interface TrainingState {
  enrolments: Record<string, Enrolment>;
  wards: Record<string, WardStay>;
  offers: WardOffer[];
  /** Drill for our knights: the subject, or none. */
  drill?: Subject | null;
}

export function ensureTraining(world: World): void {
  if (world.training?.enrolments) { world.training.offers ??= []; return; }
  world.training = { enrolments: {}, wards: {}, offers: [] };
  // Wards already in the world at the start (Dorran at Serath).
  for (const c of Object.values(world.characters)) {
    const f = c.flags.find((x) => x.id === 'ward' && /fostered at House (\w+)/.test(x.detail ?? ''));
    if (!f) continue;
    const host = Object.values(world.houses).find((h) => (f.detail ?? '').includes(h.name));
    if (!host) continue;
    const id = `ws${world.nextId++}`;
    const g = guardianFor(world, host.id);
    world.training.wards[id] = { id, wardId: c.id, from: c.houseId, host: host.id, kind: kindFor(world, c.houseId, host.id), start: world.date, end: addCycles(world.date, CYCLES_PER_ORBIT * 4), guardianId: g?.id };
    enrol(world, c.id, 'ward', 'arms', host.id, g?.id);
  }
}

// ---------------------------------------------------------------- queries

function guardianFor(world: World, host: string): Character | undefined {
  return Object.values(world.characters).filter((k) => k.alive && k.houseId === host && k.tier === 'full' && (k.seat === 'champion' || k.seat === 'grandMaster' || k.role === 'Knight' || k.seat === 'elder') && chargesOf(world, k.id).length < PERSONAL_LIMIT)
    .sort((a, b) => b.stats.leadership - a.stats.leadership)[0];
}

export function rankOf(world: World, houseId: string): number {
  const h = world.houses[houseId];
  if (!h) return 0;
  return (h.tier === 'great' ? 2 : 1) + h.standing.respect / 100;
}

/** Sending a ward up is an honour; down, a humbling; to an equal, a bond. */
export function kindFor(world: World, from: string, host: string): WardKind {
  const d = rankOf(world, host) - rankOf(world, from);
  return d > 0.25 ? 'honour' : d < -0.25 ? 'humbling' : 'equals';
}

export const WARD_NOTE: Record<WardKind, string> = {
  honour: 'Sent up to a greater house: an honour for the family and a chance to learn from better teachers.',
  equals: 'Between equals: a pledge of friendship between the houses.',
  humbling: 'Sent down to a lesser house: they are flattered beyond words, but it lowers us in the eyes of others.',
};

const adultAge = (c: Character) => SPECIES[c.species].adulthood;

/** How fast someone this age learns. */
export function ageFactor(world: World, c: Character): number {
  const a = ageOf(c, world.date);
  const ad = adultAge(c);
  if (a < ad * 1.3) return 1.5;
  if (a > c.lifespan * 0.65) return 0.4;
  return 1;
}

/** Children and younglings: not yet adults. Only they take a personal tutor or go as wards. */
export function isYoungling(world: World, c: Character): boolean {
  return ageOf(c, world.date) < adultAge(c);
}

/** Young adults may still go to an academy, up to about one and a half times adulthood. */
export function academyAge(world: World, c: Character): boolean {
  const a = ageOf(c, world.date);
  return a >= adultAge(c) * 0.5 && a < adultAge(c) * 1.6;
}

/** A teacher can take at most this many personal charges: pupils and wards together. */
export const PERSONAL_LIMIT = 2;
export const ACADEMY_PLACES = 10;

export function chargesOf(world: World, teacherId: string): Enrolment[] {
  return Object.values(world.training?.enrolments ?? {}).filter((e) => e.teacherId === teacherId && (e.program === 'tutor' || e.program === 'ward'));
}

/** Youths old enough to be sent away as wards, and still children or younglings. */
export function youths(world: World, houseId: string): Character[] {
  return Object.values(world.characters).filter((c) => {
    if (!c.alive || c.houseId !== houseId || c.tier !== 'full' || c.seat) return false;
    const a = ageOf(c, world.date);
    const ad = adultAge(c);
    return a >= ad * 0.5 && a < ad && !c.flags.some((f) => f.id === 'ward' || f.id === 'captive');
  });
}

export function enrolmentOf(world: World, id: string): Enrolment | undefined {
  return Object.values(world.training?.enrolments ?? {}).find((e) => e.studentId === id);
}

export function studentsAt(world: World, moduleId: string): Enrolment[] {
  return Object.values(world.training?.enrolments ?? {}).filter((e) => e.moduleId === moduleId);
}

/** The best teacher a house has for a subject. */
export function teacherSkill(world: World, id: string | undefined, subject: Subject): number {
  const t = id ? world.characters[id] : undefined;
  if (!t?.alive) return 6;
  const s = SUBJECTS[subject].stats;
  return s.reduce((n, k) => n + t.stats[k], 0) / s.length;
}

/** Expected gain in a subject per Phase, summed over its stats. */
export function paceOf(world: World, e: Pick<Enrolment, 'studentId' | 'program' | 'subject' | 'teacherId' | 'moduleId' | 'houseId'>): number {
  const c = world.characters[e.studentId];
  if (!c) return 0;
  const potential = 0.6 + c.hidden.potential / 25;
  let teach = teacherSkill(world, e.teacherId, e.subject) / 12;
  if (e.program === 'academy' && e.moduleId) {
    const m = world.holdings.modules[e.moduleId];
    // Every student learns from the head's own skills; the building and its name help a little.
    teach = (teacherSkill(world, m?.overseerId ?? undefined, e.subject) / 12) * (m ? 0.85 + m.level * 0.1 + (m.reputation ?? 0) / 400 : 0.85);
  }
  if (e.program === 'ward') {
    // A great house teaches better.
    teach *= 0.8 + rankOf(world, e.houseId) * 0.2;
  }
  return RATE[e.program] * ageFactor(world, c) * potential * teach;
}

// ---------------------------------------------------------------- actions (in place, then pure wrappers)

function enrol(world: World, studentId: string, program: Program, subject: Subject, houseId: string, teacherId?: string, moduleId?: string): Enrolment {
  for (const old of Object.values(world.training.enrolments)) if (old.studentId === studentId) delete world.training.enrolments[old.id];
  const id = `en${world.nextId++}`;
  const orbits = program === 'tutor' ? 1 : program === 'academy' ? 2 : program === 'ward' ? 4 : 0;
  const e: Enrolment = { id, studentId, program, subject, teacherId, moduleId, houseId, start: world.date, end: orbits ? addCycles(world.date, orbits * CYCLES_PER_ORBIT) : undefined, progress: {}, gained: {} };
  world.training.enrolments[id] = e;
  return e;
}

function act(input: World, fn: (w: World, rng: Rng) => void): World {
  const w = structuredClone(input);
  ensureTraining(w);
  const rng = new Rng(w.rng);
  fn(w, rng);
  w.rng = rng.state;
  return w;
}

export function cannotTutor(world: World, studentId: string, teacherId: string): string | null {
  const s = world.characters[studentId];
  const t = world.characters[teacherId];
  if (!s?.alive || !t?.alive) return 'Not here';
  if (s.id === t.id) return 'Cannot teach themselves';
  if (t.houseId !== world.playerHouseId) return 'Not one of ours';
  if (isAway(world, t.id)) return 'The tutor is away';
  if (!isYoungling(world, s)) return 'Only children and younglings take a personal tutor';
  if (chargesOf(world, t.id).length >= PERSONAL_LIMIT) return `${t.name.given} already has ${PERSONAL_LIMIT} pupils and wards`;
  if (econ(world, world.playerHouseId).stock.othes < TUTOR_COST) return 'Not enough othes';
  return null;
}

export function startTutoring(input: World, studentId: string, teacherId: string, subject: Subject): World {
  return act(input, (w) => {
    const why = cannotTutor(w, studentId, teacherId);
    if (why) throw new Error(why);
    record(w, w.playerHouseId, { resource: 'othes', amount: -TUTOR_COST, label: `Tutoring for ${shortName(w.characters[studentId]!.name)}`, kind: 'court' });
    enrol(w, studentId, 'tutor', subject, w.playerHouseId, teacherId);
  });
}

export function cannotEnrol(world: World, studentId: string, moduleId: string): string | null {
  const m = world.holdings.modules[moduleId];
  const s = world.characters[studentId];
  if (!m || m.kind !== 'academy' || m.level < 1) return 'No academy';
  if (!s?.alive) return 'Not here';
  if (!academyAge(world, s)) return 'Only youths and young adults are taken';
  if (studentsAt(world, moduleId).length >= ACADEMY_PLACES) return 'The academy is full';
  if (econ(world, world.playerHouseId).stock.othes < ACADEMY_COST) return 'Not enough othes';
  return null;
}

export function enrolAcademy(input: World, studentId: string, moduleId: string, subject: Subject): World {
  return act(input, (w) => {
    const why = cannotEnrol(w, studentId, moduleId);
    if (why) throw new Error(why);
    record(w, w.playerHouseId, { resource: 'othes', amount: -ACADEMY_COST, label: `Academy place for ${shortName(w.characters[studentId]!.name)}`, kind: 'court' });
    enrol(w, studentId, 'academy', subject, w.playerHouseId, undefined, moduleId);
  });
}

export function stopTraining(input: World, enrolmentId: string): World {
  return act(input, (w) => { delete w.training.enrolments[enrolmentId]; });
}

/** Drill all the knights at court under the Grand Master. */
export function setDrill(input: World, subject: Subject | null): World {
  return act(input, (w) => {
    w.training.drill = subject;
    const P = w.playerHouseId;
    for (const e of Object.values(w.training.enrolments)) if (e.program === 'drill' && e.houseId === P) delete w.training.enrolments[e.id];
    if (!subject) return;
    const gm = seatHolder(w, P, 'grandMaster');
    for (const k of Object.values(w.characters)) {
      if (!k.alive || k.houseId !== P || k.role !== 'Knight' || enrolmentOf(w, k.id)) continue;
      enrol(w, k.id, 'drill', subject, P, gm?.id);
    }
  });
}

/** Send one of our young to be raised at another house. */
export function cannotSendWard(world: World, wardId: string, host: string): string | null {
  const c = world.characters[wardId];
  if (!c || !youths(world, world.playerHouseId).includes(c)) return 'Not a youth of our house';
  if (host === world.playerHouseId || !world.houses[host]) return 'No such house';
  if (relation(world, host, world.playerHouseId) < -10) return `${H(world, host)} would not take them`;
  if (kindFor(world, world.playerHouseId, host) === 'honour' && relation(world, host, world.playerHouseId) < 15 && rankOf(world, host) - rankOf(world, world.playerHouseId) > 0.8) return `${H(world, host)} does not think us worthy (regard 15+ needed)`;
  return null;
}

function placeWard(w: World, c: Character, from: string, host: string, rng: Rng) {
  const kind = kindFor(w, from, host);
  const id = `ws${w.nextId++}`;
  const guardian = guardianFor(w, host);
  w.training.wards[id] = { id, wardId: c.id, from, host, kind, start: w.date, end: addCycles(w.date, CYCLES_PER_ORBIT * 4), guardianId: guardian?.id };
  c.flags = c.flags.filter((f) => f.id !== 'ward');
  c.flags.push({ id: 'ward', since: w.date, detail: `fostered at ${H(w, host)}` });
  const home = w.planets[w.houses[host]!.capitalPlanetId]!;
  c.location = { planetId: home.id, sectorId: home.sectors[0]!.id };
  const subject: Subject = rng.pick(['arms', 'statecraft', 'command', 'learning']);
  enrol(w, c.id, 'ward', subject, host, guardian?.id);
  if (guardian) setBond(w, guardian.id, c.id, 'guardian', 'ward', 'took them in');
  learn(w, host, c.id, 40);
  const st = w.houses[from]!.standing;
  if (kind === 'honour') { st.respect = clamp(st.respect + 2, 0, 100); shiftRelation(w, host, from, 8); }
  if (kind === 'equals') { shiftRelation(w, host, from, 10); shiftRelation(w, from, host, 10); }
  if (kind === 'humbling') { st.respect = clamp(st.respect - 3, 0, 100); shiftRelation(w, host, from, 20); }
  const P = w.playerHouseId;
  if (from === P || host === P) {
    logRecord(w, {
      kind: 'world', type: 'politics', severity: 2,
      text: from === P ? `${displayName(c.name)} leaves to be raised at the court of ${H(w, host)}.` : `${displayName(c.name)} of ${H(w, from)} arrives to be raised at our court.`,
      detail: WARD_NOTE[kind], who: [{ id: c.id, part: 'ward' }, ...(guardian ? [{ id: guardian.id, part: 'guardian' }] : [])], houseIds: [from, host],
      effects: kind === 'honour' ? [`${H(w, from)} respect +2`, `${H(w, host)} regard +8`] : kind === 'equals' ? ['Regard +10 both ways'] : [`${H(w, from)} respect −3`, `${H(w, host)} regard +20`],
    });
  }
}

export function sendWard(input: World, wardId: string, host: string): World {
  return act(input, (w, rng) => {
    const why = cannotSendWard(w, wardId, host);
    if (why) throw new Error(why);
    placeWard(w, w.characters[wardId]!, w.playerHouseId, host, rng);
  });
}

/** Ask another house to send one of its young to us. */
export function askForWard(input: World, from: string): World {
  return act(input, (w, rng) => {
    const P = w.playerHouseId;
    const kind = kindFor(w, from, P);
    const pick = youths(w, from)[0];
    const reg = relation(w, from, P);
    const yes = pick && (kind === 'honour' ? reg > -10 : kind === 'equals' ? reg > 10 : reg > 40 && rng.chance(0.3));
    if (!yes || !pick) {
      shiftRelation(w, from, P, kind === 'humbling' ? -3 : 0);
      logRecord(w, { kind: 'world', type: 'politics', severity: 1, text: `${H(w, from)} declines to send a ward to our court.`, detail: !pick ? 'They have no one of the right age.' : kind === 'humbling' ? 'They think themselves above us.' : 'They do not trust us enough.', houseIds: [from] });
      return;
    }
    placeWard(w, pick, from, P, rng);
  });
}

export function answerWardOffer(input: World, offerId: string, yes: boolean): World {
  return act(input, (w, rng) => {
    const o = w.training.offers.find((x) => x.id === offerId);
    if (!o) return;
    w.training.offers = w.training.offers.filter((x) => x.id !== offerId);
    const c = w.characters[o.wardId];
    if (!yes || !c?.alive) { shiftRelation(w, o.from, o.to, -6); return; }
    placeWard(w, c, o.from, o.to, rng);
  });
}

export function setGuardian(input: World, stayId: string, guardianId: string): World {
  return act(input, (w) => {
    const s = w.training.wards[stayId];
    if (!s || s.host !== w.playerHouseId) return;
    if (s.guardianId !== guardianId && chargesOf(w, guardianId).length >= PERSONAL_LIMIT) throw new Error(`They already have ${PERSONAL_LIMIT} pupils and wards`);
    s.guardianId = guardianId;
    const e = enrolmentOf(w, s.wardId);
    if (e) e.teacherId = guardianId;
    setBond(w, guardianId, s.wardId, 'guardian', 'ward', 'took them in');
  });
}

export function recallWard(input: World, stayId: string): World {
  return act(input, (w) => {
    const s = w.training.wards[stayId];
    if (!s || s.from !== w.playerHouseId) return;
    endStay(w, s, true);
  });
}

function endStay(w: World, s: WardStay, early: boolean) {
  delete w.training.wards[s.id];
  const c = w.characters[s.wardId];
  const e = c ? enrolmentOf(w, c.id) : undefined;
  if (e) delete w.training.enrolments[e.id];
  if (!c?.alive) return;
  c.flags = c.flags.filter((f) => f.id !== 'ward');
  const home = w.planets[w.houses[c.houseId]?.capitalPlanetId ?? ''];
  if (home) c.location = { planetId: home.id, sectorId: home.sectors[0]!.id };
  // What they think of their hosts colours their house's view.
  // Judged by the people they actually came to know there.
  const known = tiesOf(w, c.id).filter((t) => w.characters[t.other]?.houseId === s.host && t.bond !== 'kin');
  const feel = known.length ? known.reduce((n, t) => n + t.out * (t.bond ? 1.5 : 1), 0) / known.length : 0;
  const friend = known.filter((t) => t.out > 30).sort((a, b) => b.out - a.out)[0];
  const foe = known.filter((t) => t.out < -30).sort((a, b) => a.out - b.out)[0];
  shiftRelation(w, s.from, s.host, Math.round(feel / 4) - (early ? 8 : 0));
  const P = w.playerHouseId;
  if (s.from === P || s.host === P) {
    const g = Object.entries(e?.gained ?? {}).filter(([, v]) => v).map(([k, v]) => `${k} +${v}`);
    logRecord(w, {
      kind: 'world', type: 'politics', severity: 1,
      text: s.from === P ? `${displayName(c.name)} comes home from ${H(w, s.host)}${early ? ', called back early' : ''}.` : `${displayName(c.name)} goes home to ${H(w, s.from)}${early ? ', recalled early' : ''}.`,
      detail: `${feel > 15 ? 'They speak warmly of their hosts.' : feel < -15 ? 'They are glad to be gone.' : 'They have little to say of their hosts.'}${friend ? ` They will miss ${displayName(w.characters[friend.other]!.name)}.` : ''}${foe ? ` They will not forget ${displayName(w.characters[foe.other]!.name)}.` : ''}`,
      effects: [...g, `${H(w, s.from)} regard ${feel / 4 - (early ? 8 : 0) >= 0 ? '+' : ''}${Math.round(feel / 4) - (early ? 8 : 0)} toward ${H(w, s.host)}`],
      who: [{ id: c.id, part: 'ward' }], houseIds: [s.from, s.host],
    });
  }
}

// ---------------------------------------------------------------- the passage of time

function teach(world: World, rng: Rng, e: Enrolment) {
  const c = world.characters[e.studentId];
  if (!c?.alive) { delete world.training.enrolments[e.id]; return; }
  // A student away from where they train learns nothing this Phase (wards travel with their stay).
  if (e.program !== 'ward' && isAway(world, c.id)) return;
  const pace = paceOf(world, e);
  const stats = SUBJECTS[e.subject].stats;
  // Spread over two stats a Phase, favouring the weaker.
  for (let i = 0; i < 2; i++) {
    const k = rng.weighted(stats.map((s) => [s, 21 - c.stats[s]] as [StatId, number]));
    e.progress[k] = (e.progress[k] ?? 0) + pace / 2 * (0.6 + rng.next() * 0.8);
    while ((e.progress[k] ?? 0) >= 1 && c.stats[k] < 20) {
      e.progress[k]! -= 1;
      c.stats[k] += 1;
      e.gained[k] = (e.gained[k] ?? 0) + 1;
    }
  }
  if (e.teacherId && world.characters[e.teacherId]?.alive) shiftOpinion(world, c.id, e.teacherId, rng.gauss() * 2 + 2, 'taught them');
  if (e.program === 'drill') shiftMood(c, -1);
}

function graduate(world: World, rng: Rng, e: Enrolment) {
  delete world.training.enrolments[e.id];
  const c = world.characters[e.studentId];
  if (!c?.alive) return;
  const P = world.playerHouseId;
  const total = Object.values(e.gained).reduce((n, v) => n + (v ?? 0), 0);
  const gains = Object.entries(e.gained).filter(([, v]) => v).map(([k, v]) => `${k} +${v}`);
  if (e.program === 'tutor' && e.teacherId) {
    const t = world.characters[e.teacherId];
    if (t?.alive && opinion(world, c.id, t.id) > 15) setBond(world, t.id, c.id, 'mentor', 'pupil', 'taught them');
  }
  if (e.program === 'academy' && e.moduleId) {
    const m = world.holdings.modules[e.moduleId];
    if (m) m.reputation = clamp((m.reputation ?? 0) + 4 + total * 2, 0, 100);
    const trait = SUBJECT_TRAIT[e.subject];
    if (total >= 4 && trait && !c.traits.some((t) => t.id === trait)) { c.traits.push({ id: trait }); gains.push(`learned: ${trait}`); }
  }
  if (c.houseId === P && e.program !== 'ward') {
    logRecord(world, {
      kind: 'world', type: 'world', severity: total >= 3 ? 1 : 0,
      text: `${displayName(c.name)} has finished ${e.program === 'tutor' ? 'their tutoring' : 'at the academy'} in ${SUBJECTS[e.subject].label.toLowerCase()}.`,
      effects: gains.length ? gains : ['Little to show for it'],
      who: [{ id: c.id, part: 'student' }, ...(e.teacherId ? [{ id: e.teacherId, part: 'tutor' }] : [])],
    });
  }
  void rng;
}

/** An academy with a name draws students from elsewhere: some ask to join. */
function academyDraw(world: World, rng: Rng) {
  const P = world.playerHouseId;
  for (const m of modulesOf(world, P, 'academy')) {
    const rep = m.reputation ?? 0;
    if (!rng.chance(rep / 250)) continue;
    const planet = world.planets[world.houses[P]!.capitalPlanetId]!;
    const c = materialize(world, rng, planet.id, m.sectorId ?? planet.sectors[0]!.id);
    addLead(world, {
      houseId: P, kind: 'recruit', targetId: c.id, cost: 150, planetId: planet.id, sectorId: m.sectorId ?? planet.sectors[0]!.id,
      title: `${displayName(c.name)}, drawn by the academy`, text: `${shortName(c.name)} has heard of our academy and asks to join the house. A ${c.role.toLowerCase()}.`,
    });
  }
}

/** Lesser houses offer their young to greater ones; some of those offers come to us. */
function aiWards(world: World, rng: Rng) {
  const P = world.playerHouseId;
  const busy = new Set(Object.values(world.training.wards).flatMap((s) => [s.from]));
  for (const h of Object.values(world.houses)) {
    if (h.id === P || busy.has(h.id) || !rng.chance(0.08)) continue;
    const ward = youths(world, h.id)[0];
    if (!ward) continue;
    const hosts = Object.values(world.houses).filter((o) => o.id !== h.id && kindFor(world, h.id, o.id) !== 'humbling' && relation(world, h.id, o.id) > 0);
    if (!hosts.length) continue;
    const host = hosts.sort((a, b) => rankOf(world, b.id) + relation(world, h.id, b.id) / 100 - (rankOf(world, a.id) + relation(world, h.id, a.id) / 100))[0]!;
    if (host.id === P) {
      if (world.training.offers.some((o) => o.from === h.id)) continue;
      world.training.offers.push({ id: `wo${world.nextId++}`, wardId: ward.id, from: h.id, to: P, expires: addCycles(world.date, CYCLES_PER_PHASE * 3), kind: 'offer' });
      logRecord(world, { kind: 'world', type: 'politics', severity: 1, text: `${H(world, h.id)} offers to send ${displayName(ward.name)} to be raised at our court.`, detail: WARD_NOTE[kindFor(world, h.id, P)], houseIds: [h.id], who: [{ id: ward.id, part: 'offered as ward' }] });
      if (world.ports) world.ports.alerts += 1;
    } else if (rng.chance(0.5)) {
      placeWard(world, ward, h.id, host.id, rng);
      logRecord(world, { kind: 'world', type: 'politics', severity: 0, text: `${displayName(ward.name)} of ${H(world, h.id)} goes to be raised at ${H(world, host.id)}.`, houseIds: [h.id, host.id], source: 'court talk' });
    }
  }
}

export function advanceTraining(world: World, rng: Rng, phaseTurned: boolean, orbitTurned: boolean): void {
  ensureTraining(world);
  const now = absoluteCycle(world.date);
  world.training.offers = world.training.offers.filter((o) => absoluteCycle(o.expires) > now && world.characters[o.wardId]?.alive);
  for (const s of Object.values(world.training.wards)) {
    if (!world.characters[s.wardId]?.alive) { delete world.training.wards[s.id]; continue; }
    if (absoluteCycle(s.end) <= now) endStay(world, s, false);
  }
  if (!phaseTurned) return;
  // Keep the drill roster up to date.
  const P = world.playerHouseId;
  if (world.training.drill) {
    const gm = seatHolder(world, P, 'grandMaster');
    for (const k of Object.values(world.characters)) if (k.alive && k.houseId === P && k.role === 'Knight' && !enrolmentOf(world, k.id)) enrol(world, k.id, 'drill', world.training.drill, P, gm?.id);
  }
  for (const e of Object.values(world.training.enrolments)) {
    teach(world, rng, e);
    if (e.end && absoluteCycle(e.end) <= now && e.program !== 'ward') graduate(world, rng, e);
  }
  // Wards' hosts: leverage. A house with a ward at our court does not turn on us lightly.
  for (const s of Object.values(world.training.wards)) {
    if (relation(world, s.from, s.host) < -10) world.relations[s.from]![s.host] = -10;
  }
  if (orbitTurned) { academyDraw(world, rng); aiWards(world, rng); }
}

/** Wards hosted by a house count as part of its court for meetings and friendships. */
export function wardsAt(world: World, houseId: string): Character[] {
  return Object.values(world.training?.wards ?? {}).filter((s) => s.host === houseId).map((s) => world.characters[s.wardId]).filter((c): c is Character => !!c?.alive);
}
