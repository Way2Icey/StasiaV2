// A house's dossier: everything we know about one other house, what lies between us, and every move we can
// make toward them, in one pop-up opened from Archon › Houses.
import { useEffect, useState, type ReactNode } from 'react';
import { useGame, useNav, useWorld } from './context';
import { Go, HouseLink, Panel, PersonById, PersonLink } from './links';
import { ArchonHouseLink, ArchonPanel } from './archon';
import { HouseDealings, PoachPanel } from './realm';
import { EmbassyPanel } from './embassies';
import { DeclarePanel } from './war';
import { RivalVaults } from './holdings';
import { Regard } from './council';
import { cannotCourt, courtHouse, COURT_COST, houseName, liveHouses, regardOf } from '../sim/archon';
import { attitudeColor, relation } from '../sim/relations';
import { envyOf, envyWord } from '../sim/envy';
import { AIM_LABEL } from '../sim/houses';
import { beginHeist, beginPact, whyNoAgent } from '../sim/scenes_api';
import { councilOf, SEAT_TITLE } from '../sim/world';
import { familyHead, isCommoner } from '../sim/query';
import { knownTo } from '../sim/circle';
import { knowledgeOf } from '../sim/knowledge';
import { shipsOf } from '../sim/fleet';
import { troopsOf } from '../sim/crucible';
import { atWar, grievances } from '../sim/war';
import { wrongsAgainst, liveIntel } from '../sim/turning';
import { barsOf, DISLIKE_TIERS, LIKE_TIERS, tierOf } from '../sim/relationships';
import { cannotTalk } from '../sim/talk';
import { homeRegion, localPrice, placeOrder, regionName } from '../sim/exchange';
import { GOODS, RESOURCE_LABEL, type Good } from '../data/economy';
import { SPECIES } from '../data/species';
import { absoluteCycle, dateParts } from '../sim/time';
import { compactOf } from '../sim/lanes';
import { orbitAgo } from '../sim/since';
import type { World } from '../sim/types';

export type DossierTab = 'know' | 'between' | 'dealings' | 'war' | 'shadows' | 'annals';
const TABS: [DossierTab, string][] = [['know', 'What we know'], ['between', 'Between us'], ['dealings', 'Dealings'], ['war', 'War'], ['shadows', 'Spymaster'], ['annals', 'Annals']];
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
/** A rough figure, as rough as what we know of them. */
const rough = (n: number, depth: number) => (depth >= 60 ? fmt(n) : depth >= 25 ? `about ${fmt(Math.round(n / 500) * 500)}` : `perhaps ${fmt(Math.round(n / 2000) * 2000 || 1000)}`);

function usePlay() {
  const game = useGame();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: (w: World) => World) => game.update((w) => { try { setErr(null); return fn(w); } catch (e) { setErr((e as Error).message); return w; } });
  return { run, err };
}

/** The pop-up itself. */
/** For a house we only know from afar: a guess at its strength, scaled from the houses we know well. */
export function registerStrength(world: World, id: string): { troops: number; ships: number } | undefined {
  const a = world.archon?.houses[id];
  if (!a) return undefined;
  const known = Object.keys(world.houses).map((h) => ({ h, x: world.archon?.houses[h] })).filter((k) => k.x && k.x.might * k.x.worlds > 0);
  if (!known.length) return undefined;
  const per = known.reduce((n, k) => n + troopsOf(world, k.h) / (k.x!.might * Math.max(1, k.x!.worlds)), 0) / known.length;
  const ship = known.reduce((n, k) => n + shipsOf(world, k.h).length / (k.x!.might * Math.max(1, k.x!.worlds)), 0) / known.length;
  const m = a.might * Math.max(1, a.worlds);
  return { troops: Math.round(per * m), ships: Math.max(1, Math.round(ship * m)) };
}

export function HouseDossier({ id, onClose, tab: start }: { id: string; onClose: () => void; tab?: DossierTab }) {
  const world = useWorld();
  const [tab, setTab] = useState<DossierTab>(start ?? 'know');
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.inspect-veil, .moment-veil')) onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const P = world.playerHouseId;
  const a = world.archon?.houses[id];
  const h = world.houses[id];
  if (!a && !h) return null;
  const name = h?.name ?? a?.name ?? id;
  const tier = (h?.tier ?? a?.tier) === 'great' ? 'Great House' : 'Minor House';
  const r = regardOf(world, id, P);
  return (
    <div className="dossier-veil" role="dialog" aria-label={`House ${name}`} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dossier">
        <header>
          <span className="eyebrow gold">{tier}{a?.speciesKnown ? ` · ${SPECIES[a.species].name}` : ''}{atWar(world, P, id) ? ' · AT WAR WITH US' : ''}</span>
          <h2>House {name}</h2>
          <span className="muted" style={{ fontSize: 12 }}>regards us <span style={{ color: attitudeColor(r) }}>{r > 0 ? '+' : ''}{r}</span> · we regard them {regardOf(world, P, id)}</span>
          <button type="button" className="btn small dossier-close" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <nav className="subtabs dossier-tabs" role="tablist">
          {TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} aria-current={tab === k ? 'page' : undefined} className="subtab" onClick={() => setTab(k)}>{l}</button>)}
        </nav>
        <div className="dossier-body grid">
          {tab === 'know' ? <Know id={id} /> : tab === 'between' ? <Between id={id} /> : tab === 'dealings' ? <Dealings id={id} /> : tab === 'war' ? <WarTab id={id} /> : tab === 'shadows' ? <Shadows id={id} /> : <Annals id={id} />}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- what we know

function Know({ id }: { id: string }) {
  const world = useWorld();
  const P = world.playerHouseId;
  const a = world.archon?.houses[id];
  const h = world.houses[id];
  const year = dateParts(world.date).year;
  const aim = world.realm?.aims[id];
  const ruler = h?.rulerId ? world.characters[h.rulerId] : undefined;
  const depth = ruler ? knowledgeOf(world, P, ruler.id).depth : 0;
  const council = h ? councilOf(world, id).filter((c) => c.seat !== 'highroy') : [];
  const fams = Object.values(world.families).filter((f) => f.houseId === id && !isCommoner(f));
  const ships = h ? shipsOf(world, id) : [];
  const sites = Object.values(world.places?.sites ?? {}).filter((s) => s.holder === id && s.known);
  const knownPeople = Object.values(world.characters).filter((c) => c.alive && c.houseId === id && !c.seat && knownTo(world, P, c)).slice(0, 12);
  return (
    <>
      <Panel title="The house" className="span-6">
        <p className="body" style={{ margin: 0, fontSize: 13 }}>{a?.blurb ?? h?.blurb}</p>
        <dl className="kv body">
          <dt>Highroy</dt><dd>{ruler ? <PersonLink c={ruler} /> : a?.ruler ? `${a.ruler.name}, ${year - a.ruler.born}` : '—'}</dd>
          <dt>Known for</dt><dd>{a?.focus ?? '—'}</dd>
          <dt>Capital</dt><dd>{a?.capital ?? (h ? world.planets[h.capitalPlanetId]?.name : '—')}</dd>
          <dt>Worlds</dt><dd className="mono">{a?.worlds ?? Object.values(world.planets).filter((p) => p.houseId === id).length}</dd>
          <dt>After</dt><dd>{aim?.known ? <>{AIM_LABEL[aim.kind]}{aim.target ? <> · {aim.target === P ? 'us' : <HouseLink id={aim.target} />}</> : null}</> : <span className="muted">unknown; investigate their Highroy, or question one of theirs</span>}</dd>
        </dl>
      </Panel>
      <Panel title="Their strength" aside={h ? (depth >= 60 ? 'from good reports' : 'as far as we can tell') : 'a guess, from afar'} className="span-6">
        <dl className="kv body">
          {h ? <>
            <dt>Garrisons</dt><dd className="mono">{rough(troopsOf(world, id), depth)}</dd>
            <dt>Capital ships</dt><dd className="mono">{depth >= 25 ? ships.length : '?'}{depth >= 60 && ships.length ? <span className="muted"> · {ships.map((s) => s.name).join(', ')}</span> : null}</dd>
          </> : (() => { const est = registerStrength(world, id); return <>
            <dt>Garrisons</dt><dd className="mono">{est ? rough(est.troops, depth) : "?"}</dd>
            <dt>Capital ships</dt><dd className="mono">{est && depth >= 25 ? `about ${est.ships}` : '?'}</dd>
          </>; })()}
          <dt>Stations we know of</dt><dd>{sites.length ? sites.map((s) => <div key={s.id}>{s.name} <span className="muted mono">· garrison {depth >= 40 ? s.garrison : '?'}</span></div>) : <span className="muted">none; scouts find them</span>}</dd>
        </dl>
      </Panel>
      {h ? (
        <Panel title="Their council" aside={`${council.length} seats`} className="span-6">
          {council.map((c) => (
            <div key={c.id} className="row" style={{ gap: 10 }}>
              <span className="eyebrow gold" style={{ width: 110, flexShrink: 0 }}>{SEAT_TITLE[c.seat!]}</span>
              <span style={{ flex: 1 }}><PersonLink c={c} /></span>
              <span className="muted mono" style={{ fontSize: 11 }}>known {knowledgeOf(world, P, c.id).depth}</span>
            </div>
          ))}
        </Panel>
      ) : a?.notables.length ? (
        <Panel title="People of note" className="span-6">
          <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {a.notables.map((n) => <div key={n.name}><strong>{n.name}</strong> <span className="muted">· {n.role}</span><div style={{ fontSize: 12, color: 'var(--fg-2)' }}>{n.note}</div></div>)}
          </div>
        </Panel>
      ) : null}
      <Panel title="Families and people" className="span-6">
        <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          {fams.length ? fams.map((f) => <div key={f.id}>{f.name} <span className="muted">· {f.ruling ? 'ruling' : f.high ? 'high' : 'vassal'} · head</span> <PersonById id={familyHead(world, f.id)?.id} /></div>) : <span>{a?.families.join(', ')}</span>}
          {knownPeople.length ? <><span className="eyebrow" style={{ marginTop: 6 }}>Others we know</span><div>{knownPeople.map((c, i) => <span key={c.id}>{i ? ', ' : ''}<PersonLink c={c} short /></span>)}</div></> : null}
        </div>
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------- between us

function Between({ id }: { id: string }) {
  const world = useWorld();
  const P = world.playerHouseId;
  const lord = world.houses[P]?.rulerId;
  const h = world.houses[id];
  const e = envyOf(world, id, P);
  const people = h ? Object.values(world.characters).filter((c) => c.alive && c.houseId === id && (c.seat || c.id === h.rulerId)) : [];
  return (
    <>
      <Panel title="How we stand" className="span-6">
        <dl className="kv body">
          <dt>They regard us</dt><dd><Regard v={regardOf(world, id, P)} /></dd>
          <dt>We regard them</dt><dd><Regard v={regardOf(world, P, id)} /></dd>
          {h ? <><dt>Between the houses</dt><dd className="mono">{relation(world, id, P)}</dd></> : null}
          <dt>Envy of us</dt><dd>{e} · {envyWord(e)}</dd>
        </dl>
      </Panel>
      <ArchonPanel id={id} className="span-6" />
      {people.length && lord ? (
        <Panel title="What their people think of our Highroy" className="span-6">
          {people.map((c) => {
            const b = barsOf(world, c.id, lord);
            const f = [tierOf(b.like, LIKE_TIERS), tierOf(b.dislike, DISLIKE_TIERS)].filter(Boolean).join(', but ').toLowerCase() || 'no strong feeling';
            const why = cannotTalk(world, c.id);
            return (
              <div key={c.id} className="row" style={{ gap: 8 }}>
                <span style={{ flex: 1 }}><PersonLink c={c} short /> <span className="muted">· {c.seat ? SEAT_TITLE[c.seat] : 'Highroy'} · {f}</span></span>
                <Go to={{ kind: 'talk', id: c.id }} className="btn small" title={why ?? 'Three exchanges'}>Audience ›</Go>
              </div>
            );
          })}
        </Panel>
      ) : null}
      <Panel scroll={260} title="Toward the other houses" className="span-6">
        <div className="body" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 12 }}>
          {liveHouses(world).filter((o) => o.id !== id).sort((x, y) => regardOf(world, id, y.id) - regardOf(world, id, x.id)).map((o) => (
            <span key={o.id}>{houseName(world, o.id)} <span className="mono" style={{ color: attitudeColor(regardOf(world, id, o.id)) }}>{regardOf(world, id, o.id)}</span>{o.id === P ? ' (us)' : ''}</span>
          ))}
        </div>
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------- dealings: diplomacy and trade

function Dealings({ id }: { id: string }) {
  const world = useWorld();
  const { run, err } = usePlay();
  const why = cannotCourt(world, id);
  const h = world.houses[id];
  return (
    <>
      <Panel title="Diplomacy" className="span-12">
        {err ? <p className="body error" style={{ margin: 0 }}>{err}</p> : null}
        <div className="actions body">
          <button type="button" className="btn primary" disabled={!!why} title={why ?? 'Gifts and attention: their regard rises'} onClick={() => run((w) => courtHouse(w, id))}>Court them · {fmt(COURT_COST)}</button>
          <button type="button" className="btn" title="A live negotiation" onClick={() => run((w) => beginPact(w, id))}>Propose a pact</button>
          {h ? <Go to={{ kind: 'plan', mission: 'envoy', target: id }} className="btn">Send an envoy ›</Go> : null}
        </div>
      </Panel>
      {h ? <HouseDealings id={id} className="span-12" /> : null}
      {h ? <EmbassyPanel houseId={id} className="span-6" /> : null}
      {h ? <TradeWith id={id} /> : null}
    </>
  );
}

function TradeWith({ id }: { id: string }) {
  const world = useWorld();
  const { run, err } = usePlay();
  const region = homeRegion(world, id);
  const [f, setF] = useState<{ side: 'sell' | 'buy'; good: Good; qty: number }>({ side: 'sell', good: 'metals', qty: 100 });
  const price = localPrice(world, region, f.good);
  return (
    <Panel title={`Trade at ${regionName(world, region)}`} aside="their market" className="span-6">
      {err ? <p className="body error" style={{ margin: 0 }}>{err}</p> : null}
      <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
        <table className="ctable"><tbody>{GOODS.map((g) => <tr key={g}><td>{RESOURCE_LABEL[g]}</td><td className="mono">{localPrice(world, region, g).toFixed(2)}</td></tr>)}</tbody></table>
        <span className="actions">
          <select className="select" aria-label="Side" value={f.side} onChange={(e) => setF({ ...f, side: e.target.value as 'sell' | 'buy' })}><option value="sell">Sell</option><option value="buy">Buy</option></select>
          <select className="select" aria-label="Good" value={f.good} onChange={(e) => setF({ ...f, good: e.target.value as Good })}>{GOODS.map((g) => <option key={g} value={g}>{RESOURCE_LABEL[g]}</option>)}</select>
          <input className="input" type="number" min={10} step={10} value={f.qty} aria-label="Quantity" style={{ width: 80 }} onChange={(e) => setF({ ...f, qty: Math.max(1, Number(e.target.value) || 0) })} />
          <button type="button" className="btn small primary" onClick={() => run((w) => placeOrder(w, { side: f.side, good: f.good, qty: f.qty, region, limit: price }))}>Place order at {price.toFixed(2)}</button>
        </span>
        <span className="muted">Orders wait on their market at today's price. The full Exchange is in the Treasury.</span>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------- war

function WarTab({ id }: { id: string }) {
  const world = useWorld();
  const P = world.playerHouseId;
  const theirs = wrongsAgainst(world, id, P);
  return (
    <>
      {atWar(world, P, id) ? (
        <Panel title="We are at war" className="span-12"><div className="body actions"><span>The war is run from Arms.</span><Go to={{ kind: 'war' }} className="btn small primary">The war ›</Go></div></Panel>
      ) : <DeclarePanel fixed={id} className="span-12" />}
      <Panel title="Grievances" className="span-12">
        <div className="body" style={{ fontSize: 13 }}>
          <span className="eyebrow">Ours against them</span>
          {grievances(world, P, id).length ? <ul style={{ margin: '4px 0 8px 16px', padding: 0 }}>{grievances(world, P, id).map((g) => <li key={g}>{g}</li>)}</ul> : <div className="muted">None the Archon would accept.</div>}
          <span className="eyebrow">Theirs against us</span>
          {theirs.length ? <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>{theirs.map((g) => <li key={g}>{g}</li>)}</ul> : <div className="muted">None we know of.</div>}
        </div>
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------- the Spymaster's business

function Shadows({ id }: { id: string }) {
  const world = useWorld();
  const { run, err } = usePlay();
  const h = world.houses[id];
  const intel = liveIntel(world).filter((x) => x.houseId === id);
  const held = Object.values(world.captives).filter((c) => c.heldBy === world.playerHouseId && world.characters[c.characterId]?.houseId === id);
  return (
    <>
      <Panel title="Missions" className="span-12">
        {err ? <p className="body error" style={{ margin: 0 }}>{err}</p> : null}
        <div className="actions body">
          {h?.rulerId ? <Go to={{ kind: 'plan', mission: 'investigate', target: h.rulerId }} className="btn primary">Investigate their Highroy ›</Go> : null}
          {h ? <Go to={{ kind: 'plan', mission: 'scout', target: h.capitalPlanetId }} className="btn">Scout their capital ›</Go> : null}
          <button type="button" className="btn" disabled={!!whyNoAgent(world)} title={whyNoAgent(world) ?? 'A live infiltration of their vault'} onClick={() => run((w) => beginHeist(w, id))}>Steal a Caige from their vault</button>
          <Go to={{ kind: 'bounties' }} className="btn">Put a price on one of theirs ›</Go>
        </div>
      </Panel>
      <Panel title="What our cells and agents have on them" aside={`${intel.length} in hand · ${held.length} of theirs held`} className="span-12">
        {intel.length === 0 && held.length === 0 ? <p className="body muted" style={{ margin: 0 }}>Nothing. Catch one of theirs, and question them.</p> : null}
        {intel.map((x) => <div key={x.id} className="row" style={{ fontSize: 13 }}><span style={{ flex: 1 }}>{x.text}</span><span className="muted" style={{ fontSize: 11 }}>{x.source}</span></div>)}
        {held.map((c) => <div key={c.characterId} className="row" style={{ fontSize: 13 }}><span style={{ flex: 1 }}>In our cells: <PersonById id={c.characterId} /></span></div>)}
        {intel.length || held.length ? <div className="body"><Go to={{ kind: 'intel' }} className="btn small">Cells & intel ›</Go></div> : null}
      </Panel>
      <RivalVaults houseId={id} className="span-12" />
      {h ? <PoachPanel houseId={id} className="span-12" /> : null}
    </>
  );
}

// ---------------------------------------------------------------- annals

function Annals({ id }: { id: string }) {
  const world = useWorld();
  const a = world.archon;
  const past = (a?.history ?? []).filter((e) => e.houses.includes(id)).slice(-30).reverse();
  const feuds = (a?.feuds ?? []).filter((r) => r.a === id || r.b === id);
  const pacts = (a?.pacts ?? []).filter((r) => r.a === id || r.b === id);
  return (
    <>
      <Panel title="Feuds and pacts" className="span-12">
        <dl className="kv body">
          <dt>Feuds</dt><dd>{feuds.length ? feuds.map((r, i) => <span key={i}>{i ? ', ' : ''}<ArchonHouseLink id={r.a === id ? r.b : r.a} /> <span className="muted">since {r.since}</span></span>) : 'none'}</dd>
          <dt>Pacts</dt><dd>{pacts.length ? pacts.map((r, i) => <span key={i}>{i ? ', ' : ''}<ArchonHouseLink id={r.a === id ? r.b : r.a} /></span>) : 'none'}</dd>
        </dl>
      </Panel>
      <Panel title="In the histories" className="span-12">
        <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          {past.length ? past.map((e, i) => <div key={i}><span className="mono muted">{e.year > 0 ? e.year : '—'}</span> {e.text}</div>) : <span className="muted">Nothing on record.</span>}
        </div>
      </Panel>
    </>
  );
}

/** What ties us to a house right now, most pressing first. */
export function withUs(world: World, P: string, id: string): { label: string; tone?: 'bad' | 'good' }[] {
  const out: { label: string; tone?: 'bad' | 'good' }[] = [];
  const pair = (p: { a: string; b: string }) => (p.a === P && p.b === id) || (p.b === P && p.a === id);
  if (atWar(world, P, id)) out.push({ label: 'At war', tone: 'bad' });
  if ((world.archon?.feuds ?? []).some(pair)) out.push({ label: 'Feud', tone: 'bad' });
  if ((world.archon?.pacts ?? []).some(pair)) out.push({ label: 'Pact', tone: 'good' });
  if (compactOf(world, P, id)) out.push({ label: 'Trade compact', tone: 'good' });
  const now = absoluteCycle(world.date);
  if ((world.quests?.pacts ?? []).some((x) => x.houseId === id && absoluteCycle(x.until) > now)) out.push({ label: 'Trade agreement', tone: 'good' });
  for (const l of Object.values(world.loans?.loans ?? {})) {
    if (l.lender === P && l.borrower === id && l.owed > 0) out.push({ label: `Owes us ${fmt(l.owed)}` });
    if (l.borrower === P && l.lender === id && l.owed > 0) out.push({ label: `We owe ${fmt(l.owed)}`, tone: 'bad' });
  }
  const held = Object.values(world.captives ?? {});
  if (held.some((c) => c.heldBy === P && world.characters[c.characterId]?.houseId === id)) out.push({ label: 'We hold one of theirs' });
  if (held.some((c) => c.heldBy === id && world.characters[c.characterId]?.houseId === P)) out.push({ label: 'They hold one of ours', tone: 'bad' });
  if (Object.values(world.characters).some((c) => c.alive && c.houseId === P && c.location && world.planets[c.location.planetId]?.houseId === id && c.flags.some((f) => f.id === 'ward'))) out.push({ label: 'Our ward is there' });
  return out;
}

/** The Houses list, every house one click from its dossier. */
export function HouseList({ open }: { open: (id: string) => void }) {
  const world = useWorld();
  const P = world.playerHouseId;
  const rows = liveHouses(world).filter((h) => h.id !== P).sort((x, y) => (x.tier === y.tier ? x.name.localeCompare(y.name) : x.tier === 'great' ? -1 : 1));
  const cell = (n: ReactNode) => <td style={{ fontSize: 12 }}>{n}</td>;
  const ago = orbitAgo(world);
  return (
    <div className="table-wrap">
      <table className="list house-list">
        <thead><tr><th>HOUSE</th><th>CAPITAL</th><th>KNOWN FOR</th><th>REGARDS US</th><th>WITH US</th></tr></thead>
        <tbody>
          {rows.map((a) => {
            const r = regardOf(world, a.id, P);
            const ties = withUs(world, P, a.id);
            const was = ago?.regard[a.id];
            const moved = was === undefined ? 0 : Math.round(r - was);
            return (
              <tr key={a.id} className="clickable" onClick={() => open(a.id)}>
                <td><strong>{a.name}</strong> <span className="muted" style={{ fontSize: 11 }}>{a.tier === 'great' ? 'Great' : 'Minor'}{world.houses[a.id] ? '' : ' · distant'}</span></td>
                {cell(a.capital ?? '—')}
                {cell(<span className="muted">{a.focus}</span>)}
                <td className="mono" style={{ color: attitudeColor(r) }}>{r > 0 ? '+' : ''}{r}{moved ? <span className={moved > 0 ? 'up' : 'down'} title="since last Orbit"> {moved > 0 ? '▲' : '▼'}{Math.abs(moved)}</span> : null}</td>
                {cell(ties.length ? ties.map((t, i) => <span key={i} className={`tag${t.tone ? ` ${t.tone}` : ''}`}>{t.label}</span>) : <span className="muted">nothing yet</span>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function useDossierNav() {
  const nav = useNav();
  return { open: (id: string) => nav.to({ kind: 'house', id }), close: () => nav.to({ kind: 'houses' }) };
}
