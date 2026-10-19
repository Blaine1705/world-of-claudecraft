import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  createNameplateCanvasState,
  type NameplateCanvasState,
} from '../src/render/nameplate_canvas';
import { NameplatePainter } from '../src/render/nameplate_painter';
import {
  newTargetOverlay,
  TARGET_OVERLAY_ARROW,
  TARGET_OVERLAY_CHEVRON,
  TARGET_OVERLAY_NONE,
  type TargetOverlay,
} from '../src/render/nameplate_target_highlight';
import type { NameplatePlan } from '../src/render/nameplate_view';
import {
  newEdgeArrowPlacement,
  type TargetHighlightFlags,
} from '../src/render/target_highlight_core';
import type { Entity } from '../src/sim/types';

interface PainterProbe {
  world: { entities: Map<number, Entity> };
  views: Map<number, unknown>;
  camera: THREE.PerspectiveCamera;
  targetHighlight: TargetHighlightFlags;
  targetOverlay: TargetOverlay;
  edgeArrow: ReturnType<typeof newEdgeArrowPlacement>;
  tmpV: THREE.Vector3;
  tmpV2: THREE.Vector3;
  isHostilePlayer(entity: Entity): boolean;
  nameplateDotScale(): number;
  updateDynamicState(
    state: NameplateCanvasState,
    entity: Entity,
    player: Entity,
    plan: NameplatePlan,
    languageChanged: boolean,
  ): void;
  resolveTargetOverlay(
    player: Entity,
    width: number,
    height: number,
    plated: boolean,
    languageChanged: boolean,
  ): TargetOverlay;
}

function entity(
  id: number,
  kind: Entity['kind'],
  hostile = false,
  ownerId: number | null = null,
): Entity {
  return {
    id,
    kind,
    hostile,
    ownerId,
    pos: { x: 30, y: 0, z: -10 },
    scale: 1,
    hp: 100,
    maxHp: 100,
    dead: false,
    auras: [],
    castingAbility: null,
    castRemaining: 0,
    channeling: false,
    targetId: null,
  } as unknown as Entity;
}

function probe(target: Entity) {
  const player = entity(1, 'player');
  player.pos = { x: 0, y: 0, z: 0 };
  player.targetId = target.id;
  const enemy = entity(2, 'player');
  const friend = entity(3, 'player');
  const painter = Object.create(NameplatePainter.prototype) as PainterProbe;
  painter.world = { entities: new Map([player, enemy, friend, target].map((e) => [e.id, e])) };
  painter.views = new Map();
  painter.camera = new THREE.PerspectiveCamera(60, 1280 / 720, 0.1, 1000);
  painter.camera.updateMatrixWorld();
  painter.targetHighlight = { edgeArrow: true, nameplate: true, overhead: true, reticle: true };
  painter.targetOverlay = newTargetOverlay();
  painter.edgeArrow = newEdgeArrowPlacement();
  painter.tmpV = new THREE.Vector3();
  painter.tmpV2 = new THREE.Vector3();
  painter.isHostilePlayer = (e) => e.id === 2;
  painter.nameplateDotScale = () => 0;
  return { painter, player };
}

describe('target highlight painter hostility', () => {
  it.each([
    ['enemy pet', 'mob', false, 2, true],
    ['friendly pet', 'mob', false, 3, false],
    ['own pet', 'mob', false, 1, false],
    ['hostile mob', 'mob', true, null, true],
    ['friendly mob', 'mob', false, null, false],
    ['enemy player', 'player', false, null, true],
    ['friendly player', 'player', false, null, false],
  ] as const)(
    'applies all canvas cues consistently for %s',
    (_label, kind, hostile, owner, expected) => {
      const target = entity(kind === 'player' ? (expected ? 2 : 3) : 4, kind, hostile, owner);
      const { painter, player } = probe(target);
      const state = createNameplateCanvasState();
      const plan = {
        hidden: false,
        anchorYOffset: 0,
        urgent: true,
        hasOverheadEmote: false,
        threat: false,
        comboPips: 0,
      } satisfies NameplatePlan;
      painter.updateDynamicState(state, target, player, plan, false);
      expect(state.emphasis).toBe(expected);
      expect(state.overheadMarker).toBe(expected);
      expect(painter.resolveTargetOverlay(player, 1280, 720, false, false).kind).toBe(
        expected ? TARGET_OVERLAY_ARROW : TARGET_OVERLAY_NONE,
      );
      target.pos.x = 0;
      expect(painter.resolveTargetOverlay(player, 1280, 720, false, false).kind).toBe(
        expected ? TARGET_OVERLAY_CHEVRON : TARGET_OVERLAY_NONE,
      );
      expect(painter.resolveTargetOverlay(player, 1280, 720, true, false).kind).toBe(
        TARGET_OVERLAY_NONE,
      );
      target.dead = true;
      painter.updateDynamicState(state, target, player, plan, false);
      expect(state.emphasis).toBe(false);
      expect(state.overheadMarker).toBe(false);
      expect(painter.resolveTargetOverlay(player, 1280, 720, false, false).kind).toBe(
        TARGET_OVERLAY_NONE,
      );
    },
  );

  it('retains independent default-off flags and only highlights the current target', () => {
    const target = entity(4, 'mob', false, 2);
    const { painter, player } = probe(target);
    painter.targetHighlight = {
      edgeArrow: false,
      nameplate: false,
      overhead: false,
      reticle: false,
    };
    const state = createNameplateCanvasState();
    const plan = {
      hidden: false,
      anchorYOffset: 0,
      urgent: true,
      hasOverheadEmote: false,
      threat: false,
      comboPips: 0,
    } satisfies NameplatePlan;
    painter.updateDynamicState(state, target, player, plan, false);
    expect([state.emphasis, state.overheadMarker]).toEqual([false, false]);
    expect(painter.resolveTargetOverlay(player, 1280, 720, false, false).kind).toBe(
      TARGET_OVERLAY_NONE,
    );
    painter.targetHighlight.nameplate = true;
    painter.updateDynamicState(state, target, player, plan, false);
    expect([state.emphasis, state.overheadMarker]).toEqual([true, false]);
    player.targetId = 3;
    painter.updateDynamicState(state, target, player, plan, false);
    expect([state.emphasis, state.overheadMarker]).toEqual([false, false]);
  });
});
