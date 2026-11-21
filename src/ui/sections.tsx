// The rail's sections and their hub pages: a strip of tabs under each section, and the pages that
// gather features which used to live wherever they were first attached.
import { useState } from 'react';
import { useGame, useNav, useWorld } from './context';
import { Go, HouseLink, Panel, PersonLink } from './links';
import { Term } from './tip';
import { SUBTABS, type Route, type Section } from './router';
import { FleetPanel } from './fleet';
import { EmbassyPanel, OurCourtEmbassies } from './embassies';
import { LoansPanel } from './loans';
import { ModuleView } from './holdings';
import { Challenges } from './grounds';
import { PinButton } from './careers';
import { isMilitary, fightScore } from '../sim/grounds';
import { cannotHoldAudience, cannotKnight, holdAudience, knight } from '../sim/ambitions';
import { seasonLine, titlesOf, totals } from '../sim/careers';
import { activeMissions } from '../sim/missions';
import { currentRound } from '../sim/crucible';
import { isAway } from '../sim/court';
import { heldSectors } from '../sim/economy';
import { buildCost, buildModule, cannotBuild, MODULE_LABEL, MODULE_NOTE, modulesOf, placeOf, reservesOf, SECTOR_KINDS, type ModuleKind } from '../sim/holdings';
import { ageOf } from '../sim/characters';
import { mentorOf, proofOf, sternness } from '../sim/ladder';
import { absoluteCycle } from '../sim/time';
import { SPECIES } from '../data/species';
import { SEAT_TITLE } from '../sim/world';
import type { World } from '../sim/types';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

function usePlay() {
  const game = useGame();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: (w: World) => World) => game.update((w) => { try { setErr(null); return fn(w); } catch (e) { setErr((e as Error).message); return w; } });
  return { run, err };
}

/** The strip of tabs under a section. */
export function SubTabs({ section, current }: { section: Section | null; current: Route }) {
  const nav = useNav();
  const tabs = section ? SUBTABS[section] : undefined;
  if (!tabs) return null;
  return (
    <nav className="subtabs" aria-label="Section">
      {tabs.map((t) => (
        <button key={t.label} type="button" className="subtab" aria-current={t.on(current) ? 'page' : undefined} onClick={() => nav.to(t.to)}>{t.label}</button>
      ))}
    </nav>
  );
}

/** How much is waiting in each section: gold when the Highroy must decide. */
export function railCount(world: World, s: Section): { gold?: number; plain?: number } {
  const P = world.playerHouseId;
  if (s === 'hall') {
    const g = world.grounds;
    const n = (world.events?.pending.length ?? 0) + (world.ambitions?.audiences.length ?? 0) + (world.courts[P]?.petitions.length ?? 0)
      + (g?.challenges.length ?? 0) + (world.training?.intake?.length ?? 0) + (world.training?.pupilOffers?.length ?? 0)
      + (g?.circuit.filter((e) => !e.done && e.invited?.includes(P) && !e.entrants.some((x) => x.houseId === P)).length ?? 0)
      + (world.ports?.raids.filter((r) => r.status === 'revealed' && !r.answer).length ?? 0)
      + (world.crucible?.stage === 'drawn' && world.crucible.entrants.includes(P) && !world.crucible.contingents[P] ? 1 : 0)
      + (world.crucible?.stage === 'campaign' && world.crucible.contingents[P] && !world.crucible.contingents[P]!.out && currentRound(world) && !currentRound(world)!.stance[P] ? 1 : 0)
      + (world.loans?.asks.filter((a) => a.to === P).length ?? 0)
      + (world.training?.offers.filter((o) => o.to === P).length ?? 0)
      + Object.values(world.ports?.ships ?? {}).filter((x) => x.status === 'held').length;
    return { gold: n };
  }
  if (s === 'court') return { gold: (world.courts[P]?.petitions.length ?? 0) + (world.ambitions?.audiences.length ?? 0) };
  if (s === 'arms') {
    const cr = world.crucible;
    const needs = (cr?.stage === 'drawn' && cr.entrants.includes(P) && !cr.contingents[P] ? 1 : 0) + (cr?.stage === 'campaign' && cr.contingents[P] && currentRound(world) && !currentRound(world)!.stance[P] ? 1 : 0) + (world.grounds?.challenges.length ?? 0);
    return { gold: needs };
  }
  if (s === 'missions') return { plain: activeMissions(world, P).length };
  if (s === 'people') return { plain: world.training?.intake?.length ?? 0 };
  return {};
}

// ---------------------------------------------------------------- Arms: knights and challenges

export function KnightsPage() {
  const world = useWorld();
  const { run, err } = usePlay();
  const P = world.playerHouseId;
  const ours = Object.values(world.characters).filter((c) => c.alive && c.houseId === P && c.tier === 'full');
  const military = ours.filter((c) => isMilitary(world, c)).sort((a, b) => fightScore(b) - fightScore(a));
  const could = ours.filter((c) => !cannotKnight(world, c.id)).sort((a, b) => (world.ladder?.of[b.id]?.stage === 'blooded' ? 1 : 0) - (world.ladder?.of[a.id]?.stage === 'blooded' ? 1 : 0) || fightScore(b) - fightScore(a));
  const aspirants = ours.filter((c) => world.ladder?.of[c.id]?.stage === 'aspirant').sort((a, b) => proofOf(world, b.id) - proofOf(world, a.id));
  return (
    <>
      <div className="page-title">
        <h2>Knights &amp; challenges</h2>
        <p>The house's fighting people: knights, the Champion and Grand Master, ship captains and base commanders. Only they may challenge or be challenged. Knighting someone costs 300 othes and they will not forget it.</p>
      </div>
      <div className="grid">
        <Challenges className="span-12" />
        <Panel title="Our military" aside={`${military.length}`} className="span-12">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Name</th><th>Role</th><th>Fight</th><th>Record</th><th>Titles</th><th>Now</th><th /></tr></thead>
              <tbody>
                {military.map((c) => (
                  <tr key={c.id}>
                    <td><PersonLink c={c} /></td>
                    <td className="muted">{c.seat ? SEAT_TITLE[c.seat] : c.role}</td>
                    <td className="mono">{fightScore(c).toFixed(1)}</td>
                    <td className="muted" style={{ fontSize: 12 }}>{seasonLine(totals(world, c.id))}</td>
                    <td className="muted" style={{ fontSize: 12 }}>{titlesOf(world, c.id).filter((t) => !t.title.startsWith('Knighted')).slice(-2).map((t) => t.title).join(' · ') || '—'}</td>
                    <td className="muted">{c.flags.some((f) => f.id === 'wounded') ? 'wounded' : isAway(world, c.id) ? 'away' : 'at court'}</td>
                    <td><PinButton id={c.id} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Aspirants" aside={`${aspirants.length} proving themselves`} className="span-12">
          {aspirants.length === 0 ? <p className="body muted" style={{ margin: 0 }}>None. Pupils sit the house trials each year from about fourteen.</p> : null}
          {aspirants.map((c) => {
            const t = mentorOf(world, c.id);
            const st = sternness(t);
            const p = proofOf(world, c.id);
            return (
              <div key={c.id} className="row" style={{ gap: 10 }}>
                <span style={{ flex: 1 }}><PersonLink c={c} /> <span className="muted">· {Math.floor(ageOf(c, world.date))} · fight {fightScore(c).toFixed(1)}</span></span>
                <span className="mono muted" style={{ fontSize: 12 }} title="Deeds since the trials, against what their teacher wants to see">proof [{'█'.repeat(Math.min(10, Math.round(p / 2)))}{'░'.repeat(Math.max(0, 10 - Math.round(p / 2)))}] {p.toFixed(0)}/{st.bar}</span>
                <span className="muted" style={{ fontSize: 12, width: 200 }}>{t ? <>under <PersonLink c={t} /> · {st.kind}</> : 'no teacher'}</span>
              </div>
            );
          })}
        </Panel>
        <Panel title="Could be knighted" aside="Blooded first · 300 othes each" className="span-12">
          {err ? <p className="body error" style={{ margin: 0 }}>{err}</p> : null}
          {could.length === 0 ? <p className="body muted" style={{ margin: 0 }}>No one at court is ready.</p> : null}
          {could.slice(0, 12).map((c) => (
            <div key={c.id} className="row" style={{ gap: 10 }}>
              <span style={{ flex: 1 }}><PersonLink c={c} /> <span className="muted">· {c.role} · {Math.floor(ageOf(c, world.date))} · fight {fightScore(c).toFixed(1)}{world.ladder?.of[c.id]?.stage === 'blooded' ? ` · blooded ${Math.round((absoluteCycle(world.date) - absoluteCycle(world.ladder.of[c.id]!.since)) / 80)} Orbits ago` : ''}</span></span>
              <button type="button" className="btn small primary" onClick={() => run((w) => knight(w, c.id))}>Knight them</button>
            </div>
          ))}
        </Panel>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Arms: fleet

export function FleetPage() {
  const world = useWorld();
  const P = world.playerHouseId;
  const yards = modulesOf(world, P, 'shipyard');
  return (
    <>
      <div className="page-title">
        <h2>Fleet</h2>
        <p>The house's great ships, their duties and captains. New ships are laid down at a shipyard.</p>
      </div>
      <div className="grid">
        <FleetPanel className="span-8" />
        <Panel title="Shipyards" aside={`${yards.length}`} className="span-4">
          {yards.length === 0 ? <p className="body muted" style={{ margin: 0 }}>None yet. <Go to={{ kind: 'build' }}>Build one ›</Go></p> : null}
          {yards.map((y) => (
            <div key={y.id} className="row"><span style={{ flex: 1 }}>{placeOf(world, y)} <span className="muted">· level {y.level}</span></span><Go to={{ kind: 'holdings', id: y.id }} className="btn small">Lay down a ship ›</Go></div>
          ))}
        </Panel>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Realm: embassies

export function EmbassiesPage() {
  const world = useWorld();
  const P = world.playerHouseId;
  const others = Object.keys(world.houses).filter((h) => h !== P);
  return (
    <>
      <div className="page-title">
        <h2>Embassies</h2>
        <p>Every house keeps an embassy in every other capital. Our ambassadors carry word, sharpen what we know of their hosts, and help our reports before the Crucible.</p>
      </div>
      <div className="grid">
        <OurCourtEmbassies className="span-12" />
        {others.map((h) => (
          <div key={h} className="span-6 stack">
            <div className="eyebrow" style={{ padding: '0 4px' }}>In the capital of <HouseLink id={h} /></div>
            <EmbassyPanel houseId={h} />
          </div>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Treasury

export function LoansPage() {
  return (
    <>
      <div className="page-title">
        <h2>Loans</h2>
        <p>Othes lent and borrowed between houses: what we owe, what is owed to us, and what others ask of us.</p>
      </div>
      <div className="grid"><LoansPanel className="span-12" /></div>
    </>
  );
}

export function VaultsPage() {
  const world = useWorld();
  const P = world.playerHouseId;
  const vaults = modulesOf(world, P, 'vault');
  return (
    <>
      <div className="page-title">
        <h2>Vaults</h2>
        <p>Reserves kept off the ledger, Caiges under watch, the house records. Reserves now: {fmt(reservesOf(world, P))} othes.</p>
      </div>
      <div className="grid">
        {vaults.length === 0 ? <Panel title="No vaults" className="span-12"><p className="body muted" style={{ margin: 0 }}>We have none. <Go to={{ kind: 'build' }}>Build one ›</Go></p></Panel> : null}
        {vaults.map((v) => <div key={v.id} className="span-12"><ModuleView m={v} /></div>)}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Realm: build

/** Everything we could build, and everywhere we could build it. */
export function BuildPage() {
  const world = useWorld();
  const { run, err } = usePlay();
  const P = world.playerHouseId;
  const sectors = heldSectors(world, P);
  const [kind, setKind] = useState<ModuleKind>('academy');
  const places = sectors.map((s) => ({ s, why: cannotBuild(world, kind, s.id) }));
  const ok = places.filter((x) => !x.why);
  const have = modulesOf(world, P, kind);
  return (
    <>
      <div className="page-title">
        <h2>Build</h2>
        <p>Pick what to build; every sector where it can go is listed. Works take a Phase. Ships' modules are fitted at the ship, from the Fleet.</p>
      </div>
      <div className="subtabs" style={{ marginBottom: 10 }}>
        {SECTOR_KINDS.map((k) => (
          <button key={k} type="button" className="subtab" aria-current={kind === k ? 'page' : undefined} onClick={() => setKind(k)}>{MODULE_LABEL[k]} <span className="muted">({modulesOf(world, P, k).length})</span></button>
        ))}
      </div>
      <div className="grid">
        <Panel title={<Term k="holdings">{MODULE_LABEL[kind]}</Term>} aside={`${fmt(buildCost(kind, 1))} othes for the first level`} className="span-7">
          <p className="body muted" style={{ margin: 0, fontSize: 12 }}>{MODULE_NOTE[kind]}</p>
          {err ? <p className="body error" style={{ margin: 0 }}>{err}</p> : null}
          {ok.length === 0 ? <p className="body muted" style={{ margin: 0 }}>Nowhere to build one now.</p> : null}
          {ok.map(({ s }) => (
            <div key={s.id} className="row" style={{ gap: 10 }}>
              <span style={{ flex: 1 }}><Go to={{ kind: 'sector', id: s.id }}>{s.name}</Go> <span className="muted">· {s.designation}{s.port !== 'none' ? ` · ${s.port}` : ''}</span></span>
              <button type="button" className="btn small primary" onClick={() => run((w) => buildModule(w, kind, s.id))}>Build here</button>
            </div>
          ))}
          {places.some((x) => x.why) ? (
            <details className="body" style={{ fontSize: 12 }}>
              <summary className="muted">Where it can't go ({places.filter((x) => x.why).length})</summary>
              {places.filter((x) => x.why).map(({ s, why }) => <div key={s.id} className="muted">{s.name}: {why}</div>)}
            </details>
          ) : null}
        </Panel>
        <Panel title={`Our ${kind === 'cells' ? 'cells' : kind === 'academy' ? 'academies' : `${MODULE_LABEL[kind].toLowerCase()}s`}`} aside={`${have.length}`} className="span-5">
          {have.length === 0 ? <p className="body muted" style={{ margin: 0 }}>None yet.</p> : null}
          {have.map((m) => (
            <div key={m.id} className="row"><span style={{ flex: 1 }}>{placeOf(world, m)} <span className="muted">· level {m.level}{m.works ? ` → ${m.works.to}` : ''}</span></span><Go to={{ kind: 'holdings', id: m.id }} className="btn small">Open ›</Go></div>
          ))}
        </Panel>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- what you can do with a person

/** Everything the Highroy can do with one of ours, in one place on their sheet. */
export function PersonActions({ id }: { id: string }) {
  const world = useWorld();
  const nav = useNav();
  const { run, err } = usePlay();
  const c = world.characters[id];
  if (!c || !c.alive || c.houseId !== world.playerHouseId || c.seat === 'highroy') return null;
  const young = ageOf(c, world.date) < SPECIES[c.species].adulthood;
  const kn = cannotKnight(world, id);
  const aud = cannotHoldAudience(world, id);
  const B = ({ label, to, title }: { label: string; to: Route; title?: string }) => <button type="button" className="btn small" title={title} onClick={() => nav.to(to)}>{label}</button>;
  return (
    <Panel title={`What you can do with ${c.name.given}`} className="span-12">
      <div className="body actions" style={{ flexWrap: 'wrap' }}>
        <B label="Send on an inquiry ›" to={{ kind: 'plan', mission: 'investigate', leader: id }} />
        <B label="Send scouting ›" to={{ kind: 'plan', mission: 'scout', leader: id }} />
        {young || ageOf(c, world.date) < SPECIES[c.species].adulthood * 1.6 ? <B label="Teach them ›" to={{ kind: 'training', id }} title="A tutor, or the academy" /> : null}
        {!kn ? <button type="button" className="btn small primary" onClick={() => run((w) => knight(w, id))}>Knight them · 300</button> : null}
        {!aud ? <button type="button" className="btn small" onClick={() => run((w) => holdAudience(w, id))}>Call to an audience</button> : null}
        {!young ? <B label="Name to the council ›" to={{ kind: 'council' }} /> : null}
        {!young ? <B label="Make ambassador ›" to={{ kind: 'embassies' }} /> : null}
        {isMilitary(world, c) || fightScore(c) >= 10 ? <B label="Enter in a tourney ›" to={{ kind: 'grounds' }} /> : null}
        {isMilitary(world, c) ? <B label="Knights & challenges ›" to={{ kind: 'knights' }} /> : null}
      </div>
      {err ? <p className="body error" style={{ margin: 0 }}>{err}</p> : null}
    </Panel>
  );
}
