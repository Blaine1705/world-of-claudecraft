// The class VFX pools that live outside AbilityVfxFx still need a prewarm
// home. The vfx.ability-primitives entry and the cast gate both walk the
// scene through collectAbilityVfxCompileTargets / abilityVfxCompileMaterials,
// which select on each object's OWN renderCategory tag. A module that tags
// only its (material-less, hidden) root group is invisible to that walk, so
// its programs link live on the first cast. Each module below must hand the
// walk every drawable it built.

import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { AbilityVfxTextures } from '../src/render/ability_vfx/fx_textures';
import {
  abilityVfxCompileMaterials,
  collectAbilityVfxCompileTargets,
} from '../src/render/ability_vfx/prewarm';
import { DrainLifeVfx } from '../src/render/drain_life_vfx';
import { NeedleOfFateVfx } from '../src/render/needle_of_fate_vfx';
import { SentenceVfx } from '../src/render/sentence_vfx';
import { UmbralAnchorMarker } from '../src/render/umbral_anchor_marker';

const TEST_TEXTURES = {
  noise: new THREE.Texture(),
  ribbon: new THREE.Texture(),
  rune: new THREE.Texture(),
  ember: new THREE.Texture(),
  rime: new THREE.Texture(),
  crack: new THREE.Texture(),
  char: new THREE.Texture(),
  overlay: new THREE.Texture(),
} as unknown as AbilityVfxTextures;

const noAnchor = () => false;

type Drawable = THREE.Object3D & { material: THREE.Material | THREE.Material[] };

function drawablesUnder(root: THREE.Object3D): Drawable[] {
  const found: Drawable[] = [];
  root.traverse((object) => {
    const candidate = object as Partial<Drawable> & THREE.Object3D;
    if (candidate.material) found.push(candidate as Drawable);
  });
  return found;
}

function materialsOf(object: Drawable): THREE.Material[] {
  return Array.isArray(object.material) ? object.material : [object.material];
}

/** The program a material links: a ShaderMaterial pool shares one program
 *  across its per-slot clones (same type, source and defines), so the walk
 *  keeps one representative; anything else is its own unit. */
function programOf(material: THREE.Material): string {
  const shader = material as THREE.ShaderMaterial;
  if (!shader.isShaderMaterial) return material.uuid;
  return `${material.type}|${shader.vertexShader}|${shader.fragmentShader}|${JSON.stringify(shader.defines ?? null)}`;
}

function expectEveryDrawableCollected(scene: THREE.Scene, root: THREE.Object3D): void {
  const drawables = drawablesUnder(root);
  expect(drawables.length).toBeGreaterThan(0);
  const gated = new Set(abilityVfxCompileMaterials(scene).map(programOf));
  const linked = new Set(
    collectAbilityVfxCompileTargets(scene).flatMap((target) =>
      drawablesUnder(target.object).flatMap(materialsOf).map(programOf),
    ),
  );
  for (const drawable of drawables) {
    for (const material of materialsOf(drawable)) {
      const program = programOf(material);
      expect(gated.has(program), `${drawable.name || drawable.type} gated`).toBe(true);
      expect(linked.has(program), `${drawable.name || drawable.type} linked`).toBe(true);
    }
  }
}

describe('class VFX pools are reachable by the ability-VFX prewarm walk', () => {
  it('Drain Life: every channel slot program, while every slot stays hidden', () => {
    const scene = new THREE.Scene();
    new DrainLifeVfx(scene, () => null, vi.fn());
    const slots = scene.children.filter((child) => child.name === 'drain-life-vfx-slot');
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      expect(slot.visible).toBe(false);
      expectEveryDrawableCollected(scene, slot);
    }
  });

  it('Umbral Anchor: the sigil shader, the halo and shard meshes, and the wisp points', () => {
    const scene = new THREE.Scene();
    const marker = new UmbralAnchorMarker();
    scene.add(marker.group);
    expect(marker.group.visible).toBe(false);
    const kinds = new Set(drawablesUnder(marker.group).map((object) => object.type));
    expect(kinds).toEqual(new Set(['Mesh', 'LineSegments', 'Points']));
    expectEveryDrawableCollected(scene, marker.group);
  });

  for (const lowDetail of [false, true]) {
    it(`Sentence (${lowDetail ? 'low' : 'full'} detail): every slot family, starburst included`, () => {
      const scene = new THREE.Scene();
      const vfx = new SentenceVfx(
        scene,
        new THREE.PerspectiveCamera(),
        noAnchor,
        lowDetail,
        vi.fn(),
        TEST_TEXTURES,
      );
      if (!lowDetail) {
        const starburst = drawablesUnder(vfx.group).find((object) => /starburst/.test(object.name));
        expect(starburst, 'the full-detail starburst exists').toBeDefined();
      }
      expectEveryDrawableCollected(scene, vfx.group);
    });

    it(`Needle of Fate (${lowDetail ? 'low' : 'full'} detail): every windup, release, needle and impact`, () => {
      const scene = new THREE.Scene();
      const vfx = new NeedleOfFateVfx(scene, new THREE.PerspectiveCamera(), noAnchor, lowDetail);
      expectEveryDrawableCollected(scene, vfx.group);
    });
  }
});
