import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Vfx } from '../../src/render/vfx';

type VfxProbe = { life: Float32Array };

function activeParticles(vfx: VfxProbe): number {
  let active = 0;
  for (const remaining of vfx.life) if (remaining > 0) active++;
  return active;
}

describe('Paladin Ascension VFX', () => {
  it('emits visible particles for activation and every empowered impact identity', () => {
    const scene = new THREE.Scene();
    const vfx = new Vfx(scene, (id, heightFrac) => new THREE.Vector3(id, heightFrac, id * 2));
    const probe = vfx as unknown as VfxProbe;

    vfx.paladinAscensionStart(1);
    expect(activeParticles(probe)).toBeGreaterThan(30);

    for (const impact of ['offensive', 'area', 'defensive', 'healing'] as const) {
      vfx.clear();
      vfx.paladinAscensionImpact(1, 2, impact);
      expect(activeParticles(probe), impact).toBeGreaterThan(0);
    }
  });
});
