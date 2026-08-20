import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  buildVarkhulAnvilTelegraph,
  buildVarkhulMakersBrandTelegraph,
  buildVarkhulMarkedHammersTelegraph,
  disposeVarkhulEncounterVisuals,
  syncVarkhulEncounterVisuals,
  VARKHUL_ANVIL_VISUAL_NAME,
  VARKHUL_BRAND_VISUAL_NAME,
  VARKHUL_MARKED_HAMMERS_VISUAL_NAME,
} from '../src/render/varkhul_encounter';
import {
  varkhulEncounterBypassesCharacterCulling,
  varkhulEncounterViewVisibleDuringCompile,
  varkhulEncounterVisualPlan,
} from '../src/render/varkhul_encounter_core';
import {
  VARKHUL_ANVIL_LANE_HALF_WIDTH,
  VARKHUL_ANVIL_LANE_INNER_RADIUS,
  VARKHUL_ANVIL_LANE_RANGE,
  VARKHUL_ANVILS_DECREE_CAST_ID,
  VARKHUL_MAKERS_BRAND_AURA_ID,
  VARKHUL_MARKED_HAMMERS_AURA_ID,
} from '../src/sim/encounters/varkhul';

function player(
  auras: Array<{ id: string; stacks?: number; remaining?: number; duration?: number }>,
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
  it('builds an enormous marked hammer and keeps Anvil lane geometry authoritative', () => {
    const markedHammers = buildVarkhulMarkedHammersTelegraph();
    const anvil = buildVarkhulAnvilTelegraph();
    expect(markedHammers.userData.actionable).toBe(true);
    const hammer = markedHammers.getObjectByName('varkhulMarkedHammersHammer') as THREE.Group;
    const head = hammer.children.find(
      (child) => child instanceof THREE.Mesh && child.geometry instanceof THREE.BoxGeometry,
    ) as THREE.Mesh<THREE.BoxGeometry>;
    expect(head.geometry.parameters).toMatchObject({ width: 3.4, height: 1.15, depth: 1.35 });
    expect(anvil.userData).toMatchObject({
      range: VARKHUL_ANVIL_LANE_RANGE,
      halfWidth: VARKHUL_ANVIL_LANE_HALF_WIDTH,
      innerRadius: VARKHUL_ANVIL_LANE_INNER_RADIUS,
      actionable: true,
    });
    expect(anvil.children).toHaveLength(4);
  });

  it('keeps the marked hammer visible above its player for the four-second placement mark', () => {
    const group = new THREE.Group();
    group.rotation.y = 0.9;
    const marked = player([{ id: VARKHUL_MARKED_HAMMERS_AURA_ID, remaining: 4, duration: 4 }]);
    syncVarkhulEncounterVisuals(group, marked);
    const visual = group.getObjectByName(VARKHUL_MARKED_HAMMERS_VISUAL_NAME) as THREE.Group;
    expect(visual.visible).toBe(true);
    expect(visual.scale.x).toBeCloseTo(1 / 1.5);
    expect(visual.getObjectByName('varkhulMarkedHammersHammer')).toBeDefined();
    expect(varkhulEncounterBypassesCharacterCulling(marked)).toBe(true);
    expect(varkhulEncounterViewVisibleDuringCompile(marked, true)).toBe(true);
  });

  it('freezes the marked hammer sway and spin when reduced motion is enabled', () => {
    const group = new THREE.Group();
    const marked = player([{ id: VARKHUL_MARKED_HAMMERS_AURA_ID, remaining: 2, duration: 4 }]);
    syncVarkhulEncounterVisuals(group, marked, true);
    const hammer = group.getObjectByName('varkhulMarkedHammersHammer') as THREE.Group;
    expect(hammer.position.y).toBeCloseTo(0.15);
    expect(hammer.rotation.y).toBe(0);
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

  it('tracks each Anvil strike facing and warning progress from the boss cast', () => {
    const boss = {
      kind: 'mob',
      templateId: 'varkhul_forgefather_of_the_last_flame',
      castingAbility: VARKHUL_ANVILS_DECREE_CAST_ID,
      castRemaining: 5,
      castTotal: 6,
      facing: 1.2,
      scale: 2,
      auras: [],
    };
    const plan = varkhulEncounterVisualPlan(boss);
    expect(plan.anvilVisible).toBe(true);
    expect(plan.anvilProgress).toBeCloseTo(0.5);
    const group = new THREE.Group();
    group.rotation.y = 0.2;
    syncVarkhulEncounterVisuals(group, boss);
    const visual = group.getObjectByName(VARKHUL_ANVIL_VISUAL_NAME) as THREE.Group;
    expect(visual.rotation.y + group.rotation.y).toBeCloseTo(boss.facing);
    expect(visual.scale.x).toBeCloseTo(0.5);
    expect(varkhulEncounterBypassesCharacterCulling(boss)).toBe(true);
  });

  it('disposes all lazily attached Varkhul visuals before a rig is pooled', () => {
    const group = new THREE.Group();
    group.add(
      buildVarkhulMarkedHammersTelegraph(),
      buildVarkhulAnvilTelegraph(),
      buildVarkhulMakersBrandTelegraph(),
    );
    disposeVarkhulEncounterVisuals(group);
    expect(group.getObjectByName(VARKHUL_MARKED_HAMMERS_VISUAL_NAME)).toBeUndefined();
    expect(group.getObjectByName(VARKHUL_ANVIL_VISUAL_NAME)).toBeUndefined();
    expect(group.getObjectByName(VARKHUL_BRAND_VISUAL_NAME)).toBeUndefined();
  });
});
