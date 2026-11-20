// The Physician's infirmary: who is hurt or sick, and what the Physician can do about it. Not a building: the seat itself.
import { econ, record } from './economy';
import { displayName } from './names';
import { logRecord } from './records';
import { seatHolder } from './query';
import { shiftMood } from './mood';
import { shiftOpinion } from './relationships';
import { ageOf } from './characters';
import { Rng } from './rng';
import { absoluteCycle, addCycles } from './time';
import type { Character, FlagInstance, World } from './types';

export const ATTEND_COST = 150;
export const TREAT_COST = 400;
const AILMENTS = ['wounded', 'ill', 'grieving', 'godglass'] as const;

export interface Patient { c: Character; f: FlagInstance; attended: boolean }

export function patients(world: World): Patient[] {
  const P = world.playerHouseId;
  const out: Patient[] = [];
  for (const c of Object.values(world.characters)) {
    if (!c.alive || c.houseId !== P) continue;
    for (const f of c.flags) if ((AILMENTS as readonly string[]).includes(f.id)) out.push({ c, f, attended: /attended/.test(f.detail ?? '') });
  }
  return out;
}

/** The old and frail: past nine tenths of their span. */
export function frail(world: World): Character[] {
  const P = world.playerHouseId;
  return Object.values(world.characters).filter((c) => c.alive && c.houseId === P && c.tier === 'full' && ageOf(c, world.date) >= c.lifespan * 0.9);
}

export function physicianSkill(world: World): number {
  const d = seatHolder(world, world.playerHouseId, 'physician');
  return d?.alive ? (d.stats.intellect + d.stats.perception + d.stats.composure) / 3 : 4;
}

/** The Physician sits with one patient: their recovery is cut by a third to two thirds, by skill. */
export function cannotAttend(world: World, id: string, flagId: string): string | null {
  const c = world.characters[id];
  const f = c?.flags.find((x) => x.id === flagId);
  if (!c || !f) return 'Nothing to treat';
  if (/attended/.test(f.detail ?? '')) return 'Already attended';
  if (!seatHolder(world, world.playerHouseId, 'physician')) return 'No Physician';
  if (econ(world, world.playerHouseId).stock.othes < (flagId === 'godglass' ? TREAT_COST : ATTEND_COST)) return 'Not enough othes';
  if (flagId !== 'godglass' && !f.until) return 'Nothing to hurry';
  return null;
}

export function attend(input: World, id: string, flagId: string): World {
  const w = structuredClone(input);
  const why = cannotAttend(w, id, flagId);
  if (why) throw new Error(why);
  const c = w.characters[id]!;
  const f = c.flags.find((x) => x.id === flagId)!;
  const doc = seatHolder(w, w.playerHouseId, 'physician')!;
  const skill = physicianSkill(w);
  const rng = new Rng(w.rng);
  const P = w.playerHouseId;
  if (flagId === 'godglass') {
    record(w, P, { resource: 'othes', amount: -TREAT_COST, label: `Treatment for ${displayName(c.name)}`, kind: 'court' });
    const cured = rng.chance(Math.min(0.85, 0.25 + skill / 30));
    if (cured) c.flags = c.flags.filter((x) => x !== f);
    else f.detail = `${f.detail ? f.detail + '; ' : ''}attended`;
    shiftMood(c, cured ? 6 : -4);
    shiftOpinion(w, c.id, doc.id, cured ? 12 : -4, cured ? 'freed them of godglass' : 'tried to take their godglass');
    logRecord(w, { kind: 'world', type: 'condition', severity: 1, text: cured ? `${displayName(c.name)} is free of godglass, for now. ${displayName(doc.name)} saw them through.` : `${displayName(c.name)} could not be weaned off godglass this time.`, who: [{ id: c.id, part: 'patient' }, { id: doc.id, part: 'physician' }] });
  } else {
    record(w, P, { resource: 'othes', amount: -ATTEND_COST, label: `Physician's care for ${displayName(c.name)}`, kind: 'court' });
    const now = absoluteCycle(w.date);
    const left = absoluteCycle(f.until!) - now;
    const cut = Math.min(0.66, 0.33 + skill / 60);
    f.until = addCycles(w.date, Math.max(1, Math.round(left * (1 - cut))));
    f.detail = `${f.detail ? f.detail + '; ' : ''}attended`;
    shiftMood(c, 4);
    shiftOpinion(w, c.id, doc.id, 6, 'tended them');
  }
  w.rng = rng.state;
  return w;
}
