// A moment: the clock has stopped for something. Decisions are answered here, over whatever page is open;
// when the last is answered, time runs on by itself.
import { useEffect, useRef } from 'react';
import { useWorld } from './context';
import { Decision } from './events';

export function MomentWindow({ ids, reason, onClose }: { ids: string[]; reason: string; onClose: (resume: boolean) => void }) {
  const world = useWorld();
  const live = ids.map((id) => world.events.pending.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p);
  const answered = useRef(false);
  if (live.length < ids.length) answered.current = true;
  // Once every decision in this moment is answered, carry on.
  useEffect(() => { if (ids.length && live.length === 0) onClose(true); }, [ids.length, live.length, onClose]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(false); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  if (ids.length && !live.length) return null;
  return (
    <div className="moment-veil" role="dialog" aria-modal="true" aria-label="A moment">
      <div className="moment">
        <header>
          <span className="eyebrow">Time stands still</span>
          <strong>{reason}</strong>
          <button type="button" className="btn small" onClick={() => onClose(false)} title="Esc: look around first; the clock stays paused">Look around</button>
        </header>
        {live.map((p) => <Decision key={p.id} p={p} />)}
        {!ids.length ? (
          <div className="actions body"><button type="button" className="btn primary" onClick={() => onClose(true)}>Carry on ▶</button></div>
        ) : null}
      </div>
    </div>
  );
}
