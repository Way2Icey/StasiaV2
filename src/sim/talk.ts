// Audiences: sitting down with someone and talking.
//
// A conversation runs three exchanges. Each time we choose what to say, from a hand of lines drawn from
// three places: the history of the stars (the War for Life, the Rend, the Silence, the othe, the Caige),
// what has happened in this world (their feats, their grudges, their wounds, what they said to us last
// time), and who they are (their temper, their house's views). Nothing on the screen says which lines are
// good. Some of the history is wrong, some of the past is someone else's, and a proud man does not like to
// be flattered by someone he does not respect. A player who knows the lore, and remembers what happened,
// does better.
import { Rng } from './rng';
import { absoluteCycle, addCycles, CYCLES_PER_PHASE, type GameDate } from './time';
import { logRecord } from './records';
import { displayName, shortName } from './names';
import { learn, knowledgeOf, traitVisible } from './knowledge';
import { shiftMood } from './mood';
import { shiftRelation } from './relations';
import { shiftRegard, viewsOf } from './archon';
import { opinion, shiftOpinion } from './relationships';
import { marksOf, told, type Mark } from './details';
import { atWar } from './war';
import { AIM_LABEL } from './houses';
import { CANON_HOUSES, TOPIC_ENDS, TOPIC_LABEL, TOPICS, type Topic } from '../data/canon';
import { TRAITS_BY_ID } from '../data/traits';
import type { Character, World } from './types';

export type TalkAim = 'warm' | 'sound' | 'sway';
export const AIM_TEXT: Record<TalkAim, string> = { warm: 'Win them over', sound: 'Sound them out', sway: 'Win their house' };
export const AIM_NOTE: Record<TalkAim, string> = {
  warm: 'What they think of you.',
  sound: 'What they let slip: their nature, and what their house is after.',
  sway: 'How their house stands toward ours. A seat-holder or Highroy of another house only.',
};

export type LineKind = 'lore' | 'past' | 'appeal' | 'view' | 'recall';
export interface TalkLine {
  id: string;
  kind: LineKind;
  /** What we say. */
  text: string;
  /** A hint the player can see: a trait we know they have, a house view on record. */
  hint?: string;
  /** Hidden: how well it lands. */
  value: number;
  /** Hidden: what they say back. */
  reply: string;
  /** Hidden: a wrong fact, remembered against us. */
  slip?: string;
  /** Which lore or mark it used, so it is not offered twice. */
  key: string;
}

export interface Talk {
  with: string;
  by: string;
  aim: TalkAim;
  beat: number;
  score: number;
  said: { who: 'us' | 'them'; text: string; tone?: 'good' | 'bad' | 'flat' }[];
  options: TalkLine[];
  used: string[];
  started: GameDate;
  done?: { score: number; effects: string[] };
}

export interface TalkMemory { last: GameDate; talks: number; warmth: number; slips: string[] }

export const BEATS = 3;

/** Someone asking to see the Highroy. */
export interface TalkRequest { id: string; personId: string; why: string; date: GameDate; expires: GameDate }

// ---------------------------------------------------------------- the history of the stars
// From the canon histories. Each has the truth and the mistakes people make about it.

interface Lore { key: string; topic: Topic; t: string; f: string[] }
const LORE: Lore[] = [
  { key: 'vaelor', topic: 'faith', t: 'Vaelor Primus took a resonance vision for the Celarchs\' command, and called the crusade on the strength of it.', f: ['The Celarchs spoke to Vaelor Primus plainly, and he called the crusade at their word.', 'Vaelor Primus was the Exarchon who ended the crusade.'] },
  { key: 'warnames', topic: 'crucible', t: 'Fifteen hundred years without a break: the War for God, then for Peace, and at the last, for Life.', f: ['Three hundred years: the War for Life, then for Peace, and at the last, for God.', 'Fifteen hundred years: the War for Peace, then for God, and at the last, for Life.'] },
  { key: 'silentgods', topic: 'faith', t: 'The Celarchs never moved in all those years. The war threatened civilisations, never existence itself.', f: ['The Celarchs ended the war in the end. The Rend was their judgement.', 'The Celarchs fought for the Archon in the last century of the war.'] },
  { key: 'rend', topic: 'drift', t: 'Atrea Lumen and Dr. B\'yan Rhyst tried to build a mind that would end the war. The Rend is what came of it.', f: ['The Rend was a weapon of AIR, fired on the Archon in the first years of the war.', 'Vaelor Primus caused the Rend with his vision.'] },
  { key: 'rendcost', topic: 'caiges', t: 'At the Rend navisium went into step across the stars, the Caiges turned on their wielders, and billions died.', f: ['At the Rend every Caige in the Archon shattered at once, and none have been made since.'] },
  { key: 'silence', topic: 'numarade', t: 'After the Rend came the Silence: no word between the stars, a peace declared, and kept by fear.', f: ['After the Rend came the Silence: a century of open war between the houses.'] },
  { key: 'saturation', topic: 'drift', t: 'Centuries of war soaked the navisium in grief and will. Caiges began to ring beyond their wielders long before the Rend.', f: ['There was no Drift before the Rend. It began the day the lattice woke.'] },
  { key: 'cdi', topic: 'caiges', t: 'A Caige\'s density measures how clear the will is, not how strong the one who holds it.', f: ['A Caige\'s shape decides its strength. A blade will always beat a shield.'] },
  { key: 'inward', topic: 'resonance', t: 'Resonance burns outward. A Caige condenses inward.', f: ['A Caige burns outward. Resonance condenses inward.'] },
  { key: 'bothroads', topic: 'resonance', t: 'Not all who resonate can make a Caige, and not every Caige-wielder resonates. The ones who walk both roads are the ones to fear.', f: ['Every Caige-wielder resonates. A Caige is only resonance given a shape.'] },
  { key: 'purified', topic: 'caiges', t: 'Past nine tenths, a Caige\'s density eats at the soul that holds it. A full one is beyond anyone who means to stay a person.', f: ['A density of one is the mark of a Highroy\'s blood, and some houses have bred for it.'] },
  { key: 'othe', topic: 'trade', t: 'An othe is will bound and sealed, a commitment the Anchor verifies but never issues.', f: ['The Anchor issues every othe and sets what it is worth.'] },
  { key: 'default', topic: 'trade', t: 'Break an othe and every Ledger Node knows it. Credit goes, and does not come back quickly.', f: ['A broken othe is written off after an orbit, and no one remembers.'] },
  { key: 'weight', topic: 'honour', t: '"Desire wants. Will commits." So says On the Weight of Will.', f: ['"Will wants. Desire commits." So says On the Weight of Will.'] },
  { key: 'certainty', topic: 'honour', t: 'On the Weight of Will calls certainty the absence of weight, not the presence of it.', f: ['On the Weight of Will calls certainty the highest form of will.'] },
];

const LEARNED_PEOPLE = new Set(['fokari', 'velarai', 'gholari', 'thessari']);

/** How much a person cares that a fact is right, and how likely they are to notice when it is not. */
function learning(c: Character): number {
  const s = c.stats.intellect + c.stats.insight * 0.5;
  return Math.max(0.3, Math.min(2.2, s / 14 + (LEARNED_PEOPLE.has(c.species) ? 0.5 : 0) + (c.traits.some((t) => t.id === 'archivist') ? 0.5 : 0)));
}

// ---------------------------------------------------------------- appeals to who they are

interface Appeal { key: string; text: string; base: number; like: Record<string, number>; reply: [string, string] }
const APPEALS: Appeal[] = [
  { key: 'flatter', text: 'Flatter them, and their house with them.', base: -0.2, like: { proud: 2, courtier: 1, ambitious: 1, humble: -2, paranoid: -1.5, cunning: -1 }, reply: ['They straighten a little. "You are kind to say it."', '"You want something," they say. "Say what it is."'] },
  { key: 'duty', text: 'Speak of duty, and of a word kept.', base: 0.3, like: { honourBound: 2, duelistsCreed: 1.5, ruthless: -1, cunning: -0.5 }, reply: ['"Few say that and mean it. You might."', 'They let it pass without a word.'] },
  { key: 'become', text: 'Talk about what they could still become.', base: 0, like: { ambitious: 2.2, proud: 0.5, humble: -1.5 }, reply: ['Their eyes go somewhere far off. "I have thought about it."', '"I am content where I am," they say, a little coldly.'] },
  { key: 'plain', text: 'Speak plainly. Nothing held back.', base: 0.3, like: { paranoid: 1.5, honourBound: 1, coldBlooded: 1, courtier: -1, silverTongued: -0.5 }, reply: ['"Good. I prefer it."', '"How refreshing," they say, and do not mean it.'] },
  { key: 'joke', text: 'A joke at the Numarade\'s expense.', base: 0, like: { hotBlooded: 1, streetWise: 1.5, charismatic: 1, proud: -1, honourBound: -1, coldBlooded: -1 }, reply: ['They laugh, and it surprises them.', 'Nothing. Not even a smile.'] },
  { key: 'studies', text: 'Ask about their studies, and listen.', base: 0.3, like: { archivist: 2, linguist: 1.5, healer: 1, tactician: 0.5, hotBlooded: -0.5 }, reply: ['They talk for a long time, and you let them.', '"I have no time for books," they say.'] },
  { key: 'battle', text: 'Talk about a fight well fought.', base: 0.1, like: { brave: 1.5, tactician: 1.5, wrathful: 1, heroOf: 1, victorOf: 1, battleScarred: 1, merciful: -1 }, reply: ['They lean in. They have stories, and they tell one.', '"I have seen enough of fighting," they say.'] },
  { key: 'mercy', text: 'Speak of mercy, and of the cells.', base: 0, like: { merciful: 2, generous: 1, healer: 1, ruthless: -1.5, wrathful: -1 }, reply: ['"More of us should think that way."', '"Mercy is a luxury," they say.'] },
];

// ---------------------------------------------------------------- state

export function talkMemory(w: World, id: string): TalkMemory | undefined { return w.talks?.[id]; }

export function cannotTalk(w: World, id: string): string | null {
  const P = w.playerHouseId;
  const c = w.characters[id];
  const lord = w.houses[P]?.rulerId;
  if (!c?.alive || !lord || id === lord) return 'No one to talk to';
  if (w.talk && !w.talk.done) return 'Already in an audience';
  if (w.captives[id]) return 'They are held';
  if (c.houseId !== P) {
    if (c.houseId && atWar(w, P, c.houseId)) return 'We are at war with their house';
    if (!c.seat && knowledgeOf(w, P, id).depth < 15) return 'We do not know them well enough to ask for an audience';
  }
  const m = w.talks?.[id];
  if (m && absoluteCycle(m.last) + CYCLES_PER_PHASE > absoluteCycle(w.date)) return 'We spoke this Phase';
  return null;
}

export function aimsFor(w: World, id: string): TalkAim[] {
  const c = w.characters[id];
  return c?.houseId !== w.playerHouseId && (c?.seat || w.houses[c?.houseId ?? '']?.rulerId === id) ? ['warm', 'sound', 'sway'] : ['warm', 'sound'];
}

export function openTalk(input: World, id: string, aim: TalkAim): World {
  const w = structuredClone(input);
  const why = cannotTalk(w, id);
  if (why) throw new Error(why);
  if (!aimsFor(w, id).includes(aim)) throw new Error('Not with them');
  const rng = new Rng(w.rng);
  const c = w.characters[id]!;
  const lord = w.characters[w.houses[w.playerHouseId]!.rulerId!]!;
  const mem = w.talks?.[id];
  const op = opinion(w, id, lord.id);
  const open = mem?.slips.length && rng.chance(0.6)
    ? `"You again," ${shortName(c.name)} says. "Still sure about what you told me last time?"`
    : op >= 30 ? `${shortName(c.name)} gets up to meet you. "Sit. It has been too long."`
    : op <= -30 ? `${shortName(c.name)} does not get up. "Say what you came to say."`
    : rng.pick([`${shortName(c.name)} has wine poured, and waits.`, `${shortName(c.name)} nods you to a chair.`, `"House ${w.houses[w.playerHouseId]!.name}," ${shortName(c.name)} says. "Sit."`]);
  w.talk = { with: id, by: lord.id, aim, beat: 0, score: 0, said: [{ who: 'them', text: open }], options: [], used: [], started: w.date };
  w.talk.options = deal(w, rng, w.talk);
  w.rng = rng.state;
  return w;
}

/** Say one of the lines on offer. After the third, the audience ends and its effects land. */
export function say(input: World, lineId: string): World {
  const w = structuredClone(input);
  const t = w.talk;
  if (!t || t.done) throw new Error('No audience');
  const line = t.options.find((x) => x.id === lineId);
  if (!line) throw new Error('No such line');
  const rng = new Rng(w.rng);
  const c = w.characters[t.with]!;
  const us = w.characters[t.by]!;
  // Our speaker's own way with words moves every line a little.
  const skill = (us.stats.eloquence + us.stats.diplomacy) / 2;
  const v = line.value + (line.value > 0 ? (skill - 10) / 20 : 0) + (us.traits.some((x) => x.id === 'charismatic' || x.id === 'silverTongued') ? 0.3 : 0) + (us.traits.some((x) => x.id === 'awkward') ? -0.3 : 0);
  t.score += v;
  t.used.push(line.key);
  t.said.push({ who: 'us', text: line.text }, { who: 'them', text: line.reply, tone: v >= 0.8 ? 'good' : v <= -0.5 ? 'bad' : 'flat' });
  if (line.slip) {
    const m = mem(w, c.id);
    if (!m.slips.includes(line.slip)) m.slips.push(line.slip);
  }
  if (line.kind === 'recall' && line.key === 'recall:mend') mem(w, c.id).slips = [];
  t.beat++;
  if (t.beat >= BEATS) finish(w, rng, t);
  else t.options = deal(w, rng, t);
  w.rng = rng.state;
  return w;
}

/** Get up and leave early. They notice. */
export function leaveTalk(input: World): World {
  const w = structuredClone(input);
  const t = w.talk;
  if (!t) return w;
  if (t.done) { delete w.talk; return w; }
  t.score -= 1;
  t.said.push({ who: 'them', text: '"Leaving so soon?"', tone: 'bad' });
  finish(w, new Rng(w.rng), t);
  delete w.talk;
  return w;
}

const mem = (w: World, id: string): TalkMemory => ((w.talks ??= {})[id] ??= { last: w.date, talks: 0, warmth: 0, slips: [] });

function finish(w: World, rng: Rng, t: Talk): void {
  const P = w.playerHouseId;
  const c = w.characters[t.with]!;
  const s = Math.round(t.score * 10) / 10;
  const effects: string[] = [];
  const m = mem(w, c.id);
  m.last = w.date; m.talks++; m.warmth = Math.max(-10, Math.min(10, m.warmth + Math.sign(Math.round(s)) * Math.min(3, Math.abs(Math.round(s)))));
  const by = Math.round(s * 3);
  if (t.aim === 'warm' || s < 0) {
    shiftOpinion(w, c.id, t.by, by, 'an audience'); shiftOpinion(w, t.by, c.id, Math.round(s), 'an audience');
    if (by) effects.push(`${shortName(c.name)}'s opinion of us ${by > 0 ? '+' : ''}${by}`);
  }
  if (t.aim === 'sound') {
    const got = learn(w, P, c.id, 6 + Math.max(0, Math.round(s * 4)));
    effects.push(`Knowledge of them +${Math.round(got)}`);
    const aim = c.houseId && c.houseId !== P ? w.realm?.aims[c.houseId] : undefined;
    if (aim && s >= 3 && !aim.known) { aim.known = true; effects.push(`They let slip House ${w.houses[c.houseId!]?.name} is after ${AIM_LABEL[aim.kind].toLowerCase()}${aim.target ? `, at House ${w.houses[aim.target]?.name ?? aim.target}` : ''}`); }
  }
  if (t.aim === 'sway' && c.houseId && c.houseId !== P) {
    const r = Math.round(s * 2.5);
    shiftRegard(w, c.houseId, P, r); shiftRelation(w, c.houseId, P, r);
    if (r) effects.push(`House ${w.houses[c.houseId]?.name} regard ${r > 0 ? '+' : ''}${r}`);
  }
  if (c.houseId === P) { shiftMood(c, Math.round(s * 2)); }
  const close = s >= 3 ? rng.pick([`${shortName(c.name)} walks you to the door.`, `"Come again," ${shortName(c.name)} says, and means it.`]) : s <= -2 ? rng.pick([`${shortName(c.name)} has someone show you out.`, `The door closes a little hard behind you.`]) : rng.pick([`You part civilly.`, `"Well," ${shortName(c.name)} says. That is all.`]);
  t.said.push({ who: 'them', text: close });
  t.done = { score: s, effects };
  logRecord(w, {
    kind: 'council', type: 'politics', severity: Math.abs(s) >= 3 ? 2 : 1,
    text: `An audience with ${displayName(c.name)} went ${s >= 3 ? 'well' : s <= -2 ? 'badly' : 'neither well nor badly'}.`,
    who: [{ id: c.id, part: 'guest' }, { id: t.by, part: 'host' }], effects,
    account: told('those present', t.said.map((x) => (x.who === 'us' ? `${shortName(w.characters[t.by]!.name)}: ${x.text}` : x.text))),
  });
}

// ---------------------------------------------------------------- dealing lines

let seq = 0;
const lid = (t: Talk) => `l${t.beat}-${seq++}`;

function deal(w: World, r: Rng, t: Talk): TalkLine[] {
  const c = w.characters[t.with]!;
  const out: TalkLine[] = [];
  const add = (x: TalkLine | undefined) => { if (x && !out.some((y) => y.key === x.key) && !t.used.includes(x.key)) out.push(x); };
  if (t.beat === 0) add(recallLine(w, r, t, c));
  add(loreLine(w, r, t, c));
  add(pastLine(w, r, t, c) ?? houseLine(w, r, t, c));
  add(r.chance(0.5) ? appealLine(w, r, t, c) : viewLine(w, r, t, c));
  for (let i = 0; out.length < 5 && i < 8; i++) add(r.pick([loreLine, houseLine, appealLine, viewLine, pastLine])(w, r, t, c));
  // No more than one wrong fact in a hand: the test is knowing which, not dodging a minefield.
  const wrong = out.filter((x) => x.slip);
  const hand = out.filter((x) => !x.slip || x === wrong[0]).slice(0, 4).sort(() => r.next() - 0.5);
  t.used.push(...hand.map((x) => x.key));
  return hand;
}

function loreLine(w: World, r: Rng, t: Talk, c: Character): TalkLine | undefined {
  const pool = LORE.filter((x) => !t.used.includes(`lore:${x.key}`));
  if (!pool.length) return undefined;
  const l = r.pick(pool);
  const views = c.houseId ? viewsOf(w, c.houseId) : undefined;
  const care = (views?.[l.topic] ?? 0) * 0.4;
  const learned = learning(c);
  const C = shortName(c.name);
  if (r.chance(0.55)) {
    return { id: lid(t), kind: 'lore', key: `lore:${l.key}`, text: l.t, value: 0.5 + learned * 0.6 + care, reply: learned >= 1.2 ? r.pick([`"Yes. Exactly that," ${C} says, and looks at you differently.`, `${C} finishes the thought for you, and goes further.`]) : care < 0 ? `"Old stories," ${C} says.` : r.pick([`${C} nods slowly.`, `"So they say."`]) };
  }
  // Wrong. The learned notice; a Gholari smells the doubt in it.
  const notices = learned >= 1 || c.species === 'gholari' || r.chance(learned / 2);
  const f = r.pick(l.f);
  return {
    id: lid(t), kind: 'lore', key: `lore:${l.key}`, text: f, slip: notices ? f : undefined,
    value: notices ? -(0.6 + learned * 0.8) : 0.2,
    reply: notices ? (c.species === 'gholari' ? `${C}'s scent goes sharp: they can smell you are not sure of it. And they know you are wrong.` : r.pick([`"That is not how it went," ${C} says, and tells you how it did.`, `${C} corrects you, politely, and does not forget it.`, `A pause. "Where did you learn that?"`])) : `${C} nods along. They do not know any better.`,
  };
}

/** What their own house is: its seat, its people, what it is known for. Canon facts, and others' facts mixed in. */
function houseLine(w: World, r: Rng, t: Talk, c: Character): TalkLine | undefined {
  const h = CANON_HOUSES.find((x) => x.id === c.houseId);
  if (!h || t.used.includes(`house:${h.id}`)) return undefined;
  const others = CANON_HOUSES.filter((x) => x.id !== h.id && x.capital && x.focus !== 'A Great House');
  const C = shortName(c.name);
  const facts: [string, string][] = [];
  if (h.capital) facts.push([`Speak of ${h.capital}, the seat of House ${h.name}.`, `Speak of ${r.pick(others).capital}, the seat of House ${h.name}.`]);
  if (h.focus !== 'A Great House') facts.push([`Praise House ${h.name} for what it is known for: ${h.focus.toLowerCase()}.`, `Praise House ${h.name} for what it is known for: ${r.pick(others).focus.toLowerCase()}.`]);
  const strangers = others.flatMap((x) => x.notables ?? []);
  if (h.notables?.length && strangers.length) { const n = r.pick(h.notables); facts.push([`Mention ${n.name}: ${n.role.toLowerCase()}.`, `Mention ${r.pick(strangers).name}, as one of House ${h.name}'s.`]); }
  if (!facts.length || c.houseId === w.playerHouseId) return undefined;
  const [right, wrong] = r.pick(facts);
  if (r.chance(0.6)) return { id: lid(t), kind: 'past', key: `house:${h.id}`, text: right, value: 1.3, reply: r.pick([`"You know us," ${C} says, pleased.`, `${C} warms to it. "Few outside the house bother to learn."`]) };
  return { id: lid(t), kind: 'past', key: `house:${h.id}`, text: wrong, slip: wrong, value: -1.8, reply: r.pick([`"That is another house," ${C} says flatly.`, `${C} stares. "You have us confused with someone."`]) };
}

const at = (p: string) => (/^(at|in|on|by|during|aboard|near) /.test(p) ? p : `at ${p}`);
const you = (s: string) => s.replace(/\btheir\b/g, 'your').replace(/\bthem\b/g, 'you').replace(/\bthey\b/g, 'you');

/** What has happened in this world: their marks, and the wrong ones. */
function pastLine(w: World, r: Rng, t: Talk, c: Character): TalkLine | undefined {
  const P = w.playerHouseId;
  const C = shortName(c.name);
  const marks = marksOf(c).filter((m) => !t.used.includes(`mark:${m.kind}:${m.text}`));
  const proud = c.traits.some((x) => x.id === 'proud');
  const pick = (ms: Mark[]) => (ms.length ? r.pick(ms) : undefined);
  // Someone else's feat, told as theirs.
  if (r.chance(0.3)) {
    const other = Object.values(w.characters).filter((x) => x.id !== c.id && x.alive && marksOf(x).some((m) => m.kind === 'feat')).sort(() => r.next() - 0.5)[0];
    const m = other ? pick(marksOf(other).filter((x) => x.kind === 'feat')) : undefined;
    if (other && m) return { id: lid(t), kind: 'past', key: `mark:wrong:${m.text}`, text: `Speak of the time you ${you(m.text)}, ${at(m.place)}.`, value: -1.5, slip: `that ${C} ${m.text}`, reply: `"That was ${shortName(other.name)}," ${C} says. "Not me."` };
  }
  const feat = pick(marks.filter((m) => m.kind === 'feat'));
  const grudge = pick(marks.filter((m) => m.kind === 'grudge'));
  const shame = pick(marks.filter((m) => m.kind === 'shame'));
  const wound = pick(marks.filter((m) => m.kind === 'wound' || m.kind === 'scar'));
  const opts: TalkLine[] = [];
  if (feat) opts.push({ id: lid(t), kind: 'past', key: `mark:feat:${feat.text}`, text: `Speak of the time you ${you(feat.text)}, ${at(feat.place)}, in SY-${feat.year}.`, value: proud ? 2.2 : 1.6, reply: proud ? `"You heard about that." ${C} cannot keep the pleasure out of it.` : `"You remember that?" ${C} says, surprised.` });
  if (grudge) {
    const ours = grudge.with && w.characters[grudge.with]?.houseId === P;
    opts.push(ours
      ? { id: lid(t), kind: 'past', key: `mark:grudge:${grudge.text}`, text: `Own what was done to you by our house: you ${you(grudge.text)}, ${at(grudge.place)}.`, value: t.aim === 'warm' ? 1.8 : 0.8, reply: `${C} is quiet a long moment. "No one from your house ever said that before."` }
      : { id: lid(t), kind: 'past', key: `mark:grudge:${grudge.text}`, text: `Commiserate: you ${you(grudge.text)}, ${at(grudge.place)}. It should not have happened.`, value: 1.4, reply: `"No," ${C} says. "It should not." Something hardens, and not toward you.` });
  }
  if (shame) opts.push({ id: lid(t), kind: 'past', key: `mark:shame:${shame.text}`, text: `Bring up how you ${you(shame.text)}, ${at(shame.place)}.`, value: -2.2, reply: r.pick([`${C}'s face closes like a door.`, `"I know what happened," ${C} says. "I was there."`]) });
  if (wound) opts.push({ id: lid(t), kind: 'past', key: `mark:wound:${wound.text}`, text: `Ask after the old wound: ${wound.text}, ${at(wound.place)}.`, value: c.traits.some((x) => x.id === 'proud' || x.id === 'coldBlooded') ? -0.3 : 0.9, reply: c.traits.some((x) => x.id === 'proud' || x.id === 'coldBlooded') ? `"It is nothing," ${C} says, too quickly.` : `"It aches when the weather turns," ${C} says. "Kind of you to ask."` });
  return opts.length ? r.pick(opts) : undefined;
}

function appealLine(w: World, r: Rng, t: Talk, c: Character): TalkLine | undefined {
  const pool = APPEALS.filter((a) => !t.used.includes(`appeal:${a.key}`));
  if (!pool.length) return undefined;
  const a = r.pick(pool);
  const depth = knowledgeOf(w, w.playerHouseId, c.id).depth;
  let v = a.base;
  const seen: string[] = [];
  for (const tr of c.traits) {
    const k = a.like[tr.id];
    if (!k) continue;
    v += k;
    if (c.houseId === w.playerHouseId || traitVisible(tr, depth)) seen.push(TRAITS_BY_ID[tr.id]?.label ?? tr.id);
  }
  const C = shortName(c.name);
  return { id: lid(t), kind: 'appeal', key: `appeal:${a.key}`, text: a.text, hint: seen.length ? `they are ${seen.join(', ').toLowerCase()}` : undefined, value: v, reply: (v >= 0.5 ? a.reply[0] : a.reply[1]).replace(/\bthey say\b/, `${C} says`).replace(/^They\b/, C).replace(/\bThey\b/, C) };
}

/** Take a side on something their house holds a view on. Their house's views are on record in the Archon. */
function viewLine(w: World, r: Rng, t: Talk, c: Character): TalkLine | undefined {
  if (!c.houseId) return undefined;
  const views = viewsOf(w, c.houseId);
  const pool = TOPICS.filter((x) => !t.used.includes(`view:${x}`));
  if (!pool.length) return undefined;
  const topic = r.pick(pool);
  const side = r.chance(0.5) ? 1 : 0;
  const theirs = views[topic];
  // People differ a little from their house.
  const own = theirs + ((c.id.charCodeAt(c.id.length - 1) + topic.length) % 3) - 1;
  const v = (side ? own : -own) * 0.7;
  const C = shortName(c.name);
  return {
    id: lid(t), kind: 'view', key: `view:${topic}`, text: `${TOPIC_LABEL[topic]}: "${TOPIC_ENDS[topic][side]}."`, value: v,
    reply: v >= 0.6 ? r.pick([`"At last, someone who sees it," ${C} says.`, `${C} agrees, warmly, and at length.`]) : v <= -0.6 ? r.pick([`"My house would disagree," ${C} says. "So do I."`, `${C}'s mouth thins.`]) : `${C} shrugs. "Perhaps."`,
  };
}

/** What happened the last time we spoke. */
function recallLine(w: World, r: Rng, t: Talk, c: Character): TalkLine | undefined {
  const m = w.talks?.[c.id];
  if (!m?.talks) return undefined;
  const C = shortName(c.name);
  if (m.slips.length) {
    const s = r.pick(m.slips);
    return { id: lid(t), kind: 'recall', key: 'recall:mend', text: `Set right what you said last time: "${s.length > 80 ? s.slice(0, 77) + '…' : s}" You were wrong.`, value: 1.6, reply: `"Good," ${C} says. "I wondered if you would."` };
  }
  return { id: lid(t), kind: 'recall', key: 'recall:again', text: `Pick up where you left off, ${m.talks === 1 ? 'last time' : `the ${m.talks} times before`}.`, value: m.warmth > 0 ? 1.2 : m.warmth < 0 ? -0.8 : 0.2, reply: m.warmth > 0 ? `"Where were we," ${C} says, smiling.` : m.warmth < 0 ? `"I remember how that went," ${C} says.` : `${C} does not remember much of it.` };
}


// ---------------------------------------------------------------- people who ask to see us

const REQUEST_WHY_OURS = ['would like a word, in private', 'has something on their mind and will not say what to anyone else', 'asks to be heard', 'wants to talk about their future in the house'];
const REQUEST_WHY_THEIRS = ['asks for an audience while they are at our court', 'has come in person, and asks to be received', 'sends word they would speak with our Highroy', 'is passing through and asks for an hour of our time'];

/** Each Phase, now and then, someone asks to see us: one of ours with something to say, or someone of another house. */
export function advanceTalkRequests(w: World, rng: Rng, phaseTurned: boolean): void {
  if (!phaseTurned) return;
  const P = w.playerHouseId;
  const lord = w.houses[P]?.rulerId;
  const now = absoluteCycle(w.date);
  for (const r of (w.talkRequests ?? []).filter((x) => absoluteCycle(x.expires) <= now)) if (lord) shiftOpinion(w, r.personId, lord, -3, 'was never received');
  w.talkRequests = (w.talkRequests ?? []).filter((x) => absoluteCycle(x.expires) > now && w.characters[x.personId]?.alive);
  if (!lord || w.talkRequests.length >= 3 || !rng.chance(0.3)) return;
  const asked = new Set(w.talkRequests.map((r) => r.personId));
  const ours = Object.values(w.characters).filter((c) => c.alive && c.houseId === P && c.id !== lord && c.tier === 'full' && !c.veiled && !w.captives[c.id] && !asked.has(c.id) && Math.abs(opinion(w, c.id, lord)) >= 15);
  const theirs = Object.values(w.characters).filter((c) => c.alive && c.houseId && c.houseId !== P && c.seat && !asked.has(c.id) && !atWar(w, P, c.houseId));
  const pickOurs = ours.length && (rng.chance(0.6) || !theirs.length);
  const c = pickOurs ? rng.pick(ours) : theirs.length ? rng.pick(theirs) : undefined;
  if (!c || cannotTalk(w, c.id)) return;
  w.talkRequests.push({ id: `tr${w.nextId++}`, personId: c.id, why: rng.pick(pickOurs ? REQUEST_WHY_OURS : REQUEST_WHY_THEIRS), date: w.date, expires: addCycles(w.date, CYCLES_PER_PHASE * 2) });
}

/** Receive them: the audience opens at once, and they come in better disposed for having been asked in. */
export function receiveRequest(input: World, requestId: string, aim: TalkAim): World {
  const r = (input.talkRequests ?? []).find((x) => x.id === requestId);
  if (!r) throw new Error('They have gone');
  const pre = structuredClone(input);
  pre.talkRequests = (pre.talkRequests ?? []).filter((x) => x.id !== requestId);
  if (pre.talks?.[r.personId]) pre.talks[r.personId]!.last = { year: 0, cycle: 0 };
  const w = openTalk(pre, r.personId, aim);
  w.talk!.score += 0.8;
  return w;
}

export function turnAway(input: World, requestId: string): World {
  const w = structuredClone(input);
  const r = (w.talkRequests ?? []).find((x) => x.id === requestId);
  if (!r) return w;
  w.talkRequests = (w.talkRequests ?? []).filter((x) => x.id !== requestId);
  const lord = w.houses[w.playerHouseId]?.rulerId;
  if (lord) shiftOpinion(w, r.personId, lord, -4, 'was turned away');
  return w;
}
