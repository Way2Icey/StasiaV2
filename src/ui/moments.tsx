// A moment: the clock has stopped for something. Decisions are answered here, over whatever page is open;
// when the last is answered, time runs on by itself.
import { useEffect, useRef } from 'react';
import { useWorld } from './context';
import { Decision } from './events';
import { useGame } from './context';
import { battleOf, fightItOut, THEATRES } from '../sim/battle';

export function MomentWindow({ ids, reason, battle, onClose, onCommand }: { ids: string[]; reason: string; battle?: string; onClose: (resume: boolean) => void; onCommand: (id: string) => void }) {
  const world = useWorld();
  const game = useGame();
  const bt = battle ? battleOf(world, battle) : undefined;
  const live = ids.map((id) => world.events.pending.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p);
  const answered = useRef(false);
  if (live.length < ids.length) answered.current = true;
  // Once every decision in this moment is answered, carry on.
  useEffect(() => { if (ids.length && live.length === 0 && !battle) onClose(true); }, [ids.length, live.length, onClose, battle]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(false); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  if (ids.length && !live.length && !battle) return null;
  return (
    <div className="moment-veil" role="dialog" aria-modal="true" aria-label="A moment">
      <div className="moment">
        <header>
          <span className="eyebrow">Time stands still</span>
          <strong>{reason}</strong>
          <button type="button" className="btn small" onClick={() => onClose(false)} title="Esc: look around first; the clock stays paused">Look around</button>
        </header>
        {live.map((p) => <Decision key={p.id} p={p} />)}
        {bt ? (
          <div className="body" style={{ display: 'grid', gap: 8 }}>
            <span className="muted" style={{ fontSize: 13 }}>{THEATRES[bt.theatre].label}: {bt.where}. {bt.sides[0].commander.name} commands {bt.sides[0].name} ({bt.fighters.filter((f) => f.side === 0).map((f) => f.name).join(', ')}) against {bt.sides[1].name}.</span>
            <div className="actions">
              <button type="button" className="btn primary" onClick={() => onCommand(bt.id)}>Take command ›</button>
              <button type="button" className="btn" onClick={() => { game.update((w) => fightItOut(w, bt.id)); onCommand(bt.id); }}>Leave it to {bt.sides[0].commander.name}, and watch the report</button>
            </div>
          </div>
        ) : !ids.length ? (
          <div className="actions body"><button type="button" className="btn primary" onClick={() => onClose(true)}>Carry on ▶</button></div>
        ) : null}
      </div>
    </div>
  );
}
