import { useState } from 'react';
import { useGame, useWorld } from './context';
import { Go, HouseLink, Panel, PersonById, SectorLink } from './links';
import { Term } from './tip';
import { formatDate } from '../sim/time';
import { orderEvent, awaiting, checkBand, checkChance, eventDef, makeCtx, oddsWord, optionLabel, optionsFor, shown, titleFor, type Check, type Ctx, type PendingEvent } from '../sim/events';
import { useSee } from './fog';
import { shortName } from '../sim/names';
import '../sim/eventDefs';
import { Rng } from '../sim/rng';
import { STAT_LABEL } from './pages';
import type { Character, World } from '../sim/types';
import { bringer, SEAT_FOR_CATEGORY } from '../sim/briefings';
import { Speaker } from './briefing';

/** Which answer a councillor would give, by who they are and what each answer costs. */
function counselOf(c: Character | undefined, labels: { text: string; ok: boolean; chance: number | null; fallback: boolean }[]): number {
  if (!c) return -1;
  const has = (...ids: string[]) => c.traits.some((t) => ids.includes(t.id));
  let best = -1, top = -Infinity;
  labels.forEach((o, i) => {
    if (!o.ok) return;
    const t = o.text.toLowerCase();
    let v = o.fallback ? 0.3 : 0;
    if (has('ruthless', 'wrathful', 'hotBlooded') && /execut|hang|force|crush|strike|demand|punish|refuse|fight|seize/.test(t)) v += 1;
    if (has('merciful', 'generous', 'humble') && /release|pardon|pay|forgive|help|mercy|give|spare|welcome/.test(t)) v += 1;
    if (has('honourBound', 'duelistsCreed') && /honour|keep|oath|truth|word|duel/.test(t)) v += 1;
    if ((has('cunning') || c.seat === 'spymaster') && /spy|watch|quiet|secret|investigat|learn|follow/.test(t)) v += 1;
    if ((c.seat === 'steward' || c.hidden.greed > 13) && /\+[\d,]+ othes/.test(t)) v += 0.8;
    if ((c.seat === 'steward' || c.hidden.greed > 13) && /[−-][\d,]+ othes/.test(t)) v -= 0.6;
    if (o.chance !== null) v += (o.chance - 0.5);
    v += ((c.id.charCodeAt(0) + i * 7) % 5) / 20;
    if (v > top) { top = v; best = i; }
  });
  return best;
}

/** The odds as we can see them: exact for a fixed difficulty, a range against someone we only half know. */
function oddsBand(ctx: Ctx, check: Check, see: ReturnType<typeof useSee>): [number, number] {
  const foe = check.vs?.(ctx);
  if (!foe) { const p = checkChance(ctx, check); return [p, p]; }
  const v = see(foe);
  const stats = check.vsStats ?? check.stats;
  const lo = stats.reduce((t, s) => t + v.stats[s][0], 0) / stats.length;
  const hi = stats.reduce((t, s) => t + v.stats[s][1], 0) / stats.length;
  return checkBand(ctx, check, [lo, hi]);
}

export function Decision({ p }: { p: PendingEvent }) {
  const world = useWorld();
  const see = useSee();
  const game = useGame();
  const def = eventDef(p.defId);
  if (!def) return null;
  const ctx = makeCtx(world, new Rng(world.rng), p);
  const opts = optionsFor(def, p);
  const m = p.missionId ? world.missions[p.missionId] : undefined;
  const arc = ctx.arc;
  const st = ctx.struggle;
  const seatBy = m ? undefined : bringer(world, SEAT_FOR_CATEGORY[def.category] ?? 'envoy');
  const voice = m ? world.characters[m.leaderId] : seatBy ? world.characters[seatBy.personId] : undefined;
  const see0 = (o: (typeof opts)[number]) => (o.check ? oddsBand(ctx, o.check, see) : null);
  const pick = counselOf(voice, opts.map((o, i) => { const b = see0(o); return { text: `${optionLabel(o, ctx)} ${o.hint ?? ''}`, ok: shown(o, ctx) && !o.available?.(ctx), chance: b ? (b[0] + b[1]) / 2 : null, fallback: i === def.fallback }; }));
  return (
    <div className="row decision">
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {voice ? <Speaker c={voice} seat={m ? undefined : seatBy?.seat} note={m ? 'sends word from the mission' : 'brings this to you'} /> : null}
        <span style={{ fontSize: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
          <span className="tag council">{def.category}</span>
          <strong style={{ fontSize: 14 }}>{titleFor(def, p)}</strong>
          {m ? <><PersonById id={m.leaderId} /> <Go to={{ kind: 'mission', id: m.id }}>· view mission</Go></> : null}
          {p.personId && p.personId !== m?.leaderId ? <PersonById id={p.personId} /> : null}
          {p.otherHouseId ? <HouseLink id={p.otherHouseId} /> : null}
          {p.sectorId ? <SectorLink id={p.sectorId} /> : null}
        </span>
        {arc && arc.stages.length ? <span className="arcline"><Term k="arc">Arc</Term> · {arc.title}, stage {arc.stages.length + 1} · before: {arc.stages.map((x) => x.choice.toLowerCase()).join(' → ')}</span> : null}
        {st ? <span className="arcline"><Term k="struggle">Struggle</Term> · {st.title} · {Math.round(st.meter) >= 0 ? '+' : ''}{Math.round(st.meter)}</span> : null}
        {p.urgent ? <span className="tag" style={{ alignSelf: 'flex-start' }}>Now</span> : null}
        <span className="quote">{p.text}</span>
        {voice && pick >= 0 ? <span style={{ fontSize: 13 }}><span className="eyebrow gold">Their counsel</span> “I would {optionLabel(opts[pick]!, ctx).replace(/^./, (x) => x.toLowerCase()).replace(/\.$/, '')}.”</span> : null}
        <span className="choices-row">
          {opts.map((o, i) => {
            if (!shown(o, ctx)) return null;
            const why = o.available?.(ctx) ?? null;
            const band = o.check ? oddsBand(ctx, o.check, see) : null;
            const chance = band ? (band[0] + band[1]) / 2 : null;
            const tester = o.check?.who(ctx);
            const foe = o.check?.vs?.(ctx);
            return (
              <button key={i} type="button" className={`btn small option${i === def.fallback ? ' fallback' : ''}${i === pick ? ' counsel' : ''}`} disabled={!!why}
                title={why ?? (o.check ? `${tester ? tester.name.given : 'Our people'}: ${o.check.stats.map((s) => STAT_LABEL[s]).join(' + ')}` : undefined)}
                onClick={() => game.update((w) => orderEvent(w, p.id, i, voice?.id))}>
                <span>{i === pick ? '★ ' : ''}{optionLabel(o, ctx)}</span>
                {o.hint || chance !== null || why ? (
                  <span className="opt-sub">
                    {why ?? [o.hint, foe && tester ? `${shortName(tester.name)} vs ${shortName(foe.name)}` : null, band ? `${oddsWord(chance!)} · ${band[1] - band[0] < 0.04 ? `${Math.round(chance! * 100)}%` : `${Math.round(band[0] * 100)}–${Math.round(band[1] * 100)}%`}` : null].filter(Boolean).join(' · ')}
                  </span>
                ) : null}
              </button>
            );
          })}
        </span>
        <span className="muted" style={{ fontSize: 11 }}>
          Lapses {formatDate(p.expires)}. If you say nothing, the council decides: <em>{optionLabel(opts[def.fallback] ?? def.options[def.fallback]!, ctx)}</em>.
        </span>
      </span>
    </div>
  );
}

export function pendingFor(world: World, missionId?: string): PendingEvent[] {
  const all = awaiting(world);
  return missionId ? all.filter((p) => p.missionId === missionId) : all;
}

/** Decisions waiting on the Highroy, newest first; with what just came of the ones answered here. */
export function DecisionsPanel({ className, missionId, hideWhenEmpty }: { className?: string; missionId?: string; hideWhenEmpty?: boolean }) {
  const world = useWorld();
  const list = [...pendingFor(world, missionId)].reverse();
  const [seenAt] = useState(() => world.events?.log[0]?.id);
  const log = world.events?.log ?? [];
  const cut = seenAt ? log.findIndex((l) => l.id === seenAt) : log.length;
  const fresh = log.slice(0, cut < 0 ? log.length : cut).filter((l) => !l.byCouncil && (!missionId || l.missionId === missionId)).slice(0, 3);
  if (hideWhenEmpty && !list.length && !fresh.length) return null;
  return (
    <Panel title={<Term k="decision">Awaiting your word</Term>} aside={list.length ? `${list.length} waiting` : 'Nothing waiting'} className={`${className ?? ''} decisions`}>
      {fresh.map((r) => (
        <div key={r.id} className="row decided">
          <span style={{ fontSize: 12 }}>
            <strong>{r.title}</strong> <span className="muted">· you chose to {r.choice.toLowerCase()}.</span>{' '}
            {r.lines.join('; ')}.
          </span>
        </div>
      ))}
      {list.length === 0 && !fresh.length ? <p className="body muted" style={{ margin: 0 }}>Nothing needs you. Decisions come from the road, from foreign courts and from home.</p> : null}
      {list.map((p) => <Decision key={p.id} p={p} />)}
    </Panel>
  );
}

/** How recent decisions went, for the council page. */
export function DecisionLog({ className }: { className?: string }) {
  const world = useWorld();
  const log = (world.events?.log ?? []).slice(0, 12);
  return (
    <Panel fold scroll={360} title="Past decisions" aside="Newest first" className={className}>
      {log.length === 0 ? <p className="body muted" style={{ margin: 0 }}>None yet.</p> : null}
      {log.map((r) => (
        <div key={r.id} className="row">
          <time>{formatDate(r.date)}</time>
          <span style={{ fontSize: 12 }}>
            <strong>{r.title}</strong> <span className="muted">· {r.byCouncil ? 'the council chose to' : 'you chose to'} {r.choice.toLowerCase()}.</span> {r.lines.join('; ')}.
          </span>
        </div>
      ))}
    </Panel>
  );
}
