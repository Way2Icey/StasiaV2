// Line drawings of ships and stations, built from what is actually aboard: every bay a module, every
// refit drawn on the hull, every hold its cargo. Plain text, so they read the same everywhere.
import type { CapitalShip } from '../sim/fleet';
import type { Module } from '../sim/holdings';
import type { Site } from '../sim/places';
import type { Ship } from '../sim/ports';

const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length));
const centre = (s: string, n: number) => { const t = s.slice(0, n); const l = Math.floor((n - t.length) / 2); return ' '.repeat(l) + t + ' '.repeat(n - t.length - l); };

const BAY: Record<string, string> = { cells: 'BRIG', vault: 'VAULT', hangar: 'HANGAR', listening: 'EARS', academy: 'SCHOOL', base: 'TROOPS', shipyard: 'YARD' };

/** A side view of a great ship, bay by bay. */
export function capitalDiagram(s: CapitalShip, modules: Module[], slots: number): string {
  const fits = new Set(s.fits ?? []);
  const bays = Array.from({ length: slots }, (_, i) => { const m = modules[i]; return m ? `${BAY[m.kind] ?? m.kind.toUpperCase()}${m.level > 1 ? ` ${m.level}` : ''}` : '·'; });
  const w = 8;
  const cells = ['BRIDGE', ...bays, fits.has('quarters') ? 'QUARTERS' : 'CREW', 'DRIVE'];
  const inner = cells.map((c) => centre(c, w)).join('│');
  const len = inner.length;
  const plate = fits.has('armour') ? '▀' : '─';
  const plateB = fits.has('armour') ? '▄' : '─';
  const gun = fits.has('shardCannons') ? '╤' : ' ';
  const guns = (n: number) => '    ' + (gun.trim() ? Array.from({ length: n }, (_, i) => (i % 9 === 4 ? gun : ' ')).join('') : ' '.repeat(n));
  const lines = [
    guns(len + 2),
    `    ╭${plate.repeat(len)}╮`,
    ` ◄══┤${inner}├══▶▶`,
    `    ╰${plateB.repeat(len)}╯`,
    guns(len + 2).replace(/╤/g, '╧'),
  ];
  if (s.cls === 'flagship') {
    const deck = centre('COMMAND DECK', 14);
    lines.splice(1, 0, `    ${' '.repeat(Math.max(0, Math.floor(len / 2) - 8))}╭${'─'.repeat(14)}╮`, `    ${' '.repeat(Math.max(0, Math.floor(len / 2) - 8))}│${deck}│`);
  }
  if (s.cls === 'carrier' || modules.some((m) => m.kind === 'hangar')) lines.push(`    ╘${'═'.repeat(Math.max(10, len - 12))} ✈  ✈  ✈ ══ flight deck`);
  if (fits.has('shields')) return lines.map((l) => `( ${pad(l, len + 12)} )`).join('\n');
  return lines.join('\n');
}

/** A trader or courier at the docks, hold by hold: what was declared, and what customs found. */
export function portShipDiagram(s: Ship): string {
  const holds = s.cargo.filter((c) => !c.hidden || c.found).slice(0, 5).map((c) => (c.hidden ? `!${c.crate ? 'CRATE' : c.label}`.toUpperCase() : `${c.label} ×${c.qty}`));
  if (!holds.length) holds.push('EMPTY');
  const w = 16;
  const cells = ['BRIDGE', ...holds, `CREW ${s.crew}`, 'DRIVE'];
  const inner = cells.map((c) => centre(c, c.length > w ? w : Math.max(8, c.length + 2))).join('│');
  const len = inner.length;
  const war = s.purpose === 'warship';
  return [
    war ? `    ${' '.repeat(4)}╤${' '.repeat(Math.max(0, len - 10))}╤` : '',
    `    ╭${'─'.repeat(len)}╮`,
    ` ◄──┤${inner}├──▷`,
    `    ╰${'─'.repeat(len)}╯`,
    s.passengers ? `      ${s.passengers} passenger${s.passengers === 1 ? '' : 's'} aboard` : '',
  ].filter(Boolean).join('\n');
}

const STATION_ART: Record<Site['kind'], string[]> = {
  relay: ['        ╲ │ ╱', '      ── (◉) ──      ← tolls and traffic', '        ╱ │ ╲', '     ┌────┴────┐', '     │  RELAY  │', '     └─────────┘'],
  mining: ['        ▄▄███▄▄', '     ▄██▓▓▓▓▓▓██▄     ← a barren moon', '    ██▓▓╳▓▓▓╳▓▓██', '     ▀██▓▓▓▓▓██▀', '      ║  ║  ║         drill shafts', '     ═╩══╩══╩═'],
  yards: ['   ┌─┬─┬─┬─┬─┬─┐', '   │ │ │ │ │ │ │      gantries', '   ├─┴─┴─┴─┴─┴─┤', '   │ ◄═══════▶ │      a hull on the slips', '   └───────────┘'],
  fortress: ['   ╤     ╤     ╤', '  ┏┻━━━━━┻━━━━━┻┓', '  ┃ ▣  BASTION ▣ ┃     shields and turrets', '  ┃▣            ▣┃', '  ┗━━━━━━━━━━━━━━┛'],
  outpost: ['        ╭────╮', '      ╭─┤ ⌂  ├─╮      a dome and a landing field', '  ────┴─┴────┴─┴────', '  ░░░░░░░░░░░░░░░░░░'],
  landmark: ['        ▲', '       ▐█▌', '      ▐███▌', '     ▐█████▌', '    ═════════'],
  ruin: ['     ╱╲   ╱╲', '    ╱ ╳╲ ╱ ╳╲', '   ▕ ░░ ▏▕ ░░▏      dark since the old wars', '   ▔▔▔▔▔▔▔▔▔▔▔'],
  moving: ['   ╭──────────────────────────╮', ' ◄═┤ DENS │ BAZAAR │ ▒▒ │ SPINDLE ├═▶▶   never in one place', '   ╰──────────────────────────╯'],
};

export function siteDiagram(s: Site): string {
  const art = [...STATION_ART[s.kind]];
  if (s.holdable && s.garrison) art.push(`     garrison ${s.garrison.toLocaleString('en-US')} · walls ${s.defence}`);
  return art.join('\n');
}

const RELIC_ART: Record<string, string[]> = {
  echoCoin: ['   ╭───╮', '  │ ◎ │   ~30 seconds of a voice', '   ╰───╯'],
  keepring: ['   ═╦═══════▷', '    ║   a ceremonial blade'],
  shardsaint: ['    ▲', '   ▐█▌   a death, kept', '   ▐█▌', '  ▀▀▀▀▀'],
  navisign: ['  ┈┈◇┈┈◇┈┈   a lattice under the skin'],
  banner: ['  ┃▀▀▀▀▀▀▀▀', '  ┃▓▓▓▓▓▓▓▓', '  ┃▀▀▀▀▀▀▀▀', '  ┃'],
  writ: ['  ╭────────╮', '  │ ≡≡≡≡≡≡ │', '  │ ≡≡≡≡   │', '  ╰────────╯'],
  warNavisium: ['   ◆◇◆', '  ◇◆◇◆   navisium from the old wars', '   ◆◇◆'],
  stationLog: ['  ┌──────┐', '  │ ▒▒▒▒ │  a log no one has closed', '  └──────┘'],
  clrch: ['  ┌ ─ ─ ┐', '    ???     not ours to understand', '  └ ─ ─ ┘'],
};
export const relicDiagram = (kind: string): string => (RELIC_ART[kind] ?? ['  ◇']).join('\n');

export function planetDiagram(name: string): string {
  return ['      ▄▄████▄▄', '    ▄██▓▓▓▓▓▓██▄', `   ██▓▓▓▓▓▓▓▓▓▓██   ${name}`, '    ▀██▓▓▓▓▓▓██▀', '      ▀▀████▀▀'].join('\n');
}
