// Concerns of the court: what enough of the house's people want done that it comes before the Highroy.
//
// A concern is raised when three or more of the court lean the same way on something: a restless sector, a
// purse running low, a rival who has wronged us, a fighter owed a knighthood, a price on one of ours. Each
// comes with the people for it and the people against it, and the answer is remembered by both.
import { Rng } from './rng';
import { absoluteCycle, addCycles, CYCLES_PER_PHASE, type GameDate } from './time';
import { logRecord } from './records';
import { econ, record } from './economy';
import { shortName } from './names';
import { shiftMood } from './mood';
import { shiftOpinion } from './relationships';
import { regardOf, shiftRegard, courtHouse, cannotCourt, COURT_COST } from './archon';
import { atWar, grievances } from './war';
import { isAway } from './court';
import { cannotKnight, knight } from './ambitions';
import { buyOff, buyOffCost, onOurHeads } from './bounties';
import { equipOf, setEquip, setCeremony, EQUIP_LABEL, type EquipLevel } from './standing';
import { SEAT_TITLE } from './world';
import { ensureIntel } from './turning';
import { ageOf } from './characters';
import { SPECIES } from '../data/species';
import type { Character, World } from './types';

export type ConcernKind = 'unrest' | 'stipends' | 'thrift' | 'arms' | 'knight' | 'buyoff' | 'reparation' | 'court';

export interface Concern {
  id: string;
  kind: ConcernKind;
  /** Who speaks for it. */
  raisedBy: string;
  text: string;
  backers: string[];
  against: string[];
  /** A sector, house, person or bounty, by kind. */
  subject?: string;
  yes: string;
  no: string;
  /** What saying yes costs or does, in a line. */
  cost: string;
  date: GameDate;
  expires: GameDate;
}

export const MIN_BACKERS = 3;

/** The court: our grown people at home who would have a view. */
export function courtiers(w: World): Character[] {
  const P = w.playerHouseId;
  const lord = w.houses[P]?.rulerId;
  return Object.values(w.characters).filter((c) => c.alive && c.houseId === P && c.tier === 'full' && c.id !== lord && !c.veiled && !isAway(w, c.id) && !w.captives[c.id] && ageOf(c, w.date) >= SPECIES[c.species].adulthood);
}

const has = (c: Character, ...ids: string[]) => c.traits.some((t) => ids.includes(t.id));
/** A steady per-person, per-matter tilt, so people are not coin flips. */
const tilt = (c: Character, k: string) => { let h = 0; for (const ch of c.id + k) h = (h * 31 + ch.charCodeAt(0)) | 0; return ((Math.abs(h) % 100) / 100 - 0.5) * 1.2; };

/** How strongly someone leans toward saying yes to a matter, about −3..+3. */
function lean(w: World, c: Character, kind: ConcernKind, subject?: string): number {
  let v = tilt(c, kind + (subject ?? ''));
  const s = c.stats, hid = c.hidden;
  switch (kind) {
    case 'unrest': v += (has(c, 'ruthless', 'wrathful', 'proud') ? 1 : 0) - (has(c, 'merciful', 'generous') ? 1.2 : 0) + (s.tactics - 10) / 10; break;
    case 'stipends': v += (hid.greed - 10) / 6 + (has(c, 'generous') ? 0.8 : 0) - (has(c, 'humble') ? 0.8 : 0) + (c.seat === 'steward' ? -1.5 : 0.3); break;
    case 'thrift': v += (s.stewardship - 10) / 6 + (c.seat === 'steward' ? 1.5 : 0) - (hid.greed - 10) / 8 - (has(c, 'proud') ? 0.8 : 0); break;
    case 'arms': v += (has(c, 'brave', 'tactician', 'wrathful', 'hotBlooded') ? 1 : 0) + (s.tactics - 10) / 8 - (has(c, 'merciful') ? 0.6 : 0) - (c.seat === 'steward' ? 1 : 0); break;
    case 'knight': {
      const k = subject ? w.characters[subject] : undefined;
      v += (has(c, 'honourBound', 'duelistsCreed', 'brave') ? 0.9 : 0) + (k && k.familyId === c.familyId ? 1.5 : 0) + (c.seat === 'grandMaster' ? 1 : 0) - (has(c, 'ambitious') && c.role !== 'Knight' ? 0.8 : 0);
      break;
    }
    case 'buyoff': {
      const k = subject ? w.characters[subject] : undefined;
      v += (k && k.familyId === c.familyId ? 2 : 0) + (has(c, 'generous', 'merciful') ? 0.8 : 0) - (has(c, 'proud', 'wrathful') ? 1 : 0) - (c.seat === 'steward' ? 0.8 : 0);
      break;
    }
    case 'reparation': v += (has(c, 'proud', 'wrathful', 'honourBound') ? 1 : 0) - (has(c, 'merciful', 'humble') ? 1 : 0) - (s.diplomacy - 10) / 10; break;
    case 'court': v += (s.diplomacy - 10) / 6 + (has(c, 'merciful', 'generous', 'courtier') ? 0.8 : 0) - (has(c, 'proud', 'wrathful') ? 1 : 0) + (c.seat === 'envoy' ? 1.5 : 0); break;
  }
  return v;
}

/** Who stands where on a matter. */
export function sides(w: World, kind: ConcernKind, subject?: string): { backers: Character[]; against: Character[] } {
  const all = courtiers(w).map((c) => ({ c, v: lean(w, c, kind, subject) }));
  return { backers: all.filter((x) => x.v >= 0.9).sort((a, b) => b.v - a.v).map((x) => x.c), against: all.filter((x) => x.v <= -0.9).sort((a, b) => a.v - b.v).map((x) => x.c) };
}

type Draft = Omit<Concern, 'id' | 'raisedBy' | 'backers' | 'against' | 'date' | 'expires' | 'text'> & { say: (who: Character) => string };

function candidates(w: World): Draft[] {
  const P = w.playerHouseId;
  const e = econ(w, P);
  const out: Draft[] = [];
  const sectors = Object.values(w.planets).filter((p) => p.houseId === P).flatMap((p) => p.sectors).filter((s) => s.controllerFamilyId);
  const restless = [...sectors].sort((a, b) => b.unrest - a.unrest)[0];
  if (restless && restless.unrest >= 30) out.push({ kind: 'unrest', subject: restless.id, yes: 'Send soldiers in', no: 'Let it settle on its own', cost: '−400 othes · its unrest −20 · dread +2', say: () => `${restless.name} will not settle. Send soldiers in and end it.` });
  const people = courtiers(w);
  const glum = people.length ? people.reduce((t, c) => t + (c.mood ?? 50), 0) / people.length : 50;
  const gift = Math.round(people.length * 60 / 50) * 50;
  if (glum < 48 && e.stock.othes > gift * 3) out.push({ kind: 'stipends', yes: 'Open the purse', no: 'Not now', cost: `−${gift.toLocaleString('en-US')} othes · the court's mood up`, say: () => 'The court has been tight-fisted with its own people for too long. A gift from the purse would be remembered.' });
  if (e.stock.othes < 1500) out.push({ kind: 'thrift', yes: 'Keep the ceremonies modest', no: 'Keep the house as it is', cost: 'Ceremonies modest from now on · the court grumbles', say: () => 'The purse is nearly empty. Cut the ceremonies before it is.' });
  const eq = equipOf(w, P);
  if (eq < 3 && (Object.keys(w.houses).some((h) => h !== P && atWar(w, P, h)) || eq < 1)) out.push({ kind: 'arms', yes: `Arm them to ${EQUIP_LABEL[(eq + 1) as EquipLevel].toLowerCase()}`, no: 'They will make do', cost: 'Equipment up a level: it costs more each Phase', say: () => 'Our legions are carrying old issue. If it comes to blows we will pay for it in lives.' });
  const owed = Object.values(w.characters).find((c) => c.alive && c.houseId === P && !cannotKnight(w, c.id));
  if (owed) out.push({ kind: 'knight', subject: owed.id, yes: `Knight ${shortName(owed.name)}`, no: 'Not yet', cost: '−300 othes · a knight of the house', say: () => `${shortName(owed.name)} has earned it twice over. Knight them.` });
  const price = onOurHeads(w)[0];
  const tgt = price?.target.kind === 'person' ? w.characters[price.target.id] : undefined;
  if (price && tgt) out.push({ kind: 'buyoff', subject: price.id, yes: 'Buy it off', no: 'We do not pay for threats', cost: `−${buyOffCost(price).toLocaleString('en-US')} othes`, say: () => `There is a price on ${shortName(tgt.name)}'s head. Buy it off before a hunter collects.` });
  for (const h of Object.keys(w.houses)) {
    if (h === P || atWar(w, P, h)) continue;
    const g = grievances(w, P, h);
    if (g.length && regardOf(w, h, P) < 0) { out.push({ kind: 'reparation', subject: h, yes: 'Demand reparation', no: 'Let it go', cost: 'They pay, or refuse and give us another grievance', say: () => `House ${w.houses[h]!.name} owes us: ${g[0]!.replace(/\.$/, '').toLowerCase()}. Make them pay for it.` }); break; }
  }
  const cold = Object.keys(w.houses).filter((h) => h !== P && !atWar(w, P, h) && regardOf(w, h, P) <= -35 && !cannotCourt(w, h)).sort((a, b) => regardOf(w, a, P) - regardOf(w, b, P))[0];
  if (cold) out.push({ kind: 'court', subject: cold, yes: `Court House ${w.houses[cold]!.name}`, no: 'Let them sulk', cost: `−${COURT_COST.toLocaleString('en-US')} othes · their regard up`, say: () => `House ${w.houses[cold]!.name} is turning against us. Court them before it comes to blows.` });
  return out;
}

export function concernsOf(w: World): Concern[] { return w.concerns ?? []; }

/** Each Phase: old concerns lapse, and now and then a new one gathers enough voices to be heard. */
export function advanceConcerns(w: World, rng: Rng, phaseTurned: boolean): void {
  if (!phaseTurned) return;
  const now = absoluteCycle(w.date);
  const lapsed = (w.concerns ?? []).filter((c) => absoluteCycle(c.expires) <= now);
  for (const c of lapsed) settle(w, c, null);
  w.concerns = (w.concerns ?? []).filter((c) => absoluteCycle(c.expires) > now);
  if (w.concerns.length >= 3 || !rng.chance(0.35)) return;
  const open = new Set(w.concerns.map((c) => c.kind + (c.subject ?? '')));
  const pool = candidates(w).filter((d) => !open.has(d.kind + (d.subject ?? '')));
  for (const d of pool.sort(() => rng.next() - 0.5)) {
    const s = sides(w, d.kind, d.subject);
    if (s.backers.length < MIN_BACKERS) continue;
    const by = s.backers[0]!;
    const { say, ...rest } = d;
    w.concerns.push({ ...rest, id: `cn${w.nextId++}`, raisedBy: by.id, text: say(by), backers: s.backers.slice(0, 8).map((c) => c.id), against: s.against.slice(0, 8).map((c) => c.id), date: w.date, expires: addCycles(w.date, CYCLES_PER_PHASE * 2) });
    return;
  }
}

/** The court remembers how its concerns were answered. A null answer is silence. */
function settle(w: World, c: Concern, yes: boolean | null): void {
  const lord = w.houses[w.playerHouseId]?.rulerId;
  if (!lord) return;
  for (const id of c.backers) { shiftOpinion(w, id, lord, yes ? 4 : yes === null ? -4 : -3, yes ? 'heeded the court' : 'ignored the court'); shiftMood(w.characters[id], yes ? 3 : -2); }
  for (const id of c.against) { shiftOpinion(w, id, lord, yes ? -3 : 2, yes ? 'went against them in court' : 'heeded them in court'); }
}

export function answerConcern(input: World, id: string, yes: boolean): World {
  const w0 = structuredClone(input);
  const c = (w0.concerns ?? []).find((x) => x.id === id);
  if (!c) throw new Error('That has passed');
  const P = w0.playerHouseId;
  const effects: string[] = [];
  let w = w0;
  if (yes) {
    const e = econ(w, P);
    switch (c.kind) {
      case 'unrest': {
        const s = Object.values(w.planets).flatMap((p) => p.sectors).find((x) => x.id === c.subject);
        if (e.stock.othes < 400) throw new Error('Not enough othes');
        record(w, P, { resource: 'othes', amount: -400, label: 'Soldiers sent to restore order', kind: 'forces' });
        if (s) s.unrest = Math.max(0, s.unrest - 20);
        w.houses[P]!.standing.dread = Math.min(100, w.houses[P]!.standing.dread + 2);
        effects.push('−400 othes', `${s?.name ?? 'The sector'}: unrest −20`, 'Dread +2');
        break;
      }
      case 'stipends': {
        const gift = Math.round(courtiers(w).length * 60 / 50) * 50;
        if (e.stock.othes < gift) throw new Error('Not enough othes');
        record(w, P, { resource: 'othes', amount: -gift, label: 'A gift to the court', kind: 'stipend' });
        for (const k of courtiers(w)) shiftMood(k, 6);
        effects.push(`−${gift.toLocaleString('en-US')} othes`, 'The court\'s mood +6');
        break;
      }
      case 'thrift': w = setCeremony(w, 'modest'); for (const k of courtiers(w)) shiftMood(k, -2); effects.push('Ceremonies modest', 'The court\'s mood −2'); break;
      case 'arms': { const eq = equipOf(w, P); if (eq < 3) { w = setEquip(w, (eq + 1) as EquipLevel); effects.push(`Equipment: ${EQUIP_LABEL[(eq + 1) as EquipLevel]}`); } break; }
      case 'knight': w = knight(w, c.subject!); effects.push('A new knight'); break;
      case 'buyoff': w = buyOff(w, c.subject!); effects.push('The price is bought off'); break;
      case 'court': w = courtHouse(w, c.subject!); effects.push(`House ${w.houses[c.subject!]?.name} courted`); break;
      case 'reparation': {
        const h = c.subject!;
        const rng = new Rng(w.rng);
        const pays = rng.chance(Math.max(0.15, Math.min(0.75, 0.35 + w.houses[P]!.standing.dread / 200 + w.houses[P]!.standing.respect / 300 + (w.houses[h]?.standing.honour ?? 50) / 400 - (w.houses[h]?.tier === 'great' ? 0.15 : 0))));
        if (pays) {
          const amt = Math.round(Math.min(econ(w, h).stock.othes * 0.05 + 800, 4000) / 50) * 50;
          econ(w, h).stock.othes -= amt; record(w, P, { resource: 'othes', amount: amt, label: `Reparation from House ${w.houses[h]?.name}`, kind: 'boon' });
          shiftRegard(w, h, P, -10);
          effects.push(`+${amt.toLocaleString('en-US')} othes from House ${w.houses[h]?.name}`, 'Their regard −10');
        } else {
          shiftRegard(w, h, P, -8);
          ensureIntel(w).wrongs.push({ by: h, against: P, text: 'They refused us reparation for a wrong.', year: w.date.year });
          effects.push(`House ${w.houses[h]?.name} refused`, 'Their regard −8', 'A new grievance against them');
        }
        w.rng = rng.state;
        break;
      }
    }
  }
  const cc = (w.concerns ?? []).find((x) => x.id === id)!;
  settle(w, cc, yes);
  w.concerns = (w.concerns ?? []).filter((x) => x.id !== id);
  const by = w.characters[cc.raisedBy];
  logRecord(w, { kind: 'council', type: 'decision', severity: 1, text: `${yes ? cc.yes : cc.no}: the court's concern${by ? `, raised by ${shortName(by.name)}${by.seat ? `, ${SEAT_TITLE[by.seat]}` : ''}` : ''}.`, effects: [...effects, `${cc.backers.length} for · ${cc.against.length} against`] });
  return w;
}
