// Proving grounds on screen: the circuit, the house tourney, challenges to allow or forbid, first commands.
import { useState, type ReactNode } from 'react';
import { useGame, useWorld } from './context';
import { Go, HouseLink, Panel, PersonById, PersonLink } from './links';
import { Term } from './tip';
import { Diamonds } from './careers';
import { answerChallenge, callTourney, cannotCallTourney, fighters, fightScore, oldEnough, TOURNEY_COST, type Bout } from '../sim/grounds';
import { AccountBlock } from './account';
import {
  cannotEnter, cannotHost, declineCircuit, enterCircuit, entrantName, HOST_COST, hostTourney, isLocal, KIND_LABEL, knownEvents, MAX_SENT, setPitsForbidden,
  type CBout, type CircuitEvent,
} from '../sim/circuit';
import { absoluteCycle } from '../sim/time';
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

export function GroundsPage({ bare }: { bare?: boolean } = {}) {
  return (
    <>
      {bare ? null : (
      <div className="page-title">
        <h2>Circuit &amp; tourneys</h2>
        <p>Where reputations are made before anyone is a knight. The circuit runs all year across the Reaches: underground pits in the undercities, public tourneys any house may hold, invitationals and pit nights for invitees only. Our people go on their own when their blood is up; we can send them where we are welcome, and host. Challenges between soldiers come to the Highroy. Less sanctioned than the Crucible, and closer to home.</p>
      </div>
      )}
      <div className="grid">
        <Upcoming className="span-12" />
        <Tourney className="span-6" />
        <Host className="span-6" />
        <FirstCommands className="span-6" />
        <PitRule className="span-6" />
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
  // The best of the house who cannot fight this one: away, wounded or ill.
  const inPool = new Set(fighters(world, world.playerHouseId).map((c) => c.id));
  const missing = Object.values(world.characters).filter((c) => c.alive && c.houseId === world.playerHouseId && c.tier === 'full' && c.seat !== 'highroy' && oldEnough(world, c) && !inPool.has(c.id) && fightScore(c) >= (pool[pool.length - 1] ? fightScore(pool[pool.length - 1]!) : 0))
    .sort((a, b) => fightScore(b) - fightScore(a)).slice(0, 4);
  const last = world.grounds.tourneys[0];
  const fresh = last && last.year === world.date.year ? last : undefined;
  return (
    <Panel title={<Term k="tourney">The house tourney</Term>} aside={`${TOURNEY_COST} othes · once a year`} className={className}>
      <p className="body muted" style={{ margin: 0, fontSize: 12 }}>Blunted weapons, a bracket of eight: the house's best and the young who want it most. The court loves it, the winner is remembered, and a youngling who goes deep is talked about for a year.</p>
      <div className="body" style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', fontSize: 13 }}>
        {pool.map((c) => <span key={c.id}><PersonLink c={c} /> <span className="muted mono">{fightScore(c).toFixed(1)}{young(world, c.id) ? ' · young' : ''}</span></span>)}
      </div>
      {missing.length && !fresh ? <p className="body muted" style={{ margin: 0, fontSize: 12 }}>Not in the bracket: {missing.map((c, i) => <span key={c.id}>{i ? ', ' : ''}<PersonLink c={c} /> <span className="muted">({c.flags.some((f) => f.id === 'wounded') ? 'wounded' : c.flags.some((f) => f.id === 'ill') ? 'ill' : 'away'})</span></span>)}. Wait for them, or call it without them.</p> : null}
      {err ? <p className="body error" style={{ margin: 0 }}>{err}</p> : null}
      <div className="actions"><button type="button" className="btn small primary" disabled={!!why} title={why ?? ''} onClick={() => run(callTourney)}>{why ?? 'Call the tourney'}</button></div>
      {fresh ? (
        <div className="record-card" style={{ display: 'grid', gap: 4 }}>
          <strong>The tourney of {fresh.year}: <PersonById id={fresh.champion} /> is champion.</strong>
          {fresh.rounds.map((r, i) => <div key={i} style={{ fontSize: 12 }}><span className="muted">{['First round', 'Semi-finals', 'Final'][i + 3 - fresh.rounds.length] ?? `Round ${i + 1}`}:</span> {r.map((b, j) => <span key={j}>{j ? ' · ' : ''}<BoutLine b={b} /></span>)}</div>)}
          {fresh.rounds[fresh.rounds.length - 1]?.[0]?.account ? <AccountBlock compact account={fresh.rounds[fresh.rounds.length - 1]![0]!.account!} /> : null}
        </div>
      ) : null}
    </Panel>
  );
}

export function Challenges({ className }: { className?: string }) {
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

const keyName = (world: World, k: string) => (isLocal(k) ? <span className="muted">{entrantName(world, k)}</span> : <PersonById id={k} />);

function CBoutLine({ b }: { b: CBout }) {
  const world = useWorld();
  const loser = b.winner === b.a ? b.b : b.a;
  return <span>{keyName(world, b.winner)} beat {keyName(world, loser)}{b.killed ? <span className="error"> · killed</span> : b.hurt ? <span className="muted"> · hurt</span> : null}</span>;
}

/** What is coming on the circuit that we know of, and who of ours is going. */
function Upcoming({ className }: { className?: string }) {
  const world = useWorld();
  const { run, err } = usePlay();
  const [pick, setPick] = useState<Record<string, string[]>>({});
  const P = world.playerHouseId;
  const list = knownEvents(world).filter((e) => !e.done).sort((a, b) => absoluteCycle(a.held) - absoluteCycle(b.held));
  const pool = fighters(world, P).sort((a, b) => fightScore(b) - fightScore(a)).slice(0, 14);
  return (
    <Panel title={<Term k="circuit">The circuit: coming up</Term>} aside={`${list.length} we know of`} className={className}>
      {err ? <p className="body error" style={{ margin: 0 }}>{err}</p> : null}
      {list.length === 0 ? <p className="body muted" style={{ margin: 0 }}>Nothing we have heard of. The underground cards on worlds we have no eyes on, we never hear of until someone comes home from one.</p> : null}
      {list.map((e) => {
        const ours = e.entrants.filter((x) => x.houseId === P);
        const canSend = e.kind !== 'underground' && e.host !== P && (e.kind === 'public' || e.invited?.includes(P));
        const chosen = pick[e.id] ?? [];
        const why = cannotEnter(world, e.id, chosen);
        return (
          <div key={e.id} className="row petition" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
            <span><span className="tag">{KIND_LABEL[e.kind].toUpperCase()}</span> <strong>{e.name[0]!.toUpperCase() + e.name.slice(1)}</strong>{e.host ? <> · <HouseLink id={e.host} /></> : null} <span className="muted">· {formatDate(e.held)} · purse {e.purse.toLocaleString('en-US')}</span></span>
            {e.shady ? <span className="muted" style={{ fontSize: 12 }}>Around the card: {e.shady}. Being seen there does the house no credit.</span> : null}
            {e.invited?.length ? <span className="muted" style={{ fontSize: 12 }}>Invited: {e.invited.map((h) => world.houses[h]?.name).join(', ')}</span> : null}
            {ours.length ? <span style={{ fontSize: 13 }}>Ours going: {ours.map((x, i) => <span key={x.id}>{i ? ', ' : ''}<PersonById id={x.id!} />{x.sent ? '' : <span className="muted"> (on their own)</span>}</span>)}</span> : null}
            {canSend && ours.length < MAX_SENT ? (
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {pool.filter((c) => !ours.some((x) => x.id === c.id)).map((c) => (
                  <button key={c.id} type="button" className={`btn small${chosen.includes(c.id) ? ' primary' : ''}`} onClick={() => setPick({ ...pick, [e.id]: chosen.includes(c.id) ? chosen.filter((x) => x !== c.id) : [...chosen, c.id].slice(0, MAX_SENT - ours.length) })}>
                    {c.name.given} {fightScore(c).toFixed(1)}{young(world, c.id) ? ' · young' : ''}
                  </button>
                ))}
                <button type="button" className="btn small primary" disabled={!!why} title={why ?? ''} onClick={() => { run((w) => enterCircuit(w, e.id, chosen)); setPick({ ...pick, [e.id]: [] }); }}>Send {chosen.length || ''}</button>
                {e.invited?.includes(P) ? <button type="button" className="btn small" onClick={() => run((w) => declineCircuit(w, e.id))}>Decline</button> : null}
              </span>
            ) : null}
          </div>
        );
      })}
    </Panel>
  );
}

function Host({ className }: { className?: string }) {
  const world = useWorld();
  const { run, err } = usePlay();
  const [inv, setInv] = useState<string[]>([]);
  const P = world.playerHouseId;
  const why = cannotHost(world);
  const others = Object.keys(world.houses).filter((h) => h !== P);
  return (
    <Panel title="Host a tourney" aside={`${HOST_COST.toLocaleString('en-US')} othes`} className={className}>
      <p className="body muted" style={{ margin: 0, fontSize: 12 }}>A tourney for the circuit: open to anyone, or for the houses we invite. The house's name grows, the invited think better of us, and our own can fight at home.</p>
      <div className="body" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {others.map((h) => <button key={h} type="button" className={`btn small${inv.includes(h) ? ' primary' : ''}`} onClick={() => setInv(inv.includes(h) ? inv.filter((x) => x !== h) : [...inv, h])}>{world.houses[h]!.name}</button>)}
      </div>
      {err ? <p className="body error" style={{ margin: 0 }}>{err}</p> : null}
      <div className="actions">
        <button type="button" className="btn small primary" disabled={!!why} title={why ?? ''} onClick={() => run((w) => hostTourney(w, 'public'))}>Hold a public tourney</button>
        <button type="button" className="btn small" disabled={!!why || !inv.length} title={why ?? (inv.length ? '' : 'Pick houses to invite')} onClick={() => { run((w) => hostTourney(w, 'invitational', inv)); setInv([]); }}>Invite {inv.length || ''} {inv.length === 1 ? 'house' : 'houses'}</button>
      </div>
    </Panel>
  );
}

function PitRule({ className }: { className?: string }) {
  const world = useWorld();
  const { run } = usePlay();
  const forbid = !!world.grounds.pitsForbidden;
  return (
    <Panel title="The underground pits" aside={forbid ? 'forbidden' : 'tolerated'} className={className}>
      <p className="body muted" style={{ margin: 0, fontSize: 12 }}>The pits are legal, but they keep company with slave fighters, Caige traders and smugglers. Our people who love a fight go when they have the will for it, and come home with winnings, wounds and stories, and sometimes a name the house would rather not be linked to. Forbidding it keeps them home, and some will resent it.</p>
      <div className="actions">
        <button type="button" className={`btn small${!forbid ? ' primary' : ''}`} onClick={() => run((w) => setPitsForbidden(w, false))}>Tolerate it</button>
        <button type="button" className={`btn small${forbid ? ' primary' : ''}`} onClick={() => run((w) => setPitsForbidden(w, true))}>Forbid it</button>
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
  for (const e of knownEvents(world).filter((x: CircuitEvent) => x.done)) {
    const P = world.playerHouseId;
    const mine = (e.bouts ?? []).filter((b) => e.entrants.some((x) => x.houseId === P && (x.id === b.a || x.id === b.b)));
    const show = mine.length ? mine : (e.bouts ?? []).filter((b) => b.killed || b.winner === e.winner).slice(-1);
    items.push({ at: e.held.year * 1000 + e.held.cycle, key: e.id, node: <><strong>{e.name[0]!.toUpperCase() + e.name.slice(1)}:</strong> {e.winner && e.kind !== 'underground' ? <>{e.kind === 'pitnight' ? <HouseLink id={e.winner} /> : keyName(world, e.winner)} took it. </> : null}{show.map((b, j) => <span key={j}>{j ? '; ' : ''}<CBoutLine b={b} /></span>)}</> });
  }
  for (const [i, d] of g.duels.entries()) items.push({ at: d.date.year * 1000 + d.date.cycle, key: `d${i}`, node: <><strong>Duel over {d.cause}{d.sanctioned ? '' : ', without leave'}:</strong> <BoutLine b={d.bout} /></> });
  items.sort((a, b) => b.at - a.at);
  return (
    <Panel title="What happened here" aside={`${items.length}`} className={className}>
      {items.length === 0 ? <p className="body muted" style={{ margin: 0 }}>Nothing yet.</p> : null}
      {items.slice(0, 30).map((x) => <div key={x.key} className="row" style={{ display: 'block' }}>{x.node}</div>)}
    </Panel>
  );
}
