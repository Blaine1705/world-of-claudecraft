// Vaelgrath's on-screen presence: how big he renders, how far off the ground he
// hovers, the idle air-drift that keeps him from hanging in one plane, and the
// violet palette his Cinderfall rock falls in. These are look-and-feel numbers a
// refactor can silently undo, and none of them are covered by the fight tests.

import { describe, expect, it } from 'vitest';
import { VISUALS } from '../src/render/characters/manifest';
import {
  METEOR_ARCANE,
  METEOR_FIRE,
  type MeteorPalette,
  meteorPaletteFor,
} from '../src/render/mage_ground_fx';
import { MOBS } from '../src/sim/data';
import { EMBERWAKE_MOUTH_FORWARD_PER_SCALE } from '../src/sim/types';

const BOSS_ID = 'emberwake_vaelgrath';
const RIG = 'mob_dragon_emberwake';

describe('Vaelgrath size and hover', () => {
  it('renders at 0.6x the original colossus (owner call 2026-07-27)', () => {
    // He shipped at scale 6 (~18yd tall on manifest height 3.0) and was cut to
    // 0.6x that. Pinned as a product so a later height tweak has to be a
    // deliberate decision rather than a silent drift.
    expect(MOBS[BOSS_ID].scale).toBeCloseTo(3.6, 5);
    expect(VISUALS[RIG].height * MOBS[BOSS_ID].scale).toBeCloseTo(10.8, 5);
  });

  it('hovers about 0.9yd off the ground: half the gap he shipped with', () => {
    // `hover` is MODEL space and multiplies by the template scale, so the world
    // gap is the product. The old dragon sat at 1.8yd (0.3 x 6).
    const gapYards = (VISUALS[RIG].hover ?? 0) * MOBS[BOSS_ID].scale;
    expect(gapYards).toBeCloseTo(0.9, 5);
  });

  it('declares an idle air-drift so he never sits locked in one plane', () => {
    const visual = VISUALS[RIG];
    expect(visual).toBeDefined();
    if (!visual) throw new Error('expected the Emberwake visual definition');
    expect(visual).toHaveProperty('hoverDrift');
    const drift: unknown = Reflect.get(visual, 'hoverDrift');
    expect(drift).toBeTruthy();
    if (
      typeof drift !== 'object' ||
      drift === null ||
      !('rise' in drift) ||
      typeof drift.rise !== 'number' ||
      !('sway' in drift) ||
      typeof drift.sway !== 'number' ||
      !('speed' in drift) ||
      typeof drift.speed !== 'number'
    ) {
      throw new Error('expected numeric rise, sway and speed in Emberwake hoverDrift');
    }
    // Slight, not a barrel roll: the drift must stay well inside his own body
    // so it reads as breathing rather than teleporting.
    const scale = MOBS[BOSS_ID].scale;
    expect(drift.rise * scale).toBeGreaterThan(0.2);
    expect(drift.rise * scale).toBeLessThan(2);
    expect(drift.sway * scale).toBeGreaterThan(0.1);
    expect(drift.sway * scale).toBeLessThan(2);
    expect(drift.speed).toBeGreaterThan(0);
    // A drift as tall as the hover gap would dip him through the ground on the
    // downstroke, which is exactly the "clips into terrain" bug.
    expect(drift.rise).toBeLessThan(VISUALS[RIG].hover ?? 0);
  });

  it('keeps phasing through props while still riding the terrain', () => {
    // A flying mountain must never wedge on a hut. The mover's phasing branch
    // (Sim.moveToward) is forced on by this flag and re-seats y on groundHeight
    // every step, which is what "clips objects, collides with terrain" means.
    expect(MOBS[BOSS_ID].phasesThroughObstacles).toBe(true);
  });

  it('keeps his jaw offset derived from scale, so the resize moved it too', () => {
    // The head leads the origin per POINT OF SCALE; shrinking him must shrink
    // the beam origin and his melee reach with him, not leave the mouth point
    // hanging 40yd out in front of a much smaller dragon.
    const jaw = MOBS[BOSS_ID].scale * EMBERWAKE_MOUTH_FORWARD_PER_SCALE;
    expect(jaw).toBeCloseTo(18.72, 2);
  });
});

describe('meteor palettes', () => {
  const keys = [
    'rockEmissive',
    'magma',
    'corona',
    'trailOuter',
    'trailInner',
    'embers',
    'telegraphBoundary',
    'telegraphInner',
    'telegraphVein',
    'telegraphFlame',
  ] as const satisfies readonly (keyof MeteorPalette)[];

  it('falls arcane rocks violet and every other school in the old fire set', () => {
    expect(meteorPaletteFor('arcane')).toBe(METEOR_ARCANE);
    expect(meteorPaletteFor('fire')).toBe(METEOR_FIRE);
    // The Mage's Meteor emits no school-specific palette request; unknown and
    // absent both have to keep the shipped fire look.
    expect(meteorPaletteFor(undefined)).toBe(METEOR_FIRE);
    expect(meteorPaletteFor('frost')).toBe(METEOR_FIRE);
  });

  it('recolors every part of the rock, not just the halo', () => {
    for (const key of keys) {
      expect(METEOR_ARCANE[key], `${key} still wears the fire colour`).not.toBe(METEOR_FIRE[key]);
    }
  });

  it('keeps the arcane set actually violet: blue above red on every part', () => {
    for (const key of keys) {
      const value = METEOR_ARCANE[key];
      const red = (value >> 16) & 0xff;
      const blue = value & 0xff;
      expect(blue, `${key} reads warm, not violet`).toBeGreaterThan(red);
    }
  });
});
