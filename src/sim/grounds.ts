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
import { shiftRelation, relation } from './relations';
import { bondOf, opinion, setBond, shiftOpinion } from './relationships';
import { ambassadorsAt } from './embassies';
import { kill } from './death';
import { addGlory } from './ambitions';
import { award, tally } from './careers';
import { absoluteCycle, addCycles, CYCLES_PER_ORBIT, CYCLES_PER_PHASE, dateParts, type GameDate } from './time';
import type { Character, World } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface Bout { a: string; b: string; winner: string; hurt?: string; killed?: string }
export interface TourneyResult { year: number; date: GameDate; rounds: Bout[][]; champion: string }
export interface Challenge { id: string; challenger: string; challenged: string; cause: string; expires: GameDate; foreign?: boolean }
export interface PitInvite { id: string; host: string; expires: GameDate }
export interface PitNight { date: GameDate; host: string; bouts: Bout[] }

export interface GroundsState {
  tourneys: TourneyResult[];
  challenges: Challenge[];
  invites: PitInvite[];
  pitNights: PitNight[];
  duels: { date: GameDate; bout: Bout; cause: string; sanctioned: boolean }[];
  /** When someone last threw down a challenge, so grudges do not boil every Phase. */
  lastChallenge?: Record<string, GameDate>;
}

export function ensureGrounds(world: World): void {
  world.grounds ??= { tourneys: [], challenges: [], invites: [], pitNights: [], duels: [] };
  world.grounds.lastChallenge ??= {};
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

/** One bout. Blunted weapons hurt less; real ones kill. */
function bout(w: World, rng: Rng, a: Character, b: Character, hurt: number, death: number, place: string): Bout {
  const ra = fightScore(a) + rng.gauss() * 2.5;
  const rb = fightScore(b) + rng.gauss() * 2.5;
  const win = ra >= rb ? a : b;
  const lose = win === a ? b : a;
  const out: Bout = { a: a.id, b: b.id, winner: win.id };
  const roll = rng.next();
  if (roll < death) { kill(w, lose, w.date, `killed by ${displayName(win.name)} ${place}`); out.killed = lose.id; }
  else if (roll < hurt) { lose.flags.push({ id: 'wounded', since: w.date, until: addCycles(w.date, CYCLES_PER_PHASE * 2), detail: place }); out.hurt = lose.id; }
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
  });
  w.rng = rng.state;
  return w;
}

// ---------------------------------------------------------------- challenges

/** Who might throw down a challenge: rivals at the same court, ours and the ambassadors among us. */
function grudges(world: World): [Character, Character, string, boolean][] {
  const P = world.playerHouseId;
  const here = Object.values(world.characters).filter((c) => c.alive && c.houseId === P && c.tier === 'full' && !isAway(world, c.id) && oldEnough(world, c) && c.seat !== 'highroy');
  const guests = ambassadorsAt(world, P);
  const out: [Character, Character, string, boolean][] = [];
  for (const a of here) {
    for (const b of [...here, ...guests]) {
      if (a.id === b.id || b.seat === 'highroy') continue;
      const bond = bondOf(world, a.id, b.id);
      const o = opinion(world, a.id, b.id);
      const cause = bond === 'feud' ? 'an old feud' : bond === 'rival' ? 'their rivalry' : o <= -55 ? 'an insult that will not be let go' : '';
      if (cause) out.push([a, b, cause, b.houseId !== P]);
    }
  }
  return out;
}

export function advanceGrounds(world: World, rng: Rng, phaseTurned: boolean, orbitTurned: boolean): void {
  ensureGrounds(world);
  const g = world.grounds;
  const now = absoluteCycle(world.date);
  const P = world.playerHouseId;
  // Lapsed challenges: half the time they fight anyway, without leave.
  for (const c of g.challenges.filter((x) => absoluteCycle(x.expires) <= now)) {
    const a = world.characters[c.challenger];
    const b = world.characters[c.challenged];
    if (a?.alive && b?.alive && !isAway(world, a.id) && !isAway(world, b.id) && rng.chance(0.5)) fightChallenge(world, rng, c, false);
  }
  g.challenges = g.challenges.filter((x) => absoluteCycle(x.expires) > now);
  g.invites = g.invites.filter((x) => absoluteCycle(x.expires) > now);
  if (phaseTurned && !g.challenges.length) {
    for (const [a, b, cause, foreign] of rng.shuffle(grudges(world))) {
      const last = g.lastChallenge?.[a.id];
      if (last && now - absoluteCycle(last) < CYCLES_PER_ORBIT * 2) continue;
      // Fire in the blood: the proud and the bold throw down first.
      const heat = (a.stats.valor + a.hidden.ambition) / 40 + (cause === 'an old feud' ? 0.15 : 0);
      if (!rng.chance(0.07 * heat)) continue;
      g.challenges.push({ id: `ch${world.nextId++}`, challenger: a.id, challenged: b.id, cause, foreign, expires: addCycles(world.date, CYCLES_PER_PHASE) });
      g.lastChallenge![a.id] = world.date;
      if (world.ports) world.ports.alerts += 1;
      logRecord(world, { kind: 'intrigue', type: 'intrigue', severity: 2, text: `${displayName(a.name)} has challenged ${displayName(b.name)}${foreign ? ` of House ${world.houses[b.houseId]!.name}` : ''} over ${cause}. The Highroy may allow it or forbid it.`, who: [{ id: a.id, part: 'challenger' }, { id: b.id, part: 'challenged' }] });
      break;
    }
  }
  // Another house's pit night.
  if (orbitTurned && !g.invites.length && rng.chance(0.3)) {
    const hosts = Object.keys(world.houses).filter((h) => h !== P && relation(world, P, h) > -60 && fighters(world, h).length >= 3);
    if (hosts.length) {
      const host = rng.pick(hosts);
      g.invites.push({ id: `pn${world.nextId++}`, host, expires: addCycles(world.date, CYCLES_PER_ORBIT / 2) });
      if (world.ports) world.ports.alerts += 1;
      logRecord(world, { kind: 'world', type: 'politics', severity: 1, text: `House ${world.houses[host]!.name} invites us to a pit night: three of ours against three of theirs, in their undercity, for the crowd and the name.`, houseIds: [host] });
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

// ---------------------------------------------------------------- pit nights

export const PIT_SIDE = 3;

export function cannotSendToPits(world: World, inviteId: string, ids: string[]): string | null {
  const inv = world.grounds?.invites.find((x) => x.id === inviteId);
  if (!inv) return 'The invitation has lapsed';
  if (ids.length < 1 || ids.length > PIT_SIDE) return `Send one to ${PIT_SIDE}`;
  const ok = new Set(fighters(world, world.playerHouseId).map((c) => c.id));
  if (ids.some((id) => !ok.has(id))) return 'Someone named cannot fight';
  return null;
}

export function answerPitNight(input: World, inviteId: string, ids: string[] | null): World {
  const w = structuredClone(input);
  ensureGrounds(w);
  const inv = w.grounds.invites.find((x) => x.id === inviteId);
  if (!inv) throw new Error('The invitation has lapsed');
  const P = w.playerHouseId;
  if (!ids) {
    w.grounds.invites = w.grounds.invites.filter((x) => x.id !== inviteId);
    shiftRelation(w, P, inv.host, -1);
    logRecord(w, { kind: 'world', type: 'politics', severity: 0, text: `We decline House ${w.houses[inv.host]!.name}'s pit night. They will say we were afraid.`, houseIds: [inv.host] });
    return w;
  }
  const why = cannotSendToPits(w, inviteId, ids);
  if (why) throw new Error(why);
  w.grounds.invites = w.grounds.invites.filter((x) => x.id !== inviteId);
  const rng = new Rng(w.rng);
  const theirs = fighters(w, inv.host).sort((a, b) => fightScore(b) - fightScore(a)).slice(0, PIT_SIDE);
  const ours = ids.map((id) => w.characters[id]!);
  const bouts: Bout[] = [];
  let won = 0;
  for (let i = 0; i < ours.length; i++) {
    const foe = theirs[i] ?? theirs[0]!;
    const b = bout(w, rng, ours[i]!, foe, 0.15, 0.01, `in House ${w.houses[inv.host]!.name}'s pits`);
    bouts.push(b);
    tally(w, b.a, 'bouts'); tally(w, b.b, 'bouts'); tally(w, b.winner, 'boutsWon');
    if (b.winner === ours[i]!.id) { won++; addGlory(w, ours[i]!.id, 1); }
  }
  const lost = ours.length - won;
  const st = w.houses[P]!.standing;
  st.respect = clamp(st.respect + (won > lost ? 2 : won < lost ? -1 : 0), 0, 100);
  shiftRelation(w, P, inv.host, bouts.some((b) => b.killed) ? -4 : 1);
  w.grounds.pitNights.push({ date: w.date, host: inv.host, bouts });
  const N = (id: string) => shortName(w.characters[id]!.name);
  const young = ours.filter((c) => ageOf(c, w.date) < SPECIES[c.species].adulthood);
  logRecord(w, {
    kind: 'world', type: 'fight', severity: 2,
    text: `Pit night in House ${w.houses[inv.host]!.name}'s undercity: we win ${won} of ${ours.length}.${young.length ? ` ${young.map((c) => shortName(c.name)).join(' and ')} fought though not yet of age.` : ''}`,
    detail: bouts.map((b) => `${N(b.winner)} beat ${N(b.winner === b.a ? b.b : b.a)}${b.hurt ? ' (hurt)' : ''}${b.killed ? ' (killed)' : ''}`).join('\n'),
    who: ours.map((c) => ({ id: c.id, part: bouts.find((b) => b.a === c.id)?.winner === c.id ? 'won' : 'lost' })),
    houseIds: [inv.host],
  });
  w.rng = rng.state;
  return w;
}
