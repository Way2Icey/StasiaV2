// Live scenes: the window the battle uses, for everything else that should be played rather than clicked.
// A scene runs a few steps. Each step puts a choice in front of the Highroy; the people in it decide how it
// goes (their stats against the other side, or against the difficulty), and the scene keeps a meter and a
// record. Every kind of scene reads from and writes back to the systems it belongs to: a session of the
// Numarade moves real votes, a negotiation ends a real war, a bonding writes the Caige's CDI and form.
import { Rng } from './rng';
import { checkValue, CHECK_SPREAD } from './events';
import { shortName } from './names';
import type { Character, StatId, World } from './types';
import type { GameDate } from './time';

export type SceneKind = 'session' | 'negotiation' | 'bonding' | 'awakening' | 'infiltration' | 'audience' | 'ceremony' | 'crisis' | 'chronicle';

export interface SceneOption { key: string; label: string; hint?: string; /** Chance this works, if it is a test. */ odds?: number; /** Why it cannot be taken. */ why?: string }
export interface SceneLine { text: string; big?: boolean; good?: boolean; bad?: boolean }
export interface Gauge { label: string; value: number; max: number; bad?: boolean }

export interface Scene {
  id: string;
  kind: SceneKind;
  title: string;
  eyebrow: string;
  where?: string;
  status: 'ready' | 'live' | 'over';
  /** The clock has stopped for it once. */
  prompted?: boolean;
  created: GameDate;
  step: number;
  maxSteps: number;
  /** −100..100: how it is going for us. */
  meter: number;
  meterLabels: [string, string];
  gauges: Gauge[];
  /** Our people in it. */
  ours: string[];
  /** The other side: people, seats, souls. */
  theirs: { id?: string; name: string; note?: string }[];
  prompt: string;
  options: SceneOption[];
  feed: SceneLine[];
  data: Record<string, unknown>;
  result?: { good: boolean; text: string };
  /** Who decides if the Highroy leaves it to them. */
  leaveTo?: string;
}

export interface ScenesState { list: Scene[]; /** Things already turned into scenes (deaths, rulers, years). */ seen: string[] }

export interface SceneDef {
  /** Fill in the prompt and options for the current step. */
  refresh: (w: World, s: Scene) => void;
  /** Play the chosen option: update the meter and the record, move the step on, end it if it is done. */
  act: (w: World, s: Scene, key: string, rng: Rng) => void;
  /** What our people would choose if left to it. */
  auto: (w: World, s: Scene) => string;
  /** When it ends: write the result back into the world. */
  finish: (w: World, s: Scene, rng: Rng) => void;
}

const DEFS: Partial<Record<SceneKind, SceneDef>> = {};
export function registerScene(kind: SceneKind, def: SceneDef): void { DEFS[kind] = def; }

export function ensureScenes(w: World): void {
  w.scenes ??= { list: [], seen: [] };
  w.scenes.seen ??= [];
}
export const sceneOf = (w: World, id: string) => w.scenes?.list.find((s) => s.id === id);
export const openScene = (w: World) => w.scenes?.list.find((s) => s.status !== 'over');

export interface SceneSpec { kind: SceneKind; title: string; eyebrow: string; where?: string; maxSteps: number; meter?: number; meterLabels: [string, string]; gauges?: Gauge[]; ours: string[]; theirs: Scene['theirs']; data?: Record<string, unknown>; leaveTo?: string; intro: string }

export function startScene(w: World, spec: SceneSpec): Scene {
  ensureScenes(w);
  const s: Scene = {
    id: `sc${w.nextId++}`, kind: spec.kind, title: spec.title, eyebrow: spec.eyebrow, where: spec.where, status: 'ready', created: w.date,
    step: 0, maxSteps: spec.maxSteps, meter: spec.meter ?? 0, meterLabels: spec.meterLabels, gauges: spec.gauges ?? [], ours: spec.ours, theirs: spec.theirs,
    prompt: '', options: [], feed: [{ text: spec.intro, big: true }], data: spec.data ?? {}, leaveTo: spec.leaveTo,
  };
  w.scenes!.list.unshift(s);
  w.scenes!.list = w.scenes!.list.filter((x, i) => x.status !== 'over' || i < 20);
  DEFS[s.kind]?.refresh(w, s);
  return s;
}

export function say(s: Scene, text: string, tone?: 'good' | 'bad' | 'big'): void {
  s.feed.push({ text, ...(tone === 'good' ? { good: true } : tone === 'bad' ? { bad: true } : tone === 'big' ? { big: true } : {}) });
  if (s.feed.length > 60) s.feed.shift();
}

export function end(w: World, s: Scene, good: boolean, text: string, rng: Rng): void {
  if (s.status === 'over') return;
  s.status = 'over';
  s.result = { good, text };
  s.options = [];
  s.prompt = text;
  say(s, text, 'big');
  DEFS[s.kind]?.finish(w, s, rng);
}

/** The chance a person passes a test: their stats against a difficulty, with the usual spread. */
export function odds(c: Character | undefined, stats: StatId[], dc: number): number {
  const v = checkValue(c, stats);
  const z = (v - dc) / CHECK_SPREAD;
  // Normal CDF (Abramowitz–Stegun).
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return Math.max(0.02, Math.min(0.98, z > 0 ? 1 - p : p));
}
export function test(rng: Rng, c: Character | undefined, stats: StatId[], dc: number): { ok: boolean; margin: number } {
  const v = checkValue(c, stats) + rng.gauss() * CHECK_SPREAD;
  return { ok: v >= dc, margin: v - dc };
}
export const nameOf = (w: World, id?: string) => (id && w.characters[id] ? shortName(w.characters[id]!.name) : 'our people');
/** (A function, so the checker does not assume the status cannot change under it.) */
export const isOver = (s: Scene): boolean => s.status === 'over';
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function onScene(input: World, id: string, fn: (w: World, s: Scene, rng: Rng) => void): World {
  const w = structuredClone(input);
  const s = sceneOf(w, id);
  if (!s) return input;
  const rng = new Rng(w.rng);
  fn(w, s, rng);
  w.rng = rng.state;
  return w;
}

/** Take one choice in a scene. */
export const actScene = (input: World, id: string, key: string) => onScene(input, id, (w, s, rng) => {
  if (s.status === 'over') return;
  const def = DEFS[s.kind];
  const opt = s.options.find((o) => o.key === key);
  if (!def || !opt || opt.why) return;
  s.status = 'live';
  s.step++;
  def.act(w, s, key, rng);
  if (!isOver(s)) def.refresh(w, s);
});

/** Leave it to our people: they make every remaining choice. */
export const autoScene = (input: World, id: string) => onScene(input, id, (w, s, rng) => {
  const def = DEFS[s.kind];
  if (!def) return;
  s.status = s.status === 'over' ? 'over' : 'live';
  for (let i = 0; i < 20 && !isOver(s); i++) {
    const key = def.auto(w, s);
    const opt = s.options.find((o) => o.key === key) ?? s.options.find((o) => !o.why);
    if (!opt) { end(w, s, s.meter >= 0, 'It is left where it stands.', rng); break; }
    s.step++;
    def.act(w, s, opt.key, rng);
    if (!isOver(s)) def.refresh(w, s);
  }
});

/** Scenes nobody attended to are settled by our people after a while. */
export function advanceScenes(w: World, rng: Rng): void {
  ensureScenes(w);
  for (const s of w.scenes!.list.filter((x) => x.status !== 'over')) {
    const age = (w.date.year - s.created.year) * 800 + (w.date.cycle - s.created.cycle);
    if (age > 24) {
      const def = DEFS[s.kind];
      for (let i = 0; i < 20 && !isOver(s) && def; i++) {
        const key = def.auto(w, s);
        const opt = s.options.find((o) => o.key === key) ?? s.options.find((o) => !o.why);
        if (!opt) { end(w, s, s.meter >= 0, 'It is left where it stands.', rng); break; }
        s.step++;
        def.act(w, s, opt.key, rng);
        if (!isOver(s)) def.refresh(w, s);
      }
    }
  }
}

/** Has this already been made a scene? Marks it if not. */
export function once(w: World, key: string): boolean {
  ensureScenes(w);
  if (w.scenes!.seen.includes(key)) return false;
  w.scenes!.seen.push(key);
  if (w.scenes!.seen.length > 300) w.scenes!.seen = w.scenes!.seen.slice(-200);
  return true;
}
