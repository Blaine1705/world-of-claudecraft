import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  buildVarkhulCinderOrbsTelegraph,
  buildVarkhulEncounterPrewarmVisual,
  buildVarkhulMakersBrandTelegraph,
  disposeVarkhulEncounterVisuals,
  syncVarkhulEncounterVisuals,
  VARKHUL_BRAND_VISUAL_NAME,
  VARKHUL_CINDER_ORBS_VISUAL_NAME,
} from '../src/render/varkhul_encounter';
import {
  varkhulEncounterBypassesCharacterCulling,
  varkhulEncounterViewVisibleDuringCompile,
} from '../src/render/varkhul_encounter_core';
import {
  VARKHUL_CINDER_ORBS_AURA_ID,
  VARKHUL_MAKERS_BRAND_AURA_ID,
} from '../src/sim/encounters/varkhul';

function player(
  auras: Array<{
    id: string;
    stacks?: number;
    remaining?: number;
    duration?: number;
    value?: number;
    charges?: number;
  }>,
) {
  return {
    kind: 'player',
    templateId: 'warrior',
    castingAbility: null,
    facing: 0.9,
    scale: 1.5,
    auras,
  };
}

describe('Varkhul encounter rendering', () => {
  it('prewarms the permanent fire shader and the enlarged traveling orb before combat', () => {
    const root = buildVarkhulEncounterPrewarmVisual();
    expect(root.getObjectByName('varkhul-cinder-fire')).toBeDefined();
    expect(root.getObjectByName('ground_fire_aoe__disc')).toBeDefined();
    expect(root.getObjectByName('varkhul-cinder-orb-projectile')).toBeDefined();
  });

  it('builds three marked cinder orbs without the removed hammer telegraph', () => {
    const cinderOrbs = buildVarkhulCinderOrbsTelegraph();
    expect(cinderOrbs.userData.actionable).toBe(true);
    expect(cinderOrbs.userData.radius).toBe(3.5);
    expect(cinderOrbs.getObjectByName('varkhulCinderOrbsCrown')?.children).toHaveLength(3);
    expect(cinderOrbs.getObjectByName('varkhulCinderOrbCore')).toBeDefined();
    expect(cinderOrbs.getObjectByName('varkhulMarkedHammersHammer')).toBeUndefined();
    const ring = cinderOrbs.getObjectByName('varkhulCinderOrbsRing') as THREE.Mesh;
    const positions = ring.geometry.getAttribute('position');
    let outerRadius = 0;
    for (let index = 0; index < positions.count; index++) {
      outerRadius = Math.max(outerRadius, Math.hypot(positions.getX(index), positions.getZ(index)));
    }
    expect(outerRadius).toBeCloseTo(3.5, 5);
  });

  it('keeps the cinder crown visible above its player for the four-second spread mark', () => {
    const group = new THREE.Group();
    group.rotation.y = 0.9;
    const marked = player([{ id: VARKHUL_CINDER_ORBS_AURA_ID, remaining: 4, duration: 4 }]);
    syncVarkhulEncounterVisuals(group, marked);
    const visual = group.getObjectByName(VARKHUL_CINDER_ORBS_VISUAL_NAME) as THREE.Group;
    expect(visual.visible).toBe(true);
    expect(visual.scale.x).toBeCloseTo(1 / 1.5);
    expect(visual.getObjectByName('varkhulCinderOrbsCrown')).toBeDefined();
    expect(varkhulEncounterBypassesCharacterCulling(marked)).toBe(true);
    expect(varkhulEncounterViewVisibleDuringCompile(marked, true)).toBe(true);
  });

  it('freezes the cinder crown orbit when reduced motion is enabled', () => {
    const group = new THREE.Group();
    const marked = player([{ id: VARKHUL_CINDER_ORBS_AURA_ID, remaining: 2, duration: 4 }]);
    syncVarkhulEncounterVisuals(group, marked, true);
    const crown = group.getObjectByName('varkhulCinderOrbsCrown') as THREE.Group;
    expect(crown.rotation.y).toBe(0);
    expect(crown.getObjectByName('varkhulCinderOrb0')?.position.y).toBeCloseTo(2.65);
  });

  it('shows one ring per Maker brand stack and clears it with the aura', () => {
    const group = new THREE.Group();
    const branded = player([{ id: VARKHUL_MAKERS_BRAND_AURA_ID, stacks: 2 }]);
    syncVarkhulEncounterVisuals(group, branded);
    const visual = group.getObjectByName(VARKHUL_BRAND_VISUAL_NAME) as THREE.Group;
    expect(visual.visible).toBe(true);
    expect(visual.getObjectByName('varkhulMakersBrandStack1')?.visible).toBe(true);
    expect(visual.getObjectByName('varkhulMakersBrandStack2')?.visible).toBe(true);
    expect(visual.getObjectByName('varkhulMakersBrandStack3')?.visible).toBe(false);
    syncVarkhulEncounterVisuals(group, player([]));
    expect(visual.visible).toBe(false);
  });

  it('does not draw the old red Anvil lane cross during the raidwide channel', () => {
    const group = new THREE.Group();
    const boss = {
      kind: 'mob',
      templateId: 'varkhul_forgefather_of_the_last_flame',
      castingAbility: "Anvil's Decree",
      castRemaining: 5,
      castTotal: 6,
      scale: 2,
      auras: [],
    };
    syncVarkhulEncounterVisuals(group, boss);

    expect(group.getObjectByName('varkhulAnvilDecreeTelegraph')).toBeUndefined();
  });

  it('renders the large frontal at its exact range and keeps the boss anchor alive', () => {
    const group = new THREE.Group();
    const boss = {
      kind: 'mob',
      templateId: 'varkhul_forgefather_of_the_last_flame',
      castingAbility: "Forgefather's Sweep",
      castRemaining: 1.25,
      castTotal: 2.5,
      scale: 2,
      auras: [],
    };
    syncVarkhulEncounterVisuals(group, boss, 0.1);
    const visual = group.getObjectByName('varkhulForgefatherSweepTelegraph') as THREE.Group;
    expect(visual.visible).toBe(true);
    expect(visual.userData).toMatchObject({ actionable: true, radius: 42 });
    expect(visual.userData.halfAngle).toBeCloseTo((Math.PI * 7) / 18, 8);
    expect(visual.scale.x).toBeCloseTo(0.5);
    const fill = visual.getObjectByName('varkhulFrontalFill') as THREE.Mesh;
    fill.geometry.computeBoundingBox();
    expect(fill.geometry.boundingBox?.min.z).toBeGreaterThanOrEqual(-0.001);
    expect(fill.geometry.boundingBox?.max.z).toBeCloseTo(42, 5);
    for (const [name, expectedAngle] of [
      ['varkhulFrontalEdgeLeft', (-Math.PI * 7) / 18],
      ['varkhulFrontalEdgeRight', (Math.PI * 7) / 18],
    ] as const) {
      const edge = visual.getObjectByName(name) as THREE.Mesh;
      const angle = Number(edge.userData.angle);
      expect(angle).toBeCloseTo(expectedAngle, 8);
      expect(edge.rotation.y).toBeCloseTo(angle, 6);
      expect(edge.position.x).toBeCloseTo(Math.sin(angle) * 21, 6);
      expect(edge.position.z).toBeCloseTo(Math.cos(angle) * 21, 6);
    }
    expect(varkhulEncounterBypassesCharacterCulling(boss)).toBe(true);
  });

  it('does not resurrect removed Assembly player marks', () => {
    const group = new THREE.Group();
    const marked = player([
      { id: 'varkhul_assembly_fixate' },
      { id: 'varkhul_molten_core' },
      { id: 'varkhul_forge_link', stacks: 10, value: 0 },
    ]);
    syncVarkhulEncounterVisuals(group, marked, 0.1);
    expect(group.getObjectByName('varkhulAssemblyFixateEye')).toBeUndefined();
    expect(group.getObjectByName('varkhulMoltenCoreCarry')).toBeUndefined();
    expect(group.getObjectByName('varkhulAssemblyLinkSymbol')).toBeUndefined();
    expect(varkhulEncounterBypassesCharacterCulling(marked)).toBe(false);
  });

  it('disposes all lazily attached Varkhul visuals before a rig is pooled', () => {
    const group = new THREE.Group();
    group.add(buildVarkhulCinderOrbsTelegraph(), buildVarkhulMakersBrandTelegraph());
    disposeVarkhulEncounterVisuals(group);
    expect(group.getObjectByName(VARKHUL_CINDER_ORBS_VISUAL_NAME)).toBeUndefined();
    expect(group.getObjectByName(VARKHUL_BRAND_VISUAL_NAME)).toBeUndefined();
  });
});
