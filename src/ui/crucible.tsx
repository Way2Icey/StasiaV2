// The Crucible on screen: the draw, our contingent, the battle world and who holds what.
import { cannotFund, FUND_COST, fundBid } from '../sim/treasury';
import { useState } from 'react';
import { useGame, useWorld } from './context';
import { HouseLink, Panel, PersonById, PersonLink } from './links';
import {
  BATTLE_WORLD, cannotEnter, championScore, CLOSES, contingentCost, contingentPeople, COST_FUEL, COST_PROVISIONS, currentRound, DRAW_ORBIT, eligible,
  enterCrucible, FORCE, houseLabel, KNIGHT_WEIGHT, knightScore, marshalScore, MAX_KNIGHTS, menFor, ROUND_ORBITS, setStance, shortHouse, STANCE_LABEL,
  STANCE_NOTE, standings, strengthOf, troopsOf, type Contingent, type Stance,
  AGENTS_COST, AIM_LABEL, AIM_NOTE, cannotSendAgents, doctrineOf, foeActive, intelOn, reportOn, sendAgents, setPlan, type Aim,
} from '../sim/crucible';
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

const houseLink = (world: World, h: string) => (world.houses[h] ? <HouseLink id={h} /> : <span>{shortHouse(world, h)}</span>);

/** One distinct letter per house on the chart; @ for us. */
function letters(world: World): Record<string, string> {
  const out: Record<string, string> = {};
  const used = new Set(['@']);
  for (const h of world.crucible.entrants) {
    if (h === world.playerHouseId) { out[h] = '@'; continue; }
    const name = shortHouse(world, h).toUpperCase();
    const ch = [...name].find((x) => /[A-Z]/.test(x) && !used.has(x)) ?? '?';
    used.add(ch);
    out[h] = ch;
  }
  return out;
}

export function CruciblePage() {
  const world = useWorld();
  const cr = world.crucible;
  const P = world.playerHouseId;
  const d = dateParts(world.date);
  const ours = cr.contingents[P];
  const stage = cr.stage === 'drawn' ? (cr.entrants.includes(P) ? `We are drawn. Our contingent must sail by Orbit ${CLOSES}.` : 'We are not drawn this year.')
    : cr.stage === 'campaign' ? `Battles in Orbits ${ROUND_ORBITS.join(', ')}.` : `The next draw is in Orbit ${DRAW_ORBIT}${d.orbit >= DRAW_ORBIT ? ' next year' : ''}.`;
  return (
    <>
      <div className="page-title">
        <h2>The Crucible</h2>
        <p>The houses' answer to having no war. Each year five to eight houses are drawn to {BATTLE_WORLD}. Every house fields one champion and {FORCE} men's worth of troops, where a knight counts as {KNIGHT_WEIGHT} men, with a Marshal directing from orbit. They fight over the battle world's sites and the prizes in them. The battles are real. {stage}</p>
      </div>
      <div className="grid">
        {cr.stage === 'drawn' && cr.entrants.includes(P) ? <Reports className="span-12" /> : null}
        {cr.stage === 'drawn' && cr.entrants.includes(P) ? <Orders className="span-12" /> : null}
        {cr.stage === 'drawn' && cr.entrants.includes(P) && !ours ? <Muster className="span-12" /> : null}
        {cr.stage !== 'drawn' && (cr.nemeses ?? []).some((n) => !n.settled) ? <Scores className="span-12" /> : null}
        {cr.stage === 'campaign' && ours && !ours.out && currentRound(world) ? <StancePicker className="span-12" /> : null}
        {cr.stage !== 'quiet' && cr.locations.length ? <BattleWorld className="span-7" /> : null}
        {Object.keys(cr.table).length ? <Table className="span-5" /> : null}
        {ours ? <Force houseId={P} className="span-6" /> : null}
        {cr.rounds.some((r) => r.done) ? <Battles className="span-6" /> : null}
        <Panel title="Past Crucibles" aside={`${cr.history.length}`} className="span-12">
          {cr.history.length === 0 ? <p className="body muted" style={{ margin: 0 }}>None fought in our time yet.</p> : null}
          {[...cr.history].reverse().map((h) => (
            <div key={h.year} className="row" style={{ gap: 10 }}>
              <span className="mono" style={{ width: 60 }}>SY-{h.year}</span>
              <span style={{ flex: 1 }}>{houseLink(world, h.champion)} <span className="muted">over {shortHouse(world, h.runnerUp)} · {h.drawn.length} houses{h.drawn.includes(P) ? '' : ' · we were not drawn'}</span></span>
              {h.heroId ? <span className="muted">Hero: <PersonById id={h.heroId} /></span> : h.heroName ? <span className="muted">Hero: {h.heroName}</span> : null}
            </div>
          ))}
        </Panel>
      </div>
    </>
  );
}

/** What our people can tell us about each house drawn with us. */
function Reports({ className }: { className?: string }) {
  const world = useWorld();
  const { run, err } = usePlay();
  const P = world.playerHouseId;
  const others = world.crucible.entrants.filter((h) => h !== P);
  const LV = ['Nothing but rumour', 'Their habits', 'Their people', 'Their numbers'];
  return (
    <Panel title="Reports on the drawn houses" aside="Before we sail" className={className}>
      <p className="body muted" style={{ margin: '0 0 8px', fontSize: 12 }}>What we know comes from the Spymaster, from our ambassadors in their capitals, from having met them here before, and from agents sent to watch them ({AGENTS_COST} othes a house). A Marshal who knows a house's habits can set the stance that beats them.</p>
      {err ? <p className="body error" style={{ margin: 0 }}>{err}</p> : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
        {others.map((h) => {
          const r = reportOn(world, h);
          const why = cannotSendAgents(world, h);
          return (
            <div key={h} className="petition" style={{ border: '1px solid var(--line)', padding: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span><strong>{houseLink(world, h)}</strong> <span className="mono muted" style={{ fontSize: 11 }}>[{'■'.repeat(r.level)}{'□'.repeat(3 - r.level)}] {LV[r.level]}</span></span>
              {r.doctrine ? <span><em>{r.doctrine.name}.</em> <span className="muted">{r.doctrine.text}</span></span> : <span className="muted">We know nothing of how they fight.</span>}
              {r.marshal ? <span className="muted">Marshal: {r.marshal.id ? <PersonById id={r.marshal.id} /> : r.marshal.name} · {r.marshal.read}</span> : null}
              {r.champion ? <span className="muted">Champion: {r.champion.id ? <PersonById id={r.champion.id} /> : r.champion.name} · {r.champion.read} · {r.champion.record}</span> : null}
              {r.knights ? <span className="muted">Usually {r.knights}.</span> : null}
              {r.leaning ? <span className="mono muted" style={{ fontSize: 11 }}>{r.leaning}</span> : null}
              {r.scores.map((n) => <span key={n.foeKey + n.victimId} className="error" style={{ fontSize: 12 }}>A score to settle: {n.foeName} {n.what} <PersonById id={n.victimId} /> in {n.year}.</span>)}
              {r.level < 3 ? <button type="button" className="btn small" style={{ alignSelf: 'flex-start', marginTop: 4 }} disabled={!!why} title={why ?? ''} onClick={() => run((w) => sendAgents(w, h))}>Send agents · {AGENTS_COST}</button> : null}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/** The Marshal's orders: what we are there for, and whom we have studied. */
function Orders({ className }: { className?: string }) {
  const world = useWorld();
  const { run } = usePlay();
  const P = world.playerHouseId;
  const plan = world.crucible.plan ?? { aim: 'hold' as Aim };
  const others = world.crucible.entrants.filter((h) => h !== P);
  return (
    <Panel title="Orders to the Marshal" aside="Can change until landfall" className={className}>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {(Object.keys(AIM_LABEL) as Aim[]).map((a) => (
          <button key={a} type="button" className={`btn small${plan.aim === a ? ' primary' : ''}`} title={AIM_NOTE[a]} onClick={() => run((w) => setPlan(w, { ...plan, aim: a }))}>{AIM_LABEL[a]}</button>
        ))}
        <span className="muted" style={{ marginLeft: 8 }}>Study and counter:</span>
        <select value={plan.counter ?? ''} onChange={(e) => run((w) => setPlan(w, { ...plan, counter: e.target.value || undefined }))}>
          <option value="">No one in particular</option>
          {others.map((h) => <option key={h} value={h}>{shortHouse(world, h)}{intelOn(world, h) >= 1 ? ` · ${doctrineOf(h).name}` : ''}</option>)}
        </select>
      </div>
      <div className="actions" style={{ marginTop: 6 }}><button type="button" className="btn small" disabled={!!cannotFund(world)} title={cannotFund(world) ?? 'The best kit and provisions: about a twelfth stronger'} onClick={() => run(fundBid)}>{world.treasury?.funded.includes(world.crucible.year) ? 'Bid funded in full' : `Fund the bid in full · ${FUND_COST.toLocaleString('en-US')}`}</button></div>
      <p className="body muted" style={{ margin: '6px 0 0', fontSize: 12 }}>{AIM_NOTE[plan.aim]} The house we study fights at a small disadvantage against us{plan.aim === 'bleed' ? ', and is the one we hunt' : ''}. Each round the Marshal sets our stance against whoever holds the ground we go for, unless you set it yourself.</p>
    </Panel>
  );
}

/** Old scores, between Crucibles. */
function Scores({ className }: { className?: string }) {
  const world = useWorld();
  const open = (world.crucible.nemeses ?? []).filter((n) => !n.settled);
  return (
    <Panel title="Scores to settle" aside={`${open.length}`} className={className}>
      {open.map((n) => (
        <div key={n.foeKey + n.victimId} className="row" style={{ gap: 8 }}>
          <span style={{ flex: 1 }}>{n.foeName} of {shortHouse(world, n.foeHouse)} {n.what} <PersonById id={n.victimId} /> in {n.year}.</span>
          <span className="muted">{foeActive(world, n) ? 'Still fighting' : 'Gone from the field'}</span>
        </div>
      ))}
    </Panel>
  );
}

function Muster({ className }: { className?: string }) {
  const world = useWorld();
  const { run, err } = usePlay();
  const P = world.playerHouseId;
  const pool = eligible(world, P);
  const [marshal, setMarshal] = useState<string | null>(null);
  const [champion, setChampion] = useState<string | null>(null);
  const [knights, setKnights] = useState<string[]>([]);
  const ships = Object.values(world.fleet?.ships ?? {}).filter((s) => s.houseId === P && !s.lost && !s.ready && !s.arrives);
  const [ship, setShip] = useState<string>(ships[0]?.id ?? '');
  const c: Contingent = { houseId: P, marshalId: marshal, championId: champion, knights, men: menFor(knights.length), shipId: ship || undefined, menLost: 0 };
  const why = cannotEnter(world, c);
  const cost = contingentCost(c);
  const used = new Set(contingentPeople(c));
  const row = (p: Character, score: number, on: boolean, onClick: () => void) => (
    <button key={p.id} type="button" className="desk-item" aria-pressed={on} disabled={used.has(p.id) && !on} onClick={onClick} style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{on ? '■ ' : '□ '}{p.name.given} {p.name.family ?? ''} <span className="muted">· {p.seat ? 'councillor · ' : ''}{p.role}</span></span>
      <span className="when">{score.toFixed(1)}</span>
    </button>
  );
  const bar = '█'.repeat(knights.length) + '▒'.repeat(MAX_KNIGHTS - knights.length);
  return (
    <Panel title="Raise our contingent" aside={`sail by Orbit ${CLOSES}`} className={className}>
      <p className="body muted" style={{ margin: 0 }}>One Marshal in orbit, one champion, and {FORCE} men's worth: each knight takes the place of {KNIGHT_WEIGHT} men. Ten knights and no men, or none and {FORCE} men, or anything between. Everyone named is away until it ends. Councillors sent leave their seats idle.</p>
      <div className="grid" style={{ padding: 10 }}>
        <div className="span-4"><div className="eyebrow">Marshal · in orbit</div>
          {[...pool].sort((a, b) => marshalScore(b) - marshalScore(a)).slice(0, 8).map((p) => row(p, marshalScore(p), marshal === p.id, () => setMarshal(marshal === p.id ? null : p.id)))}
        </div>
        <div className="span-4"><div className="eyebrow">Champion</div>
          {[...pool].sort((a, b) => championScore(b) - championScore(a)).slice(0, 8).map((p) => row(p, championScore(p), champion === p.id, () => setChampion(champion === p.id ? null : p.id)))}
        </div>
        <div className="span-4"><div className="eyebrow">Knights · up to {MAX_KNIGHTS}</div>
          {[...pool].sort((a, b) => knightScore(b) - knightScore(a)).slice(0, 14).map((p) => row(p, knightScore(p), knights.includes(p.id), () => setKnights((k) => (k.includes(p.id) ? k.filter((x) => x !== p.id) : k.length >= MAX_KNIGHTS ? k : [...k, p.id]))))}
        </div>
      </div>
      <pre className="ascii body" style={{ margin: 0 }}>{`KNIGHTS [${bar}] ${knights.length} × ${KNIGHT_WEIGHT}\nMEN     ${String(menFor(knights.length)).padStart(3, ' ')} of ${fmt(troopsOf(world, P))} we can raise\nFORCE   ${FORCE}`}</pre>
      <div className="body" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="eyebrow">Marshal's ship</span>
        <select className="select" value={ship} onChange={(e) => setShip(e.target.value)}>
          <option value="">Charter a transport · {fmt(3000)} othes</option>
          {ships.map((s) => <option key={s.id} value={s.id}>{s.name} · away for the season</option>)}
        </select>
        <span className="muted" style={{ fontSize: 12 }}>Costs {fmt(cost.othes)} othes, {COST_PROVISIONS} provisions, {COST_FUEL} fuel · coffers {fmt(econ(world, P).stock.othes)}</span>
        <button type="button" className="btn small primary" disabled={!!why} title={why ?? undefined} onClick={() => run((w) => enterCrucible(w, c))}>{why ?? 'Sail'}</button>
      </div>
      {err ? <p className="error body" style={{ margin: 0 }}>{err}</p> : null}
    </Panel>
  );
}

export function StancePicker({ className }: { className?: string }) {
  const world = useWorld();
  const { run } = usePlay();
  const r = currentRound(world);
  if (!r) return null;
  const mine = r.stance[world.playerHouseId];
  return (
    <Panel title={`Orbit ${r.orbit}: the Marshal's stance`} aside="the Marshal chooses where to strike" className={className}>
      <p className="body muted" style={{ margin: 0 }}>Each stance beats one and loses to another. {mine ? 'You have set it.' : 'Left alone, the Marshal sets it against whoever holds the ground we go for, as well as our reports allow.'}</p>
      <div className="actions body">
        {(['bold', 'measured', 'cunning'] as Stance[]).map((s) => (
          <button key={s} type="button" className="btn option" aria-pressed={mine === s} onClick={() => run((w) => setStance(w, s))} style={{ textAlign: 'left', display: 'grid', gap: 2, maxWidth: 340, whiteSpace: 'normal', height: 'auto' }}>
            <span>{STANCE_LABEL[s]}{mine === s ? ' · chosen' : ''}</span>
            <span className="muted" style={{ fontSize: 12, textTransform: 'none', letterSpacing: 0, whiteSpace: 'normal' }}>{STANCE_NOTE[s]}</span>
          </button>
        ))}
      </div>
    </Panel>
  );
}

/** The battle world as a chart: each site, who holds it, and where each force stands. */
function BattleWorld({ className }: { className?: string }) {
  const world = useWorld();
  const cr = world.crucible;
  const P = world.playerHouseId;
  const W = 78; const Hh = 14;
  const grid = Array.from({ length: Hh }, () => Array.from({ length: W }, () => ' '));
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) if ((x * 7 + y * 13) % 29 === 0) grid[y]![x] = '·';
  const L = letters(world);
  const letter = (h: string) => L[h] ?? '?';
  for (const l of cr.locations) {
    const label = `[${l.glyph}]${l.holder ? letter(l.holder) : '-'}`;
    for (let i = 0; i < label.length && l.x + i < W; i++) grid[l.y]![l.x + i] = label[i]!;
    const here = cr.entrants.filter((h) => cr.contingents[h]?.at === l.id && !cr.contingents[h]?.out).map(letter).join('');
    for (let i = 0; i < here.length && l.x + i < W; i++) grid[Math.min(Hh - 1, l.y + 1)]![l.x + i] = here[i]!;
  }
  return (
    <Panel title={BATTLE_WORLD} aside={`${cr.locations.length} sites`} className={className}>
      <pre className="ascii body" style={{ margin: 0 }}>{grid.map((r) => r.join('')).join('\n')}</pre>
      <div className="body" style={{ display: 'grid', gap: 2, fontSize: 12 }}>
        {cr.locations.map((l) => (
          <div key={l.id} className="row" style={{ gap: 8 }}>
            <span className="mono" style={{ width: 40 }}>[{l.glyph}]</span>
            <span style={{ flex: 1 }}>{l.name} <span className="muted">· {l.prize === 'caige' ? 'a Caige' : l.prize === 'relic' ? 'a relic' : `${fmt(l.amount)} ${l.prize}`}</span></span>
            <span>{l.holder ? houseLink(world, l.holder) : <span className="muted">unheld</span>}</span>
          </div>
        ))}
        <span className="muted">Under each site: whose force stands there now. {world.crucible.entrants.map((h) => `${L[h]} ${h === P ? 'us' : shortHouse(world, h)}`).join(' · ')}</span>
      </div>
    </Panel>
  );
}

function Table({ className }: { className?: string }) {
  const world = useWorld();
  const cr = world.crucible;
  return (
    <Panel title="The houses" aside={cr.stage === 'done' ? 'final' : 'standing'} className={className}>
      <table className="ctable">
        <thead><tr><th>#</th><th>HOUSE</th><th>HELD</th><th>W–L</th><th>STRENGTH</th><th>LOST</th></tr></thead>
        <tbody>
          {standings(world).map((h, i) => {
            const t = cr.table[h]!;
            const c = cr.contingents[h];
            return (
              <tr key={h} className={h === world.playerHouseId ? 'sel' : ''}>
                <td className="mono">{i + 1}</td><td>{houseLink(world, h)}{c?.out ? <span className="muted"> · broken</span> : null}</td>
                <td className="mono">{t.held}</td><td className="mono">{t.won}–{t.lost}</td><td className="mono">{c ? Math.round(strengthOf(world, c)) : '—'}</td><td className="mono">{t.menLost}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="body muted" style={{ margin: 0, fontSize: 12 }}>Most sites held at the end wins; each house keeps the prizes of the sites it holds. A force that falls below a fifth of its strength is broken and goes home.</p>
    </Panel>
  );
}

function Force({ houseId, className }: { houseId: string; className?: string }) {
  const world = useWorld();
  const c = world.crucible.contingents[houseId]!;
  const year = world.crucible.year;
  const loc = world.crucible.locations.find((l) => l.id === c.at);
  const status = (id: string) => {
    const p = world.characters[id];
    if (!p) return null;
    return !p.alive ? <span className="error"> · fell</span> : p.flags.some((f) => f.id === 'wounded') ? <span className="muted"> · wounded</span> : null;
  };
  const line = (id: string, part: string) => {
    const p = world.characters[id];
    if (!p) return null;
    const s = world.careers?.of[id]?.[year] ?? {};
    return (
      <div key={id} className="row" style={{ gap: 8 }}>
        <span className="eyebrow" style={{ width: 70 }}>{part}</span>
        <span style={{ flex: 1 }}><PersonLink c={p} />{status(id)}</span>
        <span className="muted mono" style={{ fontSize: 12 }}>{s.crucible ? `${s.crucibleWon ?? 0}–${(s.crucible ?? 0) - (s.crucibleWon ?? 0)}${s.cDuels ? ` · duels ${s.cDuelsWon ?? 0}/${s.cDuels}` : ''}` : '—'}</span>
      </div>
    );
  };
  return (
    <Panel title="Our force" aside={c.out ? 'broken, coming home' : loc ? `at ${loc.name}` : 'in orbit'} className={className}>
      <pre className="ascii body" style={{ margin: 0 }}>{`MEN       ${c.men - c.menLost} of ${c.men}\nKNIGHTS   ${c.knights.filter((id) => world.characters[id]?.alive && !world.characters[id]!.flags.some((f) => f.id === 'wounded')).length} of ${c.knights.length} fit\nSTRENGTH  ${Math.round(strengthOf(world, c))}\nSHIP      ${c.shipId && world.fleet?.ships[c.shipId] ? world.fleet.ships[c.shipId]!.name.toUpperCase() : 'CHARTERED TRANSPORT'}`}</pre>
      {c.marshalId ? line(c.marshalId, 'Marshal') : null}
      {c.championId ? line(c.championId, 'Champion') : null}
      {c.knights.map((id) => line(id, 'Knight'))}
    </Panel>
  );
}

function Battles({ className }: { className?: string }) {
  const world = useWorld();
  const cr = world.crucible;
  const P = world.playerHouseId;
  const name = (x: string) => world.characters[x] ? displayNameOf(world, x) : x;
  return (
    <Panel title="The fighting" aside={`${cr.rounds.filter((r) => r.done).length} of ${cr.rounds.length} Orbits fought`} className={className}>
      {cr.rounds.filter((r) => r.done).map((r) => (
        <div key={r.orbit} className="body" style={{ display: 'grid', gap: 2, paddingBottom: 6 }}>
          <span className="eyebrow">Orbit {r.orbit}</span>
          {r.battles.map((b, i) => {
            const loc = cr.locations.find((l) => l.id === b.locationId)!;
            return <span key={i} style={{ fontWeight: b.sides.includes(P) ? 600 : 400 }}>{loc.name}: {shortHouse(world, b.winner)} beat {b.sides.filter((h) => h !== b.winner).map((h) => shortHouse(world, h)).join(', ')}{b.duel ? ` · duel to ${name(b.duel.winner)}` : ''}{b.fallen.length ? ` · fell: ${b.fallen.map(name).join(', ')}` : ''}</span>;
          })}
          {Object.entries(r.taken).map(([id, h]) => <span key={id} className="muted">{shortHouse(world, h)} took {cr.locations.find((l) => l.id === id)?.name} unopposed</span>)}
        </div>
      ))}
    </Panel>
  );
}

function displayNameOf(world: World, id: string): string {
  const c = world.characters[id];
  return c ? `${c.name.given} ${c.name.family ?? ''}`.trim() : id;
}

/** For the Hall: the Crucible at a glance. */
export function CrucibleGlance({ className }: { className?: string }) {
  const world = useWorld();
  const cr = world.crucible;
  const P = world.playerHouseId;
  if (!cr || cr.stage === 'quiet' || (cr.stage === 'done' && !cr.history.length)) return null;
  const rank = standings(world).indexOf(P);
  const c = cr.contingents[P];
  const text = cr.stage === 'drawn' ? (cr.entrants.includes(P) ? `We are drawn. Raise our contingent by Orbit ${CLOSES}.` : 'We are not drawn this year.')
    : cr.stage === 'done' ? `${houseLabel(world, cr.history[cr.history.length - 1]?.champion ?? '')} won the Crucible of ${cr.year}.`
    : c ? `${c.out ? 'Our force is broken.' : `We hold ${cr.table[P]?.held ?? 0} sites and stand ${rank + 1} of ${standings(world).length}.`}` : 'We are not in it this year.';
  return (
    <Panel title="The Crucible" aside={`SY-${cr.year} · ${cr.entrants.length} houses`} className={className}>
      <div className="body" style={{ display: 'grid', gap: 4 }}>
        <span>{text}</span>
        {c && cr.stage === 'campaign' ? <span className="muted mono" style={{ fontSize: 12 }}>{c.men - c.menLost} men · {c.knights.filter((id) => world.characters[id]?.alive).length} knights · strength {Math.round(strengthOf(world, c))}</span> : null}
      </div>
    </Panel>
  );
}
