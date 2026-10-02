// The Wildheart Basin's control rules, asked by the aura gate before any aura
// lands (combat/trinket_seams.ts auraGuarded, consulted by Sim.applyAura):
//
//  - the Fanglord's Great Jaguar (Stalk, design 5.1) can be stunned, rooted
//    and slowed, but each kind of control only once per window: the first one
//    of a kind lands and opens that kind's window, any other of the same kind
//    slides off until the window closes (beastmaster.ts ticks the windows down
//    and shows them as the jaguar's Wary auras);
//  - Zulgar's Jaguar Avatar (Spirit of the Hunt, design 5.3) can be slowed and
//    rooted during the hunt (zulgar.ts lifts his immunity for it), and a stun
//    lands for half as long.
//
// Pure: it reads and writes only the target's own encounter state and the
// incoming aura. Zero rng. Self-applied auras (Sunstruck) always pass.

import type { Aura, Entity } from '../../types';
import { BEAST_TUNING, controlGroupOf, ZULGAR_TUNING } from './ids';

/** True when the Basin's rules keep this aura off `target`. As a side effect
 *  a control the jaguar admits opens that kind's window, and a stun on the
 *  hunting avatar is halved. */
export function wildheartControlBlocks(target: Entity, aura: Aura): boolean {
  const st = target.wildheartFight;
  if (!st || target.kind !== 'mob' || aura.sourceId === target.id) return false;
  if (st.kind === 'jaguar') {
    const group = controlGroupOf(aura.kind);
    if (!group) return false;
    if (st.windows[group] > 0) return true;
    st.windows[group] = BEAST_TUNING.controlWindow;
    return false;
  }
  if (st.kind === 'zulgar' && st.phase === 'hunt' && controlGroupOf(aura.kind) === 'stun') {
    // Only a true stun takes hold of the avatar (halved); a sheep, a sap or
    // a blind slides off as it does outside the hunt.
    if (aura.kind !== 'stun') return true;
    aura.remaining *= ZULGAR_TUNING.huntStunScale;
    aura.duration *= ZULGAR_TUNING.huntStunScale;
  }
  return false;
}
