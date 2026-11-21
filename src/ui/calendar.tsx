// This Orbit and the next: everything dated that the house knows is coming, in one list.
import type { ReactNode } from 'react';
import { useNav, useWorld } from './context';
import { Panel } from './links';
import { activeMissions } from '../sim/missions';
import { DRAW_ORBIT, CLOSES, ROUND_ORBITS } from '../sim/crucible';
import { knownEvents } from '../sim/circuit';
import { absoluteCycle, fromAbsolute, CYCLES_PER_ORBIT, CYCLES_PER_PHASE, dateParts, makeDate, type GameDate } from '../sim/time';
import { displayName } from '../sim/names';
import type { Route } from './router';
import type { World } from '../sim/types';

interface Due { at: GameDate; text: ReactNode; to: Route }

export function upcoming(world: World, horizon = CYCLES_PER_ORBIT * 1.5): Due[] {
  const P = world.playerHouseId;
  const now = absoluteCycle(world.date);
  const out: Due[] = [];
  const name = (id: string) => (world.characters[id] ? world.characters[id]!.name.given : 'someone');
  for (const m of activeMissions(world, P)) {
    const back = absoluteCycle(m.launched) + m.travelCycles * 2 + m.taskCycles;
    out.push({ at: fromAbsolute(back), text: <>{name(m.leaderId)} home from their mission</>, to: { kind: 'mission', id: m.id } });
  }
  const cr = world.crucible;
  const d = dateParts(world.date);
  if (cr) {
    if (cr.stage === 'quiet' || cr.stage === 'done' || cr.year !== d.year) {
      const year = d.orbit < DRAW_ORBIT ? d.year : d.year + 1;
      out.push({ at: makeDate(year, DRAW_ORBIT, 1), text: <>The draw for the Crucible</>, to: { kind: 'crucible' } });
    } else if (cr.stage === 'drawn' && cr.entrants.includes(P)) {
      out.push({ at: makeDate(d.year, CLOSES, 1), text: <>Our Crucible contingent must sail</>, to: { kind: 'crucible' } });
    } else if (cr.stage === 'campaign') {
      const r = cr.rounds.find((x) => !x.done);
      if (r) out.push({ at: makeDate(d.year, r.orbit, 2 * CYCLES_PER_PHASE + 1), text: <>Crucible battles, Orbit {r.orbit} of {ROUND_ORBITS[ROUND_ORBITS.length - 1]}</>, to: { kind: 'crucible' } });
    }
  }
  for (const e of knownEvents(world).filter((x) => !x.done)) {
    const ours = e.entrants.some((x) => x.houseId === P);
    out.push({ at: e.held, text: <>{e.name[0]!.toUpperCase() + e.name.slice(1)}{ours ? ' · ours going' : e.invited?.includes(P) ? ' · we are invited' : ''}</>, to: { kind: 'grounds' } });
  }
  for (const e of Object.values(world.training?.enrolments ?? {})) {
    if (!e.end || e.houseId !== P || e.program === 'drill') continue;
    out.push({ at: e.end, text: <>{name(e.studentId)} finishes {e.program === 'academy' ? 'at the academy' : e.program === 'ward' ? 'as a ward' : 'their tutoring'}</>, to: { kind: 'training' } });
  }
  for (const r of world.ports?.raids ?? []) if (r.status === 'revealed' && !r.answer) out.push({ at: r.arrives, text: <>Corsairs arrive</>, to: { kind: 'port', id: r.sectorId } });
  for (const p of world.events?.pending ?? []) out.push({ at: p.expires, text: <>A decision lapses</>, to: { kind: 'throne' } });
  for (const a of world.ambitions?.audiences ?? []) { const c = world.characters[a.characterId]; out.push({ at: a.expires, text: <>{c ? displayName(c.name) : 'Someone'} stops waiting for an audience</>, to: { kind: 'throne' } }); }
  return out.filter((x) => { const t = absoluteCycle(x.at); return t >= now && t <= now + horizon; }).sort((a, b) => absoluteCycle(a.at) - absoluteCycle(b.at));
}

export function CalendarPanel({ className }: { className?: string }) {
  const world = useWorld();
  const nav = useNav();
  const list = upcoming(world).slice(0, 10);
  const d = dateParts(world.date);
  const now = absoluteCycle(world.date);
  return (
    <Panel title="Coming up" aside={`Orbit ${d.orbit} · Phase ${d.phase}`} className={className}>
      <pre className="ascii" style={{ margin: '4px 12px' }} aria-label={`Phase ${d.phase} of 5`}>{[1, 2, 3, 4, 5].map((p) => (p < d.phase ? '█████' : p === d.phase ? '▓▓▓▓▓' : '░░░░░')).join(' ')}</pre>
      <div className="calendar">
        {list.length === 0 ? <p className="body muted" style={{ margin: 0 }}>Nothing dated in sight.</p> : null}
        {list.map((x, i) => (
          <button key={i} type="button" className="row linklike" style={{ textAlign: 'left', width: '100%' }} onClick={() => nav.to(x.to)}>
            <time>{absoluteCycle(x.at) - now <= 0 ? 'now' : `${absoluteCycle(x.at) - now}cy`}</time>
            <span style={{ flex: 1 }}>{x.text}</span>
          </button>
        ))}
      </div>
    </Panel>
  );
}
