// The Hall as a command deck: the house's vital numbers as tiles with their trend, then the desk, what is in
// motion, and what is coming.
import { useWorld } from './context';
import { Go, Panel, PersonById, PersonLink } from './links';
import { Term } from './tip';
import { orbitAgo, snapshot } from '../sim/since';
import { econ } from '../sim/economy';
import { ordinal } from '../sim/rankings';
import { tableOf } from './rankings';
import { activeMissions, MISSION_LABEL } from '../sim/missions';
import { schedule } from './missions';
import { OATHS_BY_ID, oathProgress } from '../sim/council';
import { QUEST_LABEL } from '../sim/quests';
import { absoluteCycle, formatDate } from '../sim/time';
import { opinion } from '../sim/relationships';
import type { ReactNode } from 'react';

const BLOCKS = '▁▂▃▄▅▆▇█';
const spark = (xs: number[]) => { if (xs.length < 2) return ''; const lo = Math.min(...xs), hi = Math.max(...xs); return xs.map((x) => BLOCKS[hi === lo ? 3 : Math.round(((x - lo) / (hi - lo)) * 7)]).join(''); };
const short = (n: number) => (Math.abs(n) >= 10000 ? `${(n / 1000).toFixed(1)}k` : Math.round(n).toLocaleString('en-US'));

function Tile({ label, value, foot, tone, to }: { label: ReactNode; value: ReactNode; foot: ReactNode; tone?: 'up' | 'down'; to?: Parameters<typeof Go>[0]['to'] }) {
  const body = (
    <>
      <span className="eyebrow">{label}</span>
      <strong className="deck-big">{value}</strong>
      <span className={`deck-foot ${tone ?? 'muted'}`}>{foot}</span>
    </>
  );
  return to ? <Go to={to} className="deck-tile">{body}</Go> : <div className="deck-tile">{body}</div>;
}

const trend = (d: number, good: 1 | -1 = 1): { text: string; tone?: 'up' | 'down' } => (d ? { text: `${d > 0 ? '▲' : '▼'}${short(Math.abs(d))}`, tone: (d > 0) === (good > 0) ? 'up' : 'down' } : { text: 'steady' });

/** The house's vital numbers, each with its change over the last Orbit. */
export function DeckTiles() {
  const world = useWorld();
  const P = world.playerHouseId;
  const now = snapshot(world);
  const was = orbitAgo(world);
  const us = tableOf(world).find((r) => r.id === P);
  const prevPlace = world.rankings?.prev?.find((r) => r.id === P)?.place;
  const total = tableOf(world).length;
  const hist = (world.since ?? []).map((s) => s.othes).concat(Math.round(econ(world, P).stock.othes));
  const council = Object.values(world.characters).filter((c) => c.alive && c.houseId === P && c.seat && c.seat !== 'highroy');
  const lord = world.houses[P]?.rulerId;
  const mood = lord && council.length ? Math.round(council.reduce((n, c) => n + opinion(world, c.id, lord), 0) / council.length) : 0;
  const cold = lord ? council.filter((c) => opinion(world, c.id, lord) <= -15).length : 0;
  const moodWas = was && council.length ? Math.round(council.reduce((n, c) => n + (was.toLord[c.id] ?? 0), 0) / council.length) : mood;
  const o = trend(now.othes - (was?.othes ?? now.othes));
  const h = trend(now.honour - (was?.honour ?? now.honour));
  const m = trend(mood - moodWas);
  const u = trend(now.unrest - (was?.unrest ?? now.unrest), -1);
  const s = trend(now.soldiers - (was?.soldiers ?? now.soldiers));
  return (
    <div className="deck-tiles">
      <Tile to={{ kind: 'rankings' }} label="Rank" value={us ? ordinal(us.place) : '—'} foot={<>{prevPlace && us && prevPlace !== us.place ? `${prevPlace > us.place ? '▲' : '▼'}${Math.abs(prevPlace - us.place)} · ` : ''}of {total}</>} tone={prevPlace && us ? (prevPlace > us.place ? 'up' : prevPlace < us.place ? 'down' : undefined) : undefined} />
      <Tile to={{ kind: 'economy' }} label={<Term k="othes">Coffers</Term>} value={short(now.othes)} foot={<><span className="spark">{spark(hist)}</span> {o.text}</>} tone={o.tone} />
      <Tile to={{ kind: 'council' }} label="Honour" value={now.honour} foot={<>R {now.respect} · D {now.dread} · {h.text}</>} tone={h.tone} />
      <Tile to={{ kind: 'people' }} label="Court mood" value={`${mood > 0 ? '+' : ''}${mood}`} foot={<>{cold} cold · {m.text}</>} tone={cold >= 3 ? 'down' : m.tone} />
      <Tile to={{ kind: 'worlds' }} label="Unrest" value={now.unrest} foot={u.text} tone={u.tone} />
      <Tile to={{ kind: 'military' }} label="Soldiers" value={short(now.soldiers)} foot={s.text} tone={s.tone} />
    </div>
  );
}

/** Everything under way: missions, board jobs, the oath. */
export function InMotion({ className }: { className?: string }) {
  const world = useWorld();
  const P = world.playerHouseId;
  const now = absoluteCycle(world.date);
  const missions = activeMissions(world, P);
  const jobs = (world.quests?.board ?? []).filter((q) => q.goneId);
  const court = world.courts[P];
  const prog = oathProgress(world, P);
  const oath = court?.oath ? OATHS_BY_ID[court.oath.id] : undefined;
  const meter = (f: number) => <span className="bar deck-bar"><span style={{ width: `${Math.round(Math.max(0, Math.min(1, f)) * 100)}%`, background: 'var(--gold)' }} /></span>;
  const none = !missions.length && !jobs.length && !oath;
  return (
    <Panel title="In motion" aside={<Go to={{ kind: 'missions' }}>Missions ›</Go>} className={className}>
      <div className="body" style={{ display: 'grid', gap: 10, fontSize: 13 }}>
        {none ? <span className="muted">Nothing under way. <Go to={{ kind: 'missions' }}>The boards ›</Go></span> : null}
        {missions.map((m) => {
          const s = schedule(m);
          const f = Math.min(1, (now - absoluteCycle(m.launched)) / Math.max(1, s.total));
          return (
            <Go key={m.id} to={{ kind: 'mission', id: m.id }} className="deck-motion">
              <span><PersonById id={m.leaderId} /> <span className="muted">· {MISSION_LABEL[m.kind].toLowerCase()}</span></span>
              <span className="muted" style={{ fontSize: 11 }}>{meter(f)} back {formatDate(s.home)}</span>
            </Go>
          );
        })}
        {jobs.map((q) => {
          const c = world.characters[q.goneId!];
          const f = q.back ? 1 - Math.max(0, absoluteCycle(q.back) - now) / Math.max(1, q.cycles * 2.5) : 0.5;
          return (
            <div key={q.id} className="deck-motion">
              <span>{c ? <PersonLink c={c} /> : '—'} <span className="muted">· {QUEST_LABEL[q.kind].toLowerCase()}: {q.title}</span></span>
              <span className="muted" style={{ fontSize: 11 }}>{meter(f)} {q.back ? `back ${formatDate(q.back)}` : 'on the trail'}</span>
            </div>
          );
        })}
        {oath && prog && court?.oath ? (
          <Go to={{ kind: 'council' }} className="deck-motion">
            <span>Oath · {oath.label}</span>
            <span className="muted" style={{ fontSize: 11 }}>{meter(prog.fraction)} {Math.round(prog.fraction * 100)}% · ends {formatDate(court.oath.ends)}</span>
          </Go>
        ) : null}
      </div>
    </Panel>
  );
}
