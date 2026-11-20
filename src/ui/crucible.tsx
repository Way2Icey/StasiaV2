// The Crucible on screen: the year's mock war, our contingent, the table and the fights.
import { useState } from 'react';
import { useGame, useWorld } from './context';
import { HouseLink, Panel, PersonById, PersonLink } from './links';
import {
  BATTLE_WORLD, cannotEnter, championScore, CLOSES, contingentPeople, eligible, enterCrucible, FINAL_ORBIT, knightScore, marshalScore,
  MAX_CHAMPIONS, MAX_KNIGHTS, OPENS, ourNext, ROUND_ORBITS, setStance, STANCE_LABEL, STANCE_NOTE, standings,
  type Contingent, type Stance,
} from '../sim/crucible';
import { seasonLine } from '../sim/careers';
import { dateParts } from '../sim/time';
import { econ } from '../sim/economy';
import type { Character, World } from '../sim/types';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

function usePlay() {
  const game = useGame();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: (w: World) => World) => game.update((w) => { try { setErr(null); return fn(w); } catch (e) { setErr((e as Error).message); return w; } });
  return { run, err };
}

export function CruciblePage() {
  const world = useWorld();
  const cr = world.crucible;
  const P = world.playerHouseId;
  const d = dateParts(world.date);
  const stageText = cr.stage === 'open' ? `Entries open until Orbit ${CLOSES}.` : cr.stage === 'campaign' ? `The campaign: rounds in Orbits ${ROUND_ORBITS.join(', ')}.` : cr.stage === 'final' ? `The final, in Orbit ${FINAL_ORBIT}.` : `The next Crucible is called in Orbit ${OPENS}${d.orbit >= OPENS ? ' next year' : ''}.`;
  return (
    <>
      <div className="page-title">
        <h2>The Crucible</h2>
        <p>The houses' answer to having no war. Once a year every house sends a contingent to {BATTLE_WORLD} for a mock war of strategy, champions and steel. Whoever goes is gone for the season, missing from missions, council and court, and the blades are not blunted. {stageText}</p>
      </div>
      <div className="grid">
        {cr.stage === 'open' ? <Muster className="span-12" /> : null}
        {(cr.stage === 'campaign' || cr.stage === 'final') && ourNext(world) ? <StancePicker className="span-12" /> : null}
        {Object.keys(cr.table).length ? <Table className="span-5" /> : null}
        {cr.contingents[P] ? <Roster houseId={P} className="span-7" /> : null}
        {cr.engagements.length ? <Fights className="span-12" /> : null}
        <Panel title="Past champions" aside={`${cr.history.length}`} className="span-12">
          {cr.history.length === 0 ? <p className="body muted" style={{ margin: 0 }}>No Crucible has been fought in our time yet.</p> : null}
          {[...cr.history].reverse().map((h) => (
            <div key={h.year} className="row" style={{ gap: 10 }}>
              <span className="mono" style={{ width: 60 }}>SY-{h.year}</span>
              <span style={{ flex: 1 }}><HouseLink id={h.champion} /> <span className="muted">over <HouseLink id={h.runnerUp} /></span></span>
              {h.heroId ? <span className="muted">Hero: <PersonById id={h.heroId} /></span> : null}
            </div>
          ))}
        </Panel>
      </div>
    </>
  );
}

function Muster({ className }: { className?: string }) {
  const world = useWorld();
  const { run, err } = usePlay();
  const P = world.playerHouseId;
  const cur = world.crucible.contingents[P];
  const pool = eligible(world, P).concat(contingentPeople(cur).map((id) => world.characters[id]!).filter((c) => c && !eligible(world, P).includes(c)));
  const [c, setC] = useState<Contingent>(cur ?? { houseId: P, marshalId: null, champions: [], knights: [], chest: 2000 });
  const used = new Set(contingentPeople(c));
  const toggle = (list: 'champions' | 'knights', id: string, max: number) => setC((x) => ({ ...x, [list]: x[list].includes(id) ? x[list].filter((y) => y !== id) : x[list].length >= max ? x[list] : [...x[list], id] }));
  const why = cannotEnter(world, c);
  const ships = Object.values(world.fleet?.ships ?? {}).filter((s) => s.houseId === P && !s.lost && !s.ready);
  const row = (p: Character, score: number, on: boolean, onClick: () => void, disabled: boolean) => (
    <button key={p.id} type="button" className="desk-item" aria-pressed={on} disabled={disabled && !on} onClick={onClick} style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{on ? '■ ' : '□ '}{p.name.given} {p.name.family ?? ''} <span className="muted">· {p.seat ? 'councillor · ' : ''}{p.role}</span></span>
      <span className="when">{score.toFixed(1)}</span>
    </button>
  );
  return (
    <Panel title="Name our contingent" aside={cur ? 'named · can still change until entries close' : `by Orbit ${CLOSES}`} className={className}>
      <p className="body muted" style={{ margin: 0 }}>The Marshal fights the strategy front with tactics, logistics and siegecraft, helped by the war chest. Champions duel one to one. Knights and a great ship, if you send one, fight the melee. Everyone named is away from the house until we are knocked out or the final is fought. Send councillors and their seats sit idle.</p>
      <div className="grid" style={{ padding: 10 }}>
        <div className="span-4"><div className="eyebrow">Marshal · strategy</div>
          {[...pool].sort((a, b) => marshalScore(b) - marshalScore(a)).slice(0, 10).map((p) => row(p, marshalScore(p), c.marshalId === p.id, () => setC((x) => ({ ...x, marshalId: x.marshalId === p.id ? null : p.id })), used.has(p.id)))}
        </div>
        <div className="span-4"><div className="eyebrow">Champions · up to {MAX_CHAMPIONS}</div>
          {[...pool].sort((a, b) => championScore(b) - championScore(a)).slice(0, 10).map((p) => row(p, championScore(p), c.champions.includes(p.id), () => toggle('champions', p.id, MAX_CHAMPIONS), used.has(p.id)))}
        </div>
        <div className="span-4"><div className="eyebrow">Knights · up to {MAX_KNIGHTS}</div>
          {[...pool].sort((a, b) => knightScore(b) - knightScore(a)).slice(0, 12).map((p) => row(p, knightScore(p), c.knights.includes(p.id), () => toggle('knights', p.id, MAX_KNIGHTS), used.has(p.id)))}
        </div>
      </div>
      <div className="body" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="eyebrow">War chest</span>
        <select className="select" value={c.chest} onChange={(e) => setC((x) => ({ ...x, chest: Number(e.target.value) }))}>
          {[0, 1000, 2000, 4000, 8000].map((n) => <option key={n} value={n}>{fmt(n)} othes</option>)}
        </select>
        <span className="eyebrow">Great ship</span>
        <select className="select" value={c.shipId ?? ''} onChange={(e) => setC((x) => ({ ...x, shipId: e.target.value || undefined }))}>
          <option value="">None: keep it home</option>
          {ships.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <span className="muted" style={{ fontSize: 12 }}>coffers {fmt(econ(world, P).stock.othes)}</span>
        <button type="button" className="btn small primary" disabled={!!why} title={why ?? undefined} onClick={() => run((w) => enterCrucible(w, c))}>{why ?? (cur ? 'Change the contingent' : 'Send them')}</button>
      </div>
      {err ? <p className="error body" style={{ margin: 0 }}>{err}</p> : null}
    </Panel>
  );
}

export function StancePicker({ className }: { className?: string }) {
  const world = useWorld();
  const { run } = usePlay();
  const P = world.playerHouseId;
  const e = ourNext(world);
  if (!e) return null;
  const foe = e.a === P ? e.b : e.a;
  const mine = e.stance[P];
  return (
    <Panel title={e.round === 4 ? 'The final' : `Round ${e.round}`} aside={`Orbit ${e.orbit}, Phase 3 · against House ${world.houses[foe]?.name}`} className={className}>
      <p className="body muted" style={{ margin: 0 }}>How does the Marshal fight it? Each stance beats one and loses to another. Their Marshal is choosing too.</p>
      <div className="actions body">
        {(['bold', 'measured', 'cunning'] as Stance[]).map((s) => (
          <button key={s} type="button" className="btn option" aria-pressed={mine === s} onClick={() => run((w) => setStance(w, e.id, s))} style={{ textAlign: 'left', display: 'grid', gap: 2, maxWidth: 340, whiteSpace: 'normal', height: 'auto' }}>
            <span>{STANCE_LABEL[s]}{mine === s ? ' · chosen' : ''}</span>
            <span className="muted" style={{ fontSize: 12, textTransform: 'none', letterSpacing: 0, whiteSpace: 'normal' }}>{STANCE_NOTE[s]}</span>
          </button>
        ))}
      </div>
    </Panel>
  );
}

function Table({ className }: { className?: string }) {
  const world = useWorld();
  const T = world.crucible.table;
  return (
    <Panel title="The table" aside={world.crucible.stage === 'done' ? 'final' : 'standing'} className={className}>
      <table className="ctable">
        <thead><tr><th>#</th><th>HOUSE</th><th>P</th><th>W</th><th>L</th><th>FRONTS</th><th>PTS</th></tr></thead>
        <tbody>
          {standings(world).map((h, i) => (
            <tr key={h} className={h === world.playerHouseId ? 'sel' : ''}>
              <td className="mono">{i + 1}</td><td><HouseLink id={h} /></td><td className="mono">{T[h]!.played}</td><td className="mono">{T[h]!.won}</td><td className="mono">{T[h]!.lost}</td><td className="mono">{T[h]!.fronts}</td><td className="mono">{T[h]!.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="body muted" style={{ margin: 0, fontSize: 12 }}>Three points a win and one for every front taken. The top two meet in the final.</p>
    </Panel>
  );
}

function Roster({ houseId, className }: { houseId: string; className?: string }) {
  const world = useWorld();
  const c = world.crucible.contingents[houseId]!;
  const year = world.crucible.year;
  const line = (id: string, part: string) => {
    const p = world.characters[id];
    if (!p) return null;
    const s = world.careers?.of[id]?.[year] ?? {};
    return (
      <div key={id} className="row" style={{ gap: 8 }}>
        <span className="eyebrow" style={{ width: 70 }}>{part}</span>
        <span style={{ flex: 1 }}><PersonLink c={p} />{!p.alive ? <span className="error"> · fell</span> : p.flags.some((f) => f.id === 'wounded') ? <span className="muted"> · wounded</span> : null}</span>
        <span className="muted mono" style={{ fontSize: 12 }}>{s.crucible ? `${s.crucibleWon ?? 0}–${(s.crucible ?? 0) - (s.crucibleWon ?? 0)}${s.cDuels ? ` · duels ${s.cDuelsWon ?? 0}/${s.cDuels}` : ''}${s.cMvp ? ` · best ×${s.cMvp}` : ''}` : '—'}</span>
      </div>
    );
  };
  return (
    <Panel title="Our contingent" aside={`war chest ${fmt(c.chest)}${c.shipId && world.fleet?.ships[c.shipId] ? ` · the ${world.fleet.ships[c.shipId]!.name}` : ''}`} className={className}>
      {c.marshalId ? line(c.marshalId, 'Marshal') : null}
      {c.champions.map((id) => line(id, 'Champion'))}
      {c.knights.map((id) => line(id, 'Knight'))}
    </Panel>
  );
}

function Fights({ className }: { className?: string }) {
  const world = useWorld();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Panel title="Engagements" aside={`${world.crucible.engagements.filter((e) => e.winner).length} fought`} className={className}>
      {world.crucible.engagements.map((e) => (
        <div key={e.id}>
          <button type="button" className="log-row" onClick={() => setOpen((o) => (o === e.id ? null : e.id))} aria-expanded={open === e.id}>
            <span className="when">{e.round === 4 ? 'FINAL' : `R${e.round}`}</span>
            <span className="mark">{e.winner ? '■' : '□'}</span>
            <span className="type">ORBIT {e.orbit}</span>
            <span className="head">{world.houses[e.a]?.name} v {world.houses[e.b]?.name}{e.winner ? ` · ${world.houses[e.winner]?.name} won` : ''}</span>
            <span className="where">{e.mvpId ? `best: ${world.characters[e.mvpId]?.name.given}` : ''}</span>
          </button>
          {open === e.id && e.fronts ? (
            <div className="record-card">
              <p style={{ margin: '0 0 6px' }}>{STANCE_LABEL[e.stance[e.a]!]} {world.houses[e.a]?.name} against {STANCE_LABEL[e.stance[e.b]!]} {world.houses[e.b]?.name}</p>
              {e.fronts.map((f) => <div key={f.front} className="mono" style={{ fontSize: 12 }}>{f.front.toUpperCase().padEnd(10, ' ')} {world.houses[f.winner]?.name} ({f.a}–{f.b}) · {f.note}</div>)}
              {e.fallen?.length ? <p className="error" style={{ margin: '6px 0 0' }}>Fell: {e.fallen.map((id) => world.characters[id]?.name.given).join(', ')}</p> : null}
            </div>
          ) : null}
        </div>
      ))}
    </Panel>
  );
}

/** For the Hall: the Crucible at a glance. */
export function CrucibleGlance({ className }: { className?: string }) {
  const world = useWorld();
  const cr = world.crucible;
  if (!cr || cr.stage === 'quiet') return null;
  const P = world.playerHouseId;
  const rank = standings(world).indexOf(P);
  return (
    <Panel title="The Crucible" aside={`SY-${cr.year} · ${cr.stage}`} className={className}>
      <div className="body" style={{ display: 'grid', gap: 4 }}>
        <span>{cr.stage === 'open' ? (cr.contingents[P] ? 'Our contingent is named.' : `Entries open: name our contingent by Orbit ${CLOSES}.`) : cr.stage === 'done' ? `${world.houses[cr.history[cr.history.length - 1]?.champion ?? '']?.name ?? '—'} won this year's Crucible.` : cr.contingents[P] ? `We stand ${rank + 1} of ${standings(world).length}.` : 'We sent no one.'}</span>
        {cr.contingents[P]?.marshalId ? <span className="muted" style={{ fontSize: 12 }}>Marshal <PersonById id={cr.contingents[P]!.marshalId} /> · {seasonLine(world.careers?.of[cr.contingents[P]!.marshalId!]?.[cr.year] ?? {})}</span> : null}
      </div>
    </Panel>
  );
}
