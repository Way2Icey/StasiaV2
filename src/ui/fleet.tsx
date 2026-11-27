// Great ships: the fleet list, a ship's own page, and ships at a world.
import { regardOf } from '../sim/archon';
import { Peek } from './links';
import { useState } from 'react';
import { useGame, useWorld } from './context';
import { Go, HouseLink, Panel, PersonLink, SectorLink } from './links';
import {
  CAPITAL_CLASSES, FITS, buildOrbits, cannotCommission, cannotRefit, commission, conditionCap, hasFit, onSlips, DUTY_LABEL, DUTY_NOTE, mainPortOf, moodWord, powerOf, refit, renameShip,
  retireShip, setCaptain, setDuty, shipAge, shipsOf, stripFit, upkeepOf, type CapitalClass, type CapitalShip, type Duty, type Fit,
} from '../sim/fleet';
import { buildCost, cannotFit, fitModule, MODULE_LABEL, shipSeen, upgradeModule, type Module, type ModuleKind } from '../sim/holdings';
import { findSector } from '../sim/query';
import { heldSectors as heldSectorsOf } from '../sim/economy';
import { isAway } from '../sim/court';
import { formatDate } from '../sim/time';
import type { World } from '../sim/types';
import { busyCarrying, captainOf } from '../sim/register';
import { Manifest } from './register';

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
  return <Peek t={{ k: 'ship', id: s.id }}>{s.name}</Peek>;
}

/** All our great ships; new ones are laid down at a shipyard. */
export function FleetPanel({ className }: { className?: string }) {
  const world = useWorld();
  const P = world.playerHouseId;
  const ours = shipsOf(world, P);
  const yards = Object.values(world.holdings?.modules ?? {}).filter((m) => m.kind === 'shipyard' && m.houseId === P);
  return (
    <Panel title="Our great ships" aside={`${ours.length} · upkeep ${fmt(ours.reduce((n, s) => n + (s.ready ? 0 : upkeepOf(s, world)), 0))}/Phase`} className={className}>
      {ours.map((s) => (
        <div key={s.id} className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <span style={{ flex: '1 1 200px' }}>▲ <ShipLink s={s} />{s.epithet ? <span className="gold"> {s.epithet}</span> : null} <span className="muted">· {CAPITAL_CLASSES[s.cls].label.toLowerCase()} · {DUTY_LABEL[s.duty].toLowerCase()} · {where(world, s)}</span></span>
          <span className="mono muted">{s.ready ? 'on the slips' : `crew ${moodWord(s.crewMood)} · power ${powerOf(world, s)}`}</span>
        </div>
      ))}
      <p className="body muted" style={{ margin: 0, fontSize: 12 }}>
        New ships are laid down at a shipyard: {yards.length ? yards.map((y, i) => <span key={y.id}>{i ? ', ' : ''}{y.sectorId ? <SectorLink id={y.sectorId} /> : null}</span>) : 'we have none. Build one in a sector with a spaceport or starport.'}
      </p>
      {world.fleet?.past?.some((x) => x.houseId === P) ? (
        <details className="body"><summary className="muted" style={{ cursor: 'pointer' }}>Ships of the house's past</summary>
          {world.fleet.past.filter((x) => x.houseId === P).map((x, i) => <div key={i} className="row"><span style={{ flex: 1 }}>{x.name}{x.epithet ? `, ${x.epithet}` : ''} <span className="muted">· {CAPITAL_CLASSES[x.cls]?.label.toLowerCase() ?? x.cls} · {x.from}–{x.to}</span></span><span className="muted">{x.how}</span></div>)}
        </details>
      ) : null}
    </Panel>
  );
}

/** The slips of one shipyard: what is building, what is in dock, and the means to lay down a keel. */
export function ShipyardView({ yard }: { yard: Module }) {
  const world = useWorld();
  const { run, err } = usePlay();
  const P = world.playerHouseId;
  const [cls, setCls] = useState<CapitalClass>('cruiser');
  const why = cannotCommission(world, cls, yard.id);
  const slips = onSlips(world, yard);
  const docked = Object.values(world.fleet?.ships ?? {}).filter((s) => !s.lost && !s.ready && !s.arrives && s.sectorId === yard.sectorId && s.houseId === P);
  return (
    <Panel title="The slips" aside={`${slips.length} of ${yard.level} building · ${buildOrbits(yard)} Orbits a ship`}>
      {slips.map((s) => <div key={s.id} className="row">▲ <ShipLink s={s} /> <span className="muted">· {CAPITAL_CLASSES[s.cls].label.toLowerCase()} · launches {s.ready ? formatDate(s.ready) : ''}</span></div>)}
      {docked.length ? <div className="body muted" style={{ fontSize: 12 }}>In dock, repairing twice as fast: {docked.map((s, i) => <span key={s.id}>{i ? ', ' : ''}<ShipLink s={s} /> ({Math.round(s.condition)})</span>)}</div> : null}
      <div className="body" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="eyebrow">Lay down a keel</span>
        <select className="select" aria-label="Class" value={cls} onChange={(e) => setCls(e.target.value as CapitalClass)}>
          {(Object.keys(CAPITAL_CLASSES) as CapitalClass[]).map((k) => <option key={k} value={k}>{CAPITAL_CLASSES[k].label} · {fmt(CAPITAL_CLASSES[k].cost)} othes · {CAPITAL_CLASSES[k].components} comp.</option>)}
        </select>
        <button type="button" className="btn small primary" disabled={!!why} title={why ?? undefined} onClick={() => run((w) => commission(w, cls, yard.id))}>{why ?? 'Commission'}</button>
      </div>
      <p className="body muted" style={{ margin: 0, fontSize: 12 }}>{CAPITAL_CLASSES[cls].note} {fmt(CAPITAL_CLASSES[cls].upkeep)} othes a Phase to keep once launched.</p>
      {err ? <p className="error body" style={{ margin: 0 }}>{err}</p> : null}
    </Panel>
  );
}

/** Great ships at a world, for the star map. */
export function ShipsAt({ planetId }: { planetId: string }) {
  const world = useWorld();
  const here = Object.values(world.fleet?.ships ?? {}).filter((s) => !s.lost && !s.ready && !s.arrives && findSector(world, s.sectorId)?.planet.id === planetId && shipSeen(world, world.playerHouseId, s));
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
        <h2>{s.name}{s.epithet ? <span className="gold" style={{ fontSize: '0.7em' }}> {s.epithet}</span> : null}</h2>
        <p><HouseLink id={s.houseId} /> · {def.label}{s.raised ? ` · raised from a wreck of ${s.raised}` : ''} · {s.lost ? `lost ${formatDate(s.lost.date)}: ${s.lost.how}` : where(world, s)}</p>
      </div>
      <div className="grid">
        <Panel title="The ship" aside={ours ? `upkeep ${fmt(upkeepOf(s, world))}/Phase` : 'what we can see'} className="span-6">
          <pre className="ascii body" style={{ margin: 0 }}>{[
            `CLASS     ${def.label.toUpperCase()}`,
            `POWER     ${powerOf(world, s)}`,
            `CREW      ${fmt(s.crew)} of ${fmt(def.crew)}`,
            ...(ours ? [`MOOD      [${bar(s.crewMood)}] ${Math.round(s.crewMood)} ${moodWord(s.crewMood)}`] : []),
            `CONDITION [${bar(s.condition)}] ${Math.round(s.condition)}${conditionCap(world, s) < 100 ? ` (age holds her to ${conditionCap(world, s)})` : ''}`,
            `DUTY      ${DUTY_LABEL[s.duty].toUpperCase()}${s.target && world.houses[s.target] ? ` · ${world.houses[s.target]!.name.toUpperCase()}` : ''}`,
            `LAID DOWN ${formatDate(s.built)} · ${shipAge(world, s)} years`,
            `RENOWN    ${s.renown ?? 0}${s.epithet ? '' : ' (a name at 12)'}`,
          ].join('\n')}</pre>
          <div className="body">Captain: {cap ? <PersonLink c={cap} /> : ours ? <>{captainOf(world, s).name} <span className="muted">· sailing master; name one of the court to command her</span></> : <span className="muted">unknown</span>}</div>
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
          <p className="body muted" style={{ margin: 0, fontSize: 12 }}>A captain with leadership keeps the crew's spirits up; fleet command and tactics make the ship fight better. Crews sour in harbour too long or too long in the void, and unpaid crews sour fast. Below 25 they talk of mutiny.</p>
        </Panel>
        {ours && !s.lost ? <Panel title="Manifest" className="span-6"><div className="body"><Manifest ship={s} here /></div></Panel> : null}
        {ours && !s.lost && !s.ready ? (
          <Panel title="Orders" aside={busyCarrying(world, s.id) ?? DUTY_LABEL[s.duty]} className="span-6">
            {busyCarrying(world, s.id) ? <p className="body gold" style={{ margin: 0 }}>{busyCarrying(world, s.id)}. Give her a duty and they go on in another ship.</p> : null}
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
                  {others.map((h) => <option key={h.id} value={h.id}>House {h.name} · regard {regardOf(world, h.id, P)}</option>)}
                </select>
              ) : null}
              <button type="button" className="btn small primary" disabled={needsTarget && !target} onClick={() => run((w) => setDuty(w, s.id, duty, target || undefined))}>
                {duty === 'blockade' ? 'Go and blockade' : duty === 'harbour' ? 'Bring her home' : 'Send her'}
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
        {ours && !s.lost && !s.ready ? (
          <Panel title="Refits" aside={`${s.fits?.length ?? 0} of ${def.refits}`} className="span-6">
            {(Object.keys(FITS) as Fit[]).map((f) => {
              const why = cannotRefit(world, s.id, f);
              return (
                <div key={f} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ flex: 1 }}><strong>{FITS[f].label}</strong> <span className="muted">· {FITS[f].note} {fmt(FITS[f].upkeep)} a Phase to keep.</span></span>
                  {hasFit(s, f) ? <button type="button" className="btn small" onClick={() => run((w) => stripFit(w, s.id, f))}>Strip</button>
                    : <button type="button" className="btn small" disabled={!!why} title={why ?? undefined} onClick={() => run((w) => refit(w, s.id, f))}>{why ?? `Fit · ${fmt(FITS[f].cost)} · ${FITS[f].components} comp.`}</button>}
                </div>
              );
            })}
            <p className="body muted" style={{ margin: 0, fontSize: 12 }}>Refits are done in harbour at one of our shipyards.</p>
          </Panel>
        ) : null}
        <Panel title="Her record" aside={s.log?.length ? `${s.log.length}` : undefined} className="span-6">
          {s.log?.length ? s.log.map((l, i) => <div key={i} className="row"><span className="mono muted" style={{ minWidth: 40 }}>{l.year}</span><span style={{ flex: 1 }}>{l.text}</span></div>) : <div className="body muted">Nothing yet worth writing down.</div>}
          {ours && !s.lost && !s.ready ? (
            <div className="actions body">
              <button type="button" className="btn small" disabled={s.duty !== 'harbour' || !!s.arrives} onClick={() => run((w) => retireShip(w, s.id, 'honour'))}>Lay her up with honour</button>
              <button type="button" className="btn small" disabled={s.duty !== 'harbour' || !!s.arrives} onClick={() => run((w) => retireShip(w, s.id, 'break'))}>Break her for parts</button>
            </div>
          ) : null}
        </Panel>
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
