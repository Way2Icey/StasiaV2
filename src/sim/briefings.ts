// Briefings: the council comes to you. Whatever needs the Highroy arrives in a councillor's mouth: what is
// happening and what they would do; then what you approved; then, later, how it went. Concerns of the court,
// a councillor's own plan, a mission come home, someone asking to see you, and the gravest news all arrive
// this way, one at a time.
import { absoluteCycle } from './time';
import { seatHolder } from './query';
import { reporterOf } from './reports';
import { MISSION_LABEL, OUTCOME_LABEL, describeJob } from './missions';
import type { CouncilSeat, World } from './types';

export type BriefKind = 'concern' | 'petition' | 'mission' | 'request' | 'word';

export interface Briefing {
  id: string;
  kind: BriefKind;
  /** The concern, petition, mission, request or feed entry it is about. */
  ref: string;
  /** Who brings it. */
  personId: string;
  seat?: CouncilSeat;
  title: string;
  lines: string[];
  date: import('./time').GameDate;
  /** Once answered: what you approved, and what came of it. */
  done?: { approved: string; summary: string[] };
}

export interface BriefState { queue: Briefing[]; seen: string[] }

export function ensureBriefings(w: World): BriefState { return (w.briefings ??= { queue: [], seen: [] }); }
export const openBriefings = (w: World): Briefing[] => w.briefings?.queue ?? [];

/** Which seat brings an event of this kind. */
export const SEAT_FOR_CATEGORY: Record<string, CouncilSeat> = {
  Court: 'envoy', Family: 'elder', Intrigue: 'spymaster', Economy: 'steward', Treasury: 'steward', Numarade: 'envoy', 'The Chair': 'envoy',
  Resonance: 'elder', Drift: 'elder', Faith: 'elder', Legacy: 'elder', Realm: 'steward', War: 'grandMaster', Fleet: 'grandMaster',
  Travel: 'spymaster', Arrival: 'spymaster',
};

/** Who on the council would bring this, falling back to whoever holds a seat. */
export function bringer(w: World, seat: CouncilSeat | undefined): { personId: string; seat?: CouncilSeat } | undefined {
  const P = w.playerHouseId;
  const c = (seat && seatHolder(w, P, seat)) || seatHolder(w, P, 'envoy') || seatHolder(w, P, 'steward') || seatHolder(w, P, 'spymaster');
  return c ? { personId: c.id, seat: c.seat as CouncilSeat } : undefined;
}

function push(w: World, b: Omit<Briefing, 'id' | 'date'>): void {
  const s = ensureBriefings(w);
  const key = `${b.kind}:${b.ref}`;
  if (s.seen.includes(key)) return;
  s.seen.push(key);
  if (s.seen.length > 300) s.seen = s.seen.slice(-200);
  s.queue.push({ ...b, id: `br${w.nextId++}`, date: w.date });
}

/** Each turn: anything new that needs the Highroy is turned into a councillor at the door. */
export function advanceBriefings(w: World, phaseTurned: boolean): void {
  const P = w.playerHouseId;
  const s = ensureBriefings(w);
  // What has gone away by itself leaves the queue (answered elsewhere, lapsed, or over).
  s.queue = s.queue.filter((b) => b.done || stillOpen(w, b));
  for (const c of w.concerns ?? []) {
    const by = w.characters[c.raisedBy];
    if (by) push(w, { kind: 'concern', ref: c.id, personId: by.id, seat: by.seat as CouncilSeat | undefined, title: `${c.yes}?`, lines: [c.text, `${c.backers.length} of the court stand behind this${c.against.length ? `, and ${c.against.length} against` : ''}. ${c.cost}.`] });
  }
  for (const p of w.courts[P]?.petitions ?? []) {
    const by = w.characters[p.fromId];
    if (by) push(w, { kind: 'petition', ref: p.id, personId: by.id, seat: by.seat as CouncilSeat | undefined, title: `${MISSION_LABEL[p.kind]}: a plan`, lines: [p.reason] });
  }
  for (const m of Object.values(w.missions)) {
    if (m.houseId !== P || m.stage !== 'done' || !m.ended || absoluteCycle(m.ended) < absoluteCycle(w.date) - 4) continue;
    const leader = w.characters[m.leaderId];
    const by = leader?.alive && !w.captives[leader.id] ? { personId: leader.id, seat: leader.seat as CouncilSeat | undefined } : bringer(w, m.kind === 'envoy' ? 'envoy' : 'spymaster');
    if (!by) continue;
    const lines = (m.report ?? '').split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 6);
    push(w, { kind: 'mission', ref: m.id, ...by, title: `Home from ${describeJob(w, m)}: ${OUTCOME_LABEL[m.outcome!].toLowerCase()}`, lines: [...lines, ...(m.findings ?? []).slice(0, 4)] });
  }
  for (const r of w.talkRequests ?? []) {
    const c = w.characters[r.personId];
    const by = bringer(w, c?.houseId === P ? 'elder' : 'envoy');
    if (c && by) push(w, { kind: 'request', ref: r.id, ...by, title: `${c.name.given} asks to see you`, lines: [`${c.name.given} ${c.name.family ?? ''} ${r.why}.`] });
  }
  // The gravest word of the Phase, from whoever's people brought it.
  if (phaseTurned) {
    const since = absoluteCycle(w.date) - 16;
    const grave = w.feed.filter((e) => e.id && (e.severity ?? 0) >= 3 && absoluteCycle(e.date) >= since && e.type !== 'decision' && e.kind !== 'time'
      && ((e.who ?? []).some((x) => w.characters[x.id]?.houseId === P) || e.houseIds?.includes(P)));
    const e = grave[grave.length - 1];
    if (e) {
      const rep = reporterOf(w, e);
      const by = bringer(w, rep === 'heralds' ? 'envoy' : rep);
      if (by) push(w, { kind: 'word', ref: e.id!, ...by, title: e.text, lines: [e.detail ?? '', ...(e.account?.lines ?? []).slice(0, 4), ...(e.effects ?? [])].filter(Boolean) });
    }
  }
}

function stillOpen(w: World, b: Briefing): boolean {
  switch (b.kind) {
    case 'concern': return (w.concerns ?? []).some((c) => c.id === b.ref);
    case 'petition': return (w.courts[w.playerHouseId]?.petitions ?? []).some((p) => p.id === b.ref);
    case 'request': return (w.talkRequests ?? []).some((r) => r.id === b.ref);
    default: return true;
  }
}

/** Mark a briefing answered, with what was approved and what came of it. */
export function briefDone(w: World, id: string, approved: string, summary: string[]): void {
  const b = w.briefings?.queue.find((x) => x.id === id);
  if (b) b.done = { approved, summary };
}

/** Send them away: the briefing is closed. */
export function dismissBriefing(input: World, id: string): World {
  const w = structuredClone(input);
  if (w.briefings) w.briefings.queue = w.briefings.queue.filter((b) => b.id !== id);
  return w;
}

/** The newest record written since `before`, as a summary: its headline, account and effects. */
export function summarySince(w: World, before: number): string[] {
  const fresh = w.feed.slice(before);
  const out: string[] = [];
  for (const e of fresh.slice(-3)) { out.push(e.text); out.push(...(e.account?.lines ?? []).slice(0, 3)); out.push(...(e.effects ?? [])); }
  return out.filter(Boolean).slice(0, 8);
}
