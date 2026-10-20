// Boots the Spell & VFX Review Lab (`?spells=on`, or `Alt+Shift+S` in dev builds).
// Imported for its side effect by `post.ts` (the game renderer's composer) so the
// guide and editor pages never load it, and normal sessions fetch the runtime
// chunk only when `?spells=on` is present or the developer presses `Alt+Shift+S`.

import { spellLabAutoOpen, spellLabDevEnabled } from './spell_lab_flag';

if (typeof document !== 'undefined') {
  if (spellLabAutoOpen()) {
    void import('./spell_lab_runtime').then((m) => m.startSpellLab());
  } else if (spellLabDevEnabled() && typeof window !== 'undefined') {
    const onShortcut = (e: KeyboardEvent): void => {
      if (e.altKey && e.shiftKey && e.code === 'KeyS') {
        e.preventDefault();
        window.removeEventListener('keydown', onShortcut);
        void import('./spell_lab_runtime').then((m) => m.startSpellLab().open());
      }
    };
    window.addEventListener('keydown', onShortcut);
  }
}
