// Arcs and struggles: stories that run over several stages, cast from the world, that remember what the
// Highroy chose and pick up the threads it left. Each stage is an ordinary event; `then` carries it on.
import { addEvents, choose, who, type Ctx, type EventDef } from './events';
import { displayName, shortName } from './names';
import { seatHolder, ruler } from './query';
import { isAway } from './court';
import { econ } from './economy';
import { bandFor } from './characters';
import { shiftOpinion, shiftBoth, barsOf, setBond } from './relationships';
import { kill } from './death';
import { addThread, closeThread, openThreads, type Struggle } from './storystate';
import { startStruggle, endStruggle, pushStruggle, naturalFor } from './story';
import { addCycles, CYCLES_PER_ORBIT, CYCLES_PER_PHASE } from './time';
import { shiftFavour } from './houses';
import { learn } from './knowledge';
import type { Character, CouncilSeat } from './types';

const nm = (c?: Character) => (c ? shortName(c.name) : 'someone');
const full = (c?: Character) => (c ? displayName(c.name) : 'someone');
const seat = (c: Ctx, s: CouncilSeat) => seatHolder(c.world, c.house, s);
const highroy = (c: Ctx) => ruler(c.world, c.house);
const othes = (c: Ctx) => econ(c.world, c.house).stock.othes;
const need = (n: number) => (c: Ctx) => (othes(c) >= n ? null : `Needs ${n.toLocaleString('en-US')} othes`);
const athome = (c: Ctx) => Object.values(c.world.characters).filter((x) => x.alive && x.houseId === c.house && x.tier === 'full' && !isAway(c.world, x.id));
const hasFlag = (x: Character, id: string) => x.flags.some((f) => f.id === id);
const rivals = (c: Ctx) => Object.keys(c.world.houses).filter((h) => h !== c.house);
const data = (c: Ctx) => (c.arc ? (c.arc.data ??= {}) : {});
const days = (lo: number, hi: number) => (c: Ctx) => c.rng.int(lo, hi);
const at = (c: Ctx, id: string) => (id ? c.world.characters[id] : undefined);
const strug = (c: Ctx): Struggle | undefined => c.struggle;

/** Raise someone's resonance by some degrees; the band follows. */
function resonate(c: Ctx, x: Character | undefined, deg: number) {
  if (!x?.resonance) return;
  const before = x.resonance.band;
  x.resonance.degrees = Math.max(0, x.resonance.degrees + deg);
  x.resonance.band = bandFor(x.resonance.degrees);
  c.fx.say(before !== x.resonance.band ? `${nm(x)}'s resonance climbs into ${x.resonance.band}` : `${nm(x)}'s resonance ${deg > 0 ? 'deepens' : 'fades'}`);
}

// ---------------------------------------------------------------- resonance: the hum

const hum: EventDef[] = [
  {
    id: 'hum1', title: 'The hum', arc: 'The hum', category: 'Resonance', trigger: 'home', weight: 2, act: 'rising',
    setup: (c) => {
      const latent = athome(c).filter((x) => x.resonance && x.resonance.band === 'bluewake' && x.seat !== 'highroy');
      return latent.length > 0 && choose(c, { personId: c.rng.pick(latent).id });
    },
    text: (c) => `${full(c.person)} hears a hum under everything: the walls, the water, other people's voices. It is louder near the vault where the Caiges sleep. They have not slept properly in a week.`,
    options: [
      { label: 'Send them to the Physician', hint: 'slow and safe',
        resolve: (c) => { data(c).mode = 'watched'; c.fx.mood(c.person, 2); },
        then: (c) => ({ next: 'hum2', after: days(28, 44)(c) }) },
      { label: 'Push them: train it', check: { who: who.person, stats: ['resonanceControl', 'willpower'], dc: 10 },
        resolve: (c, ok) => { data(c).mode = 'pushed'; if (ok) c.fx.stat(c.person, 'resonanceControl', 1); else c.fx.wound(c.person).say('The first session went badly'); },
        then: (c) => ({ next: 'hum2', after: days(14, 24)(c) }) },
      { label: 'Keep it quiet', hint: 'no one else knows',
        resolve: (c) => { data(c).mode = 'hidden'; c.fx.thread(c.person, 'secret', 'Hears the hum, and the house has hidden it'); },
        then: (c) => ({ next: 'hum2', after: days(20, 40)(c) }) },
    ],
    fallback: 0,
  },
  {
    id: 'hum2', title: 'The surge', category: 'Resonance', trigger: 'home', weight: 0, stage: true, urgent: true, life: 6,
    setup: (c) => !!c.person?.alive && !isAway(c.world, c.person.id),
    text: (c) => {
      const mode = c.arc?.data?.mode;
      return mode === 'hidden'
        ? `It happened in the lower hall, in front of everyone. ${full(c.person)} went rigid and every lamp on the level burst. The hum is a roar now, and there is no hiding it.`
        : mode === 'pushed'
          ? `In the training yard ${full(c.person)} reached for the hum and it reached back. The air around them is bending. The Grand Master has cleared the yard.`
          : `The Physician sends for you at night. ${full(c.person)} is burning with it: the hum has become a surge, and it is now or never.`;
    },
    options: [
      { label: 'Hold them through it', hint: 'the Physician or the Elder at their side',
        check: { who: who.person, stats: ['willpower', 'resonanceControl'], dc: 11 },
        resolve: (c, ok) => {
          const helper = seat(c, 'physician') ?? seat(c, 'elder');
          if (ok) { resonate(c, c.person, 90); c.fx.thread(c.person, 'omen', 'Awakened in a surge').mood(c.person, 5); if (helper) shiftBoth(c.world, helper.id, c.person!.id, 12, 'held them through the surge'); }
          else { c.fx.wound(c.person).say('They came through it, barely'); if (helper) c.fx.wound(helper); resonate(c, c.person, 20); }
        },
        then: (c, ok) => (ok ? { next: 'hum3', after: days(30, 60)(c) } : null), ending: 'Burned, but alive.' },
      { label: 'Let it run its course', hint: 'more to gain, more to lose',
        check: { who: who.person, stats: ['willpower'], dc: 12 },
        resolve: (c, ok) => {
          if (ok) { resonate(c, c.person, 150); c.fx.thread(c.person, 'omen', 'Came through the surge alone'); }
          else { if (c.person) c.person.hidden.drift += 2; c.fx.wound(c.person).mood(c.person, -8).say('Something of them did not come back'); c.fx.thread(c.person, 'scar', 'The surge left a mark on the mind'); }
        },
        then: (c, ok) => (ok ? { next: 'hum3', after: days(20, 40)(c) } : null), ending: 'The surge took something with it.' },
      { label: 'Sedate them', hint: 'it fades, and so does the chance',
        resolve: (c) => { c.fx.mood(c.person, -5).say('The hum falls silent'); resonate(c, c.person, -10); }, ending: 'Silenced.' },
    ],
    fallback: 2,
  },
  {
    id: 'hum3', title: 'The temple asks', category: 'Resonance', trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!c.person?.alive,
    text: (c) => `Word of ${nm(c.person)}'s awakening has reached Archon. A temple speaker is at the gate: resonance like that is a gift of the divine, and should be taught by those who understand it. A year with them, she says, and they would come back something more.`,
    options: [
      { label: 'Let them go for a year', hint: 'away an Orbit; control and standing with the temple',
        resolve: (c) => { const p = c.person; if (!p) return; c.fx.stat(p, 'resonanceControl', 2).stat(p, 'caigeSync', 1); shiftFavour(c.world, c.house, 2); p.flags.push({ id: 'travelling', since: c.world.date, until: addCycles(c.world.date, CYCLES_PER_ORBIT), detail: 'studying with the temple' }); c.fx.say(`${nm(p)} goes to the temple`); }, ending: 'They went to the temple.' },
      { label: 'Refuse the temple', resolve: (c) => { c.fx.dread(1).respect(-1); shiftFavour(c.world, c.house, -1); }, ending: 'The house kept its own.' },
      { label: 'Let them choose', resolve: (c) => {
        const p = c.person; if (!p) return;
        if (p.hidden.loyalty >= 12) { c.fx.say(`${nm(p)} stays: "This is my house."`).mood(p, 6); const h = highroy(c); if (h) shiftOpinion(c.world, p.id, h.id, 10, 'let them choose'); }
        else { c.fx.say(`${nm(p)} goes`).stat(p, 'resonanceControl', 2); p.flags.push({ id: 'travelling', since: c.world.date, until: addCycles(c.world.date, CYCLES_PER_ORBIT), detail: 'studying with the temple' }); }
      }, ending: 'They chose.' },
    ],
    fallback: 1,
  },
];

// ---------------------------------------------------------------- the Caige's pull

const pull: EventDef[] = [
  {
    id: 'pull1', title: 'Sleeping with the Caige', arc: "The Caige's pull", category: 'Resonance', trigger: 'home', weight: 2, act: 'rising',
    setup: (c) => {
      const b = athome(c).filter((x) => hasFlag(x, 'caigeBonded') && (x.stats.caigeSync >= 11 || x.hidden.drift >= 10) && !(c.world.story?.struggles ?? []).some((s) => !s.ended && s.kind === 'madness' && s.cast.personId === x.id));
      return b.length > 0 && choose(c, { personId: c.rng.pick(b).id });
    },
    text: (c) => `${full(c.person)} will not be parted from their Caige. They sleep with it, eat beside it, and talk to it when they think no one hears. The other knights have started leaving the room when it hums.`,
    options: [
      { label: 'Send them to the Elder', check: { who: who.person, stats: ['resonanceControl', 'composure'], dc: 11 },
        resolve: (c, ok) => { if (ok) c.fx.stat(c.person, 'resonanceControl', 1).say('The Elder talks them back to themselves'); else c.fx.say('They came back worse'); },
        then: (c, ok) => (ok ? null : { next: 'pull2', after: days(10, 20)(c) }), ending: 'Steadied by the Elder.' },
      { label: 'It is a weapon. Let them carry it.', hint: 'sync, at a price',
        resolve: (c) => { c.fx.stat(c.person, 'caigeSync', 1); if (c.person) c.person.hidden.drift += 1; },
        then: (c) => ({ next: 'pull2', after: days(16, 30)(c) }) },
      { label: 'Take it from them a while', resolve: (c) => { c.fx.mood(c.person, -10).say('They hand it over, shaking'); const h = highroy(c); if (h && c.person) shiftOpinion(c.world, c.person.id, h.id, -8, 'took their Caige away for a time'); }, ending: 'The Caige went back to the vault for a time.' },
    ],
    fallback: 0,
  },
  {
    id: 'pull2', title: 'The hooks are in', category: 'Resonance', trigger: 'home', weight: 0, stage: true, urgent: true,
    setup: (c) => !!c.person?.alive && hasFlag(c.person, 'caigeBonded'),
    text: (c) => `${full(c.person)} struck a servant who touched the Caige. They do not remember doing it. The pull has its hooks in, and the house has to decide how to fight it.`,
    options: [
      { label: 'Set the Physician and the Elder on it', hint: 'a long struggle, with help',
        resolve: (c) => {
          const helpers = [seat(c, 'physician'), seat(c, 'elder')].filter((x): x is Character => !!x && x.id !== c.person?.id && !isAway(c.world, x.id)).map((x) => x.id);
          startStruggle(c.world, 'madness', { title: `${nm(c.person)} and the Caige`, strength: pullOf(c.person), theirName: 'the Caige', cast: { personId: c.person?.id }, ours: helpers, meter: 10 });
          c.fx.say('The house sets itself against the pull');
        }, ending: 'A struggle began.' },
      { label: 'Trust them to master it', hint: 'alone, and proud of it',
        resolve: (c) => { startStruggle(c.world, 'madness', { title: `${nm(c.person)} and the Caige`, strength: pullOf(c.person), theirName: 'the Caige', cast: { personId: c.person?.id } }); c.fx.mood(c.person, 4); }, ending: 'A struggle began.' },
      { label: 'Unbond them', hint: 'the Caige goes back to the vault',
        resolve: (c) => unbond(c), ending: 'Unbonded.' },
    ],
    fallback: 0,
  },
];

function pullOf(x?: Character): number {
  const b = x?.resonance?.band;
  return 13 + (b === 'whitebreak' ? 6 : b === 'redline' ? 4 : b === 'ambercore' ? 2 : 0) + (x ? x.hidden.drift / 4 : 0);
}

function unbond(c: Ctx) {
  const p = c.person;
  if (!p) return;
  const cg = Object.values(c.world.armoury).find((g) => g.bondedTo === p.id);
  if (cg) delete cg.bondedTo;
  p.flags = p.flags.filter((f) => f.id !== 'caigeBonded');
  c.fx.mood(p, -18).stat(p, 'caigeSync', -2).say(`${nm(p)} is parted from ${cg?.name ?? 'the Caige'}`);
  c.fx.thread(p, 'grudge', 'Their Caige was taken from them', highroy(c)?.id);
}

// ---------------------------------------------------------------- a plot

const plot: EventDef[] = [
  {
    id: 'str:plot:open', title: 'A name too often', category: 'Intrigue', trigger: 'home', weight: 0, stage: true,
    setup: (c) => {
      if ((c.world.story?.struggles ?? []).some((x) => !x.ended && x.kind === 'plot')) return false;
      const sus = athome(c).filter((x) => x.seat !== 'highroy' && x.hidden.ambition >= 12 && x.hidden.loyalty <= 9);
      return sus.length > 0 && choose(c, { personId: c.rng.pick(sus).id });
    },
    text: (c) => `The Spymaster has heard the same name in three different rooms this Phase: ${full(c.person)}. Meetings after midnight, letters with no seal, a ship's master paid in cash. Someone is moving against the throne.`,
    options: [
      { label: 'Have them watched', hint: 'our Spymaster against their cunning',
        check: { who: (c) => seat(c, 'spymaster'), stats: ['intrigue', 'insight'], dc: 0, vs: who.person, vsStats: ['deception', 'intrigue'] },
        resolve: (c, ok) => {
          const sp = seat(c, 'spymaster');
          startStruggle(c.world, 'plot', { strength: plotStrength(c.person), theirName: ok ? full(c.person) : 'someone at court', theirId: c.person?.id, known: ok, cast: { personId: c.person?.id }, ours: sp ? [sp.id] : [], meter: ok ? 20 : 0 });
          if (ok) c.fx.learnOf(c.person, 15).say('We know who'); else c.fx.say('They know they are watched');
        } },
      { label: 'Confront them openly', check: { who: highroy, stats: ['insight', 'composure'], dc: 0, vs: who.person, vsStats: ['composure', 'deception'] },
        resolve: (c, ok) => {
          if (ok) { c.fx.mood(c.person, -10).dread(1).say(`${nm(c.person)} breaks, and the plot with them`); if (c.person) c.person.hidden.ambition = Math.max(1, c.person.hidden.ambition - 3); c.fx.thread(c.person, 'grudge', 'Was broken in front of the court', highroy(c)?.id); }
          else { c.fx.respect(-2).say('They laugh it off, and now they know'); startStruggle(c.world, 'plot', { strength: plotStrength(c.person) + 2, theirName: 'someone at court', theirId: c.person?.id, cast: { personId: c.person?.id }, meter: -15 }); }
        } },
      { label: 'Ignore it', resolve: (c) => { startStruggle(c.world, 'plot', { strength: plotStrength(c.person), theirName: 'someone at court', theirId: c.person?.id, cast: { personId: c.person?.id }, meter: -10 }); } },
    ],
    fallback: 0,
  },
  {
    id: 'str:plot:down', title: 'Doors that should be locked', category: 'Intrigue', trigger: 'home', weight: 0, stage: true, urgent: true,
    setup: () => true,
    text: () => 'The guard on the Highroy\'s stair was changed without an order. A key is missing from the Steward\'s ring. The plot is closer than anyone thought.',
    options: [
      { label: 'Double the guard', hint: '−400 othes', available: need(400), resolve: (c) => { c.fx.othes(-400); pushStruggle(c.world, strug(c)?.id, 15, 'The guard was doubled'); } },
      { label: 'Sweep the court', check: { who: (c) => seat(c, 'spymaster'), stats: ['intrigue', 'perception'], dc: 12 },
        resolve: (c, ok) => { pushStruggle(c.world, strug(c)?.id, ok ? 25 : -5, ok ? 'A sweep turned up their go-between' : 'The sweep found nothing'); if (!ok) c.fx.respect(-1); } },
      { label: 'Wait and watch', resolve: (c) => { pushStruggle(c.world, strug(c)?.id, -5); } },
    ],
    fallback: 2,
  },
  {
    id: 'str:plot:up', title: 'A name in the ledger', category: 'Intrigue', trigger: 'home', weight: 0, stage: true,
    setup: () => true,
    text: (c) => `A ship's ledger seized in the port has a payment in it, and a name: ${strug(c)?.theirs.personId ? full(at(c, strug(c)!.theirs.personId!)) : 'someone close'}. It is not proof, but it is close.`,
    options: [
      { label: 'Press on', resolve: (c) => { const s = strug(c); if (s) { s.theirs.known = true; s.theirs.name = full(at(c, s.theirs.personId ?? '')); } pushStruggle(c.world, s?.id, 15, 'The name is ours'); } },
      { label: 'Strike now', hint: 'end it, before you are sure',
        resolve: (c) => { const s = strug(c); const p = at(c, s?.theirs.personId ?? ''); if (p) { c.fx.mood(p, -15).dread(2).honour(-1).thread(p, 'grudge', 'Seized on a ledger line', highroy(c)?.id); } endStruggle(c.world, s?.id, true, 'Ended early, on a ledger line.'); } },
    ],
    fallback: 0,
  },
  {
    id: 'str:plot:won', title: 'The plotter unmasked', category: 'Intrigue', trigger: 'home', weight: 0, stage: true, urgent: true,
    setup: () => true,
    text: (c) => { const p = at(c, strug(c)?.theirs.personId ?? ''); return `${p ? full(p) : 'The plotter'} stands before the court with the evidence laid out. Everyone is watching to see what the Highroy does.`; },
    options: [
      { label: 'Exile them', hint: 'to a rival house, who will take them',
        resolve: (c) => { const s = strug(c); const p = at(c, s?.theirs.personId ?? ''); if (p) { const to = c.rng.pick(rivals(c)); p.houseId = to; delete p.seat; p.role = 'Courtier'; c.fx.dread(1).say(`${nm(p)} goes to House ${c.world.houses[to]?.name}`); addThread(c.world, p.id, 'grudge', 'Exiled by their own house', highroy(c)?.id); learn(c.world, to, p.id, 30); } endStruggle(c.world, s?.id, true, 'The plotter was exiled.'); } },
      { label: 'Execute them', resolve: (c) => { const s = strug(c); const p = at(c, s?.theirs.personId ?? ''); if (p) { kill(c.world, p, c.world.date, 'executed for treason'); c.fx.dread(4).honour(-2); } endStruggle(c.world, s?.id, true, 'The plotter was executed.'); } },
      { label: 'Pardon them, publicly', hint: 'a gamble on gratitude',
        resolve: (c) => { const s = strug(c); const p = at(c, s?.theirs.personId ?? ''); if (p) { c.fx.honour(2).respect(-1); p.hidden.loyalty += p.hidden.temperament >= 11 ? 4 : 1; const h = highroy(c); if (h) shiftOpinion(c.world, p.id, h.id, 25, 'pardoned for treason'); c.fx.thread(p, 'debt', 'Owes the Highroy their life', h?.id); } endStruggle(c.world, s?.id, true, 'The plotter was pardoned.'); } },
    ],
    fallback: 0,
  },
  {
    id: 'str:plot:lost', title: 'The knife in the dark', category: 'Intrigue', trigger: 'home', weight: 0, stage: true, urgent: true, life: 4,
    setup: () => true,
    text: (c) => `They came for the Highroy tonight. ${seat(c, 'champion') ? `${nm(seat(c, 'champion'))} is between you and the door` : 'The guard is thin'}, and there is steel in the corridor.`,
    options: [
      { label: 'Trust the Champion', check: { who: (c) => seat(c, 'champion') ?? highroy(c), stats: ['duelling', 'reflexes'], dc: 0, vs: (c) => at(c, strug(c)?.theirs.personId ?? ''), vsStats: ['duelling', 'stealth'] },
        resolve: (c, ok) => {
          const s = strug(c); const p = at(c, s?.theirs.personId ?? '');
          if (ok) { c.fx.say('The assassins are cut down'); if (p) { c.fx.dread(2); kill(c.world, p, c.world.date, 'killed in the attempt on the Highroy'); } endStruggle(c.world, s?.id, true, 'The attempt failed, bloodily.'); }
          else { c.fx.wound(highroy(c)).respect(-4).say('The Highroy is wounded; the plotter is gone'); if (p) { const to = c.rng.pick(rivals(c)); p.houseId = to; delete p.seat; learn(c.world, to, p.id, 30); } endStruggle(c.world, s?.id, false, 'The Highroy was wounded and the plotter fled.'); }
        } },
      { label: 'Flee the citadel', resolve: (c) => { c.fx.respect(-5).say('The Highroy lives; the house is shamed'); const s = strug(c); const p = at(c, s?.theirs.personId ?? ''); if (p) { const to = c.rng.pick(rivals(c)); p.houseId = to; delete p.seat; } endStruggle(c.world, s?.id, false, 'The Highroy fled; the plotter escaped.'); } },
    ],
    fallback: 0,
  },
];

function plotStrength(p?: Character): number {
  return p ? (p.stats.intrigue + p.stats.deception + p.hidden.ambition) / 3 + 2 : 12;
}

// ---------------------------------------------------------------- a ring in the port

const ring: EventDef[] = [
  {
    id: 'str:ring:open', title: 'Our harbourmaster is on the take', category: 'Economy', trigger: 'home', weight: 0, stage: true,
    setup: (c) => !(c.world.story?.struggles ?? []).some((x) => !x.ended && x.kind === 'ring'),
    text: () => 'The port\'s books are too clean and its harbourmaster too rich. A ring runs goods through our docks under our seal, and our cut of the customs is going somewhere else.',
    options: [
      { label: 'Set the Steward on it', resolve: (c) => { const s = naturalFor(c.world, 'ring'); startStruggle(c.world, 'ring', { strength: 12 + c.rng.int(0, 4), theirName: 'the ring', ours: s ? [s.id] : [] }); } },
      { label: 'Set the Spymaster on it', resolve: (c) => { const s = seat(c, 'spymaster'); startStruggle(c.world, 'ring', { strength: 12 + c.rng.int(0, 4), theirName: 'the ring', ours: s ? [s.id] : [] }); } },
      { label: 'Take a cut and look away', hint: '+300 othes now', resolve: (c) => { c.fx.othes(300).honour(-2); startStruggle(c.world, 'ring', { strength: 14, theirName: 'the ring', meter: -20 }); } },
    ],
    fallback: 0,
  },
  {
    id: 'str:ring:down', title: 'The ring grows bold', category: 'Economy', trigger: 'home', weight: 0, stage: true,
    setup: () => true,
    text: () => 'A Numarade inspector has asked, politely, why so much Navisium leaves our port with no record of arriving. The ring is getting careless, and we will be blamed.',
    options: [
      { label: 'Pay the inspector to forget', hint: '−500 othes', available: need(500), resolve: (c) => { c.fx.othes(-500); pushStruggle(c.world, strug(c)?.id, 10); } },
      { label: 'Tell him everything', resolve: (c) => { shiftFavour(c.world, c.house, 2); pushStruggle(c.world, strug(c)?.id, 20, 'The Numarade lent its inspectors'); c.fx.respect(-1); } },
      { label: 'Stall him', resolve: (c) => { shiftFavour(c.world, c.house, -2); pushStruggle(c.world, strug(c)?.id, -5); } },
    ],
    fallback: 2,
  },
  {
    id: 'str:ring:up', title: 'A ringleader turns', category: 'Economy', trigger: 'home', weight: 0, stage: true,
    setup: () => true,
    text: () => 'One of the ring\'s pilots has been caught with a hold full of untaxed Navisium. He will give us the rest, if we let him walk.',
    options: [
      { label: 'Let him walk', resolve: (c) => { pushStruggle(c.world, strug(c)?.id, 25, 'A pilot turned on the ring'); c.fx.honour(-1); } },
      { label: 'Hang him as a lesson', resolve: (c) => { c.fx.dread(2); pushStruggle(c.world, strug(c)?.id, 8); } },
    ],
    fallback: 0,
  },
  {
    id: 'str:ring:won', title: 'The ring is broken', category: 'Economy', trigger: 'home', weight: 0, stage: true,
    setup: () => true,
    text: () => 'The ring\'s warehouses are ours: crates of untaxed goods, a ledger of every bribe, and a harbourmaster begging for his life.',
    options: [
      { label: 'Keep the haul', hint: '+1,200 othes', resolve: (c) => { c.fx.othes(1200).dread(1); endStruggle(c.world, strug(c)?.id, true, 'Broken; the house kept the haul.'); } },
      { label: 'Hand it to the Numarade', resolve: (c) => { shiftFavour(c.world, c.house, 4); c.fx.honour(2).othes(300); endStruggle(c.world, strug(c)?.id, true, 'Broken, and handed to the Numarade.'); } },
    ],
    fallback: 1,
  },
  {
    id: 'str:ring:lost', title: 'The Numarade finds it first', category: 'Economy', trigger: 'home', weight: 0, stage: true, urgent: true,
    setup: () => true,
    text: () => 'Numarade inspectors have seized our docks. The ring is in their hands, and so is our name.',
    options: [
      { label: 'Pay the fine', hint: '−1,500 othes', resolve: (c) => { c.fx.othes(-Math.min(1500, othes(c))); shiftFavour(c.world, c.house, -3); endStruggle(c.world, strug(c)?.id, false, 'Fined by the Numarade.'); } },
      { label: 'Deny everything', resolve: (c) => { shiftFavour(c.world, c.house, -6); c.fx.respect(-3); endStruggle(c.world, strug(c)?.id, false, 'Censured by the Numarade.'); } },
    ],
    fallback: 0,
  },
];

// ---------------------------------------------------------------- the Caige's pull, as a struggle

const madness: EventDef[] = [
  { id: 'str:madness:open', title: 'Sleeping with the Caige', category: 'Resonance', trigger: 'home', weight: 0, stage: true, setup: () => false, text: () => '', options: [{ label: '—', resolve: () => {} }], fallback: 0 },
  {
    id: 'str:madness:down', title: 'They do not know your face', category: 'Resonance', trigger: 'home', weight: 0, stage: true, urgent: true,
    setup: (c) => !!c.person?.alive,
    text: (c) => `${full(c.person)} looked straight at you this morning and did not know who you were. The Caige hummed the whole time.`,
    options: [
      { label: 'Keep them from the field', hint: 'no missions until it is over', resolve: (c) => { c.person?.flags.push({ id: 'rested', since: c.world.date, until: addCycles(c.world.date, CYCLES_PER_PHASE * 3) }); pushStruggle(c.world, strug(c)?.id, 12, 'Kept close to home'); } },
      { label: 'Take the Caige away', resolve: (c) => { unbond(c); endStruggle(c.world, strug(c)?.id, false, 'The Caige was taken away.'); } },
      { label: 'Let them fight on', resolve: (c) => { c.fx.stat(c.person, 'caigeSync', 1); pushStruggle(c.world, strug(c)?.id, -6); } },
    ],
    fallback: 0,
  },
  {
    id: 'str:madness:up', title: 'A quiet night', category: 'Resonance', trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!c.person?.alive,
    text: (c) => `${full(c.person)} slept a whole night through, the Caige across the room. In the morning they laughed at something. People stopped to listen.`,
    options: [{ label: 'Good.', resolve: (c) => { c.fx.mood(c.person, 5); pushStruggle(c.world, strug(c)?.id, 10); } }],
    fallback: 0,
  },
  {
    id: 'str:madness:won', title: 'Master of the Caige', category: 'Resonance', trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!c.person?.alive,
    text: (c) => `${full(c.person)} walked into the vault and came out with the Caige quiet in their hand. Whatever pulled at them has been answered.`,
    options: [{ label: 'Honour them', resolve: (c) => { c.fx.stat(c.person, 'caigeSync', 2).stat(c.person, 'resonanceControl', 2).mood(c.person, 10).respect(1); c.fx.thread(c.person, 'omen', 'Mastered their Caige'); endStruggle(c.world, strug(c)?.id, true, 'They mastered it.'); } }],
    fallback: 0,
  },
  {
    id: 'str:madness:lost', title: 'The Caige has them', category: 'Resonance', trigger: 'home', weight: 0, stage: true, urgent: true,
    setup: (c) => !!c.person?.alive,
    text: (c) => `${full(c.person)} is gone from behind their own eyes. They answer to the Caige now. They are still the deadliest blade in the house.`,
    options: [
      { label: 'Unbond them by force', hint: 'it will cost them', resolve: (c) => { unbond(c); c.fx.wound(c.person); endStruggle(c.world, strug(c)?.id, false, 'Unbonded by force.'); } },
      { label: 'Keep them as they are', hint: 'a weapon, and a danger', resolve: (c) => { const p = c.person; if (p) { p.hidden.drift += 4; p.hidden.loyalty = Math.max(1, p.hidden.loyalty - 3); c.fx.stat(p, 'caigeSync', 3).stat(p, 'valor', 2); c.fx.thread(p, 'omen', 'Caige-mad'); } endStruggle(c.world, strug(c)?.id, false, 'The Caige has them.'); } },
    ],
    fallback: 0,
  },
];

// ---------------------------------------------------------------- a feud between families

const feud: EventDef[] = [
  {
    id: 'str:feud:open', title: 'Two families at odds', category: 'Family', trigger: 'home', weight: 0, stage: true,
    setup: (c) => {
      if ((c.world.story?.struggles ?? []).some((x) => !x.ended && x.kind === 'feud')) return false;
      const people = athome(c).filter((x) => x.seat !== 'highroy' && x.familyId);
      for (let i = 0; i < 30; i++) {
        const a = c.rng.pick(people); const b = c.rng.pick(people);
        if (!a || !b || a.familyId === b.familyId) continue;
        if (barsOf(c.world, a.id, b.id).dislike >= 25 || barsOf(c.world, b.id, a.id).dislike >= 25 || i > 24) return choose(c, { personId: a.id, secondId: b.id });
      }
      return false;
    },
    text: (c) => `The ${c.person?.name.family ?? 'one'} and ${c.second?.name.family ?? 'other'} families are not speaking. It started with ${nm(c.person)} and ${nm(c.second)}; now cousins cross the street to avoid each other and someone's hound was found dead.`,
    options: [
      { label: 'Set the Speaker to mend it', resolve: (c) => { const s = naturalFor(c.world, 'feud'); startStruggle(c.world, 'feud', { strength: feudStrength(c), theirName: 'old blood', cast: { personId: c.person?.id, secondId: c.second?.id }, ours: s ? [s.id] : [] }); } },
      { label: 'Mend it yourself', resolve: (c) => { const h = highroy(c); startStruggle(c.world, 'feud', { strength: feudStrength(c), theirName: 'old blood', cast: { personId: c.person?.id, secondId: c.second?.id }, ours: h ? [h.id] : [], meter: 10 }); } },
      { label: 'Let them settle it', resolve: (c) => { startStruggle(c.world, 'feud', { strength: feudStrength(c) + 2, theirName: 'old blood', cast: { personId: c.person?.id, secondId: c.second?.id }, meter: -10 }); } },
    ],
    fallback: 0,
  },
  {
    id: 'str:feud:down', title: 'Blood in the street', category: 'Family', trigger: 'home', weight: 0, stage: true, urgent: true,
    setup: (c) => !!c.person?.alive && !!c.second?.alive,
    text: (c) => `A ${c.person?.name.family ?? ''} cousin was knifed outside a ${c.second?.name.family ?? ''} house. He lives. The families are arming.`,
    options: [
      { label: 'Send the knights between them', resolve: (c) => { c.fx.dread(1); pushStruggle(c.world, strug(c)?.id, 12, 'The knights kept the peace'); } },
      { label: 'Punish the knife', resolve: (c) => { c.fx.mood(c.second, -8); pushStruggle(c.world, strug(c)?.id, 4); } },
      { label: 'Stay out of it', resolve: (c) => { pushStruggle(c.world, strug(c)?.id, -10); } },
    ],
    fallback: 2,
  },
  {
    id: 'str:feud:up', title: 'A shared table', category: 'Family', trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!c.person?.alive && !!c.second?.alive,
    text: (c) => `${nm(c.person)} and ${nm(c.second)} were seen at the same table at a wedding, and neither left.`,
    options: [{ label: 'Encourage it', resolve: (c) => { if (c.person && c.second) shiftBoth(c.world, c.person.id, c.second.id, 10, 'a shared table'); pushStruggle(c.world, strug(c)?.id, 10); } }],
    fallback: 0,
  },
  {
    id: 'str:feud:won', title: 'The feud is ended', category: 'Family', trigger: 'home', weight: 0, stage: true,
    setup: () => true,
    text: (c) => `The ${c.person?.name.family ?? ''} and ${c.second?.name.family ?? ''} heads have clasped hands before the court.`,
    options: [{ label: 'Witness it', resolve: (c) => { if (c.person && c.second) { shiftBoth(c.world, c.person.id, c.second.id, 30, 'the feud ended'); setBond(c.world, c.person.id, c.second.id, 'friend', 'friend', 'the feud ended'); } c.fx.respect(1); endStruggle(c.world, strug(c)?.id, true, 'Reconciled.'); } }],
    fallback: 0,
  },
  {
    id: 'str:feud:lost', title: 'Blood is drawn', category: 'Family', trigger: 'home', weight: 0, stage: true, urgent: true,
    setup: () => true,
    text: (c) => `${nm(c.person)} and ${nm(c.second)} met with blades in the square. The families watched.`,
    options: [
      { label: 'Let it be the end', resolve: (c) => {
        const [a, b] = c.rng.chance(0.5) ? [c.person, c.second] : [c.second, c.person];
        c.fx.wound(b).say(`${nm(a)} stands over ${nm(b)}`);
        if (a && b) { setBond(c.world, a.id, b.id, 'feud', 'feud', 'blood drawn in the square'); addThread(c.world, b.id, 'grudge', `Beaten by ${nm(a)} in the square`, a.id); }
        endStruggle(c.world, strug(c)?.id, false, 'Blood was drawn; the feud is for life.');
      } },
    ],
    fallback: 0,
  },
];

function feudStrength(c: Ctx): number {
  if (!c.person || !c.second) return 12;
  return 10 + (barsOf(c.world, c.person.id, c.second.id).dislike + barsOf(c.world, c.second.id, c.person.id).dislike) / 15;
}

// ---------------------------------------------------------------- follow-ups to older events

const followUps: EventDef[] = [
  {
    id: 'blackmail2', title: 'The writer again', category: 'Intrigue', trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!c.person?.alive,
    text: (c) => `Another note about ${full(c.person)}. The price has doubled, and this one names a date.`,
    options: [
      { label: 'Pay again', hint: '−600 othes', available: need(600), resolve: (c) => { c.fx.othes(-600); data(c).paid = Number(data(c).paid ?? 1) + 1; }, then: (c) => (Number(data(c).paid) < 4 ? { next: 'blackmail2', after: days(40, 70)(c) } : null), ending: 'Paid, and paid.' },
      { label: 'Hunt the writer', check: { who: (c) => seat(c, 'spymaster'), stats: ['intrigue', 'perception'], dc: 11 },
        resolve: (c, ok) => { if (ok) c.fx.dread(2).say('Found, and silenced'); else c.fx.respect(-4).mood(c.person, -8).thread(c.person, 'secret', 'Their secret is out'); } },
      { label: 'Let them talk', resolve: (c) => { c.fx.respect(-4).mood(c.person, -8).thread(c.person, 'secret', 'Their secret is out'); } },
    ],
    fallback: 2,
  },
  {
    id: 'defector2', title: 'They want him back', category: 'Intrigue', trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!c.other,
    text: (c) => `House ${c.world.houses[c.other!]?.name} has sent an envoy for the defector. Our Spymaster thinks he may have been sent to us on purpose.`,
    options: [
      { label: 'Test him', hint: 'our Spymaster against theirs',
        check: { who: (c) => seat(c, 'spymaster'), stats: ['insight', 'intrigue'], dc: 0, vs: (c) => (c.other ? seatHolder(c.world, c.other, 'spymaster') : undefined), vsStats: ['deception', 'intrigue'] },
        resolve: (c, ok) => { if (ok) c.fx.learnHouse(c.other, 20).say('A plant: we feed him lies now'); else c.fx.learnHouse(c.other, -5).say('He was theirs all along, and he is gone'); } },
      { label: 'Hand him back', resolve: (c) => { c.fx.regard(c.other, 6).honour(1); } },
      { label: 'Refuse', resolve: (c) => { c.fx.regard(c.other, -8).dread(1); } },
    ],
    fallback: 2,
  },
  {
    id: 'dream2', title: 'It followed them back', category: 'Resonance', trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!c.person?.alive,
    text: (c) => `${full(c.person)} answers to a name that is not theirs, now and then. The voice from the dream has learned to speak through them.`,
    options: [
      { label: 'Ask it what it wants', check: { who: who.person, stats: ['willpower', 'resonanceControl'], dc: 12 },
        resolve: (c, ok) => { if (ok) { resonate(c, c.person, 60); c.fx.thread(c.person, 'omen', 'Carries a voice that is not theirs'); } else { if (c.person) c.person.hidden.drift += 2; c.fx.mood(c.person, -6); } },
        then: (c, ok) => (ok && c.person && hasFlag(c.person, 'caigeBonded') ? { next: 'pull1', after: days(30, 60)(c) } : null) },
      { label: 'Send them to the Elder', resolve: (c) => { c.fx.stat(c.person, 'resonanceControl', 1).mood(c.person, 2); } },
    ],
    fallback: 1,
  },
  {
    id: 'godglass2', title: 'Godglass, again', category: 'Resonance', trigger: 'home', weight: 0, stage: true, urgent: true,
    setup: (c) => !!c.person?.alive,
    text: (c) => `${full(c.person)} collapsed in the yard, glass-eyed and shaking. The knights carried them in. The Physician says it is now or never.`,
    options: [
      { label: 'Treat them properly', hint: '−500 othes', available: need(500), check: { who: who.person, stats: ['constitution', 'willpower'], dc: 10 },
        resolve: (c, ok) => { c.fx.othes(-500); if (c.person) c.person.flags = c.person.flags.filter((f) => f.id !== 'godglass'); if (!ok) c.fx.stat(c.person, 'constitution', -1).say('They live, diminished'); } },
      { label: 'Strip their spurs', resolve: (c) => { c.fx.mood(c.person, -15).honour(1).thread(c.person, 'grudge', 'Stripped of their spurs over godglass', highroy(c)?.id); } },
      { label: 'Let them sweat it out', check: { who: who.person, stats: ['constitution'], dc: 12 },
        resolve: (c, ok) => { if (!ok && c.person && c.rng.chance(0.25)) { kill(c.world, c.person, c.world.date, 'godglass'); c.fx.say(`${nm(c.person)} did not wake`); } else c.fx.wound(c.person); } },
    ],
    fallback: 0,
  },
  {
    id: 'blades2', title: 'The rematch nobody allowed', category: 'Family', trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!c.person?.alive && !!c.second?.alive && !isAway(c.world, c.person.id) && !isAway(c.world, c.second.id),
    text: (c) => `${full(c.second)} has not forgotten the dawn. They have been training at night, and today they called ${nm(c.person)} out in front of the knights.`,
    options: [
      { label: 'Let them fight', hint: 'the two of them, nothing else',
        check: { who: (c) => c.second, stats: ['duelling', 'reflexes'], dc: 0, vs: (c) => c.person, vsStats: ['duelling', 'reflexes'] },
        resolve: (c, ok) => {
          const [w, l] = ok ? [c.second, c.person] : [c.person, c.second];
          c.fx.wound(l).say(`${nm(w)} wins`).mood(w, 4);
          if (w && l) { shiftOpinion(c.world, l.id, w.id, -15, 'lost the rematch'); for (const t of openThreads(c.world, w.id, 'grudge')) if (t.about === l.id) closeThread(c.world, t.id); }
          if (ok) c.fx.say('The score is settled');
        } },
      { label: 'Forbid it, with a warning', resolve: (c) => { c.fx.mood(c.second, -6).dread(1); } },
    ],
    fallback: 1,
  },
  {
    id: 'caigeLoyalty2', title: 'A promise remembered', category: 'Court', trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!c.person?.alive && !hasFlag(c.person, 'caigeBonded'),
    text: (c) => `${full(c.person)} reminds the court, politely and in front of everyone, that the Highroy promised them a Caige.`,
    options: [
      { label: 'Keep the promise', available: (c) => (Object.values(c.world.armoury).some((g) => g.houseId === c.house && !g.bondedTo) ? null : 'No unbonded Caige'),
        resolve: (c) => { const cg = Object.values(c.world.armoury).find((g) => g.houseId === c.house && !g.bondedTo); if (cg && c.person) { cg.bondedTo = c.person.id; c.person.flags.push({ id: 'caigeBonded', since: c.world.date, detail: `"${cg.name}"` }); c.fx.mood(c.person, 12).honour(1).say(`${nm(c.person)} bonds with ${cg.name}`); } } },
      { label: 'Not yet', resolve: (c) => { c.fx.mood(c.person, -10).honour(-1).thread(c.person, 'grudge', 'Promised a Caige and never given one', highroy(c)?.id); } },
    ],
    fallback: 1,
  },
  {
    id: 'till2', title: 'Deeper in the till', category: 'Court', trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!c.person?.alive && c.person.houseId === c.house,
    text: (c) => `The gap in the ledgers is three times the size it was. ${full(c.person)} has a new ship's berth and nobody knows who paid for it.`,
    options: [
      { label: 'Have the Steward dig', check: { who: (c) => seat(c, 'steward'), stats: ['stewardship', 'insight'], dc: 0, vs: who.person, vsStats: ['deception', 'stewardship'] },
        resolve: (c, ok) => { if (ok) c.fx.othes(900).mood(c.person, -10).dread(1); else c.fx.othes(-300).say('The trail went cold again'); } },
      { label: 'Take it from their family', resolve: (c) => { c.fx.othes(600).honour(-1).mood(c.person, -12).thread(c.person, 'grudge', 'Their family was made to pay', highroy(c)?.id); } },
    ],
    fallback: 0,
  },
];

addEvents([...hum, ...pull, ...plot, ...ring, ...madness, ...feud, ...followUps]);
