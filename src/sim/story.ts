// The storyteller: reads how tense the house's life is and paces what comes to the Highroy. Calm stretches
// are quiet but grow restless if they last; a rising tide brings more; crisis brings the heavy things.
// It also carries arcs from stage to stage, and pushes the long struggles along.
import type { Rng } from './rng';
import type { Character, StatId, World } from './types';
import { fire, fireStage, checkValue } from './events';
import { actOf, ensureStory, openStruggles, type Struggle, type StruggleKind } from './storystate';
import { heldSectors } from './economy';
import { isAway } from './court';
import { absoluteCycle, CYCLES_PER_PHASE, CYCLES_PER_TURN } from './time';
import { logRecord } from './records';
import { shortName } from './names';
import { seatHolder } from './query';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ---------------------------------------------------------------- struggles

export const STRUGGLE: Record<StruggleKind, { label: string; stats: StatId[]; note: string; ours: string; theirs: string }> = {
  plot: { label: 'A plot against the Highroy', stats: ['intrigue', 'insight', 'perception'], note: 'Intrigue, insight and perception work against it.', ours: 'unmask them', theirs: 'they strike' },
  ring: { label: 'A ring in our port', stats: ['law', 'perception', 'stewardship'], note: 'Law, perception and stewardship work against it.', ours: 'the ring is broken', theirs: 'the Numarade finds it first' },
  madness: { label: "The Caige's pull", stats: ['composure', 'insight', 'intellect'], note: 'The bearer fights it with willpower and control; helpers add composure, insight and learning.', ours: 'they master it', theirs: 'it masters them' },
  feud: { label: 'A feud between families', stats: ['diplomacy', 'eloquence', 'leadership'], note: 'Diplomacy, eloquence and leadership calm it.', ours: 'reconciled', theirs: 'blood is drawn' },
};

/** Turning points: a stage fires the first time the meter crosses each. */
const POINTS = [-60, -30, 30, 60];
export const MAX_ON_STRUGGLE = 3;

export function startStruggle(world: World, kind: StruggleKind, opts: { title?: string; strength: number; theirName: string; theirId?: string; theirHouse?: string; known?: boolean; cast?: Struggle['cast']; meter?: number; ours?: string[] }): Struggle {
  ensureStory(world);
  const s: Struggle = {
    id: `st${world.nextId++}`, kind, title: opts.title ?? STRUGGLE[kind].label, meter: opts.meter ?? 0,
    ours: (opts.ours ?? []).filter((id) => world.characters[id]?.alive).slice(0, MAX_ON_STRUGGLE),
    theirs: { name: opts.theirName, strength: opts.strength, personId: opts.theirId, houseId: opts.theirHouse, known: opts.known ?? false },
    cast: opts.cast ?? {}, since: world.date, fired: [], log: [{ date: world.date, text: 'It begins.' }],
  };
  world.story!.struggles.unshift(s);
  world.story!.struggles = world.story!.struggles.filter((x, i) => !x.ended || i < 20);
  logRecord(world, { kind: 'council', type: 'intrigue', severity: 2, text: `${s.title}: it has begun.`, who: s.ours.map((id) => ({ id, part: 'set against it' })), source: 'the court' });
  return s;
}

/** How hard our side pushes, a Phase at a time. */
export function oursPush(world: World, s: Struggle): number {
  const people = s.ours.map((id) => world.characters[id]).filter((c): c is Character => !!c?.alive && !isAway(world, c.id));
  let v = people.reduce((t, c, i) => t + checkValue(c, STRUGGLE[s.kind].stats) * (i === 0 ? 1 : 0.6), 0);
  if (s.kind === 'madness') { const b = s.cast.personId ? world.characters[s.cast.personId] : undefined; if (b?.alive) v += checkValue(b, ['willpower', 'resonanceControl']) * 1.2; }
  return v;
}

export function cannotJoin(world: World, s: Struggle, id: string): string | null {
  const c = world.characters[id];
  if (!c?.alive || c.houseId !== world.playerHouseId || c.tier !== 'full') return 'Not one of ours';
  if (s.ended) return 'It is over';
  if (s.ours.includes(id)) return 'Already on it';
  if (s.ours.length >= MAX_ON_STRUGGLE) return `${MAX_ON_STRUGGLE} at most`;
  if (openStruggles(world).some((x) => x.ours.includes(id))) return 'Already on another';
  if (s.cast.personId === id && s.kind !== 'madness') return 'They are part of it';
  if (s.theirs.personId === id) return 'They are the other side';
  return null;
}

export function joinStruggle(input: World, id: string, personId: string): World {
  const w = structuredClone(input);
  const s = w.story?.struggles.find((x) => x.id === id);
  if (!s) return w;
  const why = cannotJoin(w, s, personId);
  if (why) throw new Error(why);
  s.ours.push(personId);
  s.log.push({ date: w.date, text: `${shortName(w.characters[personId]!.name)} is set to it.` });
  return w;
}

export function leaveStruggle(input: World, id: string, personId: string): World {
  const w = structuredClone(input);
  const s = w.story?.struggles.find((x) => x.id === id);
  if (s) s.ours = s.ours.filter((x) => x !== personId);
  return w;
}

/** Shift a struggle's meter from inside an event. */
export function pushStruggle(world: World, id: string | undefined, n: number, why?: string): void {
  const s = world.story?.struggles.find((x) => x.id === id);
  if (!s || s.ended) return;
  s.meter = clamp(s.meter + n, -100, 100);
  if (why) s.log.push({ date: world.date, text: why });
}

export function endStruggle(world: World, id: string | undefined, won: boolean, text: string): void {
  const s = world.story?.struggles.find((x) => x.id === id);
  if (!s || s.ended) return;
  s.ended = { date: world.date, won, text };
  s.log.push({ date: world.date, text });
}

function advanceStruggles(world: World, rng: Rng, phaseTurned: boolean): void {
  if (!phaseTurned) return;
  for (const s of openStruggles(world)) {
    const ours = oursPush(world, s);
    const theirs = s.theirs.strength;
    const d = clamp((ours - theirs) * 0.9 + rng.gauss() * 6, -22, 22);
    const before = s.meter;
    s.meter = clamp(s.meter + d, -100, 100);
    // Turning points, once each.
    for (const pt of POINTS) {
      if (s.fired.includes(pt)) continue;
      const crossed = pt > 0 ? before < pt && s.meter >= pt : before > pt && s.meter <= pt;
      if (!crossed) continue;
      s.fired.push(pt);
      fireStage(world, rng, `str:${s.kind}:${pt > 0 ? 'up' : 'down'}`, { ...s.cast, struggleId: s.id });
      break;
    }
    if (s.meter >= 100 || s.meter <= -100) {
      const won = s.meter >= 100;
      const p = fireStage(world, rng, `str:${s.kind}:${won ? 'won' : 'lost'}`, { ...s.cast, struggleId: s.id });
      if (!p) endStruggle(world, s.id, won, won ? `Over: ${STRUGGLE[s.kind].ours}.` : `Over: ${STRUGGLE[s.kind].theirs}.`);
      else s.meter = won ? 99 : -99; // held at the edge until the Highroy decides
    }
  }
}

// ---------------------------------------------------------------- the storyteller

function targetTension(world: World): number {
  const P = world.playerHouseId;
  const st = world.story!;
  const sectors = heldSectors(world, P);
  const unrest = sectors.length ? sectors.reduce((t, s) => t + s.unrest, 0) / sectors.length : 0;
  const ours = Object.values(world.characters).filter((c) => c.alive && c.houseId === P && c.tier === 'full');
  const hurt = ours.filter((c) => c.flags.some((f) => f.id === 'wounded' || f.id === 'captive' || f.id === 'grieving')).length;
  const sour = ours.filter((c) => (c.mood ?? 50) < 30).length;
  const feuds = (world.realm?.feuds ?? []).filter((f) => f.a === P || f.b === P).length;
  const raids = (world.ports?.raids ?? []).filter((r) => r.status === 'revealed').length;
  const strug = openStruggles(world).reduce((t, s) => t + 8 + (s.meter < 0 ? 8 : 0), 0);
  const urgent = (world.events?.pending ?? []).filter((p) => p.urgent).length;
  // A long lull builds toward something: RimWorld's storyteller does not let a colony sleep for ever.
  const lull = Math.min(40, (st.lull ?? 0) / 7) + Math.min(10, st.quiet / 6);
  return clamp(unrest * 0.35 + hurt * 3 + sour * 2 + feuds * 12 + raids * 15 + strug + urgent * 6 + lull + 12, 0, 100);
}

const PACE: Record<string, number> = { calm: 0.045, rising: 0.075, crisis: 0.11 };

/** Pick a struggle the house is ripe for, and open it with its first scene. */
function maybeOpenStruggle(world: World, rng: Rng): void {
  const st = world.story!;
  if (openStruggles(world).length >= 2) return;
  const p = st.act === 'crisis' ? 0.25 : st.act === 'rising' ? 0.08 : 0;
  if (!rng.chance(p)) return;
  const kinds = rng.shuffle<StruggleKind>(['plot', 'ring', 'madness', 'feud']);
  for (const k of kinds) if (fireStage(world, rng, `str:${k}:open`, {})) return;
}

/** Once a turn. */
export function advanceStory(world: World, rng: Rng, phaseTurned: boolean): void {
  ensureStory(world);
  const st = world.story!;
  st.quiet += CYCLES_PER_TURN;
  st.tension = Math.round((st.tension + (targetTension(world) - st.tension) * 0.12) * 10) / 10;
  const was = st.act;
  st.act = actOf(st.tension);
  st.lull = st.act === 'calm' ? (st.lull ?? 0) + CYCLES_PER_TURN : Math.max(0, (st.lull ?? 0) - CYCLES_PER_TURN * 6);
  if (was !== st.act && st.act === 'crisis') logRecord(world, { kind: 'council', type: 'council', severity: 1, text: 'The council senses the house is near a breaking point.', source: 'the court' });

  // Arcs: the next stage, when it is due.
  const now = absoluteCycle(world.date);
  for (const run of st.arcs) {
    if (!run.open || !run.next || absoluteCycle(run.next.at) > now) continue;
    if (world.events.pending.some((p) => p.arcId === run.id)) continue;
    const next = run.next.defId;
    delete run.next;
    const p = fireStage(world, rng, next, { ...run.cast }, run.id);
    if (!p) { run.open = false; run.ending = 'The thread went cold.'; }
  }

  advanceStruggles(world, rng, phaseTurned);

  // Home: the storyteller's pace.
  const home = world.events.pending.filter((x) => !x.missionId).length;
  const pace = PACE[st.act]! * (st.quiet > CYCLES_PER_PHASE * 3 ? 1.8 : 1);
  if (home < 3 && rng.chance(pace)) fire(world, rng, 'home', {}, CYCLES_PER_PHASE, st.act);
  if (phaseTurned) maybeOpenStruggle(world, rng);
}

/** Who the house would put on a struggle first: the seat that suits it. */
export function naturalFor(world: World, kind: StruggleKind): Character | undefined {
  const P = world.playerHouseId;
  const seat = kind === 'plot' ? 'spymaster' : kind === 'ring' ? 'steward' : kind === 'madness' ? 'physician' : 'envoy';
  return seatHolder(world, P, seat);
}
