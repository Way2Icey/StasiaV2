// Every house grows on its own: children are born and come of age, talent
// rises, Caiges turn up. Rival houses also roll for what their own agents
// find. What is public reaches our Chronicle; the rest is written in each
// house's annals, which we only read by scouting or investigating them.
import type { Rng } from './rng';
import { ageOf, createCharacter } from './characters';
import { displayName, shortName } from './names';
import { alive } from './query';
import { learn } from './knowledge';
import { shiftMood } from './mood';
import { materialize } from './discovery';
import { absoluteCycle, addCycles, CYCLES_PER_ORBIT, type GameDate } from './time';
import { SPECIES } from '../data/species';
import type { Caige, Character, Family, ResonanceBand, ResonanceType, World } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface AnnalEntry {
  date: GameDate;
  text: string;
  public: boolean;
  characterIds?: string[];
}

export function ensureGrowth(world: World): void {
  world.annals ??= {};
  world.lastLooked ??= {};
  for (const h of Object.keys(world.houses)) world.annals[h] ??= [];
}

/** Write something into a house's annals; public things also reach our Chronicle. */
export function annal(world: World, houseId: string, text: string, isPublic: boolean, characterIds?: string[]): void {
  ensureGrowth(world);
  const list = world.annals[houseId]!;
  list.unshift({ date: world.date, text, public: isPublic, characterIds });
  world.annals[houseId] = list.slice(0, 80);
  if (isPublic || houseId === world.playerHouseId) world.feed.push({ date: world.date, kind: houseId === world.playerHouseId ? 'birth' : 'world', text, characterIds });
}

/** Their private doings since we last looked, then mark that we have looked. */
export function newsSinceLastLook(world: World, observer: string, houseId: string): string[] {
  ensureGrowth(world);
  const seen = world.lastLooked[observer]?.[houseId];
  const since = seen ? absoluteCycle(seen) : -Infinity;
  const fresh = (world.annals[houseId] ?? []).filter((e) => !e.public && absoluteCycle(e.date) > since);
  (world.lastLooked[observer] ??= {})[houseId] = world.date;
  if (!fresh.length) return [];
  return [`Since we last looked at House ${world.houses[houseId]!.name}: ${fresh.slice(0, 4).map((e) => e.text).join(' ')}${fresh.length > 4 ? ` And ${fresh.length - 4} more.` : ''}`];
}

// ---------------------------------------------------------------- births and coming of age

function fertile(world: World, c: Character): boolean {
  const sp = SPECIES[c.species];
  const age = ageOf(c, world.date);
  const life = (sp.lifespan[0] + sp.lifespan[1]) / 2;
  return c.alive && age >= sp.adulthood && age <= life * 0.55 && !c.flags.some((f) => f.id === 'captive');
}

function bear(world: World, rng: Rng, family: Family, parents: Character[], role: string): Character {
  const home = parents.find((p) => p.location)!.location;
  const child = createCharacter(world, rng, {
    houseId: family.houseId, familyId: family.id, species: parents[0]!.species, role, focus: 'child', tier: 'full', age: 0,
    location: { ...home },
  });
  child.birth = world.date;
  for (const h of Object.keys(world.houses)) {
    world.knowledge[h] ??= {};
    world.knowledge[h]![child.id] ??= { depth: h === family.houseId ? 80 : 20, updated: world.date, salt: 0 };
  }
  child.mood = 60;
  return child;
}

function births(world: World, rng: Rng, houseId: string) {
  const house = world.houses[houseId]!;
  const ruler = house.rulerId ? world.characters[house.rulerId] : undefined;
  const spouse = alive(world).find((c) => c.houseId === houseId && c.role === 'Spouse of the Highroy');
  // The Highroy and consort.
  if (ruler && spouse && fertile(world, ruler) && fertile(world, spouse) && rng.chance(0.05)) {
    const fam = world.families[ruler.familyId]!;
    const sex = rng.chance(0.5) ? 'Son' : 'Daughter';
    const c = bear(world, rng, fam, [ruler, spouse], `${sex} of the Highroy`);
    annal(world, houseId, `House ${house.name} celebrates: a ${sex.toLowerCase()}, ${c.name.given}, born to the Highroy ${shortName(ruler.name)}.`, true, [c.id, ruler.id]);
    return;
  }
  // Noble families.
  for (const fam of Object.values(world.families)) {
    if (fam.houseId !== houseId || fam.ruling || fam.id.includes(':commoner-')) continue;
    const adults = alive(world).filter((c) => c.familyId === fam.id && fertile(world, c));
    if (!adults.some((c) => c.sex === 'f') || !adults.some((c) => c.sex === 'm')) continue;
    if (!rng.chance(0.012)) continue;
    const c = bear(world, rng, fam, adults, 'Child');
    annal(world, houseId, `A child, ${c.name.given}, is born to the ${fam.name} family of House ${house.name}.`, fam.high || houseId === world.playerHouseId, [c.id]);
  }
}

const CHILD_ROLES = new Set(['Child', 'Ward', 'Son of the Highroy', 'Daughter of the Highroy']);

function comingOfAge(world: World, houseId: string) {
  for (const c of alive(world)) {
    if (c.houseId !== houseId || !CHILD_ROLES.has(c.role) || c.flags.some((f) => f.id === 'cameOfAge')) continue;
    if (ageOf(c, world.date) < SPECIES[c.species].adulthood) continue;
    c.flags.push({ id: 'cameOfAge', since: world.date });
    const martial = c.stats.duelling + c.stats.valor + c.stats.tactics;
    if (c.role === 'Child' || c.role === 'Ward') {
      if (martial >= 36) {
        c.role = 'Knight';
        c.flags.push({ id: 'knighted', since: world.date });
        annal(world, houseId, `${displayName(c.name)} comes of age and is knighted in House ${world.houses[houseId]!.name}.`, true, [c.id]);
      } else {
        c.role = 'Noble';
        annal(world, houseId, `${displayName(c.name)} comes of age in House ${world.houses[houseId]!.name}.`, houseId === world.playerHouseId, [c.id]);
      }
    } else {
      annal(world, houseId, `${displayName(c.name)}, child of the Highroy, comes of age.`, true, [c.id]);
    }
  }
}

// ---------------------------------------------------------------- what rival houses find

const CAIGE_NAMES = ['Coldwake', 'the Ninth Oath', 'Briar Crown', 'Duskhorn', 'Ironpsalm', 'the Grey Widow', 'Sunken Bell', 'Harrowlight'];

/** A rival takes in someone talented. Poaching a person we had our eye on is noticed. */
export function rivalRecruit(world: World, rng: Rng, houseId: string, c: Character): void {
  const e = world.economy.houses[houseId]!;
  if (e.stock.othes < 600) return;
  e.stock.othes -= 300;
  const from = c.houseId;
  const fam = `${houseId}:line-${world.nextId++}`;
  world.families[fam] = { id: fam, houseId, name: world.families[c.familyId]?.name || c.name.given, species: c.species, ruling: false, high: false };
  c.houseId = houseId;
  c.familyId = fam;
  c.role = `Retainer (${c.role.toLowerCase()})`;
  const home = world.planets[world.houses[houseId]!.capitalPlanetId]!;
  c.location = { planetId: home.id, sectorId: home.sectors[0]!.id };
  c.mood = 65;
  learn(world, houseId, c.id, 40);
  const ours = world.leads.find((l) => l.kind === 'recruit' && l.targetId === c.id);
  if (ours) {
    world.leads = world.leads.filter((l) => l !== ours);
    world.feed.push({ date: world.date, kind: 'intrigue', text: `Before we could approach ${displayName(c.name)}, House ${world.houses[houseId]!.name} took them in.`, characterIds: [c.id] });
  } else if (from === world.playerHouseId) {
    world.feed.push({ date: world.date, kind: 'intrigue', text: `${displayName(c.name)}, one of our own people, has gone to serve House ${world.houses[houseId]!.name}.`, characterIds: [c.id] });
  }
  annal(world, houseId, `They took in ${displayName(c.name)}, a ${c.role.replace(/^Retainer \(|\)$/g, '')}.`, false, [c.id]);
  void rng;
}

/** A rival comes by a Caige and bonds it to their best candidate. */
export function rivalCaige(world: World, rng: Rng, houseId: string, where?: { planetId: string; sectorId: string }): void {
  const home = world.planets[world.houses[houseId]!.capitalPlanetId]!;
  const caige: Caige = {
    id: `cg${world.nextId++}`, name: rng.pick(CAIGE_NAMES), type: rng.pick<ResonanceType>(['magnetic', 'gravitic', 'drift']),
    band: rng.weighted<ResonanceBand>([['bluewake', 40], ['ambercore', 35], ['redline', 20], ['whitebreak', 5]]),
    houseId, found: world.date, foundAt: where ?? { planetId: home.id, sectorId: home.sectors[0]!.id },
  };
  world.armoury[caige.id] = caige;
  const who = alive(world)
    .filter((c) => c.houseId === houseId && c.tier === 'full' && c.resonance && !c.flags.some((f) => f.id === 'caigeBonded' || f.id === 'captive'))
    .sort((a, b) => b.stats.caigeSync + b.stats.duelling - (a.stats.caigeSync + a.stats.duelling))[0];
  if (who) {
    caige.bondedTo = who.id;
    who.flags.push({ id: 'caigeBonded', since: world.date, detail: `"${caige.name}"` });
    who.stats.caigeSync = clamp(who.stats.caigeSync + 2, 1, 20);
    shiftMood(who, 10);
  }
  annal(world, houseId, `They came by a Caige, ${caige.name} (${caige.band})${who ? `, now bonded to ${shortName(who.name)}` : ''}.`, false, who ? [who.id] : undefined);
}

/** What a rival's own successful mission turns up, settled on their side. */
export function rivalFind(world: World, rng: Rng, houseId: string, kind: 'investigate' | 'scout' | 'envoy', where: { planetId: string; sectorId: string }, targetHouseId?: string): void {
  const pick = rng.weighted<'recruit' | 'caige' | 'deal'>(
    kind === 'envoy' ? [['deal', 3], ['recruit', 1]] : kind === 'scout' ? [['recruit', 2], ['caige', 1]] : [['recruit', 2], ['caige', 0.5]],
  );
  if (pick === 'recruit') {
    // Prefer someone we already had our eye on, if they are on that world.
    const ours = world.leads.find((l) => l.kind === 'recruit' && l.planetId === where.planetId && l.targetId && world.characters[l.targetId]?.alive);
    const c = ours ? world.characters[ours.targetId!]! : materialize(world, rng, where.planetId, where.sectorId);
    rivalRecruit(world, rng, houseId, c);
  } else if (pick === 'caige') {
    rivalCaige(world, rng, houseId, where);
  } else if (targetHouseId && world.houses[targetHouseId]) {
    const amount = 200 + rng.int(0, 6) * 50;
    world.economy.houses[houseId]!.boons.push({ id: `b${world.nextId++}`, label: `Trade deal with House ${world.houses[targetHouseId]!.name}`, flow: { othes: amount }, until: addCycles(world.date, CYCLES_PER_ORBIT * 2) });
    annal(world, houseId, `They struck a trade deal with House ${world.houses[targetHouseId]!.name}.`, targetHouseId === world.playerHouseId, undefined);
  }
}

// ---------------------------------------------------------------- each Phase

export function advanceGrowth(world: World, rng: Rng, phaseTurned: boolean): void {
  if (!phaseTurned) return;
  ensureGrowth(world);
  for (const h of Object.values(world.houses)) {
    births(world, rng, h.id);
    comingOfAge(world, h.id);
    if (h.id === world.playerHouseId) continue; // the player finds things by sending people out
    // Their own agents at work, beyond the missions we can see.
    const talent = 0.025 + h.standing.respect / 2000 + h.personality.intrigue * 0.02;
    if (rng.chance(talent)) {
      const home = world.planets[h.capitalPlanetId]!;
      const sector = rng.pick(home.sectors);
      rivalRecruit(world, rng, h.id, materialize(world, rng, home.id, sector.id));
    }
    if (rng.chance(0.012 + h.personality.aggression * 0.01)) rivalCaige(world, rng, h.id);
  }
}
