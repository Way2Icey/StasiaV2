// Mood: how each named person feels about their house. It decides who will
// go out on a mission and how many the house can have in the field at once.
import { Rng } from './rng';
import { alive } from './query';
import { absoluteCycle, CYCLES_PER_ORBIT } from './time';
import type { Character, World } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const TRAIT_MOOD: Record<string, number> = {
  ambitious: -5, proud: -3, humble: 5, honourBound: 3, paranoid: -4, wrathful: -3, trusting: 4, generous: 2,
};

/** Traits that make someone chafe when kept at home too long. */
const RESTLESS = new Set(['ambitious', 'brave', 'ironBlooded', 'hotBlooded']);

/** Where someone's mood settles when nothing much happens. */
export function moodBaseline(c: Character): number {
  const t = c.traits.reduce((s, x) => s + (TRAIT_MOOD[x.id] ?? 0), 0);
  return clamp(Math.round(35 + c.hidden.loyalty * 2 + t), 10, 90);
}

export function ensureMood(world: World): void {
  for (const c of Object.values(world.characters)) {
    if (c.tier !== 'full' || c.mood !== undefined) continue;
    const jitter = Rng.fromSeed(`${world.seed}|mood|${c.id}`).int(-8, 8);
    c.mood = clamp(moodBaseline(c) + jitter, 5, 95);
  }
}

export function moodOf(c: Character): number {
  return c.mood ?? moodBaseline(c);
}

export function moodLabel(m: number): string {
  if (m >= 80) return 'Eager';
  if (m >= 60) return 'Content';
  if (m >= 40) return 'Steady';
  if (m >= 25) return 'Restless';
  return 'Resentful';
}

export function moodColor(m: number): string {
  if (m >= 60) return 'var(--green)';
  if (m >= 40) return 'var(--fg-2)';
  if (m >= 25) return 'var(--amber)';
  return 'var(--orange)';
}

export function shiftMood(c: Character | undefined, by: number): void {
  if (!c || !c.alive || c.tier !== 'full') return;
  c.mood = clamp(Math.round(moodOf(c) + by), 0, 100);
}

/** Council (bar the Highroy) and knights: the people whose mood sets field capacity. */
export function retinue(world: World, houseId: string): Character[] {
  return alive(world).filter((c) => c.houseId === houseId && ((c.seat && c.seat !== 'highroy') || c.role === 'Knight'));
}

/** How many missions the house can keep out at once, 1..6, from its retinue's mood. */
export function fieldSlots(world: World, houseId: string): number {
  const r = retinue(world, houseId);
  if (!r.length) return 1;
  const avg = r.reduce((s, c) => s + moodOf(c), 0) / r.length;
  return clamp(Math.floor(avg / 15), 1, 6);
}

export function averageMood(world: World, houseId: string): number {
  const r = retinue(world, houseId);
  return r.length ? Math.round(r.reduce((s, c) => s + moodOf(c), 0) / r.length) : 50;
}

/** Cycles someone wants at home between missions. */
export const REST_CYCLES = 4;

/** Why this person won't go right now, or null if they're willing. */
export function unwilling(world: World, c: Character): string | null {
  if (c.flags.some((f) => f.id === 'wounded')) return 'Wounded';
  if (c.flags.some((f) => f.id === 'ill')) return 'Ill';
  if (c.flags.some((f) => f.id === 'grieving')) return 'Grieving';
  if (c.lastMission && absoluteCycle(world.date) - absoluteCycle(c.lastMission) < REST_CYCLES) return 'Just back; needs rest';
  if (moodOf(c) < 25) return 'Resentful: refuses to go';
  return null;
}

/** Sent out again soon after coming home: tired, a little sour. */
export function tiredOnLaunch(world: World, c: Character): boolean {
  return !!c.lastMission && absoluteCycle(world.date) - absoluteCycle(c.lastMission) < 16;
}

/** Once a Phase: moods drift toward their baseline; the restless chafe at home; debt sours the retinue. */
export function advanceMood(world: World, phaseTurned: boolean, onMission: Set<string>): void {
  if (!phaseTurned) return;
  const now = absoluteCycle(world.date);
  for (const c of Object.values(world.characters)) {
    if (!c.alive || c.tier !== 'full' || onMission.has(c.id)) continue;
    if (c.flags.some((f) => f.id === 'captive')) continue;
    const base = moodBaseline(c);
    const idle = !c.lastMission || now - absoluteCycle(c.lastMission) > CYCLES_PER_ORBIT * 2;
    const chafes = idle && c.traits.some((t) => RESTLESS.has(t.id)) && (c.seat || c.role === 'Knight');
    // Idleness makes the restless restless, not resentful.
    if (chafes) { if (moodOf(c) > 30) shiftMood(c, -2); }
    else if (moodOf(c) < base) shiftMood(c, Math.min(3, base - moodOf(c)));
    else if (moodOf(c) > base) shiftMood(c, -Math.min(1, moodOf(c) - base));
  }
  for (const houseId of Object.keys(world.houses)) {
    const e = world.economy?.houses[houseId];
    if (e && e.stock.othes < 0) for (const c of retinue(world, houseId)) shiftMood(c, -3);
    // Knights keep the peace at home. With most of them away, the capital frays.
    const knights = alive(world).filter((c) => c.houseId === houseId && c.role === 'Knight');
    const away = knights.filter((c) => onMission.has(c.id)).length;
    if (knights.length && away * 2 > knights.length) {
      const capital = world.planets[world.houses[houseId]!.capitalPlanetId];
      for (const sct of capital?.sectors ?? []) if (sct.controllerFamilyId) sct.unrest = clamp(sct.unrest + 1, 0, 100);
    }
  }
}

export const MOOD_ON_RETURN = { triumph: 8, success: 5, partial: 1, failure: -3, disaster: 0 } as const;
