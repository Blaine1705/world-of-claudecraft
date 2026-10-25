// The Smith's Heart raid's Breath vein (phase 2G, docs/design/raid/smith_heart.md
// section 5.14): its storm-scoured floor, its Blender kit and its plan.

import { describe, expect, it } from 'vitest';
import {
  fieldFamilyUvScale,
  fieldGroundFamily,
  topColor,
} from '../src/render/authored_field/field_mesh_core';
import { SMITH_HEART_FIELD } from '../src/sim/content/smith_heart_layout';

const F = SMITH_HEART_FIELD;

/** Every walked floor of the Breath, its mouth to the Cornice. */
const BREATH_FLOORS = [
  'breath_mouth',
  'breath_b1',
  'breath_chimney',
  'breath_b2',
  'wind_bridge',
  'breath_b3',
  'cornice_climb',
  'storm_cornice',
];

describe("the Breath's scoured floor", () => {
  it('lays every Breath floor in storm-scoured granite, its own family and tile', () => {
    expect(fieldGroundFamily('scoured')).toBe('scoured');
    expect(fieldFamilyUvScale('scoured')).toBeCloseTo(1 / 14, 9);
    for (const id of BREATH_FLOORS)
      expect(F.surfaces.find((s) => s.id === id)?.ground, id).toBe('scoured');
  });

  it('paints the bedrock pale and cool, in drifts, never one flat colour', () => {
    const lum: number[] = [];
    let cool = 0;
    let n = 0;
    for (let x = -120; x < 40; x += 7)
      for (let z = 100; z < 230; z += 11) {
        const [r, g, b] = topColor('scoured', x, z, true);
        lum.push(0.3 * r + 0.59 * g + 0.11 * b);
        if (b >= r) cool++;
        n++;
      }
    expect(Math.max(...lum) / Math.min(...lum)).toBeGreaterThan(1.25);
    // Cool on the whole (the storm's granite, never the quarry's warm dust).
    expect(cool / n).toBeGreaterThan(0.7);
    // Pale: a value over the quarry's cut bedrock on average.
    const mean = lum.reduce((a, b) => a + b, 0) / lum.length;
    let quarry = 0;
    for (let x = -120; x < 40; x += 7)
      for (let z = 100; z < 230; z += 11) {
        const [r, g, b] = topColor('quarry', x, z, true);
        quarry += 0.3 * r + 0.59 * g + 0.11 * b;
      }
    expect(mean).toBeGreaterThan(quarry / lum.length);
  });
});
