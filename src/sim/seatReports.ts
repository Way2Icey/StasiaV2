// What each councillor brings back from the work you set them. The task is not a bar filling up somewhere:
// the Grand Master comes in from the yard with who is sharpening and who got hurt, the Speaker comes back from
// the Numarade with where the houses stand, the Steward brings the ledgers and what the harbourmasters say.
// The four great seats report every second Phase; the Physician, the Elder and the Champion every fourth.
import { Rng } from './rng';
import { absoluteCycle, CYCLES_PER_PHASE } from './time';
import { seatHolder, alive } from './query';
import { shortName } from './names';
import { phaseLedger, econ } from './economy';
import { fightScore, isMilitary } from './grounds';
import { regardOf, liveHouses, houseName } from './archon';
import { AIM_LABEL } from './houses';
import { knowledgeOf } from './knowledge';
import { mainPort, harbourmaster, portSectors } from './ports';
import { reportBack } from './briefings';
import { TASKS_BY_ID } from './council';
import type { Character, CouncilSeat, World } from './types';

export const MAIN_SEATS: CouncilSeat[] = ['grandMaster', 'envoy', 'spymaster', 'steward'];
export const SUB_SEATS: CouncilSeat[] = ['physician', 'elder', 'champion'];

type Snap = Record<string, number>;
interface SeatNote { at: number; snap: Snap }

const n = (v: number) => Math.round(v).toLocaleString('en-US');
const sign = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}`;

export function advanceSeatReports(w: World, rng: Rng, phaseTurned: boolean): void {
  if (!phaseTurned) return;
  const P = w.playerHouseId;
  const court = w.courts[P];
  if (!court) return;
  const phase = Math.floor(absoluteCycle(w.date) / CYCLES_PER_PHASE);
  const notes: Record<string, SeatNote> = (w.seatNotes ??= {});
  [...MAIN_SEATS, ...SUB_SEATS].forEach((seat, i) => {
    const every = MAIN_SEATS.includes(seat) ? 2 : 4;
    if ((phase + i) % every) return;
    const c = seatHolder(w, P, seat);
    const a = court.tasks[seat];
    const def = a ? TASKS_BY_ID[a.task] : undefined;
    if (!c || !def) return;
    const prev = notes[seat];
    const { lines, snap } = compose(w, rng, c, def.id, a?.target, prev?.snap);
    notes[seat] = { at: absoluteCycle(w.date), snap };
    if (!lines.length) return;
    // The last report from this seat leaves the queue when the new one arrives.
    if (w.briefings) w.briefings.queue = w.briefings.queue.filter((b) => !(b.kind === 'task' && b.seat === seat));
    reportBack(w, { personId: c.id, seat, ref: `${seat}:${phase}`, title: `${def.label}: the ${prev ? 'last two Phases' : 'work so far'}`, approved: def.label, summary: lines, lines: [], kind: 'task' });
  });
}

function compose(w: World, r: Rng, c: Character, task: string, target: string | undefined, prev?: Snap): { lines: string[]; snap: Snap } {
  const P = w.playerHouseId;
  const C = shortName(c.name);
  const lines: string[] = [];
  const snap: Snap = {};
  const ours = alive(w).filter((x) => x.houseId === P);
  switch (task) {
    case 'drillHost': case 'trainKnights': {
      const men = ours.filter((x) => isMilitary(w, x) && x.tier === 'full');
      for (const m of men) snap[m.id] = fightScore(m);
      const gains = men.map((m) => ({ m, d: prev?.[m.id] !== undefined ? snap[m.id]! - prev[m.id]! : 0 })).sort((a, b) => b.d - a.d);
      const best = [...men].sort((a, b) => snap[b.id]! - snap[a.id]!)[0];
      if (best) lines.push(`${shortName(best.name)} is the sharpest in the yard.`);
      if (gains[0] && gains[0].d > 0.05) lines.push(`${shortName(gains[0].m.name)} has come on the most: ${gains[0].d.toFixed(1)} sharper since my last word.`);
      const slack = gains.filter((g) => g.d <= 0 && prev?.[g.m.id] !== undefined)[0];
      if (slack) lines.push(`${shortName(slack.m.name)} has not improved. ${r.pick(['I am watching it.', 'I think something is on their mind.', 'They need a harder partner.'])}`);
      // The yard is not safe.
      if (men.length && r.chance(0.12)) {
        const hurt = r.pick(men);
        if (!hurt.flags.some((f) => f.id === 'wounded')) { hurt.flags.push({ id: 'wounded', since: w.date, detail: 'hurt in the drill' }); lines.push(`${shortName(hurt.name)} took a bad fall in the yard and is with the Physician.`); }
      }
      lines.push(`${men.length} at drill.`);
      break;
    }
    case 'patrol': case 'keepOrder': {
      const sectors = Object.values(w.planets).filter((p) => p.houseId === P).flatMap((p) => p.sectors).filter((s) => s.controllerFamilyId);
      for (const s of sectors) snap[s.id] = s.unrest;
      const worst = [...sectors].sort((a, b) => b.unrest - a.unrest)[0];
      const settled = sectors.map((s) => ({ s, d: prev?.[s.id] !== undefined ? s.unrest - prev[s.id]! : 0 })).sort((a, b) => a.d - b.d)[0];
      if (worst) lines.push(`${worst.name} is the most restless: unrest ${worst.unrest}.`);
      if (settled && settled.d < 0) lines.push(`${settled.s.name} has quietened: ${sign(settled.d)} since my last word.`);
      const avg = sectors.length ? sectors.reduce((t, s) => t + s.unrest, 0) / sectors.length : 0;
      lines.push(`Across our sectors, unrest stands at ${Math.round(avg)} on average.`);
      if (task === 'keepOrder') ledger(w, lines, snap, prev);
      break;
    }
    case 'develop': case 'audit': ledger(w, lines, snap, prev); break;
    case 'attendNumerade': case 'courtHouse': {
      const fav = w.realm?.favour ?? {};
      const ranked = Object.entries(fav).sort((a, b) => b[1] - a[1]);
      const pos = ranked.findIndex(([h]) => h === P) + 1;
      if (ranked.length) lines.push(`The Numarade favours House ${houseName(w, ranked[0]![0])} most. We stand ${pos ? `${pos} of ${ranked.length}` : 'nowhere'}, at ${Math.round(fav[P] ?? 0)}.`);
      const rel = liveHouses(w).filter((h) => h.id !== P).map((h) => ({ h, v: regardOf(w, h.id, P) }));
      for (const x of rel) snap[x.h.id] = x.v;
      const warm = [...rel].sort((a, b) => b.v - a.v)[0];
      const cold = [...rel].sort((a, b) => a.v - b.v)[0];
      if (warm) lines.push(`House ${warm.h.name} speaks well of us (${sign(warm.v)}). House ${cold!.h.name} does not (${sign(cold!.v)}).`);
      const moved = rel.map((x) => ({ ...x, d: prev?.[x.h.id] !== undefined ? x.v - prev[x.h.id]! : 0 })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d))[0];
      if (moved && Math.abs(moved.d) >= 3) lines.push(`The biggest change: House ${moved.h.name}, ${sign(moved.d)} toward us.`);
      // What the benches are saying.
      const aims = Object.entries(w.realm?.aims ?? {}).filter(([h, a]) => h !== P && a && !a.known);
      if (aims.length && r.chance(0.3 + c.stats.insight / 60)) { const [h, a] = r.pick(aims); a!.known = true; lines.push(`On the benches they say House ${houseName(w, h)} is after ${AIM_LABEL[a!.kind].toLowerCase()}${a!.target ? `, at ${a!.target === P ? 'us' : `House ${houseName(w, a!.target)}`}` : ''}.`); }
      if (task === 'courtHouse' && target) lines.push(`House ${houseName(w, target)} now regards us at ${sign(regardOf(w, target, P))}.`);
      break;
    }
    case 'whispers': {
      const them = target ? alive(w).filter((x) => x.houseId === target && x.seat) : [];
      for (const x of them) snap[x.id] = knowledgeOf(w, P, x.id).depth;
      const grew = them.map((x) => ({ x, d: prev?.[x.id] !== undefined ? snap[x.id]! - prev[x.id]! : 0 })).sort((a, b) => b.d - a.d)[0];
      if (target) lines.push(`Our ears at House ${houseName(w, target)}'s doors: we know ${them.length} of their council, on average ${Math.round(them.reduce((t, x) => t + snap[x.id]!, 0) / Math.max(1, them.length))} deep.`);
      if (grew && grew.d > 0) lines.push(`Most learned of ${shortName(grew.x.name)}: ${sign(grew.d)}.`);
      break;
    }
    case 'watchHouse': {
      const glum = ours.filter((x) => x.tier === 'full' && (x.mood ?? 50) < 30).slice(0, 3);
      if (glum.length) lines.push(`Unhappy: ${glum.map((x) => shortName(x.name)).join(', ')}. Worth a word.`);
      const sly = ours.find((x) => x.flags.some((f) => f.id === 'secretLoyalty' && !(f.knownBy ?? []).includes(P)));
      if (sly && r.chance(0.25 + c.stats.insight / 50)) { const f = sly.flags.find((x) => x.id === 'secretLoyalty')!; (f.knownBy ??= []).push(P); lines.push(`${shortName(sly.name)} is not what they seem: ${f.detail ?? 'their loyalty lies elsewhere'}.`); }
      if (!lines.length) lines.push('Nothing amiss in the house. That is what worries me.');
      break;
    }
    case 'tendHousehold': case 'tendCommons': {
      const hurt = ours.filter((x) => x.flags.some((f) => f.id === 'wounded' || f.id === 'ill'));
      lines.push(hurt.length ? `Under my care: ${hurt.slice(0, 4).map((x) => shortName(x.name)).join(', ')}${hurt.length > 4 ? ` and ${hurt.length - 4} more` : ''}.` : 'No one of the household is under my care.');
      if (task === 'tendCommons') lines.push(r.pick(['The clinics are full every day.', 'The commons are grateful, and they say so.', 'We are short of medicine in the lower sectors.']));
      break;
    }
    case 'keepRecords': case 'teachYoung': {
      const young = ours.filter((x) => x.role === 'Youngling' || x.role === 'Ward');
      for (const y of young) snap[y.id] = y.stats.intellect + y.stats.eloquence;
      const up = young.map((y) => ({ y, d: prev?.[y.id] !== undefined ? snap[y.id]! - prev[y.id]! : 0 })).sort((a, b) => b.d - a.d)[0];
      if (task === 'teachYoung') lines.push(young.length ? `${young.length} at their lessons.${up && up.d > 0 ? ` ${shortName(up.y.name)} is coming on fastest.` : ''}` : 'No young of the house to teach.');
      else lines.push(`The house's word stands at ${w.houses[P]!.standing.honour} in honour. ${r.pick(['The old records are in order.', 'I have copied out the founding oaths again.', 'There are gaps in the records from the Silence. There always will be.'])}`);
      break;
    }
    case 'pits': lines.push(`${C} has been fighting for our name. ${r.pick(['The crowd knows our colours now.', 'A hard few bouts.', 'Some wins, a split lip.'])}`); break;
  }
  return { lines, snap };
}

/** The ledgers, and what the harbourmasters have to say. */
function ledger(w: World, lines: string[], snap: Snap, prev?: Snap) {
  const P = w.playerHouseId;
  const L = phaseLedger(w, P).filter((l) => l.resource === 'othes');
  const inc = L.filter((l) => l.amount > 0).sort((a, b) => b.amount - a.amount);
  const out = L.filter((l) => l.amount < 0).sort((a, b) => a.amount - b.amount);
  const net = L.reduce((t, l) => t + l.amount, 0);
  snap.othes = econ(w, P).stock.othes;
  lines.push(`The books: ${n(snap.othes)} othes in the vault${prev?.othes !== undefined ? `, ${sign(snap.othes - prev.othes)} since my last word` : ''}. Each Phase we take ${n(inc.reduce((t, l) => t + l.amount, 0))} and spend ${n(-out.reduce((t, l) => t + l.amount, 0))}: ${net >= 0 ? 'ahead' : 'behind'} by ${n(Math.abs(net))}.`);
  if (inc[0]) lines.push(`Most of it comes from ${inc[0].label.toLowerCase()} (${n(inc[0].amount)}). The heaviest cost is ${out[0]?.label.toLowerCase() ?? 'nothing much'}${out[0] ? ` (${n(-out[0].amount)})` : ''}.`);
  const port = mainPort(w);
  const hm = port ? harbourmaster(w, port.id) : undefined;
  if (port) lines.push(`From ${port.name}${hm ? `, ${shortName(hm.name)} the harbourmaster` : ''}: ${portSectors(w).length} ports under our seal. ${['Traffic is steady.', 'Customs are up; the smugglers are quiet.', 'Fewer ships this Phase. The lanes are restless.'][Math.floor(snap.othes) % 3]}`);
}
