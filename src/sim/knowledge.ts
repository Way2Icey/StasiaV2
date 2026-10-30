// The knowledge fog: every house sees every person only as deeply as its
// people have learned. Estimates are deterministic for a given state of
// knowledge, and always contain the true value.
import { Rng } from './rng';
import { seatHolder } from './query';
import { FLAGS_BY_ID } from '../data/flags';
import { TRAITS_BY_ID } from '../data/traits';
import {
  ALL_STATS, HIDDEN_STATS,
  type Character, type FlagInstance, type HiddenStatId, type KnowledgeEntry,
  type ResonanceBand, type StatId, type TraitInstance, type World,
} from './types';

/** Depth thresholds. */
export const KNOW = {
  /** Visible stats shown exactly. */
  exact: 85,
  /** Hidden stats shown at all (as ranges). */
  hidden: 70,
  /** Born and learned traits visible. */
  traits: 40,
  /** Resonance band visible. */
  band: 50,
  /** Exact °S visible. */
  degrees: 80,
} as const;

export function baselineDepth(world: World, observer: string, c: Character): number {
  const fam = world.families[c.familyId];
  if (c.houseId === observer) {
    if (fam?.ruling || c.seat) return 90;
    if (c.tier === 'full') return 70;
    return 45;
  }
  if (c.seat || fam?.ruling) return 30;
  if (c.tier === 'full') return 15;
  return 5;
}

/** Fill in any missing knowledge entries with each house's baseline. */
export function ensureKnowledge(world: World): void {
  world.knowledge ??= {};
  for (const houseId of Object.keys(world.houses)) {
    const book = (world.knowledge[houseId] ??= {});
    for (const c of Object.values(world.characters)) {
      if (!book[c.id]) book[c.id] = { depth: baselineDepth(world, houseId, c), updated: world.date, salt: 0 };
    }
  }
}

export function knowledgeOf(world: World, observer: string, characterId: string): KnowledgeEntry {
  return world.knowledge[observer]?.[characterId] ?? { depth: 0, updated: world.date, salt: 0 };
}

/** Raise a house's knowledge of someone. */
export function learn(world: World, observer: string, characterId: string, amount: number): number {
  const book = (world.knowledge[observer] ??= {});
  const entry = book[characterId] ?? { depth: 0, updated: world.date, salt: 0 };
  const before = entry.depth;
  entry.depth = Math.min(100, entry.depth + amount);
  entry.salt += 1;
  entry.updated = world.date;
  book[characterId] = entry;
  return entry.depth - before;
}

/** 0..1: how sharp a house's intelligence is, from its spymaster. */
export function spyQuality(world: World, observer: string): number {
  const spy = seatHolder(world, observer, 'spymaster');
  if (!spy) return 0.3;
  return Math.max(0, Math.min(1, (spy.stats.insight + spy.stats.intrigue) / 40));
}

export function rangeWidth(depth: number, quality: number): number {
  if (depth >= KNOW.exact) return 0;
  return Math.max(0, Math.round(((100 - depth) / 100) * 9 * (1.3 - 0.7 * quality)));
}

export type Range = [number, number];

function estimate(world: World, observer: string, c: Character, key: string, value: number, width: number, min: number): Range {
  if (width <= 0) return [value, value];
  const k = knowledgeOf(world, observer, c.id);
  const r = Rng.fromSeed(`${world.seed}|${observer}|${c.id}|${key}|${k.salt}`);
  const below = r.int(0, width);
  let lo = value - below;
  let hi = value + (width - below);
  if (lo < min) { hi += min - lo; lo = min; }
  if (hi > 20) { lo -= hi - 20; hi = 20; }
  return [Math.max(min, lo), Math.min(20, hi)];
}

export interface ResonanceView {
  band: ResonanceBand;
  degrees?: number;
  type?: string;
}

export interface CharacterView {
  depth: number;
  label: string;
  stats: Record<StatId, Range>;
  hidden: Record<HiddenStatId, Range> | null;
  traits: TraitInstance[];
  hiddenTraits: number;
  flags: FlagInstance[];
  /** null: no resonance; 'unknown': not known. */
  resonance: ResonanceView | null | 'unknown';
}

export function depthLabel(depth: number): string {
  if (depth >= KNOW.exact) return 'Well known';
  if (depth >= 60) return 'Known';
  if (depth >= 35) return 'Partly known';
  if (depth >= 15) return 'Rumours';
  return 'Barely known';
}

export function flagVisible(f: FlagInstance, observer: string): boolean {
  const def = FLAGS_BY_ID[f.id];
  if (!def || def.visibility === 'all') return true;
  return !!f.knownBy?.includes(observer);
}

export function traitVisible(t: TraitInstance, depth: number): boolean {
  return TRAITS_BY_ID[t.id]?.category === 'earned' || depth >= KNOW.traits;
}

/** What `observer` can see of `c`. With `reveal`, everything (developer view). */
export function viewOf(world: World, observer: string, c: Character, reveal = false): CharacterView {
  const depth = reveal ? 100 : knowledgeOf(world, observer, c.id).depth;
  const width = reveal ? 0 : rangeWidth(depth, spyQuality(world, observer));
  const stats = {} as Record<StatId, Range>;
  for (const s of ALL_STATS) stats[s] = estimate(world, observer, c, s, c.stats[s], width, 1);

  let hidden: Record<HiddenStatId, Range> | null = null;
  if (reveal || depth >= KNOW.hidden) {
    hidden = {} as Record<HiddenStatId, Range>;
    const hw = reveal ? 0 : Math.max(2, width + 2);
    for (const s of HIDDEN_STATS) hidden[s] = estimate(world, observer, c, `h:${s}`, c.hidden[s], hw, 0);
  }

  const traits = reveal ? c.traits : c.traits.filter((t) => traitVisible(t, depth));
  const flags = reveal ? c.flags : c.flags.filter((f) => flagVisible(f, observer));

  let resonance: CharacterView['resonance'] = null;
  if (c.resonance) {
    const bonded = c.flags.some((f) => f.id === 'caigeBonded');
    if (reveal || depth >= KNOW.degrees) resonance = { band: c.resonance.band, degrees: c.resonance.degrees, type: c.resonance.type };
    else if (depth >= KNOW.band || bonded) resonance = { band: c.resonance.band };
    else resonance = 'unknown';
  }

  return {
    depth,
    label: reveal ? 'Developer view' : depthLabel(depth),
    stats,
    hidden,
    traits,
    hiddenTraits: c.traits.length - traits.length,
    flags,
    resonance,
  };
}

export function formatRange([lo, hi]: Range): string {
  return lo === hi ? String(lo) : `${lo}–${hi}`;
}

/** Midpoint of a range, for forecasts made with what a house believes. */
export function believed([lo, hi]: Range): number {
  return (lo + hi) / 2;
}
