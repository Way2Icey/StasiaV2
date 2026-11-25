// The clock: time runs on its own at three speeds and stops when a moment needs the Highroy. Space pauses.
// The ▾ menu still skips ahead in one go, stopping at the first thing that needs you.
import { useCallback, useEffect, useRef, useState } from 'react';
import { advanceUntil, DEFAULT_STOPS, STOP_LABEL, stepClock, type StopKind, type StopPrefs } from '../sim/tick';
import { CYCLES_PER_ORBIT, CYCLES_PER_PHASE, CYCLES_PER_TURN, dateParts, formatDate } from '../sim/time';
import type { World } from '../sim/types';
import { ACT_LABEL } from '../sim/storystate';
import { Term } from './tip';
import { storage } from './storage';

export type Speed = 1 | 2 | 3;
/** Milliseconds per tick (one tick is two Cycles). */
const TICK: Record<Speed, number> = { 1: 1000, 2: 400, 3: 110 };

interface Span { id: string; label: string; turns: (w: World) => number; note: string }
const SPANS: Span[] = [
  { id: 'event', label: 'Until something happens', turns: () => 400, note: 'Up to a year' },
  { id: 'phase', label: 'To the next Phase', turns: (w) => Math.ceil((CYCLES_PER_PHASE - dateParts(w.date).cycleOfPhase + 1) / CYCLES_PER_TURN), note: '' },
  { id: 'orbit', label: 'To the next Orbit', turns: (w) => Math.ceil((CYCLES_PER_ORBIT - dateParts(w.date).cycleOfOrbit + 1) / CYCLES_PER_TURN), note: '' },
];

export interface ClockApi {
  running: boolean;
  setRunning: (v: boolean) => void;
  speed: Speed;
  setSpeed: (s: Speed) => void;
  stops: StopPrefs;
  setStop: (k: StopKind, v: boolean) => void;
}

function loadStops(): StopPrefs {
  try { return { ...DEFAULT_STOPS, ...(JSON.parse(storage.get('stasia.stops') ?? '{}') as Partial<StopPrefs>) }; } catch { return DEFAULT_STOPS; }
}

export function useClock(world: World, setWorld: (fn: (w: World) => World) => void, onFreeze: (events: string[], reason: string, battle?: string, scene?: string) => void, onNotice: (msg: string) => void, blocked: boolean): ClockApi {
  const [running, setRunningState] = useState(false);
  const [speed, setSpeedState] = useState<Speed>(() => { const v = Number(storage.get('stasia.speed')); return (v === 2 || v === 3 ? v : 1) as Speed; });
  const [stops, setStops] = useState<StopPrefs>(loadStops);
  const setStop = useCallback((k: StopKind, v: boolean) => setStops((p) => { const n = { ...p, [k]: v }; storage.set('stasia.stops', JSON.stringify(n)); return n; }), []);
  const latest = useRef(world);
  latest.current = world;
  const timer = useRef(0);
  const setRunning = useCallback((v: boolean) => setRunningState(v), []);
  const setSpeed = useCallback((s: Speed) => { setSpeedState(s); storage.set('stasia.speed', String(s)); }, []);

  useEffect(() => {
    window.clearTimeout(timer.current);
    if (!running || blocked) return;
    const tick = () => {
      const r = stepClock(latest.current, stops);
      latest.current = r.world;
      setWorld(() => r.world);
      if (r.freeze) { setRunningState(false); onFreeze(r.freeze.events, r.freeze.reason, r.freeze.battle, r.freeze.scene); return; }
      if (r.notice) onNotice(r.notice);
      timer.current = window.setTimeout(tick, TICK[speed]);
    };
    timer.current = window.setTimeout(tick, TICK[speed]);
    return () => window.clearTimeout(timer.current);
  }, [running, speed, blocked, setWorld, onFreeze, onNotice, stops]);

  // Space pauses and resumes, unless you are typing.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.code === 'Space' && !e.repeat) { e.preventDefault(); setRunningState((r) => !r); }
      if (e.key === '+' || e.key === '=') setSpeed(Math.min(3, speed + 1) as Speed);
      if (e.key === '-' || e.key === '_') setSpeed(Math.max(1, speed - 1) as Speed);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [speed, setSpeed]);

  return { running, setRunning, speed, setSpeed, stops, setStop };
}

export function ClockControl({ world, setWorld, clock, onFreeze }: { world: World; setWorld: (fn: (w: World) => World) => void; clock: ClockApi; onFreeze: (events: string[], reason: string, battle?: string, scene?: string) => void }) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const latest = useRef(world);
  latest.current = world;
  const act = world.story?.act ?? 'calm';

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const skip = (span: Span) => {
    setOpen(false);
    clock.setRunning(false);
    let left = span.turns(latest.current);
    const step = () => {
      const r = advanceUntil(latest.current, Math.min(10, left), clock.stops);
      latest.current = r.world;
      setWorld(() => r.world);
      left -= r.ran;
      if (r.stop) { setNotice(`Stopped on ${formatDate(r.world.date)}: ${r.stop.reason}`); const bt = r.world.battles?.list.find((b) => b.status === 'ready' && !world.battles?.list.some((x) => x.id === b.id)); if (bt) { onFreeze([], `Battle: ${bt.title}.`, bt.id); return; } const ids = r.world.events.pending.filter((p) => !world.events.pending.some((q) => q.id === p.id)).map((p) => p.id); if (ids.length) onFreeze(ids, r.stop.reason); return; }
      if (left <= 0) { setNotice(`Arrived: ${formatDate(r.world.date)}.`); return; }
      window.setTimeout(step, 0);
    };
    window.setTimeout(step, 0);
  };

  return (
    <div className="continue clock" ref={menuRef}>
      <div className="split">
        <button type="button" className={`btn primary play${clock.running ? ' on' : ''}`} onClick={() => { setNotice(null); clock.setRunning(!clock.running); }} aria-pressed={clock.running} title="Space">
          {clock.running ? '❚❚ Pause' : '▶ Play'}
        </button>
        <span className="speeds" role="group" aria-label="Speed">
          {([1, 2, 3] as Speed[]).map((s) => (
            <button key={s} type="button" className="btn primary speed" aria-pressed={clock.speed === s} onClick={() => clock.setSpeed(s)} title={`Speed ${s} of 3 (+/−)`} aria-label={`Speed ${s}`}>{'›'.repeat(s)}</button>
          ))}
        </span>
        <button type="button" className="btn primary step" title="One step: two Cycles, then stop" onClick={() => { clock.setRunning(false); const r = stepClock(latest.current, clock.stops); setWorld(() => r.world); if (r.freeze) onFreeze(r.freeze.events, r.freeze.reason, r.freeze.battle, r.freeze.scene); }}>Step</button>
        <button type="button" className="btn primary caret" aria-haspopup="menu" aria-expanded={open} aria-label="Skip ahead" onClick={() => setOpen((o) => !o)}>▾</button>
      </div>
      <span className={`act act-${act}`} title={`The storyteller: ${ACT_LABEL[act]} (tension ${Math.round(world.story?.tension ?? 0)})`}><Term k="storyteller">{ACT_LABEL[act]}</Term></span>
      {open ? (
        <div className="continue-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => { setOpen(false); const r = stepClock(latest.current, clock.stops); setWorld(() => r.world); if (r.freeze) onFreeze(r.freeze.events, r.freeze.reason, r.freeze.battle, r.freeze.scene); }}>
            <span>Step</span><span className="muted">two Cycles</span>
          </button>
          {SPANS.map((s) => (
            <button key={s.id} type="button" role="menuitem" onClick={() => skip(s)}>
              <span>Skip: {s.label.toLowerCase()}</span>
              <span className="muted">{s.note || `${s.turns(world)} steps`}</span>
            </button>
          ))}
          <div className="continue-stops">
            <div className="eyebrow">Stop the clock when</div>
            {(Object.keys(STOP_LABEL) as StopKind[]).map((k) => (
              <label key={k}><input type="checkbox" checked={clock.stops[k]} onChange={(e) => clock.setStop(k, e.target.checked)} /> {STOP_LABEL[k]}</label>
            ))}
            <div className="muted" style={{ fontSize: 11 }}>Battles and urgent matters always stop it. The rest waits on the desk.</div>
          </div>
        </div>
      ) : null}
      {notice ? (
        <div className="continue-run" role="status">
          <span>{notice}</span>
          <button type="button" className="btn small" onClick={() => setNotice(null)} aria-label="Dismiss">✕</button>
        </div>
      ) : null}
    </div>
  );
}
