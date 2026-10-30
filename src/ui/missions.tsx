import { useMemo, useState } from 'react';
import { displayName } from '../sim/names';
import { alive } from '../sim/query';
import { absoluteCycle, addCycles, formatDate } from '../sim/time';
import {
  activeMissions, cannotLead, describeJob, fitLabel, forecast, launchMission, MISSION_LABEL, OUTCOME_LABEL,
  pastMissions, skillFor, travelCycles, type MissionSpec,
} from '../sim/missions';
import type { Approach, Character, Mission, MissionKind, Outcome } from '../sim/types';
import { useGame, useNav, useWorld } from './context';
import { useSee } from './fog';
import { Go, HouseLink, Panel, PersonById, PersonLink, PlanetLink, SectorLink } from './links';

const STAGE_LABEL: Record<Mission['stage'], string> = {
  travel: 'Travelling out',
  task: 'At work',
  return: 'Coming home',
  done: 'Returned',
};

const OUTCOME_COLOR: Record<Outcome, string> = {
  triumph: 'var(--gold)',
  success: 'var(--green)',
  partial: 'var(--blue)',
  failure: 'var(--muted)',
  disaster: 'var(--red)',
};

function schedule(m: Mission) {
  const arrive = addCycles(m.launched, m.travelCycles);
  const finish = addCycles(arrive, m.taskCycles);
  const home = addCycles(finish, m.travelCycles);
  return { arrive, finish, home, total: m.travelCycles * 2 + m.taskCycles };
}

function OutcomeTag({ o }: { o: Outcome }) {
  return <span className="tag" style={{ color: OUTCOME_COLOR[o] }}>{OUTCOME_LABEL[o]}</span>;
}

function Target({ m }: { m: Mission }) {
  if (m.kind === 'investigate') return <PersonById id={m.targetId} />;
  return <PlanetLink id={m.targetPlanetId} />;
}

/** One line on the board: who, what, where they are in it. */
export function MissionRow({ id }: { id: string }) {
  const world = useWorld();
  const m = world.missions[id];
  if (!m) return null;
  const s = schedule(m);
  const elapsed = Math.min(s.total, absoluteCycle(world.date) - absoluteCycle(m.launched));
  const pct = Math.round((elapsed / s.total) * 100);
  const leader = world.characters[m.leaderId];
  return (
    <div className="row mission-row">
      <span className="tag mission">{MISSION_LABEL[m.kind]}</span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 13 }}>
          {leader ? <PersonLink c={leader} /> : '—'} <span className="muted">→</span> <Target m={m} />
        </span>
        <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className="bar" style={{ maxWidth: 260 }} role="img" aria-label={`${pct}% of the way through`}>
            <span style={{ width: `${pct}%`, background: 'var(--gold)' }} />
          </span>
          <span className="muted" style={{ fontSize: 11 }}>{STAGE_LABEL[m.stage]}</span>
        </span>
      </span>
      <span className="muted" style={{ fontSize: 11, textAlign: 'right' }}>
        {m.stage === 'done' ? (m.outcome ? <OutcomeTag o={m.outcome} /> : null) : <>Back {formatDate(s.home)}</>}
        <br /><Go to={{ kind: 'mission', id: m.id }}>{m.stage === 'done' ? 'Report ›' : 'Details ›'}</Go>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- board

export function MissionsPage() {
  const world = useWorld();
  const house = world.playerHouseId;
  const active = activeMissions(world, house);
  const past = pastMissions(world, house);
  return (
    <>
      <div className="page-title">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h2>Missions</h2>
          <p>Send your people out to learn what others would rather keep. Every press of Continue moves them along.</p>
        </div>
      </div>
      <div className="actions">
        <Go to={{ kind: 'plan', mission: 'investigate' }} className="btn primary">Plan an investigation</Go>
        <Go to={{ kind: 'plan', mission: 'scout' }} className="btn">Plan a scouting run</Go>
      </div>
      <Panel title="In the field" aside={`${active.length} out`}>
        {active.length === 0 ? <p className="body muted" style={{ margin: 0 }}>No one is out right now.</p> : null}
        {active.map((m) => <MissionRow key={m.id} id={m.id} />)}
      </Panel>
      <Panel title="Reports" aside={`${past.length} filed`}>
        {past.length === 0 ? <p className="body muted" style={{ margin: 0 }}>No reports yet.</p> : (
          <div className="table-wrap">
            <table className="list">
              <thead><tr><th>Returned</th><th>Mission</th><th>Led by</th><th>Target</th><th>Outcome</th><th /></tr></thead>
              <tbody>
                {past.map((m) => (
                  <tr key={m.id}>
                    <td className="mono muted">{m.ended ? formatDate(m.ended) : '—'}</td>
                    <td>{MISSION_LABEL[m.kind]}</td>
                    <td><PersonById id={m.leaderId} /></td>
                    <td><Target m={m} /></td>
                    <td>{m.outcome ? <OutcomeTag o={m.outcome} /> : null}</td>
                    <td><Go to={{ kind: 'mission', id: m.id }}>Read ›</Go></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------- one mission

export function MissionPage({ id }: { id: string }) {
  const world = useWorld();
  const m = world.missions[id];
  if (!m) return <p className="error">No such mission.</p>;
  const s = schedule(m);
  const leader = world.characters[m.leaderId];
  const stages: { key: Mission['stage']; label: string; until: string }[] = [
    { key: 'travel', label: 'Travel out', until: formatDate(s.arrive) },
    { key: 'task', label: m.kind === 'investigate' ? 'Investigate' : 'Scout', until: formatDate(s.finish) },
    { key: 'return', label: 'Return', until: formatDate(s.home) },
  ];
  const order: Mission['stage'][] = ['travel', 'task', 'return', 'done'];
  const at = order.indexOf(m.stage);
  return (
    <>
      <div className="page-title">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="eyebrow gold">{MISSION_LABEL[m.kind]} · {m.approach === 'quick' ? 'quick and loud' : 'careful'}</span>
          <h2>{leader ? displayName(leader.name) : 'Someone'} to {describeJob(world, m)}</h2>
          <p>Launched {formatDate(m.launched)} · {m.stage === 'done' ? `ended ${m.ended ? formatDate(m.ended) : ''}` : `${STAGE_LABEL[m.stage].toLowerCase()}`}</p>
        </div>
        {m.outcome && m.stage === 'done' ? <OutcomeTag o={m.outcome} /> : null}
      </div>

      <div className="grid">
        <Panel title="Timeline" className="span-5">
          <div className="body stages">
            {stages.map((st, i) => (
              <div key={st.key} className={`stage ${i < at ? 'past' : i === at ? 'now' : ''}`}>
                <span className="dot" aria-hidden="true" />
                <span style={{ flex: 1 }}>{st.label}</span>
                <span className="mono muted" style={{ fontSize: 11 }}>{i < at ? 'done' : `until ${st.until}`}</span>
              </div>
            ))}
            <dl className="kv" style={{ marginTop: 10 }}>
              <dt>Led by</dt><dd><PersonById id={m.leaderId} /></dd>
              <dt>Target</dt><dd><Target m={m} /></dd>
              <dt>Where</dt><dd><SectorLink id={m.targetSectorId} withPlanet /></dd>
              <dt>Journey</dt><dd>{m.travelCycles} cycles each way, {m.taskCycles} at work</dd>
            </dl>
          </div>
        </Panel>

        <Panel title="Report" className="span-7">
          {m.stage !== 'done' ? (
            <p className="body muted" style={{ margin: 0 }}>Nothing yet. The report comes when {leader?.name.given ?? 'they'} get{leader ? 's' : ''} home, around {formatDate(s.home)}.</p>
          ) : (
            <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <blockquote className="report">{m.report}</blockquote>
              {m.findings && m.findings.length ? (
                <ul className="findings">
                  {m.findings.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              ) : null}
              {m.kind === 'investigate' && m.targetId ? <div><Go to={{ kind: 'character', id: m.targetId }} className="btn small">Open their sheet ›</Go></div> : null}
              {m.kind === 'scout' ? <div><Go to={{ kind: 'planet', id: m.targetPlanetId }} className="btn small">Open the world ›</Go></div> : null}
            </div>
          )}
        </Panel>

        <Panel title="Log" aside="What reached you" className="span-12 feed">
          {[...m.log].reverse().map((e, i) => (
            <div className="row" key={i}>
              <time>{formatDate(e.date)}</time>
              <span style={{ fontSize: 13 }}>{e.text}</span>
            </div>
          ))}
        </Panel>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- planning

export function PlanPage({ kind: initialKind, target: initialTarget }: { kind: MissionKind; target?: string }) {
  const world = useWorld();
  const nav = useNav();
  const game = useGame();
  const see = useSee();
  const house = world.playerHouseId;
  const [kind, setKind] = useState<MissionKind>(initialKind);
  const [target, setTarget] = useState<string | undefined>(initialTarget);
  const [leaderId, setLeaderId] = useState<string | undefined>();
  const [approach, setApproach] = useState<Approach>('careful');
  const [q, setQ] = useState('');

  const switchKind = (k: MissionKind) => { setKind(k); setTarget(undefined); };

  const targetPlanet = kind === 'investigate'
    ? (target ? world.characters[target]?.location.planetId : undefined)
    : target;

  const candidates = useMemo(() => {
    return alive(world)
      .filter((c) => !cannotLead(world, house, c))
      .map((c) => ({ c, skill: skillFor(kind, c) }))
      .sort((a, b) => b.skill - a.skill);
  }, [world, house, kind]);

  const people = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return alive(world)
      .filter((c) => c.tier === 'full' && !(c.houseId === house && c.seat === 'highroy'))
      .filter((c) => !needle || displayName(c.name).toLowerCase().includes(needle) || c.role.toLowerCase().includes(needle) || (world.houses[c.houseId]?.name.toLowerCase().includes(needle) ?? false))
      .sort((a, b) => Number(a.houseId === house) - Number(b.houseId === house) || Number(b.tier === 'full') - Number(a.tier === 'full') || (b.seat ? 1 : 0) - (a.seat ? 1 : 0))
      .slice(0, 10);
  }, [world, house, q]);

  const leader = leaderId && candidates.some((x) => x.c.id === leaderId) ? leaderId : candidates[0]?.c.id;
  const spec: MissionSpec | null = leader && target ? {
    kind, houseId: house, leaderId: leader, approach,
    ...(kind === 'investigate' ? { targetId: target } : { targetPlanetId: target }),
  } : null;
  const f = spec ? forecast(world, spec) : null;
  const targetChar = kind === 'investigate' && target ? world.characters[target] : undefined;

  const launch = () => {
    if (!spec) return;
    const id = `m${world.nextId}`;
    game.update((w) => launchMission(w, spec).world);
    nav.to({ kind: 'mission', id });
  };

  return (
    <>
      <div className="page-title">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="eyebrow gold">New mission</span>
          <h2>{kind === 'investigate' ? 'Plan an investigation' : 'Plan a scouting run'}</h2>
          <p>{kind === 'investigate'
            ? 'Learn what someone is really like: their abilities, their character, their secrets.'
            : 'Survey a world: who lives there, who holds it, where it is weak.'}</p>
        </div>
      </div>
      <div className="filters">
        <button type="button" className="pill" aria-pressed={kind === 'investigate'} onClick={() => switchKind('investigate')}>Investigate a person</button>
        <button type="button" className="pill" aria-pressed={kind === 'scout'} onClick={() => switchKind('scout')}>Scout a world</button>
      </div>

      <div className="grid">
        <div className="span-7 stack">
          <Panel title="1 · Target">
            {kind === 'investigate' ? (
              <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {targetChar ? (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <PersonLink c={targetChar} />
                    <span className="muted" style={{ fontSize: 12 }}>{targetChar.role} · House <HouseLink id={targetChar.houseId} /> · {see(targetChar).label}</span>
                    <button type="button" className="btn small" style={{ marginLeft: 'auto' }} onClick={() => setTarget(undefined)}>Change</button>
                  </div>
                ) : (
                  <>
                    <label htmlFor="plan-target" className="eyebrow">Find someone</label>
                    <input id="plan-target" className="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, role or house" />
                    <div className="choices">
                      {people.map((c) => (
                        <button key={c.id} type="button" className="choice" onClick={() => setTarget(c.id)}>
                          <span>{displayName(c.name)}</span>
                          <span className="muted">{c.role} · {world.houses[c.houseId]?.name} · {see(c).label}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="body choices">
                {Object.values(world.planets).filter((p) => p.houseId !== house).map((p) => (
                  <button key={p.id} type="button" className="choice" aria-pressed={target === p.id} onClick={() => setTarget(p.id)}>
                    <span>{p.name}</span>
                    <span className="muted">House {world.houses[p.houseId]?.name} · {p.sectors.length} sectors</span>
                  </button>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="2 · Who goes" aside="Best suited first">
            {candidates.length === 0 ? <p className="body muted" style={{ margin: 0 }}>Everyone who could go is already out.</p> : (
              <div className="table-wrap">
                <table className="list">
                  <thead><tr><th /><th>Name</th><th>Role</th><th>Fit</th><th>Travel</th></tr></thead>
                  <tbody>
                    {candidates.slice(0, 12).map(({ c, skill }) => (
                      <LeaderRow key={c.id} c={c} skill={skill} checked={leader === c.id} onPick={() => setLeaderId(c.id)}
                        travel={targetPlanet ? travelCycles(c.location.planetId, targetPlanet) : undefined} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="3 · How">
            <div className="body choices two">
              <button type="button" className="choice" aria-pressed={approach === 'careful'} onClick={() => setApproach('careful')}>
                <span>Careful</span>
                <span className="muted">Takes longer. Less likely to be noticed.</span>
              </button>
              <button type="button" className="choice" aria-pressed={approach === 'quick'} onClick={() => setApproach('quick')}>
                <span>Quick</span>
                <span className="muted">Back sooner, works harder each cycle, but far more likely to be seen.</span>
              </button>
            </div>
          </Panel>
        </div>

        <Panel title="Forecast" aside="As your house judges it" className="span-5">
          <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {!target ? <p className="muted" style={{ margin: 0 }}>Choose a target.</p> : null}
            {f && !f.ok ? <p className="error" style={{ margin: 0 }}>{f.reason}</p> : null}
            {f && f.ok ? (
              <>
                <dl className="kv">
                  <dt>Leader's fit</dt><dd>{f.fit}</dd>
                  <dt>Out and back</dt><dd>{f.total} cycles ({f.travel} each way, {f.task} at work)</dd>
                  <dt>Home by</dt><dd>{formatDate(f.returns)}</dd>
                  <dt>Our estimate is</dt><dd>{f.confidence}</dd>
                </dl>
                <Odds label="Chance of a good result" p={f.success} color="var(--green)" />
                <Odds label="Chance of being noticed" p={f.noticed} color="var(--orange)" />
                <p className="muted" style={{ fontSize: 11, margin: 0 }}>Being noticed caps the result, tells their house who you sent, and can end in capture.</p>
                <button type="button" className="btn primary" onClick={launch}>Send them</button>
              </>
            ) : null}
          </div>
        </Panel>
      </div>
    </>
  );
}

function Odds({ label, p, color }: { label: string; p: number; color: string }) {
  const pct = Math.round(p * 100);
  const word = pct >= 75 ? 'Very likely' : pct >= 50 ? 'Likely' : pct >= 25 ? 'Possible' : pct >= 10 ? 'Unlikely' : 'Remote';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span className="muted">{label}</span><span>{word} <span className="mono muted">~{pct}%</span></span></span>
      <span className="bar" role="img" aria-label={`${pct}%`}><span style={{ width: `${pct}%`, background: color }} /></span>
    </div>
  );
}

function LeaderRow({ c, skill, checked, onPick, travel }: { c: Character; skill: number; checked: boolean; onPick: () => void; travel?: number }) {
  return (
    <tr className="clickable" onClick={onPick}>
      <td><input type="radio" name="leader" checked={checked} onChange={onPick} aria-label={`Send ${displayName(c.name)}`} /></td>
      <td><PersonLink c={c} /></td>
      <td>{c.role}</td>
      <td>{fitLabel(skill)}</td>
      <td className="mono muted">{travel !== undefined ? `${travel} cycles` : '—'}</td>
    </tr>
  );
}
