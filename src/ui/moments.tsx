// A moment: the clock has stopped for something. Decisions are answered here, over whatever page is open;
// when the last is answered, time runs on by itself.
import { useEffect } from 'react';
import { AtTheDoor, Speaker } from './briefing';
import { bringer, openBriefings, SEAT_FOR_CATEGORY } from '../sim/briefings';
import { eventDef, type ResolvedEvent } from '../sim/events';
import { useWorld } from './context';
import { Decision } from './events';
import { useGame, useNav } from './context';
import { battleOf, fightItOut, THEATRES } from '../sim/battle';

export function MomentWindow({ ids, reason, battle, onClose, onCommand }: { ids: string[]; reason: string; battle?: string; onClose: (resume: boolean) => void; onCommand: (id: string) => void }) {
  const world = useWorld();
  const game = useGame();
  const nav = useNav();
  const bt = battle ? battleOf(world, battle) : undefined;
  const live = ids.map((id) => world.events.pending.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p);
  // What was answered here, as the councillor tells it back.
  const answered = ids.filter((id) => !live.some((p) => p.id === id)).map((id) => world.events.log.find((r) => r.id === id)).filter((r): r is NonNullable<typeof r> => !!r);
  const door = openBriefings(world);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(false); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <div className="moment-veil" role="dialog" aria-modal="true" aria-label="A moment">
      <div className="moment">
        <header>
          <span className="eyebrow">Time stands still</span>
          <strong>{live.length ? reason : door.length ? 'The council at the door' : reason}</strong>
          <button type="button" className="btn small" onClick={() => onClose(false)} title="Esc: look around first; the clock stays paused">Look around</button>
        </header>
        {live.map((p) => <Decision key={p.id} p={p} />)}
        {answered.map((r) => <Answered key={r.id} r={r} />)}
        {!live.length ? <AtTheDoor /> : null}
        {bt ? (
          <div className="body" style={{ display: 'grid', gap: 8 }}>
            <span className="muted" style={{ fontSize: 13 }}>{THEATRES[bt.theatre].label}: {bt.where}. {bt.sides[0].commander.name} commands {bt.sides[0].name} ({bt.fighters.filter((f) => f.side === 0).map((f) => f.name).join(', ')}) against {bt.sides[1].name}.</span>
            <div className="actions">
              <button type="button" className="btn primary" onClick={() => onCommand(bt.id)}>Take command ›</button>
              <button type="button" className="btn" onClick={() => { game.update((w) => fightItOut(w, bt.id)); onCommand(bt.id); }}>Leave it to {bt.sides[0].commander.name}, and watch the report</button>
            </div>
          </div>
        ) : !live.length && !door.some((b) => !b.done) ? (
          <div className="actions body"><button type="button" className="btn primary" onClick={() => onClose(true)}>Carry on ▶</button><button type="button" className="btn" onClick={() => { nav.to({ kind: 'throne' }); onClose(false); }}>See the desk ›</button></div>
        ) : null}
      </div>
    </div>
  );
}

/** A decision answered: the councillor who brought it says what you chose and what came of it. */
function Answered({ r }: { r: ResolvedEvent }) {
  const world = useWorld();
  const by = bringer(world, SEAT_FOR_CATEGORY[eventDef(r.defId)?.category ?? ''] ?? 'envoy');
  const c = by ? world.characters[by.personId] : undefined;
  return (
    <div className="briefing">
      {c ? <Speaker c={c} seat={by!.seat} note="reports back" /> : null}
      <strong className="brief-title">{r.title}</strong>
      <div className="brief-done">
        <span className="eyebrow">You approved</span>
        <strong>{r.choice}</strong>
        {r.lines.length ? <ul>{r.lines.map((l, i) => <li key={i}>{l}.</li>)}</ul> : null}
      </div>
    </div>
  );
}
