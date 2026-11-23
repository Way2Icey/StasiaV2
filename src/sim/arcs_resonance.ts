// Batch A: resonance and Caige arcs (R1–R9) and the struggles they open (the hunted child, the Drift).
import { addEvents, choose, type Ctx, type EventDef } from './events';
import {
  at, athome, away, band, best, bond, bonded, caigeOf, cast, CYCLES, data, days, defect, fighters, fought, freeCaiges, full,
  H, hasFlag, highroy, knights, need, newCaige, nm, pickRival, resonate, seat, sectors, stranger, toBattle, unbondFrom, who,
} from './arckit';
import { endStruggle, pushStruggle, startStruggle } from './story';
import { shiftFavour } from './houses';
import { barsOf, setBond, shiftBoth, shiftOpinion } from './relationships';
import { addThread } from './storystate';
import { cannotGrant } from './discovery';
import { seatHolder } from './query';
import { kill } from './death';
import { ageOf } from './characters';
import { isAway } from './court';
import type { Character } from './types';
import { addCycles } from './time';

const T = 'Resonance';
const strug = (c: Ctx) => c.struggle;

// ---------------------------------------------------------------- R1 The Second Band

const r1: EventDef[] = [
  {
    id: 'r1a', title: 'The second band', arc: 'The second band', category: T, trigger: 'home', weight: 2, act: 'rising',
    setup: (c) => { const p = cast(c, athome(c).filter((x) => x.resonance?.band === 'ambercore' && x.resonance.degrees >= 170)); return !!p && choose(c, { personId: p.id }); },
    text: (c) => `Since the last fight, ${full(c.person)}'s resonance has not settled. The Physician measures ${c.person?.resonance?.degrees ?? 0}°S, and rising. At this rate they will cross into Redline within the Orbit.`,
    options: [
      { label: 'Let it climb', hint: 'power, and attention', resolve: (c) => resonate(c, c.person, 70), then: (c) => ({ next: 'r1b', after: days(c, 20, 40) }) },
      { label: 'Slow it with the Elder', check: { who: who.person, stats: ['resonanceControl', 'willpower'], dc: 11 },
        resolve: (c, ok) => { if (ok) c.fx.stat(c.person, 'resonanceControl', 1).say('It settles'); else resonate(c, c.person, 60); },
        then: (c, ok) => (ok ? null : { next: 'r1b', after: days(c, 20, 40) }), ending: 'Settled by the Elder.' },
      { label: 'Hide the reading', resolve: (c) => { data(c).hidden = 1; resonate(c, c.person, 70); c.fx.thread(c.person, 'secret', 'An unregistered Redline'); }, then: (c) => ({ next: 'r1b', after: days(c, 20, 40) }) },
    ],
    fallback: 1,
  },
  {
    id: 'r1b', title: 'Redline', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!c.person?.alive,
    text: (c) => (c.arc?.data?.hidden
      ? `Word has got out anyway. The Archon temple knows ${nm(c.person)} burns Redline, and is asking why the house kept it from the Numarade.`
      : `${full(c.person)} is Redline now. The Archon temple calls it divine and has petitioned the Numarade to register them by name.`),
    options: [
      { label: 'Register them', hint: 'favour up; every house now watches them', resolve: (c) => { shiftFavour(c.world, c.house, 3); c.fx.respect(1); data(c).watched = 1; }, then: (c) => ({ next: 'r1c', after: days(c, 30, 50) }) },
      { label: 'Refuse the temple', resolve: (c) => { shiftFavour(c.world, c.house, -2); c.fx.dread(1); }, then: (c) => ({ next: 'r1c', after: days(c, 30, 60) }) },
      { label: 'Send them to an outer holding', hint: 'away an Orbit', resolve: (c) => { away(c, c.person, CYCLES.ORBIT, 'kept out of sight'); c.fx.mood(c.person, -4); }, ending: 'Hidden in the outer holdings.' },
    ],
    fallback: 0,
  },
  {
    id: 'r1c', title: 'The buyer', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => { const h = pickRival(c); return !!c.person?.alive && !!h && choose(c, { otherHouseId: h }); },
    text: (c) => `House ${H(c, c.other)} has made ${nm(c.person)} an offer: a seat, a ship, a Caige of their own. Their Spymaster has been seen near our gates.`,
    options: [
      { label: 'Set our Spymaster against theirs', check: { who: (c) => seat(c, 'spymaster'), stats: ['intrigue', 'insight'], dc: 0, vs: (c) => (c.other ? seatHolder(c.world, c.other, 'spymaster') : undefined), vsStats: ['intrigue', 'deception'] },
        resolve: (c, ok) => { if (ok) c.fx.learnHouse(c.other, 15).regard(c.other, -4).say('Their agent is turned out of the city'); else c.fx.say('They got to them anyway'); },
        then: (_c, ok) => (ok ? null : { next: 'r1d', after: 2 }), ending: 'The buyer was turned away.' },
      { label: 'Offer them more', hint: '−800 othes', available: need(800), resolve: (c) => { c.fx.othes(-800).mood(c.person, 10); if (c.person) c.person.hidden.loyalty += 2; }, ending: 'They stayed, for a price.' },
      { label: 'Let them choose', resolve: (c) => { const p = c.person!; if (p.hidden.loyalty >= 11) { c.fx.say(`${nm(p)} stays`).mood(p, 6); } else defect(c, p, c.other); }, ending: 'They chose.' },
    ],
    fallback: 0,
  },
  {
    id: 'r1d', title: 'Taken in the night', category: T, trigger: 'home', weight: 0, stage: true, urgent: true,
    setup: (c) => !!c.person?.alive && !!c.other,
    text: (c) => `${full(c.person)} was taken from their rooms by House ${H(c, c.other)}'s people. Their ship is still docked at the station above the capital.`,
    options: [
      { label: 'Get them back', hint: '⚔ station', resolve: (c) => toBattle(c, { title: `Taking back ${nm(c.person)}`, theatre: 'station', where: 'the high station', ours: fighters(c).slice(0, 4), foes: band(`${H(c, c.other)}'s agent`, 12, 3, 9, 'a guard'), foeName: `House ${H(c, c.other)}'s men`, foeHouse: c.other }), then: () => ({ next: 'r1e', after: 1 }) },
      { label: 'Let them go', resolve: (c) => { defect(c, c.person, c.other); c.fx.respect(-2); }, ending: 'Lost to a rival.' },
    ],
    fallback: 0,
  },
  {
    id: 'r1e', title: 'After the station', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!fought(c),
    text: (c) => (fought(c)!.won ? `${full(c.person)} is home, and House ${H(c, c.other)} knows what it costs to reach for what is ours.` : `The ship cast off with ${nm(c.person)} aboard.`),
    options: [{ label: 'So be it', resolve: (c) => { const f = fought(c)!; if (f.won) { c.fx.dread(2).regard(c.other, -10); c.fx.thread(c.person, 'debt', 'Brought home by the house', highroy(c)?.id); } else { defect(c, c.person, c.other); c.fx.respect(-3); } } }],
    fallback: 0,
  },
];

// ---------------------------------------------------------------- R2 The Caige That Won't Wake

const r2: EventDef[] = [
  {
    id: 'r2a', title: "The Caige that won't wake", arc: "The Caige that won't wake", category: T, trigger: 'home', weight: 1.5, act: 'calm',
    setup: (c) => { const g = cast(c, freeCaiges(c) as never[]) as unknown as { id: string } | undefined; if (!g) return false; data(c).caige = g.id; return true; },
    text: (c) => `The house has tried three bearers with ${c.world.armoury[String(c.arc?.data?.caige ?? c.memo?.caige)]?.name ?? 'the Caige'}. It would not wake for any of them, and the last came away with burned hands.`,
    options: [
      { label: 'Ask the Elder', resolve: (c) => { c.fx.say('The Elder takes it to the archive'); }, then: (c) => ({ next: 'r2b', after: days(c, 20, 30) }) },
      { label: "Try one of the Highroy's blood", check: { who: (c) => best(athome(c).filter((x) => x.familyId === highroy(c)?.familyId && !cannotGrant(c.world, x)), (x) => x.stats.caigeSync), stats: ['caigeSync'], dc: 13 },
        resolve: (c, ok) => { const x = best(athome(c).filter((y) => y.familyId === highroy(c)?.familyId && !cannotGrant(c.world, y)), (y) => y.stats.caigeSync); const g = c.world.armoury[String(data(c).caige)]; if (ok) { bond(c, x, g); c.fx.thread(x, 'omen', 'Woke a Caige no one else could'); } else c.fx.wound(x); },
        then: (c, ok) => (ok ? null : { next: 'r2b', after: days(c, 20, 30) }), ending: 'It woke for the Highroy\'s blood.' },
      { label: 'Sell it at the Exchange', hint: '+2,500 othes', resolve: (c) => { const g = c.world.armoury[String(data(c).caige)]; if (g) delete c.world.armoury[g.id]; c.fx.othes(2500).honour(-1); }, ending: 'Sold.' },
    ],
    fallback: 0,
  },
  {
    id: 'r2b', title: 'The first bearer', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => { const h = pickRival(c); return !!h && !!c.world.armoury[String(c.arc?.data?.caige)] && choose(c, { otherHouseId: h }); },
    text: (c) => `The Elder found it. Its first bearer was a knight of House ${H(c, c.other)}, dead two hundred years. It is waiting for their blood.`,
    options: [
      { label: 'Find the descendant', hint: 'a search through their worlds', resolve: (c) => c.fx.othes(-200), then: (c) => ({ next: 'r2c', after: days(c, 30, 50) }) },
      { label: 'Force it with godglass', check: { who: (c) => best(athome(c).filter((x) => !cannotGrant(c.world, x)), (x) => x.stats.caigeSync), stats: ['caigeSync', 'willpower'], dc: 12 },
        resolve: (c, ok) => { const x = best(athome(c).filter((y) => !cannotGrant(c.world, y)), (y) => y.stats.caigeSync); if (!x) return; x.hidden.drift += 2; x.flags.push({ id: 'godglass', since: c.world.date }); if (ok) bond(c, x, c.world.armoury[String(data(c).caige)]); else c.fx.wound(x).say('It burned them'); }, ending: 'Forced.' },
      { label: `Return it to its house`, hint: 'a favour owed us', resolve: (c) => { const g = c.world.armoury[String(data(c).caige)]; if (g && c.other) g.houseId = c.other; c.fx.regard(c.other, 15).honour(2); const h = highroy(c); if (h) addThread(c.world, h.id, 'favour', `House ${H(c, c.other)} owes us for a Caige returned`, c.other); }, ending: 'Returned to its house.' },
    ],
    fallback: 0,
  },
  {
    id: 'r2c', title: 'The descendant', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!c.other && !!c.world.armoury[String(c.arc?.data?.caige)],
    text: (c) => `A girl of fourteen in the undercity of House ${H(c, c.other)}'s capital. When our people showed her the Caige, it hummed.`,
    options: [
      { label: 'Bring her into the house', hint: '−300 othes; the Caige wakes for her', resolve: (c) => { const g = c.world.armoury[String(data(c).caige)]; const p = stranger(c, { planetId: c.world.houses[c.other!]!.capitalPlanetId, join: 'Youngling', young: true }); resonate(c, p, 160); bond(c, p, g); c.fx.othes(-300).regard(c.other, -4); addThread(c.world, p.id, 'omen', 'Carries a Caige that waited two hundred years for her'); } },
      { label: 'Leave her be', resolve: (c) => c.fx.say('The Caige stays silent') },
    ],
    fallback: 1,
  },
];

// ---------------------------------------------------------------- R3 Resonance Storm

const r3: EventDef[] = [
  {
    id: 'r3a', title: 'Resonance storm', arc: 'The storm', category: T, trigger: 'home', weight: 1, act: 'crisis', urgent: true,
    setup: (c) => { const s = sectors(c); return s.length > 0 && choose(c, { sectorId: c.rng.pick(s).id }); },
    text: (c) => `A storm of free resonance is breaking over ${c.sector?.name}. Lights die, engines stall, and people who never felt anything are screaming at a sound no one else hears.`,
    options: [
      { label: 'Evacuate', hint: '−600 othes', available: need(600), resolve: (c) => { c.fx.othes(-600).unrest(c.sector, -3); }, then: (c) => ({ next: 'r3b', after: days(c, 8, 16) }) },
      { label: 'Shelter in place', resolve: (c) => { c.fx.unrest(c.sector, 8); if (c.rng.chance(0.3)) c.fx.wound(cast(c, athome(c))); }, then: (c) => ({ next: 'r3b', after: days(c, 8, 16) }) },
      { label: 'Send our bearers to draw it off', check: { who: (c) => best([...bonded(c), ...athome(c).filter((x) => x.resonance && x.resonance.band !== 'frostpoint')], (x) => x.stats.resonanceControl), stats: ['resonanceControl', 'willpower'], dc: 12 },
        resolve: (c, ok) => { const x = best([...bonded(c), ...athome(c).filter((y) => y.resonance && y.resonance.band !== 'frostpoint')], (y) => y.stats.resonanceControl); if (ok) { resonate(c, x, 40); c.fx.thread(x, 'omen', 'Drank a resonance storm').unrest(c.sector, -5).respect(2); } else c.fx.wound(x).unrest(c.sector, 4); },
        then: (c) => ({ next: 'r3b', after: days(c, 8, 16) }) },
    ],
    fallback: 1,
  },
  {
    id: 'r3b', title: 'The woken', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!c.sector,
    text: (c) => `When the storm passed, three people in ${c.sector?.name} had woken. Two are Bluewake. The third is a girl of nine, and the Physician's instruments read her at over four hundred degrees. A temple order has already asked for her. So has a corsair company.`,
    options: [
      { label: 'Take her into the house', hint: 'and keep her safe', resolve: (c) => { const p = stranger(c, { sectorId: c.sector!.id, join: 'Youngling', young: true }); resonate(c, p, 410); data(c).child = p.id; addThread(c.world, p.id, 'omen', 'Woke Whitebreak in a resonance storm'); startStruggle(c.world, 'hunted', { strength: 13, theirName: 'a temple order and a corsair company', cast: { personId: p.id }, ours: [seat(c, 'champion')?.id].filter(Boolean) as string[] }); }, then: (c) => ({ next: 'r3c', after: days(c, 12, 24) }) },
      { label: 'Give her to the temple', resolve: (c) => { shiftFavour(c.world, c.house, 3); c.fx.honour(-1); }, ending: 'Given to the temple.' },
      { label: 'Do nothing', resolve: (c) => c.fx.say('Someone else will decide for her'), ending: 'Left to others.' },
    ],
    fallback: 2,
  },
  {
    id: 'r3c', title: 'They come for her', category: T, trigger: 'home', weight: 0, stage: true, urgent: true,
    setup: (c) => !!at(c, c.arc?.data?.child)?.alive,
    text: (c) => `A corsair drop ship has come down in ${c.sector?.name}. They are going door to door, asking for a girl of nine.`,
    options: [
      { label: 'Defend the sector', hint: '⚔ surface', resolve: (c) => toBattle(c, { title: `The defence of ${c.sector?.name}`, theatre: 'surface', where: c.sector?.name ?? 'the sector', ours: fighters(c).slice(0, 4), foes: band('the drop captain', 13, 3, 10, 'a raider'), foeName: 'the raiders', foeMass: 35 }), then: () => ({ next: 'r3d', after: 1 }) },
      { label: 'Hide her away', check: { who: (c) => seat(c, 'spymaster'), stats: ['stealth', 'intrigue'], dc: 11 },
        resolve: (c, ok) => { pushStruggle(c.world, c.world.story?.struggles.find((s) => s.kind === 'hunted' && s.cast.personId === c.arc?.data?.child)?.id, ok ? 15 : -15, ok ? 'Hidden well' : 'Nearly found'); c.fx.unrest(c.sector, 4); } },
    ],
    fallback: 1,
  },
  {
    id: 'r3d', title: 'After the drop', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!fought(c),
    text: (c) => (fought(c)!.won ? 'The raiders are dead or fled. The girl watched from a window and has asked to learn the blade.' : 'The raiders broke our line. The girl hid in a cistern for a day; they did not find her, this time.'),
    options: [{ label: 'Go on', resolve: (c) => { const s = c.world.story?.struggles.find((x) => x.kind === 'hunted' && x.cast.personId === c.arc?.data?.child); pushStruggle(c.world, s?.id, fought(c)!.won ? 25 : -20); if (fought(c)!.won) c.fx.dread(2); } }],
    fallback: 0,
  },
];

// ---------------------------------------------------------------- R4 The Bearer's Twin

const r4: EventDef[] = [
  {
    id: 'r4a', title: "The bearer's twin", arc: "The bearer's twin", category: T, trigger: 'home', weight: 1.5, act: 'rising',
    setup: (c) => {
      for (const b of c.rng.shuffle(bonded(c))) {
        const sib = athome(c).find((x) => x.id !== b.id && x.familyId === b.familyId && !hasFlag(x, 'caigeBonded') && x.resonance && x.resonance.band !== 'frostpoint' && Math.abs(ageOf(x, c.world.date) - ageOf(b, c.world.date)) <= 6);
        if (sib) return choose(c, { personId: b.id, secondId: sib.id });
      }
      return false;
    },
    text: (c) => `${full(c.second)} can hear ${nm(c.person)}'s Caige. Louder than ${nm(c.person)} does. It turns toward them in the rack when they pass.`,
    options: [
      { label: 'Test them', check: { who: (c) => c.second, stats: ['caigeSync'], dc: 11 }, resolve: (c, ok) => { data(c).share = ok ? 1 : 0; c.fx.say(ok ? 'It answers them' : 'It answers, badly'); }, then: (c) => ({ next: 'r4b', after: days(c, 20, 40) }) },
      { label: 'Keep them apart', resolve: (c) => { c.fx.mood(c.person, -3).mood(c.second, -5); }, ending: 'Kept apart.' },
      { label: 'Let them share it', resolve: (c) => { data(c).share = 1; }, then: (c) => ({ next: 'r4b', after: days(c, 20, 40) }) },
    ],
    fallback: 1,
  },
  {
    id: 'r4b', title: 'Two bearers', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!c.person?.alive && !!c.second?.alive && !!caigeOf(c, c.person),
    text: (c) => {
      const close = barsOf(c.world, c.person!.id, c.second!.id).like >= 35;
      return close ? `${nm(c.person)} and ${nm(c.second)} carry the Caige between them. It sings for both. The knights have never seen anything like it.` : `The Caige will not settle between ${nm(c.person)} and ${nm(c.second)}. Each wakes to find the other's hand on it.`;
    },
    options: [{ label: 'Watch, and wait', resolve: (c) => {
      const close = barsOf(c.world, c.person!.id, c.second!.id).like >= 35;
      if (close) { c.fx.stat(c.person, 'caigeSync', 2).stat(c.second, 'caigeSync', 2); shiftBoth(c.world, c.person!.id, c.second!.id, 10, 'shared a Caige'); }
      else { shiftBoth(c.world, c.person!.id, c.second!.id, -25, 'fought over a Caige'); setBond(c.world, c.person!.id, c.second!.id, 'rival', 'rival', 'a Caige between them'); }
    }, then: (c) => ({ next: 'r4c', after: days(c, 30, 60) }) }],
    fallback: 0,
  },
  {
    id: 'r4c', title: 'One must give it up', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!c.person?.alive && !!c.second?.alive && !!caigeOf(c, c.person),
    text: (c) => `The Grand Master says it cannot go on: one of them must give up ${caigeOf(c, c.person)?.name}. The Highroy decides.`,
    options: [
      { label: (`The bearer keeps it`), resolve: (c) => { c.fx.thread(c.second, 'grudge', `Passed over for the Caige their sibling carries`, c.person?.id).mood(c.second, -8); } },
      { label: 'The twin takes it', resolve: (c) => { const g = caigeOf(c, c.person); bond(c, c.second, g); c.fx.thread(c.person, 'grudge', 'Their Caige was given to their sibling', highroy(c)?.id).mood(c.person, -12); } },
      { label: 'Back to the vault', resolve: (c) => { unbondFrom(c, c.person); c.fx.mood(c.person, -10).mood(c.second, -6); } },
    ],
    fallback: 0,
  },
];

// ---------------------------------------------------------------- R5 The Drift-Touched

const r5: EventDef[] = [
  {
    id: 'r5a', title: 'A warning', arc: 'The drift-touched', category: T, trigger: 'home', weight: 1.5, act: 'rising',
    setup: (c) => { const p = cast(c, athome(c).filter((x) => x.hidden.drift >= 11)); if (!p) return false; return choose(c, { personId: p.id }); },
    text: (c) => `${full(c.person)} came to the Steward white-faced: "The next convoy on the Ashfall lane will be taken. I have seen it." They could not say how.`,
    options: [
      { label: 'Reroute the convoy', hint: 'a delay, if they are wrong', resolve: (c) => { const tru = c.rng.chance(0.6); data(c).true = tru ? 1 : 0; data(c).acted = 1; if (tru) c.fx.say('Corsairs waited on the old lane, and caught nothing').mood(c.person, 4); else c.fx.othes(-150).say('Nothing came of it but the delay'); }, then: (c) => ({ next: 'r5b', after: days(c, 30, 50) }) },
      { label: 'Ignore it', resolve: (c) => { const tru = c.rng.chance(0.6); data(c).true = tru ? 1 : 0; if (tru) c.fx.good('provisions', -40).say('The convoy was taken, as they said'); else c.fx.say('The convoy came in'); }, then: (c) => ({ next: 'r5b', after: days(c, 30, 50) }) },
    ],
    fallback: 1,
  },
  {
    id: 'r5b', title: 'A darker vision', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => { const v = cast(c, athome(c).filter((x) => x.seat && x.seat !== 'highroy' && x.id !== c.person?.id)); return !!c.person?.alive && !!v && choose(c, { secondId: v.id }); },
    text: (c) => `${nm(c.person)} has seen ${full(c.second)} die before the Orbit is out. They will not say how. They are shaking.`,
    options: [
      { label: 'Keep them home with the Physician', resolve: (c) => { data(c).guard = 1; c.second?.flags.push({ id: 'rested', since: c.world.date, until: addCycles(c.world.date, 40) }); }, then: (c) => ({ next: 'r5c', after: days(c, 20, 40) }) },
      { label: 'Tell them', resolve: (c) => { c.fx.mood(c.second, -5); data(c).guard = 1; }, then: (c) => ({ next: 'r5c', after: days(c, 20, 40) }) },
      { label: 'Tell no one', resolve: () => {}, then: (c) => ({ next: 'r5c', after: days(c, 20, 40) }) },
    ],
    fallback: 2,
  },
  {
    id: 'r5c', title: 'Where the visions come from', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => { const h = pickRival(c); return !!c.person?.alive && !!h && choose(c, { otherHouseId: h }); },
    text: (c) => `The Spymaster has a theory about ${nm(c.person)}'s visions, and wants leave to test it.`,
    options: [
      { label: 'Let the Spymaster look into it', check: { who: (c) => seat(c, 'spymaster'), stats: ['intrigue', 'insight'], dc: 0, vs: (c) => (c.other ? seatHolder(c.world, c.other, 'spymaster') : undefined), vsStats: ['deception', 'intrigue'] },
        resolve: (c, ok) => {
          const real = c.arc?.data?.true === 1;
          if (!ok) { c.fx.say('Nothing found'); if (!real && !c.arc?.data?.guard) c.fx.wound(c.second).say(`${nm(c.second)} has an accident`); return; }
          if (real) c.fx.thread(c.person, 'omen', 'Their visions are their own').say('The visions are real');
          else { c.fx.learnHouse(c.other, 15).regard(c.other, -6).say(`An agent of House ${H(c, c.other)} had been whispering to them`); c.fx.thread(c.person, 'secret', 'Was fed false visions by a rival'); }
        } },
      { label: 'Leave it alone', resolve: (c) => { if (c.arc?.data?.true !== 1 && !c.arc?.data?.guard) c.fx.wound(c.second).say(`${nm(c.second)} has an accident`); } },
    ],
    fallback: 1,
  },
];

// ---------------------------------------------------------------- R6 The Passing

const r6: EventDef[] = [
  {
    id: 'r6a', title: 'The passing', arc: 'The passing', category: T, trigger: 'home', weight: 1.5, act: 'calm',
    setup: (c) => { const p = cast(c, bonded(c).filter((x) => ageOf(x, c.world.date) >= x.lifespan * 0.8)); return !!p && choose(c, { personId: p.id }); },
    text: (c) => `${full(c.person)} is failing, and ${caigeOf(c, c.person)?.name ?? 'their Caige'} knows it. They have asked to choose who carries it after them.`,
    options: [
      { label: 'To their own blood', available: (c) => (kin(c) ? null : 'No one of their blood can carry it'), resolve: (c) => { data(c).heir = kin(c)!.id; }, then: (c) => ({ next: 'r6b', after: days(c, 8, 16) }) },
      { label: 'To their squire', hint: 'the Champion and Grand Master advise', available: (c) => (squire(c) ? null : 'No one fit'), resolve: (c) => { data(c).heir = squire(c)!.id; }, then: (c) => ({ next: 'r6b', after: days(c, 8, 16) }) },
      { label: 'Back to the vault', resolve: (c) => { unbondFrom(c, c.person); c.fx.mood(c.person, -6); }, ending: 'Back to the vault.' },
    ],
    fallback: 2,
  },
  {
    id: 'r6b', title: 'The rite of passing', category: T, trigger: 'home', weight: 0, stage: true, urgent: true,
    setup: (c) => !!c.person?.alive && !!at(c, c.arc?.data?.heir)?.alive && !!caigeOf(c, c.person),
    text: (c) => `${nm(c.person)} lies in the vault with ${nm(at(c, c.arc?.data?.heir))} kneeling beside them, both hands on the Caige.`,
    options: [{ label: 'Begin the rite', check: { who: (c) => at(c, c.arc?.data?.heir), stats: ['caigeSync', 'resonanceControl'], dc: 12 },
      resolve: (c, ok) => {
        const heir = at(c, c.arc?.data?.heir);
        const g = caigeOf(c, c.person);
        if (ok) { bond(c, heir, g); c.fx.thread(heir, 'vow', `Swore to carry ${g?.name} as ${nm(c.person)} did`); }
        else { unbondFrom(c, c.person); c.fx.respect(-2).say('The Caige went silent; the court talks of a curse'); }
        if (c.person && c.rng.chance(0.3)) { kill(c.world, c.person, c.world.date, 'in the rite of passing'); c.fx.say(`${nm(c.person)} did not rise`); }
      } }],
    fallback: 0,
  },
];
function kin(c: Ctx): Character | undefined { return best(athome(c).filter((x) => x.id !== c.person?.id && x.familyId === c.person?.familyId && !cannotGrant(c.world, x)), (x) => x.stats.caigeSync); }
function squire(c: Ctx): Character | undefined { return best(knights(c).filter((x) => x.id !== c.person?.id && !cannotGrant(c.world, x)), (x) => x.stats.caigeSync + x.stats.resonanceControl); }

// ---------------------------------------------------------------- R7 Caige Theft

const r7: EventDef[] = [
  {
    id: 'r7a', title: 'The vault is open', arc: 'The stolen Caige', category: T, trigger: 'home', weight: 1, act: 'crisis', urgent: true,
    setup: (c) => {
      const g = freeCaiges(c)[0]; if (!g) return false;
      const sore = athome(c).filter((x) => (c.world.story?.threads ?? []).some((t) => !t.closed && t.kind === 'grudge' && t.personId === x.id && /Caige/.test(t.text)));
      const pool = athome(c).filter((x) => x.seat !== 'highroy');
      if (pool.length < 3) return false;
      const culprit = sore[0] ?? c.rng.pick(pool);
      const innocent = c.rng.pick(pool.filter((x) => x.id !== culprit.id));
      data(c).caige = g.id; data(c).kind = sore[0] ? 'ours' : c.rng.pick(['fixer', 'agent', 'ours']);
      return choose(c, { personId: culprit.id, secondId: innocent.id });
    },
    text: (c) => `${c.world.armoury[String(c.arc?.data?.caige ?? c.memo?.caige)]?.name ?? 'A Caige'} is gone from the vault. The Spymaster has three names: ${nm(c.person)}, ${nm(c.second)}, and a dock fixer.`,
    options: [
      { label: 'Seal the port', hint: '−300 othes', resolve: (c) => c.fx.othes(-300), then: (c) => ({ next: 'r7b', after: days(c, 6, 12) }) },
      { label: 'Post a bounty', hint: '−500 othes', resolve: (c) => c.fx.othes(-500), then: (c) => ({ next: 'r7b', after: days(c, 6, 12) }) },
      { label: 'Have the Spymaster work the suspects', check: { who: (c) => seat(c, 'spymaster'), stats: ['insight', 'intrigue'], dc: 0, vs: who.person, vsStats: ['deception', 'composure'] },
        resolve: (c, ok) => { if (ok && c.arc?.data?.kind === 'ours') { c.fx.say(`${nm(c.person)} breaks, and the Caige is under their floor`).mood(c.person, -15).dread(1); c.fx.thread(c.person, 'secret', 'Stole a Caige from the house'); } else { c.fx.mood(c.second, -12).thread(c.second, 'grudge', 'Was accused of stealing a Caige', seat(c, 'spymaster')?.id); } },
        then: (c, ok) => (ok && c.arc?.data?.kind === 'ours' ? null : { next: 'r7b', after: days(c, 6, 12) }), ending: 'Found under a floor.' },
    ],
    fallback: 0,
  },
  {
    id: 'r7b', title: 'The trail', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!c.world.armoury[String(c.arc?.data?.caige)],
    text: (c) => { const k = c.arc?.data?.kind; return k === 'ours' ? `It was ${full(c.person)}. They are aboard a cutter bound out of the system, with the Caige.` : k === 'agent' ? 'A rival\'s agent has it on a ship at the high station, waiting for clearance.' : 'A dock fixer has it, and wants 1,500 othes to give it back.'; },
    options: [
      { label: 'Take it back', hint: '⚔ ship', resolve: (c) => toBattle(c, { title: 'Taking back the Caige', theatre: 'ship', where: 'a cutter leaving the system', ours: fighters(c).filter((x) => x.id !== c.person?.id).slice(0, 4), foes: c.arc?.data?.kind === 'ours' && c.person ? [{ id: c.person.id, champion: true }, ...band('', 0, 2, 9, 'a hired hand').slice(1)] : band('the thief', 12, 2, 9, 'a hired hand'), foeName: 'the thieves' }), then: () => ({ next: 'r7c', after: 1 }) },
      { label: 'Pay for it', hint: '−1,500 othes', available: need(1500), resolve: (c) => c.fx.othes(-1500).say('It is back in the vault'), ending: 'Bought back.' },
      { label: 'Let it go', resolve: (c) => { const g = c.world.armoury[String(data(c).caige)]; if (c.arc?.data?.kind === 'ours' && c.person) { defect(c, c.person, pickRival(c)); bond(c, c.person, g); } else if (g) delete c.world.armoury[g.id]; c.fx.respect(-2); }, ending: 'Lost.' },
    ],
    fallback: 1,
  },
  {
    id: 'r7c', title: 'The Caige comes home, or not', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!fought(c),
    text: (c) => (fought(c)!.won ? 'The Caige is back in the vault.' : 'The cutter made the jump. The Caige is gone.'),
    options: [{ label: 'So be it', resolve: (c) => {
      const g = c.world.armoury[String(data(c).caige)];
      if (fought(c)!.won) { c.fx.dread(2); return; }
      if (c.arc?.data?.kind === 'ours' && c.person?.alive) { defect(c, c.person, pickRival(c)); bond(c, c.person, g); const k = cast(c, knights(c)); if (k) addThread(c.world, k.id, 'grudge', `${nm(c.person)} stole a Caige and got away`, c.person.id); }
      else if (g) delete c.world.armoury[g.id];
    } }],
    fallback: 0,
  },
];

// ---------------------------------------------------------------- R8 The Caige Remembers

const r8: EventDef[] = [
  {
    id: 'r8a', title: 'The Caige remembers', arc: 'The Caige remembers', category: T, trigger: 'home', weight: 1.5, act: 'calm',
    setup: (c) => { const p = cast(c, bonded(c).filter((x) => x.stats.caigeSync >= 12)); return !!p && choose(c, { personId: p.id }); },
    text: (c) => `${full(c.person)} talks in their sleep of a war two hundred years gone, in a voice that is not theirs. Last night they named a world, and a place on it where "the other one" was buried.`,
    options: [
      { label: 'Listen to it', hint: 'drift, for a map', resolve: (c) => { if (c.person) c.person.hidden.drift += 1; }, then: (c) => ({ next: 'r8b', after: days(c, 30, 50) }) },
      { label: 'Suppress it', resolve: (c) => c.fx.stat(c.person, 'resonanceControl', 1), ending: 'Silenced.' },
    ],
    fallback: 1,
  },
  {
    id: 'r8b', title: 'The cache', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => { const h = pickRival(c); return !!c.person?.alive && !!h && choose(c, { otherHouseId: h }); },
    text: (c) => `Our scouts found the place, on a world of House ${H(c, c.other)}: a sealed vault under a dead city. A survey party of House ${H(c, c.other)} found it the same week.`,
    options: [
      { label: 'Send the bearer with knights', hint: '⚔ surface', resolve: (c) => toBattle(c, { title: 'The race for the cache', theatre: 'surface', where: 'a dead city', ours: [c.person!, ...knights(c).filter((x) => x.id !== c.person?.id).slice(0, 3)], foes: band(`${H(c, c.other)}'s survey captain`, 12, 3, 10, 'a soldier'), foeName: `House ${H(c, c.other)}'s survey party`, foeHouse: c.other }), then: () => ({ next: 'r8c', after: 1 }) },
      { label: 'Buy the site from them', hint: '−1,200 othes', available: need(1200), resolve: (c) => { c.fx.othes(-1200).regard(c.other, 3); newCaige(c); }, ending: 'Bought.' },
      { label: 'Leave it to them', resolve: (c) => c.fx.regard(c.other, 2), ending: 'Left to a rival.' },
    ],
    fallback: 2,
  },
  {
    id: 'r8c', title: 'What was buried', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!fought(c),
    text: (c) => (fought(c)!.won ? 'The vault is open. Inside, wrapped in rotted silk, a second Caige.' : `House ${H(c, c.other)} holds the dead city now.`),
    options: [{ label: 'So be it', resolve: (c) => { if (fought(c)!.won) { newCaige(c, { band: 'redline' }); c.fx.regard(c.other, -8); } else c.fx.regard(c.other, -3); } }],
    fallback: 0,
  },
];

// ---------------------------------------------------------------- R9 Whitebreak

const r9: EventDef[] = [
  {
    id: 'r9a', title: 'Whitebreak', arc: 'Whitebreak', category: T, trigger: 'home', weight: 0.4, act: 'crisis', urgent: true,
    setup: (c) => { const p = cast(c, Object.values(c.world.characters).filter((x) => x.alive && x.houseId === c.house && ageOf(x, c.world.date) <= 2 && !isAway(c.world, x.id))); return !!p && choose(c, { personId: p.id }); },
    text: (c) => `The Physician took ${full(c.person)}'s first measure as a matter of course. The instrument cracked at four hundred degrees.`,
    options: [
      { label: 'Hide it', resolve: (c) => { resonate(c, c.person, 410); c.fx.thread(c.person, 'secret', 'A hidden Whitebreak'); startStruggle(c.world, 'hunted', { title: `Keeping ${nm(c.person)} safe`, strength: 11, theirName: 'those who would take a Whitebreak child', cast: { personId: c.person?.id } }); } },
      { label: 'Announce it', hint: 'respect up; every house watches', resolve: (c) => { resonate(c, c.person, 410); c.fx.respect(3); shiftFavour(c.world, c.house, -1); c.fx.thread(c.person, 'omen', 'Born Whitebreak'); startStruggle(c.world, 'hunted', { title: `Keeping ${nm(c.person)} safe`, strength: 15, theirName: 'those who would take a Whitebreak child', cast: { personId: c.person?.id } }); } },
      { label: 'Give the child to the temple', resolve: (c) => { resonate(c, c.person, 410); shiftFavour(c.world, c.house, 4); c.fx.honour(-2); away(c, c.person, CYCLES.ORBIT * 12, 'raised by the temple'); } },
    ],
    fallback: 0,
  },
];

// ---------------------------------------------------------------- struggles: the hunted child, the Drift

const hunted: EventDef[] = [
  { id: 'str:hunted:open', title: '', category: T, trigger: 'home', weight: 0, stage: true, setup: () => false, text: () => '', options: [{ label: '—', resolve: () => {} }], fallback: 0 },
  {
    id: 'str:hunted:down', title: 'In the night', category: T, trigger: 'home', weight: 0, stage: true, urgent: true,
    setup: (c) => !!c.person?.alive,
    text: (c) => `Masked men in the children's wing. They came for ${full(c.person)}.`,
    options: [
      { label: 'Stand and fight', hint: '⚔ station', resolve: (c) => toBattle(c, { title: `The children's wing`, theatre: 'station', where: 'the children\'s wing of the citadel', ours: fighters(c).slice(0, 3), foes: band('a masked leader', 13, 2, 11, 'a masked blade'), foeName: 'the hunters' }) },
      { label: 'Get the child out', check: { who: (c) => seat(c, 'champion') ?? seat(c, 'spymaster'), stats: ['stealth', 'reflexes'], dc: 12 }, resolve: (c, ok) => pushStruggle(c.world, strug(c)?.id, ok ? 10 : -10) },
    ],
    fallback: 1,
  },
  {
    id: 'str:hunted:up', title: 'A hunter talks', category: T, trigger: 'home', weight: 0, stage: true,
    setup: () => true,
    text: () => 'One of the hunters was taken alive. He will name who paid, for his life.',
    options: [
      { label: 'Spare him for the name', resolve: (c) => { const h = pickRival(c); c.fx.learnHouse(h, 10).say(`The money came through House ${H(c, h)}`); pushStruggle(c.world, strug(c)?.id, 15); } },
      { label: 'Hang him', resolve: (c) => { c.fx.dread(2); pushStruggle(c.world, strug(c)?.id, 6); } },
    ],
    fallback: 0,
  },
  { id: 'str:hunted:won', title: 'The hunters give up', category: T, trigger: 'home', weight: 0, stage: true, setup: () => true, text: (c) => `No one has come for ${nm(c.person)} in a long time. The guards are being stood down.`, options: [{ label: 'Good', resolve: (c) => { c.fx.respect(1); endStruggle(c.world, strug(c)?.id, true, 'The child is safe.'); } }], fallback: 0 },
  {
    id: 'str:hunted:lost', title: 'Taken', category: T, trigger: 'home', weight: 0, stage: true, urgent: true,
    setup: () => true,
    text: (c) => `${full(c.person)} is gone. The nurse is dead.`,
    options: [{ label: 'Find them', resolve: (c) => { const p = c.person; if (p) { away(c, p, CYCLES.ORBIT * 3, 'taken'); p.flags.push({ id: 'missing', since: c.world.date }); } c.fx.respect(-3); endStruggle(c.world, strug(c)?.id, false, 'The child was taken.'); } }],
    fallback: 0,
  },
];

const drift: EventDef[] = [
  { id: 'str:drift:open', title: '', category: T, trigger: 'home', weight: 0, stage: true, setup: () => false, text: () => '', options: [{ label: '—', resolve: () => {} }], fallback: 0 },
  {
    id: 'str:drift:down', title: 'Into the tear', category: T, trigger: 'home', weight: 0, stage: true, urgent: true,
    setup: () => true,
    text: () => 'One of the bearers holding the rift walked into it this morning, smiling. The others are afraid to look at it.',
    options: [
      { label: 'Send someone after them', check: { who: (c) => best(bonded(c), (x) => x.stats.resonanceControl), stats: ['resonanceControl', 'willpower'], dc: 13 },
        resolve: (c, ok) => { const x = best(bonded(c), (y) => y.stats.resonanceControl); if (ok) { pushStruggle(c.world, strug(c)?.id, 15); c.fx.thread(x, 'omen', 'Went into the Drift and came back'); } else { c.fx.wound(x); pushStruggle(c.world, strug(c)?.id, -10); if (x) x.hidden.drift += 2; } } },
      { label: 'Pull everyone back a day', resolve: (c) => pushStruggle(c.world, strug(c)?.id, -6) },
    ],
    fallback: 1,
  },
  { id: 'str:drift:up', title: "The temple's rite", category: T, trigger: 'home', weight: 0, stage: true, setup: () => true, text: () => 'The temple\'s chanters held the rift shut for a whole Phase. They want a tithe for it.', options: [{ label: 'Pay the tithe', hint: '−600 othes', resolve: (c) => { c.fx.othes(-600); shiftFavour(c.world, c.house, 1); pushStruggle(c.world, strug(c)?.id, 15); } }, { label: 'Thank them, and no more', resolve: (c) => pushStruggle(c.world, strug(c)?.id, 4) }], fallback: 1 },
  { id: 'str:drift:won', title: 'Sealed', category: T, trigger: 'home', weight: 0, stage: true, setup: () => true, text: () => 'The rift is closed. The bearers who held it sleep for two days.', options: [{ label: 'Honour them', resolve: (c) => { for (const id of strug(c)?.ours ?? []) { const x = c.world.characters[id]; if (x) addThread(c.world, x.id, 'omen', 'Held the Drift shut'); } c.fx.respect(2); endStruggle(c.world, strug(c)?.id, true, 'Sealed.'); } }], fallback: 0 },
  { id: 'str:drift:lost', title: 'The Drift seeps in', category: T, trigger: 'home', weight: 0, stage: true, urgent: true, setup: () => true, text: () => 'The rift is wider than the lane now. Every bearer in the house feels it at night.', options: [{ label: 'Close the lane for good', resolve: (c) => { for (const x of bonded(c)) x.hidden.drift += 2; c.fx.say('The drift rises in every bearer of the house'); endStruggle(c.world, strug(c)?.id, false, 'The Drift seeped in.'); } }], fallback: 0 },
];

void who; void shiftOpinion;
addEvents([...r1, ...r2, ...r3, ...r4, ...r5, ...r6, ...r7, ...r8, ...r9, ...hunted, ...drift]);
