// The Numarade's questions to our seat: how we vote on a motion, whom we back for Exarchon, whether we
// campaign for a Minor seat, and whether one of ours sits on the Capanna.
import { addEvents, type Ctx, type EventDef } from './events';
import {
  affinity, aiVote, askedMotion, candidatesScore, exarchonOf, houseName, liveHouses, prestigeOf, regardOf, shiftRegard, tally, tierOf, type Motion,
} from './archon';
import { seat, nm } from './arckit';
import { econ } from './economy';

const T = 'Numarade';
const H = (c: Ctx, id?: string) => `House ${houseName(c.world, id ?? '')}`;
const motion = (c: Ctx): Motion | undefined => askedMotion(c.world);
const envoy = (c: Ctx) => seat(c, 'envoy');
const noEnvoy = (c: Ctx) => (envoy(c) ? null : 'We have no Speaker of the Council at court.');

/** Our read of how the seats lean, before we vote. */
function lean(c: Ctx, m: Motion): string {
  const w = c.world;
  const seats = w.archon!.numarade.seats.filter((s) => s !== w.playerHouseId);
  const guess = { ...m, votes: { ...m.votes } } as Motion;
  for (const s of seats) guess.votes[s] = aiVote(w, s, m);
  const t = tally(guess);
  return `By our Speaker's count the other seats lean ${t.aye} for, ${t.nay} against${t.abstain ? `, ${t.abstain} undecided` : ''}${m.needed === 'super' ? '; eight are needed' : ''}.`;
}

function why(c: Ctx, m: Motion): string {
  const w = c.world;
  const P = w.playerHouseId;
  const bits: string[] = [];
  if (m.target && m.target !== P) bits.push(`We ${regardWord(regardOf(w, P, m.target))} ${H(c, m.target)}`);
  if (m.second && m.second !== P) bits.push(`and ${regardWord(regardOf(w, P, m.second))} ${H(c, m.second)}`);
  if (m.by && m.by !== P) bits.push(`${bits.length ? '; ' : ''}${H(c, m.by)} tabled it and ${regardWord(regardOf(w, m.by, P))} us`.replace('We ', 'we '));
  return bits.length ? `${bits.join(' ')}.` : '';
}
const regardWord = (v: number) => v >= 50 ? 'think highly of' : v >= 20 ? 'are on good terms with' : v > -20 ? 'have no strong feeling for' : v > -50 ? 'are cool toward' : 'are bitter with';

function vote(c: Ctx, v: 'aye' | 'nay' | 'abstain', swing = 0): void {
  const m = motion(c);
  if (!m) return;
  m.votes[c.world.playerHouseId] = v;
  if (swing) m.swing = swing;
  c.fx.say(`Our seat votes ${v === 'abstain' ? 'to abstain' : v}`);
}

function speak(c: Ctx, passed: boolean, dir: 1 | -1): void {
  const m = motion(c);
  if (!m) return;
  vote(c, dir > 0 ? 'aye' : 'nay', passed ? 2 * dir : 0);
  c.fx.say(passed ? `${nm(envoy(c))} turns the room` : `${nm(envoy(c))} is heard politely and changes no one's mind`);
  // Speaking against a house's own motion is noticed.
  const party = dir > 0 ? (m.kind === 'censure' ? m.target : m.kind === 'raise' ? m.second : undefined) : m.by;
  if (party && party !== c.world.playerHouseId) shiftRegard(c.world, party, c.world.playerHouseId, -4);
}

/** Candidates for Exarchon, as we would rank them. */
function ranked(c: Ctx): { i: number; name: string; house: string }[] {
  const m = motion(c);
  if (!m?.candidates) return [];
  const P = c.world.playerHouseId;
  return m.candidates.map((x, i) => ({ i, name: x.name, house: x.houseId, s: candidatesScore(c.world, P, x) }))
    .sort((a, b) => b.s - a.s).map(({ i, name, house }) => ({ i, name, house }));
}

function backCandidate(c: Ctx, k: number, lobby = false, passed = false): void {
  const m = motion(c);
  const r = ranked(c)[k];
  if (!m || !r) return;
  m.votes[c.world.playerHouseId] = r.i;
  if (lobby) { m.swing = passed ? 3 : 1; m.swingFor = r.i; }
  shiftRegard(c.world, r.house, c.world.playerHouseId, lobby ? 6 : 3);
  c.fx.say(`Our seat backs ${r.name} of ${H(c, r.house)}${lobby ? (passed ? ', and our Speaker brings others with us' : ', and our Speaker tries to bring others; few come') : ''}`);
}

const candLabel = (k: number) => (c: Ctx) => { const r = ranked(c)[k]; return r ? (r.house === c.world.playerHouseId ? `Put forward our own: ${r.name}` : `Back ${r.name} (${houseName(c.world, r.house)})`) : '—'; };
const candAvail = (k: number) => (c: Ctx) => (ranked(c)[k] ? null : 'No such candidate.');

const defs: EventDef[] = [
  {
    id: 'num:vote', title: 'A motion before the Numarade', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!motion(c),
    text: (c) => { const m = motion(c)!; return `The Numarade sits. Before it: ${m.title}. ${why(c, m)} ${lean(c, m)}`.replace(/\s+/g, ' ').trim(); },
    options: [
      { label: 'Vote aye', resolve: (c) => vote(c, 'aye') },
      { label: 'Vote nay', resolve: (c) => vote(c, 'nay') },
      { label: 'Speak for it', hint: 'turn waverers', available: noEnvoy, check: { who: envoy, stats: ['eloquence', 'diplomacy'], dc: 13 }, resolve: (c, ok) => speak(c, ok, 1) },
      { label: 'Speak against it', hint: 'turn waverers', available: noEnvoy, check: { who: envoy, stats: ['eloquence', 'diplomacy'], dc: 13 }, resolve: (c, ok) => speak(c, ok, -1) },
      { label: 'Abstain', resolve: (c) => vote(c, 'abstain') },
      { label: 'Let the Speaker vote as they judge', resolve: (c) => { const m = motion(c); if (m) vote(c, aiVote(c.world, c.world.playerHouseId, m) as 'aye' | 'nay' | 'abstain'); } },
    ],
    fallback: 5,
  },
  {
    id: 'num:elect', title: 'The election of an Exarchon', category: T, trigger: 'home', weight: 0, stage: true, urgent: true,
    setup: (c) => !!motion(c)?.candidates?.length,
    text: (c) => {
      const w = c.world;
      const P = w.playerHouseId;
      const list = ranked(c).map((r) => r.house === P ? `${r.name}, our own Highroy` : `${r.name} of ${H(c, r.house)} (we ${regardWord(regardOf(w, P, r.house))} them${affinity(w, P, r.house) >= 0.65 ? ', and they think as we do' : affinity(w, P, r.house) <= 0.35 ? ', and they think nothing like us' : ''})`).join('; ');
      return `The Exarchon's chair is empty and the Great Houses have put forward their candidates: ${list}. The Exarchon serves for life.`;
    },
    options: [
      { label: 'Back the first', labelFor: candLabel(0), available: candAvail(0), resolve: (c) => backCandidate(c, 0) },
      { label: 'Back the second', labelFor: candLabel(1), available: candAvail(1), resolve: (c) => backCandidate(c, 1) },
      { label: 'Back the third', labelFor: candLabel(2), available: candAvail(2), resolve: (c) => backCandidate(c, 2) },
      { label: 'Back the fourth', labelFor: candLabel(3), available: candAvail(3), resolve: (c) => backCandidate(c, 3) },
      { label: 'Lobby for our choice', labelFor: (c) => { const r = ranked(c)[0]; return r ? `Lobby the seats for ${r.name}` : 'Lobby the seats'; }, hint: 'Speaker', available: noEnvoy, check: { who: envoy, stats: ['diplomacy', 'intrigue'], dc: 14 }, resolve: (c, ok) => backCandidate(c, 0, true, ok) },
      { label: 'Let the Speaker vote as they judge', resolve: (c) => backCandidate(c, 0) },
    ],
    fallback: 5,
  },
  {
    id: 'num:seats', title: 'The Minor seats', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => motion(c)?.kind === 'seats' && tierOf(c.world, c.world.playerHouseId) === 'minor',
    text: (c) => {
      const w = c.world;
      const P = w.playerHouseId;
      const seated = w.archon!.numarade.minorSeats;
      const ours = seated.includes(P);
      const minors = liveHouses(w).filter((h) => h.tier === 'minor').sort((a, b) => b.prestige - a.prestige);
      const rank = minors.findIndex((h) => h.id === P) + 1;
      return `Every five years the Minor Houses choose the four who sit in the Numarade. Seated now: ${seated.map((s) => houseName(w, s)).join(', ')}. ${ours ? 'We hold a seat and mean to keep it.' : 'We hold no seat.'} By standing we are ${rank} of ${minors.length} (${Math.round(prestigeOf(w, P))}).`;
    },
    options: [
      { label: 'Campaign for a seat', hint: 'Speaker', available: noEnvoy, check: { who: envoy, stats: ['diplomacy', 'eloquence'], dc: 12 }, resolve: (c, ok) => { const m = motion(c); if (!m) return; m.votes[c.world.playerHouseId] = 'abstain'; m.swing = ok ? 2 : 1; c.fx.say(ok ? 'Our Speaker works every embassy' : 'Our Speaker finds the doors half-open'); } },
      { label: 'Campaign with gifts', hint: '6,000 othes', available: (c) => (econ(c.world, c.world.playerHouseId).stock.othes < 6000 ? 'Needs 6,000 othes.' : null), resolve: (c) => { const m = motion(c); if (!m) return; const P = c.world.playerHouseId; m.votes[P] = 'abstain'; m.swing = 2; c.fx.othes(-6000); for (const h of liveHouses(c.world).filter((x) => x.tier === 'minor' && x.id !== P)) shiftRegard(c.world, h.id, P, 2); c.fx.say('Gifts go to every Minor court'); } },
      { label: 'Stay out of it', resolve: (c) => { const m = motion(c); if (m) m.votes[c.world.playerHouseId] = 'abstain'; c.fx.say('We let the others choose'); } },
    ],
    fallback: 2,
  },
  {
    id: 'num:capanna', title: 'A seat on the Capanna', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!exarchonOf(c.world) && !!envoy(c),
    text: (c) => { const ex = exarchonOf(c.world)!; return `The Exarchon ${ex.name} of ${H(c, ex.houseId)} asks that ${nm(envoy(c))} sit on the Capanna, among the Exarchon's own advisers. It is an honour, and it ties us to this Exarchon.`; },
    options: [
      { label: 'Accept', resolve: (c) => { const ex = exarchonOf(c.world)!; const e = envoy(c)!; const n = c.world.archon!.numarade; n.capanna = [...n.capanna.slice(0, 4), { name: nm(e), houseId: c.world.playerHouseId, role: 'Adviser on the houses', personId: e.id }]; shiftRegard(c.world, ex.houseId, c.world.playerHouseId, 8); c.fx.respect(2).say(`${nm(e)} takes a seat on the Capanna`); } },
      { label: 'Decline with thanks', resolve: (c) => { const ex = exarchonOf(c.world)!; shiftRegard(c.world, ex.houseId, c.world.playerHouseId, -6); c.fx.say('We keep our distance from the chair'); } },
    ],
    fallback: 0,
  },
];

addEvents(defs);
void prestigeOf;
