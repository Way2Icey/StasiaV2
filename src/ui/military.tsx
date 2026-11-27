// Arms › Military: how many soldiers the house keeps, where they come from, where they are, and what they cost.
import { crewCount, hullsOf } from '../sim/register';
import { garrisonsOf } from '../sim/garrisons';
import { useState } from 'react';
import { useGame, useWorld } from './context';
import { Panel, SectorLink } from './links';
import { FormationRow } from './war';
import { formationsOf, UNIT_LABEL } from '../sim/war';
import { phaseLedger } from '../sim/economy';
import { equipOf, EQUIP_LABEL, EQUIP_NOTE, setEquip, type EquipLevel } from '../sim/standing';
import { troopsOf } from '../sim/crucible';
import { shipsOf } from '../sim/fleet';
import type { World } from '../sim/types';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export function MilitaryPage({ bare }: { bare?: boolean } = {}) {
  const world = useWorld();
  const game = useGame();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: (w: World) => World) => game.update((w) => { try { setErr(null); return fn(w); } catch (e) { setErr((e as Error).message); return w; } });
  const P = world.playerHouseId;
  const forms = formationsOf(world, P);
  const land = forms.filter((f) => f.kind !== 'fleet');
  const soldiers = land.reduce((t, f) => t + f.strength, 0);
  const full = land.reduce((t, f) => t + f.max, 0);
  const away = land.filter((f) => f.front).reduce((t, f) => t + f.strength, 0);
  const ships = shipsOf(world, P);
  const crews = crewCount(world).total;
  const vessels = ships.length + hullsOf(world).length;
  // Where they come from: every military quarter on our worlds, and what it gives.
  const held = Object.values(world.planets).filter((p) => p.houseId === P).flatMap((p) => p.sectors).filter((s) => s.controllerFamilyId && s.population > 0);
  const people = held.reduce((t, s) => t + s.population, 0) || 1;
  const posts = garrisonsOf(world, P);
  const standing = soldiers + posts.reduce((n, g) => n + g.troops, 0);
  const costs = phaseLedger(world, P).filter((l) => l.resource === 'othes' && (l.kind === 'forces' || l.kind === 'war'));
  const total = costs.reduce((t, l) => t + l.amount, 0);
  const eq = equipOf(world, P);
  return (
    <>
      {bare ? null : (
      <div className="page-title">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="eyebrow">Arms</span>
          <h2>Military</h2>
          <p>The house's soldiers: how many, where they are raised, where they stand now, and what they cost to keep.</p>
        </div>
      </div>
      )}
      {err ? <p className="body error">{err}</p> : null}
      <div className="grid">
        <Panel title="At a glance" className="span-4">
          <dl className="kv body">
            <dt>Soldiers</dt><dd className="mono">{fmt(soldiers)} <span className="muted">in our formations, of {fmt(full)} at full strength</span></dd>
            <dt>In the field</dt><dd className="mono">{fmt(away)}</dd>
            <dt>Garrisons</dt><dd className="mono">{fmt(troopsOf(world, P))} <span className="muted">in {posts.length} garrisons: sectors, stations and outposts</span></dd>
            <dt>Ships' crews</dt><dd className="mono">{fmt(crews)} <span className="muted">on {vessels} vessels, counted apart from the soldiers</span></dd>
            <dt>Cost a Phase</dt><dd className="mono">{fmt(-total)} othes</dd>
          </dl>
        </Panel>
        <Panel title="What they cost" aside="each Phase" className="span-4">
          {costs.length ? costs.map((l, i) => <div key={i} className="row" style={{ fontSize: 13 }}><span style={{ flex: 1 }}>{l.label}</span><span className="mono">{fmt(l.amount)}</span></div>) : <p className="body muted" style={{ margin: 0 }}>Nothing yet.</p>}
          <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
            <span className="eyebrow">How they are armed</span>
            <select className="select" aria-label="Equipment" value={eq} onChange={(e) => run((w) => setEquip(w, Number(e.target.value) as EquipLevel))}>
              {EQUIP_LABEL.map((l, i) => <option key={l} value={i}>{l}</option>)}
            </select>
            <span className="muted">{EQUIP_NOTE[eq]}</span>
          </div>
        </Panel>
        <Panel scroll={300} title="Where they stand" aside={`${fmt(standing)} all told · ${posts.length} garrisons`} className="span-4">
          <div className="row" style={{ fontSize: 13 }}><span style={{ flex: 1 }}><strong>In the field</strong> <span className="muted">· {land.map((f) => f.name).join(', ')}</span></span><span className="mono">{fmt(soldiers)}</span></div>
          {posts.map((g) => (
            <div key={g.id} className="row" style={{ fontSize: 13 }}>
              <span style={{ flex: 1 }}>{g.kind === 'sector' ? <SectorLink id={g.id} withPlanet /> : g.name} <span className="muted">· {g.kind === 'sector' ? (g.name.endsWith(' watch') ? 'the watch' : g.name) : g.kind === 'outpost' ? 'outpost' : 'station'}{g.kind === 'sector' ? ` · ${g.note}` : ''}</span></span>
              <span className="mono">{fmt(g.troops)}</span>
            </div>
          ))}
          <p className="body muted" style={{ margin: 0, fontSize: 11 }}>{fmt(standing)} under arms of {fmt(people)} people ({(standing / people * 100).toFixed(1)}%). Every soldier is somewhere: in the field formations, or holding a sector, a station or an outpost.</p>
        </Panel>
        <Panel title="Where they are" aside={`${forms.length} formations · ${land.length} on the ground`} className="span-12">
          <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {forms.length === 0 ? <span className="muted">No formations raised.</span> : null}
            {forms.map((f) => <FormationRow key={f.id} f={f} />)}
            <span className="muted" style={{ fontSize: 11 }}>Counted in {UNIT_LABEL.legion}, ships and men. Forces at home rebuild a little every Phase; those at a front fight there.</span>
          </div>
        </Panel>
      </div>
    </>
  );
}
