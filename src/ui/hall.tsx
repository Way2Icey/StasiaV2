// The Hall: the home screen in the terminal look. A drawing of the throne room
// that follows the house's state, the council as a table, and the Desk, where
// everything waiting on the Highroy lands.
import { useState, type ReactNode } from 'react';
import { useNav, useWorld } from './context';
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

interface DeskItem {
  id: string;
  mark: string;
  kind: string;
  text: ReactNode;
  when?: string;
  quiet?: boolean;
  open: () => void;
}

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function Desk({ className }: { className?: string }) {
  const world = useWorld();
  const nav = useNav();
  const P = world.playerHouseId;
  const [open, setOpen] = useState<string | null>(null);
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
  for (const l of leadsOf(world, P)) {
    items.push({ id: l.id, mark: '[i]', kind: 'LEAD', text: l.title, quiet: true, open: () => scrollTo('leads') });
  }
  const recent = world.feed.slice(-40).reverse().filter((e) => e.kind === 'mission' && e.missionId && world.missions[e.missionId]?.stage === 'done').slice(0, 2);
  for (const e of recent) {
    items.push({ id: `m-${e.missionId}`, mark: '[r]', kind: 'REPORT', text: e.text, quiet: true, open: () => nav.to({ kind: 'mission', id: e.missionId! }) });
  }
  const pending = (world.events?.pending.length ?? 0) + (world.courts[P]?.petitions.length ?? 0) + items.filter((i) => i.kind === 'RAID' || i.kind === 'HELD').length;
  const opened = open ? world.events?.pending.find((p) => p.id === open) : undefined;
  return (
    <Panel title={<Term k="decision">The desk</Term>} aside={`${items.length} letters · ${pending} need you`} className={`major ${className ?? ''}`}>
      {items.length === 0 ? <p className="body muted" style={{ margin: 0 }}>The desk is clear. Press Continue and the world will fill it.</p> : null}
      <div style={{ display: 'flex', flexDirection: 'column', padding: '4px 4px 6px' }}>
        {items.map((it) => (
          <button key={it.id} type="button" className={`desk-item${it.quiet ? ' quiet' : ''}`} aria-pressed={open === it.id} onClick={it.open}>
            <span>{it.mark}</span><span>{it.kind}</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.text}</span><span className="when">{it.when ?? ''}</span>
          </button>
        ))}
      </div>
      {opened ? <div style={{ borderTop: '1px solid var(--line)' }}><Decision p={opened} /></div> : null}
      {opened || items.length === 0 ? null : <p className="body keyhint" style={{ margin: 0, fontSize: 12 }}>Pick a letter to open it. Decisions left too long fall to the council, lapsing on the date shown.</p>}
    </Panel>
  );
}

function titleOf(defId: string): string {
  return eventDef(defId)?.title ?? 'A decision';
}
