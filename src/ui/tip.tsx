// Hover (or tap, or focus) a word to see what it means.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { GLOSSARY } from '../data/glossary';
import { QUARTER_ECONOMY, RESOURCE_LABEL, type Resource } from '../data/economy';

const WIDTH = 270;

export function Tip({ content, children, className }: { content: ReactNode; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();
  const [pos, setPos] = useState<{ x: number; y: number; above: boolean } | null>(null);
  const openedAt = useRef(0);

  const show = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = Math.max(8, Math.min(r.left, window.innerWidth - WIDTH - 8));
    const above = r.bottom + 160 > window.innerHeight;
    openedAt.current = Date.now();
    setPos({ x, y: above ? r.top - 6 : r.bottom + 6, above });
  };
  const hide = () => setPos(null);

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [pos]);

  return (
    <>
      <span
        ref={ref}
        className={`term ${className ?? ''}`}
        tabIndex={0}
        aria-describedby={pos ? id : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={() => {
          // A tap fires a hover first; don't let the same tap close it again.
          if (pos && Date.now() - openedAt.current > 400) hide(); else show();
        }}
      >
        {children}
      </span>
      {pos ? createPortal(
        <div id={id} role="tooltip" className="tip" style={{ left: pos.x, top: pos.y, width: WIDTH, transform: pos.above ? 'translateY(-100%)' : undefined }}>
          {content}
        </div>,
        document.body,
      ) : null}
    </>
  );
}

/** A word from the glossary, underlined, with its definition on hover. */
export function Term({ k, children }: { k: string; children?: ReactNode }) {
  const g = GLOSSARY[k];
  if (!g) return <>{children}</>;
  return (
    <Tip content={<><strong>{g.term}</strong><span>{g.text}</span></>}>
      {children ?? g.term}
    </Tip>
  );
}

/** A stat name with its definition. */
export function StatTerm({ id, label }: { id: string; label: string }) {
  return <Term k={`stat:${id}`}>{label}</Term>;
}

/** A quarter's name, with what it makes and costs each Phase. */
export function QuarterTerm({ name, kind, gives }: { name: string; kind?: string; gives?: string }) {
  const econ = QUARTER_ECONOMY[name];
  const flows = econ ? (Object.entries(econ.flow) as [Resource, number][]) : [];
  return (
    <Tip content={(
      <>
        <strong>{name}</strong>
        {kind ? <span className="muted">{kind}</span> : null}
        {flows.length ? (
          <span className="tip-flows">
            {flows.map(([r, v]) => (
              <span key={r} className={v >= 0 ? 'up' : 'down'}>{v >= 0 ? '+' : '−'}{Math.abs(v).toLocaleString('en-US')} {RESOURCE_LABEL[r].toLowerCase()}</span>
            ))}
            <span className="muted">per Phase, before the overseer and unrest</span>
          </span>
        ) : null}
        {econ?.computing ? <span>{econ.computing} computing per Orbit</span> : null}
        {econ?.takings ? <span className="muted">Takings here can be skimmed by a greedy overseer.</span> : null}
        {!econ && gives ? <span>{gives}</span> : null}
      </>
    )}>
      {name}
    </Tip>
  );
}
