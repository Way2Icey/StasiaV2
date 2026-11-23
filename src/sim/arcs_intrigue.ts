// Batch C: intrigue (I1–I7) and the plague struggle (S2).
import { addEvents, choose, type Ctx, type EventDef } from './events';
import { othes, at, athome, band, best, cast, data, days, defect, fighters, fought, full, H, highroy, need, nm, pickRival, seat, sectors, sectorOf, stranger, toBattle, who } from './arckit';
import { endStruggle, pushStruggle, startStruggle } from './story';
import { addThread } from './storystate';
import { shiftFavour, openFeud } from './houses';
import { seatHolder } from './query';
import { kill } from './death';
import { ageOf } from './characters';
import { SPECIES } from '../data/species';
import { award } from './careers';
import type { Character } from './types';

const T = 'Intrigue';
const strug = (c: Ctx) => c.struggle;
const spyOf = (c: Ctx, h?: string) => (h ? seatHolder(c.world, h, 'spymaster') : undefined);

const defs: EventDef[] = [
  // I1 The Double Agent
  {
    id: 'i1a', title: 'Good news from an agent', arc: 'The double agent', category: T, trigger: 'home', weight: 1.5, act: 'rising',
    setup: (c) => { const a = cast(c, athome(c).filter((x) => x.flags.some((f) => f.id === 'agent'))); if (!a) return false; (c.memo ??= {}).double = a.hidden.loyalty < 10 ? 1 : 0; return choose(c, { personId: a.id, otherHouseId: pickRival(c) }); },
    text: (c) => `${full(c.person)} brings the route of House ${H(c, c.other)}'s next Navisium convoy, and the name of the captain who can be bought.`,
    options: [
      { label: 'Act on it', resolve: (c) => { if (c.arc?.data?.double) c.fx.othes(-400).wound(cast(c, fighters(c))).say('It was a trap'); else c.fx.othes(600).say('The convoy was ours for a night'); }, then: (c) => (c.arc?.data?.double ? { next: 'i1b', after: days(c, 20, 40) } : null), ending: 'Good news, truly.' },
      { label: 'Check it first', check: { who: (c) => seat(c, 'spymaster'), stats: ['insight', 'intrigue'], dc: 0, vs: who.person, vsStats: ['deception', 'composure'] },
        resolve: (c, ok) => { data(c).known = ok ? 1 : 0; if (ok && !c.arc?.data?.double) c.fx.othes(300).say('It checks out'); else if (ok) c.fx.say('It does not check out. Someone is lying to us.'); },
        then: (c, ok) => (c.arc?.data?.double && ok ? { next: 'i1b', after: days(c, 6, 12) } : null), ending: 'Checked.' },
      { label: 'Sit on it', resolve: () => {}, then: (c) => (c.arc?.data?.double ? { next: 'i1b', after: days(c, 30, 50) } : null), ending: 'Nothing came of it.' },
    ],
    fallback: 2,
  },
  {
    id: 'i1b', title: 'Too good to be true', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!c.person?.alive && c.person.houseId === c.house,
    text: (c) => `The Spymaster is certain now: ${full(c.person)} has been reporting to House ${H(c, c.other)} all along.`,
    options: [
      { label: 'Feed them lies', resolve: (c) => { c.fx.learnHouse(c.other, 20).thread(c.person, 'secret', `A double agent we feed lies to`).say(`House ${H(c, c.other)} will be chasing shadows`); } },
      { label: 'Take them', resolve: (c) => { const p = c.person!; p.flags = p.flags.filter((f) => f.id !== 'agent'); c.fx.mood(p, -20).dread(1).regard(c.other, -6).thread(p, 'grudge', 'Unmasked as a double agent', highroy(c)?.id); } },
      { label: 'Let them go home', resolve: (c) => { defect(c, c.person, c.other); c.fx.honour(1); } },
    ],
    fallback: 0,
  },

  // I2 The Leaked Ledger
  {
    id: 'i2a', title: 'The leaked ledger', arc: 'The leaked ledger', category: T, trigger: 'home', weight: 1.5, act: 'calm',
    setup: (c) => {
      const pool = athome(c).filter((x) => x.seat !== 'highroy' && x.seat !== 'spymaster');
      if (pool.length < 3) return false;
      const three = c.rng.shuffle(pool).slice(0, 3);
      const culprit = [...three].sort((a, b) => a.hidden.loyalty - b.hidden.loyalty)[0]!;
      const innocent = three.find((x) => x !== culprit)!;
      return choose(c, { personId: culprit.id, secondId: innocent.id, otherHouseId: pickRival(c) });
    },
    text: (c) => `House ${H(c, c.other)} quoted our ledgers in the Numarade, to the othe. Three people could have copied them; two of them are ${nm(c.person)} and ${nm(c.second)}.`,
    options: [
      { label: 'Investigate the three', check: { who: (c) => seat(c, 'spymaster'), stats: ['insight', 'intrigue'], dc: 0, vs: who.person, vsStats: ['deception', 'composure'] },
        resolve: (c, ok) => { data(c).found = ok ? 1 : 0; if (!ok) c.fx.mood(c.second, -12).thread(c.second, 'grudge', 'Wrongly suspected of leaking the ledgers', seat(c, 'spymaster')?.id).say(`${nm(c.second)} was accused, wrongly`); else c.fx.say(`It was ${nm(c.person)}`); },
        then: (c, ok) => (ok ? { next: 'i2b', after: days(c, 4, 10) } : null), ending: 'The wrong person paid for it.' },
      { label: 'Change how the books are kept', hint: '−300 othes', resolve: (c) => c.fx.othes(-300), ending: 'The leak was stopped, not found.' },
    ],
    fallback: 1,
  },
  {
    id: 'i2b', title: 'The bait', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!c.person?.alive,
    text: (c) => `${full(c.person)} does not know we know.`,
    options: [
      { label: 'Feed false ledgers back', resolve: (c) => { shiftFavour(c.world, c.house, 1); c.fx.regard(c.other, -4).say(`House ${H(c, c.other)} made a fool of itself in the Numarade with our false numbers`).thread(c.person, 'secret', 'Leaked the ledgers, and is watched'); } },
      { label: 'End it', resolve: (c) => { c.fx.mood(c.person, -15).dread(1).thread(c.person, 'grudge', 'Caught leaking the ledgers', highroy(c)?.id); } },
    ],
    fallback: 1,
  },

  // I3 Taken
  {
    id: 'i3a', title: 'Taken', arc: 'Taken', category: T, trigger: 'home', weight: 1, act: 'crisis', urgent: true,
    setup: (c) => {
      const young = Object.values(c.world.characters).filter((x) => x.alive && x.houseId === c.house && x.tier === 'full' && ageOf(x, c.world.date) < SPECIES[x.species].adulthood && ageOf(x, c.world.date) >= 6);
      const f = Object.values(c.world.lanes?.factions ?? {})[0];
      const p = cast(c, young);
      if (!p || !f) return false;
      (c.memo ??= {}).faction = c.rng.pick(Object.keys(c.world.lanes.factions));
      return choose(c, { personId: p.id });
    },
    text: (c) => `${full(c.person)} was taken from the lower market by ${c.world.lanes.factions[String(c.arc?.data?.faction ?? c.memo?.faction)]?.name ?? 'corsairs'}. They want 1,500 othes, or the child goes to the mines.`,
    options: [
      { label: 'Pay', hint: '−1,500 othes', available: need(1500), resolve: (c) => c.fx.othes(-1500).say('The child is returned'), ending: 'Paid.' },
      { label: 'Negotiate', check: { who: (c) => seat(c, 'envoy') ?? highroy(c), stats: ['negotiation', 'eloquence'], dc: 12 }, resolve: (c, ok) => c.fx.othes(ok ? -500 : -2000).say(ok ? 'A third of the price' : 'They raised it, and we paid'), ending: 'Bought back.' },
      { label: 'Go in and get them', hint: '⚔ station', resolve: (c) => toBattle(c, { title: `Rescuing ${nm(c.person)}`, theatre: 'station', where: 'a corsair hideout', ours: fighters(c).slice(0, 4), foes: band('the hideout captain', 13, 3, 10, 'a corsair'), foeName: c.world.lanes.factions[String(data(c).faction)]?.name ?? 'the corsairs' }), then: () => ({ next: 'i3b', after: 1 }) },
    ],
    fallback: 0,
  },
  {
    id: 'i3b', title: 'Home', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!fought(c) && !!c.person,
    text: (c) => (fought(c)!.won ? `${nm(c.person)} is home. They have not spoken since.` : 'The rescue failed. The price has doubled.'),
    options: [{ label: 'So be it', resolve: (c) => {
      const f = c.world.lanes.factions[String(data(c).faction)];
      if (fought(c)!.won) { c.fx.thread(c.person, 'scar', 'Taken by corsairs as a child').dread(2); if (f) f.rel[c.house] = Math.max(-100, (f.rel[c.house] ?? 0) - 20); }
      else { c.fx.othes(-Math.min(3000, othes(c))).say('We paid the doubled price'); c.fx.thread(c.person, 'grudge', `Taken by ${f?.name ?? 'corsairs'}`); }
    } }],
    fallback: 0,
  },

  // I4 The Pretender
  {
    id: 'i4a', title: 'The pretender', arc: 'The pretender', category: T, trigger: 'home', weight: 1.2, act: 'rising',
    setup: (c) => { const h = pickRival(c); if (!h) return false; (c.memo ??= {}).real = c.rng.chance(0.4) ? 1 : 0; return choose(c, { otherHouseId: h }); },
    text: (c) => `A stranger at our court claims to be the true heir of House ${H(c, c.other)}, cheated of their birthright. They want our backing.`,
    options: [
      { label: 'Back them', hint: '−500 othes', resolve: (c) => c.fx.othes(-500).regard(c.other, -10), then: (c) => ({ next: 'i4b', after: days(c, 30, 60) }) },
      { label: 'Sell them to their house', hint: '+600 othes', resolve: (c) => c.fx.othes(600).honour(-2).regard(c.other, 6), ending: 'Sold.' },
      { label: 'Investigate first', check: { who: (c) => seat(c, 'spymaster'), stats: ['insight', 'intrigue'], dc: 12 }, resolve: (c, ok) => c.fx.say(ok ? (c.arc?.data?.real ? 'Their claim is true' : 'A fraud, and a good one') : 'Nothing can be proven either way'), then: (c, ok) => ({ next: 'i4b', after: days(c, 30, 60), data: { checked: ok ? 1 : 0 } }) },
    ],
    fallback: 2,
  },
  {
    id: 'i4b', title: 'True or false', category: T, trigger: 'home', weight: 0, stage: true,
    setup: () => true,
    text: (c) => (c.arc?.data?.real ? `The pretender's claim has split House ${H(c, c.other)}. Half their families have declared.` : 'The pretender has been exposed as a fraud, a dock forger\'s son.'),
    options: [
      { label: 'Stand by them', resolve: (c) => { if (c.arc?.data?.real) { c.fx.regard(c.other, -12).respect(2); shiftFavour(c.world, c.house, 1); } else { c.fx.respect(-4).honour(-2).say('Our scandal now'); } }, then: (c) => ({ next: 'i4c', after: days(c, 20, 40) }) },
      { label: 'Drop them', resolve: (c) => { c.fx.honour(-1).regard(c.other, 4); }, ending: 'Dropped.' },
    ],
    fallback: 1,
  },
  {
    id: 'i4c', title: 'They answer', category: T, trigger: 'home', weight: 0, stage: true,
    setup: () => true,
    text: (c) => `House ${H(c, c.other)} has answered our meddling.`,
    options: [{ label: 'Brace', resolve: (c) => { if (c.rng.chance(0.5)) { shiftFavour(c.world, c.house, -3); c.fx.respect(-2).say('A motion against us in the Numarade'); } else { c.fx.wound(cast(c, athome(c).filter((x) => x.seat))).say('An assassin in our court'); } } }],
    fallback: 0,
  },

  // I5 The Poisoned Well
  {
    id: 'i5a', title: 'The poisoned well', arc: 'The poisoned well', category: T, trigger: 'home', weight: 1, act: 'crisis', urgent: true,
    setup: (c) => { const s = sectors(c); if (!s.length) return false; (c.memo ??= {}).who = c.rng.pick(['rival', 'cult', 'guild']); return choose(c, { sectorId: c.rng.pick(s).id, otherHouseId: pickRival(c) }); },
    text: (c) => `The water in ${c.sector?.name} is poisoned. Children first, then the old. The Physician cannot keep up.`,
    options: [
      { label: 'Close the water', hint: '−300 othes', resolve: (c) => c.fx.othes(-300).unrest(c.sector, 6), then: (c) => ({ next: 'i5b', after: days(c, 10, 20) }) },
      { label: 'Ration it', resolve: (c) => { c.fx.unrest(c.sector, 3); if (c.rng.chance(0.4)) startStruggle(c.world, 'plague', { title: `Sickness in ${c.sector?.name}`, strength: 12, theirName: 'the sickness', cast: { sectorId: c.sector?.id }, ours: [seat(c, 'physician')?.id].filter(Boolean) as string[] }); }, then: (c) => ({ next: 'i5b', after: days(c, 10, 20) }) },
      { label: 'Bring water in', hint: '−800 othes', available: need(800), resolve: (c) => c.fx.othes(-800).unrest(c.sector, -2), then: (c) => ({ next: 'i5b', after: days(c, 10, 20) }) },
    ],
    fallback: 1,
  },
  {
    id: 'i5b', title: 'Who did it', category: T, trigger: 'home', weight: 0, stage: true,
    setup: () => true,
    text: (c) => `The Spymaster has three leads: a man paid in House ${H(c, c.other)}'s coin, a doom-preaching cult, and a water guild that lost its contract last year. Time for one.`,
    options: [
      { label: 'Follow the coin', resolve: (c) => found(c, 'rival') },
      { label: 'Raid the cult', resolve: (c) => found(c, 'cult') },
      { label: 'Question the guild', resolve: (c) => found(c, 'guild') },
    ],
    fallback: 2,
  },

  // I6 The Spymaster's Files
  {
    id: 'i6a', title: "The Spymaster's files", arc: "The Spymaster's files", category: T, trigger: 'home', weight: 1.2, act: 'rising',
    setup: (c) => { const sp = seat(c, 'spymaster'); const x = cast(c, athome(c).filter((y) => y.seat && y.seat !== 'highroy' && y.seat !== 'spymaster')); return !!sp && !!x && choose(c, { personId: sp.id, secondId: x.id, otherHouseId: pickRival(c) }); },
    text: (c) => `${full(c.second)} has found out that ${nm(c.person)} keeps files on the council, and on them. They want the Spymaster gone.`,
    options: [
      { label: 'Back the Spymaster', resolve: (c) => c.fx.mood(c.second, -8).thread(c.second, 'grudge', 'The Spymaster keeps files on them', c.person?.id), then: (c) => (c.rng.chance(0.4) ? { next: 'i6b', after: days(c, 40, 70) } : null), ending: 'The files stay.' },
      { label: 'Back the councillor', resolve: (c) => c.fx.mood(c.person, -12).thread(c.person, 'grudge', 'Was made to answer for their files', highroy(c)?.id), ending: 'The Spymaster is reined in.' },
      { label: 'Burn the files in front of both', resolve: (c) => { c.fx.mood(c.person, -4).mood(c.second, 3).honour(1); }, then: (c) => (c.rng.chance(0.3) ? { next: 'i6b', after: days(c, 40, 70) } : null), ending: 'Burned.' },
    ],
    fallback: 0,
  },
  {
    id: 'i6b', title: 'Copied', category: T, trigger: 'home', weight: 0, stage: true,
    setup: () => true,
    text: (c) => `Someone copied the Spymaster's files before anyone knew. House ${H(c, c.other)} is quoting them.`,
    options: [{ label: 'Damn them', resolve: (c) => { c.fx.respect(-2); for (const x of athome(c).filter((y) => y.seat)) c.fx.mood(x, -2); } }],
    fallback: 0,
  },

  // I7 The Contract
  {
    id: 'i7a', title: 'The contract', arc: 'The contract', category: T, trigger: 'home', weight: 1.5, act: 'rising',
    setup: (c) => {
      const cr = c.world.crucible;
      if (!cr || cr.stage !== 'drawn' || !cr.entrants.includes(c.house)) return false;
      const rival = cr.entrants.find((h) => h !== c.house && c.world.houses[h] && seatHolder(c.world, h, 'champion'));
      const ch = rival ? seatHolder(c.world, rival, 'champion') : undefined;
      return !!ch && choose(c, { otherHouseId: rival, personId: ch.id });
    },
    text: (c) => `A broker with soft hands and no name: for 1,500 othes, ${full(c.person)}, House ${H(c, c.other)}'s Champion, will not reach the Crucible.`,
    options: [
      { label: 'Accept', hint: '−1,500 othes; honour', available: need(1500), resolve: (c) => c.fx.othes(-1500).honour(-3), then: (c) => ({ next: 'i7b', after: days(c, 10, 20) }) },
      { label: 'Refuse', resolve: () => {}, ending: 'Refused.' },
      { label: 'Warn them', resolve: (c) => { c.fx.regard(c.other, 8).honour(2); const h = highroy(c); if (h) addThread(c.world, h.id, 'favour', `Warned House ${H(c, c.other)} of a contract on their Champion`, c.other); }, ending: 'Warned.' },
    ],
    fallback: 1,
  },
  {
    id: 'i7b', title: 'Done, or not', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!c.person,
    text: (c) => `Word from House ${H(c, c.other)}'s capital about their Champion.`,
    options: [{ label: 'Listen', resolve: (c) => {
      if (c.person?.alive && c.rng.chance(0.55)) { kill(c.world, c.person, c.world.date, 'an assassin\'s blade'); c.fx.say(`${nm(c.person)} is dead`); }
      else c.fx.say('The attempt failed');
      if (c.rng.chance(0.35)) { c.fx.regard(c.other, -30).respect(-3).say('And they know who paid'); openFeud(c.world, c.house, c.other!, 'a contract on their Champion'); }
    } }],
    fallback: 0,
  },

  // S2 Plague
  {
    id: 'str:plague:open', title: 'Sickness', category: 'Court', trigger: 'home', weight: 0, stage: true,
    setup: (c) => { const s = sectors(c).find((x) => x.unrest >= 40); return !!s && !(c.world.story?.struggles ?? []).some((x) => !x.ended && x.kind === 'plague') && choose(c, { sectorId: s.id }); },
    text: (c) => `A fever is spreading through ${c.sector?.name}. The lower quarter first, then the docks.`,
    options: [
      { label: 'Set the Physician to it', resolve: (c) => startStruggle(c.world, 'plague', { title: `Plague in ${c.sector?.name}`, strength: 12, theirName: 'the fever', cast: { sectorId: c.sector?.id }, ours: [seat(c, 'physician')?.id].filter(Boolean) as string[] }) },
      { label: 'Close the sector', hint: '−400 othes', resolve: (c) => { c.fx.othes(-400).unrest(c.sector, 5); startStruggle(c.world, 'plague', { title: `Plague in ${c.sector?.name}`, strength: 11, theirName: 'the fever', cast: { sectorId: c.sector?.id }, ours: [seat(c, 'physician')?.id].filter(Boolean) as string[], meter: 15 }); } },
    ],
    fallback: 0,
  },
  {
    id: 'str:plague:down', title: 'It reaches the court', category: 'Court', trigger: 'home', weight: 0, stage: true, urgent: true,
    setup: (c) => !!cast(c, athome(c)),
    text: () => 'The fever is in the citadel.',
    options: [{ label: 'Close the citadel', resolve: (c) => { const x = cast(c, athome(c))!; x.flags.push({ id: 'ill', since: c.world.date, until: { year: c.world.date.year + 1, cycle: c.world.date.cycle } }); c.fx.say(`${nm(x)} has it`); pushStruggle(c.world, strug(c)?.id, 3); } }, { label: 'Carry on', resolve: (c) => { for (const x of athome(c).slice(0, 2)) x.flags.push({ id: 'ill', since: c.world.date, until: { year: c.world.date.year + 1, cycle: c.world.date.cycle } }); pushStruggle(c.world, strug(c)?.id, -6); } }],
    fallback: 0,
  },
  {
    id: 'str:plague:up', title: 'A foreign cure', category: 'Court', trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!pickRival(c),
    text: (c) => `A physician of House ${H(c, pickRival(c))} claims a cure, for a price.`,
    options: [{ label: 'Pay it', hint: '−800 othes', resolve: (c) => { c.fx.othes(-800); pushStruggle(c.world, strug(c)?.id, 25); } }, { label: 'Trust our own', resolve: (c) => pushStruggle(c.world, strug(c)?.id, 4) }],
    fallback: 1,
  },
  {
    id: 'str:plague:won', title: 'The fever breaks', category: 'Court', trigger: 'home', weight: 0, stage: true,
    setup: () => true,
    text: (c) => `It is over in ${sectorOf(c, c.struggle?.cast.sectorId)?.name ?? 'the sector'}.`,
    options: [{ label: 'Honour the Physician', resolve: (c) => { const p = seat(c, 'physician'); if (p) award(c.world, p.id, 'Broke a plague'); c.fx.respect(1); endStruggle(c.world, strug(c)?.id, true, 'The fever broke.'); } }],
    fallback: 0,
  },
  {
    id: 'str:plague:lost', title: 'The dead are counted', category: 'Court', trigger: 'home', weight: 0, stage: true, urgent: true,
    setup: () => true,
    text: (c) => `${sectorOf(c, c.struggle?.cast.sectorId)?.name ?? 'The sector'} is half empty.`,
    options: [{ label: 'Mourn them', resolve: (c) => {
      const s = sectorOf(c, c.struggle?.cast.sectorId); if (s) s.unrest = Math.min(100, s.unrest + 15);
      const frail = athome(c).filter((x) => !x.seat && x.stats.constitution <= 9);
      const v = frail.length ? c.rng.pick(frail) : undefined;
      if (v && c.rng.chance(0.5)) { kill(c.world, v, c.world.date, 'the plague'); c.fx.say(`${nm(v)} died of it`); }
      endStruggle(c.world, strug(c)?.id, false, 'The dead are counted.');
    } }],
    fallback: 0,
  },
];

/** Which lead the Highroy followed, and whether it was the right one. */
function found(c: Ctx, lead: 'rival' | 'cult' | 'guild') {
  const truth = String(c.arc?.data?.who ?? 'guild');
  if (lead !== truth) { c.fx.say('A dead end'); return; }
  if (truth === 'rival') { c.fx.regard(c.other, -12).say(`House ${H(c, c.other)} paid for it`); if (c.rng.chance(0.4)) openFeud(c.world, c.house, c.other!, 'a poisoned well'); }
  else if (truth === 'cult') c.fx.dread(2).say('The cult is broken up');
  else c.fx.unrest(c.sector, -4).say('The guild\'s men are hanged');
}

void best; void stranger; void spyOf; void at;
addEvents(defs);
export type { Character };
