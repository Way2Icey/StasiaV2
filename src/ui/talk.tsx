// An audience: three exchanges with someone, choosing what to say from what we know of the stars' history,
// of this world's, and of them.
import { useState } from 'react';
import { useGame, useNav, useWorld } from './context';
import { Panel, PersonLink } from './links';
import { ArchonHouseLink } from './archon';
import { AIM_NOTE, AIM_TEXT, aimsFor, BEATS, cannotTalk, leaveTalk, openTalk, say, talkMemory, type TalkAim } from '../sim/talk';
import { barsOf, DISLIKE_TIERS, LIKE_TIERS, tierOf } from '../sim/relationships';
import { formatDate } from '../sim/time';
import type { World } from '../sim/types';

const KIND_MARK: Record<string, string> = { lore: '§', past: '◷', appeal: '◇', view: '⚖', recall: '↺' };

export function TalkPage({ id }: { id: string }) {
  const world = useWorld();
  const game = useGame();
  const nav = useNav();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: (w: World) => World) => game.update((w) => { try { setErr(null); return fn(w); } catch (e) { setErr((e as Error).message); return w; } });
  const t = world.talk;
  const who = t ? t.with : id;
  const c = world.characters[who];
  if (!c) return <p className="error">That person is not in this world.</p>;
  const lord = world.houses[world.playerHouseId]?.rulerId;
  const b = lord ? barsOf(world, c.id, lord) : undefined;
  const feel = b ? [tierOf(b.like, LIKE_TIERS), tierOf(b.dislike, DISLIKE_TIERS)].filter(Boolean).join(', but ').toLowerCase() || 'no strong feeling' : '';
  const why = t ? null : cannotTalk(world, who);
  const mem = talkMemory(world, who);
  return (
    <>
      <div className="page-title">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span className="eyebrow">An audience</span>
          <h2>{c.name.given} {c.name.family ?? ''}</h2>
          <p><PersonLink c={c} /> · {c.role}{c.houseId ? <> · House <ArchonHouseLink id={c.houseId} /></> : null}{feel ? ` · toward our Highroy: ${feel}` : ''}</p>
        </div>
      </div>
      {err ? <p className="body error">{err}</p> : null}
      <div className="grid">
        <Panel title={t ? `${AIM_TEXT[t.aim]} · ${Math.min(t.beat + 1, BEATS)} of ${BEATS}` : 'What do you want from it?'} className="span-8">
          {!t ? (
            <>
              {why ? <p className="body muted" style={{ margin: 0 }}>{why}.</p> : null}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {aimsFor(world, who).map((a: TalkAim) => (
                  <button key={a} type="button" className="btn talk-line" disabled={!!why} onClick={() => run((w) => openTalk(w, who, a))}>
                    <strong>{AIM_TEXT[a]}</strong> <span className="muted">· {AIM_NOTE[a]}</span>
                  </button>
                ))}
              </div>
              <p className="muted" style={{ margin: 0, fontSize: 12 }}>
                Three exchanges. What you say is drawn from the history of the stars, from what has happened in this world, and from who they are. Nothing tells you which lines are right. Some history is told wrong, some deeds belong to someone else, and they will remember your mistakes.
              </p>
            </>
          ) : (
            <>
              <div className="talk-log" aria-live="polite">
                {t.said.map((s, i) => (
                  <p key={i} className={`talk-said ${s.who}${s.tone ? ` ${s.tone}` : ''}`}>{s.who === 'us' ? <span className="mono gold">› </span> : null}{s.text}</p>
                ))}
              </div>
              {t.done ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {t.done.effects.length ? <ul className="effects" style={{ margin: 0 }}>{t.done.effects.map((e) => <li key={e}>{e}</li>)}</ul> : <p className="muted" style={{ margin: 0 }}>Nothing much came of it.</p>}
                  <span className="actions">
                    <button type="button" className="btn primary" onClick={() => run(leaveTalk)}>Done</button>
                    <button type="button" className="btn" onClick={() => { run(leaveTalk); nav.to({ kind: 'character', id: who }); }}>Back to {c.name.given}</button>
                  </span>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {t.options.map((o) => (
                      <button key={o.id} type="button" className="btn talk-line" onClick={() => run((w) => say(w, o.id))}>
                        <span className="mono muted" aria-hidden>{KIND_MARK[o.kind]} </span>{o.text}
                        {o.hint ? <span className="muted" style={{ fontSize: 11 }}> · {o.hint}</span> : null}
                      </button>
                    ))}
                  </div>
                  <span className="actions"><button type="button" className="btn small" onClick={() => run(leaveTalk)}>Get up and leave</button></span>
                </>
              )}
            </>
          )}
        </Panel>
        <Panel title="Between you" className="span-4">
          <dl className="kv body" style={{ margin: 0, fontSize: 12 }}>
            <dt>Audiences</dt><dd>{mem ? `${mem.talks}, last ${formatDate(mem.last)}` : 'None yet'}</dd>
            <dt>How they went</dt><dd>{!mem ? '—' : mem.warmth > 2 ? 'Well' : mem.warmth < -2 ? 'Badly' : 'Middling'}</dd>
            {mem?.slips.length ? <><dt>They remember</dt><dd>{mem.slips.map((s) => <div key={s} className="muted">"{s}"</div>)}</dd></> : null}
          </dl>
          <p className="body muted" style={{ margin: 0, fontSize: 11 }}>
            § the history of the stars · ◷ this world's past · ◇ who they are · ⚖ where their house stands · ↺ last time
          </p>
        </Panel>
      </div>
    </>
  );
}
