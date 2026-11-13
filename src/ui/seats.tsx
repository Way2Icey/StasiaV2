// The Council of Designers as a set of seats you open, each running its own
// part of the house.
import { useState } from 'react';
import { councilOf, SEAT_TITLE } from '../sim/world';
import { OATHS_BY_ID, TASKS_BY_ID } from '../sim/council';
import { activeMissionOf, MISSION_LABEL } from '../sim/missions';
import { moodColor, moodLabel, moodOf } from '../sim/mood';
import { ageOf } from '../sim/characters';
import { alive } from '../sim/query';
import { knowledgeOf } from '../sim/knowledge';
import { relation } from '../sim/relations';
import { formatDate } from '../sim/time';
import { econ, netPerPhase, phaseLedger } from '../sim/economy';
import { isAway } from '../sim/court';
import {
  answerNews, appointEnvoy, dismissEnvoy, envoyCandidates, envoysOf, houseNews, MAX_ENVOYS, setStance, STANCE_LABEL, stanceOf,
} from '../sim/politics';
import { QUARTER_ECONOMY, TAX } from '../data/economy';
import { FLAGS_BY_ID } from '../data/flags';
import type { Character, CouncilSeat, Stance } from '../sim/types';
import { useGame, useNav, useWorld } from './context';
import { FamilyLink, Go, HouseLink, Panel, PersonLink, SectorLink } from './links';
import { ArmouryPanel, CaptivesPanel, RansomDemands, Regard, TaskControl } from './council';
import { Term } from './tip';

function initials(c: Character) {
  const a = c.name.given.charAt(0);
  const b = (c.name.family ?? c.name.hold ?? '').replace(/^the /, '').charAt(0);
  return (a + b).toUpperCase();
}

/** Where someone is right now, as a short word. */
function whereabouts(world: ReturnType<typeof useWorld>, c: Character): { text: string; tone: string } {
  if (c.flags.some((f) => f.id === 'captive' || f.id === 'missing')) return { text: 'Missing', tone: 'error' };
  const m = activeMissionOf(world, c.id);
  if (m) return { text: `Away · ${MISSION_LABEL[m.kind]}`, tone: 'down' };
  if (c.flags.some((f) => f.id === 'wounded')) return { text: 'Wounded', tone: 'down' };
  if (c.flags.some((f) => f.id === 'ill')) return { text: 'Ill', tone: 'down' };
  return { text: 'At home', tone: 'up' };
}

function MoodText({ c }: { c: Character }) {
  const m = moodOf(c);
  return <span style={{ color: moodColor(m) }}>{moodLabel(m)} <span className="mono muted">{m}</span></span>;
}

// ---------------------------------------------------------------- the grid

export function CouncilGrid({ className }: { className?: string }) {
  const world = useWorld();
  const nav = useNav();
  const house = world.playerHouseId;
  const court = world.courts[house]!;
  const aligned = new Set(court.oath ? OATHS_BY_ID[court.oath.id]?.tasks ?? [] : []);
  // The Champion sits under the Grand Master.
  const seats = councilOf(world, house).filter((c) => c.seat !== 'champion');
  return (
    <section className={`seat-grid ${className ?? ''}`} aria-label="Council seats">
      {seats.map((c) => {
        const seat = c.seat as CouncilSeat;
        const a = court.tasks[seat];
        const def = a ? TASKS_BY_ID[a.task] : undefined;
        const pct = def && a ? Math.min(100, Math.round((a.progress / def.threshold) * 100)) : 0;
        const w = whereabouts(world, c);
        const go = () => nav.to(seat === 'highroy' ? { kind: 'character', id: c.id } : { kind: 'seat', id: seat });
        return (
          <button key={c.id} type="button" className="seat-card" onClick={go}>
            <span className="eyebrow gold">{SEAT_TITLE[seat]}</span>
            <span className="seat-who">
              <span className="portrait small" aria-hidden="true">{initials(c)}</span>
              <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                <strong>{c.name.given} {c.name.family ?? (c.name.hold ? `of ${c.name.hold}` : '')}</strong>
                <span className={w.tone} style={{ fontSize: 11 }}>{w.text}</span>
              </span>
            </span>
            {seat === 'highroy' ? (
              <span className="muted" style={{ fontSize: 12 }}>{court.oath ? `Oath: ${OATHS_BY_ID[court.oath.id]!.label}` : 'No oath sworn'}</span>
            ) : (
              <>
                <span style={{ fontSize: 12 }}>{def ? <>{aligned.has(def.id) ? '★ ' : ''}{def.label}</> : 'No task'}</span>
                <span className="bar"><span style={{ width: `${pct}%`, background: def && aligned.has(def.id) ? 'var(--gold)' : 'var(--blue)' }} /></span>
              </>
            )}
            <span style={{ fontSize: 11 }}><MoodText c={c} /></span>
            <span className="seat-open" aria-hidden="true">Open ›</span>
          </button>
        );
      })}
    </section>
  );
}

// ---------------------------------------------------------------- one seat

const SEAT_BLURB: Partial<Record<CouncilSeat, string>> = {
  grandMaster: 'The knights, the Champion, the garrisons and the Caige armoury.',
  envoy: 'The envoy corps, where the house stands with every other house, and how it answers the news.',
  spymaster: 'What we know of every house, who we hold, and what moves in the shadows.',
  steward: 'The treasury, the books and the sectors.',
  physician: 'The health of the house.',
  elder: 'The record of the house: its oaths, its annals and its young.',
};

export function SeatPage({ seat }: { seat: CouncilSeat }) {
  const world = useWorld();
  const house = world.playerHouseId;
  const holder = councilOf(world, house).find((c) => c.seat === seat);
  return (
    <>
      <div className="page-title">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="eyebrow gold"><Go to={{ kind: 'council' }}>Council of Designers</Go></span>
          <h2><Term k={`seat:${seat}`}>{SEAT_TITLE[seat]}</Term></h2>
          <p>{SEAT_BLURB[seat]}</p>
        </div>
      </div>
      <div className="grid">
        <Panel title="The seat" className="span-12">
          <div className="body seat-head">
            {holder ? (
              <>
                <span className="portrait small" aria-hidden="true">{initials(holder)}</span>
                <span style={{ display: 'grid', gap: 2 }}>
                  <PersonLink c={holder} />
                  <span className="muted" style={{ fontSize: 12 }}>{holder.role} · age {ageOf(holder, world.date)} · <MoodText c={holder} /> · <span className={whereabouts(world, holder).tone}>{whereabouts(world, holder).text}</span></span>
                </span>
                <div style={{ flex: 1, minWidth: 260 }}><TaskControl c={holder} /></div>
              </>
            ) : <span className="muted">The seat is empty.</span>}
          </div>
        </Panel>
        {seat === 'grandMaster' ? <GrandMaster /> : null}
        {seat === 'envoy' ? <Speaker /> : null}
        {seat === 'spymaster' ? <Spymaster /> : null}
        {seat === 'steward' ? <Steward /> : null}
        {seat === 'physician' ? <Physician /> : null}
        {seat === 'elder' ? <Elder /> : null}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Grand Master

function GrandMaster() {
  const world = useWorld();
  const house = world.playerHouseId;
  const champion = councilOf(world, house).find((c) => c.seat === 'champion');
  const knights = alive(world).filter((c) => c.houseId === house && c.role === 'Knight')
    .sort((a, b) => b.stats.duelling + b.stats.tactics - (a.stats.duelling + a.stats.tactics));
  const home = knights.filter((k) => !isAway(world, k.id)).length;
  const caige = (c: Character) => c.flags.find((f) => f.id === 'caigeBonded')?.detail;
  const levies = Object.values(world.planets).filter((p) => p.houseId === house).flatMap((p) => p.sectors)
    .flatMap((s) => s.quarters.filter((q) => q.kind === 'Military').map((q) => ({ q, s })));
  return (
    <>
      {champion ? (
        <Panel title={<Term k="seat:champion">House Champion</Term>} className="span-12">
          <div className="body seat-head">
            <span className="portrait small" aria-hidden="true">{initials(champion)}</span>
            <span style={{ display: 'grid', gap: 2 }}>
              <PersonLink c={champion} />
              <span className="muted" style={{ fontSize: 12 }}>Duelling {champion.stats.duelling} · Valor {champion.stats.valor}{caige(champion) ? ` · Caige ${caige(champion)}` : ''} · <MoodText c={champion} /> · <span className={whereabouts(world, champion).tone}>{whereabouts(world, champion).text}</span></span>
            </span>
            <div style={{ flex: 1, minWidth: 260 }}><TaskControl c={champion} /></div>
          </div>
        </Panel>
      ) : null}
      <Panel title="The knights" aside={<><Term k="homeDuty">{home} of {knights.length} at home</Term></>} className="span-12">
        {knights.length === 0 ? <p className="body muted" style={{ margin: 0 }}>The house has no knights.</p> : (
          <div className="table-wrap">
            <table className="list">
              <thead><tr><th>Knight</th><th>Family</th><th>Age</th><th><Term k="stat:duelling">Duel</Term></th><th><Term k="stat:tactics">Tact</Term></th><th><Term k="stat:valor">Valor</Term></th><th><Term k="stat:discipline">Disc</Term></th><th><Term k="caige">Caige</Term></th><th><Term k="mood">Mood</Term></th><th>Where</th></tr></thead>
              <tbody>
                {knights.map((k) => {
                  const w = whereabouts(world, k);
                  return (
                    <tr key={k.id}>
                      <td><PersonLink c={k} /></td>
                      <td><FamilyLink id={k.familyId} /></td>
                      <td className="mono">{ageOf(k, world.date)}</td>
                      <td className="mono">{k.stats.duelling}</td>
                      <td className="mono">{k.stats.tactics}</td>
                      <td className="mono">{k.stats.valor}</td>
                      <td className="mono">{k.stats.discipline}</td>
                      <td>{caige(k) ?? <span className="muted">—</span>}</td>
                      <td><MoodText c={k} /></td>
                      <td className={w.tone}>{w.text}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="body muted" style={{ margin: 0, fontSize: 12 }}>Training: set the Grand Master to Drill the host, or the Champion to Train with the knights. With more than half the knights away, the capital grows restless.</p>
      </Panel>
      <Panel title={<Term k="levies">Garrisons and levies</Term>} className="span-12">
        <div className="table-wrap">
          <table className="list">
            <thead><tr><th>Garrison</th><th>Sector</th><th>Strength</th><th>Upkeep / Phase</th><th>Commander</th></tr></thead>
            <tbody>
              {levies.map(({ q, s }) => {
                const upkeep = QUARTER_ECONOMY[q.name]?.flow.othes ?? 0;
                return (
                  <tr key={q.id}>
                    <td>{q.name}</td>
                    <td><SectorLink id={s.id} /></td>
                    <td>{q.gives}</td>
                    <td className="mono down">{upkeep < 0 ? `${upkeep.toLocaleString('en-US')} othes` : '—'}</td>
                    <td>{q.overseerId ? <PersonLink c={world.characters[q.overseerId]!} /> : <span className="muted">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="body muted" style={{ margin: 0, fontSize: 12 }}>Raising levies from the sectors and taking the field come with the military milestone.</p>
      </Panel>
      <ArmouryPanel className="span-12" />
    </>
  );
}

// ---------------------------------------------------------------- Speaker of the Council

function Speaker() {
  const world = useWorld();
  const game = useGame();
  const house = world.playerHouseId;
  const envoys = envoysOf(world, house);
  const candidates = envoyCandidates(world, house).filter((c) => !isAway(world, c.id));
  const [pick, setPick] = useState('');
  const chosen = pick || candidates[0]?.id || '';
  const news = houseNews(world, house);
  return (
    <>
      <Panel title={<Term k="envoyCorps">The envoy corps</Term>} aside={`${envoys.length} of ${MAX_ENVOYS}`} className="span-6">
        {envoys.length === 0 ? <p className="body muted" style={{ margin: 0 }}>No envoys. Only the Speaker or the Highroy can lead an envoy mission.</p> : null}
        {envoys.map((c) => (
          <div key={c.id} className="row">
            <span style={{ flex: 1 }}><PersonLink c={c} /> <span className="muted" style={{ fontSize: 12 }}>· Diplomacy {c.stats.diplomacy} · Eloquence {c.stats.eloquence} · <MoodText c={c} /></span></span>
            <span className={whereabouts(world, c).tone} style={{ fontSize: 12 }}>{whereabouts(world, c).text}</span>
            <button type="button" className="btn small" onClick={() => game.update((w) => dismissEnvoy(w, c.id))}>Stand down</button>
          </div>
        ))}
        {envoys.length < MAX_ENVOYS && candidates.length ? (
          <div className="body actions">
            <select aria-label="Noble to appoint" className="select" value={chosen} onChange={(e) => setPick(e.target.value)}>
              {candidates.slice(0, 12).map((c) => <option key={c.id} value={c.id}>{c.name.given} {c.name.family ?? ''} · Diplomacy {c.stats.diplomacy}</option>)}
            </select>
            <button type="button" className="btn small primary" onClick={() => { game.update((w) => appointEnvoy(w, house, chosen)); setPick(''); }}>Name an envoy</button>
          </div>
        ) : null}
        <div className="body"><Go to={{ kind: 'plan', mission: 'envoy' }} className="btn small">Send an envoy ›</Go></div>
      </Panel>

      <Panel title={<Term k="stance">Where we stand</Term>} aside="Our public line toward each house" className="span-6">
        {Object.values(world.houses).filter((h) => h.id !== house).map((h) => {
          const s = stanceOf(world, house, h.id);
          return (
            <div key={h.id} className="row" style={{ flexWrap: 'wrap' }}>
              <span style={{ flex: 1, minWidth: 140 }}><HouseLink id={h.id} /> <span className="muted" style={{ fontSize: 12 }}>regards us <Regard v={relation(world, h.id, house)} /></span></span>
              <span className="filters">
                {(['friendly', 'neutral', 'opposed'] as Stance[]).map((x) => (
                  <button key={x} type="button" className="pill" aria-pressed={s === x} onClick={() => game.update((w) => setStance(w, house, h.id, x))}>{STANCE_LABEL[x]}</button>
                ))}
              </span>
            </div>
          );
        })}
      </Panel>

      <Panel title={<Term k="news">House news</Term>} aside="What the other houses have done in the open" className="span-12">
        {news.length === 0 ? <p className="body muted" style={{ margin: 0 }}>Nothing yet. Births, knightings and deals between houses appear here as they happen.</p> : null}
        {news.map((n) => {
          const done = world.answered.includes(n.key);
          return (
            <div key={n.key} className="row" style={{ flexWrap: 'wrap' }}>
              <span className="mono muted" style={{ fontSize: 11, width: 150, flexShrink: 0 }}>{formatDate(n.date)}</span>
              <span style={{ flex: 1, minWidth: 200, fontSize: 13 }}><HouseLink id={n.houseId} />: {n.text}</span>
              {done ? <span className="muted" style={{ fontSize: 12 }}>Answered</span> : (
                <span style={{ display: 'flex', gap: 6 }}>
                  <button type="button" className="btn small" onClick={() => game.update((w) => answerNews(w, house, n, 'commend'))}>Commend</button>
                  <button type="button" className="btn small" onClick={() => game.update((w) => answerNews(w, house, n, 'condemn'))}>Condemn</button>
                </span>
              )}
            </div>
          );
        })}
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------- Spymaster

function Spymaster() {
  const world = useWorld();
  const house = world.playerHouseId;
  const shadows = world.feed.filter((f) => f.kind === 'intrigue').slice(-10).reverse();
  const spotted = alive(world).filter((c) => c.houseId !== house && c.flags.some((f) => f.id === 'exposed' && f.knownBy?.includes(house)));
  return (
    <>
      <Panel title="What we know of each house" className="span-6">
        {Object.values(world.houses).filter((h) => h.id !== house).map((h) => {
          const council = alive(world).filter((c) => c.houseId === h.id && c.seat);
          const avg = council.length ? Math.round(council.reduce((s, c) => s + knowledgeOf(world, house, c.id).depth, 0) / council.length) : 0;
          const looked = world.lastLooked?.[house]?.[h.id];
          return (
            <div key={h.id} className="row" style={{ flexWrap: 'wrap' }}>
              <span style={{ flex: 1, minWidth: 120 }}><HouseLink id={h.id} /></span>
              <span className="bar" style={{ maxWidth: 140 }}><span style={{ width: `${avg}%`, background: 'var(--blue)' }} /></span>
              <span className="muted" style={{ fontSize: 11, width: 200 }}>council known {avg} · {looked ? `last good look ${formatDate(looked)}` : 'never looked closely'}</span>
            </div>
          );
        })}
      </Panel>
      <Panel title={<Term k="exposed">Their agents we know</Term>} className="span-6">
        {spotted.length === 0 ? <p className="body muted" style={{ margin: 0 }}>We have not spotted any foreign agents. Watch our own catches more of them.</p> : null}
        {spotted.map((c) => <div key={c.id} className="row"><PersonLink c={c} /><span className="muted" style={{ fontSize: 12 }}>· House <HouseLink id={c.houseId} /></span></div>)}
      </Panel>
      <RansomDemands className="span-12" />
      <CaptivesPanel className="span-12" />
      <Panel title="From the shadows" aside="Latest" className="span-12 feed">
        {shadows.length === 0 ? <p className="body muted" style={{ margin: 0 }}>Quiet, for now.</p> : null}
        {shadows.map((f, i) => <div className="row" key={i}><time>{formatDate(f.date)}</time><span style={{ fontSize: 13 }}>{f.text}</span></div>)}
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------- Steward

function Steward() {
  const world = useWorld();
  const house = world.playerHouseId;
  const e = econ(world, house);
  const net = netPerPhase(phaseLedger(world, house));
  const caught = alive(world).filter((c) => c.flags.some((f) => f.id === 'embezzler' && f.knownBy?.includes(house)));
  const sectors = Object.values(world.planets).filter((p) => p.houseId === house).flatMap((p) => p.sectors).filter((s) => s.controllerFamilyId).sort((a, b) => b.unrest - a.unrest);
  return (
    <>
      <Panel title="The treasury" aside={<Go to={{ kind: 'economy' }}>Economy ›</Go>} className="span-6">
        <div className="body">
          <dl className="kv">
            <dt><Term k="othes">Othes</Term></dt><dd className="mono">{Math.round(e.stock.othes).toLocaleString('en-US')} ({net.othes >= 0 ? '+' : ''}{net.othes.toLocaleString('en-US')} a Phase)</dd>
            <dt><Term k="taxes">Taxes</Term></dt><dd>{TAX[e.tax].label}</dd>
            <dt><Term k="provisions">Provisions</Term></dt><dd className="mono">{Math.round(e.stock.provisions).toLocaleString('en-US')} ({net.provisions >= 0 ? '+' : ''}{net.provisions} a Phase)</dd>
          </dl>
        </div>
      </Panel>
      <Panel title={<Term k="embezzler">Caught skimming</Term>} className="span-6">
        {caught.length === 0 ? <p className="body muted" style={{ margin: 0 }}>No one, yet. Set the Steward to Audit the books.</p> : null}
        {caught.map((c) => <div key={c.id} className="row"><PersonLink c={c} /><span className="muted" style={{ fontSize: 12 }}>· {c.flags.find((f) => f.id === 'embezzler')?.detail}</span></div>)}
      </Panel>
      <Panel title={<Term k="unrest">The sectors</Term>} className="span-12">
        {sectors.map((s) => (
          <div key={s.id} className="row">
            <span style={{ flex: 1 }}><SectorLink id={s.id} /></span>
            <span className="bar" style={{ maxWidth: 200 }}><span style={{ width: `${s.unrest}%`, background: s.unrest > 35 ? 'var(--orange)' : s.unrest > 18 ? 'var(--gold)' : 'var(--green)' }} /></span>
            <span className="mono" style={{ width: 30, textAlign: 'right' }}>{s.unrest}</span>
          </div>
        ))}
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------- Physician and Elder

function Physician() {
  const world = useWorld();
  const house = world.playerHouseId;
  const ailing = alive(world).flatMap((c) => (c.houseId === house ? c.flags.filter((f) => f.id === 'wounded' || f.id === 'ill' || f.id === 'grieving').map((f) => ({ c, f })) : []));
  return (
    <Panel title="Who needs tending" aside={`${ailing.length}`} className="span-12">
      {ailing.length === 0 ? <p className="body muted" style={{ margin: 0 }}>The house is well.</p> : null}
      {ailing.map(({ c, f }, i) => (
        <div key={i} className="row">
          <span style={{ flex: 1 }}><PersonLink c={c} /></span>
          <span>{FLAGS_BY_ID[f.id]?.label}{f.detail ? ` (${f.detail})` : ''}</span>
          <span className="muted" style={{ fontSize: 12 }}>{f.until ? `until ${formatDate(f.until)}` : ''}</span>
        </div>
      ))}
    </Panel>
  );
}

function Elder() {
  const world = useWorld();
  const house = world.playerHouseId;
  const court = world.courts[house]!;
  const annals = world.annals?.[house] ?? [];
  const young = alive(world).filter((c) => c.houseId === house && c.tier === 'full' && ageOf(c, world.date) < 30 && (c.role === 'Child' || c.role.includes('of the Highroy') || c.role === 'Heir' || c.role === 'Ward'));
  return (
    <>
      <Panel title={<Term k="oath">Oaths sworn</Term>} className="span-6">
        {court.oaths.length === 0 ? <p className="body muted" style={{ margin: 0 }}>No oath has run its course yet.</p> : null}
        {court.oaths.map((o, i) => (
          <div key={i} className="row"><span className="mono muted" style={{ fontSize: 11 }}>{formatDate(o.ended)}</span><span style={{ flex: 1 }}>{OATHS_BY_ID[o.id]?.label}</span><span className={o.result === 'kept' ? 'up' : 'down'}>{o.result}</span></div>
        ))}
      </Panel>
      <Panel title="The young of the house" className="span-6">
        {young.length === 0 ? <p className="body muted" style={{ margin: 0 }}>No children in the house.</p> : null}
        {young.map((c) => <div key={c.id} className="row"><PersonLink c={c} /><span className="muted" style={{ fontSize: 12 }}>· {c.role} · age {ageOf(c, world.date)}</span></div>)}
      </Panel>
      <Panel title={<Term k="annals">Our annals</Term>} className="span-12">
        {annals.length === 0 ? <p className="body muted" style={{ margin: 0 }}>Nothing recorded yet.</p> : null}
        {annals.slice(0, 20).map((e, i) => <div key={i} className="row"><span className="mono muted" style={{ fontSize: 11, width: 150, flexShrink: 0 }}>{formatDate(e.date)}</span><span style={{ fontSize: 13 }}>{e.text}</span></div>)}
      </Panel>
    </>
  );
}
