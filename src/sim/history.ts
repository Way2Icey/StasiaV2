// The past, rolled fresh for every seed: two centuries of Exarchons, wars, Crucible champions, Caiges lost,
// feuds and pacts, and the rare house that rose or fell. It ends where the canon starts (the houses, their
// ranks, the Drift Era) and leaves its marks on the present: who resents whom, which old scores living
// people carry, what the annals say, and which lost Caiges might still be found.
import { Rng } from './rng';
import { buildWord } from './names';
import { makeDate } from './time';
import { shiftRelation } from './relations';
import { appointCapanna, liveHouses, personName, threadsFromHistory, regardOf, shiftRegard, riftBetween, type ArchonHouse, type HistoryEntry, type Legend } from './archon';
import { SPECIES } from '../data/species';
import { CULTURES } from '../data/cultures';
import { wildLabel } from './frontier';
import type { World } from './types';

export const HISTORY_YEARS = 200;

const WAR_ADJ = ['Ash', 'Glass', 'Long', 'Silent', 'Salt', 'Iron', 'Grey', 'Third', 'Red', 'Hollow', 'Winter', 'Broken'];
const WAR_NOUN = ['War', 'Quarrel', 'Schism', 'Reckoning', 'Siege', 'Contest'];
const CAIGE_A = ['Ash', 'Last', 'Nine', 'Pale', 'Hollow', 'Bright', 'Grave', 'Still', 'Thorn', 'Ember', 'Lantern', 'Iron'];
const CAIGE_B = ['veil', 'lantern', 'fold', 'oath', 'song', 'wake', 'mourn', 'crown', 'spire', 'hand', 'tide', 'mark'];
const FORMS = ['a greatblade', 'a spear', 'a tower shield', 'twin daggers', 'a war-hammer', 'a staff', 'a chain-whip', 'claws', 'a bow of light', 'a long axe'];
const LOSS = ['when its bearer fell at', 'when the ship carrying it broke apart over', 'stolen from its vault and last traced to', 'buried with its bearer on', 'thrown into the sea of', 'lost in the retreat from'];
const PLAGUES = ['the grey cough', 'the sleeping fever', 'a navisium blight', 'the hollow sickness', 'a wasting rot'];

function warName(rng: Rng, w: World, a: ArchonHouse, b: ArchonHouse): string {
  const wilds = Object.values(w.archon!.frontier);
  const roll = rng.next();
  if (roll < 0.3 && wilds.length) return `the War of ${rng.pick(wilds).name}`;
  if (roll < 0.5) return `the ${rng.pick([a, b]).name} Succession`;
  return `the ${rng.pick(WAR_ADJ)} ${rng.pick(WAR_NOUN)}`;
}

/** Write the two centuries before the game begins. `fresh`: also set the present's relations from it. */
export function writeHistory(w: World, fresh: boolean): void {
  const a = w.archon!;
  const rng = Rng.fromSeed(`${w.seed}/history`);
  const start = w.date.year;
  const first = start - HISTORY_YEARS;
  const H: HistoryEntry[] = [];
  const push = (year: number, kind: HistoryEntry['kind'], text: string, houses: string[]) => H.push({ year, kind, text, houses });
  const houses = liveHouses(w);
  const great = houses.filter((h) => h.tier === 'great');
  const minor = houses.filter((h) => h.tier === 'minor');
  const byId = (id: string) => a.houses[id]!;

  // Before the reckoning: canon, the same in every world.
  push(-3, 'era', 'The War for God, the War for Peace and the War for Life: some fifteen hundred years of war with the Assembly, begun on an Exarchon\'s vision.', []);
  push(-2, 'era', 'The Rend: the war ended in a rupture every living thing felt. Caiges fell silent, billions died, and no treaty was signed.', []);
  push(-1, 'era', 'The Silence: contact between the stars ceased, and peace was kept by fear. The Drift Era began generations later.', []);

  // Exarchons, one after another; the last one alive at the start sits now.
  const exarchons: { name: string; house: string; from: number; to: number; born: number; species: ArchonHouse['species'] }[] = [];
  let y = first;
  const prestigeBonus: Record<string, number> = {};
  const bump = (id: string, by: number) => { prestigeBonus[id] = (prestigeBonus[id] ?? 0) + by; };
  while (y < start) {
    const pool = y + 45 >= start ? great.filter((h) => !h.simulated) : great;
    const h = rng.weighted(pool.map((x) => [x, x.might + rng.next() * 0.4] as const));
    const sp = h.species;
    const ageAt = rng.int(Math.max(40, SPECIES[sp].adulthood + 15), Math.round(SPECIES[sp].lifespan[0] * 0.8));
    const reign = rng.int(12, 40);
    const name = personName(rng, sp, h.families[0] ?? h.name);
    const to = y + reign;
    exarchons.push({ name, house: h.id, from: y, to, born: y - ageAt, species: sp });
    push(y, 'exarchon', `${name} of House ${h.name} was elected Exarchon.`, [h.id]);
    bump(h.id, 2);
    if (to < start) {
      const removed = rng.chance(0.1);
      push(to, 'exarchon', removed ? `The Numarade removed the Exarchon ${name} by a vote of eight seats.` : `The Exarchon ${name} died after ${reign} years in the chair.`, [h.id]);
      if (removed) bump(h.id, -3);
    }
    y = to + (rng.chance(0.2) ? 1 : 0);
  }
  const lastEx = exarchons[exarchons.length - 1]!;
  if (lastEx.to >= start) {
    a.numarade.exarchon = { name: lastEx.name, houseId: lastEx.house, since: lastEx.from, born: lastEx.born, species: lastEx.species };
  }

  // Wars: a house's worst enemies are those it thinks least like.
  const wars: { name: string; a: string; b: string; from: number; to: number; winner: string }[] = [];
  y = first + rng.int(3, 12);
  while (y < start - 2) {
    const x = rng.weighted(houses.map((h) => [h, h.personality.aggression + 0.2] as const));
    const foes = houses.filter((h) => h.id !== x.id);
    const z = rng.weighted(foes.map((h) => [h, Math.max(0.05, 1.2 - (regardOf(w, x.id, h.id) + 100) / 120)] as const));
    const len = rng.int(1, 6);
    const winner = rng.weighted([[x.id, x.might + rng.next()], [z.id, z.might + rng.next() * 0.9]] as const);
    const loser = winner === x.id ? z.id : x.id;
    const name = warName(rng, w, x, z);
    const end = Math.min(start - 1, y + len);
    wars.push({ name, a: x.id, b: z.id, from: y, to: end, winner });
    push(y, 'war', `${name.charAt(0).toUpperCase()}${name.slice(1)}: House ${x.name} against House ${z.name}.`, [x.id, z.id]);
    push(end, 'war', `${name.charAt(0).toUpperCase()}${name.slice(1)} ended with House ${byId(winner).name} the victor${rng.chance(0.4) ? ' and a world-tithe paid by the loser' : ''}.`, [winner, loser]);
    bump(winner, 3); bump(loser, -2);
    // Old wounds: the more recent, the deeper.
    const fade = Math.max(0.15, 1 - (start - end) / 120);
    if (!(w.houses[x.id] && w.houses[z.id])) { shiftRegard(w, loser, winner, -Math.round(30 * fade)); shiftRegard(w, winner, loser, -Math.round(12 * fade)); }
    else if (fresh) { shiftRelation(w, loser, winner, -Math.round(14 * fade)); shiftRelation(w, winner, loser, -Math.round(6 * fade)); }
    y = end + rng.int(8, 22);
  }

  // The Crucible: every year a champion; streaks are what history remembers.
  const titles: Record<string, number> = {};
  let streak = { house: '', n: 0, name: '' };
  for (let yr = first; yr < start; yr++) {
    const h = rng.weighted(houses.map((x) => [x, x.might ** 3 * (x.tier === 'great' ? 1.3 : 1)] as const));
    titles[h.id] = (titles[h.id] ?? 0) + 1;
    if (streak.house === h.id) streak.n++;
    else {
      if (streak.n >= 3) push(yr - 1, 'champion', `${streak.name} of House ${byId(streak.house).name} won the Crucible ${streak.n} years running.`, [streak.house]);
      const sp = h.vassals && rng.chance(0.2) ? rng.pick(h.vassals) : h.species;
      streak = { house: h.id, n: 1, name: personName(rng, sp, rng.pick(h.families.length ? h.families : [h.name])) };
    }
    if (rng.chance(0.06)) push(yr, 'champion', `${personName(rng, h.species, rng.pick(h.families.length ? h.families : [h.name]))} of House ${h.name} won the Crucible in a final still talked about.`, [h.id]);
  }
  for (const [id, n] of Object.entries(titles)) bump(id, Math.min(6, n / 6));

  // Caiges lost to history: legends, and something to look for.
  const legends: Legend[] = [];
  const wilds = Object.values(a.frontier);
  for (let i = 0, n = rng.int(4, 7); i < n; i++) {
    const h = rng.pick(houses);
    const yr = rng.int(first, start - 3);
    const wild = wilds.length && rng.chance(0.7) ? rng.pick(wilds) : undefined;
    const where = wild ? wildLabel(wild) : rng.pick(['the Old Front', 'the Silent Belt', 'the Drift Margin', 'the Ember Verge']);
    const name = `${rng.pick(CAIGE_A)}${rng.pick(CAIGE_B)}`;
    const form = rng.pick(FORMS);
    legends.push({ id: `lg${i}`, name, form, house: h.id, year: yr, where, ...(wild ? { wildId: wild.id } : {}) });
    push(yr, 'caige', `The Caige ${name}, ${form} in the hand, was lost to House ${h.name} ${rng.pick(LOSS)} ${where}.`, [h.id]);
  }
  a.legends = legends;

  // Houses that rose and fell: only in ways that end at the canon's ranks.
  const shifts = rng.int(1, 2);
  let lastShift = first - 20;
  for (let i = 0; i < shifts; i++) {
    const up = rng.pick(great), down = rng.pick(minor);
    const yr = rng.int(first + 20, start - 15);
    push(yr, 'rise', `House ${up.name} was raised a Great House by a vote of the Numarade; House ${down.name} stood down to the Minor.`, [up.id, down.id]);
    if (!(w.houses[up.id] && w.houses[down.id])) shiftRegard(w, down.id, up.id, -15);
    lastShift = Math.max(lastShift, yr);
  }
  a.numarade.lastShift = lastShift;

  // Houses founded and gone: the frontier has been tried before.
  for (let i = 0, n = rng.int(2, 4); i < n && wilds.length; i++) {
    const wild = rng.pick(wilds);
    const from = rng.pick(houses);
    const sp = from.species;
    const fam = rng.pick(CULTURES[sp].familyNames);
    const name = fam.startsWith('the ') ? buildWord(rng, CULTURES[sp].given) : fam;
    const founded = rng.int(first, start - 40);
    const ended = founded + rng.int(8, 60);
    const taker = rng.pick(houses.filter((h) => h.id !== from.id));
    push(founded, 'founding', `${personName(rng, sp, fam)}, once of House ${from.name}, claimed ${wildLabel(wild)} and founded House ${name}.`, [from.id]);
    push(Math.min(ended, start - 2), 'end', rng.chance(0.5) ? `House ${name} ended: its last heir swore fealty to House ${taker.name}, and ${wild.name} was abandoned.` : `House ${name} ended: ${rng.pick(PLAGUES)} took the line, and ${wild.name} was left empty.`, [taker.id]);
  }

  // Plagues and other trials.
  for (let i = 0, n = rng.int(2, 4); i < n; i++) {
    const h = rng.pick(houses);
    push(rng.int(first, start - 2), 'plague', `${rng.pick(PLAGUES).replace(/^./, (x) => x.toUpperCase())} swept the worlds of House ${h.name}.`, [h.id]);
    bump(h.id, -1);
  }

  // Feuds and pacts still open at the start: from wars within living memory and from like minds.
  for (const war of wars.filter((x) => start - x.to <= 30)) {
    if (w.houses[war.a] && w.houses[war.b]) continue;
    if (!riftBetween(a.feuds, war.a, war.b) && rng.chance(0.6)) {
      a.feuds.push({ a: war.a, b: war.b, since: war.to, cause: `${war.name}` });
      push(war.to, 'feud', `The bitterness of ${war.name} hardened into a feud between House ${byId(war.a).name} and House ${byId(war.b).name}.`, [war.a, war.b]);
    }
  }
  const pairs = houses.flatMap((x) => houses.filter((z) => x.id < z.id && !(w.houses[x.id] && w.houses[z.id])).map((z) => [x, z] as const));
  for (const [x, z] of rng.shuffle([...pairs]).slice(0, 40)) {
    if (a.pacts.length >= 4) break;
    if ((regardOf(w, x.id, z.id) + regardOf(w, z.id, x.id)) / 2 > 25 && !riftBetween(a.feuds, x.id, z.id)) {
      const yr = rng.int(first + 50, start - 5);
      a.pacts.push({ a: x.id, b: z.id, since: yr, cause: 'like minds' });
      push(yr, 'pact', `House ${x.name} and House ${z.name} swore a pact.`, [x.id, z.id]);
    }
  }

  for (const [id, by] of Object.entries(prestigeBonus)) { const h = a.houses[id]; if (h) h.prestige = Math.max(5, Math.min(95, h.prestige + by)); }
  if (a.numarade.exarchon) appointCapanna(w, rng);
  H.sort((p, q) => p.year - q.year);
  a.history = H;

  // The annals of the simulated houses remember their own part.
  if (fresh) {
    for (const e of H.filter((x) => x.year > 0)) {
      for (const hid of e.houses.filter((h) => w.houses[h])) {
        (w.annals[hid] ??= []).push({ date: makeDate(e.year, 1, 1), text: e.text, public: true });
      }
    }
    for (const hid of Object.keys(w.annals)) w.annals[hid]!.sort((p, q) => p.date.year - q.date.year);
    threadsFromHistory(w, rng);
  }
}
