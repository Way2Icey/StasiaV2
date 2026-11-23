// Careers on screen: season lines, titles, potential diamonds, and the people the Highroy follows.
import { DeedsLine } from './legacy';
import { renownRow } from '../sim/renown';
import { STAGE_LABEL, stageOf } from '../sim/ladder';
import { formatDate } from '../sim/time';
import { useGame, useWorld } from './context';
import { Go, Panel, PersonLink } from './links';
import { Fragment } from 'react';
import { diamondRead, diamondText, seasonLine, STAT_LABEL, titlesOf, togglePin, totals, type Stat } from '../sim/careers';
import { ageOf } from '../sim/characters';
import type { Character } from '../sim/types';

export function Diamonds({ c }: { c: Character }) {
  const world = useWorld();
  const r = diamondRead(world, c);
  return <span className="mono" title={r.lo === r.hi ? `Potential: ${r.lo} of 3` : `Potential: somewhere between ${r.lo} and ${r.hi} of 3. Teaching them, or a sharper Spymaster, would tell us more.`}>{diamondText(r)}</span>;
}

export function PinButton({ id }: { id: string }) {
  const world = useWorld();
  const game = useGame();
  const on = world.careers?.pinned.includes(id);
  return <button type="button" className="btn" aria-pressed={!!on} onClick={() => game.update((w) => togglePin(w, id))}>{on ? 'Following' : 'Follow'}</button>;
}

/** On a character's page: everything they have done, all told. */
export function CareerPanel({ c, className }: { c: Character; className?: string }) {
  const world = useWorld();
  const titles = titlesOf(world, c.id);
  const t = totals(world, c.id);
  const rows = (Object.keys(STAT_LABEL) as Stat[]).filter((k) => k !== 'titles' && (t[k] ?? 0) > 0);
  return (
    <Panel title="Record" aside={<>{stageLabel(world, c.id)}potential <Diamonds c={c} /></>} className={className}>
      <DevLine id={c.id} />
      <LadderLine id={c.id} />
      <DeedsLine id={c.id} />
      {(() => { const r = renownRow(world, c.id); return r && r.tier !== 'Unknown' ? <p className="body muted" style={{ margin: 0, fontSize: 12 }}>Renown {r.renown} · <strong>{r.tier}</strong> · {r.rankHouse === 1 ? 'first' : `#${r.rankHouse}`} in their house, #{r.rankAll} across the houses · <Go to={{ kind: 'people', view: 'renown' }}>the table ›</Go></p> : null; })()}
      {titles.length ? <div className="body" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{titles.map((x, i) => <span key={i} className="pill" aria-pressed="true">{x.title}</span>)}</div> : null}
      {rows.length === 0 ? <p className="body muted" style={{ margin: 0 }}>No deeds on record yet.</p> : (
        <>
          <p className="body" style={{ margin: 0 }}>{seasonLine(t)}</p>
          <dl className="kv body" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr) 40px)' }}>
            {rows.map((k) => <Fragment key={k}><dt>{STAT_LABEL[k]}</dt><dd className="mono">{t[k]}</dd></Fragment>)}
          </dl>
        </>
      )}
    </Panel>
  );
}

function stageLabel(world: ReturnType<typeof useWorld>, id: string): string {
  const s = stageOf(world, id);
  return s ? `${s === 'knight' ? 'Knight' : STAGE_LABEL[s]} · ` : '';
}

const BARS = '▁▂▃▄▅▆▇█';
function spark(vals: number[]): string {
  if (!vals.length) return '';
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  return vals.map((v) => BARS[hi === lo ? 3 : Math.round(((v - lo) / (hi - lo)) * 7)]).join('');
}

/** How they have grown, Orbit by Orbit: fighting, and their best subject. */
export function DevLine({ id }: { id: string }) {
  const world = useWorld();
  const line = world.ladder?.snaps[id] ?? [];
  if (line.length < 2) return null;
  const f = line.map((x) => x[1]);
  const b = line.map((x) => x[2]);
  const d = (xs: number[]) => { const v = xs[xs.length - 1]! - xs[0]!; return `${v >= 0 ? '+' : ''}${v.toFixed(1)}`; };
  return (
    <div className="body mono" style={{ fontSize: 12, display: 'grid', gridTemplateColumns: '90px 1fr 60px', gap: '0 8px' }}>
      <span className="muted">Fighting</span><span style={{ letterSpacing: 1 }}>{spark(f)}</span><span>{f[f.length - 1]} <span className="muted">{d(f)}</span></span>
      <span className="muted">Best subject</span><span style={{ letterSpacing: 1 }}>{spark(b)}</span><span>{b[b.length - 1]} <span className="muted">{d(b)}</span></span>
      <span className="muted" style={{ gridColumn: '1 / -1', fontSize: 11 }}>{line.length} Orbits watched</span>
    </div>
  );
}

/** Their way up: the trials, failures, blooding. */
function LadderLine({ id }: { id: string }) {
  const world = useWorld();
  const r = world.ladder?.of[id];
  if (!r?.history.length) return null;
  return <p className="body muted" style={{ margin: 0, fontSize: 12 }}>{r.history.map((h) => `${formatDate(h.date).replace(/ · Cycle \d+/, '')}: ${h.what}`).join(' · ')}</p>;
}

/** On the Hall: the people the Highroy is following, with this season's line. */
export function Followed({ className }: { className?: string }) {
  const world = useWorld();
  const people = (world.careers?.pinned ?? []).map((id) => world.characters[id]).filter((c): c is Character => !!c);
  if (!people.length) return null;
  return (
    <Panel title="Following" aside={`${people.length}`} className={className}>
      {people.map((c) => (
        <div key={c.id} className="row" style={{ gap: 8 }}>
          <span style={{ width: 200, flexShrink: 0 }}><PersonLink c={c} />{!c.alive ? <span className="muted"> · dead</span> : null}</span>
          <span className="mono" style={{ width: 40 }}>{ageOf(c, world.date)}</span>
          <Diamonds c={c} />
          <span className="muted" style={{ fontSize: 12, flex: 1 }}>{seasonLine(totals(world, c.id))}</span>
        </div>
      ))}
    </Panel>
  );
}
