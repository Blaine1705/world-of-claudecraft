import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PaladinConsecrationVisuals } from '../src/render/paladin_consecration_visual';

describe('Paladin Consecration ground visual', () => {
  it('builds terrain-draped holy rings, glyphs, glow, and moving motes for the full zone', () => {
    const scene = new THREE.Scene();
    const groundFx = new PaladinConsecrationVisuals(scene, () => 2);

    groundFx.sync([
      {
        id: 'consecration:1:20',
        x: 4,
        z: 7,
        radius: 8,
        duration: 9,
        remaining: 4,
      },
    ]);

    const visual = scene.getObjectByName('paladin-consecration');
    expect(visual).toBeTruthy();
    expect(visual?.getObjectByName('paladin-consecration-ground-glow')).toBeTruthy();
    expect(visual?.getObjectByName('paladin-consecration-outer-ring')).toBeTruthy();
    expect(visual?.getObjectByName('paladin-consecration-middle-ring')).toBeTruthy();
    expect(visual?.getObjectByName('paladin-consecration-heart-ring')).toBeTruthy();
    expect(visual?.getObjectByName('paladin-consecration-glyph-7')).toBeTruthy();
    const motes = visual?.getObjectByName('paladin-consecration-motes');
    expect(motes?.children).toHaveLength(12);
    const rotation = motes?.rotation.y ?? 0;

    groundFx.update(1);
    expect(motes?.rotation.y).toBeLessThan(rotation);
    expect(scene.getObjectByName('paladin-consecration')).toBeTruthy();

    groundFx.update(4);
    expect(scene.getObjectByName('paladin-consecration')).toBeUndefined();
  });
});
