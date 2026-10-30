// Captives: agents caught in the act, held by the house that caught them.
import { Rng } from './rng';
import { displayName, shortName } from './names';
import { alive, seatHolder } from './query';
import { learn } from './knowledge';
import { relation, shiftRelation } from './relations';
import { kill } from './death';
import { absoluteCycle } from './time';
import type { Captive, World } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const house = (w: World, id: string) => `House ${w.houses[id]?.name ?? id}`;

export function captivesHeldBy(world: World, holder: string): Captive[] {
  return Object.values(world.captives ?? {}).filter((c) => c.heldBy === holder && world.characters[c.characterId]?.alive);
}

function free(world: World, cap: Captive) {
  const c = world.characters[cap.characterId]!;
  c.flags = c.flags.filter((f) => f.id !== 'captive' && f.id !== 'missing');
  const home = world.planets[world.houses[c.houseId]?.capitalPlanetId ?? ''];
  if (home) c.location = { planetId: home.id, sectorId: home.sectors[0]!.id };
  delete world.captives[cap.characterId];
}

function tellPlayer(world: World, text: string, ids: string[]) {
  world.feed.push({ date: world.date, kind: 'intrigue', text, characterIds: ids });
}

// ---------------------------------------------------------------- the three choices (in place)

export function releaseInPlace(world: World, id: string): void {
  const cap = world.captives[id];
  const c = world.characters[id];
  if (!cap || !c) return;
  const holder = cap.heldBy;
  free(world, cap);
  shiftRelation(world, c.houseId, holder, 15, 60);
  const st = world.houses[holder]!.standing;
  st.honour = clamp(st.honour + 2, 0, 100);
  if (holder === world.playerHouseId) {
    tellPlayer(world, `We release ${displayName(c.name)} to ${house(world, c.houseId)}. They will remember the mercy.`, [c.id]);
  } else if (c.houseId === world.playerHouseId) {
    tellPlayer(world, `${displayName(c.name)} comes home, released by ${house(world, holder)} after being held since they went missing.`, [c.id]);
  }
}

/** Returns what was learned, as lines for the player. */
export function interrogateInPlace(world: World, id: string, rng: Rng): string[] {
  const cap = world.captives[id];
  const c = world.characters[id];
  if (!cap || !c || cap.interrogated) return [];
  cap.interrogated = true;
  const holder = cap.heldBy;
  const spy = seatHolder(world, holder, 'spymaster');
  const asker = spy ? spy.stats.intrigue * 0.5 + spy.stats.insight * 0.5 : 8;
  const resist = c.stats.willpower * 0.5 + c.stats.composure * 0.3 + c.hidden.loyalty * 0.2;
  const margin = asker - resist + rng.gauss() * 3;
  const lines: string[] = [];
  learn(world, holder, c.id, margin > 0 ? 50 : 20);
  shiftRelation(world, c.houseId, holder, -5);
  if (margin > 0) {
    const council = alive(world).filter((k) => k.houseId === c.houseId && k.seat);
    for (const k of council) learn(world, holder, k.id, margin > 4 ? 20 : 10);
    lines.push(`${shortName(c.name)} talked. We now know the council of ${house(world, c.houseId)} better (${council.length} people).`);
    const m = cap.missionId ? world.missions[cap.missionId] : undefined;
    if (m?.targetId && world.characters[m.targetId]) lines.push(`They were sent to look into ${displayName(world.characters[m.targetId]!.name)}.`);
    else if (m?.kind === 'scout') lines.push(`They were sent to survey ${world.planets[m.targetPlanetId]?.name ?? 'our world'}.`);
    const busy = Object.values(world.missions).filter((x) => x.stage !== 'done' && x.houseId === c.houseId && x.id !== cap.missionId && (x.targetHouseId === holder || world.characters[x.targetId ?? '']?.houseId === holder || world.planets[x.targetPlanetId]?.houseId === holder));
    if (margin > 4 && busy.length) lines.push(`Worse: ${house(world, c.houseId)} has ${busy.length} more ${busy.length === 1 ? 'agent' : 'agents'} working against us right now.`);
  } else {
    lines.push(`${shortName(c.name)} gave us nothing but their name.`);
  }
  if (holder === world.playerHouseId) tellPlayer(world, `Interrogation of ${displayName(c.name)}: ${lines.join(' ')}`, [c.id]);
  return lines;
}

export function executeInPlace(world: World, id: string): void {
  const cap = world.captives[id];
  const c = world.characters[id];
  if (!cap || !c) return;
  const holder = cap.heldBy;
  delete world.captives[id];
  c.flags = c.flags.filter((f) => f.id !== 'captive');
  kill(world, c, world.date, `executed by ${house(world, holder)}`);
  const st = world.houses[holder]!.standing;
  st.dread = clamp(st.dread + 5, 0, 100);
  st.honour = clamp(st.honour - 3, 0, 100);
  shiftRelation(world, c.houseId, holder, -40);
  for (const other of Object.keys(world.houses)) if (other !== holder && other !== c.houseId) shiftRelation(world, other, holder, -5);
  if (c.houseId === world.playerHouseId) {
    tellPlayer(world, `${house(world, holder)} has executed ${displayName(c.name)}, taken while on our business.`, [c.id]);
  }
}

// ---------------------------------------------------------------- player actions (pure)

export function releaseCaptive(input: World, id: string): World {
  const w = structuredClone(input);
  releaseInPlace(w, id);
  return w;
}

export function interrogateCaptive(input: World, id: string): World {
  const w = structuredClone(input);
  const rng = new Rng(w.rng);
  interrogateInPlace(w, id, rng);
  w.rng = rng.state;
  return w;
}

export function executeCaptive(input: World, id: string): World {
  const w = structuredClone(input);
  executeInPlace(w, id);
  return w;
}

// ---------------------------------------------------------------- each turn

/** Holding someone sours their house; rival holders decide what to do with theirs. */
export function advanceCaptives(world: World, rng: Rng, phaseTurned: boolean): void {
  world.captives ??= {};
  for (const cap of Object.values(world.captives)) {
    const c = world.characters[cap.characterId];
    if (!c || !c.alive) { delete world.captives[cap.characterId]; continue; }
    if (!phaseTurned) continue;
    shiftRelation(world, c.houseId, cap.heldBy, -2);
    if (cap.heldBy === world.playerHouseId) continue;
    // A rival holder decides.
    const p = world.houses[cap.heldBy]!.personality;
    if (!cap.interrogated) { interrogateInPlace(world, c.id, rng); continue; }
    const heldPhases = (absoluteCycle(world.date) - absoluteCycle(cap.since)) / 16;
    if (!rng.chance(0.2 + heldPhases * 0.05)) continue;
    const execute = p.aggression * (1 - p.honour) * 1.5 + Math.max(0, -relation(world, cap.heldBy, c.houseId)) / 200;
    const release = p.honour + Math.max(0, relation(world, cap.heldBy, c.houseId)) / 100;
    if (rng.chance(execute / (execute + release))) executeInPlace(world, c.id);
    else releaseInPlace(world, c.id);
  }
}
