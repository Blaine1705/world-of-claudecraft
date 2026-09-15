import type * as THREE from 'three';
import type { Entity } from '../sim/types';
import { worldQuestCaravanForMob } from '../sim/world_quest_caravans';
import { animCadenceFrames, type CharacterLodBands } from './crowd_lod';
import { buildGroundQuestObject } from './quest_objects';
import {
  buildMovingWorldQuestFreightWagon,
  type MovingWorldQuestFreightWagonVisual,
} from './world_quest_freight_visual';

export type { MovingWorldQuestFreightWagonVisual };

/** Moving escorts bypass the static pool: their rigs own live mixers and
 * skeleton textures. Missing assets still leave a pickable freight body. */
export function isQuestCaravanEntity(e: Entity): boolean {
  return e.kind === 'mob' && !!worldQuestCaravanForMob(e.templateId);
}

export function buildQuestCaravanBody(e: Entity): MovingWorldQuestFreightWagonVisual {
  return (
    buildMovingWorldQuestFreightWagon(e.templateId) ?? {
      ...buildGroundQuestObject('eastbrook_freight_wagon', e.id),
      update() {},
      dispose() {},
    }
  );
}

interface CaravanEntityPresentation {
  group: THREE.Group;
  height: number;
  liveScale: number;
  lastX: number;
  lastY: number;
  lastZ: number;
  freightCaravanVisual: MovingWorldQuestFreightWagonVisual | null;
}

/** The wagon's cull radius floor: the freight body is wider than a character,
 *  so the renderer's per-character cull core is asked for at least this much. */
export const QUEST_CARAVAN_CULL_RADIUS = 6;

/** Uses the interpolated group pose, with no per-frame allocation. Only the
 * cosmetic driver's animation is culled: `onScreen` is the renderer's own
 * character-cull verdict for this body (always true when culling is off). */
export function syncQuestCaravanBody(
  view: CaravanEntityPresentation,
  dt: number,
  framePhase: number,
  distSq: number,
  lodBands: CharacterLodBands,
  reducedMotion: boolean,
  onScreen: boolean,
): void {
  const { x, y, z } = view.group.position;
  const moving = Math.hypot(x - view.lastX, z - view.lastZ) > 0.001;
  view.lastX = x;
  view.lastY = y;
  view.lastZ = z;
  const cadence = animCadenceFrames(distSq, lodBands);
  const animateDriver = !reducedMotion && onScreen && (cadence <= 1 || framePhase % cadence === 0);
  view.freightCaravanVisual?.update(dt, moving, animateDriver);
}

/** Attach an object body before the existing whole-entity compile gate. The
 * body remains its click target and exposes its ambience handles on the view. */
export function attachEntityViewBody(
  group: THREE.Group,
  body: THREE.Object3D | null,
  entityId: number,
  visual: { clickProxy: THREE.Object3D } | null,
  isQuestVision: boolean,
): THREE.Object3D {
  if (visual) {
    // Character proxies avoid expensive raycasts against animated skinned meshes.
    if (!isQuestVision) visual.clickProxy.userData.entityId = entityId;
    return visual.clickProxy;
  }
  if (body) {
    group.add(body);
    body.traverse((object) => {
      object.userData.entityId = entityId;
    });
    // Builders put these handles on the body; per-frame consumers read the view.
    for (const key of ['rollRock', 'riftOrbiters', 'riftPulse', 'riftFlame', 'mailGlow']) {
      if (body.userData[key] !== undefined) group.userData[key] = body.userData[key];
    }
  }
  return body ?? group;
}
