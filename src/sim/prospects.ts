// Prospects: the extraordinary young are not bought, they are noticed. Something happens out in
// the Reaches (a raid, a resonance storm, a reactor venting, a riot), somebody young does something
// remarkable in it, and if the house has eyes there, someone of ours sees it and comes asking.
// Real promise makes a youngster likelier to be in the middle of such a thing, and to be seen.
import { Rng } from './rng';
import { displayName, shortName } from './names';
import { SPECIES } from '../data/species';
import { addLead, materialize } from './discovery';
import { logRecord } from './records';
import { findSector, seatHolder } from './query';
import { listeningOn, modulesOf } from './holdings';
import { isAway } from './court';
import { academyAge, ACADEMY_COST, ACADEMY_PLACES, chargesOf, PERSONAL_LIMIT, studentsAt, SUBJECTS, teacherSkill, TUTOR_COST, type Subject } from './training';
import { diamondRead, diamondText, diamondsOf, ensureCareers } from './careers';
import type { GameDate } from './time';
import type { Character, Proposal, StatId, World } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export type Incident = 'raid' | 'storm' | 'accident' | 'riot' | 'pits' | 'trial' | 'wreck';

/** What a youngster did, by the thing they are best at and what was happening. */
const DEEDS: Record<Incident, Partial<Record<Subject, string[]>>> = {
  raid: {
    arms: ['took a corsair\'s blade off him with a docking hook and held a stairwell until the watch came', 'shot two raiders off a cargo lift with a rivet gun'],
    command: ['got forty people out through the service tunnels while the corsairs were still landing', 'had the dock children barricading the lower gate before any adult thought of it'],
    statecraft: ['talked a corsair boarding party out of a shelter full of families'],
    intrigue: ['slipped aboard a corsair lander unseen and cut its fuel line', 'followed the raiders to their boats and came back with a hull number'],
    resonance: ['stood in front of a raider\'s stolen Caige when it went wild, and it went quiet'],
    learning: ['read the corsairs\' burn patterns and called where they would land next, and was right'],
  },
  storm: {
    resonance: ['walked out into a resonance storm and the static parted around them', 'heard the Caige under the old shrine singing a day before the storm broke'],
    learning: ['worked out the storm\'s period from a broken barometer and had the sector sealed in time'],
    command: ['kept a ward of terrified children together through two days of the storm'],
    arms: ['carried a grown man a kilometre through the storm when the transit failed'],
  },
  accident: {
    command: ['ran the evacuation when the reactor vented, with half the shift foremen gone', 'organised a bucket chain of forty strangers at the refinery fire'],
    learning: ['found the fault in the coolant loop that the engineers had missed for a week'],
    arms: ['went back into the burning hab twice and came out with someone each time'],
    resonance: ['calmed a work-Caige that had broken its tether in the foundry'],
  },
  riot: {
    statecraft: ['stood on a crate in the middle of a food riot and got it to listen', 'brokered a truce between two dock gangs over a stolen shipment'],
    intrigue: ['knew who had started the riot before the watch did, and said so quietly'],
    command: ['got the market stallholders to close ranks and keep the looters out'],
  },
  pits: {
    arms: ['won six bouts in a night in the undercity pits, against grown fighters', 'beat a pit champion twice their size and walked out without a scratch'],
    intrigue: ['ran the pit odds for a season without anyone catching on'],
  },
  trial: {
    learning: ['answered the Numarade examiners in a way they still talk about', 'kept the sector\'s ledgers for a dead clerk for half an Orbit, without a mistake'],
    statecraft: ['argued their family\'s case before the sector court, and won'],
    command: ['beat every cadet at the garrison\'s war games'],
  },
  wreck: {
    arms: ['pulled survivors out of a downed lander before the fuel went up'],
    learning: ['kept a wrecked freighter\'s air running for three days with spare parts'],
    command: ['got the survivors of a wreck to the nearest station on a lifeboat built for half of them'],
    resonance: ['found the wreck when the search teams could not: they say they heard it'],
  },
};

const INCIDENT_LABEL: Record<Incident, string> = {
  raid: 'a corsair raid', storm: 'a resonance storm', accident: 'an accident at the works', riot: 'a riot', pits: 'the pits', trial: 'the trials', wreck: 'a wreck',
};

/** The subject a youngster stands out in. */
function standout(c: Character): Subject {
  let best: Subject = 'arms';
  let bestV = -1;
  for (const [k, v] of Object.entries(SUBJECTS) as [Subject, { stats: StatId[] }][]) {
    const score = v.stats.reduce((n, s) => n + c.stats[s], 0) / v.stats.length;
    if (score > bestV) { bestV = score; best = k; }
  }
  return best;
}

/** Who in our house would see it, out there: the sensors, the garrison, the Spymaster's people, the sector watch. */
function eyesOn(world: World, rng: Rng, planetId: string, sectorId: string): string | null {
  const P = world.playerHouseId;
  const planet = world.planets[planetId]!;
  const sectorName = planet.sectors.find((s) => s.id === sectorId)?.name ?? planet.name;
  const ears = listeningOn(world, P, planetId);
  const base = Object.values(world.holdings?.modules ?? {}).find((m) => m.kind === 'base' && m.houseId === P && m.level > 0 && m.sectorId === sectorId);
  const options: [string, number][] = [];
  if (ears) options.push([`Our listening post on ${planet.name} caught it on the local bands and flagged the name.`, 2 + ears]);
  if (base) {
    const cmd = base.overseerId ? world.characters[base.overseerId] : undefined;
    options.push([cmd ? `${displayName(cmd.name)}, commanding our base there, saw it with their own eyes.` : `The garrison at our base in ${sectorName} saw it first-hand.`, 3]);
  }
  if (planet.houseId === P) options.push([`The ${sectorName} watch sent the name up to the citadel.`, 3]);
  const spy = seatHolder(world, P, 'spymaster');
  if (spy) options.push([`${displayName(spy.name)}'s people heard it told in the ${sectorName} taverns.`, planet.houseId === P ? 1 : 1.5]);
  if (!options.length) return null;
  // Far from our eyes, we may not hear at all.
  if (planet.houseId !== P && !ears && !base && !rng.chance(0.4)) return null;
  return rng.weighted(options);
}

/** Who wants them, and for what: a teacher for their own, the academy, or simply a place in the house. */
export function proposalFor(world: World, c: Character, subject: Subject): Proposal {
  const P = world.playerHouseId;
  const teachers = Object.values(world.characters)
    .filter((t) => t.alive && t.houseId === P && t.tier === 'full' && !isAway(world, t.id) && (t.seat || t.role === 'Knight') && t.seat !== 'highroy' && chargesOf(world, t.id).length < PERSONAL_LIMIT && teacherSkill(world, t.id, subject) >= 11)
    .sort((a, b) => teacherSkill(world, b.id, subject) - teacherSkill(world, a.id, subject));
  const academy = modulesOf(world, P, 'academy').find((m) => m.level > 0 && studentsAt(world, m.id).length < ACADEMY_PLACES);
  const great = diamondsOf(c) >= 3;
  if (teachers[0] && (great || !academy)) return { kind: 'tutor', sponsorId: teachers[0].id, subject };
  if (academy && academyAge(world, c)) return { kind: 'academy', sponsorId: academy.overseerId ?? undefined, moduleId: academy.id, subject };
  if (teachers[0]) return { kind: 'tutor', sponsorId: teachers[0].id, subject };
  return { kind: 'retainer', subject };
}

export function proposalText(world: World, p: Proposal, c: Character): string {
  const s = p.sponsorId ? world.characters[p.sponsorId] : undefined;
  const n = shortName(c.name);
  if (p.kind === 'tutor' && s) return `${displayName(s.name)} wants to take ${n} on personally, to teach them ${SUBJECTS[p.subject].label.toLowerCase()}.`;
  if (p.kind === 'academy') return `${s ? displayName(s.name) : 'The academy'} asks for a place for ${n}, in ${SUBJECTS[p.subject].label.toLowerCase()}.`;
  return `Someone should bring ${n} into the house before another house does.`;
}

export const PROSPECT_COST = 200;
export function prospectCost(p: Proposal): number {
  return PROSPECT_COST + (p.kind === 'tutor' ? TUTOR_COST : p.kind === 'academy' ? ACADEMY_COST : 0);
}

/**
 * Something happened in a sector, and among the people caught in it was someone young.
 * The better they are, the likelier they did something worth telling, and the likelier it reached us.
 * Returns the prospect, if one came to our notice.
 */
export function noticeYouth(world: World, rng: Rng, planetId: string, sectorId: string, incident: Incident): Character | null {
  // Promise first: most of those caught up in it are nobody in particular.
  const potential = clamp(Math.round(6 + rng.next() * 9 + rng.next() * 6), 1, 20);
  if (!rng.chance((potential / 20) ** 2)) return null;
  const eyes = eyesOn(world, rng, planetId, sectorId);
  if (!eyes) return null;
  const c = materialize(world, rng, planetId, sectorId);
  const ad = SPECIES[c.species].adulthood;
  const age = Math.round(ad * (0.6 + rng.next() * 0.3));
  c.birth = { year: world.date.year - age, cycle: Math.floor(rng.next() * 800) } as GameDate;
  c.hidden.potential = potential;
  for (const k of Object.keys(c.stats) as StatId[]) c.stats[k] = Math.max(1, Math.round(c.stats[k] * 0.7));
  c.role = 'Youngling';
  delete c.name.title; delete c.name.epithet; // too young for honours
  // What they did, in what they are best at (or the nearest thing the moment allowed).
  let subject = standout(c);
  const deeds = DEEDS[incident];
  if (!deeds[subject]) subject = rng.pick(Object.keys(deeds) as Subject[]);
  const deed = rng.pick(deeds[subject]!);
  for (const s of SUBJECTS[subject].stats) c.stats[s] = clamp(c.stats[s] + 2, 1, 20);
  const planet = world.planets[planetId]!;
  const sector = findSector(world, sectorId)?.sector;
  const P = world.playerHouseId;
  ensureCareers(world);
  const read = diamondText(diamondRead(world, c));
  const proposal = proposalFor(world, c, subject);
  const story = `In ${INCIDENT_LABEL[incident]} at ${sector?.name ?? planet.name}, ${planet.name}, ${shortName(c.name)}, ${age}, ${deed}.`;
  addLead(world, {
    houseId: P, kind: 'recruit', targetId: c.id, cost: prospectCost(proposal), planetId, sectorId,
    title: `${displayName(c.name)}, ${age} · ${read}`,
    text: `${story} ${eyes} ${proposalText(world, proposal, c)}${planet.houseId !== P ? ` Taking them from House ${world.houses[planet.houseId]!.name}'s world will be noticed.` : ''}`,
    proposal, noticedBy: eyes,
  });
  logRecord(world, { kind: 'world', type: 'world', severity: 2, text: `${story} ${proposalText(world, proposal, c)}`, detail: eyes, who: [{ id: c.id, part: 'noticed' }, ...(proposal.sponsorId ? [{ id: proposal.sponsorId, part: 'wants them' }] : [])], placeId: sectorId, source: 'the house\'s eyes' });
  if (world.ports) world.ports.alerts += 1;
  return c;
}

/** The Reaches turn over each Orbit: storms, riots, wrecks, pit nights. Now and then someone young stands out. */
export function advanceProspects(world: World, rng: Rng, orbitTurned: boolean): void {
  if (!orbitTurned) return;
  const P = world.playerHouseId;
  const planets = Object.values(world.planets);
  // A handful of incidents across the Reaches each Orbit; most come to nothing.
  const n = 1 + (rng.chance(0.5) ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const planet = rng.chance(0.5) ? planets.find((p) => p.houseId === P) ?? rng.pick(planets) : rng.pick(planets);
    const sector = rng.pick(planet.sectors);
    const incident = rng.weighted<Incident>([['storm', 2], ['accident', 3], ['riot', 2], ['pits', 2], ['trial', 2], ['wreck', 1.5]]);
    noticeYouth(world, rng, planet.id, sector.id, incident);
  }
}
