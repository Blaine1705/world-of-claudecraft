import { CONTACT_SHEETS, contactTexture } from './contact_assets';
import {
  bakedTexture,
  warriorBloodTexture,
  warriorPressureTexture,
  warriorRockTexture,
  warriorSteelTexture,
} from './production_assets';
// The SAFE half of the ability-VFX boot warm-up, expressed as explicit small
// units the renderer can run outside its world-entry window.
//
// AbilityVfxFx.prewarmSpawn is the boot-window warm-up: it spawns one of every
// pooled primitive so the loading-screen frames draw them. That spawn can only
// ever run BEHIND the loading screen, because a resumed one would pop a white
// ring/decal/flipbook burst at the player's feet in a live frame. What CAN run
// live is everything the spawn was really paying for:
//
//   - the six 8x8 impact sheets, each a procedurally drawn 512px canvas that is
//     otherwise generated on the first impact of that school (the measured
//     mid-combat stall on phone-class profiles, where the whole
//     vfx.ability-primitives entry is skipped by the constrained manifest), and
//     the shared canvas set every pool binds;
//   - the pooled primitives' program links, one small ShaderMaterial at a time.
//
// Both are idempotent and invisible: building a sheet paints nothing, and a
// compile only links a program for a mesh that stays visible=false until its
// first real spawn. Renderer.prewarmInitialScene turns these steps into
// PrewarmResumeUnits (see prewarm_resume.ts).

import type * as THREE from 'three';
import { drawProgramSignature } from '../draw_program_signature_core';
import { abilityVfxTextures, FLIPBOOK_STYLES, flipbookSheet } from './fx_textures';

export interface AbilityVfxPrewarmTextureStep {
  id: string;
  /** Builds (memoized in fx_textures) and returns the textures this step warms. */
  build: () => THREE.Texture[];
}

export interface AbilityVfxCompileTarget {
  id: string;
  object: THREE.Object3D;
}

/**
 * One unit per procedurally drawn impact sheet, plus one for the shared canvas
 * set. The sheets are deliberately separate: each is an independent 64-frame
 * canvas draw, and the whole point of the resume lane is that no single unit
 * blocks a live frame for long.
 */
export function abilityVfxTexturePrewarmSteps(): AbilityVfxPrewarmTextureStep[] {
  const steps: AbilityVfxPrewarmTextureStep[] = FLIPBOOK_STYLES.map((style) => ({
    id: `flipbook:${style}`,
    build: () => [flipbookSheet(style)],
  }));
  steps.push({
    id: 'shared-canvases',
    // ~140 KB of small canvases built in one memoized call, so they stay one
    // unit rather than eight that would each re-enter the same builder.
    build: () => Object.values(abilityVfxTextures()),
  });
  for (const kind of CONTACT_SHEETS)
    steps.push({
      id: kind,
      build: () => {
        const texture = contactTexture(kind);
        return texture ? [texture] : [];
      },
    });
  for (const kind of [
    'smoke',
    'shockwave',
    'shout_dust',
    'warrior_power',
    'warrior_fervor',
    'harvest_impact',
    'warrior_bite',
    'warrior_shear',
    'warrior_crush',
  ] as const)
    steps.push({
      id: kind,
      build: () => {
        const texture = bakedTexture(kind);
        return texture ? [texture] : [];
      },
    });
  for (const [id, load] of [
    ['warrior-blood', warriorBloodTexture],
    ['warrior-pressure', warriorPressureTexture],
    ['warrior-rock', warriorRockTexture],
    ['warrior-steel', warriorSteelTexture],
  ] as const)
    steps.push({
      id,
      build: () => {
        const texture = load();
        return texture ? [texture] : [];
      },
    });
  return steps;
}

/** One pooled draw per distinct PROGRAM under `root`, in walk order: the
 *  object whose compile links it and the material that stands for every
 *  other material on it. That representative must live as long as its pool:
 *  disposing it would release the program the uncompiled clones rely on. Keyed by drawProgramSignature, never by material
 *  instance: the verdict pools build one MeshBasicMaterial per part per slot,
 *  hundreds of instances over a handful of programs, and a clone sharing a
 *  linked program reuses it on its first draw (three's acquireProgram hands
 *  back the cached WebGLProgram, so no link). Only objects that carry the
 *  renderCategory tag themselves are pooled VFX; a spirit holder group has
 *  no material and so no program of its own. */
function pooledPrograms(root: THREE.Object3D): Array<{
  object: THREE.Object3D;
  materials: THREE.Material[];
}> {
  const seen = new Set<string>();
  const found: Array<{ object: THREE.Object3D; materials: THREE.Material[] }> = [];
  root.traverse((child) => {
    if (child.userData?.renderCategory !== 'vfx') return;
    const material = (child as THREE.Mesh).material;
    if (!material) return;
    const fresh: THREE.Material[] = [];
    for (const mat of Array.isArray(material) ? material : [material]) {
      const signature = drawProgramSignature(child, mat);
      if (seen.has(signature)) continue;
      seen.add(signature);
      fresh.push(mat);
    }
    if (fresh.length > 0) found.push({ object: child, materials: fresh });
  });
  return found;
}

/** The representative material of each distinct pooled program, from the
 *  same walk as the compile targets: the cast readiness gate asks whether
 *  each one's program is proved linked, and a proof of that program covers
 *  every clone that shares it. One material instance drawn by two objects of
 *  different shapes is two units but one entry here, since the gate reads
 *  one current program per material (the uuid key had the same limit); no
 *  pool does that today, which tests/class_vfx_prewarm_homes.test.ts pins
 *  per pool (one gate entry per unit). */
export function abilityVfxCompileMaterials(root: THREE.Object3D): THREE.Material[] {
  const materials: THREE.Material[] = [];
  for (const entry of pooledPrograms(root)) {
    for (const material of entry.materials) {
      if (!materials.includes(material)) materials.push(material);
    }
  }
  return materials;
}

/** One compile target per distinct pooled program: the unit only needs SOME
 *  object drawing that program. */
export function collectAbilityVfxCompileTargets(root: THREE.Object3D): AbilityVfxCompileTarget[] {
  return pooledPrograms(root).map((entry, index) => ({
    id: `${entry.object.name || entry.object.type}:${index}`,
    object: entry.object,
  }));
}
