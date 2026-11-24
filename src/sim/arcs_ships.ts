// Stories of ships: wrecks of the War for Life and the Silence that can be raised, old ships whose time is
// coming, and a ship's own crew remembering what she has done.
import type { Rng } from './rng';
import { addEvents, choose, fireStage, type Ctx, type EventDef } from './events';
import { data, need, fmt } from './arckit';
import { CAPITAL_CLASSES, retireShip, shipAge, shipLog, shipsOf, type CapitalClass } from './fleet';
import { econ, record } from './economy';
import type { World } from './types';

const str = (c: Ctx, k: string) => String(c.arc?.data?.[k] ?? c.memo?.[k] ?? '');

const WRECKS: { era: string; text: (place: string) => string; cls: CapitalClass }[] = [
  { era: 'the War for Life', cls: 'cruiser', text: (p) => `A survey crew has found a cruiser of the War for Life drifting dark beyond ${p}: her hull is scorched, her guns are spiked, and she has been out there longer than the Silence. Her keel is sound.` },
  { era: 'the Silence', cls: 'destroyer', text: (p) => `A destroyer that went dark in the Silence has drifted back into the lanes near ${p}. Her log is still aboard. Nobody has opened it.` },
  { era: 'the War for Life', cls: 'carrier', text: (p) => `In the debris field off ${p}, a carrier of the War for Life, her hangars full of fighters that never launched. A Shardsaint stands on her bridge.` },
];

function homePlace(w: World): string {
  const h = w.houses[w.playerHouseId];
  return w.planets[h?.capitalPlanetId ?? '']?.name ?? 'the capital';
}

const evs: EventDef[] = [
  {
    id: 'ship:wreck', title: 'A wreck that could fly again', category: 'Fleet', trigger: 'home', weight: 0, stage: true, life: 120,
    setup: (c) => { const i = c.rng.int(0, WRECKS.length - 1); data(c).i = i; data(c).cost = Math.round(CAPITAL_CLASSES[WRECKS[i]!.cls].cost * 0.45); return true; },
    text: (c) => WRECKS[Number(str(c, 'i'))]!.text(homePlace(c.world)),
    options: [
      { label: 'Raise her, and make her ours', labelFor: (c) => `Raise her (${fmt(Number(str(c, 'cost')))} othes, ${Math.round(CAPITAL_CLASSES[WRECKS[Number(str(c, 'i'))]!.cls].components * 0.5)} components)`,
        available: (c) => { const why = need(Number(str(c, 'cost')))(c); if (why) return why; const comp = Math.round(CAPITAL_CLASSES[WRECKS[Number(str(c, 'i'))]!.cls].components * 0.5); return econ(c.world, c.house).stock.components < comp ? `Needs ${comp} components.` : null; },
        resolve: (c) => {
          const wr = WRECKS[Number(str(c, 'i'))]!;
          const d = CAPITAL_CLASSES[wr.cls];
          c.fx.othes(-Number(str(c, 'cost')));
          record(c.world, c.house, { resource: 'components', amount: -Math.round(d.components * 0.5), label: 'Raising a wreck', kind: 'develop' });
          const ours = shipsOf(c.world, c.house)[0];
          const id = `cs${c.world.nextId++}`;
          const name = `${c.rng.pick(['Lazarus', 'Second Wake', 'Returned', 'Old Oath', 'Grave Lantern', 'Revenant', 'Long Silence'])}`;
          c.world.fleet.ships[id] = {
            id, houseId: c.house, name, cls: wr.cls, captainId: null, crew: Math.round(d.crew * 0.5), crewMood: 55, condition: 55,
            sectorId: ours?.sectorId ?? Object.values(c.world.fleet.ships).find((x) => x.houseId === c.house)?.sectorId ?? '', duty: 'harbour', built: c.world.date,
            raised: wr.era, renown: 6, log: [{ year: c.world.date.year, text: `Raised from a wreck of ${wr.era}, and taken into the house` }],
          };
          c.fx.respect(1).say(`The ${name} flies again`);
        } },
      { label: 'Strip her for parts', hint: 'components and salvage', resolve: (c) => { const d = CAPITAL_CLASSES[WRECKS[Number(str(c, 'i'))]!.cls]; record(c.world, c.house, { resource: 'components', amount: Math.round(d.components * 0.35), label: 'Salvage from a wreck', kind: 'develop' }); c.fx.othes(Math.round(d.cost * 0.06)).say('Her guns and plating come home in pieces'); } },
      { label: 'Leave her to the dark', resolve: () => {} },
    ],
    fallback: 2,
  },
  {
    id: 'ship:old', title: 'An old ship', category: 'Fleet', trigger: 'home', weight: 0, stage: true, life: 120,
    setup: (c) => {
      const s = shipsOf(c.world, c.house).filter((x) => !x.ready && shipAge(c.world, x) >= 40).sort((a, b) => shipAge(c.world, b) - shipAge(c.world, a))[0];
      if (!s) return false;
      data(c).ship = s.id;
      return choose(c, { personId: s.captainId ?? undefined });
    },
    text: (c) => { const s = c.world.fleet.ships[str(c, 'ship')]!; return `The ${s.name}${s.epithet ? `, ${s.epithet},` : ''} is ${shipAge(c.world, s)} years old. The yards cannot bring her hull back as it was, and she costs more to keep every year. The Steward has asked, carefully, whether it is time.${s.log?.length ? ` Her record runs to ${s.log.length} entries.` : ''}`; },
    options: [
      { label: 'Lay her up with honour', resolve: (c) => { Object.assign(c.world, retireShip(c.world, str(c, 'ship'), 'honour')); } },
      { label: 'She sails until she cannot', hint: 'her crew will love you for it', resolve: (c) => { const s = c.world.fleet.ships[str(c, 'ship')]; if (s) { s.crewMood = Math.min(100, s.crewMood + 15); shipLog(c.world, s, 'Kept in the line when the Steward wanted her gone', 1); } } },
    ],
    fallback: 1,
  },
];

addEvents(evs);

/** Each year: a wreck now and then; an old ship's time, when it comes. */
export function shipStories(w: World, rng: Rng): void {
  if (rng.chance(0.12)) fireStage(w, rng, 'ship:wreck', {});
  if (rng.chance(0.35)) fireStage(w, rng, 'ship:old', {});
}
