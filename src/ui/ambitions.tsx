// Ambitions on screen: the audience chamber, what people want, and the Highroy's own hand.
import { Term } from './tip';
import { useState } from 'react';
import { useGame, useNav, useWorld } from './context';
import { AIM_NOTE, AIM_TEXT, aimsFor, cannotTalk, receiveRequest, turnAway } from '../sim/talk';
import { SEAT_TITLE } from '../sim/world';
import { Go, HouseLink, Panel, PersonById, PersonLink } from './links';
import { Portrait } from './portrait';
import {
  AMBITION_LABEL, ambitionText, answerAudience, appointToSeat, blocker, cannotHoldAudience, cannotKnight, knight, holdAudience, optionsFor, seatTitle,
  type Ambition, type Answer, type Audience,
  willOf,
} from '../sim/ambitions';
import { knowledgeOf } from '../sim/knowledge';
import { opinion } from '../sim/relationships';
import { formatDate } from '../sim/time';
import { isAway } from '../sim/court';
import type { Character, CouncilSeat, World } from '../sim/types';

function usePlay() {
  const game = useGame();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: (w: World) => World) => game.update((w) => { try { setErr(null); return fn(w); } catch (e) { setErr((e as Error).message); return w; } });
  return { run, err };
}

function bar(v: number, w = 10): string { const n = Math.max(0, Math.min(w, Math.round((v / 100) * w))); return '█'.repeat(n) + '░'.repeat(w - n); }

/** One person standing before the Highroy, and the answers open to them. */
export function AudienceCard({ au, onDone }: { au: Audience; onDone?: () => void }) {
  const world = useWorld();
  const { run, err } = usePlay();
  const c = world.characters[au.characterId];
  if (!c) return null;
  const lord = world.houses[world.playerHouseId]?.rulerId;
  const opts = optionsFor(world, au);
  return (
    <div className="body" style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Portrait c={c} date={world.date} size="small" />
        <div style={{ display: 'grid', gap: 2 }}>
          <span className="eyebrow">An audience · {AMBITION_LABEL[au.kind]}</span>
          <span><PersonLink c={c} /> <span className="muted">· {c.role}{lord ? ` · thinks of you ${opinion(world, c.id, lord) > 0 ? '+' : ''}${Math.round(opinion(world, c.id, lord))}` : ''}</span></span>
        </div>
      </div>
      <p style={{ margin: 0 }}>{au.text}</p>
      <div style={{ display: 'grid', gap: 6 }}>
        {opts.map((o) => (
          <button key={o.id} type="button" className="btn option" disabled={!!o.disabled} title={o.disabled ?? undefined} onClick={() => { run((w) => answerAudience(w, au.id, o.id as Answer)); onDone?.(); }} style={{ textAlign: 'left', display: 'grid', gap: 2, whiteSpace: 'normal', height: 'auto' }}>
            <span>{o.label}{o.disabled ? ` — ${o.disabled}` : ''}</span>
            <span className="muted" style={{ fontSize: 12, textTransform: 'none', letterSpacing: 0 }}>{o.note}</span>
          </button>
        ))}
      </div>
      <span className="muted" style={{ fontSize: 12 }}>Leave it and they will take the silence as an answer by {formatDate(au.expires)}.</span>
      {err ? <p className="error" style={{ margin: 0 }}>{err}</p> : null}
    </div>
  );
}

/** On a character's page: what they want, and the Highroy's hand. */
export function WantsPanel({ id, className }: { id: string; className?: string }) {
  const world = useWorld();
  const { run, err } = usePlay();
  const c = world.characters[id];
  const [seat, setSeat] = useState<CouncilSeat | ''>('');
  if (!c?.alive) return null;
  const P = world.playerHouseId;
  const ours = c.houseId === P;
  const a = world.ambitions?.of[id];
  const knows = ours ? !!a?.known : knowledgeOf(world, P, id).depth >= 50;
  const why = ours ? cannotHoldAudience(world, id) : 'Not one of ours';
  const b = a ? blocker(world, c, a) : undefined;
  const seats: CouncilSeat[] = ['grandMaster', 'envoy', 'spymaster', 'steward', 'physician', 'elder', 'champion'];
  return (
    <Panel title="What they want" aside={a && knows ? AMBITION_LABEL[a.kind] : 'unknown'} className={className}>
      <div className="body" style={{ display: 'grid', gap: 8 }}>
        {a && knows ? (
          <>
            <span>{c.name.given} {ambitionText(world, a)}.{b && b.id !== c.id && a.kind === 'seat' ? <> <PersonById id={b.id} /> holds it now.</> : null}</span>
            <span className="mono muted">FRUSTRATION [{bar(a.frustration)}] {Math.round(a.frustration)}{a.promised ? ` · promised, by ${formatDate(a.promised)}` : ''}</span>
            <span className="muted" style={{ fontSize: 12 }}><Term k="will">{willOf(world, id) >= 80 ? 'Close to doing something about it.' : willOf(world, id) >= 40 ? 'Gathering themselves.' : 'Biding their time.'}</Term></span>
          </>
        ) : a ? <span className="muted">{ours ? 'They have not said. Call them to an audience to find out.' : 'We do not know them well enough to say.'}</span> : <span className="muted">Nothing just now. They are content.</span>}
        {ours && c.seat !== 'highroy' ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" className="btn small primary" disabled={!!why} title={why ?? 'Once a Phase. They say what they want, and feel heard.'} onClick={() => run((w) => holdAudience(w, id))}>{why ?? 'Call to an audience'}</button>
            <select className="select" aria-label="Name to a seat" value={seat} onChange={(e) => setSeat(e.target.value as CouncilSeat)}>
              <option value="">Name to the council…</option>
              {seats.filter((s) => s !== c.seat).map((s) => <option key={s} value={s}>{seatTitle(s)}</option>)}
            </select>
            <button type="button" className="btn small" disabled={!seat || isAway(world, id)} onClick={() => { if (seat) run((w) => appointToSeat(w, seat, id)); setSeat(''); }}>Name them</button>
            {c.role !== 'Knight' && !c.seat ? <button type="button" className="btn small" disabled={!!cannotKnight(world, id)} title={cannotKnight(world, id) ?? '300 othes and a ceremony in the hall'} onClick={() => run((w) => knight(w, id))}>Knight them</button> : null}
          </div>
        ) : null}
        {err ? <p className="error" style={{ margin: 0 }}>{err}</p> : null}
      </div>
    </Panel>
  );
}

/** Court › Audiences & ambitions: who is asking to see us, and what our own people want. */
function AimTable({ rows, lead }: { rows: { c: Character; a: Ambition }[]; lead?: boolean }) {
  const world = useWorld();
  const first = lead ? rows.find(({ c, a }) => a.frustration >= 50 && !cannotTalk(world, c.id))?.c.id : undefined;
  return (
    <div className="table-wrap">
      <table className="ctable">
        <thead><tr><th>WHO</th><th>WANTS</th><th>IN THE WAY</th><th>FRUSTRATION</th><th></th></tr></thead>
        <tbody>
          {rows.map(({ c, a }) => {
            const b = blocker(world, c, a);
            return (
              <tr key={c.id} className={c.id === first ? 'lead' : undefined}>
                <td><PersonLink c={c} /></td>
                <td>{ambitionText(world, a).replace(/^wants /, '')}{a.promised ? <span className="muted"> · promised</span> : null}</td>
                <td>{b && b.id !== c.id ? <PersonById id={b.id} /> : <span className="muted">—</span>}</td>
                <td className="mono" style={{ color: a.frustration >= 70 ? 'var(--orange)' : undefined }}>[{bar(a.frustration)}] {Math.round(a.frustration)}</td>
                <td style={{ textAlign: 'right' }}>{cannotTalk(world, c.id) ? null : <Go to={{ kind: 'talk', id: c.id }} className={`btn small${c.id === first ? ' lead' : ''}`}>Audience ›</Go>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function AmbitionsView() {
  const world = useWorld();
  const { run, err } = usePlay();
  const nav = useNav();
  const P = world.playerHouseId;
  const rows = Object.entries(world.ambitions?.of ?? {})
    .map(([id, a]) => ({ c: world.characters[id]!, a }))
    .filter(({ c, a }) => c?.alive && c.houseId === P && a.known)
    .sort((x, y) => y.a.frustration - x.a.frustration);
  const unknown = Object.entries(world.ambitions?.of ?? {}).filter(([id, a]) => world.characters[id]?.houseId === P && world.characters[id]?.alive && !a.known).length;
  const waiting = (world.ambitions?.audiences ?? []).filter((au) => world.characters[au.characterId]?.alive);
  const asks = (world.talkRequests ?? []).filter((r) => world.characters[r.personId]?.alive);
  return (
    <div className="grid">
      <Panel title="Asking to see you" aside={`${waiting.length + asks.length} waiting`} className="span-12">
        {err ? <p className="body error" style={{ margin: 0 }}>{err}</p> : null}
        {waiting.length + asks.length === 0 ? <p className="body muted" style={{ margin: 0 }}>No one is waiting. People come when something gnaws at them, or when they have something to say.</p> : null}
        {waiting.map((au) => <div key={au.id} style={{ borderBottom: '1px solid var(--line-soft)' }}><AudienceCard au={au} /></div>)}
        {asks.map((r) => {
          const c = world.characters[r.personId]!;
          return (
            <div key={r.id} className="row petition">
              <span style={{ flex: 1, minWidth: 0 }}><PersonLink c={c} /> <span className="muted">· {c.seat ? SEAT_TITLE[c.seat] : c.role}{c.houseId !== P ? <> of House <HouseLink id={c.houseId} /></> : null}</span> {r.why}. <span className="muted" style={{ fontSize: 11 }}>Until {formatDate(r.expires)}.</span></span>
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
                {aimsFor(world, c.id).map((a) => <button key={a} type="button" className={`btn small${a === 'warm' ? ' primary' : ''}`} title={AIM_NOTE[a]} onClick={() => { run((w) => receiveRequest(w, r.id, a)); nav.to({ kind: 'talk', id: c.id }); }}>Receive: {AIM_TEXT[a].toLowerCase()}</button>)}
                <button type="button" className="btn small" onClick={() => run((w) => turnAway(w, r.id))}>Turn them away</button>
              </span>
            </div>
          );
        })}
      </Panel>
      <Panel title="The most restless" aside={`${rows.length} known · ${unknown} unspoken`} className="span-12">
        <p className="body muted" style={{ margin: 0 }}>Everyone of note wants something. Unmet, it gnaws at them: past 35 they come to you; past 85 they act on their own, against whoever stands in the way, or by leaving for a house that will give it. A promise buys two Orbits.</p>
        <AimTable rows={rows.slice(0, 5)} lead />
      </Panel>
      {rows.length > 5 ? (
        <Panel title="Everyone else who wants something" aside={`${rows.length - 5}`} fold className="span-12">
          <AimTable rows={rows.slice(5)} />
        </Panel>
      ) : null}
      <p className="muted span-12" style={{ margin: 0, fontSize: 12 }}>To learn what someone wants, call them to an audience from their page.</p>
    </div>
  );
}
