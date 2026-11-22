// Training: tutors, drill, academies and wards.
import { useState } from 'react';
import { useGame, useWorld } from './context';
import { Go, HouseLink, Panel, PersonById, PersonLink } from './links';
import { Term } from './tip';
import {
  ACADEMY_COST, answerWardOffer, askForWard, cannotEnrol, cannotSendWard, cannotTutor, enrolAcademy, kindFor, paceOf, PROGRAM_LABEL, rankOf,
  recallWard, sendWard, chargesOf, PERSONAL_LIMIT, ACADEMY_PLACES, isYoungling, academyAge, setDrill, setGuardian, startTutoring, stopTraining, studentsAt, SUBJECTS, teacherSkill, TUTOR_COST, WARD_NOTE, youths, enrolmentOf,
  answerIntake, cannotTakeIntake, type Subject,
} from '../sim/training';
import { modulesOf, placeOf } from '../sim/holdings';
import { isAway } from '../sim/court';
import { seatHolder } from '../sim/query';
import { ageOf } from '../sim/characters';
import { SPECIES } from '../data/species';
import { Diamonds } from './careers';
import { dateParts } from '../sim/time';
import type { Character, World } from '../sim/types';

const SUBJ = Object.keys(SUBJECTS) as Subject[];
function short(d: Parameters<typeof dateParts>[0]): string {
  const p = dateParts(d);
  return `${p.year}·${p.orbit}·${String(p.cycleOfOrbit).padStart(2, '0')}`;
}

function usePlay() {
  const game = useGame();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: (w: World) => World) => game.update((w) => { try { setErr(null); return fn(w); } catch (e) { setErr((e as Error).message); return w; } });
  return { run, err };
}

function ours(world: World): Character[] {
  return Object.values(world.characters).filter((c) => c.alive && c.houseId === world.playerHouseId && c.tier === 'full');
}

export function TrainingPage({ id }: { id?: string }) {
  return (
    <>
      <div className="page-title">
        <h2>Training &amp; academy</h2>
        <p>Make the house's people better: a tutor for one, drill for the knights, an academy for many. Wards pass between houses as pledges, honours and, sometimes, hostages.</p>
      </div>
      <div className="grid">
        <Intake className="span-12" />
        <UnderInstruction className="span-12" />
        <Tutor className="span-6" pick={id} />
        <Drill className="span-6" />
        <Academies className="span-12" pick={id} />
        <Panel title="Wards" className="span-12"><p className="body" style={{ margin: 0 }}>Wards live with the house's young: <Go to={{ kind: 'people', view: 'young' }}>People › Younglings & wards ›</Go></p></Panel>
      </div>
    </>
  );
}

/** The pupils the academy brings forward each Orbit: educate, train, or send home. */
function Intake({ className }: { className?: string }) {
  const world = useWorld();
  const { run, err } = usePlay();
  const list = world.training.intake ?? [];
  if (!list.length) return null;
  return (
    <Panel title={<Term k="intake">Brought forward by the academy</Term>} aside={`${list.length} waiting · ${ACADEMY_COST} othes a place`} className={className}>
      {err ? <p className="body error" style={{ margin: 0 }}>{err}</p> : null}
      {list.map((i) => {
        const c = world.characters[i.studentId];
        if (!c) return null;
        const why = cannotTakeIntake(world, i.id);
        return (
          <div key={i.id} className="row petition">
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span><PersonLink c={c} />, {Math.floor(ageOf(c, world.date))} <Diamonds c={c} /></span>
              <span className="muted" style={{ fontSize: 12 }}>{i.how[0]!.toUpperCase() + i.how.slice(1)}. At {placeOf(world, world.holdings.modules[i.moduleId]!)}. Goes home {short(i.expires)} if no one takes them.</span>
            </span>
            <span style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
              <button type="button" className="btn small primary" disabled={!!why} title={why ?? 'Books, ledgers and a sharp eye'} onClick={() => run((w) => answerIntake(w, i.id, 'educate'))}>Educate</button>
              <button type="button" className="btn small primary" disabled={!!why} title={why ?? 'Blade, gun, footwork and wind'} onClick={() => run((w) => answerIntake(w, i.id, 'train'))}>Train</button>
              <button type="button" className="btn small" onClick={() => run((w) => answerIntake(w, i.id, 'home'))}>Send home</button>
            </span>
          </div>
        );
      })}
    </Panel>
  );
}

function UnderInstruction({ className }: { className?: string }) {
  const world = useWorld();
  const { run } = usePlay();
  const P = world.playerHouseId;
  const list = Object.values(world.training.enrolments).filter((e) => world.characters[e.studentId]?.houseId === P || e.houseId === P);
  return (
    <Panel title="Under instruction" aside={`${list.length}`} className={className}>
      {list.length === 0 ? <p className="body muted" style={{ margin: 0 }}>No one is being taught.</p> : null}
      <div className="table-wrap">
        {list.length ? (
          <table className="ctable">
            <thead><tr><th>STUDENT</th><th>HOW</th><th>SUBJECT</th><th>TEACHER</th><th>PACE</th><th>GAINED</th><th>ENDS</th><th /></tr></thead>
            <tbody>
              {list.map((e) => {
                const c = world.characters[e.studentId]!;
                const gained = Object.entries(e.gained).filter(([, v]) => v).map(([k, v]) => `${k} +${v}`).join(', ');
                return (
                  <tr key={e.id}>
                    <td><PersonLink c={c} />{c.houseId !== P ? <span className="muted"> · <HouseLink id={c.houseId} /></span> : null}</td>
                    <td>{PROGRAM_LABEL[e.program]}{e.program === 'ward' ? <> at <HouseLink id={e.houseId} /></> : e.moduleId ? ` · ${placeOf(world, world.holdings.modules[e.moduleId]!)}` : ''}</td>
                    <td>{SUBJECTS[e.subject].label}</td>
                    <td>{e.teacherId ? <PersonById id={e.teacherId} /> : <span className="muted">—</span>}</td>
                    <td className="mono">{paceOf(world, e).toFixed(2)}</td>
                    <td className="mono" style={{ whiteSpace: 'normal' }}>{gained || '—'}</td>
                    <td className="muted mono">{e.end ? short(e.end) : 'ongoing'}</td>
                    <td>{e.program !== 'ward' && c.houseId === P ? <button type="button" className="btn small" onClick={() => run((w) => stopTraining(w, e.id))}>Stop</button> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </div>
      <p className="body muted" style={{ margin: 0, fontSize: 12 }}>Pace is points a Phase across the subject's skills. Youths learn half again as fast, the old far slower; potential and a good teacher matter most.</p>
    </Panel>
  );
}

function Tutor({ className, pick }: { className?: string; pick?: string }) {
  const world = useWorld();
  const { run, err } = usePlay();
  const people = ours(world).filter((c) => !isAway(world, c.id));
  const pupils = people.filter((c) => isYoungling(world, c));
  const [student, setStudent] = useState(pick && pupils.some((c) => c.id === pick) ? pick : '');
  const [subject, setSubject] = useState<Subject>('arms');
  const [tutor, setTutor] = useState('');
  const tutors = people.filter((c) => c.id !== student).sort((a, b) => teacherSkill(world, b.id, subject) - teacherSkill(world, a.id, subject)).slice(0, 8);
  const why = student && tutor ? cannotTutor(world, student, tutor) : 'Pick a student and a tutor';
  return (
    <Panel title="A tutor" aside={`${TUTOR_COST} othes · one Orbit`} className={className}>
      <p className="body muted" style={{ margin: 0 }}>For children and younglings only. Each teacher takes at most {PERSONAL_LIMIT} personal charges, pupils and wards together.</p>
      <div className="body" style={{ display: 'grid', gap: 6 }}>
        <select className="select" aria-label="Student" value={student} onChange={(e) => setStudent(e.target.value)}>
          <option value="">Student…</option>
          {pupils.map((c) => <option key={c.id} value={c.id}>{c.name.given} {c.name.family ?? ''} · {ageOf(c, world.date)} · {c.role}</option>)}
        </select>
        <select className="select" aria-label="Subject" value={subject} onChange={(e) => setSubject(e.target.value as Subject)}>
          {SUBJ.map((s) => <option key={s} value={s}>{SUBJECTS[s].label} · {SUBJECTS[s].note}</option>)}
        </select>
        <select className="select" aria-label="Tutor" value={tutor} onChange={(e) => setTutor(e.target.value)}>
          <option value="">Tutor…</option>
          {tutors.map((c) => <option key={c.id} value={c.id} disabled={chargesOf(world, c.id).length >= PERSONAL_LIMIT}>{c.name.given} {c.name.family ?? ''} · skill {teacherSkill(world, c.id, subject).toFixed(1)} · {chargesOf(world, c.id).length}/{PERSONAL_LIMIT} charges</option>)}
        </select>
        {student && tutor ? <span className="muted">Pace about {paceOf(world, { studentId: student, program: 'tutor', subject, teacherId: tutor, houseId: world.playerHouseId }).toFixed(2)} a Phase. A pupil who comes to like their tutor keeps them as a mentor.</span> : null}
        <button type="button" className="btn small primary" disabled={!!why} title={why ?? undefined} onClick={() => run((w) => startTutoring(w, student, tutor, subject))}>{why ?? 'Begin'}</button>
        {err ? <p className="error" style={{ margin: 0 }}>{err}</p> : null}
      </div>
    </Panel>
  );
}

function Drill({ className }: { className?: string }) {
  const world = useWorld();
  const { run } = usePlay();
  const P = world.playerHouseId;
  const gm = seatHolder(world, P, 'grandMaster');
  const knights = ours(world).filter((c) => c.role === 'Knight');
  const drill = world.training.drill ?? null;
  return (
    <Panel title="Drill" aside={drill ? `${SUBJECTS[drill].label.toLowerCase()} · ${knights.length} knights` : 'stood down'} className={className}>
      <p className="body muted" style={{ margin: 0 }}>The knights at court train together under the Grand Master{gm ? <> (<PersonLink c={gm} />)</> : ''}. It costs nothing but a little of their mood each Phase. Knights away on missions miss it.</p>
      <div className="actions">
        {(['arms', 'command', 'resonance'] as Subject[]).map((s) => (
          <button key={s} type="button" className="btn small" aria-pressed={drill === s} onClick={() => run((w) => setDrill(w, s))}>{SUBJECTS[s].label}</button>
        ))}
        <button type="button" className="btn small" aria-pressed={!drill} onClick={() => run((w) => setDrill(w, null))}>Stand down</button>
      </div>
    </Panel>
  );
}

function Academies({ className, pick }: { className?: string; pick?: string }) {
  const world = useWorld();
  const { run, err } = usePlay();
  const P = world.playerHouseId;
  const mods = modulesOf(world, P, 'academy');
  const [student, setStudent] = useState(pick ?? '');
  const [subject, setSubject] = useState<Subject>('learning');
  const people = ours(world).filter((c) => !isAway(world, c.id) && !c.seat && academyAge(world, c));
  const wardsHere = Object.values(world.training.wards).filter((s) => s.host === P).map((s) => world.characters[s.wardId]!).filter(Boolean);
  return (
    <Panel title={<Term k="academy">Academies</Term>} aside={mods.length ? `${mods.length}` : 'none built'} className={className}>
      {mods.length === 0 ? <p className="body muted" style={{ margin: 0 }}>We have no academy. Build one from a sector's page (open it from the <Go to={{ kind: 'worlds' }}>Map</Go>).</p> : null}
      {mods.map((m) => {
        const st = studentsAt(world, m.id);
        const why = student ? cannotEnrol(world, student, m.id) : 'Pick a student';
        return (
          <div key={m.id} className="body" style={{ display: 'grid', gap: 6, borderBottom: '1px solid var(--line)' }}>
            <div><b>{placeOf(world, m)}</b> <span className="muted">· level {m.level} · {st.length}/{ACADEMY_PLACES} students · reputation {Math.round(m.reputation ?? 0)} · head {m.overseerId ? <PersonById id={m.overseerId} /> : <b>none: name one on its sector page</b>}</span></div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <select className="select" aria-label="Student" value={student} onChange={(e) => setStudent(e.target.value)}>
                <option value="">Student…</option>
                {[...people, ...wardsHere].map((c) => <option key={c.id} value={c.id}>{c.name.given} {c.name.family ?? ''} · {ageOf(c, world.date)}{c.houseId !== P ? ' · ward' : ''}</option>)}
              </select>
              <select className="select" aria-label="Subject" value={subject} onChange={(e) => setSubject(e.target.value as Subject)}>
                {SUBJ.map((s) => <option key={s} value={s}>{SUBJECTS[s].label}</option>)}
              </select>
              <button type="button" className="btn small primary" disabled={!!why} title={why ?? undefined} onClick={() => run((w) => enrolAcademy(w, student, m.id, subject))}>{why ?? `Enrol · ${ACADEMY_COST}`}</button>
            </div>
          </div>
        );
      })}
      <p className="body muted" style={{ margin: 0, fontSize: 12 }}>One head teaches up to {ACADEMY_PLACES} students at once, and every student learns from the head's own skills: choose the head for what you want taught. Youths and young adults only. Two Orbits a course; each graduate raises the academy's name, and a known academy draws recruits.</p>
      {err ? <p className="error body" style={{ margin: 0 }}>{err}</p> : null}
    </Panel>
  );
}

export function Wards({ className }: { className?: string }) {
  const world = useWorld();
  const { run, err } = usePlay();
  const P = world.playerHouseId;
  const stays = Object.values(world.training.wards);
  const away = stays.filter((s) => s.from === P);
  const here = stays.filter((s) => s.host === P);
  const offers = world.training.offers.filter((o) => o.to === P);
  const young = youths(world, P);
  const others = Object.values(world.houses).filter((h) => h.id !== P);
  const [ward, setWard] = useState('');
  const [host, setHost] = useState('');
  const [ask, setAsk] = useState('');
  const why = ward && host ? cannotSendWard(world, ward, host) : 'Pick a youth and a house';
  const guardians = ours(world).filter((c) => !isAway(world, c.id));
  return (
    <Panel title="Wards" aside={`${away.length} of ours abroad · ${here.length} at our court`} className={className}>
      <p className="body muted" style={{ margin: 0 }}>Sending a ward up to a greater house is an honour; down, a humbling; to an equal, a bond. A ward learns at the host's court, makes friends and enemies there, and comes home after four Orbits with opinions. While a house's ward lives with another, it does not easily turn on its host.</p>
      {offers.map((o) => (
        <div key={o.id} className="row petition">
          <span style={{ flex: 1 }}><HouseLink id={o.from} /> offers <PersonById id={o.wardId} /> as a ward. <span className="muted">{WARD_NOTE[kindFor(world, o.from, P)]}</span></span>
          <button type="button" className="btn small primary" onClick={() => run((w) => answerWardOffer(w, o.id, true))}>Take them in</button>
          <button type="button" className="btn small" onClick={() => run((w) => answerWardOffer(w, o.id, false))}>Decline</button>
        </div>
      ))}
      <div className="table-wrap">
        {stays.filter((s) => s.from === P || s.host === P).length ? (
          <table className="ctable">
            <thead><tr><th>WARD</th><th>FROM</th><th>RAISED AT</th><th>KIND</th><th>GUARDIAN</th><th>HOME</th><th /></tr></thead>
            <tbody>
              {[...away, ...here].map((s) => (
                <tr key={s.id}>
                  <td><PersonById id={s.wardId} /></td>
                  <td><HouseLink id={s.from} /></td>
                  <td><HouseLink id={s.host} /></td>
                  <td>{s.kind}</td>
                  <td>{s.host === P ? (
                    <select className="select" aria-label="Guardian" value={s.guardianId ?? ''} onChange={(e) => run((w) => setGuardian(w, s.id, e.target.value))}>
                      <option value="">(none)</option>
                      {guardians.map((g) => <option key={g.id} value={g.id} disabled={g.id !== s.guardianId && chargesOf(world, g.id).length >= PERSONAL_LIMIT}>{g.name.given} {g.name.family ?? ''} · {g.role} · {chargesOf(world, g.id).length}/{PERSONAL_LIMIT}</option>)}
                    </select>
                  ) : s.guardianId ? <PersonById id={s.guardianId} /> : '—'}</td>
                  <td className="muted mono">{short(s.end)}</td>
                  <td>{s.from === P ? <button type="button" className="btn small" title="Their house's regard −8" onClick={() => run((w) => recallWard(w, s.id))}>Call home</button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
      <div className="body" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid var(--line)' }}>
        <span className="eyebrow">Send a ward</span>
        <select className="select" aria-label="Which youth" value={ward} onChange={(e) => setWard(e.target.value)}>
          <option value="">Youth…</option>
          {young.map((c) => <option key={c.id} value={c.id}>{c.name.given} {c.name.family ?? ''} · {ageOf(c, world.date)}</option>)}
        </select>
        <select className="select" aria-label="To which house" value={host} onChange={(e) => setHost(e.target.value)}>
          <option value="">To…</option>
          {others.map((h) => <option key={h.id} value={h.id}>House {h.name} · {kindFor(world, P, h.id)}</option>)}
        </select>
        <button type="button" className="btn small primary" disabled={!!why} title={why ?? undefined} onClick={() => run((w) => sendWard(w, ward, host))}>{why ?? 'Send'}</button>
      </div>
      <div className="body" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="eyebrow">Ask for a ward</span>
        <select className="select" aria-label="From which house" value={ask} onChange={(e) => setAsk(e.target.value)}>
          <option value="">From…</option>
          {others.map((h) => <option key={h.id} value={h.id}>House {h.name} · rank {rankOf(world, h.id).toFixed(2)} vs ours {rankOf(world, P).toFixed(2)}</option>)}
        </select>
        <button type="button" className="btn small" disabled={!ask} onClick={() => run((w) => askForWard(w, ask))}>Ask</button>
      </div>
      {err ? <p className="error body" style={{ margin: 0 }}>{err}</p> : null}
    </Panel>
  );
}

/** The house's young: who they are, where they are being raised, and what they are learning. */
export function Younglings() {
  const world = useWorld();
  const { run, err } = usePlay();
  const P = world.playerHouseId;
  const young = Object.values(world.characters).filter((c) => c.alive && c.houseId === P && c.tier === 'full' && !c.seat && ageOf(c, world.date) < SPECIES[c.species].adulthood * 1.4)
    .sort((a, b) => ageOf(b, world.date) - ageOf(a, world.date));
  const eligible = new Set(youths(world, P).map((c) => c.id));
  const others = Object.values(world.houses).filter((h) => h.id !== P);
  const [host, setHost] = useState<Record<string, string>>({});
  const stayOf = (id: string) => Object.values(world.training.wards).find((s) => s.wardId === id);
  return (
    <div className="grid">
      <Panel title="Younglings" aside={`${young.length} of our house · ${eligible.size} old enough to be wards`} className="span-12">
        <p className="body muted" style={{ margin: 0 }}>The children and younglings of the house. From about half of adulthood until they come of age they can be sent to another house as wards or given a personal tutor. Young adults show here too: they can no longer be wards, but an academy will still take them.</p>
        <div className="table-wrap">
          <table className="ctable">
            <thead><tr><th>NAME</th><th>AGE</th><th>POTENTIAL</th><th>WHERE</th><th>LEARNING</th><th>SEND AS WARD</th></tr></thead>
            <tbody>
              {young.map((c) => {
                const st = stayOf(c.id);
                const en = enrolmentOf(world, c.id);
                const h = host[c.id] ?? '';
                const why = h ? cannotSendWard(world, c.id, h) : null;
                const wardAge = Math.ceil(SPECIES[c.species].adulthood * 0.5);
                return (
                  <tr key={c.id}>
                    <td><PersonLink c={c} /></td>
                    <td className="mono">{ageOf(c, world.date)}</td>
                    <td><Diamonds c={c} /></td>
                    <td>{st ? <>ward at <HouseLink id={st.host} /> · home {short(st.end)}</> : isAway(world, c.id) ? 'away' : 'at court'}</td>
                    <td>{en ? `${PROGRAM_LABEL[en.program]} · ${SUBJECTS[en.subject].label.toLowerCase()}` : <span className="muted">—</span>}</td>
                    <td>
                      {st ? <span className="muted">—</span> : !eligible.has(c.id) ? <span className="muted">{ageOf(c, world.date) < wardAge ? `too young until ${wardAge}` : !isYoungling(world, c) ? 'young adult: academy only' : 'not now'}</span> : (
                        <span style={{ display: 'flex', gap: 6 }}>
                          <select className="select" aria-label="To which house" value={h} onChange={(e) => setHost({ ...host, [c.id]: e.target.value })}>
                            <option value="">To…</option>
                            {others.map((o) => <option key={o.id} value={o.id}>House {o.name} · {kindFor(world, P, o.id)}</option>)}
                          </select>
                          <button type="button" className="btn small primary" disabled={!h || !!why} title={why ?? (h ? WARD_NOTE[kindFor(world, P, h)] : undefined)} onClick={() => run((w) => sendWard(w, c.id, h))}>{why ?? 'Send'}</button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {err ? <p className="error body" style={{ margin: 0 }}>{err}</p> : null}
      </Panel>
      <Wards className="span-12" />
    </div>
  );
}
