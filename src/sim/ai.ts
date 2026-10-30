// Rival houses: they choose their own tasks and oaths, and send their own
// people out, mostly guided by their personality and how they regard others.
import type { Rng } from './rng';
import { alive } from './query';
import { knowledgeOf } from './knowledge';
import { relation } from './relations';
import { activeMissions, cannotLead, launchInPlace, skillFor } from './missions';
import { OATHS_BY_ID, swearInPlace, TASKS_BY_ID } from './council';
import type { Approach, CouncilSeat, House, MissionKind, World } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Max missions a rival keeps in the field at once. */
const MAX_OUT = 2;

export function advanceRivals(world: World, rng: Rng, phaseTurned: boolean): void {
  for (const h of Object.values(world.houses)) {
    if (h.id === world.playerHouseId) continue;
    if (phaseTurned) {
      chooseOath(world, rng, h);
      chooseTasks(world, rng, h);
    }
    maybeSendMission(world, rng, h);
  }
}

/** Which other house this one is most interested in, for a given purpose. */
function pickHouse(world: World, rng: Rng, h: House, mood: 'hostile' | 'friendly' | 'any'): string {
  const others = Object.keys(world.houses).filter((x) => x !== h.id);
  return rng.weighted(others.map((x) => {
    const r = relation(world, h.id, x);
    let w = x === world.playerHouseId ? 2 : 1;
    if (mood === 'hostile') w *= 1 + Math.max(0, -r) / 30;
    if (mood === 'friendly') w *= 1 + Math.max(0, r + 20) / 30;
    return [x, w] as [string, number];
  }));
}

function chooseOath(world: World, rng: Rng, h: House) {
  const court = world.courts[h.id];
  if (!court || court.oath || !rng.chance(0.35)) return;
  const p = h.personality;
  const sectors = Object.values(world.planets).filter((x) => x.houseId === h.id).flatMap((x) => x.sectors);
  const worstUnrest = Math.max(0, ...sectors.map((s) => s.unrest));
  const id = rng.weighted<string>([
    ['knowRivals', 0.2 + p.intrigue],
    ['winFriend', 0.1 + p.honour * (1 - p.isolation)],
    ['orderAtHome', worstUnrest / 40],
    ['steelHost', 0.1 + p.aggression],
    ['raiseName', 0.4],
  ]);
  const target = OATHS_BY_ID[id]!.target === 'house' ? pickHouse(world, rng, h, 'friendly') : undefined;
  swearInPlace(world, h.id, id, target);
}

function setTask(world: World, houseId: string, seat: CouncilSeat, task: string, target?: string) {
  const court = world.courts[houseId]!;
  const prev = court.tasks[seat];
  if (prev && prev.task === task && prev.target === target) return;
  court.tasks[seat] = { task, target, since: world.date, progress: 0 };
}

function chooseTasks(world: World, rng: Rng, h: House) {
  const p = h.personality;
  const court = world.courts[h.id]!;
  const oathTasks = new Set(court.oath ? OATHS_BY_ID[court.oath.id]?.tasks ?? [] : []);
  const prefer = (a: string, b: string, chanceA: number) => {
    if (oathTasks.has(a) && !oathTasks.has(b)) return a;
    if (oathTasks.has(b) && !oathTasks.has(a)) return b;
    return rng.chance(chanceA) ? a : b;
  };
  const oathTarget = court.oath?.target;

  // Spymaster: listen at someone's doors, or guard their own.
  const spy = prefer('whispers', 'watchHouse', clamp(p.intrigue * 0.8, 0.1, 0.85));
  setTask(world, h.id, 'spymaster', spy, spy === 'whispers' ? pickHouse(world, rng, h, 'hostile') : undefined);
  // Envoy.
  const envoy = prefer('courtHouse', 'attendNumerade', clamp((1 - p.isolation) * 0.7, 0.1, 0.8));
  setTask(world, h.id, 'envoy', envoy, envoy === 'courtHouse' ? oathTarget ?? pickHouse(world, rng, h, 'friendly') : undefined);
  // Grand Master.
  const sectors = Object.values(world.planets).filter((x) => x.houseId === h.id).flatMap((x) => x.sectors);
  const restless = Math.max(0, ...sectors.map((s) => s.unrest)) > 25;
  setTask(world, h.id, 'grandMaster', prefer('patrol', 'drillHost', restless ? 0.7 : 0.3));
  // Steward.
  const room = sectors.filter((s) => s.controllerFamilyId && s.roomUsed < s.room);
  const steward = prefer('keepOrder', 'develop', restless || !room.length ? 0.8 : 0.4);
  setTask(world, h.id, 'steward', steward, steward === 'develop' ? room[0]?.id : undefined);
  void TASKS_BY_ID;
}

function maybeSendMission(world: World, rng: Rng, h: House) {
  const p = h.personality;
  if (activeMissions(world, h.id).length >= MAX_OUT) return;
  if (!rng.chance(0.03 * (0.5 + p.intrigue + p.aggression * 0.5))) return;

  const kind = rng.weighted<MissionKind>([
    ['investigate', 0.2 + p.intrigue * 2],
    ['scout', 0.1 + p.aggression],
    ['envoy', 0.05 + p.honour * (1 - p.isolation)],
  ]);
  const leader = alive(world)
    .filter((c) => !cannotLead(world, h.id, c))
    .sort((a, b) => skillFor(kind, b) - skillFor(kind, a))[0];
  if (!leader) return;
  const approach: Approach = rng.chance(p.aggression * 0.6) ? 'quick' : 'careful';
  const busy = new Set(activeMissions(world, h.id).map((m) => m.targetId ?? m.targetHouseId ?? m.targetPlanetId));

  try {
    if (kind === 'investigate') {
      const targetHouse = pickHouse(world, rng, h, 'hostile');
      const people = alive(world).filter((c) => c.houseId === targetHouse && c.tier === 'full' && !busy.has(c.id) && !c.flags.some((f) => f.id === 'captive'));
      if (!people.length) return;
      // Prefer councillors they know least.
      const t = rng.weighted(people.map((c) => [c, (c.seat ? 3 : 1) * (1 + (100 - knowledgeOf(world, h.id, c.id).depth) / 50)] as [typeof c, number]));
      launchInPlace(world, { kind, houseId: h.id, leaderId: leader.id, targetId: t.id, approach });
    } else if (kind === 'scout') {
      const targetHouse = pickHouse(world, rng, h, 'hostile');
      const planets = Object.values(world.planets).filter((x) => x.houseId === targetHouse && !busy.has(x.id));
      if (!planets.length) return;
      launchInPlace(world, { kind, houseId: h.id, leaderId: leader.id, targetPlanetId: rng.pick(planets).id, approach });
    } else {
      const court = world.courts[h.id];
      const target = court?.oath?.id === 'winFriend' && court.oath.target ? court.oath.target : pickHouse(world, rng, h, 'friendly');
      if (busy.has(target)) return;
      launchInPlace(world, { kind, houseId: h.id, leaderId: leader.id, targetHouseId: target, approach });
    }
  } catch {
    // A plan that no longer makes sense is simply dropped.
  }
}
