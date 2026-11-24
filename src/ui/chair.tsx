// The Exarchon's chair. When it is ours: the regent who holds the house, legitimacy and political capital,
// the Capanna, decrees, the motions before the chamber, the guards on the people nearest us, and the log of
// every ruling someone will remember. When it is not: who holds it, how far the Archon resents us, how the
// seats would vote for one of ours, and the seats we have promised for their votes.
import { useState } from 'react';
import { useGame, useWorld } from './context';
import { Go, Panel, PersonById } from './links';
import { ArchonHouseLink } from './archon';
import { Term } from './tip';
import {
  CAPANNA_ROLES, DECREE_COST, DECREE_LABEL, GUARD_COST, GUARD_LABEL, chooseRegent, closeToChair, ensureChair, guardCost, isOurChair,
  promiseSeat, protection, regencyFactor, setGuard, type DecreeKind, type GuardLevel,
} from '../sim/chair';
import { appointToCapanna, dismissFromCapanna, issueDecree } from '../sim/arcs_chair';
import { envyAgainst, envyOf, envyWord, topHouse } from '../sim/envy';
import { candidatesScore, exarchonOf, houseName, liveHouses, regardOf } from '../sim/archon';
import { activeWars } from '../sim/war';
import { displayName } from '../sim/names';
import type { World } from '../sim/types';

function usePlay() {
  const game = useGame();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: (w: World) => World) => game.update((w) => { try { setErr(null); return fn(w); } catch (e) { setErr((e as Error).message); return w; } });
  return { run, err };
}

const bar = (v: number, n = 20) => '█'.repeat(Math.round((v / 100) * n)).padEnd(n, '░');

export function ChairPage() {
  const world = useWorld();
  const ours = isOurChair(world);
  const ex = exarchonOf(world);
  return (
    <>
      <div className="page-title">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span className="eyebrow gold">The Exarchon's chair</span>
          <h2>{ours ? 'The chair is ours' : ex ? <>Held by {ex.personId ? <PersonById id={ex.personId} /> : ex.name}, of <ArchonHouseLink id={ex.houseId} /></> : 'The chair stands empty'}</h2>
          <p>{ours ? 'Held for life, and given up only by death. Every ruling makes an enemy, every year wears the chair down, and envy reaches for the Exarchon and everyone near them.' : 'Elected by the Numarade, from among the Great Houses, for life. The chair passes only by death: age, a blade, or a sentence of the Numarade.'}</p>
        </div>
      </div>
      <div className="grid">
        {ours ? <Held /> : <Seeking />}
        <EnvyPanel />
        <GuardsPanel />
      </div>
    </>
  );
}

function EnvyPanel() {
  const world = useWorld();
  const P = world.playerHouseId;
  const e = envyAgainst(world, P);
  const top = topHouse(world);
  const rows = liveHouses(world).filter((h) => h.id !== P).map((h) => ({ id: h.id, e: envyOf(world, h.id, P), r: regardOf(world, h.id, P), tier: h.tier })).sort((a, b) => b.e - a.e).slice(0, 8);
  return (
    <Panel title={<Term k="envy">Envy against us</Term>} aside={envyWord(e)} className="span-6">
      <div className="body" style={{ display: 'grid', gap: 6 }}>
        <span className="mono">{bar(e / 0.6)} {e}</span>
        <span className="muted" style={{ fontSize: 12 }}>{top === P ? 'We stand highest in the Archon, and every house below us knows it.' : <>The house that stands highest is <ArchonHouseLink id={top ?? ''} />.</>}</span>
        <div className="table-wrap"><table className="list">
          <thead><tr><th>House</th><th>Envy</th><th>Regard</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}><td><ArchonHouseLink id={r.id} /> <span className="muted">{r.tier === 'great' ? 'Great' : 'Minor'}</span></td><td className="mono">{r.e} <span className="muted">{envyWord(r.e)}</span></td><td className="mono">{r.r > 0 ? '+' : ''}{Math.round(r.r)}</td></tr>)}</tbody>
        </table></div>
      </div>
    </Panel>
  );
}

function GuardsPanel() {
  const world = useWorld();
  const { run, err } = usePlay();
  const C = ensureChair(world);
  const close = closeToChair(world).slice(0, 16);
  return (
    <Panel title={<Term k="guards">Guards on our people</Term>} aside={`${guardCost(world).toLocaleString('en-US')} othes a Phase`} className="span-12">
      <div className="body" style={{ display: 'grid', gap: 6 }}>
        <span className="muted" style={{ fontSize: 12 }}>The people nearest the house are the ones envy reaches for{isOurChair(world) ? ', and with the chair ours it reaches often' : ''}. A guard and a good Spymaster turn the knife aside; nothing makes anyone safe.</span>
        <div className="table-wrap"><table className="list">
          <thead><tr><th>Who</th><th>Protected</th><th>Guard</th></tr></thead>
          <tbody>{close.map((c) => {
            const lvl = (C.guards[c.id] ?? 0) as GuardLevel;
            return (
              <tr key={c.id}>
                <td><PersonById id={c.id} /> <span className="muted">{c.role}</span></td>
                <td className="mono">{Math.round(protection(world, c.id) * 100)}%</td>
                <td><span className="actions">{([0, 1, 2, 3] as GuardLevel[]).map((l) => <button key={l} type="button" className="pill" aria-pressed={lvl === l} title={`${GUARD_COST[l]} othes a Phase`} onClick={() => run((w) => setGuard(w, c.id, l))}>{GUARD_LABEL[l]}</button>)}</span></td>
              </tr>
            );
          })}</tbody>
        </table></div>
        {err ? <span className="error">{err}</span> : null}
      </div>
    </Panel>
  );
}

function Seeking() {
  const world = useWorld();
  const { run, err } = usePlay();
  const P = world.playerHouseId;
  const C = ensureChair(world);
  const great = world.archon?.houses[P]?.tier === 'great';
  const ruler = world.houses[P]?.rulerId ? world.characters[world.houses[P]!.rulerId!] : undefined;
  const seats = world.archon?.numarade.seats ?? [];
  const cand = ruler ? { houseId: P, name: displayName(ruler.name), personId: ruler.id } : undefined;
  // How each seat would weigh our Highroy against the strongest other Great House's.
  const rival = liveHouses(world).filter((h) => h.tier === 'great' && h.id !== P).sort((a, b) => b.prestige - a.prestige)[0];
  const rows = cand && rival ? seats.filter((s) => s !== P).map((s) => ({ s, d: candidatesScore(world, s, cand) - candidatesScore(world, s, { houseId: rival.id, name: rival.name }) })) : [];
  const forUs = rows.filter((r) => r.d > 0).length + (seats.includes(P) ? 1 : 0);
  return (
    <Panel title="Seeking the chair" className="span-6">
      <div className="body" style={{ display: 'grid', gap: 6 }}>
        {!great ? <span>Only the Great Houses stand for the chair. <Go to={{ kind: 'legacy' }}>The road to greatness ›</Go></span> : (
          <>
            <span>If the chair fell empty today, and our Highroy stood against <ArchonHouseLink id={rival?.id ?? ''} />, <strong>{forUs} of {seats.length}</strong> seats would lean our way. Six carry it.</span>
            <div className="table-wrap"><table className="list">
              <thead><tr><th>Seat</th><th>Leans</th><th>Promised</th></tr></thead>
              <tbody>{rows.sort((a, b) => b.d - a.d).map((r) => (
                <tr key={r.s}>
                  <td><ArchonHouseLink id={r.s} /></td>
                  <td className="mono">{r.d > 25 ? 'ours' : r.d > 0 ? 'ours, barely' : r.d > -25 ? 'theirs, barely' : 'theirs'}</td>
                  <td><button type="button" className="pill" aria-pressed={C.promises.includes(r.s)} onClick={() => run((w) => promiseSeat(w, r.s, !C.promises.includes(r.s)))}>{C.promises.includes(r.s) ? 'Seat promised' : 'Promise a seat'}</button></td>
                </tr>
              ))}</tbody>
            </table></div>
            <span className="muted" style={{ fontSize: 12 }}>A <Term k="capanna">Capanna</Term> seat promised buys a vote; a promise not kept within a year of taking the chair is remembered as broken. Five seats to promise.</span>
          </>
        )}
        {err ? <span className="error">{err}</span> : null}
      </div>
    </Panel>
  );
}

function Held() {
  const world = useWorld();
  const { run, err } = usePlay();
  const P = world.playerHouseId;
  const C = ensureChair(world);
  const H = C.held!;
  const capanna = world.archon?.numarade.capanna ?? [];
  const others = liveHouses(world).filter((h) => h.id !== P);
  const fam = Object.values(world.characters).filter((c) => c.alive && c.houseId === P && c.id !== H.exarchonId && c.tier === 'full' && !c.veiled && (c.role === 'Heir' || c.role === 'Spouse of the Highroy' || !!c.seat || /of the Highroy/.test(c.role)))
    .sort((a, b) => b.stats.leadership + b.stats.stewardship - a.stats.leadership - a.stats.stewardship).slice(0, 6);
  const [pick, setPick] = useState<Record<string, string>>({});
  const motions = (world.archon?.numarade.motions ?? []).filter((m) => m.status === 'open' && m.kind !== 'elect' && m.kind !== 'seats');
  const wars = activeWars(world).filter((x) => x.attacker !== P && x.defender !== P);
  const feuds = world.archon?.feuds ?? [];
  const [a, setA] = useState(''); const [b, setB] = useState('');
  const decree = (k: DecreeKind, x?: string, y?: string) => run((w) => issueDecree(w, k, x, y));
  const disabled = (k: DecreeKind) => H.capital < DECREE_COST[k];
  return (
    <>
      <Panel title="The weight of the chair" className="span-6">
        <div className="body" style={{ display: 'grid', gap: 6 }}>
          <span><PersonById id={H.exarchonId} /> has sat in the chair since {H.since}.</span>
          <span><Term k="legitimacy">Legitimacy</Term> <span className="mono">{bar(C.legitimacy)} {C.legitimacy}</span>{C.legitimacy < 40 ? <span className="error"> the knives are out: plots against the Exarchon, and talk of a sentence in the chamber</span> : null}</span>
          <span><Term k="politicalCapital">Political capital</Term> <span className="mono">{'◆'.repeat(H.capital)}{'◇'.repeat(Math.max(0, 8 - H.capital))} {H.capital}</span></span>
          <span><Term k="regent">Regent</Term>: {H.regentId ? <PersonById id={H.regentId} /> : <span className="error">none: the house runs itself, badly</span>} <span className="muted">· the council at {Math.round(regencyFactor(world, P) * 100)}%</span></span>
          <span className="actions">{fam.filter((c) => c.id !== H.regentId).map((c) => <button key={c.id} type="button" className="btn small" onClick={() => run((w) => chooseRegent(w, c.id))}>Name {c.name.given} regent</button>)}</span>
        </div>
      </Panel>
      <Panel title={<Term k="capanna">The Capanna</Term>} className="span-6">
        <div className="body" style={{ display: 'grid', gap: 6 }}>
          {CAPANNA_ROLES.map((role) => {
            const s = capanna.find((x) => x.role === role);
            return (
              <div key={role} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <strong style={{ minWidth: 150 }}>{role}</strong>
                {s ? <span>{s.personId ? <PersonById id={s.personId} /> : s.name}, of <ArchonHouseLink id={s.houseId} /></span> : <span className="muted">empty</span>}
                <select value={pick[role] ?? ''} onChange={(e) => setPick({ ...pick, [role]: e.target.value })}>
                  <option value="">a house…</option>
                  {others.map((h) => <option key={h.id} value={h.id}>{h.name}{C.promises.includes(h.id) ? ' (promised)' : ''}</option>)}
                </select>
                <button type="button" className="btn small" disabled={!pick[role]} onClick={() => run((w) => appointToCapanna(w, role, pick[role]!))}>Appoint</button>
                {s ? <button type="button" className="btn small" onClick={() => run((w) => dismissFromCapanna(w, role))}>Dismiss</button> : null}
              </div>
            );
          })}
          {C.promises.length ? <span className="muted" style={{ fontSize: 12 }}>Promised, and not yet given: {C.promises.map((h) => houseName(world, h)).join(', ')}.</span> : null}
        </div>
      </Panel>
      <Panel title="Decrees" className="span-6">
        <div className="body" style={{ display: 'grid', gap: 8 }}>
          {wars.map((x) => <span key={x.id} className="actions"><button type="button" className="btn small" disabled={disabled('peace')} onClick={() => decree('peace', x.id)}>{DECREE_LABEL.peace}: {x.name}</button><span className="muted">{DECREE_COST.peace} capital</span></span>)}
          {feuds.map((f) => <span key={`${f.a}${f.b}`} className="actions"><button type="button" className="btn small" disabled={disabled('pardon')} onClick={() => decree('pardon', f.a, f.b)}>{DECREE_LABEL.pardon}: {houseName(world, f.a)} and {houseName(world, f.b)}</button><span className="muted">{DECREE_COST.pardon} capital</span></span>)}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={a} onChange={(e) => setA(e.target.value)}><option value="">a house…</option>{others.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select>
            <button type="button" className="btn small" disabled={!a || disabled('summon')} onClick={() => decree('summon', a)}>{DECREE_LABEL.summon}</button>
            <span className="muted">to</span>
            <select value={b} onChange={(e) => setB(e.target.value)}><option value="">a house…</option>{others.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select>
            <button type="button" className="btn small" disabled={!a || !b || a === b || disabled('quota')} onClick={() => decree('quota', a, b)}>Move quota from the first to the second</button>
          </div>
          <span className="actions"><button type="button" className="btn small" disabled={disabled('levy')} onClick={() => decree('levy')}>{DECREE_LABEL.levy}</button><span className="muted">{DECREE_COST.levy} capital; every Great House resents it</span></span>
          {err ? <span className="error">{err}</span> : null}
        </div>
      </Panel>
      <Panel title="Before the chamber" className="span-6">
        <div className="body" style={{ display: 'grid', gap: 6 }}>
          {motions.length ? motions.map((m) => (
            <span key={m.id} className="actions">
              <span>{m.title} <span className="muted">tabled by {houseName(world, m.by)}</span></span>
              <button type="button" className="btn small" disabled={disabled('strike')} onClick={() => decree('strike', m.id)}>Strike it</button>
            </span>
          )) : <span className="muted">Nothing open before the Numarade.</span>}
          <span className="muted" style={{ fontSize: 12 }}>The Exarchon sets the agenda. Striking a motion costs capital, and legitimacy; striking a motion to condemn the Exarchon costs a great deal of both.</span>
        </div>
      </Panel>
      <Panel title="The chair's rulings" className="span-12">
        <div className="body" style={{ display: 'grid', gap: 2, maxHeight: 260, overflow: 'auto' }}>
          {H.log.length ? H.log.map((l, i) => <span key={i}><span className="mono muted">{l.year}</span> {l.text}</span>) : <span className="muted">Nothing yet.</span>}
        </div>
      </Panel>
    </>
  );
}
