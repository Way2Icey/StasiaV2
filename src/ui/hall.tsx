// The Hall: the home screen in the terminal look. A drawing of the throne room
// that follows the house's state, the council as a table, and the Desk, where
// everything waiting on the Highroy lands.
import { musterByCouncil } from '../sim/crucible';
import { econ } from '../sim/economy';
import { Peek } from './links';
import { readyForCommand } from '../sim/missions';
import { answerBlooding, LOCAL_COST, readinessText } from '../sim/ladder';
import { councilViews, tally as tallyViews } from '../sim/views';
import { approvePetition, dismissPetition, petitionPlan } from '../sim/council';
import { fineShip, harbourmaster, jailCaptain, releaseShip } from '../sim/ports';
import { MISSION_LABEL } from '../sim/missions';
import { petitionTarget } from './council';
import { lettersFor, noteOn, REPORTER_LABEL, REPORTER_REACH, reporterOf, REPORTERS, type Reporter } from '../sim/reports';
import { seasonLine, titlesOf, totals } from '../sim/careers';
import { answerChallenge } from '../sim/grounds';
import { bestFor, cannotEnter, declineCircuit, enterCircuit } from '../sim/circuit';
import { answerIntake, answerPupilOffer, cannotTakeIntake } from '../sim/training';
import { answerAsk } from '../sim/loans';
import { dismissLead, recruit } from '../sim/discovery';
import { ageOf } from '../sim/characters';
import { useState, type ReactNode } from 'react';
import { useGame, useInspect, useNav, useWorld } from './context';
import { AudienceCard } from './ambitions';
import { AMBITION_LABEL } from '../sim/ambitions';
import { CLOSES, currentRound } from '../sim/crucible';
import { classify } from '../sim/records';
import { Panel, PersonById, PersonLink } from './links';
import { Term } from './tip';
import { Decision } from './events';
import { councilOf, SEAT_TITLE } from '../sim/world';
import { findSector, ruler, seatHolder } from '../sim/query';
import { isAway } from '../sim/court';
import { activeMissionOf } from '../sim/missions';
import { moodLabel, moodOf } from '../sim/mood';
import { TASKS_BY_ID, OATHS_BY_ID, oathProgress } from '../sim/council';
import { leadsOf } from '../sim/discovery';
import { absoluteCycle, type GameDate } from '../sim/time';
import { eventDef, titleFor, type PendingEvent } from '../sim/events';
import { displayName } from '../sim/names';
import { answerCrew, answerOffer } from '../sim/lanes';
import { answerSmuggledCaige, answerSmuggler, notesFor, smuggledCaiges, SMUGGLE_LABEL } from '../sim/smuggling';
import { idleVeterans, letRest, postsFor } from '../sim/veterans';
import { answerAlliance } from '../sim/houses';
import type { FeedEntry, World } from '../sim/types';

/** Cycles from now, as the terminal shows them: "C+4". */
function inCycles(world: World, d: GameDate): string {
  const n = absoluteCycle(d) - absoluteCycle(world.date);
  return n <= 0 ? 'now' : `${n}cy`;
}

export function blocks(value: number, of = 5, max = 100): string {
  const n = Math.max(0, Math.min(of, Math.round((value / max) * of)));
  return '■'.repeat(n) + '□'.repeat(of - n);
}

export function bar(fraction: number, width = 10): string {
  const n = Math.max(0, Math.min(width, Math.round(fraction * width)));
  return '[' + '█'.repeat(n) + '░'.repeat(width - n) + ']';
}

// ---------------------------------------------------------------- the drawing

const W = 82;

/** The throne room, redrawn from the world: who sits the throne, who stands guard. */
export function hallArt(world: World): string {
  const P = world.playerHouseId;
  const g: string[][] = Array.from({ length: 26 }, () => Array<string>(W).fill(' '));
  const put = (r: number, c: number, s: string) => {
    [...s].forEach((ch, i) => { if (g[r] && c + i >= 0 && c + i < W) g[r]![c + i] = ch; });
  };
  const C = 41;
  put(0, 0, '▄'.repeat(W));
  for (let c = 0; c < W; c += 2) put(1, c, '▀');
  for (const pc of [1, W - 8]) {
    put(2, pc, '▄█▀▀▀█▄'); put(3, pc, ' ╔═══╗ ');
    for (let r = 4; r < 18; r++) put(r, pc, ' ║▓▒░║ ');
    put(18, pc, '▄╩═══╩▄'); put(19, pc, '███████');
  }
  const win = [
    '         .-~~~~~~~~~~~-.         ',
    "     .-~'   *   ║    .   '~-.     ",
    "   .'  .        ║      *     '.   ",
    '  /      +   .-~║~-.     .     \\  ',
    ' |   *     ./░░░║▒▒▒\\.  ═══     | ',
    ' |  .  ════|░░░▒║▒▓▓▓|═══   *   | ',
    " |       ═ '\\░░░║▒▓▓/'      .   | ",
    " |  .       '-.▒║▒.-'   *       | ",
    ' |     *     . ║   .        .   | ',
    ' |═════════════╬════════════════| ',
  ];
  win.forEach((s, i) => put(1 + i, C - Math.floor(s.length / 2), s));
  for (const bc of [12, W - 19]) {
    put(3, bc, '═╤═════╤═');
    [' │▓▓▓▓▓│', ' │▓▓◆▓▓│', ' │▓◆◆◆▓│', ' │▓▓◆▓▓│', ' │▓▓▓▓▓│', ' │▓▓▓▓▓│', '  \\▓▓▓/', '   \\▓/ ', '    V  ']
      .forEach((s, i) => put(4 + i, bc, s));
  }
  const lord = ruler(world, P);
  const seated = lord && !isAway(world, lord.id);
  const throne = [
    '      _▲_      ',
    '    _/ ◆ \\_    ',
    '   │ ║   ║ │   ',
    seated ? '   │ ║(◉)║ │   ' : '   │ ║   ║ │   ',
    seated ? '   │═║/█\\║═│   ' : '   │═║   ║═│   ',
    seated ? '   │_║_█_║_│   ' : '   │_║___║_│   ',
    ' ▄▄█▄▄▄▄▄▄▄█▄▄ ',
    '▐█████████████▌',
  ];
  throne.forEach((s, i) => put(11 + i, C - 7, s));
  put(19, C - 10, '▄'.repeat(21));
  put(20, C - 12, '▀'.repeat(25));
  // Knights at home stand guard; with none, the hall is unguarded.
  const knightsHome = Object.values(world.characters).filter((c) => c.alive && c.houseId === P && c.role === 'Knight' && !isAway(world, c.id)).length;
  const guardL = ['  ▲ ', '  │ ', '(o)│', '/█\\│', ' █ │', '/ \\│'];
  const guardR = [' ▲  ', ' │  ', '│(o)', '│/█\\', '│ █ ', '│/ \\'];
  if (knightsHome >= 1) guardL.forEach((s, i) => put(13 + i, C - 17, s));
  if (knightsHome >= 2) guardR.forEach((s, i) => put(13 + i, C + 13, s));
  const braz = ['  )  ', ' ( ) ', '\\▒▒▒/', ' ╲_╱ ', ' _║_ '];
  braz.forEach((s, i) => { put(14 + i, C - 29, s); put(14 + i, C + 24, s); });
  for (let r = 21; r < 26; r++) {
    const k = r - 20;
    for (let c = 0; c < W; c++) g[r]![c] = (c + r) % 4 === 0 ? '·' : ' ';
    const l = C - 8 - k * 3, rr = C + 8 + k * 3;
    for (let c = l; c <= rr; c++) if (c >= 0 && c < W) g[r]![c] = '▒';
    if (l >= 0) g[r]![l] = '/';
    if (rr < W) g[r]![rr] = '\\';
    if (l + 2 >= 0) g[r]![l + 2] = '░';
    if (rr - 2 < W) g[r]![rr - 2] = '░';
  }
  return g.map((row) => row.join('').replace(/\s+$/, '')).join('\n');
}

export function HallPanel({ className }: { className?: string }) {
  const world = useWorld();
  const P = world.playerHouseId;
  const lord = ruler(world, P);
  const court = world.courts[P];
  const prog = oathProgress(world, P);
  const oath = court?.oath ? OATHS_BY_ID[court.oath.id] : undefined;
  return (
    <Panel title="The Hall" aside={`House ${world.houses[P]!.name}`} className={`major ${className ?? ''}`}>
      <div className="body">
        <pre className="ascii" aria-label="The throne room">{hallArt(world)}</pre>
        <p className="hall-caption">
          {lord ? <><PersonLink c={lord} /> {isAway(world, lord.id) ? 'is away; the throne stands empty.' : 'holds the throne.'}</> : 'The throne is empty.'}{' '}
          {oath && prog && court?.oath ? <>Oath sworn: <Term k="oath">{oath.label.toUpperCase()}</Term> {bar(prog.fraction)} {Math.round(prog.fraction * 100)}%, {inCycles(world, court.oath.ends)} left.</> : 'No oath sworn.'}
        </p>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------- the council

export function CouncilTable({ className }: { className?: string }) {
  const world = useWorld();
  const P = world.playerHouseId;
  const council = councilOf(world, P);
  const court = world.courts[P];
  const away = council.filter((c) => isAway(world, c.id)).length;
  return (
    <Panel title={<Term k="council">The council</Term>} aside={`${council.length - away} home · ${away} away`} className={className}>
      <div className="table-wrap">
        <table className="ctable council-t">
          <thead><tr><th>SEAT</th><th>NAME</th><th>WHERE</th><th>TASK</th><th>MOOD</th></tr></thead>
          <tbody>
            {council.map((c) => {
              const m = activeMissionOf(world, c.id);
              const out = isAway(world, c.id);
              const task = c.seat && court?.tasks[c.seat] ? TASKS_BY_ID[court.tasks[c.seat]!.task]?.label : c.seat === 'highroy' ? 'rules' : '—';
              const mood = moodOf(c);
              return (
                <tr key={c.id} className={out ? 'away' : undefined}>
                  <td>{SEAT_TITLE[c.seat!].toUpperCase()}</td>
                  <td><PersonLink c={c} /></td>
                  <td>{out ? (m ? `AWAY ▸ ${inCycles(world, m.stageEnds)}` : 'AWAY') : 'home'}</td>
                  <td>{out && m ? 'on mission' : (task ?? '—').toLowerCase()}</td>
                  <td><span className="mood-blocks" title={moodLabel(mood)} aria-label={`Mood: ${moodLabel(mood)}`}>{blocks(mood)}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------- the desk

interface DeskAct { label: string; run: (w: World) => World; primary?: boolean; title?: string; disabled?: boolean   /** Instead of acting here, go where it is done. */
  go?: () => void;
}
interface DeskItem {
  id: string;
  mark: string;
  kind: string;
  text: ReactNode;
  when?: string;
  quiet?: boolean;
  open: () => void;
  /** Done right here, without leaving the Hall. */
  acts?: DeskAct[];
  /** More to read, opened in place under the row. */
  detail?: ReactNode;
}

type DeskTab = 'needs' | 'chances' | 'news';
const NEEDS = new Set(['SMUGGLER', 'SMUGGLED', 'CREW', 'BLOODING', 'DECISION', 'AUDIENCE', 'PETITION', 'RAID', 'RANSOM', 'LOAN', 'DEFAULT', 'CAIGE', 'CRUCIBLE', 'CHALLENGE', 'INTAKE', 'PUPIL', 'INVITATION', 'WARD']);
const tabOf = (k: string): DeskTab => (NEEDS.has(k) ? 'needs' : k === 'NEWS' ? 'news' : 'chances');

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function Desk({ className }: { className?: string }) {
  const world = useWorld();
  const game = useGame();
  const nav = useNav();
  const ins = useInspect();
  const P = world.playerHouseId;
  const [open, setOpen] = useState<string | null>(null);
  const [tabPick, setTabPick] = useState<DeskTab | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const items: DeskItem[] = [];
  for (const p of [...(world.events?.pending ?? [])].reverse()) {
    const m = p.missionId ? world.missions[p.missionId] : undefined;
    const lead = m ? world.characters[m.leaderId] : undefined;
    items.push({
      id: p.id, mark: '[!]', kind: 'DECISION',
      text: <>{titleOf(p)}{lead ? ` — from ${lead.name.given}` : ''}</>,
      when: inCycles(world, p.expires),
      open: () => setOpen((o) => (o === p.id ? null : p.id)),
    });
  }
  const cr = world.crucible;
  if (cr?.stage === 'drawn' && cr.entrants.includes(P) && !cr.contingents[P]) items.push({ id: 'crucible-open', mark: '[⚔]', kind: 'CRUCIBLE', text: <>We are drawn for the Crucible: raise our contingent</>, when: `by Orbit ${CLOSES}`, open: () => nav.to({ kind: 'crucible' }), acts: [{ label: 'Muster ›', primary: true, run: (w) => w, go: () => nav.to({ kind: 'crucible' }) }, { label: 'Leave it to the council', title: 'They choose the Marshal, champion and knights, and pay for them', run: (w) => musterByCouncil(w) }] });
  const round = cr?.stage === 'campaign' && cr.contingents[P] && !cr.contingents[P]!.out ? currentRound(world) : undefined;
  if (round && !round.stance[P]) items.push({ id: `cs-${round.orbit}`, mark: '[⚔]', kind: 'CRUCIBLE', text: <>Orbit {round.orbit} on the battle world: choose the Marshal's stance</>, when: `Orbit ${round.orbit}`, open: () => nav.to({ kind: 'crucible' }), acts: [{ label: 'Choose ›', primary: true, run: (w) => w, go: () => nav.to({ kind: 'crucible' }) }] });
  for (const au of world.ambitions?.audiences ?? []) {
    const c = world.characters[au.characterId];
    items.push({ id: au.id, mark: '[»]', kind: 'AUDIENCE', text: <>{c ? displayName(c.name) : 'Someone'} · {AMBITION_LABEL[au.kind].toLowerCase()}</>, when: inCycles(world, au.expires), open: () => setOpen((o) => (o === au.id ? null : au.id)) });
  }
  for (const r of world.ports?.raids ?? []) {
    if (r.status !== 'revealed' || r.answer) continue;
    const s = findSector(world, r.sectorId)?.sector;
    items.push({ id: r.id, mark: '[⚠]', kind: 'RAID', text: <>Corsairs bound for {s?.name}</>, when: inCycles(world, r.arrives), open: () => nav.to({ kind: 'port', id: r.sectorId }) });
  }
  for (const n of notesFor(world)) {
    const c = world.characters[n.by];
    items.push({ id: n.id, mark: '[!]', kind: 'SMUGGLER', text: <>{c ? displayName(c.name) : 'Someone of ours'} is running {SMUGGLE_LABEL[n.goods]}</>, when: inCycles(world, n.until),
      open: () => setOpen((o) => (o === n.id ? null : n.id)),
      detail: <span className="muted" style={{ fontSize: 12 }}>The Spymaster heard first. They {n.why}. Stop it and they resent us; look away for a quarter and it is on us too if it comes out; expose them and the house keeps its name.</span>,
      acts: [{ label: 'Stop it', primary: true, run: (w) => answerSmuggler(w, n.id, 'stop') }, { label: 'Look away for a cut', run: (w) => answerSmuggler(w, n.id, 'cut') }, { label: 'Expose them', run: (w) => answerSmuggler(w, n.id, 'expose') }] });
  }
  for (const sc of smuggledCaiges(world)) {
    const c = world.characters[sc.holder];
    const cg = world.armoury[sc.caigeId];
    items.push({ id: `sc-${sc.caigeId}`, mark: '[◈]', kind: 'SMUGGLED', text: <>{c ? displayName(c.name) : 'Someone'} carries a smuggled Caige{cg ? `, ${cg.name}` : ''}</>, when: '', open: () => nav.to({ kind: 'character', id: sc.holder }),
      acts: [{ label: 'Take it for the armoury', primary: true, run: (w) => answerSmuggledCaige(w, sc.caigeId, false) }, { label: 'Let them keep it', run: (w) => answerSmuggledCaige(w, sc.caigeId, true) }] });
  }
  for (const c of idleVeterans(world)) {
    const posts = postsFor(world, c);
    items.push({ id: `vet-${c.id}`, mark: '[◇]', kind: 'VETERAN', text: <>{displayName(c.name)} has hung up the blade · where should they serve?</>, when: '',
      open: () => setOpen((o) => (o === `vet-${c.id}` ? null : `vet-${c.id}`)),
      detail: <span className="muted" style={{ fontSize: 12 }}>The Grand Master's thought: {posts[0] ? `${posts[0].label.toLowerCase()} (${posts[0].why.toLowerCase()})` : 'let them rest; there is no post that needs them'}.</span>,
      acts: [...posts.slice(0, 2).map((p, i) => ({ label: p.label, primary: i === 0, run: p.run })), { label: 'Let them rest', run: (w) => letRest(w, c.id) }] });
  }
  for (const o of world.realm?.offers ?? []) {
    items.push({ id: o.id, mark: '[∞]', kind: 'ALLIANCE', text: <>House {world.houses[o.from]?.name} offers an alliance</>, when: inCycles(world, o.expires), open: () => nav.to({ kind: 'house', id: o.from }),
      acts: [{ label: 'Accept', primary: true, run: (w) => answerAlliance(w, o.id, true) }, { label: 'Decline', run: (w) => answerAlliance(w, o.id, false) }] });
  }
  for (const h of (world.lanes?.held ?? []).filter((x) => x.owner === P)) {
    const f = world.lanes.factions[h.faction];
    items.push({ id: h.id, mark: '[$]', kind: 'CREW', text: <>{f ? f.name[0]!.toUpperCase() + f.name.slice(1) : 'Corsairs'} hold the {h.crew} crew of {h.what} · {h.ransom.toLocaleString('en-US')}</>, when: inCycles(world, h.expires),
      open: () => setOpen((o) => (o === h.id ? null : h.id)),
      detail: <span className="muted" style={{ fontSize: 12 }}>Sent up through the Steward. Pay, and they come home and the company thinks better of us. Refuse, and they are sold to the deep mines. <button type="button" className="linklike" onClick={() => nav.to({ kind: 'lanes' })}>The lanes ›</button></span>,
      acts: [{ label: `Pay · ${h.ransom.toLocaleString('en-US')}`, primary: true, disabled: econ(world, P).stock.othes < h.ransom, title: econ(world, P).stock.othes < h.ransom ? `We have ${Math.floor(econ(world, P).stock.othes).toLocaleString('en-US')} othes` : undefined, run: (w) => answerCrew(w, h.id, true) }, { label: 'Refuse', run: (w) => answerCrew(w, h.id, false) }] });
  }
  for (const o of world.lanes?.offers ?? []) {
    items.push({ id: o.id, mark: '[$]', kind: 'COMPACT', text: <>House {world.houses[o.from]?.name} offers a trade compact</>, when: inCycles(world, o.expires), open: () => nav.to({ kind: 'lanes' }),
      acts: [{ label: 'Accept', primary: true, title: 'Each side buys the other\'s spare goods first, at the Exchange price without its cut', run: (w) => answerOffer(w, o.id, true) }, { label: 'Decline', run: (w) => answerOffer(w, o.id, false) }] });
  }
  for (const s of Object.values(world.ports?.ships ?? {})) {
    if (s.status === 'held') {
      const hm = harbourmaster(world, s.sectorId);
      const found = s.cargo.filter((c) => c.found && c.hidden).map((c) => c.label);
      items.push({ id: s.id, mark: '[⚓]', kind: 'HELD', text: <>{hm ? `${hm.name.given}, harbourmaster: ` : 'Customs: '}we hold the {s.name} at {findSector(world, s.sectorId)?.sector.name}</>, open: () => setOpen((o) => (o === s.id ? null : s.id)),
        detail: <span className="muted" style={{ fontSize: 12 }}>Sent up through the Steward. {found.length ? `Found aboard: ${found.join(', ')}.` : 'Papers out of order.'} Fine them and let them go, release them, or jail the captain. <Peek t={{ k: 'portShip', id: s.id }}>The ship ›</Peek></span>,
        acts: [{ label: 'Fine', primary: true, run: (w) => fineShip(w, s.id) }, { label: 'Release', run: (w) => releaseShip(w, s.id) }, { label: 'Jail captain', run: (w) => jailCaptain(w, s.id) }] });
    }
    else if (s.status === 'docked' && s.aboard.some((a) => a.characterId && world.ports.watch.includes(a.characterId))) {
      const a = s.aboard.find((x) => x.characterId && world.ports.watch.includes(x.characterId))!;
      items.push({ id: `w-${s.id}`, mark: '[●]', kind: 'WATCH', text: <>{a.name} docked · {s.name}</>, open: () => ins.open({ k: 'portShip', id: s.id }) });
    }
  }
  for (const pet of world.courts[P]?.petitions ?? []) {
    const from = world.characters[pet.fromId];
    const plan = petitionPlan(world, pet);
    items.push({ id: pet.id, mark: '[?]', kind: 'PETITION', text: <>{from ? `${from.name.given}${from.seat ? `, ${SEAT_TITLE[from.seat]}` : ''}` : 'A councillor'}: {MISSION_LABEL[pet.kind].toLowerCase()} · {petitionTarget(world, pet)}</>, when: inCycles(world, pet.expires),
      open: () => setOpen((o) => (o === pet.id ? null : pet.id)),
      detail: <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span className="quote">“{pet.reason}”</span><span className="muted" style={{ fontSize: 12 }}>Their plan: {plan.text}</span></span>,
      acts: [
        { label: 'Approve', primary: true, title: plan.text, run: (w) => approvePetition(w, P, pet.id) },
        { label: 'Plan my own', run: (w) => { nav.to({ kind: 'plan', mission: pet.kind, target: pet.targetId ?? pet.targetHouseId ?? pet.targetPlanetId, leader: pet.leaderId, petition: pet.id }); return w; } },
        { label: 'Deny', run: (w) => dismissPetition(w, P, pet.id) },
      ] });
  }
  for (const cap of Object.values(world.captives)) {
    const c = world.characters[cap.characterId];
    if (cap.ransom?.status !== 'open' || c?.houseId !== P) continue;
    items.push({ id: `r-${c.id}`, mark: '[$]', kind: 'RANSOM', text: <>{world.houses[cap.heldBy]?.name} holds {c.name.given} · {cap.ransom.amount.toLocaleString('en-US')}</>, when: inCycles(world, cap.ransom.expires), open: () => scrollTo('ransoms') });
  }
  for (const a of (world.loans?.asks ?? []).filter((x) => x.to === P)) {
    items.push({ id: a.id, mark: '[$]', kind: 'LOAN', text: <>{world.houses[a.from]?.name} asks to borrow {a.amount.toLocaleString('en-US')}</>, when: inCycles(world, a.expires), open: () => nav.to({ kind: 'loans' }), acts: [{ label: 'Lend', primary: true, disabled: econ(world, P).stock.othes < a.amount, title: econ(world, P).stock.othes < a.amount ? `We have ${Math.floor(econ(world, P).stock.othes).toLocaleString('en-US')} othes` : undefined, run: (w) => answerAsk(w, a.id, true) }, { label: 'Refuse', run: (w) => answerAsk(w, a.id, false) }] });
  }
  for (const l of Object.values(world.loans?.loans ?? {}).filter((x) => x.lender === P && x.overdue)) {
    items.push({ id: `d-${l.id}`, mark: '[$]', kind: 'DEFAULT', text: <>{world.houses[l.borrower]?.name} has not paid · {l.owed.toLocaleString('en-US')}</>, open: () => nav.to({ kind: 'loans' }) });
  }
  for (const c of Object.values(world.armoury ?? {}).filter((x) => x.houseId === P && x.vaultId && !x.bondedTo && (x.stability ?? 100) < 40)) {
    items.push({ id: `cg-${c.id}`, mark: '[~]', kind: 'CAIGE', text: <>{c.name} is {Math.round(c.stability ?? 0) < 15 ? 'failing' : 'unstable'} in the vault</>, open: () => nav.to({ kind: 'holdings', id: c.vaultId }) });
  }
  for (const o of (world.training?.offers ?? []).filter((x) => x.to === P)) {
    items.push({ id: o.id, mark: '[w]', kind: 'WARD', text: <>{world.houses[o.from]?.name} offers {world.characters[o.wardId]?.name.given} as a ward</>, when: inCycles(world, o.expires), open: () => nav.to({ kind: 'people', view: 'young' }) });
  }
  for (const i of world.training?.intake ?? []) {
    const c = world.characters[i.studentId];
    if (c) {
      const why = cannotTakeIntake(world, i.id) ?? undefined;
      items.push({ id: i.id, mark: '[a]', kind: 'INTAKE', text: <>The academy brings forward {displayName(c.name)}, {Math.floor(ageOf(c, world.date))}</>, when: inCycles(world, i.expires), open: () => nav.to({ kind: 'training' }), acts: [
        { label: 'Educate', primary: true, disabled: !!why, title: why, run: (w) => answerIntake(w, i.id, 'educate') },
        { label: 'Train', primary: true, disabled: !!why, title: why, run: (w) => answerIntake(w, i.id, 'train') },
        { label: 'Home', run: (w) => answerIntake(w, i.id, 'home') },
      ] });
    }
  }
  for (const o of world.training?.pupilOffers ?? []) {
    const c = world.characters[o.pupilId];
    const m = world.missions[o.missionId];
    if (c && m) items.push({ id: o.id, mark: '[a]', kind: 'PUPIL', text: <>{world.characters[o.headId]?.name.given ?? 'The academy'} asks that {c.name.given} go with {world.characters[m.leaderId]?.name.given}</>, open: () => nav.to({ kind: 'mission', id: m.id }), acts: [{ label: 'Send', primary: true, run: (w) => answerPupilOffer(w, o.id, true) }, { label: 'No', run: (w) => answerPupilOffer(w, o.id, false) }] });
  }
  for (const c of world.grounds?.challenges ?? []) {
    const a = world.characters[c.challenger];
    const b = world.characters[c.challenged];
    if (a && b) items.push({ id: c.id, mark: '[!]', kind: 'CHALLENGE', text: <>{a.name.given} has challenged {b.name.given} over {c.cause}</>, when: inCycles(world, c.expires), open: () => nav.to({ kind: 'knights' }), acts: [{ label: 'Allow', primary: true, run: (w) => answerChallenge(w, c.id, true) }, { label: 'Forbid', run: (w) => answerChallenge(w, c.id, false) }] });
  }
  for (const e of (world.grounds?.circuit ?? []).filter((x) => !x.done && x.host !== P && (x.invited?.includes(P) || x.kind === 'public') && !x.entrants.some((y) => y.houseId === P))) {
    const inv = e.invited?.includes(P);
    items.push({ id: e.id, mark: '[»]', kind: inv ? 'INVITATION' : 'TOURNEY', text: <>{inv ? `House ${world.houses[e.host!]?.name} invites us: ` : ''}{e.name}</>, quiet: !inv, when: inCycles(world, e.held), open: () => nav.to({ kind: 'grounds' }), detail: e.kind === 'underground' ? <span className="muted" style={{ fontSize: 12 }}>No one is sent to the pits. Those who want to fight will go on their own; forbid it on the grounds if the house will not have it.</span> : undefined,
      acts: !inv ? undefined : e.kind === 'underground' ? [{ label: 'Noted', run: (w) => declineCircuit(w, e.id) }] : (() => { const best = bestFor(world, e.id); const why = cannotEnter(world, e.id, best); return [{ label: best.length ? `Send our best (${best.length})` : 'No one to send', primary: true, disabled: !!why, title: why ?? best.map((id) => world.characters[id]?.name.given).join(', '), run: (w: World) => enterCircuit(w, e.id, bestFor(w, e.id)) }, { label: 'Choose ›', run: (w: World) => w, go: () => nav.to({ kind: 'grounds' }) }, { label: 'Decline', run: (w: World) => declineCircuit(w, e.id) }]; })() });
  }
  for (const b of world.ladder?.proposals ?? []) {
    const c = world.characters[b.aspirantId];
    const t = b.teacherId ? world.characters[b.teacherId] : undefined;
    if (!c && !b.local) continue;
    const who = c ? c.name.given : b.local!.name;
    items.push({ id: b.id, mark: '[†]', kind: 'BLOODING', text: b.local ? <>{t ? `${t.name.given} wants ` : ''}{who}, a pit fighter from {b.local.where}</> : <>{t ? `${t.name.given} thinks ` : ''}{who} is {readinessText(b)} to be blooded</>, when: inCycles(world, b.expires),
      open: () => setOpen((o) => (o === b.id ? null : b.id)),
      detail: c ? <CouncilViews id={c.id} /> : <span className="muted" style={{ fontSize: 12 }}>{b.local!.record}. No house, no name. Taking them costs {LOCAL_COST} othes on top of the blooding.</span>,
      acts: [
      { label: 'Gift · 200', primary: true, title: 'Bless the blooding with a gift: they will remember it', run: (w) => answerBlooding(w, b.id, 'gift') },
      { label: 'Words', primary: true, title: 'Your words read out: it fires their will', run: (w) => answerBlooding(w, b.id, 'word') },
      { label: 'High table', primary: true, title: 'A seat at the high table that night: a little glory', run: (w) => answerBlooding(w, b.id, 'seat') },
      { label: 'Wait', title: 'Not yet', run: (w) => answerBlooding(w, b.id, 'wait') },
    ] });
  }
  for (const c of readyForCommand(world, P).slice(0, 2)) {
    items.push({ id: `ready-${c.id}`, mark: '[*]', kind: 'READY', text: <>{c.name.given} is ready for a first command</>, quiet: true, open: () => nav.to({ kind: 'plan', mission: 'scout', leader: c.id }) });
  }
  for (const l of leadsOf(world, P)) {
    const who = l.proposal?.sponsorId ? world.characters[l.proposal.sponsorId] : undefined;
    items.push({ id: l.id, mark: l.proposal ? '[*]' : '[i]', kind: l.proposal ? 'PROSPECT' : 'LEAD', text: l.proposal ? <>{who ? `${who.name.given} wants ` : 'Noticed: '}{l.title}</> : l.title, quiet: !l.proposal, when: inCycles(world, l.expires), open: () => nav.to({ kind: 'missions' }),
      acts: l.kind === 'recruit' ? [{ label: `Take in · ${(l.cost ?? 0).toLocaleString('en-US')}`, primary: true, run: (w) => recruit(w, l.id) }, { label: 'Let go', run: (w) => dismissLead(w, l.id) }] : undefined });
  }
  const recent = world.feed.slice(-40).reverse().filter((e) => e.kind === 'mission' && e.missionId && world.missions[e.missionId]?.stage === 'done').slice(0, 2);
  for (const e of recent) {
    items.push({ id: `m-${e.missionId}`, mark: '[r]', kind: 'REPORT', text: e.text, quiet: true, open: () => nav.to({ kind: 'mission', id: e.missionId! }) });
  }
  // Letters: everything the house learns, brought by the councillor whose people saw it.
  const news = lettersFor(world);
  const opened = open ? world.events?.pending.find((p) => p.id === open) : undefined;
  const audience = open ? world.ambitions?.audiences.find((a) => a.id === open) : undefined;
  const counts: Record<DeskTab, number> = { needs: 0, chances: 0, news: news.length };
  for (const it of items) counts[tabOf(it.kind)]++;
  const tab: DeskTab = tabPick ?? (counts.needs ? 'needs' : counts.chances ? 'chances' : 'news');
  const shownItems = tab === 'news' ? [] : items.filter((it) => tabOf(it.kind) === tab);
  const act = (fn: (w: World) => World) => { setErr(null); game.update((w) => { try { return fn(w); } catch (e) { setErr((e as Error).message); return w; } }); };
  const LABEL: Record<DeskTab, string> = { needs: 'Needs you', chances: 'Opportunities', news: 'Letters' };
  return (
    <Panel scroll={560} title={<Term k="decision">The desk</Term>} aside={`${counts.needs} need you`} className={`major ${className ?? ''}`}>
      <div className="desk-filters">
        {(['needs', 'chances', 'news'] as DeskTab[]).map((t) => (
          <button key={t} type="button" className="subtab" aria-current={tab === t ? 'page' : undefined} onClick={() => setTabPick(t)}>{LABEL[t]} ({counts[t]})</button>
        ))}
      </div>
      {err ? <p className="body error" style={{ margin: 0 }}>{err}</p> : null}
      {tab === 'news' ? <Letters letters={news} /> : shownItems.length === 0 ? <p className="body muted" style={{ margin: 0 }}>{tab === 'needs' ? 'Nothing needs you. Press Play and the world will fill the desk.' : 'No openings just now.'}</p> : null}
      <div className="desk-list">
        {shownItems.map((it) => (
          <div key={it.id} className="desk-row">
            <button type="button" className={`desk-item${it.quiet ? ' quiet' : ''}`} aria-pressed={open === it.id} onClick={it.open} title="Open">
              <span className="glyph">{it.mark}</span><span className="kind">{it.kind}</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.text}</span><span className="when">{it.when ?? ''}</span>
            </button>
            {it.acts ? <span className="desk-acts">{it.acts.map((a) => <button key={a.label} type="button" className={`btn small${a.primary ? ' primary' : ''}`} disabled={a.disabled} title={a.title} onClick={() => (a.go ? a.go() : act(a.run))}>{a.label}</button>)}</span> : null}
            {open === it.id && (it.detail || opened || audience) ? (
              <div style={{ flexBasis: '100%', padding: '6px 10px 10px 38px' }}>
                {it.detail ?? null}
                {opened && opened.id === it.id ? <Decision p={opened} /> : null}
                {audience && audience.id === it.id ? <AudienceCard au={audience} onDone={() => setOpen(null)} /> : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {opened || audience || shownItems.length === 0 ? null : <p className="body keyhint" style={{ margin: 0, fontSize: 12 }}>Act on a letter here, or open it for the whole story. Decisions left too long fall to the council on the date shown.</p>}
    </Panel>
  );
}

const markSeen = (ids: string[]) => (w: World): World => ({ ...w, ambitions: { ...w.ambitions, seen: [...(w.ambitions.seen ?? []), ...ids].slice(-600) } });

/** The Letters tab: one stack per councillor, opened to read. */
function Letters({ letters }: { letters: FeedEntry[] }) {
  const world = useWorld();
  const game = useGame();
  const [openSeat, setOpenSeat] = useState<Reporter | null>(null);
  if (!letters.length) return <p className="body muted" style={{ margin: 0 }}>No letters you have not read.</p>;
  const readAll = <div className="body" style={{ padding: '6px 10px' }}><button type="button" className="btn small" onClick={() => game.update(markSeen(letters.map((e) => e.id!)))}>Read all ({letters.length})</button> <span className="muted" style={{ fontSize: 12 }}>Anything that needs a decision waits under Needs you.</span></div>;
  const by: Partial<Record<Reporter, FeedEntry[]>> = {};
  for (const e of letters) (by[reporterOf(world, e)] ??= []).push(e);
  const P = world.playerHouseId;
  return (
    <div className="desk-list">
      {readAll}
      {REPORTERS.filter((r) => by[r]?.length).map((r) => {
        const list = by[r]!;
        const who = r === 'heralds' ? undefined : seatHolder(world, P, r);
        const big = list.filter((e) => classify(world, e).severity >= 2);
        const small = list.filter((e) => classify(world, e).severity < 2);
        const isOpen = openSeat === r;
        return (
          <div key={r} style={{ borderBottom: '1px solid #111' }}>
            <div className="desk-row">
              <button type="button" className="desk-item" aria-pressed={isOpen} onClick={() => setOpenSeat(isOpen ? null : r)} title={`Reports on ${REPORTER_REACH[r]}`}>
                <span>[✉]</span><span>{REPORTER_LABEL[r].toUpperCase()}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{who ? displayName(who.name) : r === 'heralds' ? 'Cried in every port' : <em className="muted">The seat is empty</em>} · {list.length} {list.length === 1 ? 'letter' : 'letters'}{big.length ? ` · ${big.length} that matter` : ''}</span>
                <span className="when">{isOpen ? '▾' : '▸'}</span>
              </button>
              <span className="desk-acts"><button type="button" className="btn small" onClick={() => game.update(markSeen(list.map((e) => e.id!)))}>Read</button></span>
            </div>
            {isOpen ? (
              <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
                {big.map((e) => <Letter key={e.id} e={e} />)}
                {small.length ? (
                  <div>
                    <div className="eyebrow muted" style={{ marginBottom: 2 }}>{big.length ? 'And the rest, briefly' : 'This Phase, briefly'}</div>
                    {small.map((e) => <div key={e.id} style={{ fontSize: 12.5, padding: '2px 0' }}>· {e.text}</div>)}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** One letter: the original words, the councillor's note, and what the person has been doing. */
function Letter({ e }: { e: FeedEntry }) {
  const world = useWorld();
  const game = useGame();
  const nav = useNav();
  const note = noteOn(world, e);
  const P = world.playerHouseId;
  const subjId = e.quote?.from ?? (e.who ?? []).map((x) => x.id).find((id) => world.characters[id]?.houseId === P);
  const recent = subjId ? seasonLine(totals(world, subjId)) : '';
  const lastTitle = subjId ? titlesOf(world, subjId).slice(-1)[0]?.title : undefined;
  return (
    <div style={{ borderLeft: '2px solid var(--line)', paddingLeft: 10 }}>
      <div><strong>{e.text}</strong></div>
      {e.quote ? <blockquote style={{ margin: '6px 0', fontStyle: 'italic' }}>“{e.quote.text}” <span className="muted" style={{ fontStyle: 'normal' }}>— <PersonById id={e.quote.from} /></span></blockquote> : e.detail ? <div className="muted" style={{ fontSize: 12, whiteSpace: 'pre-line' }}>{e.detail}</div> : null}
      {note ? <div style={{ fontSize: 12.5 }}><span className="muted">{note.by ? <><PersonById id={note.by} />, in the margin:</> : 'In the margin:'}</span> {note.text}</div> : null}
      {subjId && (recent !== 'nothing of note yet' || lastTitle) ? <div className="muted" style={{ fontSize: 12 }}>Lately, <PersonById id={subjId} />: {recent}{lastTitle ? ` · ${lastTitle}` : ''}</div> : null}
      <div className="actions" style={{ marginTop: 4 }}>
        <button type="button" className="btn small" onClick={() => game.update(markSeen([e.id!]))}>Read</button>
        <button type="button" className="btn small" onClick={() => nav.to({ kind: 'log', open: e.id })}>In the log ›</button>
      </div>
    </div>
  );
}

/** Ask the council: each councillor's word on a blooding. */
export function CouncilViews({ id }: { id: string }) {
  const world = useWorld();
  const views = councilViews(world, id);
  const t = tallyViews(views);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12.5 }}>
      <span className="eyebrow muted">The council: {t.for} for · {t.against} against · {t.unsure} unsure</span>
      {views.map((v) => <span key={v.seat}><span className="mono" style={{ display: 'inline-block', width: 64 }}>{v.verdict === 'for' ? '[ yes ]' : v.verdict === 'against' ? '[ no  ]' : '[  ?  ]'}</span> <PersonById id={v.id} /> <span className="muted">({SEAT_TITLE[v.seat]})</span>: {v.text}</span>)}
    </div>
  );
}

function titleOf(p: PendingEvent): string {
  const d = eventDef(p.defId);
  return d ? titleFor(d, p) : 'A decision';
}
