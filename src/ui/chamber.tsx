// The Numarade's chamber: the seats in a half-circle, each coloured by how it will vote on the motion on the
// floor (or, with nothing on the floor, by how it regards us). We watch from the gallery until we hold a seat.
import { useWorld } from './context';
import { Go, Panel } from './links';
import { regardOf, houseName } from '../sim/archon';
import { ordinal } from '../sim/rankings';
import { tableOf } from './rankings';
import { useNav } from './context';

export function Chamber({ className }: { className?: string }) {
  const world = useWorld();
  const nav = useNav();
  const a = world.archon;
  if (!a) return null;
  const n = a.numarade;
  const P = world.playerHouseId;
  const ex = n.exarchon?.houseId;
  const seats = n.seats.filter((s) => s !== ex);
  const motion = n.motions.find((m) => m.status === 'open' && m.kind !== 'elect');
  const us = tableOf(world).find((r) => r.id === P);
  const seated = n.seats.includes(P);
  const count = { aye: 0, nay: 0, unsure: 0 };
  const seatOf = (s: string, i: number, total: number) => {
    const ang = Math.PI - (i + 0.5) * (Math.PI / total);
    const x = 50 + 42 * Math.cos(ang), y = 88 - 76 * Math.sin(ang);
    const v = motion ? motion.votes[s] : undefined;
    const kind = motion ? (v === 'aye' ? 'aye' : v === 'nay' ? 'nay' : 'unsure') : undefined;
    if (kind) count[kind]++;
    const r = s === P ? 0 : regardOf(world, s, P);
    const tone = kind === 'aye' ? 'var(--green)' : kind === 'nay' ? 'var(--orange)' : kind === 'unsure' ? 'var(--line)' : r >= 15 ? 'var(--green)' : r <= -15 ? 'var(--orange)' : 'var(--line)';
    return (
      <button key={s} type="button" className={`seat${s === P ? ' ours' : ''}${kind === 'unsure' ? ' unsure' : ''}`} style={{ left: `${x}%`, top: `${y}%`, borderColor: tone }} onClick={() => { if (s !== P) nav.to({ kind: 'house', id: s }); }} title={houseName(world, s)}>
        <strong>{houseName(world, s)}</strong>
        <span style={{ color: tone }}>{kind ?? (s === P ? 'us' : `${r > 0 ? '+' : ''}${r}`)}</span>
      </button>
    );
  };
  const seatEls = seats.map((s, i) => seatOf(s, i, seats.length));
  return (
    <Panel title="The chamber" aside={motion ? 'coloured by their vote' : 'coloured by how they regard us'} className={className}>
      <div className="chamber">
        {seatEls}
        {ex ? <button type="button" className="seat ex" style={{ left: '50%', top: '36%' }} onClick={() => { if (ex !== P) nav.to({ kind: 'house', id: ex }); }}><strong className="gold">EXARCHON</strong><span>{houseName(world, ex)}</span></button> : null}
        <div className="chamber-floor">
          <span className="eyebrow gold">On the floor</span>
          {motion ? <>
            <strong>{motion.title}</strong>
            <span className="muted" style={{ fontSize: 11 }}>moved by {houseName(world, motion.by)} · needs {motion.needed === 'super' ? 'eight seats' : 'a majority'}</span>
            <span><span className="up">{count.aye} aye</span> · <span className="down">{count.nay} nay</span> · {count.unsure} unsure</span>
          </> : <span className="muted">Nothing before the chamber.</span>}
        </div>
        <div className="chamber-gallery">
          <span className="eyebrow">{seated ? 'Our seat' : 'The gallery'}</span>
          <span className="gold">House {houseName(world, P)} · {seated ? 'seated' : 'no seat'}{us ? ` · ${ordinal(us.place)} of the Archon` : ''}</span>
          {!seated ? <span className="muted">Seats go to the most esteemed Minor Houses when one falls empty.</span> : null}
          <Go to={{ kind: 'rankings' }}>The table ›</Go>
        </div>
      </div>
    </Panel>
  );
}
