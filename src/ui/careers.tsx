// Careers on screen: season lines, titles, potential diamonds, and the people the Highroy follows.
import { useGame, useWorld } from './context';
import { Panel, PersonLink } from './links';
import { diamondRead, diamondText, seasonLine, seasonsOf, titlesOf, togglePin, totals } from '../sim/careers';
import { ageOf } from '../sim/characters';
import { dateParts } from '../sim/time';
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

/** On a character's page: their seasons, FM-style. */
export function CareerPanel({ c, className }: { c: Character; className?: string }) {
  const world = useWorld();
  const seasons = seasonsOf(world, c.id);
  const titles = titlesOf(world, c.id);
  const t = totals(world, c.id);
  return (
    <Panel title="Career" aside={<>potential <Diamonds c={c} /></>} className={className}>
      {titles.length ? <div className="body" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{titles.map((x, i) => <span key={i} className="pill" aria-pressed="true">{x.title}</span>)}</div> : null}
      {seasons.length === 0 ? <p className="body muted" style={{ margin: 0 }}>No deeds on record yet.</p> : (
        <div className="table-wrap">
          <table className="ctable">
            <thead><tr><th>SEASON</th><th>AGE</th><th>THE YEAR</th></tr></thead>
            <tbody>
              {seasons.map(([y, s]) => (
                <tr key={y}><td className="mono">SY-{y}</td><td className="mono">{ageOf(c, { year: y, cycle: 400 } as never)}</td><td>{seasonLine(s)}</td></tr>
              ))}
              <tr><td className="mono">ALL</td><td /><td><b>{seasonLine(t)}</b></td></tr>
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/** On the Hall: the people the Highroy is following, with this season's line. */
export function Followed({ className }: { className?: string }) {
  const world = useWorld();
  const year = dateParts(world.date).year;
  const people = (world.careers?.pinned ?? []).map((id) => world.characters[id]).filter((c): c is Character => !!c);
  if (!people.length) return null;
  return (
    <Panel title="Following" aside={`SY-${year}`} className={className}>
      {people.map((c) => (
        <div key={c.id} className="row" style={{ gap: 8 }}>
          <span style={{ width: 200, flexShrink: 0 }}><PersonLink c={c} />{!c.alive ? <span className="muted"> · dead</span> : null}</span>
          <span className="mono" style={{ width: 40 }}>{ageOf(c, world.date)}</span>
          <Diamonds c={c} />
          <span className="muted" style={{ fontSize: 12, flex: 1 }}>{seasonLine(world.careers?.of[c.id]?.[year] ?? {})}</span>
        </div>
      ))}
    </Panel>
  );
}
