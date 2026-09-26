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
// texels stay clear. The knob legs hold a released spirit to the shader before
// its knobs became uniforms, pixel for pixel. Node halves:
// tests/spirit_veil_census.test.ts (the family against the catalogue),
// tests/spirit_veil_palette.test.ts (the palettes) and
// tests/character_spirit_veil.test.ts (the visual).

import * as THREE from 'three';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { assetsReady } from '../../src/render/assets/preload';
import type { AnimState } from '../../src/render/characters/anim_state';
import { attachArmorDye } from '../../src/render/characters/armor_dye';
import {
  createSpiritVeilMaterial,
  installSpiritVeil,
  resetSpiritVeilLedger,
  SPIRIT_VEIL_LOOK,
  SpiritVeilRig,
  spiritVeilDepthMaterial,
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
import {
  SPIRIT_VEIL_PALETTES,
  type SpiritVeilPalette,
} from '../../src/render/characters/spirit_veil_palette_core';
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
      const empty = w.programs();
      w.draw();
      // the harness really draws these rigs: their own materials link here
      expect(w.programs()).toBeGreaterThan(empty);
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
        const empty = w.programs();
        w.draw();
        w.draw();
        // the harness really draws the rig: its live set links programs here
        expect(w.programs()).toBeGreaterThan(empty);
        await linkFamily(w);
        w.draw();
        const before = w.programs();

        visual.setGhost(true, 'spirit');
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

// The veil shader before its knobs became uniforms (program key -v1), kept
// verbatim as the reference the released spirit's look must still equal.
const V1_SHIMMER = `
  #if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
    vec3 veilObjN = objectNormal;
  #else
    vec3 veilObjN = vec3( normal );
  #endif
  {
    vec4 veilW0 = modelMatrix * vec4( transformed, 1.0 );
    float veilS = max( length( modelMatrix[ 0 ].xyz ), 1e-4 );
    transformed += veilObjN * ( 0.012 / veilS ) * sin( uVeilTime * 3.0 + veilW0.y * 7.0 );
  }
  #include <project_vertex>
`;
const V1_COLOR_VERT_PARS = `
  uniform float uVeilTime;
  varying vec3 vVeilN;
  varying vec3 vVeilV;
  varying float vVeilWY;
  varying float vVeilH;
`;
const V1_COLOR_VERT_TAIL = `
  #include <fog_vertex>
  #if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
    vVeilN = normalize( transformedNormal );
  #else
    vVeilN = normalize( normalMatrix * vec3( normal ) );
  #endif
  vVeilV = -mvPosition.xyz;
  vVeilWY = ( modelMatrix * vec4( transformed, 1.0 ) ).y;
  vVeilH = vVeilWY - modelMatrix[ 3 ].y;
`;
const V1_COLOR_FRAG_PARS = `
  uniform float uVeilTime;
  uniform vec3 uVeilTint;
  uniform vec3 uVeilDeep;
  uniform vec3 uVeilRim;
  uniform float uVeilRimStrength;
  uniform float uVeilOpacity;
  varying vec3 vVeilN;
  varying vec3 vVeilV;
  varying float vVeilWY;
  varying float vVeilH;
`;
const V1_COLOR_FRAG_BODY = `
  {
    vec3 veilN = normalize( vVeilN );
    veilN = gl_FrontFacing ? veilN : -veilN;
    float veilFres = pow( 1.0 - clamp( dot( veilN, normalize( vVeilV ) ), 0.0, 1.0 ), 2.0 );
    float veilLum = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
    float veilBand = 0.5 + 0.5 * sin( vVeilWY * 5.0 - uVeilTime * 2.2 );
    float veilRise = smoothstep( 0.0, 1.1, vVeilH );
    vec3 veilBody = mix( uVeilDeep, uVeilTint, clamp( 0.08 + veilLum * 1.9, 0.0, 1.0 ) );
    veilBody *= ( 0.7 + 0.3 * veilBand ) * ( 0.35 + 0.65 * veilRise );
    outgoingLight = veilBody + uVeilRim * uVeilRimStrength * veilFres;
    float veilAlpha = clamp( uVeilOpacity + ( 1.0 - uVeilOpacity ) * veilFres, 0.0, 1.0 );
    #ifdef SPIRIT_VEIL_DECAL
      diffuseColor.a *= veilAlpha;
    #else
      diffuseColor.a = veilAlpha;
    #endif
  }
  #include <opaque_fragment>
`;
const V1_UNIFORMS = {
  uVeilTime: { value: 0 },
  uVeilTint: { value: new THREE.Color(0x7cade1) },
  uVeilDeep: { value: new THREE.Color(0x213055) },
  uVeilRim: { value: new THREE.Color(0x90c0ff) },
  uVeilRimStrength: { value: 2.69 },
  uVeilOpacity: { value: 0.24 },
};

function v1ColorMaterial(source: THREE.MeshStandardMaterial): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({
    map: source.map,
    color: 0xffffff,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
  });
  mat.forceSinglePass = true;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, V1_UNIFORMS);
    shader.vertexShader = `${V1_COLOR_VERT_PARS}\n${shader.vertexShader}`
      .replace('#include <project_vertex>', V1_SHIMMER)
      .replace('#include <fog_vertex>', V1_COLOR_VERT_TAIL);
    shader.fragmentShader = `${V1_COLOR_FRAG_PARS}\n${shader.fragmentShader}`.replace(
      '#include <opaque_fragment>',
      V1_COLOR_FRAG_BODY,
    );
  };
  mat.customProgramCacheKey = () => 'spirit-veil-color-v1-reference';
  return mat;
}

function v1DepthMaterial(): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: true,
    transparent: true,
    side: THREE.DoubleSide,
    fog: false,
  });
  mat.forceSinglePass = true;
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = 1;
  mat.polygonOffsetUnits = 4;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uVeilTime = V1_UNIFORMS.uVeilTime;
    shader.vertexShader = `uniform float uVeilTime;\n${shader.vertexShader}`.replace(
      '#include <project_vertex>',
      V1_SHIMMER,
    );
  };
  mat.customProgramCacheKey = () => 'spirit-veil-depth-v1-reference';
  return mat;
}

function frame(w: World, offscreen: boolean, target?: THREE.WebGLRenderTarget): Uint8Array {
  const out = new Uint8Array(SIZE * SIZE * 4);
  if (offscreen && target) {
    w.renderer.readRenderTargetPixels(target, 0, 0, SIZE, SIZE, out);
  } else {
    const gl = w.renderer.getContext();
    gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, out);
  }
  return out;
}

describe('the veil knobs on a real driver', () => {
  for (const offscreen of [false, true]) {
    const arm = offscreen ? 'render-target (composer tiers)' : 'canvas (direct tiers)';
    it(`draws a released spirit (keep colours 0) pixel for pixel as the previous shader did, ${arm}`, async () => {
      const w = world(offscreen);
      const target = new THREE.WebGLRenderTarget(SIZE, SIZE);
      disposers.push(() => target.dispose());
      const drawTo = (): Uint8Array => {
        w.renderer.setRenderTarget(offscreen ? target : null);
        w.renderer.render(w.scene, w.camera);
        w.renderer.setRenderTarget(null);
        return frame(w, offscreen, target);
      };
      w.camera.position.set(0, 0.6, 3);
      w.camera.lookAt(0, 0.6, 0);
      const map = new THREE.DataTexture(
        new Uint8Array([
          230, 190, 120, 255, 40, 60, 90, 255, 120, 200, 80, 255, 250, 250, 250, 255,
        ]),
        2,
        2,
      );
      map.needsUpdate = true;
      const source = new THREE.MeshStandardMaterial({ map, color: 0x88aacc });
      const body = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(
        new THREE.SphereGeometry(0.7, 24, 16),
        source,
      );
      body.position.y = 0.6;
      const depth = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(body.geometry, source);
      depth.renderOrder = -1;
      body.add(depth);
      w.scene.add(body);

      body.material = createSpiritVeilMaterial(source);
      depth.material = spiritVeilDepthMaterial('depth:r:0');
      drawTo();
      const now = drawTo();

      body.material = v1ColorMaterial(source);
      depth.material = v1DepthMaterial();
      drawTo();
      const before = drawTo();

      let lit = 0;
      let differing = 0;
      for (let i = 0; i < now.length; i += 4) {
        if (before[i] + before[i + 1] + before[i + 2] > 30) lit++;
        if (
          now[i] !== before[i] ||
          now[i + 1] !== before[i + 1] ||
          now[i + 2] !== before[i + 2] ||
          now[i + 3] !== before[i + 3]
        )
          differing++;
      }
      // the sphere covers a real share of the frame, so equality means something
      expect(lit).toBeGreaterThan(SIZE * SIZE * 0.2);
      expect(differing).toBe(0);
    });
  }
});

describe('the veil palettes on a real driver', () => {
  /** A lit, mapped rigid body and its depth pre-pass, veiled in `palette`. */
  function veiledBody(w: World, source: THREE.Material, palette: SpiritVeilPalette): THREE.Mesh {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.8, 24, 16), source);
    body.material = createSpiritVeilMaterial(source, palette);
    w.scene.add(body);
    new SpiritVeilRig().sync([body], []);
    return body;
  }

  const greyMap = (): THREE.DataTexture => {
    const map = new THREE.DataTexture(new Uint8Array([200, 200, 200, 255]), 1, 1);
    map.needsUpdate = true;
    return map;
  };

  for (const offscreen of [false, true]) {
    const arm = offscreen ? 'render-target (composer tiers)' : 'canvas (direct tiers)';
    it(`draws every palette on the family's programs, each its own colour, ${arm}`, async () => {
      const w = world(offscreen);
      await linkFamily(w);
      w.draw();
      const before = w.programs();
      const source = new THREE.MeshStandardMaterial({ map: greyMap(), color: 0x6699cc });
      const pixels = new Map<string, string>();
      for (const palette of Object.keys(SPIRIT_VEIL_PALETTES) as SpiritVeilPalette[]) {
        const body = veiledBody(w, source, palette);
        w.draw();
        w.draw();
        expect(w.programs(), palette).toBe(before);
        pixels.set(palette, w.pixel().join(','));
        body.removeFromParent();
      }
      // every palette reads differently at the centre of the body
      expect(new Set(pixels.values()).size).toBe(pixels.size);
    });

    it(`keeps a dyed piece's dye where the palette keeps colours, never in the monochrome body, ${arm}`, async () => {
      const w = world(offscreen);
      await linkFamily(w);
      w.draw();
      const before = w.programs();
      const plain = new THREE.MeshStandardMaterial({ map: greyMap() });
      const dyed = new THREE.MeshStandardMaterial({ map: greyMap() });
      // every texel to a saturated green (band 400 selects every hue)
      attachArmorDye(dyed, {
        rules: [
          {
            ref: 0,
            band: 400,
            sat: [-1, 0, 1.1, 1.2],
            val: [-1, 0, 1.1, 1.2],
            hueMode: 'abs',
            hue: 120,
            satMul: 0,
            satAdd: 1,
            valMul: 1,
            valAdd: 0,
          },
        ],
      });
      const read = (source: THREE.Material, palette: SpiritVeilPalette): number[] => {
        const body = veiledBody(w, source, palette);
        w.draw();
        w.draw();
        const out = w.pixel();
        body.removeFromParent();
        return out;
      };
      expect(SPIRIT_VEIL_PALETTES.wolf.keepColor).toBe(1);
      const keptPlain = read(plain, 'wolf');
      const keptDyed = read(dyed, 'wolf');
      // the dye turns the grey texel green in the kept colours (the render
      // target holds linear values, so the margin is the smaller arm's)
      expect(Math.abs(keptPlain[1] - keptPlain[0])).toBeLessThan(4);
      expect(keptDyed[1] - keptDyed[0]).toBeGreaterThan(10);
      // and never reaches a palette that keeps none
      expect(SPIRIT_VEIL_PALETTES.spirit.keepColor).toBe(0);
      expect(read(dyed, 'spirit')).toEqual(read(plain, 'spirit'));
      expect(w.programs()).toBe(before);
    });
  }
});
