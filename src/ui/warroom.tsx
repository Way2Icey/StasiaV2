// The War Room: one war, its theatre, our groups and theirs as far as we can see them, and every order.
// Three ways to look at the same thing: the Plan Board (depth from our worlds to theirs, the void above the
// ground, FM's tactics screen), the Map (the theatre as places and lanes), and the Order of Battle (every
// group in one table, every order one dropdown away). The inspector, the plan and the reports sit beside
// whichever is open.
import { PhasePage, type Edition } from './phase';
import { useMemo, useState } from 'react';
import { useGame, useNav, useWorld } from './context';
import { Panel } from './links';
import { bar } from './hall';
import { houseName } from '../sim/archon';
import { absoluteCycle } from '../sim/time';
import { HULL_TYPES } from '../sim/register';
import {
  cannotOrder, cannotProbe, commanderOfGroup, legFuel, dangerFor, doctrineOf, freeOf, mergeGroups, orderGroup, picture, probe, PROBE_COST, raiseGroup,
  routeFor, setAgainst, setDoctrines, setGroupKnight, setInstruction, splitGroup, staffRead, standDown,
  type Report, type TheatreState, type WGroup, type WNode, type WSide,
} from '../sim/warroom';
import {
  DOCTRINES, DUTY_LABEL, KNIGHTS_LABEL, LEASH_LABEL, LEASH_NOTE, LINE_LABEL, MAX_DOCTRINES, OPP_LABEL, OPP_NOTE, QUARTER_LABEL, QUARTER_NOTE,
  ROLE_DEF, rolesFor, SLIDER_NOTE, SLIDER_WORDS, SUPPLY_LABEL,
  type DoctrineId, type Duty, type Instructions, type KnightsAt, type Leash, type LineAt, type Opp, type Quarter, type Role, type SupplyAt,
} from '../data/doctrine';
import { GOAL_LABEL, type War } from '../sim/war';
import { econ, phaseLedger } from '../sim/economy';
import { RESOURCE_LABEL, type Resource } from '../data/economy';
import { netWithQuota, runway } from './stores';
import type { World } from '../sim/types';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const COLS = ['Our worlds', 'Our approaches', 'The border', 'Their approaches', 'Their worlds'];
type View = 'phase' | 'board' | 'map' | 'table';
type Sel = { kind: 'group'; id: string } | { kind: 'node'; id: string } | null;

function usePlay() {
  const game = useGame();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: (w: World) => World) => game.update((w) => { try { setErr(null); return fn(w); } catch (e) { setErr((e as Error).message); return w; } });
  return { run, err };
}

const colOf = (n: WNode, side: WSide) => (side === 'attackers' ? n.depth : 4 - n.depth);
const strength = (g: WGroup) => (g.domain === 'ground' ? `${fmt(g.n)}` : `${g.n} ship${g.n === 1 ? '' : 's'}`);
const KIND_GLYPH: Record<WNode['kind'], string> = { ground: '■', orbit: '○', station: '◆', approach: '·', lane: '═' };

/** What we know of an enemy group, in words. */
function seenText(t: TheatreState, side: WSide, g: WGroup): string {
  const s = t.sight[side][g.id];
  if (!s) return 'never seen';
  const n = g.domain === 'ground' ? s.n : s.n;
  const unit = g.domain === 'ground' ? '' : ' ships';
  if (s.level === 0) return `last seen ~${fmt(n)}${unit}`;
  if (s.level === 1) return `rumour: ${fmt(n * 0.6)}–${fmt(n * 1.4)}${unit}`;
  if (s.level === 2) return `~${fmt(n)}${unit}`;
  return `${fmt(n)}${unit}`;
}

// ---------------------------------------------------------------- the page

export function WarRoomPage({ id, view: v }: { id: string; view?: View }) {
  const world = useWorld();
  const nav = useNav();
  const { run, err } = usePlay();
  const war = world.war?.wars.find((x) => x.id === id);
  const [sel, setSel] = useState<Sel>(null);
  const view: View = v ?? 'phase';
  const [edition, setEditionS] = useState<Edition>(() => { try { const e = localStorage.getItem('stasia.phase.edition'); return e === 'timeline' || e === 'map' || e === 'council' ? e : 'timeline'; } catch { return 'timeline'; } });
  const setEdition = (e: Edition) => { setEditionS(e); try { localStorage.setItem('stasia.phase.edition', e); } catch { /* none */ } };
  if (!war) return <p className="muted">No such war.</p>;
  const pic = picture(world, war);
  if (!pic) return <p className="muted">We are not in this war.</p>;
  const { t, side } = pic;
  const P = world.playerHouseId;
  const foe = side === 'attackers' ? war.defender : war.attacker;
  const score = side === 'defenders' ? -war.score : war.score;
  const unseen = Object.values(t.groups).filter((g) => g.side !== side && (t.sight[side][g.id]?.level ?? 0) === 0).length;
  const setView = (x: View) => nav.to({ kind: 'warroom', id, view: x });
  return (
    <div className="wr">
      <div className="wr-top">
        <div className="wr-title">
          <span className="eyebrow">The War Room · {war.rung === 'war' ? 'open war' : 'border clashes'} · for {GOAL_LABEL[war.goal].toLowerCase()}</span>
          <h2>{cap(war.name)}</h2>
          <span className="muted">House {houseName(world, P)}{side === 'attackers' ? ' against ' : ' defending against '}House {houseName(world, foe)}</span>
        </div>
        <div className="wr-chips">
          <span className="chip"><span className="k">war</span> <WarTug v={score} /></span>
          <span className="chip"><span className="k">weariness</span> us {Math.round(war.exhaustion[P] ?? 0)} · them {Math.round(war.exhaustion[foe] ?? 0)}</span>
          <span className="chip"><span className="k">dead</span> ours {fmt(war.losses[P] ?? 0)} · theirs {fmt(war.losses[foe] ?? 0)}</span>
          <span className="chip"><span className="k">fog</span> {unseen ? `${unseen} of theirs unseen` : 'all seen'}</span>
        </div>
        <div className="wr-views" role="tablist" aria-label="View">
          {(['phase', 'board', 'map', 'table'] as View[]).map((x) => <button key={x} type="button" role="tab" aria-selected={view === x} className={`wr-view${view === x ? ' on' : ''}`} onClick={() => setView(x)}>{x === 'phase' ? 'The Phase' : x === 'board' ? 'Plan board' : x === 'map' ? 'Map' : 'Order of battle'}</button>)}
        </div>
      </div>
      {err ? <p className="error">{err}</p> : null}
      {view === 'phase' ? <PhasePage war={war} edition={edition} setEdition={setEdition} /> : (<>
      <div className="wr-main">
        <div className="wr-centre">
          {view === 'board' ? <Board war={war} t={t} side={side} sel={sel} setSel={setSel} /> : view === 'map' ? <TheatreMap war={war} t={t} side={side} sel={sel} setSel={setSel} run={run} /> : <OrderOfBattle war={war} t={t} side={side} sel={sel} setSel={setSel} run={run} />}
          <Ahead war={war} t={t} side={side} setSel={setSel} />
        </div>
        <div className="wr-side">
          <Inspector war={war} t={t} side={side} sel={sel} setSel={setSel} run={run} />
          <WarCosts />
          <Staff war={war} t={t} side={side} setSel={setSel} />
          <PlanPanel war={war} t={t} run={run} />
        </div>
      </div>
      <div className="wr-bottom">
        <Reports t={t} side={side} />
        <Feed t={t} side={side} />
      </div>
      </>)}
    </div>
  );
}

function WarTug({ v }: { v: number }) {
  const n = 16, mid = n / 2, at = Math.round(mid + (v / 100) * mid);
  return <span className="mono" title={`${Math.round(v)}`}>{Array.from({ length: n }, (_, i) => (i === mid ? '│' : i >= Math.min(mid, at) && i < Math.max(mid, at) ? (v >= 0 ? '▶' : '◀') : '·')).join('')} <span className={v >= 0 ? 'up' : 'down'}>{v > 0 ? '+' : ''}{Math.round(v)}</span></span>;
}

// ---------------------------------------------------------------- a group as a card

function GroupCard({ g, t, side, sel, onPick, compact }: { g: WGroup; t: TheatreState; side: WSide; sel: Sel; onPick: () => void; compact?: boolean }) {
  const world = useWorld();
  const mine = g.side === side;
  const ours = g.house === world.playerHouseId;
  const s = t.sight[side][g.id];
  const known = mine || (s?.level ?? 0) >= 3;
  const role = known ? ROLE_DEF[g.role].label : s?.role ? ROLE_DEF[s.role].label : '?';
  const cmd = commanderOfGroup(world, g);
  const transit = g.domain === 'ground' && t.nodes[g.at]!.kind !== 'ground' && t.nodes[g.at]!.kind !== 'station';
  const danger = mine && transit && dangerFor(t, side).has(g.at);
  const on = sel?.kind === 'group' && sel.id === g.id;
  return (
    <button type="button" className={`wr-card ${g.domain} ${mine ? (ours ? 'ours' : 'ally') : 'foe'}${on ? ' on' : ''}${s && s.level === 0 && !mine ? ' stale' : ''}`} onClick={onPick} aria-pressed={on}>
      <span className="wr-card-t"><b>{mine ? g.name : (s?.level ?? 0) >= 2 ? g.name : `${houseName(world, g.house)} ${g.domain === 'void' ? 'ships' : 'troops'}`}</b><span className="wr-role">{role}</span></span>
      <span className="wr-card-n">
        {mine ? strength(g) : seenText(t, side, g)}
        {!ours && mine ? <span className="muted"> · {houseName(world, g.house)}</span> : null}
        {mine && !compact ? <span className="muted"> · {DUTY_LABEL[g.duty].toLowerCase()}{cmd.name === 'no one' ? '' : ` · ${cmd.name}`}</span> : null}
      </span>
      {mine && !compact ? (
        <span className="wr-card-b mono">
          <span title="morale">M{bar(g.morale / 100, 5)}</span> <span title="supply">S{bar(g.supply, 5)}</span> {g.fatigue > 0.25 ? <span title="tiredness" className="down">T{bar(g.fatigue, 5)}</span> : null}
          {g.engaged ? <span className="down"> ⚔ engaged</span> : g.to ? <span> → {t.nodes[g.to]?.name}</span> : null}
          {g.knights.length ? <span> ✦{g.knights.length}</span> : null}
          {g.great.length ? <span> ⬢{g.great.length}</span> : null}
          {transit ? <span className={danger ? 'down' : 'muted'}> {danger ? '⚠ in transports, unescorted' : '⇡ in transports'}</span> : null}
          {cmd.name === 'no one' ? <span className="down"> ⚠ no commander</span> : null}
        </span>
      ) : null}
    </button>
  );
}

// ---------------------------------------------------------------- the plan board

function Board({ war, t, side, sel, setSel }: { war: War; t: TheatreState; side: WSide; sel: Sel; setSel: (s: Sel) => void }) {
  const world = useWorld();
  const visible = (g: WGroup) => g.side === side || !!t.sight[side][g.id];
  const nodesIn = (col: number) => Object.values(t.nodes).filter((n) => colOf(n, side) === col).sort((a, b) => a.row - b.row);
  const band = (domain: 'void' | 'ground') => (
    <>
      <div className={`wr-band ${domain}`}><span>{domain === 'void' ? 'VOID' : 'GROUND'}</span></div>
      {COLS.map((_, c) => {
        const places = nodesIn(c).filter((n) => (domain === 'void' ? n.kind !== 'ground' : n.kind === 'ground' || n.kind === 'station' || Object.values(t.groups).some((g) => g.at === n.id && g.domain === 'ground' && visible(g))));
        return (
          <div key={c} className={`wr-cell ${domain}`}>
            {places.map((n) => {
              const gs = Object.values(t.groups).filter((g) => g.at === n.id && g.domain === domain && visible(g)).sort((a, b) => (a.side === side ? -1 : 1) - (b.side === side ? -1 : 1));
              const on = sel?.kind === 'node' && sel.id === n.id;
              return (
                <div key={n.id} className="wr-place">
                  <button type="button" className={`wr-place-h${on ? ' on' : ''}`} onClick={() => setSel({ kind: 'node', id: n.id })}>
                    <span className={`wr-glyph ${n.holder === side ? 'ours' : n.holder ? 'foe' : ''}`}>{KIND_GLYPH[n.kind]}</span> {cap(n.name.replace(/^the /, ''))}
                    {n.kind === 'ground' || n.kind === 'station' ? <span className="muted"> {n.fort ? `▮`.repeat(Math.round(n.fort)) : ''}{n.garrison ? ` ${fmt(n.garrison)}` : ''}</span> : null}
                    {n.target ? <span className="wr-tag">target</span> : null}
                  </button>
                  {gs.map((g) => <GroupCard key={g.id} g={g} t={t} side={side} sel={sel} onPick={() => setSel({ kind: 'group', id: g.id })} />)}
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
  void world; void war;
  return (
    <Panel title="The plan board" aside="us ◂ ▸ them">
      <div className="wr-board">
        <div />
        {COLS.map((c, i) => <div key={c} className={`wr-colh${i === 4 ? ' foe' : i === 0 ? ' ours' : ''}`}>{c}</div>)}
        {band('void')}
        {band('ground')}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------- the map

function TheatreMap({ war, t, side, sel, setSel, run }: { war: War; t: TheatreState; side: WSide; sel: Sel; setSel: (s: Sel) => void; run: (fn: (w: World) => World) => void }) {
  const world = useWorld();
  const W = 760, H = 380;
  const pos = useMemo(() => {
    const out: Record<string, { x: number; y: number }> = {};
    for (let c = 0; c < 5; c++) {
      const ns = Object.values(t.nodes).filter((n) => colOf(n, side) === c).sort((a, b) => a.row - b.row);
      ns.forEach((n, i) => { out[n.id] = { x: 70 + c * ((W - 140) / 4), y: 50 + (i + 0.5) * ((H - 80) / Math.max(1, ns.length)) }; });
    }
    return out;
  }, [t, side]);
  const selected = sel?.kind === 'group' ? t.groups[sel.id] : undefined;
  const canSend = selected && selected.house === world.playerHouseId;
  const route = canSend && sel?.kind === 'group' ? selected.path : [];
  const visible = (g: WGroup) => g.side === side || (t.sight[side][g.id]?.level ?? 0) > 0;
  const where = (g: WGroup) => (g.side === side ? g.at : t.sight[side][g.id]?.at ?? g.at);
  return (
    <Panel title="The theatre" aside={canSend ? `click a place to send ${selected!.name}` : 'click a group, then a place'}>
      <svg className="wr-map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Map of ${war.name}`}>
        {t.edges.map((e, i) => {
          const a = pos[e.a]!, b = pos[e.b]!;
          const dark = t.nodes[e.a]!.dark || t.nodes[e.b]!.dark;
          return <g key={i}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`wr-edge${dark ? ' dark' : ''}`} /><text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 3} className="wr-edge-t">{e.cycles}</text></g>;
        })}
        {route.length && selected ? [selected.at, ...route].slice(0, -1).map((id, i) => { const a = pos[id]!, b = pos[route[i]!]!; return <line key={`r${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="wr-route" />; }) : null}
        {Object.values(t.nodes).map((n) => {
          const p = pos[n.id]!;
          const on = sel?.kind === 'node' && sel.id === n.id;
          const cls = `wr-node ${n.holder === side ? 'ours' : n.holder ? 'foe' : ''}${on ? ' on' : ''}`;
          const click = () => { if (canSend && !cannotOrder(world, war.id, selected!.id, { to: n.id })) run((w) => orderGroup(w, war.id, selected!.id, { to: n.id })); else setSel({ kind: 'node', id: n.id }); };
          return (
            <g key={n.id} className="wr-node-g" onClick={click} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') click(); }}>
              {n.kind === 'ground' ? <rect x={p.x - 10} y={p.y - 10} width={20} height={20} className={cls} />
                : n.kind === 'station' ? <polygon points={`${p.x},${p.y - 12} ${p.x + 12},${p.y} ${p.x},${p.y + 12} ${p.x - 12},${p.y}`} className={cls} />
                : <circle cx={p.x} cy={p.y} r={n.kind === 'orbit' ? 11 : 8} className={cls + (n.dark ? ' dark' : '')} />}
              <text x={p.x} y={p.y - 16} className={`wr-node-t${n.target ? ' target' : ''}`}>{cap(n.name.replace(/^the space over /, '◌ ').replace(/^the /, ''))}</text>
              {n.garrison ? <text x={p.x} y={p.y + 24} className="wr-node-s">{'▮'.repeat(Math.round(n.fort))} {fmt(n.garrison)}</text> : null}
            </g>
          );
        })}
        {Object.values(t.nodes).map((n) => {
          const gs = Object.values(t.groups).filter((g) => visible(g) && where(g) === n.id);
          const p = pos[n.id]!;
          return gs.slice(0, 5).map((g, i) => {
            const mine = g.side === side;
            const on = sel?.kind === 'group' && sel.id === g.id;
            const abbr = g.name.split(' ').map((x) => (/^[IVX]+$/.test(x) ? ` ${x}` : x[0]!.toUpperCase())).join('');
            const label = mine ? `${abbr} ${g.domain === 'ground' ? `${Math.max(1, Math.round(g.n / 1000))}k` : g.n}` : `${houseName(world, g.house).slice(0, 3)} ${g.domain === 'ground' ? `~${Math.round((t.sight[side][g.id]?.n ?? 0) / 1000)}k` : `~${t.sight[side][g.id]?.n ?? '?'}`}`;
            const x = p.x + 16, y = p.y - 8 + i * 15;
            return (
              <g key={g.id} className="wr-tok-g" onClick={(e) => { e.stopPropagation(); setSel({ kind: 'group', id: g.id }); }} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setSel({ kind: 'group', id: g.id }); }}>
                <rect x={x} y={y} width={70} height={13} className={`wr-tok ${mine ? (g.house === world.playerHouseId ? 'ours' : 'ally') : 'foe'} ${g.domain}${on ? ' on' : ''}${!mine && (t.sight[side][g.id]?.level ?? 0) === 0 ? ' stale' : ''}`} />
                <text x={x + 3} y={y + 10} className="wr-tok-t">{g.domain === 'void' ? '◇' : '▪'} {label}</text>
              </g>
            );
          });
        })}
      </svg>
      <div className="wr-legend muted">■ world · ○ orbit · ◆ station · ═ lane, dashed: the dark lane · numbers on lanes are cycles · ◇ ships ▪ troops · faded: last seen</div>
    </Panel>
  );
}

// ---------------------------------------------------------------- the order of battle

function OrderOfBattle({ war, t, side, sel, setSel, run }: { war: War; t: TheatreState; side: WSide; sel: Sel; setSel: (s: Sel) => void; run: (fn: (w: World) => World) => void }) {
  const world = useWorld();
  const P = world.playerHouseId;
  const ours = Object.values(t.groups).filter((g) => g.house === P).sort((a, b) => (a.domain === b.domain ? b.n - a.n : a.domain === 'ground' ? -1 : 1));
  const theirs = Object.values(t.groups).filter((g) => g.side !== side && t.sight[side][g.id]);
  const plan = t.plans[P];
  const people = Object.values(world.characters).filter((c) => c.alive && c.houseId === P && c.tier === 'full' && c.seat !== 'highroy');
  const places = Object.values(t.nodes).sort((a, b) => colOf(a, side) - colOf(b, side) || a.row - b.row);
  return (
    <Panel title="Order of battle" aside={`${ours.length} groups of ours · ${theirs.length} of theirs known`}>
      <div className="table-wrap"><table className="list wr-oob">
        <thead><tr><th>Group</th><th>Strength</th><th>Where · going</th><th>Role</th><th>Duty</th><th>Commander</th><th>Leash</th><th>Back at</th><th>M · S · T</th></tr></thead>
        <tbody>
          {ours.map((g) => {
            const on = sel?.kind === 'group' && sel.id === g.id;
            return (
              <tr key={g.id} className={on ? 'lead' : undefined} onClick={() => setSel({ kind: 'group', id: g.id })}>
                <td><b>{g.domain === 'void' ? '◇' : '▪'} {g.name}</b></td>
                <td className="mono">{strength(g)}</td>
                <td>
                  <select className="select tiny" aria-label={`Where ${g.name} goes`} value={g.to ?? g.at} disabled={!!g.engaged} onChange={(e) => run((w) => orderGroup(w, war.id, g.id, { to: e.target.value === g.at ? null : e.target.value }))}>
                    {places.filter((n) => n.id === g.at || n.id === g.to || !cannotOrder(world, war.id, g.id, { to: n.id })).map((n) => <option key={n.id} value={n.id}>{n.id === g.at ? '● ' : ''}{cap(n.name)}</option>)}
                  </select>
                </td>
                <td><select className="select tiny" aria-label={`${g.name}'s role`} value={g.role} onChange={(e) => run((w) => orderGroup(w, war.id, g.id, { role: e.target.value as Role }))}>{rolesFor(g.domain).map((r) => <option key={r} value={r}>{ROLE_DEF[r].label}</option>)}</select></td>
                <td><select className="select tiny" aria-label={`${g.name}'s duty`} value={g.duty} onChange={(e) => run((w) => orderGroup(w, war.id, g.id, { duty: e.target.value as Duty }))}>{(Object.keys(DUTY_LABEL) as Duty[]).map((d) => <option key={d} value={d}>{DUTY_LABEL[d]}</option>)}</select></td>
                <td><select className="select tiny" aria-label={`Who leads ${g.name}`} value={g.commanderId ?? ''} onChange={(e) => run((w) => orderGroup(w, war.id, g.id, { commanderId: e.target.value || null }))}>
                  <option value="">{g.commanderName ?? '— no one'}</option>
                  {people.map((c) => <option key={c.id} value={c.id}>{c.name.given} {c.name.family ?? ''}</option>)}
                </select></td>
                <td><select className="select tiny" aria-label={`${g.name}'s leash`} value={g.leash} onChange={(e) => run((w) => orderGroup(w, war.id, g.id, { leash: e.target.value as Leash }))}>{(Object.keys(LEASH_LABEL) as Leash[]).map((l) => <option key={l} value={l}>{LEASH_LABEL[l]}</option>)}</select></td>
                <td><select className="select tiny" aria-label={`${g.name} falls back at`} value={Math.round(g.fallback * 10) / 10} onChange={(e) => run((w) => orderGroup(w, war.id, g.id, { fallback: Number(e.target.value) }))}>{[0, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7].map((x) => <option key={x} value={x}>{x ? `${Math.round(x * 100)}%` : 'never'}</option>)}</select></td>
                <td className="mono">{bar(g.morale / 100, 4)} {bar(g.supply, 4)} {bar(g.fatigue, 4)}</td>
              </tr>
            );
          })}
          {theirs.length ? <tr className="wr-oob-h"><td colSpan={9}><span className="eyebrow">Theirs, as far as we know</span></td></tr> : null}
          {theirs.map((g) => {
            const s = t.sight[side][g.id]!;
            const on = sel?.kind === 'group' && sel.id === g.id;
            return (
              <tr key={g.id} className={`foe${on ? ' lead' : ''}`} onClick={() => setSel({ kind: 'group', id: g.id })}>
                <td><b>{g.domain === 'void' ? '◇' : '▪'} {s.level >= 2 ? g.name : `${houseName(world, g.house)} ${g.domain === 'void' ? 'ships' : 'troops'}`}</b></td>
                <td className="mono">{seenText(t, side, g)}</td>
                <td>{cap(t.nodes[s.at]?.name ?? '?')} {s.level === 0 ? <span className="muted">(stale)</span> : null}</td>
                <td>{s.role ? ROLE_DEF[s.role].label : '?'}</td>
                <td colSpan={4}>
                  <select className="select tiny" aria-label={`Orders against ${g.name}`} value={plan?.against[g.id] ?? 'none'} onClick={(e) => e.stopPropagation()} onChange={(e) => run((w) => setAgainst(w, war.id, g.id, e.target.value as Opp))}>{(Object.keys(OPP_LABEL) as Opp[]).map((o) => <option key={o} value={o}>{OPP_LABEL[o]}</option>)}</select>
                </td>
                <td className="mono muted">{['unseen', 'rumour', 'seen', 'known'][s.level]}</td>
              </tr>
            );
          })}
        </tbody>
      </table></div>
    </Panel>
  );
}

// ---------------------------------------------------------------- the inspector

function Inspector({ war, t, side, sel, setSel, run }: { war: War; t: TheatreState; side: WSide; sel: Sel; setSel: (s: Sel) => void; run: (fn: (w: World) => World) => void }) {
  const world = useWorld();
  const P = world.playerHouseId;
  if (!sel) return <RaisePanel war={war} t={t} run={run} />;
  if (sel.kind === 'node') return <NodeInspector war={war} t={t} side={side} id={sel.id} setSel={setSel} run={run} />;
  const g = t.groups[sel.id];
  if (!g) return <RaisePanel war={war} t={t} run={run} />;
  if (g.house !== P) return <EnemyInspector war={war} t={t} side={side} g={g} run={run} />;
  return <OurInspector key={g.id} war={war} t={t} side={side} g={g} setSel={setSel} run={run} />;
}

function OurInspector({ war, t, side, g, setSel, run }: { war: War; t: TheatreState; side: WSide; g: WGroup; setSel: (s: Sel) => void; run: (fn: (w: World) => World) => void }) {
  const world = useWorld();
  const P = world.playerHouseId;
  const [go, setGo] = useState('');
  const cmd = commanderOfGroup(world, g);
  const people = Object.values(world.characters).filter((c) => c.alive && c.houseId === P && c.tier === 'full' && c.seat !== 'highroy');
  const knights = people.filter((c) => c.flags.some((f) => f.id === 'knighted'));
  const here = Object.values(t.groups).filter((x) => x.house === P && x.id !== g.id && x.at === g.at && x.domain === g.domain);
  const danger = dangerFor(t, side);
  const places = Object.values(t.nodes).sort((a, b) => colOf(a, side) - colOf(b, side) || a.row - b.row);
  const read = staffRead(world, war, g.at);
  const path = go ? routeFor(world, war, t, g, go) : null;
  const risky = path && g.domain === 'ground' ? path.filter((x) => danger.has(x)) : [];
  return (
    <Panel title={g.name} aside={strength(g)}>
      <div className="body wr-insp">
        <div className="muted" style={{ fontSize: 12 }}>
          At {t.nodes[g.at]?.name}{g.to ? <>, going to {t.nodes[g.to]?.name}{g.arrive ? ` (next stop in ${Math.max(0, g.arrive - absoluteCycle(world.date))} cycles)` : ''}</> : ''}.
          {' '}Quality {g.quality.toFixed(2)} · started {g.domain === 'ground' ? fmt(g.start) : g.start} · fought {g.fought}, won {g.won}.
          {g.domain === 'void' ? <> {HULL_TYPES.filter((k) => g.hulls[k]).map((k) => `${g.hulls[k]} ${k}${g.hulls[k] === 1 ? '' : 's'}`).join(', ')}{g.great.length ? `; great ships: ${g.great.map((id) => world.fleet?.ships[id]?.name).filter(Boolean).join(', ')}` : ''}.</> : null}
        </div>
        <label className="wr-field"><span>Role</span>
          <select className="select" value={g.role} onChange={(e) => run((w) => orderGroup(w, war.id, g.id, { role: e.target.value as Role }))}>{rolesFor(g.domain).map((r) => <option key={r} value={r}>{ROLE_DEF[r].label}</option>)}</select>
        </label>
        <div className="wr-note">{ROLE_DEF[g.role].note} <span className="muted">{ROLE_DEF[g.role].does}</span></div>
        <div className="wr-field"><span>Duty</span><Seg value={g.duty} options={Object.keys(DUTY_LABEL) as Duty[]} label={(d) => DUTY_LABEL[d]} onPick={(d) => run((w) => orderGroup(w, war.id, g.id, { duty: d }))} /></div>
        <label className="wr-field"><span>Commander</span>
          <select className="select" value={g.commanderId ?? ''} onChange={(e) => run((w) => orderGroup(w, war.id, g.id, { commanderId: e.target.value || null }))}>
            <option value="">{g.commanderName ?? '— no one'}</option>
            {people.map((c) => <option key={c.id} value={c.id}>{c.name.given} {c.name.family ?? ''}</option>)}
          </select>
        </label>
        <div className="wr-note">{cmd.name === 'no one' ? <span className="down">No one leads it: it fights at ×0.9 and cannot use a free hand.</span> : <>{cmd.name} commands at {Math.round(cmd.skill)}.</>}</div>
        <div className="wr-field"><span>Leash</span><Seg value={g.leash} options={Object.keys(LEASH_LABEL) as Leash[]} label={(l) => LEASH_LABEL[l]} onPick={(l) => run((w) => orderGroup(w, war.id, g.id, { leash: l }))} /></div>
        <div className="wr-note muted">{LEASH_NOTE[g.leash]}</div>
        <label className="wr-field"><span>Fall back at</span>
          <select className="select" value={Math.round(g.fallback * 10) / 10} onChange={(e) => run((w) => orderGroup(w, war.id, g.id, { fallback: Number(e.target.value) }))}>{[0, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7].map((x) => <option key={x} value={x}>{x ? `${Math.round(x * 100)}% of its strength` : 'Never'}</option>)}</select>
        </label>
        <label className="wr-field"><span>Go to</span>
          <select className="select" value={go} disabled={!!g.engaged} onChange={(e) => setGo(e.target.value)}>
            <option value="">{g.engaged ? 'In a fight' : 'Choose a place…'}</option>
            {places.filter((n) => n.id !== g.at).map((n) => { const why = cannotOrder(world, war.id, g.id, { to: n.id }); return <option key={n.id} value={n.id} disabled={!!why}>{cap(n.name)}{why ? ` — ${why}` : ''}</option>; })}
          </select>
        </label>
        {go && path ? (
          <div className="wr-note">
            {path.length} step{path.length === 1 ? '' : 's'}: {path.map((x) => t.nodes[x]?.name).join(' → ')}. Fuel: about {Math.round(path.reduce((a, x, i) => a + legFuel(world, g) * ((t.edges.find((e) => (e.a === (i ? path[i - 1] : g.at) && e.b === x) || (e.b === (i ? path[i - 1] : g.at) && e.a === x))?.cycles ?? 2) / 2), 0))}.
            {risky.length ? <span className="down"> Their ships wait at {risky.map((x) => t.nodes[x]?.name).join(', ')}: unescorted transports will be caught.</span> : null}
            <div className="actions"><button type="button" className="btn small primary" onClick={() => { run((w) => orderGroup(w, war.id, g.id, { to: go })); setGo(''); }}>Send it</button></div>
          </div>
        ) : null}
        {g.path.length ? <button type="button" className="btn small" onClick={() => run((w) => orderGroup(w, war.id, g.id, { to: null }))}>Halt where it is</button> : null}
        {g.domain === 'ground' ? (
          <div className="wr-field"><span>Knights</span>
            <div className="wr-knights">
              {g.knights.map((k) => <button key={k} type="button" className="chip" onClick={() => run((w) => setGroupKnight(w, war.id, g.id, k, false))} title="Take them out of this group">✦ {world.characters[k]?.name.given} ✕</button>)}
              <select className="select tiny" value="" onChange={(e) => e.target.value && run((w) => setGroupKnight(w, war.id, g.id, e.target.value, true))}>
                <option value="">Add a knight…</option>
                {knights.filter((k) => !g.knights.includes(k.id)).map((k) => <option key={k.id} value={k.id}>{k.name.given} {k.name.family ?? ''}</option>)}
              </select>
            </div>
          </div>
        ) : null}
        <div className="actions">
          <button type="button" className="btn small" disabled={!!g.engaged || g.n < 2} onClick={() => run((w) => splitGroup(w, war.id, g.id, 0.25))}>Split off a quarter</button>
          <button type="button" className="btn small" disabled={!!g.engaged || g.n < 2} onClick={() => run((w) => splitGroup(w, war.id, g.id, 0.5))}>Split in half</button>
          {here.map((x) => <button key={x.id} type="button" className="btn small" disabled={!!g.engaged || !!x.engaged} onClick={() => { run((w) => mergeGroups(w, war.id, x.id, g.id)); setSel({ kind: 'group', id: x.id }); }}>Join {x.name}</button>)}
          {t.nodes[g.at]?.owner === side ? <button type="button" className="btn small" disabled={!!g.engaged} onClick={() => { run((w) => standDown(w, war.id, g.id)); setSel(null); }}>Stand down</button> : null}
        </div>
        {read ? <div className="wr-read"><span className="eyebrow">Staff read, here</span> <b className={read.p >= 0.55 ? 'up' : read.p <= 0.45 ? 'down' : ''}>{read.p >= 0.65 ? 'Leans ours' : read.p >= 0.55 ? 'Slightly ours' : read.p > 0.45 ? 'Either way' : read.p > 0.35 ? 'Slightly theirs' : 'Leans theirs'}</b><div className="muted">{read.why.join(' · ')}</div></div> : null}
      </div>
    </Panel>
  );
}

function EnemyInspector({ war, t, side, g, run }: { war: War; t: TheatreState; side: WSide; g: WGroup; run: (fn: (w: World) => World) => void }) {
  const world = useWorld();
  const s = t.sight[side][g.id];
  const mine = g.side === side;
  const plan = t.plans[world.playerHouseId];
  const doc = doctrineOf(g.house, world);
  return (
    <Panel title={mine ? g.name : (s?.level ?? 0) >= 2 ? g.name : `${houseName(world, g.house)} ${g.domain === 'void' ? 'ships' : 'troops'}`} aside={mine ? `allied · ${houseName(world, g.house)}` : ['unseen', 'rumour', 'seen', 'known'][s?.level ?? 0]}>
      <div className="body wr-insp">
        {mine ? <div className="muted">{strength(g)} at {t.nodes[g.at]?.name}. Our ally moves it; we can only see it.</div> : (
          <>
            <div>{seenText(t, side, g)} at {t.nodes[s?.at ?? g.at]?.name}{s && s.level === 0 ? <span className="muted"> · last seen {absoluteCycle(world.date) - s.cycle} cycles ago</span> : null}</div>
            <div className="muted">Role: {s?.role ? ROLE_DEF[s.role].label : 'unknown'}{(s?.level ?? 0) >= 3 ? ` · led by ${commanderOfGroup(world, g).name}` : ''}</div>
            <label className="wr-field"><span>Our orders</span>
              <select className="select" value={plan?.against[g.id] ?? 'none'} onChange={(e) => run((w) => setAgainst(w, war.id, g.id, e.target.value as Opp))}>{(Object.keys(OPP_LABEL) as Opp[]).map((o) => <option key={o} value={o}>{OPP_LABEL[o]}</option>)}</select>
            </label>
            <div className="wr-note muted">{OPP_NOTE[plan?.against[g.id] ?? 'none']}</div>
            <div className="wr-read"><span className="eyebrow">How House {houseName(world, g.house)} fights</span><div>{doc.tell}</div></div>
          </>
        )}
      </div>
    </Panel>
  );
}

function NodeInspector({ war, t, side, id, setSel, run }: { war: War; t: TheatreState; side: WSide; id: string; setSel: (s: Sel) => void; run: (fn: (w: World) => World) => void }) {
  const world = useWorld();
  const n = t.nodes[id]!;
  const here = Object.values(t.groups).filter((g) => (g.side === side ? g.at : t.sight[side][g.id]?.at) === id && (g.side === side || t.sight[side][g.id]));
  const why = cannotProbe(world, war.id, id);
  const until = t.probes[id] ?? 0;
  const read = staffRead(world, war, id);
  return (
    <Panel title={cap(n.name)} aside={`${n.kind}${n.target ? ' · the target' : ''}`}>
      <div className="body wr-insp">
        <div className="muted">
          {n.house ? `House ${houseName(world, n.house)}'s by right. ` : 'No one\'s by right. '}
          {n.holder ? `Held by ${n.holder === side ? 'our side' : 'theirs'}.` : 'Held by no one.'}
          {n.fort ? ` Walls ${'▮'.repeat(Math.round(n.fort))}.` : ''}{n.garrisonMax ? ` Garrison ${fmt(n.garrison)} of ${fmt(n.garrisonMax)}.` : ''}
          {n.dark ? ' The long way round: groups on it are harder to see.' : ''}
        </div>
        {here.length ? <div className="wr-here">{here.map((g) => <GroupCard key={g.id} g={g} t={t} side={side} sel={null} compact onPick={() => setSel({ kind: 'group', id: g.id })} />)}</div> : <div className="muted">Nothing of ours here, and nothing of theirs that we can see.</div>}
        {read ? <div className="wr-read"><span className="eyebrow">Staff read</span> <b className={read.p >= 0.55 ? 'up' : read.p <= 0.45 ? 'down' : ''}>{Math.round(read.p * 100)}% ours</b><div className="muted">{read.why.join(' · ')}</div></div> : null}
        <div className="actions">
          <button type="button" className="btn small" disabled={!!why} title={why ?? `The Spymaster's people look for a Phase: ${PROBE_COST} othes`} onClick={() => run((w) => probe(w, war.id, id))}>{until > absoluteCycle(world.date) ? 'Our people are there' : `Send people to look · ${PROBE_COST}`}</button>
        </div>
      </div>
    </Panel>
  );
}

function RaisePanel({ war, t, run }: { war: War; t: TheatreState; run: (fn: (w: World) => World) => void }) {
  const world = useWorld();
  const P = world.playerHouseId;
  const forms = Object.values(world.war?.formations ?? {}).filter((f) => f.houseId === P);
  const freeGround = forms.filter((f) => f.kind !== 'fleet').reduce((a, f) => a + freeOf(world, t, f), 0);
  const freeVoid = forms.filter((f) => f.kind === 'fleet').reduce((a, f) => a + freeOf(world, t, f), 0);
  return (
    <Panel title="Muster" aside="nothing picked">
      <div className="body wr-insp">
        <div className="muted">Still at home and in no group: {fmt(freeGround)} troops, {freeVoid} ships. Garrisons stay where they are.</div>
        <div className="actions">
          <button type="button" className="btn small" disabled={!freeGround} onClick={() => run((w) => raiseGroup(w, war.id, 'ground', 1))}>Raise a host from what is left</button>
          <button type="button" className="btn small" disabled={!freeVoid} onClick={() => run((w) => raiseGroup(w, war.id, 'void', 1))}>Raise a squadron</button>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>Split groups to make more of them; join two that stand together to make one. Every group needs a role, a duty, a commander and a leash.</div>
      </div>
    </Panel>
  );
}

function Seg<T extends string>({ value, options, label, onPick }: { value: T; options: T[]; label: (x: T) => string; onPick: (x: T) => void }) {
  return <span className="wr-seg">{options.map((o) => <button key={o} type="button" className={o === value ? 'on' : ''} aria-pressed={o === value} onClick={() => onPick(o)}>{label(o)}</button>)}</span>;
}

// ---------------------------------------------------------------- what it costs

function WarCosts() {
  const world = useWorld();
  const P = world.playerHouseId;
  const e = econ(world, P);
  const lines = phaseLedger(world, P);
  const net = netWithQuota(world, P);
  const war = lines.filter((l) => l.kind === 'war');
  const goods = ['provisions', 'fuel', 'components', 'navisium'] as const;
  return (
    <Panel title="What it costs" aside="per Phase">
      <div className="body wr-insp">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
          {goods.map((g) => { const r = runway(e.stock[g], net[g]); return <div key={g} style={{ display: 'flex', flexDirection: 'column', fontSize: 11 }}><span className="muted">{RESOURCE_LABEL[g]}</span><b className="mono">{Math.round(e.stock[g]).toLocaleString('en-US')}</b><span className={r < 3 ? 'down' : 'muted'}>{r === Infinity ? 'holding' : `${Math.floor(r)} Ph left`}</span></div>; })}
        </div>
        {war.map((l, i) => <div key={i} className="row" style={{ fontSize: 12 }}><span>{l.label}</span><span className="mono down">{Math.round(l.amount).toLocaleString('en-US')} {l.resource === 'othes' ? '' : RESOURCE_LABEL[l.resource as Resource].toLowerCase()}</span></div>)}
        <span className="muted" style={{ fontSize: 11 }}>Every lane crossed burns fuel; every fight costs components and a little navisium.</span>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------- the staff

function Staff({ war, t, side, setSel }: { war: War; t: TheatreState; side: WSide; setSel: (s: Sel) => void }) {
  const world = useWorld();
  const P = world.playerHouseId;
  const foe = side === 'attackers' ? war.defender : war.attacker;
  const doc = doctrineOf(foe, world);
  const ours = Object.values(t.groups).filter((g) => g.house === P);
  const danger = dangerFor(t, side);
  const notes: { text: string; bad?: boolean; id?: string }[] = [];
  for (const g of ours) {
    if (commanderOfGroup(world, g).name === 'no one') notes.push({ text: `${g.name} has no commander.`, bad: true, id: g.id });
    if (g.domain === 'ground' && (danger.has(g.at) || g.path.some((x) => danger.has(x)))) notes.push({ text: `${g.name}'s transports will meet their ships unescorted.`, bad: true, id: g.id });
    if (g.supply < 0.5) notes.push({ text: `${g.name} is short of supply (${Math.round(g.supply * 100)}%).`, bad: true, id: g.id });
    if (g.fatigue > 0.6) notes.push({ text: `${g.name} is worn out.`, id: g.id });
    if ((g.role === 'hammer' || g.role === 'reserve') && g.leash === 'tight') notes.push({ text: `${g.name} is on a tight leash: it waits to be called.`, id: g.id });
  }
  const plan = t.plans[P];
  if (plan && plan.familiarity < 50) notes.push({ text: `The plan is new to them (${Math.round(plan.familiarity)}%): every change costs familiarity.` });
  if (!ours.some((g) => g.role === 'picket' || g.role === 'screen' || g.role === 'shadow' || g.role === 'fighters')) notes.push({ text: 'Nothing of ours is watching: no picket, screen or shadow.' });
  return (
    <Panel title="The staff" aside={notes.length ? `${notes.length} to see to` : 'all well'}>
      <div className="body wr-insp">
        <div className="wr-read"><span className="eyebrow">Their tell</span><div>{doc.tell}</div><div className="muted">Their doctrine: {doc.cards.map((c) => DOCTRINES[c].label).join(' · ')}</div></div>
        {notes.slice(0, 6).map((n, i) => <button key={i} type="button" className={`wr-staff${n.bad ? ' bad' : ''}`} onClick={() => n.id && setSel({ kind: 'group', id: n.id })}>{n.bad ? '⚠ ' : '· '}{n.text}</button>)}
        {!notes.length ? <span className="muted">Nothing to report.</span> : null}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------- the plan

function PlanPanel({ war, t, run }: { war: War; t: TheatreState; run: (fn: (w: World) => World) => void }) {
  const world = useWorld();
  const plan = t.plans[world.playerHouseId];
  if (!plan) return null;
  const set = <K extends keyof Instructions>(k: K, v: Instructions[K]) => run((w) => setInstruction(w, war.id, k, v));
  const toggle = (d: DoctrineId) => run((w) => setDoctrines(w, war.id, plan.doctrines.includes(d) ? plan.doctrines.filter((x) => x !== d) : [...plan.doctrines, d]));
  return (
    <Panel title="The plan" aside={`${Math.round(plan.familiarity)}% familiar`}>
      <div className="body wr-insp">
        {(['tempo', 'width', 'risk', 'pursuit'] as const).map((k) => (
          <div key={k} className="wr-slider" title={SLIDER_NOTE[k]}>
            <span>{cap(k)}</span>
            <span className="wr-steps">{SLIDER_WORDS[k].map((word, i) => <button key={i} type="button" className={plan[k] === i ? 'on' : ''} aria-label={`${k}: ${word}`} aria-pressed={plan[k] === i} onClick={() => set(k, i)} />)}</span>
            <span className="muted">{SLIDER_WORDS[k][plan[k]]}</span>
          </div>
        ))}
        <label className="wr-field"><span>Our line</span><select className="select" value={plan.line} onChange={(e) => set('line', e.target.value as LineAt)}>{(Object.keys(LINE_LABEL) as LineAt[]).map((x) => <option key={x} value={x}>{LINE_LABEL[x]}</option>)}</select></label>
        <label className="wr-field"><span>Supply</span><select className="select" value={plan.supply} onChange={(e) => set('supply', e.target.value as SupplyAt)}>{(Object.keys(SUPPLY_LABEL) as SupplyAt[]).map((x) => <option key={x} value={x}>{SUPPLY_LABEL[x]}</option>)}</select></label>
        <label className="wr-field"><span>Quarter</span><select className="select" value={plan.quarter} title={QUARTER_NOTE[plan.quarter]} onChange={(e) => set('quarter', e.target.value as Quarter)}>{(Object.keys(QUARTER_LABEL) as Quarter[]).map((x) => <option key={x} value={x}>{QUARTER_LABEL[x]}</option>)}</select></label>
        <label className="wr-field"><span>Knights</span><select className="select" value={plan.knights} onChange={(e) => set('knights', e.target.value as KnightsAt)}>{(Object.keys(KNIGHTS_LABEL) as KnightsAt[]).map((x) => <option key={x} value={x}>{KNIGHTS_LABEL[x]}</option>)}</select></label>
        <span className="eyebrow">Doctrine · {plan.doctrines.length} of {MAX_DOCTRINES}</span>
        <div className="wr-docs">
          {(Object.keys(DOCTRINES) as DoctrineId[]).map((d) => {
            const on = plan.doctrines.includes(d);
            return <button key={d} type="button" className={`wr-doc${on ? ' on' : ''}`} aria-pressed={on} disabled={!on && plan.doctrines.length >= MAX_DOCTRINES} onClick={() => toggle(d)} title={DOCTRINES[d].note}><b>{DOCTRINES[d].label}</b><span>{DOCTRINES[d].note}</span></button>;
          })}
        </div>
        <span className="muted" style={{ fontSize: 11 }}>A changed instruction costs 6% familiarity; a changed doctrine 12%. Familiarity comes back 3% a Phase.</span>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------- what comes next, and what happened

function Ahead({ t, side, setSel }: { war: War; t: TheatreState; side: WSide; setSel: (s: Sel) => void }) {
  const world = useWorld();
  const now = absoluteCycle(world.date);
  const P = world.playerHouseId;
  const rows: { when: number; text: string; id: string; bad?: boolean }[] = [];
  for (const g of Object.values(t.groups).filter((x) => x.house === P && x.path.length)) {
    let at = g.arrive ?? now;
    for (const step of g.path) {
      const foes = Object.values(t.groups).filter((e) => e.side !== side && t.sight[side][e.id]?.at === step && (t.sight[side][e.id]?.level ?? 0) > 0);
      if (foes.length) { rows.push({ when: at, text: `${g.name} reaches ${t.nodes[step]!.name}: ${foes.map((f) => seenText(t, side, f)).join(', ')} of theirs there`, id: g.id, bad: true }); break; }
      at += 2;
    }
    if (!rows.some((r) => r.id === g.id)) rows.push({ when: at, text: `${g.name} reaches ${t.nodes[g.to ?? g.path[g.path.length - 1]!]!.name}`, id: g.id });
  }
  for (const [gid, s] of Object.entries(t.sight[side])) {
    const e = t.groups[gid];
    if (!e || s.level === 0 || !e.path.length || s.level < 2) continue;
    const next = t.nodes[e.path[0]!];
    if (next && Object.values(t.groups).some((g) => g.side === side && g.at === next.id)) rows.push({ when: e.arrive ?? now, text: `Theirs (${seenText(t, side, e)}) coming on ${next.name}`, id: gid, bad: true });
  }
  rows.sort((a, b) => a.when - b.when);
  return (
    <Panel title="What comes next" aside={rows.length ? `${rows.length} moving` : 'all still'}>
      <div className="body wr-ahead">
        {rows.slice(0, 8).map((r, i) => <button key={i} type="button" className={`wr-ahead-row${r.bad ? ' bad' : ''}`} onClick={() => setSel({ kind: 'group', id: r.id })}><span className="mono muted">+{Math.max(0, r.when - now)}c</span> {r.text}</button>)}
        {!rows.length ? <span className="muted">Nothing of ours is on the move. Give a group somewhere to go.</span> : null}
      </div>
    </Panel>
  );
}

function Reports({ t, side }: { t: TheatreState; side: WSide }) {
  const world = useWorld();
  const [open, setOpen] = useState<string | null>(null);
  const mine = t.reports.filter((r) => [...r.sides.attackers.groups, ...r.sides.defenders.groups].some((id) => t.groups[id]?.house === world.playerHouseId || r.sides[side].house === world.playerHouseId));
  return (
    <Panel title="After-action reports" aside={`${mine.length} of ours`} scroll={340}>
      <div className="body wr-reports">
        {mine.length ? mine.map((r) => <ReportRow key={r.id} r={r} side={side} open={open === r.id} toggle={() => setOpen(open === r.id ? null : r.id)} />) : <span className="muted">No fights of ours yet.</span>}
      </div>
    </Panel>
  );
}

function ReportRow({ r, side, open, toggle }: { r: Report; side: WSide; open: boolean; toggle: () => void }) {
  const won = r.winner === side;
  const p = side === 'attackers' ? r.p : 1 - r.p;
  const ours = r.sides[side], theirs = r.sides[side === 'attackers' ? 'defenders' : 'attackers'];
  return (
    <div className={`wr-report${won ? ' won' : ' lost'}`}>
      <button type="button" className="wr-report-h" onClick={toggle} aria-expanded={open}>
        <span className={won ? 'up' : 'down'}>{won ? 'WON' : 'LOST'}</span> <b>{r.title}</b> <span className="muted">· {r.domain === 'void' ? `${ours.n} ships against ${theirs.n}` : `${fmt(ours.n)} against ${fmt(theirs.n)}`} · odds {Math.round(p * 100)}%{r.battle ? ' · fought live' : ''}{r.shout ? ` · shout: ${r.shout}` : ''}</span>
      </button>
      {open ? (
        <div className="wr-report-b">
          <div>{r.text}</div>
          <div className="muted">Weight of numbers alone: {side === 'attackers' ? r.base : Math.round(100 / Math.max(0.01, r.base)) / 100}× · everything else: {side === 'attackers' ? r.rel : Math.round(100 / r.rel) / 100}× (capped at 3.5)</div>
          <div className="wr-mults">
            {(['attackers', 'defenders'] as const).map((s) => (
              <div key={s}><span className="eyebrow">{s === side ? 'Us' : 'Them'}</span>
                {r.mults.filter((m) => m.side === s).sort((a, b) => Math.abs(Math.log(b.x)) - Math.abs(Math.log(a.x))).map((m, i) => <div key={i} className="mono"><span className={m.x >= 1 ? 'up' : 'down'}>×{m.x.toFixed(2)}</span> {m.label}{m.base ? <span className="muted"> (in the numbers)</span> : null}</div>)}
              </div>
            ))}
          </div>
          {r.why.length ? <div><span className="eyebrow">Why it went {won ? 'our' : 'their'} way</span> {r.why.join(' · ')}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

function Feed({ t, side }: { t: TheatreState; side: WSide }) {
  const world = useWorld();
  const now = absoluteCycle(world.date);
  return (
    <Panel title="The feed" aside={`${t.feed.length} lines`} scroll={340}>
      <div className="body wr-feed">
        {t.feed.slice().reverse().slice(0, 60).map((l, i) => <div key={i} className={l.big ? 'big' : ''}><span className="mono muted">−{now - l.cycle}c</span> <span className={l.side ? (l.side === side ? 'up' : 'down') : ''}>{l.text}</span></div>)}
      </div>
    </Panel>
  );
}

