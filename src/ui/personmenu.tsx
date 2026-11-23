// Right-click (or long-press) on anyone's name: the decisions you can make about them, right there.
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useGame, useNav, useWorld } from './context';
import { decisionsFor, doingNow, GROUPS, tryRun, type Decision } from './decisions';
import { displayName } from '../sim/names';
import { ageOf } from '../sim/characters';

export function PersonMenuLayer({ id, x, y, onClose, onDone }: { id: string; x: number; y: number; onClose: () => void; onDone: (msg: string) => void }) {
  const world = useWorld();
  const game = useGame();
  const nav = useNav();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [openSub, setOpenSub] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const c = world.characters[id];

  // Keep it on screen.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8));
    const top = y + r.height + 8 > window.innerHeight ? Math.max(8, window.innerHeight - r.height - 8) : y;
    setPos({ left, top });
  }, [x, y, openSub]);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const btns = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
      const i = btns.indexOf(document.activeElement as HTMLButtonElement);
      const n = btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length];
      if (n) { e.preventDefault(); n.focus(); }
    };
    const scroll = () => onClose();
    document.addEventListener('mousedown', down);
    window.addEventListener('keydown', key, true);
    window.addEventListener('resize', scroll);
    return () => { document.removeEventListener('mousedown', down); window.removeEventListener('keydown', key, true); window.removeEventListener('resize', scroll); };
  }, [onClose]);

  if (!c) return null;
  const all = decisionsFor(world, id).filter((d) => !d.pageOnly);
  const now = doingNow(world, c);

  const act = (d: Decision, parent?: Decision) => {
    if (d.why || d.info) return;
    if (d.sub) { setOpenSub(openSub === d.key ? null : d.key); return; }
    if (d.to) { nav.to(d.to); onClose(); return; }
    const r = tryRun(world, d);
    if (r.error) { setErr(r.error); return; }
    game.update((w) => { try { return d.run!(w); } catch { return w; } });
    onDone(`${parent ? `${parent.label}: ` : ''}${d.label} · ${c.name.given}`);
    onClose();
  };

  const item = (d: Decision, parent?: Decision): React.ReactNode => {
    const inner = !!parent;
    return (
    <Fragment key={d.key}>
      <button type="button" role="menuitem" className={`pm-item${d.info ? ' info' : ''}${inner ? ' inner' : ''}${d.primary && !d.why ? ' primary' : ''}`} disabled={!!d.why || d.info} aria-expanded={d.sub ? openSub === d.key : undefined} onClick={() => act(d, parent)}>
        <span className="pm-label">{d.label}{d.sub ? <span aria-hidden="true">{openSub === d.key ? ' ▾' : ' ▸'}</span> : d.to ? <span aria-hidden="true"> ›</span> : null}</span>
        {d.why ? <span className="pm-why">{d.why}</span> : d.note ? <span className="pm-note">{d.note}</span> : null}
      </button>
      {d.sub && openSub === d.key ? d.sub.map((s) => item(s, d)) : null}
    </Fragment>
  );
  };

  return (
    <div ref={ref} className="person-menu" role="menu" aria-label={`Decisions about ${displayName(c.name)}`} style={{ left: pos.left, top: pos.top }} onContextMenu={(e) => e.preventDefault()}>
      <div className="pm-head">
        <strong>{displayName(c.name)}{c.alive ? '' : ' †'}</strong>
        <span className="muted">{c.role} · {ageOf(c, world.date)}{world.houses[c.houseId] && c.houseId !== world.playerHouseId ? ` · House ${world.houses[c.houseId]!.name}` : ''}</span>
        {now ? <span className="muted">{now}</span> : null}
      </div>
      {GROUPS.map((g) => {
        const items = all.filter((d) => d.group === g);
        if (!items.length) return null;
        return (
          <Fragment key={g}>
            <div className="pm-group" role="presentation">{g}</div>
            {items.map((d) => item(d))}
          </Fragment>
        );
      })}
      {err ? <p className="pm-err">{err}</p> : null}
    </div>
  );
}

export function Toast({ msg }: { msg: string }) {
  return <div className="toast" role="status">✓ {msg}</div>;
}
