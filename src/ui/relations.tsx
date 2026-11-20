// Relationships: who feels what about whom, centred on one person at a time.
import { useState } from 'react';
import { useNav, useWorld } from './context';
import { Go, Panel, PersonById, PersonLink } from './links';
import { Term } from './tip';
import { PeoplePage } from './pages';
import { Younglings } from './training';
import { BOND_LABEL, factions, SECRET_BONDS, tiesOf, type Bond } from '../sim/relationships';
import { knowledgeOf } from '../sim/knowledge';
import { isAway } from '../sim/court';
import { SEAT_TITLE } from '../sim/world';
import type { Character, World } from '../sim/types';

type View = 'web' | 'factions' | 'young' | 'everyone';

/** An opinion as a bar from -100 to +100, centred. */
export function opinionBar(v: number): string {
  const n = Math.round(Math.abs(v) / 20);
  const left = v < 0 ? '░'.repeat(5 - n) + '█'.repeat(n) : '░░░░░';
  const right = v > 0 ? '█'.repeat(n) + '░'.repeat(5 - n) : '░░░░░';
  return `[${left}|${right}]`;
}

function visible(world: World, id: string): boolean {
  const c = world.characters[id];
  return !!c && (c.houseId === world.playerHouseId || knowledgeOf(world, world.playerHouseId, id).depth >= 45);
}

function bondText(world: World, a: string, b: string | undefined, bond: Bond | 'kin' | undefined): string {
  if (!bond) return '';
  if (bond === 'kin') return 'kin';
  if (SECRET_BONDS.includes(bond) && !(world.characters[a]?.houseId === world.playerHouseId && world.characters[b ?? '']?.houseId === world.playerHouseId)) return '';
  return BOND_LABEL[bond];
}

function circles(world: World): { title: string; people: Character[] }[] {
  const P = world.playerHouseId;
  const ours = Object.values(world.characters).filter((c) => c.alive && c.houseId === P && c.tier === 'full');
  const lord = ours.find((c) => c.seat === 'highroy');
  const family = ours.filter((c) => lord && c.familyId === lord.familyId && c.id !== lord.id);
  const council = ours.filter((c) => c.seat && c.seat !== 'highroy' && !family.includes(c));
  const knights = ours.filter((c) => c.role === 'Knight' && !c.seat && !family.includes(c));
  const court = ours.filter((c) => c !== lord && !family.includes(c) && !council.includes(c) && !knights.includes(c));
  return [
    { title: 'The Highroy', people: lord ? [lord] : [] },
    { title: 'Family', people: family },
    { title: 'Council', people: council },
    { title: 'Knights', people: knights },
    { title: 'The court', people: court },
  ].filter((g) => g.people.length);
}

export function RelationsPage({ focus: initial, view: initialView }: { focus?: string; view?: View }) {
  const world = useWorld();
  const nav = useNav();
  const P = world.playerHouseId;
  const lord = Object.values(world.characters).find((c) => c.alive && c.houseId === P && c.seat === 'highroy');
  const [focus, setFocus] = useState<string | undefined>(initial ?? lord?.id);
  const [view, setView] = useState<View>(initialView ?? 'web');
  const me = focus ? world.characters[focus] : undefined;
  return (
    <>
      <div className="page-title">
        <h2>Relationships</h2>
        <p>Who feels what about whom. Pick anyone to see the house through their eyes. You see other houses' ties only as far as you know their people.</p>
      </div>
      <div className="filters">
        {(['web', 'factions', 'young', 'everyone'] as View[]).map((v) => (
          <button key={v} type="button" className="pill" aria-pressed={view === v} onClick={() => setView(v)}>{v === 'web' ? 'TIES' : v === 'young' ? 'YOUNGLINGS & WARDS' : v.toUpperCase()}</button>
        ))}
        <button type="button" className="pill" onClick={() => nav.to({ kind: 'training' })}>TRAINING ›</button>
      </div>
      {view === 'everyone' ? <PeoplePage /> : view === 'factions' ? <Factions /> : view === 'young' ? <Younglings /> : (
        <div className="grid">
          <Panel title="Our people" aside="by circle" className="span-4">
            {circles(world).map((g) => (
              <div key={g.title} style={{ padding: '4px 0' }}>
                <div className="eyebrow" style={{ padding: '6px 14px 2px' }}>{g.title}</div>
                {g.people.map((c) => {
                  const toLord = lord && c.id !== lord.id ? tiesOf(world, c.id).find((t) => t.other === lord.id)?.out ?? 0 : null;
                  return (
                    <button key={c.id} type="button" className="desk-item" aria-pressed={focus === c.id} onClick={() => setFocus(c.id)} style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name.given} {c.name.family ?? ''}{c.seat ? ` · ${SEAT_TITLE[c.seat]}` : ''}{isAway(world, c.id) ? ' · away' : ''}</span>
                      <span className="when">{toLord === null ? 'rules' : `${opinionBar(toLord)}`}</span>
                    </button>
                  );
                })}
              </div>
            ))}
            <p className="body keyhint" style={{ margin: 0, fontSize: 12 }}>The bar is how each feels about the Highroy.</p>
          </Panel>
          <div className="span-8 stack">
            {me ? <TiesPanel id={me.id} /> : null}
            {me ? <div className="actions"><Go to={{ kind: 'character', id: me.id }} className="btn small">Open {me.name.given}'s page</Go><button type="button" className="btn small" onClick={() => nav.to({ kind: 'log', person: me.id })}>Their record</button></div> : null}
          </div>
        </div>
      )}
    </>
  );
}

/** A person's ties: how they feel, how it is returned, and why. */
export function TiesPanel({ id, className, limit }: { id: string; className?: string; limit?: number }) {
  const world = useWorld();
  const me = world.characters[id];
  if (!me) return null;
  const known = visible(world, id);
  const ties = known ? tiesOf(world, id).filter((t) => visible(world, t.other)) : [];
  const shown = limit ? ties.slice(0, limit) : ties;
  return (
    <Panel title={<Term k="relationships">{`${me.name.given}'s ties`}</Term>} aside={known ? `${ties.length} known` : 'we do not know them well enough'} className={className}>
      {!known ? <p className="body muted" style={{ margin: 0 }}>Learn more about them (missions, agents) to see who they love and hate.</p> : null}
      {known && shown.length === 0 ? <p className="body muted" style={{ margin: 0 }}>No ties worth noting yet. Time at court, missions and events make them.</p> : null}
      <div className="table-wrap">
        {shown.length ? (
          <table className="ctable">
            <thead><tr><th>PERSON</th><th>BOND</th><th>THEY FEEL</th><th>RETURNED</th><th>WHY</th></tr></thead>
            <tbody>
              {shown.map((t) => (
                <tr key={t.other}>
                  <td><PersonById id={t.other} /></td>
                  <td>{bondText(world, id, t.other, t.bond)}</td>
                  <td className="mono">{opinionBar(t.out)} {t.out > 0 ? '+' : ''}{t.out}</td>
                  <td className="mono">{opinionBar(t.back)} {t.back > 0 ? '+' : ''}{t.back}</td>
                  <td className="muted" style={{ whiteSpace: 'normal', fontSize: 12 }}>{t.reasons.slice(0, 2).join('; ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </Panel>
  );
}

function Factions() {
  const world = useWorld();
  const groups = factions(world, world.playerHouseId);
  return (
    <div className="grid">
      <Panel title="Factions" aside={`${groups.length} circles of friends`} className="span-12">
        <p className="body muted" style={{ margin: 0 }}>People who stick together: friends, lovers, spouses and sworn knights. Watch where the heir's friends are, and who stands with the Grand Master.</p>
        {groups.map((g, i) => (
          <div key={i} className="row" style={{ alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
            <span className="eyebrow" style={{ width: 90 }}>Circle {i + 1}</span>
            {g.map((id, k) => <span key={id}>{k ? '· ' : ''}<PersonLink c={world.characters[id]!} /></span>)}
          </div>
        ))}
        {groups.length === 0 ? <p className="body muted" style={{ margin: 0 }}>No circles have formed yet.</p> : null}
      </Panel>
    </div>
  );
}
