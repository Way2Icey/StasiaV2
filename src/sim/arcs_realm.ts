// Batch C: realm and lanes (L1–L4, L6, L7), the Numarade, faith and the Drift (N1–N5), and the campaign (S6).
import { addEvents, choose, type Ctx, type EventDef } from './events';
import { at, athome, band, best, bonded, cast, data, days, fighters, fought, full, H, highroy, need, newCaige, nm, othes, pickRival, resonate, rivals, seat, sectors, stranger, toBattle, away, CYCLES } from './arckit';
import { endStruggle, pushStruggle, startStruggle } from './story';
import { addThread, openThreads } from './storystate';
import { shiftFavour, openFeud } from './houses';
import { relation, shiftRelation } from './relations';
import { seatHolder } from './query';
import { econ } from './economy';
import type { Member } from './companies';

const T = 'Realm';
const strug = (c: Ctx) => c.struggle;
const factions = (c: Ctx) => Object.values(c.world.lanes?.factions ?? {});
const faction = (c: Ctx) => c.world.lanes?.factions[String(c.arc?.data?.faction ?? c.memo?.faction)];
const member = (c: Ctx): Member | undefined => faction(c)?.members.find((m) => m.id === String(c.arc?.data?.member ?? c.memo?.member));
const rel = (c: Ctx, n: number) => { const f = faction(c); if (f) f.rel[c.house] = Math.max(-100, Math.min(100, (f.rel[c.house] ?? 0) + n)); };

const defs: EventDef[] = [
  // L1 The Captain's Daughter
  {
    id: 'l1a', title: "The captain's daughter", arc: "The captain's daughter", category: T, trigger: 'home', weight: 2, act: 'rising',
    setup: (c) => { for (const f of factions(c)) { const m = f.members.find((x) => x.fate === 'captured' && x.fateBy && c.world.characters[x.fateBy]?.houseId === c.house); if (m) { (c.memo ??= {}).faction = f.id; c.memo.member = m.id; return true; } } return false; },
    text: (c) => `A corsair captain has come under truce: the daughter of ${member(c)?.name ?? 'a captain'}, whom we hold. She offers ${faction(c)?.name ?? 'her company'}'s peace on our lanes for her father's freedom.`,
    options: [
      { label: 'Accept', resolve: (c) => { const m = member(c); if (m) delete m.fate; rel(c, 25); }, then: (c) => ({ next: 'l1b', after: days(c, 60, 90) }) },
      { label: 'Refuse', resolve: (c) => rel(c, -10), ending: 'Refused.' },
      { label: 'Hold them both', resolve: (c) => { const f = faction(c); rel(c, -25); c.fx.dread(2).honour(-2); if (f) f.members.push({ id: `cm${c.world.nextId++}`, name: `${member(c)?.name ?? 'the captain'}'s daughter`, role: 'captain', skill: 12, takes: 0, known: true, notes: ['Taken under truce'], fate: 'captured', fateBy: highroy(c)?.id }); }, ending: 'Both held.' },
    ],
    fallback: 1,
  },
  {
    id: 'l1b', title: 'The deal', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!faction(c),
    text: (c) => ((faction(c)!.rel[c.house] ?? 0) >= 10 ? `${faction(c)!.name} have kept their word: not one of our ships touched.` : `${faction(c)!.name} used the peace to learn our convoys' routes, and struck.`),
    options: [{ label: 'So be it', resolve: (c) => { if ((faction(c)!.rel[c.house] ?? 0) >= 10) { rel(c, 10); c.fx.say('A peace that holds'); } else { c.fx.good('provisions', -60); rel(c, -30); } } }],
    fallback: 0,
  },

  // L2 Ghost Convoy
  {
    id: 'l2a', title: 'Ghost convoy', arc: 'Ghost convoy', category: T, trigger: 'home', weight: 1.5, act: 'calm',
    setup: (c) => choose(c, { otherHouseId: pickRival(c) }),
    text: () => 'A convoy of ours never arrived, and no company has claimed it. It simply stopped answering between one beacon and the next.',
    options: [
      { label: 'Write it off', resolve: (c) => c.fx.good('metals', -30), ending: 'Written off.' },
      { label: 'Send a scouting run along the lane', hint: '−200 othes', resolve: (c) => c.fx.othes(-200), then: (c) => ({ next: 'l2b', after: days(c, 20, 30) }) },
    ],
    fallback: 0,
  },
  {
    id: 'l2b', title: 'The derelict', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => fighters(c).length > 0,
    text: () => 'The convoy ship, drifting, dark. One survivor in the cold hold, raving. And a crate not on any manifest, humming.',
    options: [
      { label: 'Board her', check: { who: (c) => best(fighters(c), (x) => x.stats.composure + x.stats.resonanceControl), stats: ['composure', 'resonanceControl'], dc: 11 },
        resolve: (c, ok) => { const x = best(fighters(c), (y) => y.stats.composure + y.stats.resonanceControl); if (ok) { const g = newCaige(c); data(c).caige = g.id; } else c.fx.wound(x).say('Something in the hold burned them'); },
        then: (c, ok) => (ok ? { next: 'l2c', after: days(c, 10, 20) } : null), ending: 'The derelict was left to drift.' },
      { label: 'Tow her home unopened', resolve: (c) => c.fx.good('metals', 20), ending: 'Salvaged.' },
    ],
    fallback: 1,
  },
  {
    id: 'l2c', title: 'Whose Caige', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!c.world.armoury[String(c.arc?.data?.caige)],
    text: (c) => `The Spymaster has traced the crate. It was a secret shipment of House ${H(c, c.other)}: a Caige they never declared to the Numarade.`,
    options: [
      { label: 'Keep it quietly', resolve: (c) => { const h = highroy(c); if (h) addThread(c.world, h.id, 'secret', `Holds House ${H(c, c.other)}'s undeclared Caige`, c.other); } },
      { label: 'Return it', resolve: (c) => { const g = c.world.armoury[String(data(c).caige)]; if (g && c.other) g.houseId = c.other; c.fx.regard(c.other, 12); const h = highroy(c); if (h) addThread(c.world, h.id, 'favour', `House ${H(c, c.other)} owes us for a Caige returned`, c.other); } },
      { label: 'Expose them', resolve: (c) => { shiftFavour(c.world, c.house, 2); shiftFavour(c.world, c.other!, -4); c.fx.regard(c.other, -12); } },
    ],
    fallback: 0,
  },

  // L3 The Corsair King
  {
    id: 'l3a', title: 'The corsair king', arc: 'The corsair king', category: T, trigger: 'home', weight: 1.2, act: 'rising',
    setup: (c) => { for (const f of c.rng.shuffle(factions(c))) { const m = f.members.find((x) => x.role === 'chief' && x.known && !x.fate); if (m) { (c.memo ??= {}).faction = f.id; c.memo.member = m.id; return true; } } return false; },
    text: (c) => `${member(c)?.name}, chief of ${faction(c)?.name}, means to unite the companies under one flag. He asks for our letters of marque, and offers our lanes his peace.`,
    options: [
      { label: 'Back him', resolve: (c) => { rel(c, 30); for (const f of factions(c)) if (f.id !== faction(c)?.id) f.rel[c.house] = (f.rel[c.house] ?? 0) - 10; shiftFavour(c.world, c.house, -1); }, then: (c) => ({ next: 'l3b', after: days(c, 40, 60) }) },
      { label: 'Betray him to the Numarade', resolve: (c) => { shiftFavour(c.world, c.house, 3); rel(c, -40); }, ending: 'Betrayed.' },
      { label: 'Refuse', resolve: (c) => rel(c, -5), ending: 'Refused.' },
    ],
    fallback: 2,
  },
  {
    id: 'l3b', title: 'The meeting of chiefs', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!member(c) && !member(c)!.fate,
    text: (c) => `Every chief of the outer lanes will meet on a dead station to hear ${member(c)?.name}. We are invited.`,
    options: [
      { label: 'Attend', resolve: (c) => { away(c, highroy(c), CYCLES.PHASE, 'at the meeting of chiefs'); rel(c, 10); c.fx.say('The Highroy sits among corsairs'); }, ending: 'Attended.' },
      { label: 'Send the Speaker', check: { who: (c) => seat(c, 'envoy'), stats: ['diplomacy', 'composure'], dc: 11 }, resolve: (c, ok) => rel(c, ok ? 8 : -8), ending: 'Sent the Speaker.' },
      { label: 'Send knights to end him', hint: '⚔ station', resolve: (c) => toBattle(c, { title: 'The meeting of chiefs', theatre: 'station', where: 'a dead station', ours: fighters(c).slice(0, 4), foes: band(member(c)?.name ?? 'the chief', (member(c)?.skill ?? 13) * 0.95, 4, 10, 'a chief\'s guard'), foeName: faction(c)?.name ?? 'the chiefs', foeCommander: { name: member(c)?.name, skill: member(c)?.tactics ?? 12 } }), then: () => ({ next: 'l3c', after: 1 }) },
    ],
    fallback: 1,
  },
  {
    id: 'l3c', title: 'Blades among the chiefs', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!fought(c),
    text: (c) => (fought(c)!.won ? `${member(c)?.name} is dead on the station floor. Every company knows who did it.` : 'Our knights fought their way out. The chiefs will not forget it.'),
    options: [{ label: 'So be it', resolve: (c) => { const m = member(c); if (fought(c)!.won && m) { m.fate = 'dead'; m.fateBy = highroy(c)?.id; c.fx.dread(3); } for (const f of factions(c)) f.rel[c.house] = (f.rel[c.house] ?? 0) - 15; } }],
    fallback: 0,
  },

  // L4 The Blockade Runner
  {
    id: 'l4a', title: 'The blockade runner', arc: 'The blockade runner', category: T, trigger: 'home', weight: 1.2, act: 'calm',
    setup: (c) => { const h = pickRival(c); const runner = stranger(c, {}); runner.stats.intrigue = Math.max(runner.stats.intrigue, 13); (c.memo ??= {}).runner = runner.id; return !!h && choose(c, { otherHouseId: h }); },
    text: (c) => `${full(at(c, c.arc?.data?.runner ?? c.memo?.runner))}, a merchant captain, will run goods past House ${H(c, c.other)}'s pickets from our port, and give us a share.`,
    options: [
      { label: 'Agree', hint: '+600 othes', resolve: (c) => c.fx.othes(600), then: (c) => ({ next: 'l4b', after: days(c, 40, 60) }) },
      { label: 'Refuse', resolve: () => {}, ending: 'Refused.' },
      { label: 'Report her', resolve: (c) => c.fx.regard(c.other, 5), ending: 'Reported.' },
    ],
    fallback: 1,
  },
  {
    id: 'l4b', title: 'Caught', category: T, trigger: 'home', weight: 0, stage: true,
    setup: () => true,
    text: (c) => `House ${H(c, c.other)} caught ${nm(at(c, c.arc?.data?.runner))} on her third run, and demands we hand her over.`,
    options: [
      { label: 'Hand her over', resolve: (c) => c.fx.regard(c.other, 8).honour(-1) },
      { label: 'Protect her', resolve: (c) => { c.fx.regard(c.other, -10); const r = at(c, data(c).runner); if (r) addThread(c.world, r.id, 'debt', 'The house would not give her up', highroy(c)?.id); if (relation(c.world, c.other!, c.house) < -40) openFeud(c.world, c.house, c.other!, 'a blockade runner sheltered'); } },
      { label: 'Pay them off', hint: '−800 othes', available: need(800), resolve: (c) => c.fx.othes(-800) },
    ],
    fallback: 0,
  },

  // L6 Famine on a Rival World
  {
    id: 'l6a', title: 'Famine', arc: 'Famine', category: T, trigger: 'home', weight: 1.2, act: 'rising',
    setup: (c) => { const h = rivals(c).sort((a, b) => econ(c.world, a).stock.provisions - econ(c.world, b).stock.provisions)[0]; return !!h && choose(c, { otherHouseId: h }); },
    text: (c) => `House ${H(c, c.other)}'s worlds are starving. Their granaries are empty and their envoy is at our gate, asking.`,
    options: [
      { label: 'Sell food at a high price', hint: '+900 othes', available: (c) => (econ(c.world, c.house).stock.provisions >= 60 ? null : 'Needs 60 provisions'), resolve: (c) => c.fx.good('provisions', -60).othes(900).regard(c.other, -6), then: (c) => ({ next: 'l6b', after: days(c, 20, 40) }) },
      { label: 'Give it', available: (c) => (econ(c.world, c.house).stock.provisions >= 60 ? null : 'Needs 60 provisions'), resolve: (c) => { c.fx.good('provisions', -60).regard(c.other, 20).honour(2); const h = highroy(c); if (h) addThread(c.world, h.id, 'favour', `Fed House ${H(c, c.other)} in a famine`, c.other); }, ending: 'Given.' },
      { label: 'Let them starve', resolve: (c) => c.fx.regard(c.other, -4), then: (c) => ({ next: 'l6b', after: days(c, 20, 40) }) },
    ],
    fallback: 2,
  },
  {
    id: 'l6b', title: 'Refugees', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => sectors(c).length > 0,
    text: (c) => `Ships of refugees from House ${H(c, c.other)}'s worlds are landing in our sectors.`,
    options: [
      { label: 'Take them in', resolve: (c) => { const s = sectors(c)[0]; c.fx.unrest(s, 8).honour(2); shiftFavour(c.world, c.house, 1); } },
      { label: 'Turn them away', resolve: (c) => c.fx.honour(-2).dread(1) },
      { label: 'Send them on', resolve: (c) => { const other = rivals(c).find((h) => h !== c.other); if (other) shiftRelation(c.world, other, c.house, -4); c.fx.say(`They went on to House ${H(c, other)}`); } },
    ],
    fallback: 1,
  },

  // L7 Murder at the Customs Post
  {
    id: 'l7a', title: 'Murder at the customs post', arc: 'Murder at the customs post', category: T, trigger: 'home', weight: 1.2, act: 'crisis', urgent: true,
    setup: (c) => { (c.memo ??= {}).truth = c.rng.pick(['merchant', 'smuggler', 'debts']); return choose(c, { otherHouseId: pickRival(c) }); },
    text: (c) => `Our customs officer was found dead at the post. The last to see him was a merchant of House ${H(c, c.other)}.`,
    options: [
      { label: 'Hold the merchant', resolve: (c) => c.fx.regard(c.other, -6), then: (c) => ({ next: 'l7b', after: days(c, 6, 12) }) },
      { label: 'Investigate', check: { who: (c) => seat(c, 'spymaster'), stats: ['insight', 'perception'], dc: 11 }, resolve: (c, ok) => { data(c).known = ok ? 1 : 0; c.fx.say(ok ? `It was ${c.arc?.data?.truth === 'merchant' ? 'the merchant' : c.arc?.data?.truth === 'smuggler' ? 'a smuggler\'s knife' : 'his own debts catching up'}` : 'Nothing certain'); }, then: (c) => ({ next: 'l7b', after: days(c, 6, 12) }) },
      { label: 'Release him', resolve: (c) => c.fx.regard(c.other, 2), ending: 'Released.' },
    ],
    fallback: 1,
  },
  {
    id: 'l7b', title: 'An answer', category: T, trigger: 'home', weight: 0, stage: true,
    setup: () => true,
    text: (c) => `House ${H(c, c.other)} wants its merchant back, and an apology.`,
    options: [
      { label: 'Demand an apology of them', resolve: (c) => { if (c.arc?.data?.truth === 'merchant') c.fx.respect(2).regard(c.other, -4); else c.fx.respect(-2).regard(c.other, -10); } },
      { label: 'Hang the guilty', resolve: (c) => { c.fx.dread(2); if (c.arc?.data?.truth === 'merchant') c.fx.regard(c.other, -15); } },
      { label: 'Apologise', resolve: (c) => { c.fx.regard(c.other, 8); if (c.arc?.data?.truth === 'merchant') c.fx.respect(-2); } },
    ],
    fallback: 2,
  },

  // N1 The Census
  {
    id: 'n1a', title: 'The census', arc: 'The census', category: 'Numarade', trigger: 'home', weight: 1.2, act: 'rising',
    setup: () => true,
    text: () => 'Numarade inspectors have arrived to count the house: quota, holdings, Caiges, and anything else they can find.',
    options: [
      { label: 'Open everything', resolve: (c) => { const hid = hidden(c); if (hid.length) { shiftFavour(c.world, c.house, -hid.length); c.fx.say(`They found: ${hid.join(', ')}`); } else { shiftFavour(c.world, c.house, 3); c.fx.say('A clean report'); } } },
      { label: 'Hide what we must', check: { who: (c) => seat(c, 'steward'), stats: ['law', 'stewardship'], dc: 12 }, resolve: (c, ok) => { if (ok) { shiftFavour(c.world, c.house, 1); c.fx.say('Nothing found'); } else { shiftFavour(c.world, c.house, -4); c.fx.respect(-2).say('Caught hiding'); } } },
      { label: 'Bribe the lead inspector', hint: '−900 othes', available: need(900), resolve: (c) => { c.fx.othes(-900); const h = highroy(c); if (h) addThread(c.world, h.id, 'secret', 'Bribed a Numarade inspector'); } },
    ],
    fallback: 1,
  },

  // N2 A Seat in the Numarade, and S6 The Campaign
  {
    id: 'n2a', title: 'A seat in the Numarade', arc: 'A seat in the Numarade', category: 'Numarade', trigger: 'home', weight: 1, act: 'calm',
    setup: (c) => !!seat(c, 'envoy') && !(c.world.story?.struggles ?? []).some((s) => !s.ended && s.kind === 'campaign') && choose(c, { otherHouseId: pickRival(c) }),
    text: () => 'A seat has opened on the committee that sets the houses\' quotas. Our Speaker could stand for it.',
    options: [
      { label: 'Stand for it', resolve: (c) => { const rivalEnvoy = c.other ? seatHolder(c.world, c.other, 'envoy') : undefined; startStruggle(c.world, 'campaign', { title: 'The campaign for the committee', strength: rivalEnvoy ? (rivalEnvoy.stats.diplomacy + rivalEnvoy.stats.eloquence) / 2 + 1 : 12, theirName: rivalEnvoy ? full(rivalEnvoy) : `House ${H(c, c.other)}'s candidate`, theirId: rivalEnvoy?.id, theirHouse: c.other, known: true, ours: [seat(c, 'envoy')!.id] }); } },
      { label: 'Back an ally', resolve: (c) => { const ally = rivals(c).sort((a, b) => relation(c.world, b, c.house) - relation(c.world, a, c.house))[0]; c.fx.regard(ally, 8); shiftFavour(c.world, c.house, 1); } },
      { label: 'Stay out of it', resolve: () => {} },
    ],
    fallback: 2,
  },
  { id: 'str:campaign:open', title: '', category: 'Numarade', trigger: 'home', weight: 0, stage: true, setup: () => false, text: () => '', options: [{ label: '—', resolve: () => {} }], fallback: 0 },
  { id: 'str:campaign:down', title: 'A scandal', category: 'Numarade', trigger: 'home', weight: 0, stage: true, setup: () => true, text: () => 'A pamphlet in the Numarade\'s halls says our candidate takes bribes.', options: [{ label: 'Deny it', check: { who: (c) => seat(c, 'envoy'), stats: ['eloquence', 'composure'], dc: 11 }, resolve: (c, ok) => pushStruggle(c.world, strug(c)?.id, ok ? 8 : -12) }, { label: 'Find who wrote it', resolve: (c) => { c.fx.othes(-300); pushStruggle(c.world, strug(c)?.id, 4); } }], fallback: 0 },
  { id: 'str:campaign:up', title: 'A great house declares', category: 'Numarade', trigger: 'home', weight: 0, stage: true, setup: () => true, text: () => 'One of the great houses has declared for our candidate.', options: [{ label: 'Thank them', resolve: (c) => pushStruggle(c.world, strug(c)?.id, 15) }], fallback: 0 },
  { id: 'str:campaign:won', title: 'The seat is ours', category: 'Numarade', trigger: 'home', weight: 0, stage: true, setup: () => true, text: () => 'The vote is in. The seat is ours.', options: [{ label: 'Take it', resolve: (c) => { shiftFavour(c.world, c.house, 6); c.fx.respect(3); endStruggle(c.world, strug(c)?.id, true, 'The seat was won.'); } }], fallback: 0 },
  { id: 'str:campaign:lost', title: 'The seat goes elsewhere', category: 'Numarade', trigger: 'home', weight: 0, stage: true, setup: () => true, text: (c) => `${c.struggle?.theirs.name ?? 'The rival'} has the seat, and will set our quota.`, options: [{ label: 'Bear it', resolve: (c) => { shiftFavour(c.world, c.house, -3); if (c.struggle?.theirs.houseId) shiftRelation(c.world, c.house, c.struggle.theirs.houseId, -8); endStruggle(c.world, strug(c)?.id, false, 'The seat went to a rival.'); } }], fallback: 0 },

  // N3 The Temple's Tithe
  {
    id: 'n3a', title: "The temple's tithe", arc: "The temple's tithe", category: 'Faith', trigger: 'home', weight: 1.2, act: 'calm',
    setup: () => true,
    text: () => 'The Archon temple asks the house for Navisium to light the festival of the turning year.',
    options: [
      { label: 'Pay it', hint: '−20 Navisium', available: (c) => (econ(c.world, c.house).stock.navisium >= 20 ? null : 'Needs 20 Navisium'), resolve: (c) => { c.fx.good('navisium', -20); shiftFavour(c.world, c.house, 2); }, then: (c) => ({ next: 'n3c', after: days(c, 40, 60) }) },
      { label: 'Pay half', available: (c) => (econ(c.world, c.house).stock.navisium >= 10 ? null : 'Needs 10 Navisium'), resolve: (c) => c.fx.good('navisium', -10), ending: 'Half paid.' },
      { label: 'Refuse', resolve: () => {}, then: (c) => ({ next: 'n3b', after: days(c, 20, 30) }) },
    ],
    fallback: 1,
  },
  {
    id: 'n3b', title: 'The pulpits', category: 'Faith', trigger: 'home', weight: 0, stage: true,
    setup: (c) => sectors(c).length > 0,
    text: () => 'Temple preachers in our sectors are telling the people the house has turned from the divine.',
    options: [
      { label: 'Silence them', resolve: (c) => { c.fx.dread(2).unrest(sectors(c)[0], 3); shiftFavour(c.world, c.house, -2); } },
      { label: 'Answer them', check: { who: highroy, stats: ['eloquence', 'diplomacy'], dc: 12 }, resolve: (c, ok) => { if (ok) c.fx.respect(2); else c.fx.unrest(sectors(c)[0], 5); } },
      { label: 'Give in', resolve: (c) => c.fx.good('navisium', -Math.min(25, econ(c.world, c.house).stock.navisium)).respect(-1) },
    ],
    fallback: 1,
  },
  {
    id: 'n3c', title: 'The festival', category: 'Faith', trigger: 'home', weight: 0, stage: true,
    setup: () => true,
    text: () => 'The festival filled the capital with pilgrims and coin. One of them, a girl who hums when she sleeps, has asked to stay.',
    options: [
      { label: 'Let her stay', resolve: (c) => { c.fx.othes(500); const p = stranger(c, { join: 'Youngling', young: true }); resonate(c, p, 120); } },
      { label: 'Send her home', resolve: (c) => c.fx.othes(500) },
    ],
    fallback: 1,
  },

  // N4 The Rift
  {
    id: 'n4a', title: 'Ships vanish', arc: 'The rift', category: 'Drift', trigger: 'home', weight: 0.8, act: 'crisis', urgent: true,
    setup: (c) => !(c.world.story?.struggles ?? []).some((s) => !s.ended && s.kind === 'drift'),
    text: () => 'Three ships have vanished near the Outer Reach in a Phase. Not taken. Gone, beacons and all.',
    options: [
      { label: 'Close the lane', hint: '−300 othes', resolve: (c) => c.fx.othes(-300), then: (c) => ({ next: 'n4b', after: days(c, 30, 60) }) },
      { label: 'Send a scout', resolve: () => {}, then: (c) => ({ next: 'n4b', after: days(c, 10, 20) }) },
      { label: 'Ignore it', resolve: () => {}, then: (c) => ({ next: 'n4b', after: days(c, 20, 40) }) },
    ],
    fallback: 0,
  },
  {
    id: 'n4b', title: 'The tear', category: 'Drift', trigger: 'home', weight: 0, stage: true, urgent: true,
    setup: () => true,
    text: () => 'There is a tear in the dark near the Outer Reach, and something on the other side. Every one of our people with the drift in them heard it at the same moment.',
    options: [
      { label: 'Send a bearer to look', check: { who: (c) => best(bonded(c), (x) => x.stats.resonanceControl), stats: ['resonanceControl', 'willpower'], dc: 13 },
        resolve: (c, ok) => { hear(c); const x = best(bonded(c), (y) => y.stats.resonanceControl); if (ok) { c.fx.thread(x, 'omen', 'Looked into the Drift'); startStruggle(c.world, 'drift', { title: 'The rift at the Outer Reach', strength: 13, theirName: 'the rift', ours: x ? [x.id] : [], meter: 15 }); } else { c.fx.wound(x); if (x) x.hidden.drift += 2; startStruggle(c.world, 'drift', { title: 'The rift at the Outer Reach', strength: 14, theirName: 'the rift', ours: [] }); } } },
      { label: 'Seal it with the temple', hint: '−600 othes', resolve: (c) => { hear(c); c.fx.othes(-600); startStruggle(c.world, 'drift', { title: 'The rift at the Outer Reach', strength: 13, theirName: 'the rift', ours: [seat(c, 'elder')?.id].filter(Boolean) as string[], meter: 10 }); } },
      { label: 'Let it be', resolve: (c) => { hear(c); startStruggle(c.world, 'drift', { title: 'The rift at the Outer Reach', strength: 14, theirName: 'the rift', meter: -20 }); } },
    ],
    fallback: 2,
  },

  // N5 A Saint in the Making
  {
    id: 'n5a', title: 'A saint in the making', arc: 'A saint in the making', category: 'Faith', trigger: 'home', weight: 1.2, act: 'calm',
    setup: (c) => { const s = sectors(c); if (!s.length) return false; const sec = c.rng.pick(s); const p = stranger(c, { sectorId: sec.id }); p.resonance = { degrees: c.rng.chance(0.5) ? 180 : 40, band: 'frostpoint', type: 'drift' }; p.resonance.band = p.resonance.degrees >= 120 ? 'ambercore' : 'frostpoint'; (c.memo ??= {}).saint = p.id; return choose(c, { sectorId: sec.id }); },
    text: (c) => `A healer in ${c.sector?.name}, ${full(at(c, c.arc?.data?.saint ?? c.memo?.saint))}, lays hands on the sick, and pilgrims have come from three worlds.`,
    options: [
      { label: 'Protect her', resolve: (c) => c.fx.honour(1), then: (c) => ({ next: 'n5b', after: days(c, 30, 50) }) },
      { label: 'Bring her to court', resolve: (c) => { const p = at(c, data(c).saint); if (p) { p.houseId = c.house; p.role = 'Courtier'; } }, then: (c) => ({ next: 'n5b', after: days(c, 30, 50) }) },
      { label: 'Move her on', resolve: (c) => c.fx.unrest(c.sector, 3), ending: 'Moved on.' },
    ],
    fallback: 0,
  },
  {
    id: 'n5b', title: 'Saint or fraud', category: 'Faith', trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!at(c, c.arc?.data?.saint)?.alive,
    text: (c) => `The temple wants to name ${nm(at(c, c.arc?.data?.saint))} a saint. The Numarade's inspectors say she is a fraud. Our Physician has measured her.`,
    options: [
      { label: 'Back the temple', resolve: (c) => { const p = at(c, data(c).saint)!; if ((p.resonance?.degrees ?? 0) >= 120) { c.fx.honour(3); shiftFavour(c.world, c.house, 1); c.fx.thread(p, 'omen', 'Named a saint'); } else { c.fx.respect(-3).say('She was a fraud, and we backed her'); } } },
      { label: 'Back the Numarade', resolve: (c) => { const p = at(c, data(c).saint)!; if ((p.resonance?.degrees ?? 0) >= 120) { c.fx.honour(-2).say('She was real; the temple will not forget'); } else { shiftFavour(c.world, c.house, 2); c.fx.say('A fraud exposed'); } } },
    ],
    fallback: 1,
  },
];

/** What a Numarade inspector could find. */
function hidden(c: Ctx): string[] {
  const out: string[] = [];
  const ours = Object.values(c.world.characters).filter((x) => x.alive && x.houseId === c.house);
  if (ours.some((x) => x.flags.some((f) => f.id === 'godglass'))) out.push('godglass among the knights');
  if (openThreads(c.world, undefined, 'secret').some((t) => /unregistered|Whitebreak/i.test(t.text) && c.world.characters[t.personId]?.houseId === c.house)) out.push('an unregistered bearer');
  if (openThreads(c.world, highroy(c)?.id, 'secret').some((t) => /Caige|inspector/i.test(t.text))) out.push('something in the vault');
  return out;
}

/** Everyone with the drift in them hears the rift. */
function hear(c: Ctx) {
  for (const x of athome(c).filter((y) => y.hidden.drift >= 10)) { x.hidden.drift += 1; c.fx.thread(x, 'omen', 'Heard the rift open'); }
}

void cast; void othes;
addEvents(defs);
