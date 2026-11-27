// The Numarade's rankings: the whole Archon measured in five ways, published each Orbit with a bulletin.
import { Fragment, useState } from 'react';
import { useNav, useWorld } from './context';
import { Go, Panel } from './links';
import { ArchonHouseLink } from './archon';
import { computeRankings, ordinal, RANK_KEYS, RANK_LABEL, RANK_NOTE, TOP_THREE, type HouseRank, type RankKey } from '../sim/rankings';
import { formatDate } from '../sim/time';
import type { World } from '../sim/types';

/** The published table, or a fresh measure for a save from before the rankings. */
export function tableOf(world: World): HouseRank[] { return world.rankings?.table ?? computeRankings(world); }

function Move({ d }: { d: number }) {
  if (!d) return null;
  return <span className={`since ${d > 0 ? 'up' : 'down'}`} title="since the last bulletin">{d > 0 ? '▲' : '▼'}{Math.abs(d)}</span>;
}

const meter = (v: number) => '█'.repeat(Math.round(v / 10)) + '░'.repeat(10 - Math.round(v / 10));

export function RankingsPage() {
  const world = useWorld();
  const nav = useNav();
  const P = world.playerHouseId;
  const table = tableOf(world);
  const prev = Object.fromEntries((world.rankings?.prev ?? []).map((r) => [r.id, r]));
  const us = table.find((r) => r.id === P);
  const [sort, setSort] = useState<RankKey | 'overall'>('overall');
  const rows = [...table].sort((a, b) => (sort === 'overall' ? a.place - b.place : a.rank[sort] - b.rank[sort]));
  const bulletins = world.rankings?.bulletins ?? [];
  return (
    <>
      <div className="page-title">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="eyebrow gold">Published by the Numarade each Orbit</span>
          <h2>The rankings of the Archon</h2>
          <p>Every house measured in five ways. A house can lead in one and still not be first: the first house is strong in all of them. The Archon's esteem follows the rankings, and esteem decides seats and the Exarchon's chair.{world.rankings ? ` Last published ${formatDate(world.rankings.at)}.` : ''}</p>
        </div>
      </div>
      <div className="grid">
        {us ? <OurStanding us={us} was={prev[P]} table={table} /> : null}
        <Panel title="The bulletin" aside={bulletins[0] ? formatDate(bulletins[0].date) : 'the first comes at the turn of the Orbit'} className="span-5">
          <div className="body" style={{ display: 'grid', gap: 8, fontSize: 13 }}>
            {bulletins.length === 0 ? <span className="muted">The Numarade publishes at the turn of each Orbit: who rose, who fell, and why.</span> : null}
            {bulletins[0]?.lines.map((l, i) => <span key={i} className={l.tone === 'ours' ? 'gold' : l.tone === 'up' ? 'up' : l.tone === 'down' ? 'down' : undefined}>{l.text}</span>)}
          </div>
          {bulletins.length > 1 ? (
            <details className="body" style={{ fontSize: 12 }}>
              <summary className="muted">Earlier bulletins</summary>
              {bulletins.slice(1).map((b, i) => (
                <div key={i} style={{ marginTop: 8, display: 'grid', gap: 3 }}>
                  <span className="eyebrow">{formatDate(b.date)}</span>
                  {b.lines.map((l, j) => <span key={j} className="muted">{l.text}</span>)}
                </div>
              ))}
            </details>
          ) : null}
        </Panel>
        <Panel title="The Archon" aside="click a column to rank by it" className="span-7">
          <div className="table-wrap">
            <table className="list rank-table">
              <thead><tr>
                <th>#</th>
                <th>House</th>
                <th><button type="button" className="linklike" aria-pressed={sort === 'overall'} onClick={() => setSort('overall')}>Overall</button></th>
                {RANK_KEYS.map((k) => <th key={k} title={RANK_NOTE[k]}><button type="button" className="linklike" aria-pressed={sort === k} onClick={() => setSort(k)}>{RANK_LABEL[k]}</button></th>)}
              </tr></thead>
              <tbody>
                {rows.map((r) => {
                  const was = prev[r.id];
                  return (
                    <tr key={r.id} className={`clickable${r.id === P ? ' ours' : ''}`} onClick={() => { if (r.id !== P) nav.to({ kind: 'house', id: r.id }); }}>
                      <td className="mono">{sort === 'overall' ? r.place : r.rank[sort]}{was ? <Move d={sort === 'overall' ? was.place - r.place : was.rank[sort] - r.rank[sort]} /> : null}</td>
                      <td><ArchonHouseLink id={r.id} />{world.archon?.numarade.exarchon?.houseId === r.id ? <span className="tag world" style={{ marginLeft: 6 }}>Exarchon</span> : null}{!world.houses[r.id] ? <span className="muted" title="Measured from afar" style={{ fontSize: 11 }}> ·</span> : null}</td>
                      <td className="mono"><strong>{r.overall}</strong></td>
                      {RANK_KEYS.map((k) => <td key={k} className="mono" style={{ color: r.rank[k] === 1 ? 'var(--gold)' : r.rank[k] <= 3 ? 'var(--green)' : undefined }} title={`${RANK_LABEL[k]}: ${r.score[k]}`}>{ordinal(r.rank[k])}</td>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="body muted" style={{ margin: 0, fontSize: 11 }}>Houses marked · are measured from afar, from what the register shows of them.</p>
        </Panel>
      </div>
    </>
  );
}

/** Where we stand in each ranking: our place, what moved it, who is just above, and what the top three earn. */
function OurStanding({ us, was, table }: { us: HouseRank; was?: HouseRank; table: HouseRank[] }) {
  const world = useWorld();
  const [open, setOpen] = useState<RankKey | null>(null);
  const gapAbove = (k: RankKey) => { const above = table.find((r) => r.rank[k] === us.rank[k] - 1); return above ? { id: above.id, gap: above.score[k] - us.score[k] } : undefined; };
  // The ranking closest to the next place up is the one most worth pushing.
  const lead = [...RANK_KEYS].filter((k) => us.rank[k] > 1).sort((a, b) => (gapAbove(a)?.gap ?? 99) - (gapAbove(b)?.gap ?? 99))[0];
  const above = table.find((r) => r.place === us.place - 1);
  return (
    <Panel title={`House ${world.houses[world.playerHouseId]!.name}: ${ordinal(us.place)} of ${table.length}`} aside={<>{above ? <>next up: <ArchonHouseLink id={above.id} />, {above.overall - us.overall} ahead</> : 'first in the Archon'}{was ? <Move d={was.place - us.place} /> : null}</>} className="span-12">
      <div className="body rank-cards">
        {RANK_KEYS.map((k) => {
          const g = gapAbove(k);
          const top = us.rank[k] <= 3;
          return (
            <button key={k} type="button" className={`rank-card${k === lead ? ' lead' : ''}`} aria-pressed={open === k} onClick={() => setOpen(open === k ? null : k)}>
              <span className="eyebrow">{RANK_LABEL[k]}</span>
              <strong className="mono" style={{ fontSize: 22 }}>{ordinal(us.rank[k])}{was ? <Move d={was.rank[k] - us.rank[k]} /> : null}</strong>
              <span className="mono muted" style={{ fontSize: 11 }}>{meter(us.score[k])} {us.score[k]}</span>
              <span style={{ fontSize: 11 }} className={top ? 'up' : 'muted'}>{top ? `Top three: ${TOP_THREE[k]}` : g ? `${g.gap} behind ${world.archon?.houses[g.id]?.name}` : ''}</span>
            </button>
          );
        })}
      </div>
      {open ? (
        <div className="body" style={{ fontSize: 13 }}>
          <p className="muted" style={{ margin: '0 0 6px' }}>{RANK_NOTE[open]} The top three: {TOP_THREE[open].toLowerCase()}</p>
          <dl className="kv" style={{ margin: 0 }}>
            {us.parts[open].map((p) => {
              const o = was?.parts[open].find((x) => x.label === p.label);
              const d = o ? Math.round(p.value - o.value) : 0;
              return <Fragment key={p.label}><dt>{p.label}</dt><dd>{p.shown}{d ? <span className={`since ${d > 0 ? 'up' : 'down'}`}>{d > 0 ? '▲' : '▼'}{Math.abs(d).toLocaleString('en-US')}</span> : null}</dd></Fragment>;
            })}
          </dl>
          <p style={{ margin: '8px 0 0' }}><RaiseHint k={open} /></p>
        </div>
      ) : <p className="body muted" style={{ margin: 0, fontSize: 12 }}>Open a ranking to see what it is made of and how to raise it.</p>}
    </Panel>
  );
}

/** Where to go to move a ranking. */
function RaiseHint({ k }: { k: RankKey }) {
  switch (k) {
    case 'power': return <>Raise it with soldiers and ships, and by winning wars. <Go to={{ kind: 'military' }}>Military ›</Go> · <Go to={{ kind: 'war' }}>War ›</Go></>;
    case 'economy': return <>Raise it with takings and reserves: build, trade, and put othes on ledger drives. <Go to={{ kind: 'economy' }}>Ledger ›</Go> · <Go to={{ kind: 'vaults' }}>Vaults ›</Go></>;
    case 'influence': return <>Raise it with a seat, allies, and the regard of the houses: the Speaker's board, embassies and motions. <Go to={{ kind: 'numarade' }}>Numarade ›</Go> · <Go to={{ kind: 'missions' }}>The boards ›</Go></>;
    case 'legacy': return <>Raise it with honour kept, Crucible titles, and deeds the annals remember. <Go to={{ kind: 'crucible' }}>The Crucible ›</Go></>;
    case 'knights': return <>Raise it by knighting the able and sending them on deeds: titles, duels, the circuit. <Go to={{ kind: 'knights' }}>Knights ›</Go> · <Go to={{ kind: 'grounds' }}>Circuit ›</Go></>;
  }
}

/** A strip for the Hall: our place overall and in each ranking. */
export function StandingStrip({ className }: { className?: string }) {
  const world = useWorld();
  const table = tableOf(world);
  const us = table.find((r) => r.id === world.playerHouseId);
  const was = world.rankings?.prev?.find((r) => r.id === world.playerHouseId);
  if (!us) return null;
  return (
    <Panel title="The Numarade's rankings" aside={<Go to={{ kind: 'rankings' }}>All ›</Go>} className={className}>
      <div className="body" style={{ display: 'grid', gap: 4, fontSize: 13 }}>
        <span><strong className="mono" style={{ fontSize: 18 }}>{ordinal(us.place)}</strong> <span className="muted">of {table.length} overall</span>{was ? <Move d={was.place - us.place} /> : null}</span>
        {RANK_KEYS.map((k) => <span key={k} className="row" style={{ border: 0, padding: 0 }}><span style={{ flex: 1 }} className="muted">{RANK_LABEL[k]}</span><span className="mono" style={{ color: us.rank[k] <= 3 ? 'var(--green)' : undefined }}>{ordinal(us.rank[k])}{was ? <Move d={was.rank[k] - us.rank[k]} /> : null}</span></span>)}
        {world.rankings?.bulletins[0] ? <span className="muted" style={{ fontSize: 12, marginTop: 4 }}>{world.rankings.bulletins[0].lines[0]?.text}</span> : null}
      </div>
    </Panel>
  );
}

/** A house's places, for its dossier. */
export function HouseRanks({ id }: { id: string }) {
  const world = useWorld();
  const r = tableOf(world).find((x) => x.id === id);
  if (!r) return null;
  return <span className="mono" style={{ fontSize: 12 }}>{ordinal(r.place)} overall · {RANK_KEYS.map((k) => `${RANK_LABEL[k]} ${ordinal(r.rank[k])}`).join(' · ')}</span>;
}
