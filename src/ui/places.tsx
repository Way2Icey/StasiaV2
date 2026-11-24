// The places of the Archon that are not worlds: what we hold, what others hold that we could take, the
// frontier we could claim, the sites of the past, and the landmarks of the canon.
import { useState } from 'react';
import { useGame, useWorld } from './context';
import { Panel, PersonById } from './links';
import { ArchonHouseLink } from './archon';
import { SITE_LABEL, siteDefence, sitesOf, setGarrison, setSiteOverseer, type Site } from '../sim/places';
import { CLAIM_COST, SETTLE_COST, assaultSite, cannotAssault, cannotClaim, cannotExplore, cannotSettle, claimWild, sendExpedition, settleOutpost, shipsFree } from '../sim/arcs_places';
import { atWar } from '../sim/war';
import { powerOf } from '../sim/fleet';
import { CLIMATE_LABEL, HAZARD_LABEL, worthOf } from '../sim/frontier';
import { absoluteCycle } from '../sim/time';
import { displayName } from '../sim/names';
import type { World } from '../sim/types';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const RES: Record<string, string> = { othes: 'othes', metals: 'metals', navisium: 'navisium', components: 'components', provisions: 'provisions' };
const yieldsText = (s: Site) => Object.entries(s.yields).filter(([, v]) => v).map(([k, v]) => `${k === 'othes' ? fmt(v!) : v} ${RES[k]}`).join(', ') || 'nothing';

function usePlay() {
  const game = useGame();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: (w: World) => World) => game.update((w) => { try { setErr(null); return fn(w); } catch (e) { setErr((e as Error).message); return w; } });
  return { run, err };
}

export function PlacesPage() {
  const world = useWorld();
  const { run, err } = usePlay();
  const P = world.playerHouseId;
  const sites = Object.values(world.places?.sites ?? {});
  const ours = sitesOf(world, P);
  const theirs = sites.filter((s) => s.known && s.holdable && s.holder && s.holder !== P);
  const ruins = sites.filter((s) => s.known && s.kind === 'ruin');
  const marks = sites.filter((s) => s.known && (s.kind === 'landmark' || s.kind === 'moving'));
  const people = Object.values(world.characters).filter((c) => c.alive && c.houseId === P && c.tier === 'full' && !c.veiled && !c.seat && c.id !== world.houses[P]!.rulerId)
    .sort((a, b) => b.stats.stewardship + b.stats.perception - a.stats.stewardship - a.stats.perception);
  const wilds = Object.values(world.archon?.frontier ?? {}).filter((x) => !x.claimedBy).sort((a, b) => worthOf(b) - worthOf(a)).slice(0, 10);
  const free = shipsFree(world, P);
  const [pick, setPick] = useState<Record<string, string[]>>({});
  const [who, setWho] = useState<Record<string, string>>({});
  const now = absoluteCycle(world.date);
  return (
    <>
      <div className="page-title">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span className="eyebrow gold">Beyond the worlds</span>
          <h2>Places of the Archon</h2>
          <p>Stations held and stations to take, outposts on the frontier, the sites of the past, and the landmarks every house knows.</p>
        </div>
      </div>
      {err ? <p className="error body">{err}</p> : null}
      <div className="grid">
        <Panel title="Our places" aside={`${ours.length}`} className="span-12">
          {ours.length ? ours.map((s) => {
            const settle = s.kind === 'outpost' ? cannotSettle(world, s.id) : null;
            return (
              <div key={s.id} className="row" style={{ gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <span style={{ flex: '1 1 320px' }}><strong>{s.name}</strong> <span className="muted">· {SITE_LABEL[s.kind].toLowerCase()} · {s.region} · gives {yieldsText(s)} a Phase · garrison {fmt(s.garrison)} · defence {Math.round(siteDefence(world, s))}{s.takenFrom ? ` · taken from House ${world.archon?.houses[s.takenFrom.houseId]?.name ?? s.takenFrom.houseId}, who want it back` : ''}</span></span>
                <select className="select" aria-label="Overseer" value={s.overseerId ?? ''} onChange={(e) => run((w) => setSiteOverseer(w, s.id, e.target.value || null))}>
                  <option value="">(no overseer)</option>
                  {people.map((c) => <option key={c.id} value={c.id}>{displayName(c.name)} · stewardship {c.stats.stewardship}</option>)}
                </select>
                <button type="button" className="btn small" onClick={() => run((w) => setGarrison(w, s.id, s.garrison + 500))}>+500 soldiers</button>
                <button type="button" className="btn small" disabled={s.garrison <= 100} onClick={() => run((w) => setGarrison(w, s.id, s.garrison - 500))}>−500</button>
                {s.kind === 'outpost' ? <button type="button" className="btn small" disabled={!!settle} title={settle ?? undefined} onClick={() => run((w) => settleOutpost(w, s.id))}>{settle ?? `Settle it · ${fmt(SETTLE_COST)}`}</button> : null}
              </div>
            );
          }) : <div className="body muted">The house holds no places beyond its worlds.</div>}
          <p className="body muted" style={{ margin: 0, fontSize: 12 }}>An overseer with stewardship gets more out of a place. Soldiers make it harder to take, and cost to keep. A place taken from a house is a grievance it never forgets.</p>
        </Panel>
        <Panel title="Places others hold" aside={`${theirs.length} known`} className="span-12">
          {theirs.map((s) => {
            const war = atWar(world, P, s.holder!);
            const chosen = pick[s.id] ?? [];
            const why = cannotAssault(world, s.id, chosen);
            const ours2 = chosen.reduce((t, id) => t + powerOf(world, world.fleet.ships[id]!), 0) / 4;
            return (
              <div key={s.id} className="row" style={{ gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <span style={{ flex: '1 1 320px' }}><strong>{s.name}</strong> <span className="muted">· <ArchonHouseLink id={s.holder!} /> · {SITE_LABEL[s.kind].toLowerCase()} · {s.region} · defence {Math.round(siteDefence(world, s))}{s.takenFrom?.houseId === P ? ' · it was ours' : ''}</span></span>
                {war ? (
                  <span className="actions">
                    {free.map((sh) => <button key={sh.id} type="button" className="pill" aria-pressed={chosen.includes(sh.id)} onClick={() => setPick({ ...pick, [s.id]: chosen.includes(sh.id) ? chosen.filter((x) => x !== sh.id) : [...chosen, sh.id] })}>{sh.name} ({powerOf(world, sh)})</button>)}
                    <button type="button" className="btn small primary" disabled={!!why} title={why ?? undefined} onClick={() => run((w) => assaultSite(w, s.id, chosen))}>Assault{chosen.length ? ` · ${Math.round(ours2)} against ${Math.round(siteDefence(world, s))}` : ''}</button>
                  </span>
                ) : <span className="muted" style={{ fontSize: 12 }}>Only in war.</span>}
              </div>
            );
          })}
          <p className="body muted" style={{ margin: 0, fontSize: 12 }}>Ships in harbour and in fair condition can carry troops against a place of a house we are at war with. The better armed the legions, the better they fight aboard.</p>
        </Panel>
        <Panel title="The frontier" aside={`${fmt(CLAIM_COST.othes)} othes · ${CLAIM_COST.components} components an outpost`} className="span-6">
          {wilds.map((x) => {
            const why = cannotClaim(world, x.id);
            return (
              <div key={x.id} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                <span style={{ flex: 1 }}><strong>{x.name}</strong> <span className="muted">· {CLIMATE_LABEL[x.climate].toLowerCase()}{x.kind === 'moon' ? `, a moon of ${x.parent}` : ''} · {x.region} · {HAZARD_LABEL[x.hazard].toLowerCase()}</span></span>
                <button type="button" className="btn small" disabled={!!why} title={why ?? undefined} onClick={() => run((w) => claimWild(w, x.id))}>{why ? 'Claim' : 'Claim'}</button>
              </div>
            );
          })}
          <p className="body muted" style={{ margin: 0, fontSize: 12 }}>An outpost gives what its world has. The frontier sends corsairs, Breakline and worse against it. Held three years, it can be settled into a world of the house.</p>
        </Panel>
        <Panel title="Sites of the past" aside={`${ruins.length} known`} className="span-6">
          {ruins.length ? ruins.map((s) => {
            const away = world.places!.expeditions.find((e) => e.siteId === s.id);
            const p = who[s.id] ?? '';
            const why = p ? cannotExplore(world, s.id, p) : 'Choose who leads it';
            return (
              <div key={s.id} className="row" style={{ gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <span style={{ flex: '1 1 240px' }}><strong>{s.name}</strong> <span className="muted">· {s.region} · {s.note}</span></span>
                {s.explored ? <span className="muted">explored</span> : away ? <span className="muted"><PersonById id={away.personId} /> is there</span> : (
                  <span className="actions">
                    <select className="select" aria-label="Who leads" value={p} onChange={(e) => setWho({ ...who, [s.id]: e.target.value })}>
                      <option value="">Who leads…</option>
                      {people.map((c) => <option key={c.id} value={c.id}>{displayName(c.name)} · perception {c.stats.perception}</option>)}
                    </select>
                    <button type="button" className="btn small" disabled={!!why} title={why ?? undefined} onClick={() => run((w) => sendExpedition(w, s.id, p))}>Send · 3,000</button>
                  </span>
                )}
              </div>
            );
          }) : <div className="body muted">None charted yet. Surveyors bring word of them.</div>}
        </Panel>
        <Panel title="Landmarks" className="span-12">
          {marks.map((s) => (
            <div key={s.id} className="row" style={{ gap: 8 }}>
              <span style={{ flex: 1 }}><strong>{s.name}</strong> <span className="muted">· {s.kind === 'moving' ? (s.sightedUntil && s.sightedUntil > now ? 'sighted now' : 'whereabouts unknown') : s.region}{s.holder ? <> · <ArchonHouseLink id={s.holder} /></> : ''} · {s.note}</span></span>
            </div>
          ))}
        </Panel>
      </div>
    </>
  );
}
