// The Grand Master's board: deeds kept ready for the house's knights and aspirants to ride out and do.
//
// A knight with nothing to do grows restless and an aspirant needs proof. The Grand Master keeps a handful of
// tasks on the board, drawn from what is happening in this world: a corsair captain on our lanes, a restless
// sector, a convoy to see through, a rival academy's open challenge, a rumoured relic. Send someone; they are
// away a while; they come back with a name, a wound, or not at all.
import { Rng } from './rng';
import { absoluteCycle, addCycles, CYCLES_PER_PHASE } from './time';
import { logRecord } from './records';
import { econ, record } from './economy';
import { displayName, shortName } from './names';
import { shiftMood } from './mood';
import { kill } from './death';
import { tally } from './careers';
import { addGlory } from './ambitions';
import { addMark, told } from './details';
import { fightScore, isMilitary } from './grounds';
import { isAway } from './court';
import { seatHolder } from './query';
import { ageOf } from './characters';
import { SPECIES } from '../data/species';
import type { Character, World } from './types';

export type QuestKind = 'hunt' | 'escort' | 'guard' | 'trial' | 'relic' | 'beast';
export const QUEST_LABEL: Record<QuestKind, string> = { hunt: 'Hunt', escort: 'Escort', guard: 'Keep the peace', trial: 'Trial of arms', relic: 'Recover', beast: 'Clear' };

export interface Quest {
  id: string;
  kind: QuestKind;
  title: string;
  text: string;
  /** 1 (an aspirant's first) to 5 (a knight's last). */
  hard: number;
  /** Cycles away. */
  cycles: number;
  reward: number;
  /** A sector or lane faction, where it applies. */
  where?: string;
  /** Who went, and when they are back. */
  goneId?: string;
  back?: import('./time').GameDate;
  posted: import('./time').GameDate;
}

export interface QuestState { board: Quest[] }

const HARD = ['', 'an aspirant\'s first', 'a fair test', 'hard', 'very hard', 'a knight\'s last'];
export const hardWord = (n: number) => HARD[n] ?? '';

function drafts(w: World, r: Rng): Omit<Quest, 'id' | 'posted'>[] {
  const P = w.playerHouseId;
  const out: Omit<Quest, 'id' | 'posted'>[] = [];
  const f = Object.values(w.lanes?.factions ?? {})[0];
  const cap = f?.members.find((m) => m.role === 'captain' && !m.fate);
  if (f && cap) out.push({ kind: 'hunt', title: `Run down ${cap.name}`, text: `${cap.name} of ${f.name} has been taking our convoys. Find their ship in the drift and bring back proof.`, hard: 4, cycles: 24, reward: 900, where: f.id });
  const sectors = Object.values(w.planets).filter((p) => p.houseId === P).flatMap((p) => p.sectors).filter((s) => s.controllerFamilyId).sort((a, b) => b.unrest - a.unrest);
  if (sectors[0] && sectors[0].unrest >= 15) out.push({ kind: 'guard', title: `Keep the peace in ${sectors[0].name}`, text: `Walk the streets of ${sectors[0].name} with a few of the guard until the trouble there quiets.`, hard: 2, cycles: 16, reward: 200, where: sectors[0].id });
  out.push({ kind: 'escort', title: r.pick(['See the ore convoy to the Exchange', 'Escort the Steward\'s factors through the lanes', 'Bring the navisium shipment home']), text: 'Ride with the convoy, and make sure it arrives with everything it left with.', hard: 2, cycles: 12, reward: 300 });
  out.push({ kind: 'trial', title: r.pick(['Answer the TheaSzar academy\'s open challenge', 'Stand the Torvann enclave\'s trial of arms', 'Take the duelling court\'s open place']), text: 'A rival academy keeps an open challenge for any house\'s fighters. Win and the house is talked of. Lose and so is the house.', hard: 3, cycles: 10, reward: 0 });
  out.push({ kind: 'relic', title: r.pick(['Follow the rumour of a Caige in a wreck', 'Find the lost blade of the house\'s founder', 'Look into the Echo at the old battlefield']), text: 'A rumour from the docks: something of value, somewhere it should not be. It may be nothing. It may be a Caige no one has held since the Rend.', hard: 3, cycles: 28, reward: 1500 });
  out.push({ kind: 'beast', title: r.pick(['Clear the creatures from the lower tunnels', 'Put down what is killing the herds on the outer farms', 'Clear the drift-warped thing from the mining shaft']), text: 'Something is killing people where they work. Go and end it.', hard: r.int(1, 4), cycles: 8, reward: 250 });
  return out;
}

export function ensureQuests(w: World): QuestState { return (w.quests ??= { board: [] }); }

/** Each Phase the Grand Master keeps the board stocked; those sent come home and tell how it went. */
export function advanceQuests(w: World, rng: Rng, phaseTurned: boolean): void {
  const s = ensureQuests(w);
  const now = absoluteCycle(w.date);
  for (const q of s.board.filter((x) => x.goneId && x.back && absoluteCycle(x.back) <= now)) resolve(w, rng, q);
  s.board = s.board.filter((q) => !(q.goneId && q.back && absoluteCycle(q.back) <= now));
  if (!phaseTurned) return;
  // Old, untaken work goes off the board after two Orbits.
  s.board = s.board.filter((q) => q.goneId || absoluteCycle(q.posted) + CYCLES_PER_PHASE * 10 > now);
  if (!seatHolder(w, w.playerHouseId, 'grandMaster')) return;
  const open = s.board.filter((q) => !q.goneId);
  if (open.length >= 5) return;
  const have = new Set(s.board.map((q) => q.title));
  const fresh = drafts(w, rng).filter((d) => !have.has(d.title));
  for (const d of fresh.sort(() => rng.next() - 0.5).slice(0, Math.min(2, 5 - open.length))) s.board.push({ ...d, id: `q${w.nextId++}`, posted: w.date });
}

/** Who may be sent: knights and aspirants at home, grown, and unhurt. */
export function candidatesFor(w: World): Character[] {
  const P = w.playerHouseId;
  return Object.values(w.characters).filter((c) => c.alive && c.houseId === P && c.tier === 'full' && !c.seat && !isAway(w, c.id)
    && !c.flags.some((f) => f.id === 'wounded') && ageOf(c, w.date) >= SPECIES[c.species].adulthood * 0.8
    && (isMilitary(w, c) || w.ladder?.of[c.id]?.stage === 'aspirant' || w.ladder?.of[c.id]?.stage === 'blooded'))
    .sort((a, b) => fightScore(b) - fightScore(a));
}

export function odds(_w: World, q: Quest, c: Character): number {
  const skill = fightScore(c) + (q.kind === 'hunt' || q.kind === 'relic' ? (c.stats.perception + c.stats.stealth) / 4 : q.kind === 'guard' ? (c.stats.diplomacy + c.stats.composure) / 4 : q.kind === 'escort' ? (c.stats.tactics + c.stats.perception) / 4 : 0);
  return Math.max(0.1, Math.min(0.95, 0.5 + (skill - (6 + q.hard * 3)) / 14));
}

export function cannotSend(w: World, questId: string, personId: string): string | null {
  const q = w.quests?.board.find((x) => x.id === questId);
  if (!q || q.goneId) return 'Already taken';
  const c = w.characters[personId];
  if (!c || !candidatesFor(w).some((x) => x.id === personId)) return 'They cannot go';
  return null;
}

export function sendOnQuest(input: World, questId: string, personId: string): World {
  const w = structuredClone(input);
  const why = cannotSend(w, questId, personId);
  if (why) throw new Error(why);
  const q = w.quests!.board.find((x) => x.id === questId)!;
  const c = w.characters[personId]!;
  q.goneId = c.id;
  q.back = addCycles(w.date, q.cycles);
  c.flags.push({ id: 'quest', since: w.date, detail: q.title });
  shiftMood(c, 6);
  logRecord(w, { kind: 'world', type: 'mission', severity: 1, seat: 'grandMaster', text: `${displayName(c.name)} rides out: ${q.title.charAt(0).toLowerCase() + q.title.slice(1)}.`, who: [{ id: c.id, part: 'sent' }] });
  return w;
}

function resolve(w: World, r: Rng, q: Quest): void {
  const c = q.goneId ? w.characters[q.goneId] : undefined;
  if (!c) return;
  c.flags = c.flags.filter((f) => f.id !== 'quest');
  if (!c.alive) return;
  const P = w.playerHouseId;
  const p = odds(w, q, c);
  const roll = r.next();
  const won = roll < p;
  const great = won && roll < p * 0.3;
  const hurt = !won && r.chance(0.25 + q.hard * 0.07);
  const dead = hurt && r.chance(0.04 + q.hard * 0.03);
  const C = shortName(c.name);
  const effects: string[] = [];
  const lines: string[] = [];
  if (won) {
    tally(w, c.id, 'missions');
    if (great) tally(w, c.id, 'triumphs');
    if (q.kind === 'trial') tally(w, c.id, 'duelsWon');
    if (q.kind === 'guard') { const s = Object.values(w.planets).flatMap((x) => x.sectors).find((x) => x.id === q.where); if (s) { s.unrest = Math.max(0, s.unrest - 12); effects.push(`${s.name}: unrest −12`); } }
    if (q.kind === 'trial') { w.houses[P]!.standing.respect = Math.min(100, w.houses[P]!.standing.respect + 2); effects.push('Respect +2'); }
    if (q.kind === 'hunt') { const f = w.lanes?.factions[q.where ?? '']; const m = f?.members.find((x) => x.role === 'captain' && !x.fate); if (m) { m.fate = 'dead'; effects.push(`${m.name} is dead`); } }
    if (q.reward) { const amt = great ? Math.round(q.reward * 1.5) : q.reward; record(w, P, { resource: 'othes', amount: amt, label: q.title, kind: 'boon' }); effects.push(`+${amt.toLocaleString('en-US')} othes`); }
    addGlory(w, c.id, great ? 2 : 1);
    shiftMood(c, great ? 12 : 6);
    addMark(w, c, { kind: 'feat', text: great ? `${q.title.charAt(0).toLowerCase() + q.title.slice(1)}, and was talked of for it` : q.title.charAt(0).toLowerCase() + q.title.slice(1), place: QUEST_LABEL[q.kind].toLowerCase() === 'trial of arms' ? 'at the academy' : 'abroad' });
    lines.push(great ? r.pick([`${C} came back with more than was asked.`, `They are singing about ${C} in the lower city.`]) : r.pick([`${C} did what was asked, and came home.`, `It took longer than it should, but ${C} got it done.`]));
  } else {
    shiftMood(c, -6);
    lines.push(r.pick([`${C} came back with nothing to show for it.`, `It went wrong from the first day, ${C} says.`, `${C} will not talk about it.`]));
    if (q.kind === 'trial') { w.houses[P]!.standing.respect = Math.max(0, w.houses[P]!.standing.respect - 1); effects.push('Respect −1'); addMark(w, c, { kind: 'shame', text: 'lost the trial of arms', place: 'at the academy' }); }
  }
  if (dead) { kill(w, c, w.date, `killed abroad: ${q.title.toLowerCase()}`); lines.push(`${C} did not come back. The Grand Master brought word.`); effects.push(`${C} is dead`); }
  else if (hurt) { c.flags.push({ id: 'wounded', since: w.date }); addMark(w, c, { kind: 'wound', text: r.pick(['a cut across the ribs', 'a burn down one arm', 'a cracked shoulder']), place: 'abroad' }); effects.push(`${C} is wounded`); }
  logRecord(w, { kind: 'world', type: 'mission', severity: dead ? 3 : won ? 2 : 1, seat: 'grandMaster', text: `${q.title}: ${dead ? `${C} is dead` : won ? (great ? `${C} triumphs` : `${C} succeeds`) : `${C} fails`}.`, who: [{ id: c.id, part: 'went' }], effects, account: told('the Grand Master', lines) });
  void econ;
}
