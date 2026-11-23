// Other tellings of the common events, so the same decision does not read the same way twice: stakes
// scaled to what the house can bear, real people drawn from the world, turns that only come in war, in a
// crash or a shortage, and choices only some rulers and some people would think of (a trait, a thread).
import { addBranches, addVariants, choose, type Ctx, type EventOption } from './events';
import { econ, phaseLedger, heldSectors } from './economy';
import { full, nm, seat, highroy, athome, knights, stranger, H, need, data } from './arckit';
import { warsOf } from './war';
import { shockMult, crashOn } from './arcs_economy';
import { regardOf } from './archon';
import { openThreads, type ThreadKind } from './storystate';
import { takeIntoHouse } from './training';
import { shiftOpinion } from './relationships';
import { RESOURCE_LABEL, type Good } from '../data/economy';
import type { Character } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

/** What the house takes in a Phase, before it spends anything. */
function income(c: Ctx): number {
  return phaseLedger(c.world, c.house).filter((l) => l.resource === 'othes' && l.amount > 0).reduce((t, l) => t + l.amount, 0);
}
/** A sum that means as much to this house as `base` means to a middling one. */
export function scaled(c: Ctx, base: number): number {
  return Math.max(50, Math.round((base * clamp(income(c) / 1400, 0.6, 3.5)) / 50) * 50);
}
const amt = (c: Ctx, k = 'amt') => Number(c.arc?.data?.[k] ?? c.memo?.[k] ?? 0);
const has = (x: Character | undefined, trait: string) => !!x?.traits.some((t) => t.id === trait);
const threadOn = (c: Ctx, x: Character | undefined, kind: ThreadKind) => (x ? openThreads(c.world, x.id, kind)[0] : undefined);
const atWar = (c: Ctx) => warsOf(c.world, c.house).length > 0;
const at = (c: Ctx, k: string) => c.world.characters[String(c.arc?.data?.[k] ?? c.memo?.[k] ?? '')];

// ---------------------------------------------------------------- court

addVariants('dockworkers', [
  {
    id: 'strike', title: 'The docks stand still', weight: 1.2,
    when: (c) => (c.sector?.unrest ?? 0) >= 15,
    stake: (c) => { data(c).amt = scaled(c, 500); },
    text: (c) => `The dockworkers of ${c.sector?.name} have downed tools. Ships hang in the docking rings unloaded, and every day of it costs the house. Their price is ${fmt(amt(c))} othes and a better share.`,
    options: [
      { label: 'Meet their price', labelFor: (c) => `Meet their price (${fmt(amt(c))})`, available: (c) => need(amt(c))(c), resolve: (c) => { c.fx.othes(-amt(c)).unrest(c.sector, -12).honour(1); } },
      { label: 'Break the strike', hint: 'the Grand Master and the knights', resolve: (c) => { c.fx.dread(3).unrest(c.sector, 4).honour(-2); if (c.rng.chance(0.3)) c.fx.wound(seat(c, 'grandMaster')); } },
      { label: 'Bring in hands from another world', hint: 'Steward', check: { who: (c) => seat(c, 'steward'), stats: ['stewardship', 'negotiation'], dc: 12 },
        resolve: (c, ok) => { if (ok) c.fx.othes(-Math.round(amt(c) / 3)).unrest(c.sector, 5).say('The ships move again; the dockworkers are bitter'); else c.fx.unrest(c.sector, 10).say('The new hands are turned back at the gates'); } },
    ],
  },
  {
    id: 'warwork', title: 'Loading for the war',
    when: atWar,
    stake: (c) => { data(c).amt = scaled(c, 250); },
    text: (c) => `The dockworkers of ${c.sector?.name} are loading the war fleets day and night. They ask for war pay, ${fmt(amt(c))} othes, and say so in front of the troop ships.`,
    options: [
      { label: 'Pay them for the war', labelFor: (c) => `War pay (${fmt(amt(c))})`, available: (c) => need(amt(c))(c), resolve: (c) => { c.fx.othes(-amt(c)).unrest(c.sector, -8).respect(1); } },
      { label: 'Promise a share of what we win', resolve: (c) => { c.fx.unrest(c.sector, -4).say('They will hold us to it'); } },
      { label: 'Refuse: there is a war on', resolve: (c) => { c.fx.unrest(c.sector, 7); } },
    ],
  },
]);

addVariants('feast', [
  {
    id: 'enemies', title: 'A feast among enemies',
    when: (c) => !!c.other && regardOf(c.world, c.other, c.house) < -15,
    text: (c) => `${H(c, c.other)} invites the Highroy to a feast. They have no love for us, and everyone knows it. Some think it is a peace offering; the Spymaster thinks it is a trap.`,
    extra: [
      { label: 'Go, with a taster and guards', hint: 'Spymaster', check: { who: (c) => seat(c, 'spymaster'), stats: ['perception', 'intrigue'], dc: 12 },
        resolve: (c, ok) => { if (ok) c.fx.regard(c.other, 8).respect(2).say('Nothing in the wine; a long night of hard courtesy'); else { c.fx.regard(c.other, -4).say('Something in the wine'); c.fx.wound(highroy(c)); } } },
    ],
  },
  {
    id: 'display', title: 'A feast of display',
    when: (c) => !!c.other && (c.world.houses[c.other]?.standing.respect ?? 0) > (c.world.houses[c.house]?.standing.respect ?? 0),
    stake: (c) => { data(c).amt = scaled(c, 400); },
    text: (c) => `${H(c, c.other)} is throwing a feast to show the Archon what it is worth. Every guest is expected to bring a gift, and the gifts will be compared. Anything under ${fmt(amt(c))} othes would be noticed.`,
    extra: [
      { label: 'Bring a gift to match', labelFor: (c) => `Bring a gift (${fmt(amt(c))})`, available: (c) => need(amt(c))(c), resolve: (c) => { c.fx.othes(-amt(c)).regard(c.other, 10).respect(2); } },
    ],
  },
]);

addVariants('boundary', [
  {
    id: 'kin', title: 'A knight\'s kin',
    when: (c) => knights(c).length > 0,
    stake: (c) => { const k = c.rng.pick(knights(c)); data(c).kin = k.id; },
    text: (c) => `Two families in ${c.sector?.name} quarrel over where one holding ends and the next begins. One of them is kin to ${full(at(c, 'kin'))}, who has said nothing, and is watching to see what the Highroy does.`,
    options: [
      { label: 'Judge it on the law', check: { who: highroy, stats: ['law', 'insight'], dc: 11 },
        resolve: (c, ok) => { if (ok) c.fx.honour(3).unrest(c.sector, -3); else c.fx.unrest(c.sector, 4); if (c.rng.chance(0.5)) { c.fx.mood(at(c, 'kin'), -6).say(`The ruling goes against ${nm(at(c, 'kin'))}'s kin`); } } },
      { label: 'Find for the knight\'s kin', resolve: (c) => { c.fx.mood(at(c, 'kin'), 8).honour(-2).unrest(c.sector, 3); } },
      { label: 'Leave them to it', resolve: (c) => { c.fx.unrest(c.sector, 4).mood(at(c, 'kin'), -2); } },
    ],
  },
]);

addVariants('till', [
  {
    id: 'big', title: 'A hole in the ledgers',
    when: (c) => (c.person?.hidden.greed ?? 0) >= 14,
    stake: (c) => { data(c).amt = scaled(c, 700); },
    text: (c) => `This is no skim. ${fmt(amt(c))} othes are missing over two Orbits, and every false entry is in the hand of ${full(c.person)}'s clerks.`,
    options: [
      { label: 'Have the Steward dig', check: { who: (c) => seat(c, 'steward'), stats: ['stewardship', 'insight'], dc: 12 },
        resolve: (c, ok) => { if (ok) c.fx.othes(Math.round(amt(c) * 0.7)).learnOf(c.person, 20).mood(c.person, -8).thread(c.person, 'secret', 'Caught with a hand deep in the house accounts'); else c.fx.say('The clerks burned the books before we got there'); } },
      { label: 'Make them pay it back openly', resolve: (c) => { c.fx.othes(Math.round(amt(c) / 2)).mood(c.person, -14).dread(2).honour(1).thread(c.person, 'grudge', 'Shamed before the court over the ledgers'); } },
      { label: 'Let it go', resolve: (c) => { c.fx.othes(-Math.min(Math.round(amt(c) / 3), Math.max(0, econ(c.world, c.house).stock.othes))); } },
    ],
  },
]);

addVariants('riot', [
  {
    id: 'war', title: 'Bread and war',
    when: atWar,
    text: (c) => `${c.sector?.name} has boiled over: the war levies, the press gangs, the price of bread. The crowd is chanting the names of the dead.`,
    extra: [
      { label: 'Open the war stores to them', hint: '−80 provisions', available: (c) => (econ(c.world, c.house).stock.provisions >= 80 ? null : 'Needs 80 provisions'), resolve: (c) => { c.fx.good('provisions', -80).unrest(c.sector, -12).honour(1); } },
    ],
  },
  {
    id: 'bread', title: 'The price of bread',
    when: (c) => shockMult(c.world, 'provisions') > 1.2,
    text: (c) => `Provisions on the Exchange cost half again what they did, and ${c.sector?.name} is hungry. The crowd has stopped a grain barge at the docks.`,
    extra: [
      { label: 'Sell our stores at the old price', hint: '−60 provisions, a little coin', available: (c) => (econ(c.world, c.house).stock.provisions >= 60 ? null : 'Needs 60 provisions'), resolve: (c) => { c.fx.good('provisions', -60).othes(Math.round(60 * (c.world.economy.market.provisions.price * 0.6))).unrest(c.sector, -10).respect(1); } },
    ],
  },
]);

addVariants('foundry', [
  {
    id: 'named', title: 'The foundry speaker',
    stake: (c) => { if (!c.sector) return; const p = stranger(c, { sectorId: c.sector.id }); p.role = 'Foundry speaker'; data(c).spk = p.id; },
    text: (c) => `${full(at(c, 'spk'))}, a foundry worker in ${c.sector?.name}, has started speaking for the workers, and they listen. She is sharp, and she is not afraid of us.`,
    options: [
      { label: 'Hear her out', resolve: (c) => { c.fx.unrest(c.sector, -4).respect(-1); } },
      { label: 'Bring her into the household', hint: '−100 othes', available: need(100), resolve: (c) => { const p = at(c, 'spk'); if (p) takeIntoHouse(c.world, p, 'Clerk'); c.fx.othes(-100).unrest(c.sector, -6).say(`${nm(p)} joins the household`); } },
      { label: 'Silence her', resolve: (c) => { c.fx.dread(2).unrest(c.sector, 3).honour(-1); } },
    ],
  },
]);

addVariants('saviour', [
  {
    id: 'foreign', title: 'A saviour from a rival house',
    stake: (c) => { const r = Object.keys(c.world.houses).filter((h) => h !== c.house && c.world.houses[h]?.capitalPlanetId); if (!r.length) return; const h = c.rng.pick(r); const p = stranger(c, { planetId: c.world.houses[h]!.capitalPlanetId }); data(c).sav = p.id; choose(c, { otherHouseId: h }); },
    when: (c) => Object.keys(c.world.houses).length > 1,
    text: (c) => `A stranger pulled ${full(c.person)} out of a fire in the lower quarter. The house has found him: ${full(at(c, 'sav'))}, a sworn man of ${H(c, c.other)}, who should not have been in our city at all.`,
    options: [
      { label: 'Offer him a place with us', resolve: (c) => { const p = at(c, 'sav'); if (p) takeIntoHouse(c.world, p, 'Man-at-arms'); c.fx.regard(c.other, -3).mood(c.person, 3).say(`${nm(p)} takes our colours`); } },
      { label: 'Send him home with thanks', resolve: (c) => { c.fx.regard(c.other, 6).honour(2).mood(c.person, 1); } },
      { label: 'Ask what he was doing here', hint: 'Spymaster', check: { who: (c) => seat(c, 'spymaster'), stats: ['insight', 'intrigue'], dc: 12 },
        resolve: (c, ok) => { if (ok) c.fx.learnHouse(c.other, 15).say('He was watching us; he saved a life anyway'); else c.fx.regard(c.other, -4).say('He says nothing, and goes'); } },
    ],
  },
]);

addVariants('claim', [
  {
    id: 'true', title: 'A claim of blood', weight: 0.8,
    stake: (c) => { const p = stranger(c, { young: true }); data(c).kid = p.id; const dead = Object.values(c.world.characters).filter((x) => !x.alive && x.houseId === c.house); if (dead.length) data(c).dead = c.rng.pick(dead).id; },
    text: (c) => `${full(at(c, 'kid'))}, a youngster from the lower city, claims to be the unacknowledged child of ${at(c, 'dead') ? full(at(c, 'dead')) : 'a late member of the house'}. The papers look real. So does the face.`,
    options: [
      { label: 'Have the Spymaster check', check: { who: (c) => seat(c, 'spymaster'), stats: ['insight', 'intrigue'], dc: 11 },
        resolve: (c, ok) => { if (ok) { const p = at(c, 'kid'); if (p) takeIntoHouse(c.world, p, 'Youngling'); c.fx.honour(1).say(`It is true. ${nm(p)} is taken into the house`); } else c.fx.say('Nothing could be proven either way').respect(-1); } },
      { label: 'Recognise them', resolve: (c) => { const p = at(c, 'kid'); if (p) takeIntoHouse(c.world, p, 'Youngling'); c.fx.honour(1).respect(-1).say(`${nm(p)} is one of us now`); } },
      { label: 'Turn them away', resolve: (c) => { c.fx.dread(1); } },
    ],
  },
]);

addVariants('ambition', [
  {
    id: 'courted', title: 'Courted from outside',
    when: (c) => Object.keys(c.world.houses).length > 1,
    stake: (c) => { const r = Object.keys(c.world.houses).filter((h) => h !== c.house); choose(c, { otherHouseId: c.rng.pick(r) }); data(c).amt = scaled(c, 400); },
    text: (c) => `${full(c.person)} has been dining with envoys of ${H(c, c.other)}, who are said to have offered a place, and a title we have not given.`,
    options: [
      { label: 'Outbid them', labelFor: (c) => `Give them more (${fmt(amt(c))})`, available: (c) => need(amt(c))(c), resolve: (c) => { c.fx.othes(-amt(c)).mood(c.person, 12); } },
      { label: 'Rebuke them before the court', resolve: (c) => { c.fx.mood(c.person, -10).dread(1).regard(c.other, -3).thread(c.person, 'grudge', 'Rebuked before the court over the envoys'); } },
      { label: 'Have them watched', resolve: (c) => { c.fx.learnOf(c.person, 20).learnHouse(c.other, 5); } },
    ],
  },
]);

addVariants('health', [
  {
    id: 'vow', title: 'One last thing',
    when: (c) => !!threadOn(c, c.person, 'vow'),
    text: (c) => `${full(c.person)} is failing, and knows it. They ask for one thing: to keep the vow they made (${threadOn(c, c.person, 'vow')?.text.toLowerCase() ?? 'an old promise'}) before the end.`,
    extra: [
      { label: 'Let them keep it', hint: 'one last ride', resolve: (c) => { c.fx.mood(c.person, 15).respect(2).honour(1); if (c.person) c.person.lifespan = Math.max(0, c.person.lifespan - 1); c.fx.say('They go, and the court watches them go'); } },
    ],
  },
]);

// ---------------------------------------------------------------- intrigue

addVariants('blackmail', [
  {
    id: 'secret', title: 'They know',
    when: (c) => !!threadOn(c, c.person, 'secret'),
    stake: (c) => { data(c).amt = scaled(c, 600); },
    text: (c) => `A note arrives, and it is not a bluff: the writer knows ${full(c.person)}'s secret (${threadOn(c, c.person, 'secret')?.text.toLowerCase() ?? 'the one we kept'}). ${fmt(amt(c))} othes, or the city knows by the next Phase.`,
    options: [
      { label: 'Pay', labelFor: (c) => `Pay (${fmt(amt(c))})`, available: (c) => need(amt(c))(c), resolve: (c) => { c.fx.othes(-amt(c)); }, then: (c) => (c.rng.chance(0.8) ? { next: 'blackmail2', after: c.rng.int(40, 70) } : null) },
      { label: 'Hunt the writer', check: { who: (c) => seat(c, 'spymaster'), stats: ['intrigue', 'perception'], dc: 13 },
        resolve: (c, ok) => { if (ok) c.fx.dread(2).say('The writer is found and silenced'); else c.fx.respect(-5).mood(c.person, -8); } },
      { label: 'Let them talk', resolve: (c) => { c.fx.respect(-5).mood(c.person, -8); } },
    ],
  },
  {
    id: 'scaled', title: 'Blackmail',
    stake: (c) => { data(c).amt = scaled(c, 300); },
    text: (c) => `A note arrives: ${fmt(amt(c))} othes, or the city learns what ${full(c.person)} did last Orbit.`,
    options: [
      { label: 'Pay', labelFor: (c) => `Pay (${fmt(amt(c))})`, available: (c) => need(amt(c))(c), resolve: (c) => { c.fx.othes(-amt(c)); }, then: (c) => (c.rng.chance(0.7) ? { next: 'blackmail2', after: c.rng.int(40, 70) } : null) },
      { label: 'Hunt the writer', check: { who: (c) => seat(c, 'spymaster'), stats: ['intrigue', 'perception'], dc: 12 },
        resolve: (c, ok) => { if (ok) c.fx.dread(2).say('The writer is found and silenced'); else c.fx.respect(-3).mood(c.person, -5); } },
      { label: 'Let them talk', resolve: (c) => { c.fx.respect(-3).mood(c.person, -5); } },
    ],
  },
]);

addVariants('informant', [
  {
    id: 'enemy', title: 'A servant from the enemy\'s house',
    when: (c) => warsOf(c.world, c.house).some((w) => [w.attacker, w.defender, ...w.attackers, ...w.defenders].includes(c.other ?? '')),
    stake: (c) => { data(c).amt = scaled(c, 400); },
    text: (c) => `A servant of ${H(c, c.other)}, the house we are at war with, offers to tell us where their forces will move, for ${fmt(amt(c))} othes.`,
    options: [
      { label: 'Pay', labelFor: (c) => `Pay (${fmt(amt(c))})`, available: (c) => need(amt(c))(c), resolve: (c) => { c.fx.othes(-amt(c)).learnHouse(c.other, 30); const w = warsOf(c.world, c.house)[0]; if (w) { w.score += (w.attacker === c.house || w.attackers.includes(c.house) ? 1 : -1) * 6; c.fx.say('Their next move is known to us'); } } },
      { label: 'Haggle', check: { who: (c) => seat(c, 'spymaster'), stats: ['negotiation', 'intrigue'], dc: 12 },
        resolve: (c, ok) => { if (ok) c.fx.othes(-Math.round(amt(c) / 2)).learnHouse(c.other, 25); else c.fx.say('The servant walks'); } },
      { label: 'Refuse', resolve: (c) => { c.fx.say('Nothing gained'); } },
    ],
  },
]);

addVariants('defector', [
  {
    id: 'kin', title: 'A defector with a name we know',
    when: (c) => athome(c).length > 0,
    stake: (c) => { const k = c.rng.pick(athome(c)); choose(c, { secondId: k.id }); },
    text: (c) => `A courtier of ${H(c, c.other)} is at the gate, asking for shelter and offering everything he knows. He asks for ${full(c.second)} by name, and says they once saved his life.`,
    extra: [
      { label: 'Let ' + 'our own vouch for him', labelFor: (c) => `Let ${nm(c.second)} vouch for him`, check: { who: (c) => c.second, stats: ['insight', 'diplomacy'], dc: 11 },
        resolve: (c, ok) => { if (ok) c.fx.learnHouse(c.other, 30).regard(c.other, -8).mood(c.second, 4); else c.fx.learnHouse(c.other, 10).mood(c.second, -4).say('He was not what he seemed'); } },
    ],
  },
]);

// ---------------------------------------------------------------- economy

const CARGO: Good[] = ['provisions', 'fuel', 'metals', 'components'];
addVariants('convoy', [
  {
    id: 'cargo', title: 'Convoy taken', weight: 2,
    stake: (c) => { const g = c.rng.pick(CARGO); data(c).good = g; data(c).n = Math.round(scaled(c, 60) / 10); data(c).amt = scaled(c, 350); },
    text: (c) => { const g = String(c.arc?.data?.good ?? c.memo?.good) as Good; const m = shockMult(c.world, g); return `A convoy carrying ${amt(c, 'n')} ${RESOURCE_LABEL[g].toLowerCase()} for the house was taken in the lanes${m > 1.2 ? ', and at this Orbit\'s prices that is a fortune' : ''}. The raiders are still close, and have sent word they will sell it back for ${fmt(amt(c))} othes.`; },
    options: [
      { label: 'Send the Grand Master after it', check: { who: (c) => seat(c, 'grandMaster'), stats: ['tactics', 'leadership'], dc: 11 },
        resolve: (c, ok) => { if (ok) c.fx.dread(2).say('The cargo is back'); else c.fx.good(String(c.arc?.data?.good ?? c.memo?.good) as Good, -amt(c, 'n')).wound(seat(c, 'grandMaster')); } },
      { label: 'Write it off', resolve: (c) => { c.fx.good(String(c.arc?.data?.good ?? c.memo?.good) as Good, -amt(c, 'n')); } },
      { label: 'Buy it back', labelFor: (c) => `Buy it back (${fmt(amt(c))})`, available: (c) => need(amt(c))(c), resolve: (c) => { c.fx.othes(-amt(c)).respect(-1).say('The corsairs will remember we pay'); } },
    ],
  },
]);

addVariants('quota', [
  {
    id: 'crash', title: 'The collector in the crash',
    when: (c) => crashOn(c.world),
    stake: (c) => { data(c).amt = scaled(c, 500); },
    text: (c) => `With the Exchange falling, the Imperial collectors are squeezing every house at once. Ours says we are behind, and that ${fmt(amt(c))} othes would make the shortfall disappear.`,
    options: [
      { label: 'Pay what he asks', labelFor: (c) => `Pay (${fmt(amt(c))})`, available: (c) => need(amt(c))(c), resolve: (c) => { c.fx.othes(-amt(c)); } },
      { label: 'Show him the books', check: { who: (c) => seat(c, 'steward'), stats: ['stewardship', 'law'], dc: 12 },
        resolve: (c, ok) => { if (ok) c.fx.honour(1).say('He leaves with nothing'); else c.fx.othes(-Math.min(amt(c), Math.max(0, econ(c.world, c.house).stock.othes))); } },
      { label: 'Send him away', resolve: (c) => { c.fx.respect(-3).dread(1); } },
    ],
  },
]);

// ---------------------------------------------------------------- branches: what only some would think of

const ruler = highroy;
const branch = (defId: string, o: EventOption) => addBranches(defId, [o]);

branch('riot', { label: 'Open the granaries', hint: 'merciful', when: (c) => has(ruler(c), 'merciful'), available: (c) => (econ(c.world, c.house).stock.provisions >= 40 ? null : 'Needs 40 provisions'), resolve: (c) => { c.fx.good('provisions', -40).unrest(c.sector, -9).honour(2); } });
branch('riot', { label: 'Make an example of the leaders', hint: 'ruthless', when: (c) => has(ruler(c), 'ruthless'), resolve: (c) => { c.fx.unrest(c.sector, -14).dread(5).honour(-4); } });
branch('feast', { label: 'Go, and win the room', hint: 'silver-tongued', when: (c) => has(ruler(c), 'silverTongued') || has(ruler(c), 'charismatic'), resolve: (c) => { c.fx.regard(c.other, 9).respect(1).say('The Highroy is the talk of the feast'); } });
branch('boundary', { label: 'Consult the old surveys', hint: 'archivist', when: (c) => has(ruler(c), 'archivist') || athome(c).some((x) => has(x, 'archivist')), resolve: (c) => { c.fx.honour(2).unrest(c.sector, -4).say('The surveys settle it; no one can argue with them'); } });
branch('spyArchive', { label: 'Turn him into our man', hint: 'cunning Spymaster', when: (c) => has(seat(c, 'spymaster'), 'cunning'), resolve: (c) => { c.fx.learnHouse(c.other, 20).say('He goes back to copying, for us now'); } });
branch('health', { label: 'Let our healer tend them', hint: 'a healer at court', when: (c) => athome(c).some((x) => has(x, 'healer') && x.id !== c.person?.id), resolve: (c) => { const h = athome(c).find((x) => has(x, 'healer') && x.id !== c.person?.id); if (c.person) c.person.lifespan += 2; c.fx.mood(c.person, 5).mood(h, 3).say(`${nm(h)} sits with them through the nights`); if (h && c.person) shiftOpinion(c.world, c.person.id, h.id, 15, 'tended in their last illness'); } });
branch('blades', { label: 'Hold them to the Creed', hint: 'first blood, then done', when: (c) => has(c.person, 'duelistsCreed') || has(c.second, 'duelistsCreed'), resolve: (c) => { c.fx.mood(c.person, 2).mood(c.second, 2).respect(1).say('First blood, a bow, and it is over'); if (c.person && c.second) { shiftOpinion(c.world, c.person.id, c.second.id, 8, 'an honest duel'); shiftOpinion(c.world, c.second.id, c.person.id, 8, 'an honest duel'); } } });
branch('blades', { label: 'Forbid it, and say why', hint: 'a grudge behind it', when: (c) => !!threadOn(c, c.person, 'grudge') || !!threadOn(c, c.second, 'grudge'), check: { who: ruler, stats: ['insight', 'diplomacy'], dc: 12 },
  resolve: (c, ok) => { if (ok) { c.fx.say('The Highroy names the old grudge, and it loses its teeth').mood(c.person, 2).mood(c.second, 2); for (const x of [c.person, c.second]) { const t = threadOn(c, x, 'grudge'); if (t) t.closed = c.world.date; } } else c.fx.mood(c.person, -5).mood(c.second, -5); } });
branch('cornering', { label: 'Short them', hint: 'Steward: sell what we do not have', when: (c) => (seat(c, 'steward')?.stats.stewardship ?? 0) >= 14 || has(seat(c, 'steward'), 'cunning'), check: { who: (c) => seat(c, 'steward'), stats: ['stewardship', 'intrigue'], dc: 12 },
  resolve: (c, ok) => { const n = scaled(c, 500); if (ok) c.fx.othes(n).regard(c.other, -4).say('They are left holding metals no one wants'); else c.fx.othes(-Math.min(Math.round(n / 2), Math.max(0, econ(c.world, c.house).stock.othes))).say('The price keeps climbing; we pay for it'); } });
branch('quota', { label: 'Remind him whose world this is', hint: 'proud', when: (c) => has(ruler(c), 'proud') || (c.world.houses[c.house]?.standing.dread ?? 0) >= 40, resolve: (c) => { c.fx.dread(2).respect(-1).say('He goes pale, and finds the books in order'); } });
branch('claim', { label: 'Take them in as a ward, not a child', hint: 'merciful', when: (c) => has(ruler(c), 'merciful') || has(ruler(c), 'generous'), resolve: (c) => { c.fx.honour(2).say('Fed, schooled, and not acknowledged'); } });
branch('ambition', { label: 'Give them a war to win', hint: 'we are at war', when: atWar, resolve: (c) => { c.fx.mood(c.person, 10).thread(c.person, 'vow', 'Given a command in the war, to prove themselves'); } });
branch('motion', { label: 'Call in a favour owed', hint: 'someone owes us', when: (c) => openThreads(c.world, undefined, 'favour').some((t) => c.world.characters[t.personId]?.houseId !== c.house), resolve: (c) => { const t = openThreads(c.world, undefined, 'favour').find((x) => c.world.characters[x.personId]?.houseId !== c.house); if (t) t.closed = c.world.date; c.fx.respect(1).say('A favour is spent; the motion dies in committee'); } });

void heldSectors;
