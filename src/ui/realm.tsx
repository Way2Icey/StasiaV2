// The houses as players (aims, alliances, feuds, the Numarade's favour, poaching), renown, veterans, and
// the lane watch, embargo and convoy-intelligence panels.
import { useState } from 'react';
import { useGame, useWorld } from './context';
import { Go, HouseLink, Panel, PersonById, PersonLink } from './links';
import { bar } from './hall';
import { relation } from '../sim/relations';
import {
  AIM_LABEL, allied, alliesOf, answerAlliance, cannotAlly, cannotMakePeace, cannotPoach, endAlliance, favourOf, favourWord, feuding, makePeace,
  poach, poachable, poachOdds, POACH_APPROACH, privilegeOf, proposeAlliance, REPARATIONS,
} from '../sim/houses';
import { cannotEmbargo, cannotTip, cannotWatch, declareEmbargo, embargoed, endWatch, freeWatchShips, knownRivalConvoys, liftEmbargo, startWatch, TIP_CUT, tipOff, WATCH_UPKEEP, watchOf, type WatchStance } from '../sim/lanewatch';
import { compactOf, convoyLabel, laneName, LANE_BY_ID, LANES, placeName } from '../sim/lanes';
import { renownTable, renownRow } from '../sim/renown';
import { idleVeterans, isVeteran, letRest, postsFor } from '../sim/veterans';
import { huntersFree } from '../sim/companies';
import { absoluteCycle } from '../sim/time';
import { RESOURCE_LABEL } from '../data/economy';
import type { World } from '../sim/types';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function usePlay() {
  const game = useGame();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: (w: World) => World) => game.update((w) => { try { setErr(null); return fn(w); } catch (e) { setErr((e as Error).message); return w; } });
  return { run, err };
}

// ---------------------------------------------------------------- houses

/** Every house at a glance: what they are after, who stands with whom, and the Numarade's eye. */
export function HousesOverview({ className }: { className?: string }) {
  const world = useWorld();
  const P = world.playerHouseId;
  const { run } = usePlay();
  const offers = world.realm?.offers ?? [];
  return (
    <Panel title="The houses as players" aside="aims, pacts, feuds and the Numarade's favour" className={className}>
      <div className="table-wrap">
        <table className="ctable">
          <thead><tr><th>HOUSE</th><th>THEY THINK OF US</th><th>AFTER</th><th>WITH US</th><th>ALLIES</th><th>NUMARADE</th></tr></thead>
          <tbody>
            {Object.values(world.houses).map((h) => {
              const aim = world.realm?.aims[h.id];
              const fav = favourOf(world, h.id);
              const pr = privilegeOf(world, h.id);
              return (
                <tr key={h.id}>
                  <td><HouseLink id={h.id} />{h.id === P ? <span className="muted"> (us)</span> : null}</td>
                  <td className="mono">{h.id === P ? '' : Math.round(relation(world, h.id, P))}</td>
                  <td>{h.id === P ? '' : aim?.known ? <>{AIM_LABEL[aim.kind]}{aim.target ? <> · <HouseLink id={aim.target} /></> : null}</> : <span className="muted">unknown</span>}</td>
                  <td>{h.id === P ? '' : allied(world, P, h.id) ? 'Allied' : feuding(world, P, h.id) ? 'IN FEUD' : compactOf(world, P, h.id) ? 'Compact' : embargoed(world, P, h.id) ? 'We embargo them' : embargoed(world, h.id, P) ? 'They embargo us' : '·'}</td>
                  <td>{alliesOf(world, h.id).map((a, i) => <span key={a}>{i ? ', ' : ''}<HouseLink id={a} /></span>)}</td>
                  <td className="mono" title={favourWord(fav)}>{bar(fav / 100)} {Math.round(fav)}{pr ? ` · ${pr}` : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {offers.map((o) => (
        <div key={o.id} className="row">
          <span style={{ flex: 1 }}><HouseLink id={o.from} /> offers us an alliance.</span>
          <button type="button" className="btn small primary" onClick={() => run((w) => answerAlliance(w, o.id, true))}>Accept</button>
          <button type="button" className="btn small" onClick={() => run((w) => answerAlliance(w, o.id, false))}>Decline</button>
        </div>
      ))}
      <p className="body muted" style={{ margin: '6px 0 0', fontSize: 12 }}>Aims show once our Spymaster learns them. Allies guard each other's convoys and keep out of each other's way; a feud means their people treat ours as enemies. The Numarade's favour sets our quota, and at the extremes brings a year's privilege or a censure.</p>
    </Panel>
  );
}

/** Our dealings with one house: alliance, feud, embargo. */
export function HouseDealings({ id, className }: { id: string; className?: string }) {
  const world = useWorld();
  const P = world.playerHouseId;
  const { run, err } = usePlay();
  if (id === P) return null;
  const aim = world.realm?.aims[id];
  const ally = cannotAlly(world, id);
  const peace = cannotMakePeace(world, id);
  const emb = cannotEmbargo(world, id);
  return (
    <Panel title="Between our houses" aside={allied(world, P, id) ? 'allies' : feuding(world, P, id) ? 'in feud' : `regard ${Math.round(relation(world, id, P))}`} className={className}>
      {err ? <p className="body error">{err}</p> : null}
      <p className="body" style={{ margin: 0 }}>{aim?.known ? <>They are after <strong>{AIM_LABEL[aim.kind].toLowerCase()}</strong>{aim.target ? <> ({aim.target === P ? 'us' : <HouseLink id={aim.target} />})</> : null}.</> : 'We do not know what they are after.'} The Numarade thinks them {favourWord(favourOf(world, id))}.</p>
      <div className="actions">
        {allied(world, P, id)
          ? <button type="button" className="btn small" onClick={() => run((w) => endAlliance(w, id))}>End the alliance</button>
          : <button type="button" className="btn small primary" disabled={!!ally} title={ally ?? ''} onClick={() => run((w) => proposeAlliance(w, id))}>Propose an alliance</button>}
        {feuding(world, P, id) ? <button type="button" className="btn small" disabled={!!peace} title={peace ?? ''} onClick={() => run((w) => makePeace(w, id))}>Offer reparations · {fmt(REPARATIONS)}</button> : null}
        {embargoed(world, P, id)
          ? <button type="button" className="btn small" onClick={() => run((w) => liftEmbargo(w, id))}>Lift our embargo</button>
          : <button type="button" className="btn small" disabled={!!emb} title={emb ?? ''} onClick={() => run((w) => declareEmbargo(w, id))}>Declare an embargo</button>}
        <Go to={{ kind: 'lanes' }} className="btn small">Compacts and lanes ›</Go>
      </div>
    </Panel>
  );
}

/** Rival fighters we could try to bring over. */
export function PoachPanel({ className }: { className?: string }) {
  const world = useWorld();
  const { run, err } = usePlay();
  const [purse, setPurse] = useState(2000);
  const list = poachable(world).slice(0, 10);
  return (
    <Panel title="Bring over a rival's fighter" aside={`approach ${fmt(POACH_APPROACH)} · purse only if they come`} className={className}>
      {err ? <p className="body error">{err}</p> : null}
      <div className="actions" style={{ fontSize: 12 }}>
        <span className="muted">Purse offered:</span>
        {[0, 2000, 5000, 10000].map((p) => <button key={p} type="button" className={`btn small${purse === p ? ' primary' : ''}`} onClick={() => setPurse(p)}>{p ? fmt(p) : 'None'}</button>)}
      </div>
      {list.map((c) => {
        const o = poachOdds(world, c.id, purse);
        const why = cannotPoach(world, c.id, purse);
        const rr = renownRow(world, c.id);
        return (
          <div key={c.id} className="row">
            <span style={{ flex: 1 }}><PersonLink c={c} /> <span className="muted">· <HouseLink id={c.houseId} /> · {c.seat ? c.seat : c.role}{rr ? ` · ${rr.tier.toLowerCase()}` : ''} · {Math.round(o.p * 100)}%{o.why.length ? ` (${o.why.join(', ')})` : ''}</span></span>
            <button type="button" className="btn small" disabled={!!why} title={why ?? ''} onClick={() => run((w) => poach(w, c.id, purse))}>Make an offer</button>
          </div>
        );
      })}
      <p className="body muted" style={{ margin: '6px 0 0', fontSize: 12 }}>Someone here they are close to pulls hardest, then our name, a purse, and how unhappy they are at home. Loyal people may tell their lord we tried.</p>
    </Panel>
  );
}

// ---------------------------------------------------------------- renown

export function RenownPage() {
  const world = useWorld();
  const P = world.playerHouseId;
  // Only those with a name worth the word: the rest have not done anything yet.
  const rows = renownTable(world).filter((r) => r.tier !== 'Unknown');
  const ours = rows.filter((r) => world.characters[r.id]?.houseId === P);
  const Table = ({ list }: { list: typeof rows }) => (
    <div className="table-wrap">
      <table className="ctable">
        <thead><tr><th>#</th><th>NAME</th><th>HOUSE</th><th>RENOWN</th><th>TIER</th><th>IN HOUSE</th></tr></thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.id}>
              <td className="mono">{r.rankAll}</td>
              <td><PersonById id={r.id} /></td>
              <td><HouseLink id={world.characters[r.id]!.houseId} /></td>
              <td className="mono">{bar(Math.min(1, r.renown / 160))} {r.renown}</td>
              <td>{r.tier}</td>
              <td className="mono">{r.rankHouse}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <>
      <div className="page-title">
        <h2>Renown</h2>
        <p>What people are known for: titles, bouts and duels won, Crucible honours, missions, raids beaten off, captains hunted, pupils taught. Recent deeds count most; a famous house lends its people a little of its name.</p>
      </div>
      <div className="grid">
        <Panel title="Across the houses" aside={`${rows.length} with a name`} className="span-7"><Table list={rows.slice(0, 25)} /></Panel>
        <Panel title="Ours" aside={`${ours.length} with a name`} className="span-5"><Table list={ours.slice(0, 20)} /></Panel>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- veterans

export function VeteransPanel({ className }: { className?: string }) {
  const world = useWorld();
  const { run, err } = usePlay();
  const vets = Object.values(world.characters).filter((c) => c.houseId === world.playerHouseId && isVeteran(c));
  if (!vets.length) return null;
  const idle = new Set(idleVeterans(world).map((c) => c.id));
  return (
    <Panel title="Veterans" aside={`${vets.length} retired · ${idle.size} without a post`} className={className}>
      {err ? <p className="body error">{err}</p> : null}
      {vets.map((c) => {
        const post = c.seat ? c.seat : c.flags.find((f) => f.id === 'veteranPost')?.detail ?? (c.flags.some((f) => f.id === 'rested') ? 'resting' : '');
        return (
          <div key={c.id} className="stack" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
            <div className="row" style={{ border: 0 }}><span style={{ flex: 1 }}><PersonLink c={c} /> <span className="muted">· {post || 'no post yet'}</span></span></div>
            {idle.has(c.id) ? (
              <div className="actions">
                {postsFor(world, c).map((p) => <button key={p.key} type="button" className="btn small" title={p.why} onClick={() => run(p.run)}>{p.label}</button>)}
                <button type="button" className="btn small" onClick={() => run((w) => letRest(w, c.id))}>Let them rest</button>
              </div>
            ) : null}
          </div>
        );
      })}
      <p className="body muted" style={{ margin: '6px 0 0', fontSize: 12 }}>Old knights make elders, Speakers, Grand Masters, academy heads, garrison commanders and tutors. A veteran teaches arms better than anyone.</p>
    </Panel>
  );
}

// ---------------------------------------------------------------- lanes: watches, intelligence, terms

export function WatchPanel({ className }: { className?: string }) {
  const world = useWorld();
  const { run, err } = usePlay();
  const P = world.playerHouseId;
  const mine = watchOf(world);
  const others = (world.lanes?.watches ?? []).filter((w) => w.house !== P);
  const leaders = huntersFree(world);
  const ships = freeWatchShips(world);
  const [lane, setLane] = useState(LANES[0]!.id);
  const [leader, setLeader] = useState(leaders[0] ?? '');
  const [picked, setPicked] = useState<string[]>(ships.slice(0, 1));
  const [stance, setStance] = useState<WatchStance>('secure');
  const chosen = picked.filter((id) => ships.includes(id));
  const why = cannotWatch(world, lane, leader, chosen);
  return (
    <Panel title="Lane watches" aside={`${mine.length} of ours · upkeep each Phase`} className={className}>
      {err ? <p className="body error">{err}</p> : null}
      {mine.map((w) => (
        <div key={w.id} className="row">
          <span style={{ flex: 1 }}>{w.stance === 'blockade' ? 'Blockading' : 'Securing'} the {laneName(world, LANE_BY_ID[w.lane]!)} lane <span className="muted">· <PersonById id={w.leaderId} /> with {w.shipIds.map((id) => world.fleet.ships[id]?.name).join(', ')} · {fmt(WATCH_UPKEEP(w.shipIds.length))}/Phase{w.stopped ? ` · ${w.stopped} stopped` : ''}</span></span>
          <button type="button" className="btn small" onClick={() => run((x) => endWatch(x, w.id))}>Call home</button>
        </div>
      ))}
      {others.map((w) => (
        <div key={w.id} className="row muted"><span style={{ flex: 1 }}><HouseLink id={w.house} /> {w.stance === 'blockade' ? 'blockades' : 'secures'} the {laneName(world, LANE_BY_ID[w.lane]!)} lane</span></div>
      ))}
      <div className="stack" style={{ gap: 6, marginTop: 8 }}>
        <div className="actions">
          <select className="text" value={lane} onChange={(e) => setLane(e.target.value)} style={{ width: 'auto' }}>
            {LANES.map((l) => <option key={l.id} value={l.id}>{laneName(world, l)}</option>)}
          </select>
          <select className="text" value={leader} onChange={(e) => setLeader(e.target.value)} style={{ width: 'auto' }}>
            {leaders.length === 0 ? <option value="">No knight free</option> : null}
            {leaders.map((id) => <option key={id} value={id}>{world.characters[id]!.name.given} {world.characters[id]!.name.family ?? ''}</option>)}
          </select>
          {(['secure', 'blockade'] as WatchStance[]).map((s) => <button key={s} type="button" className={`btn small${stance === s ? ' primary' : ''}`} onClick={() => setStance(s)}>{s === 'secure' ? 'Secure it' : 'Blockade it'}</button>)}
        </div>
        <div className="actions" style={{ fontSize: 12 }}>
          <span className="muted">Ships:</span>
          {ships.length === 0 ? <span className="muted">none free</span> : null}
          {ships.map((id) => (
            <label key={id} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              <input type="checkbox" checked={chosen.includes(id)} onChange={(e) => setPicked((xs) => (e.target.checked ? [...xs, id] : xs.filter((y) => y !== id)))} />{world.fleet.ships[id]!.name}
            </label>
          ))}
        </div>
        <div className="actions">
          <button type="button" className="btn small primary" disabled={!!why} title={why ?? ''} onClick={() => run((w) => startWatch(w, lane, leader, chosen, stance))}>{why ?? `Send them · ${fmt(WATCH_UPKEEP(chosen.length))} a Phase`}</button>
        </div>
      </div>
      <p className="body muted" style={{ margin: '6px 0 0', fontSize: 12 }}>Securing a lane makes our runs and our allies' far safer and quiets our sectors. Blockading it also stops other houses' convoys and takes the cargo, and every house that is not our friend resents it.</p>
    </Panel>
  );
}

export function KnownConvoysPanel({ className }: { className?: string }) {
  const world = useWorld();
  const { run, err } = usePlay();
  const P = world.playerHouseId;
  const list = knownRivalConvoys(world).slice(0, 10);
  const friends = Object.values(world.lanes?.factions ?? {}).filter((f) => (f.rel[P] ?? 0) >= 20 && !f.hostile?.includes(P));
  const now = absoluteCycle(world.date);
  return (
    <Panel title="Rival convoys we know of" aside="from the Spymaster's people" className={className}>
      {err ? <p className="body error">{err}</p> : null}
      {list.length === 0 ? <p className="body muted" style={{ margin: 0 }}>Nothing just now. A sharper Spymaster, a fixer on our side or a turned captain hears of more.</p> : null}
      {list.map((c) => (
        <div key={c.id} className="row">
          <span style={{ flex: 1 }}>{cap(convoyLabel(world, c))} <span className="muted">· ~{fmt(c.value)} othes{c.good && c.kind !== 'smuggle' ? ` of ${RESOURCE_LABEL[c.good].toLowerCase()}` : ''} · {placeName(world, c.from)} → {placeName(world, c.to)} · {c.escort ? 'escorted' : 'no escort'} · {Math.max(0, absoluteCycle(c.arrives) - now)}cy{c.tipped ? ' · word passed on' : ''}</span></span>
          {!c.tipped ? friends.map((f) => {
            const why = cannotTip(world, c.id, f.id);
            return <button key={f.id} type="button" className="btn small" disabled={!!why} title={why ?? `They are far likelier to find it; ${Math.round(TIP_CUT * 100)}% of it is ours`} onClick={() => run((w) => tipOff(w, c.id, f.id))}>Tell {f.name.replace(/^the /, '')}</button>;
          }) : null}
        </div>
      ))}
      <p className="body muted" style={{ margin: '6px 0 0', fontSize: 12 }}>Tell a company that trusts us where a run will be and they will likely take it, and send us a fifth. If it is traced back, our honour and the Numarade's favour pay for it.</p>
    </Panel>
  );
}

export function TradeTermsPanel({ className }: { className?: string }) {
  const world = useWorld();
  const { run, err } = usePlay();
  const P = world.playerHouseId;
  return (
    <Panel title="Embargoes" aside="the opposite of a compact" className={className}>
      {err ? <p className="body error">{err}</p> : null}
      {Object.keys(world.houses).filter((h) => h !== P).map((h) => {
        const ours = embargoed(world, P, h);
        const theirs = embargoed(world, h, P);
        const why = cannotEmbargo(world, h);
        return (
          <div key={h} className="row">
            <span style={{ flex: 1 }}><HouseLink id={h} /> <span className="muted">· {ours ? 'we embargo them' : 'open'}{theirs ? ' · they embargo us' : ''}</span></span>
            {ours ? <button type="button" className="btn small" onClick={() => run((w) => liftEmbargo(w, h))}>Lift</button>
              : <button type="button" className="btn small" disabled={!!why} title={why ?? ''} onClick={() => run((w) => declareEmbargo(w, h))}>Declare</button>}
          </div>
        );
      })}
      <p className="body muted" style={{ margin: '6px 0 0', fontSize: 12 }}>An embargo ends any compact, makes everything they buy at the Exchange dearer, and makes the other houses take sides. Each one in force against a house adds to its prices.</p>
    </Panel>
  );
}
