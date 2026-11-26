// Arms › Military: how many soldiers the house keeps, where they come from, where they are, and what they cost.
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

export function MilitaryPage() {
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
  const crews = ships.reduce((t, s) => t + (s.crew ?? 0), 0);
  // Where they come from: every military quarter on our worlds, and what it gives.
  const sources = Object.values(world.planets).filter((p) => p.houseId === P).flatMap((p) => p.sectors.flatMap((s) => (s.quarters ?? []).filter((q) => q.kind === 'Military').map((q) => ({ p, s, q }))));
  const held = Object.values(world.planets).filter((p) => p.houseId === P).flatMap((p) => p.sectors).filter((s) => s.controllerFamilyId && s.population > 0);
  const people = held.reduce((t, s) => t + s.population, 0) || 1;
  const costs = phaseLedger(world, P).filter((l) => l.resource === 'othes' && (l.kind === 'forces' || l.kind === 'war'));
  const total = costs.reduce((t, l) => t + l.amount, 0);
  const eq = equipOf(world, P);
  return (
    <>
      <div className="page-title">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="eyebrow">Arms</span>
          <h2>Military</h2>
          <p>The house's soldiers: how many, where they are raised, where they stand now, and what they cost to keep.</p>
        </div>
      </div>
      {err ? <p className="body error">{err}</p> : null}
      <div className="grid">
        <Panel title="At a glance" className="span-4">
          <dl className="kv body">
            <dt>Soldiers</dt><dd className="mono">{fmt(soldiers)} <span className="muted">of {fmt(full)} at full strength</span></dd>
            <dt>In the field</dt><dd className="mono">{fmt(away)}</dd>
            <dt>Can raise</dt><dd className="mono">{fmt(troopsOf(world, P))} <span className="muted">from our garrisons</span></dd>
            <dt>Ships' crews</dt><dd className="mono">{fmt(crews)} <span className="muted">on {ships.length} ships</span></dd>
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
        <Panel scroll={300} title="Where they come from" aside={sources.length ? `${sources.length} garrison quarters` : `${held.length} sectors`} className="span-4">
          {sources.length === 0 ? <>
            <p className="body muted" style={{ margin: 0, fontSize: 12 }}>No garrison quarters: the legions are levied from our sectors, roughly by their people.</p>
            {held.map((s) => <div key={s.id} className="row" style={{ fontSize: 13 }}><span style={{ flex: 1 }}><SectorLink id={s.id} withPlanet /></span><span className="muted mono">~{fmt(soldiers * s.population / people)}</span></div>)}
          </> : null}
          {sources.map(({ s, q }) => (
            <div key={q.id} className="row" style={{ fontSize: 13 }}><span style={{ flex: 1 }}>{q.name}, <SectorLink id={s.id} withPlanet /></span><span className="muted">{q.gives}</span></div>
          ))}
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
