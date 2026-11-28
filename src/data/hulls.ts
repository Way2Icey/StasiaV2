// The kinds of hull in a house's register, and the usual mix of a fleet of a given size.
export type HullType = 'cruiser' | 'destroyer' | 'gunship' | 'fighter';
export const HULL_TYPES: HullType[] = ['cruiser', 'destroyer', 'gunship', 'fighter'];

/** The fleet's mix, as shares of its hulls; the fighter wing takes the rest. */
const SHARE: Record<Exclude<HullType, 'fighter'>, number> = { cruiser: 0.06, destroyer: 0.08, gunship: 0.3 };

/** How many of each kind a fleet of n hulls should hold: at least two cruisers and two destroyers once it is big enough. */
export function mixFor(n: number): Record<HullType, number> {
  const big = n >= 12;
  const cruiser = Math.min(n, Math.max(big ? 2 : 0, Math.round(n * SHARE.cruiser)));
  const destroyer = Math.min(n - cruiser, Math.max(big ? 2 : 0, Math.round(n * SHARE.destroyer)));
  const gunship = Math.min(n - cruiser - destroyer, Math.round(n * SHARE.gunship));
  return { cruiser, destroyer, gunship, fighter: n - cruiser - destroyer - gunship };
}

