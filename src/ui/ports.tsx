// The port authority: traffic, the file on each ship, standing orders and the
// watchlist. Plus the raid warning that sits in the Hall.
import { useState } from 'react';
import { useGame, useNav, useWorld } from './context';
import { Go, HouseLink, Panel, PersonById, PersonLink, PlanetLink } from './links';
import { Term } from './tip';
import { bar } from './hall';
import { findSector } from '../sim/query';
import { absoluteCycle, dateParts, formatDate } from '../sim/time';
import { econ } from '../sim/economy';
import { CRATE_TEXT } from '../data/ships';
import {
  agentAvailable, answerRaid, arrest, BERTHS, boardOf, customsSkill, defenceOf, detainShip, fineShip, flagLabel,
  harbourmaster, inspectShip, openCrate, placeLabel, releaseShip, setAgentOn, setPortOrders, toggleWatch, tributeFor,
  type InspectPolicy, type Ship,
} from '../sim/ports';
import type { World } from '../sim/types';

type Filter = 'all' | 'arriving' | 'leaving' | 'held' | 'flagged';

const flagged = (s: Ship) => s.status === 'held' || s.cargo.some((c) => c.hidden && c.found) || s.aboard.some((a) => a.suspect || a.revealed);

function statusText(world: World, s: Ship): string {
  const now = absoluteCycle(world.date);
  if (s.status === 'inbound') return `INBOUND ${Math.max(0, absoluteCycle(s.arrives) - now)}cy`;
  if (s.status === 'docked') return `DOCKED · BAY ${s.berth}`;
  if (s.status === 'held') return `HELD · BAY ${s.berth}`;
  return s.ours ? 'DEPARTED (ours)' : 'DEPARTED';
}

function when(s: Ship): string {
  const d = s.status === 'departed' ? s.departs ?? s.arrives : s.arrives;
  const p = dateParts(d);
  return `${p.orbit}·${String(p.cycleOfOrbit).padStart(2, "0")}`;
}

export function PortPage({ id, ship: initial }: { id: string; ship?: string }) {
  const world = useWorld();
  const game = useGame();
  const found = findSector(world, id);
  const port = world.ports?.ports[id];
  const all = boardOf(world, id);
  const [filter, setFilter] = useState<Filter>('all');
  const [sel, setSel] = useState<string | undefined>(initial ?? all.find((s) => s.status === 'held')?.id ?? all.find((s) => s.status === 'docked')?.id ?? all[0]?.id);
  if (!found || !port) return <p className="error">This sector has no port of ours.</p>;
  const { planet, sector } = found;
  const list = all.filter((s) => filter === 'all' || (filter === 'arriving' ? s.status === 'inbound' || s.status === 'docked' || s.status === 'held' : filter === 'leaving' ? s.status === 'departed' : filter === 'held' ? s.status === 'held' : flagged(s)));
  const ship = sel ? world.ports.ships[sel] : undefined;
  const hm = harbourmaster(world, id);
  const inPort = all.filter((s) => s.status === 'docked' || s.status === 'held').length;
  const berths = BERTHS[sector.port];
  const tally = port.tally.ships >= port.last.ships ? port.tally : port.last;
  const flags = Object.entries(tally.byFlag).sort((a, b) => b[1] - a[1]);
  const top = Math.max(1, ...flags.map(([, n]) => n));
  const set = (patch: Parameters<typeof setPortOrders>[2]) => game.update((w) => setPortOrders(w, id, patch));
  return (
    <>
      <div className="page-title">
        <h2>{sector.name} · <Term k="port">port authority</Term></h2>
        <p><PlanetLink id={planet.id} /> · {sector.port} · <Go to={{ kind: 'worlds' }}>star map</Go> · <Go to={{ kind: 'sector', id }}>the sector</Go></p>
      </div>
      <div className="grid">
        <Panel title="Traffic board" aside={`${inPort} in port · ${all.filter((s) => s.status === 'inbound').length} inbound`} className="major span-8">
          <div className="filters body" style={{ paddingBottom: 0 }}>
            {(['all', 'arriving', 'leaving', 'held', 'flagged'] as Filter[]).map((f) => (
              <button key={f} type="button" className="pill" aria-pressed={filter === f} onClick={() => setFilter(f)}>{f.toUpperCase()}</button>
            ))}
          </div>
          <div className="table-wrap">
            <table className="ctable board">
              <thead><tr><th>ORB·CYC</th><th>⇅</th><th>SHIP</th><th>CLASS</th><th>FROM / TO</th><th>FLAG</th><th>DECLARED</th><th>STATUS</th></tr></thead>
              <tbody>
                {list.length === 0 ? <tr><td colSpan={8} className="muted">No ships.</td></tr> : null}
                {list.map((s) => (
                  <tr key={s.id} className={`clickable${sel === s.id ? ' sel' : ''}${s.status === 'departed' ? ' gone' : ''}`} onClick={() => setSel(s.id)}>
                    <td>{when(s)}</td>
                    <td>{s.status === 'departed' ? '▲' : '▼'}</td>
                    <td><button type="button" className="linklike" onClick={(e) => { e.stopPropagation(); setSel(s.id); }}>{s.name}</button></td>
                    <td>{s.cls}</td>
                    <td>{s.status === 'departed' ? `→ ${placeLabel(world, s.to)}` : placeLabel(world, s.from)}</td>
                    <td>{flagLabel(world, s.flag).toUpperCase()}</td>
                    <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.declared}</td>
                    <td>{statusText(world, s)}{flagged(s) ? ' !' : ''}{s.aboard.some((a) => a.characterId && world.ports.watch.includes(a.characterId)) ? ' ●' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="body keyhint" style={{ margin: 0, fontSize: 12 }}>▼ arriving · ▲ leaving · ! customs found something · ● someone on your watchlist</p>
        </Panel>

        <div className="span-4 stack">
          {ship ? <Dossier ship={ship} /> : <Panel title="Ship file"><p className="body muted" style={{ margin: 0 }}>Pick a ship from the board.</p></Panel>}
        </div>

        <Panel title="Port status" aside={sector.port} className="span-4">
          <div className="body">
            <pre className="ascii" style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              <span className="dim"><Term k="harbourmaster">harbourmaster</Term>  </span>{hm ? <PersonLink c={hm} /> : 'none'}{'\n'}
              <span className="dim">customs        </span>skill {Math.round(customsSkill(world, id))}{'\n'}
              <span className="dim">berths         </span>{bar(inPort / Math.max(1, berths), 12)} {inPort} / {berths}{'\n'}
              <span className="dim">this phase     </span>{port.tally.ships} ships · {port.tally.tariffs.toLocaleString('en-US')} othes{'\n'}
              <span className="dim">last phase     </span>{port.last.ships} ships · {port.last.tariffs.toLocaleString('en-US')} othes
            </pre>
          </div>
          <div className="body" style={{ borderTop: '1px solid var(--line-soft)', display: 'grid', gap: 8 }}>
            <span className="eyebrow"><Term k="standingOrders">Standing orders</Term></span>
            <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ width: 70 }}>inspect</span>
              <select className="select" value={port.inspect} onChange={(e) => set({ inspect: e.target.value as InspectPolicy })}>
                <option value="none">no one</option>
                <option value="unflagged">unflagged ships</option>
                <option value="rivals">anyone not friendly</option>
                <option value="all">every ship</option>
              </select>
            </label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ width: 70 }}><Term k="tariff">tariff</Term></span>
              <button type="button" className="btn small" aria-label="Lower the tariff" onClick={() => set({ tariff: port.tariff - 1 })}>−</button>
              <span className="mono">{port.tariff}%</span>
              <button type="button" className="btn small" aria-label="Raise the tariff" onClick={() => set({ tariff: port.tariff + 1 })}>+</button>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button type="button" className={`btn small${port.closed ? ' primary' : ''}`} onClick={() => set({ closed: !port.closed })}>{port.closed ? 'REOPEN THE PORT' : 'CLOSE THE PORT'}</button>
              <span className="muted" style={{ fontSize: 12 }}>{port.closed ? 'Closed: no trade, no tariffs, angry docks.' : 'Closing it stops all traffic and raises unrest.'}</span>
            </div>
          </div>
        </Panel>

        <Panel title="By flag" aside={tally === port.tally ? 'this phase' : 'last phase'} className="span-4">
          <div className="body">
            {flags.length === 0 ? <p className="muted" style={{ margin: 0 }}>No ships yet.</p> : null}
            <pre className="ascii" style={{ fontSize: 13, lineHeight: 1.6 }}>
              {flags.map(([f, n]) => `${flagLabel(world, f).toUpperCase().padEnd(10)}${'█'.repeat(Math.round((n / top) * 14)).padEnd(14, '░')} ${String(n).padStart(3)}`).join('\n')}
            </pre>
          </div>
        </Panel>

        <div className="span-4 stack">
          <Watchlist />
          <Panel title="Port log" aside="newest first">
            <div style={{ maxHeight: 240, overflowY: 'auto' }}>
              {world.ports.log.filter((l) => !l.shipId || world.ports.ships[l.shipId]?.sectorId === id || !world.ports.ships[l.shipId]).slice(0, 20).map((l, i) => (
                <div key={i} className="row" style={{ fontSize: 12, alignItems: 'flex-start' }}>
                  <span className="muted" style={{ flexShrink: 0 }}>{formatDate(l.date).replace(/^SY-\d+ · /, '')}</span>
                  <span>{l.shipId && world.ports.ships[l.shipId] ? <button type="button" className="linklike" onClick={() => setSel(l.shipId)}>{l.text}</button> : l.text}</span>
                </div>
              ))}
              {world.ports.log.length === 0 ? <p className="body muted" style={{ margin: 0 }}>Quiet so far.</p> : null}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

function Dossier({ ship }: { ship: Ship }) {
  const world = useWorld();
  const game = useGame();
  const agent = agentAvailable(world);
  const live = ship.status === 'docked' || ship.status === 'held';
  const crate = ship.cargo.find((c) => c.crate && c.found && !c.opened);
  const foundAny = ship.cargo.some((c) => c.hidden && c.found);
  const knownFlag = world.houses[ship.flag];
  return (
    <Panel title={ship.name} aside={statusText(world, ship)} className="major">
      <div className="body">
        <pre className="ascii" style={{ fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
          <span className="dim">registry   </span>{ship.registry}{ship.inspected && ship.forgedRegistry ? <span className="inv"> FALSE </span> : null}{'\n'}
          <span className="dim">class      </span>{ship.cls} · {ship.age} years{'\n'}
          <span className="dim">flag       </span>{knownFlag ? <HouseLink id={ship.flag} /> : flagLabel(world, ship.flag)}{'\n'}
          <span className="dim">captain    </span>{ship.captain}{'\n'}
          <span className="dim">crew       </span>{ship.crew}{ship.passengers ? ` · ${ship.passengers} passengers` : ''}{'\n'}
          <span className="dim">route      </span>{placeLabel(world, ship.from)} ▸ {placeLabel(world, ship.to)}{'\n'}
          {ship.transponderGap ? <><span className="dim">transponder</span> dark for a stretch before arrival{'\n'}</> : null}
          {ship.missionId && world.missions[ship.missionId] && ship.ours ? <><span className="dim">mission    </span><Go to={{ kind: 'mission', id: ship.missionId }}>view ›</Go>{'\n'}</> : null}
        </pre>
      </div>
      <div className="body" style={{ borderTop: '1px solid var(--line-soft)' }}>
        <div className="eyebrow"><Term k="manifest">Manifest</Term></div>
        <pre className="ascii" style={{ fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
          <span className="dim">{'DECLARED'.padEnd(22)}{ship.inspected || foundAny ? 'FOUND' : ''}</span>{'\n'}
          {ship.cargo.filter((c) => !c.hidden || c.found).map((c, i) => (
            <span key={i}>
              {(c.hidden ? '—' : `${c.label} ×${c.qty}`).padEnd(22)}
              {c.hidden ? <span className="inv">{c.crate ? ` sealed crate${c.opened ? ' (opened)' : ''} ` : ` ${c.label} ×${c.qty} UNDECLARED `}</span> : ship.inspected ? `${c.label} ×${c.qty}` : ''}
              {'\n'}
              {c.crate && c.opened ? <span className="dim">{`  ${CRATE_TEXT[c.crate]}`}{'\n'}</span> : null}
            </span>
          ))}
          {ship.cargo.length === 0 ? 'nothing declared\n' : null}
        </pre>
      </div>
      {ship.aboard.length ? (
        <div className="body" style={{ borderTop: '1px solid var(--line-soft)', display: 'grid', gap: 4 }}>
          <div className="eyebrow">Aboard</div>
          {ship.aboard.map((a, i) => {
            const watched = a.characterId && world.ports.watch.includes(a.characterId);
            const showLink = a.characterId && (a.revealed || watched || !a.truth);
            return (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', fontSize: 13 }}>
                <span style={{ fontWeight: 700 }}>{showLink ? <PersonById id={a.characterId} /> : a.name}</span>
                <span className="muted">{a.role}</span>
                <span className={a.suspect ? 'inv' : 'muted'}>{a.suspect ? (a.papers === 'none' ? ' NO PAPERS ' : ' BAD PAPERS ') : a.papers === 'none' ? 'no papers' : 'papers in order'}</span>
                {a.revealed && a.truth ? <span className="inv"> {a.truth === 'spy' ? `SPY · ${world.houses[a.houseId ?? '']?.name ?? '?'}` : a.truth === 'scout' ? 'CORSAIR SCOUT' : `RUNAWAY · ${world.houses[a.houseId ?? '']?.name ?? '?'}`} </span> : null}
                {watched ? <span>● watched</span> : null}
                {a.arrested ? <span className="muted">taken off</span> : live && (a.suspect || a.revealed) ? (
                  <button type="button" className="btn small" onClick={() => game.update((w) => arrest(w, ship.id, i))}>Take them off</button>
                ) : null}
              </div>
            );
          })}
          {ship.crew ? <span className="muted" style={{ fontSize: 12 }}>+{ship.crew} crew, unnamed{agent && !ship.agentChecked ? ' · an agent could find out more' : ''}</span> : null}
        </div>
      ) : null}
      {ship.notes.length ? (
        <div className="body" style={{ borderTop: '1px solid var(--line-soft)', display: 'grid', gap: 4, fontSize: 12 }}>
          {ship.notes.map((n, i) => <span key={i}>› {n}</span>)}
        </div>
      ) : null}
      {!ship.ours && live ? (
        <div className="actions body" style={{ borderTop: '1px solid var(--line-soft)' }}>
          {!ship.inspected ? <button type="button" className="btn small primary" onClick={() => game.update((w) => inspectShip(w, ship.id))}>INSPECT</button> : null}
          {crate ? <button type="button" className="btn small primary" onClick={() => game.update((w) => openCrate(w, ship.id))}>OPEN THE CRATE</button> : null}
          {ship.status === 'docked' ? <button type="button" className="btn small" onClick={() => game.update((w) => detainShip(w, ship.id))}>DETAIN</button> : null}
          {!ship.fined && (ship.status === 'held' || foundAny) ? <button type="button" className="btn small" onClick={() => game.update((w) => fineShip(w, ship.id))}>FINE &amp; RELEASE</button> : null}
          <button type="button" className="btn small" onClick={() => game.update((w) => releaseShip(w, ship.id))}>{ship.status === 'held' ? 'RELEASE' : 'WAVE THROUGH'}</button>
          <button type="button" className="btn small" disabled={!agent || ship.agentChecked} title={!agent ? 'No agent at home. The Spymaster recruits agents from the envoys.' : ship.agentChecked ? 'An agent has already been aboard.' : undefined} onClick={() => game.update((w) => setAgentOn(w, ship.id))}>SET AN AGENT ON IT</button>
        </div>
      ) : null}
    </Panel>
  );
}

export function Watchlist() {
  const world = useWorld();
  const game = useGame();
  const watch = world.ports?.watch ?? [];
  const docked = (id: string) => Object.values(world.ports.ships).find((s) => (s.status === 'docked' || s.status === 'held') && s.aboard.some((a) => a.characterId === id));
  return (
    <Panel title={<Term k="watchlist">Watchlist</Term>} aside="alert when they dock">
      {watch.length === 0 ? <p className="body muted" style={{ margin: 0, fontSize: 12 }}>No one. Add people from their page with “Watch the ports”.</p> : null}
      {watch.map((id) => {
        const s = docked(id);
        return (
          <div key={id} className="row" style={{ fontSize: 13 }}>
            <span>{s ? '●' : ' '}</span>
            <PersonById id={id} />
            <span className="muted" style={{ marginLeft: 'auto' }}>{s ? <Go to={{ kind: 'port', id: s.sectorId, ship: s.id }}>{`DOCKED · ${s.name}`}</Go> : 'not seen'}</span>
            <button type="button" className="btn small" aria-label="Stop watching" onClick={() => game.update((w) => toggleWatch(w, id))}>×</button>
          </div>
        );
      })}
    </Panel>
  );
}

export function WatchButton({ id }: { id: string }) {
  const world = useWorld();
  const game = useGame();
  const on = world.ports?.watch.includes(id);
  return <button type="button" className={`btn${on ? ' primary' : ''}`} aria-pressed={!!on} onClick={() => game.update((w) => toggleWatch(w, id))}>{on ? '● Watching the ports' : 'Watch the ports'}</button>;
}

/** Corsairs on the way: shown in the Hall when one is known. */
export function RaidPanel({ className }: { className?: string }) {
  const world = useWorld();
  const game = useGame();
  const nav = useNav();
  const raids = (world.ports?.raids ?? []).filter((r) => r.status === 'revealed' || (r.status === 'over' && r.result));
  if (!raids.length) return null;
  const othes = econ(world, world.playerHouseId).stock.othes;
  const defence = defenceOf(world);
  return (
    <Panel title={<Term k="raid">Raiders</Term>} aside={`our defence ${defence}`} className={`threat ${className ?? ''}`}>
      {raids.map((r) => {
        const s = findSector(world, r.sectorId)?.sector;
        const left = absoluteCycle(r.arrives) - absoluteCycle(world.date);
        if (r.status === 'over') return <div key={r.id} className="row" style={{ fontSize: 13 }}><span className="muted">{formatDate(r.arrives)}</span><span>{r.result}</span></div>;
        const cost = tributeFor(r);
        return (
          <div key={r.id} className="body" style={{ display: 'grid', gap: 8 }}>
            <span style={{ fontWeight: 700 }}>!! CORSAIRS ──▸ {s?.name.toUpperCase()}   ETA {Math.max(0, left)} CYCLES</span>
            <span className="muted">strength {r.known ? r.strength : `about ${Math.round(r.strength / 10) * 10}`} · our knights at home {defence} · {r.answer === 'muster' ? 'the host is mustered' : r.answer === 'tribute' ? 'tribute paid' : 'no answer given'}</span>
            {!r.answer ? (
              <div className="actions">
                <button type="button" className="btn small primary" onClick={() => game.update((w) => answerRaid(w, r.id, 'muster'))}>MUSTER THE KNIGHTS</button>
                <button type="button" className="btn small" disabled={othes < cost} onClick={() => game.update((w) => answerRaid(w, r.id, 'tribute'))}>PAY TRIBUTE · {cost.toLocaleString('en-US')}</button>
                <button type="button" className="btn small" onClick={() => nav.to({ kind: 'port', id: r.sectorId })}>THE PORT ›</button>
              </div>
            ) : null}
            <span className="muted" style={{ fontSize: 12 }}>Do nothing and only the sector watch stands in their way. Catching their scouts at the docks tells you their strength and weakens them.</span>
          </div>
        );
      })}
    </Panel>
  );
}
