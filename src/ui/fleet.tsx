// Great ships: the fleet list, a ship's own page, and ships at a world.
import { useState } from 'react';
import { useGame, useWorld } from './context';
import { Go, HouseLink, Panel, PersonLink, SectorLink } from './links';
import {
  CAPITAL_CLASSES, cannotCommission, commission, DUTY_LABEL, DUTY_NOTE, mainPortOf, moodWord, powerOf, renameShip, setCaptain, setDuty, shipsOf, upkeepOf,
  type CapitalClass, type CapitalShip, type Duty,
} from '../sim/fleet';
import { buildCost, cannotFit, fitModule, MODULE_LABEL, upgradeModule, type ModuleKind } from '../sim/holdings';
import { findSector } from '../sim/query';
import { heldSectors as heldSectorsOf } from '../sim/economy';
import { isAway } from '../sim/court';
import { formatDate } from '../sim/time';
import { relation } from '../sim/relations';
import type { World } from '../sim/types';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
function bar(v: number, w = 12): string { const n = Math.max(0, Math.min(w, Math.round((v / 100) * w))); return '█'.repeat(n) + '░'.repeat(w - n); }

function usePlay() {
  const game = useGame();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: (w: World) => World) => game.update((w) => { try { setErr(null); return fn(w); } catch (e) { setErr((e as Error).message); return w; } });
  return { run, err };
}

function where(world: World, s: CapitalShip): string {
  const f = findSector(world, s.sectorId);
  if (s.ready) return `building at ${f?.sector.name ?? '?'}`;
  if (s.arrives) return `under way to ${f?.planet.name ?? '?'}, arriving ${formatDate(s.arrives)}`;
  return `${f?.sector.name ?? '?'}, ${f?.planet.name ?? '?'}`;
}

export function ShipLink({ s }: { s: CapitalShip }) {
  return <Go to={{ kind: 'ship', id: s.id }}>{s.name}</Go>;
}

/** All our great ships, and the means to lay down more. */
export function FleetPanel({ className }: { className?: string }) {
  const world = useWorld();
  const { run, err } = usePlay();
  const P = world.playerHouseId;
  const ours = shipsOf(world, P);
  const [cls, setCls] = useState<CapitalClass>('cruiser');
  const why = cannotCommission(world, cls);
  return (
    <Panel title="Our great ships" aside={`${ours.length} · upkeep ${fmt(ours.reduce((n, s) => n + (s.ready ? 0 : upkeepOf(s)), 0))}/Phase`} className={className}>
      {ours.map((s) => (
        <div key={s.id} className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <span style={{ flex: '1 1 200px' }}>▲ <ShipLink s={s} /> <span className="muted">· {CAPITAL_CLASSES[s.cls].label.toLowerCase()} · {DUTY_LABEL[s.duty].toLowerCase()} · {where(world, s)}</span></span>
          <span className="mono muted">crew {moodWord(s.crewMood)} · power {powerOf(world, s)}</span>
        </div>
      ))}
      <div className="body" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid var(--line)' }}>
        <span className="eyebrow">Lay down a keel</span>
        <select className="select" aria-label="Class" value={cls} onChange={(e) => setCls(e.target.value as CapitalClass)}>
          {(Object.keys(CAPITAL_CLASSES) as CapitalClass[]).map((k) => <option key={k} value={k}>{CAPITAL_CLASSES[k].label} · {fmt(CAPITAL_CLASSES[k].cost)} othes · {CAPITAL_CLASSES[k].components} comp.</option>)}
        </select>
        <button type="button" className="btn small primary" disabled={!!why} title={why ?? undefined} onClick={() => run((w) => commission(w, cls))}>{why ?? 'Commission'}</button>
        <span className="muted" style={{ fontSize: 12 }}>{CAPITAL_CLASSES[cls].note} Two Orbits in the yards; {fmt(CAPITAL_CLASSES[cls].upkeep)} othes a Phase to keep.</span>
      </div>
      {err ? <p className="error body" style={{ margin: 0 }}>{err}</p> : null}
    </Panel>
  );
}

/** Great ships at a world, for the star map. */
export function ShipsAt({ planetId }: { planetId: string }) {
  const world = useWorld();
  const here = Object.values(world.fleet?.ships ?? {}).filter((s) => !s.lost && !s.ready && !s.arrives && findSector(world, s.sectorId)?.planet.id === planetId);
  if (!here.length) return null;
  return (
    <div style={{ borderTop: '1px solid var(--line-soft)', padding: '6px 14px 8px' }}>
      <div className="eyebrow">Great ships here</div>
      {here.map((s) => <div key={s.id}>{s.houseId === world.playerHouseId ? "▲" : "△"} <ShipLink s={s} /> <span className="muted">· <HouseLink id={s.houseId} /> · {DUTY_LABEL[s.duty].toLowerCase()}</span></div>)}
    </div>
  );
}

export function ShipPage({ id }: { id: string }) {
  const world = useWorld();
  const { run, err } = usePlay();
  const s = world.fleet?.ships[id];
  const [duty, setD] = useState<Duty>(s?.duty ?? 'harbour');
  const [target, setTarget] = useState<string>(s?.target ?? '');
  const [name, setName] = useState('');
  if (!s) return <p className="error">No such ship.</p>;
  const P = world.playerHouseId;
  const ours = s.houseId === P;
  const def = CAPITAL_CLASSES[s.cls];
  const cap = s.captainId ? world.characters[s.captainId] : undefined;
  const people = Object.values(world.characters).filter((c) => c.alive && c.houseId === P && c.tier === 'full' && !c.seat && (!isAway(world, c.id) || c.id === s.captainId))
    .sort((a, b) => b.stats.fleetCommand + b.stats.leadership - (a.stats.fleetCommand + a.stats.leadership));
  const modules = Object.values(world.holdings.modules).filter((m) => m.shipId === s.id);
  const others = Object.values(world.houses).filter((h) => h.id !== P);
  const sectors = heldSectorsOf(world, P);
  const needsTarget = duty === 'show' || duty === 'blockade' || duty === 'patrol';
  return (
    <>
      <div className="page-title">
        <h2>{s.name}</h2>
        <p><HouseLink id={s.houseId} /> · {def.label} · {s.lost ? `lost ${formatDate(s.lost.date)}: ${s.lost.how}` : where(world, s)}</p>
      </div>
      <div className="grid">
        <Panel title="The ship" aside={ours ? `upkeep ${fmt(upkeepOf(s))}/Phase` : 'what we can see'} className="span-6">
          <pre className="ascii body" style={{ margin: 0 }}>{[
            `CLASS     ${def.label.toUpperCase()}`,
            `POWER     ${powerOf(world, s)}`,
            `CREW      ${fmt(s.crew)} of ${fmt(def.crew)}`,
            ...(ours ? [`MOOD      [${bar(s.crewMood)}] ${Math.round(s.crewMood)} ${moodWord(s.crewMood)}`] : []),
            `CONDITION [${bar(s.condition)}] ${Math.round(s.condition)}`,
            `DUTY      ${DUTY_LABEL[s.duty].toUpperCase()}${s.target && world.houses[s.target] ? ` · ${world.houses[s.target]!.name.toUpperCase()}` : ''}`,
            `LAID DOWN ${formatDate(s.built)}`,
          ].join('\n')}</pre>
          <div className="body">Captain: {cap ? <PersonLink c={cap} /> : <span className="muted">none</span>}</div>
          {ours && !s.lost ? (
            <div className="body" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <select className="select" aria-label="Captain" value={s.captainId ?? ''} onChange={(e) => run((w) => setCaptain(w, s.id, e.target.value || null))}>
                <option value="">(no captain)</option>
                {people.map((c) => <option key={c.id} value={c.id}>{c.name.given} {c.name.family ?? ''} · fleet {c.stats.fleetCommand} · lead {c.stats.leadership}</option>)}
              </select>
              <input className="text" placeholder="Rename…" value={name} onChange={(e) => setName(e.target.value)} style={{ width: 180 }} />
              <button type="button" className="btn small" disabled={!name.trim()} onClick={() => { run((w) => renameShip(w, s.id, name)); setName(''); }}>Rename</button>
            </div>
          ) : null}
          <p className="body muted" style={{ margin: 0, fontSize: 12 }}>A captain with leadership keeps the crew's spirits up; fleet command and tactics make the ship fight better. Crews sour in harbour too long or at sea too long, and unpaid crews sour fast. Below 25 they talk of mutiny.</p>
        </Panel>
        {ours && !s.lost && !s.ready ? (
          <Panel title="Orders" aside={DUTY_LABEL[s.duty]} className="span-6">
            <div className="filters body" style={{ paddingBottom: 0 }}>
              {(Object.keys(DUTY_LABEL) as Duty[]).map((d) => <button key={d} type="button" className="pill" aria-pressed={duty === d} onClick={() => { setD(d); setTarget(''); }}>{DUTY_LABEL[d].toUpperCase()}</button>)}
            </div>
            <p className="body muted" style={{ margin: 0 }}>{DUTY_NOTE[duty]}</p>
            <div className="body" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {duty === 'patrol' ? (
                <select className="select" aria-label="Which sector" value={target} onChange={(e) => setTarget(e.target.value)}>
                  <option value="">Sector…</option>
                  {sectors.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              ) : duty === 'show' || duty === 'blockade' ? (
                <select className="select" aria-label="Which house" value={target} onChange={(e) => setTarget(e.target.value)}>
                  <option value="">House…</option>
                  {others.map((h) => <option key={h.id} value={h.id}>House {h.name} · regard {relation(world, h.id, P)}</option>)}
                </select>
              ) : null}
              <button type="button" className="btn small primary" disabled={needsTarget && !target} onClick={() => run((w) => setDuty(w, s.id, duty, target || undefined))}>
                {duty === 'blockade' ? 'Sail and blockade' : duty === 'harbour' ? 'Bring her home' : 'Sail'}
              </button>
            </div>
            {duty === 'blockade' && target ? <p className="body error" style={{ margin: 0 }}>A blockade is an act just short of war. {world.houses[target]?.name}'s regard will fall every Phase, other houses will think less of us, and their ships at {findSector(world, mainPortOf(world, target))?.sector.name} may come out to fight.</p> : null}
          </Panel>
        ) : null}
        {ours && !s.lost ? (
          <Panel title="Fittings" aside={`${modules.length} of ${def.slots} slots`} className="span-6">
            {modules.map((m) => (
              <div key={m.id} className="row" style={{ gap: 8 }}>
                <span style={{ flex: 1 }}>{m.kind === 'cells' ? 'Brig' : m.kind === 'vault' ? 'Strongroom' : MODULE_LABEL[m.kind]} · level {m.level}{m.works ? ` (works to ${m.works.to}, ${formatDate(m.works.done)})` : ''}</span>
                {m.kind !== 'hangar' ? <Go to={{ kind: 'holdings', id: m.id }} className="btn small">Open</Go> : null}
                {!m.works && m.level < 3 && m.level > 0 ? <button type="button" className="btn small" onClick={() => run((w) => upgradeModule(w, m.id))}>Improve · {fmt(buildCost(m.kind, m.level + 1))}</button> : null}
              </div>
            ))}
            <div className="actions body">
              {(['cells', 'vault', 'hangar'] as ModuleKind[]).map((k) => {
                const why = cannotFit(world, k, s.id);
                return <button key={k} type="button" className="btn small" disabled={!!why} title={why ?? undefined} onClick={() => run((w) => fitModule(w, k, s.id))}>Fit {k === 'cells' ? 'a brig' : k === 'vault' ? 'a strongroom' : 'a hangar'} · {fmt(buildCost(k, 1))}</button>;
              })}
            </div>
            <p className="body muted" style={{ margin: 0, fontSize: 12 }}>A brig at sea is hard to break into. A strongroom carries othes beyond any raider's reach. A hangar adds fighter wings.</p>
          </Panel>
        ) : null}
        <Panel title="Where she has been" className="span-6">
          <div className="body"><SectorLink id={s.sectorId} withPlanet /> · <Go to={{ kind: 'log', place: s.sectorId }}>what happened there ›</Go></div>
          {cap ? <div className="body"><Go to={{ kind: 'log', person: cap.id }}>The captain's record ›</Go></div> : null}
          {s.captainId ? null : <div className="body muted">No one has her yet.</div>}
        </Panel>
      </div>
      {err ? <p className="error body">{err}</p> : null}
    </>
  );
}
