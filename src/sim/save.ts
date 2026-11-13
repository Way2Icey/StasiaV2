import type { World } from './types';
import { ensureKnowledge } from './knowledge';
import { ensureCouncil } from './council';
import { ensureEconomy } from './economy';
import { ensureMood } from './mood';
import { ensureDiscovery } from './discovery';
import { ensureGrowth } from './growth';
import { ensurePolitics } from './politics';

export const SAVE_VERSION = 8;

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
    (w as unknown as { version: number }).version = 5;
  }
  // v5 -> v6: mood, field slots, discoveries.
  if ((w.version as number) === 5) {
    (w as unknown as { version: number }).version = 6;
  }
  // v6 -> v7: births, coming of age, rival growth, annals.
  if ((w.version as number) === 6) {
    (w as unknown as { version: number }).version = 7;
  }
  // v7 -> v8: the Speaker of the Council, envoy corps, stances.
  if ((w.version as number) === 7) {
    (w as World).version = 8;
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
  ensureMood(world);
  ensureDiscovery(world);
  ensureGrowth(world);
  ensurePolitics(world);
  return world;
}
