// Smuggling, with a reason behind every run. People smuggle for what they want: the hungry for power
// run Caiges, to carry one nobody granted them; the greedy run whatever pays (people for the deep mines,
// prisoners, untaxed Navisium, relics, plain contraband). Runs cross the lanes like any cargo, and the
// customs at the far end, or the Numarade's inspectors at the Exchange, may catch them.
//
// When it is one of ours, the Spymaster may hear of it first, and the Highroy decides: stop it, take a
// cut and look away, or expose them.
import { Rng } from './rng';
import { record } from './economy';
import { logRecord } from './records';
import { shiftRelation } from './relations';
import { competence } from './reports';
import { shiftOpinion } from './relationships';
import { shiftMood } from './mood';
import { displayName } from './names';
import { ageOf } from './characters';
import { SPECIES } from '../data/species';
import { shiftFavour } from './houses';
import { addCycles, type GameDate } from './time';
import type { Character, World } from './types';
import type { Convoy } from './lanes';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const H = (w: World, id: string) => `House ${w.houses[id]?.name ?? id}`;

export type SmuggleKind = 'caige' | 'slaves' | 'prisoners' | 'navisium' | 'relics' | 'contraband';
export const SMUGGLE_LABEL: Record<SmuggleKind, string> = {
  caige: 'a Caige', slaves: 'people bound for the deep mines', prisoners: 'prisoners sold on', navisium: 'untaxed Navisium', relics: 'relics and valuables', contraband: 'contraband',
};
export interface SmuggleRun { by: string; goods: SmuggleKind; why: string; cut?: string; noticed?: boolean }
export interface SmuggleNote { id: string; convoyId: string; by: string; goods: SmuggleKind; why: string; until: GameDate }

/** Why this person would smuggle, and what, or nothing. */
function motive(world: World, rng: Rng, c: Character): { goods: SmuggleKind; why: string; p: number } | undefined {
  const want = world.ambitions?.of[c.id];
  const powerHungry = c.hidden.ambition >= 14 && (want?.kind === 'seat' || want?.kind === 'glory' || c.flags.some((f) => f.id === 'caigeBonded') === false && c.resonance);
  const greedy = c.hidden.greed >= 13;
  if (!powerHungry && !greedy) return undefined;
  // A Caige is rare even on the black market: only the hungriest try, and only once.
  if (powerHungry && c.resonance && c.hidden.ambition >= 16 && !c.flags.some((f) => f.id === 'caigeBonded' || f.id === 'triedCaige') && rng.chance(0.25)) {
    return { goods: 'caige', why: 'wants power the house has not given them: a Caige of their own', p: 0.004 * (c.hidden.ambition - 14) };
  }
  if (!greedy) return undefined;
  const goods = rng.weighted([['slaves', 1 + (c.hidden.greed - 13) * 0.3], ['prisoners', 1], ['navisium', 2], ['relics', 1.5], ['contraband', 2.5]] as const);
  const why = rng.pick(['want money, and more of it than the house pays', 'have debts nobody knows about', 'want a fortune of their own before they are old', 'think the house owes them']);
  return { goods, why, p: 0.006 * (c.hidden.greed - 12) };
}

const VALUE: Record<SmuggleKind, [number, number]> = { caige: [12000, 18000], slaves: [4000, 9000], prisoners: [2500, 6000], navisium: [3000, 7000], relics: [3000, 10000], contraband: [1500, 5000] };

/** Each Orbit: some people start a run. */
export function startRuns(world: World, rng: Rng, launch: (c: Omit<Convoy, 'id' | 'lane' | 'left' | 'arrives' | 'value' | 'escort'> & { value?: number }) => Convoy | undefined): void {
  const P = world.playerHouseId;
  const running = new Set(Object.values(world.lanes.convoys).filter((c) => c.smuggle).map((c) => c.smuggle!.by));
  for (const c of Object.values(world.characters)) {
    if (!c.alive || c.tier !== 'full' || !world.houses[c.houseId] || c.seat === 'highroy' || running.has(c.id)) continue;
    if (ageOf(c, world.date) < SPECIES[c.species].adulthood || c.flags.some((f) => f.id === 'disgraced' || f.id === 'captive')) continue;
    const m = motive(world, rng, c);
    // A house that wants wealth turns a blind eye to its own people's runs.
    const lean = world.realm?.aims[c.houseId]?.kind === 'wealth' ? 1.6 : 1;
    if (!m || !rng.chance(clamp(m.p * lean, 0, 0.05))) continue;
    const [lo, hi] = VALUE[m.goods];
    const value = rng.int(lo, hi);
    const cap = world.houses[c.houseId]!.capitalPlanetId;
    const from = m.goods === 'caige' || m.goods === 'relics' ? 'reach' : rng.pick(['exchange', 'reach']);
    const to = from === 'reach' && !['torvann-ashfall', 'shaaliin-lyreth'].includes(cap) ? 'exchange' : cap;
    const cv = launch({ owner: c.houseId, kind: 'smuggle', good: m.goods === 'navisium' ? 'navisium' : 'components', qty: m.goods === 'navisium' ? Math.round(value / 40) : 1, value, from, to, crew: rng.int(4, 12), contraband: true, smuggle: { by: c.id, goods: m.goods, why: m.why } });
    if (!cv) continue;
    if (m.goods === 'caige') c.flags.push({ id: 'triedCaige', since: world.date });
    // The Spymaster's people may hear of it before it lands.
    if (c.houseId === P && rng.chance(0.3 + competence(world, 'spymaster') * 0.03)) {
      cv.smuggle!.noticed = true;
      (world.lanes.smuggleNotes ??= []).push({ id: `sm${world.nextId++}`, convoyId: cv.id, by: c.id, goods: m.goods, why: m.why, until: cv.arrives });
      logRecord(world, { kind: 'intrigue', type: 'intrigue', severity: 2, seat: 'spymaster', houseIds: [P], text: `${displayName(c.name)} is running ${SMUGGLE_LABEL[m.goods]} on the lanes. They ${m.why}.`, who: [{ id: c.id, part: 'smuggling' }], effects: [`Worth about ${fmt(value)} othes`] });
    }
  }
}

/** Customs or the Numarade's inspectors catch a run: true if caught. */
export function inspect(world: World, rng: Rng, c: Convoy, customsOf: (h: string) => string): boolean {
  const dest = world.planets[c.to]?.houseId;
  let p = c.from === 'exchange' || c.to === 'exchange' ? 0.12 : 0;
  if (dest) {
    const cu = customsOf(dest);
    const own = dest === c.owner;
    p = Math.max(p, cu === 'strict' ? (own ? 0.5 : 0.7) : cu === 'fair' ? (own ? 0.25 : 0.35) : 0.05);
  }
  return rng.chance(p);
}

/** How a run ended, and what follows for the smuggler and their house. */
export function runDone(world: World, rng: Rng, c: Convoy, fate: 'arrived' | 'seized' | 'taken' | 'lost', by?: string): void {
  const s = c.smuggle;
  if (!s) return;
  const P = world.playerHouseId;
  const who = world.characters[s.by];
  world.lanes.smuggleNotes = (world.lanes.smuggleNotes ?? []).filter((n) => n.convoyId !== c.id);
  if (!who?.alive) return;
  const house = c.owner;
  const name = displayName(who.name);
  if (fate === 'arrived') {
    shiftMood(who, 8);
    if (s.goods === 'caige') {
      const id = `cg${world.nextId++}`;
      world.armoury[id] = { id, name: `${rng.pick(['Grey', 'Night', 'Salt', 'Black', 'Quiet'])} ${rng.pick(['Debt', 'Lantern', 'Oath', 'Thorn', 'Hymn'])}`, type: rng.pick(['magnetic', 'gravitic', 'kinetic'] as never[]), band: rng.pick(['frostpoint', 'bluewake'] as never[]), houseId: house, found: world.date, foundAt: { planetId: c.from, sectorId: c.from }, bondedTo: who.id, stability: 55 } as never;
      who.flags.push({ id: 'caigeBonded', since: world.date, detail: 'a smuggled Caige' });
      who.stats.caigeSync = clamp(who.stats.caigeSync + 2, 1, 20);
      if (house === P) logRecord(world, { kind: 'intrigue', type: 'intrigue', severity: 2, seat: 'spymaster', houseIds: [P], text: `${name} carries a Caige now, and not one the house gave them. It came in from the Reach.`, who: [{ id: who.id, part: 'smuggled a Caige' }] });
      else world.houses[house]!.standing.dread = clamp(world.houses[house]!.standing.dread + 1, 0, 100);
    } else {
      if (s.cut) {
        const cut = Math.round(c.value * 0.25);
        record(world, s.cut, { resource: 'othes', amount: cut, label: `A share of ${name}'s run`, kind: 'court' });
      } else if (house !== P) record(world, house, { resource: 'othes', amount: Math.round(c.value * 0.2), label: 'Money with no clear source', kind: 'court' });
    }
    return;
  }
  if (fate !== 'seized') return;
  // Caught.
  who.flags.push({ id: 'disgraced', since: world.date, until: addCycles(world.date, 800), detail: `caught running ${SMUGGLE_LABEL[s.goods]}` });
  shiftMood(who, -15);
  const st = world.houses[house]!.standing;
  st.honour = clamp(st.honour - (s.cut ? 4 : 2), 0, 100);
  shiftFavour(world, house, s.cut ? -8 : -5);
  if (by && by !== house && world.houses[by]) shiftRelation(world, by, house, -6);
  const catcher = by && world.houses[by] ? (by === P ? 'our customs' : `${H(world, by)}'s customs`) : 'the Numarade\'s inspectors';
  if (house === P) logRecord(world, { kind: 'intrigue', type: 'intrigue', severity: 2, seat: 'spymaster', houseIds: [P, ...(by && world.houses[by] ? [by] : [])], text: `${catcher[0]!.toUpperCase() + catcher.slice(1)} caught ${name} running ${SMUGGLE_LABEL[s.goods]}. The house's name is in it now.`, who: [{ id: who.id, part: 'caught' }], effects: [`Honour −${s.cut ? 4 : 2}`, 'The Numarade\'s favour falls'] });
  else if (by === P) logRecord(world, { kind: 'world', type: 'economy', severity: 1, seat: 'steward', houseIds: [P, house], text: `Our customs caught ${name} of ${H(world, house)} running ${SMUGGLE_LABEL[s.goods]}. They ${s.why}.`, who: [{ id: who.id, part: 'caught' }] });
  else if (rng.chance(0.4)) logRecord(world, { kind: 'world', type: 'intrigue', severity: 1, seat: 'heralds', houseIds: [house], text: `${name} of ${H(world, house)} was caught running ${SMUGGLE_LABEL[s.goods]}. A scandal for their house.` });
}

// ---------------------------------------------------------------- the Highroy's hand

export type SmuggleAnswer = 'stop' | 'cut' | 'expose';

export function answerSmuggler(input: World, noteId: string, answer: SmuggleAnswer): World {
  const w = structuredClone(input);
  const P = w.playerHouseId;
  const n = (w.lanes.smuggleNotes ?? []).find((x) => x.id === noteId);
  if (!n) return w;
  w.lanes.smuggleNotes = w.lanes.smuggleNotes!.filter((x) => x !== n);
  const c = w.lanes.convoys[n.convoyId];
  const who = w.characters[n.by];
  const lord = w.houses[P]!.rulerId;
  if (!c || !who) return w;
  const name = displayName(who.name);
  if (answer === 'stop') {
    delete w.lanes.convoys[c.id];
    if (lord) shiftOpinion(w, who.id, lord, -12, 'stopped their run');
    shiftMood(who, -10);
    logRecord(w, { kind: 'council', type: 'decision', severity: 1, houseIds: [P], text: `We stopped ${name}'s run before it landed. They will not thank us.`, who: [{ id: who.id, part: 'stopped' }] });
  } else if (answer === 'cut') {
    c.smuggle!.cut = P;
    if (lord) shiftOpinion(w, who.id, lord, 6, 'looked the other way, for a share');
    logRecord(w, { kind: 'council', type: 'decision', severity: 1, houseIds: [P], text: `We looked the other way on ${name}'s run, for a quarter of it. If it comes out, it comes out on us too.`, who: [{ id: who.id, part: 'smuggling' }] });
  } else {
    delete w.lanes.convoys[c.id];
    who.flags.push({ id: 'disgraced', since: w.date, until: addCycles(w.date, 800), detail: `exposed running ${SMUGGLE_LABEL[n.goods]}` });
    shiftMood(who, -20);
    if (lord) shiftOpinion(w, who.id, lord, -25, 'exposed them');
    for (const [o, t] of Object.entries(w.ties?.[who.id] ?? {})) if ((t.like ?? 0) >= 55 && lord) shiftOpinion(w, o, lord, -6, `exposed ${who.name.given}`);
    w.houses[P]!.standing.honour = clamp(w.houses[P]!.standing.honour + 1, 0, 100);
    shiftFavour(w, P, 3);
    logRecord(w, { kind: 'council', type: 'decision', severity: 2, houseIds: [P], text: `We exposed ${name}'s run to the Numarade. The house keeps its name; ${who.name.given} does not.`, who: [{ id: who.id, part: 'exposed' }], effects: ['Honour +1', 'The Numarade\'s favour rises'] });
  }
  return w;
}

/** A smuggled Caige among our people: take it into the armoury, or let them keep it. */
export function smuggledCaiges(world: World): { caigeId: string; holder: string }[] {
  const P = world.playerHouseId;
  return Object.values(world.armoury ?? {}).filter((c) => c.houseId === P && c.bondedTo && world.characters[c.bondedTo]?.flags.some((f) => f.id === 'caigeBonded' && f.detail === 'a smuggled Caige') && !c.pledgedTo && !(c as { allowed?: boolean }).allowed).map((c) => ({ caigeId: c.id, holder: c.bondedTo! }));
}

export function answerSmuggledCaige(input: World, caigeId: string, keep: boolean): World {
  const w = structuredClone(input);
  const cg = w.armoury[caigeId];
  if (!cg?.bondedTo) return w;
  const who = w.characters[cg.bondedTo]!;
  const lord = w.houses[w.playerHouseId]!.rulerId;
  if (keep) {
    (cg as { allowed?: boolean }).allowed = true;
    if (lord) shiftOpinion(w, who.id, lord, 10, 'let them keep their Caige');
    logRecord(w, { kind: 'council', type: 'decision', severity: 1, houseIds: [w.playerHouseId], text: `${who.name.given} may keep the Caige they brought in. Some at court will call it a reward for smuggling.` });
  } else {
    delete cg.bondedTo;
    who.flags = who.flags.filter((f) => f.id !== 'caigeBonded');
    if (lord) shiftOpinion(w, who.id, lord, -20, 'took their Caige');
    shiftMood(who, -15);
    logRecord(w, { kind: 'council', type: 'decision', severity: 1, houseIds: [w.playerHouseId], text: `We took the smuggled Caige from ${who.name.given}. It goes into the armoury, for the Highroy to grant.` });
  }
  return w;
}

export function notesFor(world: World): SmuggleNote[] { return world.lanes?.smuggleNotes ?? []; }
