import { useMemo, useState } from 'react';
import { Term } from './tip';
import { displayName } from '../sim/names';
import { alive } from '../sim/query';
import { absoluteCycle, addCycles, formatDate } from '../sim/time';
import {
  activeMissions, describeJob, fitLabel, forecast, launchMission, MISSION_LABEL, OUTCOME_LABEL,
  pastMissions, skillFor, slotsFor, travelCycles, activeMissionOf, availability, MAX_COMPANIONS, partyOf, type Availability, type MissionSpec,
} from '../sim/missions';
import { closePetition } from '../sim/council';
import { averageMood, moodColor, moodLabel, moodOf } from '../sim/mood';
import { dismissLead, leadsOf, recruit } from '../sim/discovery';
import { attitude, attitudeColor, relation } from '../sim/relations';
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

const PLAN_TITLE: Record<MissionKind, string> = {
  investigate: 'Plan an investigation', scout: 'Plan a scouting run', envoy: 'Send an envoy',
};
const PLAN_BLURB: Record<MissionKind, string> = {
  investigate: 'Learn what someone is really like: their abilities, their character, their secrets.',
  scout: 'Survey a world: who lives there, who holds it, where it is weak.',
  envoy: 'Go to another house’s court in person. Warm their regard, and meet their council face to face.',
};

function Target({ m }: { m: Mission }) {
  if (m.kind === 'investigate') return <PersonById id={m.targetId} />;
  if (m.kind === 'envoy') return m.targetHouseId ? <HouseLink id={m.targetHouseId} /> : <span className="muted">—</span>;
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
          {leader ? <PersonLink c={leader} /> : '—'}{m.companions?.length ? <span className="muted"> +{m.companions.length}</span> : null} <span className="muted">→</span> <Target m={m} />
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
        <Go to={{ kind: 'plan', mission: 'envoy' }} className="btn">Send an envoy</Go>
      </div>
      <FieldSlots />
      <LeadsPanel />
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
    { key: 'task', label: m.kind === 'investigate' ? 'Investigate' : m.kind === 'envoy' ? 'At court' : 'Scout', until: formatDate(s.finish) },
    { key: 'return', label: 'Return', until: formatDate(s.home) },
  ];
  const order: Mission['stage'][] = ['travel', 'task', 'return', 'done'];
  const at = order.indexOf(m.stage);
  return (
    <>
      <div className="page-title">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="eyebrow gold">{MISSION_LABEL[m.kind]} · {m.kind === 'envoy' ? (m.approach === 'quick' ? 'short visit' : 'long stay') : m.approach === 'quick' ? 'quick and loud' : 'careful'}</span>
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
              {m.companions?.length ? <><dt><Term k="companions">With</Term></dt><dd>{partyOf(m).slice(1).map((id, i) => <span key={id}>{i ? ', ' : ''}<PersonById id={id} />{m.forced?.includes(id) ? <span className="muted"> (ordered)</span> : null}</span>)}</dd></> : null}
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
              {m.kind === 'envoy' && m.targetHouseId ? <div><Go to={{ kind: 'house', id: m.targetHouseId }} className="btn small">Open the house ›</Go></div> : null}
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

export function PlanPage({ kind: initialKind, target: initialTarget, leader: initialLeader, petition, lead: leadId }: { kind: MissionKind; target?: string; leader?: string; petition?: string; lead?: string }) {
  const world = useWorld();
  const nav = useNav();
  const game = useGame();
  const see = useSee();
  const house = world.playerHouseId;
  const [kind, setKind] = useState<MissionKind>(initialKind);
  const [target, setTarget] = useState<string | undefined>(initialTarget);
  const [leaderId, setLeaderId] = useState<string | undefined>(initialLeader);
  const [approach, setApproach] = useState<Approach>('careful');
  const [q, setQ] = useState('');

  const switchKind = (k: MissionKind) => { setKind(k); setTarget(undefined); };
  const lead = leadId ? world.leads.find((l) => l.id === leadId) : undefined;

  const targetPlanet = lead && kind === 'scout' ? lead.planetId : kind === 'investigate'
    ? (target ? world.characters[target]?.location.planetId : undefined)
    : kind === 'envoy' ? (target ? world.houses[target]?.capitalPlanetId : undefined)
    : target;

  // Everyone who could in principle go; the unwilling are listed with their reason.
  const [companions, setCompanions] = useState<string[]>([]);
  const [force, setForce] = useState<string[]>([]);
  const pool = useMemo(() => {
    return alive(world)
      .filter((c) => c.houseId === house && c.tier === 'full' && !activeMissionOf(world, c.id))
      .filter((c) => !c.flags.some((f) => f.id === 'captive' || f.id === 'missing'))
      .map((c) => ({ c, skill: skillFor(kind, c), avail: availability(world, house, c) }))
      .filter((x) => x.avail.reason !== 'Too young')
      .sort((a, b) => Number(b.c.seat === 'highroy') - Number(a.c.seat === 'highroy') || Number(!a.avail.ok) - Number(!b.avail.ok) || b.skill - a.skill);
  }, [world, house, kind]);
  const candidates = pool.filter((x) => x.avail.ok && x.c.seat !== 'highroy');
  const canGo = (id: string) => { const x = pool.find((p) => p.c.id === id); return !!x && (x.avail.ok || (!!x.avail.forceable && force.includes(id))); };
  const toggleForce = (id: string) => setForce((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));
  const toggleCompanion = (id: string) => setCompanions((cs) => (cs.includes(id) ? cs.filter((x) => x !== id) : cs.length < MAX_COMPANIONS ? [...cs, id] : cs));
  const slots = slotsFor(world, house);

  const people = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return alive(world)
      .filter((c) => c.tier === 'full' && !(c.houseId === house && c.seat === 'highroy'))
      .filter((c) => !needle || displayName(c.name).toLowerCase().includes(needle) || c.role.toLowerCase().includes(needle) || (world.houses[c.houseId]?.name.toLowerCase().includes(needle) ?? false))
      .sort((a, b) => Number(a.houseId === house) - Number(b.houseId === house) || Number(b.tier === 'full') - Number(a.tier === 'full') || (b.seat ? 1 : 0) - (a.seat ? 1 : 0))
      .slice(0, 10);
  }, [world, house, q]);

  const leader = leaderId && pool.some((x) => x.c.id === leaderId) ? leaderId : candidates[0]?.c.id;
  const party = [leader, ...companions.filter((id) => id !== leader)].filter((x): x is string => !!x);
  const spec: MissionSpec | null = leader && target ? {
    kind, houseId: house, leaderId: leader, approach,
    companions: companions.filter((id) => id !== leader),
    force: force.filter((id) => party.includes(id)),
    ...(kind === 'investigate' ? { targetId: target } : kind === 'envoy' ? { targetHouseId: target } : { targetPlanetId: target }),
    ...(lead ? { leadId: lead.id, targetSectorId: lead.sectorId } : {}),
  } : null;
  const f = spec ? forecast(world, spec) : null;
  const targetChar = kind === 'investigate' && target ? world.characters[target] : undefined;

  const launch = () => {
    if (!spec) return;
    const id = `m${world.nextId}`;
    game.update((w) => {
      const next = launchMission(w, spec).world;
      if (petition) closePetition(next, house, petition);
      return next;
    });
    nav.to({ kind: 'mission', id });
  };

  return (
    <>
      <div className="page-title">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="eyebrow gold">New mission</span>
          <h2>{PLAN_TITLE[kind]}</h2>
          <p>{PLAN_BLURB[kind]}</p>
          {petition ? <p className="notice">Petitioned by the council. Sending it settles the petition.</p> : null}
          {lead ? <p className="notice">Following a lead: {lead.title}. {lead.text}</p> : null}
        </div>
      </div>
      {lead ? null : <div className="filters">
        <button type="button" className="pill" aria-pressed={kind === 'investigate'} onClick={() => switchKind('investigate')}>Investigate a person</button>
        <button type="button" className="pill" aria-pressed={kind === 'scout'} onClick={() => switchKind('scout')}>Scout a world</button>
        <button type="button" className="pill" aria-pressed={kind === 'envoy'} onClick={() => switchKind('envoy')}>Send an envoy</button>
      </div>}

      <div className="grid">
        <div className="span-7 stack">
          <Panel title="1 · Target">
            {lead && kind === 'scout' ? (
              <div className="body" style={{ display: 'grid', gap: 4 }}>
                <span><SectorLink id={lead.sectorId} withPlanet /></span>
                <span className="muted" style={{ fontSize: 12 }}>{lead.title}</span>
              </div>
            ) : kind === 'investigate' ? (
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
            ) : kind === 'envoy' ? (
              <div className="body choices">
                {Object.values(world.houses).filter((h) => h.id !== house).map((h) => {
                  const r = relation(world, h.id, house);
                  return (
                    <button key={h.id} type="button" className="choice" aria-pressed={target === h.id} onClick={() => setTarget(h.id)}>
                      <span>House {h.name}</span>
                      <span className="muted">Regards us: <span style={{ color: attitudeColor(r) }}>{attitude(r)}</span> ({r}) · court at {world.planets[h.capitalPlanetId]?.name}</span>
                    </button>
                  );
                })}
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

          <Panel title="2 · Who goes" aside={<><Term k="fieldSlots">Field slots</Term> {slots.used} of {slots.total} in use</>}>
            {pool.length === 0 ? <p className="body muted" style={{ margin: 0 }}>Everyone who could go is already out.</p> : (
              <div className="table-wrap">
                <table className="list">
                  <thead><tr><th>Leads</th><th><Term k="companions">With</Term></th><th>Name</th><th><Term k="fit">Fit</Term></th><th><Term k="mood">Mood</Term></th><th>Their answer</th><th>Travel</th></tr></thead>
                  <tbody>
                    {pool.map(({ c, skill, avail }) => (
                      <LeaderRow key={c.id} c={c} skill={skill} avail={avail}
                        isLeader={leader === c.id} isCompanion={companions.includes(c.id) && leader !== c.id}
                        forced={force.includes(c.id)} canGo={canGo(c.id)} companionsFull={companions.filter((id) => id !== leader).length >= MAX_COMPANIONS}
                        onLead={() => { setLeaderId(c.id); setCompanions((cs) => cs.filter((x) => x !== c.id)); }}
                        onCompanion={() => toggleCompanion(c.id)} onForce={() => toggleForce(c.id)}
                        travel={targetPlanet ? travelCycles(c.location.planetId, targetPlanet) : undefined} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title={<>3 · <Term k="approach">How</Term></>}>
            <div className="body choices two">
              <button type="button" className="choice" aria-pressed={approach === 'careful'} onClick={() => setApproach('careful')}>
                <span>Careful</span>
                <span className="muted">{kind === 'envoy' ? 'A long stay. More time to win them over.' : 'Takes longer. Less likely to be noticed.'}</span>
              </button>
              <button type="button" className="choice" aria-pressed={approach === 'quick'} onClick={() => setApproach('quick')}>
                <span>Quick</span>
                <span className="muted">{kind === 'envoy' ? 'A short, pointed visit. Back sooner; harder to charm.' : 'Back sooner, works harder each cycle, but far more likely to be seen.'}</span>
              </button>
            </div>
          </Panel>
        </div>

        <Panel title="Forecast" aside="As your house judges it" className="span-5 sticky">
          <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {!target ? <p className="muted" style={{ margin: 0 }}>Choose a target.</p> : null}
            {f && !f.ok ? <p className="error" style={{ margin: 0 }}>{f.reason}</p> : null}
            {f && f.ok ? (
              <>
                <dl className="kv">
                  <dt><Term k="fit">Leader's fit</Term></dt><dd>{f.fit}</dd>
                  <dt>Out and back</dt><dd>{f.total} cycles ({f.travel} each way, {f.task} at work)</dd>
                  <dt>Home by</dt><dd>{formatDate(f.returns)}</dd>
                  <dt><Term k="confidence">Our estimate is</Term></dt><dd>{f.confidence}</dd>
                  <dt>Cost</dt><dd className={f.affordable ? '' : 'error'}>{f.cost.toLocaleString('en-US')} othes{f.affordable ? '' : ' — more than we have'}</dd>
                </dl>
                {f.slots.used >= f.slots.total ? <p className="error" style={{ margin: 0, fontSize: 12 }}>Every field slot is taken ({f.slots.used} of {f.slots.total}). Wait for someone to come home, or lift the mood of your council and knights.</p> : null}
                {force.filter((id) => party.includes(id)).map((id) => (
                  <p key={id} className="notice" style={{ margin: 0, fontSize: 12 }}>{world.characters[id]!.name.given} goes under orders: mood −10, loyalty slips, and works grudgingly.</p>
                ))}
                {world.characters[leader ?? '']?.seat === 'highroy' ? <p className="notice" style={{ margin: 0, fontSize: 12 }}>The Highroy rides out himself. While he is away the council works 10% slower and no petitions come; those who ride with him by choice are honoured (+3 mood). If he is caught, it will cost dearly.</p> : null}
                {f.tired ? <p className="notice" style={{ margin: 0, fontSize: 12 }}>Only just back from a mission: they will go, but grumble (mood −3).</p> : null}
                <Odds label="Chance of a good result" p={f.success} color="var(--green)" />
                {kind === 'envoy' ? (
                  <p className="muted" style={{ fontSize: 11, margin: 0 }}>An envoy goes openly. A poor visit can cool their regard a little.</p>
                ) : (
                  <>
                    <Odds label={<Term k="noticed">Chance of being noticed</Term>} p={f.noticed} color="var(--orange)" />
                    <p className="muted" style={{ fontSize: 11, margin: 0 }}>Being noticed caps the result, tells their house who you sent, and can end in capture.</p>
                  </>
                )}
                <button type="button" className="btn primary" onClick={launch} disabled={!f.affordable || f.slots.used >= f.slots.total}>Send them</button>
              </>
            ) : null}
          </div>
        </Panel>
      </div>
    </>
  );
}

function Odds({ label, p, color }: { label: React.ReactNode; p: number; color: string }) {
  const pct = Math.round(p * 100);
  const word = pct >= 75 ? 'Very likely' : pct >= 50 ? 'Likely' : pct >= 25 ? 'Possible' : pct >= 10 ? 'Unlikely' : 'Remote';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span className="muted">{label}</span><span>{word} <span className="mono muted">~{pct}%</span></span></span>
      <span className="bar" role="img" aria-label={`${pct}%`}><span style={{ width: `${pct}%`, background: color }} /></span>
    </div>
  );
}

interface RowProps {
  c: Character; skill: number; avail: Availability; isLeader: boolean; isCompanion: boolean; forced: boolean; canGo: boolean; companionsFull: boolean;
  onLead: () => void; onCompanion: () => void; onForce: () => void; travel?: number;
}

function LeaderRow({ c, skill, avail, isLeader, isCompanion, forced, companionsFull, onLead, onCompanion, onForce, travel }: RowProps) {
  const m = moodOf(c);
  const hard = !avail.ok && !avail.forceable;
  const name = displayName(c.name);
  return (
    <tr className={hard ? 'unwilling' : isLeader || isCompanion ? 'chosen' : undefined}>
      <td><input type="radio" name="leader" checked={isLeader} disabled={hard} onChange={onLead} aria-label={`${name} leads`} /></td>
      <td><input type="checkbox" checked={isCompanion} disabled={hard || isLeader || (!isCompanion && companionsFull)} onChange={onCompanion} aria-label={`${name} goes along`} /></td>
      <td><PersonLink c={c} /><div className="muted" style={{ fontSize: 11 }}>{c.role}</div></td>
      <td>{fitLabel(skill)}</td>
      <td style={{ color: moodColor(m) }}>{moodLabel(m)} <span className="mono muted">{m}</span></td>
      <td style={{ fontSize: 12 }}>
        {avail.ok ? <span className="up">{c.seat === 'highroy' ? 'His choice' : 'Willing'}</span>
          : hard ? <span className="error">Can't go: {avail.reason}</span>
            : (
              <span style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                <span className={forced ? 'down' : 'error'}>{forced ? <Term k="order">Ordered to go</Term> : `Refuses: ${avail.reason}`}</span>
                {(isLeader || isCompanion) ? <button type="button" className="btn small" onClick={onForce}>{forced ? 'Withdraw the order' : 'Order them to go'}</button> : null}
              </span>
            )}
      </td>
      <td className="mono muted">{travel !== undefined ? `${travel} cycles` : '—'}</td>
    </tr>
  );
}

/** How many can be out at once, and why. */
export function FieldSlots() {
  const world = useWorld();
  const house = world.playerHouseId;
  const s = slotsFor(world, house);
  const avg = averageMood(world, house);
  return (
    <section className="panel">
      <div className="body actions">
        <span className="eyebrow"><Term k="fieldSlots">Field slots</Term></span>
        <span className="slots" aria-label={`${s.used} of ${s.total} in use`}>
          {Array.from({ length: 6 }, (_, i) => <span key={i} className={i < s.used ? 'used' : i < s.total ? 'free' : 'locked'} />)}
        </span>
        <span style={{ fontSize: 13 }}>{s.used} of {s.total} in use</span>
        <span className="muted" style={{ fontSize: 12 }}>Set by the <Term k="mood">mood</Term> of your council and knights: <span style={{ color: moodColor(avg) }}>{moodLabel(avg)}</span> ({avg}). Anyone out does no duties at home.</span>
      </div>
    </section>
  );
}

/** What missions have turned up and are waiting on a decision. */
export function LeadsPanel({ className }: { className?: string }) {
  const world = useWorld();
  const game = useGame();
  const house = world.playerHouseId;
  const leads = leadsOf(world, house);
  const othes = world.economy.houses[house]!.stock.othes;
  const [err, setErr] = useState<string | null>(null);
  return (
    <Panel title={<Term k="lead">Leads and finds</Term>} aside={leads.length ? `${leads.length} waiting` : 'Nothing yet'} className={className}>
      {leads.length === 0 ? <p className="body muted" style={{ margin: 0 }}>Missions turn things up: talented people, rumours of Caiges, secrets, sites worth working. They wait here.</p> : null}
      {err ? <p className="body error" style={{ margin: 0 }}>{err}</p> : null}
      {leads.map((l) => {
        const pursued = Object.values(world.missions).find((m) => m.leadId === l.id && m.stage !== 'done');
        const person = l.targetId ? world.characters[l.targetId] : undefined;
        return (
          <div key={l.id} className="row petition">
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 13 }}><span className="tag mission">{LEAD_LABEL[l.kind]}</span> {person ? <PersonLink c={person} /> : null} {person ? null : l.title}</span>
              <span className="muted" style={{ fontSize: 12 }}>{l.text}</span>
              <span className="muted" style={{ fontSize: 11 }}>{pursued ? 'Being followed up now.' : `Goes cold ${formatDate(l.expires)}.`}</span>
            </span>
            {pursued ? <Go to={{ kind: 'mission', id: pursued.id }} className="btn small">View ›</Go> : (
              <span style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {l.kind === 'recruit' ? (
                  <button type="button" className="btn small primary" disabled={othes < (l.cost ?? 0)} onClick={() => {
                    try { game.update((w) => recruit(w, l.id)); setErr(null); } catch (e) { setErr(String((e as Error).message)); }
                  }}>Bring in · {(l.cost ?? 0).toLocaleString('en-US')} othes</button>
                ) : (
                  <Go to={{ kind: 'plan', mission: l.missionKind ?? 'scout', target: l.missionKind === 'investigate' ? l.targetId : l.planetId, lead: l.id }} className="btn small primary">Pursue</Go>
                )}
                <button type="button" className="btn small" onClick={() => game.update((w) => dismissLead(w, l.id))}>Let it go</button>
              </span>
            )}
          </div>
        );
      })}
    </Panel>
  );
}

const LEAD_LABEL: Record<string, string> = { recruit: 'Someone', caige: 'Caige', site: 'Site', secret: 'Secret' };
