// What the pad currently has focused, expressed as something the cross hotbar
// could hold. This is how an action gets ONTO the bar in the first place: open
// the spellbook, step onto an ability, and confirm picks it up to carry.
//
// It reuses the drag-and-drop affordance the spellbook already puts on its rows
// rather than deciding eligibility again: a row is `draggable` exactly when the
// window has already run `isAbilityActionBarEligible` over it, so the pad accepts
// precisely what a mouse drag would and a passive stays informational. Reading
// focus off the DOM (instead of a callback per source) works for the same reason:
// every surface that offers an action to a bar marks its rows the same way.
//
// Keyboard and mouse never reach this; only the pad's arrange mode calls it.

import type { CrossHotbarAction } from './cross_hotbar';

// Carried by the spellbook's rows and its hotbar-toggle buttons.
const ABILITY_ID_ATTR = 'data-ability-id';

/** The action the focused control stands for, or null when focus is on something
 *  the bar cannot hold. */
export function focusedPadAction(): CrossHotbarAction {
  if (typeof document === 'undefined') return null;
  const active = document.activeElement as HTMLElement | null;
  if (!active || active.draggable !== true) return null;
  const id = active.getAttribute?.(ABILITY_ID_ATTR);
  return id ? { type: 'ability', id } : null;
}
