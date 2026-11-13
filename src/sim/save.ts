import type { World } from './types';
import { ensureKnowledge } from './knowledge';
import { ensureCouncil } from './council';
import { ensureEconomy } from './economy';

export const SAVE_VERSION = 5;

export function serialize(world: World): string {
  return JSON.stringify(world);
}

export class SaveError extends Error {}

export function deserialize(text: string): World {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new SaveError('That file is not a Stasia save.');
  }
  if (!data || typeof data !== 'object') throw new SaveError('That file is not a Stasia save.');
  const w = data as Partial<World>;
  // v1 → v2: knowledge fog and missions arrived.
  if ((w.version as number) === 1) {
    (w as unknown as { version: number }).version = 2;
    (w as World).missions = {};
    (w as World).knowledge = {};
  }
  // v2 -> v3: council tasks, oaths, standing and relations arrived.
  if ((w.version as number) === 2) {
    (w as unknown as { version: number }).version = 3;
  }
  // v3 -> v4: captives, and rival houses that act.
  if ((w.version as number) === 3) {
    (w as unknown as { version: number }).version = 4;
    (w as World).captives = {};
  }
  // v4 -> v5: the economy.
  if ((w.version as number) === 4) {
    (w as World).version = 5;
  }
  if (w.version !== SAVE_VERSION) throw new SaveError(`Unsupported save version: ${String(w.version)}`);
  const required: (keyof World)[] = ['seed', 'date', 'rng', 'houses', 'families', 'characters', 'planets', 'feed'];
  for (const key of required) {
    if (!(key in w)) throw new SaveError(`Save is missing "${key}".`);
  }
  const world = w as World;
  world.missions ??= {};
  world.captives ??= {};
  ensureKnowledge(world);
  ensureCouncil(world);
  ensureEconomy(world);
  return world;
}
