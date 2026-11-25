// Proving grounds: the rites outside the Crucible where reputations are made young. A tourney the
// Highroy calls for the house; challenges between people who cannot stand each other, allowed or
// forbidden; pit nights another house invites us to. Less sanctioned than the Crucible, and closer to home.
import { Rng } from './rng';
import { displayName, shortName } from './names';
import { ageOf } from './characters';
import { SPECIES } from '../data/species';
import { econ, record } from './economy';
import { logRecord } from './records';
import { isAway } from './court';
import { shiftMood } from './mood';
import { shiftRelation } from './relations';
import { barsOf, bondOf, opinion, setBond, shiftOpinion } from './relationships';
import { kill } from './death';
import { lastingWound, seasoned } from './ladder';
import { combatant, duelAccount } from './details';
import { addGlory } from './ambitions';
import { award, tally } from './careers';
import { absoluteCycle, addCycles, CYCLES_PER_ORBIT, CYCLES_PER_PHASE, dateParts, type GameDate } from './time';
import type { Character, World } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface Bout { a: string; b: string; winner: string; hurt?: string; killed?: string; account?: import('./details').Account }
export interface TourneyResult { year: number; date: GameDate; rounds: Bout[][]; champion: string }
export interface Challenge { id: string; challenger: string; challenged: string; cause: string; expires: GameDate; foreign?: boolean }

export interface GroundsState {
  tourneys: TourneyResult[];
  challenges: Challenge[];
  /** The fight circuit across the Reaches: underground pits, tourneys, pit nights. */
  circuit: import('./circuit').CircuitEvent[];
  /** The Highroy forbids the house's people the underground pits. */
  pitsForbidden?: boolean;
  /** When we last hosted a tourney for the circuit. */
  hosted?: GameDate;
  duels: { date: GameDate; bout: Bout; cause: string; sanctioned: boolean }[];
  /** Finals lost, loser>winner → times. */
  finals?: Record<string, number>;
  /** When someone last threw down a challenge, so grudges do not boil every Phase. */
  lastChallenge?: Record<string, GameDate>;
}

export function ensureGrounds(world: World): void {
  world.grounds ??= { tourneys: [], challenges: [], circuit: [], duels: [] };
  world.grounds.lastChallenge ??= {};
  world.grounds.circuit ??= [];
  const old = world.grounds as unknown as { invites?: unknown; pitNights?: unknown };
  delete old.invites; delete old.pitNights;
}

/** Skill with a blade in a ring. */
export function fightScore(c: Character): number {
  return (c.stats.duelling * 2 + c.stats.agility + c.stats.reflexes + c.stats.valor) / 5;
}

/** Old enough to fight in the rites: younglings near adulthood may, if someone lets them. */
export function oldEnough(world: World, c: Character): boolean {
  return ageOf(c, world.date) >= SPECIES[c.species].adulthood * 0.75;
}

export function fighters(world: World, houseId: string): Character[] {
  return Object.values(world.characters).filter((c) => c.alive && c.houseId === houseId && c.tier === 'full' && c.seat !== 'highroy'
    && oldEnough(world, c) && !isAway(world, c.id) && !c.flags.some((f) => f.id === 'wounded' || f.id === 'ill'));
}

/** Of the military: knights, the champion and Grand Master, ship captains, base commanders, those of arms by trade. */
export function isMilitary(world: World, c: Character): boolean {
  if (c.flags.some((f) => f.id === 'retired')) return false;
  if (c.seat === 'champion' || c.seat === 'grandMaster') return true;
  if (c.flags.some((f) => f.id === 'knighted') || /knight|soldier|sergeant|marshal|captain|commander|guard|warden/i.test(c.role)) return true;
  if (Object.values(world.fleet?.ships ?? {}).some((s) => s.captainId === c.id && !s.lost)) return true;
  if (Object.values(world.holdings?.modules ?? {}).some((m) => m.kind === 'base' && m.overseerId === c.id)) return true;
  return false;
}

/** One bout. Blunted weapons hurt less; real ones kill. */
function bout(w: World, rng: Rng, a: Character, b: Character, hurt: number, death: number, place: string): Bout {
  const ra = fightScore(a) + rng.gauss() * 2.5;
  const rb = fightScore(b) + rng.gauss() * 2.5;
  const win = ra >= rb ? a : b;
  const lose = win === a ? b : a;
  const out: Bout = { a: a.id, b: b.id, winner: win.id };
  const roll = rng.next();
  let lasting: string | null = null;
  if (roll < death) { kill(w, lose, w.date, `killed by ${displayName(win.name)} ${place}`); out.killed = lose.id; }
  else if (roll < hurt) { lose.flags.push({ id: 'wounded', since: w.date, until: addCycles(w.date, CYCLES_PER_PHASE * 2), detail: place }); out.hurt = lose.id; if (hurt >= 0.2) lasting = lastingWound(w, rng, lose.id, place); }
  // Someone saw it, and will tell it: the marks it leaves are written as they tell it.
  const blunt = hurt < 0.1;
  out.account = duelAccount(w, rng, combatant(a, fightScore(a)), combatant(b, fightScore(b)), { winner: win === a ? 'a' : 'b', hurt: !!out.hurt, killed: !!out.killed, lasting },
    { place, blunt, witness: blunt ? 'a squire at the rail' : rng.pick(['the yard-master', 'a herald of the house', 'a soldier who held the ring', 'one of the seconds']) });
  seasoned(w, rng, win.id, true);
  if (!out.killed) seasoned(w, rng, lose.id, false);
  // An upset stings.
  if (fightScore(lose) > fightScore(win) + 2) shiftOpinion(w, lose.id, win.id, -6, `beat them ${place}`);
  else shiftOpinion(w, lose.id, win.id, 2, `a fair bout ${place}`);
  return out;
}

// ---------------------------------------------------------------- the house tourney

export const TOURNEY_COST = 1500;

export function cannotCallTourney(world: World): string | null {
  ensureGrounds(world);
  const year = dateParts(world.date).year;
  if (world.grounds.tourneys.some((t) => t.year === year)) return 'One tourney a year';
  if (fighters(world, world.playerHouseId).length < 4) return 'Not enough fighters at court';
  if (econ(world, world.playerHouseId).stock.othes < TOURNEY_COST) return `Needs ${TOURNEY_COST} othes`;
  return null;
}

/** The Highroy calls a tourney: the house's best, and anyone young enough to be foolish, in a bracket of eight. */
export function callTourney(input: World): World {
  const w = structuredClone(input);
  ensureGrounds(w);
  const why = cannotCallTourney(w);
  if (why) throw new Error(why);
  const P = w.playerHouseId;
  const rng = new Rng(w.rng);
  record(w, P, { resource: 'othes', amount: -TOURNEY_COST, label: 'A tourney for the house', kind: 'court' });
  const pool = fighters(w, P).sort((a, b) => fightScore(b) - fightScore(a));
  // The best six, and two who simply want it: the young and the ambitious.
  const field = pool.slice(0, 6);
  const keen = pool.slice(6).sort((a, b) => (b.hidden.ambition + (ageOf(b, w.date) < SPECIES[b.species].adulthood ? 6 : 0)) - (a.hidden.ambition + (ageOf(a, w.date) < SPECIES[a.species].adulthood ? 6 : 0)));
  field.push(...keen.slice(0, 8 - field.length));
  let round = rng.shuffle(field.map((c) => c.id));
  const rounds: Bout[][] = [];
  while (round.length > 1) {
    const bouts: Bout[] = [];
    const next: string[] = [];
    for (let i = 0; i + 1 < round.length; i += 2) {
      const b = bout(w, rng, w.characters[round[i]!]!, w.characters[round[i + 1]!]!, 0.08, 0.003, 'at the house tourney');
      bouts.push(b);
      tally(w, b.a, 'bouts'); tally(w, b.b, 'bouts'); tally(w, b.winner, 'boutsWon');
      next.push(b.winner);
    }
    if (round.length % 2) next.push(round[round.length - 1]!);
    rounds.push(bouts);
    round = next;
  }
  const champ = w.characters[round[0]!]!;
  const fin = rounds[rounds.length - 1]?.[0];
  if (fin) noteFinal(w, fin.winner === fin.a ? fin.b : fin.a, fin.winner);
  const year = dateParts(w.date).year;
  award(w, champ.id, `Tourney champion, ${year}`);
  addGlory(w, champ.id, 2);
  shiftMood(champ, 8);
  // A young one who goes deep is the talk of the court.
  const young = field.filter((c) => ageOf(c, w.date) < SPECIES[c.species].adulthood);
  const deep = young.filter((c) => rounds.slice(1).some((r) => r.some((b) => b.a === c.id || b.b === c.id)));
  for (const c of deep) addGlory(w, c.id, 1);
  for (const c of Object.values(w.characters)) if (c.alive && c.houseId === P && c.tier === 'full' && !isAway(w, c.id)) shiftMood(c, 2);
  const st = w.houses[P]!.standing;
  st.respect = clamp(st.respect + 1, 0, 100);
  w.grounds.tourneys.push({ year, date: w.date, rounds, champion: champ.id });
  const N = (id: string) => shortName(w.characters[id]!.name);
  logRecord(w, {
    kind: 'world', type: 'fight', severity: 2,
    text: `The house tourney of ${year}: ${displayName(champ.name)} takes it${rounds.length ? `, beating ${N(rounds[rounds.length - 1]![0]!.a === champ.id ? rounds[rounds.length - 1]![0]!.b : rounds[rounds.length - 1]![0]!.a)} in the final` : ''}.${deep.filter((c) => c.id !== champ.id).length ? ` ${deep.filter((c) => c.id !== champ.id).map((c) => shortName(c.name)).join(' and ')}, still young, went further than anyone expected.` : ''}${deep.some((c) => c.id === champ.id) ? ' And they are not yet of age.' : ''}`,
    detail: rounds.map((r, i) => `${['First round', 'Semi-finals', 'Final'][i + 3 - rounds.length] ?? `Round ${i + 1}`}: ${r.map((b) => `${N(b.winner)} beat ${N(b.winner === b.a ? b.b : b.a)}${b.hurt ? ' (hurt)' : ''}${b.killed ? ' (killed)' : ''}`).join('; ')}`).join('\n'),
    who: [{ id: champ.id, part: 'tourney champion' }, ...deep.filter((c) => c.id !== champ.id).map((c) => ({ id: c.id, part: 'went deep' }))],
    account: fin?.account ? { by: fin.account.by, lines: [`The final.`, ...fin.account.lines] } : undefined,
  });
  w.rng = rng.state;
  return w;
}

// ---------------------------------------------------------------- challenges

/** Pride stung by someone: for a while, a soldier will call them out without any older quarrel. */
export function sting(world: World, id: string, by: string, why: string): void {
  const c = world.characters[id];
  if (!c?.alive || id === by) return;
  c.flags = c.flags.filter((f) => f.id !== 'stung');
  c.flags.push({ id: 'stung', since: world.date, until: addCycles(world.date, CYCLES_PER_PHASE * 6), detail: by, note: why } as never);
}
export function stungBy(c: Character): string | undefined {
  return c.flags.find((f) => f.id === 'stung')?.detail;
}

/** Rivalries are made in moments: the same final lost twice, a place given to another, blame after a disaster. */
export function rivalsFrom(world: World, a: string, b: string, why: string, severity: 1 | 2 = 1): void {
  if (a === b || !world.characters[a]?.alive || !world.characters[b]?.alive) return;
  const bond = bondOf(world, a, b);
  if (bond === 'rival' || bond === 'feud' || bond === 'spouse' || bond === 'lover') return;
  setBond(world, a, b, 'rival', 'rival', why);
  shiftOpinion(world, a, b, -15, why);
  const P = world.playerHouseId;
  if (world.characters[a]!.houseId === P || world.characters[b]!.houseId === P)
    logRecord(world, { kind: 'intrigue', type: 'intrigue', severity, seat: 'champion', text: `${displayName(world.characters[a]!.name)} and ${displayName(world.characters[b]!.name)} are rivals now: ${why}.`, who: [{ id: a, part: 'rival' }, { id: b, part: 'rival' }] });
}

/** A final lost to the same person twice is personal. */
export function noteFinal(world: World, loser: string, winner: string): void {
  ensureGrounds(world);
  const k = `${loser}>${winner}`;
  const f = (world.grounds.finals ??= {});
  f[k] = (f[k] ?? 0) + 1;
  if (f[k] === 2) rivalsFrom(world, loser, winner, 'lost two finals to them');
  sting(world, loser, winner, 'lost a final to them');
}

/**
 * Who might throw down a challenge: the military only. Our soldiers against each other, or against
 * another house's soldiers they have a rivalry with (often made on the circuit), fought on neutral ground.
 */
function grudges(world: World): [Character, Character, string, boolean][] {
  const P = world.playerHouseId;
  const here = Object.values(world.characters).filter((c) => c.alive && c.houseId === P && c.tier === 'full' && !isAway(world, c.id) && oldEnough(world, c) && c.seat !== 'highroy' && isMilitary(world, c));
  const out: [Character, Character, string, boolean][] = [];
  for (const a of here) {
    const foreign = [...new Set([...Object.keys(world.ties?.[a.id] ?? {}), ...(stungBy(a) ? [stungBy(a)!] : [])])].map((id) => world.characters[id]).filter((b): b is Character => !!b?.alive && b.houseId !== P && !!world.houses[b.houseId] && !isAway(world, b.id) && isMilitary(world, b));
    for (const b of [...here, ...foreign]) {
      if (a.id === b.id || b.seat === 'highroy') continue;
      if (b.houseId !== P && bondOf(world, a.id, b.id) !== 'rival' && bondOf(world, a.id, b.id) !== 'feud' && stungBy(a) !== b.id) continue;
      const bond = bondOf(world, a.id, b.id);
      const o = opinion(world, a.id, b.id);
      const cause = bond === 'feud' ? 'an old feud' : bond === 'rival' ? 'their rivalry' : stungBy(a) === b.id ? 'wounded pride' : barsOf(world, a.id, b.id).dislike >= 75 ? 'pure hatred' : o <= -55 ? 'an insult that will not be let go' : '';
      if (cause) out.push([a, b, cause, b.houseId !== P]);
    }
  }
  return out;
}

export function advanceGrounds(world: World, rng: Rng, phaseTurned: boolean): void {
  ensureGrounds(world);
  const g = world.grounds;
  const now = absoluteCycle(world.date);
  // Lapsed challenges: half the time they fight anyway, without leave.
  for (const c of g.challenges.filter((x) => absoluteCycle(x.expires) <= now)) {
    const a = world.characters[c.challenger];
    const b = world.characters[c.challenged];
    if (a?.alive && b?.alive && !isAway(world, a.id) && !isAway(world, b.id) && rng.chance(0.5)) fightChallenge(world, rng, c, false);
  }
  g.challenges = g.challenges.filter((x) => absoluteCycle(x.expires) > now);
  if (phaseTurned && !g.challenges.length) {
    for (const [a, b, cause, foreign] of rng.shuffle(grudges(world))) {
      const last = g.lastChallenge?.[a.id];
      if (last && now - absoluteCycle(last) < CYCLES_PER_ORBIT * 2) continue;
      // Fire in the blood: the proud and the bold throw down first.
      const heat = (a.stats.valor + a.hidden.ambition) / 40 + (cause === 'an old feud' ? 0.15 : 0) + (cause === 'wounded pride' ? 0.2 : 0) + (cause === 'pure hatred' ? 0.25 : 0);
      if (!rng.chance(0.045 * heat)) continue;
      g.challenges.push({ id: `ch${world.nextId++}`, challenger: a.id, challenged: b.id, cause, foreign, expires: addCycles(world.date, CYCLES_PER_PHASE) });
      g.lastChallenge![a.id] = world.date;
      if (world.ports) world.ports.alerts += 1;
      logRecord(world, { kind: 'intrigue', type: 'intrigue', severity: 2, text: `${displayName(a.name)} has challenged ${displayName(b.name)}${foreign ? ` of House ${world.houses[b.houseId]!.name}` : ''} over ${cause}. The Highroy may allow it or forbid it.`, who: [{ id: a.id, part: 'challenger' }, { id: b.id, part: 'challenged' }] });
      break;
    }
  }
}

function fightChallenge(w: World, rng: Rng, c: Challenge, sanctioned: boolean): Bout {
  const a = w.characters[c.challenger]!;
  const b = w.characters[c.challenged]!;
  const out = bout(w, rng, a, b, 0.3, 0.03, sanctioned ? 'in a duel the Highroy allowed' : 'in a duel fought without leave');
  tally(w, a.id, 'duels'); tally(w, b.id, 'duels'); tally(w, out.winner, 'duelsWon');
  addGlory(w, out.winner, 1);
  const win = w.characters[out.winner]!;
  const lose = out.winner === a.id ? b : a;
  // The quarrel is settled one way or another: a grudging respect, or a feud for life.
  if (out.killed) {
    setBond(w, lose.id, win.id, 'feud', 'feud', 'a duel that ended in a death');
  } else if (rng.chance(0.35) && bondOf(w, a.id, b.id) === 'rival') {
    setBond(w, a.id, b.id, undefined, undefined, 'settled it with steel');
    shiftOpinion(w, lose.id, win.id, 15, 'settled it with steel');
  }
  if (c.foreign && w.houses[lose.houseId] && lose.houseId !== win.houseId) shiftRelation(w, lose.houseId, win.houseId, out.killed ? -8 : -2);
  const P = w.playerHouseId;
  if (!sanctioned) { const st = w.houses[P]!.standing; st.honour = clamp(st.honour - 1, 0, 100); }
  w.grounds.duels.push({ date: w.date, bout: out, cause: c.cause, sanctioned });
  logRecord(w, {
    kind: 'world', type: 'fight', severity: 2,
    text: `${displayName(win.name)} beats ${displayName(lose.name)} in a duel over ${c.cause}${sanctioned ? '' : ', fought without the Highroy\'s leave'}.${out.killed ? ` ${shortName(lose.name)} is dead.` : out.hurt ? ` ${shortName(lose.name)} is hurt.` : ' First blood, and no worse.'}`,
    who: [{ id: win.id, part: 'won' }, { id: lose.id, part: out.killed ? 'killed' : 'lost' }],
    effects: sanctioned ? [] : ['Honour −1'],
    account: out.account,
  });
  return out;
}

export function answerChallenge(input: World, id: string, allow: boolean): World {
  const w = structuredClone(input);
  ensureGrounds(w);
  const c = w.grounds.challenges.find((x) => x.id === id);
  if (!c) throw new Error('That quarrel has passed');
  w.grounds.challenges = w.grounds.challenges.filter((x) => x.id !== id);
  const a = w.characters[c.challenger];
  const b = w.characters[c.challenged];
  if (!a?.alive || !b?.alive) return w;
  const rng = new Rng(w.rng);
  if (allow) fightChallenge(w, rng, c, true);
  else {
    shiftMood(a, -4);
    const lord = Object.values(w.characters).find((x) => x.alive && x.houseId === w.playerHouseId && x.seat === 'highroy');
    if (lord) shiftOpinion(w, a.id, lord.id, -5, 'forbade their duel');
    logRecord(w, { kind: 'intrigue', type: 'intrigue', severity: 1, text: `The Highroy forbids ${shortName(a.name)}'s duel with ${shortName(b.name)}. The quarrel goes back under the surface.`, who: [{ id: a.id, part: 'forbidden' }] });
  }
  w.rng = rng.state;
  return w;
}

