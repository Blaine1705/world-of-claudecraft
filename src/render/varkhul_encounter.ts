import * as THREE from 'three';
import { VARKHUL_CINDER_FIRE_RADIUS } from '../sim/varkhul_cinder_orbs';
import { buildVarkhulLinkSymbol } from './varkhul_assembly_visual';
import {
  buildVarkhulCinderFire,
  buildVarkhulCinderOrbProjectile,
} from './varkhul_cinder_orb_visual';
import { type VarkhulVisualEntity, varkhulEncounterVisualPlan } from './varkhul_encounter_core';
import {
  buildVarkhulFrontalVisual,
  syncVarkhulFrontalVisual,
  VARKHUL_FRONTAL_VISUAL_NAME,
} from './varkhul_frontal_visual';

export const VARKHUL_CINDER_ORBS_VISUAL_NAME = 'varkhulCinderOrbsTelegraph';
export const VARKHUL_BRAND_VISUAL_NAME = 'varkhulMakersBrandTelegraph';
export const VARKHUL_FIXATE_VISUAL_NAME = 'varkhulAssemblyFixateEye';
export const VARKHUL_LINK_VISUAL_NAME = 'varkhulAssemblyLinkSymbol';
export const VARKHUL_CORE_CARRY_VISUAL_NAME = 'varkhulMoltenCoreCarry';

function warningMaterial(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

export function buildVarkhulCinderOrbsTelegraph(): THREE.Group {
  const group = new THREE.Group();
  group.name = VARKHUL_CINDER_ORBS_VISUAL_NAME;
  group.userData.renderCategory = 'ui3d';
  group.userData.actionable = true;
  group.userData.radius = VARKHUL_CINDER_FIRE_RADIUS;
  const ringMaterial = warningMaterial(0xff4a12, 0.68);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(
      VARKHUL_CINDER_FIRE_RADIUS - 0.3,
      VARKHUL_CINDER_FIRE_RADIUS,
      48,
    ).rotateX(-Math.PI / 2),
    ringMaterial,
  );
  ring.name = 'varkhulCinderOrbsRing';
  ring.position.y = 0.09;
  group.add(ring);

  const coreMaterial = warningMaterial(0xffcf55, 0.96);
  const shellMaterial = warningMaterial(0xff4b08, 0.56);
  const crown = new THREE.Group();
  crown.name = 'varkhulCinderOrbsCrown';
  for (let index = 0; index < 3; index++) {
    const orb = new THREE.Group();
    orb.name = `varkhulCinderOrb${index}`;
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 1), coreMaterial);
    core.name = 'varkhulCinderOrbCore';
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.48, 1), shellMaterial);
    shell.name = 'varkhulCinderOrbShell';
    orb.add(core, shell);
    crown.add(orb);
  }
  group.add(crown);
  group.userData.ringMaterial = ringMaterial;
  group.userData.coreMaterial = coreMaterial;
  group.userData.shellMaterial = shellMaterial;
  group.visible = false;
  return group;
}

function buildFixateEye(): THREE.Group {
  const group = new THREE.Group();
  group.name = VARKHUL_FIXATE_VISUAL_NAME;
  group.userData.renderCategory = 'ui3d';
  group.userData.actionable = true;
  const outline = new THREE.Mesh(
    new THREE.SphereGeometry(0.68, 18, 12, 0, Math.PI * 2, 0.7, 1.75),
    warningMaterial(0xff4020, 0.86),
  );
  outline.scale.set(1.45, 0.72, 0.28);
  const pupil = new THREE.Mesh(
    new THREE.SphereGeometry(0.27, 16, 12),
    warningMaterial(0xffd04a, 1),
  );
  pupil.position.z = 0.2;
  group.add(outline, pupil);
  group.position.y = 4.25;
  group.visible = false;
  return group;
}

function buildLinkMark(): THREE.Group {
  const group = new THREE.Group();
  group.name = VARKHUL_LINK_VISUAL_NAME;
  group.userData.renderCategory = 'ui3d';
  group.userData.actionable = true;
  for (let symbol = 0; symbol < 5; symbol++) {
    for (const role of ['anvil', 'hammer'] as const) {
      const mesh = buildVarkhulLinkSymbol(symbol, role === 'anvil' ? 0.92 : 0.78, role);
      mesh.name = `varkhulAssembly${role === 'anvil' ? 'Anvil' : 'Hammer'}Symbol${symbol}`;
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      group.add(mesh);
    }
  }
  group.position.y = 4.3;
  group.visible = false;
  return group;
}

function buildCoreCarry(): THREE.Group {
  const group = new THREE.Group();
  group.name = VARKHUL_CORE_CARRY_VISUAL_NAME;
  group.userData.renderCategory = 'ui3d';
  group.userData.actionable = true;
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.52, 1), warningMaterial(0xffe89a, 1));
  const shell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.78, 1),
    warningMaterial(0xff3908, 0.62),
  );
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.95, 0.08, 8, 28),
    warningMaterial(0xffa323, 0.9),
  );
  group.add(core, shell, halo);
  group.position.y = 3.55;
  group.visible = false;
  return group;
}

export function buildVarkhulMakersBrandTelegraph(): THREE.Group {
  const group = new THREE.Group();
  group.name = VARKHUL_BRAND_VISUAL_NAME;
  group.userData.renderCategory = 'ui3d';
  group.userData.actionable = true;
  const colors = [0xffb02e, 0xff6a1c, 0xff2714];
  for (let stack = 0; stack < colors.length; stack++) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.05 + stack * 0.27, 1.15 + stack * 0.27, 32).rotateX(-Math.PI / 2),
      warningMaterial(colors[stack], 0.82),
    );
    ring.name = `varkhulMakersBrandStack${stack + 1}`;
    ring.position.y = 0.08 + stack * 0.012;
    ring.visible = false;
    group.add(ring);
  }
  group.visible = false;
  return group;
}

function syncBrandTelegraph(visual: THREE.Object3D, stacks: number, inverseScale: number): void {
  visual.visible = stacks > 0;
  visual.scale.setScalar(inverseScale);
  for (let stack = 1; stack <= 3; stack++) {
    const ring = visual.getObjectByName(`varkhulMakersBrandStack${stack}`);
    if (ring) ring.visible = stack <= stacks;
  }
}

function syncCinderOrbsTelegraph(
  visual: THREE.Object3D,
  visible: boolean,
  progress: number,
  inverseScale: number,
  reducedMotion: boolean,
): void {
  visual.visible = visible;
  if (!visible) return;
  visual.scale.setScalar(inverseScale);
  const crown = visual.getObjectByName('varkhulCinderOrbsCrown');
  if (crown) {
    crown.rotation.y = reducedMotion ? 0 : progress * Math.PI * 2.5;
    for (let index = 0; index < 3; index++) {
      const orb = crown.getObjectByName(`varkhulCinderOrb${index}`);
      if (!orb) continue;
      const angle = (index * Math.PI * 2) / 3;
      orb.position.set(
        Math.sin(angle) * 1.15,
        2.65 + (reducedMotion ? 0 : Math.sin(progress * Math.PI * 6 + index) * 0.16),
        Math.cos(angle) * 1.15,
      );
      orb.scale.setScalar(0.82 + progress * 0.28);
    }
  }
  const ringMaterial = visual.userData.ringMaterial as THREE.MeshBasicMaterial;
  const coreMaterial = visual.userData.coreMaterial as THREE.MeshBasicMaterial;
  const shellMaterial = visual.userData.shellMaterial as THREE.MeshBasicMaterial;
  ringMaterial.opacity = 0.58 + progress * 0.3;
  coreMaterial.opacity = 0.82 + progress * 0.16;
  shellMaterial.opacity = 0.42 + progress * 0.28;
}

export function syncVarkhulEncounterVisuals(
  group: THREE.Group,
  entity: VarkhulVisualEntity,
  dtOrReducedMotion: number | boolean = 0,
  reducedMotion = false,
): void {
  const dt = typeof dtOrReducedMotion === 'number' ? dtOrReducedMotion : 0;
  if (typeof dtOrReducedMotion === 'boolean') reducedMotion = dtOrReducedMotion;
  const plan = varkhulEncounterVisualPlan(entity);
  let frontal = group.getObjectByName(VARKHUL_FRONTAL_VISUAL_NAME);
  if (!frontal && plan.frontalVisible) {
    frontal = buildVarkhulFrontalVisual();
    group.add(frontal);
  }
  if (frontal) {
    syncVarkhulFrontalVisual(
      frontal,
      plan.frontalVisible,
      plan.frontalProgress,
      plan.inverseEntityScale,
      dt,
      reducedMotion,
    );
  }
  if (entity.kind !== 'player') return;

  let cinderOrbs = group.getObjectByName(VARKHUL_CINDER_ORBS_VISUAL_NAME);
  if (!cinderOrbs && plan.cinderOrbsVisible) {
    cinderOrbs = buildVarkhulCinderOrbsTelegraph();
    group.add(cinderOrbs);
  }
  if (cinderOrbs) {
    syncCinderOrbsTelegraph(
      cinderOrbs,
      plan.cinderOrbsVisible,
      plan.cinderOrbsProgress,
      plan.inverseEntityScale,
      reducedMotion,
    );
  }

  let brand = group.getObjectByName(VARKHUL_BRAND_VISUAL_NAME);
  if (!brand && plan.makersBrandStacks > 0) {
    brand = buildVarkhulMakersBrandTelegraph();
    group.add(brand);
  }
  if (brand) syncBrandTelegraph(brand, plan.makersBrandStacks, plan.inverseEntityScale);

  let fixate = group.getObjectByName(VARKHUL_FIXATE_VISUAL_NAME);
  if (!fixate && plan.fixateVisible) {
    fixate = buildFixateEye();
    group.add(fixate);
  }
  if (fixate) {
    fixate.visible = plan.fixateVisible;
    fixate.scale.setScalar(plan.inverseEntityScale);
    fixate.rotation.y = reducedMotion ? 0 : Number(fixate.userData.phase ?? 0) + dt * 1.8;
    fixate.userData.phase = fixate.rotation.y;
  }

  let link = group.getObjectByName(VARKHUL_LINK_VISUAL_NAME);
  if (!link && plan.linkSymbol !== null) {
    link = buildLinkMark();
    group.add(link);
  }
  if (link) {
    link.visible = plan.linkSymbol !== null;
    link.scale.setScalar(plan.inverseEntityScale);
    for (let symbol = 0; symbol < 5; symbol++) {
      for (const role of ['anvil', 'hammer'] as const) {
        const mark = link.getObjectByName(
          `varkhulAssembly${role === 'anvil' ? 'Anvil' : 'Hammer'}Symbol${symbol}`,
        );
        if (mark) mark.visible = symbol === plan.linkSymbol && role === plan.linkRole;
      }
    }
    if (!reducedMotion) link.rotation.y += Math.max(0, dt) * 0.65;
  }

  let core = group.getObjectByName(VARKHUL_CORE_CARRY_VISUAL_NAME);
  if (!core && plan.moltenCoreVisible) {
    core = buildCoreCarry();
    group.add(core);
  }
  if (core) {
    core.visible = plan.moltenCoreVisible;
    core.scale.setScalar(plan.inverseEntityScale);
    if (!reducedMotion) core.rotation.y += Math.max(0, dt) * 2.4;
  }
}

export function hasVisibleVarkhulEncounterTelegraph(group: THREE.Group): boolean {
  return (
    group.getObjectByName(VARKHUL_CINDER_ORBS_VISUAL_NAME)?.visible === true ||
    group.getObjectByName(VARKHUL_FRONTAL_VISUAL_NAME)?.visible === true
  );
}

/** Stages every per-entity Varkhul material before the Inner Crucible is playable. */
export function buildVarkhulEncounterPrewarmVisual(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'varkhul-encounter-prewarm-entity';
  const visuals = [
    buildVarkhulFrontalVisual(),
    buildVarkhulCinderOrbsTelegraph(),
    buildVarkhulMakersBrandTelegraph(),
    buildFixateEye(),
    buildLinkMark(),
    buildCoreCarry(),
    buildVarkhulCinderFire(
      { id: 'prewarm-fire', sourceId: 0, x: 0, z: 0, radius: VARKHUL_CINDER_FIRE_RADIUS },
      0,
    ),
    buildVarkhulCinderOrbProjectile(
      {
        id: 'prewarm-orb',
        sourceId: 0,
        x: 0,
        z: 0,
        dirX: 1,
        dirZ: 0,
        radius: 1.45,
        duration: 7,
        remaining: 7,
      },
      0,
    ),
  ];
  for (let index = 0; index < visuals.length; index++) {
    const visual = visuals[index];
    visual.visible = true;
    visual.position.x = (index - 2.5) * 3;
    visual.traverse((child) => {
      child.visible = true;
    });
    root.add(visual);
  }
  return root;
}

export function disposeVarkhulEncounterVisuals(group: THREE.Group): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  for (const name of [
    VARKHUL_CINDER_ORBS_VISUAL_NAME,
    VARKHUL_BRAND_VISUAL_NAME,
    VARKHUL_FIXATE_VISUAL_NAME,
    VARKHUL_LINK_VISUAL_NAME,
    VARKHUL_CORE_CARRY_VISUAL_NAME,
    VARKHUL_FRONTAL_VISUAL_NAME,
  ]) {
    const visual = group.getObjectByName(name);
    if (!visual) continue;
    visual.traverse((child) => {
      const renderable = child as THREE.Mesh | THREE.Line;
      if ('geometry' in renderable && renderable.geometry) geometries.add(renderable.geometry);
      if ('material' in renderable && renderable.material) {
        for (const material of Array.isArray(renderable.material)
          ? renderable.material
          : [renderable.material]) {
          materials.add(material);
        }
      }
    });
    visual.removeFromParent();
  }
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}
