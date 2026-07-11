// Pure view core for the spell-activation proc overlay (the WoW-style curved
// "proc arcs" beside the character, owner request 2026-07-11): maps the
// player's worn auras to the overlay state. Heating Up (the first fire crit)
// shows the soft arcs; Hot Streak (the armed free instant) burns them bright;
// spending or losing the proc hides them. No DOM, no i18n: the thin
// proc_overlay_painter turns this state into two toggled classes.

export type ProcOverlayState = 'none' | 'heating' | 'hot';

export function procOverlayState(auras: ReadonlyArray<{ id: string }>): ProcOverlayState {
  let heating = false;
  for (const a of auras) {
    if (a.id === 'hot_streak') return 'hot';
    if (a.id === 'heating_up') heating = true;
  }
  return heating ? 'heating' : 'none';
}
