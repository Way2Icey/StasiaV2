// Crisis set-pieces (X1–X4): rare and heavy, saved for when the house is near breaking.
import { addEvents, choose, type Ctx, type EventDef } from './events';
import { at, athome, band, best, bonded, CYCLES, data, fighters, fought, full, H, highroy, nm, pickRival, seat, toBattle } from './arckit';
import { addThread, closeThread, openStruggles, openThreads } from './storystate';
import { openFeud, shiftFavour, feuding } from './houses';
import { pushStruggle } from './story';
import { kill } from './death';
import { isHostile } from './companies';
import { shiftOpinion } from './relationships';
import type { Character } from './types';

const T = 'Crisis';
const ripe = (c: Ctx) => c.world.story?.act === 'crisis';
const councillors = (c: Ctx) => athome(c).filter((x) => x.seat && x.seat !== 'highroy');

const defs: EventDef[] = [
  // X1 The Night of Knives
  {
    id: 'x1a', title: 'The night of knives', arc: 'The night of knives', category: T, trigger: 'home', weight: 3, act: 'crisis', urgent: true,
    setup: (c) => {
      const plot = openStruggles(c.world).find((s) => s.kind === 'plot' && s.meter < -30);
      const foe = Object.keys(c.world.houses).find((h) => h !== c.house && feuding(c.world, c.house, h));
      const cs = councillors(c);
      if (!ripe(c) || (!plot && !foe) || cs.length < 3) return false;
      const [a, b, d] = c.rng.shuffle(cs);
      (c.memo ??= {}).third = d!.id;
      return choose(c, { personId: a!.id, secondId: b!.id, otherHouseId: foe ?? pickRival(c) });
    },
    text: (c) => `Steel in three corridors at once. ${full(c.person)}, ${full(c.second)} and ${full(at(c, c.arc?.data?.third ?? c.memo?.third))} are each under attack, and there are knights enough for two.`,
    options: [
      { label: 'Cover the first two', resolve: (c) => cover(c, [c.person, c.second], at(c, data(c).third)), then: () => ({ next: 'x1b', after: 1 }) },
      { label: `Cover the first and third`, resolve: (c) => cover(c, [c.person, at(c, data(c).third)], c.second), then: () => ({ next: 'x1b', after: 1 }) },
      { label: 'Cover the second and third', resolve: (c) => cover(c, [c.second, at(c, data(c).third)], c.person), then: () => ({ next: 'x1b', after: 1 }) },
    ],
    fallback: 0,
  },
  {
    id: 'x1b', title: 'Dawn', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!fought(c),
    text: (c) => `Dawn. ${fought(c)!.won ? 'The killers are dead or taken, and one of them talked' : 'Most of the killers got away'}. The trail leads to House ${H(c, c.other)}.`,
    options: [
      { label: 'Answer with a feud', resolve: (c) => { openFeud(c.world, c.house, c.other!, 'the night of knives'); c.fx.dread(3).regard(c.other, -25); } },
      { label: 'Take it to the Numarade', resolve: (c) => { shiftFavour(c.world, c.house, fought(c)!.won ? 4 : 1); shiftFavour(c.world, c.other!, -4); c.fx.regard(c.other, -12); } },
      { label: 'Say nothing, and remember', resolve: (c) => { const h = highroy(c); if (h) addThread(c.world, h.id, 'grudge', `House ${H(c, c.other)} sent knives in the night`); c.fx.dread(1); } },
    ],
    fallback: 2,
  },

  // X2 The Raid on the Capital
  {
    id: 'x2a', title: 'Ships over the capital', arc: 'The raid on the capital', category: T, trigger: 'home', weight: 3, act: 'crisis', urgent: true,
    setup: (c) => {
      if (!ripe(c) || fighters(c).length < 2) return false;
      const f = Object.values(c.world.lanes?.factions ?? {}).find((x) => isHostile(c.world, x) || (x.rel[c.house] ?? 0) <= -50);
      if (!f) return false;
      (c.memo ??= {}).faction = f.id;
      return choose(c, { otherHouseId: pickRival(c) });
    },
    text: (c) => `Drop ships of ${c.world.lanes.factions[String(c.arc?.data?.faction ?? c.memo?.faction)]?.name ?? 'a corsair company'} are falling on the capital itself. They have never dared this before. Someone gave them our defences.`,
    options: [
      { label: 'Meet them in the air', hint: '⚔ atmosphere', resolve: (c) => toBattle(c, { title: 'The drop over the capital', theatre: 'atmo', where: 'the sky over the capital', ours: fighters(c).slice(0, 4), foes: band('the drop leader', 13, 3, 10, 'a raider pilot'), foeName: c.world.lanes.factions[String(data(c).faction)]?.name ?? 'the raiders', foeMass: 45 }), then: () => ({ next: 'x2b', after: 1 }) },
      { label: 'Call in a favour', available: (c) => (openThreads(c.world, highroy(c)?.id, 'favour').length ? null : 'No one owes us'), resolve: (c) => { const t = openThreads(c.world, highroy(c)?.id, 'favour')[0]!; closeThread(c.world, t.id); c.fx.say(`House ${H(c, t.about)}'s ships drive them off`).respect(1); }, ending: 'Allies came.' },
      { label: 'Pay them to go', hint: '−2,000 othes', resolve: (c) => c.fx.othes(-2000).respect(-4), ending: 'Paid off.' },
    ],
    fallback: 0,
  },
  {
    id: 'x2b', title: 'In the streets', category: T, trigger: 'home', weight: 0, stage: true, urgent: true,
    setup: (c) => !!fought(c),
    text: (c) => (fought(c)!.won ? 'Most of the drop ships went down burning. Some landed. They are in the market district.' : 'They are down, all of them, and in the streets.'),
    options: [{ label: 'Clear the streets', hint: '⚔ surface', resolve: (c) => { data(c).air = fought(c)!.won ? 1 : 0; toBattle(c, { title: 'The streets of the capital', theatre: 'surface', where: 'the market district', ours: fighters(c).slice(0, 5), foes: band('the raid captain', 13, fought(c)!.won ? 2 : 4, 10, 'a raider'), foeName: 'the raiders', foeMass: fought(c)!.won ? 25 : 45 }); }, then: () => ({ next: 'x2c', after: 1 }) }],
    fallback: 0,
  },
  {
    id: 'x2c', title: 'Who sold us', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!fought(c),
    text: (c) => (fought(c)!.won ? `The capital is ours again. A prisoner swears House ${H(c, c.other)} paid for the raid.` : 'They took what they came for and left. No prisoners.'),
    options: [
      { label: 'Use it', available: (c) => (fought(c)?.won ? null : 'No proof'), resolve: (c) => { openFeud(c.world, c.house, c.other!, 'a raid on our capital'); shiftFavour(c.world, c.other!, -4); c.fx.dread(2); } },
      { label: 'Rebuild', resolve: (c) => { c.fx.othes(-800); for (const s of openStruggles(c.world)) pushStruggle(c.world, s.id, -5); } },
    ],
    fallback: 1,
  },

  // X3 The Caige Riot
  {
    id: 'x3a', title: 'Every Caige wakes', arc: 'The Caige riot', category: T, trigger: 'home', weight: 2, act: 'crisis', urgent: true,
    setup: (c) => ripe(c) && bonded(c).length >= 2,
    text: () => 'A resonance storm has broken over the citadel itself. Every Caige in the house woke at once, and so did the people bonded to them.',
    options: [
      { label: 'Restrain the weakest first', resolve: (c) => riot(c, 2) },
      { label: 'Trust them all to hold', resolve: (c) => riot(c, 0) },
      { label: 'Clear the citadel', hint: 'everyone else out', resolve: (c) => { riot(c, 1); c.fx.respect(-1); } },
    ],
    fallback: 0,
  },

  // X4 Fire in the Archive
  {
    id: 'x4a', title: 'Fire in the archive', arc: 'Fire in the archive', category: T, trigger: 'home', weight: 2, act: 'crisis', urgent: true,
    setup: (c) => ripe(c) && (openStruggles(c.world).some((s) => s.kind === 'plot' || s.kind === 'ring') || !!c.rng.chance(0.3)),
    text: () => 'The archive is burning. Two centuries of records, every report our Spymasters ever filed, and the vault below.',
    options: [
      { label: 'Save the records', resolve: (c) => { c.fx.wound(seat(c, 'elder') ?? best(athome(c), (x) => x.stats.valor)).say('They went into the smoke for the records'); }, then: (c) => ({ next: 'x4b', after: c.rng.int(10, 20) }) },
      { label: 'Save the people', resolve: (c) => { forget(c, 25); c.fx.say('Everyone got out; most of what we knew did not'); }, then: (c) => ({ next: 'x4b', after: c.rng.int(10, 20) }) },
      { label: 'Save the vault', resolve: (c) => { forget(c, 15); c.fx.say('The Caiges are safe; half the archive is ash'); }, then: (c) => ({ next: 'x4b', after: c.rng.int(10, 20) }) },
    ],
    fallback: 1,
  },
  {
    id: 'x4b', title: 'What the ashes showed', category: T, trigger: 'home', weight: 0, stage: true,
    setup: () => true,
    text: () => 'Under the burned shelves the clearers found a sealed box older than the house\'s founding. Inside: proof that the first Highroy was not who the histories say.',
    options: [
      { label: 'Read it to the court', resolve: (c) => c.fx.honour(2).respect(-2).say('The house is shaken, and more honest for it') },
      { label: 'Burn it', resolve: (c) => { const h = highroy(c); if (h) addThread(c.world, h.id, 'secret', 'Burned the truth about the house\'s founding'); } },
    ],
    fallback: 1,
  },
];

function cover(c: Ctx, guarded: (Character | undefined)[], open: Character | undefined) {
  if (open?.alive) { if (c.rng.chance(0.45)) { kill(c.world, open, c.world.date, 'assassinated on the night of knives'); c.fx.say(`${nm(open)} was killed in their rooms`); } else c.fx.wound(open).say(`${nm(open)} fought them off alone, barely`); }
  const g = guarded.filter((x): x is Character => !!x?.alive);
  toBattle(c, { title: 'The night of knives', theatre: 'station', where: 'the citadel\'s corridors', ours: [...fighters(c).filter((x) => !g.includes(x)).slice(0, 3), ...g.slice(0, 1)], foes: band('a masked killer', 14, 3, 11, 'a killer'), foeName: 'the killers' });
}

function riot(c: Ctx, care: number) {
  const bs = bonded(c);
  for (const b of bs) {
    const v = b.stats.resonanceControl + b.stats.willpower + care * 2 + c.rng.gauss() * 4;
    if (v >= 24) { c.fx.thread(b, 'omen', 'Held their Caige in the riot'); continue; }
    const others = bs.filter((x) => x !== b);
    const victim = others.length ? c.rng.pick(others) : b;
    c.fx.wound(victim).say(`${nm(b)} lost hold, and ${nm(victim)} paid for it`);
    if (victim !== b) { shiftOpinion(c.world, victim.id, b.id, -25, 'hurt in the Caige riot'); addThread(c.world, victim.id, 'grudge', `Hurt by ${nm(b)} in the Caige riot`, b.id); }
    if (c.rng.chance(0.08)) { kill(c.world, victim, c.world.date, 'the Caige riot'); c.fx.say(`${nm(victim)} did not survive it`); }
  }
}

/** The house forgets what it knew of others. */
function forget(c: Ctx, by: number) {
  const k = c.world.knowledge[c.house] ?? {};
  for (const [id, e] of Object.entries(k)) if (c.world.characters[id]?.houseId !== c.house) e.depth = Math.max(0, e.depth - by);
}

void CYCLES;
addEvents(defs);
