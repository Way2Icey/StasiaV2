// Holdings: cells, vaults and academies the house has built, and what is in them.
import { Peek } from './links';
import { Fragment, useState } from 'react';
import { useGame, useNav, useWorld } from './context';
import { Go, HouseLink, Panel, PersonById, PersonLink, SectorLink } from './links';
import { Term } from './tip';
import {
  baseStrength, buildCost, buildModule, caigeRoom, SECTOR_KINDS, caigesIn, cannotBuild, cannotHeist, cannotRescue, cellCapacity, cellLoad, cellSecurity, deposit, escapeChance,
  executePrisoner, HEIST_COST, inmates, keeperCoverage, MODULE_LABEL, MODULE_NOTE, modulesOf, mountHeist, mountRescue, OVERSEER_TITLE,
  placeOf, REASON_LABEL, releasePrisoner, RESCUE_COST, reservesOf, returnCaige, setKeeper, setModuleOverseer, setReason, setTreatment,
  stabilityWord, TREATMENT_LABEL, TREATMENT_NOTE, upgradeModule, VAULT_CAPACITY, vaultSecurity, withdraw,
  type HoldReason, type Module, type ModuleKind, type Treatment,
} from '../sim/holdings';
import { executeCaptive, interrogateCaptive, releaseCaptive } from '../sim/captives';
import { demandRansom, econ, heldSectors, ransomValue } from '../sim/economy';
import { isAway } from '../sim/court';
import { dateParts, formatDate } from '../sim/time';
import { findSector } from '../sim/query';
import { ShipyardView } from './fleet';
import { knowledgeOf } from '../sim/knowledge';
import type { Character, World } from '../sim/types';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
function short(d: Parameters<typeof dateParts>[0]): string {
  const p = dateParts(d);
  return `${p.year}·${p.orbit}·${String(p.cycleOfOrbit).padStart(2, '0')}`;
}

function bar(v: number, max: number, w = 12): string {
  const n = Math.max(0, Math.min(w, Math.round((v / Math.max(1, max)) * w)));
  return '█'.repeat(n) + '░'.repeat(w - n);
}

function usePlay() {
  const game = useGame();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: (w: World) => World) => game.update((w) => {
    try { setErr(null); return fn(w); } catch (e) { setErr((e as Error).message); return w; }
  });
  return { run, err };
}

function ours(world: World): Character[] {
  return Object.values(world.characters).filter((c) => c.alive && c.houseId === world.playerHouseId && c.tier === 'full');
}

export function HoldingsPage({ id }: { id?: string }) {
  const world = useWorld();
  const nav = useNav();
  const P = world.playerHouseId;
  const mods = Object.values(world.holdings.modules).filter((m) => m.houseId === P);
  const sel = (id && world.holdings.modules[id]) || mods.find((m) => m.level > 0) || mods[0];
  return (
    <>
      <div className="page-title">
        <h2>Holdings</h2>
        <p>What the house has built into its sectors: cells for prisoners, vaults for othes on ledger drives, Caiges and records, academies to train its people.</p>
      </div>
      <div className="grid">
        <Panel title="Our holdings" aside={`${mods.length} built · reserves ${fmt(reservesOf(world, P))} othes`} className="span-4">
          {mods.map((m) => (
            <button key={m.id} type="button" className="desk-item" aria-pressed={sel?.id === m.id} onClick={() => nav.to({ kind: 'holdings', id: m.id })} style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
              <span>{MODULE_LABEL[m.kind].toUpperCase()} · {placeOf(world, m)}</span>
              <span className="when">{m.works ? `${m.level ? `L${m.level} → ` : ''}L${m.works.to} ${formatDate(m.works.done).split(' · ').slice(-1)[0]}` : `L${m.level}`}{m.kind === 'cells' ? ` · ${cellLoad(world, m.id)}/${cellCapacity(m)}` : ''}</span>
            </button>
          ))}
          <BuildPanel />
        </Panel>
        <div className="span-8 stack">
          {sel ? <ModuleView m={sel} /> : null}
        </div>
        <HeldAbroad className="span-6" />
        <RivalVaults className="span-6" />
      </div>
    </>
  );
}

function BuildPanel() {
  const world = useWorld();
  const { run, err } = usePlay();
  const sectors = heldSectors(world, world.playerHouseId);
  const [sector, setSector] = useState(sectors[0]?.id ?? '');
  const [kind, setKind] = useState<ModuleKind>('academy');
  const why = sector ? cannotBuild(world, kind, sector) : 'Pick a sector';
  return (
    <div className="body" style={{ display: 'grid', gap: 6, borderTop: '1px solid var(--line)', marginTop: 8 }}>
      <div className="eyebrow">Build</div>
      <select className="select" aria-label="What to build" value={kind} onChange={(e) => setKind(e.target.value as ModuleKind)}>
        {(['cells', 'vault', 'academy'] as ModuleKind[]).map((k) => <option key={k} value={k}>{MODULE_LABEL[k]} · {fmt(buildCost(k, 1))} othes</option>)}
      </select>
      <select className="select" aria-label="Where" value={sector} onChange={(e) => setSector(e.target.value)}>
        {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>{MODULE_NOTE[kind]} Takes a Phase.</p>
      <button type="button" className="btn small primary" disabled={!!why} title={why ?? undefined} onClick={() => run((w) => buildModule(w, kind, sector))}>{why ?? `Build for ${fmt(buildCost(kind, 1))}`}</button>
      {err ? <p className="error" style={{ margin: 0 }}>{err}</p> : null}
    </div>
  );
}

function OverseerPicker({ m }: { m: Module }) {
  const world = useWorld();
  const { run } = usePlay();
  const people = ours(world).filter((c) => !isAway(world, c.id) || c.id === m.overseerId);
  return (
    <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <span className="muted">{OVERSEER_TITLE[m.kind]}</span>
      <select className="select" value={m.overseerId ?? ''} onChange={(e) => run((w) => setModuleOverseer(w, m.id, e.target.value || null))}>
        <option value="">(no one)</option>
        {people.map((c) => <option key={c.id} value={c.id}>{c.name.given} {c.name.family ?? ''} · {c.role}</option>)}
      </select>
    </label>
  );
}

export function ModuleView({ m }: { m: Module }) {
  const world = useWorld();
  const { run, err } = usePlay();
  const next = m.level < 3 ? buildCost(m.kind, m.level + 1) : 0;
  const othes = econ(world, world.playerHouseId).stock.othes;
  return (
    <>
      <Panel title={<>{MODULE_LABEL[m.kind]} · {m.sectorId ? <SectorLink id={m.sectorId} /> : placeOf(world, m)}</>} aside={m.level ? `level ${m.level} of 3` : 'being built'}>
        <p className="body muted" style={{ margin: 0 }}>{MODULE_NOTE[m.kind]}</p>
        <div className="body" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <OverseerPicker m={m} />
          {m.works ? <span className="muted">Works under way: level {m.works.to} ready {formatDate(m.works.done)}.</span> : m.level < 3 ? (
            <button type="button" className="btn small" disabled={othes < next} onClick={() => run((w) => upgradeModule(w, m.id))}>Improve to level {m.level + 1} · {fmt(next)} othes</button>
          ) : <span className="muted">At its finest.</span>}
        </div>
        {err ? <p className="error body" style={{ margin: 0 }}>{err}</p> : null}
      </Panel>
      {m.kind === 'cells' && m.level > 0 ? <CellsView m={m} /> : null}
      {m.kind === 'vault' && m.level > 0 ? <VaultView m={m} /> : null}
      {m.kind === 'academy' && m.level > 0 ? <AcademyNote m={m} /> : null}
      {m.kind === 'shipyard' && m.level > 0 ? <ShipyardView yard={m} /> : null}
      {m.kind === 'base' && m.level > 0 && m.sectorId ? (
        <Panel title="Garrison" aside={`strength ${baseStrength(world, m.sectorId)} · pay ${120 * m.level}/Phase`}>
          <p className="body muted" style={{ margin: 0 }}>Fights any raid on {placeOf(world, m)} alongside whoever else is there, mustered or not. A commander with tactics and leadership adds to its strength. The base keeps its own cells.</p>
        </Panel>
      ) : null}
      {m.kind === 'listening' && m.level > 0 ? (
        <Panel title="What it hears" aside={`level ${m.level}`}>
          <p className="body muted" style={{ margin: 0 }}>
            Raids on this world are sighted {m.level * 6} cycles sooner. Foreign agents here face a sharper watch. Other houses' great ships at this world are seen{m.level >= 2 ? ', and followed on the lanes to and from it' : ''}{m.level >= 3 ? '; at level 3 we hear ships across the whole Reaches' : ''}.
          </p>
        </Panel>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------- cells

function CellsView({ m }: { m: Module }) {
  const world = useWorld();
  const { run } = usePlay();
  const [confirm, setConfirm] = useState<string | null>(null);
  const { captives, prisoners } = inmates(world, m.id);
  const load = captives.length + prisoners.length;
  const sec = cellSecurity(world, m);
  const pickT = (id: string, t: Treatment | undefined) => (
    <select className="select" aria-label="Treatment" value={t ?? 'decent'} onChange={(e) => run((w) => setTreatment(w, id, e.target.value as Treatment))}>
      {(['decent', 'harsh', 'isolation'] as Treatment[]).map((x) => <option key={x} value={x}>{TREATMENT_LABEL[x]}</option>)}
    </select>
  );
  const pickR = (id: string, r: HoldReason | undefined) => (
    <select className="select" aria-label="Held for" value={r ?? 'spy'} onChange={(e) => run((w) => setReason(w, id, e.target.value as HoldReason))}>
      {(['spy', 'crime', 'war', 'leverage'] as HoldReason[]).map((x) => <option key={x} value={x}>{REASON_LABEL[x]}</option>)}
    </select>
  );
  return (
    <Panel title={<Term k="captive">Inmates</Term>} aside={`${load} of ${cellCapacity(m)} places · security ${Math.round(sec)}`}>
      <dl className="kv body" style={{ margin: 0, fontSize: 12 }}>
        {(['decent', 'harsh', 'isolation'] as Treatment[]).map((t) => <Fragment key={t}><dt>{TREATMENT_LABEL[t]}</dt><dd className="muted">{TREATMENT_NOTE[t]}</dd></Fragment>)}
      </dl>
      {load > cellCapacity(m) ? <p className="body error" style={{ margin: 0 }}>Overcrowded: escapes are far likelier.</p> : null}
      {load === 0 ? <p className="body muted" style={{ margin: 0 }}>The cells are empty.</p> : null}
      <div className="table-wrap">
        {load ? (
          <table className="ctable">
            <thead><tr><th>PRISONER</th><th>HELD FOR</th><th>KEPT</th><th>SINCE</th><th>ESCAPE</th><th /></tr></thead>
            <tbody>
              {captives.map((cap) => {
                const c = world.characters[cap.characterId]!;
                return (
                  <tr key={c.id}>
                    <td><PersonLink c={c} /><br /><span className="muted" style={{ fontSize: 12 }}>{c.role} · <HouseLink id={c.houseId} /></span></td>
                    <td>{pickR(c.id, cap.reason)}</td>
                    <td>{pickT(c.id, cap.treatment)}</td>
                    <td className="muted mono">{short(cap.since)}</td>
                    <td className="mono">{pct(escapeChance(world, (c.stats.agility + c.stats.stealth + c.stats.deception + c.stats.intellect) / 4, m, cap.treatment ?? 'decent'))}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {confirm === c.id ? (
                        <><button type="button" className="btn small" onClick={() => { setConfirm(null); run((w) => executeCaptive(w, c.id)); }}>Yes, execute</button> <button type="button" className="btn small" onClick={() => setConfirm(null)}>No</button></>
                      ) : (
                        <>
                          <button type="button" className="btn small" disabled={cap.interrogated || cap.treatment === 'isolation'} onClick={() => run((w) => interrogateCaptive(w, c.id))}>Question</button>{' '}
                          <button type="button" className="btn small" disabled={!!cap.ransom} title={`About ${fmt(ransomValue(world, c))} othes`} onClick={() => run((w) => demandRansom(w, c.id))}>Ransom</button>{' '}
                          <button type="button" className="btn small" onClick={() => run((w) => releaseCaptive(w, c.id))}>Release</button>{' '}
                          <button type="button" className="btn small" onClick={() => setConfirm(c.id)}>Execute…</button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
              {prisoners.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}<br /><span className="muted" style={{ fontSize: 12 }}>{p.what}{p.houseId ? <> · <HouseLink id={p.houseId} /></> : ''}</span></td>
                  <td>{pickR(p.id, p.reason)}</td>
                  <td>{pickT(p.id, p.treatment)}</td>
                  <td className="muted mono">{short(p.since)}{p.until ? ` → ${short(p.until)}` : ''}</td>
                  <td className="mono">{pct(escapeChance(world, p.wits, m, p.treatment))}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button type="button" className="btn small" onClick={() => run((w) => releasePrisoner(w, p.id))}>Release</button>{' '}
                    <button type="button" className="btn small" onClick={() => run((w) => executePrisoner(w, p.id))}>Execute</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------- vault

function VaultView({ m }: { m: Module }) {
  const world = useWorld();
  const { run } = usePlay();
  const P = world.playerHouseId;
  const cap = VAULT_CAPACITY[m.level]!;
  const drives = m.drives ?? 0;
  const othes = econ(world, P).stock.othes;
  const caiges = caigesIn(world, m.id);
  const cover = keeperCoverage(world, m);
  const keepers = (m.keepers ?? []).map((id) => world.characters[id]).filter((c): c is Character => !!c);
  const [add, setAdd] = useState('');
  const candidates = ours(world).filter((c) => !keepers.includes(c) && c.resonance).sort((a, b) => b.stats.resonanceControl - a.stats.resonanceControl);
  const bondedOut = Object.values(world.armoury).filter((c) => c.houseId === P && c.bondedTo);
  return (
    <>
      <Panel title="Ledger drives" aside={`security ${Math.round(vaultSecurity(world, m))}`}>
        <pre className="ascii body" style={{ margin: 0 }}>{`RESERVES [${bar(drives, cap, 24)}] ${fmt(drives)} / ${fmt(cap)}\nCOFFERS  ${fmt(othes)} othes on hand`}</pre>
        <p className="body muted" style={{ margin: 0 }}>Othes on drives cannot be carried off by raiders and steady the house's name: 25,000 or more lifts respect each Orbit. Heists can still try for them.</p>
        <div className="actions">
          {[1000, 5000, 20000].map((n) => <button key={n} type="button" className="btn small" disabled={othes < 1 || drives >= cap} onClick={() => run((w) => deposit(w, m.id, n))}>Put away {fmt(n)}</button>)}
          {[1000, 5000].map((n) => <button key={'w' + n} type="button" className="btn small" disabled={drives < 1} onClick={() => run((w) => withdraw(w, m.id, n))}>Draw {fmt(n)}</button>)}
          <button type="button" className="btn small" disabled={drives < 1} onClick={() => run((w) => withdraw(w, m.id, drives))}>Draw all</button>
        </div>
      </Panel>
      <Panel title={<Term k="caige">Caiges in store</Term>} aside={`${caiges.length} of ${caigeRoom(m)} places · keepers cover ${pct(cover)}`}>
        <p className="body muted" style={{ margin: 0 }}>A stored Caige's navisium slips over time unless keepers check on it. Each keeper can mind about three, better with high resonance control. Below 40 it grows restless; below 15 something gives.</p>
        <div className="table-wrap">
          {caiges.length ? (
            <table className="ctable">
              <thead><tr><th>CAIGE</th><th>KIND</th><th>STABILITY</th><th /></tr></thead>
              <tbody>
                {caiges.map((c) => (
                  <tr key={c.id}><td>{c.name}</td><td className="muted">{c.band} · {c.type}</td><td className="mono">[{bar(c.stability ?? 85, 100)}] {Math.round(c.stability ?? 85)} {stabilityWord(c.stability ?? 85)}</td><td><Go to={{ kind: 'council' }} className="btn small">Bond…</Go></td></tr>
                ))}
              </tbody>
            </table>
          ) : <p className="body muted" style={{ margin: 0 }}>No Caiges are stored here.</p>}
        </div>
        <div className="body" style={{ display: 'grid', gap: 6 }}>
          <div className="eyebrow">Keepers</div>
          {keepers.map((k) => (
            <div key={k.id} className="row" style={{ gap: 8 }}><PersonLink c={k} /> <span className="muted">resonance control {k.stats.resonanceControl}{isAway(world, k.id) ? ' · away, not keeping watch' : ''}</span> <button type="button" className="btn small" onClick={() => run((w) => setKeeper(w, m.id, k.id, false))}>Relieve</button></div>
          ))}
          <div style={{ display: 'flex', gap: 6 }}>
            <select className="select" aria-label="New keeper" value={add} onChange={(e) => setAdd(e.target.value)}>
              <option value="">Add a keeper…</option>
              {candidates.map((c) => <option key={c.id} value={c.id}>{c.name.given} {c.name.family ?? ''} · control {c.stats.resonanceControl}</option>)}
            </select>
            <button type="button" className="btn small" disabled={!add} onClick={() => { run((w) => setKeeper(w, m.id, add, true)); setAdd(''); }}>Assign</button>
          </div>
        </div>
        {bondedOut.length ? (
          <div className="body" style={{ display: 'grid', gap: 6 }}>
            <div className="eyebrow">Out of the vault, bonded</div>
            {bondedOut.map((c) => <div key={c.id} className="row" style={{ gap: 8 }}>{c.name} <span className="muted">with</span> <PersonById id={c.bondedTo} /> <button type="button" className="btn small" onClick={() => run((w) => returnCaige(w, c.id))}>Unbond and store</button></div>)}
          </div>
        ) : null}
      </Panel>
    </>
  );
}

function AcademyNote({ m }: { m: Module }) {
  return (
    <Panel title="Academy" aside={`reputation ${Math.round(m.reputation ?? 0)}`}>
      <p className="body muted" style={{ margin: 0 }}>One head, chosen above, teaches up to 10 students at once from their own skills. Youths and young adults are enrolled from the Training screen; a known academy draws recruits.</p>
      <div className="actions"><Go to={{ kind: 'training' }} className="btn small">Training ›</Go></div>
    </Panel>
  );
}

// ---------------------------------------------------------------- abroad

function AgentPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const world = useWorld();
  const people = ours(world).filter((c) => !isAway(world, c.id) && !c.seat);
  return (
    <select className="select" aria-label="Who goes" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Who goes…</option>
      {people.map((c) => <option key={c.id} value={c.id}>{c.name.given} {c.name.family ?? ''} · {c.role} · agi {c.stats.agility} stl {c.stats.stealth}</option>)}
    </select>
  );
}

function HeldAbroad({ className }: { className?: string }) {
  const world = useWorld();
  const { run, err } = usePlay();
  const P = world.playerHouseId;
  const held = Object.values(world.captives).filter((c) => world.characters[c.characterId]?.houseId === P && world.characters[c.characterId]?.alive);
  const [agent, setAgent] = useState<Record<string, string>>({});
  const op = (id: string) => world.holdings.ops.find((o) => o.targetId === id);
  return (
    <Panel title="Ours held abroad" aside={`${held.length}`} className={className}>
      {held.length === 0 ? <p className="body muted" style={{ margin: 0 }}>None of our people are held by another house.</p> : null}
      {held.map((cap) => {
        const c = world.characters[cap.characterId]!;
        const a = agent[c.id] ?? '';
        const why = a ? cannotRescue(world, c.id, a) : null;
        const going = op(c.id);
        return (
          <div key={c.id} className="row petition" style={{ flexWrap: 'wrap' }}>
            <span style={{ flex: '1 1 260px' }}><PersonLink c={c} /> <span className="muted">held by <HouseLink id={cap.heldBy} /> since {formatDate(cap.since)} · {TREATMENT_LABEL[cap.treatment ?? 'decent'].toLowerCase()} treatment · for {REASON_LABEL[cap.reason ?? 'spy'].toLowerCase()}</span></span>
            {going ? <span className="muted">Rescue under way: <PersonById id={going.agentId} />, back {formatDate(going.done)}.</span> : (
              <span style={{ display: 'flex', gap: 6 }}>
                <AgentPicker value={a} onChange={(v) => setAgent({ ...agent, [c.id]: v })} />
                <button type="button" className="btn small primary" disabled={!a || !!why} title={why ?? undefined} onClick={() => run((w) => mountRescue(w, c.id, a))}>Rescue · {fmt(RESCUE_COST)}</button>
              </span>
            )}
          </div>
        );
      })}
      {err ? <p className="error body" style={{ margin: 0 }}>{err}</p> : null}
    </Panel>
  );
}

function RivalVaults({ className }: { className?: string }) {
  const world = useWorld();
  const { run, err } = usePlay();
  const P = world.playerHouseId;
  const vaults = Object.values(world.holdings.modules).filter((m) => m.kind === 'vault' && m.houseId !== P && m.level > 0);
  const [agent, setAgent] = useState<Record<string, string>>({});
  const spy = (h: string) => Object.values(world.characters).filter((c) => c.houseId === h && c.seat).reduce((n, c) => Math.max(n, knowledgeOf(world, P, c.id).depth), 0);
  return (
    <Panel title="Other houses' vaults" aside="what our people have seen" className={className}>
      {vaults.map((v) => {
        const a = agent[v.id] ?? '';
        const why = a ? cannotHeist(world, v.id, a) : null;
        const known = spy(v.houseId) >= 50;
        const going = world.holdings.ops.find((o) => o.targetId === v.id && o.houseId === P);
        return (
          <div key={v.id} className="row petition" style={{ flexWrap: 'wrap' }}>
            <span style={{ flex: '1 1 260px' }}>
              <HouseLink id={v.houseId} /> <span className="muted">· vault at {placeOf(world, v)} · level {v.level}{known ? ` · about ${fmt(Math.round((v.drives ?? 0) / 1000) * 1000)} othes on drives, ${caigesIn(world, v.id).length} Caiges` : ' · contents unknown'}</span>
            </span>
            {going ? <span className="muted"><PersonById id={going.agentId} /> is on it, back {formatDate(going.done)}.</span> : (
              <span style={{ display: 'flex', gap: 6 }}>
                <AgentPicker value={a} onChange={(x) => setAgent({ ...agent, [v.id]: x })} />
                <button type="button" className="btn small" disabled={!a || !!why} title={why ?? 'Othes, a Caige or their records. If caught, our thief is theirs.'} onClick={() => run((w) => mountHeist(w, v.id, a))}>Heist · {fmt(HEIST_COST)}</button>
              </span>
            )}
          </div>
        );
      })}
      <p className="body muted" style={{ margin: 0, fontSize: 12 }}>Learn about a house's council to see what its vault holds.</p>
      {err ? <p className="error body" style={{ margin: 0 }}>{err}</p> : null}
    </Panel>
  );
}

/** Everything built at one sector, with what can still be built there. The home of holdings. */
export function SectorHoldings({ sectorId }: { sectorId: string }) {
  const world = useWorld();
  const { run, err } = usePlay();
  const P = world.playerHouseId;
  const found = findSector(world, sectorId);
  if (!found) return null;
  const ours = found.planet.houseId === P;
  const mods = Object.values(world.holdings?.modules ?? {}).filter((m) => m.sectorId === sectorId);
  const kinds: ModuleKind[] = SECTOR_KINDS;
  if (!ours) {
    return (
      <Panel title={<Term k="modules">Holdings</Term>} aside="as far as we know" className="span-12">
        <p className="body" style={{ margin: 0 }}>
          {mods.length ? mods.map((m, i) => <span key={m.id}>{i ? ' · ' : ''}<Peek t={{ k: 'module', id: m.id }}>{`${MODULE_LABEL[m.kind]} (level ${m.level})`}</Peek></span>) : 'Nothing of note built here.'}
        </p>
      </Panel>
    );
  }
  const missing = kinds.filter((k) => !mods.some((m) => m.kind === k));
  return (
    <>
      <Panel title={<Term k="modules">Holdings here</Term>} aside={mods.length ? mods.map((m) => `${MODULE_LABEL[m.kind]} L${m.level}`).join(' · ') : 'none built'} className="span-12">
        <p className="body muted" style={{ margin: 0 }}>Cities, bases and ports keep cells; farmland and wilds do not, unless you build them. Hover a button for what each holding does.</p>
        {missing.length ? (
          <div className="actions body">
            {missing.map((k) => {
              const why = cannotBuild(world, k, sectorId);
              return <button key={k} type="button" className="btn small" disabled={!!why} title={why ?? MODULE_NOTE[k]} onClick={() => run((w) => buildModule(w, k, sectorId))}>Build {MODULE_LABEL[k].toLowerCase()} · {fmt(buildCost(k, 1))}{why && why !== 'Not enough othes' ? '' : ''}</button>;
            })}
            <span className="muted" style={{ fontSize: 12 }}>Each takes a Phase to build.</span>
          </div>
        ) : null}
        {err ? <p className="error body" style={{ margin: 0 }}>{err}</p> : null}
      </Panel>
      {mods.filter((m) => m.houseId === P).map((m) => <div key={m.id} className="span-6 stack"><ModuleView m={m} /></div>)}
    </>
  );
}

/** Every holding we have, for the map. */
export function HoldingsOverview() {
  const world = useWorld();
  const P = world.playerHouseId;
  const mods = Object.values(world.holdings?.modules ?? {}).filter((m) => m.houseId === P);
  const bySector = new Map<string, Module[]>();
  for (const m of mods) { const k = m.sectorId ?? `ship:${m.shipId}`; bySector.set(k, [...(bySector.get(k) ?? []), m]); }
  return (
    <Panel title={<Term k="modules">Our holdings</Term>} aside={`reserves ${fmt(reservesOf(world, P))} othes`}>
      {[...bySector.entries()].map(([k, ms]) => (
        <div key={k} className="row" style={{ gap: 8 }}>
          <span style={{ flex: 1 }}>{k.startsWith('ship:') ? <Go to={{ kind: 'ship', id: k.slice(5) }}>{placeOf(world, ms[0]!)}</Go> : <SectorLink id={k} />}</span>
          <span className="muted mono" style={{ fontSize: 12 }}>{ms.map((m) => `${m.kind === 'cells' && m.shipId ? 'brig' : m.kind} L${m.level}${m.kind === 'cells' ? ` ${cellLoad(world, m.id)}/${cellCapacity(m)}` : ''}`).join(' · ')}</span>
        </div>
      ))}
      <p className="body muted" style={{ margin: 0, fontSize: 12 }}>Open a sector to build there or manage what is in its cells and vault.</p>
    </Panel>
  );
}

export { modulesOf };
