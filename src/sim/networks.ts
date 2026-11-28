// Spy networks: the Spymaster's people planted in another house. A network that has taken root reports where
// that house's armies and fleets are and how strong, each Phase, and sees more the longer it has been there.
// Planting is a matter for peacetime: once a house is at war with us its counter-intelligence tightens, so a
// new network is dearer and likelier to fail, and an old one is likelier to be rolled up.
import { Rng } from './rng';
import { absoluteCycle, CYCLES_PER_PHASE, dateParts, type GameDate } from './time';
import { econ } from './economy';
import { seatHolder } from './query';
import { shiftRegard } from './archon';
import { logRecord } from './records';
import { ensureIntel } from './turning';
import { houseName } from './archon';
import type { World } from './types';

export interface Network {
  /** The house it is planted in. */
  house: string;
  /** The house it reports to. */
  for: string;
  since: GameDate;
  /** The cycle it starts reporting (it takes a Phase to take root). */
  ready: number;
  /** How deep it goes: 1 rumours of where their forces are .. 3 their order book. */
  depth: number;
  /** Phases it has reported. */
  phases: number;
  burned?: boolean;
}

/** What planting costs, in peace and at war with them. */
export const NETWORK_COST = { peace: 1500, war: 4000 };
/** The most networks a house keeps going. */
export const NETWORK_LIMIT = 3;

const PHASES_TO_DEEPEN = 2;

/** Whether two houses are on opposite sides of a war under way. */
export function atWarWith(w: World, a: string, b: string): boolean {
  return (w.war?.wars ?? []).some((x) => {
    if (x.status !== 'active') return false;
    const att = [x.attacker, ...x.attackers], def = [x.defender, ...x.defenders];
    return (att.includes(a) && def.includes(b)) || (def.includes(a) && att.includes(b));
  });
}

/** Our Spymaster's craft against theirs. */
function craft(w: World, h: string): number {
  return seatHolder(w, h, 'spymaster')?.stats.intrigue ?? 6;
}

export function networksOf(w: World, forHouse = w.playerHouseId): Network[] {
  return (w.intel?.networks ?? []).filter((n) => n.for === forHouse && !n.burned);
}

export function networkIn(w: World, house: string, forHouse = w.playerHouseId): Network | undefined {
  return networksOf(w, forHouse).find((n) => n.house === house);
}

/** The cost and the odds of planting a network in a house, now. */
export function plantTerms(w: World, house: string): { cost: number; odds: number; war: boolean } {
  const P = w.playerHouseId;
  const war = atWarWith(w, P, house);
  const odds = Math.max(0.05, Math.min(0.9, 0.55 + (craft(w, P) - craft(w, house)) * 0.035)) * (war ? 0.4 : 1);
  return { cost: war ? NETWORK_COST.war : NETWORK_COST.peace, odds: Math.round(odds * 100) / 100, war };
}

export function cannotPlant(w: World, house: string): string | null {
  const P = w.playerHouseId;
  if (house === P) return 'Not in our own house.';
  if (!seatHolder(w, P, 'spymaster')) return 'We have no Spymaster.';
  if (networkIn(w, house)) return 'We have people there already.';
  if (networksOf(w).length >= NETWORK_LIMIT) return `The Spymaster can run ${NETWORK_LIMIT} networks at most.`;
  const { cost } = plantTerms(w, house);
  if (econ(w, P).stock.othes < cost) return `Planting costs ${cost.toLocaleString('en-US')} othes.`;
  return null;
}

/** Plant a network. Paid at once; it takes or it doesn't, and if it doesn't we may be seen trying. */
export function plantNetwork(input: World, house: string): World {
  const why = cannotPlant(input, house);
  if (why) throw new Error(why);
  const w = structuredClone(input);
  const rng = new Rng(w.rng);
  const P = w.playerHouseId;
  const { cost, odds, war } = plantTerms(w, house);
  econ(w, P).stock.othes -= cost;
  const H = houseName(w, house);
  if (rng.chance(odds)) {
    const now = absoluteCycle(w.date);
    ensureIntel(w).networks = [...(w.intel!.networks ?? []).filter((n) => n.house !== house || n.for !== P), { house, for: P, since: w.date, ready: now + CYCLES_PER_PHASE, depth: 1, phases: 0 }];
    logRecord(w, { kind: 'intrigue', type: 'intrigue', severity: 2, text: `The Spymaster's people are in House ${H}. They will report from next Phase.`, effects: [`−${cost.toLocaleString('en-US')} othes`] });
  } else {
    const seen = rng.chance(war ? 0.6 : 0.35);
    if (seen) {
      shiftRegard(w, house, P, -10);
      ensureIntel(w).wrongs.push({ by: P, against: house, text: 'They tried to plant spies among us.', year: dateParts(w.date).year });
    }
    logRecord(w, { kind: 'intrigue', type: 'intrigue', severity: 2, text: seen ? `House ${H} caught the Spymaster's people at the door. They know who sent them.` : `The Spymaster's people could not get into House ${H}. The money is gone.`, effects: [`−${cost.toLocaleString('en-US')} othes`] });
  }
  w.rng = rng.state;
  return w;
}

/** Call a network home. */
export function recallNetwork(input: World, house: string): World {
  const w = structuredClone(input);
  const n = networkIn(w, house);
  if (n) n.burned = true;
  return w;
}

/** Each Phase: networks deepen in peace, and some are rolled up (far more often in a war with that house). */
export function advanceNetworks(w: World, rng: Rng): void {
  const now = absoluteCycle(w.date);
  for (const n of w.intel?.networks ?? []) {
    if (n.burned || n.ready > now) continue;
    const war = atWarWith(w, n.for, n.house);
    const risk = 0.02 + craft(w, n.house) / 600 + (war ? 0.08 : 0) - craft(w, n.for) / 1000;
    if (rng.chance(Math.max(0.01, risk))) {
      n.burned = true;
      shiftRegard(w, n.house, n.for, -12);
      if (n.for === w.playerHouseId) logRecord(w, { kind: 'intrigue', type: 'intrigue', severity: 3, text: `House ${houseName(w, n.house)} has rolled up our network${war ? ': their counter-intelligence is tighter in a war' : ''}.`, detail: `It reported for ${n.phases} Phase${n.phases === 1 ? '' : 's'}.` });
      continue;
    }
    n.phases++;
    if (!war && n.depth < 3 && n.phases % PHASES_TO_DEEPEN === 0) n.depth++;
  }
}

/** How well a network shows that house's forces in a war theatre: 0 nothing, 1 rumours of where, 2 where and how
 *  strong, 3 their orders too. Double agents inside the house give rumours. */
export function insideSight(w: World, ofHouse: string, forHouse: string): number {
  const now = absoluteCycle(w.date);
  const n = (w.intel?.networks ?? []).find((x) => x.house === ofHouse && x.for === forHouse && !x.burned && x.ready <= now);
  const agent = (w.intel?.agents ?? []).some((a) => !a.burned && a.for === forHouse && w.characters[a.personId]?.alive && w.characters[a.personId]?.houseId === ofHouse);
  return Math.max(n ? Math.min(3, n.depth) : 0, agent ? 1 : 0);
}
