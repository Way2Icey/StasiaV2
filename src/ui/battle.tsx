// The battle window: the fight as a live feed, the two sides, and the orders our commander can still give.
// You are not the one holding the blade: orders go through the commander and the fighters, and they decide
// how it goes. Moments stop the fight and ask.
import { useEffect, useRef, useState } from 'react';
import { useGame, useWorld } from './context';
import { PersonLink } from './links';
import { Term } from './tip';
import { useSee } from './fog';
import {
  answerBattleMoment, battleOf, cannotOrder, commandBattle, effective, fightItOut, orderBattle, outcomes, stepBattle,
  THEATRES, type Battle, type Fighter, type Order,
} from '../sim/battle';
import { formatRange } from '../sim/knowledge';

const TICK = { 1: 1500, 2: 650 } as const;
const pips = (n: number, max: number) => '■'.repeat(Math.max(0, n)) + '□'.repeat(Math.max(0, max - n));

function Bar({ v, max = 100, label }: { v: number; max?: number; label: string }) {
  return <div className="bbar" role="img" aria-label={`${label} ${Math.round(v)} of ${max}`}><span style={{ width: `${Math.max(0, Math.min(100, (v / max) * 100))}%` }} /></div>;
}

function Momentum({ v }: { v: number }) {
  const left = v >= 0 ? 50 : 50 + v / 2;
  return (
    <div className="momentum">
      <span className="muted">them</span>
      <div className="meter" role="img" aria-label={`Momentum ${Math.round(v)}`}><span className="mid" /><span className="fill" style={{ left: `${left}%`, width: `${Math.abs(v) / 2}%` }} /></div>
      <span className="muted">us</span>
    </div>
  );
}

const STATE: Record<Fighter['state'], string> = { ready: 'ready', engaged: 'fighting', down: 'down', dead: 'dead', pulled: 'pulled back' };

function FighterRow({ b, f, ours, act, intel }: { b: Battle; f: Fighter; ours: boolean; act: (o: Order) => void; intel: (f: Fighter) => string }) {
  const world = useWorld();
  const [target, setTarget] = useState('');
  const c = f.id ? world.characters[f.id] : undefined;
  const foe = b.fighters.find((x) => x.key === f.foe);
  const live = f.state === 'ready' || f.state === 'engaged';
  const foes = b.fighters.filter((x) => x.side !== f.side && (x.state === 'ready' || x.state === 'engaged'));
  return (
    <div className={`frow${live ? '' : ' out'}`}>
      <div className="fhead">
        <span className="fname">{f.champion ? '★ ' : ''}{c ? <PersonLink c={c} short /> : f.name}{f.caige ? <span className="caige" title={f.burnt ? 'Burnt out' : f.surge ? 'Surging' : 'Caige-bonded'}>{f.burnt ? ' ◇' : f.surge ? ' ◆◆' : ' ◆'}</span> : null}</span>
        <span className="mono" title="Wounds left">{live ? pips(f.hp, 4) : STATE[f.state]}</span>
      </div>
      <div className="fsub muted">
        {ours ? `power ${f.power.toFixed(1)}` : intel(f)}{f.res ? ` · ${f.res.band} ${f.res.type}` : ''}{f.state === 'engaged' && foe ? ` · on ${foe.name}` : ''}{f.hunts ? ' · has a score here' : ''}
      </div>
      {ours && live && b.status !== 'over' ? (
        <div className="factions">
          <select className="select" aria-label={`Send ${f.name} after`} value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Send after…</option>
            {foes.map((x) => <option key={x.key} value={x.key}>{x.champion ? '★ ' : ''}{x.name}</option>)}
          </select>
          <button type="button" className="btn small" disabled={!target || !!cannotOrder(b, 0, { kind: 'target', fighter: f.key, foe: target })} onClick={() => { act({ kind: 'target', fighter: f.key, foe: target }); setTarget(''); }}>Go</button>
          {f.caige ? <button type="button" className="btn small" disabled={!!cannotOrder(b, 0, { kind: 'commit', fighter: f.key })} title={cannotOrder(b, 0, { kind: 'commit', fighter: f.key }) ?? `Sync ${f.sync}, control ${f.control}`} onClick={() => act({ kind: 'commit', fighter: f.key })}>Commit Caige</button> : null}
          <button type="button" className="btn small" disabled={!!cannotOrder(b, 0, { kind: 'pullback', fighter: f.key })} onClick={() => act({ kind: 'pullback', fighter: f.key })}>Pull back</button>
        </div>
      ) : null}
    </div>
  );
}

export function BattleWindow({ id, onClose }: { id: string; onClose: () => void }) {
  const world = useWorld();
  const game = useGame();
  const see = useSee();
  const b = battleOf(world, id);
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState<1 | 2>(1);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (b && !b.commanded) game.update((w) => commandBattle(w, id)); }, [b, game, id]);
  useEffect(() => {
    if (!b || !running || b.status === 'over' || b.moment) return;
    const t = window.setTimeout(() => game.update((w) => stepBattle(w, id)), TICK[speed]);
    return () => window.clearTimeout(t);
  }, [b, running, speed, game, id]);
  useEffect(() => { feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight }); }, [b?.feed.length]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.code === 'Space') { e.preventDefault(); e.stopPropagation(); setRunning((r) => !r); } };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, []);
  if (!b) return null;
  const th = THEATRES[b.theatre];
  const [us, them] = b.sides;
  const act = (o: Order) => game.update((w) => orderBattle(w, id, o));
  const over = b.status === 'over';
  const intel = (f: Fighter) => {
    if (f.id && world.characters[f.id]) {
      const v = see(world.characters[f.id]!);
      const st = th.fight;
      const lo = st.reduce((t, s) => t + v.stats[s][0], 0) / st.length;
      const hi = st.reduce((t, s) => t + v.stats[s][1], 0) / st.length;
      return `power ${formatRange([Math.round(lo), Math.round(hi)])}`;
    }
    // Strangers: our commander's read of them, as good as their eye.
    const read = effective(b, f, undefined);
    const err = Math.max(1, (16 - us.commander.skill) / 2);
    return `power ~${Math.max(1, Math.round(read - err))}–${Math.round(read + err)}`;
  };
  const sideCard = (s: typeof us, mine: boolean) => (
    <div className="bside">
      <strong>{s.name}</strong>
      <span className="muted" style={{ fontSize: 12 }}>{s.commander.id && world.characters[s.commander.id] ? <PersonLink c={world.characters[s.commander.id]!} short /> : s.commander.name} commands · skill {mine ? s.commander.skill.toFixed(1) : '?'}</span>
      <span className="muted" style={{ fontSize: 12 }}>Orders <span className="mono">{pips(s.orders, s.ordersMax)}</span></span>
      <span style={{ fontSize: 12 }}>Morale</span><Bar v={s.morale} label="Morale" />
      <span style={{ fontSize: 12 }}>{th.mass.replace(/^the /, '').replace(/^./, (x) => x.toUpperCase())}</span><Bar v={s.mass} max={s.massMax} label={th.mass} />
      {s.stance ? <span className="tag">{s.stance === 'press' ? 'Pressing' : 'Holding'}</span> : null}
    </div>
  );
  const why = (o: Order) => cannotOrder(b, 0, o);
  const out = over ? outcomes(b) : [];
  return (
    <div className="moment-veil" role="dialog" aria-modal="true" aria-label={b.title}>
      <div className="battle">
        <header>
          <span className="eyebrow"><Term k="battle">{th.label}</Term></span>
          <strong>{b.title}</strong>
          <span className="muted" style={{ fontSize: 12 }}>{th.note} · tick {b.tick}</span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {!over ? <>
              <button type="button" className="btn small" aria-pressed={running} onClick={() => setRunning(!running)}>{running ? '❚❚' : '▶'}</button>
              <button type="button" className="btn small" aria-pressed={speed === 2} onClick={() => setSpeed(speed === 1 ? 2 : 1)}>{speed === 1 ? '›' : '››'}</button>
              <button type="button" className="btn small" onClick={() => game.update((w) => fightItOut(w, id))} title="Your commander fights it out now">Leave it to {us.commander.name}</button>
            </> : <button type="button" className="btn primary small" onClick={onClose}>Close</button>}
          </span>
        </header>
        <Momentum v={b.momentum} />
        <div className="bgrid">
          <div>
            {sideCard(us, true)}
            {b.fighters.filter((f) => f.side === 0).map((f) => <FighterRow key={f.key} b={b} f={f} ours act={act} intel={intel} />)}
          </div>
          <div className="bmid">
            {b.moment ? (
              <div className="bmoment">
                <span className="eyebrow">A moment</span>
                <p style={{ margin: '4px 0 8px' }}>{b.moment.text}</p>
                <div className="actions">
                  {b.moment.options.map((o) => <button key={o.key} type="button" className="btn small option" onClick={() => game.update((w) => answerBattleMoment(w, id, o.key))}><span>{o.label}</span>{o.hint ? <span className="opt-sub">{o.hint}</span> : null}</button>)}
                </div>
              </div>
            ) : null}
            {over ? (
              <div className="bmoment">
                <span className="eyebrow">{b.result!.winner === 0 ? 'Victory' : 'Defeat'}</span>
                <p style={{ margin: '4px 0 8px' }}>{b.result!.text}</p>
                {out.filter((o) => o.side === 0).map((o) => <div key={o.key} className="row" style={{ fontSize: 13 }}><span style={{ flex: 1 }}>{o.name} <span className="muted">· {o.fate}{o.deeds.length ? ` · ${o.deeds.join(', ')}` : ''}</span></span><span className="mono">{o.rating.toFixed(1)}</span></div>)}
              </div>
            ) : null}
            <div className="feed" ref={feedRef}>
              {b.feed.map((l, i) => <div key={i} className={`fline${l.big ? ' big' : ''}${l.side === 0 ? ' us' : l.side === 1 ? ' them' : ''}`}><span className="mono muted">{String(l.t).padStart(2, '0')}</span> {l.text}</div>)}
            </div>
            {!over ? (
              <div className="orders">
                <span className="eyebrow">Orders through {us.commander.name}</span>
                <div className="actions">
                  {([{ kind: 'press' }, { kind: 'hold' }, { kind: 'special' }, { kind: 'duel' }] as Order[]).map((o) => (
                    <button key={o.kind} type="button" className="btn small" disabled={!!why(o)} title={why(o) ?? (o.kind === 'special' ? th.special.note : undefined)} onClick={() => act(o)}>
                      {o.kind === 'press' ? 'Press the attack' : o.kind === 'hold' ? 'Hold and steady' : o.kind === 'special' ? th.special.label : 'Call out their champion'}
                    </button>
                  ))}
                  <button type="button" className="btn small" onClick={() => act({ kind: 'breakoff' })} title="Lose, and save who we can; how cleanly depends on the commander">Break off</button>
                </div>
              </div>
            ) : null}
          </div>
          <div>
            {sideCard(them, false)}
            {b.fighters.filter((f) => f.side === 1).map((f) => <FighterRow key={f.key} b={b} f={f} ours={false} act={act} intel={intel} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
