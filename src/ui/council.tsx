import { useState } from 'react';
import { councilOf, SEAT_TITLE } from '../sim/world';
import {
  abandonOath, assignTask, dismissPetition, OATHS, OATHS_BY_ID, oathProgress, swearOath, TASKS_BY_ID,
  taskFit, taskScore, tasksForSeat,
} from '../sim/council';
import { attitude, attitudeColor, relation } from '../sim/relations';
import { activeMissionOf, MISSION_LABEL } from '../sim/missions';
import { formatDate } from '../sim/time';
import { shortName } from '../sim/names';
import type { Character, CouncilSeat, Petition, World } from '../sim/types';
import { useGame, useWorld } from './context';
import { Go, HouseLink, Panel, PersonById, PersonLink, PlanetLink } from './links';

// ---------------------------------------------------------------- shared bits

function Meter({ label, value, color, hint }: { label: string; value: number; color: string; hint?: string }) {
  return (
    <div className="meter" title={hint}>
      <span className="muted">{label}</span>
      <span className="bar"><span style={{ width: `${value}%`, background: color }} /></span>
      <span className="mono">{value}</span>
    </div>
  );
}

export function StandingPanel({ houseId, className }: { houseId: string; className?: string }) {
  const world = useWorld();
  const h = world.houses[houseId]!;
  const me = world.playerHouseId;
  return (
    <Panel title="Standing" aside="0–100" className={className}>
      <div className="body" style={{ display: 'grid', gap: 8 }}>
        <Meter label="Honour" value={h.standing.honour} color="var(--gold)" hint="Keeping your word: oaths kept, debts paid." />
        <Meter label="Respect" value={h.standing.respect} color="var(--blue)" hint="Standing at court and in the Numerade." />
        <Meter label="Dread" value={h.standing.dread} color="var(--orange)" hint="How much the others fear you." />
        {houseId !== me ? (
          <dl className="kv" style={{ marginTop: 6 }}>
            <dt>Regards us</dt><dd><Regard v={relation(world, houseId, me)} /></dd>
            <dt>We regard them</dt><dd><Regard v={relation(world, me, houseId)} /></dd>
          </dl>
        ) : null}
      </div>
    </Panel>
  );
}

export function Regard({ v }: { v: number }) {
  return <span style={{ color: attitudeColor(v) }}>{attitude(v)} <span className="mono muted">{v > 0 ? `+${v}` : v}</span></span>;
}

function petitionTarget(world: World, p: Petition) {
  if (p.targetId) return <PersonById id={p.targetId} />;
  if (p.targetHouseId) return <>House <HouseLink id={p.targetHouseId} /></>;
  if (p.targetPlanetId) return <PlanetLink id={p.targetPlanetId} />;
  void world;
  return null;
}

/** Requests from the council: review (opens the planner) or dismiss. */
export function Petitions({ className }: { className?: string }) {
  const world = useWorld();
  const game = useGame();
  const house = world.playerHouseId;
  const list = world.courts[house]?.petitions ?? [];
  return (
    <Panel title="Petitions" aside={list.length ? `${list.length} waiting` : 'None waiting'} className={className}>
      {list.length === 0 ? <p className="body muted" style={{ margin: 0 }}>Your council has nothing to ask. Petitions come more often while an oath stands.</p> : null}
      {list.map((p) => {
        const from = world.characters[p.fromId];
        return (
          <div key={p.id} className="row petition">
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12 }}>
                <span className="tag mission">{MISSION_LABEL[p.kind]}</span>{' '}
                {from ? <PersonLink c={from} /> : null} <span className="muted">· {from?.seat ? SEAT_TITLE[from.seat] : ''}</span>
              </span>
              <span className="quote">“{p.reason}”</span>
              <span className="muted" style={{ fontSize: 11 }}>Target: {petitionTarget(world, p)} · Would send <PersonById id={p.leaderId} /> · Lapses {formatDate(p.expires)}</span>
            </span>
            <span style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <Go className="btn small primary" to={{ kind: 'plan', mission: p.kind, target: p.targetId ?? p.targetHouseId ?? p.targetPlanetId, leader: p.leaderId, petition: p.id }}>Review</Go>
              <button type="button" className="btn small" onClick={() => game.update((w) => dismissPetition(w, house, p.id))}>Dismiss</button>
            </span>
          </div>
        );
      })}
    </Panel>
  );
}

/** The standing oath, with progress; or a prompt to swear one. */
export function OathSummary({ className }: { className?: string }) {
  const world = useWorld();
  const house = world.playerHouseId;
  const oath = world.courts[house]?.oath;
  const p = oathProgress(world, house);
  if (!oath || !p) {
    return (
      <Panel title="The Oath" className={className}>
        <div className="body" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="muted" style={{ fontSize: 13, flex: 1 }}>No oath stands. The council waits for the Highroy’s word.</span>
          <Go to={{ kind: 'council' }} className="btn small primary">Swear an oath ›</Go>
        </div>
      </Panel>
    );
  }
  const def = OATHS_BY_ID[oath.id]!;
  return (
    <Panel title="The Oath" aside={<>Ends {formatDate(oath.ends)}</>} className={className}>
      <div className="body" style={{ display: 'grid', gap: 8 }}>
        <span style={{ fontFamily: 'var(--display)', fontSize: 15 }}>{def.label}{oath.target ? <> · House <HouseLink id={oath.target} /></> : null}</span>
        <span className="quote">“{def.vow}”</span>
        <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className="bar"><span style={{ width: `${Math.round(p.fraction * 100)}%`, background: 'var(--gold)' }} /></span>
          <span className="mono" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{p.value} / {p.goal} {def.unit}</span>
        </span>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------- page

export function CouncilPage() {
  const world = useWorld();
  const game = useGame();
  const house = world.playerHouseId;
  const court = world.courts[house]!;
  const council = councilOf(world, house);
  const oathTasks = new Set(court.oath ? OATHS_BY_ID[court.oath.id]?.tasks ?? [] : []);

  return (
    <>
      <div className="page-title">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h2>The Council</h2>
          <p>Give each seat a standing task; it runs every turn. The Highroy swears one oath at a time, and tasks that serve it work harder.</p>
        </div>
      </div>
      <div className="grid">
        <OathPanel className="span-8" />
        <StandingPanel houseId={house} className="span-4" />

        <section className="panel span-12">
          <header><h3>Standing tasks</h3><span className="aside">★ serves the oath (+25%)</span></header>
          <div className="table-wrap">
            <table className="list tasks">
              <thead><tr><th>Seat</th><th>Held by</th><th>Task</th><th>Fit</th><th>Next result</th></tr></thead>
              <tbody>
                {council.map((c) => <SeatRow key={c.id} c={c} aligned={oathTasks} onAssign={(task, target) => game.update((w) => assignTask(w, house, c.seat!, task, target))} />)}
              </tbody>
            </table>
          </div>
        </section>

        <Petitions className="span-6" />
        <RelationsPanel className="span-6" />

        <Panel title="Council reports" aside="Newest first" className="span-12 feed">
          {court.reports.length === 0 ? <p className="body muted" style={{ margin: 0 }}>Nothing yet. Press Continue and the council gets to work.</p> : null}
          {court.reports.slice(0, 25).map((r, i) => (
            <div className="row" key={i}>
              <time>{formatDate(r.date)}</time>
              <span className="eyebrow gold" style={{ width: 96, flexShrink: 0 }}>{SEAT_TITLE[r.seat]}</span>
              <span style={{ fontSize: 13 }}><PersonById id={r.characterId} /> · {r.text}</span>
            </div>
          ))}
        </Panel>
      </div>
    </>
  );
}

function SeatRow({ c, aligned, onAssign }: { c: Character; aligned: Set<string>; onAssign: (task: string, target?: string) => void }) {
  const world = useWorld();
  const seat = c.seat as CouncilSeat;
  const house = world.playerHouseId;
  if (seat === 'highroy') {
    return (
      <tr>
        <td className="eyebrow gold">{SEAT_TITLE[seat]}</td>
        <td><PersonLink c={c} /></td>
        <td colSpan={3} className="muted">Swears the oath. Rules; does not take tasks.</td>
      </tr>
    );
  }
  const options = tasksForSeat(seat);
  const a = world.courts[house]!.tasks[seat];
  if (!options.length) {
    return (
      <tr><td className="eyebrow gold">{SEAT_TITLE[seat]}</td><td><PersonLink c={c} /></td><td colSpan={3} className="muted">No tasks for this seat yet.</td></tr>
    );
  }
  const def = a ? TASKS_BY_ID[a.task] : undefined;
  const away = activeMissionOf(world, c.id);
  const gone = c.flags.some((f) => f.id === 'missing' || f.id === 'captive');
  const score = def ? taskScore(def, c) : 0;
  const pct = def && a ? Math.min(100, Math.round((a.progress / def.threshold) * 100)) : 0;
  const sectors = Object.values(world.planets).filter((p) => p.houseId === house).flatMap((p) => p.sectors).filter((s) => s.controllerFamilyId);
  const id = `task-${seat}`;
  return (
    <tr>
      <td className="eyebrow gold">{SEAT_TITLE[seat]}</td>
      <td><PersonLink c={c} /></td>
      <td>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <label htmlFor={id} className="sr-only">Task for the {SEAT_TITLE[seat]}</label>
          <select id={id} className="select" value={a?.task ?? ''} onChange={(e) => onAssign(e.target.value)}>
            {options.map((t) => <option key={t.id} value={t.id}>{aligned.has(t.id) ? '★ ' : ''}{t.label}</option>)}
          </select>
          {def?.target === 'house' ? (
            <select aria-label="Which house" className="select" value={a?.target ?? ''} onChange={(e) => onAssign(def.id, e.target.value)}>
              {Object.values(world.houses).filter((h) => h.id !== house).map((h) => <option key={h.id} value={h.id}>House {h.name}</option>)}
            </select>
          ) : null}
          {def?.target === 'ownSector' ? (
            <select aria-label="Which sector" className="select" value={a?.target ?? ''} onChange={(e) => onAssign(def.id, e.target.value)}>
              {sectors.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.roomUsed}/{s.room})</option>)}
            </select>
          ) : null}
        </div>
        {def ? <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{def.description}</div> : null}
      </td>
      <td>{def ? taskFit(score) : '—'}</td>
      <td style={{ minWidth: 140 }}>
        {gone ? <span className="error">Missing</span>
          : away ? <Go to={{ kind: 'mission', id: away.id }}>Away on a mission</Go>
          : (
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="bar"><span style={{ width: `${pct}%`, background: def && aligned.has(def.id) ? 'var(--gold)' : 'var(--blue)' }} /></span>
              {def && aligned.has(def.id) ? <span className="gold" aria-label="Serves the oath">★</span> : null}
            </span>
          )}
      </td>
    </tr>
  );
}

function OathPanel({ className }: { className?: string }) {
  const world = useWorld();
  const game = useGame();
  const house = world.playerHouseId;
  const court = world.courts[house]!;
  const [choice, setChoice] = useState<string>(OATHS[0]!.id);
  const rivals = Object.values(world.houses).filter((h) => h.id !== house);
  const [target, setTarget] = useState<string>(rivals[0]?.id ?? '');
  const [confirm, setConfirm] = useState(false);
  const ruler = world.characters[world.houses[house]!.rulerId ?? ''];

  if (court.oath) {
    const def = OATHS_BY_ID[court.oath.id]!;
    const p = oathProgress(world, house)!;
    return (
      <Panel title="The Oath" aside={`Sworn ${formatDate(court.oath.sworn)}`} className={className}>
        <div className="body" style={{ display: 'grid', gap: 10 }}>
          <span style={{ fontFamily: 'var(--display)', fontSize: 18 }}>{def.label}{court.oath.target ? <> · House <HouseLink id={court.oath.target} /></> : null}</span>
          <span className="quote">“{def.vow}” — {ruler ? shortName(ruler.name) : 'the Highroy'}</span>
          <span className="muted" style={{ fontSize: 12 }}>{def.description}</span>
          <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className="bar"><span style={{ width: `${Math.round(p.fraction * 100)}%`, background: 'var(--gold)' }} /></span>
            <span className="mono" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{p.value} / {p.goal} {def.unit}</span>
          </span>
          <span className="muted" style={{ fontSize: 12 }}>
            Must be fulfilled by {formatDate(court.oath.ends)}. Tasks that serve it: {def.tasks.map((t) => TASKS_BY_ID[t]?.label).join(', ')}.
            Kept: honour +5, respect +3. Broken: honour −4. Abandoned: honour −6.
          </span>
          <div className="actions">
            {confirm ? (
              <>
                <span className="error">Abandon the oath? Honour −6.</span>
                <button type="button" className="btn small" onClick={() => { setConfirm(false); game.update((w) => abandonOath(w, house)); }}>Yes, abandon it</button>
                <button type="button" className="btn small" onClick={() => setConfirm(false)}>Keep it</button>
              </>
            ) : <button type="button" className="btn small" onClick={() => setConfirm(true)}>Abandon oath…</button>}
          </div>
        </div>
      </Panel>
    );
  }

  const def = OATHS_BY_ID[choice]!;
  return (
    <Panel title="Swear an oath" aside="One at a time · lasts an Orbit" className={className}>
      <div className="body" style={{ display: 'grid', gap: 10 }}>
        <div className="choices oaths">
          {OATHS.map((o) => (
            <button key={o.id} type="button" className="choice" aria-pressed={choice === o.id} onClick={() => setChoice(o.id)}>
              <span>{o.label}</span>
              <span className="muted">{o.description}</span>
            </button>
          ))}
        </div>
        {def.target === 'house' ? (
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <span className="eyebrow">Which house</span>
            <select className="select" value={target} onChange={(e) => setTarget(e.target.value)}>
              {rivals.map((h) => <option key={h.id} value={h.id}>House {h.name} — {attitude(relation(world, h.id, house))} ({relation(world, h.id, house)})</option>)}
            </select>
          </label>
        ) : null}
        <span className="quote">“{def.vow}”</span>
        <div className="actions">
          <button type="button" className="btn primary" onClick={() => game.update((w) => swearOath(w, house, def.id, def.target ? target : undefined))}>Swear it</button>
          <span className="muted" style={{ fontSize: 11 }}>Serving tasks: {def.tasks.map((t) => TASKS_BY_ID[t]?.label).join(', ')}.</span>
        </div>
        {court.oaths.length ? (
          <div style={{ fontSize: 12 }}>
            <span className="eyebrow">Past oaths</span>
            {court.oaths.slice(0, 5).map((o, i) => (
              <div key={i} className="muted">{formatDate(o.ended)} · {OATHS_BY_ID[o.id]?.label} — <span style={{ color: o.result === 'kept' ? 'var(--green)' : 'var(--orange)' }}>{o.result}</span></div>
            ))}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function RelationsPanel({ className }: { className?: string }) {
  const world = useWorld();
  const house = world.playerHouseId;
  return (
    <Panel title="The other houses" aside="How they regard us" className={className}>
      {Object.values(world.houses).filter((h) => h.id !== house).map((h) => (
        <div key={h.id} className="row">
          <span style={{ flex: 1 }}><HouseLink id={h.id} /> <span className="muted" style={{ fontSize: 11 }}>· {h.tier === 'great' ? 'Great' : 'Minor'}</span></span>
          <Regard v={relation(world, h.id, house)} />
          <Go to={{ kind: 'plan', mission: 'envoy', target: h.id }} className="btn small">Send envoy</Go>
        </div>
      ))}
    </Panel>
  );
}
