// The Wildheart Basin interior owns NO census-keyed light: its gold afternoon
// is the `wildheartBasin` state of interior_light_rig.ts, re-grading the
// constructor's one sun/hemi pair (the bespoke caldera field it replaced once
// added a fill pair to the world scene, which changed numDirLights /
// numHemiLights and, interiors never being removed, relinked every material
// drawn after a Palm Reach visit: the 2026-09-12 hunt). The basin carries its
// own sky dome, so the world's dome hides there like every open-air field's.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  applyInteriorLightRig,
  interiorKeyLightDirection,
  isOpenAirFogState,
  WILDHEART_KEY_LIGHT_DIRECTION,
} from '../src/render/interior_light_rig';
import { BASIN_SUN_DIRECTION } from '../src/render/wildheart_basin/basin_plan_core';

describe('the Wildheart Basin interior and the light census', () => {
  // That the basin's render modules construct no census-keyed light is pinned
  // by tests/render_light_census_pin.test.ts (none of them is allowlisted).
  it('carries the afternoon sun in the rig grade of the one sun/hemi pair', () => {
    const sun = new THREE.DirectionalLight(0xffffff, 1);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
    const scene = new THREE.Scene();
    const targets = {
      sun,
      hemi,
      scene,
      rim: { value: 1 },
      rimColor: { value: new THREE.Color() },
    };
    const outdoor = { sunIntensity: 1.2, hemiIntensity: 0.4, envIntensity: 0.3 };
    applyInteriorLightRig('wildheartBasin', targets, outdoor);
    // A bright warm key over a green-gold sky bounce and a mossy ground bounce.
    expect(sun.intensity).toBe(2.55);
    expect(hemi.intensity).toBe(1.3);
    expect(scene.environmentIntensity).toBe(0.42);
    expect(sun.color.getHex()).toBe(0xffd99a);
    expect(hemi.color.getHex()).toBe(0xd2e2b4);
    expect(hemi.groundColor.getHex()).toBe(0x4c5a2c);
    applyInteriorLightRig('outdoor', targets, outdoor);
    expect(sun.intensity).toBe(outdoor.sunIntensity);
    expect(hemi.intensity).toBe(outdoor.hemiIntensity);
  });

  it('aims the key light from the basin sun, in the basin only', () => {
    const out = new THREE.Vector3(0, 1, 0);
    expect(interiorKeyLightDirection('outdoor', out)).toBe(false);
    expect(out.toArray()).toEqual([0, 1, 0]);
    expect(interiorKeyLightDirection('wildheartBasin', out)).toBe(true);
    expect(out.equals(WILDHEART_KEY_LIGHT_DIRECTION)).toBe(true);
    expect(WILDHEART_KEY_LIGHT_DIRECTION.toArray()).toEqual([...BASIN_SUN_DIRECTION]);
    // Low afternoon sun in the south-west, behind the Idol Maw: the party
    // looks north into the caldera with the sun at its back (the rainbows).
    expect(WILDHEART_KEY_LIGHT_DIRECTION.length()).toBeCloseTo(1, 6);
    expect(WILDHEART_KEY_LIGHT_DIRECTION.y).toBeGreaterThan(0.3);
    expect(WILDHEART_KEY_LIGHT_DIRECTION.y).toBeLessThan(0.7);
    expect(WILDHEART_KEY_LIGHT_DIRECTION.z).toBeLessThan(-0.5);
    expect(WILDHEART_KEY_LIGHT_DIRECTION.x).toBeLessThan(0);
  });

  it('hides the world dome under its own sky', () => {
    expect(isOpenAirFogState('wildheartBasin')).toBe(false);
  });
});
