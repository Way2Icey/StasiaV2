// The Circle: the people a house's story is about. A house holds millions; the game follows perhaps fifty
// or sixty of them: the Highroy and their close blood, the council, the leading families, knights and
// champions, prospects, captains, wards, and whoever a story has lately touched. Everyone else of the house
// with a name is the Household: they age, marry and die quietly, and send no word. Anyone in the Household
// (or out in the Realm, the unnamed millions) can come into view by doing something; anyone the story stops
// touching drifts back out of it. Other houses are seen the same way, but through a further fog: their
// leaders are known to all, and the rest only as our intelligence and our dealings uncover them.
import type { Character, World } from './types';
import { absoluteCycle, CYCLES_PER_YEAR, dateParts } from './time';

export const CIRCLE_CAP = 60;
/** Years with no part in any story before a person drifts back into the Household. */
export const QUIET_YEARS = 6;

const now = (w: World) => absoluteCycle(w.date);
const flag = (c: Character, id: string) => c.flags.some((f) => f.id === id);
const CHILD_OF_RULER = new Set(['Heir', 'Son of the Highroy', 'Daughter of the Highroy']);

/** In the Circle (fully followed) or not. */
export const inCircle = (c: Character | undefined): boolean => !!c && c.alive && !c.veiled;

/** They had a part in a story just now: a decision, a deed, a mission, a scene. */
export function touch(w: World, id: string | undefined): void {
  if (!id) return;
  const c = w.characters[id];
  if (!c || !c.alive) return;
  c.seen = now(w);
  if (c.veiled) bringIntoView(w, c, 'quiet');
}

/** Out of the Household and into the Circle. */
export function bringIntoView(w: World, c: Character, why: 'quiet' | 'loud' = 'loud', text?: string): void {
  if (!c.veiled) return;
  delete c.veiled;
  c.tier = 'full';
  c.seen = now(w);
  if (c.mood === undefined) c.mood = 60;
  if (why === 'loud' && c.houseId === w.playerHouseId) {
    w.feed.push({ date: w.date, kind: 'council', text: text ?? `${c.name.given} ${c.name.family ?? ''}`.trim() + ' has come to the court\'s attention.', characterIds: [c.id] });
  }
}

/** Into the Household: still of the house, no longer followed. */
export function veil(w: World, c: Character): void {
  if (c.veiled || !c.alive) return;
  c.veiled = dateParts(w.date).year;
  c.tier = 'minor';
}

/** Who the story can never let go of. */
export function anchored(w: World, c: Character): boolean {
  const h = w.houses[c.houseId];
  if (!h) return false;
  if (c.pinned || c.seat || c.id === h.rulerId || c.role === 'Spouse of the Highroy' || CHILD_OF_RULER.has(c.role)) return true;
  if (flag(c, 'knighted') || flag(c, 'caigeBonded') || flag(c, 'ward') || flag(c, 'captive')) return true;
  if (c.role === 'Knight' || c.role === 'Champion' || /Captain|Commander|Grand Master/.test(c.role)) return true;
  // The Highroy's own blood: parents, siblings, children.
  const ruler = h.rulerId ? w.characters[h.rulerId] : undefined;
  if (ruler && c.familyId === ruler.familyId) return true;
  // Out on a mission, or caught up in a story or a struggle.
  if (Object.values(w.missions).some((m) => m.stage !== 'done' && (m.leaderId === c.id || m.companions?.includes(c.id)))) return true;
  if ((w.story?.struggles ?? []).some((s) => !s.ended && (s.ours.includes(c.id) || s.theirs.personId === c.id || s.cast.personId === c.id || s.cast.secondId === c.id))) return true;
  if ((w.story?.threads ?? []).some((t) => !t.closed && t.personId === c.id)) return true;
  if (w.events.pending.some((p) => p.personId === c.id || p.secondId === c.id)) return true;
  return false;
}

/** The leading families: the ruling one and the two with the most of their own in view. */
export function leadingFamilies(w: World, houseId: string): Set<string> {
  const count = new Map<string, number>();
  for (const c of Object.values(w.characters)) if (c.alive && c.houseId === houseId && !c.veiled && (c.seat || flag(c, 'knighted'))) count.set(c.familyId, (count.get(c.familyId) ?? 0) + 1);
  const ruler = w.houses[houseId]?.rulerId ? w.characters[w.houses[houseId]!.rulerId!] : undefined;
  const top = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([f]) => f);
  return new Set([...(ruler ? [ruler.familyId] : []), ...top]);
}

/** A child born into the house: in view if born to the leading families, in the Household if not. */
export function placeNewborn(w: World, c: Character): void {
  if (!leadingFamilies(w, c.houseId).has(c.familyId)) veil(w, c);
}

/** Once a year, each house: the quiet drift out of the Circle, and the Circle kept to its size. */
export function tendCircles(w: World): void {
  const t = now(w);
  for (const houseId of Object.keys(w.houses)) {
    const lead = leadingFamilies(w, houseId);
    const people = Object.values(w.characters).filter((c) => c.alive && c.houseId === houseId && !c.veiled);
    const loose = people.filter((c) => !anchored(w, c));
    // Quiet years: the story has moved on from them.
    for (const c of loose) {
      c.seen ??= t;
      const quiet = (t - c.seen) / CYCLES_PER_YEAR;
      // Children of the leading families stay; they are the house's prospects.
      if (lead.has(c.familyId) && quiet < QUIET_YEARS * 2) continue;
      if (quiet >= QUIET_YEARS) veil(w, c);
    }
    // Then the cap: the least lately seen give way first.
    const still = people.filter((c) => !c.veiled);
    let over = still.length - CIRCLE_CAP;
    if (over <= 0) continue;
    const order = still.filter((c) => !anchored(w, c)).sort((a, b) => (lead.has(a.familyId) ? 1 : 0) - (lead.has(b.familyId) ? 1 : 0) || (a.seen ?? 0) - (b.seen ?? 0));
    for (const c of order) { if (over <= 0) break; veil(w, c); over--; }
  }
}

export const circleOf = (w: World, houseId: string): Character[] => Object.values(w.characters).filter((c) => c.alive && c.houseId === houseId && !c.veiled);
export const householdOf = (w: World, houseId: string): Character[] => Object.values(w.characters).filter((c) => c.alive && c.houseId === houseId && !!c.veiled);

// ---------------------------------------------------------------- the fog over other houses

/** Whether a house knows of a person of another house: its leaders are known to all; the rest must be uncovered. */
export function knownTo(w: World, observer: string, c: Character): boolean {
  if (c.houseId === observer) return true;
  if (c.veiled) return (w.knowledge[observer]?.[c.id]?.depth ?? 0) >= 20;
  const h = w.houses[c.houseId] ?? undefined;
  if (c.seat || c.id === h?.rulerId || CHILD_OF_RULER.has(c.role) || c.role === 'Spouse of the Highroy') return true;
  if (c.name.epithet && (c.role === 'Knight' || flag(c, 'knighted') || c.seat)) return true;
  if ((w.knowledge[observer]?.[c.id]?.depth ?? 0) > 0) return true;
  // Met one of ours: someone of ours knows them, or they have been our captive, ward or guest.
  if (flag(c, 'captive') || flag(c, 'ward')) return true;
  const ties = w.ties?.[c.id];
  if (ties) for (const o of Object.keys(ties)) if (w.characters[o]?.houseId === observer) return true;
  return false;
}

// ---------------------------------------------------------------- the player's hand (pure)

export function pin(input: World, id: string, on: boolean): World {
  const w = structuredClone(input);
  const c = w.characters[id];
  if (!c || c.houseId !== w.playerHouseId) throw new Error('Not one of ours.');
  if (on) {
    // Over the cap, someone less in the story fades at the year's turn.
    bringIntoView(w, c, 'quiet');
    c.pinned = true;
  } else delete c.pinned;
  return w;
}

export function letFade(input: World, id: string): World {
  const w = structuredClone(input);
  const c = w.characters[id];
  if (!c || c.houseId !== w.playerHouseId) throw new Error('Not one of ours.');
  delete c.pinned;
  if (anchored(w, c)) throw new Error('They are too close to the house to fade from it.');
  veil(w, c);
  return w;
}
