// The house's colours: the terminal look in one of four inks, chosen per house and kept in this browser.
import { useEffect, useState } from 'react';
import { storage } from './storage';
import { useWorld } from './context';

export type ThemeId = 'mono' | 'amber' | 'phosphor' | 'ice';
export const THEMES: { id: ThemeId; name: string; note: string; swatch: [string, string, string] }[] = [
  { id: 'amber', name: 'Amber', note: 'Warm, old machines.', swatch: ['#0b0906', '#f1e6d2', '#ffb347'] },
  { id: 'phosphor', name: 'Phosphor', note: 'Green on black, a war-room screen.', swatch: ['#050a07', '#d8f5e1', '#5cff9d'] },
  { id: 'ice', name: 'Cold blue', note: 'Clean and cold.', swatch: ['#070a0f', '#e2e9f2', '#7cc4ff'] },
  { id: 'mono', name: 'Black and white', note: 'The original terminal.', swatch: ['#000000', '#e6e6e6', '#ffffff'] },
];
const DEFAULT: ThemeId = 'amber';
const key = (houseId: string) => `stasia.theme.${houseId}`;

export function themeOf(houseId: string): ThemeId {
  const t = storage.get(key(houseId)) as ThemeId | null;
  return t && THEMES.some((x) => x.id === t) ? t : DEFAULT;
}

function apply(t: ThemeId) {
  const root = document.documentElement;
  if (t === 'mono') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t);
}

/** Keeps the page in the colours of the house being played. */
export function useHouseTheme(houseId: string) {
  useEffect(() => {
    apply(themeOf(houseId));
    const on = () => apply(themeOf(houseId));
    window.addEventListener('stasia:theme', on);
    return () => window.removeEventListener('stasia:theme', on);
  }, [houseId]);
}

export function setTheme(houseId: string, t: ThemeId) {
  storage.set(key(houseId), t);
  apply(t);
  window.dispatchEvent(new Event('stasia:theme'));
}

/** The picker: each house keeps its own colours. */
export function ThemePicker() {
  const world = useWorld();
  const P = world.playerHouseId;
  const [now, setNow] = useState<ThemeId>(themeOf(P));
  useEffect(() => setNow(themeOf(P)), [P]);
  return (
    <div className="theme-pick" role="group" aria-label="House colours">
      {THEMES.map((t) => (
        <button key={t.id} type="button" aria-pressed={now === t.id} onClick={() => { setTheme(P, t.id); setNow(t.id); }}>
          <span className="sw" aria-hidden>{t.swatch.map((c) => <span key={c} style={{ background: c, border: '1px solid #444' }} />)}</span>
          <strong>{t.name}</strong>
          <span className="muted">{t.note}</span>
        </button>
      ))}
    </div>
  );
}
