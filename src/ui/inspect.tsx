// The inspector: anything in the game (a person, a great ship, a ship at the docks, a place, a relic, a
// world, a sector, a holding, a house) opens as a card over whatever page you are on, never as a page
// that runs off the screen. The card carries what matters and the actions that fit; the full page is one
// click away for when you want everything.
import { useEffect, useState, type ReactNode } from 'react';
import { useGame, useNav, usePersonMenu, useWorld } from './context';
import { displayName } from '../sim/names';
import { ageOf } from '../sim/characters';
import { SPECIES } from '../data/species';
import { traitLabel } from '../data/traits';
import { FLAGS_BY_ID } from '../data/flags';
import { STAT_LABEL } from '../sim/careers';
import { CAPITAL_CLASSES, FITS, conditionCap, moodWord, powerOf, shipAge, upkeepOf, DUTY_LABEL } from '../sim/fleet';
import { MODULE_LABEL, MODULE_NOTE, OVERSEER_TITLE } from '../sim/holdings';
import { SITE_LABEL, setGarrison, setSiteOverseer, siteDefence } from '../sim/places';
import { SETTLE_COST, assaultSite, cannotAssault, cannotExplore, cannotSettle, sendExpedition, settleOutpost, shipsFree } from '../sim/arcs_places';
import { atWar } from '../sim/war';
import { ensureLegacy, readRelic } from '../sim/legacy';
import { findSector } from '../sim/query';
import { formatDate } from '../sim/time';
import { envyOf, envyWord } from '../sim/envy';
import { capitalDiagram, planetDiagram, portShipDiagram, relicDiagram, siteDiagram } from './diagrams';
import { seenBy } from './fog';
import { Portrait } from './portrait';
import { DeedsLine } from './legacy';
import type { Route } from './router';
import type { World } from '../sim/types';

export type { Inspect } from './context';
import { useInspect, type Inspect } from './context';
export { useInspect };

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const bar = (v: number, n = 12) => '█'.repeat(Math.round((Math.max(0, Math.min(100, v)) / 100) * n)).padEnd(n, '░');

/** A link that opens the inspector rather than leaving the page. */
export function Peek({ t, children, className }: { t: Inspect; children: ReactNode; className?: string }) {
  const ins = useInspect();
  return <button type="button" className={className ?? 'linklike'} onClick={(e) => { e.stopPropagation(); ins.open(t); }}>{children}</button>;
}

/** The layer: a card over the page, a trail of what was opened from it, Escape or a click outside to close. */
export function InspectLayer({ stack, onBack, onClose, portShip }: { stack: Inspect[]; onBack: () => void; onClose: () => void; portShip: (id: string) => ReactNode }) {
  const t = stack[stack.length - 1];
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [onClose]);
  if (!t) return null;
  return (
    <div className="inspect-veil" onClick={onClose} role="presentation">
      <div className="inspect" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="inspect-bar">
          {stack.length > 1 ? <button type="button" className="btn small" onClick={onBack}>‹ back</button> : null}
          <span className="eyebrow" style={{ flex: 1 }}>{({ person: 'Person', ship: 'Great ship', portShip: 'Ship at the docks', site: 'Place', relic: 'Relic', planet: 'World', sector: 'Sector', module: 'Holding', house: 'House' } as const)[t.k]}</span>
          <button type="button" className="btn small" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="inspect-body">
          {t.k === 'person' ? <PersonCard id={t.id} />
            : t.k === 'ship' ? <ShipCard id={t.id} />
            : t.k === 'portShip' ? portShip(t.id)
            : t.k === 'site' ? <SiteCard id={t.id} />
            : t.k === 'relic' ? <RelicCard id={t.id} />
            : t.k === 'planet' ? <PlanetCard id={t.id} />
            : t.k === 'sector' ? <SectorCard id={t.id} />
            : t.k === 'module' ? <ModuleCard id={t.id} />
            : <HouseCard id={t.id} />}
        </div>
      </div>
    </div>
  );
}

function Full({ to, label }: { to: Route; label: string }) {
  const nav = useNav();
  const ins = useInspect();
  return <button type="button" className="btn small" onClick={() => { ins.close(); nav.to(to); }}>{label} ›</button>;
}

function Fields({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <div className="inspect-fields">
      {rows.filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => <div key={k} className="row"><span className="dim">{k}</span><span>{v}</span></div>)}
    </div>
  );
}

// ---------------------------------------------------------------- people

function PersonCard({ id }: { id: string }) {
  const world = useWorld();
  const { reveal } = useGame();
  const menu = usePersonMenu();
  const ins = useInspect();
  const c = world.characters[id];
  if (!c) return <p className="muted">No one by that name.</p>;
  const v = seenBy(world, reveal)(c);
  const fam = world.families[c.familyId];
  const ship = Object.values(world.fleet?.ships ?? {}).find((s) => s.captainId === c.id && !s.lost);
  const stats = Object.entries(v.stats).filter(([, r]) => r).sort((a, b) => (b[1]![0] + b[1]![1]) - (a[1]![0] + a[1]![1])).slice(0, 6);
  return (
    <>
      <div className="inspect-head">
        <Portrait c={c} date={world.date} size="small" />
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow gold">{c.role}</div>
          <h2>{displayName(c.name)}{c.alive ? '' : ' †'}</h2>
          <p className="muted">House <Peek t={{ k: 'house', id: c.houseId }}>{world.houses[c.houseId]?.name ?? world.archon?.houses[c.houseId]?.name ?? '—'}</Peek> · {SPECIES[c.species].name} · {c.alive ? `age ${ageOf(c, world.date)}` : 'deceased'}{fam ? ` · ${fam.name}` : ''}</p>
          <p className="muted" style={{ fontSize: 11 }}>Known to us: {v.label.toLowerCase()}</p>
        </div>
      </div>
      {v.traits.length ? <p style={{ margin: '4px 0' }}>{v.traits.map((t) => traitLabel(t.id, t.detail)).join(' · ')}{v.hiddenTraits ? ' · ?' : ''}</p> : null}
      <Fields rows={[
        ...stats.map(([k, r]) => [STAT_LABEL[k as keyof typeof STAT_LABEL] ?? k, r![0] === r![1] ? String(r![0]) : `${r![0]}–${r![1]}`] as [string, ReactNode]),
        ['where', c.location ? findSector(world, c.location.sectorId)?.sector.name ?? world.planets[c.location.planetId]?.name : null],
        ['captain of', ship ? <Peek t={{ k: 'ship', id: ship.id }}>the {ship.name}</Peek> : null],
        ['now', v.flags.length ? v.flags.map((f) => FLAGS_BY_ID[f.id]?.label ?? f.id).join(' · ') : null],
      ]} />
      <DeedsLine id={c.id} />
      <div className="actions" style={{ marginTop: 8 }}>
        <Full to={{ kind: 'character', id: c.id }} label="Full record" />
        {c.alive ? <button type="button" className="btn small" onClick={(e) => { const r = (e.target as HTMLElement).getBoundingClientRect(); ins.close(); menu.open(c.id, r.left, r.bottom + 4); }}>Decisions</button> : null}
        <Full to={{ kind: 'log', person: c.id }} label="Their log" />
      </div>
    </>
  );
}

// ---------------------------------------------------------------- ships

function ShipCard({ id }: { id: string }) {
  const world = useWorld();
  const s = world.fleet?.ships[id];
  if (!s) return <p className="muted">No such ship.</p>;
  const def = CAPITAL_CLASSES[s.cls];
  const mods = Object.values(world.holdings?.modules ?? {}).filter((m) => m.shipId === s.id);
  const ours = s.houseId === world.playerHouseId;
  const where = findSector(world, s.sectorId);
  return (
    <>
      <div className="eyebrow gold">{def.label}{s.epithet ? ` · ${s.epithet}` : ''}{s.raised ? ` · raised from a wreck of ${s.raised}` : ''}</div>
      <h2>The {s.name}</h2>
      <pre className="ascii diagram">{capitalDiagram(s, mods, def.slots)}</pre>
      <Fields rows={[
        ['house', <Peek t={{ k: 'house', id: s.houseId }}>{world.houses[s.houseId]?.name ?? s.houseId}</Peek>],
        ['registry', `${s.id.toUpperCase()} · laid down ${formatDate(s.built)} · ${shipAge(world, s)} years`],
        ['captain', s.captainId && world.characters[s.captainId] ? <Peek t={{ k: 'person', id: s.captainId }}>{displayName(world.characters[s.captainId]!.name)}</Peek> : 'none: a lieutenant has her'],
        ['crew', `${fmt(s.crew)} of ${fmt(def.crew)} · ${moodWord(s.crewMood)} (${Math.round(s.crewMood)})`],
        ['condition', `${bar(s.condition)} ${Math.round(s.condition)}${conditionCap(world, s) < 100 ? ` · age holds her to ${conditionCap(world, s)}` : ''}`],
        ['strength', String(powerOf(world, s))],
        ['duty', s.lost ? `lost: ${s.lost.how}` : s.ready ? `on the slips until ${formatDate(s.ready)}` : `${DUTY_LABEL[s.duty]}${where ? ` · ${where.sector.name}, ${where.planet.name}` : ''}${s.arrives ? ' · under way' : ''}`],
        ['refits', s.fits?.length ? s.fits.map((f) => FITS[f].label).join(' · ') : 'none'],
        ['bays', mods.length ? mods.map((m) => `${MODULE_LABEL[m.kind]} ${m.level}`).join(' · ') : `${def.slots} empty`],
        ['upkeep', ours ? `${fmt(upkeepOf(s, world))} othes a Phase` : null],
        ['renown', `${s.renown ?? 0}${s.epithet ? '' : ' · a name at 12'}`],
      ]} />
      {s.log?.length ? <div className="inspect-log">{s.log.slice(0, 6).map((l, i) => <div key={i}><span className="mono muted">{l.year}</span> {l.text}</div>)}</div> : null}
      <div className="actions" style={{ marginTop: 8 }}><Full to={{ kind: 'ship', id: s.id }} label={ours ? 'Orders, refits and the full record' : 'Everything we know'} /></div>
    </>
  );
}

/** The file on a ship at the docks: the diagram, and then the port authority's own dossier with its actions. */
export function PortShipHead({ id }: { id: string }) {
  const world = useWorld();
  const s = world.ports?.ships[id];
  if (!s) return null;
  return <pre className="ascii diagram">{portShipDiagram(s)}</pre>;
}

// ---------------------------------------------------------------- places, relics, worlds

function SiteCard({ id }: { id: string }) {
  const world = useWorld();
  const game = useGame();
  const [err, setErr] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [lead, setLead] = useState('');
  const run = (fn: (w: World) => World) => game.update((w) => { try { setErr(null); return fn(w); } catch (e) { setErr((e as Error).message); return w; } });
  const s = world.places?.sites[id];
  if (!s) return <p className="muted">No such place.</p>;
  const P = world.playerHouseId;
  const o = s.overseerId ? world.characters[s.overseerId] : undefined;
  const ours = s.holder === P;
  const war = !!s.holder && s.holder !== P && s.holdable && atWar(world, P, s.holder);
  const people = Object.values(world.characters).filter((c) => c.alive && c.houseId === P && c.tier === 'full' && !c.veiled && !c.seat && c.id !== world.houses[P]!.rulerId)
    .sort((a, b) => b.stats.stewardship + b.stats.perception - a.stats.stewardship - a.stats.perception);
  const free = shipsFree(world, P);
  const settle = ours && s.kind === 'outpost' ? cannotSettle(world, s.id) : null;
  const away = world.places?.expeditions.find((e) => e.siteId === s.id);
  const assaultWhy = war ? cannotAssault(world, s.id, chosen) : null;
  const ourPower = chosen.reduce((t, x) => t + (world.fleet.ships[x] ? powerOf(world, world.fleet.ships[x]!) : 0), 0) / 4;
  return (
    <>
      <div className="eyebrow gold">{SITE_LABEL[s.kind]} · {s.region}</div>
      <h2>{s.name}</h2>
      <pre className="ascii diagram">{siteDiagram(s)}</pre>
      <p>{s.note}</p>
      <Fields rows={[
        ['held by', s.holder ? <Peek t={{ k: 'house', id: s.holder }}>{world.houses[s.holder]?.name ?? world.archon?.houses[s.holder]?.name ?? s.holder}</Peek> : 'no one'],
        ['taken from', s.takenFrom ? `House ${world.archon?.houses[s.takenFrom.houseId]?.name ?? s.takenFrom.houseId}, in ${s.takenFrom.year}: they want it back` : null],
        ['gives', s.holdable ? Object.entries(s.yields).filter(([, v]) => v).map(([k, v]) => `${k === 'othes' ? fmt(v!) : v} ${k}`).join(', ') + ' a Phase' : null],
        ['costs', s.holdable && s.upkeep ? `${fmt(s.upkeep + s.garrison * 0.01)} othes a Phase` : null],
        ['defence', s.holdable ? String(Math.round(siteDefence(world, s))) : null],
        ['overseer', o ? <Peek t={{ k: 'person', id: o.id }}>{displayName(o.name)}</Peek> : s.holdable ? 'none' : null],
        ['explored', s.kind === 'ruin' ? (s.explored ? 'yes' : away ? 'an expedition is there now' : 'not yet') : null],
      ]} />
      {ours ? (
        <div className="inspect-act">
          <span className="eyebrow">Run it</span>
          <div className="actions">
            <select className="select" aria-label="Overseer" value={s.overseerId ?? ''} onChange={(e) => run((w) => setSiteOverseer(w, s.id, e.target.value || null))}>
              <option value="">(no overseer)</option>
              {people.map((c) => <option key={c.id} value={c.id}>{displayName(c.name)} · stewardship {c.stats.stewardship}</option>)}
            </select>
            <button type="button" className="btn small" onClick={() => run((w) => setGarrison(w, s.id, s.garrison + 500))}>+500 soldiers</button>
            <button type="button" className="btn small" disabled={s.garrison <= 100} onClick={() => run((w) => setGarrison(w, s.id, s.garrison - 500))}>−500</button>
            {s.kind === 'outpost' ? <button type="button" className="btn small" disabled={!!settle} title={settle ?? undefined} onClick={() => run((w) => settleOutpost(w, s.id))}>{settle ?? `Settle it · ${fmt(SETTLE_COST)}`}</button> : null}
          </div>
        </div>
      ) : null}
      {war ? (
        <div className="inspect-act">
          <span className="eyebrow">Assault · we are at war with its holder</span>
          <div className="actions">
            {free.length ? free.map((sh) => <button key={sh.id} type="button" className="pill" aria-pressed={chosen.includes(sh.id)} onClick={() => setChosen((c) => (c.includes(sh.id) ? c.filter((x) => x !== sh.id) : [...c, sh.id]))}>{sh.name} ({powerOf(world, sh)})</button>) : <span className="muted">No ship of ours is in harbour and fit to sail.</span>}
          </div>
          <div className="actions">
            <button type="button" className="btn small primary" disabled={!!assaultWhy} title={assaultWhy ?? undefined} onClick={() => run((w) => assaultSite(w, s.id, chosen))}>{chosen.length ? `Assault · ${Math.round(ourPower)} against ${Math.round(siteDefence(world, s))}` : 'Choose ships to send'}</button>
          </div>
        </div>
      ) : null}
      {s.kind === 'ruin' && !s.explored && !away ? (
        <div className="inspect-act">
          <span className="eyebrow">An expedition · 3,000 othes, two Orbits</span>
          <div className="actions">
            <select className="select" aria-label="Who leads" value={lead} onChange={(e) => setLead(e.target.value)}>
              <option value="">Who leads…</option>
              {people.map((c) => <option key={c.id} value={c.id}>{displayName(c.name)} · perception {c.stats.perception}</option>)}
            </select>
            {(() => { const why = lead ? cannotExplore(world, s.id, lead) : 'Choose who leads it'; return <button type="button" className="btn small" disabled={!!why} title={why ?? undefined} onClick={() => run((w) => sendExpedition(w, s.id, lead))}>Send them</button>; })()}
          </div>
        </div>
      ) : null}
      {err ? <p className="error">{err}</p> : null}
      <div className="actions" style={{ marginTop: 8 }}><Full to={{ kind: 'places' }} label="Places of the Archon" /></div>
    </>
  );
}

function RelicCard({ id }: { id: string }) {
  const world = useWorld();
  const game = useGame();
  const r = (world as World & { legacy?: { relics: Record<string, ReturnType<typeof ensureLegacy>['relics'][string]> } }).legacy?.relics[id];
  if (!r) return <p className="muted">No such relic.</p>;
  const ours = r.houseId === world.playerHouseId;
  return (
    <>
      <div className="eyebrow gold">Relic</div>
      <h2>{r.name}</h2>
      <pre className="ascii diagram">{relicDiagram(r.kind)}</pre>
      <p>{r.note}</p>
      <Fields rows={[
        ['from', r.origin],
        ['found', formatDate(r.found)],
        ['kept by', r.houseId ? <Peek t={{ k: 'house', id: r.houseId }}>{world.houses[r.houseId]?.name ?? world.archon?.houses[r.houseId]?.name ?? r.houseId}</Peek> : 'lost, or out in the world'],
        ['bearer', r.bearer && world.characters[r.bearer] ? <Peek t={{ k: 'person', id: r.bearer }}>{displayName(world.characters[r.bearer]!.name)}</Peek> : null],
      ]} />
      {r.history.length ? <div className="inspect-log">{r.history.slice(-6).reverse().map((h, i) => <div key={i}><span className="mono muted">{h.year}</span> {h.text}</div>)}</div> : null}
      <div className="actions" style={{ marginTop: 8 }}>
        {ours && r.fragment && !r.read ? <button type="button" className="btn small primary" onClick={() => game.update((w) => readRelic(w, r.id))}>{r.kind === 'echoCoin' ? 'Listen to it' : 'Read it'}</button> : null}
        <Full to={{ kind: 'legacy' }} label="The Reliquary" />
      </div>
    </>
  );
}

function PlanetCard({ id }: { id: string }) {
  const world = useWorld();
  const p = world.planets[id];
  if (!p) return <p className="muted">No such world.</p>;
  const pop = p.sectors.reduce((t, s) => t + s.population, 0);
  const ships = Object.values(world.fleet?.ships ?? {}).filter((s) => !s.lost && !s.ready && p.sectors.some((x) => x.id === s.sectorId));
  return (
    <>
      <div className="eyebrow gold">World of House {world.houses[p.houseId]?.name ?? world.archon?.houses[p.houseId]?.name ?? p.houseId}</div>
      <h2>{p.name}</h2>
      <pre className="ascii diagram">{planetDiagram(p.name)}</pre>
      <p>{p.description}</p>
      <Fields rows={[
        ['held by', <Peek t={{ k: 'house', id: p.houseId }}>{world.houses[p.houseId]?.name ?? world.archon?.houses[p.houseId]?.name ?? p.houseId}</Peek>],
        ['people', fmt(pop)],
        ['sectors', <>{p.sectors.map((s, i) => <span key={s.id}>{i ? ' · ' : ''}<Peek t={{ k: 'sector', id: s.id }}>{s.name}</Peek>{s.unrest >= 50 ? ' !' : ''}</span>)}</>],
        ['in orbit', ships.length ? <>{ships.map((s, i) => <span key={s.id}>{i ? ' · ' : ''}<Peek t={{ k: 'ship', id: s.id }}>{s.name}</Peek></span>)}</> : null],
      ]} />
      <div className="actions" style={{ marginTop: 8 }}><Full to={{ kind: 'planet', id }} label="The world" /></div>
    </>
  );
}

function SectorCard({ id }: { id: string }) {
  const world = useWorld();
  const f = findSector(world, id);
  if (!f) return <p className="muted">No such sector.</p>;
  const { sector: s, planet: p } = f;
  const mods = Object.values(world.holdings?.modules ?? {}).filter((m) => m.sectorId === id);
  const ctrl = s.controllerFamilyId ? world.families[s.controllerFamilyId] : undefined;
  return (
    <>
      <div className="eyebrow gold">{s.designation} · <Peek t={{ k: 'planet', id: p.id }}>{p.name}</Peek></div>
      <h2>{s.name}</h2>
      <p>{s.description}</p>
      <Fields rows={[
        ['people', fmt(s.population)],
        ['unrest', `${bar(s.unrest)} ${Math.round(s.unrest)}`],
        ['port', s.port],
        ['held for us by', ctrl ? ctrl.name : null],
        ['quarters', s.quarters.length ? s.quarters.map((q) => q.name).join(' · ') : null],
        ['holdings', mods.length ? <>{mods.map((m, i) => <span key={m.id}>{i ? ' · ' : ''}<Peek t={{ k: 'module', id: m.id }}>{MODULE_LABEL[m.kind]} {m.level}</Peek></span>)}</> : null],
      ]} />
      <div className="actions" style={{ marginTop: 8 }}>
        <Full to={{ kind: 'sector', id }} label="The sector" />
        {world.ports?.ports[id] ? <Full to={{ kind: 'port', id }} label="The docks" /> : null}
      </div>
    </>
  );
}

function ModuleCard({ id }: { id: string }) {
  const world = useWorld();
  const m = world.holdings?.modules[id];
  if (!m) return <p className="muted">No such holding.</p>;
  const where = m.shipId ? `aboard the ${world.fleet?.ships[m.shipId]?.name ?? 'ship'}` : findSector(world, m.sectorId ?? '')?.sector.name ?? '';
  return (
    <>
      <div className="eyebrow gold">{MODULE_LABEL[m.kind]} · level {m.level}</div>
      <h2>{MODULE_LABEL[m.kind]}, {where}</h2>
      <p>{MODULE_NOTE[m.kind]}</p>
      <Fields rows={[
        [OVERSEER_TITLE[m.kind].toLowerCase(), m.overseerId && world.characters[m.overseerId] ? <Peek t={{ k: 'person', id: m.overseerId }}>{displayName(world.characters[m.overseerId]!.name)}</Peek> : 'none'],
        ['built', formatDate(m.built)],
        ['works', m.works ? `to level ${m.works.to}, done ${formatDate(m.works.done)}` : null],
        ['drives', m.drives ? `${fmt(m.drives)} othes vaulted` : null],
      ]} />
      <div className="actions" style={{ marginTop: 8 }}><Full to={{ kind: 'holdings', id: m.id }} label="Run it" /></div>
    </>
  );
}

function HouseCard({ id }: { id: string }) {
  const world = useWorld();
  const a = world.archon?.houses[id];
  const h = world.houses[id];
  if (!a && !h) return <p className="muted">No such house.</p>;
  const P = world.playerHouseId;
  const ruler = h?.rulerId ? world.characters[h.rulerId] : undefined;
  const regard = world.archon?.regard[id]?.[P] ?? 0;
  const e = id === P ? 0 : envyOf(world, id, P);
  return (
    <>
      <div className="eyebrow gold">{(a?.tier ?? h?.tier) === 'great' ? 'Great House' : 'Minor House'}{a?.speciesKnown ? ` · ${SPECIES[a.species].name}` : ''}</div>
      <h2>House {a?.name ?? h?.name}</h2>
      {a?.blurb ? <p>{a.blurb}</p> : null}
      <Fields rows={[
        ['Highroy', ruler ? <Peek t={{ k: 'person', id: ruler.id }}>{displayName(ruler.name)}</Peek> : a?.notables?.[0]?.name ?? null],
        ['standing', a ? String(Math.round(a.prestige)) : null],
        ['worlds', a ? String(a.worlds) : null],
        ['toward us', id === P ? null : `${regard > 0 ? '+' : ''}${Math.round(regard)}`],
        ['envy of us', id === P ? null : `${e} · ${envyWord(e)}`],
        ['places', Object.values(world.places?.sites ?? {}).filter((s) => s.holder === id && s.known).map((s) => s.name).join(' · ') || null],
      ]} />
      <div className="actions" style={{ marginTop: 8 }}><Full to={{ kind: 'house', id }} label="The house" /></div>
    </>
  );
}

export type { World };
