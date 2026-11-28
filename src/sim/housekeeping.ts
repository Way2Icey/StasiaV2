// Housekeeping, once an Orbit: what the world no longer needs to carry. Every turn copies the whole world, so
// whatever piles up forever makes every later turn slower. Nothing the player can still see or act on goes.
import { absoluteCycle, CYCLES_PER_YEAR } from './time';
import type { World } from './types';

/** Finished missions of ours kept for their reports. */
export const KEEP_OUR_MISSIONS = 60;
const round1 = (v: number) => Math.round(v * 10) / 10;

export function housekeeping(w: World): void {
  const now = absoluteCycle(w.date);
  const P = w.playerHouseId;
  // Missions: other houses' finished ones after a year; ours, the newest few dozen.
  const done = Object.values(w.missions).filter((m) => m.stage === 'done');
  const endedAt = (m: (typeof done)[number]) => absoluteCycle((m as { ended?: World['date'] }).ended ?? m.stageEnds ?? m.launched);
  const inUse = new Set<string>([
    ...(w.events?.pending ?? []).map((p) => p.missionId).filter((x): x is string => !!x),
    ...(w.training?.pupilOffers ?? []).map((o) => o.missionId),
    ...(w.briefings?.queue ?? []).map((b) => b.ref.split(':')[0]!),
  ]);
  for (const m of done) if (m.houseId !== P && now - endedAt(m) > CYCLES_PER_YEAR && !inUse.has(m.id)) delete w.missions[m.id];
  const ours = done.filter((m) => m.houseId === P && !inUse.has(m.id)).sort((a, b) => endedAt(b) - endedAt(a));
  for (const m of ours.slice(KEEP_OUR_MISSIONS)) delete w.missions[m.id];
  // The port register: captains not seen in two years, unless banned.
  for (const [id, e] of Object.entries(w.ports?.register ?? {})) if (!e.banned && now - absoluteCycle(e.lastSeen) > 2 * CYCLES_PER_YEAR) delete w.ports.register[id];
  // Ties: the dead hold no opinions; what the living feel is kept to a tenth.
  for (const [holder, m] of Object.entries(w.ties ?? {})) {
    const c = w.characters[holder];
    if (!c || (!c.alive && (!c.death || now - absoluteCycle(c.death.date) > CYCLES_PER_YEAR))) { delete w.ties[holder]; continue; }
    for (const t of Object.values(m)) {
      const x = t;
      if (typeof x.like === 'number') x.like = round1(x.like);
      if (typeof x.dislike === 'number') x.dislike = round1(x.dislike);
      x.opinion = round1(x.opinion);
    }
  }
}
