// War comes to the Highroy: being attacked, choosing terms, the Numarade's ceasefire, and the people the
// ranks give names to (the soldier who carried a knight out; the survivor who comes back for one).
import { addEvents, type Ctx, type EventDef } from './events';
import { closeThread } from './storystate';
import { econ } from './economy';
import { houseName, regardOf, liveHouses } from './archon';
import { nm, full, seat, toBattle, fought } from './arckit';
import {
  applyTerms, defyCeasefire, endWar, GOAL_LABEL, hunterOf, sideOf, warsOf, type War, type WarGoal,
} from './war';

const T = 'War';
const H = (c: Ctx, id?: string) => `House ${houseName(c.world, id ?? '')}`;
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

/** The war against the house this event is about. */
const warWith = (c: Ctx): War | undefined => warsOf(c.world, c.house).find((x) => x.attacker === c.other || x.defender === c.other || x.attackers.includes(c.other ?? '') || x.defenders.includes(c.other ?? ''));
/** A war we won and are choosing terms for. */
const won = (c: Ctx): War | undefined => (c.world.war?.wars ?? []).find((x) => x.asking && x.status === 'ended');

const GOALS: WarGoal[] = ['tribute', 'reparations', 'humble', 'relic', 'hostage', 'world', 'vassal'];
const GOAL_HINT: Record<WarGoal, string> = {
  tribute: 'coin every year for five', reparations: 'one great payment', humble: 'standing for us, shame for them', relic: 'a Caige for our vault',
  hostage: 'one of their blood at our court', world: 'a world of theirs becomes ours', vassal: 'they swear to us: tribute, and their vote',
};
function termAvail(g: WarGoal) {
  return (c: Ctx): string | null => {
    const war = won(c);
    if (!war) return 'No war to settle.';
    const big = war.rung === 'war';
    const decisive = Math.abs(war.score) >= 80 || war.fronts.some((f) => f.kind === 'siege' && f.winner === sideOf(war, c.house));
    if (!big && !['tribute', 'reparations', 'humble'].includes(g)) return 'Border clashes win only coin and standing.';
    if ((g === 'world' || g === 'vassal') && !decisive) return 'Only a decisive victory takes worlds or fealty.';
    return null;
  };
}

const defs: EventDef[] = [
  {
    id: 'war:attacked', title: 'They come against us', category: T, trigger: 'home', weight: 0, stage: true, urgent: true,
    setup: (c) => !!warWith(c),
    text: (c) => { const war = warWith(c)!; return `${H(c, war.attacker)} has ${war.rung === 'war' ? 'declared war on us' : 'begun clashing with our forces on the border'}. Their cause: ${war.cause.replace(/\.$/, '')}. What they want: ${GOAL_LABEL[war.goal].toLowerCase()}.`; },
    options: [
      { label: 'Stand and fight', hint: 'our forces take the field', resolve: (c) => c.fx.say('The house goes to war') },
      {
        label: 'Call on our friends', hint: 'Speaker', available: (c) => (seat(c, 'envoy') ? null : 'We have no Speaker of the Council.'), check: { who: (c) => seat(c, 'envoy'), stats: ['diplomacy', 'eloquence'], dc: 12 },
        resolve: (c, ok) => {
          const war = warWith(c)!;
          const friends = liveHouses(c.world).filter((h) => h.id !== c.house && !sideOf(war, h.id) && regardOf(c.world, h.id, c.house) >= (ok ? 25 : 45)).sort((a, b) => regardOf(c.world, b.id, c.house) - regardOf(c.world, a.id, c.house)).slice(0, ok ? 2 : 1);
          for (const h of friends) war.defenders.push(h.id);
          c.fx.say(friends.length ? `${friends.map((h) => `House ${h.name}`).join(' and ')} come${friends.length === 1 ? 's' : ''} in on our side` : 'No one comes');
        },
      },
      {
        label: 'Buy them off', hint: '8,000 othes', available: (c) => (econ(c.world, c.house).stock.othes < 8000 ? 'Needs 8,000 othes.' : null),
        resolve: (c) => { const war = warWith(c)!; c.fx.othes(-8000).respect(-3); endWar(c.world, c.rng, war, 'none', `House ${houseName(c.world, c.house)} paid to end it before it began.`); },
      },
      { label: 'Yield to them now', hint: 'they get what they came for', resolve: (c) => { const war = warWith(c)!; endWar(c.world, c.rng, war, 'attackers', `House ${houseName(c.world, c.house)} yielded without a fight.`); c.fx.respect(-6); } },
    ],
    fallback: 0,
  },
  {
    id: 'war:terms', title: 'Terms', category: T, trigger: 'home', weight: 0, stage: true, urgent: true,
    setup: (c) => !!won(c),
    text: (c) => { const war = won(c)!; const loser = war.result!.winner === 'attackers' ? war.defender : war.attacker; return `${war.name.charAt(0).toUpperCase()}${war.name.slice(1)} is won. ${H(c, loser)} sends envoys to hear what we will take. ${war.result!.text}`; },
    options: GOALS.map((g) => ({ label: GOAL_LABEL[g], hint: GOAL_HINT[g], available: termAvail(g), resolve: (c: Ctx) => { const war = won(c); if (war) { applyTerms(c.world, c.rng, war, g); c.fx.say(`We take ${GOAL_LABEL[g].toLowerCase()}`); } } })),
    fallback: 1,
  },
  {
    id: 'war:ceasefire', title: 'The Numarade orders a ceasefire', category: T, trigger: 'home', weight: 0, stage: true, urgent: true,
    setup: (c) => !!warWith(c)?.ceasefire,
    text: (c) => `The Numarade has voted to stop the war with ${H(c, c.other)}. Arms are to be laid down within the Orbit, and the war will end where it stands. Every seat will be watching what we do.`,
    options: [
      { label: 'Lay down arms', resolve: (c) => c.fx.honour(2).say('We will keep the ceasefire') },
      { label: 'Defy the Numarade', hint: 'every seat against us; censure', resolve: (c) => { const war = warWith(c); if (war) defyCeasefire(c.world, war); c.fx.dread(4).honour(-4); } },
    ],
    fallback: 0,
  },
  {
    id: 'war:ranks', title: 'From the ranks', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!c.person?.alive,
    text: (c) => `${full(c.person)} is a soldier nobody at court had heard of until the battle.${c.second ? ` ${nm(c.second)} is alive because of them.` : ' They held when the line broke.'} The house is talking about them.`,
    options: [
      { label: 'Take them into the household', resolve: (c) => { c.person!.role = 'Man-at-arms'; c.fx.mood(c.person, 10).mood(c.second, 3); } },
      {
        label: 'Knight them', hint: 'the Grand Master will grumble', available: (c) => (econ(c.world, c.house).stock.othes < 300 ? 'Needs 300 othes.' : null),
        resolve: (c) => { const p = c.person!; p.role = 'Knight'; if (!p.flags.some((f) => f.id === 'knighted')) p.flags.push({ id: 'knighted', since: c.world.date }); c.fx.othes(-300).mood(p, 18).thread(p, 'vow', 'Knighted from the ranks after the battle'); c.fx.mood(seat(c, 'grandMaster'), -4); },
      },
      { label: 'A purse and our thanks', resolve: (c) => c.fx.othes(-200).mood(c.person, 5) },
    ],
    fallback: 2,
  },
  {
    id: 'war:revenge', title: 'Someone asking questions', arc: 'The survivor', category: T, trigger: 'home', weight: 0, stage: true, urgent: true,
    setup: (c) => !!c.person?.alive && !!hunterOf(c.world, c.person.id),
    text: (c) => { const n = hunterOf(c.world, c.person!.id)!; return `A stranger has been asking after ${full(c.person)}, where they sleep and when they ride out. Our people found the name: ${n.name}, of ${H(c, n.houseId)}, who ${n.why} in ${n.year}. They have had years to get better at this.`; },
    options: [
      {
        label: 'Let them face each other', hint: '⚔ a duel', resolve: (c) => {
          const n = hunterOf(c.world, c.person!.id)!;
          const years = c.world.date.year - n.year;
          toBattle(c, { title: `${n.name.split(',')[0]} comes for ${nm(c.person)}`, theatre: 'surface', where: 'a courtyard at dusk', ours: [c.person!], foes: [{ key: n.id, name: n.name.split(',')[0], power: n.power + years * 0.8, champion: true }], foeName: n.name.split(',')[0]!, foeCommander: { name: n.name.split(',')[0], skill: 10 }, mass: 2, foeMass: 2, foeHouse: n.houseId });
        },
        then: () => ({ next: 'war:revenge2', after: 1 }),
      },
      {
        label: 'Set a trap and take them', hint: 'Spymaster', check: { who: (c) => seat(c, 'spymaster'), stats: ['intrigue', 'perception'], dc: 13 },
        resolve: (c, ok) => { const n = hunterOf(c.world, c.person!.id)!; if (ok) { c.fx.say(`${n.name.split(',')[0]} is taken alive`).dread(1); closeOmen(c); } else c.fx.say('They slip the trap and strike').wound(c.person); },
        ending: 'Settled by the Spymaster.',
      },
      { label: 'Pay them to go', hint: '1,500 othes', available: (c) => (econ(c.world, c.house).stock.othes < 1500 ? 'Needs 1,500 othes.' : null), resolve: (c) => { c.fx.othes(-1500).mood(c.person, -4).say('The money is taken; the look is not forgotten'); closeOmen(c); }, ending: 'Paid off.' },
    ],
    fallback: 1,
  },
  {
    id: 'war:revenge2', title: 'The survivor', category: T, trigger: 'home', weight: 0, stage: true,
    setup: (c) => !!fought(c),
    text: (c) => { const f = fought(c)!; const n = c.person ? hunterOf(c.world, c.person.id) : undefined; return f.won ? `${nm(c.person)} stands over ${n?.name.split(',')[0] ?? 'them'}. It is over, the way these things end.` : f.fell.length ? `${n?.name.split(',')[0] ?? 'The survivor'} had their revenge. ${nm(c.person)} is dead.` : `${nm(c.person)} lost, and lives; ${n?.name.split(',')[0] ?? 'the survivor'} walked away satisfied, for now.`; },
    options: [{ label: 'So be it', resolve: (c) => closeOmen(c) }],
    fallback: 0,
  },
];

function closeOmen(c: Ctx): void {
  const n = c.person ? hunterOf(c.world, c.person.id) : undefined;
  for (const t of c.world.story?.threads ?? []) if (!t.closed && t.personId === c.person?.id && t.about === n?.id) closeThread(c.world, t.id);
}

addEvents(defs);
void fmt;
