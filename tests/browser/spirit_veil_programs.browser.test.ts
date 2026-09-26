// The spirit veil on a real WebGL driver: once the boot family has linked,
// veiling a ghost links NOTHING (renderer.info.programs does not move), on the
// canvas arm of the direct tiers and on the render-target arm of the composer
// tiers alike, for synthetic rigs of every pinned tuple, for real parsed rigs
// (the composed library as modularVariant builds it, stubble decal included, a
// fixed class rig and a held weapon), for extra uv sets, and through a real
// CharacterVisual on Low (its live tinted Lambert set, decals, weapon and far
// mesh). The pixel legs prove what the depth pre-pass, the per-rig sort and
// the decal variant are for: a ghost's inner surfaces never blend twice, a
// ghost behind a camera-faded wall still shows through it, and a decal's clear
// texels stay clear. Node halves: tests/spirit_veil_census.test.ts (the family
// against the catalogue) and tests/character_spirit_veil.test.ts (the visual).

import * as THREE from 'three';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { assetsReady } from '../../src/render/assets/preload';
import type { AnimState } from '../../src/render/characters/anim_state';
import {
  createSpiritVeilMaterial,
  installSpiritVeil,
  resetSpiritVeilLedger,
  SPIRIT_VEIL_LOOK,
  SpiritVeilRig,
  spiritVeilPassOf,
} from '../../src/render/characters/ghost_veil';
import {
  DEFAULT_APPEARANCE,
  fullSet,
  modularPartNames,
  normalizeAppearance,
  stubbleDecals,
} from '../../src/render/characters/modular';
import { modularMergePartition } from '../../src/render/characters/modular_name_facts_core';
import { mergeSkinnedParts } from '../../src/render/characters/rig_merge';
import {
  SPIRIT_VEIL_FAMILY,
  type SpiritVeilTuple,
} from '../../src/render/characters/spirit_veil_family_core';
import { buildStubbleDecal } from '../../src/render/characters/stubble';
import { CharacterVisual } from '../../src/render/characters/visual';
import type { CompileArmHost } from '../../src/render/compile_arms';
import { gfxInternalsForTest } from '../../src/render/gfx';
import { spiritVeilFamilyPrewarmEntry } from '../../src/render/spirit_veil_prewarm';

const SIZE = 96;

const disposers: (() => void)[] = [];

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  resetSpiritVeilLedger();
});

interface World {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  arms: CompileArmHost;
  /** Draw a frame the way the tier would: into a target on composer tiers. */
  draw(): void;
  programs(): number;
  pixel(): number[];
}

function world(offscreen: boolean): World {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.setClearColor(0x000000, 1);
  renderer.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x000000, 20, 200);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 0.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.position.set(3, 8, 5);
  sun.castShadow = true;
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 0, 6);
  camera.lookAt(0, 0, 0);
  const compileTarget = new THREE.WebGLRenderTarget(4, 4);
  const liveTarget = new THREE.WebGLRenderTarget(SIZE, SIZE);
  // The veil's reduced-motion freeze keeps the shimmer still, so pixels are
  // deterministic.
  installSpiritVeil(renderer, () => true);
  const arms: CompileArmHost = {
    webgl: () => renderer,
    camera: () => camera,
    scene: () => scene,
    shadowCamera: () => sun.shadow.camera,
    offscreen: () => offscreen,
    offscreenTarget: () => compileTarget,
    depthMaterials: () => new Map(),
    shadowArm: () => false,
  };
  const draw = () => {
    renderer.setRenderTarget(offscreen ? liveTarget : null);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
  };
  const pixel = () => {
    const out = new Uint8Array(4);
    if (offscreen) {
      renderer.readRenderTargetPixels(liveTarget, SIZE / 2, SIZE / 2, 1, 1, out);
    } else {
      const gl = renderer.getContext();
      gl.readPixels(SIZE / 2, SIZE / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
    }
    return [...out];
  };
  disposers.push(() => {
    compileTarget.dispose();
    liveTarget.dispose();
    renderer.dispose();
    canvas.remove();
  });
  return {
    renderer,
    scene,
    camera,
    arms,
    draw,
    programs: () => renderer.info.programs?.length ?? 0,
    pixel,
  };
}

const queue = {
  run<T>(work: () => T | Promise<T>): Promise<T> {
    return Promise.resolve().then(work);
  },
};

async function linkFamily(w: World): Promise<void> {
  const entry = spiritVeilFamilyPrewarmEntry(w.arms, w.renderer, queue);
  await entry.run();
}

const MAP = new THREE.DataTexture(new Uint8Array([170, 150, 130, 255]), 1, 1);
MAP.needsUpdate = true;

/** A drawable rig part with a tuple's shape and a bound skeleton of its own. */
function livePart(tuple: SpiritVeilTuple, x: number): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(0.3, 0.6, 0.3);
  const count = geometry.getAttribute('position').count;
  if (tuple.morphTargets > 0) {
    geometry.morphAttributes.position = Array.from(
      { length: tuple.morphTargets },
      () => new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3),
    );
    geometry.morphTargetsRelative = true;
  }
  const source = new THREE.MeshStandardMaterial({
    map: tuple.map ? MAP : null,
    transparent: tuple.pass === 'decal',
    depthWrite: tuple.pass !== 'decal',
  });
  let mesh: THREE.Mesh;
  if (tuple.skinned) {
    geometry.setAttribute(
      'skinIndex',
      new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4),
    );
    const weights = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) weights[i * 4] = 1;
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    const skinned = new THREE.SkinnedMesh(geometry, source);
    const bone = new THREE.Bone();
    skinned.add(bone);
    skinned.bind(new THREE.Skeleton([bone]));
    mesh = skinned;
  } else {
    mesh = new THREE.Mesh(geometry, source);
  }
  if (tuple.morphTargets > 0) mesh.updateMorphTargets();
  mesh.position.x = x;
  return mesh;
}

/** Mount the veil on every mesh under `root` (the halo aside) and mirror it. */
function veil(root: THREE.Object3D, rig: SpiritVeilRig): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && mesh.name !== 'spirit_veil_depth') meshes.push(mesh);
  });
  for (const mesh of meshes) {
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((m) => createSpiritVeilMaterial(m))
      : createSpiritVeilMaterial(mesh.material);
    mesh.castShadow = false;
  }
  rig.sync(meshes, []);
  return meshes;
}

describe('the veil family on a real driver', () => {
  for (const offscreen of [false, true]) {
    const arm = offscreen ? 'render-target (composer tiers)' : 'canvas (direct tiers)';
    it(`veils a rig of every pinned tuple with zero new programs, ${arm}`, async () => {
      const w = world(offscreen);
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(20, 20),
        new THREE.MeshStandardMaterial(),
      );
      floor.position.z = -3;
      w.scene.add(floor);
      w.draw();
      await linkFamily(w);
      w.draw();
      const before = w.programs();

      const ghost = new THREE.Group();
      SPIRIT_VEIL_FAMILY.filter((tuple) => tuple.pass !== 'depth').forEach((tuple, i) => {
        ghost.add(livePart(tuple, (i - 7) * 0.35));
      });
      w.scene.add(ghost);
      const rig = new SpiritVeilRig();
      veil(ghost, rig);
      w.draw();
      w.draw();
      expect(w.programs()).toBe(before);

      // Control: a shape outside the family does link, so the count above is
      // the harness seeing nothing, not the harness seeing nothing at all.
      const stray = livePart({ pass: 'color', skinned: true, map: false, morphTargets: 5 }, 0);
      w.scene.add(stray);
      veil(stray, new SpiritVeilRig());
      w.draw();
      expect(w.programs()).toBeGreaterThan(before);
    });
  }

  for (const offscreen of [false, true]) {
    const arm = offscreen ? 'render-target (composer tiers)' : 'canvas (direct tiers)';
    it(`veils real parsed rigs (composed look with its stubble decal, a class rig, a weapon) with zero new programs, ${arm}`, async () => {
      const w = world(offscreen);
      await linkFamily(w);
      w.draw();
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      // The shape is what keys a program, not the texel: every KTX2 texture
      // arrives as a 1x1 stand-in so a mapped material stays mapped.
      loader.setKTX2Loader({
        load(_url: string, onLoad: (texture: THREE.Texture) => void) {
          const texture = new THREE.DataTexture(new Uint8Array([200, 200, 200, 255]), 1, 1);
          texture.needsUpdate = true;
          onLoad(texture);
        },
      } as never);
      const composedGltf = await loader.loadAsync('/models/chars/modular/warrior_modular.glb');
      const app = normalizeAppearance({
        ...DEFAULT_APPEARANCE,
        gender: 'female',
        beard: 'stubble',
        earrings: 'moonstar',
        lashes: true,
      });
      const composed = composedGltf.scene;
      const keep = new Set(modularPartNames(app, {}));
      const drop: THREE.Object3D[] = [];
      composed.traverse((object) => {
        if (!(object as THREE.SkinnedMesh).isSkinnedMesh) return;
        if (keep.has(object.name) || (object.parent && keep.has(object.parent.name))) return;
        drop.push(object);
      });
      for (const object of drop) object.removeFromParent();
      mergeSkinnedParts(composed, undefined, {
        partitionKey: (mesh) => modularMergePartition(mesh.name),
      });
      const head = composed.getObjectByName(app.gender === 'female' ? 'F_Head' : 'M_Head');
      expect(head).toBeDefined();
      const decal = buildStubbleDecal(head as THREE.SkinnedMesh, stubbleDecals(app, {}));
      expect(decal).not.toBeNull();
      (head as THREE.Object3D).parent?.add(decal as THREE.SkinnedMesh);
      const knight = (await loader.loadAsync('/models/chars/players/knight.glb')).scene;
      const sword = (await loader.loadAsync('/models/weapons/sword_1handed.glb')).scene;
      const armoured = (await loader.loadAsync('/models/chars/modular/warrior_modular.glb')).scene;
      const plated = new Set(modularPartNames(app, fullSet('paladin')));
      const strip: THREE.Object3D[] = [];
      armoured.traverse((object) => {
        if (!(object as THREE.SkinnedMesh).isSkinnedMesh) return;
        if (plated.has(object.name) || (object.parent && plated.has(object.parent.name))) return;
        strip.push(object);
      });
      for (const object of strip) object.removeFromParent();
      mergeSkinnedParts(armoured, undefined, {
        partitionKey: (mesh) => modularMergePartition(mesh.name),
      });
      const ghost = new THREE.Group();
      ghost.add(composed, knight, sword, armoured);
      w.scene.add(ghost);
      const before = w.programs();
      const meshes = veil(ghost, new SpiritVeilRig());
      expect(meshes.length).toBeGreaterThan(10);
      w.draw();
      w.draw();
      expect(w.programs()).toBe(before);
    });
  }

  for (const offscreen of [false, true]) {
    const arm = offscreen ? 'render-target (composer tiers)' : 'canvas (direct tiers)';
    it(`keys no program on a second, third or fourth uv set, only on the map's channel, ${arm}`, async () => {
      // three 0.185.1 sets vertexUv1s..3s from the channels its maps sample
      // (getChannel), never from the geometry's attributes: the family needs
      // no uv-set axis, and a map on another channel is the !uvN flag.
      const w = world(offscreen);
      await linkFamily(w);
      w.draw();
      const before = w.programs();
      const extraUvSets = (mesh: THREE.Mesh): THREE.Mesh => {
        const uv = mesh.geometry.getAttribute('uv');
        for (const name of ['uv1', 'uv2', 'uv3']) mesh.geometry.setAttribute(name, uv.clone());
        return mesh;
      };
      const ghost = new THREE.Group();
      ghost.add(
        extraUvSets(livePart({ pass: 'color', skinned: true, map: true, morphTargets: 14 }, -0.4)),
        extraUvSets(livePart({ pass: 'color', skinned: false, map: true, morphTargets: 0 }, 0.4)),
      );
      w.scene.add(ghost);
      veil(ghost, new SpiritVeilRig());
      w.draw();
      w.draw();
      expect(w.programs()).toBe(before);

      // Control: the same shape sampling its map on uv1 is another program.
      const channelMap = MAP.clone();
      channelMap.channel = 1;
      const control = extraUvSets(
        livePart({ pass: 'color', skinned: false, map: true, morphTargets: 0 }, 0),
      );
      (control.material as THREE.MeshStandardMaterial).map = channelMap;
      w.scene.add(control);
      veil(control, new SpiritVeilRig());
      w.draw();
      expect(w.programs()).toBeGreaterThan(before);
    });
  }
});

const IDLE: AnimState = {
  speed: 0,
  moving: false,
  running: false,
  airborne: false,
  backwards: false,
  dead: false,
  casting: false,
  swimming: false,
  submerged: false,
  swimPitch: 0,
  wading: false,
  sitting: false,
};

describe('a death on a real CharacterVisual', () => {
  beforeAll(async () => {
    await assetsReady();
  }, 60_000);

  for (const offscreen of [false, true]) {
    const arm = offscreen ? 'render-target (composer tiers)' : 'canvas (direct tiers)';
    it(`links nothing once the family ran: live tinted Low Lambert rig, decals, weapon, far mesh, ${arm}`, async () => {
      const restoreGfx = gfxInternalsForTest.overrideSettings({ standardMaterials: false });
      try {
        const w = world(offscreen);
        w.camera.position.set(0, 1, 4);
        w.camera.lookAt(0, 1, 0);
        const look = {
          app: normalizeAppearance({
            ...DEFAULT_APPEARANCE,
            gender: 'male',
            beard: 'stubble',
            earrings: 'moonstar',
            lashes: true,
          }),
          worn: { ...fullSet('paladin'), head: null },
        };
        const visual = new CharacterVisual(
          'player_paladin_modular',
          0xffffff,
          0,
          null,
          null,
          null,
          look,
        );
        disposers.push(() => visual.dispose());
        visual.update(1 / 60, IDLE, true);
        visual.setShadow(true);
        w.scene.add(visual.root);
        const worn = (): THREE.Material[] => {
          const out: THREE.Material[] = [];
          visual.root.traverse((object) => {
            const mesh = object as THREE.Mesh;
            if (mesh.isMesh && mesh.visible) out.push(...[mesh.material].flat());
          });
          return out;
        };
        // the live rig is the game's own tinted set, rebuilt as Lambert on Low
        expect(
          worn().filter((m) => (m as THREE.MeshLambertMaterial).isMeshLambertMaterial).length,
        ).toBeGreaterThan(5);
        w.draw();
        w.draw();
        await linkFamily(w);
        w.draw();
        const before = w.programs();

        visual.setGhost(true, 'veil');
        w.draw();
        w.draw();
        const passes = new Set(worn().map((m) => spiritVeilPassOf(m)));
        expect(passes).toContain('color');
        expect(passes).toContain('decal');
        expect(passes).toContain('depth');
        let heldVeiled = 0;
        visual.root.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (mesh.isMesh && mesh.userData.weaponMesh) {
            expect(spiritVeilPassOf(mesh.material as THREE.Material)).toBe('color');
            heldVeiled++;
          }
        });
        expect(heldVeiled).toBeGreaterThan(0);
        expect(w.programs()).toBe(before);

        // The far LOD: the composed bake mints on its first crossing, veiled.
        const far = visual as unknown as { farMesh: THREE.Mesh | null };
        for (let i = 0; i < 20 && !visual.displayedFarBody; i++) {
          visual.setFar(true);
          visual.update(1 / 60, IDLE, true);
        }
        expect(visual.displayedFarBody).toBe(far.farMesh);
        const farMaterials = [(far.farMesh as THREE.Mesh).material].flat();
        for (const material of farMaterials) expect(spiritVeilPassOf(material)).toBe('color');
        w.draw();
        w.draw();
        expect(w.programs()).toBe(before);
      } finally {
        restoreGfx();
      }
    });
  }
});

describe('the veil draw order on a real driver', () => {
  function veiledBox(z: number, size: number): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size, size, 0.2),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    mesh.position.z = z;
    return mesh;
  }

  it('lets only the nearest ghost surface blend: an inner surface never shows through', async () => {
    const w = world(false);
    const front = veiledBox(0.6, 1);
    const back = veiledBox(-0.6, 1.6);
    const rig = new THREE.Group();
    rig.add(front, back);
    w.scene.add(rig);
    const meshes = veil(rig, new SpiritVeilRig());
    w.draw();
    const withPrePass = w.pixel();

    // the front surface alone, drawn the same way
    back.visible = false;
    w.draw();
    const frontOnly = w.pixel();
    back.visible = true;
    for (let c = 0; c < 3; c++)
      expect(Math.abs(withPrePass[c] - frontOnly[c])).toBeLessThanOrEqual(2);

    // Control: the same veil without its depth pre-pass blends both layers.
    for (const mesh of meshes) {
      for (const child of [...mesh.children]) child.removeFromParent();
    }
    w.draw();
    const withoutPrePass = w.pixel();
    const brighter = [0, 1, 2].some((c) => withoutPrePass[c] > frontOnly[c] + 8);
    expect(brighter).toBe(true);
  });

  it('draws a ghost behind a camera-faded wall, which keeps writing depth, through the wall', async () => {
    const w = world(false);
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 4),
      new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.3 }),
    );
    // occluder_fade.ts applyOccluderFade: transparent, depth written, band 0
    wall.material.depthWrite = true;
    wall.position.z = 2.5;
    w.scene.add(wall);
    w.draw();
    const wallOnly = w.pixel();

    const rig = new THREE.Group();
    rig.add(veiledBox(0, 1.2));
    w.scene.add(rig);
    veil(rig, new SpiritVeilRig());
    w.draw();
    const withGhost = w.pixel();
    expect(wallOnly[2]).toBeLessThan(5);
    // the veil's blue shows through the faded wall
    expect(withGhost[2]).toBeGreaterThan(wallOnly[2] + 20);
  });

  it("writes a decal's alpha as the veil's alpha times the texel's: a clear texel stays clear", async () => {
    // The render-target arm keeps the alpha channel; cleared to 0, the target
    // reads back the fragment's own alpha (three's normal blend adds
    // srcAlpha to dstAlpha * (1 - srcAlpha)).
    const w = world(true);
    w.renderer.setClearColor(0x000000, 0);
    const texel = new Uint8Array([255, 255, 255, 255]);
    const map = new THREE.DataTexture(texel, 1, 1);
    const plane = (transparent: boolean): THREE.Mesh => {
      const source = new THREE.MeshStandardMaterial({ map, transparent, depthWrite: !transparent });
      return new THREE.Mesh(new THREE.PlaneGeometry(2, 2), createSpiritVeilMaterial(source));
    };
    const decal = plane(true);
    const body = plane(false);
    expect(spiritVeilPassOf(decal.material as THREE.Material)).toBe('decal');
    const alphaAt = (mesh: THREE.Mesh, a: number): number => {
      texel[3] = a;
      map.needsUpdate = true;
      w.scene.add(mesh);
      w.draw();
      mesh.removeFromParent();
      return w.pixel()[3];
    };
    // A camera-facing surface has no rim: the veil's alpha is its opacity.
    const veil = Math.round(255 * SPIRIT_VEIL_LOOK.opacity);
    expect(Math.abs(alphaAt(decal, 255) - veil)).toBeLessThanOrEqual(3);
    expect(Math.abs(alphaAt(decal, 128) - Math.round((veil * 128) / 255))).toBeLessThanOrEqual(3);
    expect(alphaAt(decal, 0)).toBe(0);
    // Control: the body veil overwrites the texel's alpha.
    expect(Math.abs(alphaAt(body, 0) - veil)).toBeLessThanOrEqual(3);
  });
});
