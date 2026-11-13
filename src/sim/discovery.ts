// What missions turn up: talented nobodies who become somebodies, Caiges,
// story leads to follow up, and developments that pay the house.
import { Rng } from './rng';
import { createCharacter } from './characters';
import { commonerFamily } from './world';
import { displayName, shortName } from './names';
import { alive, findSector } from './query';
import { learn } from './knowledge';
import { shiftRelation } from './relations';
import { shiftMood } from './mood';
import { absoluteCycle, addCycles, CYCLES_PER_ORBIT } from './time';
import { FLAGS_BY_ID } from '../data/flags';
import { RESOURCE_LABEL } from '../data/economy';
import type {
  Boon, Caige, Character, Lead, Mission, Outcome, ResonanceBand, ResonanceType, ResourceId, SpeciesId, World,
} from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const CAIGE_NAMES = [
  'Pale Lantern', 'Sixth Bell', 'Greywake', 'Thornmother', 'the Quiet Key', 'Ember Vow', 'Stillwater', 'Hollowcrown',
  "Wren's Edge", 'Lastlight', 'the Long Hush', 'Ninefold', 'Cinder Psalm', 'Vigil', 'Saltglass', 'the Widow’s Hand',
  'Farcaller', 'Gravemoth', 'Starling', 'Oathcutter',
];

/** Kinds of talented nobody a mission can turn up. */
const TALENTS = [
  { role: 'Pit fighter', focus: 'champion', stat: 'duelling' },
  { role: 'Hedge knight', focus: 'knight', stat: 'tactics' },
  { role: 'Self-taught scholar', focus: 'scholar', stat: 'intellect' },
  { role: 'Smuggler', focus: 'rogue', stat: 'stealth' },
  { role: 'Fixer', focus: 'rogue', stat: 'intrigue' },
  { role: 'Trader', focus: 'trader', stat: 'negotiation' },
  { role: 'Street orator', focus: 'envoy', stat: 'eloquence' },
] as const;

export const LEAD_LIFE = CYCLES_PER_ORBIT;
export const RECRUIT_COST = 300;

export function ensureDiscovery(world: World): void {
  world.armoury ??= {};
  world.leads ??= [];
  for (const e of Object.values(world.economy?.houses ?? {})) e.boons ??= [];
}

export function leadsOf(world: World, houseId: string): Lead[] {
  return world.leads.filter((l) => l.houseId === houseId);
}

export function caigesOf(world: World, houseId: string): Caige[] {
  return Object.values(world.armoury).filter((c) => c.houseId === houseId);
}

function rollBand(rng: Rng): ResonanceBand {
  return rng.weighted<ResonanceBand>([['bluewake', 40], ['ambercore', 35], ['redline', 20], ['whitebreak', 5]]);
}

function addLead(world: World, lead: Omit<Lead, 'id' | 'found' | 'expires'>): Lead {
  const l: Lead = { ...lead, id: `l${world.nextId++}`, found: world.date, expires: addCycles(world.date, LEAD_LIFE) };
  world.leads.push(l);
  return l;
}

function addBoon(world: World, houseId: string, label: string, flow: Partial<Record<ResourceId, number>>, orbits: number): Boon {
  const e = world.economy.houses[houseId]!;
  const b: Boon = { id: `b${world.nextId++}`, label, flow, until: addCycles(world.date, CYCLES_PER_ORBIT * orbits) };
  e.boons.push(b);
  return b;
}

function placeName(world: World, sectorId: string): string {
  const f = findSector(world, sectorId);
  return f ? `${f.sector.name}, ${f.planet.name}` : 'parts unknown';
}

// ---------------------------------------------------------------- materialization

/** A nobody at a place becomes a somebody: a full named person with a talent. */
export function materialize(world: World, rng: Rng, planetId: string, sectorId: string): Character {
  const planet = world.planets[planetId]!;
  const sector = planet.sectors.find((s) => s.id === sectorId) ?? planet.sectors[0]!;
  const species = rng.weighted(Object.entries(sector.peoples) as [SpeciesId, number][]);
  const family = commonerFamily(world, rng, planet.houseId, species);
  const talent = rng.pick(TALENTS);
  const c = createCharacter(world, rng, {
    houseId: planet.houseId, familyId: family.id, species, role: talent.role, focus: talent.focus, tier: 'full',
    location: { planetId, sectorId: sector.id },
  });
  c.stats[talent.stat] = clamp(c.stats[talent.stat] + 3, 1, 20);
  c.hidden.potential = clamp(c.hidden.potential + 4, 1, 20);
  c.mood = 55;
  // Known to everyone who matters: nobody, until now.
  for (const h of Object.keys(world.houses)) {
    world.knowledge[h] ??= {};
    world.knowledge[h]![c.id] ??= { depth: h === planet.houseId ? 30 : 5, updated: world.date, salt: 0 };
  }
  return c;
}

// ---------------------------------------------------------------- after a mission

/** Chance a mission turns something up, by outcome. */
export const FIND_CHANCE: Record<Outcome, number> = { triumph: 0.6, success: 0.35, partial: 0.1, failure: 0, disaster: 0 };

/**
 * Called when one of the player's missions comes home. Settles any lead it was
 * following, then may turn up something new. Returns lines for the report.
 */
export function discover(world: World, rng: Rng, m: Mission, leader: Character): string[] {
  const lines: string[] = [];
  const outcome = m.outcome ?? 'failure';
  if (m.leadId) lines.push(...settleLead(world, rng, m, leader, outcome));
  if (!rng.chance(FIND_CHANCE[outcome])) return lines;

  const kind = rng.weighted<'recruit' | 'caige' | 'site' | 'secret' | 'deal'>(
    m.kind === 'investigate' ? [['recruit', 2], ['secret', 1.5], ['caige', 0.5]]
      : m.kind === 'scout' ? [['caige', 2], ['recruit', 2], ['site', 1.5]]
        : [['deal', 3], ['recruit', 1]],
  );
  const where = { planetId: m.targetPlanetId, sectorId: m.targetSectorId };
  const by = shortName(leader.name);

  if (kind === 'recruit') {
    const c = materialize(world, rng, where.planetId, where.sectorId);
    learn(world, m.houseId, c.id, 45);
    const foreign = c.houseId !== m.houseId;
    addLead(world, {
      houseId: m.houseId, kind: 'recruit', targetId: c.id, cost: RECRUIT_COST,
      title: `${displayName(c.name)}, ${c.role.toLowerCase()}`,
      text: `${by} met ${shortName(c.name)} in ${placeName(world, where.sectorId)}: a ${c.role.toLowerCase()} worth having.${foreign ? ` Taking them from House ${world.houses[c.houseId]!.name}'s world will not be welcomed there.` : ''}`,
      ...where, sourceMissionId: m.id,
    });
    lines.push(`Found someone: ${displayName(c.name)}, a ${c.role.toLowerCase()}. They could be brought into the house.`);
  } else if (kind === 'caige') {
    const planet = world.planets[where.planetId]!;
    const sector = rng.pick(planet.sectors);
    addLead(world, {
      houseId: m.houseId, kind: 'caige', missionKind: 'scout',
      title: `Rumour of a Caige in ${sector.name}`,
      text: `${by} heard talk of an unbonded Caige hidden somewhere in ${sector.name} on ${planet.name}. A scouting run could find it.`,
      planetId: planet.id, sectorId: sector.id, sourceMissionId: m.id,
    });
    lines.push(`A lead: rumour of an unbonded Caige in ${sector.name}.`);
  } else if (kind === 'site') {
    // A development: something worth working on our own ground.
    const home = Object.values(world.planets).find((p) => p.houseId === m.houseId)!;
    const sector = rng.pick(home.sectors);
    addLead(world, {
      houseId: m.houseId, kind: 'site', missionKind: 'scout',
      title: `Something under ${sector.name}`,
      text: `On ${world.planets[where.planetId]!.name}, ${by} met a surveyor who swears there is an old Navisium seam beneath ${sector.name}, on our own world. Worth a look.`,
      planetId: home.id, sectorId: sector.id, sourceMissionId: m.id,
    });
    lines.push(`A lead: a possible Navisium seam under ${sector.name}, at home.`);
  } else if (kind === 'secret') {
    const t = m.targetId ? world.characters[m.targetId] : undefined;
    const circle = t ? alive(world).filter((c) => c.houseId === t.houseId && c.familyId === t.familyId && c.id !== t.id && c.tier === 'full') : [];
    const who = circle.length ? rng.pick(circle) : undefined;
    if (who) {
      addLead(world, {
        houseId: m.houseId, kind: 'secret', missionKind: 'investigate', targetId: who.id,
        title: `What is ${shortName(who.name)} hiding?`,
        text: `While looking into ${t ? shortName(t.name) : 'the target'}, ${by} kept hearing ${shortName(who.name)}'s name, always followed by a silence.`,
        planetId: who.location.planetId, sectorId: who.location.sectorId, sourceMissionId: m.id,
      });
      lines.push(`A lead: ${displayName(who.name)} is hiding something.`);
    }
  } else if (kind === 'deal' && m.targetHouseId) {
    const amount = 200 + rng.int(0, 6) * 50;
    addBoon(world, m.houseId, `Trade deal with House ${world.houses[m.targetHouseId]!.name}`, { othes: amount }, 2);
    shiftRelation(world, m.targetHouseId, m.houseId, 3, 70);
    lines.push(`A trade deal with House ${world.houses[m.targetHouseId]!.name}: +${amount} othes a Phase for two Orbits.`);
  }
  if (lines.length) world.feed.push({ date: world.date, kind: 'world', text: `${by} brings back more than a report: ${lines[lines.length - 1]}`, characterIds: [leader.id], missionId: m.id });
  return lines;
}

/** A mission that followed a lead: did it pay off? */
function settleLead(world: World, rng: Rng, m: Mission, leader: Character, outcome: Outcome): string[] {
  const lead = world.leads.find((l) => l.id === m.leadId);
  if (!lead) return [];
  world.leads = world.leads.filter((l) => l.id !== lead.id);
  const paid = outcome === 'triumph' || outcome === 'success' || (outcome === 'partial' && rng.chance(0.5));
  if (!paid) return [`The lead (${lead.title.toLowerCase()}) went nowhere.`];
  const by = shortName(leader.name);
  if (lead.kind === 'caige') {
    const caige: Caige = {
      id: `cg${world.nextId++}`, name: rng.pick(CAIGE_NAMES), type: rng.pick<ResonanceType>(['magnetic', 'gravitic', 'drift']),
      band: rollBand(rng), houseId: m.houseId, found: world.date, foundAt: { planetId: lead.planetId, sectorId: lead.sectorId },
    };
    world.armoury[caige.id] = caige;
    shiftMood(leader, 4);
    world.feed.push({ date: world.date, kind: 'world', text: `${by} brings home a Caige: ${caige.name}, ${caige.band}, ${caige.type}. It waits in the armoury for someone to bond.`, characterIds: [leader.id], missionId: m.id });
    return [`Found the Caige: ${caige.name} (${caige.band}, ${caige.type}). It is in our armoury, unbonded.`];
  }
  if (lead.kind === 'site') {
    const sector = findSector(world, lead.sectorId)?.sector;
    const pick = rng.weighted<[ResourceId, number]>([[['navisium', 15], 2], [['metals', 60], 2], [['othes', 250], 1]]);
    addBoon(world, m.houseId, `${pick[0] === 'navisium' ? 'Navisium seam' : pick[0] === 'metals' ? 'Old ore workings' : 'Forgotten storehouse'} under ${sector?.name ?? 'our ground'}`, { [pick[0]]: pick[1] }, 3);
    world.feed.push({ date: world.date, kind: 'world', text: `${by}'s survey pays off under ${sector?.name}: +${pick[1]} ${RESOURCE_LABEL[pick[0]].toLowerCase()} a Phase for three Orbits.`, characterIds: [leader.id], missionId: m.id });
    return [`The site is real: +${pick[1]} ${RESOURCE_LABEL[pick[0]].toLowerCase()} a Phase for three Orbits.`];
  }
  if (lead.kind === 'secret' && lead.targetId) {
    const t = world.characters[lead.targetId];
    if (!t) return [];
    const secret = t.flags.find((f) => FLAGS_BY_ID[f.id]?.visibility === 'secret' && !f.knownBy?.includes(m.houseId));
    if (secret) {
      secret.knownBy = [...(secret.knownBy ?? []), m.houseId];
      return [`The lead was right: ${shortName(t.name)} is ${FLAGS_BY_ID[secret.id]!.label.toLowerCase()}.`];
    }
    learn(world, m.houseId, t.id, 20);
    return [`${shortName(t.name)}'s silence turned out to be nothing worse than pride.`];
  }
  return [];
}

// ---------------------------------------------------------------- player actions (pure)

export function recruit(input: World, leadId: string): World {
  const world = structuredClone(input);
  const lead = world.leads.find((l) => l.id === leadId);
  const c = lead?.targetId ? world.characters[lead.targetId] : undefined;
  if (!lead || !c || !c.alive) throw new Error('They are gone.');
  const cost = lead.cost ?? RECRUIT_COST;
  const e = world.economy.houses[lead.houseId]!;
  if (e.stock.othes < cost) throw new Error('Not enough othes.');
  e.stock.othes -= cost;
  e.recent.unshift({ resource: 'othes', amount: -cost, label: `Brought ${shortName(c.name)} into the house`, kind: 'trade', date: world.date });
  const from = c.houseId;
  if (from !== lead.houseId) shiftRelation(world, from, lead.houseId, -5);
  // A new line in our house, of their own name.
  const famId = `${lead.houseId}:line-${world.nextId++}`;
  const oldFam = world.families[c.familyId];
  world.families[famId] = { id: famId, houseId: lead.houseId, name: oldFam?.name || c.name.family || c.name.given, species: c.species, ruling: false, high: false };
  c.houseId = lead.houseId;
  c.familyId = famId;
  c.role = `Retainer (${c.role.toLowerCase()})`;
  const home = world.planets[world.houses[lead.houseId]!.capitalPlanetId]!;
  c.location = { planetId: home.id, sectorId: home.sectors[0]!.id };
  c.mood = 70;
  learn(world, lead.houseId, c.id, 30);
  world.leads = world.leads.filter((l) => l.id !== leadId);
  world.feed.push({ date: world.date, kind: 'world', text: `${displayName(c.name)} joins the house as a retainer. A nobody no longer.`, characterIds: [c.id] });
  return world;
}

export function dismissLead(input: World, leadId: string): World {
  const world = structuredClone(input);
  world.leads = world.leads.filter((l) => l.id !== leadId);
  return world;
}

/** Why this person can't bond this Caige, or null. */
export function cannotBond(c: Character): string | null {
  if (!c.alive) return 'Dead';
  if (c.tier !== 'full') return 'Not someone to trust with a Caige';
  if (!c.resonance) return 'No resonance to channel';
  if (c.flags.some((f) => f.id === 'caigeBonded')) return 'Already bonded';
  if (c.flags.some((f) => f.id === 'captive' || f.id === 'missing')) return 'Away';
  return null;
}

export function bondCaige(input: World, caigeId: string, characterId: string): World {
  const world = structuredClone(input);
  const caige = world.armoury[caigeId];
  const c = world.characters[characterId];
  if (!caige || caige.bondedTo || !c) throw new Error('Cannot bond.');
  const why = cannotBond(c);
  if (why) throw new Error(why);
  caige.bondedTo = c.id;
  c.flags.push({ id: 'caigeBonded', since: world.date, detail: `"${caige.name}"` });
  c.stats.caigeSync = clamp(c.stats.caigeSync + 2, 1, 20);
  shiftMood(c, 10);
  world.feed.push({ date: world.date, kind: 'world', text: `${displayName(c.name)} bonds with ${caige.name}. A statement of trust the whole house sees.`, characterIds: [c.id] });
  return world;
}

/** Leads go cold; boons run out. Once a turn. */
export function advanceDiscovery(world: World): void {
  const now = absoluteCycle(world.date);
  world.leads = world.leads.filter((l) => {
    const pursued = Object.values(world.missions).some((m) => m.leadId === l.id && m.stage !== 'done');
    return pursued || absoluteCycle(l.expires) > now;
  });
  for (const e of Object.values(world.economy?.houses ?? {})) e.boons = (e.boons ?? []).filter((b) => absoluteCycle(b.until) > now);
}
