// Accounts and marks. Every fight leaves an account: a few plain lines from someone who was there, built
// from what was actually true (the fighters' traits and skill, the shape a Caige took, old wounds, the
// last time these two met). And every fight leaves marks on the people in it: a wound on a side of the
// body, a grudge, a thing they are proud of, a habit an opponent noticed. Later accounts read the marks,
// so the past shows in the present: she still favours the left, he has seen that feint before.
import type { Rng } from './rng';
import { shortName } from './names';
import type { Character, World } from './types';
import type { Battle } from './battle';

// ---------------------------------------------------------------- marks

export type MarkKind = 'wound' | 'scar' | 'grudge' | 'feat' | 'shame' | 'habit' | 'kill';
export interface Mark {
  kind: MarkKind;
  /** What it is, in a few words: "a cut to the left thigh", "slips inside the guard". */
  text: string;
  /** Where it happened: "at the house tourney", "at Kesh Breach". */
  place: string;
  year: number;
  /** The other person in it, when there was one. */
  with?: string;
  /** A body part and side, for wounds. */
  part?: string;
  side?: 'left' | 'right';
}
export interface Account {
  /** Who is telling it. */
  by: string;
  lines: string[];
}

const MAX_MARKS = 16;

/** Accounts are told in sentences: each line starts with a capital, whoever it starts with. */
const told = (by: string, lines: string[]): Account => ({ by, lines: lines.filter(Boolean).map((l) => l.charAt(0).toUpperCase() + l.slice(1)) });
/** Nameless fighters are numbered in the fight ("a soldier 2"); in the telling they are just soldiers. */
const plain = (t: string) => t.replace(/ \d+\b/g, '');
const KEEP: MarkKind[] = ['kill', 'scar', 'grudge', 'shame'];

export function marksOf(c: Character | undefined): Mark[] {
  return c?.marks ?? [];
}

export function addMark(w: World, c: Character, m: Omit<Mark, 'year'> & { year?: number }): void {
  const cc = c;
  const mark: Mark = { ...m, year: m.year ?? w.date.year };
  const list = (cc.marks ??= []);
  // The same habit seen twice is one habit.
  if (mark.kind === 'habit' && list.some((x) => x.kind === 'habit' && x.text === mark.text)) return;
  list.unshift(mark);
  while (list.length > MAX_MARKS) {
    const i = list.map((x) => KEEP.includes(x.kind)).lastIndexOf(false);
    list.splice(i >= 0 ? i : list.length - 1, 1);
  }
}

/** The times these two have met before, and who won. */
export function meetings(a: Character | undefined, bId: string | undefined): { won: number; lost: number } {
  if (!a || !bId) return { won: 0, lost: 0 };
  const ms = marksOf(a).filter((m) => m.with === bId);
  return { won: ms.filter((m) => m.kind === 'feat' || m.kind === 'kill').length, lost: ms.filter((m) => m.kind === 'wound' || m.kind === 'shame' || m.kind === 'grudge').length };
}

const PARTS = ['shoulder', 'forearm', 'thigh', 'ribs', 'knee', 'hip', 'cheek', 'hand'] as const;

/** An open wound or a lasting scar: where they still carry it. */
export function oldWound(c: Character | undefined): Mark | undefined {
  return marksOf(c).find((m) => (m.kind === 'wound' || m.kind === 'scar') && m.part);
}

// ---------------------------------------------------------------- who they are, in a fight

export interface Combatant { name: string; c?: Character; score: number }
export const combatant = (c: Character, score: number): Combatant => ({ name: shortName(c.name), c, score });

const has = (x: Combatant, t: string) => !!x.c?.traits.some((y) => y.id === t);
const st = (x: Combatant, s: keyof Character['stats']) => x.c?.stats[s] ?? 10;

export function caigeOf(w: World, c: Character | undefined): { form: string; cdi?: number; name: string } | undefined {
  if (!c) return undefined;
  const k = Object.values(w.armoury ?? {}).find((x) => x.bondedTo === c.id);
  return k ? { form: k.form ?? 'a blade', cdi: k.cdi, name: k.name } : undefined;
}

function weapon(w: World, x: Combatant, blunt: boolean): string {
  const k = caigeOf(w, x.c);
  if (blunt) return 'a blunted practice blade';
  if (k) return `${k.name}, which came up as ${/^(a|an|the) /.test(k.form) ? k.form : `a ${k.form}`}`;
  return x.c && x.c.stats.marksmanship > x.c.stats.duelling + 3 ? 'a shard pistol and a knife' : 'a shard blade';
}

function opening(r: Rng, x: Combatant, y: Combatant): string {
  const X = x.name, Y = y.name;
  const ow = oldWound(x.c);
  const seen = marksOf(y.c).find((m) => m.kind === 'habit' && m.with === x.c?.id);
  const opts: string[] = [];
  if (ow && r.chance(0.7)) opts.push(`${X} still favoured the ${ow.side} ${ow.part}, from ${ow.place} in ${ow.year}${y.c && (y.c.stats.insight >= 12 || meetings(y.c, x.c?.id).won + meetings(y.c, x.c?.id).lost) ? `. ${Y} knew it, and worked that side` : ''}.`);
  if (seen) opts.push(`${Y} had seen ${X} ${seen.text} before, and waited for it.`);
  if (has(x, 'paranoid')) opts.push(`${X} came out slow, eyes on ${Y}'s feet, not the blade.`);
  if (has(x, 'hotBlooded') || has(x, 'wrathful')) opts.push(`${X} went in before the call had finished.`);
  if (has(x, 'coldBlooded')) opts.push(`${X} didn't move for the first count. Just waited.`);
  if (has(x, 'duelistsCreed')) opts.push(`${X} gave the old-school salute, blade to the brow, and meant it.`);
  if (has(x, 'proud')) opts.push(`${X} played to the gallery before a single pass.`);
  if (has(x, 'giant')) opts.push(`${X} had a head and a half on ${Y} and used every bit of it.`);
  if (has(x, 'nimble')) opts.push(`${X} never stood still long enough to be hit.`);
  if (has(x, 'limp')) opts.push(`${X} fought off the bad leg and didn't hide it.`);
  if (has(x, 'lostEye')) opts.push(`${X} kept turning to keep ${Y} on the good side.`);
  if (st(x, 'duelling') >= 15) opts.push(`${X}'s guard was textbook. You could have drawn it.`);
  if (st(x, 'duelling') <= 7) opts.push(`${X}'s guard was ugly, but it kept working.`);
  if (st(x, 'strength') >= 15) opts.push(`${X} hit hard enough that ${Y} felt it through the guard.`);
  if (st(x, 'composure') <= 6) opts.push(`${X} was breathing hard before anything had happened.`);
  return opts.length && r.chance(0.8) ? r.pick(opts) : r.pick([
    `${X} and ${Y} circled once, twice, and closed.`,
    `${X} tested the guard three times without committing. ${Y} gave nothing away.`,
    `Neither wanted to go first. The marshal had to call them in.`,
    `${X} opened fast and ${Y} gave ground, a step at a time, watching.`,
    `It was close and quiet for a long while. You could hear their boots on the ${r.pick(['sand', 'deck plates', 'boards'])}.`,
    `${Y} talked the whole time. ${X} never answered.`,
  ]);
}

/** How the winner did it, and the habit someone will remember. */
function turn(r: Rng, x: Combatant, y: Combatant): { line: string; habit: string } {
  const X = x.name, Y = y.name;
  const best = (['agility', 'strength', 'duelling', 'valor', 'reflexes', 'tactics'] as const).map((s) => ({ s, v: st(x, s) + r.next() * 3 })).sort((a, b) => b.v - a.v)[0]!.s;
  const n = r.pick(['second', 'third', 'fourth', 'fifth']);
  const T: Record<typeof best, [string, string][]> = {
    agility: [[`On the ${n} pass ${X} slipped inside ${Y}'s reach and was behind the guard before it closed.`, 'slips inside the guard'],
      [`${X} went low, under the swing, and came up on ${Y}'s blind side.`, 'goes under the swing']],
    strength: [[`On the ${n} pass ${X} simply beat the guard down, two-handed, and kept beating.`, 'beats the guard down'],
      [`${X} caught ${Y}'s blade on the bind and shoved, and ${Y} went back three steps.`, 'wins the bind and shoves']],
    duelling: [[`On the ${n} pass ${X} feinted high and cut low. ${Y} bought the feint.`, 'feints high and cuts low'],
      [`${X} beat the blade aside with the flat and was in before it came back.`, 'beats the blade aside'],
      [`${X} drew the same parry out of ${Y} three times, and the fourth time it wasn't there.`, 'sets a pattern, then breaks it']],
    valor: [[`On the ${n} pass ${X} took a cut to give one, and ${Y} didn't expect that.`, 'takes a hit to give one'],
      [`${X} walked straight into the guard, like it wasn't there.`, 'walks into the guard']],
    reflexes: [[`On the ${n} pass ${Y} committed, and ${X} was already gone.`, 'waits for the commit'],
      [`${Y} had ${X} beaten, for half a breath. ${X} turned it.`, 'turns a lost exchange']],
    tactics: [[`${X} let ${Y} have the centre for three passes, then took it back all at once.`, 'gives ground, then takes it all back'],
      [`${X} worked ${Y} toward the ${r.pick(['rail', 'wall', 'edge of the ring'])} and kept them there.`, 'pins them on the edge']],
  };
  const [line, habit] = r.pick(T[best]);
  return { line, habit };
}

function reaction(r: Rng, x: Combatant, y: Combatant, killed: boolean, down = true): string {
  const X = x.name, Y = y.name;
  if (killed) {
    if (has(x, 'merciful')) return `${X} knelt by ${Y} until the healers came, though there was nothing for them to do.`;
    if (has(x, 'ruthless')) return `${X} cleaned the blade on ${Y}'s sleeve and walked off.`;
    if (has(x, 'honourBound') || has(x, 'duelistsCreed')) return `${X} saluted the body and stood there a long time.`;
    return r.pick([`${X} didn't look back.`, `Nobody cheered. ${X} left the ring without a word.`, `${X} sat down on the edge of the ring and didn't get up for a while.`]);
  }
  if (has(x, 'merciful') || has(x, 'honourBound')) return `${X} offered a hand. ${Y} took it.`;
  if (has(x, 'proud')) return down ? `${X} played to the gallery before ${Y} was off the ground.` : `${X} turned to the gallery before the marshal had finished the call.`;
  if (has(x, 'ruthless')) return down ? `${X} didn't offer a hand. ${Y} noticed.` : `${X} didn't salute. ${Y} noticed.`;
  return r.pick([...(down ? [`${X} stepped back and let ${Y} get up alone.`] : [`They touched blades and walked off opposite sides.`]), `${X} nodded once, the way you do when it was close.`, `${X} said something to ${Y} nobody else heard.`]);
}

// ---------------------------------------------------------------- duels

export interface DuelContext { place: string; witness: string; blunt?: boolean; cause?: string; crowd?: string }
export interface DuelOutcome { winner: 'a' | 'b'; hurt?: boolean; killed?: boolean; lasting?: string | null }

/** A duel, told by someone who saw it. Leaves marks on both. */
export function duelAccount(w: World, r: Rng, a: Combatant, b: Combatant, o: DuelOutcome, ctx: DuelContext): Account {
  const [x, y] = o.winner === 'a' ? [a, b] : [b, a];
  const lines: string[] = [];
  const met = meetings(a.c, b.c?.id);
  const times = met.won + met.lost;
  const first = `${a.name} against ${b.name}${ctx.cause ? `, over ${ctx.cause}` : ''}, ${ctx.place}.${ctx.crowd ? ` ${ctx.crowd}` : ''}${times ? ` ${['', 'Second', 'Third', 'Fourth', 'Fifth'][times + 1] ?? 'Another'} time these two had met; ${a.name} had won ${met.won} of them.` : ''}`;
  lines.push(first);
  const wa = weapon(w, a, !!ctx.blunt), wb = weapon(w, b, !!ctx.blunt);
  if (wa !== wb) lines.push(`${a.name} carried ${wa}; ${b.name}, ${wb}.`);
  else if (!ctx.blunt && r.chance(0.5)) lines.push(r.pick([`Shard blades, both of them.`, `Same steel on both sides. It came down to the hands.`]));
  const [p, q] = r.chance(0.5) ? [a, b] : [b, a];
  lines.push(opening(r, p, q));
  const t = turn(r, x, y);
  lines.push(t.line);
  const part = r.pick([...PARTS]);
  const side = r.chance(0.5) ? 'left' : 'right';
  if (o.killed) lines.push(`It went through ${y.name}'s ${side === 'left' ? 'left' : 'right'} ${part === 'cheek' ? 'side' : part} and ${y.name} didn't get up.`);
  else if (o.hurt) lines.push(`${x.name} opened ${y.name}'s ${side} ${part}. The healers were over the rail before the call.${o.lasting ? ` They say ${y.name} ${o.lasting}.` : ''}`);
  else lines.push(ctx.blunt ? r.pick([`${y.name} went down on one knee and yielded.`, `The marshal called it for ${x.name} on the third clean touch.`, `${y.name}'s blade went into the ${r.pick(['sand', 'rail', 'crowd'])}, and that was that.`])
    : r.pick([`First blood to ${x.name}, a nick on the ${part}, and it was called.`, `${x.name} drew a line of red across ${y.name}'s ${part}. The marshal stepped in.`, `${y.name} looked down at the ${part} before anyone else saw the blood. Called for ${x.name}.`]));
  lines.push(reaction(r, x, y, !!o.killed, !!(o.hurt || ctx.blunt)));
  // What it leaves behind.
  const year = w.date.year;
  if (x.c) {
    addMark(w, x.c, { kind: o.killed ? 'kill' : 'feat', text: `${o.killed ? 'killed' : 'beat'} ${y.name}`, place: ctx.place, with: y.c?.id });
  }
  if (y.c) {
    if (x.c) addMark(w, y.c, { kind: 'habit', text: t.habit, place: ctx.place, with: x.c.id });
    if (!o.killed) {
      if (o.hurt) addMark(w, y.c, { kind: o.lasting ? 'scar' : 'wound', text: `a cut to the ${side} ${part}`, place: ctx.place, with: x.c?.id, part, side });
      const upset = y.score > x.score + 2;
      if (x.c && (upset || has(x, 'ruthless') || (has(x, 'proud') && r.chance(0.5)))) addMark(w, y.c, { kind: 'grudge', text: upset ? `lost to ${x.name}, who should not have won` : `was shamed by ${x.name}`, place: ctx.place, with: x.c.id });
      else if (!o.hurt && r.chance(0.3)) addMark(w, y.c, { kind: 'shame', text: `lost to ${x.name}`, place: ctx.place, with: x.c?.id });
    }
  }
  void year;
  return told(ctx.witness, lines);
}

// ---------------------------------------------------------------- battles


const BATTLE_WITNESS: Record<string, string> = {
  surface: 'a sergeant of the line', atmo: 'a wing leader who flew it', space: 'a gunnery officer', station: 'one of the boarding party', ship: 'a deckhand who held the gangway',
};

/** A battle, told by someone in it: how it opened, who did what, how it turned, who did not come back. */
export function battleAccount(w: World, r: Rng, b: Battle): Account {
  const lines: string[] = [];
  const [s0, s1] = b.sides;
  const ours = b.fighters.filter((f) => f.side === 0);
  const theirs = b.fighters.filter((f) => f.side === 1);
  const us = /^our /i.test(s0.name);
  lines.push(`${b.where}. ${us ? `We went in under ${s0.commander.name}` : `${s0.name}, under ${s0.commander.name},`} against ${s1.name}, under ${plain(s1.commander.name)}. ${ours.length} of ours who matter, ${theirs.length} of theirs, and the rank and file behind.`);
  // The big moments the fighting itself raised, in order: champions, commanders, Caiges.
  const big = b.feed.filter((l) => l.big && l !== b.feed[b.feed.length - 1]).map((l) => l.text).filter((t) => !/carries the day|holds the field| commands /.test(t));
  for (const t of big.slice(0, 2)) lines.push(t);
  // Who did most, on each side.
  const top = (fs: typeof b.fighters) => fs.filter((f) => f.deeds.length).sort((a, c) => c.rating - a.rating)[0];
  for (const f of [top(ours), top(theirs)]) {
    if (!f) continue;
    const c = f.id ? w.characters[f.id] : undefined;
    const k = caigeOf(w, c);
    const ow = oldWound(c);
    const ds = f.deeds.slice(0, 2).map(plain);
    const did = ds.length === 2 && ds[0] === ds[1] ? `${ds[0]}, then another` : ds.join(', then ');
    lines.push(`${plain(f.name)}${k ? `, ${k.name} in hand,` : ''} ${did}.${ow && r.chance(0.5) ? ` Never mind the old ${ow.part}.` : ''}`);
  }
  if (b.result) lines.push(us ? b.result.text.replace(/^our people carries the day\./i, 'We carried the day.').replace(/^our people holds the field/i, 'We held the field') : b.result.text);
  const dead = b.fighters.filter((f) => f.state === 'dead').map((f) => plain(f.name));
  if (dead.length) lines.push(`Did not come back: ${dead.join(', ')}.`);
  // Marks: deeds become things they are proud of; the downed carry wounds; the dead leave grudges behind.
  for (const f of b.fighters) {
    const c = f.id ? w.characters[f.id] : undefined;
    if (!c?.alive) continue;
    if (f.state === 'down') { const part = r.pick([...PARTS]); const side = r.chance(0.5) ? 'left' : 'right'; addMark(w, c, { kind: 'wound', text: `a wound to the ${side} ${part}`, place: b.title, part, side }); }
    // A nameless soldier downed is the day's work, not a thing to carry: only named foes and duels are remembered.
    for (const d of f.deeds.filter((x) => !/ \d+$/.test(x) && !/^downed (a|an) /.test(x)).slice(0, 1)) addMark(w, c, { kind: /killed/.test(d) ? 'kill' : 'feat', text: plain(d), place: b.title });
  }
  for (const f of b.fighters.filter((x) => x.state === 'dead' && x.id)) {
    const killer = b.fighters.find((k) => k.deeds.includes(`killed ${f.name}`));
    const kin = Object.values(w.characters).filter((c) => c.alive && c.familyId === w.characters[f.id!]?.familyId && c.id !== f.id && c.tier === 'full').slice(0, 2);
    for (const k of kin) addMark(w, k, { kind: 'grudge', text: `${killer ? `${killer.name} killed` : 'lost'} ${f.name}`, place: b.title, with: killer?.id });
  }
  return told(BATTLE_WITNESS[b.theatre] ?? 'someone who was there', lines);
}

// ---------------------------------------------------------------- assaults, standoffs, attempts

export function assaultAccount(w: World, r: Rng, place: string, holder: string, ships: { name: string; captainId: string | null }[], won: boolean, garrison: number): Account {
  const capt = ships.map((s) => (s.captainId && w.characters[s.captainId] ? w.characters[s.captainId]! : undefined)).filter((c): c is Character => !!c);
  const lead = capt[0];
  const lines = [
    `${ships.map((s) => `The ${s.name}`).join(' and ')} came in on ${place} ${r.pick(['under its own guns', 'with the station lights still on', 'out of the planet\'s shadow', 'in a tight line, no hails'])}. About ${Math.round(garrison / 100) * 100} on the station.`,
    r.pick([`The first breaching run hit the docking ring and stuck.`, `The shuttles went in on the far side, where the turrets couldn't depress.`, `They cut the station's power before the first boarder was aboard.`]),
  ];
  if (lead) lines.push(`${shortName(lead.name)} went over with the second wave${oldWound(lead) ? `, still careful of the old ${oldWound(lead)!.part}` : ''}.`);
  lines.push(won ? r.pick([`The garrison held two decks, then the hub, then nothing. ${holder}'s colours came down at the change of watch.`, `It was corridor by corridor. By the end there were more prisoners than boarders.`]) : r.pick([`The garrison held the hub. The boarders came back with fewer than they took.`, `Somebody on the station knew what they were doing. The breach was sealed with our people still in it.`]));
  for (const c of capt) addMark(w, c, { kind: won ? 'feat' : 'shame', text: won ? `took ${place}` : `was thrown back from ${place}`, place });
  return told('an officer of the boarding party', lines);
}

export function standoffAccount(w: World, r: Rng, win: { name: string; captainId: string | null }, lose: { name: string; captainId: string | null }, where: string): Account {
  const cw = win.captainId ? w.characters[win.captainId] : undefined;
  const cl = lose.captainId ? w.characters[lose.captainId] : undefined;
  const lines = [
    `The ${win.name} and the ${lose.name} over ${where}. Neither would give the lane.`,
    cw ? `${shortName(cw.name)} ${cw.stats.tactics >= 13 ? 'kept the sun behind the ship and waited' : cw.stats.valor >= 13 ? 'closed to point blank and let the guns decide' : 'held the line and fired on the roll'}.` : `The ${win.name} held course and fired on the roll.`,
    `The ${lose.name} took ${r.pick(['a raking pass along the spine', 'two hits amidships', 'a shard volley across the bridge', 'fire in the drive section'])} and ${cl ? `${shortName(cl.name)} ` : ''}broke off.`,
  ];
  if (cw && cl) { addMark(w, cw, { kind: 'feat', text: `outfought the ${lose.name}`, place: where, with: cl.id }); addMark(w, cl, { kind: 'grudge', text: `was beaten by the ${win.name}`, place: where, with: cw.id }); }
  return told('a signals officer', lines);
}

export function attemptAccount(w: World, r: Rng, target: Character, kind: 'assassin' | 'scandal' | 'abduction' | 'bribe' | 'plot', foiled: boolean, guard: number, outcome: 'dead' | 'wounded' | 'none'): Account {
  const T = shortName(target.name);
  const ow = oldWound(target);
  const lines: string[] = [];
  const where = r.pick(['the corridor outside their rooms', 'the lower gallery', 'the docks at the change of shift', 'the chapel', 'their own antechamber']);
  if (kind === 'assassin' || kind === 'plot') {
    lines.push(`${T} was in ${where}${guard ? ` with ${guard >= 3 ? 'the Spymaster\'s own' : guard >= 2 ? 'two sworn guards' : 'a watchman'}` : ', alone'}.`);
    lines.push(r.pick(['The man wore palace grey and had a pass.', 'She came out of a service hatch nobody had used in years.', 'Two of them, one to draw the guard and one to do it.', 'He had been a servant in the house for a year.']));
    if (foiled) lines.push(guard ? r.pick(['The guard put himself in the way and took it in the arm.', 'The guard saw the hand move before the blade did.']) : `${T} ${target.stats.reflexes >= 12 ? 'turned at the last second' : 'stumbled, and the blade went wide'}.`);
    else lines.push(outcome === 'dead' ? `It was quick. ${T} was dead before the alarm.` : `${T} took it in the ${ow ? `${ow.side === 'left' ? 'right' : 'left'} side, opposite the old wound` : r.pick(['side', 'shoulder', 'back'])} and lived.`);
    lines.push(r.pick(['Nobody claimed the body.', 'The pass was a good forgery. Too good.', 'The Spymaster took the knife and has not said what it told him.']));
  } else if (kind === 'scandal') {
    lines.push(`The letters were in ${T}'s hand, or near enough.`, foiled ? 'They were stopped at the Docks, still sealed.' : 'They were read aloud in the chamber before anyone could say otherwise.');
  } else if (kind === 'abduction') {
    lines.push(`${T} was taken from ${where}.`, foiled ? 'The guard brought them back with the kidnappers\' blood on their coat.' : 'No colours. A shuttle without a registry. Gone before the gate closed.');
  } else {
    lines.push(`Someone offered ${T} a fortune for what the chair will do next.`, foiled ? `${T} told the Spymaster the same evening.` : `${T} took it. We do not yet know how many times.`);
  }
  if (outcome === 'wounded') { const part = r.pick([...PARTS]); addMark(w, target, { kind: 'scar', text: `an assassin's cut to the ${ow?.side === 'left' ? 'right' : 'left'} ${part}`, place: where, part, side: ow?.side === 'left' ? 'right' : 'left' }); }
  if (foiled && outcome === 'none') addMark(w, target, { kind: 'feat', text: `lived through an attempt on their life`, place: where });
  return told(kind === 'scandal' || kind === 'bribe' ? 'the Spymaster' : 'the captain of the guard', lines);
}

/** A price collected or a hunter beaten off, as told by someone who saw it. */
export function bountyAccount(w: World, r: Rng, o: { hunter: string; hunterShort?: string; hunterC?: Character; style?: string; kit?: string; target: string; targetShort?: string; targetC?: Character; where: string; outcome: 'taken' | 'killed' | 'escaped' | 'hunterDown' | 'hunterDead'; poster: string }): Account {
  const lines: string[] = [];
  // Full names once; after that, the way people at the bar would say them.
  let H = o.hunter, T = o.target;
  const shorten = () => { H = o.hunterShort ?? o.hunter; T = o.targetShort ?? o.target; };
  const ow = o.targetC ? oldWound(o.targetC) : undefined;
  lines.push(r.pick([
    `${H} had been on ${T}'s trail for weeks, ${o.where}.`,
    `${T} was ${o.where} when ${H} found them.`,
    `${H} sat two tables away from ${T} for most of a night before doing anything.`,
    `Word on the board was that ${T} had gone to ground. ${H} found the ground.`,
  ]));
  shorten();
  if (o.kit && r.chance(0.6)) lines.push(`${H} came with ${o.kit}.`);
  if (o.style === 'showman' && r.chance(0.7)) lines.push(`${H} wanted it seen, and chose a crowded concourse for it.`);
  if (o.style === 'patient' && r.chance(0.7)) lines.push(`${H} waited out three good chances for the one that could not go wrong.`);
  if (ow && r.chance(0.6)) lines.push(`${H} went for the side ${T} still favours, the old ${ow.part}.`);
  if (o.targetC && o.targetC.stats.reflexes >= 14 && r.chance(0.5)) lines.push(`${T} saw it coming a heartbeat early. It nearly mattered.`);
  const end: Record<typeof o.outcome, string[]> = {
    taken: [`${T} went down hard and woke up in restraints.`, `It was over before the dock crew looked up. ${T} was in the hold by the change of shift.`, `${H} talked ${T} out of a fight nobody would have won, and walked them to the ship.`],
    killed: [`${T} drew. That was the last thing ${T} did.`, `${H} did not give ${T} the chance to surrender, and did not pretend to.`, `One shot, from further away than anyone thought possible.`],
    escaped: [`${T} went out through a maintenance shaft and was three decks down before ${H} reached it.`, `${T} had a friend on the docks. The ship was gone when ${H} got there.`],
    hunterDown: [`${T} put ${H} on the floor and walked away.`, `${H} misjudged the room. ${T}'s people were in it.`],
    hunterDead: [`${H} was found the next morning. ${T} was not.`, `${T} had been waiting for a hunter for a long time, and was ready.`],
  };
  lines.push(r.pick(end[o.outcome]));
  if (o.outcome === 'taken' || o.outcome === 'killed') lines.push(`The brokers paid out for ${o.poster} the same day.`);
  if (o.targetC && o.outcome === 'hunterDown') addMark(w, o.targetC, { kind: 'feat', text: `beat off a hunter`, place: o.where });
  if (o.hunterC && o.outcome === 'hunterDown') addMark(w, o.hunterC, { kind: 'wound', text: `beaten off by ${T}`, place: o.where });
  return told(r.pick(['a dock hand who saw it', 'a broker of the Ghost Ledger', 'someone at the next table', 'the hunter, over a drink']), lines);
}
