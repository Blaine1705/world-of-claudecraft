import * as THREE from 'three';
import {
  IGNIVAR_BRAND_RADIUS,
  IGNIVAR_SKYFIRE_CONE_COUNT,
  IGNIVAR_SKYFIRE_HALF_ANGLE,
  IGNIVAR_SKYFIRE_RANGE,
  IGNIVAR_SOAK_RADIUS,
} from '../sim/encounters/ignivar';
import {
  IGNIVAR_FRONTAL_HALF_ANGLE,
  IGNIVAR_FRONTAL_RANGE,
  IGNIVAR_ROTATING_RAYS_COUNT,
  IGNIVAR_ROTATING_RAYS_HALF_WIDTH,
  IGNIVAR_ROTATING_RAYS_INNER_RANGE,
  IGNIVAR_ROTATING_RAYS_RANGE,
} from '../sim/ignivar_arena';
import { IGNIVAR_BOSS_ID } from '../sim/types';
import { type IgnivarVisualEntity, ignivarEncounterVisualPlan } from './ignivar_encounter_core';
import { buildIgnivarFireBeam } from './ignivar_fire_beams';
import {
  buildIgnivarForgeJudgmentVisual,
  IGNIVAR_JUDGMENT_VISUAL_NAME,
  syncIgnivarForgeJudgmentVisual,
} from './ignivar_forge_judgment';
import {
  buildIgnivarForgeWaveVisual,
  IGNIVAR_FORGE_WAVE_VISUAL_NAME,
  syncIgnivarForgeWaveVisual,
} from './ignivar_forge_wave';
import { disposeIgnivarModelVfx, syncIgnivarModelVfx } from './ignivar_model_vfx';
import type { Vfx } from './vfx';

export const IGNIVAR_FRONTAL_VISUAL_NAME = 'ignivarFrontalTelegraph';
export const IGNIVAR_BRAND_VISUAL_NAME = 'ignivarBrandCircle';
export const IGNIVAR_SKYFIRE_VISUAL_NAME = 'ignivarSkyfireTelegraph';
export const IGNIVAR_ROTATING_RAYS_VISUAL_NAME = 'ignivarRotatingRaysTelegraph';
export const IGNIVAR_SOAK_VISUAL_NAME = 'ignivarSoakCircle';

function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) {
    for (const entry of material) entry.dispose();
  } else {
    material.dispose();
  }
}

function disposeOwnedVisual(root: THREE.Object3D): void {
  root.traverse((object) => {
    const renderable = object as THREE.Mesh | THREE.Line;
    if ('geometry' in renderable && renderable.geometry) renderable.geometry.dispose();
    if ('material' in renderable && renderable.material) disposeMaterial(renderable.material);
  });
  root.removeFromParent();
}

function encounterMaterial(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

export function buildIgnivarFrontalTelegraph(): THREE.Group {
  const group = new THREE.Group();
  group.name = IGNIVAR_FRONTAL_VISUAL_NAME;
  const segments = 30;
  const positions: number[] = [0, 0.045, 0];
  for (let i = 0; i <= segments; i++) {
    const angle = -IGNIVAR_FRONTAL_HALF_ANGLE + (i / segments) * IGNIVAR_FRONTAL_HALF_ANGLE * 2;
    positions.push(
      Math.sin(angle) * IGNIVAR_FRONTAL_RANGE,
      0.045,
      Math.cos(angle) * IGNIVAR_FRONTAL_RANGE,
    );
  }
  const indices: number[] = [];
  for (let i = 0; i < segments; i++) indices.push(0, i + 1, i + 2);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  group.add(new THREE.Mesh(geometry, encounterMaterial(0xff351c, 0.26)));

  const rimPoints: THREE.Vector3[] = [new THREE.Vector3(0, 0.07, 0)];
  for (let i = 0; i <= segments; i++) {
    const angle = -IGNIVAR_FRONTAL_HALF_ANGLE + (i / segments) * IGNIVAR_FRONTAL_HALF_ANGLE * 2;
    rimPoints.push(
      new THREE.Vector3(
        Math.sin(angle) * IGNIVAR_FRONTAL_RANGE,
        0.07,
        Math.cos(angle) * IGNIVAR_FRONTAL_RANGE,
      ),
    );
  }
  rimPoints.push(new THREE.Vector3(0, 0.07, 0));
  group.add(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(rimPoints),
      new THREE.LineBasicMaterial({
        color: 0xff9a32,
        transparent: true,
        opacity: 0.88,
      }),
    ),
  );
  group.userData.renderCategory = 'ui3d';
  group.visible = false;
  return group;
}

export function buildIgnivarSkyfireTelegraph(): THREE.Group {
  const group = new THREE.Group();
  group.name = IGNIVAR_SKYFIRE_VISUAL_NAME;
  const segments = 18;
  for (let cone = 0; cone < IGNIVAR_SKYFIRE_CONE_COUNT; cone++) {
    const offset = (cone * Math.PI * 2) / IGNIVAR_SKYFIRE_CONE_COUNT;
    const positions: number[] = [0, 0.052, 0];
    for (let i = 0; i <= segments; i++) {
      const angle =
        offset - IGNIVAR_SKYFIRE_HALF_ANGLE + (i / segments) * IGNIVAR_SKYFIRE_HALF_ANGLE * 2;
      positions.push(
        Math.sin(angle) * IGNIVAR_SKYFIRE_RANGE,
        0.052,
        Math.cos(angle) * IGNIVAR_SKYFIRE_RANGE,
      );
    }
    const indices: number[] = [];
    for (let i = 0; i < segments; i++) indices.push(0, i + 1, i + 2);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    group.add(new THREE.Mesh(geometry, encounterMaterial(0xff5a12, 0.3)));

    const rimPoints: THREE.Vector3[] = [new THREE.Vector3(0, 0.075, 0)];
    for (let i = 0; i <= segments; i++) {
      const angle =
        offset - IGNIVAR_SKYFIRE_HALF_ANGLE + (i / segments) * IGNIVAR_SKYFIRE_HALF_ANGLE * 2;
      rimPoints.push(
        new THREE.Vector3(
          Math.sin(angle) * IGNIVAR_SKYFIRE_RANGE,
          0.075,
          Math.cos(angle) * IGNIVAR_SKYFIRE_RANGE,
        ),
      );
    }
    rimPoints.push(new THREE.Vector3(0, 0.075, 0));
    group.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(rimPoints),
        new THREE.LineBasicMaterial({ color: 0xffc247, transparent: true, opacity: 0.95 }),
      ),
    );
  }
  group.userData.renderCategory = 'ui3d';
  group.visible = false;
  return group;
}

export function buildIgnivarRotatingRaysTelegraph(): THREE.Group {
  const group = new THREE.Group();
  group.name = IGNIVAR_ROTATING_RAYS_VISUAL_NAME;
  const width = IGNIVAR_ROTATING_RAYS_HALF_WIDTH;
  for (let ray = 0; ray < IGNIVAR_ROTATING_RAYS_COUNT; ray++) {
    const offset = (ray * Math.PI * 2) / IGNIVAR_ROTATING_RAYS_COUNT;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [
          -width,
          0.058,
          IGNIVAR_ROTATING_RAYS_INNER_RANGE,
          width,
          0.058,
          IGNIVAR_ROTATING_RAYS_INNER_RANGE,
          -width,
          0.058,
          IGNIVAR_ROTATING_RAYS_RANGE,
          width,
          0.058,
          IGNIVAR_ROTATING_RAYS_RANGE,
        ],
        3,
      ),
    );
    geometry.setIndex([0, 1, 2, 1, 3, 2]);
    const fill = new THREE.Mesh(geometry, encounterMaterial(0xff3b0a, 0.38));
    fill.rotation.y = offset;
    fill.userData.rayIndex = ray;
    group.add(fill);

    const outline = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-width, 0.082, IGNIVAR_ROTATING_RAYS_INNER_RANGE),
        new THREE.Vector3(-width, 0.082, IGNIVAR_ROTATING_RAYS_RANGE),
        new THREE.Vector3(width, 0.082, IGNIVAR_ROTATING_RAYS_RANGE),
        new THREE.Vector3(width, 0.082, IGNIVAR_ROTATING_RAYS_INNER_RANGE),
        new THREE.Vector3(-width, 0.082, IGNIVAR_ROTATING_RAYS_INNER_RANGE),
      ]),
      new THREE.LineBasicMaterial({ color: 0xffd15c, transparent: true, opacity: 0.98 }),
    );
    outline.rotation.y = offset;
    outline.userData.rayIndex = ray;
    group.add(outline);

    const fireBeam = buildIgnivarFireBeam({
      innerRange: IGNIVAR_ROTATING_RAYS_INNER_RANGE,
      range: IGNIVAR_ROTATING_RAYS_RANGE,
      startHalfWidth: width,
      endHalfWidth: width,
    });
    fireBeam.rotation.y = offset;
    fireBeam.userData.rayIndex = ray;
    group.add(fireBeam);
  }
  group.userData.renderCategory = 'ui3d';
  group.visible = false;
  return group;
}

export function buildIgnivarBrandCircle(): THREE.Group {
  const group = new THREE.Group();
  group.name = IGNIVAR_BRAND_VISUAL_NAME;
  const fill = new THREE.Mesh(
    new THREE.CircleGeometry(IGNIVAR_BRAND_RADIUS, 64),
    encounterMaterial(0xd61d0e, 0.13),
  );
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = 0.035;
  const rim = new THREE.Mesh(
    new THREE.RingGeometry(IGNIVAR_BRAND_RADIUS - 0.16, IGNIVAR_BRAND_RADIUS, 64),
    encounterMaterial(0xff4b24, 0.8),
  );
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.055;
  group.add(fill, rim);
  group.userData.renderCategory = 'ui3d';
  group.visible = false;
  return group;
}

export function buildIgnivarSoakCircle(): THREE.Group {
  const group = new THREE.Group();
  group.name = IGNIVAR_SOAK_VISUAL_NAME;
  const fill = new THREE.Mesh(
    new THREE.CircleGeometry(IGNIVAR_SOAK_RADIUS, 64),
    encounterMaterial(0xff9b21, 0.17),
  );
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = 0.04;
  const outer = new THREE.Mesh(
    new THREE.RingGeometry(IGNIVAR_SOAK_RADIUS - 0.2, IGNIVAR_SOAK_RADIUS, 64),
    encounterMaterial(0xffd36a, 0.95),
  );
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = 0.065;
  const inner = new THREE.Mesh(
    new THREE.RingGeometry(1.15, 1.35, 48),
    encounterMaterial(0xfff0ae, 0.9),
  );
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = 0.07;
  group.add(fill, outer, inner);
  group.userData.renderCategory = 'ui3d';
  group.visible = false;
  return group;
}

/** Releases the per-entity encounter overlays before a character view is pooled. */
export function disposeIgnivarEncounterVisuals(group: THREE.Group): void {
  disposeIgnivarModelVfx(group);
  for (const name of [
    IGNIVAR_FRONTAL_VISUAL_NAME,
    IGNIVAR_BRAND_VISUAL_NAME,
    IGNIVAR_SKYFIRE_VISUAL_NAME,
    IGNIVAR_ROTATING_RAYS_VISUAL_NAME,
    IGNIVAR_FORGE_WAVE_VISUAL_NAME,
    IGNIVAR_JUDGMENT_VISUAL_NAME,
    IGNIVAR_SOAK_VISUAL_NAME,
  ]) {
    const visual = group.getObjectByName(name);
    if (visual) disposeOwnedVisual(visual);
  }
}

/** Lazily adds and toggles encounter telegraphs on existing entity groups. */
export function syncIgnivarEncounterVisuals(
  group: THREE.Group,
  entity: IgnivarVisualEntity,
  dt = 0,
  vfx?: Vfx,
  bodyRoot?: THREE.Object3D,
): void {
  const plan = ignivarEncounterVisualPlan(entity);
  if (entity.templateId === IGNIVAR_BOSS_ID) {
    const bodyLock = group.userData.ignivarRotatingRaysBodyLock as
      | { baseRotation: number; groupFacing: number; worldFacing: number }
      | undefined;
    if (bodyRoot && plan.rotatingRaysVisible) {
      const lock =
        bodyLock ??
        (group.userData.ignivarRotatingRaysBodyLock = {
          baseRotation: bodyRoot.rotation.y,
          groupFacing: group.rotation.y,
          worldFacing: group.rotation.y + bodyRoot.rotation.y,
        });
      bodyRoot.rotation.y = lock.worldFacing - group.rotation.y;
    } else if (bodyRoot && bodyLock) {
      const remainingTurn = Math.atan2(
        Math.sin(group.rotation.y - bodyLock.groupFacing),
        Math.cos(group.rotation.y - bodyLock.groupFacing),
      );
      if (Math.abs(remainingTurn) > 1e-4) {
        bodyRoot.rotation.y = bodyLock.worldFacing - group.rotation.y;
      } else {
        bodyRoot.rotation.y = bodyLock.baseRotation;
        delete group.userData.ignivarRotatingRaysBodyLock;
      }
    }
    syncIgnivarModelVfx(group, dt, vfx);
    let frontal = group.getObjectByName(IGNIVAR_FRONTAL_VISUAL_NAME);
    if (!frontal) {
      frontal = buildIgnivarFrontalTelegraph();
      group.add(frontal);
    }
    frontal.scale.setScalar(plan.inverseEntityScale);
    frontal.visible = plan.frontalVisible;

    let skyfire = group.getObjectByName(IGNIVAR_SKYFIRE_VISUAL_NAME);
    if (!skyfire) {
      skyfire = buildIgnivarSkyfireTelegraph();
      group.add(skyfire);
    }
    skyfire.scale.setScalar(plan.inverseEntityScale);
    skyfire.visible = plan.skyfireVisible;

    let rotatingRays = group.getObjectByName(IGNIVAR_ROTATING_RAYS_VISUAL_NAME);
    if (!rotatingRays) {
      rotatingRays = buildIgnivarRotatingRaysTelegraph();
      group.add(rotatingRays);
    }
    rotatingRays.scale.setScalar(plan.inverseEntityScale);
    rotatingRays.visible = plan.rotatingRaysVisible;

    let forgeWave = group.getObjectByName(IGNIVAR_FORGE_WAVE_VISUAL_NAME);
    if (!forgeWave) {
      forgeWave = buildIgnivarForgeWaveVisual();
      group.add(forgeWave);
    }
    syncIgnivarForgeWaveVisual(
      forgeWave,
      plan.forgeWavePhase,
      plan.forgeWaveProgress,
      plan.forgeWaveRadius,
      plan.inverseEntityScale,
    );

    let judgment = group.getObjectByName(IGNIVAR_JUDGMENT_VISUAL_NAME);
    if (!judgment) {
      judgment = buildIgnivarForgeJudgmentVisual();
      group.add(judgment);
    }
    // The three random shelters remain fixed in arena space even though the
    // boss facing carries their reconnect-safe layout rotation.
    judgment.rotation.y = -group.rotation.y;
    syncIgnivarForgeJudgmentVisual(
      judgment,
      plan.judgmentPhase,
      plan.judgmentRotation,
      plan.judgmentSafeIndex,
      plan.inverseEntityScale,
    );
    vfx?.syncIgnivarJudgmentGroundFire(
      entity.id ?? 0,
      plan.judgmentPhase === 'active',
      group.position.x,
      group.position.y,
      group.position.z,
      group.position.x + Number(judgment.userData.ignivarSafeOffsetX ?? 0),
      group.position.z + Number(judgment.userData.ignivarSafeOffsetZ ?? 0),
      dt,
    );
  }

  if (entity.kind !== 'player') return;
  let circle = group.getObjectByName(IGNIVAR_BRAND_VISUAL_NAME);
  if (!circle && plan.branded) {
    circle = buildIgnivarBrandCircle();
    group.add(circle);
  }
  if (circle) {
    circle.userData.brandStacks = plan.brandStacks;
    const fill = circle.children[0] as THREE.Mesh;
    const rim = circle.children[1] as THREE.Mesh;
    (fill.material as THREE.MeshBasicMaterial).opacity = plan.brandFillOpacity;
    (rim.material as THREE.MeshBasicMaterial).opacity = plan.brandRimOpacity;
    circle.scale.setScalar(plan.inverseEntityScale);
    circle.visible = plan.branded;
  }

  let soak = group.getObjectByName(IGNIVAR_SOAK_VISUAL_NAME);
  if (!soak && plan.soakMarked) {
    soak = buildIgnivarSoakCircle();
    group.add(soak);
  }
  if (soak) {
    soak.scale.setScalar(plan.inverseEntityScale);
    soak.visible = plan.soakMarked;
  }
}
