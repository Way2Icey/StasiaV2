// The councillor at the door: one briefing at a time, with what they ask, what you approved, and how it went.
import { useState } from 'react';
import { useGame, useNav, useWorld } from './context';
import { PersonLink } from './links';
import { Portrait } from './portrait';
import { briefDone, dismissBriefing, openBriefings, summarySince, type Briefing } from '../sim/briefings';
import { answerConcern } from '../sim/concerns';
import { approvePetition, dismissPetition, petitionPlan } from '../sim/council';
import { receiveRequest, turnAway } from '../sim/talk';
import { SEAT_TITLE } from '../sim/world';
import type { Character, World } from '../sim/types';

/** Who is speaking, and from which seat. */
export function Speaker({ c, seat, note }: { c: Character; seat?: string; note?: string }) {
  const world = useWorld();
  return (
    <div className="brief-head">
      <Portrait c={c} date={world.date} high size="small" />
      <span style={{ display: 'grid', gap: 2 }}>
        <span className="eyebrow gold">{seat ? SEAT_TITLE[seat as keyof typeof SEAT_TITLE] ?? seat : c.role}</span>
        <span><PersonLink c={c} />{note ? <span className="muted"> · {note}</span> : null}</span>
      </span>
    </div>
  );
}

export function BriefingCard({ b }: { b: Briefing }) {
  const world = useWorld();
  const game = useGame();
  const nav = useNav();
  const [err, setErr] = useState<string | null>(null);
  const c = world.characters[b.personId];
  if (!c) return null;
  /** Do the thing, then write down what was approved and what came of it. */
  const act = (approved: string, fn: (w: World) => World, go?: () => void) => {
    game.update((w) => {
      try {
        setErr(null);
        const before = w.feed.length;
        const after = fn(w);
        const x = structuredClone(after);
        briefDone(x, b.id, approved, summarySince(x, before));
        return x;
      } catch (e) { setErr((e as Error).message); return w; }
    });
    go?.();
  };
  const close = () => game.update((w) => dismissBriefing(w, b.id));
  const P = world.playerHouseId;
  const con = b.kind === 'concern' ? (world.concerns ?? []).find((x) => x.id === b.ref) : undefined;
  const pet = b.kind === 'petition' ? world.courts[P]?.petitions.find((x) => x.id === b.ref) : undefined;
  const req = b.kind === 'request' ? (world.talkRequests ?? []).find((x) => x.id === b.ref) : undefined;
  const voice = b.kind === 'mission' ? 'reports' : b.kind === 'word' ? 'brings word' : b.kind === 'request' ? 'at the door' : 'asks your leave';
  return (
    <div className="briefing">
      <Speaker c={c} seat={b.seat} note={voice} />
      <strong className="brief-title">{b.title}</strong>
      <div className="brief-lines">{b.lines.map((l, i) => <p key={i} className={i === 0 && b.kind !== 'word' ? 'quote' : ''}>{i === 0 && b.kind !== 'word' && b.kind !== 'mission' ? `“${l}”` : l}</p>)}</div>
      {pet && !b.done ? <p className="muted" style={{ fontSize: 12, margin: 0 }}>Their plan: {petitionPlan(world, pet).text}</p> : null}
      {err ? <p className="error" style={{ margin: 0 }}>{err}</p> : null}
      {b.done ? (
        <div className="brief-done">
          <span className="eyebrow">You approved</span>
          <strong>{b.done.approved}</strong>
          {b.done.summary.length ? <ul>{b.done.summary.map((l, i) => <li key={i}>{l}</li>)}</ul> : null}
          <div className="actions"><button type="button" className="btn primary" onClick={close}>Thank them ›</button></div>
        </div>
      ) : (
        <div className="actions">
          {con ? <>
            <button type="button" className="btn primary" onClick={() => act(con.yes, (w) => answerConcern(w, con.id, true))}>{con.yes}</button>
            <button type="button" className="btn" onClick={() => act(con.no, (w) => answerConcern(w, con.id, false))}>{con.no}</button>
          </> : null}
          {pet ? <>
            <button type="button" className="btn primary" onClick={() => act('Their plan, as they set it out', (w) => approvePetition(w, P, pet.id))}>Approve their plan</button>
            <button type="button" className="btn" onClick={() => { close(); nav.to({ kind: 'plan', mission: pet.kind, target: pet.targetId ?? pet.targetHouseId ?? pet.targetPlanetId, leader: pet.leaderId, petition: pet.id }); }}>Plan it myself ›</button>
            <button type="button" className="btn" onClick={() => act('Not now', (w) => dismissPetition(w, P, pet.id))}>Not now</button>
          </> : null}
          {req ? <>
            <button type="button" className="btn primary" onClick={() => { game.update((w) => { try { return dismissBriefing(receiveRequest(w, req.id, 'warm'), b.id); } catch { return w; } }); nav.to({ kind: 'talk', id: req.personId }); }}>Show them in</button>
            <button type="button" className="btn" onClick={() => act('Turned them away', (w) => turnAway(w, req.id))}>Turn them away</button>
          </> : null}
          {b.kind === 'mission' || b.kind === 'word' ? <>
            <button type="button" className="btn primary" onClick={close}>Understood</button>
            {b.kind === 'mission' ? <button type="button" className="btn" onClick={() => { close(); nav.to({ kind: 'mission', id: b.ref }); }}>The full report ›</button> : null}
          </> : null}
          {!con && !pet && !req && b.kind !== 'mission' && b.kind !== 'word' ? <button type="button" className="btn" onClick={close}>It has passed</button> : null}
        </div>
      )}
    </div>
  );
}

/** The queue at the door, head first. */
export function AtTheDoor() {
  const world = useWorld();
  const q = openBriefings(world);
  if (!q.length) return null;
  const head = q.find((b) => b.done) ?? q[0]!;
  return (
    <>
      {q.length > 1 ? <div className="brief-queue muted">{q.length - 1} more waiting: {q.filter((b) => b !== head).map((b) => world.characters[b.personId]?.name.given).filter(Boolean).join(', ')}</div> : null}
      <BriefingCard key={head.id} b={head} />
    </>
  );
}
