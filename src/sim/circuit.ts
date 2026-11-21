// The circuit: fights all across the Reaches, whether or not the house is watching. Underground pits
// in the undercities (legal, but rubbing shoulders with slave fighters, Caige traders and smugglers),
// public tourneys any house may hold, invitational tourneys and house-to-house pit nights for invitees only.
// People go on their own when their blood is up; the Highroy can send them to the events that allow it,
// and host one. What happens comes home with whoever of ours was there, or as rumour if it was big
// enough and someone was listening. The rest the house never hears.
import { Rng } from './rng';
import { displayName, shortName } from './names';
import { econ, record } from './economy';
import { logRecord } from './records';
import { shiftMood } from './mood';
import { shiftRelation } from './relations';
import { bondOf, opinion, setBond, shiftOpinion, tieOf } from './relationships';
import { kill } from './death';
import { addGlory, willOf } from './ambitions';
import { award, tally, titlesOf } from './careers';
import { listeningOn } from './holdings';
import { noticeYouth } from './prospects';
import { ensureGrounds, fighters, fightScore, isMilitary } from './grounds';
import { lastingWound, seasoned } from './ladder';
import { absoluteCycle, addCycles, CYCLES_PER_ORBIT, CYCLES_PER_PHASE, dateParts, type GameDate } from './time';
import type { Character, World } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export type CircuitKind = 'underground' | 'public' | 'invitational' | 'pitnight';
export const KIND_LABEL: Record<CircuitKind, string> = { underground: 'Underground pits', public: 'Public tourney', invitational: 'Invitational tourney', pitnight: 'Pit night' };

/** Someone on the card: one of the houses' people (id), or a local fighter (name only). */
export interface Entrant { id?: string; name: string; houseId?: string; skill: number; sent?: boolean }
export interface CBout { a: string; b: string; winner: string; hurt?: string; killed?: string }

export interface CircuitEvent {
  id: string;
  kind: CircuitKind;
  name: string;
  host?: string;
  planetId: string;
  sectorId: string;
  announced: GameDate;
  held: GameDate;
  /** For invitationals and pit nights: the houses asked. */
  invited?: string[];
  /** What else goes on around an underground card. */
  shady?: string;
  purse: number;
  entrants: Entrant[];
  bouts?: CBout[];
  /** The tourney winner, or the pit night's winning house. */
  winner?: string;
  done?: boolean;
  /** Whether word of it reached us. */
  heard?: boolean;
}

const VENUES = ['the Kessar Pits', 'the Drowned Ring', 'the Chain Yard', 'the Hollow Market pits', 'the Ash Cellar', 'the Rust Bowl', 'the Undertow', 'the Salt Pit', 'the Lantern Hole', 'the Furnace Ring'];
const SHADY = ['slave fighters on the undercard', 'Caige traders working the crowd', 'smugglers running the book', 'a flesh-broker buying the losers\' debts'];
const LOCALS = ['Grisk', 'Mott', 'the Ferryman', 'Vela Two-Knives', 'Old Harrow', 'Pell', 'Skarn', 'the Widow', 'Dace', 'Ruun', 'Kettle', 'Ivo Brand', 'Shard', 'Marrow', 'Tilde', 'Bask', 'the Quiet One', 'Jory', 'Hessa', 'Lark'];

export const LOCAL = '~';
export const isLocal = (x: string) => x.startsWith(LOCAL);
export const entrantName = (world: World, x: string) => (isLocal(x) ? x.slice(1) : world.characters[x] ? displayName(world.characters[x]!.name) : x);

function capitalOf(world: World, h: string): { planetId: string; sectorId: string } | undefined {
  const p = world.planets[world.houses[h]?.capitalPlanetId ?? ''] ?? Object.values(world.planets).find((x) => x.houseId === h);
  return p ? { planetId: p.id, sectorId: p.sectors[0]!.id } : undefined;
}

/** Whether we would know this event is happening. */
export function weKnow(world: World, e: CircuitEvent): boolean {
  const P = world.playerHouseId;
  if (e.kind === 'public' || e.host === P || e.invited?.includes(P)) return true;
  if (e.entrants.some((x) => x.houseId === P)) return true;
  return world.planets[e.planetId]?.houseId === P || !!listeningOn(world, P, e.planetId);
}

/** The circuit as the house sees it: what is coming that we know of, and what we heard. */
export function knownEvents(world: World): CircuitEvent[] {
  return (world.grounds?.circuit ?? []).filter((e) => (e.done ? e.heard : weKnow(world, e)));
}

// ---------------------------------------------------------------- scheduling

function schedule(world: World, rng: Rng, kind: CircuitKind, host?: string, invited?: string[], at?: { planetId: string; sectorId: string }): CircuitEvent | undefined {
  ensureGrounds(world);
  let place = at;
  if (!place && host) place = capitalOf(world, host);
  if (!place) { const p = rng.pick(Object.values(world.planets)); place = { planetId: p.id, sectorId: rng.pick(p.sectors).id }; }
  const sector = world.planets[place.planetId]?.sectors.find((s) => s.id === place!.sectorId);
  const hostName = host ? world.houses[host]?.name : undefined;
  const name = kind === 'underground' ? `${rng.pick(VENUES)}, ${sector?.name ?? world.planets[place.planetId]!.name}`
    : kind === 'public' ? `the ${hostName} Open at ${sector?.name ?? 'their capital'}`
    : kind === 'invitational' ? `the ${hostName} Invitational`
    : `House ${hostName}'s pit night`;
  const phases = kind === 'underground' ? 1 + Math.floor(rng.next() * 4) : 2 + Math.floor(rng.next() * 3);
  const e: CircuitEvent = {
    id: `cv${world.nextId++}`, kind, name, host, planetId: place.planetId, sectorId: place.sectorId, announced: world.date,
    held: addCycles(world.date, CYCLES_PER_PHASE * phases), invited,
    shady: kind === 'underground' && rng.chance(0.45) ? rng.pick(SHADY) : undefined,
    purse: kind === 'underground' ? 300 + Math.round(rng.next() * 1200) : kind === 'public' ? 2000 + Math.round(rng.next() * 3000) : kind === 'invitational' ? 3000 + Math.round(rng.next() * 2000) : 1500,
    entrants: [],
  };
  world.grounds.circuit.push(e);
  const P = world.playerHouseId;
  if (weKnow(world, e) && host !== P) {
    const invitedUs = invited?.includes(P);
    if (invitedUs && world.ports) world.ports.alerts += 1;
    logRecord(world, {
      kind: 'world', type: 'world', severity: invitedUs ? 2 : 0,
      text: kind === 'pitnight' ? `House ${hostName} invites us to a pit night: three of ours against three of theirs, for the crowd and the name.`
        : kind === 'invitational' ? `${cap(e.name)} is called for ${phases} Phases from now${invitedUs ? ', and we are invited' : ''}: ${invited!.map((h) => world.houses[h]?.name).join(', ')}. Purse ${fmt(e.purse)} othes.`
        : kind === 'public' ? `House ${hostName} holds a public tourney, ${e.name}. Anyone may enter. Purse ${fmt(e.purse)} othes.`
        : `Word of a card at ${e.name}${e.shady ? `, with ${e.shady}` : ''}.`,
      placeId: e.sectorId, houseIds: host ? [host] : [], source: kind === 'underground' ? 'the house\'s eyes' : 'heralds',
    });
  }
  return e;
}

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

// ---------------------------------------------------------------- who goes

/** Fighting in the blood: the ones who go looking for a fight on their own. */
function keen(world: World, c: Character): boolean {
  const amb = world.ambitions?.of[c.id]?.kind;
  return fightScore(c) >= 11 || amb === 'glory' || amb === 'knight' || c.traits.some((t) => t.id === 'duelistsCreed' || t.id === 'victorOf');
}

export const MAX_SENT = 3;

export function cannotEnter(world: World, eventId: string, ids: string[]): string | null {
  const e = world.grounds?.circuit.find((x) => x.id === eventId);
  const P = world.playerHouseId;
  if (!e || e.done) return 'It is over';
  if (e.kind === 'underground') return 'No one is sent to the pits: they go if they want to';
  if (e.host === P) return 'We are the hosts';
  if (e.kind !== 'public' && !e.invited?.includes(P)) return 'We are not invited';
  const ours = e.entrants.filter((x) => x.houseId === P).length;
  if (ids.length < 1 || ours + ids.length > MAX_SENT) return `At most ${MAX_SENT} of ours`;
  const ok = new Set(fighters(world, P).map((c) => c.id));
  if (ids.some((id) => !ok.has(id))) return 'Someone named cannot go';
  return null;
}

function goes(world: World, e: CircuitEvent, c: Character, sent: boolean) {
  e.entrants.push({ id: c.id, name: displayName(c.name), houseId: c.houseId, skill: fightScore(c), sent });
  c.flags = c.flags.filter((f) => f.id !== 'circuit');
  c.flags.push({ id: 'circuit', since: world.date, until: addCycles(e.held, CYCLES_PER_PHASE), detail: `at ${e.name}` });
}

export function enterCircuit(input: World, eventId: string, ids: string[]): World {
  const w = structuredClone(input);
  ensureGrounds(w);
  const why = cannotEnter(w, eventId, ids);
  if (why) throw new Error(why);
  const e = w.grounds.circuit.find((x) => x.id === eventId)!;
  for (const id of ids) goes(w, e, w.characters[id]!, true);
  return w;
}

export function declineCircuit(input: World, eventId: string): World {
  const w = structuredClone(input);
  ensureGrounds(w);
  const e = w.grounds.circuit.find((x) => x.id === eventId);
  if (!e) return w;
  const P = w.playerHouseId;
  e.invited = e.invited?.filter((h) => h !== P);
  if (e.host && w.houses[e.host]) shiftRelation(w, P, e.host, -1);
  return w;
}

export const HOST_COST = 3000;
export function cannotHost(world: World): string | null {
  ensureGrounds(world);
  const last = world.grounds.hosted;
  if (last && absoluteCycle(world.date) - absoluteCycle(last) < CYCLES_PER_ORBIT * 2) return 'We hosted not long ago';
  if (econ(world, world.playerHouseId).stock.othes < HOST_COST) return `Needs ${fmt(HOST_COST)} othes`;
  return null;
}

/** Host a tourney for the circuit: open to all, or for the houses we invite. Prestige, and a chance to show our people. */
export function hostTourney(input: World, kind: 'public' | 'invitational', invited: string[] = []): World {
  const w = structuredClone(input);
  ensureGrounds(w);
  const why = cannotHost(w);
  if (why) throw new Error(why);
  if (kind === 'invitational' && !invited.length) throw new Error('Invite someone');
  const P = w.playerHouseId;
  record(w, P, { resource: 'othes', amount: -HOST_COST, label: `Hosting ${kind === 'public' ? 'a public' : 'an invitational'} tourney`, kind: 'court' });
  w.grounds.hosted = w.date;
  const rng = new Rng(w.rng);
  const e = schedule(w, rng, kind, P, kind === 'invitational' ? invited : undefined)!;
  for (const h of invited) shiftRelation(w, P, h, 2);
  logRecord(w, { kind: 'world', type: 'politics', severity: 1, text: `We announce ${e.name}${kind === 'invitational' ? ` for ${invited.map((h) => w.houses[h]?.name).join(', ')}` : ', open to all'}. Purse ${fmt(e.purse)} othes.` });
  w.rng = rng.state;
  return w;
}

// ---------------------------------------------------------------- the fights

function boutOf(world: World, rng: Rng, e: CircuitEvent, a: Entrant, b: Entrant, hurt: number, death: number): CBout {
  const ka = a.id ?? LOCAL + a.name;
  const kb = b.id ?? LOCAL + b.name;
  const ra = (a.id && world.characters[a.id] ? fightScore(world.characters[a.id]!) : a.skill) + rng.gauss() * 2.5;
  const rb = (b.id && world.characters[b.id] ? fightScore(world.characters[b.id]!) : b.skill) + rng.gauss() * 2.5;
  const [win, lose] = ra >= rb ? [a, b] : [b, a];
  const out: CBout = { a: ka, b: kb, winner: win === a ? ka : kb };
  const loseKey = lose === a ? ka : kb;
  const roll = rng.next();
  if (roll < death) out.killed = loseKey; else if (roll < hurt) out.hurt = loseKey;
  const L = lose.id ? world.characters[lose.id] : undefined;
  const W = win.id ? world.characters[win.id] : undefined;
  if (L?.alive) {
    if (out.killed) kill(world, L, world.date, `killed by ${win.name} at ${e.name}`);
    else if (out.hurt) { L.flags.push({ id: 'wounded', since: world.date, until: addCycles(world.date, CYCLES_PER_PHASE * 2), detail: `at ${e.name}` }); if (e.kind === 'underground' || e.kind === 'pitnight') lastingWound(world, rng, L.id, `at ${e.name}`); }
    if (!out.killed) seasoned(world, rng, L.id, false);
    tally(world, L.id, 'bouts');
  }
  if (W) { tally(world, W.id, 'bouts'); tally(world, W.id, 'boutsWon'); seasoned(world, rng, W.id, true); }
  // Meet the same face often enough and it becomes personal.
  if (L && W && L.houseId !== W.houseId) {
    shiftOpinion(world, L.id, W.id, out.killed ? -60 : -5, `beaten at ${e.name}`);
    const met = (tieOf(world, L.id, W.id)?.reasons ?? []).filter((r) => /beaten at|beat them at/.test(r)).length;
    if (met >= 2 && !bondOf(world, L.id, W.id) && rng.chance(0.4)) setBond(world, L.id, W.id, 'rival', 'rival', 'kept meeting on the circuit');
  }
  if (W && out.killed && L) setBond(world, W.id, L.id, undefined, 'feud', 'a death on the circuit');
  return out;
}

function localsFor(rng: Rng, n: number, lo: number, hi: number): Entrant[] {
  return rng.shuffle([...LOCALS]).slice(0, n).map((name) => ({ name, skill: lo + rng.next() * (hi - lo) }));
}

function resolve(world: World, rng: Rng, e: CircuitEvent) {
  const P = world.playerHouseId;
  // Those who went, still standing.
  e.entrants = e.entrants.filter((x) => !x.id || (world.characters[x.id]?.alive && !world.characters[x.id]!.flags.some((f) => f.id === 'wounded')));
  const bouts: CBout[] = [];
  if (e.kind === 'underground') {
    const card = [...e.entrants, ...localsFor(rng, 4 + Math.floor(rng.next() * 5), 8, 16)];
    // Each of the houses' people fights twice, against whoever the promoter puts in front of them.
    for (const x of e.entrants) for (let i = 0; i < 2; i++) {
      const others = card.filter((y) => y !== x && (!y.houseId || y.houseId !== x.houseId));
      const foe = rng.pick(others.length ? others : card.filter((y) => y !== x));
      bouts.push(boutOf(world, rng, e, x, foe, 0.15, 0.02));
    }
  } else if (e.kind === 'pitnight') {
    const sides = [e.host!, ...(e.invited ?? [])];
    for (const h of sides) if (!e.entrants.some((x) => x.houseId === h) && h !== P) for (const c of fighters(world, h).sort((a, b) => fightScore(b) - fightScore(a)).slice(0, 3)) goes(world, e, c, true);
    const A = e.entrants.filter((x) => x.houseId === sides[0]);
    const B = e.entrants.filter((x) => x.houseId !== sides[0]);
    for (let i = 0; i < Math.min(A.length, B.length); i++) bouts.push(boutOf(world, rng, e, A[i]!, B[i]!, 0.15, 0.01));
    const wins = (h: string) => bouts.filter((b) => e.entrants.find((x) => (x.id ?? LOCAL + x.name) === b.winner)?.houseId === h).length;
    e.winner = wins(sides[0]!) >= bouts.length - wins(sides[0]!) ? sides[0] : sides[1];
    if (sides[1]) shiftRelation(world, sides[0]!, sides[1], bouts.some((b) => b.killed) ? -4 : 1);
  } else {
    // A bracket of eight, blunted; locals fill the open tourneys.
    const field = [...e.entrants].sort((a, b) => b.skill - a.skill).slice(0, 8);
    // Open tourneys fill with the undercities' best; invitationals give the top seeds byes.
    if (e.kind === 'public' && field.length < 8) field.push(...localsFor(rng, 8 - field.length, 10, 16));
    let size = 2;
    while (size < field.length) size *= 2;
    const seeded: (Entrant | null)[] = [...field, ...Array<null>(size - field.length).fill(null)];
    // Seed 1 meets the last, 2 the second-last, and so on; byes fall to the best.
    let round: (Entrant | null)[] = [];
    for (let i = 0; i < size / 2; i++) round.push(seeded[i]!, seeded[size - 1 - i]!);
    while (round.length > 1) {
      const next: (Entrant | null)[] = [];
      for (let i = 0; i + 1 < round.length; i += 2) {
        const x = round[i]!;
        const y = round[i + 1]!;
        if (!x || !y) { next.push(x ?? y); continue; }
        const b = boutOf(world, rng, e, x, y, 0.08, 0.003);
        bouts.push(b);
        next.push(b.winner === (x.id ?? LOCAL + x.name) ? x : y);
      }
      round = next;
    }
    const champ = round[0];
    if (champ) {
      e.winner = champ.id ?? LOCAL + champ.name;
      if (champ.id && world.characters[champ.id]) {
        const c = world.characters[champ.id]!;
        award(world, c.id, `Victor of ${e.name}, ${dateParts(world.date).year}`);
        addGlory(world, c.id, 2);
        if (!c.traits.some((t) => t.id === 'victorOf')) c.traits.push({ id: 'victorOf', detail: e.name });
        if (world.houses[c.houseId]) { const st = world.houses[c.houseId]!.standing; st.respect = clamp(st.respect + 1, 0, 100); }
      }
    }
    if (e.host && world.houses[e.host]) { const st = world.houses[e.host]!.standing; st.respect = clamp(st.respect + 1, 0, 100); }
  }
  e.bouts = bouts;
  // The purse: to the winners, by wins.
  const winsBy: Record<string, number> = {};
  for (const b of bouts) winsBy[b.winner] = (winsBy[b.winner] ?? 0) + 1;
  const total = Object.values(winsBy).reduce((n, v) => n + v, 0) || 1;
  const purse: Record<string, number> = {};
  for (const x of e.entrants) {
    const k = x.id!;
    const share = e.kind === 'underground' ? Math.round(e.purse * (winsBy[k] ?? 0) / total) : e.winner === k ? e.purse : 0;
    if (share && x.houseId && world.houses[x.houseId]) { record(world, x.houseId, { resource: 'othes', amount: share, label: `Winnings at ${e.name}`, kind: 'court' }); purse[k] = share; }
  }
  // Home again.
  for (const x of e.entrants) { const c = x.id ? world.characters[x.id] : undefined; if (c) c.flags = c.flags.filter((f) => f.id !== 'circuit'); }
  e.done = true;
  // Someone young in the crowd, or on the undercard, may be seen.
  if (rng.chance(e.kind === 'underground' ? 0.2 : 0.12)) noticeYouth(world, rng, e.planetId, e.sectorId, 'pits');
  hear(world, rng, e, purse);
}

// ---------------------------------------------------------------- what reaches us

function hear(world: World, rng: Rng, e: CircuitEvent, purse: Record<string, number>) {
  const P = world.playerHouseId;
  const ours = e.entrants.filter((x) => x.houseId === P && x.id);
  const N = (k: string) => entrantName(world, k);
  const lineFor = (k: string) => {
    const bs = (e.bouts ?? []).filter((b) => b.a === k || b.b === k);
    const won = bs.filter((b) => b.winner === k).length;
    return { won, lost: bs.length - won, bs };
  };
  if (ours.length) {
    e.heard = true;
    // They come home and tell it.
    for (const x of ours) {
      const c = world.characters[x.id!]!;
      const { won, lost, bs } = lineFor(x.id!);
      const fell = bs.find((b) => b.killed === x.id);
      const hurt = bs.find((b) => b.hurt === x.id);
      const killed = bs.filter((b) => b.winner === x.id && b.killed).map((b) => N(b.killed!));
      const champ = e.winner === x.id;
      if (!fell) shiftMood(c, won > lost ? 4 : -2);
      logRecord(world, {
        kind: 'world', type: 'fight', severity: fell || champ || killed.length ? 2 : 1,
        text: fell ? `${displayName(c.name)} was killed at ${e.name} by ${N(fell.winner)}. ${x.sent ? 'We sent them.' : 'They went on their own.'}`
          : !bs.length ? `${displayName(c.name)} comes back from ${e.name} without a bout: they did not make the draw.`
          : `${displayName(c.name)} comes back from ${e.name}: ${won}–${lost}${champ ? ', and the title' : ''}${purse[x.id!] ? `, ${fmt(purse[x.id!]!)} othes in winnings` : ''}${hurt ? `, and a wound from ${N(hurt.winner)}` : ''}.${killed.length ? ` They killed ${killed.join(' and ')}.` : ''}`,
        detail: bs.map((b) => `${N(b.winner)} beat ${N(b.winner === b.a ? b.b : b.a)}${b.hurt ? ' (hurt)' : ''}${b.killed ? ' (killed)' : ''}`).join('\n'),
        who: [{ id: c.id, part: fell ? 'killed' : champ ? 'won' : 'fought' }], placeId: e.sectorId, source: fell ? 'those who were there' : shortName(c.name),
      });
      // The pits keep bad company.
      if (e.shady && !fell && rng.chance(0.3)) {
        const st = world.houses[P]!.standing;
        st.honour = clamp(st.honour - 1, 0, 100);
        logRecord(world, { kind: 'intrigue', type: 'intrigue', severity: 1, text: `Word goes round that ${displayName(c.name)} fought on a card at ${e.name} with ${e.shady}. It does not look well for the house.`, who: [{ id: c.id, part: 'seen' }], effects: ['Honour −1'] });
      }
    }
    if (e.kind === 'pitnight' && e.winner) logRecord(world, { kind: 'world', type: 'fight', severity: 2, text: `${cap(e.name)}: ${e.winner === P ? 'we take it' : `House ${world.houses[e.winner]?.name} takes it`}, ${(e.bouts ?? []).length} bouts.`, detail: (e.bouts ?? []).map((b) => `${N(b.winner)} beat ${N(b.winner === b.a ? b.b : b.a)}${b.hurt ? ' (hurt)' : ''}${b.killed ? ' (killed)' : ''}`).join('\n'), houseIds: e.host ? [e.host] : [] });
    return;
  }
  // Public tourneys are cried by heralds.
  if (e.kind === 'public' || e.host === P || (e.kind === 'invitational' && e.invited?.includes(P))) {
    e.heard = true;
    logRecord(world, { kind: 'world', type: 'fight', severity: 0, text: `${cap(e.name)} is won by ${e.winner ? N(e.winner) : 'no one'}${e.winner && !isLocal(e.winner) && world.characters[e.winner] ? ` of House ${world.houses[world.characters[e.winner]!.houseId]?.name ?? '?'}` : ''}.`, placeId: e.sectorId, source: 'heralds' });
    return;
  }
  // The rest: only if it was big, and we had ears there.
  const big = (e.bouts ?? []).some((b) => b.killed && !isLocal(b.killed)) || (e.winner && !isLocal(e.winner));
  const ears = world.planets[e.planetId]?.houseId === P || !!listeningOn(world, P, e.planetId) || rng.chance(0.25);
  if (big && ears) {
    e.heard = true;
    const death = (e.bouts ?? []).find((b) => b.killed && !isLocal(b.killed));
    logRecord(world, { kind: 'world', type: 'fight', severity: 1, text: death ? `Rumour from ${e.name}: ${N(death.killed!)} was killed there by ${N(death.winner)}.` : `Rumour from ${e.name}: ${N(e.winner!)} carried the night.`, placeId: e.sectorId, source: 'rumour' });
  }
}

// ---------------------------------------------------------------- the calendar

export function advanceCircuit(world: World, rng: Rng, phaseTurned: boolean, orbitTurned: boolean): void {
  ensureGrounds(world);
  const g = world.grounds;
  const now = absoluteCycle(world.date);
  const P = world.playerHouseId;
  const houses = Object.keys(world.houses);
  if (orbitTurned) {
    // One or two underground cards somewhere in the Reaches each Orbit.
    const n = 1 + (rng.chance(0.5) ? 1 : 0);
    for (let i = 0; i < n; i++) schedule(world, rng, 'underground');
    if (rng.chance(0.45)) schedule(world, rng, 'public', rng.pick(houses.filter((h) => h !== P)));
    if (rng.chance(0.2)) { const host = rng.pick(houses.filter((h) => h !== P)); schedule(world, rng, 'invitational', host, rng.shuffle(houses.filter((h) => h !== host)).slice(0, 2 + (rng.chance(0.5) ? 1 : 0))); }
    if (rng.chance(0.3)) { const host = rng.pick(houses.filter((h) => h !== P)); const guest = rng.chance(0.5) ? P : rng.pick(houses.filter((h) => h !== host)); schedule(world, rng, 'pitnight', host, [guest]); }
  }
  if (phaseTurned) {
    for (const e of g.circuit) {
      if (e.done) continue;
      const left = absoluteCycle(e.held) - now;
      // In the last Phases, people make up their minds to go.
      if (left > 0 && left <= CYCLES_PER_PHASE * 2) {
        for (const h of houses) {
          if (e.kind === 'pitnight') continue;
          if (e.kind === 'invitational' && !e.invited?.includes(h) && e.host !== h) continue;
          if (e.kind === 'underground' && h === P && g.pitsForbidden) continue;
          const mine = e.entrants.filter((x) => x.houseId === h).length;
          if (mine >= MAX_SENT) continue;
          for (const c of fighters(world, h)) {
            if (e.entrants.some((x) => x.id === c.id) || !keen(world, c)) continue;
            // Pupils and aspirants are not allowed the pits; now and then one slips out anyway.
            const st = world.ladder?.of[c.id]?.stage;
            if (e.kind === 'underground' && (st === 'pupil' || st === 'aspirant')) {
              if (willOf(world, c.id) < 70 || !rng.chance(0.006)) continue;
              if (h === P) logRecord(world, { kind: 'intrigue', type: 'intrigue', severity: 2, seat: 'spymaster', text: `${displayName(c.name)}, still ${st === 'pupil' ? 'a pupil' : 'an aspirant'}, was seen slipping off to ${e.name}. They are not allowed the pits.`, who: [{ id: c.id, part: 'slipped out' }] });
              goes(world, e, c, false);
              break;
            }
            if (willOf(world, c.id) < 70 || !rng.chance(e.kind === 'underground' ? 0.06 : 0.05)) continue;
            // Other houses' Marshals send their own to tourneys; a few go to the pits on their own.
            goes(world, e, c, false);
            if (world.ambitions?.will) world.ambitions.will[c.id] = Math.max(0, willOf(world, c.id) - 40);
            if (e.kind === 'underground' || e.entrants.filter((x) => x.houseId === h).length >= MAX_SENT) break;
          }
        }
        // Other houses send to invitationals and public tourneys they care about.
        if (e.kind !== 'underground') for (const h of houses.filter((x) => x !== P && x !== e.host && (e.kind === 'public' ? rng.chance(0.35) : e.invited?.includes(x)))) {
          if (e.entrants.some((x) => x.houseId === h)) continue;
          if (e.kind !== 'pitnight') for (const best of fighters(world, h).sort((a, b) => fightScore(b) - fightScore(a)).slice(0, e.kind === 'invitational' ? 2 : 1 + (rng.chance(0.4) ? 1 : 0))) goes(world, e, best, true);
        }
        // The host fields its own.
        if (e.host && e.host !== P && e.kind !== 'pitnight' && !e.entrants.some((x) => x.houseId === e.host)) {
          const best = fighters(world, e.host).sort((a, b) => fightScore(b) - fightScore(a))[0];
          if (best) goes(world, e, best, true);
        }
      }
      if (left <= 0) resolve(world, rng, e);
    }
    // Keep a season's worth.
    if (g.circuit.length > 60) g.circuit = [...g.circuit.filter((e) => !e.done), ...g.circuit.filter((e) => e.done).slice(-40)];
  }
}

/** The Highroy's rule on the underground pits. */
export function setPitsForbidden(input: World, forbid: boolean): World {
  const w = structuredClone(input);
  ensureGrounds(w);
  if (w.grounds.pitsForbidden === forbid) return w;
  w.grounds.pitsForbidden = forbid;
  if (forbid) for (const c of fighters(w, w.playerHouseId)) if (keen(w, c)) { shiftMood(c, -3); const lord = Object.values(w.characters).find((x) => x.alive && x.houseId === w.playerHouseId && x.seat === 'highroy'); if (lord) shiftOpinion(w, c.id, lord.id, -3, 'forbade the pits'); }
  logRecord(w, { kind: 'world', type: 'world', severity: 1, text: forbid ? 'The Highroy forbids the house\'s people the underground pits. Some of the knights are not pleased.' : 'The Highroy lifts the ban on the underground pits.' });
  return w;
}

export { isMilitary, opinion, titlesOf };
