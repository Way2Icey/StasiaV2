// A corsair company in its own window: who they are, the people in it we know of, and every dealing
// we have had with them. Everything we can do about them is here too.
import { useEffect, useState } from 'react';
import { useGame, useWorld } from './context';
import { HouseLink, PersonLink } from './links';
import { bar } from './hall';
import { BOUNTY_COST, cannotDeal, dealsOf, endDeal, laneName, LANE_BY_ID, makeDeal, MARQUE_COST, PASSAGE, relWord, TEMPER_NOTE, type DealKind } from '../sim/lanes';
import { alive, cannotHunt, HUNT_COST, huntersFree, huntMember, isHostile, ROLE_LABEL, setHostile } from '../sim/companies';
import { formatDate } from '../sim/time';
import type { World } from '../sim/types';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
type Tab = 'overview' | 'members' | 'history';

export function CompanyWindow({ id, onClose }: { id: string; onClose: () => void }) {
  const world = useWorld();
  const game = useGame();
  const [tab, setTab] = useState<Tab>('overview');
  const [err, setErr] = useState<string | null>(null);
  const P = world.playerHouseId;
  const f = world.lanes?.factions[id];
  const [target, setTarget] = useState(Object.keys(world.houses).find((h) => h !== P) ?? '');
  const hunters = huntersFree(world);
  const [leader, setLeader] = useState(hunters[0] ?? '');
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  if (!f) return null;
  const run = (fn: (w: World) => World) => game.update((w) => { try { setErr(null); return fn(w); } catch (e) { setErr((e as Error).message); return w; } });
  const r = f.rel[P] ?? 0;
  const hostile = isHostile(world, f);
  const ours = dealsOf(world).filter((d) => d.faction === f.id);
  const btn = (kind: DealKind, label: string, tgt?: string) => {
    const why = hostile && kind !== 'bounty' ? 'Not while we are at war with them.' : cannotDeal(world, f.id, kind, tgt);
    return <button type="button" className={`btn small${kind === 'passage' ? ' primary' : ''}`} disabled={!!why} title={why ?? ''} onClick={() => run((w) => makeDeal(w, f.id, kind, tgt))}>{label}</button>;
  };
  const known = f.members.filter((m) => m.known);
  const unknown = alive(f).filter((m) => !m.known);
  const hunting = world.lanes.hunts.filter((h) => h.faction === f.id);
  return (
    <div className="command-veil" onMouseDown={onClose}>
      <div className="command company" role="dialog" aria-label={f.name} onMouseDown={(e) => e.stopPropagation()}>
        <header className="company-head">
          <strong>{cap(f.name)}</strong>
          <span className="mono">{bar(f.strength / 100)} {Math.round(f.strength)}</span>
          <button type="button" className="btn small" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="subtabs" style={{ padding: '0 10px', margin: 0 }}>
          {(['overview', 'members', 'history'] as Tab[]).map((t) => (
            <button key={t} type="button" className="subtab" aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>{t === 'overview' ? 'Overview' : t === 'members' ? `Known people (${known.length})` : `History (${f.log.length})`}</button>
          ))}
        </div>
        <div className="company-body">
          {err ? <p className="body error">{err}</p> : null}
          {tab === 'overview' ? (
            <>
              <p className="body" style={{ margin: 0 }}>{TEMPER_NOTE[f.temper]}</p>
              <div className="row"><span style={{ flex: 1 }}>Toward us</span><strong>{relWord(r)} ({Math.round(r)}){hostile ? ' · AT WAR WITH US' : ''}</strong></div>
              <div className="row"><span style={{ flex: 1 }}>Haunts</span><span className="muted" style={{ textAlign: 'right' }}>{f.haunts.map((x) => laneName(world, LANE_BY_ID[x]!)).join(', ')}</span></div>
              <div className="row"><span style={{ flex: 1 }}>Taken, all told</span><span className="mono">{fmt(f.hauls)} othes</span></div>
              <div className="row"><span style={{ flex: 1 }}>People</span><span className="muted">{alive(f).length} that we know of, {known.filter((m) => !m.fate).length} by name</span></div>
              {ours.map((d) => (
                <div key={d.id} className="row">
                  <span style={{ flex: 1 }}>{d.kind === 'passage' ? `We pay for safe passage: ${fmt(PASSAGE(f))} an Orbit.` : d.kind === 'bounty' ? `Our bounty stands: ${fmt(BOUNTY_COST)} an Orbit.` : <>They hold our letters against <HouseLink id={d.target!} />.</>}</span>
                  {d.kind !== 'marque' ? <button type="button" className="btn small" onClick={() => run((w) => endDeal(w, d.id))}>End it</button> : null}
                </div>
              ))}
              <div className="eyebrow" style={{ marginTop: 8 }}>What we can do</div>
              <div className="actions">
                {btn('passage', `Pay them to leave our ships alone · ${fmt(PASSAGE(f))}/Orbit`)}
                {btn('bounty', `Bounty · ${fmt(BOUNTY_COST)}/Orbit`)}
                <button type="button" className={`btn small${hostile ? ' primary' : ''}`} onClick={() => run((w) => setHostile(w, f.id, !hostile))} title="Our escorts and patrols fight them on sight and our docks refuse their goods. They hunt us harder.">{hostile ? 'Stand down' : 'Declare them enemies'}</button>
              </div>
              <div className="actions">
                <select className="text" value={target} onChange={(e) => setTarget(e.target.value)} style={{ width: 'auto' }}>
                  {Object.keys(world.houses).filter((h) => h !== P).map((h) => <option key={h} value={h}>{world.houses[h]!.name}</option>)}
                </select>
                {btn('marque', `Letters of marque against them · ${fmt(MARQUE_COST)}`, target)}
              </div>
              <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Passage keeps them off our convoys. Declaring them enemies sets our escorts and patrols on them and shuts our docks to their goods; they hunt us harder for it. To go after their people, see Known people.</p>
            </>
          ) : null}
          {tab === 'members' ? (
            <>
              {known.length === 0 ? <p className="body muted" style={{ margin: 0 }}>We know nobody in the company by name yet.</p> : null}
              {known.map((m) => {
                const h = hunting.find((x) => x.memberId === m.id);
                const why = cannotHunt(world, f.id, m.id, leader);
                return (
                  <div key={m.id} className="stack" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                    <div className="row" style={{ border: 0 }}>
                      <strong style={{ flex: 1 }}>{m.name}</strong>
                      <span className="muted">{ROLE_LABEL[m.role]}{m.ship ? ` · the ${m.ship}` : ''}</span>
                    </div>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {m.fate ? `${m.fate === 'dead' ? 'Dead' : 'In our cells'}${m.fateBy && world.characters[m.fateBy] ? `, by ${world.characters[m.fateBy]!.name.given}` : ''}. ` : ''}
                      {m.takes ? `${m.takes} run${m.takes === 1 ? '' : 's'} taken that we know of. ` : ''}{m.skill >= 16 ? 'Very dangerous.' : m.skill >= 12 ? 'Dangerous.' : 'Beatable.'} {m.notes.join(' ')}
                    </span>
                    {!m.fate && m.role !== 'fixer' ? (h
                      ? <span style={{ fontSize: 12 }}>{world.characters[h.leaderId] ? <PersonLink c={world.characters[h.leaderId]!} /> : 'Our people'} {world.characters[h.leaderId] ? 'is' : 'are'} hunting them, due back {formatDate(h.resolves)}.</span>
                      : <div className="actions">
                        <select className="text" value={leader} onChange={(e) => setLeader(e.target.value)} style={{ width: 'auto' }}>
                          {hunters.length === 0 ? <option value="">No knight free</option> : null}
                          {hunters.map((cid) => <option key={cid} value={cid}>{world.characters[cid]!.name.given} {world.characters[cid]!.name.family ?? ''}</option>)}
                        </select>
                        <button type="button" className="btn small primary" disabled={!!why} title={why ?? `Two Phases; ${HUNT_COST} othes. The next two free fighters go with them.`} onClick={() => run((w) => huntMember(w, f.id, m.id, leader, huntersFree(w).filter((x) => x !== leader).slice(0, 2)))}>Send them to hunt · {HUNT_COST}</button>
                      </div>) : null}
                  </div>
                );
              })}
              {unknown.length ? <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>{unknown.length} more we know only as {unknown.some((m) => m.role === 'chief') ? 'their chief, ' : ''}captains and hands without names. Names come out in raids, from ransomed crews, and from a company that likes us.</p> : null}
            </>
          ) : null}
          {tab === 'history' ? (
            <>
              {f.log.length === 0 ? <p className="body muted" style={{ margin: 0 }}>Nothing between us yet.</p> : null}
              {f.log.map((l, i) => (
                <div key={i} className="row">
                  <span className="muted mono" style={{ minWidth: 150, fontSize: 12 }}>{formatDate(l.date)}</span>
                  <span style={{ flex: 1 }} className={l.ours ? '' : 'muted'}>{l.text}</span>
                </div>
              ))}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
