// Proving grounds on screen: the house tourney, challenges to allow or forbid, pit nights, first commands.
import { useState, type ReactNode } from 'react';
import { useGame, useWorld } from './context';
import { Go, HouseLink, Panel, PersonById, PersonLink } from './links';
import { Term } from './tip';
import { Diamonds } from './careers';
import {
  answerChallenge, answerPitNight, callTourney, cannotCallTourney, cannotSendToPits, fighters, fightScore, PIT_SIDE, TOURNEY_COST, type Bout,
} from '../sim/grounds';
import { readyForCommand } from '../sim/missions';
import { ageOf } from '../sim/characters';
import { SPECIES } from '../data/species';
import { formatDate } from '../sim/time';
import type { World } from '../sim/types';

function usePlay() {
  const game = useGame();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: (w: World) => World) => game.update((w) => { try { setErr(null); return fn(w); } catch (e) { setErr((e as Error).message); return w; } });
  return { run, err };
}

export function GroundsPage() {
  return (
    <>
      <div className="page-title">
        <h2>Proving grounds</h2>
        <p>Where reputations are made before anyone is a knight: the house tourney, duels between people who cannot stand each other, pit nights in other houses' undercities, and a first command. Less sanctioned than the Crucible, and closer to home.</p>
      </div>
      <div className="grid">
        <Challenges className="span-12" />
        <PitNights className="span-12" />
        <Tourney className="span-6" />
        <FirstCommands className="span-6" />
        <History className="span-12" />
      </div>
    </>
  );
}

const young = (world: World, id: string) => { const c = world.characters[id]; return !!c && ageOf(c, world.date) < SPECIES[c.species].adulthood; };

function BoutLine({ b }: { b: Bout }) {
  const loser = b.winner === b.a ? b.b : b.a;
  return <span><PersonById id={b.winner} /> beat <PersonById id={loser} />{b.killed ? <span className="error"> · killed</span> : b.hurt ? <span className="muted"> · hurt</span> : null}</span>;
}

function Tourney({ className }: { className?: string }) {
  const world = useWorld();
  const { run, err } = usePlay();
  const why = cannotCallTourney(world);
  const pool = fighters(world, world.playerHouseId).sort((a, b) => fightScore(b) - fightScore(a)).slice(0, 8);
  return (
    <Panel title={<Term k="tourney">The house tourney</Term>} aside={`${TOURNEY_COST} othes · once a year`} className={className}>
      <p className="body muted" style={{ margin: 0, fontSize: 12 }}>Blunted weapons, a bracket of eight: the house's best and the young who want it most. The court loves it, the winner is remembered, and a youngling who goes deep is talked about for a year.</p>
      <div className="body" style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', fontSize: 13 }}>
        {pool.map((c) => <span key={c.id}><PersonLink c={c} /> <span className="muted mono">{fightScore(c).toFixed(1)}{young(world, c.id) ? ' · young' : ''}</span></span>)}
      </div>
      {err ? <p className="body error" style={{ margin: 0 }}>{err}</p> : null}
      <div className="actions"><button type="button" className="btn small primary" disabled={!!why} title={why ?? ''} onClick={() => run(callTourney)}>{why ?? 'Call the tourney'}</button></div>
    </Panel>
  );
}

function Challenges({ className }: { className?: string }) {
  const world = useWorld();
  const { run, err } = usePlay();
  const list = world.grounds.challenges;
  if (!list.length) return null;
  return (
    <Panel title="A challenge" aside="Allow it, or forbid it" className={className}>
      {err ? <p className="body error" style={{ margin: 0 }}>{err}</p> : null}
      {list.map((c) => {
        const a = world.characters[c.challenger];
        const b = world.characters[c.challenged];
        if (!a || !b) return null;
        return (
          <div key={c.id} className="row petition">
            <span style={{ flex: 1, minWidth: 0 }}>
              <PersonLink c={a} /> has challenged <PersonLink c={b} />{c.foreign ? <> of <HouseLink id={b.houseId} /></> : null} over {c.cause}.
              <span className="muted" style={{ display: 'block', fontSize: 12 }}>Real blades, to first blood: one in three is hurt, a few die. Forbidden, the quarrel festers and the challenger resents it. Ignored, they may fight anyway, without leave, at the house's cost in honour. Decide by {formatDate(c.expires)}.</span>
            </span>
            <span style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button type="button" className="btn small primary" onClick={() => run((w) => answerChallenge(w, c.id, true))}>Allow it</button>
              <button type="button" className="btn small" onClick={() => run((w) => answerChallenge(w, c.id, false))}>Forbid it</button>
            </span>
          </div>
        );
      })}
    </Panel>
  );
}

function PitNights({ className }: { className?: string }) {
  const world = useWorld();
  const { run, err } = usePlay();
  const [picked, setPicked] = useState<string[]>([]);
  const inv = world.grounds.invites[0];
  if (!inv) return null;
  const pool = fighters(world, world.playerHouseId).sort((a, b) => fightScore(b) - fightScore(a));
  const why = cannotSendToPits(world, inv.id, picked);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= PIT_SIDE ? p : [...p, id]));
  return (
    <Panel title={<>Pit night: <HouseLink id={inv.host} /></>} aside={`Answer by ${formatDate(inv.expires)}`} className={className}>
      <p className="body muted" style={{ margin: 0, fontSize: 12 }}>Up to {PIT_SIDE} of ours against their best, one bout each. Winning lifts our name; someone may be hurt, and now and then someone dies. Sending a youngling is a blooding the court will talk about either way.</p>
      <div className="body" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {pool.slice(0, 14).map((c) => (
          <button key={c.id} type="button" className={`btn small${picked.includes(c.id) ? ' primary' : ''}`} onClick={() => toggle(c.id)}>
            {c.name.given} {fightScore(c).toFixed(1)}{young(world, c.id) ? ' · young' : ''}
          </button>
        ))}
      </div>
      {err ? <p className="body error" style={{ margin: 0 }}>{err}</p> : null}
      <div className="actions">
        <button type="button" className="btn small primary" disabled={!!why} title={why ?? ''} onClick={() => { run((w) => answerPitNight(w, inv.id, picked)); setPicked([]); }}>Send {picked.length || ''} to the pits</button>
        <button type="button" className="btn small" onClick={() => run((w) => answerPitNight(w, inv.id, null))}>Decline</button>
      </div>
    </Panel>
  );
}

function FirstCommands({ className }: { className?: string }) {
  const world = useWorld();
  const ready = readyForCommand(world, world.playerHouseId);
  return (
    <Panel title={<Term k="firstCommand">Ready for a first command</Term>} aside={`${ready.length}`} className={className}>
      <p className="body muted" style={{ margin: 0, fontSize: 12 }}>Near-adults who have been taught can lead something small, a scouting run or an inquiry, with someone seasoned alongside. However it goes, it goes on their record.</p>
      {ready.length === 0 ? <p className="body muted" style={{ margin: 0 }}>No one yet.</p> : null}
      {ready.map((c) => (
        <div key={c.id} className="row" style={{ gap: 8 }}>
          <span style={{ flex: 1 }}><PersonLink c={c} />, {Math.floor(ageOf(c, world.date))} <Diamonds c={c} /></span>
          <Go to={{ kind: 'plan', mission: 'scout', leader: c.id }} className="btn small">Scouting run ›</Go>
          <Go to={{ kind: 'plan', mission: 'investigate', leader: c.id }} className="btn small">Inquiry ›</Go>
        </div>
      ))}
    </Panel>
  );
}

function History({ className }: { className?: string }) {
  const world = useWorld();
  const g = world.grounds;
  const items: { at: number; key: string; node: ReactNode }[] = [];
  for (const t of g.tourneys) items.push({ at: t.date.year * 1000 + t.date.cycle, key: `t${t.year}`, node: <><strong>Tourney {t.year}:</strong> <PersonById id={t.champion} /> took it. {t.rounds[t.rounds.length - 1]?.map((b, i) => <span key={i} className="muted"> Final: <BoutLine b={b} /></span>)}</> });
  for (const [i, p] of g.pitNights.entries()) items.push({ at: p.date.year * 1000 + p.date.cycle, key: `p${i}`, node: <><strong>Pit night, <HouseLink id={p.host} />:</strong> {p.bouts.map((b, j) => <span key={j}>{j ? '; ' : ''}<BoutLine b={b} /></span>)}</> });
  for (const [i, d] of g.duels.entries()) items.push({ at: d.date.year * 1000 + d.date.cycle, key: `d${i}`, node: <><strong>Duel over {d.cause}{d.sanctioned ? '' : ', without leave'}:</strong> <BoutLine b={d.bout} /></> });
  items.sort((a, b) => b.at - a.at);
  return (
    <Panel title="What happened here" aside={`${items.length}`} className={className}>
      {items.length === 0 ? <p className="body muted" style={{ margin: 0 }}>Nothing yet.</p> : null}
      {items.slice(0, 30).map((x) => <div key={x.key} className="row" style={{ display: 'block' }}>{x.node}</div>)}
    </Panel>
  );
}
