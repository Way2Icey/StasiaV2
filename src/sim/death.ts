import { displayName } from './names';
import { logRecord } from './records';
import { onDeath } from './relationships';
import { ageOf } from './characters';
import { addCycles, CYCLES_PER_ORBIT, type GameDate } from './time';
import type { Character, World } from './types';

function log(world: World, kind: World['feed'][number]['kind'], text: string, characterIds?: string[]) {
  world.feed.push({ date: world.date, kind, text, characterIds });
}

export function kill(world: World, c: Character, now: GameDate, cause: string) {
  c.alive = false;
  c.death = { date: now, cause };
  onDeath(world, c.id);
  const seat = c.seat;
  c.seat = undefined;
  if (c.tier === 'full') {
    logRecord(world, {
      kind: 'death', type: 'death', severity: c.houseId === world.playerHouseId ? 3 : c.seat || seat ? 2 : 1,
      text: `${displayName(c.name)} has died, aged ${ageOf(c, now)}.`, detail: `Cause: ${cause}.`,
      who: [{ id: c.id, part: 'died' }], placeId: c.location?.sectorId ?? c.location?.planetId, houseIds: [c.houseId],
    });
  }
  // Family mourns.
  for (const k of Object.values(world.characters)) {
    if (k.alive && k.familyId === c.familyId && k.id !== c.id && k.tier === 'full') {
      k.flags.push({ id: 'grieving', since: now, until: addCycles(now, CYCLES_PER_ORBIT * 2), detail: displayName(c.name) });
    }
  }
  const house = world.houses[c.houseId];
  if (house && house.rulerId === c.id) {
    const successor = pickSuccessor(world, c);
    house.rulerId = successor?.id ?? null;
    if (successor) {
      successor.seat = 'highroy';
      successor.role = 'Highroy';
      log(world, 'world', `${displayName(successor.name)} succeeds as Highroy of ${house.name}.`, [successor.id]);
    }
  } else if (seat) {
    log(world, 'world', `A seat on the council of ${house?.name ?? 'the house'} is now empty.`);
  }
}

/** For now: the eldest adult of the ruling family. Elections come later. */
function pickSuccessor(world: World, ruler: Character): Character | undefined {
  const now = world.date;
  return Object.values(world.characters)
    .filter((k) => k.alive && k.familyId === ruler.familyId && k.id !== ruler.id && ageOf(k, now) >= 16)
    .sort((a, b) => (a.role === 'Heir' ? -1 : b.role === 'Heir' ? 1 : ageOf(b, now) - ageOf(a, now)))[0];
}
