// Embassies: every house keeps an embassy in every other house's capital, with or without an ambassador in it.
import { Rng } from './rng';
import { displayName } from './names';
import { relation, shiftRelation } from './relations';
import { learn } from './knowledge';
import { logRecord } from './records';
import { isAway } from './court';
import { shiftOpinion } from './relationships';
import type { Character, World } from './types';

const H = (w: World, id: string) => `House ${w.houses[id]?.name ?? id}`;

export interface Embassy {
  /** The house whose capital it stands in. */
  host: string;
  /** The house it belongs to. */
  guest: string;
  ambassadorId: string | null;
  since?: import('./time').GameDate;
}

export type EmbassiesState = Record<string, Embassy>;

export const embassyKey = (host: string, guest: string) => `${guest}@${host}`;

export function embassy(world: World, host: string, guest: string): Embassy | undefined {
  return world.embassies?.[embassyKey(host, guest)];
}

function postFlag(c: Character, w: World, host: string) {
  c.flags = c.flags.filter((f) => !(f.id === 'posted' && /ambassador/.test(f.detail ?? '')));
  c.flags.push({ id: 'posted', since: w.date, detail: `ambassador to ${H(w, host)}` });
  const p = w.planets[w.houses[host]?.capitalPlanetId ?? ''];
  if (p) c.location = { planetId: p.id, sectorId: p.sectors[0]!.id };
}

function bringHome(c: Character, w: World) {
  c.flags = c.flags.filter((f) => !(f.id === 'posted' && /ambassador/.test(f.detail ?? '')));
  const p = w.planets[w.houses[c.houseId]?.capitalPlanetId ?? ''];
  if (p) c.location = { planetId: p.id, sectorId: p.sectors[0]!.id };
}

function aiPick(world: World, house: string): Character | undefined {
  const taken = new Set(Object.values(world.embassies ?? {}).map((e) => e.ambassadorId));
  return Object.values(world.characters)
    .filter((c) => c.alive && c.houseId === house && c.tier === 'full' && !c.seat && !isAway(world, c.id) && !taken.has(c.id))
    .sort((a, b) => b.stats.diplomacy + b.stats.eloquence - (a.stats.diplomacy + a.stats.eloquence))[0];
}

export function ensureEmbassies(world: World): void {
  if (world.embassies) return;
  world.embassies = {};
  const houses = Object.keys(world.houses);
  for (const host of houses) for (const guest of houses) {
    if (host === guest) continue;
    const e: Embassy = { host, guest, ambassadorId: null };
    world.embassies[embassyKey(host, guest)] = e;
    // Other houses start with someone at our court; we choose our own.
    if (guest !== world.playerHouseId && host === world.playerHouseId) {
      const c = aiPick(world, guest);
      if (c) { e.ambassadorId = c.id; e.since = world.date; postFlag(c, world, host); learn(world, host, c.id, 25); }
    }
  }
}

/** Ambassadors living at a court count as part of it for meetings and friendships. */
export function ambassadorsAt(world: World, host: string): Character[] {
  return Object.values(world.embassies ?? {}).filter((e) => e.host === host && e.ambassadorId).map((e) => world.characters[e.ambassadorId!]).filter((c): c is Character => !!c?.alive);
}

export function cannotAppoint(world: World, host: string, id: string): string | null {
  const c = world.characters[id];
  if (!c?.alive || c.houseId !== world.playerHouseId) return 'Not one of ours';
  if (c.seat) return 'A councillor cannot leave their seat';
  if (isAway(world, c.id)) return 'They are away';
  if (relation(world, host, world.playerHouseId) < -60) return `${H(world, host)} will not receive anyone from us`;
  return null;
}

export function appointAmbassador(input: World, host: string, id: string | null): World {
  const w = structuredClone(input);
  const e = embassy(w, host, w.playerHouseId);
  if (!e) return w;
  if (id) { const why = cannotAppoint(w, host, id); if (why) throw new Error(why); }
  const old = e.ambassadorId ? w.characters[e.ambassadorId] : undefined;
  if (old) bringHome(old, w);
  e.ambassadorId = id;
  e.since = w.date;
  if (id) {
    const c = w.characters[id]!;
    postFlag(c, w, host);
    shiftRelation(w, host, w.playerHouseId, 3);
    logRecord(w, { kind: 'world', type: 'politics', severity: 1, text: `${displayName(c.name)} takes up the post of ambassador to ${H(w, host)}.`, who: [{ id: c.id, part: 'ambassador' }], houseIds: [host] });
  } else if (old) {
    logRecord(w, { kind: 'world', type: 'politics', severity: 1, text: `${displayName(old.name)} is recalled from our embassy at the court of ${H(w, host)}.`, who: [{ id: old.id, part: 'recalled' }], houseIds: [host] });
  }
  return w;
}

/** Send their ambassador packing. */
export function expelAmbassador(input: World, guest: string): World {
  const w = structuredClone(input);
  const e = embassy(w, w.playerHouseId, guest);
  const c = e?.ambassadorId ? w.characters[e.ambassadorId] : undefined;
  if (!e || !c) return w;
  bringHome(c, w);
  e.ambassadorId = null;
  e.since = w.date;
  shiftRelation(w, guest, w.playerHouseId, -15);
  const st = w.houses[w.playerHouseId]!.standing;
  st.dread = Math.min(100, st.dread + 1);
  logRecord(w, { kind: 'world', type: 'politics', severity: 2, text: `We expel ${displayName(c.name)}, ambassador of ${H(w, guest)}, from our court.`, who: [{ id: c.id, part: 'expelled' }], houseIds: [guest], effects: [`${H(w, guest)} regard −15`, 'Dread +1'] });
  return w;
}

/** What an ambassador does for their house each Phase. */
export function advanceEmbassies(world: World, rng: Rng, phaseTurned: boolean): void {
  ensureEmbassies(world);
  if (!phaseTurned) return;
  const P = world.playerHouseId;
  for (const e of Object.values(world.embassies)) {
    const c = e.ambassadorId ? world.characters[e.ambassadorId] : undefined;
    if (e.ambassadorId && (!c?.alive || c.houseId !== e.guest)) { e.ambassadorId = null; continue; }
    if (!c) {
      // Other houses fill their empty embassies in time.
      if (e.guest !== P && rng.chance(0.15) && relation(world, e.host, e.guest) > -50) {
        const pick = aiPick(world, e.guest);
        if (pick) { e.ambassadorId = pick.id; e.since = world.date; postFlag(pick, world, e.host); if (e.host === P) logRecord(world, { kind: 'world', type: 'politics', severity: 1, text: `${displayName(pick.name)} arrives as the new ambassador of ${H(world, e.guest)}.`, who: [{ id: pick.id, part: 'ambassador' }], houseIds: [e.guest] }); }
      }
      continue;
    }
    // Eyes and ears at court.
    const council = Object.values(world.characters).filter((k) => k.alive && k.houseId === e.host && k.seat);
    if (council.length) learn(world, e.guest, rng.pick(council).id, 2 + c.stats.insight / 6);
    // A good ambassador warms the host; a poor one grates.
    const touch = (c.stats.diplomacy + c.stats.eloquence) / 2 - 10;
    shiftRelation(world, e.host, e.guest, Math.max(-1, Math.min(1.5, touch / 6)));
    const lord = world.houses[e.host]?.rulerId;
    if (lord) shiftOpinion(world, lord, c.id, rng.gauss() * 2 + touch / 4, 'at court as an ambassador');
    // When things sour badly, the host sends them home.
    if (relation(world, e.host, e.guest) < -60 && rng.chance(0.25)) {
      bringHome(c, world);
      e.ambassadorId = null;
      shiftRelation(world, e.guest, e.host, -5);
      if (e.host === P || e.guest === P) logRecord(world, {
        kind: 'world', type: 'politics', severity: 2,
        text: e.guest === P ? `${H(world, e.host)} has expelled our ambassador, ${displayName(c.name)}.` : `${H(world, e.guest)}'s ambassador, ${displayName(c.name)}, has been sent home from our court.`,
        who: [{ id: c.id, part: 'expelled' }], houseIds: [e.host, e.guest],
      });
    }
  }
}
