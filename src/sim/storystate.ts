// The shape of the house's stories: the storyteller's read of how tense things are, the arcs under way,
// the threads left on people (grudges, debts, secrets, vows, omens), and the long struggles both sides push on.
// Kept apart from the event engine so either can read it without importing the other.
import type { GameDate } from './time';
import type { World } from './types';

/** The storyteller's pace: quiet stretches, a rising tide, and crisis. */
export type Act = 'calm' | 'rising' | 'crisis';
export const ACT_LABEL: Record<Act, string> = { calm: 'Calm', rising: 'Rising', crisis: 'Crisis' };

/** Who and where an arc is about; carried from stage to stage. */
export interface Cast { personId?: string; secondId?: string; otherHouseId?: string; sectorId?: string; missionId?: string }

export interface ArcStage { date: GameDate; title: string; choice: string; lines: string[]; byCouncil: boolean }

export interface ArcRun {
  id: string;
  /** The arc's name: the first stage's title, or a given one. */
  title: string;
  cast: Cast;
  stages: ArcStage[];
  open: boolean;
  /** The next stage and when it comes. */
  next?: { defId: string; at: GameDate };
  /** How it ended, once it has. */
  ending?: string;
  /** Free data the stages pass on to each other. */
  data?: Record<string, string | number>;
}

export type ThreadKind = 'grudge' | 'debt' | 'secret' | 'vow' | 'omen' | 'favour' | 'scar';
export const THREAD_LABEL: Record<ThreadKind, string> = { grudge: 'Grudge', debt: 'Debt', secret: 'Secret', vow: 'Vow', omen: 'Omen', favour: 'Favour owed', scar: 'Scar' };

/** Something left hanging on a person that a later story can pick up. */
export interface Thread { id: string; personId: string; kind: ThreadKind; text: string; since: GameDate; about?: string; closed?: GameDate }

export type StruggleKind = 'plot' | 'ring' | 'madness' | 'feud' | 'succession' | 'plague' | 'uprising' | 'hunted' | 'glass' | 'campaign' | 'drift' | 'debt';

/** A long contest: a meter both sides push on, with turning points along the way. */
export interface Struggle {
  id: string;
  kind: StruggleKind;
  title: string;
  /** −100 (lost) to +100 (won). */
  meter: number;
  /** Our people on it. */
  ours: string[];
  /** The other side: a name, a strength, and the person behind it if we know. */
  theirs: { name: string; strength: number; personId?: string; houseId?: string; known: boolean };
  cast: Cast;
  since: GameDate;
  /** Turning points already reached. */
  fired: number[];
  log: { date: GameDate; text: string }[];
  ended?: { date: GameDate; won: boolean; text: string };
  /** A turning point that went to blades: the meter moves when it ends. */
  battle?: string;
}

export interface StoryState {
  tension: number;
  act: Act;
  /** Cycles since the storyteller last put something in front of the Highroy. */
  quiet: number;
  /** Cycles since the house was last anything but calm: a long lull builds toward something. */
  lull?: number;
  arcs: ArcRun[];
  threads: Thread[];
  struggles: Struggle[];
}

export function ensureStory(world: World): void {
  world.story ??= { tension: 20, act: 'calm', quiet: 0, arcs: [], threads: [], struggles: [] };
}

export function openThreads(world: World, personId?: string, kind?: ThreadKind): Thread[] {
  return (world.story?.threads ?? []).filter((t) => !t.closed && (!personId || t.personId === personId) && (!kind || t.kind === kind) && world.characters[t.personId]?.alive);
}

export function addThread(world: World, personId: string, kind: ThreadKind, text: string, about?: string): Thread {
  ensureStory(world);
  const t: Thread = { id: `th${world.nextId++}`, personId, kind, text, since: world.date, about };
  world.story!.threads.push(t);
  if (world.story!.threads.length > 200) world.story!.threads = world.story!.threads.filter((x) => !x.closed).slice(-200);
  return t;
}

export function closeThread(world: World, id: string): void {
  const t = world.story?.threads.find((x) => x.id === id);
  if (t) t.closed = world.date;
}

export function openArcs(world: World): ArcRun[] { return (world.story?.arcs ?? []).filter((a) => a.open); }
export function openStruggles(world: World): Struggle[] { return (world.story?.struggles ?? []).filter((s) => !s.ended); }
export function actOf(tension: number): Act { return tension >= 66 ? 'crisis' : tension >= 36 ? 'rising' : 'calm'; }
