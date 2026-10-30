import type { World } from './types';

export const SAVE_VERSION = 1;

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
  if (w.version !== SAVE_VERSION) throw new SaveError(`Unsupported save version: ${String(w.version)}`);
  const required: (keyof World)[] = ['seed', 'date', 'rng', 'houses', 'families', 'characters', 'planets', 'feed'];
  for (const key of required) {
    if (!(key in w)) throw new SaveError(`Save is missing "${key}".`);
  }
  return w as World;
}
