// Batch A: thread pickups (T1–T8). Stories that start from what an earlier story left hanging on someone.
import { addEvents, choose, type Ctx, type EventDef } from './events';
import { at, away, CYCLES, days, defect, fought, full, H, highroy, nm, pickRival, seat, threadsHome, toBattle, who } from './arckit';
import { closeThread, openThreads, type Thread } from './storystate';
import { startStruggle, pushStruggle } from './story';
import { barsOf, shiftOpinion } from './relationships';
import { relation } from './relations';
import { shiftFavour } from './houses';
import { award } from './careers';
import { kill } from './death';
import { isAway } from './court';

const T = 'Threads';
const thread = (c: Ctx): Thread | undefined => (c.world.story?.threads ?? []).find((t) => t.id === String(c.arc?.data?.thread ?? c.memo?.thread));
const pick = (c: Ctx, ts: Thread[]) => { const t = ts.length ? c.rng.pick(ts) : undefined; if (t) (c.memo ??= {}).thread = t.id; return t; };

const defs: EventDef[] = [
  // T1 The Score: a grudge against someone of another house, and a chance to settle it.
  {
    id: 't1a', title: 'The score', arc: 'The score', category: T, trigger: 'home', weight: 1.5, act: 'rising',
    setup: (c) => {
      const t = pick(c, threadsHome(c, 'grudge').filter((x) => { const o = at(c, x.about); return !!o?.alive && o.houseId !== c.house && !isAway(c.world, o.id); }));
      return !!t && choose(c, { personId: t.personId, secondId: t.about });
    },
    text: (c) => `${full(c.person)} has learned that ${full(c.second)} of House ${H(c, c.second?.houseId)} will be at the Exchange this Phase. They ask leave to settle what is between them.`,
    options: [
      { label: 'Allow it', hint: '⚔ surface, the two of them', resolve: (c) => toBattle(c, { title: `${nm(c.person)} and ${nm(c.second)}`, theatre: 'surface', where: 'the Exchange docks at dawn', ours: [c.person!], foes: [{ id: c.second!.id, champion: true }], foeName: nm(c.second), foeHouse: c.second?.houseId, foeCommander: { id: c.second!.id }, mass: 1, foeMass: 1 }), then: () => ({ next: 't1b', after: 1 }) },
      { label: 'Forbid it', resolve: (c) => c.fx.mood(c.person, -6), ending: 'Forbidden.' },
      { label: 'Look the other way', resolve: (c) => { c.fx.regard(c.second?.houseId, -3); if (c.rng.chance(0.5)) { c.fx.wound(c.rng.chance(0.5) ? c.person : c.second).say('They met anyway'); closeThread(c.world, thread(c)!.id); } }, ending: 'They met, or didn\'t.' },
    ],
    fallback: 1,
  },
  {
    id: 't1b', title: 'Settled', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!fought(c),
    text: (c) => (fought(c)!.won ? `${nm(c.person)} walked away from the docks. ${nm(c.second)} was carried.` : `${nm(c.second)} walked away. ${nm(c.person)} did not.`),
    options: [{ label: 'So be it', resolve: (c) => { const t = thread(c); if (fought(c)!.won) { if (t) closeThread(c.world, t.id); c.fx.mood(c.person, 8).regard(c.second?.houseId, -4); award(c.world, c.person!.id, 'Settled a score'); } else c.fx.mood(c.person, -6); } }],
    fallback: 0,
  },

  // T2 The Debt Repaid
  {
    id: 't2a', title: 'The debt repaid', arc: 'The debt repaid', category: T, trigger: 'home', weight: 1.5, act: 'crisis', urgent: true,
    setup: (c) => { const t = pick(c, threadsHome(c, 'debt').filter((x) => !x.about || x.about === highroy(c)?.id)); return !!t && choose(c, { personId: t.personId }); },
    text: (c) => `A knife in the Highroy's hall, at a feast, from a servant no one knew. ${full(c.person)}, who owes the Highroy their life, is closest.`,
    options: [{ label: 'Everything happens at once', resolve: (c) => {
      const p = c.person!; const t = thread(c);
      if (p.hidden.loyalty >= 10 || barsOf(c.world, p.id, highroy(c)?.id ?? '').like >= 40) {
        if (c.rng.chance(0.35)) { kill(c.world, p, c.world.date, 'taking a knife meant for the Highroy'); c.fx.say(`${nm(p)} took the knife meant for the Highroy, and died of it`).respect(2); }
        else { c.fx.wound(p).say(`${nm(p)} took the knife meant for the Highroy`).respect(2); const h = highroy(c); if (h) shiftOpinion(c.world, h.id, p.id, 30, 'took a knife for them'); }
        if (t) closeThread(c.world, t.id);
      } else { c.fx.wound(highroy(c)).say(`${nm(p)} stepped aside`); defect(c, p, pickRival(c)); }
    } }],
    fallback: 0,
  },

  // T3 Shame
  {
    id: 't3a', title: 'Shame', arc: 'Shame', category: T, trigger: 'home', weight: 1.5, act: 'calm',
    setup: (c) => { const t = pick(c, threadsHome(c, 'secret').filter((x) => /\bout\b/i.test(x.text))); return !!t && choose(c, { personId: t.personId }); },
    text: (c) => `Since the truth came out, the court has turned its back on ${full(c.person)}. They eat alone.`,
    options: [
      { label: 'Stand by them', resolve: (c) => { c.fx.honour(-1).mood(c.person, 8); const h = highroy(c); if (h) shiftOpinion(c.world, c.person!.id, h.id, 15, 'stood by them in shame'); }, then: (c) => ({ next: 't3b', after: days(c, 30, 60) }) },
      { label: 'Send them away for a while', resolve: (c) => { away(c, c.person, CYCLES.PHASE * 2, 'away from the court'); c.fx.mood(c.person, -4); }, ending: 'Sent away until it passes.' },
      { label: 'Let it run', resolve: (c) => c.fx.mood(c.person, -8), then: (c) => ({ next: 't3b', after: days(c, 30, 60) }) },
    ],
    fallback: 2,
  },
  {
    id: 't3b', title: 'A chance to be someone else', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!c.person?.alive,
    text: (c) => `${full(c.person)} asks for the worst task the house has: a raid, a hunt, anything. Something to be remembered for besides this.`,
    options: [
      { label: 'Give them one', check: { who: who.person, stats: ['valor', 'duelling'], dc: 12 }, resolve: (c, ok) => { const t = thread(c); if (ok) { if (t) closeThread(c.world, t.id); c.fx.mood(c.person, 12).respect(1).say('They came back with a different name'); } else c.fx.wound(c.person); } },
      { label: 'Refuse', resolve: (c) => c.fx.mood(c.person, -6) },
    ],
    fallback: 1,
  },

  // T4 The Calling
  {
    id: 't4a', title: 'The calling', arc: 'The calling', category: T, trigger: 'home', weight: 1.5, act: 'rising',
    setup: (c) => { const t = pick(c, threadsHome(c, 'omen')); return !!t && choose(c, { personId: t.personId, otherHouseId: pickRival(c) }); },
    text: (c) => `Something is calling ${full(c.person)}: a temple speaker at the gate, a letter from House ${H(c, c.other)}, a Caige in a vault that hums when they pass. They want to answer it.`,
    options: [
      { label: 'Let them go to it', hint: 'away a Phase; they return stronger', resolve: (c) => { away(c, c.person, CYCLES.PHASE * 2, 'answering a calling'); c.fx.stat(c.person, 'resonanceControl', 2).mood(c.person, 6); const t = thread(c); if (t) closeThread(c.world, t.id); } },
      { label: 'Keep them here', resolve: (c) => { const p = c.person!; if (p.hidden.loyalty >= 10) c.fx.mood(p, -4); else { c.fx.thread(p, 'grudge', 'Kept from their calling', highroy(c)?.id); if (c.rng.chance(0.3)) defect(c, p, c.other); } } },
    ],
    fallback: 1,
  },

  // T5 What the Surge Took
  {
    id: 't5a', title: 'What the surge took', arc: 'What the surge took', category: T, trigger: 'home', weight: 1.5, act: 'calm',
    setup: (c) => { const t = pick(c, threadsHome(c, 'scar')); return !!t && choose(c, { personId: t.personId }); },
    text: (c) => `${full(c.person)} greeted an old friend as a stranger this morning, and could not say why they hate the man they used to share a table with.`,
    options: [
      { label: 'Ask the Elder to bring it back', check: { who: (c) => seat(c, 'elder'), stats: ['intellect', 'composure'], dc: 11 },
        resolve: (c, ok) => { const t = thread(c); if (ok) { if (t) closeThread(c.world, t.id); c.fx.mood(c.person, 4).say('It comes back, slowly'); } else forget(c, 0.4); } },
      { label: 'Let it go', resolve: (c) => { forget(c, 0.6); const t = thread(c); if (t) closeThread(c.world, t.id); c.fx.mood(c.person, 2); } },
    ],
    fallback: 1,
  },

  // T6 The Vow Tested
  {
    id: 't6a', title: 'The vow tested', arc: 'The vow tested', category: T, trigger: 'home', weight: 1.5, act: 'rising',
    setup: (c) => { const t = pick(c, threadsHome(c, 'vow')); return !!t && choose(c, { personId: t.personId }); },
    text: (c) => `${full(c.person)} reminds the Highroy what they swore: ${thread(c)?.text.replace(/^Swore[^:]*:\s*/, '') ?? 'a vow'} The chance has come, they say.`,
    options: [
      { label: 'Let them keep it', check: { who: who.person, stats: ['valor', 'duelling', 'leadership'], dc: 12 },
        resolve: (c, ok) => { const t = thread(c); if (ok) { if (t) closeThread(c.world, t.id); award(c.world, c.person!.id, 'Kept their vow'); c.fx.mood(c.person, 10); if (c.person) c.person.hidden.loyalty += 1; } else c.fx.wound(c.person).say('Not this time'); } },
      { label: 'Hold them back', resolve: (c) => { c.fx.mood(c.person, -8).thread(c.person, 'grudge', 'Was not allowed to keep their vow', highroy(c)?.id); } },
    ],
    fallback: 1,
  },

  // T7 The Disaffected
  {
    id: 't7a', title: 'The disaffected', arc: 'The disaffected', category: T, trigger: 'home', weight: 2, act: 'rising',
    setup: (c) => { const t = pick(c, threadsHome(c, 'grudge').filter((x) => x.about === highroy(c)?.id)); return !!t && !(c.world.story?.struggles ?? []).some((s) => !s.ended && s.kind === 'plot') && choose(c, { personId: t.personId }); },
    text: (c) => `${full(c.person)} has been seen with people who have no business with our house, more than once. They have not forgotten: ${thread(c)?.text.toLowerCase() ?? 'an old wrong'}.`,
    options: [
      { label: 'Reconcile: an audience, and a gift', hint: '−400 othes', resolve: (c) => { c.fx.othes(-400); const h = highroy(c); if (h) shiftOpinion(c.world, c.person!.id, h.id, 20, 'reconciled'); if (barsOf(c.world, c.person!.id, h?.id ?? '').dislike < 40) { const t = thread(c); if (t) closeThread(c.world, t.id); c.fx.say('The grudge is let go'); } else c.fx.say('It softens, but stays'); }, ending: 'Reconciled, or nearly.' },
      { label: 'Have them watched', resolve: (c) => c.fx.learnOf(c.person, 20), then: (c) => ({ next: 't7b', after: days(c, 20, 40) }) },
      { label: 'Ignore it', resolve: () => {}, then: (c) => ({ next: 't7c', after: days(c, 40, 60) }) },
    ],
    fallback: 2,
  },
  {
    id: 't7b', title: 'Meetings after midnight', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!c.person?.alive && c.person.houseId === c.house,
    text: (c) => `The Spymaster reports: ${nm(c.person)} meets the same three people after midnight. It is a plot, and we know who is at the heart of it.`,
    options: [{ label: 'Set the Spymaster on it', resolve: (c) => { const sp = seat(c, 'spymaster'); startStruggle(c.world, 'plot', { strength: 12, theirName: full(c.person), theirId: c.person!.id, known: true, cast: { personId: c.person!.id }, ours: sp ? [sp.id] : [], meter: 15 }); } }],
    fallback: 0,
  },
  {
    id: 't7c', title: 'Gone, or worse', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!c.person?.alive && c.person.houseId === c.house,
    text: (c) => `${full(c.person)} has decided what to do about the house.`,
    options: [{ label: 'We will see', resolve: (c) => {
      if (c.rng.chance(0.5)) startStruggle(c.world, 'plot', { strength: 13, theirName: 'someone at court', theirId: c.person!.id, cast: { personId: c.person!.id }, meter: -15 });
      else defect(c, c.person, pickRival(c));
    } }],
    fallback: 0,
  },

  // T8 Calling In the Favour
  {
    id: 't8a', title: 'Calling in the favour', arc: 'Calling in the favour', category: T, trigger: 'home', weight: 2, act: 'crisis',
    setup: (c) => { const t = pick(c, openThreads(c.world, highroy(c)?.id, 'favour').filter((x) => x.about && c.world.houses[x.about])); return !!t && choose(c, { otherHouseId: t.about }); },
    text: (c) => `The house is pressed hard. House ${H(c, c.other)} owes us. The Speaker asks whether now is the time.`,
    options: [
      { label: 'Call it in', resolve: (c) => {
        const t = thread(c);
        if (relation(c.world, c.other!, c.house) >= 0) { c.fx.respect(2).say(`House ${H(c, c.other)} honours it`); shiftFavour(c.world, c.house, 2); for (const s of (c.world.story?.struggles ?? []).filter((x) => !x.ended)) pushStruggle(c.world, s.id, 20, `House ${H(c, c.other)} lent its weight`); }
        else c.fx.regard(c.other, -15).say(`House ${H(c, c.other)} pretends not to remember`);
        if (t) closeThread(c.world, t.id);
      } },
      { label: 'Save it', resolve: () => {} },
    ],
    fallback: 1,
  },
];

/** The surge took memories: ties fade. */
function forget(c: Ctx, by: number) {
  const p = c.person; if (!p) return;
  for (const o of Object.keys(c.world.ties?.[p.id] ?? {})) {
    const b = barsOf(c.world, p.id, o);
    const net = b.like - b.dislike;
    if (Math.abs(net) > 5) shiftOpinion(c.world, p.id, o, -net * by, 'forgotten');
  }
  c.fx.say(`${nm(p)} has forgotten much of who they were to people`);
}

addEvents(defs);
