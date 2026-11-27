// The House: the household as its rooms, each folding open. The Family Quarters open into the family tree;
// the others hold their people and their one job. A lens colours everyone; a person opens in the drawer.
import { useState, type ReactNode } from 'react';
import { useWorld } from './context';
import { Go, Panel, PersonLink } from './links';
import { GuardsPanel } from './chair';
import { Younglings } from './training';
import { barsOf, DISLIKE_TIERS, LIKE_TIERS, opinion, tieOf, tierOf } from '../sim/relationships';
import { ambitionText } from '../sim/ambitions';
import { cannotTalk } from '../sim/talk';
import { isAway } from '../sim/court';
import { orbitAgo } from '../sim/since';
import { familyHead } from '../sim/query';
import { shipsOf } from '../sim/fleet';
import { youths, enrolmentOf } from '../sim/training';
import { protection, ensureChair } from '../sim/chair';
import { envyAgainst } from '../sim/envy';
import { SEAT_TITLE } from '../sim/world';
import type { Character, World } from '../sim/types';

type Lens = 'opinion' | 'wants' | 'danger' | 'young';
const LENS_LABEL: Record<Lens, string> = { opinion: 'Toward you', wants: 'What they want', danger: 'Danger & guards', young: 'Wards & teaching' };
type Room = 'family' | 'council' | 'nursery' | 'barracks' | 'guards' | 'wider';

/** How someone feels about the Highroy, as one number. */
const feel = (w: World, id: string, lord: string) => { const b = barsOf(w, id, lord); return Math.round(b.like - b.dislike); };

/** What makes someone a target. */
export function dangerOf(w: World, c: Character): { score: number; why: string[] } {
  const why: string[] = [];
  const envy = envyAgainst(w, w.playerHouseId);
  let score = Math.round(envy / 2);
  const price = (w.bounties?.list ?? []).filter((b) => (b.status === 'open' || b.status === 'hunted') && b.target.kind === 'person' && b.target.id === c.id).reduce((n, b) => n + b.reward, 0);
  if (price) { score += 25 + price / 400; why.push(`a price of ${price.toLocaleString('en-US')} on them`); }
  const avengers = Object.entries(w.ambitions?.of ?? {}).filter(([id, a]) => a.kind === 'revenge' && a.target === c.id && w.characters[id]?.alive).length;
  if (avengers) { score += 15 * avengers; why.push(`${avengers} sworn to revenge`); }
  if (c.seat === 'highroy') { score += 10; why.push('the Highroy'); } else if (c.role === 'Heir') { score += 10; why.push('the heir'); }
  return { score: Math.round(score), why };
}

/** The lens's reading of one person: a tone and a short text. */
function readOf(w: World, c: Character, lens: Lens, lord: string): { tone: 'up' | 'down' | 'gold' | ''; text: string } {
  if (c.id === lord) return { tone: 'gold', text: 'Highroy' };
  switch (lens) {
    case 'opinion': { const v = feel(w, c.id, lord); return { tone: v > 10 ? 'up' : v < -10 ? 'down' : '', text: `${v > 0 ? '+' : ''}${v}` }; }
    case 'wants': { const a = w.ambitions?.of[c.id]; if (!a) return { tone: '', text: 'content' }; if (!a.known) return { tone: '', text: 'unspoken' }; return { tone: a.frustration >= 70 ? 'down' : a.frustration >= 45 ? 'gold' : '', text: `${a.kind} · ${Math.round(a.frustration)}` }; }
    case 'danger': { const d = dangerOf(w, c); const p = Math.round(protection(w, c.id) * 100); return { tone: d.score >= 30 && p < 50 ? 'down' : d.score >= 12 ? 'gold' : '', text: `${d.score >= 30 ? 'high' : d.score >= 12 ? 'some' : 'low'} · ${p}%` }; }
    case 'young': { const e = enrolmentOf(w, c.id); const y = youths(w, w.playerHouseId).some((x) => x.id === c.id); return { tone: y && !e ? 'gold' : '', text: e ? e.program : y ? 'untaught' : '' }; }
  }
}

function Node({ c, lens, lord, pick, sel }: { c: Character; lens: Lens; lord: string; pick: (id: string) => void; sel?: string }) {
  const world = useWorld();
  const r = readOf(world, c, lens, lord);
  return (
    <button type="button" className={`hnode${r.tone ? ` t-${r.tone}` : ''}${sel === c.id ? ' sel' : ''}`} onClick={() => pick(c.id)}>
      <strong>{c.name.given}</strong>
      <span className="muted" style={{ fontSize: 11 }}>{c.seat ? SEAT_TITLE[c.seat] : c.role}{isAway(world, c.id) ? ' · away' : ''}</span>
      {r.text ? <span className={r.tone === 'up' ? 'up' : r.tone === 'down' ? 'down' : r.tone === 'gold' ? 'gold' : 'muted'} style={{ fontSize: 11 }}>{r.text}</span> : null}
    </button>
  );
}

function RoomBox({ id, title, summary, open, toggle, lead, children }: { id: Room; title: string; summary: ReactNode; open: boolean; toggle: (r: Room) => void; lead?: boolean; children: ReactNode }) {
  return (
    <section className={`hroom${lead ? ' lead' : ''}`}>
      <button type="button" className="hroom-head" aria-expanded={open} onClick={() => toggle(id)}>
        <span className="gold">{open ? '▾' : '▸'}</span>
        <span className="hroom-name">{title}</span>
        <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>{summary}</span>
      </button>
      {open ? <div className="hroom-body">{children}</div> : null}
    </section>
  );
}

export function HousePage({ room: initial }: { room?: Room }) {
  const world = useWorld();
  const P = world.playerHouseId;
  const lordId = world.houses[P]?.rulerId;
  const [lens, setLens] = useState<Lens>(initial === 'guards' ? 'danger' : initial === 'nursery' ? 'young' : 'opinion');
  const [open, setOpen] = useState<Set<Room>>(() => new Set<Room>(initial ? ['family', initial] : ['family', 'council']));
  const [famOpen, setFamOpen] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<string | undefined>();
  if (!lordId) return <p className="muted">The house has no Highroy.</p>;
  const lord = world.characters[lordId]!;
  const toggle = (r: Room) => setOpen((s) => { const n = new Set(s); if (n.has(r)) n.delete(r); else n.add(r); return n; });
  const ours = Object.values(world.characters).filter((c) => c.alive && c.houseId === P && c.tier === 'full' && !c.veiled);
  const ruling = ours.filter((c) => c.familyId === lord.familyId && c.id !== lord.id);
  const spouse = ruling.filter((c) => /spouse|consort/i.test(c.role));
  const kin = ruling.filter((c) => !spouse.includes(c));
  const council = ours.filter((c) => c.seat && c.seat !== 'highroy');
  const knights = ours.filter((c) => c.role === 'Knight' || c.flags.some((f) => f.id === 'knighted'));
  const young = youths(world, P);
  const captains = new Set(shipsOf(world, P).map((s) => s.captainId).filter(Boolean) as string[]);
  const families = Object.values(world.families).filter((f) => f.houseId === P && !f.ruling)
    .map((f) => ({ f, people: ours.filter((c) => c.familyId === f.id && (c.seat || knights.includes(c) || captains.has(c.id) || familyHead(world, f.id)?.id === c.id)) }))
    .filter((x) => x.people.length).sort((a, b) => b.people.length - a.people.length);
  const placed = new Set([lord.id, ...ruling.map((c) => c.id), ...council.map((c) => c.id), ...knights.map((c) => c.id), ...young.map((c) => c.id), ...families.flatMap((x) => x.people.map((c) => c.id))]);
  const wider = ours.filter((c) => !placed.has(c.id));
  const v = (c: Character) => feel(world, c.id, lordId);
  const coldIn = (cs: Character[]) => cs.filter((c) => v(c) < -10).length;
  const fondIn = (cs: Character[]) => cs.filter((c) => v(c) > 10).length;
  const heir = ours.find((c) => c.role === 'Heir');
  const guards = ensureChair(world).guards;
  const unguarded = [lord, ...(heir ? [heir] : [])].filter((c) => !guards[c.id]);
  const untaught = young.filter((c) => !enrolmentOf(world, c.id));
  const asking = (world.ambitions?.audiences ?? []).length + (world.talkRequests ?? []).length;
  // The person most worth your time: the coldest of those close to the throne.
  const lead = [...council, ...ruling].filter((c) => !cannotTalk(world, c.id) && v(c) < -15).sort((a, b) => v(a) - v(b))[0];
  const N = (c: Character) => <Node key={c.id} c={c} lens={lens} lord={lordId} pick={setSel} sel={sel} />;
  const me = sel ? world.characters[sel] : lead;
  return (
    <>
      <div className="page-title">
        <h2>The House</h2>
        <p>The household as its rooms. Open what you need; the lens colours everyone; click a person to see them in the drawer.</p>
      </div>
      <div className="filters" style={{ marginBottom: 10 }}>
        <span className="eyebrow" style={{ alignSelf: 'center' }}>Lens</span>
        {(Object.keys(LENS_LABEL) as Lens[]).map((l) => <button key={l} type="button" className="pill" aria-pressed={lens === l} onClick={() => setLens(l)}>{LENS_LABEL[l]}</button>)}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button type="button" className="pill" onClick={() => setOpen(new Set<Room>(['family', 'council', 'nursery', 'barracks', 'guards', 'wider']))}>Open all</button>
          <button type="button" className="pill" onClick={() => setOpen(new Set())}>Fold all</button>
        </span>
      </div>
      <div className="house-layout">
        <div className="stack" style={{ gap: 8, minWidth: 0 }}>
          <RoomBox id="family" title="FAMILY QUARTERS · THE TREE" open={open.has('family')} toggle={toggle} summary={`${ruling.length + 1} of the blood · ${families.length} families · ${fondIn([...ruling, ...families.flatMap((x) => x.people)])} fond · ${coldIn([...ruling, ...families.flatMap((x) => x.people)])} cold`}>
            <div className="htree">
              <div className="hrow">{N(lord)}{spouse.map(N)}</div>
              {kin.length ? <><span className="hline" /><div className="hrow">{kin.map(N)}</div></> : null}
              {families.length ? <><span className="hline" />
                <div className="hfams">
                  {families.map(({ f, people }) => {
                    const isOpen = famOpen.has(f.id) || people.some((c) => c.id === sel);
                    const cold = coldIn(people);
                    return (
                      <div key={f.id} className={`hfam${cold ? ' t-down' : ''}`}>
                        <button type="button" className="hfam-head" onClick={() => setFamOpen((s) => { const n = new Set(s); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); return n; })}>
                          <span className="eyebrow">{isOpen ? '▾' : '▸'} {f.name.toUpperCase()}</span>
                          <span className="muted" style={{ fontSize: 11 }}>{people.length}{cold ? ` · ${cold} cold` : ''}</span>
                        </button>
                        {isOpen ? <div className="hrow wrap">{people.map(N)}</div> : <span style={{ fontSize: 12 }}>{people.slice(0, 3).map((c) => `${c.name.given} ${readOf(world, c, lens, lordId).text}`).join(' · ')}{people.length > 3 ? ' …' : ''}</span>}
                      </div>
                    );
                  })}
                </div>
              </> : null}
            </div>
          </RoomBox>
          <RoomBox id="council" title="THE COUNCIL CHAMBER" open={open.has('council')} toggle={toggle} lead={!!lead && council.includes(lead)} summary={`${council.length} seats · ${coldIn(council)} cold`}>
            <div className="hrow wrap">{council.map(N)}</div>
            <Go to={{ kind: 'council' }}>To the council table ›</Go>
          </RoomBox>
          <RoomBox id="nursery" title="THE NURSERY & SCHOOLROOM" open={open.has('nursery')} toggle={toggle} lead={untaught.length > 0} summary={`${young.length} young · ${untaught.length} untaught`}>
            <Younglings />
          </RoomBox>
          <RoomBox id="barracks" title="THE BARRACKS" open={open.has('barracks')} toggle={toggle} summary={`${knights.length} knights · ${knights.filter((k) => k.flags.some((f) => f.id === 'wounded')).length} wounded · ${coldIn(knights)} cold`}>
            <div className="hrow wrap">{knights.map(N)}</div>
            <Go to={{ kind: 'military' }}>To Arms ›</Go>
          </RoomBox>
          <RoomBox id="guards" title="THE GUARD POST" open={open.has('guards')} toggle={toggle} lead={unguarded.length > 0 && dangerOf(world, unguarded[0]!).score >= 12} summary={unguarded.length ? <span className="gold">{unguarded.map((c) => c.id === lord.id ? 'the Highroy' : 'the heir').join(' and ')} unguarded</span> : 'the Highroy and heir are guarded'}>
            <GuardsPanel className="span-12" />
          </RoomBox>
          <RoomBox id="wider" title="THE WIDER HOUSE" open={open.has('wider')} toggle={toggle} summary={`${wider.length}${asking ? ` · ${asking} ask to see you` : ''}`}>
            <div className="hrow wrap">{wider.slice(0, 60).map(N)}</div>
            {wider.length > 60 ? <span className="muted">and {wider.length - 60} more</span> : null}
          </RoomBox>
        </div>
        {me ? <Drawer c={me} lordId={lordId} suggested={!sel} /> : null}
      </div>
    </>
  );
}

/** One person, as they stand with you. */
function Drawer({ c, lordId, suggested }: { c: Character; lordId: string; suggested: boolean }) {
  const world = useWorld();
  const b = barsOf(world, c.id, lordId);
  const v = Math.round(b.like - b.dislike);
  const word = [tierOf(b.like, LIKE_TIERS), tierOf(b.dislike, DISLIKE_TIERS)].filter(Boolean).join(', but ') || 'No strong feeling';
  const reasons = (tieOf(world, c.id, lordId)?.reasons ?? []).slice(0, 3).map((r) => r.replace(/^([+-]?\d+) (.*)$/, '$2 ($1)'));
  const was = orbitAgo(world)?.toLord[c.id];
  const moved = was === undefined ? 0 : Math.round(opinion(world, c.id, lordId) - was);
  const a = world.ambitions?.of[c.id];
  const d = dangerOf(world, c);
  const talk = c.id === lordId ? 'It is you' : cannotTalk(world, c.id);
  return (
    <Panel title={suggested ? 'Worth your time' : c.name.given} className="house-drawer lead">
      <div className="body" style={{ display: 'grid', gap: 8, fontSize: 13 }}>
        <PersonLink c={c} />
        <span className="muted" style={{ fontSize: 12 }}>{c.seat ? SEAT_TITLE[c.seat] : c.role}{isAway(world, c.id) ? ' · away' : ''}</span>
        {c.id !== lordId ? <>
          <span><span className="muted">Toward you</span> <strong style={{ color: v < -10 ? 'var(--orange)' : v > 10 ? 'var(--green)' : undefined }}>{v > 0 ? '+' : ''}{v}</strong>{moved ? <span className={`since ${moved > 0 ? 'up' : 'down'}`}>{moved > 0 ? '▲' : '▼'}{Math.abs(moved)}</span> : null} <span className="muted">· {word}</span></span>
          {reasons.length ? <span className="muted" style={{ fontSize: 12 }}>{reasons.join(' · ')}</span> : null}
        </> : null}
        <span><span className="muted">Wants</span> {a ? (a.known ? <>{ambitionText(world, a).replace(/^wants /, '')} <span className={a.frustration >= 70 ? 'down' : 'muted'}>· {Math.round(a.frustration)}</span></> : <span className="muted">unspoken; an audience would tell you</span>) : <span className="muted">nothing just now</span>}</span>
        <span><span className="muted">Danger</span> {d.score >= 30 ? 'high' : d.score >= 12 ? 'some' : 'low'} · {Math.round(protection(world, c.id) * 100)}% protected{d.why.length ? <span className="muted"> · {d.why.join(', ')}</span> : null}</span>
        <div className="actions">
          {talk ? <span className="muted" style={{ fontSize: 12 }}>{talk}</span> : <Go to={{ kind: 'talk', id: c.id }} className="btn small lead">Audience ›</Go>}
          <Go to={{ kind: 'character', id: c.id }} className="btn small">Their page</Go>
          <Go to={{ kind: 'people', view: 'web', focus: c.id }} className="btn small">Their ties</Go>
        </div>
      </div>
    </Panel>
  );
}
