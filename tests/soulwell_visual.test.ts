import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { objectDisplayName } from '../src/render/entity_labels';
import { buildSoulwell, disposeSoulwellVisual, SOULWELL_VISUAL_SPEC } from '../src/render/soulwell';
import { createGroundObject } from '../src/sim/entity';
import { setLanguage } from '../src/ui/i18n';

describe('Soulwell presentation', () => {
  it('keeps the authored three-pillar, three-stone silhouette', () => {
    expect(SOULWELL_VISUAL_SPEC).toMatchObject({
      pillarCount: 3,
      stoneCount: 3,
      footprintRadius: 1.45,
    });
    const { group } = buildSoulwell(42);
    expect(group.name).toBe('soulwell_42');
    expect(group.userData.soulwellStones).toBeInstanceOf(THREE.Group);
    expect(group.userData.soulwellStones.children).toHaveLength(3);
  });

  it('disposes every private material exactly once on interest churn', () => {
    const { group } = buildSoulwell(43);
    const materials = new Set<THREE.Material>();
    group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of meshMaterials) materials.add(material);
    });
    const disposals = [...materials].map((material) => vi.spyOn(material, 'dispose'));

    disposeSoulwellVisual(group);
    disposeSoulwellVisual(group);

    expect(disposals.length).toBeGreaterThan(0);
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('uses the localized ability name for the world-object nameplate', () => {
    setLanguage('en');
    const well = createGroundObject(44, 'soulwell', 'Soulwell', { x: 0, y: 0, z: 0 });
    well.templateId = 'soulwell';
    expect(objectDisplayName(well)).toBe('Soulwell');
  });
});
