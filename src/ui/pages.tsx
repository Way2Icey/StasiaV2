import { useMemo, useState } from 'react';
import { ageOf } from '../sim/characters';
import { displayName } from '../sim/names';
import { councilOf, createWorld, SEAT_TITLE } from '../sim/world';
import { dateParts, formatDate } from '../sim/time';
import { deserialize, SaveError, serialize } from '../sim/save';
import {
  alive, familyHead, familyMembers, findSector, isCommoner, peopleAt, quartersOverseenBy,
  ruler, search, sectorsControlledBy, subordinatesOf, superiorOf, withFlag, withTrait,
} from '../sim/query';
import { SPECIES } from '../data/species';
import { TRAITS, TRAITS_BY_ID } from '../data/traits';
import { FLAGS_BY_ID } from '../data/flags';
import {
  BODY_STATS, HIDDEN_STATS, MIND_STATS, SPIRIT_STATS,
  type Character, type SpeciesId, type StatId, type World,
} from '../sim/types';
import { useGame, useNav, useWorld } from './context';
import { useSee } from './fog';
import { MissionRow } from './missions';
import { OathSummary, Petitions, StandingPanel } from './council';
import { formatRange, KNOW, knowledgeOf, type CharacterView } from '../sim/knowledge';
import { activeMissionOf, activeMissions, MISSION_LABEL } from '../sim/missions';
import {
  BAND_COLOR, BandLink, cap, FamilyLink, FlagChip, Go, HouseLink, Panel, PeopleTable, PersonById,
  PersonLink, PlanetLink, SectorLink, SpeciesLink, TraitChip, TraitList, TraitText,
} from './links';
import { storage, SLOT } from './storage';

// ---------------------------------------------------------------- shared

export const STAT_LABEL: Record<string, string> = {
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

const tierClass = (v: number) => (v >= 17 ? 't4' : v >= 13 ? 't3' : v >= 8 ? 't2' : 't1');

const BANDS: Record<string, { range: string; meaning: string }> = {
  frostpoint: { range: '0–49°S', meaning: 'No resonance. Cannot sync to a Caige.' },
  bluewake: { range: '50–119°S', meaning: 'Latent. Slight flux under stress; may awaken through trauma or the Drift.' },
  ambercore: { range: '120–249°S', meaning: 'Stable flux. Often trained Caige users.' },
  redline: { range: '250–399°S', meaning: 'Fully aligned and high-risk. Archon treats it as divine resonance.' },
  whitebreak: { range: '400°S+', meaning: 'Reality-interfering, rare and unstable. Often hunted.' },
};

function Title({ eyebrow, title, sub }: { eyebrow?: React.ReactNode; title: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="page-title">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        {eyebrow ? <span className="eyebrow gold">{eyebrow}</span> : null}
        <h2>{title}</h2>
        {sub ? <p>{sub}</p> : null}
      </div>
    </div>
  );
}

function Row({ left, right }: { left: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="row">
      <span style={{ flex: 1, minWidth: 0 }}>{left}</span>
      {right ? <span className="muted" style={{ fontSize: 11, textAlign: 'right' }}>{right}</span> : null}
    </div>
  );
}

// ---------------------------------------------------------------- Throne Room

function explore(world: World, see: (c: Character) => CharacterView): { key: string; node: React.ReactNode }[] {
  const people = alive(world).filter((c) => c.tier === 'full');
  const threads: { key: string; node: React.ReactNode }[] = [];
  const measured = (c: Character) => { const r = see(c).resonance; return r && r !== 'unknown' && r.degrees !== undefined ? r.degrees : -1; };
  const strongest = [...alive(world)].filter((c) => measured(c) >= 0).sort((a, b) => measured(b) - measured(a))[0];
  if (strongest) threads.push({ key: 'res', node: <>The strongest resonance on record belongs to <PersonLink c={strongest} />: <BandLink c={strongest} />.</> });
  const oldest = [...alive(world)].sort((a, b) => ageOf(b, world.date) - ageOf(a, world.date))[0];
  if (oldest) threads.push({ key: 'old', node: <>The oldest living person is <PersonLink c={oldest} />, a <SpeciesLink id={oldest.species} /> of {ageOf(oldest, world.date)}.</> });
  const scarred = people.find((c) => c.name.epithet);
  if (scarred) threads.push({ key: 'scar', node: <><PersonLink c={scarred} /> earned the scar-name <TraitText t={scarred.traits.find((t) => t.id === 'scarName')!} />.</> });
  const decorated = [...people].sort((a, b) => see(b).traits.length - see(a).traits.length)[0];
  if (decorated) threads.push({ key: 'dec', node: <><PersonLink c={decorated} /> carries more known traits than anyone: {see(decorated).traits.map((t, i) => <span key={t.id}>{i ? ', ' : ''}<TraitText t={t} /></span>)}.</> });
  const families = Object.values(world.families).filter((f) => !isCommoner(f));
  const holder = [...families].sort((a, b) => sectorsControlledBy(world, b.id).length - sectorsControlledBy(world, a.id).length)[0];
  if (holder) threads.push({ key: 'hold', node: <><FamilyLink id={holder.id} prefix /> holds {sectorsControlledBy(world, holder.id).length} sectors, more than any other family.</> });
  const foreignKnight = people.find((c) => c.houseId !== world.playerHouseId && c.flags.some((f) => f.id === 'caigeBonded'));
  if (foreignKnight) threads.push({ key: 'kn', node: <><PersonLink c={foreignKnight} /> of <HouseLink id={foreignKnight.houseId} /> is <Go to={{ kind: 'flag', id: 'caigeBonded' }}>Caige-bonded</Go>.</> });
  const survivor = people.find((c) => c.traits.some((t) => t.id === 'survivorOf'));
  if (survivor) threads.push({ key: 'surv', node: <><PersonLink c={survivor} /> is a <TraitText t={survivor.traits.find((t) => t.id === 'survivorOf')!} />.</> });
  return threads;
}

export function ThroneRoom() {
  const world = useWorld();
  const house = world.houses[world.playerHouseId]!;
  const council = councilOf(world, house.id);
  const parts = dateParts(world.date);
  const people = alive(world).filter((c) => c.houseId === house.id);
  const feed = [...world.feed].reverse().slice(0, 30);
  const see = useSee();
  const threads = explore(world, see);
  const missions = activeMissions(world, house.id);

  return (
    <>
      <Title title="The Throne Room" sub="Every name, place and label is a door. Hover a name for a preview; follow anything that catches your eye." />
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
            <dl className="kv">
              <dt>House</dt><dd><HouseLink id={house.id} /></dd>
              <dt>People of the house</dt><dd className="mono">{people.length}</dd>
              <dt>Noble families</dt><dd className="mono">{Object.values(world.families).filter((f) => f.houseId === house.id && !isCommoner(f)).length}</dd>
              <dt>Holdings</dt><dd><PlanetLink id={house.capitalPlanetId} /></dd>
            </dl>
          </div>
        </Panel>
        <Panel title="Council of Designers" className="span-7">
          {council.map((c) => (
            <Row key={c.id}
              left={<span style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}><span className="eyebrow gold" style={{ width: 110, flexShrink: 0 }}>{SEAT_TITLE[c.seat!]}</span><PersonLink c={c} /></span>}
              right={<><SpeciesLink id={c.species} /> · {ageOf(c, world.date)}</>} />
          ))}
        </Panel>
        <OathSummary className="span-6" />
        <Petitions className="span-6" />
        <Panel title="Missions in the field" aside={<Go to={{ kind: 'missions' }}>Missions board ›</Go>} className="span-12">
          {missions.length === 0 ? <p className="body muted" style={{ margin: 0 }}>No one is out. Open anyone's sheet to look into them, or a world to scout it.</p> : null}
          {missions.map((m) => <MissionRow key={m.id} id={m.id} />)}
        </Panel>
        <Panel title="Threads to follow" aside="Drawn from the world as it stands" className="span-5">
          <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
            {threads.map((t) => <p key={t.key} style={{ margin: 0 }}>{t.node}</p>)}
          </div>
        </Panel>
        <Panel title="The Chronicle" aside="Newest first" className="span-7 feed">
          {feed.map((e, i) => (
            <div className="row" key={`${e.date.year}-${e.date.cycle}-${i}`}>
              <time>{formatDate(e.date)}</time>
              <span className={`tag ${e.kind}`}>{e.kind}</span>
              <span style={{ fontSize: 13 }}>
                {e.text}
                {e.characterIds?.length ? <> {e.characterIds.map((id) => <span key={id}> · <PersonById id={id} /></span>)}</> : null}
                {e.missionId && world.missions[e.missionId] ? <> · <Go to={{ kind: 'mission', id: e.missionId }}>{world.missions[e.missionId]!.stage === 'done' ? 'Read report' : 'View mission'}</Go></> : null}
              </span>
            </div>
          ))}
        </Panel>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- People

export function PeoplePage() {
  const world = useWorld();
  const [house, setHouse] = useState<string>('all');
  const [tier, setTier] = useState<'full' | 'minor' | 'all'>('full');
  const [q, setQ] = useState('');
  const see = useSee();
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return alive(world)
      .filter((c) => house === 'all' || c.houseId === house)
      .filter((c) => tier === 'all' || c.tier === tier)
      .filter((c) => !needle || displayName(c.name).toLowerCase().includes(needle) || c.role.toLowerCase().includes(needle));
  }, [world, house, tier, q]);

  return (
    <>
      <Title title="People" sub={`${rows.length} shown. Names come from each house's culture.`} />
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
        <label htmlFor="people-filter" className="eyebrow" style={{ marginLeft: 8 }}>Filter</label>
        <input id="people-filter" className="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or role" />
      </div>
      <section className="panel">
        <div className="table-wrap">
          <table className="list">
            <thead><tr><th>Name</th><th>House</th><th>Species</th><th>Age</th><th>Role</th><th>Traits</th><th>Resonance</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td><PersonLink c={c} /></td>
                  <td><HouseLink id={c.houseId} /></td>
                  <td><SpeciesLink id={c.species} /></td>
                  <td className="mono">{ageOf(c, world.date)}</td>
                  <td>{c.role}</td>
                  <td><TraitList c={c} /></td>
                  <td>{(() => { const r = see(c).resonance; return r && (r === 'unknown' || r.band !== 'frostpoint') ? <BandLink c={c} /> : <span className="muted">—</span>; })()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------- Character

function initials(c: Character) {
  const a = c.name.given.charAt(0);
  const b = (c.name.family ?? c.name.hold ?? '').replace(/^the /, '').charAt(0);
  return (a + b).toUpperCase();
}

export function CharacterPage({ id }: { id: string }) {
  const world = useWorld();
  const { reveal } = useGame();
  const see = useSee();
  const c = world.characters[id];
  if (!c) return <p className="error">That person is not in this world.</p>;
  const v = see(c);
  const own = c.houseId === world.playerHouseId;
  const family = world.families[c.familyId]!;
  const where = findSector(world, c.location.sectorId);
  const kin = familyMembers(world, c.familyId, true).filter((k) => k.id !== c.id);
  const boss = superiorOf(world, c);
  const reports = subordinatesOf(world, c);
  const oversees = quartersOverseenBy(world, c.id);
  const neighbours = where ? peopleAt(world, where.sector.id).filter((k) => k.id !== c.id && k.houseId === c.houseId) : [];
  const onMission = activeMissionOf(world, c.id);
  const beingInvestigated = activeMissions(world, world.playerHouseId).find((m) => m.targetId === c.id);
  const entry = knowledgeOf(world, world.playerHouseId, c.id);
  const trueNameKnown = reveal || c.flags.some((f) => f.id === 'trueNameKnown' && f.knownBy?.includes(world.playerHouseId));
  const res = v.resonance;

  const statCell = (r: [number, number]) => {
    const mid = (r[0] + r[1]) / 2;
    return <span className={`v ${tierClass(mid)}${r[0] === r[1] ? '' : ' fuzzy'}`}>{formatRange(r)}</span>;
  };
  const statCol = (title: string, ids: readonly StatId[]) => (
    <div>
      <h4>{title}</h4>
      {ids.map((s) => (
        <div className="stat" key={s}><span className="muted">{STAT_LABEL[s]}</span>{statCell(v.stats[s])}</div>
      ))}
    </div>
  );

  return (
    <>
      <section className="panel">
        <div className="body sheet-head">
          <div className="portrait" aria-hidden="true">{initials(c)}</div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="eyebrow gold">{c.role}{c.alive ? '' : ` · died ${formatDate(c.death!.date)} (${c.death!.cause})`}</span>
            <h2>{displayName(c.name)}</h2>
            <span className="muted" style={{ fontSize: 12 }}>
              House <HouseLink id={c.houseId} /> · <SpeciesLink id={c.species} /> · age {ageOf(c, world.date)} · {family.ruling ? 'ruling ' : family.high ? 'high ' : ''}family <FamilyLink id={family.id} />
              {c.tier === 'minor' ? ' · minor named' : ''}
            </span>
            <div className="chips">
              {v.traits.length === 0 && v.hiddenTraits === 0 ? <span className="muted" style={{ fontSize: 12 }}>No notable traits</span> : null}
              {v.traits.map((t, i) => <TraitChip key={t.id + i} t={t} />)}
              {v.hiddenTraits > 0 ? <span className="chip unknown" title="Your people have not learned this yet">{v.hiddenTraits} unknown</span> : null}
              {onMission ? <Go to={{ kind: 'mission', id: onMission.id }} className="chip link mission">On mission · {MISSION_LABEL[onMission.kind]}</Go> : null}
            </div>
          </div>
        </div>
      </section>

      <section className="panel knowledge">
        <div className="body" style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 180, flex: 1 }}>
            <span className="eyebrow">What your house knows</span>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <strong style={{ fontFamily: 'var(--display)', fontWeight: 500 }}>{v.label}</strong>
              <div className="bar" style={{ maxWidth: 220 }} role="img" aria-label={`Knowledge ${v.depth} of 100`}>
                <span style={{ width: `${v.depth}%`, background: v.depth >= KNOW.exact ? 'var(--gold)' : 'var(--blue)' }} />
              </div>
              <span className="mono muted" style={{ fontSize: 11 }}>{v.depth}</span>
            </div>
            <span className="muted" style={{ fontSize: 11 }}>
              {v.depth >= KNOW.exact ? 'Numbers are exact.' : 'Numbers are ranges: the truth lies somewhere inside.'}
              {entry.salt > 0 ? ` Last report ${formatDate(entry.updated)}.` : ''}
            </span>
          </div>
          {c.alive && !own ? (
            beingInvestigated ? (
              <Go to={{ kind: 'mission', id: beingInvestigated.id }} className="btn">Investigation under way ›</Go>
            ) : (
              <Go to={{ kind: 'plan', mission: 'investigate', target: c.id }} className="btn primary">Investigate</Go>
            )
          ) : null}
          {c.alive && own && v.depth < KNOW.exact && c.seat !== 'highroy' ? (
            beingInvestigated ? null : <Go to={{ kind: 'plan', mission: 'investigate', target: c.id }} className="btn">Look into them</Go>
          ) : null}
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
        <div className="span-4 stack">
          <Panel title="Identity">
            <div className="body">
              <dl className="kv">
                <dt>Given name</dt><dd>{c.name.given}</dd>
                {c.name.family ? <><dt>Family</dt><dd><FamilyLink id={family.id} /></dd></> : null}
                {c.name.hold ? <><dt>{c.species === 'gholari' ? 'Grove' : 'Hold'}</dt><dd><FamilyLink id={family.id} /></dd></> : null}
                {c.name.epithet ? <><dt>Scar-name</dt><dd>{c.name.epithet}</dd></> : null}
                {c.name.callsign ? <><dt>Callsign</dt><dd>{c.name.callsign}</dd></> : null}
                {c.name.courtName ? <><dt>Court name</dt><dd>{c.name.courtName}</dd></> : null}
                {c.name.trueName ? <><dt>True name</dt><dd>{trueNameKnown ? c.name.trueName : <span className="muted">Unknown</span>}</dd></> : null}
                <dt>Where</dt><dd>{where ? <SectorLink id={where.sector.id} withPlanet /> : '—'}</dd>
                <dt>Resonance</dt><dd><BandLink c={c} />{res && res !== 'unknown' && res.type ? <span className="muted"> · {res.type}</span> : null}</dd>
              </dl>
            </div>
          </Panel>
          <Panel title="Status">
            <div className="body chips">
              {v.flags.length === 0 ? <span className="muted" style={{ fontSize: 12 }}>Nothing of note</span> : null}
              {v.flags.map((f, i) => <FlagChip key={f.id + i} f={f} />)}
            </div>
          </Panel>
          {v.hidden ? (
            <Panel title="Read of them" aside={reveal ? 'exact' : 'from your people'}>
              <div className="body">
                {HIDDEN_STATS.filter((s) => s !== 'potential' || reveal).map((s) => (
                  <div className="stat" key={s}><span className="muted">{STAT_LABEL[s]}</span>{statCell(v.hidden![s])}</div>
                ))}
              </div>
            </Panel>
          ) : null}
        </div>

        <Panel title="Place in the house" className="span-6">
          <Row left={<><span className="eyebrow" style={{ marginRight: 10 }}>Answers to</span>{boss ? <PersonLink c={boss} /> : <span className="muted">No one: heads the house</span>}</>} right={boss?.role} />
          {oversees.map((o) => (
            <Row key={o.quarter.id} left={<><span className="eyebrow" style={{ marginRight: 10 }}>Oversees</span>{o.quarter.name}, <SectorLink id={o.sector.id} /></>} right={o.quarter.gives} />
          ))}
          {reports.length > 0 ? (
            <>
              <div className="row"><span className="eyebrow">Answering to {c.name.given} ({reports.length})</span></div>
              {reports.slice(0, 12).map((k) => <Row key={k.id} left={<PersonLink c={k} />} right={k.role} />)}
              {reports.length > 12 ? <Row left={<span className="muted">and {reports.length - 12} more</span>} /> : null}
            </>
          ) : null}
        </Panel>

        <Panel title={<>Family <FamilyLink id={family.id} /></>} aside={`${kin.length} others`} className="span-6">
          {kin.length === 0 ? <p className="body muted" style={{ margin: 0 }}>No other named members.</p> : null}
          {kin.slice(0, 12).map((k) => <Row key={k.id} left={<PersonLink c={k} />} right={k.alive ? `${k.role} · ${ageOf(k, world.date)}` : 'deceased'} />)}
        </Panel>

        {where ? (
          <Panel title={<>Also at <SectorLink id={where.sector.id} /></>} aside={`${neighbours.length} of the same house`} className="span-6">
            {neighbours.slice(0, 10).map((k) => <Row key={k.id} left={<PersonLink c={k} />} right={k.role} />)}
            {neighbours.length > 10 ? <Row left={<SectorLink id={where.sector.id} />} right={`${neighbours.length - 10} more`} /> : null}
          </Panel>
        ) : null}

        {reveal ? (
          <section className="panel debug span-6">
            <header><h3>Developer view</h3></header>
            <div className="body">
              <div className="stat"><span className="muted">Lifespan</span><span className="v">{c.lifespan}</span></div>
              <div className="stat"><span className="muted">True knowledge depth</span><span className="v">{entry.depth}</span></div>
              {Object.keys(world.houses).filter((h) => h !== world.playerHouseId).map((h) => (
                <div className="stat" key={h}><span className="muted">{world.houses[h]!.name} knows</span><span className="v">{knowledgeOf(world, h, c.id).depth}</span></div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Houses

export function HousesPage() {
  const world = useWorld();
  return (
    <>
      <Title title="Houses" sub="The four houses of the vertical slice." />
      <div className="grid">
        {Object.values(world.houses).map((h) => {
          const r = ruler(world, h.id);
          return (
            <Panel key={h.id} title={<Go to={{ kind: 'house', id: h.id }}>House {h.name}</Go>} aside={`${h.tier === 'great' ? 'Great' : 'Minor'} · ${SPECIES[h.species].name}`} className="span-6">
              <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ margin: 0, color: 'var(--fg-2)', fontSize: 13 }}>{h.blurb}</p>
                <dl className="kv">
                  <dt>Highroy</dt><dd>{r ? <PersonLink c={r} /> : 'Vacant'}</dd>
                  <dt>Capital</dt><dd><PlanetLink id={h.capitalPlanetId} /></dd>
                  <dt>People</dt><dd className="mono">{alive(world).filter((c) => c.houseId === h.id).length}</dd>
                </dl>
                <div><Go to={{ kind: 'house', id: h.id }} className="btn small">Open House {h.name} ›</Go></div>
              </div>
            </Panel>
          );
        })}
      </div>
    </>
  );
}

export function HousePage({ id }: { id: string }) {
  const world = useWorld();
  const h = world.houses[id];
  if (!h) return <p className="error">No such house.</p>;
  const r = ruler(world, h.id);
  const council = councilOf(world, h.id);
  const fams = Object.values(world.families).filter((f) => f.houseId === h.id && !isCommoner(f));
  const capital = world.planets[h.capitalPlanetId]!;
  const knights = alive(world).filter((c) => c.houseId === h.id && c.flags.some((f) => f.id === 'knighted'));

  return (
    <>
      <Title eyebrow={`${h.tier === 'great' ? 'Great House' : 'Minor House'} of Archon`} title={`House ${h.name}`} sub={h.blurb} />
      {h.id !== world.playerHouseId ? (
        <div className="actions">
          <Go to={{ kind: 'plan', mission: 'envoy', target: h.id }} className="btn primary">Send an envoy</Go>
          <Go to={{ kind: 'plan', mission: 'scout', target: h.capitalPlanetId }} className="btn">Scout their capital</Go>
        </div>
      ) : null}
      <div className="grid">
        <StandingPanel houseId={h.id} className="span-12" />
        <Panel title="Rule" className="span-5">
          <div className="body">
            <dl className="kv">
              <dt>Highroy</dt><dd>{r ? <PersonLink c={r} /> : 'Vacant'}</dd>
              <dt>Ruling species</dt><dd><SpeciesLink id={h.species} /></dd>
              <dt>Capital</dt><dd><PlanetLink id={capital.id} /></dd>
              <dt>Surnames</dt><dd>{h.houseNameSurnames ? `Top families carry the name ${h.name}` : 'Own line names; the house name is never a surname'}</dd>
            </dl>
            <div style={{ display: 'grid', gap: 4, marginTop: 12 }}>
              <span className="eyebrow">Temperament</span>
              {Object.entries(h.personality).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                  <span className="muted" style={{ width: 80 }}>{cap(k)}</span>
                  <div className="bar"><span style={{ width: `${Math.round(v * 100)}%`, background: 'var(--blue)' }} /></div>
                </div>
              ))}
            </div>
          </div>
        </Panel>
        <Panel title="Council" className="span-7">
          {council.map((c) => <Row key={c.id} left={<span style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}><span className="eyebrow gold" style={{ width: 110, flexShrink: 0 }}>{SEAT_TITLE[c.seat!]}</span><PersonLink c={c} /></span>} right={<FamilyLink id={c.familyId} />} />)}
        </Panel>
        <Panel title="Families" aside={`${fams.length} noble families`} className="span-7">
          <div className="table-wrap">
            <table className="list">
              <thead><tr><th>Family</th><th>Species</th><th>Head</th><th>Members</th><th>Holds</th><th>Standing</th></tr></thead>
              <tbody>
                {fams.map((f) => (
                  <tr key={f.id}>
                    <td><FamilyLink id={f.id} /></td>
                    <td><SpeciesLink id={f.species} /></td>
                    <td><PersonById id={familyHead(world, f.id)?.id} /></td>
                    <td className="mono">{familyMembers(world, f.id).length}</td>
                    <td>{sectorsControlledBy(world, f.id).map((s, i) => <span key={s.sector.id}>{i ? ', ' : ''}<SectorLink id={s.sector.id} /></span>)}</td>
                    <td className={f.ruling ? 'gold' : 'muted'}>{f.ruling ? 'Ruling' : f.high ? 'High' : 'Vassal'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title={<>Sectors of <PlanetLink id={capital.id} /></>} className="span-5">
          {capital.sectors.map((s) => <Row key={s.id} left={<SectorLink id={s.id} />} right={s.controllerFamilyId ? <FamilyLink id={s.controllerFamilyId} /> : 'unclaimed'} />)}
        </Panel>
        <Panel title="Knights" aside={`${knights.length}`} className="span-12">
          <PeopleTable people={knights} empty="No knights." extra={{ label: 'Traits', cell: (k) => <TraitList c={k} /> }} />
        </Panel>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Family

export function FamilyPage({ id }: { id: string }) {
  const world = useWorld();
  const f = world.families[id];
  if (!f) return <p className="error">No such family.</p>;
  const head = familyHead(world, f.id);
  const members = familyMembers(world, f.id, true);
  const holds = sectorsControlledBy(world, f.id);
  const oversees = members.flatMap((m) => quartersOverseenBy(world, m.id).map((q) => ({ ...q, who: m })));

  return (
    <>
      <Title eyebrow={<>House <HouseLink id={f.houseId} /> · {f.ruling ? 'ruling family' : f.high ? 'high family' : isCommoner(f) ? 'common family' : 'vassal family'}</>}
        title={`Family ${f.name}`} sub={<><SpeciesLink id={f.species} /> · {members.filter((m) => m.alive).length} living named members</>} />
      <div className="grid">
        <Panel title="Members" className="span-8">
          <PeopleTable people={members} extra={{ label: 'Traits', cell: (k) => <TraitList c={k} /> }} />
        </Panel>
        <div className="span-4 stack">
          <Panel title="Head of the family">
            <div className="body">{head ? <><PersonLink c={head} /><div className="muted" style={{ fontSize: 11 }}>{head.role}</div></> : <span className="muted">None</span>}</div>
          </Panel>
          <Panel title="Holds" aside={`${holds.length} sectors`}>
            {holds.length === 0 ? <p className="body muted" style={{ margin: 0 }}>No sectors.</p> : null}
            {holds.map((s) => <Row key={s.sector.id} left={<SectorLink id={s.sector.id} withPlanet />} right={s.sector.designation} />)}
          </Panel>
          <Panel title="Quarters run by the family">
            {oversees.length === 0 ? <p className="body muted" style={{ margin: 0 }}>None.</p> : null}
            {oversees.map((o) => <Row key={o.quarter.id} left={<>{o.quarter.name}, <SectorLink id={o.sector.id} /></>} right={<PersonLink c={o.who} short />} />)}
          </Panel>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Worlds

export function WorldsPage() {
  const world = useWorld();
  return (
    <>
      <Title title="Worlds" sub="The capitals of the four houses." />
      <div className="grid">
        {Object.values(world.planets).map((p) => (
          <Panel key={p.id} title={<PlanetLink id={p.id} />} aside={<HouseLink id={p.houseId} />} className="span-6">
            <div className="body" style={{ fontSize: 13, color: 'var(--fg-2)' }}>{p.description}</div>
            {p.sectors.map((s) => <Row key={s.id} left={<SectorLink id={s.id} />} right={`${s.designation} · ${s.population.toLocaleString('en-US')}`} />)}
          </Panel>
        ))}
      </div>
    </>
  );
}

export function PlanetPage({ id }: { id: string }) {
  const world = useWorld();
  const p = world.planets[id];
  if (!p) return <p className="error">No such world.</p>;
  const pop = p.sectors.reduce((s, x) => s + x.population, 0);
  return (
    <>
      <Title eyebrow={<>Capital of House <HouseLink id={p.houseId} /></>} title={p.name} sub={`${p.description} ${pop.toLocaleString('en-US')} people · ${p.sectors.length} of ${p.sectorLimit} sectors settled.`} />
      {p.houseId !== world.playerHouseId ? (
        <div className="actions">
          <Go to={{ kind: 'plan', mission: 'scout', target: p.id }} className="btn primary">Scout this world</Go>
          <span className="muted" style={{ fontSize: 12 }}>Send someone to learn who lives here and how it is held.</span>
        </div>
      ) : null}
      <section className="panel">
        <div className="table-wrap">
          <table className="list">
            <thead><tr><th>Sector</th><th>Designation</th><th>Port</th><th>Room</th><th>People</th><th>Held by</th><th>Unrest</th></tr></thead>
            <tbody>
              {p.sectors.map((s) => (
                <tr key={s.id}>
                  <td><SectorLink id={s.id} /></td>
                  <td className="muted">{s.designation}</td>
                  <td>{cap(s.port)}</td>
                  <td className="mono">{s.roomUsed}/{s.room}</td>
                  <td className="mono">{s.population.toLocaleString('en-US')}</td>
                  <td>{s.controllerFamilyId ? <FamilyLink id={s.controllerFamilyId} /> : <span className="muted">Unclaimed</span>}</td>
                  <td className="mono" style={{ color: s.unrest > 35 ? 'var(--orange)' : s.unrest > 18 ? 'var(--gold)' : 'var(--green)' }}>{s.controllerFamilyId ? s.unrest : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

export function SectorPage({ id }: { id: string }) {
  const world = useWorld();
  const found = findSector(world, id);
  if (!found) return <p className="error">No such sector.</p>;
  const { planet, sector } = found;
  const here = peopleAt(world, sector.id);
  const peoples = Object.entries(sector.peoples).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  return (
    <>
      <Title eyebrow={<><PlanetLink id={planet.id} /> · {sector.designation}</>} title={sector.name} sub={sector.description} />
      <div className="grid">
        <Panel title="The sector" className="span-4">
          <div className="body">
            <dl className="kv">
              <dt>Held by</dt><dd>{sector.controllerFamilyId ? <FamilyLink id={sector.controllerFamilyId} /> : 'Unclaimed'}</dd>
              <dt>Port</dt><dd>{cap(sector.port)}</dd>
              <dt>Room</dt><dd className="mono">{sector.roomUsed} of {sector.room} used</dd>
              <dt>Population</dt><dd className="mono">{sector.population.toLocaleString('en-US')}</dd>
              <dt>Unrest</dt><dd className="mono">{sector.controllerFamilyId ? sector.unrest : '—'}</dd>
            </dl>
            <div style={{ marginTop: 10, display: 'grid', gap: 4 }}>
              <span className="eyebrow">Peoples</span>
              {peoples.map(([sp, pct]) => (
                <div key={sp} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <span style={{ width: 70 }}><SpeciesLink id={sp} /></span>
                  <div className="bar"><span style={{ width: `${pct}%`, background: 'var(--blue)' }} /></div>
                  <span className="mono muted" style={{ width: 32, textAlign: 'right' }}>{pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>
        <Panel title="Quarters" className="span-8">
          <div className="table-wrap">
            <table className="list">
              <thead><tr><th>Quarter</th><th>Kind</th><th>What it gives</th><th>Overseer</th></tr></thead>
              <tbody>
                {sector.quarters.map((q) => (
                  <tr key={q.id}><td>{q.name}</td><td className="muted">{q.kind}</td><td>{q.gives}</td><td><PersonById id={q.overseerId} /></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Who is here" aside={`${here.length} named`} className="span-12">
          <PeopleTable people={here} />
        </Panel>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Traits, flags, species, bands

export function TraitPage({ id }: { id: string }) {
  const world = useWorld();
  const def = TRAITS_BY_ID[id];
  if (!def) return <p className="error">No such trait.</p>;
  const see = useSee();
  const who = withTrait(world, id).filter((c) => see(c).traits.some((t) => t.id === id));
  const mods = Object.entries(def.statMods ?? {});
  const opposite = def.opposes ?? [];
  return (
    <>
      <Title eyebrow={`${cap(def.category)} trait`} title={def.label.replace(' {detail}', ' …').replace('{detail}', 'Scar-name')} sub={def.description} />
      <div className="grid">
        <Panel title="Effects" className="span-4">
          <div className="body" style={{ display: 'grid', gap: 6, fontSize: 12 }}>
            {mods.length === 0 ? <span className="muted">No direct stat changes; it changes options and reactions.</span> : null}
            {mods.map(([k, v]) => <div key={k} className="stat"><span className="muted">{STAT_LABEL[k]}</span><span className="v" style={{ color: (v ?? 0) > 0 ? 'var(--green)' : 'var(--orange)' }}>{(v ?? 0) > 0 ? '+' : ''}{v}</span></div>)}
            {def.lifespanBonus ? <div className="stat"><span className="muted">Lifespan</span><span className="v" style={{ color: 'var(--green)' }}>+{def.lifespanBonus} years</span></div> : null}
            {opposite.length ? <div>Never held with: {opposite.map((o, i) => <span key={o}>{i ? ', ' : ''}<Go to={{ kind: 'trait', id: o }}>{TRAITS_BY_ID[o]?.label}</Go></span>)}</div> : null}
          </div>
        </Panel>
        <Panel title="Who has it" aside={`${who.length} living`} className="span-8">
          <PeopleTable people={who} empty="No one living has this trait." extra={def.label.includes('{detail}') ? { label: 'As', cell: (c) => c.traits.filter((t) => t.id === id).map((t) => t.detail).join(', ') } : undefined} />
        </Panel>
        <Panel title="Other traits" className="span-12">
          <div className="body chips">
            {TRAITS.filter((t) => t.id !== id).map((t) => <Go key={t.id} to={{ kind: 'trait', id: t.id }} className="chip link">{t.label.replace(' {detail}', '').replace('{detail}', 'Scar-name')}</Go>)}
          </div>
        </Panel>
      </div>
    </>
  );
}

export function FlagPage({ id }: { id: string }) {
  const world = useWorld();
  const def = FLAGS_BY_ID[id];
  if (!def) return <p className="error">No such status.</p>;
  const see = useSee();
  const who = withFlag(world, id).filter((c) => see(c).flags.some((f) => f.id === id));
  return (
    <>
      <Title eyebrow={`Status flag · ${def.kind}`} title={def.label} sub={`Ends: ${def.endsBy}. ${def.visibility === 'secret' ? 'Secret: only those who discover it will see it.' : 'Visible to everyone.'}`} />
      <Panel title="Who carries it" aside={`${who.length} living`}>
        <PeopleTable people={who} empty="No one carries this status right now." extra={{ label: 'Detail', cell: (c) => c.flags.filter((f) => f.id === id).map((f) => f.detail).filter(Boolean).join(', ') }} />
      </Panel>
    </>
  );
}

export function SpeciesPage({ id }: { id: string }) {
  const world = useWorld();
  const sp = SPECIES[id as SpeciesId];
  if (!sp) return <p className="error">No such people.</p>;
  const who = alive(world).filter((c) => c.species === id && c.tier === 'full');
  const houses = Object.values(world.houses).filter((h) => h.species === id);
  return (
    <>
      <Title eyebrow="People of Stasia" title={sp.name} sub={sp.note} />
      <div className="grid">
        <Panel title="Nature" className="span-4">
          <div className="body" style={{ display: 'grid', gap: 6, fontSize: 12 }}>
            <div className="stat"><span className="muted">Lifespan</span><span className="v">{sp.lifespan[0]}–{sp.lifespan[1]} years</span></div>
            <div className="stat"><span className="muted">Adulthood</span><span className="v">{sp.adulthood}</span></div>
            <div className="stat"><span className="muted">Drift resistance</span><span className="v">{sp.driftResistance > 0 ? `+${sp.driftResistance}` : sp.driftResistance}</span></div>
            <span className="eyebrow" style={{ marginTop: 6 }}>Natural strengths and weaknesses</span>
            {Object.entries(sp.statMods).map(([k, v]) => <div key={k} className="stat"><span className="muted">{STAT_LABEL[k]}</span><span className="v" style={{ color: (v ?? 0) > 0 ? 'var(--green)' : 'var(--orange)' }}>{(v ?? 0) > 0 ? '+' : ''}{v}</span></div>)}
            {houses.length ? <div style={{ marginTop: 6 }}>Rules: {houses.map((h, i) => <span key={h.id}>{i ? ', ' : ''}<HouseLink id={h.id} /></span>)}</div> : null}
          </div>
        </Panel>
        <Panel title={`${sp.name} with full sheets`} aside={`${who.length}`} className="span-8">
          <PeopleTable people={who} />
        </Panel>
      </div>
    </>
  );
}

export function BandPage({ id }: { id: string }) {
  const world = useWorld();
  const band = BANDS[id];
  if (!band) return <p className="error">No such band.</p>;
  const see = useSee();
  const known = (c: Character) => { const r = see(c).resonance; return r && r !== 'unknown' && r.band === id ? r : null; };
  const who = alive(world).filter((c) => known(c)).sort((a, b) => (known(b)!.degrees ?? 0) - (known(a)!.degrees ?? 0));
  return (
    <>
      <Title eyebrow={`Resonance band · ${band.range}`} title={<span style={{ color: BAND_COLOR[id] }}>{cap(id)}</span>} sub={band.meaning} />
      <div className="filters">
        {Object.keys(BANDS).map((b) => <Go key={b} to={{ kind: 'band', id: b }} className="pill">{cap(b)}</Go>)}
      </div>
      <Panel title="Who resonates here" aside={`${who.length} living`}>
        <PeopleTable people={who} empty="No one your people know of." extra={{ label: '°S', cell: (c) => { const r = known(c)!; return <span className="mono">{r.degrees !== undefined ? `${r.degrees} · ${r.type}` : 'not measured'}</span>; } }} />
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------- Search

export function SearchPage({ q }: { q: string }) {
  const world = useWorld();
  const r = search(world, q);
  const total = r.people.length + r.families.length + r.places.length;
  return (
    <>
      <Title title={`Search: ${q}`} sub={`${total} results`} />
      <div className="grid">
        <Panel title="Places" aside={`${r.places.length}`} className="span-6">
          {r.places.length === 0 ? <p className="body muted" style={{ margin: 0 }}>None.</p> : null}
          {r.places.map((p) => <Row key={(p.sector?.id ?? p.planet.id)} left={p.sector ? <SectorLink id={p.sector.id} withPlanet /> : <PlanetLink id={p.planet.id} />} right={p.sector?.designation ?? 'World'} />)}
        </Panel>
        <Panel title="Families" aside={`${r.families.length}`} className="span-6">
          {r.families.length === 0 ? <p className="body muted" style={{ margin: 0 }}>None.</p> : null}
          {r.families.map((f) => <Row key={f.id} left={<FamilyLink id={f.id} />} right={<HouseLink id={f.houseId} />} />)}
        </Panel>
        <Panel title="People" aside={`${r.people.length}`} className="span-12">
          <PeopleTable people={r.people.slice(0, 80)} empty="No one by that name or role." />
        </Panel>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Save & Load

export function SavePage({ setWorld }: { setWorld: (w: World) => void }) {
  const world = useWorld();
  const nav = useNav();
  const [seed, setSeed] = useState(world.seed);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<{ kind: 'notice' | 'error'; text: string } | null>(null);
  const say = (kind: 'notice' | 'error', text: string) => setMessage({ kind, text });
  const load = (text: string, from: string) => {
    try { setWorld(deserialize(text)); say('notice', `Loaded from ${from}.`); nav.to({ kind: 'throne' }); }
    catch (e) { say('error', e instanceof SaveError ? e.message : 'That save could not be read.'); }
  };

  return (
    <>
      <Title title="Save & Load" sub="The game also saves itself in this browser after every Continue." />
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
            <button type="button" className="btn" onClick={() => { setWorld(createWorld(seed.trim() || 'stasia')); nav.to({ kind: 'throne' }); }}>Start new world</button>
            <span className="muted" style={{ fontSize: 11, flexBasis: '100%' }}>The same seed always builds the same world. Current seed: <span className="mono">{world.seed}</span></span>
          </div>
        </Panel>
        <DevPanel />
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
                const reader = new FileReader();
                reader.onload = () => load(String(reader.result), f.name);
                reader.readAsText(f);
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

function DevPanel() {
  const game = useGame();
  return (
    <section className="panel debug span-12">
      <header><h3>Developer</h3></header>
      <div className="body" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <input type="checkbox" checked={game.reveal} onChange={(e) => game.setReveal(e.target.checked)} />
          Reveal everything (ignore the knowledge fog)
        </label>
        <span className="muted" style={{ fontSize: 11 }}>For checking the generator. Players will not have this.</span>
      </div>
    </section>
  );
}
