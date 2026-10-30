// The Light-Pulse Standard calendar (from the lore):
//   1 Cycle  = 1 day
//   1 Phase  = 16 Cycles
//   1 Orbit  = 80 Cycles (5 Phases)
//   1 Year   = 10 Orbits (800 Cycles)
// Dates are written "SY-412 · Orbit 3 · Cycle 14" (SY = years since Sympon).

export const CYCLES_PER_PHASE = 16;
export const PHASES_PER_ORBIT = 5;
export const CYCLES_PER_ORBIT = CYCLES_PER_PHASE * PHASES_PER_ORBIT; // 80
export const ORBITS_PER_YEAR = 10;
export const CYCLES_PER_YEAR = CYCLES_PER_ORBIT * ORBITS_PER_YEAR; // 800

/** One press of Continue advances this many Cycles. */
export const CYCLES_PER_TURN = 2;

/** A date as year + zero-based cycle within that year (0..799). */
export interface GameDate {
  year: number;
  cycle: number;
}

export interface DateParts {
  year: number;
  /** 1..10 */
  orbit: number;
  /** 1..5 within the orbit */
  phase: number;
  /** 1..80 within the orbit */
  cycleOfOrbit: number;
  /** 1..16 within the phase */
  cycleOfPhase: number;
}

export function absoluteCycle(d: GameDate): number {
  return d.year * CYCLES_PER_YEAR + d.cycle;
}

export function fromAbsolute(abs: number): GameDate {
  const year = Math.floor(abs / CYCLES_PER_YEAR);
  return { year, cycle: abs - year * CYCLES_PER_YEAR };
}

export function addCycles(d: GameDate, n: number): GameDate {
  return fromAbsolute(absoluteCycle(d) + n);
}

export function makeDate(year: number, orbit: number, cycleOfOrbit: number): GameDate {
  return { year, cycle: (orbit - 1) * CYCLES_PER_ORBIT + (cycleOfOrbit - 1) };
}

export function dateParts(d: GameDate): DateParts {
  const orbitIndex = Math.floor(d.cycle / CYCLES_PER_ORBIT);
  const inOrbit = d.cycle - orbitIndex * CYCLES_PER_ORBIT;
  const phaseIndex = Math.floor(inOrbit / CYCLES_PER_PHASE);
  return {
    year: d.year,
    orbit: orbitIndex + 1,
    phase: phaseIndex + 1,
    cycleOfOrbit: inOrbit + 1,
    cycleOfPhase: inOrbit - phaseIndex * CYCLES_PER_PHASE + 1,
  };
}

export function formatDate(d: GameDate): string {
  const p = dateParts(d);
  return `SY-${p.year} · Orbit ${p.orbit} · Cycle ${p.cycleOfOrbit}`;
}

/** How many Phase, Orbit and Year boundaries lie in (from, to]. */
export function boundariesCrossed(from: GameDate, to: GameDate) {
  const a = absoluteCycle(from);
  const b = absoluteCycle(to);
  const count = (size: number) => Math.floor(b / size) - Math.floor(a / size);
  return {
    phases: count(CYCLES_PER_PHASE),
    orbits: count(CYCLES_PER_ORBIT),
    years: count(CYCLES_PER_YEAR),
  };
}

/** Whole years elapsed between two dates (an age). */
export function yearsBetween(from: GameDate, to: GameDate): number {
  return Math.floor((absoluteCycle(to) - absoluteCycle(from)) / CYCLES_PER_YEAR);
}
