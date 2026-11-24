// Coming into view: someone of the Household, or out of the Realm's unnamed millions, does something the
// court cannot help but notice. The dockworker who held the docks, the gate man who stopped a blade, the
// clerk who found the error, the sergeant whose soldiers would follow her anywhere. Bring them in, and the
// story follows them from then on.
import { addEvents, type Ctx, type EventDef } from './events';
import { data, need, stranger } from './arckit';
import { bringIntoView, circleOf, CIRCLE_CAP, householdOf } from './circle';
import { addDeed } from './legacy';
import { takeIntoHouse } from './training';
import { displayName } from './names';
import type { Character, StatId } from './types';

const str = (c: Ctx, k: string) => String(c.arc?.data?.[k] ?? c.memo?.[k] ?? '');
const who = (c: Ctx): Character | undefined => c.world.characters[str(c, 'who')];

/** What a person of the Household is best at decides how they come to notice. */
const DEEDS: { stat: StatId; role: string; text: (n: string) => string; deed: string; kind: 'battle' | 'service' | 'discovery' | 'statecraft' }[] = [
  { stat: 'valor', role: 'Man-at-arms', kind: 'battle', deed: 'Held the gate in a riot', text: (n) => `When the crowd came for the lower gate, ${n}, a man-at-arms of the house nobody at court had heard of, held it with six others until the guard came. The barracks are saying the name.` },
  { stat: 'intellect', role: 'Clerk', kind: 'discovery', deed: 'Found the error in the house accounts', text: (n) => `${n}, a junior clerk of the house, found an error in the accounts the Steward's office had missed for two years, and walked it up the stairs herself.` },
  { stat: 'intrigue', role: 'Court helper', kind: 'service', deed: 'Overheard a plot at court', text: (n) => `${n}, one of the court's helpers, came to the Spymaster at midnight with something overheard in a corridor: names, and a date.` },
  { stat: 'stewardship', role: 'Under-steward', kind: 'service', deed: 'Kept the granaries through a hard Orbit', text: (n) => `The granaries of the lower city ran better this Orbit than ever before, and it turns out the reason is ${n}, an under-steward nobody thought to ask about.` },
  { stat: 'leadership', role: 'Sergeant', kind: 'battle', deed: 'Led a company that would follow them anywhere', text: (n) => `${n}, a sergeant of the house, took a company nobody wanted and made it the best in the garrison. The knights have started asking for it by name.` },
  { stat: 'duelling', role: 'Yard fighter', kind: 'battle', deed: 'Beat a knight in the yard', text: (n) => `In the practice yard this morning, ${n}, who sweeps it, borrowed a blade and beat one of our knights three passes in three.` },
];

const REALM: { role: string; deed: string; text: (n: string) => string }[] = [
  { role: 'Dockworker', deed: 'Held the docks when the strike turned violent', text: (n) => `When the strike at the docks turned to fighting, a dockworker named ${n} stood between the crowd and the guard and talked both down. Nobody was killed. Half the city knows the name by now.` },
  { role: 'Gate man', deed: 'Stopped a blade at the gate', text: (n) => `${n}, an entry man at the outer gate, stopped a man with a knife under his coat on the morning the Highroy rode out. He did not raise his voice. He just did not let him through.` },
  { role: 'Ship\'s hand', deed: 'Brought a crippled ship home', text: (n) => `A trader limped into the docking ring with half her crew dead, brought home by ${n}, a ship's hand who had never stood a watch on the bridge.` },
  { role: 'Orphan of the lower city', deed: 'Taught themselves to read the old script', text: (n) => `${n}, an orphan from the lower city, has been sneaking into the archives to copy the old script. They read it better than our scholars.` },
];

const evs: EventDef[] = [
  {
    id: 'cir:household', title: 'One of the household', category: 'Court', trigger: 'home', weight: 1.6,
    setup: (c) => {
      const pool = householdOf(c.world, c.house).filter((x) => x.role !== 'Child');
      if (!pool.length) return false;
      const scored = DEEDS.map((d) => { const best = pool.slice().sort((a, b) => b.stats[d.stat] - a.stats[d.stat])[0]!; return { d, best, score: best.stats[d.stat] + c.rng.next() * 4 }; }).sort((a, b) => b.score - a.score);
      const pick = scored[0]!;
      if (pick.best.stats[pick.d.stat] < 11) return false;
      data(c).who = pick.best.id; data(c).deed = DEEDS.indexOf(pick.d);
      return true;
    },
    text: (c) => { const d = DEEDS[Number(str(c, 'deed'))]!; return d.text(displayName(who(c)!.name)); },
    options: [
      { label: 'Bring them into the court', hint: 'the story will follow them', resolve: (c) => {
        const p = who(c); const d = DEEDS[Number(str(c, 'deed'))]!; if (!p) return;
        bringIntoView(c.world, p, 'quiet'); if (/Noble|Child|Retainer/.test(p.role)) p.role = d.role; addDeed(c.world, p.id, d.kind, d.deed, 2);
        c.fx.mood(p, 15).say(`${displayName(p.name)} comes to court`);
        if (circleOf(c.world, c.house).length > CIRCLE_CAP) c.fx.say('The court is crowded; someone less in the story will fade from it');
      } },
      { label: 'Reward them, and leave them be', hint: '−150 othes', available: need(150), resolve: (c) => { const p = who(c); if (p) addDeed(c.world, p.id, DEEDS[Number(str(c, 'deed'))]!.kind, DEEDS[Number(str(c, 'deed'))]!.deed, 1); c.fx.othes(-150).say('A purse, and thanks'); } },
      { label: 'Note it, and do nothing', resolve: () => {} },
    ],
    fallback: 2,
  },
  {
    id: 'cir:realm', title: 'Out of the crowd', category: 'Court', trigger: 'home', weight: 0.9,
    setup: (c) => { data(c).kind = c.rng.int(0, REALM.length - 1); data(c).name = `${c.rng.pick(['Tamsin', 'Oro', 'Kel', 'Brannoch', 'Ysa', 'Dov', 'Hesk', 'Marrit', 'Juno', 'Calder'])} ${c.rng.pick(['of the Lower Ring', 'Docksworn', 'of Gate Nine', 'Ashby', 'Varl', 'Ketch'])}`; return true; },
    text: (c) => REALM[Number(str(c, 'kind'))]!.text(str(c, 'name')),
    options: [
      { label: 'Bring them into the house', resolve: (c) => {
        const r = REALM[Number(str(c, 'kind'))]!;
        const p = stranger(c);
        const [given, ...rest] = str(c, 'name').split(' ');
        p.name = { ...p.name, given: given!, family: rest.join(' ') || p.name.family };
        takeIntoHouse(c.world, p, r.role);
        addDeed(c.world, p.id, 'service', r.deed, 2);
        c.fx.respect(1).say(`${displayName(p.name)} is taken into the house`);
      } },
      { label: 'A purse and a public thanks', hint: '−100 othes', available: need(100), resolve: (c) => { c.fx.othes(-100).respect(1).unrest(undefined, -2); } },
      { label: 'Nothing', resolve: () => {} },
    ],
    fallback: 2,
  },
];

addEvents(evs);

