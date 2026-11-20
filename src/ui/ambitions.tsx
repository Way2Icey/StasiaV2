// Ambitions on screen: the audience chamber, what people want, and the Highroy's own hand.
import { useState } from 'react';
import { useGame, useWorld } from './context';
import { HouseLink, Panel, PersonById, PersonLink } from './links';
import { Portrait } from './portrait';
import {
  AMBITION_LABEL, ambitionText, answerAudience, appointToSeat, blocker, cannotHoldAudience, holdAudience, optionsFor, seatTitle,
  type Answer, type Audience,
} from '../sim/ambitions';
import { knowledgeOf } from '../sim/knowledge';
import { opinion } from '../sim/relationships';
import { formatDate } from '../sim/time';
import { isAway } from '../sim/court';
import type { CouncilSeat, World } from '../sim/types';

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
          <button key={o.id} type="button" className="btn option" disabled={!!o.disabled} title={o.disabled ?? undefined} onClick={() => { run((w) => answerAudience(w, au.id, o.id as Answer)); onDone?.(); }} style={{ textAlign: 'left', display: 'grid', gap: 2 }}>
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
          </div>
        ) : null}
        {err ? <p className="error" style={{ margin: 0 }}>{err}</p> : null}
      </div>
    </Panel>
  );
}

/** Relations › Ambitions: everyone whose wants we know, most restless first. */
export function AmbitionsView() {
  const world = useWorld();
  const P = world.playerHouseId;
  const rows = Object.entries(world.ambitions?.of ?? {})
    .map(([id, a]) => ({ c: world.characters[id]!, a }))
    .filter(({ c, a }) => c?.alive && (c.houseId === P ? a.known : knowledgeOf(world, P, c.id).depth >= 50))
    .sort((x, y) => (x.c.houseId === P ? 0 : 1) - (y.c.houseId === P ? 0 : 1) || y.a.frustration - x.a.frustration);
  const unknown = Object.entries(world.ambitions?.of ?? {}).filter(([id, a]) => world.characters[id]?.houseId === P && !a.known).length;
  return (
    <div className="grid">
      <Panel title="Ambitions" aside={`${rows.length} known · ${unknown} of ours unspoken`} className="span-12">
        <p className="body muted" style={{ margin: 0 }}>Everyone of note wants something. Unmet, it gnaws at them: past 40 they come to you; past 85 they act on their own, against whoever stands in the way, or by leaving for a house that will give it. A promise buys two Orbits. Give people what they want and they love you for it, for a while.</p>
        <div className="table-wrap">
          <table className="ctable">
            <thead><tr><th>WHO</th><th>WANTS</th><th>IN THE WAY</th><th>FRUSTRATION</th></tr></thead>
            <tbody>
              {rows.map(({ c, a }) => {
                const b = blocker(world, c, a);
                return (
                  <tr key={c.id}>
                    <td><PersonLink c={c} />{c.houseId !== P ? <span className="muted"> · <HouseLink id={c.houseId} /></span> : null}</td>
                    <td>{ambitionText(world, a).replace(/^wants /, '')}{a.promised ? <span className="muted"> · promised</span> : null}</td>
                    <td>{b && b.id !== c.id ? <PersonById id={b.id} /> : <span className="muted">—</span>}</td>
                    <td className="mono">[{bar(a.frustration)}] {Math.round(a.frustration)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="body muted" style={{ margin: 0, fontSize: 12 }}>To learn what someone of ours wants, call them to an audience from their page.</p>
      </Panel>
    </div>
  );
}
