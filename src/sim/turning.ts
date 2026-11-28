// The cells, and what comes out of them.
//
// A captive can be questioned three ways: talked to, pressed, or broken in the pulse cage (the canon's
// Magnetic Pulse Cage: migraines, blurred thought, memory drift). Each session wears down their resolve
// and, past each threshold, gives up something: what their house is planning, a station's weak hour, a
// secret on one of their council. A captive worn down far enough may turn: kept as our agent, or sent
// home as a double agent to report from inside, and some of those are playing us. What they give us
// opens moves without a declared war: a deniable strike on a station, blackmail, or a grievance the
// Archon will accept as reason for war.
import { Rng } from './rng';
import { addCycles, absoluteCycle, CYCLES_PER_ORBIT, CYCLES_PER_PHASE, dateParts, type GameDate } from './time';
import { logRecord } from './records';
import { econ } from './economy';
import { kill } from './death';
import { displayName, shortName } from './names';
import { seatHolder } from './query';
import { learn } from './knowledge';
import { shiftMood } from './mood';
import { shiftRelation } from './relations';
import { shiftRegard } from './archon';
import { takeIntoHouse } from './training';
import { addMark, told, type Account } from './details';
import { AIM_LABEL } from './houses';
import { assaultPower, shipsFree } from './arcs_places';
import { siteDefence } from './places';
import { equipPower } from './standing';
import { shipLog } from './fleet';
import { advanceNetworks } from './networks';
import type { Captive, Character, World } from './types';

export type Method = 'talk' | 'press' | 'break';
export const METHOD_LABEL: Record<Method, string> = { talk: 'Talk to them', press: 'Press them', break: 'The pulse cage' };
export const METHOD_NOTE: Record<Method, string> = {
  talk: 'Food, a chair, the same questions every day. Slow, and it leaves nothing behind.',
  press: 'No sleep, no light, the Spymaster\'s people in shifts. Faster. They will hate us for it.',
  break: 'The pulse cage scrambles thought. Fastest, and what comes out may be half memory and half dream. Some do not come out at all. The Archon calls it dishonourable; the Archon is right.',
};

export interface Cell { resolve: number; sessions: Record<Method, number>; last?: GameDate; yielded: number }

export type IntelKind = 'site' | 'plot' | 'secret';
export interface Intel {
  id: string;
  kind: IntelKind;
  /** The house it is about. */
  houseId: string;
  siteId?: string;
  personId?: string;
  text: string;
  /** Who gave it to us. */
  source: string;
  date: GameDate;
  expires: GameDate;
  /** 1..3: how good it is. */
  quality: number;
  /** Half memory and half dream, or a lie fed to us on purpose. We do not know which it is. */
  false?: boolean;
  used?: boolean;
}

export interface DoubleAgent { personId: string; for: string; since: GameDate; reports: number; burned?: boolean; /** Whether they are really ours. Hidden from the player. */ ours: boolean; asked?: number }
export interface Wrong { by: string; against: string; text: string; year: number }
export interface IntelState { items: Intel[]; agents: DoubleAgent[]; wrongs: Wrong[]; /** Spy networks (networks.ts). */ networks?: import('./networks').Network[] }

export function ensureIntel(w: World): IntelState {
  w.intel ??= { items: [], agents: [], wrongs: [] };
  return w.intel;
}

const cellOf = (cap: Captive, c: Character): Cell => (cap.cell ??= { resolve: startResolve(c), sessions: { talk: 0, press: 0, break: 0 }, yielded: 0 });
export const startResolveOf = (c: Character): number => startResolve(c);
const startResolve = (c: Character) => Math.round(Math.max(25, Math.min(95, c.stats.willpower * 2 + c.stats.composure + c.hidden.loyalty * 1.5 + c.stats.painTolerance)));

// ---------------------------------------------------------------- questioning

export function cannotQuestion(w: World, id: string): string | null {
  const cap = w.captives[id];
  const c = w.characters[id];
  if (!cap || !c?.alive || cap.heldBy !== w.playerHouseId) return 'Not in our cells';
  const cell = cap.cell;
  if (cell?.last && absoluteCycle(cell.last) + CYCLES_PER_PHASE > absoluteCycle(w.date)) return 'Questioned this Phase already';
  return null;
}

/** One session in the cells. Wears their resolve down; past each threshold they give something up. */
export function questionCaptive(input: World, id: string, method: Method): World {
  const w = structuredClone(input);
  const why = cannotQuestion(w, id);
  if (why) throw new Error(why);
  const rng = new Rng(w.rng);
  const P = w.playerHouseId;
  const cap = w.captives[id]!;
  const c = w.characters[id]!;
  const cell = cellOf(cap, c);
  const spy = seatHolder(w, P, 'spymaster');
  const asker = spy ? (method === 'talk' ? spy.stats.insight * 0.6 + spy.stats.eloquence * 0.4 : spy.stats.intrigue * 0.6 + spy.stats.insight * 0.4) : 8;
  const before = cell.resolve;
  const wear = method === 'talk' ? 6 + asker * 0.6 - c.stats.composure * 0.25 : method === 'press' ? 12 + asker * 0.8 - c.stats.painTolerance * 0.3 : 26 + rng.int(0, 10);
  cell.resolve = Math.max(0, Math.round(cell.resolve - Math.max(3, wear) * (0.8 + rng.next() * 0.4)));
  cell.sessions[method]++;
  cell.last = w.date;
  cap.interrogated = true;
  const st = w.houses[P]!.standing;
  const effects: string[] = [`Resolve ${before} → ${cell.resolve}`];
  let died = false;
  if (method === 'press') { st.honour = Math.max(0, st.honour - 1); shiftMood(c, -8); effects.push('Honour −1'); }
  if (method === 'break') {
    st.honour = Math.max(0, st.honour - 3); st.dread = Math.min(100, st.dread + 3); shiftMood(c, -15); effects.push('Honour −3', 'Dread +3');
    if (rng.chance(0.08 + (c.stats.constitution < 8 ? 0.08 : 0))) died = true;
  }
  if (method === 'talk') shiftMood(c, 3);
  learn(w, P, c.id, 15);

  // What they give up, crossing each line.
  const found: Intel[] = [];
  for (const line of [70, 45, 20]) if (before > line && cell.resolve <= line) {
    const it = intelFrom(w, rng, c, `${shortName(c.name)}, in our cells`, method === 'break' && rng.chance(0.35), cell.resolve <= 20 ? 3 : cell.resolve <= 45 ? 2 : 1);
    if (it) found.push(it);
    cell.yielded++;
  }
  // The first time they crack, they give up their own council too.
  if (before > 70 && cell.resolve <= 70) for (const k of Object.values(w.characters).filter((x) => x.alive && x.houseId === c.houseId && x.seat)) learn(w, P, k.id, 12);

  const account = cellAccount(w, rng, c, spy, method, found.length, died, cell);
  if (method !== 'talk') addMark(w, c, { kind: 'grudge', text: method === 'break' ? 'the pulse cage, in our cells' : 'questioned without sleep in our cells', place: 'our cells', with: spy?.id });
  if (method === 'break' && !died) addMark(w, c, { kind: 'scar', text: 'a gap in their memory where the pulse cage was', place: 'our cells', part: 'head' });
  if (spy && method !== 'talk') addMark(w, spy, { kind: 'habit', text: method === 'break' ? 'uses the pulse cage' : 'questions without mercy', place: 'our cells' });
  if (died) { delete w.captives[id]; c.flags = c.flags.filter((f) => f.id !== 'captive' && f.id !== 'missing'); kill(w, c, w.date, 'died in the pulse cage'); shiftRelation(w, c.houseId!, P, -40); shiftRegard(w, c.houseId!, P, -30); effects.push(`House ${w.houses[c.houseId!]?.name} regard −30`); }

  logRecord(w, {
    kind: 'intrigue', type: 'captive', severity: died ? 3 : found.length ? 2 : 1,
    text: died ? `${displayName(c.name)} died in the pulse cage.` : found.length ? `${shortName(c.name)} gave something up: ${found.map((f) => f.text).join(' ')}` : `${shortName(c.name)} held out, ${method === 'talk' ? 'politely' : 'barely'}.`,
    who: [{ id: c.id, part: 'captive' }, ...(spy ? [{ id: spy.id, part: 'asking' }] : [])], effects, account,
  });
  w.rng = rng.state;
  return w;
}

function cellAccount(_w: World, r: Rng, c: Character, spy: Character | undefined, m: Method, found: number, died: boolean, cell: Cell): Account {
  const C = shortName(c.name), S = spy ? shortName(spy.name) : 'the gaoler';
  const lines: string[] = [];
  if (m === 'talk') lines.push(r.pick([`${S} brought two cups and left one in front of ${C}.`, `${S} talked about ${C}'s home for an hour before asking anything.`, `They played a game of cards. ${S} lost on purpose, twice.`]));
  if (m === 'press') lines.push(r.pick([`${C} had not slept in two days when ${S} came in.`, `${S} asked the same question forty times, and wrote down each answer.`, `The lights stayed on. ${C} stopped asking for them to go off.`]));
  if (m === 'break') lines.push(r.pick([`The cage hummed for an hour. ${C} stopped answering in sentences.`, `${C} asked, twice, what year it was.`, `${S} watched the field readings, not ${C}.`]));
  if (cell.sessions[m] > 2 && r.chance(0.5)) lines.push(`${C} knows the routine now, and hates that they know it.`);
  if (c.traits.some((t) => t.id === 'stubborn' || t.id === 'zealous') && r.chance(0.6)) lines.push(`${C} recited their house's oath under their breath the whole time.`);
  if (died) lines.push(`${C}'s heart stopped at the third pulse. The physician was called too late, or was not called.`);
  else if (found) lines.push(r.pick([`Then, mid-sentence, ${C} gave it up.`, `${C} said it like it had been waiting to be said.`, `${C} wept, and then talked.`]));
  else lines.push(r.pick([`${C} gave nothing but their name.`, `Nothing. ${C} looked almost proud of it.`, `A little less defiance than yesterday. Nothing else.`]));
  return told(spy ? 'the Spymaster' : 'the gaoler', lines);
}

const SECRETS = ['owes Breakline more than the house could pay', 'has a child no one in the house knows of', 'took a purse from the Numarade\'s clerks for a vote', 'has been writing to a lover in a rival house', 'had a hand in a death that was called an accident', 'sold seats on the house\'s convoys to smugglers'];

/** What a captive can tell us about their own house. */
export function intelFrom(w: World, r: Rng, c: Character, source: string, garbled: boolean, quality: number): Intel | null {
  const h = c.houseId;
  if (!h || !w.houses[h]) return null;
  const s = ensureIntel(w);
  const P = w.playerHouseId;
  const kinds: IntelKind[] = [];
  const site = Object.values(w.places?.sites ?? {}).filter((x) => x.holder === h && x.holdable).sort(() => r.next() - 0.5)[0];
  if (site) kinds.push('site', 'site');
  if (w.realm?.aims[h]) kinds.push('plot');
  const council = Object.values(w.characters).filter((x) => x.alive && x.houseId === h && x.seat && x.id !== c.id);
  if (council.length) kinds.push('secret');
  if (!kinds.length) return null;
  const kind = r.pick(kinds);
  const base = { id: `in${w.nextId++}`, kind, houseId: h, source, date: w.date, expires: addCycles(w.date, CYCLES_PER_ORBIT * 4), quality, false: garbled || undefined };
  let it: Intel;
  if (kind === 'site') {
    site!.known = true;
    it = { ...base, siteId: site!.id, text: `${site!.name}: ${r.pick(['the garrison changes at the third bell, and the north lock is old', 'half the guns have no crews since the last levy', 'the shield generator is down every ninth cycle for service', 'the overseer drinks, and the watch knows it'])}.` };
  } else if (kind === 'plot') {
    const aim = w.realm!.aims[h]!;
    aim.known = true;
    const atUs = aim.target === P;
    it = { ...base, text: `House ${w.houses[h]!.name} wants ${AIM_LABEL[aim.kind].toLowerCase()}${aim.target ? `, at House ${w.houses[aim.target]?.name ?? aim.target}` : ''}${atUs ? ', and has begun' : ''}.` };
    if (atUs && !garbled) s.wrongs.push({ by: h, against: P, text: `They plotted against us: ${AIM_LABEL[aim.kind].toLowerCase()}, as their own people confessed.`, year: dateParts(w.date).year });
  } else {
    const p = r.pick(council);
    it = { ...base, personId: p.id, text: `${displayName(p.name)} ${r.pick(SECRETS)}.` };
  }
  s.items.unshift(it);
  if (s.items.length > 40) s.items = s.items.filter((x, i) => i < 30 || !x.used);
  return it;
}

// ---------------------------------------------------------------- turning

/** Below this, a captive can be asked to turn. */
export const TURN_AT = 45;

export function cannotTurn(w: World, id: string): string | null {
  const cap = w.captives[id];
  const c = w.characters[id];
  if (!cap || !c?.alive || cap.heldBy !== w.playerHouseId) return 'Not in our cells';
  if (!cap.cell || cap.cell.resolve > TURN_AT) return `Not yet: their resolve is ${cap.cell?.resolve ?? startResolve(c)}, and they will not turn above ${TURN_AT}`;
  if (w.houses[c.houseId ?? '']?.rulerId === c.id) return 'A Highroy does not turn';
  return null;
}

/** How likely they are to really be ours, as the Spymaster reckons it (the truth stays hidden). */
export function turnOdds(w: World, id: string): number {
  const cap = w.captives[id];
  const c = w.characters[id];
  if (!cap?.cell || !c) return 0;
  const k = cap.cell;
  const p = 0.35 + (TURN_AT - k.resolve) / 100 + k.sessions.talk * 0.05 - k.sessions.break * 0.06 - (c.hidden.loyalty - 10) * 0.025;
  return Math.max(0.05, Math.min(0.9, p));
}

/** Turn them: keep them as our agent, or send them home to work for us from inside. */
export function turnCaptive(input: World, id: string, how: 'serve' | 'home'): World {
  const w = structuredClone(input);
  const why = cannotTurn(w, id);
  if (why) throw new Error(why);
  const rng = new Rng(w.rng);
  const P = w.playerHouseId;
  const c = w.characters[id]!;
  const home = c.houseId!;
  ensureIntel(w);
  const ours = rng.chance(turnOdds(w, id));
  delete w.captives[id];
  c.flags = c.flags.filter((f) => f.id !== 'captive' && f.id !== 'missing');
  if (how === 'serve') {
    takeIntoHouse(w, c, 'Agent');
    if (!ours) c.flags.push({ id: 'secretLoyalty', since: w.date, detail: `still loyal to House ${w.houses[home]?.name}` });
    shiftRegard(w, home, P, -10);
    logRecord(w, { kind: 'intrigue', type: 'captive', severity: 2, text: `${displayName(c.name)} has sworn to House ${w.houses[P]?.name}.`, who: [{ id: c.id, part: 'turned' }], detail: 'Their own house will call it treason.' });
  } else {
    ensureIntel(w).agents.push({ personId: c.id, for: P, since: w.date, reports: 0, ours });
    logRecord(w, { kind: 'intrigue', type: 'captive', severity: 2, text: `${displayName(c.name)} "escapes" our cells and goes home to House ${w.houses[home]?.name}, ours now, or so they swear.`, who: [{ id: c.id, part: 'double agent' }], detail: 'They will report through a dead drop on the docks. If they are found out, their house will not be gentle.' });
    shiftMood(c, 10);
  }
  w.rng = rng.state;
  return w;
}

// ---------------------------------------------------------------- double agents

export function activeAgents(w: World): DoubleAgent[] {
  return (w.intel?.agents ?? []).filter((a) => !a.burned && a.for === w.playerHouseId && w.characters[a.personId]?.alive);
}

/** Ask a double agent for something big: a station's gate left open, or the house's purse. It burns them faster. */
export type Ask = 'gate' | 'purse';
export function askAgent(input: World, personId: string, ask: Ask): World {
  const w = structuredClone(input);
  const a = activeAgents(w).find((x) => x.personId === personId);
  if (!a) throw new Error('No such agent');
  if ((a.asked ?? 0) >= 2) throw new Error('They will not risk it again');
  const rng = new Rng(w.rng);
  const c = w.characters[personId]!;
  const h = c.houseId!;
  a.asked = (a.asked ?? 0) + 1;
  if (ask === 'gate') {
    const it = intelFrom(w, rng, c, `${shortName(c.name)}, from inside`, !a.ours, 3);
    if (it && it.kind !== 'site') { it.kind = 'site'; const site = Object.values(w.places?.sites ?? {}).find((x) => x.holder === h && x.holdable); if (site) { it.siteId = site.id; it.text = `${site.name}: ${shortName(c.name)} will see the gate open on the night we come.`; } }
    logRecord(w, { kind: 'intrigue', type: 'intrigue', severity: 2, text: it?.siteId ? `${shortName(c.name)} will open a gate for us: ${it.text}` : `${shortName(c.name)} has no gate to open.`, who: [{ id: c.id, part: 'double agent' }] });
  } else {
    const take = Math.round(Math.min(econ(w, h).stock.othes * 0.06, 6000) / 50) * 50;
    if (a.ours && take > 0) { econ(w, h).stock.othes -= take; econ(w, w.playerHouseId).stock.othes += take; }
    logRecord(w, { kind: 'intrigue', type: 'intrigue', severity: 2, text: a.ours && take > 0 ? `${shortName(c.name)} skimmed House ${w.houses[h]?.name}'s ledger for us.` : `${shortName(c.name)} says the ledger is watched too closely. Nothing came.`, who: [{ id: c.id, part: 'double agent' }], effects: a.ours && take > 0 ? [`+${take.toLocaleString('en-US')} othes`] : undefined });
  }
  w.rng = rng.state;
  return w;
}

/** Each Phase: agents report (some of it lies), and some are found out. Old intel goes stale. */
export function advanceIntel(w: World, rng: Rng, phaseTurned: boolean): void {
  if (!phaseTurned || !w.intel) return;
  const s = w.intel;
  const now = absoluteCycle(w.date);
  advanceNetworks(w, rng);
  for (const a of s.agents) {
    const c = w.characters[a.personId];
    if (a.burned || !c?.alive) continue;
    const theirSpy = seatHolder(w, c.houseId!, 'spymaster');
    // A house at war with the one the agent reports to watches its own people far more closely.
    const war = (w.war?.wars ?? []).some((x) => x.status === 'active' && [x.attacker, ...x.attackers, x.defender, ...x.defenders].includes(a.for) && [x.attacker, ...x.attackers, x.defender, ...x.defenders].includes(c.houseId!) && ([x.attacker, ...x.attackers].includes(a.for) !== [x.attacker, ...x.attackers].includes(c.houseId!)));
    const risk = 0.025 + (theirSpy ? theirSpy.stats.intrigue / 400 : 0) + (a.asked ?? 0) * 0.06 + (a.ours ? 0 : 0.02) + (war ? 0.05 : 0);
    if (rng.chance(risk)) {
      a.burned = true;
      const dead = rng.chance(0.5);
      if (dead) kill(w, c, w.date, `executed by their own house as a spy for House ${w.houses[a.for]?.name}`);
      shiftRegard(w, c.houseId!, a.for, -25);
      s.wrongs.push({ by: a.for, against: c.houseId!, text: `They turned one of ours, ${shortName(c.name)}.`, year: dateParts(w.date).year });
      logRecord(w, { kind: 'intrigue', type: 'intrigue', severity: 3, text: `${displayName(c.name)} has been found out by House ${w.houses[c.houseId!]?.name}${dead ? ', and executed' : ', and is in their cells'}.`, who: [{ id: c.id, part: 'our double agent' }], detail: a.ours ? 'They were ours to the end.' : 'The Spymaster wonders now how much of what they sent was true.' });
      continue;
    }
    if (rng.chance(0.3)) {
      const it = intelFrom(w, rng, c, `${shortName(c.name)}, from inside`, !a.ours && rng.chance(0.7), 2);
      if (it) { a.reports++; logRecord(w, { kind: 'intrigue', type: 'intrigue', severity: 1, text: `Word from ${shortName(c.name)}, inside House ${w.houses[c.houseId!]?.name}: ${it.text}`, who: [{ id: c.id, part: 'double agent' }], source: 'a dead drop on the docks' }); }
    }
    // One who was never ours tells their own house what we asked about.
    if (!a.ours && rng.chance(0.05)) { shiftRegard(w, c.houseId!, a.for, -5); learn(w, c.houseId!, seatHolder(w, a.for, 'spymaster')?.id ?? '', 10); }
  }
  // A turncoat who never really turned: some day they run home with what they learned.
  for (const c of Object.values(w.characters)) {
    const f = c.alive ? c.flags.find((x) => x.id === 'secretLoyalty') : undefined;
    if (!f || !c.houseId || !rng.chance(0.04)) continue;
    const from = c.houseId;
    const to = Object.values(w.houses).find((h) => f.detail?.endsWith(h.name))?.id;
    c.flags = c.flags.filter((x) => x.id !== 'secretLoyalty');
    if (!to || !w.houses[to]) continue;
    c.houseId = to; c.seat = undefined;
    shiftRegard(w, to, from, -5);
    for (const k of Object.values(w.characters).filter((x) => x.alive && x.houseId === from && x.seat)) learn(w, to, k.id, 10);
    logRecord(w, { kind: 'intrigue', type: 'intrigue', severity: 3, text: `${displayName(c.name)}, who swore to us in our cells, has gone home to House ${w.houses[to]!.name}, and taken what they learned with them.`, who: [{ id: c.id, part: 'turncoat' }], detail: 'They were never ours.' });
  }
  for (const it of s.items) if (!it.used && absoluteCycle(it.expires) <= now) it.used = true;
}

// ---------------------------------------------------------------- what it opens

export function liveIntel(w: World, kind?: IntelKind): Intel[] {
  return (w.intel?.items ?? []).filter((x) => !x.used && (!kind || x.kind === kind));
}

export function cannotStrike(w: World, intelId: string, shipIds: string[]): string | null {
  const it = w.intel?.items.find((x) => x.id === intelId);
  if (!it || it.used || it.kind !== 'site' || !it.siteId) return 'No way in';
  const site = w.places?.sites[it.siteId];
  if (!site || site.holder !== it.houseId) return 'It has changed hands since';
  if (!shipIds.length) return 'Send at least one ship';
  const free = new Set(shipsFree(w, w.playerHouseId).map((x) => x.id));
  if (shipIds.some((id) => !free.has(id))) return 'Those ships are not ready to fly';
  return null;
}

/** A strike on a station, without a declared war: in, take what can be carried, wreck what cannot, out. Deniable, unless it is not. */
export function strikeSite(input: World, intelId: string, shipIds: string[]): World {
  const w = structuredClone(input);
  const why = cannotStrike(w, intelId, shipIds);
  if (why) throw new Error(why);
  const rng = new Rng(w.rng);
  const P = w.playerHouseId;
  const it = w.intel!.items.find((x) => x.id === intelId)!;
  it.used = true;
  const site = w.places!.sites[it.siteId!]!;
  const ships = shipIds.map((id) => w.fleet.ships[id]!);
  const holder = it.houseId;
  // Good intel halves the defence; false intel means they were waiting.
  const edge = it.false ? 1.4 : 1 - it.quality * 0.17;
  const atk = assaultPower(w, P, ships) * (0.8 + rng.next() * 0.4);
  const def = siteDefence(w, site) * equipPower(w, holder) * edge * 0.6 * (0.8 + rng.next() * 0.4);
  const won = atk > def;
  for (const sh of ships) { sh.condition = Math.max(0, sh.condition - rng.int(won ? 3 : 10, won ? 12 : 28)); shipLog(w, sh, won ? `Struck ${site.name} and got away clean` : `Bloodied at ${site.name}`, won ? 3 : 1); }
  const effects: string[] = [];
  const loot = won ? Math.round(((site.yields.othes ?? 120) * 6 + 1500) / 50) * 50 : 0;
  if (won) { econ(w, P).stock.othes += loot; site.garrison = Math.max(100, Math.round(site.garrison * 0.6)); effects.push(`+${loot.toLocaleString('en-US')} othes taken`, `${site.name}'s garrison cut to ${site.garrison}`); }
  // Is it known who did it?
  const found = rng.chance(won ? 0.25 + (it.false ? 0.4 : 0) : 0.6);
  if (found) {
    shiftRegard(w, holder, P, -30); shiftRelation(w, holder, P, -30);
    ensureIntel(w).wrongs.push({ by: P, against: holder, text: `They struck ${site.name} without a declaration.`, year: dateParts(w.date).year });
    effects.push(`House ${w.houses[holder]?.name} knows it was us: regard −30, and they have a grievance`);
  }
  const lines = [
    `${ships.map((s) => `The ${s.name}`).join(' and ')} ran dark into ${site.name}'s approach.`,
    it.false ? 'The intel was wrong. The guns were crewed, and they were waiting.' : it.quality >= 3 ? 'It was exactly as we were told: the gate stood open.' : 'Most of what we were told was true.',
    won ? `In and out inside the hour, holds full.` : `They were thrown back, and lucky to get out.`,
    found ? 'Someone recognised a hull. It will be known.' : 'No colours, no registry. Nobody can say who it was.',
  ];
  logRecord(w, { kind: 'world', type: 'fight', severity: 3, text: won ? `A strike on ${site.name}, House ${w.houses[holder]?.name}'s, and our ships got away with it.` : `Our strike on ${site.name} was thrown back.`, effects, who: ships.flatMap((x) => (x.captainId ? [{ id: x.captainId, part: `captain of the ${x.name}` }] : [])), account: told('an officer aboard', lines) });
  w.rng = rng.state;
  return w;
}

/** Blackmail with a secret: they pay, or we tell. */
export function blackmail(input: World, intelId: string, how: 'pay' | 'ruin'): World {
  const w = structuredClone(input);
  const it = w.intel?.items.find((x) => x.id === intelId);
  if (!it || it.used || it.kind !== 'secret' || !it.personId) throw new Error('Nothing to use');
  const p = w.characters[it.personId];
  if (!p?.alive) throw new Error('They are past caring');
  const rng = new Rng(w.rng);
  const P = w.playerHouseId;
  const h = it.houseId;
  it.used = true;
  const effects: string[] = [];
  if (it.false) {
    shiftRegard(w, h, P, -20);
    effects.push(`House ${w.houses[h]?.name} regard −20`);
    logRecord(w, { kind: 'intrigue', type: 'intrigue', severity: 2, text: `Our letter to ${displayName(p.name)} came back with a laugh: none of it was true.`, effects, detail: 'Whoever gave us that was lying, or did not know.' });
  } else if (how === 'pay') {
    const take = Math.round(Math.min(econ(w, h).stock.othes * 0.08, 8000) / 50) * 50;
    econ(w, h).stock.othes -= take; econ(w, P).stock.othes += take;
    shiftRegard(w, h, P, -10);
    addMark(w, p, { kind: 'shame', text: 'paid House ' + (w.houses[P]?.name ?? '') + ' to keep a secret', place: 'by letter' });
    effects.push(`+${take.toLocaleString('en-US')} othes`, `House ${w.houses[h]?.name} regard −10`);
    logRecord(w, { kind: 'intrigue', type: 'intrigue', severity: 2, text: `${displayName(p.name)} paid to keep it quiet.`, effects, who: [{ id: p.id, part: 'paid' }] });
  } else {
    const st = w.houses[h]?.standing;
    if (st) st.honour = Math.max(0, st.honour - 6);
    p.flags.push({ id: 'disgraced', since: w.date, knownBy: [] });
    shiftMood(p, -20);
    shiftRegard(w, h, P, -25);
    addMark(w, p, { kind: 'shame', text: `a secret read out in the Numarade`, place: 'the Numarade' });
    effects.push(`House ${w.houses[h]?.name}: honour −6, regard −25`);
    logRecord(w, { kind: 'intrigue', type: 'intrigue', severity: 3, text: `We made it known: ${it.text}`, effects, who: [{ id: p.id, part: 'disgraced' }] });
  }
  void rng;
  return w;
}

/** Wrongs done to us that the Archon will accept as reason for war. */
export function wrongsAgainst(w: World, us: string, them: string): string[] {
  const year = dateParts(w.date).year;
  return (w.intel?.wrongs ?? []).filter((x) => x.by === them && x.against === us && year - x.year <= 10).map((x) => x.text);
}
