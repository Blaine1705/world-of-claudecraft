import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildVarkhulHammerZone, VarkhulHammerVisuals } from '../src/render/varkhul_hammer_visual';
import type { ActiveVarkhulHammerZone } from '../src/sim/varkhul_hammers';

const WARNING: ActiveVarkhulHammerZone = {
  id: '42:hammer:3:1:0',
  sourceId: 42,
  phase: 'warning',
  x: 7,
  z: -5,
  radius: 3,
  duration: 1.25,
  remaining: 1.25,
};

describe('Varkhul Marked Hammers rendering', () => {
  it('draws the exact warning radius and an enormous falling hammer on every tier', () => {
    const group = buildVarkhulHammerZone(WARNING, 2);
    expect(group.userData).toMatchObject({
      actionable: true,
      zoneId: WARNING.id,
      radius: 3,
      phase: 'warning',
    });
    expect(group.position.toArray()).toEqual([7, 2.09, -5]);
    const edge = group.getObjectByName('varkhul-hammer-zone-edge') as THREE.Mesh;
    const positions = edge.geometry.getAttribute('position');
    let maxRadius = 0;
    for (let index = 0; index < positions.count; index++) {
      maxRadius = Math.max(maxRadius, Math.hypot(positions.getX(index), positions.getZ(index)));
    }
    expect(maxRadius).toBeCloseTo(3, 5);
    const hammer = group.getObjectByName('varkhul-falling-hammer') as THREE.Group;
    expect(hammer).toBeDefined();
    expect(hammer.children).toHaveLength(2);
  });

  it('reconciles warning descent and persistent fire by stable authoritative ids', () => {
    const scene = new THREE.Scene();
    const visuals = new VarkhulHammerVisuals(scene, () => 0);
    visuals.sync([WARNING]);
    const warning = scene.getObjectByName('varkhul-hammer-warning') as THREE.Group;
    const hammer = warning.getObjectByName('varkhul-falling-hammer') as THREE.Group;
    const startY = hammer.position.y;
    visuals.sync([{ ...WARNING, remaining: 0.25 }]);
    visuals.update(0.1);
    expect(hammer.position.y).toBeLessThan(startY);

    const fire: ActiveVarkhulHammerZone = {
      ...WARNING,
      id: '42:fire:3:1:0',
      phase: 'fire',
      radius: 2.4,
      duration: 12,
      remaining: 11,
    };
    visuals.sync([fire]);
    expect(scene.getObjectByName('varkhul-hammer-warning')).toBeUndefined();
    const fireGroup = scene.getObjectByName('varkhul-hammer-fire') as THREE.Group;
    expect(fireGroup.userData).toMatchObject({ actionable: true, radius: 2.4, phase: 'fire' });
    expect(fireGroup.getObjectsByProperty('name', 'varkhul-hammer-fire-flame')).toHaveLength(8);
    visuals.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it('reconciles the world projection in both renderer frame paths', () => {
    const renderer = readFileSync(new URL('../src/render/renderer.ts', import.meta.url), 'utf8');
    expect(
      renderer.match(/this\.varkhulForgestormVisuals\?\.syncWorld\(this\.sim\)/g),
    ).toHaveLength(2);
    expect(
      renderer.match(/this\.varkhulForgestormVisuals\?\.update\(dt, this\.reducedMotion\(\)\)/g),
    ).toHaveLength(2);
  });

  it('keeps the actionable descent but freezes hammer spin for reduced motion', () => {
    const scene = new THREE.Scene();
    const visuals = new VarkhulHammerVisuals(scene, () => 0);
    visuals.sync([{ ...WARNING, remaining: 0.625 }]);
    visuals.update(0.1, true);
    const warning = scene.getObjectByName('varkhul-hammer-warning') as THREE.Group;
    const hammer = warning.getObjectByName('varkhul-falling-hammer') as THREE.Group;
    expect(hammer.position.y).toBeCloseTo(3.75);
    expect(hammer.rotation.y).toBe(0);
  });
});
