// The Hall: the home screen in the terminal look. A drawing of the throne room
// that follows the house's state, the council as a table, and the Desk, where
// everything waiting on the Highroy lands.
import { readyForCommand } from '../sim/missions';
import { answerChallenge } from '../sim/grounds';
import { declineCircuit } from '../sim/circuit';
import { answerIntake, answerPupilOffer, cannotTakeIntake } from '../sim/training';
import { answerAsk } from '../sim/loans';
import { dismissLead, recruit } from '../sim/discovery';
import { ageOf } from '../sim/characters';
import { useState, type ReactNode } from 'react';
import { useGame, useNav, useWorld } from './context';
import { AudienceCard } from './ambitions';
import { AMBITION_LABEL } from '../sim/ambitions';
import { CLOSES, currentRound } from '../sim/crucible';
import { classify } from '../sim/records';
import { Panel, PersonLink } from './links';
import { Term } from './tip';
import { Decision } from './events';
import { councilOf, SEAT_TITLE } from '../sim/world';
import { findSector, ruler } from '../sim/query';
import { isAway } from '../sim/court';
import { activeMissionOf } from '../sim/missions';
import { moodLabel, moodOf } from '../sim/mood';
import { TASKS_BY_ID, OATHS_BY_ID, oathProgress } from '../sim/council';
import { leadsOf } from '../sim/discovery';
import { absoluteCycle, type GameDate } from '../sim/time';
import { eventDef } from '../sim/events';
import { displayName } from '../sim/names';
import type { World } from '../sim/types';

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
        <table className="ctable">
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

interface DeskAct { label: string; run: (w: World) => World; primary?: boolean; title?: string; disabled?: boolean }
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
}

type DeskTab = 'needs' | 'chances' | 'news';
const NEEDS = new Set(['DECISION', 'AUDIENCE', 'PETITION', 'RAID', 'HELD', 'RANSOM', 'LOAN', 'DEFAULT', 'CAIGE', 'CRUCIBLE', 'CHALLENGE', 'INTAKE', 'PUPIL', 'INVITATION', 'WARD']);
const tabOf = (k: string): DeskTab => (NEEDS.has(k) ? 'needs' : k === 'NEWS' ? 'news' : 'chances');

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function Desk({ className }: { className?: string }) {
  const world = useWorld();
  const game = useGame();
  const nav = useNav();
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
      text: <>{titleOf(p.defId)}{lead ? ` — from ${lead.name.given}` : ''}</>,
      when: inCycles(world, p.expires),
      open: () => setOpen((o) => (o === p.id ? null : p.id)),
    });
  }
  const cr = world.crucible;
  if (cr?.stage === 'drawn' && cr.entrants.includes(P) && !cr.contingents[P]) items.push({ id: 'crucible-open', mark: '[⚔]', kind: 'CRUCIBLE', text: <>We are drawn for the Crucible: raise our contingent</>, when: `by Orbit ${CLOSES}`, open: () => nav.to({ kind: 'crucible' }) });
  const round = cr?.stage === 'campaign' && cr.contingents[P] && !cr.contingents[P]!.out ? currentRound(world) : undefined;
  if (round && !round.stance[P]) items.push({ id: `cs-${round.orbit}`, mark: '[⚔]', kind: 'CRUCIBLE', text: <>Orbit {round.orbit} on the battle world: choose the Marshal's stance</>, when: `Orbit ${round.orbit}`, open: () => nav.to({ kind: 'crucible' }) });
  for (const au of world.ambitions?.audiences ?? []) {
    const c = world.characters[au.characterId];
    items.push({ id: au.id, mark: '[»]', kind: 'AUDIENCE', text: <>{c ? displayName(c.name) : 'Someone'} · {AMBITION_LABEL[au.kind].toLowerCase()}</>, when: inCycles(world, au.expires), open: () => setOpen((o) => (o === au.id ? null : au.id)) });
  }
  for (const r of world.ports?.raids ?? []) {
    if (r.status !== 'revealed' || r.answer) continue;
    const s = findSector(world, r.sectorId)?.sector;
    items.push({ id: r.id, mark: '[⚠]', kind: 'RAID', text: <>Corsairs bound for {s?.name}</>, when: inCycles(world, r.arrives), open: () => nav.to({ kind: 'port', id: r.sectorId }) });
  }
  for (const s of Object.values(world.ports?.ships ?? {})) {
    if (s.status === 'held') items.push({ id: s.id, mark: '[⚓]', kind: 'HELD', text: <>{s.name} at {findSector(world, s.sectorId)?.sector.name}</>, open: () => nav.to({ kind: 'port', id: s.sectorId, ship: s.id }) });
    else if (s.status === 'docked' && s.aboard.some((a) => a.characterId && world.ports.watch.includes(a.characterId))) {
      const a = s.aboard.find((x) => x.characterId && world.ports.watch.includes(x.characterId))!;
      items.push({ id: `w-${s.id}`, mark: '[●]', kind: 'WATCH', text: <>{a.name} docked · {s.name}</>, open: () => nav.to({ kind: 'port', id: s.sectorId, ship: s.id }) });
    }
  }
  for (const pet of world.courts[P]?.petitions ?? []) {
    const from = world.characters[pet.fromId];
    items.push({ id: pet.id, mark: '[?]', kind: 'PETITION', text: <>{from ? displayName(from.name) : 'A councillor'} asks to act</>, when: inCycles(world, pet.expires), open: () => scrollTo('petitions') });
  }
  for (const cap of Object.values(world.captives)) {
    const c = world.characters[cap.characterId];
    if (cap.ransom?.status !== 'open' || c?.houseId !== P) continue;
    items.push({ id: `r-${c.id}`, mark: '[$]', kind: 'RANSOM', text: <>{world.houses[cap.heldBy]?.name} holds {c.name.given} · {cap.ransom.amount.toLocaleString('en-US')}</>, when: inCycles(world, cap.ransom.expires), open: () => scrollTo('ransoms') });
  }
  for (const a of (world.loans?.asks ?? []).filter((x) => x.to === P)) {
    items.push({ id: a.id, mark: '[$]', kind: 'LOAN', text: <>{world.houses[a.from]?.name} asks to borrow {a.amount.toLocaleString('en-US')}</>, when: inCycles(world, a.expires), open: () => nav.to({ kind: 'loans' }), acts: [{ label: 'Lend', primary: true, run: (w) => answerAsk(w, a.id, true) }, { label: 'Refuse', run: (w) => answerAsk(w, a.id, false) }] });
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
    items.push({ id: e.id, mark: '[»]', kind: inv ? 'INVITATION' : 'TOURNEY', text: <>{inv ? `House ${world.houses[e.host!]?.name} invites us: ` : ''}{e.name}</>, quiet: !inv, when: inCycles(world, e.held), open: () => nav.to({ kind: 'grounds' }), acts: inv ? [{ label: 'Decline', run: (w) => declineCircuit(w, e.id) }] : undefined });
  }
  for (const c of readyForCommand(world, P).slice(0, 2)) {
    items.push({ id: `ready-${c.id}`, mark: '[*]', kind: 'READY', text: <>{c.name.given} is ready for a first command</>, quiet: true, open: () => nav.to({ kind: 'plan', mission: 'scout', leader: c.id }) });
  }
  for (const l of leadsOf(world, P)) {
    const who = l.proposal?.sponsorId ? world.characters[l.proposal.sponsorId] : undefined;
    items.push({ id: l.id, mark: l.proposal ? '[*]' : '[i]', kind: l.proposal ? 'PROSPECT' : 'LEAD', text: l.proposal ? <>{who ? `${who.name.given} wants ` : 'Noticed: '}{l.title}</> : l.title, quiet: !l.proposal, when: inCycles(world, l.expires), open: () => scrollTo('leads'),
      acts: l.kind === 'recruit' ? [{ label: `Take in · ${(l.cost ?? 0).toLocaleString('en-US')}`, primary: true, run: (w) => recruit(w, l.id) }, { label: 'Let go', run: (w) => dismissLead(w, l.id) }] : undefined });
  }
  const recent = world.feed.slice(-40).reverse().filter((e) => e.kind === 'mission' && e.missionId && world.missions[e.missionId]?.stage === 'done').slice(0, 2);
  for (const e of recent) {
    items.push({ id: `m-${e.missionId}`, mark: '[r]', kind: 'REPORT', text: e.text, quiet: true, open: () => nav.to({ kind: 'mission', id: e.missionId! }) });
  }
  // News: what has happened to the house lately, put in front of the Highroy until set aside.
  const seen = new Set(world.ambitions?.seen ?? []);
  const shown = new Set(items.map((i) => i.id));
  const since = absoluteCycle(world.date) - 32;
  const news = world.feed.filter((e) => e.id && !seen.has(e.id) && !shown.has(e.id) && absoluteCycle(e.date) >= since && e.type !== 'decision' && e.type !== 'raid' && e.type !== 'time' && e.type !== 'port' && e.type !== 'seizure'
    && ((classify(world, e).severity >= 2 && (e.who?.some((w) => world.characters[w.id]?.houseId === P) || e.houseIds?.includes(P)))
      || (classify(world, e).severity >= 1 && e.who?.some((w) => world.careers?.pinned.includes(w.id))))).slice(-6).reverse();
  for (const e of news) items.push({ id: e.id!, mark: '[·]', kind: 'NEWS', text: e.text, quiet: true, open: () => { game.update((w) => ({ ...w, ambitions: { ...w.ambitions, seen: [...(w.ambitions.seen ?? []), e.id!].slice(-300) } })); nav.to({ kind: 'log', open: e.id }); },
    acts: [{ label: 'Seen', run: (w) => ({ ...w, ambitions: { ...w.ambitions, seen: [...(w.ambitions.seen ?? []), e.id!].slice(-300) } }) }] });
  const opened = open ? world.events?.pending.find((p) => p.id === open) : undefined;
  const audience = open ? world.ambitions?.audiences.find((a) => a.id === open) : undefined;
  const clearNews = () => game.update((w) => ({ ...w, ambitions: { ...w.ambitions, seen: [...(w.ambitions.seen ?? []), ...news.map((e) => e.id!)].slice(-300) } }));
  const counts: Record<DeskTab, number> = { needs: 0, chances: 0, news: 0 };
  for (const it of items) counts[tabOf(it.kind)]++;
  const tab: DeskTab = tabPick ?? (counts.needs ? 'needs' : counts.chances ? 'chances' : 'news');
  const shownItems = items.filter((it) => tabOf(it.kind) === tab);
  const act = (fn: (w: World) => World) => { setErr(null); game.update((w) => { try { return fn(w); } catch (e) { setErr((e as Error).message); return w; } }); };
  const LABEL: Record<DeskTab, string> = { needs: 'Needs you', chances: 'Opportunities', news: 'News' };
  return (
    <Panel title={<Term k="decision">The desk</Term>} aside={`${counts.needs} need you`} className={`major ${className ?? ''}`}>
      <div className="desk-filters">
        {(['needs', 'chances', 'news'] as DeskTab[]).map((t) => (
          <button key={t} type="button" className="subtab" aria-current={tab === t ? 'page' : undefined} onClick={() => setTabPick(t)}>{LABEL[t]} ({counts[t]})</button>
        ))}
      </div>
      {err ? <p className="body error" style={{ margin: 0 }}>{err}</p> : null}
      {shownItems.length === 0 ? <p className="body muted" style={{ margin: 0 }}>{tab === 'needs' ? 'Nothing needs you. Press Continue and the world will fill the desk.' : tab === 'chances' ? 'No openings just now.' : 'No news you have not seen.'}</p> : null}
      <div className="desk-list">
        {shownItems.map((it) => (
          <div key={it.id} className="desk-row">
            <button type="button" className={`desk-item${it.quiet ? ' quiet' : ''}`} aria-pressed={open === it.id} onClick={it.open} title="Open">
              <span>{it.mark}</span><span>{it.kind}</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.text}</span><span className="when">{it.when ?? ''}</span>
            </button>
            {it.acts ? <span className="desk-acts">{it.acts.map((a) => <button key={a.label} type="button" className={`btn small${a.primary ? ' primary' : ''}`} disabled={a.disabled} title={a.title} onClick={() => act(a.run)}>{a.label}</button>)}</span> : null}
          </div>
        ))}
      </div>
      {opened ? <div style={{ borderTop: '1px solid var(--line)' }}><Decision p={opened} /></div> : null}
      {audience ? <div style={{ borderTop: '1px solid var(--line)' }}><AudienceCard au={audience} onDone={() => setOpen(null)} /></div> : null}
      {tab === 'news' && news.length && !opened && !audience ? <div className="body" style={{ paddingTop: 0 }}><button type="button" className="btn small" onClick={clearNews}>Set all the news aside ({news.length})</button></div> : null}
      {opened || audience || shownItems.length === 0 ? null : <p className="body keyhint" style={{ margin: 0, fontSize: 12 }}>Act on a letter here, or open it for the whole story. Decisions left too long fall to the council on the date shown.</p>}
    </Panel>
  );
}

function titleOf(defId: string): string {
  return eventDef(defId)?.title ?? 'A decision';
}
