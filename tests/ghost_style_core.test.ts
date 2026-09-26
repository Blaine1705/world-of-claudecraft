// Which translucent look a character wears (src/render/ghost_style_core.ts):
// every ethereal read is the spirit veil in its user's palette; a living
// stealther keeps its transparent twin.

import { describe, expect, it } from 'vitest';
import { characterGhostLook } from '../src/render/ghost_style_core';
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

const stealth = { auras: [{ kind: 'stealth', id: 'stealth' }] } as unknown as Partial<Entity>;

describe('characterGhostLook', () => {
  it('veils a released spirit in the released-spirit palette, whatever else it carries', () => {
    expect(characterGhostLook(VIEWER, entity({ ghost: true }), false, 'none')).toBe('spirit');
    // A dead stealther is a spirit first.
    expect(characterGhostLook(VIEWER, entity({ ghost: true, ...stealth }), false, 'none')).toBe(
      'spirit',
    );
    expect(characterGhostLook(VIEWER, entity({ ghost: true }), true, 'march')).toBe('spirit');
  });

  it('veils the Pale Keeper and the quest visions exactly like a released spirit', () => {
    for (const templateId of [
      'vision_aldren_warrior',
      'vision_malric_mage',
      'vision_deathstalker_voss',
    ]) {
      expect(
        characterGhostLook(VIEWER, entity({ kind: 'mob', templateId }), false, 'none'),
        templateId,
      ).toBe('spirit');
    }
    expect(
      characterGhostLook(
        VIEWER,
        entity({ kind: 'npc', templateId: 'spirit_healer' }),
        false,
        'none',
      ),
    ).toBe('spirit');
  });

  it('gives Ghost Wolf and the Veilbound March their own palettes', () => {
    expect(characterGhostLook(VIEWER, entity(), true, 'none')).toBe('wolf');
    // A stealthed Ghost Wolf stays a wolf.
    expect(characterGhostLook(VIEWER, entity(stealth), true, 'none')).toBe('wolf');
    expect(characterGhostLook(VIEWER, entity(), true, 'march')).toBe('wolf');
    expect(characterGhostLook(VIEWER, entity(), false, 'march')).toBe('march');
  });

  it('keeps the stealth twin for a living stealther', () => {
    expect(characterGhostLook(VIEWER, entity(stealth), false, 'none')).toBe('stealth');
    expect(characterGhostLook(VIEWER, entity(stealth), false, 'march')).toBe('stealth');
  });

  it('leaves everyone else opaque', () => {
    expect(characterGhostLook(VIEWER, entity(), false, 'none')).toBeNull();
    expect(characterGhostLook(VIEWER, entity(), false, 'mark')).toBeNull();
    expect(
      characterGhostLook(VIEWER, entity({ kind: 'mob', templateId: 'wolf' }), false, 'none'),
    ).toBeNull();
    // a stealth aura on a mob is never drawn as stealth (stealth.ts)
    expect(
      characterGhostLook(
        VIEWER,
        entity({ kind: 'mob', templateId: 'wolf', ...stealth }),
        false,
        'none',
      ),
    ).toBeNull();
  });
});
