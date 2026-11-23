// War: our forces, our wars and their fronts, declaring and ending them, and the wars across the Archon.
import { useState } from 'react';
import { useGame, useWorld } from './context';
import { Go, Panel, PersonById } from './links';
import { bar } from './hall';
import { Term } from './tip';
import { ArchonHouseLink } from './archon';
import { houseName, liveHouses, regardOf } from '../sim/archon';
import {
  activeWars, assignFormation, cannotDeclare, cannotJoin, commanderOf, declareWar, escalate, FORMATION_LABEL, formationsOf, FRONT_LABEL, GOAL_LABEL,
  grievances, joinWar, shipsWithFleet, offerPeace, partiesOf, peaceOdds, setCommander, setKnight, sideOf, sidePower, UNIT_LABEL, warsOf, type Formation, type Front, type Rung, type War, type WarGoal,
} from '../sim/war';
import { formatDate } from '../sim/time';
import { beginPeaceTalks, beginSabotage, whyNoAgent } from '../sim/scenes_api';
import { econ, netPerPhase, phaseLedger } from '../sim/economy';
import type { World } from '../sim/types';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Title({ eyebrow, title, sub }: { eyebrow?: React.ReactNode; title: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="page-title">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        {eyebrow ? <span className="eyebrow gold">{eyebrow}</span> : null}
        <h2>{title}</h2>
        {sub ? <p>{sub}</p> : null}
      </div>
    </div>
  );
}

function usePlay() {
  const game = useGame();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: (w: World) => World) => game.update((w) => { try { setErr(null); return fn(w); } catch (e) { setErr((e as Error).message); return w; } });
  return { run, err };
}

/** A meter from −100 to +100 drawn as ASCII: left them, right us. */
function Tug({ v, left, right }: { v: number; left: string; right: string }) {
  const n = 24;
  const mid = n / 2;
  const at = Math.round(mid + (v / 100) * mid);
  const cells = Array.from({ length: n }, (_, i) => (i === mid ? '│' : (i >= Math.min(mid, at) && i < Math.max(mid, at)) ? (v >= 0 ? '▶' : '◀') : '·')).join('');
  return <span className="mono tug" title={`${Math.round(v)}`}><span className="muted">{left}</span> {cells} <span className="muted">{right}</span></span>;
}

// ---------------------------------------------------------------- forces

function FormationRow({ f }: { f: Formation }) {
  const world = useWorld();
  const { run } = usePlay();
  const P = world.playerHouseId;
  const cmd = commanderOf(world, f);
  const fronts = warsOf(world, P).flatMap((war) => war.fronts.filter((fr) => !fr.ended).map((fr) => ({ war, fr })));
  const [add, setAdd] = useState('');
  const knights = Object.values(world.characters).filter((c) => c.alive && c.houseId === P && c.flags.some((x) => x.id === 'knighted') && !f.knights.includes(c.id) && c.id !== f.commanderId);
  const leaders = Object.values(world.characters).filter((c) => c.alive && c.houseId === P && c.tier === 'full' && c.seat !== 'highroy' && (c.flags.some((x) => x.id === 'knighted') || c.seat === 'grandMaster' || c.stats.fleetCommand >= 10 || c.id === f.commanderId));
  return (
    <div className="formation">
      <div className="fline2" style={{ gap: 10, alignItems: 'baseline' }}>
        <strong style={{ minWidth: 170 }}>{cap(f.name)}</strong>
        <span className="tag">{FORMATION_LABEL[f.kind]}</span>
        <span className="mono" title="Strength">{bar(f.strength / Math.max(1, f.max), 12)} {fmt(f.strength)}/{fmt(f.max)} {UNIT_LABEL[f.kind]}</span>
        <span className="mono muted" title="Morale">morale {Math.round(f.morale)}</span>
        <span className="mono muted" title="Battles won of fought">{f.won}/{f.fought} won</span>
      </div>
      <div className="fline2" style={{ gap: 8, fontSize: 12, alignItems: 'center' }}>
        <span className="muted">Led by</span>
        <select className="select" aria-label={`Commander of ${f.name}`} value={f.commanderId ?? ''} onChange={(e) => e.target.value && run((w) => setCommander(w, f.id, e.target.value))}>
          {!f.commanderId ? <option value="">{cmd.name}</option> : null}
          {leaders.map((c) => <option key={c.id} value={c.id}>{c.name.given} {c.name.family ?? c.name.hold ?? ''}</option>)}
        </select>
        <span className="muted">skill {cmd.skill.toFixed(1)}</span>
        <span className="muted">· at</span>
        <select className="select" aria-label={`Where ${f.name} is`} value={f.front ?? ''} onChange={(e) => run((w) => assignFormation(w, f.id, e.target.value || null))}>
          <option value="">Home, rebuilding</option>
          {fronts.map(({ war, fr }) => <option key={fr.id} value={fr.id}>{FRONT_LABEL[fr.kind]}: {fr.where} ({war.name})</option>)}
        </select>
      </div>
      <div className="fline2" style={{ gap: 6, fontSize: 12, alignItems: 'center' }}>
        <span className="muted">Knights:</span>
        {f.knights.length ? f.knights.map((k) => <span key={k} className="chip"><PersonById id={k} /> <button type="button" className="btn tiny" aria-label="Detach" onClick={() => run((w) => setKnight(w, f.id, k, false))}>×</button></span>) : <span className="muted">none</span>}
        <select className="select" aria-label="Attach a knight" value={add} onChange={(e) => setAdd(e.target.value)}>
          <option value="">Attach a knight…</option>
          {knights.map((c) => <option key={c.id} value={c.id}>{c.name.given} {c.name.family ?? c.name.hold ?? ''}</option>)}
        </select>
        <button type="button" className="btn small" disabled={!add} onClick={() => { run((w) => setKnight(w, f.id, add, true)); setAdd(''); }}>Attach</button>
      </div>
      {f.kind === 'fleet' ? <div className="muted" style={{ fontSize: 12 }}>Great ships with it: {shipsWithFleet(world, P).length ? shipsWithFleet(world, P).map((sh) => `${sh.name} (hull ${Math.round(sh.condition)})`).join(', ') : 'none (all on other duties)'}. Ships on blockade, escort or a watch stay where they are.</div> : null}
      {f.honours.length ? <div className="muted" style={{ fontSize: 11 }}>Honours: {f.honours.slice(-4).join(' · ')}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------- a war

function FrontRow({ war, fr }: { war: War; fr: Front }) {
  const world = useWorld();
  const P = world.playerHouseId;
  const ours = sideOf(war, P);
  const flip = ours === 'defenders' ? -1 : 1;
  const pa = sidePower(world, war, fr, 'attackers'), pd = sidePower(world, war, fr, 'defenders');
  const [us, them] = ours === 'defenders' ? [pd, pa] : [pa, pd];
  const forces = Object.values(world.war!.formations).filter((f) => f.front === fr.id);
  return (
    <div className="front">
      <div className="fline2" style={{ gap: 8, alignItems: 'baseline' }}>
        <strong>{FRONT_LABEL[fr.kind]}</strong>
        <span className="muted">{fr.where}</span>
        {fr.ended ? <span className="tag">{fr.winner === ours ? 'won' : fr.winner ? 'lost' : 'closed'}</span> : null}
        {fr.battle ? <span className="tag">battle now</span> : null}
        {ours && !fr.ended ? <SabotageButton frontId={fr.id} /> : null}
      </div>
      <Tug v={fr.meter * flip} left={ours ? 'them' : houseName(world, war.defender)} right={ours ? 'us' : houseName(world, war.attacker)} />
      {!fr.ended ? (
        <div className="muted" style={{ fontSize: 12 }}>
          Strength here: {ours ? `us ${us.toFixed(1)} · them ${them.toFixed(1)}` : `${pa.toFixed(1)} · ${pd.toFixed(1)}`}
          {forces.length ? ` · ${forces.map((f) => `${cap(f.name)} (${houseName(world, f.houseId)})`).join(', ')}` : ''}
        </div>
      ) : null}
    </div>
  );
}

function SabotageButton({ frontId }: { frontId: string }) {
  const world = useWorld();
  const { run } = usePlay();
  const why = whyNoAgent(world);
  return <button type="button" className="btn tiny" style={{ marginLeft: 'auto' }} disabled={!!why} title={why ?? 'A live infiltration: burn their depots behind the line'} onClick={() => run((w) => beginSabotage(w, frontId))}>Send someone behind the lines</button>;
}

function WarCard({ war }: { war: War }) {
  const world = useWorld();
  const { run, err } = usePlay();
  const P = world.playerHouseId;
  const ours = sideOf(war, P);
  const foe = ours === 'attackers' ? war.defender : war.attacker;
  const score = ours === 'defenders' ? -war.score : war.score;
  const principal = war.attacker === P || war.defender === P;
  const [open, setOpen] = useState(false);
  const log = war.log.slice().reverse();
  return (
    <Panel title={cap(war.name)} aside={`${war.rung === 'war' ? 'War' : 'Border clashes'} · since ${formatDate(war.since)}`} className="span-12">
      <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {err ? <p className="error">{err}</p> : null}
        <div style={{ fontSize: 13 }}>
          <ArchonHouseLink id={war.attacker} />{war.attackers.length ? <> with {war.attackers.map((h, i) => <span key={h}>{i ? ', ' : ''}<ArchonHouseLink id={h} /></span>)}</> : null}
          <span className="muted"> against </span>
          <ArchonHouseLink id={war.defender} />{war.defenders.length ? <> with {war.defenders.map((h, i) => <span key={h}>{i ? ', ' : ''}<ArchonHouseLink id={h} /></span>)}</> : null}
          <div className="muted" style={{ fontSize: 12 }}>For {GOAL_LABEL[war.goal].toLowerCase()} · cause: {war.cause}{war.ceasefire ? ' · the Numarade has ordered a ceasefire' : ''}{war.defied ? ' · we defy the Numarade' : ''}</div>
        </div>
        <div><span className="eyebrow">The war</span> <Tug v={score} left="them" right="us" /></div>
        <div className="mono" style={{ fontSize: 12 }}>
          Weariness: us {bar((war.exhaustion[P] ?? 0) / 100, 10)} {Math.round(war.exhaustion[P] ?? 0)} · them {bar((war.exhaustion[foe] ?? 0) / 100, 10)} {Math.round(war.exhaustion[foe] ?? 0)}
          <span className="muted"> · dead: ours {fmt(war.losses[P] ?? 0)}, theirs {fmt(war.losses[foe] ?? 0)}</span>
        </div>
        {(() => { const cost = -phaseLedger(world, P).filter((l) => l.kind === 'war').reduce((t, l) => t + l.amount, 0); const net = netPerPhase(phaseLedger(world, P)).othes; return cost > 0 ? <div style={{ fontSize: 12 }}><Term k="warcost">The war costs us</Term> <strong className="down">{fmt(cost)}</strong> a Phase{net < 0 ? <span className="down"> · we lose {fmt(-net)} a Phase all told{econ(world, P).stock.othes > 0 ? `; the coffers last about ${Math.max(0, Math.floor(econ(world, P).stock.othes / -net / 5))} Orbits` : '; the coffers are empty'}</span> : null}</div> : null; })()}
        <div className="fronts">{war.fronts.filter((f) => !f.ended).map((fr) => <FrontRow key={fr.id} war={war} fr={fr} />)}</div>
        <div className="actions">
          {war.rung === 'clashes' && war.attacker === P ? <button type="button" className="btn" onClick={() => run((w) => escalate(w, war.id))} title="The fleets go for the space over their world">Make it open war</button> : null}
          {principal ? <button type="button" className="btn primary" onClick={() => run((w) => beginPeaceTalks(w, war.id))} title="Sit down with their envoys: a live negotiation">Open talks</button> : null}
          {principal ? <button type="button" className="btn" onClick={() => run((w) => offerPeace(w, war.id, 'white'))}>Offer an even peace <span className="muted">· {Math.round(peaceOdds(world, war, 'white') * 100)}%</span></button> : null}
          {principal ? <button type="button" className="btn" onClick={() => run((w) => offerPeace(w, war.id, 'yield'))} title="They get what they came for">Yield</button> : <button type="button" className="btn" onClick={() => run((w) => offerPeace(w, war.id, 'white'))}>Leave the war</button>}
          <button type="button" className="btn small" onClick={() => setOpen(!open)}>{open ? 'Hide the record' : `The record (${war.log.length})`}</button>
        </div>
        <div className="warlog">
          {(open ? log : log.slice(0, 4)).map((l, i) => <div key={i} className={l.big ? 'big' : ''}><span className="mono muted">{formatDate(l.date)}</span> {l.text}</div>)}
        </div>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------- declare

function DeclarePanel({ className }: { className?: string }) {
  const world = useWorld();
  const { run, err } = usePlay();
  const P = world.playerHouseId;
  const [target, setTarget] = useState('');
  const [goal, setGoal] = useState<WarGoal>('tribute');
  const [rung, setRung] = useState<Rung>('clashes');
  const houses = liveHouses(world).filter((h) => h.id !== P).sort((a, b) => regardOf(world, P, a.id) - regardOf(world, P, b.id));
  const why = target ? cannotDeclare(world, target, rung) : 'Choose a house.';
  const just = target ? grievances(world, P, target) : [];
  return (
    <Panel title="Go to war" aside={`war chest ${fmt(econ(world, P).stock.othes)} othes`} className={className}>
      <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {err ? <p className="error">{err}</p> : null}
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="select" aria-label="Against" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Against…</option>
            {houses.map((h) => <option key={h.id} value={h.id}>{h.name} ({regardOf(world, P, h.id)})</option>)}
          </select>
          <select className="select" aria-label="How far" value={rung} onChange={(e) => setRung(e.target.value as Rung)}>
            <option value="clashes">Clashes on the border</option>
            <option value="war">Open war</option>
          </select>
          {rung === 'war' ? (
            <select className="select" aria-label="For" value={goal} onChange={(e) => setGoal(e.target.value as WarGoal)}>
              {(Object.keys(GOAL_LABEL) as WarGoal[]).map((g) => <option key={g} value={g}>{GOAL_LABEL[g]}</option>)}
            </select>
          ) : null}
          <button type="button" className="btn primary" disabled={!!why} title={why ?? undefined} onClick={() => run((w) => declareWar(w, target, rung === 'war' ? goal : 'humble', rung))}>{rung === 'war' ? 'Declare war' : 'Begin the clashes'}</button>
        </div>
        {target ? (
          <div style={{ fontSize: 12 }}>
            <span className="eyebrow">Our grievances</span>
            {just.length ? <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>{just.map((g) => <li key={g}>{g}</li>)}</ul> : <div className="muted">None anyone would accept. A war without cause costs honour and the others' good opinion.</div>}
          </div>
        ) : null}
        <span className="muted" style={{ fontSize: 11 }}>Clashes are a limited war on the border and easy to step back from; they win coin and standing at most. Open war sends the fleets for the space over their world, then a siege, and can take worlds, Caiges, hostages and fealty.</span>
        {why && target ? <span className="muted" style={{ fontSize: 12 }}>{why}</span> : null}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------- the page

export function WarPage() {
  const world = useWorld();
  const { run, err } = usePlay();
  const P = world.playerHouseId;
  const ours = warsOf(world, P);
  const others = activeWars(world).filter((x) => !sideOf(x, P));
  const s = world.war;
  const past = (s?.wars ?? []).filter((x) => x.status === 'ended').slice(0, 8);
  const hunted = (s?.named ?? []).filter((n) => !n.done && n.against && world.characters[n.against]?.alive && world.characters[n.against]?.houseId === P);
  const raised = (s?.named ?? []).filter((n) => n.houseId === P).slice(-6).reverse();
  return (
    <>
      <Title eyebrow={<Term k="war">The ladder of war</Term>} title="War" sub="Grievance, clashes on the border, open war for the space over a world, a siege, and terms. Our people decide most of it; what we decide is where they go and when to stop." />
      {err ? <p className="error">{err}</p> : null}
      <div className="grid">
        <Panel title="Our forces" aside={`${formationsOf(world, P).length} formations`} className="span-12">
          <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {formationsOf(world, P).map((f) => <FormationRow key={f.id} f={f} />)}
            <span className="muted" style={{ fontSize: 11 }}>Soldiers and crews are counted, not named, until a battle gives one of them a reason to matter. Forces at home rebuild a little every Phase.</span>
          </div>
        </Panel>
        {ours.length ? ours.map((w) => <WarCard key={w.id} war={w} />) : <Panel title="Our wars" className="span-12"><div className="body muted">We are at peace.</div></Panel>}
        <DeclarePanel className="span-6" />
        <Panel title="Scores and debts" className="span-6">
          <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
            {hunted.map((n) => <div key={n.id}><strong>{n.name}</strong> <span className="muted">of <ArchonHouseLink id={n.houseId} /> hunts</span> <PersonById id={n.against} /> <span className="muted">· {n.why}</span></div>)}
            {raised.map((n) => <div key={n.id}><strong>{n.name}</strong> <span className="muted">· from the ranks: {n.why} ({n.year})</span></div>)}
            {(s?.tributes ?? []).filter((t) => t.from === P || t.to === P).map((t, i) => <div key={i}>Tribute: <ArchonHouseLink id={t.from} /> pays <ArchonHouseLink id={t.to} /> {fmt(t.amount)} a year, to {t.until}</div>)}
            {(s?.hostages ?? []).filter((h) => h.from === P || h.heldBy === P).map((h, i) => <div key={i}>Hostage: {h.personId ? <PersonById id={h.personId} /> : h.name} of <ArchonHouseLink id={h.from} />, held by <ArchonHouseLink id={h.heldBy} /> since {h.since}</div>)}
            {Object.entries(s?.liege ?? {}).filter(([v, l]) => v === P || l === P).map(([v, l]) => <div key={v}>Fealty: <ArchonHouseLink id={v} /> is sworn to <ArchonHouseLink id={l} /></div>)}
            {!hunted.length && !raised.length && !(s?.tributes ?? []).some((t) => t.from === P || t.to === P) ? <span className="muted">Nothing owed, and no one hunting us.</span> : null}
          </div>
        </Panel>
        <Panel title="Wars across the Archon" aside={`${others.length} under way`} className="span-12">
          <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {others.length ? others.map((war) => (
              <div key={war.id} className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
                <span style={{ minWidth: 220 }}><strong>{cap(war.name)}</strong><br /><span className="muted">{partiesOf(war, 'attackers').map((h) => houseName(world, h)).join(', ')} against {partiesOf(war, 'defenders').map((h) => houseName(world, h)).join(', ')} · {war.rung === 'war' ? 'open war' : 'clashes'}</span></span>
                <Tug v={war.score} left={houseName(world, war.defender)} right={houseName(world, war.attacker)} />
                <button type="button" className="btn small" disabled={!!cannotJoin(world, war.id, 'attackers')} title={cannotJoin(world, war.id, 'attackers') ?? undefined} onClick={() => run((w) => joinWar(w, war.id, 'attackers'))}>Join {houseName(world, war.attacker)}</button>
                <button type="button" className="btn small" disabled={!!cannotJoin(world, war.id, 'defenders')} title={cannotJoin(world, war.id, 'defenders') ?? undefined} onClick={() => run((w) => joinWar(w, war.id, 'defenders'))}>Join {houseName(world, war.defender)}</button>
              </div>
            )) : <span className="muted">The Archon is at peace, for now.</span>}
          </div>
        </Panel>
        {past.length ? (
          <Panel title="Wars lately ended" className="span-12">
            <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
              {past.map((war) => <div key={war.id}><span className="mono muted">{war.since.year}–{war.result?.date.year}</span> <strong>{cap(war.name)}</strong> <span className="muted">· {war.result?.text}{war.result?.terms ? ` Terms: ${GOAL_LABEL[war.result.terms].toLowerCase()}.` : ''}</span></div>)}
            </div>
          </Panel>
        ) : null}
        <div className="span-12"><Go to={{ kind: 'numarade' }} className="btn">The Numarade ›</Go></div>
      </div>
    </>
  );
}
