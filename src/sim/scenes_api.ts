// Starting scenes from the interface: each returns a new world with the scene waiting to be played.
import { startBonding, startAwakening, cannotAwaken, ensureCaigeDepth } from './scenes_power';
import { startAudience, startTalks, startCeremony, ceremoniesDue, startChronicle } from './scenes_court';
import { startInfiltration, bestAgent, startCrisis, crisesDue } from './scenes_shadow';
import { cannotGrant } from './discovery';
import { atWar, sideOf } from './war';
import { econ } from './economy';
import type { World } from './types';
import type { Scene } from './scene';
import './scenes_court';
import './scenes_power';
import './scenes_shadow';

const busy = (w: World) => (w.scenes?.list ?? []).some((s) => s.status !== 'over' && !s.data.motionId);
function begin(input: World, fn: (w: World) => Scene | null | undefined): World {
  if (busy(input)) throw new Error('Finish the scene already under way first.');
  const w = structuredClone(input);
  const s = fn(w);
  if (!s) throw new Error('That cannot be done now.');
  return w;
}

export function beginBonding(input: World, caigeId: string, personId: string): World {
  const c = input.characters[personId];
  const why = c ? cannotGrant(input, c) : 'No one.';
  if (why) throw new Error(why);
  return begin(input, (w) => startBonding(w, caigeId, personId));
}
export function beginAwakening(input: World, personId: string): World {
  const why = cannotAwaken(input, input.characters[personId]!);
  if (why) throw new Error(why);
  return begin(input, (w) => startAwakening(w, personId));
}
export const beginAudience = (input: World, personId: string, mode: 'captive' | 'private') => begin(input, (w) => startAudience(w, personId, mode));
export const beginRescue = (input: World, captiveId: string) => begin(input, (w) => startInfiltration(w, 'rescue', captiveId));
export const beginHeist = (input: World, houseId: string) => begin(input, (w) => startInfiltration(w, 'heist', houseId));
export const beginSabotage = (input: World, frontId: string) => begin(input, (w) => startInfiltration(w, 'sabotage', frontId));
export function beginLegendHunt(input: World, legendId: string): World {
  if (econ(input, input.playerHouseId).stock.othes < 2000) throw new Error('An expedition costs 2,000 othes.');
  return begin(input, (w) => { econ(w, w.playerHouseId).stock.othes -= 2000; return startInfiltration(w, 'legend', legendId); });
}
export function beginPeaceTalks(input: World, warId: string): World {
  const war = input.war?.wars.find((x) => x.id === warId && x.status === 'active');
  const P = input.playerHouseId;
  if (!war || !sideOf(war, P) || (war.attacker !== P && war.defender !== P)) throw new Error('Only the houses that began it can make its peace.');
  return begin(input, (w) => startTalks(w, 'peace', war.attacker === P ? war.defender : war.attacker, warId));
}
export function beginPact(input: World, houseId: string): World {
  if (atWar(input, input.playerHouseId, houseId)) throw new Error('Not while we are at war with them.');
  if ((input.archon?.pacts ?? []).some((r) => (r.a === houseId && r.b === input.playerHouseId) || (r.b === houseId && r.a === input.playerHouseId))) throw new Error('We already have a pact.');
  return begin(input, (w) => startTalks(w, 'pact', houseId));
}
export const whyNoAgent = (w: World) => (bestAgent(w) ? null : 'No one free to send.');

export { ensureCaigeDepth, ceremoniesDue, crisesDue, startChronicle, startCeremony, startCrisis, cannotAwaken };
