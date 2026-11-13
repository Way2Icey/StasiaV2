// The court at home: nobles who stay give the house something, and what they
// give depends on who they are to the Highroy. Send them out and it is lost.
import type { Rng } from './rng';
import { ageOf } from './characters';
import { alive } from './query';
import { retinue, shiftMood } from './mood';
import { SPECIES } from '../data/species';
import type { Character, World } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export type CourtEffect = 'income' | 'tasks' | 'unrest' | 'mood' | 'respect';

export interface CourtPlace {
  character: Character;
  /** Who they are to the Highroy. */
  place: string;
  effect: CourtEffect;
  /** Size of the effect: a fraction for income/tasks/respect, points for unrest/mood. */
  value: number;
  text: string;
  home: boolean;
}

/** Is this person away from the court: on a mission, captive or missing? */
export function isAway(world: World, id: string): boolean {
  const c = world.characters[id];
  if (!c) return true;
  if (c.flags.some((f) => f.id === 'captive' || f.id === 'missing')) return true;
  return Object.values(world.missions).some((m) => m.stage !== 'done' && (m.leaderId === id || m.companions?.includes(id)));
}

function placeOf(world: World, c: Character): Omit<CourtPlace, 'character' | 'home'> | null {
  const fam = world.families[c.familyId];
  if (c.role === 'Spouse of the Highroy') return { place: 'Consort', effect: 'tasks', value: 0.05, text: 'Hosts the court: council tasks +5%, and a chance of +1 respect each Phase' };
  if (c.role === 'Heir') return { place: 'Heir', effect: 'mood', value: 1, text: 'The heir at court steadies the house: council and knights +1 mood each Phase' };
  if (c.role === 'Son of the Highroy' || c.role === 'Daughter of the Highroy') return { place: c.role.startsWith('Son') ? 'Son of the Highroy' : 'Daughter of the Highroy', effect: 'tasks', value: 0.02, text: 'Sits in on the council: tasks +2%' };
  if (c.role.startsWith('Head of')) return { place: 'Head of a family', effect: 'unrest', value: 1, text: "Present in the family's sectors: their unrest −1 each Phase" };
  if (fam?.ruling) return { place: 'Of the ruling family', effect: 'income', value: 0.015, text: 'Court business: othes income +1.5%' };
  if (c.role.startsWith('Retainer')) return { place: 'Retainer', effect: 'income', value: 0.01, text: 'Useful hands: othes income +1%' };
  if (c.role === 'Noble') return { place: fam?.high ? 'High noble' : 'Noble', effect: 'income', value: fam?.high ? 0.015 : 0.01, text: `Court business: othes income +${fam?.high ? '1.5' : '1'}%` };
  return null;
}

/** Everyone who can add to the court, home or away. Council and knights have their own duties. */
export function courtOf(world: World, houseId: string): CourtPlace[] {
  return alive(world)
    .filter((c) => c.houseId === houseId && c.tier === 'full' && !c.seat && c.role !== 'Knight' && (c.role === 'Heir' || ageOf(c, world.date) >= SPECIES[c.species].adulthood))
    .flatMap((c) => {
      const p = placeOf(world, c);
      return p ? [{ ...p, character: c, home: !isAway(world, c.id) }] : [];
    });
}

export interface CourtTotals {
  income: number;
  tasks: number;
  mood: number;
  respectChance: number;
  /** Family ids whose sectors get unrest relief. */
  presentFamilies: string[];
}

export function courtTotals(world: World, houseId: string): CourtTotals {
  const t: CourtTotals = { income: 0, tasks: 0, mood: 0, respectChance: 0, presentFamilies: [] };
  for (const p of courtOf(world, houseId)) {
    if (!p.home) continue;
    if (p.effect === 'income') t.income += p.value;
    if (p.effect === 'tasks') t.tasks += p.value;
    if (p.effect === 'mood') t.mood += p.value;
    if (p.place === 'Consort') t.respectChance += 0.15;
    if (p.effect === 'unrest') t.presentFamilies.push(p.character.familyId);
  }
  t.income = Math.min(t.income, 0.12);
  t.tasks = Math.min(t.tasks, 0.15);
  return t;
}

/** Whether the Highroy is away from the seat. */
export function highroyAway(world: World, houseId: string): boolean {
  const id = world.houses[houseId]?.rulerId;
  return !!id && isAway(world, id);
}

/** Once a Phase: present heads calm their sectors, the heir steadies the retinue, the consort wins respect. */
export function advanceCourt(world: World, rng: Rng, phaseTurned: boolean): void {
  if (!phaseTurned) return;
  for (const houseId of Object.keys(world.houses)) {
    const t = courtTotals(world, houseId);
    for (const p of Object.values(world.planets)) {
      for (const s of p.sectors) if (s.controllerFamilyId && t.presentFamilies.includes(s.controllerFamilyId)) s.unrest = clamp(s.unrest - 1, 0, 100);
    }
    if (t.mood) for (const c of retinue(world, houseId)) if (!isAway(world, c.id)) shiftMood(c, t.mood);
    if (t.respectChance && rng.chance(t.respectChance)) {
      const st = world.houses[houseId]!.standing;
      st.respect = clamp(st.respect + 1, 0, 100);
    }
  }
}
