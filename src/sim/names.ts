import { CULTURES, OF_STYLE, SERATHI_CALLSIGNS, type SyllableSet } from '../data/cultures';
import type { Rng } from './rng';
import type { Family, PersonName, Sex, SpeciesId } from './types';

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Collapse runs of three identical letters ("Vaaa" → "Vaa"). */
function tidy(word: string): string {
  return word.replace(/(.)\1\1+/gi, '$1$1');
}

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'y']);

function trailingVowels(s: string): number {
  let n = 0;
  for (let i = s.length - 1; i >= 0 && VOWELS.has(s[i]!); i--) n++;
  return n;
}

/** Join two pieces without piling up more than two vowels in a row. */
function join(a: string, b: string): string {
  let piece = b;
  while (piece.length > 1 && VOWELS.has(piece[0]!) && trailingVowels(a) + 1 > 2) piece = piece.slice(1);
  while (piece.length > 1 && VOWELS.has(piece[0]!) && VOWELS.has(piece[1]!) && trailingVowels(a) >= 1) piece = piece.slice(1);
  return a + piece;
}

export function buildWord(rng: Rng, set: SyllableSet): string {
  const start = rng.pick(set.starts).toLowerCase();
  let word = start;
  if (set.mids.length > 0 && rng.chance(set.midChance)) word = join(word, rng.pick(set.mids));
  let end = rng.pick(set.ends).toLowerCase();
  // Avoid echoes like "Vaalaal".
  for (let tries = 0; tries < 4 && end.length > 1 && word.endsWith(end); tries++) end = rng.pick(set.ends).toLowerCase();
  word = join(word, end);
  return capitalize(tidy(word));
}

export interface NameOptions {
  species: SpeciesId;
  family: Family;
  sex: Sex;
  knighted?: boolean;
  /** Torvann scar-name. */
  epithet?: string;
}

/** A new name for someone of this culture and family. */
export function generateName(rng: Rng, opts: NameOptions): PersonName {
  const culture = CULTURES[opts.species];
  const given = buildWord(rng, culture.given);
  const name: PersonName = { given };

  if (OF_STYLE.includes(opts.species) && !opts.family.high) {
    // Torvann holds and Gholari groves: "Garuk of Ashfall Hold".
    name.hold = opts.family.name;
  } else {
    name.family = opts.family.name;
  }

  if (opts.epithet) name.epithet = opts.epithet;

  if (opts.species === 'serathi' && rng.chance(0.7)) {
    name.callsign = rng.pick(SERATHI_CALLSIGNS);
  }

  if (opts.species === 'shaaliin') {
    name.courtName = buildWord(rng, culture.given);
    // True names run longer: three pieces.
    const s = culture.given;
    name.trueName = capitalize(tidy((rng.pick(s.starts) + rng.pick(s.mids) + rng.pick(s.ends)).toLowerCase()));
  }

  if (opts.knighted && culture.knightTitle) {
    name.title = culture.knightTitle[opts.sex];
  }
  return name;
}

/** How the name is shown in lists and reports. */
export function displayName(name: PersonName): string {
  const parts: string[] = [];
  if (name.title) parts.push(name.title);
  parts.push(name.given);
  if (name.family) parts.push(name.family);
  let out = parts.join(' ');
  if (name.hold) out += ` of ${name.hold}`;
  if (name.epithet) out += `, ${name.epithet}`;
  if (name.callsign) out += ` "${name.callsign}"`;
  return out;
}

/** Short form for tight spaces: given + family, no titles or epithets. */
export function shortName(name: PersonName): string {
  return name.family ? `${name.given} ${name.family}` : name.given;
}
