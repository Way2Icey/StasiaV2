// Little pixel portraits, drawn from a person's id so the same person always
// looks the same. Species sets the face (horns, tusks, ears, four eyes...),
// age greys the hair, and the house tints the clothes and backdrop.
import { memo } from 'react';
import { SPECIES } from '../data/species';
import { ageOf } from '../sim/characters';
import type { Character, SpeciesId } from '../sim/types';
import type { GameDate } from '../sim/time';

const N = 16;
type Grid = (string | null)[][];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rngFrom(seed: number) {
  let a = seed || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    chance: (p: number) => next() < p,
    pick: <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]!,
  };
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
function hsl(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return `#${((f(0) << 16) | (f(8) << 8) | f(4)).toString(16).padStart(6, '0')}`;
}

const SKIN: Record<SpeciesId, string[]> = {
  fokari: ['#eadbc6', '#dcc4a6', '#cfb79c', '#e3cfb8'],
  thessari: ['#8b97a4', '#7d8995', '#97a09c', '#8a8f9e'],
  torvann: ['#9c8a5e', '#8b7b54', '#a5916b', '#8f8660'],
  serathi: ['#c99b6c', '#b6855c', '#d6ab7e', '#a87a55'],
  shaaliin: [],
  doven: ['#a9745b', '#956650', '#ba836a', '#8a5d48'],
  gholari: ['#a090b4', '#8aa4a9', '#a897a7', '#9a9fbf'],
  human: ['#e8c8a8', '#c99a74', '#a8744e', '#7a5236', '#f0d6bc'],
  varngotha: ['#ece8df', '#e2ddd2', '#f2efe8'],
  azurian: ['#9fc0e0', '#8fb2d6', '#a9c8e6'],
  myrelic: ['#e0c4aa', '#cfae92', '#d8bca0'],
  velarai: ['#d8d0e8', '#c8d6e0', '#e0d4dc'],
  tavari: ['#e8e0f0', '#dce8ec', '#ece4e0'],
  korenite: ['#5a6a5a', '#4e5e62', '#6a5e4e'],
  murnath: ['#8a7a9a', '#7a8a8a', '#9a8a7a'],
  draychi: ['#6a7a4a', '#7a4a4a', '#5a6a7a'],
};
const HAIR = ['#1c1a1e', '#3a2a20', '#5a3a24', '#7a4a2a', '#8e5a2e', '#b8894a', '#d4b56a', '#6b2a22'];
/** Each house's colour, for clothes and backdrop. */
const HOUSE_HUE: Record<string, number> = { alerion: 218, torvann: 18, serath: 150, shaaliin: 285, lumen: 48, varngotha: 0, theaszar: 8, mull: 95, doven: 30, myr: 195, endama: 345, gholari: 120, koren: 70, tavareen: 260, vahler: 300, murnath: 170, myrai: 230, azure: 205 };
const EYES = ['#2a5a8a', '#3a6a3a', '#5a3a1e', '#2a2a2a', '#6a6a7a', '#7a5a1a'];

interface Look {
  skin: string;
  hair: string | null;
  eye: string;
  cloth: string;
  bg: string;
  trim: string | null;
}

function draw(c: Character, date: GameDate, high: boolean): { g: Grid; look: Look } {
  const r = rngFrom(hash(c.id));
  const sp = c.species;
  const g: Grid = Array.from({ length: N }, () => Array<string | null>(N).fill(null));
  const set = (x: number, y: number, col: string | null) => { if (x >= 0 && y >= 0 && x < N && y < N) g[y]![x] = col; };
  const row = (y: number, x0: number, x1: number, col: string) => { for (let x = x0; x <= x1; x++) set(x, y, col); };

  // ---- palette
  const houseHue = HOUSE_HUE[c.houseId] ?? hash(c.houseId) % 360;
  const skin = sp === 'shaaliin' ? hsl(r.next() * 360, 25 + r.next() * 25, 55 + r.next() * 12) : r.pick(SKIN[sp]);
  const skinDark = shade(skin, -0.22);
  const age = ageOf(c, date);
  const lifeShare = age / Math.max(1, c.lifespan);
  const adult = age >= SPECIES[sp].adulthood;
  let hair: string | null = sp === 'shaaliin' ? hsl(r.next() * 360, 45, 35 + r.next() * 25) : r.pick(HAIR);
  if (lifeShare > 0.62 && r.chance(Math.min(1, (lifeShare - 0.55) * 3))) hair = lifeShare > 0.8 ? '#dcdcd6' : '#9a9a96';
  if (sp === 'gholari' || (sp === 'torvann' && r.chance(0.6)) || (sp === 'thessari' && r.chance(0.5))) hair = null;
  const eye = sp === 'fokari' ? r.pick(['#c89a2a', '#d4b04a', '#b07a2a']) : sp === 'gholari' ? '#151218' : r.pick(EYES);
  const cloth = hsl(houseHue + (r.next() - 0.5) * 20, 34 + r.next() * 16, 26 + r.next() * 10);
  const bg = hsl(houseHue, 26, 16);
  const trim = high ? '#c9a24a' : r.chance(0.3) ? shade(cloth, 0.3) : null;

  // ---- backdrop
  for (let y = 0; y < N; y++) row(y, 0, N - 1, y < 8 ? bg : shade(bg, -0.15 * ((y - 7) / 8)));

  // ---- shoulders and clothes
  const broad = sp === 'torvann' || sp === 'doven' ? 1 : sp === 'serathi' || sp === 'fokari' ? -1 : 0;
  row(13, 3 - broad, 12 + broad, cloth);
  row(14, 2 - broad, 13 + broad, cloth);
  row(15, 1 - broad, 14 + broad, cloth);
  row(13, 6, 9, shade(cloth, -0.25));
  if (trim) { row(13, 5, 5, trim); row(13, 10, 10, trim); set(5, 14, trim); set(10, 14, trim); }
  if (c.role === 'Knight' || c.seat === 'grandMaster' || c.seat === 'champion') {
    row(13, 2 - broad, 4 - broad, '#8c96a0'); row(13, 11 + broad, 13 + broad, '#8c96a0'); // pauldrons
  }

  // ---- neck
  row(11, 6, 9, skinDark);
  row(12, 6, 9, skinDark);

  // ---- head shape: [y, x0, x1]
  type Span = [number, number, number];
  let head: Span[] = [[3, 5, 10], [4, 4, 11], [5, 4, 11], [6, 4, 11], [7, 4, 11], [8, 4, 11], [9, 4, 11], [10, 5, 10], [11, 6, 9]];
  if (sp === 'torvann' || sp === 'doven') head = [[3, 4, 11], [4, 3, 12], [5, 3, 12], [6, 3, 12], [7, 3, 12], [8, 3, 12], [9, 3, 12], [10, 4, 11], [11, 5, 10]];
  if (sp === 'fokari') head = [[2, 6, 9], [3, 5, 10], [4, 5, 10], [5, 4, 11], [6, 4, 11], [7, 4, 11], [8, 5, 10], [9, 5, 10], [10, 6, 9], [11, 7, 8]];
  if (sp === 'serathi') head = [[4, 5, 10], [5, 4, 11], [6, 4, 11], [7, 4, 11], [8, 4, 11], [9, 5, 10], [10, 6, 9], [11, 7, 8]];
  for (const [y, a, b] of head) { row(y, a, b, skin); set(b, y, skinDark); }
  const top = head[0]![0];

  // ---- species features
  if (sp === 'thessari') {
    const horn = r.pick(['#d8ccb0', '#bfb59a', '#5a524a']);
    if (r.chance(0.5)) { set(4, 3, horn); set(3, 2, horn); set(3, 1, horn); set(11, 3, horn); set(12, 2, horn); set(12, 1, horn); }
    else { set(5, 2, horn); set(5, 1, horn); set(4, 0, horn); set(10, 2, horn); set(10, 1, horn); set(11, 0, horn); }
    row(5, 5, 10, skinDark); // heavy hide ridge
  }
  if (sp === 'serathi') { set(4, 4, skin); set(3, 3, skin); set(3, 2, skinDark); set(11, 4, skin); set(12, 3, skin); set(12, 2, skinDark); set(3, 4, skinDark); set(12, 4, skinDark); }
  if (sp === 'torvann') { set(5, 4, skinDark); set(7, 3, skinDark); set(9, 4, skinDark); set(10, 3, skinDark); }
  if (sp === 'doven') row(6, 4, 11, skinDark);
  if (sp === 'fokari' && r.chance(0.6)) { set(7, 1, shade(skin, -0.1)); set(8, 1, shade(skin, -0.1)); }
  if (sp === 'shaaliin') { const m = shade(skin, -0.12); for (let i = 0; i < 4; i++) set(4 + Math.floor(r.next() * 8), 4 + Math.floor(r.next() * 6), m); }

  // ---- hair (behind and on top)
  const long = c.sex === 'f' ? r.chance(0.7) : r.chance(0.2);
  const style = hair ? r.pick(long ? ['long', 'long', 'braid', 'up'] : ['short', 'short', 'crop', 'swept', 'up']) : 'none';
  if (hair) {
    const hd = shade(hair, -0.25);
    if (style !== 'crop') row(top - 1, 5, 10, hair);
    row(top, head[0]![1], head[0]![2], hair);
    if (style !== 'crop') row(top + 1, head[1]![1], head[1]![2], hair);
    if (style === 'swept') { row(top + 2, head[2]![1], 8, hair); set(head[2]![2], top + 2, hd); }
    if (style === 'long' || style === 'braid') {
      for (let y = top + 1; y <= 12; y++) { set(head[1]![1] - 1, y, hair); set(head[1]![2] + 1, y, hd); }
      if (style === 'braid') { set(head[1]![2] + 1, 13, hair); set(head[1]![2] + 1, 14, hd); }
    }
    if (style === 'up') { row(top - 2, 7, 8, hair); row(top - 3, 7, 8, hd); }
    if (style === 'short' || style === 'up') { set(head[2]![1], top + 2, hair); set(head[2]![2], top + 2, hd); }
  }

  // ---- face
  const ey = sp === 'fokari' ? 6 : 7;
  const white = '#ece6da';
  if (sp === 'gholari') {
    for (const y of [6, 8]) { set(5, y, eye); set(6, y, eye); set(9, y, eye); set(10, y, eye); }
    set(6, 6, '#3a3048'); set(9, 6, '#3a3048');
  } else {
    set(5, ey, white); set(6, ey, eye); set(9, ey, eye); set(10, ey, white);
    if (sp === 'fokari') { set(6, ey + 1, eye); set(9, ey + 1, eye); } // large eyes
    const brow = hair && sp !== 'doven' ? shade(hair, -0.1) : skinDark;
    if (r.chance(0.7)) { row(ey - 1, 5, 6, brow); row(ey - 1, 9, 10, brow); }
    set(8, ey + 1, skinDark); // nose
    const mouth = shade(skin, -0.38);
    if (r.chance(0.5)) row(9, 7, 8, mouth); else row(9, 6, 9, mouth);
    if (sp === 'torvann') { set(5, 10, '#efe8d6'); set(5, 9, '#efe8d6'); set(10, 10, '#efe8d6'); set(10, 9, '#efe8d6'); }
  }

  // ---- beards, age, marks
  if (hair && adult && c.sex === 'm' && sp !== 'serathi' && r.chance(sp === 'doven' ? 0.7 : 0.35)) {
    const beard = shade(hair, -0.05);
    row(10, head[8]?.[1] ?? 5, head[8]?.[2] ?? 10, beard);
    row(11, 6, 9, beard);
    if (r.chance(0.5)) { set(head[6]![1], 9, beard); set(head[6]![2], 9, beard); }
    set(7, 9, beard); set(8, 9, beard);
  }
  if (lifeShare > 0.72) { set(5, ey + 2, skinDark); set(10, ey + 2, skinDark); }
  if (c.flags.some((f) => f.id === 'wounded') || r.chance(0.08)) { set(10, ey - 1, '#b05a50'); set(10, ey + 1, '#b05a50'); set(11, ey, '#b05a50'); }
  if (r.chance(0.04) && sp !== 'gholari') { set(9, ey, '#141414'); set(10, ey, '#141414'); row(ey - 1, 8, 11, '#141414'); } // eyepatch

  return { g, look: { skin, hair, eye, cloth, bg, trim } };
}

function toRects(g: Grid) {
  const out: { x: number; y: number; w: number; c: string }[] = [];
  for (let y = 0; y < N; y++) {
    let x = 0;
    while (x < N) {
      const col = g[y]![x];
      if (!col) { x++; continue; }
      let w = 1;
      while (x + w < N && g[y]![x + w] === col) w++;
      out.push({ x, y, w, c: col });
      x += w;
    }
  }
  return out;
}

export const Portrait = memo(function Portrait({ c, date, high, size = 'large' }: { c: Character; date: GameDate; high?: boolean; size?: 'large' | 'small' }) {
  const { g } = draw(c, date, !!high);
  return (
    <span className={`portrait pixel${size === 'small' ? ' small' : ''}${c.alive ? '' : ' dead'}`} aria-hidden="true">
      <svg viewBox={`0 0 ${N} ${N}`} shapeRendering="crispEdges" width="100%" height="100%">
        {toRects(g).map((p, i) => <rect key={i} x={p.x} y={p.y} width={p.w} height={1} fill={p.c} />)}
      </svg>
    </span>
  );
});
