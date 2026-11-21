// What the council thinks of someone: ask any of them whether a fighter or an aspirant is ready to be
// blooded, and each answers in their own way: what they know, how they feel about the person, who they are.
import { seatHolder } from './query';
import { opinion } from './relationships';
import { shortName } from './names';
import { proofOf } from './ladder';
import { fightScore } from './grounds';
import { totals } from './careers';
import type { Character, CouncilSeat, World } from './types';

export type Verdict = 'for' | 'against' | 'unsure';
export interface View { seat: CouncilSeat; id: string; verdict: Verdict; text: string }

const SEATS: CouncilSeat[] = ['grandMaster', 'champion', 'spymaster', 'envoy', 'steward', 'physician', 'elder', 'masterOfRites'];

function hash(s: string): number { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }

/** Each councillor's word on whether this person is ready to be blooded. */
export function councilViews(world: World, id: string): View[] {
  const c = world.characters[id];
  if (!c) return [];
  const P = world.playerHouseId;
  const fight = fightScore(c);
  const t = totals(world, id);
  const wins = (t.boutsWon ?? 0) + (t.duelsWon ?? 0) + (t.cDuelsWon ?? 0);
  const proof = world.ladder?.of[id]?.stage === 'aspirant' ? proofOf(world, id) : wins * 2;
  const n = shortName(c.name);
  const out: View[] = [];
  for (const seat of SEATS) {
    const m = seatHolder(world, P, seat);
    if (!m || m.id === id) continue;
    const o = opinion(world, m.id, id);
    const stern = m.stats.discipline >= 13;
    const warm = m.hidden.temperament >= 13;
    // Those who know arms judge by the blade; the rest by the person.
    const eye = seat === 'champion' || seat === 'grandMaster' ? 1 : 0.4;
    const score = (fight - 10) * 0.45 * eye + (proof - 8) * 0.12 * eye + o / 25 + (stern ? -0.8 : warm ? 0.8 : 0);
    const verdict: Verdict = score > 0.8 ? 'for' : score < -0.8 ? 'against' : 'unsure';
    const pick = (xs: string[]) => xs[hash(m.id + id) % xs.length]!;
    let text: string;
    if (seat === 'champion' || seat === 'grandMaster') {
      text = verdict === 'for' ? pick([`I have seen ${n} fight. Blood them.`, `${n} is ready. Holding them back now only sours them.`, `${wins ? `${wins} wins` : 'Their drills'} say enough. Yes.`])
        : verdict === 'against' ? pick([`Not yet. ${n}'s guard drops when they tire.`, `Give ${n} another season in the rings.`, `They would be blooded and then buried. Wait.`])
        : pick([`Close. One more real fight and I will know.`, `${n} has the hands; I am not sure of the head.`, `Ask me after the next tourney.`]);
    } else if (seat === 'spymaster') {
      text = verdict === 'against' ? pick([`I would know more about ${n}'s friends first.`, `There is talk about ${n} I have not run down yet.`]) : verdict === 'for' ? pick([`Nothing in my files against them.`, `Loyal as far as I can see. Do it.`]) : pick([`I have no view on the blade. On the person: no alarms.`]);
    } else if (seat === 'steward') {
      text = verdict === 'against' ? pick([`Another stipend we can ill afford.`, `Blooded means paid. Is the house ready to pay for ${n}?`]) : pick([`The allowance is small. If the knights want them, I will find it.`, `It costs little. Your call, my lord.`]);
    } else if (seat === 'physician') {
      text = verdict === 'against' ? pick([`${n} is not fully healed in themselves. I would wait.`, `I patch up the ones blooded too soon. Wait.`]) : pick([`Sound in body. That is all I can tell you.`, `Fit, and they keep themselves so.`]);
    } else if (seat === 'elder') {
      text = verdict === 'for' ? pick([`${n} was a good pupil. It will be a good day for the house.`, `I remember them at the trials. Yes.`]) : verdict === 'against' ? pick([`The young are always in a hurry. Let them wait.`]) : pick([`The house has done this a thousand years. One more season changes nothing.`]);
    } else {
      text = verdict === 'for' ? pick([`I like ${n}. The court does too.`, `It would be well received.`]) : verdict === 'against' ? pick([`Not everyone at court would be glad of it.`, `${n} has made enemies who would stay away.`]) : pick([`I have no strong view.`, `The court will take it either way.`]);
    }
    out.push({ seat, id: m.id, verdict, text });
  }
  return out;
}

export function tally(views: View[]): { for: number; against: number; unsure: number } {
  return { for: views.filter((v) => v.verdict === 'for').length, against: views.filter((v) => v.verdict === 'against').length, unsure: views.filter((v) => v.verdict === 'unsure').length };
}

export type { Character };
