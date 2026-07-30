import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { suppressShadowOnlyMainDraw } from '../src/render/foliage_shadow_core';

describe('foliage shadow-only draw suppression', () => {
  it('submits no main instances and restores the complete shadow population every cycle', () => {
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial(),
      37,
    );

    suppressShadowOnlyMainDraw(mesh);
    expect(mesh.count).toBe(37);

    for (let cycle = 0; cycle < 2; cycle++) {
      mesh.onBeforeRender(
        null as never,
        null as never,
        null as never,
        null as never,
        null as never,
        null as never,
      );
      expect(mesh.count).toBe(0);
      mesh.onAfterRender(
        null as never,
        null as never,
        null as never,
        null as never,
        null as never,
        null as never,
      );
      expect(mesh.count).toBe(37);
    }
  });

  it('is attached to every foliage shadow-only clone at its production construction site', () => {
    const source = readFileSync(new URL('../src/render/foliage.ts', import.meta.url), 'utf8');
    const construction = source.match(
      /const shadow = cloneInstancedTo\([\s\S]+?register\(shadow, 'shadow', undefined, shadowMax, \{ max: true \}\);/,
    )?.[0];

    expect(construction).toBeDefined();
    expect(construction).toContain('shadow.castShadow = true;');
    expect(construction).toContain('suppressShadowOnlyMainDraw(shadow);');
  });
});
