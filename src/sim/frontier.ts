// The frontier: worlds and moons no house holds yet. Rolled fresh for every seed, they are what a new house
// can be founded on. A house needs a world and a capital raised on it, so there can never be more houses
// than there are worlds to hold them.
import { Rng } from './rng';
import { buildWord } from './names';
import type { SyllableSet } from '../data/cultures';

export type Climate = 'ash' | 'ocean' | 'ice' | 'jungle' | 'rock' | 'garden' | 'storm' | 'desert' | 'fungal';
export type Hazard = 'drift' | 'corsairs' | 'warwreck' | 'lurek' | 'quakes' | 'none';

export const CLIMATE_LABEL: Record<Climate, string> = {
  ash: 'Ash world', ocean: 'Ocean world', ice: 'Ice world', jungle: 'Jungle world', rock: 'Barren rock', garden: 'Garden world',
  storm: 'Storm world', desert: 'Desert world', fungal: 'Fungal wetland',
};
export const HAZARD_LABEL: Record<Hazard, string> = {
  drift: 'Drift-touched', corsairs: 'Corsair haunt', warwreck: 'War wreckage from the old war', lurek: 'Lureks sighted', quakes: 'Unstable crust', none: 'Nothing known',
};

export interface Wild {
  id: string;
  name: string;
  kind: 'world' | 'moon';
  /** The world a moon circles, by name. */
  parent?: string;
  region: string;
  climate: Climate;
  /** How many could live there, 0..1. */
  habitable: number;
  /** What it has worth taking. */
  riches: { metals: number; provisions: number; navisium: number };
  hazard: Hazard;
  note: string;
  /** The house that holds it now, and since when. */
  claimedBy?: string;
  claimedYear?: number;
  /** A capital has been raised there. */
  capital?: string;
}

export const REGIONS = ['the Reaches', 'the Shallows', 'the Drift Margin', 'the Old Front', 'the Silent Belt', 'the Ember Verge'];

const WORLD_NAMES: SyllableSet = {
  starts: ['Ka', 'Ve', 'Or', 'Tha', 'Sel', 'Mor', 'Is', 'Dra', 'Ny', 'Cor', 'Ash', 'Bel', 'Quo', 'Rhe', 'Ul', 'Zan', 'Hes', 'Pyr', 'Lio', 'Gal'],
  mids: ['r', 'l', 'th', 'v', 'n', 'sk', 'm'],
  ends: ['os', 'ara', 'ix', 'eon', 'is', 'une', 'ath', 'ora', 'ys', 'el', 'um', 'ae'],
  midChance: 0.45,
};
const GIANTS = ['the Grey Giant', 'the Banded Giant', 'the Red Giant', 'the Hollow Giant', 'the Drowned Giant'];

function climateFor(rng: Rng, region: string): Climate {
  const all: [Climate, number][] = [['ash', 1], ['ocean', 1], ['ice', 1], ['jungle', 1], ['rock', 1.5], ['garden', 0.5], ['storm', 1], ['desert', 1], ['fungal', 0.7]];
  if (region === 'the Ember Verge') all.push(['ash', 2], ['desert', 1]);
  if (region === 'the Shallows') all.push(['ocean', 2], ['fungal', 1]);
  return rng.weighted(all);
}

function hazardFor(rng: Rng, region: string): Hazard {
  const all: [Hazard, number][] = [['none', 3], ['corsairs', 1], ['quakes', 0.8], ['warwreck', 0.8], ['lurek', 0.3], ['drift', 0.4]];
  if (region === 'the Drift Margin') all.push(['drift', 3], ['lurek', 1]);
  if (region === 'the Old Front') all.push(['warwreck', 3]);
  if (region === 'the Silent Belt') all.push(['corsairs', 2]);
  return rng.weighted(all);
}

const HABITABLE: Record<Climate, [number, number]> = {
  garden: [0.75, 1], jungle: [0.45, 0.8], ocean: [0.35, 0.7], fungal: [0.35, 0.65], storm: [0.2, 0.5], desert: [0.2, 0.5],
  ash: [0.1, 0.4], ice: [0.1, 0.35], rock: [0.02, 0.2],
};

function note(w: Wild): string {
  const bits: string[] = [];
  if (w.riches.navisium >= 0.6) bits.push('a navisium seam has been charted');
  if (w.riches.metals >= 0.7) bits.push('rich in metals');
  if (w.riches.provisions >= 0.7) bits.push('could feed a city');
  if (w.hazard === 'drift') bits.push('instruments drift there and crews dream badly');
  if (w.hazard === 'warwreck') bits.push('the hulks of the old war still circle it');
  if (w.hazard === 'corsairs') bits.push('corsairs water there');
  if (w.hazard === 'lurek') bits.push('crews have seen Lureks on the surface');
  if (w.hazard === 'quakes') bits.push('the crust will not keep still');
  if (!bits.length) bits.push('surveyed once, and left alone since');
  return bits.join('; ').replace(/^./, (x) => x.toUpperCase()) + '.';
}

/** Roll the frontier for a seed: a couple of dozen worlds and moons no house holds. */
export function rollFrontier(rng: Rng, count = 26): Record<string, Wild> {
  const out: Record<string, Wild> = {};
  const used = new Set<string>();
  for (let i = 0; i < count; i++) {
    let name = buildWord(rng, WORLD_NAMES);
    for (let t = 0; t < 10 && used.has(name); t++) name = buildWord(rng, WORLD_NAMES);
    used.add(name);
    const region = rng.pick(REGIONS);
    const moon = rng.chance(0.35);
    const climate = climateFor(rng, region);
    const [lo, hi] = HABITABLE[climate];
    const w: Wild = {
      id: `wild-${i}`, name, kind: moon ? 'moon' : 'world', region, climate,
      ...(moon ? { parent: rng.pick(GIANTS) } : {}),
      habitable: Math.round((lo + rng.next() * (hi - lo)) * (moon ? 0.85 : 1) * 100) / 100,
      riches: { metals: Math.round(rng.next() * 100) / 100, provisions: Math.round(rng.next() * 100) / 100, navisium: Math.round(rng.next() ** 2.5 * 100) / 100 },
      hazard: hazardFor(rng, region),
      note: '',
    };
    w.note = note(w);
    out[w.id] = w;
  }
  return out;
}

/** How good a place it is to raise a capital, 0..1. */
export function worthOf(w: Wild): number {
  const hazard = w.hazard === 'none' ? 0 : w.hazard === 'drift' || w.hazard === 'lurek' ? 0.25 : 0.12;
  return Math.max(0, Math.min(1, w.habitable * 0.55 + w.riches.provisions * 0.15 + w.riches.metals * 0.1 + w.riches.navisium * 0.2 - hazard));
}

export const wildLabel = (w: Wild) => `${w.name}${w.kind === 'moon' ? `, a moon of ${w.parent}` : ''}`;
