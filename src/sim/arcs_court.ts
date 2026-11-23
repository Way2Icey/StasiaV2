// Batch B: court and family (C1–C7), and the succession (S1) and uprising (S3) struggles.
import { addEvents, choose, type Ctx, type EventDef } from './events';
import { at, athome, away, band, best, cast, CYCLES, data, days, defect, fighters, full, H, highroy, need, nm, pickRival, rivals, seat, sectors, sectorOf, stranger, toBattle, who } from './arckit';
import { endStruggle, pushStruggle, startStruggle } from './story';
import { shiftBoth, shiftOpinion } from './relationships';
import { addThread } from './storystate';
import { shiftFavour, openFeud } from './houses';
import { relation, shiftRelation } from './relations';
import { seatHolder } from './query';
import { learn } from './knowledge';
import { ageOf } from './characters';
import { SPECIES } from '../data/species';
import type { Character } from './types';

const T = 'Court';
const strug = (c: Ctx) => c.struggle;
const isChild = (x: Character) => x.role === 'Heir' || x.role === 'Son of the Highroy' || x.role === 'Daughter of the Highroy';
const merit = (x: Character) => x.stats.leadership + x.stats.diplomacy + x.stats.intellect + x.stats.law;

const defs: EventDef[] = [
  // C1 The Heir Question
  {
    id: 'c1a', title: 'The heir question', arc: 'The heir question', category: T, trigger: 'home', weight: 1.5, act: 'rising',
    setup: (c) => {
      const kids = athome(c).filter((x) => isChild(x) && ageOf(x, c.world.date) >= SPECIES[x.species].adulthood).sort((a, b) => ageOf(b, c.world.date) - ageOf(a, c.world.date));
      if (kids.length < 2 || kids.some((k) => k.role === 'Heir') || (c.world.story?.struggles ?? []).some((s) => !s.ended && s.kind === 'succession')) return false;
      return choose(c, { personId: kids[0]!.id, secondId: kids[1]!.id });
    },
    text: (c) => `The council has split behind ${full(c.person)}, the elder, and ${full(c.second)}. No heir is named, and every Phase without one the camps grow harder.`,
    options: [
      { label: 'Name the elder now', resolve: (c) => { c.person!.role = 'Heir'; c.fx.mood(c.person, 10).thread(c.second, 'grudge', `Passed over for heir`, highroy(c)?.id).mood(c.second, -10); }, ending: 'The elder named.' },
      { label: 'Let them prove themselves', hint: 'a task each, and the court watches', resolve: (c) => c.fx.say('Each is set a task'), then: (c) => ({ next: 'c1b', after: days(c, 60, 100) }) },
      { label: 'Put it off', hint: 'a struggle for the succession', resolve: (c) => startStruggle(c.world, 'succession', { title: `The succession: ${nm(c.person)} or ${nm(c.second)}`, strength: 12, theirName: `the faction behind ${nm(c.second)}`, theirId: c.second!.id, known: true, cast: { personId: c.person!.id, secondId: c.second!.id }, ours: [seat(c, 'elder')?.id].filter(Boolean) as string[] }), ending: 'Put off.' },
    ],
    fallback: 2,
  },
  {
    id: 'c1b', title: 'The proving', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!c.person?.alive && !!c.second?.alive,
    text: (c) => { const [a, b] = merit(c.person!) >= merit(c.second!) ? [c.person!, c.second!] : [c.second!, c.person!]; return `The tasks are done. ${nm(a)} did well; ${nm(b)} less so, and everyone saw it.`; },
    options: [
      { label: 'Name the one who proved best', resolve: (c) => name(c, merit(c.person!) >= merit(c.second!)) },
      { label: 'Name the other anyway', resolve: (c) => { name(c, merit(c.person!) < merit(c.second!)); c.fx.respect(-2); } },
    ],
    fallback: 0,
  },
  { id: 'str:succession:open', title: '', category: T, trigger: 'home', weight: 0, stage: true, setup: () => false, text: () => '', options: [{ label: '—', resolve: () => {} }], fallback: 0 },
  {
    id: 'str:succession:down', title: 'A councillor defects', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!cast(c, athome(c).filter((x) => x.seat && x.seat !== 'highroy')),
    text: (c) => `${full(cast(c, athome(c).filter((x) => x.seat && x.seat !== 'highroy')))} has declared for ${nm(c.second)} in open council.`,
    options: [
      { label: 'Rebuke them', resolve: (c) => { pushStruggle(c.world, strug(c)?.id, 6); c.fx.dread(1); } },
      { label: 'Let them speak', resolve: (c) => { pushStruggle(c.world, strug(c)?.id, -6); c.fx.honour(1); } },
    ],
    fallback: 1,
  },
  { id: 'str:succession:up', title: 'A family declares', category: T, trigger: 'home', weight: 0, stage: true, setup: () => true, text: (c) => `The head of one of the great families of the house has declared for ${nm(c.person)}.`, options: [{ label: 'Thank them', resolve: (c) => pushStruggle(c.world, strug(c)?.id, 15) }], fallback: 0 },
  { id: 'str:succession:won', title: 'The heir is accepted', category: T, trigger: 'home', weight: 0, stage: true, setup: (c) => !!c.person?.alive, text: (c) => `The house has accepted ${full(c.person)} as heir. ${nm(c.second)} has come to kneel.`, options: [{ label: 'Give the other a post', resolve: (c) => { c.person!.role = 'Heir'; c.fx.mood(c.second, 4); endStruggle(c.world, strug(c)?.id, true, 'The heir is accepted.'); } }, { label: 'Send the other away', resolve: (c) => { c.person!.role = 'Heir'; away(c, c.second, CYCLES.ORBIT, 'sent from court'); c.fx.thread(c.second, 'grudge', 'Sent away after the succession', highroy(c)?.id); endStruggle(c.world, strug(c)?.id, true, 'The heir is accepted.'); } }], fallback: 0 },
  { id: 'str:succession:lost', title: 'The house splits', category: T, trigger: 'home', weight: 0, stage: true, urgent: true, setup: (c) => !!c.second?.alive, text: (c) => `${full(c.second)} has left the court with their followers, for House ${H(c, pickRival(c))} and its promises.`, options: [{ label: 'Let them go', resolve: (c) => { defect(c, c.second, pickRival(c)); c.fx.respect(-4); if (c.person) c.person.role = 'Heir'; endStruggle(c.world, strug(c)?.id, false, 'The house split.'); } }], fallback: 0 },

  // C2 The Highroy's Illness
  {
    id: 'c2a', title: "The Highroy's illness", arc: "The Highroy's illness", category: T, trigger: 'home', weight: 1, act: 'crisis', urgent: true,
    setup: (c) => { const h = highroy(c); return !!h && !h.flags.some((f) => f.id === 'ill') && choose(c, { personId: h.id, otherHouseId: pickRival(c) }); },
    text: () => 'The Highroy woke with a fever that has not broken in three days. The Physician is afraid.',
    options: [
      { label: 'Keep it secret', check: { who: (c) => seat(c, 'spymaster'), stats: ['intrigue', 'composure'], dc: 11 }, resolve: (c, ok) => { if (!ok) c.fx.respect(-3).say('It got out'); sicken(c); }, then: (c) => ({ next: 'c2b', after: days(c, 10, 20) }) },
      { label: 'Announce it', resolve: (c) => { c.fx.respect(-2); sicken(c); }, then: (c) => ({ next: 'c2b', after: days(c, 10, 20) }) },
      { label: 'Send for a foreign physician', hint: '−600 othes; a debt', available: need(600), resolve: (c) => { c.fx.othes(-600).regard(c.other, 4); const h = highroy(c); if (h) addThread(c.world, h.id, 'debt', `House ${H(c, c.other)}'s physician saved them`, c.other); sicken(c, 0.5); }, then: (c) => ({ next: 'c2b', after: days(c, 10, 20) }) },
    ],
    fallback: 1,
  },
  {
    id: 'c2b', title: 'The regency', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => { const r = best(athome(c).filter((x) => x.seat && x.seat !== 'highroy'), (x) => x.hidden.ambition); return !!r && choose(c, { secondId: r.id }); },
    text: (c) => `With the Highroy abed, ${full(c.second)} has been signing orders in the council's name, and some of them were never discussed.`,
    options: [
      { label: 'Put them in their place', hint: 'from the sickbed', check: { who: highroy, stats: ['leadership', 'composure'], dc: 0, vs: (c) => c.second, vsStats: ['intrigue', 'eloquence'] },
        resolve: (c, ok) => { if (ok) { c.fx.mood(c.second, -8).thread(c.second, 'grudge', 'Put down from the regency', highroy(c)?.id); } else { c.fx.respect(-2).say(`${nm(c.second)} keeps the orders they signed`); if (c.second) c.second.hidden.ambition += 1; } } },
      { label: 'Let them run things', resolve: (c) => { c.fx.mood(c.second, 8); if (c.second && c.second.hidden.loyalty < 9) startStruggle(c.world, 'plot', { strength: 12, theirName: 'someone at court', theirId: c.second.id, cast: { personId: c.second.id }, meter: -5 }); } },
    ],
    fallback: 1,
  },

  // C3 The Ward Who Went Native
  {
    id: 'c3a', title: 'The ward who went native', arc: 'The ward who went native', category: T, trigger: 'home', weight: 1.5, act: 'calm',
    setup: (c) => { const st = Object.values(c.world.training?.wards ?? {}).find((x) => x.from === c.house && c.world.characters[x.wardId]?.alive); return !!st && choose(c, { personId: st.wardId, otherHouseId: st.host }) && !!((c.memo ??= {}).stay = st.id); },
    text: (c) => `${full(c.person)}'s letters from House ${H(c, c.other)} have changed. They write of "we" and mean their hosts.`,
    options: [
      { label: 'Recall them', resolve: (c) => { const st = c.world.training.wards[String(data(c).stay)]; if (st) st.end = c.world.date; c.fx.mood(c.person, -6); }, then: (c) => ({ next: 'c3b', after: days(c, 40, 70) }) },
      { label: 'Leave them be', resolve: (c) => { c.fx.regard(c.other, 3); if (c.person) c.person.hidden.loyalty = Math.max(1, c.person.hidden.loyalty - 1); }, ending: 'Left with their hosts.' },
      { label: 'Ask them to spy', check: { who: who.person, stats: ['deception', 'composure'], dc: 0, vs: (c) => (c.other ? seatHolder(c.world, c.other, 'spymaster') : undefined), vsStats: ['insight', 'intrigue'] },
        resolve: (c, ok) => { if (ok) c.fx.learnHouse(c.other, 25).thread(c.person, 'secret', `Spied on House ${H(c, c.other)} as a ward`); else { c.fx.regard(c.other, -12).say('They were caught, and sent home in disgrace'); const st = c.world.training.wards[String(data(c).stay)]; if (st) st.end = c.world.date; } },
        then: (c, ok) => (ok ? null : { next: 'c3b', after: days(c, 30, 50) }) },
    ],
    fallback: 1,
  },
  {
    id: 'c3b', title: 'Home again', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!c.person?.alive,
    text: (c) => `${full(c.person)} is home, and does not quite fit. They speak with House ${H(c, c.other)}'s accent.`,
    options: [
      { label: 'Let them keep their friends', resolve: (c) => { c.fx.mood(c.person, 6).regard(c.other, 4); } },
      { label: 'Remind them where home is', resolve: (c) => { if (c.person) c.person.hidden.loyalty += 2; c.fx.mood(c.person, -5); } },
    ],
    fallback: 0,
  },

  // C4 The Cousin's Debts
  {
    id: 'c4a', title: "The cousin's debts", arc: "The cousin's debts", category: T, trigger: 'home', weight: 1.5, act: 'rising',
    setup: (c) => { const p = cast(c, athome(c).filter((x) => x.hidden.greed >= 13 && !x.seat)); return !!p && choose(c, { personId: p.id, otherHouseId: pickRival(c) }); },
    text: (c) => `${full(c.person)} owes House ${H(c, c.other)}'s bankers 1,200 othes, and the bankers have written to the Highroy.`,
    options: [
      { label: 'Pay it', hint: '−1,200 othes', available: need(1200), resolve: (c) => { c.fx.othes(-1200); c.fx.thread(c.person, 'debt', 'The house paid their debts', highroy(c)?.id); }, ending: 'Paid.' },
      { label: 'Have the Steward renegotiate', check: { who: (c) => seat(c, 'steward'), stats: ['stewardship', 'negotiation'], dc: 0, vs: (c) => (c.other ? seatHolder(c.world, c.other, 'steward') : undefined), vsStats: ['stewardship', 'negotiation'] },
        resolve: (c, ok) => c.fx.othes(ok ? -500 : -1500), ending: 'Settled.' },
      { label: 'Disown them', resolve: (c) => { c.fx.mood(c.person, -15).thread(c.person, 'grudge', 'Disowned over a debt', highroy(c)?.id); }, then: (c) => ({ next: 'c4b', after: days(c, 30, 60) }) },
    ],
    fallback: 2,
  },
  {
    id: 'c4b', title: 'The bankers collect', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!c.other,
    text: (c) => `House ${H(c, c.other)} has raised the unpaid debt in the Numarade, and named our house.`,
    options: [
      { label: 'Pay it now, with interest', hint: '−1,800 othes', available: need(1800), resolve: (c) => c.fx.othes(-1800) },
      { label: 'Refuse', resolve: (c) => { c.fx.regard(c.other, -10); shiftFavour(c.world, c.house, -2); if (relation(c.world, c.other!, c.house) < -40) openFeud(c.world, c.house, c.other!, 'an unpaid debt'); } },
    ],
    fallback: 1,
  },

  // C5 The Elder's Last Lesson
  {
    id: 'c5a', title: "The Elder's last lesson", arc: "The Elder's last lesson", category: T, trigger: 'home', weight: 1.5, act: 'calm',
    setup: (c) => { const e = seat(c, 'elder'); return !!e && ageOf(e, c.world.date) >= e.lifespan * 0.8 && choose(c, { personId: e.id }); },
    text: (c) => `${full(c.person)} knows the end is near. They will teach one more person everything they know, including one thing they have never told anyone.`,
    options: [
      { label: 'The sharpest mind at court', resolve: (c) => teach(c, best(athome(c).filter((x) => x.id !== c.person?.id), (x) => x.stats.intellect)), then: (c) => ({ next: 'c5b', after: days(c, 20, 40) }) },
      { label: 'The Highroy\'s eldest', resolve: (c) => teach(c, best(athome(c).filter((x) => isChild(x)), (x) => ageOf(x, c.world.date)) ?? highroy(c)), then: (c) => ({ next: 'c5b', after: days(c, 20, 40) }) },
      { label: 'The Highroy, alone', resolve: (c) => teach(c, highroy(c)), then: (c) => ({ next: 'c5b', after: days(c, 20, 40) }) },
    ],
    fallback: 0,
  },
  {
    id: 'c5b', title: 'The secret', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => { const h = pickRival(c); data(c).kind = c.rng.chance(0.5) ? 'rival' : 'ours'; return choose(c, { otherHouseId: h }); },
    text: (c) => (c.arc?.data?.kind === 'rival' ? `The Elder's secret: House ${H(c, c.other)}'s founding line was never what they claim. The proof is in our archive.` : 'The Elder\'s secret: a line of our own house, hidden for three generations. Their descendant lives in the lower city, and has a claim.'),
    options: [
      { label: 'Use it', resolve: (c) => { if (c.arc?.data?.kind === 'rival') { c.fx.regard(c.other, -12).learnHouse(c.other, 10); shiftFavour(c.world, c.house, 1); } else { const p = stranger(c, { join: 'Noble' }); c.fx.say(`${nm(p)} is brought into the house`).honour(1); addThread(c.world, p.id, 'favour', 'Raised from the lower city by the house', highroy(c)?.id); } } },
      { label: 'Bury it', resolve: (c) => c.fx.honour(1) },
      { label: 'Burn it', resolve: (c) => c.fx.say('The pages are ash') },
    ],
    fallback: 1,
  },

  // C6 The Feast of Knives
  {
    id: 'c6a', title: 'The feast of knives', arc: 'The feast of knives', category: T, trigger: 'home', weight: 1.5, act: 'rising',
    setup: (c) => {
      const rs = rivals(c);
      for (const a of c.rng.shuffle(rs)) for (const b of rs) if (a !== b && relation(c.world, a, b) < -10) { (c.memo ??= {}).b = b; return choose(c, { otherHouseId: a }); }
      return false;
    },
    text: (c) => `Envoys from House ${H(c, c.other)} and House ${H(c, String(c.arc?.data?.b ?? c.memo?.b))} will both sit at our table this Phase. They hate each other.`,
    options: [
      { label: 'Seat them apart', resolve: (c) => c.fx.say('The feast passes without blood'), ending: 'A quiet feast.' },
      { label: 'Seat them together', resolve: () => {}, then: (c) => ({ next: 'c6b', after: days(c, 4, 8) }) },
      { label: 'Cancel the feast', resolve: (c) => { c.fx.regard(c.other, -2).regard(String(data(c).b), -2); }, ending: 'Cancelled.' },
    ],
    fallback: 0,
  },
  {
    id: 'c6b', title: 'The toast', category: T, trigger: 'home', weight: 0, stage: true, urgent: true,
    setup: () => true,
    text: (c) => `House ${H(c, c.other)}'s envoy raised a toast to "houses that know their place", looking straight at House ${H(c, String(c.arc?.data?.b))}'s. A hand went to a knife. Then the second envoy's cup was found to smell of almonds.`,
    options: [
      { label: 'Step between them', check: { who: highroy, stats: ['diplomacy', 'composure'], dc: 12 }, resolve: (c, ok) => { if (ok) { c.fx.regard(c.other, 5).regard(String(data(c).b), 5).respect(2); } else c.fx.regard(c.other, -5).regard(String(data(c).b), -5); } },
      { label: 'Have the Physician look at the cup', check: { who: (c) => seat(c, 'physician'), stats: ['perception', 'intellect'], dc: 11 },
        resolve: (c, ok) => { if (ok) { c.fx.say(`House ${H(c, c.other)}'s man poisoned it`).regard(String(data(c).b), 10).regard(c.other, -8); shiftRelation(c.world, String(data(c).b), c.other!, -15); } else c.fx.say('Nothing proven').regard(String(data(c).b), -6); } },
      { label: 'Let them settle it', resolve: (c) => { shiftRelation(c.world, String(data(c).b), c.other!, -20); c.fx.dread(1).regard(c.other, -3).regard(String(data(c).b), -3); } },
    ],
    fallback: 0,
  },

  // C7 The Commoners' Petition
  {
    id: 'c7a', title: "The commoners' petition", arc: "The commoners' petition", category: T, trigger: 'home', weight: 2, act: 'rising',
    setup: (c) => { const s = cast(c, sectors(c).filter((x) => x.unrest >= 30) as never[]) as unknown as { id: string } | undefined; return !!s && choose(c, { sectorId: s.id }); },
    text: (c) => `A delegation from ${c.sector?.name} is at the gate. They want a voice on the council: one of their own, with a seat.`,
    options: [
      { label: 'Hear them', resolve: (c) => c.fx.unrest(c.sector, -5).respect(-1), then: (c) => ({ next: 'c7b', after: days(c, 20, 40), data: { heard: 1 } }) },
      { label: 'Give them a minor post', hint: '−200 othes', resolve: (c) => c.fx.othes(-200).unrest(c.sector, -8), then: (c) => ({ next: 'c7b', after: days(c, 20, 40), data: { heard: 1 } }) },
      { label: 'Refuse', resolve: (c) => c.fx.unrest(c.sector, 6).dread(1), then: (c) => ({ next: 'c7b', after: days(c, 20, 40), data: { heard: 0 } }) },
    ],
    fallback: 2,
  },
  {
    id: 'c7b', title: 'Their speaker', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => { if (!c.sector) return false; const p = stranger(c, { sectorId: c.sector.id }); p.stats.eloquence = Math.max(p.stats.eloquence, 14); p.stats.leadership = Math.max(p.stats.leadership, 12); data(c).speaker = p.id; return true; },
    text: (c) => `A speaker has risen in ${c.sector?.name}: ${full(at(c, c.arc?.data?.speaker))}. ${c.arc?.data?.heard ? 'They ask to serve the house.' : 'They are telling the crowds the house does not listen.'}`,
    options: [
      { label: 'Bring them to court', resolve: (c) => { const p = at(c, data(c).speaker); if (p) { p.houseId = c.house; p.role = 'Courtier'; learn(c.world, c.house, p.id, 40); } c.fx.unrest(c.sector, -10).say(`${nm(p)} comes to court`); } },
      { label: 'Silence them', resolve: (c) => { const p = at(c, data(c).speaker); startStruggle(c.world, 'uprising', { title: `Uprising in ${c.sector?.name}`, strength: p ? (p.stats.leadership + p.stats.eloquence) / 2 + 2 : 13, theirName: full(p), theirId: p?.id, known: true, cast: { sectorId: c.sector?.id, personId: p?.id }, ours: [seat(c, 'steward')?.id].filter(Boolean) as string[] }); c.fx.dread(1); } },
    ],
    fallback: 1,
  },

  // S3 Uprising
  {
    id: 'str:uprising:open', title: 'The sector rises', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => { const s = sectors(c).find((x) => x.unrest >= 55); return !!s && !(c.world.story?.struggles ?? []).some((x) => !x.ended && x.kind === 'uprising') && choose(c, { sectorId: s.id }); },
    text: (c) => `${c.sector?.name} has risen. Barricades in the market, the Watch driven out, and a name on every wall.`,
    options: [
      { label: 'Set the Steward to it', resolve: (c) => startStruggle(c.world, 'uprising', { title: `Uprising in ${c.sector?.name}`, strength: 13, theirName: 'the barricades', cast: { sectorId: c.sector?.id }, ours: [seat(c, 'steward')?.id].filter(Boolean) as string[] }) },
      { label: 'Go yourself', resolve: (c) => startStruggle(c.world, 'uprising', { title: `Uprising in ${c.sector?.name}`, strength: 13, theirName: 'the barricades', cast: { sectorId: c.sector?.id }, ours: [highroy(c)?.id].filter(Boolean) as string[], meter: 10 }) },
    ],
    fallback: 0,
  },
  {
    id: 'str:uprising:down', title: 'The market falls', category: T, trigger: 'home', weight: 0, stage: true, urgent: true,
    setup: () => true,
    text: (c) => `The rebels have taken the market quarter of ${sectorOf(c, c.struggle?.cast.sectorId)?.name ?? 'the sector'} and hold it with stolen guns.`,
    options: [
      { label: 'Take it back', hint: '⚔ surface', resolve: (c) => toBattle(c, { title: 'The market quarter', theatre: 'surface', where: sectorOf(c, c.struggle?.cast.sectorId)?.name ?? 'the market', ours: fighters(c).slice(0, 4), foes: band(c.struggle?.theirs.name ?? 'the rebel leader', 10, 4, 8, 'a rebel'), foeName: 'the rebels', foeMass: 45 }) },
      { label: 'Starve them out', resolve: (c) => { c.fx.unrest(sectorOf(c, c.struggle?.cast.sectorId), 6); pushStruggle(c.world, strug(c)?.id, 4); } },
    ],
    fallback: 1,
  },
  {
    id: 'str:uprising:up', title: 'Terms', category: T, trigger: 'home', weight: 0, stage: true,
    setup: () => true,
    text: (c) => `${c.struggle?.theirs.name ?? 'The rebels\' leader'} offers terms: lower taxes, and no hangings.`,
    options: [
      { label: 'Accept', resolve: (c) => { c.fx.unrest(sectorOf(c, c.struggle?.cast.sectorId), -10).respect(-1); endStruggle(c.world, strug(c)?.id, true, 'Terms were agreed.'); } },
      { label: 'Refuse', resolve: (c) => pushStruggle(c.world, strug(c)?.id, 5) },
    ],
    fallback: 0,
  },
  {
    id: 'str:uprising:won', title: 'The barricades come down', category: T, trigger: 'home', weight: 0, stage: true,
    setup: () => true,
    text: (c) => `It is over in ${sectorOf(c, c.struggle?.cast.sectorId)?.name ?? 'the sector'}. Their leader is in our hands.`,
    options: [
      { label: 'Hang them', resolve: (c) => { c.fx.dread(3).unrest(sectorOf(c, c.struggle?.cast.sectorId), 5); endStruggle(c.world, strug(c)?.id, true, 'The leader was hanged.'); } },
      { label: 'Pardon them', resolve: (c) => { c.fx.honour(2).unrest(sectorOf(c, c.struggle?.cast.sectorId), -12); endStruggle(c.world, strug(c)?.id, true, 'The leader was pardoned.'); } },
    ],
    fallback: 0,
  },
  {
    id: 'str:uprising:lost', title: 'The sector is lost', category: T, trigger: 'home', weight: 0, stage: true, urgent: true,
    setup: () => true,
    text: (c) => `${sectorOf(c, c.struggle?.cast.sectorId)?.name ?? 'The sector'} governs itself now, and every house has heard.`,
    options: [{ label: 'For now', resolve: (c) => { const s = sectorOf(c, c.struggle?.cast.sectorId); if (s) s.unrest = 90; c.fx.respect(-4); shiftFavour(c.world, c.house, -2); endStruggle(c.world, strug(c)?.id, false, 'The sector was lost for a time.'); } }],
    fallback: 0,
  },
];

function name(c: Ctx, first: boolean) {
  const [w, l] = first ? [c.person!, c.second!] : [c.second!, c.person!];
  w.role = 'Heir'; c.fx.mood(w, 10).say(`${nm(w)} is named heir`);
  c.fx.mood(l, -10).thread(l, 'grudge', 'Passed over for heir', highroy(c)?.id);
  if (l.hidden.loyalty < 9 && c.rng.chance(0.3)) defect(c, l, pickRival(c));
}

function sicken(c: Ctx, by = 1) {
  const h = highroy(c); if (!h) return;
  h.flags.push({ id: 'ill', since: c.world.date, until: { year: c.world.date.year + (by >= 1 ? 1 : 0), cycle: c.world.date.cycle } });
}

function teach(c: Ctx, x?: Character) {
  if (!x) return;
  data(c).student = x.id;
  c.fx.stat(x, 'intellect', 2).stat(x, 'law', 1).say(`${nm(x)} sits with the Elder to the end`);
  shiftBoth(c.world, x.id, c.person!.id, 15, 'the last lessons');
}

void shiftOpinion; void away;
addEvents(defs);
