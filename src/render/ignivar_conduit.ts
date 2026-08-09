// Procedural graybox for Ignivar's four water conduits. The final GLB can
// replace this module without changing the encounter object ids or renderer
// integration. The active template adds a tier-independent water-jet silhouette.

import * as THREE from 'three';
import { type IgnivarConduitState, ignivarConduitStateForTemplate } from '../sim/ignivar_arena';
import { EMISSIVE_GLOW, GFX, surfaceMat } from './gfx';
import { markSharedGeometry, markSharedMaterial } from './shared_resource';

const HEIGHT = 3.6;
const templates = new Map<IgnivarConduitState, THREE.Group>();
let stableTemplate: THREE.Group | null = null;

function sharedMaterial(options: Parameters<typeof surfaceMat>[0]): THREE.Material {
  return markSharedMaterial(surfaceMat(options));
}

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, y: number): THREE.Mesh {
  const part = new THREE.Mesh(markSharedGeometry(geometry), material);
  part.position.y = y;
  part.castShadow = true;
  part.receiveShadow = true;
  return part;
}

function buildTemplate(state: IgnivarConduitState): THREE.Group {
  const group = new THREE.Group();
  group.name = `ignivarWaterConduit:${state}`;

  const basalt = sharedMaterial({
    color: 0x302b2b,
    roughness: 0.96,
    metalness: 0.02,
    flatShading: !GFX.standardMaterials,
  });
  const rim = sharedMaterial({
    color: 0x62564e,
    roughness: 0.82,
    metalness: 0.08,
    flatShading: !GFX.standardMaterials,
  });
  const water = sharedMaterial({
    color: state === 'cooldown' ? 0x39434a : 0x4bd8ee,
    roughness: 0.24,
    metalness: 0,
    emissive: state === 'cooldown' ? 0x10181c : 0x24aeca,
    emissiveIntensity: state === 'cooldown' ? 0.4 : EMISSIVE_GLOW,
  });

  group.add(mesh(new THREE.CylinderGeometry(2.15, 2.4, 0.55, 12), basalt, 0.275));
  group.add(mesh(new THREE.CylinderGeometry(1.55, 1.8, 0.28, 12), rim, 0.68));

  const leftPost = mesh(new THREE.BoxGeometry(0.55, 2.45, 0.7), basalt, 1.75);
  leftPost.position.x = -1.2;
  group.add(leftPost);
  const rightPost = leftPost.clone();
  rightPost.position.x = 1.2;
  group.add(rightPost);
  group.add(mesh(new THREE.BoxGeometry(2.95, 0.55, 0.8), rim, 3.0));

  const basin = mesh(new THREE.CylinderGeometry(1.18, 1.18, 0.08, 16), water, 0.86);
  basin.castShadow = false;
  group.add(basin);

  if (state === 'ready') {
    const readyMarker = mesh(new THREE.ConeGeometry(0.42, 1.05, 6), water, 1.48);
    readyMarker.name = 'ignivarWaterReadyMarker';
    readyMarker.castShadow = false;
    group.add(readyMarker);
  }

  if (state === 'cooldown') {
    const cooldownSeal = new THREE.Group();
    cooldownSeal.name = 'ignivarWaterCooldownSeal';
    const firstBar = mesh(new THREE.BoxGeometry(1.95, 0.24, 0.38), rim, 1.04);
    firstBar.rotation.y = Math.PI / 4;
    const secondBar = firstBar.clone();
    secondBar.rotation.y = -Math.PI / 4;
    cooldownSeal.add(firstBar, secondBar);
    group.add(cooldownSeal);
  }

  if (state === 'active') {
    const jetMaterial = markSharedMaterial(
      new THREE.MeshBasicMaterial({
        color: 0x8cecff,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      }),
    );
    const jet = mesh(new THREE.CylinderGeometry(0.42, 0.7, 2.65, 12, 1, true), jetMaterial, 2.15);
    jet.castShadow = false;
    jet.receiveShadow = false;
    jet.renderOrder = 2;
    jet.name = 'ignivarWaterJet';
    group.add(jet);

    const cleanseMaterial = markSharedMaterial(
      new THREE.MeshBasicMaterial({
        color: 0x52dcff,
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    const cleanseZone = mesh(new THREE.RingGeometry(2.95, 3.25, 48), cleanseMaterial, 0.06);
    cleanseZone.rotation.x = -Math.PI / 2;
    cleanseZone.castShadow = false;
    cleanseZone.receiveShadow = false;
    cleanseZone.name = 'ignivarWaterCleanseZone';
    group.add(cleanseZone);
  }

  return group;
}

export function isIgnivarWaterConduitTemplate(templateId: string): boolean {
  return ignivarConduitStateForTemplate(templateId) !== null;
}

export function isStableIgnivarWaterConduitTransition(
  previousTemplateId: string,
  nextTemplateId: string,
): boolean {
  return (
    isIgnivarWaterConduitTemplate(previousTemplateId) &&
    isIgnivarWaterConduitTemplate(nextTemplateId)
  );
}

/** Keep encounter scenery visible even though it deliberately has no loot interaction. */
export function syncIgnivarWaterConduitVisibility(
  group: THREE.Object3D,
  templateId: string,
  compilePending: boolean,
  withinRange = true,
): boolean {
  const state = ignivarConduitStateForTemplate(templateId);
  for (const candidate of ['ready', 'active', 'cooldown'] as const) {
    const child = group.getObjectByName(`ignivarWaterConduit:${candidate}`);
    if (child) child.visible = candidate === state;
  }
  const visible = isIgnivarWaterConduitTemplate(templateId) && !compilePending && withinRange;
  group.visible = visible;
  return visible;
}

export function buildIgnivarWaterConduit(templateId: string): {
  group: THREE.Group;
  height: number;
} {
  if (!stableTemplate) {
    stableTemplate = new THREE.Group();
    stableTemplate.name = 'ignivarWaterConduit';
    for (const state of ['ready', 'active', 'cooldown'] as const) {
      let template = templates.get(state);
      if (!template) {
        template = buildTemplate(state);
        templates.set(state, template);
      }
      stableTemplate.add(template);
    }
  }
  const group = stableTemplate.clone(true);
  syncIgnivarWaterConduitVisibility(group, templateId, false);
  return { group, height: HEIGHT };
}
