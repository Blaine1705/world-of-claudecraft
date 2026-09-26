// Which translucent treatment a character wears this frame, if any.
//
// A released player spirit (`e.ghost`) wears the spirit VEIL: one shared
// unlit program family linked at boot (characters/ghost_veil.ts). Every other
// ethereal read keeps the transparent twin of its own materials: Ghost Wolf,
// the quest visions and the graveyard angel the thin 'spirit' run, the
// Veilbound March the same, Duskveil/Smokefade the denser 'stealth' fade. A
// dead stealther is a spirit first. Three-free so a Vitest pins the table.

import type { Entity } from '../sim/types';
import { shouldRenderStealthGhost } from './stealth';

export type CharacterGhostStyle = 'spirit' | 'stealth' | 'veil';

export function characterGhostStyle(
  viewerId: number,
  e: Entity,
  ghostWolf: boolean,
  veilbound: 'march' | 'mark' | 'none',
): CharacterGhostStyle | null {
  if (e.ghost) return 'veil';
  const stealthGhost = shouldRenderStealthGhost(viewerId, e);
  if (stealthGhost && !ghostWolf) return 'stealth';
  const ethereal =
    ghostWolf ||
    stealthGhost ||
    veilbound === 'march' ||
    e.templateId.startsWith('vision_') ||
    e.templateId === 'spirit_healer';
  return ethereal ? 'spirit' : null;
}
