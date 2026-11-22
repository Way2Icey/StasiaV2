// Council reports: everything the Highroy learns comes through a councillor, from their own people.
// The Grand Master passes on the knights' letters, the Spymaster his agents', the Speaker the envoys',
// and so on; the heralds cry what the whole Reaches hears. Each letter carries the original words where
// there are any, the councillor's own note on it, and what the person concerned has done lately.
// A sharp councillor tells you more and tells it straight; an empty seat leaves you deaf in that quarter.
import { seatHolder } from './query';
import { opinion } from './relationships';
import { shortName } from './names';
import { classify } from './records';
import { absoluteCycle } from './time';
import type { CouncilSeat, FeedEntry, World } from './types';

export type Reporter = Exclude<CouncilSeat, 'highroy'> | 'heralds';

export const REPORTER_LABEL: Record<Reporter, string> = {
  grandMaster: 'Grand Master', champion: 'Champion', spymaster: 'Spymaster', envoy: 'Speaker', steward: 'Steward',
  physician: 'Physician', elder: 'Elder', masterOfRites: 'Master of Rites', heralds: 'Heralds',
};
/** Whose people each seat hears from. */
export const REPORTER_REACH: Record<Reporter, string> = {
  grandMaster: 'knights, garrisons, trials and bloodings', champion: 'the circuit, the pits and the fighters', spymaster: 'agents, rumour and what others hide',
  envoy: 'embassies, envoys and other courts', steward: 'the ledger, upkeep and stipends', physician: 'wounds, illness and the dead',
  elder: 'pupils, the academy and the archive', masterOfRites: 'Caiges, resonance and omens', heralds: 'what the whole Reaches hears',
};
export const REPORTERS: Reporter[] = ['grandMaster', 'champion', 'spymaster', 'envoy', 'steward', 'physician', 'elder', 'masterOfRites', 'heralds'];

const has = (t: string, ...w: string[]) => w.some((x) => t.includes(x));

/** Which seat a record comes through. */
export function reporterOf(world: World, e: FeedEntry): Reporter {
  if (e.seat) return e.seat;
  const t = e.text.toLowerCase();
  const P = world.playerHouseId;
  const ours = (e.who ?? []).some((x) => world.characters[x.id]?.houseId === P) || (e.characterIds ?? []).some((id) => world.characters[id]?.houseId === P) || !!e.houseIds?.includes(P);
  if (has(t, 'become friends', 'open rivals', 'are rivals now', 'no longer hides', 'think of the highroy', 'whispers', 'corridors', 'drift')) return 'spymaster';
  if (e.type === 'economy' || has(t, 'ledger', 'upkeep', 'stipend', 'loan', 'vault', 'exchange', 'great work', 'finished. ')) return ours ? 'steward' : 'heralds';
  if (e.type === 'death' || e.kind === 'death' || has(t, 'wounded', 'wound', 'scar', 'fever', 'illness', 'infirmary', 'recover')) return ours ? 'physician' : 'heralds';
  if (has(t, 'caige', 'resonance', 'omen', 'shrine')) return ours ? 'masterOfRites' : 'heralds';
  if (has(t, 'academy', 'pupil', 'tutor', 'taught', 'trials', 'intake', 'ward', 'prospect', 'noticed', 'taken into the house')) return 'elder';
  if (has(t, 'crucible', 'knight', 'blooded', 'garrison', 'raid', 'corsair', 'base', 'drill', 'first command')) return ours ? 'grandMaster' : 'heralds';
  if (e.type === 'fight' || has(t, 'tourney', 'pit', 'bout', 'duel', 'challenge', 'the open', 'invitational')) return ours ? 'champion' : 'heralds';
  if (e.type === 'intrigue' || e.type === 'captive' || e.source === 'rumour' || has(t, 'rumour', 'agent', 'spy', 'drift')) return 'spymaster';
  if (e.type === 'politics' || has(t, 'embassy', 'ambassador', 'envoy', 'house ', 'numarade', 'oath')) return ours ? 'envoy' : 'heralds';
  if (e.type === 'mission') {
    const m = e.missionId ? world.missions[e.missionId] : undefined;
    return m?.kind === 'envoy' ? 'envoy' : m?.kind === 'scout' ? 'grandMaster' : 'spymaster';
  }
  if (e.type === 'birth') return 'elder';
  return ours ? 'envoy' : 'heralds';
}

/** How well a councillor does their part of the telling, 1–20. */
export function competence(world: World, r: Reporter): number {
  if (r === 'heralds') return 14;
  const c = seatHolder(world, world.playerHouseId, r);
  if (!c) return 0;
  const s = c.stats;
  const v = r === 'spymaster' ? (s.intrigue + s.insight) / 2
    : r === 'envoy' ? (s.diplomacy + s.eloquence) / 2
    : r === 'steward' ? (s.stewardship + s.logistics) / 2
    : r === 'grandMaster' ? (s.tactics + s.leadership) / 2
    : r === 'champion' ? (s.duelling + s.perception) / 2
    : r === 'physician' ? (s.intellect + s.insight) / 2
    : r === 'elder' ? (s.intellect + s.law) / 2
    : (s.resonanceControl + s.caigeSync) / 2;
  return v;
}

/** A stable number from a string, so a letter reads the same every time it is opened. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

/**
 * Whether a record reaches the Highroy's desk at all. Grave things always do. The rest depend on the
 * councillor: a sharp one passes on nearly everything, a dull one half, an empty seat almost nothing.
 */
export function reaches(world: World, e: FeedEntry, sev: number): boolean {
  if (sev >= 2) return true;
  const r = reporterOf(world, e);
  if (r === 'elder' && world.treasury?.works.some((x) => x.id === 'archive' && x.done)) return true;
  const c = competence(world, r);
  if (c === 0) return false;
  return hash(e.id ?? e.text) % 100 < 35 + c * 3.2;
}

/** The councillor's own note on a letter: their judgment, coloured by who they are and how they feel about the person. */
export function noteOn(world: World, e: FeedEntry): { by?: string; text: string } | null {
  const r = reporterOf(world, e);
  if (r === 'heralds') return null;
  const c = seatHolder(world, world.playerHouseId, r);
  if (!c) return { text: 'No one holds the seat. This came to you second-hand, and late.' };
  const P = world.playerHouseId;
  const subjectId = (e.who ?? []).map((x) => x.id).find((id) => world.characters[id]?.houseId === P && id !== c.id) ?? e.quote?.from;
  const subj = subjectId ? world.characters[subjectId] : undefined;
  const o = subj ? opinion(world, c.id, subj.id) : 0;
  const n = hash((e.id ?? e.text) + c.id);
  const sharp = competence(world, r) >= 13;
  const stern = c.stats.discipline >= 13 || c.traits.some((t) => t.id === 'proud' || t.id === 'ironBlooded');
  const warm = c.hidden.temperament >= 13;
  const who = subj ? shortName(subj.name) : '';
  const pick = (xs: string[]) => xs[n % xs.length]!;
  let text: string;
  const bad = /robbed|killed|dead|lost|fail|wound|defect|sworn to|left us|disaster|stolen|captured|ran dry|shortage|debt|escaped/i.test(e.text);
  if (bad) text = stern ? pick(['It should not have happened. I will see that it does not again.', 'A failure, and someone will answer for it.', 'I take this badly, my lord, and so should you.']) : warm ? pick(['A hard thing. We will weather it.', 'I am sorry to be the one to bring it.', 'It hurts the house; it will not break it.']) : pick(['Bad news, plainly told.', 'I have nothing to soften it with.', 'As it was reported to me.']);
  else if (subj && o >= 35) text = pick([`${who} has earned every word of this.`, `I think well of ${who}. This bears it out.`, `I would trust ${who} with more than this.`]);
  else if (subj && o <= -30) text = pick([`I would not read too much into it. ${who} talks a better fight than they give.`, `${who} will want credit for this. Give them less than they ask.`, `Mark it, but watch ${who}.`]);
  else if (stern) text = pick(['It is as it should be. Nothing more.', 'Adequate. The house expects no less.', 'Noted. I will hold them to it.']);
  else if (warm) text = pick(['Good news is rare enough; take this one.', 'It lifted the room when it came in.', 'A small thing, but it matters to them.']);
  else text = pick(['As reported.', 'For your eyes; nothing needs doing.', 'I pass it on as it came to me.']);
  if (!sharp && n % 4 === 0) text += ' Some of the particulars may be wrong; my people were not close.';
  return { by: c.id, text };
}

/** How many routine letters a seat passes on each Orbit. */
export const LETTER_CAP = (world: World, r: Reporter) => (r === 'heralds' ? 2 : 1 + Math.floor(competence(world, r) / 7));

/** What the council has to tell the Highroy: unread letters of the last Orbit or so. */
export function lettersFor(world: World): FeedEntry[] {
  const P = world.playerHouseId;
  const seen = new Set(world.ambitions?.seen ?? []);
  const since = absoluteCycle(world.date) - 120;
  const pool = world.feed.filter((e) => {
    if (!e.id || absoluteCycle(e.date) < since) return false;
    if (e.type === 'decision' || e.type === 'time' || e.type === 'port' || e.type === 'seizure' || e.kind === 'time') return false;
    const sev = classify(world, e).severity;
    const ours = (e.who ?? []).some((x) => world.characters[x.id]?.houseId === P) || (e.characterIds ?? []).some((id) => world.characters[id]?.houseId === P) || !!e.houseIds?.includes(P) || !!e.quote;
    const followed = (e.who ?? []).some((x) => world.careers?.pinned.includes(x.id));
    // Routine things (a lesson learned, a friendship) go in the log, not on the desk, unless it is someone we follow.
    if (sev < 1 && !followed && !e.quote) return false;
    if (!ours && !followed && reporterOf(world, e) !== 'heralds' && reporterOf(world, e) !== 'spymaster') return false;
    return reaches(world, e, sev);
  }).reverse();
  // A councillor brings the few things that matter most: grave news and letters always, then the newest of the
  // rest, as many as they can keep straight (a sharp one more than a dull one). The rest stay in the log.
  // Counted per Orbit, read or not, so reading them does not make room for more.
  const per: Record<string, number> = {};
  const keep = new Set<string>();
  for (const e of [...pool].reverse()) {
    const sev = classify(world, e).severity;
    if (sev >= 2 || e.quote || (e.who ?? []).some((x) => world.careers?.pinned.includes(x.id))) { keep.add(e.id!); continue; }
    const r = reporterOf(world, e);
    const k = `${r}|${e.date.year}|${Math.floor(e.date.cycle / 80)}`;
    per[k] = (per[k] ?? 0) + 1;
    if (per[k] <= LETTER_CAP(world, r)) keep.add(e.id!);
  }
  return pool.filter((e) => keep.has(e.id!) && !seen.has(e.id!));
}

