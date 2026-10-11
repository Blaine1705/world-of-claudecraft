import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { templeTelegraphSpecs } from '../src/render/drowned_temple/temple_fx_core';
import { TempleGuardianFx } from '../src/render/drowned_temple/temple_guardian_fx';
import {
  GUARDIAN_VISUAL,
  guardianCharge,
  guardianRippleRadius,
  templeGuardianCue,
} from '../src/render/drowned_temple/temple_guardian_fx_core';
import { TELEGRAPH_THREAT_COLORS } from '../src/render/floor_telegraph/telegraph_look_core';
import { MOBS } from '../src/sim/data';
import {
  TEMPLE_SKEWERING_TRIDENT,
  TEMPLE_TIDEMARKED_SURGE,
} from '../src/sim/mob/trash_kit/temple_cast_ids';
import type { SimEvent } from '../src/sim/types';
import type { IWorld } from '../src/world_api';

function setup(templateId = 'temple_tidemarked_trident', rich = true, calm = false) {
  const ability =
    templateId === 'temple_tidemarked_trident' ? TEMPLE_SKEWERING_TRIDENT : TEMPLE_TIDEMARKED_SURGE;
  const source = {
    id: 1,
    kind: 'mob',
    templateId,
    dead: false,
    castingAbility: ability as string | null,
    castRemaining: 1,
    castTotal: 2,
    facing: 0,
    pos: { x: 10, y: 0, z: 20 },
  };
  const world = { entities: new Map([[1, source]]) } as unknown as IWorld;
  const parent = new THREE.Group();
  const fx = new TempleGuardianFx(
    parent,
    world,
    () => 3,
    rich,
    () => calm,
  );
  const event = {
    type: 'spellfx',
    sourceId: 1,
    targetId: 1,
    ability,
    school: 'frost',
    fx: templateId === 'temple_tidemarked_trident' ? 'heavyBolt' : 'nova',
  } as SimEvent;
  const root = parent.getObjectByName('temple-guardian-fx');
  if (!root) throw new Error('missing guardian root');
  return { source, fx, parent, root, event };
}

describe('guardian floor cues use the live damage footprints', () => {
  it('anchors energy to the revised chest after manifest and template scaling', () => {
    for (const templateId of ['temple_tidemarked_trident', 'temple_tidemarked_tide']) {
      const visual = VISUALS[visualKeyFor({ kind: 'mob', templateId } as never)];
      const height = (visual.height ?? 0) * (MOBS[templateId].scale ?? 1);
      expect(GUARDIAN_VISUAL.height).toBeCloseTo(height, 6);
      expect(GUARDIAN_VISUAL.chest).toBeCloseTo(((2.29 - 0.04) * height) / 4.170002, 6);
      expect(GUARDIAN_VISUAL.chest).toBeGreaterThan(3.2);
      expect(GUARDIAN_VISUAL.chest).toBeLessThan(3.4);
    }
  });
  it('shares the trident lane and exposes the interruptible surge radius', () => {
    const specs = templeTelegraphSpecs();
    const line = MOBS.temple_tidemarked_trident.trashKit?.line;
    if (!line) throw new Error('missing guardian line');
    expect(specs[TEMPLE_SKEWERING_TRIDENT].range).toBe(line.length);
    expect(specs[TEMPLE_SKEWERING_TRIDENT].halfWidth).toBe(line.halfWidth);
    expect(specs[TEMPLE_TIDEMARKED_SURGE].shape).toBe('ring');
    expect(specs[TEMPLE_TIDEMARKED_SURGE].range).toBe(
      MOBS.temple_tidemarked_tide.trashKit?.nova?.radius,
    );
    expect(specs[TEMPLE_TIDEMARKED_SURGE].color).toBe(TELEGRAPH_THREAT_COLORS.interrupt);
  });

  it('does not claim the existing Templeguard using the same ability', () => {
    expect(templeGuardianCue('drowned_templeguard', TEMPLE_SKEWERING_TRIDENT)).toBeNull();
    expect(templeGuardianCue('temple_tidemarked_tide', TEMPLE_SKEWERING_TRIDENT)).toBeNull();
    expect(guardianCharge(2, 2)).toBe(0);
    expect(guardianCharge(0, 2)).toBe(1);
    expect(guardianCharge(0, 0)).toBe(0);
  });
});

describe('bounded guardian presentation under the TempleFx gate', () => {
  it.each([true, false])('shows the charge and releases it on interrupt, rich=%s', (rich) => {
    const { fx, root, source } = setup('temple_tidemarked_trident', rich);
    expect(root.visible).toBe(true); // available for the compile walk
    fx.markGated();
    fx.observeCaster(source);
    fx.update(0.1);
    expect(root.visible).toBe(true);
    expect(root.children[0].scale.x).toBe(1);
    expect(root.getObjectByName('guardian-trident')?.visible).toBe(true);
    source.castingAbility = null;
    fx.update(0.01);
    expect(root.visible).toBe(false);
    expect(root.children[0].scale.x).toBeLessThan(0.001);
    fx.dispose();
    expect(root.parent).toBeNull();
  });

  it('claims the impact, reuses the pool, and fades it to idle without a cast bar', () => {
    const { fx, root, source, event } = setup();
    fx.markGated();
    const allocated = root.getObjectsByProperty('isMesh', true);
    for (let i = 0; i < 8; i++) {
      expect(fx.handleEvent(event)).toBe(true);
      source.castingAbility = null;
      fx.update(0.1);
      expect(root.visible).toBe(true);
      fx.update(0.6);
      expect(root.visible).toBe(false);
    }
    expect(root.getObjectsByProperty('isMesh', true)).toEqual(allocated);
    fx.dispose();
  });

  it('reduced motion fixes the release ring at its radius and hides gold particles', () => {
    const { fx, root, source, event } = setup('temple_tidemarked_tide', true, true);
    fx.markGated();
    fx.handleEvent(event);
    source.castingAbility = null;
    fx.update(0.1);
    expect(root.getObjectByName('guardian-wave')?.scale.x).toBe(8);
    expect(root.getObjectByName('guardian-trident')?.visible).toBe(false);
    expect(root.children[0].children.find((c) => c instanceof THREE.Points)?.visible).toBe(false);
    expect(guardianRippleRadius(0.1, 8, true)).toBe(guardianRippleRadius(0.5, 8, true));
    fx.dispose();
  });
});
