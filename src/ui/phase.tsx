// The War Room's Phase: plan the next 16 cycles against a forecast, see the odds move with every choice, commit,
// and watch it play out. Three layouts of the same calculator (council first, timeline first, map first); the
// odds, the brief, the timeline, the map and the group editor are shared.
import { useContext, useEffect, useMemo, useState } from 'react';
import { useGame, useWorld } from './context';
import { Panel } from './links';
import { ClockCtx } from './clock';
import { cannotPlant, plantNetwork } from '../sim/networks';
import { houseName } from '../sim/archon';
import { absoluteCycle } from '../sim/time';
import { econ } from '../sim/economy';
import { RESOURCE_LABEL, type Good } from '../data/economy';
import { ROLE_DEF } from '../data/doctrine';
import {
  briefOf, staffPlans, type StaffPlan, forecastWar, forecastWith, whatIf, FORECAST_GOODS, HORIZON, type BriefItem, type Forecast, type Track,
} from '../sim/forecast';
import {
  cannotOrder, cannotProbe, commitPhase, probe, type GroupOrder, commanderOfGroup, legFuel, orderGroup, orderMany, phaseIndex, theatreOf, type TheatreState, type WGroup, type WNode, type WSide,
} from '../sim/warroom';
import type { War } from '../sim/war';
import type { World } from '../sim/types';

const pct = (p: number) => `${Math.round(p * 100)}%`;
/** The odds as the staff would say them: a handful of forecasts cannot see a one-in-twenty loss, so never certain. */
const oddsText = (p: number) => (p > 0.97 ? '>97%' : p < 0.03 ? '<3%' : pct(p));
const sc = (s: number) => `${s >= 0 ? '+' : '−'}${Math.abs(s).toFixed(1)}`;
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const short = (n?: WNode) => (n ? cap(n.name.replace(/^the space over /, '◌ ').replace(/^the /, '')) : '?');
export type Edition = 'council' | 'timeline' | 'map';
export const EDITION_LABEL: Record<Edition, string> = { timeline: 'Map + timeline', council: 'Council', map: 'Map + stores' };

function usePlay() {
  const game = useGame();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: (w: World) => World) => game.update((w) => { try { setErr(null); return fn(w); } catch (e) { setErr((e as Error).message); return w; } });
  return { run, err };
}

/** A heavy reckoning done just after the page draws, not while it draws: the last answer stays up (marked stale)
 *  until the new one is ready, so a click never freezes the screen. */
function useLater<T>(fn: () => T, deps: unknown[]): { value: T | null; stale: boolean } {
  const [state, setState] = useState<{ value: T | null; key: unknown[] | null }>({ value: null, key: null });
  const fresh = state.key !== null && state.key.length === deps.length && state.key.every((d, i) => d === deps[i]);
  useEffect(() => {
    let live = true;
    const id = setTimeout(() => { const v = fn(); if (live) setState({ value: v, key: deps }); }, 0);
    return () => { live = false; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { value: state.value, stale: !fresh };
}

const sideOf = (war: War, h: string): WSide => (war.attacker === h || war.attackers.includes(h) ? 'attackers' : 'defenders');
const colOf = (n: WNode, side: WSide) => (side === 'attackers' ? n.depth : 4 - n.depth);

// ---------------------------------------------------------------- the page

export function PhasePage({ war, edition, setEdition }: { war: War; edition: Edition; setEdition: (e: Edition) => void }) {
  const world = useWorld();
  const t = theatreOf(war)!;
  const committed = t.phase?.committed === phaseIndex(world);
  return committed ? <Watch war={war} t={t} /> : <Plan war={war} t={t} edition={edition} setEdition={setEdition} />;
}

function Plan({ war, t, edition, setEdition }: { war: War; t: TheatreState; edition: Edition; setEdition: (e: Edition) => void }) {
  const world = useWorld();
  const { run, err } = usePlay();
  const clock = useContext(ClockCtx);
  const side = sideOf(war, world.playerHouseId);
  const f = useMemo(() => forecastWar(world, war.id, 8), [world, war.id]);
  const [prev, setPrev] = useState<number | null>(null);
  const [lastP, setLastP] = useState<number | null>(null);
  useEffect(() => { if (f) { setPrev(lastP); setLastP(f.pWin); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f?.pWin]);
  const brief = useMemo(() => (f ? briefOf(world, war.id, f) : []), [world, war.id, f]);
  const [sel, setSel] = useState<string | null>(null);
  const [cycle, setCycle] = useState(Math.min(HORIZON, Math.max(1, f?.contacts[0]?.cycle ?? 8)));
  const [handsOff, setHandsOff] = useState(t.phase?.handsOff ?? true);
  const [busy, setBusy] = useState(false);
  const [plans, setPlans] = useState<{ list: StaffPlan[]; snap: World; adopted?: number } | null>(null);
  if (!f) return <p className="muted">The staff cannot read this war.</p>;
  const commit = (watch: boolean) => { run((w) => commitPhase(w, war.id, handsOff)); if (watch) clock?.setRunning(true); };
  const findPlans = () => {
    setBusy(true);
    setTimeout(() => { const list = staffPlans(world, war.id, 4); setBusy(false); setPlans({ list, snap: world }); }, 30);
  };
  // Adopting a whole plan: our groups' orders go back to what they were when the staff drew the plans, then the
  // plan is given, so switching between plans never leaves half of another one behind.
  const adopt = (i: number) => {
    if (!plans) return;
    const p = plans.list[i]!;
    run((w) => {
      const x = structuredClone(w);
      const t0 = theatreOf(plans.snap.war!.wars.find((y) => y.id === war.id)!)!;
      const t1 = theatreOf(x.war!.wars.find((y) => y.id === war.id)!)!;
      for (const g of Object.values(t1.groups)) {
        const o = t0.groups[g.id];
        if (g.house !== x.playerHouseId || !o || g.engaged) continue;
        g.to = o.to; g.path = [...o.path]; g.arrive = o.arrive; g.hold = o.hold; g.duty = o.duty; g.falling = o.falling;
      }
      return orderMany(x, war.id, p.orders);
    });
    setPlans({ ...plans, adopted: i });
  };
  const planList = plans ? <PlanCards war={war} plans={plans.list} adopted={plans.adopted} adopt={adopt} close={() => setPlans(null)} /> : null;
  const odds = <Odds f={f} prev={prev} handsOff={handsOff} setHandsOff={setHandsOff} commit={commit} edition={edition} setEdition={setEdition} best={{ busy, go: findPlans }} />;
  const briefEl = <Brief war={war} items={brief} run={run} compact={edition !== 'council'} />;
  const editor = <Editor war={war} t={t} sel={sel} setSel={setSel} f={f} run={run} />;
  const timeline = <Timeline war={war} t={t} f={f} side={side} cycle={cycle} setCycle={setCycle} sel={sel} setSel={setSel} />;
  const map = <PhaseMap war={war} t={t} f={f} side={side} cycle={cycle} setCycle={setCycle} sel={sel} setSel={setSel} run={run} />;
  return (
    <div className={`ph ph-${edition}`}>
      {odds}
      {planList}
      {err ? <p className="error">{err}</p> : null}
      {edition === 'council' ? (
        <>
          {briefEl}
          {timeline}
          <div className="ph-two">{map}{editor}</div>
        </>
      ) : edition === 'timeline' ? (
        <div className="ph-two wide">
          <div className="ph-col">{map}{timeline}</div>
          <div className="ph-col side">{briefEl}{editor}</div>
        </div>
      ) : (
        <>
          <div className="ph-two wide">
            <div className="ph-col">{map}</div>
            <div className="ph-col side">{briefEl}{editor}</div>
          </div>
          <Stocks f={f} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- the odds, and committing

function Odds({ f, prev, handsOff, setHandsOff, commit, edition, setEdition, best }: { f: Forecast; prev: number | null; handsOff: boolean; setHandsOff: (v: boolean) => void; commit: (watch: boolean) => void; edition: Edition; setEdition: (e: Edition) => void; best: { busy: boolean; go: () => void } }) {
  const d = prev === null ? 0 : f.pWin - prev;
  const tone = f.pWin >= 0.6 ? 'up' : f.pWin <= 0.4 ? 'down' : '';
  return (
    <section className="ph-odds">
      <div className="ph-dial" aria-label={`Chance the Phase goes our way: ${pct(f.pWin)}`}>
        <span className="eyebrow">This Phase goes our way</span>
        <b className={`ph-big ${tone}`}>{oddsText(f.pWin)}</b>
        <span className="ph-meter" aria-hidden="true"><i style={{ width: pct(f.pWin) }} /></span>
        {Math.abs(d) >= 0.01 ? <span className={d > 0 ? 'up' : 'down'}>{d > 0 ? '▲' : '▼'} {Math.round(Math.abs(d) * 100)} points with that change</span> : <span className="muted">from {f.runs} staff forecasts of the next {HORIZON} cycles</span>}
      </div>
      <div className="ph-facts">
        <div><span className="eyebrow">War score</span><b className={f.score >= 0 ? 'up' : 'down'}>{f.score >= 0 ? '+' : ''}{f.score.toFixed(1)}</b></div>
        <div><span className="eyebrow">Our dead</span><b>{fmt(f.ourLoss)}</b></div>
        <div><span className="eyebrow">Theirs</span><b>{fmt(f.theirLoss)}</b></div>
        {FORECAST_GOODS.map((g) => <div key={g}><span className="eyebrow">{RESOURCE_LABEL[g]}</span><b className={f.stock[g].at(-1)! <= 0 ? 'down' : undefined}>{f.cost[g] >= 0.5 ? `−${fmt(f.cost[g])}` : '0'}</b></div>)}
      </div>
      <div className="ph-fights">
        <span className="eyebrow">Fights ahead</span>
        {f.contacts.length ? f.contacts.slice(0, 4).map((c) => <span key={c.node} className={`ph-chip ${c.pOurs >= 0.55 ? 'up' : c.pOurs <= 0.45 ? 'down' : ''}`}>c{c.cycle} · {c.node.replace(/^the /, '')} · {pct(c.pOurs)} · in {c.runs}/{f.runs}</span>) : <span className="muted">none expected</span>}
      </div>
      <div className="ph-commit">
        <label className="ph-check"><input type="checkbox" checked={handsOff} onChange={(e) => setHandsOff(e.target.checked)} /> Hands off: the staff fight the big battles too</label>
        <button type="button" className="btn ph-best" disabled={best.busy} onClick={best.go}>{best.busy ? 'The staff are drawing up plans…' : '✦ The staff’s plans'}</button>
        <div className="ph-btns">
          <button type="button" className="btn primary" onClick={() => commit(true)}>Deploy &amp; watch ▸</button>
          <button type="button" className="btn" onClick={() => commit(false)}>Deploy</button>
        </div>
        <span className="ph-ed muted">Layout: {(['timeline', 'council', 'map'] as Edition[]).map((e) => <button key={e} type="button" className={`linklike${edition === e ? ' gold' : ''}`} aria-pressed={edition === e} onClick={() => setEdition(e)}>{EDITION_LABEL[e]}</button>)}</span>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- the staff's whole plans

function PlanCards({ war, plans, adopted, adopt, close }: { war: War; plans: StaffPlan[]; adopted?: number; adopt: (i: number) => void; close: () => void }) {
  const world = useWorld();
  const t = theatreOf(war)!;
  const line = (gid: string, o: GroupOrder) => `${t.groups[gid]?.name ?? gid}${'to' in o ? (o.to ? ` → ${short(t.nodes[o.to])}` : ' holds') : ''}${o.leave ? ` at c${o.leave}` : ''}${o.duty ? `, ${o.duty}s` : ''}`;
  void world;
  if (!plans.length) return <p className="muted">The staff have no plan to offer.</p>;
  return (
    <section className="ph-plans" aria-label="The staff's plans">
      {plans.map((p, i) => (
        <div key={i} className={`ph-plan${adopted === i ? ' on' : ''}`}>
          <div className="ph-card-h"><span className="eyebrow">Plan {'ABC'[i]}</span><b className={p.pWin >= 0.6 ? 'up' : p.pWin <= 0.4 ? 'down' : ''}>{oddsText(p.pWin)}</b></div>
          <b className="ph-card-t">{p.name}</b>
          <span className="muted" style={{ fontSize: 11 }}>{p.note}</span>
          <span className="ph-plan-o">{Object.entries(p.orders).map(([gid, o]) => line(gid, o)).join(' · ') || 'no new orders'}</span>
          <span className="mono muted" style={{ fontSize: 11 }}>score {sc(p.score)} · our dead {fmt(p.ourLoss)} · theirs {fmt(p.theirLoss)}</span>
          <button type="button" className={`btn${adopted === i ? '' : ' primary'}`} disabled={adopted === i} onClick={() => adopt(i)}>{adopted === i ? 'Adopted' : 'Adopt this plan'}</button>
        </div>
      ))}
      <button type="button" className="linklike muted ph-plans-x" onClick={close}>Close</button>
    </section>
  );
}

// ---------------------------------------------------------------- the brief: each answer with its odds

function Brief({ war, items, run, compact }: { war: War; items: BriefItem[]; run: (fn: (w: World) => World) => void; compact?: boolean }) {
  const world = useWorld();
  const later = useLater(() => items.map((it) => it.options.map((o) => { if (!Object.keys(o.orders).length) return null; const f = forecastWith(world, war.id, o.orders, 4); return f ? { p: f.pWin, s: f.score } : null; })), [world, war.id, items]);
  const odds = later.value ?? [];
  if (!items.length) return <Panel title="The brief" aside="nothing presses"><div className="body muted">Nothing is coming at us that the staff can see. Use the time: move, raid, or look.</div></Panel>;
  return (
    <section className={`ph-brief${compact ? ' compact' : ''}`}>
      {items.map((it, i) => (
        <div key={i} className={`ph-card ${it.kind}`}>
          <div className="ph-card-h"><span className="eyebrow">{it.kind === 'threat' ? 'Threat' : it.kind === 'opportunity' ? 'Opportunity' : 'Unknown'}</span><b className="ph-when">{it.when}</b></div>
          <b className="ph-card-t">{it.title}</b>
          <div className="ph-opts">
            {it.options.map((o, j) => {
              const p = odds[i]?.[j];
              if (o.spy) {
                const spy = o.spy;
                const why = spy.kind === 'network' ? cannotPlant(world, spy.house) : cannotProbe(world, war.id, spy.node);
                return (
                  <button key={j} type="button" className="ph-opt spy" disabled={!!why} title={why ?? o.note} onClick={() => run((w) => (spy.kind === 'network' ? plantNetwork(w, spy.house) : probe(w, war.id, spy.node)))}>
                    <span>{o.label}<span className="muted ph-note">{why ?? o.note}</span></span>
                    <b>{spy.kind === 'network' ? `${pct(spy.odds)} · ` : ''}<span className="muted">{fmt(spy.cost)} othes</span></b>
                  </button>
                );
              }
              return (
                <button key={j} type="button" className="ph-opt" disabled={!Object.keys(o.orders).length} onClick={() => run((w) => orderMany(w, war.id, o.orders))} title={o.note}>
                  <span>{o.label}</span>
                  {later.stale && !p ? <span className="muted">…</span> : p ? <b className={p.p >= 0.6 ? 'up' : p.p <= 0.4 ? 'down' : ''}>{oddsText(p.p)} <span className="muted">{sc(p.s)}</span></b> : <span className="muted">as now</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------- one group, and what each choice would do

function Editor({ war, t, sel, setSel, f, run }: { war: War; t: TheatreState; sel: string | null; setSel: (s: string | null) => void; f: Forecast; run: (fn: (w: World) => World) => void }) {
  const world = useWorld();
  const P = world.playerHouseId;
  const ours = Object.values(t.groups).filter((g) => g.house === P);
  const g = (sel && t.groups[sel]?.house === P ? t.groups[sel] : undefined) ?? ours[0];
  const now = absoluteCycle(world.date);
  const options = useLater(() => {
    if (!g) return null;
    const places = Object.keys(t.nodes).filter((id) => id === g.at || !cannotOrder(world, war.id, g.id, { to: id }));
    const dests = whatIf(world, war.id, g.id, [{ to: null }, ...places.filter((id) => id !== g.at).map((id) => ({ to: id }))], 4);
    const leaves = g.to ? whatIf(world, war.id, g.id, [0, 2, 4, 6, 8].map((c) => ({ to: g.to, leave: c })), 4) : [];
    const duties = whatIf(world, war.id, g.id, (['attack', 'defend', 'support'] as const).map((d) => ({ duty: d })), 4);
    return { gid: g.id, dests: dests.sort((a, b) => b.pWin - a.pWin || b.score - a.score), leaves, duties };
  }, [world, war.id, g?.id, g?.to, g?.at]);
  if (!g) return <Panel title="Our groups"><div className="body muted">No groups of ours in the field.</div></Panel>;
  const groupPicker = <div className="ph-pick">{ours.map((x) => <button key={x.id} type="button" className={`ph-g ${x.domain}${x.id === g.id ? ' on' : ''}`} aria-pressed={x.id === g.id} onClick={() => setSel(x.id)}>{x.domain === 'void' ? '◇' : '▪'} {x.name}</button>)}</div>;
  if (!options.value || options.value.gid !== g.id) return <Panel title="Orders" aside={`${ours.length} groups`}><div className="body ph-ed-body">{groupPicker}<span className="muted ph-working">The staff are working out each choice for {g.name}…</span></div></Panel>;
  const opts = options.value;
  const cmd = commanderOfGroup(world, g);
  const holdUntil = g.hold && g.hold > now ? g.hold - now : 0;
  const best = opts.dests[0];
  return (
    <Panel title="Orders" aside={options.stale ? 'reckoning…' : `${ours.length} groups`}>
      <div className={`body ph-ed-body${options.stale ? ' stale' : ''}`}>
        {groupPicker}
        <div className="muted" style={{ fontSize: 12 }}>{x(g)} · {ROLE_DEF[g.role].label} · {cmd.name} · at {short(t.nodes[g.at])}{g.to ? ` → ${short(t.nodes[g.to])}${holdUntil ? `, leaving in ${holdUntil}c` : ''}` : ', holding'} · {Math.round(legFuel(world, g) * 10) / 10} fuel a lane</div>
        <span className="eyebrow">Where · odds the Phase goes our way</span>
        <div className="ph-what">
          {opts.dests.map((o) => {
            const cur = (o.order.to ?? null) === (g.to ?? null);
            return (
              <button key={String(o.order.to)} type="button" className={`ph-w${cur ? ' cur' : ''}`} onClick={() => run((w) => orderGroup(w, war.id, g.id, { to: o.order.to ?? null }))}>
                <span>{o.order.to ? short(t.nodes[o.order.to]) : 'Hold where it is'}</span>
                <span className="ph-bar"><i style={{ width: pct(o.pWin) }} /></span>
                <b className={o.pWin >= 0.6 ? 'up' : o.pWin <= 0.4 ? 'down' : ''}>{oddsText(o.pWin)}</b>
                <span className="muted mono">{sc(o.score)}</span>
              </button>
            );
          })}
        </div>
        {opts.leaves.length ? (
          <>
            <span className="eyebrow">When it leaves</span>
            <div className="ph-seg">{opts.leaves.map((o) => <button key={o.order.leave} type="button" className={holdUntil === o.order.leave || (!holdUntil && o.order.leave === 0) ? 'on' : ''} onClick={() => run((w) => orderGroup(w, war.id, g.id, { to: g.to, leave: o.order.leave }))}>{o.order.leave ? `c${o.order.leave}` : 'now'}<b>{oddsText(o.pWin)}</b></button>)}</div>
          </>
        ) : null}
        <span className="eyebrow">How it fights</span>
        <div className="ph-seg">{opts.duties.map((o) => <button key={o.order.duty} type="button" className={g.duty === o.order.duty ? 'on' : ''} onClick={() => run((w) => orderGroup(w, war.id, g.id, { duty: o.order.duty }))}>{cap(o.order.duty!)}<b>{oddsText(o.pWin)}</b></button>)}</div>
        {best && (best.order.to ?? null) !== (g.to ?? null) && best.pWin > f.pWin + 0.05 ? <span className="up" style={{ fontSize: 12 }}>The staff's best guess for {g.name}: {best.order.to ? short(t.nodes[best.order.to]) : 'hold'} ({pct(best.pWin)}).</span> : null}
      </div>
    </Panel>
  );
}
const x = (g: WGroup) => (g.domain === 'ground' ? `${fmt(g.n)} troops` : `${g.n} ships${g.great.length ? ` + ${g.great.length} great` : ''}`);

// ---------------------------------------------------------------- the timeline: every group, every cycle

function Timeline({ war, t, f, cycle, setCycle, sel, setSel }: { war: War; t: TheatreState; f: Forecast; side: WSide; cycle: number; setCycle: (c: number) => void; sel: string | null; setSel: (s: string) => void }) {
  const world = useWorld();
  const cycles = Array.from({ length: HORIZON }, (_, i) => i + 1);
  const ours = f.tracks.filter((tr) => tr.ours && tr.house === world.playerHouseId);
  const allies = f.tracks.filter((tr) => tr.ours && tr.house !== world.playerHouseId);
  const theirs = f.tracks.filter((tr) => !tr.ours);
  const fights = new Map(f.contacts.map((c) => [`${c.cycle}:${c.node}`, c]));
  const row = (tr: Track) => {
    const segs: { from: number; to: number; at: string; moving: boolean }[] = [];
    for (const c of cycles) {
      const at = tr.at[c] ?? tr.at.at(-1)!;
      const moving = at !== (tr.at[c - 1] ?? at);
      const last = segs.at(-1);
      if (last && last.at === at && !moving) last.to = c; else segs.push({ from: c, to: c, at, moving });
    }
    return segs.map((s, i) => {
      const n = t.nodes[s.at];
      const fight = [...fights.values()].find((c) => c.cycle >= s.from && c.cycle <= s.to && n && c.node === n.name);
      const cls = `ph-seg-bar ${tr.ours ? (tr.domain === 'void' ? 'v' : 'g') : 'x'}${s.moving ? ' mv' : ''}${!tr.ours && tr.seen < 2 ? ' fog' : ''}`;
      return <span key={i} className={cls} style={{ gridColumn: `${s.from} / ${s.to + 1}` }} title={`${short(n)}, c${s.from}–c${s.to}`}>{s.moving ? '→ ' : ''}{short(n)}{fight ? ` ⚔ ${pct(fight.pOurs)}` : ''}</span>;
    });
  };
  const name = (tr: Track) => (tr.ours || tr.seen >= 2 ? tr.name : `${houseName(world, tr.house)} ${tr.domain === 'void' ? 'ships' : 'troops'}`);
  return (
    <Panel title="The next 16 cycles" aside="forecast · click a cycle to move the map">
      <div className="ph-tl" role="table" aria-label="Forecast timeline">
        <div className="ph-tl-row head"><span className="ph-tl-name" />{<div className="ph-tl-cells">{cycles.map((c) => <button key={c} type="button" className={`ph-cyc${c === cycle ? ' on' : ''}`} onClick={() => setCycle(c)}>{c}</button>)}</div>}</div>
        {ours.map((tr) => <div key={tr.id} className={`ph-tl-row${sel === tr.id ? ' sel' : ''}`}><button type="button" className="ph-tl-name" onClick={() => setSel(tr.id)}><b>{tr.domain === 'void' ? '◇' : '▪'} {tr.name}</b><span className="muted">{tr.domain === 'void' ? `${tr.n[0]} ships` : fmt(tr.n[0] ?? 0)}{(tr.n.at(-1) ?? 0) < (tr.n[0] ?? 0) ? ` → ${tr.domain === 'void' ? tr.n.at(-1) : fmt(tr.n.at(-1)!)}` : ''}</span></button><div className="ph-tl-cells">{row(tr)}</div></div>)}
        {allies.length ? allies.map((tr) => <div key={tr.id} className="ph-tl-row ally"><span className="ph-tl-name"><b>{tr.name}</b><span className="muted">{houseName(world, tr.house)}</span></span><div className="ph-tl-cells">{row(tr)}</div></div>) : null}
        <div className="ph-tl-sep"><span className="eyebrow down">Theirs · as we expect them</span></div>
        {theirs.length ? theirs.map((tr) => <div key={tr.id} className="ph-tl-row foe"><span className="ph-tl-name"><b>{name(tr)}</b><span className="muted">{tr.domain === 'void' ? `~${tr.n[0]} ships` : `~${fmt(tr.n[0] ?? 0)}`}{tr.seen === -1 ? ' · unseen, a guess' : tr.seen === 0 ? ' · last seen' : tr.seen === 1 ? ' · rumour' : ''}</span></span><div className="ph-tl-cells">{row(tr)}</div></div>) : <div className="muted" style={{ padding: 8, fontSize: 12 }}>We see none of them.</div>}
        <div className="ph-tl-sep"><span className="eyebrow">Our stores · by cycle</span></div>
        {FORECAST_GOODS.map((gd) => <div key={gd} className="ph-tl-row stock"><span className="ph-tl-name"><b>{RESOURCE_LABEL[gd]}</b><span className="muted">{fmt(econ(world, world.playerHouseId).stock[gd])} now</span></span><div className="ph-tl-cells">{cycles.map((c) => { const v = f.stock[gd][c] ?? 0; return <span key={c} className={`ph-num${v <= 0 ? ' bad' : v < (f.stock[gd][0] ?? 0) * 0.25 ? ' low' : ''}`}>{c % 2 === 0 ? fmt(v) : ''}</span>; })}</div></div>)}
      </div>
      {void war}
    </Panel>
  );
}

function Stocks({ f }: { f: Forecast }) {
  return (
    <Panel title="Our stores through the Phase" aside="forecast">
      <div className="body ph-stocks">
        {FORECAST_GOODS.map((g: Good) => {
          const a = f.stock[g][0] ?? 0, b = f.stock[g].at(-1) ?? 0, lo = Math.min(...f.stock[g]);
          return <div key={g}><span className="eyebrow">{RESOURCE_LABEL[g]}</span><b className={lo <= 0 ? 'down' : undefined}>{fmt(a)} → {fmt(b)}</b><span className="muted">{lo <= 0 ? `runs out at c${f.stock[g].findIndex((v) => v <= 0)}` : `lowest ${fmt(lo)}`}</span></div>;
        })}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------- the map at a cycle

function layout(t: TheatreState, side: WSide) {
  const W = 760, H = 330;
  const out: Record<string, { x: number; y: number }> = {};
  for (let c = 0; c < 5; c++) {
    const ns = Object.values(t.nodes).filter((n) => colOf(n, side) === c).sort((a, b) => a.row - b.row);
    ns.forEach((n, i) => { out[n.id] = { x: 70 + c * ((W - 140) / 4), y: 40 + (i + 0.5) * ((H - 60) / Math.max(1, ns.length)) }; });
  }
  return { pos: out, W, H };
}

function PhaseMap({ war, t, f, side, cycle, setCycle, sel, setSel, run, live }: { war: War; t: TheatreState; f?: Forecast; side: WSide; cycle: number; setCycle?: (c: number) => void; sel?: string | null; setSel?: (s: string) => void; run?: (fn: (w: World) => World) => void; live?: boolean }) {
  const world = useWorld();
  const { pos, W, H } = useMemo(() => layout(t, side), [t, side]);
  const tokens: { id: string; at: string; ours: boolean; void: boolean; label: string; fog: boolean; mine: boolean }[] = live
    ? Object.values(t.groups).filter((g) => g.side === side || (t.sight[side][g.id]?.level ?? 0) > 0).map((g) => ({ id: g.id, at: g.side === side ? g.at : t.sight[side][g.id]!.at, ours: g.side === side, void: g.domain === 'void', label: g.side === side ? g.name : `${houseName(world, g.house)}`, fog: g.side !== side && (t.sight[side][g.id]?.level ?? 0) < 2, mine: g.house === world.playerHouseId }))
    : (f?.tracks ?? []).map((tr) => ({ id: tr.id, at: tr.at[cycle] ?? tr.at.at(-1)!, ours: tr.ours, void: tr.domain === 'void', label: tr.ours || tr.seen >= 2 ? tr.name : houseName(world, tr.house), fog: !tr.ours && tr.seen < 2, mine: tr.house === world.playerHouseId }));
  const selected = sel ? t.groups[sel] : undefined;
  const fightsNow = f ? f.contacts.filter((c) => Math.abs(c.cycle - cycle) <= 1) : [];
  const nodeByName = new Map(Object.values(t.nodes).map((n) => [n.name, n]));
  return (
    <Panel title={live ? 'The theatre, now' : `The theatre at cycle ${cycle}`} aside={live ? 'live' : selected?.house === world.playerHouseId ? `click a place to send ${selected.name}` : 'forecast'}>
      <svg className="ph-map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Map of ${war.name}`}>
        {t.edges.map((e, i) => { const a = pos[e.a]!, b = pos[e.b]!; return <g key={i}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`wr-edge${t.nodes[e.a]!.dark || t.nodes[e.b]!.dark ? ' dark' : ''}`} /><text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 3} className="wr-edge-t">{e.cycles}</text></g>; })}
        {Object.values(t.nodes).map((n) => {
          const p = pos[n.id]!;
          const cls = `wr-node ${n.holder === side ? 'ours' : n.holder ? 'foe' : ''}`;
          const click = () => { if (run && selected && selected.house === world.playerHouseId && !cannotOrder(world, war.id, selected.id, { to: n.id })) run((w) => orderGroup(w, war.id, selected.id, { to: n.id })); };
          return (
            <g key={n.id} className="wr-node-g" onClick={click}>
              {n.kind === 'ground' ? <rect x={p.x - 10} y={p.y - 10} width={20} height={20} className={cls} /> : n.kind === 'station' ? <polygon points={`${p.x},${p.y - 12} ${p.x + 12},${p.y} ${p.x},${p.y + 12} ${p.x - 12},${p.y}`} className={cls} /> : <circle cx={p.x} cy={p.y} r={n.kind === 'orbit' ? 11 : 8} className={cls + (n.dark ? ' dark' : '')} />}
              <text x={p.x} y={p.y - 15} className={`wr-node-t${n.target ? ' target' : ''}`}>{short(n)}</text>
            </g>
          );
        })}
        {fightsNow.map((c) => { const n = nodeByName.get(c.node); if (!n) return null; const p = pos[n.id]!; return <g key={c.node}><circle cx={p.x} cy={p.y} r={22} className={`ph-fight ${c.pOurs >= 0.5 ? 'up' : 'down'}`} /><text x={p.x} y={p.y + 36} className="ph-fight-t">⚔ {pct(c.pOurs)}</text></g>; })}
        {Object.keys(pos).map((id) => {
          const here = tokens.filter((k) => k.at === id).slice(0, 5);
          const p = pos[id]!;
          return here.map((k, i) => (
            <g key={k.id} className="wr-tok-g" onClick={() => setSel?.(k.id)}>
              <rect x={p.x + 15} y={p.y - 8 + i * 14} width={78} height={12} className={`wr-tok ${k.ours ? (k.mine ? 'ours' : 'ally') : 'foe'}${k.fog ? ' stale' : ''}${sel === k.id ? ' on' : ''}`} />
              <text x={p.x + 18} y={p.y + 1.5 + i * 14} className="wr-tok-t">{k.void ? '◇' : '▪'} {k.label.slice(0, 12)}</text>
            </g>
          ));
        })}
      </svg>
      {setCycle && !live ? (
        <div className="ph-slider">
          <label htmlFor="ph-cyc" className="eyebrow">Cycle</label>
          <input id="ph-cyc" type="range" min={0} max={HORIZON} value={cycle} onChange={(e) => setCycle(Number(e.target.value))} />
          <span className="mono">c{cycle}</span>
        </div>
      ) : null}
    </Panel>
  );
}

// ---------------------------------------------------------------- watching it play out

function Watch({ war, t }: { war: War; t: TheatreState }) {
  const world = useWorld();
  const { run } = usePlay();
  const clock = useContext(ClockCtx);
  const side = sideOf(war, world.playerHouseId);
  const at = (absoluteCycle(world.date) % 16) + 1;
  const ph = phaseIndex(world);
  const start = t.feed.findIndex((l) => Math.floor(l.cycle / 16) === ph);
  const lines = (start >= 0 ? t.feed.slice(start) : []).slice(-14).reverse();
  const reports = t.reports.filter((r) => Math.floor(r.cycle / 16) === ph);
  return (
    <div className="ph ph-watch">
      <section className="ph-odds watch">
        <div className="ph-dial">
          <span className="eyebrow">Phase {ph % 5 + 1} · the plan is given{t.phase?.handsOff ? ' · hands off' : ''}</span>
          <b className="ph-big">c{at} / 16</b>
          <span className="ph-meter" aria-hidden="true"><i style={{ width: `${(at / 16) * 100}%` }} /></span>
        </div>
        <div className="ph-facts">
          <div><span className="eyebrow">Fights</span><b>{reports.length}</b></div>
          <div><span className="eyebrow">Won</span><b className="up">{reports.filter((r) => r.winner === side).length}</b></div>
          <div><span className="eyebrow">Lost</span><b className="down">{reports.filter((r) => r.winner !== side).length}</b></div>
          {FORECAST_GOODS.map((g) => <div key={g}><span className="eyebrow">{RESOURCE_LABEL[g]}</span><b>{fmt(econ(world, world.playerHouseId).stock[g])}</b></div>)}
        </div>
        <div className="ph-commit">
          <div className="ph-btns">
            {clock ? <button type="button" className="btn primary" onClick={() => clock.setRunning(!clock.running)}>{clock.running ? 'Pause ❚❚' : 'Watch ▸'}</button> : null}
            <button type="button" className="btn" onClick={() => run((w) => { const x = structuredClone(w); const tt = theatreOf(x.war!.wars.find((y) => y.id === war.id)!)!; tt.phase = { ...(tt.phase ?? {}), committed: undefined, asked: phaseIndex(x) }; return x; })}>Change the plan</button>
          </div>
          <span className="muted" style={{ fontSize: 12 }}>The clock stops at the next Phase for a new plan, or for a battle you fight yourself.</span>
        </div>
      </section>
      <div className="ph-two wide">
        <div className="ph-col"><PhaseMap war={war} t={t} side={side} cycle={at} live /></div>
        <div className="ph-col side">
          <Panel title="As it happens" aside={`${lines.length} lines`}>
            <div className="body wr-feed">{lines.map((l, i) => <div key={i} className={l.big ? 'big' : ''}><span className="mono muted">c{l.cycle % 16}</span> <span className={l.side ? (l.side === side ? 'up' : 'down') : ''}>{l.text}</span></div>)}</div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
