// Continue: one turn, or a longer stretch that stops when something needs you.
import { useEffect, useRef, useState } from 'react';
import { advanceTurn, advanceUntil } from '../sim/tick';
import { CYCLES_PER_ORBIT, CYCLES_PER_PHASE, CYCLES_PER_TURN, dateParts, formatDate } from '../sim/time';
import type { World } from '../sim/types';
import { Term } from './tip';

interface Span { id: string; label: string; turns: (w: World) => number; note: string; untilEvent?: boolean }

const SPANS: Span[] = [
  { id: 'event', label: 'Until something happens', turns: () => 400, note: 'Up to a year; stops at the first thing that needs you', untilEvent: true },
  { id: 'phase', label: 'To the next Phase', turns: (w) => Math.ceil((CYCLES_PER_PHASE - dateParts(w.date).cycleOfPhase + 1) / CYCLES_PER_TURN), note: '' },
  { id: 'orbit', label: 'To the next Orbit', turns: (w) => Math.ceil((CYCLES_PER_ORBIT - dateParts(w.date).cycleOfOrbit + 1) / CYCLES_PER_TURN), note: '' },
  { id: 'year', label: 'One year', turns: () => 400, note: '10 Orbits' },
  { id: 'five', label: 'Five years', turns: () => 2000, note: 'A long sleep' },
];

const CHUNK = 8;

export function ContinueControl({ world, setWorld }: { world: World; setWorld: (fn: (w: World) => World) => void }) {
  const [open, setOpen] = useState(false);
  const [stopOnEvents, setStopOnEvents] = useState(true);
  const [run, setRun] = useState<{ left: number; total: number; label: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const cancel = useRef(false);
  const latest = useRef(world);
  latest.current = world;
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const start = (span: Span) => {
    setOpen(false);
    setNotice(null);
    cancel.current = false;
    const total = span.turns(latest.current);
    const stop = span.untilEvent || stopOnEvents;
    let left = total;
    setRun({ left, total, label: span.label });
    const step = () => {
      if (cancel.current) { setRun(null); setNotice('Stopped.'); return; }
      const n = Math.min(CHUNK, left);
      const r = advanceUntil(latest.current, n, stop);
      latest.current = r.world;
      setWorld(() => r.world);
      left -= r.ran;
      if (r.stop) { setRun(null); setNotice(`Stopped on ${formatDate(r.world.date)}: ${r.stop.reason}`); return; }
      if (left <= 0) {
        setRun(null);
        setNotice(span.untilEvent ? 'A quiet year: nothing needed you.' : `Arrived: ${formatDate(r.world.date)}.`);
        return;
      }
      setRun({ left, total, label: span.label });
      window.setTimeout(step, 0);
    };
    window.setTimeout(step, 0);
  };

  return (
    <div className="continue" ref={menuRef}>
      <div className="split">
        <button type="button" className="btn primary" disabled={!!run} onClick={() => { setNotice(null); setWorld((w) => advanceTurn(w)); }}>Continue ›</button>
        <button type="button" className="btn primary caret" disabled={!!run} aria-haspopup="menu" aria-expanded={open} aria-label="Continue for longer" onClick={() => setOpen((o) => !o)}>▾</button>
      </div>
      {open ? (
        <div className="continue-menu" role="menu">
          {SPANS.map((s) => (
            <button key={s.id} type="button" role="menuitem" onClick={() => start(s)}>
              <span>{s.label}</span>
              <span className="muted">{s.note || `${s.turns(world)} turns`}</span>
            </button>
          ))}
          <label className="continue-opt">
            <input type="checkbox" checked={stopOnEvents} onChange={(e) => setStopOnEvents(e.target.checked)} />
            <Term k="stopOnEvents">Stop when something needs me</Term>
          </label>
        </div>
      ) : null}
      {run ? (
        <div className="continue-run" role="status">
          <span>Time passes… {formatDate(world.date)}</span>
          <span className="bar" style={{ width: 120 }}><span style={{ width: `${Math.round(((run.total - run.left) / run.total) * 100)}%`, background: 'var(--gold)' }} /></span>
          <button type="button" className="btn small" onClick={() => { cancel.current = true; }}>Stop</button>
        </div>
      ) : notice ? (
        <div className="continue-run" role="status">
          <span>{notice}</span>
          <button type="button" className="btn small" onClick={() => setNotice(null)} aria-label="Dismiss">✕</button>
        </div>
      ) : null}
    </div>
  );
}
