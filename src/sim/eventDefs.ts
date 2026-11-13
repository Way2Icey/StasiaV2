// The events themselves, drawn from the Event Pool doc (slice picks, less the
// battle and election events, which need war and the vote first).
import { choose, registerEvents, who, type Ctx, type EventDef } from './events';
import { displayName, shortName } from './names';
import { findSector, ruler, seatHolder } from './query';
import { isAway } from './court';
import { relation } from './relations';
import { econ, heldSectors } from './economy';
import { agentsOf } from './household';
import { caigesOf, cannotBond } from './discovery';
import { ageOf } from './characters';
import type { Character, CouncilSeat, Sector } from './types';

// ---------------------------------------------------------------- helpers

const nm = (c?: Character) => (c ? shortName(c.name) : 'someone');
const full = (c?: Character) => (c ? displayName(c.name) : 'someone');
const houseName = (c: Ctx, id?: string) => (id ? c.world.houses[id]?.name ?? 'a house' : 'a house');

function targetHouse(c: Ctx): string | undefined {
  const m = c.m;
  if (!m) return undefined;
  if (m.targetHouseId) return m.targetHouseId;
  if (m.targetId) return c.world.characters[m.targetId]?.houseId;
  return c.world.planets[m.targetPlanetId]?.houseId;
}
const foreignTarget = (c: Ctx) => {
  const h = targetHouse(c);
  return h && h !== c.house ? h : undefined;
};
const destination = (c: Ctx) => {
  const m = c.m;
  if (!m) return 'the destination';
  const s = findSector(c.world, m.targetSectorId);
  return s ? `${s.sector.name} on ${s.planet.name}` : c.world.planets[m.targetPlanetId]?.name ?? 'the destination';
};
const rivals = (c: Ctx) => Object.keys(c.world.houses).filter((h) => h !== c.house);
const othes = (c: Ctx) => econ(c.world, c.house).stock.othes;
const need = (n: number) => (c: Ctx) => (othes(c) >= n ? null : `Needs ${n.toLocaleString('en-US')} othes`);
const seat = (c: Ctx, s: CouncilSeat) => seatHolder(c.world, c.house, s);
const highroy = (c: Ctx) => ruler(c.world, c.house);

/** Full-tier people of the house who are at court right now. */
function athome(c: Ctx): Character[] {
  return Object.values(c.world.characters).filter((x) => x.alive && x.houseId === c.house && x.tier === 'full' && !isAway(c.world, x.id));
}
const knights = (c: Ctx) => athome(c).filter((x) => x.role === 'Knight');
const hasFlag = (x: Character, id: string) => x.flags.some((f) => f.id === id);
const sectors = (c: Ctx): Sector[] => heldSectors(c.world, c.house);
const worstSector = (c: Ctx) => [...sectors(c)].sort((a, b) => b.unrest - a.unrest)[0];
const randomParty = (c: Ctx) => (c.party.length ? c.rng.pick(c.party) : c.leader);
const pickRival = (c: Ctx, not?: string) => {
  const r = rivals(c).filter((h) => h !== not);
  return r.length ? c.rng.pick(r) : undefined;
};

// ---------------------------------------------------------------- travel

const travel: EventDef[] = [
  {
    id: 'toll', title: 'Toll at the Narrows', category: 'Travel', trigger: 'travel', weight: 3,
    setup: () => true,
    text: (c) => `A picket of armed hulls blocks the narrows on the way to ${destination(c)}. Their captain wants 300 othes for passage, and ${nm(c.leader)}'s party is outgunned on paper.`,
    options: [
      { label: 'Pay the toll', hint: '−300 othes', resolve: (c) => { c.fx.othes(-Math.min(300, othes(c))); } },
      { label: 'Fight through', check: { who: who.best(['duelling', 'tactics']), stats: ['duelling', 'tactics'], dc: 11 },
        resolve: (c, ok) => { if (ok) c.fx.dread(2).moodAll(c.party, 2, 'The party'); else c.fx.wound(randomParty(c)).delay(2); } },
      { label: 'Talk them down', check: { who: who.leader, stats: ['eloquence', 'negotiation'], dc: 11 },
        resolve: (c, ok) => { if (ok) c.fx.say('They wave the ship through'); else c.fx.othes(-Math.min(450, othes(c))).say('The price went up'); } },
      { label: "Invoke the house's name", hint: 'Needs Dread 30', available: (c) => (c.world.houses[c.house]!.standing.dread >= 30 ? null : 'Needs Dread 30'),
        resolve: (c) => { c.fx.say('The picket parts without a word').dread(1); } },
    ],
    fallback: 0,
  },
  {
    id: 'beacon', title: 'Distress beacon', category: 'Travel', trigger: 'travel', weight: 2,
    setup: () => true,
    text: (c) => `A distress beacon pulses off the lane. Answering it costs time, and beacons have been used as bait before. ${nm(c.leader)} awaits your word.`,
    options: [
      { label: 'Answer it', hint: 'Delay; honour', check: { who: who.best(['perception', 'insight']), stats: ['perception', 'insight'], dc: 10 },
        resolve: (c, ok) => { c.fx.delay(2); if (ok) c.fx.honour(2).othes(150).say('Survivors pulled clear; salvage taken'); else c.fx.wound(randomParty(c)).say('It was a trap'); } },
      { label: 'Fly on', hint: 'Honour −1', resolve: (c) => { c.fx.honour(-1); } },
    ],
    fallback: 1,
  },
  {
    id: 'customs', title: 'Customs at a rival starport', category: 'Travel', trigger: 'travel', weight: 3,
    setup: (c) => { const h = foreignTarget(c); return !!h && choose(c, { otherHouseId: h }); },
    text: (c) => `House ${houseName(c, c.other)}'s port officers want to search the ship. They are thorough, and they keep records.`,
    options: [
      { label: 'Submit to the search', resolve: (c) => { if (c.m?.kind === 'envoy') c.fx.regard(c.other, 1); else c.fx.noticed(); } },
      { label: 'Grease the officers', hint: '−200 othes', available: need(200), resolve: (c) => { c.fx.othes(-200).say('The search is brief and blind'); } },
      { label: 'Bluff the papers', check: { who: who.best(['deception', 'composure']), stats: ['deception', 'composure'], dc: 11 },
        resolve: (c, ok) => { if (ok) c.fx.say('Waved through'); else c.fx.noticed().regard(c.other, -3); } },
    ],
    fallback: 0,
  },
  {
    id: 'misfire', title: 'Jump misfire', category: 'Travel', trigger: 'travel', weight: 2,
    setup: () => true,
    text: (c) => `The jump drive misfires and drops ${nm(c.leader)}'s ship short of the lane. Repairs are possible, though not quick.`,
    options: [
      { label: 'Wait for repairs', hint: 'Delay 3 cycles', resolve: (c) => { c.fx.delay(3); } },
      { label: 'Push the drive', check: { who: who.best(['logistics', 'intellect']), stats: ['logistics', 'intellect'], dc: 10 },
        resolve: (c, ok) => { if (!ok) c.fx.wound(randomParty(c)).delay(1); else c.fx.say('The drive holds'); } },
      { label: 'Hire a tow', hint: '−250 othes', available: need(250), resolve: (c) => { c.fx.othes(-250).delay(1); } },
    ],
    fallback: 0,
  },
  {
    id: 'gravity', title: 'Gravity shadow', category: 'Travel', trigger: 'travel', weight: 2,
    setup: () => true,
    text: () => 'A gravity shadow lies across the lane. Pilots go around it. The bold thread it and save days.',
    options: [
      { label: 'Go around', hint: 'Delay 2 cycles', resolve: (c) => { c.fx.delay(2); } },
      { label: 'Thread it', check: { who: who.best(['fleetCommand', 'reflexes']), stats: ['fleetCommand', 'reflexes'], dc: 11 },
        resolve: (c, ok) => { if (ok) c.fx.delay(-2); else c.fx.wound(randomParty(c)).delay(2); } },
    ],
    fallback: 0,
  },
  {
    id: 'otherEnvoy', title: 'The other envoy', category: 'Travel', trigger: 'travel', weight: 2,
    setup: (c) => { if (c.m?.kind !== 'envoy') return false; const h = pickRival(c, targetHouse(c)); return !!h && choose(c, { otherHouseId: h }); },
    text: (c) => `An envoy of House ${houseName(c, c.other)} is bound for the same court, and their ship is slower. They offer to share passage.`,
    options: [
      { label: 'Share the voyage', check: { who: who.leader, stats: ['diplomacy', 'insight'], dc: 10 },
        resolve: (c, ok) => { if (ok) c.fx.regard(c.other, 4).learnHouse(c.other, 6); else c.fx.say('A cold, long voyage'); } },
      { label: 'Race ahead', hint: '−150 othes', available: need(150), resolve: (c) => { c.fx.othes(-150).delay(-1).regard(c.other, -2).progress(10); } },
      { label: 'Let them go first', resolve: (c) => { c.fx.delay(1).regard(c.other, 1); } },
    ],
    fallback: 2,
  },
  {
    id: 'ambush', title: 'Ambush at the jump point', category: 'Travel', trigger: 'travel', weight: 2,
    setup: () => true,
    text: (c) => `Raiders are waiting at the jump point. ${nm(c.leader)} has moments to choose.`,
    options: [
      { label: 'Stand and fight', check: { who: who.best(['duelling', 'tactics']), stats: ['duelling', 'tactics'], dc: 12 },
        resolve: (c, ok) => { if (ok) c.fx.dread(2).moodAll(c.party, 3, 'The party'); else c.fx.wound(c.leader).progress(-15); } },
      { label: 'Run for it', check: { who: who.best(['reflexes', 'fleetCommand']), stats: ['reflexes', 'fleetCommand'], dc: 10 },
        resolve: (c, ok) => { c.fx.delay(1); if (!ok) c.fx.wound(randomParty(c)).othes(-Math.min(150, othes(c))); } },
      { label: 'Give up the cargo', hint: '−300 othes', resolve: (c) => { c.fx.othes(-Math.min(300, othes(c))).moodAll(c.party, -2, 'The party'); } },
    ],
    fallback: 2,
  },
  {
    id: 'bounty', title: 'Bounty hunters', category: 'Travel', trigger: 'travel', weight: 1,
    setup: (c) => { const p = randomParty(c); return !!p && choose(c, { personId: p.id }); },
    text: (c) => `Someone has put a price on ${full(c.person)}'s head, and the hunters have found the ship.`,
    options: [
      { label: 'Pay them off', hint: '−250 othes', available: need(250), resolve: (c) => { c.fx.othes(-250); } },
      { label: 'Fight', check: { who: who.best(['duelling', 'marksmanship']), stats: ['duelling', 'marksmanship'], dc: 11 },
        resolve: (c, ok) => { if (ok) c.fx.dread(1); else c.fx.wound(c.person); } },
      { label: 'Lie low', check: { who: who.person, stats: ['stealth', 'deception'], dc: 10 },
        resolve: (c, ok) => { c.fx.delay(2); if (!ok) c.fx.wound(c.person); } },
    ],
    fallback: 2,
  },
  {
    id: 'derelict', title: 'Derelict warship', category: 'Travel', trigger: 'travel', weight: 1,
    setup: () => true,
    text: () => 'A dead warship drifts near the lane, old and unmarked. Something aboard may still be worth having.',
    options: [
      { label: 'Board her', check: { who: who.best(['perception', 'tactics']), stats: ['perception', 'tactics'], dc: 11 },
        resolve: (c, ok) => { c.fx.delay(1); if (ok) c.fx.good('components', 25).good('metals', 30); else c.fx.wound(randomParty(c)); } },
      { label: 'Leave her', resolve: (c) => { c.fx.say('The wreck drifts on'); } },
    ],
    fallback: 1,
  },
  {
    id: 'refugees', title: 'Refugee convoy', category: 'Travel', trigger: 'travel', weight: 1,
    setup: () => true,
    text: () => 'A convoy of refugees limps along the lane, short on food and with no escort.',
    options: [
      { label: 'Escort them', hint: 'Delay; honour', resolve: (c) => { c.fx.delay(2).honour(3).moodAll(c.party, 1, 'The party'); } },
      { label: 'Give provisions', hint: '−40 provisions', available: (c) => (econ(c.world, c.house).stock.provisions >= 40 ? null : 'Needs 40 provisions'),
        resolve: (c) => { c.fx.good('provisions', -40).honour(2); } },
      { label: 'Pass by', resolve: (c) => { c.fx.honour(-1); } },
    ],
    fallback: 2,
  },
];

// ---------------------------------------------------------------- arrival

const arrival: EventDef[] = [
  {
    id: 'seatedBelow', title: 'Seated below a minor house', category: 'Arrival', trigger: 'arrival', weight: 2,
    setup: (c) => { const h = foreignTarget(c); return c.m?.kind === 'envoy' && !!h && choose(c, { otherHouseId: h }); },
    text: (c) => `At House ${houseName(c, c.other)}'s table, ${nm(c.leader)} is seated below a minor house. It was not an accident.`,
    options: [
      { label: 'Accept it with grace', check: { who: who.leader, stats: ['composure', 'diplomacy'], dc: 9 },
        resolve: (c, ok) => { c.fx.respect(-1); if (ok) c.fx.progress(15).regard(c.other, 2); } },
      { label: 'Protest', resolve: (c) => { c.fx.respect(1).regard(c.other, -3); } },
      { label: 'Leave the hall', resolve: (c) => { c.fx.dread(1).regard(c.other, -6).progress(-30); } },
    ],
    fallback: 0,
  },
  {
    id: 'firstHere', title: 'Someone got here first', category: 'Arrival', trigger: 'arrival', weight: 2,
    setup: (c) => { const t = targetHouse(c); const h = pickRival(c, t); return !!h && choose(c, { otherHouseId: h }); },
    text: (c) => `House ${houseName(c, c.other)}'s people are already at ${destination(c)}, after the same thing we are.`,
    options: [
      { label: 'Outbid them', hint: '−300 othes', available: need(300), resolve: (c) => { c.fx.othes(-300).progress(25); } },
      { label: 'Discredit them', check: { who: who.best(['deception', 'intrigue']), stats: ['deception', 'intrigue'], dc: 12 },
        resolve: (c, ok) => { if (ok) c.fx.progress(25).regard(c.other, -5); else c.fx.noticed().regard(c.other, -3).progress(-10); } },
      { label: 'Wait them out', hint: 'Delay 2 cycles', resolve: (c) => { c.fx.delay(2); } },
    ],
    fallback: 2,
  },
  {
    id: 'gift', title: 'A personal gift', category: 'Arrival', trigger: 'arrival', weight: 2,
    setup: (c) => { const h = foreignTarget(c); return !!h && choose(c, { otherHouseId: h, personId: c.leader?.id }); },
    text: (c) => `House ${houseName(c, c.other)} sends ${nm(c.leader)} a gift: a heavy purse, for them alone.`,
    options: [
      { label: 'Let them keep it', resolve: (c) => { c.fx.mood(c.leader, 4).regard(c.other, 2); } },
      { label: 'Into the house coffers', resolve: (c) => { c.fx.othes(200).mood(c.leader, -2).regard(c.other, 1); } },
      { label: 'Return it, politely', resolve: (c) => { c.fx.honour(1).regard(c.other, -1); } },
    ],
    fallback: 1,
  },
  {
    id: 'ward', title: 'A ward as surety', category: 'Arrival', trigger: 'arrival', weight: 1,
    setup: (c) => {
      const h = foreignTarget(c);
      if (c.m?.kind !== 'envoy' || !h) return false;
      const young = athome(c).filter((x) => !x.seat && ageOf(x, c.world.date) < 30 && !hasFlag(x, 'ward'));
      return young.length > 0 && choose(c, { otherHouseId: h, personId: c.rng.pick(young).id });
    },
    text: (c) => `House ${houseName(c, c.other)} will deal, but they want ${full(c.person)} sent to their court as a ward, as surety of our word.`,
    options: [
      { label: 'Agree', resolve: (c) => { c.fx.regard(c.other, 10).honour(2).mood(c.person, -6).progress(30); c.person?.flags.push({ id: 'ward', since: c.world.date }); c.fx.say(`${nm(c.person)} is now a ward`); } },
      { label: 'Counter-offer', check: { who: who.leader, stats: ['negotiation', 'diplomacy'], dc: 12 },
        resolve: (c, ok) => { if (ok) c.fx.regard(c.other, 6).progress(15); else c.fx.regard(c.other, -4); } },
      { label: 'Refuse', resolve: (c) => { c.fx.regard(c.other, -3); } },
    ],
    fallback: 2,
  },
  {
    id: 'steel', title: 'Steel at the table', category: 'Arrival', trigger: 'arrival', weight: 2,
    setup: (c) => { const h = foreignTarget(c); return !!h && choose(c, { otherHouseId: h }); },
    text: (c) => `A knight of House ${houseName(c, c.other)} insults ${nm(c.leader)} at table and puts his blade on the cloth. The hall goes quiet.`,
    options: [
      { label: 'Answer the challenge', check: { who: who.leader, stats: ['duelling', 'valor'], dc: 11 },
        resolve: (c, ok) => { if (ok) c.fx.respect(3).dread(2).regard(c.other, -2); else c.fx.wound(c.leader).respect(-2); } },
      { label: 'Name a champion', check: { who: who.best(['duelling', 'valor']), stats: ['duelling', 'valor'], dc: 11 },
        resolve: (c, ok) => { if (ok) c.fx.respect(2).regard(c.other, -1); else c.fx.respect(-1); } },
      { label: 'Refuse', resolve: (c) => { c.fx.respect(-3).regard(c.other, 1); } },
    ],
    fallback: 2,
  },
  {
    id: 'heirWhisper', title: "The heir's whisper", category: 'Arrival', trigger: 'arrival', weight: 1,
    setup: (c) => { const h = foreignTarget(c); return !!h && choose(c, { otherHouseId: h }); },
    text: (c) => `The heir of House ${houseName(c, c.other)} finds ${nm(c.leader)} alone, and speaks softly of how the house might be run better.`,
    options: [
      { label: 'Listen', resolve: (c) => { c.fx.learnHouse(c.other, 10); } },
      { label: 'Encourage them', check: { who: who.leader, stats: ['intrigue', 'insight'], dc: 12 },
        resolve: (c, ok) => { if (ok) c.fx.learnHouse(c.other, 20).say('A friend inside their walls'); else c.fx.noticed().regard(c.other, -8); } },
      { label: 'Tell their Highroy', resolve: (c) => { c.fx.regard(c.other, 4).honour(1); } },
    ],
    fallback: 0,
  },
  {
    id: 'overheard', title: 'Overheard', category: 'Arrival', trigger: 'arrival', weight: 2,
    setup: (c) => { const h = foreignTarget(c); const p = randomParty(c); return !!h && !!p && choose(c, { otherHouseId: h, personId: p.id }); },
    text: (c) => `${full(c.person)} overhears House ${houseName(c, c.other)}'s counsellors arguing in a side room.`,
    options: [
      { label: 'Creep closer', check: { who: who.person, stats: ['stealth', 'perception'], dc: 11 },
        resolve: (c, ok) => { if (ok) c.fx.learnHouse(c.other, 15).progress(10); else c.fx.noticed().regard(c.other, -3); } },
      { label: 'Remember what was said', resolve: (c) => { c.fx.learnHouse(c.other, 5); } },
      { label: 'Walk away', resolve: (c) => { c.fx.honour(1); } },
    ],
    fallback: 1,
  },
  {
    id: 'poison', title: 'Poison at the feast', category: 'Arrival', trigger: 'arrival', weight: 1,
    setup: (c) => { const h = foreignTarget(c); const p = randomParty(c); return !!h && !!p && choose(c, { otherHouseId: h, personId: p.id }); },
    text: (c) => `${full(c.person)}'s cup smells wrong. The feast goes on around them.`,
    options: [
      { label: 'Have it tested', check: { who: who.best(['perception', 'insight']), stats: ['perception', 'insight'], dc: 10 },
        resolve: (c, ok) => { if (ok) c.fx.dread(2).learnHouse(c.other, 6).say('Poison, and we know whose'); else c.fx.regard(c.other, -3).say('Nothing found; the hosts are offended'); } },
      { label: 'Drink and trust your gut', check: { who: who.person, stats: ['constitution', 'endurance'], dc: 11 },
        resolve: (c, ok) => { if (ok) c.fx.respect(1); else c.fx.wound(c.person); } },
      { label: 'Feign illness and leave', resolve: (c) => { c.fx.progress(-10); } },
    ],
    fallback: 2,
  },
];

// ---------------------------------------------------------------- home: court and family

const court: EventDef[] = [
  {
    id: 'dockworkers', title: "The dockworkers' petition", category: 'Court', trigger: 'home', weight: 3,
    setup: (c) => { const s = worstSector(c); return !!s && choose(c, { sectorId: s.id }); },
    text: (c) => `The dockworkers of ${c.sector?.name} petition for better shares of the takings. Their foremen wait in the hall.`,
    options: [
      { label: 'Grant it', hint: '−300 othes', available: need(300), resolve: (c) => { c.fx.othes(-300).unrest(c.sector, -8).honour(1); } },
      { label: 'Send the Grand Master', resolve: (c) => { c.fx.dread(2).unrest(c.sector, -4).honour(-1); } },
      { label: 'Refuse', resolve: (c) => { c.fx.unrest(c.sector, 6); } },
    ],
    fallback: 2,
  },
  {
    id: 'feast', title: 'A seat at the feast', category: 'Court', trigger: 'home', weight: 2,
    setup: (c) => { const h = pickRival(c); return !!h && choose(c, { otherHouseId: h }); },
    text: (c) => `House ${houseName(c, c.other)} invites the Highroy to a feast. Refusing would be remembered.`,
    options: [
      { label: 'Attend yourself', check: { who: highroy, stats: ['diplomacy', 'eloquence'], dc: 10 },
        resolve: (c, ok) => { if (ok) c.fx.regard(c.other, 6).respect(1); else c.fx.regard(c.other, -2); } },
      { label: 'Send the Speaker', resolve: (c) => { c.fx.regard(c.other, 3); } },
      { label: 'Decline', resolve: (c) => { c.fx.regard(c.other, -3); } },
    ],
    fallback: 1,
  },
  {
    id: 'boundary', title: 'Boundary feud', category: 'Court', trigger: 'home', weight: 2,
    setup: (c) => { const s = sectors(c); return s.length > 0 && choose(c, { sectorId: c.rng.pick(s).id }); },
    text: (c) => `Two families in ${c.sector?.name} quarrel over where one holding ends and the next begins. They want the Highroy to judge.`,
    options: [
      { label: 'Judge it yourself', check: { who: highroy, stats: ['law', 'insight'], dc: 11 },
        resolve: (c, ok) => { if (ok) c.fx.honour(2).unrest(c.sector, -3); else c.fx.unrest(c.sector, 5); } },
      { label: 'Buy one side out', hint: '−150 othes', available: need(150), resolve: (c) => { c.fx.othes(-150).unrest(c.sector, -2); } },
      { label: 'Leave them to it', resolve: (c) => { c.fx.unrest(c.sector, 4); } },
    ],
    fallback: 2,
  },
  {
    id: 'till', title: 'Hand in the till', category: 'Court', trigger: 'home', weight: 2,
    setup: (c) => {
      const greedy = athome(c).filter((x) => x.seat !== 'highroy').sort((a, b) => b.hidden.greed - a.hidden.greed).slice(0, 3);
      return greedy.length > 0 && choose(c, { personId: c.rng.pick(greedy).id });
    },
    text: (c) => `The ledgers don't balance, and the gap points toward ${full(c.person)}.`,
    options: [
      { label: 'Have the Steward dig', check: { who: (c) => seat(c, 'steward'), stats: ['stewardship', 'insight'], dc: 11 },
        resolve: (c, ok) => { if (ok) c.fx.othes(300).learnOf(c.person, 15).mood(c.person, -4); else c.fx.othes(-150).say('The trail went cold'); } },
      { label: 'Punish them openly', resolve: (c) => { c.fx.othes(150).mood(c.person, -10).dread(1).honour(1); } },
      { label: 'Let it go', resolve: (c) => { c.fx.othes(-Math.min(200, othes(c))); } },
    ],
    fallback: 2,
  },
  {
    id: 'riot', title: 'Riot in the sector', category: 'Court', trigger: 'home', weight: 2,
    setup: (c) => { const s = worstSector(c); return !!s && s.unrest >= 25 && choose(c, { sectorId: s.id }); },
    text: (c) => `${c.sector?.name} has boiled over. Crowds hold the market quarter and the Watch has pulled back.`,
    options: [
      { label: 'Send the knights', resolve: (c) => { c.fx.unrest(c.sector, -10).dread(3).honour(-2); } },
      { label: 'Speak to the crowd', check: { who: highroy, stats: ['eloquence', 'leadership'], dc: 12 },
        resolve: (c, ok) => { if (ok) c.fx.unrest(c.sector, -8).respect(2); else c.fx.unrest(c.sector, 5).respect(-1); } },
      { label: 'Pay them off', hint: '−400 othes', available: need(400), resolve: (c) => { c.fx.othes(-400).unrest(c.sector, -6); } },
    ],
    fallback: 0,
  },
  {
    id: 'foundry', title: 'The foundry speaker', category: 'Court', trigger: 'home', weight: 1,
    setup: (c) => { const s = sectors(c); return s.length > 0 && choose(c, { sectorId: c.rng.pick(s).id }); },
    text: (c) => `A foundry worker in ${c.sector?.name} has started speaking for the workers, and they listen to her.`,
    options: [
      { label: 'Hear her out', resolve: (c) => { c.fx.unrest(c.sector, -4).respect(-1); } },
      { label: 'Give her a post', hint: '−100 othes', available: need(100), resolve: (c) => { c.fx.othes(-100).unrest(c.sector, -6); } },
      { label: 'Silence her', resolve: (c) => { c.fx.dread(2).unrest(c.sector, 3).honour(-1); } },
    ],
    fallback: 0,
  },
  {
    id: 'caigeLoyalty', title: 'A Caige for loyalty', category: 'Court', trigger: 'home', weight: 2,
    setup: (c) => {
      const free = caigesOf(c.world, c.house).filter((x) => !x.bondedTo);
      const k = knights(c).filter((x) => !cannotBond(x));
      return free.length > 0 && k.length > 0 && choose(c, { personId: c.rng.pick(k).id });
    },
    text: (c) => `${full(c.person)} asks to be bonded to one of the house's unbonded Caiges, and swears to serve the better for it.`,
    options: [
      { label: 'Grant it', resolve: (c) => {
        const cg = caigesOf(c.world, c.house).find((x) => !x.bondedTo);
        if (cg && c.person) { cg.bondedTo = c.person.id; c.person.flags.push({ id: 'caigeBonded', since: c.world.date }); c.fx.say(`${nm(c.person)} is bonded to ${cg.name}`); }
        c.fx.mood(c.person, 10);
      } },
      { label: 'Promise it later', resolve: (c) => { c.fx.mood(c.person, 2); } },
      { label: 'Refuse', resolve: (c) => { c.fx.mood(c.person, -6); } },
    ],
    fallback: 1,
  },
  {
    id: 'saviour', title: 'An unexpected saviour', category: 'Court', trigger: 'home', weight: 1,
    setup: (c) => { const h = athome(c); return h.length > 0 && choose(c, { personId: c.rng.pick(h).id }); },
    text: (c) => `A stranger pulled ${full(c.person)} out of a fire in the lower quarter and walked off without a word. The house has found him.`,
    options: [
      { label: 'Reward him', hint: '−200 othes', available: need(200), resolve: (c) => { c.fx.othes(-200).honour(2).mood(c.person, 2); } },
      { label: 'Thank him publicly', resolve: (c) => { c.fx.respect(1).mood(c.person, 1); } },
      { label: 'Let it pass', resolve: (c) => { c.fx.mood(c.person, -2); } },
    ],
    fallback: 1,
  },
  {
    id: 'blades', title: 'Blades at dawn', category: 'Family', trigger: 'home', weight: 2,
    setup: (c) => {
      const h = athome(c).filter((x) => x.seat !== 'highroy');
      if (h.length < 2) return false;
      const [a, b] = c.rng.shuffle(h);
      return choose(c, { personId: a!.id, secondId: b!.id });
    },
    text: (c) => `${full(c.person)} and ${nm(c.second)} have called each other out. They mean to settle it at dawn, with blades.`,
    options: [
      { label: 'Forbid it', resolve: (c) => { c.fx.mood(c.person, -4).mood(c.second, -4); } },
      { label: 'Let them fight', resolve: (c) => {
        const [a, b] = c.rng.chance(0.5) ? [c.person, c.second] : [c.second, c.person];
        c.fx.say(`${nm(a)} wins`).wound(b).mood(a, 3).respect(1);
      } },
      { label: 'Reconcile them', check: { who: highroy, stats: ['diplomacy', 'leadership'], dc: 10 },
        resolve: (c, ok) => { if (ok) c.fx.mood(c.person, 3).mood(c.second, 3); else c.fx.mood(c.person, -3).mood(c.second, -3); } },
    ],
    fallback: 0,
  },
  {
    id: 'claim', title: 'A claim of blood', category: 'Family', trigger: 'home', weight: 1,
    setup: () => true,
    text: () => 'A young stranger claims to be the unacknowledged child of a late member of the house, and has papers to show it.',
    options: [
      { label: 'Have the Spymaster check', check: { who: (c) => seat(c, 'spymaster'), stats: ['insight', 'intrigue'], dc: 11 },
        resolve: (c, ok) => { if (ok) c.fx.say('A fraud, quietly sent away').honour(1); else c.fx.say('Nothing could be proven').respect(-1); } },
      { label: 'Recognise them', resolve: (c) => { c.fx.honour(1).respect(-2); } },
      { label: 'Turn them away', resolve: (c) => { c.fx.dread(1); } },
    ],
    fallback: 2,
  },
  {
    id: 'ambition', title: "Your sibling's ambition", category: 'Family', trigger: 'home', weight: 2,
    setup: (c) => {
      const amb = athome(c).filter((x) => x.seat !== 'highroy' && x.hidden.ambition >= 13);
      return amb.length > 0 && choose(c, { personId: c.rng.pick(amb).id });
    },
    text: (c) => `${full(c.person)} has been saying, too loudly, what they would do with the house.`,
    options: [
      { label: 'Give them more to do', resolve: (c) => { c.fx.mood(c.person, 8).respect(-1); } },
      { label: 'Rebuke them', resolve: (c) => { c.fx.mood(c.person, -8).dread(1); } },
      { label: 'Have them watched', resolve: (c) => { c.fx.learnOf(c.person, 20); } },
    ],
    fallback: 2,
  },
  {
    id: 'health', title: 'Failing health', category: 'Family', trigger: 'home', weight: 1,
    setup: (c) => {
      const old = athome(c).filter((x) => ageOf(x, c.world.date) > x.lifespan * 0.75);
      return old.length > 0 && choose(c, { personId: c.rng.pick(old).id });
    },
    text: (c) => `${full(c.person)} is failing. The Physician asks whether to spend on rare treatments.`,
    options: [
      { label: 'Spare no cost', hint: '−300 othes', available: need(300), resolve: (c) => { c.fx.othes(-300).mood(c.person, 6); if (c.person) c.person.lifespan += 3; c.fx.say('A few more years, perhaps'); } },
      { label: 'Keep them comfortable', resolve: (c) => { c.fx.mood(c.person, 2); } },
    ],
    fallback: 1,
  },
];

// ---------------------------------------------------------------- home: intrigue, resonance, economy

const intrigue: EventDef[] = [
  {
    id: 'spyArchive', title: 'Spy in the archive', category: 'Intrigue', trigger: 'home', weight: 2,
    setup: (c) => { const h = pickRival(c); return !!h && choose(c, { otherHouseId: h }); },
    text: (c) => `A clerk was caught copying the house's records. Under questioning he names House ${houseName(c, c.other)}.`,
    options: [
      { label: 'Execute him', resolve: (c) => { c.fx.dread(4).honour(-2).regard(c.other, -8); } },
      { label: 'Turn him', check: { who: (c) => seat(c, 'spymaster'), stats: ['intrigue', 'deception'], dc: 12 },
        resolve: (c, ok) => { if (ok) c.fx.learnHouse(c.other, 20); else c.fx.regard(c.other, -3).say('He fled home'); } },
      { label: 'Send him back', resolve: (c) => { c.fx.honour(2).regard(c.other, 2); } },
    ],
    fallback: 2,
  },
  {
    id: 'letter', title: 'A letter you never wrote', category: 'Intrigue', trigger: 'home', weight: 2,
    setup: (c) => { const h = pickRival(c); return !!h && choose(c, { otherHouseId: h }); },
    text: (c) => `House ${houseName(c, c.other)} has a letter under our seal, full of insults. We never wrote it.`,
    options: [
      { label: 'Denounce it publicly', resolve: (c) => { c.fx.respect(-1).regard(c.other, 3); } },
      { label: 'Find the forger', check: { who: (c) => seat(c, 'spymaster'), stats: ['insight', 'intrigue'], dc: 12 },
        resolve: (c, ok) => { if (ok) { const f = pickRival(c, c.other); c.fx.regard(c.other, 5).say(`The trail leads to House ${houseName(c, f)}`).learnHouse(f, 10); } else c.fx.regard(c.other, -4); } },
      { label: 'Let it stand', resolve: (c) => { c.fx.regard(c.other, -6).dread(1); } },
    ],
    fallback: 0,
  },
  {
    id: 'story', title: "The story doesn't match", category: 'Intrigue', trigger: 'home', weight: 1,
    setup: (c) => { const back = athome(c).filter((x) => x.lastMission); return back.length > 0 && choose(c, { personId: c.rng.pick(back).id }); },
    text: (c) => `${full(c.person)}'s account of their last mission doesn't match what the crew say.`,
    options: [
      { label: 'Question them', check: { who: highroy, stats: ['insight', 'composure'], dc: 11 },
        resolve: (c, ok) => { c.fx.learnOf(c.person, ok ? 20 : 5); if (!ok) c.fx.mood(c.person, -4); } },
      { label: 'Trust them', resolve: (c) => { c.fx.mood(c.person, 3); } },
    ],
    fallback: 1,
  },
  {
    id: 'blackmail', title: 'Blackmail', category: 'Intrigue', trigger: 'home', weight: 2,
    setup: (c) => { const h = athome(c); return h.length > 0 && choose(c, { personId: c.rng.pick(h).id }); },
    text: (c) => `A note arrives: pay, or the city learns what ${full(c.person)} did last Orbit.`,
    options: [
      { label: 'Pay', hint: '−300 othes', available: need(300), resolve: (c) => { c.fx.othes(-300); } },
      { label: 'Hunt the writer', check: { who: (c) => seat(c, 'spymaster'), stats: ['intrigue', 'perception'], dc: 12 },
        resolve: (c, ok) => { if (ok) c.fx.dread(2).say('The writer is found and silenced'); else c.fx.respect(-3).mood(c.person, -5); } },
      { label: 'Let them talk', resolve: (c) => { c.fx.respect(-3).mood(c.person, -5); } },
    ],
    fallback: 2,
  },
  {
    id: 'informant', title: "The informant's price", category: 'Intrigue', trigger: 'home', weight: 2,
    setup: (c) => { const h = pickRival(c); return !!h && choose(c, { otherHouseId: h }); },
    text: (c) => `A servant of House ${houseName(c, c.other)} offers to talk, for 250 othes.`,
    options: [
      { label: 'Pay', hint: '−250 othes', available: need(250), resolve: (c) => { c.fx.othes(-250).learnHouse(c.other, 15); } },
      { label: 'Haggle', check: { who: (c) => seat(c, 'spymaster'), stats: ['negotiation', 'intrigue'], dc: 11 },
        resolve: (c, ok) => { if (ok) c.fx.othes(-Math.min(100, othes(c))).learnHouse(c.other, 15); else c.fx.say('The servant walks'); } },
      { label: 'Refuse', resolve: (c) => { c.fx.say('Nothing gained'); } },
    ],
    fallback: 2,
  },
  {
    id: 'names', title: 'Names for sale', category: 'Intrigue', trigger: 'home', weight: 1,
    setup: (c) => { const h = pickRival(c); return !!h && choose(c, { otherHouseId: h }); },
    text: (c) => `A broker offers a list: everyone who matters in House ${houseName(c, c.other)}, and what they're worth.`,
    options: [
      { label: 'Buy it', hint: '−400 othes', available: need(400), resolve: (c) => { c.fx.othes(-400).learnHouse(c.other, 15, false); } },
      { label: 'Pass', resolve: (c) => { c.fx.say('The list goes elsewhere'); } },
    ],
    fallback: 1,
  },
  {
    id: 'defector', title: 'A defector at the gate', category: 'Intrigue', trigger: 'home', weight: 1,
    setup: (c) => { const h = pickRival(c); return !!h && choose(c, { otherHouseId: h }); },
    text: (c) => `A courtier of House ${houseName(c, c.other)} is at the gate, asking for shelter and offering everything he knows.`,
    options: [
      { label: 'Take him in', resolve: (c) => { c.fx.learnHouse(c.other, 25).regard(c.other, -10); } },
      { label: 'Send him back', resolve: (c) => { c.fx.regard(c.other, 5).honour(1); } },
      { label: 'Sell him to them', resolve: (c) => { c.fx.othes(300).honour(-3).regard(c.other, 2); } },
    ],
    fallback: 1,
  },
  {
    id: 'whoseSide', title: 'Whose side is he on?', category: 'Intrigue', trigger: 'home', weight: 2,
    setup: (c) => { const a = agentsOf(c.world, c.house); return a.length > 0 && choose(c, { personId: c.rng.pick(a).id }); },
    text: (c) => `${full(c.person)}'s reports have been too tidy lately. The Spymaster wonders who else they report to.`,
    options: [
      { label: 'Confront them', resolve: (c) => { c.fx.learnOf(c.person, 15).mood(c.person, -5); } },
      { label: 'Feed them false news', check: { who: (c) => seat(c, 'spymaster'), stats: ['intrigue', 'deception'], dc: 11 },
        resolve: (c, ok) => { if (ok) c.fx.learnOf(c.person, 25).say('If they talk, we will know to whom'); else c.fx.mood(c.person, -3); } },
      { label: 'Trust them', resolve: (c) => { c.fx.mood(c.person, 2); } },
    ],
    fallback: 2,
  },
  {
    id: 'motion', title: 'A motion against you', category: 'Numarade', trigger: 'home', weight: 1,
    setup: (c) => { const h = pickRival(c); return !!h && choose(c, { otherHouseId: h }); },
    text: (c) => `House ${houseName(c, c.other)} has raised a motion of censure against our house in the Numarade.`,
    options: [
      { label: 'Lobby the floor', check: { who: (c) => seat(c, 'envoy') ?? highroy(c), stats: ['diplomacy', 'eloquence'], dc: 11 },
        resolve: (c, ok) => { if (ok) c.fx.respect(2).regard(c.other, -2); else c.fx.respect(-4); } },
      { label: 'Bribe the votes', hint: '−500 othes', available: need(500), resolve: (c) => { c.fx.othes(-500).honour(-1); } },
      { label: 'Rally our friends', available: (c) => (rivals(c).some((h) => relation(c.world, h, c.house) >= 30) ? null : 'No house likes us enough'),
        resolve: (c) => { c.fx.respect(1).regard(c.other, -3); } },
      { label: 'Accept the censure', resolve: (c) => { c.fx.respect(-5); } },
    ],
    fallback: 3,
  },
];

const resonance: EventDef[] = [
  {
    id: 'bladeChanged', title: 'The blade changed', category: 'Resonance', trigger: 'home', weight: 1,
    setup: (c) => { const b = athome(c).filter((x) => hasFlag(x, 'caigeBonded')); return b.length > 0 && choose(c, { personId: c.rng.pick(b).id }); },
    text: (c) => `${full(c.person)} says their Caige has changed: heavier in the hand, quicker to answer.`,
    options: [
      { label: 'Train with it', resolve: (c) => { c.fx.stat(c.person, 'caigeSync', 1).mood(c.person, 2); } },
      { label: 'Seek the Elder', resolve: (c) => { c.fx.stat(c.person, 'resonanceControl', 1); } },
      { label: 'Set it aside a while', resolve: (c) => { c.fx.mood(c.person, -3); } },
    ],
    fallback: 1,
  },
  {
    id: 'dream', title: 'A voice in the dream', category: 'Resonance', trigger: 'home', weight: 1,
    setup: (c) => { const h = athome(c).filter((x) => x.resonance); return h.length > 0 && choose(c, { personId: c.rng.pick(h).id }); },
    text: (c) => `${full(c.person)} has heard the same voice three nights running. It knows their name.`,
    options: [
      { label: 'Listen to it', check: { who: who.person, stats: ['willpower', 'resonanceControl'], dc: 11 },
        resolve: (c, ok) => { if (ok) c.fx.stat(c.person, 'resonanceControl', 1); else { if (c.person) c.person.hidden.drift += 1; c.fx.mood(c.person, -4).say('Something followed them back'); } } },
      { label: 'Keep them busy', resolve: (c) => { c.fx.mood(c.person, -1); } },
    ],
    fallback: 1,
  },
  {
    id: 'godglass', title: 'Godglass in the ranks', category: 'Resonance', trigger: 'home', weight: 1,
    setup: (c) => { const k = knights(c); return k.length > 0 && choose(c, { personId: c.rng.pick(k).id }); },
    text: (c) => `${full(c.person)} has been taking godglass to sharpen their resonance. The other knights know.`,
    options: [
      { label: 'Treat them', hint: '−200 othes', available: need(200), resolve: (c) => { c.fx.othes(-200).mood(c.person, -2); } },
      { label: 'Look away', resolve: (c) => { c.fx.say('The habit continues, quietly').stat(c.person, 'valor', 1); if (c.person) { c.person.hidden.drift += 1; c.person.flags.push({ id: 'godglass', since: c.world.date }); } } },
      { label: 'Strip their spurs', resolve: (c) => { c.fx.mood(c.person, -12).honour(1).moodAll(knights(c).filter((x) => x !== c.person), -1, 'The knights'); } },
    ],
    fallback: 1,
  },
];

const economy: EventDef[] = [
  {
    id: 'convoy', title: 'Convoy taken', category: 'Economy', trigger: 'home', weight: 2,
    setup: () => true,
    text: () => 'A provisions convoy bound for the house was taken in the lanes. The raiders are still close.',
    options: [
      { label: 'Send the Grand Master after it', check: { who: (c) => seat(c, 'grandMaster'), stats: ['tactics', 'leadership'], dc: 11 },
        resolve: (c, ok) => { if (ok) c.fx.dread(2).say('The cargo is back'); else c.fx.good('provisions', -60).wound(seat(c, 'grandMaster')); } },
      { label: 'Write it off', resolve: (c) => { c.fx.good('provisions', -60); } },
    ],
    fallback: 1,
  },
  {
    id: 'cornering', title: 'Someone is cornering metals', category: 'Economy', trigger: 'home', weight: 1,
    setup: (c) => { const h = pickRival(c); return !!h && choose(c, { otherHouseId: h }); },
    text: (c) => `Agents of House ${houseName(c, c.other)} are buying every load of metals on the Exchange.`,
    options: [
      { label: 'Sell ours high', available: (c) => (econ(c.world, c.house).stock.metals >= 30 ? null : 'Needs 30 metals'), resolve: (c) => { c.fx.good('metals', -30).othes(450); } },
      { label: 'Buy before they do', hint: '−400 othes', available: need(400), resolve: (c) => { c.fx.othes(-400).good('metals', 40); } },
      { label: 'Ignore it', resolve: (c) => { c.fx.say('Prices climb'); } },
    ],
    fallback: 2,
  },
  {
    id: 'quota', title: 'Quota threat', category: 'Economy', trigger: 'home', weight: 1,
    setup: () => true,
    text: () => 'An Imperial collector says the house is behind on its quota, and hints the shortfall could be "overlooked".',
    options: [
      { label: 'Pay what he asks', hint: '−300 othes', available: need(300), resolve: (c) => { c.fx.othes(-300); } },
      { label: 'Show him the books', check: { who: (c) => seat(c, 'steward'), stats: ['stewardship', 'law'], dc: 11 },
        resolve: (c, ok) => { if (ok) c.fx.honour(1).say('He leaves with nothing'); else c.fx.othes(-Math.min(400, othes(c))); } },
      { label: 'Send him away', resolve: (c) => { c.fx.respect(-3).dread(1); } },
    ],
    fallback: 1,
  },
];

export const EVENTS: EventDef[] = [...travel, ...arrival, ...court, ...intrigue, ...resonance, ...economy];
registerEvents(EVENTS);
