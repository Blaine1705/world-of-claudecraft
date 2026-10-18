// Thatchbound's visual plan (src/render/thatchbound_fx_core.ts): the strings hang from a
// bar above the puppet down to its body, the eyes sit at its head facing forward, the
// read never fades while it is held, and the ids match the sim's.
import { describe, expect, it } from 'vitest';
import {
  BAR_HEIGHT,
  CROW_PUPPET_AURA,
  castReach,
  eyeSize,
  PUPPET_ABILITY,
  PUPPET_AURA_IDS,
  puppetBody,
  puppetEyes,
  puppetStrings,
  STRAWLING_PUPPET_AURA,
  shockwave,
  stringGlow,
  swirlRate,
} from '../src/render/thatchbound_fx_core';
import {
  THATCHBOUND_AURA_IDS,
  THATCHGRIN_PUPPET_ABILITY,
} from '../src/sim/content/gourdlight_eve_scarecrow';

describe('thatchbound fx core', () => {
  it('names the same ids and cue the sim emits', () => {
    expect([...PUPPET_AURA_IDS].sort()).toEqual([...THATCHBOUND_AURA_IDS].sort());
    expect(PUPPET_ABILITY).toBe(THATCHGRIN_PUPPET_ABILITY);
  });

  it('hangs four strings from the bar high above down to the body', () => {
    const pos = { x: 10, y: 2, z: -4 };
    for (const id of [STRAWLING_PUPPET_AURA, CROW_PUPPET_AURA]) {
      const body = puppetBody(id);
      const strings = puppetStrings(pos, 0.7, body, 3.2, 1.1);
      expect(strings).toHaveLength(4);
      for (const [top, bottom] of strings) {
        expect(top.y).toBeGreaterThan(pos.y + BAR_HEIGHT - 0.5);
        expect(bottom.y).toBeLessThanOrEqual(pos.y + body.head + 0.2);
        expect(Math.hypot(bottom.x - pos.x, bottom.z - pos.z)).toBeLessThan(1.2);
      }
    }
  });

  it('puts the eyes in front of the head, a hand apart', () => {
    const pos = { x: 0, y: 0, z: 0 };
    const body = puppetBody(STRAWLING_PUPPET_AURA);
    const [a, b] = puppetEyes(pos, 0, body);
    // facing 0 looks along +z
    expect(a.z).toBeGreaterThan(0);
    expect(b.z).toBeGreaterThan(0);
    expect(Math.abs(a.x - b.x)).toBeGreaterThan(0.1);
    expect(eyeSize(1, 0)).toBeGreaterThan(0.2);
  });

  it('never fades the read while held; only the swirl thins under reduced motion', () => {
    for (let t = 0.3; t < 10; t += 0.7) expect(stringGlow(t, t, 0.4)).toBeGreaterThan(0.5);
    expect(swirlRate(true)).toBeGreaterThan(0);
    expect(swirlRate(true)).toBeLessThan(swirlRate(false));
  });

  it('reaches the cast strings out over the bar and rolls the shockwave out and away', () => {
    expect(castReach(0, 2.5)).toBe(0);
    expect(castReach(2.5, 2.5)).toBe(1);
    expect(shockwave(0).glow).toBe(1);
    expect(shockwave(10).glow).toBe(0);
    expect(shockwave(0.8).radius).toBeGreaterThan(shockwave(0.1).radius);
  });
});
