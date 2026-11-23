// Embassies: ours abroad and theirs at our court.
import { useState } from 'react';
import { useGame, useWorld } from './context';
import { HouseLink, Panel, PersonById, PersonLink } from './links';
import { appointAmbassador, cannotAppoint, embassy, expelAmbassador } from '../sim/embassies';
import { relation } from '../sim/relations';
import { isAway } from '../sim/court';
import { formatDate } from '../sim/time';
import type { World } from '../sim/types';

function usePlay() {
  const game = useGame();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: (w: World) => World) => game.update((w) => { try { setErr(null); return fn(w); } catch (e) { setErr((e as Error).message); return w; } });
  return { run, err };
}

/** On another house's page: our embassy in their capital, and theirs in ours. */
export function EmbassyPanel({ houseId, className }: { houseId: string; className?: string }) {
  const world = useWorld();
  const { run, err } = usePlay();
  const P = world.playerHouseId;
  const [pick, setPick] = useState('');
  if (houseId === P) return <OurCourtEmbassies className={className} />;
  const ours = embassy(world, houseId, P);
  const theirs = embassy(world, P, houseId);
  const amb = ours?.ambassadorId ? world.characters[ours.ambassadorId] : undefined;
  const them = theirs?.ambassadorId ? world.characters[theirs.ambassadorId] : undefined;
  const people = Object.values(world.characters).filter((c) => c.alive && c.houseId === P && c.tier === 'full' && !c.seat && !isAway(world, c.id))
    .sort((a, b) => b.stats.diplomacy + b.stats.eloquence - a.stats.diplomacy - a.stats.eloquence);
  const why = pick ? cannotAppoint(world, houseId, pick) : 'Choose who to send first';
  return (
    <Panel title="Embassies" aside={`regard ${relation(world, houseId, P)}`} className={className}>
      <p className="body muted" style={{ margin: 0 }}>Every house keeps an embassy in every other capital. An ambassador learns about the host's council each Phase and, if they have the tongue for it, warms the host toward their house. A clumsy one does the opposite. Embassies empty themselves when regard falls below −60.</p>
      <dl className="kv body">
        <dt>Ours, at their capital</dt>
        <dd>{amb ? <><PersonLink c={amb} /> <span className="muted">· diplomacy {amb.stats.diplomacy} · since {ours?.since ? formatDate(ours.since) : '—'}</span> <button type="button" className="btn small" onClick={() => run((w) => appointAmbassador(w, houseId, null))}>Recall</button></> : <span className="muted">empty</span>}</dd>
        <dt>Theirs, at our court</dt>
        <dd>{them ? <><PersonLink c={them} /> <button type="button" className="btn small" title={`Regard −15, dread +1`} onClick={() => run((w) => expelAmbassador(w, houseId))}>Expel</button></> : <span className="muted">empty</span>}</dd>
      </dl>
      <div className="body" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <select className="select" aria-label="Ambassador" value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">{amb ? 'Replace with…' : 'Send an ambassador…'}</option>
          {people.map((c) => <option key={c.id} value={c.id}>{c.name.given} {c.name.family ?? ''} · diplomacy {c.stats.diplomacy} · eloquence {c.stats.eloquence}</option>)}
        </select>
        <button type="button" className="btn small primary" disabled={!!why} title={why ?? undefined} onClick={() => { run((w) => appointAmbassador(w, houseId, pick)); setPick(''); }}>{why ?? 'Appoint'}</button>
      </div>
      {err ? <p className="error body" style={{ margin: 0 }}>{err}</p> : null}
    </Panel>
  );
}

/** Our own house page, and our capital: every foreign embassy here and every one of ours abroad. */
export function OurCourtEmbassies({ className }: { className?: string }) {
  const world = useWorld();
  const P = world.playerHouseId;
  const others = Object.keys(world.houses).filter((h) => h !== P);
  return (
    <Panel title="Embassies" aside="at our court · ours abroad" className={className}>
      <div className="table-wrap">
        <table className="ctable">
          <thead><tr><th>HOUSE</th><th>THEIR AMBASSADOR HERE</th><th>OURS THERE</th></tr></thead>
          <tbody>
            {others.map((h) => (
              <tr key={h}>
                <td><HouseLink id={h} /></td>
                <td>{embassy(world, P, h)?.ambassadorId ? <PersonById id={embassy(world, P, h)!.ambassadorId} /> : <span className="muted">empty</span>}</td>
                <td>{embassy(world, h, P)?.ambassadorId ? <PersonById id={embassy(world, h, P)!.ambassadorId} /> : <span className="muted">empty</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="body muted" style={{ margin: 0, fontSize: 12 }}>Open a house's page to send or recall an ambassador, or to expel theirs.</p>
    </Panel>
  );
}
