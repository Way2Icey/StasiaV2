// What happens at places: stations seized in war and taken back, outposts on the frontier and what the
// frontier sends against them, expeditions to the sites of the past, and the Virella, glimpsed and gone.
import { Rng } from './rng';
import { addEvents, choose, fireStage, type Ctx, type EventDef } from './events';
import { data, need, fmt, best } from './arckit';
import { addDeed, discover, makeRelic, type RelicKind } from './legacy';
import { CAPITAL_CLASSES, powerOf, shipLog, shipsOf, type CapitalShip } from './fleet';
import { atWar, makePlanet, warsOf } from './war';
import { econ, record } from './economy';
import { equipPower, shiftCredibility } from './standing';
import { logRecord } from './records';
import { assaultAccount } from './details';
import { displayName } from './names';
import { ensurePlaces, grievedSites, outpostFor, siteDefence, sitesOf, transferSite, type Site } from './places';
import { absoluteCycle, CYCLES_PER_ORBIT, CYCLES_PER_PHASE } from './time';
import type { Character, World } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const str = (c: Ctx, k: string) => String(c.arc?.data?.[k] ?? c.memo?.[k] ?? '');
const hn = (w: World, id: string) => w.houses[id]?.name ?? w.archon?.houses[id]?.name ?? id;

// ---------------------------------------------------------------- taking places

/** Ships that can go: ours, launched, in harbour, not away. */
export const shipsFree = (w: World, houseId: string): CapitalShip[] => shipsOf(w, houseId).filter((s) => !s.ready && !s.arrives && !s.crucible && s.duty === 'harbour' && s.condition >= 40);

export function cannotAssault(w: World, siteId: string, shipIds: string[]): string | null {
  const s = w.places?.sites[siteId];
  const P = w.playerHouseId;
  if (!s?.holdable || !s.holder) return 'Not a place that can be taken.';
  if (s.holder === P) return 'It is ours.';
  if (!atWar(w, P, s.holder)) return `We are not at war with House ${hn(w, s.holder)}.`;
  if (!shipIds.length) return 'Send at least one ship.';
  const free = new Set(shipsFree(w, P).map((x) => x.id));
  if (shipIds.some((id) => !free.has(id))) return 'Those ships are not ready to sail.';
  return null;
}

function assaultPower(w: World, houseId: string, ships: CapitalShip[]): number {
  return ships.reduce((t, s) => t + powerOf(w, s), 0) / 4 * equipPower(w, houseId);
}

/** Ships, and the troops they carry, go against a place. It falls or it holds. */
function resolveAssault(w: World, rng: Rng, attacker: string, s: Site, ships: CapitalShip[]): boolean {
  const P = w.playerHouseId;
  const atk = assaultPower(w, attacker, ships) * (0.8 + rng.next() * 0.4);
  const def = siteDefence(w, s) * (s.holder ? equipPower(w, s.holder) : 1) * (0.8 + rng.next() * 0.4);
  const won = atk > def;
  const holder = s.holder!;
  for (const sh of ships) {
    sh.condition = clamp(sh.condition - rng.int(won ? 4 : 12, won ? 14 : 32), 0, 100);
    shipLog(w, sh, won ? `Took ${s.name} from House ${hn(w, holder)}` : `Thrown back from ${s.name}`, won ? 4 : 1);
  }
  if (won) {
    transferSite(w, s, attacker, 'assault');
    const a = w.archon?.houses[attacker];
    if (a) a.prestige = clamp(a.prestige + 1, 0, 100);
    if (w.archon) { (w.archon.regard[holder] ??= {})[attacker] = clamp((w.archon.regard[holder]?.[attacker] ?? 0) - 25, -100, 100); }
  } else s.garrison = Math.max(200, Math.round(s.garrison * 0.85));
  if (attacker === P || holder === P) logRecord(w, {
    kind: 'world', type: 'fight', severity: 3,
    text: won ? `${s.name} falls to House ${hn(w, attacker)}: ${ships.map((x) => `the ${x.name}`).join(', ')} broke its guns and put troops aboard.` : `House ${hn(w, attacker)}'s assault on ${s.name} is thrown back.`,
    detail: won ? `House ${hn(w, holder)} will not forget where it was taken, or by whom.` : undefined, houseIds: [attacker, holder].filter((x) => w.houses[x]),
    who: ships.flatMap((x) => (x.captainId ? [{ id: x.captainId, part: `captain of the ${x.name}` }] : [])),
    account: assaultAccount(w, rng, s.name, `House ${hn(w, holder)}`, ships.map((x) => ({ name: x.name, captainId: x.captainId ?? null })), won, s.garrison),
  });
  return won;
}

export function assaultSite(input: World, siteId: string, shipIds: string[]): World {
  const w = structuredClone(input);
  const why = cannotAssault(w, siteId, shipIds);
  if (why) throw new Error(why);
  const rng = new Rng(w.rng);
  const won = resolveAssault(w, rng, w.playerHouseId, w.places!.sites[siteId]!, shipIds.map((id) => w.fleet.ships[id]!));
  if (won) for (const id of shipIds) { const cap = w.fleet.ships[id]!.captainId; if (cap) addDeed(w, cap, 'battle', `Took ${w.places!.sites[siteId]!.name} in war`, 2); }
  w.rng = rng.state;
  return w;
}

// ---------------------------------------------------------------- the frontier

export const CLAIM_COST = { othes: 12000, components: 60 };
export const SETTLE_COST = 50000;

export function cannotClaim(w: World, wildId: string): string | null {
  const wild = w.archon?.frontier[wildId];
  if (!wild || wild.claimedBy) return 'That world is not free.';
  const e = econ(w, w.playerHouseId);
  if (e.stock.othes < CLAIM_COST.othes) return `Needs ${fmt(CLAIM_COST.othes)} othes.`;
  if (e.stock.components < CLAIM_COST.components) return `Needs ${CLAIM_COST.components} components.`;
  if (sitesOf(w, w.playerHouseId).filter((s) => s.kind === 'outpost').length >= 4) return 'Four outposts is as far as the house can reach.';
  return null;
}

export function claimWild(input: World, wildId: string): World {
  const w = structuredClone(input);
  const why = cannotClaim(w, wildId);
  if (why) throw new Error(why);
  const P = w.playerHouseId;
  const wild = w.archon!.frontier[wildId]!;
  record(w, P, { resource: 'othes', amount: -CLAIM_COST.othes, label: `An outpost on ${wild.name}`, kind: 'develop' });
  record(w, P, { resource: 'components', amount: -CLAIM_COST.components, label: `An outpost on ${wild.name}`, kind: 'develop' });
  wild.claimedBy = P; wild.claimedYear = w.date.year;
  const s = outpostFor(w, wild, P);
  logRecord(w, { kind: 'world', type: 'world', severity: 2, text: `Our flag goes up over ${wild.name}, in ${wild.region}. ${s.name} is ours, for as long as we can keep it.`, effects: [`−${fmt(CLAIM_COST.othes)} othes`, `−${CLAIM_COST.components} components`] });
  return w;
}

export function cannotSettle(w: World, siteId: string): string | null {
  const s = w.places?.sites[siteId];
  if (!s || s.kind !== 'outpost' || s.holder !== w.playerHouseId) return 'Only an outpost of ours can be settled.';
  if (w.date.year - (s.since ?? w.date.year) < 3) return 'An outpost must be held three years before people will settle it.';
  if (econ(w, w.playerHouseId).stock.othes < SETTLE_COST) return `Needs ${fmt(SETTLE_COST)} othes.`;
  return null;
}

/** An outpost becomes a world of the house: people settle, and it is governed like the rest. */
export function settleOutpost(input: World, siteId: string): World {
  const w = structuredClone(input);
  const why = cannotSettle(w, siteId);
  if (why) throw new Error(why);
  const P = w.playerHouseId;
  const s = w.places!.sites[siteId]!;
  const wild = s.wildId ? w.archon?.frontier[s.wildId] : undefined;
  record(w, P, { resource: 'othes', amount: -SETTLE_COST, label: `Settling ${wild?.name ?? s.name}`, kind: 'develop' });
  const rng = new Rng(w.rng);
  const sp = w.characters[w.houses[P]!.rulerId!]?.species ?? 'human';
  makePlanet(w, rng, P, wild?.name ?? s.name.replace(/ Outpost$/, ''), `Settled from an outpost in ${w.date.year}. ${wild?.note ?? ''}`, { [sp]: 80, human: 20 } as never);
  w.rng = rng.state;
  if (wild) wild.capital = 'settled';
  delete w.places!.sites[siteId];
  const a = w.archon?.houses[P];
  if (a) { a.worlds += 1; a.prestige = clamp(a.prestige + 2, 0, 100); }
  logRecord(w, { kind: 'world', type: 'world', severity: 3, text: `${wild?.name ?? s.name} is settled: the first families land, and the house has a new world.`, effects: [`−${fmt(SETTLE_COST)} othes`, 'Standing +2'] });
  return w;
}

// ---------------------------------------------------------------- expeditions to the past

export function cannotExplore(w: World, siteId: string, personId: string): string | null {
  const s = w.places?.sites[siteId];
  if (!s || s.kind !== 'ruin' || !s.known) return 'Not a site we can reach.';
  if (s.explored) return 'Explored already.';
  if (w.places!.expeditions.some((x) => x.siteId === siteId)) return 'An expedition is already there.';
  const c = w.characters[personId];
  if (!c?.alive || c.houseId !== w.playerHouseId) return 'Not one of ours.';
  if (w.places!.expeditions.some((x) => x.personId === personId)) return 'Already away.';
  if (econ(w, w.playerHouseId).stock.othes < 3000) return 'Needs 3,000 othes.';
  return null;
}

export function sendExpedition(input: World, siteId: string, personId: string): World {
  const w = structuredClone(input);
  const why = cannotExplore(w, siteId, personId);
  if (why) throw new Error(why);
  record(w, w.playerHouseId, { resource: 'othes', amount: -3000, label: `An expedition to ${w.places!.sites[siteId]!.name}`, kind: 'mission' });
  w.places!.expeditions.push({ siteId, personId, returns: absoluteCycle(w.date) + CYCLES_PER_ORBIT * 2 });
  const c = w.characters[personId]!;
  c.flags.push({ id: 'expedition', since: w.date, detail: `on an expedition to ${w.places!.sites[siteId]!.name}` });
  return w;
}

const RUIN_RELIC: RelicKind[] = ['shardsaint', 'keepring', 'banner', 'warNavisium', 'echoCoin', 'stationLog', 'writ'];

// ---------------------------------------------------------------- events

const evs: EventDef[] = [
  {
    id: 'place:survey', title: 'Surveyors return', category: 'Realm', trigger: 'home', weight: 0, stage: true,
    setup: (c) => { const s = Object.values(c.world.places?.sites ?? {}).filter((x) => !x.known && (x.kind === 'ruin' || (x.holdable && x.holder !== c.house))); if (!s.length) return false; const x = c.rng.pick(s); data(c).site = x.id; return true; },
    text: (c) => { const s = c.world.places!.sites[str(c, 'site')]!; return `A survey crew back from ${s.region} has charted something the house did not know of: ${s.name}. ${s.note}${s.holder ? ` It is held by House ${hn(c.world, s.holder)}.` : ''}`; },
    options: [{ label: 'Mark it on the charts', resolve: (c) => { const s = c.world.places!.sites[str(c, 'site')]; if (s) s.known = true; } }],
    fallback: 0,
  },
  {
    id: 'place:return', title: 'The expedition returns', category: 'Realm', trigger: 'home', weight: 0, stage: true, urgent: false,
    setup: (c) => { const x = c.world.places?.expeditions.find((e) => e.returns <= absoluteCycle(c.world.date)); if (!x) return false; data(c).site = x.siteId; c.world.places!.expeditions = c.world.places!.expeditions.filter((e) => e !== x); const p = c.world.characters[x.personId]; if (p) p.flags = p.flags.filter((f) => f.id !== 'expedition'); if (!p?.alive) return false; const s = c.world.places!.sites[x.siteId]; if (s) s.explored = true;
      // What they found, decided on their return: a fragment of the past, a relic, or nothing but cost.
      const skill = (p.stats.perception + p.stats.intellect + p.stats.valor) / 3;
      const r = c.rng.next() + (skill - 10) / 25;
      data(c).found = r > 0.75 ? 'both' : r > 0.45 ? 'relic' : r > 0.2 ? 'fragment' : r > 0.08 ? 'nothing' : 'hurt';
      return choose(c, { personId: p.id }); },
    text: (c) => {
      const s = c.world.places!.sites[str(c, 'site')]!; const n = displayName(c.person!.name);
      return ({ both: `${n} is back from ${s.name}, with more than anyone hoped: something to read, and something to keep.`, relic: `${n} is back from ${s.name}, carrying something wrapped in a crew-blanket.`, fragment: `${n} is back from ${s.name} with records nobody has read in a thousand years.`, nothing: `${n} is back from ${s.name}. There was nothing there that anyone could carry, or nothing that would let them.`, hurt: `${n} is back from ${s.name}, carried off the shuttle. Something there did not want them.` } as Record<string, string>)[str(c, 'found')]!;
    },
    options: [{ label: 'See what was brought back', resolve: (c) => {
      const s = c.world.places!.sites[str(c, 'site')]!; const f = str(c, 'found'); const p = c.person!;
      if (f === 'relic' || f === 'both') { const r = makeRelic(c.world, c.rng.pick(RUIN_RELIC), { origin: `brought back from ${s.name}`, rng: c.rng }); c.fx.say(r.name); }
      if (f === 'fragment' || f === 'both') { const fr = discover(c.world, `an expedition to ${s.name}`, { rng: c.rng }); if (fr) c.fx.say(`For the Archive: "${fr.title}"`); }
      if (f !== 'hurt' && f !== 'nothing') addDeed(c.world, p.id, 'discovery', `Led the expedition to ${s.name}`, 2);
      if (f === 'hurt') c.fx.wound(p);
    } }],
    fallback: 0,
  },
  {
    id: 'place:virella', title: 'The Virella is sighted', category: 'Realm', trigger: 'home', weight: 0, stage: true, life: 60,
    setup: (c) => { const v = Object.values(c.world.places?.sites ?? {}).find((x) => x.kind === 'moving'); if (!v) return false; v.known = true; v.sightedUntil = absoluteCycle(c.world.date) + CYCLES_PER_ORBIT; data(c).where = c.rng.pick(['the Neutral Drift Belt', 'the Ulamar Lanes', 'the edge of the Silent Belt', 'a dead system past the Sector Nine relay']); return true; },
    text: (c) => `Word through the Docks: the Virella has been seen at ${str(c, 'where')}. She will be gone within the Orbit, and nobody will see her there again this year. Breakline will deal with anyone who comes aboard and keeps the law of the ship: no blood on the Virella. They will not sell Caiges. Everything else has a price.`,
    options: [
      { label: 'Have a debt quietly settled', hint: '6,000 othes; our credibility mends', available: need(6000), resolve: (c) => { c.fx.othes(-6000); shiftCredibility(c.world, c.house, 12); c.fx.say('The Ghost Ledger takes the debt. Ours looks cleaner for it'); } },
      { label: 'Get one of ours out', hint: '8,000 othes: a captive of ours, extracted', available: (c) => (!theirCaptive(c.world, c.house) ? 'No one of ours is held.' : need(8000)(c)), resolve: (c) => { const cap = theirCaptive(c.world, c.house)!; c.fx.othes(-8000); extract(c.world, cap); c.fx.say(`${displayName(cap.name)} is moved beyond traceable space, and back home`); } },
      { label: 'Buy what they know about a house', hint: '3,000 othes', available: need(3000), resolve: (c) => { const h = rivalOf(c); c.fx.othes(-3000).learnHouse(h, 25, false); c.fx.say(`A packet of what Breakline knows about House ${hn(c.world, h ?? '')}`); } },
      { label: 'Stay away from her', resolve: () => {} },
    ],
    fallback: 3,
  },
  {
    id: 'place:outpost', title: 'Trouble at an outpost', category: 'Realm', trigger: 'home', weight: 0, stage: true, life: 60,
    setup: (c) => {
      const s = sitesOf(c.world, c.house).filter((x) => x.kind === 'outpost');
      if (!s.length) return false;
      const x = c.rng.pick(s);
      const wild = x.wildId ? c.world.archon?.frontier[x.wildId] : undefined;
      data(c).site = x.id; data(c).kind = wild?.hazard && wild.hazard !== 'none' ? wild.hazard : c.rng.pick(['corsairs', 'breakline', 'quakes']);
      return true;
    },
    text: (c) => {
      const s = c.world.places!.sites[str(c, 'site')]!;
      return ({ corsairs: `Corsairs have come down on ${s.name}: three ships, demanding the stores and a tithe every Orbit after.`, breakline: `A Breakline crew has docked at ${s.name} and is paying the garrison to look the other way while they move cargo through. Some of the garrison already are.`, quakes: `The ground under ${s.name} is moving. Two shafts have collapsed and the engineers want to pull out.`, drift: `The garrison at ${s.name} are dreaming the same dream: a wide river, everyone in it walking the same way. Two have walked off into the wastes.`, lurek: `Something at ${s.name} has been wearing the faces of the dead. The garrison will not stand night watches alone.`, warwreck: `A crew digging at ${s.name} has hit an unexploded shard cannon emplacement from the old war.` } as Record<string, string>)[str(c, 'kind')] ?? `Trouble at ${s.name}.`;
    },
    options: [
      { label: 'Send soldiers, and hold it', hint: 'othes and lives', resolve: (c) => { const s = c.world.places!.sites[str(c, 'site')]!; c.fx.othes(-2000); s.garrison += 300; s.defence += 1; c.fx.say(`${s.name} is held`); } },
      { label: 'Pay them off', hint: 'the cheapest way, this time', resolve: (c) => { c.fx.othes(-1200).honour(-1).say('They take the money, and will remember the way'); } },
      { label: 'Abandon it', resolve: (c) => { const s = c.world.places!.sites[str(c, 'site')]!; const wild = s.wildId ? c.world.archon?.frontier[s.wildId] : undefined; if (wild) { delete wild.claimedBy; delete wild.claimedYear; } delete c.world.places!.sites[s.id]; c.fx.respect(-1).say(`${s.name} is abandoned`); } },
    ],
    fallback: 1,
  },
  {
    id: 'place:lost', title: 'A place of ours is taken', category: 'Realm', trigger: 'home', weight: 0, stage: true, urgent: true,
    setup: (c) => { const s = Object.values(c.world.places?.sites ?? {}).find((x) => x.takenFrom?.houseId === c.house && x.takenFrom.year === c.world.date.year && x.holder !== c.house); if (!s) return false; data(c).site = s.id; return choose(c, { otherHouseId: s.holder ?? undefined }); },
    text: (c) => { const s = c.world.places!.sites[str(c, 'site')]!; return `${s.name} has fallen to House ${hn(c.world, s.holder!)}. The garrison that survived is being held aboard; the rest are dead. The house expects us to take it back.`; },
    options: [
      { label: 'Swear to take it back', resolve: (c) => { c.fx.honour(1).say('It will be taken back') ; } },
      { label: 'Let it go', resolve: (c) => { c.fx.respect(-2).say('The house will not forget that we let it go'); } },
    ],
    fallback: 0,
  },
];

addEvents(evs);

function theirCaptive(w: World, P: string): Character | undefined {
  const cap = Object.values(w.captives ?? {}).find((x) => x.heldBy !== P && w.characters[x.characterId]?.houseId === P && w.characters[x.characterId]?.alive);
  return cap ? w.characters[cap.characterId] : undefined;
}
function extract(w: World, c: Character): void {
  c.flags = c.flags.filter((f) => f.id !== 'captive' && f.id !== 'missing');
  const home = w.planets[w.houses[c.houseId]?.capitalPlanetId ?? ''];
  if (home) c.location = { planetId: home.id, sectorId: home.sectors[0]!.id };
  delete w.captives[c.id];
}
function rivalOf(c: Ctx): string | undefined {
  return Object.keys(c.world.houses).filter((h) => h !== c.house).sort((a, b) => (c.world.archon?.regard[c.house]?.[a] ?? 0) - (c.world.archon?.regard[c.house]?.[b] ?? 0))[0];
}

// ---------------------------------------------------------------- the passage of time

/** Each Orbit: houses at war go after each other's places; expeditions come home. Each year: surveys, the Virella. */
export function advancePlaces(w: World, rng: Rng, t: { orbits: number; years: number }): void {
  ensurePlaces(w);
  if (t.orbits > 0) {
    if (w.places!.expeditions.some((e) => e.returns <= absoluteCycle(w.date))) fireStage(w, rng, 'place:return', {});
    // A house at war goes after the other side's places, and above all those it lost.
    for (const h of Object.keys(w.houses)) {
      if (h === w.playerHouseId) continue;
      for (const war of warsOf(w, h)) {
        if (!rng.chance(0.08)) continue;
        const enemies = [war.attacker, war.defender, ...war.attackers, ...war.defenders].filter((x) => x !== h && atWar(w, h, x));
        const targets = Object.values(w.places!.sites).filter((s) => s.holdable && s.holder && enemies.includes(s.holder)).sort((a, b) => (b.takenFrom?.houseId === h ? 1 : 0) - (a.takenFrom?.houseId === h ? 1 : 0));
        const s = targets[0];
        const ships = shipsOf(w, h).filter((x) => !x.ready && !x.arrives && x.condition >= 50).slice(0, 3);
        if (!s || !ships.length) continue;
        const was = s.holder;
        const won = resolveAssault(w, rng, h, s, ships);
        if (won && was === w.playerHouseId) fireStage(w, rng, 'place:lost', {});
      }
    }
    if (rng.chance(0.06)) fireStage(w, rng, 'place:outpost', {});
  }
  if (t.years > 0) {
    if (rng.chance(0.35)) fireStage(w, rng, 'place:survey', {});
    if (rng.chance(0.18)) fireStage(w, rng, 'place:virella', {});
    // Garrisons with nobody to pay them drift home.
    for (const s of Object.values(w.places!.sites)) if (s.holder && !w.houses[s.holder] && !w.archon?.houses[s.holder]) s.holder = null;
  }
  void CYCLES_PER_PHASE; void CAPITAL_CLASSES; void best; void grievedSites;
}
