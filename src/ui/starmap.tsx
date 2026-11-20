// The star map, drawn in text. Worlds, the jump lanes between them, and our
// missions in flight, all taken from the world as it stands.
import { useState, type ReactNode } from 'react';
import { useGame, useNav, useWorld } from './context';
import { agentAvailable, coverOf, postAgent, postAt, postRisk, watchOf } from '../sim/ports';

export function riskWord(r: number): string {
  return r < 0.03 ? 'SAFE' : r < 0.08 ? 'LOW RISK' : r < 0.16 ? 'RISKY' : 'DANGEROUS';
}
import { Go, HouseLink, Panel, PersonLink, PlanetLink, SectorLink } from './links';
import { Term } from './tip';
import { bar } from './hall';
import { activeMissions, travelCycles } from '../sim/missions';
import { attitude, relation } from '../sim/relations';
import { knowledgeOf } from '../sim/knowledge';
import { absoluteCycle } from '../sim/time';
import type { World } from '../sim/types';
import { findSector } from '../sim/query';
import { FleetPanel, ShipsAt } from './fleet';
import { HoldingsOverview } from './holdings';

const W = 96;
const H = 30;

/** Where each world sits on the map (column, row). */
export const MAP_POS: Record<string, [number, number]> = {
  'alerion-prime': [20, 20],
  'serath-reach': [56, 7],
  'shaaliin-lyreth': [84, 13],
  'torvann-ashfall': [70, 25],
};

const BIG = ['  .-~~-.  ', ' /░░▒▒▓▓\\ ', '|░░▒▒▓▓▓▓|', ' \\░▒▒▓▓▓/ ', "  '-~~-'  "];
const SMALL = [' .-. ', '(▒▒▓)', " '-' "];

interface Span { r: number; c: number; len: number; node: ReactNode }

function layout(world: World, selected: string, pick: (id: string) => void) {
  const P = world.playerHouseId;
  const g: string[][] = Array.from({ length: H }, () => Array<string>(W).fill(' '));
  const spans: Span[] = [];
  const put = (r: number, c: number, s: string) => {
    [...s].forEach((ch, i) => { if (r >= 0 && r < H && c + i >= 0 && c + i < W) g[r]![c + i] = ch; });
  };
  // A fixed sky, the same every time.
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < 110; i++) put(Math.floor(rnd() * H), Math.floor(rnd() * W), '·····.:*+'[Math.floor(rnd() * 9)]!);
  const ids = Object.keys(world.planets).filter((id) => MAP_POS[id]);
  const point = (a: [number, number], b: [number, number], t: number): [number, number] =>
    [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t)];
  // Lanes.
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = MAP_POS[ids[i]!]!, b = MAP_POS[ids[j]!]!;
      const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]) * 2);
      for (let k = 0; k <= n; k += 2) { const [c, r] = point(a, b, k / n); put(r, c, '·'); }
    }
  }
  // Worlds.
  const home = world.houses[P]!.capitalPlanetId;
  for (const id of ids) {
    const [c, r] = MAP_POS[id]!;
    const art = id === home ? BIG : SMALL;
    art.forEach((s, i) => put(r - Math.floor(art.length / 2) + i, c - Math.floor(s.length / 2), s));
    if (id === home) { put(r - 3, c - 6, '┌'); put(r - 3, c + 5, '┐'); put(r + 3, c - 6, '└'); put(r + 3, c + 5, '┘'); }
  }
  // Our missions in flight.
  const now = absoluteCycle(world.date);
  for (const m of activeMissions(world, P)) {
    const a = MAP_POS[home], b = MAP_POS[m.targetPlanetId];
    if (!a || !b || m.targetPlanetId === home) continue;
    const left = Math.max(0, absoluteCycle(m.stageEnds) - now);
    const f = m.stage === 'travel' ? 1 - left / Math.max(1, m.travelCycles) : m.stage === 'return' ? left / Math.max(1, m.travelCycles) : 1;
    const t = 0.12 + 0.76 * Math.max(0, Math.min(1, f));
    const [c, r] = point(a, b, t);
    const lead = world.characters[m.leaderId];
    const label = ` ${(lead?.name.given ?? 'ours').toUpperCase()} ${m.stage === 'return' ? '◄ home' : m.stage === 'task' ? '◆ at work' : '►'} `;
    put(r, c, m.stage === 'return' ? '◄' : m.stage === 'task' ? '◆' : '►');
    spans.push({ r: r + 1, c: Math.max(0, c - 3), len: label.length, node: <Go key={m.id} to={{ kind: 'mission', id: m.id }}><span className="inv">{label}</span></Go> });
  }
  // Great ships: at anchor beside their world, or out on the lanes.
  for (const sh of Object.values(world.fleet?.ships ?? {})) {
    if (sh.lost || sh.ready) continue;
    const to = findSector(world, sh.sectorId)?.planet.id;
    const b = to ? MAP_POS[to] : undefined;
    if (!b) continue;
    if (sh.arrives && sh.from && sh.left) {
      const fromP = findSector(world, sh.from)?.planet.id;
      const a = fromP ? MAP_POS[fromP] : undefined;
      if (a && fromP !== to) {
        const total = Math.max(1, absoluteCycle(sh.arrives) - absoluteCycle(sh.left));
        const t = 0.15 + 0.7 * Math.max(0, Math.min(1, 1 - (absoluteCycle(sh.arrives) - now) / total));
        const [c, r] = point(a, b, t);
        put(r, c, sh.houseId === P ? '▲' : '△');
        continue;
      }
    }
  }
  const anchored = new Map<string, number>();
  for (const sh of Object.values(world.fleet?.ships ?? {})) {
    if (sh.lost || sh.ready || sh.arrives) continue;
    const to = findSector(world, sh.sectorId)?.planet.id;
    const b = to ? MAP_POS[to] : undefined;
    if (!to || !b) continue;
    const n = anchored.get(to) ?? 0;
    anchored.set(to, n + 1);
    put(b[1] + 2 + Math.floor(n / 3), b[0] - 4 + (n % 3) * 2, sh.houseId === P ? '▲' : '△');
  }
  // Labels as buttons.
  for (const id of ids) {
    const p = world.planets[id]!;
    const [c, r] = MAP_POS[id]!;
    const right = id === home ? 7 : 4;
    const leftSide = c + right + 20 > W;
    const name = ` ${p.name.toUpperCase()} `;
    const att = p.houseId === P ? 'home' : attitude(relation(world, p.houseId, P)).toLowerCase();
    const sub = ` ${world.houses[p.houseId]?.name ?? ''} · ${att} `;
    const col = leftSide ? c - right - Math.max(name.length, sub.length) : c + right;
    spans.push({
      r: r - 1, c: col, len: name.length,
      node: <button key={`n-${id}`} type="button" className={`maplabel${selected === id ? ' inv' : ''}`} onClick={() => pick(id)} aria-pressed={selected === id}>{name}</button>,
    });
    put(r, col, sub);
  }
  return { g, spans };
}

function MapText({ world, selected, pick }: { world: World; selected: string; pick: (id: string) => void }) {
  const { g, spans } = layout(world, selected, pick);
  const rows: ReactNode[] = [];
  for (let r = 0; r < H; r++) {
    const here = spans.filter((s) => s.r === r).sort((a, b) => a.c - b.c);
    const parts: ReactNode[] = [];
    let c = 0;
    for (const s of here) {
      if (s.c < c) continue;
      parts.push(g[r]!.slice(c, s.c).join(''));
      parts.push(s.node);
      c = s.c + s.len;
    }
    parts.push(g[r]!.slice(c).join('').replace(/\s+$/, ''));
    rows.push(<span key={r}>{parts}{'\n'}</span>);
  }
  return <pre className="ascii map" aria-label="Star map">{rows}</pre>;
}

export function StarMapPage() {
  const world = useWorld();
  const nav = useNav();
  const game = useGame();
  const P = world.playerHouseId;
  const home = world.houses[P]!.capitalPlanetId;
  const [selected, setSelected] = useState<string>(Object.keys(world.planets).find((id) => id !== home) ?? home);
  const p = world.planets[selected]!;
  const isHome = p.houseId === P;
  const rel = relation(world, p.houseId, P);
  const council = Object.values(world.characters).filter((c) => c.alive && c.houseId === p.houseId && c.seat);
  const known = council.length ? council.reduce((s, c) => s + knowledgeOf(world, P, c.id).depth, 0) / council.length : 0;
  const ours = activeMissions(world, P).filter((m) => m.targetPlanetId === selected);
  const ports = p.sectors.filter((s) => s.port !== 'none');
  return (
    <>
      <div className="page-title"><h2>Star map</h2><p>The Reaches as your people know them. Pick a world; press 1–9 to change screens.</p></div>
      <div className="grid">
        <Panel title="The Reaches" aside={`${Object.keys(world.planets).length} worlds · ${activeMissions(world, P).length} of ours in flight`} className="major span-8">
          <div className="body map-wrap"><MapText world={world} selected={selected} pick={setSelected} /></div>
          <div className="map-legend"><span>· · jump lane</span><span>► ours outbound</span><span>◆ at work</span><span>◄ coming home</span><span>┌ ┐ home world</span><span>▲ our great ship</span><span>△ theirs</span></div>
        </Panel>
        <div className="span-4 stack">
          <Panel title={p.name} aside={isHome ? 'home' : `${travelCycles(home, selected)} cycles out`} className="major">
            <div className="body">
              <pre className="ascii" style={{ fontSize: 13, lineHeight: 1.55 }}>
                <span className="dim">house     </span><HouseLink id={p.houseId} />{'\n'}
                {isHome ? null : <><span className="dim">regard    </span>{attitude(rel).toUpperCase()} {rel > 0 ? '+' : ''}{rel}{'\n'}</>}
                {isHome ? null : <><span className="dim">known     </span>{Math.round(known)}%  {bar(known / 100)}{'\n'}</>}
                <span className="dim">sectors   </span>{p.sectors.length} of {p.sectorLimit}{'\n'}
                <span className="dim">people    </span>{p.sectors.reduce((s, x) => s + x.population, 0).toLocaleString('en-US')}{'\n'}
                <span className="dim">ports     </span>{ports.length}
              </pre>
            </div>
            {ports.length ? (
              <div style={{ borderTop: '1px solid var(--line-soft)', padding: '6px 14px 8px' }}>
                {ports.map((s) => {
                  const post = postAt(world, s.id);
                  const agent = agentAvailable(world);
                  return (
                    <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <SectorLink id={s.id} />
                      {world.ports?.ports[s.id] ? <Go to={{ kind: 'port', id: s.id }}>{isHome ? `${s.port} · port ›` : `watching · ${world.characters[post?.agentId ?? '']?.name.given ?? ''} ›`}</Go>
                        : !isHome && agent ? <button type="button" className="btn small" title={`Cover ${coverOf(world, agent).toFixed(1)} against their watch ${watchOf(world, s.id).toFixed(1)}: about ${Math.round(postRisk(world, agent.id, s.id) * 100)}% a Phase of being found out.`} onClick={() => game.update((w) => postAgent(w, agent.id, s.id))}>POST {agent.name.given.toUpperCase()} · {riskWord(postRisk(world, agent.id, s.id))}</button>
                        : <span className="muted">{s.port}{isHome ? '' : ' · no agent free'}</span>}
                    </div>
                  );
                })}
              </div>
            ) : null}
            <ShipsAt planetId={p.id} />
            {ours.length ? (
              <div style={{ borderTop: '1px solid var(--line-soft)', padding: '6px 14px 8px' }}>
                <div className="eyebrow">Ours here</div>
                {ours.map((m) => <div key={m.id}>► <PersonLink c={world.characters[m.leaderId]!} /> <Go to={{ kind: 'mission', id: m.id }}>{m.kind}</Go></div>)}
              </div>
            ) : null}
            <div className="actions body" style={{ borderTop: '1px solid var(--line-soft)' }}>
              {isHome ? null : <Go to={{ kind: 'plan', mission: 'scout', target: p.id }} className="btn small primary">Scout</Go>}
              {isHome ? null : <Go to={{ kind: 'plan', mission: 'envoy', target: p.houseId }} className="btn small">Send envoy</Go>}
              <button type="button" className="btn small" onClick={() => nav.to({ kind: 'planet', id: p.id })}>Open world</button>
            </div>
          </Panel>
          <FleetPanel />
          <HoldingsOverview />
          <Panel title={<Term k="holdings">All worlds</Term>}>
            {Object.values(world.planets).map((w) => (
              <div key={w.id} className="row">
                <button type="button" className="linklike" aria-pressed={selected === w.id} onClick={() => setSelected(w.id)}>{selected === w.id ? '▸ ' : '  '}{w.name}</button>
                <span className="muted" style={{ marginLeft: 'auto' }}>{w.houseId === P ? 'home' : `${travelCycles(home, w.id)}cy`}</span>
              </div>
            ))}
            <div className="row"><PlanetLink id={home} /><span className="muted" style={{ marginLeft: 'auto' }}>open home world</span></div>
          </Panel>
        </div>
      </div>
    </>
  );
}
