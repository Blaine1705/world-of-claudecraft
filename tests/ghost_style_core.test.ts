// Which translucent treatment a character wears (src/render/ghost_style_core.ts):
// only a released spirit takes the spirit veil; every other ethereal read keeps
// its transparent twin exactly as before the veil.

import { describe, expect, it } from 'vitest';
import { characterGhostStyle } from '../src/render/ghost_style_core';
import type { Entity } from '../src/sim/types';

const VIEWER = 1;

function entity(over: Partial<Entity> = {}): Entity {
  return {
    id: 7,
    kind: 'player',
    templateId: 'player',
    ghost: false,
    auras: [],
    ...over,
  } as unknown as Entity;
}

const stealth = { auras: [{ kind: 'stealth', id: 'duskveil' }] } as unknown as Partial<Entity>;

describe('characterGhostStyle', () => {
  it('veils a released spirit, whatever else it carries', () => {
    expect(characterGhostStyle(VIEWER, entity({ ghost: true }), false, 'none')).toBe('veil');
    // A dead stealther is a spirit first.
    expect(characterGhostStyle(VIEWER, entity({ ghost: true, ...stealth }), false, 'none')).toBe(
      'veil',
    );
  });

  it('keeps the stealth fade for a living stealther', () => {
    expect(characterGhostStyle(VIEWER, entity(stealth), false, 'none')).toBe('stealth');
  });

  it('keeps the thin spirit twin for Ghost Wolf, the visions, the angel and the march', () => {
    expect(characterGhostStyle(VIEWER, entity(), true, 'none')).toBe('spirit');
    expect(characterGhostStyle(VIEWER, entity(stealth), true, 'none')).toBe('spirit');
    for (const templateId of ['vision_aldren_warrior', 'vision_malric_mage', 'spirit_healer']) {
      expect(
        characterGhostStyle(VIEWER, entity({ kind: 'mob', templateId }), false, 'none'),
        templateId,
      ).toBe('spirit');
    }
    expect(characterGhostStyle(VIEWER, entity(), false, 'march')).toBe('spirit');
  });

  it('leaves everyone else opaque', () => {
    expect(characterGhostStyle(VIEWER, entity(), false, 'none')).toBeNull();
    expect(characterGhostStyle(VIEWER, entity(), false, 'mark')).toBeNull();
    expect(
      characterGhostStyle(VIEWER, entity({ kind: 'mob', templateId: 'wolf' }), false, 'none'),
    ).toBeNull();
  });
});
