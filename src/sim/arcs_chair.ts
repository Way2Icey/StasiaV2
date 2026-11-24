// The weight of the chair. Crises from every corner of the Archon come to the Exarchon, and almost every
// ruling makes a house an enemy; envy reaches for the people closest to the chair; a regent must hold the
// house; and the decrees an Exarchon can issue, each paid for in political capital.
import type { Rng } from './rng';
import { addEvents, choose, fireStage, type Ctx, type EventDef } from './events';
import { data, need, fmt, seat, best } from './arckit';
import { scaled } from './variants';
import { kill } from './death';
import { addDeed } from './legacy';
import { addThread } from './storystate';
import { houseName, liveHouses, regardOf, shiftRegard, table, viewsOf, tierOf } from './archon';
import { activeWars, endWar } from './war';
import { envyAgainst, envyOf } from './envy';
import {
  appointAdviser, CAPANNA_ROLES, chairLog, chooseRegent, closeToChair, dismissAdviser, ensureChair, isOurChair, payDecree,
  protection, shiftLegitimacy, watchChair, chairYear, seedRng, type DecreeKind,
} from './chair';
import { displayName } from './names';
import { logRecord } from './records';
import { dateParts } from './time';
import type { Character, World } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const str = (c: Ctx, k: string) => String(c.arc?.data?.[k] ?? c.memo?.[k] ?? '');
const H = (c: Ctx, id: string) => `House ${houseName(c.world, id)}`;
const legit = (c: Ctx, by: number, why?: string) => shiftLegitimacy(c.world, by, why);
const P = (c: Ctx) => c.world.playerHouseId;
/** Two houses other than ours, for a quarrel brought to the chair. */
function pair(c: Ctx, greatFirst = false): [string, string] | null {
  const hs = liveHouses(c.world).filter((h) => h.id !== P(c));
  if (hs.length < 2) return null;
  const a = greatFirst ? (c.rng.pick(hs.filter((h) => h.tier === 'great')) ?? c.rng.pick(hs)) : c.rng.pick(hs);
  const b = c.rng.pick(hs.filter((h) => h.id !== a.id));
  return [a.id, b.id];
}

const crises: EventDef[] = [
  {
    id: 'chair:regent', title: 'Who holds the house?', category: 'The Chair', trigger: 'home', weight: 0, stage: true, urgent: true,
    setup: (c) => {
      const ex = ensureChair(c.world).held?.exarchonId;
      const pool = Object.values(c.world.characters).filter((x) => x.alive && x.houseId === P(c) && x.id !== ex && !x.veiled && x.tier === 'full' && (x.role === 'Heir' || x.role === 'Spouse of the Highroy' || !!x.seat || /of the Highroy/.test(x.role)));
      const picks = pool.sort((a, b) => b.stats.leadership + b.stats.stewardship - a.stats.leadership - a.stats.stewardship).slice(0, 3);
      if (!picks.length) return false;
      picks.forEach((p, i) => { data(c)[`r${i}`] = p.id; });
      return true;
    },
    text: () => `The Highroy sits in the Exarchon's chair now, and the chair does not leave time for a house. Someone must hold it in their name: sit the council, judge the petitions, keep the stores, and keep the family from tearing at itself. Whoever it is will hold more power than anyone below the Highroy has held.`,
    options: [0, 1, 2].map((i) => ({
      label: `Regent ${i + 1}`,
      labelFor: (c: Ctx) => { const p = c.world.characters[str(c, `r${i}`)]; return p ? `${displayName(p.name)}, ${p.role.toLowerCase()} (leadership ${p.stats.leadership}, stewardship ${p.stats.stewardship})` : '—'; },
      available: (c: Ctx) => (c.world.characters[str(c, `r${i}`)] ? null : 'No one'),
      resolve: (c: Ctx) => { const id = str(c, `r${i}`); const w2 = chooseRegent(c.world, id); Object.assign(c.world, w2); c.fx.say(`${displayName(c.world.characters[id]!.name)} holds the house`); },
    })),
    fallback: 0,
  },
  {
    id: 'chair:famine', title: 'Famine in a Minor House', category: 'The Chair', trigger: 'home', weight: 0, stage: true, urgent: true, life: 80,
    setup: (c) => { const m = liveHouses(c.world).filter((h) => h.tier === 'minor' && h.id !== P(c)); const g = liveHouses(c.world).filter((h) => h.tier === 'great' && h.id !== P(c)); if (!m.length || g.length < 2) return false; data(c).a = c.rng.pick(m).id; const gs = c.rng.shuffle(g); data(c).g1 = gs[0]!.id; data(c).g2 = gs[1]!.id; data(c).amt = scaled(c, 2500); return true; },
    text: (c) => `${H(c, str(c, 'a'))} is starving: blight on its farm worlds, and the Exchange will not sell it grain on credit. Its envoy is on her knees before the chair. ${H(c, str(c, 'g1'))} and ${H(c, str(c, 'g2'))} have full granaries, and do not mean to empty them.`,
    options: [
      { label: 'Order the Great Houses to send grain', hint: 'two Great Houses will not forget it', resolve: (c) => { shiftRegard(c.world, str(c, 'a'), P(c), 15); shiftRegard(c.world, str(c, 'g1'), P(c), -10); shiftRegard(c.world, str(c, 'g2'), P(c), -10); legit(c, 2, `Fed ${H(c, str(c, 'a'))} from the Great Houses' stores`); } },
      { label: 'Feed them from our own stores', labelFor: (c) => `Feed them ourselves (${fmt(Number(str(c, 'amt')))})`, available: (c) => need(Number(str(c, 'amt')))(c), resolve: (c) => { c.fx.othes(-Number(str(c, 'amt'))); shiftRegard(c.world, str(c, 'a'), P(c), 22); legit(c, 2, `Fed ${H(c, str(c, 'a'))} from our own stores`); } },
      { label: 'It is not the chair\'s affair', resolve: (c) => { shiftRegard(c.world, str(c, 'a'), P(c), -25); legit(c, -6, `Let ${H(c, str(c, 'a'))} starve`); } },
    ],
    fallback: 2,
  },
  {
    id: 'chair:border', title: 'A border brought to the chair', category: 'The Chair', trigger: 'home', weight: 0, stage: true, urgent: true, life: 80,
    setup: (c) => { const p = pair(c, true); if (!p) return false; data(c).a = p[0]; data(c).b = p[1]; return true; },
    text: (c) => `${H(c, str(c, 'a'))} and ${H(c, str(c, 'b'))} both claim the same mining moon, and their garrisons have started shooting at each other's ships. Both have come to the chair for a ruling, and both expect to win it.`,
    options: [
      { label: 'Rule for the first', labelFor: (c) => `Rule for ${H(c, str(c, 'a'))}`, resolve: (c) => { shiftRegard(c.world, str(c, 'a'), P(c), 12); shiftRegard(c.world, str(c, 'b'), P(c), -22); legit(c, 0, 'Ruled on a disputed moon'); } },
      { label: 'Rule for the second', labelFor: (c) => `Rule for ${H(c, str(c, 'b'))}`, resolve: (c) => { shiftRegard(c.world, str(c, 'b'), P(c), 12); shiftRegard(c.world, str(c, 'a'), P(c), -22); legit(c, 0, 'Ruled on a disputed moon'); } },
      { label: 'Divide it, and send the Grand Marshal to see it kept', hint: 'neither will be content', resolve: (c) => { shiftRegard(c.world, str(c, 'a'), P(c), -6); shiftRegard(c.world, str(c, 'b'), P(c), -6); legit(c, 2, 'Divided a disputed moon'); } },
      { label: 'Let them settle it themselves', resolve: (c) => { legit(c, -5, 'Let two houses fight over a moon'); } },
    ],
    fallback: 3,
  },
  {
    id: 'chair:scandal', title: 'A scandal in the Capanna', category: 'The Chair', trigger: 'home', weight: 0, stage: true, urgent: true, life: 80,
    setup: (c) => { const cap = c.world.archon?.numarade.capanna ?? []; if (!cap.length) return false; const s = c.rng.pick(cap); data(c).role = s.role; data(c).h = s.houseId; data(c).name = s.name; return true; },
    text: (c) => `${str(c, 'name')}, of ${H(c, str(c, 'h'))}, the Exarchon's ${str(c, 'role').toLowerCase()}, has been taking money to steer the chair's rulings. The proof is on the Spymaster's desk, and copies are on their way to every house in the chamber.`,
    options: [
      { label: 'Dismiss them before the chamber', resolve: (c) => { Object.assign(c.world, dismissAdviser(c.world, str(c, 'role'), (w, a, b, by) => shiftRegard(w, a, b, by))); legit(c, 2, `Dismissed ${str(c, 'name')} for corruption`); } },
      { label: 'Stand by them', hint: 'their house will owe us; the chamber will not forget', resolve: (c) => { shiftRegard(c.world, str(c, 'h'), P(c), 15); legit(c, -9, `Stood by ${str(c, 'name')} through a scandal`); } },
      { label: 'Have the Spymaster bury it', check: { who: (c) => seat(c, 'spymaster'), stats: ['intrigue', 'deception'], dc: 14 },
        resolve: (c, ok) => { if (ok) { shiftRegard(c.world, str(c, 'h'), P(c), 8); c.fx.say('The copies never arrive'); } else { legit(c, -12, 'Caught burying a scandal in the Capanna'); c.fx.honour(-4); } } },
    ],
    fallback: 0,
  },
  {
    id: 'chair:defiance', title: 'A house defies the chair', category: 'The Chair', trigger: 'home', weight: 0, stage: true, urgent: true, life: 80,
    setup: (c) => { const g = liveHouses(c.world).filter((h) => h.id !== P(c)).sort((a, b) => envyOf(c.world, b.id, P(c)) - envyOf(c.world, a.id, P(c)))[0]; if (!g) return false; data(c).a = g.id; return true; },
    text: (c) => `${H(c, str(c, 'a'))} has refused the chair's last ruling outright: its Highroy told the Numarade the Exarchon is "a Highroy like any other, sitting in a borrowed chair". Every house is watching what the chair does next.`,
    options: [
      { label: 'Call the Grand Marshal and the legions', hint: 'a war in the Archon\'s name', resolve: (c) => { shiftRegard(c.world, str(c, 'a'), P(c), -35); legit(c, 2, `Brought ${H(c, str(c, 'a'))} to heel with the legions`); c.fx.dread(5); for (const h of liveHouses(c.world)) if (h.id !== str(c, 'a') && h.id !== P(c) && viewsOf(c.world, h.id).numarade < 0) shiftRegard(c.world, h.id, P(c), -4); } },
      { label: 'Summon them before the Numarade', resolve: (c) => { if (c.world.archon) table(c.world, 'censure', P(c), str(c, 'a')); legit(c, 1, `Summoned ${H(c, str(c, 'a'))} to answer`); } },
      { label: 'Let it pass', resolve: (c) => { legit(c, -10, `Let ${H(c, str(c, 'a'))} defy the chair`); } },
    ],
    fallback: 2,
  },
  {
    id: 'chair:succession', title: 'Two claimants', category: 'The Chair', trigger: 'home', weight: 0, stage: true, urgent: true, life: 80,
    setup: (c) => { const g = liveHouses(c.world).filter((h) => h.id !== P(c) && !c.world.houses[h.id]); if (!g.length) return false; data(c).a = c.rng.pick(g).id; return true; },
    text: (c) => `The Highroy of ${H(c, str(c, 'a'))} is dead, and two of the blood claim the house: the elder, whom the house's council backs, and the younger, whom its knights love. Both have sent word they will accept the chair's judgement. Whichever loses will hate the chair for life.`,
    options: [
      { label: 'Back the elder, and the council', resolve: (c) => { shiftRegard(c.world, str(c, 'a'), P(c), 6); legit(c, 1, `Settled the succession of ${H(c, str(c, 'a'))} for the elder`); } },
      { label: 'Back the younger, and the knights', resolve: (c) => { shiftRegard(c.world, str(c, 'a'), P(c), 10); legit(c, -1, `Settled the succession of ${H(c, str(c, 'a'))} for the younger`); c.fx.say('The elder will remember'); } },
      { label: 'Let the house choose for itself', resolve: (c) => { legit(c, -3); c.fx.say('A year of knives in their hall'); } },
    ],
    fallback: 2,
  },
  {
    id: 'chair:heresy', title: 'The book again', category: 'The Chair', trigger: 'home', weight: 0, stage: true, urgent: true, life: 80,
    setup: (c) => { const hs = liveHouses(c.world).filter((h) => h.id !== P(c) && viewsOf(c.world, h.id).faith > 0); if (!hs.length) return false; data(c).a = c.rng.pick(hs).id; return true; },
    text: (c) => `Copies of On the Weight of Will are passing hand to hand in the lower cities of ${H(c, str(c, 'a'))}, and its war-priests want the chair's leave to burn them, and the people reading them. "Certainty is the absence of weight," the copies say. The priests say that is exactly the problem.`,
    options: [
      { label: 'Give them leave', resolve: (c) => { shiftRegard(c.world, str(c, 'a'), P(c), 12); legit(c, -3, 'Let the book be burned'); } },
      { label: 'Forbid the burning', resolve: (c) => { shiftRegard(c.world, str(c, 'a'), P(c), -15); legit(c, 1, 'Forbade the burning of a book'); } },
      { label: 'Have the chair\'s scholars take the copies', hint: 'the Archive', resolve: (c) => { shiftRegard(c.world, str(c, 'a'), P(c), -5); c.fx.say('The copies go to the Archive'); } },
    ],
    fallback: 1,
  },
  {
    id: 'chair:envoy', title: 'An envoy from beyond', category: 'The Chair', trigger: 'home', weight: 0, stage: true, urgent: true, life: 80,
    setup: (c) => { data(c).who = c.rng.pick(['the corsair lords of the Silent Belt', 'the free stations of the Outer Reach', 'a frontier council of the Drift Margin']); data(c).amt = scaled(c, 1200); return true; },
    text: (c) => `An envoy of ${str(c, 'who')} has come to speak to the Archon, which means to the Exarchon. They offer a treaty: safe lanes for Archon ships, in return for ${fmt(Number(str(c, 'amt')))} othes a year from the Docks, and recognition the Numarade has never given them.`,
    options: [
      { label: 'Sign it in the Archon\'s name', hint: 'safer lanes; some houses call it surrender', resolve: (c) => { legit(c, 1, `Signed a treaty with ${str(c, 'who')}`); for (const h of liveHouses(c.world)) if (h.id !== P(c) && h.personality.aggression > 0.6) shiftRegard(c.world, h.id, P(c), -5); } },
      { label: 'Refuse them', resolve: (c) => { legit(c, 1); c.fx.say('The envoy leaves. The lanes will be what they were'); } },
    ],
    fallback: 1,
  },
  {
    id: 'chair:marshal', title: 'The Grand Marshal wants a war', category: 'The Chair', trigger: 'home', weight: 0, stage: true, urgent: true, life: 80,
    setup: (c) => { const hs = liveHouses(c.world).filter((h) => h.id !== P(c)); if (!hs.length) return false; data(c).a = hs.sort((a, b) => regardOf(c.world, P(c), a.id) - regardOf(c.world, P(c), b.id))[0]!.id; return true; },
    text: (c) => `The Grand Marshal has come to the chair with a plan to bring the joined legions against ${H(c, str(c, 'a'))}, "before they grow any bolder." Half the Capanna is for it. The other half has gone very quiet.`,
    options: [
      { label: 'Unleash the legions', resolve: (c) => { shiftRegard(c.world, str(c, 'a'), P(c), -40); legit(c, -4, `Sent the legions against ${H(c, str(c, 'a'))}`); c.fx.dread(6); } },
      { label: 'Restrain the Marshal', resolve: (c) => { legit(c, 1, 'Restrained the Grand Marshal'); } },
    ],
    fallback: 1,
  },
];

// ---------------------------------------------------------------- envy reaches for the people near the chair

const ATTACKS = ['assassin', 'scandal', 'abduction', 'bribe'] as const;
const attack: EventDef = {
  id: 'chair:attack', title: 'Envy reaches for our own', category: 'The Chair', trigger: 'home', weight: 0, stage: true, urgent: true,
  setup: (c) => {
    // The Exarchon is the one they want most: the chair passes only by death, and the lower its legitimacy
    // the more houses decide that is a price worth paying.
    const held = ensureChair(c.world).held;
    const ex = held && isOurChair(c.world) ? c.world.characters[held.exarchonId] : undefined;
    const close = closeToChair(c.world).filter((x) => x.id !== ex?.id && (x.id !== c.world.houses[P(c)]?.rulerId || c.rng.chance(0.3)));
    const atChair = !!ex?.alive && c.rng.chance(clamp(0.15 + (60 - ensureChair(c.world).legitimacy) / 120, 0.15, 0.6));
    if (!close.length && !atChair) return false;
    const t = atChair ? ex! : c.rng.pick(close);
    const kind = c.rng.pick(ATTACKS);
    const from = liveHouses(c.world).filter((h) => h.id !== P(c)).sort((a, b) => envyOf(c.world, b.id, P(c)) - envyOf(c.world, a.id, P(c)))[c.rng.int(0, 2)]?.id ?? '';
    const foiled = c.rng.chance(protection(c.world, t.id));
    data(c).kind = kind; data(c).from = from; data(c).foiled = foiled ? 1 : 0;
    if (!foiled) {
      if (kind === 'assassin') { if (c.rng.chance(0.3)) kill(c.world, t, c.world.date, 'murdered, by a blade no one admits to'); else { t.flags.push({ id: 'wounded', since: c.world.date }); } }
      else if (kind === 'scandal') { t.mood = clamp((t.mood ?? 60) - 15, 0, 100); }
      else if (kind === 'abduction') { t.flags.push({ id: 'missing', since: c.world.date, detail: 'taken' }); }
      else { t.hidden.loyalty = clamp(t.hidden.loyalty - 5, 0, 20); addThread(c.world, t.id, 'secret', `Took money from House ${houseName(c.world, from)}`); }
    }
    return choose(c, { personId: t.id, otherHouseId: from || undefined });
  },
  text: (c) => {
    const n = displayName(c.person!.name);
    const k = str(c, 'kind');
    if (Number(str(c, 'foiled'))) return ({ assassin: `A blade was drawn on ${n} in the corridor outside their rooms. The guard put themselves in the way. The assassin is dead; someone paid them.`, scandal: `A packet of letters, forged in ${n}'s hand, was stopped at the Docks before it could reach the chamber.`, abduction: `Men in no house's colours tried to take ${n} from the lower city. The guard brought them home.`, bribe: `Someone offered ${n} a fortune to tell them what the chair will do next. ${n} told the Spymaster instead.` } as Record<string, string>)[k]!;
    return ({ assassin: c.person!.alive ? `${n} was cut down in the corridor outside their rooms, and lives, barely.` : `${n} is dead: a blade in the corridor outside their rooms. No house admits to it. Every house is suspected.`, scandal: `Letters in ${n}'s hand, forged or not, have been read aloud in the chamber. Nobody believes they are forged.`, abduction: `${n} has been taken from the lower city by men in no house's colours.`, bribe: `${n} has taken someone's money. We know it now; we do not know for how long.` } as Record<string, string>)[k]!;
  },
  options: [
    { label: 'Hunt whoever sent them', hint: 'Spymaster', check: { who: (c) => seat(c, 'spymaster'), stats: ['intrigue', 'perception'], dc: 14 },
      resolve: (c, ok) => { if (ok && c.other) { c.fx.say(`It was ${H(c, c.other)}`).learnHouse(c.other, 20); shiftRegard(c.world, P(c), c.other, -20); legit(c, 2); } else c.fx.say('The trail goes cold in the Docks'); } },
    { label: 'Double the guard on them, and on the Highroy', hint: 'costly, a Phase at a time', resolve: (c) => { const g = ensureChair(c.world).guards; for (const id of [c.person?.id, c.world.houses[P(c)]?.rulerId].filter((x): x is string => !!x && !!c.world.characters[x]?.alive)) g[id] = Math.min(3, (g[id] ?? 0) + 1) as 0 | 1 | 2 | 3; c.fx.say('The guard is doubled'); } },
    { label: 'Show nothing', resolve: (c) => { c.fx.respect(1); } },
  ],
  fallback: 2,
};


// ---------------------------------------------------------------- the only way the chair changes hands

/** The blade comes for the Exarchon: protection turns it aside, or it does not. */
function strike(c: Ctx, sure = 0): void {
  const p = c.person;
  if (!p?.alive) return;
  if (c.rng.chance(protection(c.world, p.id) - sure)) { c.fx.say(`The blade came for ${displayName(p.name)} and did not reach them`); chairLog(c.world, 'An attempt on the Exarchon\'s life, turned aside'); return; }
  if (c.rng.chance(0.6)) kill(c.world, p, c.world.date, `murdered in the Exarchon's chair, by the will of House ${houseName(c.world, str(c, 'a'))} and House ${houseName(c.world, str(c, 'b'))}`);
  else { p.flags.push({ id: 'wounded', since: c.world.date }); legit(c, -3, 'The Exarchon wounded by an assassin'); c.fx.say(`${displayName(p.name)} lives, barely`); }
}

const plot: EventDef = {
  id: 'chair:plot', title: 'A plot against the Exarchon', category: 'The Chair', trigger: 'home', weight: 0, stage: true, urgent: true, life: 60,
  setup: (c) => {
    const held = ensureChair(c.world).held;
    if (!held || !isOurChair(c.world)) return false;
    const ex = c.world.characters[held.exarchonId];
    if (!ex?.alive) return false;
    const foes = liveHouses(c.world).filter((h) => h.id !== P(c)).sort((x, y) => (envyOf(c.world, y.id, P(c)) - regardOf(c.world, y.id, P(c)) / 2) - (envyOf(c.world, x.id, P(c)) - regardOf(c.world, x.id, P(c)) / 2));
    if (foes.length < 2) return false;
    data(c).a = foes[0]!.id; data(c).b = foes[1]!.id;
    return choose(c, { personId: ex.id, otherHouseId: foes[0]!.id });
  },
  text: (c) => `The Spymaster comes at night. ${H(c, str(c, 'a'))} and ${H(c, str(c, 'b'))} have been buying blades, and someone in the palace has been selling them the Exarchon's hours. There is no other way for the chair to change hands, and every house knows it. ${displayName(c.person!.name)} sat in it knowing it too.`,
  options: [
    { label: 'Unravel it before it moves', hint: 'Spymaster', check: { who: (c) => seat(c, 'spymaster'), stats: ['intrigue', 'perception'], dc: 15 },
      resolve: (c, ok) => { if (ok) { shiftRegard(c.world, P(c), str(c, 'a'), -20); shiftRegard(c.world, P(c), str(c, 'b'), -20); legit(c, 3, `Exposed a plot by ${H(c, str(c, 'a'))} and ${H(c, str(c, 'b'))}`); c.fx.say('The blades are found, and the names behind them'); } else { c.fx.say('The Spymaster finds the rooms empty'); strike(c); } } },
    { label: 'Surround the Exarchon with the Spymaster\'s own', hint: 'the dearest guard there is', resolve: (c) => { const p = c.person; if (p) ensureChair(c.world).guards[p.id] = 3; strike(c); } },
    { label: 'Strike first', hint: 'their envoy will not leave the palace', resolve: (c) => { shiftRegard(c.world, str(c, 'a'), P(c), -40); shiftRegard(c.world, str(c, 'b'), P(c), -15); legit(c, -6, `Had the envoy of ${H(c, str(c, 'a'))} killed in the palace`); c.fx.dread(6).say('The plot dies with its envoy. The houses will remember how'); } },
    { label: 'Go on as before', hint: 'the Exarchon will not hide', resolve: (c) => { c.fx.respect(1); strike(c, 0.1); } },
  ],
  fallback: 3,
};

addEvents([...crises, attack, plot]);

const CRISES = crises.filter((d) => d.id !== 'chair:regent').map((d) => d.id);

/** Each turn: the chair won or lost; each Orbit, the crises and the knives; each year, the chair's wear. */
export function advanceChair(w: World, rng: Rng, t: { orbits: number; years: number }): void {
  // The chair passes only by death. When ours is gone, the house remembers how long they held it.
  const held = w.chair?.held;
  if (held && w.characters[held.exarchonId] && !w.characters[held.exarchonId]!.alive) {
    const p = w.characters[held.exarchonId]!;
    const years = dateParts(w.date).year - held.since;
    addDeed(w, p.id, 'statecraft', `Held the Exarchon's chair ${years} year${years === 1 ? '' : 's'}, and gave it up the only way it is given up`, 3);
    logRecord(w, { kind: 'world', type: 'politics', severity: 3, text: `${displayName(p.name)} is dead, after ${years} year${years === 1 ? '' : 's'} in the Exarchon's chair. The Numarade will choose another.`, houseIds: [w.playerHouseId], source: 'the Chair' });
  }
  watchChair(w, (ww) => fireStage(ww, rng, 'chair:regent', {}));
  const ours = isOurChair(w);
  if (t.orbits > 0) {
    if (ours) {
      // Two or three things a Phase would be truthful; a crisis most Orbits is enough to bury a Highroy.
      const n = rng.chance(0.75) ? (rng.chance(0.35) ? 2 : 1) : 0;
      for (let i = 0; i < n; i++) fireStage(w, rng, rng.pick(CRISES), {});
    }
    // Envy reaches for our people: far more often when the chair is ours.
    const e = envyAgainst(w, w.playerHouseId);
    if (rng.chance(Math.min(0.5, (e / 300) * (ours ? 3 : 1)))) fireStage(w, rng, 'chair:attack', {});
    // Plots against the Exarchon: never nothing, and more the lower the chair's legitimacy falls.
    if (ours) {
      const L = ensureChair(w).legitimacy;
      if (rng.chance(clamp((55 - L) / 90 + e / 200, 0.03, 0.45))) fireStage(w, rng, 'chair:plot', {});
    }
  }
  if (t.years > 0) {
    chairYear(w, (a, b, by) => shiftRegard(w, a, b, by));
  }
}

// ---------------------------------------------------------------- decrees and appointments (pure)

/** A name for whoever a house sends to sit on the Capanna. */
function adviserFrom(w: World, houseId: string): { name: string; personId?: string } {
  if (w.houses[houseId]) {
    const pick = Object.values(w.characters).filter((c) => c.alive && c.houseId === houseId && c.seat && c.seat !== 'highroy').sort((x, y) => y.stats.diplomacy + y.stats.law - x.stats.diplomacy - x.stats.law)[0];
    if (pick) return { name: displayName(pick.name), personId: pick.id };
  }
  const h = w.archon?.houses[houseId];
  return { name: `${h?.notables?.[0]?.name ?? `an elder of House ${h?.name ?? houseId}`}` };
}

export function appointToCapanna(input: World, role: string, houseId: string): World {
  return appointAdviser(input, role, houseId, (w, a, b, by) => shiftRegard(w, a, b, by), adviserFrom);
}
export function dismissFromCapanna(input: World, role: string): World {
  return dismissAdviser(input, role, (w, a, b, by) => shiftRegard(w, a, b, by));
}

export function issueDecree(input: World, kind: DecreeKind, a?: string, b?: string): World {
  const w = structuredClone(input);
  if (!isOurChair(w)) throw new Error('The chair is not ours.');
  const n = w.archon!.numarade;
  const name = (id?: string) => `House ${houseName(w, id ?? '')}`;
  switch (kind) {
    case 'peace': {
      const war = activeWars(w).find((x) => x.id === a);
      if (!war) throw new Error('No such war.');
      if (war.attacker === w.playerHouseId || war.defender === w.playerHouseId) throw new Error('Not a war of our own: that is a peace to make, not to decree.');
      payDecree(w, kind);
      endWar(w, seedRng(w, `decree`), war, 'none', 'By decree of the Exarchon.');
      shiftRegard(w, war.attacker, w.playerHouseId, -18); shiftRegard(w, war.defender, w.playerHouseId, 8);
      shiftLegitimacy(w, 3, `Ended ${war.name} by decree`);
      break;
    }
    case 'summon': {
      if (!a) throw new Error('Name a house.');
      payDecree(w, kind);
      table(w, 'censure', w.playerHouseId, a);
      shiftRegard(w, a, w.playerHouseId, -15);
      shiftLegitimacy(w, 1, `Summoned ${name(a)} to answer before the Numarade`);
      break;
    }
    case 'quota': {
      if (!a || !b || a === b) throw new Error('Name a house to take from and a house to give to.');
      payDecree(w, kind);
      shiftRegard(w, a, w.playerHouseId, -18); shiftRegard(w, b, w.playerHouseId, 12);
      shiftLegitimacy(w, -1, `Moved navisium quota from ${name(a)} to ${name(b)}`);
      break;
    }
    case 'pardon': {
      const f = w.archon!.feuds.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
      if (!f) throw new Error('There is no feud between them.');
      payDecree(w, kind);
      w.archon!.feuds = w.archon!.feuds.filter((r) => r !== f);
      shiftRegard(w, f.a, w.playerHouseId, 5); shiftRegard(w, f.b, w.playerHouseId, 5);
      shiftLegitimacy(w, 3, `Ended the feud of ${name(f.a)} and ${name(f.b)} by decree`);
      break;
    }
    case 'levy': {
      payDecree(w, kind);
      const greats = liveHouses(w).filter((h) => h.tier === 'great' && h.id !== w.playerHouseId);
      const amount = 4000 * greats.length;
      w.economy.houses[w.playerHouseId]!.stock.othes += amount;
      for (const g of greats) shiftRegard(w, g.id, w.playerHouseId, -10);
      shiftLegitimacy(w, -3, `Levied ${amount.toLocaleString('en-US')} othes from the Great Houses for the Archon`);
      break;
    }
    case 'strike': {
      const m = n.motions.find((x) => x.id === a && x.status === 'open');
      if (!m) throw new Error('No such motion before the chamber.');
      if (m.kind === 'elect' || m.kind === 'seats') throw new Error('Elections cannot be struck.');
      payDecree(w, kind);
      m.status = 'failed'; m.result = 'Struck from the agenda by the Exarchon.';
      shiftRegard(w, m.by, w.playerHouseId, -15);
      shiftLegitimacy(w, m.kind === 'remove' ? -10 : -4, `Struck "${m.title}" from the agenda`);
      break;
    }
  }
  chairLog(w, `Decree: ${kind}`);
  return w;
}

export { CAPANNA_ROLES };
void best; void addDeed; void tierOf; void ({} as Character);
