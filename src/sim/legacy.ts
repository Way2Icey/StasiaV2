// Legacy: what outlasts the people. Deeds a person is remembered for, the names those deeds earn them, the
// knightly ranks of the canon ladder, the Hall of the house's honoured dead, the Annals of what the house
// has done across generations, the Reliquary (Memory Steels, Navisigns, banners of lost legions, writs of the
// crusade, war-navisium, and things marked CLRCH that no one understands), the Archive of fragments about
// the past, and the slow tide of the Drift that names the ages. None of it ends the game: every height can
// be lost, and the world keeps moving.
import { Rng } from './rng';
import { FRAGMENTS, FRAGMENT_BY_ID, THREADS, fragmentsOf, type Fragment, type ThreadId } from '../data/archive';
import { displayName } from './names';
import { logRecord } from './records';
import { dateParts, type GameDate } from './time';
import type { Battle } from './battle';
import type { Character, World } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
// Kept free of the heavier modules (archon, economy): this one is imported early, by death and careers.
const tierOf = (w: World, id: string) => w.archon?.houses[id]?.tier ?? w.houses[id]?.tier ?? 'minor';
const exarchonOf = (w: World) => w.archon?.numarade.exarchon ?? null;
const liveHouses = (w: World) => Object.values(w.archon?.houses ?? {}).filter((h) => !h.ended);
const othesOf = (w: World, h: string) => w.economy?.houses[h]?.stock.othes ?? 0;

// ---------------------------------------------------------------- the shape of it

export type DeedKind = 'duel' | 'battle' | 'command' | 'caige' | 'statecraft' | 'discovery' | 'service' | 'infamy';
export interface Deed { date: GameDate; kind: DeedKind; text: string; weight: number }

export type Rank = 'knight' | 'knightCommander' | 'highKnight' | 'grandMarshal';
export const RANK_LABEL: Record<Rank, string> = { knight: 'Knight', knightCommander: 'Knight Commander', highKnight: 'High Knight', grandMarshal: 'Grand Marshal' };

export type RelicKind = 'echoCoin' | 'keepring' | 'shardsaint' | 'navisign' | 'banner' | 'writ' | 'warNavisium' | 'stationLog' | 'clrch';
export interface Relic {
  id: string;
  kind: RelicKind;
  name: string;
  /** What it is, in a line. */
  note: string;
  /** Where it came from. */
  origin: string;
  found: GameDate;
  /** The house that holds it now (null: lost, or out in the world). */
  houseId: string | null;
  /** A Keepring's bearer, a Navisign's bloodline-holder. */
  bearer?: string;
  /** For a Keepring or a Shardsaint: whose death it holds. */
  of?: string;
  /** A fragment it holds, if listened to or read. */
  fragment?: string;
  /** Read or heard already. */
  read?: boolean;
  history: { year: number; text: string }[];
}

export interface HallEntry { id: string; name: string; epithet?: string; rank?: string; seat?: string; died: number; cause: string; deeds: string[]; caige?: string }
export interface Era { name: string; from: number; to?: number; why: string }

export interface LegacyState {
  deeds: Record<string, Deed[]>;
  ranks: Record<string, Rank>;
  hall: HallEntry[];
  annals: Record<string, { year: number; note?: string }>;
  relics: Record<string, Relic>;
  archive: Record<string, { year: number; via: string }>;
  /** 0..100: how strongly the Drift moves through navisium in this age. */
  drift: number;
  driftHistory: number[];
  eras: Era[];
  counters: Record<string, number>;
  /** Things already counted (war ids, Exarchon names), so nothing counts twice. */
  seen: Record<string, true>;
  startYear: number;
}

export function ensureLegacy(w: World): LegacyState {
  const x = w as World & { legacy?: LegacyState };
  x.legacy ??= { deeds: {}, ranks: {}, hall: [], annals: {}, relics: {}, archive: {}, drift: 30, driftHistory: [], eras: [], counters: {}, seen: {}, startYear: dateParts(w.date).year };
  const L = x.legacy;
  L.counters ??= {}; L.seen ??= {}; L.eras ??= []; L.driftHistory ??= [];
  return L;
}
export const legacyOf = (w: World): LegacyState => ensureLegacy(w);
const year = (w: World) => dateParts(w.date).year;
const P = (w: World) => w.playerHouseId;
const bump = (w: World, k: string, n = 1) => { const L = ensureLegacy(w); L.counters[k] = (L.counters[k] ?? 0) + n; };

// ---------------------------------------------------------------- deeds and the names they earn

export function addDeed(w: World, personId: string, kind: DeedKind, text: string, weight = 1): void {
  const c = w.characters[personId];
  if (!c) return;
  const L = ensureLegacy(w);
  const list = (L.deeds[personId] ??= []);
  if (list.some((d) => d.text === text && d.date.year === w.date.year)) return;
  list.unshift({ date: w.date, kind, text, weight });
  if (list.length > 24) list.length = 24;
}
export const deedsOf = (w: World, id: string): Deed[] => ensureLegacy(w).deeds[id] ?? [];
export const renownOf = (w: World, id: string): number => deedsOf(w, id).reduce((t, d) => t + (d.kind === 'infamy' ? d.weight * 0.5 : d.weight), 0);
export const rankOf = (w: World, id: string): Rank | undefined => ensureLegacy(w).ranks[id];

const EPITHETS: Record<DeedKind, string[]> = {
  duel: ['the Unbowed', 'Blade-Sure', 'the Quick', 'the Unbeaten', 'Steel-Eyed'],
  battle: ['the Bold', 'Breaker of Lines', 'the Steadfast', 'the Iron', 'Shieldwall'],
  command: ['the Strategist', 'the Patient', 'the Hammer', 'Holder of Gates'],
  caige: ['the Anchored', 'Twice-Formed', 'the Resonant', 'Will-Bound'],
  statecraft: ['the Wise', 'Silver-Tongued', 'the Peacemaker', 'the Fox'],
  discovery: ['the Seeker', 'Finder of Lost Things', 'the Wanderer'],
  service: ['the Faithful', 'the Loyal', 'the Unfailing'],
  infamy: ['the Cruel', 'Oathbreaker', 'the Butcher', 'the Black'],
};
/** The name a person's deeds would earn them, if they have earned one. */
export function earnedEpithet(w: World, c: Character, rng: Rng): string | null {
  if (c.name.epithet) return null;
  const ds = deedsOf(w, c.id);
  if (renownOf(w, c.id) < 5) return null;
  const by: Partial<Record<DeedKind, number>> = {};
  for (const d of ds) by[d.kind] = (by[d.kind] ?? 0) + d.weight;
  const top = (Object.entries(by) as [DeedKind, number][]).sort((a, b) => b[1] - a[1])[0]![0];
  return rng.pick(EPITHETS[top]);
}

/** Battles: who stood out is remembered. */
export function noteBattle(w: World, b: Battle): void {
  const won = b.result?.winner === 0;
  const place = b.title;
  for (const f of b.fighters) {
    if (!f.id || !w.characters[f.id]) continue;
    const kills = f.deeds.filter((d) => d.startsWith('killed ')).map((d) => d.slice(7));
    const ourSide = f.side === 0 ? won : !won;
    if (f.deeds.includes('won the champions\' duel')) addDeed(w, f.id, 'duel', `Won the champions' duel: ${place}`, 3);
    for (const k of kills.slice(0, 2)) addDeed(w, f.id, b.kind === 'war' ? 'battle' : 'duel', `Killed ${k} (${place})`, 2);
    if (f.rating >= 8 && ourSide) addDeed(w, f.id, 'battle', `Stood out in a victory: ${place}`, 1);
    if (f.state !== 'dead' && f.hp < 3 && ourSide) addDeed(w, f.id, 'battle', `Fought on, wounded, at ${place}`, 1);
  }
}

/** Titles the older systems hand out are deeds too. */
export function titleAsDeed(w: World, id: string, title: string): void {
  const kind: DeedKind = /Crucible|Tourney|Victor|Blooded|duel/i.test(title) ? 'duel' : /command/i.test(title) ? 'command' : /plague|vow|score/i.test(title) ? 'service' : 'battle';
  addDeed(w, id, kind, title, /Crucible|Victor/.test(title) ? 3 : 2);
}

// ---------------------------------------------------------------- the Hall and the dead

const HALL_WORTHY = (w: World, c: Character) => renownOf(w, c.id) >= 3 || !!c.seat || !!c.name.epithet || !!rankOf(w, c.id) || c.role === 'Highroy';

export function onLegacyDeath(w: World, c: Character, cause: string, seat?: string): void {
  const L = ensureLegacy(w);
  if (c.houseId !== P(w)) return;
  if (!HALL_WORTHY(w, c) && !seat) return;
  const caige = Object.values(w.armoury).find((g) => g.bondedTo === c.id);
  L.hall.unshift({
    id: c.id, name: displayName({ ...c.name, epithet: undefined }), epithet: c.name.epithet, rank: rankOf(w, c.id) ? RANK_LABEL[rankOf(w, c.id)!] : undefined,
    seat: seat ?? c.seat, died: year(w), cause, deeds: deedsOf(w, c.id).sort((a, b) => b.weight - a.weight).slice(0, 4).map((d) => d.text), caige: caige?.name,
  });
  if (L.hall.length > 200) L.hall.length = 200;
  if (c.role === 'Highroy' || seat === 'highroy') bump(w, 'highroys');
  // A deep bond broken by death can break the Caige: the navisium collapses, and holds the moment.
  if (caige && (caige.cdi ?? 0) >= 0.55) {
    const rng = Rng.fromSeed(`${w.rng}/${c.id}/fracture`);
    if (rng.chance(0.2)) {
      delete w.armoury[caige.id];
      const r = makeRelic(w, 'shardsaint', { of: c.id, origin: `${caige.name}, which broke when ${displayName(c.name)} died` });
      logRecord(w, { kind: 'world', type: 'world', severity: 3, text: `${caige.name} broke when ${displayName(c.name)} died. The navisium collapsed into a shape the house will keep: ${r.name}.`, houseIds: [P(w)] });
    }
  }
}

// ---------------------------------------------------------------- relics

let relicSeq = 0;
const LOST_LEGIONS = ['the Ninth of Varrow', 'the Ashen Fourteenth', 'the Bell Legion', 'the Vigil of Corlas', 'the Twentieth Lance', 'the Grey Oath', 'the Lantern Legion', 'the Second of Hesh'];
const OLD_BATTLES = ['the Hollow Front', 'Sevrin\'s Gate', 'the Long Burn', 'the Glass Fields', 'the Siege of Orvane', 'the Thousand-Cycle Line'];
const DERELICTS = ['Relay Station Kett', 'the Mercy of Ilun', 'Dock Ring Seven', 'the Quiet Yard', 'Waystation Aul', 'the Saint Berenet'];
const CLRCH_FORMS = [
  ['A ring marked CLRCH', 'A grey ring, far heavier than its size. It does nothing.'],
  ['A plate marked CLRCH', 'A palm-sized plate of dense grey metal, engraved with five letters. Cold, always.'],
  ['A rod marked CLRCH', 'A short rod that does not warm in the hand. The letters are cut very fine.'],
  ['A sphere marked CLRCH', 'A small grey sphere. Struck, it makes no sound at all.'],
  ['A key marked CLRCH', 'A key with no lock anyone has found. The letters run along the shaft.'],
];

export function makeRelic(w: World, kind: RelicKind, o: { houseId?: string | null; of?: string; origin?: string; name?: string; note?: string; fragment?: string; rng?: Rng } = {}): Relic {
  const L = ensureLegacy(w);
  const rng = o.rng ?? Rng.fromSeed(`${w.rng}/relic/${w.nextId}`);
  const id = `rl${w.nextId++}${relicSeq++ % 1}`;
  const dead = o.of ? w.characters[o.of] : undefined;
  const dn = dead ? displayName({ ...dead.name, epithet: undefined }) : undefined;
  let name = o.name ?? '', note = o.note ?? '', fragment = o.fragment;
  const pickFrag = (threads: ThreadId[]) => { const pool = FRAGMENTS.filter((f) => threads.includes(f.thread) && f.thread !== 'drift' && !L.archive[f.id]); return pool.length ? rng.pick(pool).id : undefined; };
  switch (kind) {
    case 'echoCoin': name ||= 'An Echo Coin'; note ||= 'A Memory Steel: some thirty seconds of a moment long past, waiting to be heard.'; fragment ??= pickFrag(['war', 'rend', 'silence', 'legions']); break;
    case 'keepring': name ||= `The Keepring of ${dn ?? 'a forgotten hero'}`; note ||= 'A Memory Steel: a ceremonial blade that carries grief and legacy down a line. The one who bears it carries the dead with them.'; break;
    case 'shardsaint': name ||= `The Shardsaint of ${dn ?? 'an unknown bearer'}`; note ||= 'A Memory Steel: collapsed navisium that holds a whole death. It hums when no one is near it.'; break;
    case 'navisign': name ||= 'A Navisign of the house'; note ||= 'Navisium threads that answer only to one bloodline. A Caige tied to it will not answer a thief.'; break;
    case 'banner': name ||= `The banner of ${rng.pick(LOST_LEGIONS)}`; note ||= 'The banner of a legion that marched into the war and did not come out of it.'; fragment ??= pickFrag(['legions', 'war']); break;
    case 'writ': name ||= 'A writ of the crusade'; note ||= 'A crusade writ from the time of Vaelor Primus, repaired by many hands.'; fragment ??= pickFrag(['vaelor', 'war', 'will']); break;
    case 'warNavisium': name ||= `War-navisium from ${rng.pick(OLD_BATTLES)}`; note ||= 'Navisium from an old battlefield, heavy with what it saw. It fetches a high price; its keepers sleep badly.'; fragment ??= pickFrag(['navisium', 'souls']); break;
    case 'stationLog': name ||= `The log of ${rng.pick(DERELICTS)}`; note ||= 'A station log from the Silence, the last entries in a steady hand.'; fragment ??= pickFrag(['silence', 'rend']); break;
    case 'clrch': { const [n, t] = rng.pick(CLRCH_FORMS); name ||= n!; note ||= t!; fragment ??= FRAGMENTS.find((f) => f.thread === 'clrch' && !L.archive[f.id])?.id; break; }
  }
  const r: Relic = { id, kind, name, note, origin: o.origin ?? 'unknown', found: w.date, houseId: o.houseId === undefined ? P(w) : o.houseId, of: o.of, fragment, history: [{ year: year(w), text: o.origin ? `Came to the house: ${o.origin}` : 'Came to the house' }] };
  L.relics[id] = r;
  if (r.houseId === P(w)) bump(w, 'relicsEver');
  if (kind === 'clrch' && r.houseId === P(w)) bump(w, 'clrch');
  return r;
}
export const relicsOf = (w: World, houseId = P(w)): Relic[] => Object.values(ensureLegacy(w).relics).filter((r) => r.houseId === houseId);

export function moveRelic(w: World, id: string, to: string | null, why: string): void {
  const r = ensureLegacy(w).relics[id];
  if (!r) return;
  r.houseId = to;
  r.bearer = undefined;
  r.history.push({ year: year(w), text: why });
}

// ---------------------------------------------------------------- the Archive

/** Learn a fragment: a named one, or the next one in a thread, or any not yet known. */
export function discover(w: World, via: string, o: { id?: string; thread?: ThreadId; rng?: Rng } = {}): Fragment | null {
  const L = ensureLegacy(w);
  let f: Fragment | undefined;
  if (o.id) f = FRAGMENT_BY_ID[o.id];
  else {
    const pool = (o.thread ? fragmentsOf(o.thread) : FRAGMENTS).filter((x) => !L.archive[x.id] && (x.thread !== 'drift' || nextDrift(w)?.id === x.id));
    // The Drift's thread comes in order, and only as the age allows.
    const ok = pool.filter((x) => x.thread !== 'drift' || x.order <= 2 + Math.floor(L.drift / 25));
    if (ok.length) f = (o.rng ?? Rng.fromSeed(`${w.rng}/frag/${w.nextId}`)).pick(ok);
  }
  if (!f || L.archive[f.id]) return null;
  L.archive[f.id] = { year: year(w), via };
  return f;
}
export const nextDrift = (w: World): Fragment | undefined => fragmentsOf('drift').find((f) => !ensureLegacy(w).archive[f.id]);
export const knownOf = (w: World, t: ThreadId): Fragment[] => fragmentsOf(t).filter((f) => ensureLegacy(w).archive[f.id]);
export const threadDone = (w: World, t: ThreadId): boolean => !THREADS[t].open && knownOf(w, t).length === fragmentsOf(t).length;

// ---------------------------------------------------------------- the Annals

export interface Annal { id: string; title: string; text: string; hidden?: boolean; check: (w: World, L: LegacyState) => boolean }
const ours = (w: World) => Object.values(w.characters).filter((c) => c.houseId === P(w));
const caiges = (w: World) => Object.values(w.armoury).filter((g) => g.houseId === P(w));

export const ANNALS: Annal[] = [
  { id: 'deed', title: 'Spoken Of', text: 'One of ours did something worth remembering.', check: (w, L) => ours(w).some((c) => (L.deeds[c.id]?.length ?? 0) > 0) },
  { id: 'epithet', title: 'A Name Earned', text: 'One of ours earned a name by their deeds.', check: (_w, L) => (L.counters.epithets ?? 0) >= 1 },
  { id: 'epithets5', title: 'A House of Names', text: 'Five of ours have earned names by their deeds.', check: (_w, L) => (L.counters.epithets ?? 0) >= 5 },
  { id: 'commander', title: 'The Ladder', text: 'One of ours rose to Knight Commander.', check: (w, L) => Object.entries(L.ranks).some(([id, r]) => r !== 'knight' && w.characters[id]?.houseId === P(w)) },
  { id: 'highKnight', title: 'High Knight', text: 'One of ours rose to High Knight.', check: (w, L) => Object.entries(L.ranks).some(([id, r]) => (r === 'highKnight' || r === 'grandMarshal') && w.characters[id]?.houseId === P(w)) },
  { id: 'marshal', title: 'The Grand Marshal', text: 'The Exarchon named one of ours to command the legions of the Archon.', check: (_w, L) => (L.counters.marshals ?? 0) >= 1 },
  { id: 'hall5', title: 'The Hall Fills', text: 'Five of the house\'s honoured dead rest in the Hall.', check: (_w, L) => L.hall.length >= 5 },
  { id: 'hall25', title: 'A Long Hall', text: 'Twenty-five names in the Hall.', check: (_w, L) => L.hall.length >= 25 },
  { id: 'highroys3', title: 'Three Highroys', text: 'The house has passed through three Highroys and stood.', check: (_w, L) => (L.counters.highroys ?? 0) >= 2 },
  { id: 'highroys7', title: 'Seven Highroys', text: 'Seven generations at the head of the house.', check: (_w, L) => (L.counters.highroys ?? 0) >= 6 },
  { id: 'years25', title: 'Twenty-Five Years', text: 'A quarter-century of the house in our hands.', check: (w, L) => year(w) - L.startYear >= 25 },
  { id: 'century', title: 'A Century Unbroken', text: 'A hundred years, and the house still stands.', hidden: true, check: (w, L) => year(w) - L.startYear >= 100 },
  { id: 'great', title: 'Raised Great', text: 'The house was raised a Great House.', check: (w) => tierOf(w, P(w)) === 'great' },
  { id: 'fallen', title: 'Fallen', text: 'The house fell from the Great to the Minor.', hidden: true, check: (_w, L) => (L.counters.fallen ?? 0) >= 1 },
  { id: 'risen', title: 'Fallen and Risen', text: 'The house fell from greatness and climbed back.', hidden: true, check: (_w, L) => (L.counters.fallen ?? 0) >= 1 && (L.counters.raised ?? 0) >= 2 },
  { id: 'exarchon', title: 'The Chair', text: 'One of our blood was elected Exarchon.', check: (_w, L) => (L.counters.exarchons ?? 0) >= 1 },
  { id: 'exarchons3', title: 'Three Chairs', text: 'Three Exarchons of our blood.', hidden: true, check: (_w, L) => (L.counters.exarchons ?? 0) >= 3 },
  { id: 'vassals3', title: 'Liege of Three', text: 'Three houses sworn to ours at once.', check: (w) => Object.values(w.war?.liege ?? {}).filter((x) => x === P(w)).length >= 3 },
  { id: 'founder', title: 'Mother of Houses', text: 'A house was founded from ours.', check: (w) => liveHouses(w).some((h) => h.foundedBy && w.war?.liege[h.id] === P(w)) },
  { id: 'wars1', title: 'Blooded House', text: 'The house won its first war.', check: (_w, L) => (L.counters.warsWon ?? 0) >= 1 },
  { id: 'wars5', title: 'Feared', text: 'Five wars won.', check: (_w, L) => (L.counters.warsWon ?? 0) >= 5 },
  { id: 'peace20', title: 'The Long Quiet', text: 'Twenty years without a war of ours.', hidden: true, check: (w, L) => year(w) - (L.counters.lastWar ?? L.startYear) >= 20 },
  { id: 'vault', title: 'Every Caige Bonded', text: 'Three or more Caiges in the vault, and every one of them bonded.', check: (w) => caiges(w).length >= 3 && caiges(w).every((g) => g.bondedTo && w.characters[g.bondedTo]?.alive) },
  { id: 'form', title: 'Two Forms', text: 'A Caige of ours holds a second form.', check: (w) => caiges(w).some((g) => (g.forms ?? 1) >= 2) },
  { id: 'unbreakable', title: 'The One That Would Not Bend', text: 'A Caige of ours holds an unbreakable soul, and is borne anyway.', check: (w) => caiges(w).some((g) => g.bondedTo && g.souls?.some((s) => s.unbreakable)) },
  { id: 'legend', title: 'Found', text: 'A lost Caige of legend came back into the light in our hands.', check: (w) => (w.archon?.legends ?? []).some((l) => l.found && caiges(w).some((g) => g.name === l.name)) },
  { id: 'fracture', title: 'Broken', text: 'A Caige of ours broke when its bearer died.', hidden: true, check: (w, L) => Object.values(L.relics).some((r) => r.kind === 'shardsaint' && r.houseId === P(w)) },
  { id: 'relics5', title: 'The Reliquary', text: 'Five relics in the house\'s keeping.', check: (w) => relicsOf(w).length >= 5 },
  { id: 'relics15', title: 'A Treasure-House of the Past', text: 'Fifteen relics in the house\'s keeping.', hidden: true, check: (w) => relicsOf(w).length >= 15 },
  { id: 'clrch', title: 'Five Letters', text: 'The house holds an object marked CLRCH.', hidden: true, check: (_w, L) => (L.counters.clrch ?? 0) >= 1 },
  { id: 'clrch3', title: 'A Pattern', text: 'Three objects marked CLRCH have come to the house. None was looked for.', hidden: true, check: (_w, L) => (L.counters.clrch ?? 0) >= 3 },
  { id: 'archive10', title: 'The Archive Grows', text: 'Ten fragments of the past in the house\'s archive.', check: (_w, L) => Object.keys(L.archive).length >= 10 },
  { id: 'archive30', title: 'Keepers of Memory', text: 'Thirty fragments of the past.', hidden: true, check: (_w, L) => Object.keys(L.archive).length >= 30 },
  { id: 'threadWar', title: 'The War, Pieced Together', text: 'Every fragment of the War for God, Peace and Life.', check: (w) => threadDone(w, 'war') },
  { id: 'threadRend', title: 'Remembering the Rend', text: 'Every fragment of the Rend the house could find.', check: (w) => threadDone(w, 'rend') },
  { id: 'threadWill', title: 'The Weight of Will', text: 'All of the disputed text, burned pages and all.', check: (w) => threadDone(w, 'will') },
  { id: 'driftLattice', title: 'A Word for It', text: 'The house\'s scholars found a name for where the Drift moves from.', hidden: true, check: (_w, L) => !!L.archive.dri5 },
  { id: 'driftName', title: 'A Name', text: 'The house learned what the Drift is called. It did not learn what it is.', hidden: true, check: (_w, L) => !!L.archive.dri6 },
  { id: 'treasury', title: 'A Treasury of Legend', text: 'A million othes in the coffers at once.', hidden: true, check: (w) => othesOf(w, P(w)) >= 1_000_000 },
  { id: 'debt', title: 'Out of the Spiral', text: 'The house fought its way out of a spiral of debt.', hidden: true, check: (_w, L) => (L.counters.debtWon ?? 0) >= 1 },
  { id: 'eras3', title: 'Three Ages', text: 'The house has lived through three named ages.', check: (_w, L) => L.eras.length >= 3 },
];

function checkAnnals(w: World): void {
  const L = ensureLegacy(w);
  for (const a of ANNALS) {
    if (L.annals[a.id]) continue;
    let ok = false;
    try { ok = a.check(w, L); } catch { ok = false; }
    if (!ok) continue;
    L.annals[a.id] = { year: year(w) };
    w.feed.push({ date: w.date, kind: 'council', text: `Written in the Annals of the house: ${a.title}. ${a.text}` });
  }
}

// ---------------------------------------------------------------- ranks

/** Once a year: knights whose deeds speak for them climb the canon ladder. */
function promote(w: World, rng: Rng): Character[] {
  const L = ensureLegacy(w);
  const out: Character[] = [];
  for (const h of Object.keys(w.houses)) {
    const people = Object.values(w.characters).filter((c) => c.alive && c.houseId === h && c.tier === 'full');
    for (const c of people) if (c.flags.some((f) => f.id === 'knighted') && !L.ranks[c.id]) L.ranks[c.id] = 'knight';
    const highs = people.filter((c) => L.ranks[c.id] === 'highKnight').length;
    const cap = 1 + Math.min(3, Math.floor((w.houses[h]?.tier === 'great' ? 2 : 1) + people.length / 40));
    for (const c of people) {
      const r = L.ranks[c.id];
      const renown = renownOf(w, c.id);
      if (r === 'knight' && renown >= 4 && c.stats.leadership + c.stats.valor >= 20 && rng.chance(0.6)) { L.ranks[c.id] = 'knightCommander'; out.push(c); }
      else if (r === 'knightCommander' && renown >= 9 && c.stats.leadership >= 12 && highs < cap && rng.chance(0.4)) { L.ranks[c.id] = 'highKnight'; out.push(c); }
    }
  }
  return out;
}

// ---------------------------------------------------------------- the Drift and the ages

const ERA_NAMES = {
  restless: ['the Restless Years', 'the Age of Echoes', 'the Unquiet', 'the Years of Strange Weight', 'the Dreaming Age'],
  quiet: ['the Still Years', 'the Clear Age', 'the Long Calm', 'the Settled Years'],
  war: ['the Burning Years', 'the Age of Iron', 'the Years of Banners'],
  peace: ['the Long Peace', 'the Gentle Years', 'the Age of Harbours'],
};
function nameEra(w: World, rng: Rng, kind: keyof typeof ERA_NAMES, why: string): void {
  const L = ensureLegacy(w);
  const y = year(w);
  const last = L.eras[L.eras.length - 1];
  if (last && !last.to) { if (y - last.from < 8) return; last.to = y; }
  const ex = exarchonOf(w);
  let name = rng.pick(ERA_NAMES[kind]);
  if (L.eras.some((e) => e.name === name)) name = ex ? `${name.replace(/^the /, 'the ')} of ${ex.name.split(' ')[0]}` : `${name}, again`;
  L.eras.push({ name, from: y, why });
  w.archon?.history.push({ year: y, kind: 'era', text: `The chroniclers have begun to call these ${name}: ${why}`, houses: [] });
  w.feed.push({ date: w.date, kind: 'council', text: `The chroniclers have begun to call these ${name}.` });
}

function driftYear(w: World, rng: Rng): void {
  const L = ensureLegacy(w);
  const before = L.drift;
  // A slow tide: pulled back toward the middle, pushed about, and now and then a surge.
  L.drift = Math.round(clamp(L.drift + (40 - L.drift) * 0.08 + rng.gauss() * 6 + (rng.chance(0.06) ? rng.int(12, 25) : 0), 0, 100));
  L.driftHistory.push(L.drift);
  if (L.driftHistory.length > 60) L.driftHistory.shift();
  if (before < 65 && L.drift >= 65) nameEra(w, rng, 'restless', 'Caiges change their weight overnight, bearers dream the same dreams, and the armourers have stopped writing it all down.');
  else if (before > 25 && L.drift <= 25) nameEra(w, rng, 'quiet', 'the Caiges are steady and the dreams have stopped, for now.');
  const wars = (w.war?.wars ?? []).filter((x) => x.status === 'active' && x.rung === 'war').length;
  if (wars >= 2 && rng.chance(0.4)) nameEra(w, rng, 'war', 'house after house has gone to war, and the lanes are full of troopships.');
  else if (!wars && (w.war?.wars ?? []).every((x) => x.status !== 'active' || x.rung !== 'war') && year(w) - (L.counters.lastAnyWar ?? L.startYear) >= 12 && rng.chance(0.25)) nameEra(w, rng, 'peace', 'a dozen years without open war between the houses.');
}

// ---------------------------------------------------------------- each turn

/** Bookkeeping that watches the rest of the game: wars won, chairs taken, falls and rises. */
function watch(w: World): void {
  const L = ensureLegacy(w);
  const y = year(w);
  for (const x of w.war?.wars ?? []) {
    const mine = x.attacker === P(w) || x.defender === P(w) || x.attackers.includes(P(w)) || x.defenders.includes(P(w));
    if (x.status === 'active') { if (x.rung === 'war') L.counters.lastAnyWar = y; if (mine) L.counters.lastWar = y; }
    if (x.status !== 'ended' || !x.result || L.seen[`war:${x.id}`]) continue;
    L.seen[`war:${x.id}`] = true;
    if (!mine) continue;
    const side = x.attacker === P(w) || x.attackers.includes(P(w)) ? 'attackers' : 'defenders';
    if (x.result.winner === side) bump(w, 'warsWon');
  }
  const ex = exarchonOf(w);
  if (ex && ex.houseId === P(w) && !L.seen[`ex:${ex.name}:${ex.since}`]) { L.seen[`ex:${ex.name}:${ex.since}`] = true; bump(w, 'exarchons'); if (ex.personId) addDeed(w, ex.personId, 'statecraft', `Elected Exarchon of the Archon, ${ex.since}`, 6); }
  const t = tierOf(w, P(w));
  if (L.seen.tierGreat && t === 'minor') { delete L.seen.tierGreat; bump(w, 'fallen'); }
  if (!L.seen.tierGreat && t === 'great') { L.seen.tierGreat = true; bump(w, 'raised'); }
  for (const s of w.story?.struggles ?? []) if (s.kind === 'debt' && s.ended?.won && !L.seen[`debt:${s.id}`]) { L.seen[`debt:${s.id}`] = true; bump(w, 'debtWon'); }
}

/** Relics work on the house: a Reliquary is prestige, a Keepring steadies its bearer. */
function relicYear(w: World): void {
  for (const h of Object.keys(w.houses)) {
    const rs = relicsOf(w, h);
    const st = w.houses[h]!.standing;
    if (rs.length) st.respect = clamp(st.respect + Math.min(3, Math.floor(rs.length / 3)), 0, 100);
    for (const r of rs) {
      if (r.kind === 'keepring') {
        const heir = r.bearer && w.characters[r.bearer]?.alive ? w.characters[r.bearer] : (w.houses[h]!.rulerId ? w.characters[w.houses[h]!.rulerId!] : undefined);
        if (heir) { if (r.bearer !== heir.id) { r.bearer = heir.id; r.history.push({ year: year(w), text: `Passed to ${displayName(heir.name)}` }); } heir.hidden.loyalty = clamp(heir.hidden.loyalty + 0.5, 0, 20); }
      }
    }
  }
}

/** Rival houses' knights earn names too, so the world is full of people worth fearing. */
function rivalEpithets(w: World, rng: Rng): void {
  for (const c of Object.values(w.characters)) {
    if (!c.alive || c.houseId === P(w) || c.tier !== 'full' || c.name.epithet) continue;
    const e = earnedEpithet(w, c, rng);
    if (e && rng.chance(0.5)) c.name.epithet = e;
  }
}

export function advanceLegacy(w: World, rng: Rng, crossed: { phases: number; orbits: number; years: number }): Character[] {
  const L = ensureLegacy(w);
  watch(w);
  for (const b of w.battles?.list ?? []) if (b.status === 'over' && !L.seen[`b:${b.id}`]) { L.seen[`b:${b.id}`] = true; noteBattle(w, b); }
  let promoted: Character[] = [];
  if (crossed.orbits > 0) checkAnnals(w);
  if (crossed.years > 0) {
    driftYear(w, rng);
    promoted = promote(w, rng);
    relicYear(w);
    rivalEpithets(w, rng);
    checkAnnals(w);
  }
  return promoted;
}

// ---------------------------------------------------------------- player actions (pure)

/** Listen to an Echo Coin, read a writ or a log: what it holds goes into the Archive. */
export function readRelic(input: World, id: string): World {
  const w = structuredClone(input);
  const r = ensureLegacy(w).relics[id];
  if (!r || r.houseId !== w.playerHouseId) throw new Error('Not in our keeping.');
  if (r.read) throw new Error('Already heard.');
  r.read = true;
  const f = r.fragment ? discover(w, r.name, { id: r.fragment }) : null;
  r.history.push({ year: year(w), text: f ? `Heard: "${f.title}"` : 'Heard; it held nothing the house did not already know' });
  w.feed.push({ date: w.date, kind: 'council', text: f ? `${r.name}: "${f.title}", for the Archive.` : `${r.name} held nothing new.` });
  return w;
}
