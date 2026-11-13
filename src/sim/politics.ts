// The Speaker of the Council's work: the envoy corps, the house's public
// stance toward each other house, and answering what other houses do.
import { alive } from './query';
import { shiftRelation } from './relations';
import { shortName } from './names';
import { absoluteCycle } from './time';
import type { Character, Stance, World } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const MAX_ENVOYS = 4;
export const ENVOY_ROLE = 'Envoy';

export function envoysOf(world: World, houseId: string): Character[] {
  return alive(world).filter((c) => c.houseId === houseId && c.role === ENVOY_ROLE);
}

/** Who may lead an envoy mission: the Speaker, the envoy corps, or the Highroy. */
export function mayLeadEnvoy(c: Character): boolean {
  return c.seat === 'envoy' || c.seat === 'highroy' || c.role === ENVOY_ROLE;
}

/** Nobles who could be made envoys. */
export function envoyCandidates(world: World, houseId: string): Character[] {
  return alive(world)
    .filter((c) => c.houseId === houseId && c.tier === 'full' && (c.role === 'Noble' || c.role.startsWith('Retainer')))
    .sort((a, b) => b.stats.diplomacy + b.stats.eloquence - (a.stats.diplomacy + a.stats.eloquence));
}

/** Give every house a small corps of envoys if it has none (new worlds and old saves). */
export function ensurePolitics(world: World): void {
  world.stances ??= {};
  world.answered ??= [];
  for (const h of Object.keys(world.houses)) {
    world.stances[h] ??= {};
    for (const c of alive(world)) if (c.houseId === h && c.seat === 'envoy' && c.role === ENVOY_ROLE) c.role = 'Speaker of the Council';
    if (envoysOf(world, h).length) continue;
    for (const c of envoyCandidates(world, h).slice(0, 2)) c.role = ENVOY_ROLE;
  }
}

export function appointEnvoy(input: World, houseId: string, id: string): World {
  const world = structuredClone(input);
  const c = world.characters[id];
  if (!c || c.houseId !== houseId) throw new Error('Not of our house.');
  if (envoysOf(world, houseId).length >= MAX_ENVOYS) throw new Error(`The corps holds ${MAX_ENVOYS} at most.`);
  c.role = ENVOY_ROLE;
  c.mood = clamp((c.mood ?? 50) + 4, 0, 100);
  world.feed.push({ date: world.date, kind: 'council', text: `${shortName(c.name)} is named an envoy of the house.`, characterIds: [c.id] });
  return world;
}

export function dismissEnvoy(input: World, id: string): World {
  const world = structuredClone(input);
  const c = world.characters[id];
  if (c?.role === ENVOY_ROLE) { c.role = 'Noble'; c.mood = clamp((c.mood ?? 50) - 4, 0, 100); }
  return world;
}

// ---------------------------------------------------------------- stance

export const STANCE_LABEL: Record<Stance, string> = { friendly: 'Friendly', neutral: 'Neutral', opposed: 'Opposed' };

export function stanceOf(world: World, houseId: string, other: string): Stance {
  return world.stances?.[houseId]?.[other] ?? 'neutral';
}

export function setStance(input: World, houseId: string, other: string, stance: Stance): World {
  const world = structuredClone(input);
  (world.stances[houseId] ??= {})[other] = stance;
  return world;
}

/** Once a Phase: a friendly line slowly warms them; an opposed one cools them. */
export function advancePolitics(world: World, phaseTurned: boolean): void {
  if (!phaseTurned) return;
  for (const [h, book] of Object.entries(world.stances ?? {})) {
    for (const [other, s] of Object.entries(book)) {
      if (s === 'friendly') shiftRelation(world, other, h, 1, 40);
      if (s === 'opposed') {
        shiftRelation(world, other, h, -1);
      }
    }
  }
}

// ---------------------------------------------------------------- answering the news

export interface NewsItem {
  key: string;
  houseId: string;
  date: World['date'];
  text: string;
}

/** What other houses have done in public lately, newest first. */
export function houseNews(world: World, observer: string, limit = 12): NewsItem[] {
  const items: NewsItem[] = [];
  for (const [h, list] of Object.entries(world.annals ?? {})) {
    if (h === observer) continue;
    for (const e of list) if (e.public) items.push({ key: `${h}|${absoluteCycle(e.date)}|${e.text}`, houseId: h, date: e.date, text: e.text });
  }
  return items.sort((a, b) => absoluteCycle(b.date) - absoluteCycle(a.date)).slice(0, limit);
}

/** Answer a piece of news publicly. Commend warms them; condemn cools them but shows spine. */
export function answerNews(input: World, houseId: string, item: NewsItem, answer: 'commend' | 'condemn'): World {
  const world = structuredClone(input);
  if (world.answered.includes(item.key)) return world;
  world.answered.push(item.key);
  world.answered = world.answered.slice(-200);
  const name = world.houses[item.houseId]!.name;
  const st = world.houses[houseId]!.standing;
  if (answer === 'commend') {
    shiftRelation(world, item.houseId, houseId, 4, 60);
    world.feed.push({ date: world.date, kind: 'council', text: `We commend House ${name} publicly. They take note.` });
  } else {
    shiftRelation(world, item.houseId, houseId, -8);
    if (st.honour >= 50) st.respect = clamp(st.respect + 1, 0, 100);
    world.feed.push({ date: world.date, kind: 'council', text: `We condemn House ${name} before the Numarade.${st.honour >= 50 ? ' Our word carries; respect rises.' : ''}` });
  }
  return world;
}
