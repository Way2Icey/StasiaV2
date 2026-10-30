import { useMemo, useState } from 'react';
import type { Nav } from './App';
import { SLOT, storage } from './App';
import { ageOf } from '../sim/characters';
import { displayName } from '../sim/names';
import { councilOf, createWorld, SEAT_TITLE } from '../sim/world';
import { dateParts, formatDate } from '../sim/time';
import { deserialize, SaveError, serialize } from '../sim/save';
import { SPECIES } from '../data/species';
import { TRAITS_BY_ID, traitLabel } from '../data/traits';
import { FLAGS_BY_ID } from '../data/flags';
import {
  BODY_STATS, HIDDEN_STATS, MIND_STATS, SPIRIT_STATS,
  type Character, type Sector, type StatId, type World,
} from '../sim/types';

// ---------------------------------------------------------------- shared bits

const STAT_LABEL: Record<string, string> = {
  tactics: 'Tactics', logistics: 'Logistics', fleetCommand: 'Fleet Command', siegecraft: 'Siegecraft',
  diplomacy: 'Diplomacy', negotiation: 'Negotiation', eloquence: 'Eloquence', intrigue: 'Intrigue',
  deception: 'Deception', insight: 'Insight', stewardship: 'Stewardship', law: 'Law', intellect: 'Intellect',
  perception: 'Perception', strength: 'Strength', endurance: 'Endurance', agility: 'Agility',
  constitution: 'Constitution', duelling: 'Duelling', marksmanship: 'Marksmanship', reflexes: 'Reflexes',
  stealth: 'Stealth', painTolerance: 'Pain Tolerance', willpower: 'Willpower', composure: 'Composure',
  determination: 'Determination', valor: 'Valor', leadership: 'Leadership', discipline: 'Discipline',
  caigeSync: 'Caige Sync', resonanceControl: 'Resonance Control',
  loyalty: 'Loyalty', drift: 'Drift', ambition: 'Ambition', greed: 'Greed', consistency: 'Consistency',
  nerve: 'Nerve', temperament: 'Temperament', discretion: 'Discretion', potential: 'Potential',
};

const BAND_COLOR: Record<string, string> = {
  frostpoint: 'var(--muted)', bluewake: 'var(--blue)', ambercore: 'var(--amber)', redline: 'var(--red)', whitebreak: '#f2f0ea',
};

const tierClass = (v: number) => (v >= 17 ? 't4' : v >= 13 ? 't3' : v >= 8 ? 't2' : 't1');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function initials(c: Character) {
  const a = c.name.given.charAt(0);
  const b = (c.name.family ?? c.name.hold ?? '').replace(/^the /, '').charAt(0);
  return (a + b).toUpperCase();
}

function PersonLink({ c, nav }: { c: Character; nav: Nav }) {
  return (
    <button type="button" className="linklike" onClick={() => nav.openCharacter(c.id)}>
      {displayName(c.name)}
    </button>
  );
}

function Panel({ title, aside, className, children }: { title: string; aside?: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={`panel ${className ?? ''}`}>
      <header><h3>{title}</h3>{aside ? <span className="aside">{aside}</span> : null}</header>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- Throne Room

export function ThroneRoom({ world, nav }: { world: World; nav: Nav }) {
  const house = world.houses[world.playerHouseId]!;
  const council = councilOf(world, house.id);
  const parts = dateParts(world.date);
  const people = Object.values(world.characters).filter((c) => c.houseId === house.id && c.alive);
  const feed = [...world.feed].reverse().slice(0, 30);

  return (
    <>
      <div className="page-title">
        <h2>The Throne Room</h2>
        <p>First build of the foundation: the clock, the seeded world and the people in it. Missions, events and the economy come in later milestones.</p>
      </div>
      <div className="grid">
        <Panel title="This Orbit" aside={`Orbit ${parts.orbit} of 10 · SY-${parts.year}`} className="span-5">
          <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 4 }} role="img" aria-label={`Phase ${parts.phase} of 5`}>
              {[1, 2, 3, 4, 5].map((p) => (
                <div key={p} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ height: 6, borderRadius: 3, background: p < parts.phase ? 'var(--gold)' : p === parts.phase ? '#7a6538' : 'var(--line)' }} />
                  <span className="eyebrow">Phase {p}</span>
                </div>
              ))}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              Each Continue advances 2 Cycles. A Phase is 16 Cycles, an Orbit 80, a year 800.
            </div>
            <dl className="kv">
              <dt>People of the house</dt><dd className="mono">{people.length}</dd>
              <dt>Named in full</dt><dd className="mono">{people.filter((c) => c.tier === 'full').length}</dd>
              <dt>Noble families</dt><dd className="mono">{Object.values(world.families).filter((f) => f.houseId === house.id && !f.id.includes('commoner')).length}</dd>
              <dt>Holdings</dt><dd><button type="button" className="linklike" onClick={() => nav.openPlanet(house.capitalPlanetId)}>{world.planets[house.capitalPlanetId]!.name}</button></dd>
            </dl>
          </div>
        </Panel>
        <Panel title="Council of Designers" aside="Select a name to open their sheet" className="span-7">
          {council.map((c) => (
            <div className="row" key={c.id}>
              <span className="eyebrow gold" style={{ width: 110, flexShrink: 0 }}>{SEAT_TITLE[c.seat!]}</span>
              <span style={{ flex: 1, minWidth: 0 }}><PersonLink c={c} nav={nav} /></span>
              <span className="muted" style={{ fontSize: 11 }}>{SPECIES[c.species].name} · {ageOf(c, world.date)}</span>
            </div>
          ))}
        </Panel>
        <Panel title="The Chronicle" aside="Newest first" className="span-12 feed">
          {feed.map((e, i) => (
            <div className="row" key={`${e.date.year}-${e.date.cycle}-${i}`}>
              <time>{formatDate(e.date)}</time>
              <span className={`tag ${e.kind}`}>{e.kind}</span>
              <span style={{ fontSize: 13 }}>{e.text}</span>
            </div>
          ))}
        </Panel>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- People

export function PeopleView({ world, nav }: { world: World; nav: Nav }) {
  const [house, setHouse] = useState<string>('all');
  const [tier, setTier] = useState<'full' | 'minor' | 'all'>('full');
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return Object.values(world.characters)
      .filter((c) => c.alive)
      .filter((c) => house === 'all' || c.houseId === house)
      .filter((c) => tier === 'all' || c.tier === tier)
      .filter((c) => !needle || displayName(c.name).toLowerCase().includes(needle) || c.role.toLowerCase().includes(needle));
  }, [world, house, tier, q]);

  return (
    <>
      <div className="page-title"><h2>People</h2><p>{rows.length} shown. Every name is generated from its house&apos;s culture.</p></div>
      <div className="filters">
        {['all', ...Object.keys(world.houses)].map((h) => (
          <button key={h} type="button" className="pill" aria-pressed={house === h} onClick={() => setHouse(h)}>
            {h === 'all' ? 'All houses' : world.houses[h]!.name}
          </button>
        ))}
        <span style={{ width: 8 }} />
        {(['full', 'minor', 'all'] as const).map((t) => (
          <button key={t} type="button" className="pill" aria-pressed={tier === t} onClick={() => setTier(t)}>
            {t === 'full' ? 'Full sheets' : t === 'minor' ? 'Minor named' : 'Everyone'}
          </button>
        ))}
        <label htmlFor="people-search" className="eyebrow" style={{ marginLeft: 8 }}>Search</label>
        <input id="people-search" className="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or role" />
      </div>
      <section className="panel">
        <div className="table-wrap">
          <table className="list">
            <thead><tr><th>Name</th><th>House</th><th>Species</th><th>Age</th><th>Role</th><th>Traits</th><th>Resonance</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td><PersonLink c={c} nav={nav} /></td>
                  <td>{world.houses[c.houseId]!.name}</td>
                  <td>{SPECIES[c.species].name}</td>
                  <td className="mono">{ageOf(c, world.date)}</td>
                  <td>{c.role}</td>
                  <td className="muted">{c.traits.map((t) => traitLabel(t.id, t.detail)).join(', ')}</td>
                  <td>{c.resonance && c.resonance.band !== 'frostpoint'
                    ? <span style={{ color: BAND_COLOR[c.resonance.band] }}>{cap(c.resonance.band)} <span className="mono">{c.resonance.degrees}°S</span></span>
                    : <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------- Character sheet

export function CharacterSheet({ world, id, nav, onBack }: { world: World; id: string; nav: Nav; onBack: () => void }) {
  const c = world.characters[id];
  const [showHidden, setShowHidden] = useState(false);
  if (!c) return <p className="error">That person is not in this world.</p>;
  const house = world.houses[c.houseId]!;
  const family = world.families[c.familyId]!;
  const planet = world.planets[c.location.planetId];
  const sector = planet?.sectors.find((s) => s.id === c.location.sectorId);
  const kin = Object.values(world.characters).filter((k) => k.familyId === c.familyId && k.id !== c.id && k.tier === 'full');
  const statCol = (title: string, ids: readonly StatId[]) => (
    <div>
      <h4>{title}</h4>
      {ids.map((s) => (
        <div className="stat" key={s}><span className="muted">{STAT_LABEL[s]}</span><span className={`v ${tierClass(c.stats[s])}`}>{c.stats[s]}</span></div>
      ))}
    </div>
  );

  return (
    <>
      <div><button type="button" className="btn small" onClick={onBack}>‹ Back</button></div>
      <section className="panel">
        <div className="body sheet-head">
          <div className="portrait" aria-hidden="true">{initials(c)}</div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="eyebrow gold">{c.role}{c.alive ? '' : ' · deceased'}</span>
            <h2>{displayName(c.name)}</h2>
            <span className="muted" style={{ fontSize: 12 }}>
              House {house.name} · {SPECIES[c.species].name} · age {ageOf(c, world.date)} · {family.ruling ? 'ruling family' : family.high ? 'high family' : 'family'} {family.name}
              {c.tier === 'minor' ? ' · minor named' : ''}
            </span>
            <div className="chips">
              {c.traits.length === 0 ? <span className="muted" style={{ fontSize: 12 }}>No notable traits</span> : null}
              {c.traits.map((t) => (
                <span key={t.id + (t.detail ?? '')} className={`chip ${TRAITS_BY_ID[t.id]?.category === 'earned' ? 'earned' : ''}`} title={TRAITS_BY_ID[t.id]?.description}>
                  <span className="k">{cap(TRAITS_BY_ID[t.id]?.category ?? '')} ·</span>{traitLabel(t.id, t.detail)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="grid">
        <section className="panel span-8">
          <header><h3>Attributes</h3><span className="aside">1–20 · <span className="gold">17+</span> · <span style={{ color: 'var(--blue)' }}>13–16</span> · 8–12 · <span style={{ color: 'var(--orange)' }}>≤7</span></span></header>
          <div className="stat-cols">
            {statCol('MIND', MIND_STATS)}
            {statCol('BODY', BODY_STATS)}
            {statCol('SPIRIT', SPIRIT_STATS)}
          </div>
        </section>
        <div className="span-4" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Panel title="Identity">
            <div className="body">
              <dl className="kv">
                <dt>Given name</dt><dd>{c.name.given}</dd>
                {c.name.family ? <><dt>Family</dt><dd>{c.name.family}</dd></> : null}
                {c.name.hold ? <><dt>{c.species === 'gholari' ? 'Grove' : 'Hold'}</dt><dd>{c.name.hold}</dd></> : null}
                {c.name.epithet ? <><dt>Scar-name</dt><dd>{c.name.epithet}</dd></> : null}
                {c.name.callsign ? <><dt>Callsign</dt><dd>{c.name.callsign}</dd></> : null}
                {c.name.courtName ? <><dt>Court name</dt><dd>{c.name.courtName}</dd></> : null}
                <dt>Where</dt><dd>{sector ? <button type="button" className="linklike" onClick={() => nav.openPlanet(planet!.id)}>{sector.name}, {planet!.name}</button> : '—'}</dd>
                <dt>Resonance</dt><dd>{c.resonance ? <span style={{ color: BAND_COLOR[c.resonance.band] }}>{cap(c.resonance.band)} · {c.resonance.degrees}°S · {c.resonance.type}</span> : '—'}</dd>
              </dl>
              <p className="muted" style={{ fontSize: 11, marginBottom: 0 }}>{SPECIES[c.species].note}</p>
            </div>
          </Panel>
          <Panel title="Status">
            <div className="body chips">
              {c.flags.length === 0 ? <span className="muted" style={{ fontSize: 12 }}>Nothing of note</span> : null}
              {c.flags.map((f, i) => {
                const def = FLAGS_BY_ID[f.id];
                return (
                  <span key={f.id + i} className={`chip ${def?.visibility === 'secret' ? 'secret' : ''}`} title={def?.endsBy}>
                    {def?.label ?? f.id}{f.detail ? <span className="k">· {f.detail}</span> : null}
                  </span>
                );
              })}
            </div>
          </Panel>
        </div>
        {kin.length > 0 ? (
          <Panel title={`Family ${family.name}`} className="span-6">
            {kin.map((k) => (
              <div className="row" key={k.id}>
                <span style={{ flex: 1 }}><PersonLink c={k} nav={nav} /></span>
                <span className="muted" style={{ fontSize: 11 }}>{k.alive ? `${k.role} · ${ageOf(k, world.date)}` : 'deceased'}</span>
              </div>
            ))}
          </Panel>
        ) : null}
        <section className={`panel debug ${kin.length > 0 ? 'span-6' : 'span-12'}`}>
          <header>
            <h3>Hidden (developer view)</h3>
            <button type="button" className="btn small" style={{ marginLeft: 'auto' }} onClick={() => setShowHidden((v) => !v)} aria-expanded={showHidden}>
              {showHidden ? 'Hide' : 'Show'}
            </button>
          </header>
          {showHidden ? (
            <div className="body">
              <p className="muted" style={{ fontSize: 11, marginTop: 0 }}>Players will never see this directly; it is here to check the generator.</p>
              {HIDDEN_STATS.map((s) => (
                <div className="stat" key={s}><span className="muted">{STAT_LABEL[s]}</span><span className={`v ${tierClass(c.hidden[s])}`}>{c.hidden[s]}</span></div>
              ))}
              <div className="stat"><span className="muted">Lifespan</span><span className="v">{c.lifespan}</span></div>
              {c.name.trueName ? <div className="stat"><span className="muted">True name</span><span className="v">{c.name.trueName}</span></div> : null}
            </div>
          ) : null}
        </section>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Houses

export function HousesView({ world, nav }: { world: World; nav: Nav }) {
  return (
    <>
      <div className="page-title"><h2>Houses</h2><p>The four houses of the vertical slice.</p></div>
      <div className="grid">
        {Object.values(world.houses).map((h) => {
          const ruler = h.rulerId ? world.characters[h.rulerId] : undefined;
          const fams = Object.values(world.families).filter((f) => f.houseId === h.id && !f.id.includes('commoner'));
          return (
            <section className="panel span-6" key={h.id}>
              <header>
                <h3>House {h.name}</h3>
                <span className="aside">{h.tier === 'great' ? 'Great House' : 'Minor House'} · {SPECIES[h.species].name}</span>
              </header>
              <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ margin: 0, color: 'var(--fg-2)', fontSize: 13 }}>{h.blurb}</p>
                <dl className="kv">
                  <dt>Highroy</dt><dd>{ruler ? <PersonLink c={ruler} nav={nav} /> : 'Vacant'}</dd>
                  <dt>Capital</dt><dd><button type="button" className="linklike" onClick={() => nav.openPlanet(h.capitalPlanetId)}>{world.planets[h.capitalPlanetId]!.name}</button></dd>
                  <dt>Surnames</dt><dd>{h.houseNameSurnames ? `Top families carry the name ${h.name}` : 'Own line names; the house name is never a surname'}</dd>
                </dl>
                <div style={{ display: 'grid', gap: 4 }}>
                  {Object.entries(h.personality).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                      <span className="muted" style={{ width: 80 }}>{cap(k)}</span>
                      <div className="bar"><span style={{ width: `${Math.round(v * 100)}%`, background: 'var(--blue)' }} /></div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="table-wrap">
                <table className="list">
                  <thead><tr><th>Family</th><th>Species</th><th>Members</th><th>Standing</th></tr></thead>
                  <tbody>
                    {fams.map((f) => (
                      <tr key={f.id}>
                        <td>{f.name}</td>
                        <td>{SPECIES[f.species].name}</td>
                        <td className="mono">{Object.values(world.characters).filter((c) => c.familyId === f.id && c.alive).length}</td>
                        <td className={f.ruling ? 'gold' : 'muted'}>{f.ruling ? 'Ruling' : f.high ? 'High' : 'Vassal'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Worlds

export function PlanetView({ world, nav, planetId, setPlanetId }: { world: World; nav: Nav; planetId: string; setPlanetId: (id: string) => void }) {
  const planet = world.planets[planetId] ?? Object.values(world.planets)[0]!;
  const [sectorId, setSectorId] = useState<string>(planet.sectors[0]!.id);
  const sector: Sector = planet.sectors.find((s) => s.id === sectorId) ?? planet.sectors[0]!;
  const here = Object.values(world.characters).filter((c) => c.alive && c.location.sectorId === sector.id);
  const peoples = Object.entries(sector.peoples).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));

  return (
    <>
      <div className="page-title">
        <h2>{planet.name}</h2>
        <p>{planet.description} {planet.sectors.length} of {planet.sectorLimit} sectors settled.</p>
      </div>
      <div className="filters">
        {Object.values(world.planets).map((p) => (
          <button key={p.id} type="button" className="pill" aria-pressed={p.id === planet.id}
            onClick={() => { setPlanetId(p.id); setSectorId(p.sectors[0]!.id); }}>
            {p.name} <span style={{ opacity: 0.7 }}>· {world.houses[p.houseId]!.name}</span>
          </button>
        ))}
      </div>
      <div className="grid">
        <section className="panel span-5">
          <header><h3>Sectors</h3></header>
          <div className="table-wrap">
            <table className="list">
              <thead><tr><th>Sector</th><th>Port</th><th>Room</th><th>Unrest</th></tr></thead>
              <tbody>
                {planet.sectors.map((s) => (
                  <tr key={s.id} className="clickable" onClick={() => setSectorId(s.id)} style={s.id === sector.id ? { boxShadow: 'inset 3px 0 0 var(--gold)' } : undefined}>
                    <td><button type="button" className="linklike" onClick={(e) => { e.stopPropagation(); setSectorId(s.id); }}>{s.name}</button><br /><span className="muted" style={{ fontSize: 11 }}>{s.designation}</span></td>
                    <td>{cap(s.port)}</td>
                    <td className="mono">{s.roomUsed}/{s.room}</td>
                    <td className="mono" style={{ color: s.unrest > 35 ? 'var(--orange)' : s.unrest > 18 ? 'var(--gold)' : 'var(--green)' }}>{s.controllerFamilyId ? s.unrest : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel span-7">
          <header><h3>{sector.name}</h3><span className="aside">{sector.population.toLocaleString('en-US')} people · {sector.controllerFamilyId ? `held by ${world.families[sector.controllerFamilyId]?.name}` : 'unclaimed'}</span></header>
          <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ margin: 0, color: 'var(--fg-2)' }}>{sector.description}</p>
            <div className="muted" style={{ fontSize: 12 }}>Peoples: {peoples.map(([sp, pct]) => `${SPECIES[sp as keyof typeof SPECIES].name} ${pct}%`).join(' · ')}</div>
          </div>
          <div className="table-wrap">
            <table className="list">
              <thead><tr><th>Quarter</th><th>Kind</th><th>What it gives</th><th>Overseer</th></tr></thead>
              <tbody>
                {sector.quarters.map((q) => {
                  const o = q.overseerId ? world.characters[q.overseerId] : undefined;
                  return (
                    <tr key={q.id}>
                      <td>{q.name}</td><td className="muted">{q.kind}</td><td>{q.gives}</td>
                      <td>{o ? <PersonLink c={o} nav={nav} /> : <span className="muted">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <header style={{ borderTop: '1px solid var(--line)' }}><h3>Who is here</h3><span className="aside">{here.length} named</span></header>
          {here.map((c) => (
            <div className="row" key={c.id}>
              <span style={{ flex: 1, minWidth: 0 }}><PersonLink c={c} nav={nav} /></span>
              <span className="muted" style={{ fontSize: 11 }}>{c.role} · {world.houses[c.houseId]!.name}</span>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Save & Load

export function SaveView({ world, setWorld }: { world: World; setWorld: (w: World) => void }) {
  const [seed, setSeed] = useState(world.seed);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<{ kind: 'notice' | 'error'; text: string } | null>(null);

  const say = (kind: 'notice' | 'error', text: string) => setMessage({ kind, text });
  const load = (text: string, from: string) => {
    try { setWorld(deserialize(text)); say('notice', `Loaded from ${from}.`); }
    catch (e) { say('error', e instanceof SaveError ? e.message : 'That save could not be read.'); }
  };

  return (
    <>
      <div className="page-title"><h2>Save &amp; Load</h2><p>The game also saves itself in this browser after every Continue.</p></div>
      {message ? <p className={message.kind}>{message.text}</p> : null}
      <div className="grid">
        <Panel title="Save slot" className="span-6">
          <div className="body" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn" onClick={() => say(storage.set(SLOT, serialize(world)) ? 'notice' : 'error', storage.get(SLOT) ? `Saved at ${formatDate(world.date)}.` : 'This browser blocked saving.')}>Save to slot</button>
            <button type="button" className="btn" onClick={() => { const s = storage.get(SLOT); if (s) load(s, 'the save slot'); else say('error', 'The save slot is empty.'); }}>Load slot</button>
          </div>
        </Panel>
        <Panel title="New world" className="span-6">
          <div className="body" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <label htmlFor="seed" className="eyebrow">Seed</label>
            <input id="seed" className="text" value={seed} onChange={(e) => setSeed(e.target.value)} />
            <button type="button" className="btn" onClick={() => { setWorld(createWorld(seed.trim() || 'stasia')); say('notice', `New world from seed "${seed.trim() || 'stasia'}".`); }}>Start new world</button>
            <span className="muted" style={{ fontSize: 11, flexBasis: '100%' }}>The same seed always builds the same world. Current seed: <span className="mono">{world.seed}</span></span>
          </div>
        </Panel>
        <Panel title="Save code" aside="Move a game between browsers" className="span-12">
          <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn" onClick={() => {
                const text = serialize(world);
                setCode(text);
                navigator.clipboard?.writeText(text).then(() => say('notice', 'Save code copied.'), () => say('notice', 'Save code is in the box below; select it and copy.'));
              }}>Copy save code</button>
              <button type="button" className="btn" onClick={() => (code.trim() ? load(code, 'the save code') : say('error', 'Paste a save code into the box first.'))}>Load from code</button>
              <label className="btn" htmlFor="save-file" style={{ display: 'inline-flex', alignItems: 'center' }}>Load from file…</label>
              <input id="save-file" type="file" accept=".json,.txt,application/json,text/plain" hidden onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const r = new FileReader();
                r.onload = () => load(String(r.result), f.name);
                r.readAsText(f);
              }} />
            </div>
            <label htmlFor="save-code" className="eyebrow">Save code</label>
            <textarea id="save-code" className="code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Paste a save code here to load it." />
          </div>
        </Panel>
      </div>
    </>
  );
}
