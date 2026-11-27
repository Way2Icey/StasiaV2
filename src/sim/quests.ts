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
import { board as boardOf, claimBounty, posterName, TERMS_LABEL, viewTarget } from './bounties';
import { knowledgeOf } from './knowledge';
import { atWar } from './war';
import { shiftRegard } from './archon';
import { ensureIntel } from './turning';
import { isAgent } from './household';
import { regardOf, houseName } from './archon';
import { shiftRelation } from './relations';
import { learn } from './knowledge';
import { intelFrom } from './turning';
import { shipsOf } from './fleet';
import { reportBack } from './briefings';
import type { Character, World } from './types';

export type QuestKind = 'hunt' | 'escort' | 'guard' | 'trial' | 'relic' | 'beast' | 'bounty' | 'capture' | 'hold'
  | 'treaty' | 'tradePact' | 'arbitrate' | 'feast' | 'vote'
  | 'ledger' | 'plant' | 'leak' | 'sabotage' | 'rescue';
/** Whose board a deed is on, and so who can be sent. */
export type Board = 'grandMaster' | 'envoy' | 'spymaster';
export const BOARD_LABEL: Record<Board, string> = { grandMaster: "The Grand Master's board", envoy: "The Speaker's errands", spymaster: "The Spymaster's work" };
const BOARD_OF: Record<QuestKind, Board> = {
  hunt: 'grandMaster', escort: 'grandMaster', guard: 'grandMaster', trial: 'grandMaster', relic: 'grandMaster', beast: 'grandMaster', bounty: 'grandMaster', capture: 'grandMaster', hold: 'grandMaster',
  treaty: 'envoy', tradePact: 'envoy', arbitrate: 'envoy', feast: 'envoy', vote: 'envoy',
  ledger: 'spymaster', plant: 'spymaster', leak: 'spymaster', sabotage: 'spymaster', rescue: 'spymaster',
};
export const boardOfQuest = (q: Quest): Board => BOARD_OF[q.kind];
export const QUEST_LABEL: Record<QuestKind, string> = { hunt: 'Hunt', escort: 'Escort', guard: 'Keep the peace', trial: 'Trial of arms', relic: 'Recover', beast: 'Clear', bounty: 'Collect a price', capture: 'Take alive', hold: 'Hold the lanes', treaty: 'Carry terms', tradePact: 'Trade', arbitrate: 'Arbitrate', feast: 'Be seen', vote: 'Win a vote', ledger: 'Steal', plant: 'Plant', leak: 'Find a leak', sabotage: 'Sabotage', rescue: 'Bring home' };

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
  /** The bounty to collect, or the person to take alive. */
  subject?: string;
  /** Who went, and when they are back. */
  goneId?: string;
  back?: import('./time').GameDate;
  posted: import('./time').GameDate;
}

export interface QuestState { board: Quest[]; /** Our lanes are held by our knights until then: corsairs think twice. */ heldUntil?: import('./time').GameDate; /** Trade agreements the Speaker has won: house, and until when it pays. */ pacts?: { houseId: string; until: import('./time').GameDate; perPhase: number }[] }

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
  // The bounty board: a price our people can collect, if they are good enough.
  for (const b of boardOf(w).filter((x) => x.status === 'open' && !(x.poster.kind === 'house' && x.poster.houseId === P) && !(x.target.kind === 'person' && w.characters[x.target.id]?.houseId === P)).sort((a, c) => c.reward - a.reward).slice(0, 2)) {
    const v = viewTarget(w, b.target);
    if (!v) continue;
    out.push({ kind: 'bounty', subject: b.id, title: `Collect the price on ${v.name}`, text: `${posterName(w, b.poster)} has ${b.reward.toLocaleString('en-US')} othes on ${v.name}, ${TERMS_LABEL[b.terms].toLowerCase()}. ${v.where ? `Last seen ${v.where}.` : ''} The purse is ours if one of ours brings it in.`, hard: Math.max(1, Math.min(5, Math.round(v.strength / 6))), cycles: 0, reward: b.reward });
  }
  // A face of a rival house, worth more in our cells than in theirs.
  const foes = Object.values(w.characters).filter((c) => c.alive && c.houseId && c.houseId !== P && !c.seat && w.houses[c.houseId]?.rulerId !== c.id && c.tier === 'full' && !w.captives[c.id] && knowledgeOf(w, P, c.id).depth >= 10 && !atWar(w, P, c.houseId));
  if (foes.length) { const f = r.pick(foes); out.push({ kind: 'capture', subject: f.id, title: `Take ${shortName(f.name)} of House ${w.houses[f.houseId!]?.name} alive`, text: `${shortName(f.name)} knows things about House ${w.houses[f.houseId!]?.name} we would like to know. Bring them to our cells, quietly. If anyone sees our colours, there will be a reckoning.`, hard: 4, cycles: 14, reward: 0 }); }
  if (Object.keys(w.lanes?.factions ?? {}).length) out.push({ kind: 'hold', title: 'Hold our lanes against the corsairs', text: 'Ride the convoy lanes for a few Phases, ship to ship. While our knights are out there, raiders think twice; the merchants pay for the quiet.', hard: 3, cycles: 16, reward: 700 });
  out.push({ kind: 'escort', title: r.pick(['See the ore convoy to the Exchange', 'Escort the Steward\'s factors through the lanes', 'Bring the navisium shipment home']), text: 'Ride with the convoy, and make sure it arrives with everything it left with.', hard: 2, cycles: 12, reward: 300 });
  out.push({ kind: 'trial', title: r.pick(['Answer the TheaSzar academy\'s open challenge', 'Stand the Torvann enclave\'s trial of arms', 'Take the duelling court\'s open place']), text: 'A rival academy keeps an open challenge for any house\'s fighters. Win and the house is talked of. Lose and so is the house.', hard: 3, cycles: 10, reward: 0 });
  out.push({ kind: 'relic', title: r.pick(['Follow the rumour of a Caige in a wreck', 'Find the lost blade of the house\'s founder', 'Look into the Echo at the old battlefield']), text: 'A rumour from the docks: something of value, somewhere it should not be. It may be nothing. It may be a Caige no one has held since the Rend.', hard: 3, cycles: 28, reward: 1500 });
  out.push({ kind: 'beast', title: r.pick(['Clear the creatures from the lower tunnels', 'Put down what is killing the herds on the outer farms', 'Clear the drift-warped thing from the mining shaft']), text: 'Something is killing people where they work. Go and end it.', hard: r.int(1, 4), cycles: 8, reward: 250 });
  return out;
}

/** The Speaker's errands: terms, trade, a quarrel settled, a face shown, a vote won. */
function speakerDrafts(w: World, r: Rng): Omit<Quest, 'id' | 'posted'>[] {
  const P = w.playerHouseId;
  const out: Omit<Quest, 'id' | 'posted'>[] = [];
  const houses = Object.keys(w.houses).filter((h) => h !== P && !atWar(w, P, h));
  const name = (h: string) => w.houses[h]?.name ?? h;
  const lukewarm = houses.filter((h) => Math.abs(regardOf(w, h, P)) < 35);
  if (lukewarm.length) { const h = r.pick(lukewarm); out.push({ kind: 'treaty', where: h, title: `Carry our terms to House ${name(h)}`, text: `House ${name(h)} could be a friend, or could be talked into being one. Go to their court with our terms and a good gift, and come back with their goodwill.`, hard: 2, cycles: 14, reward: 0 }); }
  const pactable = houses.filter((h) => regardOf(w, h, P) >= -10 && !(w.quests?.pacts ?? []).some((x) => x.houseId === h && absoluteCycle(x.until) > absoluteCycle(w.date)));
  if (pactable.length) { const h = r.pick(pactable); out.push({ kind: 'tradePact', where: h, title: `Open a trade agreement with House ${name(h)}`, text: `Their factors and ours could do business on better terms than the Exchange gives either of us. Negotiate it: if it holds, it pays every Phase for two Orbits.`, hard: 3, cycles: 16, reward: 250 }); }
  const feuds = (w.archon?.feuds ?? []).filter((f) => f.a !== P && f.b !== P);
  if (feuds.length) { const f = r.pick(feuds); out.push({ kind: 'arbitrate', where: `${f.a}|${f.b}`, title: `Settle the quarrel between ${houseName(w, f.a)} and ${houseName(w, f.b)}`, text: `Both houses would rather not lose face. The house that gets them to sit at one table is talked of well in the Numarade.`, hard: 4, cycles: 18, reward: 0 }); }
  if (houses.length) { const h = r.pick(houses); out.push({ kind: 'feast', where: h, title: r.pick([`Represent us at House ${name(h)}'s feast`, `Stand for us at a funeral at House ${name(h)}'s court`, `Carry our gift to House ${name(h)}'s naming day`]), text: `A small thing, but they will notice who came and who did not. A good pair of ears there learns a great deal about their council.`, hard: 1, cycles: 8, reward: 0 }); }
  out.push({ kind: 'vote', title: r.pick(['Win the Numarade\'s vote on the levies', 'Carry the vote on the lane tolls', 'Stop the motion against the minor houses']), text: 'A vote is coming in the Numarade. Win it and the house is owed for it, in favour and in othes.', hard: 3, cycles: 12, reward: 800 });
  return out;
}

/** The Spymaster's work: ledgers, agents, leaks, sabotage, our own brought home. */
function spyDrafts(w: World, r: Rng): Omit<Quest, 'id' | 'posted'>[] {
  const P = w.playerHouseId;
  const out: Omit<Quest, 'id' | 'posted'>[] = [];
  const houses = Object.keys(w.houses).filter((h) => h !== P);
  const name = (h: string) => w.houses[h]?.name ?? h;
  if (houses.length) {
    const rich = [...houses].sort((a, b) => econ(w, b).stock.othes - econ(w, a).stock.othes)[0]!;
    out.push({ kind: 'ledger', where: rich, title: `Steal House ${name(rich)}'s ledgers`, text: `Their counting house keeps everything: who they pay, who they owe, what they hide. Copy it, and skim what can be skimmed on the way out. If our agent is caught, they will know whose.`, hard: 4, cycles: 14, reward: 0 });
    const h = r.pick(houses);
    out.push({ kind: 'plant', where: h, title: `Plant an agent in House ${name(h)}'s household`, text: 'A servant, a clerk, a guard who owes us. Once inside, they will send word of what the house is planning and who on their council is weak.', hard: 3, cycles: 16, reward: 0 });
    const s = r.pick(houses);
    out.push({ kind: 'sabotage', where: s, title: r.pick([`Foul House ${name(s)}'s shipyard`, `Burn House ${name(s)}'s grain stores`, `Spoil House ${name(s)}'s convoy at the docks`]), text: 'Nothing anyone could prove. Just a bad Phase for them, and a costly one.', hard: 4, cycles: 12, reward: 0 });
  }
  out.push({ kind: 'leak', title: 'Find the leak in our own house', text: 'Things said at our table are being heard elsewhere. Someone is talking. Find out who.', hard: 3, cycles: 12, reward: 0 });
  const held = Object.values(w.captives).find((c) => c.heldBy !== P && w.characters[c.characterId]?.houseId === P && w.characters[c.characterId]?.alive);
  if (held) { const c = w.characters[held.characterId]!; out.push({ kind: 'rescue', subject: c.id, where: held.heldBy, title: `Bring ${shortName(c.name)} home from House ${name(held.heldBy)}'s cells`, text: `${shortName(c.name)} has been in their cells since ${held.since.year}. A guard can be bought, a door left open. If it goes wrong, we lose two.`, hard: 4, cycles: 14, reward: 0 }); }
  return out;
}

export function ensureQuests(w: World): QuestState { return (w.quests ??= { board: [] }); }

/** Each Phase the Grand Master keeps the board stocked; those sent come home and tell how it went. */
export function advanceQuests(w: World, rng: Rng, phaseTurned: boolean): void {
  const s = ensureQuests(w);
  const now = absoluteCycle(w.date);
  for (const q of s.board.filter((x) => x.goneId && x.back && absoluteCycle(x.back) <= now)) resolve(w, rng, q);
  s.board = s.board.filter((q) => !(q.goneId && q.back && absoluteCycle(q.back) <= now));
  // Prices being collected end when the trail ends.
  for (const q of s.board.filter((x) => x.kind === 'bounty' && x.goneId)) {
    const b = w.bounties?.list.find((x) => x.id === q.subject);
    const still = b && b.status === 'hunted' && b.hunterId === `p:${q.goneId}`;
    if (still) continue;
    const c = w.characters[q.goneId!];
    if (b?.status === 'done' && c?.alive) { tally(w, c.id, 'missions'); addGlory(w, c.id, 1); shiftMood(c, 8); }
    q.goneId = undefined; q.subject = undefined; q.posted = { year: 0, cycle: 0 };
  }
  s.board = s.board.filter((q) => !(q.kind === 'bounty' && !q.subject));
  // Prices no longer on the board come off ours too.
  s.board = s.board.filter((q) => q.kind !== 'bounty' || q.goneId || boardOf(w).some((b) => b.id === q.subject && b.status === 'open'));
  if (!phaseTurned) return;
  // Old, untaken work goes off the board after two Orbits.
  s.board = s.board.filter((q) => q.goneId || absoluteCycle(q.posted) + CYCLES_PER_PHASE * 10 > now);
  // Trade agreements pay every Phase while they hold.
  for (const pact of s.pacts ?? []) if (absoluteCycle(pact.until) > now && w.houses[pact.houseId] && !atWar(w, w.playerHouseId, pact.houseId)) record(w, w.playerHouseId, { resource: 'othes', amount: pact.perPhase, label: `Trade agreement with House ${w.houses[pact.houseId]!.name}`, kind: 'trade' });
  s.pacts = (s.pacts ?? []).filter((x) => absoluteCycle(x.until) > now);
  const stock = (board: Board, max: number, make: () => Omit<Quest, 'id' | 'posted'>[]) => {
    if (!seatHolder(w, w.playerHouseId, board)) return;
    const open = s.board.filter((q) => !q.goneId && BOARD_OF[q.kind] === board);
    if (open.length >= max) return;
    const have = new Set(s.board.map((q) => q.title));
    // One job of a kind against any one house at a time.
    const kindAt = new Set(s.board.filter((q) => q.where).map((q) => `${q.kind}:${q.where}`));
    const fresh = make().filter((d) => !have.has(d.title) && !(d.where && kindAt.has(`${d.kind}:${d.where}`)) && (kindAt.add(`${d.kind}:${d.where ?? d.title}`), true));
    for (const d of fresh.sort(() => rng.next() - 0.5).slice(0, Math.min(2, max - open.length))) s.board.push({ ...d, id: `q${w.nextId++}`, posted: w.date });
  };
  stock('grandMaster', 6, () => drafts(w, rng));
  stock('envoy', 4, () => speakerDrafts(w, rng));
  stock('spymaster', 4, () => spyDrafts(w, rng));
}

/** What each board's work leans on. */
export function skillFor(board: Board, c: Character): number {
  const s = c.stats;
  if (board === 'envoy') return (s.diplomacy * 0.4 + s.eloquence * 0.3 + s.negotiation * 0.3) * 1.05 + (c.traits.some((t) => t.id === 'silverTongued' || t.id === 'charismatic') ? 1.5 : 0);
  if (board === 'spymaster') return (s.intrigue * 0.4 + s.stealth * 0.3 + s.deception * 0.3) * 1.05 + (isAgent(c) ? 2 : 0) + (c.traits.some((t) => t.id === 'cunning') ? 1.5 : 0);
  return fightScore(c);
}

/** Who may be sent: grown, at home, unhurt, and suited to the board. Knights and aspirants for the Grand Master; anyone with a tongue for the Speaker; agents and the sly for the Spymaster. */
export function candidatesFor(w: World, board: Board = 'grandMaster'): Character[] {
  const P = w.playerHouseId;
  return Object.values(w.characters).filter((c) => c.alive && c.houseId === P && c.tier === 'full' && !c.seat && !isAway(w, c.id) && !w.captives[c.id]
    && !c.flags.some((f) => f.id === 'wounded') && ageOf(c, w.date) >= SPECIES[c.species].adulthood * 0.8
    && (board !== 'grandMaster' || isMilitary(w, c) || w.ladder?.of[c.id]?.stage === 'aspirant' || w.ladder?.of[c.id]?.stage === 'blooded')
    && (board !== 'spymaster' || isAgent(c) || c.stats.intrigue >= 10))
    .sort((a, b) => skillFor(board, b) - skillFor(board, a)).slice(0, 12);
}

export function odds(_w: World, q: Quest, c: Character): number {
  const board = BOARD_OF[q.kind];
  const extra = board !== 'grandMaster' ? 0 : q.kind === 'hunt' || q.kind === 'relic' ? (c.stats.perception + c.stats.stealth) / 4 : q.kind === 'guard' ? (c.stats.diplomacy + c.stats.composure) / 4 : q.kind === 'escort' ? (c.stats.tactics + c.stats.perception) / 4 : 0;
  const skill = skillFor(board, c) + extra;
  const bar = board === 'grandMaster' ? 6 + q.hard * 3 : 4 + q.hard * 2.5;
  return Math.max(0.1, Math.min(0.95, 0.5 + (skill - bar) / (board === 'grandMaster' ? 14 : 10)));
}

export function cannotSend(w: World, questId: string, personId: string): string | null {
  const q = w.quests?.board.find((x) => x.id === questId);
  if (!q || q.goneId) return 'Already taken';
  const c = w.characters[personId];
  if (!c || !candidatesFor(w, BOARD_OF[q.kind]).some((x) => x.id === personId)) return 'They cannot go';
  return null;
}

export function sendOnQuest(input: World, questId: string, personId: string): World {
  const w0 = structuredClone(input);
  const why = cannotSend(w0, questId, personId);
  if (why) throw new Error(why);
  const q0 = w0.quests!.board.find((x) => x.id === questId)!;
  // A price on the board is collected the way the hunters do it: on the trail until it ends.
  if (q0.kind === 'bounty') {
    const w = claimBounty(w0, q0.subject!, personId);
    const q = w.quests!.board.find((x) => x.id === questId)!;
    q.goneId = personId;
    return w;
  }
  const w = w0;
  const q = q0;
  const c = w.characters[personId]!;
  q.goneId = c.id;
  q.back = addCycles(w.date, Math.round(q.cycles * 2.5));
  c.flags.push({ id: 'quest', since: w.date, detail: q.title });
  shiftMood(c, 6);
  logRecord(w, { kind: 'world', type: 'mission', severity: 1, seat: BOARD_OF[q.kind], text: `${displayName(c.name)} ${BOARD_OF[q.kind] === 'grandMaster' ? 'rides out' : BOARD_OF[q.kind] === 'envoy' ? 'sets out' : 'slips away'}: ${q.title.charAt(0).toLowerCase() + q.title.slice(1)}.`, who: [{ id: c.id, part: 'sent' }] });
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
    if (q.kind === 'hold') { (w.quests ??= { board: [] }).heldUntil = addCycles(w.date, CYCLES_PER_PHASE * 4); effects.push('Our lanes are held: corsairs raid less for four Phases'); tally(w, c.id, 'raidsRepelled'); }
    if (q.kind === 'capture') {
      const f = q.subject ? w.characters[q.subject] : undefined;
      if (f?.alive && !w.captives[f.id]) {
        w.captives[f.id] = { characterId: f.id, heldBy: P, since: w.date, interrogated: false, reason: 'leverage' };
        f.flags.push({ id: 'captive', since: w.date, detail: `held by House ${w.houses[P]?.name}`, knownBy: [P] }, { id: 'missing', since: w.date });
        effects.push(`${shortName(f.name)} is in our cells`);
        if (r.chance(0.4) && f.houseId) { shiftRegard(w, f.houseId, P, -20); ensureIntel(w).wrongs.push({ by: P, against: f.houseId, text: `They took ${shortName(f.name)} from us.`, year: w.date.year }); effects.push(`House ${w.houses[f.houseId]?.name} knows it was us`); }
      } else effects.push('The mark was gone before we got there');
    }
    const H = q.where && w.houses[q.where] ? q.where : undefined;
    const HN = H ? w.houses[H]!.name : '';
    if (q.kind === 'treaty' && H) { const g = great ? 18 : 12; shiftRegard(w, H, P, g); shiftRelation(w, H, P, g); effects.push(`House ${HN} regard +${g}`); }
    if (q.kind === 'tradePact' && H) { const per = great ? 350 : 250; (ensureQuests(w).pacts ??= []).push({ houseId: H, until: addCycles(w.date, CYCLES_PER_PHASE * 10), perPhase: per }); shiftRegard(w, H, P, 5); effects.push(`A trade agreement with House ${HN}: +${per} othes a Phase for two Orbits`); }
    if (q.kind === 'arbitrate' && q.where) { const [a, b] = q.where.split('|'); const st = w.houses[P]!.standing; st.respect = Math.min(100, st.respect + 4); if (w.realm?.favour) w.realm.favour[P] = Math.min(100, (w.realm.favour[P] ?? 50) + 5); for (const h of [a!, b!]) if (w.houses[h]) shiftRegard(w, h, P, 6); if (w.archon) w.archon.feuds = w.archon.feuds.filter((f) => !((f.a === a && f.b === b) || (f.a === b && f.b === a))); effects.push('Respect +4', "The Numarade's favour +5", `The feud between ${houseName(w, a!)} and ${houseName(w, b!)} is ended`); }
    if (q.kind === 'feast' && H) { shiftRegard(w, H, P, 6); for (const k of Object.values(w.characters).filter((x) => x.alive && x.houseId === H && x.seat)) learn(w, P, k.id, great ? 15 : 10); effects.push(`House ${HN} regard +6`, 'We know their council better'); }
    if (q.kind === 'vote') { if (w.realm?.favour) w.realm.favour[P] = Math.min(100, (w.realm.favour[P] ?? 50) + 6); effects.push("The Numarade's favour +6"); }
    if (q.kind === 'ledger' && H) { const amt = Math.round(Math.min(econ(w, H).stock.othes * 0.04, 3000) / 50) * 50; if (amt > 0) { econ(w, H).stock.othes -= amt; record(w, P, { resource: 'othes', amount: amt, label: `Skimmed from House ${HN}'s accounts`, kind: 'boon' }); effects.push(`+${amt.toLocaleString('en-US')} othes, skimmed`); } const k = Object.values(w.characters).find((x) => x.alive && x.houseId === H && x.seat); if (k) { const it = intelFrom(w, r, k, `House ${HN}'s ledgers`, false, 3); if (it) effects.push(`Intel: ${it.text}`); } }
    if (q.kind === 'plant' && H) { const k = Object.values(w.characters).filter((x) => x.alive && x.houseId === H && x.seat); for (const x of k) learn(w, P, x.id, 15); for (let i = 0; i < (great ? 3 : 2); i++) { const src = k.length ? r.pick(k) : undefined; const it = src ? intelFrom(w, r, src, `our agent inside House ${HN}`, false, 2) : null; if (it) effects.push(`Intel: ${it.text}`); } }
    if (q.kind === 'sabotage' && H) { const hit = Math.round(Math.min(econ(w, H).stock.othes * 0.06, 5000) / 50) * 50; econ(w, H).stock.othes = Math.max(0, econ(w, H).stock.othes - hit); for (const sh of shipsOf(w, H).slice(0, 1)) sh.condition = Math.max(0, sh.condition - 20); effects.push(`House ${HN} loses about ${hit.toLocaleString('en-US')} othes${shipsOf(w, H).length ? ', and a ship is laid up' : ''}`); }
    if (q.kind === 'leak') { const sly = Object.values(w.characters).find((x) => x.alive && x.houseId === P && x.flags.some((f) => f.id === 'secretLoyalty')); if (sly) { const f = sly.flags.find((x) => x.id === 'secretLoyalty')!; (f.knownBy ??= []).push(P); effects.push(`The leak is ${shortName(sly.name)}: ${f.detail ?? 'loyal to another house'}`); } else { for (const x of Object.values(w.characters).filter((y) => y.alive && y.houseId === P)) learn(w, P, x.id, 3); effects.push('No traitor: a careless tongue, now quiet', 'We know our own people better'); } }
    if (q.kind === 'rescue') { const f = q.subject ? w.characters[q.subject] : undefined; if (f?.alive && w.captives[f.id]) { const from = w.captives[f.id]!.heldBy; delete w.captives[f.id]; f.flags = f.flags.filter((x) => x.id !== 'captive' && x.id !== 'missing'); shiftMood(f, 15); effects.push(`${shortName(f.name)} is home`); if (r.chance(0.5)) { shiftRegard(w, from, P, -10); effects.push(`House ${w.houses[from]?.name} knows who took them`); } } }
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
  const board = BOARD_OF[q.kind];
  const target = q.where && w.houses[q.where] ? q.where : undefined;
  // The Spymaster's people can be caught, and the Speaker's can say the wrong thing.
  if (board === 'spymaster' && target && (!won ? r.chance(0.45) : r.chance(0.12))) {
    shiftRegard(w, target, P, -15);
    ensureIntel(w).wrongs.push({ by: P, against: target, text: `They sent an agent against us: ${q.title.toLowerCase()}.`, year: w.date.year });
    effects.push(`House ${w.houses[target]?.name} found us out: regard −15, and a grievance`);
    if (!won && r.chance(0.4) && !dead) {
      w.captives[c.id] = { characterId: c.id, heldBy: target, since: w.date, interrogated: false, reason: 'crime' };
      c.flags.push({ id: 'captive', since: w.date, detail: `held by House ${w.houses[target]?.name}`, knownBy: [target, P] }, { id: 'missing', since: w.date });
      lines.push(`${C} was taken. House ${w.houses[target]?.name} has them.`);
      effects.push(`${C} is held by House ${w.houses[target]?.name}`);
    }
  }
  if (board === 'envoy' && !won && target) { shiftRegard(w, target, P, -3); effects.push(`House ${w.houses[target]?.name} regard −3`); }
  if (dead && board === 'grandMaster') { kill(w, c, w.date, `killed abroad: ${q.title.toLowerCase()}`); lines.push(`${C} did not come back. The Grand Master brought word.`); effects.push(`${C} is dead`); }
  else if (hurt && board === 'grandMaster') { c.flags.push({ id: 'wounded', since: w.date }); addMark(w, c, { kind: 'wound', text: r.pick(['a cut across the ribs', 'a burn down one arm', 'a cracked shoulder']), place: 'abroad' }); effects.push(`${C} is wounded`); }
  const headline = `${q.title}: ${dead && board === 'grandMaster' ? `${C} is dead` : won ? (great ? `${C} triumphs` : `${C} succeeds`) : `${C} fails`}.`;
  const seatName = board === 'grandMaster' ? 'the Grand Master' : board === 'envoy' ? 'the Speaker' : 'the Spymaster';
  logRecord(w, { kind: board === 'spymaster' ? 'intrigue' : 'world', type: 'mission', severity: dead ? 3 : won ? 2 : 1, seat: board, text: headline, who: [{ id: c.id, part: 'went' }], effects, account: told(seatName, lines) });
  // Whoever keeps the board comes to say how it went.
  const keeper = seatHolder(w, P, board);
  if (keeper) reportBack(w, { personId: keeper.id, seat: board, ref: q.id, title: headline, approved: `${QUEST_LABEL[q.kind]}: ${shortName(c.name)} sent`, summary: [...lines, ...effects], lines: [] });
  void econ;
}
