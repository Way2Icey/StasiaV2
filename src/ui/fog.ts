// What the player's house can see. Views are cached per world snapshot.
import { viewOf, type CharacterView } from '../sim/knowledge';
import type { Character, World } from '../sim/types';
import { useGame, useWorld } from './context';

const cache = new WeakMap<World, { reveal: boolean; views: Map<string, CharacterView> }>();

export function seenBy(world: World, reveal: boolean) {
  let entry = cache.get(world);
  if (!entry || entry.reveal !== reveal) {
    entry = { reveal, views: new Map() };
    cache.set(world, entry);
  }
  const views = entry.views;
  return (c: Character): CharacterView => {
    let v = views.get(c.id);
    if (!v) {
      v = viewOf(world, world.playerHouseId, c, reveal);
      views.set(c.id, v);
    }
    return v;
  };
}

/** Hook: a function from character to what the player knows of them. */
export function useSee(): (c: Character) => CharacterView {
  const world = useWorld();
  const { reveal } = useGame();
  return seenBy(world, reveal);
}
