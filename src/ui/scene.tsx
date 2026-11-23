// The live-scene window: the same shape as the battle window, for sessions, negotiations, rituals,
// infiltrations, audiences, ceremonies, crises and the chronicle.
import { useEffect, useRef } from 'react';
import { useGame, useWorld } from './context';
import { PersonById } from './links';
import { actScene, autoScene, sceneOf } from '../sim/scene';
import { shortName } from '../sim/names';

function Meter({ v, labels }: { v: number; labels: [string, string] }) {
  const left = v >= 0 ? 50 : 50 + v / 2;
  return (
    <div className="momentum">
      <span className="muted">{labels[0]}</span>
      <div className="meter" role="img" aria-label={`${Math.round(v)}`}><span className="mid" /><span className="fill" style={{ left: `${left}%`, width: `${Math.min(50, Math.abs(v) / 2)}%` }} /></div>
      <span className="muted">{labels[1]}</span>
    </div>
  );
}

export function SceneWindow({ id, onClose }: { id: string; onClose: () => void }) {
  const world = useWorld();
  const game = useGame();
  const s = sceneOf(world, id);
  const feedRef = useRef<HTMLDivElement>(null);
  useEffect(() => { feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight }); }, [s?.feed.length]);
  if (!s) return null;
  const over = s.status === 'over';
  const leave = s.leaveTo ? world.characters[s.leaveTo] : undefined;
  return (
    <div className="moment-veil" role="dialog" aria-modal="true" aria-label={s.title}>
      <div className="battle scene">
        <header>
          <span className="eyebrow">{s.eyebrow}</span>
          <strong>{s.title}</strong>
          {s.where ? <span className="muted" style={{ fontSize: 12 }}>{s.where}{over ? '' : ` · step ${Math.min(s.step + 1, s.maxSteps)} of ${s.maxSteps}`}</span> : null}
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {!over ? <button type="button" className="btn small" onClick={() => game.update((w) => autoScene(w, id))} title="They make the remaining choices">{leave ? `Leave it to ${shortName(leave.name)}` : 'Let it play out'}</button>
              : <button type="button" className="btn primary small" onClick={onClose}>Close</button>}
          </span>
        </header>
        <Meter v={s.meter} labels={s.meterLabels} />
        <div className="bgrid">
          <div className="bside">
            <span className="eyebrow">Ours</span>
            {s.ours.length ? s.ours.map((o) => <div key={o} style={{ fontSize: 13 }}><PersonById id={o} /></div>) : <span className="muted" style={{ fontSize: 12 }}>the house</span>}
            {s.gauges.map((g) => (
              <div key={g.label} style={{ fontSize: 12 }}>
                <div className="row" style={{ border: 0, padding: 0, justifyContent: 'space-between' }}><span>{g.label}</span><span className="mono">{Math.round(g.value)}/{g.max}</span></div>
                <div className={`bbar${g.bad ? ' bad' : ''}`}><span style={{ width: `${Math.max(0, Math.min(100, (g.value / g.max) * 100))}%` }} /></div>
              </div>
            ))}
          </div>
          <div className="bmid">
            <div className="bmoment">
              <span className="eyebrow">{over ? (s.result?.good ? 'It went our way' : 'It did not go our way') : 'Now'}</span>
              <p style={{ margin: '4px 0 8px' }}>{s.prompt}</p>
              {!over ? (
                <div className="actions">
                  {s.options.map((o) => (
                    <button key={o.key} type="button" className="btn small option" disabled={!!o.why} title={o.why ?? undefined} onClick={() => game.update((w) => actScene(w, id, o.key))}>
                      <span>{o.label}</span>
                      {o.hint || o.odds !== undefined || o.why ? <span className="opt-sub">{o.why ?? [o.hint, o.odds !== undefined ? `${Math.round(o.odds * 100)}%` : null].filter(Boolean).join(' · ')}</span> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="feed" ref={feedRef}>
              {s.feed.map((l, i) => <div key={i} className={`fline${l.big ? ' big' : ''}${l.good ? ' us' : ''}${l.bad ? ' them' : ''}`}>{l.text}</div>)}
            </div>
          </div>
          <div className="bside">
            <span className="eyebrow">Across from us</span>
            {s.theirs.map((t, i) => (
              <div key={i} style={{ fontSize: 13 }}>
                {t.id ? <PersonById id={t.id} /> : <span>{t.name}</span>}
                {t.note ? <div className="muted" style={{ fontSize: 11 }}>{t.note}</div> : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
