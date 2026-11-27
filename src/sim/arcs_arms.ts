// Batch B: knights and arms (K1–K8), and the godglass struggle (S5).
import { giveKnightTitle } from './names';
import { addEvents, choose, type Ctx, type EventDef } from './events';
import { at, athome, away, band, best, cast, CYCLES, data, days, defect, fighters, fought, full, H, hasFlag, highroy, knights, need, nm, pickRival, seat, stranger, toBattle, who } from './arckit';
import { endStruggle, pushStruggle, startStruggle } from './story';
import { barsOf, setBond, shiftBoth, shiftOpinion } from './relationships';
import { addThread, closeThread, openThreads } from './storystate';
import { mentorOf, stageOf } from './ladder';
import { setSeat } from './ambitions';
import { award } from './careers';
import { learn } from './knowledge';
import { displayName } from './names';
import { ageOf } from './characters';
import { SPECIES } from '../data/species';
import { absoluteCycle } from './time';
import type { Character } from './types';

const T = 'Arms';
const strug = (c: Ctx) => c.struggle;
const recentBattles = (c: Ctx, cycles: number) => (c.world.battles?.list ?? []).filter((b) => b.status === 'over' && absoluteCycle(c.world.date) - absoluteCycle(b.created) <= cycles);

const defs: EventDef[] = [
  // K1 One More Trial
  {
    id: 'k1a', title: 'One more trial', arc: 'One more trial', category: T, trigger: 'home', weight: 1.5, act: 'calm',
    setup: (c) => {
      const p = cast(c, athome(c).filter((x) => stageOf(c.world, x.id) === 'aspirant' && (c.world.ladder?.of[x.id]?.failed ?? 0) >= 1 && mentorOf(c.world, x.id)));
      return !!p && choose(c, { personId: p.id, secondId: mentorOf(c.world, p.id)?.id });
    },
    text: (c) => `${full(c.second)} asks for a word about ${nm(c.person)}, who has failed the trials ${c.world.ladder?.of[c.person!.id]?.failed ?? 'more than once'} time(s). "One more chance. A private trial, with me watching. I know what they are."`,
    options: [
      { label: 'Grant a private trial', hint: '⚔ surface, against a hired blade', resolve: (c) => toBattle(c, { title: `${nm(c.person)}'s private trial`, theatre: 'surface', where: 'the old training yard', ours: [c.person!], foes: [{ name: 'a hired blade', power: 11, champion: true }], foeName: 'the hired blade', mass: 1, foeMass: 1 }), then: () => ({ next: 'k1b', after: 1 }) },
      { label: 'Release them from the ladder', resolve: (c) => { if (c.world.ladder?.of[c.person!.id]) delete c.world.ladder.of[c.person!.id]; c.fx.mood(c.person, -12).mood(c.second, -5); }, then: (c) => ({ next: 'k1c', after: days(c, 300, 500) }) },
      { label: 'Post them to the garrison', resolve: (c) => { if (c.person) c.person.role = 'Garrison officer'; c.fx.mood(c.person, -4); }, ending: 'Posted to the garrison.' },
    ],
    fallback: 2,
  },
  {
    id: 'k1b', title: 'The private trial', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!fought(c) && !!c.person?.alive,
    text: (c) => (fought(c)!.won ? `${full(c.person)} beat the hired blade, bloody and grinning. ${nm(c.second)} wept.` : `The hired blade put ${nm(c.person)} down twice. They got up twice.`),
    options: [{ label: 'So be it', resolve: (c) => {
      const p = c.person!; const r = c.world.ladder?.of[p.id];
      if (fought(c)!.won) { if (r) { r.stage = 'blooded'; r.since = c.world.date; r.history.push({ date: c.world.date, what: 'blooded in a private trial' }); } if (!hasFlag(p, 'blooded')) p.flags.push({ id: 'blooded', since: c.world.date }); p.name.epithet ??= 'the Stubborn'; c.fx.mood(p, 15).say(`${nm(p)} is blooded, and the knights call them the Stubborn`); c.fx.thread(p, 'vow', `Swore to prove ${nm(c.second)} right`); }
      else c.fx.mood(p, -6);
    } }],
    fallback: 0,
  },
  {
    id: 'k1c', title: 'A name from the lanes', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!c.person?.alive && Object.keys(c.world.lanes?.factions ?? {}).length > 0,
    text: (c) => `A corsair captain has been taking ships on our lanes. Our people know the name: ${full(c.person)}, the aspirant the house let go.`,
    options: [{ label: 'Remember them', resolve: (c) => {
      const p = c.person!; const f = c.world.lanes.factions[c.rng.pick(Object.keys(c.world.lanes.factions))]!;
      f.members.push({ id: `cm${c.world.nextId++}`, name: displayName(p.name), role: 'captain', hull: 'cutter', skill: Math.max(p.stats.duelling, 10), tactics: p.stats.tactics, cunning: p.stats.intrigue, crew: 40, takes: 3, known: true, notes: [`Once an aspirant of House ${H(c, c.house)}, released from the ladder.`] });
      p.flags.push({ id: 'missing', since: c.world.date, detail: `flies with ${f.name}` });
      c.fx.say(`${nm(p)} flies with ${f.name} now`);
    } }],
    fallback: 0,
  },

  // K2 Two Blades, One Heart
  {
    id: 'k2a', title: 'Two blades, one heart', arc: 'Two blades, one heart', category: T, trigger: 'home', weight: 1.5, act: 'rising',
    setup: (c) => {
      const ks = knights(c);
      for (const x of c.rng.shuffle(athome(c))) {
        const suitors = ks.filter((k) => k.id !== x.id && barsOf(c.world, k.id, x.id).like >= 50);
        if (suitors.length >= 2) return choose(c, { personId: suitors[0]!.id, secondId: suitors[1]!.id, otherHouseId: undefined }) && !!((c.memo ??= {}).heart = x.id);
      }
      return false;
    },
    text: (c) => `${full(c.person)} and ${full(c.second)} both have eyes for ${full(at(c, c.arc?.data?.heart ?? c.memo?.heart))}, and the yard knows it. Practice bouts between them have stopped being practice.`,
    options: [
      { label: 'Forbid the rivalry', resolve: (c) => { c.fx.mood(c.person, -4).mood(c.second, -4); }, ending: 'Forbidden, for now.' },
      { label: 'Let the heart choose', resolve: (c) => { const h = at(c, data(c).heart); if (!h) return; const a = barsOf(c.world, h.id, c.person!.id).like; const b = barsOf(c.world, h.id, c.second!.id).like; const [w, l] = a >= b ? [c.person!, c.second!] : [c.second!, c.person!]; setBond(c.world, w.id, h.id, 'lover', 'lover', 'chosen'); c.fx.say(`${nm(h)} chooses ${nm(w)}`).mood(w, 10).mood(l, -10).thread(l, 'grudge', `Lost ${nm(h)} to ${nm(w)}`, w.id); }, ending: 'The heart chose.' },
      { label: 'Send one away on a mission', resolve: (c) => { away(c, c.second, CYCLES.PHASE * 3, 'sent away'); c.fx.mood(c.second, -8); }, then: (c) => ({ next: 'k2b', after: days(c, 50, 80) }) },
    ],
    fallback: 0,
  },
  {
    id: 'k2b', title: 'Challenge at the grounds', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!c.person?.alive && !!c.second?.alive,
    text: (c) => `${nm(c.second)} came back and called ${nm(c.person)} out at the proving grounds, in front of the court.`,
    options: [
      { label: 'Let them fight', check: { who: (c) => c.person, stats: ['duelling', 'reflexes'], dc: 0, vs: (c) => c.second, vsStats: ['duelling', 'reflexes'] },
        resolve: (c, ok) => { const [w, l] = ok ? [c.person!, c.second!] : [c.second!, c.person!]; c.fx.wound(l).mood(w, 6).say(`${nm(w)} wins`); addThread(c.world, l.id, 'grudge', `Beaten at the grounds by ${nm(w)}`, w.id); } },
      { label: 'Stop it', resolve: (c) => { shiftBoth(c.world, c.person!.id, c.second!.id, -10, 'a fight stopped'); } },
    ],
    fallback: 1,
  },

  // K3 The Coward's Mark
  {
    id: 'k3a', title: "The coward's mark", arc: "The coward's mark", category: T, trigger: 'home', weight: 2, act: 'rising',
    setup: (c) => {
      for (const b of recentBattles(c, 120)) {
        const f = b.fighters.find((x) => x.side === 0 && x.id && (x.state === 'pulled' || b.result?.brokeOff) && c.world.characters[x.id]?.alive);
        if (f) return choose(c, { personId: f.id });
      }
      return false;
    },
    text: (c) => `In the barracks they say ${full(c.person)} ran. Someone has scratched a word on their door.`,
    options: [
      { label: 'Defend them publicly', resolve: (c) => { c.fx.mood(c.person, 6).honour(1); for (const k of knights(c)) if (k.id !== c.person?.id) shiftOpinion(c.world, k.id, c.person!.id, -3, 'the Highroy covered for them'); }, ending: 'Defended.' },
      { label: 'Let them prove themselves', resolve: (c) => c.fx.mood(c.person, -3), then: (c) => ({ next: 'k3b', after: days(c, 16, 32) }) },
      { label: 'Strip their spurs', resolve: (c) => { c.fx.mood(c.person, -15).thread(c.person, 'grudge', 'Stripped of their spurs as a coward', highroy(c)?.id); if (c.person) c.person.role = 'Noble'; }, ending: 'Stripped.' },
    ],
    fallback: 1,
  },
  {
    id: 'k3b', title: 'The proving', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!c.person?.alive,
    text: (c) => `${full(c.person)} has asked to lead the boarding of a corsair raider that has been working our lanes.`,
    options: [
      { label: 'Let them lead it', hint: '⚔ ship', resolve: (c) => toBattle(c, { title: `${nm(c.person)}'s proving`, theatre: 'ship', where: 'a corsair raider', ours: [c.person!, ...fighters(c).filter((x) => x.id !== c.person?.id).slice(0, 2)], commander: c.person, foes: band('the raider captain', 12, 3, 9, 'a deckhand'), foeName: 'the raider' }), then: () => ({ next: 'k3c', after: 1 }) },
      { label: 'Not yet', resolve: (c) => c.fx.mood(c.person, -5) },
    ],
    fallback: 1,
  },
  {
    id: 'k3c', title: 'Proven, or not', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!fought(c),
    text: (c) => (fought(c)!.won ? `${nm(c.person)} came back first off the raider's deck. No one says the word any more.` : `The boarding failed.`),
    options: [{ label: 'So be it', resolve: (c) => { if (fought(c)!.won && c.person?.alive) { award(c.world, c.person.id, 'Redeemed'); c.person.name.epithet ??= 'the Returned'; c.fx.mood(c.person, 15).respect(1); } } }],
    fallback: 0,
  },

  // K4 The Champion Ages
  {
    id: 'k4a', title: 'The Champion ages', arc: 'The Champion ages', category: T, trigger: 'home', weight: 1.5, act: 'calm',
    setup: (c) => {
      const ch = seat(c, 'champion'); if (!ch || ch.id === highroy(c)?.id) return false;
      const young = best(knights(c).filter((k) => k.id !== ch.id && k.stats.duelling > ch.stats.duelling && ageOf(k, c.world.date) < ageOf(ch, c.world.date)), (k) => k.stats.duelling);
      return !!young && choose(c, { personId: ch.id, secondId: young.id });
    },
    text: (c) => `${full(c.second)} has asked, in front of the knights, to try for the Champion's seat. ${full(c.person)} heard it.`,
    options: [
      { label: 'Hold a trial duel', check: { who: (c) => c.person, stats: ['duelling', 'reflexes', 'valor'], dc: 0, vs: (c) => c.second, vsStats: ['duelling', 'reflexes', 'valor'] },
        resolve: (c, ok) => { if (ok) { c.fx.say(`${nm(c.person)} holds the seat`).mood(c.person, 6).wound(c.second); addThread(c.world, c.second!.id, 'vow', `Swore to take the Champion's seat`); } else { setSeat(c.world, c.second!, 'champion'); c.fx.wound(c.person).say(`${nm(c.second)} is Champion`); c.fx.thread(c.person, 'grudge', 'Lost the Champion\'s seat', c.second?.id); } } },
      { label: 'Ask the Champion to step down', hint: 'a veteran post', resolve: (c) => { const ch = c.person!; setSeat(c.world, c.second!, 'champion'); ch.flags.push({ id: 'veteranPost', since: c.world.date, detail: 'Master of the yard' }); c.fx.mood(ch, -4).mood(c.second, 10).say(`${nm(ch)} becomes master of the yard`); } },
      { label: 'Ignore it', resolve: (c) => c.fx.thread(c.second, 'grudge', 'Denied a chance at the Champion\'s seat', highroy(c)?.id).mood(c.second, -8) },
    ],
    fallback: 2,
  },

  // K5 Blood Price
  {
    id: 'k5a', title: 'Blood price', arc: 'Blood price', category: T, trigger: 'home', weight: 2, act: 'rising',
    setup: (c) => {
      for (const b of recentBattles(c, 200)) {
        for (const dead of b.fighters.filter((x) => x.side === 1 && x.id && x.state === 'dead')) {
          const killer = b.fighters.find((x) => x.side === 0 && x.id && x.deeds.some((d) => d === `killed ${dead.name}`) && c.world.characters[x.id]?.alive);
          const d = c.world.characters[dead.id!];
          const kin = d ? Object.values(c.world.characters).find((y) => y.alive && y.familyId === d.familyId && y.id !== d.id && y.tier === 'full' && ageOf(y, c.world.date) >= SPECIES[y.species].adulthood) : undefined;
          if (killer && kin) return choose(c, { personId: killer.id!, secondId: kin.id, otherHouseId: kin.houseId });
        }
      }
      return false;
    },
    text: (c) => `${full(c.second)} of House ${H(c, c.other)} has written: ${nm(c.person)} killed their kin, and they want a blood price, or ${nm(c.person)} on the field.`,
    options: [
      { label: 'Pay the blood price', hint: '−1,000 othes', available: need(1000), resolve: (c) => c.fx.othes(-1000).regard(c.other, 6), ending: 'Paid.' },
      { label: 'Refuse', resolve: (c) => { c.fx.regard(c.other, -6); addThread(c.world, c.second!.id, 'grudge', `${nm(c.person)} killed their kin`, c.person!.id); }, ending: 'Refused; the grudge stands.' },
      { label: 'Offer the duel', hint: '⚔ surface', resolve: (c) => toBattle(c, { title: `Blood price: ${nm(c.person)} and ${nm(c.second)}`, theatre: 'surface', where: 'a neutral field', ours: [c.person!], foes: [{ id: c.second!.id, champion: true }], foeName: nm(c.second), foeHouse: c.other, foeCommander: { id: c.second!.id }, mass: 1, foeMass: 1 }), then: () => ({ next: 'k5b', after: 1 }) },
    ],
    fallback: 1,
  },
  {
    id: 'k5b', title: 'The price paid', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!fought(c),
    text: (c) => (fought(c)!.won ? `${nm(c.person)} stood over ${nm(c.second)} and let them live. The matter is closed.` : `${nm(c.second)} has their price.`),
    options: [{ label: 'So be it', resolve: (c) => { if (fought(c)!.won) c.fx.regard(c.other, 2).respect(1); else c.fx.regard(c.other, 4); } }],
    fallback: 0,
  },

  // K6 Mutiny Aboard
  {
    id: 'k6a', title: 'Mutiny aboard', arc: 'Mutiny', category: T, trigger: 'home', weight: 2, act: 'crisis', urgent: true,
    setup: (c) => { const s = Object.values(c.world.fleet?.ships ?? {}).find((x) => x.houseId === c.house && !x.lost && x.crewMood < 32); if (!s) return false; (c.memo ??= {}).ship = s.id; return true; },
    text: (c) => `The crew of the ${c.world.fleet.ships[String(c.arc?.data?.ship ?? c.memo?.ship)]?.name ?? 'ship'} have locked the captain in his cabin and refuse orders. They want their pay, and a new captain.`,
    options: [
      { label: 'Send the Grand Master', check: { who: (c) => seat(c, 'grandMaster'), stats: ['leadership', 'eloquence'], dc: 12 },
        resolve: (c, ok) => { const s = c.world.fleet.ships[String(data(c).ship)]; if (ok && s) { s.crewMood += 25; c.fx.say('The crew stand down'); } },
        then: (_c, ok) => (ok ? null : { next: 'k6b', after: 2 }), ending: 'Talked down.' },
      { label: 'Pay the crew', hint: '−800 othes', available: need(800), resolve: (c) => { const s = c.world.fleet.ships[String(data(c).ship)]; c.fx.othes(-800); if (s) s.crewMood += 30; }, ending: 'Paid off.' },
      { label: 'Replace the captain', resolve: (c) => { const s = c.world.fleet.ships[String(data(c).ship)]; const k = best(knights(c), (x) => x.stats.leadership + x.stats.fleetCommand); const old = at(c, s?.captainId ?? undefined); if (s && k) { s.captainId = k.id; s.crewMood += 12; if (old) c.fx.thread(old, 'grudge', `Lost the ${s.name}`, highroy(c)?.id); c.fx.say(`${nm(k)} takes the ${s.name}`); } }, ending: 'A new captain.' },
    ],
    fallback: 0,
  },
  {
    id: 'k6b', title: 'Retaking the ship', category: T, trigger: 'home', weight: 0, stage: true, urgent: true,
    setup: () => true,
    text: (c) => `The mutineers have armed themselves. The ${c.world.fleet.ships[String(c.arc?.data?.ship)]?.name ?? 'ship'} has to be taken back deck by deck.`,
    options: [{ label: 'Board her', hint: '⚔ ship', resolve: (c) => toBattle(c, { title: `Retaking the ${c.world.fleet.ships[String(data(c).ship)]?.name ?? 'ship'}`, theatre: 'ship', where: 'our own ship', ours: [seat(c, 'grandMaster'), ...knights(c).slice(0, 3)].filter((x): x is Character => !!x), foes: band('the ringleader', 11, 3, 9, 'a mutineer'), foeName: 'the mutineers', foeMass: 40 }), then: () => ({ next: 'k6c', after: 1 }) }],
    fallback: 0,
  },
  {
    id: 'k6c', title: 'Judgement', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!fought(c),
    text: (c) => (fought(c)!.won ? 'The ship is ours. The ringleaders are in irons on the hangar deck.' : 'The mutineers have cut her loose. She is gone.'),
    options: [
      { label: 'Hang the ringleaders', available: (c) => (fought(c)?.won ? null : 'Nothing left to judge'), resolve: (c) => { c.fx.dread(3); const s = c.world.fleet.ships[String(data(c).ship)]; if (s) s.crewMood = 45; } },
      { label: 'Pardon them', resolve: (c) => { const s = c.world.fleet.ships[String(data(c).ship)]; if (!fought(c)?.won) { if (s) s.lost = { date: c.world.date, how: 'mutiny' }; c.fx.respect(-4); return; } c.fx.honour(2); if (s) s.crewMood = 60; } },
    ],
    fallback: 1,
  },

  // K7 The Knight Who Won't Kill
  {
    id: 'k7a', title: "The knight who won't kill", arc: "The knight who won't kill", category: T, trigger: 'home', weight: 1.5, act: 'calm',
    setup: (c) => { const k = cast(c, knights(c).filter((x) => x.hidden.temperament >= 13 && recentBattles(c, 300).some((b) => b.fighters.some((f) => f.id === x.id)))); return !!k && choose(c, { personId: k.id }); },
    text: (c) => `${full(c.person)} would not finish a beaten man on the field. The knights call it weakness. The temple calls it grace.`,
    options: [
      { label: 'Back them', resolve: (c) => { c.fx.honour(2).mood(c.person, 6); for (const k of knights(c)) if (k.id !== c.person?.id && k.hidden.temperament < 10) shiftOpinion(c.world, k.id, c.person!.id, -4, 'soft'); }, then: (c) => ({ next: 'k7b', after: days(c, 200, 300) }) },
      { label: 'Order them to finish it next time', resolve: (c) => c.fx.mood(c.person, -8), ending: 'Ordered.' },
      { label: 'Leave it to the Grand Master', resolve: (c) => { const gm = seat(c, 'grandMaster'); if (gm && gm.hidden.temperament >= 11) c.fx.mood(c.person, 4); else c.fx.mood(c.person, -6); }, then: (c) => ({ next: 'k7b', after: days(c, 200, 300) }) },
    ],
    fallback: 2,
  },
  {
    id: 'k7b', title: 'For the one who spared me', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!c.person && Object.keys(c.world.lanes?.factions ?? {}).length > 0,
    text: (c) => `A convoy of ours was stopped by corsairs on the Ashfall lane, and let go. Their captain sent a message: "For the one who spared me. Tell ${nm(c.person)}."`,
    options: [{ label: 'Remember it', resolve: (c) => { const f = c.world.lanes.factions[c.rng.pick(Object.keys(c.world.lanes.factions))]!; f.rel[c.house] = Math.min(100, (f.rel[c.house] ?? 0) + 20); c.fx.say(`${f.name} think better of us`).mood(c.person, 6); } }],
    fallback: 0,
  },

  // K8 The Hired Champion
  {
    id: 'k8a', title: 'The hired champion', arc: 'The hired champion', category: T, trigger: 'home', weight: 2, act: 'rising',
    setup: (c) => { const cr = c.world.crucible; if (!cr || cr.stage !== 'drawn' || !cr.entrants.includes(c.house)) return false; return choose(c, { otherHouseId: pickRival(c) }); },
    text: () => 'A famed blade has come to the gate, a winner of a dozen pit nights across the Reaches. They will fight for us in the Crucible, for a fee.',
    options: [
      { label: 'Hire them', hint: '−1,500 othes; our knights resent it', available: need(1500), resolve: (c) => { const p = hire(c); data(c).blade = p.id; c.fx.othes(-1500); for (const k of knights(c)) c.fx.mood(k, -2); }, then: (c) => ({ next: 'k8b', after: days(c, 50, 80) }) },
      { label: 'Test them in a duel first', check: { who: (c) => seat(c, 'champion'), stats: ['duelling', 'reflexes'], dc: 14 },
        resolve: (c, ok) => { const p = hire(c); data(c).blade = p.id; learn(c.world, c.house, p.id, 60); c.fx.othes(-1500); c.fx.say(ok ? 'Our Champion held them; they are good, not great' : 'They put our Champion down in a minute'); if (!ok) c.fx.mood(seat(c, 'champion'), -6); }, then: (c) => ({ next: 'k8b', after: days(c, 50, 80) }) },
      { label: 'Send them away', resolve: () => {}, ending: 'Sent away.' },
    ],
    fallback: 2,
  },
  {
    id: 'k8b', title: 'A better offer', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!at(c, c.arc?.data?.blade)?.alive && !!c.other,
    text: (c) => `House ${H(c, c.other)} has offered ${nm(at(c, c.arc?.data?.blade))} twice what we pay. They have come to tell us so, which is something.`,
    options: [
      { label: 'Pay the raise', hint: '−1,500 othes', available: need(1500), resolve: (c) => { c.fx.othes(-1500); const p = at(c, data(c).blade); if (p) p.hidden.loyalty += 2; }, then: (c) => ({ next: 'k8c', after: days(c, 80, 120) }) },
      { label: 'Let them go', resolve: (c) => defect(c, at(c, data(c).blade), c.other), ending: 'Gone to a rival.' },
      { label: 'Win their loyalty', check: { who: highroy, stats: ['eloquence', 'leadership'], dc: 12 },
        resolve: (c, ok) => { const p = at(c, data(c).blade); if (ok && p) { p.hidden.loyalty += 4; shiftOpinion(c.world, p.id, highroy(c)!.id, 25, 'won over by the Highroy'); } else defect(c, p, c.other); },
        then: (c, ok) => (ok ? { next: 'k8c', after: days(c, 80, 120) } : null) },
    ],
    fallback: 1,
  },
  {
    id: 'k8c', title: 'To stay', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!at(c, c.arc?.data?.blade)?.alive && at(c, c.arc?.data?.blade)!.houseId === c.house,
    text: (c) => `${full(at(c, c.arc?.data?.blade))} asks to stay: not for pay, but as a knight of the house.`,
    options: [
      { label: 'Knight them', resolve: (c) => { const p = at(c, data(c).blade)!; p.role = 'Knight'; if (!hasFlag(p, 'knighted')) p.flags.push({ id: 'knighted', since: c.world.date }); giveKnightTitle(p); p.hidden.loyalty += 3; c.fx.say(`${nm(p)} kneels`).mood(p, 12); } },
      { label: 'Keep them as a blade for hire', resolve: (c) => c.fx.mood(at(c, data(c).blade), -4) },
    ],
    fallback: 1,
  },

  // S5 Glass in the barracks
  {
    id: 'str:glass:open', title: 'Glass in the barracks', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => knights(c).length >= 3 && knights(c).some((k) => hasFlag(k, 'godglass')) && !(c.world.story?.struggles ?? []).some((s) => !s.ended && s.kind === 'glass'),
    text: () => 'The Grand Master found godglass in three knights\' kit this Phase. Someone is selling it inside the citadel.',
    options: [
      { label: 'Set the Grand Master on it', resolve: (c) => { const g = seat(c, 'grandMaster'); startStruggle(c.world, 'glass', { strength: 13, theirName: 'the dealer', ours: g ? [g.id] : [] }); } },
      { label: 'Search every knight\'s rooms', resolve: (c) => { for (const k of knights(c)) c.fx.mood(k, -3); startStruggle(c.world, 'glass', { strength: 13, theirName: 'the dealer', meter: 15 }); } },
      { label: 'Let the knights police themselves', resolve: (c) => startStruggle(c.world, 'glass', { strength: 14, theirName: 'the dealer', meter: -10 }) },
    ],
    fallback: 0,
  },
  {
    id: 'str:glass:down', title: 'Collapse in the yard', category: T, trigger: 'home', weight: 0, stage: true, urgent: true,
    setup: (c) => knights(c).length > 0,
    text: () => 'A knight collapsed in the yard this morning, eyes like glass. The others pretended not to see.',
    options: [
      { label: 'Make an example', resolve: (c) => { const k = cast(c, knights(c)); c.fx.mood(k, -15).dread(1); pushStruggle(c.world, strug(c)?.id, 10); } },
      { label: 'Treat them quietly', hint: '−300 othes', resolve: (c) => { c.fx.othes(-300); pushStruggle(c.world, strug(c)?.id, 4); } },
    ],
    fallback: 1,
  },
  {
    id: 'str:glass:up', title: 'A knight informs', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => knights(c).length > 0,
    text: (c) => `${full(cast(c, knights(c)))} came to the Grand Master at night with a name.`,
    options: [{ label: 'Act on it', resolve: (c) => pushStruggle(c.world, strug(c)?.id, 20, 'A knight informed') }],
    fallback: 0,
  },
  {
    id: 'str:glass:won', title: 'The dealer taken', category: T, trigger: 'home', weight: 0, stage: true,
    setup: () => true,
    text: () => 'The dealer was a quartermaster\'s clerk, selling glass from the stores. The order is clean.',
    options: [{ label: 'Hang him', resolve: (c) => { c.fx.dread(2); for (const k of knights(c)) { k.flags = k.flags.filter((f) => f.id !== 'godglass'); c.fx.mood(k, 2); } endStruggle(c.world, strug(c)?.id, true, 'The dealer was taken.'); } }, { label: 'Exile him', resolve: (c) => { c.fx.honour(1); for (const k of knights(c)) k.flags = k.flags.filter((f) => f.id !== 'godglass'); endStruggle(c.world, strug(c)?.id, true, 'The dealer was exiled.'); } }],
    fallback: 0,
  },
  {
    id: 'str:glass:lost', title: 'The order is rotten', category: T, trigger: 'home', weight: 0, stage: true, urgent: true,
    setup: () => true,
    text: () => 'Half the knights are using. Drills are a farce. The Grand Master has offered to resign.',
    options: [{ label: 'Accept it, and start again', resolve: (c) => { for (const k of knights(c)) { if (c.rng.chance(0.5)) { k.flags.push({ id: 'godglass', since: c.world.date }); k.hidden.drift += 1; } k.stats.discipline = Math.max(1, k.stats.discipline - 1); } c.fx.respect(-3); endStruggle(c.world, strug(c)?.id, false, 'The order is rotten with it.'); } }],
    fallback: 0,
  },
];

/** A famed blade from the circuit, taken into the house on contract. */
function hire(c: Ctx): Character {
  const h = pickRival(c);
  const p = stranger(c, { planetId: h ? c.world.houses[h]!.capitalPlanetId : undefined, join: 'Blade for hire' });
  p.stats.duelling = Math.max(p.stats.duelling, 16 + c.rng.int(0, 3)); p.stats.reflexes = Math.max(p.stats.reflexes, 14); p.stats.valor = Math.max(p.stats.valor, 13);
  p.hidden.loyalty = 7;
  return p;
}

void who; void closeThread; void openThreads; void defect;
addEvents(defs);
