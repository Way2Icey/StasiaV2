// Veterans: a knight who hangs up the blade does not vanish. Old knights become elders, envoys, Grand
// Masters, academy heads, garrison officers and tutors, and the Grand Master says where each would serve
// best. A veteran teaches arms better than anyone who learned it from books.
import { appointToSeat } from './ambitions';
import { setModuleOverseer } from './holdings';
import { cannotTutor, chargesOf, startTutoring } from './training';
import { seatHolder } from './query';
import { isAway } from './court';
import { ageOf } from './characters';
import { SPECIES } from '../data/species';
import { shiftMood } from './mood';
import type { Character, CouncilSeat, World } from './types';

export const isVeteran = (c: Character) => c.alive && c.flags.some((f) => f.id === 'retired') && (c.role === 'Retired knight' || c.flags.some((f) => f.id === 'knighted'));
export const hasPost = (c: Character) => !!c.seat || c.flags.some((f) => f.id === 'veteranPost' || f.id === 'rested');

export interface Post { key: string; label: string; why: string; run: (w: World) => World }

const seatScore: Partial<Record<CouncilSeat, (c: Character) => number>> = {
  elder: (c) => c.stats.intellect + c.stats.law + c.stats.leadership,
  envoy: (c) => c.stats.diplomacy * 2 + c.stats.eloquence,
  grandMaster: (c) => c.stats.leadership + c.stats.tactics + c.stats.duelling,
};
const SEAT_NAME: Partial<Record<CouncilSeat, string>> = { elder: 'Elder', envoy: 'Speaker', grandMaster: 'Grand Master' };

function mark(w: World, id: string, detail: string) {
  const c = w.characters[id];
  if (!c) return w;
  c.flags = c.flags.filter((f) => f.id !== 'veteranPost' && f.id !== 'rested');
  c.flags.push({ id: 'veteranPost', since: w.date, detail });
  shiftMood(c, 6);
  return w;
}

/** Where a veteran could serve, best first, with the reason the Grand Master would give. */
export function postsFor(world: World, c: Character): Post[] {
  const P = world.playerHouseId;
  const out: (Post & { score: number })[] = [];
  for (const seat of ['grandMaster', 'elder', 'envoy'] as CouncilSeat[]) {
    const score = seatScore[seat]!(c);
    const holder = seatHolder(world, P, seat);
    const theirs = holder ? seatScore[seat]!(holder) : 0;
    if (holder && score <= theirs + 2) continue;
    out.push({ key: seat, label: `Name them ${SEAT_NAME[seat]}`, why: holder ? `Better suited than ${holder.name.given} (${score} to ${theirs})` : 'The seat is empty', score: score - theirs + (holder ? 0 : 10), run: (w) => mark(appointToSeat(w, seat, c.id), c.id, SEAT_NAME[seat]!) });
  }
  const arms = (c.stats.duelling + c.stats.valor + c.stats.tactics) / 3;
  for (const m of Object.values(world.holdings?.modules ?? {})) {
    if (m.houseId !== P || (m.kind !== 'academy' && m.kind !== 'base')) continue;
    const head = m.overseerId ? world.characters[m.overseerId] : undefined;
    const theirs = head ? (head.stats.duelling + head.stats.valor + head.stats.tactics) / 3 : 0;
    if (head?.alive && arms <= theirs + 1) continue;
    out.push({ key: m.id, label: m.kind === 'academy' ? 'Head the academy' : 'Command the garrison', why: head?.alive ? `They know arms better than ${head.name.given}` : 'No one runs it', score: arms - theirs + (head ? 0 : 6), run: (w) => mark(setModuleOverseer(w, m.id, c.id), c.id, m.kind === 'academy' ? 'Academy head' : 'Garrison commander') });
  }
  if (chargesOf(world, c.id).length < 2) {
    const pupil = Object.values(world.characters)
      .filter((s) => s.alive && s.houseId === P && !cannotTutor(world, s.id, c.id) && !Object.values(world.training?.enrolments ?? {}).some((e) => e.studentId === s.id))
      .sort((a, b) => b.hidden.potential - a.hidden.potential)[0];
    if (pupil) out.push({ key: `tutor:${pupil.id}`, label: `Teach ${pupil.name.given} arms`, why: `${pupil.name.given} is the most promising young one without a teacher`, score: 4, run: (w) => mark(startTutoring(w, pupil.id, c.id, 'arms'), c.id, `Teaching ${pupil.name.given}`) });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 3);
}

export function letRest(input: World, id: string): World {
  const w = structuredClone(input);
  const c = w.characters[id];
  if (c) { c.flags = c.flags.filter((f) => f.id !== 'rested'); c.flags.push({ id: 'rested', since: w.date }); }
  return w;
}

/** Our veterans with nothing to do yet, for the desk. */
export function idleVeterans(world: World): Character[] {
  return Object.values(world.characters).filter((c) => c.houseId === world.playerHouseId && isVeteran(c) && !hasPost(c) && !isAway(world, c.id) && ageOf(c, world.date) < SPECIES[c.species].adulthood * 4);
}

/** A veteran knight teaches the arms better than anyone. */
export const veteranTeachBonus = (c: Character | undefined) => (c && c.flags.some((f) => f.id === 'retired') ? 2 : 0);
