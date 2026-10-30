// Browser storage can be missing or blocked (private windows, previews), so
// every access is guarded and the game works without it.
export const AUTOSAVE = 'stasia.autosave.v1';
export const SLOT = 'stasia.slot1.v1';

export const storage = {
  get(key: string): string | null {
    try { return window.localStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: string): boolean {
    try { window.localStorage.setItem(key, value); return true; } catch { return false; }
  },
};
