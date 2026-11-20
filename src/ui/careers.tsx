// Careers on screen: season lines, titles, potential diamonds, and the people the Highroy follows.
import { useGame, useWorld } from './context';
import { Panel, PersonLink } from './links';
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
    <Panel title="Record" aside={<>potential <Diamonds c={c} /></>} className={className}>
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
