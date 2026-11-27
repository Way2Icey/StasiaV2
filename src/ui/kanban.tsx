// Missions as a kanban: every job moves left to right, posted, on the way, at work, home. The colour stripe
// says whose board it came from. Choosing who goes opens the odds grid: our people against the jobs, the odds
// in every cell, hot where the match is good.
import { useState } from 'react';
import { useGame, useWorld } from './context';
import { Go, Panel, PersonById } from './links';
import { BountiesPage } from './bounties';
import { IntelPage } from './intel';
import { FieldSlots, LeadsPanel, schedule } from './missions';
import { activeMissions, MISSION_LABEL, OUTCOME_LABEL } from '../sim/missions';
import { boardOfQuest, candidatesFor, cannotSend, odds, QUEST_LABEL, sendOnQuest, type Board, type Quest } from '../sim/quests';
import { absoluteCycle, formatDate } from '../sim/time';
import { captivesHeldBy } from '../sim/captives';
import type { Character } from '../sim/types';

const STRIPE: Record<Board, string> = { grandMaster: 'var(--gold)', envoy: 'var(--blue)', spymaster: 'var(--green)' };
const SHORT: Record<Board, string> = { grandMaster: 'Grand Master', envoy: 'Speaker', spymaster: 'Spymaster' };
const pct = (p: number) => `${Math.round(p * 100)}%`;
const heat = (p: number) => (p >= 0.6 ? 'h4' : p >= 0.45 ? 'h3' : p >= 0.3 ? 'h2' : p >= 0.18 ? 'h1' : 'h0');
const stake: Partial<Record<Quest['kind'], string>> = { trial: 'Knights ▲ · Legacy ▲', hunt: 'Knights ▲', beast: 'Knights ▲', relic: 'Legacy ▲', escort: 'Economy ▲', hold: 'Economy ▲', bounty: 'Knights ▲', capture: 'Power ▲', guard: 'Influence ▲', treaty: 'Influence ▲', tradePact: 'Economy ▲', arbitrate: 'Influence ▲', feast: 'Influence ▲', vote: 'Influence ▲', ledger: 'Economy ▲', plant: 'intel', leak: 'their regard ▼', sabotage: 'their economy ▼', rescue: 'one of ours home' };

type Drawer = 'bounties' | 'cells' | 'own';

export function KanbanPage({ drawer: initial }: { drawer?: Drawer }) {
  const world = useWorld();
  const game = useGame();
  const P = world.playerHouseId;
  const [grid, setGrid] = useState(false);
  const [open, setOpen] = useState<Drawer | null>(initial ?? null);
  const [err, setErr] = useState<string | null>(null);
  const send = (q: string, who: string) => game.update((w) => { try { setErr(null); return sendOnQuest(w, q, who); } catch (e) { setErr((e as Error).message); return w; } });
  const now = absoluteCycle(world.date);
  const posted = (world.quests?.board ?? []).filter((q) => !q.goneId);
  const out = (world.quests?.board ?? []).filter((q) => q.goneId);
  const missions = activeMissions(world, P);
  const onWay = missions.filter((m) => m.stage === 'travel' && absoluteCycle(m.launched) + m.travelCycles > now);
  const atWork = missions.filter((m) => !onWay.includes(m));
  const home = Object.values(world.missions).filter((m) => m.houseId === P && m.stage === 'done' && m.ended && absoluteCycle(m.ended) >= now - 160).sort((a, b) => absoluteCycle(b.ended!) - absoluteCycle(a.ended!)).slice(0, 5);
  const held = captivesHeldBy(world, P);
  const pool = new Map<string, Character>();
  for (const b of ['grandMaster', 'envoy', 'spymaster'] as Board[]) for (const c of candidatesFor(world, b)) pool.set(c.id, c);
  const people = [...pool.values()];
  const bestFor = (q: Quest) => candidatesFor(world, boardOfQuest(q)).map((c) => ({ c, p: odds(world, q, c) })).sort((a, b) => b.p - a.p)[0];
  // The job most worth taking now.
  const lead = posted.map((q) => ({ q, b: bestFor(q) })).filter((x) => x.b && x.b.p >= 0.4).sort((a, b) => b.b!.p * (1 + b.q.reward / 2000) - a.b!.p * (1 + a.q.reward / 2000))[0]?.q.id;
  return (
    <>
      <div className="page-title">
        <h2>Missions</h2>
        <p>Every job moves left to right: posted, on the way, at work, home. The stripe says whose board it came from. Choose who goes from the card, or open the odds grid to see everyone against everything.</p>
      </div>
      <FieldSlots />
      {err ? <p className="error">{err}</p> : null}
      <div className="filters" style={{ margin: '10px 0' }}>
        <button type="button" className="pill" aria-pressed={!grid} onClick={() => setGrid(false)}>The board</button>
        <button type="button" className="pill" aria-pressed={grid} onClick={() => setGrid(true)}>The odds grid</button>
        <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>{(['grandMaster', 'envoy', 'spymaster'] as Board[]).map((b) => <span key={b} style={{ marginLeft: 12 }}><span style={{ color: STRIPE[b] }}>▌</span>{SHORT[b]}</span>)}</span>
      </div>
      {grid ? (
        <Panel title="The odds grid" aside={`${people.length} free · ${posted.length} jobs · click a cell to send them`}>
          <div className="table-wrap">
            <table className="oddsgrid">
              <thead><tr><th className="rh">Who · free</th>{posted.map((q) => <th key={q.id} title={q.text}><span style={{ color: STRIPE[boardOfQuest(q)] }}>▌</span>{q.title}<br /><span className="muted">{q.reward ? `${q.reward.toLocaleString('en-US')} othes` : 'glory'}</span></th>)}</tr></thead>
              <tbody>
                {people.map((c) => (
                  <tr key={c.id}>
                    <td className="rh"><PersonById id={c.id} /> <span className="muted" style={{ fontSize: 11 }}>· {c.role}</span></td>
                    {posted.map((q) => {
                      const ok = candidatesFor(world, boardOfQuest(q)).some((x) => x.id === c.id) && !cannotSend(world, q.id, c.id);
                      if (!ok) return <td key={q.id} className="x">—</td>;
                      const p = odds(world, q, c);
                      return <td key={q.id} className={heat(p)}><button type="button" className="cellbtn" title={`Send ${c.name.given}: ${pct(p)}`} onClick={() => send(q.id, c.id)}>{pct(p)}</button></td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!people.length ? <p className="body muted" style={{ margin: 0 }}>No one is free. Knights come home, the wounded heal; the work keeps.</p> : null}
        </Panel>
      ) : (
        <div className="kanban">
          <div className="lane">
            <div className="lane-head"><span>POSTED</span><span className="muted">{posted.length}</span></div>
            {posted.map((q) => <PostedCard key={q.id} q={q} lead={q.id === lead} send={send} />)}
            {!posted.length ? <span className="muted" style={{ fontSize: 12 }}>The boards are empty. The seats post new work at the turn of each Phase.</span> : null}
          </div>
          <div className="lane">
            <div className="lane-head"><span>ON THE WAY</span><span className="muted">{onWay.length}</span></div>
            {onWay.map((m) => { const s = schedule(m); return (
              <Go key={m.id} to={{ kind: 'mission', id: m.id }} className="kcard" >
                <strong>{MISSION_LABEL[m.kind]}</strong><span className="muted"><PersonById id={m.leaderId} /> · arrives {formatDate(s.arrive)}</span>
              </Go>
            ); })}
            {!onWay.length ? <span className="muted" style={{ fontSize: 12 }}>No one travelling.</span> : null}
          </div>
          <div className="lane">
            <div className="lane-head"><span>AT WORK</span><span className="muted">{atWork.length + out.length}</span></div>
            {out.map((q) => (
              <div key={q.id} className="kcard" style={{ borderLeftColor: STRIPE[boardOfQuest(q)] }}>
                <strong>{q.title}</strong>
                <span className="muted"><PersonById id={q.goneId!} /> · {QUEST_LABEL[q.kind].toLowerCase()}{q.back ? ` · back ${formatDate(q.back)}` : ''}</span>
                <span className="kbar"><span style={{ width: `${q.back ? Math.max(5, Math.min(100, 100 - ((absoluteCycle(q.back) - now) / Math.max(1, q.cycles * 2.5)) * 100)) : 50}%` }} /></span>
              </div>
            ))}
            {atWork.map((m) => { const s = schedule(m); const f = Math.min(1, (now - absoluteCycle(m.launched)) / Math.max(1, s.total)); return (
              <Go key={m.id} to={{ kind: 'mission', id: m.id }} className="kcard">
                <strong>{MISSION_LABEL[m.kind]}</strong>
                <span className="muted"><PersonById id={m.leaderId} /> · {m.stage === 'return' ? 'coming home' : 'at work'} · back {formatDate(s.home)}</span>
                <span className="kbar"><span style={{ width: `${Math.round(f * 100)}%` }} /></span>
              </Go>
            ); })}
            {!out.length && !atWork.length ? <span className="muted" style={{ fontSize: 12 }}>Nothing under way.</span> : null}
          </div>
          <div className="lane">
            <div className="lane-head"><span>HOME</span><span className="muted">lately</span></div>
            {home.map((m) => (
              <Go key={m.id} to={{ kind: 'mission', id: m.id }} className="kcard">
                <strong>{MISSION_LABEL[m.kind]}</strong>
                <span className={m.outcome === 'success' || m.outcome === 'triumph' ? 'up' : m.outcome === 'disaster' || m.outcome === 'failure' ? 'down' : 'muted'}>{m.outcome ? OUTCOME_LABEL[m.outcome] : ''}</span>
                <span className="muted"><PersonById id={m.leaderId} /> · {formatDate(m.ended!)}</span>
              </Go>
            ))}
            {held.length ? <button type="button" className="kcard" onClick={() => setOpen('cells')}><strong>In our cells: {held.length}</strong><span className="muted">interrogate, ransom or release ›</span></button> : null}
            {!home.length && !held.length ? <span className="muted" style={{ fontSize: 12 }}>No one back yet.</span> : null}
          </div>
        </div>
      )}
      <div className="actions" style={{ margin: '14px 0' }}>
        {(['own', 'bounties', 'cells'] as Drawer[]).map((d) => <button key={d} type="button" className="xq-drawer" aria-expanded={open === d} onClick={() => setOpen(open === d ? null : d)}>{open === d ? '▾' : '▸'} {d === 'own' ? 'A mission of your own · leads' : d === 'bounties' ? 'Bounties · on our heads' : 'Cells & intel'}</button>)}
      </div>
      {open === 'own' ? <div className="stack">
        <Panel title="A mission of your own">
          <div className="body actions">
            <Go to={{ kind: 'plan', mission: 'investigate' }} className="btn small">Investigate someone ›</Go>
            <Go to={{ kind: 'plan', mission: 'scout' }} className="btn small">Scout a world ›</Go>
            <Go to={{ kind: 'plan', mission: 'envoy' }} className="btn small">Send an envoy ›</Go>
          </div>
        </Panel>
        <LeadsPanel />
      </div> : null}
      {open === 'bounties' ? <BountiesPage bare /> : null}
      {open === 'cells' ? <IntelPage bare /> : null}
    </>
  );
}

function PostedCard({ q, lead, send }: { q: Quest; lead: boolean; send: (q: string, who: string) => void }) {
  const world = useWorld();
  const board = boardOfQuest(q);
  const who = candidatesFor(world, board).map((c) => ({ c, p: odds(world, q, c) })).sort((a, b) => b.p - a.p);
  const [pick, setPick] = useState(who[0]?.c.id ?? '');
  const sel = who.find((x) => x.c.id === pick) ?? who[0];
  const hard = ['easy', 'fair', 'hard', 'very hard', 'deadly'][Math.min(4, Math.max(0, q.hard - 1))];
  return (
    <div className={`kcard${lead ? ' lead' : ''}`} style={{ borderLeftColor: STRIPE[board] }}>
      <strong title={q.text}>{q.title}</strong>
      <span className="muted">{SHORT[board]} · {hard} · {q.reward ? `${q.reward.toLocaleString('en-US')} othes` : 'glory'}{stake[q.kind] ? ` · ${stake[q.kind]}` : ''}</span>
      {who.length ? <>
        <select className="select" aria-label="Who goes" value={sel?.c.id ?? ''} onChange={(e) => setPick(e.target.value)}>
          {who.map(({ c, p }) => <option key={c.id} value={c.id}>{c.name.given} {c.name.family ?? ''} · {pct(p)}</option>)}
        </select>
        <button type="button" className={`btn small${lead ? ' lead' : ' primary'}`} disabled={!sel || !!cannotSend(world, q.id, sel.c.id)} onClick={() => sel && send(q.id, sel.c.id)}>Send {sel?.c.name.given} ›</button>
      </> : <span className="muted" style={{ fontSize: 11 }}>No one free for it.</span>}
    </div>
  );
}

