// A witness's account of a fight, and what the people in it carry away.
import { useWorld } from './context';
import { PersonById } from './links';
import { marksOf, type Account, type Mark, type MarkKind } from '../sim/details';
import type { Character } from '../sim/types';

export function AccountBlock({ account, compact }: { account: Account; compact?: boolean }) {
  return (
    <div className={`account${compact ? ' compact' : ''}`}>
      <div className="account-by">As told by {account.by}</div>
      {account.lines.map((l, i) => <p key={i}>{l}</p>)}
    </div>
  );
}

export const MARK_LABEL: Record<MarkKind, string> = {
  wound: 'Wound', scar: 'Scar', grudge: 'Grudge', feat: 'Proud of', shame: 'Shamed by', habit: 'Has seen', kill: 'Killed',
};
const MARK_GLYPH: Record<MarkKind, string> = { wound: '+', scar: '‡', grudge: '!', feat: '*', shame: '~', habit: '>', kill: '†' };

function MarkLine({ m }: { m: Mark }) {
  const world = useWorld();
  const other = m.with && world.characters[m.with] ? m.with : undefined;
  return (
    <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
      <span className="mono muted" aria-hidden>{MARK_GLYPH[m.kind]}</span>
      <span style={{ flex: 1 }}>
        <span className="muted">{MARK_LABEL[m.kind]}:</span>{' '}
        {m.kind === 'habit' && other ? <><PersonById id={other} /> {m.text}</> : <>{m.text}{other && !m.text.includes(world.characters[other]!.name.given) ? <> <span className="muted">·</span> <PersonById id={other} /></> : null}</>}
        <span className="muted"> · {m.place}, {m.year}</span>
      </span>
    </div>
  );
}

/** What a person carries: scars, grudges, what they are proud of, what others have learned about them. */
export function MarksList({ c, limit }: { c: Character; limit?: number }) {
  const ms = marksOf(c);
  if (!ms.length) return <div className="body muted">Nothing yet. Fights leave their marks; this one has not been in enough of them.</div>;
  return <>{ms.slice(0, limit ?? ms.length).map((m, i) => <MarkLine key={i} m={m} />)}</>;
}
