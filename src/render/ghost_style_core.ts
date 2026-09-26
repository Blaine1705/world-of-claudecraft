// Which translucent look a character wears this frame, if any.
//
// Every ethereal read is the spirit VEIL (characters/ghost_veil.ts): one
// shared unlit program family linked at boot, drawn with the user's palette
// (characters/spirit_veil_palette_core.ts). A released spirit, the Pale
// Keeper and the quest visions wear the released-spirit palette, Ghost Wolf
// and the Veilbound March their own. A living stealther keeps the transparent
// 'stealth' twin of its own materials. A dead stealther is a spirit first.
// Three-free so a Vitest pins the table.

import type { Entity } from '../sim/types';
import type { SpiritVeilPalette } from './characters/spirit_veil_palette_core';
import { shouldRenderStealthGhost } from './stealth';

export type CharacterGhostLook = SpiritVeilPalette | 'stealth';

export function characterGhostLook(
  viewerId: number,
  e: Entity,
  ghostWolf: boolean,
  veilbound: 'march' | 'mark' | 'none',
): CharacterGhostLook | null {
  if (e.ghost) return 'spirit';
  if (shouldRenderStealthGhost(viewerId, e) && !ghostWolf) return 'stealth';
  if (ghostWolf) return 'wolf';
  if (veilbound === 'march') return 'march';
  if (e.templateId.startsWith('vision_') || e.templateId === 'spirit_healer') return 'spirit';
  return null;
}
