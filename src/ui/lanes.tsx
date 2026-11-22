// Lanes & corsairs: our convoys under way, the danger on every lane, our customs post, and what we
// have to do with the corsair companies.
import { useState } from 'react';
import { useGame, useWorld } from './context';
import { Go, HouseLink, Panel } from './links';
import { Term } from './tip';
import { bar } from './hall';
import { riskWord } from './starmap';
import {
  answerOffer, cannotPropose, compactOf, convoyLabel, CUSTOMS_LABEL, CUSTOMS_NOTE, dealsOf, endCompact, laneName, laneRisk, LANE_BY_ID, LANES,
  ourConvoys, placeName, proposeCompact, relWord, setCustoms, type Customs,
} from '../sim/lanes';
import { isHostile } from '../sim/companies';
import { CompanyWindow } from './company';
import { formatDate } from '../sim/time';
import { absoluteCycle } from '../sim/time';
import { RESOURCE_LABEL } from '../data/economy';
import type { World } from '../sim/types';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function usePlay() {
  const game = useGame();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: (w: World) => World) => game.update((w) => { try { setErr(null); return fn(w); } catch (e) { setErr((e as Error).message); return w; } });
  return { run, err };
}

const FATE: Record<string, string> = { arrived: 'arrived', taken: 'TAKEN', seized: 'SEIZED', lost: 'LOST', saved: 'saved by the escort' };

export function LanesPage() {
  const world = useWorld();
  const { run, err } = usePlay();
  const P = world.playerHouseId;
  const s = world.lanes;
  const [open, setOpen] = useState<string | null>(null);
  if (!s) return null;
  const now = absoluteCycle(world.date);
  const mine = ourConvoys(world);
  const escorts = Object.values(world.fleet?.ships ?? {}).filter((x) => x.houseId === P && !x.lost && x.duty === 'escort');
  const cu = s.customs[P] ?? 'fair';
  const deals = dealsOf(world);
  const lately = s.done.filter((c) => c.owner === P || c.buyer === P || (c.fate !== 'arrived' && c.owner !== 'free')).slice(0, 14);
  return (
    <>
      {open ? <CompanyWindow id={open} onClose={() => setOpen(null)} /> : null}
      <div className="page-title">
        <h2>Lanes &amp; corsairs</h2>
        <p>Everything the houses make, buy, sell and are granted travels: the Numarade's Navisium from the Reserve, surpluses out to the Exchange, shortfalls back. Every run crosses a lane, and the lanes have corsairs on them.</p>
      </div>
      {err ? <p className="body error">{err}</p> : null}
      <div className="grid">
        <Panel title="Our convoys under way" aside={`${mine.length}`} className="span-7">
          {mine.length === 0 ? <p className="body muted" style={{ margin: 0 }}>Nothing of ours is on the lanes just now.</p> : null}
          {mine.map((c) => {
            const lane = LANE_BY_ID[c.lane]!;
            const ship = c.escort ? world.fleet?.ships[c.escort] : undefined;
            return (
              <div key={c.id} className="row">
                <span style={{ flex: 1 }}>{cap(convoyLabel(world, c))} <span className="muted">· {fmt(c.qty)} {RESOURCE_LABEL[c.good].toLowerCase()}, ~{fmt(c.value)} othes · {placeName(world, c.from)} → {placeName(world, c.to)}</span></span>
                <span className="muted" style={{ fontSize: 12 }}>{ship ? `escort: ${ship.name}` : 'no escort'} · {riskWord(laneRisk(world, lane))} · {Math.max(0, absoluteCycle(c.arrives) - now)}cy{c.delayed ? ' (late)' : ''}</span>
              </div>
            );
          })}
          <p className="body muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
            {escorts.length ? `${escorts.length} ship${escorts.length === 1 ? '' : 's'} on convoy escort; each guards two runs at a time. ` : 'No ship of ours is on convoy escort. '}
            <Go to={{ kind: 'fleet' }}>Fleet duties ›</Go>
          </p>
        </Panel>
        <Panel title="Our customs post" aside={CUSTOMS_LABEL[cu]} className="span-5">
          <div className="actions body">
            {(Object.keys(CUSTOMS_LABEL) as Customs[]).map((k) => (
              <button key={k} type="button" className={`btn small${cu === k ? ' primary' : ''}`} title={CUSTOMS_NOTE[k]} onClick={() => run((w) => setCustoms(w, k))}>{CUSTOMS_LABEL[k]}</button>
            ))}
          </div>
          <p className="body muted" style={{ margin: 0, fontSize: 12 }}>{CUSTOMS_NOTE[cu]}</p>
          <p className="body muted" style={{ margin: '6px 0 0', fontSize: 12 }}>The other houses: {Object.keys(world.houses).filter((h) => h !== P).map((h, i) => <span key={h}>{i ? ' · ' : ''}<HouseLink id={h} /> {CUSTOMS_LABEL[s.customs[h] ?? 'fair'].toLowerCase()}</span>)}</p>
        </Panel>

        <Panel title="The companies" aside="corsairs of the outer lanes · open one for its people and history" className="span-7">
          {Object.values(s.factions).map((f) => {
            const r = f.rel[P] ?? 0;
            const ours = deals.filter((d) => d.faction === f.id);
            const named = f.members.filter((m) => m.known && !m.fate).length;
            return (
              <div key={f.id} className="row">
                <span style={{ flex: 1 }}>
                  <button type="button" className="linklike" onClick={() => setOpen(f.id)}><strong>{cap(f.name)}</strong></button>
                  <span className="muted"> · {relWord(r)} ({Math.round(r)}){isHostile(world, f) ? ' · at war with us' : ''}{ours.length ? ` · ${ours.map((d) => (d.kind === 'passage' ? 'passage paid' : d.kind === 'bounty' ? 'our bounty' : 'our letters')).join(', ')}` : ''} · {named} known by name</span>
                </span>
                <span className="mono" title="Strength">{bar(f.strength / 100)}</span>
                <button type="button" className="btn small" onClick={() => setOpen(f.id)}>Open ›</button>
              </div>
            );
          })}
          <p className="body muted" style={{ margin: '6px 0 0', fontSize: 12 }}>Pay them to leave our ships alone, post a bounty, declare them enemies, give them letters against a rival, or send our knights after their captains.</p>
        </Panel>
        <Panel title="Trade compacts" aside="house to house" className="span-5">
          {Object.keys(world.houses).filter((h) => h !== P).map((h) => {
            const cp = compactOf(world, P, h);
            const offer = s.offers.find((o) => o.from === h);
            const why = cannotPropose(world, h);
            return (
              <div key={h} className="row">
                <span style={{ flex: 1 }}><HouseLink id={h} /> <span className="muted">· {cp ? `since ${formatDate(cp.since)}, ${fmt(cp.traded)} othes traded` : offer ? 'they have offered one' : 'none'}</span></span>
                {cp ? <button type="button" className="btn small" onClick={() => run((w) => endCompact(w, h))}>End</button>
                  : offer ? <><button type="button" className="btn small primary" onClick={() => run((w) => answerOffer(w, offer.id, true))}>Accept</button><button type="button" className="btn small" onClick={() => run((w) => answerOffer(w, offer.id, false))}>Decline</button></>
                  : <button type="button" className="btn small" disabled={!!why} title={why ?? ''} onClick={() => run((w) => proposeCompact(w, h))}>Propose</button>}
              </div>
            );
          })}
          <p className="body muted" style={{ margin: '6px 0 0', fontSize: 12 }}>Partners buy from each other first, from what the other can spare, at the Exchange price without its cut. The goods ship capital to capital, so they cross the lanes between you. The other houses make compacts among themselves too: {s.compacts.filter((c) => c.a !== P && c.b !== P).map((c) => `${world.houses[c.a]?.name}–${world.houses[c.b]?.name}`).join(', ') || 'none yet'}.</p>
        </Panel>

        <Panel title="The lanes" aside="danger to an unescorted run of ours" className="span-7">
          {LANES.map((l) => {
            const t = s.tally[l.id];
            const who = Object.values(s.factions).filter((f) => f.haunts.includes(l.id)).map((f) => f.name.replace(/^the /, ''));
            return (
              <div key={l.id} className="row">
                <span style={{ flex: 1 }}>{laneName(world, l)} <span className="muted">· {l.cycles}cy{who.length ? ` · ${who.join(', ')}` : ''}</span></span>
                <span className="muted" style={{ fontSize: 12 }}>{t ? `${Math.round(t.runs)} runs, ${Math.round(t.losses)} lost lately · ` : ''}</span>
                <span className="mono" style={{ minWidth: 80, textAlign: 'right' }}>{riskWord(laneRisk(world, l))}</span>
              </div>
            );
          })}
        </Panel>
        <Panel title="Lately on the lanes" aside="ours, and what we heard of others" className="span-5">
          {lately.length === 0 ? <p className="body muted" style={{ margin: 0 }}>Nothing yet.</p> : null}
          {lately.map((c) => (
            <div key={c.id} className="row">
              <span style={{ flex: 1 }}>{cap(convoyLabel(world, c))} <span className="muted">· {laneName(world, LANE_BY_ID[c.lane]!)}</span></span>
              <span className={c.fate === 'arrived' || c.fate === 'saved' ? 'muted' : ''} style={{ fontSize: 12 }} title={c.note}>{FATE[c.fate ?? 'arrived']}{c.by && s.factions[c.by] ? ` · ${s.factions[c.by]!.name.replace(/^the /, '')}` : c.by && world.houses[c.by] ? ` · ${world.houses[c.by]!.name} customs` : ''}</span>
            </div>
          ))}
          <p className="body muted" style={{ margin: '6px 0 0', fontSize: 12 }}>See also <Term k="raid">raids</Term> on our ports, on the <Go to={{ kind: 'worlds' }}>star map</Go>.</p>
        </Panel>
      </div>
    </>
  );
}
