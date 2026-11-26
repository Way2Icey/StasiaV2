// What honour, respect and dread actually do, in today's numbers, for the Standing panel.
import { credibilityMarkup, quotaFor } from './economy';
import { raidOdds } from './lanes';
import type { World } from './types';

const pct = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`;

export interface StandingFx { honour: string[]; respect: string[]; dread: string[] }

export function standingFx(w: World, houseId: string): StandingFx {
  const h = w.houses[houseId];
  if (!h) return { honour: [], respect: [], dread: [] };
  const s = h.standing;
  const mk = credibilityMarkup(w, houseId);
  const favourTarget = Math.round(30 + s.honour / 4 + s.respect / 8);
  const quota = quotaFor(w, houseId);
  return {
    honour: [
      Math.abs(mk) < 0.005 ? 'Our othes trade at face value on the Exchange' : `Our othes trade at ${pct(mk)} on the Exchange ${mk > 0 ? '(a markup: we pay more)' : '(a discount: we pay less)'}`,
      'Lenders weigh it first: higher honour, better loans',
      `With respect, it pulls the Numarade's favour toward ${favourTarget}`,
      'Kept oaths raise it; broken oaths, executions and the pulse cage lower it',
    ],
    respect: [
      `The Numarade grants us ${quota.toLocaleString('en-US')} navisium an Orbit, ${pct(s.respect / 250 - 0.2)} for our respect`,
      'Pulls rival fighters toward us, and talent to our academy',
      'Raises our standing in the Archon\'s register',
      'Won in tourneys, the Crucible and the Circuit',
    ],
    dread: [
      `Our sectors stir ${s.dread >= 60 ? 'a third as fast' : s.dread >= 30 ? 'two thirds as fast' : 'at the usual pace'} (${s.dread >= 30 ? 'feared' : 'more fear would slow it'})`,
      `Corsairs raid our ports ${pct(-(s.dread / 400))} for fear of us (raids now ×${raidOdds(w).toFixed(2)})`,
      'Rivals pay reparation more readily when we demand it',
      'Raised by executions, harsh questioning and victories; feared houses are not loved',
    ],
  };
}
